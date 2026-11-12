/**
 * ZARYA: where everything is (no THREE), shared by the map (`world/layout/zarya*.ts`), the story (`story.ts`), the
 * infected (`director.ts`), the zone switch (`world/zones.ts`) and the screen (`runtime.ts`).
 *
 * Phase 2 of the map plan: the first two of the town's ten zones, and Act I of its story. x runs east, z south (north
 * is -z). Laid out from the reference views in `research_notes/zarya/refs` (`scripts/zarya-refs.mjs`).
 *
 *   ZARYA SQUARE   150 x 100 m of paving under snow. The tram line along the north edge with its stop and tram No. 1;
 *                  the Palace of Culture on the west side; the ice town in the south-west; the town fir tree in the
 *                  middle with the stage south of it; two rows of fair kiosks between the tree and the store; panel
 *                  blocks behind a fence to the south.
 *   UNIVERMAG      the department store on the east side, ground floor: one hall of counters round an atrium fir tree
 *                  and a still escalator, the tea room in the north-east corner, the cloakroom and the staff rooms
 *                  along the south. The staff stairs go down to
 *   THE SHELTER    the bomb shelter under the store, built beside the map (`ZARYA_SPACE`) and reached by the stairs:
 *                  a vestibule, the blast door, the main room, the watch room, the storeroom.
 */
import type { Zone } from '../world/zones';
import { inRect, yawTo as yawToward, type Person, type PersonRole, type Rect, type Spot, type ZaryaZone } from './types';
import { BANYA, banyaPeople } from './zones/banya';
import { BERLOGA, berlogaPeople } from './zones/berloga';
import { CANTEEN, canteenPeople } from './zones/canteen';
import { DEPOT, depotPeople } from './zones/depot';
import { DK, dkPeople } from './zones/dk';
import { DVOR, dvorPeople } from './zones/dvor';
import { GARAGES, garagesPeople } from './zones/garages';
import { INSTITUTE, institutePeople } from './zones/institute';
import { RYNOK, rynokPeople } from './zones/rynok';
import { TETS, tetsPeople } from './zones/tets';
import { UPSTAIRS, upstairsPeople } from './zones/upstairs';

export { inRect };
export type { Person, PersonRole, Rect, Spot, ZaryaZone };
export { BANYA, BERLOGA, CANTEEN, DEPOT, DK, DVOR, GARAGES, INSTITUTE, RYNOK, TETS, UPSTAIRS };

/** The street map: the whole town, ten zones. */
export const ZARYA_BOUNDS = { minX: -230, maxX: 246, minZ: -190, maxZ: 172 };
/** All the space there is: the street map, and the interiors built beside it (the shelter, the canteen, the Berloga hall, the store's second floor). */
export const ZARYA_SPACE = { minX: -230, maxX: 700, minZ: -190, maxZ: 172 };
/** The middle band the first two zones were built in (the square and the store measure themselves against it). */
export const CORE = { minX: -104, maxX: 146, minZ: -70, maxZ: 72 };

/**
 * The zones of scenery: a zone is drawn while the player is in it, and a neighbour only while the player is within
 * sight of it (`world/zones.ts`). The three interiors draw nothing else.
 */
