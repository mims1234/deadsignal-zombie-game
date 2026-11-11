/**
 * ZARYA, the DVOR: two courtyards of panel blocks south of the square (no THREE). The story (`story.ts`, `runtime.ts`) uses these spots BY NAME: the layout
 * (`world/layout/zarya*.ts`) may move any of them, but every name must stay and must be somewhere a player can stand
 * within 2 m of (unless it says otherwise). x runs east, z south (north is -z).
 *
 * Act II. Reached by tram (Stroiteley Street, the stop on the south edge, built by the frame), through the archway
 * from the square (north wall) and the chained gate to the garages (east wall). Vera's grandmother is asleep at her
 * open ground-floor window.
 *
 * How it lies (`world/layout/zaryaDvor.ts` builds exactly this): two long blocks along the north with the archway's
 * tunnel between them, a block down the west side, a block down the middle that parts the two yards (walk round
 * either end of it), a block along the street on the south-east. The west yard is the bigger one and is open to the
 * street behind a board fence: the playground, a snow fort, the doll, the hockey box, the woodpile. The east yard has
 * the yard fir, a summer-house, the kennel, the workbench, the bins, a transformer hut and the yard-keeper's shed.
 */
import { yawTo, type PeopleFn, type PersonRole, type Rect, type Spot } from '../types';

export const DVOR = {
  rect: { x0: -104, z0: 72, x1: 100, z1: 172 } as Rect,
  /**
   * Vera's grandmother's open ground-floor window, from outside: the spot is half a metre out from the sill (a person
   * with role 'babushka' is at it, inside, 1.1 m north of the spot). West yard, in the north block just west of the archway.
   */
  babushka: { x: -38, z: 87.7 } as Spot,
  /** The Zenit's marked spot (a faint frost ring, `photos.ts`): on the path below the grandmother's window, where the yard looked up at the first snow at 23:57. */
  zenit: { x: -37.4, z: 91.6 } as Spot,
  /**
   * A lit ground-floor window to look through (the spot is half a metre out from it): a family at the New Year table,
   * and the television's frozen frame (a clue). In the north block, at the top of the east yard.
   */
  tv: { x: 20, z: 88.3 } as Spot,
  /** The woodpile: this is its chopping block (the splitting maul is taken here); the roofed stack is just west of it. South-west of the west yard. */
  woodpile: { x: -74, z: 135 } as Spot,
  /** The dog kennel: this is the post beside it (the dog chain hangs on it). East yard. */
  kennel: { x: 70, z: 131 } as Spot,
  /** A workbench under a lean-to against the south block's yard side (the front edge of its top): things are built here too. */
  bench: { x: 42, z: 143.4 } as Spot,
  /** The painted matryoshka's plinth (its top is 0.5 m up, 2.2 m square), out in the west yard with ten metres of clear ground round it. */
  doll: { x: -40, z: 122 } as Spot,
  /** Parts: friction tape (on the shelf over the workbench), fuse cord (fireworks left in the playground), a shovel shaft (shovels leaning on the yard-keeper's shed, by the east wall). */
  tape: { x: 43.4, z: 144 } as Spot,
  cord: { x: -58, z: 121 } as Spot,
  shaft: { x: 94.7, z: 105.6 } as Spot,
  /** One of the repairman's three tools (a soldering iron on a ground-floor windowsill of the west block, 1.5 m up, beside a radio with its back off). */
  tool: { x: -91.2, z: 110.5 } as Spot,
  /**
   * The kiosk shutter bought open with points (`zarya/mods.ts`): the middle of the shutter's foot on a shut kiosk just
   * inside the west yard's way in from the street (the gap in the board fence), its back to the east, facing `shutterYaw`
   * (west: whoever comes in off the street walks straight at it). The kiosk is `zaryaDvor.ts`'s, built by `shutterKiosk`.
   */
  shutter: { x: -65.12, z: 153.2 } as Spot,
  shutterYaw: Math.PI / 2,
  /** A glass ornament: by the box of them under the yard fir in the east yard. */
  ornament: { x: 47.4, z: 109.5 } as Spot,
  /** Sleepers who can be covered against the cold (a person stands at each: see `people`). */
  cover: [{ x: -27.2, z: 139.5 }, { x: 86, z: 134 }] as Spot[],
  /** Where the ones woken wrong come from: the corners behind the west block, the ends of the street, the tram line, the top of the east yard. */
  spawns: [[-96, 150], [-100, 164], [96, 164], [0, 166], [50, 100]] as [number, number][],
  /** The two stairwell doors that stand open (dark doorways, not enterable): the foot of each one's steps. */
  doors: [{ x: -62, z: 87.2 }, { x: 50.8, z: 88.2 }] as Spot[],
  /** The yard fir in the east yard, strung with lights. */
  fir: { x: 46, z: 108 } as Spot,
  /** One of the places Ded Moroz's sack turns up (`zarya/sack.ts`): in the east yard by the yard fir (south-east of it), on open snow with room all round. */
  sack: { x: 52, z: 114 } as Spot,
  /** How high the floor of a ground-floor room is above the yard (the people in the two rooms stand on it). */
  roomFloor: 0.35,
  /** The hockey box in the south of the west yard (boards a metre high: shots pass over), and the way into it, in the middle of its north side (2.6 m wide). */
  rink: { x0: -48.5, z0: 133.5, x1: -29, z1: 146.5 } as Rect,
  rinkGate: { x: -38.75, z: 133.5 } as Spot,
} as const;

type Stand = readonly [x: number, z: number, lookX: number, lookZ: number, role?: PersonRole];

