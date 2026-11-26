/**
 * HIRASAKA reborn: where everything is (no THREE). This file is the contract between the frame
 * (`world/layout/hirasaka.ts`), the zone builders (`world/layout/hirasaka<Group>.ts`), the story (`story.ts`), the
 * co-op simulation, the director and the screen (`runtime.ts`).
 *
 * x runs east, z south (north is -z), metres. The island is about 320 x 150 m: the sea and Dolphin Pier in the south,
 * the summit rock in the north. Like Hashima it is a rock in the middle with concrete poured round it, so the ground is
 * a set of flat PADS at a few heights (raised floors, `ColliderSpec.floor`), each a place or part of one, with retaining
 * walls where two pads of different height meet and FLIGHTS of steps through them. The nav grid is one height field:
 * every wall, rim or solid thing on a raised pad is a collider from y 0 up (the y0 = 0 rule).
 *
 *            x -160          -104   -90  -56  -40      10   20       70                 160
 *   z -76    +--------------+-------+----------+----------------------+------------------+
 *            |   BLOCK 65   |  SCHOOL (B70)   |     THE SUMMIT 18    |                  |
 *            |   7.2        |  7.2            |  shrine, lighthouse  |                  |
 *   z -24    |              |                 +---------+------------+    THE PITHEAD    |
 *   z -20    +------+-------+--------+--------+ HELL    | STAIRS OF  |    0              |
 *            |NIKKYŪ|  HOSPITAL 7.2           | STAIRS  | LIFE / FAN |  winding house,   |
 *            | ROW  |                         | 10.8    | 7.2        |  headframe, cage, |
 *   z  14    |  0   +--------+----------------+--+------+-----+------+  lamp room, bath  |
 *            |      |BLOCK 30|   MARKET LANE  3.6    | BLOCK 31 0  |                  |
 *            |      |  3.6   |                       |  (bath,     |                  |
 *   z  54    +------+--------+-------+---------------+--boiler)----+                  |
 *            |  SHIO-FURI STREET 0   |   THE SEAWALL 0  (pier)     |                  |
 *   z  76    +-----------------------+---------------+=====+-------+------------------+
 *                                                    pier to z 96
 *
 * THE DEEP is an underground area of its own far east (`DEEP`, an `under` area in `floors.ts`), about 260 x 140 m.
 * The mine levels are at y 9 (`DEEP_Y`); only the Root Hall is lower (y 0), at the foot of the kofun passage:
 *
 *   the cage landing + lamp room -> the flooded galleries -> the coal face + powder magazine -> (the drift, a coal seam
 *   only the pick breaks) -> the Old Village -> the kofun passage, down -> the Root Hall.  On the climb: back up the
 *   kofun passage, up the adit stair from its head, out of the old adit at the foot of the Stairs of Life.
 *
 * Every named spot is somewhere a player can stand within 2 m of, on its pad's floor (`y`). Zone builders may move a
 * spot inside its place (and must keep the name); the story uses them BY NAME.
 */

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
/** A spot on a floor: `y` is the floor's height there. */
export interface Spot {
  x: number;
  y: number;
  z: number;
}
export const inRect = (q: Rect, x: number, z: number, pad = 0): boolean => x >= q.x0 - pad && x <= q.x1 + pad && z >= q.z0 - pad && z <= q.z1 + pad;
const S = (x: number, y: number, z: number): Spot => ({ x, y, z });

// ---------------------------------------------------------------------------------------------------------------------
// the frame
// ---------------------------------------------------------------------------------------------------------------------

/** The island's walkable rectangle (the pier sticks out south of it). */
export const ISLAND: Rect = { x0: -160, z0: -76, x1: 160, z1: 76 };
export const PIER: Rect = { x0: 8, z0: 76, x1: 18, z1: 96 };
/** The collision bounds of the street map (the island and its sea). */
export const HIRASAKA_BOUNDS = { minX: -168, maxX: 168, minZ: -84, maxZ: 100 };
/** The deep: walkable cells of its own, far east across the water. */
export const DEEP: Rect = { x0: 262, z0: -72, x1: 522, z1: 68 };
export const HIRASAKA_SPACE = { minX: -168, maxX: 526, minZ: -84, maxZ: 100 };
/** Floor heights. */
export const Y = { sea: 0, town: 3.6, terrace: 7.2, landing: 10.8, summit: 18, top: 21.6 } as const;
/** The deep's mine levels (everything below except the Root Hall). */
export const DEEP_Y = 9;
/** The sea round the island before the climb. */
export const SEA_Y = -0.6;

export type PadId = 'seawall' | 'shiofuri' | 'nikkyu' | 'block30' | 'market' | 'block31' | 'hospital' | 'hellstairs' | 'life' | 'block65' | 'school' | 'summit' | 'pithead';
/** The island's ground: flat pads that tile `ISLAND` exactly (no gaps, no overlaps), each at one height. */
export const PADS: readonly (Rect & { id: PadId; y: number })[] = [
  { id: 'shiofuri', x0: -160, z0: 54, x1: -40, z1: 76, y: Y.sea },
  { id: 'seawall', x0: -40, z0: 54, x1: 70, z1: 76, y: Y.sea },
  { id: 'nikkyu', x0: -160, z0: -20, x1: -104, z1: 54, y: Y.sea },
  { id: 'block30', x0: -104, z0: 14, x1: -40, z1: 54, y: Y.town },
  { id: 'market', x0: -40, z0: 14, x1: 20, z1: 54, y: Y.town },
  { id: 'block31', x0: 20, z0: 14, x1: 70, z1: 54, y: Y.sea },
  { id: 'hospital', x0: -104, z0: -20, x1: -40, z1: 14, y: Y.terrace },
  { id: 'hellstairs', x0: -40, z0: -24, x1: 10, z1: 14, y: Y.landing },
  { id: 'life', x0: 10, z0: -24, x1: 70, z1: 14, y: Y.terrace },
  { id: 'block65', x0: -160, z0: -76, x1: -90, z1: -20, y: Y.terrace },
  { id: 'school', x0: -90, z0: -76, x1: -40, z1: -20, y: Y.terrace },
  { id: 'summit', x0: -40, z0: -76, x1: 70, z1: -24, y: Y.summit },
  { id: 'pithead', x0: 70, z0: -76, x1: 160, z1: 76, y: Y.sea },
];

