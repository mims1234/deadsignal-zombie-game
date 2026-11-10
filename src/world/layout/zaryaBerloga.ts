/**
 * ZARYA: the BERLOGA hall, under the Institute (`zarya/zones/berloga.ts`; an interior built beside the map), built
 * from the `bh-*` reference pictures. From the west: the freight lift's landing, the wall with the blast door and its
 * four key slots, then the hall: glass-fronted dens along the north wall with a bear asleep in each, two rows of iron
 * beds along the south wall, an open floor between them, and at the east end, two steps up, the gallery with the
 * purge console in front of the tank of reagent. Cold light throughout: pale blue and pale green.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import type { BoxCollider } from '../collision';
import type { FloorLink } from '../floors';
import { groundRect, wall } from '../structures';
import type { Ctx } from './util';
import { BERLOGA } from '../../zarya/zones/berloga';
import { Z, box as kitBox, cyl as kitCyl, slab as kitSlab, solid } from './zaryaKit';

const Q = BERLOGA;
const R = Q.rect;
const H = Q.h;
const DX = Q.doorX;
const DH = Q.doorHalf;
/** The landing: its west wall, its half-width. The hall: its west, east, north and south faces. */
const LW = 502.1;
const LZ = 7;
const HX0 = DX + 0.35;
const HX1 = R.x1 - 0.4;
const HZ = R.z1 - 0.4;
/** The gallery: the foot of its first step, its edge, its height. */
const SX = 548.2;
const GX = 548.8;
const GY = 0.5;
/** The dens: where the row starts, how many, how wide each, their glass fronts' z. */
const DEN = { x0: 514.5, n: 6, w: 5, z: -12.6, h: 3.5 };
/** The beds: the two rows' z (their heads are to the south), the first one's x, how far apart, how many in a row. */
const BEDS = { rows: [HZ - 1.15, 11.9], x0: 516, step: 2.7, n: 10 };
/** The tank of reagent behind the console. */
const TANK = { x: 558, z: 0, r: 1.9 };


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

/** Nothing down here throws a shadow: there is no sun. */
const box = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0, _cast = false): THREE.Mesh => kitBox(b, mat, x, y, z, sx, sy, sz, rot, false);
const cyl = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8, _cast = false): void => kitCyl(b, mat, x, y, z, r0, r1, h, seg, false);
const slab = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number, _cast = false): void => kitSlab(b, mat, x, y, z, sx, sy, sz, rx, ry, rz, false);
const ball = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 8): void => blob(b, mat, x, y, z, r, r * sy, r, 0, seg);

const std = (color: number, roughness = 0.85): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness });
const STRAW = std(0xb59a4c);
const STRAW2 = std(0x9a8038);
const FUR = std(0x5a3d26);
const FUR2 = std(0x6e4a2c);
const TAN = std(0xb08a5a);
const DENWALL = std(0x6fc08d);
const BLANKET = std(0x6d7480);
const SKIN = std(0xdcc0a8);
const HAIR = [std(0x2c2118), std(0x6a4a2a), std(0x9a9488), std(0x4a3524)];
const PALE = std(0xcfe0e6);
const YELLOW = std(0xc9a227);
const PAINTED = std(0x56616d);
/** The four keys' colours, north to south: the cosmonaut's dark blue, the sun's orange, the sheaf's teal, the dove's light blue. */
const TAGS = [0x24406e, 0xc9601e, 0x2c6a66, 0x3d78b8].map((c) => std(c));

/** A flat disc whose face looks along x (or z). */
function flat(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, axis: 'x' | 'z', seg = 14, thick = 0.04): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thick, seg), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  else m.rotation.x = Math.PI / 2;
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

/** A pipe from one point to another. */
function pipe(b: LevelBuilder, mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, seg = 8): void {
  const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.add(m, { cast: false, receive: true });
}

/** A pipe white with frost: sleeves of rime along it, and (when it runs level) icicles under them. */
function frosted(b: LevelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, every = 2.2): void {
  pipe(b, M.grey, x0, y0, z0, x1, y1, z1, r);
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const level = Math.abs(y1 - y0) < 0.1;
  const n = Math.max(1, Math.floor(len / every));
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.2 + ((i * 7) % 3) * 0.1) / n;
    const t1 = Math.min(1, t0 + (0.5 + ((i * 5) % 3) * 0.2) / len);
    const at = (t: number): [number, number, number] => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t];
    const [ax, ay, az] = at(t0);
    const [bx, by, bz] = at(t1);
    pipe(b, M.snow, ax, ay, az, bx, by, bz, r + 0.035);
    if (level) for (let k = 0; k < 3; k++) cyl(b, M.snow, ax + ((bx - ax) * (k + 0.5)) / 3, ay - r - 0.2 - (k % 2) * 0.12, az + ((bz - az) * (k + 0.5)) / 3, 0, 0.035, 0.22 + (k % 2) * 0.12, 4, false);
  }
}

/** A lamp hanging from the ceiling: an iron shade, a cold bulb. */
function pendant(b: LevelBuilder, x: number, z: number, y: number): void {
  box(b, M.iron, x, (H + y + 0.3) / 2, z, 0.03, H - y - 0.3, 0.03, 0, false);
  cyl(b, M.iron, x, y, z, 0.42, 0.1, 0.3, 10, false);
  ball(b, M.ice, x, y - 0.02, z, 0.14);
}

