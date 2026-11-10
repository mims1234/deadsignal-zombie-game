/**
 * ZARYA's infected (`src/zarya/director.ts`) as the co-op simulation runs them (`src/sim/serverHost.ts`): the real
 * director against the real zombie manager on the real map, headless. One player (Mira) is reported wherever a test
 * needs her; the story is the simulation's own.
 */
import '../src/sim/stubs';
import { describe, expect, it, vi } from 'vitest';
import type { Zombie } from '../src/enemies/zombie';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import type { ZaryaDirector } from '../src/zarya/director';
import { BERLOGA, CANTEEN, DK, RYNOK, ZARYA, inRect, type Rect, type ZaryaZone } from '../src/zarya/places';
import { AT, CH, DOLLS, G, STORY, ZaryaStory } from '../src/zarya/story';
import { yawTo } from '../src/zarya/types';

type Spot = { x: number; z: number };
/** The story's own state, set outright: a test's way past the hours of play that lead to a moment. */
type Jump = Partial<Record<'ch' | 'f' | 'g' | 'm' | 'clues' | 'covered' | 'end', number>>;

// the town takes a few seconds to build: every test is a fresh run of the one simulation
vi.setConfig({ testTimeout: 120_000 });
const sim = new SessionSim({ seed: 7, kind: 'mission', map: 'zarya', send: () => {} });

