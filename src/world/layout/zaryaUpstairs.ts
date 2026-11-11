/**
 * ZARYA: the Univermag's SECOND FLOOR (an interior built beside the map; `zarya/zones/upstairs.ts` has its spots and
 * who is where). Built from `research_notes/zarya/refs/uni-*` (the store's counters, pendants, garlands and columns)
 * and `cn-*` (the escalator's head coming out of the dark). The ground floor's footprint 530 m east: the escalator from
 * below comes up out of a railed well in the middle of the floor; the departments stand along the north wall (toys
 * with Kostya's den of boxes behind its counter, records, the photo studio in a room of its own), fabrics and coats in
 * the south-west, furniture in the south-east, big windows onto the square along the west wall, and between fabrics and
 * furniture the next escalator rising east into its shaft, up to the canteen.
 *
 * Nothing in here casts a shadow, and every plain colour of one finish is one draw call (`LevelBuilder.bake`).
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import type { FloorLink } from '../floors';
import { groundRect } from '../structures';
import type { Ctx } from './util';
import { UPSTAIRS, UPSTAIRS_COLUMNS } from '../../zarya/zones/upstairs';
import type { Rect } from '../../zarya/types';
import { GOODS, Z, ball, box, counter, cyl, firTree, garland, goods, shelves, slab, solid } from './zaryaKit';

export interface UpstairsHandles {
  area: number;
  link: FloorLink;
}

const U = UPSTAIRS;
const R = U.rect;
const H: number = U.h;
/** The walls' inner faces. */
const XW = R.x0 + 0.2;
const XE = R.x1 - 0.2;
const ZN = R.z0 + 0.2;
const ZS = R.z1 - 0.2;
const TAG = 'zarya-upstairs';

const std = (color: number, roughness: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness });
/** The night in the windows. */
const NIGHT = std(0x0a1324, 0.9);
/** Everything outside the room (and down the well). */
const SHELL = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1, side: THREE.BackSide });
/** Warm terrazzo, two tones close together (the reference's polished amber floor). */
const TILES = [std(0x8f7a5c, 0.6), std(0x84704f, 0.6)];
const CEILING = std(0xf0dfba, 0.85);
/** Painted walls. */
const WALL = std(0xd9c9a4, 0.85);
const GREY = std(0x8a8f98, 0.85);
/** Cardboard: the toy department's cartons, Kostya's den. */
const CARD = std(0xa88a5c, 0.95);
const CARD_DARK = std(0x8c7048, 0.95);
/** The painted winter behind the photo studio's stool. */
const SKY = std(0x6f8fb4, 0.9);
const MIRROR = std(0x9aa6b4, 0.3);
const RED = GOODS[0]!;
const YELLOW = GOODS[3]!;

const B = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0): void => void box(b, mat, x, y, z, sx, sy, sz, rot, false);
const C = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8): void => cyl(b, mat, x, y, z, r0, r1, h, seg, false);

/** A sphere squashed or stretched, turned. */
function orb(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 8, sz = 1, rx = 0, rz = 0): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat);
  m.position.set(x, y, z);
  m.scale.set(1, sy, sz);
  m.rotation.set(rx, 0, rz);
  b.add(m, { cast: false, receive: true });
}

/** A flat disc on its edge, its face turned the way `yaw` looks. */
function disc(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, t: number, yaw: number, seg = 14): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, seg), mat);
  m.rotation.set(Math.PI / 2, yaw, 0, 'YXZ');
  m.position.set(x, y, z);
  b.add(m, { cast: false, receive: true });
}

function lcg(seed: number): () => number {
  let s = (seed * 7919 + 13) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Nobody walks here (behind a wall, into the well, under an escalator). */
function beyond(c: Ctx, x0: number, z0: number, x1: number, z1: number, h = H, shots = false): void {
  solid(c, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, 'zarya-beyond', { kind: 'none', shots });
}

/** A wall, plain painted (axis-aligned, 0.4 m thick unless said, from `y0` up `height`). */
function W(c: Ctx, x0: number, z0: number, x1: number, z1: number, y0 = 0, height = H, t = 0.4, mat: THREE.Material = WALL): void {
  const sx = Math.abs(x1 - x0) + (x0 === x1 ? t : 0);
  const sz = Math.abs(z1 - z0) + (z0 === z1 ? t : 0);
  if (sx < 0.02 || sz < 0.02) return;
  B(c.b, mat, (x0 + x1) / 2, y0 + height / 2, (z0 + z1) / 2, sx, height, sz);
  c.b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: sx / 2, hz: sz / 2, y0, y1: y0 + height, mapKind: 'wall', surface: 'concrete', tag: TAG });
}

/** The rectangle `r` with `hole` cut out of it: up to four rectangles. */
function cut(r: Rect, hole: Rect): Rect[] {
  if (hole.x0 >= r.x1 || hole.x1 <= r.x0 || hole.z0 >= r.z1 || hole.z1 <= r.z0) return [r];
  const out: Rect[] = [];
  if (hole.z0 > r.z0) out.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: hole.z0 });
  if (hole.z1 < r.z1) out.push({ x0: r.x0, z0: hole.z1, x1: r.x1, z1: r.z1 });
  const z0 = Math.max(r.z0, hole.z0);
  const z1 = Math.min(r.z1, hole.z1);
  if (hole.x0 > r.x0) out.push({ x0: r.x0, z0, x1: hole.x0, z1 });
  if (hole.x1 < r.x1) out.push({ x0: hole.x1, z0, x1: r.x1, z1 });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// the room
// ---------------------------------------------------------------------------------------------------------------------

/** The windows along the west wall: each one's middle (z), and the size of them. */
const WINDOWS = [0, 1, 2, 3, 4, 5, 6].map((i) => -26.5 + i * 6);
const WIN = { w: 4.6, sill: 0.9, top: 3.3 };
/** The opening in the ceiling the escalator up goes through, into its shaft. */
const SHAFT: Rect = { x0: 646, z0: 7.2, x1: 652, z1: 10.8 };
/** The doors to the staff rooms, shut and locked (the north wall's x, the south wall's x). */
const DOOR_N = 627.5;
const DOOR_S = 642;

function shell(c: Ctx): void {
  const { b } = c;
  const xc = (R.x0 + R.x1) / 2;
  const zc = (R.z0 + R.z1) / 2;
  const dark = new THREE.Mesh(new THREE.BoxGeometry(R.x1 - R.x0 + 14, 18, R.z1 - R.z0 + 14), SHELL);
  dark.position.set(xc, 3, zc);
  b.add(dark, { cast: false, receive: false });
  // north, east, south: plain. west: a low wall under the windows, a band over them, piers between
  W(c, R.x0, R.z0, R.x1, R.z0);
  W(c, R.x1, R.z0, R.x1, R.z1);
  W(c, R.x0, R.z1, R.x1, R.z1);
  W(c, R.x0, R.z0, R.x0, R.z1, 0, WIN.sill);
  W(c, R.x0, R.z0, R.x0, R.z1, WIN.top, H - WIN.top);
  let from: number = R.z0;
  for (const wz of WINDOWS) {
    W(c, R.x0, from, R.x0, wz - WIN.w / 2, WIN.sill, WIN.top - WIN.sill);
    from = wz + WIN.w / 2;
  }
  W(c, R.x0, from, R.x0, R.z1, WIN.sill, WIN.top - WIN.sill);
  b.collide({ x: R.x0, z: zc, hx: 0.2, hz: (R.z1 - R.z0) / 2, y0: WIN.sill, y1: WIN.top, mapKind: 'none', surface: 'glass', tag: 'window' });

  // the floor: big terrazzo squares in two tones, round the well the escalator comes up out of
  const s = 1.2;
  const nx = Math.ceil((XE - XW) / s);
  const nz = Math.ceil((ZS - ZN) / s);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cell: Rect = { x0: XW + i * s, z0: ZN + j * s, x1: Math.min(XE, XW + (i + 1) * s), z1: Math.min(ZS, ZN + (j + 1) * s) };
      for (const q of cut(cell, U.well)) groundRect(b, TILES[(i + j) % 2]!, q.x0, q.z0, q.x1, q.z1, 0.02);
    }
  }
  // a dark border round the floor, like the ground floor's
  for (const [x0, z0, x1, z1] of [[XW, ZN, XE, ZN + 0.3], [XW, ZS - 0.3, XE, ZS], [XW, ZN, XW + 0.3, ZS], [XE - 0.3, ZN, XE, ZS]] as const) groundRect(b, Z.woodDark, x0, z0, x1, z1, 0.025);
  // the ceiling, round the escalator's shaft (a roof overhead is what tells the game it is indoors)
  const ceil: Rect = { x0: XW, z0: ZN, x1: XE, z1: ZS };
  for (const q of cut(ceil, SHAFT)) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(q.x1 - q.x0, q.z1 - q.z0), CEILING);
    m.rotation.x = Math.PI / 2;
    m.position.set((q.x0 + q.x1) / 2, H - 0.02, (q.z0 + q.z1) / 2);
    b.add(m, { cast: false, receive: true });
  }
  // the ceiling's beams, over the column lines
  for (const z of [-18, -6, 6]) B(b, Z.cream, (XW + XE) / 2, H - 0.2, z, XE - XW, 0.4, 0.5);
  b.collide({ x: xc, z: zc, hx: (R.x1 - R.x0) / 2 + 1, hz: (R.z1 - R.z0) / 2 + 1, y0: H, y1: H + 0.4, mapKind: 'none', tag: 'roof' });
  // nobody walks outside the walls
  beyond(c, R.x0 - 2.4, R.z0 - 2.4, R.x1 + 2.4, R.z0 - 0.2);
  beyond(c, R.x0 - 2.4, R.z1 + 0.2, R.x1 + 2.4, R.z1 + 2.4);
  beyond(c, R.x0 - 2.4, R.z0 - 2.4, R.x0 - 0.2, R.z1 + 2.4);
  beyond(c, R.x1 + 0.2, R.z0 - 2.4, R.x1 + 2.4, R.z1 + 2.4);

  // the columns (the ground floor's, the same cream with a dark foot and two lamps each)
  for (const k of UPSTAIRS_COLUMNS) {
    box(b, Z.cream, k.x, H / 2, k.z, 0.8, H, 0.8, 0, false);
    B(b, Z.woodDark, k.x, 0.5, k.z, 0.86, 1, 0.86);
    for (const dx of [0.43, -0.43]) B(b, Z.bulb, k.x + dx, 2.9, k.z, 0.06, 0.45, 0.22);
    solid(c, k.x, k.z, 0.8, 0.8, H, 'zarya-column', { kind: 'wall' });
  }

  // the staff doors: shut, locked, a plate where the sign was
  const door = (x: number, z: number, s: -1 | 1): void => {
    B(b, Z.cream, x, 1.1, z + s * 0.03, 1.3, 2.3, 0.05);
    B(b, Z.woodDark, x, 1.05, z + s * 0.06, 1.05, 2.1, 0.06);
    for (const y of [0.55, 1.55]) B(b, Z.wood, x, y, z + s * 0.1, 0.8, 0.7, 0.02);
    B(b, Z.brass, x + 0.4, 1.0, z + s * 0.12, 0.04, 0.16, 0.05);
    B(b, Z.white, x, 1.8, z + s * 0.1, 0.36, 0.14, 0.02);
  };
  door(DOOR_N, ZN, 1);
  door(DOOR_S, ZS, -1);
}