export const ZARYA_ZONES: readonly Zone<ZaryaZone>[] = [
  { id: 'square', name: 'ZARYA SQUARE', x0: -104, z0: -70, x1: 68, z1: 72, near: ['store', 'dk', 'dvor'] },
  { id: 'store', name: 'UNIVERMAG', x0: 68, z0: -70, x1: 146, z1: 72, near: ['square', 'rynok'], inside: { x0: 70, z0: -30, x1: 140, z1: 25, reach: 20, of: ['rynok'] } }, // the building (STORE): no window on the Rynok
  { id: 'rynok', name: 'RYNOK', ...RYNOK.rect, near: ['store', 'depot', 'garages'], reach: 40 },
  // the north blocks hide the square from the yards: it is drawn only near the archway
  { id: 'dvor', name: 'DVOR', ...DVOR.rect, near: ['square', 'garages'], reach: 32 },
  { id: 'garages', name: 'GARAGES', ...GARAGES.rect, near: ['dvor', 'rynok'] },
  { id: 'depot', name: 'TRAM DEPOT', ...DEPOT.rect, near: ['rynok', 'banya'] },
  // the Palace is deep: from its hall and its museum the square is behind walls, and is only drawn from the foyer
  { id: 'dk', name: 'DOM KULTURY', ...DK.rect, near: ['square'], reach: 34 },
  { id: 'banya', name: 'BANYA AND POND', ...BANYA.rect, near: ['depot', 'tets'] },
  { id: 'tets', name: 'HEATING PLANT', ...TETS.rect, near: ['banya', 'institute'] },
  { id: 'institute', name: 'THE INSTITUTE', ...INSTITUTE.rect, near: ['tets'] },
  { id: 'shelter', name: 'THE SHELTER', x0: 350, z0: -40, x1: 410, z1: 40, near: [] },
  { id: 'canteen', name: 'THE CANTEEN', x0: CANTEEN.rect.x0 - 8, z0: -40, x1: CANTEEN.rect.x1 + 8, z1: 40, near: [] },
  { id: 'berloga', name: 'THE BERLOGA HALL', x0: BERLOGA.rect.x0 - 8, z0: -40, x1: BERLOGA.rect.x1 + 8, z1: 40, near: [] },
  // the Univermag's second floor: up the store's escalator, and on up from it to the canteen
  { id: 'upstairs', name: 'UNIVERMAG, SECOND FLOOR', x0: UPSTAIRS.rect.x0 - 8, z0: -40, x1: UPSTAIRS.rect.x1 + 8, z1: 40, near: [] },
];

/** What opens a gate (`story.ts` says when each is true). */
export type GateKey = 'act2' | 'cutDepot' | 'cutNorth' | 'cutWest' | 'tickets' | 'pond' | 'code';
/**
 * The gates in the walls between zones (the frame builds the walls and the gates: `world/layout/zarya.ts`). `along`
 * is the way the wall runs: 'x' = east-west (walkers pass north-south), 'z' = north-south. A zone's layout keeps the
 * ground clear for 8 m on its side of each of its gates.
 */
export const GATES: readonly { id: string; name: string; x: number; z: number; along: 'x' | 'z'; half: number; zones: readonly [ZaryaZone, ZaryaZone]; opens: GateKey; verb?: string }[] = [
  { id: 'archway', name: 'THE ARCHWAY', x: -23, z: 72, along: 'x', half: 3.5, zones: ['square', 'dvor'], opens: 'act2' },
  // (the line gate that let the track and its pavement through from the store to the Rynok is gone: Line One passes
  // that wall under a covered way, `LINE_PORTALS` 'line', and the service lane is the way on foot)
  { id: 'lane', name: 'THE SERVICE LANE', x: 146, z: 32, along: 'z', half: 3.5, zones: ['store', 'rynok'], opens: 'act2' },
  { id: 'depot', name: 'THE DEPOT GATE', x: 196, z: -70, along: 'x', half: 3, zones: ['rynok', 'depot'], opens: 'cutDepot', verb: 'CUT THE CHAIN' },
  { id: 'garagesN', name: 'THE GARAGES, NORTH GATE', x: 196, z: 72, along: 'x', half: 3, zones: ['rynok', 'garages'], opens: 'cutNorth', verb: 'CUT THE CHAIN' },
  { id: 'garagesW', name: 'THE GARAGES, WEST GATE', x: 100, z: 122, along: 'z', half: 3, zones: ['dvor', 'garages'], opens: 'cutWest', verb: 'CUT THE CHAIN' },
  { id: 'palace', name: 'THE PALACE DOORS', x: -84, z: -23, along: 'z', half: 1.9, zones: ['square', 'dk'], opens: 'tickets' },
  { id: 'pond', name: 'THE POND ROAD GATE', x: 146, z: -130, along: 'z', half: 3.5, zones: ['depot', 'banya'], opens: 'pond' },
  { id: 'plant', name: 'THE PLANT ROAD', x: 20, z: -130, along: 'z', half: 4, zones: ['banya', 'tets'], opens: 'pond' },
  { id: 'checkpoint', name: 'THE CHECKPOINT', x: -104, z: -130, along: 'z', half: 3.5, zones: ['tets', 'institute'], opens: 'code' },
];

