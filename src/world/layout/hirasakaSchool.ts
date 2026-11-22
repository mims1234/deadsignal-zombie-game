/**
 * HIRASAKA: BLOCK 65 AND THE SCHOOL (place group 'school', rect x -160..-40, z -76..-20, terrace y 7.2), and THE
 * HEIGHTS over them: Block 65's and the school's top floors and the footbridge (`places.ts` HEIGHTS, y 21.6, an upper
 * area: the frame built the three slabs, their rails and the school stair, a stairwell from its foot at
 * HEIGHTS.stairFoot to its head at HEIGHTS.stairHead).
 * Spots: JOBS.key (Genzō's room, up top), COMB, TAPES[1], PHOTOS[2] (school roof), SIDES fishpool + letters,
 * WALL_BUYS school.
 *
 * What stands here:
 *  - BLOCK 65, a U round a dirt courtyard, open to the south. The north wing is five storeys: its ground floor holds
 *    the little pachinko parlour and the hair salon either side of a covered pass-through to the back lane, and its
 *    roof (the `b65Top` slab) is the rooftop kindergarten (the blue slide, the round fish pool, the sandbox, the
 *    planters, the nursery hut) with Genzō's room, a two-room rooftop flat, at its west end. The west and east wings
 *    rise to nine storeys either side, wooden balconies on every floor; their ground floors are flats you can walk
 *    into. The corner stair towers are full of rubble from the typhoon (the only way up is the school's stair).
 *  - THE SCHOOL (Block 70): seven storeys of big windows. Ground floor: two classrooms, the staff room (the company
 *    price board), the music room, the entrance hall with its shoe lockers. The stair tower outside its south face
 *    is the frame's stairwell. The top floor (the `schoolTop` slab) is a corridor, a classroom, the music room and the
 *    stair lobby; the north half is the open roof (the photograph). The curved-roofed gym stands in front, where the
 *    closure was announced: the stage, the rows of folding chairs, the farewell letters on a table by the door.
 *  - THE FOOTBRIDGE: a covered steel bridge on two pillars from the school's top floor to Block 65's roof.
 *
 * Rule of the heights: everything on a top floor collides from the slab up (y 21.6): the ground's grid never sees it.
 * Everything on the terrace collides from y 0 (`solid`, `block`, `shell`).
 */
import * as THREE from 'three';
import type { Ctx } from './util';
import type { LevelBuilder } from '../builder';
import { H, box as kbox, cyl as kcyl, ground, solid, type Side } from './hirasakaKit';
import { HEIGHTS, WALL_BUYS, Y, type Rect } from '../../hirasaka/places';

export const SCHOOL_RECT = { x0: -160, z0: -76, x1: -40, z1: -20 };

// the kit's box and cylinder, casting no shadow unless asked (a shadow caster is a batch of its own)
const box = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0, cast = false): THREE.Mesh => kbox(b, mat, x, y, z, sx, sy, sz, rot, cast);
const cyl = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8): void => kcyl(b, mat, x, y, z, r0, r1, h, seg, false);

const T = Y.terrace;
const TOP = HEIGHTS.y;
const SH = 3.6; // a storey

const std = (color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });
/** The few colours the kit lacks, each on one of the kit's finishes (a finish is a batch: colour is free, finish is not). */
export const M = {
  glass: std(0x16222a, 0.6, 0.5),
  blue: std(0x2a6a9a, 0.55, 0.5),
  poolBlue: std(0x4a86a8, 0.85),
  board: std(0x23392e, 0.85),
  sand: std(0xb8a47a, 0.95),
  dirt: std(0x4a3e30, 0.95),
  leaf: std(0x2a3f26, 0.95),
  chair: std(0x8a948e, 0.55, 0.5),
  cream: std(0xd6ccae, 0.85),
  tv: std(0x3a3430, 0.85),
  pink: std(0xc87a8a, 0.85),
  yellow: std(0xc8a040, 0.85),
  paper: std(0xe8e2d0, 0.85),
  gold: std(0x9a7a3a, 0.55, 0.5),
  copper: std(0x4a7a6a, 0.85, 0.2),
  // the kit's colours moved onto these files' few finishes
  dark: std(0x0e0e10, 0.6, 0.5),
  water: std(0x13302e, 0.6, 0.5),
  wet: std(0x5d6566, 0.6, 0.5),
  plaster: std(0xb8b2a0, 0.92),
  brick: std(0x7a3a2a, 0.92),
  tile: std(0x9aa6a2, 0.92),
  red: std(0x9a2a1e, 0.85),
  rustDark: std(0x4a2a1a, 0.85, 0.2),
};

let seed = 1;
export const reseed = (n: number): void => {
  seed = n;
};
export const rnd = (): number => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

// ---------------------------------------------------------------------------------------------------------------------
// small pieces
// ---------------------------------------------------------------------------------------------------------------------

/** A beam from a to e (`w` thick), for frames, ladders and bars. */
export function beam(b: LevelBuilder, mat: THREE.Material, ax: number, ay: number, az: number, ex: number, ey: number, ez: number, w: number): void {
  const A = new THREE.Vector3(ax, ay, az);
  const d = new THREE.Vector3(ex, ey, ez).sub(A);
  const L = d.length();
  if (L < 1e-3) return;
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, L, w), mat);
  o.position.copy(A).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.add(o, { cast: false });
}

/** A visible box standing on `y` and its collider from `base` (0 on the terrace, the slab up top). */
export function thing(c: Ctx, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, base: number, tag: string, shots = false): void {
  box(c.b, mat, x, y + h / 2, z, w, h, d);
  c.b.collide({ x, z, hx: w / 2, hz: d / 2, y0: base, y1: y + h, blocksShots: shots, mapKind: 'prop', surface: 'wood', tag });
}

/** A run of wall along x (alongX) or z at `fixed`, from a to e, with gaps (doorways get a lintel); collides from `base`. */
export function wallLine(c: Ctx, alongX: boolean, fixed: number, a: number, e: number, y: number, h: number, gaps: readonly (readonly [number, number])[], mat: THREE.Material, base: number, tag: string, t = 0.25): void {
  let from = a;
  const run = (p: number, q: number): void => {
    if (q - p < 0.05) return;
    const mid = (p + q) / 2;
    const x = alongX ? mid : fixed;
    const z = alongX ? fixed : mid;
    box(c.b, mat, x, y + h / 2, z, alongX ? q - p : t, h, alongX ? t : q - p, 0, false);
    c.b.collide({ x, z, hx: alongX ? (q - p) / 2 : t / 2, hz: alongX ? t / 2 : (q - p) / 2, y0: base, y1: y + h, mapKind: 'wall', surface: 'concrete', tag });
  };
  for (const [p, q] of [...gaps].sort((u, v) => u[0] - v[0])) {
    run(from, p);
    if (h > 2.6) {
      const mid = (p + q) / 2;
      box(c.b, mat, alongX ? mid : fixed, y + (h + 2.4) / 2, alongX ? fixed : mid, alongX ? q - p : t, h - 2.4, alongX ? t : q - p, 0, false);
    }
    from = q;
  }
  run(from, e);
}

/** An enterable room: walls (doorways by side: middle from the side's west / north end, width), roof slab, 'roof' collider. */
export function room(c: Ctx, r: Rect, y: number, h: number, base: number, o: { doors?: { side: Side; at: number; w?: number }[]; wall?: THREE.Material; roof?: THREE.Material | null; tag: string }): void {
  const wall = o.wall ?? H.concrete;
  const gapsOf = (s: Side, from: number): [number, number][] => (o.doors ?? []).filter((d) => d.side === s).map((d) => [from + d.at - (d.w ?? 1.8) / 2, from + d.at + (d.w ?? 1.8) / 2]);
  wallLine(c, true, r.z0, r.x0, r.x1, y, h, gapsOf('N', r.x0), wall, base, o.tag, 0.3);
  wallLine(c, true, r.z1, r.x0, r.x1, y, h, gapsOf('S', r.x0), wall, base, o.tag, 0.3);
  wallLine(c, false, r.x0, r.z0, r.z1, y, h, gapsOf('W', r.z0), wall, base, o.tag, 0.3);
  wallLine(c, false, r.x1, r.z0, r.z1, y, h, gapsOf('E', r.z0), wall, base, o.tag, 0.3);
  if (o.roof === null) return;
  box(c.b, o.roof ?? H.concreteDark, (r.x0 + r.x1) / 2, y + h + 0.1, (r.z0 + r.z1) / 2, r.x1 - r.x0 + 0.4, 0.2, r.z1 - r.z0 + 0.4, 0, false);
  roofCollider(c, r, y + h);
}

export function roofCollider(c: Ctx, r: Rect, y: number): void {
  c.b.collide({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2, y0: y, y1: y + 0.2, blocksMove: false, blocksShots: true, mapKind: 'none', tag: 'roof' });
}

export type Face = 'N' | 'S' | 'E' | 'W';

/**
 * A row of windows along one face of `r` at height `y` (the pane `h` tall), one every `every` metres. Each pane is a
 * dark glass box through the wall line (seen from both sides); a share of them lit, and some boarded.
 */
