/**
 * The Sakura District's story missions (`sakura/missions.ts`) as co-op session kinds: each comes in at its own start,
 * settles one contract before it begins, and peoples the district its own way; the operation is untouched by them.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { STORIES, STORY_IDS } from '../src/sakura/missions';
import { SessionSim } from '../src/sim/serverHost';

const run = (kind: 'mission' | (typeof STORY_IDS)[number]) => {
  const sim = new SessionSim({ seed: 4, kind, map: 'sakura', send() {} });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  return sim;
};

describe('the Sakura District story missions', { timeout: 30000 }, () => {
  for (const id of STORY_IDS.filter((k) => !STORIES[k].campaign)) {
    it(`${id}: its own start, one contract settled, its own people`, () => {
      const sim = run(id);
      const s = STORIES[id];
      const st = sim.level.data.playerStart;
      expect([st.x, st.z]).toEqual([s.start!.x, s.start!.z]);
      const { defense, hunt } = sim.debug as unknown as { defense: { status: string }; hunt: { status: string } };
      if (s.settled === 'defense') {
        expect(defense.status).toBe('complete');
        expect(hunt.status).toBe('active');
        expect(sim.zombies.boss).not.toBeNull();
      } else {
        expect(hunt.status).toBe('complete');
        expect(defense.status).not.toBe('complete');
        expect(sim.zombies.boss).toBeNull();
      }
      const kinds = sim.zombies.zombies.map((z) => z.variant);
      if (id === 'curtain') expect(kinds.filter((k) => k === 'court').length).toBeGreaterThanOrEqual(14);
      if (id === 'lasttrain') expect(kinds.filter((k) => k === 'commuter').length).toBeGreaterThanOrEqual(8);
      if (id === 'hanami') expect(kinds.filter((k) => k === 'bloomed').length).toBeGreaterThanOrEqual(10);
      // the squad comes in with the player (one player: both Hanabi girls)
      const allies = (sim as unknown as { allies: { ref: { x: number; z: number } }[] }).allies;
      expect(allies.length).toBe(2);
      for (const a of allies) expect(Math.hypot(a.ref.x - st.x, a.ref.z - st.z)).toBeLessThan(6);
    });
  }

  it('the operation keeps its own start and both contracts open', () => {
    run('curtain');
    const sim = run('mission');
    const st = sim.level.data.playerStart;
    expect([st.x, st.z]).toEqual([-104, 30]);
    const { defense, hunt } = sim.debug as unknown as { defense: { status: string }; hunt: { status: string } };
    expect(defense.status).not.toBe('complete');
    expect(hunt.status).toBe('active');
  });
});