/** A bank of steel cabinets on the gallery's east wall: small lamps, a gauge. */
function cabinets(c: Ctx, z0: number, z1: number, seed: number): void {
  const { b } = c;
  const x = HX1 - 0.36;
  const n = Math.round((z1 - z0) / 1.5);
  const w = (z1 - z0) / n;
  let s = (seed * 7919 + 13) >>> 0;
  const r = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const z = z0 + (i + 0.5) * w;
    const hh = 2.2 + (i % 3 === 1 ? 0.3 : 0);
    box(b, M.locker, x, GY + hh / 2, z, 0.7, hh, w - 0.06);
    box(b, M.black, x - 0.36, GY + 1.5, z, 0.02, 0.8, w - 0.34, 0, false);
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 4; k++) {
        const q = r();
        if (q < 0.35) continue;
        box(b, q > 0.92 ? M.redLamp : q > 0.6 ? M.ice : q > 0.5 ? M.blueLamp : M.steel, x - 0.38, GY + 1.25 + row * 0.22, z - 0.39 + k * 0.26, 0.02, 0.07, 0.07, 0, false);
      }
    }
    if (i % 2 === 0) flat(b, M.white, x - 0.38, GY + 0.7, z - 0.2, 0.12, 'x', 10, 0.02);
    box(b, M.iron, x - 0.37, GY + 0.66, z + 0.24, 0.02, 0.2, 0.3, 0, false);
  }
  solid(c, x, (z0 + z1) / 2, 0.72, z1 - z0, GY + 2.3, 'zarya-cabinets', { kind: 'prop', surface: 'metal' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the shell: earth, walls, floor, ceiling
// ---------------------------------------------------------------------------------------------------------------------

function shell(c: Ctx): void {
  const { b } = c;
  const xc = (R.x0 + R.x1) / 2;
  // the earth it is dug into: a dark block round it all, so no sky shows anywhere
  const earth = new THREE.Mesh(new THREE.BoxGeometry(R.x1 - R.x0 + 8, 14, R.z1 - R.z0 + 8), new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1, side: THREE.BackSide }));
  earth.position.set(xc, 5, 0);
  b.add(earth, { cast: false, receive: false });
  const W = (x0: number, z0: number, x1: number, z1: number, t = 0.4, openings?: { at: number; width: number; height: number }[]): void => {
    wall(b, { x0, z0, x1, z1, height: H, thickness: t, material: 'concreteWall', tag: 'zarya-berloga', cast: false, openings: openings?.map((o) => ({ ...o, kind: 'door' as const, frame: 'steelDark' as const })) });
  };
  // the landing: the lift's doorway in its west wall
  W(LW, -LZ, LW, LZ, 0.4, [{ at: LZ, width: 2.6, height: 2.7 }]);
  W(LW, -LZ, DX, -LZ);
  W(LW, LZ, DX, LZ);
  // the wall across the hall, and the one way through it
  W(DX, R.z0, DX, R.z1, 0.7, [{ at: -R.z0, width: DH * 2, height: 3 }]);
  // the hall
  W(DX, R.z0 + 0.2, R.x1, R.z0 + 0.2);
  W(DX, R.z1 - 0.2, R.x1, R.z1 - 0.2);
  W(R.x1 - 0.2, R.z0, R.x1 - 0.2, R.z1);
  // the earth either side of the landing is solid
  for (const s of [-1, 1]) solid(c, (R.x0 + DX) / 2, s * (LZ + R.z1) / 2, DX - R.x0, R.z1 - LZ, H, 'zarya-beyond', { kind: 'none' });
  // floor, ceiling (a roof overhead: indoors), beams across it, pilasters down the south wall
  groundRect(b, M.concreteDark, R.x0, R.z0, R.x1, R.z1, 0.02);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), M.concreteDark);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(xc, H - 0.02, 0);
  b.add(ceil, { cast: false, receive: true });
  b.collide({ x: xc, z: 0, hx: (R.x1 - R.x0) / 2 + 1, hz: (R.z1 - R.z0) / 2 + 1, y0: H, y1: H + 0.4, mapKind: 'none', tag: 'roof' });
  for (let x = 516; x < HX1; x += 6) {
    box(b, M.concrete, x, H - 0.3, 0, 0.5, 0.6, 2 * HZ, 0, false);
    box(b, M.concrete, x, H / 2, HZ - 0.12, 0.6, H, 0.24, 0, false);
  }
  // a walkway of gratings down the middle of the floor, a painted line along the dens
  for (let x = 515.5; x < SX - 2; x += 3.2) {
    box(b, M.iron, x, 0.03, 0, 2.6, 0.02, 1.5, 0, false);
    for (let k = 0; k < 5; k++) box(b, M.black, x - 1 + k * 0.5, 0.035, 0, 0.12, 0.02, 1.3, 0, false);
  }
  box(b, YELLOW, (DEN.x0 + DEN.x0 + DEN.n * DEN.w) / 2, 0.03, DEN.z + 1.3, DEN.n * DEN.w, 0.02, 0.1, 0, false);
}

// ---------------------------------------------------------------------------------------------------------------------
// the landing and the blast door
// ---------------------------------------------------------------------------------------------------------------------