export function windows(b: LevelBuilder, r: Rect, face: Face, y: number, h: number, every: number, lit: number, o: { w?: number; boarded?: number; through?: number; skip?: readonly (readonly [number, number])[] } = {}): void {
  const alongX = face === 'N' || face === 'S';
  const a = alongX ? r.x0 : r.z0;
  const e = alongX ? r.x1 : r.z1;
  const fixed = face === 'N' ? r.z0 : face === 'S' ? r.z1 : face === 'W' ? r.x0 : r.x1;
  const n = Math.max(1, Math.floor((e - a) / every));
  const step = (e - a) / n;
  const w = o.w ?? step * 0.62;
  const d = o.through ?? 0.42;
  for (let i = 0; i < n; i++) {
    const at = a + step * (i + 0.5);
    const k = rnd();
    if ((o.skip ?? []).some(([p, q]) => at + w / 2 > p - 0.15 && at - w / 2 < q + 0.15)) continue; // a doorway
    const mat = k < lit ? H.lamp : k < lit + (o.boarded ?? 0.12) ? H.woodDark : M.glass;
    box(b, mat, alongX ? at : fixed, y, alongX ? fixed : at, alongX ? w : d, h, alongX ? d : w, 0, false);
    // the frame's mullion
    if (w > 1.4) box(b, H.steel, alongX ? at : fixed, y, alongX ? fixed : at, alongX ? 0.06 : d + 0.04, h, alongX ? d + 0.04 : 0.06, 0, false);
  }
}

/**
 * A block's upper storeys seen from outside (no colliders: nobody stands in them): a concrete core from y0 to y1, a
 * floor band at every storey, windows on `win` faces, wooden balconies with partition fins on `balc` faces, rust
 * streaks down the walls.
 */
export function storeys(b: LevelBuilder, r: Rect, y0: number, y1: number, o: { win?: Face[]; balc?: Face[]; every?: number; lit?: number; wall?: THREE.Material; paneH?: number; paneW?: number; cap?: boolean }): void {
  const wall = o.wall ?? H.concrete;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  box(b, wall, cx, (y0 + y1) / 2, cz, w, y1 - y0, d, 0, false);
  const every = o.every ?? 3;
  for (let y = y0; y < y1 - 1; y += SH) {
    box(b, H.concreteDark, cx, y + 0.08, cz, w + 0.24, 0.18, d + 0.24, 0, false);
    for (const f of o.win ?? []) windows(b, r, f, y + 1.75, o.paneH ?? 1.5, every, o.lit ?? 0.1, { w: o.paneW });
    for (const f of o.balc ?? []) {
      const alongX = f === 'N' || f === 'S';
      const out = f === 'N' ? -1 : f === 'W' ? -1 : 1;
      const fixed = f === 'N' ? r.z0 : f === 'S' ? r.z1 : f === 'W' ? r.x0 : r.x1;
      const len = alongX ? w : d;
      const px = alongX ? cx : fixed + out * 0.6;
      const pz = alongX ? fixed + out * 0.6 : cz;
      windows(b, r, f, y + 1.4, 2.2, every * 1.4, o.lit ?? 0.1, { w: every * 0.7, through: 0.36 });
      if (y < y0 + 0.1) continue;
      box(b, H.concreteDark, px, y + 0.06, pz, alongX ? len : 1.2, 0.14, alongX ? 1.2 : len, 0, false);
      // the rail: wooden boards on the outer edge
      const rx = alongX ? cx : fixed + out * 1.15;
      const rz = alongX ? fixed + out * 1.15 : cz;
      box(b, rnd() < 0.15 ? H.rust : H.wood, rx, y + 0.6, rz, alongX ? len : 0.08, 0.9, alongX ? 0.08 : len, 0, false);
      const fins = Math.floor(len / 4);
      for (let k = 0; k <= fins; k++) {
        const at = (alongX ? r.x0 : r.z0) + (len / fins) * k;
        box(b, H.concrete, alongX ? at : px, y + 1.5, alongX ? pz : at, alongX ? 0.14 : 1.2, 3.0, alongX ? 1.2 : 0.14, 0, false);
      }
    }
  }
  if (o.cap !== false) box(b, H.concreteDark, cx, y1 + 0.45, cz, w + 0.1, 0.9, d + 0.1, 0, false);
  // rust streaks
  for (let k = 0; k < Math.floor((w + d) / 6); k++) {
    const f = (['N', 'S', 'E', 'W'] as const)[k % 4]!;
    const alongX = f === 'N' || f === 'S';
    const at = (alongX ? r.x0 : r.z0) + rnd() * (alongX ? w : d);
    const fixed = f === 'N' ? r.z0 - 0.02 : f === 'S' ? r.z1 + 0.02 : f === 'W' ? r.x0 - 0.02 : r.x1 + 0.02;
    const len = 3 + rnd() * (y1 - y0) * 0.5;
    box(b, H.stain, alongX ? at : fixed, y1 - len / 2, alongX ? fixed : at, alongX ? 0.4 : 0.04, len, alongX ? 0.04 : 0.4, 0, false);
  }
}

/** A lamp on a bracket or post, its collider from `base`, and its light. */
export function lamp(c: Ctx, x: number, y: number, z: number, base: number, o: { h?: number; color?: number; mode?: 'steady' | 'flicker' | 'fail'; tag: string; post?: boolean }): void {
  const h = o.h ?? 3;
  if (o.post !== false) {
    box(c.b, H.iron, x, y + h / 2, z, 0.1, h, 0.1);
    c.b.collide({ x, z, hx: 0.08, hz: 0.08, y0: base, y1: y + h, mapKind: 'prop', surface: 'metal', tag: 'lamp' });
  }
  box(c.b, H.lamp, x, y + h - 0.1, z, 0.3, 0.12, 0.3, 0, false);
  c.b.light({ x, y: y + h - 0.25, z, color: o.color ?? 0xffa860, intensity: 16, distance: 12, mode: o.mode ?? 'steady', pool: 2.6, glow: 0.45, tag: o.tag });
}

/** A street lamp on a post standing on a pad (its collider from y 0). */
export function lampPost(c: Ctx, x: number, y: number, z: number, o: { color?: number; mode?: 'steady' | 'flicker' | 'fail'; tag: string }): void {
  lamp(c, x, y, z, 0, { h: 4.6, color: o.color, mode: o.mode, tag: o.tag });
}

/** A crate, a drum or a pile of sacks on a pad (low: shots pass). */
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

/** The schoolyard's horizontal bars of three heights. */
function bars(c: Ctx, x: number, z: number, y: number): void {
  const hs = [0.9, 1.2, 1.5, 1.5];
  for (let i = 0; i < 4; i++) {
    const px = x - 2.1 + i * 1.4;
    box(c.b, M.blue, px, y + hs[i]! / 2, z, 0.1, hs[i]!, 0.1);
    solid(c, px, z, 0.16, 0.16, y + hs[i]!, 'bars', { surface: 'metal' });
    if (i < 3) box(c.b, H.steel, px + 0.7, y + hs[i]! - 0.04, z, 1.4, 0.05, 0.05);
  }
}

/** A water tank on a steel stand on a pad (its legs collide from y 0). */
function waterTower(c: Ctx, x: number, z: number, y: number): void {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      box(c.b, H.iron, x + sx * 1.2, y + 1.6, z + sz * 1.2, 0.14, 3.2, 0.14);
      solid(c, x + sx * 1.2, z + sz * 1.2, 0.2, 0.2, y + 3.2, 'tank', { surface: 'metal' });
    }
  for (const sx of [-1, 1]) beam(c.b, H.iron, x + sx * 1.2, y + 0.3, z - 1.2, x + sx * 1.2, y + 3, z + 1.2, 0.06);
  box(c.b, H.iron, x, y + 3.2, z, 2.8, 0.12, 2.8);
  cyl(c.b, H.steel, x, y + 3.3, z, 1.3, 1.3, 2.2, 16);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.5, 16), H.steel);
  cone.position.set(x, y + 5.75, z);
  c.b.add(cone);
}

/** A tree: a dark trunk and a lumpy crown (the island's few trees, salt-bent). */
export function tree(c: Ctx, x: number, y: number, z: number, h: number, base: number): void {
  cyl(c.b, H.woodDark, x, y, z, 0.16, 0.22, h * 0.6, 7);
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Mesh(new THREE.IcosahedronGeometry(h * (0.32 - k * 0.05), 0), M.leaf);
    g.position.set(x + (rnd() - 0.5) * 1.2, y + h * (0.6 + k * 0.17), z + (rnd() - 0.5) * 1.2);
    g.scale.y = 0.7;
    c.b.add(g);
  }
  c.b.collide({ x, z, hx: 0.25, hz: 0.25, y0: base, y1: y + h * 0.6, mapKind: 'prop', surface: 'wood', tag: 'tree' });
}

/** Rows of small desks and chairs facing `face` (one collider per row: they let shots by). */
function desks(c: Ctx, x0: number, z0: number, x1: number, z1: number, y: number, base: number, face: Face): void {
  const alongX = face === 'N' || face === 'S'; // rows run along x when the class faces north or south
  const rows = Math.max(1, Math.floor(((alongX ? z1 - z0 : x1 - x0) - 0.4) / 1.5));
  const per = Math.max(1, Math.floor((alongX ? x1 - x0 : z1 - z0) / 1.15));
  for (let i = 0; i < rows; i++) {
    const v = (alongX ? z0 : x0) + 0.75 + i * 1.5;
    for (let j = 0; j < per; j++) {
      if (j === Math.floor(per / 2)) continue; // the aisle
      const u = (alongX ? x0 : z0) + 0.55 + j * 1.15;
      if (rnd() < 0.08) continue; // one taken away
      const x = alongX ? u : v;
      const z = alongX ? v : u;
      const tilt = rnd() < 0.12 ? 0.5 : 0;
      box(c.b, H.woodPale, x, y + 0.68, z, alongX ? 0.62 : 0.45, 0.04, alongX ? 0.45 : 0.62, tilt);
      box(c.b, H.iron, x, y + 0.34, z, alongX ? 0.56 : 0.38, 0.66, alongX ? 0.38 : 0.56, tilt);
      const back = face === 'N' ? 0.45 : face === 'S' ? -0.45 : face === 'W' ? 0.45 : -0.45;
      const cx = alongX ? x : x + back;
      const cz = alongX ? z + back : z;
      box(c.b, H.wood, cx, y + 0.42, cz, 0.36, 0.04, 0.36);
      box(c.b, H.wood, alongX ? cx : cx + back * 0.35, y + 0.65, alongX ? cz + back * 0.35 : cz, alongX ? 0.36 : 0.04, 0.4, alongX ? 0.04 : 0.36);
    }
    const mid = alongX ? (x0 + x1) / 2 : (z0 + z1) / 2;
    const len = alongX ? x1 - x0 - 0.4 : z1 - z0 - 0.4;
    // two colliders per row, either side of the aisle
    for (const s of [-1, 1]) {
      const cu = mid + (s * len) / 4 + s * 0.4;
      c.b.collide({ x: alongX ? cu : v, z: alongX ? v : cu, hx: alongX ? len / 4 - 0.4 : 0.45, hz: alongX ? 0.45 : len / 4 - 0.4, y0: base, y1: y + 0.75, blocksShots: false, mapKind: 'prop', surface: 'wood', tag: 'desks' });
    }
  }
}