/** The windows onto the square: dark panes in pale frames, snow on the ledges outside, the town's lit windows below, and the town fir tree far off across the square. */
function windows(c: Ctx): void {
  const { b } = c;
  const mid = (WIN.sill + WIN.top) / 2;
  const tall = WIN.top - WIN.sill;
  WINDOWS.forEach((wz, i) => {
    const rnd = lcg(140 + i);
    B(b, NIGHT, R.x0 - 0.17, mid, wz, 0.04, tall, WIN.w);
    const xf = R.x0 + 0.04;
    B(b, Z.white, xf, WIN.sill + 0.05, wz, 0.1, 0.1, WIN.w);
    B(b, Z.white, xf, WIN.top - 0.05, wz, 0.1, 0.1, WIN.w);
    B(b, Z.white, xf, 2.6, wz, 0.08, 0.07, WIN.w);
    for (const dz of [-WIN.w / 2 + 0.05, -1.15, 0, 1.15, WIN.w / 2 - 0.05]) B(b, Z.white, xf, mid, wz + dz, 0.1, tall, 0.09);
    // the board inside, snow on the ledge outside and caught in the corners of the panes
    B(b, Z.white, XW + 0.09, WIN.sill + 0.02, wz, 0.3, 0.05, WIN.w + 0.16);
    B(b, Z.snow, R.x0 - 0.08, WIN.sill + 0.04, wz, 0.13, 0.08, WIN.w);
    for (let k = 0; k < 5; k++) orb(b, Z.snow, R.x0 - 0.09, WIN.sill + 0.07, wz - 1.9 + k * 0.95 + (rnd() - 0.5) * 0.5, 0.26 + rnd() * 0.2, 0.2 + rnd() * 0.16, 9, 1, 0, 0);
    // the panel blocks across the square: a few lit windows, far off and below
    for (let k = 0; k < 2; k++) {
      const bz = wz - 1.9 + rnd() * 3;
      const by = 1.1 + rnd() * 0.45;
      for (let u = 0; u < 6; u++) for (let v = 0; v < 4; v++) if (rnd() < 0.35) B(b, Z.warm, R.x0 - 0.14, by + v * 0.12, bz + u * 0.13, 0.02, 0.06, 0.05);
    }
    // a radiator under each
    for (let k = 0; k < 11; k++) B(b, Z.white, XW + 0.09, 0.46, wz - 0.85 + k * 0.17, 0.11, 0.52, 0.13);
    for (const y of [0.24, 0.68]) B(b, Z.white, XW + 0.09, y, wz, 0.05, 0.05, 1.9);
  });
  // in the middle window, the town fir tree, its lights small with distance
  const tz = WINDOWS[3]!;
  for (let k = 0; k < 26; k++) {
    const t = k / 26;
    B(b, k % 5 === 0 ? Z.warm : Z.bulb, R.x0 - 0.13, 1.25 + t * 1.1, tz + Math.sin(k * 2.4) * (1 - t) * 0.42, 0.02, 0.035, 0.035);
  }
}

/** The escalator from the ground floor: its head on the floor, its steps going down south into the well, the well railed off. */
function wellFromBelow(c: Ctx): void {
  const { b } = c;
  const E = U.well;
  const ex = (E.x0 + E.x1) / 2;
  const drop = 5.2;
  const run = E.z1 - E.z0 - 0.8;
  const ang = Math.atan2(drop, run);
  const n = 26;
  // the comb plate with its yellow line, the last flat steps
  B(b, GREY, ex, 0.045, E.z0 - 0.4, 2.1, 0.05, 0.8);
  B(b, YELLOW, ex, 0.076, E.z0 - 0.05, 1.96, 0.012, 0.07);
  for (let k = 0; k < 9; k++) B(b, Z.iron, ex - 0.88 + k * 0.22, 0.073, E.z0 - 0.4, 0.05, 0.008, 0.6);
  for (let i = 0; i < 2; i++) B(b, Z.steel, ex, 0.0, E.z0 + 0.2 + i * 0.4, 1.96, 0.03, 0.38);
  // the steps going down, each a tread and a riser
  for (let i = 0; i < n; i++) {
    const z = E.z0 + 0.8 + (i + 0.5) * (run / n);
    const y = -(i + 1) * (drop / n);
    B(b, Z.steel, ex, y, z, 1.96, 0.03, run / n);
    B(b, Z.iron, ex, y + drop / n / 2, z - run / n / 2, 1.96, drop / n, 0.03);
  }
  // the balustrades going down with them, their black handrails
  const L = Math.hypot(run, drop);
  for (const s of [-1, 1]) {
    const x = ex + s * 1.2;
    slab(b, GREY, x, 0.5 - drop / 2, E.z0 + 0.8 + run / 2, 0.24, 0.9, L, ang, 0, 0, false);
    slab(b, Z.black, x, 0.99 - drop / 2, E.z0 + 0.8 + run / 2, 0.3, 0.08, L, ang, 0, 0, false);
    // and flat on the floor at the head, turning round a newel
    B(b, GREY, x, 0.5, E.z0 - 0.3, 0.24, 0.9, 2.2);
    B(b, Z.black, x, 0.99, E.z0 - 0.3, 0.3, 0.08, 2.2);
    disc(b, Z.black, x, 0.5, E.z0 - 1.4, 0.53, 0.3, Math.PI / 2, 16);
    disc(b, GREY, x, 0.5, E.z0 - 1.4, 0.45, 0.32, Math.PI / 2, 16);
    solid(c, x, E.z0 - 0.75, 0.3, 1.5, 1.05, 'zarya-escalator', { shots: false, kind: 'prop', surface: 'metal' });
    // the well's sides: the floor's thickness in cream at the top, black below, down to the ground floor
    B(b, Z.cream, ex + s * 1.58, -0.6, (E.z0 + E.z1) / 2, 0.06, 1.2, E.z1 - E.z0);
    B(b, Z.black, ex + s * 1.6, -drop / 2 - 0.6, (E.z0 + E.z1) / 2, 0.06, drop - 1.2, E.z1 - E.z0);
  }
  B(b, Z.black, ex, -drop / 2, E.z1 + 0.02, E.x1 - E.x0, drop, 0.06);
  // far down at its foot, the ground floor's terrazzo in a little of its light
  groundRect(b, Z.terrazzo, E.x0, E.z1 - 2.6, E.x1, E.z1, -drop + 0.02);
  b.light({ x: ex, y: -drop / 2 + 0.4, z: E.z1 - 4, color: 0xffcf96, intensity: 12, distance: 10, mode: 'steady', pool: 0, weight: 0.6 });
  // the railing round the opening: brass top rail, a cream panel, steel posts
  const rail = (x0: number, z0: number, x1: number, z1: number): void => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? x1 - x0 : z1 - z0;
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    B(b, Z.brass, x, 1.02, z, alongX ? len : 0.07, 0.06, alongX ? 0.07 : len);
    B(b, Z.cream, x, 0.55, z, alongX ? len : 0.04, 0.7, alongX ? 0.04 : len);
    const k = Math.max(1, Math.round(len / 1.4));
    for (let i = 0; i <= k; i++) C(b, Z.steel, alongX ? x0 + (i * len) / k : x, 0, alongX ? z : z0 + (i * len) / k, 0.03, 0.03, 1.0, 6);
  };
  rail(E.x0 - 0.2, E.z0 + 0.4, E.x0 - 0.2, E.z1 + 0.2);
  rail(E.x1 + 0.2, E.z0 + 0.4, E.x1 + 0.2, E.z1 + 0.2);
  rail(E.x0 - 0.2, E.z1 + 0.2, E.x1 + 0.2, E.z1 + 0.2);
  // the drop itself
  beyond(c, E.x0 - 0.3, E.z0, E.x1 + 0.3, E.z1 + 0.3);
  // a garland of paper flags across the well, from column to column
  garland(b, 636.4, -6, 647.6, -6, H - 0.4, 22);
}

