/** Mission clock, escalation phases and the contamination front (pure). */
import { ASYLUM_CLOCK } from '../asylum/nightConfig';
import { FORGE_STORY, MISSION, MUJIN_CLOCK, SAKURA_CLOCK } from '../config';
import type { MapId } from '../world/layout/data';

/**
 * The timings a run is held to. Every map uses `MISSION`'s except the Asylum, whose night needs longer
 * (`asylum/nightConfig.ts`), the Forge, which is twice the size with a story to get through (`FORGE_STORY`), and the
 * Sakura District (`SAKURA_CLOCK`: longer again for KAIKA, `kind` 'kaika'). Each function below takes one and defaults
 * to `MISSION`.
 */
export interface MissionClock {
  deadline: number;
  surgeStart: number;
  phases: readonly number[];
}

export function missionClock(map: MapId, kind?: string | null): MissionClock {
  if (map === 'sakura') return kind === 'kaika' ? SAKURA_CLOCK.kaika : SAKURA_CLOCK.operation;
  if (map === 'mujin') return MUJIN_CLOCK;
  return map === 'asylum' ? ASYLUM_CLOCK : map === 'forge' ? FORGE_STORY.clock : MISSION;
}

/** 0 before the first escalation threshold, then 1..3. */
export function escalationPhase(elapsed: number, clock: MissionClock = MISSION): number {
  let p = 0;
  for (const t of clock.phases) if (elapsed >= t) p++;
  return p;
}

/** Elapsed time at which the contamination surge begins. Calling extraction early starts it early. */
export function surgeStartTime(calledAt: number | null, clock: MissionClock = MISSION): number {
  return calledAt === null ? clock.surgeStart : Math.min(clock.surgeStart, calledAt);
}

export function surgeActive(elapsed: number, calledAt: number | null, clock: MissionClock = MISSION): boolean {
  return elapsed >= surgeStartTime(calledAt, clock);
}

/**
 * Radius of the toxic zone around the contamination source, or 0 before the surge.
 * The front reaches the LZ exactly at the mission deadline; once an extraction is underway it stalls short of the LZ.
 */
export function hazardRadius(elapsed: number, calledAt: number | null, extractionActive: boolean, distanceToLz: number, clock: MissionClock = MISSION): number {
  const start = surgeStartTime(calledAt, clock);
  if (elapsed < start) return 0;
  const span = Math.max(1, clock.deadline - start);
  const p = Math.min(1, (elapsed - start) / span);
  const r0 = MISSION.hazard.startRadius;
  const rEnd = distanceToLz + 8;
  let r = r0 + (rEnd - r0) * Math.pow(p, 1.25);
  if (extractionActive) r = Math.min(r, distanceToLz - MISSION.hazard.lzStandoff);
  return Math.max(r0, r);
}

export function isInsideHazard(x: number, z: number, cx: number, cz: number, radius: number): boolean {
  if (radius <= 0) return false;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

/** Seconds left before the district is sealed (last chance to call extraction). */
export function deadlineRemaining(elapsed: number, clock: MissionClock = MISSION): number {
  return Math.max(0, clock.deadline - elapsed);
}
