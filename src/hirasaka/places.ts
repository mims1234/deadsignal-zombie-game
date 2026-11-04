/**
 * HIRASAKA, the island that sealed its mine: where everything is (no THREE), shared by the map
 * (`world/layout/hirasaka.ts`), the story (`story.ts`), the co-op simulation, the island's infected
 * (`enemies/zombie.ts`) and the screen (`runtime.ts`).
 *
 * x runs east, z south. The island climbs from the sea in the south to the summit in the north, five tiers of concrete
 * stacked like the apartment blocks they carry, joined by flights of steps (the Hundred Steps up the middle, narrower
 * ones at the sides):
 *
 *   T0  THE SEAWALL    y 0      the pier (where you land), the sea gates, the mine head and its cage, the old adit
 *   T1  MARKET LANE    y 3.6    shuttered shops under awnings, the company store
 *   T2  THE SCHOOL     y 7.2    the school (its roof is the dance floor, level with T3) and the clinic
 *   T3  BLOCK 65       y 10.8   the great apartment block; its outside stair climbs to Genzō's room at y 18
 *   T4  THE SUMMIT     y 14.4   the shrine, the lighthouse, and the Sealing Stone at the head of the Hundred Steps
 *
 * The mine is built far to the east, out of sight across the sea (an underground area of its own, `floors.ts`): the
 * cage drops into the Galleries; they open into the Old Village, a whole drowned village in a cavern; past it the Root
 * Hall. The Slope climbs out of the Root Hall to the old adit at the foot of the island.
 */

export const HIRASAKA_BOUNDS = { minX: -64, maxX: 64, minZ: -52, maxZ: 52 };
/** The mine: walkable cells of its own, east of the island. */
export const MINE = { x0: 120, z0: -50, x1: 232, z1: 46 };
export const HIRASAKA_SPACE = { minX: -64, maxX: 236, minZ: -52, maxZ: 52 };

/** One storey of concrete. */
export const RISE = 3.6;
export const TIERS = [
  { id: 'seawall', name: 'THE SEAWALL', y: 0, z0: 22, z1: 44 },
  { id: 'market', name: 'MARKET LANE', y: 3.6, z0: 6, z1: 22 },
  { id: 'school', name: 'THE SCHOOL', y: 7.2, z0: -10, z1: 6 },
  { id: 'block', name: 'BLOCK 65', y: 10.8, z0: -26, z1: -10 },
  { id: 'summit', name: 'THE SUMMIT', y: 14.4, z0: -46, z1: -26 },
] as const;
/** The island's walkable width (the tiers run edge to edge). */
export const ISLAND_X = { x0: -58, x1: 58 } as const;

/** Which tier (x, z) is on (by z), -1 off the island. */
export function tierAt(x: number, z: number): number {
  if (x < ISLAND_X.x0 - 0.5 || x > ISLAND_X.x1 + 0.5) return -1;
  for (let i = 0; i < TIERS.length; i++) if (z >= TIERS[i]!.z0 - 0.01 && z <= TIERS[i]!.z1 + 0.01) return i;
  return z > 44 && z < 52 && Math.abs(x) < 5.5 ? 0 : -1;
}

/**
 * Flights of steps: each climbs from the tier below (`tier - 1`) onto `tier`, rising north against the retaining wall,
 * built out on the lower tier (12 steps of 0.3 m, 0.45 m deep: a 5.4 m run). `x` is its centre, `w` its width. The
 * Hundred Steps are the wide ones at x 0.
 */
export const STEP_RUN = 5.4;
export const FLIGHTS: readonly { tier: number; x: number; w: number; main?: boolean }[] = [
  { tier: 1, x: 0, w: 6, main: true },
  { tier: 1, x: -38, w: 3.6 },
  { tier: 1, x: 40, w: 3.6 },
  { tier: 2, x: 0, w: 6, main: true },
  { tier: 2, x: -52, w: 3.6 },
  { tier: 2, x: 30, w: 3.6 },
  { tier: 3, x: 0, w: 6, main: true },
  { tier: 3, x: 52, w: 3.6 },
  { tier: 4, x: 0, w: 6, main: true },
  { tier: 4, x: -52, w: 3.6 },
  { tier: 4, x: 32, w: 3.6 },
];

