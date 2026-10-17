/**
 * How an ally (a Forge soldier, a freed survivor) moves and fights, shared by the solo game (`squad.ts`) and the co-op
 * session simulation (`sim/serverHost.ts`): follow a leader at a slot behind them, regroup when left far behind, pick
 * the nearest infected with a clear line of fire and shoot it. No drawing and no sound here: the caller is told about
 * each shot and decides what to show.
 */
import * as THREE from 'three';
import { type AvatarLook, FORGE_SQUAD, RAGDOLL, SQUADS, SURVIVORS, TEAM_SKILL, type TeamSkill } from '../config';
import type { PlayerRef, Zombie, ZombieEnv } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import { spreadPick } from '../logic/carriers';
import { Rng } from '../logic/rng';
import type { FloorLink, Traveller } from '../world/floors';
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
  /** Chance a shot lands, within 10 m and beyond, and the share of hits that go to the head. */
  hitNear: number;
  hitFar: number;
  headChance: number;
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
  /** Seconds spent making no headway toward a far leader (caught on geometry). */
  stuckT: number;
  pickT: number;
  target: Zombie | null;
  /** Follow slot behind the leader: x to the right, z behind. */
  slot: { x: number; z: number };
  warned: boolean;
  /** Survivors: still in the cage. */
  trapped: boolean;
  /** Crossing stairs or a stairwell after the leader (`floors.ts`), and its handle on the ally's position. */
  crossing?: { link: FloorLink; from: number; prog: { s: number } } | null;
  traveller?: Traveller;
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

/** The ally as something the floors can move along stairs (`floors.ts`). */
function travellerOf(a: AllyBody): Traveller {
  return (a.traveller ??= {
    x: a.ref.x,
    z: a.ref.z,
    yaw: a.yaw,
    area: 0,
    placeAt(x: number, y: number, z: number, yaw: number) {
      a.ref.x = this.x = x;
      a.ref.z = this.z = z;
      a.ref.y = y;
      a.ref.eyeY = y + 1.6;
      a.yaw = this.yaw = yaw;
    },
  });
}

