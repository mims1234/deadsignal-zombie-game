/**
 * ZARYA's arsenal (pure): the town is big and full of weapons, so there a player keeps every gun and every weapon to
 * swing they take (`Inventory.arsenal`, `economy.addGun`, `MeleeSystem.pack`). This is the order they come to hand in:
 * the guns in slot order, then the weapons to swing in the order they were taken. The mouse wheel and Q step through
 * it, 1-9 pick from it, and the phone's weapon list shows it.
 */
import { WEAPONS } from '../config';
import type { CarriedWeapon, Inventory } from './economy';
import { MELEE, type MeleeId } from './melee';

export type ArmEntry = { kind: 'gun'; slot: number } | { kind: 'melee'; id: MeleeId };

/** Everything carried, in the order it comes to hand. */
export function armEntries(inv: Inventory, pack: readonly MeleeId[]): ArmEntry[] {
  const out: ArmEntry[] = [];
  inv.slots.forEach((w, slot) => {
    if (w) out.push({ kind: 'gun', slot });
  });
  for (const id of pack) out.push({ kind: 'melee', id });
  return out;
}

/** Which entry is in hand now (`swung`: the weapon to swing that is out, or null while a gun is). -1: none of them. */
export function armIndex(entries: readonly ArmEntry[], inv: Inventory, swung: MeleeId | null): number {
  return entries.findIndex((e) => (swung ? e.kind === 'melee' && e.id === swung : e.kind === 'gun' && e.slot === inv.activeSlot));
}

/** The entry `dir` steps (+1 next, -1 back) from `from`, wrapping round; -1 when nothing is carried. */
export function armStep(count: number, from: number, dir: number): number {
  if (count <= 0) return -1;
  if (from < 0) return dir < 0 ? count - 1 : 0;
  return (((from + (dir < 0 ? -1 : 1)) % count) + count) % count;
}

/** One row of the phone's weapon list. */
export interface ArmRow {
  label: string;
  /** Rounds (magazine / reserve), or what it does when there is nothing to count. */
  sub: string;
  on: boolean;
}

/** The ammunition readout of one gun (ZARYA's gauge and bulb guns count no reserve). */
export function ammoText(c: CarriedWeapon): string {
  const mag = c.id === 'ottepel' ? Math.floor(c.ammo.mag) : c.ammo.mag;
  return c.id === 'ottepel' || c.id === 'zenit' || c.id === 'raketa' ? `${mag}` : `${mag} / ${c.ammo.reserve}`;
}

/** The phone's weapon list, row for row with `armEntries`. */
export function armRows(entries: readonly ArmEntry[], inv: Inventory, current: number): ArmRow[] {
  return entries.map((e, i) => {
    if (e.kind === 'melee') return { label: MELEE[e.id].short, sub: 'SWING', on: i === current };
    const c = inv.slots[e.slot]!;
    const d = WEAPONS[c.id];
    return { label: `${d.short}${c.tier > 0 ? (c.tier > 1 ? ' III' : ' II') : ''}`, sub: ammoText(c), on: i === current };
  });
}
