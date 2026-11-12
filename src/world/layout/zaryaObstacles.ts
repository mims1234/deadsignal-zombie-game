/**
 * ZARYA: the still part of each obstacle a weapon to swing gets through (`zarya/obstacles.ts`): its collider (built
 * open; `zarya/doors.ts` shuts it until the story says it is open) and, where the obstacle stands in a gap the frame
 * left in a zone's wall, the two piers that finish the wall's ends. What is broken (the boards, the ice, the ropes,
 * the door) is the story's own and moves: `zarya/obstacleLook.ts`. The rooms behind are their zones' own
 * (`zaryaDvor.ts` the yard-keeper's shed, `zaryaGarages.ts` the boarded garage, `zaryaTets.ts` the side door).
 */
import type { BoxCollider } from '../collision';
import type { ObstacleDef } from '../../zarya/obstacles';
import type { Ctx } from './util';
import { Z, box } from './zaryaKit';

const SURFACE = { padlock: 'wood', boards: 'wood', barricade: 'wood', ice: 'glass', lashing: 'wood' } as const;

export function buildObstacles(c: Ctx, o: ObstacleDef): BoxCollider | null {
  const { b } = c;
  if (o.wall) {
    // the wall's two ends either side of the gap: concrete piers a little proud of it, snow on top
    const { along, fixed, at, half } = o.wall;
    for (const s of [-1, 1]) {
      const u = at + s * (half + 0.25);
      const x = along === 'x' ? u : fixed;
      const z = along === 'x' ? fixed : u;
      box(b, Z.concrete, x, 1.6, z, along === 'x' ? 0.5 : 0.7, 3.2, along === 'x' ? 0.7 : 0.5);
      box(b, Z.snow, x, 3.26, z, along === 'x' ? 0.6 : 0.8, 0.12, along === 'x' ? 0.8 : 0.6, 0, false);
    }
  }
  const k = o.block;
  if (!k) return null;
  return b.collide({ x: k.x, z: k.z, hx: k.hx, hz: k.hz, y1: o.h + 0.4, blocksMove: false, blocksShots: false, mapKind: 'none', surface: SURFACE[o.kind], tag: `zarya-obstacle-${o.id}` });
}
