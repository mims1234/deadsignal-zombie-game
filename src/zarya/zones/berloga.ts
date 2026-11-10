/**
 * ZARYA, the BERLOGA hall, under the Institute (an interior built beside the map) (no THREE). The story (`story.ts`, `runtime.ts`) uses these spots BY NAME: the layout
 * (`world/layout/zarya*.ts`) may move any of them, but every name must stay and must be somewhere a player can stand
 * within 2 m of (unless it says otherwise). x runs east, z south (north is -z).
 *
 * The finale. An underground hall reached by the Institute's freight lift. A blast door with four key slots cuts it
 * in two: the lift landing on the west side, the hall on the east. In the hall: glass dens of sleeping bears along
 * the north wall, two rows of beds along the south wall with two winters' paid volunteers (one of them Mira's brother
 * Danya, in a bed that stands apart at the east end), and at the far end, on a gallery two steps up, the purge
 * console with its four key switches in front of the reagent tank. Dr Zimin, as Morozko, waits there.
 */
import type { PeopleFn, Rect, Spot } from '../types';

export const BERLOGA = {
  rect: { x0: 500, z0: -18, x1: 560, z1: 18 } as Rect,
  h: 6,
  /** The foot of the lift: where the stairwell from the Institute comes out (heading east into the landing). */
  liftFoot: { x: 503, z: 0 } as Spot,
  /** The blast door with four key slots: the wall's x, the door's half-width; a player stands at `slots` (the panel is on the wall's west face, south of the opening) to open it. */
  doorX: 512,
  doorHalf: 1.6,
  slots: { x: 510.4, z: 3 } as Spot,
  /** The glass dens along the north wall (a clue: bears asleep; this spot is in front of the middle ones), and Danya's bed (a clue, and he can be covered: the spot is the bed itself, a chair beside it). */
  dens: { x: 529.5, z: -10.6 } as Spot,
  danya: { x: 545.2, z: 10.4 } as Spot,
  /** The purge console at the east end, on the gallery two steps up (0.5 m), and its four key switches in a row from north to south (a player stands at each, on the gallery, facing east). */
  console: { x: 553.8, z: 0 } as Spot,
  keys: [{ x: 553.8, z: -4.5 }, { x: 553.8, z: -1.5 }, { x: 553.8, z: 1.5 }, { x: 553.8, z: 4.5 }] as Spot[],
  /** Where Morozko stands waiting (on the hall's floor, at the foot of the gallery's steps), and the line a player crosses to be asked his question. */
  morozko: { x: 545.5, z: 0 } as Spot,
  askLine: 528,
  cover: [{ x: 545.2, z: 10.4 }] as Spot[],
  spawns: [[515, -10.5], [514.2, 9], [546.6, -15], [547, 16]] as [number, number][],
} as const;

/** Everyone caught in this zone, standing where the snow found them (never inside anything solid, never on top of another). */
export const berlogaPeople: PeopleFn = (add, r) => {
  // the volunteers lie in their beds (drawn by the layout, not people); Danya is the one person here
  void r;
  add(BERLOGA.danya.x, BERLOGA.danya.z, 0, 'danya', false, 0.5);
};
