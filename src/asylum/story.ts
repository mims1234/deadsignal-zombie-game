/**
 * Blackwood Hill's story in steps (pure: no THREE, no DOM). The browser game (`nightRuntime.ts`) and the co-op
 * simulation (`sim/serverHost.ts`) read the same rules, so every screen agrees on what to do next, on the hour and on
 * the black fog from a handful of shared facts.
 *
 *    1 THE ADMIN OFFICES   the Lantern Program memo (front grounds)
 *    2 THE WEST WARD       Ellie Crane's admission card (a west ward cell)
 *    3 THE NURSES' FLOOR   the Matron's day book (upstairs in the west ward, up the fire escape in the yard)
 *    4 THE POWER           start the generators in the boiler house yard and hold while they spin up
 *    5 WARD NINE           the night register (upstairs in the east ward; its door needs the power)
 *    6 THE MORGUE          Orderly Byrne's last log (the back walk)
 *    7 THE VIGIL LANTERNS  three lanterns (the cemetery, Ward Nine, the isolation block's door) burn on the infected
 *                          killed beside them; any time, in any order (`LANTERNS`)
 *    8 THE CHAPEL BELL     ring lights-out when you are ready: the Matron wakes and starts her round
 *    9 THE MATRON          put her to rest (her keys open the damper)
 *   10 THE FURNACE         shut the crematorium's damper: the black fog stops for good
 *   11 FIRST LIGHT         call the bird from the lawn and hold until dawn
 *
 * It is night on the hill from the first second (`asylumHour`); the helicopter's call brings the dawn. There is no
 * deadline. The infected are restless until the bell (`TUNING.restless`), then the full night (`TUNING.awake`). The
 * black fog comes in waves from the stack (`FOG`) until the damper is shut (`fogStopAt`).
 */
import { phaseTuning, timeOfDay, type PhaseTuning, type TimeOfDay } from '../logic/timeOfDay';
import { FOG, LANTERNS, NIGHTFALL, TUNING } from './nightConfig';

export type StepId = 'office' | 'westWard' | 'nurses' | 'power' | 'nine' | 'morgue' | 'lanterns' | 'bell' | 'matron' | 'furnace' | 'dawn';
export const STEPS: readonly StepId[] = ['office', 'westWard', 'nurses', 'power', 'nine', 'morgue', 'lanterns', 'bell', 'matron', 'furnace', 'dawn'];

/** The patient files, by name (indices into `RECORDS.spots`). */
export const FILE = { admin: 0, ward: 1, nurses: 2, nine: 3, morgue: 4 } as const;

/** What has been done (everything the story's step follows from). */
export interface StoryFacts {
  /** The files taken, in `RECORDS.spots` order. */
  records: readonly boolean[];
  /** The generators are running (RESTORE THE POWER complete). */
  power: boolean;
  /** What each vigil lantern has burned (in `LANTERNS.spots` order). */
  souls: readonly number[];
  /** The chapel bell has been rung (the Matron is awake). */
  bell: boolean;
  /** The Matron is at rest. */
  matron: boolean;
  /** The furnace damper is shut. */
  damper: boolean;
}

/** A lantern is burning. */
export function lanternLit(souls: readonly number[], i: number): boolean {
  return (souls[i] ?? 0) >= LANTERNS.souls;
}

/** How many lanterns burn. */
export function lanternsLit(souls: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < LANTERNS.spots.length; i++) if (lanternLit(souls, i)) n++;
  return n;
}

/**
 * The lantern a kill at (x, y, z) feeds: the nearest one still unlit within `LANTERNS.radius` on the same floor; else one
 * a player is keeping vigil at (standing within `LANTERNS.vigil` of it) with the kill within `LANTERNS.vigilReach` of
 * it; or -1. (The caller adds the soul: `souls[i]++`.)
 */
