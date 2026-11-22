/**
 * HIRASAKA: THE CAGE LANDING, THE FLOODED GALLERIES, THE COAL FACE (place group 'galleries', the deep, y 9 = DEEP_Y).
 * Rooms (`places.ts` DEEP_ROOMS): landing (x 268..310, z 24..62), gallery / galleryN / galleryS, face (x 404..470,
 * z 20..64), magazine (the powder magazine, x 452..470, z 8..20), drift (x 430..444, z -4..20, down to the village;
 * the frame's obstacle collider is the coal seam across it).
 * Spots: CAGE.bottom (the cage's stop below), DEEP_SPOTS tagBoard / bench / funa / phone, TAPES[3], PHOTOS[4],
 * WORKBENCHES happa / sakuganki, WALL_BUYS face, OBSTACLES props.
 *
 * The frame built: the rock walls, floors and roofs of every room, the cage link, the drift's seam (its collider and
 * block), the funayūrei's line (a collider across x 393.6..394.4).
 *
 * Built here (coal black, warm lamp pools, teal water):
 *  - the 636 m landing: the cage's recess in a concrete collar under a steel portal, guides, the shaft's mouth in the
 *    roof, signal bells, a red telephone box, hazard paint, rails out to the galleries, a battery loco, a siding of
 *    tubs, steel posts and roof girders, a ventilation duct, two pillars, the deputy's table where Genzō's tape lies;
 *  - the deep lamp room off it (the memorial: no clutter, no spawns, one steady lamp): the tag board with its rows of
 *    brass tags (some hooks empty) and a ledge with a candle and a sake cup, a small kamidana over it, racks of dead
 *    cap lamps, a plain bench facing the board, the workbench with its vice where the ladles are knocked through;
 *  - the flooded galleries: knee-deep teal water, square timber sets down every lane, a loop round a central rock
 *    block, half-sunk tubs, lamps on the posts, drips from the roof with rings where they land, the rotten props the
 *    axe drops (OBSTACLES props), a plank ventilation door, the telephone in its niche, the straw rope just past the
 *    funayūrei's line;
 *  - the coal face: a faceted glittering face behind a line of props, the chain conveyor and its drive, a rock drill on
 *    a tripod, rails and a string of loaded tubs, the tool crib with the company price board, the Sakuganki's bench;
 *  - the powder magazine behind its bulkhead, the vault door swung open under a red lamp, the Happa's bench before
 *    it; shelves of crated charges, wire coils, plunger boxes, sandbags;
 *  - the drift up to the fallen seam: timber sets, rails ending at the fall, coal heaped at its sides.
 */
import * as THREE from 'three';
import type { Ctx } from './util';
import type { LevelBuilder } from '../builder';
import { H, box, cyl, ground, slab, solid } from './hirasakaKit';
import { crag, dressMats } from './hirasakaDress';
import { hideable } from './hirasakaHide';
import { CAGE, DEEP_SPOTS, DEEP_Y, OBSTACLES, PHOTOS, TAPES, WALL_BUYS, WORKBENCHES } from '../../hirasaka/places';

export const GALLERIES_RECT = { x0: 268, z0: -4, x1: 472, z1: 66 };

const own = (color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const P = {
  steel: own(0x5a6266, 0.6, 0.5),
  rustDark: own(0x4a2a1a, 0.85, 0.2),
  rock: own(0x1e1c1a, 0.9),
  brass: own(0xa88a3a, 0.6, 0.5),
  bronze: own(0x8a6a2a, 0.6, 0.5),
  yellow: own(0xb8901c, 0.8),
  drip: own(0x2f7a72, 0.15, 0.3),
  water: own(0x1e4a46, 0.15, 0.3),
  straw: own(0xb09a68, 0.9),
  paper: own(0xe8e2d0, 0.9),
  loco: own(0x2e4a3a, 0.6, 0.5),
  sand: own(0x6a5a40, 0.9),
  black: own(0x050505, 0.7, 0.2),
  // the magazine's red lamp: the one glow of its own down here (a draw call)
  red: new THREE.MeshStandardMaterial({ color: 0x200404, emissive: 0xff2a14, emissiveIntensity: 2, roughness: 0.5 }),
};
const COAL: readonly [number, number, number] = [0.012, 0.012, 0.014];

type P3 = readonly [number, number, number];

/** A box standing on the floor at `y` with its collider from y 0 (like the kit's `block`, but casting no shadow, so
 * it batches with the rest of this group's boxes). */
function blk(c: Ctx, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, tag: string, o: { shots?: boolean; rot?: number } = {}): void {
  box(c.b, mat, x, y + h / 2, z, w, h, d, o.rot ?? 0, false);
  solid(c, x, z, w, d, y + h, tag, { shots: o.shots, rot: o.rot });
}

function beam(b: LevelBuilder, m: THREE.Material, a: P3, e: P3, w: number, h = w): void {
  const A = new THREE.Vector3(a[0], a[1], a[2]);
  const d = new THREE.Vector3(e[0], e[1], e[2]).sub(A);
  const L = d.length();
  if (L < 1e-3) return;
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, L, h), m);
  o.position.copy(A).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.add(o, { cast: false });
}

/** A smooth line through points (a rope, a hose). */
function tube(b: LevelBuilder, m: THREE.Material, pts: readonly P3[], r: number): void {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  b.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r, 5, false), m), { cast: false });
}

function rails(b: LevelBuilder, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(-dz, dx);
  const ux = dx / len;
  const uz = dz / len;
  for (const s of [-0.36, 0.36]) box(b, P.steel, (x0 + x1) / 2 - uz * s, y + 0.1, (z0 + z1) / 2 + ux * s, len, 0.08, 0.07, rot, false);
  const n = Math.floor(len / 0.9);
  for (let i = 0; i <= n; i++) box(b, H.woodDark, x0 + ux * (i * 0.9), y + 0.04, z0 + uz * (i * 0.9), 0.22, 0.08, 1.1, rot, false);
}

function tub(c: Ctx, x: number, z: number, y: number, alongX: boolean, empty = false): void {
  const { b } = c;
  const w = alongX ? 1.5 : 0.95;
  const d = alongX ? 0.95 : 1.5;
  box(b, H.rust, x, y + 0.75, z, w, 0.8, d, 0, false);
  box(b, P.rustDark, x, y + 1.16, z, w + 0.06, 0.06, d + 0.06, 0, false);
  if (!empty) for (let k = 0; k < 3; k++) box(b, H.coal, x + (alongX ? (k - 1) * 0.4 : 0), y + 1.2 + (k % 2) * 0.08, z + (alongX ? 0 : (k - 1) * 0.4), 0.45, 0.24, 0.45, k * 0.7, false);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10).rotateZ(Math.PI / 2);
      if (!alongX) g.rotateY(Math.PI / 2);
      const o = new THREE.Mesh(g, H.iron);
      o.position.set(x + (alongX ? sx * 0.5 : sx * 0.36), y + 0.2, z + (alongX ? sz * 0.36 : sz * 0.5));
      b.add(o, { cast: false });
    }
  }
  solid(c, x, z, w + 0.1, d + 0.1, y + 1.3, 'tub', { shots: false, surface: 'metal' });
}

