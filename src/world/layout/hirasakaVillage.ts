/**
 * HIRASAKA: THE OLD VILLAGE (place group 'village', the deep, room x 420..516, z -68..-4, floor y 9, roof 18 above).
 * A village swallowed long ago, still lit for Obon. Reached from the coal face up the drift (the room's south edge,
 * x 430..444, z -4) and left by the door in its west wall (x 420, z -40..-32) into the kofun passage's head.
 * Spots: `places.ts` DEEP_SPOTS hearth / riceball / grapes, SHRINES[2] village shrine, TAPES[4].
 *
 * What stands here (south to north, the way a player walks in):
 *  - a red torii and two stone lanterns at the mouth of the drift, a flagstone lane looping round the village;
 *  - the Bon altar (shōryōdana) with its grapes, the cucumber horse and the aubergine ox, under a straw rope;
 *  - eight houses on stone footings: dark timber frames, pale mud walls, lit shoji, deep tiled hip roofs, an engawa on
 *    the door side. Every one is enterable and dressed (tatami, tansu, futon, kamidana): the hearth house (an irori
 *    with the pot on its hook: eating heals and marks your hand), the house where Genzō left a tape, Mio's house (her
 *    kimono on its stand, the rice ball still wrapped in the sleeve), the storehouse of rice bales;
 *  - the village shrine (a hokora on a stone plinth, an offering box, a torii and lanterns), the withered peach tree
 *    beside it (it lives again once Kurogane is dead: `VILLAGE_PEACH` is where `look.ts` can bloom it), the well,
 *    a paddy of rice gone grey, a waterfall out of the north wall into a stone-rimmed pool;
 *  - houses half swallowed by the cave: roofs and façades sinking into the rock along the walls, some high up;
 *  - floating Bon lanterns all through the dark, straw ropes with white shide across the lanes. Orange on indigo.
 *
 * Every door opens at once when the hairpin is taken (`hirasaka/look.ts` reads VILLAGE_HOUSES' doors).
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import type { Ctx } from './util';
import { H, block, box, cyl, shell, solid, type Side } from './hirasakaKit';
import { crag, dressMats, gnarl } from './hirasakaDress';
import { DEEP_SPOTS, DEEP_Y, SHRINES, TAPES, type Rect } from '../../hirasaka/places';

export const VILLAGE_RECT = { x0: 420, z0: -70, x1: 518, z1: -4 };

/** What each house is (its dressing inside). */
type HouseKind = 'home' | 'hearth' | 'tape' | 'mio' | 'store' | 'nets';

/** The village's houses and their doors (the side and the door's middle along it). */
export const VILLAGE_HOUSES: readonly (Rect & { door: Side; at: number; kind: HouseKind })[] = [
  { x0: 426, z0: -62, x1: 437, z1: -52, door: 'E', at: 5, kind: 'nets' },
  { x0: 442, z0: -40, x1: 452, z1: -30, door: 'E', at: 5, kind: 'home' },
  { x0: 464, z0: -42, x1: 476, z1: -30, door: 'N', at: 6, kind: 'hearth' },
  { x0: 476, z0: -56, x1: 488, z1: -46, door: 'S', at: 6, kind: 'tape' },
  { x0: 492, z0: -64, x1: 504, z1: -52, door: 'S', at: 6, kind: 'mio' },
  { x0: 500, z0: -40, x1: 510, z1: -30, door: 'W', at: 5, kind: 'home' },
  { x0: 422, z0: -26, x1: 432, z1: -15, door: 'E', at: 5.5, kind: 'home' },
  { x0: 498, z0: -18, x1: 508, z1: -8, door: 'W', at: 5, kind: 'store' },
];

/** The withered peach tree by the shrine (bare until the Root Hall's tree lives; then it can bloom). */
export const VILLAGE_PEACH = { x: 476, y: DEEP_Y, z: -18 };

// ---------------------------------------------------------------------------------------------------------------------
// materials (plain colours merge; only the lanterns and the shoji glow)
// ---------------------------------------------------------------------------------------------------------------------

// two finishes only (each finish is a draw call per chunk): matt for everything, wet for water
const std = (color: number, roughness = 0.85): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: roughness < 0.5 ? 0.15 : 0.85 });
const V = {
  mud: std(0xa8946e, 0.92),
  timber: std(0x2c1f17, 0.86),
  tile: std(0x262a33, 0.7),
  ridge: std(0x1a1d24, 0.7),
  straw: std(0xb09458, 0.95),
  strawGrey: std(0x5e5a4e, 0.95),
  stone: std(0x5a5650, 0.94),
  stoneDark: std(0x3a3834, 0.94),
  flag: std(0x48443e, 0.9),
  mudField: std(0x3a332a, 0.95),
  shoji: new THREE.MeshStandardMaterial({ color: 0xf2dfb4, roughness: 0.9, emissive: 0xffa048, emissiveIntensity: 0.8 }),
  ink: std(0x0e0b09, 1),
  lacquer: std(0x5a1a14, 0.5),
  indigo: std(0x2a3058, 0.9),
  grape: std(0x4a2050, 0.6),
  cucumber: std(0x3e6a2a, 0.7),
  aubergine: std(0x2e1838, 0.6),
  pool: std(0x10262e, 0.12),
  fall: std(0x7a9cae, 0.3),
  clay: std(0x8a5a3a, 0.9),
  // the Bon lanterns' paper: a deep orange that stays orange on screen (one draw call per chunk)
  lantern: new THREE.MeshStandardMaterial({ color: 0x3a1a08, roughness: 0.7, emissive: 0xff5a14, emissiveIntensity: 1.25 }),
};

// ---------------------------------------------------------------------------------------------------------------------
// small pieces
// ---------------------------------------------------------------------------------------------------------------------

