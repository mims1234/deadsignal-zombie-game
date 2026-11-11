/**
 * ZARYA: the BANYA and the frozen POND (`zarya/zones/banya.ts`), built from the `ba-*` reference views: the pond an
 * oval of ice filling the west, the winter road between the two gates running straight across it past the
 * cross-shaped ice-hole; fishermen's tents and holes, a jetty, children's hockey; the red-brick bathhouse in the
 * north-east (changing room, washing room, steam room, west to east) with its wood yard behind; a small park with a
 * statue in the south-east; the tram street along the south.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import { groundRect, wall } from '../structures';
import type { Ctx } from './util';
import { BANYA, fisher, type FishHole } from '../../zarya/zones/banya';
import { GOODS, Z, ball, bench, box, counter, cyl, firTree, lampPost, slab, solid } from './zaryaKit';
import { shutterKiosk } from './zaryaShutters';

export interface BanyaHandles {
  /** Nothing the story moves here yet. */
  none?: undefined;
}

const std = (color: number, roughness = 0.9): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness });
/** Plain colours the kit lacks (each draws with the rest of its finish). */
const BRICK = std(0x5e382f, 0.9);
const TILE = std(0xc6d3d6, 0.7);
const REED = std(0x9a8758, 0.9);
const REED_HEAD = std(0x5a4630, 0.9);
const STONE = std(0x33363b, 0.9);
const CANVAS = std(0xb39a68, 0.9);
const CRACK = std(0x6488b0, 0.9);
const FLOOR_TILE = std(0x9fb0b6, 0.7);
const HEARTH = std(0x4b4541, 0.9);
/** Steel and brass at the kit's iron finish, so the three draw as one. */
const STEEL = new THREE.MeshStandardMaterial({ color: 0x6a7480, roughness: 0.6, metalness: 0.5 });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xb8923e, roughness: 0.6, metalness: 0.5 });
/** The ice-hole's water (the one finish of its own here). */
const WATER = new THREE.MeshStandardMaterial({ color: 0x04070b, roughness: 0.2, metalness: 0.4 });
const TENTS: readonly THREE.Material[] = [Z.red, CANVAS, Z.green, Z.blue, Z.orange, Z.greenDark];

const R = BANYA.rect;
const H = BANYA.house;
const D = BANYA.door;
/** Wall thickness, wall height, ceiling height, door height. */
const T = 0.5;
const WH = 4.2;
const CH = 3.7;
const DH = 2.5;
/** The two partitions between the three rooms, and the doorway in each (its z). */
const PX1 = 118.25;
const PX2 = 130.25;
const PD1 = -162;
const PD2 = -156.5;
/** The inside of the outer walls. */
const IN = { x0: H.x0 + T, z0: H.z0 + T, x1: H.x1 - T, z1: H.z1 - T };
/** The pond: an oval of ice. */
const PO = { x: 62, z: -138, rx: 32, rz: 38 };
/** The winter road between the gates. */
const ROAD = { z0: -133.5, z1: -126.5 };
/** The north fence: behind it is forest, and the edge of the map. */
const FENCE_Z = -180;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** How far inside the pond's edge a point is: under 1 is on the ice. */
const onIce = (x: number, z: number): number => Math.hypot((x - PO.x) / PO.rx, (z - PO.z) / PO.rz);

// ---------------------------------------------------------------------------------------------------------------------
// small shapes
// ---------------------------------------------------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
/** A round bar from one point to another (rails, pipes, branches, rods, logs). */
function rod(b: LevelBuilder, mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, seg = 5): void {
  const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  m.receiveShadow = true;
  b.add(m, { cast: false });
}

/** A ball (or a flattened one) that takes shadow like the boxes round it, so it draws with them. */
function orb(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 8): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)), mat);
  m.position.set(x, y, z);
  m.scale.y = sy;
  m.receiveShadow = true;
  b.add(m, { cast: false });
}

/** A pyramid or a faceted cone standing on `y`, turned by `rotY` (flat-faced: tents, lantern caps, vent cowls). */
function cone(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg: number, rotY: number, cast = true): void {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg).toNonIndexed();
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = rotY;
  m.castShadow = cast;
  m.receiveShadow = true;
  b.add(m);
}

/** A flat oval lying at `y` (the ice, drifts of snow on it, holes, trodden rounds). */
function disc(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, rx: number, rz: number, seg = 14, rotY = 0): void {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, seg), mat);
  m.scale.set(rx, rz, 1);
  m.rotation.set(-Math.PI / 2, rotY, 0, 'YXZ');
  m.position.set(x, y, z);
  m.receiveShadow = true;
  b.add(m, { cast: false });
}

/** A heap of snow: a low dome, `k` times as wide across as along, turned by `rotY`. */
function mound(b: LevelBuilder, x: number, z: number, r: number, h: number, rotY = 0, k = 1, mat: THREE.Material = Z.snow): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  m.scale.set(r, h, r * k);
  m.rotation.y = rotY;
  m.position.set(x, 0, z);
  m.receiveShadow = true;
  b.add(m, { cast: false });
}

/** A thing's own frame: `at(lx, lz)` is the point `lx` along it and `lz` across it, turned by `yaw`. */
function frame(x: number, z: number, yaw: number): (lx: number, lz: number) => [number, number] {
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
}

/** A lantern on a wooden post (the pond's own lamps). `lit` gives it a real light. */
function lantern(c: Ctx, x: number, z: number, lit: boolean, h = 2.5): void {
  const { b } = c;
  cyl(b, Z.woodDark, x, 0, z, 0.08, 0.06, h, 6);
  box(b, Z.iron, x, h + 0.03, z, 0.32, 0.05, 0.32, 0, false);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.38, 0.2), Z.bulb);
  glass.position.set(x, h + 0.24, z);
  b.add(glass, { cast: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, Z.iron, x + sx * 0.12, h + 0.24, z + sz * 0.12, 0.03, 0.4, 0.03, 0, false);
  cone(b, Z.iron, x, h + 0.44, z, 0.26, 0.03, 0.2, 4, Math.PI / 4, false);
  box(b, Z.snow, x, h + 0.62, z, 0.16, 0.07, 0.16, Math.PI / 4, false);
  solid(c, x, z, 0.3, 0.3, h, 'zarya-lantern', { kind: 'none', surface: 'wood' });
  if (lit) b.light({ x, y: h + 0.2, z, color: 0xffb060, intensity: 20, distance: 18, mode: 'steady', pool: 5, glow: 0.9, weight: 1 });
  else b.glow({ x, y: h + 0.24, z, color: 0xffb060, size: 0.9, intensity: 2, mode: 'steady' });
}

/** A clump of reeds standing out of the snow. */
function reeds(b: LevelBuilder, x: number, z: number, n: number, spread: number, rnd: () => number): void {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * spread;
    const h = 1.0 + rnd() * 1.0;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const rx = (rnd() - 0.5) * 0.36;
    const rz = (rnd() - 0.5) * 0.36;
    slab(b, REED, px, h / 2, pz, 0.035, h, 0.035, rx, 0, rz, false);
    if (i % 2 === 0) slab(b, REED_HEAD, px - (h / 2) * Math.sin(rz), h / 2 + (h / 2) * Math.cos(rz) * Math.cos(rx), pz + (h / 2) * Math.cos(rz) * Math.sin(rx), 0.075, 0.24, 0.075, rx, 0, rz, false);
  }
}

/** A bare tree with snow along its boughs. */
function bareTree(c: Ctx, x: number, z: number, h: number, seed: number): void {
  const { b } = c;
  const rnd = lcg(seed * 131 + 7);
  cyl(b, Z.woodDark, x, 0, z, 0.22, 0.1, h * 0.62, 6);
  rod(b, Z.woodDark, x, h * 0.6, z, x + (rnd() - 0.5) * 0.5, h, z + (rnd() - 0.5) * 0.5, 0.05, 4);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4 + rnd();
    const y0 = h * (0.34 + 0.055 * i);
    const len = h * (0.26 + rnd() * 0.2);
    const up = 0.35 + rnd() * 0.55;
    const ex = x + Math.cos(a) * len * Math.cos(up);
    const ez = z + Math.sin(a) * len * Math.cos(up);
    const ey = y0 + len * Math.sin(up);
    rod(b, Z.woodDark, x, y0, z, ex, ey, ez, 0.045, 4);
    // a fork, and the snow lying on the bough
    rod(b, Z.woodDark, (x + ex) / 2, (y0 + ey) / 2, (z + ez) / 2, ex + Math.cos(a + 0.9) * len * 0.4, ey + len * 0.3, ez + Math.sin(a + 0.9) * len * 0.4, 0.03, 4);
    orb(b, Z.snow, x + (ex - x) * 0.6, y0 + (ey - y0) * 0.6 + 0.07, z + (ez - z) * 0.6, 0.2, 0.45, 6);
  }
  solid(c, x, z, 0.44, 0.44, h * 0.6, 'zarya-tree', { kind: 'none', surface: 'wood' });
}

function fir(c: Ctx, x: number, z: number, h: number, o: { lights?: boolean; seed?: number } = {}): void {
  firTree(c.b, x, z, h, o);
  solid(c, x, z, 0.8, 0.8, h * 0.8, 'zarya-tree', { kind: 'none', surface: 'wood' });
}

/** A snowman: three balls, a bucket for a hat, a carrot. */
function snowman(c: Ctx, x: number, z: number, yaw: number): void {
  const { b } = c;
  for (let i = 0; i < 3; i++) orb(b, Z.snow, x, 0.5 + i * 0.8 - i * i * 0.07, z, 0.58 - i * 0.13, 1, 9);
  cyl(b, Z.grey, x, 2.1, z, 0.2, 0.26, 0.3, 8);
  const at = frame(x, z, yaw);
  const [nx, nz] = at(0, -0.36);
  cone(b, Z.orange, nx, 1.86, nz, 0.05, 0.05, 0.06, 5, 0, false);
  for (const s of [-1, 1]) {
    const [ax, az] = at(s * 0.4, 0);
    const [ex, ez] = at(s * 1.0, -0.1);
    rod(b, Z.woodDark, ax, 1.3, az, ex, 1.6, ez, 0.025, 4);
  }
  solid(c, x, z, 1.1, 1.1, 2.2, 'zarya-snowman', { kind: 'none' });
}

/** A wooden sledge on its runners, with a box or a load of logs on it. */
function sledge(c: Ctx, x: number, z: number, yaw: number, load: 'none' | 'box' | 'logs'): void {
  const { b } = c;
  const at = frame(x, z, yaw);
  for (const s of [-1, 1]) {
    const [rx, rz] = at(0, s * 0.26);
    box(b, Z.woodDark, rx, 0.04, rz, 1.5, 0.05, 0.05, yaw);
    const [fx, fz] = at(0.82, s * 0.26);
    slab(b, Z.woodDark, fx, 0.14, fz, 0.34, 0.05, 0.05, 0, yaw, 0.7, false);
    for (const lx of [-0.5, 0.45]) {
      const [px, pz] = at(lx, s * 0.26);
      box(b, Z.wood, px, 0.16, pz, 0.05, 0.2, 0.05, yaw, false);
    }
  }
  box(b, Z.woodPale, x, 0.28, z, 1.25, 0.04, 0.6, yaw);
  if (load === 'box') {
    const [px, pz] = at(-0.1, 0);
    box(b, Z.greenDark, px, 0.5, pz, 0.7, 0.4, 0.46, yaw);
    box(b, Z.snow, px, 0.72, pz, 0.66, 0.05, 0.42, yaw, false);
  } else if (load === 'logs') {
    for (let i = 0; i < 5; i++) {
      const lz = -0.2 + (i % 3) * 0.2;
      const y = 0.4 + Math.floor(i / 3) * 0.19;
      const [ax, az] = at(-0.55, lz + (i > 2 ? 0.1 : 0));
      const [ex, ez] = at(0.55, lz + (i > 2 ? 0.1 : 0));
      rod(b, i % 2 ? Z.wood : Z.woodPale, ax, y, az, ex, y, ez, 0.1, 6);
    }
  } else {
    box(b, Z.snow, x, 0.32, z, 1.1, 0.05, 0.5, yaw, false);
  }
  solid(c, x, z, 1.6, 0.66, 0.6, 'zarya-sledge', { rot: yaw, shots: false, kind: 'none', surface: 'wood' });
}

