/**
 * ZARYA: the Univermag's third floor: the staff CANTEEN (an interior built beside the map), set for the staff's New
 * Year party (`zarya/zones/canteen.ts` has its spots, its tables and who is at them). Built from
 * `research_notes/zarya/refs/cn-*`: the head of the still escalator coming up out of the west wall with the coats
 * either side of it, a red runner down the middle, two rows of long tables under white cloths, a little stage against
 * the east wall, a row of big windows onto the night along the north wall, the kitchen's serving hatch in the south
 * wall, and the Tamada's three loudspeakers on their stands in three corners, each with its cable along the floor to a
 * wall socket.
 *
 * Nothing in here casts a shadow (there is no sun to cast one), and every plain colour of one finish is one draw call
 * (`LevelBuilder.bake`), so the two hundred plates cost what one does.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import type { FloorLink } from '../floors';
import { groundRect } from '../structures';
import type { Ctx } from './util';
import { CANTEEN, CANTEEN_SEAT, CANTEEN_TABLE, canteenGuests, canteenSeats, type CanteenTable } from '../../zarya/zones/canteen';
import { yawTo } from '../../zarya/types';
import { GOODS, Z, box, cyl, firTree, slab, solid } from './zaryaKit';

export interface CanteenHandles {
  area: number;
  link: FloorLink;
}

const R = CANTEEN.rect;
const H: number = CANTEEN.h;
/** The walls' inner faces. */
const XW = R.x0 + 0.2;
const XE = R.x1 - 0.2;
const ZN = R.z0 + 0.2;
const ZS = R.z1 - 0.2;
const TAG = 'zarya-canteen';

const std = (color: number, roughness: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness });
/** The night in the windows. */
const NIGHT = std(0x0a1324, 0.9);
/** Everything outside the room. */
const SHELL = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1, side: THREE.BackSide });
const TILES = [std(0x967850, 0.7), std(0x896c4a, 0.7)];
const CEILING = std(0xf2dfb8, 0.85);
/** Painted walls, the whitewash over them. */
const WALL = std(0xd8c59c, 0.85);
const GREY = std(0x8a8f98, 0.85);
/** A raised arm's sleeve (the staff's pale coats, `zarya/crowd.ts`). */
const SLEEVE = std(0xb9b6ad, 0.9);
const ORANGE = std(0xe08a1e, 0.85);
/** What is in the bowls: olivier, vinegret, something green. */
const SALADS = [std(0xe3d9b6, 0.85), std(0x8a2440, 0.85), std(0x6f8f4a, 0.85)];
const BOTTLE = std(0x24402c, 0.85);
const RED = GOODS[0]!;
const YELLOW = GOODS[3]!;

const B = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0): void => void box(b, mat, x, y, z, sx, sy, sz, rot, false);
const C = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8): void => cyl(b, mat, x, y, z, r0, r1, h, seg, false);

function orb(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 7, sz = 1): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat);
  m.position.set(x, y, z);
  m.scale.set(1, sy, sz);
  b.add(m, { cast: false, receive: true });
}

/** A flat disc standing on its edge, its face turned the way `yaw` looks (a loudspeaker's cone, a clock). */
function disc(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, t: number, yaw: number, seg = 14): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, seg), mat);
  m.rotation.set(Math.PI / 2, yaw, 0, 'YXZ');
  m.position.set(x, y, z);
  b.add(m, { cast: false, receive: true });
}

/** A point `lx` to the right of and `lz` behind something at (x, z) that faces `yaw`. */
const off = (x: number, z: number, yaw: number, lx: number, lz: number): [number, number] => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

