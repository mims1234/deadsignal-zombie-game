/**
 * Co-op wave survival (pure). The run is a fixed number of waves with a break between them. A wave ends when
 * everything it spawned is dead; players who went down come back at the start of the next break. The run is lost
 * only when every player is down at the same moment, and won when the last wave is cleared.
 */
import { COOP } from '../config';
import type { ZombieType } from '../types';

export type WavePhase = 'break' | 'active' | 'won' | 'lost';

export interface WaveState {
  /** Current wave, 1-based (0 before the first one starts). */
  n: number;
  phase: WavePhase;
  /** Seconds until the next wave starts (break only). */
  breakLeft: number;
  /** Infected of this wave not yet spawned. */
  toSpawn: number;
  /** The wave's boss has not been spawned yet. */
  bossPending: boolean;
}

export function createWaves(): WaveState {
  return { n: 0, phase: 'break', breakLeft: COOP.firstBreak, toSpawn: 0, bossPending: false };
}

/** Infected in wave `n` for `players` players. */
export function waveSize(n: number, players: number): number {
  const p = Math.max(1, Math.min(COOP.maxPlayers, players));
  return Math.round((COOP.baseSize + COOP.sizePerWave * (n - 1)) * (0.55 + 0.45 * p));
}

/** Health multiplier for wave `n`. */
export function waveHpScale(n: number): number {
  return 1 + COOP.hpPerWave * (n - 1);
}

export function isBossWave(n: number): boolean {
  return n > 0 && n % COOP.bossEvery === 0;
}

/** Which infected a spawn of wave `n` is, from a roll in [0, 1). Later waves bring runners, then armour. */
export function waveType(n: number, roll: number): Exclude<ZombieType, 'warden'> {
  const armored = n >= 4 ? Math.min(0.22, 0.05 * (n - 3)) : 0;
  const runner = n >= 2 ? Math.min(0.4, 0.1 * (n - 1)) : 0;
  if (roll < armored) return 'armored';
  if (roll < armored + runner) return 'runner';
  return 'shambler';
}

export type WaveEvent = 'wave-start' | 'wave-clear' | 'won' | 'lost';

/**
 * Advance the waves. `alive` is how many infected of the wave are still standing, `playersUp` how many players
 * are, and `players` how many are in the session. Returns what happened this step, if anything.
 */
export function stepWaves(w: WaveState, dt: number, alive: number, playersUp: number, players: number): WaveEvent | null {
  if (w.phase === 'won' || w.phase === 'lost') return null;
  if (w.phase === 'break') {
    w.breakLeft -= dt;
    if (w.breakLeft > 0) return null;
    w.n++;
    w.phase = 'active';
    w.breakLeft = 0;
    w.toSpawn = waveSize(w.n, players);
    w.bossPending = isBossWave(w.n);
    return 'wave-start';
  }
  if (players > 0 && playersUp === 0) {
    w.phase = 'lost';
    return 'lost';
  }
  if (w.toSpawn > 0 || w.bossPending || alive > 0) return null;
  if (w.n >= COOP.waves) {
    w.phase = 'won';
    return 'won';
  }
  w.phase = 'break';
  w.breakLeft = COOP.breakTime;
  return 'wave-clear';
}
