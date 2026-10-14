/**
 * How an ally (a Forge soldier, a freed survivor) moves and fights, shared by the solo game (`squad.ts`) and the co-op
 * session simulation (`sim/serverHost.ts`): follow a leader at a slot behind them, regroup when left far behind, pick
 * the nearest infected with a clear line of fire and shoot it. No drawing and no sound here: the caller is told about
 * each shot and decides what to show.
 */
import * as THREE from 'three';
import { FORGE_SQUAD, RAGDOLL, SURVIVORS } from '../config';
import type { PlayerRef, Zombie, ZombieEnv } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import { spreadPick } from '../logic/carriers';
import { Rng } from '../logic/rng';
import type { MapId } from '../world/layout/data';
import type { Level } from '../world/level';
import { FlowField } from '../world/nav';

export interface AllyStats {
  hp: number;
  damageTaken: number;
  range: number;
  fireInterval: number;
  bodyDamage: number;
  headDamage: number;
}

export interface AllyBody {
  name: string;
  kind: 'soldier' | 'survivor';
  stats: AllyStats;
  ref: PlayerRef;
  hp: number;
  yaw: number;
  /** The ally's own path field (the infected use it to reach them). */
  field: FlowField;
  fieldT: number;
  env: ZombieEnv | null;
  sinceHurt: number;
  shootT: number;
  pickT: number;
  target: Zombie | null;
  /** Follow slot behind the leader: x to the right, z behind. */
  slot: { x: number; z: number };
  warned: boolean;
  /** Survivors: still in the cage. */
  trapped: boolean;
}

export interface AllyWorld {
  level: Level;
  zombies: ZombieManager;
  rng: Rng;
  /** A step toward the leader along their path field (false when there is none). */
  followLeader(x: number, z: number, out: { x: number; z: number }): boolean;
}

export interface AllyShot {
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  hit: boolean;
  head: boolean;
  target: Zombie;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const steer = { x: 0, z: 0 };

/** Keep up with the leader at (px, pz) facing `pyaw`. */
export function allyMove(a: AllyBody, w: AllyWorld, dt: number, px: number, pz: number, pyaw: number): void {
  const c = Math.cos(pyaw);
  const s = Math.sin(pyaw);
  const tx = px + a.slot.x * c + a.slot.z * s;
  const tz = pz - a.slot.x * s + a.slot.z * c;
  const toLeader = Math.hypot(px - a.ref.x, pz - a.ref.z);
  // lost (left far behind or stuck): regroup next to the leader, out of sight
  if (toLeader > FORGE_SQUAD.regroupDistance) {
    const at = w.level.nav.randomFreeNear(tx, tz, 3, () => w.rng.f());
    if (at) {
      a.ref.x = at.x;
      a.ref.z = at.z;
    }
    return;
  }
  const dx = tx - a.ref.x;
  const dz = tz - a.ref.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.2 || toLeader < 2.6) {
    if (!a.target) a.yaw = pyaw;
    return;
  }
  let gx = tx;
  let gz = tz;
  if (!w.level.nav.los(a.ref.x, a.ref.z, tx, tz) && w.followLeader(a.ref.x, a.ref.z, steer)) {
    gx = steer.x;
    gz = steer.z;
  }
  const sx = gx - a.ref.x;
  const sz = gz - a.ref.z;
  const sd = Math.hypot(sx, sz) || 1;
  const speed = (d > 10 ? 6.2 : 4.4) * dt;
  const step = { x: a.ref.x + (sx / sd) * Math.min(speed, sd), z: a.ref.z + (sz / sd) * Math.min(speed, sd) };
  w.level.world.resolveCircle(step, 0.32, 0.5, 1.7, 3);
  a.ref.x = step.x;
  a.ref.z = step.z;
  a.ref.eyeY = 1.6;
  if (!a.target) a.yaw = Math.atan2(-sx, -sz);
}

/**
 * Pick a target and shoot when ready. Returns the shot fired this step (the caller shows it and applies the damage
 * with `allyHit`), or null.
 */
export function allyFight(a: AllyBody, w: AllyWorld, dt: number): AllyShot | null {
  a.pickT -= dt;
  if (a.pickT <= 0 || (a.target && !a.target.active)) {
    a.pickT = 0.3;
    a.target = null;
    let best: number = a.stats.range;
    for (const z of w.zombies.zombies) {
      if (!z.active || z.dormant) continue;
      const d = Math.hypot(z.x - a.ref.x, z.z - a.ref.z);
      if (d >= best) continue;
      z.rig.getChestWorld(tmpA);
      if (w.level.world.segmentBlocked(a.ref.x, 1.45, a.ref.z, tmpA.x, tmpA.y, tmpA.z, 'shots')) continue;
      best = d;
      a.target = z;
    }
  }
  const t = a.target;
  if (!t) return null;
  a.yaw = Math.atan2(-(t.x - a.ref.x), -(t.z - a.ref.z));
  a.shootT -= dt;
  if (a.shootT > 0) return null;
  a.shootT = a.stats.fireInterval * (0.8 + w.rng.f() * 0.5);
  const dist = Math.hypot(t.x - a.ref.x, t.z - a.ref.z);
  const hit = w.rng.f() < (dist < 10 ? 0.8 : 0.6);
  const head = hit && w.rng.f() < 0.18;
  if (head) t.rig.getHeadWorld(tmpB);
  else t.rig.getChestWorld(tmpB);
  const from = { x: a.ref.x - Math.sin(a.yaw) * 0.6, y: 1.35, z: a.ref.z - Math.cos(a.yaw) * 0.6 };
  const to = hit ? { x: tmpB.x, y: tmpB.y, z: tmpB.z } : { x: tmpB.x + (w.rng.f() - 0.5) * 2, y: tmpB.y + (w.rng.f() - 0.3) * 1.5, z: tmpB.z + (w.rng.f() - 0.5) * 2 };
  return { from, to, hit, head, target: t };
}

