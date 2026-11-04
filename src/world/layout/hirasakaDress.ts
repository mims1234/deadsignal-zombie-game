/**
 * HIRASAKA's dressing (`hirasaka.ts` builds the ground and everything that stops anyone): the rock - sea stacks, the
 * island's foot, the headland the mine is cut into, the mine's own walls - the Old Village's thatched minka, the tree of
 * white peaches and the Root Hall's tree, whose roots hold the people it took (`hirasaka/look.ts` puts them in it).
 *
 * All of it is static and baked into the level's merged batches; none of it collides (it stands where nobody walks, or
 * is low enough underfoot to be walked over).
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import type { MaterialLib } from '../materials';
import { PLACES, ROOT_PEOPLE, ROOT_TREE, rootTrunkR } from '../../hirasaka/places';

// ---------------------------------------------------------------------------------------------
// noise
// ---------------------------------------------------------------------------------------------

function rnd(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Smooth, seeded noise in roughly -1..1: a handful of sine waves in random directions (the same input, the same value). */
function field(seed: number, n: number, freq: number): (x: number, y: number, z: number) => number {
  const r = rnd(seed * 7919 + 13);
  const w = Array.from({ length: n }, (_, i) => {
    const a = r() * Math.PI * 2;
    const b = Math.acos(2 * r() - 1);
    const f = freq * (1 + i * 0.9);
    return { dx: Math.sin(b) * Math.cos(a) * f, dy: Math.cos(b) * f, dz: Math.sin(b) * Math.sin(a) * f, p: r() * Math.PI * 2, amp: 1 / (1 + i * 0.8) };
  });
  const tot = w.reduce((s, q) => s + q.amp, 0);
  return (x, y, z) => {
    let v = 0;
    for (const q of w) v += Math.sin(x * q.dx + y * q.dy + z * q.dz + q.p) * q.amp;
    return v / tot;
  };
}

// ---------------------------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------------------------

export interface DressMats {
  /** Crags: their colour is in their vertices (wet and dark at the foot, lighter on the shoulders). */
  rock: THREE.MeshStandardMaterial;
  /** The mine: cut rock for the walls, a darker roof, a trodden floor (textured, projected in world space). */
  mineWall: THREE.MeshStandardMaterial;
  mineRoof: THREE.MeshStandardMaterial;
  mineFloor: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  thatch: THREE.MeshStandardMaterial;
  mud: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
  slat: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  shoji: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  blossom: THREE.MeshStandardMaterial;
}

function tinted(mats: MaterialLib, name: Parameters<MaterialLib['get']>[0], color: number, tile: number, extra: Partial<THREE.MeshStandardMaterial> = {}): THREE.MeshStandardMaterial {
  const m = mats.get(name).clone();
  m.color.setHex(color);
  m.userData = { ...m.userData, tile };
  Object.assign(m, extra);
  return m;
}

export function dressMats(mats: MaterialLib): DressMats {
  return {
    rock: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0.04 }),
    mineWall: tinted(mats, 'rubble', 0x9a8a76, 3.4),
    mineRoof: tinted(mats, 'rubble', 0x5e5248, 4, { side: THREE.DoubleSide }),
    mineFloor: tinted(mats, 'gravel', 0x84766a, 3),
    bark: new THREE.MeshStandardMaterial({ color: 0x4a3832, roughness: 0.95 }),
    thatch: tinted(mats, 'dirt', 0x8a7046, 1.6, { side: THREE.DoubleSide }),
    mud: tinted(mats, 'plaster', 0xa8916c, 2.4),
    timber: new THREE.MeshStandardMaterial({ color: 0x2e2018, roughness: 0.85 }),
    slat: new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.85 }),
    stone: tinted(mats, 'rubble', 0x6e6a62, 1.6),
    shoji: new THREE.MeshStandardMaterial({ color: 0xf2dfb4, roughness: 0.9, emissive: 0xffa048, emissiveIntensity: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 1 }),
    blossom: new THREE.MeshStandardMaterial({ color: 0xfff4f6, roughness: 0.8, emissive: 0xffd8e4, emissiveIntensity: 0.32, flatShading: true }),
  };
}

// ---------------------------------------------------------------------------------------------
// rock
// ---------------------------------------------------------------------------------------------

export interface CragSpec {
  x: number;
  y: number;
  z: number;
  /** Half-extents. */
  sx: number;
  sy: number;
  sz: number;
  seed: number;
  rot?: number;
  /** Subdivisions of the icosahedron it is cut from (2: a stack you look at, 1: the mine's walls). */
  detail?: number;
  /** Its colour (linear), before the light and wet are worked in. */
  tone?: readonly [number, number, number];
}

