/**
 * ZARYA: the DVOR (`zarya/zones/dvor.ts`), built from the `dv-*` reference views: two courtyards of five-storey panel
 * blocks south of the square. Two long blocks along the north with the archway's tunnel between them, one down the
 * west side, one down the middle that parts the yards, one along Stroiteley Street on the south-east. The west yard
 * (the playground, the matryoshka's plinth, the hockey box, the woodpile) is open to the street behind a board fence;
 * the east yard has the yard fir, the kennel, the workbench under its lean-to, the bins and the yard-keeper's shed.
 *
 * Cost. A plain colour draws with every other plain colour of its finish and its shadow flags, a chunk at a time, and
 * from most of this zone the square is drawn too (behind the north blocks), so this file keeps to ONE kind of its own:
 * `S`, every colour it needs at the snow's finish, never casting. All of it draws WITH the snow and the trodden ground:
 * one batch a chunk. The kit's own `Z.*` colours would each start another (a finish of their own, or a shadow flag), so
 * nothing here uses them but the snow, the fir green and the two that glow; the kit's `ball`, lamp post, fir tree,
 * bench, goods and garland are not used for the same reason (`seat` is the kit's bench in these colours). Concrete
 * walls are the blocks' own `concreteWall` (it draws with them); only the blocks cast shadows.
 */
import * as THREE from 'three';
import { addBox, groundRect, solidBlock, type Side } from '../structures';
import type { Ctx } from './util';
import { DVOR } from '../../zarya/zones/dvor';
import type { LevelBuilder } from '../builder';
import { Z, box as kitBox, cyl as kitCyl, slab as kitSlab, solid } from './zaryaKit';

const HEX = {
  concrete: 0x8b9199,
  concreteDark: 0x555b64,
  cream: 0xd8cfb8,
  white: 0xe9e6de,
  wood: 0x7b5a3a,
  woodDark: 0x4d3725,
  woodPale: 0xa98a5f,
  red: 0xb3261e,
  redDark: 0x7a1c18,
  cherry: 0x7a2b25,
  blue: 0x2f4f8f,
  teal: 0x3c6f8a,
  green: 0x4f6f52,
  greenDark: 0x2f4a36,
  plum: 0x7a3f6a,
  gold: 0xd6aa3c,
  orange: 0xe08a1e,
  iron: 0x2b2f36,
  black: 0x101216,
  rust: 0x6f4630,
  door: 0x5a2f24,
  tin: 0x9aa2ac,
  paper: 0xa58c62,
  paperGreen: 0x7f8f72,
  packed: 0x7f8ba3,
  swept: 0x69748a,
  ice: 0x8fb2d4,
} as const;
type Tone = keyof typeof HEX;
/** Every plain colour here, at the snow's finish (they draw with it). */
const S = (() => {
  const out = {} as Record<Tone, THREE.MeshStandardMaterial>;
  for (const k of Object.keys(HEX) as Tone[]) out[k] = new THREE.MeshStandardMaterial({ color: HEX[k], roughness: 0.95 });
  return out;
})();
// the kit's pieces, never casting (so each lands in the snow's batch)
const box = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0): void => void kitBox(b, mat, x, y, z, sx, sy, sz, rot, false);
const cyl = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8): void => kitCyl(b, mat, x, y, z, r0, r1, h, seg, false);
const slab = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number): void => kitSlab(b, mat, x, y, z, sx, sy, sz, rx, ry, rz, false);
/** A mesh of our own making, with the same flags as everything else here. */
const put = (b: LevelBuilder, m: THREE.Mesh): void => b.add(m, { cast: false, receive: true });
function orb(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 8): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)), mat);
  m.position.set(x, y, z);
  m.scale.y = sy;
  put(b, m);
}
/** A drift: the top of a buried ball, `r` across at the ground and `h` high, so its edge lies down into the snow. */
function drift(b: LevelBuilder, x: number, z: number, r: number, h: number): void {
  const rho = r / 0.866;
  orb(b, Z.snow, x, -h, z, rho, (2 * h) / rho, 14);
}
/** A bank of snow `w` by `d` and `h` high (the top of a buried ball again): set it on a wall's line and half of it lies against the wall. */
function bank(b: LevelBuilder, x: number, z: number, w: number, d: number, h: number): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), Z.snow);
  m.position.set(x, -h * 0.4, z);
  m.scale.set(w / 1.9, h * 1.4, d / 1.9);
  put(b, m);
}
const snow = (c: Ctx, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0): void => box(c.b, Z.snow, x, y, z, sx, sy, sz, rot);
const lcg = (seed: number): (() => number) => {
  let s = (seed * 7919 + 13) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const R = DVOR.rect;
/** A block's height: five storeys and the parapet. */
const H = 15.8;
const FLOOR = DVOR.roomFloor;

interface Blk {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
/** North-west and north-east (the archway's tunnel runs between them), west, middle, south. */
const A: Blk = { x0: -102.5, z0: 73.5, x1: -27.5, z1: 85 };
const B1: Blk = { x0: -18.5, z0: 73.5, x1: 40, z1: 85 };
const B2: Blk = { x0: 40, z0: 73.5, x1: 98.5, z1: 86 };
const E: Blk = { x0: -102.5, z0: 85, x1: -91.5, z1: 142 };
const M: Blk = { x0: 2, z0: 97, x1: 13, z1: 138 };
const D: Blk = { x0: 13, z0: 144.5, x1: 75, z1: 155.5 };

/** One face of a block: the side it looks, where it is, and how far it runs. */
interface Face {
  side: Side;
  at: number;
  from: number;
  to: number;
}
const faceOf = (q: Blk, side: Side): Face =>
  side === 'N' ? { side, at: q.z0, from: q.x0, to: q.x1 } : side === 'S' ? { side, at: q.z1, from: q.x0, to: q.x1 } : side === 'E' ? { side, at: q.x1, from: q.z0, to: q.z1 } : { side, at: q.x0, from: q.z0, to: q.z1 };
/** Where `solidBlock` puts a face's columns of windows. */
const columns = (f: Face): number[] => {
  const span = f.to - f.from;
  const n = Math.max(1, Math.floor((span - 1.2) / 2.9));
  return Array.from({ length: n }, (_, i) => f.from + (span / n) * (i + 0.5));
};
const alongX = (f: Face): boolean => f.side === 'N' || f.side === 'S';
const outward = (f: Face): number => (f.side === 'S' || f.side === 'E' ? 1 : -1);
const YAW: Record<Side, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
/** A point `a` along a face and `v` metres out from it. */
const fpos = (f: Face, a: number, v: number): [number, number] => (alongX(f) ? [a, f.at + outward(f) * v] : [f.at + outward(f) * v, a]);

/** A box on a face: `a` along it, `v` out from it, `sa` wide along it and `sv` deep. */
function fbox(c: Ctx, mat: THREE.Material, f: Face, a: number, y: number, v: number, sa: number, sy: number, sv: number): void {
  const [x, z] = fpos(f, a, v);
  box(c.b, mat, x, y, z, alongX(f) ? sa : sv, sy, alongX(f) ? sv : sa);
}
/** The same in the blocks' own concrete (it draws with their walls). */
function fwall(c: Ctx, f: Face, a: number, y: number, v: number, sa: number, sy: number, sv: number): void {
  const [x, z] = fpos(f, a, v);
  addBox(c.b, 'concreteWall', x, y, z, alongX(f) ? sa : sv, sy, alongX(f) ? sv : sa);
}
function fsolid(c: Ctx, f: Face, a: number, v: number, sa: number, sv: number, h: number, tag: string, o: Parameters<typeof solid>[7] = {}): void {
  const [x, z] = fpos(f, a, v);
  solid(c, x, z, alongX(f) ? sa : sv, alongX(f) ? sv : sa, h, tag, o);
}
/** A window pane on a face, in the blocks' own two window materials (so it draws with theirs). */
function pane(c: Ctx, f: Face, a: number, y: number, v: number, w: number, h: number, lit: boolean): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), c.b.mats.get(lit ? 'windowLit' : 'glassDark'));
  const [x, z] = fpos(f, a, v);
  m.position.set(x, y, z);
  m.rotation.y = YAW[f.side];
  c.b.add(m, { cast: false, receive: false });
}

// ---------------------------------------------------------------------------------------------------------------------
// the blocks, and what hangs on their faces
// ---------------------------------------------------------------------------------------------------------------------

/** A panel block: `solidBlock` with lit windows on the faces that are seen, its roof slab in the wall's own concrete (one batch fewer), snow on top. */
function block(c: Ctx, q: Blk, faces: Side[], seed: number, lift = 0): void {
  const w = q.x1 - q.x0;
  const d = q.z1 - q.z0;
  const x = (q.x0 + q.x1) / 2;
  const z = (q.z0 + q.z1) / 2;
  solidBlock(c.b, { x, z, w, d, height: H, wallMaterial: 'concreteWall', roofMaterial: 'concreteWall', facade: { floors: 5, floorHeight: 3, litFraction: 0.55, seed, faces }, mapKind: 'building', tag: 'zarya-block' });
  snow(c, x, H + 0.4 + lift, z, w + 0.5, 0.2, d + 0.5);
}

const PANEL = [S.concrete, S.green, S.blue, S.cream, S.woodPale];
/** A stack of balconies up a column of windows, from the first floor: a slab, a painted parapet, snow on its rail; one in five glazed in and lit. */
function balconies(c: Ctx, f: Face, a: number, k: number): void {
  for (let fl = 1; fl < 5; fl++) {
    const y0 = fl * 3 + 0.5;
    const mat = PANEL[(k * 3 + fl * 5) % PANEL.length]!;
    fbox(c, S.concrete, f, a, y0 + 0.06, 0.6, 2.8, 0.12, 1.2);
    fbox(c, mat, f, a, y0 + 0.62, 1.17, 2.8, 1.0, 0.06);
    for (const s of [-1, 1]) fbox(c, mat, f, a + s * 1.37, y0 + 0.62, 0.6, 0.06, 1.0, 1.2);
    fbox(c, Z.snow, f, a, y0 + 1.16, 1.17, 2.86, 0.08, 0.16);
    if ((k + fl * 2) % 5 === 0) {
      pane(c, f, a, y0 + 1.82, 1.21, 2.7, 1.3, true);
      for (const s of [-1, 1]) fbox(c, mat, f, a + s * 1.37, y0 + 1.82, 0.6, 0.06, 1.3, 1.2);
      fbox(c, S.concrete, f, a, y0 + 2.52, 0.62, 2.9, 0.1, 1.26);
    }
  }
}

/**
 * A stairwell door over a column's ground-floor window: a surround, three steps, a canopy under snow on a fin wall
 * and a post, a lamp. `open`: the leaf stands out and the doorway is dark (scenery: the whole porch is solid).
 */
