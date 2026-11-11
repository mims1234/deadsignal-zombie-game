import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { MYSTERY_BOX, ROCKET, WEAPONS, ZARYA_GUNS } from '../src/config';
import { createCarried } from '../src/logic/economy';
import { reelFor, prizeKey } from '../src/logic/mysteryBox';
import { decodePrize } from '../src/logic/sharedLoot';
import { getWeaponStats } from '../src/logic/weaponStats';
import { ZARYA_BASE, ZARYA_GUN_IDS, fanYaws, gaugeLock, inCone, isZaryaGun, stepGauge } from '../src/logic/zaryaGuns';
import { Rng } from '../src/logic/rng';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import type { MapId } from '../src/world/layout/data';

describe("ZARYA's guns: the table", () => {
  it('hands each one out with createCarried, loaded as its line says', () => {
    const got = Object.fromEntries(ZARYA_GUN_IDS.map((id) => [id, createCarried(id).ammo]));
    expect([got.signalka!.mag, got.signalka!.reserve]).toEqual([1, 12]);
    expect([got.arbalet!.mag, got.arbalet!.reserve]).toEqual([1, 30]);
    expect([got.gvozdomyot!.mag, got.gvozdomyot!.reserve]).toEqual([60, 360]);
    expect([got.salyut!.mag, got.salyut!.reserve]).toEqual([1, 6]);
    expect([got.ottepel!.mag, got.ottepel!.reserve]).toEqual([100, 0]);
    expect([got.zenit!.mag, got.zenit!.reserve]).toEqual([12, 0]);
  });

  it('carries the numbers asked for', () => {
    const W = WEAPONS;
    expect([W.signalka.damage, W.signalka.reloadEmpty]).toEqual([180, 1.8]);
    expect([ZARYA_GUNS.signalka.markTime, ZARYA_GUNS.signalka.markMul]).toEqual([10, 2]);
    expect([W.arbalet.damage, W.arbalet.headshotMul, W.arbalet.reloadEmpty, W.arbalet.noise, ZARYA_GUNS.arbalet.pierce]).toEqual([320, 2.5, 1.5, 0, 2]);
    expect(W.gvozdomyot.auto).toBe(true);
    // about 900 a minute (a hair faster on paper, so that a 60 Hz simulation makes it exactly four frames a nail)
    expect(60 / W.gvozdomyot.fireInterval).toBeGreaterThanOrEqual(900);
    expect(60 / W.gvozdomyot.fireInterval).toBeLessThan(930);
    expect(Math.ceil(W.gvozdomyot.fireInterval * 60 - 1e-9)).toBe(4);
    expect([W.gvozdomyot.damage, W.gvozdomyot.reloadEmpty]).toEqual([42, 2.2]);
    expect(ZARYA_GUNS.gvozdomyot.impulse).toBeGreaterThan(1);
    expect([W.salyut.damage, W.salyut.reloadEmpty, ZARYA_GUNS.salyut.rockets, ZARYA_GUNS.salyut.blastRadius]).toEqual([420, 3, 5, 4]);
    expect([W.ottepel.damage, ZARYA_GUNS.ottepel.range, ZARYA_GUNS.ottepel.cone, ZARYA_GUNS.ottepel.drain, ZARYA_GUNS.ottepel.refill]).toEqual([900, 10, 50, 14, 6]);
    expect([W.zenit.damage, W.zenit.fireInterval, ZARYA_GUNS.zenit.range, ZARYA_GUNS.zenit.cone, ZARYA_GUNS.zenit.stagger, ZARYA_GUNS.zenit.bossStagger]).toEqual([0, 1.2, 18, 60, 3.5, 1]);
  });

  it('is the top tier: more a second than the rifle, a bigger volley than the HX-7, and gentler on whoever fires it', () => {
    const dps = (id: 'rifle' | 'gvozdomyot') => WEAPONS[id].damage / WEAPONS[id].fireInterval;
    expect(dps('gvozdomyot')).toBeGreaterThan(dps('rifle') * 1.5);
    // a nail shoves at poise harder than a shambler or an armoured one can stand
    expect(WEAPONS.gvozdomyot.damage * ZARYA_GUNS.gvozdomyot.impulse).toBeGreaterThan(95);
    expect(WEAPONS.salyut.damage * ZARYA_GUNS.salyut.rockets).toBeGreaterThan(WEAPONS.rpg.damage * 5);
    // the whole volley at your feet hurts less than half of one HX-7 rocket there
    expect(WEAPONS.salyut.damage * ZARYA_GUNS.salyut.selfMul * ZARYA_GUNS.salyut.rockets).toBeLessThan(WEAPONS.rpg.damage * ROCKET.selfMul * 0.5);
    expect(WEAPONS.ottepel.damage).toBeGreaterThan(dps('gvozdomyot'));
  });

  it('upgrades without breaking a magazine of one or the gauge', () => {
    for (const id of ZARYA_GUN_IDS) {
      for (const tier of [1, 2] as const) {
        const s = getWeaponStats(WEAPONS[id], tier);
        expect(s.magSize).toBeGreaterThanOrEqual(WEAPONS[id].magSize);
        expect(s.damage).toBeGreaterThanOrEqual(WEAPONS[id].damage);
        expect(createCarried(id, tier).ammo.mag).toBe(s.magSize);
      }
    }
    expect(getWeaponStats(WEAPONS.ottepel, 2).magSize).toBe(100);
  });

  it("never turns up in a mystery box (but the Raketa, which only comes out of ZARYA's sack)", () => {
    for (const id of ZARYA_GUN_IDS) {
      expect(MYSTERY_BOX.guns[id]).toBe(0);
      expect(reelFor(true).map(prizeKey)).not.toContain(id);
      if (id !== 'raketa') expect(decodePrize(`w:${id}`)).toBeNull();
    }
  });

  it('knows which stock gun each is held like', () => {
    expect(ZARYA_BASE).toEqual({ signalka: 'pistol', zenit: 'pistol', arbalet: 'rifle', gvozdomyot: 'rifle', salyut: 'rpg', ottepel: 'rpg', raketa: 'rpg' });
    expect(isZaryaGun('ottepel')).toBe(true);
    expect(isZaryaGun('rifle')).toBe(false);
    expect(isZaryaGun('raijin')).toBe(false);
  });
});

