/**
 * AURELIA: Higan, the other shore. A round river valley with nothing square about it: the riverbank runs round the
 * outside, three stone terraces climb in rings to the Phoenix Shrine on the summit, and a cliff closes the back.
 *
 *   ring 0  the riverbank (y 0)          the ferry landing (insertion), the west bank LZ, the relay, the black bloom (low)
 *   ring 1  the Lantern Terrace (y 2.4)  stone lanterns, rest pavilions, lily beds (medium)
 *   ring 2  the Shrine Steps (y 4.8)     red lantern posts, torii (medium)
 *   ring 3  the Phoenix Shrine (y 7.2)   the summit pavilion where the boss waits (high)
 *
 * The terraces are raised floors (`ColliderSpec.floor`): thin strips across each disc, a rim round every edge (the
 * retaining wall and its parapet) so nobody walks off or climbs up, and flights of 0.3 m steps through gaps in the rims.
 * Everything outside the valley is filled with rock colliders a row at a time, so the walkable shape is the valley
 * itself and nothing beyond it is a sealed pocket (`tests/levels.test.ts`).
 *
 * Crates, stations, buildings and resident infected (and so the survivors' cages) stay on the riverbank: they are
 * built at ground level. The terraces get their infected from spawn points.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { helipad, transmitterSite, type SpireHandle, type TransmitterHandle } from '../landmarks';
import { barrelGroup, bench, corpse, crateGroup, debris } from '../props';
import { sandbagWall } from '../props/barriers';
import { addBox, building, type Opening } from '../structures';
import type { MaterialName } from '../materials';
import { HALF_PI, type Ctx } from './util';
import { vulcanBanner, vulcanSigilMaterial } from './vulcan';

export const AURELIA_BOUNDS = { minX: -62, maxX: 62, minZ: -40, maxZ: 36 };

const deg = Math.PI / 180;
/** The summit: every ring is centred on it. */
const SUMMIT = { x: 0, z: -24 };
/** The cliff at the back of the valley. */
const BACK_Z = -38;
/** The terraces, bottom up: radius from the summit and floor height. */
const TIERS = [
  { r: 34, y: 2.4 },
  { r: 20, y: 4.8 },
  { r: 9, y: 7.2 },
] as const;
/** Every flight: 8 steps of 0.3 m, 0.55 m deep. */
const STEPS = 8;
const RISE = 0.3;
const TREAD = 0.55;
const RUN = STEPS * TREAD;
/** How high the walls beside each step stand above it, and the stone parapet above its terrace. */
const CHEEK = 0.9;
const PARAPET = 0.9;

/** The flights up: `tier` is the terrace they climb onto, `at` the bearing from the summit (0 = south), `w` the width. */
const STAIRS: readonly { tier: number; at: number; w: number }[] = [
  { tier: 0, at: 0, w: 6 },
  { tier: 0, at: -40, w: 3.6 },
  { tier: 0, at: 40, w: 3.6 },
  { tier: 0, at: -88, w: 3.6 },
  { tier: 0, at: 88, w: 3.6 },
  { tier: 1, at: -30, w: 4 },
  { tier: 1, at: 30, w: 4 },
  { tier: 1, at: -110, w: 3.6 },
  { tier: 2, at: 0, w: 5 },
  { tier: 2, at: 150, w: 3.6 },
];

/** A point `r` from the summit on bearing `a` (radians, 0 = south, toward +x positive). */
function polar(r: number, a: number): { x: number; z: number } {
  return { x: SUMMIT.x + r * Math.sin(a), z: SUMMIT.z + r * Math.cos(a) };
}
/** The same in degrees. */
const P = (r: number, d: number): { x: number; z: number } => polar(r, d * deg);

/** Where the riverbank ends on bearing `a`: a wavy ring, so the valley's edge is never a straight line. */
export function outerRadius(a: number): number {
  return 54 + 4 * Math.sin(3 * a + 0.6) + 2.5 * Math.sin(5 * a);
}

/** Inside the valley (the riverbank and everything above it). */
export function inValley(x: number, z: number): boolean {
  if (z < BACK_Z) return false;
  const dx = x - SUMMIT.x;
  const dz = z - SUMMIT.z;
  return Math.hypot(dx, dz) <= outerRadius(Math.atan2(dx, dz));
}

/** The terraces' shape, for tests and anything else that needs to know where the rings and stairs are. */
export const AURELIA_TERRACES = { summit: SUMMIT, backZ: BACK_Z, tiers: TIERS, stairs: STAIRS, run: RUN, polar };

const LZ = P(44, -52);
const TERMINAL = P(47, -42);
const RELAY = P(44, 52);
const BLOOM = P(40, -100);

export const AURELIA = {
  /** The ferry landing on the south bank, facing up the valley. */
  start: { x: 0, z: 25 },
  lz: { x: LZ.x, z: LZ.z, radius: 8, terminalX: TERMINAL.x, terminalZ: TERMINAL.z },
  /** The river relay on the east bank: power it and hold. */
  relay: { x: RELAY.x, z: RELAY.z, radius: 8 },
  /** The Phoenix Shrine, where the boss waits. */
  shrine: { x: SUMMIT.x, z: SUMMIT.z, y: TIERS[2].y },
  /** The black bloom: the surge comes from here. */
  bloom: BLOOM,
};