/** Block 65's outside stair: from T3 at its east foot it climbs west along the block's face to the rooftop room. */
export const BLOCK_STAIR = { xFoot: -16, xTop: -30, z: -20, w: 2.4, yFoot: 10.8, yTop: 18 } as const;
/** The ledge at the top of it, and Genzō's room on it. */
export const LEDGE = { x0: -42, x1: -30, z0: -22, z1: -17, y: 18 } as const;
/** The school: a tall hall on T2 whose roof (the dance floor) is level with T3, joined to it along the retaining wall. */
export const SCHOOL = { x0: -44, x1: -14, z0: -10, z1: -1, roofY: 10.8 } as const;

export const HIRASAKA = {
  /** Where you land: the end of the pier, facing the island. */
  start: { x: 0, z: 48.5 },
  pier: { x0: -5, x1: 5, z0: 44, z1: 51.5 },
  /** The cage at the mine head (T0, west), where it waits, and where it lands below. */
  cage: { x: -46, z: 32.5, r: 2.6 },
  cageBottom: { x: 128, z: 30 },
  /** The old adit at the foot of the island (T0, east), in the market tier's retaining wall: where the Slope comes out. */
  adit: { x: 46, z: 23.2 },
  aditOut: { x: 46, z: 26 },
  /** The Slope's head below: the door to the adit (on its landing, y 9). */
  slopeTop: { x: 125, z: -33, y: 9 },
  slopeDoor: { x: 122.4, z: -33 },
  /** The Sealing Stone: where it lies rolled back, and the head of the Hundred Steps it must cover. */
  stoneRest: { x: 7, z: -29.5 },
  stoneSeal: { x: 0, z: -28.4 },
  /** Where everyone pushing must stand (the stone's east side, between it and the head of the steps). */
  stonePush: { x: 4.6, z: -28.6, r: 3.6 },
  /** The lighthouse and its generator shed (T4, east). */
  lighthouse: { x: 46, z: -40 },
  /** The shrine (T4, west of the steps). */
  shrine: { x: 18, z: -41 },
} as const;

/**
 * The island's jobs before the descent (any order), and where each is done. `r`: how close you must stand.
 *
 *   key      Genzō's cage key on its nail in his room on Block 65's roof (T3, up the outside stair)
 *   light    start the lighthouse generator on the summit, then hold the summit while it catches
 *   gates    open the three sea gates along the seawall (T0) so the galleries drain; the waves come over
 */
export const PLACES = {
  key: { x: -37.6, y: 18, z: -19.6, r: 2.2 },
  generator: { x: 40, y: 14.4, z: -36, r: 2.4 },
  /** The summit held while the generator catches. */
  summit: { x: 34, z: -36, r: 13 },
  valves: [
    { x: -30, y: 0, z: 42.6, r: 2.2 },
    { x: 14, y: 0, z: 42.6, r: 2.2 },
    { x: 40, y: 0, z: 42.6, r: 2.2 },
  ],
  /** The peach tree in the Old Village, and Mio's hairpin in the Root Hall's roots. */
  peaches: { x: 186, z: 8, r: 3.2 },
  hairpin: { x: 189, z: -41, r: 2.4 },
  /** The gallery telephone (the hidden recording rings here once every photo is found). */
  phone: { x: 140, z: 26.6, r: 2.2 },
} as const;

/** Genzō's five tapes, where each lies. */
export const TAPES = [
  { x: -10.5, y: 0, z: 38.6, where: 'the pier hut' },
  { x: -40.4, y: 18, z: -19.4, where: "Genzō's room" },
  { x: 150, y: 0, z: 40, where: 'a coal face in the galleries' },
  { x: 202, y: 0, z: 19.5, where: 'a house in the Old Village' },
  { x: 174, y: 0, z: -24, where: 'the Root Hall' },
] as const;

/** The five photographs (the Easter egg: every one found and the gallery telephone rings). */
export const PHOTOS = [
  { x: -12.6, y: 0, z: 36.4, where: 'the pier hut' },
  { x: -20, y: 10.8, z: -5, where: 'the school roof' },
  { x: -41.2, y: 18, z: -21.2, where: "Genzō's room" },
  { x: 192, y: 0, z: 4.4, where: 'a house in the Old Village' },
  { x: 214, y: 0, z: -30, where: 'the Root Hall' },
] as const;

