/**
 * Balance for the Asylum's purchasable loop: doors between zones, the power, perk machines, wall-buys and the
 * Pack-a-Punch. Kept out of `config.ts` so the loop is one self-contained feature (see `loop.ts` for the rules).
 */
import type { WeaponId } from '../types';

export type PerkId = 'ironhide' | 'quickhand' | 'secondWind' | 'rapidFire';

export interface PerkDef {
  id: PerkId;
  name: string;
  /** Two-letter mark on the HUD chip. */
  mark: string;
  /** One line on the machine's prompt. */
  blurb: string;
  cost: number;
  /** Machine and HUD colour (hex). */
  color: number;
}

export const PERK_DEFS: Record<PerkId, PerkDef> = {
  ironhide: { id: 'ironhide', name: 'IRONHIDE', mark: 'IH', blurb: 'Max health 100 -> 250', cost: 2500, color: 0xd8413a },
  quickhand: { id: 'quickhand', name: 'QUICKHAND', mark: 'QH', blurb: 'Reload twice as fast', cost: 3000, color: 0x3fc46a },
  secondWind: { id: 'secondWind', name: 'SECOND WIND', mark: 'SW', blurb: 'Get back up once when you would die', cost: 1500, color: 0x58b4ff },
  rapidFire: { id: 'rapidFire', name: 'RAPID FIRE', mark: 'RF', blurb: 'Fire a third faster', cost: 2000, color: 0xf0a23a },
};

export const LOOP = {
  /** Perks one player can own at once. */
  maxPerks: 4,
  /** Hold-E times (seconds). */
  doorHold: 0.45,
  buyHold: 0.35,
  leverHold: 0.8,
  /** How close the player must stand to a door / machine / wall chalk (metres). */
  reach: 2.4,
  perk: {
    /** IRONHIDE: max health with the perk. */
    ironhideHealth: 250,
    /** QUICKHAND: reload durations are multiplied by this. */
    quickhandReloadMul: 0.5,
    /** RAPID FIRE: seconds between shots are multiplied by this (1 / 1.33 = a third more rounds a minute). */
    rapidFireIntervalMul: 0.75,
    /** SECOND WIND, solo: health you get back up with (fraction of max), and seconds nothing can hurt you after. */
    secondWindHealth: 0.5,
    secondWindGrace: 3,
    /** SECOND WIND, co-op: revive holds are multiplied by this (for the co-op wiring). */
    secondWindReviveMul: 0.5,
  },
  pap: {
    cost: 5000,
    /** Seconds the machine works on the weapon (it is upgraded at once; this is the show). */
    workTime: 3,
  },
  /** Ammo bought at a wall chalk of a gun you carry costs this share of the gun's price (rounded to $10). */
  wallAmmoShare: 0.5,
} as const;

/** The guns chalked on the Asylum's walls, and their prices. */
export const WALL_PRICES: Record<WeaponId, number> = {
  pistol: 500,
  shotgun: 1200,
  rifle: 1500,
  rpg: 4500,
};
