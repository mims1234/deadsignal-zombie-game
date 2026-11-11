/**
 * ZARYA: the pieces the town is built from (lamp posts with loudspeakers, fair kiosks, fir trees, benches, ice blocks,
 * counters, the tram, the van). Plain colours throughout: the level builder draws every plain colour of one finish
 * together (`LevelBuilder.bake`), so a kiosk's forty boxes cost nothing more than the first of them. Only what glows has
 * a material of its own, and there are five of those in the whole town.
 */
import * as THREE from 'three';
import { addBox } from '../structures';
import type { LevelBuilder } from '../builder';
import type { Ctx } from './util';

const std = (color: number, roughness = 0.9, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const lit = (color: number, intensity: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: color, emissiveIntensity: intensity, roughness: 0.6 });

export const Z = {
  snow: std(0xa9b6cc, 0.95),
  snowBlue: std(0x8f9db6, 0.95),
  packed: std(0x8793aa, 0.9),
  paving: std(0x5c6577, 0.9),
  concrete: std(0x8b9199, 0.9),
  concreteDark: std(0x555b64, 0.9),
  cream: std(0xd8cfb8, 0.85),
  white: std(0xe9e6de, 0.85),
  wood: std(0x7b5a3a, 0.85),
  woodDark: std(0x4d3725, 0.85),
  woodPale: std(0xa98a5f, 0.85),
  red: std(0xb3261e, 0.8),
  redDark: std(0x7a1c18, 0.85),
  blue: std(0x2f4f8f, 0.85),
  green: std(0x4f6f52, 0.9),
  greenDark: std(0x2f4a36, 0.9),
  fir: std(0x1f3d2b, 0.95),
  iron: std(0x2b2f36, 0.6, 0.5),
  steel: std(0x59626e, 0.55, 0.55),
  grey: std(0x8a8f98, 0.8),
  locker: std(0x7c8590, 0.6, 0.3),
  brass: std(0xb08a3a, 0.45, 0.7),
  black: std(0x101216, 0.9),
  terrazzo: std(0x7a7264, 0.7),
  orange: std(0xe08a1e, 0.8),
  gold: std(0xd6aa3c, 0.5, 0.5),
  plush: std(0x6b4a2b, 1),
  /** Shop-door glass, seen at night from a lit hall: dark, a little shine (plain, so it bakes with the rest). */
  glass: std(0x34465a, 0.25, 0.4),
  // what glows
  warm: lit(0xffb866, 1.6),
  bulb: lit(0xffd9a0, 2.6),
  /** The town fir tree's own lights: they go out when the fuse they run from is taken (`zarya/look.ts`). */
  treeBulb: lit(0xffd9a0, 2.6),
  ice: new THREE.MeshStandardMaterial({ color: 0x9fc8e8, emissive: 0x5aa0e0, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.1 }),
  redLamp: lit(0xff3020, 2.4),
  blueLamp: lit(0x4090ff, 2.0),
};

/** Colours a coat, a toy or a bolt of cloth can be. */
export const GOODS = [0xb3261e, 0x2f4f8f, 0x4f6f52, 0xd6aa3c, 0x7a3f6a, 0xd8cfb8, 0x3c6f8a, 0xe08a1e].map((c) => std(c, 0.85));

export function box(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0, cast = true): THREE.Mesh {
  return addBox(b, mat, x, y, z, sx, sy, sz, rot, { cast });
}

/** A cylinder (or cone, with r1 = 0) standing on `y`. */
export function cyl(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8, cast = true): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  b.add(m);
}

export function ball(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 8): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)), mat);
  m.position.set(x, y, z);
  m.scale.y = sy;
  b.add(m, { cast: false });
}

/** A box that is tilted: built at the origin, rotated, then placed (for roofs, awnings, the slide, the escalator). */
export function slab(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number, cast = true): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz, 'YXZ');
  m.castShadow = cast;
  m.receiveShadow = true;
  b.add(m);
}

/** Something solid that stops walkers and shots. */
export function solid(c: Ctx, x: number, z: number, w: number, d: number, h: number, tag: string, o: { rot?: number; shots?: boolean; kind?: 'building' | 'prop' | 'wall' | 'none'; surface?: 'wood' | 'metal' | 'concrete' | 'glass' } = {}) {
  return c.b.collide({ x, z, hx: w / 2, hz: d / 2, rot: o.rot ?? 0, y1: h, blocksShots: o.shots ?? true, mapKind: o.kind ?? 'prop', surface: o.surface ?? 'concrete', tag });
}

