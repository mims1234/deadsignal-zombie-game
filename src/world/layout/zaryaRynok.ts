/**
 * ZARYA: the RYNOK (`zarya/zones/rynok.ts`), built from `research_notes/zarya/refs/ry-*.jpg`: the covered market east
 * of the Univermag. The tram line runs along the north behind its wall; the hall stands in the middle under a barrel
 * vault of iron and frosted glass, four rows of tiled stalls inside it; the butcher's cold store is built onto its east
 * end; shuttered kiosks, the repair booth and the police post go down the west side; and south of the hall is the
 * open yard, its canvas stalls and hand carts, with the painted matryoshka on her plinth in the middle of it.
 */
import * as THREE from 'three';
import type { BoxCollider } from '../collision';
import { addBox, groundRect, type MatRef } from '../structures';
import type { LevelBuilder } from '../builder';
import type { Ctx } from './util';
import { RYNOK, RYNOK_STALLS, RYNOK_YARD } from '../../zarya/zones/rynok';
import { GOODS, Z as KZ, bench, box as kitBox, bulbString, cyl as kitCyl, firTree, lampPost, slab as kitSlab, solid } from './zaryaKit';

export interface RynokHandles {
  /** The cold store's door (built open; barred behind Borya). */
  coldDoor: BoxCollider;
}

const R = RYNOK;
const H = R.hall;
const K = R.coldStore;
/** The hall: its eaves, the crown of its vault, its middle. */
const EAVE = 5.5;
const CROWN = 10;
const XC = (H.x0 + H.x1) / 2;
const ZC = (H.z0 + H.z1) / 2;
const HALF = (H.z1 - H.z0) / 2;
/** The vault is an arc of a circle through both eaves and the crown. */
const RAD = (HALF * HALF + (CROWN - EAVE) * (CROWN - EAVE)) / (2 * (CROWN - EAVE));
const vaultY = (dz: number): number => CROWN - RAD + Math.sqrt(RAD * RAD - dz * dz);
/** The piers along the hall's long walls (ten of them, nine bays) and its end walls (six, five bays). */
const px = (i: number): number => H.x0 + 0.3 + (i * (H.x1 - H.x0 - 0.6)) / 9;
const pz = (j: number): number => H.z0 + 0.3 + (j * (H.z1 - H.z0 - 0.6)) / 5;
/** The bays of the long walls that are doorways (north and south alike). */
const DOOR_BAYS = [2, 4, 6];
const TRACK_Z = -54;
const LINE_WALL_Z = -60.6;

const std = (color: number, roughness = 0.85): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness });
/**
 * The kit's colours, at as few finishes as will do. The level builder draws one batch per finish, per shadow flag, per
 * 78 m chunk, and the moon's shadow pass draws every batch that casts a second time, whole. So here everything small
 * is one matt finish that casts nothing (the stalls and all that is on them, the ironwork, the crates), the ground and
 * the snow are the kit's, what glows is the kit's, and only the big plain shapes cast: brick walls, and the few things
 * of sheet metal (`S`: the vault, the cold store's panels, the kiosks, the lorry), which are drawn with the kit's own
 * iron lamp posts.
 */
const Z = {
  ...KZ,
  concrete: std(0x8b9199),
  concreteDark: std(0x555b64),
  green: std(0x4f6f52),
  greenDark: std(0x2f4a36),
  black: std(0x101216),
  red: std(0xb3261e),
  grey: std(0x8a8f98),
  orange: std(0xe08a1e),
  iron: std(0x2b2f36),
  steel: std(0x59626e),
  brass: std(0xb08a3a),
  gold: std(0xd6aa3c),
};
/** Colours the kit lacks. */
const M = {
  meat: std(0xa5463c),
  meatDark: std(0x7d2a26),
  fat: std(0xe2cfc0),
  floor: std(0x82796c, 0.9),
  floorLine: std(0x6a6258, 0.9),
  coldFloor: std(0x8b9199, 0.9),
  tile: std(0xd9d5c8),
  canvas: std(0xc4b99c, 0.95),
  sack: std(0x9c8a66),
  fur: [std(0x4a3626), std(0x25201d), std(0x8a8078), std(0xcfc6b4)],
};

const sheet = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.5 });
/** Sheet metal: the only finish of this zone's own that throws a shadow (it is the kit's iron's finish). */
const S = {
  deck: sheet(0x35463f),
  panel: sheet(0xf4f2ec),
  kiosk: [sheet(0x6f9a74), sheet(0x4a72c4), sheet(0xe6dcc2), sheet(0xa83a34)],
  cab: sheet(0x4a72c4),
};
/** Whether a thing of this material throws a shadow: only sheet metal (and brick, which `addBox` casts). */
const casts = (m: THREE.Material): boolean => (m as THREE.MeshStandardMaterial).metalness >= 0.4;
// the kit's shapes, with the shadow flag taken from the finish (so one finish is one batch)
function box(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0): void {
  kitBox(b, mat, x, y, z, sx, sy, sz, rot, casts(mat));
}
function cyl(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8): void {
  kitCyl(b, mat, x, y, z, r0, r1, h, seg, casts(mat));
}
function slab(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number): void {
  kitSlab(b, mat, x, y, z, sx, sy, sz, rx, ry, rz, casts(mat));
}
/** Add a mesh made by hand with the flags a box of its material would have. */
function own(c: Ctx, m: THREE.Mesh): void {
  m.castShadow = casts(m.material as THREE.Material);
  m.receiveShadow = true;
  c.b.add(m);
}
/** A ball, squashed by `sy` (and `sz` across, `sx` along, turned by `rot`). */
function ball(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 8, sz = 1, sx = 1, rot = 0): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.y = rot;
  m.castShadow = casts(mat);
  m.receiveShadow = true;
  b.add(m);
}
/** Goods on a shelf: a run of small coloured boxes along x (the kit's own, drawn with this zone's batches). */
function goods(b: LevelBuilder, x: number, y: number, z: number, len: number, alongZ: boolean, seed: number, o: { h?: number; d?: number; mats?: readonly THREE.Material[]; step?: number } = {}): void {
  let s = seed * 7919 + 13;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const mats = o.mats ?? GOODS;
  const step = o.step ?? 0.34;
  const n = Math.max(1, Math.floor(len / step));
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.12) continue;
    const t = -len / 2 + (i + 0.5) * step;
    const h = (o.h ?? 0.26) * (0.7 + rnd() * 0.6);
    const w = step * (0.6 + rnd() * 0.3);
    const d = o.d ?? 0.22;
    box(b, mats[Math.floor(rnd() * mats.length)]!, alongZ ? x : x + t, y + h / 2, alongZ ? z + t : z, alongZ ? d : w, h, alongZ ? w : d);
  }
}
/** Paper flags on a line along x. */
function garland(b: LevelBuilder, x0: number, x1: number, y: number, z: number, n: number): void {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    box(b, i % 2 ? Z.red : Z.white, x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * 0.3, z, 0.22, 0.22, 0.03);
  }
}

type Fr = (u: number, v: number) => [number, number];
/** A thing's own frame: `u` along it, `v` toward its front, turned by `rot` (the way a box's own turn goes). */
const frame = (x: number, z: number, rot: number): Fr => {
  const co = Math.cos(rot);
  const si = Math.sin(rot);
  return (u, v) => [x + u * co + v * si, z - u * si + v * co];
};

// ---------------------------------------------------------------------------------------------------------------------
// small things
// ---------------------------------------------------------------------------------------------------------------------

/** A stack of crates, the biggest at the bottom. */
function crates(c: Ctx, x: number, z: number, n: number, seed: number, snow = true): void {
  const { b } = c;
  let y = 0;
  let w = 1.0 - (seed % 3) * 0.08;
  for (let i = 0; i < n; i++) {
    const rot = ((seed * 7 + i * 13) % 9) * 0.07 - 0.28;
    box(b, i % 2 ? Z.wood : Z.woodPale, x, y + w * 0.4, z, w, w * 0.8, w, rot);
    box(b, Z.woodDark, x, y + w * 0.4, z, w + 0.03, 0.08, w + 0.03, rot);
    y += w * 0.8;
    w *= 0.84;
  }
  if (snow) box(b, Z.snow, x, y + 0.04, z, w * 1.1, 0.08, w * 1.1);
  solid(c, x, z, 1.0, 1.0, y, 'zarya-crate', { shots: y > 1.2, kind: 'none', surface: 'wood' });
}

/** A pickle barrel: staves, two hoops, a lid (or what is in it). */
function barrel(c: Ctx, x: number, z: number, lid: THREE.Material = Z.woodDark): void {
  const { b } = c;
  cyl(b, Z.wood, x, 0, z, 0.36, 0.34, 0.92, 10);
  for (const y of [0.18, 0.68]) cyl(b, Z.iron, x, y, z, 0.375, 0.375, 0.05, 10);
  cyl(b, lid, x, 0.92, z, 0.31, 0.31, 0.03, 10);
  solid(c, x, z, 0.7, 0.7, 0.95, 'zarya-barrel', { shots: false, kind: 'none', surface: 'wood' });
}

/** A heap of sacks. */
function sacks(c: Ctx, x: number, z: number, n: number): void {
  const { b } = c;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4;
    const top = i >= 3;
    ball(b, i % 2 ? M.sack : M.canvas, x + (top ? 0 : Math.cos(a) * 0.36), top ? 0.62 : 0.24, z + (top ? 0 : Math.sin(a) * 0.36), 0.38, 0.62, 8);
  }
  solid(c, x, z, 1.3, 1.3, 0.7, 'zarya-sacks', { shots: false, kind: 'none', surface: 'wood' });
}

/** A wheel on its side axis (`rot` turns the cart it belongs to). */
function wheel(c: Ctx, x: number, y: number, z: number, r: number, rot: number): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.08, 12), Z.woodDark);
  m.position.set(x, y, z);
  m.rotation.set(Math.PI / 2, rot, 0, 'YXZ');
  own(c, m);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.14, 8), Z.iron);
  hub.position.set(x, y, z);
  hub.rotation.set(Math.PI / 2, rot, 0, 'YXZ');
  own(c, hub);
}

/** A two-wheeled hand cart resting on its shafts, with a load on it. */
function cart(c: Ctx, x: number, z: number, rot: number, load: 'sacks' | 'crates' | 'snow'): void {
  const { b } = c;
  const f = frame(x, z, rot);
  const put = (mat: THREE.Material, u: number, y: number, v: number, sx: number, sy: number, sz: number): void => {
    const [qx, qz] = f(u, v);
    box(b, mat, qx, y, qz, sx, sy, sz, rot);
  };
  put(Z.woodPale, 0, 0.66, 0, 2.1, 0.1, 1.1);
  for (const v of [-0.55, 0.55]) put(Z.wood, 0, 0.86, v, 2.1, 0.3, 0.05);
  put(Z.wood, -1.05, 0.86, 0, 0.05, 0.3, 1.1);
  for (const v of [-0.66, 0.66]) {
    const [wx, wz] = f(-0.15, v);
    wheel(c, wx, 0.46, wz, 0.46, rot);
    const [hx, hz] = f(1.7, v * 0.72);
    slab(b, Z.wood, hx, 0.43, hz, 1.5, 0.07, 0.07, 0, rot, -0.3);
  }
  put(Z.wood, 2.35, 0.2, 0, 0.07, 0.07, 1.0);
  if (load === 'sacks') {
    for (const [u, v, y] of [[-0.5, -0.15, 0.9], [0.3, 0.12, 0.9], [-0.1, 0, 1.2]] as const) {
      const [qx, qz] = f(u, v);
      ball(b, M.sack, qx, y, qz, 0.4, 0.55, 8);
    }
  } else if (load === 'crates') {
    put(Z.woodPale, -0.4, 1.06, 0, 0.9, 0.7, 0.9);
    put(Z.wood, 0.55, 0.96, 0.05, 0.7, 0.5, 0.8);
    put(Z.snow, -0.4, 1.44, 0, 0.92, 0.07, 0.92);
  } else put(Z.snow, 0, 0.8, 0, 2.0, 0.26, 1.0);
  solid(c, x, z, 2.3, 1.4, 1.1, 'zarya-cart', { rot, shots: false, kind: 'none', surface: 'wood' });
}

/** A snow bank: a long low heap, `w` by `d`, rounded over. */
function drift(c: Ctx, x: number, z: number, w: number, d: number, h = 0.5, rot = 0): void {
  ball(c.b, Z.snow, x, 0, z, 1, h * 0.75, 10, d / 2, w / 2, rot);
  ball(c.b, Z.snowBlue, x + Math.cos(rot) * w * 0.12, 0, z - Math.sin(rot) * w * 0.12, 1, h * 0.4, 10, d * 0.72, w * 0.56, rot + 0.05);
}

/** A fir with a trunk nobody walks through. */
function fir(c: Ctx, x: number, z: number, h: number): void {
  firTree(c.b, x, z, h);
  solid(c, x, z, 0.8, 0.8, h * 0.8, 'zarya-tree', { kind: 'none', surface: 'wood' });
}

/** A bare tree: a trunk and a few boughs. */
function bareTree(c: Ctx, x: number, z: number, h: number): void {
  const { b } = c;
  cyl(b, Z.woodDark, x, 0, z, 0.2, 0.1, h * 0.7, 6);
  for (let i = 0; i < 6; i++) {
    const a = i * 2.2;
    const y = h * (0.5 + (i % 3) * 0.13);
    slab(b, Z.woodDark, x + Math.cos(a) * 0.6, y, z + Math.sin(a) * 0.6, 0.07, h * 0.42, 0.07, Math.sin(i * 1.7) * 0.5, a, 0.8);
  }
  solid(c, x, z, 0.5, 0.5, h * 0.7, 'zarya-tree', { kind: 'none', surface: 'wood' });
}

