/**
 * The Asylum's purchasable loop: the pure rules (doors, power, perks, wall-buys, Pack-a-Punch) and, against the real
 * colliders, that every zone is sealed except through its doors and that buying a door joins the zones either side.
 */
import '../src/sim/stubs';
import { describe, expect, it } from 'vitest';
import { PLAYER, WEAPONS } from '../src/config';
import { createInventory, createCarried } from '../src/logic/economy';
import { getWeaponStats } from '../src/logic/weaponStats';
import { SessionSim } from '../src/sim/serverHost';
import { FlowField, UNREACHABLE } from '../src/world/nav';
import { LOOP, PERK_DEFS, WALL_PRICES } from '../src/asylum/loopConfig';
import { ASYLUM_DOORS, PAP_MACHINE, PERK_MACHINES, POWER_LEVER, WALL_BUYS, ZONE_ANCHORS, ZONES, zoneAt, type ZoneId } from '../src/asylum/loopData';
import {
  buyDoor, buyPerk, buyWall, createLoopState, doorState, hasPerk, isZoneOpen, losePerks, packAPunch, papOffer, perkMods, perksOf, resetLoopState,
  setPower, SOLO_ID, spawnAllowed, useSecondWind, wallAmmoPrice, wallOffer,
} from '../src/asylum/loop';

const door = (id: string): number => ASYLUM_DOORS.findIndex((d) => d.id === id);
const rich = (cash = 100000) => {
  const inv = createInventory();
  inv.cash = cash;
  return inv;
};

