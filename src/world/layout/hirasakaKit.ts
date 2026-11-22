/**
 * HIRASAKA's kit: the materials and the small pieces every place-group file builds with (`hirasaka<Group>.ts`).
 *
 * Plain colours throughout: the level builder draws every plain `MeshStandardMaterial` of one finish together per
 * 78 m chunk (`LevelBuilder.bake`), so colour costs nothing. Only what glows (`H.lamp`, `H.lantern`, `H.peach`) costs a
 * draw call of its own; textured named materials ('concreteWall', 'brick', 'plaster') are fine for walls.
 *
 * THE RULE OF THE ISLAND: the nav grid is one height field, so anything solid on a raised pad is a collider from y 0 up
 * to its top (`solid` and `shell` do that for you). Never build a collider that starts at the pad's height.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import type { Ctx } from './util';
import { box, cyl, slab } from './zaryaKit';
import type { Rect } from '../../hirasaka/places';

export { box, cyl, slab };

const std = (color: number, roughness = 0.9, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const lit = (color: number, intensity: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: color, emissiveIntensity: intensity, roughness: 0.6 });

/** The island's palette: wet grey concrete, rust, wood balconies, coal; Bon-lantern orange and one peach pink below. */
export const H = {
  concrete: std(0x7d8484, 0.92),
  concreteWet: std(0x5d6566, 0.6),
  concreteDark: std(0x3f4647, 0.92),
  stain: std(0x4a4a40, 0.95),
  asphalt: std(0x2c3134, 0.55),
  rust: std(0x7a3e22, 0.85, 0.2),
  rustDark: std(0x4a2a1a, 0.9, 0.2),
  iron: std(0x2a2e31, 0.6, 0.5),
  steel: std(0x5a6266, 0.55, 0.5),
  wood: std(0x6a4a30, 0.85),
  woodDark: std(0x3e2a1c, 0.85),
  woodPale: std(0x9a7c56, 0.85),
  tatami: std(0x8f8a5a, 0.95),
  plaster: std(0xb8b2a0, 0.9),
  tile: std(0x9aa6a2, 0.5),
  brick: std(0x7a3a2a, 0.9),
  rock: std(0x34302c, 0.95),
  rockDark: std(0x1e1c1a, 0.95),
  coal: std(0x0e0e10, 0.7, 0.2),
  water: std(0x13302e, 0.15, 0.3),
  red: std(0x9a2a1e, 0.8),
  white: std(0xd8d4c8, 0.85),
  green: std(0x3e5a44, 0.9),
  bone: std(0xd8ccb4, 0.8),
  // what glows (each one a draw call: use sparingly)
  lamp: lit(0xffb060, 1.8),
  lantern: lit(0xff8a30, 2.2),
  peach: lit(0xffc0d0, 1.6),
};

/** A collider from the ground (y 0) to `top` (absolute height), centred on (x, z), `w` along x, `d` along z. */
export function solid(c: Ctx, x: number, z: number, w: number, d: number, top: number, tag: string, o: { shots?: boolean; kind?: 'building' | 'prop' | 'wall' | 'none'; surface?: 'wood' | 'metal' | 'concrete' | 'glass'; rot?: number } = {}) {
  return c.b.collide({ x, z, hx: w / 2, hz: d / 2, rot: o.rot, y0: 0, y1: top, blocksShots: o.shots ?? true, mapKind: o.kind ?? 'prop', surface: o.surface ?? 'concrete', tag });
}

/** A visible box standing on the floor at `y` and its collider from y 0 (a crate, a counter, a machine). */
export function block(c: Ctx, mat: THREE.Material | string, x: number, y: number, z: number, w: number, h: number, d: number, tag: string, o: { shots?: boolean; rot?: number } = {}): void {
  const m = typeof mat === 'string' ? c.b.mats.get(mat as never) : mat;
  box(c.b, m, x, y + h / 2, z, w, h, d, o.rot ?? 0);
  solid(c, x, z, w, d, y + h, tag, { shots: o.shots, rot: o.rot });
}

export type Side = 'N' | 'S' | 'E' | 'W';

/**
 * An enterable room or building: four walls standing on the floor at `y`, `h` high, with doorways (`doors`: the side,
 * the middle of the opening measured from the side's west / north end, its width; at least 1.6 m), a roof slab and a
 * roof collider tagged 'roof' (that is what tells the game the player is indoors). Walls are colliders from y 0.
 * `thick` the wall's thickness. Returns the doorway centres (for paths and spots).
 */
