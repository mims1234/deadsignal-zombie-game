/**
 * Where the Asylum's purchasable loop lives on the map (pure data, no THREE): the zones, the doors between them, the
 * power lever, the perk machines, the wall chalks and the Pack-a-Punch. Coordinates match `world/layout/asylum.ts`
 * (+Z is the front of the grounds, the gate; -Z the back).
 *
 *   front     the front grounds, the admin block and the strips beside the ward ends (always open; the start, the LZ)
 *   westWard  the west ward wing           eastWard  the east ward wing
 *   yard      the walled yard between the wings
 *   cemetery  the west grounds             boiler    the east grounds and the boiler house (the power)
 *   back      the back walk, the chapel, the isolation block (the Matron, the Pack-a-Punch) and the morgue
 *
 * The zone walls (brick, iron gates, boarded doorways) are built by the layout; each zone is reachable only through its
 * doors in `ASYLUM_DOORS`, and `tests/asylumLoop.test.ts` checks that against the real colliders.
 */
import type { WeaponId } from '../types';
import type { PerkId } from './loopConfig';

export type ZoneId = 'front' | 'westWard' | 'eastWard' | 'yard' | 'cemetery' | 'boiler' | 'back';
export const ZONES: readonly ZoneId[] = ['front', 'westWard', 'eastWard', 'yard', 'cemetery', 'boiler', 'back'];

export const ZONE_NAMES: Record<ZoneId, string> = {
  front: 'THE FRONT GROUNDS',
  westWard: 'THE WEST WARD',
  eastWard: 'THE EAST WARD',
  yard: 'THE YARD',
  cemetery: 'THE CEMETERY',
  boiler: 'THE BOILER HOUSE',
  back: 'THE CHAPEL AND ISOLATION',
};

/** A point well inside each zone (tests flood from here). */
export const ZONE_ANCHORS: Record<ZoneId, { x: number; z: number }> = {
  front: { x: 0, z: 38 },
  westWard: { x: -22, z: 0 },
  eastWard: { x: 22, z: 0 },
  yard: { x: 0, z: -10 },
  cemetery: { x: -33, z: -5 },
  boiler: { x: 35, z: 0 },
  back: { x: 0, z: -27 },
};

/** Lines the zone walls follow (shared with the layout so the two cannot drift apart). */
export const ZONE_LINES = {
  /** The brick walls between the side grounds and the front (z), from the perimeter to the ward corners. */
  frontZ: 15.2,
  /** The walls along the back walk (z), and their iron gates. */
  backZ: -22.1,
  /** The ward wings' outer walls (|x|) and inner walls (|x|), and their ends (z). */
  wardOuterX: 29,
  wardInnerX: 15,
  wardFrontZ: 10,
  /** The short walls closing the gaps between the ward wings and the admin block (z). */
  gapZ: 4.5,
} as const;

/** Which zone a point is in. */
export function zoneAt(x: number, z: number): ZoneId {
  const L = ZONE_LINES;
  if (z < L.backZ) return 'back';
  if (x < -L.wardOuterX && z < L.frontZ) return 'cemetery';
  if (x > L.wardOuterX && z < L.frontZ) return 'boiler';
  if (x <= -L.wardInnerX && z < L.wardFrontZ) return 'westWard';
  if (x >= L.wardInnerX && z < L.wardFrontZ) return 'eastWard';
  if (z < L.gapZ) return 'yard';
  return 'front';
}

export type DoorKind = 'door' | 'gate' | 'debris';

export interface DoorDef {
  id: string;
  /** What the prompt calls it. */
  kind: DoorKind;
  /** The two zones it joins. */
  zones: readonly [ZoneId, ZoneId];
  cost: number;
  /** Centre of the doorway (on the wall's centre line). */
  x: number;
  z: number;
  /** The direction the doorway spans: along X (in a wall running east-west) or along Z. */
  along: 'x' | 'z';
  width: number;
  height: number;
  /** A closed iron gate: bullets and sight pass between the bars. */
  seeThrough: boolean;
}