function lcg(seed: number): () => number {
  let s = (seed * 7919 + 13) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// the room itself
// ---------------------------------------------------------------------------------------------------------------------

/** The windows along the north wall: where each one's middle is, and its size. */
const WINDOWS = [0, 1, 2, 3, 4, 5, 6].map((i) => 434.5 + i * 6);
const WIN = { w: 5, sill: 0.9, top: 3.5 };
const HATCH = { x0: CANTEEN.hatch.x - CANTEEN.hatch.w / 2, x1: CANTEEN.hatch.x + CANTEEN.hatch.w / 2, sill: 1.0, top: 2.4 };
/** The escalator's opening in the west wall. */
const PIT = { half: 1.5, top: 2.7 };

function shell(c: Ctx): void {
  const { b } = c;
  const xc = (R.x0 + R.x1) / 2;
  // the dark round it all, so nothing shows through a window, the hatch or the escalator's well
  const dark = new THREE.Mesh(new THREE.BoxGeometry(R.x1 - R.x0 + 14, 16, R.z1 - R.z0 + 14), SHELL);
  dark.position.set(xc, 3, 0);
  b.add(dark, { cast: false, receive: false });
  // the walls: painted plain (axis-aligned, 0.4 m thick, from `y0` up `height`)
  const W = (x0: number, z0: number, x1: number, z1: number, y0 = 0, height = H): void => {
    const sx = Math.abs(x1 - x0) + (x0 === x1 ? 0.4 : 0);
    const sz = Math.abs(z1 - z0) + (z0 === z1 ? 0.4 : 0);
    if (sx < 0.02 || sz < 0.02) return;
    B(b, WALL, (x0 + x1) / 2, y0 + height / 2, (z0 + z1) / 2, sx, height, sz);
    b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: sx / 2, hz: sz / 2, y0, y1: y0 + height, mapKind: 'wall', surface: 'concrete', tag: TAG });
  };
  // east: one wall. west: either side of the escalator, and over it
  W(R.x1, R.z0, R.x1, R.z1);
  W(R.x0, R.z0, R.x0, -PIT.half);
  W(R.x0, PIT.half, R.x0, R.z1);
  W(R.x0, -PIT.half, R.x0, PIT.half, PIT.top, H - PIT.top);
  // south: either side of the serving hatch, under it and over it
  W(R.x0, R.z1, HATCH.x0, R.z1);
  W(HATCH.x1, R.z1, R.x1, R.z1);
  W(HATCH.x0, R.z1, HATCH.x1, R.z1, 0, HATCH.sill);
  W(HATCH.x0, R.z1, HATCH.x1, R.z1, HATCH.top, H - HATCH.top);
  // north: a low wall under the windows, a band over them, piers between
  W(R.x0, R.z0, R.x1, R.z0, 0, WIN.sill);
  W(R.x0, R.z0, R.x1, R.z0, WIN.top, H - WIN.top);
  let from: number = R.x0;
  for (const wx of WINDOWS) {
    W(from, R.z0, wx - WIN.w / 2, R.z0, WIN.sill, WIN.top - WIN.sill);
    from = wx + WIN.w / 2;
  }
  W(from, R.z0, R.x1, R.z0, WIN.sill, WIN.top - WIN.sill);
  b.collide({ x: xc, z: R.z0, hx: (R.x1 - R.x0) / 2, hz: 0.2, y0: WIN.sill, y1: WIN.top, mapKind: 'none', surface: 'glass', tag: 'window' });

  // the floor: big tiles in two tones, and the red runner from the escalator to the stage
  const nx = 22;
  const nz = 14;
  const tx = (XE - XW) / nx;
  const tz = (ZS - ZN) / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) groundRect(b, TILES[(i + j) % 2]!, XW + i * tx, ZN + j * tz, XW + (i + 1) * tx, ZN + (j + 1) * tz, 0.02);
  groundRect(b, Z.redDark, 433.6, -1.3, CANTEEN.stage.x0, 1.3, 0.04);
  for (const s of [-1, 1]) groundRect(b, YELLOW, 433.6, s * 1.4 - 0.1, CANTEEN.stage.x0, s * 1.4 + 0.1, 0.04);
  // the ceiling, its beams, the roof over it (a roof overhead is what tells the game it is indoors)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(XE - XW, ZS - ZN), CEILING);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(xc, H - 0.02, 0);
  b.add(ceil, { cast: false, receive: true });
  for (let i = 0; i < 6; i++) B(b, Z.cream, 437.5 + i * 6, H - 0.17, 0, 0.5, 0.34, ZS - ZN);
  b.collide({ x: xc, z: 0, hx: (R.x1 - R.x0) / 2 + 1, hz: (R.z1 - R.z0) / 2 + 1, y0: H, y1: H + 0.4, mapKind: 'none', tag: 'roof' });
  // nobody walks outside the walls: behind them all round, the kitchen behind the hatch, the escalator's well
  const beyond = (x0: number, z0: number, x1: number, z1: number): void => void solid(c, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, H, 'zarya-beyond', { kind: 'none', shots: false });
  beyond(R.x0 - 2.4, R.z0 - 2.4, R.x1 + 2.4, R.z0 - 0.2);
  beyond(R.x0 - 2.4, R.z1 + 0.2, R.x1 + 2.4, R.z1 + 3.6);
  beyond(R.x0 - 2.4, R.z0 - 2.4, R.x0 - 0.2, R.z1 + 2.4);
  beyond(R.x1 + 0.2, R.z0 - 2.4, R.x1 + 2.4, R.z1 + 2.4);
  beyond(HATCH.x0, R.z1 - 0.1, HATCH.x1, R.z1 + 0.3);
  beyond(R.x0 - 0.6, -PIT.half, R.x0 + 0.42, PIT.half);

  // wood to the waist on the west, south and east walls, under a dark rail
  const dado = (x0: number, z0: number, x1: number, z1: number): void => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? x1 - x0 : z1 - z0;
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    B(b, Z.wood, x, 0.55, z, alongX ? len : 0.05, 1.1, alongX ? 0.05 : len);
    B(b, Z.woodDark, x, 1.13, z, alongX ? len : 0.09, 0.07, alongX ? 0.09 : len);
    const n = Math.round(len / 1.2);
    for (let i = 1; i < n; i++) B(b, Z.woodDark, alongX ? x0 + (i * len) / n : x, 0.55, alongX ? z : z0 + (i * len) / n, alongX ? 0.04 : 0.07, 1.1, alongX ? 0.07 : 0.04);
  };
  dado(XW + 0.02, ZN, XW + 0.02, -PIT.half - 0.1);
  dado(XW + 0.02, PIT.half + 0.1, XW + 0.02, ZS);
  dado(XW, ZS - 0.02, HATCH.x0 - 0.2, ZS - 0.02);
  dado(HATCH.x1 + 0.2, ZS - 0.02, XE, ZS - 0.02);
  dado(XE - 0.02, ZN, XE - 0.02, CANTEEN.stage.z0 - 0.3);
  dado(XE - 0.02, CANTEEN.stage.z1 + 0.3, XE - 0.02, ZS);
}

/** The row of windows onto the night: dark panes in pale frames, snow drifted on the sills outside, the town's lit windows far below. */
function windows(c: Ctx): void {
  const { b } = c;
  const mid = (WIN.sill + WIN.top) / 2;
  const tall = WIN.top - WIN.sill;
  WINDOWS.forEach((wx, i) => {
    const rnd = lcg(40 + i);
    B(b, NIGHT, wx, mid, R.z0 - 0.17, WIN.w, tall, 0.04);
    // the frame: a rail top and bottom, a transom, five uprights
    const zf = R.z0 + 0.04;
    B(b, Z.white, wx, WIN.sill + 0.05, zf, WIN.w, 0.1, 0.1);
    B(b, Z.white, wx, WIN.top - 0.05, zf, WIN.w, 0.1, 0.1);
    B(b, Z.white, wx, 2.72, zf, WIN.w, 0.07, 0.08);
    for (const dx of [-WIN.w / 2 + 0.05, -1.25, 0, 1.25, WIN.w / 2 - 0.05]) B(b, Z.white, wx + dx, mid, zf, 0.09, tall, 0.1);
    // the board inside, snow on the ledge outside and caught in the corners of the panes
    B(b, Z.white, wx, WIN.sill + 0.02, ZN + 0.09, WIN.w + 0.16, 0.05, 0.3);
    B(b, Z.snow, wx, WIN.sill + 0.04, R.z0 - 0.08, WIN.w, 0.08, 0.13);
    for (let k = 0; k < 6; k++) orb(b, Z.snow, wx - 2.1 + k * 0.84 + (rnd() - 0.5) * 0.5, WIN.sill + 0.07, R.z0 - 0.09, 0.28 + rnd() * 0.22, 0.2 + rnd() * 0.16, 9, 0.18);
    for (const dx of [-2.36, -1.34, -1.16, -0.09, 0.09, 1.16, 1.34, 2.36]) if (rnd() > 0.3) orb(b, Z.snow, wx + dx, WIN.sill + 0.1, R.z0 - 0.1, 0.1 + rnd() * 0.06, 1 + rnd() * 0.7, 7, 0.45);
    // the town, far off and below: a few lit windows in the blocks across the square
    for (let k = 0; k < 2; k++) {
      const bx = wx - 2 + rnd() * 3.2;
      const by = 1.15 + rnd() * 0.5;
      for (let u = 0; u < 6; u++) for (let v = 0; v < 4; v++) if (rnd() < 0.35) B(b, Z.warm, bx + u * 0.13, by + v * 0.12, R.z0 - 0.14, 0.05, 0.06, 0.02);
    }
    // a radiator under each, a paper garland swagged over each
    for (let k = 0; k < 12; k++) B(b, Z.white, wx - 0.94 + k * 0.17, 0.46, ZN + 0.09, 0.13, 0.52, 0.11);
    for (const y of [0.24, 0.68]) B(b, Z.white, wx, y, ZN + 0.09, 2.0, 0.05, 0.05);
    paperChain(b, wx - 2.55, ZN + 0.2, wx + 2.55, ZN + 0.2, 3.98, 0.42, 14, i);
  });
  // a brass lamp on each pier between them
  for (let i = 0; i < 6; i++) {
    const x = 437.5 + i * 6;
    B(b, Z.gold, x, 2.5, ZN + 0.03, 0.2, 0.5, 0.05);
    B(b, Z.bulb, x, 2.56, ZN + 0.09, 0.12, 0.3, 0.09);
  }
}

