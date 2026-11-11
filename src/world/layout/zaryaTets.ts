/**
 * ZARYA: the TETs district heating plant, north of the square (`zarya/zones/tets.ts` has its places). The plant road
 * runs between the pond road gate (east) and the checkpoint (west). North of it: the boiler hall with its four boilers
 * and the three red valve wheels, the striped chimney with the new pipe welded into its base, the coal heap and its
 * conveyor, the cooling pond. South of it: the office block, the oil tank, the pump house, the heat mains crossing the
 * yard on trestles, and the tram's street along the south edge.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelBuilder } from '../builder';
import { groundRect, wall } from '../structures';
import type { Ctx } from './util';
import { TETS } from '../../zarya/zones/tets';
import { Z, lampPost, solid } from './zaryaKit';

export interface TetsHandles {
  /** Nothing the story moves here yet. */
  none?: undefined;
}

// Plain colours of the kit's matt finish (they draw together with its concrete and its packed snow).
const mat = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
/** The foil the old pipes are lagged in, and the paler courses where its sheets overlap. */
const FOIL = mat(0x9aa3ad);
const FOIL_SEAM = mat(0xc3c9d0);
/** The new pipe: nothing else in the plant is this clean. */
const PALE = mat(0xeef2f4);
const COAL = mat(0x121317);
const BOILER = mat(0x55645c);
const DUCT = mat(0x3a3f45);
const RUST = mat(0x6b4d3a);
const WATER = mat(0x14283a);
const STRIPE = mat(0xb02a20);
const LIME = mat(0xddd9d0);
const DOOR = mat(0x7c2c24);
const NIGHT = mat(0x1a2334);
const OCHRE = mat(0x8f8670);
const CAB = mat(0x40594b);
const PANEL = mat(0x3e4b4c);
const YELLOW = mat(0xc9a227);
const TRACK = mat(0x76829a);
const BENCH = mat(0x7b5a3a);
const PLANK = mat(0xa98a5f);
const BRASS = mat(0xb08a3a);
const LOCKER = mat(0x7c8590);
const BLUE = mat(0x2f4f8f);
const GREY = mat(0x8a8f98);
const FIR = mat(0x1f3d2b);
const BARK = mat(0x4d3725);

const R = TETS.rect;
const H = TETS.hall;
/** The hall's height, and how thick its walls are. */
const HH = 12;
const T = 0.6;
const C = TETS.chimney;
/** The boilers: their backs, their fronts, how wide each is. */
const BZ0 = H.z0 + 0.8;
const BZ1 = BZ0 + 9;
const BW = 7;
/** How high the hall's pipes run, and the heat mains outside. */
const PIPE_Y = 8;
const MAINS_Y = 6.3;
const SODIUM = 0xffb060;

/**
 * What casts no shadow: snow lying on things, and whatever glows. Everything else does, whatever its size, so that
 * each finish is one batch in a chunk and not two (the builder keeps casters and non-casters apart). The kit's bulbs
 * take no shadow either: these go in the same batch as the lamp posts'.
 */
const FLAT = new Set<THREE.Material>([Z.snow, Z.warm, Z.bulb, Z.redLamp, Z.ice]);

function put(b: LevelBuilder, m: THREE.Mesh, _cast?: boolean): void {
  const of = m.material as THREE.Material;
  m.castShadow = !FLAT.has(of);
  m.receiveShadow = of !== Z.bulb;
  b.add(m);
}

/** The kit's shapes (`zaryaKit.ts`), with the shadows decided by `put` (the last argument is ignored). */
function box(b: LevelBuilder, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0, _cast?: boolean): void {
  const g = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  g.position.set(x, y, z);
  g.rotation.y = rot;
  put(b, g);
}

function cyl(b: LevelBuilder, m: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8, _cast?: boolean): void {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg), m);
  g.position.set(x, y + h / 2, z);
  put(b, g);
}

function ball(b: LevelBuilder, m: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 8): void {
  const g = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)), m);
  g.position.set(x, y, z);
  g.scale.y = sy;
  put(b, g);
}

function slab(b: LevelBuilder, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number, _cast?: boolean): void {
  const g = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  g.position.set(x, y, z);
  g.rotation.set(rx, ry, rz, 'YXZ');
  put(b, g);
}

/**
 * A patch of ground (trodden snow, paving, a floor): `groundRect`'s plane, but in the same batch as the things that
 * stand on it (`put`), which saves a draw call in every chunk.
 */
function flat(b: LevelBuilder, m: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)), m);
  g.rotation.x = -Math.PI / 2;
  g.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  put(b, g);
}

/** A fir under snow, `h` high (the kit's, in this zone's own batch), solid at the trunk. */
function fir(c: Ctx, x: number, z: number, h: number): void {
  const { b } = c;
  const r = h * 0.3;
  const tiers = Math.max(3, Math.round(h / 1.6));
  cyl(b, BARK, x, 0, z, r * 0.14, r * 0.1, h * 0.18, 6);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const ty = h * (0.12 + t * 0.8);
    const tr = r * (1 - t * 0.82);
    const th = (h / tiers) * 1.7;
    cyl(b, FIR, x, ty, z, tr, 0, th, 9);
    cyl(b, Z.snow, x, ty + th * 0.2, z, tr * 0.74, 0, th * 0.5, 9);
  }
  solid(c, x, z, 0.9, 0.9, h, 'zarya-tree', { kind: 'none', surface: 'wood' });
}

/** A plank bench under snow, its back to the north. */
function seat(c: Ctx, x: number, z: number): void {
  const { b } = c;
  box(b, BENCH, x, 0.45, z, 1.9, 0.08, 0.5);
  box(b, Z.snow, x, 0.53, z, 1.9, 0.09, 0.5);
  box(b, BENCH, x, 0.78, z - 0.26, 1.9, 0.5, 0.07);
  for (const s of [-0.85, 0.85]) box(b, Z.iron, x + s, 0.24, z, 0.07, 0.48, 0.5);
  solid(c, x, z, 1.9, 0.6, 0.9, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
}

const snow = (b: LevelBuilder, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0): void => box(b, Z.snow, x, y, z, sx, sy, sz, rot);

/**
 * A pipe lying level from (x0, z0) to (x1, z1) at height `y`. `seams` wraps it in courses of foil, `snow` lays snow
 * along its top.
 */
function run(b: LevelBuilder, m: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number, r: number, o: { seams?: boolean; snow?: boolean; seg?: number } = {}): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  const seg = o.seg ?? 10;
  const piece = (pm: THREE.Material, t: number, len: number, rr: number, cast: boolean): void => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, len, seg), pm);
    g.position.set(x0 + dx * t, y, z0 + dz * t);
    g.rotation.set(0, yaw, Math.PI / 2);
    put(b, g, cast);
  };
  piece(m, 0.5, L, r, true);
  if (o.seams) for (let d = 1.3; d < L - 0.5; d += 2.6) piece(FOIL_SEAM, d / L, 0.2, r + 0.025, false);
  if (o.snow) snow(b, (x0 + x1) / 2, y + r * 0.82, (z0 + z1) / 2, L, r * 0.5, r * 1.3, yaw);
}

/** A disc on edge: its axis lies along z (it faces south and north), or along x. */
function disc(b: LevelBuilder, m: THREE.Material, x: number, y: number, z: number, r: number, t: number, alongX = false, seg = 14): void {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, seg), m);
  g.position.set(x, y, z);
  if (alongX) g.rotation.z = Math.PI / 2;
  else g.rotation.x = Math.PI / 2;
  put(b, g, false);
}

/** A ring round the given axis (a handwheel's rim, a platform's rail). */
function ring(b: LevelBuilder, m: THREE.Material, x: number, y: number, z: number, r: number, tube: number, axis: 'x' | 'y' | 'z', seg = 18): void {
  const g = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, seg), m);
  g.position.set(x, y, z);
  if (axis === 'x') g.rotation.y = Math.PI / 2;
  else if (axis === 'y') g.rotation.x = Math.PI / 2;
  put(b, g, false);
}

/** A mound standing on the ground: half a ball, `h` high. */
function dome(b: LevelBuilder, m: THREE.Material, x: number, z: number, r: number, h: number, seg = 12): void {
  const g = new THREE.Mesh(new THREE.SphereGeometry(r, seg, 5, 0, Math.PI * 2, 0, Math.PI / 2), m);
  g.position.set(x, 0, z);
  g.scale.y = h / r;
  put(b, g, true);
}

/**
 * A trestle: two legs on footings, a beam across them at `h`, cross-braced. `alongX` is the way the pipe it carries
 * runs (its frame stands across that).
 */
function trestle(c: Ctx, x: number, z: number, h: number, alongX: boolean, w = 2.6): void {
  const { b } = c;
  const ax = alongX ? 0 : 1;
  const az = alongX ? 1 : 0;
  for (const s of [-1, 1]) {
    const lx = x + (ax * s * w) / 2;
    const lz = z + (az * s * w) / 2;
    box(b, Z.iron, lx, h / 2, lz, 0.24, h, 0.24);
    box(b, Z.concrete, lx, 0.15, lz, 0.7, 0.3, 0.7);
    solid(c, lx, lz, 0.4, 0.4, h, 'zarya-trestle', { kind: 'none', surface: 'metal' });
  }
  box(b, Z.iron, x, h - 0.13, z, ax ? w + 0.6 : 0.26, 0.26, az ? w + 0.6 : 0.26);
  const panels = Math.max(1, Math.round(h / 3.2));
  const ph = (h - 0.7) / panels;
  const len = Math.hypot(w, ph);
  const a = Math.atan2(w, ph);
  for (let i = 0; i < panels; i++) {
    const yc = 0.4 + ph * (i + 0.5);
    for (const s of [-1, 1]) slab(b, Z.iron, x, yc, z, 0.08, len, 0.08, az ? s * a : 0, 0, ax ? s * a : 0);
    if (i > 0) box(b, Z.iron, x, 0.4 + ph * i, z, ax ? w : 0.1, 0.1, az ? w : 0.1);
  }
}

/** A band of lit factory windows high on a wall's outer face (`nx`, `nz`: the way the face looks), dark from inside. */
function windowBand(b: LevelBuilder, x0: number, z0: number, x1: number, z1: number, y: number, h: number, nx: number, nz: number): void {
  const alongX = nz !== 0;
  const len = alongX ? x1 - x0 : z1 - z0;
  const xm = (x0 + x1) / 2;
  const zm = (z0 + z1) / 2;
  const sx = (l: number, t: number): number => (alongX ? l : t);
  const sz = (l: number, t: number): number => (alongX ? t : l);
  box(b, Z.warm, xm + nx * 0.04, y, zm + nz * 0.04, sx(len, 0.06), h, sz(len, 0.06), 0, false);
  for (const dy of [-h / 2, 0, h / 2]) box(b, Z.iron, xm + nx * 0.08, y + dy, zm + nz * 0.08, sx(len + 0.2, 0.08), 0.12, sz(len + 0.2, 0.08));
  const n = Math.round(len / 1.5);
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (i * len) / n;
    box(b, Z.iron, xm + nx * 0.08 + (alongX ? t : 0), y, zm + nz * 0.08 + (alongX ? 0 : t), sx(0.12, 0.08), h, sz(0.12, 0.08));
  }
  // from inside: night behind the glass
  const ix = xm - nx * (T + 0.04);
  const iz = zm - nz * (T + 0.04);
  box(b, NIGHT, ix, y, iz, sx(len, 0.06), h, sz(len, 0.06), 0, false);
  for (let i = 0; i <= n; i += 2) {
    const t = -len / 2 + (i * len) / n;
    box(b, Z.iron, ix - nx * 0.03 + (alongX ? t : 0), y, iz - nz * 0.03 + (alongX ? 0 : t), sx(0.12, 0.06), h, sz(0.12, 0.06));
  }
}