/** A hanging lamp (a caged emissive box); `light` also casts (each one of the group's 14). */
function lamp(c: Ctx, x: number, y: number, z: number, light?: { mode?: 'steady' | 'flicker' | 'fail'; intensity?: number; distance?: number; color?: number }): void {
  const { b } = c;
  box(b, H.iron, x, y + 0.2, z, 0.26, 0.06, 0.26, 0, false);
  box(b, H.lamp, x, y, z, 0.18, 0.28, 0.18, 0, false);
  box(b, H.iron, x, y - 0.17, z, 0.22, 0.05, 0.22, 0, false);
  // (Low runs two dynamic lights: the rest of the deep reads by these lamps' glows)
  if (light) b.light({ x, y: y - 0.25, z, color: light.color ?? 0xffb060, intensity: (light.intensity ?? 34) * 1.7, distance: (light.distance ?? 15) * 1.3, mode: light.mode ?? 'flicker', pool: 2.6, glow: 0.9, tag: 'galleries' });
  else b.glow({ x, y, z, color: 0xffb060, size: 0.75, intensity: 1.8, mode: 'steady' });
}

/**
 * A square timber set across a lane: two posts and a cap, lagging boards over it. `x` its line, `z0..z1` the lane's
 * walls (posts 0.25 in), `top` the roof.
 */
function set(c: Ctx, x: number, z0: number, z1: number, y: number, top: number): void {
  const { b } = c;
  const ch = top - 0.35;
  for (const z of [z0 + 0.25, z1 - 0.25]) {
    box(b, H.woodDark, x, (y + ch) / 2, z, 0.32, ch - y, 0.32, 0, false);
    solid(c, x, z, 0.34, 0.34, top, 'timber-set', { surface: 'wood' });
  }
  box(b, H.woodDark, x, ch + 0.16, (z0 + z1) / 2, 0.34, 0.32, z1 - z0, 0, false);
  for (const dz of [-0.33, 0.33]) box(b, H.wood, x + dz * 2, ch + 0.36, (z0 + z1) / 2, 0.5, 0.06, z1 - z0 - 0.4, 0, false);
}

/** A set along z (across a lane running north-south): posts at x0 / x1. */
function setZ(c: Ctx, z: number, x0: number, x1: number, y: number, top: number): void {
  const { b } = c;
  const ch = top - 0.35;
  for (const x of [x0 + 0.25, x1 - 0.25]) {
    box(b, H.woodDark, x, (y + ch) / 2, z, 0.32, ch - y, 0.32, 0, false);
    solid(c, x, z, 0.34, 0.34, top, 'timber-set', { surface: 'wood' });
  }
  box(b, H.woodDark, (x0 + x1) / 2, ch + 0.16, z, x1 - x0, 0.32, 0.34, 0, false);
  for (const dx of [-0.66, 0.66]) box(b, H.wood, (x0 + x1) / 2, ch + 0.36, z + dx, x1 - x0 - 0.4, 0.06, 0.5, 0, false);
}

export function buildGalleries(c: Ctx): void {
  const M = dressMats(c.mats);
  landing(c);
  lampRoom(c);
  galleries(c, M);
  coalFace(c, M);
  magazine(c);
  drift(c, M);
}