/** What a tram stop waits for before Line One calls at it. */
export type StopKey = 'always' | 'act2' | 'cutDepot' | 'pond';
/**
 * Line One's stops, in the order Zina drives them (a loop). A tram stands at each (the frame builds the stop and the
 * car: the car lies east-west with its doors on the side `door` is on, two cars coupled at `x`). `door` is where a
 * player boards and gets off: in front of the second car's near door, 2.7 m east of the coupling (the ride back is
 * asked for 6 m west of it, in front of the first car's near door). A zone's layout keeps a strip 44 m by 9 m clear
 * round its stop.
 */
export const STOPS: readonly { id: string; name: string; zone: ZaryaZone; x: number; z: number; door: Spot; opens: StopKey }[] = [
  { id: 'square', name: 'ZARYA SQUARE', zone: 'square', x: 24, z: -54, door: { x: 26.7, z: -52 }, opens: 'always' },
  { id: 'rynok', name: 'RYNOK', zone: 'rynok', x: 194, z: -54, door: { x: 196.7, z: -52 }, opens: 'act2' },
  { id: 'depot', name: 'TRAM DEPOT', zone: 'depot', x: 176, z: -128, door: { x: 178.7, z: -126 }, opens: 'cutDepot' },
  { id: 'pond', name: 'POND ROAD', zone: 'banya', x: 76, z: -82, door: { x: 78.7, z: -80 }, opens: 'pond' },
  { id: 'plant', name: 'INSTITUTE ROAD', zone: 'tets', x: -60, z: -82, door: { x: -57.3, z: -80 }, opens: 'pond' },
  { id: 'dvor', name: 'STROITELEY STREET', zone: 'dvor', x: -24, z: 165, door: { x: -21.3, z: 163 }, opens: 'act2' },
];

/**
 * Where Line One leaves a zone: the tram's way between zones, never a walker's (the gates are the walkers' ways). Each
 * is a concrete portal over the track, the rails and the wire running into its mouth, a lamp over it, a red signal
 * beside it, and a steel grille shut across the mouth (Zina opens it from the cab; a walker finds bars). The track runs
 * east-west through every one. The portal fills x0..x1 (a collider: nobody stands in its mouth) and z0..z1 across the
 * track at `z`. `open` is the face the mouth is in: 'east' or 'west' for a tunnel mouth whose back stands against a
 * wall or the dark (the line goes on under the town), 'both' for a short covered way that carries the line through the
 * wall between two zones, grilled at each end (`zones` = the zone on its west, the zone on its east). Built by the frame
 * (`world/layout/zarya.ts`), which runs each zone's rails up to its portals. The depot's line ends the other way, at a
 * buffer stop west of the tram: the pond road's gate beside it is a road, not the line.
 */