/** A blackboard on a wall (at `fixed`, facing into the room along `face`'s opposite), with its chalk ledge. */
function blackboard(b: LevelBuilder, alongX: boolean, fixed: number, at: number, y: number, len = 4): void {
  box(b, M.board, alongX ? at : fixed, y + 1.6, alongX ? fixed : at, alongX ? len : 0.06, 1.2, alongX ? 0.06 : len, 0, false);
  box(b, H.woodDark, alongX ? at : fixed, y + 0.98, alongX ? fixed : at, alongX ? len : 0.16, 0.05, alongX ? 0.16 : len, 0, false);
}

/** A room-local frame: `u` along the back wall from its middle, `v` out from the back wall toward the door. */
export function frame(r: Rect, back: Face): { W: number; D: number; at: (u: number, v: number) => { x: number; z: number }; wd: (w: number, d: number) => [number, number] } {
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const alongX = back === 'N' || back === 'S';
  const W = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
  const D = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
  const sgn = back === 'N' || back === 'W' ? -1 : 1;
  return {
    W,
    D,
    at: (u, v) => (alongX ? { x: cx + u, z: cz + sgn * (D / 2 - v) } : { x: cx + sgn * (D / 2 - v), z: cz + u }),
    wd: (w, d) => (alongX ? [w, d] : [d, w]),
  };
}

/** A 1974 flat: tatami, a low table, the TV, a twin-tub washer, a chest with a doll on it, the calendar on the wall. */
export function flat(c: Ctx, r: Rect, y: number, base: number, back: Face, o: { washer?: boolean; tv?: boolean } = {}): void {
  const F = frame(r, back);
  const { b } = c;
  box(b, H.tatami, (r.x0 + r.x1) / 2, y + 0.02, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 0.5, 0.03, r.z1 - r.z0 - 0.5, 0, false);
  for (let k = 1; k < 3; k++) {
    const p = F.at(-F.W / 2 + (F.W * k) / 3, F.D / 2);
    const [w, d] = F.wd(0.04, F.D - 0.6);
    box(b, H.woodDark, p.x, y + 0.04, p.z, w, 0.01, d, 0, false);
  }
  // the low table
  const t = F.at(0.3, F.D * 0.5);
  cyl(b, H.woodDark, t.x, y + 0.3, t.z, 0.5, 0.5, 0.05, 12);
  cyl(b, H.woodDark, t.x, y, t.z, 0.1, 0.1, 0.3, 6);
  box(b, M.cream, t.x + 0.15, y + 0.36, t.z, 0.1, 0.06, 0.1, 0, false);
  c.b.collide({ x: t.x, z: t.z, hx: 0.45, hz: 0.45, y0: base, y1: y + 0.35, blocksShots: false, mapKind: 'prop', surface: 'wood', tag: 'table' });
  // the chest and the doll
  const ch = F.at(-F.W / 2 + 0.75, 0.42);
  const [cw, cd] = F.wd(1.0, 0.45);
  thing(c, H.woodDark, ch.x, y, ch.z, cw, 1.1, cd, base, 'chest');
  cyl(b, M.red, ch.x, y + 1.1, ch.z, 0.08, 0.12, 0.28, 8);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.paper);
  head.position.set(ch.x, y + 1.45, ch.z);
  b.add(head, { cast: false });
  box(b, M.dark, ch.x, y + 1.5, ch.z, 0.15, 0.06, 0.15, 0, false);
  // the calendar, stopped in April 1974 (a sheet with a red band, no words)
  const cal = F.at(0.9, 0.165);
  const [lw, ld] = F.wd(0.42, 0.02);
  box(b, M.paper, cal.x, y + 1.65, cal.z, lw, 0.56, ld, 0, false);
  box(b, M.red, cal.x, y + 1.88, cal.z, lw, 0.1, ld + 0.01, 0, false);
  if (o.tv !== false) {
    const tv = F.at(F.W / 2 - 0.7, 0.42);
    const [sw, sd] = F.wd(0.8, 0.5);
    thing(c, H.woodDark, tv.x, y, tv.z, sw, 0.45, sd, base, 'tv');
    const [tw, td] = F.wd(0.68, 0.5);
    box(b, M.tv, tv.x, y + 0.75, tv.z, tw, 0.58, td);
    const s = F.at(F.W / 2 - 0.7, 0.69);
    const [gw, gd] = F.wd(0.5, 0.02);
    box(b, M.glass, s.x, y + 0.76, s.z, gw, 0.4, gd, 0, false);
  }
  if (o.washer !== false) {
    const wa = F.at(F.W / 2 - 0.5, F.D - 1.1);
    const [ww, wdp] = F.wd(0.8, 0.5);
    thing(c, M.cream, wa.x, y, wa.z, ww, 0.88, wdp, base, 'washer');
    for (const s of [-0.18, 0.18]) {
      const l = F.at(F.W / 2 - 0.5 + s, F.D - 1.1);
      cyl(b, M.blue, l.x, y + 0.88, l.z, 0.14, 0.14, 0.03, 10);
    }
  }
}

/** Rubble poured out of a stair tower's doorway: broken slabs, rebar, a door off its hinges (low, so shots pass). */
export function rubble(c: Ctx, x: number, y: number, z: number, spread: number, base: number): void {
  for (let k = 0; k < 7; k++) {
    const px = x + (rnd() - 0.5) * spread;
    const pz = z + (rnd() - 0.5) * spread;
    const s = 0.6 + rnd() * 1.2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, 0.25 + rnd() * 0.4, s * (0.6 + rnd() * 0.6)), rnd() < 0.5 ? H.concrete : H.concreteDark);
    m.position.set(px, y + 0.2 + rnd() * 0.4, pz);
    m.rotation.set((rnd() - 0.5) * 0.9, rnd() * 3, (rnd() - 0.5) * 0.9);
    c.b.add(m);
  }
  for (let k = 0; k < 4; k++) beam(c.b, H.rust, x + (rnd() - 0.5) * spread, y + 0.3, z + (rnd() - 0.5) * spread, x + (rnd() - 0.5) * spread, y + 0.8 + rnd() * 0.8, z + (rnd() - 0.5) * spread, 0.03);
  c.b.collide({ x, z, hx: spread * 0.45, hz: spread * 0.45, y0: base, y1: y + 0.9, blocksShots: false, mapKind: 'prop', surface: 'concrete', tag: 'rubble' });
}

/** A chain-link fence's posts and top rail along a line (the frame's rail is what stops anyone). */
export function fence(b: LevelBuilder, alongX: boolean, fixed: number, a: number, e: number, y: number, h = 2.2): void {
  const n = Math.max(1, Math.round((e - a) / 2.5));
  for (let k = 0; k <= n; k++) {
    const at = a + ((e - a) * k) / n;
    box(b, H.green, alongX ? at : fixed, y + h / 2, alongX ? fixed : at, 0.07, h, 0.07, 0, false);
  }
  const mid = (a + e) / 2;
  for (const yy of [y + h, y + h * 0.66, y + 1.15]) box(b, H.green, alongX ? mid : fixed, yy, alongX ? fixed : mid, alongX ? e - a : 0.04, 0.04, alongX ? 0.04 : e - a, 0, false);
}

// ---------------------------------------------------------------------------------------------------------------------
// the build
// ---------------------------------------------------------------------------------------------------------------------

export function buildSchool(c: Ctx): void {
  seed = 6501;
  buildBlock65(c);
  buildKindergarten(c);
  buildGenzo(c);
  buildSchoolHouse(c);
  buildSchoolTop(c);
  buildBridge(c);
  buildGym(c);
  buildGrounds(c);
}

// ---- Block 65 --------------------------------------------------------------------------------------------------------

const WEST: Rect = { x0: -153, z0: -43, x1: -142, z1: -26 };
const EAST: Rect = { x0: -109, z0: -43, x1: -98, z1: -26 };
const NORTH: Rect = { x0: -153, z0: -60, x1: -95, z1: -43 };
const WING_TOP = T + 9 * SH;

