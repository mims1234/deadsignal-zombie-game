/**
 * ZARYA: the INSTITUTE of Chronobiology, at the north-west corner of town (`zarya/zones/institute.ts`), built from
 * the `ni-*` reference pictures: a brutalist laboratory block behind the checkpoint, a ribbed blank mass over one
 * walkable storey. Inside, from the glass doors on the east: the lobby with its mosaic of the sleeping bear, a
 * corridor running west with two labs on its north side and the cold lab on its south, the director's rooms in the
 * south-west corner, the master clock room (two storeys high) in the north-west, and the freight lift at the
 * corridor's end. Outside: the road from the gate, the guard's booth, the bust, the car park, pines all round.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import { groundRect, wall } from '../structures';
import type { Ctx } from './util';
import { INSTITUTE } from '../../zarya/zones/institute';
import { GOODS, Z, box as kitBox, cyl as kitCyl, firTree, goods, slab as kitSlab, solid } from './zaryaKit';

const I = INSTITUTE;
const K = I.block;
const T = 0.5;
/** The ground floor's ceiling, the top of the block, the clock room's ceiling. */
const H = 4.4;
const TOP = 14;
const WELL = 8.2;
/** The rooms' lines: the lobby's west wall, the clock room's east wall, between the two north labs, the office's east wall, the cold lab's east wall. */
const XL = -158;
const XC = -180;
const XA = -169;
const XO = -185;
const XS = -170;
/** The labs' north wall, the corridor's two walls, the wall between the secretary and the director, the lift's front. */
const ZN = -150;
const ZC0 = -132;
const ZC1 = -128;
const ZOFF = -121;
const XLIFT = -196;


/**
 * The kit's materials at fewer finishes: every plain colour of one finish is one draw call in each 78 m chunk, so the
 * dozen finishes of the kit are brought down to four here (matt, snow, steel, brass). What glows is the kit's own.
 */
const thrift = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
  if (m.emissive.getHex() !== 0) return m;
  const brass = m.metalness >= 0.45 && m.roughness <= 0.5;
  const metal = m.metalness > 0.2;
  return new THREE.MeshStandardMaterial({ color: m.color.getHex(), roughness: brass ? 0.45 : metal ? 0.6 : m.roughness >= 0.93 ? 0.95 : 0.85, metalness: brass ? 0.7 : metal ? 0.5 : 0 });
};
const M = Object.fromEntries(Object.entries(Z).map(([k, m]) => [k, thrift(m)])) as typeof Z;

/** Nothing indoors throws a shadow (the block's own mass does that): one batch fewer for every finish in every chunk. */
let SHADOWS = true;
const box = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0, cast = true): THREE.Mesh => kitBox(b, mat, x, y, z, sx, sy, sz, rot, cast && SHADOWS);
const cyl = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8, cast = true): void => kitCyl(b, mat, x, y, z, r0, r1, h, seg, cast && SHADOWS);
const slab = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number, cast = true): void => kitSlab(b, mat, x, y, z, sx, sy, sz, rx, ry, rz, cast && SHADOWS);
const ball = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 8): void => blob(b, mat, x, y, z, r, r * sy, r, 0, seg);

const std = (color: number, roughness = 0.85): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness });
const PALE = std(0xcfe0e6);
const NIGHT = std(0x1d2f55);
const BEAR = std(0x8a5a33);
const BEAR2 = std(0x6e4526);
const TAN = std(0xc49a62);
const MOON = std(0xe8dca8);
const HILL = std(0xd7dfea);
const BOARD = std(0x23382c);
const YELLOW = std(0xc9a227);
const BOOKS = [std(0x6a2b24), std(0x2c4a3a), std(0x33415e), std(0x8a6a3a), std(0x3a2d24), std(0x9a8f78)];

function lcg(seed: number): () => number {
  let s = (seed * 7919 + 13) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A flat disc on a wall: its face looks along x (or z); `sv` / `sh` squash it up and across, `tilt` turns it in the wall's plane. */
function flat(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, axis: 'x' | 'z', sv = 1, sh = 1, tilt = 0, seg = 20, thick = 0.05): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thick, seg), mat);
  if (axis === 'x') {
    m.rotation.set(tilt, 0, Math.PI / 2, 'XYZ');
    m.scale.set(sv, 1, sh);
  } else {
    m.rotation.set(Math.PI / 2, 0, tilt, 'ZXY');
    m.scale.set(sh, 1, sv);
  }
  m.position.set(x, y, z);
  b.add(m, { cast: false, receive: true });
}

/** A rounded lump: a ball stretched to (rx, ry, rz) and turned by `yaw`. */
function blob(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, rx: number, ry: number, rz: number, yaw = 0, seg = 10): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2)), mat);
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  m.scale.set(rx, ry, rz);
  b.add(m, { cast: false, receive: true });
}

/** A clock on a wall, stopped at 23:57: its face looks along +x / -x (`sign`) or +z / -z. */
function wallClock(b: LevelBuilder, x: number, y: number, z: number, r: number, axis: 'x' | 'z', sign: 1 | -1, marks = false): void {
  const px = axis === 'x' ? sign : 0;
  const pz = axis === 'z' ? sign : 0;
  flat(b, M.iron, x + px * 0.03, y, z + pz * 0.03, r * 1.12, axis);
  flat(b, M.white, x + px * 0.05, y, z + pz * 0.05, r, axis);
  const hand = (a: number, len: number, w: number, off: number): void => {
    const cy = y + Math.cos(a) * off;
    const side = Math.sin(a) * off * sign;
    if (axis === 'z') slab(b, M.black, x - side, cy, z + sign * 0.09, w, len, 0.015, 0, 0, sign * a, false);
    else slab(b, M.black, x + sign * 0.09, cy, z + side, 0.015, len, w, sign * a, 0, 0, false);
  };
  hand(0.03, r * 0.5, r * 0.1, r * 0.25);
  hand(0.31, r * 0.8, r * 0.07, r * 0.4);
  if (marks) for (let k = 0; k < 12; k++) hand((k / 12) * Math.PI * 2, r * 0.14, r * 0.05, r * 0.86);
}

/** The kit's lamp post (two globes on a crossarm, the wire's horn), in this file's finishes. `lightIt` gives it a real light. */
function lampPost(c: Ctx, x: number, z: number, lightIt: boolean): void {
  const { b } = c;
  cyl(b, M.iron, x, 0, z, 0.16, 0.09, 5.6, 8);
  cyl(b, M.iron, x, 0, z, 0.28, 0.2, 0.5, 8);
  box(b, M.iron, x, 5.5, z, 1.5, 0.08, 0.08);
  for (const s of [-1, 1]) {
    box(b, M.iron, x + s * 0.7, 5.36, z, 0.05, 0.3, 0.05);
    ball(b, M.bulb, x + s * 0.7, 5.1, z, 0.22);
  }
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.06, 0.5, 10, 1, true), M.grey);
  horn.position.set(x, 4.3, z + 0.3);
  horn.rotation.x = Math.PI / 2;
  b.add(horn, { cast: false, receive: true });
  box(b, M.iron, x, 4.3, z + 0.06, 0.1, 0.1, 0.2);
  solid(c, x, z, 0.36, 0.36, 5.6, 'zarya-lamp', { kind: 'none', surface: 'metal' });
  if (lightIt) b.light({ x, y: 5, z, color: 0xffb060, intensity: 30, distance: 26, mode: 'steady', pool: 8, glow: 1.1, weight: 1.2 });
  else b.glow({ x, y: 5.1, z, color: 0xffb060, size: 1.1, intensity: 2.2, mode: 'steady' });
}

/** Paper flags on a line across a room. */
function garland(b: LevelBuilder, x0: number, z0: number, x1: number, z1: number, y: number, n: number): void {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    box(b, i % 2 ? M.red : M.white, x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * 0.5, z0 + (z1 - z0) * t, 0.22, 0.22, 0.03, Math.atan2(-(z1 - z0), x1 - x0), false);
  }
}

/** A strip light on the ceiling. */
function tube(b: LevelBuilder, x: number, z: number, len: number, alongZ: boolean, y = H): void {
  box(b, M.grey, x, y - 0.05, z, alongZ ? 0.3 : len, 0.08, alongZ ? len : 0.3, 0, false);
  box(b, M.bulb, x, y - 0.11, z, alongZ ? 0.16 : len - 0.2, 0.04, alongZ ? len - 0.2 : 0.16, 0, false);
}

function ceiling(b: LevelBuilder, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  b.add(m, { cast: false, receive: true });
}

// ---------------------------------------------------------------------------------------------------------------------
// the block: walls, floor, roof, the mass above
// ---------------------------------------------------------------------------------------------------------------------

