/**
 * ZARYA round 3 (notes 5 and 6): the few weapons to swing and their jobs. The obstacles only one weapon gets through
 * (`src/zarya/obstacles.ts`): the story's rules, the wire, the map's colliders and the ways they shut and open; and
 * the Rogatina's pin (`src/logic/melee.ts`: `pinFor`).
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { MELEE, MELEE_RULES, pinFor } from '../src/logic/melee';
import { createInventory, createCarried } from '../src/logic/economy';
import { SessionSim } from '../src/sim/serverHost';
import { FlowField, UNREACHABLE } from '../src/world/nav';
import { applyDoors } from '../src/zarya/doors';
import { OBIT, OBSTACLES, OBSTACLE_TOOL, cacheReward, obstacleOpen, toolFor } from '../src/zarya/obstacles';
import { CH, ZaryaStory, decodeStory, encodeStory } from '../src/zarya/story';
import { CHAIN } from '../src/zarya/unlock';
import { LINES } from '../src/zarya/lines';

const idx = (id: string): number => OBSTACLES.findIndex((o) => o.id === id);

/** A story after the tram first ran, with the garages' and the depot's chains cut (every zone the obstacles are in but the plant open, or all of them with `pond`). */
function town(pond = false): ZaryaStory {
  const s = new ZaryaStory();
  (s as unknown as { ch: number }).ch = CH.act2;
  s.unlock.view.gates |= (1 << CHAIN.garagesN) | (1 << CHAIN.depot);
  if (pond) (s as unknown as { g: number }).g |= 1 << 14; // G.pond
  return s;
}

describe('ZARYA obstacles: the catalogue', () => {
  it('each wants one of the kept weapons, and the bits fit after the plugs, valves and tools', () => {
    for (const [i, o] of OBSTACLES.entries()) {
      expect(['maul', 'fireAxe', 'shashka']).toContain(OBSTACLE_TOOL[o.kind]);
      expect(toolFor(i)).toBe(OBSTACLE_TOOL[o.kind]);
      expect(o.zones).toContain(o.zone);
    }
    expect(OBIT).toBeGreaterThanOrEqual(9);
    expect(OBIT + OBSTACLES.length).toBeLessThanOrEqual(31);
    // the axe in a few places, the maul one more, the shashka two
    const n = (t: string): number => OBSTACLES.filter((o) => OBSTACLE_TOOL[o.kind] === t).length;
    expect([n('maul'), n('fireAxe'), n('shashka')]).toEqual([1, 3, 2]);
    // each leads somewhere: a cache or a way
    for (const o of OBSTACLES) expect(!!o.cache !== !!o.way).toBe(true);
  });

  it('has a line for the first of each kind, and the bear spear says what it is for', () => {
    for (const k of ['obsPadlock', 'obsBoards', 'obsBarricade', 'obsIce', 'obsLashing'] as const) expect(LINES[k].length).toBeGreaterThan(0);
    expect(LINES.rogatina.some(([, t]) => /crossguard/.test(t))).toBe(true);
  });

  it('a cache holds points, two magazines for every gun carried, a plate while there is room, a grenade', () => {
    const inv = createInventory();
    inv.slots = [createCarried('pistol'), createCarried('rifle')];
    const r = cacheReward(inv, 300);
    expect(r.cash).toBe(300);
    expect(r.ammo).toEqual(inv.slots.map((s) => s!.ammo.magSize * 2));
    expect(r.grenades).toBe(1);
    inv.plates = 99;
    expect(cacheReward(inv, 300).plates).toBe(0);
  });
});

describe('ZARYA obstacles: the story', () => {
  it('opens only with the weapon carried, from where it stands, once, for the squad', () => {
    const s = town();
    const i = idx('shed');
    const at = OBSTACLES[i]!.at;
    expect(ZaryaStory.can(s.view, 'obstacle', i)).toBe(true);
    expect(s.act('obstacle', i, at, false)).toBe(false);
    expect(s.act('obstacle', i, { x: at.x + 20, z: at.z }, true)).toBe(false);
    expect(s.act('obstacle', i, at, true)).toBe(true);
    expect(obstacleOpen(s.view, i)).toBe(true);
    expect(s.act('obstacle', i, at, true)).toBe(false);
    expect(s.drain().some((e) => e.kind === 'obstacle' && e.i === i)).toBe(true);
    // the plugs, valves and tools that share `m` are untouched
    expect(s.view.m & ((1 << 9) - 1)).toBe(0);
  });

  it('waits for the tram, and for every zone it joins to be open', () => {
    const before = new ZaryaStory();
    (before as unknown as { ch: number }).ch = CH.town;
    for (let i = 0; i < OBSTACLES.length; i++) expect(ZaryaStory.can(before.view, 'obstacle', i)).toBe(false);
    // the gap from the market into the garages: not before the garages are open (it is no way round their chains)
    const s = new ZaryaStory();
    (s as unknown as { ch: number }).ch = CH.act2;
    expect(ZaryaStory.can(s.view, 'obstacle', idx('gap'))).toBe(false);
    expect(ZaryaStory.can(s.view, 'obstacle', idx('stall'))).toBe(true);
    // the plant's and the pond's wait for the pond road
    expect(ZaryaStory.can(town().view, 'obstacle', idx('sideDoor'))).toBe(false);
    expect(ZaryaStory.can(town().view, 'obstacle', idx('tent'))).toBe(false);
    expect(ZaryaStory.can(town(true).view, 'obstacle', idx('sideDoor'))).toBe(true);
  });

  it('goes over the wire', () => {
    const s = town(true);
    for (let i = 0; i < OBSTACLES.length; i++) s.act('obstacle', i, OBSTACLES[i]!.at, true);
    const v = decodeStory(encodeStory(s.view))!;
    for (let i = 0; i < OBSTACLES.length; i++) expect(obstacleOpen(v, i)).toBe(true);
  });
});