/** The head of the still escalator: the last flat steps and the comb plate between two handrails, the rest going down west into the dark. */
function escalator(c: Ctx): void {
  const { b } = c;
  const ang = 0.5;
  // the flat steps, the comb plate with its yellow line (where `head` is)
  B(b, Z.iron, 431.35, 0.035, 0, 2.4, 0.03, 2.0);
  for (let i = 0; i < 5; i++) B(b, Z.steel, 430.62 + i * 0.42, 0.065, 0, 0.38, 0.03, 1.96);
  B(b, GREY, 432.9, 0.045, 0, 0.8, 0.05, 2.06);
  B(b, YELLOW, 432.54, 0.076, 0, 0.07, 0.012, 1.96);
  for (let k = 0; k < 9; k++) B(b, Z.iron, 432.9, 0.073, -0.88 + k * 0.22, 0.6, 0.008, 0.05);
  // the steps going down into the well
  for (let i = 0; i < 11; i++) {
    B(b, Z.steel, 430.2 - i * 0.42, 0.065 - (i + 1) * 0.23, 0, 0.42, 0.03, 1.96);
    B(b, Z.iron, 430.41 - i * 0.42, 0.065 - (i + 0.5) * 0.23, 0, 0.03, 0.23, 1.96);
  }
  for (const s of [-1, 1]) {
    const z = s * 1.15;
    // the balustrade in the room, its handrail, the newel it turns round
    B(b, GREY, 431.35, 0.5, z, 3.1, 0.9, 0.24);
    B(b, Z.black, 431.35, 0.99, z, 3.1, 0.08, 0.3);
    disc(b, Z.black, 432.9, 0.5, z, 0.53, 0.3, 0, 16);
    disc(b, GREY, 432.9, 0.5, z, 0.45, 0.32, 0, 16);
    // and going down with the steps
    const L = 5.4;
    const cx = 429.9 - (L / 2) * Math.cos(ang);
    const cy = 0.5 - (L / 2) * Math.sin(ang);
    slab(b, GREY, cx, cy, z, L, 0.9, 0.24, 0, 0, ang, false);
    slab(b, Z.black, cx - Math.sin(ang) * 0.49, cy + Math.cos(ang) * 0.49, z, L, 0.08, 0.3, 0, 0, ang, false);
    solid(c, 431.6, z, 3.7, 0.3, 1.05, 'zarya-escalator', { shots: false, kind: 'prop', surface: 'metal' });
    // the well's sides
    B(b, Z.black, 427.4, -0.4, s * 1.56, 4.8, 6.4, 0.1);
    // the opening's steel trim
    B(b, Z.steel, XW + 0.02, PIT.top / 2, s * (PIT.half + 0.02), 0.1, PIT.top, 0.14);
  }
  B(b, Z.black, 425, -0.4, 0, 0.1, 6.4, 3.2);
  slab(b, Z.black, 427.6, 1.55, 0, 5.6, 0.1, 3.1, 0, 0, ang, false);
  B(b, Z.steel, XW + 0.02, PIT.top + 0.04, 0, 0.1, 0.14, PIT.half * 2 + 0.18);
  // the shutter that closed it, rolled up into its box
  B(b, Z.steel, XW + 0.16, PIT.top + 0.3, 0, 0.34, 0.4, PIT.half * 2 + 0.3);
  B(b, Z.steel, XW + 0.1, PIT.top - 0.08, 0, 0.06, 0.2, PIT.half * 2 - 0.1);
}

/** Coats on a rail along the west wall, hats on the shelf over them, boots under. */
function coatRail(c: Ctx, z0: number, z1: number, seed: number): void {
  const { b } = c;
  const x = XW + 0.75;
  const zc = (z0 + z1) / 2;
  const len = z1 - z0;
  const rnd = lcg(seed);
  for (const z of [z0, zc, z1]) C(b, Z.steel, x, 0, z, 0.035, 0.035, 1.82, 6);
  B(b, Z.steel, x, 1.8, zc, 0.05, 0.05, len);
  for (let k = 0; k * 0.36 < len - 0.4; k++) {
    if (rnd() < 0.12) continue;
    const h = 1.0 + rnd() * 0.3;
    B(b, GOODS[Math.floor(rnd() * GOODS.length)]!, x, 1.74 - h / 2, z0 + 0.25 + k * 0.36, 0.46 + rnd() * 0.12, h, 0.27);
    if (rnd() < 0.6) for (const s of [-1, 1]) B(b, Z.black, x + 0.12 + rnd() * 0.1, 0.11, z0 + 0.25 + k * 0.36 + s * 0.07, 0.26, 0.2, 0.1);
  }
  B(b, Z.woodPale, XW + 0.3, 2.02, zc, 0.5, 0.04, len + 0.2);
  for (const z of [z0, zc, z1]) B(b, Z.woodDark, XW + 0.28, 1.9, z, 0.46, 0.2, 0.04);
  for (let k = 0; k * 0.5 < len - 0.3; k++) if (rnd() < 0.7) orb(b, [Z.wood, Z.black, Z.woodDark, GOODS[4]!][Math.floor(rnd() * 4)]!, XW + 0.32, 2.12, z0 + 0.2 + k * 0.5, 0.15, 0.75);
  solid(c, x - 0.1, zc, 1.0, len + 0.2, 1.9, 'zarya-rack', { kind: 'prop', surface: 'wood' });
}