function buildBlock65(c: Ctx): void {
  const { b } = c;
  // the wings: nine storeys, flats on the ground floor (two each, doors on the courtyard)
  for (const [r, court] of [
    [WEST, 'E'],
    [EAST, 'W'],
  ] as const) {
    const out: Face = court === 'E' ? 'W' : 'E';
    const doorX = court === 'E' ? 'E' : 'W';
    room(c, r, T, SH, 0, { doors: [{ side: doorX, at: 4.2, w: 1.8 }, { side: doorX, at: 12.8, w: 1.8 }], wall: H.concrete, tag: 'b65-wing' });
    wallLine(c, true, -34.5, r.x0, r.x1, T, SH, [], M.plaster, 0, 'b65-flat');
    flat(c, { x0: r.x0, z0: r.z0, x1: r.x1, z1: -34.5 }, T, 0, out);
    flat(c, { x0: r.x0, z0: -34.5, x1: r.x1, z1: r.z1 }, T, 0, out, { washer: court === 'E' });
    windows(b, r, court, T + 1.7, 1.3, 3.4, 0.25, { boarded: 0.3, skip: [[-39.7, -37.9], [-31.1, -29.3]] });
    windows(b, r, out, T + 1.7, 1.3, 3.4, 0.1, { boarded: 0.4 });
    windows(b, r, 'S', T + 1.7, 1.3, 3.4, 0.1, { boarded: 0.4 });
    storeys(b, r, T + SH + 0.2, WING_TOP, { win: ['N', 'S'], balc: [court, out], every: 3.4, lit: 0.12 });
    // the roof: a water tank and a rail
    box(b, H.steel, (r.x0 + r.x1) / 2, WING_TOP + 1.4, r.z1 - 3, 2.4, 1.6, 2.4);
  }
  // the north wing's ground floor: the pachinko parlour, the pass-through, the hair salon; the corners are solid
  const shopZ = -56;
  const corners: Rect[] = [
    { x0: NORTH.x0, z0: NORTH.z0, x1: -142, z1: NORTH.z1 },
    { x0: -109, z0: NORTH.z0, x1: NORTH.x1, z1: NORTH.z1 },
    { x0: -142, z0: NORTH.z0, x1: -127, z1: shopZ },
    { x0: -123, z0: NORTH.z0, x1: -109, z1: shopZ },
  ];
  for (const r of corners) {
    box(b, H.concrete, (r.x0 + r.x1) / 2, T + SH / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, SH, r.z1 - r.z0, 0, false);
    solid(c, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, T + SH, 'b65-core', { kind: 'building' });
  }
  windows(b, NORTH, 'N', T + 1.7, 1.3, 3.4, 0.05, { boarded: 0.5 });
  pachinko(c, { x0: -142, z0: shopZ, x1: -127, z1: -43 });
  salon(c, { x0: -123, z0: shopZ, x1: -109, z1: -43 });
  // the pass-through to the back lane (a roof over it)
  ground(b, H.concreteDark, -127, -60, -123, -43, T);
  box(b, H.concreteDark, -125, T + SH + 0.1, -51.5, 4, 0.2, 17, 0, false);
  roofCollider(c, { x0: -127, z0: -60, x1: -123, z1: -43 }, T + SH);
  lamp(c, -125, T, -51.5, 0, { h: 3.3, post: false, mode: 'flicker', tag: 'b65-pass' });
  // the north wing's storeys (the kindergarten on its roof)
  storeys(b, NORTH, T + SH + 0.2, TOP - 0.3, { win: ['N', 'E', 'W'], balc: ['S'], every: 3.4, lit: 0.1, cap: false });
  // the roof's edges round the slab: a gutter and a parapet
  const rimY = TOP - 0.15;
  box(b, H.concreteDark, -151.5, rimY, -51.5, 3, 0.3, 17, 0, false);
  box(b, H.concreteDark, -122.5, rimY, -59, 55, 0.3, 2, 0, false);
  box(b, H.concreteDark, -125.5, rimY, -44, 33, 0.3, 2, 0, false);
  box(b, H.concrete, -152.85, TOP + 0.45, -51.5, 0.3, 0.9, 17, 0, false);
  box(b, H.concrete, -124, TOP + 0.45, -59.85, 58, 0.9, 0.3, 0, false);
  box(b, H.concrete, -125.5, TOP + 0.45, -43.15, 33, 0.9, 0.3, 0, false);
  // the stair towers at the outer corners: full of rubble since the typhoon
  for (const [tx, dir] of [
    [-155.5, -1],
    [-93, 1],
  ] as const) {
    const r: Rect = { x0: tx - 2.5, z0: -67, x1: tx + 2.5, z1: -60 };
    storeys(b, r, T, WING_TOP + SH, { win: ['N', 'W', 'E'], every: 2.5, lit: 0, paneW: 0.5, paneH: 2.4 });
    solid(c, tx, -63.5, 5, 7, WING_TOP + SH, 'b65-stair', { kind: 'building' });
    // the doorway (north, onto the back lane) and the rubble spilling out of it
    box(b, M.dark, tx, T + 1.2, -67.05, 1.8, 2.4, 0.12, 0, false);
    rubble(c, tx - dir * 0.3, T, -68.4, 2, 0);
  }
}

function pachinko(c: Ctx, r: Rect): void {
  const { b } = c;
  room(c, r, T, SH, 0, { doors: [{ side: 'S', at: 7.5, w: 2.4 }], tag: 'pachinko' });
  ground(b, M.tile, r.x0 + 0.2, r.z0 + 0.2, r.x1 - 0.2, r.z1 - 0.2, T);
  // the machines: two rows back to back down the middle, one along each side wall; a stool before each
  const mach = std(0xb85a30, 0.6);
  const rows: { x: number; face: 1 | -1; z0: number; z1: number }[] = [
    { x: r.x0 + 0.4, face: 1, z0: r.z0 + 1, z1: r.z1 - 1.5 },
    { x: (r.x0 + r.x1) / 2 - 0.3, face: -1, z0: r.z0 + 1.5, z1: r.z1 - 3.5 },
    { x: (r.x0 + r.x1) / 2 + 0.3, face: 1, z0: r.z0 + 1.5, z1: r.z1 - 3.5 },
    { x: r.x1 - 0.4, face: -1, z0: r.z0 + 1, z1: r.z1 - 1.5 },
  ];
  for (const row of rows) {
    for (let z = row.z0 + 0.4; z < row.z1; z += 0.8) {
      box(b, mach, row.x, T + 1.2, z, 0.5, 1.7, 0.72, 0, false);
      box(b, rnd() < 0.3 ? H.lamp : M.glass, row.x + row.face * 0.26, T + 1.45, z, 0.02, 0.6, 0.55, 0, false);
      box(b, M.cream, row.x + row.face * 0.32, T + 0.95, z, 0.14, 0.08, 0.5, 0, false);
      if (rnd() < 0.85) cyl(b, M.red, row.x + row.face * 0.85, T, z + (rnd() - 0.5) * 0.2, 0.17, 0.17, 0.5, 8);
    }
    const len = row.z1 - row.z0;
    c.b.collide({ x: row.x, z: (row.z0 + row.z1) / 2, hx: 0.3, hz: len / 2, y0: 0, y1: T + 2.1, mapKind: 'prop', surface: 'metal', tag: 'pachinko' });
  }
  // the prize counter by the door
  thing(c, M.cream, r.x1 - 2.4, T, r.z1 - 1.2, 2.2, 1, 0.6, 0, 'counter');
  // the awning over its door
  box(b, M.red, (r.x0 + r.x1) / 2, T + 3, r.z1 + 0.6, 6, 0.1, 1.2, 0, false);
  for (let k = 0; k < 6; k++) box(b, M.cream, (r.x0 + r.x1) / 2 - 2.5 + k, T + 2.94, r.z1 + 0.6, 0.5, 0.1, 1.22, 0, false);
}

function salon(c: Ctx, r: Rect): void {
  const { b } = c;
  room(c, r, T, SH, 0, { doors: [{ side: 'S', at: 7, w: 2 }], wall: M.plaster, tag: 'salon' });
  ground(b, M.tile, r.x0 + 0.2, r.z0 + 0.2, r.x1 - 0.2, r.z1 - 0.2, T);
  // three red chairs facing the mirrors on the back wall, a sink between each
  for (let k = 0; k < 3; k++) {
    const x = r.x0 + 3 + k * 4;
    box(b, M.glass, x, T + 1.5, r.z0 + 0.18, 1.4, 1.2, 0.04, 0, false);
    box(b, H.white, x + 1.9, T + 0.85, r.z0 + 0.4, 0.6, 0.2, 0.5, 0, false);
    cyl(b, H.steel, x, T, r.z0 + 1.4, 0.25, 0.3, 0.45, 10);
    box(b, M.red, x, T + 0.6, r.z0 + 1.4, 0.65, 0.18, 0.6, 0, false);
    box(b, M.red, x, T + 1.0, r.z0 + 1.72, 0.6, 0.7, 0.12, 0, false);
    c.b.collide({ x, z: r.z0 + 1.4, hx: 0.35, hz: 0.4, y0: 0, y1: T + 1.3, blocksShots: false, mapKind: 'prop', surface: 'metal', tag: 'barber-chair' });
  }
  // the counter shelf under the mirrors: scissors and combs laid out
  box(b, H.woodPale, r.x0 + 7, T + 0.9, r.z0 + 0.35, 12, 0.05, 0.4, 0, false);
  for (let k = 0; k < 5; k++) box(b, H.steel, r.x0 + 2 + k * 2.3, T + 0.94, r.z0 + 0.35, 0.18, 0.02, 0.05, 0.4, false);
  // the waiting bench and a magazine rack by the door
  thing(c, H.woodDark, r.x0 + 1.5, T, r.z1 - 1.0, 2.4, 0.45, 0.5, 0, 'bench');
  // the barber pole outside
  for (let k = 0; k < 6; k++) cyl(b, k % 2 ? M.red : H.white, r.x1 - 0.8, T + 1.2 + k * 0.18, r.z1 + 0.35, 0.11, 0.11, 0.18, 10);
  box(b, M.blue, r.x1 - 0.8, T + 1.12, r.z1 + 0.35, 0.3, 0.12, 0.3, 0, false);
}

// ---- the rooftop kindergarten (on the slab b65Top: collides from the slab up) ------------------------------------------

