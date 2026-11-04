/**
 * HIRASAKA, "The Slope Between": the story (`hirasaka/story.ts`) act by act, the island and the mine built so every
 * place the story sends you is walkable, its kinds dressed and cast, its voices and score on disk, and a co-op
 * simulation running the island from the first job to the stone.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { CUES, LINES } from '../src/hirasaka/lines';
import { HIRASAKA_CAST } from '../src/anime/cast';
import { KIND_LOOKS } from '../src/anime/looks';
import { ANIME_CAST } from '../src/config';
import { HIRASAKA_KINDS, hirasakaVariant } from '../src/enemies/variants';
import { ACT, decodeStory, encodeStory, HIRASAKA_STORY, HirasakaStory } from '../src/hirasaka/story';
import { HIRASAKA, PHOTOS, PLACES, SURGE, TAPES, TIERS } from '../src/hirasaka/places';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { FlowField } from '../src/world/nav';
import { ZombieManager } from '../src/enemies/zombieManager';
import { createNullRigFactory } from '../src/sim/nullRig';
import { HirasakaDirector } from '../src/hirasaka/director';
import { Rng } from '../src/logic/rng';

const up = (o: { x: number; y?: number; z: number }) => [{ x: o.x, y: o.y ?? 0, z: o.z, up: true }];
const Y4 = TIERS[4].y;

/** Act I, the honest way: the key, the lighthouse, the three gates. */
function island(q: HirasakaStory): void {
  expect(q.takeKey(PLACES.key.x, PLACES.key.y, PLACES.key.z)).toBe(true);
  expect(q.startGenerator(PLACES.generator.x, PLACES.generator.y, PLACES.generator.z)).toBe(true);
  for (let t = 0; t < HIRASAKA_STORY.charge + 1; t += 0.5) q.tick(0.5, up({ ...PLACES.summit, y: Y4 }));
  PLACES.valves.forEach((v, i) => expect(q.openValve(i, v.x, v.y, v.z)).toBe(true));
}

