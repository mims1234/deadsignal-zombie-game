/**
 * HIRASAKA reborn: the story (`hirasaka/story.ts`) act by act with no clock anywhere, the frame (`places.ts`,
 * `world/layout/hirasaka.ts`) built so every spot the story names is on its floor and walkable, no sealed pockets on the
 * island, in the heights or in the deep, the pickups well apart, the voices that are reused on disk, and the co-op
 * simulation running the story to its ending.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { CAST, LINES, MINER_VOICES } from '../src/hirasaka/lines';
import { ACT, BUILT, decodeStory, encodeStory, HIRASAKA_STORY, HirasakaStory, LADLE, type StoryView } from '../src/hirasaka/story';
import {
  ADIT,
  CAGE,
  CLIMB_MARKS,
  COMB,
  DEEP_SPOTS,
  GROUPS,
  HEIGHTS,
  ISLAND,
  JOBS,
  LADLES,
  OBSTACLE,
  OBSTACLES,
  PADS,
  PHOTOS,
  PLACES_LIST,
  ROCK,
  SIDE,
  SIDES,
  TAPES,
  TOOL_IDS,
  TOOLS,
  UMIBOZU,
  allSpots,
  deepRoomAt,
  groundY,
  inDeep,
  pickups,
  type Spot,
} from '../src/hirasaka/places';
import { applyHirasakaDoors } from '../src/hirasaka/doors';
import { HirasakaDirector } from '../src/hirasaka/director';
import { SPAWNS } from '../src/world/layout/hirasaka';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { FlowField, UNREACHABLE, type NavGrid } from '../src/world/nav';
import { ZombieManager } from '../src/enemies/zombieManager';
import { createNullRigFactory } from '../src/sim/nullRig';
import { Rng } from '../src/logic/rng';

const at = (s: Spot): Spot => ({ x: s.x, y: s.y, z: s.z });
const stand = (...ss: Spot[]) => ss.map((s) => ({ x: s.x, y: s.y, z: s.z, up: true }));

/** Act I, the honest way: tools, coal, the key, the shutter, the fan, the boiler, the Mori, the umibōzu. */
function islandJobs(q: HirasakaStory, order: ('steam' | 'air' | 'key')[] = ['steam', 'air', 'key']): void {
  for (const id of TOOL_IDS) expect(q.act('tool', TOOL_IDS.indexOf(id), at(TOOLS[id]))).toBe(true);
  for (const job of order) {
    if (job === 'steam') {
      expect(q.act('coal', 0, at(JOBS.steam.coal[0]!))).toBe(true);
      expect(q.act('coal', 1, at(JOBS.steam.coal[1]!))).toBe(true);
      expect(q.act('open', OBSTACLE.slag!, at(OBSTACLES[OBSTACLE.slag!]!.at))).toBe(true); // the third sack, dug out
      expect(q.act('boilerKey', 0, at(JOBS.steam.boilerKey))).toBe(true);
      expect(q.act('open', OBSTACLE.bathDoor!, at(OBSTACLES[OBSTACLE.bathDoor!]!.at))).toBe(true);
      expect(q.act('burner', 0, at(JOBS.steam.boiler))).toBe(true);
    } else if (job === 'air') {
      expect(q.act('fan', 0, at(JOBS.air.fan))).toBe(false); // the shutter first
      expect(q.act('open', OBSTACLE.shutter!, at(JOBS.air.shutter))).toBe(true);
      expect(q.act('fan', 0, at(JOBS.air.fan))).toBe(true);
    } else expect(q.act('key', 0, at(JOBS.key.key))).toBe(true);
  }
}

function sinkTheUmibozu(q: HirasakaStory): void {
  UMIBOZU.parts.forEach((p, i) => expect(q.act('part', i, at(p))).toBe(true));
  expect(q.act('built', BUILT.mori, at(UMIBOZU.winch))).toBe(true);
  // (hs-bosses) the placeholder counts only while it is up over the wall; the giant's own fight is `hirasakaBosses.test.ts`
  expect(q.act('harpoon', 0, at(UMIBOZU.winch))).toBe(false);
  for (let i = 0; i < HIRASAKA_STORY.umiHits; i++) expect(q.act('umiHit', 0, at(UMIBOZU.winch))).toBe(true);
}

