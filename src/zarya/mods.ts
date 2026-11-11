/**
 * ZARYA's kiosk shutters, weapon mods and the repairman's booth (no THREE).
 *
 *   SHUTTERS   one shut kiosk in most open zones (`story.ts` SHUTTERS: the fair, the Rynok, the Dvor, the depot street,
 *              the banya road). One player pays `STORY.shutter` points and it rolls up for good, for the whole squad:
 *              everyone standing by it has the guns in their hands filled, and the mod part inside goes to the squad.
 *   MODS       three, fitted at any workbench to the gun in the hands of whoever fits it, from the squad's mod parts
 *              (five in the kiosks, two lying about: `MOD_PARTS`):
 *                CHARGE  two parts, at a proper bench (Timur's, or the Institute's lab bench): aim for two seconds
 *                        and the next shot of that gun strikes three times as hard
 *                DRUM    one part: half as many rounds again in every load
 *                FROST   one part: whatever a round of that gun strikes is slowed for two seconds
 *              A mod belongs to the player and to the gun it is on: put the gun down (take another in its place) and
 *              the mod goes with it. A gun takes each mod once.
 *   THE BOOTH  the Rynok's repair booth is the game's own upgrade bench, and it upgrades nothing until the sleeping
 *              repairman's three tools are back on his counter (`story.ts` TOOLS, bits 6-8 of `v.m`).
 *
 * The shutters and the parts are the story's shared state (`StoryView.k`, sent on the co-op wire); the mods on a gun
 * are each player's own (`WeaponMods`, on their own screen, like the guns themselves). Co-op: the Charge and the Drum
 * work for everyone (damage and rounds are the shooter's own); the Frost coat's slow is solo only, because in co-op
 * the infected walk on the host and nothing a client sends can slow one (only mark or stagger it).
 */
import { WEAPONS } from '../config';
import type { Zombie } from '../enemies/zombie';
import type { CarriedWeapon } from '../logic/economy';
import { getWeaponStats } from '../logic/weaponStats';
import type { WeaponId } from '../types';
import type { WeaponModHook } from '../weapons/weaponSystem';
import { MOD_COST, MOD_MAIN, TOOLS, ZaryaStory, type StoryView } from './story';

export const MOD = { charge: 0, drum: 1, frost: 2 } as const;

/** Each mod: what a prompt calls it, the one word on the HUD's weapon panel, and what it does in a line. */
export const MODS: readonly { name: string; word: string; what: string }[] = [
  { name: 'THE CHARGE MOD', word: 'CHARGE', what: 'Aim two seconds: the next shot strikes three times as hard' },
  { name: 'A DRUM', word: 'DRUM', what: 'Half as many rounds again in every load' },
  { name: 'A FROST COAT', word: 'FROST', what: 'What its rounds strike is slowed for two seconds' },
];

export const MOD_TUNE = {
  /** Seconds of aiming that charge the Charge mod, and how much harder the charged shot strikes. */
  chargeHold: 2,
  chargeMul: 3,
  /** How many rounds a load holds with a drum, against without. */
  drumMul: 1.5,
  /** Seconds a frosted round slows what it strikes, and its pace meanwhile (a named one keeps more of it). */
  frostTime: 2,
  frostPace: 0.45,
  frostPaceBoss: 0.75,
} as const;

/** Where each of the repairman's tools is, in words (the booth's refusal says which are still out). */
export const TOOL_WHERE = ['on a windowsill in the Dvor', "on a stripped car in the garages' watchman's yard", "on the dispatcher's desk at the depot"];

/** Guns whose rounds strike along a line (what a frost coat can coat). */
const ROUNDS: ReadonlySet<WeaponId> = new Set<WeaponId>(['pistol', 'rifle', 'shotgun', 'hanafubuki', 'gvozdomyot', 'arbalet']);

