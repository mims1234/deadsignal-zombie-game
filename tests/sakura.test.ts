/**
 * The Sakura District (`world/layout/sakura`): its own 256 x 132 m map with storeys, container decks and an
 * underground joined by stairs and stairwells (`world/floors.ts`). It builds, everywhere that matters can be walked to
 * from the start, and the infected follow a player up the stairs and down into the metro.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { SAKURA_SITES } from '../src/world/layout/sakura';
import { FlowField } from '../src/world/nav';

function sakura() {
  const sim = new SessionSim({ seed: 3, kind: 'mission', map: 'sakura', send() {} });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  (sim as unknown as { allies: unknown[] }).allies = [];
  return sim;
}

describe('the Sakura District', () => {
  it('builds its storeys, decks and underground, and places everything somewhere free', () => {
    const sim = sakura();
    const { floors, placement, data } = sim.level;
    const names = floors.areas.map((a) => a.name);
    expect(names).toContain('Hilltop School 2F');
    expect(names).toContain('Hilltop School roof');
    expect(names).toContain('Sakuragi metro');
    expect(names).toContain('Kurenai lab');
    expect(floors.areas.length).toBeGreaterThanOrEqual(14);
    expect(floors.links.filter((l) => l.teleport).length).toBe(4);
    expect(placement.dropped, placement.dropped.join('\n')).toEqual([]);
    expect(data.bounds.maxX - data.bounds.minX).toBe(256);
    expect(data.worldBounds.maxZ).toBeGreaterThan(data.bounds.maxZ);
  });

  it('every zone can be walked to from the start', () => {
    const sim = sakura();
    const S = SAKURA_SITES;
    const field = new FlowField(sim.level.nav);
    expect(field.compute(S.start.x, S.start.z)).toBe(true);
    const spots: [string, number, number][] = [
      ['lz', S.lz.x + 4, S.lz.z],
      ['defense', S.defense.x, S.defense.z + 6],
      ['boss courtyard', S.boss.x, S.boss.z + 4],
      ['freight lane', 104, -48],
      ['shotengai lane', 0, -4.5],
      ['izakaya alley', 110, -4.5],
      ['canal park', 30, 52],
      ['school door', -106, -58],
    ];
    for (const [name, x, z] of spots) expect(field.isReachable(x, z), name).toBe(true);
    // every stairwell's street end and every stair foot on the street too
    for (const l of sim.level.floors.links) {
      if (l.lower !== 0 && l.upper !== 0) continue;
      const e = sim.level.floors.endIn(l, 0);
      expect(field.isReachable(e.x, e.z), `link ${l.id} street end at ${e.x.toFixed(1)}, ${e.z.toFixed(1)}`).toBe(true);
    }
  });

  const chase = (sim: SessionSim, me: { x: number; y: number; z: number }, from: { x: number; z: number }, seconds: number) => {
    const world = sim.level.world;
    const report = (): void => sim.message('p1', { k: 'p', x: me.x, y: me.y, z: me.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
    for (const q of sim.zombies.zombies) if (q.active) sim.zombies.remove(q);
    const z = sim.zombies.spawn('runner', from.x, from.z, new Rng(5), { state: 'chase' });
    z.hp = z.maxHp = 1e9;
    const target = sim.level.floors.areaAt(me.x, me.y, me.z);
    let reached = false;
    for (let f = 0; f < 30 * seconds && !reached; f++) {
      if (f % 3 === 0) report();
      sim.tick(1 / 30);
      expect(world.pointInSolid(z.x, z.y + 0.9, z.z), `inside something at ${z.x.toFixed(2)}, ${z.y.toFixed(2)}, ${z.z.toFixed(2)}`).toBe(false);
      if (z.area === target && Math.hypot(z.x - me.x, z.z - me.z) < 3) reached = true;
    }
    return { reached, z, target };
  };

  it('the infected follow a player up the school stairs to the roof', () => {
    const sim = sakura();
    const roof = sim.level.floors.areas.find((a) => a.name === 'Hilltop School roof')!;
    const { reached, z } = chase(sim, { x: -112, y: roof.y, z: -56 }, { x: -96, z: -40 }, 60);
    expect(reached, `got to the roof (at ${z.x.toFixed(1)}, ${z.y.toFixed(2)}, ${z.z.toFixed(1)}, area ${z.area})`).toBe(true);
  });

  it('the infected follow a player down a stairwell into the metro', () => {
    const sim = sakura();
    const { reached, z } = chase(sim, { x: -90, y: 0, z: 154 }, { x: -86, z: 30 }, 45);
    expect(reached, `got into the metro (at ${z.x.toFixed(1)}, ${z.y.toFixed(2)}, ${z.z.toFixed(1)}, area ${z.area})`).toBe(true);
  });
});