function porch(c: Ctx, f: Face, a: number, open: boolean): void {
  const { b } = c;
  fwall(c, f, a, 1.58, 0.13, 2.3, 3.16, 0.26);
  fbox(c, S.black, f, a, 1.5, 0.265, 1.3, 2.1, 0.02);
  for (const s of [-1, 1]) fbox(c, S.woodDark, f, a + s * 0.7, 1.5, 0.29, 0.1, 2.1, 0.06);
  fbox(c, S.woodDark, f, a, 2.6, 0.29, 1.5, 0.1, 0.06);
  if (open) fbox(c, S.door, f, a + 0.68, 1.47, 0.9, 0.06, 2.04, 1.2);
  else {
    fbox(c, S.door, f, a, 1.5, 0.29, 1.3, 2.1, 0.04);
    fbox(c, S.black, f, a, 2.05, 0.315, 0.5, 0.5, 0.02);
  }
  for (let i = 0; i < 3; i++) {
    const h = 0.45 - i * 0.15;
    fbox(c, S.concrete, f, a, h / 2, 0.46 + i * 0.4, 2.3, h, 0.4);
  }
  fbox(c, Z.snow, f, a - 0.72, 0.5, 0.46, 0.7, 0.1, 0.36);
  fbox(c, Z.snow, f, a + 0.1, 0.34, 0.86, 1.7, 0.08, 0.36);
  // the canopy, the fin wall that carries it on one side, a pipe post on the other
  fbox(c, S.concrete, f, a, 2.85, 1.0, 2.7, 0.12, 1.5);
  fbox(c, Z.snow, f, a, 3.0, 1.02, 2.8, 0.18, 1.6);
  fwall(c, f, a - 1.22, 1.4, 0.98, 0.14, 2.8, 1.44);
  fbox(c, S.iron, f, a + 1.25, 1.4, 1.62, 0.06, 2.8, 0.06);
  const [lx, lz] = fpos(f, a, 0.95);
  box(b, S.cream, lx, 2.72, lz, 0.2, 0.12, 0.2);
  if (open) b.light({ x: lx, y: 2.5, z: lz, color: 0xffb060, intensity: 16, distance: 15, mode: 'steady', pool: 4.5, glow: 0.8, weight: 0.9 });
  else b.glow({ x: lx, y: 2.62, z: lz, color: 0xffb060, size: 0.8, intensity: 2, mode: 'steady' });
  fsolid(c, f, a, 0.88, 2.7, 1.76, 3, 'zarya-porch', { kind: 'none' });
}

/** Snow on the sills of a face's two lowest rows of windows. */
function sills(c: Ctx, f: Face, skip: readonly number[] = []): void {
  columns(f).forEach((a, i) => {
    for (let fl = 0; fl < 2; fl++) {
      if (fl === 0 && skip.includes(i)) continue;
      fbox(c, Z.snow, f, a, 1.54 + fl * 3, 0.1, 1.5, 0.08, 0.22);
    }
  });
}

/** A face with its doors (by column; the open ones named), its balcony stacks and the snow on its sills. */
function dress(c: Ctx, f: Face, o: { doors?: readonly number[]; open?: readonly number[]; stacks?: readonly number[]; rooms?: readonly number[] }): void {
  const cols = columns(f);
  for (const i of o.doors ?? []) porch(c, f, cols[i]!, (o.open ?? []).includes(i));
  for (const i of o.stacks ?? []) balconies(c, f, cols[i]!, i + Math.abs(Math.round(f.at)));
  sills(c, f, [...(o.doors ?? []), ...(o.rooms ?? [])]);
}

/** The archway's tunnel: the block carried over the walk from the square, on corbels, a lamp under it. */
function tunnel(c: Ctx): void {
  const { b } = c;
  const xm = (A.x1 + B1.x0) / 2;
  const w = B1.x0 - A.x1;
  const zm = (A.z0 + A.z1) / 2;
  const d = A.z1 - A.z0;
  addBox(b, 'concreteWall', xm, (5.2 + H) / 2, zm, w, H - 5.2, d);
  addBox(b, 'concreteWall', xm, H + 0.15, zm, w, 0.3, d + 0.4);
  snow(c, xm, H + 0.42, zm, w, 0.2, d + 0.5);
  for (const s of [-1, 1]) {
    addBox(b, 'concreteWall', xm + s * (w / 2 - 0.5), 4.7, zm, 1.0, 1.0, d);
    addBox(b, 'concreteWall', xm + s * (w / 2 - 1.4), 4.95, zm, 0.8, 0.5, d);
  }
  const f: Face = { side: 'S', at: A.z1, from: A.x1, to: B1.x0 };
  for (let fl = 2; fl < 5; fl++) {
    for (const dx of [-3, 0, 3]) {
      pane(c, f, xm + dx, 2.25 + fl * 3, 0.02, 1.3, 1.5, (fl * 3 + dx) % 4 !== 0);
      addBox(b, 'concreteDark', xm + dx, 1.45 + fl * 3, f.at + 0.08, 1.6, 0.1, 0.18, 0, { cast: false });
      fbox(c, Z.snow, f, xm + dx, 1.54 + fl * 3, 0.1, 1.5, 0.08, 0.22);
    }
  }
  box(b, S.iron, xm, 5.05, zm + 1, 0.06, 0.3, 0.06);
  orb(b, Z.bulb, xm, 4.82, zm + 1, 0.18);
  b.light({ x: xm, y: 4.4, z: zm + 1, color: 0xffb060, intensity: 18, distance: 17, mode: 'steady', pool: 5, glow: 0.9, weight: 0.8 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the two ground-floor rooms seen from outside
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A ground-floor room built out from a south face at `zf`: a floor, papered walls, a roof under snow, and a hole in its
 * front wall `win` wide from `sill` up to 2.4 m. Nothing walks in: the whole of it is one collider.
 */
function flat(c: Ctx, x: number, zf: number, W: number, D: number, win: number, sill: number, paper: THREE.Material): number {
  const { b } = c;
  const zw = zf + D - 0.1;
  const zm = zf + D / 2;
  const top = 2.4;
  const wallBox = (wx: number, wy: number, wz: number, sx: number, sy: number, sz: number): void => void addBox(b, 'concreteWall', wx, wy, wz, sx, sy, sz);
  const band = (wx: number, wz: number, sx: number, sz: number): void => void addBox(b, 'concreteDark', wx, 0.45, wz, sx, 0.9, sz, 0, { cast: false });
  box(b, S.woodDark, x, FLOOR / 2, zm, W - 0.4, FLOOR, D - 0.2);
  box(b, paper, x, 1.6, zf + 0.21, W - 0.4, 2.5, 0.08);
  const pier = (W - win) / 2;
  for (const s of [-1, 1]) {
    wallBox(x + s * (W / 2 - 0.1), 1.4, zm, 0.2, 2.8, D);
    box(b, paper, x + s * (W / 2 - 0.21), 1.6, zm, 0.02, 2.5, D - 0.4);
    wallBox(x + s * (win / 2 + pier / 2), 1.4, zw, pier, 2.8, 0.2);
    band(x + s * (W / 2 + 0.02), zm, 0.06, D);
    box(b, S.white, x + s * (win / 2 - 0.03), (sill + top) / 2, zw, 0.06, top - sill, 0.24);
  }
  wallBox(x, sill / 2, zw, win, sill, 0.2);
  wallBox(x, (top + 2.8) / 2, zw, win, 2.8 - top, 0.2);
  band(x, zf + D + 0.02, W + 0.1, 0.06);
  box(b, S.concrete, x, 2.87, zm, W + 0.2, 0.14, D + 0.2);
  snow(c, x, 3.03, zm + 0.05, W + 0.3, 0.18, D + 0.3);
  // the frame: a sill board (a little snow blown onto its outer edge), jambs, a head
  box(b, S.white, x, sill + 0.025, zw + 0.06, win + 0.16, 0.05, 0.34);
  snow(c, x - win * 0.3, sill + 0.08, zw + 0.18, win * 0.3, 0.06, 0.1);
  box(b, S.white, x, top - 0.03, zw, win, 0.06, 0.24);
  solid(c, x, zm, W, D, 2.9, 'zarya-flat', { kind: 'building' });
  return zw;
}

/** Vera's grandmother's room: the window open (its leaves swung in), an armchair, a table laid for tea, a carpet on the wall, a lamp. */
function babushkaRoom(c: Ctx): void {
  const { b } = c;
  const x = DVOR.babushka.x;
  const zf = A.z1;
  const sill = 1.1;
  const zw = flat(c, x, zf, 3.6, 2.2, 1.4, sill, S.paper);
  // the two leaves of the window, open into the room
  for (const s of [-1, 1]) {
    const xl = x + s * 0.66;
    for (const y of [1.2, 2.3]) box(b, S.white, xl, y, zw - 0.45, 0.04, 0.06, 0.66);
    box(b, S.white, xl, 1.75, zw - 0.76, 0.04, 1.16, 0.05);
  }
  // a geranium on the sill
  cyl(b, S.orange, x + 0.5, sill + 0.05, zw + 0.02, 0.07, 0.09, 0.13, 8);
  orb(b, S.green, x + 0.5, sill + 0.3, zw + 0.02, 0.13);
  box(b, S.red, x + 0.52, sill + 0.42, zw + 0.04, 0.07, 0.07, 0.07, 0.6);
  // the table by the east wall: a cloth to the floor, a teapot, a glass, a plate of pies
  cyl(b, S.cream, x + 0.95, FLOOR, zf + 0.85, 0.42, 0.42, 0.74, 10);
  cyl(b, S.white, x + 0.95, FLOOR + 0.74, zf + 0.85, 0.46, 0.46, 0.03, 12);
  orb(b, S.red, x + 0.82, FLOOR + 0.87, zf + 0.78, 0.1);
  cyl(b, S.white, x + 1.08, FLOOR + 0.77, zf + 0.7, 0.035, 0.035, 0.1, 6);
  cyl(b, S.woodPale, x + 1.0, FLOOR + 0.77, zf + 1.02, 0.12, 0.1, 0.05, 8);
  // the armchair by the west wall, a cloth over its back
  box(b, S.greenDark, x - 0.9, FLOOR + 0.3, zf + 0.82, 0.7, 0.24, 0.6);
  box(b, S.greenDark, x - 0.9, FLOOR + 0.62, zf + 0.44, 0.7, 0.9, 0.16);
  for (const s of [-1, 1]) box(b, S.greenDark, x - 0.9 + s * 0.38, FLOOR + 0.42, zf + 0.8, 0.12, 0.5, 0.66);
  box(b, S.white, x - 0.9, FLOOR + 0.98, zf + 0.53, 0.42, 0.22, 0.02);
  // the carpet on the wall
  box(b, S.redDark, x - 0.3, 1.78, zf + 0.265, 2.2, 1.3, 0.03);
  box(b, S.gold, x - 0.3, 1.78, zf + 0.285, 1.9, 1.0, 0.02);
  box(b, S.redDark, x - 0.3, 1.78, zf + 0.3, 1.7, 0.84, 0.02);
  slab(b, S.gold, x - 0.3, 1.78, zf + 0.315, 0.5, 0.5, 0.02, 0, 0, Math.PI / 4);
  // a standard lamp in the corner, its shade lit
  cyl(b, S.iron, x - 1.42, FLOOR, zf + 1.45, 0.03, 0.03, 1.3, 6);
  cyl(b, Z.bulb, x - 1.42, FLOOR + 1.26, zf + 1.45, 0.24, 0.12, 0.28, 10);
  b.light({ x, y: 2.0, z: zf + 1.5, color: 0xffb060, intensity: 10, distance: 12, mode: 'steady', weight: 1.1 });
}

/** A fir of our own (the kit's, with snow that shows on its tiers): none of it casts, so it draws with the snow. */
function fir(c: Ctx, x: number, z: number, h: number, seed: number, y0 = 0): void {
  const { b } = c;
  const r = h * 0.3;
  const tiers = Math.max(3, Math.round(h / 1.6));
  cyl(b, S.woodDark, x, y0, z, r * 0.14, r * 0.1, h * 0.18, 6);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const ty = y0 + h * (0.12 + t * 0.8);
    const tr = r * (1 - t * 0.82);
    const th = (h / tiers) * 1.7;
    cyl(b, Z.fir, x, ty, z, tr, 0, th, 9);
    if (i < tiers - 1) cyl(b, Z.snow, x, ty + th * 0.42, z, tr * 0.63, 0, th * 0.45, 9);
  }
  const rnd = lcg(seed);
  const n = Math.round(h * 9);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const a = t * Math.PI * 9 + rnd() * 0.4;
    const rr = r * (1 - t * 0.8) * 0.9;
    const yy = y0 + h * (0.16 + t * 0.8);
    const px = x + Math.cos(a) * rr;
    const pz = z + Math.sin(a) * rr;
    const s = 0.07 + h * 0.006;
    if (i % 3 === 0) box(b, [S.red, S.blue, S.gold, S.plum, S.teal][Math.floor(rnd() * 5)]!, px, yy - 0.1, pz, s * 1.4, s * 1.4, s * 1.4, a);
    else box(b, Z.bulb, px, yy, pz, s, s, s);
  }
  for (const a of [0, Math.PI / 4]) slab(b, S.gold, x, y0 + h * 0.99, z, h * 0.07, h * 0.07, 0.03, 0, a, Math.PI / 4);
}

/** The family's room: the television against the back wall with its frame frozen on the screen, a little fir, paper flags, the New Year table by the window. */
function tvRoom(c: Ctx): void {
  const { b } = c;
  const x = DVOR.tv.x;
  const zf = B1.z1;
  const sill = 1.0;
  const zw = flat(c, x, zf, 5.2, 2.8, 2.2, sill, S.paperGreen);
  // the window shut: a mullion and a transom, nothing in them
  box(b, S.white, x, (sill + 2.4) / 2, zw, 0.05, 2.4 - sill, 0.08);
  box(b, S.white, x, 2.05, zw, 2.2, 0.05, 0.08);
  // the television on its stand, turned to the window; an announcer's head and shoulders on the screen; a clock over it at three minutes to midnight
  const vx = x - 0.75;
  const vz = zf + 0.55;
  const va = 0.1;
  const out = (d: number, side = 0): [number, number] => [vx + Math.sin(va) * d + Math.cos(va) * side, vz + Math.cos(va) * d - Math.sin(va) * side];
  box(b, S.woodDark, vx, FLOOR + 0.3, vz, 0.8, 0.6, 0.5, va);
  box(b, S.wood, vx, FLOOR + 0.87, vz, 0.72, 0.54, 0.46, va);
  const [sx, sz] = out(0.236, -0.06);
  box(b, Z.blueLamp, sx, FLOOR + 0.89, sz, 0.46, 0.38, 0.02, va);
  const [hx, hz] = out(0.25, -0.06);
  box(b, S.black, hx, FLOOR + 0.79, hz, 0.22, 0.16, 0.012, va);
  box(b, S.black, hx, FLOOR + 0.93, hz, 0.11, 0.13, 0.012, va);
  const [kx, kz] = out(0.236, 0.27);
  for (const dy of [0.74, 0.86, 0.98]) box(b, S.cream, kx, FLOOR + dy, kz, 0.05, 0.05, 0.02, va);
  for (const s of [-1, 1]) slab(b, S.iron, vx + s * 0.09, FLOOR + 1.3, vz, 0.012, 0.36, 0.012, 0, va, s * 0.45);
  box(b, S.white, vx, 2.25, zf + 0.27, 0.34, 0.34, 0.03);
  slab(b, S.black, vx - 0.005, 2.31, zf + 0.29, 0.025, 0.12, 0.01, 0, 0, 0.03);
  slab(b, S.black, vx - 0.025, 2.33, zf + 0.29, 0.018, 0.16, 0.01, 0, 0, 0.31);
  // the fir in the corner, the flags along the back wall
  fir(c, x + 1.75, zf + 0.75, 1.6, 9, FLOOR);
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    box(b, i % 2 ? S.red : S.white, x - 2.2 + t * 4.4, 2.62 - Math.sin(t * Math.PI) * 0.16, zf + 0.5, 0.2, 0.2, 0.02);
  }
  // the table under its cloth, by the window: glasses, a bottle, plates, a bowl, mandarins
  const tx = x + 0.45;
  const tz = zf + 1.8;
  const ty = FLOOR + 0.75;
  box(b, S.white, tx, FLOOR + 0.5, tz, 1.5, 0.5, 0.75);
  for (const [dx, dz] of [[-0.52, -0.2], [-0.2, 0.22], [0.25, -0.22], [0.56, 0.16], [0.04, -0.05]] as const) cyl(b, S.cream, tx + dx, ty, tz + dz, 0.03, 0.022, 0.13, 6);
  cyl(b, S.greenDark, tx - 0.32, ty, tz + 0.02, 0.045, 0.045, 0.24, 8);
  cyl(b, S.gold, tx - 0.32, ty + 0.24, tz + 0.02, 0.02, 0.022, 0.1, 6);
  for (const [dx, dz] of [[-0.46, 0.18], [0.42, -0.2], [-0.22, -0.22], [0.28, 0.22]] as const) cyl(b, S.cream, tx + dx, ty, tz + dz, 0.12, 0.1, 0.02, 10);
  cyl(b, S.cream, tx + 0.06, ty, tz + 0.16, 0.16, 0.1, 0.1, 10);
  cyl(b, S.green, tx + 0.06, ty + 0.08, tz + 0.16, 0.14, 0.14, 0.04, 10);
  for (const [dx, dz, dy] of [[0.5, -0.02, 0], [0.58, 0.03, 0], [0.54, -0.09, 0], [0.54, -0.03, 0.07]] as const) orb(b, S.orange, tx + dx, ty + 0.045 + dy, tz + dz, 0.045, 1, 6);
  box(b, S.iron, tx, 2.6, tz, 0.02, 0.4, 0.02);
  cyl(b, Z.bulb, tx, 2.24, tz, 0.3, 0.16, 0.18, 10);
  b.light({ x: tx, y: 2.0, z: tz, color: 0xffc890, intensity: 11, distance: 12, mode: 'steady', weight: 1.1 });
  b.light({ x: vx, y: 1.3, z: vz + 0.7, color: 0x7fb0ff, intensity: 5, distance: 9, mode: 'steady', weight: 0.8 });
}