export const LINE_PORTALS: readonly { id: string; x0: number; x1: number; z: number; z0: number; z1: number; open: 'east' | 'west' | 'both'; zones: readonly [ZaryaZone, ZaryaZone] }[] = [
  // the square's line goes west under the Palace's north wing
  { id: 'square', x0: -86, x1: -84, z: -54, z0: -60.6, z1: -48, open: 'east', zones: ['square', 'square'] },
  // through the wall between the store's pavement and the Rynok's (the service lane is the way on foot)
  { id: 'line', x0: 142, x1: 150, z: -54, z0: -60.6, z1: -46.6, open: 'both', zones: ['store', 'rynok'] },
  // the depot's line comes in from outside the town through its east wall
  { id: 'depot', x0: 242.2, x1: 244.2, z: -128, z0: -133, z1: -123, open: 'west', zones: ['depot', 'depot'] },
  // the pond road's stop: east under the depot's street, west through the wall to the plant's street
  { id: 'banya', x0: 144, x1: 146, z: -82, z0: -88, z1: -76, open: 'west', zones: ['banya', 'banya'] },
  { id: 'plant', x0: 16, x1: 24, z: -82, z0: -88, z1: -76, open: 'both', zones: ['tets', 'banya'] },
  // the Institute road's stop: west under the Institute's grounds
  { id: 'institute', x0: -104, x1: -102, z: -82, z0: -88, z1: -76, open: 'east', zones: ['tets', 'tets'] },
  // Stroiteley Street: the line runs the street's length, out under the town at both ends
  { id: 'dvorW', x0: -104, x1: -102.4, z: 165, z0: 159.6, z1: 170.1, open: 'east', zones: ['dvor', 'dvor'] },
  { id: 'dvorE', x0: 98.4, x1: 100, z: 165, z0: 159.6, z1: 170.1, open: 'west', zones: ['dvor', 'dvor'] },
];

/** The square's paving. */
export const SQUARE: Rect = { x0: -80, z0: -45, x1: 66, z1: 55 };
/** The store's outer walls, and how high its ground floor is. */
export const STORE = { x0: 70, z0: -30, x1: 140, z1: 25, h: 5.2, top: 15, strip: 14 } as const;
/** The shelter: the whole of it, and its rooms. */
export const SHELTER = {
  x0: 360,
  z0: -6,
  x1: 397,
  z1: 6,
  h: 3.2,
  /** The blast door: the wall it is in, and the opening. */
  doorX: 368,
  doorHalf: 1.1,
  vestibule: { x0: 360, z0: -3, x1: 368, z1: 3 },
  main: { x0: 368, z0: -6, x1: 388, z1: 6 },
  watch: { x0: 388, z0: -6, x1: 397, z1: 0 },
  storeroom: { x0: 388, z0: 0, x1: 397, z1: 6 },
} as const;

export type KioskKind = 'tea' | 'fireworks' | 'toys' | 'pastries' | 'ski' | 'blini' | 'mittens' | 'souvenirs';
/** The fair: two rows facing each other across an aisle (face = the way a kiosk's counter looks, +1 east, -1 west). */
export const KIOSKS: readonly { kind: KioskKind; x: number; z: number; face: 1 | -1 }[] = [
  { kind: 'tea', x: 20, z: -21, face: 1 },
  { kind: 'fireworks', x: 20, z: -10, face: 1 },
  { kind: 'toys', x: 20, z: 1, face: 1 },
  { kind: 'pastries', x: 20, z: 12, face: 1 },
  { kind: 'ski', x: 34, z: -21, face: -1 },
  { kind: 'blini', x: 34, z: -10, face: -1 },
  { kind: 'mittens', x: 34, z: 1, face: -1 },
  { kind: 'souvenirs', x: 34, z: 12, face: -1 },
];

/** Lamp posts with a horn loudspeaker each (Nina's wire). */
export const LAMPS: readonly Spot[] = [
  { x: -62, z: -22 }, { x: -38, z: -34 }, { x: -36, z: 8 }, { x: -22, z: 40 }, { x: 4, z: 36 }, { x: 8, z: -40 },
  { x: 27, z: -30 }, { x: 27, z: 22 }, { x: 50, z: -14 }, { x: 50, z: 18 }, { x: -60, z: 10 }, { x: 44, z: 46 }, { x: 56, z: -40 },
];