const P = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A straight rod from p to q (a rope's segment, a pole, a hook). */
function rod(b: LevelBuilder, mat: THREE.Material, p: THREE.Vector3, q: THREE.Vector3, r: number, seg = 5): void {
  const d = new THREE.Vector3().subVectors(q, p);
  const len = d.length();
  if (len < 0.01) return;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(p).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.updateMatrixWorld(true);
  b.add(m, { cast: false });
}

/** A sagging straw rope (shimenawa) from a to e, with white paper shide hanging from it. */
function strawRope(b: LevelBuilder, a: THREE.Vector3, e: THREE.Vector3, sag: number, shide = 4): void {
  const n = 8;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(P(a.x + (e.x - a.x) * t, a.y + (e.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (e.z - a.z) * t));
  }
  for (let i = 0; i < n; i++) rod(b, V.straw, pts[i]!, pts[i + 1]!, 0.07, 6);
  const yaw = Math.atan2(-(e.z - a.z), e.x - a.x);
  for (let k = 1; k <= shide; k++) {
    const t = k / (shide + 1);
    const x = a.x + (e.x - a.x) * t;
    const z = a.z + (e.z - a.z) * t;
    const y = a.y + (e.y - a.y) * t - Math.sin(t * Math.PI) * sag;
    // a zigzag of paper: three offset tabs
    for (let s = 0; s < 3; s++) box(b, H.white, x + Math.cos(yaw) * (s % 2) * 0.06, y - 0.16 - s * 0.16, z - Math.sin(yaw) * (s % 2) * 0.06, 0.12, 0.15, 0.02, yaw, false);
  }
}

/** A paper lantern (chōchin) at (x, y, z): the lit paper, a dark cap and foot. */
function lantern(b: LevelBuilder, x: number, y: number, z: number, s = 1): void {
  cyl(b, V.lantern, x, y - 0.3 * s, z, 0.3 * s, 0.3 * s, 0.6 * s, 10, false);
  cyl(b, V.ink, x, y + 0.3 * s, z, 0.2 * s, 0.2 * s, 0.07 * s, 8, false);
  cyl(b, V.ink, x, y - 0.37 * s, z, 0.2 * s, 0.2 * s, 0.07 * s, 8, false);
}

/** A stone lantern (tōrō) on the floor at y: plinth, post, firebox lit inside, roof, finial. */
function toro(c: Ctx, x: number, y: number, z: number): void {
  const { b } = c;
  box(b, V.stone, x, y + 0.15, z, 0.8, 0.3, 0.8, 0, false);
  cyl(b, V.stone, x, y + 0.3, z, 0.16, 0.2, 0.9, 8, false);
  box(b, V.stone, x, y + 1.25, z, 0.62, 0.12, 0.62, 0, false);
  box(b, V.lantern, x, y + 1.52, z, 0.36, 0.36, 0.36, 0, false);
  for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) box(b, V.stone, x + dx, y + 1.52, z + dz, 0.08, 0.42, 0.08, 0, false);
  cyl(b, V.stone, x, y + 1.72, z, 0.55, 0.15, 0.32, 6, false);
  box(b, V.stone, x, y + 2.1, z, 0.14, 0.18, 0.14, 0, false);
  solid(c, x, z, 0.8, 0.8, y + 2.2, 'toro', { shots: false });
}

/** A torii across a path running along z (posts at x ± w/2) or along x when `alongX`, red unless told otherwise. */
function torii(c: Ctx, x: number, y: number, z: number, w: number, h: number, alongX = false, mat: THREE.Material = H.red): void {
  const { b } = c;
  for (const s of [-1, 1]) {
    const px = alongX ? x : x + (s * w) / 2;
    const pz = alongX ? z + (s * w) / 2 : z;
    cyl(b, mat, px, y, pz, 0.2, 0.24, h, 10, false);
    box(b, V.ink, px, y + 0.25, pz, 0.56, 0.5, 0.56, 0, false);
    solid(c, px, pz, 0.5, 0.5, y + h, 'torii', { surface: 'wood' });
  }
  const sx = alongX ? 0.36 : w + 1.6;
  const sz = alongX ? w + 1.6 : 0.36;
  box(b, V.ink, x, y + h + 0.2, z, alongX ? 0.44 : w + 2.0, 0.22, alongX ? w + 2.0 : 0.44, 0, false);
  box(b, mat, x, y + h - 0.02, z, sx, 0.3, sz, 0, false);
  box(b, mat, x, y + h - 0.85, z, alongX ? 0.24 : w + 0.6, 0.24, alongX ? w + 0.6 : 0.24, 0, false);
  box(b, mat, x, y + h - 0.45, z, 0.2, 0.6, 0.2, 0, false);
}

/** A hipped roof geometry, eaves at y 0: `w` by `d` at the eaves, ridge `ridge` long along x, `rise` up. */
function hip(w: number, d: number, ridge: number, rise: number): THREE.BufferGeometry {
  const A = [-w / 2, 0, -d / 2];
  const B = [w / 2, 0, -d / 2];
  const C = [w / 2, 0, d / 2];
  const D = [-w / 2, 0, d / 2];
  const Pp = [-ridge / 2, rise, 0];
  const Q = [ridge / 2, rise, 0];
  const tris = [D, C, Q, D, Q, Pp, B, A, Pp, B, Pp, Q, C, B, Q, A, D, Pp, A, C, B, A, D, C];
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => pos.set(p, i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(tris.length * 2), 2));
  g.computeVertexNormals();
  return g;
}

/** A tiled hip roof over a footprint (cx, cz, w along x, d along z) with its eaves at `y`, ridge along the longer side. */
function hipRoof(b: LevelBuilder, cx: number, y: number, cz: number, w: number, d: number, tilt = 0): void {
  const alongX = w >= d;
  const L = alongX ? w : d;
  const S = alongX ? d : w;
  const rise = S * 0.42;
  const m = new THREE.Mesh(hip(L, S, L - S * 0.7, rise), V.tile);
  m.position.set(cx, y, cz);
  m.rotation.set(tilt, alongX ? 0 : Math.PI / 2, 0);
  m.updateMatrixWorld(true);
  b.add(m, { cast: false });
  // the eaves' thick edge and the ridge's dark cap
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(L - S * 0.7 + 0.5, 0.34, 0.5), V.ridge);
  ridge.position.set(0, rise + 0.1, 0);
  m.add(ridge);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(L, 0.22, 0.24), V.ridge);
    e.position.set(0, 0.02, (s * S) / 2);
    m.add(e);
  }
  m.updateMatrixWorld(true);
  for (const k of [...m.children]) b.add(k, { cast: false });
}

/** A shoji panel on a wall face: lit paper squared by kumiko. `n` the wall's outward normal axis. */
function shojiPanel(b: LevelBuilder, x: number, y: number, z: number, w: number, h: number, alongX: boolean, out: number): void {
  const t = 0.04;
  const ox = alongX ? 0 : out;
  const oz = alongX ? out : 0;
  box(b, V.shoji, x + ox, y, z + oz, alongX ? w : t, h, alongX ? t : w, 0, false);
  const ox2 = alongX ? 0 : out * 1.4;
  const oz2 = alongX ? out * 1.4 : 0;
  const cols = Math.max(2, Math.round(w / 0.45));
  for (let i = 0; i <= cols; i++) {
    const a = -w / 2 + (i / cols) * w;
    box(b, V.timber, x + ox2 + (alongX ? a : 0), y, z + oz2 + (alongX ? 0 : a), alongX ? 0.04 : 0.04, h, alongX ? 0.04 : 0.04, 0, false);
  }
  for (const dy of [-h / 2, -h / 6, h / 6, h / 2]) box(b, V.timber, x + ox2, y + dy, z + oz2, alongX ? w : 0.04, 0.04, alongX ? 0.04 : w, 0, false);
}

// ---------------------------------------------------------------------------------------------------------------------
// a house
// ---------------------------------------------------------------------------------------------------------------------

const WALL_H = 3.2;

