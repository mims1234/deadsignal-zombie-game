/**
 * Mystery boxes (pure): what a box rolls and what taking the prize does. The box itself (the reel animation, the
 * offer the player can take or leave) lives in `game/entities.ts`.
 *   ammo      reserve for every carried weapon
 *   grenades  frag grenades
 *   weapon    a gun you are not carrying; it goes into an empty gun slot, or replaces the one in your hands (the HX-7
 *             only comes from here). ZARYA's arsenal (`Inventory.arsenal`) keeps it beside every other gun instead
 *   melee     a weapon to swing (only where a map's box holds one: ZARYA's sack has the Kisten); it goes into the hand
 *             that swings, never into a gun slot, and joins the others carried
 * A map can add prizes of its own to its box (`MYSTERY_BOX.mapPrizes`): ZARYA's sack is the only place the Raketa and
 * the Kisten come from. Every other map's box rolls exactly as before.
 */
import { GRENADE, MYSTERY_BOX, WEAPONS } from '../config';
import type { Region, WeaponId } from '../types';
import type { MapId } from '../world/layout/data';
import { addReserve } from './ammo';
import { activeWeapon, addGun, carries, createCarried, type Inventory } from './economy';
import { MELEE, type MeleeId } from './melee';
import type { Rng } from './rng';

export type BoxPrize = { kind: 'ammo' } | { kind: 'grenades'; count: number } | { kind: 'weapon'; id: WeaponId } | { kind: 'melee'; id: MeleeId };

/** Every face the reel can flick past (`reelFor`: with the relics where a box holds them, and a map's own prizes). */
export const REEL: readonly BoxPrize[] = [
  { kind: 'ammo' },
  { kind: 'weapon', id: 'rifle' },
  { kind: 'grenades', count: MYSTERY_BOX.grenades },
  { kind: 'weapon', id: 'shotgun' },
  { kind: 'weapon', id: 'pistol' },
  { kind: 'weapon', id: 'rpg' },
];

const RELIC_REEL: readonly BoxPrize[] = [...REEL, { kind: 'weapon', id: 'hanafubuki' }, { kind: 'weapon', id: 'raijin' }];

/** What one map's box holds beside the stock guns (nothing, on most maps). */
function mapPrizes(map: MapId | undefined): { guns: [WeaponId, number][]; melee: [MeleeId, number][] } {
  const m = map ? MYSTERY_BOX.mapPrizes[map] : undefined;
  return {
    guns: Object.entries(m?.guns ?? {}).filter(([, w]) => (w ?? 0) > 0) as [WeaponId, number][],
    melee: Object.entries(m?.melee ?? {}).filter(([, w]) => (w ?? 0) > 0) as [MeleeId, number][],
  };
}

const reels = new Map<string, readonly BoxPrize[]>();
export function reelFor(relics: boolean, map?: MapId): readonly BoxPrize[] {
  const base = relics ? RELIC_REEL : REEL;
  const own = mapPrizes(map);
  if (own.guns.length === 0 && own.melee.length === 0) return base;
  const key = `${relics ? 1 : 0}:${map}`;
  let r = reels.get(key);
  if (!r) {
    r = [...base, ...own.guns.map(([id]): BoxPrize => ({ kind: 'weapon', id })), ...own.melee.map(([id]): BoxPrize => ({ kind: 'melee', id }))];
    reels.set(key, r);
  }
  return r;
}

export function prizeKey(p: BoxPrize): string {
  return p.kind === 'weapon' ? p.id : p.kind === 'melee' ? `m:${p.id}` : p.kind;
}

export function prizeLabel(p: BoxPrize): string {
  if (p.kind === 'weapon') return WEAPONS[p.id].name.toUpperCase();
  if (p.kind === 'melee') return MELEE[p.id].name;
  if (p.kind === 'grenades') return `FRAG GRENADES x${p.count}`;
  return 'AMMUNITION';
}

/** What a roll needs to know beyond the guns carried: the map (its own prizes), and what is carried to swing. */
export interface BoxContext {
  map?: MapId;
  melee?: MeleeId | null;
  /** ZARYA's arsenal: every weapon to swing carried (none of them comes up again). */
  owned?: readonly MeleeId[];
}

/**
 * Roll a box in `region` for this inventory. Never offers a gun you already carry, nor the weapon you already swing;
 * `relics`: the relics can come up; `at.map`: that map's own prizes can come up too, by their weights among the guns.
 */