/** A sodium lamp hung from the roof: a rod, a shade, a bulb. `lightIt` gives it a real light. */
function pendant(b: LevelBuilder, x: number, z: number, top: number, y: number, lightIt: boolean, strength = 95): void {
  cyl(b, Z.iron, x, y + 0.3, z, 0.03, 0.03, top - y - 0.3, 4);
  cyl(b, Z.iron, x, y, z, 0.55, 0.12, 0.36, 10);
  ball(b, Z.bulb, x, y + 0.02, z, 0.2);
  if (lightIt) b.light({ x, y: y - 0.4, z, color: SODIUM, intensity: strength, distance: 32, mode: 'steady', pool: 10, weight: 1.4 });
  else b.glow({ x, y: y - 0.05, z, color: SODIUM, size: 1.3, intensity: 2.2, mode: 'steady' });
}

/** Snow drifted against a wall: a low mound `w` by `d`. */
function drift(b: LevelBuilder, x: number, z: number, w: number, d: number, h = 0.6): void {
  const g = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), Z.snow);
  g.position.set(x, 0, z);
  g.scale.set(w / 2, h, d / 2);
  put(b, g);
}

// ---------------------------------------------------------------------------------------------------------------------
// the ground
// ---------------------------------------------------------------------------------------------------------------------

function ground(c: Ctx): void {
  const { b } = c;
  groundRect(b, Z.snow, R.x0, R.z0, R.x1, R.z1, 0.004);
  // the plant road between the two gates, wheel tracks down it
  flat(b, Z.packed, R.x0, -134.5, R.x1, -125.5, 0.012);
  for (const z of [-131.2, -128.8]) flat(b, TRACK, R.x0 + 0.3, z - 0.28, R.x1 - 0.3, z + 0.28, 0.016);
  // the tram's street along the south edge, and the lane that joins it to the road
  flat(b, Z.packed, R.x0, -88, R.x1, -74, 0.01);
  flat(b, Z.packed, -64, -125.5, -56, -88, 0.012);
  for (const x of [-61.2, -58.8]) flat(b, TRACK, x - 0.28, -125.5, x + 0.28, -88, 0.016);
  // the apron in front of the hall's doors
  flat(b, Z.paving, H.x0, H.z1, H.x1, -134.5, 0.016);
  // trodden paths: round the hall (west side, the back alley, the pond side), to the pump house door, to the new
  // pipe and the chimney's door, to the checkpoint's booth
  flat(b, Z.packed, -72.6, -177.4, -70.4, -134.5, 0.012);
  flat(b, Z.packed, -72.6, -177.4, -2.6, -175.2, 0.012);
  flat(b, Z.packed, -4.8, -177.4, -2.6, -134.5, 0.012);
  flat(b, Z.packed, 10.6, -125.5, 12.9, TETS.pump.z0, 0.012);
  flat(b, Z.packed, TETS.pipe.x - 1.1, TETS.pipe.z - 1, TETS.pipe.x + 1.1, -134.5, 0.012);
  flat(b, Z.packed, C.x + 4.4, C.z - 0.8, -72.6, C.z + 1.4, 0.012);
  flat(b, Z.packed, -101.5, -125.5, -93, -120.5, 0.012);
}

// ---------------------------------------------------------------------------------------------------------------------
// the boiler hall
// ---------------------------------------------------------------------------------------------------------------------

function hallShell(c: Ctx): void {
  const { b } = c;
  const xc = (H.x0 + H.x1) / 2;
  const zc = (H.z0 + H.z1) / 2;
  const w = H.x1 - H.x0;
  const d = H.z1 - H.z0;
  const door = (at: number, width: number, height: number) => ({ at, width, height, kind: 'door' as const });
  const spec = { height: HH, thickness: T, material: 'brick' as const, tag: 'zarya-tets' };
  wall(b, { ...spec, x0: H.x0, z0: H.z1 - T / 2, x1: H.x1, z1: H.z1 - T / 2, openings: TETS.doors.map((x) => door(x - H.x0, 7, 6.5)) });
  wall(b, { ...spec, x0: H.x0, z0: H.z0 + T / 2, x1: H.x1, z1: H.z0 + T / 2 });
  wall(b, { ...spec, x0: H.x0 + T / 2, z0: H.z0, x1: H.x0 + T / 2, z1: H.z1 });
  wall(b, { ...spec, x0: H.x1 - T / 2, z0: H.z0, x1: H.x1 - T / 2, z1: H.z1, openings: [door(TETS.sideDoor.z - H.z0, 3, 3.2)] });
  // the floor, a yellow line along the boiler fronts, the roof (a roof overhead is what tells the game it is indoors)
  flat(b, Z.paving, H.x0 + T, H.z0 + T, H.x1 - T, H.z1 - T, 0.03);
  flat(b, YELLOW, H.x0 + 2, BZ1 + 3.1, H.x1 - 2, BZ1 + 3.3, 0.036);
  box(b, Z.concreteDark, xc, HH + 0.2, zc, w + 0.5, 0.4, d + 0.5);
  snow(b, xc, HH + 0.52, zc, w + 0.2, 0.26, d + 0.2);
  for (const s of [-1, 1]) {
    box(b, Z.concrete, xc, HH + 0.75, zc + s * (d / 2 + 0.05), w + 0.6, 0.7, 0.4);
    box(b, Z.concrete, xc + s * (w / 2 + 0.05), HH + 0.75, zc, 0.4, 0.7, d + 0.6);
    snow(b, xc, HH + 1.16, zc + s * (d / 2 + 0.05), w + 0.7, 0.14, 0.5);
    snow(b, xc + s * (w / 2 + 0.05), HH + 1.16, zc, 0.5, 0.14, d + 0.7);
  }
  b.collide({ x: xc, z: zc, hx: w / 2, hz: d / 2, y0: HH, y1: HH + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: xc, z: zc, hx: w / 2, hz: d / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });
  // the roof's beams, and the lamps hung from them
  for (let x = H.x0 + 6; x < H.x1 - 2; x += 12) box(b, Z.iron, x, HH - 0.5, zc, 0.3, 1, d - T * 2);
  for (const x of [-56, -38, -20]) for (const z of [-155, -144]) pendant(b, x, z, HH - 1, 7.4, (x === -38) === (z === -144));

  // ---- outside: pilasters, a plinth, the bands of lit windows, the doors slid open on their rail ----
  for (const x of [H.x0 + 0.4, -56, -44, -32, -20, H.x1 - 0.4]) box(b, Z.concrete, x, HH / 2, H.z0 - 0.1, 0.9, HH, 0.3);
  for (const x of [H.x0 + 0.4, xc, H.x1 - 0.4]) box(b, Z.concrete, x, HH / 2, H.z1 + 0.1, 0.9, HH, 0.3);
  for (const z of [H.z0 + 0.4, H.z1 - 0.4]) for (const s of [-1, 1]) box(b, Z.concrete, xc + s * (w / 2 + 0.1), HH / 2, z, 0.3, HH, 0.9);
  box(b, Z.concreteDark, xc, 0.5, H.z0 - 0.06, w, 1, 0.2);
  for (const s of [-1, 1]) box(b, Z.concreteDark, xc + s * (w / 2 + 0.06), 0.5, s > 0 ? (H.z0 + TETS.sideDoor.z - 1.5) / 2 : zc, 0.2, 1, s > 0 ? TETS.sideDoor.z - 1.5 - H.z0 : d);
  box(b, Z.concreteDark, H.x1 + 0.06, 0.5, (TETS.sideDoor.z + 1.5 + H.z1) / 2, 0.2, 1, H.z1 - TETS.sideDoor.z - 1.5);
  windowBand(b, H.x0 + 2, H.z1, xc - 0.8, H.z1, 9.4, 1.7, 0, 1);
  windowBand(b, xc + 0.8, H.z1, H.x1 - 2, H.z1, 9.4, 1.7, 0, 1);
  windowBand(b, H.x1, H.z0 + 3, H.x1, H.z1 - 7, 9.4, 1.7, 1, 0);
  windowBand(b, H.x0, H.z0 + 3, H.x0, C.z - 3, 9.4, 1.7, -1, 0);
  windowBand(b, H.x0, C.z + 3, H.x0, H.z1 - 3, 9.4, 1.7, -1, 0);
  for (const dx of TETS.doors) {
    box(b, Z.iron, dx, 6.85, H.z1 + 0.16, 14.6, 0.16, 0.2);
    for (const s of [-1, 1]) {
      const lx = dx + s * 5.3;
      box(b, DOOR, lx, 3.3, H.z1 + 0.14, 3.5, 6.6, 0.14);
      for (const y of [0.5, 2.4, 4.3, 6.2]) box(b, Z.iron, lx, y, H.z1 + 0.22, 3.5, 0.12, 0.05);
      for (const t of [-1, 1]) slab(b, Z.iron, lx, 3.35 + t * 0.95, H.z1 + 0.22, 0.1, 3.9, 0.05, 0, 0, t * 1.05);
    }
    // a lamp over each door
    box(b, Z.iron, dx, 7.5, H.z1 + 0.5, 0.08, 0.08, 1);
    ball(b, Z.bulb, dx, 7.36, H.z1 + 0.95, 0.2);
    b.glow({ x: dx, y: 7.3, z: H.z1 + 1, color: SODIUM, size: 1.5, intensity: 2.2, mode: 'steady' });
  }
  // the side door's leaf stood open against the wall, a lamp over it
  box(b, DOOR, H.x1 + 0.12, 1.6, TETS.sideDoor.z + 3.1, 0.1, 3.2, 3);
  ball(b, Z.bulb, H.x1 + 0.5, 3.7, TETS.sideDoor.z, 0.16);
  box(b, Z.iron, H.x1 + 0.28, 3.84, TETS.sideDoor.z, 0.5, 0.06, 0.06);
  b.glow({ x: H.x1 + 0.6, y: 3.6, z: TETS.sideDoor.z, color: SODIUM, size: 1.2, intensity: 2, mode: 'steady' });
  // the vents over the boilers, breathing
  TETS.boilers.forEach((x, i) => {
    cyl(b, FOIL, x, HH + 0.4, BZ0 + 4.5, 0.8, 0.7, 3, 10);
    cyl(b, Z.iron, x, HH + 3.4, BZ0 + 4.5, 1.05, 0.3, 0.5, 10);
    b.glow({ x: x + 0.6, y: HH + 6, z: BZ0 + 4.5, color: 0xc6d4ea, size: 5, intensity: 0.32, mode: 'pulse', period: 5 + i, phase: i * 1.7 });
  });
  // snow against the foot of the walls, a bench for a smoke by the west door
  drift(b, -62, H.z0 - 0.6, 11, 3.4, 0.7);
  drift(b, -14, H.z0 - 0.6, 9, 3, 0.6);
  drift(b, H.x0 - 0.5, -141, 2.6, 7, 0.6);
  seat(c, -62.4, H.z1 + 0.6);
  seat(c, -14.5, H.z1 + 0.6);
}

