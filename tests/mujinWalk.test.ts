/**
 * MUJIN on foot: a player can walk every way through the station with the game's own movement rules (no step taller
 * than a player can take, nothing invisible in the way): up the footbridge and down the other side, from the tracks onto
 * both platforms, through the gates, into the waiting room, out of both station doors, into the field, the shopping
 * street and the shrine, and along the crossing road.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { PLAYER } from '../src/config';
import { SessionSim } from '../src/sim/serverHost';

const PATHS: Record<string, [number, number][]> = {
  'footbridge, platform 1 to platform 2': [[-11, -6.6], [-21.8, -6.6], [-21.8, 6.6], [-11, 6.6]],
  'tracks onto platform 1': [[0, 0], [0, -6]],
  'tracks onto platform 2': [[0, 0], [0, 6]],
  'platform 1 through the gates and out the north door': [[-5, -6], [-5, -15], [-5, -25]],
  'into the waiting room': [[5, -6], [5, -12], [9, -13]],
  'out of the west door': [[-12, -11.4], [-17, -11.4]],
  'into the field': [[-16, -15], [-24, -15]],
  'into the shopping street': [[16, 8], [16, 24], [-40, 24]],
  'up to the shrine': [[39, 8], [39, 26]],
  'along the crossing road': [[39, -30], [39, 10]],
};

describe('MUJIN on foot', () => {
  const sim = new SessionSim({ seed: 1, kind: 'mission', map: 'mujin', send() {} });
  const world = sim.level.world;
  for (const [name, pts] of Object.entries(PATHS)) {
    it(name, () => {
      let y = world.groundHeight(pts[0]![0], pts[0]![1], PLAYER.radius * 0.92, 0.6);
      for (let i = 1; i < pts.length; i++) {
        const [x0, z0] = pts[i - 1]!;
        const [x1, z1] = pts[i]!;
        const L = Math.hypot(x1 - x0, z1 - z0);
        for (let s = 0; s <= L; s += 0.08) {
          const x = x0 + ((x1 - x0) * s) / L;
          const z = z0 + ((z1 - z0) * s) / L;
          const ground = world.groundHeight(x, z, PLAYER.radius * 0.92, y + PLAYER.stepHeight + 0.001);
          expect(ground - y, `${name}: a step too tall at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(PLAYER.stepHeight);
          y = ground;
          const q = { x, z };
          const hit = world.resolveCircle(q, PLAYER.radius, y + PLAYER.stepHeight, y + PLAYER.heightStand, 4);
          expect(hit, `${name}: blocked at (${x.toFixed(1)}, ${z.toFixed(1)}) y ${y.toFixed(2)}`).toBe(false);
        }
      }
    });
  }
});