/** The buyable doors, in a fixed order (the loop state keeps one flag per door by index). Prices escalate inward. */
export const ASYLUM_DOORS: readonly DoorDef[] = [
  { id: 'westWardFront', kind: 'door', zones: ['front', 'westWard'], cost: 750, x: -22, z: 9.8, along: 'x', width: 1.8, height: 2.6, seeThrough: false },
  { id: 'eastWardFront', kind: 'door', zones: ['front', 'eastWard'], cost: 750, x: 22, z: 9.8, along: 'x', width: 1.8, height: 2.6, seeThrough: false },
  { id: 'adminYard', kind: 'debris', zones: ['front', 'yard'], cost: 1000, x: 0, z: 4.2, along: 'x', width: 2, height: 2.6, seeThrough: false },
  { id: 'westWardYard', kind: 'door', zones: ['westWard', 'yard'], cost: 1000, x: -15.2, z: -8.6, along: 'z', width: 1.6, height: 2.4, seeThrough: false },
  { id: 'eastWardYard', kind: 'door', zones: ['eastWard', 'yard'], cost: 1000, x: 15.2, z: -8.6, along: 'z', width: 1.6, height: 2.4, seeThrough: false },
  { id: 'westWardCemetery', kind: 'door', zones: ['westWard', 'cemetery'], cost: 1250, x: -28.8, z: -13.8, along: 'z', width: 1.6, height: 2.4, seeThrough: false },
  { id: 'eastWardBoiler', kind: 'door', zones: ['eastWard', 'boiler'], cost: 1250, x: 28.8, z: -13.8, along: 'z', width: 1.6, height: 2.4, seeThrough: false },
  { id: 'cemeteryBack', kind: 'gate', zones: ['cemetery', 'back'], cost: 1500, x: -42, z: ZONE_LINES.backZ, along: 'x', width: 3, height: 2.6, seeThrough: true },
  { id: 'yardBack', kind: 'gate', zones: ['yard', 'back'], cost: 2000, x: 5, z: ZONE_LINES.backZ, along: 'x', width: 3, height: 2.6, seeThrough: true },
];

/**
 * Doorways sealed for good (boarded over): they would join zones around their buyable doors. Same shape as a door.
 * The ward wings' doors toward the admin block, and their back doors onto the back walk.
 */
export const SEALED_DOORWAYS: readonly { x: number; z: number; along: 'x' | 'z'; width: number; height: number }[] = [
  { x: -15.2, z: 7, along: 'z', width: 1.6, height: 2.4 },
  { x: 15.2, z: 7, along: 'z', width: 1.6, height: 2.4 },
  { x: -22, z: -21.8, along: 'x', width: 1.8, height: 2.6 },
  { x: 22, z: -21.8, along: 'x', width: 1.8, height: 2.6 },
];

/** Something placed against a wall: its centre and the direction it faces (unit vector toward the player). */
export interface Placed {
  x: number;
  z: number;
  fx: number;
  fz: number;
}

/** The power lever, on the boiler house's back wall. */
export const POWER_LEVER: Placed = { x: 40.5, z: -18.35, fx: 0, fz: 1 };

/** The perk machines (each needs the power). */
export const PERK_MACHINES: readonly (Placed & { perk: PerkId })[] = [
  { perk: 'ironhide', x: -7, z: 3.5, fx: 0, fz: -1 }, // the yard, against the admin block
  { perk: 'quickhand', x: 33, z: -21.4, fx: 0, fz: 1 }, // the boiler house yard, against the back wall
  { perk: 'secondWind', x: 11.1, z: 14.6, fx: -1, fz: 0 }, // the admin front hall
  { perk: 'rapidFire', x: -44, z: 14.5, fx: 0, fz: -1 }, // the cemetery, against the front wall
];

/** The Pack-a-Punch: the isolation hall, between two padded cells. */
export const PAP_MACHINE: Placed = { x: 4.8, z: -36.7, fx: 0, fz: 1 };

/** Chalk outlines of guns on the walls. */
export const WALL_BUYS: readonly (Placed & { weapon: WeaponId })[] = [
  { weapon: 'pistol', x: -3.8, z: 18.03, fx: 0, fz: 1 }, // the admin block's front
  { weapon: 'shotgun', x: -26.2, z: 4.28, fx: 0, fz: -1 }, // a west ward cell
  { weapon: 'rifle', x: 26.2, z: 4.28, fx: 0, fz: -1 }, // an east ward cell
  { weapon: 'rpg', x: 22.8, z: -29.38, fx: 0, fz: -1 }, // the morgue
];