/** The kvass seller's tank: a yellow barrel lying on a two-wheeled trailer, its tap to the south, snow along its back. */
function kvass(c: Ctx, x: number, z: number): void {
  const { b } = c;
  const lie = (mat: THREE.Material, r: number, len: number, dx = 0, y = 1.25): void => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
    m.position.set(x + dx, y, z);
    m.rotation.z = Math.PI / 2;
    own(c, m);
  };
  lie(Z.gold, 0.72, 2.5);
  for (const e of [-1, 1]) lie(Z.orange, 0.74, 0.08, e * 0.9);
  box(b, Z.grey, x, 2.0, z, 0.5, 0.12, 0.5);
  box(b, Z.snow, x, 1.99, z, 2.2, 0.1, 0.7);
  box(b, Z.iron, x, 0.5, z, 2.9, 0.1, 1.2);
  for (const e of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 12), Z.black);
    w.position.set(x - 0.2, 0.36, z + e * 0.72);
    w.rotation.x = Math.PI / 2;
    own(c, w);
  }
  box(b, Z.iron, x + 1.9, 0.44, z, 1.1, 0.07, 0.07);
  box(b, Z.iron, x + 2.4, 0.22, z, 0.07, 0.44, 0.07);
  // the tap and the shelf the mugs stood on
  box(b, Z.brass, x - 0.6, 0.95, z + 0.76, 0.06, 0.06, 0.2);
  box(b, Z.woodPale, x - 0.6, 0.78, z + 0.86, 1.2, 0.04, 0.3);
  solid(c, x + 0.3, z, 3.6, 1.7, 2, 'zarya-kvass', { kind: 'prop', surface: 'metal' });
}

/** A set of shop scales: a blue body, a round dial on a post, a brass pan. */
function scales(c: Ctx, x: number, z: number, face: 1 | -1): void {
  const { b } = c;
  box(b, Z.blue, x, 1.07, z, 0.4, 0.12, 0.3);
  box(b, Z.blue, x, 1.3, z, 0.08, 0.36, 0.08);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 14), Z.cream);
  dial.position.set(x, 1.6, z);
  dial.rotation.x = Math.PI / 2;
  own(c, dial);
  slab(b, Z.black, x, 1.64, z + face * 0.04, 0.02, 0.14, 0.01, 0, 0, 0.5);
  cyl(b, Z.brass, x + 0.3, 1.13, z, 0.1, 0.19, 0.06, 12);
}

// ---------------------------------------------------------------------------------------------------------------------
// the ground, the line, the walls
// ---------------------------------------------------------------------------------------------------------------------

function ground(c: Ctx): void {
  const { b } = c;
  const q = R.rect;
  groundRect(b, Z.snow, q.x0, q.z0, q.x1, q.z1, 0.004);
  const path = (x0: number, z0: number, x1: number, z1: number, y = 0.014): void => groundRect(b, Z.packed, x0, z0, x1, z1, y);
  // the line's bed either side of the stop's own sixty metres, the pavement along it, the way round the tram to the depot gate
  path(q.x0, TRACK_Z - 2.2, 164, TRACK_Z + 2.2, 0.012);
  path(224, TRACK_Z - 2.2, 244.5, TRACK_Z + 2.2, 0.012);
  path(q.x0, TRACK_Z + 2.2, 244.5, -45.4, 0.013);
  path(174, LINE_WALL_Z + 0.3, 214, TRACK_Z - 2.2);
  path(193, q.z0, 199, LINE_WALL_Z + 0.3, 0.015);
  // from the pavement to the hall's three north doors, and along its wall
  for (const i of DOOR_BAYS) path((px(i) + px(i + 1)) / 2 - 2.7, -45.4, (px(i) + px(i + 1)) / 2 + 2.7, H.z0);
  path(163, H.z0 - 3.2, 231, H.z0, 0.016);
  // the west lane: from the line gate down past the kiosks, the hall's west door, the booth and the police post
  path(153.5, -45.4, 163, 62);
  path(163, ZC - 4.5, H.x0, ZC + 4.5, 0.016);
  path(q.x0, 29, 189, 35, 0.017);
  // the yard: along the hall's south wall, from its doors to the matryoshka, round her, and on to the garages' gate
  path(163, H.z1, 231, H.z1 + 3.4, 0.016);
  for (const i of DOOR_BAYS) path((px(i) + px(i + 1)) / 2 - 2.7, H.z1 + 3.4, (px(i) + px(i + 1)) / 2 + 2.7, i === 4 ? 30 : 19.4);
  path(188, 30, 206, 46, 0.015);
  path(193.5, 46, 199.5, q.z1);
  path(206, 32, 237, 36);
  path(178.6, 42.4, 188, 48.6, 0.016);
  path(206, 42.4, 216, 48.6, 0.016);
  path(166, 42.4, 178.6, 48.6);
  path(216, 42.4, 231, 48.6);
  // round the back of the cold store to its hatch
  path(231.5, 2.2, 238, 32, 0.016);
}

/** A tram pole with its arm over the wire. */
function pole(c: Ctx, x: number): void {
  const { b } = c;
  cyl(b, Z.iron, x, 0, TRACK_Z - 3.6, 0.14, 0.1, 6.2, 8);
  box(b, Z.iron, x, 5.9, TRACK_Z - 1.8, 0.07, 0.07, 3.6);
  solid(c, x, TRACK_Z - 3.6, 0.3, 0.3, 6.2, 'zarya-pole', { kind: 'none', surface: 'metal' });
}

/** The tram line either side of the stop, the wall along its far side, and the wall that ends the town on the east. */
function line(c: Ctx): void {
  const { b } = c;
  const q = R.rect;
  for (const [x0, x1] of [[q.x0, 164], [224, 244.5]] as const) {
    for (const s of [-1, 1]) box(b, Z.steel, (x0 + x1) / 2, 0.05, TRACK_Z + s * 0.72, x1 - x0, 0.09, 0.08);
    box(b, Z.black, (x0 + x1) / 2, 5.5, TRACK_Z, x1 - x0, 0.03, 0.03);
  }
  pole(c, 157);
  pole(c, 236);
  // the wall north of the line, with a gap where the way to the depot gate comes through
  for (const [x0, x1] of [[q.x0, 188], [204, 244.9]] as const) {
    const xm = (x0 + x1) / 2;
    box(b, Z.concreteDark, xm, 1.3, LINE_WALL_Z, x1 - x0, 2.6, 0.3);
    box(b, Z.snow, xm, 2.66, LINE_WALL_Z, x1 - x0, 0.14, 0.44);
    for (let x = x0 + 3; x < x1 - 1; x += 6) box(b, Z.concreteDark, x, 1.4, LINE_WALL_Z, 0.5, 2.8, 0.46);
    solid(c, xm, LINE_WALL_Z, x1 - x0, 0.4, 2.6, 'zarya-wall', { kind: 'wall' });
  }
  for (const x of [188, 204]) {
    box(b, Z.concrete, x, 1.6, LINE_WALL_Z, 0.8, 3.2, 0.8);
    box(b, Z.cream, x, 3.26, LINE_WALL_Z, 0.96, 0.12, 0.96);
    box(b, Z.snow, x, 3.38, LINE_WALL_Z, 0.9, 0.12, 0.9);
    ball(b, Z.bulb, x, 3.62, LINE_WALL_Z, 0.2);
    b.glow({ x, y: 3.62, z: LINE_WALL_Z, color: 0xffb060, size: 1, intensity: 2, mode: 'steady' });
    solid(c, x, LINE_WALL_Z, 0.8, 0.8, 3.2, 'zarya-wall', { kind: 'wall' });
  }
  // behind that wall: drifts and firs, where nobody goes
  for (const [x, w] of [[160, 20], [178, 9], [214, 12], [232, 18]] as const) drift(c, x, LINE_WALL_Z - 1.1, w, 1.6, 0.7);
  for (const [x, z, h] of [[164, -66.5, 6], [171, -65, 4.6], [183.5, -66.8, 5.4], [209, -66.6, 5], [222.6, -65.2, 6.4]] as const) fir(c, x, z, h);
  bareTree(c, 153, -65.6, 5.2);
  bareTree(c, 236, -66, 5.6);
  crates(c, 186, -63, 2, 3);
  // the east wall: concrete panels under snow, and a steel gate shut across the line where it runs on out of town
  const ex = 244.7;
  for (const [z0, z1] of [[q.z0, TRACK_Z - 2.9], [TRACK_Z + 2.9, q.z1]] as const) {
    const zm = (z0 + z1) / 2;
    box(b, Z.concreteDark, ex, 1.5, zm, 0.4, 3, z1 - z0);
    box(b, Z.snow, ex, 3.07, zm, 0.54, 0.14, z1 - z0);
    for (let z = z0 + 4; z < z1 - 1; z += 8) box(b, Z.concreteDark, ex, 1.6, z, 0.56, 3.2, 0.5);
  }
  for (const s of [-1, 1]) {
    box(b, Z.iron, ex, 1.9, TRACK_Z + s * 2.9, 0.5, 3.8, 0.5);
    box(b, Z.snow, ex, 3.86, TRACK_Z + s * 2.9, 0.6, 0.12, 0.6);
  }
  box(b, Z.steel, ex, 1.75, TRACK_Z, 0.12, 3.3, 5.4);
  for (let i = 0; i < 6; i++) box(b, Z.iron, ex - 0.08, 1.75, TRACK_Z - 2.25 + i * 0.9, 0.06, 3.3, 0.1);
  for (const y of [0.5, 3.0]) box(b, Z.iron, ex - 0.08, y, TRACK_Z, 0.06, 0.12, 5.4);
  box(b, Z.red, ex - 0.16, 3.6, TRACK_Z, 0.14, 0.2, 0.2);
  b.glow({ x: ex - 0.3, y: 3.6, z: TRACK_Z, color: 0xff3020, size: 0.9, intensity: 2, mode: 'steady' });
  solid(c, ex + 0.45, (q.z0 + q.z1) / 2, 1.3, q.z1 - q.z0, 3, 'zarya-wall', { kind: 'wall' });
  for (const [z, w] of [[-30, 14], [8, 10], [30, 16], [58, 18]] as const) drift(c, ex - 0.9, z, 1.4, w, 0.6);
}

// ---------------------------------------------------------------------------------------------------------------------
// the hall
// ---------------------------------------------------------------------------------------------------------------------

/**
 * One bay of the hall's wall between two piers: a doorway under a stone arch, or a low brick wall with a tall
 * frosted window over it (lit from inside, as the street sees it). `out` is the way outside lies.
 */
function bay(c: Ctx, cx: number, cz: number, len: number, alongZ: boolean, out: 1 | -1, door: boolean): void {
  const { b } = c;
  const rot = alongZ ? Math.PI / 2 : 0;
  // a box lying along the wall: `t` thick, pushed `off` outward, `du` along
  const run = (mat: MatRef, y: number, sy: number, t: number, off = 0, l = len, du = 0): void => {
    addBox(b, mat, cx + (alongZ ? out * off : du), y, cz + (alongZ ? du : out * off), l, sy, t, rot, { cast: typeof mat === 'string' || casts(mat) });
  };
  if (door) {
    const a = len / 2;
    const spring = 3;
    const rise = 1.9;
    const s = new THREE.Shape();
    s.moveTo(-a, EAVE + 0.3);
    s.lineTo(-a, spring);
    for (let j = 1; j <= 16; j++) {
      const t = Math.PI - (j * Math.PI) / 16;
      s.lineTo(a * Math.cos(t), spring + rise * Math.sin(t));
    }
    s.lineTo(a, EAVE + 0.3);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false });
    g.translate(0, 0, -0.25);
    const m = new THREE.Mesh(g, Z.cream);
    m.position.set(cx, 0, cz);
    m.rotation.y = rot;
    own(c, m);
    // the keystone, the imposts the arch springs from, a lantern on the street side
    run(Z.concrete, spring + rise + 0.22, 0.56, 0.64, 0, 0.5);
    for (const e of [-1, 1]) run(Z.concrete, spring - 0.12, 0.24, 0.66, 0, 0.36, e * (a - 0.16));
    run(Z.iron, spring + rise - 0.1, 0.06, 0.5, 0.5, 0.06);
    ball(b, Z.bulb, cx + (alongZ ? out * 0.74 : 0), spring + rise - 0.32, cz + (alongZ ? 0 : out * 0.74), 0.17);
    b.glow({ x: cx + (alongZ ? out * 0.8 : 0), y: spring + rise - 0.32, z: cz + (alongZ ? 0 : out * 0.8), color: 0xffb060, size: 1, intensity: 2, mode: 'steady' });
    b.collide({ x: cx, z: cz, hx: alongZ ? 0.25 : a, hz: alongZ ? a : 0.25, y0: spring + 1.1, y1: EAVE, mapKind: 'none', surface: 'concrete', tag: 'zarya-hall' });
    return;
  }
  run('brick', 0.65, 1.3, 0.5);
  run(Z.cream, 1.36, 0.12, 0.66);
  run(Z.snow, 1.46, 0.09, 0.16, 0.25, len - 0.3);
  run('brick', EAVE - 0.35, 1.3, 0.5);
  run(Z.warm, 2.96, 3.08, 0.03, 0.1);
  run(Z.snowBlue, 2.96, 3.08, 0.03, -0.1);
  for (let k = 1; k < 5; k++) run(Z.iron, 2.96, 3.08, 0.3, 0, 0.07, -len / 2 + (k * len) / 5);
  for (const y of [2.3, 3.4]) run(Z.iron, y, 0.07, 0.3);
  // the snow that has blown against it outside
  run(Z.snow, 0.14, 0.28, 0.7, 0.55);
  solid(c, cx, cz, alongZ ? 0.5 : len, alongZ ? len : 0.5, EAVE, 'zarya-hall', { kind: 'wall' });
}

