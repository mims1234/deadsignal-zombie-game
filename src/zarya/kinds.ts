/**
 * ZARYA's special kinds of infected, for whoever owns the level (no THREE): which kind an infected spawned at a point
 * becomes, and what the fisherman's reel does to the player of the game it runs in. The kinds themselves, their numbers
 * and the zone-by-zone shares are in `enemies/variants.ts` (ZARYA_KINDS, ZARYA_HABITS, `zaryaVariant`); what they do
 * is `Zombie.variantStep`; what they look like is `enemies/zombie/zarya.ts`.
 *
 *   g.zombies.pickVariant = zaryaVariantPicker();   // the solo game and the co-op simulation alike
 *   g.zenv.pull = zaryaPull(g.player);              // the solo game only (the simulation moves nobody: it yanks instead)
 */
import { zaryaVariant, type ZombieVariant } from '../enemies/variants';
import type { ZombieEnv } from '../enemies/zombie';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';

/** `ZombieManager.pickVariant` for the town: by the zone an infected is spawned in. */
export function zaryaVariantPicker(): (type: ZombieType, x: number, z: number, y: number, rng: Rng) => ZombieVariant {
  return (type, x, z, _y, rng) => zaryaVariant(type, x, z, () => rng.f());
}

/**
 * The player's own ground friction eats about a sixth of a speed set on them each frame (`PLAYER.groundFriction`), so
 * the reel asks for that much more: five metres in the fisherman's second, standing still or walking against it.
 */
const REEL_GAIN = 1.2;

/**
 * `ZombieEnv.pull` for a game with its own player in it: while the fisherman reels, the player moves his way at the
 * speed he asks for. It only sets their velocity, so their own movement still stops them at walls and steps.
 *
 * The squad's environments are copies of the game's (`game/squad.ts`), so this is asked for a squadmate on his line
 * too: the pull is toward him from whoever he has, and it is only the player's when it points from the player to him.
 */
export function zaryaPull(player: { x: number; z: number; vx: number; vz: number }): NonNullable<ZombieEnv['pull']> {
  return (z, vx, vz) => {
    const dx = z.x - player.x;
    const dz = z.z - player.z;
    const d = Math.hypot(dx, dz);
    const v = Math.hypot(vx, vz);
    if (d < 1e-3 || v < 1e-3 || (dx * vx + dz * vz) / (d * v) < 0.999) return;
    player.vx = vx * REEL_GAIN;
    player.vz = vz * REEL_GAIN;
  };
}
