import { describe, expect, it, vi } from 'vitest';
import { CARD_MODE } from '../src/config';
import {
  createCarrier,
  downCarrier,
  identifyCarrier,
  purgeCarrier,
  recoverCarrier,
  recoveredCount,
  recoveryReward,
  spreadPick,
  tickCarrier,
} from '../src/logic/carriers';
import { mulberry32 } from '../src/logic/rng';

describe('card carrier side contract', () => {
  it('is identified only inside the reveal range, and only once', () => {
    const c = createCarrier('a');
    expect(identifyCarrier(c, CARD_MODE.revealRange + 1)).toBe(false);
    expect(c.phase).toBe('roaming');
    expect(identifyCarrier(c, CARD_MODE.revealRange - 1)).toBe(true);
    expect(identifyCarrier(c, 1)).toBe(false);
    expect(c.phase).toBe('identified');
  });

  it('cannot be purged or recovered while it is still standing', () => {
    const c = createCarrier('a');
    expect(purgeCarrier(c)).toBe(false);
    expect(recoverCarrier(c)).toBe(false);
    identifyCarrier(c, 5);
    expect(purgeCarrier(c)).toBe(false);
    expect(c.phase).toBe('identified');
  });

  it('goes down, is purged, and pays out exactly once', () => {
    const c = createCarrier('a');
    expect(downCarrier(c)).toBe(true); // straight from roaming: a grenade nobody saw land
    expect(downCarrier(c)).toBe(false);
    expect(c.downLeft).toBe(CARD_MODE.downTime);
    expect(purgeCarrier(c)).toBe(true);
    expect(purgeCarrier(c)).toBe(false);
    expect(recoverCarrier(c)).toBe(true);
    expect(recoverCarrier(c)).toBe(false);
    expect(c.phase).toBe('recovered');
  });

  it('gets back up when the timer runs out, and can be put down again', () => {
    const c = createCarrier('a');
    downCarrier(c);
    expect(tickCarrier(c, CARD_MODE.downTime - 0.5)).toBe(false);
    expect(c.phase).toBe('downed');
    expect(tickCarrier(c, 1)).toBe(true);
    expect(c.phase).toBe('identified');
    expect(tickCarrier(c, 100)).toBe(false);
    expect(purgeCarrier(c)).toBe(false);
    expect(downCarrier(c)).toBe(true);
    expect(c.downs).toBe(2);
    expect(c.downLeft).toBe(CARD_MODE.downTime);
  });

  it('pays the set bonus only with the last card', () => {
    const list = [createCarrier('a'), createCarrier('b')];
    for (const c of list) {
      downCarrier(c);
      purgeCarrier(c);
    }
    recoverCarrier(list[0]!);
    expect(recoveredCount(list)).toBe(1);
    expect(recoveryReward(list)).toBe(CARD_MODE.reward);
    recoverCarrier(list[1]!);
    expect(recoveryReward(list)).toBe(CARD_MODE.reward + CARD_MODE.allBonus);
    expect(recoveryReward([])).toBe(CARD_MODE.reward);
  });
});

describe('spreadPick', () => {
  const grid = Array.from({ length: 25 }, (_, i) => ({ x: (i % 5) * 20, z: Math.floor(i / 5) * 20 }));

  it('returns distinct, well separated spots', () => {
    for (let seed = 1; seed < 20; seed++) {
      const picks = spreadPick(grid, 5, mulberry32(seed));
      expect(new Set(picks).size).toBe(5);
      let nearest = Infinity;
      for (const a of picks) for (const b of picks) if (a !== b) nearest = Math.min(nearest, Math.hypot(grid[a]!.x - grid[b]!.x, grid[a]!.z - grid[b]!.z));
      expect(nearest).toBeGreaterThanOrEqual(40);
    }
  });

  it('copes with too few candidates', () => {
    expect(spreadPick([], 5, Math.random)).toEqual([]);
    expect(spreadPick(grid.slice(0, 2), 5, mulberry32(3)).sort()).toEqual([0, 1]);
    expect(spreadPick(grid, 0, Math.random)).toEqual([]);
  });
});

describe('mode and collection persistence', async () => {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    matchMedia: () => ({ matches: false }),
  });
  const { loadCards, loadMode, saveCards, saveMode } = await import('../src/storage');

  it('defaults to the standard operation and ignores unknown modes', () => {
    expect(loadMode()).toBe('standard');
    saveMode('roam');
    expect(loadMode()).toBe('roam');
    store.set('deadsignal.mode.v1', 'sandbox');
    expect(loadMode()).toBe('standard');
  });

  it('keeps only known card ids and survives corrupt data', () => {
    const known = ['a', 'b', 'c'];
    expect(loadCards(known)).toEqual([]);
    saveCards(['c', 'zzz', 'a', 'a']);
    expect(loadCards(known)).toEqual(['a', 'c']);
    store.set('deadsignal.cards.v1', '{not json');
    expect(loadCards(known)).toEqual([]);
    store.set('deadsignal.cards.v1', '"a"');
    expect(loadCards(known)).toEqual([]);
  });
});
