/**
 * The Asylum's purchasable loop (pure rules, no THREE / DOM): buyable doors open zones, a lever turns the power on,
 * perk machines (power only) sell perks, chalk outlines on the walls sell guns and their ammo, and the Pack-a-Punch
 * (power only) upgrades the gun in your hands.
 *
 * `LoopState` is plain numbers and arrays so it can travel in a co-op snapshot as it is. Everything that changes it is
 * a function here that checks the rules and the cash first and changes nothing when it fails; the browser side
 * (`loopRuntime.ts`) draws the result. Cash is the player's `Inventory` cash (points), spent through `spendCash`.
 *
 * Co-op note: doors and the power are shared by the squad; perks are kept per player id (solo uses `SOLO_ID`).
 */
import { WEAPONS } from '../config';
import { addReserve, applyUpgradeAmmo, isFull } from '../logic/ammo';
import { activeWeapon, createCarried, spendCash, type Inventory } from '../logic/economy';
import { getWeaponStats, type Tier } from '../logic/weaponStats';
import type { WeaponId } from '../types';
import { LOOP, PERK_DEFS, WALL_PRICES, type PerkId } from './loopConfig';
import { ASYLUM_DOORS, zoneAt, type ZoneId } from './loopData';

/** The id a solo player's perks are kept under. */
export const SOLO_ID = 'local';

/** Perk ids by index (the state stores indices). */
export const PERK_IDS: readonly PerkId[] = ['ironhide', 'quickhand', 'secondWind', 'rapidFire'];

export interface LoopState {
  /** One flag per door in `ASYLUM_DOORS`: 1 once bought (open), 0 closed. */
  doors: number[];
  /** 1 once the power is on. */
  power: number;
  /** Perks each player owns, as indices into `PERK_IDS`, in the order bought. */
  perks: Record<string, number[]>;
}

export function createLoopState(): LoopState {
  return { doors: ASYLUM_DOORS.map(() => 0), power: 0, perks: {} };
}

/** Back to the start of a run: every door shut, the power off, no perks. */
export function resetLoopState(s: LoopState): void {
  for (let i = 0; i < ASYLUM_DOORS.length; i++) s.doors[i] = 0;
  s.doors.length = ASYLUM_DOORS.length;
  s.power = 0;
  for (const k of Object.keys(s.perks)) delete s.perks[k];
}

/** Why a purchase did not happen ('ok' when it did). */
export type LoopReason = 'ok' | 'unaffordable' | 'open' | 'unreachable' | 'nopower' | 'owned' | 'max' | 'full' | 'maxed' | 'noweapon' | 'invalid';

export interface LoopResult {
  ok: boolean;
  reason: LoopReason;
  cost: number;
  message: string;
}

const done = (cost: number, message: string): LoopResult => ({ ok: true, reason: 'ok', cost, message });
const fail = (reason: LoopReason, cost: number, message: string): LoopResult => ({ ok: false, reason, cost, message });
const NOT_ENOUGH = 'NOT ENOUGH $';

// ---------------------------------------------------------------------------------------------
// zones and doors
// ---------------------------------------------------------------------------------------------

export function isDoorOpen(s: LoopState, door: number): boolean {
  return s.doors[door] === 1;
}

/** A zone is open once any door into it has been bought; the front grounds always are. */
export function isZoneOpen(s: LoopState, zone: ZoneId): boolean {
  if (zone === 'front') return true;
  for (let i = 0; i < ASYLUM_DOORS.length; i++) {
    if (s.doors[i] === 1 && ASYLUM_DOORS[i]!.zones.includes(zone)) return true;
  }
  return false;
}

/** Director hook: may the infected spawn at this point (is it in an open zone)? */
export function spawnAllowed(s: LoopState, x: number, z: number): boolean {
  return isZoneOpen(s, zoneAt(x, z));
}

/** What buying a door would do now: 'ok', 'open' (already), 'unreachable' (neither side open) or 'unaffordable'. */
export function doorState(s: LoopState, door: number, cash: number): LoopReason {
  const d = ASYLUM_DOORS[door];
  if (!d) return 'invalid';
  if (s.doors[door] === 1) return 'open';
  if (!isZoneOpen(s, d.zones[0]) && !isZoneOpen(s, d.zones[1])) return 'unreachable';
  return cash >= d.cost ? 'ok' : 'unaffordable';
}