export function lanternFor(souls: readonly number[], x: number, y: number, z: number, keepers: readonly { x: number; y: number; z: number }[] = []): number {
  let best = -1;
  let bestD = LANTERNS.radius;
  const ky = Number.isFinite(y) ? y : 0;
  for (let i = 0; i < LANTERNS.spots.length; i++) {
    if (lanternLit(souls, i)) continue;
    const s = LANTERNS.spots[i]!;
    if (Math.abs(ky - s.y) > 2.5) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0) return best;
  // the vigil: a keeper beside a dark lantern, and the kill (the squad's, most likely) out in the approach to it
  bestD = LANTERNS.vigilReach;
  for (let i = 0; i < LANTERNS.spots.length; i++) {
    if (lanternLit(souls, i)) continue;
    const s = LANTERNS.spots[i]!;
    if (Math.abs(ky - s.y) > 2.5) continue;
    if (!keepers.some((k) => Math.abs((Number.isFinite(k.y) ? k.y : 0) - s.y) <= 2.5 && Math.hypot(k.x - s.x, k.z - s.z) <= LANTERNS.vigil)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Should the squad hold fire on the infected at (x, y, z)? Only near a dark lantern: a keeper within
 * `LANTERNS.radius + LANTERNS.holdNear` of an unlit one on its floor, the kill would feed no lantern, and the infected is
 * not within `LANTERNS.holdClose` of the ally at (ax, az) or of any keeper. Then it walks into the circle first.
 */
export function squadHoldsFire(souls: readonly number[], x: number, y: number, z: number, ax: number, az: number, keepers: readonly { x: number; y: number; z: number }[]): boolean {
  if (keepers.length === 0) return false;
  const near = LANTERNS.spots.some((s, i) => !lanternLit(souls, i) && keepers.some((k) => Math.abs((Number.isFinite(k.y) ? k.y : 0) - s.y) <= 2.5 && Math.hypot(k.x - s.x, k.z - s.z) <= LANTERNS.radius + LANTERNS.holdNear));
  if (!near) return false;
  if (lanternFor(souls, x, y, z, keepers) >= 0) return false;
  if (Math.hypot(x - ax, z - az) < LANTERNS.holdClose) return false;
  return !keepers.some((k) => Math.hypot(x - k.x, z - k.z) < LANTERNS.holdClose);
}

/** The first step not done yet (index into `STEPS`; `STEPS.length - 1` once only the dawn is left). */
export function storyStep(f: StoryFacts): number {
  const r = (i: number): boolean => !!f.records[i];
  const lit = lanternsLit(f.souls) >= LANTERNS.spots.length;
  // the bell (and the lanterns before it) are done once she is awake, or at rest
  const done = [r(FILE.admin), r(FILE.ward), r(FILE.nurses), f.power, r(FILE.nine), r(FILE.morgue), lit || f.bell || f.matron, f.bell || f.matron, f.matron, f.damper];
  const i = done.findIndex((d) => !d);
  return i < 0 ? STEPS.length - 1 : i;
}

/** The bell can be rung: every lantern burns and she is still asleep. */
export function bellReady(f: Pick<StoryFacts, 'souls' | 'bell' | 'matron'>): boolean {
  return !f.bell && !f.matron && lanternsLit(f.souls) >= LANTERNS.spots.length;
}

/** The damper can be turned once the Matron is at rest (her keys). */
export function damperOpen(f: Pick<StoryFacts, 'matron' | 'damper'>): boolean {
  return f.matron && !f.damper;
}

/** The hunt's clock: closed until the bell (`gateHunt` opens it from `NIGHTFALL`). */
export function huntClock(wakeAt: number | null): number {
  return wakeAt !== null && Number.isFinite(wakeAt) ? NIGHTFALL : 0;
}

/** The hour on Blackwood Hill: night from the start; the helicopter's call brings the dawn. */
export function asylumHour(elapsed: number, calledAt: number | null): TimeOfDay {
  const e = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const called = calledAt !== null && Number.isFinite(calledAt) ? NIGHTFALL + Math.max(0, calledAt) : null;
  return timeOfDay(NIGHTFALL + e, called);
}

/** How the infected are now: restless until the bell, the full night after it, easing as the dawn comes. */
export function asylumTuning(tod: TimeOfDay, awake: boolean): PhaseTuning {
  if (tod.phase === 'dawn') return phaseTuning(tod);
  return awake ? TUNING.awake : TUNING.restless;
}

// ---------------------------------------------------------------------------------------------
// the black fog
// ---------------------------------------------------------------------------------------------

export type FogPhase = 'calm' | 'rise' | 'hold' | 'fall';

export interface FogState {
  /** Which wave (0 the first; -1 before it). */
  wave: number;
  phase: FogPhase;
  /** How far it reaches now (m from the stack; 0 when calm). */
  radius: number;
  /** Seconds until the next wave leaves the stack (Infinity once the damper is shut). */
  next: number;
  /** The damper is shut: no more waves. */
  stopped: boolean;
}

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** The waves alone (no damper). */
function wave(e: number): FogState {
  if (e < FOG.first) return { wave: -1, phase: 'calm', radius: 0, next: FOG.first - e, stopped: false };
  const i = Math.floor((e - FOG.first) / FOG.period);
  const local = e - FOG.first - i * FOG.period;
  const reach = Math.min(FOG.reachMax, FOG.reach0 + i * FOG.reachStep);
  const next = FOG.period - local;
  if (local < FOG.rise) return { wave: i, phase: 'rise', radius: reach * smooth(local / FOG.rise), next, stopped: false };
  if (local < FOG.rise + FOG.hold) return { wave: i, phase: 'hold', radius: reach, next, stopped: false };
  if (local < FOG.rise + FOG.hold + FOG.fall) return { wave: i, phase: 'fall', radius: reach * (1 - smooth((local - FOG.rise - FOG.hold) / FOG.fall)), next, stopped: false };
  return { wave: i, phase: 'calm', radius: 0, next, stopped: false };
}

/** The black fog at `elapsed`; once the damper is shut (`stopAt`) it falls back and never comes again. */
export function fogAt(elapsed: number, stopAt: number | null): FogState {
  const e = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  if (stopAt === null || !Number.isFinite(stopAt) || e < stopAt) return wave(e);
  const w = wave(stopAt);
  const k = 1 - smooth((e - stopAt) / FOG.stopFall);
  return { wave: w.wave, phase: k > 0 && w.radius > 0 ? 'fall' : 'calm', radius: w.radius * k, next: Infinity, stopped: true };
}

/** Is (x, z) inside the fog. */
export function inFog(x: number, z: number, stack: { x: number; z: number }, radius: number): boolean {
  if (radius <= 0) return false;
  return (x - stack.x) ** 2 + (z - stack.z) ** 2 < radius * radius;
}