/** A crag: an icosahedron pushed about by noise, broken into facets, flattened at the foot. */
export function crag(b: LevelBuilder, mat: THREE.Material, o: CragSpec): void {
  const g = new THREE.IcosahedronGeometry(1, o.detail ?? 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const big = field(o.seed, 5, 1.5);
  const fine = field(o.seed + 101, 4, 4.4);
  const col = new Float32Array(pos.count * 3);
  const [cr, cg, cb] = o.tone ?? [0.036, 0.034, 0.032];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = big(x, y, z);
    const c = fine(x, y, z);
    const k = 1 + 0.34 * a + 0.13 * c;
    let ny = y * k;
    // rock breaks in ledges: snap the height a little toward bands
    ny = ny + 0.06 * Math.sin(ny * 11 + o.seed);
    if (ny < -0.6) ny = -0.6 + (ny + 0.6) * 0.25;
    pos.setXYZ(i, x * k * o.sx, ny * o.sy, z * k * o.sz);
    const h = Math.min(1, Math.max(0, (y + 1) / 2));
    const shade = (0.55 + 0.6 * h) * (0.8 + 0.32 * c) * (a > 0.3 ? 1.18 : 1);
    col[i * 3] = cr * shade;
    col[i * 3 + 1] = cg * shade;
    col[i * 3 + 2] = cb * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.position.set(o.x, o.y, o.z);
  m.rotation.y = o.rot ?? 0;
  b.add(m, { cast: false });
}

/** Crags along a line from (x0, z0) to (x1, z1), each `step` apart (jittered), heights from `h(x, z)`. */
export function cragLine(b: LevelBuilder, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, step: number, seed: number, o: { y: number; h: (x: number, z: number) => number; w: number; depth: number; tone?: readonly [number, number, number]; detail?: number }): void {
  const r = rnd(seed);
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / step));
  const ux = (x1 - x0) / len;
  const uz = (z1 - z0) / len;
  for (let i = 0; i <= n; i++) {
    const t = (i + (r() - 0.5) * 0.6) / n;
    const x = x0 + (x1 - x0) * t + uz * (r() - 0.5) * o.depth * 0.6;
    const z = z0 + (z1 - z0) * t - ux * (r() - 0.5) * o.depth * 0.6;
    const h = o.h(x, z) * (0.7 + r() * 0.5);
    crag(b, mat, { x, y: o.y + h * 0.42, z, sx: o.w * (0.7 + r() * 0.6), sy: h * 0.62, sz: o.depth * (0.7 + r() * 0.5), seed: seed * 31 + i, rot: Math.atan2(ux, uz) + (r() - 0.5) * 0.8, tone: o.tone, detail: o.detail });
  }
}

// ---------------------------------------------------------------------------------------------
// tubes: roots, trunks, branches
// ---------------------------------------------------------------------------------------------

/** A twisted tube along `points`, radius `r0` at the start tapering to `r1`, ridged like old bark. */
export function gnarl(points: readonly THREE.Vector3[], r0: number, r1: number, seed: number, o: { radial?: number; segs?: number; ridges?: number } = {}): THREE.BufferGeometry {
  const radial = o.radial ?? 9;
  const segs = o.segs ?? Math.max(8, Math.round(points.length * 6));
  const curve = new THREE.CatmullRomCurve3([...points]);
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const f = field(seed, 4, 2.2);
  const ridges = o.ridges ?? 0.16;
  const c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const rad = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      const dx = pos.getX(k) - c.x;
      const dy = pos.getY(k) - c.y;
      const dz = pos.getZ(k) - c.z;
      const ang = (j / radial) * Math.PI * 2;
      const m = 1 + ridges * Math.sin(ang * 5 + t * 7 + seed) + 0.1 * f(dx, dy + t * 3, dz);
      pos.setXYZ(k, c.x + dx * rad * m, c.y + dy * rad * m, c.z + dz * rad * m);
    }
  }
  g.computeVertexNormals();
  return g;
}