/** The 636 m landing: the cage's recess and portal, bells, telephone, rails, the loco, the deputy's table. */
function landing(c: Ctx): void {
  const { b } = c;
  const y = DEEP_Y;
  const top = y + 7;
  const C = CAGE.bottom;
  // the recess the cage stands in: a concrete collar either side, guides behind, the shaft's mouth in the roof
  for (const z of [C.z - 2.4, C.z + 2.4]) blk(c, H.concreteDark, 273.2, y, z, 10.4, 7, 0.4, 'cage-collar');
  for (const z of [C.z - 1.2, C.z + 1.2]) box(b, H.woodDark, C.x - 1.75, (y + top) / 2, z, 0.2, 7, 0.2, 0, false);
  box(b, P.black, C.x, top - 0.03, C.z, 4.2, 0.04, 4.4, 0, false);
  for (const [dx, dz, w, d] of [
    [0, -2.4, 5, 0.5],
    [0, 2.4, 5, 0.5],
    [-2.3, 0, 0.5, 4.8],
    [2.3, 0, 0.5, 4.8],
  ] as const) box(b, H.concrete, C.x + dx, top - 0.3, C.z + dz, w, 0.6, d, 0, false);
  // the steel portal over the recess's mouth
  const px = 278.7;
  for (const z of [C.z - 2.4, C.z + 2.4]) blk(c, P.steel, px, y, z, 0.44, 7, 0.44, 'cage-portal', { shots: true });
  box(b, P.steel, px, y + 4.2, C.z, 0.5, 0.5, 5.3, 0, false);
  box(b, P.rustDark, px, top - 0.6, C.z, 0.5, 0.6, 5.3, 0, false);
  for (const s of [-1, 1]) beam(b, P.steel, [px, y + 3.0, C.z + s * 2.4], [px, y + 4.2, C.z + s * 1.4], 0.16, 0.16);
  // hazard paint before the cage, a timber sill
  for (let k = 0; k < 6; k++) ground(b, k % 2 ? H.coal : P.yellow, 277.5, C.z - 2.2 + k * 0.73, 278.3, C.z - 1.47 + k * 0.73, y + 0.005);
  box(b, H.woodDark, 277.4, y + 0.06, C.z, 0.3, 0.12, 4.4, 0, false);
  // the signal bells on an arm off the portal's north post, their pull cord
  const bz = C.z - 2.4;
  box(b, H.iron, px + 0.3, y + 3.3, bz - 0.5, 0.08, 0.08, 1.0, 0, false);
  for (const dz of [-0.45, -0.85]) {
    cyl(b, P.bronze, px + 0.3, y + 2.86, bz + dz, 0.2, 0.09, 0.36, 10, false);
    box(b, H.iron, px + 0.3, y + 3.25, bz + dz, 0.03, 0.1, 0.03, 0, false);
  }
  box(b, H.wood, px + 0.3, y + 2.0, bz - 0.65, 0.02, 1.6, 0.02, 0, false);
  // the red telephone box on the collar's north face
  box(b, H.red, 275.6, y + 1.5, C.z - 2.72, 0.55, 0.75, 0.24, 0, false);
  box(b, H.coal, 275.6, y + 1.5, C.z - 2.86, 0.2, 0.45, 0.06, 0, false);
  tube(b, H.coal, [[275.85, y + 1.3, C.z - 2.8], [276.05, y + 0.9, C.z - 2.75], [275.95, y + 1.2, C.z - 2.68]], 0.015);
  // rails out of the cage to the galleries
  rails(b, 277.6, C.z, 300, C.z, y);
  rails(b, 300, C.z, 310, 40, y);
  // a battery loco waiting on the main line, its headlamp dark
  const lx = 292;
  blk(c, P.loco, lx, y + 0.3, C.z, 3.2, 1.1, 1.2, 'loco');
  box(b, P.loco, lx - 0.9, y + 1.85, C.z, 1.2, 0.9, 1.25, 0, false);
  box(b, H.coal, lx - 0.9, y + 1.95, C.z, 1.24, 0.4, 1.0, 0, false);
  box(b, H.iron, lx, y + 0.18, C.z, 3.4, 0.36, 1.0, 0, false);
  cyl(b, P.steel, lx + 1.62, y + 1.1, C.z, 0.12, 0.12, 0.12, 10, false);
  // the siding along the north wall: three tubs coupled, a stop block
  rails(b, 280, 26, 292, 26, y);
  for (const x of [283, 284.8, 286.6]) tub(c, x, 26, y, true);
  blk(c, H.woodDark, 292.4, y, 26, 0.4, 0.7, 1.4, 'stop-block', { shots: false });
  // steel posts down the walls, girders across the roof, the ventilation duct, two pillars
  for (let x = 271; x <= 307; x += 6) {
    blk(c, P.steel, x, y, 24.3, 0.36, 7, 0.36, 'post', { shots: true });
    const zEnd = x < 290 ? 61.7 : 45.6;
    if (x < 290) blk(c, P.steel, x, y, 61.7, 0.36, 7, 0.36, 'post', { shots: true });
    box(b, P.rustDark, x, top - 0.3, (24.3 + zEnd) / 2, 0.3, 0.5, zEnd - 24.3, 0, false);
  }
  {
    const g = new THREE.CylinderGeometry(0.5, 0.5, 42, 12).rotateZ(Math.PI / 2);
    const o = new THREE.Mesh(g, P.steel);
    o.position.set(289, top - 1.4, 25.3);
    b.add(o, { cast: false });
  }
  for (let x = 272; x < 310; x += 7) box(b, H.iron, x, top - 0.8, 25.3, 0.08, 0.7, 0.08, 0, false);
  for (const [x, z] of [
    [285, 33],
    [285, 52],
  ] as const) blk(c, H.concrete, x, y, z, 1.1, 7, 1.1, 'pillar');
  // the deputy's table where the tape lies: a stool, his lamp, the first-aid box on the wall
  const t = TAPES[3]!;
  blk(c, H.wood, t.x, y, t.z - 2.3, 1.4, 0.78, 0.8, 'deputy-table', { shots: false });
  box(b, H.iron, t.x + 0.45, y + 0.9, t.z - 2.4, 0.18, 0.24, 0.14, 0, false);
  box(b, H.lamp, t.x + 0.45, y + 1.07, t.z - 2.3, 0.1, 0.1, 0.04, 0, false);
  box(b, P.paper, t.x - 0.3, y + 0.8, t.z - 2.3, 0.4, 0.01, 0.3, 0.2, false);
  blk(c, H.woodDark, t.x - 1.3, y, t.z - 2.0, 0.4, 0.45, 0.4, 'stool', { shots: false });
  box(b, H.white, t.x + 2, y + 1.6, 24.25, 0.6, 0.5, 0.2, 0, false);
  box(b, H.red, t.x + 2, y + 1.6, 24.38, 0.3, 0.08, 0.02, 0, false);
  box(b, H.red, t.x + 2, y + 1.6, 24.38, 0.08, 0.3, 0.02, 0, false);
  // supplies along the west side: a bundle of props, a cable drum, crates
  for (let k = 0; k < 6; k++) box(b, H.wood, 271.5, y + 0.16 + Math.floor(k / 3) * 0.3, 30 + (k % 3) * 0.32, 3.6, 0.28, 0.28, 0, false);
  solid(c, 271.5, 30.3, 3.6, 1.1, y + 0.6, 'props', { surface: 'wood' });
  {
    const g = new THREE.CylinderGeometry(0.9, 0.9, 0.8, 16).rotateX(Math.PI / 2);
    const o = new THREE.Mesh(g, H.wood);
    o.position.set(304, y + 0.9, 33);
    b.add(o, { cast: false });
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.84, 14).rotateX(Math.PI / 2), H.coal);
    k.position.set(304, y + 0.9, 33);
    b.add(k, { cast: false });
  }
  solid(c, 304, 33, 1.8, 0.9, y + 1.8, 'cable-drum', { shots: false });
  for (const [x, z, s] of [
    [306.5, 36, 1],
    [307.4, 37.1, 0.8],
  ] as const) blk(c, H.wood, x, y, z, s, s, s, 'crate', { shots: false });
  lamp(c, 281, top - 1.6, C.z, { mode: 'steady', intensity: 40, distance: 16, color: 0xffc080 });
  for (const [x, z] of [
    [277, 24.75],
    [289, 24.75],
    [301, 24.75],
    [277, 61.25],
    [283, 61.25],
  ] as const) lamp(c, x, y + 3.3, z);
  lamp(c, t.x, top - 2.6, t.z - 1.4, { mode: 'flicker', intensity: 26, distance: 13 });
  lamp(c, 300, top - 1.6, 36);
}