/** The repairman's window in the west block: lit, its vent open, a board on the sill with a radio (its back off), a coil of wire and a tin of solder. */
function toolWindow(c: Ctx): void {
  const f = faceOf(E, 'E');
  const a = DVOR.tool.z;
  pane(c, f, a, 2.25, 0.07, 1.3, 1.5, true);
  fbox(c, S.woodPale, f, a, 1.52, 0.3, 1.5, 0.05, 0.44);
  for (const s of [-1, 1]) fbox(c, S.iron, f, a + s * 0.6, 1.36, 0.28, 0.04, 0.28, 0.36);
  fbox(c, S.woodDark, f, a - 0.42, 1.69, 0.28, 0.42, 0.28, 0.2);
  fbox(c, S.cream, f, a - 0.42, 1.69, 0.385, 0.3, 0.16, 0.01);
  const [cx, cz] = fpos(f, a + 0.42, 0.3);
  cyl(c.b, S.black, cx, 1.545, cz, 0.11, 0.11, 0.05, 10);
  cyl(c.b, S.tin, cx - 0.02, 1.545, cz - 0.3, 0.04, 0.04, 0.08, 8);
  fbox(c, S.white, f, a + 0.4, 2.8, 0.18, 0.04, 0.36, 0.3);
  c.b.glow({ x: f.at + 0.5, y: 2.5, z: a, color: 0xffc890, size: 1.0, intensity: 1.2, mode: 'steady' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the yards' furniture
// ---------------------------------------------------------------------------------------------------------------------

/** A yard lamp: a concrete post, an arm reaching `yaw`'s way (0 = north), a lamp head under snow. */
function yardLamp(c: Ctx, x: number, z: number, yaw: number, lit: boolean): void {
  const { b } = c;
  const ax = -Math.sin(yaw);
  const az = -Math.cos(yaw);
  cyl(b, S.concrete, x, 0, z, 0.15, 0.09, 6.6, 8);
  cyl(b, S.concrete, x, 0, z, 0.24, 0.18, 0.6, 8);
  slab(b, S.iron, x + ax * 0.65, 6.62, z + az * 0.65, 0.07, 0.07, 1.4, 0.15, yaw, 0);
  const hx = x + ax * 1.5;
  const hz = z + az * 1.5;
  slab(b, S.iron, hx, 6.74, hz, 0.26, 0.1, 0.6, 0, yaw, 0);
  slab(b, S.cream, hx, 6.67, hz, 0.18, 0.05, 0.44, 0, yaw, 0);
  slab(b, Z.snow, hx, 6.82, hz, 0.24, 0.06, 0.56, 0, yaw, 0);
  solid(c, x, z, 0.4, 0.4, 6.6, 'zarya-lamp', { kind: 'none' });
  if (lit) b.light({ x: hx, y: 6.2, z: hz, color: 0xffb060, intensity: 36, distance: 28, mode: 'steady', pool: 9, glow: 1.2, weight: 1.2 });
  else b.glow({ x: hx, y: 6.6, z: hz, color: 0xffb060, size: 1.2, intensity: 2.2, mode: 'steady' });
}

/** A bare tree: a trunk, boughs leaning out of it, a twig off each. */
function tree(c: Ctx, x: number, z: number, h: number, k: number): void {
  const { b } = c;
  cyl(b, S.woodDark, x, 0, z, 0.2, 0.09, h, 6);
  for (let i = 0; i < 6; i++) {
    const a = i * 2.2 + k;
    const t = 0.55 + (i % 3) * 0.14;
    const L = 2.6 - (i % 2) * 0.6;
    const y0 = h * (0.5 + (i % 4) * 0.12);
    const ox = Math.cos(a) * Math.sin(t);
    const oz = Math.sin(a) * Math.sin(t);
    slab(b, S.woodDark, x + ox * (L / 2), y0 + (Math.cos(t) * L) / 2, z + oz * (L / 2), 0.07, L, 0.07, 0, -a, -t);
    const a2 = a + 0.9;
    const t2 = t + 0.3;
    slab(b, S.woodDark, x + ox * L * 0.7 + Math.cos(a2) * Math.sin(t2) * 0.6, y0 + Math.cos(t) * L * 0.7 + Math.cos(t2) * 0.6, z + oz * L * 0.7 + Math.sin(a2) * Math.sin(t2) * 0.6, 0.04, 1.2, 0.04, 0, -a2, -t2);
  }
  drift(b, x, z, 1.1, 0.16);
  solid(c, x, z, 0.4, 0.4, h, 'zarya-tree', { kind: 'none', surface: 'wood' });
}

/** The kit's bench, in this zone's colours: a bench under snow, facing `yaw`. */
function seat(c: Ctx, x: number, z: number, yaw: number): void {
  const { b } = c;
  box(b, S.wood, x, 0.45, z, 1.9, 0.08, 0.5, yaw);
  box(b, Z.snow, x, 0.53, z, 1.9, 0.09, 0.5, yaw);
  box(b, S.wood, x + Math.sin(yaw) * 0.26, 0.78, z + Math.cos(yaw) * 0.26, 1.9, 0.5, 0.07, yaw);
  for (const s of [-0.85, 0.85]) box(b, S.iron, x + Math.cos(yaw) * s, 0.24, z - Math.sin(yaw) * s, 0.07, 0.48, 0.5, yaw);
  solid(c, x, z, 1.9, 0.6, 0.9, 'zarya-bench', { rot: yaw, shots: false, kind: 'none', surface: 'wood' });
}

/** A carpet-beating rack: two posts and two bars, a carpet over the top one. */
function rack(c: Ctx, x: number, z: number, rot: number, k: number): void {
  const { b } = c;
  const dx = Math.cos(rot);
  const dz = -Math.sin(rot);
  for (const s of [-1, 1]) cyl(b, S.iron, x + dx * s * 1.3, 0, z + dz * s * 1.3, 0.04, 0.04, 2.1, 6);
  box(b, S.iron, x, 2.08, z, 2.7, 0.05, 0.05, rot);
  box(b, S.iron, x, 1.2, z, 2.7, 0.04, 0.04, rot);
  if (k >= 0) {
    const ground = k % 2 ? S.blue : S.redDark;
    box(b, ground, x, 1.42, z, 1.9, 1.3, 0.09, rot);
    box(b, k % 2 ? S.cream : S.gold, x, 1.42, z, 1.5, 0.9, 0.11, rot);
    box(b, k % 2 ? S.blue : S.redDark, x, 1.42, z, 1.1, 0.5, 0.13, rot);
    snow(c, x, 2.14, z, 1.95, 0.08, 0.2, rot);
  } else snow(c, x, 2.13, z, 2.6, 0.06, 0.1, rot);
  solid(c, x, z, 2.7, 0.3, 2.1, 'zarya-rack', { rot, shots: false, kind: 'none', surface: 'metal' });
}

/** Washing lines between two posts (along x), the washing frozen stiff on them. */
function washing(c: Ctx, x0: number, x1: number, z: number, seed: number): void {
  const { b } = c;
  const rnd = lcg(seed);
  const dyes = [S.red, S.blue, S.green, S.gold, S.plum, S.teal, S.orange, S.cream];
  for (const x of [x0, x1]) {
    cyl(b, S.iron, x, 0, z, 0.05, 0.05, 2.1, 6);
    box(b, S.iron, x, 2.06, z, 0.06, 0.06, 1.0);
    solid(c, x, z, 0.3, 1.0, 2.1, 'zarya-pole', { kind: 'none', surface: 'metal' });
  }
  for (const dz of [-0.4, 0, 0.4]) {
    box(b, S.black, (x0 + x1) / 2, 2.02, z + dz, x1 - x0, 0.02, 0.02);
    let x = x0 + 0.5 + rnd() * 0.6;
    while (x < x1 - 1.4) {
      const kind = rnd();
      if (kind < 0.4) {
        // a sheet
        const w = 1.1 + rnd() * 0.5;
        box(b, rnd() < 0.7 ? S.white : S.cream, x + w / 2, 1.46, z + dz, w, 1.1, 0.03);
        snow(c, x + w / 2, 2.05, z + dz, w, 0.05, 0.07);
        x += w + 0.25;
      } else if (kind < 0.75) {
        // a shirt: a body and two sleeves
        const m = dyes[Math.floor(rnd() * dyes.length)]!;
        box(b, m, x + 0.3, 1.66, z + dz, 0.5, 0.7, 0.03);
        for (const s of [-1, 1]) slab(b, m, x + 0.3 + s * 0.36, 1.78, z + dz, 0.16, 0.5, 0.03, 0, 0, s * 0.5);
        x += 0.95;
      } else {
        // long johns
        for (const s of [-1, 1]) box(b, S.cream, x + 0.25 + s * 0.12, 1.56, z + dz, 0.17, 0.9, 0.03);
        box(b, S.cream, x + 0.25, 1.92, z + dz, 0.42, 0.2, 0.03);
        x += 0.8;
      }
      x += rnd() * 0.5;
    }
  }
  solid(c, (x0 + x1) / 2, z, x1 - x0, 1.0, 2.0, 'zarya-washing', { shots: false, kind: 'none' });
}

/** A boxy saloon under snow, a drift against one side; `deep`: buried to its windows. */
function sedan(c: Ctx, x: number, z: number, yaw: number, paint: THREE.Material, deep: boolean): void {
  const { b } = c;
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const at = (lx: number, lz: number): [number, number] => [x + cs * lx + sn * lz, z - sn * lx + cs * lz];
  const part = (mat: THREE.Material, lx: number, y: number, lz: number, sx: number, sy: number, sz: number): void => {
    const [px, pz] = at(lx, lz);
    box(b, mat, px, y, pz, sx, sy, sz, yaw);
  };
  part(paint, 0, 0.62, 0, 4.1, 0.62, 1.62);
  part(paint, -0.2, 1.2, 0, 2.1, 0.56, 1.46);
  part(S.black, -0.2, 1.22, 0, 1.86, 0.36, 1.5);
  part(S.black, -0.2, 1.22, 0, 2.14, 0.36, 1.26);
  for (const s of [-1, 1]) {
    part(S.iron, s * 2.07, 0.42, 0, 0.08, 0.13, 1.66);
    part(S.white, 2.06, 0.7, s * 0.56, 0.03, 0.14, 0.22);
    part(S.red, -2.06, 0.7, s * 0.6, 0.03, 0.12, 0.2);
    for (const lx of [-1.3, 1.3]) {
      const [px, pz] = at(lx, s * 0.76);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 10), S.black);
      w.position.set(px, 0.31, pz);
      w.rotation.set(Math.PI / 2, yaw, 0, 'YXZ');
      put(b, w);
    }
  }
  part(Z.snow, -0.2, 1.6, 0, 2.0, 0.24, 1.42);
  part(Z.snow, 1.36, 1.0, 0, 1.3, 0.16, 1.52);
  part(Z.snow, -1.6, 0.99, 0, 0.84, 0.14, 1.52);
  part(Z.snow, 0.2, 0.22, -1.05, 4.6, 0.5, 0.9);
  part(Z.snow, 2.3, 0.16, 0, 0.7, 0.36, 1.9);
  if (deep) {
    part(Z.snow, 0.84, 1.16, 0, 0.5, 0.5, 1.44);
    part(Z.snow, 0, 0.36, 1.0, 4.4, 0.76, 0.8);
    part(Z.snow, -0.2, 1.74, 0, 1.5, 0.2, 1.1);
  }
  solid(c, x, z, 4.2, 1.7, 1.5, 'zarya-car', { rot: yaw, kind: 'prop', surface: 'metal' });
}

/** The playground of the west yard: a swing, the rocket, a slide, a sandbox under its mushroom, a see-saw, a snowman, and the fireworks someone left. */
function playground(c: Ctx): void {
  const { b } = c;
  // ---- the swing: two A-frames, a beam, two seats on chains ----
  {
    const x = -76;
    const z = 104;
    for (const sx of [-1.6, 1.6]) for (const s of [-1, 1]) slab(b, S.rust, x + sx, 1.08, z + s * 0.52, 0.07, 2.4, 0.07, -s * 0.45, 0, 0);
    box(b, S.rust, x, 2.16, z, 3.4, 0.08, 0.08);
    for (const sx of [-0.7, 0.7]) {
      for (const s of [-1, 1]) box(b, S.iron, x + sx + s * 0.2, 1.3, z, 0.02, 1.66, 0.02);
      box(b, S.woodPale, x + sx, 0.46, z, 0.5, 0.05, 0.2);
      snow(c, x + sx, 0.52, z, 0.5, 0.07, 0.2);
    }
    snow(c, x, 2.23, z, 3.3, 0.06, 0.1);
    solid(c, x, z, 3.4, 1.2, 2.2, 'zarya-swing', { shots: false, kind: 'none', surface: 'metal' });
  }
  // ---- the rocket: eight bars leaning to a point, three hoops, a red nose, fins ----
  {
    const x = -66;
    const z = 111;
    const r = 1.5;
    const top = 4;
    const L = Math.hypot(r, top);
    const lean = Math.atan2(r, top);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      slab(b, i % 2 ? S.rust : S.blue, x + (Math.cos(a) * r) / 2, top / 2, z + (Math.sin(a) * r) / 2, 0.07, L, 0.07, 0, -a, lean);
    }
    for (const y of [0.9, 1.8, 2.7]) {
      const rr = r * (1 - y / top);
      for (let i = 0; i < 8; i++) {
        const am = ((i + 0.5) * Math.PI) / 4;
        const d = rr * Math.cos(Math.PI / 8);
        box(b, S.rust, x + Math.cos(am) * d, y, z + Math.sin(am) * d, 2 * rr * Math.sin(Math.PI / 8) + 0.05, 0.06, 0.06, Math.PI / 2 - am);
      }
    }
    cyl(b, S.red, x, top - 0.6, z, 0.3, 0, 1.4, 8);
    cyl(b, Z.snow, x, top + 0.16, z, 0.2, 0, 0.7, 8);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 2;
      slab(b, S.red, x + Math.cos(a) * 1.7, 0.5, z + Math.sin(a) * 1.7, 0.6, 1.0, 0.05, 0, -a, 0);
      slab(b, Z.snow, x + Math.cos(a) * 1.7, 1.03, z + Math.sin(a) * 1.7, 0.6, 0.07, 0.1, 0, -a, 0);
    }
    solid(c, x, z, 2.7, 2.7, 4, 'zarya-rocket', { shots: false, kind: 'prop', surface: 'metal' });
  }
  // ---- the slide: a ladder up the west side, a deck, the chute down to the east ----
  {
    const x = -59;
    const z = 103;
    for (const sx of [-0.4, 0.4]) for (const s of [-1, 1]) box(b, S.rust, x + sx, 1.2, z + s * 0.38, 0.06, 2.4, 0.06);
    box(b, S.woodPale, x, 1.6, z, 0.9, 0.06, 0.82);
    for (const s of [-1, 1]) {
      box(b, S.rust, x, 2.36, z + s * 0.38, 0.9, 0.05, 0.05);
      slab(b, S.rust, x - 0.85, 0.8, z + s * 0.3, 0.05, 1.86, 0.05, 0, 0, -0.512);
      slab(b, S.rust, x + 1.7, 1.02, z + s * 0.31, 2.98, 0.22, 0.04, 0, 0, -0.509);
    }
    for (const t of [0.2, 0.4, 0.6, 0.8]) box(b, S.rust, x - 0.4 - 0.9 * (1 - t), 1.6 * t, z, 0.05, 0.04, 0.6);
    slab(b, S.blue, x + 1.7, 0.92, z, 2.98, 0.05, 0.6, 0, 0, -0.509);
    slab(b, Z.snow, x + 1.75, 0.96, z, 2.6, 0.05, 0.5, 0, 0, -0.509);
    snow(c, x, 1.66, z, 0.86, 0.07, 0.78);
    solid(c, x + 0.55, z, 4.4, 1.0, 2.0, 'zarya-slide', { shots: false, kind: 'none', surface: 'metal' });
  }
  // ---- the sandbox under snow, a mushroom on a post over it ----
  {
    const x = -75;
    const z = 116;
    for (const s of [-1, 1]) {
      box(b, S.woodPale, x, 0.15, z + s * 1.25, 2.6, 0.3, 0.1);
      box(b, S.woodPale, x + s * 1.25, 0.15, z, 0.1, 0.3, 2.6);
    }
    snow(c, x, 0.2, z, 2.4, 0.4, 2.4);
    orb(b, Z.snow, x + 0.4, 0.4, z - 0.3, 0.7, 0.4);
    cyl(b, S.woodPale, x - 0.6, 0, z + 0.6, 0.07, 0.07, 1.9, 6);
    cyl(b, S.red, x - 0.6, 1.75, z + 0.6, 1.0, 0, 0.6, 12);
    cyl(b, Z.snow, x - 0.6, 1.97, z + 0.6, 0.68, 0, 0.5, 12);
    solid(c, x, z, 2.7, 2.7, 0.6, 'zarya-sandbox', { shots: false, kind: 'none', surface: 'wood' });
  }
  // ---- the see-saw ----
  {
    const x = -63;
    const z = 119;
    box(b, S.rust, x, 0.3, z, 0.12, 0.6, 0.4);
    slab(b, S.woodPale, x, 0.62, z, 3.0, 0.06, 0.26, 0, 0, 0.16);
    slab(b, Z.snow, x, 0.67, z, 2.6, 0.05, 0.22, 0, 0, 0.16);
    for (const s of [-1, 1]) box(b, S.rust, x + s * 1.15, 0.78 + s * 0.18, z, 0.04, 0.26, 0.3);
    solid(c, x, z, 3.0, 0.5, 0.9, 'zarya-seesaw', { shots: false, kind: 'none', surface: 'wood' });
  }
  // ---- the snowman: a bucket on his head, sticks for arms ----
  {
    const x = -56;
    const z = 114;
    orb(b, Z.snow, x, 0.5, z, 0.56, 1, 10);
    orb(b, Z.snow, x, 1.26, z, 0.4, 1, 10);
    orb(b, Z.snow, x, 1.84, z, 0.28, 1, 10);
    cyl(b, S.rust, x, 2.04, z, 0.17, 0.21, 0.24, 8);
    box(b, S.orange, x - 0.3, 1.84, z + 0.08, 0.2, 0.05, 0.05, -0.25);
    for (const s of [-1, 1]) slab(b, S.woodDark, x, 1.4, z + s * 0.62, 0.03, 0.8, 0.03, s * 1.0, 0, 0);
    solid(c, x, z, 1.0, 1.0, 2, 'zarya-snowman', { shots: false, kind: 'none' });
  }
  // ---- the fireworks: a spent battery of tubes on its scorch, a carton, two rockets stuck in the snow by their sticks ----
  {
    const x = DVOR.cord.x;
    const z = DVOR.cord.z;
    box(b, S.black, x + 0.5, 0.014, z + 0.3, 1.1, 0.02, 1.0, 0.4);
    box(b, S.red, x + 0.5, 0.16, z + 0.3, 0.38, 0.3, 0.38, 0.4);
    for (let i = 0; i < 9; i++) cyl(b, S.black, x + 0.5 + ((i % 3) - 1) * 0.1, 0.31, z + 0.3 + (Math.floor(i / 3) - 1) * 0.1, 0.035, 0.035, 0.05, 6);
    box(b, S.woodPale, x - 0.45, 0.1, z - 0.35, 0.5, 0.2, 0.32, -0.3);
    for (const [dx, dz, k] of [[-0.25, 0.3, 0], [-0.5, 0.15, 1]] as const) {
      slab(b, S.woodPale, x + dx, 0.45, z + dz, 0.02, 0.9, 0.02, 0.1, 0, 0.12 - k * 0.3);
      cyl(b, k ? S.blue : S.green, x + dx - 0.07 + k * 0.16, 0.84, z + dz + 0.04, 0.05, 0.05, 0.3, 6);
      cyl(b, S.red, x + dx - 0.07 + k * 0.16, 1.14, z + dz + 0.04, 0.06, 0, 0.12, 6);
    }
  }
}

