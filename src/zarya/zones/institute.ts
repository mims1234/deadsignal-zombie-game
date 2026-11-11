/**
 * ZARYA, the INSTITUTE of Chronobiology, at the north-west corner of town (no THREE). The story (`story.ts`, `runtime.ts`) uses these spots BY NAME: the layout
 * (`world/layout/zarya*.ts`) may move any of them, but every name must stay and must be somewhere a player can stand
 * within 2 m of (unless it says otherwise). x runs east, z south (north is -z).
 *
 * The finale. Reached through the checkpoint from the heating plant (east wall, at z = -130; the keypad's code
 * opens it). A road runs from the gate straight to the block's glass doors. Inside the laboratory block: the lobby
 * (east), a corridor running west from it with two labs on its north side and one on its south, the director's rooms
 * (south-west), the master clock room (north-west), and at the corridor's west end the freight lift down to the
 * Berloga hall (`zones/berloga.ts`).
 */
import type { PeopleFn, Rect, Spot } from '../types';

export const INSTITUTE = {
  rect: { x0: -230, z0: -190, x1: -104, z1: -70 } as Rect,
  /** The laboratory block (walls, roof); its glass entrance faces east, toward the checkpoint (the doors are at z = -130). */
  block: { x0: -200, z0: -160, x1: -140, z1: -110 } as Rect,
  /** The lobby, just inside the doors: the reception desk and the mosaic of the sleeping bear are to the north-west of here. */
  lobby: { x: -148, z: -130 } as Spot,
  /** The master clock room: every clock in town runs off this one, and it is stopped at 23:57 (a clue). Here a player stands in front of its dial. */
  clockRoom: { x: -189.8, z: -141 } as Spot,
  /** The Zenit's marked spot (a faint frost ring, `photos.ts`): on the floor before the master clock's plinth, where the ladder stood at 23:57. */
  zenit: { x: -189.8, z: -142.9 } as Spot,
  /** The director's office: Dr Zimin's desk (this spot is in front of it), the Ded Moroz coat's empty hanger, his notes (a clue). */
  office: { x: -192.3, z: -116.3 } as Spot,
  /** A lab bench things can be built at (the clear workbench on the north wall of the lab next to the lobby), and the reagent "Vesna" in a cold cabinet (a part; in the lab south of the corridor, against its east wall: the spot is the shelf behind the cabinet's open door, and a player stands in front of it). */
  bench: { x: -163.5, z: -148 } as Spot,
  vesna: { x: -171.25, z: -116.45 } as Spot,
  /** The freight lift's doorway, at the west end of the corridor: the way down to the Berloga hall (the frame puts the stairwell's doorway exactly here, entered heading `liftYaw`: west). */
  lift: { x: -194.6, z: -130 } as Spot,
  liftYaw: Math.PI / 2,
  /** In the lobby, by the benches under the south windows. */
  cover: [{ x: -146.4, z: -120.6 }] as Spot[],
  spawns: [[-226, -186], [-108, -186], [-226, -76], [-108, -76], [-120, -160]] as [number, number][],
} as const;

/** Everyone caught in this zone, standing where the snow found them (never inside anything solid, never on top of another). */
export const institutePeople: PeopleFn = (add, r) => {
  // fifteen: researchers in white coats (role 'staff', solid) in the lobby, the three labs and the clock room
  const to = (x: number, z: number, tx: number, tz: number): void => add(x, z, Math.atan2(-(tx - x), -(tz - z)) + (r() - 0.5) * 0.3, 'staff');
  for (const c of INSTITUTE.cover) to(c.x, c.z, -142, c.z + 1);
  // the lobby: the receptionist behind her desk, one reading the notice board, one by the fir tree, one at the coat racks
  to(-155, -139.4, -140, -138);
  to(-156.3, -121.6, -158, -121.6);
  to(-146.6, -144.2, -144.5, -146.5);
  to(-152.4, -113.2, -152.4, -110);
  // the animal lab (north of the corridor, west): at the island bench, at the cages, at the blackboard
  to(-176.2, -142.6, -174.5, -142.6);
  to(-171.4, -144.2, -169, -144.2);
  to(-173.2, -148.4, -173.2, -150);
  // the workshop lab (north, next to the lobby): at the island, at the instruments, at the glassware
  to(-165.4, -141.2, -163.5, -141.2);
  to(-167, -138.2, -169, -138.2);
  to(-160.2, -144, -158, -144);
  // the cold lab (south of the corridor): at the island, at the wall bench, by the dewars
  to(-177.4, -119.2, -177.4, -117.5);
  to(-183.2, -122.4, -185, -122.4);
  to(-172.4, -113.6, -170, -113);
  // the master clock room: the technician at his console
  to(-194, -134.7, -194, -133);
};