/** The deep lamp room: the tag board (the memorial), dead lamps, a bench facing the board, the ladle bench. */
function lampRoom(c: Ctx): void {
  const { b } = c;
  const y = DEEP_Y;
  const r = { x0: 290, z0: 46, x1: 310, z1: 62 };
  const h = 3.8;
  // walls on the landing's sides (the rock is its east and south walls), a door from the landing, a ceiling
  for (const [x0, z0, x1, z1] of [
    [r.x0, r.z0, r.x0 + 0.3, 50.8],
    [r.x0, 53.2, r.x0 + 0.3, r.z1],
    [r.x0, r.z0, r.x1, r.z0 + 0.3],
  ] as const) blk(c, H.plaster, (x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, h, z1 - z0, 'lamp-room');
  box(b, H.coal, 300, y + 1.7, r.z0 + 0.15, 2.4, 1.1, 0.34, 0, false);
  box(b, H.woodDark, 300, y + 1.12, r.z0 + 0.15, 2.6, 0.08, 0.44, 0, false);
  box(b, H.plaster, 290.15, y + 3.15, 52, 0.3, 1.3, 2.4, 0, false);
  box(b, H.woodDark, 290.15, y + 2.45, 52, 0.4, 0.15, 2.6, 0, false);
  box(b, H.concreteDark, (r.x0 + r.x1) / 2, y + h + 0.1, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.2, r.z1 - r.z0, 0, false);
  c.b.collide({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2, y0: y + h, y1: y + h + 0.2, blocksMove: false, blocksShots: true, mapKind: 'none', tag: 'roof' });
  box(b, H.woodDark, (r.x0 + r.x1) / 2, y + 0.02, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 0.4, 0.03, r.z1 - r.z0 - 0.4, 0, false);
  // the tag board on the south wall: rows of brass tags, every one a man who went down; some hooks empty
  const tb = DEEP_SPOTS.tagBoard;
  const bz = r.z1 - 0.45;
  blk(c, H.woodDark, tb.x, y, bz, 5.4, 3.1, 0.3, 'tag-board');
  box(b, H.wood, tb.x, y + 3.16, bz, 5.8, 0.14, 0.4, 0, false);
  for (const s of [-1, 1]) box(b, H.wood, tb.x + s * 2.75, y + 1.6, bz - 0.05, 0.14, 3.2, 0.36, 0, false);
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 22; col++) {
      if ((row * 7 + col * 3) % 11 === 5) continue;
      box(b, P.brass, tb.x - 2.3 + col * 0.219, y + 2.75 - row * 0.3, bz - 0.17, 0.12, 0.19, 0.02, 0, false);
    }
  }
  // the ledge under it: a candle, a sake cup, a sprig in a jar
  box(b, H.wood, tb.x, y + 0.92, bz - 0.3, 3.6, 0.06, 0.32, 0, false);
  cyl(b, P.paper, tb.x - 0.6, y + 0.95, bz - 0.3, 0.04, 0.04, 0.2, 8, false);
  box(b, H.lamp, tb.x - 0.6, y + 1.2, bz - 0.3, 0.03, 0.06, 0.03, 0, false);
  cyl(b, H.white, tb.x + 0.2, y + 0.95, bz - 0.3, 0.035, 0.045, 0.06, 10, false);
  cyl(b, H.bone, tb.x + 0.9, y + 0.95, bz - 0.3, 0.05, 0.05, 0.16, 8, false);
  box(b, H.green, tb.x + 0.9, y + 1.25, bz - 0.3, 0.02, 0.3, 0.12, 0.4, false);
  // a small kamidana above, its straw rope and paper
  box(b, H.woodPale, tb.x, y + 3.4, bz - 0.05, 1.4, 0.06, 0.4, 0, false);
  box(b, H.woodPale, tb.x, y + 3.6, bz - 0.05, 0.5, 0.34, 0.26, 0, false);
  box(b, P.straw, tb.x, y + 3.36, bz - 0.27, 1.3, 0.05, 0.05, 0, false);
  for (const dx of [-0.4, 0.4]) box(b, P.paper, tb.x + dx, y + 3.2, bz - 0.28, 0.08, 0.22, 0.01, 0, false);
  // a plain bench facing the board
  blk(c, H.wood, tb.x, y, tb.z - 3.4, 3.4, 0.45, 0.4, 'bench', { shots: false });
  // racks of dead cap lamps along the east wall and the north wall's east end
  const rack = (x0: number, z0: number, x1: number, z1: number): void => {
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (const k of [0, 1, 2, 3]) {
      const yy = y + 0.5 + k * 0.6;
      box(b, H.wood, cx, yy, cz, alongX ? len : 0.45, 0.05, alongX ? 0.45 : len, 0, false);
      const n = Math.floor(len / 0.4);
      for (let i = 0; i < n; i++) {
        if ((i * 5 + k * 3) % 9 === 0) continue;
        const t = (i + 0.5) / n;
        box(b, H.iron, alongX ? x0 + t * len : cx, yy + 0.15, alongX ? cz : z0 + t * len, 0.16, 0.24, 0.12, 0, false);
        box(b, P.steel, alongX ? x0 + t * len : cx - 0.1, yy + 0.32, alongX ? cz + 0.1 : z0 + t * len, 0.1, 0.1, 0.1, 0, false);
      }
    }
    solid(c, cx, cz, alongX ? len : 0.5, alongX ? 0.5 : len, y + 2.6, 'lamp-rack', { surface: 'wood' });
  };
  rack(r.x1 - 0.55, r.z0 + 2, r.x1 - 0.05, r.z1 - 2.4);
  rack(302.4, r.z0 + 0.35, r.x1 - 1.2, r.z0 + 0.85);
  // the workbench by the door (the ladles' bottoms are knocked out here): a vice, a hammer
  const be = DEEP_SPOTS.bench;
  blk(c, H.wood, be.x, y, be.z - 1.3, 2.4, 0.9, 0.8, 'ladle-bench');
  box(b, H.iron, be.x + 0.7, y + 1.05, be.z - 1.3, 0.3, 0.22, 0.24, 0, false);
  box(b, H.wood, be.x - 0.4, y + 0.94, be.z - 1.2, 0.5, 0.04, 0.05, 0.3, false);
  box(b, H.iron, be.x - 0.17, y + 0.96, be.z - 1.13, 0.08, 0.08, 0.16, 0.3, false);
  // one steady lamp over the board
  box(b, H.iron, tb.x, y + h - 0.12, tb.z - 2.6, 0.3, 0.1, 0.3, 0, false);
  box(b, H.lamp, tb.x, y + h - 0.24, tb.z - 2.6, 0.18, 0.12, 0.18, 0, false);
  b.light({ x: tb.x, y: y + h - 0.4, z: tb.z - 2.4, color: 0xffd8a0, intensity: 30, distance: 12, mode: 'steady', pool: 2.2, glow: 0.3, tag: 'lamp-room' });
}