/** A palm in a tub. */
function plant(c: Ctx, x: number, z: number): void {
  const { b } = c;
  C(b, Z.woodDark, x, 0, z, 0.24, 0.3, 0.5, 8);
  C(b, Z.greenDark, x, 0.5, z, 0.03, 0.04, 0.5, 5);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    slab(b, k % 2 ? Z.green : Z.greenDark, x + Math.sin(a) * 0.28, 1.12 + (k % 3) * 0.08, z + Math.cos(a) * 0.28, 0.16, 0.85, 0.03, 0.75, a, 0, false);
  }
  solid(c, x, z, 0.6, 0.6, 1.4, 'zarya-plant', { shots: false, kind: 'none', surface: 'wood' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the party
// ---------------------------------------------------------------------------------------------------------------------

/** A canteen chair: red seat and back on a thin dark frame, facing `yaw`. */
function chair(b: LevelBuilder, x: number, z: number, yaw: number): void {
  B(b, Z.redDark, x, 0.46, z, 0.42, 0.05, 0.42, yaw);
  const [bx, bz] = off(x, z, yaw, 0, 0.2);
  B(b, Z.redDark, bx, 0.8, bz, 0.42, 0.3, 0.04, yaw);
  for (const s of [-1, 1]) {
    const [fx, fz] = off(x, z, yaw, s * 0.19, -0.18);
    B(b, Z.iron, fx, 0.22, fz, 0.03, 0.44, 0.03, yaw);
    const [rx, rz] = off(x, z, yaw, s * 0.19, 0.2);
    B(b, Z.iron, rx, 0.47, rz, 0.03, 0.94, 0.03, yaw);
  }
}

function bottle(b: LevelBuilder, x: number, z: number, y: number, champagne: boolean): void {
  C(b, BOTTLE, x, y, z, 0.042, 0.042, 0.2, 6);
  C(b, BOTTLE, x, y + 0.2, z, 0.042, 0.016, 0.07, 6);
  C(b, champagne ? Z.gold : BOTTLE, x, y + 0.27, z, 0.018, 0.018, 0.07, 6);
  if (!champagne) B(b, Z.white, x, y + 0.1, z, 0.088, 0.07, 0.088);
}

function bowl(b: LevelBuilder, x: number, z: number, y: number, what: THREE.Material): void {
  C(b, Z.white, x, y, z, 0.1, 0.18, 0.1, 10);
  orb(b, what, x, y + 0.1, z, 0.16, 0.45);
}

function mandarinDish(b: LevelBuilder, x: number, z: number, y: number): void {
  C(b, Z.white, x, y, z, 0.12, 0.2, 0.03, 10);
  for (let k = 0; k < 6; k++) orb(b, ORANGE, x + Math.cos(k * 1.05) * 0.1, y + 0.07, z + Math.sin(k * 1.05) * 0.1, 0.05, 1, 6);
  for (let k = 0; k < 3; k++) orb(b, ORANGE, x + Math.cos(k * 2.1 + 0.5) * 0.045, y + 0.14, z + Math.sin(k * 2.1 + 0.5) * 0.045, 0.05, 1, 6);
}

/** One run of tables under white cloths, set for the party. */
function tableRun(c: Ctx, t: CanteenTable, n: number): void {
  const { b } = c;
  const { len, w } = CANTEEN_TABLE;
  const top = 0.8;
  const rnd = lcg(90 + n);
  for (let k = 0; k < len / 2.4 - 0.5; k++) {
    const x = t.x0 + 1.2 + k * 2.4;
    const drop = 0.3 + rnd() * 0.1;
    B(b, Z.white, x, top - 0.025, t.z, 2.38, 0.05, w + 0.05);
    for (const s of [-1, 1]) {
      B(b, Z.white, x, top - 0.02 - drop / 2, t.z + s * (w / 2 + 0.02), 2.38, drop, 0.02);
      for (const dx of [-1.02, 1.02]) B(b, Z.woodDark, x + dx, 0.38, t.z + s * 0.5, 0.06, 0.76, 0.06);
    }
  }
  for (const x of [t.x0 - 0.01, t.x0 + len + 0.01]) B(b, Z.white, x, top - 0.19, t.z, 0.02, 0.34, w + 0.05);
  solid(c, t.x0 + len / 2, t.z, len, w, top + 0.02, 'zarya-table', { shots: false, kind: 'prop', surface: 'wood' });

  // down the middle: salads, bottles, mandarins, a jug of kompot, a plate of something sliced
  const order = ['olivier', 'champagne', 'mandarins', 'vodka', 'vinegret', 'slices', 'champagne', 'greens', 'jug', 'mandarins', 'vodka', 'olivier'];
  for (let k = 0; k < len / 0.8 - 0.5; k++) {
    const x = t.x0 + 0.4 + k * 0.8 + (rnd() - 0.5) * 0.16;
    const z = t.z + (rnd() - 0.5) * 0.3;
    const what = order[(k + n * 5) % order.length]!;
    if (what === 'olivier') bowl(b, x, z, top, SALADS[0]!);
    else if (what === 'vinegret') bowl(b, x, z, top, SALADS[1]!);
    else if (what === 'greens') bowl(b, x, z, top, SALADS[2]!);
    else if (what === 'mandarins') mandarinDish(b, x, z, top);
    else if (what === 'champagne' || what === 'vodka') {
      bottle(b, x, z, top, what === 'champagne');
      if (rnd() < 0.6) bottle(b, x + 0.13, z + 0.1, top, what !== 'champagne');
    } else if (what === 'jug') {
      C(b, RED, x, top, z, 0.07, 0.085, 0.2, 8);
      C(b, Z.white, x, top + 0.2, z, 0.085, 0.07, 0.03, 8);
    } else {
      C(b, Z.white, x, top, z, 0.16, 0.2, 0.02, 10);
      for (let i = 0; i < 6; i++) B(b, i % 2 ? Z.cream : Z.redDark, x - 0.11 + i * 0.045, top + 0.035, z + (i % 2 ? 0.03 : -0.03), 0.02, 0.05, 0.1, 0.5);
    }
  }
}

/** Every place at the tables: its plate and glass, and its chair where the one who sat in it left it. */
function places(c: Ctx): void {
  const { b } = c;
  const top = 0.8;
  const rnd = lcg(7);
  const seats = canteenSeats();
  seats.forEach((s, i) => {
    const zin = s.tableZ + s.side * 0.42;
    C(b, Z.cream, s.x, top, zin, 0.1, 0.13, 0.015, 8);
    if (rnd() < 0.5) orb(b, [SALADS[0]!, SALADS[1]!, ORANGE][i % 3]!, s.x + 0.02, top + 0.02, zin, 0.06, 0.5, 6);
    B(b, Z.steel, s.x - 0.18, top + 0.006, zin, 0.015, 0.008, 0.16, (rnd() - 0.5) * 0.4);
    // a glass at every place but the ones whose glass is in a raised hand
    if (s.kind !== 'S') C(b, Z.gold, s.x + 0.19, top, s.tableZ + s.side * 0.26, 0.022, 0.03, 0.1, 6);
    else if (rnd() < 0.5) B(b, Z.white, s.x + 0.2, top + 0.01, zin, 0.14, 0.02, 0.14, 0.6);
    if (s.kind === '.' || s.kind === 's') chair(b, s.x, s.tableZ + s.side * CANTEEN_SEAT.chair, s.yaw);
    else {
      // pushed back, and left askew
      const back = s.kind === 'S' ? CANTEEN_SEAT.back : 1.42;
      const x = s.x + (rnd() - 0.5) * 0.24;
      const z = s.tableZ + s.side * back;
      chair(b, x, z, s.yaw + (rnd() - 0.5) * 0.9);
      solid(c, x, z, 0.5, 0.5, 0.95, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });
    }
  });
  // the chairs still pushed in stop a walker as one low bar a side (a sitter's place is theirs: they are solid themselves)
  for (let i = 0; i < seats.length; ) {
    const s = seats[i]!;
    if (s.kind !== '.') {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < seats.length && seats[j + 1]!.kind === '.' && seats[j + 1]!.side === s.side && seats[j + 1]!.tableZ === s.tableZ && Math.abs(seats[j + 1]!.x - seats[j]!.x) < CANTEEN_TABLE.step + 0.1) j++;
    const x1 = seats[j]!.x;
    solid(c, (s.x + x1) / 2, s.tableZ + s.side * CANTEEN_SEAT.chair, x1 - s.x + 0.5, 0.48, 0.95, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });
    i = j + 1;
  }
  // the ones on their feet: a glass raised to the toastmaster (the figure's own arms hang: `zarya/crowd.ts`)
  for (const g of canteenGuests()) {
    if (g.sits) continue;
    const [ax, az] = off(g.x, g.z, g.yaw, 0.27, -0.15);
    slab(b, SLEEVE, ax, 1.55, az, 0.12, 0.48, 0.12, -0.7, g.yaw, 0, false);
    const [hx, hz] = off(g.x, g.z, g.yaw, 0.27, -0.33);
    orb(b, Z.cream, hx, 1.75, hz, 0.06, 1, 6);
    C(b, Z.gold, hx, 1.79, hz, 0.022, 0.032, 0.11, 6);
  }
}