/** Buy a door: takes the cash and opens it (and with it the zone behind). */
export function buyDoor(s: LoopState, door: number, inv: Inventory): LoopResult {
  const d = ASYLUM_DOORS[door];
  if (!d) return fail('invalid', 0, 'No such door');
  const st = doorState(s, door, inv.cash);
  if (st === 'open') return fail('open', d.cost, 'Already open');
  if (st === 'unreachable') return fail('unreachable', d.cost, 'Out of reach');
  if (st !== 'ok' || !spendCash(inv, d.cost)) return fail('unaffordable', d.cost, NOT_ENOUGH);
  s.doors[door] = 1;
  return done(d.cost, d.kind === 'debris' ? 'Debris cleared' : d.kind === 'gate' ? 'Gate open' : 'Door open');
}

/** Open (or shut) a door with no purchase: co-op sync, dev tools and tests. */
export function setDoor(s: LoopState, door: number, open: boolean): void {
  if (door >= 0 && door < ASYLUM_DOORS.length) s.doors[door] = open ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// the power
// ---------------------------------------------------------------------------------------------

export function isPowerOn(s: LoopState): boolean {
  return s.power === 1;
}

/** Turn the power on or off; returns true when that changed anything. */
export function setPower(s: LoopState, on: boolean): boolean {
  const v = on ? 1 : 0;
  if (s.power === v) return false;
  s.power = v;
  return true;
}

// ---------------------------------------------------------------------------------------------
// perks
// ---------------------------------------------------------------------------------------------

export function perksOf(s: LoopState, player: string): PerkId[] {
  return (s.perks[player] ?? []).map((i) => PERK_IDS[i]!).filter((p) => p !== undefined);
}

export function hasPerk(s: LoopState, player: string, perk: PerkId): boolean {
  return (s.perks[player] ?? []).includes(PERK_IDS.indexOf(perk));
}

/** What buying a perk would do now. */
export function perkState(s: LoopState, player: string, perk: PerkId, cash: number): LoopReason {
  if (!isPowerOn(s)) return 'nopower';
  if (hasPerk(s, player, perk)) return 'owned';
  if ((s.perks[player]?.length ?? 0) >= LOOP.maxPerks) return 'max';
  return cash >= PERK_DEFS[perk].cost ? 'ok' : 'unaffordable';
}

export function buyPerk(s: LoopState, player: string, perk: PerkId, inv: Inventory): LoopResult {
  const def = PERK_DEFS[perk];
  const st = perkState(s, player, perk, inv.cash);
  if (st === 'nopower') return fail(st, def.cost, 'No power');
  if (st === 'owned') return fail(st, def.cost, 'Already have it');
  if (st === 'max') return fail(st, def.cost, `${LOOP.maxPerks} perks at most`);
  if (st !== 'ok' || !spendCash(inv, def.cost)) return fail('unaffordable', def.cost, NOT_ENOUGH);
  (s.perks[player] ??= []).push(PERK_IDS.indexOf(perk));
  return done(def.cost, def.name);
}

/** Going down (or dying) loses every perk. Returns what was lost. */
export function losePerks(s: LoopState, player: string): PerkId[] {
  const lost = perksOf(s, player);
  delete s.perks[player];
  return lost;
}

/**
 * Solo: the player would die. With SECOND WIND they get back up instead - the perk is used up and, as with any time
 * you go down, every other perk goes with it. Returns true when it saved them.
 */
export function useSecondWind(s: LoopState, player: string): boolean {
  if (!hasPerk(s, player, 'secondWind')) return false;
  losePerks(s, player);
  return true;
}

/** How a set of perks changes the player: small multipliers the game systems apply. */
export interface PerkMods {
  /** Max health (and what health regenerates to). */
  maxHealth: number;
  /** Reload durations are multiplied by this. */
  reloadMul: number;
  /** Seconds between shots are multiplied by this. */
  fireIntervalMul: number;
  /** Co-op revive hold time is multiplied by this. */
  reviveMul: number;
}

export function perkMods(perks: readonly PerkId[], baseHealth: number): PerkMods {
  const P = LOOP.perk;
  return {
    maxHealth: perks.includes('ironhide') ? P.ironhideHealth : baseHealth,
    reloadMul: perks.includes('quickhand') ? P.quickhandReloadMul : 1,
    fireIntervalMul: perks.includes('rapidFire') ? P.rapidFireIntervalMul : 1,
    reviveMul: perks.includes('secondWind') ? P.secondWindReviveMul : 1,
  };
}

// ---------------------------------------------------------------------------------------------
// wall-buys
// ---------------------------------------------------------------------------------------------

export function wallAmmoPrice(weapon: WeaponId): number {
  return Math.round((WALL_PRICES[weapon] * LOOP.wallAmmoShare) / 10) * 10;
}

export interface WallOffer {
  /** 'weapon': buy the gun (it replaces the one in your hands); 'ammo': you carry it, refill it. */
  kind: 'weapon' | 'ammo';
  cost: number;
  state: 'ok' | 'unaffordable' | 'full';
}

export function wallOffer(inv: Inventory, weapon: WeaponId): WallOffer {
  const carried = inv.slots.find((w) => w?.id === weapon) ?? null;
  if (carried) {
    const cost = wallAmmoPrice(weapon);
    return { kind: 'ammo', cost, state: isFull(carried.ammo) ? 'full' : inv.cash >= cost ? 'ok' : 'unaffordable' };
  }
  const cost = WALL_PRICES[weapon];
  return { kind: 'weapon', cost, state: inv.cash >= cost ? 'ok' : 'unaffordable' };
}

/** Buy from a wall chalk: the gun (replacing the one in your hands) or, if you carry it, a full refill. */
export function buyWall(inv: Inventory, weapon: WeaponId): LoopResult & { swapped: boolean } {
  const o = wallOffer(inv, weapon);
  const name = WEAPONS[weapon].short;
  if (o.state === 'full') return { ...fail('full', o.cost, 'Ammo full'), swapped: false };
  if (o.state !== 'ok' || !spendCash(inv, o.cost)) return { ...fail('unaffordable', o.cost, NOT_ENOUGH), swapped: false };
  if (o.kind === 'ammo') {
    const w = inv.slots.find((c) => c?.id === weapon)!;
    const before = w.ammo.reserve + w.ammo.mag;
    addReserve(w.ammo, w.ammo.reserveMax);
    w.ammo.mag = w.ammo.magSize;
    w.ammo.reload = null;
    inv.ammoCollected += Math.max(0, w.ammo.reserve + w.ammo.mag - before);
    return { ...done(o.cost, `${name} ammo`), swapped: false };
  }
  const old = activeWeapon(inv);
  const fresh = createCarried(weapon);
  fresh.ammo.reserve = fresh.ammo.reserveMax; // off the wall with a full reserve
  inv.slots[inv.activeSlot] = fresh;
  return { ...done(o.cost, old ? `${name} replaces ${WEAPONS[old.id].short}` : `${name} acquired`), swapped: true };
}

// ---------------------------------------------------------------------------------------------
// Pack-a-Punch
// ---------------------------------------------------------------------------------------------

/** The highest upgrade tier a gun can reach. */
export const TOP_TIER: Tier = 2;

export interface PapOffer {
  state: 'ok' | 'unaffordable' | 'nopower' | 'noweapon' | 'maxed';
  cost: number;
  /** The tier the gun in your hands would come out at, and its label (e.g. "MK II"). */
  nextTier: number;
  label: string;
}

export function papOffer(s: LoopState, inv: Inventory): PapOffer {
  const cost = LOOP.pap.cost;
  const w = activeWeapon(inv);
  if (!w) return { state: 'noweapon', cost, nextTier: 0, label: '' };
  const next = w.tier + 1;
  const label = next <= TOP_TIER ? WEAPONS[w.id].tiers[next - 1]!.label : WEAPONS[w.id].tiers[TOP_TIER - 1]!.label;
  if (!isPowerOn(s)) return { state: 'nopower', cost, nextTier: next, label };
  if (w.tier >= TOP_TIER) return { state: 'maxed', cost, nextTier: w.tier, label };
  return { state: inv.cash >= cost ? 'ok' : 'unaffordable', cost, nextTier: next, label };
}

/** Pack-a-Punch the gun in your hands: one upgrade tier up, magazine and reserve filled to the new size. */
export function packAPunch(s: LoopState, inv: Inventory): LoopResult {
  const o = papOffer(s, inv);
  if (o.state === 'nopower') return fail('nopower', o.cost, 'No power');
  if (o.state === 'noweapon') return fail('noweapon', o.cost, 'Nothing in your hands');
  if (o.state === 'maxed') return fail('maxed', o.cost, 'Fully upgraded');
  if (o.state !== 'ok' || !spendCash(inv, o.cost)) return fail('unaffordable', o.cost, NOT_ENOUGH);
  const w = activeWeapon(inv)!;
  w.tier = (w.tier + 1) as Tier;
  const st = getWeaponStats(WEAPONS[w.id], w.tier);
  applyUpgradeAmmo(w.ammo, st.magSize, st.reserveMax);
  return done(o.cost, `${WEAPONS[w.id].short} ${o.label}`);
}