function tube(b: LevelBuilder, mat: THREE.Material, points: readonly THREE.Vector3[], r0: number, r1: number, seed: number, o?: { radial?: number; segs?: number; ridges?: number }): void {
  b.add(new THREE.Mesh(gnarl(points, r0, r1, seed, o), mat), { cast: false });
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------------------------
// the Old Village: thatched minka
// ---------------------------------------------------------------------------------------------

/** A hipped roof, eaves at y 0: `w` by `d` at the eaves, the ridge `ridge` long and `rise` up. */
function hipRoof(w: number, d: number, ridge: number, rise: number): THREE.BufferGeometry {
  const A = [-w / 2, 0, -d / 2];
  const B = [w / 2, 0, -d / 2];
  const C = [w / 2, 0, d / 2];
  const D = [-w / 2, 0, d / 2];
  const P = [-ridge / 2, rise, 0];
  const Q = [ridge / 2, rise, 0];
  const tris = [D, C, Q, D, Q, P, B, A, P, B, P, Q, C, B, Q, A, D, P, A, C, B, A, D, C];
  const pos = new Float32Array(tris.length * 3);
  const uv = new Float32Array(tris.length * 2);
  tris.forEach((p, i) => {
    pos.set(p, i * 3);
    uv[i * 2] = (p[0]! + p[2]! * 0.3) * 0.5;
    uv[i * 2 + 1] = (p[1]! + Math.abs(p[2]!)) * 0.5;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * A minka of the old village, its front (with the door) facing local +z: a stone footing, mud walls in a dark timber
 * frame, a lit shoji on one side of the door and a slatted window on the other, a lantern, a deep hipped thatch roof.
 * The house is 6 by 5 (`VILLAGE_HOUSES`' colliders) and its door is 1.4 wide at the middle of the front (the leaf that
 * swings open is `look.ts`'s).
 */
export function minka(b: LevelBuilder, M: DressMats, x: number, z: number, rot: number, seed: number): void {
  const g = new THREE.Group();
  const r = rnd(seed);
  const box = (mat: THREE.Material, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(cx, cy, cz);
    g.add(m);
    return m;
  };
  // footing and walls
  box(M.stone, 0, 0.18, 0, 6.4, 0.36, 5.4);
  box(M.mud, 0, 1.73, 0, 5.8, 2.74, 4.8);
  // the frame: sill and head beams round the walls, posts at the corners and between
  box(M.timber, 0, 0.47, 0, 5.96, 0.22, 4.96);
  box(M.timber, 0, 3.0, 0, 5.98, 0.26, 4.98);
  for (const [px, pz] of [[-2.92, -2.42], [2.92, -2.42], [-2.92, 2.42], [2.92, 2.42], [-1, 2.42], [1, 2.42], [-1, -2.42], [1, -2.42], [-2.92, 0], [2.92, 0]] as const) box(M.timber, px, 1.62, pz, 0.22, 3.0, 0.22);
  box(M.timber, 0, 1.95, 0, 5.94, 0.12, 4.94);
  // the doorway (its leaf is the village's to open), a lintel over it
  box(M.dark, 0, 1.17, 2.42, 1.44, 2.3, 0.06);
  box(M.timber, 0, 2.38, 2.46, 1.9, 0.18, 0.14);
  for (const s of [-1, 1]) box(M.timber, s * 0.82, 1.2, 2.46, 0.14, 2.36, 0.14);
  // a lit shoji to the right of the door, its paper squared by kumiko
  const shojiLeft = r() < 0.5;
  const sx = shojiLeft ? -1.95 : 1.95;
  box(M.shoji, sx, 1.75, 2.43, 1.5, 1.3, 0.04);
  for (const dx of [-0.5, 0, 0.5]) box(M.timber, sx + dx, 1.75, 2.46, 0.04, 1.3, 0.04);
  for (const dy of [-0.32, 0.32]) box(M.timber, sx, 1.75 + dy, 2.46, 1.5, 0.04, 0.04);
  // the slatted window (koshi) on the other side, dark behind
  const kx = -sx;
  box(M.dark, kx, 1.6, 2.43, 1.5, 1.5, 0.04);
  for (let i = 0; i < 10; i++) box(M.slat, kx - 0.68 + i * 0.151, 1.6, 2.47, 0.05, 1.5, 0.05);
  // a small lit window in a side wall
  box(M.shoji, 2.92, 2.05, -0.9, 0.04, 0.7, 1.1);
  for (const dz of [-0.28, 0.28]) box(M.timber, 2.95, 2.05, -0.9 + dz, 0.04, 0.7, 0.04);
  // the lantern by the door
  box(M.shoji, shojiLeft ? 1.15 : -1.15, 2.05, 2.8, 0.3, 0.46, 0.3);
  box(M.timber, shojiLeft ? 1.15 : -1.15, 2.33, 2.8, 0.36, 0.06, 0.36);
  // the roof: deep hipped thatch, a thick edge to its eaves, a dark ridge
  const roof = new THREE.Mesh(hipRoof(7.6, 6.6, 1.8, 2.5 + r() * 0.3), M.thatch);
  roof.position.y = 3.12;
  g.add(roof);
  box(M.thatch, 0, 3.0, 3.3, 7.6, 0.42, 0.3);
  box(M.thatch, 0, 3.0, -3.3, 7.6, 0.42, 0.3);
  box(M.thatch, 3.8, 3.0, 0, 0.3, 0.42, 6.6);
  box(M.thatch, -3.8, 3.0, 0, 0.3, 0.42, 6.6);
  box(M.timber, 0, roof.position.y + 2.55, 0, 2.6, 0.32, 0.62);
  for (const dx of [-0.8, 0, 0.8]) box(M.timber, dx, roof.position.y + 2.5, 0, 0.14, 0.26, 1.2);
  // a woodpile against the back
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 7).rotateZ(Math.PI / 2), M.slat);
    log.position.set(-1.6 + (i % 2) * 0.1, 0.2 + i * 0.28, -2.75);
    g.add(log);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  g.updateMatrixWorld(true);
  b.add(g, { cast: false });
}

// ---------------------------------------------------------------------------------------------
// trees
// ---------------------------------------------------------------------------------------------

/** The tree of white peaches in the Old Village: a twisted trunk, low wide boughs, a pale crown of blossom. */
export function peachTree(b: LevelBuilder, M: DressMats): void {
  const { x, z } = PLACES.peaches;
  tube(b, M.bark, [V(x, -0.4, z), V(x + 0.3, 2, z - 0.2), V(x - 0.2, 3.6, z + 0.3), V(x + 0.1, 5.2, z)], 0.85, 0.42, 71, { radial: 10, ridges: 0.2 });
  const r = rnd(72);
  const tips: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.5;
    const len = 2.6 + r() * 1.6;
    const tip = V(x + Math.cos(a) * len, 6.2 + r() * 1.8, z + Math.sin(a) * len);
    tips.push(tip);
    tube(b, M.bark, [V(x, 4.2 + r() * 0.8, z), V(x + Math.cos(a) * len * 0.5, 5.4 + r(), z + Math.sin(a) * len * 0.5), tip], 0.32, 0.08, 80 + i, { radial: 7 });
  }
  // blossom in clusters round the tips and over the crown
  const clusters = [...tips.map((t) => [t.x, t.y + 0.3, t.z] as const), [x, 8.2, z] as const];
  clusters.forEach(([cx, cy, cz], k) => {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + r() * 0.6, 1), M.blossom);
      m.position.set(cx + (r() - 0.5) * 2.2, cy + (r() - 0.4) * 1.2, cz + (r() - 0.5) * 2.2);
      m.rotation.set(r() * 3, r() * 3, 0);
      m.scale.set(1, 0.7, 1);
      b.add(m, { cast: false });
    }
    void k;
  });
}