/** The escalator up to the third floor: its foot by the floor's middle, its steps rising east into a plastered shaft. */
function escalatorUp(c: Ctx): void {
  const { b } = c;
  const z = U.up.z;
  const x0 = U.up.x + 0.4; // the comb plate's far edge, where the first flat step is
  const flat = 1.2;
  const xs = x0 + flat; // where the steps begin to rise
  const ang = Math.PI / 6;
  const rise = 0.243;
  const runStep = rise / Math.tan(ang);
  const slope = Math.tan(ang);
  // the comb plate, the flat steps
  B(b, GREY, U.up.x + 0.2, 0.045, z, 0.8, 0.05, 2.06);
  B(b, YELLOW, x0 - 0.05, 0.076, z, 0.07, 0.012, 1.96);
  for (let i = 0; i < 3; i++) B(b, Z.steel, x0 + 0.2 + i * 0.4, 0.065, z, 0.38, 0.03, 1.96);
  // the steps, up past the ceiling into the shaft
  const n = Math.ceil((H + 1.2) / rise);
  for (let i = 0; i < n; i++) {
    const x = xs + (i + 0.5) * runStep;
    const y = (i + 1) * rise;
    B(b, Z.steel, x, y, z, runStep, 0.03, 1.96);
    B(b, Z.iron, x - runStep / 2, y - rise / 2, z, 0.03, rise, 1.96);
  }
  // under the steps: the truss, and the plinth that closes the space under it before the shaft
  const L = (H + 1.4) / Math.sin(ang);
  const tx = xs + (L / 2) * Math.cos(ang);
  const ty = (L / 2) * Math.sin(ang) - 0.55;
  slab(b, GREY, tx, ty, z, L, 1.0, 2.2, 0, 0, ang, false);
  for (let x = xs + 1.6; x < SHAFT.x0; x += 0.5) {
    const h = (x + 0.25 - xs) * slope - 0.7;
    if (h > 0.05) B(b, GREY, x + 0.25, h / 2, z, 0.5, h, 2.2);
  }
  for (const s of [-1, 1]) {
    const bz = z + s * 1.15;
    // the balustrade on the floor, its handrail, the newel it turns round
    B(b, GREY, (U.up.x + xs) / 2, 0.5, bz, xs - U.up.x, 0.9, 0.24);
    B(b, Z.black, (U.up.x + xs) / 2, 0.99, bz, xs - U.up.x, 0.08, 0.3);
    disc(b, Z.black, U.up.x, 0.5, bz, 0.53, 0.3, 0, 16);
    disc(b, GREY, U.up.x, 0.5, bz, 0.45, 0.32, 0, 16);
    // and rising with the steps
    const cx = xs + (L / 2) * Math.cos(ang);
    const cy = 0.5 + (L / 2) * Math.sin(ang);
    slab(b, GREY, cx, cy, bz, L, 0.9, 0.24, 0, 0, ang, false);
    slab(b, Z.black, cx - Math.sin(ang) * 0.49, cy + Math.cos(ang) * 0.49, bz, L, 0.08, 0.3, 0, 0, ang, false);
    solid(c, (U.up.x - 0.4 + xs) / 2, bz, xs - U.up.x + 0.4, 0.3, 1.05, 'zarya-escalator', { shots: false, kind: 'prop', surface: 'metal' });
  }
  // the shaft it goes up into: plastered, lined black inside; open on its west face over the escalator
  const S = SHAFT;
  const low = (S.x0 - xs) * slope - 1.15;
  W(c, S.x0, S.z0, S.x1, S.z0, 0, H, 0.2);
  W(c, S.x0, S.z1, S.x1, S.z1, 0, H, 0.2);
  W(c, S.x1, S.z0, S.x1, S.z1, 0, H, 0.2);
  W(c, S.x0, S.z0, S.x0, z - 1.42, 0, H, 0.2);
  W(c, S.x0, z + 1.42, S.x0, S.z1, 0, H, 0.2);
  W(c, S.x0, z - 1.42, S.x0, z + 1.42, 0, low, 0.2);
  for (const [x, zz, sx, sz] of [[(S.x0 + S.x1) / 2, S.z0 + 0.12, S.x1 - S.x0 - 0.2, 0.02], [(S.x0 + S.x1) / 2, S.z1 - 0.12, S.x1 - S.x0 - 0.2, 0.02], [S.x1 - 0.12, z, 0.02, S.z1 - S.z0 - 0.2]] as const) B(b, Z.black, x, H / 2 + 0.6, zz, sx, H + 1.2, sz);
  // a steel trim round the opening, the shutter rolled up in its box over it
  for (const s of [-1, 1]) B(b, Z.steel, S.x0 - 0.12, (low + H) / 2, z + s * 1.42, 0.06, H - low, 0.14);
  B(b, Z.steel, S.x0 - 0.18, H - 0.3, z, 0.34, 0.4, 3.0);
  // the space under the steps, and inside the shaft: nobody walks there
  beyond(c, x0 + 0.2, z - 1.3, S.x0, z + 1.3, 2.6);
  beyond(c, S.x0, S.z0, S.x1, S.z1);
  // a red cloth over the opening with paper snowflakes on it: the way to the party
  B(b, RED, S.x0 - 0.12, H - 0.75, z, 0.03, 0.5, 3.4);
  for (const y of [H - 0.98, H - 0.52]) B(b, YELLOW, S.x0 - 0.13, y, z, 0.03, 0.04, 3.4);
}

// ---------------------------------------------------------------------------------------------------------------------
// the departments
// ---------------------------------------------------------------------------------------------------------------------

/** A teddy bear sitting (on a counter, a shelf, the floor), facing `yaw`. */
function bear(b: LevelBuilder, x: number, y: number, z: number, s: number, yaw: number, mat: THREE.Material = Z.plush): void {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  orb(b, mat, x, y + 0.22 * s, z, 0.2 * s, 1.15, 8);
  orb(b, mat, x + fx * 0.03 * s, y + 0.52 * s, z + fz * 0.03 * s, 0.15 * s, 1, 8);
  orb(b, Z.woodPale, x + fx * 0.15 * s, y + 0.49 * s, z + fz * 0.15 * s, 0.06 * s, 0.8, 6);
  for (const sd of [-1, 1]) {
    const rx = Math.cos(yaw) * sd;
    const rz = -Math.sin(yaw) * sd;
    orb(b, mat, x + rx * 0.11 * s, y + 0.65 * s, z + rz * 0.11 * s, 0.06 * s, 1, 6);
    orb(b, mat, x + rx * 0.12 * s + fx * 0.14 * s, y + 0.07 * s, z + rz * 0.12 * s + fz * 0.14 * s, 0.08 * s, 0.7, 6);
  }
}

/** A matryoshka (a painted doll), `h` tall. */
function doll(b: LevelBuilder, x: number, y: number, z: number, h: number, mat: THREE.Material): void {
  orb(b, mat, x, y + h * 0.3, z, h * 0.3, 1.1, 8);
  orb(b, mat, x, y + h * 0.74, z, h * 0.22, 1.05, 8);
  orb(b, Z.cream, x, y + h * 0.74, z - h * 0.14, h * 0.12, 1, 6);
}

