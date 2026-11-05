/**
 * The Sakura District's street faces: what a closed building block shows a road. Floor lines, framed windows (a few
 * still lit, some behind their storm shutters), air-conditioner units, drainpipes, balconies on the flats, a vertical
 * shop sign, a parapet, and the roof's water tank, aerials and condensers. Everything is a plain box or cylinder in an
 * existing material (the sign on the shared atlas), so it all goes into the merged static batches: triangles, not draw
 * calls (boxes bake with addBox's shadow flags, panes and signs with the window and sign batches'). Nothing here collides (it sits on the wall, or on the roof out of reach).
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../../builder';
import type { MaterialName } from '../../materials';
import { MAT, signTile, tilePlane } from './props';

export type FaceSide = 'N' | 'S' | 'E' | 'W';

export interface StreetFaceSpec {
  /** The face's centre on the wall line, and which way it looks. */
  x: number;
  z: number;
  side: FaceSide;
  /** Its width along the wall, the block's height, and its depth back from the face (for the roof). */
  w: number;
  h: number;
  d: number;
  /** shop: a shutter or a back door on the ground floor; flats: balconies on every floor above it. */
  kind: 'shop' | 'flats' | 'house';
  seed: number;
  floorHeight?: number;
  /** A vertical sign hung off the face (the shop's name, read top to bottom). */
  sign?: { text: string; color: string };
}

const YAW: Record<FaceSide, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

const m = (b: LevelBuilder, name: MaterialName): THREE.Material => b.mats.get(name);

/** Shared geometries (each bake copies them, so one of each is enough). */
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  plane: new THREE.PlaneGeometry(1, 1),
};

