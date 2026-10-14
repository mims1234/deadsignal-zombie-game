/**
 * Power-up drops as pure rules and plain state (no THREE, no DOM): the drop roll with its pity timer, which kind
 * drops (a shuffled bag, so every kind comes round once per cycle), the floating drops' lifetimes, the timed effects
 * and what each pickup does, described as data for the runtime to carry out.
 *
 *   MAX AMMO       every reserve full, grenades full
 *   INSTA-KILL     30 s: any hit kills (not bosses, not card carriers)
 *   DOUBLE POINTS  30 s: all cash x2
 *   NUKE           every infected alive dies (not bosses / carriers), +$400; its kills pay nothing and drop nothing
 *   CARPENTER      every barricade boarded up again, +$200 (only drops on a map with barricades, when one is damaged)
 *
 * State is numbers and arrays only, so the co-op snapshot can carry it. Authority: the host (or solo game) rolls drops,
 * owns timers and decides pickups; guests only draw drops / timers and walk into them.
 */
import { GRENADE } from '../config';
import type { Inventory } from './economy';
import { POWERUPS } from './powerupConfig';
import type { Rng } from './rng';

export const POWERUP_KINDS = ['maxAmmo', 'instaKill', 'doublePoints', 'nuke', 'carpenter'] as const;
export type PowerupKind = (typeof POWERUP_KINDS)[number];
/** The ones that run on a clock. */
export type TimedPowerup = 'instaKill' | 'doublePoints';

export interface PowerupDrop {
  id: number;
  kind: PowerupKind;
  x: number;
  z: number;
  /** Seconds since it dropped. */
  age: number;
}

export interface PowerupState {
  drops: PowerupDrop[];
  /** Seconds left on each timed effect (0 = off). */
  timers: Record<TimedPowerup, number>;
  /** Kills since the last drop (the pity timer). */
  dry: number;
  /** Kinds still to come this cycle (popped from the end). */
  bag: PowerupKind[];
  nextId: number;
}

export function createPowerups(): PowerupState {
  return { drops: [], timers: { instaKill: 0, doublePoints: 0 }, dry: 0, bag: [], nextId: 1 };
}

export function resetPowerups(s: PowerupState): void {
  s.drops.length = 0;
  s.timers.instaKill = 0;
  s.timers.doublePoints = 0;
  s.dry = 0;
  s.bag.length = 0;
  s.nextId = 1;
}

/** Chance that the next kill drops something, given `dry` kills since the last drop. */
export function dropChance(dry: number): number {
  if (dry + 1 >= POWERUPS.pityMax) return 1;
  return Math.min(1, POWERUPS.baseChance + Math.max(0, dry - POWERUPS.pityStart) * POWERUPS.pityGain);
}

/** Next kind out of the bag; a new cycle is shuffled when it runs dry. `carpenter` false leaves the Carpenter out. */
export function nextKind(s: PowerupState, rng: Rng, opts: { carpenter: boolean }): PowerupKind {
  for (let guard = 0; guard < 3; guard++) {
    if (s.bag.length === 0) {
      const fill: PowerupKind[] = [];
      for (const k of POWERUP_KINDS) for (let i = 0; i < POWERUPS.bag[k]; i++) fill.push(k);
      // Fisher-Yates with the run's rng (deterministic)
      for (let i = fill.length - 1; i > 0; i--) {
        const j = Math.floor(rng.f() * (i + 1));
        [fill[i], fill[j]] = [fill[j]!, fill[i]!];
      }
      s.bag.push(...fill);
    }
    for (let i = s.bag.length - 1; i >= 0; i--) {
      const k = s.bag[i]!;
      if (k === 'carpenter' && !opts.carpenter) continue;
      s.bag.splice(i, 1);
      return k;
    }
    s.bag.length = 0; // only Carpenters left and none wanted: start a fresh cycle
  }
  return 'maxAmmo';
}

/**
 * A kill at (x, z): roll for a drop. Bosses and card carriers never drop (`eligible` false), and nothing drops while
 * `maxOnGround` are already waiting. Returns the new drop or null.
 */
export function rollDrop(s: PowerupState, rng: Rng, x: number, z: number, opts: { eligible: boolean; carpenter: boolean }): PowerupDrop | null {
  if (!opts.eligible) return null;
  const chance = dropChance(s.dry);
  if (s.drops.length >= POWERUPS.maxOnGround || !(rng.f() < chance)) {
    s.dry++;
    return null;
  }
  s.dry = 0;
  const drop: PowerupDrop = { id: s.nextId++, kind: nextKind(s, rng, opts), x, z, age: 0 };
  s.drops.push(drop);
  return drop;
}

