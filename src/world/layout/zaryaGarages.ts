/**
 * ZARYA: the GARAGES (`zarya/zones/garages.ts`), built from the `ga-*` reference views: four rows of steel garages two
 * deep under snow, three lanes between them and a ring lane round the outside, two cross-lanes, the heating main in
 * foil along the roofs and over the lanes, five garages standing open (Timur's workshop, the Institute's crates, a
 * builder's, a plumber's, a welder's) and the watchman's yard at the east end.
 *
 * A row is a few long boxes with its doors drawn on them: an open garage is a gap left between two of the boxes, so
 * its side walls and its back wall are the row's own.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import { groundRect } from '../structures';
import type { Ctx } from './util';
import { GARAGES, type GarageBay } from '../../zarya/zones/garages';
import { Z as K, ball as kball, box as kbox, cyl as kcyl, goods, lampPost, slab as kslab, solid } from './zaryaKit';

const G = GARAGES;
const R = G.rect;
/** A garage's eaves, its depth, and the top of the snow on its roof. */
const H = 2.7;
const D = 6;
const ROOF = H + 0.4;
/** The inner faces of the zone's walls: the frame's on the north and west, this file's fences on the east and south. */
const WX = R.x0 + 0.2;
const NZ = R.z0 + 0.2;
const EX = R.x1 - 1.9;
const SZ = R.z1 - 1.9;
/** The rows' two ends. */
const RX0 = G.blocks[0]![0];
const RX1 = G.blocks[2]![0] + G.blocks[2]![1] * G.blocks[2]![2];

/**
 * Two finishes for the whole zone, a matte one and a metal one: the level builder draws every plain colour of one
 * finish in one call per chunk, so the kit's colours are taken here at the kit's own most common roughness (and its
 * iron's metal), and two hundred painted doors cost what one does.
 */
const matte = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
const metal = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.5 });
const Z = {
  snow: matte(0xa9b6cc),
  packed: K.packed,
  concrete: K.concrete,
  concreteDark: K.concreteDark,
  black: K.black,
  cream: matte(0xd8cfb8),
  white: matte(0xe9e6de),
  wood: matte(0x7b5a3a),
  woodDark: matte(0x4d3725),
  woodPale: matte(0xa98a5f),
  red: matte(0xb3261e),
  redDark: matte(0x7a1c18),
  blue: matte(0x2f4f8f),
  fir: matte(0x1f3d2b),
  orange: matte(0xe08a1e),
  grey: matte(0x8a8f98),
  iron: K.iron,
  steel: metal(0x59626e),
  bulb: K.bulb,
  warm: K.warm,
  redLamp: K.redLamp,
};
/** Colours a jar lid, a screwdriver's handle or a bauble can be (the fourth is brass). */
const GOODS = [0xb3261e, 0x2f4f8f, 0x4f6f52, 0xd6aa3c, 0x7a3f6a, 0xd8cfb8, 0x3c6f8a, 0xe08a1e].map(matte);
/** The garages' painted steel, and the colours their doors were painted over the years. */
const PANEL = matte(0x626b77);
const RUST = matte(0x7d4a2a);
const OCHRE = matte(0xa9792f);
const TEAL = matte(0x2e5c58);
const SLATE = matte(0x46505e);
const MOSS = matte(0x3f5a40);
const RUT = matte(0x7e8aa2);
const DOORS: readonly THREE.Material[] = [Z.redDark, Z.blue, SLATE, RUST, MOSS, Z.redDark, SLATE, OCHRE, TEAL, Z.blue, RUST, SLATE];
/** Foil lagging on the heating main. */
const FOIL = metal(0xb2bac4);
/** Everything metal casts a shadow and everything that glows takes none, as the kit's lamp posts do: one batch of each. */
const METAL = new Set<THREE.Material>([Z.iron, Z.steel, FOIL]);
const GLOW = new Set<THREE.Material>([Z.bulb, Z.warm, Z.redLamp]);

function box(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0, cast = true): void {
  kbox(b, mat, x, y, z, sx, sy, sz, rot, METAL.has(mat) || cast);
}
function cyl(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8, cast = true): void {
  kcyl(b, mat, x, y, z, r0, r1, h, seg, METAL.has(mat) || cast);
}
function slab(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number, cast = true): void {
  kslab(b, mat, x, y, z, sx, sy, sz, rx, ry, rz, METAL.has(mat) || cast);
}
function ball(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 8): void {
  if (GLOW.has(mat)) return kball(b, mat, x, y, z, r, sy, seg);
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)), mat);
  m.position.set(x, y, z);
  m.scale.y = sy;
  b.add(m, { cast: METAL.has(mat), receive: true });
}
const PIPE_R = 0.22;
const PIPE_GAP = 0.3;
const PIPE_Y = 3.45;
const TRUNK_Y = 4.3;

const lcg = (seed: number): (() => number) => {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const UP = new THREE.Vector3(0, 1, 0);
/** A round bar between two points (a pipe, an axle, a wheel when it is short and fat). */
function tube(b: LevelBuilder, mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, seg = 8, cast = false): void {
  const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  m.castShadow = METAL.has(mat) || cast;
  m.receiveShadow = true;
  b.add(m);
}

/** A way of placing the parts of something that stands at (x, z) turned by `yaw`: `at(dx, dz)` is a point of it, `part` a box of it. */
function frame(b: LevelBuilder, x: number, z: number, yaw: number) {
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const at = (dx: number, dz: number): [number, number] => [x + dx * cs + dz * sn, z - dx * sn + dz * cs];
  const part = (mat: THREE.Material, dx: number, y: number, dz: number, sx: number, sy: number, sz: number, cast = true): void => {
    const [px, pz] = at(dx, dz);
    box(b, mat, px, y, pz, sx, sy, sz, yaw, cast);
  };
  /** A wheel (or any disc) on an axle across the thing. */
  const wheel = (mat: THREE.Material, dx: number, y: number, dz: number, r: number, w: number, seg = 12): void => {
    const [ax, az] = at(dx, dz - w / 2);
    const [bx, bz] = at(dx, dz + w / 2);
    tube(b, mat, ax, y, az, bx, y, bz, r, seg, true);
  };
  return { at, part, wheel };
}

// ---------------------------------------------------------------------------------------------------------------------
// the ground, the fences
// ---------------------------------------------------------------------------------------------------------------------

function ground(c: Ctx): void {
  const { b } = c;
  groundRect(b, Z.snow, R.x0, R.z0, R.x1, R.z1, 0.004);
  // the lanes trodden grey down their middles: five east to west, and the ways between them
  const lanes: readonly (readonly [number, number, number])[] = [
    [NZ + 3.4, G.rows[0]! - D - 1.4, WX + 2.8],
    [G.rows[0]! + D + 1.4, G.rows[1]! - D - 1.4, WX + 2.8],
    [G.rows[1]! + D + 1.4, G.rows[2]! - D - 1.4, WX],
    [G.rows[2]! + D + 1.4, G.rows[3]! - D - 1.4, WX + 2.8],
    [G.rows[3]! + D + 1.4, SZ - 1.7, WX + 2.8],
  ];
  for (const [z0, z1, x0] of lanes) groundRect(b, Z.packed, x0, z0, EX - 3.1, z1, 0.012);
  const ways: readonly (readonly [number, number])[] = [[WX + 2.8, RX0 - 1.2], [149.4, 154.6], [193.4, 198.6], [RX1 + 2, EX - 3.1]];
  for (let i = 0; i < lanes.length - 1; i++) for (const [x0, x1] of ways) groundRect(b, Z.packed, x0, lanes[i]![1], x1, lanes[i + 1]![0], 0.012);
  // from the north gate down to the ring lane
  groundRect(b, Z.packed, 193.4, NZ, 198.6, lanes[0]![0], 0.012);
  // the ruts of whatever drove in last: from the west gate to the yard, from the north gate to the middle lane
  for (const d of [-0.75, 0.75]) {
    groundRect(b, RUT, WX, 122 + d - 0.12, RX1 + 9, 122 + d + 0.12, 0.018);
    groundRect(b, RUT, 196 + d - 0.12, NZ, 196 + d + 0.12, 122.87, 0.018);
  }
}

function fences(c: Ctx): void {
  const { b } = c;
  // the cooperative's own fence on the east and south: the same grey slabs as the town's walls, a post every six metres
  const zm = (NZ + SZ) / 2 + 0.2;
  const zl = SZ - NZ + 0.4;
  box(b, Z.concreteDark, EX + 0.2, 1.5, zm, 0.4, 3, zl);
  box(b, Z.snow, EX + 0.2, 3.07, zm, 0.54, 0.14, zl, 0, false);
  for (let z = NZ + 3; z < SZ; z += 6) box(b, Z.concrete, EX + 0.05, 1.55, z, 0.3, 3.1, 0.5, 0, false);
  solid(c, (EX + R.x1) / 2, (R.z0 + R.z1) / 2, R.x1 - EX, R.z1 - R.z0, 3, 'zarya-border', { kind: 'wall' });
  const xm = (WX + EX) / 2;
  const xl = EX - WX;
  box(b, Z.concreteDark, xm, 1.5, SZ + 0.2, xl, 3, 0.4);
  box(b, Z.snow, xm, 3.07, SZ + 0.2, xl, 0.14, 0.54, 0, false);
  for (let x = WX + 3; x < EX; x += 6) box(b, Z.concrete, x, 1.55, SZ + 0.05, 0.5, 3.1, 0.3, 0, false);
  solid(c, (R.x0 + EX) / 2, (SZ + R.z1) / 2, EX - R.x0, R.z1 - SZ, 3, 'zarya-border', { kind: 'wall' });
  // snow banked along them
  const rnd = lcg(5);
  for (let x = WX + 5; x < EX - 4; x += 8 + rnd() * 9) bank(b, x, SZ - 0.3, 5 + rnd() * 5, 1.3);
  for (let z = NZ + 8; z < SZ - 4; z += 10 + rnd() * 8) bank(b, EX - 0.3, z + 3, 1.3, 4 + rnd() * 4);
}

/** Snow thrown up against a wall: a run of low heaps nobody minds walking through (`w` along x, `d` along z). */
function bank(b: LevelBuilder, x: number, z: number, w: number, d: number): void {
  const alongX = w > d;
  const len = Math.max(w, d);
  const r = Math.min(w, d) * 0.75;
  const n = Math.max(2, Math.round(len / (r * 1.1)));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    ball(b, Z.snow, x + (alongX ? t * len : 0), 0, z + (alongX ? 0 : t * len), r * (0.8 + ((i * 7) % 4) * 0.1), 0.42 + ((i * 5) % 3) * 0.08, 8);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the rows
// ---------------------------------------------------------------------------------------------------------------------

/** One garage's door, on a row's face at z = `zf` looking `s` (+1 south, -1 north). */
function door(b: LevelBuilder, x: number, zf: number, s: 1 | -1, w: number, mat: THREE.Material): void {
  const dw = w - 0.9;
  box(b, mat, x, 1.2, zf + s * 0.05, dw, 2.3, 0.1, 0, false);
  box(b, Z.black, x, 1.2, zf + s * 0.105, 0.04, 2.3, 0.02, 0, false);
  for (const y of [0.62, 1.78]) box(b, Z.iron, x, y, zf + s * 0.11, dw, 0.06, 0.03, 0, false);
  box(b, Z.iron, x + 0.16, 1.2, zf + s * 0.13, 0.1, 0.18, 0.06, 0, false);
  // its number plate, on the band over the door
  box(b, Z.white, x, H - 0.17, zf + s * 0.11, 0.34, 0.18, 0.02, 0, false);
}

/** A door leaf swung right back against the row's face beside an open garage (`dir`: the way it lies from its hinge). */
function leaf(b: LevelBuilder, hinge: number, zf: number, s: 1 | -1, dir: 1 | -1, mat: THREE.Material): void {
  const x = hinge + dir * 0.95;
  box(b, mat, x, 1.2, zf + s * 0.17, 1.7, 2.3, 0.06, 0, false);
  for (const y of [0.62, 1.78]) box(b, Z.iron, x, y, zf + s * 0.21, 1.7, 0.06, 0.03, 0, false);
}

/** Is this point clear of the open garages' mouths, the main's posts and the things that stand in the lanes (so something can be left there)? */
function clearOf(x: number, z: number): boolean {
  for (const q of Object.values(G.bays)) if (x > q.x0 - 2.4 && x < q.x1 + 2.4 && z > q.z0 - 1.5 && z < q.z1 + 1.5) return false;
  for (const px of [144.3, 181.2, 203.5]) if (Math.abs(x - px) < 1.2) return false;
  for (const [kx, kz, r] of [[G.table.x, G.table.z, 3.4], [153.7, 96, 3], [G.cover[0]!.x, G.cover[0]!.z, 2.6]] as const) if (Math.hypot(x - kx, z - kz) < r) return false;
  return true;
}

function row(c: Ctx, ri: number): void {
  const { b } = c;
  const zc = G.rows[ri]!;
  const rnd = lcg(31 + ri * 17);
  const all = Object.values(G.bays);
  G.blocks.forEach(([x0, n, gw]) => {
    const x1 = x0 + n * gw;
    const len = x1 - x0;
    const xm = (x0 + x1) / 2;
    const bays = all.filter((q) => q.x0 > x0 - 0.01 && q.x1 < x1 + 0.01 && q.z0 > zc - D - 0.01 && q.z1 < zc + D + 0.01);
    // the body: full depth where every garage is shut, half depth behind an open one
    const cuts = [x0, ...bays.flatMap((q) => [q.x0, q.x1]), x1].sort((p, q) => p - q);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i]!;
      const e = cuts[i + 1]!;
      if (e - a < 0.05) continue;
      const bay = bays.find((q) => q.x0 < a + 0.01 && q.x1 > e - 0.01);
      const z0 = bay?.face === -1 ? zc : zc - D;
      const z1 = bay?.face === 1 ? zc : zc + D;
      box(b, PANEL, (a + e) / 2, H / 2, (z0 + z1) / 2, e - a, H, z1 - z0);
      solid(c, (a + e) / 2, (z0 + z1) / 2, e - a, z1 - z0, H, 'zarya-garage', { kind: 'building', surface: 'metal' });
    }
    // the roof, and the snow on it
    box(b, Z.concreteDark, xm, H + 0.07, zc, len + 0.5, 0.14, 2 * D + 0.6);
    box(b, Z.snow, xm, H + 0.27, zc, len + 0.4, 0.26, 2 * D + 0.5, 0, false);
    // its two ends: a plinth, the band carried round, the piers between its panels, snow sagging over
    for (const [ex, s] of [[x0, -1], [x1, 1]] as const) {
      box(b, Z.concreteDark, ex + s * 0.05, 0.25, zc, 0.1, 0.5, 2 * D, 0, false);
      box(b, Z.concreteDark, ex + s * 0.05, H - 0.17, zc, 0.1, 0.34, 2 * D, 0, false);
      for (const dz of [-3, 0, 3]) box(b, Z.concrete, ex + s * 0.06, H / 2, zc + dz, 0.12, H, 0.22, 0, false);
      box(b, Z.snow, ex + s * 0.3, H + 0.2, zc + (rnd() - 0.5) * 6, 0.5, 0.24, 3 + rnd() * 3, 0, false);
    }
    for (const s of [-1, 1] as const) {
      const zf = zc + s * D;
      // the band along the eaves, a pier between each two garages
      box(b, Z.concreteDark, xm, H - 0.17, zf + s * 0.05, len, 0.34, 0.1, 0, false);
      for (let k = 0; k <= n; k++) {
        const x = x0 + k * gw;
        if (bays.some((q) => q.face === s && x > q.mouth[0] + 0.01 && x < q.mouth[1] - 0.01)) continue;
        box(b, Z.concrete, x, H / 2, zf + s * 0.06, 0.26, H, 0.12, 0, false);
      }
      for (let k = 0; k < n; k++) {
        const x = x0 + (k + 0.5) * gw;
        const paint = DOORS[Math.floor(rnd() * DOORS.length)]!;
        const what = rnd();
        const jitter = rnd();
        // snow sagging over the eaves
        if (jitter < 0.7) box(b, Z.snow, x + (jitter - 0.35) * 2, H + 0.2, zf + s * 0.3, 1.2 + jitter * 2, 0.2 + jitter * 0.12, 0.5, 0, false);
        if (k % 3 === 1) {
          cyl(b, Z.iron, x, ROOF - 0.05, zc + s * 2.6, 0.07, 0.07, 0.5, 6, false);
          cyl(b, Z.iron, x, ROOF + 0.45, zc + s * 2.6, 0.15, 0.04, 0.1, 6, false);
        }
        if (bays.some((q) => q.face === s && x > q.mouth[0] && x < q.mouth[1])) continue;
        door(b, x, zf, s, gw, paint);
        if (what < 0.17) {
          // a garage nobody has opened this winter
          for (const [dx, r] of [[-0.75, 0.8], [0, 1], [0.8, 0.75]] as const) ball(b, Z.snow, x + dx + (jitter - 0.5) * 0.5, 0, zf + s * (0.25 + r * 0.2), r, 0.4, 8);
        } else if (what > 0.56 && k > 0 && clearOf(x - gw / 2, zf + s * 0.5)) {
          // something left by the pier: tyres, a drum, a box with a shovel stood in the snow beside it
          const px = x - gw / 2;
          const pz = zf + s * 0.52;
          if (what < 0.7) {
            tyres(c, px, pz, 2 + Math.floor(jitter * 3));
          } else if (what < 0.82) {
            drum(b, px, pz, DOORS[Math.floor(jitter * DOORS.length)]!);
            solid(c, px, pz, 0.6, 0.6, 0.9, 'zarya-drums', { shots: false, kind: 'none', surface: 'metal' });
          } else {
            box(b, jitter < 0.5 ? Z.wood : Z.woodPale, px, 0.25, pz, 0.7, 0.5, 0.5);
            box(b, Z.snow, px, 0.54, pz, 0.66, 0.08, 0.46, 0, false);
            slab(b, Z.woodPale, px + 0.6, 0.7, zf + s * 0.2, 0.04, 1.4, 0.04, s * 0.22, 0, 0, false);
            box(b, Z.steel, px + 0.6, 0.16, zf + s * 0.36, 0.3, 0.32, 0.03);
            solid(c, px, pz, 0.7, 0.5, 0.55, 'zarya-crate', { shots: false, kind: 'none', surface: 'wood' });
          }
        } else if (what < 0.3) {
          // a bulb in a cage over the door
          box(b, Z.iron, x - 0.7, H - 0.1, zf + s * 0.2, 0.05, 0.05, 0.3, 0, false);
          ball(b, Z.bulb, x - 0.7, H - 0.22, zf + s * 0.32, 0.09, 1, 6);
          b.glow({ x: x - 0.7, y: H - 0.22, z: zf + s * 0.4, color: 0xffb060, size: 0.8, intensity: 1.8, mode: 'steady' });
        }
      }
    }
  });
}

