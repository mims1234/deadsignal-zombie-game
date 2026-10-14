/** Tuning for the power-up drops (every map). Kept out of `src/config.ts`. */
import type { PowerupKind } from './powerups';

export const POWERUPS = {
  /** Chance per kill of a drop, before the pity timer. */
  baseChance: 0.025,
  /** After this many kills without a drop the chance climbs by `pityGain` per kill... */
  pityStart: 30,
  pityGain: 0.01,
  /** ...and this many kills without one guarantees the next. */
  pityMax: 70,
  /** At most this many drops on the ground at once. */
  maxOnGround: 3,
  /** A drop floats this long (s), blinking through the last `blinkFor` seconds. */
  lifetime: 25,
  blinkFor: 5,
  /** Walk within this distance (m) to take it. */
  pickupRadius: 1.25,
  /** Insta-kill and double points last this long (s); taking another while one runs restarts its clock. */
  timed: 30,
  /** Cash for the nuke and the carpenter (doubled by double points, like any other cash). */
  nukeCash: 400,
  carpenterCash: 200,
  /** How likely each kind is to be in the bag (CoD-style: every kind once per cycle, in a shuffled order). */
  bag: { maxAmmo: 1, instaKill: 1, doublePoints: 1, nuke: 1, carpenter: 1 } as Record<PowerupKind, number>,
} as const;