/** A firewood stack seen end-on from `face` (+1 south, -1 north): a block of wood with the logs' round ends on its face. */
function logStack(c: Ctx, x0: number, x1: number, z: number, depth: number, h: number, face: 1 | -1, snow: boolean): void {
  const { b } = c;
  const xm = (x0 + x1) / 2;
  box(b, Z.woodDark, xm, h / 2, z, x1 - x0, h, depth);
  const fz = z + face * (depth / 2);
  let k = 0;
  for (let y = 0.17; y < h - 0.1; y += 0.3) {
    for (let x = x0 + 0.18 + (k % 2) * 0.16; x < x1 - 0.12; x += 0.33) {
      const r = 0.12 + ((x * 7.3 + y * 3.1) % 1) * 0.035;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.08, 7), (Math.floor(x * 3 + y * 5) % 3 === 0 ? Z.wood : Z.woodPale) as THREE.Material);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, fz);
      m.receiveShadow = true;
      b.add(m, { cast: false });
    }
    k++;
  }
  if (snow) box(b, Z.snow, xm, h + 0.08, z, x1 - x0 + 0.1, 0.16, depth + 0.1, 0, false);
  solid(c, xm, z, x1 - x0, depth, h, 'zarya-logs', { kind: 'prop', surface: 'wood' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the bathhouse
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A skin on the inside of a wall (paint, tiles, panelling) from `a` to `e` along it, between heights `y0` and `y1`,
 * left open at each doorway (`doors`: from, to). `at` is where the skin's middle lies, across the wall.
 */
function facing(b: LevelBuilder, mat: THREE.Material, alongX: boolean, at: number, a: number, e: number, y0: number, y1: number, doors: readonly (readonly [number, number])[] = []): void {
  const piece = (p: number, q: number, ya: number, yb: number): void => {
    if (q - p < 0.02 || yb - ya < 0.02) return;
    const m = (p + q) / 2;
    box(b, mat, alongX ? m : at, (ya + yb) / 2, alongX ? at : m, alongX ? q - p : 0.05, yb - ya, alongX ? 0.05 : q - p, 0, false);
  };
  let cur = a;
  for (const [d0, d1] of doors) {
    piece(cur, d0, y0, y1);
    piece(d0, d1, Math.max(y0, DH), y1);
    cur = d1;
  }
  piece(cur, e, y0, y1);
}

/** A room's four walls, skinned alike: `x0..x1`, `z0..z1` are the room's inside, the doors are those in each wall. */
function skin(b: LevelBuilder, mat: THREE.Material, q: { x0: number; z0: number; x1: number; z1: number }, y0: number, y1: number, doors: { n?: [number, number]; s?: [number, number]; w?: [number, number]; e?: [number, number] }): void {
  facing(b, mat, true, q.z0 + 0.025, q.x0, q.x1, y0, y1, doors.n ? [doors.n] : []);
  facing(b, mat, true, q.z1 - 0.025, q.x0, q.x1, y0, y1, doors.s ? [doors.s] : []);
  facing(b, mat, false, q.x0 + 0.025, q.z0, q.z1, y0, y1, doors.w ? [doors.w] : []);
  facing(b, mat, false, q.x1 - 0.025, q.z0, q.z1, y0, y1, doors.e ? [doors.e] : []);
}

/** A lit window on the outside of a wall (the rooms behind are panelled: the glow is painted on). `out` is the way the wall faces. */
function litWindow(b: LevelBuilder, x: number, z: number, alongX: boolean, out: 1 | -1, w = 1.5): void {
  const y = 2.75;
  const hgt = 1.2;
  const p = (off: number, along: number, yy: number, sw: number, sh: number, sd: number, mat: THREE.Material): void => {
    box(b, mat, alongX ? x + along : x + out * off, yy, alongX ? z + out * off : z + along, alongX ? sw : sd, sh, alongX ? sd : sw, 0, false);
  };
  p(0.03, 0, y, w, hgt, 0.04, Z.warm);
  p(0.06, 0, y + hgt / 2 + 0.06, w + 0.3, 0.12, 0.1, Z.cream);
  p(0.06, 0, y - hgt / 2 - 0.05, w + 0.3, 0.1, 0.1, Z.cream);
  for (const s of [-1, 1]) p(0.06, s * (w / 2 + 0.07), y, 0.14, hgt, 0.1, Z.cream);
  p(0.07, 0, y, 0.06, hgt, 0.06, Z.woodDark);
  p(0.07, 0, y + 0.2, w, 0.06, 0.06, Z.woodDark);
  p(0.16, 0, y - hgt / 2 + 0.03, w + 0.34, 0.1, 0.3, Z.snow);
}

function shellOfHouse(c: Ctx): void {
  const { b } = c;
  const xc = (H.x0 + H.x1) / 2;
  const zc = (H.z0 + H.z1) / 2;
  const w = H.x1 - H.x0;
  const d = H.z1 - H.z0;
  const W = (x0: number, z0: number, x1: number, z1: number, door?: number): void => {
    wall(b, { x0, z0, x1, z1, height: WH, thickness: T, material: 'brick', tag: 'zarya-banya', openings: door === undefined ? [] : [{ at: door, width: 2, height: DH, kind: 'door' }] });
  };
  W(H.x0, H.z1 - T / 2, H.x1, H.z1 - T / 2, D.x - H.x0);
  W(H.x0, H.z0 + T / 2, H.x1, H.z0 + T / 2);
  W(H.x0 + T / 2, H.z0, H.x0 + T / 2, H.z1);
  W(H.x1 - T / 2, H.z0, H.x1 - T / 2, H.z1);
  for (const [px, pd] of [[PX1, PD1], [PX2, PD2]] as const) {
    wall(b, { x0: px, z0: IN.z0, x1: px, z1: IN.z1, height: WH, thickness: 0.4, material: 'brick', tag: 'zarya-banya', openings: [{ at: pd - IN.z0, width: 2, height: DH, kind: 'door' }] });
  }
  // the floors (terrazzo, pale tiles, boards), the ceilings, the roof overhead (which is what says: indoors)
  groundRect(b, Z.terrazzo, IN.x0, IN.z0, PX1, IN.z1, 0.03);
  groundRect(b, FLOOR_TILE, PX1, IN.z0, PX2, IN.z1, 0.03);
  groundRect(b, Z.wood, PX2, IN.z0, IN.x1, IN.z1, 0.03);
  groundRect(b, Z.concrete, D.x - 1, IN.z1, D.x + 1, H.z1, 0.03);
  groundRect(b, Z.cream, IN.x0, IN.z0, PX2, IN.z1, CH, 'down');
  groundRect(b, Z.woodPale, PX2, IN.z0, IN.x1, IN.z1, CH, 'down');
  b.collide({ x: xc, z: zc, hx: w / 2, hz: d / 2, y0: WH, y1: WH + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: xc, z: zc, hx: w / 2, hz: d / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });

  // ---- outside: a plinth, a pale cornice, lit windows set high, snow on every sill ----
  for (const [x0, x1] of [[H.x0, D.x - 1.1], [D.x + 1.1, H.x1]] as const) box(b, Z.concreteDark, (x0 + x1) / 2, 0.3, H.z1 + 0.05, x1 - x0, 0.6, 0.12, 0, false);
  box(b, Z.concreteDark, xc, 0.3, H.z0 - 0.05, w, 0.6, 0.12, 0, false);
  for (const x of [H.x0 - 0.05, H.x1 + 0.05]) box(b, Z.concreteDark, x, 0.3, zc, 0.12, 0.6, d + 0.2, 0, false);
  for (const z of [H.z0 - 0.07, H.z1 + 0.07]) box(b, Z.cream, xc, WH - 0.05, z, w + 0.3, 0.3, 0.16, 0, false);
  for (const x of [H.x0 - 0.07, H.x1 + 0.07]) box(b, Z.cream, x, WH - 0.05, zc, 0.16, 0.3, d + 0.3, 0, false);
  for (const x of [114.5, 119, 123.5, 128, 133, 138]) litWindow(b, x, H.z1, true, 1);
  for (const x of [110, 116, 127.5, 133, 138.5]) litWindow(b, x, H.z0, true, -1);
  for (const z of [-162.5, -155.5]) {
    litWindow(b, H.x0, z, false, -1);
    litWindow(b, H.x1, z, false, 1);
  }
  // brick piers at the corners and between the rooms
  for (const x of [H.x0 + 0.3, PX1, PX2, H.x1 - 0.3]) for (const [z, s] of [[H.z1, 1], [H.z0, -1]] as const) box(b, BRICK, x, WH / 2, z + s * 0.07, 0.7, WH, 0.16, 0, false);

  // ---- the roof: two slopes of tin under snow between stepped brick gables, three stacks, three vents ----
  const ridge = 6.6;
  const tilt = 0.3;
  const span = d / 2 + 0.6;
  const cy = ridge - (span / 2) * Math.tan(tilt);
  for (const s of [-1, 1]) {
    slab(b, Z.iron, xc, cy, zc + (s * span) / 2, w - 0.8, 0.12, span / Math.cos(tilt), s * tilt, 0, 0);
    slab(b, Z.snow, xc, cy + 0.17, zc + s * (span / 2 - 0.12), w - 1, 0.22, span / Math.cos(tilt) - 0.3, s * tilt, 0, 0, false);
  }
  box(b, Z.snow, xc, ridge + 0.14, zc, w - 1, 0.24, 0.7, 0, false);
  for (const x of [H.x0 + T / 2, H.x1 - T / 2]) {
    [13.6, 10, 6.4, 3].forEach((gw, i) => {
      box(b, BRICK, x, WH + 0.33 + i * 0.66, zc, T, 0.66, gw);
      box(b, Z.snow, x, WH + 0.7 + i * 0.66, zc, T + 0.1, 0.1, gw + 0.1, 0, false);
    });
  }
  const stack = (x: number, z: number, top: number): void => {
    const y0 = ridge - Math.abs(z - zc) * Math.tan(tilt) - 0.3;
    box(b, BRICK, x, (y0 + top) / 2, z, 0.9, top - y0, 0.9);
    box(b, Z.cream, x, top - 0.25, z, 1.04, 0.16, 1.04, 0, false);
    box(b, Z.black, x, top + 0.01, z, 0.5, 0.04, 0.5, 0, false);
    box(b, Z.snow, x, top + 0.05, z, 1.0, 0.1, 0.22, 0, false);
    box(b, Z.snow, x, top + 0.05, z + 0.38, 1.0, 0.1, 0.22, 0, false);
  };
  stack(135, -154.6, 8.4);
  stack(124.2, -161.6, 8.0);
  stack(113, -161.4, 7.7);
  for (const x of [116.5, 122, 129]) {
    const z = -155.6;
    const y0 = ridge - Math.abs(z - zc) * Math.tan(tilt);
    box(b, Z.grey, x, y0 + 0.3, z, 0.6, 0.9, 0.6);
    for (const k of [0, 1, 2]) box(b, Z.iron, x, y0 + 0.3 + k * 0.16, z + 0.31, 0.46, 0.05, 0.02, 0, false);
    cone(b, Z.iron, x, y0 + 0.75, z, 0.56, 0.05, 0.3, 4, Math.PI / 4, false);
    box(b, Z.snow, x, y0 + 1.03, z, 0.34, 0.1, 0.34, Math.PI / 4, false);
  }

  // ---- the porch: a little gabled roof on two posts, a lamp under it, the doors standing open ----
  const pz = H.z1 + 1.5;
  for (const s of [-1, 1]) {
    box(b, Z.woodDark, D.x + s * 1.5, 1.5, H.z1 + 2.5, 0.2, 3, 0.2);
    solid(c, D.x + s * 1.5, H.z1 + 2.5, 0.3, 0.3, 3, 'zarya-post', { kind: 'none', surface: 'wood' });
    slab(b, Z.woodDark, D.x + s * 0.95, 3.4, pz, 2.2, 0.1, 3.4, 0, 0, -s * 0.42);
    slab(b, Z.snow, D.x + s * 0.95, 3.53, pz, 2.1, 0.16, 3.3, 0, 0, -s * 0.42, false);
    // a door leaf
    box(b, Z.redDark, D.x + s * 1.03, 1.24, H.z1 + 0.5, 0.07, 2.44, 1.0);
    box(b, BRASS, D.x + s * 0.97, 1.1, H.z1 + 0.85, 0.04, 0.2, 0.04, 0, false);
    solid(c, D.x + s * 1.03, H.z1 + 0.5, 0.12, 1.0, DH, 'zarya-door', { kind: 'none', surface: 'wood' });
  }
  box(b, Z.wood, D.x, 3.3, H.z1 + 3.1, 3.2, 0.5, 0.1);
  box(b, Z.woodDark, D.x, 3.02, H.z1 + 2.5, 3.2, 0.14, 0.16, 0, false);
  box(b, Z.concrete, D.x, 0.05, H.z1 + 1.5, 3.6, 0.1, 3, 0, false);
  box(b, Z.iron, D.x, 2.98, H.z1 + 0.3, 0.06, 0.06, 0.6, 0, false);
  ball(b, Z.bulb, D.x, 2.82, H.z1 + 0.6, 0.17);
  b.light({ x: D.x, y: 2.6, z: H.z1 + 1.2, color: 0xffb060, intensity: 24, distance: 18, mode: 'steady', pool: 5.5, glow: 1, weight: 1.4 });
  // a round window in the gable over the door, as the old bathhouses have
  for (const x of [H.x0 - 0.03, H.x1 + 0.03]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 14), Z.warm);
    m.rotation.z = Math.PI / 2;
    m.position.set(x, 5.5, zc);
    m.receiveShadow = true;
    b.add(m, { cast: false });
    box(b, Z.woodDark, x + (x < xc ? -0.02 : 0.02), 5.5, zc, 0.06, 1.24, 0.07, 0, false);
    box(b, Z.woodDark, x + (x < xc ? -0.02 : 0.02), 5.5, zc, 0.06, 0.07, 1.24, 0, false);
  }
}

