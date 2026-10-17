/**
 * The Sakura District's paper (`sakura/lore.ts`, the festival scroll): it lies on open ground of its own floor,
 * somewhere you can walk to from the start (up the stairs, down the stairwells).
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { SessionSim } from '../src/sim/serverHost';
import { NOTES } from '../src/sakura/lore';
import { FlowField } from '../src/world/nav';

describe('the Sakura District scroll', { timeout: 30000 }, () => {
  const sim = new SessionSim({ seed: 3, kind: 'mission', map: 'sakura', send() {} });
  const level = sim.level;
  const fl = level.floors;
  const st = level.data.playerStart;
  const fields = new Map<number, FlowField>();
  /** A field over an area from where you arrive in it (the street: from the start). */
  const fieldIn = (area: number): FlowField => {
    let f = fields.get(area);
    if (f) return f;
    f = new FlowField(fl.navOf(area));
    if (area === 0) f.compute(st.x, st.z);
    else {
      const link = fl.route(area, 0)!;
      const at = fl.endIn(link, area);
      f.compute(at.x, at.z);
    }
    fields.set(area, f);
    return f;
  };

  it('is the festival scroll on the theatre stage', () => {
    expect(NOTES.map((n) => n.id)).toEqual(['th-stage']);
  });

  it('every note is on open, reachable ground of its floor', () => {
    const bad: string[] = [];
    for (const n of NOTES) {
      const area = n.area === 'street' ? 0 : fl.areas.findIndex((a) => a.name === n.area);
      if (area < 0) {
        bad.push(`${n.id}: no area "${n.area}"`);
        continue;
      }
      if (area !== 0 && !fl.route(area, 0)) {
        bad.push(`${n.id}: ${n.area} has no way to the street`);
        continue;
      }
      const nav = fl.navOf(area);
      const cell = nav.nearestFree(n.x, n.z, 5);
      if (cell < 0) {
        bad.push(`${n.id}: nothing open within 2.5 m of (${n.x}, ${n.z}) on ${n.area}`);
        continue;
      }
      if (!fieldIn(area).isReachable(nav.cellCenterX(cell), nav.cellCenterZ(cell))) bad.push(`${n.id}: (${n.x}, ${n.z}) on ${n.area} cannot be walked to`);
    }
    expect(bad).toEqual([]);
  });
});
