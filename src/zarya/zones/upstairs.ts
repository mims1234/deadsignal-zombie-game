/**
 * ZARYA, the Univermag's SECOND FLOOR (an interior built beside the map) (no THREE). The story (`story.ts`,
 * `runtime.ts`) uses these spots BY NAME: the layout (`world/layout/zaryaUpstairs.ts`) may move any of them, but every
 * name must stay and must be somewhere a player can stand within 2 m of (unless it says otherwise). x runs east, z
 * south (north is -z).
 *
 * Act II on. Reached by the store's escalator once the padlock on its shutter is broken; the next escalator goes on up
 * to the staff canteen on the third floor. Nothing here is needed to finish the story: Kostya's den (a clue) and one of
 * the town tree's glass ornaments are what it holds.
 *
 * The floor is the ground floor's footprint moved 530 m east (the store is x 70..140; this is x 600..670), so the well
 * of the escalator from below is where that escalator's head is. The room, by its walls: big windows onto the square
 * along the west wall; the departments along the north wall (toys in the north-west corner, Kostya's den behind its
 * counter; the records counter; the photo studio, a room of its own in the north-east corner); furniture in the
 * south-east, fabrics and coats in the south-west; the escalator up to the canteen between them, rising east. The
 * staff rooms behind the south wall are locked.
 */
import { yawTo, type PeopleFn, type Rect, type Spot } from '../types';

export const UPSTAIRS = {
  rect: { x0: 600, z0: -30, x1: 670, z1: 14 } as Rect,
  h: 4.4,
  /** The head of the escalator from the ground floor: coming up puts a walker here, facing north; standing on it takes them back down. */
  foot: { x: 642, z: -17.2 } as Spot,
  /** The well that escalator comes up out of (closed to walkers: it is a drop). */
  well: { x0: 640.4, z0: -16, x1: 643.6, z1: -2 } as Rect,
  /** The foot of the escalator up to the canteen: a walker steps on heading east. */
  up: { x: 639.4, z: 9 } as Spot,
  /** The escalator up (its steps and its balustrades, the floor under its high end: nobody walks there). */
  upRun: { x0: 639.8, z0: 7.6, x1: 652, z1: 10.4 } as Rect,
  /** The toy department's counter (the floor in front of it, on the hall's side). */
  toys: { x: 616, z: -23 } as Spot,
  /** The toy counter itself, and the way round its east end to the floor behind it. */
  toyCounter: { x0: 608, z0: -25.2, x1: 624, z1: -24.4 } as Rect,
  /** Kostya's den behind the toy counter: the mouth of the fort of boxes in the corner, where his red hat lies (the clue). */
  den: { x: 604.7, z: -27.2 } as Spot,
  /** The den's boxes (nobody stands in them). */
  denBox: { x0: 600.2, z0: -29.6, x1: 604.5, z1: -25.2 } as Rect,
  /** The records counter (the floor in front of it). */
  records: { x: 638, z: -23 } as Spot,
  /** The photo studio: the room, its doorway in its south wall, and where its camera stands. */
  studio: { x0: 652, z0: -30, x1: 670, z1: -20 } as Rect,
  studioDoor: { x: 657.5, z: -20 } as Spot,
  camera: { x: 659, z: -25 } as Spot,
  /** Fabrics and coats (the floor between its cutting tables and its racks). */
  fabrics: { x: 616, z: 5.6 } as Spot,
  /** The furniture department (the living room set's rug). */
  furniture: { x: 660, z: 2 } as Spot,
  /** The toy railway on its round table in the middle of the floor. */
  railway: { x: 618, z: -12, r: 2.2 },
  /** One of the town tree's glass ornaments, rolled against the toy railway's table (taken in passing). */
  ornament: { x: 620.3, z: -13.8 } as Spot,
  /** Where the infected come from, when the ordinary spawner wants one here: the far corners of the floor. */
  spawns: [[604, -5], [667, -12], [632, 12], [656, -15], [659.8, 12.4]] as [number, number][],
  /** The side stories' places (`zarya/sidestories.ts`): the photo studio's appointment book on its stand inside the door; the prints pegged to dry along its west wall. */
  side: {
    book: { x: 654, z: -21.3 } as Spot,
    prints: { x: 652.3, z: -27.4 } as Spot,
  },
} as const;

