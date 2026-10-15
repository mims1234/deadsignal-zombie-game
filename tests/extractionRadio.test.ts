/**
 * Calling the bird works from the radio on every map: the radio's prompt and the zone the call is allowed from agree
 * (on the Forge and the Asylum the radio stands a few metres outside the zone's circle).
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { RADIO_REACH, atLzOrRadio } from '../src/logic/extraction';
import { MAP_IDS } from '../src/world/layout/data';

describe('calling the extraction from the radio', () => {
  for (const map of MAP_IDS) {
    it(`${map}: anywhere the radio prompt shows, the call is allowed`, () => {
      const e = new SessionSim({ map, send: () => {} }).level.data.extraction;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        for (const r of [0.6, 1.5, RADIO_REACH - 0.1]) {
          expect(atLzOrRadio(e.terminalX + Math.cos(a) * r, e.terminalZ + Math.sin(a) * r, e), `${a.toFixed(2)} ${r}`).toBe(true);
        }
      }
      // and far from both it is not
      expect(atLzOrRadio(e.lzX + e.lzRadius + 30, e.lzZ, e)).toBe(false);
    });
  }

  it('the co-op simulation takes the call from a player standing at the Asylum radio', () => {
    const sim = new SessionSim({ seed: 3, map: 'asylum', send: () => {} });
    sim.players([{ id: 'p1', name: 'One' }]);
    sim.begin();
    const e = sim.level.data.extraction;
    const d = sim.debug;
    d.defense.status = 'complete';
    d.hunt.status = 'complete';
    const st = sim.level.data.playerStart;
    for (let i = 0; i < 10; i++) {
      sim.message('p1', { k: 'p', x: st.x, y: 0, z: st.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
      sim.tick(1 / 30);
    }
    expect(d.extraction.phase).toBe('available');
    // the far side of the radio from the pad: outside the zone's circle
    const away = Math.atan2(e.terminalZ - e.lzZ, e.terminalX - e.lzX);
    const x = e.terminalX + Math.cos(away) * 2;
    const z = e.terminalZ + Math.sin(away) * 2;
    expect(Math.hypot(x - e.lzX, z - e.lzZ)).toBeGreaterThan(e.lzRadius + 1.5);
    sim.message('p1', { k: 'p', x, y: 0, z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    sim.message('p1', { k: 'call' }, false);
    expect(['called', 'inbound']).toContain(d.extraction.phase);
  });
});