/** The little stage against the east wall: boards, a red curtain, a banner of paper flags, the microphone. */
function stage(c: Ctx): void {
  const { b } = c;
  const S = CANTEEN.stage;
  const h = CANTEEN.stageH;
  const xc = (S.x0 + S.x1) / 2;
  const d = S.z1 - S.z0;
  B(b, Z.wood, xc, h / 2, 0, S.x1 - S.x0, h, d);
  B(b, Z.woodDark, S.x0 - 0.02, h / 2, 0, 0.04, h + 0.02, d + 0.08);
  for (const s of [-1, 1]) B(b, Z.woodDark, xc, h / 2, s * (d / 2 + 0.02), S.x1 - S.x0, h + 0.02, 0.04);
  for (let k = 1; k < 11; k++) B(b, Z.woodDark, xc, h + 0.002, S.z0 + k, S.x1 - S.x0, 0.004, 0.03);
  b.collide({ x: xc, z: 0, hx: (S.x1 - S.x0) / 2, hz: d / 2, y0: 0, y1: h, floor: true, surface: 'wood', mapKind: 'none', tag: 'zarya-stage' });
  // a row of bulbs along its front edge
  for (let k = 0; k <= 26; k++) B(b, Z.bulb, S.x0 - 0.05, h - 0.07, S.z0 + 0.3 + (k * (d - 0.6)) / 26, 0.05, 0.07, 0.07);
  // the curtain behind, in folds, under a pelmet with a gold fringe
  for (let k = 0; k < 29; k++) B(b, k % 2 ? RED : Z.redDark, XE - 0.1 - (k % 2) * 0.05, (h + 3.75) / 2, -5.6 + k * 0.4, 0.1, 3.75 - h, 0.41);
  B(b, Z.redDark, XE - 0.2, 3.95, 0, 0.36, 0.5, d + 0.9);
  B(b, YELLOW, XE - 0.4, 3.68, 0, 0.03, 0.07, d + 0.9);
  // the banner of paper flags, two strings of it, and a big paper snowflake between
  for (const [y, sag, n] of [[3.45, 0.5, 30], [2.95, 0.35, 22]] as const) {
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      B(b, GOODS[(k * 3 + n) % GOODS.length]!, XE - 0.26, y - Math.sin(t * Math.PI) * sag, S.z0 + 0.4 + t * (d - 0.8), 0.02, 0.3, 0.24);
    }
  }
  snowflake(b, XE - 0.22, 2.0, 0, 0.75, Math.PI / 2);
  // the microphone on its stand, its lead going off the side of the stage
  const mx = CANTEEN.tamada.x - 0.9;
  C(b, Z.iron, mx, h, 0, 0.17, 0.15, 0.03, 12);
  C(b, Z.steel, mx, h, 0, 0.014, 0.014, 1.34, 5);
  slab(b, Z.black, mx + 0.06, h + 1.36, 0, 0.17, 0.045, 0.045, 0, 0, 0.5, false);
  orb(b, Z.steel, mx + 0.15, h + 1.41, 0, 0.038);
  cable(b, [[mx + 0.1, 0.1], [mx + 0.5, 1.2], [mx + 0.2, 2.6], [mx + 0.7, 4.1], [mx + 0.5, S.z1 - 0.1]], h);
  // an accordion left on a stool at the side
  C(b, Z.woodDark, 469.6, h, -3.9, 0.2, 0.2, 0.46, 8);
  B(b, RED, 469.6, h + 0.6, -4.12, 0.34, 0.28, 0.14, 0.2);
  B(b, Z.black, 469.6, h + 0.6, -3.9, 0.3, 0.26, 0.3, 0.2);
  B(b, RED, 469.6, h + 0.6, -3.68, 0.34, 0.28, 0.14, 0.2);
  B(b, Z.white, 469.42, h + 0.6, -3.66, 0.03, 0.22, 0.1, 0.2);
  b.collide({ x: 469.6, z: -3.9, hx: 0.3, hz: 0.34, y0: h, y1: h + 0.8, blocksShots: false, mapKind: 'none', surface: 'wood', tag: 'zarya-stool' });
}