/** A bench along a wall with the board behind it: hooks, coats on some, hats on the shelf, slippers before it. `out` is the way it faces. */
function hookBench(c: Ctx, alongX: boolean, at: number, a: number, e: number, out: 1 | -1, seed: number): void {
  const { b } = c;
  const rnd = lcg(seed);
  const len = e - a;
  const m = (a + e) / 2;
  const P = (off: number, along: number, y: number, sl: number, sy: number, sd: number, mat: THREE.Material, cast = false): void => {
    box(b, mat, alongX ? along : at + out * off, y, alongX ? at + out * off : along, alongX ? sl : sd, sy, alongX ? sd : sl, 0, cast);
  };
  P(0.27, m, 0.45, len, 0.06, 0.5, Z.wood, true);
  for (let t = a + 0.2; t <= e - 0.1; t += (len - 0.4) / Math.max(1, Math.round(len / 1.7))) P(0.27, t, 0.21, 0.07, 0.42, 0.44, Z.woodDark);
  P(0.055, m, 1.3, len, 1.4, 0.05, Z.woodDark);
  P(0.1, m, 1.72, len, 0.07, 0.06, Z.woodPale);
  P(0.2, m, 2.02, len, 0.04, 0.34, Z.woodPale);
  for (let t = a + 0.35; t < e - 0.2; t += 0.52) {
    P(0.13, t, 1.72, 0.03, 0.03, 0.1, BRASS);
    const k = rnd();
    if (k < 0.6) P(0.19, t, 1.24, 0.34, 0.92, 0.16, GOODS[Math.floor(rnd() * GOODS.length)]!);
    if (k > 0.25 && k < 0.75) orb(b, k < 0.5 ? Z.woodDark : Z.black, alongX ? t : at + out * 0.2, 2.12, alongX ? at + out * 0.2 : t, 0.15, 0.62, 7);
    if (k < 0.45) for (const s of [-1, 1]) P(0.72, t + s * 0.08, 0.06, 0.1, 0.06, 0.26, k < 0.2 ? Z.blue : Z.redDark);
  }
  solid(c, alongX ? m : at + out * 0.27, alongX ? at + out * 0.27 : m, alongX ? len : 0.54, alongX ? 0.54 : len, 0.5, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
}

function changingRoom(c: Ctx): void {
  const { b } = c;
  const q = { x0: IN.x0, z0: IN.z0, x1: PX1 - 0.2, z1: IN.z1 };
  const doors = { s: [D.x - 1, D.x + 1] as [number, number], e: [PD1 - 1, PD1 + 1] as [number, number] };
  // green to the shoulder, a dark rail, cream above
  skin(b, Z.green, q, 0, 1.47, doors);
  skin(b, Z.woodDark, q, 1.47, 1.55, doors);
  skin(b, Z.cream, q, 1.55, CH, doors);
  // benches under their hooks along the north and west walls, a double one down the middle
  hookBench(c, true, q.z0 + 0.05, 107.3, 117.2, 1, 41);
  hookBench(c, false, q.x0 + 0.05, -163.9, -153.6, 1, 42);
  const iz = -159.6;
  box(b, Z.woodDark, 111.9, 0.95, iz, 5, 1.9, 0.08);
  box(b, Z.woodPale, 111.9, 1.93, iz, 5.1, 0.05, 0.5, 0, false);
  for (const s of [-1, 1]) {
    box(b, Z.wood, 111.9, 0.45, iz + s * 0.33, 5, 0.06, 0.5);
    box(b, Z.woodPale, 111.9, 1.72, iz + s * 0.07, 5, 0.07, 0.05, 0, false);
    for (let k = 0; k < 9; k++) {
      const x = 109.8 + k * 0.52;
      if ((k * 5 + (s > 0 ? 1 : 3)) % 3 !== 0) box(b, GOODS[(k * 3 + (s > 0 ? 2 : 5)) % GOODS.length]!, x, 1.24, iz + s * 0.15, 0.34, 0.92, 0.16, 0, false);
      if (k % 3 === 1) for (const t of [-1, 1]) box(b, s > 0 ? Z.blue : Z.redDark, x + t * 0.08, 0.06, iz + s * 0.8, 0.1, 0.06, 0.26, 0, false);
    }
  }
  for (const x of [109.5, 111.9, 114.3]) box(b, Z.woodDark, x, 0.21, iz, 0.07, 0.42, 1.1, 0, false);
  solid(c, 111.9, iz, 5, 1.2, 1.9, 'zarya-bench', { kind: 'prop', surface: 'wood' });
  // the ticket desk east of the door: tickets, towels and birch twigs for sale, the keys on their board behind
  counter(c, 114.7, -155.2, 3, false, 77, { goods: [Z.white, Z.cream, Z.woodPale, Z.green] });
  cyl(b, BRASS, 115.8, 1.03, -155.2, 0.17, 0.14, 0.44, 10);
  cyl(b, BRASS, 115.8, 1.47, -155.2, 0.06, 0.04, 0.18, 8);
  for (let i = 0; i < 4; i++) box(b, Z.white, 113.7, 1.06 + i * 0.07, -155.2, 0.4, 0.06, 0.3, 0, false);
  box(b, Z.woodDark, 114.7, 1.9, q.z1 - 0.08, 1.8, 1.0, 0.05, 0, false);
  for (let i = 0; i < 24; i++) box(b, BRASS, 114.0 + (i % 8) * 0.2, 2.22 - Math.floor(i / 8) * 0.3, q.z1 - 0.12, 0.05, 0.12, 0.02, 0, false);
  for (let i = 0; i < 4; i++) {
    // bundles of birch twigs hung by their handles
    box(b, Z.woodPale, 116.5 + i * 0.36, 2.2, q.z1 - 0.1, 0.05, 0.34, 0.05, 0, false);
    orb(b, i % 2 ? Z.green : Z.greenDark, 116.5 + i * 0.36, 1.78, q.z1 - 0.16, 0.2, 1.5, 6);
  }
  // the scales, the mirror, the clock, a runner from the door
  box(b, Z.white, 117.5, 0.08, -158.6, 0.5, 0.16, 0.7);
  box(b, Z.white, 117.7, 0.75, -158.6, 0.1, 1.5, 0.12);
  cyl(b, Z.white, 117.7, 1.5, -158.6, 0.2, 0.2, 0.08, 10);
  solid(c, 117.5, -158.6, 0.5, 0.7, 1.6, 'zarya-scales', { shots: false, kind: 'none', surface: 'metal' });
  box(b, Z.woodDark, q.x1 - 0.06, 1.7, -156.4, 0.04, 1.5, 1.1, 0, false);
  box(b, STEEL, q.x1 - 0.085, 1.7, -156.4, 0.02, 1.36, 0.96, 0, false);
  const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), Z.white);
  ck.rotation.x = Math.PI / 2;
  ck.position.set(112, 3.0, q.z0 + 0.08);
  ck.receiveShadow = true;
  b.add(ck, { cast: false });
  slab(b, Z.black, 111.99, 3.07, q.z0 + 0.12, 0.03, 0.15, 0.01, 0, 0, 0.03, false);
  slab(b, Z.black, 111.965, 3.1, q.z0 + 0.12, 0.02, 0.22, 0.01, 0, 0, 0.31, false);
  groundRect(b, Z.redDark, D.x - 0.7, -157.4, D.x + 0.7, IN.z1 - 0.1, 0.04);
  groundRect(b, Z.redDark, 114.9, PD1 - 0.7, PX1 - 0.3, PD1 + 0.7, 0.04);
  for (const x of [109.5, 115]) {
    cyl(b, Z.iron, x, CH - 0.4, -157.2, 0.02, 0.02, 0.4, 4, false);
    ball(b, Z.bulb, x, CH - 0.52, -157.2, 0.19);
  }
  b.light({ x: 112.2, y: 3.0, z: -157.4, color: 0xffcf96, intensity: 20, distance: 14, mode: 'steady', pool: 5, weight: 1.2 });
}

/** A stone bench with tin basins on it. */
function washBench(c: Ctx, x0: number, x1: number, z: number, seed: number): void {
  const { b } = c;
  const xm = (x0 + x1) / 2;
  const len = x1 - x0;
  box(b, Z.white, xm, 0.5, z, len, 0.09, 0.66);
  for (let x = x0 + 0.3; x <= x1 - 0.2; x += (len - 0.6) / Math.max(1, Math.round(len / 1.8))) box(b, Z.concrete, x, 0.23, z, 0.16, 0.46, 0.56);
  const rnd = lcg(seed);
  for (let x = x0 + 0.45; x < x1 - 0.3; x += 0.85) {
    const k = rnd();
    if (k < 0.2) continue;
    const dz = (rnd() - 0.5) * 0.12;
    cyl(b, Z.grey, x, 0.545, z + dz, 0.2, 0.28, 0.14, 10);
    cyl(b, Z.grey, x, 0.69, z + dz, 0.25, 0.25, 0.005, 10, false);
    if (k > 0.7) box(b, Z.cream, x + 0.38, 0.57, z - 0.12, 0.12, 0.05, 0.08, 0.4, false);
    if (k > 0.5 && k < 0.8) {
      // a ladle left in it
      cyl(b, BRASS, x + 0.08, 0.69, z + dz, 0.07, 0.07, 0.06, 6, false);
      rod(b, Z.woodPale, x + 0.08, 0.72, z + dz, x + 0.42, 0.86, z + dz + 0.1, 0.014, 4);
    }
  }
  solid(c, xm, z, len, 0.66, 0.56, 'zarya-bench', { shots: false, kind: 'none', surface: 'concrete' });
}

