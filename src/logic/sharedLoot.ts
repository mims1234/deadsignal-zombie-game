/**
 * Co-op loot (pure): the mystery boxes and the drops infected leave behind, owned by the session's simulation so every
 * player sees the same ones. A box is won by whoever opens it first (the reel spins for everyone; only the opener can
 * take the prize); a drop goes to the first player who walks over it, and is gone for everyone.
 *
 * Solo play keeps its own boxes and drops (`game/entities.ts`); this is only the shared copy.
 */
import { ECONOMY, MYSTERY_BOX } from '../config';
import type { BoxPrize } from './mysteryBox';
import type { Rng } from './rng';

export const DROP_KINDS = ['ammo', 'plate', 'grenade'] as const;
export type DropKind = (typeof DROP_KINDS)[number];

/** Box phases as sent: closed, the reel spinning, the prize on offer, taken or expired. */
export const BOX_PHASE = { closed: 0, spin: 1, offer: 2, gone: 3 } as const;

export interface SharedBox {
  phase: 0 | 1 | 2 | 3;
  /** Who opened it (only they can take the prize). */
  owner: string | null;
  /** The prize, encoded (`encodePrize`). */
  prize: string;
  /** Seconds into the current phase. */
  t: number;
}

export interface SharedDrop {
  id: number;
  kind: number;
  x: number;
  z: number;
  age: number;
}

export interface LootState {
  boxes: SharedBox[];
  drops: SharedDrop[];
  nextId: number;
}

export function createLoot(boxCount: number): LootState {
  return { boxes: Array.from({ length: boxCount }, () => ({ phase: 0 as const, owner: null, prize: '', t: 0 })), drops: [], nextId: 1 };
}

/** A prize as a short string: `ammo`, `g2` (grenades x2), `w:rifle`. */
export function encodePrize(p: BoxPrize): string {
  return p.kind === 'weapon' ? `w:${p.id}` : p.kind === 'grenades' ? `g${p.count}` : 'ammo';
}

export function decodePrize(code: string): BoxPrize | null {
  if (code === 'ammo') return { kind: 'ammo' };
  if (/^g\d+$/.test(code)) return { kind: 'grenades', count: Math.max(1, Math.min(9, Number(code.slice(1)))) };
  if (code.startsWith('w:')) {
    const id = code.slice(2);
    if (id === 'rifle' || id === 'pistol' || id === 'shotgun' || id === 'rpg' || id === 'hanafubuki' || id === 'raijin') return { kind: 'weapon', id };
  }
  return null;
}

/** A player opens box `i` with the prize their client rolled. False if someone got there first. */
export function openBox(s: LootState, i: number, owner: string, prize: string): boolean {
  const b = s.boxes[i];
  if (!b || b.phase !== BOX_PHASE.closed || !decodePrize(prize)) return false;
  b.phase = BOX_PHASE.spin;
  b.owner = owner;
  b.prize = prize;
  b.t = 0;
  return true;
}

/** The opener takes the prize on offer. */
export function takeBox(s: LootState, i: number, who: string): boolean {
  const b = s.boxes[i];
  if (!b || b.phase !== BOX_PHASE.offer || b.owner !== who) return false;
  b.phase = BOX_PHASE.gone;
  b.t = 0;
  return true;
}

/** An infected died at (x, z): maybe a drop (the same odds and mix as solo). */
export function rollKillDrop(s: LootState, x: number, z: number, chance: number, rng: Rng): SharedDrop | null {
  if (!(chance > 0) || !rng.chance(chance)) return null;
  const r = rng.f();
  const kind = r < 0.65 ? 0 : r < 0.78 ? 1 : 2;
  if (s.drops.length >= ECONOMY.maxPickups) s.drops.shift();
  const d = { id: s.nextId++, kind, x, z, age: 0 };
  s.drops.push(d);
  return d;
}

/** A player at (x, z) picks drop `id` up. Returns its kind, or null (gone, or too far). */
export function pickDrop(s: LootState, id: number, x: number, z: number, slack = 1.5): DropKind | null {
  const i = s.drops.findIndex((d) => d.id === id);
  if (i < 0) return null;
  const d = s.drops[i]!;
  if (Math.hypot(d.x - x, d.z - z) > ECONOMY.pickupRadius + slack) return null;
  s.drops.splice(i, 1);
  return DROP_KINDS[d.kind] ?? null;
}

/** Time passes: the reels land, unclaimed prizes sink back, old drops fade. */
export function tickLoot(s: LootState, dt: number): void {
  for (const b of s.boxes) {
    if (b.phase === BOX_PHASE.closed) continue;
    b.t += dt;
    if (b.phase === BOX_PHASE.spin && b.t >= MYSTERY_BOX.spin) {
      b.phase = BOX_PHASE.offer;
      b.t = 0;
    } else if (b.phase === BOX_PHASE.offer && b.t >= MYSTERY_BOX.offer) {
      b.phase = BOX_PHASE.gone;
      b.t = 0;
    }
  }
  for (let i = s.drops.length - 1; i >= 0; i--) {
    const d = s.drops[i]!;
    d.age += dt;
    if (d.age > ECONOMY.pickupLifetime) s.drops.splice(i, 1);
  }
}
