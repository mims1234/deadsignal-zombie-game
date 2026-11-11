/**
 * ZARYA: Ded Moroz's sack. Its two prizes (the Raketa vacuum cannon and the Kisten flail), which only ZARYA's box holds,
 * where each goes when taken, and the sack moving after a few openings (solo rules, co-op host).
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { MYSTERY_BOX, WEAPONS, ZARYA_GUNS } from '../src/config';
import { boxHome, boxPlace, dueToMove, nextPlace, placeBox } from '../src/logic/boxMove';
import { createCarried, createInventory } from '../src/logic/economy';
import { MELEE } from '../src/logic/melee';
import { type BoxPrize, prizeKey, reelFor, rollBox, takePrize } from '../src/logic/mysteryBox';
import { Rng } from '../src/logic/rng';
import { BOX_PHASE, createLoot, decodePrize, encodePrize, openBox, takeBox, tickLoot } from '../src/logic/sharedLoot';
import { ZARYA_GUN_IDS, isZaryaGun, pullToward, stepSuck } from '../src/logic/zaryaGuns';
import { LIFE, SessionSim } from '../src/sim/serverHost';
import { CollisionWorld } from '../src/world/collision';
import type { WeaponId } from '../src/types';
import type { CrateDef, MapId } from '../src/world/layout/data';
import { inRect } from '../src/zarya/places';
import { BANYA, DEPOT, DVOR, RYNOK } from '../src/zarya/places';
import { SACK_EVERY, SACK_PLACES, nextSackPlace, sackPlaceOpen } from '../src/zarya/sack';
import { CH, G, ZaryaStory } from '../src/zarya/story';
import { CHAIN } from '../src/zarya/unlock';

const roll = (map: MapId | undefined, n: number, seed = 3, melee: 'kisten' | null = null, guns: [WeaponId, WeaponId] = ['rifle', 'pistol']): BoxPrize[] => {
  const rng = new Rng(seed);
  const inv = createInventory();
  inv.slots = [createCarried(guns[0]), createCarried(guns[1])];
  return Array.from({ length: n }, () => rollBox('medium', inv, rng, false, { map, melee }));
};

describe("the sack's prizes", () => {
  it('only ZARYA rolls them; every other map rolls exactly as it did', () => {
    const zarya = roll('zarya', 4000).map(prizeKey);
    expect(zarya).toContain('raketa');
    expect(zarya).toContain('m:kisten');
    for (const map of ['district', 'sakura', 'mujin', 'asylum', 'hirasaka'] as MapId[]) {
      const keys = roll(map, 4000).map(prizeKey);
      expect(keys).not.toContain('raketa');
      expect(keys).not.toContain('m:kisten');
      // the same seed rolls the same prizes as a box that knows no map at all (the old roll)
      expect(keys).toEqual(roll(undefined, 4000).map(prizeKey));
    }
    expect(reelFor(false).map(prizeKey)).not.toContain('raketa');
    expect(reelFor(false, 'zarya').map(prizeKey)).toEqual(expect.arrayContaining(['raketa', 'm:kisten']));
  });

  it('comes up at sensible odds: each a few openings in a hundred, rarer than any stock gun', () => {
    // carrying two of ZARYA's own guns (as a squad does by Act II), and carrying the stock pair (the fewest guns left to roll)
    for (const guns of [['signalka', 'gvozdomyot'], ['rifle', 'pistol']] as [WeaponId, WeaponId][]) {
      const keys = roll('zarya', 20000, 9, null, guns).map(prizeKey);
      const share = (k: string): number => keys.filter((x) => x === k).length / keys.length;
      for (const k of ['raketa', 'm:kisten']) {
        expect(share(k)).toBeGreaterThan(0.04);
        expect(share(k)).toBeLessThan(0.1);
        expect(share(k)).toBeLessThan(share('shotgun'));
      }
    }
  });

  it('never offers the Raketa to whoever carries it, nor the Kisten to whoever swings it', () => {
    const rng = new Rng(5);
    const inv = createInventory();
    inv.slots[1] = createCarried('raketa');
    for (let i = 0; i < 3000; i++) {
      const p = rollBox('medium', inv, rng, false, { map: 'zarya', melee: 'kisten' });
      expect(prizeKey(p)).not.toBe('raketa');
      expect(prizeKey(p)).not.toBe('m:kisten');
    }
  });

  it('puts the Kisten in the hand that swings, never a gun slot', () => {
    const inv = createInventory();
    const before = JSON.stringify(inv);
    const r = takePrize(inv, { kind: 'melee', id: 'kisten' }, 'chain');
    expect(r).toMatchObject({ ok: true, swapped: false, melee: 'kisten' });
    expect(r.message).toBe('KISTEN REPLACES CHAIN');
    expect(JSON.stringify(inv)).toBe(before);
    expect(takePrize(inv, { kind: 'melee', id: 'kisten' }, 'kisten').ok).toBe(false);
  });

  it('puts the Raketa in a gun slot: an empty one first, else the one in your hands', () => {
    const inv = createInventory();
    inv.slots = [null, createCarried('pistol')];
    inv.activeSlot = 1;
    expect(takePrize(inv, { kind: 'weapon', id: 'raketa' })).toMatchObject({ ok: true, swapped: true });
    expect([inv.slots[0]?.id, inv.slots[1]?.id, inv.activeSlot]).toEqual(['raketa', 'pistol', 0]);
    const full = createInventory();
    takePrize(full, { kind: 'weapon', id: 'raketa' });
    expect([full.slots[0]?.id, full.slots[1]?.id]).toEqual(['raketa', 'pistol']);
  });

  it('survive the trip to the host as text (and nothing else does)', () => {
    for (const p of [{ kind: 'weapon', id: 'raketa' }, { kind: 'melee', id: 'kisten' }] as BoxPrize[]) expect(decodePrize(encodePrize(p))).toEqual(p);
    expect(decodePrize('m:knife')).toBeNull();
    expect(decodePrize('m:shashka')).toBeNull();
    expect(decodePrize('w:ottepel')).toBeNull();
  });
});

describe('the Raketa', () => {
  it('is one of ZARYA\'s guns, held like the launcher, starting with its six rounds', () => {
    expect(ZARYA_GUN_IDS).toContain('raketa');
    expect(isZaryaGun('raketa')).toBe(true);
    expect([WEAPONS.raketa.damage, WEAPONS.raketa.magSize, WEAPONS.raketa.reserveMax]).toEqual([160, 6, 0]);
    expect(MYSTERY_BOX.guns.raketa).toBe(0);
    expect(ZARYA_GUNS.raketa.range).toBe(8);
  });

  it('swallows a round every so often while it sucks, up to six', () => {
    let s = { rounds: 0, t: 0 };
    s = stepSuck(s.rounds, s.t, ZARYA_GUNS.raketa.fill * 0.5, 6);
    expect(s.rounds).toBe(0);
    s = stepSuck(s.rounds, s.t, ZARYA_GUNS.raketa.fill * 0.6, 6);
    expect(s.rounds).toBe(1);
    s = stepSuck(s.rounds, s.t, 60, 6);
    expect(s).toEqual({ rounds: 6, t: 0 });
  });

  it('drags them in toward the player, never nearer than its stop, never away', () => {
    const a = pullToward(0, 0, 6, 0, 0.5);
    expect(a.x).toBeCloseTo(6 - ZARYA_GUNS.raketa.pull * 0.5);
    expect(a.z).toBeCloseTo(0);
    expect(pullToward(0, 0, 2, 0, 5).x).toBeCloseTo(ZARYA_GUNS.raketa.stopAt);
    expect(pullToward(0, 0, 1, 0, 1)).toEqual({ x: 1, z: 0 });
  });

  it('is strong, but not as strong as the built guns', () => {
    const R = WEAPONS.raketa;
    // a full gauge every so often: the time to swallow six and the pause after the blast
    const raketa = (R.damage * R.magSize) / (R.magSize * ZARYA_GUNS.raketa.fill + R.fireInterval);
    const nail = WEAPONS.gvozdomyot.damage / WEAPONS.gvozdomyot.fireInterval;
    expect(raketa).toBeGreaterThan(WEAPONS.rifle.damage / WEAPONS.rifle.fireInterval);
    expect(raketa).toBeLessThan(nail);
    expect(raketa).toBeLessThan(WEAPONS.ottepel.damage);
    // and one full blast is a heavy hit
    expect(R.damage * R.magSize).toBeGreaterThanOrEqual(900);
  });
});

describe('the Kisten', () => {
  it('is a flail, clearly better than the dog chain: twice its blow, a little more reach, and it trips', () => {
    const k = MELEE.kisten;
    const c = MELEE.chain;
    expect(k.type).toBe('flail');
    expect(k.damage).toBe(c.damage * 2);
    expect(k.heavyDamage).toBeGreaterThanOrEqual(c.heavyDamage * 2);
    expect(k.reach).toBe(3.4);
    expect(k.trip).toBeGreaterThan(0);
    expect(c.trip).toBeUndefined();
  });
});

describe('a box that moves', () => {
  it('goes to another place that is open, and stays when there is none', () => {
    expect(nextPlace(5, 0, (i) => i === 0 || i === 3, 0.5)).toBe(3);
    expect(nextPlace(5, 2, () => false, 0.5)).toBeNull();
    for (let r = 0; r < 1; r += 0.07) expect(nextPlace(5, 1, () => true, r)).not.toBe(1);
    expect(dueToMove(SACK_EVERY - 1, SACK_EVERY)).toBe(false);
    expect(dueToMove(SACK_EVERY, SACK_EVERY)).toBe(true);
  });

  it('takes its collider with it, and comes home again', () => {
    const world = new CollisionWorld({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
    const def: CrateDef = { id: 'crate-1', x: 0, z: 0, yaw: 0, region: 'medium', cost: 150 };
    world.add({ x: 0, z: 0, hx: 0.55, hz: 0.35, y1: 0.72, tag: 'crate' });
    boxHome(def);
    expect(world.circleBlocked(0, 0, 0.3, 0.1, 1)).toBe(true);
    placeBox(world, def, { x: 20, z: 10, yaw: 0 });
    expect([def.x, def.z]).toEqual([20, 10]);
    expect(world.circleBlocked(0, 0, 0.3, 0.1, 1)).toBe(false);
    expect(world.circleBlocked(20, 10, 0.3, 0.1, 1)).toBe(true);
    placeBox(world, def, boxPlace(def, [], 0));
    expect([def.x, def.z]).toEqual([0, 0]);
    expect(world.circleBlocked(0, 0, 0.3, 0.1, 1)).toBe(true);
    expect(world.circleBlocked(20, 10, 0.3, 0.1, 1)).toBe(false);
  });

  it('in co-op the host moves it after its openings, as it closes for the next turn', () => {
    const s = createLoot(1, [true]);
    const asked: number[] = [];
    const move = (_i: number, b: { opens: number; spot: number }): number | null => {
      asked.push(b.opens);
      return b.opens >= SACK_EVERY ? (b.spot + 1) % SACK_PLACES.length : null;
    };
    for (let n = 0; n < SACK_EVERY; n++) {
      expect(openBox(s, 0, 'a', 'ammo')).toBe(true);
      tickLoot(s, MYSTERY_BOX.spin + 0.01, move);
      takeBox(s, 0, 'a');
      tickLoot(s, MYSTERY_BOX.paidRearm + 0.01, move);
      expect(s.boxes[0]!.phase).toBe(BOX_PHASE.closed);
    }
    expect(asked).toEqual([1, 2, 3, 4]);
    expect(s.boxes[0]).toMatchObject({ spot: 1, opens: 0 });
  });
});

describe("the sack's places", () => {
  const view = (ch: number, g = 0, gates = 0) => ({ ...ZaryaStory.empty(), ch, g, gates });

  it('stand in the zones they are named for', () => {
    expect(SACK_PLACES.map((p) => p.zone)).toEqual(['square', 'rynok', 'dvor', 'depot', 'banya']);
    expect(inRect(RYNOK.rect, RYNOK.sack.x, RYNOK.sack.z)).toBe(true);
    expect(inRect(DVOR.rect, DVOR.sack.x, DVOR.sack.z)).toBe(true);
    expect(inRect(DEPOT.rect, DEPOT.sack.x, DEPOT.sack.z)).toBe(true);
    expect(inRect(BANYA.rect, BANYA.sack.x, BANYA.sack.z)).toBe(true);
  });

  it('opens with the zones: only the square until Act II, the depot once its chain is cut, the banya past the pond gate', () => {
    expect(nextSackPlace(view(CH.town), 0, 0.5)).toBeNull();
    const act2 = view(CH.act2);
    expect([0, 1, 2, 3, 4].map((i) => sackPlaceOpen(act2, i))).toEqual([true, true, true, false, false]);
    const later = view(CH.act2, G.pond, 1 << CHAIN.depot);
    expect([0, 1, 2, 3, 4].map((i) => sackPlaceOpen(later, i))).toEqual([true, true, true, true, true]);
  });
});

describe("the sack in a co-op session (ZARYA's host)", () => {
  it(
    'moves after four openings, to an open zone, and every client is told where',
    () => {
      const out: { to: string; d: Record<string, unknown> }[] = [];
      const sim = new SessionSim({ seed: 7, kind: 'mission', map: 'zarya', send: (to, d) => out.push({ to, d }) });
      sim.players([{ id: 'p1', name: 'One' }]);
      sim.begin();
      (sim.zarya as unknown as { ch: number }).ch = CH.act2;
      const c = sim.level.data.crates[0]!;
      const home = { x: c.x, z: c.z };
      const at = (x: number, z: number): void => sim.message('p1', { k: 'p', x, y: 0, z, yaw: 0, up: true, st: LIFE.up, hp: 100 }, false);
      const run = (seconds: number): void => {
        for (let i = 0; i < seconds * 30; i++) {
          if (i % 3 === 0) at(c.x + 1, c.z);
          sim.tick(1 / 30);
        }
      };
      run(0.3);
      for (let n = 0; n < SACK_EVERY; n++) {
        sim.message('p1', { k: 'box', i: 0, pz: n === 0 ? 'w:raketa' : 'm:kisten' }, false);
        run(MYSTERY_BOX.spin + 0.2);
        sim.message('p1', { k: 'boxTake', i: 0 }, false);
        run(MYSTERY_BOX.paidRearm + 0.3);
      }
      expect(out.filter((m) => m.d.k === 'boxed').length).toBe(SACK_EVERY);
      const s = [...out].reverse().find((m) => m.d.k === 's')!.d as { bx: (number | string)[][] };
      const spot = Number(s.bx[0]![4]);
      expect([1, 2]).toContain(spot); // the Rynok or the Dvor: the only other places open in Act II
      expect([c.x, c.z]).toEqual([SACK_PLACES[spot]!.x, SACK_PLACES[spot]!.z]);
      expect(Math.hypot(c.x - home.x, c.z - home.z)).toBeGreaterThan(50);
      expect(sim.level.world.circleBlocked(c.x, c.z, 0.3, 0.1, 1)).toBe(true);
    },
    240000,
  );
});