function washingRoom(c: Ctx): void {
  const { b } = c;
  const q = { x0: PX1 + 0.2, z0: IN.z0, x1: PX2 - 0.2, z1: IN.z1 };
  const doors = { w: [PD1 - 1, PD1 + 1] as [number, number], e: [PD2 - 1, PD2 + 1] as [number, number] };
  // tiled to above the head, a blue line, cream above
  skin(b, TILE, q, 0, 2.2, doors);
  skin(b, Z.blue, q, 2.2, 2.3, doors);
  skin(b, Z.cream, q, 2.3, CH, doors);
  // the drain down the middle of the floor
  box(b, Z.grey, (q.x0 + q.x1) / 2, 0.035, -159.55, q.x1 - q.x0 - 1, 0.012, 0.16, 0, false);
  for (let x = q.x0 + 1; x < q.x1 - 0.6; x += 2.4) box(b, Z.iron, x, 0.04, -159.55, 0.3, 0.014, 0.3, 0, false);
  // benches: along the north and south walls, two in the middle
  washBench(c, 119.2, 127.4, q.z0 + 0.38, 51);
  washBench(c, 119.2, 129.2, q.z1 - 0.38, 52);
  washBench(c, 120.4, 124.0, -158.25, 53);
  washBench(c, 124.6, 128.2, -160.85, 54);
  // the taps over the north bench: a pipe along the wall, hot and cold at every place
  for (const [zz, x0, x1] of [[q.z0 + 0.1, 119.2, 127.4], [q.z1 - 0.1, 119.2, 129.2]] as const) {
    const o = zz < -159 ? 1 : -1;
    for (const y of [1.18, 1.3]) box(b, STEEL, (x0 + x1) / 2, y, zz, x1 - x0, 0.045, 0.045, 0, false);
    for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.25) {
      box(b, BRASS, x - 0.12, 1.16, zz + o * 0.14, 0.05, 0.05, 0.24, 0, false);
      box(b, BRASS, x + 0.12, 1.16, zz + o * 0.14, 0.05, 0.05, 0.24, 0, false);
      box(b, Z.red, x - 0.12, 1.24, zz + o * 0.1, 0.08, 0.08, 0.08, 0.6, false);
      box(b, Z.blue, x + 0.12, 1.24, zz + o * 0.1, 0.08, 0.08, 0.08, 0.6, false);
    }
  }
  // two showers on the west wall, south of the door
  for (const z of [-157.4, -155.2]) {
    box(b, STEEL, q.x0 + 0.08, 1.2, z, 0.045, 2.2, 0.045, 0, false);
    box(b, STEEL, q.x0 + 0.28, 2.3, z, 0.44, 0.045, 0.045, 0, false);
    cyl(b, STEEL, q.x0 + 0.5, 2.2, z, 0.13, 0.05, 0.1, 8, false);
    box(b, Z.red, q.x0 + 0.1, 1.1, z - 0.12, 0.08, 0.08, 0.08, 0, false);
    box(b, Z.blue, q.x0 + 0.1, 1.1, z + 0.12, 0.08, 0.08, 0.08, 0, false);
    box(b, Z.woodPale, q.x0 + 0.55, 0.05, z, 0.9, 0.04, 0.9, 0, false);
  }
  // the cold tub in the north-east corner, and buckets about the floor
  cyl(b, Z.wood, 129.1, 0, -164.5, 0.72, 0.66, 0.9, 12);
  for (const y of [0.2, 0.7]) cyl(b, Z.iron, 129.1, y, -164.5, 0.74, 0.72, 0.05, 12, false);
  disc(b, Z.black, 129.1, 0.906, -164.5, 0.6, 0.6, 12);
  solid(c, 129.1, -164.5, 1.4, 1.4, 0.95, 'zarya-tub', { shots: false, kind: 'prop', surface: 'wood' });
  for (const [x, z, m] of [[128.6, -158.3, 0], [119.6, -160.2, 1], [125.6, -155.6, 0], [121.4, -162.7, 1]] as const) {
    cyl(b, m ? Z.wood : Z.grey, x, 0.03, z, 0.15, 0.19, 0.3, 8);
    rod(b, Z.iron, x - 0.18, 0.33, z, x + 0.18, 0.33, z, 0.012, 4);
  }
  for (const x of [121.5, 127]) {
    cyl(b, Z.iron, x, CH - 0.3, -159.5, 0.02, 0.02, 0.3, 4, false);
    ball(b, Z.bulb, x, CH - 0.42, -159.5, 0.2);
  }
  b.light({ x: 124.3, y: 3.0, z: -159.5, color: 0xfff0d6, intensity: 11, distance: 13, mode: 'steady', pool: 0, weight: 1.2 });
}

function steamRoom(c: Ctx): void {
  const { b } = c;
  const q = { x0: PX2 + 0.2, z0: IN.z0, x1: IN.x1, z1: IN.z1 };
  const doors = { w: [PD2 - 1, PD2 + 1] as [number, number] };
  // lined with pale boards, wall and ceiling
  skin(b, Z.woodPale, q, 0, CH, doors);
  for (let x = q.x0 + 0.5; x < q.x1; x += 0.55) for (const z of [q.z0 + 0.055, q.z1 - 0.055]) box(b, Z.wood, x, CH / 2, z, 0.03, CH, 0.02, 0, false);
  for (let z = q.z0 + 0.5; z < q.z1; z += 0.55) {
    box(b, Z.wood, q.x1 - 0.055, CH / 2, z, 0.02, CH, 0.03, 0, false);
    if (Math.abs(z - PD2) > 1.1) box(b, Z.wood, q.x0 + 0.055, CH / 2, z, 0.02, CH, 0.03, 0, false);
  }
  // the benches: three tiers along the north wall, three along the east
  const nx0 = q.x0 + 0.8;
  const tiers = 3;
  const step = 0.7;
  const rise = 0.45;
  for (let i = 0; i < tiers; i++) {
    const top = rise * (i + 1);
    const zf = q.z0 + step * (tiers - i);
    box(b, Z.wood, (nx0 + q.x1) / 2, (top - 0.07) / 2, zf - step / 2, q.x1 - nx0, top - 0.07, step);
    box(b, Z.woodPale, (nx0 + q.x1) / 2, top - 0.035, zf - step / 2 + 0.03, q.x1 - nx0, 0.07, step + 0.06);
    const xf = q.x1 - step * (tiers - i);
    const ez0 = q.z0 + step * tiers;
    const ez1 = q.z1 - 0.9;
    box(b, Z.wood, xf + step / 2, (top - 0.07) / 2, (ez0 + ez1) / 2, step, top - 0.07, ez1 - ez0);
    box(b, Z.woodPale, xf + step / 2 - 0.03, top - 0.035, (ez0 + ez1) / 2, step + 0.06, 0.07, ez1 - ez0);
  }
  // a rail to lean back on above the top tier
  box(b, Z.wood, (nx0 + q.x1) / 2, rise * tiers + 0.55, q.z0 + 0.1, q.x1 - nx0, 0.14, 0.06, 0, false);
  box(b, Z.wood, q.x1 - 0.1, rise * tiers + 0.55, (q.z0 + q.z1) / 2 - 0.4, 0.06, 0.14, q.z1 - q.z0 - 3, 0, false);
  solid(c, (nx0 + q.x1) / 2, q.z0 + (step * tiers) / 2, q.x1 - nx0, step * tiers, rise * tiers, 'zarya-steambench', { shots: false, kind: 'prop', surface: 'wood' });
  solid(c, q.x1 - (step * tiers) / 2, (q.z0 + q.z1 - 0.9) / 2, step * tiers, q.z1 - q.z0 - 0.9, rise * tiers, 'zarya-steambench', { shots: false, kind: 'prop', surface: 'wood' });

  // the stove against the south wall: mortared stone, a heap of dark stones on it, the mouth glowing, its pipe up
  // through the ceiling (the coil is the story's: `BANYA.coil`, at the mouth)
  const S = BANYA.coil;
  const sz = q.z1 - 0.75;
  box(b, HEARTH, S.x, 0.65, sz, 1.9, 1.3, 1.4);
  for (const y of [0.34, 0.68, 1.0]) box(b, STONE, S.x, y, sz - 0.705, 1.9, 0.03, 0.02, 0, false);
  for (let k = 0; k < 6; k++) box(b, STONE, S.x - 0.8 + k * 0.33 + (k % 2) * 0.1, 0.5 + (k % 3) * 0.33, sz - 0.705, 0.03, 0.32, 0.02, 0, false);
  box(b, Z.iron, S.x, 1.34, sz, 2.0, 0.08, 1.5);
  box(b, Z.iron, S.x, 0.48, sz - 0.71, 0.86, 0.62, 0.05, 0, false);
  box(b, Z.warm, S.x, 0.46, sz - 0.74, 0.62, 0.38, 0.03, 0, false);
  for (const dx of [-0.2, 0, 0.2]) box(b, Z.iron, S.x + dx, 0.46, sz - 0.76, 0.03, 0.38, 0.02, 0, false);
  const rs = lcg(9);
  for (let k = 0; k < 26; k++) {
    const lv = k < 14 ? 0 : k < 22 ? 1 : 2;
    const sp = 0.8 - lv * 0.26;
    orb(b, k % 3 ? STONE : Z.iron, S.x + (rs() - 0.5) * 2 * sp, 1.46 + lv * 0.2, sz + (rs() - 0.5) * 1.5 * sp, 0.15 + rs() * 0.07, 0.8, 6);
  }
  cyl(b, Z.iron, S.x + 0.62, 1.38, sz + 0.42, 0.16, 0.16, CH - 1.38, 8);
  solid(c, S.x, sz, 2.0, 1.5, 1.8, 'zarya-stove', { kind: 'prop', surface: 'concrete' });
  b.light({ x: S.x, y: 1.0, z: sz - 1.5, color: 0xff8a40, intensity: 18, distance: 13, mode: 'flicker', pool: 4, weight: 1.3 });

  // on the bench by the place a player sits: a bucket with its ladle, a bundle of birch twigs, a towel
  const ty = rise + 0.0;
  const tz = q.z0 + step * tiers - step / 2;
  cyl(b, Z.wood, 136.4, ty, tz, 0.16, 0.19, 0.3, 10);
  for (const y of [0.06, 0.22]) cyl(b, Z.iron, 136.4, ty + y, tz, 0.185, 0.19, 0.03, 10, false);
  rod(b, Z.woodPale, 136.4, ty + 0.24, tz, 136.8, ty + 0.52, tz + 0.16, 0.016, 4);
  orb(b, Z.green, 137.55, ty + 0.1, tz, 0.26, 0.4, 7);
  orb(b, Z.greenDark, 137.75, ty + 0.11, tz + 0.08, 0.2, 0.42, 6);
  rod(b, Z.woodPale, 137.2, ty + 0.06, tz - 0.02, 136.95, ty + 0.05, tz - 0.14, 0.03, 5);
  box(b, Z.white, 134, rise * 2 + 0.03, tz - step, 0.5, 0.05, 0.6, 0.15, false);
  box(b, Z.white, 134, rise * 2 - 0.2, tz - step / 2 + 0.07, 0.48, 0.44, 0.03, 0.15, false);
  // a second bucket by the stove, a lamp in a cage on the west wall
  cyl(b, Z.wood, S.x - 1.5, 0.03, sz - 0.2, 0.17, 0.2, 0.32, 10);
  ball(b, Z.bulb, q.x0 + 0.22, 2.7, -161.5, 0.15);
  for (const dz of [-0.14, 0.14]) box(b, Z.iron, q.x0 + 0.24, 2.7, -161.5 + dz, 0.3, 0.36, 0.02, 0, false);
  b.light({ x: 135.5, y: 3.1, z: -159.4, color: 0xffb46a, intensity: 13, distance: 13, mode: 'steady', pool: 0, weight: 1.2 });
  cyl(b, Z.iron, 135.5, CH - 0.3, -159.4, 0.02, 0.02, 0.3, 4, false);
  ball(b, Z.bulb, 135.5, CH - 0.42, -159.4, 0.16);
  // felt hats and birch twigs on pegs by the door, a water butt beside the stove, the thermometer
  box(b, Z.wood, q.x0 + 0.08, 1.75, -160.4, 0.05, 0.1, 3.4, 0, false);
  for (let k = 0; k < 6; k++) {
    const z = -161.8 + k * 0.56;
    box(b, Z.woodDark, q.x0 + 0.14, 1.75, z, 0.12, 0.03, 0.03, 0, false);
    if (k % 3 === 2) {
      box(b, Z.woodPale, q.x0 + 0.16, 1.55, z, 0.04, 0.34, 0.04, 0, false);
      orb(b, k === 2 ? Z.green : Z.greenDark, q.x0 + 0.2, 1.15, z, 0.2, 1.5, 6);
    } else cone(b, k % 2 ? Z.cream : Z.grey, q.x0 + 0.2, 1.52, z, 0.17, 0.04, 0.24, 7, 0, false);
  }
  cyl(b, Z.wood, S.x + 1.9, 0, sz + 0.1, 0.42, 0.38, 0.85, 12);
  for (const y of [0.18, 0.62]) cyl(b, Z.iron, S.x + 1.9, y, sz + 0.1, 0.43, 0.425, 0.04, 12, false);
  disc(b, Z.black, S.x + 1.9, 0.856, sz + 0.1, 0.36, 0.36, 12);
  rod(b, Z.woodPale, S.x + 1.9, 0.86, sz + 0.1, S.x + 2.3, 1.2, sz - 0.1, 0.016, 4);
  solid(c, S.x + 1.9, sz + 0.1, 0.9, 0.9, 0.9, 'zarya-butt', { shots: false, kind: 'none', surface: 'wood' });
  box(b, Z.white, q.x1 - 0.07, 2.3, -158, 0.03, 0.42, 0.1, 0, false);
  box(b, Z.red, q.x1 - 0.09, 2.24, -158, 0.02, 0.24, 0.025, 0, false);
  // boards to walk on between the door and the benches
  for (let i = 0; i < 4; i++) box(b, Z.woodPale, 132.6 + i * 1.5, 0.05, -158.6, 1.3, 0.035, 2.2, 0, false);
}