// ---------------------------------------------------------------------------------------------
// the valley: its floor, the rock round it, the river and the far shore
// ---------------------------------------------------------------------------------------------

/** A flat shape at height `y` from an outline in world XZ (UVs in metres / `tile`). */
function flatShape(pts: { x: number; z: number }[], y: number, tile: number): THREE.BufferGeometry {
  // shape space (x, -z) turned face up lands back on world (x, z)
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
  const g = new THREE.ShapeGeometry(shape, 1);
  const uv = g.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** A circle round the summit, cut off by the back cliff. */
function ringOutline(r: number, n = 160): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = polar(r, -Math.PI + (i / n) * Math.PI * 2);
    out.push({ x: p.x, z: Math.max(BACK_Z, p.z) });
  }
  return out;
}

/** The valley floor's edge: the wavy riverbank, cut off by the back cliff. */
function valleyOutline(n = 240): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + (i / n) * Math.PI * 2;
    const p = polar(outerRadius(a) + 0.4, a);
    out.push({ x: p.x, z: Math.max(BACK_Z, p.z) });
  }
  return out;
}

/** Rock colliders over everything outside the valley, one 1 m row at a time. */
function valleyEdge(c: Ctx): void {
  const { b } = c;
  const B = AURELIA_BOUNDS;
  const rock = (x0: number, x1: number, z: number): void => {
    if (x1 - x0 < 0.05) return;
    b.collide({ x: (x0 + x1) / 2, z, hx: (x1 - x0) / 2, hz: 0.5, y1: 9, mapKind: 'wall', surface: 'dirt', tag: 'valley-edge' });
  };
  for (let z = B.minZ; z < B.maxZ; z += 1) {
    const zc = z + 0.5;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (let x = B.minX; x <= B.maxX; x += 0.25) {
      if (!inValley(x, zc)) continue;
      if (x < x0) x0 = x;
      x1 = x;
    }
    if (x0 === Infinity) rock(B.minX - 2, B.maxX + 2, zc);
    else {
      rock(B.minX - 2, x0 - 0.1, zc);
      rock(x1 + 0.1, B.maxX + 2, zc);
    }
  }
}

/**
 * The land round the valley: a stone bank, the river (south and round the flanks), cliffs rising toward the back, and
 * across the water the other shore, glowing with lilies nobody can reach.
 */
function surround(c: Ctx): void {
  const { b } = c;
  const N = 240;
  const D = [0, 0.8, 2, 6, 14, 26, 40, 70];
  const smooth = (e0: number, e1: number, v: number): number => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const water = (d: number): number => (d <= 0.8 ? 0.05 : d <= 2 ? -0.9 : d < 26 ? -1.3 : d < 40 ? -1.3 + ((d - 26) / 14) * 1.6 : 0.3 + (d - 40) * 0.01);
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI + (i / N) * Math.PI * 2;
    const R = outerRadius(a);
    const cliff = smooth(58 * deg, 92 * deg, Math.abs(a));
    for (const d of D) {
      const p = polar(R + d, a);
      let h = d <= 0.8 ? 0.05 : cliff * Math.min(22, 3 + d * 0.9) + (1 - cliff) * water(d);
      if (p.z < BACK_Z) h = Math.max(h, 18);
      pos.push(p.x, h, p.z);
      uv.push(p.x / 8, p.z / 8);
    }
  }
  const idx: number[] = [];
  const M = D.length;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < M - 1; k++) {
      const a = i * M + k;
      const bb = (i + 1) * M + k;
      idx.push(a, a + 1, bb, bb, a + 1, bb + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const land = new THREE.Mesh(g, b.mats.get('dirt'));
  land.receiveShadow = true;
  b.add(land, { cast: false });
  // the back cliff: a wall of dark stone behind the shrine, broken up by fallen slabs
  addBox(b, 'concreteDark', 0, 9, BACK_Z - 7, 140, 18, 14, 0, { cast: false });
  let s = 2909;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let x = -60; x <= 60; x += 7) {
    const h = 6 + rand() * 10;
    addBox(b, 'concreteDark', x + rand() * 3, h / 2, BACK_Z - 1.2 - rand() * 1.5, 4 + rand() * 4, h, 3, (rand() - 0.5) * 0.5, { cast: false });
  }
  // the river: still, black, with the red moon in it
  const river = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshStandardMaterial({ color: 0x1a0a10, roughness: 0.1, metalness: 0.65, emissive: 0x14040a, emissiveIntensity: 1 }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, -0.55, 0);
  b.add(river, { cast: false, receive: false });
  // the other shore: a band of lilies glowing across the water, under three torii
  const patches: THREE.BufferGeometry[] = [];
  const quad = new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2);
  for (let i = 0; i < 300; i++) {
    const a = (rand() - 0.5) * 120 * deg;
    const p = polar(outerRadius(a) + 31 + rand() * 12, a);
    patches.push(quad.clone().translate(p.x, 0.6, p.z));
  }
  const field = new THREE.Mesh(mergeGeometries(patches), new THREE.MeshStandardMaterial({ color: 0x5a0814, emissive: 0xc0182e, emissiveIntensity: 0.9, roughness: 1 }));
  b.add(field, { cast: false, receive: false });
  for (const d of [-26, 0, 26]) {
    const a = d * deg;
    const p = polar(outerRadius(a) + 36, a);
    torii(c, p.x, p.z, 0.4, a, 6, false);
  }
}