function buildKindergarten(c: Ctx): void {
  const { b } = c;
  const y = TOP;
  ground(b, M.wet, -125, -57.8, -95.2, -45.2, y);
  // the fence round the playground
  fence(b, true, -57.88, -125, -95, y);
  fence(b, true, -45.12, -125, -95, y);
  fence(b, false, -95.12, -58, -54, y);
  fence(b, false, -95.12, -49, -45, y);
  // the blue slide: a ladder up the west end to a platform, the chute down to the east
  const sz = -55.6;
  const x0 = -122;
  for (const dz of [-0.45, 0.45]) {
    beam(b, M.blue, x0 - 1.2, y, sz + dz, x0, y + 2, sz + dz, 0.07);
    beam(b, M.blue, x0, y, sz + dz, x0, y + 2.9, sz + dz, 0.08);
    beam(b, M.blue, x0 + 1, y, sz + dz, x0 + 1, y + 2.9, sz + dz, 0.08);
    box(b, M.blue, x0 + 0.5, y + 2.9, sz + dz, 1.1, 0.06, 0.06, 0, false);
  }
  for (let k = 1; k <= 6; k++) beam(b, M.blue, x0 - 1.2 + k * 0.18, y + k * 0.32, sz - 0.45, x0 - 1.2 + k * 0.18, y + k * 0.32, sz + 0.45, 0.04);
  box(b, M.blue, x0 + 0.5, y + 2, sz, 1.1, 0.08, 1);
  const chute = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.06, 0.8), M.blue);
  chute.position.set(x0 + 3.3, y + 1.1, sz);
  chute.rotation.z = -0.36;
  b.add(chute);
  for (const dz of [-0.42, 0.42]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.22, 0.05), M.blue);
    lip.position.set(x0 + 3.3, y + 1.2, sz + dz);
    lip.rotation.z = -0.36;
    b.add(lip);
  }
  beam(b, M.blue, x0 + 4.6, y, sz, x0 + 4.6, y + 0.65, sz, 0.08);
  c.b.collide({ x: x0 + 1.4, z: sz, hx: 3.4, hz: 0.55, y0: y, y1: y + 2.9, blocksShots: false, mapKind: 'prop', surface: 'metal', tag: 'slide' });
  // the round fish pool (the side story: what became of the fish), its rim painted blue, rain in it
  const px = -116.5;
  const pz = -51;
  cyl(b, M.poolBlue, px, y, pz, 2.1, 2.1, 0.55, 22);
  cyl(b, M.water, px, y + 0.4, pz, 1.9, 1.9, 0.16, 22);
  cyl(b, M.rustDark, px, y + 0.56, pz, 2.1, 2.1, 0.03, 22);
  c.b.collide({ x: px, z: pz, hx: 1.7, hz: 1.7, y0: y, y1: y + 0.6, blocksShots: false, mapKind: 'prop', surface: 'concrete', tag: 'fish-pool' });
  // the sandbox, the planters, the tricycle, a ball
  for (const [bx, bz, w, d] of [
    [-110, -47.2, 3.2, 0.2],
    [-110, -50, 3.2, 0.2],
    [-111.5, -48.6, 0.2, 2.6],
    [-108.5, -48.6, 0.2, 2.6],
  ] as const)
    box(b, H.concrete, bx, y + 0.15, bz, w, 0.3, d);
  box(b, M.sand, -110, y + 0.12, -48.6, 2.8, 0.06, 2.6, 0, false);
  cyl(b, M.red, -109.4, y + 0.15, -48.2, 0.1, 0.14, 0.2, 8);
  for (let k = 0; k < 4; k++) {
    const x = -121 + k * 3.4;
    box(b, H.woodDark, x, y + 0.3, -46.2, 2.6, 0.6, 0.9);
    box(b, M.dirt, x, y + 0.61, -46.2, 2.4, 0.04, 0.7, 0, false);
    for (let j = 0; j < 4; j++) {
      const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), M.leaf);
      g.position.set(x - 0.9 + j * 0.6, y + 0.75, -46.2 + (rnd() - 0.5) * 0.3);
      b.add(g, { cast: false });
    }
  }
  c.b.collide({ x: -115.9, z: -46.2, hx: 6.4, hz: 0.45, y0: y, y1: y + 0.6, blocksShots: false, mapKind: 'prop', surface: 'wood', tag: 'planters' });
  cyl(b, M.red, -113, y + 0.18, -53.2, 0.18, 0.18, 0.05, 10);
  box(b, M.red, -112.6, y + 0.35, -53.2, 0.7, 0.05, 0.12, 0.3, false);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), M.yellow);
  ball.position.set(-104.5, y + 0.15, -47.4);
  b.add(ball, { cast: false });
  // the nursery hut: a room of little chairs and a pedal organ
  const hut: Rect = { x0: -108.5, z0: -57.6, x1: -100.5, z1: -53 };
  room(c, hut, y, 2.6, y, { doors: [{ side: 'S', at: 4, w: 1.8 }], wall: M.cream, roof: H.rust, tag: 'nursery' });
  windows(b, hut, 'S', y + 1.5, 0.9, 2, 0.4, { w: 1.2, boarded: 0, skip: [[-105.4, -103.6]] });
  thing(c, H.woodDark, -101.6, y, -56.9, 1.4, 1.0, 0.5, y, 'organ');
  for (let k = 0; k < 6; k++) {
    const x = -107.3 + (k % 3) * 1.2;
    const z = -56.6 + Math.floor(k / 3) * 1.1;
    box(b, k % 2 ? M.yellow : M.pink, x, y + 0.25, z, 0.3, 0.04, 0.3, 0, false);
    box(b, k % 2 ? M.yellow : M.pink, x, y + 0.42, z - 0.14, 0.3, 0.3, 0.03, 0, false);
  }
  c.b.collide({ x: -106.1, z: -56.1, hx: 1.6, hz: 1, y0: y, y1: y + 0.5, blocksShots: false, mapKind: 'prop', surface: 'wood', tag: 'chairs' });
  // a bench by the pool, the playground's lamp
  thing(c, H.wood, -120.5, y, -47.8, 0.5, 0.45, 1.8, y, 'bench');
  lamp(c, -112, y, -51.5, y, { h: 3.4, mode: 'flicker', tag: 'kindergarten' });
}

// ---- Genzō's room (a rooftop flat at the slab's west end) ---------------------------------------------------------------

function buildGenzo(c: Ctx): void {
  const { b } = c;
  const y = TOP;
  const r: Rect = { x0: -149.6, z0: -57.6, x1: -125.5, z1: -45.4 };
  room(c, r, y, 2.8, y, { doors: [{ side: 'E', at: 6.1, w: 1.8 }], wall: M.plaster, roof: H.rust, tag: 'genzo' });
  windows(b, r, 'S', y + 1.6, 0.9, 3, 0.5, { w: 1.4, boarded: 0.2 });
  windows(b, r, 'N', y + 1.6, 0.9, 3, 0.3, { w: 1.4, boarded: 0.3 });
  // the partition between his two rooms
  wallLine(c, false, -136, r.z0, r.z1, y, 2.8, [[-52, -50.2]], M.plaster, y, 'genzo');
  // the west room: tatami, the sewing machine, the chest with the doll, the calendar; the key hangs on its nail by the post
  flat(c, { x0: r.x0, z0: r.z0, x1: -136, z1: r.z1 }, y, y, 'W', { washer: false, tv: false });
  thing(c, H.woodDark, -147.8, y, -56.6, 1.0, 0.72, 0.5, y, 'sewing-table');
  box(b, M.dark, -147.8, y + 0.88, -56.6, 0.45, 0.22, 0.18, 0, false);
  box(b, M.dark, -147.6, y + 1.02, -56.6, 0.12, 0.3, 0.14, 0, false);
  cyl(b, H.steel, -148.1, y + 0.78, -56.6, 0.06, 0.06, 0.12, 8);
  cyl(b, H.woodDark, -141.6, y, -51, 0.09, 0.09, 2.8, 8); // the post the key's nail is in
  box(b, M.paper, -146, y + 0.12, -48, 1.8, 0.18, 0.9, 0, false); // the futon, laid out
  box(b, M.pink, -146, y + 0.2, -47.6, 1.8, 0.04, 0.5, 0, false);
  // the east room: the TV, the low table, the cassette player on its shelf, the dresser with the comb
  flat(c, { x0: -136, z0: r.z0, x1: r.x1, z1: r.z1 }, y, y, 'N', { washer: false });
  thing(c, H.woodDark, -132, y, -45.95, 1.6, 0.8, 0.45, y, 'shelf');
  box(b, H.steel, -132.2, y + 0.92, -45.95, 0.5, 0.22, 0.25, 0, false);
  box(b, M.glass, -132.2, y + 0.94, -46.08, 0.24, 0.1, 0.02, 0, false);
  thing(c, H.woodDark, -130, y, -57.1, 0.9, 0.7, 0.45, y, 'dresser');
  box(b, M.glass, -130, y + 1.2, -57.28, 0.5, 0.7, 0.03, 0, false);
  // a gas ring and a kettle by the door (he cooked here alone after 1974)
  thing(c, H.steel, -127.2, y, -47, 1.2, 0.8, 0.6, y, 'stove');
  cyl(b, H.steel, -127.4, y + 0.8, -47, 0.13, 0.11, 0.2, 10);
  // a hanging scroll and a folding screen in the west room, cushions round the table
  box(b, M.paper, -149.42, y + 1.5, -53.6, 0.03, 1.4, 0.55);
  for (const dy of [0.78, -0.72]) box(b, H.woodDark, -149.4, y + 1.5 + dy, -53.6, 0.05, 0.05, 0.65);
  for (let k = 0; k < 4; k++) box(b, k % 2 ? M.cream : H.woodPale, -147.6 + k * 0.52, y + 0.75, -46.4 + (k % 2) * 0.22, 0.54, 1.5, 0.04, (k % 2 ? 0.35 : -0.35));
  c.b.collide({ x: -146.8, z: -46.3, hx: 1.1, hz: 0.25, y0: y, y1: y + 1.5, blocksShots: false, mapKind: 'prop', surface: 'wood', tag: 'screen' });
  for (const [x, z] of [
    [-143.6, -51.2],
    [-142.8, -50.2],
    [-131.3, -51.5],
  ] as const)
    box(b, M.pink, x, y + 0.05, z, 0.55, 0.1, 0.55);
  // the paper lamp shades over each room's table
  for (const x of [-142.8, -130.4]) {
    box(b, H.iron, x, y + 2.55, -51.4, 0.02, 0.5, 0.02);
    cyl(b, M.paper, x, y + 2.0, -51.4, 0.18, 0.32, 0.32, 10);
  }
  // his helmet and lamp on the shelf, his coat on its hook, the wall clock stopped, a kerosene heater, a dish cupboard
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.yellow);
  helm.position.set(-131.4, y + 0.8, -45.95);
  b.add(helm, { cast: false });
  box(b, H.lamp, -131.4, y + 0.9, -46.12, 0.08, 0.06, 0.03);
  box(b, M.board, -135.7, y + 1.3, -48.4, 0.12, 1.1, 0.5);
  box(b, M.cream, -125.67, y + 2.1, -55.2, 0.04, 0.34, 0.34);
  cyl(b, M.cream, -128.6, y, -54.4, 0.24, 0.24, 0.5, 12);
  box(b, H.lamp, -128.6, y + 0.28, -54.15, 0.18, 0.1, 0.02);
  c.b.collide({ x: -128.6, z: -54.4, hx: 0.25, hz: 0.25, y0: y, y1: y + 0.5, blocksShots: false, mapKind: 'prop', surface: 'metal', tag: 'heater' });
  thing(c, H.wood, -134.8, y, -45.95, 1.6, 1.6, 0.45, y, 'dish-cupboard');
  for (let k = 0; k < 6; k++) cyl(b, M.cream, -135.4 + (k % 3) * 0.55, y + 1.62 - Math.floor(k / 3) * 0.5, -45.9, 0.12, 0.12, 0.04, 10);
  lamp(c, -138, y, -51.6, y, { h: 2.6, post: false, mode: 'flicker', color: 0xffb070, tag: 'genzo' });
  // an outside light over his door
  box(b, H.lamp, -125.2, y + 2.5, -51.5, 0.12, 0.2, 0.3, 0, false);
}