/** The hockey box of the west yard: ice inside boards a metre high, a way in on its north side, two goals, a puck. */
function rink(c: Ctx): void {
  const { b } = c;
  const q = DVOR.rink;
  const xm = (q.x0 + q.x1) / 2;
  const zm = (q.z0 + q.z1) / 2;
  groundRect(b, S.ice, q.x0, q.z0, q.x1, q.z1, 0.02);
  groundRect(b, S.red, xm - 0.08, q.z0 + 0.1, xm + 0.08, q.z1 - 0.1, 0.032);
  for (const s of [-1, 1]) groundRect(b, S.blue, xm + s * 4 - 0.08, q.z0 + 0.1, xm + s * 4 + 0.08, q.z1 - 0.1, 0.032);
  const run = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    const ew = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    box(b, S.white, x, 0.6, z, ew ? len : 0.08, 1.0, ew ? 0.08 : len);
    box(b, S.blue, x, 0.2, z, ew ? len : 0.1, 0.24, ew ? 0.1 : len);
    snow(c, x, 1.14, z, ew ? len : 0.16, 0.08, ew ? 0.16 : len);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) box(b, S.woodDark, x0 + ((x1 - x0) * i) / n, 0.6, z0 + ((z1 - z0) * i) / n, 0.12, 1.2, 0.12);
    solid(c, x, z, ew ? len : 0.3, ew ? 0.3 : len, 1.1, 'zarya-rink', { shots: false, kind: 'wall', surface: 'wood' });
  };
  const gate = DVOR.rinkGate.x;
  run(q.x0, q.z0, gate - 1.3, q.z0);
  run(gate + 1.3, q.z0, q.x1, q.z0);
  run(q.x0, q.z1, q.x1, q.z1);
  run(q.x0, q.z0, q.x0, q.z1);
  run(q.x1, q.z0, q.x1, q.z1);
  snow(c, xm, 0.2, q.z1 + 0.6, q.x1 - q.x0, 0.4, 1.0);
  for (const s of [-1, 1]) {
    const gx = xm + s * ((q.x1 - q.x0) / 2 - 1.6);
    for (const t of [-1, 1]) box(b, S.red, gx, 0.6, zm + t * 0.9, 0.06, 1.2, 0.06);
    box(b, S.red, gx, 1.2, zm, 0.06, 0.06, 1.86);
    slab(b, S.white, gx + s * 0.4, 0.58, zm, 0.03, 1.36, 1.8, 0, 0, s * 0.62);
    solid(c, gx + s * 0.35, zm, 0.9, 1.9, 1.2, 'zarya-goal', { shots: false, kind: 'none', surface: 'metal' });
  }
  cyl(b, S.black, xm + 0.9, 0.02, zm + 0.5, 0.06, 0.06, 0.04, 8);
}