function house(c: Ctx, hs: (typeof VILLAGE_HOUSES)[number], seed: number): void {
  const { b } = c;
  const y = DEEP_Y;
  const r = rnd(seed);
  const w = hs.x1 - hs.x0;
  const d = hs.z1 - hs.z0;
  const cx = (hs.x0 + hs.x1) / 2;
  const cz = (hs.z0 + hs.z1) / 2;
  // the walls (colliders from y 0), a dark timber ceiling and the roof collider that makes it indoors
  shell(c, hs, y, WALL_H, { doors: [{ side: hs.door, at: hs.at, w: 1.8 }], wall: V.mud, roof: V.timber, thick: 0.28, tag: 'village-house' });
  // stone footing course round the foot of the walls (flush outside, knee-low, not walked on)
  for (const [x, z, sx, sz] of [[cx, hs.z0, w + 0.5, 0.5], [cx, hs.z1, w + 0.5, 0.5], [hs.x0, cz, 0.5, d + 0.5], [hs.x1, cz, 0.5, d + 0.5]] as const) box(b, V.stoneDark, x, y + 0.2, z, sx, 0.4, sz, 0, false);
  // the timber frame: posts every ~2.4 m, sill and head beams, a mid rail
  const post = (x: number, z: number): void => void box(b, V.timber, x, y + WALL_H / 2, z, 0.26, WALL_H, 0.26, 0, false);
  for (const [ax, az, ex, ez] of [[hs.x0, hs.z0, hs.x1, hs.z0], [hs.x0, hs.z1, hs.x1, hs.z1], [hs.x0, hs.z0, hs.x0, hs.z1], [hs.x1, hs.z0, hs.x1, hs.z1]] as const) {
    const len = Math.hypot(ex - ax, ez - az);
    const n = Math.max(2, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) post(ax + ((ex - ax) * i) / n, az + ((ez - az) * i) / n);
    const mx = (ax + ex) / 2;
    const mz = (az + ez) / 2;
    const alongX = az === ez;
    for (const hy of [0.45, 2.1, WALL_H - 0.12]) box(b, V.timber, mx, y + hy, mz, alongX ? len + 0.2 : 0.34, 0.2, alongX ? 0.34 : len + 0.2, 0, false);
  }
  // lit shoji on every side (both faces of the wall: they glow out to the lane and in to the room)
  const sides: { side: Side; alongX: boolean; x0: number; z0: number; len: number; out: number }[] = [
    { side: 'N', alongX: true, x0: hs.x0, z0: hs.z0, len: w, out: -0.18 },
    { side: 'S', alongX: true, x0: hs.x0, z0: hs.z1, len: w, out: 0.18 },
    { side: 'W', alongX: false, x0: hs.x0, z0: hs.z0, len: d, out: -0.18 },
    { side: 'E', alongX: false, x0: hs.x1, z0: hs.z0, len: d, out: 0.18 },
  ];
  for (const s of sides) {
    const spots = s.side === hs.door ? [hs.at - 2.6, hs.at + 2.6] : [s.len * 0.3, s.len * 0.72];
    for (const a of spots) {
      if (a < 1.2 || a > s.len - 1.2) continue;
      if (r() < 0.2 && s.side !== hs.door) continue;
      const x = s.alongX ? s.x0 + a : s.x0;
      const z = s.alongX ? s.z0 : s.z0 + a;
      shojiPanel(b, x, y + 1.45, z, 1.7, 1.2, s.alongX, s.out);
      shojiPanel(b, x, y + 1.45, z, 1.7, 1.2, s.alongX, -s.out);
    }
  }
  // the engawa on the door side: a plank deck flush with the lane, eave posts at its corners, a lantern by the door
  const door = sides.find((s) => s.side === hs.door)!;
  const sgn = Math.sign(door.out);
  if (door.alongX) {
    const z = door.z0 + sgn * 0.9;
    box(b, H.woodDark, cx, y + 0.04, z, w, 0.06, 1.3, 0, false);
    for (const x of [hs.x0 + 0.2, hs.x1 - 0.2]) {
      box(b, V.timber, x, y + WALL_H / 2, door.z0 + sgn * 1.45, 0.2, WALL_H, 0.2, 0, false);
      solid(c, x, door.z0 + sgn * 1.45, 0.22, 0.22, y + WALL_H, 'engawa-post', { surface: 'wood' });
    }
    lantern(b, hs.x0 + hs.at + 1.3, y + 2.6, door.z0 + sgn * 0.7, 0.8);
  } else {
    const x = door.x0 + sgn * 0.9;
    box(b, H.woodDark, x, y + 0.04, cz, 1.3, 0.06, d, 0, false);
    for (const z of [hs.z0 + 0.2, hs.z1 - 0.2]) {
      box(b, V.timber, door.x0 + sgn * 1.45, y + WALL_H / 2, z, 0.2, WALL_H, 0.2, 0, false);
      solid(c, door.x0 + sgn * 1.45, z, 0.22, 0.22, y + WALL_H, 'engawa-post', { surface: 'wood' });
    }
    lantern(b, door.x0 + sgn * 0.7, y + 2.6, hs.z0 + hs.at + 1.3, 0.8);
  }
  // the roof: deep eaves over the engawa, tiles, a dark ridge
  hipRoof(b, cx, y + WALL_H + 0.2, cz, w + 3.2, d + 3.2);
  // inside: tatami on a wooden floor (an earthen doma by the door), the room's things
  box(b, H.woodDark, cx, y + 0.02, cz, w - 0.5, 0.04, d - 0.5, 0, false);
  const mats = Math.floor((w - 1.6) / 1.8);
  const rows = Math.floor((d - 1.6) / 0.9);
  for (let i = 0; i < mats; i++) for (let j = 0; j < rows; j++) box(b, H.tatami, cx - (mats * 1.8) / 2 + 0.9 + i * 1.8, y + 0.05, cz - (rows * 0.9) / 2 + 0.45 + j * 0.9, 1.74, 0.03, 0.84, 0, false);
  dress(c, hs, r);
}