/** A paper snowflake stuck to a wall: three crossed strips, their tips barbed. `yaw` is the way the wall runs. */
function snowflake(b: LevelBuilder, x: number, y: number, z: number, r: number, yaw: number): void {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    slab(b, Z.white, x, y, z, r * 2, r * 0.13, 0.015, 0, yaw, a, false);
    for (const s of [-1, 1]) {
      const [tx, tz] = off(x, z, yaw, Math.cos(a) * r * 0.62 * s, 0);
      slab(b, Z.white, tx, y + Math.sin(a) * r * 0.62 * s, tz, r * 0.5, r * 0.1, 0.015, 0, yaw, a + Math.PI / 2, false);
    }
  }
}

/** A paper garland from wall to wall: little flags of every colour on a string that sags in the middle. */
function paperChain(b: LevelBuilder, x0: number, z0: number, x1: number, z1: number, y: number, sag: number, n: number, seed: number): void {
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  let px = x0;
  let py = y;
  let pz = z0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const yy = y - Math.sin(t * Math.PI) * sag;
    const flat = Math.hypot(x - px, z - pz);
    slab(b, Z.white, (x + px) / 2, (yy + py) / 2, (z + pz) / 2, Math.hypot(flat, yy - py) + 0.01, 0.014, 0.014, 0, yaw, Math.atan2(yy - py, flat), false);
    if (i < n) B(b, i % 3 === 0 ? Z.white : GOODS[(i * 3 + seed) % GOODS.length]!, x, yy - 0.11, z, 0.16, 0.2, 0.012, yaw);
    px = x;
    py = yy;
    pz = z;
  }
}

/** A lead lying on the floor (or on boards `y` up) through these points. */
function cable(b: LevelBuilder, pts: readonly (readonly [number, number])[], y = 0.02): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i]!;
    const [x1, z1] = pts[i + 1]!;
    B(b, Z.black, (x0 + x1) / 2, y + 0.02, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) + 0.05, 0.035, 0.05, Math.atan2(-(z1 - z0), x1 - x0));
  }
}

/**
 * A loudspeaker on its stand (a tall black box with a round pale cone on its face, about 1.6 m up), turned to the
 * middle of the room, and its lead along the floor by the wall to its socket: a pale plate at knee height with a
 * black plug in it.
 */
function loudspeaker(c: Ctx, at: { x: number; z: number }, plug: { x: number; z: number }): void {
  const { b } = c;
  const { x, z } = at;
  const yaw = yawTo(x, z, 452, 0);
  C(b, Z.iron, x, 0, z, 0.03, 0.03, 1.3, 6);
  C(b, Z.iron, x, 0.66, z, 0.05, 0.05, 0.1, 6);
  for (let k = 0; k < 3; k++) {
    const a = yaw + 0.4 + (k * Math.PI * 2) / 3;
    slab(b, Z.iron, x + Math.cos(a) * 0.29, 0.36, z + Math.sin(a) * 0.29, 0.035, 0.92, 0.035, 0.69, Math.atan2(-Math.cos(a), -Math.sin(a)), 0, false);
  }
  B(b, Z.black, x, 1.7, z, 0.58, 0.86, 0.48, yaw);
  B(b, Z.iron, x, 1.7, z, 0.6, 0.06, 0.5, yaw);
  const f = (d: number): [number, number] => off(x, z, yaw, 0, -d);
  const [cx, cz] = f(0.245);
  disc(b, Z.cream, cx, 1.56, cz, 0.2, 0.03, yaw, 16);
  const [dx, dz] = f(0.255);
  disc(b, GREY, dx, 1.56, dz, 0.075, 0.03, yaw, 10);
  disc(b, Z.cream, cx, 1.95, cz, 0.08, 0.03, yaw, 10);
  solid(c, x, z, 0.9, 0.9, 2.13, 'zarya-speaker', { kind: 'prop', surface: 'wood' });

  // the socket on the wall behind `plug`, and the lead to it along the foot of that wall
  const s = plug.z < 0 ? -1 : 1;
  const zw = s < 0 ? ZN : ZS - 0.045;
  B(b, Z.white, plug.x, 0.45, zw - s * 0.015, 0.28, 0.28, 0.03);
  // (the plug in it is the story's: `zarya/look.ts` draws it in, or pulled and on the floor)
  const zl = zw - s * 0.3;
  const pts: [number, number][] = [[x, z], [x + Math.sign(plug.x - x) * 0.7, zl - s * 0.2]];
  const run = plug.x - pts[1]![0];
  const n = Math.max(1, Math.round(Math.abs(run) / 1.3));
  for (let k = 1; k < n; k++) pts.push([pts[1]![0] + (run * k) / n, zl + (k % 2 ? 0.07 : -0.05)]);
  pts.push([plug.x, zl], [plug.x, zw - s * 0.08]);
  cable(b, pts);
}