/** The pad (x, z) is on, or null off the island (the pier counts as the seawall). */
export function padAt(x: number, z: number): (typeof PADS)[number] | null {
  for (const p of PADS) if (x >= p.x0 && x < p.x1 && z >= p.z0 && z < p.z1) return p;
  if (x === ISLAND.x1 || z === ISLAND.z1) for (const p of PADS) if (inRect(p, x, z)) return p;
  if (inRect(PIER, x, z)) return PADS[1]!;
  return null;
}
/** The island's floor height at (x, z) by its pads (the flights are in between; -1 off the island). */
export function groundY(x: number, z: number): number {
  return padAt(x, z)?.y ?? -1;
}

/**
 * Flights of steps between pads: each climbs from the pad at `lo` to the pad at `hi`, built on the lower pad against
 * the retaining wall, rising toward `up` ('n' = -z, 's' = +z, 'e' = +x, 'w' = -x). `x, z` is the middle of its top
 * edge (on the line between the pads), `w` its width. Steps are 0.3 m high and 0.45 m deep, so a flight's run is
 * (hi - lo) / 0.3 * 0.45 m. The Hell Stairs and the Stairs of Life are named.
 */
export type Dir = 'n' | 's' | 'e' | 'w';
export interface Flight {
  id: string;
  name?: string;
  x: number;
  z: number;
  up: Dir;
  w: number;
  lo: number;
  hi: number;
}
export const STEP_H = 0.3;
export const TREAD = 0.45;
export const flightRun = (f: { lo: number; hi: number }): number => Math.round((f.hi - f.lo) / STEP_H) * TREAD;
export const FLIGHTS: readonly Flight[] = [
  // the seawall up to Market Lane, Shio-furi Street up to Block 30
  { id: 'seawallUp', x: -14, z: 54, up: 'n', w: 5, lo: Y.sea, hi: Y.town },
  { id: 'shiofuriUp', x: -82, z: 54, up: 'n', w: 3.6, lo: Y.sea, hi: Y.town },
  // Nikkyū Row: up to Block 30 (east), up to Block 65's terrace (north)
  { id: 'nikkyuEast', x: -104, z: 34, up: 'e', w: 3.6, lo: Y.sea, hi: Y.town },
  { id: 'nikkyuNorth', x: -132, z: -20, up: 'n', w: 3.6, lo: Y.sea, hi: Y.terrace },
  // Block 31 is a storey below Market Lane (its basement bath is under the street)
  { id: 'block31Up', x: 20, z: 32, up: 'w', w: 4, lo: Y.sea, hi: Y.town },
  // Block 30 up to the hospital terrace, the hospital up to the Hell Stairs' landing
  { id: 'block30Up', x: -82, z: 14, up: 'n', w: 3.6, lo: Y.town, hi: Y.terrace },
  { id: 'hospitalUp', x: -40, z: -2, up: 'e', w: 3.6, lo: Y.terrace, hi: Y.landing },
  // the Hell Stairs: Market Lane to the landing, the landing to the summit, one straight line
  { id: 'hell1', name: 'THE HELL STAIRS', x: -16, z: 14, up: 'n', w: 5, lo: Y.town, hi: Y.landing },
  { id: 'hell2', name: 'THE HELL STAIRS', x: -16, z: -24, up: 'n', w: 5, lo: Y.landing, hi: Y.summit },
  // the Stairs of Life: from the pithead up to the fan house's terrace; and on from there to the landing
  { id: 'life', name: 'THE STAIRS OF LIFE', x: 70, z: -6, up: 'w', w: 4, lo: Y.sea, hi: Y.terrace },
  { id: 'lifeUp', x: 10, z: 0, up: 'w', w: 3.6, lo: Y.terrace, hi: Y.landing },
];

/** The footprint of a flight's steps (on the lower pad). */
export function flightRect(f: Flight): Rect {
  const run = flightRun(f);
  const h = f.w / 2;
  switch (f.up) {
    case 'n':
      return { x0: f.x - h, z0: f.z, x1: f.x + h, z1: f.z + run };
    case 's':
      return { x0: f.x - h, z0: f.z - run, x1: f.x + h, z1: f.z };
    case 'e':
      return { x0: f.x - run, z0: f.z - h, x1: f.x, z1: f.z + h };
    default:
      return { x0: f.x, z0: f.z - h, x1: f.x + run, z1: f.z + h };
  }
}

/**
 * Block 65's and the school's top floors and the footbridge between them: an upper area (`floors.ts`) at `Y.top`.
 * Block 65's own stairwells are down (the typhoon); the only way up is the school's stair, then over the footbridge.
 */