/** The row of rubbish bins against the south block: a pad, a screen wall on three sides, four bins (one open), bags. */
function bins(c: Ctx, x: number, z: number): void {
  const { b } = c;
  box(b, S.concrete, x, 0.05, z, 6.4, 0.1, 2.2);
  box(b, S.concreteDark, x, 0.8, z + 1.0, 6.4, 1.6, 0.16);
  snow(c, x, 1.65, z + 1.0, 6.5, 0.12, 0.26);
  for (const s of [-1, 1]) {
    box(b, S.concreteDark, x + s * 3.12, 0.8, z, 0.16, 1.6, 2.2);
    snow(c, x + s * 3.12, 1.65, z, 0.26, 0.12, 2.3);
  }
  for (let i = 0; i < 4; i++) {
    const bx = x - 2.25 + i * 1.5;
    box(b, i % 2 ? S.rust : S.greenDark, bx, 0.62, z + 0.2, 1.1, 1.0, 1.1);
    for (const s of [-1, 1]) box(b, S.iron, bx + s * 0.5, 0.1, z + 0.2, 0.08, 0.2, 1.0);
    if (i === 1) {
      slab(b, S.iron, bx, 1.52, z + 0.72, 1.14, 0.05, 0.9, -1.1, 0, 0);
      orb(b, S.black, bx - 0.1, 1.14, z + 0.2, 0.34, 0.7);
    } else {
      box(b, S.iron, bx, 1.15, z + 0.2, 1.16, 0.06, 1.16);
      snow(c, bx, 1.24, z + 0.2, 1.1, 0.14, 1.1);
    }
  }
  orb(b, S.black, x + 2.7, 0.26, z - 0.5, 0.32, 0.8);
  orb(b, S.black, x + 2.3, 0.2, z - 0.75, 0.26, 0.8);
  box(b, S.woodPale, x - 2.75, 0.2, z - 0.6, 0.5, 0.4, 0.4, 0.3);
  solid(c, x, z, 6.4, 2.2, 1.6, 'zarya-bins', { kind: 'prop', surface: 'metal' });
}

/** The woodpile: a roofed stack with its cut ends to the yard, a sawhorse, and the chopping block (the spot) among split billets. */
function woodpile(c: Ctx): void {
  const { b } = c;
  const W = DVOR.woodpile;
  const sx = W.x - 5.7;
  const sz = W.z + 1.75;
  for (const s of [-1, 1]) {
    box(b, S.woodDark, sx + s * 2.6, 1.2, sz - 0.75, 0.12, 2.4, 0.12);
    box(b, S.woodDark, sx + s * 2.6, 1.0, sz + 0.75, 0.12, 2.0, 0.12);
  }
  slab(b, S.woodDark, sx, 2.24, sz, 5.8, 0.07, 2.0, 0.2, 0, 0);
  slab(b, Z.snow, sx, 2.38, sz, 5.9, 0.2, 2.1, 0.2, 0, 0);
  box(b, S.woodDark, sx, 0.8, sz + 0.06, 5.0, 1.6, 1.16);
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 16; i++) {
      const lx = sx - 2.4 + 0.16 + i * 0.31 + (j % 2) * 0.155;
      if (lx > sx + 2.36) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 7), (i * 7 + j * 3) % 3 ? S.woodPale : S.wood);
      m.position.set(lx, 0.17 + j * 0.3, sz - 0.56);
      m.rotation.x = Math.PI / 2;
      put(b, m);
    }
  }
  solid(c, sx, sz, 5.6, 1.6, 2.2, 'zarya-woodpile', { kind: 'prop', surface: 'wood' });
  // the sawhorse, a log across it
  const hx = W.x - 2.6;
  const hz = W.z - 1.7;
  for (const s of [-1, 1]) for (const t of [-1, 1]) slab(b, S.wood, hx + s * 0.5, 0.45, hz + t * 0.02, 0.07, 1.1, 0.07, t * 0.55, 0, 0);
  box(b, S.wood, hx, 0.3, hz, 1.0, 0.06, 0.06);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 1.7, 8), S.woodDark);
  log.position.set(hx, 0.92, hz);
  log.rotation.z = Math.PI / 2;
  put(b, log);
  solid(c, hx, hz, 1.7, 0.7, 1, 'zarya-sawhorse', { shots: false, kind: 'none', surface: 'wood' });
  // the block, and what has been split on it
  cyl(b, S.wood, W.x, 0, W.z, 0.32, 0.3, 0.55, 10);
  cyl(b, S.woodPale, W.x, 0.55, W.z, 0.3, 0.3, 0.02, 10);
  for (let k = 0; k < 8; k++) {
    const a = k * 1.9;
    const d = 0.7 + (k % 3) * 0.14;
    box(b, S.woodPale, W.x + Math.cos(a) * d, 0.07, W.z + Math.sin(a) * d, 0.36, 0.13, 0.15, k * 0.9);
  }
  solid(c, W.x, W.z, 0.6, 0.6, 0.56, 'zarya-block', { shots: false, kind: 'none', surface: 'wood' });
}