/** Keep up with the leader at (px, py, pz) facing `pyaw`; on another floor, take the stairs after them. */
export function allyMove(a: AllyBody, w: AllyWorld, dt: number, px: number, pz: number, pyaw: number, py = 0): void {
  const fl = w.level.floors.hasFloors ? w.level.floors : null;
  const myArea = fl ? fl.areaAt(a.ref.x, a.ref.y, a.ref.z) : 0;
  const leaderArea = fl ? fl.areaAt(px, py, pz) : 0;
  // on the stairs (or in a stairwell) after the leader
  if (fl && a.crossing) {
    const t = travellerOf(a);
    t.x = a.ref.x;
    t.z = a.ref.z;
    t.area = a.crossing.from;
    if (fl.traverse(t, a.crossing.link, a.crossing.from, a.crossing.prog, 4.4, dt)) return;
    a.crossing = null;
  }
  const c = Math.cos(pyaw);
  const s = Math.sin(pyaw);
  let tx = px + a.slot.x * c + a.slot.z * s;
  let tz = pz - a.slot.x * s + a.slot.z * c;
  const toLeader = Math.hypot(px - a.ref.x, pz - a.ref.z);
  // lost (left far behind, or stuck on something for a few seconds): regroup next to the leader, on their floor
  if ((toLeader > FORGE_SQUAD.regroupDistance && myArea === leaderArea) || a.stuckT > 2.5) {
    const nav = fl ? fl.navOf(leaderArea) : w.level.nav;
    const at = nav.randomFreeNear(tx, tz, 3, () => w.rng.f()) ?? (leaderArea !== 0 ? { x: px, z: pz } : null);
    if (at) {
      a.ref.x = at.x;
      a.ref.z = at.z;
      a.ref.y = w.level.world.floorBelow(at.x, at.z, 0.2, Math.max(py, a.ref.y) + 0.3);
      a.ref.eyeY = a.ref.y + 1.6;
    }
    a.stuckT = 0;
    a.crossing = null;
    return;
  }
  // the leader is on another floor: make for the stairs toward them, and cross them
  let field: FlowField | null = null;
  if (fl && myArea !== leaderArea) {
    const link = fl.route(myArea, leaderArea);
    if (link) {
      const end = fl.endIn(link, myArea);
      if (Math.hypot(end.x - a.ref.x, end.z - a.ref.z) < 0.8) {
        a.crossing = { link, from: myArea, prog: { s: 0 } };
        return;
      }
      tx = end.x;
      tz = end.z;
      field = fl.fieldTo(myArea, end.x, end.z);
    }
  } else if (fl && myArea !== 0) {
    field = fl.liveField(myArea, tx, tz);
  }
  const dx = tx - a.ref.x;
  const dz = tz - a.ref.z;
  const d = Math.hypot(dx, dz);
  const sameFloor = myArea === leaderArea;
  if (sameFloor && (d < 1.2 || toLeader < 2.6)) {
    if (!a.target) a.yaw = pyaw;
    return;
  }
  let gx = tx;
  let gz = tz;
  const nav = fl ? fl.navOf(myArea) : w.level.nav;
  if (!nav.los(a.ref.x, a.ref.z, tx, tz) && (field ? field.follow(a.ref.x, a.ref.z, steer, 10) : w.followLeader(a.ref.x, a.ref.z, steer))) {
    gx = steer.x;
    gz = steer.z;
  }
  const sx = gx - a.ref.x;
  const sz = gz - a.ref.z;
  const sd = Math.hypot(sx, sz) || 1;
  const speed = (d > 10 ? 6.2 : 4.4) * dt;
  const step = { x: a.ref.x + (sx / sd) * Math.min(speed, sd), z: a.ref.z + (sz / sd) * Math.min(speed, sd) };
  w.level.world.resolveCircle(step, 0.32, a.ref.y + 0.5, a.ref.y + 1.7, 3);
  // making no headway toward a far leader means caught on geometry
  const progress = Math.hypot(step.x - a.ref.x, step.z - a.ref.z);
  a.stuckT = d > 6 && progress < speed * 0.25 ? a.stuckT + dt : Math.max(0, a.stuckT - dt * 2);
  a.ref.x = step.x;
  a.ref.z = step.z;
  a.ref.y = w.level.world.floorBelow(step.x, step.z, 0.2, a.ref.y); // up a foundry's deck after the leader (floors may stack)
  a.ref.eyeY = a.ref.y + 1.6;
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
      if (w.level.world.segmentBlocked(a.ref.x, a.ref.y + 1.45, a.ref.z, tmpA.x, tmpA.y, tmpA.z, 'shots')) continue;
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
  const hit = w.rng.f() < (dist < 10 ? a.stats.hitNear : a.stats.hitFar);
  const head = hit && w.rng.f() < a.stats.headChance;
  if (head) t.rig.getHeadWorld(tmpB);
  else t.rig.getChestWorld(tmpB);
  const from = { x: a.ref.x - Math.sin(a.yaw) * 0.6, y: a.ref.y + 1.35, z: a.ref.z - Math.cos(a.yaw) * 0.6 };
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

const pickStats = (s: Omit<AllyStats, 'hitNear' | 'hitFar' | 'headChance'>): AllyStats => ({ hp: s.hp, damageTaken: s.damageTaken, range: s.range, fireInterval: s.fireInterval, bodyDamage: s.bodyDamage, headDamage: s.headDamage, hitNear: 0.8, hitFar: 0.6, headChance: 0.18 });
export const SOLDIER_STATS: AllyStats = pickStats({ ...FORGE_SQUAD, hp: FORGE_SQUAD.allyHp, damageTaken: FORGE_SQUAD.allyDamageTaken });
export const SURVIVOR_STATS: AllyStats = pickStats(SURVIVORS);

/** An ally's numbers at a squad skill level. */
export function teamStats(base: AllyStats, skill: TeamSkill): AllyStats {
  const t = TEAM_SKILL[skill];
  return {
    hp: Math.round(base.hp * t.hp),
    damageTaken: base.damageTaken * t.damageTaken,
    range: base.range * t.range,
    fireInterval: base.fireInterval / t.fireRate,
    bodyDamage: base.bodyDamage * t.damage,
    headDamage: base.headDamage * t.damage,
    hitNear: Math.min(0.97, base.hitNear * t.accuracy),
    hitFar: Math.min(0.92, base.hitFar * t.accuracy),
    headChance: Math.min(0.6, base.headChance * t.headshots),
  };
}

/** Who waits in the cages on a map. */
export function survivorRoster(map: MapId): readonly { name: string; tag: string; color: number; look?: AvatarLook; model?: string }[] {
  return SURVIVORS[map];
}

/** The helpers who deploy with you on a map (none on the District). */
export function squadRoster(map: MapId): readonly string[] {
  return SQUADS[map]?.names ?? [];
}

/** Where the squad starts: either side of and behind the insertion point. */
export function soldierSpots(level: Level, rng: Rng, count = 2): { x: number; z: number; slot: { x: number; z: number } }[] {
  const st = level.data.playerStart;
  return Array.from({ length: count }, (_, i) => {
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
 * The Seven Flames (the Forge), each snapped onto open ground. Always the same spots (a fixed seed), so the co-op
 * simulation and every player's screen agree without sending them.
 */
/** A fresh ally (positions and stats only; no model). */
export function makeAllyBody(level: Level, name: string, kind: AllyBody['kind'], x: number, z: number, yaw: number, slot: { x: number; z: number }, trapped: boolean, order: number, skill: TeamSkill = 'regular'): AllyBody {
  const stats = teamStats(kind === 'soldier' ? SOLDIER_STATS : SURVIVOR_STATS, skill);
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
    stuckT: 0,
    pickT: 0,
    target: null,
    slot,
    warned: false,
    trapped,
  };
}
