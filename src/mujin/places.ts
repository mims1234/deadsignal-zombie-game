/**
 * MUJIN, the unmanned station: where everything is (no THREE), shared by the map (`world/layout/mujin.ts`), the loop
 * (`loop.ts`), the co-op simulation, the station's infected (`enemies/zombie.ts`) and the screen (`runtime.ts`).
 *
 * x runs east, z south. The tracks run east-west through the middle: platform 1 on the north side (the station house
 * behind it), platform 2 on the south side, a footbridge over both at the west end, the level crossing at the east end.
 *
 *   north-west   the grass field (the White Shape)            sealed third
 *   north        the station house: ticket hall, waiting room, the plaza behind it
 *   west         the tunnel the trains come out of
 *   south        the shuttered shopping street                sealed first
 *   south-east   the shrine and its salt circle                sealed second
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
  /** The platform bell, and the All Clear handle under it. */
  bell: { x: -3.5, z: -7.4 },
  /** The payphone in the ticket hall. */
  payphone: { x: -12.4, z: -14 },
  /** The waiting-room bench (the Bench Sitter's seat, where Ren is brought). */
  bench: { x: 9, z: -15.5 },
  /** The shrine's salt circle: a marked player clears the Tall Lady's mark standing in it. */
  salt: { x: 39, z: 23, r: 2.4 },
  /** Where the dawn train's door opens (track 1, beside platform 1). */
  trainDoor: { x: 0, z: -3.4 },
  /** The far platform, where Ren stands when she is the change. */
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
 * The places that can be wrong. Every one is something the squad can report (hold E near it): a report at the place
 * where this loop's change is counts; a report anywhere else is a wrong read. `r`: how close you must stand.
 */
export const SPOTS = [
  { id: 'clock', name: 'THE STATION CLOCK', x: -5, y: 3.1, z: -8.25, r: 4.5 },
  { id: 'timetable', name: 'THE TIMETABLE', x: -10.5, y: 1.8, z: -8.25, r: 3 },
  { id: 'poster', name: 'THE POSTER', x: -13.4, y: 1.7, z: -17.5, r: 3 },
  { id: 'mapboard', name: 'THE AREA MAP', x: -7, y: 1.7, z: -21.3, r: 3 },
  { id: 'umbrellas', name: 'THE UMBRELLA STAND', x: -1.6, y: 0.5, z: -20.2, r: 2.6 },
  { id: 'gates', name: 'THE TICKET GATES', x: -5, y: 0.6, z: -10.6, r: 3.6 },
  { id: 'lostprop', name: 'LOST PROPERTY', x: 2.6, y: 1.3, z: -18.5, r: 2.6 },
  { id: 'bench', name: 'THE WAITING-ROOM BENCH', x: 9, y: 0.6, z: -15.5, r: 3.2 },
  { id: 'window', name: 'THE WAITING-ROOM WINDOW', x: 10, y: 1.6, z: -8.6, r: 3.2 },
  { id: 'vending', name: 'THE VENDING MACHINE', x: 17.5, y: 1, z: -8, r: 2.8 },
  { id: 'sign', name: 'THE STATION SIGN', x: 12, y: 2.5, z: -4.4, r: 4.5 },
  { id: 'speaker', name: 'THE PLATFORM SPEAKER', x: 2, y: 3.2, z: -6.2, r: 4 },
  { id: 'rows', name: 'THE PASSENGERS', x: 20, y: 0.9, z: -5, r: 4.5 },
  { id: 'bridge', name: 'THE FOOTBRIDGE', x: -21.8, y: 5.3, z: 0, r: 5 },
  { id: 'body', name: 'THE BODY ON PLATFORM 2', x: -12, y: 0.4, z: 6.6, r: 3 },
  { id: 'footprints', name: 'THE FOOTPRINTS', x: 8, y: 0.32, z: 7.6, r: 3 },
  { id: 'tunnel', name: 'THE TUNNEL', x: -42, y: 2, z: 0, r: 7 },
  { id: 'crossing', name: 'THE LEVEL CROSSING', x: 39, y: 1.5, z: -5.5, r: 5 },
  { id: 'shutter', name: 'THE SHOP SHUTTER', x: -6, y: 1.4, z: 17.6, r: 3.2 },
  { id: 'rope', name: 'THE SHRINE ROPE', x: 39, y: 2.3, z: 28.2, r: 3.4 },
  // only there on the loops she is (the station counts her as out of place)
  { id: 'ren', name: 'THE GIRL ON PLATFORM 2', x: 18, y: 1, z: 6.4, r: 2.6 },
] as const;
export type SpotId = (typeof SPOTS)[number]['id'];
export const SPOT_INDEX: Record<SpotId, number> = Object.fromEntries(SPOTS.map((s, i) => [s.id, i])) as Record<SpotId, number>;

/**
 * The areas the night takes, in the order it takes them (a wrong read seals the next). Each is closed by fog across
 * its gaps (`gaps`: wall boxes); anyone inside when it closes is put back on platform 1. `rect` is the area itself.
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