describe('ZARYA obstacles: the map', () => {
  const level = new SessionSim({ map: 'zarya', send: () => {} }).level;
  const h = level.zarya!;

  it('builds a collider for each that is walked through, and shuts it until it is opened', () => {
    expect(h.obstacles.length).toBe(OBSTACLES.length);
    OBSTACLES.forEach((o, i) => expect(!!h.obstacles[i]).toBe(!!o.block));
    const s = town(true);
    applyDoors(level, s.view);
    OBSTACLES.forEach((o, i) => o.block && expect(h.obstacles[i]!.blocksMove).toBe(true));
    for (let i = 0; i < OBSTACLES.length; i++) s.act('obstacle', i, OBSTACLES[i]!.at, true);
    applyDoors(level, s.view);
    OBSTACLES.forEach((o, i) => o.block && expect(h.obstacles[i]!.blocksMove).toBe(false));
  });

  it('opens a way: into the shed and the garage to their caches, through the gap, through the side door', () => {
    const nav = level.nav;
    const steps = (a: { x: number; z: number }, b: { x: number; z: number }): number => {
      const f = new FlowField(nav);
      f.compute(a.x, a.z);
      const k = nav.nearestFree(b.x, b.z, 0.6);
      return k < 0 ? UNREACHABLE : f.dist[k]!;
    };
    const routes: [string, { x: number; z: number }, { x: number; z: number }][] = [
      ['shed', { x: 96.3, z: 110 }, OBSTACLES[idx('shed')]!.cache!.at],
      ['garage', { x: 124, z: 125 }, OBSTACLES[idx('garage')]!.cache!.at],
      ['gap', { x: 152, z: 69 }, { x: 152, z: 76 }],
      ['sideDoor', { x: -5.5, z: -157 }, { x: -12, z: -157 }],
    ];
    const s = town(true);
    applyDoors(level, s.view);
    const shut = routes.map(([, a, b]) => steps(a, b));
    for (let i = 0; i < OBSTACLES.length; i++) s.act('obstacle', i, OBSTACLES[i]!.at, true);
    applyDoors(level, s.view);
    routes.forEach(([id, a, b], k) => {
      const open = steps(a, b);
      expect(open, `${id} open`).not.toBe(UNREACHABLE);
      // shut, it is no way at all (the shed, the garage) or a long way round (the gap, the side door)
      expect(shut[k] === UNREACHABLE || shut[k]! > open * 3, `${id}: ${shut[k]} shut vs ${open} open`).toBe(true);
    });
  });
});

describe('the Rogatina pins a charge', () => {
  const R = MELEE.rogatina;
  it('a wound-up thrust stops something charging, or one of the big ones, and nothing else does', () => {
    expect(pinFor(R, true, { charging: true, big: false }, Infinity)).toBe(R.pin);
    expect(pinFor(R, true, { charging: false, big: true }, Infinity)).toBe(R.pin);
    expect(pinFor(R, true, { charging: false, big: false }, Infinity)).toBe(0);
    expect(pinFor(R, false, { charging: true, big: true }, Infinity)).toBe(0);
    for (const id of ['knife', 'maul', 'fireAxe', 'shashka'] as const) expect(pinFor(MELEE[id], true, { charging: true, big: true }, Infinity)).toBe(0);
  });

  it('not again until it has been free a while (no holding a boss for ever)', () => {
    expect(pinFor(R, true, { charging: true, big: true }, R.pin! + 0.5)).toBe(0);
    expect(pinFor(R, true, { charging: true, big: true }, R.pin! + MELEE_RULES.pinAgain)).toBe(R.pin);
  });
});