describe('HIRASAKA: the story', () => {
  it('act I: three jobs in any order get the cage running', () => {
    const q = new HirasakaStory();
    q.reset(() => 0.5);
    expect(q.rideCage(HIRASAKA.cage.x, HIRASAKA.cage.z)).toBe(false); // dead until the jobs are done
    island(q);
    expect(HirasakaStory.ready(q.view)).toBe(true);
    const kinds = q.drain().map((e) => e.kind);
    expect(kinds.filter((k) => k === 'done').length).toBe(3);
    expect(kinds).toContain('ready');
    expect(q.rideCage(HIRASAKA.cage.x, HIRASAKA.cage.z)).toBe(true);
    expect(q.view.act).toBe(ACT.deep);
  });

  it('every step checks where you are (and how high)', () => {
    const q = new HirasakaStory();
    q.reset(() => 0.5);
    expect(q.takeKey(0, 0, 0)).toBe(false);
    // right under Genzō's room, on the tier below: too low
    expect(q.takeKey(PLACES.key.x, 10.8, PLACES.key.z)).toBe(false);
    expect(q.takeKey(PLACES.key.x, 18, PLACES.key.z)).toBe(true);
    expect(q.takeKey(PLACES.key.x, 18, PLACES.key.z)).toBe(false); // once
    // the generator only catches with someone on the summit
    q.startGenerator(PLACES.generator.x, PLACES.generator.y, PLACES.generator.z);
    q.tick(10, up({ x: 0, y: 0, z: 40 }));
    expect(q.view.charge).toBe(0);
    q.tick(10, up({ ...PLACES.summit, y: Y4 }));
    expect(q.view.charge).toBeGreaterThan(0.2);
    expect(q.takeHairpin(PLACES.hairpin.x, PLACES.hairpin.z)).toBe(false); // nobody has gone down yet
  });

  it('the waves come over the seawall in act I, with a warning first', () => {
    const q = new HirasakaStory();
    q.reset(() => 0.5);
    const seen: string[] = [];
    for (let t = 0; t < 45; t += 0.25) {
      q.tick(0.25, []);
      seen.push(...q.drain().map((e) => e.kind));
    }
    expect(seen.indexOf('waveWarn')).toBeGreaterThanOrEqual(0);
    expect(seen.indexOf('wave')).toBeGreaterThan(seen.indexOf('waveWarn'));
  });

  it('acts II and III: the peaches, the hairpin, the cable, the adit, the surge, the stone', () => {
    const q = new HirasakaStory();
    q.reset(() => 0.5);
    island(q);
    q.rideCage(HIRASAKA.cage.x, HIRASAKA.cage.z);
    expect(q.takePeaches(PLACES.peaches.x, PLACES.peaches.z)).toBe(true);
    expect(q.takeHairpin(PLACES.hairpin.x, PLACES.hairpin.z)).toBe(true);
    q.overseerDown();
    expect(q.view.act).toBe(ACT.climb);
    expect(q.rideCage(HIRASAKA.cage.x, HIRASAKA.cage.z)).toBe(false); // the cable has gone
    // nothing rises and nothing rolls until someone is out of the adit
    q.tick(60, up({ ...HIRASAKA.stonePush, y: Y4 }));
    expect(q.view.surge).toBe(0);
    expect(q.view.push).toBe(0);
    expect(q.surface(HIRASAKA.aditOut.x, HIRASAKA.aditOut.z)).toBe(true);
    // the surge climbs the island step by step and never reaches the summit
    q.tick(SURGE[1]!.at + 1, []);
    expect(q.view.surge).toBe(2);
    expect(HirasakaStory.seaLevel(q.view)).toBeGreaterThan(TIERS[1].y);
    q.tick(1000, []);
    expect(HirasakaStory.seaLevel(q.view)).toBeLessThan(Y4);
    // while she leans on it the stone only creeps (never stuck); one pusher rolls it home in `push` seconds
    q.tick(4, up({ ...HIRASAKA.stonePush, y: Y4 }), true);
    expect(q.view.held).toBe(true);
    expect(q.view.push).toBeCloseTo((4 / HIRASAKA_STORY.push) * HIRASAKA_STORY.heldRate, 5);
    expect(q.view.push).toBeGreaterThan(0);
    for (let t = 0; t < HIRASAKA_STORY.push + 1; t += 0.5) q.tick(0.5, up({ ...HIRASAKA.stonePush, y: Y4 }));
    expect(q.view.act).toBe(ACT.won);
    expect(q.view.ending).toBe(1);
    expect(q.drain().map((e) => e.kind)).toContain('sealed');
  });

  it('two pushers roll it faster than one', () => {
    const run = (n: number): number => {
      const q = new HirasakaStory();
      q.reset(() => 0.5);
      island(q);
      q.rideCage(HIRASAKA.cage.x, HIRASAKA.cage.z);
      q.takeHairpin(PLACES.hairpin.x, PLACES.hairpin.z);
      q.overseerDown();
      q.surface(HIRASAKA.aditOut.x, HIRASAKA.aditOut.z);
      const who = Array.from({ length: n }, () => ({ ...HIRASAKA.stonePush, y: Y4, up: true }));
      q.tick(10, who);
      return q.view.push;
    };
    expect(run(2)).toBeGreaterThan(run(1));
  });

  it('the other ending: every photograph, the call, and turn round at the stone', () => {
    const q = new HirasakaStory();
    q.reset(() => 0.5);
    island(q);
    q.rideCage(HIRASAKA.cage.x, HIRASAKA.cage.z);
    expect(q.answer(PLACES.phone.x, PLACES.phone.z)).toBe(false); // not until every photograph
    PHOTOS.forEach((p, i) => expect(q.takePhoto(i, p.x, p.y, p.z)).toBe(true));
    TAPES.forEach((t, i) => expect(q.takeTape(i, t.x, t.y, t.z)).toBe(true));
    expect(q.answer(PLACES.phone.x, PLACES.phone.z)).toBe(true);
    q.takeHairpin(PLACES.hairpin.x, PLACES.hairpin.z);
    q.overseerDown();
    expect(q.turnAround(HIRASAKA.stonePush.x, Y4, HIRASAKA.stonePush.z)).toBe(false); // still in the mine
    q.surface(HIRASAKA.aditOut.x, HIRASAKA.aditOut.z);
    expect(q.turnAround(HIRASAKA.stonePush.x, Y4, HIRASAKA.stonePush.z)).toBe(true);
    expect(q.view.ending).toBe(2);
  });

  it('looks back count only on the climb, once in a while per player', () => {
    const q = new HirasakaStory();
    q.reset(() => 0.5);
    expect(q.look(0)).toBe(false);
    island(q);
    q.rideCage(HIRASAKA.cage.x, HIRASAKA.cage.z);
    q.takeHairpin(PLACES.hairpin.x, PLACES.hairpin.z);
    q.overseerDown();
    expect(q.look(0)).toBe(true);
    expect(q.look(0)).toBe(false);
    expect(q.look(1)).toBe(true);
    q.tick(HIRASAKA_STORY.lookEvery + 0.1, []);
    expect(q.look(0)).toBe(true);
    expect(q.view.looks).toBe(3);
  });

  it('the wire carries the whole story', () => {
    const q = new HirasakaStory();
    q.reset(() => 0.5);
    island(q);
    q.tick(3.21, []);
    expect(decodeStory(encodeStory(q.view))).toEqual({ ...q.view, charge: Math.round(q.view.charge * 100) / 100, wave: Math.round(q.view.wave * 10) / 10, surgeT: Math.round(q.view.surgeT * 10) / 10 });
    expect(decodeStory([1, 2])).toBeNull();
  });
});

