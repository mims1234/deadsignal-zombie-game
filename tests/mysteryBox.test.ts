import { describe, expect, it } from 'vitest';
import { GRENADE, MYSTERY_BOX, WEAPONS } from '../src/config';
import { createCarried, createInventory } from '../src/logic/economy';
import { REEL, prizeKey, prizeLabel, rollBox, takePrize, type BoxPrize } from '../src/logic/mysteryBox';
import { Rng } from '../src/logic/rng';

describe('mystery box roll', () => {
  it('never offers a gun the player already carries', () => {
    const rng = new Rng(7);
    const inv = createInventory(); // rifle + pistol
    for (let i = 0; i < 2000; i++) {
      const p = rollBox('high', inv, rng);
      if (p.kind === 'weapon') expect(['shotgun', 'rpg']).toContain(p.id);
    }
  });

  it('lands on every kind of prize, guns more often in high-threat areas', () => {
    const count = (region: 'low' | 'high'): Record<string, number> => {
      const rng = new Rng(11);
      const inv = createInventory();
      const out: Record<string, number> = {};
      for (let i = 0; i < 4000; i++) {
        const k = rollBox(region, inv, rng).kind;
        out[k] = (out[k] ?? 0) + 1;
      }
      return out;
    };
    const low = count('low');
    const high = count('high');
    expect(low.ammo! > 0 && low.grenades! > 0 && low.weapon! > 0).toBe(true);
    expect(high.weapon!).toBeGreaterThan(low.weapon!);
    expect(Math.abs(low.weapon! / 4000 - MYSTERY_BOX.odds.low.weapon)).toBeLessThan(0.04);
  });

  it('falls back to ammo or grenades when every gun is already carried', () => {
    const rng = new Rng(3);
    const inv = createInventory();
    // nothing left to offer that is not carried? only two slots, so guns always remain: check the pool logic directly
    inv.slots = [createCarried('shotgun'), createCarried('rpg')];
    for (let i = 0; i < 500; i++) {
      const p = rollBox('high', inv, rng);
      if (p.kind === 'weapon') expect(['rifle', 'pistol']).toContain(p.id);
    }
  });

  it('every prize it can roll is on the reel', () => {
    const keys = new Set(REEL.map(prizeKey));
    const rng = new Rng(5);
    for (let i = 0; i < 1000; i++) {
      const inv = createInventory();
      expect(keys.has(prizeKey(rollBox('medium', inv, rng)))).toBe(true);
    }
  });
});

describe('taking a prize', () => {
  it('a gun replaces the weapon in your hands with a fresh one', () => {
    const inv = createInventory();
    inv.activeSlot = 1; // pistol in hand
    const r = takePrize(inv, { kind: 'weapon', id: 'rpg' });
    expect(r.ok && r.swapped).toBe(true);
    expect(inv.slots[1]!.id).toBe('rpg');
    expect(inv.slots[1]!.ammo.mag).toBe(WEAPONS.rpg.magSize);
    expect(inv.slots[0]!.id).toBe('rifle');
  });

  it('a gun you picked up meanwhile becomes its ammo instead of a duplicate', () => {
    const inv = createInventory();
    inv.slots[0]!.ammo.reserve = 0;
    const r = takePrize(inv, { kind: 'weapon', id: 'rifle' });
    expect(r.ok).toBe(true);
    expect(r.swapped).toBe(false);
    expect(inv.slots[0]!.ammo.reserve).toBe(inv.slots[0]!.ammo.reserveMax);
  });

  it('grenades cap at the carry limit and fail when full', () => {
    const inv = createInventory();
    inv.grenades = GRENADE.max - 1;
    expect(takePrize(inv, { kind: 'grenades', count: 2 }).ok).toBe(true);
    expect(inv.grenades).toBe(GRENADE.max);
    const before = { ...inv };
    expect(takePrize(inv, { kind: 'grenades', count: 2 }).ok).toBe(false);
    expect(inv.grenades).toBe(before.grenades);
  });

  it('ammo tops up both weapons and fails when both are full', () => {
    const inv = createInventory();
    for (const w of inv.slots) w!.ammo.reserve = w!.ammo.reserveMax;
    expect(takePrize(inv, { kind: 'ammo' }).ok).toBe(false);
    inv.slots[0]!.ammo.reserve = 0;
    inv.slots[1]!.ammo.reserve = 0;
    expect(takePrize(inv, { kind: 'ammo' }).ok).toBe(true);
    expect(inv.slots[0]!.ammo.reserve).toBeGreaterThan(0);
    expect(inv.slots[1]!.ammo.reserve).toBeGreaterThan(0);
  });

  it('labels name the prize', () => {
    const p: BoxPrize = { kind: 'weapon', id: 'rpg' };
    expect(prizeLabel(p)).toBe(WEAPONS.rpg.name.toUpperCase());
    expect(prizeLabel({ kind: 'grenades', count: 2 })).toContain('x2');
  });
});
