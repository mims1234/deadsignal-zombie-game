/**
 * ZARYA, the TETs heating plant, north of the square (no THREE). The story (`story.ts`, `runtime.ts`) uses these spots BY NAME: the layout
 * (`world/layout/zarya*.ts`) may move any of them, but every name must stay and must be somewhere a player can stand
 * within 2 m of (unless it says otherwise). x runs east, z south (north is -z).
 *
 * Act III. Reached from the pond road (east wall, open) and by tram (Institute Road, the stop on the south edge,
 * built by the frame). The checkpoint in the west wall leads to the Institute: its keypad wants the year the town
 * was founded. Three valve wheels in the boiler hall reroute the steam.
 *
 * How it lies: the plant road runs straight between the two gates along z = -130. North of it stands the boiler hall,
 * with the chimney west of it, the coal heap in the north-west corner and the cooling pond in the north-east one; a
 * back alley goes round behind the hall. South of the road is the yard (the office block, the oil tank, the pump
 * house in the south-east corner, the heat mains on their trestles), and along the south edge the tram's street.
 */
import { yawTo, type PeopleFn, type Rect, type Spot } from '../types';

export const TETS = {
  rect: { x0: -104, z0: -190, x1: 20, z1: -70 } as Rect,
  /** The boiler hall (brick walls 12 m high, a roof, two big doors in its south wall and a side door in its east one). */
  hall: { x0: -68.5, z0: -172, x1: -8.5, z1: -137 } as Rect,
  /** The big doors in the hall's south wall (x of each, 7 m wide), and the side door in its east wall (3 m wide). */
  doors: [-50, -26] as number[],
  sideDoor: { x: -8.5, z: -157 } as Spot,
  /** The four boilers, in a row against the hall's north wall (x of each; 7 m wide, their fronts at z = -162.2). */
  boilers: [-59, -45, -31, -17] as number[],
  /**
   * The three red valve wheels, each flat at chest height on a valve standing on the hall floor at the end of a short
   * branch off a riser (the spot is the wheel's centre: the story's own stem and turning hub stand there, inside the
   * rim the layout draws; clear floor on three sides): by the west wall, between the second and third boilers, by the
   * east wall. `valveFace` is the way each branch comes out from its riser.
   */
  valves: [{ x: -65.7, z: -150 }, { x: -38, z: -161.6 }, { x: -11.3, z: -147 }] as Spot[],
  valveFace: ['E', 'S', 'W'] as ('E' | 'S' | 'W')[],
  /** The pump house, in the yard's south-east corner (its door in the north wall, at x = 11.75). */
  pump: { x0: 5.5, z0: -110.5, x1: 18, z1: -98 } as Rect,
  /** A part: a pressure valve, on the bench along the pump house's south wall (the spot is on the bench top). */
  valve: { x: 10.5, z: -98.9 } as Spot,
  /** The new bright pipe welded into the chimney's base, coming from the west wall (a clue: stand here, south of the joint, and look at it), and the chimney itself. */
  pipe: { x: -94.3, z: -149.4 } as Spot,
  /** The Zenit's marked spot (a faint frost ring, `photos.ts`): under the new pipe, where a man in an Institute coat stood at it at 23:57. */
  zenit: { x: -95.6, z: -149.8 } as Spot,
  chimney: { x: -88, z: -152 } as Spot,
  /** The checkpoint's keypad post, on this side of the west gate at (-104, -130), south of the road; the booth beside it. */
  keypad: { x: -100.3, z: -126.3 } as Spot,
  booth: { x: -97.6, z: -122.3 } as Spot,
  /** The cooling pond (nobody walks in it), and the coal heap. */
  pond: { x0: 1, z0: -188.5, x1: 18.5, z1: -146.5 } as Rect,
  heap: { x0: -103.8, z0: -189.8, x1: -77.2, z1: -168.4 } as Rect,
  /** The coal truck's driver, standing by his cab in the yard. */
  cover: [{ x: -30, z: -100 }] as Spot[],
  spawns: [[-70, -186], [-10, -186], [-44, -186], [17, -119], [-100, -91]] as [number, number][],
} as const;

/** Everyone caught in this zone, standing where the snow found them (never inside anything solid, never on top of another). */
export const tetsPeople: PeopleFn = (add, r) => {
  // sixteen: the night shift in the boiler hall and the yard, the guard by the checkpoint's booth
  const face = (x: number, z: number, tx: number, tz: number): void => add(x, z, yawTo(x, z, tx, tz) + (r() - 0.5) * 0.3);
  // the driver by his truck
  for (const c of TETS.cover) face(c.x, c.z, c.x + 4, c.z);
  // the hall: a stoker at the first and the third firebox, two at the control desk, one at the workbench
  face(-59.4, -160.3, -59, -163);
  face(-31.6, -160.2, -31, -163);
  face(-39.3, -140.8, -39.3, -138);
  face(-36.5, -141, -37, -138);
  face(-17.4, -139.6, -17.4, -138);
  // two having a smoke by the bench outside the west door
  face(-60.8, -135.3, -59.6, -136.2);
  face(-59.5, -136.1, -60.8, -135.3);
  // two at the coal hopper, one looking at the pond, one who stopped to look at the new pipe
  face(-72.2, -179.6, -75.5, -180);
  face(-72.9, -176.8, -75.5, -179);
  face(-0.7, -158, 8, -160);
  face(-96.9, -149, -92, -152);
  // the pump house: one at the pumps, one outside beside the door
  face(13.3, -105.2, 15.3, -105);
  face(9.3, -112, 6, -122);
  // one who was waiting for the tram
  face(-36.2, -76.3, -44, -82);
  // the checkpoint's guard, by the booth, looking down the road (in a townsman's coat: the role 'guard' is the
  // store's one guard, whom the story finds by it)
  face(-95.4, -124.4, -70, -130);
};