/** A lamp post: two globes on a crossarm and a horn loudspeaker (Nina's wire). `lightIt` gives it a real light. */
export function lampPost(c: Ctx, x: number, z: number, lightIt: boolean): void {
  const { b } = c;
  cyl(b, Z.iron, x, 0, z, 0.16, 0.09, 5.6, 8);
  cyl(b, Z.iron, x, 0, z, 0.28, 0.2, 0.5, 8);
  box(b, Z.iron, x, 5.5, z, 1.5, 0.08, 0.08);
  for (const s of [-1, 1]) {
    box(b, Z.iron, x + s * 0.7, 5.36, z, 0.05, 0.3, 0.05);
    ball(b, Z.bulb, x + s * 0.7, 5.1, z, 0.22);
  }
  // the horn, facing the middle of the square
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.06, 0.5, 10, 1, true), Z.grey);
  m.position.set(x, 4.3, z + 0.3);
  m.rotation.x = Math.PI / 2;
  b.add(m, { cast: false });
  box(b, Z.iron, x, 4.3, z + 0.06, 0.1, 0.1, 0.2);
  solid(c, x, z, 0.36, 0.36, 5.6, 'zarya-lamp', { kind: 'none', surface: 'metal' });
  if (lightIt) b.light({ x, y: 5, z, color: 0xffb060, intensity: 30, distance: 26, mode: 'steady', pool: 8, glow: 1.1, weight: 1.2 });
  else b.glow({ x, y: 5.1, z, color: 0xffb060, size: 1.1, intensity: 2.2, mode: 'steady' });
}

/** A fir tree of stacked cones under snow, strung with lights; `h` is its height. */
export function firTree(b: LevelBuilder, x: number, z: number, h: number, o: { lights?: boolean; star?: boolean; seed?: number; y?: number; bulb?: THREE.Material } = {}): void {
  const y0 = o.y ?? 0;
  const bulb = o.bulb ?? Z.bulb;
  const r = h * 0.3;
  const tiers = Math.max(3, Math.round(h / 1.6));
  cyl(b, Z.woodDark, x, y0, z, r * 0.14, r * 0.1, h * 0.18, 6);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const ty = y0 + h * (0.12 + t * 0.8);
    const tr = r * (1 - t * 0.82);
    const th = (h / tiers) * 1.7;
    cyl(b, Z.fir, x, ty, z, tr, 0, th, 9);
    // snow lying on each tier
    cyl(b, Z.snow, x, ty + th * 0.2, z, tr * 0.74, 0, th * 0.5, 9, false);
  }
  if (o.star) {
    for (const a of [0, Math.PI / 5]) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(h * 0.045), bulb);
      m.position.set(x, y0 + h * 1.04, z);
      m.rotation.set(0, a, a);
      m.scale.set(1, 1.5, 0.4);
      b.add(m, { cast: false });
    }
  }
  if (o.lights) {
    // garlands: bulbs spiralling down the cone, and glass ornaments between them
    let s = (o.seed ?? 7) * 9301 + 49297;
    const rnd = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const n = Math.round(h * 9);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const a = t * Math.PI * 9 + rnd() * 0.4;
      const rr = r * (1 - t * 0.8) * 0.86;
      const yy = y0 + h * (0.16 + t * 0.8);
      const px = x + Math.cos(a) * rr;
      const pz = z + Math.sin(a) * rr;
      if (i % 3 === 0) ball(b, GOODS[Math.floor(rnd() * 5)]!, px, yy - 0.12, pz, h * 0.016 + 0.03, 1, 6);
      else box(b, bulb, px, yy, pz, 0.07 + h * 0.004, 0.07 + h * 0.004, 0.07 + h * 0.004, 0, false);
    }
  }
}

/** A bench under snow, facing `yaw`. */
export function bench(c: Ctx, x: number, z: number, yaw: number): void {
  const { b } = c;
  box(b, Z.wood, x, 0.45, z, 1.9, 0.08, 0.5, yaw);
  box(b, Z.snow, x, 0.53, z, 1.9, 0.09, 0.5, yaw, false);
  const bx = -Math.sin(yaw) * -0.26;
  const bz = -Math.cos(yaw) * -0.26;
  box(b, Z.wood, x + bx, 0.78, z + bz, 1.9, 0.5, 0.07, yaw);
  for (const s of [-0.85, 0.85]) box(b, Z.iron, x + Math.cos(yaw) * s, 0.24, z - Math.sin(yaw) * s, 0.07, 0.48, 0.5, yaw);
  solid(c, x, z, 1.9, 0.6, 0.9, 'zarya-bench', { rot: yaw, shots: false, kind: 'none', surface: 'wood' });
}

