/**
 * ZARYA's kiosk shutters, weapon mods and repair booth (`src/zarya/mods.ts`, the story's `k`): what may be done where,
 * what it costs, what goes on the wire, and what a mod does to a gun.
 */
import { describe, expect, it } from 'vitest';
import type { Zombie } from '../src/enemies/zombie';
import { createCarried } from '../src/logic/economy';
import { MOD, MOD_TUNE, WeaponMods, benchOffer, boothRefusal, drumMag, modFits, modWord } from '../src/zarya/mods';
import { BENCHES, CH, G, KBIT, MOD_COST, MOD_PARTS, SHUTTERS, STORY, ZaryaStory, decodeStory, encodeStory, type StoryView } from '../src/zarya/story';

/** A story in Act II with every zone open (the tickets, the pond road, the three chains). */
function act2(): ZaryaStory {
  const s = new ZaryaStory();
  const w = s as unknown as { ch: number; g: number };
  w.ch = CH.act2;
  w.g = G.tickets | G.pond | G.code;
  s.unlock.view.gates = 7;
  return s;
}
const before = (at: { x: number; z: number }, yaw: number, d = 1.6): { x: number; z: number } => ({ x: at.x - Math.sin(yaw) * d, z: at.z - Math.cos(yaw) * d });
const fake = (o: Partial<Zombie> = {}): Zombie => ({ alive: true, isBoss: false, speedScale: 1, ...o }) as unknown as Zombie;

describe('ZARYA kiosk shutters', () => {
  it('has one shutter in each of five zones and two mod parts lying about', () => {
    expect(SHUTTERS.map((s) => s.zone)).toEqual(['square', 'rynok', 'dvor', 'depot', 'banya']);
    expect(MOD_PARTS).toHaveLength(2);
    expect(STORY.shutter).toBe(750);
  });

  it('opens only once the tram runs, only where the squad can reach, once, for whoever stands at it', () => {
    const early = new ZaryaStory();
    expect(ZaryaStory.can(early.view, 'shutter', 0)).toBe(false);
    const s = new ZaryaStory();
    (s as unknown as { ch: number }).ch = CH.act2;
    // the banya is behind the pond road's frozen gate
    expect(ZaryaStory.can(s.view, 'shutter', 4)).toBe(false);
    expect(ZaryaStory.can(s.view, 'shutter', 1)).toBe(true);
    const r = SHUTTERS[1]!;
    expect(s.act('shutter', 1, { x: r.at.x + 20, z: r.at.z })).toBe(false);
    expect(s.act('shutter', 1, before(r.at, r.yaw))).toBe(true);
    expect(ZaryaStory.shutterUp(s.view, 1)).toBe(true);
    expect(s.drain()).toContainEqual({ kind: 'shutter', i: 1 });
    expect(s.act('shutter', 1, before(r.at, r.yaw))).toBe(false);
    expect(ZaryaStory.modParts(s.view)).toBe(1);
  });

  it('counts the parts from the kiosks and the two lying about', () => {
    const s = act2();
    SHUTTERS.forEach((q, i) => expect(s.act('shutter', i, before(q.at, q.yaw))).toBe(true));
    MOD_PARTS.forEach((p, i) => expect(s.act('modPart', i, p)).toBe(true));
    expect(s.act('modPart', 0, MOD_PARTS[0]!)).toBe(false);
    expect(ZaryaStory.modParts(s.view)).toBe(7);
  });

  it('goes on the co-op wire, and reads a row from before it had one', () => {
    const s = act2();
    s.act('shutter', 2, before(SHUTTERS[2]!.at, SHUTTERS[2]!.yaw));
    s.act('modPart', 1, MOD_PARTS[1]!);
    const row = encodeStory(s.view);
    expect(decodeStory(row)).toEqual(s.view);
    expect(decodeStory(row.slice(0, 13))!.k).toBe(0);
  });
});

