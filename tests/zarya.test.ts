/**
 * ZARYA: the story's rules (`src/zarya/story.ts`), the catalogue of what is found, bought and built
 * (`unlock.ts`), where everyone stands (`places.ts`), and the map itself (`world/layout/zarya*.ts`).
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { MELEE } from '../src/logic/melee';
import { MYSTERY_BOX } from '../src/config';
import { OBSTACLES, OBSTACLE_TOOL } from '../src/zarya/obstacles'; // (round 3)
import { LINES, NINA_WIRE, lineSeconds } from '../src/zarya/lines';
import { KIOSKS, SHELTER, SQUARE, STORE, ZARYA, ZARYA_BOUNDS, ZARYA_SPACE, ZARYA_ZONES, inRect, inShelter, onSquare, people } from '../src/zarya/places';
import { AT, CH, F, ZaryaStory, decodeStory, encodeStory } from '../src/zarya/story';
import { PART, RECIPE, TOWN, Unlock, buyOffer } from '../src/zarya/unlock';
import { zoneAt, zonesDrawn } from '../src/world/zones';
import { SessionSim } from '../src/sim/serverHost';

import { FlowField, UNREACHABLE } from '../src/world/nav';

const at = (o: { x: number; z: number }): { x: number; z: number } => ({ x: o.x, z: o.z });
const inMain = [{ x: 375, z: 0, up: true }];

/** A story taken as far as the town being open: sealed, armed, released, Gena down. */
function opened(): ZaryaStory {
  const s = new ZaryaStory();
  s.step(inMain);
  s.act('arm', 0, at(AT.arm));
  s.act('release', 0, at(AT.release));
  s.note('gena');
  return s;
}

describe('the catalogue', () => {
  it('is consistent: every part has a recipe, every gate a tool, every weapon exists', () => {
    expect(() => new Unlock(TOWN)).not.toThrow();
    for (const o of [...TOWN.offers, ...TOWN.finds]) if ('melee' in o.gives) expect(MELEE[o.gives.melee]).toBeDefined();
    expect(TOWN.parts.slice(0, 4).map((p) => p.id)).toEqual(['tube', 'cartridges', 'handle', 'fuse']); // Act I's
  });

  it('what is bought is better than what is found of the same kind', () => {
    expect(MELEE.bat.damage).toBeGreaterThan(MELEE.skillet.damage);
    expect(MELEE.hockey.damage).toBeGreaterThan(MELEE.skiPole.damage);
  });

  it('a counter takes points and never more than there are', () => {
    const inv = { cash: 400 } as Parameters<typeof buyOffer>[0];
    expect(buyOffer(inv, TOWN.offers[0]!)).toBe(true);
    expect(inv.cash).toBe(400 - TOWN.offers[0]!.price);
    expect(buyOffer(inv, TOWN.offers[0]!)).toBe(false);
  });

  // ---- round 3 (notes 5 and 6): a few weapons to swing, each with a job ----
  it('hands out only the weapons to swing that have a job: the maul lying about, the bear spear built', () => {
    const swung = [...TOWN.offers, ...TOWN.finds, ...TOWN.recipes].flatMap((o) => ('melee' in o.gives ? [o.gives.melee] : []));
    expect(swung.sort()).toEqual(['maul', 'rogatina']);
    expect(TOWN.offers.map((o) => o.gives)).toEqual([{ plates: 1 }]);
    expect(MYSTERY_BOX.mapPrizes.zarya?.melee).toBeUndefined();
    // each obstacle wants one kept weapon, and every kept weapon but the knife and the spear opens something
    expect(new Set(OBSTACLES.map((o) => OBSTACLE_TOOL[o.kind]))).toEqual(new Set(['maul', 'fireAxe', 'shashka']));
    expect(MELEE.rogatina.pin).toBeGreaterThan(0);
  });
});