/** A row of bulbs on a wire between two points. */
export function bulbString(b: LevelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n: number, sag = 0.25): void {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag;
    box(b, i % 4 === 0 ? Z.redLamp : Z.bulb, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, 0.08, 0.1, 0.08, 0, false);
  }
}

/** Goods on a shelf: a run of small coloured boxes along x (or along z when `alongZ`). */
export function goods(b: LevelBuilder, x: number, y: number, z: number, len: number, alongZ: boolean, seed: number, o: { h?: number; d?: number; mats?: readonly THREE.Material[]; step?: number } = {}): void {
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
    box(b, mats[Math.floor(rnd() * mats.length)]!, alongZ ? x : x + t, y + h / 2, alongZ ? z + t : z, alongZ ? d : w, h, alongZ ? w : d, 0, false);
  }
}

/** A glass-fronted shop counter: a wooden plinth, a pale top, goods laid inside. Solid to walkers, low enough to shoot over. */
export function counter(c: Ctx, x: number, z: number, len: number, alongZ: boolean, seed: number, o: { goods?: readonly THREE.Material[]; h?: number } = {}): void {
  const { b } = c;
  const h = o.h ?? 1.0;
  const w = alongZ ? 0.8 : len;
  const d = alongZ ? len : 0.8;
  box(b, Z.wood, x, h * 0.3, z, w, h * 0.6, d);
  box(b, Z.woodPale, x, h * 0.62, z, w * (alongZ ? 0.9 : 1), 0.04, d * (alongZ ? 1 : 0.9), 0, false);
  goods(b, x, h * 0.64, z, len - 0.3, alongZ, seed, { mats: o.goods, h: 0.2 });
  box(b, Z.steel, x, h, z, w + 0.04, 0.05, d + 0.04, 0, false);
  for (const s of [-1, 1]) box(b, Z.steel, alongZ ? x : x + (s * len) / 2, h * 0.8, alongZ ? z + (s * len) / 2 : z, 0.05, h * 0.4, 0.05, 0, false);
  solid(c, x, z, w, d, h, 'zarya-counter', { shots: false, kind: 'prop', surface: 'wood' });
}

/** Shelving against a wall, full of goods; `face` is the way it looks (+1 / -1 along z, or along x when `alongZ`). */
export function shelves(c: Ctx, x: number, z: number, len: number, alongZ: boolean, seed: number, o: { goods?: readonly THREE.Material[]; h?: number; rows?: number; goodsH?: number } = {}): void {
  const { b } = c;
  const h = o.h ?? 2.6;
  const w = alongZ ? 0.5 : len;
  const d = alongZ ? len : 0.5;
  box(b, Z.woodDark, x, h / 2, z, w, h, d);
  const rows = o.rows ?? 4;
  for (let i = 0; i < rows; i++) {
    const y = 0.35 + (i * (h - 0.5)) / rows;
    box(b, Z.woodPale, x + (alongZ ? 0.06 : 0), y, z + (alongZ ? 0 : 0.06), alongZ ? 0.56 : len, 0.04, alongZ ? len : 0.56, 0, false);
    goods(b, x + (alongZ ? 0.2 : 0), y + 0.02, z + (alongZ ? 0 : 0.2), len - 0.2, alongZ, seed + i * 31, { mats: o.goods, h: o.goodsH ?? 0.3 });
  }
  solid(c, x, z, w + 0.2, d + 0.2, h, 'zarya-shelves', { kind: 'prop', surface: 'wood' });
}

/** A crate of mandarins. */
export function mandarins(c: Ctx, x: number, z: number, w: number, d: number): void {
  const { b } = c;
  box(b, Z.woodPale, x, 0.3, z, w, 0.6, d);
  for (let i = 0; i < w * d * 9; i++) {
    const px = x - w / 2 + 0.15 + ((i * 0.618) % 1) * (w - 0.3);
    const pz = z - d / 2 + 0.15 + ((i * 0.381) % 1) * (d - 0.3);
    ball(b, Z.orange, px, 0.64, pz, 0.09, 1, 5);
  }
  solid(c, x, z, w, d, 0.7, 'zarya-crate', { shots: false, kind: 'none', surface: 'wood' });
}

/** Paper garlands across a room: little flags on a line. */
export function garland(b: LevelBuilder, x0: number, z0: number, x1: number, z1: number, y: number, n: number): void {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const yy = y - Math.sin(t * Math.PI) * 0.5;
    box(b, i % 2 ? Z.red : Z.white, x0 + (x1 - x0) * t, yy, z0 + (z1 - z0) * t, 0.22, 0.22, 0.03, Math.atan2(-(z1 - z0), x1 - x0), false);
  }
}