/** In front of the bathhouse: the way from the road, benches, a dressed fir, the woodpile; and the wood yard behind. */
function grounds(c: Ctx): void {
  const { b } = c;
  bench(c, 112.7, -142.6, Math.PI / 2);
  bench(c, 107.3, -138.6, -Math.PI / 2);
  fir(c, 104.6, -146.2, 6.5, { lights: true, seed: 17 });
  fir(c, 118, -146.6, 4.6);
  fir(c, 136.5, -146.5, 7);
  logStack(c, 120, 126.4, H.z1 + 0.5, 0.7, 1.3, 1, true);
  sledge(c, 116.6, -150, 0.3, 'logs');
  snowman(c, 116, -139.5, 0.3);
  lampPost(c, 128, -135.2, true);
  // shovelled snow heaped either side of the path
  for (const [x, z, r] of [[107.2, -147.4, 1.6], [113, -137.4, 1.4], [106.9, -135.6, 1.5], [113.4, -147.8, 1.2], [131, -150.4, 2.2], [139.6, -150.8, 1.8]] as const) mound(b, x, z, r, r * 0.42, x * 1.3, 0.75);
  // two barrels under the eaves' drip
  for (const [x, z] of [[130.6, -151.4], [140.9, -151.3]] as const) {
    cyl(b, Z.blue, x, 0, z, 0.34, 0.34, 0.95, 10);
    cyl(b, Z.snow, x, 0.95, z, 0.3, 0.2, 0.12, 10, false);
    solid(c, x, z, 0.7, 0.7, 1, 'zarya-barrel', { shots: false, kind: 'none', surface: 'metal' });
  }

  // ---- the wood yard behind: the boiler's brick chimney with its red lamp, a shed of firewood, coal, a chopping block ----
  const kx = 124;
  const kz = -170.2;
  cyl(b, BRICK, kx, 0, kz, 0.95, 0.6, 11.5, 10);
  box(b, BRICK, kx, 0.9, kz, 2.2, 1.8, 2.2);
  box(b, Z.snow, kx, 1.86, kz, 2.3, 0.14, 2.3, 0, false);
  for (const y of [3.4, 6.2, 9]) cyl(b, Z.iron, kx, y, kz, 0.95 - (y / 11.5) * 0.35 + 0.03, 0.95 - ((y + 0.14) / 11.5) * 0.35 + 0.03, 0.14, 10, false);
  cyl(b, Z.cream, kx, 11.2, kz, 0.68, 0.68, 0.3, 10, false);
  orb(b, Z.redLamp, kx, 11.75, kz, 0.16);
  b.glow({ x: kx, y: 11.75, z: kz, color: 0xff3020, size: 1.4, intensity: 2.4, mode: 'pulse', period: 2.4 });
  solid(c, kx, kz, 2.2, 2.2, 11, 'zarya-chimney', { kind: 'building' });
  // the flue from the boiler room's wall to the stack, the boiler's iron door
  rod(b, Z.iron, kx, 2.6, H.z0, kx, 2.6, kz + 0.6, 0.22, 8);
  box(b, Z.iron, 121, 1.0, H.z0 - 0.04, 1.3, 2.0, 0.08, 0, false);
  box(b, STEEL, 121.45, 1.05, H.z0 - 0.09, 0.06, 0.3, 0.04, 0, false);
  // a lamp on the back wall
  box(b, Z.iron, 131, 3.2, H.z0 - 0.3, 0.06, 0.06, 0.6, 0, false);
  ball(b, Z.bulb, 131, 3.05, H.z0 - 0.6, 0.16);
  b.light({ x: 131, y: 2.9, z: H.z0 - 1.4, color: 0xffb060, intensity: 18, distance: 16, mode: 'steady', pool: 5, weight: 0.8 });
  // the woodshed against the fence
  const sx0 = 128.6;
  const sx1 = 139.4;
  const sz0 = FENCE_Z + 0.1;
  const sz1 = -176.6;
  for (const x of [sx0, (sx0 + sx1) / 2, sx1]) box(b, Z.woodDark, x, 1.4, sz1, 0.18, 2.8, 0.18);
  for (const x of [sx0, sx1]) box(b, Z.woodDark, x, 1.2, (sz0 + sz1) / 2, 0.1, 2.4, sz1 - sz0);
  slab(b, Z.woodDark, (sx0 + sx1) / 2, 2.72, (sz0 + sz1) / 2 + 0.2, sx1 - sx0 + 0.8, 0.1, sz1 - sz0 + 1.2, -0.16, 0, 0);
  slab(b, Z.snow, (sx0 + sx1) / 2, 2.87, (sz0 + sz1) / 2 + 0.2, sx1 - sx0 + 0.7, 0.2, sz1 - sz0 + 1.1, -0.16, 0, 0, false);
  logStack(c, sx0 + 0.2, sx1 - 0.2, (sz0 + sz1) / 2 - 0.2, sz1 - sz0 - 0.6, 2.0, 1, false);
  solid(c, (sx0 + sx1) / 2, (sz0 + sz1) / 2, sx1 - sx0 + 0.2, sz1 - sz0 + 0.3, 2.8, 'zarya-shed', { kind: 'building', surface: 'wood' });
  // the chopping block, the axe in it, split logs lying about
  cyl(b, Z.wood, 126.4, 0, -174, 0.34, 0.36, 0.55, 9);
  rod(b, Z.woodPale, 126.4, 0.6, -174, 126.9, 1.2, -173.8, 0.025, 5);
  box(b, STEEL, 126.4, 0.64, -174, 0.07, 0.2, 0.16, 0.3, false);
  solid(c, 126.4, -174, 0.7, 0.7, 0.6, 'zarya-block', { shots: false, kind: 'none', surface: 'wood' });
  const rl = lcg(5);
  for (let i = 0; i < 9; i++) {
    const x = 125.2 + rl() * 3;
    const z = -175.4 + rl() * 2.6;
    const a = rl() * Math.PI;
    rod(b, i % 2 ? Z.woodPale : Z.wood, x - Math.cos(a) * 0.22, 0.09, z - Math.sin(a) * 0.22, x + Math.cos(a) * 0.22, 0.09, z + Math.sin(a) * 0.22, 0.08, 5);
  }
  sledge(c, 133, -172.6, -0.2, 'logs');
  // coal for the boiler, a shovel stood in it
  orb(b, Z.black, 116.6, 0, -169.6, 1.9, 0.42, 9);
  orb(b, Z.snow, 116.2, 0.5, -170.2, 0.9, 0.3, 7);
  rod(b, Z.woodPale, 118.2, 0.2, -169.2, 118.5, 1.4, -169.0, 0.025, 5);
  solid(c, 116.6, -169.6, 2.8, 2.8, 0.8, 'zarya-coal', { shots: false, kind: 'none' });
  for (const [x, z] of [[140.6, -168], [141.3, -169.1], [140.4, -169.3]] as const) {
    cyl(b, Z.iron, x, 0, z, 0.32, 0.32, 0.9, 10);
    cyl(b, Z.snow, x, 0.9, z, 0.28, 0.18, 0.1, 10, false);
  }
  solid(c, 140.8, -168.7, 1.6, 2, 0.95, 'zarya-barrel', { shots: false, kind: 'none', surface: 'metal' });
  fir(c, 109, -172.5, 7.5);
  fir(c, 103, -168, 6);
  groundRect(b, Z.packed, 119, -176.4, 141, H.z0, 0.012);
}

// ---------------------------------------------------------------------------------------------------------------------
// the pond
// ---------------------------------------------------------------------------------------------------------------------

/** A fisherman's tent: a canvas pyramid under snow, its flap toward (dx, dz). */
function tent(c: Ctx, x: number, z: number, dx: number, dz: number, mat: THREE.Material, lit: boolean): void {
  const { b } = c;
  const yaw = Math.atan2(dx, dz);
  const r = 1.55;
  const h = 1.95;
  const y0 = 0.05;
  cone(b, mat, x, y0, z, r, 0, h, 4, yaw - Math.PI / 4);
  cone(b, Z.snow, x, y0 + 1.05, z, r * (1 - 1.05 / h) + 0.07, 0, h - 1.0, 4, yaw - Math.PI / 4, false);
  const ap = r * Math.SQRT1_2;
  const lean = Math.atan2(ap, h);
  const dy = 0.62;
  const out = ap * (1 - dy / h) + 0.025;
  slab(b, lit ? Z.warm : Z.black, x + dx * out, y0 + dy, z + dz * out, 0.62, 1.15, 0.03, -lean, yaw, 0, false);
  // the flap thrown back, and a skirt of snow heaped round the foot
  slab(b, mat, x + dx * (out + 0.02) - dz * 0.5, y0 + dy, z + dz * (out + 0.02) + dx * 0.5, 0.4, 1.1, 0.03, -lean, yaw, 0.12, false);
  cone(b, Z.snow, x, 0.04, z, r + 0.22, r - 0.1, 0.2, 4, yaw - Math.PI / 4, false);
  solid(c, x, z, 2.2, 2.2, h, 'zarya-tent', { rot: yaw, kind: 'prop', surface: 'wood' });
  if (lit) b.glow({ x: x + dx * (out + 0.2), y: 0.8, z: z + dz * (out + 0.2), color: 0xffb060, size: 1.3, intensity: 1.4, mode: 'steady' });
}

