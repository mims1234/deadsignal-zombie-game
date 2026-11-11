/**
 * ZARYA's six guns, the parts of them that are pure arithmetic (`config.ts`: their table rows and `ZARYA_GUNS`;
 * `weapons/weaponSystem.ts` fires them): which stock gun each is held like, the Ottepel's pressure gauge, the cone
 * its steam and the Zenit's flash reach into, and the fan the Salyut's rockets leave in. And the seventh, the Raketa
 * vacuum cannon out of Ded Moroz's sack: what it swallows while held, and how far it drags the infected in.
 */
import { ZARYA_GUNS } from '../config';
import type { WeaponId, ZaryaGunId } from '../types';

export const ZARYA_GUN_IDS: readonly ZaryaGunId[] = ['signalka', 'arbalet', 'gvozdomyot', 'salyut', 'ottepel', 'zenit', 'raketa'];

/**
 * The stock gun each is held like: its hands and its motion in first person (`weapons/viewmodel/zarya.ts`), and what a
 * teammate is seen carrying (`coop/avatar.ts`).
 */
export const ZARYA_BASE: Record<ZaryaGunId, 'pistol' | 'rifle' | 'rpg'> = { signalka: 'pistol', zenit: 'pistol', arbalet: 'rifle', gvozdomyot: 'rifle', salyut: 'rpg', ottepel: 'rpg', raketa: 'rpg' };

export function isZaryaGun(id: WeaponId): id is ZaryaGunId {
  return id in ZARYA_BASE;
}

/**
 * The Ottepel's gauge after `dt` seconds: it drains while the steam is thrown and makes pressure back whenever it is
 * not, never below nothing and never above `max` (so it cannot run dry for good).
 */
export function stepGauge(gauge: number, firing: boolean, dt: number, max: number): number {
  const G = ZARYA_GUNS.ottepel;
  return Math.max(0, Math.min(max, gauge + (firing ? -G.drain : G.refill) * dt));
}

/**
 * May the Ottepel throw steam? Not on an empty gauge; and once it has run dry (`locked`) not until the gauge is back to
 * `restart`, so a held trigger does not sputter. Returns the new lock.
 */
export function gaugeLock(gauge: number, locked: boolean): boolean {
  if (gauge <= 0) return true;
  if (gauge >= ZARYA_GUNS.ottepel.restart) return false;
  return locked;
}

/**
 * Is the point (tx, ty, tz) inside the cone from (ox, oy, oz) along the unit vector (fx, fy, fz), `range` metres long
 * and `coneDeg` degrees wide (the whole angle)? Something right at the apex counts.
 */
export function inCone(ox: number, oy: number, oz: number, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, range: number, coneDeg: number): boolean {
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const d = Math.hypot(dx, dy, dz);
  if (d > range) return false;
  if (d < 0.05) return true;
  return (dx * fx + dy * fy + dz * fz) / d >= Math.cos((coneDeg * Math.PI) / 360);
}

/** The Salyut's fan: the yaw (radians, left to right about the aim) each of `n` rockets leaves at, `stepDeg` apart. */
export function fanYaws(n: number, stepDeg: number): number[] {
  return Array.from({ length: n }, (_, i) => ((i - (n - 1) / 2) * stepDeg * Math.PI) / 180);
}

/**
 * The Raketa sucking for `dt` more seconds: `t` is the time it has sucked toward the next round. Every
 * `ZARYA_GUNS.raketa.fill` seconds it swallows one more, never past `max`; full, it stops counting.
 */
export function stepSuck(rounds: number, t: number, dt: number, max: number): { rounds: number; t: number } {
  const fill = ZARYA_GUNS.raketa.fill;
  if (rounds >= max) return { rounds: max, t: 0 };
  t += dt;
  while (t >= fill && rounds < max) {
    t -= fill;
    rounds++;
  }
  return { rounds, t: rounds >= max ? 0 : t };
}

/**
 * Where an infected at (zx, zz) is after being dragged `dt` seconds toward the player at (px, pz): at
 * `ZARYA_GUNS.raketa.pull` m/s, never nearer than `stopAt`, and never away (one already that close stays put).
 */
export function pullToward(px: number, pz: number, zx: number, zz: number, dt: number): { x: number; z: number } {
  const G = ZARYA_GUNS.raketa;
  const dx = px - zx;
  const dz = pz - zz;
  const d = Math.hypot(dx, dz);
  const step = Math.min(G.pull * dt, d - G.stopAt);
  if (!(step > 0)) return { x: zx, z: zz };
  return { x: zx + (dx / d) * step, z: zz + (dz / d) * step };
}
