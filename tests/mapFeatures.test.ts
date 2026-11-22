import { describe, expect, it } from 'vitest';
import { MISSION, SQUADS } from '../src/config';
import { squadEquals, squadRoster } from '../src/game/allyBrain';
import { MAP_FEATURES, mapFeatures } from '../src/logic/mapFeatures';
import { missionClock, NO_CLOCK } from '../src/logic/mission';
import { MAP_IDS } from '../src/world/layout/data';

describe('per-map feature switches', () => {
  it('ZARYA keeps every switch on and hands out its own loadout', () => {
    const z = mapFeatures('zarya');
    expect(z).toMatchObject({ melee: true, arsenal: true, compactPhone: true, noClock: true, squadRegroup: true, nearTags: true });
    expect(z.start).toBeUndefined();
    expect(missionClock('zarya')).toBe(NO_CLOCK);
  });

  it('HIRASAKA takes them up: no clock, a pistol and a knife', () => {
    const h = mapFeatures('hirasaka');
    expect(h).toMatchObject({ melee: true, arsenal: true, compactPhone: true, noClock: true });
    expect(h.start).toEqual({ guns: ['pistol'], melee: 'knife' });
    expect(missionClock('hirasaka')).toBe(NO_CLOCK);
    expect(missionClock('hirasaka').deadline).toBe(Number.POSITIVE_INFINITY);
  });

  it('every other map has every switch off and its old clock', () => {
    for (const m of MAP_IDS) {
      if (m === 'zarya' || m === 'hirasaka') continue;
      expect(MAP_FEATURES[m]).toBeUndefined();
      expect(Object.values(mapFeatures(m)).some(Boolean)).toBe(false);
    }
    expect(missionClock('district')).toBe(MISSION);
    expect(missionClock('mujin')).not.toBe(NO_CLOCK);
  });

  it("HIRASAKA's squad: Natsuki and Daigo as equals; co-op players take Daigo's seat first", () => {
    expect(squadEquals('hirasaka')).toBe(true);
    expect(SQUADS.hirasaka?.names).toEqual(['Natsuki', 'Daigo']);
    expect(squadRoster('hirasaka', 1)).toEqual(['Natsuki', 'Daigo']);
    expect(squadRoster('hirasaka', 2)).toEqual(['Natsuki']);
    expect(squadRoster('hirasaka', 3)).toEqual([]);
    expect(squadRoster('zarya', 3)).toEqual(['Timur', 'Vera']);
  });
});