function shell(c: Ctx): void {
  const { b } = c;
  const xc = (K.x0 + K.x1) / 2;
  const zc = (K.z0 + K.z1) / 2;
  const win = (at: number, width: number, height = 2.9, sill = 0.5) => ({ at, width, height, sill, kind: 'window' as const, lit: true });
  const door = (at: number, width: number, height = 2.4) => ({ at, width, height, kind: 'door' as const });
  const outer = { height: H, thickness: T, material: 'concreteWall' as const, tag: 'zarya-institute' };
  // the east front: the glass doors at z = -130, the lobby's windows either side (`at` runs from the north end)
  wall(b, { ...outer, x0: K.x1 - T / 2, z0: K.z0, x1: K.x1 - T / 2, z1: K.z1, openings: [win(16, 6), win(23, 6), door(30, 3.6, 3), win(37, 6), win(44, 6)] });
  wall(b, { ...outer, x0: K.x0, z0: K.z0 + T / 2, x1: K.x1, z1: K.z0 + T / 2 });
  wall(b, { ...outer, x0: K.x0 + T / 2, z0: K.z0, x1: K.x0 + T / 2, z1: K.z1 });
  // the south side: the director's windows and the cold lab's
  wall(b, { ...outer, x0: K.x0, z0: K.z1 - T / 2, x1: K.x1, z1: K.z1 - T / 2, openings: [win(5.5, 3.4, 1.8, 1), win(11, 3.4, 1.8, 1), win(19.5, 4, 1.8, 1), win(25.5, 4, 1.8, 1)] });
  // the rooms
  const part = (x0: number, z0: number, x1: number, z1: number, openings?: ReturnType<typeof door>[]): void => {
    wall(b, { x0, z0, x1, z1, height: H, thickness: 0.3, material: 'concreteWall', tag: 'zarya-partition', cast: false, openings });
  };
  const xi = K.x0 + T;
  const zi = K.z1 - T;
  part(XC, K.z0 + T, XC, ZC0);
  part(xi, ZC0, XL, ZC0, [door(-188 - xi, 2.4, 2.8), door(-174.5 - xi, 1.8), door(-163.5 - xi, 1.8)]);
  part(xi, ZC1, XL, ZC1, [door(-191 - xi, 1.8), door(-177.5 - xi, 1.8)]);
  part(XO, ZC1, XO, zi);
  part(XS, ZC1, XS, zi);
  part(XA, ZN, XA, ZC0);
  part(XL, ZN, XL, zi, [door(-130 - ZN, 4, 3)]);
  part(XC, ZN, K.x1 - T, ZN);
  part(xi, ZOFF, XO, ZOFF, [door(-192 - xi, 1.8)]);
  // what is behind shut doors: the plant rooms along the north side, the archive, and the lift's shaft
  solid(c, (XC + K.x1) / 2, (K.z0 + ZN) / 2, K.x1 - XC - 0.3, ZN - K.z0 - 0.3, H, 'zarya-beyond', { kind: 'none' });
  solid(c, (XS + XL) / 2, (ZC1 + K.z1) / 2, XL - XS, K.z1 - ZC1 - 0.3, H, 'zarya-beyond', { kind: 'none' });
  // the floor, the ceilings (a roof overhead is what tells the game it is indoors)
  groundRect(b, M.terrazzo, K.x0 + T, K.z0 + T, K.x1 - T, K.z1 - T, 0.03);
  ceiling(b, M.cream, XC - 0.15, K.z0 + T, K.x1 - T, zi, H - 0.02);
  ceiling(b, M.cream, xi, ZC0 - 0.15, XC - 0.15, zi, H - 0.02);
  b.collide({ x: xc, z: zc, hx: (K.x1 - K.x0) / 2, hz: (K.z1 - K.z0) / 2, y0: H, y1: H + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: xc, z: zc, hx: (K.x1 - K.x0) / 2, hz: (K.z1 - K.z0) / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });

  // ---- the mass above: blank ribbed concrete, hollow over the clock room ----
  const O = 0.4;
  const up = (x0: number, z0: number, x1: number, z1: number, y0 = H, y1 = TOP): void => {
    box(b, M.concrete, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
  };
  up(XC - 0.15, K.z0 - O, K.x1 + O, K.z1 + O);
  up(K.x0 - O, ZC0 - 0.15, XC - 0.15, K.z1 + O);
  up(K.x0 - O, K.z0 - O, XC - 0.15, K.z0 + T);
  up(K.x0 - O, K.z0 + T, K.x0 + T, ZC0 - 0.15);
  up(K.x0 + T, K.z0 + T, XC - 0.15, ZC0 - 0.15, WELL);
  const ribH = TOP - H - 1.4;
  const ribY = H + 0.8 + ribH / 2;
  for (let z = K.z0; z <= K.z1 + 0.01; z += 2.5) {
    if (Math.abs(z + 130) > 3) box(b, M.concrete, K.x1 + O + 0.2, ribY, z, 0.4, ribH, 0.45);
    box(b, M.concrete, K.x0 - O - 0.2, ribY, z, 0.4, ribH, 0.45);
  }
  for (let x = K.x0; x <= K.x1 + 0.01; x += 2.5) {
    box(b, M.concrete, x, ribY, K.z1 + O + 0.2, 0.45, ribH, 0.4);
    box(b, M.concrete, x, ribY, K.z0 - O - 0.2, 0.45, ribH, 0.4);
  }
  // a dark band under the ribs and a coping over them, all round
  for (const [y, hh, out] of [[H + 0.4, 0.8, 0.12], [TOP - 0.3, 0.6, 0.5]] as const) {
    for (const s of [-1, 1]) {
      box(b, M.concreteDark, xc, y, zc + s * ((K.z1 - K.z0) / 2 + O + out / 2), K.x1 - K.x0 + 2 * O + 2 * out, hh, out, 0, false);
      box(b, M.concreteDark, xc + s * ((K.x1 - K.x0) / 2 + O + out / 2), y, zc, out, hh, K.z1 - K.z0 + 2 * O, 0, false);
    }
  }
  // a few lit slits between the ribs, and the Institute's clock over the doors: 23:57, like every clock in town
  for (const z of [-153.75, -148.75, -141.25, -118.75, -113.75]) box(b, M.warm, K.x1 + O + 0.03, 8.2, z, 0.06, 2.6, 0.7, 0, false);
  for (const x of [-196.25, -191.25, -183.75, -176.25, -166.25, -158.75, -148.75, -143.75]) box(b, M.warm, x, 8.2, K.z1 + O + 0.03, 0.7, 2.6, 0.06, 0, false);
  wallClock(b, K.x1 + O, 9.3, -130, 1.9, 'x', 1, true);
  // the roof under snow: a parapet, two dishes, vents, the mast with its red lamp
  box(b, M.snow, xc, TOP + 0.1, zc, K.x1 - K.x0 + 2 * O, 0.2, K.z1 - K.z0 + 2 * O, 0, false);
  for (const s of [-1, 1]) {
    box(b, M.concreteDark, xc, TOP + 0.4, zc + s * ((K.z1 - K.z0) / 2 + O - 0.15), K.x1 - K.x0 + 2 * O, 0.8, 0.3);
    box(b, M.concreteDark, xc + s * ((K.x1 - K.x0) / 2 + O - 0.15), TOP + 0.4, zc, 0.3, 0.8, K.z1 - K.z0 + 2 * O);
  }
  const dish = (x: number, z: number, r: number, yaw: number): void => {
    cyl(b, M.iron, x, TOP, z, 0.22, 0.16, 2.4, 8);
    box(b, M.concreteDark, x, TOP + 0.25, z, 1.6, 0.5, 1.6);
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(r, 0.25, r * 0.36, 18), M.white);
    bowl.position.y = r * 0.18;
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, r * 0.9, 5), M.iron);
    feed.position.y = r * 0.6;
    const horn = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), M.iron);
    horn.position.y = r * 1.05;
    g.add(bowl, feed, horn);
    g.position.set(x, TOP + 2.5, z);
    g.rotation.set(0.95, yaw, 0, 'YXZ');
    b.add(g);
  };
  dish(-144.2, -151.5, 2.3, 2.3);
  dish(-145, -143.8, 1.7, 2.7);
  for (const [x, z] of [[-172, -122], [-158, -121], [-186, -124], [-150, -134]] as const) {
    box(b, M.grey, x, TOP + 0.6, z, 1.8, 1.0, 1.4);
    box(b, M.snow, x, TOP + 1.16, z, 1.9, 0.14, 1.5, 0, false);
  }
  const mx = -146.5;
  const mz = -115;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) slab(b, M.iron, mx + sx * 0.55, TOP + 4.5, mz + sz * 0.55, 0.09, 9.1, 0.09, sz * 0.1, 0, -sx * 0.1);
  for (let i = 1; i < 5; i++) {
    const w = 2.2 - i * 0.4;
    for (const s of [-1, 1]) {
      box(b, M.iron, mx, TOP + i * 1.8, mz + (s * w) / 2, w, 0.06, 0.06, 0, false);
      box(b, M.iron, mx + (s * w) / 2, TOP + i * 1.8, mz, 0.06, 0.06, w, 0, false);
    }
  }
  box(b, M.redLamp, mx, TOP + 9.2, mz, 0.22, 0.3, 0.22, 0, false);
  b.glow({ x: mx, y: TOP + 9.2, z: mz, color: 0xff3020, size: 1.6, intensity: 2.4, mode: 'steady' });

  // ---- the entrance: a canopy on two posts, a paved apron, the doors' steel frame ----
  box(b, M.concrete, K.x1 + 2.9, 3.55, -130, 5.8, 0.3, 15);
  box(b, M.snow, K.x1 + 2.9, 3.8, -130, 5.9, 0.2, 15.1, 0, false);
  box(b, M.warm, K.x1 + 2.9, 3.385, -130, 2.4, 0.03, 12, 0, false);
  for (const z of [-136.6, -123.4]) {
    box(b, M.concreteDark, K.x1 + 5.3, 1.7, z, 0.4, 3.4, 0.4);
    solid(c, K.x1 + 5.3, z, 0.4, 0.4, 3.5, 'zarya-post', { kind: 'none' });
  }
  for (const s of [-1, 1]) box(b, M.steel, K.x1 - 0.25, 1.5, -130 + s * 1.74, 0.6, 3, 0.12, 0, false);
  box(b, M.steel, K.x1 - 0.25, 2.94, -130, 0.6, 0.12, 3.6, 0, false);
  // the door leaves, folded back against the glass either side
  for (const s of [-1, 1]) {
    box(b, M.steel, K.x1 + 0.1, 1.45, -130 + s * 2.7, 0.06, 2.9, 1.7, 0, false);
    box(b, M.warm, K.x1 + 0.14, 1.6, -130 + s * 2.7, 0.03, 2.2, 1.3, 0, false);
    box(b, M.brass, K.x1 + 0.18, 1.2, -130 + s * 2.0, 0.05, 0.5, 0.05, 0, false);
  }
  b.light({ x: K.x1 + 3, y: 3, z: -130, color: 0xffc27a, intensity: 24, distance: 20, mode: 'steady', pool: 7, weight: 1 });
  // a shut steel door in the west wall, a snow drift along the north and west walls
  box(b, M.steel, K.x0 - 0.03, 1.15, -118, 0.08, 2.3, 1.3, 0, false);
  slab(b, M.snow, xc, 0.1, K.z0 - 0.9, K.x1 - K.x0, 0.5, 2, 0.22, 0, 0, false);
  slab(b, M.snow, K.x0 - 0.9, 0.1, -122, 2, 0.5, 20, 0, 0, -0.22, false);
}

// ---------------------------------------------------------------------------------------------------------------------
// the lobby
// ---------------------------------------------------------------------------------------------------------------------

/** The mosaic on the lobby's west wall: a brown bear asleep under a hill of snow, the moon and a few stars over it. */
function mosaic(c: Ctx): void {
  const { b } = c;
  const x = XL + 0.17;
  const y = 2.35;
  const z = -141;
  const w = 13;
  const h = 3.3;
  box(b, M.gold, x - 0.01, y, z, 0.04, h + 0.24, w + 0.24, 0, false);
  box(b, NIGHT, x + 0.02, y, z, 0.05, h, w, 0, false);
  const d = (mat: THREE.Material, u: number, v: number, r: number, sv = 1, sh = 1, out = 0.08, tilt = 0): void => flat(b, mat, x + out, y + v, z + u, r, 'x', sv, sh, tilt, 22, 0.04);
  // the snow: a strip along the foot, a hill over the bear's back
  box(b, HILL, x + 0.06, y - h / 2 + 0.3, z, 0.04, 0.6, w, 0, false);
  d(HILL, 0.4, -0.55, 1, 1.05, 5.2, 0.06);
  // the bear, curled up: the back, the haunch, the head on its paws, an ear, the snout
  d(BEAR, 0.5, -0.7, 1, 0.8, 2.3, 0.1);
  d(BEAR2, 1.9, -0.86, 0.8, 0.8, 1.15, 0.13);
  d(BEAR, -1.9, -1.02, 0.62, 0.82, 1.15, 0.13);
  d(BEAR2, -1.6, -0.52, 0.2, 1, 1, 0.16);
  d(BEAR2, -2.25, -0.56, 0.17, 1, 1, 0.16);
  d(TAN, -2.5, -1.16, 0.27, 0.8, 1.15, 0.16);
  d(M.black, -2.8, -1.12, 0.08, 1, 1, 0.19);
  slab(b, M.black, x + 0.19, y - 0.94, z - 2.1, 0.02, 0.04, 0.26, 0.25, 0, 0, false);
  d(TAN, -1.0, -1.34, 0.26, 0.6, 2.2, 0.16);
  // the moon, and stars of two crossed strokes
  d(MOON, 4.6, 0.85, 0.5, 1, 1, 0.1);
  for (const [u, v, s] of [[-5.2, 1.0, 0.34], [-3.4, 0.5, 0.22], [-1.6, 1.15, 0.28], [0.6, 0.72, 0.2], [2.4, 1.2, 0.3], [5.6, -0.1, 0.2], [-5.6, -0.2, 0.2], [3.4, 0.3, 0.18]] as const) {
    for (const a of [0, Math.PI / 2, Math.PI / 4]) slab(b, M.gold, x + 0.1, y + v, z + u, 0.02, s * (a === Math.PI / 4 ? 0.9 : 2), 0.05, a, 0, 0, false);
  }
}