// ---------------------------------------------------------------------------------------------
// the terraces
// ---------------------------------------------------------------------------------------------

const TOP_MAT: readonly MaterialName[] = ['gravel', 'concreteSlab', 'wood'];

/** A terrace: its floor colliders, its top, its retaining wall and its parapet (with gaps where stairs come up). */
function terrace(c: Ctx, k: number): void {
  const { b } = c;
  const T = TIERS[k]!;
  const yLo = k === 0 ? 0 : TIERS[k - 1]!.y;
  // the floor: strips across the disc, each kept inside the circle along its whole depth
  const strip = 0.3;
  for (let z0 = Math.max(BACK_Z, SUMMIT.z - T.r); z0 < SUMMIT.z + T.r; z0 += strip) {
    const z1 = Math.min(z0 + strip, SUMMIT.z + T.r);
    const dz = Math.max(Math.abs(z0 - SUMMIT.z), Math.abs(z1 - SUMMIT.z));
    if (dz >= T.r) continue;
    const half = Math.sqrt(T.r * T.r - dz * dz);
    if (half < 0.25) continue;
    b.collide({ x: SUMMIT.x, z: (z0 + z1) / 2, hx: half, hz: (z1 - z0) / 2, y0: yLo, y1: T.y, floor: true, surface: k === 2 ? 'wood' : 'concrete', mapKind: 'none', tag: `terrace-${k}` });
  }
  b.add(new THREE.Mesh(flatShape(ringOutline(T.r + 0.3), T.y + 0.002, 4), b.mats.get(TOP_MAT[k]!)), { cast: false });
  // where the circle runs into the back cliff (the summit's does not)
  const ratio = (BACK_Z - SUMMIT.z) / T.r;
  const full = ratio <= -1;
  const lo = full ? -Math.PI : -(Math.acos(ratio) + 0.6 / T.r);
  const hi = full ? Math.PI : Math.acos(ratio) + 0.6 / T.r;
  // the retaining wall
  const face = new THREE.Mesh(new THREE.CylinderGeometry(T.r + 0.3, T.r + 0.3, T.y - yLo, Math.ceil(((hi - lo) * T.r) / 2), 1, true, lo, hi - lo), b.mats.get('concreteDark'));
  face.position.set(SUMMIT.x, (T.y + yLo) / 2, SUMMIT.z);
  b.add(face, { cast: false });
  // the rim, in arcs between the stairs
  const windows = STAIRS.filter((s) => s.tier === k)
    .map((s) => [s.at * deg - (s.w / 2 + 0.15) / T.r, s.at * deg + (s.w / 2 + 0.15) / T.r] as const)
    .sort((p, q) => p[0] - q[0]);
  const arcs: [number, number][] = [];
  let from = lo;
  for (const [wa, wb] of windows) {
    if (wa > from) arcs.push([from, wa]);
    from = wb;
  }
  if (hi > from) arcs.push([from, hi]);
  const stone = k === 0;
  for (const [a, e] of arcs) {
    const n = Math.max(1, Math.ceil(((e - a) * T.r) / 1.6));
    for (let i = 0; i < n; i++) {
      const a0 = a + ((e - a) * i) / n;
      const a1 = a + ((e - a) * (i + 1)) / n;
      const am = (a0 + a1) / 2;
      const chord = 2 * T.r * Math.sin((a1 - a0) / 2);
      const p = polar(T.r * Math.cos((a1 - a0) / 2), am);
      // from the ground up to the top of the parapet (no higher, so nothing invisible stops a shot): nobody walks off
      // the edge or climbs the wall; the red rails let shots through
      b.collide({ x: p.x, z: p.z, hx: chord / 2 + 0.08, hz: 0.3, rot: am, y0: 0, y1: T.y + (stone ? PARAPET : 1), blocksShots: stone, mapKind: 'wall', surface: stone ? 'concrete' : 'wood', tag: 'terrace-rim' });
      if (stone) {
        addBox(b, 'concreteDark', p.x, T.y + PARAPET / 2, p.z, chord + 0.04, PARAPET, 0.42, am);
      } else {
        const q = polar(T.r, a0);
        addBox(b, 'paintRed', q.x, T.y + 0.48, q.z, 0.14, 0.96, 0.14, am);
        addBox(b, 'paintRed', p.x, T.y + 0.9, p.z, chord + 0.04, 0.1, 0.14, am, { cast: false });
        addBox(b, 'paintRed', p.x, T.y + 0.45, p.z, chord + 0.04, 0.08, 0.1, am, { cast: false });
      }
    }
  }
}

