/**
 * ZARYA's kiosk shutters, weapon mods and the repairman's booth (no THREE).
 *
 *   SHUTTERS   one shut kiosk in most open zones (`story.ts` SHUTTERS: the fair, the Rynok, the Dvor, the depot street,
 *              the banya road). One player pays `STORY.shutter` points and it rolls up for good, for the whole squad:
 *              everyone standing by it has the guns in their hands filled, and the mod part inside goes to the squad.
 *   MODS       two, each one mod part, fitted at any workbench to the gun in the hands of whoever fits it, from the
 *              squad's parts (five in the kiosks, two lying about: `MOD_PARTS`). Each says what it does in its name and
 *              shows it when it does it:
 *                BIG MAGAZINE   half as many rounds again in every load: the count on the weapon panel jumps the
 *                               moment it goes on (the load is topped up from the gun's own rounds)
 *                FROST ROUNDS   whatever a round of that gun hits is slowed for two seconds, and frosted over while it
 *                               is (a cold glitter on it). In co-op, where the host walks the infected and nothing a
 *                               guest sends can slow one, a frosted infected is stopped stiff for a moment instead,
 *                               at most once a slow (`zfx`'s stagger), so it still loses about as much ground
 *              A mod belongs to the player and to the gun it is on. A gun takes each mod once.
 *              (Round 3 cut the old Charge mod, "aim two seconds and the next shot strikes three times as hard": nobody
 *              could see it happen, and a phone has no steady aim to hold. Its index stays, never offered, so the
 *              story's acts and the wire keep their numbers.)
 *   THE BOOTH  the Rynok's repair booth is the game's own upgrade bench, and it upgrades nothing until the sleeping
 *              repairman's three tools are back on his counter (`story.ts` TOOLS, bits 6-8 of `v.m`).
 *
 * The shutters and the parts are the story's shared state (`StoryView.k`, sent on the co-op wire); the mods on a gun
 * are each player's own (`WeaponMods`, on their own screen, like the guns themselves).
 */
import { WEAPONS } from '../config';
import type { Zombie } from '../enemies/zombie';
import type { CarriedWeapon } from '../logic/economy';
import { getWeaponStats } from '../logic/weaponStats';
import type { WeaponId } from '../types';
import type { WeaponModHook } from '../weapons/weaponSystem';
import { KBIT, MOD_COST, MOD_PARTS, SHUTTERS, STORY, TOOLS, ZaryaStory, type StoryView } from './story';

export const MOD = { charge: 0, drum: 1, frost: 2 } as const;

/**
 * Each mod: what a prompt calls it, the one word on the HUD's weapon panel, what it does in a line, and which guns it
 * goes on in words (the journal). `cut`: never offered (the Charge).
 */
export const MODS: readonly { name: string; word: string; what: string; fits: string; cut?: boolean }[] = [
  { name: 'THE CHARGE MOD', word: 'CHARGE', what: 'Aim two seconds: the next shot strikes three times as hard', fits: '', cut: true },
  { name: 'A BIG MAGAZINE', word: 'BIG MAG', what: 'Half as many rounds again in every load', fits: 'any gun that loads more than one round' },
  { name: 'FROST ROUNDS', word: 'FROST', what: 'Whatever its rounds hit is slowed for 2 seconds', fits: 'the guns that fire rounds: rifle, pistol, shotgun, crossbow, nail gun' },
];

/** The mods a bench can offer, in the order it offers them. */
export const OFFERED: readonly number[] = [MOD.drum, MOD.frost];

export const MOD_TUNE = {
  /** How many rounds a load holds with a big magazine, against without. */
  drumMul: 1.5,
  /** Seconds a frosted round slows what it strikes, and its pace meanwhile (a named one keeps more of it). */
  frostTime: 2,
  frostPace: 0.45,
  frostPaceBoss: 0.75,
  /** Co-op: the moment a frosted infected is stopped stiff instead (once a slow). */
  frostStiff: 0.4,
  /** Seconds between two glitters of frost on a slowed infected. */
  frostGlint: 0.3,
} as const;

/** Where each of the repairman's tools is, in words (the booth's refusal says which are still out). */
export const TOOL_WHERE = ['on a windowsill in the Dvor', "on a stripped car in the garages' watchman's yard", "on the dispatcher's desk at the depot"];

/** Where each of the two mod parts lying about is, in words (`story.ts` MOD_PARTS). */
export const PART_WHERE = ["a gunsmith's tin at the end of the Okhotnik's counter, on the depot street", "a box of Timur's gun parts on his garage's back wall"];