/** The kennel: a little house under a pitched roof, straw at its door, a bowl, and the post (the spot) its chain is hung on. */
function kennel(c: Ctx): void {
  const { b } = c;
  const P = DVOR.kennel;
  const hx = P.x - 1.7;
  const hz = P.z - 0.5;
  for (const s of [-1, 1]) {
    box(b, S.woodDark, hx, 0.03, hz + s * 0.4, 1.3, 0.06, 0.1);
    slab(b, S.woodDark, hx, 1.03, hz + s * 0.3, 1.5, 0.05, 0.76, s * 0.6, 0, 0);
    slab(b, Z.snow, hx, 1.12, hz + s * 0.3, 1.5, 0.12, 0.74, s * 0.6, 0, 0);
    box(b, S.wood, hx + s * 0.58, 0.98, hz, 0.04, 0.28, 0.56);
  }
  box(b, S.wood, hx, 0.46, hz, 1.2, 0.8, 1.0);
  box(b, S.black, hx + 0.61, 0.36, hz, 0.02, 0.5, 0.44);
  box(b, S.woodPale, hx + 0.95, 0.03, hz, 0.6, 0.05, 0.7);
  cyl(b, S.rust, P.x - 0.5, 0, P.z + 0.6, 0.16, 0.12, 0.09, 8);
  solid(c, hx, hz, 1.3, 1.2, 1.2, 'zarya-kennel', { shots: false, kind: 'none', surface: 'wood' });
  cyl(b, S.woodDark, P.x, 0, P.z, 0.07, 0.06, 1.1, 6);
  box(b, S.iron, P.x - 0.09, 0.9, P.z, 0.1, 0.03, 0.03);
  snow(c, P.x, 1.13, P.z, 0.16, 0.06, 0.16);
  solid(c, P.x, P.z, 0.2, 0.2, 1.1, 'zarya-pole', { shots: false, kind: 'none', surface: 'wood' });
}

/** The workbench under a lean-to against the south block: a vice, a board of tools, a shelf of tins (the tape is on it), a lamp. */
function leanTo(c: Ctx): void {
  const { b } = c;
  const f = faceOf(D, 'N');
  const a = DVOR.bench.x;
  fbox(c, S.woodPale, f, a, 1.7, 0.2, 3.6, 1.5, 0.05);
  fbox(c, S.wood, f, a, 0.9, 0.57, 3.4, 0.1, 1.0);
  for (const s of [-1, 1]) fbox(c, S.iron, f, a + s * 1.5, 0.43, 0.57, 0.08, 0.86, 0.9);
  fbox(c, S.iron, f, a - 1.25, 1.05, 0.85, 0.3, 0.2, 0.26);
  fbox(c, S.iron, f, a - 1.25, 1.2, 0.98, 0.06, 0.1, 0.4);
  for (let i = 0; i < 7; i++) fbox(c, i % 3 ? S.iron : S.woodDark, f, a - 1.5 + i * 0.3, 1.5 + ((i * 3) % 4) * 0.1, 0.24, 0.07, 0.4, 0.03);
  // on the bench: a tool box, a jar of nails, a plane
  fbox(c, S.greenDark, f, a + 0.9, 1.07, 0.6, 0.6, 0.24, 0.3);
  const [jx, jz] = fpos(f, a + 0.2, 0.75);
  cyl(b, S.tin, jx, 0.95, jz, 0.06, 0.06, 0.14, 8);
  fbox(c, S.woodPale, f, a - 0.4, 1.0, 0.6, 0.36, 0.1, 0.1);
  // the shelf, and what stands on it
  fbox(c, S.wood, f, a + 0.7, 1.56, 0.4, 1.9, 0.04, 0.3);
  const tins = [S.tin, S.rust, S.woodDark, S.teal, S.tin, S.greenDark];
  for (let i = 0; i < 6; i++) fbox(c, tins[i]!, f, a - 0.1 + i * 0.26, 1.58 + 0.07 + (i % 2) * 0.03, 0.42, 0.14, 0.14 + (i % 2) * 0.06, 0.14);
  // a crate to sit on, a car's wheel against the wall
  fbox(c, S.wood, f, a + 2.9, 0.25, 0.5, 0.6, 0.5, 0.6);
  const [wx, wz] = fpos(f, a - 2.6, 0.2);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 10), S.black);
  wheel.position.set(wx, 0.33, wz);
  wheel.rotation.x = Math.PI / 2 - 0.2;
  put(b, wheel);
  // the lean-to: two posts, a roof of boards sloping away from the wall, snow on it
  for (const s of [-1, 1]) {
    fbox(c, S.woodDark, f, a + s * 2.4, 1.15, 2.3, 0.12, 2.3, 0.12);
    fsolid(c, f, a + s * 2.4, 2.3, 0.3, 0.3, 2.3, 'zarya-pole', { kind: 'none', surface: 'wood' });
  }
  const [rx, rz] = fpos(f, a, 1.3);
  slab(b, S.woodDark, rx, 2.6, rz, 5.2, 0.07, 2.5, -0.26, 0, 0);
  slab(b, Z.snow, rx, 2.72, rz, 5.3, 0.18, 2.56, -0.26, 0, 0);
  const [lx, lz] = fpos(f, a + 0.2, 1.0);
  box(b, S.iron, lx, 2.5, lz, 0.02, 0.3, 0.02);
  orb(b, Z.bulb, lx, 2.3, lz, 0.1);
  b.light({ x: lx, y: 2.2, z: lz - 0.3, color: 0xffc98a, intensity: 16, distance: 14, mode: 'steady', pool: 4, glow: 0.7, weight: 1 });
  fsolid(c, f, a, 0.55, 3.4, 1.1, 1.0, 'zarya-bench', { shots: false, kind: 'prop', surface: 'wood' });
  fsolid(c, f, a + 2.9, 0.5, 0.6, 0.6, 0.5, 'zarya-crate', { shots: false, kind: 'none', surface: 'wood' });
}

/** The yard-keeper's shed by the east wall: boards and battens, a padlocked door, and against its yard side his shovels, a steel bar and a broom (the spot). */
function shed(c: Ctx): void {
  const { b } = c;
  const x = 96.7;
  const z = 106;
  const xw = x - 1.6;
  box(b, S.wood, x, 1.15, z, 3.2, 2.3, 3.6);
  for (let i = 0; i < 9; i++) box(b, S.woodDark, xw - 0.02, 1.15, z - 1.6 + i * 0.4, 0.03, 2.3, 0.06);
  for (let i = 0; i < 8; i++) box(b, S.woodDark, xw + 0.2 + i * 0.4, 1.15, z + 1.82, 0.06, 2.3, 0.03);
  slab(b, S.woodDark, x, 2.6, z, 3.7, 0.07, 4.0, 0, 0, 0.14);
  slab(b, Z.snow, x, 2.74, z, 3.8, 0.22, 4.1, 0, 0, 0.14);
  box(b, S.woodDark, x - 0.4, 1.0, z + 1.83, 0.9, 1.9, 0.05);
  box(b, S.iron, x + 0.02, 1.05, z + 1.87, 0.08, 0.1, 0.04);
  solid(c, x + 0.75, z, 4.7, 3.6, 2.6, 'zarya-shed', { kind: 'building', surface: 'wood' });
  // what leans on its yard side: two snow shovels, a spade, the steel bar, a birch broom
  const P = DVOR.shaft;
  const lean = (zz: number, len: number, t: number, mat: THREE.Material, w = 0.035): number => {
    const run = (Math.sin(t) * len) / 2;
    slab(b, mat, xw - 0.06 - run, (Math.cos(t) * len) / 2, zz, w, len, w, 0, 0, -t);
    return xw - 0.06 - run * 2;
  };
  for (const [dz, wide] of [[-0.75, 0.46], [-0.2, 0.42]] as const) {
    const foot = lean(P.z + dz, 1.5, 0.17, S.woodPale);
    slab(b, S.tin, foot + 0.02, 0.21, P.z + dz, 0.03, 0.42, wide, 0, 0, -0.17);
  }
  const foot = lean(P.z + 0.4, 1.3, 0.15, S.woodPale);
  slab(b, S.iron, foot + 0.02, 0.15, P.z + 0.4, 0.03, 0.3, 0.2, 0, 0, -0.15);
  lean(P.z + 0.85, 1.5, 0.13, S.iron, 0.03);
  const bf = lean(P.z + 1.4, 1.5, 0.2, S.woodPale, 0.03);
  cyl(b, S.woodDark, bf + 0.06, 0, P.z + 1.4, 0.17, 0.04, 0.44, 7);
  // his sand chest by the door
  box(b, S.woodDark, 94.2, 0.3, z + 2.7, 1.2, 0.6, 0.7);
  snow(c, 94.2, 0.66, z + 2.7, 1.24, 0.12, 0.74);
  solid(c, 94.2, z + 2.7, 1.2, 0.7, 0.7, 'zarya-crate', { shots: false, kind: 'none', surface: 'wood' });
}

/** A transformer hut: a concrete box under snow, steel doors, a vent, a yellow plate. */
function hut(c: Ctx, x: number, z: number): void {
  const { b } = c;
  addBox(b, 'concreteWall', x, 1.6, z, 4, 3.2, 5);
  box(b, S.concrete, x, 3.26, z, 4.4, 0.12, 5.4);
  snow(c, x, 3.44, z, 4.5, 0.24, 5.5);
  for (const s of [-1, 1]) box(b, S.greenDark, x + s * 0.56, 1.1, z - 2.52, 1.08, 2.1, 0.05);
  box(b, S.iron, x, 1.1, z - 2.55, 0.04, 2.1, 0.03);
  box(b, S.gold, x + 0.56, 1.6, z - 2.56, 0.3, 0.26, 0.02);
  for (let i = 0; i < 4; i++) box(b, S.iron, x + 2.02, 2.3 + i * 0.14, z, 0.03, 0.05, 1.2);
  snow(c, x - 2.3, 0.25, z + 0.4, 0.8, 0.5, 3.6);
  solid(c, x, z, 4, 5, 3.2, 'zarya-hut', { kind: 'building' });
}

/** A steel shell garage against the east wall, its doors to the yard. */
function shell(c: Ctx, z: number, paint: THREE.Material): void {
  const { b } = c;
  const x = 95.95;
  box(b, paint, x, 1.0, z, 5.1, 2.0, 2.9);
  box(b, paint, x, 2.12, z, 5.1, 0.24, 2.3);
  snow(c, x, 2.32, z, 5.2, 0.2, 2.5);
  for (const s of [-1, 1]) {
    snow(c, x, 2.1, z + s * 1.3, 5.2, 0.14, 0.4);
    box(b, S.iron, x - 2.57, 1.0, z + s * 0.68, 0.03, 1.8, 1.3);
  }
  box(b, S.tin, x - 2.6, 1.05, z + 0.1, 0.03, 0.12, 0.2);
  snow(c, x - 3.0, 0.2, z, 0.9, 0.4, 2.6);
  solid(c, x + 0.65, z, 6.4, 2.9, 2.2, 'zarya-shell', { kind: 'prop', surface: 'metal' });
}

