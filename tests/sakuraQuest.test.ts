/**
 * The Thousand Lanterns (`sakura/quest.ts`): its rules, and that every piece of it on the built map can be reached
 * (each charm from open ground on its own floor, the tree, the lanterns, the bell, the ghost train and Kisaragi).
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { SessionSim } from '../src/sim/serverHost';
import { decodeQuest, encodeQuest, QUEST_REACH, SakuraQuest } from '../src/sakura/quest';
import { questSpots } from '../src/sakura/spots';
import { FlowField } from '../src/world/nav';

describe('the Thousand Lanterns', () => {
  const sim = new SessionSim({ seed: 3, kind: 'mission', map: 'sakura', send() {} });
  const level = sim.level;
  const fl = level.floors;
  const spots = questSpots(level.sakura!);

  /** An open, reachable cell on `area` within `reach` of (x, z), or null. */
  const standNear = (area: number, x: number, z: number, reach: number): { x: number; z: number } | null => {
    const nav = fl.navOf(area);
    const f = new FlowField(nav);
    if (area === 0) f.compute(level.data.playerStart.x, level.data.playerStart.z);
    else {
      const at = fl.endIn(fl.route(area, 0)!, area);
      f.compute(at.x, at.z);
    }
    for (let r = 0; r <= reach; r += 0.25) {
      for (let k = 0; k < 24; k++) {
        const px = x + Math.cos((k / 24) * Math.PI * 2) * r;
        const pz = z + Math.sin((k / 24) * Math.PI * 2) * r;
        if (!nav.isBlockedAt(px, pz) && f.isReachable(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  };

  it('every piece can be reached', () => {
    const bad: string[] = [];
    spots.charms.forEach((c, i) => {
      const area = fl.areaAt(c.x, Math.max(0, c.y - 1.2), c.z);
      if (!standNear(area, c.x, c.z, (i === 3 ? QUEST_REACH.boat : QUEST_REACH.charm) - 0.1)) bad.push(`charm ${i} at (${c.x}, ${c.y}, ${c.z}), area ${fl.areas[area]!.name}`);
    });
    if (!standNear(0, spots.tree.x, spots.tree.z, QUEST_REACH.tree - 0.1)) bad.push('the tree');
    spots.lanterns.forEach((l, i) => {
      if (!standNear(0, l.x, l.z, QUEST_REACH.lantern - 0.1)) bad.push(`lantern ${i}`);
    });
    if (!standNear(0, spots.bell.x, spots.bell.z, QUEST_REACH.bell - 0.1)) bad.push('the bell');
    const k = level.sakura!.kisaragi;
    k.link.closed = false; // as in the bloom
    if (!standNear(0, k.boardStreet.x, k.boardStreet.z, 1)) bad.push('the ghost train (street)');
    if (!standNear(k.area, k.boardHere.x, k.boardHere.z, 1)) bad.push('the ghost train (Kisaragi)');
    for (const p of [...k.plinths, k.altar]) if (!standNear(k.area, p.x, p.z, 2.2)) bad.push(`Kisaragi (${p.x}, ${p.z})`);
    expect(bad).toEqual([]);
  });

  it('runs: charms, the tree, the lanterns in the poem\'s order, the bell during the relay', () => {
    const q = new SakuraQuest(spots);
    let seed = 7;
    q.reset(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    expect(new Set(q.view.order).size).toBe(5);
    expect(SakuraQuest.poem(q.view.order)).toHaveLength(5);
    // the charms: only within reach
    expect(q.takeCharm(0, 0, 0, 0)).toBe(false);
    spots.charms.forEach((c, i) => expect(q.takeCharm(i, c.x, c.y, c.z)).toBe(true));
    expect(q.view.found).toBe(0b11111);
    const t = spots.tree;
    expect(q.tie(t.x, t.z)).toBe(true);
    expect(q.view.phase).toBe('lanterns');
    // a wrong lantern puts them out
    const [first, second] = q.view.order;
    const L = (j: number): [number, number] => [spots.lanterns[j]!.x, spots.lanterns[j]!.z];
    expect(q.light(first!, ...L(first!))).toBe(true);
    expect(q.view.lit).toBe(1);
    const wrong = q.view.order[3]!;
    q.light(wrong, ...L(wrong));
    expect(q.view.lit).toBe(0);
    for (const j of q.view.order) q.light(j, ...L(j));
    expect(q.view.phase).toBe('bell');
    void second;
    // the bell does nothing without the relay
    const b = spots.bell;
    q.ring(b.x, b.z, false);
    expect(q.view.phase).toBe('bell');
    q.ring(b.x, b.z, true);
    expect(q.view.phase).toBe('bloom');
    const kinds = q.drain().map((e) => e.kind);
    expect(kinds).toContain('wrong');
    expect(kinds).toContain('bellEarly');
    expect(kinds[kinds.length - 1]).toBe('bloom');
    // the wire
    const back = decodeQuest(encodeQuest(q.view))!;
    expect(back.order).toEqual(q.view.order);
    expect(back.phase).toBe('bloom');
  });
});
