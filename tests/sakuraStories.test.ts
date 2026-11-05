/**
 * The Sakura District's two ways to play as co-op session kinds: the operation and KAIKA both come in at the district's
 * own start, with both contracts open and the Empress at her theatre.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { LIFE, SessionSim } from '../src/sim/serverHost';

const run = (kind: 'mission' | 'kaika') => {
  const sim = new SessionSim({ seed: 4, kind, map: 'sakura', send() {} });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  return sim;
};

describe('the Sakura District operation and story', { timeout: 30000 }, () => {
  for (const kind of ['mission', 'kaika'] as const) {
    it(`${kind}: the district's start, both contracts open, the Empress in place, the squad alongside`, () => {
      const sim = run(kind);
      const st = sim.level.data.playerStart;
      expect([st.x, st.z]).toEqual([-104, 30]);
      const { defense, hunt } = sim.debug as unknown as { defense: { status: string }; hunt: { status: string } };
      expect(defense.status).not.toBe('complete');
      expect(hunt.status).toBe('active');
      expect(sim.zombies.boss).not.toBeNull();
      const allies = (sim as unknown as { allies: { ref: { x: number; z: number } }[] }).allies;
      expect(allies.length).toBe(2);
      for (const a of allies) expect(Math.hypot(a.ref.x - st.x, a.ref.z - st.z)).toBeLessThan(6);
    });
  }
});

describe('the procession', { timeout: 30000 }, () => {
  it('after the bloom, calling the helicopter brings three waves up the hill, the later ones heavy', () => {
    const sim = run('mission');
    const s = sim as unknown as { sakura: { view: { phase: string } }; extraction: { phase: string; countdown: number }; zombies: { zombies: { variant: string; alive: boolean }[] } };
    const count = (v: string) => s.zombies.zombies.filter((z) => z.alive && z.variant === v).length;
    const lz = sim.level.data.extraction;
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        sim.message('p1', { k: 'p', x: lz.lzX, y: 0, z: lz.lzZ, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
        sim.tick(1 / 30);
      }
    };
    const oni0 = count('oni');
    const bloomed0 = count('bloomed');
    // no bloom: a call brings no procession
    s.extraction.phase = 'called';
    s.extraction.countdown = 60;
    step(60);
    expect(count('bloomed')).toBeLessThanOrEqual(bloomed0);
    // the bloom: it comes
    s.sakura.view.phase = 'bloom';
    // the waves come up from the landing zone's own spawn points (out of sight), mostly the blood-moon kinds: count
    // what the director sends (the squad shoots them as they come)
    const zm = s.zombies as unknown as { spawn: (...a: unknown[]) => { variant: string } };
    const sent: string[] = [];
    const spawn = zm.spawn.bind(zm);
    zm.spawn = (...a: unknown[]) => {
      const z = spawn(...a);
      sent.push(z.variant);
      return z;
    };
    step(30 * 8);
    expect(sent.length).toBeGreaterThanOrEqual(8);
    expect(sent.filter((v) => v === 'bloomed' || v === 'rooted').length).toBeGreaterThanOrEqual(4);
    step(30 * 34); // the second and the third: oni among them
    expect(sent.filter((v) => v === 'oni').length).toBeGreaterThanOrEqual(1);
    void oni0;
  });
});