/** The columns (the ground floor's, 530 m east). */
export const UPSTAIRS_COLUMNS: readonly Spot[] = (() => {
  const out: Spot[] = [];
  for (const x of [612, 624, 636, 648, 660]) for (const z of [-18, -6, 6]) out.push({ x, z });
  return out;
})();

/**
 * Everyone caught up here (thirty-one): shop assistants behind their counters, the photographer at his camera and the
 * family in front of it, shoppers at the toys, the railway, the records, the cloth and the furniture. Nobody stands at
 * the escalators' ends, in the den, in the studio's doorway or on the way round behind the toy counter.
 */
export const upstairsPeople: PeopleFn = (add, r) => {
  const U = UPSTAIRS;
  const j = (): number => (r() - 0.5) * 0.5;
  // ---- the staff, at their places (`staff`: pale coats) ----
  add(616.5, -26.4, yawTo(0, 0, 0, 1) + j(), 'staff'); // Valya, on toys
  add(637.5, -26.4, yawTo(0, 0, 0, 1) + j(), 'staff'); // records
  add(U.camera.x - 0.9, U.camera.z + 0.3, yawTo(U.camera.x - 0.9, U.camera.z, 667, -25), 'staff'); // the photographer, behind his camera
  add(610, 1.6, yawTo(0, 0, 0, 1) + j(), 'staff'); // fabrics, measuring at the cutting table
  add(655.5, 12.4, yawTo(655.5, 12.4, 660, 2), 'staff'); // furniture
  // ---- the family in front of the painted winter, facing the camera ----
  add(666.4, -25.8, yawTo(666.4, -25.8, U.camera.x, U.camera.z) + j() * 0.3, 'towns');
  add(666.6, -24.2, yawTo(666.6, -24.2, U.camera.x, U.camera.z) + j() * 0.3, 'towns');
  add(665.6, -25, yawTo(665.6, -25, U.camera.x, U.camera.z), 'child');
  // ---- toys: at the counter, and round the railway ----
  for (const [x, z, kid] of [[611, -22.9, false], [613.4, -23.1, true], [619.4, -22.8, false], [621.2, -23, true]] as const) add(x, z, yawTo(x, z, x + j(), -25) + j() * 0.4, kid ? 'child' : 'towns');
  const R = U.railway;
  for (const a of [0.3, 1.5, 2.6, 3.9, 5.1]) {
    const x = R.x + Math.cos(a) * (R.r + 1.05);
    const z = R.z + Math.sin(a) * (R.r + 1.05);
    add(x, z, yawTo(x, z, R.x, R.z) + j() * 0.3, a === 1.5 || a === 3.9 ? 'towns' : 'child');
  }
  // ---- records: at the counter and the browsing bins ----
  for (const [x, z, tx, tz] of [[634.6, -22.9, 634.6, -25], [640.6, -23.1, 641, -25], [632.4, -19.4, 632.4, -20.6], [647.4, -20.8, 646, -20.8]] as const) add(x, z, yawTo(x, z, tx, tz) + j() * 0.3, 'towns');
  // ---- the middle of the floor: going between departments ----
  for (const [x, z] of [[628.5, -2.5], [607.5, -9.5], [631.5, -15.4], [650.6, -10.8]] as const) add(x, z, r() * Math.PI * 2, r() < 0.2 ? 'child' : 'towns');
  // ---- fabrics and coats: at the cutting tables, between the racks ----
  for (const [x, z, tx, tz] of [[609, 4.9, 609, 3], [621.5, 5, 621.5, 3], [618.6, 9.6, 618.6, 8], [608.4, 9.6, 608.4, 11]] as const) add(x, z, yawTo(x, z, tx, tz) + j() * 0.3, 'towns');
  // ---- furniture: a couple at the sofa, someone at the wall unit, someone at the bed ----
  for (const [x, z, tx, tz] of [[657.4, 4.6, 660, 0], [658.6, 5, 660, 0], [666.4, -1.6, 669, -2], [661.6, 7.6, 663, 10]] as const) add(x, z, yawTo(x, z, tx, tz) + j() * 0.3, 'towns');
};