/** Guns whose rounds strike along a line (what frost rounds can be). */
const ROUNDS: ReadonlySet<WeaponId> = new Set<WeaponId>(['pistol', 'rifle', 'shotgun', 'hanafubuki', 'gvozdomyot', 'arbalet']);

/**
 * Guns no mod goes on: the steam lance and the vacuum fire by holding a gauge, not round by round, and the camera has no
 * damage to change.
 */
const NO_MODS: ReadonlySet<WeaponId> = new Set<WeaponId>(['ottepel', 'raketa', 'zenit']);

/** Mod `i` can go on gun `id` (never the cut Charge). */
export function modFits(i: number, id: WeaponId): boolean {
  if (NO_MODS.has(id)) return false;
  if (i === MOD.drum) return WEAPONS[id].magSize >= 2;
  if (i === MOD.frost) return ROUNDS.has(id);
  return false;
}

/** How many rounds a load of `c` holds with a big magazine on it. */
export function drumMag(c: CarriedWeapon): number {
  return Math.ceil(getWeaponStats(WEAPONS[c.id], c.tier).magSize * MOD_TUNE.drumMul);
}

/** What a gun's rounds are called, for a prompt ("225 nails a load"). */
export function roundNoun(id: WeaponId, n: number): string {
  const one = id === 'gvozdomyot' ? 'nail' : id === 'arbalet' ? 'bolt' : id === 'shotgun' ? 'shell' : id === 'hanafubuki' ? 'petal' : 'round';
  return n === 1 ? one : `${one}s`;
}

/**
 * The mod a bench offers for gun `id` already wearing `mask`, with `parts` to spend: the big magazine, then frost
 * rounds. -1: none (`short` is 'parts' when one would fit but the squad has no part for it).
 */
export function benchOffer(id: WeaponId, mask: number, parts: number, _main = false): { i: number; short: 'parts' | null } {
  let short: 'parts' | null = null;
  for (const i of OFFERED) {
    if ((mask & (1 << i)) !== 0 || !modFits(i, id)) continue;
    if (parts < MOD_COST[i]!) {
      short = 'parts';
      continue;
    }
    return { i, short: null };
  }
  return { i: -1, short };
}

/**
 * What fitting mod `i` to `c` will do, said plainly for the bench's prompt: "150 -> 225 nails a load", "Its rounds
 * will slow what they hit for 2 seconds".
 */
