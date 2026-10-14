/**
 * The Asylum's zone walls (layout, static): brick garden walls that close the side grounds off from the front and the
 * back walk off from everything in front of it, short walls in the gaps between the ward wings and the admin block,
 * stone gateposts at the iron gates, and boarded-over doorways that would bypass a buyable door. The doors and gates
 * themselves are dynamic (`doorWorld.ts` for the colliders, `loopRuntime.ts` for the models).
 */
import { addBox, wall, type Opening } from '../world/structures';
import type { LevelBuilder } from '../world/builder';
import { doorwayBox } from './doorWorld';
import { ASYLUM_DOORS, PAP_MACHINE, PERK_MACHINES, POWER_LEVER, SEALED_DOORWAYS, ZONE_LINES, type Placed } from './loopData';

/** Footprints (width along the face, depth) of the loop's machines; their models are drawn by `loopRuntime.ts`. */
export const MACHINE_SIZE = { perk: { w: 1.2, d: 0.85, h: 2.3 }, pap: { w: 1.7, d: 1.1, h: 2 }, lever: { w: 0.7, d: 0.3, h: 1.8 } } as const;

/** THREE's rotation.y for something whose front (+Z) faces along (fx, fz). */
export const yawOf = (p: Placed): number => Math.atan2(p.fx, p.fz);

const H = 2.8;

function gardenWall(b: LevelBuilder, x0: number, z0: number, x1: number, z1: number, openings: Opening[] = [], thickness = 0.4): void {
  wall(b, { x0, z0, x1, z1, height: H, thickness, material: 'brick', openings, mapKind: 'wall', tag: 'zone-wall' });
  // a stone coping along the top
  const len = Math.hypot(x1 - x0, z1 - z0);
  addBox(b, 'concreteDark', (x0 + x1) / 2, H + 0.08, (z0 + z1) / 2, len, 0.16, thickness + 0.14, Math.atan2(-(z1 - z0), x1 - x0), { cast: false });
}

/** An iron-gate opening in a wall running along X, centred at `x` (gateposts either side). */
function gateOpening(b: LevelBuilder, x0: number, x: number, z: number, width: number): Opening {
  for (const s of [-1, 1]) {
    addBox(b, 'concreteDark', x + s * (width / 2 + 0.3), (H + 0.6) / 2, z, 0.6, H + 0.6, 0.7);
    addBox(b, 'concreteWall', x + s * (width / 2 + 0.3), H + 0.7, z, 0.75, 0.2, 0.85, 0, { cast: false });
  }
  return { at: x - x0, width, height: H + 0.4, kind: 'door', frame: 'steelDark' };
}

/** Planks nailed across a doorway, for good. */
function boardUp(b: LevelBuilder, d: { x: number; z: number; along: 'x' | 'z'; width: number; height: number }): void {
  const box = doorwayBox(d);
  const rot = box.rot;
  // two layers: upright planks behind, cross planks in front (both faces get the cross)
  for (let k = 0; k < 4; k++) {
    const off = -d.width / 2 + d.width * ((k + 0.5) / 4);
    const px = d.along === 'x' ? d.x + off : d.x;
    const pz = d.along === 'x' ? d.z : d.z + off;
    addBox(b, 'wood', px, d.height / 2, pz, d.width / 4 - 0.04, d.height, 0.08, rot);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const y = 0.5 + k * ((d.height - 0.9) / 2);
      const nx = d.along === 'x' ? 0 : side * 0.12;
      const nz = d.along === 'x' ? side * 0.12 : 0;
      addBox(b, 'wood', d.x + nx, y, d.z + nz, d.width + 0.3, 0.2, 0.06, rot);
    }
  }
  b.collide({ ...box, y1: d.height + 0.3, mapKind: 'wall', surface: 'wood', tag: 'boarded' });
}

export function buildZoneWalls(b: LevelBuilder): void {
  const L = ZONE_LINES;
  const edge = 55; // into the perimeter wall
  const gate = (id: string): (typeof ASYLUM_DOORS)[number] => ASYLUM_DOORS.find((d) => d.id === id)!;

  // ---- the side grounds' front walls, from the perimeter to the ward wings' front corners ----
  for (const s of [-1, 1]) {
    const cornerX = s * (L.wardOuterX - 0.2); // on the ward's outer wall line
    gardenWall(b, s * edge, L.frontZ, cornerX - s * 0.2, L.frontZ);
    gardenWall(b, cornerX, L.wardFrontZ - 0.2, cornerX, L.frontZ + 0.2);
    // the gap between the ward's inner wall and the admin block
    gardenWall(b, s * (L.wardInnerX + 0.2), L.gapZ, s * 11.8, L.gapZ, [], 0.3);
  }

  // ---- the back walk: the cemetery's wall (with its gate), the yard's (with its gate), the boiler house yard's ----
  const z = L.backZ;
  const cg = gate('cemeteryBack');
  gardenWall(b, -edge, z, -L.wardOuterX + 0.4, z, [gateOpening(b, -edge, cg.x, z, cg.width)]);
  const yg = gate('yardBack');
  gardenWall(b, -L.wardInnerX - 0.2, z, L.wardInnerX + 0.2, z, [gateOpening(b, -L.wardInnerX - 0.2, yg.x, z, yg.width)]);
  gardenWall(b, L.wardOuterX - 0.4, z, edge, z);

  // ---- doorways that would join zones around their doors ----
  for (const d of SEALED_DOORWAYS) boardUp(b, d);

  // ---- the machines are solid (registered here so placement, navigation and the co-op simulation all see them) ----
  const solid = (p: Placed, size: { w: number; d: number; h: number }, tag: string): void => {
    b.collide({ x: p.x, z: p.z, hx: size.w / 2, hz: size.d / 2, rot: yawOf(p), y1: size.h, mapKind: 'prop', surface: 'metal', tag });
  };
  for (const m of PERK_MACHINES) solid(m, MACHINE_SIZE.perk, `perk:${m.perk}`);
  solid(PAP_MACHINE, MACHINE_SIZE.pap, 'pack-a-punch');
  solid(POWER_LEVER, MACHINE_SIZE.lever, 'power-lever');
}