/** A flight of steps up onto terrace `s.tier`, walled on both sides, from the lower terrace outward of its edge. */
function stairFlight(c: Ctx, s: { tier: number; at: number; w: number }): void {
  const { b } = c;
  const T = TIERS[s.tier]!;
  const yLo = s.tier === 0 ? 0 : TIERS[s.tier - 1]!.y;
  const a = s.at * deg;
  const mat: MaterialName = s.tier === 2 ? 'wood' : 'concreteSlab';
  const tx = Math.cos(a);
  const tz = -Math.sin(a);
  for (let i = 0; i < STEPS; i++) {
    // step 0 is level with the terrace and reaches under its edge; each next one is a step lower and further out
    const r0 = i === 0 ? T.r - 0.6 : T.r + i * TREAD;
    const r1 = T.r + (i + 1) * TREAD;
    const top = T.y - i * RISE;
    const p = polar((r0 + r1) / 2, a);
    b.collide({ x: p.x, z: p.z, hx: s.w / 2, hz: (r1 - r0) / 2, rot: a, y0: yLo, y1: top, floor: true, surface: s.tier === 2 ? 'wood' : 'concrete', mapKind: 'none', tag: 'terrace-stair' });
    addBox(b, mat, p.x, (yLo + top) / 2, p.z, s.w, top - yLo, r1 - r0, a);
    // the cheeks: a stepped stone wall either side, solid exactly as high as it is drawn (a wall the full height of the
    // terrace all the way down would stop shots and players in the open air over the lower steps)
    for (const side of [-1, 1]) {
      const off = side * (s.w / 2 + 0.15);
      const cx = p.x + tx * off;
      const cz = p.z + tz * off;
      addBox(b, 'concreteDark', cx, (yLo + top + CHEEK) / 2, cz, 0.3, top + CHEEK - yLo, r1 - r0, a, { cast: false });
      b.collide({ x: cx, z: cz, hx: 0.15, hz: (r1 - r0) / 2 + 0.02, rot: a, y0: 0, y1: top + CHEEK, mapKind: 'wall', tag: 'stair-cheek' });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// dressing
// ---------------------------------------------------------------------------------------------

/** A torii across bearing `rot` (its posts `span` apart), standing on height `y`. */
function torii(c: Ctx, x: number, z: number, y: number, rot: number, span: number, solid = true): void {
  const { b } = c;
  const H = 4.4;
  const ax = Math.cos(rot);
  const az = -Math.sin(rot);
  for (const s of [-1, 1]) {
    const px = x + (ax * s * span) / 2;
    const pz = z + (az * s * span) / 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, H, 10), b.mats.get('paintRed'));
    post.position.set(px, y + H / 2, pz);
    b.add(post);
    if (solid) b.collide({ x: px, z: pz, hx: 0.26, hz: 0.26, rot, y0: y, y1: y + H, mapKind: 'prop', surface: 'wood', tag: 'torii' });
  }
  addBox(b, 'paintRed', x, y + H - 0.7, z, span + 0.7, 0.22, 0.3, rot);
  addBox(b, 'paintRed', x, y + H - 0.1, z, span + 1.5, 0.24, 0.4, rot);
  addBox(b, 'paintBlack', x, y + H + 0.16, z, span + 2, 0.24, 0.5, rot);
}

/** A stone lantern (toro) with a flickering flame, standing on height `y`. */
function stoneLantern(c: Ctx, x: number, z: number, y: number, rot: number): void {
  const { b } = c;
  addBox(b, 'concreteSlab', x, y + 0.12, z, 0.7, 0.24, 0.7, rot);
  addBox(b, 'concreteSlab', x, y + 0.6, z, 0.26, 0.74, 0.26, rot);
  addBox(b, 'concreteSlab', x, y + 1.0, z, 0.6, 0.08, 0.6, rot);
  addBox(b, 'lampWarm', x, y + 1.24, z, 0.4, 0.4, 0.4, rot, { cast: false });
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.42, 4), b.mats.get('concreteSlab'));
  cap.position.set(x, y + 1.64, z);
  cap.rotation.y = rot + Math.PI / 4;
  b.add(cap);
  b.collide({ x, z, hx: 0.35, hz: 0.35, rot, y0: y, y1: y + 1.8, mapKind: 'prop', tag: 'toro' });
  b.light({ x, y: y + 1.25, z, color: 0xffa050, intensity: 12, distance: 9, mode: 'flicker', glow: 0.8, pool: 2.4, tag: 'toro' });
}

/** A red post with a paper lantern, standing on height `y`. */
function redLantern(c: Ctx, x: number, z: number, y: number): void {
  const { b } = c;
  addBox(b, 'paintBlack', x, y + 1.2, z, 0.14, 2.4, 0.14);
  addBox(b, 'paintBlack', x, y + 2.35, z + 0.25, 0.08, 0.08, 0.5);
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10), b.mats.get('lampRed'));
  paper.position.set(x, y + 2.0, z + 0.48);
  b.add(paper, { cast: false });
  b.collide({ x, z, hx: 0.12, hz: 0.12, y0: y, y1: y + 2.4, mapKind: 'none', tag: 'lantern-post' });
  b.light({ x, y: y + 2.0, z: z + 0.48, color: 0xff3a3a, intensity: 9, distance: 8, mode: 'pulse', period: 3.2, glow: 0.7, pool: 2, tag: 'chochin' });
}