describe('HIRASAKA: the island and the mine', () => {
  const sim = new SessionSim({ map: 'hirasaka', send: () => {} });
  const level = sim.level;
  const field = new FlowField(level.nav);
  const st = level.data.playerStart;
  field.compute(st.x, st.z);
  const mine = level.hirasaka!.mineArea;
  const mineNav = level.floors.navOf(mine);
  const mineField = new FlowField(mineNav);
  mineField.compute(HIRASAKA.cageBottom.x + 2.8, HIRASAKA.cageBottom.z);

  it('every place on the island the story sends you can be walked to from the pier', () => {
    const points: [string, number, number][] = [
      ['key', PLACES.key.x, PLACES.key.z],
      ['generator', PLACES.generator.x - 2, PLACES.generator.z],
      ['cage', HIRASAKA.cage.x, HIRASAKA.cage.z + 3],
      ['adit', HIRASAKA.aditOut.x, HIRASAKA.aditOut.z],
      ['stone', HIRASAKA.stonePush.x, HIRASAKA.stonePush.z],
      ['school roof', -20, -5],
      ...PLACES.valves.map((v, i) => [`valve${i}`, v.x, v.z - 1.5] as [string, number, number]),
      ...TAPES.filter((t) => t.x < 100).map((t, i) => [`tape${i}`, t.x, t.z] as [string, number, number]),
      ...PHOTOS.filter((t) => t.x < 100).map((t, i) => [`photo${i}`, t.x, t.z] as [string, number, number]),
    ];
    const cut = points.filter(([, x, z]) => !field.isReachable(x, z)).map(([n]) => n);
    expect(cut).toEqual([]);
  });

  it('every place in the mine can be walked to from the bottom of the cage, up to the top of the Slope', () => {
    const points: [string, number, number][] = [
      ['peaches', PLACES.peaches.x, PLACES.peaches.z - 3],
      ['hairpin', PLACES.hairpin.x, PLACES.hairpin.z],
      ['phone', PLACES.phone.x, PLACES.phone.z],
      ['slope door', HIRASAKA.slopeDoor.x + 1.5, HIRASAKA.slopeDoor.z],
      ['kurogane', level.data.hunt.wardenX, level.data.hunt.wardenZ],
      ...TAPES.filter((t) => t.x > 100).map((t, i) => [`tape${i}`, t.x, t.z] as [string, number, number]),
      ...PHOTOS.filter((t) => t.x > 100).map((t, i) => [`photo${i}`, t.x, t.z] as [string, number, number]),
    ];
    const cut = points.filter(([, x, z]) => !mineField.isReachable(x, z)).map(([n]) => n);
    expect(cut).toEqual([]);
  });

  it('every spawn point and every infected placed at the start stands on open ground it can walk from', () => {
    const pts = [...level.data.spawnPoints, ...level.data.ambient];
    const cut = pts.filter((p) => !(p.x > 100 ? mineField : field).isReachable(p.x, p.z)).map((p) => `${p.x},${p.z}`);
    expect(cut).toEqual([]);
  });

  it('the infected are put on the floor where they spawn (a tier, the school roof), never under it', () => {
    const zm = new ZombieManager(createNullRigFactory(), level);
    const rng = new Rng(7);
    for (const t of TIERS) {
      const z = zm.spawn('shambler', 10, (t.z0 + t.z1) / 2, rng);
      expect(z.y).toBeCloseTo(t.y, 1);
    }
    expect(zm.spawn('shambler', -20, -5, rng).y).toBeCloseTo(10.8, 1);
    expect(zm.spawn('shambler', 150, 30, rng).area).toBe(mine);
  });

  it('a loud moment draws the dead in (the spawn rate rises for a while) instead of spawning them out of the air', () => {
    const zm = new ZombieManager(createNullRigFactory(), level);
    const dir = new HirasakaDirector(level, zm);
    const rng = new Rng(3);
    const v = HirasakaStory.empty();
    const before = zm.zombies.length;
    dir.onEvent({ kind: 'valve', i: 0, n: 1 }, v, rng);
    dir.onEvent({ kind: 'done', job: 'key', n: 1 }, v, rng);
    expect(zm.zombies.length).toBe(before);
    dir.step(0.1, v, [], rng);
    expect(zm.rateMul).toBeGreaterThan(2);
    expect(zm.capBonus).toBeGreaterThan(0);
    expect(['drowned', 'resident']).toContain(dir.lureVariant);
    for (let t = 0; t < 40; t += 0.5) dir.step(0.5, v, [], rng);
    expect(zm.rateMul).toBe(1);
    expect(zm.capBonus).toBe(0);
  });

  it("Genzō's tapes, the photographs and his key lie well apart (what one says never runs into another)", () => {
    const things: { x: number; y?: number; z: number }[] = [...TAPES, ...PHOTOS, PLACES.key];
    for (let i = 0; i < things.length; i++) {
      for (let j = i + 1; j < things.length; j++) {
        const a = things[i]!;
        const b = things[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z, (a.y ?? 0) - (b.y ?? 0))).toBeGreaterThan(8);
      }
    }
  });

  it('the island climbs: each tier is its height, and the summit is the highest walkable ground', () => {
    for (const t of TIERS) expect(level.world.floorHeight(10, (t.z0 + t.z1) / 2, 0.3)).toBeCloseTo(t.y, 1);
    expect(level.world.floorHeight(-36, -19.5, 0.3)).toBeCloseTo(18, 1); // Genzō's ledge, up the outside stair
    expect(level.world.floorHeight(-20, -5, 0.3)).toBeCloseTo(10.8, 1); // the school roof
  });

  it('the cage is the players\' only (the infected never ride it); the adit opens on the climb', () => {
    expect(level.hirasaka!.cageLink.closed).toBe(true);
    expect(level.hirasaka!.aditLink.closed).toBe(true);
  });
});