/** Act II to the cable: down, the ladles, the drift, the roots, the hairpin, Kurogane down. */
function deep(q: HirasakaStory): void {
  expect(q.act('ladles', 0, at(LADLES))).toBe(true);
  expect(q.act('cage', 0, at(CAGE.top))).toBe(true);
  expect(q.act('funa', 0, at(DEEP_SPOTS.funa))).toBe(false); // with their bottoms in, they bail
  expect(q.act('knock', 0, at(DEEP_SPOTS.bench))).toBe(true);
  expect(q.act('funa', 0, at(DEEP_SPOTS.funa))).toBe(true);
  expect(q.act('open', OBSTACLE.drift!, at(OBSTACLES[OBSTACLE.drift!]!.at))).toBe(true);
  expect(q.act('hairpin', 0, at(DEEP_SPOTS.hairpin))).toBe(false); // the roots, first
  expect(q.act('open', OBSTACLE.roots!, at(DEEP_SPOTS.hairpin))).toBe(true);
  expect(q.act('hairpin', 0, at(DEEP_SPOTS.hairpin))).toBe(true);
  q.overseerDown();
}

describe('HIRASAKA: the story (no clock anywhere)', () => {
  it('act I: the three jobs in any order, then the umibōzu, then the cage runs', () => {
    for (const order of [['steam', 'air', 'key'], ['key', 'air', 'steam'], ['air', 'key', 'steam']] as const) {
      const q = new HirasakaStory();
      q.reset();
      expect(q.act('cage', 0, at(CAGE.top))).toBe(false);
      islandJobs(q, [...order]);
      expect(HirasakaStory.jobsAll(q.view)).toBe(true);
      expect(q.view.umi).toBe(1);
      expect(HirasakaStory.ready(q.view)).toBe(false); // the thing in the sea first
      expect(q.act('cage', 0, at(CAGE.top))).toBe(false);
      sinkTheUmibozu(q);
      const kinds = q.drain().map((e) => e.kind);
      expect(kinds.filter((k) => k === 'done').length).toBe(3);
      expect(kinds.indexOf('jobs')).toBeLessThan(kinds.indexOf('ready'));
      expect(q.act('cage', 0, at(CAGE.top))).toBe(true);
      expect(q.view.act).toBe(ACT.deep);
    }
  });

  it('nothing happens by itself: an hour of standing still changes nothing', () => {
    const q = new HirasakaStory();
    q.reset();
    const before = JSON.stringify(q.view);
    for (let t = 0; t < 3600; t += 0.5) q.tick(0.5, stand(JOBS.key.key));
    expect(q.drain()).toEqual([]);
    expect(JSON.stringify(q.view)).toBe(before);
  });

  it('every step checks where you are and how high; each tool opens only its own', () => {
    const q = new HirasakaStory();
    q.reset();
    expect(q.act('key', 0, { ...JOBS.key.key, y: 7.2 })).toBe(false); // under Genzō's room, on the terrace
    expect(q.act('key', 0, at(JOBS.key.key))).toBe(true);
    expect(q.act('key', 0, at(JOBS.key.key))).toBe(false); // once
    expect(q.act('open', OBSTACLE.shutter!, at(JOBS.air.shutter))).toBe(false); // no pick yet
    expect(q.act('tool', TOOL_IDS.indexOf('axe'), at(TOOLS.axe))).toBe(true);
    expect(q.act('open', OBSTACLE.shutter!, at(JOBS.air.shutter))).toBe(false); // the axe is not the pick
    expect(q.act('open', OBSTACLE.bathDoor!, at(OBSTACLES[OBSTACLE.bathDoor!]!.at))).toBe(true);
    expect(q.act('burner', 0, at(JOBS.steam.boiler))).toBe(false); // no coal, no key
  });

  it('act III: the sea rises by place, only behind the hindmost; the rock moves by winch turns, more hands faster', () => {
    const q = new HirasakaStory();
    q.reset();
    islandJobs(q);
    sinkTheUmibozu(q);
    deep(q);
    expect(q.view.act).toBe(ACT.climb);
    expect(q.view.bossDown).toBe(true);
    // two players: the lead passing marks does not raise the sea; the hindmost passing them does
    const A = CLIMB_MARKS;
    q.tick(0.1, stand(A[0]!.at, at(DEEP_SPOTS.peaches)));
    expect(q.view.lead).toBe(0);
    expect(q.view.mark).toBe(-1);
    q.tick(3600, stand(A[1]!.at, at(DEEP_SPOTS.peaches))); // an hour later, still nothing rises
    expect(q.view.mark).toBe(-1);
    q.tick(0.1, stand(A[1]!.at, A[0]!.at));
    expect(q.view.mark).toBe(0);
    expect(HirasakaStory.seaLevel(q.view, true)).toBeGreaterThan(0);
    for (let i = 2; i < A.length; i++) q.tick(0.1, stand(A[i]!.at, A[i]!.at));
    expect(q.view.mark).toBe(A.length - 1);
    expect(HirasakaStory.seaLevel(q.view)).toBeGreaterThan(10);
    expect(HirasakaStory.seaLevel(q.view)).toBeLessThan(ROCK.seal.y); // the summit never goes under
    // the rock: one player's turns vs two players'
    const turns = (seats: number): number => {
      const r = new HirasakaStory();
      r.reset();
      Object.assign(r.view, { act: ACT.climb, bossDown: true, hairpin: true });
      for (let t = 0; t < 20; t++) {
        r.tick(0.4, []);
        for (let s = 0; s < seats; s++) r.act('crank', s, at(ROCK.winches[s]!), s);
      }
      return r.view.cranks;
    };
    expect(turns(2)).toBeGreaterThan(turns(1) * 1.9);
    // Mio leaning on it holds it back
    const h = new HirasakaStory();
    h.reset();
    Object.assign(h.view, { act: ACT.climb, bossDown: true, hairpin: true });
    h.tick(0.5, [], true);
    h.act('crank', 0, at(ROCK.winches[0]!), 0);
    expect(h.view.cranks).toBeCloseTo(HIRASAKA_STORY.heldRate, 3);
    // turn the winches until it is home: ending 1
    for (let t = 0; t < 400 && q.view.act === ACT.climb; t++) {
      q.tick(0.4, []);
      q.act('crank', t % 3, at(ROCK.winches[t % 3]!), 0);
    }
    expect(q.view.ending).toBe(1);
    expect(q.drain().map((e) => e.kind)).toContain('sealed');
  });

  it('the other ending: every photograph, the gallery telephone and the rice ball, then turn round at the rock', () => {
    const q = new HirasakaStory();
    q.reset();
    islandJobs(q);
    sinkTheUmibozu(q);
    PHOTOS.forEach((p, i) => expect(q.act('photo', i, at(p))).toBe(true));
    deep(q);
    expect(q.act('home', 0, at(ROCK.turn))).toBe(false); // no call, no rice ball
    expect(q.act('phone', 0, at(DEEP_SPOTS.phone))).toBe(true);
    expect(q.act('home', 0, at(ROCK.turn))).toBe(false); // she might have eaten
    expect(q.act('side', SIDE.riceball!, at(DEEP_SPOTS.riceball))).toBe(true);
    expect(HirasakaStory.canGoHome(q.view)).toBe(true);
    expect(q.act('home', 0, { ...ROCK.turn, y: 7.2 })).toBe(false); // at the rock, not below it
    expect(q.act('home', 0, at(ROCK.turn))).toBe(true);
    expect(q.view.ending).toBe(2);
  });

  it('the hearth marks a hand and the pithead bath washes it off; looks count only on the climb', () => {
    const q = new HirasakaStory();
    q.reset();
    expect(q.act('wash', 0, at(DEEP_SPOTS.hearth))).toBe(false);
    expect(q.act('eat', 0, at(DEEP_SPOTS.hearth), 2)).toBe(true);
    expect(q.view.marked).toBe(1 << 2);
    expect(q.act('wash', 0, at(JOBS.key.key), 2)).toBe(false);
    expect(q.act('wash', 0, { x: 142, y: 0, z: 44 }, 2)).toBe(true);
    expect(q.view.marked).toBe(0);
    expect(q.look(0)).toBe(false);
    Object.assign(q.view, { act: ACT.climb });
    expect(q.look(0)).toBe(true);
    expect(q.look(0)).toBe(false); // not again at once
    q.tick(HIRASAKA_STORY.lookEvery + 0.1, []);
    expect(q.look(0)).toBe(true);
  });

  it('the hooks for the later waves: weapons built, Kurogane phases and thunders, side stories, the offering box', () => {
    const q = new HirasakaStory();
    q.reset();
    expect(q.act('built', BUILT.happa, at(CAGE.top), 0, true)).toBe(true);
    expect(q.act('box', 2, at(CAGE.top))).toBe(true);
    expect(q.view.boxAt).toBe(2);
    expect(q.act('side', SIDE.cats!, at(SIDES[SIDE.cats!]!))).toBe(true);
    expect(q.act('kuPhase', 2, at(CAGE.top))).toBe(false); // he is not up
    Object.assign(q.view, { hairpin: true, cageDown: true });
    expect(q.act('kuPhase', 2, at(CAGE.top))).toBe(true);
    expect(q.act('thunder', 7, at(CAGE.top))).toBe(true);
    expect(q.view.thunders).toBe(1 << 7);
    expect(q.act('comb', 0, at(COMB))).toBe(true);
    expect(q.act('kushi', 3, at(CAGE.top))).toBe(true);
    expect(q.view.kushi).toBe(3);
  });

  it('the wire carries the whole story', () => {
    const q = new HirasakaStory();
    q.reset();
    islandJobs(q);
    sinkTheUmibozu(q);
    deep(q);
    q.tick(0.1, stand(CLIMB_MARKS[0]!.at));
    Object.assign(q.view, { cranks: 7.25, held: true, horde: 1234, side: 0b1000000101, looks: 3, boxAt: 1, thunders: 0b1011 });
    const back = decodeStory(encodeStory(q.view)) as StoryView;
    expect(back).toEqual(q.view);
    expect(decodeStory([1, 2, 3])).toBeNull();
  });
});