/**
 * The Root Hall's tree: a vast twisted trunk into the roof, boughs spreading over the hall, and roots across its floor -
 * the ones round the people it holds (`ROOT_PEOPLE`) wound over them: across the waist and chest of those in the bark,
 * over the chest and shins of those lying in the roots.
 */
export function rootTree(b: LevelBuilder, M: DressMats): void {
  const { x, z } = ROOT_TREE;
  // the trunk: straight in the bark where the people are, twisting above them
  const trunk: THREE.Vector3[] = [];
  for (const y of [-1, 3, 7.5, 11, 14.5, 17.5, 21]) {
    const t = Math.max(0, (y - 8) / 13);
    trunk.push(V(x + Math.sin(y * 0.7) * 0.9 * t, y, z + Math.cos(y * 0.5) * 0.7 * t));
  }
  const tg = gnarl(trunk, 1, 1, 501, { radial: 18, segs: 44, ridges: 0.14 });
  // the tube was made at radius 1: give it the trunk's radius height by height (shared with `look.ts` through `rootTrunkR`)
  const pos = tg.attributes.position as THREE.BufferAttribute;
  const curve = new THREE.CatmullRomCurve3(trunk);
  const c = new THREE.Vector3();
  for (let i = 0; i <= 44; i++) {
    curve.getPointAt(i / 44, c);
    const rr = rootTrunkR(c.y);
    for (let j = 0; j <= 18; j++) {
      const k = i * 19 + j;
      pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * rr, pos.getY(k) + (pos.getY(k) - c.y) * (rr - 1), c.z + (pos.getZ(k) - c.z) * rr);
    }
  }
  tg.computeVertexNormals();
  b.add(new THREE.Mesh(tg, M.bark), { cast: false });
  const r = rnd(502);
  // boughs over the hall, up into the roof
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.4;
    const y0 = 11 + r() * 5;
    const R0 = rootTrunkR(y0) * 0.8;
    const len = 9 + r() * 7;
    tube(b, M.bark, [V(x + Math.cos(a) * R0, y0, z + Math.sin(a) * R0), V(x + Math.cos(a) * (R0 + len * 0.45), y0 + 2.5, z + Math.sin(a + 0.2) * (R0 + len * 0.45)), V(x + Math.cos(a + 0.1) * (R0 + len), 19.6, z + Math.sin(a + 0.1) * (R0 + len))], 0.95, 0.3, 510 + i);
  }
  // roots across the floor, out to the walls (leaving room for those lying in them)
  const lying = ROOT_PEOPLE.filter((p) => p.r !== undefined).map((p) => p.a);
  const R0 = rootTrunkR(0.3);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + (r() - 0.5) * 0.2;
    if (lying.some((l) => Math.abs(Math.atan2(Math.sin(a - l), Math.cos(a - l))) < 0.22)) continue;
    const len = 8 + r() * 9;
    const wob = (r() - 0.5) * 0.5;
    const pts = [V(x + Math.cos(a) * R0 * 0.85, 0.9, z + Math.sin(a) * R0 * 0.85)];
    for (const t of [0.2, 0.45, 0.7, 1]) {
      const aa = a + wob * t;
      pts.push(V(x + Math.cos(aa) * (R0 + len * t), t < 0.5 ? 0.55 - t * 0.4 : 0.15 - t * 0.2, z + Math.sin(aa) * (R0 + len * t)));
    }
    tube(b, M.bark, pts, 0.55, 0.06, 530 + i);
  }
  // the roots that hold the people
  ROOT_PEOPLE.forEach((p, i) => {
    const ca = Math.cos(p.a);
    const sa = Math.sin(p.a);
    if (p.r === undefined) {
      // in the bark: across the shins, the waist and the chest, from the trunk round the front of them and back in
      for (const [dy, bow, w] of [[0.4, 0.16, 0.45], [0.98, 0.2, 0.55], [1.36, 0.2, 1.0]] as const) {
        const y = p.y! + dy;
        const R = rootTrunkR(y);
        const pts: THREE.Vector3[] = [];
        for (const k of [-1, -0.4, 0.4, 1]) {
          const a = p.a + k * w * (1.1 / R);
          const rr = Math.abs(k) === 1 ? R * 0.92 : R + bow;
          pts.push(V(x + Math.cos(a) * rr, y + k * 0.18, z + Math.sin(a) * rr));
        }
        tube(b, M.bark, pts, 0.12, 0.1, 600 + i * 7 + Math.round(dy * 10), { radial: 7, segs: 14, ridges: 0.1 });
      }
      // the bark grown up either side of them, from the floor to over their heads: they are in the tree, not on it
      for (const s of [-1, 1]) {
        const at = (dy: number, out: number, side: number): THREE.Vector3 => {
          const y = p.y! + dy;
          const R = rootTrunkR(Math.max(0, y));
          const a = p.a + (s * side) / R;
          return V(x + Math.cos(a) * (R + out), y, z + Math.sin(a) * (R + out));
        };
        tube(b, M.bark, [at(-p.y! - 0.3, -0.3, 0.9), at(-0.2, 0.05, 0.55), at(0.9, 0.16, 0.42), at(1.7, 0.14, 0.4), at(2.3, -0.1, 0.2), at(2.8, -0.4, 0.05)], 0.34, 0.12, 640 + i * 3 + s, { radial: 8, segs: 26, ridges: 0.18 });
      }
      return;
    }
    // lying in the roots, feet to the trunk: a root runs in to the feet, two wind over the body
    const nx = -sa;
    const nz = ca;
    tube(b, M.bark, [V(x + ca * R0 * 0.9, 0.7, z + sa * R0 * 0.9), V(x + ca * (R0 + (p.r - R0) * 0.5), 0.45, z + sa * (R0 + (p.r - R0) * 0.5)), V(x + ca * p.r, 0.3, z + sa * p.r)], 0.5, 0.2, 700 + i);
    for (const [d, w] of [[0.45, 0.42], [1.12, 0.5]] as const) {
      const cx = x + ca * (p.r + d);
      const cz = z + sa * (p.r + d);
      tube(b, M.bark, [V(cx - nx * (w + 0.5), -0.05, cz - nz * (w + 0.5)), V(cx - nx * w * 0.5, 0.36, cz - nz * w * 0.5), V(cx + nx * w * 0.5, 0.36, cz + nz * w * 0.5), V(cx + nx * (w + 0.5), -0.05, cz + nz * (w + 0.5))], 0.13, 0.1, 720 + i * 3 + Math.round(d * 10), { radial: 7, segs: 12, ridges: 0.1 });
    }
  });
}
