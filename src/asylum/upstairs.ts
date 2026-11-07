/**
 * Ward Nine's door at the top of the east fire escape (the browser game and the co-op simulation both): shut, with a
 * red lamp, until the power is back; then it stands open, the lamp turns green, and the infected route up the stairs
 * after you. `level.asylum` is built by `world/layout/asylum.ts`.
 */
import type { Level } from '../world/level';

export function setWard9Open(level: Level, open: boolean): void {
  const h = level.asylum;
  if (!h) return;
  const w = h.ward9;
  const c = w.collider;
  if (c.blocksMove === !open) return;
  c.blocksMove = !open;
  c.blocksShots = !open;
  w.link.closed = !open;
  w.panel.visible = !open;
  w.lamp.emissive.setHex(open ? 0x3aff6a : 0xff2a1a);
  const m = 1.2;
  level.floors.navOf(w.area).refresh(level.world, c.minX - m, c.minZ - m, c.maxX + m, c.maxZ + m);
  level.floors.forgetFields(); // routes worked out while it was shut would never lead through it
}

export function ward9Open(level: Level): boolean {
  return !!level.asylum && !level.asylum.ward9.collider.blocksMove;
}