describe('HIRASAKA: the frame', () => {
  const sim = new SessionSim({ map: 'hirasaka', send: () => {} });
  const level = sim.level;
  const h = level.hirasaka!;
  // every obstacle open and the funayūrei satisfied: the map as the story leaves it
  const open = HirasakaStory.empty();
  open.obstacles = (1 << OBSTACLES.length) - 1;
  open.ladles = LADLE.given;
  applyHirasakaDoors(level, open);
  const st = level.data.playerStart;
  const field = new FlowField(level.nav);
  field.compute(st.x, st.z);
  const deepNav = level.floors.navOf(h.mineArea);
  const deepField = new FlowField(deepNav);
  deepField.compute(CAGE.bottomOut.x, CAGE.bottomOut.z);
  const highNav = level.floors.navOf(h.heightsArea);
  const highField = new FlowField(highNav);
  highField.compute(HEIGHTS.stairHead.x, HEIGHTS.stairHead.z - 1.6);
  const fieldFor = (s: Spot): FlowField => (inDeep(s.x) ? deepField : s.y > HEIGHTS.y - 1 ? highField : field);

  it('the pads tile the island exactly, the places never overlap, each group has its stub file', () => {
    let area = 0;
    for (const p of PADS) area += (p.x1 - p.x0) * (p.z1 - p.z0);
    expect(area).toBe((ISLAND.x1 - ISLAND.x0) * (ISLAND.z1 - ISLAND.z0));
    for (let i = 0; i < PADS.length; i++)
      for (let j = i + 1; j < PADS.length; j++) {
        const a = PADS[i]!;
        const b = PADS[j]!;
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1).toBe(false);
      }
    for (let i = 0; i < PLACES_LIST.length; i++)
      for (let j = i + 1; j < PLACES_LIST.length; j++) {
        const a = PLACES_LIST[i]!.rect;
        const b = PLACES_LIST[j]!.rect;
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1, `${PLACES_LIST[i]!.id} / ${PLACES_LIST[j]!.id}`).toBe(false);
      }
    expect(PLACES_LIST.filter((p) => !p.deep).length).toBe(12);
    expect(PLACES_LIST.filter((p) => p.deep).length).toBe(6);
    for (const g of GROUPS) expect(existsSync(`src/world/layout/${g.file}`), g.file).toBe(true);
  });

  it('every spot the story names stands on its floor and can be walked to', () => {
    const wrong: string[] = [];
    for (const { id, at: s } of allSpots()) {
      const fy = level.world.floorBelow(s.x, s.z, 0.3, s.y + 0.4, 0.8);
      if (Math.abs(fy - s.y) > 0.35) wrong.push(`${id}: floor ${fy.toFixed(1)} not ${s.y}`);
      // a spot may be beside a thing (a bench, a board): reachable within 2 m
      const f = fieldFor(s);
      let ok = false;
      for (let a = 0; a < 16 && !ok; a++) for (const r of [0, 1, 2]) if (f.isReachable(s.x + Math.cos(a * 0.39) * r, s.z + Math.sin(a * 0.39) * r)) ok = true;
      if (!ok) wrong.push(`${id}: unreachable`);
    }
    expect(wrong).toEqual([]);
  });

  it('the island, the heights and the deep have no sealed pockets', () => {
    const pockets = (nav: NavGrid, f: FlowField, inside: (x: number, z: number) => boolean): string[] => {
      const seen = new Uint8Array(nav.count);
      const out: string[] = [];
      for (let i = 0; i < nav.count; i++) {
        if (seen[i] || nav.blocked[i] || f.dist[i] !== UNREACHABLE) continue;
        const stack = [i];
        seen[i] = 1;
        let n = 0;
        let sx = 0;
        let sz = 0;
        while (stack.length) {
          const k = stack.pop()!;
          n++;
          const c = k % nav.cols;
          const r = Math.floor(k / nav.cols);
          sx += c;
          sz += r;
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const cc = c + dc;
            const rr = r + dr;
            if (cc < 0 || rr < 0 || cc >= nav.cols || rr >= nav.rows) continue;
            const kk = rr * nav.cols + cc;
            if (seen[kk] || nav.blocked[kk] || f.dist[kk] !== UNREACHABLE) continue;
            seen[kk] = 1;
            stack.push(kk);
          }
        }
        const x = Math.round(nav.minX + (sx / n + 0.5) * nav.cell);
        const z = Math.round(nav.minZ + (sz / n + 0.5) * nav.cell);
        if (n > 6 && inside(x, z)) out.push(`${x},${z} (${n})`);
      }
      return out;
    };
    expect(pockets(level.nav, field, (x, z) => x > ISLAND.x0 && x < ISLAND.x1 && z > ISLAND.z0 && z < ISLAND.z1 + 20)).toEqual([]);
    expect(pockets(highNav, highField, () => true)).toEqual([]);
    // the deep: inside its carved rooms (the solid rock round them is nobody's ground)
    expect(pockets(deepNav, deepField, (x, z) => deepRoomAt(x, z) !== null)).toEqual([]);
  });

  it('every spawn point stands on open ground on its pad (never under the heights) and can walk', () => {
    const wrong: string[] = [];
    for (const p of level.data.spawnPoints) {
      const f = inDeep(p.x) ? deepField : field;
      if (!f.isReachable(p.x, p.z)) wrong.push(`${p.x},${p.z} unreachable`);
      if (!inDeep(p.x) && Math.abs(level.world.floorHeight(p.x, p.z, 0.3) - groundY(p.x, p.z)) > 0.35) wrong.push(`${p.x},${p.z} not on its pad`);
    }
    for (const g of GROUPS) {
      const r = g.rect;
      for (const [x, z] of SPAWNS[g.id]) if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) wrong.push(`${g.id} spawn ${x},${z} outside its group`);
    }
    expect(wrong).toEqual([]);
  });

  it('the infected are put on the floor where they spawn, on every pad and in the deep', () => {
    const zm = new ZombieManager(createNullRigFactory(), level);
    const rng = new Rng(7);
    for (const g of GROUPS) {
      const [x, z] = SPAWNS[g.id][0]!;
      const zz = zm.spawn('shambler', x, z, rng);
      if (inDeep(x)) expect(zz.area).toBe(h.mineArea);
      else expect(zz.y).toBeCloseTo(groundY(x, z), 1);
    }
  });

  it("the pickups lie at least 8 m apart (Genzō's tapes, the photographs, the keys, the tools, the parts)", () => {
    const list = pickups();
    const close: string[] = [];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!.at;
        const b = list[j]!.at;
        if (Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y) < 8) close.push(`${list[i]!.id} / ${list[j]!.id}`);
      }
    expect(close).toEqual([]);
    expect(TAPES.length).toBe(5);
    expect(PHOTOS.length).toBe(5);
    expect(SIDES.length).toBe(10);
  });

  it('the obstacles are built open and shut by a run until opened; the cage is players-only; the adit opens with the climb', () => {
    const fresh = new SessionSim({ map: 'hirasaka', send: () => {} }).level.hirasaka!;
    for (const c of fresh.obstacles) if (c) expect(c.blocksMove).toBe(false);
    const shut = HirasakaStory.empty();
    applyHirasakaDoors(level, shut);
    for (const [i, o] of OBSTACLES.entries()) if (o.block) expect(h.obstacles[i]!.blocksMove, o.id).toBe(true);
    expect(h.funaGate.blocksMove).toBe(true);
    expect(h.cageLink.closed).toBe(true);
    expect(h.aditLink.closed).toBe(true);
    applyHirasakaDoors(level, { ...shut, bossDown: true, ladles: LADLE.given, obstacles: open.obstacles });
    expect(h.aditLink.closed).toBe(false);
    expect(h.funaGate.blocksMove).toBe(false);
    applyHirasakaDoors(level, open);
  });

  it('a loud moment draws the dead in instead of spawning them out of the air', () => {
    const zm = new ZombieManager(createNullRigFactory(), level);
    const dir = new HirasakaDirector(level, zm);
    const rng = new Rng(3);
    const v = HirasakaStory.empty();
    const before = zm.zombies.length;
    dir.onEvent({ kind: 'done', job: 'key', n: 1 }, v, rng);
    dir.onEvent({ kind: 'jobs' }, v, rng);
    expect(zm.zombies.length).toBe(before);
    dir.step(0.1, v, [], rng);
    expect(zm.rateMul).toBeGreaterThan(2);
    for (let t = 0; t < 60; t += 0.5) dir.step(0.5, v, [], rng);
    expect(zm.rateMul).toBe(1);
    // nothing spawns in the deep before the cage goes down, nor by the tag board after
    const ok = dir.spawnAllowed();
    expect(ok(300, 40)).toBe(false);
    dir.step(0.1, { ...v, cageDown: true }, [], rng);
    expect(ok(300, 40)).toBe(true);
    expect(ok(DEEP_SPOTS.tagBoard.x, DEEP_SPOTS.tagBoard.z - 2)).toBe(false);
  });
});