/** An open rest pavilion (azumaya): four posts and a hipped roof, on height `y`, turned `rot`. */
function pavilion(c: Ctx, x: number, z: number, y: number, rot: number, w: number, d: number): void {
  const { b } = c;
  const H = 2.9;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const px = x + cos * lx * (w / 2 - 0.2) + sin * lz * (d / 2 - 0.2);
    const pz = z - sin * lx * (w / 2 - 0.2) + cos * lz * (d / 2 - 0.2);
    addBox(b, 'paintRed', px, y + H / 2, pz, 0.22, H, 0.22, rot);
    b.collide({ x: px, z: pz, hx: 0.16, hz: 0.16, rot, y0: y, y1: y + H, mapKind: 'prop', surface: 'wood', tag: 'pavilion' });
  }
  addBox(b, 'wood', x, y + H + 0.1, z, w + 0.4, 0.2, d + 0.4, rot);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 1, 1.7, 4), b.mats.get('roof'));
  roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  roof.rotation.y = rot + Math.PI / 4;
  roof.position.set(x, y + H + 1.05, z);
  b.add(roof);
  // a bench along the back
  addBox(b, 'wood', x - sin * (d / 2 - 0.6), y + 0.45, z - cos * (d / 2 - 0.6), w - 0.8, 0.1, 0.45, rot);
}

/** Beds of red spider lilies (higanbana), each a scatter of `n` flowers within `r` of a centre on height `y`. */
function lilyBeds(c: Ctx, beds: readonly { x: number; z: number; y: number; r: number; n: number }[]): void {
  const { b } = c;
  const petal = new THREE.PlaneGeometry(0.05, 0.26).translate(0, 0.13, 0);
  const stem = new THREE.BoxGeometry(0.022, 1, 0.022).translate(0, 0.5, 0);
  const petals: THREE.BufferGeometry[] = [];
  const stems: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let s = 1717;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (const bed of beds) {
    for (let i = 0; i < bed.n; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * bed.r;
      const x = bed.x + Math.cos(a) * r;
      const z = bed.z + Math.sin(a) * r;
      const h = 0.34 + rand() * 0.26;
      stems.push(stem.clone().applyMatrix4(m.compose(v.set(x, bed.y, z), q.identity(), new THREE.Vector3(1, h, 1))));
      const spin = rand() * Math.PI;
      for (let k = 0; k < 6; k++) {
        e.set(1.05 + rand() * 0.3, spin + (k * Math.PI) / 3, 0, 'YXZ');
        petals.push(petal.clone().applyMatrix4(m.compose(v.set(x, bed.y + h, z), q.setFromEuler(e), one)));
      }
    }
  }
  if (stems.length === 0) return;
  b.add(new THREE.Mesh(mergeGeometries(stems), new THREE.MeshStandardMaterial({ color: 0x2c4a22, roughness: 0.9 })), { cast: false, receive: false });
  b.add(new THREE.Mesh(mergeGeometries(petals), new THREE.MeshStandardMaterial({ color: 0xb3122c, emissive: 0x6a0614, emissiveIntensity: 1, roughness: 0.6, side: THREE.DoubleSide })), { cast: false, receive: false });
}

/**
 * The black bloom: a spider lily grown taller than the shrine, black-stemmed, its petals bleeding a dark red glow. The
 * surge comes from it; while it runs the bloom burns brighter and pulses faster.
 */
function blackBloom(c: Ctx, x: number, z: number): SpireHandle {
  const { b } = c;
  const H = 17;
  const stalkMat = new THREE.MeshStandardMaterial({ color: 0x0c0608, roughness: 0.7 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x2a0408, emissive: 0xb0101e, emissiveIntensity: 0.8, roughness: 0.5, side: THREE.DoubleSide });
  // the stalk, leaning a little, out of a mound of black roots
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, H, 10), stalkMat);
  stalk.position.set(x, H / 2, z);
  stalk.rotation.z = 0.05;
  b.add(stalk);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.4, 4.2, 6), stalkMat);
    root.position.set(x + Math.cos(a) * 1.4, 0.4, z + Math.sin(a) * 1.4);
    root.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
    b.add(root, { cast: false });
  }
  // the head: six long petals curling back, and the stamens reaching up past them
  const top = new THREE.Vector3(x + H * 0.05 * -1, H, z);
  const petal = new THREE.PlaneGeometry(1.1, 6).translate(0, 3, 0);
  const pos = petal.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 6;
    pos.setX(i, pos.getX(i) * (1 - t * 0.7));
    pos.setZ(i, t * t * 2.6);
  }
  petal.computeVertexNormals();
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(petal, glow);
    m.position.copy(top);
    m.rotation.set(1.15, (k * Math.PI) / 3, 0, 'YXZ');
    b.add(m, { cast: false });
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.5;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 7, 5).translate(0, 3.5, 0), glow);
    st.position.copy(top);
    st.rotation.set(Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55);
    b.add(st, { cast: false });
  }
  b.collide({ x, z, hx: 1.3, hz: 1.3, y1: H, mapKind: 'prop', surface: 'wood', tag: 'black-bloom' });
  b.light({ x: top.x, y: H - 1, z, color: 0xd0182a, intensity: 120, distance: 30, mode: 'pulse', period: 4, glow: 4, weight: 2, tag: 'bloom' });
  let surge = false;
  b.tick((_dt, time) => {
    const beat = surge ? 0.5 + 0.5 * Math.sin(time * 6) : 0.5 + 0.5 * Math.sin(time * 1.3);
    glow.emissiveIntensity = surge ? 1.6 + beat * 1.6 : 0.6 + beat * 0.5;
  });
  return {
    top: { x: top.x, y: H + 4, z },
    setSurge(on: boolean) {
      surge = on;
    },
  };
}

