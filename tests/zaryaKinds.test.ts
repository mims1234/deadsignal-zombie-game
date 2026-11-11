/**
 * ZARYA's special kinds of infected: the table, the zone-by-zone picker, and each habit run in the co-op simulation
 * (headless: the same `Zombie` code the solo game runs, with nothing drawn and nobody's body to move).
 */
import '../src/sim/stubs';
import { describe, expect, it, vi } from 'vitest';
import { ZOMBIES } from '../src/config';
import { VARIANTS, VARIANT_BASE, VARIANT_INFO, ZARYA_HABITS, ZARYA_KINDS, variantDef, zaryaVariant, type ZaryaKind, type ZombieVariant } from '../src/enemies/variants';
import type { NetZombie, Zombie, ZombieEnv } from '../src/enemies/zombie';
import { ZombieManager } from '../src/enemies/zombieManager';
import { Rng } from '../src/logic/rng';
import { createNullRigFactory } from '../src/sim/nullRig';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import type { ZombieType } from '../src/types';
import { zaryaPull, zaryaVariantPicker } from '../src/zarya/kinds';
import { ZARYA_ZONES } from '../src/zarya/places';

vi.setConfig({ testTimeout: 120_000 });

// ---------------------------------------------------------------------------------------------------------
// the table and the picker (no simulation)
// ---------------------------------------------------------------------------------------------------------

describe("ZARYA's kinds: the table", () => {
  it('adds eight kinds after the ones the wire already knows, each on its type', () => {
    // the co-op wire sends a kind as its index: nothing that was there may have moved
    expect(VARIANTS.indexOf('overseer')).toBe(23);
    expect(VARIANTS.slice(24)).toEqual([...ZARYA_KINDS]);
    const base: Record<ZaryaKind, ZombieType> = { ryazhenye: 'runner', svistok: 'armored', kassirsha: 'shambler', gruzchik: 'armored', dvornik: 'armored', rybak: 'shambler', morzh: 'armored', domovoi: 'runner' };
    for (const k of ZARYA_KINDS) expect(VARIANT_BASE[k]).toBe(base[k]);
  });

  it('gives each the numbers of its job', () => {
    const def = (k: ZaryaKind) => variantDef(ZOMBIES[VARIANT_BASE[k]], k);
    // the carol-singers: a little faster and weaker than a plain runner
    expect(def('ryazhenye').speedChase).toBeGreaterThan(ZOMBIES.runner.speedChase);
    expect(def('ryazhenye').hp).toBeLessThan(ZOMBIES.runner.hp);
    // the yard-keeper: twice the health, slow, about a metre more reach
    expect(def('dvornik').hp).toBe(ZOMBIES.armored.hp * 2);
    expect(def('dvornik').speedChase).toBeLessThan(ZOMBIES.armored.speedChase);
    expect(def('dvornik').attackRange - ZOMBIES.armored.attackRange).toBeCloseTo(1, 5);
    // the winter swimmer: four times the health, half again the blow, a fifth bigger, slow, and too heavy to stagger
    const m = def('morzh');
    expect(m.hp).toBe(ZOMBIES.armored.hp * 4);
    expect(m.damage).toBeCloseTo(ZOMBIES.armored.damage * 1.5);
    expect(VARIANT_INFO.morzh.scale).toBeCloseTo(1.2);
    expect(m.height).toBeCloseTo(ZOMBIES.armored.height * 1.2);
    expect(m.speedChase).toBeLessThan(ZOMBIES.armored.speedChase);
    expect(m.poise).toBeGreaterThan(ZOMBIES.armored.poise * 4);
    // the house spirit: small, fast, little health
    const d = def('domovoi');
    expect(VARIANT_INFO.domovoi.scale).toBeCloseTo(0.75);
    expect(d.speedChase).toBeGreaterThan(ZOMBIES.runner.speedChase);
    expect(d.hp).toBeLessThanOrEqual(ZOMBIES.runner.hp * 0.5);
    // the cashier's weight hits for about fourteen
    expect(def('kassirsha').damage).toBeCloseTo(14);
    expect(ZARYA_HABITS.crate).toBe(0.8);
    expect(ZARYA_HABITS.whistle.radius).toBe(40);
  });
});