describe('HIRASAKA: the voices', () => {
  it('every line has its take on disk, and none is waiting for one', () => {
    const missing = LINES.filter((l) => !existsSync(`public/hirasaka/voice/${l.id}.mp3`)).map((l) => l.id);
    expect(missing).toEqual([]);
    expect(LINES.filter((l) => l.fresh).map((l) => l.id)).toEqual([]);
  });

  it('every line id is unique', () => {
    expect(new Set(LINES.map((l) => l.id)).size).toBe(LINES.length);
  });

  it('the cast: one voice per character, and no voice shared between characters', () => {
    const byWho = new Map<string, Set<string>>();
    for (const l of LINES) if (l.model === 'eleven') (byWho.get(l.who) ?? byWho.set(l.who, new Set()).get(l.who)!).add(l.voice ?? '');
    for (const [who, voices] of byWho) {
      expect(voices.has(''), `${who} has a line with no voice`).toBe(false);
      if (who === 'MINER') expect(voices.size).toBe(MINER_VOICES.length);
      else expect([...voices], `${who} speaks in more than one voice`).toEqual([CAST[who as keyof typeof CAST]]);
    }
    // every single voice (a chorus counts each of its voices) belongs to one character only
    const owner = new Map<string, string>();
    for (const [who, voices] of byWho)
      for (const v of voices)
        for (const one of v.split('+')) {
          expect(owner.get(one) ?? who, `${one} is both ${owner.get(one)} and ${who}`).toBe(who);
          owner.set(one, who);
        }
    for (const who of ['NATSUKI', 'DAIGO', 'GENZO', 'MIO', 'KUROGANE', 'FUNAYŪREI']) expect(byWho.has(who), who).toBe(true);
  });
});

