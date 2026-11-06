/**
 * The squad's own guns and ammunition, on the maps where they have to fend for themselves (the Asylum): each squad
 * member and freed survivor carries a gun (or none), a magazine and a reserve, reloads when the magazine is empty, and
 * keeps a wallet of their own (it starts at `ALLY_SUPPLY.wallet` and takes `walletShare` of the worth of each of their
 * own kills; the player's pay and money are never touched). When they are low on ammunition and can pay, they walk to
 * their gun's chalk on a wall and buy ammo at the player's price; when they have no gun (or only a pistol) and a supply
 * box they have not used is close by and it is quiet, they go and take a gun from it - one pull per box each, whatever
 * the player has done with it. A box serves one at a time: a squad member waits while a player's reel spins or its
 * prize is on offer (and starts again after), and two of them never pull from the same box together.
 *
 * Shared by the solo game (`squad.ts`) and the co-op simulation (`sim/serverHost.ts`); no drawing and no sound here
 * (the caller is told through `AllySupply`).
 */
import { MYSTERY_BOX, SQUADS } from '../config';
import { LOOP, WALL_PRICES } from '../asylum/loopConfig';
import { WALL_BUYS } from '../asylum/loopData';
import type { Rng } from '../logic/rng';
import type { MapId } from '../world/layout/data';
import type { Level } from '../world/level';
import { FlowField } from '../world/nav';
import type { AllyBody, AllyStats } from './allyBrain';

export type AllyGun = 'none' | 'pistol' | 'shotgun' | 'rifle' | 'rpg';
export const ALLY_GUNS: readonly AllyGun[] = ['none', 'pistol', 'shotgun', 'rifle', 'rpg'];

/** Each gun in a squad member's hands: magazine, the most reserve they carry, reload seconds, and against a pistol: */
/** seconds between shots, damage per hit and reach (multipliers). */
export const ALLY_GUN: Record<Exclude<AllyGun, 'none'>, { mag: number; reserve: number; reload: number; fire: number; damage: number; range: number }> = {
  pistol: { mag: 12, reserve: 48, reload: 1.8, fire: 1, damage: 1, range: 1 },
  shotgun: { mag: 6, reserve: 24, reload: 3.2, fire: 2.1, damage: 2.6, range: 0.6 },
  rifle: { mag: 30, reserve: 120, reload: 2.5, fire: 0.5, damage: 0.95, range: 1.15 },
  rpg: { mag: 1, reserve: 4, reload: 3.4, fire: 3.5, damage: 7, range: 1.1 },
};

export const ALLY_SUPPLY = {
  /** Maps where the squad buys its own ammo and takes its guns from the boxes. */
  maps: ['asylum'] as readonly MapId[],
  /** The wallet they start with, and the share of each of their own kills' worth that goes into it. */
  wallet: 300,
  walletShare: 0.5,
  /** Errands: how far (m) a chalk or a box may be, how close the nearest infected may be, seconds between looks. */
  reach: 45,
  calm: 8,
  every: 1.2,
  /** Seconds at the chalk (buying) and at the box (the reel). */
  buyTime: 1.2,
  boxTime: MYSTERY_BOX.spin,
  /** Give up an errand stuck this long (s), or when the leader is this far from the ally (m). */
  stuck: 4,
  leash: 55,
} as const;

/** A wall chalk's price for ammo of a gun (the player's: half the gun's price, rounded to $10). */
export function ammoPrice(gun: AllyGun): number {
  if (gun === 'none') return Infinity;
  return Math.round((WALL_PRICES[gun] * LOOP.wallAmmoShare) / 10) * 10;
}

export interface AllyErrand {
  kind: 'ammo' | 'box';
  /** Where to stand, and (a box) its id. */
  x: number;
  z: number;
  box: string;
  path: FlowField;
  /** Seconds at the spot (buying, the reel), and seconds making no headway. */
  workT: number;
  stuckT: number;
}