function lobby(c: Ctx): void {
  const { b } = c;
  // the runner from the doors down the corridor to the lift
  box(b, M.redDark, (K.x1 - T + XLIFT) / 2 + 0.6, 0.045, -130, K.x1 - T - XLIFT - 1.4, 0.03, 2, 0, false);
  for (const s of [-1, 1]) box(b, M.gold, (K.x1 - T + XLIFT) / 2 + 0.6, 0.05, -130 + s * 0.9, K.x1 - T - XLIFT - 1.4, 0.03, 0.08, 0, false);
  for (const z of [-144, -136, -124, -116]) {
    box(b, M.cream, -149, H / 2, z, 0.6, H, 0.6);
    box(b, M.woodDark, -149, 0.5, z, 0.66, 1, 0.66, 0, false);
    solid(c, -149, z, 0.6, 0.6, H, 'zarya-column', { kind: 'wall' });
  }
  mosaic(c);
  // the reception desk in front of it: a long counter with a return at its north end
  box(b, M.wood, -152.6, 0.52, -139.5, 0.9, 1.04, 6);
  box(b, M.wood, -154.3, 0.52, -142.5, 2.5, 1.04, 0.8);
  box(b, M.woodPale, -152.5, 1.07, -139.5, 1.1, 0.06, 6.1, 0, false);
  box(b, M.woodPale, -154.3, 1.07, -142.5, 2.5, 0.06, 0.9, 0, false);
  for (let i = 0; i < 12; i++) box(b, M.woodDark, -152.13, 0.55, -142.2 + i * 0.5, 0.04, 0.9, 0.1, 0, false);
  flat(b, M.brass, -152.1, 0.6, -139.5, 0.3, 'x');
  cyl(b, M.brass, -152.6, 1.1, -141.4, 0.07, 0.03, 0.3, 8, false);
  cyl(b, M.greenDark, -152.6, 1.38, -141.4, 0.2, 0.08, 0.14, 10, false);
  box(b, M.black, -152.7, 1.15, -138.2, 0.26, 0.1, 0.2, 0, false);
  box(b, M.black, -152.7, 1.22, -138.2, 0.07, 0.05, 0.3, 0, false);
  box(b, M.white, -152.5, 1.11, -139.6, 0.4, 0.03, 0.55, 0.2, false);
  box(b, M.blue, -152.6, 1.12, -137.3, 0.3, 0.05, 0.4, -0.3, false);
  firTree(b, -152.6, -136.9, 0.7, { lights: true, seed: 4, y: 1.1 });
  solid(c, -152.6, -139.5, 0.9, 6, 1.1, 'zarya-desk', { shots: false, kind: 'prop', surface: 'wood' });
  solid(c, -154.3, -142.5, 2.5, 0.8, 1.1, 'zarya-desk', { shots: false, kind: 'prop', surface: 'wood' });
  // wood panelling to the waist on the west wall south of the corridor and on the north wall
  box(b, M.wood, XL + 0.17, 0.6, (ZC1 + K.z1 - T) / 2, 0.04, 1.2, K.z1 - T - ZC1 - 0.3, 0, false);
  box(b, M.woodDark, XL + 0.18, 1.22, (ZC1 + K.z1 - T) / 2, 0.06, 0.06, K.z1 - T - ZC1 - 0.3, 0, false);
  box(b, M.wood, (XL + K.x1 - T) / 2, 0.6, ZN + 0.17, K.x1 - T - XL - 0.3, 1.2, 0.04, 0, false);
  box(b, M.woodDark, (XL + K.x1 - T) / 2, 1.22, ZN + 0.18, K.x1 - T - XL - 0.3, 0.06, 0.06, 0, false);
  // the clock over the corridor's mouth, the notice board south of it, a shut door in the north wall
  wallClock(b, XL + 0.15, 3.6, -130, 0.36, 'x', 1);
  box(b, M.woodDark, XL + 0.17, 1.75, -121.7, 0.04, 1.7, 4.6, 0, false);
  box(b, M.woodPale, XL + 0.19, 1.75, -121.7, 0.04, 1.5, 4.4, 0, false);
  for (let i = 0; i < 12; i++) box(b, i % 5 === 2 ? M.cream : M.white, XL + 0.22, 2.1 - Math.floor(i / 6) * 0.72, -123.6 + (i % 6) * 0.74, 0.02, 0.58, 0.44, 0, false);
  box(b, M.red, XL + 0.22, 2.36, -120.6, 0.03, 0.1, 0.1, 0, false);
  box(b, M.woodDark, -149, 1.2, ZN + 0.17, 2, 2.4, 0.06, 0, false);
  box(b, M.brass, -149, 1.15, ZN + 0.21, 0.04, 0.4, 0.04, 0, false);
  // the fir in its tub in the north-east corner, paper garlands across the hall
  firTree(b, -144.5, -146.5, 3.3, { lights: true, star: true, seed: 9, y: 0.5 });
  cyl(b, M.red, -144.5, 0, -146.5, 0.6, 0.6, 0.5, 14);
  solid(c, -144.5, -146.5, 1.3, 1.3, 3.6, 'zarya-tree', { kind: 'none', surface: 'wood' });
  garland(b, XL + 0.3, -148, K.x1 - T - 0.2, -133, 3.9, 44);
  garland(b, XL + 0.3, -112, K.x1 - T - 0.2, -127, 3.9, 44);
  // benches under the south windows, plants in tubs
  for (const z of [-122.5, -116]) {
    box(b, M.woodPale, -141.5, 0.45, z, 0.5, 0.07, 2.4);
    box(b, M.woodPale, -141.1, 0.75, z, 0.06, 0.4, 2.4, 0, false);
    for (const s of [-1, 1]) box(b, M.iron, -141.5, 0.21, z + s * 1.05, 0.46, 0.42, 0.06, 0, false);
    solid(c, -141.3, z, 0.9, 2.4, 0.9, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
  }
  for (const [x, z] of [[-156.9, -133.4], [-156.9, -126.6], [-141.6, -119.2], [-141.5, -112], [-156.8, -148.6]] as const) {
    cyl(b, M.woodDark, x, 0, z, 0.3, 0.36, 0.55, 10);
    cyl(b, M.woodDark, x, 0.55, z, 0.03, 0.03, 0.7, 5, false);
    for (const [dx, dy, dz, r] of [[0, 1.45, 0, 0.42], [0.22, 1.1, 0.12, 0.3], [-0.2, 1.2, -0.16, 0.32]] as const) ball(b, M.greenDark, x + dx, dy, z + dz, r, 1.1, 7);
    solid(c, x, z, 0.7, 0.7, 1.7, 'zarya-plant', { shots: false, kind: 'none', surface: 'wood' });
  }
  // the coat racks along the south wall
  const rz = K.z1 - T - 0.6;
  box(b, M.steel, -152.5, 1.85, rz, 8, 0.05, 0.05, 0, false);
  for (let k = 0; k < 5; k++) cyl(b, M.steel, -156.5 + k * 2, 0, rz, 0.04, 0.04, 1.85, 5, false);
  for (let k = 0; k < 17; k++) box(b, k % 3 === 1 ? M.white : GOODS[(k * 3) % GOODS.length]!, -156.3 + k * 0.46, 1.2, rz, 0.32, 1.2, 0.5, 0, false);
  solid(c, -152.5, rz - 0.05, 8.2, 1.3, 1.9, 'zarya-rack', { kind: 'prop', surface: 'wood' });
  // light
  for (const x of [-153.5, -144.5]) for (const z of [-145, -137.5, -130, -122.5, -115]) tube(b, x, z, 2.4, true);
  b.light({ x: -150, y: 3.7, z: -139, color: 0xffd9a8, intensity: 30, distance: 22, mode: 'steady', pool: 8, weight: 1.2 });
  b.light({ x: -149, y: 3.7, z: -120, color: 0xffd9a8, intensity: 24, distance: 20, mode: 'steady', pool: 7, weight: 1 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the corridor and the lift
// ---------------------------------------------------------------------------------------------------------------------

function corridor(c: Ctx): void {
  const { b } = c;
  // green to the shoulder between the doors
  const dado = (z: number, face: 1 | -1, runs: readonly (readonly [number, number])[]): void => {
    for (const [x0, x1] of runs) box(b, M.green, (x0 + x1) / 2, 0.8, z + face * 0.17, x1 - x0, 1.6, 0.04, 0, false);
  };
  dado(ZC0, 1, [[XLIFT, -189.3], [-186.7, -175.5], [-173.5, -164.5], [-162.5, XL - 0.2]]);
  dado(ZC1, -1, [[XLIFT, -192], [-190, -178.5], [-176.5, XL - 0.2]]);
  for (const x of [-164, -172, -180, -188]) tube(b, x, -130, 2.2, false);
  b.light({ x: -167, y: 3.7, z: -130, color: 0xffe0b4, intensity: 16, distance: 14, mode: 'steady', pool: 5, weight: 0.8 });
  b.light({ x: -188, y: 3.7, z: -130, color: 0xffe0b4, intensity: 16, distance: 14, mode: 'steady', pool: 5, weight: 0.9 });
  // the archive's steel door (shut) with a red lamp over it, a fire point, the board of honour, a clock
  box(b, M.steel, -164, 1.2, ZC1 - 0.19, 1.3, 2.4, 0.06, 0, false);
  box(b, M.iron, -164.5, 1.15, ZC1 - 0.23, 0.05, 0.3, 0.05, 0, false);
  box(b, M.redLamp, -164, 2.62, ZC1 - 0.2, 0.2, 0.12, 0.08, 0, false);
  box(b, M.red, -184, 1.4, ZC1 - 0.24, 0.7, 0.9, 0.16);
  box(b, M.white, -184, 1.4, ZC1 - 0.33, 0.4, 0.5, 0.02, 0, false);
  box(b, M.woodDark, -170, 2, ZC1 - 0.19, 5, 1.5, 0.05, 0, false);
  box(b, M.redDark, -170, 2, ZC1 - 0.21, 4.8, 1.3, 0.03, 0, false);
  for (let i = 0; i < 10; i++) {
    const px = -172 + (i % 5) * 1;
    const py = 2.32 - Math.floor(i / 5) * 0.62;
    box(b, M.cream, px, py, ZC1 - 0.24, 0.4, 0.5, 0.02, 0, false);
    box(b, M.grey, px, py - 0.06, ZC1 - 0.26, 0.2, 0.24, 0.02, 0, false);
    flat(b, M.grey, px, py + 0.12, ZC1 - 0.26, 0.08, 'z');
  }
  wallClock(b, -168.5, 3.3, ZC0 + 0.15, 0.3, 'z', 1);
  // a bench and a radiator on the north wall
  box(b, M.woodPale, -181.5, 0.45, ZC0 + 0.45, 2.6, 0.07, 0.45);
  for (const s of [-1, 1]) box(b, M.iron, -181.5 + s * 1.15, 0.21, ZC0 + 0.45, 0.06, 0.42, 0.4, 0, false);
  solid(c, -181.5, ZC0 + 0.4, 2.6, 0.5, 0.55, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
  for (let i = 0; i < 9; i++) box(b, M.white, -169.7 + i * 0.13, 0.5, ZC0 + 0.24, 0.09, 0.6, 0.14, 0, false);

  // ---- the freight lift at the west end: steel doors drawn open either side, the shaft dark behind them ----
  const xf = XLIFT;
  box(b, M.concreteDark, xf, (2.75 + H) / 2, -130, 0.4, H - 2.75, 3.7);
  box(b, M.steel, xf + 0.05, 2.7, -130, 0.5, 0.14, 3.7, 0, false);
  for (const s of [-1, 1]) {
    box(b, M.steel, xf + 0.08, 1.35, -130 + s * 1.55, 0.1, 2.7, 0.62);
    box(b, M.iron, xf + 0.14, 1.35, -130 + s * 1.27, 0.04, 2.7, 0.06, 0, false);
    for (let k = 0; k < 4; k++) slab(b, k % 2 ? M.black : YELLOW, xf + 0.14, 0.2 + k * 0.2, -130 + s * 1.58, 0.02, 0.14, 0.7, 0.6 * s, 0, 0, false);
    box(b, M.iron, xf - 1.7, 1.4, -130 + s * 1.82, 3.3, 2.8, 0.06, 0, false);
  }
  box(b, M.black, K.x0 + T + 0.06, 1.4, -130, 0.06, 2.8, 3.7, 0, false);
  box(b, M.black, xf - 1.7, 2.78, -130, 3.4, 0.06, 3.7, 0, false);
  box(b, M.iron, xf - 1.7, 0.045, -130, 3.4, 0.03, 3.6, 0, false);
  for (let k = 0; k < 9; k++) box(b, k % 2 ? M.black : YELLOW, xf + 0.32, 0.05, -131.2 + k * 0.3, 0.26, 0.03, 0.3, 0, false);
  // the cage's lamp, out; the cables; the call panel on the north wall; the floor lamps over the doors
  for (const dz of [-0.5, 0.5]) box(b, M.iron, xf - 2.6, 1.6, -130 + dz, 0.05, 3, 0.05, 0, false);
  box(b, M.grey, xf + 1.2, 1.3, ZC0 + 0.2, 0.34, 0.5, 0.1);
  box(b, M.redLamp, xf + 1.2, 1.42, ZC0 + 0.26, 0.07, 0.07, 0.03, 0, false);
  box(b, M.black, xf + 1.2, 1.24, ZC0 + 0.26, 0.07, 0.07, 0.03, 0, false);
  box(b, M.black, xf + 0.22, 3.2, -130, 0.06, 0.3, 1.2, 0, false);
  box(b, M.blueLamp, xf + 0.26, 3.2, -129.7, 0.03, 0.12, 0.12, 0, false);
  solid(c, (K.x0 + T + xf + 0.14) / 2, -130, xf + 0.14 - K.x0 - T, 4, H, 'zarya-lift', { kind: 'none', surface: 'metal' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the labs
// ---------------------------------------------------------------------------------------------------------------------

/** Glassware along a bench top: flasks, beakers, brown bottles, a rack of tubes, now and then something that glows. */
function glassware(b: LevelBuilder, x: number, y: number, z: number, len: number, alongZ: boolean, seed: number, spread = 0.3): void {
  const r = lcg(seed);
  const n = Math.floor(len / 0.44);
  for (let i = 0; i < n; i++) {
    const k = r();
    const t = -len / 2 + (i + 0.5) * 0.44;
    const off = (r() - 0.5) * spread;
    const px = alongZ ? x + off : x + t;
    const pz = alongZ ? z + t : z + off;
    if (k < 0.2) continue;
    if (k < 0.42) {
      cyl(b, PALE, px, y, pz, 0.09, 0.025, 0.2, 8, false);
      cyl(b, PALE, px, y + 0.2, pz, 0.025, 0.025, 0.1, 6, false);
    } else if (k < 0.6) cyl(b, PALE, px, y, pz, 0.06, 0.06, 0.13, 8, false);
    else if (k < 0.78) {
      cyl(b, [M.woodDark, M.greenDark, M.blue][i % 3]!, px, y, pz, 0.05, 0.05, 0.2, 8, false);
      cyl(b, M.black, px, y + 0.2, pz, 0.02, 0.02, 0.06, 6, false);
    } else if (k < 0.93) {
      box(b, M.woodPale, px, y + 0.04, pz, alongZ ? 0.1 : 0.32, 0.08, alongZ ? 0.32 : 0.1, 0, false);
      for (let q = 0; q < 4; q++) cyl(b, PALE, px + (alongZ ? 0 : -0.12 + q * 0.08), y + 0.04, pz + (alongZ ? -0.12 + q * 0.08 : 0), 0.013, 0.013, 0.15, 5, false);
    } else {
      ball(b, M.ice, px, y + 0.09, pz, 0.085);
      cyl(b, PALE, px, y + 0.15, pz, 0.025, 0.025, 0.1, 6, false);
    }
  }
}

/** A lab bench: cupboards under a dark top, glassware on it (none if `clear`), a shelf of bottles on the wall behind (`shelf`: which side the wall is). */
function labBench(c: Ctx, x: number, z: number, len: number, alongZ: boolean, seed: number, o: { w?: number; shelf?: 1 | -1; clear?: boolean } = {}): void {
  const { b } = c;
  const w = o.w ?? 0.75;
  const sx = alongZ ? w : len;
  const sz = alongZ ? len : w;
  box(b, M.cream, x, 0.44, z, sx - 0.06, 0.8, sz - 0.06);
  box(b, M.concreteDark, x, 0.03, z, sx - 0.16, 0.06, sz - 0.16, 0, false);
  box(b, M.concreteDark, x, 0.87, z, sx, 0.06, sz);
  for (let t = -len / 2 + 0.6; t < len / 2 - 0.3; t += 0.6) {
    for (const s of w > 1 ? [-1, 1] : [o.shelf ? -o.shelf : 1]) {
      box(b, M.brass, alongZ ? x + (s * (w - 0.04)) / 2 : x + t, 0.6, alongZ ? z + t : z + (s * (w - 0.04)) / 2, 0.05, 0.03, 0.05, 0, false);
    }
  }
  if (!o.clear) glassware(b, x, 0.9, z, len - 0.4, alongZ, seed, w > 1 ? 0.8 : 0.3);
  if (o.shelf) {
    const wx = alongZ ? x + o.shelf * (w / 2 - 0.12) : x;
    const wz = alongZ ? z : z + o.shelf * (w / 2 - 0.12);
    for (const y of [1.45, 1.85]) {
      box(b, M.woodPale, wx, y, wz, alongZ ? 0.24 : len - 0.4, 0.04, alongZ ? len - 0.4 : 0.24, 0, false);
      goods(b, wx, y + 0.02, wz, len - 0.6, alongZ, seed + Math.round(y * 10), { h: 0.22, d: 0.12, step: 0.2, mats: [PALE, M.woodDark, M.white, M.greenDark, PALE, M.blue] });
    }
  }
  solid(c, x, z, sx, sz, 0.95, 'zarya-labbench', { shots: false, kind: 'prop', surface: 'wood' });
}

function stool(c: Ctx, x: number, z: number): void {
  cyl(c.b, M.iron, x, 0, z, 0.03, 0.03, 0.62, 5, false);
  cyl(c.b, M.iron, x, 0, z, 0.2, 0.2, 0.03, 8, false);
  cyl(c.b, M.woodPale, x, 0.62, z, 0.17, 0.17, 0.05, 10, false);
  solid(c, x, z, 0.34, 0.34, 0.66, 'zarya-stool', { shots: false, kind: 'none', surface: 'wood' });
}

/** An instrument on a bench: a grey box with a small glowing screen and a row of knobs, facing along x (`face`). */
function instrument(b: LevelBuilder, x: number, y: number, z: number, face: 1 | -1, lamp: THREE.Material): void {
  box(b, M.locker, x, y + 0.2, z, 0.4, 0.4, 0.56, 0, false);
  box(b, lamp, x + face * 0.205, y + 0.26, z - 0.1, 0.02, 0.18, 0.22, 0, false);
  for (let k = 0; k < 3; k++) box(b, M.black, x + face * 0.21, y + 0.1, z - 0.18 + k * 0.16, 0.03, 0.05, 0.05, 0, false);
  box(b, M.redLamp, x + face * 0.205, y + 0.3, z + 0.18, 0.02, 0.04, 0.04, 0, false);
}

function labs(c: Ctx): void {
  const { b } = c;
  // ---- the animal lab (north of the corridor, west): hamsters asleep in their cages, the rhythm chalked on the board ----
  labBench(c, XC + 0.53, -142.5, 12, true, 21, { shelf: -1 });
  labBench(c, -174.5, -142.75, 6.5, true, 22, { w: 1.4 });
  for (const z of [-145, -141.5]) stool(c, -175.5, z);
  stool(c, -173.5, -143.5);
  // the cages: a steel rack along the east wall, a brown ball of fur in every one
  const cx = XA - 0.55;
  for (let k = 0; k < 6; k++) box(b, M.steel, cx, 1.05, -148 + k * 1.8, 0.7, 2.1, 0.05, 0, false);
  box(b, M.grey, cx + 0.33, 1.05, -143.5, 0.04, 2.1, 9, 0, false);
  for (let row = 0; row < 4; row++) {
    const y = 0.3 + row * 0.5;
    box(b, M.steel, cx, y - 0.02, -143.5, 0.7, 0.03, 9, 0, false);
    for (let k = 0; k < 15; k++) {
      const z = -147.7 + k * 0.6;
      box(b, M.woodPale, cx - 0.05, y + 0.03, z, 0.5, 0.05, 0.5, 0, false);
      box(b, M.steel, cx - 0.3, y + 0.18, z + 0.27, 0.03, 0.34, 0.03, 0, false);
      box(b, PALE, cx - 0.12, y + 0.07, z - 0.16, 0.1, 0.05, 0.1, 0, false);
      if ((k * 7 + row * 3) % 5 !== 0) ball(b, BEAR, cx - 0.1 + ((k + row) % 3) * 0.06, y + 0.11, z + ((k * 3) % 4) * 0.05 - 0.08, 0.075, 0.8, 6);
    }
  }
  solid(c, cx, -143.5, 0.8, 9.2, 2.1, 'zarya-cages', { kind: 'prop', surface: 'metal' });
  // the fume cupboard, the blackboard with a day's rhythm on it (a wave, and where it goes flat), the chart recorder
  box(b, M.cream, -177.4, 1.2, ZN + 0.6, 2, 2.4, 0.9);
  box(b, M.black, -177.4, 1.5, ZN + 1.06, 1.7, 1.0, 0.02, 0, false);
  box(b, PALE, -177.4, 1.86, ZN + 1.07, 1.7, 0.3, 0.02, 0, false);
  cyl(b, M.grey, -177.4, 2.4, ZN + 0.6, 0.16, 0.16, H - 2.4, 8, false);
  solid(c, -177.4, ZN + 0.6, 2, 0.9, 2.4, 'zarya-fume', { kind: 'prop', surface: 'metal' });
  box(b, M.woodPale, -173.2, 1.9, ZN + 0.17, 4.3, 1.5, 0.04, 0, false);
  box(b, BOARD, -173.2, 1.9, ZN + 0.19, 4.1, 1.3, 0.04, 0, false);
  for (let i = 0; i < 22; i++) {
    const u = -1.9 + i * 0.17;
    const v = i < 15 ? Math.sin(i * 0.9) * 0.34 : 0;
    const v1 = i + 1 < 15 ? Math.sin((i + 1) * 0.9) * 0.34 : 0;
    slab(b, M.white, -173.2 + u + 0.085, 1.95 + (v + v1) / 2, ZN + 0.22, Math.hypot(0.17, v1 - v) + 0.02, 0.025, 0.01, 0, 0, Math.atan2(v1 - v, 0.17), false);
  }
  box(b, M.white, -173.2, 1.45, ZN + 0.22, 3.8, 0.015, 0.01, 0, false);
  box(b, M.woodPale, -173.2, 1.2, ZN + 0.24, 4.1, 0.04, 0.1, 0, false);
  box(b, M.locker, -170.3, 0.6, ZN + 0.55, 1.2, 1.2, 0.8);
  box(b, M.white, -170.3, 1.22, ZN + 0.6, 0.8, 0.02, 0.6, 0, false);
  box(b, M.bulb, -170.6, 0.9, ZN + 0.96, 0.2, 0.12, 0.02, 0, false);
  solid(c, -170.3, ZN + 0.55, 1.2, 0.8, 1.25, 'zarya-recorder', { shots: false, kind: 'prop', surface: 'metal' });
  // a writing desk by the door, white coats on hooks
  box(b, M.wood, -171.2, 0.76, ZC0 - 0.7, 2.4, 0.07, 0.9);
  for (const s of [-1, 1]) box(b, M.woodDark, -171.2 + s * 1.1, 0.36, ZC0 - 0.7, 0.08, 0.73, 0.8, 0, false);
  box(b, M.black, -171.6, 0.9, ZC0 - 0.7, 0.42, 0.2, 0.36, 0, false);
  box(b, M.white, -171.6, 1.04, ZC0 - 0.62, 0.3, 0.14, 0.02, 0, false);
  box(b, M.white, -170.7, 0.81, ZC0 - 0.75, 0.3, 0.02, 0.42, 0.3, false);
  solid(c, -171.2, ZC0 - 0.7, 2.4, 0.9, 0.85, 'zarya-desk', { shots: false, kind: 'none', surface: 'wood' });
  for (let i = 0; i < 3; i++) box(b, M.white, -178.6 + i * 0.6, 1.3, ZC0 - 0.27, 0.42, 1.1, 0.16, 0, false);
  box(b, M.woodDark, -178, 1.9, ZC0 - 0.19, 1.9, 0.08, 0.05, 0, false);
  for (const z of [-146, -138]) tube(b, -174.5, z, 2.4, false);
  tube(b, -178, -142, 2.4, true);
  b.light({ x: -174.5, y: 3.7, z: -142, color: 0xe8f0ff, intensity: 20, distance: 16, mode: 'steady', pool: 6, weight: 1 });

  // ---- the workshop lab (north, next to the lobby): instruments, glass, and a clear bench under a pegboard ----
  const W = I.bench;
  labBench(c, W.x, ZN + 0.58, 6, false, 30, { w: 0.85, clear: true });
  box(b, M.woodPale, W.x, 1.95, ZN + 0.17, 5.6, 1.3, 0.04, 0, false);
  for (let i = 0; i < 12; i++) box(b, i % 4 === 3 ? M.red : M.iron, W.x - 2.5 + i * 0.45, 2 + ((i * 3) % 4) * 0.1, ZN + 0.21, i % 3 ? 0.06 : 0.22, i % 3 ? 0.42 : 0.2, 0.03, ((i * 5) % 3) * 0.2 - 0.2, false);
  box(b, M.steel, W.x - 2.4, 1.02, ZN + 0.75, 0.3, 0.24, 0.26, 0, false);
  box(b, M.iron, W.x - 2.4, 1.08, ZN + 1.0, 0.06, 0.06, 0.3, 0, false);
  cyl(b, M.iron, W.x + 2.5, 0.9, ZN + 0.4, 0.09, 0.07, 0.04, 8, false);
  slab(b, M.iron, W.x + 2.36, 1.3, ZN + 0.52, 0.03, 0.85, 0.03, 0.3, 0, 0.35, false);
  cyl(b, M.greenDark, W.x + 2.2, 1.62, ZN + 0.68, 0.16, 0.06, 0.14, 10, false);
  ball(b, M.bulb, W.x + 2.2, 1.6, ZN + 0.68, 0.05);
  labBench(c, XA + 0.55, -141.5, 10, true, 31, { w: 0.8, clear: true });
  for (let i = 0; i < 6; i++) instrument(b, XA + 0.5, 0.9, -145.6 + i * 1.6, 1, i % 3 === 1 ? M.bulb : M.ice);
  for (let i = 0; i < 5; i++) box(b, M.white, XA + 0.62, 0.92, -144.8 + i * 1.6, 0.4, 0.03, 0.3, 0.2 * (i % 2 ? 1 : -1), false);
  labBench(c, XL - 0.53, -141.25, 10.5, true, 32, { shelf: 1 });
  labBench(c, -163.5, -141.25, 6.5, true, 33, { w: 1.4 });
  // on the island: a still of brass and glass, a stand and its flasks
  cyl(b, M.iron, -163.5, 0.9, -139.4, 0.02, 0.02, 0.9, 5, false);
  box(b, M.iron, -163.5, 0.92, -139.4, 0.3, 0.03, 0.2, 0, false);
  ball(b, M.ice, -163.3, 1.32, -139.4, 0.13);
  cyl(b, M.brass, -163.3, 1.0, -139.4, 0.06, 0.04, 0.16, 8, false);
  slab(b, PALE, -163.3, 1.56, -139.9, 0.03, 0.03, 1.1, 0.25, 0, 0, false);
  cyl(b, PALE, -163.3, 0.9, -140.5, 0.1, 0.04, 0.26, 8, false);
  for (const z of [-143.5, -140]) stool(c, -164.5, z);
  stool(c, -162.5, -142);
  for (const z of [-146, -138]) tube(b, -163.5, z, 2.4, false);
  b.light({ x: -163.5, y: 3.7, z: -143, color: 0xe8f0ff, intensity: 20, distance: 16, mode: 'steady', pool: 6, weight: 1 });

  // ---- the cold lab (south of the corridor): the cold cabinet where the reagent is kept, dewars, a cot for a sleeper ----
  // (the reagent stands on the middle shelf behind the open door: `vesna` is that shelf)
  const V = { z: I.vesna.z - 0.55 };
  const vx = XS - 0.68;
  box(b, M.white, vx, 1.1, V.z, 1.05, 2.2, 2.2);
  box(b, M.iron, vx - 0.54, 0.16, V.z, 0.03, 0.26, 2, 0, false);
  box(b, M.snow, vx, 2.25, V.z, 1.1, 0.12, 2.26, 0, false);
  box(b, M.steel, vx - 0.54, 1.2, V.z, 0.02, 1.9, 0.03, 0, false);
  // its north door shut, its south door ajar on the cold inside
  box(b, M.steel, vx - 0.56, 1.3, V.z - 0.14, 0.04, 0.5, 0.04, 0, false);
  box(b, M.ice, vx - 0.5, 1.25, V.z + 0.55, 0.06, 1.7, 0.9, 0, false);
  for (const y of [0.8, 1.25, 1.7]) box(b, M.steel, vx - 0.54, y, V.z + 0.55, 0.04, 0.03, 0.9, 0, false);
  slab(b, M.white, vx - 0.92, 1.25, V.z + 1.2, 0.06, 1.86, 0.98, 0, 0.9, 0, false);
  box(b, M.blueLamp, vx - 0.54, 2.05, V.z - 0.8, 0.02, 0.06, 0.06, 0, false);
  for (let i = 0; i < 7; i++) cyl(b, M.snow, vx - 0.5, 2.0 - (i % 3) * 0.05, V.z + 0.15 + i * 0.13, 0.02, 0, 0.14 + (i % 3) * 0.05, 4, false);
  solid(c, vx, V.z, 1.05, 2.2, 2.3, 'zarya-coldcabinet', { kind: 'prop', surface: 'metal' });
  for (const [x, z, h] of [[-170.9, -112.4, 0.95], [-171.6, -111.5, 0.8], [-170.8, -111.4, 1.1]] as const) {
    cyl(b, M.steel, x, 0, z, 0.28, 0.28, h, 10);
    cyl(b, M.steel, x, h, z, 0.12, 0.2, 0.16, 8, false);
    cyl(b, M.snow, x, h + 0.14, z, 0.14, 0.1, 0.06, 8, false);
  }
  solid(c, -171.15, -111.8, 1.5, 1.6, 1.2, 'zarya-dewars', { shots: false, kind: 'none', surface: 'metal' });
  labBench(c, XO + 0.53, -121.25, 10.5, true, 41, { shelf: -1 });
  labBench(c, -177.5, -116.8, 6, false, 42, { w: 1.4 });
  for (const x of [-179, -176]) stool(c, x, -115.8);
  // the centrifuge by the door, a trolley of flasks
  cyl(b, M.locker, -173.2, 0, ZC1 + 0.75, 0.5, 0.5, 0.9, 12);
  cyl(b, M.steel, -173.2, 0.9, ZC1 + 0.75, 0.44, 0.4, 0.1, 12, false);
  solid(c, -173.2, ZC1 + 0.7, 1, 1, 1, 'zarya-centrifuge', { shots: false, kind: 'none', surface: 'metal' });
  box(b, M.steel, -181.5, 0.8, ZC1 + 0.7, 1.2, 0.04, 0.6);
  box(b, M.steel, -181.5, 0.3, ZC1 + 0.7, 1.2, 0.04, 0.6, 0, false);
  for (const [dx, dz] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]] as const) cyl(b, M.steel, -181.5 + dx, 0, ZC1 + 0.7 + dz, 0.02, 0.02, 0.8, 4, false);
  glassware(b, -181.5, 0.82, ZC1 + 0.7, 1, false, 43);
  solid(c, -181.5, ZC1 + 0.65, 1.2, 0.7, 0.9, 'zarya-trolley', { shots: false, kind: 'none', surface: 'metal' });
  // the cot in the south-west corner: an iron bed made up and empty, the recorder beside it trailing its paper
  const bz = K.z1 - T - 0.7;
  box(b, M.iron, -182.2, 0.3, bz, 2, 0.06, 0.9);
  box(b, M.white, -182.2, 0.42, bz, 1.96, 0.16, 0.86, 0, false);
  box(b, M.grey, -181.9, 0.52, bz, 1.3, 0.05, 0.88, 0, false);
  box(b, M.white, -182.95, 0.55, bz, 0.4, 0.1, 0.6, 0, false);
  for (const s of [-1, 1]) {
    box(b, M.iron, -182.2 + s * 1.0, 0.5, bz, 0.05, 1.0, 0.9, 0, false);
    for (const q of [-1, 1]) cyl(b, M.iron, -182.2 + s * 1.0, 0, bz + q * 0.42, 0.025, 0.025, 0.3, 4, false);
  }
  solid(c, -182.2, bz, 2.1, 1, 0.9, 'zarya-cot', { shots: false, kind: 'none', surface: 'metal' });
  box(b, M.locker, -180.4, 0.5, bz + 0.1, 0.6, 1.0, 0.6);
  box(b, M.ice, -180.4, 0.8, bz - 0.21, 0.36, 0.2, 0.02, 0, false);
  slab(b, M.white, -180.4, 0.5, bz - 0.36, 0.3, 0.01, 0.6, 0.9, 0, 0, false);
  solid(c, -180.4, bz + 0.1, 0.6, 0.7, 1, 'zarya-recorder', { shots: false, kind: 'none', surface: 'metal' });
  for (const x of [-181, -174]) tube(b, x, -119, 2.4, true);
  b.light({ x: -177.5, y: 3.7, z: -119, color: 0xdcecff, intensity: 20, distance: 16, mode: 'steady', pool: 6, weight: 1 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the director's rooms
// ---------------------------------------------------------------------------------------------------------------------

/** Books to the ceiling along a wall that runs north-south; `face` is the way the spines look (+1 east, -1 west). */
function bookcase(c: Ctx, x: number, z: number, len: number, face: 1 | -1, seed: number): void {
  const { b } = c;
  const h = 3.3;
  box(b, M.woodDark, x, h / 2, z, 0.5, h, len);
  for (let i = 0; i < 6; i++) {
    const y = 0.3 + i * 0.5;
    box(b, M.woodPale, x + face * 0.06, y, z, 0.5, 0.04, len - 0.1, 0, false);
    goods(b, x + face * 0.2, y + 0.02, z, len - 0.3, true, seed + i * 31, { mats: BOOKS, h: 0.36, d: 0.2, step: 0.13 });
  }
  for (let t = -len / 2; t <= len / 2 + 0.01; t += len / Math.round(len / 1.6)) box(b, M.woodDark, x + face * 0.18, h / 2, z + t, 0.3, h, 0.06, 0, false);
  solid(c, x, z, 0.7, len, h, 'zarya-shelves', { kind: 'prop', surface: 'wood' });
}

function office(c: Ctx): void {
  const { b } = c;
  const xi = K.x0 + T;
  const zi = K.z1 - T;
  // ---- the secretary's room: her desk and typewriter, filing cabinets, a sofa for those kept waiting ----
  box(b, M.wood, -196.6, 0.76, -124.7, 0.85, 0.07, 2.6);
  for (const s of [-1, 1]) box(b, M.woodDark, -196.6, 0.36, -124.7 + s * 1.2, 0.8, 0.73, 0.08, 0, false);
  box(b, M.woodDark, -196.2, 0.42, -124.7, 0.05, 0.6, 2.4, 0, false);
  box(b, M.black, -196.6, 0.9, -124.3, 0.36, 0.2, 0.44, 0, false);
  box(b, M.white, -196.52, 1.04, -124.3, 0.02, 0.16, 0.3, 0, false);
  box(b, M.black, -196.6, 0.84, -125.5, 0.22, 0.09, 0.26, 0, false);
  box(b, M.white, -196.5, 0.81, -123.7, 0.3, 0.03, 0.4, 0.2, false);
  solid(c, -196.6, -124.7, 0.85, 2.6, 0.85, 'zarya-desk', { shots: false, kind: 'none', surface: 'wood' });
  box(b, M.woodDark, -197.9, 0.45, -124.7, 0.45, 0.08, 0.45, 0, false);
  box(b, M.woodDark, -198.15, 0.75, -124.7, 0.06, 0.6, 0.45, 0, false);
  for (let i = 0; i < 4; i++) {
    box(b, M.locker, XO - 0.47, 0.75, -127.2 + i * 0.95, 0.62, 1.5, 0.9);
    for (let k = 0; k < 3; k++) box(b, M.brass, XO - 0.79, 0.4 + k * 0.45, -127.2 + i * 0.95, 0.02, 0.04, 0.2, 0, false);
  }
  solid(c, XO - 0.47, -125.8, 0.64, 3.8, 1.5, 'zarya-files', { kind: 'prop', surface: 'metal' });
  const sofa = (x: number, z: number, back: 1 | -1, len: number): void => {
    box(b, M.redDark, x, 0.3, z, len, 0.4, 0.8);
    box(b, M.redDark, x, 0.65, z + back * 0.32, len, 0.6, 0.18, 0, false);
    for (const s of [-1, 1]) box(b, M.woodDark, x + s * (len / 2 - 0.06), 0.42, z, 0.14, 0.64, 0.82, 0, false);
    solid(c, x, z, len, 0.85, 0.9, 'zarya-sofa', { shots: false, kind: 'none', surface: 'wood' });
  };
  sofa(-188, ZOFF - 0.62, 1, 2.6);
  box(b, M.white, -195.5, 2, ZC1 + 0.17, 0.5, 0.7, 0.02, 0, false);
  box(b, M.red, -195.5, 2.25, ZC1 + 0.19, 0.5, 0.18, 0.02, 0, false);
  tube(b, -192, -124.5, 2.4, false);
  // a rug, a rubber plant, two chairs against the wall, wood to the waist, a chart of the town's clocks on the west wall
  box(b, M.greenDark, -191.5, 0.045, -124.6, 5, 0.03, 3.6, 0, false);
  for (const z of [ZC1 + 0.17, ZOFF - 0.17]) box(b, M.wood, (xi + XO) / 2, 0.5, z, XO - xi - 0.4, 1.0, 0.04, 0, false);
  box(b, M.wood, xi + 0.02, 0.5, (ZC1 + ZOFF) / 2, 0.04, 1.0, ZOFF - ZC1 - 0.3, 0, false);
  cyl(b, M.woodDark, -198.7, 0, -122, 0.3, 0.36, 0.55, 10);
  for (const [dx, dy, dz, r] of [[0, 1.5, 0, 0.42], [0.2, 1.1, 0.14, 0.3], [-0.16, 1.2, -0.16, 0.32]] as const) ball(b, M.greenDark, -198.7 + dx, dy, -122 + dz, r, 1.1, 7);
  solid(c, -198.7, -122, 0.7, 0.7, 1.7, 'zarya-plant', { shots: false, kind: 'none', surface: 'wood' });
  box(b, M.woodDark, xi + 0.03, 2.2, -124.7, 0.04, 1.5, 2.6, 0, false);
  box(b, M.cream, xi + 0.05, 2.2, -124.7, 0.04, 1.36, 2.46, 0, false);
  for (let i = 0; i < 10; i++) wallClock(b, xi + 0.07, 2.55 - Math.floor(i / 5) * 0.7, -125.7 + (i % 5) * 0.5, 0.16, 'x', 1);
  for (const x of [-194.6, -193.8]) {
    box(b, M.woodDark, x, 0.45, ZC1 + 0.5, 0.46, 0.07, 0.46, 0, false);
    box(b, M.woodDark, x, 0.8, ZC1 + 0.3, 0.46, 0.7, 0.06, 0, false);
    for (const [dx, dz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]] as const) cyl(b, M.woodDark, x + dx, 0, ZC1 + 0.5 + dz, 0.025, 0.025, 0.42, 4, false);
  }
  solid(c, -194.2, ZC1 + 0.45, 1.4, 0.6, 0.9, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });

  // ---- the director's office: books to the ceiling, the big desk under the windows, the coat stand by the door ----
  box(b, M.redDark, -192.3, 0.045, -115.4, 7.6, 0.03, 7.4, 0, false);
  box(b, M.gold, -192.3, 0.042, -115.4, 7.9, 0.02, 7.7, 0, false);
  bookcase(c, xi + 0.26, -115.6, 9.6, 1, 51);
  bookcase(c, XO - 0.41, -113.6, 5.4, -1, 52);
  // wood to the waist on the walls between
  for (const z of [ZOFF + 0.17, zi - 0.02]) box(b, M.wood, (xi + XO) / 2, 0.5, z, XO - xi - 1, 1.0, 0.04, 0, false);
  const D = { x: -192.3, z: -113.6 };
  box(b, M.woodDark, D.x, 0.42, D.z, 3, 0.76, 1.3);
  box(b, M.wood, D.x, 0.83, D.z, 3.2, 0.07, 1.45);
  box(b, M.greenDark, D.x, 0.87, D.z, 2.4, 0.02, 0.95, 0, false);
  for (const s of [-1, 0, 1]) box(b, M.wood, D.x + s * 1.0, 0.42, D.z - 0.66, 0.8, 0.5, 0.03, 0, false);
  // on it: the lamp, two telephones (one red), his notes, a glass of tea gone cold, a small brass clock
  cyl(b, M.brass, D.x - 1.1, 0.87, D.z + 0.2, 0.09, 0.03, 0.36, 8, false);
  box(b, M.greenDark, D.x - 1.1, 1.3, D.z + 0.1, 0.46, 0.12, 0.2, 0, false);
  box(b, M.warm, D.x - 1.1, 1.235, D.z + 0.1, 0.4, 0.02, 0.14, 0, false);
  for (const [dx, mat] of [[1.15, M.black], [0.8, M.red]] as const) {
    box(b, mat, D.x + dx, 0.93, D.z + 0.2, 0.22, 0.1, 0.26, 0, false);
    box(b, mat, D.x + dx, 1.0, D.z + 0.2, 0.3, 0.05, 0.07, 0, false);
  }
  box(b, M.blue, D.x - 0.1, 0.9, D.z - 0.1, 0.34, 0.05, 0.46, 0.15, false);
  box(b, M.white, D.x - 0.55, 0.89, D.z - 0.15, 0.3, 0.02, 0.42, -0.2, false);
  box(b, M.white, D.x + 0.35, 0.89, D.z - 0.2, 0.3, 0.02, 0.42, 0.1, false);
  cyl(b, M.brass, D.x + 0.6, 0.87, D.z + 0.35, 0.045, 0.045, 0.11, 8, false);
  box(b, M.brass, D.x + 0.1, 0.96, D.z + 0.45, 0.2, 0.2, 0.08, 0, false);
  flat(b, M.white, D.x + 0.1, 0.97, D.z + 0.405, 0.075, 'z');
  solid(c, D.x, D.z, 3.2, 1.45, 0.95, 'zarya-desk', { shots: false, kind: 'prop', surface: 'wood' });
  // his chair, pushed back; two chairs for visitors
  box(b, M.redDark, D.x + 0.3, 0.48, D.z + 1.5, 0.7, 0.14, 0.7, 0.3);
  box(b, M.redDark, D.x + 0.4, 1.0, D.z + 1.82, 0.7, 1.0, 0.12, 0.3, false);
  cyl(b, M.iron, D.x + 0.3, 0, D.z + 1.5, 0.3, 0.05, 0.42, 6, false);
  solid(c, D.x + 0.3, D.z + 1.55, 0.8, 0.8, 1.2, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });
  for (const s of [-1, 1]) {
    box(b, M.woodDark, D.x + s * 2.6, 0.45, D.z - 1.5, 0.5, 0.08, 0.5, s * 0.5, false);
    box(b, M.woodDark, D.x + s * 2.74, 0.8, D.z - 1.62, 0.07, 0.7, 0.5, s * 0.5, false);
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) cyl(b, M.woodDark, D.x + s * 2.6 + dx, 0, D.z - 1.5 + dz, 0.025, 0.025, 0.42, 4, false);
    solid(c, D.x + s * 2.6, D.z - 1.5, 0.55, 0.55, 0.9, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });
  }
  // the coat stand: four hooks, and on one of them a single bare hanger
  const S = { x: -187.2, z: -119.6 };
  cyl(b, M.iron, S.x, 0, S.z, 0.3, 0.26, 0.06, 10);
  cyl(b, M.woodDark, S.x, 0.06, S.z, 0.04, 0.03, 1.84, 8);
  ball(b, M.brass, S.x, 1.93, S.z, 0.06);
  for (let k = 0; k < 4; k++) slab(b, M.brass, S.x + Math.cos(k * 1.57) * 0.12, 1.76, S.z - Math.sin(k * 1.57) * 0.12, 0.26, 0.025, 0.025, 0, k * 1.57, 0.5, false);
  box(b, M.steel, S.x - 0.24, 1.72, S.z, 0.012, 0.16, 0.012, 0, false);
  for (const s of [-1, 1]) slab(b, M.woodPale, S.x - 0.24, 1.6, S.z + s * 0.11, 0.03, 0.03, 0.25, s * 0.28, 0, 0, false);
  solid(c, S.x, S.z, 0.5, 0.5, 1.9, 'zarya-coatstand', { shots: false, kind: 'none', surface: 'wood' });
  // the photograph on the east wall: the laboratory's people in two rows, and the bear in front of them
  const px = XO - 0.17;
  box(b, M.woodDark, px, 2.05, -118.6, 0.05, 1.0, 1.5, 0, false);
  box(b, M.white, px - 0.03, 2.05, -118.6, 0.03, 0.86, 1.36, 0, false);
  box(b, M.grey, px - 0.05, 2.05, -118.6, 0.02, 0.66, 1.14, 0, false);
  for (let i = 0; i < 9; i++) {
    const back = i % 2 === 0;
    box(b, back ? M.concreteDark : M.white, px - 0.065, back ? 2.08 : 1.96, -119.08 + i * 0.12, 0.01, 0.26, 0.09, 0, false);
    flat(b, MOON, px - 0.07, back ? 2.25 : 2.13, -119.08 + i * 0.12, 0.035, 'x', 1, 1, 0, 8, 0.01);
  }
  flat(b, BEAR2, px - 0.075, 1.84, -118.6, 0.1, 'x', 0.8, 1.6, 0, 10, 0.01);
  box(b, M.woodDark, px - 0.3, 0.45, -118.6, 0.5, 0.9, 1.6);
  cyl(b, M.blue, px - 0.3, 0.9, -118.9, 0.08, 0.06, 0.22, 8, false);
  cyl(b, M.fir, px - 0.3, 1.12, -118.9, 0.16, 0, 0.4, 6, false);
  solid(c, px - 0.3, -118.6, 0.6, 1.6, 0.95, 'zarya-cabinet', { shots: false, kind: 'none', surface: 'wood' });
  // a sofa under the clock, the lights
  sofa(-196.4, ZOFF + 0.62, -1, 2.8);
  wallClock(b, -192, 3.3, ZOFF + 0.15, 0.3, 'z', 1);
  tube(b, -192.3, -117, 2.4, false);
  b.light({ x: D.x, y: 2.6, z: D.z - 1, color: 0xffc98a, intensity: 18, distance: 14, mode: 'steady', pool: 5, weight: 1 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the master clock room
// ---------------------------------------------------------------------------------------------------------------------

/** A gear standing on edge, facing south: a rim, a hub, spokes, teeth. */
function gear(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, phase = 0): void {
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.045, r * 0.09), 6, Math.max(14, Math.round(r * 22))), mat);
  rim.position.set(x, y, z);
  b.add(rim, { cast: false, receive: true });
  flat(b, mat, x, y, z, r * 0.22, 'z', 1, 1, 0, 10, 0.16);
  const spokes = r > 0.7 ? 3 : 2;
  for (let i = 0; i < spokes; i++) slab(b, mat, x, y, z, r * 2, r * 0.1, 0.05, 0, 0, phase + (i * Math.PI) / spokes, false);
  const n = Math.max(10, Math.round(r * 16));
  const rr = r + Math.max(0.045, r * 0.09) + 0.03;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    slab(b, mat, x + Math.cos(a) * rr, y + Math.sin(a) * rr, z, 0.13, 0.08, 0.1, 0, 0, a, false);
  }
}

/** A bank of relay cabinets along a wall: grey steel, rows of small lamps, a gauge or two. `face` is the way they look. */
function relays(c: Ctx, x0: number, z0: number, x1: number, z1: number, face: 1 | -1, seed: number): void {
  const { b } = c;
  const alongZ = Math.abs(z1 - z0) > Math.abs(x1 - x0);
  const len = alongZ ? z1 - z0 : x1 - x0;
  const n = Math.max(1, Math.round(len / 1.25));
  const w = len / n;
  const r = lcg(seed);
  for (let i = 0; i < n; i++) {
    const t = (alongZ ? z0 : x0) + (i + 0.5) * w;
    const x = alongZ ? x0 : t;
    const z = alongZ ? t : z0;
    const hh = 2.3 + (i % 3 === 1 ? 0.3 : 0);
    box(b, M.locker, x, hh / 2, z, alongZ ? 0.7 : w - 0.06, hh, alongZ ? w - 0.06 : 0.7);
    const fx = alongZ ? x + face * 0.36 : x;
    const fz = alongZ ? z : z + face * 0.36;
    const put = (mat: THREE.Material, u: number, y: number, sw: number, sh: number): void => {
      box(b, mat, alongZ ? fx : fx + u, y, alongZ ? fz + u : fz, alongZ ? 0.02 : sw, sh, alongZ ? sw : 0.02, 0, false);
    };
    put(M.black, 0, 1.55, w - 0.3, 0.9);
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        const q = r();
        if (q < 0.3) continue;
        put(q > 0.94 ? M.redLamp : q > 0.5 ? M.warm : M.brass, -0.33 + k * 0.22, 1.24 + row * 0.2, 0.07, 0.07);
      }
    }
    if (i % 2 === 0) flat(b, M.white, alongZ ? fx + face * 0.01 : fx - 0.2, 0.75, alongZ ? fz - 0.2 : fz + face * 0.01, 0.11, alongZ ? 'x' : 'z', 1, 1, 0, 10, 0.02);
    put(M.iron, 0.2, 0.7, 0.3, 0.2);
  }
  solid(c, alongZ ? x0 : (x0 + x1) / 2, alongZ ? (z0 + z1) / 2 : z0, alongZ ? 0.7 : len, alongZ ? len : 0.7, 2.4, 'zarya-relays', { kind: 'prop', surface: 'metal' });
}

function clockRoom(c: Ctx): void {
  const { b } = c;
  const xi = K.x0 + T;
  const zi = K.z0 + T;
  const x1 = XC - 0.15;
  const z1 = ZC0 - 0.15;
  const mx = -189.8;
  const mz = -147;
  // the room goes up through the floor above: a band where the walls change, a ceiling of beams, slit windows high in the west wall
  for (const [x, z, w, d] of [[(xi + x1) / 2, zi + 0.05, x1 - xi, 0.1], [(xi + x1) / 2, z1 - 0.05, x1 - xi, 0.1], [xi + 0.05, (zi + z1) / 2, 0.1, z1 - zi], [x1 - 0.05, (zi + z1) / 2, 0.1, z1 - zi]] as const) {
    box(b, M.concreteDark, x, H + 0.1, z, w, 0.36, d, 0, false);
  }
  for (let z = zi + 3; z < z1 - 1; z += 4.2) box(b, M.concreteDark, (xi + x1) / 2, WELL - 0.25, z, x1 - xi, 0.5, 0.4, 0, false);
  for (let z = -156; z < -134; z += 4.2) {
    box(b, NIGHT, xi + 0.03, 6.4, z, 0.06, 2.2, 0.8, 0, false);
    box(b, M.snow, xi + 0.1, 5.33, z, 0.16, 0.08, 0.9, 0, false);
  }
  // ---- the master clock: a round plinth, an iron frame, brass wheels, the dial facing the door, stopped ----
  cyl(b, M.concreteDark, mx, 0, mz, 2.9, 2.9, 0.45, 16);
  cyl(b, M.brass, mx, 0.45, mz, 2.6, 2.6, 0.03, 16, false);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    cyl(b, M.brass, mx + Math.cos(a) * 2.75, 0.45, mz + Math.sin(a) * 2.75, 0.03, 0.03, 0.9, 5, false);
    slab(b, M.brass, mx + Math.cos(a + 0.26) * 2.66, 1.33, mz + Math.sin(a + 0.26) * 2.66, 1.44, 0.04, 0.04, 0, -a - 0.26 - Math.PI / 2, 0, false);
  }
  for (const a of [0, Math.PI / 4]) solid(c, mx, mz, 5.3, 5.3, 1.4, 'zarya-clock', { rot: a, shots: false, kind: 'prop' });
  solid(c, mx, mz, 4.2, 2.2, 7, 'zarya-clock', { kind: 'none', surface: 'metal' });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) box(b, M.iron, mx + sx * 1.95, 3.6, mz + sz * 0.75, 0.22, 6.3, 0.22);
    for (const y of [1.5, 6.6]) box(b, M.iron, mx + sx * 1.95, y, mz, 0.16, 0.16, 1.7, 0, false);
    slab(b, M.iron, mx + sx * 1.95, 4, mz, 0.08, 5.3, 0.08, sx * 0.29, 0, 0, false);
  }
  for (const sz of [-1, 1]) for (const y of [1.5, 3.0, 5.9, 6.6]) box(b, M.iron, mx, y, mz + sz * 0.75, 4.1, 0.16, 0.16, 0, false);
  box(b, M.iron, mx, 0.6, mz, 4.4, 0.3, 2);
  // the dial: three metres across, a brass bezel, the hands at three minutes to midnight
  const dz = mz + 1.0;
  flat(b, M.cream, mx, 4.3, dz, 1.5, 'z', 1, 1, 0, 30, 0.1);
  wallClock(b, mx, 4.3, dz + 0.02, 1.42, 'z', 1, true);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(1.56, 0.1, 8, 32), M.brass);
  bezel.position.set(mx, 4.3, dz + 0.04);
  b.add(bezel, { cast: false, receive: true });
  box(b, M.iron, mx, 4.3, mz + 0.84, 0.3, 0.3, 0.3, 0, false);
  // the going train in front, under the dial; the wheels behind it; the strike on the far side
  gear(b, M.brass, mx - 0.95, 1.9, mz + 0.88, 0.95, 0.2);
  gear(b, M.gold, mx + 0.75, 1.72, mz + 0.9, 0.62, 0.5);
  gear(b, M.brass, mx + 1.5, 2.55, mz + 0.86, 0.36, 0.1);
  gear(b, M.gold, mx - 0.1, 2.72, mz + 0.5, 0.42, 0.9);
  gear(b, M.gold, mx + 0.5, 3.5, mz + 0.35, 1.25, 0.3);
  gear(b, M.brass, mx - 1.4, 3.7, mz + 0.3, 0.6, 0.7);
  gear(b, M.brass, mx + 1.35, 5.45, mz + 0.3, 0.5, 0.4);
  gear(b, M.gold, mx - 1.05, 5.5, mz + 0.35, 0.72, 0);
  gear(b, M.brass, mx, 3, mz - 0.86, 1.05, 0.6);
  gear(b, M.gold, mx + 1.15, 4.4, mz - 0.9, 0.62, 0.2);
  gear(b, M.brass, mx - 1.05, 4.7, mz - 0.86, 0.8, 0.5);
  gear(b, M.gold, mx + 0.7, 1.7, mz - 0.88, 0.5, 0.1);
  for (const [gx, gy] of [[-0.95, 1.9], [0.75, 1.72], [0.5, 3.5], [-1.4, 3.7], [1.35, 5.45], [-1.05, 5.5], [0, 3], [1.15, 4.4], [-1.05, 4.7]] as const) box(b, M.iron, mx + gx, gy, mz, 0.09, 0.09, 1.9, 0, false);
  // the bell over it, the pendulum caught off its centre, the weights on their chains
  cyl(b, M.brass, mx, 6.75, mz, 0.55, 0.2, 0.6, 14);
  cyl(b, M.iron, mx, 7.35, mz, 0.05, 0.05, WELL - 7.35, 5, false);
  slab(b, M.steel, mx + 0.32, 3.35, mz - 1.02, 0.05, 4.4, 0.05, 0, 0, 0.15, false);
  flat(b, M.brass, mx + 0.65, 1.18, mz - 1.02, 0.42, 'z', 1, 1, 0, 18, 0.12);
  for (const [sx, y] of [[-1.55, 2.4], [1.6, 3.3]] as const) {
    cyl(b, M.iron, mx + sx, y, mz - 0.2, 0.17, 0.17, 0.7, 10);
    box(b, M.iron, mx + sx, (y + 0.7 + 6.6) / 2, mz - 0.2, 0.025, 6.6 - y - 0.7, 0.025, 0, false);
  }
  // ---- the relays round the walls: every clock in town hangs off these ----
  relays(c, xi + 0.35, -158.6, xi + 0.35, -134.6, 1, 61);
  relays(c, -198.4, zi + 0.35, -181, zi + 0.35, 1, 62);
  relays(c, x1 - 0.35, -158.4, x1 - 0.35, -135.2, -1, 63);
  // cable trays over them, and a row of slave clocks on the north wall, every one at 23:57
  for (const y of [2.9, 3.3]) {
    box(b, M.iron, xi + 0.3, y, (zi + z1) / 2, 0.4, 0.06, z1 - zi - 1, 0, false);
    box(b, M.iron, x1 - 0.3, y, (zi + z1) / 2, 0.4, 0.06, z1 - zi - 1, 0, false);
    box(b, M.iron, (xi + x1) / 2, y, zi + 0.3, x1 - xi - 1, 0.06, 0.4, 0, false);
  }
  for (let i = 0; i < 7; i++) wallClock(b, -197 + i * 2.4, 5.2, zi + 0.02, 0.5, 'z', 1);
  for (let i = 0; i < 4; i++) {
    box(b, M.black, -196 + i * 4.2, 5.6, zi + 0.06, 0.05, 4.4, 0.05, 0, false);
    box(b, M.black, x1 - 0.06, 5.6, -155 + i * 5.4, 0.05, 4.4, 0.05, 0, false);
  }
  // the technician's console by the door: a sloped panel of lamps, the log open on it
  const cx = -194;
  const cz = z1 - 0.65;
  box(b, M.locker, cx, 0.45, cz, 5, 0.9, 1.1);
  slab(b, M.grey, cx, 1.08, cz - 0.1, 5, 0.06, 1.0, -0.4, 0, 0, false);
  box(b, M.locker, cx, 1.2, cz + 0.42, 5, 0.6, 0.26, 0, false);
  for (let i = 0; i < 20; i++) box(b, i % 7 === 3 ? M.redLamp : i % 3 ? M.warm : M.brass, cx - 2.2 + (i % 10) * 0.48, 1.24 + Math.floor(i / 10) * 0.16, cz + 0.28, 0.08, 0.08, 0.02, 0, false);
  box(b, M.white, cx + 0.6, 1.1, cz - 0.2, 0.5, 0.03, 0.36, 0.1, false);
  solid(c, cx, cz, 5, 1.3, 1.5, 'zarya-console', { shots: false, kind: 'prop', surface: 'metal' });
  box(b, M.woodDark, cx + 1.4, 0.45, cz - 1.3, 0.45, 0.07, 0.45, 0.4, false);
  cyl(b, M.iron, cx + 1.4, 0, cz - 1.3, 0.22, 0.04, 0.42, 6, false);
  // hanging lamps
  for (const [x, z] of [[mx - 5.5, mz + 6], [mx + 5.5, mz + 6], [mx - 5.5, mz - 6], [mx + 5.5, mz - 6]] as const) {
    box(b, M.iron, x, (WELL + 5.4) / 2, z, 0.03, WELL - 5.4, 0.03, 0, false);
    cyl(b, M.iron, x, 5.15, z, 0.42, 0.1, 0.28, 10, false);
    ball(b, M.bulb, x, 5.12, z, 0.13);
  }
  b.light({ x: mx, y: 4.6, z: mz + 5.5, color: 0xffcf96, intensity: 34, distance: 22, mode: 'steady', pool: 7, weight: 1.3 });
  b.light({ x: mx, y: 4.6, z: mz - 6.5, color: 0xffcf96, intensity: 22, distance: 20, mode: 'steady', pool: 6, weight: 0.8 });
}