/** A hole in the ice and what a fisherman has by it: his stool and box, the rod on its rest, an auger, the catch. */
function fishing(c: Ctx, h: FishHole, i: number): void {
  const { b } = c;
  const ux = Math.cos(h.a);
  const uz = Math.sin(h.a);
  const side = i % 2 ? 1 : -1;
  const px = -uz * side;
  const pz = ux * side;
  disc(b, Z.snow, h.x, 0.09, h.z, 0.46, 0.4, 10, i);
  disc(b, Z.black, h.x, 0.1, h.z, 0.24, 0.24, 10);
  for (let k = 0; k < 5; k++) box(b, Z.white, h.x + Math.cos(k * 1.3 + i) * 0.4, 0.13, h.z + Math.sin(k * 1.3 + i) * 0.4, 0.14, 0.1, 0.1, k * 0.9, false);
  const f = fisher(h);
  const yaw = Math.atan2(-pz, px);
  // the stool he was sitting on, and his box beside it
  const sx = f.x + px * 0.72;
  const sz = f.z + pz * 0.72;
  box(b, Z.woodPale, sx, 0.42, sz, 0.36, 0.04, 0.34, yaw);
  for (const lx of [-0.14, 0.14]) for (const lz of [-0.13, 0.13]) {
    const [qx, qz] = frame(sx, sz, yaw)(lx, lz);
    box(b, Z.woodDark, qx, 0.22, qz, 0.035, 0.38, 0.035, yaw, false);
  }
  const bx = f.x + px * 1.22;
  const bz = f.z + pz * 1.22;
  box(b, i % 3 === 0 ? STEEL : Z.greenDark, bx, 0.19, bz, 0.5, 0.3, 0.3, yaw);
  box(b, Z.woodDark, bx, 0.35, bz, 0.5, 0.025, 0.06, yaw, false);
  solid(c, f.x + px * 0.97, f.z + pz * 0.97, 0.9, 0.4, 0.46, 'zarya-stool', { rot: yaw, shots: false, kind: 'none', surface: 'wood' });
  // the short rod on its rest, the line down into the dark
  const tx = h.x + ux * 0.06;
  const tz = h.z + uz * 0.06;
  rod(b, Z.woodPale, h.x + ux * 0.6 - px * 0.22, 0.2, h.z + uz * 0.6 - pz * 0.22, tx, 0.55, tz, 0.013, 4);
  box(b, Z.woodDark, h.x + ux * 0.42 - px * 0.15, 0.2, h.z + uz * 0.42 - pz * 0.15, 0.03, 0.3, 0.03, 0, false);
  box(b, Z.black, tx, 0.32, tz, 0.008, 0.46, 0.008, 0, false);
  box(b, Z.red, tx, 0.57, tz, 0.05, 0.05, 0.05, 0, false);
  if (i % 2 === 0) {
    // the auger stood in the ice
    const ax = h.x - ux * 0.5 - px * 0.9;
    const az = h.z - uz * 0.5 - pz * 0.9;
    rod(b, STEEL, ax, 0.05, az, ax + 0.08, 1.3, az + 0.05, 0.02, 5);
    for (const y of [0.16, 0.3, 0.44]) cyl(b, STEEL, ax + 0.01, y, az + 0.005, 0.09, 0.09, 0.02, 8, false);
    box(b, Z.orange, ax + 0.08, 1.3, az + 0.05, 0.34, 0.04, 0.04, h.a, false);
  }
  // what he has caught, frozen where it was thrown
  for (let k = 0; k < 2 + (i % 3); k++) {
    const qx = bx + px * 0.5 + ((k * 0.37 + i * 0.2) % 0.6) - 0.3;
    const qz = bz + pz * 0.5 + ((k * 0.53 + i * 0.3) % 0.6) - 0.3;
    box(b, STEEL, qx, 0.085, qz, 0.24, 0.03, 0.07, k * 1.1 + i, false);
  }
  if (h.tent >= 0) tent(c, h.x + ux * 3, h.z + uz * 3, -ux, -uz, TENTS[h.tent % TENTS.length]!, h.tent % 2 === 1);
}

/** The cross-shaped ice-hole: black water inside a rim of ice blocks, wooden steps down into its south arm, the ice cross behind. */
function iceHole(c: Ctx): void {
  const { b } = c;
  const X = BANYA.cross;
  const L = 2.5;
  const a = 0.75;
  const t = 0.42;
  // the snow round it trodden grey by bare feet and felt boots
  disc(b, Z.snowBlue, X.x, 0.068, X.z + 0.4, 7.4, 6.4, 22);
  box(b, WATER, X.x, 0.085, X.z, L * 2, 0.02, a * 2, 0, false);
  box(b, WATER, X.x, 0.086, X.z, a * 2, 0.02, L * 2, 0, false);
  // the rim: sawn blocks of the pond's own ice, set round the cross (open at the head of the steps)
  const rnd = lcg(31);
  const run = (x0: number, z0: number, x1: number, z1: number): void => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? x1 - x0 : z1 - z0;
    const n = Math.max(1, Math.round(Math.abs(len) / 0.72));
    for (let k = 0; k < n; k++) {
      const m = (k + 0.5) / n;
      const hh = 0.3 + rnd() * 0.12;
      const bx = X.x + (alongX ? x0 + len * m : x0);
      const bz = X.z + (alongX ? z0 : z0 + len * m);
      const bl = Math.abs(len) / n - 0.03;
      box(b, Z.ice, bx, 0.05 + hh / 2, bz, alongX ? bl : t, hh, alongX ? t : bl, 0, false);
      if (rnd() < 0.7) box(b, Z.snow, bx, 0.07 + hh, bz, alongX ? bl - 0.08 : t - 0.1, 0.05, alongX ? t - 0.1 : bl - 0.08, 0, false);
    }
  };
  const o = a + t / 2;
  const e = L + t;
  for (const s of [-1, 1]) {
    run(a, s * o, e, s * o); // the east arm's two sides
    run(-e, s * o, -a, s * o); // the west arm's
    run(s * o, -e, s * o, -a); // the north arm's
    run(s * o, a, s * o, L - 0.1); // the south arm's (the steps come in at its end)
    run(s * (L + t / 2), -a, s * (L + t / 2), a); // the east and west ends
  }
  run(-a, -(L + t / 2), a, -(L + t / 2)); // the north end
  solid(c, X.x, X.z, e * 2, (a + t) * 2, 0.6, 'zarya-icehole', { shots: false, kind: 'prop' });
  solid(c, X.x, X.z + 0.1, (a + t) * 2, e * 2 + 0.2, 0.6, 'zarya-icehole', { shots: false, kind: 'prop' });
  // the steps: a landing on the rim, two treads down into the water, a rail either side
  const zs = X.z + L;
  box(b, Z.wood, X.x, 0.2, zs + 0.2, a * 2 + 0.5, 0.4, 0.9);
  box(b, Z.woodPale, X.x, 0.42, zs + 0.2, a * 2 + 0.56, 0.05, 0.96, 0, false);
  box(b, Z.wood, X.x, 0.12, zs + 0.95, a * 2 + 0.3, 0.2, 0.5, 0, false);
  box(b, Z.woodPale, X.x, 0.24, zs + 0.95, a * 2 + 0.36, 0.04, 0.56, 0, false);
  box(b, Z.woodPale, X.x, 0.28, zs - 0.48, a * 2 - 0.1, 0.05, 0.42, 0, false);
  box(b, Z.woodPale, X.x, 0.13, zs - 0.9, a * 2 - 0.1, 0.05, 0.42, 0, false);
  for (const s of [-1, 1]) {
    const rx = X.x + s * (a + 0.14);
    box(b, Z.woodDark, rx, 0.75, zs + 0.6, 0.09, 1.5, 0.09);
    box(b, Z.woodDark, rx, 0.6, zs - 1.0, 0.09, 1.0, 0.09);
    rod(b, Z.wood, rx, 1.45, zs + 0.6, rx, 1.05, zs - 1.0, 0.04, 6);
    rod(b, Z.wood, rx, 0.9, zs + 0.6, rx, 0.55, zs - 1.0, 0.03, 6);
    box(b, Z.snow, rx, 1.53, zs + 0.6, 0.16, 0.07, 0.16, 0, false);
  }
  // felt boots left at the head of the steps
  for (const [dx, dz] of [[1.5, 0.75], [1.72, 0.8]] as const) {
    cyl(b, Z.grey, X.x + dx, 0.05, zs + dz, 0.08, 0.09, 0.34, 7);
    box(b, Z.grey, X.x + dx, 0.1, zs + dz - 0.1, 0.15, 0.1, 0.2, 0, false);
  }

  // the ice cross: carved from blocks, standing north of the hole on a plinth of ice
  const cz = X.z - e - 2.0;
  box(b, Z.ice, X.x, 0.3, cz, 2.2, 0.5, 1.3, 0, false);
  box(b, Z.ice, X.x, 0.72, cz, 1.4, 0.36, 0.9, 0, false);
  box(b, Z.ice, X.x, 2.5, cz, 0.44, 3.3, 0.36, 0, false);
  box(b, Z.ice, X.x, 3.05, cz, 2.0, 0.4, 0.34, 0, false);
  box(b, Z.ice, X.x, 3.72, cz, 0.94, 0.26, 0.32, 0, false);
  slab(b, Z.ice, X.x, 1.75, cz, 1.2, 0.26, 0.32, 0, 0, -0.42, false);
  box(b, Z.snow, X.x, 3.28, cz, 1.9, 0.07, 0.3, 0, false);
  box(b, Z.snow, X.x, 4.18, cz, 0.4, 0.07, 0.32, 0, false);
  solid(c, X.x, cz, 2.2, 1.3, 4, 'zarya-icecross', { kind: 'prop' });
  b.light({ x: X.x, y: 2.0, z: cz + 1.6, color: 0x6fb4ff, intensity: 16, distance: 15, mode: 'steady', pool: 5, weight: 1 });
  // two lanterns at the head of the steps, a bench with towels and a robe on it, a flask
  lantern(c, X.x - 3.7, zs + 1.0, true);
  lantern(c, X.x + 3.7, zs + 1.0, false);
  const bx = X.x + 5.4;
  const bz = X.z + 0.6;
  box(b, Z.wood, bx, 0.45, bz, 0.5, 0.07, 2);
  for (const s of [-0.8, 0.8]) box(b, Z.woodDark, bx, 0.24, bz + s, 0.44, 0.42, 0.08);
  box(b, Z.white, bx, 0.53, bz - 0.5, 0.4, 0.1, 0.5, 0.1, false);
  box(b, Z.blue, bx, 0.52, bz + 0.3, 0.44, 0.08, 0.7, -0.08, false);
  cyl(b, Z.red, bx, 0.48, bz + 0.85, 0.06, 0.06, 0.3, 8, false);
  solid(c, bx, bz, 0.5, 2, 0.6, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
}

/** The jetty: boards on piles from the bank out over the ice, a rail either side. */
function jetty(c: Ctx): void {
  const { b } = c;
  const J = BANYA.jetty;
  const zc = (J.z0 + J.z1) / 2;
  const xm = (J.x0 + J.x1) / 2;
  const len = J.x1 - J.x0;
  box(b, Z.wood, xm, 0.09, zc, len, 0.1, J.z1 - J.z0);
  for (let x = J.x0 + 0.25; x < J.x1; x += 0.5) box(b, Z.woodDark, x, 0.142, zc, 0.03, 0.008, J.z1 - J.z0, 0, false);
  for (const s of [-1, 1]) {
    const zz = zc + (s * (J.z1 - J.z0)) / 2;
    for (let x = J.x0; x <= J.x1 + 0.01; x += len / 5) {
      cyl(b, Z.woodDark, x, 0, zz, 0.11, 0.1, 1.15, 6);
      box(b, Z.snow, x, 1.19, zz, 0.24, 0.08, 0.24, 0, false);
    }
    box(b, Z.wood, xm, 0.96, zz, len, 0.07, 0.08);
    box(b, Z.wood, xm, 0.56, zz, len, 0.05, 0.06, 0, false);
    box(b, Z.snow, xm, 1.02, zz, len - 0.4, 0.05, 0.1, 0, false);
    solid(c, xm, zz, len, 0.22, 1.1, 'zarya-jetty', { shots: false, kind: 'prop', surface: 'wood' });
  }
  lantern(c, J.x0 - 0.2, J.z0 - 0.3, true);
  lantern(c, J.x1 + 0.2, J.z1 + 0.3, false);
  // a life ring on the rail, a sledge left at the land end
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 12), Z.red);
  ring.position.set(J.x0 + 4.4, 0.7, J.z1 + 0.1);
  ring.receiveShadow = true;
  b.add(ring, { cast: false });
  for (let k = 0; k < 4; k++) box(b, Z.white, J.x0 + 4.4 + Math.cos(k * 1.571) * 0.3, 0.7 + Math.sin(k * 1.571) * 0.3, J.z1 + 0.1, 0.14, 0.14, 0.19, 0, false);
  sledge(c, J.x1 + 1.6, J.z0 - 1.6, 0.5, 'none');
}