export interface AllyKit {
  gun: AllyGun;
  mag: number;
  reserve: number;
  reloadT: number;
  wallet: number;
  /** Boxes they have pulled from (ids). */
  boxes: string[];
  errand: AllyErrand | null;
  /** Seconds until they look for an errand again. */
  lookT: number;
  /** Their numbers with a pistol in hand (the gun's multipliers apply on top). */
  base: AllyStats;
  /** The last thing they reported (so the caller says "out of ammo" once). */
  dry: boolean;
}

/** What the caller is told, and what it supplies (the boxes on the map). */
export interface AllySupply {
  /** Supply boxes a squad member may pull from (on the ground); `busy` while a player's reel spins or its prize waits. */
  boxes(): readonly { id: string; x: number; z: number; y?: number; busy?: boolean }[];
  /** The whole squad (so two never pull from one box together). */
  allies(): readonly AllyBody[];
  /** Bought ammo at a chalk for `price`; took `gun` from box `box`; out of ammo with nowhere to buy (once each time). */
  onAmmo(a: AllyBody, price: number): void;
  onBox(a: AllyBody, box: string, gun: AllyGun): void;
  onDry(a: AllyBody): void;
}

/** Does this map make the squad fend for itself. */
export function squadSupplies(map: MapId): boolean {
  return ALLY_SUPPLY.maps.includes(map);
}

/** The gun a squad member or survivor starts with on a supply map. */
export function startGun(map: MapId, name: string, kind: AllyBody['kind'], unarmed: boolean): AllyGun {
  if (kind === 'survivor') return unarmed ? 'none' : 'pistol';
  const def = SQUADS[map];
  const i = def ? def.names.indexOf(name) : -1;
  const w = i >= 0 ? def!.weapons[i] : 'rifle';
  return w === 'pistol' || w === 'shotgun' || w === 'rifle' || w === 'rpg' ? w : 'rifle';
}

/** A fresh kit with `gun` in hand. `base` are their numbers with a pistol (the reach too, even for one who starts unarmed). */
export function makeKit(gun: AllyGun, base: AllyStats): AllyKit {
  const k: AllyKit = { gun: 'none', mag: 0, reserve: 0, reloadT: 0, wallet: ALLY_SUPPLY.wallet, boxes: [], errand: null, lookT: 0, base: { ...base }, dry: false };
  setGun(k, gun);
  return k;
}

/** Their numbers with the gun in their hands (none: nothing is ever in reach). */
export function kitStats(k: AllyKit): AllyStats {
  if (k.gun === 'none') return { ...k.base, range: 0 };
  const g = ALLY_GUN[k.gun];
  return { ...k.base, range: k.base.range * g.range, fireInterval: k.base.fireInterval * g.fire, bodyDamage: k.base.bodyDamage * g.damage, headDamage: k.base.headDamage * g.damage };
}

/** A gun in their hands, with a full magazine and reserve. Returns their numbers with it (for `a.stats`). */
export function setGun(k: AllyKit, gun: AllyGun): AllyStats {
  k.gun = gun;
  k.reloadT = 0;
  k.dry = false;
  k.mag = gun === 'none' ? 0 : ALLY_GUN[gun].mag;
  k.reserve = gun === 'none' ? 0 : ALLY_GUN[gun].reserve;
  return kitStats(k);
}

/** Before a shot: can they fire now (a gun, a round in it, not reloading)? Advances the reload. */
export function kitReady(k: AllyKit, dt: number): boolean {
  if (k.gun === 'none') return false;
  if (k.reloadT > 0) {
    k.reloadT -= dt;
    if (k.reloadT > 0) return false;
    const take = Math.min(ALLY_GUN[k.gun].mag - k.mag, k.reserve);
    k.mag += take;
    k.reserve -= take;
  }
  if (k.mag <= 0) {
    if (k.reserve > 0) k.reloadT = ALLY_GUN[k.gun].reload;
    return false;
  }
  return true;
}

/** A round went: reload when the magazine runs dry. */
export function kitFired(k: AllyKit): void {
  k.mag = Math.max(0, k.mag - 1);
  if (k.mag === 0 && k.reserve > 0 && k.gun !== 'none') k.reloadT = ALLY_GUN[k.gun].reload;
}

