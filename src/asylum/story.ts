/**
 * Blackwood Hill's story in steps (pure: no THREE, no DOM). The browser game (`nightRuntime.ts`) and the co-op
 * simulation (`sim/serverHost.ts`) read the same rules, so every screen agrees on what to do next, on the hour and on
 * the black fog from a handful of shared facts.
 *
 *   1 THE ADMIN OFFICES   the Lantern Program memo (front grounds)
 *   2 THE WEST WARD       Ellie Crane's admission card (a west ward cell)
 *   3 THE NURSES' FLOOR   the Matron's day book (upstairs in the west ward, up the fire escape in the yard)
 *   4 THE POWER           start the generators in the boiler house yard and hold while they spin up
 *   5 WARD NINE           the night register (upstairs in the east ward; its door needs the power). The sun goes.
 *   6 THE MORGUE          Orderly Byrne's last log (the back walk)
 *   7 THE ISOLATION BLOCK the Matron walks after dark: put her to rest (her keys open the damper)
 *   8 THE FURNACE         shut the crematorium's damper: the black fog stops for good
 *   9 FIRST LIGHT         call the bird from the lawn and hold until dawn
 *
 * There is no deadline. The light holds at late afternoon until Ward Nine's register is read (`nightAt`); then dusk
 * and night follow on the usual cycle (`logic/timeOfDay.ts`, fed a shifted clock). The black fog comes in waves from
 * the stack (`FOG`) until the damper is shut (`fogStopAt`).
 */
import { timeOfDay, type TimeOfDay } from '../logic/timeOfDay';
import { ASYLUM_CYCLE, FOG } from './nightConfig';

export type StepId = 'office' | 'westWard' | 'nurses' | 'power' | 'nine' | 'morgue' | 'matron' | 'furnace' | 'dawn';
export const STEPS: readonly StepId[] = ['office', 'westWard', 'nurses', 'power', 'nine', 'morgue', 'matron', 'furnace', 'dawn'];

/** The patient files, by name (indices into `RECORDS.spots`). */
export const FILE = { admin: 0, ward: 1, nurses: 2, nine: 3, morgue: 4 } as const;

/** What has been done (everything the story's step follows from). */
export interface StoryFacts {
  /** The files taken, in `RECORDS.spots` order. */
  records: readonly boolean[];
  /** The generators are running (RESTORE THE POWER complete). */
  power: boolean;
  /** The Matron is at rest. */
  matron: boolean;
  /** The furnace damper is shut. */
  damper: boolean;
}

/** The first step not done yet (index into `STEPS`; `STEPS.length - 1` once only the dawn is left). */
export function storyStep(f: StoryFacts): number {
  const r = (i: number): boolean => !!f.records[i];
  const done = [r(FILE.admin), r(FILE.ward), r(FILE.nurses), f.power, r(FILE.nine), r(FILE.morgue), f.matron, f.damper];
  const i = done.findIndex((d) => !d);
  return i < 0 ? STEPS.length - 1 : i;
}

/** Ward Nine's register read: the moment the sun starts going down. */
export function nightTrigger(f: StoryFacts): boolean {
  return !!f.records[FILE.nine];
}

/** The damper can be turned once the Matron is at rest (her keys). */
export function damperOpen(f: Pick<StoryFacts, 'matron' | 'damper'>): boolean {
  return f.matron && !f.damper;
}

/** The light holds here (seconds into the day cycle) until the night is triggered: a low sun over the pines. */
const DAY_HOLD = ASYLUM_CYCLE.dayEnd * 0.82;

/**
 * The cycle's clock for this moment: the held afternoon, or (after `nightAt`) dusk, night and dawn as the cycle runs
 * them. What the hunt gate and the infected's tuning follow.
 */
export function cycleClock(elapsed: number, nightAt: number | null): number {
  const e = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  if (nightAt === null || !Number.isFinite(nightAt)) return Math.min(e, DAY_HOLD);
  return ASYLUM_CYCLE.dayEnd + Math.max(0, e - nightAt);
}

/** The hour on Blackwood Hill (`timeOfDay` on the story's clock; the call time shifted the same way). */
export function asylumHour(elapsed: number, nightAt: number | null, calledAt: number | null): TimeOfDay {
  const v = cycleClock(elapsed, nightAt);
  const called = calledAt !== null && nightAt !== null && Number.isFinite(calledAt) ? ASYLUM_CYCLE.dayEnd + Math.max(0, calledAt - nightAt) : null;
  return timeOfDay(v, called);
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