/** A slice of the vault: the ring between two radii (measured from its underside), `half` wide each way, from `xEast` west for `len`. */
function vault(c: Ctx, mat: THREE.Material, r0: number, r1: number, half: number, xEast: number, len: number): void {
  const yc = CROWN - RAD;
  const a = Math.asin(half / RAD);
  const n = 20;
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const t = -a + (2 * a * i) / n;
    if (i === 0) s.moveTo(Math.sin(t) * (RAD + r1), yc + Math.cos(t) * (RAD + r1));
    else s.lineTo(Math.sin(t) * (RAD + r1), yc + Math.cos(t) * (RAD + r1));
  }
  for (let i = n; i >= 0; i--) {
    const t = -a + (2 * a * i) / n;
    s.lineTo(Math.sin(t) * (RAD + r0), yc + Math.cos(t) * (RAD + r0));
  }
  s.closePath();
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }), mat);
  m.position.set(xEast, 0, ZC);
  m.rotation.y = -Math.PI / 2;
  own(c, m);
}

/** The glazed end of the vault over an end wall: lit as the street sees it, frosted from inside. */
function gable(c: Ctx, x: number, out: 1 | -1): void {
  const { b } = c;
  const s = new THREE.Shape();
  s.moveTo(-HALF, EAVE - 0.1);
  s.lineTo(HALF, EAVE - 0.1);
  for (let i = 0; i <= 20; i++) {
    const dz = HALF - (2 * HALF * i) / 20;
    s.lineTo(dz, vaultY(dz) + 0.05);
  }
  s.closePath();
  for (const [mat, side] of [[Z.warm, 1], [Z.snowBlue, -1]] as const) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
    m.position.set(x + out * side * 0.06, 0, ZC);
    m.rotation.y = (out * side * Math.PI) / 2;
    own(c, m);
  }
  for (let dz = -17.5; dz <= 17.5; dz += 2.5) box(b, Z.iron, x, (EAVE + vaultY(dz)) / 2, ZC + dz, 0.26, vaultY(dz) - EAVE, 0.08);
  box(b, Z.iron, x, 7.2, ZC, 0.26, 0.08, 29);
  box(b, Z.cream, x, EAVE, ZC, 0.86, 0.24, H.z1 - H.z0 + 0.4);
}

function hallShell(c: Ctx): void {
  const { b } = c;
  const zn = H.z0 + 0.3;
  const zs = H.z1 - 0.3;
  const xw = H.x0 + 0.3;
  const xe = H.x1 - 0.3;
  const blen = px(1) - px(0) - 0.9;
  const wlen = pz(1) - pz(0) - 0.9;
  for (let i = 0; i < 9; i++) {
    const x = (px(i) + px(i + 1)) / 2;
    bay(c, x, zn, blen, false, -1, DOOR_BAYS.includes(i));
    bay(c, x, zs, blen, false, 1, DOOR_BAYS.includes(i));
  }
  for (let j = 0; j < 5; j++) {
    const z = (pz(j) + pz(j + 1)) / 2;
    bay(c, xw, z, wlen, true, -1, j === 2);
    if (j === 0 || j === 4) bay(c, xe, z, wlen, true, 1, false);
  }
  const pier = (x: number, z: number): void => {
    addBox(b, 'brick', x, 2.85, z, 0.9, 5.7, 0.9);
    box(b, Z.concreteDark, x, 0.3, z, 1.04, 0.6, 1.04);
    solid(c, x, z, 0.9, 0.9, EAVE, 'zarya-hall', { kind: 'wall' });
  };
  for (let i = 0; i <= 9; i++) {
    pier(px(i), zn);
    pier(px(i), zs);
  }
  for (let j = 1; j < 5; j++) {
    pier(xw, pz(j));
    if (j === 1 || j === 4) pier(xe, pz(j));
  }
  // the cornice the vault sits on, snow along it
  for (const [z, out] of [[zn, -1], [zs, 1]] as const) {
    box(b, Z.cream, XC, EAVE - 0.24, z, H.x1 - H.x0 + 0.4, 0.24, 1.0);
    box(b, Z.snow, XC, EAVE - 0.08, z + out * 0.4, H.x1 - H.x0 + 0.6, 0.12, 0.3);
  }
  gable(c, xw, -1);
  gable(c, xe, 1);

  // ---- the vault: dark sheet iron under snow, frosted skylights let into it, arched trusses on every pier ----
  vault(c, S.deck, 0, 0.12, HALF + 0.7, H.x1 + 0.6, H.x1 - H.x0 + 1.2);
  vault(c, Z.snow, 0.12, 0.3, HALF + 0.7, H.x1 + 0.6, H.x1 - H.x0 + 1.2);
  for (let i = 0; i < 9; i++) {
    const x = (px(i) + px(i + 1)) / 2;
    for (const dz of [-14, -9, -4, 4, 9, 14]) {
      const rx = Math.asin(dz / RAD);
      const y = vaultY(dz) + 0.14;
      slab(b, Z.ice, x, y, ZC + dz, 4.9, 0.5, 3.7, rx, 0, 0);
      slab(b, Z.iron, x, y, ZC + dz, 5.0, 0.56, 0.07, rx, 0, 0);
      for (const u of [-1.6, 0, 1.6]) slab(b, Z.iron, x + u, y, ZC + dz, 0.07, 0.56, 3.8, rx, 0, 0);
    }
  }
  for (let i = 0; i <= 9; i++) {
    const x = px(i);
    vault(c, Z.iron, -0.42, 0, HALF - 0.5, x + 0.12, 0.24);
    if (i === 0 || i === 9) continue;
    box(b, Z.iron, x, EAVE + 0.1, ZC, 0.09, 0.09, H.z1 - H.z0 - 1);
    for (const dz of [-13, -6.5, 0, 6.5, 13]) box(b, Z.iron, x, (EAVE + 0.1 + vaultY(dz) - 0.3) / 2, ZC + dz, 0.06, vaultY(dz) - 0.4 - EAVE, 0.06);
    // enamel shades over the aisles
    for (const z of [-19.2, ZC, -0.8]) {
      box(b, Z.iron, x, 4.95, z, 0.03, 1.2, 0.03);
      cyl(b, Z.greenDark, x, 4.14, z, 0.44, 0.07, 0.26, 10);
      ball(b, Z.bulb, x, 4.14, z, 0.13);
    }
  }
  for (const dz of [-16, -8, 0, 8, 16]) box(b, Z.iron, XC, vaultY(dz) - 0.28, ZC + dz, H.x1 - H.x0 - 0.8, 0.1, 0.1);
  for (const [x, z] of [[180.6, -19.2], [213.4, -19.2], [XC, ZC], [180.6, -0.8], [213.4, -0.8]] as const) {
    b.light({ x, y: 4, z, color: 0xffc98a, intensity: 34, distance: 27, mode: 'steady', pool: 8, weight: 1.1 });
  }
  b.collide({ x: XC, z: ZC, hx: (H.x1 - H.x0) / 2 + 0.6, hz: HALF + 0.7, y0: EAVE, y1: EAVE + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: XC, z: ZC, hx: (H.x1 - H.x0) / 2, hz: HALF, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });

  // ---- the floor: worn tiles, the joints of the bays scored across them ----
  groundRect(b, M.floor, H.x0, H.z0, H.x1, H.z1, 0.03);
  for (let i = 1; i < 18; i++) box(b, M.floorLine, H.x0 + (i * (H.x1 - H.x0)) / 18, 0.031, ZC, 0.07, 0.012, H.z1 - H.z0 - 1.2);
  for (let j = 1; j < 10; j++) box(b, M.floorLine, XC, 0.031, H.z0 + (j * (H.z1 - H.z0)) / 10, H.x1 - H.x0 - 1.2, 0.012, 0.07);
}

/** What hangs from a butcher's rail: a joint on a hook. */
function joint(c: Ctx, x: number, z: number, k: number): void {
  const { b } = c;
  const h = 0.5 + (k % 3) * 0.14;
  const r = 0.13 + (k % 2) * 0.035;
  box(b, Z.iron, x, 2.5, z, 0.02, 0.2, 0.02);
  cyl(b, M.fat, x, 2.3, z, 0.04, 0.025, 0.14, 5);
  ball(b, k % 2 ? M.meat : M.meatDark, x, 2.36 - h / 2, z, r, h / 2 / r, 7, 0.8);
  cyl(b, M.fat, x, 2.36 - h - 0.005, z, r * 0.5, r * 0.62, 0.05, 6);
}

/** The pharmacy: a closed booth of white boards with a lit window on each long side and a green cross over it. */
function pharmacy(c: Ctx, q: (typeof RYNOK_STALLS)[number]): void {
  const { b } = c;
  const L = q.x1 - q.x0;
  const D = q.z1 - q.z0;
  const xc = (q.x0 + q.x1) / 2;
  const zc = (q.z0 + q.z1) / 2;
  box(b, Z.white, xc, 0.55, zc, L, 1.1, D);
  box(b, Z.green, xc, 0.14, zc, L + 0.04, 0.28, D + 0.04);
  box(b, Z.white, xc, 2.8, zc, L, 0.6, D);
  for (const e of [-1, 1]) box(b, Z.white, xc + e * (L / 2 - 0.3), 1.8, zc, 0.6, 1.4, D);
  box(b, Z.white, xc, 1.8, zc, 0.9, 1.4, D);
  box(b, Z.green, xc, 3.13, zc, L + 0.2, 0.08, D + 0.2);
  for (const s of [-1, 1]) {
    const zf = zc + s * (D / 2 - 0.02);
    // the window: lit glass behind a grid of thin bars, a hatch to pass things through
    for (const e of [-1, 1]) {
      const wx = xc + e * (L / 4 - 0.02);
      const ww = L / 2 - 0.85;
      box(b, Z.warm, wx, 1.8, zf - s * 0.1, ww, 1.4, 0.03);
      for (let k = 1; k < 4; k++) box(b, Z.white, wx - ww / 2 + (k * ww) / 4, 1.8, zf, 0.05, 1.4, 0.05);
      box(b, Z.white, wx, 2.0, zf, ww, 0.05, 0.05);
      // bottles and boxes along the sill inside
      goods(b, wx, 1.12, zf - s * 0.05, ww - 0.2, false, 91 + e + s * 3, { mats: [Z.white, Z.blue, Z.brass, Z.greenDark], h: 0.22, d: 0.08, step: 0.2 });
    }
    box(b, Z.woodPale, xc, 1.12, zf + s * 0.14, L - 0.6, 0.05, 0.3);
    // the green cross
    box(b, Z.green, xc, 2.8, zf + s * 0.03, 0.56, 0.18, 0.04);
    box(b, Z.green, xc, 2.8, zf + s * 0.03, 0.18, 0.56, 0.04);
  }
  solid(c, xc, zc, L, D, 3.1, 'zarya-stall', { kind: 'prop', surface: 'wood' });
}

const FASCIA: Record<string, THREE.Material> = {
  iron: Z.concreteDark, veg: Z.green, milk: Z.blue, fish: Z.blue, honey: Z.gold, sweets: Z.red, meat: Z.redDark, butcher: Z.redDark,
  bread: Z.woodPale, hats: Z.woodDark, pickles: Z.greenDark, tea: Z.red, plumber: Z.grey, felt: Z.wood,
};