export const ZARYA = {
  /** Where the squad's van stands and where they get out of it, at the north-west corner by the Palace. */
  van: { x: -66, z: -39 },
  start: { x: -60, z: -35 },
  /** The town fir tree and the fence round it; the junction box its lights run from (the tram's spare fuse is in it). */
  tree: { x: -8, z: -2, r: 6 },
  junction: { x: -1.4, z: -2 },
  /** The stage south of the tree, open to the south. */
  stage: { x: -8, z: 14, w: 12, d: 7, h: 1 },
  clock: { x: 4, z: -24 },
  /** The small fir at the edge of the fair, and the red sack under it. */
  sackFir: { x: 46, z: 36 },
  sack: { x: 44.4, z: 37.2 },
  /** The ice town: its walls, the slide (tower at its west end, running east), where a sack is hung on it. */
  ice: { x0: -78, z0: 16, x1: -34, z1: 52 },
  slide: { x0: -70, x1: -46, z: 40, top: 4.2, w: 3 },
  hook: { x: -44.5, z: 40 },
  /** Where the bear comes from: behind the ice town. */
  bearDen: { x: -72, z: 50 },
  /** The Palace of Culture (shut: Act III). */
  palace: { x0: -104, z0: -48, x1: -84, z1: 2 },
  /** The tram line: the track, the stop, tram No. 1 standing at it, its cab and its doors, the stop's fuse box. */
  trackZ: -54,
  stop: { x: -4, z: -49.2 },
  tram: { x0: 8, x1: 40, z: -54 },
  cab: { x: 38.6, z: -52.2 },
  tramDoor: { x: 26.7, z: -52 }, // in front of the second car's near door (as `STOPS` square's door)
  fuseBox: { x: -10.5, z: -50.4 },
  /** Where Ded Moroz stands at the act's end: on the track the tram has just left. */
  morozko: { x: -30, z: -54 },

  // ---- the Univermag ----
  /** The main doors in the west wall (z of each), and the one whose shutter has jammed. */
  mainDoors: [-8, -2, 4] as readonly number[],
  shutter: { x: 70, z: 4 },
  /** The shutter's plug, on the wall beside it. */
  plug: { x: 71.2, z: 7.4 },
  atriumTree: { x: 100, z: -6, r: 3.2 },
  escalator: { x0: 110, z0: -16, x1: 114, z1: -2 },
  /** Gena, by the foot of the escalator, and the girl he has by the hood. */
  gena: { x: 112, z: 0.6 },
  girl: { x: 110.9, z: 1.3 },
  housewares: { x: 80, z: -23.4 },
  sports: { x: 97.5, z: -23.4 },
  /** The tea room, and Zina's table. */
  teaRoom: { x0: 131, z0: -30, x1: 140, z1: -14 },
  zinaTable: { x: 134.5, z: -20 },
  noticeboard: { x: 100.5, z: 13.4 },
  soda: [105.5, 108, 110.5, 113] as readonly number[],
  /** The staff rooms along the south: a corridor off the hall, the maintenance room, the stair room. */
  staffDoor: { x: 117.5, z: 14 },
  corridor: { x0: 114, z0: 14, x1: 122, z1: 25 },
  maintenance: { x0: 122, z0: 14, x1: 131.5, z1: 25 },
  stairRoom: { x0: 131.5, z0: 14, x1: 140, z1: 25 },
  bench: { x: 126.8, z: 15.6 },
  /** The door from the service lane into the stair room (Nina holds it), and the head of the stairs down (an opening in
   * the floor along the east wall, the flight going down northwards: `world/layout/zaryaStore.ts` `stairPit`). */
  laneDoor: { x: 135.5, z: 25 },
  stairHead: { x: 137.95, z: 23.15 },

  // ---- the shelter ----
  stairFoot: { x: 362, z: 0 },
  blastDoor: { x: 368, z: 0 },
  /** Past this line a walker is inside the main room (the door seals behind the last of them). */
  sealLine: 371.5,
  release: { x: 369.6, z: 5.4 },
  table: { x: 378, z: 0.6 },
  nina: { x: 374.5, z: -1.4 },
  kostya: { x: 381.5, z: -2.6 },
  rack: { x: 395.4, z: -3 },
  kit: { x: 393, z: 4.6 },
  /**
   * The side stories' places on the square and in the store (`sidestories.ts`): the teacher's bag on the ground before
   * the stage; three lost mittens (on the tree's fence, on the mitten stall's counter, in the ice town); one coat's
   * letter on the store's cloakroom counter; Lida by the tea kiosk and the Sorokins by the slide (`people.ts` names
   * them by these same places).
   */
  side: {
    bag: { x: -11, z: 18.4 },
    mittenFence: { x: -14.6, z: -1.2 },
    mittenKiosk: { x: 32.3, z: 1.4 },
    mittenIce: { x: -47.5, z: 33.5 },
    letter: { x: 89.5, z: 14 },
    lida: { x: 22.5, z: -21 },
    sorokins: { x: -40, z: 33 },
  },
} as const;