/** Their own kill: a share of its worth into their wallet. */
export function kitPaid(k: AllyKit, reward: number): void {
  k.wallet += Math.max(0, Math.round(reward * ALLY_SUPPLY.walletShare));
}

/** Low on ammunition: less than a magazine left in all. */
export function kitLow(k: AllyKit): boolean {
  return k.gun !== 'none' && k.mag + k.reserve < ALLY_GUN[k.gun].mag;
}

/** A gun from a box for this squad member: weighted like the player's, never the one in their hands. */
export function boxGun(current: AllyGun, rng: Rng): AllyGun {
  const pool = (['pistol', 'shotgun', 'rifle', 'rpg'] as const).filter((g) => g !== current && (MYSTERY_BOX.guns[g] ?? 0) > 0);
  const total = pool.reduce((s, g) => s + MYSTERY_BOX.guns[g], 0);
  let r = rng.f() * total;
  for (const g of pool) {
    r -= MYSTERY_BOX.guns[g];
    if (r <= 0) return g;
  }
  return pool[pool.length - 1] ?? 'pistol';
}

/**
 * Look for an errand (ammo at a chalk, a gun from a box) and run one. Returns true while on an errand: the caller then
 * skips following the leader this step (they still shoot). `leader` is where the one they follow stands.
 */
export function allyErrand(a: AllyBody, level: Level, zombies: { zombies: readonly { x: number; z: number; alive: boolean; dormant?: boolean }[] }, supply: AllySupply, rng: Rng, dt: number, leader: { x: number; z: number } | null): boolean {
  const k = a.kit;
  if (!k || a.trapped || !a.ref.alive) return false;
  // upstairs (or anywhere off the ground): no errands, and one under way is dropped
  if (a.ref.y > 1) {
    k.errand = null;
    return false;
  }
  const e = k.errand;
  if (e) return runErrand(a, k, e, level, supply, rng, dt, leader);
  k.lookT -= dt;
  if (k.lookT > 0) return false;
  k.lookT = ALLY_SUPPLY.every;
  // out of ammo and out of money: say so once
  const dry = k.gun !== 'none' && k.mag + k.reserve === 0;
  if (dry && !k.dry && k.wallet < ammoPrice(k.gun)) supply.onDry(a);
  k.dry = dry;
  // only when it is quiet
  for (const z of zombies.zombies) if (z.alive && !z.dormant && Math.hypot(z.x - a.ref.x, z.z - a.ref.z) < ALLY_SUPPLY.calm) return false;
  const near = (x: number, z: number): boolean => Math.hypot(x - a.ref.x, z - a.ref.z) < ALLY_SUPPLY.reach && (!leader || Math.hypot(x - leader.x, z - leader.z) < ALLY_SUPPLY.leash - 5);
  let pick: { kind: 'ammo' | 'box'; x: number; z: number; box: string } | null = null;
  if (kitLow(k) && k.wallet >= ammoPrice(k.gun)) {
    let best = Infinity;
    for (const w of WALL_BUYS) {
      if (w.weapon !== k.gun) continue;
      const sx = w.x + w.fx * 1.1;
      const sz = w.z + w.fz * 1.1;
      const d = Math.hypot(sx - a.ref.x, sz - a.ref.z);
      if (d < best && near(sx, sz)) {
        best = d;
        pick = { kind: 'ammo', x: sx, z: sz, box: '' };
      }
    }
  }
  if (!pick && (k.gun === 'none' || k.gun === 'pistol')) {
    let best = Infinity;
    for (const b of supply.boxes()) {
      if ((b.y ?? 0) > 0.5 || b.busy || k.boxes.includes(b.id) || boxClaimed(supply, a, b.id)) continue;
      const d = Math.hypot(b.x - a.ref.x, b.z - a.ref.z);
      if (d >= best || !near(b.x, b.z)) continue;
      const at = level.nav.randomFreeNear(b.x, b.z + 1.2, 1.2, () => rng.f());
      if (!at) continue;
      best = d;
      pick = { kind: 'box', x: at.x, z: at.z, box: b.id };
    }
  }
  if (!pick) return false;
  const path = new FlowField(level.nav);
  path.compute(pick.x, pick.z, ALLY_SUPPLY.reach + 15);
  if (!path.isReachable(a.ref.x, a.ref.z)) return false; // behind a shut door
  k.errand = { kind: pick.kind, x: pick.x, z: pick.z, box: pick.box, path, workT: 0, stuckT: 0 };
  return true;
}