/** One block of stalls: tiled counters all round, an iron frame over them with a painted board and a rail to hang things from. */
function island(c: Ctx, q: (typeof RYNOK_STALLS)[number], i: number): void {
  if (q.kind === 'pharmacy') {
    pharmacy(c, q);
    return;
  }
  const { b } = c;
  const L = q.x1 - q.x0;
  const D = q.z1 - q.z0;
  const xc = (q.x0 + q.x1) / 2;
  const zc = (q.z0 + q.z1) / 2;
  /** A long counter's middle line: s = -1 the north one, +1 the south one. */
  const zs = (s: number): number => zc + s * (D / 2 - 0.42);
  for (const s of [-1, 1]) {
    box(b, M.tile, xc, 0.5, zs(s), L, 0.9, 0.84);
    box(b, Z.blue, xc, 0.14, zs(s), L + 0.03, 0.28, 0.87);
    box(b, Z.grey, xc, 0.98, zs(s), L + 0.08, 0.06, 0.92);
    box(b, Z.iron, xc, 2.6, zs(s), L - 0.2, 0.05, 0.05);
    box(b, FASCIA[q.kind]!, xc, 2.94, zc + s * (D / 2 - 0.1), L, 0.36, 0.06);
    box(b, Z.cream, xc, 2.94, zc + s * (D / 2 - 0.06), L * 0.46, 0.2, 0.03);
  }
  for (const e of [-1, 1]) {
    const ex = xc + e * (L / 2 - 0.42);
    box(b, M.tile, ex, 0.5, zc, 0.84, 0.9, D - 1.68);
    box(b, Z.blue, ex, 0.14, zc, 0.87, 0.28, D - 1.68);
    box(b, Z.grey, ex + e * 0.02, 0.98, zc, 0.88, 0.06, D - 1.84);
    box(b, FASCIA[q.kind]!, xc + e * (L / 2 - 0.1), 2.94, zc, 0.06, 0.36, D - 0.2);
    box(b, Z.iron, xc + e * (L / 2 - 0.1), 2.6, zc, 0.05, 0.05, D - 0.2);
    for (const s of [-1, 1]) box(b, Z.iron, xc + e * (L / 2 - 0.1), 1.9, zc + s * (D / 2 - 0.1), 0.09, 1.8, 0.09);
  }
  // a bulb or two under the ridge
  box(b, Z.iron, xc, 2.76, zc, L - 0.2, 0.04, 0.04);
  for (const u of L > 9.5 ? [-L / 4, L / 4] : [0]) {
    box(b, Z.iron, xc + u, 2.64, zc, 0.02, 0.2, 0.02);
    ball(b, Z.bulb, xc + u, 2.48, zc, 0.1);
  }
  solid(c, xc, zc, L, D, 1.05, 'zarya-stall', { shots: false, kind: 'prop', surface: 'wood' });

  // ---- what it sells ----
  const seed = 300 + i * 17;
  /** Goods laid along a counter's top. */
  const lay = (s: number, mats: readonly THREE.Material[], h: number, o: { step?: number; d?: number; from?: number; to?: number; y?: number; off?: number } = {}): void => {
    const x0 = q.x0 + (o.from ?? 1);
    const x1 = q.x1 - (o.to ?? 1);
    goods(b, (x0 + x1) / 2, o.y ?? 1.01, zs(s) + s * (o.off ?? 0), x1 - x0, false, seed + s * 5 + Math.round((o.from ?? 0) * 3) + Math.round((o.off ?? 0) * 40), { mats, h, d: o.d ?? 0.3, step: o.step });
  };
  /** Things hung from a counter's rail, every `step` along it. */
  const hang = (s: number, step: number, fn: (x: number, z: number, k: number) => void): void => {
    let k = 0;
    for (let x = q.x0 + 0.7; x < q.x1 - 0.6; x += step) fn(x, zs(s), k++);
  };
  /** A shallow tray of round things on a counter. */
  const tray = (s: number, x: number, mat: THREE.Material, r: number, n = 9): void => {
    box(b, Z.woodPale, x, 1.06, zs(s), 0.8, 0.1, 0.56);
    for (let k = 0; k < n; k++) ball(b, mat, x - 0.28 + (k % 3) * 0.28, 1.12 + r * 0.6 + (k > 5 ? r : 0), zs(s) - 0.16 + (Math.floor(k / 3) % 2) * 0.3, r, 1, 6);
  };
  switch (q.kind) {
    case 'meat':
    case 'butcher': {
      for (const s of [-1, 1]) {
        hang(s, 0.62, (x, z, k) => (k % 5 === 4 ? undefined : joint(c, x, z, k + (s > 0 ? 2 : 0))));
        // cuts on enamel trays, a string of sausages
        for (let x = q.x0 + 1.3; x < q.x1 - 1.2; x += 1.5) {
          box(b, Z.white, x, 1.03, zs(s), 0.9, 0.04, 0.6);
          for (let k = 0; k < 4; k++) ball(b, k % 2 ? M.meat : M.meatDark, x - 0.26 + (k % 2) * 0.5, 1.1, zs(s) - 0.12 + Math.floor(k / 2) * 0.26, 0.2, 0.45, 7);
        }
        scales(c, q.x0 + 0.62, zs(s), s as 1 | -1);
      }
      if (q.kind === 'butcher') {
        // his block and cleaver inside, and the ledger lying open on the counter toward the middle aisle
        cyl(b, Z.woodPale, xc + 2.6, 0, zc, 0.34, 0.34, 0.86, 10);
        slab(b, Z.steel, xc + 2.6, 1.0, zc, 0.3, 0.24, 0.03, 0, 0.5, 0.3);
        const lx = R.ledger.x;
        const lz = R.ledger.z;
        slab(b, Z.woodDark, lx, 1.08, lz, 0.6, 0.05, 0.44, 0.22, 0, 0);
        box(b, Z.woodDark, lx, 1.04, lz - 0.16, 0.5, 0.07, 0.06);
        for (const e of [-1, 1]) slab(b, Z.cream, lx + e * 0.14, 1.115, lz, 0.26, 0.03, 0.38, 0.22, 0, e * 0.05);
        slab(b, Z.red, lx, 1.125, lz, 0.03, 0.02, 0.4, 0.22, 0, 0);
      }
      break;
    }
    case 'pickles': {
      for (const s of [-1, 1]) {
        lay(s, [Z.green, Z.greenDark, Z.gold, Z.orange, Z.redDark], 0.3, { step: 0.26, d: 0.2, from: 2.2 });
        lay(s, [Z.green, Z.greenDark, Z.gold], 0.24, { step: 0.26, d: 0.2, from: 2.2, off: -0.26 });
        // an open tub of cabbage on the counter's end
        cyl(b, Z.wood, q.x0 + 1.2, 1.01, zs(s), 0.3, 0.34, 0.4, 10);
        cyl(b, Z.cream, q.x0 + 1.2, 1.4, zs(s), 0.3, 0.3, 0.03, 10);
        hang(s, 1.1, (x, z, k) => {
          // strings of dried mushrooms and garlic
          for (let j = 0; j < 5; j++) ball(b, k % 2 ? Z.cream : Z.woodPale, x, 2.5 - j * 0.13, z, 0.06, 1, 5);
        });
      }
      break;
    }
    case 'fish': {
      for (const s of [-1, 1]) {
        hang(s, 0.2, (x, z, k) => {
          const h = 0.3 + (k % 3) * 0.06;
          slab(b, k % 4 === 0 ? Z.woodPale : Z.grey, x, 2.56 - h / 2, z, 0.035, h, 0.1, 0, 0, ((k * 7) % 5) * 0.03 - 0.06);
        });
        for (let x = q.x0 + 1.4; x < q.x1 - 1.2; x += 1.6) {
          box(b, Z.woodPale, x, 1.09, zs(s), 1.0, 0.16, 0.6);
          for (let k = 0; k < 6; k++) slab(b, k % 2 ? Z.grey : Z.steel, x - 0.36 + k * 0.145, 1.2, zs(s), 0.1, 0.05, 0.5, 0, ((k * 5) % 3) * 0.1 - 0.1, 0);
        }
      }
      break;
    }
    case 'hats': {
      for (const s of [-1, 1]) {
        let k = 0;
        for (let x = q.x0 + 1.2; x < q.x1 - 1; x += 0.72) {
          const fur = M.fur[(k * 3 + (s > 0 ? 1 : 0)) % M.fur.length]!;
          const tall = k % 2 ? 0.34 : 0.2;
          cyl(b, Z.woodPale, x, 1.01, zs(s), 0.09, 0.03, tall, 6);
          ball(b, Z.cream, x, 1.1 + tall, zs(s), 0.115, 1.15, 7);
          ball(b, fur, x, 1.2 + tall, zs(s), 0.16, 0.8, 8);
          for (const e of [-1, 1]) box(b, fur, x + e * 0.14, 1.12 + tall, zs(s), 0.06, 0.18, 0.2);
          k++;
        }
        hang(s, 0.62, (x, z, n) => {
          const fur = M.fur[(n * 3 + 1) % M.fur.length]!;
          slab(b, fur, x, 2.3, z, 0.28, 0.56, 0.05, 0, 0, ((n * 5) % 3) * 0.08 - 0.08);
          slab(b, fur, x, 1.96, z, 0.1, 0.2, 0.05, 0, 0, ((n * 7) % 3) * 0.2 - 0.2);
        });
      }
      break;
    }
    case 'tea': {
      for (const s of [-1, 1]) {
        lay(s, [Z.red, Z.gold, Z.greenDark, Z.cream], 0.2, { step: 0.24, d: 0.16, from: 4.6, off: -0.2 });
        // glasses in their holders, a sugar loaf, strings of baranki from the rail
        for (let k = 0; k < 6; k++) cyl(b, Z.brass, q.x1 - 2.6 + k * 0.22, 1.01, zs(s) + s * 0.2, 0.04, 0.04, 0.11, 6);
        cyl(b, Z.white, q.x1 - 3.4, 1.01, zs(s), 0.12, 0.03, 0.3, 8);
        hang(s, 1.3, (x, z) => {
          for (let j = 0; j < 6; j++) cyl(b, Z.woodPale, x, 2.52 - j * 0.11, z, 0.085, 0.085, 0.04, 8);
        });
      }
      // the samovar on the south counter, its teapot on top, its tray
      const sx = q.x0 + 3.4;
      const sz = zs(1);
      cyl(b, Z.brass, sx, 1.01, sz, 0.3, 0.3, 0.03, 12);
      cyl(b, Z.brass, sx, 1.04, sz, 0.14, 0.2, 0.12, 10);
      cyl(b, Z.brass, sx, 1.16, sz, 0.23, 0.2, 0.52, 12);
      cyl(b, Z.brass, sx, 1.68, sz, 0.12, 0.07, 0.14, 10);
      cyl(b, Z.brass, sx, 1.82, sz, 0.11, 0.11, 0.03, 10);
      ball(b, Z.white, sx, 1.96, sz, 0.12, 0.85, 8);
      for (const e of [-1, 1]) box(b, Z.woodDark, sx + e * 0.28, 1.5, sz, 0.06, 0.16, 0.05);
      box(b, Z.brass, sx, 1.3, sz + 0.27, 0.04, 0.04, 0.12);
      garland(b, q.x0 + 0.3, q.x1 - 0.3, 2.66, zc + D / 2 - 0.02, 26);
      break;
    }
    case 'plumber': {
      for (const s of [-1, 1]) {
        lay(s, [Z.steel, Z.grey, Z.brass, Z.iron], 0.16, { step: 0.3, d: 0.3, from: 5 });
        // pipes stood in a rack at the west end, a cast-iron radiator on the counter
        for (let k = 0; k < 9; k++) slab(b, k % 3 ? Z.steel : Z.grey, q.x0 + 0.75 + k * 0.17, 1.86, zs(s), 0.06, 1.7 + (k % 4) * 0.12, 0.06, 0, 0, 0.05);
        box(b, Z.woodDark, q.x0 + 1.4, 1.7, zs(s), 1.7, 0.06, 0.14);
        for (let k = 0; k < 7; k++) box(b, Z.white, q.x0 + 2.4 + k * 0.1, 1.31, zs(s), 0.07, 0.6, 0.16);
        hang(s, 1.05, (x, z, k) => {
          // taps and elbows on hooks
          if (x < q.x0 + 2.4) return;
          box(b, k % 2 ? Z.brass : Z.steel, x, 2.42, z, 0.07, 0.3, 0.07);
          box(b, k % 2 ? Z.brass : Z.steel, x + 0.09, 2.3, z, 0.24, 0.07, 0.07);
        });
      }
      // a basin and a coil of hose on the end counter
      box(b, Z.white, q.x1 - 0.42, 1.12, zc, 0.6, 0.22, 0.5);
      cyl(b, Z.black, q.x1 - 0.42, 1.24, zc + 0.5, 0.2, 0.2, 0.12, 10);
      // the pipe handles (`RYNOK.pipes`, a part of the bolt cutters): a tray of steel pipes on the south counter, a
      // black grip on one end of each and a tee on the other, so the glint over it has something to be
      {
        const P = R.pipes;
        box(b, Z.woodPale, P.x, 1.04, P.z - 0.02, 1.0, 0.06, 0.5);
        for (let k = 0; k < 4; k++) {
          const z = P.z - 0.18 + k * 0.12;
          const e = k % 2 ? 1 : -1;
          box(b, Z.steel, P.x, 1.105, z, 0.86, 0.06, 0.06);
          box(b, Z.black, P.x - e * 0.32, 1.105, z, 0.22, 0.075, 0.075);
          box(b, Z.iron, P.x + e * 0.44, 1.105, z, 0.06, 0.08, 0.11);
        }
      }
      break;
    }
    case 'iron': {
      // a board of tools down the middle, the welder's mask and hoses, buckets and boxes of nails
      box(b, Z.woodPale, xc, 1.9, zc, L - 2.4, 1.3, 0.06);
      for (const s of [-1, 1]) {
        for (let k = 0; k < 14; k++) {
          const x = q.x0 + 1.6 + k * ((L - 3.2) / 13);
          slab(b, k % 3 ? Z.iron : Z.steel, x, 1.9 + ((k * 5) % 4) * 0.13, zc + s * 0.05, 0.06, 0.5 + (k % 3) * 0.14, 0.03, 0, 0, ((k * 7) % 5) * 0.16 - 0.3);
          if (k % 3 === 0) box(b, Z.wood, x + 0.02, 1.62 + ((k * 5) % 4) * 0.13, zc + s * 0.05, 0.1, 0.2, 0.05);
        }
        lay(s, [Z.iron, Z.grey, Z.steel, Z.woodPale], 0.14, { step: 0.36, d: 0.3, from: 3.6 });
        for (let k = 0; k < 3; k++) cyl(b, Z.grey, q.x0 + 1.3 + k * 0.5, 1.01, zs(s), 0.15, 0.2, 0.3, 10);
        hang(s, 1.4, (x, z, k) => {
          // coils of hose and chain
          const m = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 5, 10), k % 2 ? Z.black : Z.redDark);
          m.position.set(x, 2.34, z);
          own(c, m);
        });
      }
      box(b, Z.black, q.x0 + 0.42, 1.2, zc, 0.3, 0.36, 0.26, 0.3);
      box(b, Z.greenDark, q.x0 + 0.42, 1.2, zc + 0.14, 0.14, 0.07, 0.02, 0.3);
      // the welding gear on the floor against the north counter (`RYNOK.canister`, a part of the nail gun): an open
      // crate of small gas canisters where the glint is, and beside it the welder's trolley, a tall oxygen cylinder
      // and a squat gas one, the hoses coiled over them and the mask on top
      {
        const C = R.canister;
        box(b, Z.woodPale, C.x, 0.16, C.z, 0.62, 0.32, 0.42);
        for (let k = 0; k < 6; k++) cyl(b, k % 3 === 1 ? Z.red : Z.orange, C.x - 0.2 + (k % 3) * 0.2, 0.3, C.z - 0.09 + Math.floor(k / 3) * 0.18, 0.065, 0.065, 0.22, 8);
        solid(c, C.x, C.z, 0.62, 0.42, 0.5, 'zarya-crate', { shots: false, kind: 'none', surface: 'wood' });
        const tx = C.x + 1.05;
        box(b, Z.iron, tx, 0.06, C.z, 0.7, 0.08, 0.36);
        cyl(b, Z.blue, tx - 0.17, 0.1, C.z, 0.12, 0.12, 1.25, 10);
        cyl(b, Z.iron, tx - 0.17, 1.35, C.z, 0.05, 0.05, 0.12, 6);
        cyl(b, Z.red, tx + 0.17, 0.1, C.z, 0.14, 0.14, 0.8, 10);
        cyl(b, Z.iron, tx + 0.17, 0.9, C.z, 0.05, 0.05, 0.1, 6);
        box(b, Z.iron, tx, 0.6, C.z + 0.2, 0.62, 0.04, 0.04);
        const hose = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 5, 12), Z.black);
        hose.position.set(tx + 0.05, 0.62, C.z - 0.21);
        own(c, hose);
        box(b, Z.black, tx - 0.17, 1.5, C.z, 0.24, 0.3, 0.12, 0.2);
        box(b, Z.greenDark, tx - 0.17, 1.52, C.z - 0.07, 0.13, 0.06, 0.02, 0.2);
        solid(c, tx, C.z, 0.72, 0.4, 1.5, 'zarya-welder', { shots: false, kind: 'none', surface: 'metal' });
      }
      break;
    }
    case 'veg': {
      for (const s of [-1, 1]) {
        const what = [Z.woodDark, Z.green, Z.redDark, Z.orange, Z.woodDark, Z.cream];
        let k = s > 0 ? 2 : 0;
        for (let x = q.x0 + 1.4; x < q.x1 - 1.1; x += 1.05) {
          const m = what[k++ % what.length]!;
          tray(s, x, m, m === Z.green ? 0.13 : 0.085);
        }
        hang(s, 1.5, (x, z, n) => {
          // plaits of onions
          for (let j = 0; j < 6; j++) ball(b, n % 2 ? Z.gold : Z.cream, x + (j % 2) * 0.07, 2.52 - j * 0.1, z, 0.06, 1, 5);
        });
      }
      break;
    }
    case 'milk': {
      for (const s of [-1, 1]) {
        lay(s, [Z.white, Z.cream, Z.white, Z.blue], 0.28, { step: 0.2, d: 0.12, from: 3, off: 0.18 });
        lay(s, [Z.white, Z.cream], 0.2, { step: 0.2, d: 0.12, from: 3, off: -0.1 });
        // churns, a wheel of cheese
        for (let k = 0; k < 2; k++) {
          cyl(b, Z.grey, q.x0 + 1.3 + k * 0.6, 1.01, zs(s), 0.19, 0.19, 0.44, 10);
          cyl(b, Z.grey, q.x0 + 1.3 + k * 0.6, 1.45, zs(s), 0.19, 0.1, 0.12, 10);
        }
        cyl(b, Z.gold, q.x1 - 0.5, 1.01, zs(s), 0.24, 0.24, 0.12, 12);
      }
      break;
    }
    case 'honey': {
      for (const s of [-1, 1]) {
        lay(s, [Z.gold, Z.orange, Z.gold, Z.woodPale], 0.26, { step: 0.26, d: 0.2, from: 1.2 });
        lay(s, [Z.gold, Z.orange, Z.redDark], 0.18, { step: 0.22, d: 0.16, from: 1.2, off: -0.26 });
        hang(s, 1.2, (x, z) => {
          // bundles of wax candles
          for (let j = 0; j < 4; j++) box(b, Z.cream, x - 0.06 + j * 0.04, 2.38, z, 0.025, 0.36, 0.025);
        });
      }
      cyl(b, Z.woodPale, q.x1 - 0.42, 1.01, zc, 0.24, 0.26, 0.4, 10);
      break;
    }
    case 'sweets': {
      for (const s of [-1, 1]) {
        let k = 0;
        for (let x = q.x0 + 1.4; x < q.x1 - 1.1; x += 1.05) {
          if (k++ % 2) tray(s, x, Z.orange, 0.085, 9);
          else goods(b, x, 1.01, zs(s), 0.9, false, seed + k, { h: 0.2, d: 0.4, step: 0.2 });
        }
      }
      garland(b, q.x0 + 0.3, q.x1 - 0.3, 2.66, zc - D / 2 + 0.02, 22);
      garland(b, q.x0 + 0.3, q.x1 - 0.3, 2.66, zc + D / 2 - 0.02, 22);
      bulbString(b, q.x0 + 0.2, 2.72, zc, q.x1 - 0.2, 2.72, zc, 20, 0.1);
      break;
    }
    case 'bread': {
      for (const s of [-1, 1]) {
        lay(s, [Z.woodPale, Z.wood, M.sack], 0.13, { step: 0.38, d: 0.22, from: 1.2, off: 0.16 });
        lay(s, [Z.woodPale, Z.wood], 0.13, { step: 0.38, d: 0.22, from: 1.2, off: -0.14 });
        lay(s, [Z.woodPale, M.sack], 0.12, { step: 0.38, d: 0.22, from: 1.6, to: 1.6, off: 0.02, y: 1.14 });
        hang(s, 1.1, (x, z) => {
          for (let j = 0; j < 5; j++) cyl(b, Z.woodPale, x, 2.52 - j * 0.12, z, 0.09, 0.09, 0.04, 8);
        });
      }
      break;
    }
    case 'felt': {
      for (const s of [-1, 1]) {
        // valenki in pairs, bolts of cloth
        let k = 0;
        for (let x = q.x0 + 1.2; x < q.x1 - 3.4; x += 0.42) {
          const m = k++ % 3 ? Z.grey : Z.black;
          cyl(b, m, x, 1.01, zs(s), 0.075, 0.085, 0.34, 7);
          box(b, m, x, 1.06, zs(s) + s * 0.1, 0.15, 0.1, 0.22);
        }
        for (let n = 0; n < 5; n++) slab(b, GOODS[(n * 3 + i) % GOODS.length]!, q.x1 - 2.2 + (n % 3) * 0.1, 1.1 + n * 0.14, zs(s), 1.6, 0.14, 0.34, 0, (n % 2) * 0.12 - 0.06, 0);
        hang(s, 0.8, (x, z, n) => box(b, GOODS[(n * 5 + 2) % GOODS.length]!, x, 2.3, z, 0.5, 0.56, 0.06));
      }
      break;
    }
  }
}