/**
 * Guns no mod goes on: the steam lance and the vacuum fire by holding a gauge, not round by round (a charge would never
 * be spent), and the camera has no damage to change.
 */
const NO_MODS: ReadonlySet<WeaponId> = new Set<WeaponId>(['ottepel', 'raketa', 'zenit']);

/** Mod `i` can go on gun `id`. */
export function modFits(i: number, id: WeaponId): boolean {
  if (NO_MODS.has(id)) return false;
  if (i === MOD.drum) return WEAPONS[id].magSize >= 2;
  if (i === MOD.frost) return ROUNDS.has(id);
  return i === MOD.charge;
}

/** How many rounds a load of `c` holds with a drum on it. */
export function drumMag(c: CarriedWeapon): number {
  return Math.ceil(getWeaponStats(WEAPONS[c.id], c.tier).magSize * MOD_TUNE.drumMul);
}

/**
 * The mod a bench offers for gun `id` already wearing `mask`, with `parts` to spend: the Charge first at a proper bench
 * (`main`), then the Drum, then the Frost coat. -1: none (`short` says why when one would fit but cannot be paid for or
 * wants a proper bench).
 */
export function benchOffer(id: WeaponId, mask: number, parts: number, main: boolean): { i: number; short: 'parts' | 'bench' | null } {
  let short: 'parts' | 'bench' | null = null;
  for (const i of [MOD.charge, MOD.drum, MOD.frost]) {
    if ((mask & (1 << i)) !== 0 || !modFits(i, id)) continue;
    if (MOD_MAIN[i] && !main) {
      short ??= 'bench';
      continue;
    }
    if (parts < MOD_COST[i]!) {
      short = 'parts';
      continue;
    }
    return { i, short: null };
  }
  return { i: -1, short };
}

/** The repair booth's refusal while any of the repairman's tools is still out, or null once all three are back. */
export function boothRefusal(v: StoryView): { text: string; sub: string } | null {
  const out = TOOLS.map((_, i) => i).filter((i) => (v.m & (1 << (6 + i))) === 0);
  if (out.length === 0) return null;
  const back = TOOLS.length - out.length;
  const where = out.map((i) => TOOL_WHERE[i]!);
  const list = where.length === 1 ? where[0]! : `${where.slice(0, -1).join(', ')} and ${where[where.length - 1]}`;
  return { text: 'THE REPAIRMAN IS ASLEEP', sub: back ? `${back} of his 3 tools are back. Still out: ${list}` : `His tools are missing: ${list}` };
}

/**
 * The HUD's word for the mods on a gun (`mask`), with the Charge's state: short enough for the weapon panel's chip
 * ("DRUM", "DRUM + FROST", "CHARGED +2").
 */
export function modWord(mask: number, charged: boolean): string {
  const words: string[] = [];
  if (mask & (1 << MOD.charge)) words.push(charged ? 'CHARGED' : 'CHARGE');
  if (mask & (1 << MOD.drum)) words.push('DRUM');
  if (mask & (1 << MOD.frost)) words.push('FROST');
  const all = words.join(' + ');
  return words.length < 2 || all.length <= 12 ? all : `${words[0]} +${words.length - 1}`;
}

/** Every mod on a gun by name, for the journal ("charge, drum, frost"). */
export function modNames(mask: number): string {
  return MODS.filter((_, i) => mask & (1 << i)).map((m) => m.word.toLowerCase()).join(', ');
}

/**
 * One player's mods: which guns wear what, the Charge mod's aim, and the infected a frost coat has slowed. Plugs into
 * the weapon system as its `WeaponModHook`.
 */
export class WeaponMods implements WeaponModHook {
  /** Called with each infected a frosted round slows (the frost's glint). */
  onFrost: ((z: Zombie) => void) | null = null;
  /** The frost's slow is applied (false in co-op: the host walks the infected). */
  slows = true;
  private on = new WeakMap<CarriedWeapon, number>();
  private aimT = 0;
  private charged: CarriedWeapon | null = null;
  private readonly chill = new Map<Zombie, { until: number; pace: number }>();
  private t = 0;

