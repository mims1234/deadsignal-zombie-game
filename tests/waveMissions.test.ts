import { describe, expect, it } from 'vitest';
import { COOP } from '../src/config';
import { blocksWaveEnd, closeMission, createMission, eliteKilled, missionDetail, pickMission, playerWentDown, stepHold, takeCore } from '../src/logic/waveMissions';

const sites = [{ x: 1, z: 2 }, { x: 10, z: 2 }, { x: 20, z: 2 }, { x: 30, z: 2 }];

describe('wave objectives', () => {
  it('skips wave 1 and boss waves, and covers every kind', () => {
    expect(pickMission(1, 0.5)).toBeNull();
    expect(pickMission(COOP.bossEvery, 0.5)).toBeNull();
    const kinds = new Set([0, 0.26, 0.51, 0.76, 0.999].map((r) => pickMission(2, r)));
    expect(kinds).toEqual(new Set(['hold', 'collect', 'elite', 'flawless']));
  });

  it('hold only counts time with someone inside, and blocks the wave until done', () => {
    const m = createMission('hold', 3, sites);
    expect(blocksWaveEnd(m)).toBe(true);
    expect(stepHold(m, 10, 0)).toBe(false);
    expect(m.progress).toBe(0);
    expect(stepHold(m, COOP.mission.holdSeconds - 1, 2)).toBe(false);
    expect(stepHold(m, 2, 1)).toBe(true);
    expect(m.status).toBe('done');
    expect(blocksWaveEnd(m)).toBe(false);
    expect(stepHold(m, 5, 1)).toBe(false);
  });

  it('collect needs every core, each once', () => {
    const m = createMission('collect', 2, sites);
    expect(m.items).toHaveLength(COOP.mission.cores);
    expect(takeCore(m, 0)).toBe(false);
    expect(takeCore(m, 0)).toBe(false); // already taken
    expect(takeCore(m, 9)).toBe(false); // no such core
    expect(takeCore(m, 1)).toBe(false);
    expect(missionDetail(m)).toMatch(/^2 \/ 3/);
    expect(takeCore(m, 2)).toBe(true);
    expect(m.status).toBe('done');
  });

  it('elite completes on the kill and fails if the wave somehow ends first', () => {
    const a = createMission('elite', 2, sites);
    expect(blocksWaveEnd(a)).toBe(false);
    expect(eliteKilled(a)).toBe(true);
    expect(eliteKilled(a)).toBe(false);
    const b = createMission('elite', 2, sites);
    expect(closeMission(b)).toBe(false);
    expect(b.status).toBe('failed');
  });

  it('flawless is won by surviving the wave and lost the moment someone goes down', () => {
    const a = createMission('flawless', 4, sites);
    expect(closeMission(a)).toBe(true);
    expect(a.status).toBe('done');
    const b = createMission('flawless', 4, sites);
    playerWentDown(b);
    expect(b.status).toBe('failed');
    expect(closeMission(b)).toBe(false);
    playerWentDown(createMission('hold', 4, sites)); // only flawless cares
  });

  it('pays more on later waves', () => {
    expect(createMission('hold', 8, sites).reward).toBeGreaterThan(createMission('hold', 2, sites).reward);
  });
});
