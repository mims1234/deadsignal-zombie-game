/**
 * ZARYA, the GARAGES: the garage cooperative south of the Rynok (no THREE). The story (`story.ts`, `runtime.ts`) uses these spots BY NAME: the layout
 * (`world/layout/zarya*.ts`) may move any of them, but every name must stay and must be somewhere a player can stand
 * within 2 m of (unless it says otherwise). x runs east, z south (north is -z).
 *
 * Act II. Reached through two chained gates (the bolt cutters): from the Dvor (west wall) and from the Rynok
 * (north wall). Timur's garage has the main workbench, where the strong weapons are built.
 *
 * How it lies: four rows of garages run east to west, each row two garages deep (back to back, a door on both
 * sides), so every lane has doors along both its sides. Three lanes run between the rows (the middle one from the
 * west gate), a ring lane goes round the outside, and two cross-lanes cut every row (the eastern one runs south from
 * the north gate). East of the rows is the watchman's yard. The heating main runs along the roofs and crosses the
 * lanes overhead.
 */
import { yawTo, type PeopleFn, type Rect, type Spot } from '../types';

/** An open garage: a room cut out of a row, one garage deep, open to its lane on `face` (+1 south, -1 north) between `mouth[0]` and `mouth[1]`. */
export interface GarageBay extends Rect {
  face: 1 | -1;
  mouth: [number, number];
}

const TIMUR: GarageBay = { x0: 166.8, z0: 110, x1: 177.6, z1: 116, face: 1, mouth: [166.8, 174] };

export const GARAGES = {
  rect: { x0: 100, z0: 72, x1: 246, z1: 172 } as Rect,
  /** The four rows: the z each one's spine runs along (a row is 12 m deep: 6 m of garage either side of it). */
  rows: [88, 110, 134, 156] as number[],
  /** The three blocks every row is cut into by the cross-lanes: [its west end, how many garages, how wide each]. */
  blocks: [[111, 10, 3.7], [156, 10, 3.6], [200, 6, 3.5]] as [number, number, number][],
  /** The open garages (everything else in a row is shut and solid). */
  bays: {
    timur: TIMUR,
    /** The Institute's crates. */
    store: { x0: 203.5, z0: 110, x1: 210.5, z1: 116, face: 1, mouth: [203.5, 210.5] } as GarageBay,
    /** The builder's: two garages knocked into one, one door open. */
    builder: { x0: 125.8, z0: 88, x1: 133.2, z1: 94, face: 1, mouth: [129.5, 133.2] } as GarageBay,
    /** The plumber's: a single garage. */
    plumber: { x0: 210.5, z0: 134, x1: 214, z1: 140, face: 1, mouth: [210.5, 214] } as GarageBay,
    /** The welder's (opens north, onto the southern lane). */
    welder: { x0: 136.9, z0: 150, x1: 144.3, z1: 156, face: -1, mouth: [136.9, 144.3] } as GarageBay,
  },
  /** Timur's garage, open and lit, on the north side of the middle lane; the main workbench along its back wall (a player stands in front of it, to its south). */
  timur: TIMUR as Rect,
  bench: { x: 170.4, z: 110.9 } as Spot,
  /** A garage stacked with Institute crates stencilled with a bear paw (a clue: look at them). On the middle lane, east of the north gate's cross-lane; the spot is at the face of the stack. */
  crates: { x: 207.6, z: 111.6 } as Spot,
  /**
   * Parts: a nailer (the builder's garage on the northern lane: its case lies on the timber), launch tubes (the
   * plumber's garage on the southern lane: lengths of pipe on the wall rack), a crossguard (the welder's garage on the
   * southern lane: brackets on the welding bench).
   */
  nailer: { x: 130.4, z: 89.6 } as Spot,
  tubes: { x: 211.8, z: 137.2 } as Spot,
  guard: { x: 140.4, z: 154.6 } as Spot,
  /** One of the repairman's three tools (a set of screwdrivers on the wing of the stripped car in the watchman's yard, by its raised bonnet). */
  tool: { x: 233.4, z: 145.2 } as Spot,
  /** A weapon mod part (`zarya/mods.ts`): a box of Timur's gun parts on his garage's back wall, east of his workbench. */
  modPart: { x: 175.4, z: 111.2 } as Spot,
  /** By the cooperative's little fir and a child's sledge, against the south fence. */
  ornament: { x: 119.6, z: 167.4 } as Spot,
  /** The watchman's hut (its middle: he stands inside at the window, and nobody else gets in), and the stripped car on blocks (its middle, and the way its nose points). */
  hut: { x: 236.5, z: 87.5 } as Spot,
  car: { x: 234.5, z: 147, yaw: Math.PI / 2 - 0.2 },
  /** The New Year table three neighbours set up in the northern lane. */
  table: { x: 176, z: 102.6 } as Spot,
  /** A man at his garage door on the middle lane, east of Timur's. */
  cover: [{ x: 183, z: 118 }] as Spot[],
  spawns: [[104, 80], [241, 76], [241, 166], [104, 165], [180, 166]] as [number, number][],
} as const;

/** Everyone caught in this zone, standing where the snow found them (never inside anything solid, never on top of another). */
export const garagesPeople: PeopleFn = (add, r) => {
  // twenty-one: men at their garages, the watchman in his hut
  const G = GARAGES;
  const face = (x: number, z: number, tx: number, tz: number): void => add(x, z, yawTo(x, z, tx, tz) + (r() - 0.5) * 0.4);
  // the one who can be covered: at his door, key in hand
  for (const c of G.cover) add(c.x, c.z, yawTo(c.x, c.z, c.x, c.z - 3));
  // the watchman, inside his hut at the window (nothing bumps into him: the hut is solid)
  add(G.hut.x + 0.1, G.hut.z + 0.55, yawTo(0, 0, 0, 1), 'towns', false, 0.2);
  // men at their own doors: the northern lane, the southern lane, the ring lane along the north wall, the middle lane
  face(123.95, 95.3, 123.95, 94);
  face(165, 141.3, 165, 140);
  face(127.65, 80.7, 127.65, 82);
  face(127.65, 126.7, 127.65, 128);
  // the New Year table: three neighbours round a bottle
  const T = G.table;
  face(T.x - 1.1, T.z - 0.1, T.x, T.z);
  face(T.x, T.z - 1.3, T.x, T.z);
  face(T.x + 1.15, T.z - 1.0, T.x, T.z);
  // two with a fir tree on a sledge, stopped under the lamp at the corner of the northern lane
  face(152.6, 95.2, 153.7, 96);
  face(154.5, 97.0, 153.7, 96);
  // in the open garages: the builder at his timber, the welder at his set, the plumber among his radiators, one more at the crates
  face(131.4, 91.2, 128.5, 89.2);
  face(142.2, 154.3, 142.9, 155.4);
  face(213, 135.5, 212.2, 134.2);
  face(208.7, 113.8, 207.4, 111.4);
  // two digging a car out of the snow along the south fence
  face(167.2, 166.9, 167.4, 168.8);
  face(169.4, 166.8, 169, 168.8);
  // one with the hand cart in the yard, two at the stripped car (one bent to the engine, one at its side)
  face(232.94, 98.64, 231.6, 99.2);
  face(235.15, 144.3, G.car.x, G.car.z);
  face(236.05, 147, G.car.x, G.car.z);
  // one reading the cooperative's notices by the west gate
  face(109.3, 135.5, 111, 135.5);
};
