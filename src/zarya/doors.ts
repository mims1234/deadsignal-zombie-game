/**
 * ZARYA: everything in the level that the story shuts and opens, set from the story's state (no THREE). The solo game
 * and the co-op simulation both call this every frame; it only touches a door when its state has changed.
 *
 * The shelter's blast door, the store's jammed shutter, the gates between zones, the Rynok's cold store door, the
 * Berloga's door with four key slots, and the escalator up to the canteen.
 */
import type { BoxCollider } from '../world/collision';
import type { Level } from '../world/level';
import type { NavGrid } from '../world/nav';
import { GATES } from './places';
import { G, ZaryaStory, type StoryView } from './story';

function set(level: Level, nav: NavGrid, c: BoxCollider, shut: boolean, shots = shut): boolean {
  if (c.blocksMove === shut) return false;
  c.blocksMove = shut;
  c.blocksShots = shots;
  nav.refresh(level.world, c.minX - 1.5, c.minZ - 1.5, c.maxX + 1.5, c.maxZ + 1.5);
  return true;
}

export function applyDoors(level: Level, v: StoryView): void {
  const h = level.zarya;
  if (!h) return;
  const fl = level.floors;
  let changed = false;
  changed = set(level, fl.navOf(h.shelterArea), h.blastDoor, ZaryaStory.doorShut(v)) || changed;
  // the curtain is half down over the southern doors for the whole story: nobody goes under it
  changed = set(level, level.nav, h.shutter, true, false) || changed;
  // a chained or frozen gate stops walkers, not shots: it is bars
  for (const g of GATES) {
    const c = h.gates[g.id];
    if (c) changed = set(level, level.nav, c, !ZaryaStory.gateOpen(v, g.opens), false) || changed;
  }
  changed = set(level, level.nav, h.coldDoor, ZaryaStory.coldShut(v)) || changed;
  changed = set(level, fl.navOf(h.berlogaArea), h.keyDoor, ZaryaStory.keyDoorShut(v)) || changed;
  const shutUp = !ZaryaStory.did(v, G.escalator);
  if (h.escalator.closed !== shutUp) {
    h.escalator.closed = shutUp;
    changed = true;
  }
  if (changed) fl.forgetFields();
}