/** What stands along the hall's walls between its doors: barrels, sacks, crates, a weigh-scale, tables to drink tea at. */
function hallSides(c: Ctx): void {
  const { b } = c;
  const zn = H.z0 + 1.15;
  const zs = H.z1 - 1.15;
  const bx = (i: number): number => (px(i) + px(i + 1)) / 2;
  // north wall
  crates(c, bx(0) - 1, zn, 3, 1, false);
  crates(c, bx(0) + 0.4, zn + 0.05, 2, 2, false);
  for (let k = 0; k < 4; k++) barrel(c, bx(1) - 1.5 + k * 0.95, zn - 0.05, k % 2 ? Z.woodDark : Z.green);
  sacks(c, bx(0) + 2, zn, 5);
  crates(c, bx(5) + 1.2, zn, 2, 4, false);
  // the market's own weigh-scale: a platform, a post, a beam
  box(b, Z.iron, bx(5) - 1, 0.1, zn + 0.1, 1.2, 0.14, 1.0);
  box(b, Z.iron, bx(5) - 1.5, 0.8, zn - 0.3, 0.1, 1.5, 0.1);
  box(b, Z.brass, bx(5) - 1.2, 1.5, zn - 0.3, 0.9, 0.05, 0.05);
  solid(c, bx(5) - 1, zn, 1.3, 1.1, 1.5, 'zarya-scale', { shots: false, kind: 'none', surface: 'metal' });
  for (let k = 0; k < 3; k++) {
    cyl(b, Z.grey, bx(7) - 1 + k * 0.7, 0, zn, 0.24, 0.24, 0.6, 10);
    cyl(b, Z.grey, bx(7) - 1 + k * 0.7, 0.6, zn, 0.24, 0.13, 0.16, 10);
  }
  solid(c, bx(7) - 0.3, zn, 2.2, 0.6, 0.76, 'zarya-churns', { shots: false, kind: 'none', surface: 'metal' });
  cart(c, bx(8) - 0.2, zn + 0.3, 0.06, 'sacks');
  // south wall
  sacks(c, bx(0) - 0.6, zs, 5);
  for (const x of [bx(1) - 1.3, bx(1) + 1.3]) {
    // a tall round table to stand at with a glass of tea
    cyl(b, Z.iron, x, 0, zs, 0.05, 0.05, 1.08, 6);
    cyl(b, Z.iron, x, 0, zs, 0.3, 0.26, 0.05, 10);
    cyl(b, Z.white, x, 1.08, zs, 0.46, 0.46, 0.04, 14);
    cyl(b, Z.brass, x + 0.14, 1.12, zs - 0.1, 0.035, 0.035, 0.1, 6);
    solid(c, x, zs, 0.5, 0.5, 1.1, 'zarya-table', { shots: false, kind: 'none', surface: 'wood' });
  }
  for (let k = 0; k < 2; k++) barrel(c, bx(0) + 1.1 + k * 0.95, zs + 0.05, Z.cream);
  // lengths of pipe and a pair of radiators against the wall by the plumber's
  for (let k = 0; k < 6; k++) slab(b, k % 2 ? Z.steel : Z.grey, bx(5) - 1.2 + k * 0.16, 1.5, zs + 0.5, 0.07, 3.0, 0.07, -0.16, 0, 0);
  for (let k = 0; k < 9; k++) box(b, Z.white, bx(5) + 0.6 + k * 0.11, 0.42, zs + 0.3, 0.08, 0.7, 0.18);
  solid(c, bx(5), zs + 0.35, 3.2, 0.5, 1.2, 'zarya-pipes', { shots: false, kind: 'none', surface: 'metal' });
  for (let k = 0; k < 4; k++) barrel(c, bx(7) - 1.5 + k * 0.95, zs + 0.05, k % 2 ? Z.greenDark : Z.woodDark);
  crates(c, bx(8), zs, 3, 6, false);
  // the corners: crates and sacks (the end aisles are left clear)
  crates(c, H.x0 + 1.25, pz(0) + 1.6, 2, 7, false);
  crates(c, H.x1 - 1.25, pz(0) + 2.4, 3, 8, false);
  crates(c, H.x1 - 1.3, pz(5) - 2.6, 2, 9, false);
  sacks(c, H.x1 - 1.2, pz(5) - 4.6, 4);
}

// ---------------------------------------------------------------------------------------------------------------------
// the cold store
// ---------------------------------------------------------------------------------------------------------------------

/** A side of beef on a hook. */
function carcass(c: Ctx, x: number, z: number, k: number): void {
  const { b } = c;
  const rot = ((k * 37) % 5) * 0.09 - 0.18;
  const h = 1.6 + (k % 3) * 0.14;
  box(b, Z.iron, x, 3.14, z, 0.03, 0.26, 0.03);
  // two hocks up to the hook, the barrel of the ribs, the pale cage showing through
  for (const e of [-1, 1]) cyl(b, M.meatDark, x + e * 0.09, 2.6, z, 0.1, 0.04, 0.42, 6);
  ball(b, k % 3 ? M.meat : M.meatDark, x, 2.72 - h / 2, z, 0.3, h / 0.6, 9, 0.62, 1, rot * 0.3);
  for (let j = 0; j < 5; j++) {
    // a rib: a pale band let into the barrel, a little narrower than it is there and a hair proud of it
    const y = 2.72 - h * 0.3 - j * 0.15;
    const t = Math.sqrt(1 - ((y - (2.72 - h / 2)) / (h / 2)) ** 2);
    box(b, M.fat, x, y, z, 0.6 * t * 0.78, 0.045, 0.372 * t + 0.012, rot * 0.3);
  }
}