/** The Phoenix Shrine on the summit: an open pavilion of eight posts, the clan's seal burning on the altar. */
function phoenixShrine(c: Ctx): void {
  const { b } = c;
  const y = TIERS[2].y;
  const H = 4.2;
  const R = 6.6;
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + k * 45) * deg;
    const p = polar(R, a);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, H, 10), b.mats.get('paintRed'));
    post.position.set(p.x, y + H / 2, p.z);
    b.add(post);
    b.collide({ x: p.x, z: p.z, hx: 0.3, hz: 0.3, y0: y, y1: y + H, mapKind: 'prop', surface: 'wood', tag: 'shrine-post' });
  }
  const eave = new THREE.Mesh(new THREE.CylinderGeometry(9.4, 9.4, 0.32, 8, 1), b.mats.get('paintBlack'));
  eave.rotation.y = Math.PI / 8;
  eave.position.set(SUMMIT.x, y + H + 0.16, SUMMIT.z);
  b.add(eave);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(9.8, 3.4, 8), b.mats.get('roof'));
  roof.rotation.y = Math.PI / 8;
  roof.position.set(SUMMIT.x, y + H + 2, SUMMIT.z);
  b.add(roof);
  // the altar at the back, and over it Vulcan's phoenix seal, burning
  const altarZ = SUMMIT.z - 3.2;
  addBox(b, 'wood', SUMMIT.x, y + 0.5, altarZ, 2.6, 1, 1.2);
  b.collide({ x: SUMMIT.x, z: altarZ, hx: 1.3, hz: 0.6, y0: y, y1: y + 1, mapKind: 'prop', surface: 'wood', tag: 'altar' });
  const seal = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), vulcanSigilMaterial());
  seal.position.set(SUMMIT.x, y + 2.6, altarZ - 0.4);
  b.add(seal, { cast: false, receive: false });
  b.light({ x: SUMMIT.x, y: y + 2.8, z: altarZ + 0.6, color: 0xff7a2a, intensity: 70, distance: 16, mode: 'pulse', period: 2.6, glow: 2.6, pool: 5, weight: 2, tag: 'shrine' });
  for (const d of [-22.5, 22.5]) {
    const p = polar(R + 0.35, d * deg);
    vulcanBanner(c, p.x, p.z, d * deg, y + 2.6);
  }
}

/** Vulcan's landing camp at the ferry: sandbags, supplies, the clan's banners and its seal burning on the ground. */
function landingCamp(c: Ctx): void {
  const { b } = c;
  const S = AURELIA.start;
  sandbagWall(b, { x0: -7, z0: S.z - 5, x1: -3.2, z1: S.z - 6.5, height: 1.1 });
  sandbagWall(b, { x0: 3.2, z0: S.z - 6.5, x1: 7, z1: S.z - 5, height: 1.1 });
  barrelGroup(b, { x: -8.5, z: S.z + 1.5, rot: 0.3, count: 3, radius: 1.1, seed: 611 });
  crateGroup(b, { x: 9, z: S.z + 0.5, rot: -0.4, count: 3, radius: 1.2, seed: 612 });
  const seal = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), vulcanSigilMaterial());
  seal.rotation.x = -Math.PI / 2;
  seal.position.set(S.x, 0.04, S.z - 2.5);
  b.add(seal, { cast: false, receive: false });
  for (const x of [-4.6, 4.6]) {
    addBox(b, 'steelDark', x - 1.3, 2.4, S.z + 2, 0.12, 4.8, 0.12);
    addBox(b, 'steelDark', x + 1.3, 2.4, S.z + 2, 0.12, 4.8, 0.12);
    b.collide({ x, z: S.z + 2, hx: 1.4, hz: 0.1, y1: 4.8, blocksShots: false, mapKind: 'none', tag: 'banner-poles' });
    vulcanBanner(c, x, S.z + 2.06, 0, 3.4);
  }
  b.light({ x: S.x, y: 2.2, z: S.z - 2.5, color: 0xff7a1a, intensity: 30, distance: 12, mode: 'flicker', glow: 1.4, pool: 4, tag: 'camp' });
  // the ferry pier out over the water, and the boat that brought you
  for (let z = 31; z < 42; z += 1.2) {
    addBox(b, 'wood', 0, 0.12, z + 0.6, 3.2, 0.14, 1.1, 0, { cast: false });
    for (const x of [-1.5, 1.5]) addBox(b, 'wood', x, -0.4, z + 0.6, 0.18, 1.2, 0.18, 0, { cast: false });
  }
  addBox(b, 'paintBlack', 3.6, -0.15, 38, 2.2, 0.8, 7, 0.08);
  addBox(b, 'wood', 3.6, 0.28, 38, 1.8, 0.1, 6.4, 0.08, { cast: false });
}