export const HEIGHTS = {
  rect: { x0: -160, z0: -76, x1: -40, z1: -20 } as Rect,
  y: Y.top,
  /** The floor slabs: the school's top floor, the footbridge, Block 65's top-floor corridor and Genzō's room off it. */
  slabs: [
    { id: 'schoolTop', x0: -84, z0: -66, x1: -48, z1: -36 },
    { id: 'bridge', x0: -95, z0: -54, x1: -84, z1: -49 },
    { id: 'b65Top', x0: -150, z0: -58, x1: -95, z1: -45 },
  ] as readonly (Rect & { id: string })[],
  /** The school's stair: its foot on the ground floor (y 7.2), its head on the top floor. */
  stairFoot: S(-60, Y.terrace, -30),
  stairHead: S(-60, Y.top, -40),
};

// ---------------------------------------------------------------------------------------------------------------------
// the island's twelve places, grouped by the layout file that builds them
// ---------------------------------------------------------------------------------------------------------------------

export type PlaceId =
  | 'seawall'
  | 'shiofuri'
  | 'nikkyu'
  | 'block30'
  | 'block31'
  | 'market'
  | 'block65'
  | 'hospital'
  | 'school'
  | 'summit'
  | 'hellstairs'
  | 'pithead'
  | 'landing'
  | 'galleries'
  | 'face'
  | 'village'
  | 'kofun'
  | 'roothall';
export type GroupId = 'seawall' | 'town' | 'blocks' | 'school' | 'summit' | 'pithead' | 'galleries' | 'village' | 'root';

export interface Place {
  id: PlaceId;
  name: string;
  group: GroupId;
  rect: Rect;
  /** Floor height (the pad's; a place on two pads gives the main one). */
  y: number;
  deep?: boolean;
  /** A second piece (the Stairs of Life's head: the fan house's terrace, built by the summit's file). */
  also?: Rect;
}

/** The eighteen places: twelve on the island, six in the deep. Their rectangles never overlap. */
export const PLACES_LIST: readonly Place[] = [
  { id: 'seawall', name: 'DOLPHIN PIER AND THE SEAWALL', group: 'seawall', rect: { x0: -40, z0: 54, x1: 70, z1: 96 }, y: Y.sea },
  { id: 'shiofuri', name: 'SHIO-FURI STREET', group: 'seawall', rect: { x0: -160, z0: 54, x1: -40, z1: 76 }, y: Y.sea },
  { id: 'nikkyu', name: 'NIKKYŪ ROW', group: 'blocks', rect: { x0: -160, z0: -20, x1: -104, z1: 54 }, y: Y.sea },
  { id: 'block30', name: 'BLOCK 30', group: 'blocks', rect: { x0: -104, z0: 14, x1: -40, z1: 54 }, y: Y.town },
  { id: 'market', name: 'MARKET LANE', group: 'town', rect: { x0: -40, z0: 14, x1: 20, z1: 54 }, y: Y.town },
  { id: 'block31', name: 'BLOCK 31', group: 'town', rect: { x0: 20, z0: 14, x1: 70, z1: 54 }, y: Y.sea },
  { id: 'hospital', name: 'THE HOSPITAL', group: 'blocks', rect: { x0: -104, z0: -20, x1: -40, z1: 14 }, y: Y.terrace },
  { id: 'block65', name: 'BLOCK 65', group: 'school', rect: { x0: -160, z0: -76, x1: -90, z1: -20 }, y: Y.terrace },
  { id: 'school', name: 'THE SCHOOL', group: 'school', rect: { x0: -90, z0: -76, x1: -40, z1: -20 }, y: Y.terrace },
  { id: 'hellstairs', name: 'THE HELL STAIRS', group: 'summit', rect: { x0: -40, z0: -24, x1: 10, z1: 14 }, y: Y.landing },
  { id: 'summit', name: 'THE SUMMIT', group: 'summit', rect: { x0: -40, z0: -76, x1: 70, z1: -24 }, y: Y.summit },
  { id: 'pithead', name: 'THE STAIRS OF LIFE AND THE PITHEAD', group: 'pithead', rect: { x0: 70, z0: -76, x1: 160, z1: 76 }, y: Y.sea, also: { x0: 10, z0: -24, x1: 70, z1: 14 } },
  // the deep
  { id: 'landing', name: 'THE CAGE LANDING', group: 'galleries', rect: { x0: 268, z0: 22, x1: 310, z1: 64 }, y: DEEP_Y, deep: true },
  { id: 'galleries', name: 'THE FLOODED GALLERIES', group: 'galleries', rect: { x0: 310, z0: 26, x1: 404, z1: 62 }, y: DEEP_Y, deep: true },
  { id: 'face', name: 'THE COAL FACE', group: 'galleries', rect: { x0: 404, z0: -4, x1: 472, z1: 66 }, y: DEEP_Y, deep: true },
  { id: 'village', name: 'THE OLD VILLAGE', group: 'village', rect: { x0: 420, z0: -70, x1: 518, z1: -4 }, y: DEEP_Y, deep: true },
  { id: 'kofun', name: 'THE KOFUN PASSAGE', group: 'root', rect: { x0: 344, z0: -48, x1: 420, z1: -4 }, y: DEEP_Y, deep: true },
  { id: 'roothall', name: 'THE ROOT HALL', group: 'root', rect: { x0: 266, z0: -70, x1: 344, z1: -4 }, y: 0, deep: true },
];
export const PLACE: Record<PlaceId, Place> = Object.fromEntries(PLACES_LIST.map((p) => [p.id, p])) as Record<PlaceId, Place>;

/**
 * The layout files that build the places (one builder each): the place group, its rectangle (the union of its
 * places), and the file. The frame calls each inside `LevelBuilder.zone` so a group is only drawn near the player.
 */