/** Things against a house's walls (kept off the doorway's line and 2 m clear of the middle). */
function dress(c: Ctx, hs: (typeof VILLAGE_HOUSES)[number], r: () => number): void {
  const { b } = c;
  const y = DEEP_Y;
  const cx = (hs.x0 + hs.x1) / 2;
  const cz = (hs.z0 + hs.z1) / 2;
  // the wall opposite the door (where the tokonoma and the chests go)
  const back: Side = hs.door === 'N' ? 'S' : hs.door === 'S' ? 'N' : hs.door === 'E' ? 'W' : 'E';
  const at = (s: Side, along: number, inset: number): { x: number; z: number; rot: number } => {
    if (s === 'N') return { x: hs.x0 + along, z: hs.z0 + inset, rot: 0 };
    if (s === 'S') return { x: hs.x0 + along, z: hs.z1 - inset, rot: 0 };
    if (s === 'W') return { x: hs.x0 + inset, z: hs.z0 + along, rot: Math.PI / 2 };
    return { x: hs.x1 - inset, z: hs.z0 + along, rot: Math.PI / 2 };
  };
  const len = (s: Side): number => (s === 'N' || s === 'S' ? hs.x1 - hs.x0 : hs.z1 - hs.z0);
  // a tansu chest of drawers
  const tansu = (s: Side, along: number): void => {
    const p = at(s, along, 0.5);
    block(c, H.wood, p.x, y, p.z, 1.3, 1.2, 0.5, 'tansu', { rot: p.rot });
    for (const dy of [0.25, 0.6, 0.95]) box(b, V.timber, p.x, y + dy, p.z, p.rot ? 0.52 : 1.2, 0.04, p.rot ? 1.2 : 0.52, p.rot, false);
  };
  // folded futon stacked against a wall
  const futon = (s: Side, along: number): void => {
    const p = at(s, along, 0.6);
    for (let k = 0; k < 3; k++) box(b, k === 1 ? V.indigo : H.white, p.x, y + 0.13 + k * 0.17, p.z, p.rot ? 0.9 : 1.4, 0.16, p.rot ? 1.4 : 0.9, p.rot, false);
    solid(c, p.x, p.z, p.rot ? 0.9 : 1.4, p.rot ? 1.4 : 0.9, y + 0.6, 'futon', { shots: false, rot: 0 });
  };
  // the kamidana: a little shelf shrine high on the back wall
  const kamidana = (s: Side, along: number): void => {
    const p = at(s, along, 0.25);
    box(b, H.woodPale, p.x, y + 2.3, p.z, p.rot ? 0.4 : 1.2, 0.06, p.rot ? 1.2 : 0.4, 0, false);
    box(b, H.woodPale, p.x, y + 2.5, p.z, p.rot ? 0.3 : 0.5, 0.36, p.rot ? 0.5 : 0.3, 0, false);
    box(b, V.ridge, p.x, y + 2.72, p.z, p.rot ? 0.42 : 0.66, 0.08, p.rot ? 0.66 : 0.42, 0, false);
  };
  // a low table with bowls, cushions round it
  const table = (x: number, z: number): void => {
    block(c, H.woodDark, x, y, z, 1.4, 0.36, 0.9, 'chabudai', { shots: false });
    for (const [dx, dz] of [[-0.35, 0], [0.3, 0.15]] as const) cyl(b, V.lacquer, x + dx, y + 0.36, z + dz, 0.12, 0.08, 0.08, 8, false);
    for (const [dx, dz] of [[0, -0.9], [0, 0.9], [-1.1, 0]] as const) box(b, V.indigo, x + dx, y + 0.1, z + dz, 0.6, 0.1, 0.6, 0, false);
  };
  kamidana(back, len(back) / 2);
  if (hs.kind === 'hearth') {
    // the irori: a sunken square hearth in a wooden frame, ash and embers, the pot on its hook from the beam above
    const he = DEEP_SPOTS.hearth;
    const ix = he.x;
    const iz = he.z + 1.7;
    box(b, H.woodDark, ix, y + 0.12, iz, 1.7, 0.24, 1.7, 0, false);
    box(b, V.stoneDark, ix, y + 0.2, iz, 1.3, 0.1, 1.3, 0, false);
    for (const [dx, dz] of [[-0.2, 0.1], [0.15, -0.15], [0.05, 0.25], [-0.1, -0.2]] as const) box(b, V.lantern, ix + dx, y + 0.28, iz + dz, 0.22, 0.08, 0.1, dx * 3, false);
    rod(b, H.iron, P(ix, y + WALL_H, iz), P(ix, y + 1.25, iz), 0.035);
    box(b, H.woodDark, ix, y + 1.6, iz, 0.5, 0.1, 0.08, 0, false);
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), H.iron);
    pot.position.set(ix, y + 0.75, iz);
    pot.rotation.x = Math.PI;
    pot.updateMatrixWorld(true);
    b.add(pot, { cast: false });
    cyl(b, H.iron, ix, y + 0.74, iz, 0.36, 0.36, 0.06, 12, false);
    solid(c, ix, iz, 1.7, 1.7, y + 0.3, 'irori', { shots: false });
    // a kettle, bowls on a tray, the rice pot, the water jar (mizugame) by the wall
    cyl(b, H.iron, ix + 1.1, y + 0.05, iz + 0.7, 0.16, 0.18, 0.24, 10, false);
    table(he.x - 3.2, he.z + 2.2);
    const jar = at('E', 9, 0.6);
    cyl(b, V.clay, jar.x, y, jar.z, 0.32, 0.4, 0.8, 10, false);
    solid(c, jar.x, jar.z, 0.8, 0.8, y + 0.8, 'mizugame', { shots: false });
    tansu('W', 3);
    tansu('S', 3);
    // shelves of bowls by the kitchen side
    const sh = at('E', 4, 0.3);
    block(c, H.wood, sh.x, y, sh.z, 0.4, 1.8, 1.8, 'shelf');
    for (const dy of [0.7, 1.2, 1.7]) for (const dz of [-0.5, 0, 0.5]) cyl(b, k(dy) ? V.lacquer : H.white, sh.x - 0.1, y + dy, sh.z + dz, 0.12, 0.07, 0.08, 8, false);
  } else if (hs.kind === 'mio') {
    // Mio's house: her kimono on its stand behind where the rice ball waits in its sleeve, futon laid out, a doll, a mirror
    const rb = DEEP_SPOTS.riceball;
    const kz = rb.z - 2.4;
    for (const s of [-1, 1]) box(b, H.woodDark, rb.x + s * 1.1, y + 0.9, kz, 0.08, 1.8, 0.08, 0, false);
    box(b, H.woodDark, rb.x, y + 1.75, kz, 2.6, 0.08, 0.08, 0, false);
    box(b, H.woodDark, rb.x, y + 0.08, kz, 2.4, 0.06, 0.4, 0, false);
    // the kimono hung across the bar, its sleeves wide (a faded peach-and-indigo)
    box(b, std(0x8a4a58, 0.85), rb.x, y + 1.15, kz + 0.05, 2.2, 1.2, 0.04, 0, false);
    box(b, V.indigo, rb.x, y + 1.15, kz + 0.08, 0.5, 1.2, 0.02, 0, false);
    solid(c, rb.x, kz, 2.6, 0.5, y + 1.8, 'ikou', { shots: false });
    // the sleeve's end hangs low and holds something wrapped (the rice ball the story finds there)
    box(b, std(0x8a4a58, 0.85), rb.x + 0.9, y + 0.62, kz + 0.12, 0.5, 0.36, 0.14, 0, false);
    // her futon laid out, the pillow, a small doll on it
    const fx = hs.x0 + 2;
    box(b, H.white, fx, y + 0.1, rb.z + 1, 1.1, 0.12, 2.1, 0, false);
    box(b, std(0x8a4a58, 0.85), fx, y + 0.18, rb.z + 1.3, 1.15, 0.06, 1.4, 0, false);
    box(b, V.straw, fx, y + 0.18, rb.z + 0.15, 0.5, 0.14, 0.24, 0, false);
    cyl(b, H.red, fx + 0.3, y + 0.24, rb.z + 1.9, 0.07, 0.1, 0.22, 8, false);
    box(b, H.white, fx + 0.3, y + 0.5, rb.z + 1.9, 0.11, 0.11, 0.11, 0, false);
    // the mirror stand and comb box (kyōdai) by the wall
    const ky = at('E', 7, 0.5);
    block(c, V.lacquer, ky.x, y, ky.z, 0.5, 0.5, 0.7, 'kyodai', { shots: false });
    box(b, H.steel, ky.x - 0.05, y + 0.9, ky.z, 0.04, 0.6, 0.45, 0, false);
    tansu('N', 2.2);
    tansu('N', 9.8);
  } else if (hs.kind === 'tape') {
    // the house Genzō came back to: his reel recorder on a crate, a lamp, his work clothes on a peg
    const t = TAPES[4]!;
    block(c, H.wood, t.x + 2.6, y, t.z - 3.6, 1, 0.7, 0.8, 'crate', { shots: false });
    box(b, H.iron, t.x + 2.6, y + 0.82, t.z - 3.6, 0.6, 0.22, 0.4, 0, false);
    for (const dx of [-0.15, 0.15]) cyl(b, H.steel, t.x + 2.6 + dx, y + 0.95, t.z - 3.6, 0.12, 0.12, 0.03, 12, false);
    box(b, std(0x4a4a3a, 0.9), hs.x0 + 0.3, y + 1.6, t.z - 4, 0.06, 1.1, 0.6, 0, false);
    tansu('N', 3);
    futon('W', 3);
    table(t.x - 2.8, t.z - 5);
  } else if (hs.kind === 'store') {
    // rice bales (tawara) stacked, barrels of miso, a cart
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        const x = hs.x1 - 1.2 - j * 1.4;
        const z = hs.z0 + 1.5 + i * 1.1;
        const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10).rotateX(Math.PI / 2).rotateY(Math.PI / 2), V.straw);
        bale.position.set(x, y + 0.45 + (i % 2) * 0.0, z);
        bale.updateMatrixWorld(true);
        b.add(bale, { cast: false });
        if (j === 0 && i < 3) {
          const top = bale.clone();
          top.position.y += 0.85;
          top.updateMatrixWorld(true);
          b.add(top, { cast: false });
        }
      }
    }
    solid(c, hs.x1 - 1.9, hs.z0 + 3.15, 2.6, 4.4, y + 1.4, 'tawara', { shots: false });
    for (const dz of [0, 1.1]) {
      cyl(b, H.wood, hs.x0 + 1.4, y, hs.z1 - 1.4 - dz, 0.42, 0.42, 0.9, 10, false);
      solid(c, hs.x0 + 1.4, hs.z1 - 1.4 - dz, 0.9, 0.9, y + 0.9, 'miso', { shots: false });
    }
  } else if (hs.kind === 'nets') {
    // a fisherman's house from before the village went under: nets on poles, floats, a creel
    for (const dz of [2.2, 5, 7.8]) {
      box(b, std(0x3a3a2e, 0.95), hs.x0 + 0.35, y + 1.4, hs.z0 + dz, 0.08, 2.2, 2.2, 0, false);
      for (let k = 0; k < 3; k++) cyl(b, std(0x6a8a8a, 0.4), hs.x0 + 0.45, y + 2.2 - k * 0.6, hs.z0 + dz - 0.6 + k * 0.6, 0.11, 0.11, 0.2, 8, false);
    }
    cyl(b, V.straw, hs.x0 + 2, y, hs.z1 - 1, 0.35, 0.28, 0.6, 10, false);
    solid(c, hs.x0 + 2, hs.z1 - 1, 0.8, 0.8, y + 0.6, 'creel', { shots: false });
    tansu('N', 6);
    futon('S', 7);
    table(cx + 0.5, cz);
  } else {
    tansu(back, len(back) * 0.25);
    futon(back, len(back) * 0.75);
    table(cx, cz);
  }
}
const k = (v: number): boolean => Math.round(v * 10) % 2 === 0;

