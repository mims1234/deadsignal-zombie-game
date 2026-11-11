/**
 * A mystery box that moves (pure but for the collider it carries): no map moved its box before ZARYA's sack. After
 * `MYSTERY_BOX.moves[map].every` openings, as the box closes for the next turn, it is gone from where it stands and turns up at
 * another of its places. The places are the map's own (`zarya/sack.ts`); place 0 is always where the map put the box
 * (as the level's placement left it). Solo, `game/entities.ts` decides; in co-op the host does (`logic/sharedLoot.ts`
 * `tickLoot`'s `move`, called from `sim/serverHost.ts`) and the place goes out with the box, so every client follows.
 *
 * The box's own `CrateDef` is moved with it, so everything that reads where a box is (the USE prompt, the map's marker,
 * the host's reach check, the squad's errands) follows without knowing it moved.
 */
import type { CollisionWorld } from '../world/collision';
import type { CrateDef } from '../world/layout/data';

export interface BoxPlace {
  x: number;
  z: number;
  yaw: number;
}

/** The place each box was first seen at: its place 0. */
const homes = new WeakMap<CrateDef, BoxPlace>();

/** Where the map put this box (recorded the first time it is asked, so ask before it ever moves). */
export function boxHome(def: CrateDef): BoxPlace {
  let h = homes.get(def);
  if (!h) {
    h = { x: def.x, z: def.z, yaw: def.yaw };
    homes.set(def, h);
  }
  return h;
}

/** Place `i` of a box: 0 is its home, the rest are the map's list (`places[i]`, whose own 0 is not used). */
export function boxPlace(def: CrateDef, places: readonly BoxPlace[], i: number): BoxPlace {
  return i <= 0 ? boxHome(def) : (places[i] ?? boxHome(def));
}

/**
 * Where a box at place `current` goes next: one of the other places that may be used now (`open`), picked by `roll`
 * (0..1). Null when there is none (it stays where it is and goes next time).
 */
export function nextPlace(count: number, current: number, open: (i: number) => boolean, roll: number): number | null {
  const can: number[] = [];
  for (let i = 0; i < count; i++) if (i !== current && open(i)) can.push(i);
  if (can.length === 0) return null;
  return can[Math.min(can.length - 1, Math.floor(roll * can.length))]!;
}

/** Has a box been opened often enough to move? */
export function dueToMove(opens: number, every: number): boolean {
  return every > 0 && opens >= every;
}

// the collider the level gave a box (`world/level.ts`: placeProp's 'crate'), and one the same for its other places
const CRATE = { hx: 0.55, hz: 0.35, y1: 0.72 } as const;

/**
 * Move a box's def and its collider to `to`. The collider it leaves stops blocking anything (the world's grid cannot
 * drop one); at a place it has stood before, that one blocks again, else a new one is added. No-op when it is there.
 */
export function placeBox(world: CollisionWorld | null, def: CrateDef, to: BoxPlace): void {
  if (Math.abs(def.x - to.x) < 0.01 && Math.abs(def.z - to.z) < 0.01) return;
  if (world) {
    world.forEachNear(def.x, def.z, 0.6, (c) => {
      if (c.tag === 'crate' && Math.hypot(c.cx - def.x, c.cz - def.z) < 0.3) c.blocksMove = c.blocksShots = false;
    });
    let found = false;
    world.forEachNear(to.x, to.z, 0.6, (c) => {
      if (c.tag === 'crate' && Math.hypot(c.cx - to.x, c.cz - to.z) < 0.3) {
        c.blocksMove = c.blocksShots = true;
        found = true;
      }
    });
    if (!found) world.add({ x: to.x, z: to.z, hx: CRATE.hx, hz: CRATE.hz, rot: to.yaw, y1: CRATE.y1, mapKind: 'none', tag: 'crate', surface: 'fabric' });
  }
  def.x = to.x;
  def.z = to.z;
  def.yaw = to.yaw;
}