  reset(): void {
    this.on = new WeakMap();
    this.aimT = 0;
    this.charged = null;
    this.thaw(true);
    this.t = 0;
  }

  /** The mods gun `c` wears, one bit each (`MOD`). */
  mask(c: CarriedWeapon | null): number {
    return c ? (this.on.get(c) ?? 0) : 0;
  }

  /** The Charge mod on `c` is charged. */
  isCharged(c: CarriedWeapon | null): boolean {
    return !!c && this.charged === c;
  }

  /** Fit mod `i` to `c`. A drum lengthens its loads at once (the rounds come with the next reload). */
  fit(c: CarriedWeapon, i: number): void {
    this.on.set(c, this.mask(c) | (1 << i));
    if (i === MOD.drum) c.ammo.magSize = drumMag(c);
  }

  /**
   * Every frame: the gun in hand charging while it is aimed (`ads`, 0..1), a drum's longer loads kept through an
   * upgrade (which sets a load back to the tier's own), and the frost wearing off. True on the frame a charge is ready.
   */
  update(dt: number, slots: readonly (CarriedWeapon | null)[], held: CarriedWeapon | null, ads: number): boolean {
    this.t += dt;
    for (const c of slots) if (c && this.mask(c) & (1 << MOD.drum) && c.ammo.magSize !== drumMag(c)) c.ammo.magSize = drumMag(c);
    // a charge belongs to the gun it was aimed with: put it away and it is gone
    if (this.charged && this.charged !== held) this.charged = null;
    let ready = false;
    if (held && this.mask(held) & (1 << MOD.charge) && !this.charged) {
      this.aimT = ads > 0.9 ? this.aimT + dt : 0;
      if (this.aimT >= MOD_TUNE.chargeHold) {
        this.charged = held;
        this.aimT = 0;
        ready = true;
      }
    } else if (!this.charged) this.aimT = 0;
    this.thaw(false);
    return ready;
  }

  /** How far the Charge mod has built up on the gun in hand, 0..1 (1 when charged). */
  charge(held: CarriedWeapon | null): number {
    if (!held || !(this.mask(held) & (1 << MOD.charge))) return 0;
    return this.charged === held ? 1 : Math.min(1, this.aimT / MOD_TUNE.chargeHold);
  }

  // ---- WeaponModHook ----

  damageMul(c: CarriedWeapon): number {
    return this.charged === c ? MOD_TUNE.chargeMul : 1;
  }

  shot(c: CarriedWeapon): void {
    if (this.charged === c) this.charged = null;
    this.aimT = 0;
  }

  hit(z: Zombie, c: CarriedWeapon): void {
    if (!(this.mask(c) & (1 << MOD.frost)) || !z.alive) return;
    const until = this.t + MOD_TUNE.frostTime;
    const had = this.chill.get(z);
    if (had) had.until = until;
    else if (this.slows) {
      const pace = z.speedScale * (z.isBoss ? MOD_TUNE.frostPaceBoss : MOD_TUNE.frostPace);
      this.chill.set(z, { until, pace });
      z.speedScale = pace;
    }
    this.onFrost?.(z);
  }

  /** Give back the pace of every slowed infected whose frost has worn off (all of them, with `all`). */
  private thaw(all: boolean): void {
    for (const [z, c] of this.chill) {
      if (!all && c.until > this.t && z.alive) continue;
      // (a body that has been dealt out again since has a pace of its own: leave it)
      if (z.speedScale === c.pace) z.speedScale = c.pace / (z.isBoss ? MOD_TUNE.frostPaceBoss : MOD_TUNE.frostPace);
      this.chill.delete(z);
    }
  }
}

/** How many mod parts the squad holds (for the HUD and the journal). */
export const partsHeld = (v: StoryView): number => ZaryaStory.modParts(v);