describe("the Ottepel's gauge", () => {
  it('drains 14 a second while it throws and makes back 6 a second when it does not', () => {
    expect(stepGauge(100, true, 1, 100)).toBeCloseTo(86);
    expect(stepGauge(50, false, 1, 100)).toBeCloseTo(56);
    let g = 100;
    for (let i = 0; i < 120; i++) g = stepGauge(g, true, 1 / 60, 100);
    expect(g).toBeCloseTo(72, 5);
    for (let i = 0; i < 120; i++) g = stepGauge(g, false, 1 / 60, 100);
    expect(g).toBeCloseTo(84, 5);
  });

  it('never goes below empty or above full', () => {
    expect(stepGauge(1, true, 1, 100)).toBe(0);
    expect(stepGauge(99, false, 1, 100)).toBe(100);
  });

  it('never runs dry for good: held down from full, it throws, waits for pressure and throws again', () => {
    let g = 100;
    let lock = false;
    let thrown = 0;
    let lastThrow = 0;
    for (let i = 0; i < 60 * 60; i++) {
      lock = gaugeLock(g, lock);
      const firing = !lock;
      g = stepGauge(g, firing, 1 / 60, 100);
      if (firing) {
        thrown++;
        lastThrow = i;
      }
    }
    // 100 / 14 = 7.1 s of steam at first, then 6 parts in 20 of the time for ever after (8 units thrown in 8/14 s,
    // made back in 8/6 s)
    expect(thrown / 60).toBeGreaterThan(7.1 + (60 - 7.2) * (6 / 20) - 1);
    expect(thrown / 60).toBeLessThan(7.2 + (60 - 7.1) * (6 / 20) + 1);
    expect(lastThrow).toBeGreaterThan(60 * 58);
    // let go: back to full in under 17 s
    for (let i = 0; i < 17 * 60; i++) g = stepGauge(g, false, 1 / 60, 100);
    expect(g).toBe(100);
  });

  it('holds off after running dry until there is some pressure again', () => {
    expect(gaugeLock(0, false)).toBe(true);
    expect(gaugeLock(ZARYA_GUNS.ottepel.restart - 1, true)).toBe(true);
    expect(gaugeLock(ZARYA_GUNS.ottepel.restart, true)).toBe(false);
    expect(gaugeLock(3, false)).toBe(false); // still throwing its last
  });
});

describe('cones and the fan', () => {
  it('the steam reaches 10 m in a cone 50 degrees wide', () => {
    const at = (deg: number, dist: number) => inCone(0, 0, 0, 0, 0, -1, Math.sin((deg * Math.PI) / 180) * dist, 0, -Math.cos((deg * Math.PI) / 180) * dist, 10, 50);
    expect(at(0, 9.9)).toBe(true);
    expect(at(24, 5)).toBe(true);
    expect(at(-24, 5)).toBe(true);
    expect(at(26, 5)).toBe(false);
    expect(at(0, 10.1)).toBe(false);
    expect(at(180, 2)).toBe(false);
    expect(inCone(0, 0, 0, 0, 0, -1, 0, 0, 0, 10, 50)).toBe(true);
  });

  it("the Zenit's flash reaches 18 m in a cone 60 degrees wide", () => {
    const at = (deg: number, dist: number) => inCone(0, 1.6, 0, 1, 0, 0, Math.cos((deg * Math.PI) / 180) * dist, 1.6, Math.sin((deg * Math.PI) / 180) * dist, ZARYA_GUNS.zenit.range, ZARYA_GUNS.zenit.cone);
    expect(at(29, 17)).toBe(true);
    expect(at(31, 17)).toBe(false);
    expect(at(0, 18.5)).toBe(false);
  });

  it("the Salyut's five leave in a shallow fan about the aim", () => {
    const y = fanYaws(5, 4).map((r) => Math.round((r * 180) / Math.PI));
    expect(y).toEqual([-8, -4, 0, 4, 8]);
    expect(fanYaws(1, 4).map((v) => v + 0)).toEqual([0]);
  });
});

