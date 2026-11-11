/**
 * ZARYA: a street kiosk with its shutter down for the holiday, in the same make as the Rynok's row of four
 * (`zaryaRynok.ts` shutKiosk): a sheet-metal box, a ribbed steel shutter with a padlock, a shelf under it, a strip of
 * colour over it, a pitched roof under snow. The four zones that had no shut kiosk of their own build one with this
 * where their file's `shutter` spot is (`zarya/zones/*.ts`, `zarya/story.ts` SHUTTERS). What the shutter shows once
 * it is paid for (rolled up, the goods inside) is drawn over it by `zarya/look.ts`.
 *
 * Only the kit's own finishes are used, so a kiosk joins batches the zone draws anyway.
 */
import type { Spot } from '../../zarya/types';
import type { Ctx } from './util';
import { GOODS, Z, box, slab, solid } from './zaryaKit';

/** How deep a kiosk is from its back to its shutter (the shutter's foot is this far out from its middle). */
export const KIOSK_HALF_DEPTH = 1.62;

/**
 * A shut kiosk whose shutter's foot is at `at`, facing `yaw` (a player stands that way from it: -sin, -cos), painted
 * `paint` (an index into the kit's goods colours).
 */
export function shutterKiosk(c: Ctx, at: Spot, yaw: number, paint: number): void {
  const { b } = c;
  // the kiosk's own frame: +u out through the shutter, +w along it
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const cx = at.x - fx * KIOSK_HALF_DEPTH;
  const cz = at.z - fz * KIOSK_HALF_DEPTH;
  const rot = Math.atan2(-fz, fx);
  const wx = Math.sin(rot);
  const wz = Math.cos(rot);
  const P = (u: number, w: number): [number, number] => [cx + fx * u + wx * w, cz + fz * u + wz * w];
  const put = (mat: (typeof GOODS)[number], u: number, y: number, w: number, su: number, sy: number, sw: number): void => {
    const [x, z] = P(u, w);
    box(b, mat, x, y, z, su, sy, sw, rot);
  };
  const body = GOODS[paint % GOODS.length]!;
  put(body, 0, 1.35, 0, 3.2, 2.7, 4.4);
  put(Z.concreteDark, 0, 0.15, 0, 3.26, 0.3, 4.46);
  // the shutter: ribbed steel, a padlock at its foot, the shelf under it
  put(Z.grey, 1.62, 1.75, 0, 0.05, 1.5, 3.5);
  for (let k = 0; k < 9; k++) put(Z.steel, 1.65, 1.08 + k * 0.17, 0, 0.03, 0.04, 3.5);
  put(Z.brass, 1.68, 1.04, 0, 0.05, 0.1, 0.1);
  put(Z.woodDark, 1.78, 0.96, 0, 0.4, 0.06, 3.7);
  put(Z.snow, 1.8, 1.02, 0, 0.36, 0.07, 3.6);
  put(GOODS[(paint * 3 + 1) % GOODS.length]!, 1.63, 2.72, 0, 0.06, 0.34, 3.7);
  // the roof, ridge along the shutter, and the gable ends
  for (const s of [-1, 1]) {
    const [rx, rz] = P(s * 0.92, 0);
    slab(b, Z.woodDark, rx, 3.1, rz, 2.1, 0.1, 4.8, 0, rot, -s * 0.42);
    slab(b, Z.snow, rx, 3.22, rz, 2.04, 0.16, 4.7, 0, rot, -s * 0.42);
    put(body, 0, 2.74, s * 2.14, 3.0, 0.1, 0.12);
    put(body, 0, 2.9, s * 2.14, 2.0, 0.26, 0.12);
    put(body, 0, 3.14, s * 2.14, 1.0, 0.24, 0.12);
  }
  // solid: the box and its shelf (a quarter turn swaps its sides)
  const along = Math.abs(fx) > 0.5;
  solid(c, cx + fx * 0.2, cz + fz * 0.2, along ? 3.66 : 4.46, along ? 4.46 : 3.66, 2.8, 'zarya-kiosk', { kind: 'building', surface: 'metal' });
}