/** The flooded galleries: water to the knee, timber sets, the rock the loop runs round, the props, the telephone. */
function galleries(c: Ctx, M: ReturnType<typeof dressMats>): void {
  const { b } = c;
  const y = DEEP_Y;
  const wy = y + 0.4;
  // the water: one sheet over the gallery rooms, a concrete sill where the dry landing ends
  box(b, P.water, 357, wy, 44, 94, 0.03, 32, 0, false);
  box(b, H.concreteDark, 310.4, y + 0.12, 40, 0.8, 0.24, 12, 0, false);
  // the rock block the loop runs round (x 342..374, z 43..53)
  const R = { x0: 342, z0: 43, x1: 374, z1: 53 };
  box(b, P.rock, (R.x0 + R.x1) / 2, (y + 13.6) / 2, (R.z0 + R.z1) / 2, R.x1 - R.x0 - 1, 13.6 - y + 0.1, R.z1 - R.z0 - 1, 0, false);
  box(b, P.rock, (R.x0 + R.x1) / 2, y / 2, (R.z0 + R.z1) / 2, R.x1 - R.x0 - 1, y, R.z1 - R.z0 - 1, 0, false);
  for (let x = R.x0 + 2; x < R.x1 - 1; x += 4.6) {
    for (const [z, s] of [
      [R.z0 + 0.6, 1],
      [R.z1 - 0.6, -1],
    ] as const) crag(b, M.rock, { x: x + s * 0.8, y: y + 2.4, z, sx: 2.8, sy: 3.2, sz: 1.0, seed: 1500 + Math.round(x) * 2 + (s > 0 ? 0 : 1), detail: 1, tone: [0.03, 0.028, 0.026] });
  }
  for (const [x, z] of [
    [R.x0 + 0.6, (R.z0 + R.z1) / 2],
    [R.x1 - 0.6, (R.z0 + R.z1) / 2],
  ] as const) crag(b, M.rock, { x, y: y + 2.6, z, sx: 1.0, sy: 3.4, sz: 4.2, seed: 1590 + Math.round(x), detail: 1, tone: [0.03, 0.028, 0.026] });
  solid(c, (R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2, R.x1 - R.x0, R.z1 - R.z0, 13.6, 'gallery-rock', { kind: 'wall' });

  // timber sets down every lane
  const props = OBSTACLES.find((o) => o.id === 'props')!.at;
  for (const x of [314, 318, 322, 326]) set(c, x, 34, 46, y, 13.6);
  for (const x of [344, 348, 352, 356, 364, 368, 372]) set(c, x, 34, R.z0, y, 13.6);
  for (const x of [344, 348, 356, 360, 364, 368, 372]) set(c, x, R.z1, 60, y, 13.2);
  for (const x of [386, 390, 401.5]) set(c, x, 34, 46, y, 13.6);
  setZ(c, 49, 330, R.x0, y, 13.2);
  setZ(c, 49, R.x1, 384, y, 13.2);
  // the rotten props (the axe drops this roof on whatever follows): posts leaning, the cap broken and sagging, lagging
  // hanging, rock sitting on it
  // (final polish: drawn as one named mesh, `hs-rotten-props`, that `hirasaka/arms.ts` hides when the axe brings the
  // roof down; the posts' colliders go with it in `hirasaka/doors.ts`)
  hideable(c.b, 'hs-rotten-props', (b) => {
    const px = props.x;
    for (const [z, t] of [
      [34.35, 0.07],
      [R.z0 - 0.35, -0.09],
    ] as const) {
      slab(b, H.wood, px, (y + 13.2) / 2, z, 0.3, 13.2 - y, 0.3, t, 0, 0.05, false);
      solid(c, px, z, 0.4, 0.4, 13.2, 'rotten-prop', { surface: 'wood' });
    }
    const mid = (34 + R.z0) / 2;
    slab(b, H.wood, px, 12.95, (34 + mid) / 2, 0.32, 0.3, mid - 34 + 0.3, 0.12, 0, 0, false);
    slab(b, H.wood, px, 12.95, (mid + R.z0) / 2, 0.32, 0.3, R.z0 - mid + 0.3, -0.12, 0, 0, false);
    for (const [dz, rx] of [
      [-2.2, 0.5],
      [0.9, -0.7],
      [2.6, 0.3],
    ] as const) slab(b, H.woodPale, px + 0.4, 12.4, mid + dz, 0.4, 1.4, 0.05, rx, 0.2, 0, false);
    for (const dz of [-1.5, 1.2]) crag(b, M.rock, { x: px + 0.2, y: 13.3, z: mid + dz, sx: 0.7, sy: 0.4, sz: 0.8, seed: 1620 + Math.round(dz * 10), detail: 1, tone: [0.04, 0.035, 0.03] });
    // raking props someone added in a hurry
    beam(b, H.woodPale, [px - 2.4, y, 34.6], [px - 0.2, 12.6, 36.5], 0.2, 0.2);
    beam(b, H.woodPale, [px + 2.4, y, R.z0 - 0.5], [px + 0.2, 12.6, R.z0 - 2.4], 0.2, 0.2);
  });

  // half-sunk tubs, barrels in the corner niche, a plank ventilation door, lamps on the posts
  rails(b, 310, 40, 344, 40, y + 0.36);
  tub(c, 324.2, 44.4, y, true);
  tub(c, 366.5, 57.6, y, true, true);
  tub(c, 364.5, 31, y, true);
  tub(c, 380, 36.4, y, false);
  for (const [x, z] of [
    [312, 34.9],
    [313.1, 35.1],
    [312.5, 36.0],
  ] as const) {
    cyl(b, H.woodDark, x, y, z, 0.32, 0.32, 0.9, 10, false);
    solid(c, x, z, 0.64, 0.64, y + 0.9, 'barrel', { shots: false });
  }
  const vz = 58.4;
  box(b, H.woodDark, 383.9, y + 1.6, vz, 0.12, 3.2, 2.4, 0, false);
  for (let k = 0; k < 5; k++) box(b, H.wood, 383.82, y + 1.6, vz - 0.95 + k * 0.47, 0.06, 3.0, 0.4, 0, false);
  slab(b, H.woodDark, 383.78, y + 1.6, vz, 0.05, 3.5, 0.12, 0.62, 0, 0, false);
  box(b, H.iron, 383.8, y + 1.5, vz + 0.95, 0.08, 0.3, 0.06, 0, false);
  for (const [x, z] of [
    [314, 34.55],
    [348, 34.55],
    [368, 59.45],
    [344, 53.45],
    [401.5, 45.45],
    [372, 42.45],
  ] as const) lamp(c, x, y + 3.1, z);
  lamp(c, 322, 12.6, 40, { mode: 'flicker', intensity: 50 });
  lamp(c, props.x + 2, 12.6, 38.5, { mode: 'fail', intensity: 46 });
  lamp(c, 388, 12.6, 40, { mode: 'flicker', intensity: 46 });

  // drips from the roof, rings where they land
  const drips: [number, number][] = [
    [316, 38], [320, 43], [329, 36], [334, 50], [338, 57], [345, 39], [351, 36], [358, 55.6], [362, 41.5], [370, 37],
    [376, 47], [379, 55], [382, 39], [387, 43], [391, 36], [399, 39], [403, 44], [355, 30.5], [366, 29.5], [335, 41],
  ];
  for (const [x, z] of drips) {
    const roof = z >= 46 && z < 60 && x >= 330 && x < 384 ? 13.2 : 13.6;
    // a thread of drops from the roof (short dashes, longer near the roof where it seeps)
    for (let yy = roof - 0.1, k = 0; yy > wy + 0.3; k++) {
      const len = k < 2 ? 0.5 : 0.12;
      box(b, P.drip, x, yy - len / 2, z, 0.018, len, 0.018, 0, false);
      yy -= len + 0.35 + ((x * 7 + k * 13) % 5) * 0.12;
    }
    const g = new THREE.TorusGeometry(0.22, 0.015, 4, 14).rotateX(Math.PI / 2);
    const o = new THREE.Mesh(g, P.drip);
    o.position.set(x, wy + 0.02, z);
    b.add(o, { cast: false });
  }

  // the telephone in its niche on the far wall: a board, the box, its bells and handset, a lamp over it
  const ph = DEEP_SPOTS.phone;
  const wz = 59.85;
  box(b, H.woodDark, ph.x, y + 1.8, wz, 1.3, 1.9, 0.1, 0, false);
  box(b, H.woodDark, ph.x, y + 2.85, wz - 0.25, 1.5, 0.08, 0.5, 0, false);
  box(b, H.wood, ph.x, y + 1.85, wz - 0.16, 0.4, 0.56, 0.2, 0, false);
  for (const dx of [-0.1, 0.1]) cyl(b, P.brass, ph.x + dx, y + 2.13, wz - 0.12, 0.06, 0.06, 0.05, 8, false);
  box(b, H.coal, ph.x + 0.26, y + 1.8, wz - 0.2, 0.06, 0.3, 0.08, 0, false);
  tube(b, H.coal, [[ph.x + 0.26, y + 1.66, wz - 0.2], [ph.x + 0.34, y + 1.3, wz - 0.25], [ph.x + 0.2, y + 1.35, wz - 0.18]], 0.012);
  beam(b, H.coal, [ph.x - 0.4, y + 1.5, wz - 0.06], [ph.x - 0.4, 13.2, wz - 0.06], 0.03, 0.03);
  lamp(c, ph.x, y + 2.65, wz - 0.4, { mode: 'steady', intensity: 24, distance: 10 });

  // the straw rope just past the funayūrei's line (their line itself stays clear)
  const rx = DEEP_SPOTS.funaGate.x1 + 3.2;
  for (const z of [34.3, 45.7]) blk(c, H.woodDark, rx, y, z, 0.3, 4.4, 0.3, 'rope-post', { shots: false });
  const sag: P3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    sag.push([rx, y + 3.9 - 0.7 * 4 * t * (1 - t), 34.3 + t * 11.4]);
  }
  tube(b, P.straw, sag, 0.07);
  for (let i = 1; i < 8; i++) {
    const p = sag[i]!;
    box(b, P.paper, p[0], p[1] - 0.28, p[2], 0.01, 0.42, 0.12, 0, false);
    box(b, P.paper, p[0], p[1] - 0.52, p[2] + 0.06, 0.01, 0.2, 0.12, 0, false);
  }
}