/** Toys: the shelves along the north wall, the counter, the cartons at its west end, the big toys, Valya's things. */
function toys(c: Ctx): void {
  const { b } = c;
  const T = U.toyCounter;
  const cz = (T.z0 + T.z1) / 2;
  const den = U.denBox;
  shelves(c, (den.x1 + 0.3 + 626) / 2, ZN + 0.36, 626 - den.x1 - 0.3, false, 201, { h: 3, goods: GOODS });
  counter(c, (T.x0 + T.x1) / 2, cz, T.x1 - T.x0, false, 202);
  // on the counter: bears, a row of dolls, a red fire engine, boxed games
  for (let i = 0; i < 3; i++) bear(b, 610 + i * 1.3, 1.03, cz, 1, 0);
  for (let i = 0; i < 5; i++) doll(b, 614.4 + i * 0.22, 1.03, cz + 0.1, 0.3 - i * 0.04, GOODS[[0, 1, 4, 0, 3][i]!]!);
  B(b, RED, 617.6, 1.15, cz, 0.6, 0.22, 0.26);
  B(b, RED, 617.86, 1.32, cz, 0.18, 0.16, 0.24);
  for (const dx of [-0.2, 0.2]) disc(b, Z.black, 617.6 + dx, 1.07, cz + 0.13, 0.07, 0.03, 0, 10);
  B(b, Z.steel, 617.5, 1.3, cz, 0.42, 0.03, 0.06);
  for (let i = 0; i < 4; i++) B(b, GOODS[(i * 3 + 1) % GOODS.length]!, 619.8 + i * 0.5, 1.06 + i * 0.0, cz, 0.42, 0.06 + (i % 2) * 0.04, 0.32, 0.1 * i);
  for (let i = 0; i < 2; i++) bear(b, 622.4 + i * 0.7, 1.03, cz, 0.7, 0.2 - i * 0.4, i ? GOODS[5]! : Z.plush);
  // on the shelves' top: the big bears, a rocking horse
  for (let i = 0; i < 4; i++) bear(b, 607.5 + i * 5.2, 3.0, ZN + 0.4, 1.3, 0);
  // the cartons stacked at the counter's west end, closing the way behind it from the hall
  const rnd = lcg(9);
  for (let i = 0; i < 6; i++) {
    const w = 0.55 + rnd() * 0.25;
    const x = den.x1 + 0.35 + (i % 3) * 1.15;
    const y = Math.floor(i / 3) * 0.6;
    B(b, i % 2 ? CARD : CARD_DARK, x, y + 0.3, cz + (rnd() - 0.5) * 0.2, w + 0.3, 0.6, 0.85, (rnd() - 0.5) * 0.12);
  }
  solid(c, (den.x1 + T.x0) / 2, cz, T.x0 - den.x1, 1.0, 1.25, 'zarya-cartons', { shots: false, kind: 'prop', surface: 'wood' });
  // a rocking horse and a sled out in front, a stack of toy boxes by the counter's east end
  const hx = 606;
  const hz = -21.4;
  for (const s of [-1, 1]) slab(b, Z.redDark, hx, 0.12, hz + s * 0.2, 1.3, 0.06, 0.06, 0, 0, 0, false);
  B(b, Z.white, hx, 0.62, hz, 0.8, 0.28, 0.3);
  B(b, Z.white, hx + 0.46, 0.92, hz, 0.22, 0.42, 0.2, 0);
  slab(b, Z.woodDark, hx + 0.2, 0.84, hz, 0.4, 0.1, 0.32, 0, 0, 0.3, false);
  for (const [dx, dz] of [[-0.3, -0.12], [0.3, -0.12], [-0.3, 0.12], [0.3, 0.12]] as const) slab(b, Z.white, hx + dx, 0.32, hz + dz, 0.06, 0.4, 0.06, 0, 0, dx > 0 ? -0.25 : 0.25, false);
  solid(c, hx, hz, 1.4, 0.6, 1.1, 'zarya-toy', { shots: false, kind: 'none', surface: 'wood' });
  for (let i = 0; i < 3; i++) B(b, GOODS[(i * 2 + 3) % GOODS.length]!, 625.4, 0.25 + i * 0.5, -23.2 + (i % 2) * 0.1, 0.8, 0.5, 0.6, 0.1 * i);
  solid(c, 625.4, -23.2, 0.9, 0.7, 1.5, 'zarya-toy', { shots: false, kind: 'none', surface: 'wood' });
  // behind the counter: Valya's stool and her cash drawer
  C(b, Z.woodDark, 620.6, 0, -25.9, 0.18, 0.18, 0.6, 8);
  solid(c, 620.6, -25.9, 0.4, 0.4, 0.6, 'zarya-stool', { shots: false, kind: 'none', surface: 'wood' });
  B(b, Z.cream, 616, 1.12, T.z0 + 0.15, 0.5, 0.2, 0.3);
}

/**
 * Kostya's den: a fort of the toy department's cartons in the corner behind its counter, a blanket over it for a roof,
 * a way in on its east side. Inside, a cushion, a torch, comics, a bear. At its mouth, his red hat.
 */
function den(c: Ctx): void {
  const { b } = c;
  const D = U.denBox;
  const rnd = lcg(31);
  const mouth = { z0: U.den.z - 0.55, z1: U.den.z + 0.55 };
  // the cartons: along the west and north walls one high, along the south and either side of the mouth two high
  const carton = (x: number, z: number, y: number, w: number, d: number, h: number): void => B(b, rnd() < 0.5 ? CARD : CARD_DARK, x, y + h / 2, z, w, h, d, (rnd() - 0.5) * 0.16);
  for (let x = D.x0 + 0.4; x < D.x1 - 0.2; x += 0.72) {
    carton(x, D.z1 - 0.3, 0, 0.66, 0.56, 0.55);
    carton(x + 0.1, D.z1 - 0.32, 0.55, 0.6, 0.5, 0.5);
  }
  for (const [z0, z1] of [[D.z0 + 0.2, mouth.z0], [mouth.z1, D.z1 - 0.6]] as const) {
    for (let z = z0 + 0.3; z < z1; z += 0.62) {
      carton(D.x1 - 0.3, z, 0, 0.56, 0.58, 0.55);
      carton(D.x1 - 0.32, z, 0.55, 0.5, 0.56, 0.5);
    }
  }
  for (let z = D.z0 + 0.4; z < D.z1 - 0.6; z += 0.8) carton(D.x0 + 0.3, z, 0, 0.5, 0.74, 0.62);
  // the blanket over it all: a red-and-blue check, sagging in the middle, a corner hanging over the mouth
  const bx = (D.x0 + D.x1) / 2;
  const bz = (D.z0 + D.z1) / 2 - 0.15;
  for (const s of [-1, 1]) {
    slab(b, GOODS[1]!, bx, 1.1, bz + s * 0.95, D.x1 - D.x0 - 0.1, 0.04, 2.0, -s * 0.1, 0, 0, false);
    for (let k = 0; k < 5; k++) slab(b, RED, D.x0 + 0.5 + k * 0.8, 1.125, bz + s * 0.95, 0.12, 0.02, 2.0, -s * 0.1, 0, 0, false);
  }
  // hanging down over the south side
  B(b, GOODS[1]!, bx, 0.85, D.z1 - 0.02, D.x1 - D.x0 - 0.3, 0.4, 0.03);
  slab(b, GOODS[1]!, D.x1 - 0.02, 0.86, U.den.z - 0.25, 0.04, 0.42, 0.7, 0, 0, 0.12, false);
  // inside: a cushion, a torch, a stack of comics, a bear looking out
  B(b, RED, D.x1 - 1.4, 0.08, U.den.z, 0.6, 0.16, 0.5, 0.3);
  C(b, Z.steel, D.x1 - 0.95, 0, U.den.z + 0.32, 0.04, 0.04, 0.2, 8);
  for (let k = 0; k < 4; k++) B(b, GOODS[(k * 3) % GOODS.length]!, D.x1 - 1.0, 0.012 + k * 0.012, U.den.z - 0.32, 0.24, 0.012, 0.32, k * 0.3);
  bear(b, D.x1 - 1.9, 0.02, U.den.z - 0.1, 0.8, -Math.PI / 2);
  // his hat, dropped at the mouth: a red knitted cap, its brim turned up, a white bobble
  const hx = U.den.x;
  const hz = U.den.z + 0.1;
  orb(b, Z.red, hx, 0.09, hz, 0.12, 0.85, 10, 1, 0, 1.25);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.06, 12), Z.redDark);
  brim.rotation.set(0, 0, 1.25);
  brim.position.set(hx + 0.07, 0.09, hz);
  b.add(brim, { cast: false, receive: true });
  orb(b, Z.white, hx - 0.14, 0.11, hz, 0.055, 1, 7);
  solid(c, (D.x0 + D.x1) / 2, (D.z0 + D.z1) / 2, D.x1 - D.x0, D.z1 - D.z0, 1.2, 'zarya-den', { shots: false, kind: 'none', surface: 'wood' });
  // a lamp over the corner, low
  b.light({ x: 605.5, y: 2.6, z: -27, color: 0xffcf96, intensity: 9, distance: 7, mode: 'steady', pool: 3, weight: 0.6 });
}