const steer = { x: 0, z: 0 };

/** Another squad member is on their way to (or at) box `id`. */
function boxClaimed(supply: AllySupply, a: AllyBody, id: string): boolean {
  return supply.allies().some((o) => o !== a && o.ref.alive && o.kit?.errand?.kind === 'box' && o.kit.errand.box === id);
}

/** Box `id` is free for this squad member now: no player's reel or prize, nobody else of the squad at it first. */
function boxFree(supply: AllySupply, a: AllyBody, id: string): boolean {
  if (supply.boxes().some((b) => b.id === id && b.busy)) return false;
  return !supply.allies().some((o) => o !== a && o.ref.alive && o.kit?.errand?.kind === 'box' && o.kit.errand.box === id && o.kit.errand.workT > 0);
}

function runErrand(a: AllyBody, k: AllyKit, e: AllyErrand, level: Level, supply: AllySupply, rng: Rng, dt: number, leader: { x: number; z: number } | null): boolean {
  // the leader went on without them: leave it and catch up
  if (leader && Math.hypot(leader.x - a.ref.x, leader.z - a.ref.z) > ALLY_SUPPLY.leash) {
    k.errand = null;
    return false;
  }
  const d = Math.hypot(e.x - a.ref.x, e.z - a.ref.z);
  if (d < 0.9) {
    e.workT += dt;
    if (e.kind === 'ammo' && e.workT >= ALLY_SUPPLY.buyTime) {
      const price = ammoPrice(k.gun);
      if (k.wallet >= price && k.gun !== 'none') {
        k.wallet -= price;
        k.reserve = ALLY_GUN[k.gun].reserve;
        if (k.mag === 0) k.reloadT = ALLY_GUN[k.gun].reload;
        k.dry = false;
        supply.onAmmo(a, price);
      }
      k.errand = null;
    } else if (e.kind === 'box' && !boxFree(supply, a, e.box)) {
      e.workT = 0; // a player's turn (or another's): wait, and start again after
    } else if (e.kind === 'box' && e.workT >= ALLY_SUPPLY.boxTime) {
      const gun = boxGun(k.gun, rng);
      k.boxes.push(e.box);
      a.stats = setGun(k, gun);
      supply.onBox(a, e.box, gun);
      k.errand = null;
    }
    return true;
  }
  let gx = e.x;
  let gz = e.z;
  if (!level.nav.los(a.ref.x, a.ref.z, e.x, e.z) && e.path.follow(a.ref.x, a.ref.z, steer, 10)) {
    gx = steer.x;
    gz = steer.z;
  }
  const sx = gx - a.ref.x;
  const sz = gz - a.ref.z;
  const sd = Math.hypot(sx, sz) || 1;
  const speed = 4.4 * dt;
  const step = { x: a.ref.x + (sx / sd) * Math.min(speed, sd), z: a.ref.z + (sz / sd) * Math.min(speed, sd) };
  level.world.resolveCircle(step, 0.32, a.ref.y + 0.5, a.ref.y + 1.7, 3);
  const progress = Math.hypot(step.x - a.ref.x, step.z - a.ref.z);
  e.stuckT = progress < speed * 0.25 ? e.stuckT + dt : Math.max(0, e.stuckT - dt);
  if (e.stuckT > ALLY_SUPPLY.stuck) {
    k.errand = null;
    k.lookT = 15; // not straight back to the same wall
    return false;
  }
  a.ref.x = step.x;
  a.ref.z = step.z;
  a.ref.y = level.world.floorBelow(step.x, step.z, 0.2, a.ref.y);
  a.ref.eyeY = a.ref.y + 1.6;
  if (!a.target) a.yaw = Math.atan2(-sx, -sz);
  return true;
}