/** The coal face: the glittering face behind its props, the conveyor, the rock drill, tubs, the tool crib. */
function coalFace(c: Ctx, M: ReturnType<typeof dressMats>): void {
  const { b } = c;
  const y = DEEP_Y;
  const top = y + 6;
  // the face itself along the east wall: a black mass broken into facets, glinting where the lamps catch it
  box(b, H.coal, 469.6, (y + top) / 2, 42, 0.8, 6, 36, 0, false);
  for (let z = 25.5, i = 0; z < 59; z += 3.3, i++) crag(b, M.rock, { x: 469.4, y: y + 2.6 + (i % 2) * 0.6, z, sx: 1.0, sy: 2.6, sz: 2.0, seed: 1700 + i, detail: 1, tone: [0.03, 0.03, 0.034] });
  for (let i = 0; i < 34; i++) {
    const z = 25 + ((i * 37) % 340) / 10;
    const yy = y + 0.8 + ((i * 53) % 44) / 10;
    box(b, P.steel, 469.18 - ((i * 7) % 4) * 0.05, yy, z, 0.05, 0.09, 0.09, i * 0.7, false);
  }
  for (let i = 0; i < 12; i++) box(b, H.coal, 468.3 + (i % 3) * 0.3, y + 0.18, 26 + i * 2.9, 0.5, 0.36, 0.6, i * 1.3, false);
  solid(c, 469.6, 42, 0.8, 36, top, 'coal-face', { kind: 'wall' });
  // the props holding the roof over the face, a cap beam along them
  for (let z = 26; z <= 58; z += 4) {
    box(b, P.steel, 465.5, y + 1.6, z, 0.24, 3.2, 0.24, 0, false);
    box(b, H.wood, 465.5, (y + 3.2 + top - 0.4) / 2, z, 0.3, top - 0.4 - y - 3.2, 0.3, 0, false);
    solid(c, 465.5, z, 0.32, 0.32, top, 'face-prop', { surface: 'metal' });
    box(b, H.woodDark, 467.7, top - 0.25, z, 4.6, 0.3, 0.3, 0, false);
  }
  box(b, H.woodDark, 465.5, top - 0.25, 42, 0.34, 0.3, 34, 0, false);
  // the chain conveyor along the face, its drive at the south end
  const cxv = 462.6;
  box(b, H.iron, cxv, y + 0.5, 43, 0.9, 0.36, 30, 0, false);
  for (const s of [-1, 1]) box(b, P.steel, cxv + s * 0.48, y + 0.62, 43, 0.06, 0.3, 30, 0, false);
  for (let z = 28.4; z < 58; z += 0.8) box(b, P.steel, cxv, y + 0.7, z, 0.84, 0.05, 0.08, 0, false);
  for (let z = 30; z < 57; z += 2.2) box(b, H.coal, cxv + ((z * 3) % 1) * 0.3 - 0.15, y + 0.82, z, 0.36, 0.2, 0.32, z, false);
  for (let z = 29; z < 58; z += 4) box(b, H.iron, cxv, y + 0.16, z, 0.7, 0.32, 0.2, 0, false);
  box(b, P.loco, cxv, y + 0.7, 59, 1.5, 1.4, 1.8, 0, false);
  {
    const g = new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12).rotateZ(Math.PI / 2);
    const o = new THREE.Mesh(g, P.steel);
    o.position.set(cxv, y + 0.55, 27.6);
    b.add(o, { cast: false });
  }
  solid(c, cxv, 43.5, 1.0, 32, y + 1.0, 'conveyor', { shots: false, surface: 'metal' });
  solid(c, cxv, 59, 1.5, 1.8, y + 1.4, 'conveyor-drive', { surface: 'metal' });
  // the rock drill on its tripod, boring into the face, its air hose back over the conveyor
  const dz = 40;
  const ap: P3 = [467.3, y + 1.4, dz];
  for (const f of [
    [466.4, y, dz - 0.8],
    [466.4, y, dz + 0.8],
    [468.0, y, dz],
  ] as const) beam(b, H.iron, ap, f, 0.07, 0.07);
  box(b, P.steel, 467.5, y + 1.5, dz, 0.9, 0.28, 0.28, 0, false);
  box(b, H.iron, 468.4, y + 1.5, dz, 0.9, 0.05, 0.05, 0, false);
  tube(b, H.coal, [[467.1, y + 1.5, dz], [465.6, y + 0.8, dz + 0.6], [463.8, y + 1.3, dz + 1.2], [461.4, y + 0.06, dz + 1.6], [458, y + 0.06, dz + 3]], 0.05);
  solid(c, 467.3, dz, 1.4, 1.6, y + 1.6, 'rock-drill', { shots: false, surface: 'metal' });
  // the main line in from the galleries and a string of loaded tubs on it; a buffer at its end
  rails(b, 404, 40, 446, 40, y);
  for (const x of [428, 429.8, 431.6]) tub(c, x, 40, y, true);
  blk(c, H.woodDark, 446.4, y, 40, 0.4, 0.7, 1.4, 'stop-block', { shots: false });
  // the Sakuganki's bench: a heavy table, a toolbox, a coil of hose
  const sk = WORKBENCHES.find((w) => w.id === 'sakuganki')!;
  blk(c, H.wood, sk.x, y, sk.z + 1.6, 2.2, 0.9, 0.8, 'bench-sakuganki');
  box(b, H.red, sk.x - 0.5, y + 1.02, sk.z + 1.6, 0.5, 0.24, 0.26, 0, false);
  {
    const g = new THREE.TorusGeometry(0.3, 0.05, 6, 16).rotateX(Math.PI / 2);
    const o = new THREE.Mesh(g, H.coal);
    o.position.set(sk.x + 0.5, y + 0.95, sk.z + 1.6);
    b.add(o, { cast: false });
  }
  // the photo's crate: a lamp tin and a helmet set down on it
  const ph = PHOTOS[4]!;
  blk(c, H.wood, ph.x, y, ph.z + 1.7, 0.9, 0.9, 0.9, 'crate', { shots: false });
  cyl(b, H.white, ph.x + 0.2, y + 0.9, ph.z + 1.8, 0.16, 0.12, 0.14, 10, false);
  cyl(b, P.steel, ph.x - 0.22, y + 0.9, ph.z + 1.6, 0.1, 0.1, 0.12, 8, false);
  // the tool crib against the south wall: posts, a roof, plank sides, shovels and picks racked inside; the company
  // price board on its two middle posts
  const wb = WALL_BUYS[5]!;
  const z0 = wb.z + 1.6;
  const cz = (z0 + 64) / 2;
  for (const x of [wb.x - 6, wb.x - 1.4, wb.x + 1.4, wb.x + 6]) blk(c, H.woodDark, x, y, z0, 0.26, 3.4, 0.26, 'crib-post', { shots: false });
  box(b, H.woodDark, wb.x, y + 3.5, cz, 12.6, 0.16, 64 - z0 + 0.4, 0, false);
  box(b, H.wood, wb.x, y + 3.3, z0, 12.4, 0.2, 0.2, 0, false);
  for (const x of [wb.x - 6, wb.x + 6]) {
    box(b, H.wood, x, y + 1.7, cz, 0.08, 3.3, 64 - z0, 0, false);
    solid(c, x, cz, 0.12, 64 - z0, y + 3.4, 'crib-side', { surface: 'wood' });
  }
  box(b, H.woodDark, wb.x, y + 1.9, z0 - 0.15, 2.6, 1.5, 0.08, 0, false);
  solid(c, wb.x, z0 - 0.15, 2.6, 0.12, y + 2.65, 'price-board', { shots: false });
  for (let k = 0; k < 4; k++) box(b, P.paper, wb.x - 0.6 + (k % 2) * 1.2, y + 2.25 - Math.floor(k / 2) * 0.6, z0 - 0.2, 0.9, 0.34, 0.02, 0, false);
  box(b, H.woodDark, wb.x, y + 1.0, 63.6, 11, 0.08, 0.3, 0, false);
  for (let k = 0; k < 14; k++) {
    const x = wb.x - 5 + k * 0.75;
    box(b, H.wood, x, y + 0.95, 63.4, 0.05, 1.5, 0.05, 0.08 * ((k % 3) - 1), false);
    box(b, k % 2 ? P.steel : H.iron, x, y + (k % 2 ? 0.25 : 1.75), 63.4, k % 2 ? 0.26 : 0.5, k % 2 ? 0.32 : 0.06, 0.05, 0, false);
  }
  solid(c, wb.x, 63.5, 11, 0.6, y + 1.8, 'tool-rack', { surface: 'wood' });
  for (const [x, z] of [
    [wb.x - 4.4, 61],
    [wb.x + 4.2, 61.4],
  ] as const) blk(c, H.wood, x, y, z, 1, 1, 1, 'crate', { shots: false });
  // a spare stack of props by the west wall
  for (let k = 0; k < 9; k++) box(b, k % 2 ? H.woodPale : H.wood, 406 + (k % 3) * 0.32, y + 0.16 + Math.floor(k / 3) * 0.3, 27, 0.28, 0.28, 4.2, 0, false);
  solid(c, 406.3, 27, 1.1, 4.2, y + 0.95, 'props', { surface: 'wood' });
  // the lamps
  lamp(c, wb.x, y + 3.2, z0 + 1.0, { mode: 'steady', intensity: 28, distance: 13 });
  lamp(c, 436, top - 0.8, 40, { mode: 'flicker', intensity: 36, distance: 17 });
  lamp(c, sk.x + 1, top - 0.8, sk.z - 3, { mode: 'flicker', intensity: 36, distance: 16 });
  for (const z of [30, 38, 46, 54]) lamp(c, 464.6, top - 0.75, z, z === 38 || z === 54 ? { mode: z === 38 ? 'steady' : 'flicker', intensity: 40, distance: 12, color: 0xffc070 } : undefined);
  for (const [x, z] of [
    [412, 44],
    [424, 30],
    [446, 56],
  ] as const) lamp(c, x, top - 0.9, z);
}