describe('the story', () => {
  it('starts with the town awake, the door open and nothing in anyone’s hands', () => {
    const s = new ZaryaStory();
    expect(s.view).toEqual(ZaryaStory.empty());
    expect(ZaryaStory.doorShut(s.view)).toBe(false);
    expect(ZaryaStory.asleep(s.view)).toBe(false);
    expect(ZaryaStory.can(s.view, 'arm')).toBe(false);
  });

  it('seals the door only when every standing player is through it', () => {
    const s = new ZaryaStory();
    s.step([{ x: 375, z: 0, up: true }, { x: 364, z: 0, up: true }]);
    expect(s.view.ch).toBe(CH.arrive);
    s.step([{ x: 375, z: 0, up: true }, { x: 100, z: 0, up: false }]);
    expect(s.view.ch).toBe(CH.sealed);
    expect(ZaryaStory.doorShut(s.view)).toBe(true);
    expect(ZaryaStory.asleep(s.view)).toBe(true);
  });

  it('wants the pistols before the release, and the release opens the door for good', () => {
    const s = new ZaryaStory();
    s.step(inMain);
    expect(s.act('release', 0, at(AT.release))).toBe(false);
    expect(s.act('arm', 0, { x: 375, z: 0 })).toBe(false); // not from across the room
    expect(s.act('arm', 0, at(AT.arm))).toBe(true);
    expect(s.act('release', 0, at(AT.release))).toBe(true);
    expect(s.view.ch).toBe(CH.ground);
    expect(ZaryaStory.doorShut(s.view)).toBe(false);
  });

  it('opens the town when Gena is down, and wakes the guard only when someone comes near the shutter', () => {
    const s = opened();
    expect(s.view.ch).toBe(CH.town);
    s.step([{ x: 120, z: 0, up: true }]);
    expect(ZaryaStory.has(s.view, F.guard)).toBe(false);
    expect(ZaryaStory.has(s.view, F.hall)).toBe(true);
    s.step([{ x: 78, z: 4, up: true }]);
    expect(ZaryaStory.has(s.view, F.guard)).toBe(true);
    expect(s.act('plug', 0, at(AT.plug))).toBe(false);
    s.note('guardDown');
    expect(s.act('plug', 0, at(AT.plug))).toBe(true);
  });

  it('builds the Signalka from its two parts at the bench, and fires it only out on the square', () => {
    const s = opened();
    expect(s.act('build', RECIPE.signalka, at(ZARYA.bench))).toBe(false);
    expect(s.act('part', PART.tube, at(TOWN.parts[PART.tube]!))).toBe(true);
    expect(s.act('part', PART.cartridges, { x: 0, z: 0 })).toBe(false); // not from the middle of the square
    expect(s.act('part', PART.cartridges, at(TOWN.parts[PART.cartridges]!))).toBe(true);
    expect(s.act('build', RECIPE.signalka, { x: 0, z: 0 })).toBe(false);
    expect(s.act('build', RECIPE.signalka, at(ZARYA.bench))).toBe(true);
    expect(s.act('flare', 0, { x: 100, z: 0 })).toBe(false); // inside the store
    expect(s.act('flare', 0, { x: 0, z: 20 })).toBe(true);
    expect(s.act('flare', 0, { x: 0, z: 20 })).toBe(false);
  });

  it('will not let the tree’s fuse be pulled before the stop’s box is known to be empty', () => {
    const s = opened();
    const fuse = at(TOWN.parts[PART.fuse]!);
    expect(s.act('part', PART.fuse, fuse)).toBe(false);
    expect(s.act('fusebox', 0, at(AT.fusebox))).toBe(false); // nobody has looked in the cab yet
    expect(s.act('line', 0, at(AT.line))).toBe(true);
    expect(s.act('fusebox', 0, at(AT.fusebox))).toBe(true);
    expect(s.act('part', PART.fuse, fuse)).toBe(true);
  });

  it('runs Line One on a handle and a fuse, fitted in either order, and then boards', () => {
    for (const order of [['fitHandle', 'fitFuse'], ['fitFuse', 'fitHandle']] as const) {
      const s = opened();
      s.act('line', 0, at(AT.line));
      s.act('fusebox', 0, at(AT.fusebox));
      s.act('part', PART.handle, at(TOWN.parts[PART.handle]!));
      s.act('part', PART.fuse, at(TOWN.parts[PART.fuse]!));
      expect(s.act('board', 0, at(AT.board))).toBe(false);
      expect(s.act(order[0], 0, at(AT[order[0]]))).toBe(true);
      expect(Unlock.has(s.view.built, RECIPE.line)).toBe(false);
      expect(s.act(order[1], 0, at(AT[order[1]]))).toBe(true);
      expect(Unlock.has(s.view.built, RECIPE.line)).toBe(true);
      expect(s.act('board', 0, at(AT.board))).toBe(true);
      expect(s.view.ch).toBe(CH.act2);
    }
  });

  it('lets a prize be hung only while the bear is up, and takes it down when he has done or is down', () => {
    const s = opened();
    expect(s.act('prize', 0, at(AT.prize))).toBe(false);
    s.note('bearUp');
    expect(s.act('prize', 0, at(AT.prize))).toBe(true);
    expect(s.act('prize', 0, at(AT.prize))).toBe(false);
    s.note('prizeDone');
    expect(ZaryaStory.has(s.view, F.prize)).toBe(false);
    expect(s.act('prize', 0, at(AT.prize))).toBe(true);
    s.note('bearDown');
    expect(ZaryaStory.has(s.view, F.prize)).toBe(false);
    expect(ZaryaStory.can(s.view, 'prize')).toBe(false);
  });

  it('never goes backwards: no act lowers the chapter or loses a part', () => {
    const s = opened();
    const before = s.view;
    s.step([{ x: -60, z: -35, up: true }]);
    s.act('arm', 0, at(AT.arm));
    expect(s.view.ch).toBe(before.ch);
    expect(s.view.f & before.f).toBe(before.f);
  });

  it('says what happened once, in order', () => {
    const s = new ZaryaStory();
    s.step(inMain);
    s.step(inMain);
    expect(s.drain()).toEqual([{ kind: 'chapter', ch: CH.sealed }]);
    expect(s.drain()).toEqual([]);
    s.act('arm', 0, at(AT.arm));
    s.act('part', PART.tube, at(TOWN.parts[PART.tube]!));
    expect(s.drain()).toEqual([{ kind: 'flag', f: F.armed }, { kind: 'part', i: PART.tube }]);
  });

  it('crosses the wire whole', () => {
    const s = opened();
    s.act('part', PART.tube, at(TOWN.parts[PART.tube]!));
    expect(decodeStory(encodeStory(s.view))).toEqual(s.view);
    expect(decodeStory([1, 2])).toBeNull();
    expect(decodeStory('x')).toBeNull();
  });
});