// ---- the mark, and what a co-op guest's gun asks the simulation to do ----

/** Building a map for the simulation takes seconds on a busy machine. */
type Msg = { to: string; d: Record<string, unknown> };

function setup(map: MapId) {
  const out: Msg[] = [];
  const sim = new SessionSim({ seed: 7, kind: 'mission', map, send: (to, d) => out.push({ to, d }) });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  const st = sim.level.data.playerStart;
  const at = { x: st.x, z: st.z };
  const report = (): void => sim.message('p1', { k: 'p', x: at.x, y: 0, z: at.z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
  const run = (seconds: number): void => {
    for (let i = 0; i < seconds * 30; i++) {
      if (i % 3 === 0) report();
      sim.tick(1 / 30);
    }
  };
  const rng = new Rng(11);
  /** An infected to measure on: a shambler stood near the player, with health to spare. */
  const post = () => {
    const z = sim.zombies.spawn('shambler', at.x + 6, at.z, rng, {});
    z.maxHp = z.hp = 100000;
    return z;
  };
  const hit = (z: { id: number }, a: number, extra: Record<string, unknown> = {}): void => sim.message('p1', { k: 'hit', z: z.id, a, h: false, y: 0, pu: 0, li: 0, ...extra }, false);
  return { sim, out, run, post, hit, at };
}

describe("the Signalka's mark", () => {
  it('doubles damage from every source while it lasts, then runs out', () => {
    const { run, post, hit } = setup('district');
    run(1);
    const z = post();
    hit(z, 50);
    expect(100000 - z.hp).toBeCloseTo(50);
    z.mark(10);
    expect(z.markedT).toBe(10);
    expect(z.toNet().flags & 256).toBe(256);
    hit(z, 50);
    expect(100000 - z.hp).toBeCloseTo(150);
    run(4);
    expect(z.markedT).toBeGreaterThan(5.5);
    expect(z.markedT).toBeLessThan(6.5);
    // marking again does not shorten what is left, and does not stack
    z.mark(2);
    expect(z.markedT).toBeGreaterThan(5.5);
    run(7);
    expect(z.markedT).toBe(0);
    expect(z.toNet().flags & 256).toBe(0);
    const before = z.hp;
    hit(z, 50);
    expect(before - z.hp).toBeCloseTo(50);
  }, 90000);

  it('is gone from a body that is reused', () => {
    const { run, post } = setup('district');
    run(1);
    const z = post();
    z.mark(10);
    z.init(z.x, z.z, 0, new Rng(3));
    expect(z.markedT).toBe(0);
  }, 90000);
});

describe("co-op: a guest's gun, on the simulation", () => {
  it('marks and staggers on ZARYA when asked (and a nail pushes at poise as hard as it does alone)', () => {
    const { run, post, hit, sim } = setup('zarya');
    run(1);
    const z = post();
    sim.message('p1', { k: 'zfx', z: z.id, mk: 10, sg: 0 }, false);
    expect(z.markedT).toBe(10);
    hit(z, 180);
    expect(100000 - z.hp).toBeCloseTo(360);
    // the Zenit's flash
    z.setState('chase');
    sim.message('p1', { k: 'zfx', z: z.id, mk: 0, sg: 3.5 }, false);
    expect(z.state).toBe('stagger');
    expect((z as unknown as { staggerDur: number }).staggerDur).toBe(3.5);
    // a boss is stopped for a second at most
    z.isBoss = true;
    z.setState('chase');
    sim.message('p1', { k: 'zfx', z: z.id, mk: 0, sg: 3.5 }, false);
    expect((z as unknown as { staggerDur: number }).staggerDur).toBe(1);
    z.isBoss = false;
    // more than the guns ask for is not given
    sim.message('p1', { k: 'zfx', z: z.id, mk: 999, sg: 0 }, false);
    expect(z.markedT).toBeLessThanOrEqual(ZARYA_GUNS.signalka.markTime);
    // a nail: little damage, a hard shove (one alone staggers; a bullet of the same damage does not)
    const b = post();
    b.setState('chase');
    b.markedT = 0;
    hit(b, 20);
    expect(b.state).not.toBe('stagger');
    run(2);
    b.setState('chase');
    hit(b, 20, { im: 3 });
    expect(b.state).toBe('stagger');
  }, 90000);

  it('ignores the request on the other maps', () => {
    const { run, post, sim } = setup('district');
    run(1);
    const z = post();
    sim.message('p1', { k: 'zfx', z: z.id, mk: 10, sg: 3 }, false);
    expect(z.markedT).toBe(0);
  }, 90000);
});