/** The toy railway on its round table: a green felt top, the track in a ring, a red engine and three cars, little firs, a station. */
function railway(c: Ctx): void {
  const { b } = c;
  const { x, z, r } = U.railway;
  C(b, Z.woodDark, x, 0, z, r, r, 0.72, 20);
  C(b, Z.green, x, 0.72, z, r - 0.05, r - 0.05, 0.03, 20);
  const tr = r - 0.45;
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    B(b, Z.woodDark, x + Math.cos(a) * tr, 0.76, z + Math.sin(a) * tr, 0.04, 0.012, 0.28, -a);
    for (const d of [-0.07, 0.07]) B(b, Z.steel, x + Math.cos(a) * (tr + d), 0.775, z + Math.sin(a) * (tr + d), 0.02, 0.012, 0.3, -a);
  }
  // the engine and its cars, stopped on the far side
  for (let k = 0; k < 4; k++) {
    const a = 0.9 + k * 0.24;
    const px = x + Math.cos(a) * tr;
    const pz = z + Math.sin(a) * tr;
    const yaw = -a;
    B(b, k === 0 ? RED : GOODS[[0, 1, 2, 6][k]!]!, px, 0.84, pz, 0.12, 0.12, 0.26, yaw);
    if (k === 0) {
      C(b, Z.black, px, 0.9, pz, 0.03, 0.03, 0.08, 6);
      B(b, Z.iron, px, 0.93, pz, 0.13, 0.04, 0.27, yaw);
    }
  }
  for (const [a, d, h] of [[0.2, 0.7, 0.42], [2.1, 0.6, 0.36], [3.6, 0.9, 0.48], [4.9, 0.5, 0.34], [5.6, 1.0, 0.4]] as const) firTree(b, x + Math.cos(a) * d, z + Math.sin(a) * d, h, { y: 0.74, seed: 1 });
  B(b, Z.cream, x - 0.2, 0.84, z + 0.2, 0.36, 0.18, 0.22);
  slab(b, Z.redDark, x - 0.2, 0.96, z + 0.2, 0.42, 0.04, 0.3, 0, 0, 0, false);
  B(b, Z.snow, x + 0.3, 0.75, z - 0.4, 0.6, 0.02, 0.5);
  for (const rot of [0, Math.PI / 4]) solid(c, x, z, r * 1.75, r * 1.75, 0.8, 'zarya-railway', { rot, shots: false, kind: 'prop', surface: 'wood' });
  b.light({ x, y: 3.6, z, color: 0xffd6a0, intensity: 16, distance: 13, mode: 'steady', pool: 5, weight: 0.9 });
}

/** Records: sleeves on the shelves, a counter with a record player and a radiogram, two browsing bins in front. */
function records(c: Ctx): void {
  const { b } = c;
  const sleeves = [Z.black, Z.white, Z.red, Z.blue, YELLOW, Z.cream, Z.greenDark, GOODS[4]!];
  shelves(c, 638.5, ZN + 0.36, 17, false, 211, { h: 2.6, goods: sleeves, rows: 5, goodsH: 0.32 });
  const cz = -24.8;
  counter(c, 638, cz, 14, false, 212, { goods: sleeves });
  // the record player: a case, the platter, a black disc on it, the arm
  const px = 636;
  B(b, Z.woodPale, px, 1.08, cz, 0.6, 0.1, 0.5);
  C(b, Z.iron, px - 0.06, 1.13, cz, 0.15, 0.15, 0.02, 16);
  C(b, Z.black, px - 0.06, 1.15, cz, 0.15, 0.15, 0.006, 16);
  C(b, Z.red, px - 0.06, 1.156, cz, 0.04, 0.04, 0.003, 10);
  slab(b, Z.steel, px + 0.18, 1.17, cz - 0.05, 0.02, 0.02, 0.26, 0, 0.5, 0, false);
  // the radiogram at the counter's east end: a long polished cabinet on legs, its lid up
  const rx = 643.8;
  const rz = -22.6;
  B(b, Z.wood, rx, 0.62, rz, 1.4, 0.6, 0.5);
  for (const dx of [-0.6, 0.6]) for (const dz of [-0.18, 0.18]) slab(b, Z.woodDark, rx + dx, 0.16, rz + dz, 0.04, 0.32, 0.04, 0, 0, dx * 0.2, false);
  B(b, Z.cream, rx - 0.3, 0.62, rz + 0.26, 0.6, 0.36, 0.02);
  for (const dx of [0.25, 0.5]) disc(b, Z.brass, rx + dx, 0.62, rz + 0.27, 0.04, 0.03, 0, 8);
  slab(b, Z.wood, rx, 1.05, rz - 0.22, 1.4, 0.03, 0.5, -1.0, 0, 0, false);
  solid(c, rx, rz, 1.4, 0.5, 0.95, 'zarya-radiogram', { shots: false, kind: 'prop', surface: 'wood' });
  // the bins: sleeves standing in a wooden trough, leaning back
  for (const bx of [632.4, 645.6]) {
    const bz = -20.8;
    B(b, Z.woodDark, bx, 0.36, bz, 2.4, 0.72, 0.8);
    const rnd = lcg(Math.round(bx));
    for (let k = 0; k < 28; k++) slab(b, sleeves[Math.floor(rnd() * sleeves.length)]!, bx - 1.1 + k * 0.08, 0.84, bz, 0.012, 0.31, 0.31, 0, 0, 0.18 + rnd() * 0.08, false);
    solid(c, bx, bz, 2.4, 0.8, 0.9, 'zarya-bin', { shots: false, kind: 'prop', surface: 'wood' });
  }
  // a poster of a singer on the wall over the staff door: shapes only
  B(b, Z.cream, DOOR_N, 3.0, ZN + 0.03, 1.1, 0.8, 0.02);
  B(b, Z.blue, DOOR_N - 0.2, 3.0, ZN + 0.04, 0.4, 0.6, 0.02);
  B(b, Z.red, DOOR_N + 0.28, 3.0, ZN + 0.04, 0.3, 0.3, 0.02);
}