export function shell(
  c: Ctx,
  r: Rect,
  y: number,
  h: number,
  o: { doors?: { side: Side; at: number; w?: number }[]; wall?: THREE.Material; roof?: THREE.Material | null; thick?: number; tag?: string; floor?: THREE.Material } = {},
): { x: number; z: number }[] {
  const { b } = c;
  const t = o.thick ?? 0.3;
  const wall = o.wall ?? H.concrete;
  const tag = o.tag ?? 'shell';
  const out: { x: number; z: number }[] = [];
  const sides: { side: Side; x0: number; z0: number; x1: number; z1: number }[] = [
    { side: 'N', x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0 },
    { side: 'S', x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1 },
    { side: 'W', x0: r.x0, z0: r.z0, x1: r.x0, z1: r.z1 },
    { side: 'E', x0: r.x1, z0: r.z0, x1: r.x1, z1: r.z1 },
  ];
  for (const s of sides) {
    const alongX = s.side === 'N' || s.side === 'S';
    const len = alongX ? s.x1 - s.x0 : s.z1 - s.z0;
    const gaps = (o.doors ?? []).filter((d) => d.side === s.side).map((d) => [d.at - (d.w ?? 1.8) / 2, d.at + (d.w ?? 1.8) / 2] as const).sort((p, q) => p[0] - q[0]);
    let from = 0;
    const run = (a: number, e: number): void => {
      if (e - a < 0.05) return;
      const mid = (a + e) / 2;
      const x = alongX ? s.x0 + mid : s.x0;
      const z = alongX ? s.z0 : s.z0 + mid;
      box(b, wall, x, y + h / 2, z, alongX ? e - a : t, h, alongX ? t : e - a, 0, false);
      solid(c, x, z, alongX ? e - a : t, alongX ? t : e - a, y + h, tag, { kind: 'wall' });
    };
    for (const [a, e] of gaps) {
      run(from, a);
      // a lintel over the doorway
      const mid = (a + e) / 2;
      const x = alongX ? s.x0 + mid : s.x0;
      const z = alongX ? s.z0 : s.z0 + mid;
      if (h > 2.7) box(b, wall, x, y + (h + 2.5) / 2, z, alongX ? e - a : t, h - 2.5, alongX ? t : e - a, 0, false);
      out.push({ x, z });
      from = e;
    }
    run(from, len);
  }
  if (o.floor) box(b, o.floor, (r.x0 + r.x1) / 2, y + 0.01, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.02, r.z1 - r.z0, 0, false);
  if (o.roof !== null) {
    box(b, o.roof ?? H.concreteDark, (r.x0 + r.x1) / 2, y + h + 0.1, (r.z0 + r.z1) / 2, r.x1 - r.x0 + 0.3, 0.2, r.z1 - r.z0 + 0.3, 0, false);
    c.b.collide({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2, y0: y + h, y1: y + h + 0.2, blocksMove: false, blocksShots: true, mapKind: 'none', tag: 'roof' });
  }
  return out;
}

/** A lamp on a post standing on the floor at `y` (a sodium street lamp unless a colour is given). */
export function lampPost(c: Ctx, x: number, y: number, z: number, o: { color?: number; mode?: 'steady' | 'flicker' | 'fail'; h?: number; tag?: string } = {}): void {
  const h = o.h ?? 4.6;
  box(c.b, H.iron, x, y + h / 2, z, 0.12, h, 0.12);
  solid(c, x, z, 0.14, 0.14, y + h, 'lamp', { surface: 'metal' });
  c.b.light({ x, y: y + h - 0.2, z, color: o.color ?? 0xffa860, intensity: 20, distance: 14, mode: o.mode ?? 'steady', pool: 3.2, glow: 0.6, tag: o.tag ?? 'lamp' });
}

/** A crate stack, a drum, a cart: the island's clutter (a collider from y 0, low ones let shots by). */
export function clutter(c: Ctx, x: number, y: number, z: number, kind: 'crate' | 'drum' | 'sacks', rot = 0): void {
  if (kind === 'drum') {
    cyl(c.b, H.rust, x, y, z, 0.3, 0.3, 0.9, 10);
    solid(c, x, z, 0.6, 0.6, y + 0.9, 'drum', { shots: false, surface: 'metal' });
  } else if (kind === 'sacks') {
    box(c.b, H.woodPale, x, y + 0.3, z, 1.2, 0.6, 0.8, rot);
    solid(c, x, z, 1.2, 0.8, y + 0.6, 'sacks', { shots: false, rot });
  } else {
    box(c.b, H.wood, x, y + 0.5, z, 1, 1, 1, rot);
    solid(c, x, z, 1, 1, y + 1, 'crate', { shots: false, rot, surface: 'wood' });
  }
}

/** Paint on the ground at `y` (a path, a hazard stripe, a puddle). */
export function ground(b: LevelBuilder, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number): void {
  box(b, mat, (x0 + x1) / 2, y + 0.015, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, 0, false);
}