/** An open garage's own parts: its floor, the boards or plaster on its walls, the shut part of its front, and the roof overhead (which is what says "indoors"). */
function bayShell(c: Ctx, q: GarageBay, liner: THREE.Material, floor: THREE.Material): void {
  const { b } = c;
  const zf = q.face === 1 ? q.z1 : q.z0;
  const zb = q.face === 1 ? q.z0 : q.z1;
  const xm = (q.x0 + q.x1) / 2;
  const zm = (q.z0 + q.z1) / 2;
  const w = q.x1 - q.x0;
  groundRect(b, floor, q.x0, q.z0, q.x1, q.z1, 0.03);
  box(b, liner, xm, H / 2, zb + q.face * 0.03, w, H, 0.06, 0, false);
  for (const x of [q.x0 + 0.03, q.x1 - 0.03]) box(b, liner, x, H / 2, zm, 0.06, H, D - 0.02, 0, false);
  box(b, Z.cream, xm, H - 0.02, zm, w - 0.1, 0.04, D - 0.1, 0, false);
  for (const [a, e] of [[q.x0, q.mouth[0]], [q.mouth[1], q.x1]] as const) {
    if (e - a < 0.1) continue;
    box(b, PANEL, (a + e) / 2, H / 2, zf - q.face * 0.12, e - a, H, 0.24);
    box(b, liner, (a + e) / 2, H / 2, zf - q.face * 0.26, e - a - 0.1, H, 0.04, 0, false);
    solid(c, (a + e) / 2, zf - q.face * 0.12, e - a, 0.24, H, 'zarya-garage', { kind: 'wall', surface: 'metal' });
  }
  b.collide({ x: xm, z: zm, hx: w / 2, hz: D / 2, y0: H, y1: H + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: xm, z: zm, hx: w / 2, hz: D / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });
}