/** The powder magazine: a bulkhead, the vault door swung open under a red lamp, the Happa's bench before it. */
function magazine(c: Ctx): void {
  const { b } = c;
  const y = DEEP_Y;
  const zw = 19.75;
  const gx0 = 459.6;
  const gx1 = 462.4;
  blk(c, H.concreteDark, (452 + gx0) / 2, y, zw, gx0 - 452, 4, 0.5, 'magazine-wall');
  blk(c, H.concreteDark, (gx1 + 470) / 2, y, zw, 470 - gx1, 4, 0.5, 'magazine-wall');
  box(b, H.concreteDark, (gx0 + gx1) / 2, y + 3.5, zw, gx1 - gx0, 1.0, 0.5, 0, false);
  for (const x of [gx0 - 0.1, gx1 + 0.1]) box(b, H.iron, x, y + 1.5, zw + 0.27, 0.2, 3, 0.1, 0, false);
  box(b, H.iron, (gx0 + gx1) / 2, y + 3.0, zw + 0.27, gx1 - gx0 + 0.4, 0.2, 0.1, 0, false);
  // the door leaf, swung in against the wall's inside, its wheel
  blk(c, P.steel, gx1 + 0.2, y, zw - 1.6, 0.24, 2.9, 2.6, 'vault-door', { shots: true });
  {
    const g = new THREE.TorusGeometry(0.34, 0.04, 6, 16).rotateY(Math.PI / 2);
    const o = new THREE.Mesh(g, H.iron);
    o.position.set(gx1 + 0.05, y + 1.5, zw - 1.6);
    b.add(o, { cast: false });
  }
  for (const dz of [-0.9, 0, 0.9]) box(b, H.iron, gx1 + 0.06, y + 1.5, zw - 1.6 + dz, 0.06, 2.6, 0.08, 0, false);
  // the red lamp over the door (the one glow of its own down here)
  box(b, H.iron, (gx0 + gx1) / 2, y + 4.3, zw + 0.36, 0.34, 0.06, 0.3, 0, false);
  box(b, P.red, (gx0 + gx1) / 2, y + 4.12, zw + 0.36, 0.22, 0.28, 0.22, 0, false);
  b.light({ x: (gx0 + gx1) / 2, y: y + 3.9, z: zw + 0.8, color: 0xff3a24, intensity: 18, distance: 9, mode: 'steady', pool: 2, glow: 0.55, tag: 'magazine' });
  // the Happa's bench before the door: wire, a tin of parts, a ruler
  const hp = WORKBENCHES.find((w) => w.id === 'happa')!;
  blk(c, H.wood, hp.x, y, hp.z - 1.6, 2.2, 0.9, 0.8, 'bench-happa');
  {
    const g = new THREE.TorusGeometry(0.22, 0.04, 6, 14).rotateX(Math.PI / 2);
    const o = new THREE.Mesh(g, H.rust);
    o.position.set(hp.x - 0.6, y + 0.93, hp.z - 1.6);
    b.add(o, { cast: false });
  }
  box(b, H.green, hp.x + 0.4, y + 1.0, hp.z - 1.65, 0.36, 0.2, 0.26, 0, false);
  box(b, H.woodPale, hp.x + 0.1, y + 0.91, hp.z - 1.4, 0.8, 0.01, 0.05, 0.2, false);
  // inside: shelves of crated charges along the back, sandbags, wire coils, a bench of plunger boxes
  for (const k of [0, 1, 2]) box(b, H.wood, 461, y + 0.4 + k * 0.9, 8.6, 14, 0.06, 0.8, 0, false);
  for (let i = 0; i < 27; i++) {
    const k = i % 3;
    const x = 454.6 + Math.floor(i / 3) * 1.5 + (k % 2) * 0.3;
    box(b, H.woodPale, x, y + 0.7 + k * 0.9, 8.65, 0.9, 0.55, 0.6, 0, false);
  }
  for (const x of [454, 468]) box(b, H.woodDark, x, y + 1.5, 8.6, 0.1, 3, 0.85, 0, false);
  solid(c, 461, 8.6, 14.2, 0.9, y + 2.8, 'magazine-shelves', { surface: 'wood' });
  for (let k = 0; k < 8; k++) box(b, P.sand, 453.2 + (k % 4) * 0.72, y + 0.2 + Math.floor(k / 4) * 0.36, 13.4 + (Math.floor(k / 4) % 2) * 0.1, 0.7, 0.34, 0.5, 0.04 * (k % 3), false);
  solid(c, 454.3, 13.4, 3, 0.6, y + 0.75, 'sandbags', { shots: false });
  for (const [x, z] of [
    [457, 16.6],
    [457.7, 17.4],
  ] as const) {
    const g = new THREE.TorusGeometry(0.34, 0.12, 6, 14).rotateX(Math.PI / 2);
    const o = new THREE.Mesh(g, H.rust);
    o.position.set(x, y + 0.12, z);
    b.add(o, { cast: false });
  }
  blk(c, H.wood, 467, y, 14, 0.9, 0.9, 2.2, 'plunger-bench', { shots: false });
  for (const dz of [-0.5, 0.5]) {
    box(b, H.green, 467, y + 1.08, 14 + dz, 0.4, 0.36, 0.3, 0, false);
    box(b, P.steel, 467, y + 1.4, 14 + dz, 0.04, 0.3, 0.04, 0, false);
    box(b, P.steel, 467, y + 1.55, 14 + dz, 0.04, 0.04, 0.3, 0, false);
  }
  for (const [x, z, s] of [
    [455.4, 17.6, 1],
    [456.5, 18.2, 0.8],
    [468.6, 11.4, 1],
  ] as const) blk(c, H.wood, x, y, z, s, s, s, 'crate', { shots: false });
}