/** Children's hockey: a patch of ice swept clear, a goal at each end, sticks thrown down. */
function hockey(c: Ctx): void {
  const { b } = c;
  const x0 = 43;
  const x1 = 57;
  const z0 = -120.5;
  const z1 = -111.5;
  for (const z of [z0, z1]) box(b, Z.snow, (x0 + x1) / 2, 0.16, z, x1 - x0 + 0.6, 0.24, 0.6, 0, false);
  for (const x of [x0, x1]) box(b, Z.snow, x, 0.16, (z0 + z1) / 2, 0.6, 0.24, z1 - z0, 0, false);
  for (const [gx, s] of [[x0 + 1, 1], [x1 - 1, -1]] as const) {
    const zc = (z0 + z1) / 2;
    for (const k of [-1, 1]) {
      rod(b, Z.red, gx, 0.05, zc + k * 0.9, gx, 1.2, zc + k * 0.9, 0.035, 6);
      rod(b, Z.red, gx, 1.2, zc + k * 0.9, gx - s * 0.6, 0.08, zc + k * 0.9, 0.025, 5);
    }
    rod(b, Z.red, gx, 1.2, zc - 0.9, gx, 1.2, zc + 0.9, 0.035, 6);
    rod(b, Z.red, gx - s * 0.6, 0.08, zc - 0.9, gx - s * 0.6, 0.08, zc + 0.9, 0.025, 5);
    for (let k = -3; k <= 3; k++) rod(b, Z.white, gx, 1.2, zc + k * 0.27, gx - s * 0.6, 0.08, zc + k * 0.27, 0.008, 3);
    solid(c, gx - s * 0.3, zc, 0.7, 1.9, 1.2, 'zarya-goal', { shots: false, kind: 'none', surface: 'metal' });
  }
  for (const [x, z, a] of [[49.2, -116.4, 0.5], [52.4, -113.2, 2.1], [46.4, -118.6, -0.4]] as const) {
    box(b, Z.woodPale, x, 0.075, z, 1.25, 0.03, 0.04, a, false);
    box(b, Z.woodPale, x + Math.cos(a) * 0.72, 0.075, z - Math.sin(a) * 0.72, 0.06, 0.03, 0.3, a + 0.35, false);
  }
  cyl(b, Z.black, 49.9, 0.06, -115.6, 0.07, 0.07, 0.04, 8, false);
  lantern(c, 50, z0 - 1.1, false);
}

function pond(c: Ctx): void {
  const { b } = c;
  disc(b, Z.ice, PO.x, 0.05, PO.z, PO.rx, PO.rz, 56);
  const rnd = lcg(77);
  const edgeZ = (x: number, s: 1 | -1): number => PO.z + s * PO.rz * Math.sqrt(Math.max(0, 1 - ((x - PO.x) / PO.rx) ** 2));
  const onRoad = (z: number, pad = 0): boolean => z > ROAD.z0 - pad && z < ROAD.z1 + pad;
  // what the wind has left on the ice: long scratches, drifts of snow
  for (let i = 0; i < 30; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 0.86;
    const x = PO.x + Math.cos(a) * d * PO.rx;
    const z = PO.z + Math.sin(a) * d * PO.rz;
    const len = 2.5 + rnd() * 5;
    const rot = rnd() * Math.PI;
    if (onIce(x + Math.cos(rot) * len * 0.5, z - Math.sin(rot) * len * 0.5) > 0.97 || onIce(x - Math.cos(rot) * len * 0.5, z + Math.sin(rot) * len * 0.5) > 0.97) continue;
    box(b, i % 3 ? CRACK : Z.white, x, 0.058, z, len, 0.004, i % 3 ? 0.05 : 0.04, rot, false);
    if (i % 2) box(b, CRACK, x + Math.cos(rot) * len * 0.3 + Math.sin(rot) * 0.9, 0.058, z - Math.sin(rot) * len * 0.3 + Math.cos(rot) * 0.9, 2.2, 0.004, 0.04, rot + 0.9, false);
  }
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 0.25 + Math.sqrt(rnd()) * 0.62;
    const x = PO.x + Math.cos(a) * d * PO.rx;
    const z = PO.z + Math.sin(a) * d * PO.rz;
    const rx = 1.4 + rnd() * 3.2;
    const rz = 0.7 + rnd() * 1.5;
    if (onRoad(z, 3.6) || Math.hypot(x - BANYA.cross.x, z - BANYA.cross.z) < 9 || (x > 40 && x < 60 && z > -123 && z < -109)) continue;
    if (BANYA.holes.some((h) => Math.hypot(h.x - x, h.z - z) < rx + 1)) continue;
    disc(b, i % 3 ? Z.snow : Z.snowBlue, x, 0.066, z, rx, rz, 10, rnd() * Math.PI);
  }
  // the winter road across: packed snow between the two banks, marked with sticks and red rags
  groundRect(b, Z.packed, PO.x - PO.rx + 0.6, ROAD.z0, PO.x + PO.rx - 0.6, ROAD.z1, 0.082);
  for (let x = 36, k = 0; x <= 88; x += 6.5, k++) {
    const z = k % 2 ? ROAD.z1 + 0.5 : ROAD.z0 - 0.5;
    if (Math.abs(x - BANYA.cross.x) < 5 && z < -133) continue;
    rod(b, Z.woodDark, x, 0.05, z, x + 0.06, 1.6, z, 0.022, 4);
    box(b, Z.red, x + 0.16, 1.45, z, 0.26, 0.16, 0.015, 0, false);
    solid(c, x, z, 0.2, 0.2, 1.6, 'zarya-stick', { shots: false, kind: 'none', surface: 'wood' });
  }
  lantern(c, 40, ROAD.z0 - 0.9, false);
  lantern(c, 84, ROAD.z1 + 0.9, false);
  // the trail the bathers have trodden from the jetty's end to the ice-hole's steps
  {
    const x0 = BANYA.jetty.x0 - 0.4;
    const z0 = (BANYA.jetty.z0 + BANYA.jetty.z1) / 2;
    const x1 = BANYA.iceHole.x + 2.2;
    const z1 = BANYA.iceHole.z + 1.4;
    box(b, Z.packed, (x0 + x1) / 2, 0.078, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0), 0.004, 1.3, Math.atan2(-(z1 - z0), x1 - x0), false);
  }

  // ---- the banks: snow heaped round the ice, reeds standing out of it (left open where a way comes down) ----
  const N = 66;
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    const out = 1.5 + rnd() * 1.3;
    const x = PO.x + Math.cos(a) * (PO.rx + out);
    const z = PO.z + Math.sin(a) * (PO.rz + out);
    const open = onRoad(z, 2.6) || (x > 86 && Math.abs(z + 149.25) < 3.9) || (Math.abs(x - 76) < 3.6 && z > -112);
    const r = 2.0 + rnd() * 1.6;
    const k = rnd();
    const hh = 0.4 + rnd() * 0.45;
    if (open) continue;
    // long along the shore, short across it
    mound(b, x, z, r, hh, Math.atan2(-PO.rz * Math.cos(a), -PO.rx * Math.sin(a)), 0.55 + rnd() * 0.25, i % 5 === 1 ? Z.snowBlue : Z.snow);
    if (k < 0.6) reeds(b, x - Math.cos(a) * 1.5, z - Math.sin(a) * 1.5, 8 + Math.floor(rnd() * 6), 1.4, rnd);
  }
  // the south shore is thick with them, either side of the way down from the tram stop
  for (let x = 38; x < 92; x += 2.7) {
    if (Math.abs(x - 76) < 3.2) continue;
    const z = edgeZ(x, 1);
    reeds(b, x + (rnd() - 0.5) * 1.6, z + 1.2 + rnd() * 3.2, 8 + Math.floor(rnd() * 6), 1.3, rnd);
  }

  iceHole(c);
  BANYA.holes.forEach((h, i) => fishing(c, h, i));
  jetty(c);
  hockey(c);
  // lanterns by the tents, sledges on the ice
  lantern(c, 60.6, -170.4, true);
  for (const [x, z] of [[50.6, -161.4], [77.4, -162.6], [39.6, -143], [63, -105.6], [79.4, -119.8]] as const) lantern(c, x, z, false);
  sledge(c, 53.4, -166.6, 0.9, 'box');
  sledge(c, 76.6, -156.8, -0.4, 'box');
  sledge(c, 62.2, -112.4, 2.2, 'none');
  sledge(c, 88.6, -121, 1.2, 'box');
  sledge(c, 42.4, -152.6, 0.2, 'logs');
}

// ---------------------------------------------------------------------------------------------------------------------
// the banks, the park, the street
// ---------------------------------------------------------------------------------------------------------------------

/** A rowing boat turned over on the bank for the winter. */
function boat(c: Ctx, x: number, z: number, yaw: number, mat: THREE.Material): void {
  const { b } = c;
  const hull = (m: THREE.Material, sx: number, sy: number, sz: number, y: number): void => {
    const g = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), m);
    g.scale.set(sx, sy, sz);
    g.rotation.y = yaw;
    g.position.set(x, y, z);
    g.castShadow = true;
    g.receiveShadow = true;
    b.add(g);
  };
  hull(mat, 1.9, 0.6, 0.72, 0.02);
  hull(Z.snow, 1.35, 0.64, 0.46, 0.04);
  const at = frame(x, z, yaw);
  const [ax, az] = at(-1.86, 0);
  const [ex, ez] = at(1.86, 0);
  rod(b, Z.woodDark, ax, 0.12, az, ex, 0.12, ez, 0.04, 4);
  solid(c, x, z, 3.6, 1.3, 0.62, 'zarya-boat', { rot: yaw, shots: false, kind: 'none', surface: 'wood' });
}

function boatStation(c: Ctx): void {
  const { b } = c;
  // the boat station's hut on the south-west bank: shut for the winter, a lamp left on inside
  const x = 33.5;
  const z = -95;
  box(b, Z.wood, x, 1.3, z, 4.4, 2.6, 3.2);
  for (const s of [-1, 1]) {
    slab(b, Z.woodDark, x, 3.0, z + s * 0.95, 5, 0.1, 2.3, s * 0.45, 0, 0);
    slab(b, Z.snow, x, 3.13, z + s * 0.93, 4.9, 0.16, 2.2, s * 0.45, 0, 0, false);
    box(b, Z.wood, x + s * 2.2, 2.85, z, 0.06, 0.6, 2.1, 0, false);
  }
  for (let k = 0; k < 9; k++) box(b, Z.woodDark, x - 2.0 + k * 0.5, 1.3, z - 1.61, 0.03, 2.6, 0.02, 0, false);
  box(b, Z.blue, x - 0.9, 1.05, z - 1.62, 0.95, 2.1, 0.05, 0, false);
  box(b, Z.warm, x + 1.0, 1.6, z - 1.62, 0.9, 0.8, 0.04, 0, false);
  box(b, Z.woodDark, x + 1.0, 1.6, z - 1.64, 0.06, 0.8, 0.04, 0, false);
  box(b, Z.snow, x + 1.0, 1.17, z - 1.72, 1.1, 0.08, 0.2, 0, false);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 12), Z.red);
  ring.position.set(x + 2.24, 1.6, z + 0.4);
  ring.rotation.y = Math.PI / 2;
  ring.receiveShadow = true;
  b.add(ring, { cast: false });
  for (let k = 0; k < 4; k++) box(b, Z.white, x + 2.24, 1.6 + Math.sin(k * 1.571) * 0.3, z + 0.4 + Math.cos(k * 1.571) * 0.3, 0.19, 0.14, 0.14, 0, false);
  // oars leant against its east wall
  for (const dz of [-0.9, -0.6, -0.3]) {
    rod(b, Z.woodPale, x + 2.75, 0.05, z + dz, x + 2.28, 2.5, z + dz, 0.03, 5);
    slab(b, dz === -0.6 ? Z.red : Z.woodPale, x + 2.22, 2.75, z + dz, 0.03, 0.7, 0.16, 0, 0, 0.18, false);
  }
  solid(c, x, z, 4.6, 3.4, 3, 'zarya-hut', { kind: 'building', surface: 'wood' });
  solid(c, x + 2.6, z - 0.6, 0.6, 1, 2.6, 'zarya-oars', { shots: false, kind: 'none', surface: 'wood' });
  b.glow({ x: x + 1.0, y: 1.6, z: z - 1.9, color: 0xffb060, size: 1.6, intensity: 1.6, mode: 'steady' });
  boat(c, 39.6, -100.4, 0.5, Z.blue);
  boat(c, 43.6, -97.6, -0.25, Z.greenDark);
  boat(c, 36, -105.4, 1.2, Z.redDark);
  lantern(c, 37.6, -97.2, false);
}