/** A bare bulb on its flex, and the light it gives the room. */
function bulb(c: Ctx, x: number, z: number, intensity: number, pool = 4.5): void {
  const { b } = c;
  cyl(b, Z.black, x, H - 0.4, z, 0.012, 0.012, 0.4, 4, false);
  ball(b, Z.bulb, x, H - 0.46, z, 0.08, 1, 6);
  if (intensity > 0) b.light({ x, y: H - 0.55, z, color: 0xffc98a, intensity, distance: 15, mode: 'steady', pool, glow: 0.7, weight: 1.3 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the heating main
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A run of the main between two points on one axis: two pipes in foil side by side, a strap every few metres, snow
 * along the top of a level run. A riser says which way its two pipes lie apart (`side`).
 */
function duct(b: LevelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: 'x' | 'z' = 'z'): void {
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const vertical = Math.abs(y1 - y0) > 0.01;
  const alongX = Math.abs(x1 - x0) > 0.01;
  const ox = vertical ? (side === 'x' ? PIPE_GAP : 0) : alongX ? 0 : PIPE_GAP;
  const oz = vertical ? (side === 'z' ? PIPE_GAP : 0) : alongX ? PIPE_GAP : 0;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const uz = (z1 - z0) / len;
  const n = Math.floor(len / 2.6);
  for (const s of [-1, 1]) {
    tube(b, FOIL, x0 + s * ox, y0, z0 + s * oz, x1 + s * ox, y1, z1 + s * oz, PIPE_R, 8, true);
    for (let i = 1; i <= n; i++) {
      const t = (i / (n + 1)) * len;
      const px = x0 + s * ox + ux * t;
      const py = y0 + uy * t;
      const pz = z0 + s * oz + uz * t;
      tube(b, Z.grey, px - ux * 0.06, py - uy * 0.06, pz - uz * 0.06, px + ux * 0.06, py + uy * 0.06, pz + uz * 0.06, PIPE_R + 0.025, 8, false);
    }
    if (!vertical) box(b, Z.snow, (x0 + x1) / 2 + s * ox, y0 + PIPE_R, (z0 + z1) / 2 + s * oz, alongX ? len : 0.3, 0.09, alongX ? 0.3 : len, 0, false);
  }
}

/** Where the main turns: a lagged box round the elbows. */
function joint(b: LevelBuilder, x: number, y: number, z: number): void {
  box(b, FOIL, x, y, z, 1.14, 0.56, 1.14);
  box(b, Z.grey, x, y, z, 1.18, 0.08, 1.18, 0, false);
  box(b, Z.snow, x, y + 0.32, z, 1.0, 0.1, 1.0, 0, false);
}

/** A steel post in a lane with a crossarm the main lies on (`alongX`: the way the main runs over it). */
function tpost(c: Ctx, x: number, z: number, y: number, alongX: boolean): void {
  const { b } = c;
  const top = y - PIPE_R - 0.05;
  box(b, Z.concrete, x, 0.12, z, 0.5, 0.24, 0.5, 0, false);
  box(b, Z.iron, x, top / 2, z, 0.16, top, 0.16);
  box(b, Z.iron, x, top, z, alongX ? 0.14 : 1.3, 0.1, alongX ? 1.3 : 0.14);
  for (const s of [-1, 1]) slab(b, Z.iron, x + (alongX ? 0 : s * 0.3), top - 0.36, z + (alongX ? s * 0.3 : 0), 0.06, 0.86, 0.06, alongX ? s * 0.74 : 0, 0, alongX ? 0 : -s * 0.74, false);
  for (let yy = 0.9; yy < top - 0.8; yy += 0.9) box(b, Z.iron, x, yy, z, 0.22, 0.05, 0.22, 0, false);
  solid(c, x, z, 0.3, 0.3, y, 'zarya-post', { kind: 'none', surface: 'metal' });
}

/** A stand on a roof under the main. */
function saddle(b: LevelBuilder, x: number, z: number, y: number, alongX: boolean): void {
  const h = y - PIPE_R - (H + 0.14);
  box(b, Z.iron, x, H + 0.14 + h / 2, z, alongX ? 0.1 : 1.2, h, alongX ? 1.2 : 0.1, 0, false);
}

/** Where the main goes into the ground. */
function riser(c: Ctx, x: number, z: number, y: number, side: 'x' | 'z'): void {
  duct(c.b, x, 0, z, x, y, z, side);
  joint(c.b, x, y, z);
  solid(c, x, z, side === 'x' ? 1.1 : 0.5, side === 'x' ? 0.5 : 1.1, y, 'zarya-pipe', { kind: 'none', surface: 'metal' });
}

function pipes(c: Ctx): void {
  const { b } = c;
  const y = PIPE_Y;
  // along the eaves of the second row, over the middle lane beside Timur's, on along the third row, up and over the
  // cross-lane from the north gate, and across the yard to the east fence
  const za = G.rows[1]! + D - 0.6;
  const zb = G.rows[2]! - D + 0.6;
  const xc = 181.2;
  riser(c, RX0 - 0.7, za, y, 'z');
  duct(b, RX0 - 0.7, y, za, xc, y, za);
  for (let x = RX0 + 3; x < xc - 2; x += 7.4) if (x < 147 || x > 157) saddle(b, x, za, y, true);
  joint(b, xc, y, za);
  duct(b, xc, y, za, xc, y, zb);
  tpost(c, xc, za + 1.35, y, false);
  tpost(c, xc, zb - 1.35, y, false);
  joint(b, xc, y, zb);
  duct(b, xc, y, zb, 191.4, y, zb);
  saddle(b, 186.5, zb, y, true);
  for (const x of [191.4, 200.6]) {
    joint(b, x, y, zb);
    duct(b, x, y, zb, x, 5.3, zb, 'z');
    joint(b, x, 5.3, zb);
  }
  duct(b, 191.4, 5.3, zb, 200.6, 5.3, zb);
  box(b, Z.iron, 196, 5.3 - PIPE_R - 0.1, zb, 9.2, 0.12, 0.9, 0, false);
  duct(b, 200.6, y, zb, EX - 1.5, y, zb);
  for (const x of [206, 212.5, 219]) saddle(b, x, zb, y, true);
  tpost(c, 228, zb, y, true);
  tpost(c, 235.5, zb, y, true);
  riser(c, EX - 1.5, zb, y, 'z');
  // two trunks north to south, over every row and every lane
  for (const x of [144.3, 203.5]) {
    riser(c, x, NZ + 2.1, TRUNK_Y, 'x');
    duct(b, x, TRUNK_Y, NZ + 2.1, x, TRUNK_Y, SZ - 0.8);
    riser(c, x, SZ - 0.8, TRUNK_Y, 'x');
    for (const zc of G.rows) {
      for (const s of [-1, 1]) {
        saddle(b, x, zc + s * 3.4, TRUNK_Y, false);
        tpost(c, x, zc + s * (D + 0.7), TRUNK_Y, false);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// things that stand about
// ---------------------------------------------------------------------------------------------------------------------

/** A saloon car. Stripped: on blocks, no wheels, no glass, its bonnet up. Otherwise shut and snowed in. Its nose points along `yaw`. */
function car(c: Ctx, x: number, z: number, yaw: number, paint: THREE.Material, stripped = false): void {
  const { b } = c;
  const f = frame(b, x, z, yaw);
  const up = stripped ? 0.14 : 0;
  f.part(paint, 0, 0.62 + up, 0, 4.1, 0.56, 1.62);
  f.part(Z.black, 0, 0.32 + up, 0, 3.6, 0.1, 1.5, false);
  f.part(paint, -0.25, 1.39 + up, 0, 1.9, 0.07, 1.46);
  for (const s of [-1, 1]) {
    const [ax, az] = f.at(0.86, s * 0.7);
    slab(b, paint, ax, 1.14 + up, az, 0.07, 0.56, 0.07, 0, yaw, 0.5, false);
    const [cx, cz] = f.at(-1.33, s * 0.7);
    slab(b, paint, cx, 1.14 + up, cz, 0.07, 0.54, 0.07, 0, yaw, -0.42, false);
    f.part(paint, -0.2, 1.14 + up, s * 0.7, 0.07, 0.5, 0.07, false);
    // door seams, a sill
    f.part(Z.black, -0.2, 0.66 + up, s * 0.815, 0.02, 0.44, 0.01, false);
    f.part(Z.steel, 0, 0.4 + up, s * 0.82, 2.4, 0.05, 0.02, false);
  }
  if (stripped) {
    for (const dx of [-1.3, 1.3]) for (const s of [-1, 1]) {
      f.part(Z.concrete, dx, 0.2, s * 0.6, 0.4, 0.4, 0.3);
      f.wheel(Z.iron, dx, 0.5 + up, s * 0.78, 0.13, 0.06, 8);
    }
    // the bonnet up over an engine half taken out, a seat still in it, rust coming through
    f.part(Z.black, 1.5, 0.905 + up, 0, 1.0, 0.02, 1.3, false);
    f.part(Z.iron, 1.42, 0.98 + up, 0.1, 0.5, 0.2, 0.44, false);
    f.part(Z.steel, 1.62, 1.02 + up, -0.36, 0.2, 0.14, 0.2, false);
    const [hx, hz] = f.at(1.33, 0);
    slab(b, paint, hx, 1.36 + up, hz, 1.05, 0.05, 1.52, 0, yaw, 0.9);
    const [px, pz] = f.at(1.78, 0.6);
    slab(b, Z.steel, px, 1.3 + up, pz, 0.02, 0.84, 0.02, 0, yaw, -0.2, false);
    f.part(Z.woodDark, -0.5, 0.98 + up, 0, 0.16, 0.5, 1.3, false);
    f.part(Z.woodDark, -0.2, 0.8 + up, 0, 0.5, 0.12, 1.3, false);
    for (const [dx, y, s, w] of [[-1.5, 0.6, 1, 0.7], [0.6, 0.5, -1, 0.9], [1.6, 0.72, 1, 0.5], [-0.9, 0.48, -1, 0.5]] as const) f.part(RUST, dx, y + up, s * 0.815, w, 0.2, 0.02, false);
    for (const s of [-1, 1]) f.part(Z.black, 2.06, 0.7 + up, s * 0.55, 0.02, 0.22, 0.24, false);
    f.part(Z.steel, -2.1, 0.44 + up, 0, 0.08, 0.1, 1.66, false);
    f.part(Z.snow, -0.25, 1.47 + up, 0, 1.8, 0.1, 1.38, false);
    f.part(Z.snow, -1.7, 0.94 + up, 0, 0.6, 0.08, 1.5, false);
  } else {
    for (const dx of [-1.3, 1.3]) for (const s of [-1, 1]) f.wheel(Z.black, dx, 0.3, s * 0.74, 0.3, 0.2);
    // dark glass along the sides, the screens and everything else under snow, a drift round its wheels
    for (const s of [-1, 1]) f.part(Z.black, -0.25, 1.13, s * 0.71, 1.9, 0.44, 0.03, false);
    const [wx, wz] = f.at(0.9, 0);
    slab(b, Z.snow, wx, 1.14, wz, 0.1, 0.62, 1.4, 0, yaw, 0.5, false);
    const [rx, rz] = f.at(-1.36, 0);
    slab(b, Z.snow, rx, 1.14, rz, 0.1, 0.6, 1.4, 0, yaw, -0.42, false);
    f.part(Z.snow, -0.25, 1.53, 0, 1.86, 0.24, 1.44, false);
    f.part(Z.snow, 1.5, 0.99, 0, 1.06, 0.2, 1.58, false);
    f.part(Z.snow, -1.72, 0.98, 0, 0.64, 0.18, 1.58, false);
    for (const dx of [-1.7, 0, 1.7]) for (const s of [-1, 1]) {
      const [mx, mz] = f.at(dx, s * 0.8);
      ball(b, Z.snow, mx, 0, mz, 0.95, 0.42, 8);
    }
    for (const s of [-1, 1]) f.part(Z.steel, s * 2.1, 0.44, 0, 0.08, 0.1, 1.66, false);
  }
  solid(c, x, z, 4.2, 1.7, 1.5, 'zarya-car', { rot: yaw, kind: 'prop', surface: 'metal' });
}

/** Timur's motorcycle, half apart: the front wheel off and the forks on a block, the tank out. Its front points along `yaw` + 180 degrees. */
function motorcycle(c: Ctx, x: number, z: number, yaw: number): void {
  const { b } = c;
  const f = frame(b, x, z, yaw);
  f.wheel(Z.black, 0.7, 0.32, 0, 0.32, 0.11, 14);
  f.wheel(Z.steel, 0.7, 0.32, 0, 0.1, 0.16, 8);
  f.part(Z.blue, 0.72, 0.68, 0, 0.56, 0.04, 0.16, false);
  f.part(Z.blue, 0.3, 0.6, 0, 0.3, 0.2, 0.34, false);
  for (const s of [-1, 1]) {
    const [fx, fz] = f.at(-0.62, s * 0.09);
    slab(b, Z.steel, fx, 0.62, fz, 0.05, 0.78, 0.05, 0, yaw, -0.48, false);
    const [sx, sz] = f.at(0.5, s * 0.1);
    slab(b, Z.iron, sx, 0.58, sz, 0.04, 0.5, 0.04, 0, yaw, 0.6, false);
  }
  f.part(Z.wood, -0.8, 0.13, 0, 0.3, 0.26, 0.3);
  // the frame, the engine, the exhaust, the saddle, the bars and the lamp
  const [tx, tz] = f.at(0, 0);
  slab(b, Z.iron, tx, 0.86, tz, 0.9, 0.05, 0.05, 0, yaw, 0.12, false);
  const [dx, dz] = f.at(-0.24, 0);
  slab(b, Z.iron, dx, 0.58, dz, 0.05, 0.66, 0.05, 0, yaw, -0.5, false);
  f.part(Z.steel, 0.02, 0.4, 0, 0.42, 0.34, 0.3);
  f.part(Z.iron, 0, 0.66, 0, 0.24, 0.2, 0.26, false);
  for (let i = 0; i < 3; i++) f.part(Z.steel, 0, 0.6 + i * 0.06, 0, 0.3, 0.015, 0.32, false);
  const [e0x, e0z] = f.at(-0.12, 0.17);
  const [e1x, e1z] = f.at(0.95, 0.17);
  tube(b, Z.steel, e0x, 0.3, e0z, e1x, 0.34, e1z, 0.04, 6);
  f.part(Z.black, 0.34, 0.9, 0, 0.72, 0.1, 0.28, false);
  f.part(Z.steel, -0.44, 1.02, 0, 0.04, 0.04, 0.66, false);
  const [lx, lz] = f.at(-0.56, 0);
  ball(b, Z.steel, lx, 0.9, lz, 0.09, 1, 7);
  f.part(Z.iron, 0.12, 0.13, 0, 0.06, 0.26, 0.42, false);
  f.part(Z.black, 0, 0.035, 0, 0.6, 0.02, 0.44, false);
  solid(c, x, z, 2, 0.7, 1.05, 'zarya-bike', { rot: yaw, shots: false, kind: 'none', surface: 'metal' });
}

/** A flat disc on a face looking south (+z). */
function disc(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, wide = 1): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 10), mat);
  m.rotation.x = Math.PI / 2;
  m.scale.x = wide;
  m.position.set(x, y, z);
  b.add(m, { cast: false, receive: true });
}

/** The Institute's mark: a bear's paw stencilled in black, on a face looking south at `z`. */
function paw(b: LevelBuilder, x: number, y: number, z: number, s: number): void {
  disc(b, Z.black, x, y - 0.07 * s, z + 0.012, 0.15 * s, 1.25);
  for (const [dx, dy] of [[-0.21, 0.1], [-0.08, 0.2], [0.08, 0.2], [0.21, 0.1]] as const) disc(b, Z.black, x + dx * s, y + dy * s, z + 0.012, 0.062 * s);
}

/** A slatted wooden crate, `s` on a side, standing on `y0`; `mark` stencils the paw on its south face. */
function crate(b: LevelBuilder, x: number, z: number, s: number, y0 = 0, mark = true, light = true): void {
  box(b, light ? Z.woodPale : Z.wood, x, y0 + s / 2, z, s, s, s);
  const zf = z + s / 2 + 0.012;
  for (const d of [-1, 1]) {
    box(b, Z.wood, x + d * (s / 2 - 0.05), y0 + s / 2, zf, 0.1, s, 0.03, 0, false);
    box(b, Z.wood, x, y0 + s / 2 + d * (s / 2 - 0.05), zf, s, 0.1, 0.03, 0, false);
  }
  box(b, Z.wood, x, y0 + s - 0.01, z, s + 0.04, 0.04, s + 0.04, 0, false);
  if (mark) paw(b, x, y0 + s / 2, z + s / 2, s);
}

/** A stack of tyres under a cap of snow. */
function tyres(c: Ctx, x: number, z: number, n: number): void {
  const { b } = c;
  for (let i = 0; i < n; i++) cyl(b, Z.black, x + ((i * 7) % 3) * 0.03, i * 0.21, z + ((i * 5) % 3) * 0.03, 0.34, 0.34, 0.2, 12);
  cyl(b, Z.snow, x, n * 0.21 - 0.01, z, 0.31, 0.26, 0.07, 12, false);
  cyl(b, Z.black, x, n * 0.21 + 0.02, z, 0.15, 0.15, 0.045, 10, false);
  solid(c, x, z, 0.7, 0.7, n * 0.21, 'zarya-tyres', { shots: n < 5 ? false : true, kind: 'none' });
}

/** An oil drum, standing. */
function drum(b: LevelBuilder, x: number, z: number, mat: THREE.Material): void {
  cyl(b, mat, x, 0, z, 0.29, 0.29, 0.88, 12);
  for (const y of [0.28, 0.58]) cyl(b, mat, x, y, z, 0.305, 0.305, 0.04, 12, false);
  cyl(b, Z.snow, x, 0.87, z, 0.27, 0.22, 0.07, 12, false);
}

/** A bare tree. */
function tree(c: Ctx, x: number, z: number, h: number, seed: number): void {
  const { b } = c;
  cyl(b, Z.woodDark, x, 0, z, 0.17, 0.07, h, 6);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.2 + seed;
    slab(b, Z.woodDark, x + Math.cos(a) * 0.5, h * 0.72 + (i % 3) * 0.5, z + Math.sin(a) * 0.5, 0.06, 1.9, 0.06, Math.sin(i * 1.7 + seed) * 0.6, a, 0.7, false);
  }
  solid(c, x, z, 0.4, 0.4, h, 'zarya-tree', { kind: 'none', surface: 'wood' });
}

/** A small fir strung with lights and baubles, standing on `y0`. */
function fir(b: LevelBuilder, x: number, z: number, h: number, y0: number, seed: number): void {
  const r = h * 0.3;
  const tiers = Math.max(3, Math.round(h / 1.6));
  cyl(b, Z.woodDark, x, y0, z, r * 0.14, r * 0.1, h * 0.18, 6);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const th = (h / tiers) * 1.7;
    cyl(b, Z.fir, x, y0 + h * (0.12 + t * 0.8), z, r * (1 - t * 0.82), 0, th, 9);
    cyl(b, Z.snow, x, y0 + h * (0.12 + t * 0.8) + th * 0.2, z, r * (1 - t * 0.82) * 0.74, 0, th * 0.5, 9, false);
  }
  const rnd = lcg(seed);
  const n = Math.round(h * 9);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const a = t * Math.PI * 9 + rnd() * 0.4;
    const rr = r * (1 - t * 0.8) * 0.86;
    const yy = y0 + h * (0.16 + t * 0.8);
    if (i % 3 === 0) ball(b, GOODS[Math.floor(rnd() * 5)]!, x + Math.cos(a) * rr, yy - 0.1, z + Math.sin(a) * rr, h * 0.016 + 0.03, 1, 6);
    else ball(b, Z.bulb, x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr, 0.045 + h * 0.003, 1, 5);
  }
}

/** Pallets stacked `n` high. */
function pallets(c: Ctx, x: number, z: number, n: number, yaw = 0): void {
  const { b } = c;
  for (let i = 0; i < n; i++) {
    box(b, i % 2 ? Z.wood : Z.woodPale, x, 0.03 + i * 0.15, z, 1.2, 0.03, 0.82, yaw + ((i * 7) % 3) * 0.03, false);
    box(b, Z.woodDark, x, 0.08 + i * 0.15, z, 1.1, 0.08, 0.7, yaw, false);
    box(b, i % 2 ? Z.woodPale : Z.wood, x, 0.135 + i * 0.15, z, 1.2, 0.03, 0.82, yaw + ((i * 5) % 3) * 0.03, false);
  }
  box(b, Z.snow, x, n * 0.15 + 0.04, z, 1.16, 0.09, 0.8, yaw, false);
  solid(c, x, z, 1.2, 0.82, n * 0.15, 'zarya-pallets', { rot: yaw, shots: false, kind: 'none', surface: 'wood' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the open garages
// ---------------------------------------------------------------------------------------------------------------------

function timur(c: Ctx): void {
  const { b } = c;
  const q = G.bays.timur;
  bayShell(c, q, Z.woodPale, Z.concrete);
  const W = G.bench;
  const zb = q.z0;
  // ---- the long bench along the back wall: steel legs, a shelf of boxes under it, a chest of drawers at its end ----
  box(b, Z.wood, W.x, 0.9, zb + 0.55, 5.6, 0.08, 0.9);
  for (const dx of [-2.65, -0.9, 0.9, 2.65]) box(b, Z.steel, W.x + dx, 0.43, zb + 0.55, 0.07, 0.86, 0.8, 0, false);
  box(b, Z.woodDark, W.x, 0.3, zb + 0.55, 5.4, 0.05, 0.8, 0, false);
  goods(b, W.x - 0.6, 0.33, zb + 0.6, 4.2, false, 71, { mats: [SLATE, Z.grey, Z.redDark, Z.woodPale], h: 0.3 });
  box(b, MOSS, W.x + 2.2, 0.58, zb + 0.6, 0.9, 0.56, 0.8);
  for (let i = 0; i < 3; i++) box(b, Z.steel, W.x + 2.2, 0.42 + i * 0.17, zb + 1.01, 0.3, 0.03, 0.03, 0, false);
  solid(c, W.x, zb + 0.55, 5.6, 0.95, 1, 'zarya-bench', { shots: false, kind: 'prop', surface: 'wood' });
  // the vice
  const vx = W.x - 2;
  box(b, Z.blue, vx, 0.99, zb + 0.85, 0.2, 0.1, 0.3, 0, false);
  for (const dz of [0.78, 0.95]) box(b, Z.steel, vx, 1.1, zb + dz, 0.2, 0.14, 0.06, 0, false);
  tube(b, Z.steel, vx - 0.16, 1.08, zb + 1.02, vx + 0.16, 1.08, zb + 1.02, 0.012, 5);
  // the kettle on its ring, three mugs, a lamp, a tray of bolts and whatever came out of the engine last
  const kx = W.x + 2.5;
  box(b, Z.iron, kx, 0.96, zb + 0.5, 0.32, 0.04, 0.32, 0, false);
  cyl(b, Z.steel, kx, 0.98, zb + 0.5, 0.1, 0.075, 0.15, 10, false);
  cyl(b, Z.black, kx, 1.13, zb + 0.5, 0.03, 0.02, 0.03, 6, false);
  slab(b, Z.steel, kx + 0.13, 1.08, zb + 0.5, 0.13, 0.03, 0.03, 0, 0, 0.6, false);
  box(b, Z.black, kx, 1.22, zb + 0.5, 0.15, 0.02, 0.02, 0, false);
  for (const s of [-1, 1]) box(b, Z.black, kx + s * 0.07, 1.17, zb + 0.5, 0.015, 0.1, 0.015, 0, false);
  for (const [dx, dz] of [[1.8, 0.72], [1.96, 0.6], [1.66, 0.56]] as const) cyl(b, Z.white, W.x + dx, 0.94, zb + dz, 0.04, 0.035, 0.09, 8, false);
  cyl(b, Z.iron, W.x - 0.8, 0.94, zb + 0.3, 0.08, 0.08, 0.02, 8, false);
  slab(b, Z.iron, W.x - 0.8, 1.15, zb + 0.36, 0.02, 0.44, 0.02, 0.3, 0, 0, false);
  cyl(b, MOSS, W.x - 0.8, 1.3, zb + 0.46, 0.11, 0.03, 0.12, 8, false);
  ball(b, Z.bulb, W.x - 0.8, 1.3, zb + 0.46, 0.04, 1, 6);
  box(b, Z.steel, W.x + 0.2, 0.99, zb + 0.7, 0.16, 0.1, 0.12, 0, false);
  box(b, Z.iron, W.x + 0.6, 0.955, zb + 0.62, 0.32, 0.03, 0.22, 0, false);
  for (let i = 0; i < 6; i++) cyl(b, GOODS[3]!, W.x + 0.5 + (i % 3) * 0.09, 0.97, zb + 0.57 + Math.floor(i / 3) * 0.1, 0.02, 0.02, 0.03, 5, false);
  // ---- the pegboard over it, every tool on its hook ----
  const zt = zb + 0.13;
  box(b, Z.cream, W.x, 1.85, zb + 0.09, 5, 1.2, 0.04, 0, false);
  for (let i = 0; i < 14; i++) {
    const x = W.x - 2.15 + i * 0.3;
    const y = 1.78 + (((i * 5) % 3) - 1) * 0.12;
    if (i % 4 === 0) {
      box(b, Z.woodDark, x, y - 0.05, zt, 0.035, 0.34, 0.03, 0, false);
      box(b, Z.iron, x, y + 0.13, zt, 0.15, 0.06, 0.05, 0, false);
    } else if (i % 4 === 1) {
      slab(b, Z.steel, x, y, zt, 0.05, 0.3 + (i % 3) * 0.06, 0.02, 0, 0, 0.15, false);
    } else if (i % 4 === 2) {
      box(b, GOODS[i % GOODS.length]!, x, y + 0.1, zt, 0.04, 0.13, 0.04, 0, false);
      box(b, Z.steel, x, y - 0.06, zt, 0.014, 0.2, 0.014, 0, false);
    } else {
      slab(b, Z.iron, x - 0.03, y, zt, 0.025, 0.26, 0.02, 0, 0, 0.12, false);
      slab(b, Z.redDark, x + 0.03, y, zt, 0.025, 0.26, 0.02, 0, 0, -0.12, false);
    }
  }
  box(b, Z.steel, W.x + 2.1, 2.25, zt, 0.5, 0.12, 0.012, 0, false);
  box(b, Z.woodPale, W.x + 1.8, 2.25, zt + 0.01, 0.12, 0.16, 0.03, 0, false);
  // ---- shelves of jars of bolts down the west wall ----
  const sx = q.x0 + 0.23;
  const sz = 113.5;
  for (const dz of [-1.7, 0, 1.7]) box(b, Z.woodDark, sx, 1.05, sz + dz, 0.34, 2.1, 0.05, 0, false);
  const rnd = lcg(9);
  for (let i = 0; i < 5; i++) {
    const y = 0.32 + i * 0.44;
    box(b, Z.woodPale, sx + 0.01, y, sz, 0.36, 0.04, 3.4, 0, false);
    if (i === 4) break;
    for (let j = 0; j < 13; j++) {
      if (rnd() < 0.12) continue;
      const z = sz - 1.54 + j * 0.257;
      const h = 0.11 + rnd() * 0.06;
      cyl(b, j % 3 ? Z.grey : Z.steel, sx + 0.04, y + 0.02, z, 0.055, 0.055, h, 7, false);
      cyl(b, GOODS[Math.floor(rnd() * GOODS.length)]!, sx + 0.04, y + 0.02 + h, z, 0.058, 0.058, 0.02, 7, false);
    }
  }
  solid(c, sx, sz, 0.42, 3.5, 2.1, 'zarya-shelves', { kind: 'none', surface: 'wood' });
  // ---- the motorcycle, half apart, just inside the door; its tank on the floor, its front wheel against the wall ----
  motorcycle(c, 172.3, 114.1, 0);
  ball(b, Z.redDark, 171, 0.2, 115, 0.22, 0.75, 8);
  box(b, Z.steel, 171, 0.37, 115, 0.06, 0.03, 0.06, 0, false);
  tube(b, Z.black, q.x1 - 0.3, 0.34, 111.7, q.x1 - 0.18, 0.36, 111.7, 0.32, 14);
  tube(b, Z.steel, q.x1 - 0.33, 0.34, 111.7, q.x1 - 0.15, 0.36, 111.7, 0.09, 8);
  // a stool at the bench
  cyl(b, Z.woodPale, 173.7, 0.44, 111.8, 0.17, 0.17, 0.04, 10, false);
  for (let i = 0; i < 3; i++) cyl(b, Z.woodDark, 173.7 + Math.cos(i * 2.1) * 0.12, 0, 111.8 + Math.sin(i * 2.1) * 0.12, 0.02, 0.02, 0.44, 4, false);
  solid(c, 173.7, 111.8, 0.34, 0.34, 0.46, 'zarya-stool', { shots: false, kind: 'none', surface: 'wood' });
  // ---- behind the shut door: a tool cabinet, the welding set, an old armchair under a rug nailed to the wall ----
  box(b, MOSS, 174.3, 1, zb + 0.4, 1, 2, 0.6);
  box(b, Z.black, 174.3, 1, zb + 0.705, 0.02, 1.9, 0.01, 0, false);
  for (const s of [-1, 1]) box(b, Z.steel, 174.3 + s * 0.08, 1.05, zb + 0.72, 0.03, 0.14, 0.03, 0, false);
  box(b, Z.redDark, 175.7, 0.3, zb + 0.6, 0.6, 0.5, 0.45);
  box(b, Z.iron, 175.7, 0.6, zb + 0.6, 0.4, 0.04, 0.04, 0, false);
  for (const s of [-1, 1]) disc(b, Z.black, 175.7 + s * 0.14, 0.38, zb + 0.83, 0.05);
  box(b, Z.black, 175.7, 0.72, zb + 0.6, 0.22, 0.2, 0.2, 0, false);
  box(b, Z.steel, 175.7, 0.74, zb + 0.71, 0.12, 0.05, 0.02, 0, false);
  for (const [x, mat, h] of [[176.95, Z.blue, 1.3], [176.58, RUST, 1.0]] as const) {
    cyl(b, mat, x, 0.1, zb + 0.5, 0.11, 0.11, h, 10);
    cyl(b, mat, x, 0.1 + h, zb + 0.5, 0.11, 0.04, 0.1, 10, false);
    cyl(b, GOODS[3]!, x, 0.2 + h, zb + 0.5, 0.03, 0.03, 0.08, 6, false);
  }
  box(b, Z.iron, 176.76, 0.06, zb + 0.5, 0.8, 0.08, 0.4, 0, false);
  box(b, Z.iron, 176.76, 0.75, zb + 0.3, 0.8, 0.04, 0.04, 0, false);
  solid(c, 175.65, zb + 0.5, 3.7, 0.95, 1.4, 'zarya-welder', { kind: 'none', surface: 'metal' });
  box(b, Z.redDark, q.x1 - 0.1, 1.55, 113.3, 0.03, 1.3, 2.4, 0, false);
  box(b, OCHRE, q.x1 - 0.12, 1.55, 113.3, 0.02, 1.06, 2.16, 0, false);
  box(b, Z.redDark, q.x1 - 0.135, 1.55, 113.3, 0.02, 0.8, 1.9, 0, false);
  for (const dz of [-0.5, 0, 0.5]) slab(b, Z.cream, q.x1 - 0.15, 1.55, 113.3 + dz, 0.02, 0.3, 0.3, Math.PI / 4, 0, 0, false);
  box(b, SLATE, q.x1 - 0.62, 0.25, 113.3, 0.8, 0.5, 0.9);
  box(b, SLATE, q.x1 - 0.3, 0.7, 113.3, 0.2, 0.7, 0.9);
  for (const s of [-1, 1]) box(b, SLATE, q.x1 - 0.62, 0.55, 113.3 + s * 0.4, 0.8, 0.2, 0.12, 0, false);
  solid(c, q.x1 - 0.55, 113.3, 0.95, 0.95, 0.9, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });
  // tyres and cans inside the shut front
  for (let i = 0; i < 3; i++) cyl(b, Z.black, 176.9, i * 0.21, 115.2, 0.33, 0.33, 0.2, 12);
  for (const x of [175.5, 175.9]) {
    box(b, MOSS, x, 0.24, 115.45, 0.34, 0.46, 0.16);
    box(b, Z.black, x, 0.5, 115.45, 0.12, 0.05, 0.05, 0, false);
  }
  solid(c, 176.3, 115.3, 2.1, 0.75, 0.6, 'zarya-tyres', { shots: false, kind: 'none' });
  // ---- light: two bulbs, and the New Year's string along the lintel ----
  bulb(c, W.x, 112.6, 30, 5.5);
  bulb(c, 175.8, 112.6, 14, 3.5);
  for (let i = 0; i <= 16; i++) ball(b, i % 4 === 0 ? Z.redLamp : Z.bulb, q.mouth[0] + 0.3 + (i / 16) * (q.mouth[1] - q.mouth[0] - 0.5), 2.28 - Math.sin((i / 16) * Math.PI) * 0.1, q.z1 - 0.14, 0.036, 1, 5);
  // the two door leaves, stood open into the lane
  for (const [hx, rot] of [[q.mouth[0], -1.74], [q.mouth[1], -1.4]] as const) {
    const cx = hx + Math.cos(rot) * 0.86;
    const cz = q.z1 - Math.sin(rot) * 0.86;
    box(b, SLATE, cx, 1.2, cz, 1.72, 2.3, 0.06, rot);
    for (const y of [0.62, 1.78]) box(b, Z.iron, cx, y, cz, 1.74, 0.06, 0.1, rot, false);
    solid(c, cx, cz, 1.72, 0.12, 2.35, 'zarya-door', { rot, kind: 'none', surface: 'metal' });
  }
  box(b, Z.concrete, q.mouth[1], H / 2, q.z1 - 0.12, 0.3, H, 0.3);
}

function store(c: Ctx): void {
  const { b } = c;
  const q = G.bays.store;
  bayShell(c, q, Z.concrete, Z.concreteDark);
  const s = 1.1;
  const zr = q.z0 + 0.72;
  // crates two high along the back wall, more down the west side, one by the door with its lid levered up
  for (let i = 0; i < 6; i++) {
    const x = q.x0 + 0.7 + i * 1.14;
    crate(b, x, zr, s, 0, true, i % 3 !== 1);
    if (i !== 3) crate(b, x + (i % 2 ? 0.05 : -0.04), zr + 0.03, s, s, true, i % 3 !== 0);
  }
  solid(c, (q.x0 + q.x1) / 2, zr, 6.9, 1.2, 2.2, 'zarya-crate', { kind: 'none', surface: 'wood' });
  crate(b, q.x0 + 0.7, zr + 1.2, s, 0, true, false);
  crate(b, q.x0 + 0.74, zr + 1.22, s, s, true);
  crate(b, q.x0 + 1.86, zr + 1.26, s, 0, true);
  solid(c, q.x0 + 1.28, zr + 1.23, 2.3, 1.2, 2.2, 'zarya-crate', { kind: 'none', surface: 'wood' });
  const ox = q.x1 - 0.72;
  const oz = zr + 1.5;
  box(b, Z.woodPale, ox, s / 2, oz, s, s, s);
  for (const d of [-1, 1]) {
    box(b, Z.wood, ox + d * (s / 2 - 0.05), s / 2, oz + s / 2 + 0.012, 0.1, s, 0.03, 0, false);
    box(b, Z.wood, ox, s / 2 + d * (s / 2 - 0.05), oz + s / 2 + 0.012, s, 0.1, 0.03, 0, false);
  }
  paw(b, ox, s / 2, oz + s / 2, s);
  box(b, OCHRE, ox, s - 0.02, oz, s - 0.16, 0.06, s - 0.16, 0, false);
  slab(b, Z.wood, ox - 0.08, s + 0.2, oz - 0.1, s + 0.04, 0.04, s + 0.04, 0, 0, 0.36);
  slab(b, Z.iron, ox + 0.3, s + 0.1, oz + 0.3, 0.03, 0.03, 0.8, 0.2, 0.5, 0, false);
  solid(c, ox, oz, 1.2, 1.2, 1.2, 'zarya-crate', { shots: false, kind: 'none', surface: 'wood' });
  // a sack barrow
  const tx = q.x0 + 2.6;
  const tz = q.z1 - 1.5;
  for (const d of [-1, 1]) {
    slab(b, Z.redDark, tx + d * 0.2, 0.62, tz, 0.04, 1.2, 0.04, -0.3, 0, 0, false);
    tube(b, Z.black, tx + d * 0.26, 0.11, tz + 0.16, tx + d * 0.32, 0.11, tz + 0.16, 0.11, 8);
  }
  box(b, Z.iron, tx, 0.04, tz + 0.32, 0.46, 0.03, 0.3, 0, false);
  for (const y of [0.4, 0.8]) box(b, Z.redDark, tx, y, tz + 0.18 - y * 0.3, 0.4, 0.04, 0.03, 0, false);
  bulb(c, (q.x0 + q.x1) / 2, 113, 20);
  leaf(b, q.x0, q.z1, 1, -1, RUST);
  leaf(b, q.x1, q.z1, 1, 1, RUST);
}

function builder(c: Ctx): void {
  const { b } = c;
  const q = G.bays.builder;
  bayShell(c, q, Z.concrete, Z.concreteDark);
  const zb = q.z0;
  // sawn timber stacked along the back wall, the nail gun's case lying on it
  const tx = 128.2;
  for (const dx of [-1.3, 1.3]) box(b, Z.woodDark, tx + dx, 0.05, zb + 0.75, 0.1, 0.1, 1, 0, false);
  for (let i = 0; i < 5; i++) box(b, i % 2 ? Z.woodPale : Z.wood, tx + (((i * 7) % 3) - 1) * 0.12, 0.17 + i * 0.145, zb + 0.75, 3.6 - (i % 3) * 0.3, 0.13, 0.95 - (i % 2) * 0.1);
  solid(c, tx, zb + 0.75, 3.9, 1.05, 0.85, 'zarya-timber', { shots: false, kind: 'none', surface: 'wood' });
  const N = G.nailer;
  const cx = N.x - 0.85;
  const cz = zb + 0.8;
  box(b, Z.orange, cx, 0.9, cz, 0.56, 0.16, 0.38, 0.12);
  box(b, Z.black, cx + 0.02, 0.9, cz + 0.2, 0.16, 0.05, 0.04, 0.12, false);
  for (const d of [-1, 1]) box(b, Z.steel, cx + 0.02 + d * 0.18, 0.92, cz + 0.2, 0.04, 0.06, 0.02, 0.12, false);
  // boards and ply stood against the west wall
  for (let i = 0; i < 6; i++) slab(b, i % 2 ? Z.woodPale : Z.wood, q.x0 + 0.26, 1.25, zb + 1.9 + i * 0.26, 0.04, 2.5, 0.2, 0, 0, 0.08, false);
  slab(b, Z.woodPale, q.x0 + 0.3, 0.63, 92.5, 0.04, 1.24, 2.1, 0, 0, 0.16, false);
  slab(b, Z.wood, q.x0 + 0.38, 0.63, 92.4, 0.04, 1.24, 2.1, 0, 0, 0.18, false);
  solid(c, q.x0 + 0.3, 91.6, 0.5, 4, 1.3, 'zarya-timber', { shots: false, kind: 'none', surface: 'wood' });
  // two trestles with a plank across, the saw left on it, sawdust under
  const hx = 128;
  const hz = 91.8;
  for (const dx of [-0.75, 0.75]) {
    box(b, Z.wood, hx + dx, 0.78, hz, 0.1, 0.08, 0.9);
    for (const d of [-1, 1]) for (const e of [-1, 1]) slab(b, Z.wood, hx + dx + e * 0.12, 0.38, hz + d * 0.36, 0.05, 0.8, 0.05, 0, 0, -e * 0.2, false);
  }
  box(b, Z.woodPale, hx, 0.85, hz, 2.6, 0.05, 0.28);
  box(b, Z.blue, hx + 0.5, 0.95, hz, 0.28, 0.14, 0.22, 0, false);
  tube(b, Z.steel, hx + 0.5, 0.92, hz + 0.12, hx + 0.5, 0.92, hz + 0.135, 0.11, 10);
  ball(b, Z.woodPale, hx + 0.2, 0.03, hz + 0.5, 0.55, 0.14, 7);
  solid(c, hx, hz, 2.6, 0.9, 0.9, 'zarya-trestle', { shots: false, kind: 'none', surface: 'wood' });
  // cement in the corner, a ladder and a shelf of nail boxes on the east wall
  for (let i = 0; i < 4; i++) box(b, Z.cream, 132.5, 0.1 + i * 0.18, zb + 0.6 + (i % 2) * 0.05, 0.75, 0.17, 0.5, (i % 2) * 0.2);
  solid(c, 132.5, zb + 0.6, 0.85, 0.7, 0.75, 'zarya-sacks', { shots: false, kind: 'none' });
  for (const d of [-1, 1]) slab(b, Z.woodPale, q.x1 - 0.25, 1.2, 90.6 + d * 0.22, 0.04, 2.5, 0.05, 0, 0, -0.12, false);
  for (let i = 0; i < 7; i++) box(b, Z.woodPale, q.x1 - 0.25 + (0.35 + i * 0.3 - 1.2) * 0.12, 0.35 + i * 0.3, 90.6, 0.03, 0.03, 0.44, 0, false);
  box(b, Z.woodDark, q.x1 - 0.2, 1.5, 92.6, 0.3, 0.04, 1.4, 0, false);
  goods(b, q.x1 - 0.2, 1.52, 92.6, 1.2, true, 33, { mats: GOODS, h: 0.16, d: 0.2 });
  bulb(c, 130.2, 91.1, 18);
  leaf(b, q.mouth[1], q.z1, 1, 1, MOSS);
}

function plumber(c: Ctx): void {
  const { b } = c;
  const q = G.bays.plumber;
  bayShell(c, q, Z.concrete, Z.concreteDark);
  // the rack down the west wall: three tiers of pipe in every bore
  const mats = [Z.steel, FOIL, Z.iron, RUST];
  for (const z of [134.8, 136.4, 138]) {
    box(b, Z.iron, q.x0 + 0.12, 1.2, z, 0.06, 2.3, 0.06, 0, false);
    for (const y of [0.6, 1.2, 1.8]) box(b, Z.iron, q.x0 + 0.36, y, z, 0.5, 0.05, 0.05, 0, false);
  }
  [0.6, 1.2, 1.8].forEach((y, t) => {
    for (let j = 0; j < 4; j++) {
      const r = 0.03 + ((t + j) % 3) * 0.012;
      tube(b, mats[(t + j) % mats.length]!, q.x0 + 0.2 + j * 0.11, y + 0.03 + r, 134.4, q.x0 + 0.2 + j * 0.11, y + 0.03 + r, 139 - ((j * 37 + t * 11) % 5) * 0.22, r, 7);
    }
  });
  solid(c, q.x0 + 0.34, 136.7, 0.68, 4.8, 2, 'zarya-rack', { kind: 'none', surface: 'metal' });
  // radiators against the back wall, lengths stood in the corner
  for (const x0 of [211.75, 212.6]) for (let i = 0; i < 7; i++) box(b, Z.cream, x0 + i * 0.09, 0.36, q.z0 + 0.2, 0.07, 0.58, 0.14, 0, false);
  solid(c, 212.45, q.z0 + 0.2, 1.6, 0.3, 0.66, 'zarya-radiator', { shots: false, kind: 'none', surface: 'metal' });
  for (let i = 0; i < 5; i++) cyl(b, mats[i % mats.length]!, q.x1 - 0.42 + (i % 3) * 0.1, 0, q.z0 + 0.2 + (i % 2) * 0.12, 0.03, 0.03, 2 + i * 0.1, 6, false);
  // a bench of fittings on the east wall: elbows, valves with red wheels, a blowlamp
  const bx = q.x1 - 0.38;
  const bz = 138.2;
  box(b, Z.wood, bx, 0.86, bz, 0.6, 0.06, 1.6);
  for (const d of [-0.7, 0.7]) box(b, Z.steel, bx, 0.42, bz + d, 0.5, 0.84, 0.06, 0, false);
  for (let i = 0; i < 6; i++) box(b, GOODS[3]!, bx - 0.1 + (i % 2) * 0.2, 0.93, bz - 0.6 + i * 0.13, 0.1, 0.08, 0.08, i * 0.5, false);
  for (let i = 0; i < 3; i++) {
    cyl(b, Z.iron, bx, 0.89, bz + 0.2 + i * 0.2, 0.03, 0.03, 0.12, 6, false);
    cyl(b, Z.red, bx, 1.01, bz + 0.2 + i * 0.2, 0.07, 0.07, 0.02, 8, false);
  }
  cyl(b, Z.blue, bx + 0.1, 0.89, bz - 0.7, 0.06, 0.06, 0.2, 8, false);
  solid(c, bx, bz, 0.65, 1.65, 0.9, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
  bulb(c, 212.3, 137, 16, 4);
  leaf(b, q.x0, q.z1, 1, -1, TEAL);
  leaf(b, q.x1, q.z1, 1, 1, TEAL);
}

function welder(c: Ctx): void {
  const { b } = c;
  const q = G.bays.welder;
  bayShell(c, q, Z.concrete, Z.concreteDark);
  const zb = q.z1;
  // the welding bench along the back wall: brackets cut and tacked, the mask, a vice
  const wx = 139.6;
  box(b, Z.steel, wx, 0.88, zb - 0.55, 2.8, 0.06, 0.85);
  for (const dx of [-1.3, 1.3]) for (const dz of [-0.9, -0.2]) box(b, Z.iron, wx + dx, 0.43, zb + dz, 0.06, 0.86, 0.06, 0, false);
  box(b, Z.iron, wx, 0.3, zb - 0.55, 2.6, 0.04, 0.7, 0, false);
  for (let i = 0; i < 3; i++) {
    box(b, Z.iron, wx - 0.9 + i * 0.35, 0.95, zb - 0.6, 0.05, 0.08, 0.3, i * 0.15, false);
    box(b, Z.iron, wx - 0.9 + i * 0.35, 1.04, zb - 0.47, 0.05, 0.26, 0.05, i * 0.15, false);
  }
  box(b, Z.black, wx + 0.8, 1.04, zb - 0.5, 0.24, 0.26, 0.2, 0.3, false);
  box(b, Z.blue, wx + 0.77, 1.08, zb - 0.61, 0.12, 0.05, 0.02, 0.3, false);
  box(b, Z.blue, wx - 1.15, 0.97, zb - 0.8, 0.2, 0.1, 0.3, 0, false);
  for (const dz of [-0.95, -0.78]) box(b, Z.steel, wx - 1.15, 1.08, zb + dz, 0.2, 0.14, 0.06, 0, false);
  solid(c, wx, zb - 0.55, 2.8, 0.9, 0.95, 'zarya-bench', { shots: false, kind: 'prop', surface: 'metal' });
  // more of them hung on a rail over it
  box(b, Z.iron, wx, 1.9, zb - 0.12, 2.6, 0.04, 0.04, 0, false);
  for (let i = 0; i < 7; i++) {
    box(b, Z.iron, wx - 1.1 + i * 0.37, 1.72, zb - 0.13, 0.05, 0.34, 0.03, 0, false);
    box(b, Z.iron, wx - 1.0 + i * 0.37, 1.57, zb - 0.13, 0.24, 0.05, 0.03, 0, false);
  }
  // the set itself on its wheels, the bottles chained to the east wall
  box(b, Z.redDark, 142.9, 0.42, zb - 0.7, 0.6, 0.6, 0.5);
  box(b, Z.iron, 142.9, 0.78, zb - 0.7, 0.4, 0.04, 0.04, 0, false);
  for (const s of [-1, 1]) {
    disc(b, Z.black, 142.9 + s * 0.14, 0.52, zb - 0.96, 0.05);
    tube(b, Z.black, 142.9 + s * 0.3, 0.1, zb - 0.7, 142.9 + s * 0.36, 0.1, zb - 0.7, 0.1, 8);
  }
  solid(c, 142.9, zb - 0.7, 0.7, 0.6, 0.8, 'zarya-welder', { shots: false, kind: 'none', surface: 'metal' });
  for (const [z, mat, h] of [[152.6, Z.blue, 1.3], [152.96, RUST, 1.0]] as const) {
    cyl(b, mat, q.x1 - 0.3, 0, z, 0.11, 0.11, h, 10);
    cyl(b, mat, q.x1 - 0.3, h, z, 0.11, 0.04, 0.1, 10, false);
    cyl(b, GOODS[3]!, q.x1 - 0.3, h + 0.1, z, 0.03, 0.03, 0.08, 6, false);
  }
  box(b, Z.iron, q.x1 - 0.3, 0.85, 152.78, 0.3, 0.03, 0.66, 0, false);
  solid(c, q.x1 - 0.3, 152.78, 0.45, 0.8, 1.4, 'zarya-bottles', { kind: 'none', surface: 'metal' });
  // steel on the floor down the west wall, a window grille with its sunburst stood against it
  for (let i = 0; i < 5; i++) box(b, [Z.iron, RUST, Z.steel][i % 3]!, q.x0 + 0.3 + i * 0.09, 0.05 + (i % 2) * 0.05, 153.4, 0.06, 0.06, 3.6 - i * 0.3, 0, false);
  const gx = q.x0 + 0.12;
  const g0 = 151.2;
  for (const y of [0.17, 1.27]) box(b, Z.iron, gx, y, g0 + 0.75, 0.03, 0.04, 1.5, 0, false);
  for (const z of [g0, g0 + 1.5]) box(b, Z.iron, gx, 0.72, z, 0.03, 1.1, 0.04, 0, false);
  for (const deg of [12, 30, 48, 66, 82]) {
    const a = (deg * Math.PI) / 180;
    const L = Math.min(1.46 / Math.cos(a), 1.06 / Math.sin(a));
    slab(b, Z.iron, gx, 0.19 + (L / 2) * Math.sin(a), g0 + 0.02 + (L / 2) * Math.cos(a), 0.02, 0.025, L, -a, 0, 0, false);
  }
  box(b, Z.iron, gx, 0.33, g0 + 0.16, 0.02, 0.3, 0.3, 0, false);
  solid(c, q.x0 + 0.35, 152.8, 0.7, 4.6, 0.3, 'zarya-steel', { shots: false, kind: 'none', surface: 'metal' });
  // the anvil on its stump
  cyl(b, Z.woodDark, 138.5, 0, 152.3, 0.24, 0.22, 0.5, 9);
  box(b, Z.iron, 138.5, 0.6, 152.3, 0.5, 0.18, 0.16);
  box(b, Z.iron, 138.82, 0.64, 152.3, 0.18, 0.08, 0.1, 0, false);
  solid(c, 138.5, 152.3, 0.5, 0.5, 0.7, 'zarya-anvil', { shots: false, kind: 'none', surface: 'metal' });
  bulb(c, 140.6, 153.1, 20);
  leaf(b, q.x0, q.z0, -1, -1, SLATE);
  leaf(b, q.x1, q.z0, -1, 1, SLATE);
}

// ---------------------------------------------------------------------------------------------------------------------
// the watchman's yard
// ---------------------------------------------------------------------------------------------------------------------

function hut(c: Ctx): void {
  const { b } = c;
  const { x, z } = G.hut;
  const w = 4.2;
  const d = 3.6;
  box(b, Z.concrete, x, 0.1, z, w + 0.3, 0.2, d + 0.3);
  // boarded walls: the door in the west one, a wide window in the south one with nothing in it but the frame
  box(b, Z.wood, x, 1.4, z - d / 2 + 0.06, w, 2.4, 0.12);
  box(b, Z.wood, x + w / 2 - 0.06, 1.4, z, 0.12, 2.4, d);
  box(b, Z.wood, x - w / 2 + 0.06, 1.4, z, 0.12, 2.4, d);
  const zs = z + d / 2 - 0.06;
  for (const s of [-1, 1]) box(b, Z.wood, x + s * 1.5, 1.6, zs, 1.2, 2.8, 0.12);
  box(b, Z.wood, x, 0.65, zs, 1.8, 0.9, 0.12);
  box(b, Z.wood, x, 2.6, zs, 1.8, 0.8, 0.12);
  for (let i = 0; i < 9; i++) box(b, Z.woodDark, x - w / 2 + 0.26 + i * 0.46, 1.4, zs + 0.065, 0.03, 2.4, 0.01, 0, false);
  for (const y of [1.1, 2.2]) box(b, Z.white, x, y, zs + 0.02, 1.9, 0.07, 0.18, 0, false);
  for (const s of [-1, 0, 1]) box(b, Z.white, x + s * 0.92, 1.65, zs + 0.02, 0.07, 1.1, 0.16, 0, false);
  box(b, Z.snow, x, 1.17, zs + 0.1, 1.8, 0.08, 0.2, 0, false);
  // inside: lit, a desk at the window with his tea and the radio, the stove
  groundRect(b, Z.woodDark, x - w / 2 + 0.12, z - d / 2 + 0.12, x + w / 2 - 0.12, z + d / 2 - 0.12, 0.21);
  box(b, Z.warm, x, 1.5, z - d / 2 + 0.14, w - 0.5, 1.7, 0.02, 0, false);
  box(b, Z.woodDark, x, 0.95, zs - 0.4, 1.7, 0.05, 0.6, 0, false);
  cyl(b, Z.white, x + 0.5, 0.98, zs - 0.35, 0.04, 0.035, 0.09, 8, false);
  box(b, Z.woodDark, x - 0.5, 1.09, zs - 0.4, 0.34, 0.22, 0.16, 0, false);
  box(b, Z.iron, x + 1.5, 0.65, z - 1.1, 0.5, 0.9, 0.5, 0, false);
  // the door, its step, a lamp over it, a lit pane beside it
  const xw = x - w / 2;
  box(b, Z.woodDark, xw - 0.02, 1.2, z + 0.7, 0.05, 2, 0.9, 0, false);
  box(b, Z.steel, xw - 0.06, 1.2, z + 1.02, 0.03, 0.14, 0.04, 0, false);
  box(b, Z.woodPale, xw - 0.45, 0.1, z + 0.7, 0.7, 0.2, 1.1);
  box(b, Z.warm, xw - 0.01, 1.6, z - 0.75, 0.03, 0.7, 0.7, 0, false);
  for (const dz of [-0.38, 0, 0.38]) box(b, Z.white, xw - 0.03, 1.6, z - 0.75 + dz, 0.04, 0.78, 0.05, 0, false);
  for (const dy of [-0.38, 0.38]) box(b, Z.white, xw - 0.03, 1.6 + dy, z - 0.75, 0.04, 0.05, 0.8, 0, false);
  box(b, Z.iron, xw - 0.2, 2.35, z + 0.7, 0.4, 0.04, 0.04, 0, false);
  ball(b, Z.bulb, xw - 0.38, 2.26, z + 0.7, 0.1, 1, 6);
  b.light({ x: xw - 0.9, y: 2.2, z: z + 0.7, color: 0xffb46a, intensity: 16, distance: 13, mode: 'steady', pool: 4.5, glow: 0.8, weight: 0.9 });
  // the roof pitched down to the back, snow on it, the stove pipe
  slab(b, Z.woodDark, x, 2.86, z, w + 0.7, 0.1, d + 0.8, -0.12, 0, 0);
  slab(b, Z.snow, x, 3.0, z, w + 0.6, 0.22, d + 0.7, -0.12, 0, 0, false);
  for (const s of [-1, 1]) slab(b, Z.wood, x + s * (w / 2 - 0.06), 2.7, z, 0.12, 0.3, d, -0.12, 0, 0, false);
  cyl(b, Z.iron, x + 1.5, 2.6, z - 1.1, 0.09, 0.09, 1.5, 8);
  cyl(b, Z.iron, x + 1.5, 4.1, z - 1.1, 0.17, 0.05, 0.12, 8, false);
  cyl(b, Z.snow, x + 1.5, 4.2, z - 1.1, 0.13, 0.05, 0.06, 8, false);
  // a snow shovel by the door
  slab(b, Z.woodPale, xw - 0.14, 0.75, z + 1.5, 0.04, 1.5, 0.04, 0, 0, 0.1, false);
  slab(b, Z.steel, xw - 0.2, 0.2, z + 1.5, 0.03, 0.4, 0.36, 0, 0, 0.1, false);
  solid(c, x, z, w + 0.1, d + 0.1, 2.9, 'zarya-hut', { kind: 'building', surface: 'wood' });
  // a bench under the lit pane
  box(b, Z.wood, xw - 0.45, 0.45, z - 0.75, 0.5, 0.08, 1.9);
  box(b, Z.snow, xw - 0.45, 0.53, z - 0.75, 0.5, 0.09, 1.9, 0, false);
  for (const s of [-0.8, 0.8]) box(b, Z.iron, xw - 0.45, 0.22, z - 0.75 + s, 0.5, 0.44, 0.07);
  solid(c, xw - 0.45, z - 0.75, 0.6, 1.9, 0.6, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
  // split logs stacked along its east wall, the block and the axe
  for (let i = 0; i < 5; i++) for (let j = 0; j < 9 - (i > 3 ? 3 : 0); j++) tube(b, (i + j) % 3 ? Z.wood : Z.woodPale, x + w / 2 + 0.5, 0.12 + i * 0.22, z - 1.3 + j * 0.24 + (i % 2) * 0.1, x + w / 2 + 1.5, 0.12 + i * 0.22, z - 1.3 + j * 0.24 + (i % 2) * 0.1, 0.11, 6);
  box(b, Z.snow, x + w / 2 + 1, 1.2, z - 0.3, 1.06, 0.1, 2.2, 0, false);
  solid(c, x + w / 2 + 1, z - 0.3, 1.1, 2.4, 1.15, 'zarya-logs', { shots: false, kind: 'none', surface: 'wood' });
  cyl(b, Z.woodDark, x + 4.6, 0, z + 2.6, 0.28, 0.26, 0.5, 9);
  slab(b, Z.woodPale, x + 4.6, 0.82, z + 2.6, 0.04, 0.8, 0.04, 0, 0, 0.5, false);
  box(b, Z.iron, x + 4.42, 0.54, z + 2.6, 0.08, 0.16, 0.14, 0, false);
  solid(c, x + 4.6, z + 2.6, 0.56, 0.56, 0.5, 'zarya-block', { shots: false, kind: 'none', surface: 'wood' });
}

function yard(c: Ctx): void {
  const { b } = c;
  hut(c);
  const hx = G.hut.x;
  const hz = G.hut.z;
  // oil drums and tyres under the hut's window
  drum(b, hx - 2.5, hz + 4.1, Z.redDark);
  drum(b, hx - 1.6, hz + 4.4, Z.blue);
  drum(b, hx - 2.1, hz + 5.1, RUST);
  solid(c, hx - 2.06, hz + 4.55, 1.5, 1.6, 0.9, 'zarya-drums', { shots: false, kind: 'none', surface: 'metal' });
  tube(b, SLATE, hx - 0.5, 0.29, hz + 5, hx + 0.38, 0.29, hz + 5.2, 0.29, 12, true);
  box(b, Z.snow, hx - 0.06, 0.56, hz + 5.1, 0.8, 0.07, 0.3, -0.22, false);
  solid(c, hx - 0.06, hz + 5.1, 0.9, 0.6, 0.58, 'zarya-drums', { rot: -0.22, shots: false, kind: 'none', surface: 'metal' });
  tyres(c, hx + 2.1, hz + 4.7, 4);
  tyres(c, hx + 3, hz + 5.8, 2);
  tube(b, Z.black, hx + 2.3, 0.33, hz + 5.5, hx + 2.42, 0.36, hz + 5.62, 0.33, 12, true);
  // the hand cart: a flat bed on two wheels, its handle on the snow
  const f = frame(b, 231.6, 99.2, 0.4);
  f.part(Z.woodPale, 0, 0.44, 0, 1.3, 0.06, 0.8);
  for (const s of [-1, 1]) {
    f.part(Z.wood, 0, 0.56, s * 0.38, 1.3, 0.2, 0.04, false);
    f.wheel(Z.black, -0.1, 0.24, s * 0.48, 0.24, 0.07, 12);
    f.wheel(Z.steel, -0.1, 0.24, s * 0.48, 0.07, 0.1, 6);
    const [ax, az] = f.at(0.95, s * 0.3);
    slab(b, Z.iron, ax, 0.42, az, 0.7, 0.04, 0.04, 0, 0.4, 0.1, false);
  }
  f.part(Z.iron, 1.28, 0.46, 0, 0.04, 0.04, 0.66, false);
  f.part(Z.iron, 0.55, 0.2, 0, 0.05, 0.42, 0.5, false);
  f.part(MOSS, -0.2, 0.7, 0, 0.5, 0.46, 0.4, false);
  f.part(Z.snow, -0.2, 0.96, 0, 0.5, 0.07, 0.4, false);
  solid(c, 231.6, 99.2, 1.4, 1, 0.7, 'zarya-cart', { rot: 0.4, shots: false, kind: 'none', surface: 'wood' });
  // the stripped car, two of its wheels in the snow beside it
  car(c, G.car.x, G.car.z, G.car.yaw, Z.cream, true);
  tyres(c, G.car.x + 3, G.car.z + 3.4, 1);
  tube(b, Z.black, G.car.x + 3.5, 0.3, G.car.z + 2.4, G.car.x + 3.62, 0.34, G.car.z + 2.5, 0.3, 12, true);
  // pallets and a couple of empty crates at the far end, the snow the plough left
  pallets(c, 226.4, 160.2, 5, 0.1);
  pallets(c, 228, 160.6, 2, -0.2);
  crate(b, 225.2, 162.4, 1, 0, false, false);
  solid(c, 225.2, 162.4, 1, 1, 1, 'zarya-crate', { shots: false, kind: 'none', surface: 'wood' });
  for (const [x, z, r] of [[229, 166.6, 1.5], [231, 166.9, 1.9], [233.2, 167.1, 1.4]] as const) ball(b, Z.snow, x, 0, z, r, 0.7, 9);
  solid(c, 231, 167, 6, 2.4, 1.1, 'zarya-snow', { shots: false, kind: 'none' });
  // a flatbed lorry laid up for the winter, its nose to the north
  const lx = 230;
  const lz = 115.6;
  const t = frame(b, lx, lz, Math.PI / 2);
  t.part(Z.black, 0, 0.62, 0, 5.6, 0.2, 1.1, false);
  t.part(Z.blue, 1.75, 1.5, 0, 1.5, 1.6, 2.1);
  t.part(Z.blue, 2.75, 1.1, 0, 0.9, 0.8, 1.7);
  t.part(Z.black, 2.52, 1.9, 0, 0.04, 0.6, 1.8, false);
  for (const s of [-1, 1]) {
    t.part(Z.black, 1.8, 1.9, s * 1.06, 0.8, 0.6, 0.02, false);
    t.part(Z.white, 3.22, 1.1, s * 0.6, 0.02, 0.18, 0.18, false);
    for (const dx of [2.3, -1.6]) t.wheel(Z.black, dx, 0.46, s * 0.95, 0.46, 0.3, 12);
    t.part(Z.wood, -1.05, 1.3, s * 1.1, 3.9, 0.6, 0.06);
  }
  t.part(Z.woodPale, -1.05, 0.95, 0, 3.9, 0.1, 2.2);
  t.part(Z.wood, -2.98, 1.3, 0, 0.06, 0.6, 2.2);
  t.part(Z.wood, 0.88, 1.5, 0, 0.06, 1, 2.2);
  t.part(Z.snow, -1.05, 1.12, 0, 3.8, 0.24, 2.1, false);
  t.part(Z.snow, 1.75, 2.38, 0, 1.46, 0.18, 2.06, false);
  t.part(Z.snow, 2.75, 1.56, 0, 0.86, 0.14, 1.66, false);
  for (const dx of [-2.4, -0.6, 1.2, 2.8]) for (const s of [-1, 1]) {
    const [mx, mz] = t.at(dx, s * 1.05);
    ball(b, Z.snow, mx, 0, mz, 0.85, 0.4, 8);
  }
  solid(c, lx, lz, 6, 2.3, 2.4, 'zarya-lorry', { rot: Math.PI / 2, kind: 'prop', surface: 'metal' });
  // the cooperative's fuel tank on its cradles by the fence, and a car nobody has come for
  const tx = EX - 3;
  const tz = 122;
  tube(b, RUST, tx, 1.5, tz - 1.7, tx, 1.5, tz + 1.7, 0.85, 14, true);
  for (const d of [-1.1, 1.1]) {
    box(b, Z.concrete, tx, 0.36, tz + d, 1.7, 0.72, 0.4);
    tube(b, Z.iron, tx, 1.5, tz + d - 0.03, tx, 1.5, tz + d + 0.03, 0.88, 14);
  }
  cyl(b, Z.iron, tx, 2.3, tz - 0.6, 0.12, 0.12, 0.2, 8);
  box(b, Z.snow, tx, 2.36, tz, 0.9, 0.12, 3.3, 0, false);
  cyl(b, Z.iron, tx - 0.95, 0, tz + 1.2, 0.03, 0.03, 1.1, 5);
  cyl(b, Z.red, tx - 0.95, 1.1, tz + 1.2, 0.09, 0.09, 0.03, 8, false);
  solid(c, tx, tz, 1.8, 3.6, 2.4, 'zarya-tank', { kind: 'prop', surface: 'metal' });
  car(c, EX - 3.2, 105.5, Math.PI / 2, RUST);
  // well rings and floor slabs somebody means to build with, and the ramp a car is driven up to be got under
  for (const [x, z, n] of [[226, 135.2, 2], [227.7, 136.4, 1]] as const) {
    for (let i = 0; i < n; i++) cyl(b, Z.concrete, x, i * 0.92, z, 0.75, 0.75, 0.9, 14);
    cyl(b, Z.black, x, n * 0.92 - 0.02, z, 0.6, 0.6, 0.03, 14, false);
    cyl(b, Z.snow, x, n * 0.92, z, 0.74, 0.66, 0.1, 14, false);
    solid(c, x, z, 1.4, 1.4, n * 0.92, 'zarya-rings', { shots: n < 2 ? false : true, kind: 'none' });
  }
  for (let i = 0; i < 4; i++) {
    box(b, Z.concrete, EX - 4 + (i % 2) * 0.1, 0.2 + i * 0.3, 136.5, 1.3, 0.2, 3.6);
    for (const d of [-1.2, 1.2]) box(b, Z.woodDark, EX - 4, 0.05 + i * 0.3, 136.5 + d, 1.2, 0.1, 0.1, 0, false);
  }
  box(b, Z.snow, EX - 4, 1.26, 136.5, 1.3, 0.14, 3.5, 0, false);
  solid(c, EX - 4, 136.5, 1.4, 3.7, 1.25, 'zarya-slabs', { shots: false, kind: 'none' });
  const rx = EX - 4;
  const rz = 158.5;
  for (const s of [-1, 1]) {
    box(b, Z.concrete, rx + s * 0.75, 0.95, rz, 0.5, 0.14, 5);
    slab(b, Z.concrete, rx + s * 0.75, 0.5, rz - 3.5, 0.5, 0.14, 2.2, -0.43, 0, 0);
    box(b, Z.snow, rx + s * 0.75, 1.06, rz, 0.46, 0.08, 4.9, 0, false);
    for (const d of [-2.3, 0, 2.3]) box(b, Z.concreteDark, rx + s * 0.75, 0.44, rz + d, 0.4, 0.88, 0.4);
  }
  for (const d of [-2.3, 0, 2.3]) box(b, Z.iron, rx, 0.8, rz + d, 1.9, 0.08, 0.08);
  solid(c, rx, rz - 0.6, 2.1, 7.2, 1.05, 'zarya-ramp', { shots: false, kind: 'prop' });
  // bare trees along the east fence
  for (const [z, h, seed] of [[98, 4.2, 1], [112.6, 3.6, 2], [143, 4.4, 3], [166.5, 3.8, 4]] as const) tree(c, EX - 1.3, z, h, seed);
}

// ---------------------------------------------------------------------------------------------------------------------
// the lanes
// ---------------------------------------------------------------------------------------------------------------------

function lanes(c: Ctx): void {
  const { b } = c;
  // ---- the New Year table in the northern lane: a bottle, glasses, mandarins, a little fir on a crate ----
  const T = G.table;
  box(b, Z.woodPale, T.x, 0.74, T.z, 1.3, 0.05, 0.7);
  for (const dx of [-0.55, 0.55]) for (const dz of [-0.28, 0.28]) box(b, Z.woodDark, T.x + dx, 0.36, T.z + dz, 0.05, 0.72, 0.05, 0, false);
  box(b, Z.white, T.x, 0.77, T.z, 1.1, 0.012, 0.5, 0, false);
  cyl(b, MOSS, T.x - 0.1, 0.78, T.z + 0.05, 0.04, 0.04, 0.2, 7, false);
  cyl(b, MOSS, T.x - 0.1, 0.98, T.z + 0.05, 0.04, 0.015, 0.1, 7, false);
  for (const [dx, dz] of [[-0.35, -0.1], [0.12, -0.14], [0.3, 0.02]] as const) cyl(b, Z.white, T.x + dx, 0.78, T.z + dz, 0.03, 0.025, 0.08, 6, false);
  for (let i = 0; i < 6; i++) ball(b, Z.orange, T.x + 0.34 + (i % 3) * 0.085, 0.82, T.z + 0.16 + Math.floor(i / 3) * 0.08, 0.04, 1, 5);
  box(b, Z.steel, T.x - 0.4, 0.8, T.z + 0.16, 0.16, 0.05, 0.1, 0.3, false);
  solid(c, T.x, T.z, 1.3, 0.7, 0.8, 'zarya-table', { shots: false, kind: 'none', surface: 'wood' });
  crate(b, T.x + 1.5, T.z + 0.6, 0.6, 0, false);
  fir(b, T.x + 1.5, T.z + 0.6, 1.3, 0.6, 4);
  solid(c, T.x + 1.5, T.z + 0.6, 0.6, 0.6, 1.6, 'zarya-crate', { shots: false, kind: 'none', surface: 'wood' });

  // ---- the fir on a sledge, stopped at the corner of the northern lane ----
  const sl = frame(b, 153.7, 96, 0.5);
  for (const s of [-1, 1]) {
    sl.part(Z.iron, 0, 0.03, s * 0.2, 1.3, 0.03, 0.03, false);
    sl.part(Z.woodPale, 0, 0.2, s * 0.12, 1.1, 0.03, 0.1, false);
    for (const dx of [-0.4, 0.4]) sl.part(Z.iron, dx, 0.11, s * 0.2, 0.03, 0.16, 0.03, false);
  }
  const [fx0, fz0] = sl.at(-0.9, 0);
  const [fx1, fz1] = sl.at(1.1, 0);
  tube(b, Z.woodDark, fx0, 0.3, fz0, fx1, 0.34, fz1, 0.04, 5);
  for (let i = 0; i < 5; i++) {
    const [px, pz] = sl.at(-0.5 + i * 0.38, 0);
    ball(b, Z.fir, px, 0.42, pz, 0.42 - i * 0.06, 0.6, 7);
    ball(b, Z.snow, px, 0.56, pz, 0.26 - i * 0.04, 0.4, 6);
  }
  solid(c, 153.7, 96, 1.9, 0.8, 0.6, 'zarya-sledge', { rot: 0.5, shots: false, kind: 'none', surface: 'wood' });

  // ---- cars left out for the winter: along the north wall, along the west wall, and the one being dug out by the south fence ----
  car(c, 170, NZ + 2.3, 0, MOSS);
  car(c, WX + 3.1, 92, Math.PI / 2, Z.blue);
  car(c, 168, SZ - 1.25, Math.PI, OCHRE);
  slab(b, Z.woodPale, 166.2, 0.7, SZ - 2.4, 0.04, 1.4, 0.04, 0.3, 0, 0, false);
  box(b, Z.steel, 166.2, 0.14, SZ - 2.62, 0.3, 0.3, 0.03, 0, false);
  ball(b, Z.snow, 165, 0, SZ - 2.2, 0.9, 0.6, 8);

  // ---- by the west gate: the cooperative's notice board on the end of the third row, the fire point on the end of the second ----
  const ez = G.rows[2]! + 1.5;
  box(b, Z.woodDark, RX0 - 0.06, 1.7, ez, 0.08, 1.5, 2.8, 0, false);
  box(b, Z.woodPale, RX0 - 0.11, 1.7, ez, 0.04, 1.3, 2.6, 0, false);
  for (let i = 0; i < 8; i++) box(b, i % 3 ? Z.white : Z.cream, RX0 - 0.14, 2 - Math.floor(i / 4) * 0.62, ez - 0.95 + (i % 4) * 0.63, 0.02, 0.5, 0.4 + (i % 2) * 0.1, 0, false);
  box(b, Z.snow, RX0 - 0.2, 2.5, ez, 0.4, 0.1, 3, 0, false);
  const fz = G.rows[1]! - 1.5;
  box(b, Z.red, RX0 - 0.05, 1.5, fz, 0.06, 1.2, 1.7, 0, false);
  cyl(b, Z.redDark, RX0 - 0.26, 1.15, fz - 0.45, 0.07, 0.16, 0.3, 8, false);
  slab(b, Z.woodPale, RX0 - 0.12, 1.5, fz + 0.1, 0.03, 1, 0.04, 0.5, 0, 0, false);
  box(b, Z.iron, RX0 - 0.12, 1.14, fz + 0.36, 0.02, 0.26, 0.22, 0, false);
  slab(b, Z.iron, RX0 - 0.12, 1.5, fz + 0.5, 0.03, 0.9, 0.03, -0.3, 0, 0, false);
  box(b, Z.redDark, RX0 - 0.5, 0.4, fz, 0.8, 0.8, 1.3);
  box(b, Z.snow, RX0 - 0.5, 0.85, fz, 0.84, 0.1, 1.34, 0, false);
  solid(c, RX0 - 0.5, fz, 0.8, 1.3, 0.85, 'zarya-sandbox', { shots: false, kind: 'none', surface: 'wood' });
  // the rubbish skip along the west wall
  box(b, MOSS, WX + 2.2, 0.65, 143, 1.5, 1.1, 2.4);
  box(b, Z.iron, WX + 2.2, 1.22, 143, 1.56, 0.06, 2.46, 0, false);
  box(b, Z.snow, WX + 2.2, 1.3, 143, 1.4, 0.14, 2.3, 0, false);
  solid(c, WX + 2.2, 143, 1.5, 2.4, 1.3, 'zarya-skip', { kind: 'none', surface: 'metal' });

  // ---- the cooperative's own little fir against the south fence, somebody's sledge left beside it ----
  const O = G.ornament;
  fir(b, O.x - 1.3, O.z + 1.5, 2.8, 0, 8);
  solid(c, O.x - 1.3, O.z + 1.5, 0.9, 0.9, 2.6, 'zarya-tree', { kind: 'none', surface: 'wood' });
  const s2 = frame(b, O.x + 1.2, O.z + 1.2, -0.3);
  for (const s of [-1, 1]) {
    s2.part(Z.iron, 0, 0.03, s * 0.18, 1, 0.03, 0.03, false);
    for (const dx of [-0.3, 0.3]) s2.part(Z.iron, dx, 0.1, s * 0.18, 0.03, 0.14, 0.03, false);
  }
  for (const dz of [-0.14, 0, 0.14]) s2.part(dz ? Z.red : Z.woodPale, 0, 0.18, dz, 0.9, 0.03, 0.1, false);

  // ---- at the ends of the rows: pallets, drums, tyres, a fuse box on the wall ----
  pallets(c, 155.2, G.rows[2]! + 2, 4, Math.PI / 2);
  pallets(c, 148.8, G.rows[0]! - 2.5, 3, Math.PI / 2 + 0.1);
  tyres(c, 199.3, G.rows[3]! + 3, 3);
  tyres(c, 199.2, G.rows[3]! + 3.9, 2);
  drum(b, 192.5, G.rows[1]! - 3, Z.blue);
  drum(b, 192.6, G.rows[1]! - 2.2, RUST);
  solid(c, 192.55, G.rows[1]! - 2.6, 0.7, 1.5, 0.9, 'zarya-drums', { shots: false, kind: 'none', surface: 'metal' });
  pallets(c, RX1 + 0.8, G.rows[1]! + 2, 3, Math.PI / 2);
  for (const [x, z, s] of [[148, G.rows[1]! + 1.5, 1], [156, G.rows[3]! - 1.5, -1], [200, G.rows[0]! + 1.5, -1], [192, G.rows[2]! - 1.5, 1], [RX1, G.rows[3]! - 1.5, 1]] as const) {
    box(b, Z.grey, x + s * 0.1, 1.5, z, 0.2, 0.7, 0.5, 0, false);
    box(b, Z.black, x + s * 0.205, 1.5, z, 0.01, 0.6, 0.02, 0, false);
    box(b, Z.iron, x + s * 0.06, 2.3, z, 0.05, 0.9, 0.05, 0, false);
  }
}

function lamps(c: Ctx): void {
  // lit (seven: with the six bulbs in the open garages and the lamp over the hut's door that makes the zone's fourteen lights): one by each gate, two on the middle lane, one in the northern lane, two in the yard
  const r1 = G.rows[1]!;
  const r2 = G.rows[2]!;
  for (const [x, z] of [
    [RX0 - 1.4, r2 - D - 1.2],
    [192.6, G.rows[0]! - D + 0.6],
    [148.6, r2 - D + 0.6],
    [200.2, r2 - D - 0.5],
    [155.4, G.rows[0]! + D - 0.6],
    [RX1 + 0.6, G.rows[0]! + D + 0.7],
    [RX1 + 0.6, G.rows[3]! - D - 0.7],
  ] as const) lampPost(c, x, z, true);
  // dark globes with a glow in them at the far corners
  for (const [x, z] of [
    [RX0 - 0.7, G.rows[0]! - D + 0.6],
    [RX0 - 0.7, G.rows[3]! + D - 0.6],
    [155.4, G.rows[3]! + D - 0.6],
    [RX1 + 0.6, G.rows[3]! + D + 0.8],
    [RX1 + 0.6, G.rows[0]! - D - 0.6],
    [156.6, r1 - D + 0.6],
    [199.4, G.rows[3]! - D + 0.6],
  ] as const) lampPost(c, x, z, false);
}

export interface GaragesHandles {
  /** Nothing the story moves here yet. */
  none?: undefined;
}

/**
 * (Round 3, the fire axe's job: `zarya/obstacles.ts` 'garage'.) A garage whose doors came off their hinges, so its
 * owner boarded its mouth up from outside (the boards are the story's: `zarya/obstacleLook.ts`). Inside, dark: his
 * Moskvich under a canvas cover, his doors leaned against the west wall, shelves of jars and tins on the back wall, a
 * tyre; the strongbox on the floor at the back east corner is the story's too.
 */
function boarded(c: Ctx): void {
  const { b } = c;
  const q = G.bays.boarded;
  bayShell(c, q, Z.concreteDark, Z.concreteDark);
  const xm = (q.x0 + q.x1) / 2;
  const zb = q.z1;
  // the car under its cover: a body, a cabin, the cover's skirt, wheels peeping out
  const cx = q.x0 + 1.2;
  box(b, OCHRE, cx, 0.62, 131.2, 1.5, 0.7, 3.9);
  box(b, OCHRE, cx, 1.18, 131.4, 1.3, 0.48, 2.0);
  for (const dz of [-1.3, 1.3]) for (const s of [-1, 1]) tube(b, Z.black, cx + s * 0.66, 0.28, 131.2 + dz, cx + s * 0.8, 0.28, 131.2 + dz, 0.28, 10);
  solid(c, cx, 131.2, 1.55, 4, 1.4, 'zarya-car', { kind: 'prop', surface: 'metal' });
  // his two doors, off their hinges, leaned on the west wall
  for (const dz of [0, 0.12]) slab(b, DOORS[2]!, q.x0 + 0.18 + dz, 1.15, 129.6 + dz * 4, 0.05, 2.3, 1.7, 0, 0, -0.08, false);
  // the back wall: a shelf of jars and tins, a tyre leaned under it
  box(b, Z.wood, xm, 1.4, zb - 0.22, q.x1 - q.x0 - 0.3, 0.04, 0.32, 0, false);
  for (let i = 0; i < 9; i++) cyl(b, i % 3 ? Z.cream : Z.red, q.x0 + 0.4 + i * 0.34, 1.52, zb - 0.22, 0.06, 0.06, 0.2, 6, false);
  tube(b, Z.black, q.x0 + 0.6, 0.32, zb - 0.38, q.x0 + 0.62, 0.32, zb - 0.2, 0.32, 10);
}

export function buildGarages(c: Ctx): GaragesHandles {
  ground(c);
  fences(c);
  for (let i = 0; i < G.rows.length; i++) row(c, i);
  timur(c);
  store(c);
  builder(c);
  plumber(c);
  welder(c);
  boarded(c); // (round 3: the fire axe's boarded garage)
  pipes(c);
  yard(c);
  lanes(c);
  lamps(c);
  return {};
}