/** The serving hatch in the south wall: a steel counter in the opening, the kitchen dark behind it. */
function hatch(c: Ctx): void {
  const { b } = c;
  const x = CANTEEN.hatch.x;
  const w = CANTEEN.hatch.w;
  // the opening's trim, the shutter rolled up under its lintel
  for (const s of [-1, 1]) B(b, Z.white, x + s * (w / 2 + 0.05), (HATCH.sill + HATCH.top) / 2, ZS - 0.03, 0.12, HATCH.top - HATCH.sill, 0.14);
  B(b, Z.white, x, HATCH.top + 0.05, ZS - 0.03, w + 0.22, 0.12, 0.14);
  B(b, Z.steel, x, HATCH.top - 0.13, R.z1, w, 0.26, 0.3);
  // the counter
  B(b, Z.cream, x, HATCH.sill + 0.03, ZS - 0.1, w + 0.3, 0.05, 1.0);
  B(b, Z.woodPale, x, HATCH.sill / 2, ZS - 0.56, w + 0.3, HATCH.sill, 0.06);
  for (const s of [-1, 1]) B(b, Z.woodPale, x + s * (w / 2 + 0.12), HATCH.sill / 2, ZS - 0.3, 0.06, HATCH.sill, 0.56);
  B(b, Z.steel, x, 0.86, ZS - 0.62, w + 0.3, 0.04, 0.04);
  solid(c, x, ZS - 0.3, w + 0.3, 0.62, HATCH.sill + 0.06, 'zarya-hatch', { shots: false, kind: 'prop', surface: 'metal' });
  // on it: stacks of plates, a tray of glasses, the big pot and its ladle, a dish of mandarins
  const y = HATCH.sill + 0.055;
  for (const [dx, n] of [[-2.6, 0.22], [-2.25, 0.3], [-1.9, 0.14]] as const) C(b, Z.white, x + dx, y, ZS - 0.25, 0.13, 0.13, n, 10);
  B(b, Z.woodDark, x - 0.7, y + 0.01, ZS - 0.28, 0.7, 0.02, 0.44);
  for (let k = 0; k < 10; k++) C(b, Z.gold, x - 0.96 + (k % 5) * 0.13, y + 0.02, ZS - 0.36 + Math.floor(k / 5) * 0.16, 0.022, 0.03, 0.1, 6);
  C(b, GREY, x + 0.8, y, ZS - 0.2, 0.26, 0.26, 0.34, 12);
  slab(b, Z.steel, x + 0.95, y + 0.42, ZS - 0.2, 0.025, 0.5, 0.025, 0, 0, -0.5, false);
  mandarinDish(b, x + 2.1, ZS - 0.3, y);
  bottle(b, x + 2.6, ZS - 0.2, y, true);
  // the kitchen: tiled to the shoulder, a range with its pots under a hood, a steel table, shelves of pans
  const z1 = R.z1 + 3.4;
  groundRect(b, Z.concreteDark, x - w / 2 - 0.5, R.z1 + 0.2, x + w / 2 + 0.5, z1, 0.02);
  B(b, Z.black, x, 1.6, z1, w + 1, 3.2, 0.1);
  B(b, Z.concreteDark, x, 0.9, z1 - 0.06, w + 1, 1.8, 0.04);
  for (const s of [-1, 1]) B(b, Z.black, x + s * (w / 2 + 0.5), 1.6, R.z1 + 1.8, 0.1, 3.2, 3.3);
  B(b, Z.black, x, 3.1, R.z1 + 1.8, w + 1, 0.1, 3.4);
  B(b, Z.iron, x - 1.5, 0.45, z1 - 0.6, 2.4, 0.9, 0.9);
  C(b, Z.concreteDark, x - 2.2, 0.9, z1 - 0.6, 0.3, 0.3, 0.42, 12);
  C(b, Z.steel, x - 1.3, 0.9, z1 - 0.55, 0.22, 0.22, 0.3, 12);
  C(b, Z.concreteDark, x - 0.7, 0.9, z1 - 0.7, 0.17, 0.17, 0.2, 10);
  B(b, Z.iron, x - 1.5, 2.3, z1 - 0.6, 2.6, 0.5, 1.0);
  B(b, Z.iron, x + 1.6, 0.9, z1 - 0.9, 2.6, 0.05, 0.8);
  for (const s of [-1.2, 1.2]) B(b, Z.iron, x + 1.6 + s, 0.44, z1 - 0.9, 0.05, 0.88, 0.7);
  for (const yy of [1.6, 2.1]) {
    B(b, Z.iron, x + 1.6, yy, z1 - 0.22, 2.8, 0.04, 0.34);
    for (let k = 0; k < 6; k++) C(b, k % 2 ? Z.concreteDark : Z.steel, x + 0.45 + k * 0.46, yy + 0.02, z1 - 0.22, 0.13 + (k % 3) * 0.02, 0.13 + (k % 3) * 0.02, 0.16 + (k % 2) * 0.08, 8);
  }
  for (let k = 0; k < 5; k++) B(b, Z.steel, x + 0.5 + k * 0.3, 1.3 - (k % 2) * 0.06, z1 - 0.12, 0.03, 0.4, 0.03);
}

/** A warm lamp on a cord: a pale shade, a lit glass under it. */
function pendant(b: LevelBuilder, x: number, z: number): void {
  C(b, Z.iron, x, 3.48, z, 0.015, 0.015, H - 3.48, 4);
  C(b, Z.cream, x, 3.3, z, 0.36, 0.1, 0.2, 12);
  C(b, Z.bulb, x, 3.275, z, 0.31, 0.31, 0.02, 12);
  orb(b, Z.bulb, x, 3.27, z, 0.14, 0.8);
}