function coldStore(c: Ctx): BoxCollider {
  const { b } = c;
  const xw = K.x0;
  const dz = R.coldDoor.z;
  const top = 4.6;
  const xi = K.x0 + 0.3;
  const xe = K.x1 - 0.6;
  const zn = K.z0 + 0.6;
  const zs = K.z1 - 0.6;
  // ---- the wall it shares with the hall: insulated panels to the eaves, one doorway ----
  const seg = (z0: number, z1: number, y0 = 0, y1 = EAVE + 0.1): void => {
    box(b, S.panel, xw, (y0 + y1) / 2, (z0 + z1) / 2, 0.6, y1 - y0, z1 - z0);
    b.collide({ x: xw, z: (z0 + z1) / 2, hx: 0.3, hz: (z1 - z0) / 2, y0, y1, mapKind: 'wall', surface: 'metal', tag: 'zarya-cold' });
  };
  seg(pz(1) + 0.45, dz - 1.2);
  seg(dz + 1.2, pz(4) - 0.45);
  seg(dz - 1.2, dz + 1.2, 2.6);
  for (let z = pz(1) + 1.4; z < pz(4) - 0.6; z += 1.3) {
    if (Math.abs(z - dz) < 1.4) continue;
    box(b, Z.grey, xw - 0.31, EAVE / 2, z, 0.03, EAVE, 0.09);
  }
  box(b, Z.concreteDark, xw - 0.32, 0.2, (pz(1) + pz(4)) / 2, 0.05, 0.4, pz(4) - pz(1) - 0.9);
  // the doorway's steel frame, the brackets the bar drops into, a red lamp over it
  for (const s of [-1, 1]) {
    box(b, Z.steel, xw, 1.3, dz + s * 1.25, 0.72, 2.6, 0.1);
    box(b, Z.iron, xw - 0.38, 1.25, dz + s * 1.5, 0.16, 0.22, 0.16);
  }
  box(b, Z.steel, xw, 2.65, dz, 0.72, 0.1, 2.6);
  box(b, Z.iron, xw - 0.36, 3.05, dz, 0.12, 0.16, 0.3);
  box(b, Z.redLamp, xw - 0.46, 3.05, dz, 0.14, 0.16, 0.2);
  b.glow({ x: xw - 0.5, y: 3.05, z: dz, color: 0xff3020, size: 0.9, intensity: 2, mode: 'steady' });
  // what the butcher keeps on this wall: a steel sink and its tap, aprons on a row of hooks, an enamel plate over the door
  box(b, Z.steel, xw - 0.62, 0.86, pz(1) + 3, 0.6, 0.16, 1.3);
  for (const e of [-1, 1]) box(b, Z.steel, xw - 0.62, 0.4, pz(1) + 3 + e * 0.56, 0.5, 0.8, 0.06);
  box(b, Z.brass, xw - 0.4, 1.16, pz(1) + 3, 0.16, 0.05, 0.05);
  box(b, Z.white, xw - 0.33, 1.5, pz(1) + 3, 0.04, 0.9, 1.5);
  solid(c, xw - 0.62, pz(1) + 3, 0.6, 1.3, 0.95, 'zarya-sink', { shots: false, kind: 'none', surface: 'metal' });
  box(b, Z.woodDark, xw - 0.33, 1.9, -2.6, 0.05, 0.1, 3.6);
  for (let k = 0; k < 6; k++) {
    box(b, k % 3 === 1 ? M.fat : Z.white, xw - 0.4, 1.36, -4.1 + k * 0.6, 0.1, 1.0, 0.4);
    if (k % 2 === 0) box(b, M.meatDark, xw - 0.46, 1.2, -4.1 + k * 0.6, 0.02, 0.4, 0.26);
  }
  box(b, Z.blue, xw - 0.32, 3.7, dz, 0.04, 0.5, 2.2);
  box(b, Z.white, xw - 0.34, 3.7, dz, 0.02, 0.26, 1.7);
  // (the door's leaf and its bar are the story's own: `zarya/look.ts` swings the one and moves the other)
  // the board of key hooks north of it, past where the open leaf stands: the middle hook is the one his keys hang on
  box(b, Z.woodDark, xw - 0.33, 1.6, R.keyHook.z, 0.05, 0.5, 1.5);
  for (let k = 0; k < 5; k++) {
    const z = R.keyHook.z - 0.48 + k * 0.24;
    box(b, Z.brass, xw - 0.38, 1.7, z, 0.06, 0.03, 0.03);
    if (k !== 2 && k !== 4) box(b, Z.brass, xw - 0.4, 1.58, z, 0.02, 0.18, 0.06);
  }

  // ---- the room: white panel walls, a flat roof under snow ----
  const ow = (x: number, z: number, w: number, d: number): void => {
    box(b, S.panel, x, top / 2, z, w, top, d);
    box(b, Z.concreteDark, x, 0.25, z, w + 0.06, 0.5, d + 0.06);
    solid(c, x, z, w, d, top, 'zarya-cold', { kind: 'wall', surface: 'metal' });
  };
  ow((xi + K.x1) / 2, K.z0 + 0.3, K.x1 - xi, 0.6);
  ow((xi + K.x1) / 2, K.z1 - 0.3, K.x1 - xi, 0.6);
  ow(K.x1 - 0.3, (zn + zs) / 2, 0.6, zs - zn);
  for (let x = xi + 1.5; x < K.x1; x += 1.6) for (const z of [K.z0 - 0.02, K.z1 + 0.02]) box(b, Z.grey, x, top / 2 + 0.25, z, 0.09, top - 0.5, 0.03);
  for (let z = zn + 1; z < zs; z += 1.6) box(b, Z.grey, K.x1 + 0.02, top / 2 + 0.25, z, 0.03, top - 0.5, 0.09);
  box(b, S.deck, (xi + K.x1) / 2 + 0.1, top + 0.15, (K.z0 + K.z1) / 2, K.x1 - xi + 0.5, 0.3, K.z1 - K.z0 + 0.6);
  box(b, Z.snow, (xi + K.x1) / 2 + 0.1, top + 0.4, (K.z0 + K.z1) / 2, K.x1 - xi + 0.3, 0.22, K.z1 - K.z0 + 0.4);
  box(b, Z.white, (xi + xe) / 2, top - 0.02, (zn + zs) / 2, xe - xi, 0.04, zs - zn);
  // the compressor on the roof, a vent pipe
  box(b, Z.grey, 238, top + 0.95, -16, 2.2, 0.9, 1.5);
  box(b, Z.snow, 238, top + 1.46, -16, 2.1, 0.14, 1.4);
  cyl(b, Z.grey, 232, top + 0.3, -4, 0.2, 0.2, 1.2, 8);
  b.collide({ x: (K.x0 + K.x1) / 2, z: (K.z0 + K.z1) / 2, hx: (K.x1 - K.x0) / 2, hz: (K.z1 - K.z0) / 2, y0: top, y1: top + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: (K.x0 + K.x1) / 2, z: (K.z0 + K.z1) / 2, hx: (K.x1 - K.x0) / 2, hz: (K.z1 - K.z0) / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });
  groundRect(b, M.coldFloor, K.x0, zn, xe, zs, 0.032);

  // ---- inside: five rails of carcasses with the aisle to the door between them, frost on everything ----
  // (the two rails between the aisle and the hatch have their middle carcass taken down: a way through to the hatch,
  // which is in sight from the aisle)
  for (const z of [-19, -16, -13, -7, -4]) {
    const gap = z > R.coldDoor.z;
    box(b, Z.iron, 235, 3.3, z, 9.6, 0.08, 0.08);
    for (const x of [230.3, 235, 239.7]) box(b, Z.iron, x, 3.95, z, 0.06, 1.24, 0.06);
    for (let k = 0; k < 7; k++) if (!gap || k !== 3) carcass(c, 231 + k * 1.33, z, k + Math.round(z + 20) * 3);
    if (!gap) solid(c, 235, z, 9, 0.5, 3, 'zarya-carcass', { kind: 'none', surface: 'wood' });
    else {
      solid(c, 232.3, z, 3.6, 0.5, 3, 'zarya-carcass', { kind: 'none', surface: 'wood' });
      solid(c, 237.7, z, 3.6, 0.5, 3, 'zarya-carcass', { kind: 'none', surface: 'wood' });
      // the empty hook where the carcass came down
      box(b, Z.iron, 235, 3.14, z, 0.03, 0.26, 0.03);
    }
  }
  // frost creeping up the walls and across the floor, icicles under the pipes
  for (const [x, z, w, d] of [[232, zn + 0.9, 5, 1.6], [239, zn + 0.7, 3.4, 1.2], [xe - 0.9, -11, 1.6, 6], [xi + 0.8, -2, 1.2, 4.4], [236, zs - 0.8, 6, 1.4], [xi + 0.9, -18, 1.4, 4]] as const) box(b, Z.ice, x, 0.045, z, w, 0.02, d);
  for (let k = 0; k < 9; k++) {
    const h = 0.16 + ((k * 7) % 5) * 0.09;
    box(b, Z.ice, xi + 0.9 + k * 1.4, h / 2, zn + 0.02, 1.2, h, 0.03);
    box(b, Z.ice, xi + 1.3 + k * 1.4, (h * 0.8) / 2, zs - 0.02, 1.1, h * 0.8, 0.03);
  }
  for (let k = 0; k < 14; k++) {
    const h = 0.14 + ((k * 5) % 4) * 0.1;
    if (k !== 6 && k !== 7) box(b, Z.ice, xe - 0.02, h / 2, zn + 1 + k * 1.55, 0.03, h, 1.2);
  }
  for (const z of [zn + 0.02, zs - 0.02]) box(b, Z.ice, (xi + xe) / 2, 0.06, z, xe - xi, 0.12, 0.04);
  box(b, Z.ice, xe - 0.02, 0.06, (zn + zs) / 2, 0.04, 0.12, zs - zn);
  for (const z of [-10.4, -9.6]) box(b, Z.grey, (xi + xe) / 2, top - 0.3, z, xe - xi - 0.4, 0.12, 0.12);
  for (let k = 0; k < 22; k++) cyl(b, Z.ice, xi + 0.8 + k * 0.56, top - 0.36 - (0.22 + ((k * 7) % 5) * 0.09), k % 2 ? -10.4 : -9.6, 0, 0.045, 0.22 + ((k * 7) % 5) * 0.09, 5);
  // the cooler on the east wall
  box(b, Z.grey, xe - 0.4, 3.3, -10, 0.8, 1.2, 3.4);
  for (const z of [-11, -9]) box(b, Z.black, xe - 0.81, 3.3, z, 0.02, 0.8, 0.8);
  for (let k = 0; k < 8; k++) cyl(b, Z.ice, xe - 0.5, 2.7 - (0.18 + (k % 3) * 0.1), -11.5 + k * 0.42, 0, 0.04, 0.18 + (k % 3) * 0.1, 5);
  // boxes of frozen fish in the south corners (the hatch between them stays clear)
  crates(c, xi + 0.8, zs - 0.75, 3, 11, false);
  crates(c, xi + 2.0, zs - 0.7, 2, 12, false);
  crates(c, xe - 0.8, zs - 0.75, 2, 13, false);
  // a caged lamp
  cyl(b, Z.iron, 235, top - 0.34, -10, 0.14, 0.1, 0.3, 8);
  ball(b, Z.bulb, 235, top - 0.42, -10, 0.1);
  b.light({ x: 235, y: top - 0.6, z: -10, color: 0xcfe4ff, intensity: 22, distance: 19, mode: 'steady', pool: 5, weight: 1 });

  // ---- the hatch: a steel flap low in the south wall, drawn on both faces (nothing walks through it) ----
  for (const [z, s] of [[zs - 0.02, -1], [K.z1 + 0.02, 1]] as const) {
    box(b, Z.iron, R.hatchIn.x, 0.95, z, 1.08, 1.08, 0.05);
    box(b, Z.steel, R.hatchIn.x, 0.95, z + s * 0.03, 0.9, 0.9, 0.05);
    box(b, Z.iron, R.hatchIn.x + 0.3, 0.95, z + s * 0.07, 0.06, 0.3, 0.05);
    for (const y of [0.7, 1.2]) box(b, Z.iron, R.hatchIn.x - 0.42, y, z + s * 0.07, 0.1, 0.14, 0.04);
  }
  // inside, a caged lamp over it, so it is seen from the aisle through the gap in the rails
  box(b, Z.iron, R.hatchIn.x, 1.92, zs - 0.1, 0.3, 0.06, 0.2);
  ball(b, Z.bulb, R.hatchIn.x, 1.8, zs - 0.16, 0.1);
  b.glow({ x: R.hatchIn.x, y: 1.8, z: zs - 0.22, color: 0xcfe4ff, size: 1.1, intensity: 2, mode: 'steady' });
  box(b, Z.woodPale, R.hatch.x, 0.16, K.z1 + 0.55, 1.1, 0.32, 0.8);
  box(b, Z.snow, R.hatch.x, 0.35, K.z1 + 0.55, 1.0, 0.06, 0.7);
  solid(c, R.hatch.x, K.z1 + 0.55, 1.1, 0.8, 0.34, 'zarya-step', { shots: false, kind: 'none', surface: 'wood' });
  drift(c, 230.5, K.z1 + 0.7, 4, 1.2, 0.5);
  drift(c, 239.6, K.z1 + 0.7, 4.4, 1.2, 0.6);
  // a lamp over the hatch outside
  box(b, Z.iron, R.hatch.x, 3.2, K.z1 + 0.3, 0.08, 0.08, 0.6);
  ball(b, Z.bulb, R.hatch.x, 3.1, K.z1 + 0.6, 0.14);
  b.glow({ x: R.hatch.x, y: 3.1, z: K.z1 + 0.6, color: 0xffb060, size: 1, intensity: 2, mode: 'steady' });

  return b.collide({ x: xw, z: dz, hx: 0.3, hz: 1.2, y1: 2.6, blocksMove: false, blocksShots: false, mapKind: 'none', surface: 'metal', tag: 'zarya-colddoor' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the west side: kiosks, the repair booth, the police post
// ---------------------------------------------------------------------------------------------------------------------

/** A street kiosk with its shutter down for the holiday, its back to the west wall. */
function shutKiosk(c: Ctx, z: number, i: number): void {
  const { b } = c;
  const x = 149.2;
  const paint = S.kiosk[i % 4]!;
  box(b, paint, x, 1.35, z, 3.2, 2.7, 4.4);
  box(b, Z.concreteDark, x, 0.15, z, 3.26, 0.3, 4.46);
  // the shutter: ribbed steel, a padlock, the shelf under it
  box(b, Z.grey, x + 1.62, 1.75, z, 0.05, 1.5, 3.5);
  for (let k = 0; k < 9; k++) box(b, Z.steel, x + 1.65, 1.08 + k * 0.17, z, 0.03, 0.04, 3.5);
  box(b, Z.brass, x + 1.68, 1.04, z, 0.05, 0.1, 0.1);
  box(b, Z.woodDark, x + 1.78, 0.96, z, 0.4, 0.06, 3.7);
  box(b, Z.snow, x + 1.8, 1.02, z, 0.36, 0.07, 3.6);
  box(b, GOODS[(i * 3 + 1) % GOODS.length]!, x + 1.63, 2.72, z, 0.06, 0.34, 3.7);
  for (const s of [-1, 1]) {
    slab(b, Z.woodDark, x + s * 0.92, 3.1, z, 2.1, 0.1, 4.8, 0, 0, -s * 0.42);
    slab(b, Z.snow, x + s * 0.92, 3.22, z, 2.04, 0.16, 4.7, 0, 0, -s * 0.42);
    box(b, paint, x, 2.74, z + s * 2.14, 3.0, 0.1, 0.12);
    box(b, paint, x, 2.9, z + s * 2.14, 2.0, 0.26, 0.12);
    box(b, paint, x, 3.14, z + s * 2.14, 1.0, 0.24, 0.12);
  }
}

function westSide(c: Ctx): void {
  const { b } = c;
  const kz = [-38.6, -33.8, -29, -24.2];
  kz.forEach((z, i) => shutKiosk(c, z, i));
  solid(c, 148.5, -31.4, 4.6, 19, 2.8, 'zarya-kiosk', { kind: 'building', surface: 'wood' });
  drift(c, 152, -20.4, 3.2, 2, 0.6, 0.3);
  crates(c, 149, -19.6, 3, 21);
  crates(c, 150.4, -18.6, 2, 22);
  solid(c, 147.2, -19.4, 2, 3.4, 2, 'zarya-beyond', { kind: 'none' });
  drift(c, 147.6, -2, 1.6, 26, 0.7);
  crates(c, 148.8, 6.4, 2, 23);
  barrel(c, 149, 9, Z.snow);
  barrel(c, 149.9, 9.6, Z.snow);

  // ---- the repair booth: a shed with a lit window under a striped awning (the game's bench stands under it) ----
  const B = R.booth;
  const bx = B.x - 3.8;
  box(b, Z.wood, bx, 1.4, B.z, 4.2, 2.8, 4.8);
  box(b, Z.woodDark, bx, 0.15, B.z, 4.26, 0.3, 4.86);
  for (let k = 0; k < 9; k++) box(b, Z.woodDark, bx + 2.11, 1.5, B.z - 2.2 + k * 0.55, 0.02, 2.6, 0.05);
  box(b, Z.warm, bx + 2.12, 1.9, B.z, 0.03, 1.1, 3.2);
  for (const y of [1.36, 2.44]) box(b, Z.woodDark, bx + 2.14, y, B.z, 0.07, 0.08, 3.4);
  for (const s of [-1, 0, 1]) box(b, Z.woodDark, bx + 2.14, 1.9, B.z + s * 1.66, 0.07, 1.1, 0.08);
  // what is waiting to be mended, on the sill: wireless sets, a clock, a boot
  goods(b, bx + 2.2, 1.4, B.z, 3, true, 77, { mats: [Z.woodDark, Z.wood, Z.cream, Z.black], h: 0.3, d: 0.16, step: 0.5 });
  box(b, Z.woodDark, bx - 0.2, 2.95, B.z, 5, 0.12, 5.2);
  box(b, Z.snow, bx - 0.2, 3.1, B.z, 4.9, 0.2, 5.1);
  // its sign: a clock face on the roof (it says 23:57 like every clock in town)
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.12, 16), Z.bulb);
  face.position.set(bx + 1.9, 3.9, B.z);
  face.rotation.z = Math.PI / 2;
  own(c, face);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.08, 16), Z.iron);
  rim.position.set(bx + 1.86, 3.9, B.z);
  rim.rotation.z = Math.PI / 2;
  own(c, rim);
  box(b, Z.iron, bx + 1.86, 3.3, B.z, 0.08, 0.36, 0.08);
  slab(b, Z.black, bx + 1.97, 4.02, B.z + 0.01, 0.02, 0.3, 0.05, 0.03, 0, 0);
  slab(b, Z.black, bx + 1.97, 4.08, B.z + 0.06, 0.02, 0.42, 0.035, 0.31, 0, 0);
  // the awning: red and white stripes on two posts
  for (let k = 0; k < 12; k++) slab(b, k % 2 ? Z.white : Z.red, B.x + 0.05, 2.78, B.z - 2.42 + k * 0.44, 3.6, 0.05, 0.44, 0, 0, -0.1);
  for (let k = 0; k < 12; k++) box(b, k % 2 ? Z.white : Z.red, B.x + 1.84, 2.48, B.z - 2.42 + k * 0.44, 0.03, 0.24, 0.44);
  for (const s of [-1, 1]) {
    cyl(b, Z.iron, B.x + 1.8, 0, B.z + s * 2.56, 0.05, 0.05, 2.6, 6);
    solid(c, B.x + 1.8, B.z + s * 2.56, 0.2, 0.2, 2.6, 'zarya-post', { kind: 'none', surface: 'metal' });
  }
  bulbString(b, B.x + 1.86, 2.3, B.z - 2.6, B.x + 1.86, 2.3, B.z + 2.6, 12, 0.06);
  solid(c, bx, B.z, 4.2, 4.8, 3, 'zarya-booth', { kind: 'building', surface: 'wood' });
  b.light({ x: B.x + 0.6, y: 2.4, z: B.z, color: 0xffb46a, intensity: 18, distance: 14, mode: 'steady', pool: 5, weight: 0.9 });
  // behind it: what nobody came back for, under snow
  crates(c, 148.6, B.z - 1.2, 2, 31);
  drift(c, 148.4, B.z + 0.8, 2.4, 3, 0.9);
  solid(c, 148.2, B.z, 3.8, 5, 1.6, 'zarya-beyond', { kind: 'none' });
  crates(c, 152, B.z + 3.4, 2, 32);

  // ---- the police post: a small brick building, a barred window, a blue lamp, a canopy over its counter ----
  const P = R.police;
  const x0 = 147.6;
  const x1 = P.x - 1.7;
  const z0 = P.z - 4;
  const z1 = P.z + 4;
  const xm = (x0 + x1) / 2;
  addBox(b, 'brick', xm, 1.7, P.z, x1 - x0, 3.4, z1 - z0);
  box(b, Z.concreteDark, xm, 0.3, P.z, x1 - x0 + 0.1, 0.6, z1 - z0 + 0.1);
  box(b, Z.concrete, xm, 3.5, P.z, x1 - x0 + 0.5, 0.24, z1 - z0 + 0.5);
  box(b, Z.snow, xm, 3.72, P.z, x1 - x0 + 0.4, 0.22, z1 - z0 + 0.4);
  addBox(b, 'brick', x0 + 1.4, 4.2, P.z + 2, 0.7, 1.2, 0.7);
  box(b, Z.snow, x0 + 1.4, 4.86, P.z + 2, 0.8, 0.12, 0.8);
  // the barred windows: one beside the counter, one on the north wall by the door
  const barred = (x: number, z: number, w: number, alongZ: boolean, out: 1 | -1): void => {
    const ox = alongZ ? out * 0.02 : 0;
    const oz = alongZ ? 0 : out * 0.02;
    box(b, Z.warm, x + ox, 1.9, z + oz, alongZ ? 0.04 : w, 1.2, alongZ ? w : 0.04);
    box(b, Z.cream, x + ox * 4, 1.24, z + oz * 4, alongZ ? 0.2 : w + 0.2, 0.1, alongZ ? w + 0.2 : 0.2);
    box(b, Z.snow, x + ox * 5, 1.32, z + oz * 5, alongZ ? 0.16 : w, 0.07, alongZ ? w : 0.16);
    for (let k = 0; k <= 6; k++) box(b, Z.iron, x + ox * 4 + (alongZ ? 0 : -w / 2 + (k * w) / 6), 1.9, z + oz * 4 + (alongZ ? -w / 2 + (k * w) / 6 : 0), 0.04, 1.2, 0.04);
    for (const y of [1.5, 2.3]) box(b, Z.iron, x + ox * 4, y, z + oz * 4, alongZ ? 0.04 : w, 0.04, alongZ ? w : 0.04);
  };
  barred(x1, P.z + 3, 1.3, true, 1);
  barred(x1, P.z - 3, 1.3, true, 1);
  barred(xm - 1.6, z0, 1.6, false, -1);
  // the door (shut), a step, a board for notices with nothing written on it
  box(b, Z.blue, xm + 1.6, 1.15, z0 - 0.03, 1.1, 2.1, 0.08);
  box(b, Z.brass, xm + 2.0, 1.1, z0 - 0.09, 0.05, 0.14, 0.04);
  box(b, Z.concrete, xm + 1.6, 0.1, z0 - 0.5, 1.6, 0.2, 0.9);
  box(b, Z.snow, xm + 1.6, 0.23, z0 - 0.5, 1.5, 0.06, 0.8);
  box(b, Z.woodDark, xm + 3.2, 1.7, z0 - 0.05, 1.2, 0.9, 0.05);
  for (let k = 0; k < 4; k++) box(b, k === 1 ? Z.cream : Z.white, xm + 2.9 + (k % 2) * 0.56, 1.9 - Math.floor(k / 2) * 0.4, z0 - 0.09, 0.4, 0.3, 0.02, ((k * 3) % 5) * 0.03 - 0.06);
  // the hatch the counter is served through, the canopy over it on two posts
  box(b, Z.warm, x1 + 0.02, 1.7, P.z, 0.04, 1.0, 2.8);
  box(b, Z.woodDark, x1 + 0.05, 1.14, P.z, 0.12, 0.1, 3.2);
  box(b, Z.woodDark, x1 + 0.05, 2.26, P.z, 0.12, 0.1, 3.2);
  box(b, Z.blue, x1 + 1.6, 2.82, P.z, 3.3, 0.12, 4.4);
  box(b, Z.snow, x1 + 1.6, 2.96, P.z, 3.2, 0.16, 4.3);
  for (const s of [-1, 1]) {
    cyl(b, Z.iron, x1 + 3.1, 0, P.z + s * 2.05, 0.06, 0.06, 2.8, 6);
    solid(c, x1 + 3.1, P.z + s * 2.05, 0.2, 0.2, 2.8, 'zarya-post', { kind: 'none', surface: 'metal' });
  }
  // the blue lamp on the corner, an aerial with a red light on the roof
  box(b, Z.iron, x1 + 0.3, 3.2, z0 + 0.2, 0.6, 0.08, 0.08);
  cyl(b, Z.blueLamp, x1 + 0.56, 3.0, z0 + 0.2, 0.14, 0.14, 0.3, 8);
  box(b, Z.iron, x1 + 0.56, 3.32, z0 + 0.2, 0.34, 0.05, 0.34);
  b.light({ x: x1 + 0.9, y: 3, z: z0 - 0.2, color: 0x4a8cff, intensity: 22, distance: 16, mode: 'steady', pool: 5, glow: 1.3, weight: 1 });
  cyl(b, Z.iron, xm + 2, 3.6, P.z - 2, 0.04, 0.02, 4.2, 5);
  ball(b, Z.redLamp, xm + 2, 7.84, P.z - 2, 0.08);
  b.glow({ x: xm + 2, y: 7.84, z: P.z - 2, color: 0xff3020, size: 0.8, intensity: 2, mode: 'steady' });
  solid(c, (R.rect.x0 + 0.2 + x1) / 2, P.z, x1 - R.rect.x0 - 0.2, z1 - z0, 3.6, 'zarya-police', { kind: 'building' });
  drift(c, 150, z1 + 1, 5, 1.6, 0.7);
  drift(c, 150.4, z0 - 2.2, 3, 1.4, 0.5);
  bareTree(c, 149.4, 61.5, 5.6);
  bareTree(c, 149, 41.6, 4.6);
  drift(c, 152, 69.6, 9, 1.6, 0.7);
}