export const GROUPS: readonly { id: GroupId; name: string; file: string; rect: Rect; near: readonly GroupId[] }[] = [
  { id: 'seawall', name: 'THE SEAWALL AND SHIO-FURI STREET', file: 'hirasakaSeawall.ts', rect: { x0: -160, z0: 54, x1: 70, z1: 96 }, near: ['town', 'blocks', 'pithead'] },
  { id: 'town', name: 'MARKET LANE AND BLOCK 31', file: 'hirasakaTown.ts', rect: { x0: -40, z0: 14, x1: 70, z1: 54 }, near: ['seawall', 'blocks', 'summit', 'pithead'] },
  { id: 'blocks', name: 'NIKKYŪ ROW, BLOCK 30 AND THE HOSPITAL', file: 'hirasakaBlocks.ts', rect: { x0: -160, z0: -20, x1: -40, z1: 54 }, near: ['seawall', 'town', 'school', 'summit'] },
  { id: 'school', name: 'BLOCK 65 AND THE SCHOOL', file: 'hirasakaSchool.ts', rect: { x0: -160, z0: -76, x1: -40, z1: -20 }, near: ['blocks', 'summit'] },
  { id: 'summit', name: 'THE HELL STAIRS, THE FAN HOUSE AND THE SUMMIT', file: 'hirasakaSummit.ts', rect: { x0: -40, z0: -76, x1: 70, z1: 14 }, near: ['town', 'blocks', 'school', 'pithead'] },
  { id: 'pithead', name: 'THE STAIRS OF LIFE AND THE PITHEAD', file: 'hirasakaPithead.ts', rect: { x0: 70, z0: -76, x1: 160, z1: 76 }, near: ['seawall', 'town', 'summit'] },
  { id: 'galleries', name: 'THE LANDING, THE GALLERIES, THE COAL FACE', file: 'hirasakaGalleries.ts', rect: { x0: 268, z0: -4, x1: 472, z1: 66 }, near: ['village'] },
  { id: 'village', name: 'THE OLD VILLAGE', file: 'hirasakaVillage.ts', rect: { x0: 420, z0: -70, x1: 518, z1: -4 }, near: ['galleries', 'root'] },
  { id: 'root', name: 'THE KOFUN PASSAGE AND THE ROOT HALL', file: 'hirasakaRoot.ts', rect: { x0: 266, z0: -70, x1: 420, z1: -4 }, near: ['village'] },
];

/** Which place each pad belongs to (the fan house's terrace is the Stairs of Life's head). */
const PAD_PLACE: Record<PadId, PlaceId> = { seawall: 'seawall', shiofuri: 'shiofuri', nikkyu: 'nikkyu', block30: 'block30', market: 'market', block31: 'block31', hospital: 'hospital', hellstairs: 'hellstairs', life: 'pithead', block65: 'block65', school: 'school', summit: 'summit', pithead: 'pithead' };

/** The place (x, z) is in (on the island or in the deep), or null. */
export function placeAt(x: number, z: number): PlaceId | null {
  if (inDeep(x)) {
    const r = deepRoomAt(x, z);
    return r ? (r.place === 'climb' ? 'kofun' : r.place) : null;
  }
  const p = padAt(x, z);
  return p ? PAD_PLACE[p.id] : null;
}

/** Each place as a sentence names it (the objectives' "where"). */
export const PLACE_SHORT: Record<PlaceId, string> = {
  seawall: 'the seawall',
  shiofuri: 'Shio-furi Street',
  nikkyu: 'Nikkyū Row',
  block30: 'Block 30',
  block31: 'Block 31',
  market: 'Market Lane',
  block65: 'Block 65',
  hospital: 'the hospital',
  school: 'the school',
  summit: 'the summit',
  hellstairs: 'the Hell Stairs',
  pithead: 'the pithead',
  landing: 'the cage landing',
  galleries: 'the flooded galleries',
  face: 'the coal face',
  village: 'the Old Village',
  kofun: 'the kofun passage',
  roothall: 'the Root Hall',
};
/** Where a spot is, as a sentence names it. */
export function placeName(s: { x: number; z: number }): string {
  const at = placeAt(s.x, s.z);
  return at ? PLACE_SHORT[at] : 'the island';
}

/** Is (x, z) in the deep? */
export const inDeep = (x: number): boolean => x > DEEP.x0 - 6;
/** Back-compatible name (the old mine). */
export const inMine = inDeep;

// ---------------------------------------------------------------------------------------------------------------------
// the deep's rooms (carved out of the rock by the frame; zone builders dress them)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Open rectangles carved out of the rock: `y` the floor, `h` the roof above it. A slope rises from `y` at its `from`
 * edge to `y2` at the opposite edge, along `along`. Rooms that touch share an opening along the touching edge.
 */