/** The photo studio: a room of its own in the north-east corner, a painted winter on its back wall, the camera on its tripod, two lamps, portraits on the walls. */
function studio(c: Ctx): void {
  const { b } = c;
  const S = U.studio;
  const h = 3.2;
  const half = 1.1;
  const t = 0.2;
  // its two walls, panelled to the waist, a dark cornice; the doorway in the south one
  W(c, S.x0, S.z0, S.x0, S.z1, 0, h, t);
  W(c, S.x0, S.z1, U.studioDoor.x - half, S.z1, 0, h, t);
  W(c, U.studioDoor.x + half, S.z1, S.x1, S.z1, 0, h, t);
  W(c, U.studioDoor.x - half, S.z1, U.studioDoor.x + half, S.z1, 2.4, h - 2.4, t);
  B(b, Z.woodDark, S.x0, h + 0.05, (S.z0 + S.z1) / 2, 0.3, 0.1, S.z1 - S.z0);
  B(b, Z.woodDark, (S.x0 + S.x1) / 2, h + 0.05, S.z1, S.x1 - S.x0, 0.1, 0.3);
  for (const s of [-1, 1]) B(b, Z.woodDark, U.studioDoor.x + s * (half + 0.05), 1.2, S.z1, 0.1, 2.4, 0.3);
  B(b, Z.woodDark, U.studioDoor.x, 2.45, S.z1, half * 2 + 0.2, 0.1, 0.3);
  // a curtain drawn back to one side of the doorway
  for (let k = 0; k < 4; k++) B(b, k % 2 ? Z.redDark : RED, U.studioDoor.x + half - 0.15 - k * 0.12, 1.2, S.z1 - 0.2, 0.12, 2.3, 0.08);
  // the painted winter on the east wall: a sky, snow hills, firs, a moon
  const bx = XE - 0.04;
  B(b, SKY, bx, 1.9, -25, 0.04, 3.0, 7.4);
  disc(b, Z.cream, bx - 0.03, 2.9, -27, 0.32, 0.02, Math.PI / 2, 16);
  for (const [zz, r, sy] of [[-27.4, 1.9, 0.5], [-24, 2.4, 0.42], [-22, 1.6, 0.55]] as const) orb(b, Z.snow, bx - 0.04, 0.4, zz, r, sy, 12, 1, 0, 0);
  for (const [zz, hh] of [[-26.2, 1.4], [-23.4, 1.1], [-22.2, 1.6], [-27.8, 1.0]] as const) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(hh * 0.3, hh, 6), Z.fir);
    m.scale.set(0.1, 1, 1);
    m.position.set(bx - 0.04, 0.9 + hh / 2, zz);
    b.add(m, { cast: false, receive: true });
  }
  B(b, Z.woodDark, bx - 0.05, 0.25, -25, 0.06, 0.5, 7.6);
  // a sled in front of it for the children to sit on
  B(b, Z.wood, 668.4, 0.3, -23.0, 0.5, 0.05, 1.0);
  for (const s of [-1, 1]) slab(b, Z.redDark, 668.4 + s * 0.22, 0.14, -23.0, 0.04, 0.28, 1.1, 0.12, 0, 0, false);
  solid(c, 668.4, -23, 0.6, 1.1, 0.35, 'zarya-sled', { shots: false, kind: 'none', surface: 'wood' });
  // the camera: a wooden tripod, the box, its bellows, the brass lens toward the winter, the black cloth behind
  const { x: cx, z: cz } = U.camera;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    slab(b, Z.wood, cx + Math.cos(a) * 0.28, 0.72, cz + Math.sin(a) * 0.28, 0.05, 1.5, 0.05, 0.35, Math.atan2(-Math.cos(a), -Math.sin(a)), 0, false);
  }
  B(b, Z.woodDark, cx, 1.5, cz, 0.42, 0.36, 0.36);
  B(b, Z.black, cx + 0.32, 1.5, cz, 0.24, 0.3, 0.3);
  B(b, Z.woodDark, cx + 0.48, 1.5, cz, 0.08, 0.34, 0.34);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 12), Z.brass);
  lens.rotation.set(0, 0, Math.PI / 2);
  lens.position.set(cx + 0.6, 1.5, cz);
  b.add(lens, { cast: false, receive: true });
  B(b, Z.black, cx - 0.26, 1.35, cz, 0.06, 0.6, 0.5);
  solid(c, cx, cz, 0.8, 0.8, 1.8, 'zarya-camera', { shots: false, kind: 'prop', surface: 'wood' });
  // two lamps on stands, their white reflectors turned on the winter
  for (const lz of [-28.2, -21.8]) {
    const lx = 663;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      slab(b, Z.iron, lx + Math.cos(a) * 0.22, 0.2, lz + Math.sin(a) * 0.22, 0.03, 0.5, 0.03, 0.5, Math.atan2(-Math.cos(a), -Math.sin(a)), 0, false);
    }
    C(b, Z.iron, lx, 0, lz, 0.02, 0.02, 2.1, 5);
    const ref = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.12, 0.3, 14, 1, true), Z.white);
    const toward = Math.atan2(-(666.5 - lx), -(-25 - lz));
    ref.rotation.set(Math.PI / 2, toward + Math.PI, 0, 'YXZ');
    ref.position.set(lx, 2.2, lz);
    b.add(ref, { cast: false, receive: true });
    orb(b, Z.bulb, lx + 0.06, 2.2, lz + (lz < -25 ? 0.05 : -0.05), 0.09, 1, 7);
    solid(c, lx, lz, 0.6, 0.6, 2.3, 'zarya-lamp', { shots: false, kind: 'none', surface: 'metal' });
  }
  // the counter by the door, the portraits on the walls
  B(b, Z.wood, S.x0 + 0.9, 0.5, -22.4, 1.0, 1.0, 1.8);
  B(b, Z.woodPale, S.x0 + 0.9, 1.02, -22.4, 1.06, 0.04, 1.86);
  B(b, Z.cream, S.x0 + 0.9, 1.08, -22.6, 0.4, 0.06, 0.3);
  solid(c, S.x0 + 0.9, -22.4, 1.0, 1.8, 1.05, 'zarya-counter', { shots: false, kind: 'prop', surface: 'wood' });
  const rnd = lcg(55);
  for (let k = 0; k < 9; k++) {
    const x = S.x0 + 1.4 + k * 1.75;
    const w = 0.5 + rnd() * 0.3;
    const hh = w * 1.3;
    const y = 1.9 + (k % 2) * 0.35;
    B(b, k % 3 ? Z.woodDark : Z.gold, x, y, ZN + 0.03, w + 0.1, hh + 0.1, 0.03);
    B(b, k % 2 ? Z.cream : GREY, x, y, ZN + 0.05, w, hh, 0.02);
    B(b, Z.concreteDark, x, y + hh * 0.08, ZN + 0.06, w * 0.35, hh * 0.5, 0.01);
  }
  for (let k = 0; k < 4; k++) {
    const z = S.z0 + 1.6 + k * 1.9;
    B(b, Z.woodDark, S.x0 + t / 2 + 0.02, 2.0, z, 0.03, 0.8, 0.62);
    B(b, Z.cream, S.x0 + t / 2 + 0.04, 2.0, z, 0.02, 0.7, 0.52);
  }
  b.light({ x: 662, y: 3.2, z: -25, color: 0xfff0d8, intensity: 18, distance: 12, mode: 'steady', pool: 5, weight: 1 });
}

/** Fabrics and coats: two cutting tables with bolts of cloth across them, coats on two rows of racks, bolts standing on the shelves along the south wall, two dress forms, a long mirror. */
function fabrics(c: Ctx): void {
  const { b } = c;
  const rnd = lcg(77);
  for (const [x0, x1] of [[606.5, 613.5], [618, 625]] as const) {
    const x = (x0 + x1) / 2;
    const z = 3;
    B(b, Z.woodPale, x, 0.96, z, x1 - x0, 0.06, 1.2);
    B(b, Z.wood, x, 0.46, z, x1 - x0 - 0.2, 0.92, 1.0);
    B(b, Z.brass, x, 1.0, z - 0.58, x1 - x0, 0.02, 0.05);
    for (let k = 0; k < (x1 - x0) / 0.55 - 1; k++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.1, 10), GOODS[Math.floor(rnd() * GOODS.length)]!);
      m.rotation.set(Math.PI / 2, 0, 0);
      m.position.set(x0 + 0.5 + k * 0.55, 1.1, z + (rnd() - 0.5) * 0.1);
      b.add(m, { cast: false, receive: true });
    }
    // a bolt unrolled across the table, the shears on it
    B(b, GOODS[4]!, x - 1.2, 1.0, z, 1.6, 0.01, 0.9);
    slab(b, Z.steel, x - 1.0, 1.02, z + 0.1, 0.03, 0.01, 0.26, 0, 0.4, 0, false);
    solid(c, x, z, x1 - x0, 1.2, 1.0, 'zarya-table', { shots: false, kind: 'prop', surface: 'wood' });
  }
  // the racks of coats
  for (const [x0, x1, z] of [[603, 615, 8.2], [617, 629, 8.2], [603, 612, 11.2], [614, 627, 11.2]] as const) {
    const x = (x0 + x1) / 2;
    const len = x1 - x0;
    for (const s of [-1, 1]) C(b, Z.steel, x + (s * len) / 2, 0, z, 0.04, 0.04, 1.8, 6);
    B(b, Z.steel, x, 1.78, z, len, 0.05, 0.05);
    for (let k = 0; k < len / 0.38 - 0.5; k++) {
      const hh = 1.0 + rnd() * 0.3;
      B(b, GOODS[Math.floor(rnd() * GOODS.length)]!, x0 + 0.25 + k * 0.38, 1.72 - hh / 2, z, 0.27, hh, 0.5 + rnd() * 0.12);
    }
    solid(c, x, z, len, 0.8, 1.8, 'zarya-rack', { kind: 'prop', surface: 'wood' });
  }
  // bolts standing on end along the south wall, in a long rack
  const sx0 = 602;
  const sx1 = 628;
  const sz = ZS - 0.35;
  B(b, Z.woodDark, (sx0 + sx1) / 2, 0.06, sz, sx1 - sx0, 0.12, 0.6);
  B(b, Z.woodDark, (sx0 + sx1) / 2, 1.3, sz + 0.25, sx1 - sx0, 2.6, 0.06);
  B(b, Z.woodDark, (sx0 + sx1) / 2, 1.2, sz - 0.1, sx1 - sx0, 0.05, 0.05);
  for (let k = 0; k < (sx1 - sx0) / 0.26 - 1; k++) C(b, GOODS[Math.floor(rnd() * GOODS.length)]!, sx0 + 0.2 + k * 0.26, 0.12, sz + (rnd() - 0.5) * 0.12, 0.1, 0.1, 1.5 + rnd() * 0.5, 10);
  solid(c, (sx0 + sx1) / 2, sz, sx1 - sx0, 0.7, 2.6, 'zarya-shelves', { kind: 'prop', surface: 'wood' });
  // two dress forms on their stands
  for (const [x, z, m] of [[604.2, 5.2, 0], [627.4, 4.6, 4]] as const) {
    C(b, Z.iron, x, 0, z, 0.22, 0.22, 0.04, 10);
    C(b, Z.iron, x, 0, z, 0.02, 0.02, 1.0, 5);
    C(b, GOODS[m]!, x, 0.4, z, 0.36, 0.17, 0.7, 10);
    C(b, Z.cream, x, 1.0, z, 0.15, 0.17, 0.42, 10);
    C(b, Z.cream, x, 1.42, z, 0.17, 0.08, 0.14, 10);
    solid(c, x, z, 0.7, 0.7, 1.6, 'zarya-form', { shots: false, kind: 'none', surface: 'wood' });
  }
  // the long mirror on the south wall, east of the bolts
  B(b, Z.woodDark, 630.6, 1.2, ZS - 0.04, 0.9, 2.0, 0.05);
  B(b, MIRROR, 630.6, 1.2, ZS - 0.07, 0.76, 1.86, 0.02);
  b.light({ x: 610, y: 3.6, z: 6, color: 0xffcf96, intensity: 18, distance: 15, mode: 'steady', pool: 6, weight: 1 });
  b.light({ x: 623, y: 3.6, z: 7, color: 0xffcf96, intensity: 16, distance: 14, mode: 'steady', pool: 6, weight: 0.8 });
}