/** Dress one street face of a closed block. */
export function streetFace(b: LevelBuilder, s: StreetFaceSpec): void {
  let seed = (s.seed * 2654435761) >>> 0 || 1;
  const r = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  g.rotation.y = YAW[s.side];
  // local frame: x along the wall, +z out of it, the wall face at z = 0
  const box = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
    const mesh = new THREE.Mesh(GEO.box, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  };
  const cyl = (mat: THREE.Material, x: number, y: number, z: number, rad: number, h: number): void => {
    const mesh = new THREE.Mesh(GEO.cyl, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(rad, h, rad);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  };
  const pane = (mat: THREE.Material, x: number, y: number, w: number, h: number): void => {
    const mesh = new THREE.Mesh(GEO.plane, mat);
    mesh.position.set(x, y, 0.03);
    mesh.scale.set(w, h, 1);
    g.add(mesh);
  };

  const dark = m(b, 'concreteDark');
  const steel = m(b, 'steelDark');
  const white = m(b, 'paintWhite');
  const glass = m(b, 'glassDark');
  const lit = m(b, 'windowLit');
  const shutter = m(b, 'corrugated');
  const rail = m(b, 'steel');
  const fh = s.floorHeight ?? 3.2;
  const half = s.w / 2;

  // ---- the parapet and the floor lines ----
  box(dark, 0, s.h - 0.15, 0.12, s.w + 0.1, 0.5, 0.3);
  const floors = Math.max(1, Math.floor((s.h - 0.8) / fh));
  for (let f = 1; f < floors; f++) box(dark, 0, f * fh, 0.06, s.w, 0.16, 0.14);

  // ---- the ground floor ----
  if (s.kind === 'shop') {
    // the service side: a steel back door, a roller shutter on the stockroom, the gas meters
    const dx = -half + 1.2 + r() * Math.max(0.2, s.w * 0.25);
    box(steel, dx, 1.05, 0.04, 0.95, 2.1, 0.08);
    box(dark, dx, 2.2, 0.25, 1.4, 0.08, 0.6); // its little canopy
    if (s.w > 5) {
      const sx = half - 1.9;
      box(shutter, sx, 1.25, 0.05, 2.6, 2.5, 0.06);
      box(steel, sx, 2.6, 0.12, 2.8, 0.25, 0.25); // the shutter box
    }
    box(m(b, 'steel'), dx + 1.3, 1.1, 0.1, 0.5, 0.6, 0.18);
  } else if (s.kind === 'house') {
    const dx = (r() - 0.5) * (s.w - 3);
    box(m(b, 'wood'), dx, 1.05, 0.04, 1.1, 2.1, 0.08);
    box(MAT.tileRoof(), dx, 2.45, 0.35, 1.8, 0.1, 0.8);
  } else {
    // the flats' entrance: glass doors in a frame, letterboxes
    const dx = (r() - 0.5) * (s.w - 4);
    pane(glass, dx, 1.2, 1.8, 2.3);
    box(steel, dx, 2.4, 0.05, 2.0, 0.12, 0.1);
    box(dark, dx, 2.7, 0.6, 2.6, 0.12, 1.2);
  }

  // ---- the floors above: windows in bays, shutters, AC units, balconies ----
  const bay = s.kind === 'flats' ? 3.2 : 2.6;
  const n = Math.max(1, Math.floor((s.w - 0.8) / bay));
  const step = s.w / n;
  for (let f = 1; f < floors; f++) {
    const y0 = f * fh;
    for (let i = 0; i < n; i++) {
      const x = -half + step * (i + 0.5);
      const ww = Math.min(step - 0.9, s.kind === 'flats' ? 1.8 : 1.3);
      const wh = 1.35;
      const cy = y0 + 0.95 + wh / 2;
      if (cy + wh / 2 > s.h - 0.45) continue;
      const roll = r();
      if (roll < 0.18) {
        // the storm shutter pulled down
        box(shutter, x, cy, 0.05, ww + 0.1, wh + 0.1, 0.05);
      } else {
        pane(roll > 0.9 ? lit : glass, x, cy, ww, wh);
        if (r() < 0.5) box(steel, x, cy, 0.05, 0.05, wh, 0.05); // the mullion
      }
      // frame: head, sill
      box(steel, x, cy + wh / 2 + 0.05, 0.05, ww + 0.16, 0.08, 0.1);
      box(dark, x, cy - wh / 2 - 0.05, 0.1, ww + 0.3, 0.1, 0.2);
      if (s.kind === 'flats') {
        // a balcony per bay: the slab, a solid front, the AC unit on it, now and then washing poles
        box(dark, x, y0 + 0.1, 0.55, step - 0.2, 0.18, 1.1);
        box(white, x, y0 + 0.65, 1.07, step - 0.2, 0.9, 0.06);
        if (r() < 0.6) box(white, x + ww / 2 + 0.2, y0 + 0.5, 0.45, 0.75, 0.55, 0.28);
        if (r() < 0.3) box(rail, x, y0 + 1.9, 0.9, step - 0.4, 0.03, 0.03);
      } else if (r() < 0.45) {
        // an AC unit under the window on its bracket
        const ax = x + (r() - 0.5) * 0.6;
        box(white, ax, cy - wh / 2 - 0.45, 0.2, 0.75, 0.55, 0.32);
        box(steel, ax, cy - wh / 2 - 0.76, 0.2, 0.8, 0.05, 0.36);
      }
    }
  }
  // the AC pipes and the drainpipes running down the face
  for (const px of [-half + 0.25, half - 0.25]) {
    if (r() < 0.75) box(steel, px, s.h / 2, 0.12, 0.12, s.h - 0.2, 0.12);
  }

  // ---- a vertical sign hung off the face, reading down ----
  if (s.sign && s.h > 5) {
    const sh = Math.min(3.4, s.h - 3);
    const sx = (r() < 0.5 ? -1 : 1) * (half - 1);
    const sg = new THREE.Group();
    const back = new THREE.Mesh(GEO.box, MAT.blackLacquer());
    back.scale.set(0.12, sh, 0.8);
    sg.add(back);
    for (const k of [-1, 1]) {
      const face = tilePlane(sh / 2.6, sh, signTile(s.sign.text, { bg: s.sign.color, fg: '#ffffff', vertical: true, aspect: 1 / 2.6, worn: 0.75 }));
      face.position.x = k * 0.065;
      face.rotation.y = (k * Math.PI) / 2;
      face.scale.x = 0.8 / (sh / 2.6);
      sg.add(face);
    }
    sg.position.set(sx, s.h - 1.2 - sh / 2, 0.55);
    g.add(sg);
    box(steel, sx, s.h - 1.0, 0.3, 0.06, 0.06, 0.6);
    box(steel, sx, s.h - 1.2 - sh + 0.2, 0.3, 0.06, 0.06, 0.6);
  }

  // ---- the roof: condensers, a water tank on legs, an aerial ----
  const rz = -Math.min(s.d * 0.5, 4);
  const roofY = s.h + 0.3;
  if (r() < 0.7) {
    const k = 1 + Math.floor(r() * 3);
    for (let i = 0; i < k; i++) box(white, -half + 1.2 + i * 1.1, roofY + 0.3, rz + 0.6, 0.85, 0.6, 0.4);
  }
  if (s.w > 5 && r() < 0.55) {
    const tx = (r() - 0.5) * (s.w - 3);
    for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]] as const) box(steel, tx + lx, roofY + 0.6, rz + lz, 0.08, 1.2, 0.08);
    cyl(MAT.white(), tx, roofY + 1.8, rz, 0.95, 1.3);
    cyl(steel, tx, roofY + 2.5, rz, 1.0, 0.1);
  }
  if (r() < 0.5) {
    const ax = (r() - 0.5) * (s.w - 2);
    box(steel, ax, roofY + 1.5, rz - 1, 0.05, 3, 0.05);
    box(steel, ax, roofY + 2.6, rz - 1, 1.4, 0.04, 0.04);
    box(steel, ax, roofY + 2.2, rz - 1, 1.0, 0.04, 0.04);
  }
  if (s.w > 7 && r() < 0.3) box(m(b, 'concreteWall'), (r() - 0.5) * (s.w - 4), roofY + 1.1, rz - 0.5, 2.6, 2.2, 2.4); // the stair head

  g.updateMatrixWorld(true);
  b.add(g);
}

