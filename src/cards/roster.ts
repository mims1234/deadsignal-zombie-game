/** The card carriers: who they are and how they fight. Looks live in `cosplay.ts` (built) and `public/models/mazoku/` (real-asset, `scripts/asylum-cast.py`), art in `art/`. */

export interface CarrierDef {
  id: string;
  name: string;
  series: string;
  /** Card file in `art/`. */
  file: string;
  /** Her real-asset model (NEW 3D MODELS); without it she wears the built figure from `cosplay.ts`. */
  model: string;
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
  { id: 'kaede', name: 'Kaede Mori', series: 'The Sprinter', file: 'kaede.webp', model: 'models/mazoku/kaede.vrm', accent: 0x7f8cff, base: 'runner', height: 1.66, hp: 420, speedChase: 4.3, damage: 12, bodyMul: 1, poise: 60 },
  { id: 'selene', name: 'Selene Voss', series: 'The Night Coat', file: 'selene.webp', model: 'models/mazoku/selene.vrm', accent: 0xff6fa8, base: 'shambler', height: 1.7, hp: 520, speedChase: 2.5, damage: 18, bodyMul: 1, poise: 80 },
  { id: 'hana', name: 'Hana Shirase', series: 'The Quiet Bloom', file: 'hana.webp', model: 'models/mazoku/hana.vrm', accent: 0xc9a0ff, base: 'shambler', height: 1.58, hp: 440, speedChase: 2.7, damage: 15, bodyMul: 1, poise: 70 },
  { id: 'reina', name: 'Reina Asante', series: 'The Night Guard', file: 'reina.webp', model: 'models/mazoku/reina.vrm', accent: 0xff5468, base: 'shambler', height: 1.64, hp: 600, speedChase: 2.3, damage: 22, bodyMul: 0.65, poise: 110 },
  { id: 'mio', name: 'Mio Takeda', series: 'The Last Train', file: 'mio.webp', model: 'models/mazoku/mio.vrm', accent: 0x6fa8ff, base: 'shambler', height: 1.6, hp: 480, speedChase: 2.2, damage: 16, bodyMul: 1, poise: 75 },
];

export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