export function rollBox(region: Region, inv: Inventory, rng: Rng, relics = false, at: BoxContext = {}): BoxPrize {
  const odds = MYSTERY_BOX.odds[region];
  const own = mapPrizes(at.map);
  const ownGun = new Map(own.guns);
  const weight = (id: WeaponId): number => MYSTERY_BOX.guns[id] || (relics ? (MYSTERY_BOX.relics[id] ?? 0) : 0) || (ownGun.get(id) ?? 0);
  const ids = [...(Object.keys(MYSTERY_BOX.guns) as WeaponId[])];
  for (const [id] of own.guns) if (!ids.includes(id)) ids.push(id);
  const pool: BoxPrize[] = ids.filter((id) => weight(id) > 0 && !carries(inv, id)).map((id) => ({ kind: 'weapon', id }));
  for (const [id] of own.melee) if (at.melee !== id && !at.owned?.includes(id)) pool.push({ kind: 'melee', id });
  const ownMelee = new Map(own.melee);
  const roll = rng.f();
  if (pool.length > 0 && roll < odds.weapon) {
    const weights = pool.map((p) => (p.kind === 'melee' ? (ownMelee.get(p.id) ?? 0) : p.kind === 'weapon' ? weight(p.id) * (p.id === 'rpg' ? odds.rpgMul : 1) : 0));
    let r = rng.f() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return pool[i]!;
    }
    return pool[pool.length - 1]!;
  }
  if (roll < odds.weapon + odds.grenades) return { kind: 'grenades', count: MYSTERY_BOX.grenades };
  return { kind: 'ammo' };
}

export interface TakeResult {
  ok: boolean;
  message: string;
  /** The weapon in your hands changed (cancel reloads, redraw). */
  swapped: boolean;
  /** A weapon to swing was taken: the caller puts it in the hand that swings (the inventory holds only guns). */
  melee?: MeleeId;
}

/**
 * Take the prize. Fails (and changes nothing) when it would do nothing: grenades or ammo already full, the weapon to
 * swing already in hand (`melee`: what is carried to swing now).
 */
export function takePrize(inv: Inventory, p: BoxPrize, melee: MeleeId | null = null, owned: readonly MeleeId[] = []): TakeResult {
  if (p.kind === 'melee') {
    if (melee === p.id || owned.includes(p.id)) return { ok: false, message: 'Already carried', swapped: false };
    // (ZARYA's arsenal keeps what it had: nothing is replaced)
    const old = melee && !inv.arsenal ? MELEE[melee].short : null;
    return { ok: true, message: old ? `${MELEE[p.id].short} REPLACES ${old}` : `${MELEE[p.id].short} ACQUIRED`, swapped: false, melee: p.id };
  }
  if (p.kind === 'grenades') {
    const room = GRENADE.max - inv.grenades;
    if (room <= 0) return { ok: false, message: 'Grenades full', swapped: false };
    const got = Math.min(room, p.count);
    inv.grenades += got;
    return { ok: true, message: `+${got} FRAG GRENADE${got > 1 ? 'S' : ''}`, swapped: false };
  }
  if (p.kind === 'ammo') {
    let total = 0;
    for (const w of inv.slots) {
      if (w) total += addReserve(w.ammo, Math.round(w.ammo.magSize * MYSTERY_BOX.ammoMags));
    }
    if (total <= 0) return { ok: false, message: 'Ammunition full', swapped: false };
    inv.ammoCollected += total;
    return { ok: true, message: `+${total} AMMO`, swapped: false };
  }
  // a gun: if you picked up the same one meanwhile, it tops that one up instead
  for (const w of inv.slots) {
    if (w && w.id === p.id) {
      const got = addReserve(w.ammo, w.ammo.reserveMax);
      return got > 0 ? { ok: true, message: `+${got} ${WEAPONS[p.id].short} AMMO`, swapped: false } : { ok: false, message: 'Already carried', swapped: false };
    }
  }
  // ZARYA's arsenal: it joins the others and comes to hand, nothing is put down
  if (inv.arsenal) {
    inv.activeSlot = addGun(inv, p.id).slot;
    return { ok: true, message: `${WEAPONS[p.id].short} ACQUIRED`, swapped: true };
  }
  // an empty gun slot takes it first; otherwise it replaces the gun in your hands
  const empty: number | null = inv.slots[inv.activeSlot] === null ? inv.activeSlot : inv.slots[0] === null ? 0 : inv.slots[1] === null ? 1 : null;
  if (empty !== null) {
    inv.slots[empty] = createCarried(p.id);
    inv.activeSlot = empty;
    return { ok: true, message: `${WEAPONS[p.id].short} ACQUIRED`, swapped: true };
  }
  const old = activeWeapon(inv);
  inv.slots[inv.activeSlot] = createCarried(p.id);
  return { ok: true, message: old ? `${WEAPONS[p.id].short} REPLACES ${WEAPONS[old.id].short}` : `${WEAPONS[p.id].short} ACQUIRED`, swapped: true };
}