/** The drift up to the fallen seam: timber sets, the rails ending at the fall, coal heaped at its sides. */
function drift(c: Ctx, M: ReturnType<typeof dressMats>): void {
  const { b } = c;
  const y = DEEP_Y;
  const top = y + 4.6;
  const seam = OBSTACLES.find((o) => o.id === 'drift')!;
  for (const z of [17, 13, 9, -1]) setZ(c, z, 430, 444, y, top);
  rails(b, seam.at.x, 20, seam.at.x, 7.2, y);
  // the fall: coal heaped against each wall at the seam (the way through, x 433..441, stays open behind the seam)
  for (const [x, s] of [
    [431.4, 1],
    [442.6, -1],
  ] as const) {
    crag(b, M.rock, { x, y: y + 0.5, z: 3.4, sx: 1.8, sy: 1.4, sz: 2.0, seed: 1760 + s, detail: 1, tone: COAL });
    solid(c, x, 3.4, 2.4, 3, y + 1.2, 'seam-fall', { shots: false });
  }
  // above the seam's block, the roof's broken coal; lumps scattered short of it
  for (const dx of [-4, -1, 2.5, 5]) crag(b, M.rock, { x: seam.at.x + dx, y: y + 4.0, z: 3.7, sx: 1.6, sy: 0.6, sz: 1.0, seed: 1770 + Math.round(dx * 3), detail: 1, tone: COAL });
  for (let i = 0; i < 7; i++) box(b, H.coal, seam.at.x - 3 + i, y + 0.14, 7.6 + ((i * 3) % 4) * 0.4, 0.4, 0.28, 0.36, i, false);
  lamp(c, seam.at.x, top - 0.8, 12, { mode: 'flicker', intensity: 26, distance: 13 });
}