/** A table for dominoes: boards on two posts, a plank bench either side, all under snow. */
function table(c: Ctx, x: number, z: number): void {
  const { b } = c;
  box(b, S.wood, x, 0.76, z, 1.7, 0.07, 0.8);
  snow(c, x, 0.85, z, 1.7, 0.1, 0.8);
  for (const s of [-1, 1]) {
    box(b, S.woodDark, x + s * 0.6, 0.37, z, 0.1, 0.74, 0.1);
    box(b, S.wood, x, 0.44, z + s * 0.78, 1.7, 0.06, 0.3);
    snow(c, x, 0.51, z + s * 0.78, 1.7, 0.08, 0.3);
    for (const t of [-1, 1]) box(b, S.woodDark, x + t * 0.65, 0.2, z + s * 0.78, 0.08, 0.42, 0.24);
  }
  solid(c, x, z, 1.7, 1.9, 0.8, 'zarya-table', { shots: false, kind: 'none', surface: 'wood' });
}

/** The children's snow fort: a horseshoe of snow blocks two courses high, open to the south-east, a flag on it, snowballs piled inside. */
function fort(c: Ctx, x: number, z: number): void {
  const { b } = c;
  const r = 2.2;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.62 + (i * Math.PI * 1.36) / 8;
    const bx = x + Math.cos(a) * r;
    const bz = z + Math.sin(a) * r;
    box(b, i % 2 ? Z.snowBlue : Z.snow, bx, 0.28, bz, 1.0, 0.56, 0.6, Math.PI / 2 - a);
    if (i < 8) {
      const a2 = a + (Math.PI * 1.36) / 16;
      box(b, i % 2 ? Z.snow : Z.snowBlue, x + Math.cos(a2) * r, 0.8, z + Math.sin(a2) * r, 0.9, 0.5, 0.56, Math.PI / 2 - a2);
    }
    solid(c, bx, bz, 1.1, 0.7, 1.0, 'zarya-fort', { rot: Math.PI / 2 - a, shots: false, kind: 'none' });
  }
  const fa = Math.PI * 1.3;
  slab(b, S.woodDark, x + Math.cos(fa) * r, 1.6, z + Math.sin(fa) * r, 0.03, 1.3, 0.03, 0.06, 0, 0.05);
  box(b, S.red, x + Math.cos(fa) * r + 0.22, 2.08, z + Math.sin(fa) * r, 0.4, 0.26, 0.02, 0.3);
  for (let i = 0; i < 7; i++) orb(b, Z.snow, x - 0.5 + (i % 3) * 0.2 + (i > 5 ? 0.1 : 0), i > 5 ? 0.24 : 0.09, z - 0.9 + Math.floor((i % 6) / 3) * 0.2, 0.1, 1, 6);
}

/** A summer-house: six posts, a rail between them, a pointed roof under snow (nobody goes in: it is one collider). */
function gazebo(c: Ctx, x: number, z: number): void {
  const { b } = c;
  const r = 1.9;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    box(b, S.woodDark, x + Math.cos(a) * r, 1.2, z + Math.sin(a) * r, 0.13, 2.4, 0.13, -a);
    if (i === 1) continue; // the way in, on the south side
    const am = a + Math.PI / 6;
    const d = r * Math.cos(Math.PI / 6);
    box(b, S.wood, x + Math.cos(am) * d, 0.55, z + Math.sin(am) * d, r, 0.7, 0.05, Math.PI / 2 - am);
    box(b, S.woodDark, x + Math.cos(am) * d, 0.95, z + Math.sin(am) * d, r + 0.1, 0.07, 0.1, Math.PI / 2 - am);
    snow(c, x + Math.cos(am) * d, 1.02, z + Math.sin(am) * d, r, 0.07, 0.12, Math.PI / 2 - am);
    box(b, S.wood, x + Math.cos(am) * (d - 0.3), 0.45, z + Math.sin(am) * (d - 0.3), r - 0.4, 0.06, 0.36, Math.PI / 2 - am);
  }
  cyl(b, S.wood, x, 0, z, 0.5, 0.5, 0.74, 8);
  cyl(b, S.woodDark, x, 2.36, z, 2.7, 0, 1.2, 6);
  cyl(b, Z.snow, x, 2.5, z, 2.42, 0, 1.2, 6);
  box(b, S.wood, x, 0.03, z, 3.4, 0.06, 3.0);
  solid(c, x, z, 3.5, 3.5, 2.4, 'zarya-gazebo', { kind: 'prop', surface: 'wood' });
}

/** A heap of shovelled snow, high enough to stop a walker. */
function heap(c: Ctx, x: number, z: number, r: number): void {
  orb(c.b, Z.snow, x, -r * 0.25, z, r, 0.75, 12);
  orb(c.b, Z.snow, x + r * 0.55, -r * 0.2, z + r * 0.3, r * 0.7, 0.7, 10);
  solid(c, x + r * 0.1, z, r * 1.5, r * 1.3, r * 0.4, 'zarya-heap', { shots: false, kind: 'none' });
}

/** The matryoshka's plinth (the doll is the story's): two steps of concrete, snow drifted on the lower one. */
function plinth(c: Ctx): void {
  const { b } = c;
  const P = DVOR.doll;
  box(b, S.concrete, P.x, 0.1, P.z, 3.0, 0.2, 3.0);
  box(b, S.concrete, P.x, 0.35, P.z, 2.2, 0.3, 2.2);
  for (const s of [-1, 1]) {
    snow(c, P.x, 0.24, P.z + s * 1.3, 3.0, 0.1, 0.4);
    snow(c, P.x + s * 1.3, 0.24, P.z, 0.4, 0.1, 2.2);
  }
  solid(c, P.x, P.z, 2.2, 2.2, 0.55, 'zarya-plinth', { shots: false, kind: 'prop' });
}

/** A fence of boards along z = `z`: posts, two rails, boards of uneven height with one missing here and there, a drift at its foot. */
function fence(c: Ctx, x0: number, x1: number, z: number, seed: number): void {
  const { b } = c;
  const len = x1 - x0;
  const xm = (x0 + x1) / 2;
  const rnd = lcg(seed);
  for (let x = x0; x <= x1 + 0.01; x += len / Math.max(1, Math.round(len / 2.6))) {
    box(b, S.woodDark, x, 0.8, z, 0.13, 1.6, 0.13);
    snow(c, x, 1.63, z, 0.18, 0.07, 0.18);
  }
  for (const y of [0.45, 1.15]) box(b, S.woodDark, xm, y, z, len, 0.09, 0.05);
  for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.36) {
    const k = rnd();
    if (k < 0.07) continue;
    const h = 1.28 + rnd() * 0.22;
    box(b, k > 0.8 ? S.woodDark : S.wood, x, h / 2 + 0.06, z + 0.05, 0.3, h, 0.03);
  }
  snow(c, xm, 0.14, z - 0.5, len, 0.3, 1.0);
  snow(c, xm, 0.34, z - 0.2, len, 0.16, 0.44);
  solid(c, xm, z, len, 0.3, 1.6, 'zarya-fence', { shots: false, kind: 'wall', surface: 'wood' });
}

/** Stroiteley Street along the south edge: the wall on its far side, a kerb, lamps, the stop's shelter. */
function street(c: Ctx): void {
  const { b } = c;
  const xm = (R.x0 + R.x1) / 2;
  const len = R.x1 - R.x0 - 3;
  box(b, S.concreteDark, xm, 1.4, 170.25, len, 2.8, 0.4);
  snow(c, xm, 2.87, 170.25, len, 0.14, 0.54);
  box(b, S.concrete, xm, 0.3, 170.02, len, 0.6, 0.12);
  for (let x = R.x0 + 4; x < R.x1 - 2; x += 6) box(b, S.concreteDark, x, 1.5, 170.0, 0.4, 3.0, 0.3);
  solid(c, xm, 170.25, R.x1 - R.x0, 0.4, 2.8, 'zarya-wall', { kind: 'wall' });
  solid(c, xm, 171.2, R.x1 - R.x0, 1.5, 3, 'zarya-beyond', { kind: 'none' });
  // ploughed snow along the wall's foot, clear of the stop
  for (const [x0, x1] of [[R.x0 + 1.5, -56], [8, R.x1 - 1.5]] as const) {
    snow(c, (x0 + x1) / 2, 0.22, 169.55, x1 - x0, 0.44, 1.0);
    snow(c, (x0 + x1) / 2, 0.5, 169.8, x1 - x0, 0.3, 0.5);
  }
  box(b, S.concrete, xm, 0.06, 158.05, len, 0.12, 0.22);
  for (const [x, lit] of [[-84, false], [-54, true], [-12, false], [24, false], [56, true], [92, false]] as const) yardLamp(c, x, 158.9, Math.PI, lit);
  // the shelter of the stop: its back to the fence, a bench under it
  const sx = -36;
  const sz = 159.2;
  box(b, S.woodDark, sx, 2.6, sz, 7.2, 0.1, 2.3);
  snow(c, sx, 2.75, sz, 7.4, 0.2, 2.5);
  for (const dx of [-3.4, 0, 3.4]) {
    for (const dz of [-1, 1]) box(b, S.woodDark, sx + dx, 1.3, sz + dz, 0.14, 2.6, 0.14);
    solid(c, sx + dx, sz + 1, 0.2, 0.2, 2.6, 'zarya-pole', { kind: 'none', surface: 'wood' });
  }
  box(b, Z.snowBlue, sx, 1.45, sz - 1.0, 6.8, 1.7, 0.06);
  for (const s of [-1, 1]) box(b, Z.snowBlue, sx + s * 3.4, 1.45, sz - 0.5, 0.06, 1.7, 0.9);
  box(b, S.wood, sx, 0.48, sz - 0.6, 5, 0.08, 0.44);
  for (const dx of [-2.2, 0, 2.2]) box(b, S.iron, sx + dx, 0.22, sz - 0.6, 0.06, 0.44, 0.4);
  box(b, Z.bulb, sx, 2.52, sz, 1.6, 0.04, 0.16);
  b.glow({ x: sx, y: 2.4, z: sz, color: 0xffc27a, size: 1.4, intensity: 1.8, mode: 'steady' });
  solid(c, sx, sz - 0.85, 6.9, 0.7, 2.6, 'zarya-stop', { kind: 'prop', surface: 'wood' });
}