// ---------------------------------------------------------------------------------------------------------------------
// the yard
// ---------------------------------------------------------------------------------------------------------------------

/** An open-air stall: a trestle table under a canvas on four posts, snow on the canvas, what it sells laid out. */
function yardStall(c: Ctx, s: (typeof RYNOK_YARD)[number], i: number): void {
  const { b } = c;
  const f = frame(s.x, s.z, s.rot);
  const put = (mat: THREE.Material, u: number, y: number, v: number, sx: number, sy: number, sz: number): void => {
    const [qx, qz] = f(u, v);
    box(b, mat, qx, y, qz, sx, sy, sz, s.rot);
  };
  const round = (mat: THREE.Material, u: number, y: number, v: number, r: number, sy = 1): void => {
    const [qx, qz] = f(u, v);
    ball(b, mat, qx, y, qz, r, sy, 6);
  };
  const tube = (mat: THREE.Material, u: number, y: number, v: number, r0: number, r1: number, h: number): void => {
    const [qx, qz] = f(u, v);
    cyl(b, mat, qx, y, qz, r0, r1, h, 8);
  };
  put(Z.wood, 0, 0.86, 0.3, 3.7, 0.07, 1.3);
  for (const u of [-1.5, 1.5]) put(Z.woodDark, u, 0.42, 0.3, 0.1, 0.84, 1.1);
  put(Z.woodDark, 0, 0.3, 0.3, 3, 0.06, 0.08);
  for (const u of [-1.95, 1.95]) {
    put(Z.woodPale, u, 1.37, -1.1, 0.09, 2.74, 0.09);
    put(Z.woodPale, u, 1.15, 1.1, 0.09, 2.3, 0.09);
  }
  const cloth = [M.canvas, Z.blue, Z.green, Z.redDark, M.canvas][i % 5]!;
  slab(b, cloth, s.x, 2.55, s.z, 4.3, 0.05, 2.56, 0.19, s.rot, 0);
  slab(b, Z.snow, s.x, 2.63, s.z, 4.1, 0.12, 2.3, 0.19, s.rot, 0);
  for (let k = 0; k < 10; k++) put(k % 2 ? Z.white : cloth, -1.89 + k * 0.42, 2.18, 1.26, 0.42, 0.26, 0.03);
  /** A crate tipped toward the customer, heaped with round things. */
  const heap = (u: number, mat: THREE.Material, r: number): void => {
    put(Z.woodPale, u, 0.98, 0.32, 0.9, 0.18, 0.7);
    for (let k = 0; k < 11; k++) round(mat, u - 0.3 + (k % 4) * 0.2, 1.09 + r * 0.5 + (k > 7 ? r * 1.2 : 0), 0.1 + (Math.floor(k / 4) % 2) * 0.3 + (k > 7 ? 0.1 : 0), r);
  };
  switch (s.kind) {
    case 'veg':
      heap(-1.2, Z.woodDark, 0.09);
      heap(-0.2, Z.green, 0.13);
      heap(0.8, Z.redDark, 0.09);
      for (let k = 0; k < 5; k++) put(Z.orange, 1.5 + (k % 2) * 0.1, 0.94 + k * 0.03, 0.1 + k * 0.1, 0.4, 0.06, 0.07);
      break;
    case 'apples':
      heap(-1.2, Z.red, 0.085);
      heap(-0.2, Z.gold, 0.085);
      heap(0.8, Z.green, 0.085);
      break;
    case 'mandarins':
      heap(-1.1, Z.orange, 0.085);
      heap(0, Z.orange, 0.085);
      heap(1.1, Z.orange, 0.085);
      break;
    case 'pots':
      for (let k = 0; k < 9; k++) {
        const m = GOODS[(k * 3 + i) % GOODS.length]!;
        tube(m, -1.5 + k * 0.38, 0.9, 0.1 + (k % 2) * 0.4, 0.15, 0.16, 0.2 + (k % 3) * 0.05);
        if (k % 3 === 0) tube(Z.white, -1.5 + k * 0.38, 1.1 + (k % 3) * 0.05, 0.1 + (k % 2) * 0.4, 0.165, 0.04, 0.07);
      }
      break;
    case 'toys':
      // matryoshkas in rows by size, a sled stood on end
      for (let k = 0; k < 14; k++) {
        const sz = 1 - (k % 7) * 0.11;
        const v = k < 7 ? 0.1 : 0.55;
        tube(k % 2 ? Z.red : k % 3 ? Z.gold : Z.blue, -1.5 + (k % 7) * 0.34, 0.9, v, 0.1 * sz, 0.075 * sz, 0.26 * sz);
        round(Z.cream, -1.5 + (k % 7) * 0.34, 0.9 + 0.3 * sz, v, 0.07 * sz);
      }
      put(Z.red, 1.4, 1.35, 0.3, 0.5, 0.9, 0.06);
      break;
    case 'felt':
      for (let k = 0; k < 12; k++) {
        const m = k % 3 ? Z.grey : Z.black;
        tube(m, -1.6 + (k % 6) * 0.36, 0.9, 0.05 + Math.floor(k / 6) * 0.5, 0.085, 0.075, 0.34);
        put(m, -1.6 + (k % 6) * 0.36, 0.95, 0.15 + Math.floor(k / 6) * 0.5, 0.15, 0.1, 0.22);
      }
      for (let k = 0; k < 5; k++) put(GOODS[(k * 3 + i) % GOODS.length]!, 1.2, 0.97 + k * 0.1, 0.3, 0.7, 0.1, 0.5);
      break;
    case 'fish':
      // frozen fish stood on their tails in boxes, the way they are sold in the cold
      for (const u of [-1.1, 0, 1.1]) {
        put(Z.woodPale, u, 1.02, 0.3, 0.8, 0.26, 0.6);
        for (let k = 0; k < 9; k++) {
          const [qx, qz] = f(u - 0.28 + (k % 3) * 0.28, 0.12 + Math.floor(k / 3) * 0.18);
          slab(b, k % 2 ? Z.grey : Z.steel, qx, 1.3, qz, 0.12, 0.56, 0.05, ((k * 7) % 5) * 0.06 - 0.12, s.rot + k, 0);
        }
      }
      break;
    case 'honey':
      for (let k = 0; k < 16; k++) tube(k % 3 ? Z.gold : Z.orange, -1.6 + (k % 8) * 0.3, 0.9, 0.05 + Math.floor(k / 8) * 0.45, 0.09, 0.09, 0.2 + (k % 2) * 0.06);
      tube(Z.woodPale, 1.3, 0.9, 0.3, 0.22, 0.24, 0.4);
      break;
  }
  // a crate or two at its back corner
  put(Z.woodPale, -1.5, 0.3, -0.75, 0.8, 0.6, 0.7);
  put(Z.snow, -1.5, 0.63, -0.75, 0.74, 0.06, 0.64);
  put(Z.wood, 1.3, 0.25, -0.8, 0.7, 0.5, 0.6);
  solid(c, s.x, s.z, 4.2, 2.5, 1, 'zarya-stall', { rot: s.rot, shots: false, kind: 'prop', surface: 'wood' });
}