// ---- the school (Block 70) --------------------------------------------------------------------------------------------

const SCHOOL: Rect = { x0: -84, z0: -66, x1: -48, z1: -36 };

function buildSchoolHouse(c: Ctx): void {
  const { b } = c;
  const r = SCHOOL;
  const y = T;
  // the outer walls of the ground floor: the hall's door south, the corridor's doors east and west
  room(c, r, y, SH, 0, {
    doors: [
      { side: 'S', at: 30, w: 3 },
      { side: 'W', at: 17, w: 2 },
      { side: 'E', at: 17, w: 2 },
    ],
    wall: H.white,
    tag: 'school',
  });
  ground(b, H.woodPale, r.x0 + 0.2, r.z0 + 0.2, r.x1 - 0.2, r.z1 - 0.2, y);
  ground(b, M.tile, r.x0 + 0.2, -51, r.x1 - 0.2, -47, y + 0.005);
  // the big windows
  for (const f of ['N', 'S', 'W', 'E'] as const) windows(b, r, f, y + 1.7, 1.8, 3, 0.18, { boarded: 0.15, skip: f === 'S' ? [[-55.5, -52.5]] : f === 'N' ? [] : [[-50, -48]] });
  // the corridor walls and the rooms off it
  wallLine(c, true, -51, r.x0, r.x1, y, SH, [[-77.9, -76.1], [-66.9, -65.1], [-55.9, -54.1]], H.white, 0, 'school-in');
  wallLine(c, true, -47, r.x0, -66, y, SH, [[-75.9, -74.1]], H.white, 0, 'school-in');
  wallLine(c, false, -70, r.z0, -51, y, SH, [], H.white, 0, 'school-in');
  wallLine(c, false, -62, r.z0, -51, y, SH, [], H.white, 0, 'school-in');
  wallLine(c, false, -66, -47, r.z1, y, SH, [], H.white, 0, 'school-in');
  // classroom 1 (north-west) and 2 (south-west): blackboards on the west wall, the desks facing them
  blackboard(b, false, r.x0 + 0.18, -58.5, y);
  desks(c, -79.5, -64.5, -71.5, -52.5, y, 0, 'W');
  thing(c, H.woodDark, -82, y, -58.5, 0.7, 0.75, 1.4, 0, 'teacher-desk');
  blackboard(b, false, r.x0 + 0.18, -41.5, y);
  desks(c, -79.5, -45.8, -67.5, -37.2, y, 0, 'W');
  // the staff room: desks pushed together, a filing cabinet, the company price board on the east wall
  thing(c, H.steel, -67, y, -56.5, 2.6, 0.75, 1.6, 0, 'staff-desks');
  thing(c, H.steel, -69.4, y, -65.2, 1, 1.8, 0.5, 0, 'cabinet');
  box(b, M.paper, -67.3, y + 0.77, -56.7, 0.3, 0.02, 0.4, 0.2, false);
  const wb = WALL_BUYS[3]!;
  box(b, H.woodDark, -62.165, y + 1.6, wb.z, 0.08, 1.4, 2.2, 0, false);
  box(b, M.cream, -62.215, y + 1.6, wb.z, 0.02, 1.2, 2.0, 0, false);
  // the music room: the reed organ, chairs in a half ring
  thing(c, H.woodDark, -49, y, -60, 0.6, 1.1, 1.6, 0, 'organ');
  for (let k = 0; k < 8; k++) {
    const a = -1.1 + k * 0.32;
    const x = -53.5 + Math.cos(a) * 3;
    const z = -59 + Math.sin(a) * 3.2;
    box(b, M.chair, x, y + 0.42, z, 0.4, 0.04, 0.4, 0, false);
    box(b, M.chair, x - 0.2, y + 0.65, z, 0.04, 0.45, 0.4, 0, false);
  }
  c.b.collide({ x: -53.2, z: -59, hx: 0.6, hz: 3, y0: 0, y1: y + 0.8, blocksShots: false, mapKind: 'prop', surface: 'metal', tag: 'chairs' });
  // the entrance hall: rows of shoe lockers, an umbrella stand, a trophy cabinet
  for (const z of [-43.5, -40.5]) {
    thing(c, H.wood, -57, y, z, 6, 1.4, 0.5, 0, 'shoe-lockers');
    for (let k = 0; k < 10; k++) box(b, H.woodDark, -59.7 + k * 0.6, y + 0.35 + (k % 3) * 0.4, z + 0.26, 0.5, 0.3, 0.02, 0, false);
  }
  thing(c, H.woodDark, -65.4, y, -44, 0.5, 1.8, 2, 0, 'cabinet');
  cyl(b, H.steel, -51.5, y, -37, 0.25, 0.25, 0.6, 10);
  // the portico over the front door
  box(b, H.white, -54, y + SH - 0.15, -34.6, 5.5, 0.25, 3, 0, false);
  for (const x of [-56.4, -51.6]) {
    box(b, H.white, x, y + (SH - 0.3) / 2, -33.4, 0.4, SH - 0.3, 0.4);
    solid(c, x, -33.4, 0.4, 0.4, y + SH, 'portico');
  }
  lamp(c, -54, y + SH - 0.3, -35.2, 0, { h: 0.1, post: false, tag: 'school' });
  // the stair tower outside the south face (the frame's stairwell: in at its door)
  const st: Rect = { x0: -63, z0: -36, x1: -57, z1: -31.5 };
  room(c, st, y, SH, 0, { doors: [{ side: 'S', at: 3, w: 2 }], wall: H.white, tag: 'school-stair' });
  for (let k = 0; k < 6; k++) box(b, H.concrete, -61.6, y + 0.15 + k * 0.3, -32.4 - k * 0.45, 2.4, 0.3, 0.45);
  box(b, M.dark, -59, y + 1.6, -35.6, 3.6, 3.2, 0.5, 0, false);
  c.b.collide({ x: -60, z: -34.8, hx: 2.85, hz: 1.05, y0: 0, y1: y + SH, mapKind: 'wall', surface: 'concrete', tag: 'school-stair' });
  storeys(b, st, y + SH + 0.2, y + 7 * SH + 1.2, { win: ['S'], every: 6, lit: 0.4, paneW: 1.2, paneH: 2.6 });
  // the storeys between (the second to the fourth), seen from the yard
  storeys(b, r, y + SH + 0.2, TOP - 0.3, { win: ['N', 'S', 'W', 'E'], every: 3, lit: 0.12, paneH: 1.8, paneW: 2.3, cap: false });
}