/** The park's statue: the girl with an oar, in plaster, on her plinth in a round bed of snow. */
function statue(c: Ctx, x: number, z: number): void {
  const { b } = c;
  disc(b, Z.packed, x, 0.013, z, 6.2, 6.2, 24);
  cyl(b, Z.concrete, x, 0, z, 3.2, 3.2, 0.32, 18);
  cyl(b, Z.snow, x, 0.32, z, 3.05, 2.5, 0.22, 18, false);
  cyl(b, Z.concrete, x, 0.3, z, 0.95, 0.85, 1.4, 8);
  cyl(b, Z.concrete, x, 1.7, z, 1.05, 1.05, 0.14, 8);
  cyl(b, Z.snow, x, 1.84, z, 1.0, 0.8, 0.08, 8, false);
  const y = 1.86;
  for (const s of [-1, 1]) cyl(b, Z.white, x + s * 0.11, y, z, 0.085, 0.12, 0.98, 6);
  cyl(b, Z.white, x, y + 0.9, z, 0.23, 0.19, 0.34, 8);
  cyl(b, Z.white, x, y + 1.24, z, 0.16, 0.2, 0.5, 8);
  cyl(b, Z.white, x, y + 1.74, z, 0.06, 0.06, 0.1, 6);
  orb(b, Z.white, x, y + 1.97, z, 0.14);
  // one hand on her hip, the other holding the oar upright
  rod(b, Z.white, x - 0.2, y + 1.68, z, x - 0.46, y + 1.3, z + 0.04, 0.05, 5);
  rod(b, Z.white, x - 0.46, y + 1.3, z + 0.04, x - 0.2, y + 1.08, z + 0.1, 0.045, 5);
  rod(b, Z.white, x + 0.2, y + 1.68, z, x + 0.52, y + 1.34, z + 0.1, 0.05, 5);
  rod(b, Z.white, x + 0.54, y, z + 0.12, x + 0.54, y + 2.3, z + 0.12, 0.03, 5);
  box(b, Z.white, x + 0.54, y + 2.62, z + 0.12, 0.2, 0.7, 0.04, 0, false);
  orb(b, Z.snow, x, y + 2.09, z, 0.12, 0.5, 6);
  for (const s of [-1, 1]) orb(b, Z.snow, x + s * 0.19, y + 1.76, z, 0.08, 0.5, 5);
  solid(c, x, z, 5.4, 5.4, 0.55, 'zarya-bed', { shots: false, kind: 'none' });
  solid(c, x, z, 2, 2, 4.4, 'zarya-statue', { kind: 'prop' });
}

function park(c: Ctx): void {
  const { b } = c;
  const sx = 124;
  const sz = -107;
  statue(c, sx, sz);
  bench(c, sx + 5, sz, Math.PI / 2);
  bench(c, sx - 5, sz, -Math.PI / 2);
  bench(c, sx + 3.6, sz + 3.6, Math.PI * 0.75);
  bench(c, sx - 3.6, sz + 3.6, -Math.PI * 0.75);
  lampPost(c, sx - 4, sz - 4.6, true);
  lampPost(c, sx + 4.2, sz - 4.4, false);
  const trees: readonly (readonly [number, number, number])[] = [[112, -118, 7], [136, -119, 8], [110, -98, 7.5], [138.5, -96, 7], [132, -114, 6.5], [116, -93.5, 6], [142, -108, 7.5], [108.5, -109, 6.5]];
  trees.forEach(([x, z, h], i) => bareTree(c, x, z, h, 30 + i));
  fir(c, 115.5, -122, 6.5);
  fir(c, 141, -122.5, 5.5);
  fir(c, 133, -93, 6);
  fir(c, 106.6, -92.4, 5);
  snowman(c, 130.5, -99, -0.6);
  sledge(c, 118.2, -100.6, 1.0, 'none');
  for (const [x, z, r] of [[114, -105, 2.6], [135, -105, 3], [127, -120, 2.4], [140, -114, 2.2], [112, -124.6, 2], [130, -90.6, 2.4]] as const) mound(b, x, z, r, r * 0.2, x * 0.7, 0.7);
}

/** The tram street along the south, the stop's shelter, the bank between the street and the pond. */
function street(c: Ctx): void {
  const { b } = c;
  const s = { x: 76, z: -75.6 };
  box(b, Z.snow, s.x, 2.78, s.z, 7.4, 0.2, 2.6, 0, false);
  box(b, Z.woodDark, s.x, 2.64, s.z, 7.2, 0.1, 2.4);
  for (const dx of [-3.4, 0, 3.4]) {
    for (const dz of [-1, 1]) box(b, Z.woodDark, s.x + dx, 1.3, s.z + dz, 0.14, 2.6, 0.14);
    solid(c, s.x + dx, s.z - 1, 0.2, 0.2, 2.6, 'zarya-post', { kind: 'none', surface: 'wood' });
  }
  box(b, Z.snowBlue, s.x, 1.45, s.z + 1.05, 6.8, 1.7, 0.06);
  box(b, Z.wood, s.x, 0.5, s.z + 0.6, 5, 0.08, 0.5);
  for (const dx of [-2.2, 2.2]) box(b, Z.iron, s.x + dx, 0.24, s.z + 0.6, 0.07, 0.48, 0.46, 0, false);
  box(b, Z.warm, s.x, 2.56, s.z, 3, 0.03, 0.2, 0, false);
  solid(c, s.x, s.z + 0.85, 6.8, 0.7, 2.6, 'zarya-stop', { kind: 'prop', surface: 'wood' });
  b.glow({ x: s.x, y: 2.4, z: s.z, color: 0xffc27a, size: 1.6, intensity: 1.6, mode: 'steady' });
  // a litter bin, the street's lamps
  cyl(b, Z.iron, s.x + 4.6, 0, s.z - 0.6, 0.26, 0.3, 0.8, 8);
  cyl(b, Z.snow, s.x + 4.6, 0.8, s.z - 0.6, 0.26, 0.16, 0.1, 8, false);
  solid(c, s.x + 4.6, s.z - 0.6, 0.6, 0.6, 0.8, 'zarya-bin', { shots: false, kind: 'none', surface: 'metal' });
  lampPost(c, 36, -89.7, false);
  lampPost(c, 104.6, -89.7, true);
  lampPost(c, 137, -89.7, false);
  lampPost(c, 27, -135.4, true);
  // snow ploughed up against the south wall
  for (let x = R.x0 + 7.5, k = 0; x < R.x1 - 2; x += 12, k++) {
    if (Math.abs(x - s.x) < 9) continue;
    slab(b, Z.snow, x, 0.2, R.z1 - 2.5, 12.6, 0.8, 2.6, 0.12, 0.02 * (k % 2 ? 1 : -1), 0, false);
  }
  // the bank between the street and the pond: bare trees, benches looking out over the ice, lanterns down the path
  const trees: readonly (readonly [number, number, number])[] = [[46, -92.4, 7], [58, -94, 6.5], [69, -92, 7.5], [86, -93, 7], [93, -98, 6], [31, -112, 6.5]];
  trees.forEach(([x, z, h], i) => bareTree(c, x, z, h, 60 + i));
  fir(c, 52, -96.5, 5);
  fir(c, 81.5, -97.5, 5.5);
  fir(c, 30.6, -120.5, 6);
  bench(c, 70, -98.4, 0);
  bench(c, 82.4, -101.4, 0.25);
  lantern(c, 73.6, -100.6, false);
  lantern(c, 78.4, -94, false);
  sledge(c, 79.4, -90.6, 0.2, 'none');
  // the west bank: firs between the wall and the ice
  for (const [x, z, h] of [[24.6, -171, 8], [26, -159, 6.5], [24.4, -147, 7.5], [25.4, -139.6, 5]] as const) fir(c, x, z, h);
  bench(c, 27.4, -152.6, -Math.PI / 2);
}

/** The north: a board fence, and the forest behind it going on to the edge of the map (nobody gets in there). */
function northEdge(c: Ctx): void {
  const { b } = c;
  const x0 = R.x0 + 1.5;
  const x1 = R.x1 - 1.5;
  const xm = (x0 + x1) / 2;
  box(b, Z.woodDark, xm, 0.95, FENCE_Z, x1 - x0, 1.7, 0.08);
  for (const y of [0.5, 1.5]) box(b, Z.wood, xm, y, FENCE_Z + 0.07, x1 - x0, 0.1, 0.06, 0, false);
  box(b, Z.snow, xm, 1.84, FENCE_Z, x1 - x0, 0.09, 0.2, 0, false);
  for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 36) {
    box(b, Z.wood, x, 1.0, FENCE_Z + 0.04, 0.16, 2.0, 0.16);
    box(b, Z.snow, x, 2.04, FENCE_Z + 0.04, 0.22, 0.08, 0.22, 0, false);
  }
  for (let x = x0 + 0.4; x < x1; x += 0.8) box(b, Z.black, x, 0.95, FENCE_Z + 0.045, 0.025, 1.7, 0.01, 0, false);
  solid(c, (R.x0 + R.x1) / 2, (R.z0 + FENCE_Z) / 2 - 0.05, R.x1 - R.x0, FENCE_Z - R.z0 + 0.1, 3, 'zarya-beyond', { kind: 'none' });
  const rnd = lcg(404);
  for (let x = x0 + 2; x < x1 - 1; x += 5.2 + rnd() * 2.6) firTree(b, x, FENCE_Z - 2.6 - rnd() * 3.6, 6.5 + rnd() * 4.5);
  for (let x = x0 + 5; x < x1 - 1; x += 9 + rnd() * 5) firTree(b, x, FENCE_Z - 6.6 - rnd() * 1.6, 9 + rnd() * 3);
}

export function buildBanya(c: Ctx): BanyaHandles {
  const { b } = c;
  const e = 1.5;
  // ---- the ground: snow, the tram street, the winter road from gate to gate, the lanes and paths between ----
  groundRect(b, Z.snow, R.x0, R.z0, R.x1, R.z1, 0.004);
  groundRect(b, Z.packed, R.x0 + e, -88, R.x1 - e, -74, 0.009);
  groundRect(b, Z.packed, R.x0, ROAD.z0, PO.x - PO.rx + 1.6, ROAD.z1, 0.012);
  groundRect(b, Z.packed, PO.x + PO.rx - 1.6, ROAD.z0, R.x1, ROAD.z1, 0.012);
  groundRect(b, Z.packed, 97, ROAD.z1, 103, -88, 0.012); // the lane from the road down to the street
  groundRect(b, Z.packed, R.x0 + e, ROAD.z1, 28, -88, 0.012); // and the one inside the west wall
  groundRect(b, Z.packed, 74.5, -104, 77.5, -88, 0.012); // from the tram stop down onto the ice
  groundRect(b, Z.packed, D.x - 1.5, H.z1 + 3, D.x + 1.5, ROAD.z0, 0.012); // from the road to the bathhouse door
  groundRect(b, Z.packed, 104, H.z1, 116, H.z1 + 3.6, 0.011);
  groundRect(b, Z.packed, BANYA.jetty.x1, BANYA.jetty.z0, 105, BANYA.jetty.z1, 0.012); // and from the door to the jetty
  groundRect(b, Z.packed, 122.5, ROAD.z1, 125.5, -88, 0.012); // through the park, past the statue

  shellOfHouse(c);
  changingRoom(c);
  washingRoom(c);
  steamRoom(c);
  grounds(c);
  pond(c);
  boatStation(c);
  park(c);
  // a shut kiosk, its shutter bought open with points (`zarya/mods.ts`, `zaryaShutters.ts`)
  shutterKiosk(c, BANYA.shutter, BANYA.shutterYaw, 4);
  street(c);
  northEdge(c);
  return {};
}