describe('HIRASAKA: co-op', () => {
  it('the simulation runs the story, sends it on the wire, and ends it at the rock', () => {
    const sent: Record<string, unknown>[] = [];
    const sim = new SessionSim({ seed: 13, kind: 'mission', map: 'hirasaka', send: (_to, d) => sent.push(d) });
    sim.players([{ id: 'a', name: 'A' }]);
    sim.begin();
    const go = (o: Spot, secs: number): void => {
      for (let i = 0; i < secs * 30; i++) {
        sim.message('a', { k: 'p', x: o.x, y: o.y, z: o.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, true);
        sim.tick(1 / 30);
      }
    };
    const q = (): HirasakaStory => sim.hirasaka!;
    go({ x: 13, y: 0, z: 92 }, 1);
    expect(sim.zombies.boss).toBeNull(); // Kurogane waits for the hairpin
    // (the simulation routes the old action names; the new ones arrive through `act` once it does)
    go(JOBS.key.key, 0.2);
    sim.message('a', { k: 'hs', a: 'key' }, true);
    expect(HirasakaStory.isDone(q().view, 'key')).toBe(true);
    islandJobs(q(), ['steam', 'air']);
    sinkTheUmibozu(q());
    go(CAGE.top, 0.2);
    sim.message('a', { k: 'hs', a: 'cage' }, true);
    expect(q().view.act).toBe(ACT.deep);
    q().act('ladles', 0, at(LADLES));
    q().act('knock', 0, at(DEEP_SPOTS.bench));
    q().act('funa', 0, at(DEEP_SPOTS.funa));
    q().act('open', OBSTACLE.roots!, at(DEEP_SPOTS.hairpin));
    go(DEEP_SPOTS.hairpin, 0.3);
    sim.message('a', { k: 'hs', a: 'hairpin' }, true);
    go(DEEP_SPOTS.hairpin, 0.3);
    expect(sim.zombies.boss?.variant).toBe('overseer');
    const b = sim.zombies.boss!;
    // (hs-bosses) his thunders are his fight's (`hirasakaBosses.test.ts`): here every one is broken at once
    (sim as unknown as { hirasakaDir: { kuro: { endNow(k: unknown): void } } }).hirasakaDir.kuro.endNow(b);
    b.takeDamage(1e6, true, (sim as unknown as { peers: Map<string, { env: never }> }).peers.get('a')!.env, 0);
    go(DEEP_SPOTS.peaches, 1);
    expect(q().view.act).toBe(ACT.climb);
    expect(sim.zombies.zombies.some((z) => z.variant === 'follower' && z.alive && z.invulnerable)).toBe(true);
    expect(sim.level.hirasaka!.aditLink.closed).toBe(false);
    // up the climb's marks (the sea follows), then the winches
    for (const m of CLIMB_MARKS) go(m.at, 0.2);
    expect(q().view.mark).toBe(CLIMB_MARKS.length - 1);
    const mio = sim.zombies.zombies.find((z) => z.variant === 'follower')!;
    mio.x = ADIT.out.x + 40;
    for (let t = 0; t < 200 && q().view.act === ACT.climb; t++) {
      go(ROCK.winches[0]!, 0.4);
      q().act('crank', 0, at(ROCK.winches[0]!), 0);
    }
    expect(q().view.ending).toBe(1);
    expect(sent.some((d) => Array.isArray((d as { hs?: unknown }).hs))).toBe(true);
  });
});