describe('HIRASAKA: the cast, the voices, the score', () => {
  it('every kind of the island wears its own body and look, loaded before the run', () => {
    for (const k of HIRASAKA_KINDS) {
      expect(KIND_LOOKS[k]).toBeDefined();
      expect(HIRASAKA_CAST).toContain(ANIME_CAST.kinds[k]);
    }
    expect(hirasakaVariant('warden', 0, 0, () => 0.5)).toBe('overseer');
    expect(hirasakaVariant('runner', 150, 30, () => 0.1)).toBe('lampeater');
    expect(hirasakaVariant('shambler', 0, 40, () => 0.1)).toBe('drowned');
  });

  it('every line and every cue is on disk', () => {
    const missing = [...LINES.map((l) => `public/hirasaka/voice/${l.id}.mp3`), ...CUES.map((c) => `public/hirasaka/music/${c.id}.mp3`)].filter((f) => !existsSync(f));
    expect(missing).toEqual([]);
  });
});

describe('HIRASAKA: co-op', () => {
  it('the simulation runs the island: the jobs, the cage, Kurogane, the climb and the stone', () => {
    const sent: Record<string, unknown>[] = [];
    const sim = new SessionSim({ seed: 13, kind: 'mission', map: 'hirasaka', send: (_to, d) => sent.push(d) });
    sim.players([{ id: 'a', name: 'A' }]);
    sim.begin();
    const go = (o: { x: number; y?: number; z: number }, secs: number): void => {
      for (let i = 0; i < secs * 30; i++) {
        sim.message('a', { k: 'p', x: o.x, y: o.y ?? 0, z: o.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, true);
        sim.tick(1 / 30);
      }
    };
    const q = (): HirasakaStory => sim.hirasaka!;
    go(HIRASAKA.start, 1);
    expect(sim.zombies.boss).toBeNull(); // Kurogane waits for the hairpin
    go(PLACES.key, 0.3);
    sim.message('a', { k: 'hs', a: 'key' }, true);
    go(PLACES.generator, 0.3);
    sim.message('a', { k: 'hs', a: 'gen' }, true);
    go({ ...PLACES.summit, y: Y4 }, 1);
    expect(q().view.charge).toBeGreaterThan(0);
    q().view.charge = 0.995; // the rest of the hold (its own test above)
    go({ ...PLACES.summit, y: Y4 }, 1);
    PLACES.valves.forEach((v, i) => {
      go(v, 0.2);
      sim.message('a', { k: 'hs', a: 'valve', i }, true);
    });
    go(HIRASAKA.cage, 0.2);
    expect(HirasakaStory.ready(q().view)).toBe(true);
    sim.message('a', { k: 'hs', a: 'cage' }, true);
    go(HIRASAKA.cageBottom, 0.3);
    expect(q().view.act).toBe(ACT.deep);
    go(PLACES.hairpin, 0.3);
    sim.message('a', { k: 'hs', a: 'hairpin' }, true);
    go(PLACES.hairpin, 0.3);
    expect(sim.zombies.boss?.variant).toBe('overseer');
    // Kurogane falls: the climb, and Mio
    const b = sim.zombies.boss!;
    b.hp = 0;
    b.takeDamage(1e6, true, (sim as unknown as { peers: Map<string, { env: never }> }).peers.get('a')!.env, 0);
    go(PLACES.hairpin, 1);
    expect(q().view.act).toBe(ACT.climb);
    expect(sim.zombies.zombies.some((z) => z.variant === 'follower' && z.alive && z.invulnerable)).toBe(true);
    expect(sim.level.hirasaka!.aditLink.closed).toBe(false);
    go(HIRASAKA.aditOut, 0.2);
    sim.message('a', { k: 'hs', a: 'surface' }, true);
    go({ ...HIRASAKA.stonePush, y: Y4 }, 0.5);
    expect(q().view.surfaced).toBe(true);
    // keep her off the stone (a peach), and push it home
    const mio = sim.zombies.zombies.find((z) => z.variant === 'follower')!;
    mio.x = 150;
    mio.z = -33;
    go({ ...HIRASAKA.stonePush, y: Y4 }, 1);
    expect(q().view.push).toBeGreaterThan(0);
    q().view.push = 0.97; // the rest of the push (its own test above)
    go({ ...HIRASAKA.stonePush, y: Y4 }, 2);
    expect(q().view.ending).toBe(1);
    expect(sent.some((d) => Array.isArray((d as { hs?: unknown }).hs))).toBe(true);
  });
});