describe("ZARYA's kinds: who is where", () => {
  const TYPES: ZombieType[] = ['shambler', 'runner', 'armored'];
  /** Every kind `type` can become anywhere in a zone, and how often. */
  const census = (zone: (typeof ZARYA_ZONES)[number], type: ZombieType): Map<ZombieVariant, number> => {
    const rng = new Rng(zone.id.length * 97 + type.length);
    const m = new Map<ZombieVariant, number>();
    for (let i = 0; i < 4000; i++) {
      const x = zone.x0 + 0.5 + rng.f() * (zone.x1 - zone.x0 - 1);
      const z = zone.z0 + 0.5 + rng.f() * (zone.z1 - zone.z0 - 1);
      const v = zaryaVariant(type, x, z, () => rng.f());
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  };
  const ALLOWED: Record<string, ZaryaKind[]> = {
    square: ['ryazhenye', 'dvornik'],
    dk: ['ryazhenye'],
    store: ['svistok', 'kassirsha'],
    rynok: ['kassirsha', 'gruzchik'],
    dvor: ['dvornik', 'domovoi'],
    garages: ['gruzchik'],
    depot: ['svistok'],
    banya: ['rybak', 'morzh'],
    tets: [],
    institute: [],
    shelter: [],
    upstairs: [],
    canteen: [],
    berloga: [],
  };

  it('keeps each kind to its own zones, on its own type, and never touches the boss', () => {
    for (const zone of ZARYA_ZONES) {
      const allowed = ALLOWED[zone.id]!;
      expect(allowed, zone.id).toBeDefined();
      const seen = new Set<ZombieVariant>();
      for (const type of TYPES) {
        for (const [v] of census(zone, type)) {
          if (!v) continue;
          seen.add(v);
          expect(allowed, `${v} in ${zone.id}`).toContain(v);
          expect(VARIANT_BASE[v], `${v} on ${type}`).toBe(type);
        }
      }
      // every kind a zone is meant to have does turn up there
      for (const k of allowed) expect(seen.has(k), `${k} in ${zone.id}`).toBe(true);
      expect([...census(zone, 'warden').keys()]).toEqual(['']);
    }
    // outside every zone: nobody special
    expect(zaryaVariant('runner', 9999, 9999, () => 0)).toBe('');
  });

  it('leaves most of every zone plain: the special kinds are a fifth to a third of a usual crowd, never half', () => {
    // a usual crowd: the medium region's mix (`config.ts` REGIONS)
    const mix: Record<string, number> = { shambler: 0.52, runner: 0.33, armored: 0.15 };
    for (const zone of ZARYA_ZONES) {
      let special = 0;
      for (const type of TYPES) {
        const c = census(zone, type);
        special += mix[type]! * (1 - (c.get('') ?? 0) / 4000);
      }
      if (ALLOWED[zone.id]!.length === 0) expect(special, zone.id).toBe(0);
      else {
        expect(special, zone.id).toBeGreaterThan(0.07);
        expect(special, zone.id).toBeLessThan(0.36);
      }
    }
  });

  it('makes the carol-singers a pack: most of the runners on the square and at the Palace', () => {
    for (const id of ['square', 'dk'] as const) {
      const c = census(ZARYA_ZONES.find((q) => q.id === id)!, 'runner');
      expect((c.get('ryazhenye') ?? 0) / 4000).toBeGreaterThan(0.55);
    }
    // the house spirit is the yards' alone
    for (const zone of ZARYA_ZONES) if (zone.id !== 'dvor') expect(census(zone, 'runner').has('domovoi'), zone.id).toBe(false);
  });

  it('the picker the manager is given draws from the run\'s own dice', () => {
    const pick = zaryaVariantPicker();
    const sq = ZARYA_ZONES.find((q) => q.id === 'square')!;
    const a = new Rng(5);
    const b = new Rng(5);
    const one = Array.from({ length: 40 }, () => pick('runner', sq.x0 + 20, sq.z0 + 20, 0, a));
    const two = Array.from({ length: 40 }, () => pick('runner', sq.x0 + 20, sq.z0 + 20, 0, b));
    expect(one).toEqual(two);
    expect(one).toContain('ryazhenye');
    expect(one).toContain('');
  });
});

// ---------------------------------------------------------------------------------------------------------
// the habits, in the simulation
// ---------------------------------------------------------------------------------------------------------

interface Sent {
  to: string;
  d: Record<string, unknown>;
}

/**
 * A simulation with one player in it, nobody else on the map, and a stretch of open ground: `at(d)` is the point `d`
 * metres along it from where the player stands. An old map on purpose: a kind is the same wherever it is put.
 */
// the map is built once (a few seconds), and the open ground on it found once
const BUILT = new SessionSim({ seed: 11, map: 'district', send: () => {} });
/** A straight twenty-four metres with nothing in it, and nothing within three metres either side. */
const LANE = ((): { x: number; z: number; ax: number; az: number } => {
  const world = BUILT.level.world;
  const nav = BUILT.level.nav;
  const b = BUILT.level.data.bounds;
  for (let x = b.minX + 6; x < b.maxX - 6; x += 2) {
    for (let z = b.minZ + 6; z < b.maxZ - 6; z += 2) {
      if (world.circleBlocked(x, z, 0.5, 0.3, 1.8)) continue;
      for (let k = 0; k < 16; k++) {
        const ax = Math.cos((k / 16) * Math.PI * 2);
        const az = Math.sin((k / 16) * Math.PI * 2);
        let ok = true;
        for (let d = 0; ok && d <= 24; d += 1) {
          for (const s of [-3, -1.5, 0, 1.5, 3]) {
            const px = x + ax * d - az * s;
            const pz = z + az * d + ax * s;
            if (world.circleBlocked(px, pz, 0.5, 0.3, 1.8) || world.floorHeight(px, pz, 0.3) !== 0 || !nav.los(x, z, px, pz)) {
              ok = false;
              break;
            }
          }
        }
        if (ok) return { x, z, ax, az };
      }
    }
  }
  throw new Error('no open ground on the map');
})();

function field() {
  const sent: Sent[] = [];
  const sim = new SessionSim({ seed: 11, map: 'district', level: BUILT.level, send: (to, d) => void sent.push({ to, d }) });
  sim.players([{ id: 'p1', name: 'One' }]);
  sim.begin();
  sim.zombies.clearAll();
  sim.zombies.spawnAllowed = () => false;
  const o = LANE;
  const me = { x: o.x, z: o.z, yaw: 0, hp: 100 };
  const at = (d: number, side = 0): { x: number; z: number } => ({ x: o.x + o.ax * d - o.az * side, z: o.z + o.az * d + o.ax * side });
  const report = (): void => sim.message('p1', { k: 'p', x: me.x, y: 0, z: me.z, yaw: me.yaw, up: true, st: LIFE.up, hp: me.hp }, false);
  /** Run for `seconds`; `each` may move the player between frames. */
  const run = (seconds: number, each?: (dt: number) => void): void => {
    for (let i = 0, n = Math.max(1, Math.round(seconds * 30)); i < n; i++) {
      each?.(1 / 30);
      report();
      sim.tick(1 / 30);
    }
  };
  const put = (kind: ZaryaKind | '', d: number, o2: { side?: number; hunting?: boolean; type?: ZombieType; yawToMe?: boolean } = {}): Zombie => {
    const p = at(d, o2.side ?? 0);
    const type = o2.type ?? (kind ? VARIANT_BASE[kind] : 'shambler');
    const yaw = o2.yawToMe === false ? Math.atan2(-(p.x - me.x), -(p.z - me.z)) : Math.atan2(-(me.x - p.x), -(me.z - p.z));
    const z = sim.zombies.spawn(type, p.x, p.z, new Rng(7), { variant: kind, yaw, state: o2.hunting ? 'chase' : 'idle' });
    if (o2.hunting) z.aggro(me.x, me.z);
    return z;
  };
  /** A blow on `z` from where the player stands, through the simulation's own damage path. */
  const strike = (z: Zombie, amount: number, heavy = false): number => {
    const env = (sim as unknown as { peers: Map<string, { env: ZombieEnv }> }).peers.get('p1')!.env;
    const before = z.hp;
    sim.zombies.damage(z, amount, false, env, Math.atan2(-(z.x - me.x), -(z.z - me.z)), 0, 0, 1, heavy);
    return before - z.hp;
  };
  const env = (): ZombieEnv => (sim as unknown as { peers: Map<string, { env: ZombieEnv }> }).peers.get('p1')!.env;
  const hurts = (): { a: number; kn: number }[] => sent.filter((s) => s.d.k === 'hurt').map((s) => ({ a: Number(s.d.a), kn: Number(s.d.kn) }));
  report();
  sim.tick(1 / 30);
  sent.length = 0;
  return { sim, me, at, run, put, strike, env, hurts, sent, dir: { x: o.ax, z: o.az } };
}

describe("ZARYA's kinds: what each does", () => {
  it('the guard whistles once, the first time he sees someone, and everyone within forty metres knows where they are', () => {
    const f = field();
    // (the others are turned away and are too far to notice anyone themselves)
    const near = [f.put('', 18, { side: 2.5, yawToMe: false }), f.put('', 23, { side: -2.5, yawToMe: false })];
    const far = f.put('', 21, { side: 0, yawToMe: false });
    const guard = f.put('svistok', 13);
    // the far one stands beyond his whistle: forty-six metres off to his side (wherever that is on this map: it only listens)
    far.x = guard.x - f.dir.z * 46;
    far.z = guard.z + f.dir.x * 46;
    far.homeX = far.x;
    far.homeZ = far.z;
    (far as unknown as { wanderX: number; wanderZ: number }).wanderX = far.x;
    (far as unknown as { wanderX: number; wanderZ: number }).wanderZ = far.z;
    for (const z of [...near, far]) z.sightScale = 0;
    expect(near.every((z) => z.state === 'idle')).toBe(true);
    let whistleFrames = 0;
    let acted = false;
    f.run(4, () => {
      if (guard.toNet().flags & 2048) {
        whistleFrames++;
        acted = true;
        // he stands still while he blows it
        expect(Math.hypot(guard.vx, guard.vz)).toBeLessThan(0.3);
      }
    });
    expect(acted).toBe(true);
    // about a second of it
    expect(whistleFrames / 30).toBeGreaterThan(0.7);
    expect(whistleFrames / 30).toBeLessThan(1.4);
    // those in earshot are after the player, and it is the player's spot they were given, not the guard's
    for (const z of near) {
      expect(z.state === 'chase' || z.state === 'alert' || z.state === 'attack').toBe(true);
      expect(Math.hypot(z.quarry.x - f.me.x, z.quarry.z - f.me.z)).toBeLessThan(1);
    }
    expect(Math.hypot(far.x - guard.x, far.z - guard.z)).toBeGreaterThan(40);
    expect(far.state).toBe('idle');
    // once only: lose him and be seen again, and there is no second whistle
    let again = false;
    f.run(6, () => {
      if (guard.toNet().flags & 2048) again = true;
    });
    expect(again).toBe(false);
  });

  it("the manager's `tell` reaches forty metres and no farther, and leaves the boss alone", () => {
    const f = field();
    const a = f.put('', 6, { yawToMe: false });
    const b = f.put('', 23, { yawToMe: false });
    a.sightScale = b.sightScale = 0;
    const n = f.sim.zombies.tell(a.x, a.z, 15, 5, 5, -1);
    expect(n).toBe(1);
    expect(a.quarry).toEqual({ x: 5, z: 5 });
    expect(b.quarry).not.toEqual({ x: 5, z: 5 });
  });

  it('the cashier throws from range after a wind-up anyone can see: it lands on someone who stands still', () => {
    const f = field();
    const she = f.put('kassirsha', 12, { hunting: true });
    let windup = 0;
    let startDist = -1;
    f.run(5, () => {
      if (she.toNet().flags & 2048 && she.poseT < 0.55 && f.hurts().length === 0) {
        windup++;
        if (startDist < 0) startDist = Math.hypot(she.x - f.me.x, she.z - f.me.z);
      }
    });
    const h = f.hurts();
    expect(h.length).toBeGreaterThanOrEqual(1);
    // about fourteen (normal difficulty), and she never came close to do it
    expect(h[0]!.a).toBeCloseTo(14, 0);
    expect(startDist).toBeGreaterThan(ZARYA_HABITS.throw_.min);
    expect(Math.hypot(she.x - f.me.x, she.z - f.me.z)).toBeGreaterThan(ZARYA_HABITS.throw_.min);
    // the wind-up of the first throw: 0.7 s
    expect(windup / 30).toBeGreaterThan(0.6);
  });

  it("the cashier's weight misses someone who steps out of the line, and never leaves her hand without a clear line", () => {
    const f = field();
    const she = f.put('kassirsha', 12, { hunting: true });
    // side-step the moment her aim is set (she winds up for 0.7 s; her aim is set 0.3 s in)
    let t = 0;
    f.run(2.2, (dt) => {
      if (she.toNet().flags & 2048) {
        t += dt;
        if (t > ZARYA_HABITS.throw_.lock) {
          f.me.x += -f.dir.z * 4.3 * dt;
          f.me.z += f.dir.x * 4.3 * dt;
        }
      } else t = 0;
    });
    expect(f.hurts().length).toBe(0);

    // behind cover: she comes round it instead of throwing
    const g = field();
    const her = g.put('kassirsha', 12, { hunting: true });
    const world = g.sim.level.world;
    const real = world.segmentBlocked.bind(world);
    // a wall across the middle of the field, as far as lines of fire go
    world.segmentBlocked = ((x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, kind: 'shots' | 'move') => kind === 'shots' || real(x0, y0, z0, x1, y1, z1, kind)) as typeof world.segmentBlocked;
    let threw = false;
    g.run(3, () => {
      if (her.toNet().flags & 2048) threw = true;
    });
    world.segmentBlocked = real;
    expect(threw).toBe(false);
    expect(g.hurts().length).toBe(0);
    // and she has been walking toward them all the while
    expect(Math.hypot(her.x - g.me.x, her.z - g.me.z)).toBeLessThan(11);
  });

  it('closer than six metres the cashier fights like anyone', () => {
    const f = field();
    const she = f.put('kassirsha', 4, { hunting: true });
    let threw = false;
    f.run(4, () => {
      if (she.toNet().flags & 2048) threw = true;
    });
    expect(threw).toBe(false);
    expect(f.hurts().length).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(she.x - f.me.x, she.z - f.me.z)).toBeLessThan(2.5);
  });

  it("the loader's crate takes four fifths of a blow from the front, nothing from behind, and nothing once a heavy blow has broken it", () => {
    const f = field();
    const he = f.put('gruzchik', 4);
    expect(he.frontArmor).toBe(0.8);
    expect(he.toNet().flags & 1024).toBe(0);
    // from the front
    expect(f.strike(he, 50)).toBeCloseTo(10);
    // from behind: stand on the far side of him
    const back = f.at(8);
    const front = { x: f.me.x, z: f.me.z };
    f.me.x = back.x;
    f.me.z = back.z;
    expect(f.strike(he, 50)).toBeCloseTo(50);
    f.me.x = front.x;
    f.me.z = front.z;
    // an ordinary blow does not break it, however hard
    f.strike(he, 60);
    expect(he.crateBroken).toBe(false);
    // a heavy swung one does: the crate takes that blow too, he reels, and after it nothing is in front of him
    expect(f.strike(he, 50, true)).toBeCloseTo(10);
    expect(he.crateBroken).toBe(true);
    expect(he.frontArmor).toBe(0);
    expect(he.state).toBe('stagger');
    expect(he.toNet().flags & 1024).toBe(1024);
    expect(f.strike(he, 50)).toBeCloseTo(50);
    // a guest's copy of him loses its crate with the host's
    const guest = new ZombieManager(createNullRigFactory(), f.sim.level);
    const n: NetZombie = { ...he.toNet(), v: VARIANTS.indexOf('gruzchik') };
    guest.syncPuppets([n], new Rng(1));
    expect(guest.zombies[0]!.variant).toBe('gruzchik');
    expect(guest.zombies[0]!.crateBroken).toBe(true);
  });

  it('a heavy blow from behind leaves the crate alone, and nobody else has one to break', () => {
    const f = field();
    const he = f.put('gruzchik', 4);
    const back = f.at(8);
    f.me.x = back.x;
    f.me.z = back.z;
    f.strike(he, 30, true);
    expect(he.crateBroken).toBe(false);
    const plain = f.put('', 6, { type: 'armored' });
    expect(plain.frontArmor).toBe(0);
    expect(f.strike(plain, 30, true)).toBeCloseTo(30);
  });

  it('the loader charges: a wind-up, then a run faster than he walks, and it hurts to be in the way', () => {
    const f = field();
    const he = f.put('gruzchik', 11, { hunting: true });
    (he as unknown as { chargeCd: number }).chargeCd = 0;
    let top = 0;
    let charged = false;
    f.run(5, () => {
      if (he.poseMode === 'charge') {
        charged = true;
        top = Math.max(top, Math.hypot(he.vx, he.vz));
      }
    });
    expect(charged).toBe(true);
    expect(top).toBeGreaterThan(he.def.speedChase * 2);
    const h = f.hurts();
    expect(h.length).toBeGreaterThanOrEqual(1);
    expect(h[0]!.a).toBeCloseTo(he.def.damage * ZARYA_HABITS.charge.damageMul, 0);
    expect(h[0]!.kn).toBe(ZARYA_HABITS.charge.knock);
  });

  it('the fisherman casts from range and reels them in: no damage, about five metres in a second', () => {
    const f = field();
    const he = f.put('rybak', 10, { hunting: true });
    // a game with a player of its own in it: the reel moves them (here, a body with the player's ground friction)
    const body = {
      get x(): number {
        return f.me.x;
      },
      get z(): number {
        return f.me.z;
      },
      vx: 0,
      vz: 0,
    };
    const pull = zaryaPull(body);
    let pulls = 0;
    f.env().pull = (z, vx, vz) => {
      pulls++;
      pull(z, vx, vz);
    };
    const start = { x: f.me.x, z: f.me.z };
    let windup = 0;
    f.run(6, (dt) => {
      if (he.toNet().flags & 2048 && he.poseT < 0.55) windup++;
      // the player's own movement, standing still: friction, then the step (`player/player.ts`)
      const k = Math.max(0, 1 - 11 * dt);
      body.vx *= k;
      body.vz *= k;
      f.me.x += body.vx * dt;
      f.me.z += body.vz * dt;
    });
    expect(windup / 30).toBeGreaterThan(0.7);
    expect(pulls).toBeGreaterThan(20);
    const moved = Math.hypot(f.me.x - start.x, f.me.z - start.z);
    // toward him, about five metres, in one cast (the next is seconds away)
    expect(moved).toBeGreaterThan(4);
    expect(moved).toBeLessThan(6.2);
    expect((f.me.x - start.x) * f.dir.x + (f.me.z - start.z) * f.dir.z).toBeGreaterThan(4);
    // the cast itself hurts nobody (he may have got a blow in afterwards, at arm's length: that one is his fists)
    expect(f.hurts().filter((h) => h.a === 0).length).toBe(0);
  });

  it("the reel moves the player only when it is the player on the line (a squadmate's environment is a copy of the game's)", () => {
    const f = field();
    const he = f.put('rybak', 10, { hunting: true });
    const player = { x: f.me.x, z: f.me.z, vx: 0, vz: 0 };
    const pull = zaryaPull(player);
    const toward = (from: { x: number; z: number }): [number, number] => {
      const d = Math.hypot(he.x - from.x, he.z - from.z);
      return [((he.x - from.x) / d) * 5, ((he.z - from.z) / d) * 5];
    };
    // someone else on his line, off to one side of the player: the player is not moved
    pull(he, ...toward(f.at(2, 3)));
    expect(player.vx === 0 && player.vz === 0).toBe(true);
    pull(he, ...toward(player));
    expect(Math.hypot(player.vx, player.vz)).toBeGreaterThan(5);
  });

  it('where nobody can be moved (the co-op simulation) the cast is one yank toward him, for no damage; behind cover it does not take', () => {
    const f = field();
    const he = f.put('rybak', 10, { hunting: true });
    f.run(2.2);
    const yank = f.hurts().filter((h) => h.kn < 0);
    expect(yank.length).toBe(1);
    expect(yank[0]!.a).toBe(0);
    expect(yank[0]!.kn).toBe(-ZARYA_HABITS.cast.yank);
    // several seconds before the next (once he has wound this one in)
    f.run(1.5);
    expect(f.hurts().filter((h) => h.kn < 0).length).toBe(1);
    const cd = (he as unknown as { actCd: number }).actCd;
    expect(cd).toBeGreaterThan(4);

    const g = field();
    const him = g.put('rybak', 10, { hunting: true });
    const world = g.sim.level.world;
    const real = world.segmentBlocked.bind(world);
    let hid = false;
    g.run(3, () => {
      // step behind cover in the middle of his wind-up
      if (!hid && him.toNet().flags & 2048 && him.poseT > 0.25) {
        hid = true;
        world.segmentBlocked = ((x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, kind: 'shots' | 'move') => kind === 'shots' || real(x0, y0, z0, x1, y1, z1, kind)) as typeof world.segmentBlocked;
      }
    });
    world.segmentBlocked = real;
    expect(hid).toBe(true);
    expect(g.hurts().filter((h) => h.kn < 0).length).toBe(0);
  });

  it('the house spirit stands unseen until someone is within six metres, and its first blow is worth three', () => {
    const f = field();
    const it2 = f.put('domovoi', 12);
    expect(it2.hidden).toBe(true);
    expect(it2.toNet().flags & 512).toBe(512);
    const where = { x: it2.x, z: it2.z };
    // a noise does not move it, nor does being looked at from across the yard
    f.sim.zombies.emitNoise(f.me.x, f.me.z, 40);
    f.run(3);
    expect(it2.hidden).toBe(true);
    expect(Math.hypot(it2.x - where.x, it2.z - where.z)).toBeLessThan(0.05);
    // walk up to it
    const to = f.at(12 - 6.6);
    f.me.x = to.x;
    f.me.z = to.z;
    f.run(0.5);
    expect(it2.hidden).toBe(true);
    const closer = f.at(12 - 5.5);
    f.me.x = closer.x;
    f.me.z = closer.z;
    f.run(0.2);
    expect(it2.hidden).toBe(false);
    expect(it2.toNet().flags & 512).toBe(0);
    f.run(4);
    const h = f.hurts();
    expect(h.length).toBeGreaterThanOrEqual(2);
    expect(h[0]!.a).toBeCloseTo(it2.def.damage * ZARYA_HABITS.domovoi.first, 0);
    expect(h[1]!.a).toBeCloseTo(it2.def.damage, 0);
  });

  it('hurting the house spirit shows it too; one sent after someone was never hiding', () => {
    const f = field();
    const a = f.put('domovoi', 14);
    expect(a.hidden).toBe(true);
    f.strike(a, 5);
    f.run(0.1);
    expect(a.hidden).toBe(false);
    expect(a.chasing).toBe(true);
    const b = f.put('domovoi', 19, { hunting: true });
    expect(b.hidden).toBe(false);
  });

  it('the winter swimmer is not staggered by what staggers the others; the yard-keeper strikes from a metre farther', () => {
    const f = field();
    const big = f.put('morzh', 8);
    const plain = f.put('', 9, { type: 'armored', side: 3 });
    f.strike(plain, 120);
    f.strike(big, 120);
    expect(plain.state).toBe('stagger');
    expect(big.state).not.toBe('stagger');
    expect(big.maxHp).toBe(ZOMBIES.armored.hp * 4);

    const g = field();
    const keeper = g.put('dvornik', 9, { hunting: true });
    let from = -1;
    g.run(8, () => {
      if (from < 0 && keeper.state === 'attack') from = Math.hypot(keeper.x - g.me.x, keeper.z - g.me.z);
    });
    expect(from).toBeGreaterThan(ZOMBIES.armored.attackRange);
    expect(from).toBeLessThan(2.75);
    expect(g.hurts().length).toBeGreaterThanOrEqual(1);
  });

  it('none of it touches the other maps: an infected with no kind has no crate, hides nowhere and whistles at nobody', () => {
    const f = field();
    const z = f.put('', 10, { type: 'armored', hunting: true });
    let acted = false;
    f.run(3, () => {
      if (z.toNet().flags & (512 | 1024 | 2048)) acted = true;
    });
    expect(acted).toBe(false);
    expect(z.hidden || z.crateBroken).toBe(false);
    expect(z.calls.length).toBe(0);
  });
});