/** Advance drop ages and timers. Returns the drops that timed out (already removed) and the effects that ran out. */
export function tickPowerups(s: PowerupState, dt: number): { expired: PowerupDrop[]; ended: TimedPowerup[] } {
  const expired: PowerupDrop[] = [];
  for (let i = s.drops.length - 1; i >= 0; i--) {
    const d = s.drops[i]!;
    d.age += dt;
    if (d.age >= POWERUPS.lifetime) {
      expired.push(d);
      s.drops.splice(i, 1);
    }
  }
  const ended: TimedPowerup[] = [];
  for (const k of ['instaKill', 'doublePoints'] as const) {
    if (s.timers[k] <= 0) continue;
    s.timers[k] = Math.max(0, s.timers[k] - dt);
    if (s.timers[k] === 0) ended.push(k);
  }
  return { expired, ended };
}

/** Is a drop blinking (about to vanish), and is it lit this instant? */
export function dropVisible(d: PowerupDrop, time: number): boolean {
  const left = POWERUPS.lifetime - d.age;
  if (left > POWERUPS.blinkFor) return true;
  // blink faster as it runs out: 4 Hz down to 10 Hz
  const hz = 4 + (1 - left / POWERUPS.blinkFor) * 6;
  return Math.floor(time * hz * 2) % 2 === 0;
}

/** The drop a walker at (x, z) takes (removed from the state), or null. */
export function takeDropAt(s: PowerupState, x: number, z: number, radius: number = POWERUPS.pickupRadius): PowerupDrop | null {
  for (let i = 0; i < s.drops.length; i++) {
    const d = s.drops[i]!;
    if ((d.x - x) ** 2 + (d.z - z) ** 2 <= radius * radius) {
      s.drops.splice(i, 1);
      return d;
    }
  }
  return null;
}

/** What taking a power-up does, as data. */
export interface PowerupEffect {
  kind: PowerupKind;
  /** Cash to award (before the double-points multiplier). */
  cash: number;
  refillAmmo: boolean;
  /** Kill every infected alive except bosses and carriers. */
  killAll: boolean;
  /** Board up every barricade. */
  repairAll: boolean;
  /** Start (or restart) this timed effect for `duration` seconds. */
  timed: { kind: TimedPowerup; duration: number } | null;
}

export function effectOf(kind: PowerupKind): PowerupEffect {
  const e: PowerupEffect = { kind, cash: 0, refillAmmo: false, killAll: false, repairAll: false, timed: null };
  switch (kind) {
    case 'maxAmmo':
      e.refillAmmo = true;
      break;
    case 'instaKill':
    case 'doublePoints':
      e.timed = { kind, duration: POWERUPS.timed };
      break;
    case 'nuke':
      e.killAll = true;
      e.cash = POWERUPS.nukeCash;
      break;
    case 'carpenter':
      e.repairAll = true;
      e.cash = POWERUPS.carpenterCash;
      break;
  }
  return e;
}

/** Take a power-up: start its timer if it has one, and return what else it does. */
export function applyPowerup(s: PowerupState, kind: PowerupKind): PowerupEffect {
  const e = effectOf(kind);
  if (e.timed) s.timers[e.timed.kind] = e.timed.duration;
  return e;
}

/** Cash multiplier for everything the players earn (double points). */
export function cashMultiplier(s: PowerupState): number {
  return s.timers.doublePoints > 0 ? 2 : 1;
}

/** Damage a hit really does: with insta-kill running, enough to kill anything that is not a boss or a carrier. */
export function filterDamage(s: PowerupState, amount: number, target: { hp: number; isBoss: boolean; curable: boolean }): number {
  if (s.timers.instaKill <= 0 || target.isBoss || target.curable || amount <= 0) return amount;
  return Math.max(amount, target.hp + 1);
}

/** Which of these infected a nuke kills: the living, except bosses and card carriers (indices into `list`). */
export function nukeTargets(list: readonly { alive: boolean; isBoss: boolean; curable: boolean }[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < list.length; i++) {
    const z = list[i]!;
    if (z.alive && !z.isBoss && !z.curable) out.push(i);
  }
  return out;
}

/** MAX AMMO: every carried weapon's reserve full (the magazine is left as it is), grenades full. Returns rounds added. */
export function refillAll(inv: Inventory): number {
  let added = 0;
  for (const w of inv.slots) {
    if (!w) continue;
    added += Math.max(0, w.ammo.reserveMax - w.ammo.reserve);
    w.ammo.reserve = w.ammo.reserveMax;
  }
  inv.grenades = Math.max(inv.grenades, GRENADE.max);
  return added;
}