function landing(c: Ctx): void {
  const { b } = c;
  const xf = LW + 0.2;
  // the lift's foot: steel doors drawn open either side, the shaft dark behind
  for (const s of [-1, 1]) {
    box(b, M.steel, xf + 0.06, 1.35, s * 1.62, 0.1, 2.7, 0.66);
    box(b, M.iron, xf + 0.12, 1.35, s * 1.3, 0.04, 2.7, 0.06, 0, false);
    for (let k = 0; k < 4; k++) slab(b, k % 2 ? M.black : YELLOW, xf + 0.12, 0.2 + k * 0.2, s * 1.64, 0.02, 0.14, 0.7, 0.6 * s, 0, 0, false);
    box(b, M.iron, R.x0 + 1, 1.4, s * 1.32, 1.9, 2.8, 0.06, 0, false);
  }
  box(b, M.black, R.x0 + 0.2, 1.4, 0, 0.06, 2.8, 2.7, 0, false);
  box(b, M.black, R.x0 + 1, 2.76, 0, 1.9, 0.06, 2.7, 0, false);
  box(b, M.iron, R.x0 + 1, 0.035, 0, 1.9, 0.03, 2.6, 0, false);
  for (const dz of [-0.4, 0.4]) box(b, M.iron, R.x0 + 0.5, 1.6, dz, 0.05, 3, 0.05, 0, false);
  for (let k = 0; k < 9; k++) box(b, k % 2 ? M.black : YELLOW, xf + 0.3, 0.035, -1.2 + k * 0.3, 0.26, 0.03, 0.3, 0, false);
  solid(c, (R.x0 + xf) / 2, 0, xf - R.x0, 2.6, H, 'zarya-lift', { kind: 'none', surface: 'metal' });
  // the call panel, the floor lamps over the doors
  box(b, M.grey, xf + 0.06, 1.3, 2.5, 0.1, 0.5, 0.34);
  box(b, M.redLamp, xf + 0.12, 1.42, 2.5, 0.03, 0.07, 0.07, 0, false);
  box(b, M.black, xf + 0.12, 1.24, 2.5, 0.03, 0.07, 0.07, 0, false);
  box(b, M.black, xf + 0.04, 3.2, 0, 0.06, 0.3, 1.2, 0, false);
  box(b, M.blueLamp, xf + 0.08, 3.2, 0.3, 0.03, 0.12, 0.12, 0, false);
  // green to the shoulder on the landing's walls
  for (const s of [-1, 1]) box(b, M.green, (xf + DX) / 2, 0.8, s * (LZ - 0.22), DX - xf - 0.6, 1.6, 0.04, 0, false);
  // along the north wall: lockers, white coats on hooks; along the south: gas bottles in a rack, bales of straw, a trolley
  for (let i = 0; i < 5; i++) {
    box(b, M.locker, 503.6 + i * 0.92, 0.95, -LZ + 0.5, 0.88, 1.9, 0.56);
    box(b, M.iron, 503.9 + i * 0.92, 1.2, -LZ + 0.8, 0.05, 0.12, 0.03, 0, false);
  }
  solid(c, 505.44, -LZ + 0.5, 4.7, 0.62, 1.9, 'zarya-lockers', { kind: 'prop', surface: 'metal' });
  box(b, M.woodDark, 509.4, 1.8, -LZ + 0.24, 2.4, 0.08, 0.06, 0, false);
  for (let i = 0; i < 4; i++) box(b, M.white, 508.5 + i * 0.6, 1.25, -LZ + 0.36, 0.42, 1.05, 0.18, 0, false);
  for (let i = 0; i < 4; i++) {
    cyl(b, i % 2 ? M.blue : M.steel, 503.5 + i * 0.5, 0, LZ - 0.5, 0.17, 0.17, 1.4, 8);
    cyl(b, M.iron, 503.5 + i * 0.5, 1.4, LZ - 0.5, 0.06, 0.1, 0.18, 6, false);
    cyl(b, M.snow, 503.5 + i * 0.5, 1.56, LZ - 0.5, 0.08, 0.06, 0.05, 6, false);
  }
  box(b, M.iron, 504.25, 0.9, LZ - 0.28, 2.1, 0.05, 0.05, 0, false);
  solid(c, 504.25, LZ - 0.5, 2.2, 0.6, 1.6, 'zarya-bottles', { kind: 'none', surface: 'metal' });
  for (const [x, y, rot] of [[506.6, 0.25, 0], [507.7, 0.25, 0.1], [507.1, 0.75, -0.1]] as const) {
    box(b, STRAW, x, y, LZ - 0.6, 1.0, 0.5, 0.7, rot);
    for (const s of [-0.25, 0.25]) box(b, STRAW2, x + s, y, LZ - 0.6, 0.04, 0.52, 0.72, rot, false);
  }
  solid(c, 507.15, LZ - 0.6, 2.3, 0.8, 1, 'zarya-bales', { shots: false, kind: 'none', surface: 'wood' });
  // light: a cold strip overhead
  box(b, M.grey, 506.8, H - 0.06, 0, 2.6, 0.08, 0.3, 0, false);
  box(b, M.ice, 506.8, H - 0.12, 0, 2.4, 0.04, 0.16, 0, false);
  b.light({ x: 506.8, y: H - 1, z: 0, color: 0xbfe0ff, intensity: 22, distance: 16, mode: 'steady', pool: 6, weight: 1 });

  // ---- the blast door: a slab of steel that runs along the wall on a rail (the slab itself is the story's to move:
  // `zarya/look.ts` draws it, across the opening while it is shut and here in its bay, north of the opening, once the
  // four keys are in). What is built here is the rail it hangs from, the guide in the floor, the bay's back plate ----
  const wx = DX - 0.35;
  const dz = -DH - 0.2 - 1.7;
  const run = 2 * DH + 4.1;
  box(b, M.iron, wx - 0.24, 3.38, -1.75, 0.5, 0.16, run);
  box(b, M.iron, wx - 0.24, 0.035, -1.75, 0.2, 0.05, run);
  for (let k = 0; k < 6; k++) box(b, M.steel, wx - 0.12, 3.56, -DH - 3.6 + k * 1.4, 0.26, 0.24, 0.12);
  box(b, M.iron, wx - 0.24, 1.7, -DH - 3.86, 0.5, 3.4, 0.14);
  box(b, M.iron, wx - 0.03, 1.65, dz, 0.04, 3.2, 3.4);
  for (let k = 0; k < 9; k++) slab(b, k % 2 ? M.black : YELLOW, wx - 0.06, 0.3, dz - 1.5 + k * 0.375, 0.02, 0.5, 0.2, 0.6, 0, 0);
  for (let k = 0; k < 9; k++) slab(b, k % 2 ? M.black : YELLOW, wx - 0.06, 3.0, dz - 1.5 + k * 0.375, 0.02, 0.5, 0.2, 0.6, 0, 0);
  solid(c, wx - 0.24, dz, 0.5, 3.4, 3.3, 'zarya-blastleaf', { kind: 'none', surface: 'metal' });
  // the opening's steel frame on both faces, hazard stripes across its sill, a red lamp over it either side
  for (const f of [-1, 1]) {
    const fx = DX + f * 0.38;
    for (const s of [-1, 1]) box(b, M.steel, fx, 1.55, s * (DH + 0.14), 0.1, 3.1, 0.3, 0, false);
    box(b, M.steel, fx, 3.14, 0, 0.1, 0.3, DH * 2 + 0.58, 0, false);
    box(b, M.redLamp, fx + f * 0.06, 3.6, 0, 0.08, 0.2, 0.3, 0, false);
    box(b, M.iron, fx + f * 0.04, 3.6, 0, 0.06, 0.34, 0.44, 0, false);
  }
  for (let k = 0; k < 10; k++) box(b, k % 2 ? M.black : YELLOW, DX, 0.035, -DH + 0.16 + k * 0.32, 1.1, 0.03, 0.32, 0, false);
  // ---- the panel of four key slots, south of the opening: each slot under its enamel tag ----
  const S = Q.slots;
  box(b, M.locker, wx - 0.06, 1.45, S.z, 0.12, 1.1, 1.6);
  box(b, M.iron, wx - 0.13, 1.45, S.z, 0.02, 0.94, 1.44, 0, false);
  for (let i = 0; i < 4; i++) {
    const z = S.z - 0.51 + i * 0.34;
    flat(b, M.brass, wx - 0.15, 1.72, z, 0.1, 'x');
    flat(b, TAGS[i]!, wx - 0.17, 1.72, z, 0.082, 'x');
    box(b, M.steel, wx - 0.15, 1.3, z, 0.03, 0.26, 0.18, 0, false);
    flat(b, M.brass, wx - 0.17, 1.32, z, 0.055, 'x', 10);
    box(b, M.black, wx - 0.19, 1.31, z, 0.02, 0.07, 0.022, 0, false);
  }
  box(b, M.redLamp, wx - 0.14, 1.9, S.z + 0.66, 0.03, 0.06, 0.06, 0, false);
  box(b, M.iron, wx - 0.03, 3.6, S.z, 0.05, 3.2, 0.05, 0, false);
  solid(c, wx - 0.06, S.z, 0.14, 1.6, 2.1, 'zarya-keypanel', { kind: 'none', surface: 'metal' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the dens
// ---------------------------------------------------------------------------------------------------------------------

/** A brown bear asleep on its side, head on its paws: a few rounded shapes. `yaw` turns it, `s` is its size. */
function bear(b: LevelBuilder, x: number, z: number, yaw: number, s: number): void {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const y0 = 0.2;
  const part = (mat: THREE.Material, lx: number, y: number, lz: number, rx: number, ry: number, rz: number): void => {
    blob(b, mat, x + (cos * lx + sin * lz) * s, y0 + y * s, z + (-sin * lx + cos * lz) * s, rx * s, ry * s, rz * s, yaw);
  };
  part(FUR, 0, 0.55, 0, 1.05, 0.58, 0.74);
  part(FUR, 0.55, 0.66, 0.04, 0.62, 0.56, 0.64);
  part(FUR2, -0.62, 0.58, 0, 0.66, 0.6, 0.72);
  part(FUR, 1.24, 0.36, 0.26, 0.42, 0.34, 0.37);
  part(TAN, 1.6, 0.27, 0.34, 0.2, 0.15, 0.17);
  part(M.black, 1.78, 0.29, 0.37, 0.06, 0.05, 0.06);
  part(FUR2, 1.1, 0.67, 0.06, 0.11, 0.11, 0.09);
  part(FUR2, 1.16, 0.64, 0.5, 0.11, 0.11, 0.09);
  part(FUR2, 1.2, 0.13, -0.28, 0.44, 0.14, 0.18);
  part(FUR2, -0.4, 0.16, 0.74, 0.42, 0.17, 0.2);
}

function dens(c: Ctx): void {
  const { b } = c;
  const x0 = DEN.x0;
  const x1 = DEN.x0 + DEN.n * DEN.w;
  const xm = (x0 + x1) / 2;
  const zb = -HZ;
  const zf = DEN.z;
  const zm = (zb + zf) / 2;
  // the mass over them, their end walls; inside, pale green paint on the back wall, the dividers and the ceiling
  box(b, M.concreteDark, xm, (DEN.h + H) / 2, zm + 0.1, x1 - x0 + 0.4, H - DEN.h, zf - zb + 0.2, 0, false);
  for (const x of [x0, x1]) box(b, M.concreteDark, x, DEN.h / 2, zm, 0.4, DEN.h, zf - zb, 0, false);
  box(b, DENWALL, xm, DEN.h / 2, zb + 0.03, x1 - x0, DEN.h, 0.06, 0, false);
  box(b, DENWALL, xm, DEN.h - 0.03, zm, x1 - x0, 0.06, zf - zb, 0, false);
  box(b, STRAW2, xm, 0.08, zm, x1 - x0, 0.16, zf - zb - 0.2, 0, false);
  // the glass fronts: a steel plinth, iron posts, a frame; no pane is drawn, only the frost in its corners
  box(b, PAINTED, xm, 0.4, zf, x1 - x0, 0.8, 0.3);
  for (let i = 0; i < DEN.n * 2; i++) box(b, M.iron, x0 + (i + 0.5) * (DEN.w / 2), 0.4, zf + 0.16, 1.6, 0.5, 0.02);
  box(b, M.steel, xm, 0.83, zf, x1 - x0, 0.06, 0.36, 0, false);
  box(b, M.steel, xm, DEN.h - 0.05, zf, x1 - x0, 0.1, 0.3, 0, false);
  box(b, M.snow, xm, 0.89, zf + 0.02, x1 - x0, 0.07, 0.1, 0, false);
  for (let i = 0; i <= DEN.n; i++) {
    const x = x0 + i * DEN.w;
    box(b, M.iron, x, DEN.h / 2, zf, 0.34, DEN.h, 0.4);
    if (i > 0 && i < DEN.n) box(b, DENWALL, x, DEN.h / 2, zm - 0.1, 0.2, DEN.h, zf - zb - 0.3, 0, false);
    // each post's panel: a gauge, a blue lamp (the den is cold), a red one
    box(b, M.grey, x, 1.5, zf + 0.22, 0.26, 0.5, 0.06, 0, false);
    flat(b, M.white, x, 1.6, zf + 0.26, 0.08, 'z', 10, 0.02);
    box(b, i % 3 === 1 ? M.redLamp : M.blueLamp, x, 1.36, zf + 0.26, 0.05, 0.05, 0.02, 0, false);
  }
  for (let i = 0; i < DEN.n; i++) {
    const cx = x0 + (i + 0.5) * DEN.w;
    // rime creeping up from the corners of the glass, icicles under the frame
    for (const s of [-1, 1]) {
      box(b, M.snow, cx + s * (DEN.w / 2 - 0.5), 0.98, zf + 0.03, 0.66, 0.12, 0.03);
      box(b, M.snow, cx + s * (DEN.w / 2 - 0.34), 1.1, zf + 0.03, 0.34, 0.12, 0.03);
      box(b, M.snow, cx + s * (DEN.w / 2 - 0.4), DEN.h - 0.2, zf + 0.03, 0.46, 0.2, 0.03);
    }
    for (let k = 0; k < 6; k++) cyl(b, M.snow, cx - 2 + k * 0.8 + ((i * 3 + k) % 3) * 0.1, DEN.h - 0.38 - ((k + i) % 3) * 0.1, zf + 0.14, 0, 0.04, 0.28 + ((k + i) % 3) * 0.1, 4, false);
    // inside: a cold strip under the ceiling, straw heaped up, the bear, a steel bowl
    box(b, M.ice, cx, DEN.h - 0.1, zm - 0.6, 2.6, 0.05, 0.16, 0, false);
    const bz = zm - 0.2 + ((i * 5) % 3) * 0.25;
    const bx = cx + (i % 2 ? 0.4 : -0.3);
    blob(b, STRAW, bx, 0.12, bz, 2.1, 0.22, 1.7);
    blob(b, STRAW, bx - 0.9, 0.2, bz - 0.9, 1.1, 0.3, 0.8, i * 0.7);
    for (let k = 0; k < 9; k++) slab(b, STRAW, bx - 1.6 + ((k * 0.41) % 1) * 3.2, 0.28, bz - 1.2 + ((k * 0.73) % 1) * 2.6, 0.5, 0.03, 0.04, 0.2, k * 1.3, 0.15, false);
    bear(b, bx, bz, [2.6, 0.4, 3.3, -0.3, 2.9, 0.2][i]!, [1.05, 0.95, 1.1, 1, 0.9, 1.05][i]!);
    cyl(b, M.steel, cx + (i % 2 ? -1.7 : 1.8), 0.16, zf - 0.7, 0.24, 0.18, 0.12, 10, false);
  }
  // the reagent's pipes along the top of the fronts, a dropper into each den
  for (let i = 0; i < DEN.n; i++) frosted(b, x0 + (i + 0.5) * DEN.w + 1.4, 4.6, zf + 0.5, x0 + (i + 0.5) * DEN.w + 1.4, 3.9, zf + 0.5, 0.06, 0.5);
  solid(c, xm, zm + 0.08, x1 - x0 + 0.4, zf - zb + 0.46, H, 'zarya-dens', { kind: 'prop', surface: 'glass' });
  for (const x of [x0 + DEN.w, x0 + 3 * DEN.w, x0 + 5 * DEN.w]) b.light({ x, y: 2.7, z: zm, color: 0x9dffb8, intensity: 16, distance: 11, mode: 'steady', pool: 0, weight: 1.1 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the beds
// ---------------------------------------------------------------------------------------------------------------------

/** An iron bed, its head to the south (or the north): a sleeper under a grey blanket (unless `empty`), now and then a drip stand and a monitor. */
function bed(c: Ctx, x: number, z: number, i: number, o: { empty?: boolean; drip?: boolean; monitor?: boolean; north?: boolean } = {}): void {
  const { b } = c;
  const hd = o.north ? -1 : 1;
  box(b, M.iron, x, 0.28, z, 0.96, 0.05, 2);
  for (const [sz, top] of [[hd, 1.0], [-hd, 0.76]] as const) {
    for (const sx of [-1, 1]) cyl(b, M.iron, x + sx * 0.46, 0, z + sz * 1.0, 0.025, 0.025, top, 5, false);
    for (const y of [top, top - 0.3]) box(b, M.iron, x, y, z + sz * 1.0, 0.94, 0.04, 0.04, 0, false);
    for (const dx of [-0.23, 0, 0.23]) box(b, M.iron, x + dx, top - 0.15, z + sz * 1.0, 0.02, 0.3, 0.02, 0, false);
  }
  box(b, M.white, x, 0.4, z, 0.9, 0.2, 1.94, 0, false);
  box(b, M.white, x, 0.55, z + hd * 0.7, 0.62, 0.1, 0.38, 0, false);
  if (o.empty) {
    box(b, BLANKET, x, 0.52, z - hd * 0.62, 0.94, 0.06, 0.66, 0, false);
    box(b, BLANKET, x, 0.57, z - hd * 0.34, 0.94, 0.06, 0.2, 0, false);
  } else {
    box(b, BLANKET, x, 0.52, z - 0.22, 0.94, 0.06, 1.5, 0, false);
    blob(b, BLANKET, x + ((i * 3) % 3) * 0.03 - 0.03, 0.56, z - 0.16, 0.3, 0.19 + (i % 3) * 0.015, 0.78);
    blob(b, BLANKET, x, 0.56, z - 0.84, 0.15, 0.15, 0.12);
    ball(b, SKIN, x, 0.67, z + 0.7, 0.115);
    blob(b, HAIR[(i * 7) % HAIR.length]!, x, 0.69, z + 0.75, 0.122, 0.105, 0.1);
  }
  if (o.drip) {
    const dx = x + 0.66;
    const dz = z + hd * 0.7;
    cyl(b, M.steel, dx, 0, dz, 0.018, 0.018, 1.9, 5, false);
    box(b, M.steel, dx, 0.03, dz, 0.44, 0.03, 0.04, 0.6, false);
    box(b, M.steel, dx, 0.03, dz, 0.44, 0.03, 0.04, -0.9, false);
    box(b, M.steel, dx, 1.9, dz, 0.3, 0.02, 0.02, 0, false);
    box(b, PALE, dx - 0.12, 1.72, dz, 0.1, 0.22, 0.04, 0, false);
    slab(b, PALE, dx - 0.26, 1.12, dz, 0.012, 1.02, 0.012, 0, 0, -0.3, false);
  }
  if (o.monitor) {
    const mx = x - 0.72;
    const mz = z + hd * 0.76;
    box(b, M.grey, mx, 0.38, mz, 0.4, 0.76, 0.4, 0, false);
    box(b, M.locker, mx, 0.92, mz, 0.38, 0.3, 0.32, 0, false);
    box(b, M.ice, mx, 0.93, mz - hd * 0.165, 0.27, 0.19, 0.01, 0, false);
    box(b, M.redLamp, mx + 0.14, 0.81, mz - hd * 0.165, 0.03, 0.03, 0.01, 0, false);
  }
  solid(c, x - (o.monitor ? 0.2 : 0), z, o.monitor ? 1.4 : 1, 2.1, 1, 'zarya-bed', { shots: false, kind: 'none', surface: 'metal' });
}

function beds(c: Ctx): void {
  const { b } = c;
  BEDS.rows.forEach((z, row) => {
    for (let i = 0; i < BEDS.n; i++) {
      const k = row * BEDS.n + i;
      bed(c, BEDS.x0 + i * BEDS.step, z, k, { drip: k % 3 !== 1, monitor: k % 2 === 0 });
    }
  });
  // green to the shoulder along the south wall behind them, a cold strip over each pair, the pipes above
  box(b, M.green, (HX0 + SX) / 2, 0.8, HZ - 0.03, SX - HX0, 1.6, 0.05, 0, false);
  for (let i = 0; i < 5; i++) {
    const x = BEDS.x0 + (i * 2 + 0.5) * BEDS.step;
    box(b, M.grey, x, 4.1, 14.2, 2.4, 0.08, 0.3, 0, false);
    box(b, M.ice, x, 4.04, 14.2, 2.2, 0.04, 0.16, 0, false);
    for (const s of [-1, 1]) box(b, M.iron, x + s * 1, (H + 4.14) / 2, 14.2, 0.02, H - 4.14, 0.02, 0, false);
  }
  b.light({ x: 521, y: 3.8, z: 13.6, color: 0xc4e2ff, intensity: 18, distance: 15, mode: 'steady', pool: 5, weight: 0.9 });
  b.light({ x: 535, y: 3.8, z: 13.6, color: 0xc4e2ff, intensity: 18, distance: 15, mode: 'steady', pool: 5, weight: 0.9 });
  // ---- Danya's bed, a little apart from the rows: a chair pulled up to it, a locker with a mandarin and a glass ----
  const D = Q.danya;
  // (he lies with his head to the north, the way `berlogaPeople` lays him: the blanket is folded back to his feet)
  bed(c, D.x, D.z, 99, { empty: true, drip: true, north: true });
  const cx = D.x + 1.25;
  const cz = D.z + 0.2;
  box(b, M.woodPale, cx, 0.45, cz, 0.44, 0.05, 0.44, 0.25);
  slab(b, M.woodPale, cx + 0.2, 0.75, cz + 0.05, 0.05, 0.6, 0.44, 0, 0.25, 0, false);
  for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]] as const) cyl(b, M.woodDark, cx + dx, 0, cz + dz, 0.022, 0.022, 0.44, 4, false);
  solid(c, cx, cz, 0.5, 0.5, 0.9, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });
  box(b, M.white, D.x - 0.85, 0.35, D.z - 0.75, 0.45, 0.7, 0.45);
  ball(b, M.orange, D.x - 0.9, 0.75, D.z - 0.7, 0.05, 1, 6);
  ball(b, M.orange, D.x - 0.78, 0.75, D.z - 0.84, 0.05, 1, 6);
  cyl(b, PALE, D.x - 0.72, 0.7, D.z - 0.62, 0.035, 0.035, 0.1, 6, false);
  solid(c, D.x - 0.85, D.z - 0.75, 0.45, 0.45, 0.75, 'zarya-locker', { shots: false, kind: 'none', surface: 'metal' });
  // a toy bear at the foot of the blanket
  ball(b, M.plush, D.x + 0.2, 0.68, D.z + 0.62, 0.1, 1.1, 7);
  ball(b, M.plush, D.x + 0.2, 0.83, D.z + 0.62, 0.075, 1, 7);
  for (const s of [-1, 1]) ball(b, M.plush, D.x + 0.2 + s * 0.06, 0.9, D.z + 0.62, 0.028, 1, 5);
  b.light({ x: D.x, y: 3, z: D.z - 0.4, color: 0xd8ecff, intensity: 12, distance: 9, mode: 'steady', pool: 3.5, weight: 1.2 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the gallery: the purge console, the tank
// ---------------------------------------------------------------------------------------------------------------------

function gallery(c: Ctx): void {
  const { b } = c;
  const gm = (GX + HX1) / 2;
  // two steps up, the whole width of the hall (walked on: `floor`)
  box(b, M.concrete, SX + 0.3, 0.125, 0, 0.6, 0.25, 2 * HZ);
  box(b, M.concrete, gm, GY / 2, 0, HX1 - GX, GY, 2 * HZ);
  for (const [x, y] of [[SX + 0.04, 0.25], [GX + 0.04, GY]] as const) {
    box(b, M.iron, x, y + 0.005, 0, 0.1, 0.02, 2 * HZ, 0, false);
    for (let k = 0; k < 22; k++) box(b, YELLOW, x, y + 0.008, -8.4 + k * 0.8, 0.1, 0.02, 0.4, 0, false);
  }
  b.collide({ x: SX + 0.3, z: 0, hx: 0.3, hz: HZ + 0.2, y0: 0, y1: 0.25, floor: true, surface: 'concrete', mapKind: 'none', tag: 'zarya-gallery' });
  b.collide({ x: gm + 0.2, z: 0, hx: (HX1 - GX) / 2 + 0.2, hz: HZ + 0.2, y0: 0, y1: GY, floor: true, surface: 'concrete', mapKind: 'none', tag: 'zarya-gallery' });
  // rails along its edge toward either wall (the middle is open: the steps)
  for (const s of [-1, 1]) {
    const z0 = s * 9.4;
    const z1 = s * HZ;
    const zm = (z0 + z1) / 2;
    const len = Math.abs(z1 - z0);
    for (const y of [GY + 0.55, GY + 1.05]) box(b, M.iron, GX + 0.12, y, zm, 0.05, 0.05, len, 0, false);
    for (let k = 0; k <= 5; k++) box(b, M.iron, GX + 0.12, GY + 0.53, z0 + ((z1 - z0) * k) / 5.02, 0.06, 1.06, 0.06, 0, false);
    b.collide({ x: GX + 0.12, z: zm, hx: 0.08, hz: len / 2, y0: 0, y1: GY + 1.1, blocksShots: false, mapKind: 'none', surface: 'metal', tag: 'zarya-rail' });
    box(b, M.redLamp, GX + 0.12, GY + 1.18, z0, 0.1, 0.14, 0.1, 0, false);
  }

  // ---- the purge console: a long desk, four key switches from north to south, each under its round enamel tag ----
  const dx = 555.45;
  const len = 12.6;
  box(b, M.locker, dx, GY + 0.43, 0, 0.9, 0.86, len);
  box(b, M.iron, dx, GY + 0.05, 0, 0.94, 0.1, len + 0.04, 0, false);
  slab(b, M.grey, dx - 0.04, GY + 0.95, 0, 0.98, 0.07, len, 0, 0, 0.2, false);
  box(b, M.locker, dx + 0.36, GY + 1.0, 0, 0.18, 0.3, len, 0, false);
  for (let i = 0; i < 4; i++) {
    const z = Q.keys[i]!.z;
    // the switch: a steel plate, a brass barrel, the keyhole
    slab(b, M.steel, dx - 0.12, GY + 0.975, z, 0.5, 0.03, 0.5, 0, 0, 0.2, false);
    cyl(b, M.brass, dx - 0.12, GY + 0.97, z, 0.11, 0.11, 0.09, 12, false);
    box(b, M.black, dx - 0.12, GY + 1.065, z, 0.03, 0.01, 0.1, 0, false);
    box(b, M.redLamp, dx - 0.12, GY + 0.99, z + 0.34, 0.05, 0.04, 0.05, 0, false);
    // its tag on a post behind it
    box(b, M.iron, dx + 0.36, GY + 1.4, z, 0.06, 0.6, 0.06, 0, false);
    flat(b, M.brass, dx + 0.34, GY + 1.85, z, 0.29, 'x', 18, 0.05);
    flat(b, TAGS[i]!, dx + 0.3, GY + 1.85, z, 0.24, 'x', 18, 0.05);
  }
  // between the switches: rows of small cold lamps, toggles; in the middle a gauge and the purge's own lamp
  for (let k = 0; k < 30; k++) {
    const z = -5.8 + k * 0.4;
    if (Q.keys.some((q) => Math.abs(q.z - z) < 0.5) || Math.abs(z) < 0.5) continue;
    box(b, k % 5 === 2 ? M.blueLamp : M.ice, dx + 0.1, GY + 1.03, z, 0.06, 0.03, 0.06, 0, false);
    box(b, M.iron, dx - 0.2, GY + 0.975, z, 0.04, 0.08, 0.04, 0, false);
  }
  flat(b, M.white, dx + 0.26, GY + 1.02, 0, 0.11, 'x', 12, 0.02);
  box(b, M.redLamp, dx - 0.1, GY + 1.0, 0, 0.12, 0.06, 0.12, 0, false);
  solid(c, dx, 0, 0.95, len, GY + 1.1, 'zarya-console', { shots: false, kind: 'prop', surface: 'metal' });
  b.light({ x: 552.6, y: 4, z: 0, color: 0xbfe0ff, intensity: 20, distance: 16, mode: 'steady', pool: 5, weight: 1 });

  // ---- the tank behind it: pale blue reagent in a glass drum between steel caps, pipes up into the ceiling ----
  const T = TANK;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.5;
    box(b, M.iron, T.x + Math.cos(a) * (T.r - 0.1), GY + 0.4, T.z + Math.sin(a) * (T.r - 0.1), 0.2, 0.8, 0.2, -a);
    box(b, M.steel, T.x + Math.cos(a) * (T.r + 0.04), 2.95, T.z + Math.sin(a) * (T.r + 0.04), 0.1, 3.1, 0.14, -a, false);
  }
  cyl(b, M.steel, T.x, GY + 0.8, T.z, T.r + 0.1, T.r + 0.1, 0.4, 20);
  cyl(b, M.ice, T.x, GY + 1.2, T.z, T.r, T.r, 3.0, 20, false);
  cyl(b, M.steel, T.x, GY + 4.2, T.z, T.r + 0.1, T.r + 0.1, 0.35, 20);
  cyl(b, M.steel, T.x, GY + 4.55, T.z, T.r + 0.1, 0.9, 0.5, 20, false);
  cyl(b, M.snow, T.x, GY + 4.52, T.z, T.r + 0.16, T.r + 0.12, 0.08, 20, false);
  cyl(b, M.snow, T.x, GY + 1.14, T.z, T.r + 0.16, T.r + 0.18, 0.09, 20, false);
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * 0.5 + ((k + 0.5) / 14) * Math.PI;
    cyl(b, M.snow, T.x + Math.cos(a) * (T.r + 0.1), GY + 4.2 - 0.3 - (k % 3) * 0.14, T.z + Math.sin(a) * (T.r + 0.1), 0, 0.05, 0.3 + (k % 3) * 0.14, 4, false);
  }
  frosted(b, T.x - 0.3, GY + 5.0, T.z, T.x - 0.3, H, T.z, 0.3, 0.5);
  frosted(b, T.x - 0.7, GY + 4.8, T.z - 0.9, T.x - 0.7, H, T.z - 0.9, 0.16, 0.45);
  frosted(b, T.x - 0.7, GY + 4.8, T.z + 0.9, T.x - 0.7, H, T.z + 0.9, 0.16, 0.45);
  // a gauge and a valve wheel on its face, a ladder up its south side
  flat(b, M.white, T.x - T.r - 0.12, GY + 1.0, T.z - 0.7, 0.16, 'x', 12, 0.03);
  const valve = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 5, 14), M.red);
  valve.position.set(T.x - T.r - 0.2, GY + 1.0, T.z + 0.7);
  valve.rotation.y = Math.PI / 2;
  b.add(valve, { cast: false, receive: true });
  box(b, M.iron, T.x - T.r - 0.1, GY + 1.0, T.z + 0.7, 0.2, 0.05, 0.05, 0, false);
  solid(c, T.x, T.z, T.r * 2 + 0.3, T.r * 2 + 0.3, H, 'zarya-tank', { kind: 'prop', surface: 'metal' });
  b.light({ x: T.x - T.r - 0.9, y: 3.3, z: 0, color: 0x66b4ff, intensity: 26, distance: 16, mode: 'steady', pool: 0, weight: 1.3 });
  // the mains from the tank along the ceiling: north to the dens, south over the beds
  const px = HX1 - 1.6;
  frosted(b, px, 5.3, -11.9, px, 5.3, 12.4, 0.2);
  frosted(b, DEN.x0 + 0.5, 5.3, DEN.z + 0.5, px, 5.3, DEN.z + 0.5, 0.2);
  frosted(b, DEN.x0 + 0.5, 4.75, DEN.z + 0.5, px - 6, 4.75, DEN.z + 0.5, 0.11, 3.1);
  frosted(b, BEDS.x0, 5.3, 12.4, px, 5.3, 12.4, 0.16, 2.8);
  for (let x = 518; x < px; x += 6) for (const z of [DEN.z + 0.5, 12.4]) box(b, M.iron, x, 5.62, z, 0.06, 0.7, 0.5, 0, false);
  // cabinets along the east wall either side of it, a desk with a monitor in the north corner
  cabinets(c, -16.6, -3.1, 71);
  cabinets(c, 3.1, 16.6, 72);
  box(b, M.locker, 551.5, GY + 0.38, -15.6, 1.8, 0.76, 0.9);
  box(b, M.locker, 551.9, GY + 0.95, -15.8, 0.5, 0.38, 0.4, 0, false);
  box(b, M.ice, 551.9, GY + 0.96, -15.59, 0.36, 0.24, 0.01, 0, false);
  box(b, M.white, 551.1, GY + 0.78, -15.5, 0.3, 0.02, 0.4, 0.2, false);
  solid(c, 551.5, -15.6, 1.8, 0.9, GY + 0.9, 'zarya-desk', { shots: false, kind: 'none', surface: 'metal' });
  for (let i = 0; i < 3; i++) {
    cyl(b, M.steel, 550.8 + i * 0.7, GY, 16.5, 0.28, 0.28, 1.0, 10);
    cyl(b, M.snow, 550.8 + i * 0.7, GY + 1.0, 16.5, 0.16, 0.24, 0.1, 8, false);
  }
  solid(c, 551.5, 16.5, 2.2, 0.8, GY + 1.1, 'zarya-dewars', { shots: false, kind: 'none', surface: 'metal' });
}

export interface BerlogaHandles {
  area: number;
  link: FloorLink;
  /** The blast door with four key slots (built open; a run shuts it until the four keys are in). */
  keyDoor: BoxCollider;
}

export function buildBerloga(c: Ctx, stairs: (area: number) => FloorLink): BerlogaHandles {
  const { b, floors } = c;
  const area = floors.addArea('The Berloga Hall', 'under', 0, { minX: R.x0 - 2, maxX: R.x1 + 2, minZ: R.z0 - 2, maxZ: R.z1 + 2 });
  shell(c);
  landing(c);
  dens(c);
  beds(c);
  gallery(c);
  // cold lamps over the open floor, and the light they give
  for (const x of [519, 527, 535, 543]) for (const z of [-5, 4]) pendant(b, x, z, 4.3);
  b.light({ x: 521, y: 4, z: -1, color: 0xb4dcff, intensity: 26, distance: 20, mode: 'steady', pool: 7, weight: 1 });
  b.light({ x: 537, y: 4, z: -1, color: 0xb4dcff, intensity: 26, distance: 20, mode: 'steady', pool: 7, weight: 1 });
  const keyDoor = b.collide({ x: Q.doorX, z: 0, hx: 0.4, hz: Q.doorHalf, y1: 3, blocksMove: false, blocksShots: false, mapKind: 'none', surface: 'metal', tag: 'zarya-keydoor' });
  return { area, link: stairs(area), keyDoor };
}
