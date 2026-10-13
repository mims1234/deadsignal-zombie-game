/** The card carriers: who they are and how they fight. Looks live in `cosplay.ts`, art in `art/`. */

export interface CarrierDef {
  id: string;
  name: string;
  series: string;
  /** Card file in `art/`. */
  file: string;
  /** Accent for glows, markers and the HUD (sRGB hex). */
  accent: number;
  /** Which infected it moves and sounds like. */
  base: 'shambler' | 'runner';
  /** Standing height in metres. */
  height: number;
  hp: number;
  speedChase: number;
  damage: number;
  /** Damage multiplier on body hits (armour). */
  bodyMul: number;
  poise: number;
}

export const CARRIERS: readonly CarrierDef[] = [
  { id: 'shiroko', name: 'Shiroko Terror', series: 'Blue Archive', file: 'shiroko.webp', accent: 0x7f8cff, base: 'runner', height: 1.66, hp: 420, speedChase: 4.3, damage: 12, bodyMul: 1, poise: 60 },
  { id: 'sofia', name: 'Sofia', series: 'Nikki Series', file: 'sofia.webp', accent: 0xff6fa8, base: 'shambler', height: 1.7, hp: 520, speedChase: 2.5, damage: 18, bodyMul: 1, poise: 80 },
  { id: 'mahiru', name: 'Mahiru Shiina', series: 'Otonari no Tenshi-sama', file: 'mahiru.webp', accent: 0xc9a0ff, base: 'shambler', height: 1.58, hp: 440, speedChase: 2.7, damage: 15, bodyMul: 1, poise: 70 },
  { id: 'noire', name: 'Noire', series: 'Hyperdimension Neptunia', file: 'noire.webp', accent: 0xff5468, base: 'shambler', height: 1.64, hp: 600, speedChase: 2.3, damage: 22, bodyMul: 0.65, poise: 110 },
  { id: 'miku', name: 'Miku Nakano', series: 'Gotoubun no Hanayome', file: 'miku.webp', accent: 0x6fa8ff, base: 'shambler', height: 1.6, hp: 480, speedChase: 2.2, damage: 16, bodyMul: 1, poise: 75 },
];

export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