// ---------------------------------------------------------------------------------------------------------------------
// outside
// ---------------------------------------------------------------------------------------------------------------------

/** A car left where it was parked, under two days of snow (it lies north-south). */
function car(c: Ctx, x: number, z: number, mat: THREE.Material, nose: 1 | -1): void {
  const { b } = c;
  box(b, mat, x, 0.62, z, 1.7, 0.6, 4.1);
  box(b, mat, x, 1.14, z + nose * 0.25, 1.5, 0.5, 2.1);
  box(b, M.black, x, 1.16, z + nose * 0.25, 1.54, 0.32, 1.7, 0, false);
  box(b, M.black, x, 1.16, z + nose * 0.25, 1.3, 0.32, 2.14, 0, false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10), M.black);
    w.position.set(x + sx * 0.8, 0.3, z + sz * 1.3);
    w.rotation.z = Math.PI / 2;
    b.add(w, { cast: false, receive: true });
  }
  box(b, M.snow, x, 1.47, z + nose * 0.25, 1.58, 0.2, 2.2, 0, false);
  box(b, M.snow, x, 0.98, z - nose * 1.45, 1.66, 0.14, 1.1, 0, false);
  box(b, M.snow, x, 0.98, z + nose * 1.7, 1.66, 0.14, 0.7, 0, false);
  blob(b, M.snow, x - 0.95, 0.1, z + 0.3, 0.8, 0.5, 2.5);
  blob(b, M.snow, x + 0.6, 0.05, z - nose * 2.1, 1.2, 0.45, 0.8);
  solid(c, x, z, 1.9, 4.3, 1.6, 'zarya-car', { kind: 'prop', surface: 'metal' });
}

