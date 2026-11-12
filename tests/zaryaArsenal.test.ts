import { describe, expect, it } from 'vitest';
import { MYSTERY_BOX, WEAPONS } from '../src/config';
import { ammoText, armEntries, armIndex, armRows, armStep } from '../src/logic/arsenal';
import {
  addGun,
  applyCrateReward,
  buyMenu,
  carries,
  createCarried,
  createInventory,
  menuSlots,
  purchaseBuy,
  purchaseUpgrade,
  rollCrateReward,
  upgradeMenu,
  type Inventory,
} from '../src/logic/economy';
import { rollBox, takePrize } from '../src/logic/mysteryBox';
import { Rng } from '../src/logic/rng';
import type { WeaponId } from '../src/types';

/** ZARYA's starting inventory: a pistol and an empty slot, every gun kept. */
function zaryaInv(): Inventory {
  const inv = createInventory();
  inv.slots = [createCarried('pistol'), null];
  inv.activeSlot = 0;
  inv.arsenal = true;
  return inv;
}

const ZARYA_GUNS: WeaponId[] = ['rifle', 'shotgun', 'rpg', 'signalka', 'arbalet', 'gvozdomyot', 'salyut', 'ottepel', 'zenit', 'raketa'];

describe('ZARYA arsenal: carrying', () => {
  it('keeps every gun taken; nothing is replaced', () => {
    const inv = zaryaInv();
    for (const id of ZARYA_GUNS) {
      const r = addGun(inv, id);
      expect(r.added).toBe(true);
      expect(r.topped).toBe(0);
    }
    const ids = inv.slots.filter((w) => !!w).map((w) => w!.id);
    expect(ids).toEqual(['pistol', ...ZARYA_GUNS]);
    for (const id of ZARYA_GUNS) expect(carries(inv, id)).toBe(true);
  });

  it('fills an empty slot before making a new one', () => {
    const inv = zaryaInv();
    expect(addGun(inv, 'rifle').slot).toBe(1);
    expect(addGun(inv, 'shotgun').slot).toBe(2);
    inv.slots[1] = null;
    expect(addGun(inv, 'signalka').slot).toBe(1);
  });

  it('does not change the gun in hand by itself', () => {
    const inv = zaryaInv();
    addGun(inv, 'rifle');
    expect(inv.activeSlot).toBe(0);
  });

  it('a gun carried already tops up its reserve and keeps its slot, ammunition kept per gun', () => {
    const inv = zaryaInv();
    addGun(inv, 'rifle');
    const rifle = inv.slots[1]!;
    const pistol = inv.slots[0]!;
    rifle.ammo.reserve = 3;
    rifle.ammo.mag = 5;
    pistol.ammo.reserve = 7;
    const r = addGun(inv, 'rifle');
    expect(r.added).toBe(false);
    expect(r.slot).toBe(1);
    expect(r.topped).toBe(rifle.ammo.reserveMax - 3);
    expect(rifle.ammo.reserve).toBe(rifle.ammo.reserveMax);
    expect(rifle.ammo.mag).toBe(5);
    expect(pistol.ammo.reserve).toBe(7); // the other gun's rounds are its own
    expect(addGun(inv, 'rifle').topped).toBe(0); // full: nothing more
    expect(inv.slots.filter((w) => w?.id === 'rifle')).toHaveLength(1);
  });
});

describe('ZARYA arsenal: the cycle', () => {
  it('guns in slot order, then the weapons to swing in the order taken', () => {
    const inv = zaryaInv();
    addGun(inv, 'rifle');
    addGun(inv, 'signalka');
    inv.slots[1] = null; // a hole is skipped
    const e = armEntries(inv, ['knife', 'maul']);
    expect(e).toEqual([
      { kind: 'gun', slot: 0 },
      { kind: 'gun', slot: 2 },
      { kind: 'melee', id: 'knife' },
      { kind: 'melee', id: 'maul' },
    ]);
    expect(armIndex(e, inv, null)).toBe(0);
    inv.activeSlot = 2;
    expect(armIndex(e, inv, null)).toBe(1);
    expect(armIndex(e, inv, 'maul')).toBe(3); // something swung out wins over the gun slot
  });

  it('steps forward and back, wrapping round', () => {
    expect(armStep(4, 0, 1)).toBe(1);
    expect(armStep(4, 3, 1)).toBe(0);
    expect(armStep(4, 0, -1)).toBe(3);
    expect(armStep(4, -1, 1)).toBe(0);
    expect(armStep(4, -1, -1)).toBe(3);
    expect(armStep(0, 0, 1)).toBe(-1);
    expect(armStep(1, 0, 1)).toBe(0);
  });

  it('the phone list: a row per thing carried, ammunition shown, the one in hand lit', () => {
    const inv = zaryaInv();
    addGun(inv, 'ottepel');
    addGun(inv, 'rifle');
    inv.slots[2]!.tier = 2;
    const e = armEntries(inv, ['knife']);
    const rows = armRows(e, inv, 1);
    expect(rows.map((r) => r.on)).toEqual([false, true, false, false]);
    expect(rows[0]!.label).toBe(WEAPONS.pistol.short);
    expect(rows[0]!.sub).toBe(`${inv.slots[0]!.ammo.mag} / ${inv.slots[0]!.ammo.reserve}`);
    expect(rows[1]!.sub).not.toContain('/'); // the steam gun has a gauge, no reserve
    expect(rows[2]!.label).toBe(`${WEAPONS.rifle.short} III`);
    expect(rows[3]).toEqual({ label: 'KNIFE', sub: 'SWING', on: false });
    expect(ammoText(createCarried('zenit'))).not.toContain('/');
  });
});

