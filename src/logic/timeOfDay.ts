/**
 * Time of day on the Asylum (pure: no THREE, no DOM). Everything is a function of the mission's elapsed seconds and
 * of when the helicopter was called, so the browser game, the co-op simulation and every co-op client agree on the
 * hour without sending it.
 *
 *  - `timeOfDay(elapsed, calledAt)`  the phase (DAY, DUSK, NIGHT, DAWN), how dark it is, where the sun or moon is;
 *  - `phaseTuning(tod)` / `combineTuning(difficulty, phase)`  how the infected change with the light, on top of the
 *    difficulty (never instead of it);
 *  - `gateHunt(hunt, elapsed)`  the Matron's hunt is only open at night.
 */
import { ASYLUM_CYCLE, DAWN_RELIEF, NIGHTFALL, PHASE_TUNING, type PhaseTuning } from '../asylum/nightConfig';
import type { HuntContract } from './contracts';

export type DayPhase = 'day' | 'dusk' | 'night' | 'dawn';
export type { PhaseTuning };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TimeOfDay {
  phase: DayPhase;
  /** 0..1 through the current phase (day: toward dusk; dusk: toward night; night: 0; dawn: toward first light). */
  t: number;
  /** 0 full daylight .. 1 full night: what the infected follow. */
  dark: number;
  /** Seconds until the next change (nightfall during day and dusk, first light during dawn), or -1 at night. */
  next: number;
  /** 1 while the sun is the key light, 0 while the moon is (crosses 0.5 mid-dusk and mid-dawn). */
  sun: number;
  /** Unit vector toward the sun (meaningful while `sun` > 0). */
  sunDir: Vec3;
}

/** Toward the moon: the same direction every map's blue-hour moon uses (`render/stage.ts`). */
export const MOON_DIR: Vec3 = normalize({ x: -0.42, y: 0.72, z: -0.55 });

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** A direction from a compass angle (radians, measured from +X toward +Z) and an elevation above the horizon. */
function fromAngles(azimuth: number, elevation: number): Vec3 {
  const c = Math.cos(elevation);
  return { x: Math.cos(azimuth) * c, y: Math.sin(elevation), z: Math.sin(azimuth) * c };
}

/** The sun sets in the west-south-west (where the blue hour's afterglow is) and rises in the east-north-east. */
const SET_AZIMUTH = Math.atan2(0.45, -0.85);
const RISE_AZIMUTH = Math.atan2(-0.45, 0.85);

/**
 * When the dawn starts: the moment the helicopter was called, never before nightfall (the call needs the Matron dead,
 * and she only walks at night). null: no dawn yet.
 */
export function dawnStart(calledAt: number | null, cycle = ASYLUM_CYCLE): number | null {
  if (calledAt === null) return null;
  return Math.max(calledAt, cycle.dayEnd + cycle.duskLength);
}

export function timeOfDay(elapsed: number, calledAt: number | null = null, cycle = ASYLUM_CYCLE): TimeOfDay {
  const e = Math.max(0, elapsed);
  const nightfall = cycle.dayEnd + cycle.duskLength;
  const dawn0 = dawnStart(calledAt, cycle);
  if (dawn0 !== null && e >= dawn0) {
    const t = clamp01((e - dawn0) / cycle.dawnLength);
    // the sun comes up out of the pines behind the gatehouse
    const sun = smooth((t - 0.25) / 0.5);
    return { phase: 'dawn', t, dark: 1 - DAWN_RELIEF * smooth(t), next: Math.max(0, dawn0 + cycle.dawnLength - e), sun, sunDir: fromAngles(RISE_AZIMUTH, lerp(-0.06, 0.16, t)) };
  }
  if (e < cycle.dayEnd) {
    const t = e / cycle.dayEnd;
    // late afternoon: the sun sinks from a third of the way up the sky toward the treeline
    return { phase: 'day', t, dark: 0, next: nightfall - e, sun: 1, sunDir: fromAngles(SET_AZIMUTH + 0.35 * (1 - t), lerp(0.62, 0.2, t)) };
  }
  if (e < nightfall) {
    const t = (e - cycle.dayEnd) / cycle.duskLength;
    return { phase: 'dusk', t, dark: smooth(t), next: nightfall - e, sun: 1 - smooth((t - 0.3) / 0.4), sunDir: fromAngles(SET_AZIMUTH, lerp(0.2, -0.08, t)) };
  }
  return { phase: 'night', t: 0, dark: 1, next: -1, sun: 0, sunDir: fromAngles(SET_AZIMUTH, -0.08) };
}

/** The phase alone (cheap enough for a per-tick check in the simulation). */
export function dayPhase(elapsed: number, calledAt: number | null = null, cycle = ASYLUM_CYCLE): DayPhase {
  return timeOfDay(elapsed, calledAt, cycle).phase;
}

export const IDENTITY_TUNING: PhaseTuning = { hp: 1, damage: 1, speed: 1, sight: 1, count: 1 };

/** The infected at this hour: the day's values in daylight, the night's in the dark, blended through dusk and dawn. */
export function phaseTuning(tod: Pick<TimeOfDay, 'dark'>): PhaseTuning {
  const d = PHASE_TUNING.day;
  const n = PHASE_TUNING.night;
  const k = clamp01(tod.dark);
  return { hp: lerp(d.hp, n.hp, k), damage: lerp(d.damage, n.damage, k), speed: lerp(d.speed, n.speed, k), sight: lerp(d.sight, n.sight, k), count: lerp(d.count, n.count, k) };
}

/** The difficulty's tuning with the time of day on top (every multiplier multiplied; labels kept). */
export function combineTuning<T extends PhaseTuning>(base: T, phase: PhaseTuning): T {
  return { ...base, hp: base.hp * phase.hp, damage: base.damage * phase.damage, speed: base.speed * phase.speed, sight: base.sight * phase.sight, count: base.count * phase.count };
}

/** The Matron only walks after dark: her hunt is open from nightfall on. */
export function huntOpen(elapsed: number, cycle = ASYLUM_CYCLE): boolean {
  return elapsed >= cycle.dayEnd + cycle.duskLength;
}

/**
 * Keep the hunt in step with the light: closed (`available`, no target on the map) by day, opened (`active`) at
 * nightfall. A finished hunt is never touched. Returns true on the tick she wakes.
 */
export function gateHunt(h: HuntContract, elapsed: number, cycle = ASYLUM_CYCLE): boolean {
  if (h.status === 'complete') return false;
  if (!huntOpen(elapsed, cycle)) {
    h.status = 'available';
    h.identified = false;
    return false;
  }
  if (h.status === 'available') {
    h.status = 'active';
    return true;
  }
  return false;
}

export { NIGHTFALL };