describe('asylum loop rules', () => {
  it('starts with only the front grounds open and the power off', () => {
    const s = createLoopState();
    expect(ZONES.filter((z) => isZoneOpen(s, z))).toEqual(['front']);
    expect(s.power).toBe(0);
    expect(s.doors).toEqual(ASYLUM_DOORS.map(() => 0));
  });

  it('prices escalate from the front inward', () => {
    const fromFront = ASYLUM_DOORS.filter((d) => d.zones.includes('front')).map((d) => d.cost);
    const toBack = ASYLUM_DOORS.filter((d) => d.zones.includes('back')).map((d) => d.cost);
    expect(Math.max(...fromFront)).toBeLessThan(Math.min(...toBack));
    expect(Math.min(...ASYLUM_DOORS.map((d) => d.cost))).toBe(750);
    expect(Math.max(...ASYLUM_DOORS.map((d) => d.cost))).toBe(2000);
  });

  it('buys a door: takes the cash, opens the zone; fails cleanly without the cash', () => {
    const s = createLoopState();
    const i = door('westWardFront');
    const poor = rich(500);
    const r0 = buyDoor(s, i, poor);
    expect(r0.ok).toBe(false);
    expect(r0.reason).toBe('unaffordable');
    expect(r0.message).toBe('NOT ENOUGH $');
    expect(poor.cash).toBe(500);
    expect(isZoneOpen(s, 'westWard')).toBe(false);
    const inv = rich(1000);
    const r = buyDoor(s, i, inv);
    expect(r.ok).toBe(true);
    expect(inv.cash).toBe(1000 - ASYLUM_DOORS[i]!.cost);
    expect(inv.cashSpent).toBe(ASYLUM_DOORS[i]!.cost);
    expect(isZoneOpen(s, 'westWard')).toBe(true);
    expect(buyDoor(s, i, inv).reason).toBe('open');
  });

  it('will not sell a door between two closed zones', () => {
    const s = createLoopState();
    const i = door('yardBack');
    expect(doorState(s, i, 1e6)).toBe('unreachable');
    expect(buyDoor(s, i, rich()).ok).toBe(false);
    buyDoor(s, door('adminYard'), rich());
    expect(doorState(s, i, 1e6)).toBe('ok');
  });

  it('only spawns the infected in open zones', () => {
    const s = createLoopState();
    expect(spawnAllowed(s, 0, 40)).toBe(true);
    expect(spawnAllowed(s, -40, -5)).toBe(false);
    buyDoor(s, door('westWardFront'), rich());
    buyDoor(s, door('westWardCemetery'), rich());
    expect(spawnAllowed(s, -40, -5)).toBe(true);
    expect(spawnAllowed(s, 0, -40)).toBe(false);
  });

  it('places every machine, chalk and the lever in the zone it is meant for', () => {
    expect(zoneAt(POWER_LEVER.x, POWER_LEVER.z)).toBe('boiler');
    expect(zoneAt(PAP_MACHINE.x, PAP_MACHINE.z)).toBe('back');
    expect(PERK_MACHINES.map((m) => zoneAt(m.x, m.z))).toEqual(['yard', 'boiler', 'front', 'cemetery']);
    expect(WALL_BUYS.map((w) => zoneAt(w.x, w.z))).toEqual(['front', 'westWard', 'eastWard', 'back']);
  });

  it('perks need the power, cost their price, cap at four and are lost on going down', () => {
    const s = createLoopState();
    const inv = rich(20000);
    expect(buyPerk(s, SOLO_ID, 'ironhide', inv).reason).toBe('nopower');
    expect(inv.cash).toBe(20000);
    expect(setPower(s, true)).toBe(true);
    expect(setPower(s, true)).toBe(false);
    expect(buyPerk(s, SOLO_ID, 'ironhide', inv).ok).toBe(true);
    expect(inv.cash).toBe(20000 - PERK_DEFS.ironhide.cost);
    expect(buyPerk(s, SOLO_ID, 'ironhide', inv).reason).toBe('owned');
    for (const p of ['quickhand', 'secondWind', 'rapidFire'] as const) expect(buyPerk(s, SOLO_ID, p, inv).ok).toBe(true);
    expect(perksOf(s, SOLO_ID)).toEqual(['ironhide', 'quickhand', 'secondWind', 'rapidFire']);
    expect(perksOf(s, SOLO_ID).length).toBe(LOOP.maxPerks);
    // another player's perks are their own
    expect(perksOf(s, 'mate')).toEqual([]);
    expect(buyPerk(s, 'mate', 'quickhand', rich(100)).reason).toBe('unaffordable');
    expect(losePerks(s, SOLO_ID)).toHaveLength(4);
    expect(perksOf(s, SOLO_ID)).toEqual([]);
  });

  it('works out the perk multipliers', () => {
    const none = perkMods([], PLAYER.maxHealth);
    expect(none).toEqual({ maxHealth: PLAYER.maxHealth, reloadMul: 1, fireIntervalMul: 1, reviveMul: 1 });
    const all = perkMods(['ironhide', 'quickhand', 'rapidFire', 'secondWind'], PLAYER.maxHealth);
    expect(all.maxHealth).toBe(250);
    expect(all.reloadMul).toBe(0.5);
    // a third faster: rounds per second x 1.33
    expect(1 / all.fireIntervalMul).toBeCloseTo(1.333, 2);
    expect(all.reviveMul).toBeLessThan(1);
  });

  it('second wind saves you once and takes your perks with it', () => {
    const s = createLoopState();
    setPower(s, true);
    expect(useSecondWind(s, SOLO_ID)).toBe(false);
    buyPerk(s, SOLO_ID, 'ironhide', rich());
    buyPerk(s, SOLO_ID, 'secondWind', rich());
    expect(useSecondWind(s, SOLO_ID)).toBe(true);
    expect(hasPerk(s, SOLO_ID, 'secondWind')).toBe(false);
    expect(perksOf(s, SOLO_ID)).toEqual([]);
    expect(useSecondWind(s, SOLO_ID)).toBe(false);
  });

  it('wall chalks sell the gun, or its ammo at half price when you carry it', () => {
    const inv = rich(5000);
    // the starting kit carries the rifle and the pistol; a shotgun replaces the gun in your hands
    expect(wallOffer(inv, 'shotgun')).toEqual({ kind: 'weapon', cost: WALL_PRICES.shotgun, state: 'ok' });
    const r = buyWall(inv, 'shotgun');
    expect(r.ok && r.swapped).toBe(true);
    expect(inv.slots[inv.activeSlot]!.id).toBe('shotgun');
    expect(inv.cash).toBe(5000 - WALL_PRICES.shotgun);
    // carrying it, full: nothing to buy
    expect(wallOffer(inv, 'shotgun').state).toBe('full');
    expect(buyWall(inv, 'shotgun').reason).toBe('full');
    // spend some, buy ammo at half price
    const sg = inv.slots[inv.activeSlot]!;
    sg.ammo.mag = 1;
    sg.ammo.reserve = 0;
    const cash = inv.cash;
    expect(wallAmmoPrice('shotgun')).toBe(WALL_PRICES.shotgun / 2);
    const a = buyWall(inv, 'shotgun');
    expect(a.ok && !a.swapped).toBe(true);
    expect(inv.cash).toBe(cash - WALL_PRICES.shotgun / 2);
    expect(sg.ammo.mag).toBe(sg.ammo.magSize);
    expect(sg.ammo.reserve).toBe(sg.ammo.reserveMax);
    // not enough cash
    const poor = rich(100);
    expect(buyWall(poor, 'rpg').message).toBe('NOT ENOUGH $');
    expect(poor.slots[0]!.id).toBe('rifle');
  });

  it('Pack-a-Punch needs the power, takes the gun up a tier per purchase, refills it and stops at the top', () => {
    const s = createLoopState();
    const inv = rich(20000);
    expect(papOffer(s, inv).state).toBe('nopower');
    expect(packAPunch(s, inv).ok).toBe(false);
    setPower(s, true);
    const w = inv.slots[inv.activeSlot]!;
    w.ammo.mag = 0;
    expect(packAPunch(s, inv).ok).toBe(true);
    expect(w.tier).toBe(1);
    const st = getWeaponStats(WEAPONS[w.id], 1);
    expect(w.ammo.mag).toBe(st.magSize);
    expect(w.ammo.reserve).toBe(st.reserveMax);
    expect(inv.cash).toBe(20000 - LOOP.pap.cost);
    expect(packAPunch(s, inv).ok).toBe(true);
    expect(w.tier).toBe(2);
    expect(papOffer(s, inv).state).toBe('maxed');
    expect(packAPunch(s, inv).reason).toBe('maxed');
    expect(inv.cash).toBe(20000 - 2 * LOOP.pap.cost);
    const poor = rich(100);
    poor.slots[0] = createCarried('pistol');
    expect(packAPunch(s, poor).message).toBe('NOT ENOUGH $');
  });

  it('resets for a new run', () => {
    const s = createLoopState();
    setPower(s, true);
    buyDoor(s, 0, rich());
    buyPerk(s, SOLO_ID, 'quickhand', rich());
    resetLoopState(s);
    expect(s).toEqual(createLoopState());
    // plain data: survives a JSON round trip (co-op snapshots)
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('the Asylum zones against the real colliders', () => {
  const level = new SessionSim({ map: 'asylum', send: () => {} }).level;
  const doors = level.doors!;
  const nav = level.nav;
  const field = new FlowField(nav);
  /** The zones whose cells a flood from a zone's anchor reaches. */
  const reachedZones = (from: ZoneId): Set<ZoneId> => {
    const a = ZONE_ANCHORS[from];
    field.compute(a.x, a.z);
    const out = new Set<ZoneId>();
    for (let i = 0; i < nav.count; i++) if (field.dist[i] !== UNREACHABLE) out.add(zoneAt(nav.cellCenterX(i), nav.cellCenterZ(i)));
    return out;
  };

  it('has a door collider for every door, built open', () => {
    expect(doors.defs.length).toBe(ASYLUM_DOORS.length);
    for (let i = 0; i < ASYLUM_DOORS.length; i++) expect(doors.isOpen(i)).toBe(true);
  });

  it('with every door shut, each zone is sealed', () => {
    doors.setAll(false);
    for (const z of ZONES) expect([...reachedZones(z)]).toEqual([z]);
    doors.setAll(true);
  });

  it('a shut door blocks the player and the infected; open, they pass', () => {
    const i = ASYLUM_DOORS.findIndex((d) => d.id === 'westWardFront');
    const d = ASYLUM_DOORS[i]!;
    doors.setOpen(i, false);
    expect(level.world.circleBlocked(d.x, d.z, PLAYER.radius, 0.1, 1.7)).toBe(true);
    expect(nav.isBlockedAt(d.x, d.z)).toBe(true);
    doors.setOpen(i, true);
    expect(level.world.circleBlocked(d.x, d.z, PLAYER.radius, 0.1, 1.7)).toBe(false);
    expect(nav.isBlockedAt(d.x, d.z)).toBe(false);
  });

  it('opening one door joins exactly the two zones it sits between', () => {
    for (let i = 0; i < ASYLUM_DOORS.length; i++) {
      const d = ASYLUM_DOORS[i]!;
      doors.setAll(false);
      doors.setOpen(i, true);
      expect({ door: d.id, zones: [...reachedZones(d.zones[0])].sort() }).toEqual({ door: d.id, zones: [...d.zones].sort() });
    }
    doors.setAll(true);
  });

  it('can reach the power, the Matron and the LZ once the right doors are bought', () => {
    const s = createLoopState();
    const inv = rich();
    doors.setAll(false);
    const st = level.data.playerStart;
    // the LZ is in the always-open front grounds
    field.compute(st.x, st.z);
    expect(field.isReachable(level.data.extraction.lzX, level.data.extraction.lzZ)).toBe(true);
    const site = level.data.defense;
    const atSite = (): boolean => field.isReachable(site.x - site.radius + 2, site.z) || field.isReachable(site.x, site.z + site.radius - 2);
    expect(atSite()).toBe(false);
    for (const id of ['eastWardFront', 'eastWardBoiler', 'adminYard', 'yardBack']) {
      expect(buyDoor(s, door(id), inv).ok).toBe(true);
    }
    doors.sync(s.doors);
    field.compute(st.x, st.z);
    expect(atSite()).toBe(true);
    expect(field.isReachable(level.data.hunt.wardenX, level.data.hunt.wardenZ)).toBe(true);
    expect(field.isReachable(POWER_LEVER.x, POWER_LEVER.z + 0.8)).toBe(true);
    expect(field.isReachable(PAP_MACHINE.x, PAP_MACHINE.z + 1.2)).toBe(true);
    doors.setAll(true);
  });
});