/** The cold store's lorry, backed up north of it with snow on its roof: nose to the west. */
function lorry(c: Ctx, x: number, z: number): void {
  const { b } = c;
  box(b, Z.iron, x - 0.2, 0.8, z, 7, 0.3, 1.9);
  box(b, S.panel, x + 1.1, 2.25, z, 4.6, 2.5, 2.4);
  box(b, Z.snow, x + 1.1, 3.57, z, 4.5, 0.16, 2.3);
  for (let k = 0; k < 5; k++) box(b, Z.grey, x - 0.9 + k * 1.0, 2.25, z, 0.06, 2.4, 2.44);
  box(b, Z.steel, x + 3.42, 2.25, z, 0.05, 2.2, 2.0);
  box(b, Z.iron, x + 3.46, 2.2, z, 0.04, 1.2, 0.06);
  // the cab and bonnet
  box(b, S.cab, x - 2.2, 1.85, z, 1.5, 1.8, 2.2);
  box(b, Z.black, x - 2.96, 2.2, z, 0.04, 0.7, 1.9);
  for (const s of [-1, 1]) box(b, Z.black, x - 2.3, 2.2, z + s * 1.11, 0.9, 0.6, 0.03);
  box(b, Z.snow, x - 2.2, 2.8, z, 1.4, 0.12, 2.1);
  box(b, S.cab, x - 3.5, 1.4, z, 1.2, 0.9, 1.8);
  box(b, Z.snow, x - 3.5, 1.9, z, 1.1, 0.1, 1.7);
  box(b, Z.white, x - 4.12, 1.4, z, 0.04, 0.6, 1.2);
  for (const s of [-1, 1]) ball(b, Z.grey, x - 4.12, 1.4, z + s * 0.75, 0.12);
  box(b, Z.iron, x - 4.2, 0.85, z, 0.14, 0.2, 2.2);
  for (const u of [-3.3, 1.2, 2.4]) {
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), Z.black);
      w.position.set(x + u, 0.5, z + s * 0.95);
      w.rotation.x = Math.PI / 2;
      own(c, w);
    }
  }
  solid(c, x - 0.4, z, 7.6, 2.4, 3.5, 'zarya-lorry', { kind: 'prop', surface: 'metal' });
}

function yard(c: Ctx): void {
  const { b } = c;
  RYNOK_YARD.forEach((s, i) => yardStall(c, s, i));

  // ---- the matryoshka's plinth (the doll is the story's): stone steps under snow ----
  const D = R.doll;
  box(b, Z.concrete, D.x, 0.19, D.z, 2.6, 0.38, 2.6);
  box(b, Z.cream, D.x, 0.49, D.z, 2.1, 0.22, 2.1);
  for (const s of [-1, 1]) {
    box(b, Z.snow, D.x + s * 1.17, 0.41, D.z, 0.26, 0.07, 2.6);
    box(b, Z.snow, D.x, 0.41, D.z + s * 1.17, 2.6, 0.07, 0.26);
  }
  solid(c, D.x, D.z, 2.6, 2.6, 2.7, 'zarya-doll', { kind: 'prop' });

  // ---- lamp posts: six with a light of their own, the rest only their glow ----
  for (const [x, z] of [[176, -45.6], [218, -45.6], [181, 27], [213, 27], [165.5, 45.5], [220.6, 43.6]] as const) lampPost(c, x, z, true);
  for (const [x, z] of [[163.6, -43.4], [223, -35.6], [164.2, -17], [163.8, 13.4], [163.8, 38.6], [225.2, 14.6], [185, 61], [209, 61]] as const) lampPost(c, x, z, false);
  // New Year's bulbs strung from lamp to lamp across the yard, and from the lamps to the hall
  bulbString(b, 181, 5.3, 27, 213, 5.3, 27, 44, 0.9);
  bulbString(b, 181, 5.3, 27, (px(2) + px(3)) / 2, 4.9, H.z1 + 0.5, 22, 0.5);
  bulbString(b, 213, 5.3, 27, (px(6) + px(7)) / 2, 4.9, H.z1 + 0.5, 22, 0.5);
  bulbString(b, 176, 5.3, -45.6, (px(2) + px(3)) / 2, 4.9, H.z0 - 0.5, 20, 0.5);
  bulbString(b, 218, 5.3, -45.6, (px(6) + px(7)) / 2, 4.9, H.z0 - 0.5, 20, 0.5);

  // ---- north of the hall: benches at the stop, the cold store's lorry, a cart, firs in the corner ----
  bench(c, 188, -46.6, 0);
  bench(c, 206, -46.6, 0);
  // the stop's shelter, west of where the tram stands: a roof on six posts, its glazed back to the market, a bench under it
  const sx = 167.4;
  const sz = -48.9;
  box(b, Z.woodDark, sx, 2.64, sz, 7.2, 0.1, 2.4);
  box(b, Z.snow, sx, 2.78, sz, 7.4, 0.2, 2.6);
  for (const dx of [-3.4, 0, 3.4]) for (const dz of [-1, 1]) box(b, Z.woodDark, sx + dx, 1.3, sz + dz, 0.14, 2.6, 0.14);
  box(b, Z.snowBlue, sx, 1.45, sz + 1.05, 6.8, 1.7, 0.06);
  box(b, Z.wood, sx, 0.5, sz + 0.6, 5, 0.08, 0.5);
  for (const dx of [-2.2, 2.2]) box(b, Z.iron, sx + dx, 0.24, sz + 0.6, 0.07, 0.48, 0.44);
  box(b, Z.warm, sx, 2.56, sz, 3, 0.03, 0.2);
  b.glow({ x: sx, y: 2.4, z: sz, color: 0xffb060, size: 1.4, intensity: 1.6, mode: 'steady' });
  solid(c, sx, sz + 0.85, 6.8, 0.7, 2.6, 'zarya-stop', { kind: 'prop', surface: 'wood' });
  cyl(b, Z.iron, sx + 4.2, 0, sz - 0.6, 0.06, 0.06, 3, 6);
  box(b, Z.red, sx + 4.2, 2.8, sz - 0.6, 0.7, 0.5, 0.05);
  solid(c, sx + 4.2, sz - 0.6, 0.2, 0.2, 3, 'zarya-pole', { kind: 'none', surface: 'metal' });
  lorry(c, 236.4, -27.4);
  crates(c, 230.4, -24.2, 3, 41);
  crates(c, 231.6, -23.6, 2, 42);
  cart(c, 236.6, -33.6, 1.2, 'crates');
  fir(c, 222.6, -48.6, 5.6);
  bareTree(c, 238.6, -47.6, 5.4);
  cart(c, 164, -37.5, -0.5, 'snow');
  crates(c, 166, -40.4, 2, 43);
  barrel(c, 165, -34.2, Z.snow);
  sacks(c, 229.6, -42.6, 4);

  // ---- the yard south of the hall: benches under its windows, carts, crates, barrels, a seller of firs ----
  bench(c, (px(3) + px(4)) / 2, H.z1 + 1.1, Math.PI);
  bench(c, (px(5) + px(6)) / 2, H.z1 + 1.1, Math.PI);
  cart(c, 186.5, 55, 0.5, 'sacks');
  cart(c, 213, 59.4, -0.4, 'crates');
  cart(c, 234.4, 41.6, 1.9, 'sacks');
  cart(c, 181.6, 21.4, 1.4, 'snow');
  crates(c, 168, 62, 3, 51);
  crates(c, 169.4, 63, 2, 52);
  crates(c, 226, 63, 3, 53);
  crates(c, 213.6, 21.6, 2, 54);
  crates(c, 181.2, 50.4, 2, 55);
  crates(c, 213.2, 41.2, 2, 56);
  for (const [x, z] of [[166.6, 22.2], [167.2, 21.2], [227.4, 22], [181, 41.4], [232.8, 50.2], [233.6, 49.4]] as const) barrel(c, x, z, Z.snow);
  sacks(c, 166.8, 50.2, 5);
  // New Year firs for sale, leaning in a rack under the south wall
  box(b, Z.woodPale, 219, 1.1, 67, 10.4, 0.1, 0.1);
  for (const x of [214, 219, 224]) box(b, Z.woodPale, x, 0.55, 67, 0.1, 1.1, 0.1);
  for (let k = 0; k < 7; k++) firTree(b, 214.6 + k * 1.45, 67.7 + (k % 2) * 0.4, 2.3 + (k % 3) * 0.4);
  solid(c, 219, 67.7, 10.6, 2.2, 2, 'zarya-firs', { shots: false, kind: 'none', surface: 'wood' });
  crates(c, 240.6, 22, 3, 61);
  crates(c, 241.2, 23.4, 2, 62);
  barrel(c, 240.2, 25.6, Z.snow);
  // a tank of kvass on its trailer, shut for the winter; benches; the snowman the children made
  kvass(c, 208.4, 53.6);
  bench(c, 190.2, 51.5, 0);
  bench(c, 203.2, 51.5, 0);
  for (const [y, r] of [[0.5, 0.56], [1.28, 0.42], [1.86, 0.3]] as const) ball(b, Z.snow, 187.2, y, 48.2, r, 0.92, 10);
  slab(b, Z.orange, 187.2, 1.86, 47.84, 0.07, 0.07, 0.3, 0, 0, 0);
  cyl(b, Z.grey, 187.2, 2.1, 48.2, 0.2, 0.16, 0.26, 8);
  for (const e of [-1, 1]) slab(b, Z.woodDark, 187.2 + e * 0.62, 1.4, 48.2, 0.7, 0.04, 0.04, 0, 0, e * 0.5);
  solid(c, 187.2, 48.2, 1.1, 1.1, 2, 'zarya-snowman', { kind: 'none' });
  // the corners: firs, snow shovelled against the walls
  fir(c, 210.4, 68.2, 6.4);
  fir(c, 207.6, 69.2, 4.4);
  bareTree(c, 242.4, 69, 6);
  bareTree(c, 233, 68.6, 4.8);
  fir(c, 162.5, 68.4, 5);
  for (const [x, w] of [[176, 20], [222, 26], [186.5, 6], [205.5, 6]] as const) drift(c, x, 70.4, w, 1.4, 0.7);
  drift(c, 164.6, 14.6, 2.4, 3, 0.6, 0.4);
  drift(c, 229.6, 12.6, 2.6, 3.2, 0.6, -0.3);
}

export function buildRynok(c: Ctx): RynokHandles {
  ground(c);
  line(c);
  hallShell(c);
  RYNOK_STALLS.forEach((q, i) => island(c, q, i));
  hallSides(c);
  const coldDoor = coldStore(c);
  westSide(c);
  yard(c);
  return { coldDoor };
}
