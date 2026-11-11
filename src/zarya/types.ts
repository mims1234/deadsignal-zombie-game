/**
 * ZARYA: the small shared shapes (no THREE, no imports), so the town's frame (`places.ts`) and each zone's own file
 * (`zones/*.ts`) can use them without importing each other.
 */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export interface Spot {
  x: number;
  z: number;
}

export type ZaryaZone = 'square' | 'store' | 'rynok' | 'dvor' | 'garages' | 'depot' | 'dk' | 'banya' | 'tets' | 'institute' | 'shelter' | 'upstairs' | 'canteen' | 'berloga';

export type PersonRole = 'towns' | 'child' | 'staff' | 'guard' | 'nina' | 'kostya' | 'zina' | 'moroz' | 'girl' | 'babushka' | 'danya' | 'masked';
export interface Person {
  x: number;
  z: number;
  /** Floor height (the stage's boards, the tram's cab). */
  y: number;
  yaw: number;
  role: PersonRole;
  /** 0..1, picks the coat, the hat and the height. */
  seed: number;
  /** Stands where a walker could bump into them (most do; the ones behind counters and in the tram do not need it). */
  solid: boolean;
}

/** How a zone's file stands its people: `add(x, z, yaw, role, solid, y)`, and `r()` for the next random number. */
export type AddPerson = (x: number, z: number, yaw: number, role?: PersonRole, solid?: boolean, y?: number) => void;
export type PeopleFn = (add: AddPerson, r: () => number) => void;

export const inRect = (q: Rect, x: number, z: number, pad = 0): boolean => x >= q.x0 - pad && x <= q.x1 + pad && z >= q.z0 - pad && z <= q.z1 + pad;
/** The yaw that faces from (x, z) toward (tx, tz). */
export const yawTo = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z));