/** One boiler: a boxy casing under a round drum, its front (south) with the firebox mouth, the gauges and the hatches. */
function boiler(c: Ctx, x: number, i: number): void {
  const { b } = c;
  const zc = (BZ0 + BZ1) / 2;
  const zf = BZ1;
  box(b, Z.concreteDark, x, 0.25, zc, BW + 0.5, 0.5, 9.5);
  box(b, BOILER, x, 3.35, zc, BW, 6.3, 9);
  run(b, BOILER, x, BZ0, x, BZ1, 6.5, BW / 2, { seg: 18 });
  // the casing's frame, the drum's straps
  for (const s of [-1, 1]) box(b, Z.iron, x + s * (BW / 2 - 0.1), 3.5, zf + 0.03, 0.26, 6.6, 0.1);
  for (const y of [0.62, 2.7, 6.7]) box(b, Z.iron, x, y, zf + 0.03, BW, 0.22, 0.1);
  for (const z of [BZ0 + 2.2, BZ0 + 4.5, BZ0 + 6.8]) run(b, DUCT, x, z - 0.12, x, z + 0.12, 6.5, BW / 2 + 0.05, { seg: 18 });
  // the firebox: an iron door frame, the fire behind its bars, the ash door under it
  box(b, Z.iron, x, 1.55, zf + 0.1, 2.5, 1.7, 0.2);
  box(b, Z.warm, x, 1.4, zf + 0.22, 1.9, 0.9, 0.05, 0, false);
  disc(b, Z.warm, x, 1.85, zf + 0.22, 0.95, 0.05);
  box(b, Z.iron, x, 0.82, zf + 0.24, 2.3, 0.3, 0.1);
  for (let k = -2; k <= 2; k++) box(b, Z.iron, x + k * 0.38, 1.75, zf + 0.27, 0.07, 1.9, 0.05);
  box(b, Z.iron, x, 2.86, zf + 0.24, 2.3, 0.14, 0.12);
  b.glow({ x, y: 1.6, z: zf + 0.7, color: 0xff8a30, size: 2.6, intensity: 1.3, mode: 'flicker', phase: i * 0.7 });
  // gauges, a pair of hatches, a brass plate
  for (const [dx, y, r] of [[-1.25, 3.9, 0.26], [0, 4.05, 0.36], [1.25, 3.9, 0.26]] as const) {
    disc(b, Z.iron, x + dx, y, zf + 0.04, r + 0.06, 0.08);
    disc(b, LIME, x + dx, y, zf + 0.07, r, 0.06);
    slab(b, Z.black, x + dx, y + r * 0.3, zf + 0.11, 0.035, r * 0.75, 0.02, 0, 0, (dx + i * 0.7) * 0.6, false);
  }
  for (const s of [-1, 1]) {
    disc(b, Z.iron, x + s * 2.35, 4.9, zf + 0.05, 0.5, 0.1);
    disc(b, BRASS, x + s * 2.35, 4.9, zf + 0.11, 0.1, 0.06, false, 8);
    // a sight glass down each side of the front
    box(b, BRASS, x + s * 2.7, 2.2, zf + 0.08, 0.1, 1.4, 0.1, 0, false);
  }
  box(b, BRASS, x, 5.05, zf + 0.03, 0.9, 0.34, 0.04, 0, false);
  // the uptake at the back into the flue
  box(b, DUCT, x, 10.2, BZ0 + 1.5, 2.4, 1.6, 2.4);
  solid(c, x, zc, BW, 9, 10, 'zarya-boiler', { kind: 'prop', surface: 'metal' });
}

/**
 * A valve stand: a riser down from the hall's pipes, a branch off it at knee height, and the valve on the end of the
 * branch under its big red handwheel, flat at chest height. (`sx`, `sz`) is the wheel: the story stands its own stem
 * and turning hub there (`zarya/look.ts`), inside this rim. `face` is the way the branch comes out from the riser.
 */
function valveStand(c: Ctx, sx: number, sz: number, face: 'E' | 'S' | 'W'): { x: number; z: number } {
  const { b } = c;
  const fx = face === 'E' ? 1 : face === 'W' ? -1 : 0;
  const fz = face === 'S' ? 1 : 0;
  const x = sx - fx * 1.4;
  const z = sz - fz * 1.4;
  const by = 0.62;
  cyl(b, FOIL, x, 0, z, 0.32, 0.32, PIPE_Y, 10);
  for (const y of [2.6, 5.2]) cyl(b, FOIL_SEAM, x, y, z, 0.35, 0.35, 0.2, 10, false);
  cyl(b, Z.iron, x, 0, z, 0.6, 0.6, 0.14, 10);
  box(b, Z.concreteDark, x + fx * 0.7, 0.06, z + fz * 0.7, fx ? 3 : 1.6, 0.12, fx ? 1.6 : 3);
  // a gauge on the riser, the branch, the valve's flanges and body, its bonnet up to the wheel
  cyl(b, Z.iron, x, 1.9, z, 0.36, 0.36, 0.12, 10);
  disc(b, LIME, x + fx * 0.36, 2.25, z + fz * 0.36, 0.17, 0.05, !!fx, 10);
  run(b, FOIL, x, z, sx - fx * 0.5, sz - fz * 0.5, by, 0.25);
  for (const d of [0.62, 0.48]) run(b, Z.iron, sx - fx * d, sz - fz * d, sx - fx * (d - 0.07), sz - fz * (d - 0.07), by, 0.4, { seg: 10 });
  ball(b, Z.iron, sx, by, sz, 0.44, 1, 10);
  cyl(b, Z.iron, sx, 0, sz, 0.34, 0.34, 0.3, 10);
  cyl(b, Z.iron, sx, by, sz, 0.24, 0.14, 0.4, 8);
  // the wheel's rim and its outer spokes (twelve, so the hub's three meet them before and after a quarter turn)
  ring(b, Z.red, sx, 1.1, sz, 0.56, 0.055, 'y', 20);
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    box(b, Z.red, sx + Math.cos(a) * 0.43, 1.1, sz + Math.sin(a) * 0.43, 0.26, 0.045, 0.045, -a, false);
  }
  solid(c, x, z, 0.9, 0.9, 3.2, 'zarya-valve', { kind: 'none', surface: 'metal' });
  solid(c, (x + sx + fx * 0.45) / 2, (z + sz + fz * 0.45) / 2, fx ? 1.85 : 0.9, fx ? 0.9 : 1.85, 1.05, 'zarya-valve', { shots: false, kind: 'none', surface: 'metal' });
  return { x, z };
}