/** The speakers on the wire: every lamp post on the square, and the boxes in the store and the shelter. */
export const SPEAKERS: readonly Spot[] = [...LAMPS, { x: 100, z: 13 }, { x: 131, z: -14 }, { x: 382, z: -5.6 }];

/** Under the shelter's ceiling. */
export const inShelter = (x: number): boolean => x > 350 && x < 410;
/** In one of the interiors built beside the map (the shelter, the canteen, the Berloga hall, the store's second floor). */
export const inInterior = (x: number): boolean => x > ZARYA_BOUNDS.maxX + 20;
/** Inside the store's walls. */
export const inStore = (x: number, z: number): boolean => inRect(STORE, x, z);
/** Out on the square (anywhere west of the store's front, on the street map). */
export const onSquare = (x: number, z: number): boolean => x < STORE.x0 && x > CORE.minX && z > CORE.minZ && z < CORE.maxZ;

// ---------------------------------------------------------------------------------------------------------------------
// the people of the town: where each one stands (the same for every player, so their colliders and their looks agree)
// ---------------------------------------------------------------------------------------------------------------------

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Places nobody is stood: the paths a squad and a horde need kept clear, and solid things. */
function keptClear(x: number, z: number): boolean {
  const Z = ZARYA;
  // the tree and its fence, the stage, the kiosks and the aisle between them
  if (Math.hypot(x - Z.tree.x, z - Z.tree.z) < Z.tree.r + 1.2) return true;
  if (Math.abs(x - Z.stage.x) < Z.stage.w / 2 + 1 && Math.abs(z - Z.stage.z) < Z.stage.d / 2 + 1) return true;
  for (const k of KIOSKS) if (Math.abs(x - k.x) < 2.8 && Math.abs(z - k.z) < 3.6) return true;
  // the ice town's walls and slide (people stand inside it, but not in its walls)
  if (inRect(Z.ice, x, z, 1) && (Math.abs(x - Z.ice.x0) < 2 || Math.abs(x - Z.ice.x1) < 2 || Math.abs(z - Z.ice.z0) < 2 || Math.abs(z - Z.ice.z1) < 2)) return true;
  if (x > Z.slide.x0 - 4 && x < Z.slide.x1 + 3 && Math.abs(z - Z.slide.z) < 3.2) return true;
  // the stair down the slide tower's north side, and the rope at its foot
  if (Math.abs(x - (Z.slide.x0 - 2)) < 2 && z > Z.slide.z - 9 && z < Z.slide.z) return true;
  // the foot of the slide and its hook: the bear's ground
  if (Math.hypot(x - Z.hook.x, z - (Z.hook.z + 1)) < 5) return true;
  // lamp posts, the clock, the sack
  for (const l of LAMPS) if (Math.hypot(x - l.x, z - l.z) < 1.4) return true;
  if (Math.hypot(x - Z.clock.x, z - Z.clock.z) < 1.4) return true;
  if (Math.hypot(x - Z.sackFir.x, z - Z.sackFir.z) < 4) return true;
  if (Math.hypot(x - Z.van.x, z - Z.van.z) < 6) return true;
  // the stop's platform edge and the store's doors
  if (z < -47.5) return true;
  if (x > 60 && Math.abs(z + 2) < 11) return true;
  return false;
}