// ---------------------------------------------------------------------------------------------------------------------
// the village round the houses
// ---------------------------------------------------------------------------------------------------------------------

/** The Bon altar (shōryōdana) with its offerings: grapes on a plate, the cucumber horse and the aubergine ox. */
function bonAltar(c: Ctx): void {
  const { b } = c;
  const y = DEEP_Y;
  const g = DEEP_SPOTS.grapes;
  const ax = g.x;
  const az = g.z - 1.5;
  block(c, H.woodPale, ax, y, az, 2.2, 0.9, 1, 'bon-altar');
  box(b, V.straw, ax, y + 0.92, az, 2.3, 0.04, 1.1, 0, false);
  // green bamboo at the corners, a straw rope with shide between them, two lanterns
  for (const [dx, dz] of [[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]] as const) cyl(b, std(0x5a7a3a, 0.7), ax + dx, y, az + dz, 0.05, 0.05, 2.4, 6, false);
  strawRope(b, P(ax - 1.05, y + 2.3, az - 0.45), P(ax + 1.05, y + 2.3, az - 0.45), 0.15, 3);
  lantern(b, ax - 1.05, y + 2.0, az + 0.45, 0.7);
  lantern(b, ax + 1.05, y + 2.0, az + 0.45, 0.7);
  // grapes on a plate
  cyl(b, H.white, ax, y + 0.94, az + 0.1, 0.32, 0.26, 0.04, 12, false);
  const r = rnd(511);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), V.grape);
    m.position.set(ax - 0.1 + (r() - 0.5) * 0.24, y + 1.0 + (i % 4) * 0.035, az + 0.1 + (r() - 0.5) * 0.24 - (i % 4) * 0.02);
    m.updateMatrixWorld(true);
    b.add(m, { cast: false });
  }
  // the spirit animals: a cucumber horse to come quickly, an aubergine ox to go slowly (sticks for legs)
  for (const [dx, mat, len, r0] of [[-0.65, V.cucumber, 0.34, 0.05], [0.65, V.aubergine, 0.26, 0.08]] as const) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0 * 0.8, len, 8).rotateZ(Math.PI / 2), mat);
    body.position.set(ax + dx, y + 1.06, az);
    body.updateMatrixWorld(true);
    b.add(body, { cast: false });
    for (const [lx, lz] of [[-0.1, -0.04], [0.1, -0.04], [-0.1, 0.04], [0.1, 0.04]] as const) box(b, H.woodPale, ax + dx + lx, y + 0.98, az + lz, 0.015, 0.14, 0.015, 0, false);
  }
  // incense bowl and a pair of small candles
  cyl(b, V.clay, ax + 0.25, y + 0.92, az - 0.3, 0.12, 0.1, 0.1, 8, false);
  for (const dx of [-0.85, 0.85]) box(b, V.lantern, ax + dx, y + 1.02, az - 0.3, 0.05, 0.16, 0.05, 0, false);
}