/** The ground: snow, the street, the walks people have trodden (and the ways they cut across), the paving swept at the doors. */
function ground(c: Ctx): void {
  const { b } = c;
  groundRect(b, Z.snow, R.x0, R.z0, R.x1, R.z1, 0.004);
  const walk = (x0: number, z0: number, x1: number, z1: number, y = 0.014): void => groundRect(b, S.packed, x0, z0, x1, z1, y);
  const cut = (x0: number, z0: number, x1: number, z1: number, w = 1.5): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(x1 - x0, z1 - z0), w), S.packed);
    m.rotation.set(-Math.PI / 2, Math.atan2(-(z1 - z0), x1 - x0), 0, 'YXZ');
    m.position.set((x0 + x1) / 2, 0.018, (z0 + z1) / 2);
    put(b, m);
  };
  walk(R.x0, 158, R.x1, 170, 0.009); // Stroiteley Street
  walk(-27, R.z0, -19, 86.5); // through the archway
  walk(-25.2, 86.5, -20.8, 158); // and on down to the stop
  walk(-90, 89.8, 96, 92.2, 0.016); // along the north blocks' doors
  walk(-89.2, 92.2, -87, 148.5); // along the west block's
  walk(-90, 148.5, -25.2, 152.5, 0.016); // the drive across the south of the west yard
  walk(-71.5, 152.5, -66.5, 158); // and out of it to the street
  walk(-82, 99, -54, 124, 0.012); // the playground
  walk(-63.5, 92.2, -60.5, 99);
  walk(-44, 118, -36, 126, 0.012); // round the plinth
  walk(-36, 120.6, -25.2, 123.4, 0.016);
  walk(-20.8, 139.8, 28, 142.8, 0.016); // round the south end of the middle block
  walk(28, 92.2, 31, 144.5); // down the east yard
  walk(31, 120.5, R.x1, 123.5, 0.016); // to the garages' gate
  walk(80, 123.5, 83, 158); // and out to the street
  // the ways people cut across the snow
  cut(-26, 93, -54, 100.5);
  cut(-40, 126, DVOR.rinkGate.x, DVOR.rink.z0, 1.3);
  cut(-20.8, 98, 1, 93.6);
  cut(13, 93, 44, 106.5);
  cut(48, 110, 62, 120.5);
  cut(31, 127, 40.5, 141.5, 1.3);
  cut(-54, 124, -50.5, 132.5, 1.3);
  cut(-87, 130, -77, 134.5, 1.3);
  cut(70, 123.5, 69, 129, 1.2);
  // swept paving before the two open doors
  for (const d of DVOR.doors) groundRect(b, S.swept, d.x - 2.2, d.z - 0.4, d.x + 2.2, d.z + 1.7, 0.022);
}

export interface DvorHandles {
  /** Nothing the story moves here yet. */
  none?: undefined;
}

export function buildDvor(c: Ctx): DvorHandles {
  const { b } = c;
  ground(c);

  // ---- the blocks ----
  block(c, A, ['S'], 31);
  block(c, B1, ['S'], 32, 0.012);
  block(c, B2, ['S'], 33);
  block(c, E, ['E', 'S'], 34, 0.012);
  block(c, M, ['N', 'S', 'E', 'W'], 35);
  block(c, D, ['N', 'S', 'E', 'W'], 36);
  tunnel(c);
  dress(c, faceOf(A, 'S'), { doors: [7, 13, 19], open: [13], stacks: [5, 9, 11, 15, 17, 21, 23], rooms: [21] });
  dress(c, faceOf(B1, 'S'), { doors: [3, 10, 17], stacks: [1, 5, 8, 12, 15], rooms: [12] });
  dress(c, faceOf(B2, 'S'), { doors: [3, 10, 16], open: [3], stacks: [1, 5, 8, 12, 14, 18] });
  dress(c, faceOf(E, 'E'), { doors: [4, 11, 17], stacks: [2, 6, 9, 13, 15] });
  dress(c, faceOf(M, 'E'), { doors: [3, 9], stacks: [1, 5, 7, 11] });
  dress(c, faceOf(M, 'W'), { stacks: [1, 4, 8, 11] });
  dress(c, faceOf(D, 'N'), { doors: [5, 15], stacks: [1, 7, 12, 18] });
  dress(c, faceOf(D, 'S'), { stacks: [2, 6, 10, 14, 17] });
  babushkaRoom(c);
  tvRoom(c);
  toolWindow(c);
  // behind the blocks is nobody's ground: the strips along the walls, the corner past the north-east block
  solid(c, (R.x0 + A.x1) / 2 + 0.1, 72.85, A.x1 - R.x0 - 0.2, 1.3, 3, 'zarya-beyond', { kind: 'none' });
  solid(c, (B1.x0 + R.x1) / 2 - 0.1, 72.85, R.x1 - B1.x0 - 0.2, 1.3, 3, 'zarya-beyond', { kind: 'none' });
  solid(c, R.x0 + 0.85, (R.z0 + E.z1) / 2, 1.3, E.z1 - R.z0, 3, 'zarya-beyond', { kind: 'none' });
  solid(c, R.x1 - 0.85, (R.z0 + B2.z1) / 2, 1.3, B2.z1 - R.z0, 3, 'zarya-beyond', { kind: 'none' });

  // ---- the west yard ----
  playground(c);
  plinth(c);
  rink(c);
  woodpile(c);
  fort(c, -42, 102);
  for (const [x, z, yaw] of [[-66.5, 88.3, Math.PI], [-57.5, 88.3, Math.PI], [-48.5, 88.3, Math.PI], [-69, 125.2, 0], [-52.5, 108, Math.PI / 2], [0.5, 117.5, Math.PI / 2]] as const) seat(c, x, z, yaw);
  washing(c, -16, -6, 100, 3);
  washing(c, -16, -6, 104, 4);
  rack(c, -13, 111, 0, 0);
  rack(c, -7, 115.5, Math.PI / 2, 1);
  rack(c, -47, 96, 0, -1);
  sedan(c, -58, 145.3, Math.PI / 2 + 0.05, S.cream, true);
  sedan(c, -53.5, 145.6, Math.PI / 2 - 0.04, S.teal, false);
  sedan(c, -9, 136.5, 0.08, S.cherry, true);
  yardLamp(c, -27, 114, Math.PI / 2, true);
  yardLamp(c, -56, 127.5, 0, true);
  yardLamp(c, -50.4, 140, -Math.PI / 2, true);
  yardLamp(c, -71, 96.5, Math.PI, false);
  yardLamp(c, -16, 130, Math.PI / 2, false);
  for (const [x, z, h, k] of [
    [-84.5, 94.5, 6.5, 1], [-80.5, 128, 7, 2], [-33, 97, 6, 3], [-68, 141, 6, 5], [-10, 125, 6.5, 6], [-4, 147, 7, 8], [-86, 154, 6, 9], [-30, 154.5, 6.5, 10],
    // down both sides of the walk from the archway
    [-27.6, 103, 7, 20], [-27.6, 130, 6.5, 21], [-18.4, 96, 6.5, 22], [-18.4, 109, 7, 23], [-18.4, 120, 6, 24], [-18.4, 137, 7, 25], [-18.4, 148, 6.5, 26],
  ] as const) tree(c, x, z, h, k);
  for (const [x, z, r] of [[-84.5, 144.5, 2.2], [-77, 154.2, 1.8], [-2.5, 153.6, 2.2], [-62, 133, 2]] as const) heap(c, x, z, r);
  fence(c, -102.5, -72, 157, 1);
  fence(c, -66, -29, 157, 2);
  fence(c, -17, 13, 157, 3);
  solid(c, -103.15, 157, 1.3, 0.3, 1.6, 'zarya-fence', { shots: false, kind: 'none' });

  // ---- the east yard ----
  fir(c, DVOR.fir.x, DVOR.fir.z, 5, 14);
  solid(c, DVOR.fir.x, DVOR.fir.z, 1, 1, 5, 'zarya-tree', { kind: 'none', surface: 'wood' });
  // the box the ornaments came out of, at its foot
  box(b, S.woodPale, DVOR.ornament.x + 0.5, 0.12, DVOR.ornament.z + 0.3, 0.5, 0.24, 0.36, 0.4);
  [S.red, S.blue, S.gold, S.plum, S.teal].forEach((m, i) => orb(b, m, DVOR.ornament.x + 0.36 + (i % 3) * 0.13, 0.28, DVOR.ornament.z + 0.24 + Math.floor(i / 3) * 0.13, 0.055, 1, 6));
  kennel(c);
  leanTo(c);
  shed(c);
  bins(c, 68.5, 143.3);
  hut(c, 53, 133);
  shell(c, 131.2, S.greenDark);
  shell(c, 134.8, S.rust);
  table(c, 36.5, 130.5);
  gazebo(c, 79, 111);
  for (const [x, z, yaw] of [[46.3, 88.9, Math.PI], [55.3, 88.9, Math.PI], [42.5, 110, -Math.PI / 2], [24, 96, Math.PI]] as const) seat(c, x, z, yaw);
  washing(c, 60, 69, 108, 5);
  rack(c, 36, 101, 0, 2);
  rack(c, 78, 100, Math.PI / 2, -1);
  sedan(c, 58, 96, 0.06, S.green, false);
  sedan(c, 20, 133, Math.PI / 2 + 0.1, S.white, true);
  sedan(c, 88.5, 151, Math.PI / 2 - 0.08, S.blue, true);
  yardLamp(c, 38, 114, -Math.PI / 2, true);
  yardLamp(c, 76, 118.3, Math.PI, true);
  yardLamp(c, 64, 94.5, Math.PI, false);
  yardLamp(c, 88, 141, Math.PI / 2, false);
  for (const [x, z, h, k] of [
    [38, 127, 7, 11], [59, 138.5, 6.5, 12], [88, 96, 6, 13], [89, 128.6, 7, 14], [24, 113, 6, 15], [70, 104, 6.5, 16], [50, 124.6, 6, 17], [94, 149, 6.5, 18],
    [33, 107, 6.5, 30], [26, 124, 7, 31], [47, 119.2, 6, 32], [64.5, 119.2, 6.5, 33], [66, 124.8, 6, 34], [84, 104, 6.5, 35], [17, 137.6, 6, 36],
  ] as const) tree(c, x, z, h, k);
  for (const [x, z, r] of [[76.5, 151.5, 2.4], [56.4, 142.6, 1.6], [93, 91.5, 1.8], [39, 88.2, 1.4], [16, 96.5, 1.6]] as const) heap(c, x, z, r);
  fence(c, 86, 98.5, 157, 4);
  solid(c, 99.15, 157, 1.3, 0.3, 1.6, 'zarya-fence', { shots: false, kind: 'none' });

  // ---- drifts, to break the flat of the snow ----
  for (const [x, z, r] of [
    [-82, 134, 2], [-50, 104, 1.8], [-12, 120, 1.9], [-3, 106, 1.6], [-44, 151, 1.8], [-76, 146, 2.2], [-34, 106, 2],
    [-88.5, 100, 1.3], [-6, 92.5, 1.4], [-64, 137, 1.9], [-12, 146, 2.1], [-96, 148, 2], [-70, 131, 1.6], [-45, 110, 1.5],
    [22, 104, 1.9], [54, 114, 2.2], [66, 127, 1.7], [38, 137, 2], [58, 104, 1.5], [90, 146, 2.3], [74, 93, 1.5], [18, 122, 1.6], [46, 128, 1.8], [72, 136, 1.6],
  ] as const) drift(b, x, z, r * 1.2, r * 0.13);
  // snow shovelled up against the foot of the blocks, between their doors
  for (const [x, z, w, d] of [
    [-71, 85, 6, 2.6], [-53, 85, 5, 2.4], [-86, 85, 5, 2.8], [-2, 85, 5, 2.4], [29, 85, 6, 2.6], [61, 86, 6, 2.6], [81, 86, 6, 2.4],
    [-91.5, 105, 2.6, 4], [-91.5, 128.5, 2.4, 4], [2, 106.5, 2.4, 5], [2, 128.5, 2.6, 5], [13, 117.5, 2.4, 5], [22, 144.5, 5, 2.4], [53, 144.5, 5, 2.6],
  ] as const) bank(b, x, z, w, d, 0.55);

  street(c);
  return {};
}
