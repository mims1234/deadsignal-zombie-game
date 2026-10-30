/**
 * MUJIN, the unmanned station: where everything is (no THREE), shared by the map (`world/layout/mujin.ts`), the loop
 * (`loop.ts`), the co-op simulation, the station's infected (`enemies/zombie.ts`) and the screen (`runtime.ts`).
 *
 * x runs east, z south. The tracks run east-west through the middle: platform 1 on the north side (the station house
 * behind it), platform 2 on the south side, a footbridge over both at the west end, the level crossing at the east end.
 *
 *   north-west   the grass field (the White Shape)            taken third
 *   north        the station house: ticket hall, waiting room, the plaza behind it
 *   west         the tunnel the trains come out of
 *   south        the shuttered shopping street                taken first
 *   south-east   the shrine and its salt circle                taken second
 */

export const MUJIN_BOUNDS = { minX: -50, maxX: 50, minZ: -36, maxZ: 36 };
/** The pocket room (one loop back) is built south of everything, out of sight. */
export const MUJIN_POCKET = { x0: -9, z0: 70, x1: 9, z1: 84 };
export const MUJIN_SPACE = { minX: -50, maxX: 50, minZ: -36, maxZ: 86 };

/** Platform tops (m). */
export const PLATFORM_Y = 0.3;
export const PLATFORMS = [
  { x0: -32, x1: 32, z0: -8.6, z1: -3.6 },
  { x0: -32, x1: 32, z0: 3.6, z1: 8.6 },
] as const;
/** The two tracks' centre lines (track 1 beside platform 1: the dawn train stops there). */
export const TRACK_Z = [-1.9, 1.9] as const;

export const MUJIN = {
  /** Where the squad wakes: platform 1, by the bench, facing the tracks. */
  start: { x: 4, z: -6.2 },
  /** The platform bell, beside the lamp board. */
  bell: { x: -3.5, z: -7.4 },
  /** The lamp board beside the bell: one lamp for each job done. */
  board: { x: 1, z: -8.15 },
  /** The payphone in the ticket hall. */
  payphone: { x: -12.4, z: -14 },
  /** The waiting-room bench (the Bench Sitter's seat, where Ren is brought). */
  bench: { x: 9, z: -15.5 },
  /** The shrine's salt circle: whoever the Tall Lady hunts is lost to her standing in it. */
  salt: { x: 39, z: 22.6, r: 1.8 },
  /** Where the dawn train's door opens (track 1, beside platform 1). */
  trainDoor: { x: 0, z: -3.4 },
  /** Where Ren waits on platform 2 after her last call. */
  ren: { x: 18, z: 6.4 },
  /** The pocket room: where a punched player wakes, and its door back. */
  pocketWake: { x: 0, z: 80 },
  pocketDoor: { x: 0, z: 71.2 },
  /** Where a player who comes back through the pocket's door arrives (platform 1, by the waiting room). */
  pocketReturn: { x: 9, z: -6 },
  /** The Stationmaster's beat, end to end along platform 1. */
  beat: [
    { x: -26, z: -6 },
    { x: 26, z: -6 },
  ],
} as const;

/**
 * The five jobs that get the station running again (`jobs.ts`), and where each is done. `r`: how close you must stand.
 *
 *   clock      the winding key lies in the tunnel mouth; wind the clock over the gates with it
 *   crossing   throw the three breakers by the level crossing, then hold the road while it powers up
 *   tickets    five lost tickets lie round the station; feed them into the ticket gates
 *   rope       cut down the shrine's black rope and tie a new one (a long hold, in the Tall Lady's ground)
 *   announce   start the announcement at the PA desk in the ticket hall, and hold the hall until it is done
 */
export const PLACES = {
  key: { x: -42.6, y: 0.3, z: 0.6, r: 2.4 },
  clock: { x: -5, y: 3.1, z: -8.25, r: 3.6 },
  breakers: [
    { x: 34.6, y: 1, z: -10, r: 2 },
    { x: 43.4, y: 1, z: -10, r: 2 },
    { x: 34.8, y: 1, z: -16, r: 2 },
  ],
  /** The road by the crossing, held while it powers up. */
  crossing: { x: 39, z: -9, r: 10 },
  gates: { x: -5, y: 0.6, z: -10.6, r: 3.6 },
  /** Where lost tickets can lie (five are dropped each run). */
  tickets: [
    { x: -24, z: -5.4 },
    { x: 26, z: 5.8 },
    { x: -9.5, z: -20.8 },
    { x: 12.5, z: -19.5 },
    { x: -28, z: 22 },
    { x: 6, z: 23 },
    { x: 30, z: -24 },
    { x: -10, z: -30 },
  ],
  rope: { x: 39, y: 2.3, z: 28.2, r: 3.4 },
  /** The PA desk in the ticket hall, and the hall held while the announcement plays. */
  mic: { x: 1.6, y: 1, z: -16, r: 2.2 },
  hall: { x: -4, z: -15, r: 9 },
} as const;

/**
 * The areas the night takes, in the order it takes them (one each time its clock runs out with no job done). A taken area
 * fills with the night's mist: anyone in it is hurt for as long as they stay. `gaps`: where its fence opens.
 */
export const SEALS = [
  { id: 'street', name: 'THE SHOPPING STREET', rect: { x0: -50, z0: 10.4, x1: 20.6, z1: 36 }, gaps: [{ x: 16, z: 10.4, hx: 2.2, hz: 0.3 }] },
  { id: 'shrine', name: 'THE SHRINE', rect: { x0: 21.4, z0: 12.4, x1: 50, z1: 36 }, gaps: [{ x: 39, z: 12.4, hx: 3.2, hz: 0.3 }] },
  { id: 'field', name: 'THE FIELD', rect: { x0: -50, z0: -36, x1: -18.4, z1: -12.4 }, gaps: [{ x: -18.4, z: -15, hx: 0.3, hz: 2.2 }] },
] as const;

/** Inside a sealed area's rectangle. */
export function inSeal(i: number, x: number, z: number): boolean {
  const r = SEALS[i]?.rect;
  return !!r && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
}

/** Is (x, z) inside any of the areas the bits in `sealed` name? */
export function sealedAt(sealed: number, x: number, z: number): boolean {
  for (let i = 0; i < SEALS.length; i++) if (sealed & (1 << i) && inSeal(i, x, z)) return true;
  return false;
}

/** Where the White Shape stands (the field) and its kin may stand. */
export const SHAPE_SPOTS = [
  { x: -40, z: -28 },
  { x: -30, z: -31 },
  { x: -44, z: -18 },
] as const;