const DOOR = 1.6;
const door = (at: number, width = DOOR, height = 2.4): Opening => ({ at, width, height, kind: 'door', frame: 'wood' });
const win = (at: number, lit = false): Opening => ({ at, width: 1.2, height: 1.2, sill: 1.1, kind: 'window', frame: 'wood', lit });

export function buildAurelia(c: Ctx): { transmitter: TransmitterHandle; spire: SpireHandle } {
  const { b, d } = c;

  surround(c);
  valleyEdge(c);
  b.add(new THREE.Mesh(flatShape(valleyOutline(), 0.01, 6), b.mats.get('grass')), { cast: false });

  for (let k = 0; k < TIERS.length; k++) terrace(c, k);
  for (const s of STAIRS) stairFlight(c, s);

  // ---- the map: paths, regions, names ----
  d.road(-3, 15, 3, 30, 'FERRY PATH');
  d.regionRects.push(
    { region: 'high', x0: -10, z0: -34, x1: 10, z1: -14 },
    { region: 'medium', x0: -36, z0: -38, x1: 36, z1: 11 },
    { region: 'low', x0: AURELIA_BOUNDS.minX, z0: AURELIA_BOUNDS.minZ, x1: AURELIA_BOUNDS.maxX, z1: AURELIA_BOUNDS.maxZ },
  );
  d.label('FERRY LANDING', 0, 30, 0.8);
  d.label('WEST BANK', LZ.x - 4, LZ.z + 9, 0.75);
  d.label('RIVER RELAY', RELAY.x + 4, RELAY.z + 9, 0.75);
  d.label('LANTERN TERRACE', 0, 4, 0.75);
  d.label('SHRINE STEPS', 0, -9, 0.7);
  d.label('PHOENIX SHRINE', 0, -24, 0.8);
  d.label('THE BLACK BLOOM', BLOOM.x + 2, BLOOM.z + 6, 0.7);

  // ---- the riverbank (low) ----
  landingCamp(c);
  d.station({ kind: 'buy', name: 'FERRY STORES', x: -10, z: 14, yaw: -HALF_PI, region: 'low' });
  const ferry = P(44, -25);
  building(b, {
    x: ferry.x, z: ferry.z, w: 9, d: 7, height: 3.6, wallMaterial: 'wood', roofMaterial: 'roof', floorMaterial: 'wood', ceilingMaterial: 'wood',
    sides: { N: { openings: [door(4.5)] }, S: { openings: [door(3), win(6.6, true)] }, E: { openings: [door(3.5)] }, W: { openings: [win(3.5)] } },
    tag: 'ferry-house',
  });
  const boat = P(44, 25);
  building(b, {
    x: boat.x, z: boat.z, w: 9, d: 6, height: 3.4, wallMaterial: 'wood', roofMaterial: 'roof', floorMaterial: 'wood', ceilingMaterial: 'wood',
    sides: { N: { openings: [door(4.5, 2.4, 2.8)] }, S: { openings: [door(4.5)] }, W: { openings: [door(3)] } },
    tag: 'boathouse',
  });
  const tea = P(47, -75);
  building(b, {
    x: tea.x, z: tea.z, w: 7, d: 8, height: 3.4, wallMaterial: 'plaster', roofMaterial: 'roof', floorMaterial: 'wood', ceilingMaterial: 'wood',
    sides: { E: { openings: [door(4)] }, N: { openings: [door(3.5)] }, S: { openings: [door(3.5), win(5.6, true)] }, W: { openings: [win(4)] } },
    tag: 'tea-house',
  });
  const store = P(47, 75);
  building(b, {
    x: store.x, z: store.z, w: 7, d: 8, height: 3.6, wallMaterial: 'wood', roofMaterial: 'roof', floorMaterial: 'wood', ceilingMaterial: 'wood',
    sides: { W: { openings: [door(4)] }, N: { openings: [door(3.5)] }, S: { openings: [door(3.5)] } },
    tag: 'storehouse',
  });
  const cache = P(40, 100);
  barrelGroup(b, { x: cache.x + 2, z: cache.z - 1, rot: 0.2, count: 4, radius: 1.3, seed: 640 });
  crateGroup(b, { x: cache.x - 2, z: cache.z + 1, rot: 0.6, count: 3, radius: 1.2, seed: 641 });
  d.station({ kind: 'upgrade', name: 'VULCAN SUPPLY CACHE', x: cache.x, z: cache.z + 3, yaw: 0, region: 'low' });
  helipad(b, { x: LZ.x, z: LZ.z, rot: 0, radius: 7.6 });
  const transmitter = transmitterSite(b, { x: RELAY.x, z: RELAY.z, rot: -0.9, radius: AURELIA.relay.radius });
  const bloom = blackBloom(c, BLOOM.x, BLOOM.z);
  torii(c, P(TIERS[0].r + RUN + 1, 0).x, P(TIERS[0].r + RUN + 1, 0).z, 0, 0, 7.4);
  for (const a of [-60, -18, 18, 60, -130, 130]) {
    const p = P(50, a);
    if (inValley(p.x, p.z)) bench(b, { x: p.x, z: p.z, rot: a * deg + Math.PI });
  }
  debris(b, { x: P(46, -38).x, z: P(46, -38).z, radius: 2.4, seed: 651 });
  debris(b, { x: P(46, 40).x, z: P(46, 40).z, radius: 2.2, seed: 652 });
  corpse(b, { x: P(41, -12).x, z: P(41, -12).z, rot: 0.6 });
  corpse(b, { x: P(45, 66).x, z: P(45, 66).z, rot: 2.2, kind: 'civilian' });
  for (const [r, a] of [[46, -10], [46, 12], [42, -68], [42, 70], [50, -92], [50, 92]] as const) {
    const p = P(r, a);
    d.crate(p.x, p.z, a * deg, 'low');
  }

  // ---- the Lantern Terrace and the Shrine Steps (medium) ----
  const y1 = TIERS[0].y;
  const y2 = TIERS[1].y;
  const stairsOn = (tier: number, a: number, slack: number): boolean => STAIRS.some((s) => s.tier === tier && Math.abs(s.at - a) < slack);
  for (let a = -108; a <= 108; a += 18) {
    if (stairsOn(0, a, 7)) continue;
    const p = P(31, a);
    stoneLantern(c, p.x, p.z, y1, a * deg);
  }
  for (const a of [-66, 66]) {
    const p = P(27, a);
    pavilion(c, p.x, p.z, y1, a * deg, 5, 4);
  }
  for (const a of [-30, 30]) {
    const p = P(TIERS[1].r + RUN + 1, a);
    torii(c, p.x, p.z, y1, a * deg, 5.2);
  }
  for (let a = -135; a <= 135; a += 30) {
    if (stairsOn(1, a, 8) || stairsOn(2, a, 10)) continue;
    const p = P(17.5, a);
    redLantern(c, p.x, p.z, y2);
  }
  const summitTorii = P(TIERS[2].r + RUN + 1, 0);
  torii(c, summitTorii.x, summitTorii.z, y2, 0, 6.2);

  // ---- the Phoenix Shrine (high) ----
  phoenixShrine(c);

  // ---- higanbana: on every terrace, thickest by the water and round the shrine ----
  const beds: { x: number; z: number; y: number; r: number; n: number }[] = [];
  for (const a of [-118, -70, -30, 30, 70, 118]) beds.push({ ...P(50, a), y: 0, r: 3, n: 70 });
  for (const a of [-52, -16, 16, 52, -96, 96]) beds.push({ ...P(25, a), y: y1, r: 2.4, n: 55 });
  for (const a of [-60, 60, -150, 150]) beds.push({ ...P(14, a), y: y2, r: 2, n: 45 });
  for (const a of [-110, 110, 180]) beds.push({ ...P(7.6, a), y: TIERS[2].y, r: 1.2, n: 24 });
  lilyBeds(c, beds.filter((p) => inValley(p.x, p.z)));

  // ---- spawn points and resident infected ----
  const ring = (r: number, from: number, to: number, step: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let a = from; a <= to; a += step) {
      const p = P(r, a);
      if (inValley(p.x, p.z)) out.push([p.x, p.z]);
    }
    return out;
  };
  d.spawn('low', 'general', ring(49, -110, 110, 22), 1);
  d.spawn('medium', 'general', [...ring(28, -100, 100, 25), ...ring(15, -120, 120, 40)], 1);
  d.spawn('high', 'general', ring(4.5, 60, 300, 120), 1.2);
  d.spawn('low', 'defense', [[P(47, 64).x, P(47, 64).z], [P(47, 42).x, P(47, 42).z], [P(38, 70).x, P(38, 70).z], [P(50, 52).x, P(50, 52).z]], 1);
  d.spawn('low', 'lz', [[P(47, -64).x, P(47, -64).z], [P(47, -42).x, P(47, -42).z], [P(38, -70).x, P(38, -70).z], [P(50, -52).x, P(50, -52).z]], 1);
  d.zombies('low', 'shambler', ring(44, -100, 100, 15));
  d.zombies('low', 'runner', ring(50, -84, 84, 42));
  d.zombies('low', 'armored', [[P(41, -100).x + 3, P(41, -100).z], [P(42, 100).x, P(42, 100).z]]);

  return { transmitter, spire: bloom };
}