/** Furniture: a living room on its rug (sofa, armchair, a low table, the television, a standard lamp), the wall unit of polished wood, a bedroom, a dining table. */
function furniture(c: Ctx): void {
  const { b } = c;
  const { x, z } = U.furniture;
  const SOFA = GOODS[2]!;
  // the rug
  groundRect(b, GOODS[4]!, x - 2.4, z - 1.7, x + 2.4, z + 1.7, 0.03);
  groundRect(b, Z.redDark, x - 2.1, z - 1.4, x + 2.1, z + 1.4, 0.035);
  // the sofa along the rug's north edge, facing south
  const sz = z - 1.9;
  B(b, SOFA, x, 0.24, sz, 2.2, 0.32, 0.86);
  B(b, SOFA, x, 0.62, sz - 0.34, 2.2, 0.6, 0.2);
  for (const s of [-1, 1]) B(b, SOFA, x + s * 1.06, 0.42, sz, 0.18, 0.4, 0.86);
  for (const s of [-1, 1]) B(b, GOODS[5]!, x + s * 0.5, 0.48, sz - 0.1, 0.9, 0.16, 0.6);
  solid(c, x, sz, 2.3, 0.9, 0.95, 'zarya-sofa', { shots: false, kind: 'prop', surface: 'wood' });
  // the armchair on the east side, facing west
  const ax = x + 2.8;
  B(b, SOFA, ax, 0.26, z, 0.8, 0.34, 0.8);
  B(b, SOFA, ax + 0.32, 0.64, z, 0.18, 0.6, 0.8);
  for (const s of [-1, 1]) B(b, SOFA, ax, 0.44, z + s * 0.37, 0.8, 0.38, 0.1);
  solid(c, ax, z, 0.9, 0.9, 0.95, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });
  // the low table, a vase, an ashtray
  B(b, Z.wood, x, 0.42, z, 1.1, 0.05, 0.6);
  for (const dx of [-0.48, 0.48]) for (const dz of [-0.24, 0.24]) B(b, Z.woodDark, x + dx, 0.2, z + dz, 0.04, 0.4, 0.04);
  C(b, Z.blue, x - 0.2, 0.45, z, 0.06, 0.04, 0.24, 8);
  C(b, Z.steel, x + 0.25, 0.45, z + 0.1, 0.07, 0.07, 0.02, 10);
  solid(c, x, z, 1.1, 0.6, 0.45, 'zarya-table', { shots: false, kind: 'none', surface: 'wood' });
  // the television on its legs, on the west side, facing east
  const vx = x - 2.9;
  B(b, Z.woodDark, vx, 0.75, z, 0.55, 0.55, 0.7);
  B(b, Z.concreteDark, vx + 0.28, 0.78, z - 0.06, 0.02, 0.38, 0.48);
  for (const dz of [0.24]) disc(b, Z.brass, vx + 0.28, 0.6, z + dz, 0.03, 0.02, -Math.PI / 2, 8);
  for (const dx of [-0.2, 0.2]) for (const dz of [-0.28, 0.28]) slab(b, Z.woodDark, vx + dx, 0.24, z + dz, 0.03, 0.48, 0.03, 0, 0, dx > 0 ? -0.15 : 0.15, false);
  slab(b, Z.steel, vx, 1.18, z, 0.01, 0.4, 0.01, 0.5, 0, 0.3, false);
  solid(c, vx, z, 0.6, 0.75, 1.05, 'zarya-tv', { shots: false, kind: 'prop', surface: 'wood' });
  // the standard lamp by the sofa (lit: the one warm corner of the floor)
  C(b, Z.iron, x - 1.6, 0, sz, 0.15, 0.15, 0.03, 10);
  C(b, Z.brass, x - 1.6, 0, sz, 0.015, 0.015, 1.5, 5);
  C(b, YELLOW, x - 1.6, 1.42, sz, 0.28, 0.18, 0.32, 12);
  orb(b, Z.bulb, x - 1.6, 1.48, sz, 0.07, 1, 6);
  solid(c, x - 1.6, sz, 0.4, 0.4, 1.7, 'zarya-lamp', { shots: false, kind: 'none', surface: 'metal' });
  b.light({ x, y: 3.4, z, color: 0xffcf96, intensity: 16, distance: 13, mode: 'steady', pool: 5, weight: 1 });
  // the wall unit along the east wall: cupboards below, glass above with the crystal in it, books
  const ux = XE - 0.3;
  const u0 = -4.2;
  const u1 = 3.0;
  B(b, Z.woodDark, ux, 1.2, (u0 + u1) / 2, 0.55, 2.4, u1 - u0);
  B(b, Z.wood, ux - 0.28, 0.45, (u0 + u1) / 2, 0.02, 0.8, u1 - u0 - 0.1);
  for (let k = 1; k < 6; k++) B(b, Z.woodDark, ux - 0.29, 0.45, u0 + (k * (u1 - u0)) / 6, 0.02, 0.8, 0.03);
  B(b, Z.concreteDark, ux - 0.26, 1.6, (u0 + u1) / 2 - 1.2, 0.02, 1.2, 3.6);
  const rnd = lcg(91);
  for (const y of [1.0, 1.62]) B(b, Z.woodPale, ux - 0.36, y, (u0 + u1) / 2, 0.2, 0.03, u1 - u0 - 0.1);
  for (let k = 0; k < 14; k++) C(b, Z.white, ux - 0.36, 1.015 + Math.floor(k / 7) * 0.62, u0 + 0.4 + (k % 7) * 0.5, 0.05, 0.035, 0.18, 8);
  for (let k = 0; k < 16; k++) B(b, GOODS[Math.floor(rnd() * GOODS.length)]!, ux - 0.38, 1.17, 0.2 + k * 0.16, 0.16, 0.3 + rnd() * 0.06, 0.1);
  solid(c, ux, (u0 + u1) / 2, 0.6, u1 - u0, 2.4, 'zarya-unit', { kind: 'prop', surface: 'wood' });
  // the bedroom: a bed against the south wall under a red quilt, a wardrobe, a bedside table with a lamp
  const bx = 664;
  B(b, Z.woodDark, bx, 0.25, 12.6, 1.6, 0.3, 2.0);
  B(b, Z.white, bx, 0.45, 12.6, 1.5, 0.12, 1.9);
  B(b, RED, bx, 0.53, 12.3, 1.56, 0.08, 1.3);
  for (const s of [-1, 1]) B(b, Z.white, bx + s * 0.38, 0.58, 13.35, 0.62, 0.14, 0.4);
  B(b, Z.woodDark, bx, 0.7, ZS - 0.05, 1.7, 1.0, 0.08);
  solid(c, bx, 12.6, 1.7, 2.2, 0.6, 'zarya-bed', { shots: false, kind: 'none', surface: 'wood' });
  B(b, Z.wood, 667.8, 1.05, ZS - 0.32, 1.6, 2.1, 0.6);
  B(b, Z.woodDark, 667.8, 1.05, ZS - 0.63, 0.02, 1.9, 0.02);
  for (const dx of [-0.08, 0.08]) B(b, Z.brass, 667.8 + dx, 1.1, ZS - 0.64, 0.03, 0.14, 0.03);
  solid(c, 667.8, ZS - 0.32, 1.6, 0.6, 2.1, 'zarya-wardrobe', { kind: 'prop', surface: 'wood' });
  B(b, Z.wood, 662.4, 0.3, ZS - 0.3, 0.5, 0.6, 0.45);
  C(b, Z.brass, 662.4, 0.6, ZS - 0.3, 0.03, 0.03, 0.3, 5);
  C(b, Z.cream, 662.4, 0.86, ZS - 0.3, 0.14, 0.09, 0.16, 10);
  solid(c, 662.4, ZS - 0.3, 0.5, 0.45, 0.9, 'zarya-table', { shots: false, kind: 'none', surface: 'wood' });
  b.light({ x: 663, y: 3.4, z: 10, color: 0xffcf96, intensity: 12, distance: 11, mode: 'steady', pool: 4, weight: 0.7 });
  // the dining table with four chairs, a cloth and a fruit bowl
  const dx = 657.5;
  const dz = 9.6;
  B(b, Z.wood, dx, 0.76, dz, 1.6, 0.05, 1.0);
  B(b, Z.white, dx, 0.785, dz, 1.0, 0.01, 1.04);
  for (const sx of [-0.72, 0.72]) for (const sz2 of [-0.42, 0.42]) B(b, Z.woodDark, dx + sx, 0.37, dz + sz2, 0.05, 0.74, 0.05);
  C(b, Z.white, dx, 0.79, dz, 0.16, 0.1, 0.08, 10);
  for (let k = 0; k < 5; k++) orb(b, Z.orange, dx - 0.06 + (k % 3) * 0.06, 0.88 + Math.floor(k / 3) * 0.05, dz - 0.03 + (k % 2) * 0.06, 0.045, 1, 6);
  solid(c, dx, dz, 1.6, 1.0, 0.8, 'zarya-table', { shots: false, kind: 'prop', surface: 'wood' });
  for (const [cx, cz, yaw] of [[dx - 0.4, dz - 0.75, Math.PI], [dx + 0.4, dz - 0.75, Math.PI], [dx - 0.4, dz + 0.75, 0], [dx + 0.4, dz + 0.75, 0]] as const) {
    B(b, Z.wood, cx, 0.46, cz, 0.42, 0.05, 0.42);
    B(b, Z.woodDark, cx, 0.82, cz + (yaw === 0 ? 0.2 : -0.2), 0.42, 0.66, 0.04);
    for (const s of [-0.18, 0.18]) for (const t of [-0.18, 0.18]) B(b, Z.woodDark, cx + s, 0.22, cz + t, 0.03, 0.44, 0.03);
  }
  solid(c, dx, dz, 1.6, 2.0, 0.9, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });
  // a glass-fronted sideboard on the east wall between the wall unit and the bedroom, plates stood up in it
  const sbz = 6.8;
  B(b, Z.wood, XE - 0.25, 0.45, sbz, 0.5, 0.9, 2.4);
  B(b, Z.woodDark, XE - 0.3, 1.45, sbz, 0.4, 1.1, 2.3);
  B(b, Z.concreteDark, XE - 0.51, 1.45, sbz, 0.02, 0.9, 2.1);
  for (let k = 0; k < 6; k++) disc(b, Z.white, XE - 0.56, 1.25 + (k % 2) * 0.4, sbz - 0.8 + Math.floor(k / 2) * 0.8, 0.13, 0.02, Math.PI / 2, 12);
  for (const s of [-0.6, 0.6]) B(b, Z.brass, XE - 0.51, 0.5, sbz + s, 0.03, 0.12, 0.03);
  solid(c, XE - 0.25, sbz, 0.55, 2.4, 2.0, 'zarya-sideboard', { kind: 'prop', surface: 'wood' });
  // a writing desk and its chair, a desk lamp, by the way in from the floor's middle
  const wx = 654.5;
  const wz = -2.4;
  B(b, Z.wood, wx, 0.74, wz, 1.4, 0.05, 0.7);
  B(b, Z.woodDark, wx + 0.45, 0.36, wz, 0.45, 0.72, 0.66);
  for (const dz2 of [-0.3, 0.3]) B(b, Z.woodDark, wx - 0.64, 0.36, wz + dz2, 0.05, 0.72, 0.05);
  C(b, Z.greenDark, wx - 0.4, 0.77, wz - 0.15, 0.08, 0.02, 0.3, 8);
  B(b, Z.cream, wx, 0.78, wz + 0.05, 0.3, 0.01, 0.22, 0.2);
  solid(c, wx, wz, 1.4, 0.7, 0.8, 'zarya-desk', { shots: false, kind: 'none', surface: 'wood' });
  B(b, Z.wood, wx - 0.1, 0.46, wz + 0.7, 0.42, 0.05, 0.42);
  B(b, Z.woodDark, wx - 0.1, 0.82, wz + 0.9, 0.42, 0.66, 0.04);
  for (const s of [-0.18, 0.18]) for (const t of [-0.18, 0.18]) B(b, Z.woodDark, wx - 0.1 + s, 0.22, wz + 0.7 + t, 0.03, 0.44, 0.03);
  solid(c, wx - 0.1, wz + 0.75, 0.5, 0.5, 0.95, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });
}