/** The village shrine: a hokora on a stone plinth, its offering box (the mystery box's stop), a torii, two tōrō. */
function shrine(c: Ctx): void {
  const { b } = c;
  const y = DEEP_Y;
  const s = SHRINES[2]!;
  const hz = s.z - 3.6;
  // the plinth of dressed stone, steps up its front (seen, not climbed: the hokora is waist-high on it)
  block(c, V.stone, s.x, y, hz, 3.2, 0.8, 2.6, 'hokora-plinth');
  box(b, V.stoneDark, s.x, y + 0.2, hz + 1.5, 1.6, 0.4, 0.5, 0, false);
  // the hokora: a little hall of dark wood with a curved roof, a lit lantern of paper inside
  box(b, H.woodDark, s.x, y + 1.6, hz - 0.1, 1.6, 1.6, 1.4, 0, false);
  box(b, V.ink, s.x, y + 1.5, hz + 0.62, 1.0, 1.1, 0.04, 0, false);
  box(b, V.lantern, s.x, y + 1.45, hz + 0.6, 0.3, 0.3, 0.06, 0, false);
  hipRoof(b, s.x, y + 2.4, hz - 0.1, 2.6, 2.4);
  solid(c, s.x, hz, 3.2, 2.6, y + 3.6, 'hokora');
  // the offering box (saisen-bako) at the foot, a bell rope over it
  block(c, H.woodDark, s.x, y, s.z - 1.9, 1.3, 0.75, 0.7, 'saisen', { shots: false });
  for (let i = 0; i < 5; i++) box(b, V.timber, s.x - 0.5 + i * 0.25, y + 0.77, s.z - 1.9, 0.06, 0.04, 0.68, 0, false);
  rod(b, std(0xa0303a, 0.8), P(s.x, y + 3.0, hz + 0.9), P(s.x, y + 1.1, s.z - 2.2), 0.05, 6);
  // the torii on the lane and a straw rope across it; two stone lanterns either side
  torii(c, s.x, y, s.z + 5.5, 4.2, 4.2);
  strawRope(b, P(s.x - 2.1, y + 3.2, s.z + 5.5), P(s.x + 2.1, y + 3.2, s.z + 5.5), 0.3, 4);
  toro(c, s.x - 2.8, y, s.z - 0.6);
  toro(c, s.x + 2.8, y, s.z - 0.6);
}

/** The withered peach tree: a twisted grey trunk, bare boughs, not a leaf (it lives again when the tree below does). */
function peachTree(c: Ctx, bark: THREE.Material): void {
  const { b } = c;
  const { x, y, z } = VILLAGE_PEACH;
  const r = rnd(731);
  b.add(new THREE.Mesh(gnarl([P(x, y - 0.3, z), P(x + 0.4, y + 1.6, z - 0.2), P(x - 0.2, y + 3, z + 0.3), P(x + 0.2, y + 4.2, z)], 0.55, 0.28, 732, { radial: 9, ridges: 0.25 }), bark), { cast: false });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.6;
    const len = 2 + r() * 1.6;
    const y0 = y + 2.6 + r() * 1.2;
    const tip = P(x + Math.cos(a) * len, y0 + 1 + r() * 1.4, z + Math.sin(a) * len);
    b.add(new THREE.Mesh(gnarl([P(x, y0, z), P(x + Math.cos(a) * len * 0.45, y0 + 0.6 + r() * 0.5, z + Math.sin(a) * len * 0.45), tip], 0.2, 0.04, 740 + i, { radial: 6 }), bark), { cast: false });
    // twigs off the tip
    for (let t = 0; t < 2; t++) rod(b, bark, tip, P(tip.x + (r() - 0.5) * 1.2, tip.y + 0.4 + r() * 0.5, tip.z + (r() - 0.5) * 1.2), 0.025, 4);
  }
  // a ring of stones and a rope round the trunk (it was revered), fallen dry leaves
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    box(b, V.stone, x + Math.cos(a) * 1.3, y + 0.15, z + Math.sin(a) * 1.3, 0.5, 0.3, 0.4, a, false);
  }
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) ring.push(P(x + 0.05 + Math.cos((i / 10) * Math.PI * 2) * 0.6, y + 1.5, z + Math.sin((i / 10) * Math.PI * 2) * 0.6));
  for (let i = 0; i < 10; i++) rod(b, V.straw, ring[i]!, ring[i + 1]!, 0.06, 6);
  solid(c, x, z, 3, 3, y + 0.35, 'peach-ring', { shots: false });
  solid(c, x, z, 1.1, 1.1, y + 4.5, 'peach-tree', { surface: 'wood' });
}

/** The well: a stone ring, a little roof on two posts, the pulley, a bucket on the rim. */
function well(c: Ctx, x: number, z: number): void {
  const { b } = c;
  const y = DEEP_Y;
  cyl(b, V.stone, x, y, z, 1.15, 1.25, 0.85, 14, false);
  cyl(b, V.ink, x, y + 0.86, z, 0.9, 0.9, 0.02, 14, false);
  for (const s of [-1, 1]) box(b, H.woodDark, x + s * 1.2, y + 1.4, z, 0.16, 2.8, 0.16, 0, false);
  box(b, H.woodDark, x, y + 2.7, z, 2.6, 0.14, 0.14, 0, false);
  cyl(b, H.iron, x, y + 2.45, z, 0.16, 0.16, 0.12, 10, false);
  rod(b, V.straw, P(x, y + 2.4, z), P(x, y + 1.2, z), 0.015, 4);
  cyl(b, H.wood, x + 0.85, y + 0.86, z + 0.5, 0.18, 0.15, 0.28, 8, false);
  const roof = new THREE.Mesh(hip(3.2, 1.8, 3.0, 0.7), V.tile);
  roof.position.set(x, y + 2.85, z);
  roof.updateMatrixWorld(true);
  b.add(roof, { cast: false });
  solid(c, x, z, 2.5, 2.5, y + 0.9, 'well', { shots: false });
  for (const s of [-1, 1]) solid(c, x + s * 1.2, z, 0.2, 0.2, y + 2.8, 'well-post', { surface: 'wood' });
}