/** Apply an ally's hit (the kill throws the body a little, like a rifle round). */
export function allyHit(a: AllyBody, shot: AllyShot, zombies: ZombieManager, env: ZombieEnv): void {
  zombies.damage(shot.target, shot.head ? a.stats.headDamage : a.stats.bodyDamage, shot.head, env, a.yaw, RAGDOLL.push.ally, RAGDOLL.lift.ally);
}

/** Slow health regeneration after a few quiet seconds. */
export function allyRecover(a: AllyBody, dt: number): void {
  a.sinceHurt += dt;
  if (a.sinceHurt > 6) {
    a.hp = Math.min(a.stats.hp, a.hp + 6 * dt);
    if (a.hp > a.stats.hp * 0.6) a.warned = false;
  }
}

// ---------------------------------------------------------------------------------------------
// setup shared by the solo game and the co-op simulation
// ---------------------------------------------------------------------------------------------

export const SOLDIER_STATS: AllyStats = { ...FORGE_SQUAD, hp: FORGE_SQUAD.allyHp, damageTaken: FORGE_SQUAD.allyDamageTaken };
export const SURVIVOR_STATS: AllyStats = SURVIVORS;

/** Who waits in the cages on a map. */
export function survivorRoster(map: MapId): readonly { name: string; tag: string; color: number }[] {
  return map === 'forge' ? SURVIVORS.forge : SURVIVORS.district;
}

/** Where the two Forge soldiers start: either side of and behind the insertion point. */
export function soldierSpots(level: Level, rng: Rng): { x: number; z: number; slot: { x: number; z: number } }[] {
  const st = level.data.playerStart;
  return FORGE_SQUAD.allies.map((_, i) => {
    const slot = { x: i === 0 ? -2.2 : 2.2, z: 2.6 };
    const at = level.nav.randomFreeNear(st.x + slot.x, st.z + slot.z, 2.5, () => rng.f()) ?? { x: st.x + slot.x, z: st.z + slot.z };
    return { x: at.x, z: at.z, slot };
  });
}

/** Cages at spread-out resident spots well away from the insertion point, each reachable on foot from it. */
export function cageSpots(level: Level, rng: Rng, count: number): { x: number; z: number; slot: { x: number; z: number } }[] {
  const nav = level.nav;
  const data = level.data;
  const st = data.playerStart;
  const reach = new FlowField(nav);
  reach.compute(st.x, st.z);
  const clear = (x: number, z: number): boolean => {
    for (const [ox, oz] of [[0, 0], [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3], [0, -2.2]] as const) if (nav.isBlockedAt(x + ox, z + oz)) return false;
    const away = (q: { x: number; z: number }, r: number): boolean => Math.hypot(q.x - x, q.z - z) > r;
    return data.crates.every((c) => away(c, 4)) && data.stations.every((s) => away(s, 6)) && reach.isReachable(x, z - 2.2);
  };
  const pool = data.ambient.map((a) => ({ x: a.x, z: a.z })).filter((p) => Math.hypot(p.x - st.x, p.z - st.z) > SURVIVORS.minStartDistance && clear(p.x, p.z));
  return spreadPick(pool, count, () => rng.f()).map((pi, i) => ({ ...pool[pi]!, slot: { x: (i % 2 === 0 ? -1 : 1) * (1.4 + i * 0.6), z: 3.4 + i * 0.8 } }));
}

/**
 * The Trials of Ignis embers, each snapped onto open ground. Always the same spots (a fixed seed), so the co-op
 * simulation and every player's screen agree without sending them.
 */
export function emberSpots(level: Level): { x: number; z: number }[] {
  const rng = new Rng(4093);
  return FORGE_SQUAD.embers.map(([x, z]) => (level.nav.isBlockedAt(x, z) ? (level.nav.randomFreeNear(x, z, 3, () => rng.f()) ?? { x, z }) : { x, z }));
}

/** A fresh ally (positions and stats only; no model). */
export function makeAllyBody(level: Level, name: string, kind: AllyBody['kind'], x: number, z: number, yaw: number, slot: { x: number; z: number }, trapped: boolean, order: number): AllyBody {
  const stats = kind === 'soldier' ? SOLDIER_STATS : SURVIVOR_STATS;
  return {
    name,
    kind,
    stats,
    ref: { x, y: 0, z, eyeY: 1.6, alive: true, sprinting: false },
    hp: stats.hp,
    yaw,
    field: new FlowField(level.nav),
    fieldT: order * 0.17,
    env: null,
    sinceHurt: 99,
    shootT: 0.5,
    pickT: 0,
    target: null,
    slot,
    warned: false,
    trapped,
  };
}