/**
 * The mine, as open rectangles carved out of the rock (`world/layout/hirasaka.ts` walls their outline and roofs them):
 * `h` is how high the roof is. Everything here is at y 0 except the Slope, which climbs to `HIRASAKA.slopeTop.y`.
 */
export const MINE_ROOMS = [
  // the cage's landing and the first gallery east
  { id: 'landing', x0: 122, z0: 24, x1: 134, z1: 36, h: 6 },
  { id: 'galleryA', x0: 134, z0: 27, x1: 170, z1: 33, h: 4.2 },
  // coal faces off it (the miners keep working)
  { id: 'faceN', x0: 144, z0: 33, x1: 154, z1: 44, h: 4 },
  { id: 'faceS', x0: 158, z0: 18, x1: 166, z1: 27, h: 4 },
  { id: 'phone', x0: 137, z0: 24, x1: 143, z1: 27, h: 4 },
  // the gallery north to the village
  { id: 'galleryB', x0: 166, z0: 6, x1: 172, z1: 33, h: 4.2 },
  // the Old Village: a cavern, a whole village in it
  { id: 'village', x0: 172, z0: -8, x1: 222, z1: 32, h: 16 },
  // down to the Root Hall
  { id: 'pass', x0: 190, z0: -18, x1: 198, z1: -8, h: 6 },
  { id: 'roothall', x0: 168, z0: -48, x1: 226, z1: -18, h: 20 },
  // the Slope: west out of the Root Hall, climbing all the way
  { id: 'slope', x0: 126, z0: -36, x1: 168, z1: -30, h: 5 },
  { id: 'slopeTop', x0: 121, z0: -37, x1: 128, z1: -29, h: 5 },
] as const;
/** The Slope's steps: from the Root Hall (x 168, y 0) west and up to its landing (x 128, y 9). */
export const SLOPE = { xFoot: 168, xTop: 128, z0: -36, z1: -30, y: 9 } as const;

/** Where in the mine (x, z) is, or null on the island. */
export function mineRoomAt(x: number, z: number): string | null {
  if (x < MINE.x0) return null;
  for (const r of MINE_ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.id;
  return null;
}

/** Is (x, z) in the mine? */
export const inMine = (x: number): boolean => x > MINE.x0 - 2;

/** Names for the places, said the first time you walk in (`runtime.ts`). */
export type PlaceId = 'seawall' | 'market' | 'school' | 'block' | 'summit' | 'galleries' | 'village' | 'roothall' | 'slope';
export function placeAt(x: number, y: number, z: number): PlaceId | null {
  const m = mineRoomAt(x, z);
  if (m) return m === 'village' ? 'village' : m === 'roothall' ? 'roothall' : m === 'slope' || m === 'slopeTop' ? 'slope' : 'galleries';
  if (inMine(x)) return null;
  const t = tierAt(x, z);
  if (t < 0) return null;
  void y;
  return TIERS[t]!.id as PlaceId;
}

/**
 * The storm surge on the climb (`story.ts`): the sea comes over the wall and climbs the island tier by tier. Each step
 * is the water's height and the seconds after the climb begins that it reaches it (it never reaches the summit).
 */
export const SURGE = [
  { y: 1.1, at: 30 },
  { y: 4.7, at: 95 },
  { y: 8.3, at: 170 },
  { y: 11.9, at: 260 },
] as const;
/** The water on the island before the surge (the sea round it). */
export const SEA_Y = -0.6;

/** Where the infected come up the sea wall (the drowned) and out of the water in the surge. */
export const SEA_SPOTS = [
  { x: -44, z: 43 },
  { x: -20, z: 43 },
  { x: 22, z: 43 },
  { x: 50, z: 43 },
] as const;

/**
 * Who wears what (VRoid models in `public/anime/`). Natsuki and the co-op crew are people; every kind of the island's
 * infected wears its own body (`ANIME_CAST.kinds`, dressed by `anime/looks.ts`).
 */
export const NATSUKI_MODEL = 'victoria.vrm';