/** The paddy: a field of rice gone grey, dikes between the plots, stalks in rows, a scarecrow left standing. */
function paddy(c: Ctx, x0: number, z0: number, x1: number, z1: number): void {
  const { b } = c;
  const y = DEEP_Y;
  box(b, V.mudField, (x0 + x1) / 2, y + 0.02, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, 0, false);
  for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 3) box(b, V.flag, x, y + 0.07, (z0 + z1) / 2, 0.4, 0.12, z1 - z0, 0, false);
  box(b, V.flag, (x0 + x1) / 2, y + 0.07, z0, x1 - x0, 0.12, 0.4, 0, false);
  box(b, V.flag, (x0 + x1) / 2, y + 0.07, z1, x1 - x0, 0.12, 0.4, 0, false);
  const r = rnd(771);
  const tuft = new THREE.ConeGeometry(0.06, 0.5, 4);
  const set = b.instanced('village-rice', tuft, V.strawGrey, { cast: false });
  for (let x = x0 + 0.8; x < x1 - 0.5; x += 0.75) {
    for (let z = z0 + 0.8; z < z1 - 0.5; z += 0.75) {
      if (r() < 0.12) continue;
      const lean = r();
      set.add(x + (r() - 0.5) * 0.2, y + 0.24, z + (r() - 0.5) * 0.2, lean * 6, 1, 0.7 + r() * 0.5, 1);
    }
  }
  // the scarecrow (kakashi): a pole, a cross-bar, a straw hat, a ragged coat
  const sx = x0 + (x1 - x0) * 0.62;
  const sz = (z0 + z1) / 2;
  box(b, H.woodDark, sx, y + 1, sz, 0.1, 2, 0.1, 0, false);
  box(b, H.woodDark, sx, y + 1.5, sz, 1.6, 0.08, 0.08, 0, false);
  box(b, std(0x3a4048, 0.95), sx, y + 1.3, sz, 0.7, 0.7, 0.2, 0, false);
  cyl(b, V.straw, sx, y + 2.0, sz, 0.05, 0.45, 0.22, 10, false);
  solid(c, sx, sz, 0.2, 0.2, y + 2.1, 'kakashi', { shots: false });
}

/** The waterfall out of the north wall into a stone-rimmed pool (the pool is fenced by its rocks: not walked in). */
function waterfall(c: Ctx, D: ReturnType<typeof dressMats>): void {
  const { b } = c;
  const y = DEEP_Y;
  const x = 457;
  box(b, V.fall, x, y + 9.2, -67.7, 2.2, 18, 0.12, 0, false);
  box(b, V.fall, x + 0.5, y + 7, -67.55, 0.8, 14, 0.06, 0, false);
  // the pool against the wall, its rim of rocks, water still under the fall
  box(b, V.pool, x, y + 0.12, -64.5, 9, 0.04, 6.6, 0, false);
  const r = rnd(781);
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const a = Math.PI * t;
    crag(b, D.rock, { x: x + Math.cos(a) * 4.8, y: y + 0.25, z: -67.8 + Math.sin(a) * 3.8, sx: 0.8 + r() * 0.5, sy: 0.45 + r() * 0.3, sz: 0.7 + r() * 0.4, seed: 790 + i, detail: 1, tone: [0.05, 0.05, 0.07] });
  }
  solid(c, x, -64.4, 10.6, 7.2, y + 0.7, 'pool', { shots: false });
  // a plank bridge over the stream where it leaves the pool (seen: the stream runs under the flagstones to the well)
  box(b, V.pool, x, y + 0.03, -57.5, 1.2, 0.02, 6, 0, false);
}

/** A house half swallowed by the cave: a tilted roof and a broken façade sunk into the rock against a wall. */
function sunkenHouse(c: Ctx, x: number, z: number, w: number, d: number, tilt: number, wall: Side, high = 0): void {
  const { b } = c;
  const y = DEEP_Y + high;
  // the façade: mud and timber, a lit shoji or two, half buried
  const alongX = wall === 'N' || wall === 'S';
  const face = wall === 'N' ? z + d / 2 : wall === 'S' ? z - d / 2 : wall === 'W' ? x + w / 2 : x - w / 2;
  if (alongX) {
    box(b, V.mud, x, y + 1.6, face, w, 3.2, 0.3, 0, false);
    for (const dx of [-w / 2, -w / 6, w / 6, w / 2]) box(b, V.timber, x + dx, y + 1.6, face, 0.26, 3.2, 0.36, 0, false);
    shojiPanel(b, x - w / 4, y + 1.6, face, 1.6, 1.1, true, wall === 'N' ? 0.18 : -0.18);
  } else {
    box(b, V.mud, face, y + 1.6, z, 0.3, 3.2, d, 0, false);
    for (const dz of [-d / 2, -d / 6, d / 6, d / 2]) box(b, V.timber, face, y + 1.6, z + dz, 0.36, 3.2, 0.26, 0, false);
    shojiPanel(b, face, y + 1.6, z + d / 4, 1.6, 1.1, false, wall === 'W' ? 0.18 : -0.18);
  }
  box(b, V.timber, alongX ? x : face, y + 3.2, alongX ? face : z, alongX ? w + 0.4 : 0.4, 0.24, alongX ? 0.4 : d + 0.4, 0, false);
  const roof = new THREE.Mesh(hip(alongX ? w + 2.4 : d + 2.4, (alongX ? d : w) + 2.4, (alongX ? w : d) * 0.6, 2.4), V.tile);
  roof.position.set(x, y + 3.3, z);
  roof.rotation.set(alongX ? tilt : 0, alongX ? 0 : Math.PI / 2, alongX ? 0 : tilt);
  roof.updateMatrixWorld(true);
  b.add(roof, { cast: false });
  // rubble and the rock it sinks into
  const D = dressMats(c.mats);
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3 - 0.5;
    crag(b, D.rock, { x: alongX ? x + t * w : x + (wall === 'W' ? -w * 0.2 : w * 0.2), y: y + 4.6, z: alongX ? z + (wall === 'N' ? -d * 0.2 : d * 0.2) : z + t * d, sx: 2.4, sy: 2.6, sz: 2.2, seed: Math.round(x * 7 + z * 3 + i), detail: 1, tone: [0.04, 0.042, 0.07] });
  }
  if (!high) solid(c, x, z, w, d, y + 3.4, 'sunken-house', { kind: 'building' });
}

/** Rock pushed out of a wall (crags flush with it), and its collider back to the wall. */
function wallRock(c: Ctx, D: ReturnType<typeof dressMats>, x0: number, z0: number, x1: number, z1: number, seed: number): void {
  const r = rnd(seed);
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(1, Math.round(len / 3.2));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = alongX ? x0 + (x1 - x0) * t : (x0 + x1) / 2;
    const z = alongX ? (z0 + z1) / 2 : z0 + (z1 - z0) * t;
    crag(c.b, D.rock, { x, y: DEEP_Y + 0.6 + r() * 1.5, z, sx: alongX ? 2 + r() : 0.9, sy: 1.6 + r() * 2.2, sz: alongX ? 0.9 : 2 + r(), seed: seed + i, detail: 1, tone: [0.04, 0.042, 0.075] });
  }
  solid(c, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), DEEP_Y + 3, 'village-rock');
}

// ---------------------------------------------------------------------------------------------------------------------