/** The school's top floor (on the slab schoolTop): the corridor, a classroom, the music room, the stair lobby; the roof. */
function buildSchoolTop(c: Ctx): void {
  const { b } = c;
  const y = TOP;
  const h = 3.4;
  const r: Rect = { x0: -83.85, z0: -54, x1: -48.15, z1: -36.15 };
  wallLine(c, false, r.x0, r.z0, r.z1, y, h, [[-53.7, -49.3]], H.white, y, 'school-top', 0.3);
  wallLine(c, false, r.x1, r.z0, r.z1, y, h, [], H.white, y, 'school-top', 0.3);
  wallLine(c, true, r.z1, r.x0, r.x1, y, h, [], H.white, y, 'school-top', 0.3);
  wallLine(c, true, r.z0, r.x0, r.x1, y, h, [[-72.9, -71.1], [-56.9, -55.1]], H.white, y, 'school-top', 0.3);
  for (const f of ['S', 'W', 'E'] as const) windows(b, { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }, f, y + 1.7, 1.8, 3, 0.2, { boarded: 0.1, skip: f === 'W' ? [[-54, -49.3]] : [] });
  windows(b, { x0: -84, z0: r.z0, x1: -74, z1: r.z1 }, 'N', y + 1.7, 1.8, 3, 0.2);
  windows(b, { x0: -70, z0: r.z0, x1: -58, z1: r.z1 }, 'N', y + 1.7, 1.8, 3, 0.2);
  windows(b, { x0: -54, z0: r.z0, x1: -48, z1: r.z1 }, 'N', y + 1.7, 1.8, 3, 0.2);
  ground(b, M.tile, r.x0, r.z0, r.x1, -48, y);
  ground(b, H.woodPale, r.x0, -48, r.x1, r.z1, y);
  // the classroom (west), the stair lobby (middle), the music room (east)
  wallLine(c, true, -48, r.x0, -63, y, h, [[-70.9, -69.1]], H.white, y, 'school-top');
  wallLine(c, true, -48, -57, r.x1, y, h, [[-52.9, -51.1]], H.white, y, 'school-top');
  wallLine(c, false, -63, -48, r.z1, y, h, [], H.white, y, 'school-top');
  wallLine(c, false, -57, -48, r.z1, y, h, [], H.white, y, 'school-top');
  blackboard(b, false, r.x0 + 0.18, -42, y);
  desks(c, -80, -46.5, -65, -37.5, y, y, 'W');
  thing(c, H.woodDark, -82.3, y, -42, 0.7, 0.75, 1.4, y, 'teacher-desk');
  thing(c, H.woodDark, -48.8, y, -41.5, 0.6, 1.1, 1.6, y, 'organ');
  box(b, H.white, -48.5, y + 1.6, -41.5, 0.03, 0.5, 1.2, 0, false);
  thing(c, M.red, -54, y, -38.5, 0.6, 0.5, 0.6, y, 'drum');
  // the cubbies down the corridor's south wall, a bucket and mop
  for (const [x0, x1] of [
    [-82, -72],
    [-56.6, -53.2],
  ] as const) {
    thing(c, H.wood, (x0 + x1) / 2, y, -48.4, x1 - x0, 1.2, 0.5, y, 'cubbies');
    for (let x = x0 + 0.5; x < x1; x += 1) box(b, H.woodDark, x, y + 0.6, -48.14, 0.06, 1.1, 0.02, 0, false);
  }
  cyl(b, H.steel, -64, y, -50.5, 0.18, 0.15, 0.32, 10);
  // the stairwell down (the frame's: walk in at its head), a dark well with a rail and a lamp
  box(b, M.dark, -60, y + 0.02, -38.1, 5.4, 0.02, 3.6, 0, false);
  box(b, H.iron, -62.6, y + 0.5, -38.2, 0.06, 1, 3.4, 0, false);
  box(b, H.iron, -57.4, y + 0.5, -38.2, 0.06, 1, 3.4, 0, false);
  box(b, H.white, -60, y + 2.1, -36.45, 5.4, 1.4, 0.3, 0, false);
  for (let k = 0; k < 4; k++) box(b, H.concrete, -60, y + 0.05, -39.4 + k * 0.45, 4.6, 0.08, 0.06, 0, false);
  lamp(c, -60, y + h - 0.35, -36.6, y, { h: 0.1, post: false, mode: 'flicker', tag: 'school-top' });
  // the roof over the top floor, and the two storeys above it (seven in all)
  box(b, H.concreteDark, -66, y + h + 0.1, -45, 36.3, 0.2, 18.3, 0, false);
  roofCollider(c, r, y + h);
  storeys(b, { x0: -84, z0: -54, x1: -48, z1: -36 }, y + h + 0.2, TOP + 3 * SH, { win: ['N', 'S', 'W', 'E'], every: 3, lit: 0.1, paneH: 1.8, paneW: 2.3 });
  const tk = TOP + 3 * SH + 0.9;
  for (const [lx, lz] of [[-79.2, -46.2], [-76.8, -46.2], [-79.2, -43.8], [-76.8, -43.8]] as const) box(b, H.iron, lx, tk + 1.2, lz, 0.14, 2.4, 0.14, 0, false);
  cyl(b, H.steel, -78, tk + 2.4, -45, 1.3, 1.3, 2.2, 16);
  // the open roof (north half): a fence, the skylight, the weather screen, vents, pots (the photograph lies here)
  fence(b, true, -65.88, -84, -48, y);
  fence(b, false, -83.88, -66, -54, y);
  fence(b, false, -48.12, -66, -54, y);
  ground(b, M.wet, -83.8, -65.8, -48.2, -54.2, y);
  thing(c, H.concrete, -73, y, -60, 3, 0.6, 2.2, y, 'skylight');
  box(b, M.glass, -73, y + 0.75, -60, 2.6, 0.3, 1.8, 0, false);
  for (const [x, z] of [
    [-52.2, -64.2],
    [-51.4, -64.2],
    [-52.2, -63.4],
    [-51.4, -63.4],
  ] as const)
    box(b, H.white, x, y + 0.55, z, 0.06, 1.1, 0.06, 0, false);
  thing(c, H.white, -51.8, y + 1.1, -63.8, 1.0, 0.7, 0.8, y, 'weather-screen');
  for (const x of [-80, -77, -66]) {
    cyl(b, H.steel, x, y, -55.2, 0.2, 0.2, 1.4, 8);
    c.b.collide({ x, z: -55.2, hx: 0.2, hz: 0.2, y0: y, y1: y + 1.4, mapKind: 'prop', surface: 'metal', tag: 'vent' });
  }
  for (let k = 0; k < 5; k++) {
    cyl(b, M.brick, -82.8 + k * 0.7, y, -64.9, 0.22, 0.17, 0.35, 8);
    const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), M.leaf);
    g.position.set(-82.8 + k * 0.7, y + 0.5, -64.9);
    b.add(g, { cast: false });
  }
  thing(c, H.wood, -66, y, -64.8, 2, 0.45, 0.5, y, 'bench');
  lamp(c, -55, y, -57, y, { h: 3, mode: 'fail', color: 0xd0dcff, tag: 'school-roof' });
}

// ---- the footbridge --------------------------------------------------------------------------------------------------

function buildBridge(c: Ctx): void {
  const { b } = c;
  const y = TOP;
  const z0 = -54;
  const z1 = -49;
  // the trusses under the deck and the two pillars down to the terrace
  for (const z of [z0 + 0.2, z1 - 0.2]) {
    box(b, H.rust, -89.5, y - 0.75, z, 11, 0.9, 0.2, 0, false);
    for (let k = 0; k < 5; k++) beam(b, M.rustDark, -95 + k * 2.2, y - 1.2, z, -95 + (k + 1) * 2.2, y - 0.3, z, 0.08);
  }
  for (const z of [z0 + 0.5, z1 - 0.5]) {
    box(b, H.concrete, -89.5, (T + y - 1.2) / 2, z, 0.6, y - 1.2 - T, 0.6);
    solid(c, -89.5, z, 0.6, 0.6, y - 1.2, 'bridge-pillar', { kind: 'building' });
  }
  box(b, H.concrete, -89.5, y - 1.6, -51.5, 0.8, 0.5, 5.6, 0, false);
  // the cover: posts, a sill panel each side with glass above (half of it gone), the roof
  for (const z of [z0 + 0.12, z1 - 0.12]) {
    for (let k = 0; k <= 4; k++) box(b, H.steel, -95 + k * 2.75, y + 1.5, z, 0.12, 3, 0.12, 0, false);
    box(b, H.steel, -89.5, y + 0.55, z, 11, 1.1, 0.06, 0, false);
    for (let k = 0; k < 4; k++) if (rnd() < 0.55) box(b, M.glass, -93.6 + k * 2.75, y + 2.05, z, 2.6, 1.8, 0.03, 0, false);
    box(b, H.steel, -89.5, y + 3, z, 11, 0.12, 0.12, 0, false);
  }
  box(b, H.rust, -89.5, y + 3.15, -51.5, 11.4, 0.12, 6, 0, false);
  roofCollider(c, { x0: -95, z0, x1: -84, z1 }, y + 3);
  lamp(c, -89.5, y + 2.9, -51.5, y, { h: 0.1, post: false, mode: 'flicker', tag: 'bridge' });
}

// ---- the gym --------------------------------------------------------------------------------------------------------

const GYM: Rect = { x0: -84, z0: -35, x1: -66, z1: -22 };