function town() {
  sim.players([{ id: 'p1', name: 'Mira' }]);
  sim.begin();
  const story = sim.zarya!;
  const dir = (sim as unknown as { zaryaDir: ZaryaDirector }).zaryaDir;
  const me: Spot = { x: ZARYA.start.x, z: ZARYA.start.z };
  const go = (p: Spot): void => {
    me.x = p.x;
    me.z = p.z;
  };
  /** Run the simulation (one frame unless told longer), Mira reporting where she stands. */
  const run = (seconds = 0): void => {
    for (let i = 0, n = Math.max(1, Math.round(seconds * 30)); i < n; i++) {
      if (i % 3 === 0) sim.message('p1', { k: 'p', x: me.x, y: 0, z: me.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
      sim.tick(1 / 30);
    }
  };
  /** Mira's hardest blow (the simulation lets no single hit do more). */
  const hit = (z: Zombie): void => sim.message('p1', { k: 'hit', z: z.id, a: 600, h: false, y: 0 }, false);
  const kill = (z: Zombie): void => {
    for (let i = 0; i < 60 && z.alive; i++) hit(z);
  };
  const jump = (patch: Jump): void => void Object.assign(story as unknown as Record<string, number>, patch);
  const did = (flag: number): boolean => ZaryaStory.did(story.view, flag);
  /** The infected on their feet inside `r`, the named bosses aside. */
  const crowd = (r: Rect): Zombie[] => sim.zombies.zombies.filter((z) => z.alive && !z.isBoss && inRect(r, z.x, z.z));
  const points = (zone: ZaryaZone): Spot[] => sim.level.data.spawnPoints.filter((p) => ZaryaStory.zoneOf(p.x, p.z) === zone);
  const allowed = (p: Spot): boolean => sim.zombies.spawnAllowed!(p.x, p.z);
  return { sim, story, dir, go, run, hit, kill, jump, did, crowd, points, allowed };
}

const near = (a: Spot, b: Spot): number => Math.hypot(a.x - b.x, a.z - b.z);
const facing = (z: Zombie, dx: number): number => Math.cos(z.yaw - yawTo(0, 0, dx, 0));

describe('where the infected may come from', () => {
  it('nowhere before the town sleeps, only in the zones the squad can reach after, nowhere once it has ended', () => {
    const t = town();
    const all = t.sim.level.data.spawnPoints;
    for (const zone of ['square', 'store', 'rynok', 'dk', 'canteen', 'berloga'] as const) expect(t.points(zone).length).toBeGreaterThan(0);

    // the town awake: nobody, anywhere
    t.run(4);
    expect(all.some(t.allowed)).toBe(false);
    expect(t.sim.zombies.zombies.length).toBe(0);

    // asleep, and the store open (Gena is down): the square and the store, nothing past a shut gate
    t.story.step([{ x: 375, z: 0, up: true }]);
    expect(t.story.act('arm', 0, AT.arm)).toBe(true);
    t.run();
    expect(all.some(t.allowed)).toBe(false);
    expect(t.story.act('release', 0, AT.release)).toBe(true);
    t.story.note('gena');
    t.run();
    expect(t.story.view.ch).toBe(CH.town);
    expect(t.points('square').every(t.allowed)).toBe(true);
    expect(t.points('store').every(t.allowed)).toBe(true);
    expect(all.filter(t.allowed).every((p) => ['square', 'store'].includes(ZaryaStory.zoneOf(p.x, p.z)!))).toBe(true);

    // the tram runs: the Rynok and the Dvor; the Palace only with tickets
    t.jump({ ch: CH.act2 });
    t.run();
    expect(t.points('rynok').every(t.allowed)).toBe(true);
    expect(t.points('dk').some(t.allowed)).toBe(false);
    expect(t.points('depot').some(t.allowed)).toBe(false);
    expect(t.story.act('tickets', 0, AT.tickets)).toBe(true);
    t.run();
    expect(t.points('dk').every(t.allowed)).toBe(true);
    // the two rooms beside the map are never the ordinary spawner's (the director walks their people in itself)
    expect(t.story.act('escalator', 0, AT.escalator, true)).toBe(true);
    t.run();
    expect(t.points('canteen').some(t.allowed)).toBe(false);
    expect(t.points('berloga').some(t.allowed)).toBe(false);

    // an ending: nowhere again
    t.jump({ ch: CH.ended, end: 2 });
    t.run();
    expect(all.some(t.allowed)).toBe(false);
  });
});

describe('Act I still plays', () => {
  it('stands Gena in the hall when the door is released, and opens the town when he is down', () => {
    const t = town();
    t.story.step([{ x: 375, z: 0, up: true }]);
    t.story.act('arm', 0, AT.arm);
    t.story.act('release', 0, AT.release);
    t.run();
    const gena = t.sim.zombies.zombies.find((z) => z.tag === 'GENA')!;
    expect(near(gena, ZARYA.gena)).toBeLessThan(1);
    expect(gena.variant).toBe('');
    t.kill(gena);
    t.run();
    expect(t.story.view.ch).toBe(CH.town);

    // near the jammed shutter: its guard wakes with his whistle, and his being down frees the plug
    expect(t.sim.zombies.zombies.some((z) => z.tag === 'THE GUARD')).toBe(false);
    t.go({ x: ZARYA.shutter.x + 6, z: ZARYA.shutter.z });
    t.run();
    const guard = t.sim.zombies.zombies.find((z) => z.tag === 'THE GUARD')!;
    expect(guard.variant).toBe('svistok');
    expect(ZaryaStory.can(t.story.view, 'plug')).toBe(false);
    t.kill(guard);
    t.run();
    expect(ZaryaStory.can(t.story.view, 'plug')).toBe(true);
  });
});

describe('Borya the Butcher', () => {
  it('stands blind until someone is near, cannot be killed, and is reported in and out of his cold store', () => {
    const t = town();
    t.jump({ ch: CH.act2 });
    t.run();
    const b = t.dir.where('borya')!;
    expect(b.tag).toBe('BORYA');
    expect(b.isBoss).toBe(true);
    expect(near(b, RYNOK.borya)).toBeLessThan(0.5);

    // thirty metres down the hall, in plain view: he does not stir
    t.go({ x: RYNOK.borya.x - 30, z: RYNOK.borya.z });
    t.run(2);
    expect(near(b, RYNOK.borya)).toBeLessThan(0.5);
    expect(b.chasing).toBe(false);
    expect(t.did(G.borya)).toBe(false);

    // within his sight: he hunts, and nothing puts him down
    t.go({ x: RYNOK.borya.x - 18, z: RYNOK.borya.z });
    t.run(0.2);
    expect(t.did(G.borya)).toBe(true);
    expect(b.chasing).toBe(true);
    for (let i = 0; i < 12; i++) t.hit(b);
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(b.maxHp);
    expect(t.dir.spared(b)).toBe(true); // Timur and Vera do not waste a round on him

    // led deep into the cold store (Mira at the hatch inside it): in
    const deep = { x: RYNOK.coldInside.x + 1, z: RYNOK.coldInside.z };
    t.go(RYNOK.hatchIn);
    Object.assign(b, deep);
    t.run();
    expect(t.did(G.boryaIn)).toBe(true);
    expect(ZaryaStory.can(t.story.view, 'bar')).toBe(true);
    // she climbs out: he stays at the hatch he cannot fit through, for as long as it takes her to get round to the door
    t.go(RYNOK.hatch);
    t.run(4);
    expect(t.did(G.boryaIn)).toBe(true);
    expect(b.chasing).toBe(false);
    expect(near(b, deep)).toBeLessThan(1.5);

    // she goes back in and he comes after her; out in the hall again he is reported out, and the door cannot be barred
    t.go(RYNOK.hatchIn);
    t.run(0.2);
    expect(b.chasing).toBe(true);
    t.go({ x: RYNOK.borya.x - 8, z: RYNOK.borya.z });
    Object.assign(b, { x: RYNOK.borya.x, z: RYNOK.borya.z });
    t.run();
    expect(t.did(G.boryaIn)).toBe(false);
    expect(t.story.act('bar', 0, RYNOK.bar)).toBe(false);

    // in again, and the door barred on him: shut in where he stands, harmless, still there
    t.go(RYNOK.hatch);
    Object.assign(b, deep);
    t.run();
    expect(t.story.act('bar', 0, RYNOK.bar)).toBe(true);
    t.go(RYNOK.bar);
    t.run(3);
    expect(t.sim.level.zarya!.coldDoor.blocksMove).toBe(true);
    expect(t.did(G.boryaIn)).toBe(true);
    expect(b.chasing).toBe(false);
    expect(near(b, deep)).toBeLessThan(1.5);
    t.hit(b);
    expect(t.dir.where('borya')).toBe(b);
  });
});

describe('Baba Yaga', () => {
  it('takes damage only while the hut faces the hall, never leaves it, and the hut goes back', () => {
    const t = town();
    t.jump({ ch: CH.act2 });
    t.run();
    expect(t.dir.where('yaga')).toBeNull();
    expect(t.story.act('tickets', 0, AT.tickets)).toBe(true);
    t.run();
    const y = t.dir.where('yaga')!;
    expect(y.tag).toBe('BABA YAGA');
    expect(near(y, DK.hut)).toBeLessThan(0.5);
    expect(facing(y, -1)).toBeGreaterThan(0.99);
    expect(t.did(G.yaga)).toBe(false);
    expect(ZaryaStory.can(t.story.view, 'lever')).toBe(false);

    // someone in the hall: she has noticed, and the lever means something
    t.go(DK.hallCentre);
    t.run();
    expect(t.did(G.yaga)).toBe(true);
    t.hit(y);
    expect(y.hp).toBe(y.maxHp);

    // the lever: the hut turns, and for a while a blow lands
    expect(t.story.act('lever', 0, DK.lever)).toBe(true);
    t.run(2.5);
    expect(facing(y, 1)).toBeGreaterThan(0.99);
    expect(t.dir.spared(y)).toBe(false); // the squad's guns are on her too
    t.hit(y);
    expect(y.hp).toBeLessThan(y.maxHp);
    expect(y.alive).toBe(true);

    // the hut goes back: the story's flag falls, and nothing lands again (Timur and Vera had their turn at her too)
    t.run(STORY.exposed);
    expect(t.did(G.exposed)).toBe(false);
    expect(ZaryaStory.can(t.story.view, 'lever')).toBe(true);
    const hurt = y.hp;
    expect(y.alive).toBe(true);
    t.run(2.5);
    expect(facing(y, -1)).toBeGreaterThan(0.99);
    t.hit(y);
    expect(y.hp).toBe(hurt);
    expect(t.dir.spared(y)).toBe(true);
    expect(near(y, DK.hut)).toBeLessThan(0.5);

    // pulled again, and this time she is finished: the Wheat key
    expect(t.story.act('lever', 0, DK.lever)).toBe(true);
    t.run();
    t.kill(y);
    t.run();
    expect(t.did(G.yagaDown)).toBe(true);
    expect(t.did(G.exposed)).toBe(false);
    expect(t.dir.where('yaga')).toBeNull();
    // one turn of the hut is not enough against a squad's built weapons: her health is about three turns' worth
    expect(y.maxHp).toBeGreaterThan(600 * 6);
  });
});

describe('the Tamada', () => {
  it('cannot be hurt until all three loudspeakers are unplugged, and his toasts bring the party to its feet', () => {
    const t = town();
    t.jump({ ch: CH.act2 });
    t.run();
    expect(t.story.act('escalator', 0, AT.escalator)).toBe(false); // bare hands do not break a padlock
    expect(t.story.act('escalator', 0, AT.escalator, true)).toBe(true);
    t.run();
    const m = t.dir.where('tamada')!;
    expect(m.tag).toBe('THE TAMADA');
    expect(near(m, CANTEEN.tamada)).toBeLessThan(0.5);
    expect(t.did(G.tamada)).toBe(false);
    expect(t.crowd(CANTEEN.rect).length).toBe(0);

    // up the escalator: he notices, he toasts, the party comes in by its own doors
    t.go(CANTEEN.head);
    t.run(8);
    expect(t.did(G.tamada)).toBe(true);
    const party = t.crowd(CANTEEN.rect).length;
    expect(party).toBeGreaterThan(0);
    expect(party).toBeLessThanOrEqual(6);
    expect(near(m, CANTEEN.tamada)).toBeLessThan(0.5);
    t.hit(m);
    expect(m.hp).toBe(m.maxHp);

    // two plugs out: still on his stage, still nothing lands
    expect(t.story.act('unplug', 0, CANTEEN.plugs[0]!)).toBe(true);
    expect(t.story.act('unplug', 1, CANTEEN.plugs[1]!)).toBe(true);
    t.run(0.5);
    t.hit(m);
    expect(m.hp).toBe(m.maxHp);
    expect(m.chasing).toBe(false);

    // the third: he comes down, and he can be put down (the Dove key)
    expect(t.story.act('unplug', 2, CANTEEN.plugs[2]!)).toBe(true);
    t.run(0.2);
    expect(m.chasing).toBe(true);
    t.hit(m);
    expect(m.hp).toBeLessThan(m.maxHp);
    t.kill(m);
    t.run();
    expect(t.did(G.tamadaDown)).toBe(true);
    expect(t.dir.where('tamada')).toBeNull();
  });
});

describe('Morozko', () => {
  /** The four keys in the door, `covered` sleepers kept warm, and Mira across the line where he asks. */
  const asked = (covered: number) => {
    const t = town();
    t.jump({ ch: CH.finale, g: G.keyDoor, covered: (1 << covered) - 1 });
    t.run();
    const m = t.dir.where('morozko')!;
    expect(m.tag).toBe('MOROZKO');
    expect(near(m, BERLOGA.morozko)).toBeLessThan(0.5);
    // before he has asked, nothing lands
    t.hit(m);
    expect(m.hp).toBe(m.maxHp);
    expect(t.did(G.asked)).toBe(false);
    t.go({ x: BERLOGA.askLine + 2, z: 0 });
    t.run(2);
    expect(t.did(G.asked)).toBe(true);
    expect(m.chasing).toBe(false);
    // a blow would land now, and start it: that is Mira's to choose, so the squad's guns stay off him
    expect(m.invulnerable).toBe(false);
    expect(t.dir.spared(m)).toBe(true);
    return { ...t, m };
  };

  it('does not fight a squad he believed', () => {
    const t = asked(STORY.warm);
    expect(t.story.act('answer', 0, { x: t.m.x - 5, z: t.m.z })).toBe(true);
    expect(t.did(G.believed)).toBe(true);
    // right up to him, and a blow for good measure: he stands, and the hall stays quiet
    t.go({ x: t.m.x - 1.5, z: t.m.z });
    t.run(4);
    t.hit(t.m);
    t.run(2);
    expect(t.m.chasing).toBe(false);
    expect(t.m.hp).toBe(t.m.maxHp);
    expect(near(t.m, BERLOGA.morozko)).toBeLessThan(0.5);
    expect(t.crowd(BERLOGA.rect).length).toBe(0);
    expect(ZaryaStory.can(t.story.view, 'turn', 0)).toBe(true);
  });

  it('can be answered from where the answer is given without the fight starting first', () => {
    const t = asked(0);
    // five metres off: inside the answer's reach, outside his
    t.go({ x: t.m.x - 5, z: t.m.z });
    t.run(2);
    expect(t.m.chasing).toBe(false);
    expect(ZaryaStory.can(t.story.view, 'answer')).toBe(true);
  });

  it('fights the moment an answer is not believed, with less health for every clue found, and the hall stops when he falls', () => {
    const t = asked(STORY.warm - 1);
    const full = t.m.maxHp;
    t.jump({ clues: 0b111 });
    t.run();
    expect(t.m.maxHp).toBeCloseTo((full * 2.1) / 2.4, 3);
    t.jump({ clues: 0xfff });
    t.run();
    expect(t.m.maxHp).toBeCloseTo(full / 2, 3);
    expect(t.m.hp).toBe(t.m.maxHp);

    expect(t.story.act('answer', 0, { x: t.m.x - 5, z: t.m.z })).toBe(true);
    expect(t.did(G.believed)).toBe(false);
    t.go({ x: t.m.x - 12, z: t.m.z });
    t.run(0.2);
    expect(t.m.chasing).toBe(true);
    expect(t.dir.spared(t.m)).toBe(false);
    t.hit(t.m);
    expect(t.m.hp).toBeLessThan(t.m.maxHp);
    // the hall's sleepers wake for as long as he stands
    t.run(10);
    expect(t.crowd(BERLOGA.rect).length).toBeGreaterThan(0);
    expect(t.crowd(BERLOGA.rect).some((z) => z.chasing)).toBe(true);

    t.kill(t.m);
    t.run(1.5);
    expect(t.did(G.morozkoDown)).toBe(true);
    expect(t.crowd(BERLOGA.rect).length).toBeGreaterThan(0);
    expect(t.crowd(BERLOGA.rect).some((z) => z.chasing)).toBe(false);
    const n = t.crowd(BERLOGA.rect).length;
    t.run(8);
    expect(t.crowd(BERLOGA.rect).length).toBe(n);
  });

  it('fights when he is struck after he has asked', () => {
    const t = asked(0);
    t.hit(t.m);
    t.run(0.2);
    expect(t.m.chasing).toBe(true);
  });
});

describe('the matryoshkas and the ending', () => {
  it('counts a kill made near a matryoshka, and not one made far from all of them', () => {
    const t = town();
    t.jump({ ch: CH.act2 });
    t.run();
    const rng = new Rng(3);
    const count = (i: number): number => (t.story.view.dolls >> (i * 6)) & 63;
    const before = [0, 1, 2].map(count);
    const i = DOLLS.findIndex((d) => d.x === RYNOK.doll.x && d.z === RYNOK.doll.z);
    const a = t.sim.zombies.spawn('shambler', RYNOK.doll.x + 3, RYNOK.doll.z, rng);
    const far = t.sim.zombies.spawn('shambler', RYNOK.rect.x1 - 4, RYNOK.rect.z1 - 4, rng);
    expect(DOLLS.every((d) => near(d, far) > STORY.dollReach)).toBe(true);
    t.kill(a);
    t.kill(far);
    t.run();
    expect(count(i)).toBe(before[i]! + 1);
    expect([0, 1, 2].filter((k) => k !== i).map(count)).toEqual([0, 1, 2].filter((k) => k !== i).map((k) => before[k]));
    // counted once, however long the body lies there
    t.run(2);
    expect(count(i)).toBe(before[i]! + 1);
  });

  it('stops every infected where it stands when the fourth key turns, and the run ends won', () => {
    const t = town();
    t.jump({ ch: CH.finale, g: G.keyDoor | G.asked | G.answered | G.believed });
    // Mira out on the square with a pack after her (the keys are turned from the console, as the story checks)
    const mira = { x: 0, z: 30 };
    t.go(mira);
    t.run();
    const rng = new Rng(5);
    const pack = [0, 1, 2].map((k) => t.sim.zombies.spawn('runner', mira.x + 14 + k * 2, mira.z, rng));
    for (const z of pack) z.aggro(mira.x, mira.z);
    t.run(0.5);
    expect(pack.every((z) => z.chasing)).toBe(true);

    for (let i = 0; i < 4; i++) expect(t.story.act('turn', i, BERLOGA.keys[i]!)).toBe(true);
    expect(t.story.view.end).toBe(3);
    t.run();
    const up = t.sim.zombies.zombies.filter((z) => z.alive);
    expect(up.length).toBeGreaterThanOrEqual(pack.length);
    expect(up.some((z) => z.chasing)).toBe(false);
    expect(t.sim.level.data.spawnPoints.some(t.allowed)).toBe(false);
    const where = pack.map((z) => ({ x: z.x, z: z.z }));
    t.run(6);
    expect(t.sim.zombies.zombies.filter((z) => z.alive).length).toBe(up.length);
    expect(t.sim.zombies.zombies.some((z) => z.alive && z.chasing)).toBe(false);
    pack.forEach((z, k) => expect(near(z, where[k]!)).toBeLessThan(0.3));

    // the ending's last lines, then the results
    expect(t.sim.stats().outcome).toBeNull();
    t.run(16);
    expect(t.sim.stats().outcome).toBe('won: Warm');
  });
});
