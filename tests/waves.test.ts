import { describe, expect, it } from 'vitest';
import { COOP } from '../src/config';
import { createWaves, isBossWave, stepWaves, waveHpScale, waveSize, waveType } from '../src/logic/waves';

describe('co-op waves', () => {
  it('starts with a break, then wave 1', () => {
    const w = createWaves();
    expect(stepWaves(w, COOP.firstBreak - 1, 0, 2, 2)).toBeNull();
    expect(w.phase).toBe('break');
    expect(stepWaves(w, 1.5, 0, 2, 2)).toBe('wave-start');
    expect(w.n).toBe(1);
    expect(w.toSpawn).toBe(waveSize(1, 2));
  });

  it('a wave is only cleared when everything spawned is dead', () => {
    const w = createWaves();
    stepWaves(w, 99, 0, 1, 1);
    expect(stepWaves(w, 1, 0, 1, 1)).toBeNull(); // still spawning
    w.toSpawn = 0;
    expect(stepWaves(w, 1, 3, 1, 1)).toBeNull(); // three left alive
    expect(stepWaves(w, 1, 0, 1, 1)).toBe('wave-clear');
    expect(w.phase).toBe('break');
    expect(w.breakLeft).toBe(COOP.breakTime);
  });

  it('is lost only when every player is down at once', () => {
    const w = createWaves();
    stepWaves(w, 99, 0, 3, 3);
    expect(stepWaves(w, 1, 5, 1, 3)).toBeNull(); // one still up
    expect(stepWaves(w, 1, 5, 0, 3)).toBe('lost');
    expect(stepWaves(w, 1, 0, 3, 3)).toBeNull(); // stays lost
    expect(w.phase).toBe('lost');
  });

  it('nobody can lose during a break', () => {
    const w = createWaves();
    expect(stepWaves(w, 1, 0, 0, 2)).toBeNull();
    expect(w.phase).toBe('break');
  });

  it('is won after the last wave', () => {
    const w = createWaves();
    let events = 0;
    for (let i = 0; i < 1000 && w.phase !== 'won'; i++) {
      if (w.phase === 'active') {
        w.toSpawn = 0;
        w.bossPending = false;
      }
      if (stepWaves(w, 30, 0, 1, 1)) events++;
    }
    expect(w.phase).toBe('won');
    expect(w.n).toBe(COOP.waves);
    expect(events).toBe(COOP.waves * 2);
  });

  it('a boss wave waits for its boss', () => {
    const w = createWaves();
    w.n = COOP.bossEvery - 1;
    stepWaves(w, 99, 0, 1, 1);
    expect(isBossWave(w.n)).toBe(true);
    w.toSpawn = 0;
    expect(stepWaves(w, 1, 0, 1, 1)).toBeNull();
    w.bossPending = false;
    expect(stepWaves(w, 1, 0, 1, 1)).not.toBeNull();
  });

  it('grows with the wave number and the player count', () => {
    expect(waveSize(2, 1)).toBeGreaterThan(waveSize(1, 1));
    expect(waveSize(3, 3)).toBeGreaterThan(waveSize(3, 1));
    expect(waveSize(3, 9)).toBe(waveSize(3, COOP.maxPlayers));
    expect(waveHpScale(1)).toBe(1);
    expect(waveHpScale(5)).toBeGreaterThan(1.3);
  });

  it('wave 1 is shamblers only; later waves add runners and armour', () => {
    for (const r of [0, 0.3, 0.99]) expect(waveType(1, r)).toBe('shambler');
    expect(waveType(3, 0.05)).toBe('runner');
    expect(waveType(6, 0.01)).toBe('armored');
    expect(waveType(6, 0.99)).toBe('shambler');
  });
});