export function fitPreview(c: CarriedWeapon, i: number): string {
  if (i === MOD.drum) {
    const now = getWeaponStats(WEAPONS[c.id], c.tier).magSize;
    const then = drumMag(c);
    return `${now} -> ${then} ${roundNoun(c.id, then)} a load`;
  }
  if (i === MOD.frost) return `Its ${roundNoun(c.id, 2)} will slow what they hit for ${MOD_TUNE.frostTime} seconds`;
  return MODS[i]?.what ?? '';
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

/** The HUD's word for the mods on a gun (`mask`): short enough for the weapon panel's chip ("BIG MAG", "BIG MAG + FROST"). */
export function modWord(mask: number): string {
  return OFFERED.filter((i) => mask & (1 << i))
    .map((i) => MODS[i]!.word)
    .join(' + ');
}

/** Every mod on a gun by name, for the journal ("big magazine, frost rounds"). */
export function modNames(mask: number): string {
  return OFFERED.filter((i) => mask & (1 << i))
    .map((i) => MODS[i]!.name.replace(/^A /, '').toLowerCase())
    .join(', ');
}

/**
 * The journal's mods section, in lines: the parts the squad holds, each mod (what it does, what it needs, which of
 * the guns carried wear it), and where the parts are (each kiosk and each lying part, found or not). `guns` are the
 * guns carried with their names and masks.
 */
export function modJournal(v: StoryView, guns: readonly { name: string; mask: number }[]): string[] {
  const found = ZaryaStory.count(v.k & ((1 << KBIT.spent) - 1));
  const total = SHUTTERS.length + MOD_PARTS.length;
  const rows: string[] = [`Mod parts: ${ZaryaStory.modParts(v)} to fit, ${found} of ${total} found. Each mod takes one part, at any workbench, and goes on the gun in your hands.`];
  for (const i of OFFERED) {
    const m = MODS[i]!;
    const on = guns.filter((g) => g.mask & (1 << i)).map((g) => g.name);
    rows.push(`${m.name.replace(/^A /, '')}: ${m.what.toLowerCase()}. Fits ${m.fits}. ${on.length ? `On your ${on.join(', ')}.` : 'On none of your guns yet.'}`);
  }
  const kiosks = SHUTTERS.map((s, i) => `${s.name}${ZaryaStory.shutterUp(v, i) ? ' (open)' : ''}`);
  rows.push(`Parts are in the shut kiosks, one each, $${STORY.shutter} to roll a shutter up for the squad: ${kiosks.join('; ')}.`);
  rows.push(`And lying about: ${PART_WHERE.map((w, i) => `${w}${(v.k & (1 << (KBIT.part + i))) !== 0 ? ' (taken)' : ''}`).join('; ')}.`);
  return rows;
}

/**
 * One player's mods: which guns wear what, and the infected frost rounds have slowed. Plugs into the weapon system as
 * its `WeaponModHook`.
 */
export class WeaponMods implements WeaponModHook {
  /** Called with each infected a frosted round slows (the frost's glint), and while it stays slowed (`still`). */
  onFrost: ((z: Zombie, still: boolean) => void) | null = null;
  /** An infected is frosted (`on`), or thawed: its ice is shown or taken off (`modsRuntime.ts`). */
  onChill: ((z: Zombie, on: boolean) => void) | null = null;
  /** Co-op: a frosted infected is stopped stiff for a moment instead (the host walks the infected). */
  onStiff: ((z: Zombie, seconds: number) => void) | null = null;
  /** The frost's slow is applied (false in co-op: the host walks the infected). */
  slows = true;
  private on = new WeakMap<CarriedWeapon, number>();
  private readonly chill = new Map<Zombie, { until: number; pace: number; glint: number }>();
  private t = 0;

  reset(): void {
    this.on = new WeakMap();
    this.thaw(true);
    this.t = 0;
  }

  /** The mods gun `c` wears, one bit each (`MOD`). */
  mask(c: CarriedWeapon | null): number {
    return c ? (this.on.get(c) ?? 0) : 0;
  }

  /** How many infected are frosted right now (for the checks). */
  get frosted(): number {
    return this.chill.size;
  }

  /**
   * Fit mod `i` to `c`. A big magazine lengthens its loads at once, and the load in it is topped up from its own
   * rounds so the count is seen to jump.
   */
  fit(c: CarriedWeapon, i: number): void {
    this.on.set(c, this.mask(c) | (1 << i));
    if (i === MOD.drum && !c.ammo.reload) {
      c.ammo.magSize = drumMag(c);
      const add = Math.max(0, Math.min(c.ammo.reserve, c.ammo.magSize - c.ammo.mag));
      c.ammo.mag += add;
      c.ammo.reserve -= add;
    } else if (i === MOD.drum) c.ammo.magSize = drumMag(c);
  }

  /** Every frame: a big magazine's longer loads kept through an upgrade (which sets a load back to the tier's own), and the frost. */
  update(dt: number, slots: readonly (CarriedWeapon | null)[]): void {
    this.t += dt;
    for (const c of slots) if (c && this.mask(c) & (1 << MOD.drum) && c.ammo.magSize !== drumMag(c)) c.ammo.magSize = drumMag(c);
    this.thaw(false);
    // the frost on each slowed infected glitters while it lasts
    for (const [z, c] of this.chill) {
      if (this.t < c.glint) continue;
      c.glint = this.t + MOD_TUNE.frostGlint;
      this.onFrost?.(z, true);
    }
  }

  // ---- WeaponModHook ----

  damageMul(_c: CarriedWeapon): number {
    return 1;
  }

  shot(_c: CarriedWeapon): void {}

  hit(z: Zombie, c: CarriedWeapon): void {
    if (!(this.mask(c) & (1 << MOD.frost)) || !z.alive) return;
    const until = this.t + MOD_TUNE.frostTime;
    const had = this.chill.get(z);
    if (had) had.until = until;
    else {
      const pace = z.speedScale * (z.isBoss ? MOD_TUNE.frostPaceBoss : MOD_TUNE.frostPace);
      this.chill.set(z, { until, pace, glint: this.t + MOD_TUNE.frostGlint });
      if (this.slows) z.speedScale = pace;
      else if (!z.isBoss) this.onStiff?.(z, MOD_TUNE.frostStiff);
      this.onChill?.(z, true);
      this.onFrost?.(z, false);
    }
  }

  /** Give back the pace of every slowed infected whose frost has worn off (all of them, with `all`). */
  private thaw(all: boolean): void {
    for (const [z, c] of this.chill) {
      if (!all && c.until > this.t && z.alive) continue;
      // (a body that has been dealt out again since has a pace of its own: leave it)
      if (this.slows && z.speedScale === c.pace) z.speedScale = c.pace / (z.isBoss ? MOD_TUNE.frostPaceBoss : MOD_TUNE.frostPace);
      this.onChill?.(z, false);
      this.chill.delete(z);
    }
  }
}

/** How many mod parts the squad holds (for the HUD and the journal). */
export const partsHeld = (v: StoryView): number => ZaryaStory.modParts(v);