function hallInside(c: Ctx): void {
  const { b } = c;
  const xi0 = H.x0 + T;
  const xi1 = H.x1 - T;
  const zi0 = H.z0 + T;
  const zi1 = H.z1 - T;
  TETS.boilers.forEach((x, i) => boiler(c, x, i));

  // ---- the pipes, lagged in foil: the steam header over the boiler fronts, runs down both end walls and along the
  // south wall, the flue along the back wall and out through the west wall to the chimney ----
  const wx = xi0 + 0.8;
  const ex = xi1 - 0.8;
  const hz = BZ1 + 2.6;
  run(b, FOIL, wx, hz, ex, hz, PIPE_Y, 0.55, { seams: true });
  for (const x of TETS.boilers) run(b, FOIL, x, BZ1 - 1.4, x, hz, PIPE_Y + 0.9, 0.42);
  for (const x of TETS.boilers) cyl(b, FOIL, x, PIPE_Y, hz, 0.42, 0.42, 1.3, 10);
  run(b, FOIL, wx, hz, wx, zi1 - 0.7, PIPE_Y, 0.4, { seams: true });
  run(b, FOIL, ex, hz, ex, zi1 - 0.7, PIPE_Y, 0.4, { seams: true });
  run(b, FOIL, wx, zi1 - 0.7, ex, zi1 - 0.7, PIPE_Y, 0.36, { seams: true });
  for (const [x, z] of [[wx, hz], [ex, hz], [wx, zi1 - 0.7], [ex, zi1 - 0.7]] as const) ball(b, FOIL, x, PIPE_Y, z, 0.58, 1, 10);
  // brackets under the wall runs
  for (let z = hz + 3; z < zi1 - 1; z += 5) for (const [x, s] of [[wx, -1], [ex, 1]] as const) box(b, Z.iron, x + s * 0.4, PIPE_Y - 0.5, z, 0.9, 0.1, 0.1);
  for (let x = wx + 4; x < ex - 1; x += 6) box(b, Z.iron, x, PIPE_Y - 0.46, zi1 - 0.45, 0.1, 0.1, 0.9);
  box(b, DUCT, (TETS.boilers[3]! + 1.2 + xi0) / 2, 10.2, zi0 + 0.75, TETS.boilers[3]! + 1.2 - xi0, 1.4, 1.4);
  box(b, DUCT, xi0 + 0.75, 10.2, (zi0 + C.z + 0.7) / 2, 1.4, 1.4, C.z + 0.7 - zi0);

  // the fires light the floor in front of them
  b.light({ x: (H.x0 + H.x1) / 2, y: 2.4, z: BZ1 + 3.4, color: 0xff8a3a, intensity: 30, distance: 22, mode: 'flicker', pool: 0, weight: 0.8 });

  // ---- the valve wheels: the west one off the west wall's run, the middle one off the header between the second
  // and third boilers, the east one off the east wall's run ----
  TETS.valves.forEach((v, i) => {
    const at = valveStand(c, v.x, v.z, TETS.valveFace[i]!);
    if (TETS.valveFace[i] === 'S') {
      run(b, FOIL, at.x, at.z, at.x, hz, PIPE_Y, 0.32);
      ball(b, FOIL, at.x, PIPE_Y, at.z, 0.36, 1, 8);
    }
  });

  // ---- the catwalk along the boiler fronts and back between them, hung from the roof (nobody gets up there: the
  // ladder at its west end is locked off) ----
  const cy = 5.2;
  const cz = BZ1 + 0.95;
  box(b, Z.iron, (wx + ex) / 2, cy, cz, ex - wx + 1, 0.12, 1.7);
  for (const y of [cy + 0.55, cy + 1.1]) box(b, Z.iron, (wx + ex) / 2, y, cz + 0.82, ex - wx + 1, 0.06, 0.06);
  for (let x = wx; x <= ex + 0.1; x += (ex - wx) / 20) box(b, Z.iron, x, cy + 0.55, cz + 0.82, 0.06, 1.1, 0.06);
  for (let x = wx + 2; x < ex; x += 7.5) {
    cyl(b, Z.iron, x, cy, cz + 0.82, 0.035, 0.035, HH - 0.9 - cy, 4);
    slab(b, Z.iron, x, cy - 0.5, cz - 0.3, 0.08, 1.5, 0.08, 0.8, 0, 0);
  }
  for (const x of [-52, -24]) {
    box(b, Z.iron, x, cy, (BZ0 + BZ1) / 2, 1.6, 0.12, 9.2);
    for (const s of [-1, 1]) box(b, Z.iron, x + s * 0.78, cy + 1.1, (BZ0 + BZ1) / 2, 0.06, 0.06, 9.2);
  }
  // the ladder: two rails and rungs up the west wall, a chained gate across its foot
  for (const s of [-1, 1]) box(b, Z.iron, xi0 + 0.16, 3.2, cz + s * 0.28, 0.06, 6.4, 0.06);
  for (let y = 0.4; y < 6.3; y += 0.4) box(b, Z.iron, xi0 + 0.16, y, cz, 0.04, 0.04, 0.56);

  // ---- between the boilers: a feed tank at the back of each bay; switchgear in the end bays ----
  for (const x of [-52, -38, -24]) {
    for (const s of [-1, 1]) box(b, Z.concreteDark, x + s * 1.6, 0.35, zi0 + 1.5, 0.5, 0.7, 2);
    run(b, BOILER, x - 2.5, zi0 + 1.5, x + 2.5, zi0 + 1.5, 1.7, 1.1, { seg: 12 });
    for (const s of [-1, 1]) run(b, Z.iron, x + s * 1.7 - 0.06, zi0 + 1.5, x + s * 1.7 + 0.06, zi0 + 1.5, 1.7, 1.14, { seg: 12 });
    cyl(b, FOIL, x + 0.8, 2.7, zi0 + 1.5, 0.2, 0.2, 2.6, 8);
    disc(b, LIME, x - 0.9, 1.9, zi0 + 2.62, 0.2, 0.06);
    solid(c, x, zi0 + 1.5, 5.2, 2.4, 2.9, 'zarya-tank', { kind: 'prop', surface: 'metal' });
  }
  for (const [x0, x1] of [[xi0 + 0.3, xi0 + 4.3], [xi1 - 4.3, xi1 - 0.3]] as const) {
    for (let x = x0 + 0.5, i0 = 0; x < x1; x += 1, i0++) {
      box(b, PANEL, x, 1.1, zi0 + 0.5, 0.96, 2.2, 0.8);
      box(b, Z.black, x, 1.7, zi0 + 0.91, 0.5, 0.3, 0.02, 0, false);
      box(b, i0 % 2 ? STRIPE : Z.warm, x - 0.2, 1.3, zi0 + 0.91, 0.07, 0.07, 0.03, 0, false);
      box(b, BRASS, x + 0.3, 0.9, zi0 + 0.92, 0.06, 0.2, 0.04, 0, false);
    }
    solid(c, (x0 + x1) / 2, zi0 + 0.5, x1 - x0, 0.9, 2.2, 'zarya-switchgear', { kind: 'prop', surface: 'metal' });
  }

  // ---- along the south wall: lockers at the west end, the control desk under its board of gauges between the doors,
  // a workbench at the east end ----
  for (let i = 0; i < 7; i++) {
    box(b, i % 3 === 1 ? BOILER : PANEL, xi0 + 1 + i * 0.9, 0.95, zi1 - 0.32, 0.86, 1.9, 0.6);
    box(b, Z.black, xi0 + 1 + i * 0.9, 1.55, zi1 - 0.63, 0.5, 0.12, 0.02, 0, false);
  }
  solid(c, xi0 + 3.7, zi1 - 0.32, 6.4, 0.65, 1.9, 'zarya-lockers', { kind: 'prop', surface: 'metal' });
  const dx = (TETS.doors[0]! + TETS.doors[1]!) / 2;
  box(b, PANEL, dx, 2.7, zi1 - 0.08, 8.4, 2.4, 0.14);
  box(b, Z.iron, dx, 2.7, zi1 - 0.05, 8.6, 2.6, 0.06);
  for (let i = 0; i < 12; i++) {
    const gx = dx - 3.6 + (i % 6) * 1.44;
    const gy = 3.3 - Math.floor(i / 6) * 1.1;
    disc(b, LIME, gx, gy, zi1 - 0.17, i % 4 === 0 ? 0.36 : 0.27, 0.05);
    slab(b, Z.black, gx, gy + 0.08, zi1 - 0.2, 0.03, 0.22, 0.02, 0, 0, ((i * 37) % 11) * 0.25 - 1.2, false);
  }
  for (let i = 0; i < 9; i++) box(b, i % 4 === 1 ? STRIPE : Z.warm, dx - 3.6 + i * 0.9, 1.72, zi1 - 0.17, 0.1, 0.1, 0.04, 0, false);
  box(b, PANEL, dx, 0.45, zi1 - 1.8, 6, 0.9, 0.9);
  slab(b, LOCKER, dx, 1.02, zi1 - 1.74, 6, 0.06, 1, -0.26, 0, 0);
  for (let i = 0; i < 14; i++) box(b, [STRIPE, LIME, Z.black, BRASS][i % 4]!, dx - 2.7 + i * 0.41, 1.085 - ((i % 3) - 1) * 0.07, zi1 - 1.74 - ((i % 3) - 1) * 0.27, 0.12, 0.06, 0.12, 0, false);
  solid(c, dx, zi1 - 1.8, 6, 1, 1.15, 'zarya-desk', { shots: false, kind: 'prop', surface: 'metal' });
  const bxw = -17;
  box(b, BENCH, bxw, 0.9, zi1 - 0.5, 6.4, 0.1, 0.9);
  for (const s of [-3, 0, 3]) box(b, Z.iron, bxw + s, 0.43, zi1 - 0.5, 0.1, 0.86, 0.8);
  box(b, Z.iron, bxw - 2.4, 1.07, zi1 - 0.6, 0.34, 0.24, 0.26);
  box(b, STRIPE, bxw + 1.6, 1.09, zi1 - 0.5, 0.7, 0.28, 0.36);
  for (let i = 0; i < 5; i++) run(b, i === 2 ? PALE : FOIL, bxw - 0.9 + i * 0.3, zi1 - 0.85, bxw - 0.9 + i * 0.3, zi1 - 0.15, 1.02, 0.07, { seg: 6 });
  box(b, BENCH, bxw, 2.1, zi1 - 0.06, 5.6, 1.3, 0.06, 0, false);
  for (let i = 0; i < 11; i++) box(b, Z.iron, bxw - 2.5 + i * 0.5, 2.1 + ((i * 3) % 4) * 0.1, zi1 - 0.11, 0.07, 0.5 + (i % 3) * 0.12, 0.03, ((i * 5) % 3) * 0.2 - 0.2, false);
  solid(c, bxw, zi1 - 0.5, 6.4, 0.9, 1.1, 'zarya-bench', { shots: false, kind: 'prop', surface: 'wood' });
  // a coal barrow left by the first boiler, a heap of clinker by the last
  box(b, RUST, xi0 + 2.6, 0.62, BZ1 + 3.9, 1.5, 0.6, 0.9, 0.3);
  dome(b, COAL, xi0 + 2.6, BZ1 + 3.9, 0.6, 1.25, 8);
  solid(c, xi0 + 2.6, BZ1 + 3.9, 1.5, 1, 1.1, 'zarya-barrow', { rot: 0.3, shots: false, kind: 'none', surface: 'metal' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the chimney, the flue into it, and the new pipe
// ---------------------------------------------------------------------------------------------------------------------

/** The chimney's radius at a height: a concrete foot ten metres high, then fifty metres of bands. */
const stackR = (y: number): number => (y < 10 ? 4 - 0.03 * y : 3.7 - (y - 10) * 0.035);

/** Four red lamps round the stack at a height: one mesh, so they stay one batch whichever side of a chunk's edge each is. */
function lampRing(b: LevelBuilder, y: number, r: number, size: number, turn: number): void {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + turn;
    parts.push(new THREE.BoxGeometry(size, size * 1.2, size).translate(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  const g = new THREE.Mesh(mergeGeometries(parts, false), Z.redLamp);
  g.position.set(C.x, y, C.z);
  put(b, g);
}

function chimney(c: Ctx): void {
  const { b } = c;
  cyl(b, Z.concreteDark, C.x, 0, C.z, 4.5, 4.4, 0.5, 8);
  cyl(b, Z.concrete, C.x, 0, C.z, stackR(0), stackR(10), 10, 16);
  for (let i = 0; i < 10; i++) {
    const y = 10 + i * 5;
    cyl(b, i % 2 ? LIME : STRIPE, C.x, y, C.z, stackR(y), stackR(y + 5), 5, 16, false);
  }
  cyl(b, Z.black, C.x, 60, C.z, stackR(60) + 0.12, stackR(60) + 0.12, 0.5, 16, false);
  // the platforms: a ring of grating and its rail at thirty metres, and near the top
  for (const y of [30, 55]) {
    const r = stackR(y) + 1.1;
    cyl(b, Z.iron, C.x, y, C.z, r, r, 0.16, 16, false);
    ring(b, Z.iron, C.x, y + 1.15, C.z, r - 0.05, 0.05, 'y', 20);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      box(b, Z.iron, C.x + Math.cos(a) * (r - 0.05), y + 0.6, C.z + Math.sin(a) * (r - 0.05), 0.07, 1.1, 0.07, 0, false);
    }
    lampRing(b, y + 1.4, r, 0.32, 0.4);
  }
  // the red lamp at the top, and what comes out of it: the snow, lit from below
  lampRing(b, 60.75, stackR(60) + 0.2, 0.42, 0);
  b.glow({ x: C.x, y: 61, z: C.z + 2.2, color: 0xff3020, size: 4.2, intensity: 3, mode: 'pulse', period: 2.6 });
  b.glow({ x: C.x + 2, y: 31.4, z: C.z + 4, color: 0xff3020, size: 2.4, intensity: 2.4, mode: 'pulse', period: 2.6, phase: 1.3 });
  b.glow({ x: C.x + 1.5, y: 56.4, z: C.z + 3.2, color: 0xff3020, size: 2.4, intensity: 2.4, mode: 'pulse', period: 2.6, phase: 1.3 });
  for (const [dx, dy, s, k] of [[0.5, 4, 8, 0.5], [2.5, 9, 12, 0.36], [5.5, 15, 17, 0.24]] as const) {
    b.glow({ x: C.x + dx, y: 60 + dy, z: C.z + dx * 0.4, color: 0xc4d6f4, size: s, intensity: k, mode: 'pulse', period: 7, phase: dy * 0.3 });
  }
  // the ladder up its south face, the door in its foot
  const lean = Math.atan2(stackR(0) - stackR(55), 55);
  for (const s of [-1, 1]) slab(b, Z.iron, C.x + s * 0.3, 27.5, C.z + (stackR(0) + stackR(55)) / 2 + 0.2, 0.07, 55.1, 0.07, -lean, 0, 0);
  for (let y = 4; y < 54; y += 5) box(b, Z.iron, C.x, y, C.z + stackR(y) + 0.42, 0.9, 0.07, 0.5);
  box(b, Z.iron, C.x + stackR(1.2) - 0.02, 1.2, C.z + 0.2, 0.2, 2.2, 1.3);
  solid(c, C.x, C.z, 7.5, 7.5, 60, 'zarya-chimney', { kind: 'building' });
  solid(c, C.x, C.z, 7.5, 7.5, 60, 'zarya-chimney', { rot: Math.PI / 4, kind: 'none' });

  // the flue from the hall: a fat lagged duct on a trestle, collared into the stack
  const fy = 10.2;
  const fx1 = C.x + stackR(fy) - 0.3;
  run(b, FOIL, H.x0, C.z, fx1, C.z, fy, 1.25, { seams: true, snow: true, seg: 14 });
  run(b, FOIL_SEAM, fx1, C.z, fx1 + 0.7, C.z, fy, 1.5, { seg: 14 });
  run(b, FOIL_SEAM, H.x0 - 0.6, C.z, H.x0, C.z, fy, 1.5, { seg: 14 });
  trestle(c, -76.5, C.z, fy - 1.25, true, 3.2);
}

/** The new pipe, low from the west wall into the chimney's foot: clean steel on new saddles, a fresh collar, the scaffold left beside it. */
function newPipe(c: Ctx): void {
  const { b } = c;
  const y = 1.5;
  const r = 0.75;
  const x0 = R.x0 + 0.22;
  const x1 = C.x - stackR(y) + 0.1;
  run(b, PALE, x0, C.z, x1, C.z, y, r, { seg: 16 });
  for (const x of [-101.2, -98, -94.8]) {
    box(b, LIME, x, 0.42, C.z, 0.9, 0.84, 2.1);
    run(b, PALE, x - 0.2, C.z, x + 0.2, C.z, y, r + 0.06, { seg: 16 });
  }
  // the collar: a sleeve welded round the pipe where it goes into the stack, a dark bead round both its ends,
  // the concrete sooted about it
  run(b, PALE, x1 - 1.3, C.z, x1 + 0.1, C.z, y, r + 0.2, { seg: 16 });
  ring(b, Z.iron, x1 - 1.3, y, C.z, r + 0.2, 0.045, 'x', 20);
  ring(b, Z.iron, x1 - 0.14, y, C.z, r + 0.25, 0.07, 'x', 20);
  disc(b, DUCT, x1 + 0.05, y, C.z, r + 0.46, 0.1, true, 18);
  for (const a of [0.5, 1.6, 2.6, 3.7, 4.7, 5.8]) box(b, PALE, x1 - 0.7, y + Math.sin(a) * (r + 0.2), C.z + Math.cos(a) * (r + 0.2), 1, 0.1, 0.1, 0, false);
  // a flanged joint half way along
  for (const dx of [-0.12, 0.12]) run(b, PALE, -96.4 + dx - 0.07, C.z, -96.4 + dx + 0.07, C.z, y, r + 0.2, { seg: 16 });
  solid(c, (x0 + x1) / 2, C.z, x1 - x0, r * 2 + 0.2, y + r + 0.1, 'zarya-newpipe', { kind: 'prop', surface: 'metal' });

  // the scaffold, north of the joint: two lifts of tube and plank, a ladder against it
  const sx = C.x - 7;
  const sz = C.z - 1.9;
  for (const dx of [-2, 0, 2]) for (const dz of [-0.75, 0.75]) cyl(b, Z.iron, sx + dx, 0, sz + dz, 0.04, 0.04, 4.6, 5);
  for (const yy of [2, 4]) {
    for (const dz of [-0.75, 0.75]) box(b, Z.iron, sx, yy, sz + dz, 4.3, 0.06, 0.06);
    for (const dx of [-2, 0, 2]) box(b, Z.iron, sx + dx, yy, sz, 0.06, 0.06, 1.6);
    for (const dz of [-0.5, 0, 0.5]) box(b, PLANK, sx + (yy === 4 ? -0.9 : 0), yy + 0.07, sz + dz, yy === 4 ? 2.4 : 4.2, 0.06, 0.44, 0, false);
  }
  for (const dz of [-0.75, 0.75]) for (const s of [-1, 1]) slab(b, Z.iron, sx + s, 2.1, sz + dz, 0.05, 4.4, 0.05, 0, 0, s * 0.46);
  for (const s of [-1, 1]) slab(b, PLANK, sx - 2.5, 1.05, sz + 0.2 + s * 0.22, 0.06, 2.3, 0.06, 0, 0, -0.32);
  for (let k = 0; k < 6; k++) box(b, PLANK, sx - 2.82 + k * 0.115, 0.25 + k * 0.34, sz + 0.2, 0.04, 0.04, 0.44, 0, false);
  solid(c, sx, sz, 4.4, 1.8, 4.2, 'zarya-scaffold', { shots: false, kind: 'prop', surface: 'metal' });
  // what the welders left: two gas bottles, a coil of hose, the offcut rings, a work lamp still burning
  for (const [dx, m] of [[0, BLUE], [0.5, Z.concreteDark]] as const) {
    cyl(b, m, C.x - 11.4 + dx, 0, C.z + 1.5, 0.16, 0.16, 1.3, 8);
    cyl(b, Z.iron, C.x - 11.4 + dx, 1.3, C.z + 1.5, 0.06, 0.05, 0.2, 6);
  }
  solid(c, C.x - 11.15, C.z + 1.5, 1, 0.5, 1.5, 'zarya-bottles', { shots: false, kind: 'none', surface: 'metal' });
  ring(b, Z.black, C.x - 10.2, 0.08, C.z + 2.2, 0.36, 0.06, 'y', 10);
  ring(b, PALE, C.x - 8, 0.14, C.z + 3.9, 0.78, 0.1, 'y', 14);
  slab(b, PALE, C.x - 2.6, 0.2, C.z + 4.9, 1.6, 0.04, 0.9, 0.5, 0.4, 0, false);
  cyl(b, Z.iron, sx + 2, 4.6, sz + 0.75, 0.03, 0.03, 0.5, 4);
  ball(b, Z.bulb, sx + 2, 5.16, sz + 0.75, 0.17);
  b.light({ x: sx + 1.8, y: 4.2, z: C.z + 0.8, color: 0xdfe9ff, intensity: 24, distance: 17, mode: 'steady', pool: 5, glow: 1.2, weight: 1.2 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the coal yard, the cooling pond, the back alley
// ---------------------------------------------------------------------------------------------------------------------

function coalYard(c: Ctx): void {
  const { b } = c;
  const Q = TETS.heap;
  flat(b, COAL, R.x0 + 1.5, R.z0 + 1.5, Q.x1, Q.z1, 0.02);
  for (const [x, z, r, h] of [[-90, -178.4, 10, 7.4], [-97.6, -183.6, 4.9, 4.3], [-98, -173.4, 4.5, 3.9], [-82.6, -183.8, 4.6, 3.8], [-82.4, -173.4, 4.7, 3.6], [-90, -184, 4.4, 5], [-91, -172.9, 4.2, 3.9]] as const) {
    dome(b, COAL, x, z, r, h, r > 8 ? 16 : 10);
    // snow lying on the top of each
    const g = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 10, 5), Z.snow);
    g.position.set(x - 0.3, h * 0.74, z - 0.2);
    g.scale.y = (h * 0.3) / (r * 0.6);
    put(b, g, false);
  }
  // the bunker's walls: along the south, and the east either side of the hopper
  const wx0 = R.x0 + 1.5;
  box(b, Z.concrete, (wx0 + Q.x1) / 2, 0.8, Q.z1, Q.x1 - wx0, 1.6, 0.4);
  snow(b, (wx0 + Q.x1) / 2, 1.66, Q.z1, Q.x1 - wx0, 0.14, 0.5);
  for (const [z0, z1] of [[R.z0 + 1.5, -182], [-178, Q.z1]] as const) {
    box(b, Z.concrete, Q.x1, 0.8, (z0 + z1) / 2, 0.4, 1.6, z1 - z0);
    snow(b, Q.x1, 1.66, (z0 + z1) / 2, 0.5, 0.14, z1 - z0);
  }
  solid(c, (Q.x0 + Q.x1) / 2, (Q.z0 + Q.z1) / 2, Q.x1 - Q.x0, Q.z1 - Q.z0, 4, 'zarya-coal', { kind: 'prop' });
  // the hopper at the heap's mouth, and the conveyor climbing east from it to the head house over the hall's back wall
  const hz = -180;
  box(b, RUST, -75.4, 1.5, hz, 3.8, 3, 3);
  box(b, Z.iron, -75.4, 3.06, hz, 4.1, 0.14, 3.3);
  for (const s of [-1, 1]) box(b, Z.iron, -75.4, 1.5, hz + s * 1.52, 3.8, 0.2, 0.06);
  solid(c, -75.4, hz, 4.2, 3.2, 3.2, 'zarya-hopper', { kind: 'prop', surface: 'metal' });
  const x0 = -76;
  const x1 = -54.5;
  const y0 = 2.9;
  const y1 = 12.6;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const L = Math.hypot(x1 - x0, y1 - y0);
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  slab(b, RUST, xm, ym, hz, L, 1.6, 2.2, 0, 0, ang);
  slab(b, Z.snow, xm - Math.sin(ang) * 0.86, ym + Math.cos(ang) * 0.86, hz, L, 0.16, 2.3, 0, 0, ang, false);
  for (const s of [-1, 1]) slab(b, Z.iron, xm + Math.sin(ang) * 0.84, ym - Math.cos(ang) * 0.84, hz + s * 1.05, L, 0.2, 0.14, 0, 0, ang);
  for (let k = -2; k <= 2; k++) slab(b, Z.warm, xm + k * 4.4 * Math.cos(ang), ym + k * 4.4 * Math.sin(ang) + 0.1, hz + 1.12, 1, 0.5, 0.04, 0, 0, ang, false);
  const under = (x: number): number => y0 + ((x - x0) / (x1 - x0)) * (y1 - y0) - 0.95;
  trestle(c, -69.5, hz, under(-69.5), true, 2.6);
  trestle(c, -62, hz, under(-62), true, 2.6);
  // the head house, on legs, a step over the hall's parapet
  const hx = -52.5;
  box(b, RUST, hx, 13.5, -177, 5, 4.2, 10.4);
  snow(b, hx, 15.72, -177, 5.3, 0.24, 10.7);
  box(b, Z.warm, hx, 13.9, -182.23, 2.2, 1, 0.05, 0, false);
  box(b, Z.warm, hx - 2.53, 13.9, -179, 0.05, 1, 1.8, 0, false);
  trestle(c, hx, -180.6, 11.4, false, 4.4);
  // the yard's bulldozer, parked north of the hopper with its blade to the heap
  const lx = -74.2;
  const lz = -185.4;
  for (const s of [-1, 1]) {
    box(b, Z.black, lx, 0.35, lz + s * 0.85, 3.2, 0.7, 0.5);
    for (const dx of [-1.3, 1.3]) run(b, Z.iron, lx + dx, lz + s * 0.58, lx + dx, lz + s * 1.12, 0.38, 0.36, { seg: 10 });
  }
  box(b, YELLOW, lx - 0.2, 1.15, lz, 2.6, 0.9, 1.3);
  box(b, YELLOW, lx + 0.7, 2.1, lz, 1.2, 1.1, 1.3);
  box(b, Z.black, lx + 0.08, 2.2, lz, 0.04, 0.6, 1.1);
  for (const s of [-1, 1]) box(b, Z.black, lx + 0.7, 2.2, lz + s * 0.66, 0.9, 0.6, 0.03);
  snow(b, lx + 0.7, 2.72, lz, 1.3, 0.14, 1.4);
  snow(b, lx - 0.9, 1.66, lz, 1.2, 0.12, 1.3);
  box(b, DUCT, lx - 2.05, 0.6, lz, 0.14, 1.1, 2.5);
  for (const s of [-1, 1]) box(b, Z.iron, lx - 1.6, 0.6, lz + s * 0.9, 0.9, 0.14, 0.14);
  cyl(b, Z.iron, lx - 0.9, 1.6, lz + 0.4, 0.06, 0.06, 0.7, 6);
  solid(c, lx - 0.2, lz, 3.9, 2.5, 2.6, 'zarya-dozer', { kind: 'prop', surface: 'metal' });
  // a lamp on the hopper
  cyl(b, Z.iron, -73.8, 3, hz + 1.4, 0.05, 0.05, 1.6, 5);
  ball(b, Z.bulb, -73.8, 4.6, hz + 1.4, 0.18);
  b.light({ x: -73.2, y: 4.4, z: hz + 1.8, color: SODIUM, intensity: 20, distance: 17, mode: 'steady', pool: 5, glow: 1.2, weight: 0.8 });
}

function pond(c: Ctx): void {
  const { b } = c;
  const Q = TETS.pond;
  const zm = (Q.z0 + Q.z1) / 2;
  const xm = (Q.x0 + Q.x1) / 2;
  flat(b, WATER, Q.x0, Q.z0, Q.x1, Q.z1, 0.3);
  // the low wall along its west and south sides, a rail on it
  for (const x of [Q.x0, Q.x1]) {
    box(b, Z.concrete, x, 0.45, zm, 0.5, 0.9, Q.z1 - Q.z0 + 0.5);
    snow(b, x, 0.96, zm, 0.6, 0.12, Q.z1 - Q.z0 + 0.6);
  }
  box(b, Z.concrete, xm, 0.45, Q.z1, Q.x1 - Q.x0, 0.9, 0.5);
  snow(b, xm, 0.96, Q.z1, Q.x1 - Q.x0, 0.12, 0.6);
  box(b, Z.iron, Q.x0, 1.55, zm, 0.06, 0.06, Q.z1 - Q.z0);
  box(b, Z.iron, xm, 1.55, Q.z1, Q.x1 - Q.x0, 0.06, 0.06);
  for (let z = Q.z0 + 0.4; z <= Q.z1; z += 3.1) box(b, Z.iron, Q.x0, 1.25, z, 0.07, 0.6, 0.07);
  for (let x = Q.x0; x <= Q.x1; x += 3.1) box(b, Z.iron, x, 1.25, Q.z1, 0.07, 0.6, 0.07);
  // nobody walks in it, nor on the strip between it and the plant's fence
  solid(c, (Q.x0 - 0.25 + R.x1) / 2, (R.z0 + Q.z1 + 0.25) / 2, R.x1 - Q.x0 + 0.25, Q.z1 + 0.25 - R.z0, 0.95, 'zarya-pond', { shots: false, kind: 'prop' });
  // ice along its edges and adrift on it, the spray line down its middle, the hall's discharge pipe over the wall
  for (const [x, z, w, d, a] of [[3.6, -150.2, 4, 3, 0.3], [15, -149.8, 5, 3.6, -0.2], [16, -160, 3.6, 6, 0.1], [4, -171, 3, 5, 0.5], [15.6, -177, 4, 5.4, -0.4], [6, -185.4, 7, 4, 0.15], [13, -167, 2.4, 2, 0.8], [9, -157, 2, 2.6, 1.1], [3.4, -180, 2.6, 3.4, -0.3], [14.6, -185.6, 5, 3.6, 0.2]] as const) {
    box(b, Z.ice, x, 0.32, z, w, 0.07, d, a, false);
  }
  run(b, FOIL, 10.4, Q.z0 + 4, 10.4, Q.z1 - 3.5, 1.5, 0.14, { seg: 6 });
  for (let z = Q.z0 + 5; z < Q.z1 - 3; z += 5.6) {
    cyl(b, FOIL, 10.4, 0.3, z, 0.1, 0.1, 1.2, 6);
    cyl(b, Z.iron, 10.4, 1.6, z + 2.8, 0.05, 0.09, 0.3, 6, false);
  }
  const dz = -166;
  run(b, FOIL, H.x1, dz, Q.x0 + 1.6, dz, 4.6, 0.45, { seams: true, snow: true });
  ball(b, FOIL, Q.x0 + 1.6, 4.6, dz, 0.5, 1, 10);
  cyl(b, FOIL, Q.x0 + 1.6, 0.3, dz, 0.45, 0.45, 4.3, 10);
  cyl(b, Z.iron, 0.2, 0, dz, 0.12, 0.12, 4.2, 6);
  solid(c, 0.2, dz, 0.4, 0.4, 4.2, 'zarya-post', { kind: 'none', surface: 'metal' });
  // the steam off it
  for (const [x, y, z, s, k] of [[3.4, 2.2, dz + 0.6, 6, 0.5], [6, 2, -152, 5, 0.34], [13.5, 2.6, -158, 6.5, 0.36], [9, 3, -168, 6, 0.3], [15, 2.2, -175, 6, 0.32], [6.5, 2.6, -182, 6.5, 0.32], [12, 4.4, -150.5, 7, 0.24], [10.4, 2.4, -163, 4, 0.3]] as const) {
    b.glow({ x, y, z, color: 0xc6d4ea, size: s * 1.2, intensity: k * 1.7, mode: 'pulse', period: 5.5 + ((x * 7) % 3), phase: z * 0.37 });
  }
}

function backAlley(c: Ctx): void {
  const { b } = c;
  // the plant's own fence along the north, where the town ends: concrete panels under snow, firs standing before it
  const fz = R.z0 + 1.65;
  const fx0 = R.x0 + 1.5;
  const fx1 = R.x1 - 1.5;
  box(b, Z.concreteDark, (fx0 + fx1) / 2, 1.5, fz, fx1 - fx0, 3, 0.3);
  snow(b, (fx0 + fx1) / 2, 3.07, fz, fx1 - fx0, 0.14, 0.44);
  for (let x = fx0 + 0.2; x <= fx1; x += 6.03) box(b, Z.concrete, x, 1.56, fz, 0.4, 3.12, 0.4);
  solid(c, (R.x0 + R.x1) / 2, R.z0 + 0.9, R.x1 - R.x0, 1.9, 3, 'zarya-beyond', { kind: 'wall' });
  for (const [x, h] of [[-65, 6.4], [-58, 5.6], [-46.5, 6], [-38.5, 6.8], [-16.5, 6.2], [-6, 5.8]] as const) fir(c, x, -186.3, h);
  // two water tanks behind the hall, piped into its back wall overhead
  for (const x of [-30.5, -23]) {
    cyl(b, FOIL, x, 0.3, -182, 2.5, 2.5, 6.8, 14);
    cyl(b, Z.concreteDark, x, 0, -182, 2.8, 2.8, 0.3, 14);
    cyl(b, FOIL, x, 7.1, -182, 2.5, 0.4, 0.8, 14);
    cyl(b, Z.snow, x, 7.3, -182, 1.9, 0.3, 0.66, 14, false);
    for (const y of [2.4, 4.8]) cyl(b, FOIL_SEAM, x, y, -182, 2.53, 2.53, 0.2, 14, false);
    solid(c, x, -182, 4.6, 4.6, 7.4, 'zarya-tank', { kind: 'prop', surface: 'metal' });
    solid(c, x, -182, 4.6, 4.6, 7.4, 'zarya-tank', { rot: Math.PI / 4, kind: 'none', surface: 'metal' });
  }
  run(b, FOIL, -30.5, -179.4, -23, -179.4, 5.2, 0.3);
  run(b, FOIL, -26.75, -179.4, -26.75, H.z0, 5.2, 0.3, { snow: true });
  // a lagged main along the back wall on brackets, over head height
  run(b, FOIL, H.x0 + 3, H.z0 - 0.75, H.x1 - 3, H.z0 - 0.75, 3.6, 0.42, { seams: true, snow: true });
  for (let x = H.x0 + 5; x < H.x1 - 3; x += 7) box(b, Z.iron, x, 3.1, H.z0 - 0.6, 0.1, 0.1, 1.2);
  // a lamp on the wall
  box(b, Z.iron, -40, 5, H.z0 - 0.5, 0.07, 0.07, 1);
  ball(b, Z.bulb, -40, 4.86, H.z0 - 0.95, 0.18);
  b.glow({ x: -40, y: 4.8, z: H.z0 - 1, color: SODIUM, size: 1.4, intensity: 2.2, mode: 'steady' });
  // a skip of clinker
  box(b, RUST, -14, 0.7, -181, 3.4, 1.4, 1.8, 0.2);
  snow(b, -14, 1.46, -181, 3.2, 0.14, 1.6, 0.2);
  solid(c, -14, -181, 3.4, 1.8, 1.4, 'zarya-skip', { rot: 0.2, shots: false, kind: 'prop', surface: 'metal' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the yard south of the road
// ---------------------------------------------------------------------------------------------------------------------

function checkpoint(c: Ctx): void {
  const { b } = c;
  const Q = TETS.booth;
  // the booth: green boards, a lit window to the road and one down it, a roof under snow
  box(b, CAB, Q.x, 1.3, Q.z, 2.6, 2.6, 2.6);
  box(b, Z.concreteDark, Q.x, 0.1, Q.z, 2.9, 0.2, 2.9);
  box(b, Z.warm, Q.x, 1.75, Q.z - 1.32, 1.9, 0.9, 0.05, 0, false);
  box(b, Z.warm, Q.x + 1.32, 1.75, Q.z + 0.1, 0.05, 0.9, 1.7, 0, false);
  for (const dx of [-0.95, 0, 0.95]) box(b, Z.iron, Q.x + dx, 1.75, Q.z - 1.35, 0.07, 0.9, 0.04);
  box(b, Z.concreteDark, Q.x, 2.68, Q.z, 3.3, 0.16, 3.3);
  snow(b, Q.x, 2.88, Q.z, 3.3, 0.24, 3.3);
  box(b, DOOR, Q.x + 1.32, 1.05, Q.z - 0.95, 0.05, 2, 0.5, 0, false);
  solid(c, Q.x, Q.z, 2.7, 2.7, 2.8, 'zarya-booth', { kind: 'building', surface: 'wood' });
  box(b, Z.iron, Q.x + 1.6, 2.5, Q.z - 1.6, 0.6, 0.06, 0.06, Math.PI / 4);
  ball(b, Z.bulb, Q.x + 1.85, 2.4, Q.z - 1.85, 0.15);
  b.light({ x: Q.x + 2.2, y: 2.4, z: Q.z - 2.2, color: SODIUM, intensity: 18, distance: 15, mode: 'steady', pool: 5, glow: 1, weight: 1.1 });
  // (the checkpoint's barrier is the story's own arm across the gate between the frame's posts, `zarya/look.ts`: down
  // until the code is in, then up. A second, always-raised arm here read as the way already being open.)
  const px = -95.4;
  // a no-entry disc on a post north of the road
  cyl(b, Z.iron, px - 1.2, 0, -135.4, 0.05, 0.05, 2.4, 6);
  disc(b, STRIPE, px - 1.16, 2.1, -135.4, 0.36, 0.05, true, 16);
  box(b, LIME, px - 1.12, 2.1, -135.4, 0.02, 0.12, 0.5, 0, false);
  solid(c, px - 1.2, -135.4, 0.3, 0.3, 2.4, 'zarya-pole', { kind: 'none', surface: 'metal' });
  // the keypad: a grey box on a post, its dark face to the road, a red eye over the keys
  const K = TETS.keypad;
  const kz = K.z + 0.75;
  cyl(b, Z.iron, K.x, 0, kz, 0.06, 0.06, 1.2, 6);
  box(b, GREY, K.x, 1.36, kz, 0.36, 0.48, 0.16);
  box(b, Z.black, K.x, 1.32, kz - 0.09, 0.22, 0.3, 0.02, 0, false);
  box(b, Z.redLamp, K.x, 1.53, kz - 0.09, 0.05, 0.04, 0.02, 0, false);
  for (let i = 0; i < 9; i++) box(b, GREY, K.x - 0.06 + (i % 3) * 0.06, 1.38 - Math.floor(i / 3) * 0.07, kz - 0.105, 0.04, 0.04, 0.01, 0, false);
  solid(c, K.x, kz, 0.4, 0.3, 1.6, 'zarya-keypad', { kind: 'none', surface: 'metal' });
}

/** The plant's office: a closed two-storey block, some of its windows lit, a door under a canopy on its east end. */
function office(c: Ctx): void {
  const { b } = c;
  const x = -89;
  const z = -108.5;
  const w = 16;
  const d = 9;
  const h = 7.4;
  box(b, OCHRE, x, h / 2, z, w, h, d);
  box(b, Z.concreteDark, x, 0.4, z, w + 0.12, 0.8, d + 0.12);
  box(b, Z.concreteDark, x, h + 0.14, z, w + 0.5, 0.28, d + 0.5);
  snow(b, x, h + 0.4, z, w + 0.3, 0.26, d + 0.3);
  for (let fl = 0; fl < 2; fl++) {
    const wy = 2.3 + fl * 3.1;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const lit = (i * 7 + fl * 3 + (s > 0 ? 1 : 4)) % 5 < 2;
        box(b, lit ? Z.warm : NIGHT, x - w / 2 + 1.6 + i * 2.56, wy, z + s * (d / 2 + 0.03), 1.3, 1.5, 0.06, 0, false);
      }
      box(b, Z.concrete, x, wy - 0.82, z + s * (d / 2 + 0.07), w - 1.2, 0.09, 0.16);
    }
    for (let i = 0; i < 3; i++) {
      if (fl === 0 && i === 1) continue;
      box(b, (i + fl) % 2 ? Z.warm : NIGHT, x + w / 2 + 0.03, wy, z - 2.8 + i * 2.8, 0.06, 1.5, 1.3, 0, false);
    }
  }
  // the door on the east end: two steps, a canopy, a lamp
  box(b, DOOR, x + w / 2 + 0.05, 1.25, z, 0.08, 2.1, 1.3);
  box(b, Z.concrete, x + w / 2 + 0.7, 0.1, z, 1.4, 0.2, 2.4);
  box(b, Z.concrete, x + w / 2 + 0.8, 2.6, z, 1.6, 0.14, 2.6);
  snow(b, x + w / 2 + 0.8, 2.76, z, 1.6, 0.18, 2.6);
  ball(b, Z.bulb, x + w / 2 + 0.6, 2.4, z, 0.14);
  b.glow({ x: x + w / 2 + 0.7, y: 2.3, z, color: SODIUM, size: 1.2, intensity: 2, mode: 'steady' });
  solid(c, x, z, w, d, h, 'zarya-office', { kind: 'building' });
  drift(b, x - 1, z + d / 2 + 0.5, 12, 2.8, 0.6);
}

/** The fuel oil tank: a long drum on three saddles, a ladder to the hatch on its back. */
function oilTank(c: Ctx): void {
  const { b } = c;
  const x = -38;
  const z = -111;
  run(b, FOIL, x - 5.5, z, x + 5.5, z, 2.7, 2.1, { seams: true, seg: 16 });
  for (const s of [-1, 1]) ball(b, FOIL, x + s * 5.5, 2.7, z, 2.1, 1, 12);
  snow(b, x, 4.72, z, 10.6, 0.3, 2.2);
  for (const dx of [-4, 0, 4]) box(b, Z.concrete, x + dx, 0.6, z, 0.8, 1.2, 3.6);
  cyl(b, FOIL, x + 2, 4.7, z, 0.5, 0.5, 0.5, 10);
  for (const s of [-1, 1]) box(b, Z.iron, x + 2 + s * 0.25, 2.5, z + 2.14, 0.05, 5, 0.05);
  for (let y = 0.4; y < 5; y += 0.4) box(b, Z.iron, x + 2, y, z + 2.14, 0.5, 0.04, 0.04);
  run(b, FOIL, x - 3, z + 2, x - 3, z + 4, 1, 0.2, { seg: 8 });
  cyl(b, Z.iron, x - 3, 0, z + 4, 0.2, 0.2, 1.3, 8);
  solid(c, x, z, 14.8, 4.2, 4.9, 'zarya-oiltank', { kind: 'prop', surface: 'metal' });
  solid(c, x - 3, z + 3.2, 0.6, 2, 1.4, 'zarya-oiltank', { shots: false, kind: 'none', surface: 'metal' });
  drift(b, x + 1, z - 2.3, 8, 2.2, 0.5);
}

/** The coal truck in the yard (its driver stands at `cover`): a cab-over tipper, loaded. */
function truck(c: Ctx): void {
  const { b } = c;
  const x = -25.4;
  const z = -100;
  box(b, Z.iron, x, 0.82, z, 6.2, 0.3, 1.1);
  for (const dx of [-2.1, 1.1, 2.3]) for (const s of [-1, 1]) disc(b, Z.black, x + dx, 0.5, z + s * 1.02, 0.5, 0.34, false, 12);
  // the cab: green, its glass dark, snow on its roof
  box(b, CAB, x - 2.3, 1.85, z, 1.9, 1.8, 2.3);
  box(b, Z.black, x - 3.27, 2.2, z, 0.04, 0.7, 1.9, 0, false);
  for (const s of [-1, 1]) {
    box(b, Z.black, x - 2.4, 2.2, z + s * 1.16, 1, 0.7, 0.04, 0, false);
    ball(b, LIME, x - 3.28, 1.2, z + s * 0.8, 0.13);
  }
  box(b, Z.iron, x - 3.3, 0.85, z, 0.14, 0.3, 2.3);
  snow(b, x - 2.3, 2.82, z, 1.8, 0.16, 2.2);
  // the tipper body and the coal in it
  box(b, RUST, x + 1, 1.25, z, 4.3, 0.2, 2.4);
  for (const s of [-1, 1]) box(b, RUST, x + 1, 1.8, z + s * 1.15, 4.3, 1, 0.1);
  for (const s of [-1, 1]) box(b, RUST, x + 1 + s * 2.1, 1.8, z, 0.1, 1, 2.4);
  for (const [dx, r, h] of [[0, 1.1, 1.05], [1.5, 1, 0.8], [-1.3, 0.95, 0.75]] as const) {
    const g = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), COAL);
    g.position.set(x + 1 + dx, 1.9, z);
    g.scale.y = h / r;
    put(b, g, true);
  }
  solid(c, x, z, 6.6, 2.5, 2.8, 'zarya-truck', { kind: 'prop', surface: 'metal' });
}

function pumpHouse(c: Ctx): void {
  const { b } = c;
  const Q = TETS.pump;
  const h = 4.2;
  const t = 0.4;
  const xc = (Q.x0 + Q.x1) / 2;
  const zc = (Q.z0 + Q.z1) / 2;
  const w = Q.x1 - Q.x0;
  const d = Q.z1 - Q.z0;
  const spec = { height: h, thickness: t, material: 'brick' as const, tag: 'zarya-pump' };
  const win = (at: number) => ({ at, width: 1.6, height: 1.4, sill: 1.2, kind: 'window' as const, lit: true });
  wall(b, { ...spec, x0: Q.x0, z0: Q.z0 + t / 2, x1: Q.x1, z1: Q.z0 + t / 2, openings: [{ at: 6.25, width: 2.2, height: 2.6, kind: 'door' }, win(10.2)] });
  wall(b, { ...spec, x0: Q.x0, z0: Q.z1 - t / 2, x1: Q.x1, z1: Q.z1 - t / 2 });
  wall(b, { ...spec, x0: Q.x0 + t / 2, z0: Q.z0, x1: Q.x0 + t / 2, z1: Q.z1, openings: [win(4), win(8.5)] });
  wall(b, { ...spec, x0: Q.x1 - t / 2, z0: Q.z0, x1: Q.x1 - t / 2, z1: Q.z1 });
  flat(b, Z.paving, Q.x0 + t, Q.z0 + t, Q.x1 - t, Q.z1 - t, 0.03);
  box(b, Z.concreteDark, xc, h + 0.15, zc, w + 0.6, 0.3, d + 0.6);
  snow(b, xc, h + 0.43, zc, w + 0.5, 0.26, d + 0.5);
  b.collide({ x: xc, z: zc, hx: w / 2, hz: d / 2, y0: h, y1: h + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: xc, z: zc, hx: w / 2, hz: d / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });
  // the door's leaf stood open, a lamp over the door
  box(b, DOOR, Q.x0 + 6.25 - 1.15, 1.3, Q.z0 - 1.05, 0.08, 2.6, 2.1);
  ball(b, Z.bulb, Q.x0 + 6.25, 3.3, Q.z0 - 0.4, 0.16);
  box(b, Z.iron, Q.x0 + 6.25, 3.44, Q.z0 - 0.2, 0.06, 0.06, 0.4);
  b.glow({ x: Q.x0 + 6.25, y: 3.2, z: Q.z0 - 0.5, color: SODIUM, size: 1.3, intensity: 2.2, mode: 'steady' });
  solid(c, Q.x0 + 6.25 - 1.15, Q.z0 - 1.05, 0.2, 2.1, 2.6, 'zarya-door', { kind: 'none', surface: 'metal' });

  // ---- inside: the bench along the south wall (the pressure valve lies on it), two pump sets by the east wall
  // under their header, an expansion tank by the west one ----
  const V = TETS.valve;
  box(b, BENCH, V.x, 0.9, V.z + 0.05, 6, 0.1, 0.8);
  for (const s of [-2.8, 0, 2.8]) box(b, Z.iron, V.x + s, 0.43, V.z + 0.05, 0.08, 0.86, 0.7);
  box(b, BENCH, V.x, 0.3, V.z + 0.05, 5.6, 0.06, 0.6, 0, false);
  box(b, Z.iron, V.x - 2.3, 1.07, V.z - 0.05, 0.34, 0.24, 0.26);
  box(b, STRIPE, V.x + 2.2, 1.08, V.z + 0.1, 0.6, 0.26, 0.34);
  for (let i = 0; i < 4; i++) cyl(b, i % 2 ? FOIL : BRASS, V.x - 1.5 + i * 0.22, 0.95, V.z + 0.2, 0.06, 0.06, 0.12 + (i % 3) * 0.05, 6, false);
  box(b, BENCH, V.x, 2, Q.z1 - t - 0.04, 5.4, 1.2, 0.06, 0, false);
  for (let i = 0; i < 10; i++) box(b, Z.iron, V.x - 2.3 + i * 0.5, 2 + ((i * 3) % 4) * 0.1, Q.z1 - t - 0.09, 0.07, 0.46 + (i % 3) * 0.1, 0.03, ((i * 5) % 3) * 0.2 - 0.2, false);
  solid(c, V.x, V.z + 0.05, 6, 0.8, 1, 'zarya-bench', { shots: false, kind: 'prop', surface: 'wood' });
  const px = Q.x1 - t - 2.2;
  for (const pz of [-107.2, -102.6]) {
    box(b, Z.concreteDark, px, 0.2, pz, 1.4, 0.4, 3.2);
    run(b, BOILER, px, pz - 1.4, px, pz - 0.05, 0.95, 0.5, { seg: 12 });
    for (let k = 0; k < 5; k++) run(b, DUCT, px, pz - 1.25 + k * 0.26, px, pz - 1.17 + k * 0.26, 0.95, 0.54, { seg: 12 });
    run(b, Z.iron, px, pz - 0.05, px, pz + 0.35, 0.95, 0.16, { seg: 8 });
    run(b, Z.iron, px, pz + 0.35, px, pz + 0.95, 0.95, 0.62, { seg: 14 });
    cyl(b, FOIL, px, 1.4, pz + 0.65, 0.2, 0.2, 2.1, 8);
    run(b, FOIL, px, pz + 0.65, Q.x1 - t, pz + 0.65, 0.95, 0.2, { seg: 8 });
    disc(b, LIME, px - 0.24, 2, pz + 0.65, 0.16, 0.05, true, 10);
    solid(c, px, pz, 1.4, 3.3, 1.6, 'zarya-pumpset', { kind: 'prop', surface: 'metal' });
  }
  run(b, FOIL, px, Q.z0 + t, px, Q.z1 - t, 3.5, 0.26, { seams: true });
  cyl(b, FOIL, Q.x0 + t + 1.3, 0.2, -104.2, 0.9, 0.9, 2.5, 12);
  cyl(b, FOIL, Q.x0 + t + 1.3, 2.7, -104.2, 0.9, 0.3, 0.4, 12);
  cyl(b, Z.concreteDark, Q.x0 + t + 1.3, 0, -104.2, 1, 1, 0.2, 12);
  cyl(b, FOIL, Q.x0 + t + 1.3, 3.1, -104.2, 0.12, 0.12, 1.1, 6);
  disc(b, LIME, Q.x0 + t + 2.22, 1.7, -104.2, 0.18, 0.05, true, 10);
  solid(c, Q.x0 + t + 1.3, -104.2, 1.9, 1.9, 3, 'zarya-tank', { kind: 'prop', surface: 'metal' });
  pendant(b, xc - 0.5, zc - 0.5, h, 3.3, true, 30);

  // ---- outside: the mains to the hall climb the north wall and cross the road on trestles ----
  const bx = [Q.x0 + 1.5, Q.x0 + 2.7] as const;
  const turn = [-141, -142.2] as const;
  bx.forEach((x, i) => {
    cyl(b, FOIL, x, 0, Q.z0 - 0.5, 0.42, 0.42, PIPE_Y, 10);
    ball(b, FOIL, x, PIPE_Y, Q.z0 - 0.5, 0.46, 1, 10);
    run(b, FOIL, x, Q.z0 - 0.5, x, turn[i]!, PIPE_Y, 0.42, { seams: true, snow: true });
    ball(b, FOIL, x, PIPE_Y, turn[i]!, 0.46, 1, 10);
    run(b, FOIL, x, turn[i]!, H.x1 - T - 0.8, turn[i]!, PIPE_Y, 0.42, { seams: true, snow: true });
  });
  solid(c, Q.x0 + 2.1, Q.z0 - 0.5, 2.2, 1, PIPE_Y, 'zarya-pipes', { kind: 'prop', surface: 'metal' });
  const mx = Q.x0 + 2.1;
  trestle(c, mx, -118.5, PIPE_Y - 0.42, false);
  trestle(c, mx, -137.4, PIPE_Y - 0.42, false);
  trestle(c, 0, -141.6, PIPE_Y - 0.42, true);
  // a beam under the long span over the road
  for (const s of [-1, 1]) box(b, Z.iron, mx + s * 0.9, PIPE_Y - 0.62, -128, 0.14, 0.3, 19);
  for (let z = -136; z < -119; z += 2.4) box(b, Z.iron, mx, PIPE_Y - 0.62, z, 1.9, 0.1, 0.1);
}

/** The heat mains out to the west: two lagged pipes on trestles along the yard's south side, down into the pump house's wall. */
function mains(c: Ctx): void {
  const { b } = c;
  const Q = TETS.pump;
  const zs = [-96.6, -95.4] as const;
  const ends = [Q.x0 + 4.9, Q.x0 + 6.1] as const;
  const xw = -101.4;
  zs.forEach((z, i) => {
    const xe = ends[i]!;
    run(b, FOIL, xw, z, xe, z, MAINS_Y, 0.45, { seams: true, snow: true });
    // down into the ground at the west end, on their way to the Institute
    ball(b, FOIL, xw, MAINS_Y, z, 0.5, 1, 10);
    cyl(b, FOIL, xw, 0, z, 0.45, 0.45, MAINS_Y, 10);
    ball(b, FOIL, xe, MAINS_Y, z, 0.5, 1, 10);
    cyl(b, FOIL, xe, 2.6, z, 0.45, 0.45, MAINS_Y - 2.6, 10);
    ball(b, FOIL, xe, 2.6, z, 0.5, 1, 10);
    run(b, FOIL, xe, z, xe, Q.z1, 2.6, 0.45);
  });
  solid(c, Q.x0 + 5.5, -96.5, 2.3, 3, MAINS_Y + 0.5, 'zarya-pipes', { kind: 'prop', surface: 'metal' });
  solid(c, xw, -96, 1.1, 2.3, MAINS_Y + 0.5, 'zarya-pipes', { kind: 'prop', surface: 'metal' });
  for (const x of [-98, -84, -70, -50, -37, -24, -11, 2.5]) trestle(c, x, -96, MAINS_Y - 0.45, true);
  // a beam under the span over the lane
  for (const s of [-1, 1]) box(b, Z.iron, -60, MAINS_Y - 0.66, -96 + s * 1.15, 20, 0.3, 0.14);
}

/** What stands about: lamp posts, firs along the south fence, drifts against the walls. */
function dressing(c: Ctx): void {
  const { b } = c;
  for (const [x, z, lit] of [[-38, -135.7, true], [13.6, -136.6, true], [-78, -124.4, true], [-54.6, -108, true], [-1.6, -148.4, true], [-70.5, -89.4, false], [-20, -89.4, false], [-8, -124.4, false], [-80, -139, false]] as const) lampPost(c, x, z, lit);
  for (const [x, z, h] of [[-99.5, -73.3, 5.3], [-92, -73.5, 4.6], [-29.5, -73.4, 5.2], [-18, -73.3, 5.4], [-7, -73.5, 4.8], [5, -73.3, 5.4], [14, -73.5, 5], [-100.6, -116.5, 5.4], [-76.5, -102, 4.6], [16.2, -121.5, 5.2]] as const) fir(c, x, z, h);
  // a stack of spare pipe by the lane, under snow
  for (let i = 0; i < 5; i++) run(b, i % 2 ? RUST : FOIL, -53.2, -116.6 + i * 0.9 - (i > 2 ? 2.25 : 0), -47.2, -116.6 + i * 0.9 - (i > 2 ? 2.25 : 0), i > 2 ? 1.2 : 0.44, 0.42, { seg: 10 });
  snow(b, -50.2, 1.66, -115.7, 6, 0.14, 1.9);
  solid(c, -50.2, -115.7, 6.2, 2.9, 1.7, 'zarya-pipestack', { shots: false, kind: 'prop', surface: 'metal' });
}

/** The transformers: two of them on a pad behind a mesh fence nobody goes through. */
function substation(c: Ctx): void {
  const { b } = c;
  const x0 = -20;
  const x1 = -8;
  const z0 = -117.6;
  const z1 = -108.6;
  flat(b, Z.paving, x0, z0, x1, z1, 0.02);
  for (const x of [-17, -11]) {
    const z = (z0 + z1) / 2;
    box(b, Z.concreteDark, x, 0.2, z, 3, 0.4, 3.4);
    box(b, PANEL, x, 1.5, z, 2, 2.2, 1.5);
    for (const s of [-1, 1]) for (let k = 0; k < 7; k++) box(b, DUCT, x - 0.84 + k * 0.28, 1.5, z + s * 1.1, 0.08, 1.7, 0.7);
    run(b, PANEL, x - 0.9, z, x + 0.9, z, 3.1, 0.34, { seg: 10 });
    snow(b, x, 3.42, z, 1.7, 0.12, 0.5);
    for (const dx of [-0.6, 0, 0.6]) {
      cyl(b, RUST, x + dx, 2.6, z - 0.5, 0.12, 0.07, 0.9, 8);
      for (const y of [2.8, 3.05, 3.3]) cyl(b, RUST, x + dx, y, z - 0.5, 0.2, 0.2, 0.06, 8, false);
    }
    solid(c, x, z, 2.2, 3, 3.4, 'zarya-transformer', { kind: 'prop', surface: 'metal' });
  }
  // the fence: posts and three wires, a yellow warning plate on its north side
  const post = (x: number, z: number): void => void cyl(b, Z.iron, x, 0, z, 0.05, 0.05, 2.4, 5);
  for (let x = x0; x <= x1 + 0.1; x += 3) for (const z of [z0, z1]) post(x, z);
  for (let z = z0 + 3; z < z1 - 0.1; z += 3) for (const x of [x0, x1]) post(x, z);
  for (const y of [0.5, 1.4, 2.3]) {
    for (const z of [z0, z1]) box(b, Z.iron, (x0 + x1) / 2, y, z, x1 - x0, 0.04, 0.04);
    for (const x of [x0, x1]) box(b, Z.iron, x, y, (z0 + z1) / 2, 0.04, 0.04, z1 - z0);
  }
  for (const x of [x0 + 3, x1 - 3]) for (const t of [-1, 1]) slab(b, Z.iron, x + t * 1.5, 1.4, z0, 0.03, 3.5, 0.03, 0, 0, t * 1.03);
  disc(b, YELLOW, (x0 + x1) / 2, 1.5, z0 - 0.04, 0.42, 0.04, false, 3);
  box(b, Z.black, (x0 + x1) / 2, 1.48, z0 - 0.07, 0.07, 0.3, 0.02, 0, false);
  solid(c, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 0.2, z1 - z0 + 0.2, 2.4, 'zarya-beyond', { shots: false, kind: 'none', surface: 'metal' });
  snow(b, (x0 + x1) / 2, 0.12, z1 + 0.5, x1 - x0 - 1, 0.3, 1.2);
}

/** The honour board by the lane: a red panel on two posts, the best of the shift in two rows, a gold star over them. */
function honourBoard(c: Ctx): void {
  const { b } = c;
  const x = -70.6;
  const z = -121.4;
  for (const s of [-1, 1]) box(b, Z.concrete, x + s * 2.7, 1.5, z, 0.3, 3, 0.3);
  box(b, DOOR, x, 1.9, z, 5.2, 1.9, 0.14);
  box(b, Z.concrete, x, 0.35, z, 5.2, 0.7, 0.24);
  snow(b, x, 2.92, z, 5.9, 0.16, 0.44);
  for (let i = 0; i < 8; i++) {
    const px = x - 1.8 + (i % 4) * 1.2;
    const py = 2.3 - Math.floor(i / 4) * 0.84;
    box(b, LIME, px, py, z - 0.08, 0.56, 0.68, 0.03, 0, false);
    box(b, i % 3 === 0 ? NIGHT : DUCT, px, py + 0.04, z - 0.1, 0.36, 0.44, 0.02, 0, false);
  }
  disc(b, BRASS, x, 3.3, z, 0.3, 0.1, false, 5);
  solid(c, x, z, 5.8, 0.4, 3, 'zarya-board', { kind: 'none', surface: 'wood' });
}

/** What lies about the yard: the snow the plough heaped at the corners, pallets, a cable drum. */
function yard(c: Ctx): void {
  const { b } = c;
  for (const [x, z, r, h] of [[-66.6, -118, 2.5, 1.4], [-53, -122.8, 2.7, 1.6], [-66.9, -91.6, 2.3, 1.2], [-52.8, -91.2, 2.5, 1.4], [-24, -123.2, 2.6, 1.4], [2.6, -137.2, 2.4, 1.3], [17, -137.6, 1.4, 0.8], [-99.5, -139, 2.4, 1.3], [-9.5, -90.4, 2.2, 1.1], [-88, -90.6, 2.4, 1.2]] as const) {
    const g = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), Z.snow);
    g.position.set(x, 0, z);
    g.scale.set(1, h / r, 0.8);
    put(b, g, false);
    solid(c, x, z, r * 1.3, r * 1.05, h * 0.8, 'zarya-snowheap', { shots: false, kind: 'none' });
  }
  // pallets of brick by the pump house, a cable drum by the transformers
  for (const [x, z, a] of [[3.2, -103.2, 0.1], [3.4, -105.4, -0.15], [1.9, -104.4, 0.3]] as const) {
    box(b, BENCH, x, 0.08, z, 1.3, 0.16, 1.1, a);
    box(b, RUST, x, 0.66, z, 1.2, 1, 1, a);
    snow(b, x, 1.22, z, 1.2, 0.14, 1, a);
  }
  solid(c, 2.9, -104.3, 2.8, 3.6, 1.2, 'zarya-pallets', { shots: false, kind: 'prop', surface: 'concrete' });
  for (const s of [-1, 1]) disc(b, BENCH, -23.4 + s * 0.5, 1.05, -105.6, 1.05, 0.08, true, 16);
  run(b, DUCT, -23.9, -105.6, -22.9, -105.6, 1.05, 0.7, { seg: 12 });
  snow(b, -23.4, 2.08, -105.6, 1.1, 0.12, 0.8);
  solid(c, -23.4, -105.6, 1.2, 2.1, 2.1, 'zarya-drum', { shots: false, kind: 'none', surface: 'wood' });
}

export function buildTets(c: Ctx): TetsHandles {
  ground(c);
  hallShell(c);
  hallInside(c);
  chimney(c);
  newPipe(c);
  coalYard(c);
  pond(c);
  backAlley(c);
  checkpoint(c);
  office(c);
  oilTank(c);
  truck(c);
  pumpHouse(c);
  mains(c);
  substation(c);
  honourBoard(c);
  yard(c);
  dressing(c);
  return {};
}
