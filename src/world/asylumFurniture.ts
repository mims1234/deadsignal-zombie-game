/**
 * Blackwood Hill's own furniture: iron beds, chairs, bedside cabinets, wheelchairs, filing and medicine cabinets, a
 * hydrotherapy tub, a nurse's trolley, bookshelves, and the chapel's fittings (the cross, candles, the lectern, the
 * vigil lanterns' iron posts). Same conventions as `interiors.ts`: parts in local space (the front faces local +Z,
 * long things run along local X), baked into one merged mesh per piece, no shadows (interior lamps are unshadowed),
 * a box collider for anything you could walk into. `y` is the floor (an upper storey's furniture sits on its floor).
 */
import * as THREE from 'three';
import { modelProp } from '../models/library';
import type { LevelBuilder } from './builder';
import { Assembly, cached, emissiveMat, seedFrom } from './landmarks/util';
import type { Place } from './props';

const solid = (key: string, hex: number, rough = 0.7, metal = 0.1): THREE.MeshStandardMaterial =>
  cached(`asy:${key}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
const mk = (o: Place): Assembly => new Assembly(o.x, o.y ?? 0, o.z, o.rot ?? 0, { cast: false });

/** A tiny deterministic random source per piece (so the hill is the same every run). */
function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const IRON = (): THREE.MeshStandardMaterial => solid('iron', 0x2e3236, 0.55, 0.6);
const CHIPPED = (): THREE.MeshStandardMaterial => solid('chipped', 0xc9c6b8, 0.6, 0.25);
const WOOD = (): THREE.MeshStandardMaterial => solid('wood', 0x5a4330, 0.75, 0.05);
const WOOD_DARK = (): THREE.MeshStandardMaterial => solid('woodDark', 0x3a2a1e, 0.7, 0.05);

/** An iron hospital bed, 2.0 x 0.95 m along local X, the head at -X: a thin striped mattress, sometimes a blanket. */
export function ironBed(b: LevelBuilder, o: Place & { made?: boolean; seed?: number }): void {
  const r = rand(seedFrom(o.x, o.z, o.seed ?? 7));
  const a = mk(o);
  // the scanned iron bed (when its model is loaded for this map), on the same collider
  if (modelProp(b, 'wardBed', o.x, o.y ?? 0, o.z, o.rot ?? 0)) {
    a.collide(b, 0, 0, 2.0, 0.95, 0.65, { mapKind: 'prop', surface: 'metal', tag: 'bed' });
    return;
  }
  const frame = CHIPPED();
  const ticking = solid('ticking', 0xb7b19a, 0.95, 0);
  const blanket = solid(r() < 0.5 ? 'blanketGrey' : 'blanketGreen', r() < 0.5 ? 0x5d6058 : 0x4c5a4a, 0.95, 0);
  const sheet = solid('sheet', 0xd8d4c6, 0.95, 0);
  // the head and foot rails, the side rails, the legs
  for (const [x, h] of [[-0.98, 1.05], [0.98, 0.8]] as const) {
    a.box(frame, 0.04, h, 0.04, x, h / 2, -0.44);
    a.box(frame, 0.04, h, 0.04, x, h / 2, 0.44);
    a.box(frame, 0.04, 0.04, 0.92, x, h - 0.02, 0);
    a.box(frame, 0.04, 0.04, 0.92, x, 0.48, 0);
    for (let i = -2; i <= 2; i++) a.box(frame, 0.02, h - 0.5, 0.02, x, 0.48 + (h - 0.5) / 2, i * 0.17);
  }
  for (const z of [-0.44, 0.44]) a.box(frame, 1.96, 0.04, 0.04, 0, 0.42, z);
  // the mattress, the pillow, a blanket or a twisted sheet
  a.box(ticking, 1.88, 0.12, 0.86, 0, 0.5, 0);
  a.box(sheet, 0.42, 0.1, 0.6, -0.72, 0.6, 0, { ry: (r() - 0.5) * 0.3 });
  if (o.made ?? r() < 0.6) a.box(blanket, 1.3, 0.04, 0.9, 0.28, 0.58, 0);
  else a.box(sheet, 1.1, 0.06, 0.5, 0.2, 0.59, (r() - 0.5) * 0.3, { ry: (r() - 0.5) * 0.8 });
  a.collide(b, 0, 0, 2.0, 0.95, 0.65, { mapKind: 'prop', surface: 'metal', tag: 'bed' });
  a.commit(b, { cast: false });
}

/** A plain wooden chair (0.45 m square), facing local +Z; `tipped` lies on its back. */
export function chair(b: LevelBuilder, o: Place & { tipped?: boolean }): void {
  const a = mk(o);
  if (!o.tipped && modelProp(b, 'woodChair', o.x, o.y ?? 0, o.z, o.rot ?? 0)) return;
  const w = WOOD();
  if (o.tipped) {
    // on its back: the seat stands upright, the legs point along +Z
    a.box(w, 0.44, 0.44, 0.04, 0, 0.24, 0.02);
    a.box(w, 0.44, 0.04, 0.48, 0, 0.03, -0.22);
    for (const x of [-0.19, 0.19]) for (const y of [0.05, 0.42]) a.box(w, 0.035, 0.035, 0.44, x, y, 0.24);
  } else {
    a.box(w, 0.44, 0.04, 0.44, 0, 0.46, 0);
    for (const x of [-0.19, 0.19]) for (const z of [-0.19, 0.19]) a.box(w, 0.035, 0.46, 0.035, x, 0.23, z);
    a.box(w, 0.035, 0.5, 0.035, -0.19, 0.73, -0.19);
    a.box(w, 0.035, 0.5, 0.035, 0.19, 0.73, -0.19);
    a.box(w, 0.42, 0.12, 0.03, 0, 0.88, -0.19);
  }
  a.commit(b, { cast: false });
}

/** A bedside cabinet (0.45 x 0.4 x 0.75 m), its door to local +Z, a cup or a book on top. */
export function bedside(b: LevelBuilder, o: Place): void {
  const a = mk(o);
  if (modelProp(b, 'nightstand', o.x, o.y ?? 0, o.z, o.rot ?? 0)) {
    a.collide(b, 0, 0, 0.45, 0.4, 0.75, { mapKind: 'prop', surface: 'metal', tag: 'bedside' });
    return;
  }
  const r = rand(seedFrom(o.x, o.z, 11));
  a.box(CHIPPED(), 0.45, 0.72, 0.4, 0, 0.36, 0);
  a.box(solid('cabDoor', 0xb3b0a2, 0.6, 0.2), 0.39, 0.4, 0.02, 0, 0.3, 0.205);
  a.box(IRON(), 0.08, 0.02, 0.03, 0.12, 0.42, 0.22);
  if (r() < 0.5) a.cyl(solid('enamel', 0xd8d8cc, 0.4, 0.1), 0.045, 0.1, 0.05, 0.77, 0.02, 10);
  else a.box(solid('book', 0x6a2a24, 0.8, 0), 0.16, 0.04, 0.22, -0.04, 0.74, 0, { ry: r() });
  a.collide(b, 0, 0, 0.45, 0.4, 0.75, { mapKind: 'prop', surface: 'metal', tag: 'bedside' });
  a.commit(b, { cast: false });
}

/** An old wheelchair (cane seat, big wheels), facing local +Z. */
export function wheelchair(b: LevelBuilder, o: Place): void {
  const a = mk(o);
  if (modelProp(b, 'wheelchair', o.x, o.y ?? 0, o.z, o.rot ?? 0)) {
    a.collide(b, 0, 0, 0.7, 0.75, 0.9, { mapKind: 'prop', surface: 'metal', tag: 'wheelchair' });
    return;
  }
  const iron = IRON();
  const cane = solid('cane', 0x8a6a42, 0.85, 0);
  const rubber = solid('rubber', 0x141414, 0.9, 0);
  a.box(cane, 0.46, 0.04, 0.44, 0, 0.5, 0);
  a.box(cane, 0.46, 0.5, 0.04, 0, 0.78, -0.22, { rx: -0.12 });
  for (const x of [-0.27, 0.27]) {
    const wheel = new THREE.TorusGeometry(0.3, 0.025, 6, 20);
    wheel.rotateY(Math.PI / 2);
    a.mesh(wheel, rubber, x, 0.32, -0.08);
    a.box(iron, 0.02, 0.5, 0.02, x, 0.32, -0.08, { rx: 0.6 });
    a.box(iron, 0.02, 0.5, 0.02, x, 0.32, -0.08, { rx: -0.6 });
    a.cyl(rubber, 0.05, 0.04, x * 0.8, 0.05, 0.28, 8);
    a.box(iron, 0.03, 0.03, 0.5, x * 0.85, 0.64, 0.02); // the arm rests
  }
  a.box(iron, 0.4, 0.02, 0.14, 0, 0.14, 0.36); // the foot plate
  a.collide(b, 0, 0, 0.7, 0.75, 0.9, { mapKind: 'prop', surface: 'metal', tag: 'wheelchair' });
  a.commit(b, { cast: false });
}

/** A run of steel filing cabinets (0.5 m wide, 1.3 m tall each), drawers to local +Z; one hangs open. */
export function filingCabinets(b: LevelBuilder, o: Place & { count?: number }): void {
  const n = o.count ?? 2;
  const a = mk(o);
  const r = rand(seedFrom(o.x, o.z, 13));
  const body = solid('filing', 0x6c7468, 0.5, 0.35);
  const dark = solid('filingDark', 0x1a1d1e, 0.7, 0.2);
  const paper = solid('paper', 0xd9d5c4, 0.9, 0);
  const total = n * 0.5;
  a.box(body, total, 1.3, 0.6, 0, 0.65, 0);
  for (let i = 0; i < n; i++) {
    const cx = -total / 2 + 0.25 + i * 0.5;
    const open = r() < 0.35 ? Math.floor(r() * 4) : -1;
    for (let k = 0; k < 4; k++) {
      const y = 0.18 + k * 0.31;
      const out = k === open ? 0.32 : 0;
      a.box(body, 0.46, 0.27, 0.03, cx, y, 0.31 + out);
      a.box(dark, 0.12, 0.02, 0.03, cx, y + 0.07, 0.33 + out);
      if (out) {
        a.box(body, 0.44, 0.22, out, cx, y - 0.01, 0.3 + out / 2);
        a.box(paper, 0.4, 0.2, out - 0.04, cx, y + 0.03, 0.3 + out / 2);
      }
    }
  }
  a.collide(b, 0, 0, total, 0.62, 1.32, { mapKind: 'prop', surface: 'metal', tag: 'filing' });
  a.commit(b, { cast: false });
}

/** A glass-fronted medicine cabinet (1.0 x 1.8 x 0.4 m), its front to local +Z: rows of brown bottles. */
export function medicineCabinet(b: LevelBuilder, o: Place): void {
  const a = mk(o);
  if (modelProp(b, 'wardCabinet', o.x, o.y ?? 0, o.z, o.rot ?? 0)) {
    a.collide(b, 0, 0, 1.0, 0.42, 1.8, { mapKind: 'prop', surface: 'wood', tag: 'cabinet' });
    return;
  }
  const r = rand(seedFrom(o.x, o.z, 17));
  const body = CHIPPED();
  const glass = cached('asy:cabGlass', () => new THREE.MeshStandardMaterial({ color: 0x8aa0a0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false }));
  const brown = solid('bottle', 0x5a3412, 0.3, 0.1);
  const white = solid('pot', 0xe0ddd2, 0.5, 0.05);
  a.box(body, 1.0, 1.8, 0.04, 0, 0.9, -0.18); // back
  for (const x of [-0.48, 0.48]) a.box(body, 0.04, 1.8, 0.4, x, 0.9, 0);
  a.box(body, 1.0, 0.04, 0.4, 0, 1.78, 0);
  for (let k = 0; k < 4; k++) {
    const y = 0.12 + k * 0.44;
    a.box(body, 0.92, 0.03, 0.36, 0, y, 0);
    for (let i = 0; i < 6; i++) {
      if (r() < 0.3) continue;
      const x = -0.38 + i * 0.15 + (r() - 0.5) * 0.04;
      if (r() < 0.7) a.cyl(brown, 0.03 + r() * 0.015, 0.12 + r() * 0.08, x, y + 0.08, (r() - 0.5) * 0.15, 8);
      else a.cyl(white, 0.04, 0.08, x, y + 0.055, (r() - 0.5) * 0.15, 8);
    }
  }
  a.box(glass, 0.92, 1.68, 0.01, 0, 0.92, 0.19);
  a.collide(b, 0, 0, 1.0, 0.42, 1.8, { mapKind: 'prop', surface: 'wood', tag: 'cabinet' });
  a.commit(b, { cast: false });
}

/** A bookshelf (1.2 x 2.0 x 0.35 m), front to local +Z, with ledgers and boxes. */
export function bookshelf(b: LevelBuilder, o: Place): void {
  const a = mk(o);
  if (modelProp(b, 'bookshelf', o.x, o.y ?? 0, o.z, o.rot ?? 0)) {
    a.collide(b, 0, 0, 1.2, 0.36, 2.0, { mapKind: 'prop', surface: 'wood', tag: 'shelf' });
    return;
  }
  const r = rand(seedFrom(o.x, o.z, 19));
  const w = WOOD_DARK();
  const spines = [0x6a2a24, 0x2a3a5a, 0x3a4a2a, 0x7a6a4a, 0x4a3a2a, 0x2a2a2a];
  a.box(w, 1.2, 2.0, 0.03, 0, 1.0, -0.16);
  for (const x of [-0.585, 0.585]) a.box(w, 0.03, 2.0, 0.35, x, 1.0, 0);
  for (let k = 0; k < 5; k++) {
    const y = 0.05 + k * 0.47;
    a.box(w, 1.14, 0.03, 0.33, 0, y, 0);
    if (k === 4) continue;
    let x = -0.54;
    while (x < 0.5) {
      const t = 0.03 + r() * 0.05;
      if (r() < 0.12) {
        x += 0.1;
        continue;
      }
      const h = 0.24 + r() * 0.14;
      const c = spines[Math.floor(r() * spines.length)]!;
      a.box(solid(`spine${c}`, c, 0.85, 0), t, h, 0.24, x + t / 2, y + 0.015 + h / 2, 0.02);
      x += t + 0.004;
    }
  }
  a.collide(b, 0, 0, 1.2, 0.36, 2.0, { mapKind: 'prop', surface: 'wood', tag: 'shelf' });
  a.commit(b, { cast: false });
}

/** A claw-foot hydrotherapy tub (1.7 x 0.8 m along local X) with its canvas restraint cover half drawn. */
export function bathtub(b: LevelBuilder, o: Place): void {
  const a = mk(o);
  const enamel = solid('tub', 0xd6d3c8, 0.3, 0.1);
  const canvas = solid('canvas', 0x9a8e6a, 0.95, 0);
  const water = solid('tubWater', 0x1e2a24, 0.15, 0.2);
  a.box(enamel, 1.7, 0.08, 0.8, 0, 0.18, 0);
  a.box(enamel, 1.7, 0.5, 0.06, 0, 0.45, -0.37);
  a.box(enamel, 1.7, 0.5, 0.06, 0, 0.45, 0.37);
  a.box(enamel, 0.06, 0.5, 0.8, -0.82, 0.45, 0);
  a.box(enamel, 0.06, 0.5, 0.8, 0.82, 0.45, 0);
  a.box(water, 1.58, 0.02, 0.68, 0, 0.5, 0);
  for (const x of [-0.7, 0.7]) for (const z of [-0.3, 0.3]) a.sphere(IRON(), 0.07, x, 0.08, z, 8);
  a.box(canvas, 0.9, 0.03, 0.86, -0.38, 0.71, 0, { rz: 0.04 });
  a.box(IRON(), 0.04, 0.4, 0.04, 0.86, 0.9, -0.3); // the tap
  a.collide(b, 0, 0, 1.75, 0.85, 0.72, { mapKind: 'prop', surface: 'metal', tag: 'tub' });
  a.commit(b, { cast: false });
}

/** A nurse's trolley (0.9 x 0.5 m along local X): two trays of kidney dishes, bottles and a dropped chart. */
export function trolley(b: LevelBuilder, o: Place): void {
  const a = mk(o);
  if (modelProp(b, 'wardCart', o.x, o.y ?? 0, o.z, o.rot ?? 0)) {
    a.collide(b, 0, 0, 0.95, 0.55, 0.9, { mapKind: 'prop', surface: 'metal', tag: 'trolley' });
    return;
  }
  const steel = solid('trolley', 0xa7aeb2, 0.35, 0.5);
  for (const y of [0.3, 0.85]) a.box(steel, 0.9, 0.03, 0.5, 0, y, 0);
  for (const x of [-0.42, 0.42]) for (const z of [-0.22, 0.22]) a.box(steel, 0.025, 0.85, 0.025, x, 0.44, z);
  a.cyl(solid('bottle', 0x5a3412, 0.3, 0.1), 0.035, 0.16, -0.25, 0.95, 0.1, 8);
  a.cyl(solid('pot', 0xe0ddd2, 0.5, 0.05), 0.04, 0.08, -0.1, 0.91, -0.12, 8);
  a.box(steel, 0.24, 0.04, 0.12, 0.2, 0.89, 0.05, { ry: 0.3 });
  a.box(solid('paper', 0xd9d5c4, 0.9, 0), 0.22, 0.01, 0.3, 0.12, 0.33, 0, { ry: -0.4 });
  a.collide(b, 0, 0, 0.95, 0.55, 0.9, { mapKind: 'prop', surface: 'metal', tag: 'trolley' });
  a.commit(b, { cast: false });
}

/** Loose paper on the floor around (x, z): a dropped file's worth. */
export function papers(b: LevelBuilder, o: Place & { n?: number; spread?: number }): void {
  const a = mk(o);
  const r = rand(seedFrom(o.x, o.z, 23));
  const paper = solid('paper', 0xd9d5c4, 0.9, 0);
  const old = solid('paperOld', 0xb8ae8c, 0.9, 0);
  const n = o.n ?? 6;
  const s = o.spread ?? 0.8;
  for (let i = 0; i < n; i++) a.box(i % 3 === 0 ? old : paper, 0.21, 0.003, 0.29, (r() - 0.5) * 2 * s, 0.006 + i * 0.0015, (r() - 0.5) * 2 * s, { ry: r() * Math.PI });
  a.commit(b, { cast: false });
}

/** A thin padded mattress on a cell floor (1.9 x 0.8 m along local X). */
export function floorMattress(b: LevelBuilder, o: Place): void {
  const a = mk(o);
  a.box(solid('padded', 0x9c9886, 0.95, 0), 1.9, 0.1, 0.8, 0, 0.05, 0);
  a.box(solid('sheet', 0xd8d4c6, 0.95, 0), 0.4, 0.08, 0.55, -0.7, 0.13, 0);
  a.commit(b, { cast: false });
}

// ---------------------------------------------------------------------------------------------
// the chapel
// ---------------------------------------------------------------------------------------------

/** A wooden cross on a wall, its face to local +Z (`h` tall). */
export function wallCross(b: LevelBuilder, o: Place & { h?: number }): void {
  const a = mk(o);
  const h = o.h ?? 2.2;
  const w = WOOD_DARK();
  a.box(w, 0.16, h, 0.08, 0, 0, 0);
  a.box(w, h * 0.55, 0.16, 0.08, 0, h * 0.2, 0);
  a.commit(b, { cast: false });
}

/** Candles at (x, z) on a surface at `y`: wax sticks with small steady flames (emissive; the altar's lamp lights them). */
export function candles(b: LevelBuilder, o: Place & { n?: number; spread?: number }): void {
  const a = mk(o);
  const r = rand(seedFrom(o.x, o.z, 29));
  const wax = solid('wax', 0xe8e0c8, 0.6, 0);
  const flame = cached('asy:flame', () => emissiveMat(0xffb050, 3.2, 0x3a1a00));
  const n = o.n ?? 5;
  const s = o.spread ?? 0.4;
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 2 * s;
    const z = (r() - 0.5) * 0.3;
    const h = 0.12 + r() * 0.22;
    a.cyl(wax, 0.025, h, x, h / 2, z, 8);
    a.box(flame, 0.018, 0.045, 0.018, x, h + 0.03, z);
  }
  a.commit(b, { cast: false });
}

/** An iron candle stand (1.3 m) with a ring of candles, on the floor. */
export function candleStand(b: LevelBuilder, o: Place): void {
  const a = mk(o);
  const iron = IRON();
  a.cyl(iron, 0.18, 0.04, 0, 0.02, 0, 10);
  a.cyl(iron, 0.025, 1.2, 0, 0.62, 0, 6);
  const ring = new THREE.TorusGeometry(0.2, 0.015, 5, 16);
  ring.rotateX(Math.PI / 2);
  a.mesh(ring, iron, 0, 1.22, 0);
  a.commit(b, { cast: false });
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * Math.PI * 2;
    candles(b, { x: o.x + Math.cos(t) * 0.2, y: (o.y ?? 0) + 1.23, z: o.z + Math.sin(t) * 0.2, n: 1, spread: 0.001 });
  }
  b.collide({ x: o.x, z: o.z, hx: 0.2, hz: 0.2, y0: o.y ?? 0, y1: (o.y ?? 0) + 1.3, mapKind: 'prop', surface: 'metal', tag: 'candles' });
}

/** A lectern, its reading face to local +Z, an open book on it. */
export function lectern(b: LevelBuilder, o: Place): void {
  const a = mk(o);
  const w = WOOD_DARK();
  a.box(w, 0.5, 0.06, 0.4, 0, 0.03, 0);
  a.box(w, 0.14, 1.05, 0.14, 0, 0.55, 0);
  a.box(w, 0.6, 0.05, 0.45, 0, 1.12, 0.03, { rx: 0.35 });
  a.box(solid('paper', 0xd9d5c4, 0.9, 0), 0.5, 0.02, 0.34, 0, 1.15, 0.04, { rx: 0.35 });
  a.collide(b, 0, 0, 0.5, 0.42, 1.2, { mapKind: 'prop', surface: 'wood', tag: 'lectern' });
  a.commit(b, { cast: false });
}

/**
 * A vigil lantern's iron post: a stone footing, a 1.5 m post and the lantern's cage on top (its flame and glass are
 * drawn by the story at run time, `asylum/nightRuntime.ts`). The cage's centre is 1.75 m above `y`.
 */
export function lanternPost(b: LevelBuilder, o: Place): void {
  const a = mk(o);
  const iron = IRON();
  a.box(solid('stone', 0x6a6a62, 0.95, 0), 0.7, 0.25, 0.7, 0, 0.125, 0);
  a.box(iron, 0.1, 1.45, 0.1, 0, 0.95, 0);
  a.box(iron, 0.34, 0.04, 0.34, 0, 1.55, 0);
  // the cage's corner bars and its cap
  for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]] as const) a.box(iron, 0.025, 0.42, 0.025, x, 1.77, z);
  a.taper(iron, 0.02, 0.26, 0.2, 0, 2.08, 0, 4, { ry: Math.PI / 4 });
  a.box(iron, 0.34, 0.03, 0.34, 0, 1.98, 0);
  const ring = new THREE.TorusGeometry(0.06, 0.012, 5, 10);
  a.mesh(ring, iron, 0, 2.24, 0);
  a.collide(b, 0, 0, 0.7, 0.7, 2.1, { mapKind: 'prop', surface: 'metal', tag: 'lantern' });
  a.commit(b, { cast: false });
}