let cache: Person[] | null = null;
/** Everyone in the town's first two zones: about 260 on the square, 70 in the store, and the handful with names. */
export function people(): readonly Person[] {
  if (cache) return cache;
  const out: Person[] = [];
  const r = lcg(1957);
  const yawTo = yawToward;
  const free = (x: number, z: number, gap: number): boolean => out.every((p) => Math.abs(p.x - x) > gap || Math.abs(p.z - z) > gap || Math.hypot(p.x - x, p.z - z) > gap);
  const add = (x: number, z: number, yaw: number, role: PersonRole = 'towns', solid = true, y = 0): void => {
    out.push({ x, z, y, yaw, role, seed: r(), solid });
  };

  // ---- the square: knots of people where there was something to look at, and a scatter between ----
  const knot = (cx: number, cz: number, n: number, spread: number, lookX: number, lookZ: number, kids = 0.15): void => {
    for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * spread;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (!inRect(SQUARE, x, z, -2) || keptClear(x, z) || !free(x, z, 1.15)) continue;
      add(x, z, yawTo(x, z, lookX, lookZ) + (r() - 0.5) * 0.7, r() < kids ? 'child' : 'towns');
      i++;
    }
  };
  const Z = ZARYA;
  knot(Z.stage.x, Z.stage.z + 11, 46, 9, Z.stage.x, Z.stage.z); // watching the stage
  knot(Z.tree.x, Z.tree.z - 12, 26, 8, Z.tree.x, Z.tree.z); // under the tree
  knot(27, -4, 34, 15, 27, -60, 0.2); // the fair's aisle (looking every way: yaw is jittered below)
  knot(-52, 30, 30, 12, -58, 40, 0.45); // in the ice town
  knot(-40, 33, 8, 4, -60, 40, 0.8); // watching the slide
  knot(-2, -44, 22, 9, 20, -54); // waiting for the tram
  knot(-66, -20, 16, 8, -84, -22); // the Palace steps
  knot(46, 26, 14, 8, 46, 36, 0.3); // near the little fir
  knot(56, -4, 18, 8, 70, -2); // going in and out of the store
  knot(-30, -18, 26, 16, -8, -2);
  knot(8, 40, 26, 14, -8, 14);
  // the fair's people look at their kiosks, not all one way
  for (const p of out) {
    if (Math.abs(p.x - 27) < 7 && Math.abs(p.z + 4) < 22) {
      const k = KIOSKS.reduce((best, q) => (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z) ? q : best));
      p.yaw = yawTo(p.x, p.z, k.x, k.z) + (r() - 0.5) * 0.5;
    }
  }
  // a kiosk keeper behind each counter
  for (const k of KIOSKS) add(k.x - k.face * 0.2, k.z + 0.4, yawTo(0, 0, k.face, 0), 'staff', false);
  // Ded Moroz on the stage, Zina in her cab
  add(Z.stage.x + 1.5, Z.stage.z - 0.5, yawTo(0, 0, 0, 1), 'moroz', true, Z.stage.h);
  add(Z.cab.x, Z.trackZ, yawTo(0, 0, 1, 0), 'zina', false, 0.9);

  // ---- the store: shoppers between the counters, assistants behind them ----
  const S = STORE;
  const shop = (n: number): void => {
    for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
      const x = S.x0 + 3 + r() * (S.x1 - S.x0 - 6);
      const z = S.z0 + 7.5 + r() * (S.strip - S.z0 - 11); // not in the strip along the noticeboard and the soda machines
      if (storeSolid(x, z) || !free(x, z, 1.3)) continue;
      // the way out of the staff rooms, the foot of the escalator and the doors are left clear
      if (Math.hypot(x - Z.staffDoor.x, z - Z.staffDoor.z) < 4 || Math.hypot(x - Z.gena.x, z - Z.gena.z) < 3.5 || (x < 76 && Math.abs(z + 2) < 10)) continue;
      add(x, z, r() * Math.PI * 2, r() < 0.12 ? 'child' : 'towns');
      i++;
    }
  };
  shop(52);
  for (const [x, z] of [[78, -26.2], [84, -26.2], [95, -26.2], [101, -26.2], [112, -26.2], [124, -26.2], [137.6, -22], [82, 17], [90, 17]] as const) add(x, z, yawTo(0, 0, x > 136 ? -1 : 0, x > 136 ? 0 : z > 0 ? -1 : 1), 'staff', false);
  // the guard under the shutter, the girl Gena has hold of
  add(71.4, Z.shutter.z, yawTo(0, 0, 1, 0), 'guard', true);
  add(Z.girl.x, Z.girl.z, yawTo(0, 0, -1, 0.4), 'girl', true);

  // ---- the shelter ----
  add(Z.nina.x, Z.nina.z, yawTo(Z.nina.x, Z.nina.z, Z.blastDoor.x, 0), 'nina', true);
  add(Z.kostya.x, Z.kostya.z, yawTo(Z.kostya.x, Z.kostya.z, Z.blastDoor.x, 0), 'kostya', true);
  for (const [seed, fn] of [[11, rynokPeople], [12, dvorPeople], [13, garagesPeople], [14, depotPeople], [15, dkPeople], [16, banyaPeople], [17, tetsPeople], [18, institutePeople], [19, berlogaPeople], [20, canteenPeople], [21, upstairsPeople]] as const) {
    const zr = lcg(1957 + seed * 7919);
    fn((x, z, yaw, role = 'towns', solid = true, y = 0) => out.push({ x, z, y, yaw, role, seed: zr(), solid }), zr);
  }
  cache = out;
  return out;
}