describe('ZARYA arsenal: stations, crates, the sack', () => {
  it('a gun bought at a counter joins the others', () => {
    const inv = zaryaInv();
    inv.cash = 100000;
    addGun(inv, 'rifle');
    expect(buyMenu(inv).find((i) => i.id === 'shotgun')!.note).toBeUndefined();
    const r = purchaseBuy(inv, 'shotgun');
    expect(r.ok).toBe(true);
    expect(inv.slots.map((w) => w?.id)).toEqual(['pistol', 'rifle', 'shotgun']);
    expect(inv.slots[inv.activeSlot]!.id).toBe('shotgun');
  });

  it('ammunition: 1 is the gun in hand, 2 every other gun', () => {
    const inv = zaryaInv();
    inv.cash = 100000;
    addGun(inv, 'rifle');
    addGun(inv, 'shotgun');
    for (const w of inv.slots) w!.ammo.reserve = 0;
    const menu = buyMenu(inv);
    const others = menu.find((i) => i.id === 'ammo1')!;
    expect(others.cost).toBe(WEAPONS.rifle.ammoPrice + WEAPONS.shotgun.ammoPrice);
    expect(purchaseBuy(inv, 'ammo1').ok).toBe(true);
    expect(inv.slots[0]!.ammo.reserve).toBe(0); // the pistol in hand is left
    expect(inv.slots[1]!.ammo.reserve).toBe(inv.slots[1]!.ammo.reserveMax);
    expect(inv.slots[2]!.ammo.reserve).toBe(inv.slots[2]!.ammo.reserveMax);
    expect(buyMenu(inv).find((i) => i.id === 'ammo1')!.state).toBe('full');
    expect(purchaseBuy(inv, 'ammo0').ok).toBe(true);
    expect(inv.slots[0]!.ammo.reserve).toBe(inv.slots[0]!.ammo.reserveMax);
  });

  it('upgrades: the gun in hand first, any gun carried can be upgraded by its row', () => {
    const inv = zaryaInv();
    inv.cash = 100000;
    addGun(inv, 'rifle');
    addGun(inv, 'shotgun');
    inv.activeSlot = 2;
    expect(menuSlots(inv)).toEqual([2, 0, 1]);
    const menu = upgradeMenu(inv);
    expect(menu.map((i) => [i.key, i.id])).toEqual([['1', 'up2'], ['2', 'up0'], ['3', 'up1']]);
    expect(purchaseUpgrade(inv, 1).ok).toBe(true);
    expect(inv.slots[1]!.tier).toBe(1);
  });

  it('a crate puts rounds in every gun carried', () => {
    const inv = zaryaInv();
    addGun(inv, 'rifle');
    addGun(inv, 'shotgun');
    for (const w of inv.slots) w!.ammo.reserve = 0;
    const r = rollCrateReward('medium', inv, new Rng(5));
    expect(r.ammo).toHaveLength(3);
    const got = applyCrateReward(inv, r);
    expect(got.ammo.every((n) => n > 0)).toBe(true);
  });

  it('the sack: a gun joins the others and comes to hand; a weapon to swing replaces nothing', () => {
    const inv = zaryaInv();
    addGun(inv, 'rifle');
    const t = takePrize(inv, { kind: 'weapon', id: 'raketa' });
    expect(t.ok && t.swapped).toBe(true);
    expect(inv.slots.map((w) => w?.id)).toEqual(['pistol', 'rifle', 'raketa']);
    expect(inv.slots[inv.activeSlot]!.id).toBe('raketa');
    const m = takePrize(inv, { kind: 'melee', id: 'kisten' }, 'knife', ['knife', 'maul']);
    expect(m.ok).toBe(true);
    expect(m.melee).toBe('kisten');
    expect(m.message).not.toContain('REPLACES');
    expect(takePrize(inv, { kind: 'melee', id: 'maul' }, 'knife', ['knife', 'maul']).ok).toBe(false);
  });

  it('the sack never offers a weapon to swing already carried', () => {
    const inv = zaryaInv();
    for (let seed = 1; seed < 400; seed++) {
      const p = rollBox('high', inv, new Rng(seed), false, { map: 'zarya', melee: 'knife', owned: ['knife', 'kisten'] });
      expect(p.kind === 'melee' && p.id === 'kisten').toBe(false);
    }
    // (round 3: ZARYA's sack holds no weapon to swing at all now)
    expect(MYSTERY_BOX.mapPrizes.zarya?.melee).toBeUndefined();
  });
});

describe('every other map: two slots exactly as before', () => {
  it('a bought gun still replaces the one in hand, and the menus list two slots', () => {
    const inv = createInventory();
    inv.cash = 100000;
    expect(inv.arsenal).toBeUndefined();
    expect(inv.slots).toHaveLength(2);
    expect(buyMenu(inv).find((i) => i.id === 'shotgun')!.note).toMatch(/^REPLACES/);
    purchaseBuy(inv, 'shotgun');
    expect(inv.slots).toHaveLength(2);
    expect(inv.slots[0]!.id).toBe('shotgun');
    expect(menuSlots(inv)).toEqual([0, 1]);
    expect(upgradeMenu(inv).map((i) => i.id)).toEqual(['up0', 'up1']);
  });

  it('a box gun replaces the one in hand when both slots are full', () => {
    const inv = createInventory();
    const t = takePrize(inv, { kind: 'weapon', id: 'rpg' });
    expect(t.message).toMatch(/REPLACES/);
    expect(inv.slots).toHaveLength(2);
  });
});