describe('ZARYA weapon mods', () => {
  it('spends the squad parts at a bench, and the Charge only at a proper one', () => {
    const s = act2();
    const lesser = BENCHES.find((b) => !b.main && b.at.z > 100)!.at; // the Dvor's
    const timur = BENCHES.find((b) => b.main)!.at;
    expect(ZaryaStory.can(s.view, 'mod', MOD.drum)).toBe(false);
    s.act('shutter', 1, before(SHUTTERS[1]!.at, SHUTTERS[1]!.yaw));
    s.act('modPart', 0, MOD_PARTS[0]!);
    expect(ZaryaStory.modParts(s.view)).toBe(2);
    expect(s.act('mod', MOD.charge, { x: 0, z: 0 })).toBe(false);
    expect(s.act('mod', MOD.charge, lesser)).toBe(false);
    expect(s.act('mod', MOD.charge, timur)).toBe(true);
    expect(ZaryaStory.modParts(s.view)).toBe(0);
    expect(s.view.k >> KBIT.spent).toBe(MOD_COST[MOD.charge]);
    expect(s.act('mod', MOD.drum, lesser)).toBe(false);
  });

  it('fits what makes sense on each gun', () => {
    expect(modFits(MOD.charge, 'pistol')).toBe(true);
    expect(modFits(MOD.drum, 'shotgun')).toBe(true);
    expect(modFits(MOD.frost, 'arbalet')).toBe(true);
    expect(modFits(MOD.frost, 'salyut')).toBe(false);
    expect(modFits(MOD.drum, 'rpg')).toBe(false);
    for (const i of [MOD.charge, MOD.drum, MOD.frost]) {
      expect(modFits(i, 'ottepel')).toBe(false);
      expect(modFits(i, 'zenit')).toBe(false);
      expect(modFits(i, 'raketa')).toBe(false);
    }
  });

  it('offers the Charge first at a proper bench, then the drum, then the frost coat', () => {
    expect(benchOffer('pistol', 0, 7, true)).toEqual({ i: MOD.charge, short: null });
    expect(benchOffer('pistol', 0, 7, false)).toEqual({ i: MOD.drum, short: null });
    expect(benchOffer('pistol', 1 << MOD.drum, 1, false)).toEqual({ i: MOD.frost, short: null });
    expect(benchOffer('pistol', 0, 1, true)).toEqual({ i: MOD.drum, short: null });
    expect(benchOffer('pistol', (1 << MOD.drum) | (1 << MOD.frost), 7, false)).toEqual({ i: -1, short: 'bench' });
    expect(benchOffer('pistol', (1 << MOD.drum) | (1 << MOD.frost), 1, true)).toEqual({ i: -1, short: 'parts' });
    expect(benchOffer('ottepel', 0, 7, true).i).toBe(-1);
  });

  it('charges after two seconds of aim, strikes three times as hard once, and lets go when put away', () => {
    const m = new WeaponMods();
    const gun = createCarried('pistol');
    const other = createCarried('rifle');
    m.fit(gun, MOD.charge);
    let ready = false;
    for (let t = 0; t < MOD_TUNE.chargeHold - 0.1; t += 0.1) ready = m.update(0.1, [gun, other], gun, 1) || ready;
    expect(ready).toBe(false);
    expect(m.damageMul(gun)).toBe(1);
    expect(m.update(0.3, [gun, other], gun, 1)).toBe(true);
    expect(m.damageMul(gun)).toBe(MOD_TUNE.chargeMul);
    expect(m.damageMul(other)).toBe(1);
    m.shot(gun);
    expect(m.damageMul(gun)).toBe(1);
    // aim broken before it is ready: it starts again
    m.update(1.5, [gun, other], gun, 1);
    m.update(0.1, [gun, other], gun, 0);
    m.update(1, [gun, other], gun, 1);
    expect(m.isCharged(gun)).toBe(false);
    m.update(1.1, [gun, other], gun, 1);
    expect(m.isCharged(gun)).toBe(true);
    m.update(0.1, [gun, other], other, 0);
    expect(m.isCharged(gun)).toBe(false);
  });

  it('a drum lengthens every load, and keeps it through an upgrade', () => {
    const m = new WeaponMods();
    const gun = createCarried('pistol');
    const base = gun.ammo.magSize;
    m.fit(gun, MOD.drum);
    expect(gun.ammo.magSize).toBe(Math.ceil(base * MOD_TUNE.drumMul));
    // an upgrade sets the load back to the tier's own: the next frame puts the drum's back
    gun.tier = 1;
    gun.ammo.magSize = 17;
    m.update(0.016, [gun, null], gun, 0);
    expect(gun.ammo.magSize).toBe(drumMag(gun));
    expect(drumMag(gun)).toBeGreaterThan(17);
    // a gun without one is left alone
    const plain = createCarried('rifle');
    m.update(0.016, [plain, null], plain, 0);
    expect(plain.ammo.magSize).toBe(createCarried('rifle').ammo.magSize);
  });

  it('a frost coat slows what its rounds strike for two seconds (solo), then gives the pace back', () => {
    const m = new WeaponMods();
    const gun = createCarried('rifle');
    const z = fake({ speedScale: 1.1 });
    m.hit(z, gun);
    expect(z.speedScale).toBe(1.1);
    m.fit(gun, MOD.frost);
    let glints = 0;
    m.onFrost = () => glints++;
    m.hit(z, gun);
    expect(z.speedScale).toBeCloseTo(1.1 * MOD_TUNE.frostPace);
    m.update(1.5, [gun, null], gun, 0);
    m.hit(z, gun); // a second round keeps it slowed, no slower
    expect(z.speedScale).toBeCloseTo(1.1 * MOD_TUNE.frostPace);
    m.update(1.5, [gun, null], gun, 0);
    expect(z.speedScale).toBeCloseTo(1.1 * MOD_TUNE.frostPace);
    m.update(0.6, [gun, null], gun, 0);
    expect(z.speedScale).toBeCloseTo(1.1);
    expect(glints).toBe(2);
    // co-op: it glints, and slows nothing
    const c = new WeaponMods();
    c.slows = false;
    c.fit(gun, MOD.frost);
    const q = fake();
    c.hit(q, gun);
    expect(q.speedScale).toBe(1);
  });

  it('names the mods in a short word', () => {
    expect(modWord(1 << MOD.drum, false)).toBe('DRUM');
    expect(modWord((1 << MOD.drum) | (1 << MOD.frost), false)).toBe('DRUM + FROST');
    expect(modWord(7, true)).toBe('CHARGED +2');
    expect(modWord(0, false)).toBe('');
  });
});

describe('ZARYA repair booth', () => {
  it('refuses until all three of the repairman tools are back, and says where the rest are', () => {
    const v: StoryView = ZaryaStory.empty();
    const none = boothRefusal(v)!;
    expect(none.text).toBe('THE REPAIRMAN IS ASLEEP');
    expect(none.sub).toMatch(/Dvor/);
    expect(none.sub).toMatch(/garages/);
    expect(none.sub).toMatch(/depot/);
    const two = boothRefusal({ ...v, m: (1 << 6) | (1 << 8) })!;
    expect(two.sub).toMatch(/2 of his 3/);
    expect(two.sub).toMatch(/garages/);
    expect(two.sub).not.toMatch(/Dvor/);
    expect(boothRefusal({ ...v, m: 7 << 6 })).toBeNull();
  });
});