export interface TrimSpec {
  /** The block's footprint (its outer wall faces) and height. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
  /** Heights of the floor lines. */
  bands?: number[];
  /** Pilasters at about this spacing (none: no pilasters). */
  pilasterEvery?: number;
  faces?: FaceSide[];
  /** Doorways and windows to keep pilasters off, per face: the world x (N, S) or z (E, W) of the gap, and its width. */
  clear?: Partial<Record<FaceSide, [number, number][]>>;
  material?: MaterialName;
}

/**
 * Trim for a plain building mass: a plinth, floor lines, a deep cornice and a parapet coping, and pilasters between
 * the openings. Merged static boxes, no colliders (they stand proud of the wall by a hand's width).
 */
export function trimBlock(b: LevelBuilder, s: TrimSpec): void {
  const g = new THREE.Group();
  const mat = m(b, s.material ?? 'concreteDark');
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
    const mesh = new THREE.Mesh(GEO.box, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  };
  const W = s.x1 - s.x0;
  const D = s.z1 - s.z0;
  const cx = (s.x0 + s.x1) / 2;
  const cz = (s.z0 + s.z1) / 2;
  for (const side of s.faces ?? (['N', 'S', 'E', 'W'] as FaceSide[])) {
    const alongX = side === 'N' || side === 'S';
    const len = alongX ? W : D;
    const out = side === 'S' || side === 'E' ? 1 : -1;
    const fx = alongX ? cx : side === 'E' ? s.x1 : s.x0;
    const fz = alongX ? (side === 'S' ? s.z1 : s.z0) : cz;
    const strip = (y: number, hgt: number, depth: number, extra = 0): void => {
      const L = len + 2 * extra;
      if (alongX) box(fx, y, fz + (out * depth) / 2, L, hgt, depth);
      else box(fx + (out * depth) / 2, y, fz, depth, hgt, L);
    };
    strip(0.35, 0.7, 0.12, 0.06); // plinth
    for (const y of s.bands ?? []) strip(y, 0.18, 0.14, 0.07);
    strip(s.h - 0.35, 0.3, 0.35, 0.17); // cornice
    strip(s.h - 0.12, 0.16, 0.22, 0.11);
    if (s.pilasterEvery) {
      const n = Math.max(1, Math.round(len / s.pilasterEvery));
      const gaps = s.clear?.[side] ?? [];
      for (let i = 0; i <= n; i++) {
        const t = (alongX ? s.x0 : s.z0) + (len * i) / n;
        if (gaps.some(([c, w]) => Math.abs(t - c) < w / 2 + 0.35)) continue;
        const px = alongX ? t : fx + out * 0.09;
        const pz = alongX ? fz + out * 0.09 : t;
        box(px, (s.h - 0.5) / 2, pz, alongX ? 0.45 : 0.18, s.h - 0.5, alongX ? 0.18 : 0.45);
      }
    }
  }
  g.updateMatrixWorld(true);
  b.add(g);
}

/** A wall clock: a white face in a dark rim, its hands stopped at `time` (hours, 0-12). */
export function wallClock(b: LevelBuilder, o: { x: number; y: number; z: number; side: FaceSide; r?: number; time?: number }): void {
  const r = o.r ?? 0.7;
  const g = new THREE.Group();
  g.position.set(o.x, o.y, o.z);
  g.rotation.y = YAW[o.side];
  const disc = (mat: THREE.Material, rad: number, z: number, depth: number): void => {
    const mesh = new THREE.Mesh(GEO.cyl, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = z;
    mesh.scale.set(rad, depth, rad);
    g.add(mesh);
  };
  disc(m(b, 'steelDark'), r + 0.08, 0.06, 0.12);
  disc(MAT.paper(), r, 0.13, 0.04);
  const t = o.time ?? 9.78; // 21:47
  const hand = (len: number, w: number, a: number): void => {
    const mesh = new THREE.Mesh(GEO.box, MAT.blackLacquer());
    mesh.scale.set(w, len, 0.03);
    mesh.position.set(Math.sin(a) * len * 0.45, Math.cos(a) * len * 0.45, 0.17);
    mesh.rotation.z = -a;
    g.add(mesh);
  };
  hand(r * 0.55, 0.07, (t / 12) * Math.PI * 2);
  hand(r * 0.85, 0.045, ((t % 1) * Math.PI * 2));
  g.updateMatrixWorld(true);
  b.add(g);
}

/** A low barrel vault over a hall (the gym's roof): its axis along X, from x0 to x1, springing at `y` across z0..z1. */
export function vaultRoof(b: LevelBuilder, o: { x0: number; x1: number; z0: number; z1: number; y: number; rise: number }): void {
  const half = (o.z1 - o.z0) / 2 + 0.3;
  const geo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, false, 0, Math.PI);
  const mesh = new THREE.Mesh(geo, b.mats.get('corrugated'));
  mesh.rotation.z = Math.PI / 2;
  mesh.scale.set(o.rise, o.x1 - o.x0 + 0.6, half);
  mesh.position.set((o.x0 + o.x1) / 2, o.y, (o.z0 + o.z1) / 2);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.updateMatrixWorld(true);
  b.add(mesh);
}