/** The store's fixed furniture, as rectangles nobody stands in (`world/layout/zaryaStore.ts` builds exactly these). */
export const STORE_BLOCKS: readonly (Rect & { kind: 'case' | 'rack' | 'crates' })[] = [
  { kind: 'case', x0: 77, z0: -9, x1: 87, z1: -7 },
  { kind: 'case', x0: 79, z0: 3, x1: 88, z1: 5 },
  { kind: 'rack', x0: 92, z0: 7, x1: 102, z1: 9 },
  { kind: 'case', x0: 117, z0: -9, x1: 127, z1: -7 },
  { kind: 'rack', x0: 119, z0: 2, x1: 129, z1: 4 },
  { kind: 'case', x0: 106, z0: 7, x1: 114, z1: 9 },
  { kind: 'crates', x0: 136.6, z0: -10, x1: 139.2, z1: -6 },
  { kind: 'crates', x0: 136.6, z0: 4, x1: 139.2, z1: 8 },
];
/** The store's columns. */
export const COLUMNS: readonly Spot[] = (() => {
  const out: Spot[] = [];
  for (const x of [82, 94, 106, 118, 130]) for (const z of [-18, -6, 6]) out.push({ x, z });
  return out;
})();

function storeSolid(x: number, z: number): boolean {
  const Z = ZARYA;
  for (const b of STORE_BLOCKS) if (inRect(b, x, z, 0.9)) return true;
  for (const c of COLUMNS) if (Math.abs(c.x - x) < 1.1 && Math.abs(c.z - z) < 1.1) return true;
  if (Math.hypot(x - Z.atriumTree.x, z - Z.atriumTree.z) < Z.atriumTree.r + 1) return true;
  if (inRect(Z.escalator, x, z, 1.2)) return true;
  if (inRect(Z.teaRoom, x, z, 0.8)) return true;
  // the departments along the north wall, behind their counters
  if (z < -22.6) return true;
  return false;
}