/** The middle of the floor: a glass case of buttons and threads, a fir in a tub by the windows, the wire's speaker box, the fire cabinet, the pendants, garlands. */
function dressing(c: Ctx): void {
  const { b } = c;
  counter(c, 630, -11, 7, false, 221, { goods: [Z.white, Z.brass, RED, Z.blue, YELLOW, Z.black] });
  // the fir by the windows, in a striped tub
  const fx = 604.6;
  const fz = -15.5;
  C(b, RED, fx, 0, fz, 0.55, 0.6, 0.5, 14);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    B(b, Z.white, fx + Math.cos(a) * 0.6, 0.25, fz + Math.sin(a) * 0.6, 0.18, 0.5, 0.04, -a + Math.PI / 2);
  }
  firTree(b, fx, fz, 3.2, { lights: true, star: true, seed: 12, y: 0.5 });
  solid(c, fx, fz, 1.6, 1.6, 3.6, 'zarya-tree', { shots: false, kind: 'none', surface: 'wood' });
  // the wire's speaker box on the south wall, the fire cabinet beside the staff door
  B(b, Z.woodDark, DOOR_S + 2.2, 3.1, ZS - 0.1, 0.6, 0.45, 0.2);
  B(b, Z.black, DOOR_S + 2.2, 3.1, ZS - 0.21, 0.4, 0.26, 0.02);
  B(b, RED, DOOR_S - 2.2, 1.3, ZS - 0.12, 0.8, 1.0, 0.24);
  B(b, Z.white, DOOR_S - 2.2, 1.3, ZS - 0.25, 0.6, 0.8, 0.02);
  C(b, Z.redDark, DOOR_S - 2.2, 1.25, ZS - 0.3, 0.25, 0.25, 0.08, 14);
  // pendants in every bay; garlands of paper flags between the columns
  for (const x of [606, 618, 630, 642, 654, 666]) {
    for (const z of [-22, -12, -1, 9]) {
      if (x === 654 && z === 9) continue;
      C(b, Z.iron, x, H - 0.7, z, 0.02, 0.02, 0.7, 4);
      ball(b, Z.bulb, x, H - 0.8, z, 0.2);
    }
  }
  for (const [x0, z0, x1, z1] of [[612, -18, 636, -18], [612, -6, 636, -6], [648, -6, 660, -6], [612, 6, 636, 6], [648, -18, 660, -18]] as const) garland(b, x0, z0, x1, z1, H - 0.4, 30);
  // the lights the bays without one of their own get
  b.light({ x: 614, y: 3.4, z: -23, color: 0xffcf96, intensity: 24, distance: 19, mode: 'steady', pool: 6, weight: 1 });
  b.light({ x: 638, y: 3.4, z: -23, color: 0xffcf96, intensity: 24, distance: 19, mode: 'steady', pool: 6, weight: 1 });
  b.light({ x: 642, y: 3.6, z: -19.5, color: 0xffcf96, intensity: 14, distance: 12, mode: 'steady', pool: 5, weight: 0.8 });
  b.light({ x: 630, y: 3.4, z: -4, color: 0xffcf96, intensity: 24, distance: 19, mode: 'steady', pool: 6, weight: 0.8 });
  b.light({ x: 640, y: 3.4, z: 5.6, color: 0xffcf96, intensity: 14, distance: 12, mode: 'steady', pool: 5, weight: 0.8 });
  void goods;
}

export function buildUpstairs(c: Ctx, stairs: (area: number) => FloorLink): UpstairsHandles {
  const area = c.floors.addArea('The Second Floor', 'under', 0, { minX: R.x0 - 2, maxX: R.x1 + 2, minZ: R.z0 - 2, maxZ: R.z1 + 2 });
  shell(c);
  windows(c);
  wellFromBelow(c);
  escalatorUp(c);
  toys(c);
  den(c);
  railway(c);
  records(c);
  studio(c);
  fabrics(c);
  furniture(c);
  dressing(c);
  return { area, link: stairs(area) };
}