export function buildVillage(c: Ctx): void {
  const { b } = c;
  const y = DEEP_Y;
  const D = dressMats(c.mats);
  const bark = std(0x6a625a, 0.95);

  // the lanes: flagstones from the drift's mouth round the village (seen on the cave floor)
  const r = rnd(5501);
  const lanes: [number, number, number, number][] = [
    [437, -6, 437, -46],
    [437, -44.5, 492, -44.5],
    [437, -25, 512, -25],
    [458, -44.5, 458, -60],
    [420, -36, 442, -36],
    [488, -22, 488, -8],
  ];
  for (const [ax, az, ex, ez] of lanes) {
    const len = Math.hypot(ex - ax, ez - az);
    for (let s = 0; s < len; s += 1.1) {
      const t = s / len;
      const x = ax + (ex - ax) * t + (r() - 0.5) * 0.4;
      const z = az + (ez - az) * t + (r() - 0.5) * 0.4;
      box(b, V.flag, x, y + 0.03, z, 0.8 + r() * 0.4, 0.05, 0.6 + r() * 0.3, r() * 0.6, false);
    }
  }

  // the entrance: a red torii and two stone lanterns at the drift's mouth
  torii(c, 437, y, -9, 4.4, 4.4);
  strawRope(b, P(434.8, y + 3.4, -9), P(439.2, y + 3.4, -9), 0.3, 4);
  toro(c, 433.2, y, -11.5);
  toro(c, 441, y, -11.5);

  VILLAGE_HOUSES.forEach((h, i) => house(c, h, 5600 + i * 13));
  // firewood stacked behind the westmost house, filling the gap to the rock
  {
    const h = VILLAGE_HOUSES[6]!;
    for (let k2 = 0; k2 < 4; k2++) {
      const log = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, h.z1 - h.z0 - 0.4), H.wood);
      log.position.set(420.9 + (k2 % 2) * 0.05, y + 0.2 + k2 * 0.36, (h.z0 + h.z1) / 2);
      log.updateMatrixWorld(true);
      b.add(log, { cast: false });
    }
    solid(c, 421, (h.z0 + h.z1) / 2, 2, h.z1 - h.z0, y + 1.5, 'woodpile', { shots: false });
  }
  bonAltar(c);
  shrine(c);
  peachTree(c, bark);
  well(c, 458, -50);
  paddy(c, 490, -49.5, 513, -42.5);
  waterfall(c, D);

  // houses the cave swallowed: sunk into the walls, and two high on ledges with their shoji still lit
  sunkenHouse(c, 514, -58, 4, 9, 0.18, 'E');
  sunkenHouse(c, 485, -66, 9, 4, -0.2, 'N');
  sunkenHouse(c, 470, -6, 8, 4, 0.16, 'S');
  sunkenHouse(c, 433, -66.5, 8, 3, 0.12, 'N', 7.5);
  sunkenHouse(c, 514.5, -24, 3, 9, -0.1, 'E', 6);
  // rock spilling from the walls between them
  wallRock(c, D, 420, -50, 421.2, -44, 5701);
  wallRock(c, D, 444, -68, 451.6, -66.6, 5702);
  wallRock(c, D, 514.8, -46, 516, -40, 5703);
  wallRock(c, D, 452, -5.2, 465, -4, 5704);
  wallRock(c, D, 478, -5.2, 490, -4, 5705);

  // straw ropes with shide across the lanes, between the eaves
  strawRope(b, P(437.5, y + 5.6, -24), P(463.5, y + 5.6, -31), 0.8, 7);
  strawRope(b, P(452.5, y + 5.2, -37), P(463.5, y + 5.2, -40), 0.5, 4);
  strawRope(b, P(476.5, y + 5.4, -42), P(499.5, y + 5.4, -38), 0.7, 6);
  strawRope(b, P(437.5, y + 5.6, -50), P(475.5, y + 5.6, -50), 1, 8);
  strawRope(b, P(488.5, y + 5.4, -48), P(497.5, y + 5.4, -24), 0.8, 6);
  strawRope(b, P(426, y + 6, -10), P(497.5, y + 6, -13), 1.2, 14);

  // the Bon lanterns: floating in the dark all over the cavern, a few low along the lanes
  const lr = rnd(5801);
  for (let i = 0; i < 46; i++) {
    const x = 424 + lr() * 88;
    const z = -66 + lr() * 58;
    const hgt = i < 12 ? 4.2 + lr() * 1.4 : 6.5 + lr() * 10;
    lantern(b, x, y + hgt, z, i < 12 ? 0.8 : 0.9 + lr() * 0.5);
  }

  // light: the hearth's fire, lamps in the lit houses, the lanterns' glow over the lanes, the cave's indigo over all
  const he = DEEP_SPOTS.hearth;
  b.light({ x: he.x, y: y + 1, z: he.z + 1.7, color: 0xff6a28, intensity: 22, distance: 9, mode: 'flicker', glow: 0.5, indoor: true, tag: 'hearth' });
  b.light({ x: DEEP_SPOTS.riceball.x, y: y + 2.4, z: DEEP_SPOTS.riceball.z, color: 0xffa060, intensity: 10, distance: 8, mode: 'steady', indoor: true, tag: 'mio-house' });
  b.light({ x: TAPES[4]!.x, y: y + 2.4, z: TAPES[4]!.z - 3, color: 0xffa060, intensity: 10, distance: 8, mode: 'flicker', indoor: true, tag: 'tape-house' });
  b.light({ x: 437, y: y + 3.5, z: -12, color: 0xff8a40, intensity: 24, distance: 14, mode: 'flicker', glow: 0.4, tag: 'village-gate' });
  b.light({ x: DEEP_SPOTS.grapes.x, y: y + 3, z: DEEP_SPOTS.grapes.z - 1, color: 0xff8a40, intensity: 18, distance: 12, mode: 'flicker', glow: 0.3, tag: 'bon-altar' });
  b.light({ x: SHRINES[2]!.x, y: y + 3.4, z: SHRINES[2]!.z - 1, color: 0xff8a40, intensity: 20, distance: 13, mode: 'flicker', glow: 0.3, tag: 'village-shrine' });
  b.light({ x: 458, y: y + 4.5, z: -48, color: 0xff9a50, intensity: 30, distance: 18, mode: 'flicker', glow: 0.3, tag: 'village' });
  b.light({ x: 428, y: y + 4.5, z: -40, color: 0xff9a50, intensity: 26, distance: 16, mode: 'flicker', glow: 0.3, tag: 'village' });
  b.light({ x: 496, y: y + 4.5, z: -44, color: 0xff9a50, intensity: 28, distance: 18, mode: 'flicker', glow: 0.3, tag: 'village' });
  b.light({ x: 476, y: y + 4.5, z: -14, color: 0xff9a50, intensity: 24, distance: 16, mode: 'flicker', glow: 0.3, tag: 'village' });
  b.light({ x: 457, y: y + 3, z: -63, color: 0x7090c0, intensity: 16, distance: 12, mode: 'steady', tag: 'village-fall' });
  b.light({ x: 446, y: y + 15, z: -36, color: 0x3a42a8, intensity: 60, distance: 44, mode: 'steady', tag: 'village-indigo' });
  b.light({ x: 494, y: y + 15, z: -36, color: 0x3a42a8, intensity: 60, distance: 44, mode: 'steady', tag: 'village-indigo' });
}
