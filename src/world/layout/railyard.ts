/**
 * East annex: the rail yard (HIGH threat). Route 9 used to end in a collapse at the east wall; it now runs on
 * through the gap into a walled freight yard: three lanes of containers standing like parked wagons on each side of
 * the road, with a wide loading apron at the far end. Long sight lines down the lanes, blind corners between them.
 */
import { barrelGroup, container, corpse, crateGroup, debris, floodlightTower, forklift, jerseyBarrier, pallet, tireStack, vehicle } from '../props';
import { groundDecal, groundRect, perimeterWall, wallDecal } from '../structures';
import { type Ctx, CL, HALF_PI } from './util';

/** The yard's footprint (the world bounds grow to include it). */
export const RAIL_YARD = { x0: 65.4, x1: 109.4, z0: -29.4, z1: 29.4 };

export function buildRailYard(c: Ctx): void {
  const { b, d } = c;
  const Y = RAIL_YARD;

  // ---- ground: the road carries on east; slab on both sides ----
  groundRect(b, 'asphaltWet', 65, -5, Y.x1, 5, 0.012);
  d.road(65, -5, Y.x1, 5, 'ROUTE 9 EAST');
  groundRect(b, 'concreteSlab', Y.x0, Y.z0, Y.x1, -5, 0.02);
  groundRect(b, 'concreteSlab', Y.x0, 5, Y.x1, Y.z1, 0.02);
  groundDecal(b, 'stopLine', 67.5, 0, 9, 0.5, HALF_PI, 0.05);

  // ---- walls: north, south and the closed east end (the west side is the district's own east wall) ----
  perimeterWall(b, Y.x0, Y.z0, Y.x1, Y.z0);
  perimeterWall(b, Y.x0, Y.z1, Y.x1, Y.z1);
  perimeterWall(b, Y.x1, Y.z0, Y.x1, Y.z1);
  wallDecal(b, 'stencilDanger', Y.x1 - 0.62, 2.6, 0, 8, 2.2, -HALF_PI);
  wallDecal(b, 'stencilKeepOut', 88, 2.6, Y.z0 + 0.62, 8, 2.2, 0);

  // ---- freight lanes: rows of containers end to end, with gaps to cut through ----
  // each row is a list of slots along X; a missing slot is a crossing, `2` is a double stack
  const rows: { z: number; slots: (0 | 1 | 2)[] }[] = [
    { z: -24.5, slots: [1, 2, 1] },
    { z: -17.5, slots: [2, 0, 1] },
    { z: -10.5, slots: [1, 1, 0] },
    { z: 10.5, slots: [0, 1, 2] },
    { z: 17.5, slots: [1, 0, 1] },
    { z: 24.5, slots: [2, 1, 1] },
  ];
  rows.forEach((row, r) => {
    row.slots.forEach((slot, i) => {
      if (slot === 0) return;
      // 14 m pitch leaves a 1.8 m slip between wagons
      const x = 73.5 + i * (CL + 1.8);
      container(b, { x, z: row.z, rot: 0, stack: slot === 2 ? 2 : 1, doorsOpen: slot === 1 && (r + i) % 3 === 0, seed: r * 31 + i * 7 + 5 });
    });
  });

  // ---- the loading apron at the east end ----
  forklift(b, { x: 104.5, z: -14, rot: 0.6 });
  crateGroup(b, { x: 105, z: -21, rot: 0.2, count: 5, radius: 1.8, seed: 61 });
  pallet(b, { x: 102.5, z: -8.5, rot: 0.4 });
  barrelGroup(b, { x: 106, z: 13, rot: 0, count: 6, radius: 1.6, seed: 62 });
  tireStack(b, { x: 104, z: 22, rot: 0 });
  crateGroup(b, { x: 105.5, z: 7.5, rot: 1.1, count: 4, radius: 1.5, kind: 'mil', seed: 63 });
  vehicle(b, { x: 96, z: 1.6, rot: HALF_PI + 0.2, kind: 'boxTruck', seed: 91 });
  vehicle(b, { x: 80, z: -2.2, rot: -HALF_PI - 0.12, kind: 'sedan', seed: 92 });
  jerseyBarrier(b, { x: 71, z: -3.4, rot: 0.25 });
  jerseyBarrier(b, { x: 71.6, z: 3.2, rot: -0.2 });
  debris(b, { x: 68, z: 0, radius: 4, density: 0.7, seed: 44 });
  debris(b, { x: 100, z: 18, radius: 3, seed: 45 });
  corpse(b, { x: 86, z: -13.8, rot: 1.2 });
  corpse(b, { x: 92, z: 14, rot: 2.4 });
  floodlightTower(b, { x: 107.5, z: -27, rot: Math.PI * 0.75, on: true });
  floodlightTower(b, { x: 107.5, z: 27, rot: -Math.PI * 0.75, on: true });
  floodlightTower(b, { x: 67.5, z: -27, rot: Math.PI * 0.25, on: true });

  // ---- gameplay ----
  d.regionRects.push({ region: 'high', x0: 66, z0: -30, x1: 110, z1: 30 });
  d.label('RAIL YARD', 88, -20, 0.9);
  d.crate(103, -26, 0.4, 'high');
  d.crate(70, 27, -0.6, 'high');
  d.crate(88, -14, 1.2, 'high');
  d.crate(106.5, 2.5, HALF_PI, 'high');
  d.spawn('high', 'general', [[106, -6.5], [106, 26], [68.5, -21], [68.5, 14], [88, 27.5], [88, -27.5], [100, 14], [78, -14]], 1);
  d.zombies('high', 'shambler', [[84, -21], [96, 21], [101, -3], [76, 14], [92, -14]]);
  d.zombies('high', 'runner', [[98, 14], [72, -14], [104, 18]]);
  d.zombies('high', 'armored', [[103, -17], [86, 3.5]]);
}