function dressing(c: Ctx): void {
  const { b } = c;
  // paper garlands across the room from wall to wall, crossing over the tables
  for (const [x0, x1] of [[434, 445], [445, 456], [456, 467]] as const) {
    paperChain(b, x0, ZN + 0.3, x1, ZS - 0.3, 3.74, 0.55, 66, x0);
    paperChain(b, x0, ZS - 0.3, x1, ZN + 0.3, 3.74, 0.4, 66, x0 + 3);
  }
  // lamps: three rows of them, a real light in eight
  const lit = new Set(['443.5,-7.4', '443.5,7.4', '458,-7.4', '458,7.4', '437.5,0', '450.7,0', '464,0']);
  for (const x of [437.5, 443.5, 450.7, 458, 464]) {
    for (const z of [-7.4, 0, 7.4]) {
      pendant(b, x, z);
      if (lit.has(`${x},${z}`)) b.light({ x, y: 3.05, z, color: 0xffcf96, intensity: 24, distance: 19, mode: 'steady', pool: 6, weight: 1 });
    }
  }
  for (const z of [-3, 3]) pendant(b, 468.6, z);
  b.light({ x: 468.2, y: 3.05, z: 0, color: 0xffc27a, intensity: 26, distance: 18, mode: 'steady', pool: 6, weight: 1.2 });

  // the fir in the corner by the stage, in a tub, presents under it
  const fx = 470.3;
  const fz = -10.8;
  C(b, RED, fx, 0, fz, 0.42, 0.48, 0.4, 12);
  firTree(b, fx, fz, 3.1, { lights: true, star: true, seed: 3, y: 0.3 });
  solid(c, fx, fz, 1.5, 1.5, 3.4, 'zarya-tree', { kind: 'none', surface: 'wood' });
  for (const [dx, dz, s, m] of [[-1.0, 0.5, 0.36, 1], [-0.7, 1.0, 0.28, 2], [-1.15, -0.2, 0.3, 4], [0.2, 1.15, 0.4, 6]] as const) {
    B(b, GOODS[m]!, fx + dx, s / 2, fz + dz, s, s, s, dx);
    B(b, YELLOW, fx + dx, s / 2, fz + dz, s + 0.01, s + 0.01, 0.05, dx);
  }
  // the south wall: the piano with its stool, the clock near midnight, the wall newspaper, paper snowflakes
  const pz = ZS - 0.4;
  B(b, Z.black, 437.6, 0.62, pz, 1.5, 1.24, 0.6);
  B(b, Z.black, 437.6, 0.74, pz - 0.38, 1.44, 0.06, 0.26);
  B(b, Z.white, 437.6, 0.775, pz - 0.4, 1.3, 0.012, 0.16);
  for (let k = 0; k < 14; k++) B(b, Z.black, 437.02 + k * 0.09 + (k % 3 === 2 ? 0.03 : 0), 0.786, pz - 0.36, 0.035, 0.012, 0.08);
  solid(c, 437.6, pz - 0.1, 1.5, 0.8, 1.24, 'zarya-piano', { kind: 'prop', surface: 'wood' });
  C(b, Z.woodDark, 437.6, 0, pz - 1.0, 0.18, 0.18, 0.5, 8);
  solid(c, 437.6, pz - 1.0, 0.4, 0.4, 0.5, 'zarya-stool', { shots: false, kind: 'none', surface: 'wood' });
  disc(b, Z.woodDark, 449.6, 3.25, ZS - 0.06, 0.4, 0.06, 0, 18);
  disc(b, Z.white, 449.6, 3.25, ZS - 0.08, 0.34, 0.06, 0, 18);
  slab(b, Z.black, 449.61, 3.35, ZS - 0.12, 0.03, 0.2, 0.01, 0, 0, 0.05, false);
  slab(b, Z.black, 449.63, 3.39, ZS - 0.12, 0.02, 0.29, 0.01, 0, 0, 0.26, false);
  B(b, Z.woodDark, 449.6, 1.9, ZS - 0.06, 2.5, 1.3, 0.04);
  B(b, Z.cream, 449.6, 1.9, ZS - 0.08, 2.36, 1.16, 0.03);
  for (let k = 0; k < 8; k++) B(b, k % 3 === 0 ? RED : k % 3 === 1 ? Z.white : GOODS[2]!, 448.75 + (k % 4) * 0.57, 2.18 - Math.floor(k / 4) * 0.56, ZS - 0.1, 0.42, 0.44, 0.02, 0);
  for (const [x, y, r] of [[434.4, 2.5, 0.5], [441.2, 2.9, 0.4], [445.8, 2.3, 0.55], [462, 2.6, 0.5], [465, 3.1, 0.38], [470, 2.4, 0.55]] as const) snowflake(b, x, y, ZS - 0.03, r, 0);
  // a trolley of dirty dishes by the hatch's far end
  B(b, Z.steel, 462.3, 0.8, ZS - 0.5, 1.1, 0.04, 0.6);
  B(b, Z.steel, 462.3, 0.35, ZS - 0.5, 1.1, 0.04, 0.6);
  for (const dx of [-0.5, 0.5]) for (const dz of [-0.26, 0.26]) C(b, Z.steel, 462.3 + dx, 0, ZS - 0.5 + dz, 0.02, 0.02, 0.84, 4);
  for (const [dx, n] of [[-0.3, 0.2], [0.05, 0.12], [0.35, 0.26]] as const) C(b, Z.white, 462.3 + dx, 0.82, ZS - 0.5, 0.12, 0.12, n, 10);
  solid(c, 462.3, ZS - 0.5, 1.1, 0.6, 0.9, 'zarya-trolley', { shots: false, kind: 'none', surface: 'metal' });
  // over the escalator: a red cloth the length of the cloakroom, paper snowflakes pinned along it
  B(b, RED, XW + 0.03, 3.62, 0, 0.03, 0.56, 12);
  for (const y of [3.36, 3.88]) B(b, YELLOW, XW + 0.04, y, 0, 0.03, 0.04, 12);
  for (let k = 0; k < 7; k++) snowflake(b, XW + 0.06, 3.62, -4.8 + k * 1.6, 0.19, Math.PI / 2);
  // balloons tied up at the stage's corners and the hatch's
  for (const [x, z, k] of [[XE - 0.3, -6.3, 0], [XE - 0.3, 6.3, 3], [HATCH.x0 - 0.5, ZS - 0.22, 5], [HATCH.x1 + 0.5, ZS - 0.22, 1]] as const) {
    for (let i = 0; i < 3; i++) {
      const dx = x > XE - 1 ? 0 : (i - 1) * 0.24;
      const dz = x > XE - 1 ? (i - 1) * 0.24 : 0;
      orb(b, GOODS[(k + i * 3) % GOODS.length]!, x + dx, 3.0 + (i % 2) * 0.26, z + dz, 0.17, 1.2, 8);
      B(b, Z.white, x + dx * 0.5, 2.6 + (i % 2) * 0.13, z + dz * 0.5, 0.012, 0.6, 0.012);
    }
  }
  // the east wall either side of the stage: paper snowflakes
  for (const [z, y, r] of [[-8.6, 2.7, 0.5], [8, 2.5, 0.55], [10.6, 3.1, 0.4]] as const) snowflake(b, XE - 0.03, y, z, r, Math.PI / 2);
}

export function buildCanteen(c: Ctx, stairs: (area: number) => FloorLink): CanteenHandles {
  const { floors } = c;
  const area = floors.addArea('The Canteen', 'under', 0, { minX: R.x0 - 2, maxX: R.x1 + 2, minZ: R.z0 - 2, maxZ: R.z1 + 2 });
  shell(c);
  windows(c);
  escalator(c);
  // the cloakroom: the coats either side of the escalator, a palm at each end of it
  coatRail(c, 3.3, 9.4, 21);
  coatRail(c, -8.9, -3.3, 22);
  plant(c, XW + 0.7, 2.25);
  plant(c, XW + 0.7, -2.25);
  CANTEEN.tables.forEach((t, i) => tableRun(c, t, i));
  places(c);
  stage(c);
  CANTEEN.speakers.forEach((s, i) => loudspeaker(c, s, CANTEEN.plugs[i]!));
  hatch(c);
  dressing(c);
  return { area, link: stairs(area) };
}