function pine(c: Ctx, x: number, z: number, h: number): void {
  firTree(c.b, x, z, h);
  solid(c, x, z, 0.9, 0.9, h * 0.8, 'zarya-tree', { kind: 'none', surface: 'wood' });
}

function outside(c: Ctx): void {
  const { b } = c;
  const R = I.rect;
  groundRect(b, M.snow, R.x0, R.z0, R.x1, R.z1, 0.004);
  // the road from the checkpoint to the doors, the apron under the canopy, the lane to the car park and the lot itself
  groundRect(b, M.packed, K.x1, -134, R.x1, -126, 0.012);
  groundRect(b, M.paving, K.x1, -138, K.x1 + 6.4, -122, 0.02);
  groundRect(b, M.packed, -124, -126, -119, -104, 0.012);
  groundRect(b, M.packed, -136, -104, -108, -81, 0.012);
  // paths trodden round the block: along its south side to the loading dock, and up its east side and along the north to the tank
  groundRect(b, M.packed, -207, -107.6, -136, -105.6, 0.012);
  groundRect(b, M.packed, -209, -143, -207, -105.6, 0.012);
  groundRect(b, M.packed, -137, -167, -135, -138, 0.012);
  groundRect(b, M.packed, -176, -168.6, -135, -166.6, 0.012);

  // ---- the guard's booth by the road, its barrier up ----
  const gx = -114.6;
  const gz = -123.4;
  box(b, M.cream, gx, 0.55, gz, 2.3, 1.1, 2.3);
  box(b, M.warm, gx, 1.6, gz, 2.16, 1.0, 2.16, 0, false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, M.cream, gx + sx * 1.08, 1.6, gz + sz * 1.08, 0.16, 1.0, 0.16, 0, false);
  box(b, M.cream, gx, 2.25, gz, 2.3, 0.3, 2.3);
  box(b, M.concreteDark, gx, 2.46, gz, 2.8, 0.12, 2.8);
  box(b, M.snow, gx, 2.62, gz, 2.86, 0.2, 2.86, 0, false);
  box(b, M.red, gx, 0.9, gz - 1.16, 2.3, 0.14, 0.03, 0, false);
  box(b, M.red, gx, 0.9, gz + 1.16, 2.3, 0.14, 0.03, 0, false);
  solid(c, gx, gz, 2.3, 2.3, 2.6, 'zarya-booth', { kind: 'building' });
  box(b, M.red, gx + 1.9, 0.55, gz - 1.7, 0.4, 1.1, 0.4);
  box(b, M.snow, gx + 1.9, 1.14, gz - 1.7, 0.46, 0.1, 0.46, 0, false);
  for (let k = 0; k < 7; k++) slab(b, k % 2 ? M.white : M.red, gx + 1.9, 1.3 + k * 0.7 * Math.cos(0.35), gz - 1.85 - k * 0.7 * Math.sin(0.35), 0.1, 0.72, 0.1, -0.35, 0, 0, false);
  box(b, M.redLamp, gx + 1.9, 1.3, gz - 1.49, 0.12, 0.12, 0.04, 0, false);
  solid(c, gx + 1.9, gz - 1.7, 0.4, 0.4, 2, 'zarya-post', { kind: 'none', surface: 'metal' });

  // ---- the bust on its plinth south of the road, in a round bed with two small firs ----
  const U = { x: -128.5, z: -116.5 };
  cyl(b, M.snow, U.x, 0, U.z, 2.5, 2.7, 0.3, 16, false);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    box(b, M.concrete, U.x + Math.cos(a) * 2.75, 0.18, U.z + Math.sin(a) * 2.75, 1.26, 0.36, 0.24, -a + Math.PI / 2, false);
  }
  box(b, M.concreteDark, U.x, 0.2, U.z, 1.9, 0.4, 1.9);
  box(b, M.concreteDark, U.x, 1.3, U.z, 1.15, 1.9, 1.15);
  box(b, M.concreteDark, U.x, 2.3, U.z, 1.4, 0.14, 1.4);
  box(b, M.brass, U.x + 0.59, 1.5, U.z, 0.02, 0.4, 0.7, 0, false);
  blob(b, M.steel, U.x, 2.6, U.z, 0.34, 0.36, 0.62);
  cyl(b, M.steel, U.x, 2.8, U.z, 0.15, 0.13, 0.3, 8, false);
  blob(b, M.steel, U.x + 0.03, 3.3, U.z, 0.28, 0.33, 0.27);
  blob(b, M.steel, U.x + 0.26, 3.22, U.z, 0.08, 0.1, 0.07);
  blob(b, M.snow, U.x - 0.03, 3.56, U.z, 0.25, 0.12, 0.25);
  for (const s of [-1, 1]) blob(b, M.snow, U.x, 2.92, U.z + s * 0.4, 0.26, 0.09, 0.2);
  for (const s of [-1, 1]) firTree(b, U.x - 0.6, U.z + s * 1.7, 2.2);
  for (const a of [0, Math.PI / 4]) solid(c, U.x, U.z, 5.2, 5.2, 0.6, 'zarya-bust', { rot: a, shots: false, kind: 'none' });
  solid(c, U.x, U.z, 1.4, 1.4, 3.6, 'zarya-bust', { kind: 'prop' });

  // ---- the car park: three cars under the snow, kerbs, a sign ----
  car(c, -131.5, -87, GOODS[0]!, -1);
  car(c, -126.8, -87.4, GOODS[5]!, -1);
  car(c, -113.2, -98.5, GOODS[6]!, 1);
  for (const [x0, x1] of [[-136, -124.4], [-118.6, -108]] as const) box(b, M.concrete, (x0 + x1) / 2, 0.1, -104.2, x1 - x0, 0.2, 0.3, 0, false);
  box(b, M.concrete, -122, 0.1, -80.8, 28, 0.2, 0.3, 0, false);
  blob(b, M.snow, -119.5, 0, -82.6, 4.5, 0.9, 1.6);
  blob(b, M.snow, -110, 0, -88, 1.8, 0.8, 3.4);
  solid(c, -119.5, -82.4, 7.6, 2, 0.8, 'zarya-drift', { shots: false, kind: 'none' });
  solid(c, -110, -88, 2.6, 5.4, 0.7, 'zarya-drift', { shots: false, kind: 'none' });
  cyl(b, M.iron, -118.2, 0, -104.6, 0.05, 0.05, 2.6, 6);
  box(b, M.blue, -118.2, 2.3, -104.6, 0.6, 0.6, 0.04, 0, false);
  box(b, M.white, -118.2, 2.3, -104.57, 0.3, 0.36, 0.03, 0, false);
  solid(c, -118.2, -104.6, 0.3, 0.3, 2.6, 'zarya-pole', { kind: 'none', surface: 'metal' });

  // ---- lamps: two lit ones on the road and the lot, the others only a glow ----
  lampPost(c, -126, -124.4, true);
  lampPost(c, -125.4, -103.2, true);
  for (const [x, z] of [[-116.5, -136], [-134.6, -82.6], [-109.4, -103], [-211.5, -127], [-158, -170.5], [-134, -152]] as const) lampPost(c, x, z, false);

  // ---- pines: a pair by the doors, a row inside every wall ----
  pine(c, -136.6, -142.2, 8.5);
  pine(c, -136.8, -118.6, 7.5);
  for (let x = -216; x <= -112; x += 8) {
    pine(c, x, -75.4 - ((x * 7) % 3) * 0.4, 6.5 + (((x * 13) % 5) + 5) % 5 * 0.5);
    pine(c, x + 2, -184.4 + (((x * 5) % 3) + 3) % 3 * 0.4, 7 + (((x * 11) % 5) + 5) % 5 * 0.5);
  }
  for (let z = -176; z <= -84; z += 9.2) pine(c, -224.4 + ((((z * 10) | 0) % 3) + 3) % 3 * 0.4, z, 7 + ((((z * 10) | 0) % 4) + 4) % 4 * 0.5);
  for (const z of [-180, -171, -162, -153, -144]) pine(c, -108.6, z, 6.5 + ((-z) % 3) * 0.6);

  // ---- the walls on the two sides the town does not build: precast panels under snow, the forest behind ----
  const fence = (alongX: boolean): void => {
    const len = alongX ? R.x1 - R.x0 : R.z1 - R.z0;
    const mid = alongX ? (R.x0 + R.x1) / 2 : (R.z0 + R.z1) / 2;
    const at = (alongX ? R.z0 : R.x0) + 1.6;
    box(b, M.concreteDark, alongX ? mid : at, 1.5, alongX ? at : mid, alongX ? len : 0.3, 3, alongX ? 0.3 : len);
    box(b, M.snow, alongX ? mid : at, 3.07, alongX ? at : mid, alongX ? len : 0.46, 0.14, alongX ? 0.46 : len, 0, false);
    for (let t = 2; t < len; t += 4) box(b, M.concrete, alongX ? R.x0 + t : at, 1.6, alongX ? at : R.z0 + t, alongX ? 0.4 : 0.46, 3.2, alongX ? 0.46 : 0.4, 0, false);
    solid(c, alongX ? mid : at - 0.7, alongX ? at - 0.7 : mid, alongX ? len : 1.8, alongX ? 1.8 : len, 3, 'zarya-wall', { kind: 'wall' });
  };
  fence(true);
  fence(false);

  // ---- behind the block: the loading dock and the lorry backed up to it (west), the nitrogen tank and a vent (north) ----
  const dz = -136;
  box(b, M.concrete, K.x0 - 2.5, 0.5, dz, 5, 1, 12);
  box(b, M.snow, K.x0 - 2.5, 1.04, dz + 3.4, 4.6, 0.1, 4.6, 0, false);
  solid(c, K.x0 - 2.5, dz, 5, 12, 1, 'zarya-dock', { shots: false, kind: 'prop' });
  box(b, M.steel, K.x0 - 0.04, 2.6, dz - 2, 0.1, 3.2, 5.4, 0, false);
  for (let k = 0; k < 8; k++) box(b, M.iron, K.x0 - 0.1, 1.2 + k * 0.4, dz - 2, 0.03, 0.04, 5.4, 0, false);
  box(b, M.concrete, K.x0 - 2.6, 4.2, dz - 2, 4.6, 0.2, 7);
  box(b, M.snow, K.x0 - 2.6, 4.38, dz - 2, 4.7, 0.16, 7.1, 0, false);
  ball(b, M.bulb, K.x0 - 0.3, 3.9, dz + 1.4, 0.16);
  for (const [x, z, w] of [[K.x0 - 1.2, dz + 4.6, 1.2], [K.x0 - 2.6, dz + 5, 0.9], [K.x0 - 1.1, dz + 3.2, 0.8]] as const) {
    box(b, M.woodPale, x, 1 + w / 2, z, w, w, w, 0.2);
    solid(c, x, z, w + 0.2, w + 0.2, 1 + w, 'zarya-crate', { kind: 'none', surface: 'wood' });
  }
  const tx = K.x0 - 8.9;
  const tz = dz - 2;
  box(b, M.greenDark, tx + 1, 2.05, tz, 5.6, 2.3, 2.4);
  box(b, M.snow, tx + 1, 3.28, tz, 5.5, 0.18, 2.3, 0, false);
  box(b, M.iron, tx + 0.4, 0.75, tz, 7.6, 0.3, 1.9);
  box(b, M.blue, tx - 2.9, 1.7, tz, 1.9, 1.7, 2.3);
  box(b, M.black, tx - 3.86, 2.05, tz, 0.04, 0.7, 1.9, 0, false);
  box(b, M.snow, tx - 2.9, 2.62, tz, 1.9, 0.16, 2.2, 0, false);
  for (const sx of [-2.9, 1.6, 2.8]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), M.black);
    w.position.set(tx + sx, 0.5, tz + sz * 1.05);
    w.rotation.x = Math.PI / 2;
    b.add(w, { cast: false, receive: true });
  }
  blob(b, M.snow, tx - 1, 0, tz + 1.5, 3.4, 0.6, 0.9);
  solid(c, tx - 0.05, tz, 7.9, 2.5, 3.3, 'zarya-truck', { kind: 'prop', surface: 'metal' });
  // the tank of liquid nitrogen on its saddles, frost on its pipe into the wall; a vent kiosk against the wall
  const nx = -172;
  const nz = -165.6;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 14), M.white);
  tank.position.set(nx, 1.9, nz);
  tank.rotation.z = Math.PI / 2;
  b.add(tank);
  for (const s of [-1, 1]) {
    blob(b, M.white, nx + s * 3, 1.9, nz, 0.5, 1.2, 1.2);
    box(b, M.concreteDark, nx + s * 1.9, 0.5, nz, 0.5, 1, 2.2);
  }
  box(b, M.snow, nx, 3.08, nz, 5.6, 0.14, 1.1, 0, false);
  box(b, M.steel, nx + 1, 2.2, (nz + K.z0) / 2 + 0.4, 0.16, 0.16, K.z0 - nz - 0.6, 0, false);
  box(b, M.snow, nx + 1, 2.2, (nz + K.z0) / 2 + 0.6, 0.26, 0.26, 2.2, 0, false);
  box(b, M.blueLamp, nx - 2.2, 1.9, nz + 1.21, 0.12, 0.12, 0.04, 0, false);
  solid(c, nx, nz, 7, 2.5, 3.1, 'zarya-tank', { kind: 'prop', surface: 'metal' });
  box(b, M.concrete, -150, 0.9, K.z0 - 1.1, 2.4, 1.8, 2.2);
  for (let k = 0; k < 4; k++) box(b, M.iron, -150, 0.6 + k * 0.3, K.z0 - 2.22, 1.8, 0.08, 0.04, 0, false);
  box(b, M.snow, -150, 1.88, K.z0 - 1.1, 2.5, 0.16, 2.3, 0, false);
  solid(c, -150, K.z0 - 1.1, 2.4, 2.2, 1.9, 'zarya-vent', { kind: 'prop' });
}

export interface InstituteHandles {
  /** Nothing the story moves here yet. */
  none?: undefined;
}

export function buildInstitute(c: Ctx): InstituteHandles {
  SHADOWS = true;
  outside(c);
  shell(c);
  SHADOWS = false;
  lobby(c);
  corridor(c);
  labs(c);
  office(c);
  clockRoom(c);
  SHADOWS = true;
  return {};
}
