/**
 * HIRASAKA: everything in the level the story shuts and opens, set from the story's state (no THREE). The solo game
 * (`runtime.ts`) and the co-op simulation call this every frame; it only touches a collider or a link when its state
 * has changed.
 *
 * The obstacles only one tool opens (`places.ts` OBSTACLES with a `block`), the funayūrei's line across the gallery
 * (open once the ladles are handed over), the old adit (open on the climb, so what follows you up can follow you out).
 * The cage is never walked by the infected (always closed: players ride it on purpose).
 */
import type { BoxCollider } from '../world/collision';
import type { Level } from '../world/level';
import type { NavGrid } from '../world/nav';
import { LADLE, type StoryView } from './story';
import { OBSTACLES } from './places';

/** (final polish) the rotten props' own posts (`hirasakaGalleries.ts`, tagged `rotten-prop`): gone with the roof. */
const PROPS = OBSTACLES.findIndex((o) => o.id === 'props');
const propPosts = new WeakMap<Level, BoxCollider[]>();

function set(level: Level, nav: NavGrid, c: BoxCollider, shut: boolean, shots = shut): boolean {
  if (c.blocksMove === shut) return false;
  c.blocksMove = shut;
  c.blocksShots = shots;
  nav.refresh(level.world, c.minX - 1.5, c.minZ - 1.5, c.maxX + 1.5, c.maxZ + 1.5);
  return true;
}

export function applyHirasakaDoors(level: Level, v: StoryView): void {
  const h = level.hirasaka;
  if (!h) return;
  const fl = level.floors;
  let changed = false;
  h.obstacles?.forEach((c, i) => {
    if (!c) return;
    const nav = c.minX > 250 ? fl.navOf(h.mineArea) : level.nav;
    changed = set(level, nav, c, (v.obstacles & (1 << i)) === 0) || changed;
  });
  let posts = propPosts.get(level);
  if (!posts) propPosts.set(level, (posts = level.world.colliders.filter((c) => c.tag === 'rotten-prop')));
  const propsDown = PROPS >= 0 && (v.obstacles & (1 << PROPS)) !== 0;
  for (const c of posts) changed = set(level, fl.navOf(h.mineArea), c, !propsDown) || changed;
  if (h.funaGate) changed = set(level, fl.navOf(h.mineArea), h.funaGate, v.ladles !== LADLE.given, false) || changed;
  const aditShut = !v.bossDown;
  if (h.aditLink.closed !== aditShut) {
    h.aditLink.closed = aditShut;
    changed = true;
  }
  if (!h.cageLink.closed) {
    h.cageLink.closed = true;
    changed = true;
  }
  if (changed) fl.forgetFields();
}