export interface DeepRoom extends Rect {
  id: string;
  place: PlaceId | 'climb';
  y: number;
  h: number;
  slope?: { along: 'x' | 'z'; from: 'min' | 'max'; y2: number };
}
export const DEEP_ROOMS: readonly DeepRoom[] = [
  { id: 'landing', place: 'landing', x0: 268, z0: 24, x1: 310, z1: 62, y: DEEP_Y, h: 7 },
  { id: 'gallery', place: 'galleries', x0: 310, z0: 34, x1: 404, z1: 46, y: DEEP_Y, h: 4.6 },
  { id: 'galleryN', place: 'galleries', x0: 330, z0: 46, x1: 384, z1: 60, y: DEEP_Y, h: 4.2 },
  { id: 'galleryS', place: 'galleries', x0: 346, z0: 28, x1: 372, z1: 34, y: DEEP_Y, h: 4.2 },
  { id: 'face', place: 'face', x0: 404, z0: 20, x1: 470, z1: 64, y: DEEP_Y, h: 6 },
  { id: 'magazine', place: 'face', x0: 452, z0: 8, x1: 470, z1: 20, y: DEEP_Y, h: 4 },
  { id: 'drift', place: 'face', x0: 430, z0: -4, x1: 444, z1: 20, y: DEEP_Y, h: 4.6 },
  { id: 'village', place: 'village', x0: 420, z0: -68, x1: 516, z1: -4, y: DEEP_Y, h: 18 },
  { id: 'villageDoor', place: 'kofun', x0: 414, z0: -40, x1: 420, z1: -32, y: DEEP_Y, h: 4.6 },
  { id: 'kofunHead', place: 'kofun', x0: 396, z0: -46, x1: 414, z1: -26, y: DEEP_Y, h: 6 },
  { id: 'kofun', place: 'kofun', x0: 344, z0: -40, x1: 396, z1: -32, y: 0, h: 5, slope: { along: 'x', from: 'min', y2: DEEP_Y } },
  { id: 'roothall', place: 'roothall', x0: 268, z0: -68, x1: 344, z1: -6, y: 0, h: 24 },
  // the climb out: south up the adit stair from the passage's head, to the old adit's door
  { id: 'aditStair', place: 'climb', x0: 400, z0: -26, x1: 410, z1: -10, y: DEEP_Y, h: 5, slope: { along: 'z', from: 'min', y2: 15 } },
  { id: 'aditHead', place: 'climb', x0: 398, z0: -10, x1: 412, z1: -4, y: 15, h: 5 },
];

/** The floor height in the deep at (x, z), or -1 in the rock. */
export function deepY(x: number, z: number): number {
  for (const r of DEEP_ROOMS) {
    if (x < r.x0 || x >= r.x1 || z < r.z0 || z >= r.z1) continue;
    if (!r.slope) return r.y;
    return slopeY(r, x, z);
  }
  return -1;
}

/** A sloped room's stepped floor at (x, z): steps of `STEP_H` evenly spread along it. */
export function slopeY(r: DeepRoom, x: number, z: number): number {
  const s = r.slope!;
  const len = s.along === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
  const at = s.along === 'x' ? (s.from === 'min' ? x - r.x0 : r.x1 - x) : s.from === 'min' ? z - r.z0 : r.z1 - z;
  const n = Math.round(Math.abs(s.y2 - r.y) / STEP_H);
  const i = Math.min(n, Math.max(0, Math.floor((at / len) * n) + 1));
  return r.y + Math.sign(s.y2 - r.y) * i * STEP_H;
}

