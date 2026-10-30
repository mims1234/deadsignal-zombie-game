/**
 * Mystery boxes (pure): what a box rolls and what taking the prize does. The box itself (the reel animation, the
 * offer the player can take or leave) lives in `game/entities.ts`.
 *   ammo      reserve for both carried weapons
 *   grenades  frag grenades
 *   weapon    a gun you are not carrying; taking it replaces the one in your hands (the HX-7 only comes from here)
 */
import { GRENADE, MYSTERY_BOX, WEAPONS } from '../config';
import type { Region, WeaponId } from '../types';
import { addReserve } from './ammo';
import { activeWeapon, carries, createCarried, type Inventory } from './economy';
import type { Rng } from './rng';

export type BoxPrize = { kind: 'ammo' } | { kind: 'grenades'; count: number } | { kind: 'weapon'; id: WeaponId };

/** Every face the reel can flick past (`reelFor`: with the relics where a box holds them). */
export const REEL: readonly BoxPrize[] = [
  { kind: 'ammo' },
  { kind: 'weapon', id: 'rifle' },
  { kind: 'grenades', count: MYSTERY_BOX.grenades },
  { kind: 'weapon', id: 'shotgun' },
  { kind: 'weapon', id: 'pistol' },
  { kind: 'weapon', id: 'rpg' },
];

const RELIC_REEL: readonly BoxPrize[] = [...REEL, { kind: 'weapon', id: 'hanafubuki' }, { kind: 'weapon', id: 'raijin' }];

export function reelFor(relics: boolean): readonly BoxPrize[] {
  return relics ? RELIC_REEL : REEL;
}

export function prizeKey(p: BoxPrize): string {
  return p.kind === 'weapon' ? p.id : p.kind;
}

export function prizeLabel(p: BoxPrize): string {
  if (p.kind === 'weapon') return WEAPONS[p.id].name.toUpperCase();
  if (p.kind === 'grenades') return `FRAG GRENADES x${p.count}`;
  return 'AMMUNITION';
}

/** Roll a box in `region` for this inventory. Never offers a gun you already carry; `relics`: the relics can come up. */
export function rollBox(region: Region, inv: Inventory, rng: Rng, relics = false): BoxPrize {
  const odds = MYSTERY_BOX.odds[region];
  const weight = (id: WeaponId): number => MYSTERY_BOX.guns[id] || (relics ? (MYSTERY_BOX.relics[id] ?? 0) : 0);
  const pool = (Object.keys(MYSTERY_BOX.guns) as WeaponId[]).filter((id) => weight(id) > 0 && !carries(inv, id));
  const roll = rng.f();
  if (pool.length > 0 && roll < odds.weapon) {
    const weights = pool.map((id) => weight(id) * (id === 'rpg' ? odds.rpgMul : 1));
    let r = rng.f() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return { kind: 'weapon', id: pool[i]! };
    }
    return { kind: 'weapon', id: pool[pool.length - 1]! };
  }
  if (roll < odds.weapon + odds.grenades) return { kind: 'grenades', count: MYSTERY_BOX.grenades };
  return { kind: 'ammo' };
}

export interface TakeResult {
  ok: boolean;
  message: string;
  /** The weapon in your hands changed (cancel reloads, redraw). */
  swapped: boolean;
}

/** Take the prize. Fails (and changes nothing) when it would do nothing: grenades or ammo already full. */
export function takePrize(inv: Inventory, p: BoxPrize): TakeResult {
  if (p.kind === 'grenades') {
    const room = GRENADE.max - inv.grenades;
    if (room <= 0) return { ok: false, message: 'Grenades full', swapped: false };
    const got = Math.min(room, p.count);
    inv.grenades += got;
    return { ok: true, message: `+${got} FRAG GRENADE${got > 1 ? 'S' : ''}`, swapped: false };
  }
  if (p.kind === 'ammo') {
    let total = 0;
    for (const slot of [0, 1] as const) {
      const w = inv.slots[slot];
      if (w) total += addReserve(w.ammo, Math.round(w.ammo.magSize * MYSTERY_BOX.ammoMags));
    }
    if (total <= 0) return { ok: false, message: 'Ammunition full', swapped: false };
    inv.ammoCollected += total;
    return { ok: true, message: `+${total} AMMO`, swapped: false };
  }
  // a gun: if you picked up the same one meanwhile, it tops that one up instead
  for (const slot of [0, 1] as const) {
    const w = inv.slots[slot];
    if (w && w.id === p.id) {
      const got = addReserve(w.ammo, w.ammo.reserveMax);
      return got > 0 ? { ok: true, message: `+${got} ${WEAPONS[p.id].short} AMMO`, swapped: false } : { ok: false, message: 'Already carried', swapped: false };
    }
  }
  const old = activeWeapon(inv);
  inv.slots[inv.activeSlot] = createCarried(p.id);
  return { ok: true, message: old ? `${WEAPONS[p.id].short} REPLACES ${WEAPONS[old.id].short}` : `${WEAPONS[p.id].short} ACQUIRED`, swapped: true };
}