describe('the script', () => {
  it('has a line for every beat, short enough to read on a phone', () => {
    for (const [beat, lines] of Object.entries(LINES)) {
      expect(lines.length, beat).toBeGreaterThan(0);
      for (const [, text] of lines) {
        expect(text.length, text).toBeLessThanOrEqual(150);
        expect(lineSeconds(text)).toBeGreaterThanOrEqual(2.4);
      }
    }
    expect(NINA_WIRE.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the places', () => {
  it('everything a player uses is inside the map, and what is in the shelter is in the shelter', () => {
    for (const p of [...Object.values(AT), ...TOWN.parts, ...TOWN.finds, ZARYA.bench, ZARYA.start]) {
      expect(inRect({ x0: ZARYA_SPACE.minX, z0: ZARYA_SPACE.minZ, x1: ZARYA_SPACE.maxX, z1: ZARYA_SPACE.maxZ }, p.x, p.z)).toBe(true);
    }
    expect(inShelter(AT.arm.x) && inShelter(AT.release.x) && inShelter(TOWN.parts[PART.tube]!.x)).toBe(true);
    expect(onSquare(ZARYA.start.x, ZARYA.start.z)).toBe(true);
    expect(ZARYA.sealLine).toBeGreaterThan(SHELTER.doorX);
  });

  it('the zones cover the street map and the shelter, and the shelter draws nothing else', () => {
    expect(zoneAt(ZARYA_ZONES, ZARYA.start.x, ZARYA.start.z)?.id).toBe('square');
    expect(zoneAt(ZARYA_ZONES, 100, 0)?.id).toBe('store');
    expect(zoneAt(ZARYA_ZONES, 375, 0)?.id).toBe('shelter');
    expect([...zonesDrawn(ZARYA_ZONES, 'shelter')]).toEqual(['shelter']);
    expect(zonesDrawn(ZARYA_ZONES, 'square').has('store')).toBe(true);
  });

  it('the town is much bigger than its first two zones will need to be alone', () => {
    const area = (ZARYA_BOUNDS.maxX - ZARYA_BOUNDS.minX) * (ZARYA_BOUNDS.maxZ - ZARYA_BOUNDS.minZ);
    expect(area).toBeGreaterThan(256 * 132); // the Sakura District's whole street map
  });

  it('stands a few hundred people where they were caught, none inside anything and none on top of another', () => {
    const all = people();
    // the square, the store and the shelter (every other zone stands its own: `zones/*.ts`)
    const first = all.filter((p) => ['square', 'store', 'shelter'].includes(zoneAt(ZARYA_ZONES, p.x, p.z)?.id ?? ''));
    expect(first.length).toBeGreaterThan(280);
    expect(first.length).toBeLessThan(420);
    expect(first.filter((p) => p.role === 'nina' || p.role === 'kostya' || p.role === 'zina' || p.role === 'moroz' || p.role === 'guard' || p.role === 'girl').length).toBe(6);
    const solid = all.filter((p) => p.solid);
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) expect(Math.hypot(solid[i]!.x - solid[j]!.x, solid[i]!.z - solid[j]!.z)).toBeGreaterThan(0.7);
    }
    // nobody stands in a kiosk, on the tram's side of the stop, or in the store's doorways
    for (const p of solid) {
      for (const k of KIOSKS) expect(Math.abs(p.x - k.x) < 1.6 && Math.abs(p.z - k.z) < 2.5).toBe(false);
      if (inRect(SQUARE, p.x, p.z)) expect(p.z).toBeGreaterThan(-47.5);
    }
    expect(people()).toBe(all);
  });
});

describe('the map', () => {
  const level = new SessionSim({ map: 'zarya', send: () => {} }).level;

  it('builds in every zone, with the doors a run moves and a collider for everyone who can be bumped into', () => {
    expect([...level.zones.keys()].sort()).toEqual(ZARYA_ZONES.map((q) => q.id).sort());
    const h = level.zarya!;
    expect(h.blastDoor.blocksMove).toBe(false);
    expect(h.shutter.blocksMove).toBe(false);
    expect(h.people.length).toBe(people().length);
    expect(h.people.filter((c) => c).length).toBe(people().filter((p) => p.solid).length);
    expect(level.floors.areas[h.shelterArea]?.kind).toBe('under');
  });

  it('leaves a way from the van to the staff door, through the store to its front doors, and out to the tram', () => {
    const nav = level.nav;
    const field = new FlowField(nav);
    expect(field.compute(ZARYA.start.x, ZARYA.start.z)).toBe(true);
    // from the van: is the free cell nearest to `b` reachable?
    const reach = (_a: { x: number; z: number }, b: { x: number; z: number }): boolean => {
      const i = nav.nearestFree(b.x, b.z, 3);
      return i >= 0 && field.dist[i] !== UNREACHABLE;
    };
    expect(reach(ZARYA.start, { x: ZARYA.laneDoor.x, z: ZARYA.laneDoor.z + 2 })).toBe(true);
    expect(reach(ZARYA.start, { x: ZARYA.staffDoor.x, z: ZARYA.staffDoor.z - 2 })).toBe(true);
    expect(reach(ZARYA.start, { x: STORE.x0 + 4, z: -2 })).toBe(true);
    expect(reach(ZARYA.start, { x: ZARYA.tramDoor.x, z: ZARYA.tramDoor.z + 1.5 })).toBe(true);
    expect(reach(ZARYA.start, { x: ZARYA.zinaTable.x, z: ZARYA.zinaTable.z + 1.2 })).toBe(true);
    expect(reach(ZARYA.start, { x: ZARYA.hook.x, z: ZARYA.hook.z - 2 })).toBe(true);
  });

  it('gives the map somewhere to buy, a sack, and spawn points on both sides of the store’s wall', () => {
    expect(level.data.stations.length).toBeGreaterThanOrEqual(2);
    expect(level.data.crates.length).toBe(1);
    expect(level.data.spawnPoints.some((p) => p.x > STORE.x0)).toBe(true);
    expect(level.data.spawnPoints.some((p) => p.x < STORE.x0)).toBe(true);
    for (const p of level.data.spawnPoints) expect(inShelter(p.x)).toBe(false);
  });
});

describe('the matryoshkas', () => {
  it('count every kill while one of the squad stands by a doll, wherever it falls and whoever made it', async () => {
    const { DOLLS: dolls, STORY: S, ZaryaStory: ZS } = await import('../src/zarya/story');
    const s = new ZS();
    (s as unknown as { ch: number }).ch = CH.act2;
    const d = dolls[1]!;
    const count = (): number => (s.view.dolls >> 6) & 63;
    // far from the doll and nobody by it: nothing
    s.kill(d.x + 80, d.z + 80, [{ x: 0, z: 0, up: true }]);
    expect(count()).toBe(0);
    // far from the doll, but a player stands by it: it counts
    s.kill(d.x + 80, d.z + 80, [{ x: d.x + 2, z: d.z, up: true }]);
    expect(count()).toBe(1);
    // a player who is down does not guard it
    s.kill(d.x + 80, d.z + 80, [{ x: d.x + 2, z: d.z, up: false }]);
    expect(count()).toBe(1);
    // and a kill close to the doll still counts with nobody there
    s.kill(d.x + 3, d.z, []);
    expect(count()).toBe(2);
    expect(S.dollStand).toBeGreaterThan(5);
  });
});