/** Who stands where, and what each was looking at. Checked against the build: nobody is inside anything. */
const STOOD: readonly Stand[] = [
  // ---- the playground: children on everything, the grown-ups who were watching them ----
  [-76.7, 105.9, -76, 104, 'child'],
  [-75.2, 106.0, -76, 104, 'child'],
  [-66.4, 113.5, -66, 111, 'child'],
  [-63.6, 110.4, -66, 111, 'child'],
  [-68.3, 109.9, -66, 111, 'child'],
  [-54.9, 103.2, -58, 103, 'child'],
  [-61.9, 103.1, -59, 103, 'child'],
  [-72.9, 116.3, -75, 116, 'child'],
  [-75.2, 118.2, -75, 116, 'child'],
  [-57.4, 114.8, -56, 114, 'child'],
  [-65.3, 120.0, -63, 119, 'child'],
  [-58.9, 122.3, -57.5, 121.3, 'child'],
  [-56.6, 122.1, -57.5, 121.3, 'child'],
  [-69.7, 124.1, -66, 111],
  [-68.3, 124.2, -66, 111],
  [-53.7, 107.6, -59, 104],
  // ---- the open stairwell door of the west yard, and the benches either side of it ----
  [-64.0, 87.6, -62, 89.5],
  [-60.0, 87.5, -62, 89.5],
  [-62.2, 89.0, -62, 85],
  [-66.9, 89.6, -62, 88],
  // ---- the open stairwell door of the east yard ----
  [48.7, 88.6, 50.8, 90.5],
  [52.9, 88.5, 50.8, 90.5],
  [50.9, 90.0, 50.8, 86],
  [46.0, 90.2, 50.8, 88.5],
  // ---- on the walk from the archway to the tram ----
  [-23.7, 96.4, -23, 160],
  [-22.3, 97.4, -23, 160],
  // ---- waiting for the tram: under the shelter and along the kerb ----
  [-37.6, 159.6, -30, 165],
  [-35.6, 159.5, -28, 165],
  [-33.7, 159.7, -26, 165],
  [-28.4, 159.5, -24, 165],
  [-18.2, 159.6, -22, 165],
  // ---- the east side of the west yard: the washing, the carpet racks, the bench by the middle block, a car being dug out ----
  [-11, 101.5, -11, 100],
  [-8.5, 105.5, -8.5, 104],
  [-13.4, 112.3, -13, 111],
  [-0.8, 117.2, -12, 117],
  [-9.6, 134.6, -9, 136.5],
  // ---- the snow fort: one behind its wall, one coming at it ----
  [-43.0, 101.1, -38, 106, 'child'],
  [-38.4, 105.6, -42, 102, 'child'],
  // ---- the hockey box: three at the puck, one watching over the boards ----
  [-40.4, 139.3, -37.9, 140.5, 'child'],
  [-36.2, 141.6, -37.9, 140.5, 'child'],
  [-41.8, 142.2, -37.9, 140.5, 'child'],
  [-33.6, 132.3, -37.9, 140.5],
  // ---- the woodpile ----
  [-72.8, 135.7, -74, 135],
  [-77.6, 134.5, -79, 137],
  // ---- the east yard: round the fir, the kennel, the workbench, the bins, the shed, the summer-house ----
  [43.9, 106.5, 46, 108],
  [48.4, 106.4, 46, 108],
  [48.8, 109.8, 46, 108, 'child'],
  [71.3, 132.4, 68.3, 130.5],
  [38.8, 142.9, 42, 144.2],
  [68.3, 141.3, 68.5, 143.5],
  [96.2, 109.4, 96.3, 107.8],
  [78.2, 114.1, 79.6, 115.2],
  [80.1, 114.6, 78.2, 114.1],
];

/** Everyone caught in this zone, standing where the snow found them (never inside anything solid, never on top of another). */
export const dvorPeople: PeopleFn = (add, r) => {
  // about fifty-five in the two yards: knots at the playground (children), the benches and the two open stairwell
  // doors, the tram stop, and one at each `cover` spot
  for (const [x, z, lx, lz, role] of STOOD) add(x, z, yawTo(x, z, lx, lz) + (r() - 0.5) * 0.5, role ?? 'towns');
  for (const c of DVOR.cover) add(c.x, c.z, r() * 6.28);
  // Vera's grandmother at her open window, inside the room (nothing walks in there)
  const f = DVOR.roomFloor;
  add(DVOR.babushka.x, DVOR.babushka.z - 1.1, Math.PI, 'babushka', false, f);
  // the family behind the lit window, all turned to the television on the back wall: two sat at the table (sunk to
  // the waist behind it), one on his feet in the corner, a child sat on the floor in front of the screen
  const t = DVOR.tv;
  const zf = t.z - 3.3; // the wall of the block behind their room
  const tvx = t.x - 0.75;
  const tvz = zf + 0.55;
  for (const [dx, dz, role, sink] of [[0.35, 1.05, 'towns', 0.45], [1.55, 1.8, 'towns', 0.45], [-1.9, 1.3, 'towns', 0], [-0.75, 1.45, 'child', 0.4]] as const) {
    add(t.x + dx, zf + dz, yawTo(t.x + dx, zf + dz, tvx, tvz), role, false, f - sink);
  }
  // in each open stairwell door, on its top step: someone caught stepping out, holding the door, who fills the doorway
  // (the dark stairwell behind is not a way in: the porch is solid, and now the doorway is plainly taken)
  for (const d of DVOR.doors) add(d.x - 0.1, d.z - 1.75, yawTo(0, 0, 0.15, 1), 'towns', false, 0.45);
};
