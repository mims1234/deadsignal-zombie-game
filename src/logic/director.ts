/** Spawn-director rules (pure): caps, intervals and composition by threat region and mission phase. */
import { QUALITY, REGIONS, SPAWN } from '../config';
import type { QualityLevel, Region } from '../types';
import type { Rng } from './rng';

export type SpawnType = 'shambler' | 'runner' | 'armored';

/** Soft cap on simultaneously active (awake) enemies for the region the player is in. */
export function activeCap(region: Region, phase: number, quality: QualityLevel): number {
  const base = REGIONS[region].activeCap * (1 + SPAWN.phaseCapGain * phase);
  return Math.max(4, Math.min(Math.round(base), QUALITY[quality].maxEnemies, SPAWN.hardCap));
}

/**
 * Lite keeps the same threat with fewer infected alive at once: where its cap cuts below Low's, each ambient infected
 * gets some extra health and the gaps refill sooner. `hp` multiplies their health, `interval` the ambient spawn
 * interval; both are 1 wherever the cap does not bite (and on every other preset).
 */
export function liteOffset(region: Region, phase: number, quality: QualityLevel): { hp: number; interval: number } {
  const cut = activeCap(region, phase, 'low') / activeCap(region, phase, quality);
  if (cut <= 1) return { hp: 1, interval: 1 };
  return { hp: 1 + (cut - 1) * 0.5, interval: 1 / Math.sqrt(cut) };
}

export function spawnInterval(region: Region, phase: number): number {
  return REGIONS[region].spawnInterval * Math.pow(SPAWN.phaseIntervalMul, phase);
}

export function compositionWeights(region: Region, phase: number): Record<SpawnType, number> {
  const mix = REGIONS[region].mix;
  const w: Record<SpawnType, number> = {
    shambler: mix.shambler,
    runner: mix.runner + (mix.runner > 0 ? SPAWN.phaseRunnerGain * phase : 0),
    armored: mix.armored + (mix.armored > 0 ? SPAWN.phaseArmoredGain * phase : 0),
  };
  // low threat never spawns armoured infected
  if (mix.armored === 0) w.armored = 0;
  return w;
}

export function pickSpawnType(region: Region, phase: number, rng: Rng): SpawnType {
  const w = compositionWeights(region, phase);
  const total = w.shambler + w.runner + w.armored;
  let r = rng.f() * total;
  if ((r -= w.shambler) < 0) return 'shambler';
  if ((r -= w.runner) < 0) return 'runner';
  return 'armored';
}
