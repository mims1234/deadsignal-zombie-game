/**
 * ZARYA's kiosk shutters, weapon mods and repair booth (`src/zarya/mods.ts`, the story's `k`): what may be done where,
 * what it costs, what goes on the wire, and what a mod does to a gun.
 */
import { describe, expect, it } from 'vitest';
import type { Zombie } from '../src/enemies/zombie';
import { createCarried } from '../src/logic/economy';
import { MOD, MODS, MOD_TUNE, OFFERED, WeaponMods, benchOffer, boothRefusal, drumMag, fitPreview, modFits, modJournal, modWord } from '../src/zarya/mods';
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
  it('spends one of the squad parts at any bench for each mod', () => {
    const s = act2();
    const lesser = BENCHES.find((b) => !b.main && b.at.z > 100)!.at; // the Dvor's
    expect(ZaryaStory.can(s.view, 'mod', MOD.drum)).toBe(false);
    s.act('shutter', 1, before(SHUTTERS[1]!.at, SHUTTERS[1]!.yaw));
    s.act('modPart', 0, MOD_PARTS[0]!);
    expect(ZaryaStory.modParts(s.view)).toBe(2);
    expect(s.act('mod', MOD.drum, { x: 0, z: 0 })).toBe(false);
    expect(s.act('mod', MOD.drum, lesser)).toBe(true);
    expect(s.act('mod', MOD.frost, lesser)).toBe(true);
    expect(ZaryaStory.modParts(s.view)).toBe(0);
    expect(s.view.k >> KBIT.spent).toBe(MOD_COST[MOD.drum] + MOD_COST[MOD.frost]);
    expect(s.act('mod', MOD.drum, lesser)).toBe(false);
  });

  it('keeps two mods whose names say what they do, and offers the cut Charge nowhere', () => {
    expect(OFFERED).toEqual([MOD.drum, MOD.frost]);
    expect(MODS[MOD.charge]!.cut).toBe(true);
    expect(MODS[MOD.drum]!.name).toBe('A BIG MAGAZINE');
    expect(MODS[MOD.frost]!.name).toBe('FROST ROUNDS');
    for (const id of ['pistol', 'rifle', 'shotgun', 'arbalet', 'gvozdomyot', 'signalka', 'salyut'] as const) expect(modFits(MOD.charge, id)).toBe(false);
    expect(MOD_COST[MOD.drum]).toBe(1);
    expect(MOD_COST[MOD.frost]).toBe(1);
  });

  it('fits what makes sense on each gun', () => {
    expect(modFits(MOD.drum, 'shotgun')).toBe(true);
    expect(modFits(MOD.drum, 'gvozdomyot')).toBe(true);
    expect(modFits(MOD.frost, 'arbalet')).toBe(true);
    expect(modFits(MOD.frost, 'gvozdomyot')).toBe(true);
    expect(modFits(MOD.frost, 'salyut')).toBe(false);
    expect(modFits(MOD.drum, 'rpg')).toBe(false);
    for (const i of [MOD.charge, MOD.drum, MOD.frost]) {
      expect(modFits(i, 'ottepel')).toBe(false);
      expect(modFits(i, 'zenit')).toBe(false);
      expect(modFits(i, 'raketa')).toBe(false);
    }
  });

  it('offers the big magazine first, then frost rounds, at any bench', () => {
    expect(benchOffer('pistol', 0, 7)).toEqual({ i: MOD.drum, short: null });
    expect(benchOffer('pistol', 1 << MOD.drum, 1)).toEqual({ i: MOD.frost, short: null });
    expect(benchOffer('pistol', 0, 0)).toEqual({ i: -1, short: 'parts' });
    expect(benchOffer('pistol', (1 << MOD.drum) | (1 << MOD.frost), 7)).toEqual({ i: -1, short: null });
    expect(benchOffer('salyut', 0, 7)).toEqual({ i: -1, short: null }); // one round a load, and fireworks
    expect(benchOffer('ottepel', 0, 7).i).toBe(-1);
  });

  it('says at the bench what fitting will do, in the gun\'s own rounds', () => {
    expect(fitPreview(createCarried('gvozdomyot'), MOD.drum)).toBe('150 -> 225 nails a load');
    expect(fitPreview(createCarried('pistol'), MOD.drum)).toMatch(/^13 -> 20 rounds a load$/);
    expect(fitPreview(createCarried('arbalet'), MOD.frost)).toBe('Its bolts will slow what they hit for 2 seconds');
  });

  it('a big magazine goes on with the load topped up from its own rounds, so the count jumps', () => {
    const m = new WeaponMods();
    const gun = createCarried('gvozdomyot');
    gun.ammo.mag = 100;
    const all = gun.ammo.mag + gun.ammo.reserve;
    m.fit(gun, MOD.drum);
    expect(gun.ammo.magSize).toBe(225);
    expect(gun.ammo.mag).toBe(225);
    expect(gun.ammo.mag + gun.ammo.reserve).toBe(all);
    // with too few rounds left it takes what there is
    const low = createCarried('pistol');
    low.ammo.mag = 2;
    low.ammo.reserve = 3;
    m.fit(low, MOD.drum);
    expect([low.ammo.mag, low.ammo.reserve]).toEqual([5, 0]);
  });

  it('a big magazine lengthens every load, and keeps it through an upgrade', () => {
    const m = new WeaponMods();
    const gun = createCarried('pistol');
    const base = gun.ammo.magSize;
    m.fit(gun, MOD.drum);
    expect(gun.ammo.magSize).toBe(Math.ceil(base * MOD_TUNE.drumMul));
    // an upgrade sets the load back to the tier's own: the next frame puts the drum's back
    gun.tier = 1;
    gun.ammo.magSize = 17;
    m.update(0.016, [gun, null]);
    expect(gun.ammo.magSize).toBe(drumMag(gun));
    expect(drumMag(gun)).toBeGreaterThan(17);
    // a gun without one is left alone
    const plain = createCarried('rifle');
    m.update(0.016, [plain, null]);
    expect(plain.ammo.magSize).toBe(createCarried('rifle').ammo.magSize);
  });

  it('frost rounds slow what they strike for two seconds (solo), glittering while it lasts, then give the pace back', () => {
    const m = new WeaponMods();
    const gun = createCarried('rifle');
    const z = fake({ speedScale: 1.1 });
    m.hit(z, gun);
    expect(z.speedScale).toBe(1.1);
    m.fit(gun, MOD.frost);
    const glints: boolean[] = [];
    m.onFrost = (_z, still) => glints.push(still);
    m.hit(z, gun);
    expect(z.speedScale).toBeCloseTo(1.1 * MOD_TUNE.frostPace);
    expect(m.frosted).toBe(1);
    m.update(1.5, [gun, null]);
    m.hit(z, gun); // a second round keeps it slowed, no slower
    expect(z.speedScale).toBeCloseTo(1.1 * MOD_TUNE.frostPace);
    m.update(1.5, [gun, null]);
    expect(z.speedScale).toBeCloseTo(1.1 * MOD_TUNE.frostPace);
    m.update(0.6, [gun, null]);
    expect(z.speedScale).toBeCloseTo(1.1);
    expect(m.frosted).toBe(0);
    // the landing's burst, then the frost glittering on it while it was slowed
    expect(glints[0]).toBe(false);
    expect(glints.filter((g) => g).length).toBeGreaterThanOrEqual(2);
    // co-op: it slows nothing itself, but stops it stiff for a moment (once a slow), and glitters the same
    const c = new WeaponMods();
    c.slows = false;
    const stiff: number[] = [];
    c.onStiff = (_z, sec) => stiff.push(sec);
    c.fit(gun, MOD.frost);
    const q = fake();
    c.hit(q, gun);
    c.hit(q, gun);
    expect(q.speedScale).toBe(1);
    expect(stiff).toEqual([MOD_TUNE.frostStiff]);
    expect(c.frosted).toBe(1);
  });

  it('names the mods in a short word, and the journal says what each does, needs, and where the parts are', () => {
    expect(modWord(1 << MOD.drum)).toBe('BIG MAG');
    expect(modWord((1 << MOD.drum) | (1 << MOD.frost))).toBe('BIG MAG + FROST');
    expect(modWord(1 << MOD.charge)).toBe('');
    expect(modWord(0)).toBe('');
    const s = act2();
    s.act('shutter', 1, before(SHUTTERS[1]!.at, SHUTTERS[1]!.yaw));
    const rows = modJournal(s.view, [{ name: 'GVOZDOMYOT', mask: 1 << MOD.drum }, { name: 'RIFLE', mask: 0 }]);
    const all = rows.join(' ');
    expect(rows[0]).toMatch(/1 to fit, 1 of 7 found/);
    expect(all).toMatch(/BIG MAGAZINE: half as many rounds again/);
    expect(all).toMatch(/On your GVOZDOMYOT\./);
    expect(all).toMatch(/FROST ROUNDS: whatever its rounds hit is slowed for 2 seconds\. Fits .*On none of your guns yet\./);
    expect(all).toMatch(/down the Rynok's west side \(open\)/);
    expect(all).toMatch(/garage's back wall/);
    expect(all).not.toMatch(/Charge/i);
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