/** The deep room (x, z) is in, or null. */
export function deepRoomAt(x: number, z: number): DeepRoom | null {
  for (const r of DEEP_ROOMS) if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return r;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// the spots the story uses BY NAME (zone builders may move them inside their place; never rename)
// ---------------------------------------------------------------------------------------------------------------------

/** The cage: its stops (the pit workshop rides in it: `story.ts` `cageAt`), and its shaft head on the island. */
export const CAGE = {
  /** At the headframe on the pithead: where a player stands to ride it or call it. */
  top: S(126, Y.sea, 8),
  /** At the bottom, in the landing (636 m down). */
  bottom: S(276, DEEP_Y, 42),
  /** Where riders step out at each stop (clear of the cage's bars). */
  topOut: S(126, Y.sea, 12),
  bottomOut: S(280, DEEP_Y, 42),
};
export const CAGE_STOPS: readonly { id: 'top' | 'bottom'; name: string; at: Spot; out: Spot }[] = [
  { id: 'top', name: 'THE PITHEAD', at: CAGE.top, out: CAGE.topOut },
  { id: 'bottom', name: 'THE 636 M LANDING', at: CAGE.bottom, out: CAGE.bottomOut },
];

/** The old adit: its door at the top of the climb below, and its mouth on the island at the foot of the Stairs of Life. */
export const ADIT = {
  head: S(405, 15, -5),
  door: S(405, 15, -8),
  /** On the island: in the fan terrace's retaining wall, north of the Stairs of Life's foot. */
  mouth: S(71.2, Y.sea, -18),
  out: S(75, Y.sea, -18),
};

/** Act I. The three jobs, any order, each a different kind of work. */
export const JOBS = {
  steam: {
    /** Block 31's basement: the bath, and the boiler room behind it (a boarded door only the axe opens). */
    boiler: S(60, Y.sea, 24),
    /** The coal sacks (three): the bath's coal store, a cellar shop under Nikkyū Row, and one buried in the pithead's slag (only the shovel digs it). */
    coal: [S(54, Y.sea, 46), S(-132, Y.sea, 8), S(150, Y.sea, -56)] as readonly Spot[],
    /** The boiler key, on the board in Block 30's caretaker's room. */
    boilerKey: S(-80, Y.town, 32),
  },
  air: {
    /** The fan house at the head of the Stairs of Life: its rusted shutter (the pick), and the fan's starter. */
    shutter: S(58, Y.terrace, -9),
    fan: S(52, Y.terrace, -17),
  },
  key: {
    /** Genzō's cage key, in his room off Block 65's top-floor corridor (over the footbridge from the school). */
    key: S(-140, Y.top, -51),
  },
};

/** The umibōzu set piece: the seawall winch (the Mori is built here), and where it rises out of the sea. */
export const UMIBOZU = {
  winch: S(44, Y.sea, 70),
  rise: { x: 40, z: 116 },
  /** The Mori's parts: a harpoon head at the fishermen's shed on Shio-furi Street, the winch's cable cutter on the pier. */
  parts: [S(-120, Y.sea, 66), S(13, Y.sea, 90)] as readonly Spot[],
};

/** The tools to swing: where each is found (`arms` makes them real weapons; the story only knows they were taken). */
export type ToolId = 'pick' | 'axe' | 'shovel' | 'tachi';
export const TOOL_IDS: readonly ToolId[] = ['pick', 'axe', 'shovel', 'tachi'];
export const TOOLS: Record<ToolId, Spot & { name: string; where: string }> = {
  pick: { ...S(92, Y.sea, 38), name: 'TSURUHASHI PICK', where: 'the pithead lamp room' },
  axe: { ...S(104, Y.sea, -30), name: 'TIMBER AXE', where: 'the winding house' },
  shovel: { ...S(140, Y.sea, 30), name: 'COAL SHOVEL', where: 'the pithead coal yard' },
  tachi: { ...S(20, Y.summit, -60), name: 'SHRINE TACHI', where: 'the summit shrine' },
};

/**
 * What only one tool opens (`story.ts` `obstacles` bits, in this order). `main`: on the story's path (a placeholder
 * interaction opens it until `arms` makes it a swing); the rest are shortcuts and caches. `block`: a collider the frame
 * builds and `doors.ts` removes when it opens.
 */
export const OBSTACLES: readonly { id: string; tool: ToolId; at: Spot; what: string; main?: boolean; block?: Rect }[] = [
  { id: 'shutter', tool: 'pick', at: JOBS.air.shutter, what: "the fan house's rusted shutter", main: true, block: { x0: 56.4, z0: -10.25, x1: 59.6, z1: -9.75 } },
  { id: 'bathDoor', tool: 'axe', at: S(47, Y.sea, 26), what: "the boarded door to Block 31's boiler room", main: true, block: { x0: 49.6, z0: 23.8, x1: 50.4, z1: 28.2 } },
  { id: 'slag', tool: 'shovel', at: JOBS.steam.coal[2]!, what: 'the coal sack buried in the slag heap', main: true },
  { id: 'drift', tool: 'pick', at: S(437, DEEP_Y, 6), what: 'the coal seam fallen across the drift to the village', main: true, block: { x0: 430, z0: 3, x1: 444, z1: 4.4 } },
  { id: 'roots', tool: 'tachi', at: S(306, 0, -40), what: "the roots over Mio's hairpin", main: true },
  { id: 'rubble', tool: 'pick', at: S(-120, Y.sea, -6), what: 'a rubble fall in Nikkyū Row (a shortcut)', block: { x0: -119.3, z0: -4.2, x1: -104.3, z1: -1.9 } }, // (final polish: a real collider; the fall is `hs-rubble`)
  { id: 'props', tool: 'axe', at: S(360, DEEP_Y, 40), what: 'rotten pit props in the galleries (drop the roof on a crowd)' },
  { id: 'sand', tool: 'shovel', at: S(-70, Y.sea, 72), what: 'a cache buried in the seawall sand' },
];
export const OBSTACLE: Record<string, number> = Object.fromEntries(OBSTACLES.map((o, i) => [o.id, i]));

/** Act II's places of the story in the deep. */
export const DEEP_SPOTS = {
  /** The tag board in the landing's lamp room: who never came up (a memorial; nothing comes near it). */
  tagBoard: S(301, DEEP_Y, 60),
  /** The workbench in the lamp room where the ladles' bottoms are knocked out. */
  bench: S(296, DEEP_Y, 50),
  /** The funayūrei across the gallery: hand over the bottomless ladles and they let you pass. */
  funa: S(392, DEEP_Y, 40),
  /** The funayūrei's line across the gallery: nobody passes it until they have their ladles (a collider; `doors.ts`). */
  funaGate: { x0: 393.6, z0: 34, x1: 394.4, z1: 46 } as Rect,
  /** The gallery telephone (rings when every photograph is found). */
  phone: S(352, DEEP_Y, 58),
  /** The Old Village's hearth (eating heals and marks your hand), and Mio's sleeve with the rice ball. */
  hearth: S(470, DEEP_Y, -36),
  riceball: S(498, DEEP_Y, -58),
  /** Bon offering grapes on the village altar (each player takes a bunch for the climb). */
  grapes: S(450, DEEP_Y, -20),
  /** The Root Hall: the forked tree, Mio's hairpin in its roots, where Kurogane lies, and the peaches once it lives. */
  tree: { x: 300, z: -40, r: 3 },
  hairpin: S(306, 0, -40),
  kurogane: S(318, 0, -26),
  peaches: S(296, 0, -32),
  /** Kurogane's room-changers (`bosses` builds them): the hoist over the hall, the fan duct, the pit pump. */
  hoist: S(284, 0, -20),
  fanDuct: S(330, 0, -60),
  pump: S(276, 0, -60),
};

/** Ladles: the bath-house stack in Block 31's bath (Act I). */
export const LADLES = S(42, Y.sea, 34);
/** The pithead bath, where the hearth's mark washes off. */
export const BATH = S(142, Y.sea, 44);

/**
 * Act III. The climb's landmarks in order: when every living player has passed mark i, the sea climbs to mark i-1
 * (`story.ts`); it never comes by clock. `r`: how near counts as passing; `sea`: the water's height once it is risen
 * past this mark (the deep marks flood the deep, the island's the island).
 */
export const CLIMB_MARKS: readonly { id: string; name: string; at: Spot; r: number; sea: number; deep?: boolean }[] = [
  { id: 'kofunHead', name: 'THE HEAD OF THE KOFUN PASSAGE', at: S(405, DEEP_Y, -36), r: 7, sea: 1.6, deep: true },
  { id: 'adit', name: 'THE OLD ADIT', at: ADIT.out, r: 6, sea: DEEP_Y + 7, deep: true },
  { id: 'life', name: 'THE HEAD OF THE STAIRS OF LIFE', at: S(54, Y.terrace, -6), r: 9, sea: Y.sea + 1.2 },
  { id: 'landing', name: 'THE HELL STAIRS LANDING', at: S(-16, Y.landing, -8), r: 10, sea: Y.terrace + 0.5 },
  { id: 'rock', name: 'THE SUMMIT', at: S(-16, Y.summit, -30), r: 8, sea: Y.landing + 0.5 },
];

/** The Chibiki-iwa at the head of the Hell Stairs: where it rests, where it seals, and its three chain winches. */
export const ROCK = {
  rest: S(-4, Y.summit, -32),
  seal: S(-16, Y.summit, -27),
  winches: [S(-30, Y.summit, -34), S(-22, Y.summit, -42), S(-8, Y.summit, -44)] as readonly Spot[],
  /** Where the turn-round (ending 2) is made: before the rock, facing back down the stairs. */
  turn: S(-16, Y.summit, -31),
};

/** The four shrines the offering box (the mystery box) moves between. */
export const SHRINES: readonly (Spot & { id: string; name: string })[] = [
  { ...S(-20, Y.sea, 66), id: 'ebisu', name: 'EBISU AT THE PIER' },
  { ...S(110, Y.sea, 50), id: 'mine', name: 'THE MINE SHRINE' },
  { ...S(488, DEEP_Y, -24), id: 'village', name: 'THE VILLAGE SHRINE' },
  { ...S(30, Y.summit, -58), id: 'summit', name: 'THE SUMMIT SHRINE' },
];

/** Wall buys on the company price boards (`arms` sets the guns; these are the boards' spots and the side they face). */
export const WALL_BUYS: readonly (Spot & { id: string; gun: string; yaw: number })[] = [
  { ...S(-30, Y.sea, 58), id: 'seawall', gun: 'smg', yaw: Math.PI },
  { ...S(-150, Y.sea, 30), id: 'nikkyu', gun: 'shotgun', yaw: -Math.PI / 2 },
  { ...S(-30, Y.town, 40), id: 'market', gun: 'rifle', yaw: 0 },
  { ...S(-64, Y.terrace, -60), id: 'school', gun: 'lmg', yaw: Math.PI / 2 },
  { ...S(116, Y.sea, 40), id: 'pithead', gun: 'dmr', yaw: -Math.PI / 2 },
  { ...S(420, DEEP_Y, 56), id: 'face', gun: 'shotgun', yaw: Math.PI },
];

/** Workbenches for the built weapons (`arms`): the Mori at the winch, the Happa by the powder magazine, the Sakuganki at the coal face. */
export const WORKBENCHES: readonly (Spot & { id: 'mori' | 'happa' | 'sakuganki' })[] = [
  { ...UMIBOZU.winch, id: 'mori' },
  { ...S(456, DEEP_Y, 24), id: 'happa' },
  { ...S(460, DEEP_Y, 50), id: 'sakuganki' },
];

/** Genzō's comb (the Kushi-bi): in his room beside the key. */
export const COMB = S(-130, Y.top, -56);

/** Genzō's five tapes, where each lies. */
export const TAPES: readonly (Spot & { where: string })[] = [
  { ...S(-6, Y.sea, 60), where: "the pier's waiting room" },
  { ...S(-132, Y.top, -48), where: "Genzō's room in Block 65" },
  { ...S(104, Y.sea, -20), where: 'the winding house' },
  { ...S(296, DEEP_Y, 30), where: 'the cage landing' },
  { ...S(482, DEEP_Y, -48), where: 'a house in the Old Village' },
];

/** The five photographs (all five and the gallery telephone, and the rice ball, open the second ending). */
export const PHOTOS: readonly (Spot & { where: string })[] = [
  { ...S(-150, Y.sea, 64), where: 'a ferry notice on Shio-furi Street' },
  { ...S(-64, Y.town, 26), where: "a flat on Block 30's light well" },
  { ...S(-60, Y.top, -60), where: 'the school roof' },
  { ...S(30, Y.summit, -40), where: "the manager's house on the summit" },
  { ...S(440, DEEP_Y, 48), where: 'the coal face' },
];

/** The ten side stories (`story.ts` `side` bits, in this order): each one's first place (`sides` builds the rest). */
export const SIDES: readonly (Spot & { id: string; name: string })[] = [
  { ...S(30, Y.sea, 44), id: 'barber', name: "THE BARBER'S CHAIR" },
  { ...S(20, Y.sea, 64), id: 'ferry', name: 'THE LAST FERRY' },
  { ...S(-120, Y.top, -50), id: 'fishpool', name: 'FISH POOL' },
  { ...S(-140, Y.sea, 40), id: 'cats', name: 'THE CATS' },
  { ...S(-4, Y.town, 30), id: 'reel', name: 'LAST REEL' },
  { ...S(-70, Y.terrace, -30), id: 'letters', name: 'SAYONARA LETTERS' },
  { ...S(112, Y.sea, 56), id: 'okoze', name: 'OKOZE' },
  { ...S(-90, Y.terrace, 0), id: 'tanko', name: 'TANKŌ-BUSHI' },
  { ...S(0, Y.landing, -14), id: 'drums', name: 'DRUMS FOR MIO' },
  { ...DEEP_SPOTS.riceball, id: 'riceball', name: 'THE RICE BALL' },
];
export const SIDE: Record<string, number> = Object.fromEntries(SIDES.map((s, i) => [s.id, i]));

/** The island's things the frame still needs by these names (`world/level.ts` reads `HIRASAKA` and `PLACES.summit`). */
export const HIRASAKA = {
  /** Where you land: the end of the pier, facing the island. */
  start: { x: 13, z: 92 },
  pier: PIER,
  cage: { x: CAGE.top.x, z: CAGE.top.z, r: 2.6 },
  cageBottom: { x: CAGE.bottom.x, z: CAGE.bottom.z },
  stoneRest: { x: ROCK.rest.x, z: ROCK.rest.z },
  stoneSeal: { x: ROCK.seal.x, z: ROCK.seal.z },
  stonePush: { x: ROCK.turn.x, z: ROCK.turn.z, r: 6 },
  lighthouse: { x: 56, z: -62 },
  shrine: { x: SHRINES[3]!.x, z: SHRINES[3]!.z },
} as const;
/** (`world/level.ts` stands the unused relay console here.) */
export const PLACES = {
  summit: { x: 10, z: -50, r: 20 },
} as const;

/** Where the drowned climb up the seawall (and the sea's dead on the climb). */
export const SEA_SPOTS: readonly { x: number; z: number }[] = [
  { x: -140, z: 74 },
  { x: -80, z: 74 },
  { x: -20, z: 74 },
  { x: 40, z: 74 },
  { x: 120, z: 74 },
];

/** Natsuki's body (the VRoid in `public/anime/`). */
export const NATSUKI_MODEL = 'victoria.vrm';

/**
 * The tree in the Root Hall whose roots are people (`hirasakaDress.ts` grows it, `look.ts` puts the people in it,
 * wearing the island's own faces). Each person is at angle `a` round the trunk: upright in the bark with their feet at
 * height `y`, or lying in the roots (`r` metres out from the trunk's centre, feet toward it).
 */
export const ROOT_TREE = DEEP_SPOTS.tree;
export const ROOT_PEOPLE: readonly { a: number; y?: number; r?: number; kind: 'resident' | 'miner' | 'drowned' }[] = [
  { a: 0.35, y: 0.5, kind: 'resident' },
  { a: 1.5, y: 5.6, kind: 'drowned' },
  { a: 2.5, y: 2.4, kind: 'miner' },
  { a: 4.3, y: 0.7, kind: 'resident' },
  { a: 5.4, y: 3.8, kind: 'miner' },
  { a: 0.95, r: 5.4, kind: 'miner' },
  { a: 2.05, r: 6.2, kind: 'resident' },
  { a: 3.3, r: 5.2, kind: 'drowned' },
  { a: 4.1, r: 9.6, kind: 'miner' },
  { a: 5.0, r: 5.8, kind: 'resident' },
];

/** The Root Hall tree's trunk radius at height y (broad at the floor, narrowing into the roof). */
export function rootTrunkR(y: number): number {
  const t = Math.min(1, Math.max(0, (y + 1) / 22));
  return 3.1 + (1.4 - 3.1) * Math.pow(t, 0.8);
}

/** Every pickup that must stand at least 8 m from every other (the tests check it). */
export function pickups(): { id: string; at: Spot }[] {
  return [
    ...TAPES.map((t, i) => ({ id: `tape${i}`, at: t })),
    ...PHOTOS.map((p, i) => ({ id: `photo${i}`, at: p })),
    { id: 'key', at: JOBS.key.key },
    { id: 'comb', at: COMB },
    { id: 'boilerKey', at: JOBS.steam.boilerKey },
    ...JOBS.steam.coal.map((c, i) => ({ id: `coal${i}`, at: c })),
    { id: 'ladles', at: LADLES },
    ...UMIBOZU.parts.map((p, i) => ({ id: `part${i}`, at: p })),
    ...TOOL_IDS.map((t) => ({ id: t, at: TOOLS[t] as Spot })),
  ];
}

/** Every named spot (for the reachability test and the look script). */
export function allSpots(): { id: string; at: Spot }[] {
  return [
    ...pickups(),
    { id: 'boiler', at: JOBS.steam.boiler },
    { id: 'shutter', at: JOBS.air.shutter },
    { id: 'fan', at: JOBS.air.fan },
    { id: 'winch', at: UMIBOZU.winch },
    { id: 'cageTop', at: CAGE.top },
    { id: 'cageBottom', at: CAGE.bottom },
    { id: 'aditDoor', at: ADIT.door },
    { id: 'aditOut', at: ADIT.out },
    { id: 'bath', at: BATH },
    ...OBSTACLES.map((o) => ({ id: `ob:${o.id}`, at: o.at })),
    ...Object.entries(DEEP_SPOTS)
      .filter(([, s]) => 'y' in s)
      .map(([k, s]) => ({ id: k, at: s as Spot })),
    ...CLIMB_MARKS.map((m) => ({ id: `mark:${m.id}`, at: m.at })),
    { id: 'rockTurn', at: ROCK.turn },
    ...ROCK.winches.map((w, i) => ({ id: `winch${i}`, at: w })),
    ...SHRINES.map((s) => ({ id: `shrine:${s.id}`, at: s as Spot })),
    ...WALL_BUYS.map((w) => ({ id: `buy:${w.id}`, at: w as Spot })),
    ...WORKBENCHES.map((w) => ({ id: `bench:${w.id}`, at: w as Spot })),
    ...SIDES.map((s) => ({ id: `side:${s.id}`, at: s as Spot })),
    { id: 'heightsFoot', at: HEIGHTS.stairFoot },
    { id: 'heightsHead', at: HEIGHTS.stairHead },
  ];
}