function buildGym(c: Ctx): void {
  const { b } = c;
  const r = GYM;
  const y = T;
  const wallH = 5;
  room(c, r, y, wallH, 0, {
    doors: [
      { side: 'E', at: 5, w: 2.4 },
      { side: 'S', at: 9, w: 3 },
    ],
    wall: H.white,
    roof: null,
    tag: 'gym',
  });
  windows(b, r, 'N', y + 3.6, 1.6, 3, 0.25, { boarded: 0.1 });
  windows(b, r, 'S', y + 3.6, 1.6, 3, 0.25, { boarded: 0.1 });
  // the barrel roof across the short span, and its arched ends
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const half = (r.z1 - r.z0) / 2 + 0.3;
  const rise = 2.6;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (i / n);
    const a1 = Math.PI * ((i + 1) / n);
    const p0 = [cz - Math.cos(a0) * half, y + wallH + Math.sin(a0) * rise] as const;
    const p1 = [cz - Math.cos(a1) * half, y + wallH + Math.sin(a1) * rise] as const;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const m = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0 + 0.6, 0.16, len + 0.05), i % 2 ? H.steel : H.iron);
    m.position.set(cx, (p0[1] + p1[1]) / 2, (p0[0] + p1[0]) / 2);
    m.rotation.x = -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    b.add(m);
  }
  for (const x of [r.x0, r.x1]) {
    for (let k = 0; k < 4; k++) {
      const hh = rise * (k + 1) * 0.25;
      const w = 2 * half * Math.sqrt(1 - Math.pow((k + 0.5) / 4, 2)) - 0.3;
      box(b, H.white, x, y + wallH + hh - rise * 0.125, cz, 0.3, rise * 0.25, w, 0, false);
    }
    // the great arched window in each end
    windows(b, { x0: x, z0: cz - 3.6, x1: x, z1: cz + 3.6 }, 'E', y + wallH + 0.9, 1.4, 1.2, 0.5, { w: 1.0, boarded: 0 });
  }
  roofCollider(c, r, y + wallH);
  ground(b, H.woodPale, r.x0 + 0.2, r.z0 + 0.2, r.x1 - 0.2, r.z1 - 0.2, y);
  ground(b, H.white, r.x0 + 4, cz - 0.03, r.x1 - 0.5, cz + 0.03, y + 0.005);
  // the stage at the west end, its red curtains, the lectern where the closure was read out
  thing(c, H.woodDark, r.x0 + 1.7, y, cz, 3.2, 1.0, 10, 0, 'stage', true);
  box(b, H.woodPale, r.x0 + 1.7, y + 1.01, cz, 3.2, 0.02, 10, 0, false);
  for (const s of [-1, 1]) box(b, M.red, r.x0 + 0.5, y + 3, cz + s * 3.6, 0.3, 4, 2.8, 0, false);
  box(b, M.red, r.x0 + 0.5, y + 4.6, cz, 0.3, 0.8, 10, 0, false);
  box(b, M.cream, r.x0 + 0.22, y + 2.8, cz, 0.04, 2.4, 4.2, 0, false);
  box(b, H.woodDark, r.x0 + 2.4, y + 1.55, cz, 0.6, 1.1, 0.8, 0, false);
  // the folding chairs, rows facing the stage (some knocked over), the aisle down the middle
  for (let row = 0; row < 6; row++) {
    const x = r.x0 + 5 + row * 1.05;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const z = cz + s * (1.1 + k * 0.7);
        const fallen = rnd() < 0.1;
        box(b, M.chair, x, y + (fallen ? 0.1 : 0.45), z, 0.42, 0.04, 0.42, fallen ? 1.2 : 0, false);
        if (!fallen) box(b, M.chair, x + 0.21, y + 0.7, z, 0.04, 0.5, 0.42, 0, false);
      }
      c.b.collide({ x: x + 0.05, z: cz + s * 2.15, hx: 0.3, hz: 1.4, y0: 0, y1: y + 0.8, blocksShots: false, mapKind: 'prop', surface: 'metal', tag: 'chairs' });
    }
  }
  // the farewell letters on a table by the east door (the side story), a fallen basketball hoop
  thing(c, H.woodPale, -70, y, -31.3, 1.6, 0.72, 0.7, 0, 'letters-table');
  for (let k = 0; k < 7; k++) box(b, M.paper, -70.6 + k * 0.2 + rnd() * 0.05, y + 0.74, -31.3 + (rnd() - 0.5) * 0.3, 0.16, 0.01, 0.22, rnd(), false);
  box(b, H.white, r.x1 - 0.3, y + 3.2, -24.5, 0.06, 1.0, 1.6, 0, false);
  beam(b, H.rust, r.x1 - 0.8, y + 0.2, -26.3, r.x1 - 1.6, y + 1.1, -25.2, 0.05);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 4, 12), H.rust);
  hoop.position.set(r.x1 - 1.4, y + 0.3, -26);
  hoop.rotation.x = 1.2;
  b.add(hoop, { cast: false });
  lamp(c, -75, y + wallH + 1.2, cz, 0, { h: 0.1, post: false, mode: 'flicker', color: 0xffc890, tag: 'gym' });
}

// ---- the courtyard, the yards and the lanes round them ----------------------------------------------------------------

function buildGrounds(c: Ctx): void {
  const { b } = c;
  const y = T;
  // Block 65's courtyard: dirt inside a concrete path, the dome climbing frame, the sandpit, salt-bent trees
  ground(b, M.dirt, -139.5, -41, -111.5, -24, y);
  const dx = -128;
  const dz = -33;
  const rr = 2.2;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 4;
    for (let i = 0; i < 8; i++) {
      const t0 = (i / 8) * Math.PI;
      const t1 = ((i + 1) / 8) * Math.PI;
      beam(b, H.rust, dx + Math.cos(t0) * rr * Math.cos(a), y + Math.sin(t0) * rr, dz + Math.cos(t0) * rr * Math.sin(a), dx + Math.cos(t1) * rr * Math.cos(a), y + Math.sin(t1) * rr, dz + Math.cos(t1) * rr * Math.sin(a), 0.05);
    }
  }
  for (const hh of [0.8, 1.6]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(rr * rr - hh * hh), 0.025, 4, 20), H.rust);
    ring.position.set(dx, y + hh, dz);
    ring.rotation.x = Math.PI / 2;
    b.add(ring, { cast: false });
  }
  solid(c, dx, dz, 3.4, 3.4, y + 2.2, 'climbing-frame', { shots: false, surface: 'metal' });
  for (const [px, pz, w, d] of [
    [-117, -37.4, 4, 0.25],
    [-117, -34.6, 4, 0.25],
    [-119, -36, 0.25, 3],
    [-115, -36, 0.25, 3],
  ] as const)
    box(b, H.concrete, px, y + 0.15, pz, w, 0.3, d);
  box(b, M.sand, -117, y + 0.1, -36, 3.7, 0.06, 2.6, 0, false);
  tree(c, -138.5, y, -27.5, 5, 0);
  tree(c, -112.5, y, -27, 4.4, 0);
  tree(c, -121, y, -41.2, 4, 0);
  thing(c, H.wood, -131, y, -41.4, 2, 0.45, 0.5, 0, 'bench');
  lampPost(c, -124, y, -27, { tag: 'b65-court' });
  clutter(c, -140.5, y, -24.5, 'drum');
  clutter(c, -110.5, y, -23.4, 'crate', 0.3);
  // the back lane behind the north wing: the water tank, bins, a laundry pole, crates
  waterTower(c, -136, -68.5, y);
  for (let k = 0; k < 3; k++) clutter(c, -120 + k * 1.1, y, -62, 'drum');
  clutter(c, -146, y, -63, 'crate', 0.4);
  clutter(c, -145, y, -64.2, 'sacks');
  beam(b, H.steel, -112, y, -69, -112, y + 2.2, -69, 0.06);
  beam(b, H.steel, -106, y, -69, -106, y + 2.2, -69, 0.06);
  beam(b, H.steel, -112, y + 2.1, -69, -106, y + 2.1, -69, 0.04);
  for (let k = 0; k < 4; k++) box(b, k % 2 ? M.pink : M.paper, -111 + k * 1.4, y + 1.6, -69, 0.6, 0.9, 0.02, 0, false);
  solid(c, -112, -69, 0.2, 0.2, y + 2.2, 'pole', { surface: 'metal' });
  solid(c, -106, -69, 0.2, 0.2, y + 2.2, 'pole', { surface: 'metal' });
  lampPost(c, -128, y, -62.5, { mode: 'fail', tag: 'b65-lane' });
  for (const [x, z, s] of [
    [-152, -72.5, 1.4],
    [-100, -73, 1.2],
    [-121, -73.5, 1.1],
  ] as const)
    tree(c, x, y, z, 4 * s, 0);
  // the schoolyard: the bars, a basketball post, the flag's plinth, the front lamp
  ground(b, M.wet, -57, -31, -41, -21, y);
  for (let k = 0; k < 4; k++) ground(b, H.white, -56 + k * 4, -26.05, -54.5 + k * 4, -25.95, y + 0.005);
  bars(c, -50, -28, y);
  box(b, H.white, -42.4, y + 1.7, -32, 0.12, 3.4, 0.12);
  box(b, H.white, -42.7, y + 3.1, -32, 0.06, 1.0, 1.6);
  solid(c, -42.4, -32, 0.2, 0.2, y + 3.4, 'hoop', { surface: 'metal' });
  lampPost(c, -56, y, -24, { tag: 'schoolyard' });
  // the east lane (a store hut, bins) and the north strip under the cliff (trees, an incinerator)
  thing(c, H.rust, -43.5, y, -58, 2.4, 2.4, 3.6, 0, 'store-hut', true);
  thing(c, H.concreteDark, -43.5, y, -46, 1.6, 1.2, 1.6, 0, 'bins');
  lampPost(c, -44, y, -40, { mode: 'fail', tag: 'school-lane' });
  thing(c, M.brick, -66, y, -71.5, 2, 1.6, 2, 0, 'incinerator', true);
  cyl(b, M.rustDark, -66, y + 1.6, -71.5, 0.25, 0.25, 3, 8);
  for (const [x, z] of [
    [-78, -72.5],
    [-56, -73],
    [-50, -70.5],
  ] as const)
    tree(c, x, y, z, 4.2, 0);
  // the lane between Block 65 and the school, under the bridge: a vending machine (dead), crates
  thing(c, M.red, -97, y, -33, 1, 1.8, 0.8, 0, 'vending', true);
  box(b, M.glass, -96.48, y + 1.2, -33, 0.02, 0.7, 0.7, 0, false);
  clutter(c, -86.5, y, -44, 'crate');
  clutter(c, -86.5, y, -45.2, 'crate', 0.5);
  clutter(c, -87, y, -38, 'drum');
}
