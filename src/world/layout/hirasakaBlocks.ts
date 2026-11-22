/**
 * HIRASAKA: NIKKYŪ ROW, BLOCK 30 AND THE HOSPITAL (place group 'blocks', rect x -160..-40, z -20..54).
 *
 * NIKKYŪ ROW (Blocks 16-20, the sea-level pad, y 0, x -160..-104). Two rows of flats face each other across a lane:
 *  - the sea row (x -152..-141): five blocks of seven to nine storeys, wooden balconies over the sea promenade, open
 *    galleries on the lane side; its ground floor holds flats, a sewing room, the communal sink and the co-op hall with
 *    the company price board (WALL_BUYS nikkyu); its 2F gallery is THE LONG CORRIDOR, a walkable upper area of its own
 *    (`floors.ts`, y 3.6) up two flights at its ends, with four 1974 flats open off it;
 *  - the rock row (x -133..-119): three storeys against the rock with a rooftop garden; its ground floor is the row of
 *    little shops (the coal merchant with the second coal sack, the rice shop, the tobacconist, the greengrocer, the
 *    tiny bar) and a passage through to the back alley;
 *  - the back alley along the terraces' retaining wall, closed at its north end by the rubble fall (OBSTACLES rubble).
 * BLOCK 30 (the town pad, y 3.6): the oldest concrete block, a ring of flats round a light well collapsing from the
 *  east. Covered galleries go round the well on the ground floor; the caretaker's key board is on the gallery column
 *  outside his window (the boiler key); the photograph is in the north-east flat.
 * THE HOSPITAL (Blocks 68 and 69, the terrace, y 7.2): the waiting room, a corridor of wards, the operating room, the
 *  pharmacy and the dental room; the isolation ward off a covered walkway; the five miner statues of the tankō-bushi
 *  side story in the forecourt.
 *
 * Draw cost: every plain colour in one finish (one batch per chunk), the one glow (`H.lamp`: lit windows, ceiling
 * lamps) and the flights' slab material. Nothing casts.
 * The y0 = 0 rule: on the raised pads every collider starts at 0; on the long corridor (an upper area) things standing
 * on it start at its floor, so the lane and rooms below stay open.
 */
import * as THREE from 'three';
import type { Ctx } from './util';
import { H, box, cyl } from './hirasakaKit';
import { straightStairs } from './storeys';
import { hideable } from './hirasakaHide';
import { JOBS, OBSTACLES, PHOTOS, SIDES, WALL_BUYS, Y } from '../../hirasaka/places';

export const BLOCKS_RECT = { x0: -160, z0: -20, x1: -40, z1: 54 };

// ---------------------------------------------------------------------------------------------------------------------
// materials (module-level)
// ---------------------------------------------------------------------------------------------------------------------
// Every plain colour here shares ONE finish (roughness 0.92, no metal), so the whole group bakes into a single batch per
// chunk; only the glow (`H.lamp`) and the flights' named slab material cost a call of their own.
const std = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
const K = {
  conc: std(0x7d8484),
  concDark: std(0x3f4647),
  concPale: std(0x8d9391),
  concOld: std(0x6a6c64),
  concMoss: std(0x55624f),
  winDark: std(0x11161a),
  frame: std(0x2b2b27),
  terrazzo: std(0x767e74),
  wood: std(0x6a4a30),
  woodDark: std(0x3e2a1c),
  woodPale: std(0x9a7c56),
  enamel: std(0xd8d4c8),
  burlap: std(0x8a7350),
  cloth: std(0x8a2e26),
  clothBlue: std(0x34506e),
  clothPink: std(0xb07a80),
  black: std(0x161616),
  screen: std(0x1d2925),
  paper: std(0xded6be),
  amber: std(0x7a4a1a),
  plaster: std(0xb8b2a0),
  mint: std(0x6a8a78),
  cream: std(0xc2baa0),
  green: std(0x3e5a44),
  leaf: std(0x2e4628),
  rust: std(0x6e3a22),
  clay: std(0x7a4a32),
  tatami: std(0x8f8a5a),
  stain: std(0x4a4a40),
  rock: std(0x34302c),
  rubble: std(0x5a5e5c),
  coal: std(0x0f0f11),
  soil: std(0x2e2418),
  wet: std(0x262d31),
  iron: std(0x2a2e31),
  lamp: H.lamp,
};
type Mat = THREE.Material;

// ---------------------------------------------------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------------------------------------------------
let seed = 1;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** A box by its bounds (bottom y0 to top y1), with no shadow flag (one batch per finish per chunk). */
function B(c: Ctx, m: Mat, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, rot = 0): void {
  box(c.b, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), rot, false);
}
/** A collider by its bounds. */
function C(
  c: Ctx,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y0: number,
  y1: number,
  tag: string,
  o: { shots?: boolean; move?: boolean; kind?: 'building' | 'prop' | 'wall' | 'none'; surface?: 'wood' | 'metal' | 'concrete' | 'glass'; floor?: boolean } = {},
): void {
  c.b.collide({
    x: (x0 + x1) / 2,
    z: (z0 + z1) / 2,
    hx: Math.abs(x1 - x0) / 2,
    hz: Math.abs(z1 - z0) / 2,
    y0,
    y1,
    blocksMove: o.move ?? true,
    blocksShots: o.shots ?? true,
    mapKind: o.kind ?? 'prop',
    surface: o.surface ?? 'concrete',
    floor: o.floor,
    tag,
  });
}
/** A roof collider (tells the game the player is indoors). */
function roof(c: Ctx, x0: number, z0: number, x1: number, z1: number, y: number): void {
  C(c, x0, z0, x1, z1, y, y + 0.15, 'roof', { move: false, kind: 'none' });
}
/** A cylinder standing on y (no shadow flag). */
function cy(c: Ctx, m: Mat, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8): void {
  cyl(c.b, m, x, y, z, r0, r1, h, seg, false);
}
/** A mesh placed by hand (a wheel, a disc), baked like the rest. */
function mesh(c: Ctx, geo: THREE.BufferGeometry, m: Mat, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz, 'YXZ');
  c.b.add(o, { cast: false });
}

type Gap = readonly [number, number];
function cut(a: number, e: number, gaps: readonly Gap[]): [number, number][] {
  const out: [number, number][] = [];
  let from = a;
  for (const [p, q] of [...gaps].sort((u, v) => u[0] - v[0])) {
    if (p > from) out.push([from, Math.min(p, e)]);
    from = Math.max(from, q);
  }
  if (e > from) out.push([from, e]);
  return out.filter(([p, q]) => q - p > 0.04);
}

/**
 * A wall along x (`alongX`, at z = fixed) or along z (at x = fixed) from a to e, drawn from y0 to y1 with doorways
 * (`gaps`, absolute positions along it) and lintels over them; its collider from `c0` (0 on a raised pad, the floor
 * on the long corridor) to y1.
 */
function wallRun(c: Ctx, alongX: boolean, fixed: number, a: number, e: number, y0: number, y1: number, m: Mat, gaps: readonly Gap[], c0: number, tag: string, t = 0.3, door = 2.3): void {
  const h = t / 2;
  for (const [p, q] of cut(a, e, gaps)) {
    if (alongX) {
      B(c, m, p, y0, fixed - h, q, y1, fixed + h);
      C(c, p, fixed - h, q, fixed + h, c0, y1, tag, { kind: 'wall' });
    } else {
      B(c, m, fixed - h, y0, p, fixed + h, y1, q);
      C(c, fixed - h, p, fixed + h, q, c0, y1, tag, { kind: 'wall' });
    }
  }
  if (y1 - y0 > door + 0.1) {
    for (const [p, q] of gaps) {
      if (alongX) B(c, m, p, y0 + door, fixed - h, q, y1, fixed + h);
      else B(c, m, fixed - h, y0 + door, p, fixed + h, y1, q);
    }
  }
}

/**
 * Windows on a façade: along x (at z = fixed) or along z (at x = fixed), facing `n` (+1 / -1 along the normal), for
 * `storeys` storeys of height `sh` from y0. Each is a pane (lit or dark) and a sill.
 */
function windows(
  c: Ctx,
  alongX: boolean,
  fixed: number,
  a: number,
  e: number,
  y0: number,
  storeys: number,
  sh: number,
  n: number,
  o: { lit?: number; every?: number; w?: number; h?: number; sill?: number; skip?: readonly Gap[]; from?: number } = {},
): void {
  const every = o.every ?? 2.2;
  const w = o.w ?? 1.2;
  const hh = o.h ?? 1.3;
  const sill = o.sill ?? 0.9;
  const len = e - a;
  const count = Math.floor((len - 0.6) / every);
  if (count < 1) return;
  const start = a + (len - (count - 1) * every) / 2;
  const off = fixed + n * 0.04;
  for (let k = o.from ?? 0; k < storeys; k++) {
    const y = y0 + k * sh + sill;
    for (let i = 0; i < count; i++) {
      const p = start + i * every;
      if (o.skip?.some(([u, v]) => p > u - w / 2 && p < v + w / 2)) continue;
      const m = rnd() < (o.lit ?? 0.1) ? K.lamp : K.winDark;
      if (alongX) {
        B(c, m, p - w / 2, y, off - 0.04, p + w / 2, y + hh, off + 0.04);
        B(c, K.concDark, p - w / 2 - 0.08, y - 0.12, off - 0.1 * (n < 0 ? 1 : 0), p + w / 2 + 0.08, y, off + 0.1 * (n > 0 ? 1 : 0));
      } else {
        B(c, m, off - 0.04, y, p - w / 2, off + 0.04, y + hh, p + w / 2);
        B(c, K.concDark, off - 0.1 * (n < 0 ? 1 : 0), y - 0.12, p - w / 2 - 0.08, off + 0.1 * (n > 0 ? 1 : 0), y, p + w / 2 + 0.08);
      }
    }
  }
}

/** Rain streaks down a façade (along x at z = fixed or along z at x = fixed). */
function streaks(c: Ctx, alongX: boolean, fixed: number, a: number, e: number, y0: number, y1: number, n: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const p = a + rnd() * (e - a);
    const w = 0.25 + rnd() * 0.5;
    const top = y1 - rnd() * 2;
    const bot = y0 + rnd() * (y1 - y0) * 0.5;
    const m = rnd() < 0.5 ? K.stain : K.rust;
    const f = fixed + n * 0.03;
    if (alongX) B(c, m, p - w / 2, bot, f - 0.02, p + w / 2, top, f + 0.02);
    else B(c, m, f - 0.02, bot, p - w / 2, f + 0.02, top, p + w / 2);
  }
}

/** A sodium lamp on a post (light + glow). */
function lamp(c: Ctx, x: number, y: number, z: number, o: { light?: boolean; mode?: 'steady' | 'flicker' | 'fail'; tag?: string; h?: number } = {}): void {
  const h = o.h ?? 4.4;
  B(c, K.iron, x - 0.06, y, z - 0.06, x + 0.06, y + h, z + 0.06);
  B(c, K.iron, x - 0.06, y + h - 0.1, z - 0.06, x + 0.7, y + h, z + 0.06);
  B(c, K.lamp, x + 0.45, y + h - 0.25, z - 0.12, x + 0.75, y + h - 0.1, z + 0.12);
  C(c, x - 0.08, z - 0.08, x + 0.08, z + 0.08, 0, y + h, 'lamp', { surface: 'metal' });
  if (o.light !== false) c.b.light({ x: x + 0.6, y: y + h - 0.3, z, color: 0xffa860, intensity: 18, distance: 14, mode: o.mode ?? 'steady', pool: 3, glow: 0.5, tag: o.tag ?? 'blocks' });
}

/** A ceiling lamp (a glowing panel under a ceiling at y). */
function ceilingLamp(c: Ctx, x: number, y: number, z: number, w = 0.5, d = 0.3): void {
  B(c, K.lamp, x - w / 2, y - 0.08, z - d / 2, x + w / 2, y, z + d / 2);
}

/** A floor at height y (an upper area's slab): visual and walkable collider. */
function deck(c: Ctx, m: Mat, x0: number, z0: number, x1: number, z1: number, y: number, tag: string): void {
  B(c, m, x0, y - 0.3, z0, x1, y, z1);
  C(c, x0, z0, x1, z1, y - 0.3, y, tag, { floor: true, kind: 'none' });
}

/** A rail on the long corridor (blocks walkers up there, lets shots by). */
function rail(c: Ctx, x0: number, z0: number, x1: number, z1: number, y: number, m: Mat = K.conc): void {
  B(c, m, x0, y, z0, x1, y + 1.0, z1);
  B(c, K.woodDark, Math.min(x0, x1) - 0.03, y + 1.0, Math.min(z0, z1) - 0.03, Math.max(x0, x1) + 0.03, y + 1.08, Math.max(z0, z1) + 0.03);
  C(c, x0, z0, x1, z1, y, y + 1.1, 'corridor-rail', { shots: false, kind: 'none' });
}

// ---------------------------------------------------------------------------------------------------------------------
// 1974 things (local frame: front faces +z; `rot` turns it: 0 south, PI north, PI/2 east, -PI/2 west)
// ---------------------------------------------------------------------------------------------------------------------
type Place = (m: Mat, lx: number, ly: number, lz: number, w: number, h: number, d: number) => void;
function at(c: Ctx, x: number, y: number, z: number, rot: number): Place {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  return (m, lx, ly, lz, w, h, d) => box(c.b, m, x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs, w, h, d, rot, false);
}
/** A prop's collider (axis-aligned footprint w x d before turning), from c0 to y + h. */
function pc(c: Ctx, x: number, z: number, w: number, d: number, rot: number, c0: number, top: number, tag: string, shots = false): void {
  const q = Math.abs(Math.sin(rot)) > 0.5;
  const hw = (q ? d : w) / 2;
  const hd = (q ? w : d) / 2;
  C(c, x - hw, z - hd, x + hw, z + hd, c0, top, tag, { shots });
}

/** A floor of tatami (with the cloth borders) over x0..x1, z0..z1 at y. */
function tatami(c: Ctx, x0: number, z0: number, x1: number, z1: number, y: number): void {
  B(c, K.tatami, x0, y, z0, x1, y + 0.05, z1);
  for (let x = x0 + 0.9; x < x1 - 0.2; x += 0.9) B(c, K.black, x - 0.02, y + 0.05, z0, x + 0.02, y + 0.056, z1);
  for (let z = z0 + 1.8; z < z1 - 0.2; z += 1.8) B(c, K.black, x0, y + 0.05, z - 0.02, x1, y + 0.056, z + 0.02);
}
function boards(c: Ctx, x0: number, z0: number, x1: number, z1: number, y: number, m: Mat = K.woodPale): void {
  B(c, m, x0, y, z0, x1, y + 0.04, z1);
}

function tv(c: Ctx, x: number, y: number, z: number, rot: number, c0: number): void {
  const p = at(c, x, y, z, rot);
  for (const [lx, lz] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]] as const) p(K.woodDark, lx, 0.15, lz, 0.04, 0.3, 0.04);
  p(K.woodDark, 0, 0.6, 0, 0.74, 0.6, 0.48);
  p(K.screen, -0.08, 0.62, 0.245, 0.46, 0.38, 0.02);
  p(K.paper, 0.27, 0.72, 0.245, 0.06, 0.06, 0.02);
  p(K.paper, 0.27, 0.58, 0.245, 0.06, 0.06, 0.02);
  p(K.iron, -0.1, 1.06, 0, 0.02, 0.32, 0.02);
  p(K.iron, 0.1, 1.06, 0, 0.02, 0.32, 0.02);
  pc(c, x, z, 0.74, 0.5, rot, c0, y + 0.9, 'tv');
}
/** The twin-tub washer: wash tub and spin tub side by side, blue lids, a dial panel. */
function washer(c: Ctx, x: number, y: number, z: number, rot: number, c0: number): void {
  const p = at(c, x, y, z, rot);
  p(K.enamel, 0, 0.42, 0, 0.76, 0.84, 0.44);
  p(K.clothBlue, -0.16, 0.855, 0, 0.36, 0.03, 0.36);
  p(K.clothBlue, 0.2, 0.855, 0, 0.28, 0.03, 0.36);
  p(K.paper, 0, 0.92, -0.18, 0.7, 0.14, 0.06);
  p(K.black, -0.2, 0.93, -0.145, 0.06, 0.06, 0.02);
  p(K.black, 0.2, 0.93, -0.145, 0.06, 0.06, 0.02);
  pc(c, x, z, 0.76, 0.44, rot, c0, y + 1, 'washer');
}
/** A treadle sewing machine on its table. */
function sewing(c: Ctx, x: number, y: number, z: number, rot: number, c0: number): void {
  const p = at(c, x, y, z, rot);
  p(K.woodDark, 0, 0.74, 0, 0.9, 0.05, 0.46);
  p(K.iron, -0.38, 0.36, 0, 0.05, 0.72, 0.4);
  p(K.iron, 0.38, 0.36, 0, 0.05, 0.72, 0.4);
  p(K.iron, 0, 0.1, 0.05, 0.6, 0.03, 0.3);
  p(K.black, -0.05, 0.86, -0.05, 0.36, 0.18, 0.14);
  p(K.black, 0.1, 0.98, -0.05, 0.08, 0.14, 0.12);
  p(K.black, -0.2, 0.94, -0.05, 0.08, 0.2, 0.12);
  p(K.paper, -0.22, 1.01, -0.05, 0.02, 0.06, 0.13);
  p(K.cloth, 0.25, 0.78, 0.08, 0.3, 0.03, 0.22);
  pc(c, x, z, 0.9, 0.46, rot, c0, y + 1.05, 'sewing');
}
function chabudai(c: Ctx, x: number, y: number, z: number, c0: number, things = true): void {
  cy(c, K.woodDark, x, y + 0.28, z, 0.45, 0.45, 0.04, 14);
  cy(c, K.woodDark, x, y, z, 0.06, 0.06, 0.28, 6);
  if (things) {
    cy(c, K.enamel, x + 0.15, y + 0.32, z - 0.1, 0.05, 0.04, 0.07, 8);
    cy(c, K.paper, x - 0.12, y + 0.32, z + 0.08, 0.06, 0.06, 0.04, 8);
  }
  C(c, x - 0.45, z - 0.45, x + 0.45, z + 0.45, c0, y + 0.32, 'table', { shots: false });
}
function zabuton(c: Ctx, x: number, y: number, z: number, m: Mat = K.cloth): void {
  B(c, m, x - 0.26, y + 0.05, z - 0.26, x + 0.26, y + 0.12, z + 0.26);
}
function tansu(c: Ctx, x: number, y: number, z: number, rot: number, c0: number, h = 1.1): void {
  const p = at(c, x, y, z, rot);
  p(K.woodDark, 0, h / 2, 0, 0.9, h, 0.42);
  for (let k = 1; k < 4; k++) p(K.woodPale, 0, (h * k) / 4, 0.215, 0.84, 0.02, 0.01);
  p(K.iron, -0.2, h * 0.62, 0.22, 0.08, 0.02, 0.02);
  p(K.iron, 0.2, h * 0.62, 0.22, 0.08, 0.02, 0.02);
  pc(c, x, z, 0.9, 0.42, rot, c0, y + h, 'tansu');
}
/** A kokeshi doll (on whatever is at height y). */
function kokeshi(c: Ctx, x: number, y: number, z: number, s = 1, m: Mat = K.cloth): void {
  cy(c, m, x, y, z, 0.045 * s, 0.035 * s, 0.18 * s, 8);
  mesh(c, new THREE.SphereGeometry(0.055 * s, 8, 6), K.paper, x, y + 0.23 * s, z);
  mesh(c, new THREE.SphereGeometry(0.057 * s, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), K.black, x, y + 0.24 * s, z);
}
/** A cloth doll sitting on the floor, its back to a wall (front faces rot). */
function clothDoll(c: Ctx, x: number, y: number, z: number, rot: number): void {
  const p = at(c, x, y, z, rot);
  p(K.clothPink, 0, 0.12, 0, 0.16, 0.2, 0.1);
  p(K.clothPink, -0.05, 0.03, 0.1, 0.05, 0.05, 0.16);
  p(K.clothPink, 0.05, 0.03, 0.1, 0.05, 0.05, 0.16);
  mesh(c, new THREE.SphereGeometry(0.075, 8, 6), K.paper, x, y + 0.29, z);
  mesh(c, new THREE.SphereGeometry(0.078, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), K.black, x, y + 0.3, z);
}
/** The calendar on a wall (front faces rot): a picture over a grid of days; no words. It says April 1974. */
function calendar(c: Ctx, x: number, y: number, z: number, rot: number): void {
  const p = at(c, x, y, z, rot);
  p(K.paper, 0, 0, 0, 0.36, 0.56, 0.01);
  p(K.clothBlue, 0, 0.14, 0.006, 0.3, 0.2, 0.004);
  p(K.leaf, 0, 0.08, 0.009, 0.3, 0.06, 0.004);
  for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) if (r * 7 + k > 1 && r * 7 + k < 32) p(r * 7 + k === 21 ? K.cloth : K.black, -0.135 + k * 0.045, -0.04 - r * 0.045, 0.007, 0.022, 0.022, 0.003);
}
function clock(c: Ctx, x: number, y: number, z: number, rot: number): void {
  const p = at(c, x, y, z, rot);
  p(K.woodDark, 0, 0, 0, 0.26, 0.4, 0.06);
  p(K.paper, 0, 0.06, 0.035, 0.18, 0.18, 0.01);
  p(K.amber, 0, -0.12, 0.035, 0.05, 0.1, 0.01);
}
function pendant(c: Ctx, x: number, ceil: number, z: number, lit = true): void {
  B(c, K.iron, x - 0.01, ceil - 0.6, z - 0.01, x + 0.01, ceil, z + 0.01);
  B(c, K.paper, x - 0.25, ceil - 0.75, z - 0.25, x + 0.25, ceil - 0.6, z + 0.25);
  if (lit) B(c, K.lamp, x - 0.1, ceil - 0.8, z - 0.1, x + 0.1, ceil - 0.74, z + 0.1);
}
/** The kitchen counter: a sink, a gas ring, a kettle (along x or z from the point, `len` long, against a wall). */
function kitchen(c: Ctx, x: number, y: number, z: number, rot: number, c0: number): void {
  const p = at(c, x, y, z, rot);
  p(K.enamel, 0, 0.42, 0, 1.6, 0.84, 0.55);
  p(K.iron, -0.35, 0.83, 0.02, 0.5, 0.04, 0.4);
  p(K.iron, 0.45, 0.88, 0.02, 0.36, 0.06, 0.3);
  p(K.iron, -0.35, 1.02, -0.2, 0.03, 0.3, 0.03);
  cy(c, K.amber, x + Math.cos(rot) * 0.45, y + 0.91, z - Math.sin(rot) * 0.45, 0.09, 0.07, 0.14, 8);
  p(K.woodDark, 0, 1.75, -0.12, 1.6, 0.5, 0.3);
  pc(c, x, z, 1.6, 0.55, rot, c0, y + 0.9, 'kitchen');
}
function futonStack(c: Ctx, x: number, y: number, z: number, c0: number): void {
  const ms = [K.clothBlue, K.paper, K.clothPink, K.paper];
  for (let i = 0; i < 4; i++) B(c, ms[i]!, x - 0.5, y + i * 0.14, z - 0.35, x + 0.5, y + (i + 1) * 0.14, z + 0.35);
  C(c, x - 0.5, z - 0.35, x + 0.5, z + 0.35, c0, y + 0.56, 'futon', { shots: false });
}
function futonLaid(c: Ctx, x0: number, z0: number, x1: number, z1: number, y: number): void {
  B(c, K.paper, x0, y + 0.05, z0, x1, y + 0.13, z1);
  const alongX = x1 - x0 > z1 - z0;
  if (alongX) B(c, K.clothBlue, x0 + (x1 - x0) * 0.3, y + 0.13, z0 - 0.02, x1 + 0.02, y + 0.2, z1 + 0.02);
  else B(c, K.clothBlue, x0 - 0.02, y + 0.13, z0 + (z1 - z0) * 0.3, x1 + 0.02, y + 0.2, z1 + 0.02);
}
/** Fusuma: sliding paper panels between rooms, along x (at z) or along z (at x), from a to e, one gap open. */
function fusuma(c: Ctx, alongX: boolean, fixed: number, a: number, e: number, y: number, h: number, open: Gap, c0: number): void {
  for (const [p, q] of cut(a, e, [open])) {
    const n = Math.max(1, Math.round((q - p) / 0.9));
    for (let i = 0; i < n; i++) {
      const u = p + ((q - p) * i) / n;
      const v = p + ((q - p) * (i + 1)) / n;
      if (alongX) {
        B(c, K.paper, u + 0.02, y, fixed - 0.03, v - 0.02, y + h - 0.1, fixed + 0.03);
        B(c, K.woodDark, u, y, fixed - 0.04, u + 0.03, y + h, fixed + 0.04);
      } else {
        B(c, K.paper, fixed - 0.03, y, u + 0.02, fixed + 0.03, y + h - 0.1, v - 0.02);
        B(c, K.woodDark, fixed - 0.04, y, u, fixed + 0.04, y + h, u + 0.03);
      }
    }
    if (alongX) C(c, p, fixed - 0.05, q, fixed + 0.05, c0, y + h, 'fusuma', { kind: 'none' });
    else C(c, fixed - 0.05, p, fixed + 0.05, q, c0, y + h, 'fusuma', { kind: 'none' });
  }
  if (alongX) B(c, K.woodDark, a, y + h - 0.1, fixed - 0.05, e, y + h, fixed + 0.05);
  else B(c, K.woodDark, fixed - 0.05, y + h - 0.1, a, fixed + 0.05, y + h, e);
}
function shoeShelf(c: Ctx, x: number, y: number, z: number, rot: number, c0: number): void {
  const p = at(c, x, y, z, rot);
  p(K.woodDark, 0, 0.45, 0, 0.8, 0.9, 0.32);
  p(K.black, -0.15, 0.08, 0.3, 0.12, 0.08, 0.26);
  p(K.cloth, 0.15, 0.08, 0.3, 0.1, 0.08, 0.24);
  pc(c, x, z, 0.8, 0.32, rot, c0, y + 0.9, 'shoes');
}
function radio(c: Ctx, x: number, y: number, z: number, rot: number): void {
  const p = at(c, x, y, z, rot);
  p(K.woodDark, 0, 0.1, 0, 0.36, 0.2, 0.16);
  p(K.paper, -0.06, 0.1, 0.082, 0.18, 0.12, 0.01);
  p(K.amber, 0.12, 0.1, 0.082, 0.05, 0.05, 0.01);
}
function suitcase(c: Ctx, x: number, y: number, z: number, rot: number): void {
  const p = at(c, x, y, z, rot);
  p(K.clay, 0, 0.08, 0, 0.7, 0.16, 0.45);
  p(K.clay, 0, 0.3, -0.24, 0.7, 0.45, 0.04);
  p(K.cloth, -0.1, 0.18, 0.02, 0.4, 0.06, 0.3);
}

/** A 1974 flat's rooms on the floor at y (open-plan: genkan + kitchen, the six-mat room, the back room). */
interface FlatOpts {
  /** The flat's box; the doorway is on the `door` side. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  c0: number;
  ceil: number;
  /** Which way is in from the door (the lane / gallery side): 'w' means the door is on the east wall and you walk west. */
  inward: 'w' | 'e' | 'n' | 's';
  set: 'tv' | 'sewing' | 'futon' | 'leaving' | 'doll';
  light?: boolean;
}
/** Dress a flat: tatami, the kitchen strip by the door, then its things by `set`. Depth runs along `inward`. */
function flat(c: Ctx, o: FlatOpts): void {
  const { y, c0 } = o;
  // a local frame: u runs inward (0 at the door wall), v across
  const alongX = o.inward === 'w' || o.inward === 'e';
  const depth = alongX ? o.x1 - o.x0 : o.z1 - o.z0;
  const width = alongX ? o.z1 - o.z0 : o.x1 - o.x0;
  const P = (u: number, v: number): [number, number] => {
    switch (o.inward) {
      case 'w':
        return [o.x1 - u, o.z0 + v];
      case 'e':
        return [o.x0 + u, o.z0 + v];
      case 'n':
        return [o.x0 + v, o.z1 - u];
      default:
        return [o.x0 + v, o.z0 + u];
    }
  };
  const rect = (u0: number, v0: number, u1: number, v1: number): [number, number, number, number] => {
    const [ax, az] = P(u0, v0);
    const [bx, bz] = P(u1, v1);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  };
  // facing: the rotation whose front points back toward the door / inward / along the width
  const faceDoor = { w: Math.PI / 2, e: -Math.PI / 2, n: 0, s: Math.PI }[o.inward];
  const faceIn = faceDoor + Math.PI;
  const faceV = faceDoor - Math.PI / 2; // front toward +v
  const kit = Math.min(2.2, depth * 0.25);
  // floors: genkan (concrete) at the door, boards for the kitchen, tatami beyond
  {
    const [a, b, e, f] = rect(0, 0, 0.9, width);
    B(c, K.concDark, a, y, b, e, y + 0.02, f);
    const [a2, b2, e2, f2] = rect(0.9, 0, kit, width);
    boards(c, a2, b2, e2, f2, y);
    const [a3, b3, e3, f3] = rect(kit, 0, depth, width);
    tatami(c, a3, b3, e3, f3, y);
  }
  // the kitchen counter along one side wall, the shoe shelf at the genkan, the washer by the door
  {
    const [kx, kz] = P(1.75, 0.32);
    kitchen(c, kx, y, kz, faceV, c0);
    const [sx, sz] = P(0.45, 0.2);
    shoeShelf(c, sx, y, sz, faceV, c0);
    const [wx, wz] = P(0.5, width - 0.3);
    washer(c, wx, y, wz, faceV + Math.PI, c0);
  }
  // the fusuma halfway into the tatami
  const mid = kit + (depth - kit) * 0.52;
  if (depth >= 6) {
    const [fx, fz] = P(mid, 0);
    fusuma(c, !alongX, alongX ? fx : fz, alongX ? o.z0 : o.x0, alongX ? o.z1 : o.x1, y, 2.0, [alongX ? o.z0 + width / 2 - 0.9 : o.x0 + width / 2 - 0.9, alongX ? o.z0 + width / 2 + 0.9 : o.x0 + width / 2 + 0.9], c0);
  }
  // the calendar on the side wall of the six-mat room, the clock beside it
  {
    const [cx, cz] = P(Math.max(kit + 0.8, 2.9), 0.02);
    calendar(c, cx, y + 1.6, cz, faceV);
    const [kx2, kz2] = P(Math.max(kit + 1.6, 3.5), 0.04);
    clock(c, kx2, y + 2.0, kz2, faceV);
  }
  const six = (kit + mid) / 2;
  const back = (mid + depth) / 2;
  if (o.light !== false) {
    const [lx, lz] = P(six, width / 2);
    pendant(c, lx, o.ceil, lz);
  }
  const [tx, tz] = P(six, width / 2);
  switch (o.set) {
    case 'tv': {
      chabudai(c, tx, y, tz, c0);
      const [z1x, z1z] = P(six - 0.7, width / 2);
      zabuton(c, z1x, y, z1z);
      const [z2x, z2z] = P(six, width / 2 + 0.75);
      zabuton(c, z2x, y, z2z, K.clothBlue);
      const [vx, vz] = P(mid - 0.45, width - 0.5);
      tv(c, vx, y, vz, faceDoor, c0);
      const [dx, dz] = P(depth - 0.3, width - 0.6);
      tansu(c, dx, y, dz, faceDoor, c0);
      kokeshi(c, dx - 0.1, y + 1.1, dz - 0.1);
      kokeshi(c, dx + 0.12, y + 1.1, dz + 0.1, 0.8, K.clothBlue);
      const [fx, fz] = P(back, 0.6);
      futonStack(c, fx, y, fz, c0);
      break;
    }
    case 'sewing': {
      const [sx, sz] = P(mid - 0.4, width - 0.6);
      sewing(c, sx, y, sz, faceV + Math.PI, c0);
      zabuton(c, tx, y, tz);
      const [bx, bz] = P(back, width - 0.5);
      // bolts of cloth on a shelf
      B(c, K.woodDark, bx - 0.5, y, bz - 0.2, bx + 0.5, y + 1.2, bz + 0.2);
      for (let i = 0; i < 4; i++) cy(c, [K.cloth, K.clothBlue, K.clothPink, K.paper][i]!, bx - 0.36 + i * 0.24, y + 1.2, bz, 0.09, 0.09, 0.5, 8);
      C(c, bx - 0.5, bz - 0.2, bx + 0.5, bz + 0.2, c0, y + 1.7, 'shelf', { shots: false });
      const [rx, rz] = P(six, 0.9);
      radio(c, rx, y + 0.05, rz, faceV);
      const [vx, vz] = P(depth - 0.4, width / 2);
      tv(c, vx, y, vz, faceDoor, c0);
      break;
    }
    case 'futon': {
      const [a, b, e, f] = rect(mid + 0.3, 0.4, mid + 2.3, 1.4);
      futonLaid(c, a, b, e, f, y);
      const [a2, b2, e2, f2] = rect(mid + 0.3, 1.6, mid + 2.3, 2.6);
      if (width > 2.8) futonLaid(c, a2, b2, e2, f2, y);
      chabudai(c, tx, y, tz, c0);
      const [vx, vz] = P(mid - 0.45, width - 0.5);
      tv(c, vx, y, vz, faceIn + Math.PI, c0);
      const [dx, dz] = P(depth - 0.35, width - 0.3);
      clothDoll(c, dx, y + 0.05, dz, faceDoor);
      break;
    }
    case 'leaving': {
      const [sx, sz] = P(six, width / 2);
      suitcase(c, sx, y + 0.05, sz, faceV);
      for (let i = 0; i < 5; i++) {
        const [qx, qz] = P(kit + 0.4 + rnd() * (depth - kit - 0.8), 0.3 + rnd() * (width - 0.6));
        B(c, rnd() < 0.5 ? K.paper : K.clothBlue, qx - 0.2, y + 0.05, qz - 0.15, qx + 0.2, y + 0.08, qz + 0.15, rnd() * 3);
      }
      const [dx, dz] = P(back, width - 0.6);
      tansu(c, dx, y, dz, faceDoor, c0, 0.9);
      const [kx, kz] = P(back + 0.5, 0.5);
      kokeshi(c, kx, y + 0.05, kz);
      const [vx, vz] = P(mid - 0.45, 0.5);
      tv(c, vx, y, vz, faceV, c0);
      break;
    }
    default: {
      // the doll's room: a tiered stand of dolls, a cushion, the sewing box
      const [hx, hz] = P(depth - 0.5, width / 2);
      const p = at(c, hx, y, hz, faceDoor);
      for (let k = 0; k < 3; k++) p(K.cloth, 0, 0.15 + k * 0.15, -k * 0.2, 1.1 - k * 0.2, 0.3 + k * 0.3, 0.5 - k * 0.1);
      pc(c, hx, hz, 1.1, 0.6, faceDoor, c0, y + 0.95, 'dolls');
      for (let k = 0; k < 3; k++) for (let i = 0; i < 3 - k; i++) {
        const lx = (i - (2 - k) / 2) * 0.3;
        const lz = 0.12 - k * 0.2;
        const cs = Math.cos(faceDoor);
        const sn = Math.sin(faceDoor);
        kokeshi(c, hx + lx * cs + lz * sn, y + 0.3 + k * 0.3, hz - lx * sn + lz * cs, 0.7, k === 2 ? K.paper : K.cloth);
      }
      zabuton(c, tx, y, tz, K.clothBlue);
      const [vx, vz] = P(mid - 0.45, width - 0.5);
      tv(c, vx, y, vz, faceIn + Math.PI, c0);
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the build
// ---------------------------------------------------------------------------------------------------------------------
export function buildBlocks(c: Ctx): void {
  seed = 4021;
  buildNikkyu(c);
  seed = 7013;
  buildBlock30(c);
  seed = 9157;
  buildHospital(c);
}

// =====================================================================================================================
// NIKKYŪ ROW
// =====================================================================================================================
const SEA = { x0: -152, x1: -141, z0: -6, z1: 52 };
const ROCK = { x0: -133, x1: -119, z0: -2, z1: 50 };
const ST = 3.0; // an upper storey
const F2 = 3.6; // the long corridor's floor

function buildNikkyu(c: Ctx): void {
  const y = Y.sea;
  // ---------------------------------------------------------------- the sea row: ground floor
  // rooms (z ranges); open ones are dressed, the rest are solid
  const open: { z0: number; z1: number; door: number; dw?: number; west?: number; kind: string }[] = [
    { z0: -1, z1: 6, door: 2.5, kind: 'flat' },
    { z0: 12, z1: 18, door: 15, kind: 'sewing' },
    { z0: 26, z1: 33, door: 29.5, dw: 2.4, kind: 'store' },
    { z0: 40, z1: 46, door: 43, west: 43, kind: 'sinks' },
  ];
  const X0 = SEA.x0;
  const X1 = SEA.x1;
  // the outer walls (the west one shuttered on the promenade, the east one onto the lane)
  wallRun(c, false, X0 + 0.15, SEA.z0, SEA.z1, 0, F2, K.conc, open.filter((r) => r.west).map((r) => [r.west! - 1.2, r.west! + 1.2] as const), 0, 'nikkyu');
  wallRun(c, false, X1 - 0.15, SEA.z0, SEA.z1, 0, F2, K.conc, open.map((r) => [r.door - (r.dw ?? 1.8) / 2, r.door + (r.dw ?? 1.8) / 2] as const), 0, 'nikkyu');
  wallRun(c, true, SEA.z0 + 0.15, X0, X1, 0, F2, K.conc, [], 0, 'nikkyu');
  wallRun(c, true, SEA.z1 - 0.15, X0, X1, 0, F2, K.conc, [], 0, 'nikkyu');
  // partitions round the open rooms, solids between
  let from = SEA.z0 + 0.3;
  for (const r of open) {
    if (r.z0 - from > 0.2) C(c, X0 + 0.3, from, X1 - 0.3, r.z0, 0, F2, 'nikkyu-flats', { kind: 'building' });
    wallRun(c, true, r.z0, X0 + 0.3, X1 - 0.3, 0, F2, K.plaster, [], 0, 'nikkyu', 0.2);
    wallRun(c, true, r.z1, X0 + 0.3, X1 - 0.3, 0, F2, K.plaster, [], 0, 'nikkyu', 0.2);
    roof(c, X0, r.z0, X1, r.z1, F2 - 0.4);
    from = r.z1;
  }
  C(c, X0 + 0.3, from, X1 - 0.3, SEA.z1 - 0.3, 0, F2, 'nikkyu-flats', { kind: 'building' });
  // the ceiling / the 2F's floor seen from below
  B(c, K.concDark, X0, F2 - 0.3, SEA.z0, X1, F2, SEA.z1);
  // shutters on the promenade side, windows on the open rooms
  for (const z of [-3.5, 9, 20, 24, 36.5, 49]) {
    B(c, K.rust, X0 - 0.08, 0, z - 1.6, X0, 2.6, z + 1.6);
    for (let k = 1; k < 8; k++) B(c, K.iron, X0 - 0.1, k * 0.33, z - 1.6, X0 - 0.07, k * 0.33 + 0.04, z + 1.6);
    B(c, K.iron, X0 - 0.3, 2.6, z - 1.7, X0, 3.0, z + 1.7);
  }
  for (const r of open) {
    if (!r.west) windows(c, false, X0, r.z0 + 0.4, r.z1 - 0.4, 0, 1, F2, -1, { lit: 0.5, every: 2.4 });
    windows(c, false, X0 + 0.3, r.z0 + 0.4, r.z1 - 0.4, 0, 1, F2, 1, { lit: 0, every: 2.4, skip: r.west ? [[r.west - 1.4, r.west + 1.4]] : [] });
    ceilingLamp(c, (X0 + X1) / 2, F2 - 0.3, (r.z0 + r.z1) / 2, 0.8, 0.3);
  }
  // the lane side between doors: closed doors and frosted windows of the ground-floor flats
  for (let z = SEA.z0 + 1.2; z < SEA.z1 - 1; z += 3.6) {
    if (open.some((r) => Math.abs(z - r.door) < 2)) continue;
    B(c, K.woodDark, X1, 0, z - 0.45, X1 + 0.05, 2.0, z + 0.45);
    B(c, K.paper, X1, 1.1, z + 0.8, X1 + 0.04, 1.9, z + 1.6);
  }
  // -- the ground-floor rooms
  {
    // Block 20's ground-floor flat (z -1..6): door on the lane
    flat(c, { x0: X0 + 0.3, z0: -0.9, x1: X1 - 0.3, z1: 5.9, y, c0: 0, ceil: F2 - 0.3, inward: 'w', set: 'tv' });
    // the sewing room (z 12..18)
    flat(c, { x0: X0 + 0.3, z0: 12.1, x1: X1 - 0.3, z1: 17.9, y, c0: 0, ceil: F2 - 0.3, inward: 'w', set: 'sewing' });
    // the co-op hall (z 26..33): the company price board on the sea wall (WALL_BUYS nikkyu), a counter, shelves, rice
    const wb = WALL_BUYS[1]!;
    B(c, K.terrazzo, X0 + 0.3, 0, 26.1, X1 - 0.3, 0.02, 32.9);
    B(c, K.woodDark, X0 + 0.3, 1.0, wb.z - 1.3, X0 + 0.44, 2.5, wb.z + 1.3);
    B(c, K.paper, X0 + 0.44, 1.15, wb.z - 1.15, X0 + 0.47, 2.35, wb.z + 1.15);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) B(c, k === 1 && r === 2 ? K.cloth : K.black, X0 + 0.47, 1.3 + r * 0.26, wb.z - 0.9 + k * 0.75, X0 + 0.49, 1.42 + r * 0.26, wb.z - 0.5 + k * 0.75);
    B(c, K.woodDark, X0 + 0.3, 2.5, wb.z - 1.4, X0 + 0.5, 2.62, wb.z + 1.4);
    // the counter along the north side (2.3 m from the board's spot), shelves on the south wall
    B(c, K.wood, -149.4, 0, 32.1, -142.4, 0.95, 32.7);
    B(c, K.woodDark, -149.5, 0.95, 32.0, -142.3, 1.0, 32.8);
    C(c, -149.4, 32.1, -142.4, 32.7, 0, 1.0, 'counter', { shots: false });
    cy(c, K.iron, -146, 1.0, 32.4, 0.12, 0.12, 0.08, 10);
    B(c, K.iron, -146.15, 1.08, 32.3, -145.85, 1.4, 32.5);
    B(c, K.woodDark, -147.6, 1.0, 32.25, -147.1, 1.04, 32.55);
    for (let x = -149.6; x < -142.5; x += 2.4) {
      B(c, K.woodDark, x, 0, 26.15, x + 2.2, 2.2, 26.6);
      for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) if (rnd() < 0.7) B(c, [K.cloth, K.paper, K.amber, K.clothBlue][(i + k) % 4]!, x + 0.1 + i * 0.35, 0.3 + k * 0.5, 26.3, x + 0.36 + i * 0.35, 0.5 + k * 0.5, 26.55);
      C(c, x, 26.15, x + 2.2, 26.6, 0, 2.2, 'shelf', { shots: false });
    }
    for (let i = 0; i < 5; i++) B(c, K.burlap, -143.8 + (i % 2) * 0.1, i * 0.32, 27.2, -142.6, (i + 1) * 0.32, 28.2, i * 0.1);
    C(c, -143.9, 27.1, -142.5, 28.3, 0, 1.6, 'rice', { shots: false });
    // the communal sinks (z 40..46): a long trough with taps, washers in a row, laundry over them; through to the promenade
    B(c, K.conc, X0 + 0.4, 0, 45.2, X1 - 0.4, 0.85, 45.85);
    B(c, K.wet, X0 + 0.5, 0.85, 45.3, X1 - 0.5, 0.86, 45.75);
    C(c, X0 + 0.4, 45.2, X1 - 0.4, 45.85, 0, 0.9, 'sink', { shots: false });
    for (let x = X0 + 1; x < X1 - 0.5; x += 1.2) B(c, K.iron, x, 0.85, 45.7, x + 0.04, 1.25, 45.74);
    washer(c, -150.6, 0, 40.6, 0, 0);
    washer(c, -149.6, 0, 40.6, 0, 0);
    B(c, K.iron, X0 + 0.3, 2.6, 42.9, X1 - 0.3, 2.63, 42.93);
    for (let x = X0 + 1; x < X1 - 1; x += 0.9) if (rnd() < 0.7) B(c, [K.paper, K.clothBlue, K.clothPink][Math.floor(rnd() * 3)]!, x, 1.9, 42.88, x + 0.5, 2.6, 42.95);
    calendar(c, -144, 1.6, 40.11, 0);
  }

  // ---------------------------------------------------------------- the long corridor (2F, an upper area)
  const DZ0 = -1;
  const DZ1 = 48.2;
  const area = c.floors.addArea('Nikkyū Row, the long corridor', 'upper', F2, { minX: X0 - 0.4, maxX: -135.2, minZ: DZ0 - 0.6, maxZ: DZ1 + 0.6 });
  // the deck along the sea row's east face, and the two landings where the flights come up
  deck(c, K.concDark, X1 - 0.15, DZ0, -137.6, DZ1, F2, 'nikkyu-corridor');
  deck(c, K.concDark, -137.6, DZ0, -135.8, DZ0 + 2, F2, 'nikkyu-corridor');
  deck(c, K.concDark, -137.6, DZ1 - 2.4, -135.8, DZ1, F2, 'nikkyu-corridor');
  B(c, K.terrazzo, X1, F2, DZ0, -137.6, F2 + 0.01, DZ1);
  // rails: the open east edge, the landings, the corridor's ends
  rail(c, -137.78, DZ0 + 2, -137.62, DZ1 - 2.4, F2);
  rail(c, -135.95, DZ0, -135.8, DZ0 + 2, F2);
  rail(c, -137.6, DZ0 + 1.85, -135.8, DZ0 + 2, F2);
  rail(c, X1 - 0.15, DZ0, -137.5, DZ0 + 0.15, F2);
  rail(c, -135.95, DZ1 - 2.4, -135.8, DZ1, F2);
  rail(c, -137.6, DZ1 - 2.4, -135.8, DZ1 - 2.25, F2);
  rail(c, X1 - 0.15, DZ1 - 0.15, -137.5, DZ1, F2);
  // the two flights up from the lane (north end rising south, south end rising north)
  straightStairs(c, { x: -136.8, z: -5.2, dx: 0, dz: 1, width: 1.4, y0: 0, y1: F2, lower: 0, upper: area, mat: 'concreteSlab' });
  straightStairs(c, { x: -136.8, z: 52.4, dx: 0, dz: -1, width: 1.4, y0: 0, y1: F2, lower: 0, upper: area, mat: 'concreteSlab' });
  // columns under the deck
  for (const z of [4, 10, 16, 22, 28, 34, 44]) {
    B(c, K.conc, -137.9, 0, z - 0.15, -137.6, F2 - 0.3, z + 0.15);
    C(c, -137.9, z - 0.15, -137.6, z + 0.15, 0, F2 - 0.3, 'column');
  }
  // its ceiling (the 3F gallery) and roof collider, its lamps
  roof(c, X1, DZ0, -137.6, DZ1, F2 + ST);
  for (let z = DZ0 + 3; z < DZ1 - 1; z += 6) ceilingLamp(c, -139.3, F2 + ST - 0.2, z);
  for (let z = DZ0 + 6; z < DZ1 - 1; z += 8) ceilingLamp(c, -139.3, F2 - 0.3, z);
  c.b.light({ x: -139.4, y: F2 + 2.4, z: 12, color: 0xffb070, intensity: 14, distance: 12, mode: 'steady', pool: 0, glow: 0.4, tag: 'nikkyu-corridor' });
  c.b.light({ x: -139.4, y: F2 + 2.4, z: 36, color: 0xffb070, intensity: 14, distance: 12, mode: 'flicker', pool: 0, glow: 0.4, tag: 'nikkyu-corridor' });
  // the flats off it: four open (1974 inside), the rest shut behind their doors
  const flats: { z0: number; z1: number; set: FlatOpts['set'] }[] = [
    { z0: 0.6, z1: 4.2, set: 'tv' },
    { z0: 12.6, z1: 16.2, set: 'sewing' },
    { z0: 21.6, z1: 25.2, set: 'futon' },
    { z0: 34.6, z1: 38.2, set: 'leaving' },
  ];
  const F2T = F2 + ST;
  wallRun(c, false, X1 - 0.15, SEA.z0, SEA.z1, F2, F2T, K.conc, flats.map((f) => [(f.z0 + f.z1) / 2 - 0.75, (f.z0 + f.z1) / 2 + 0.75] as const), F2, 'nikkyu-2f');
  wallRun(c, false, X0 + 0.15, SEA.z0, SEA.z1, F2, F2T, K.conc, [], F2, 'nikkyu-2f');
  for (const f of flats) {
    wallRun(c, true, f.z0 - 0.1, X0 + 0.3, X1 - 0.3, F2, F2T, K.plaster, [], F2, 'nikkyu-2f', 0.2);
    wallRun(c, true, f.z1 + 0.1, X0 + 0.3, X1 - 0.3, F2, F2T, K.plaster, [], F2, 'nikkyu-2f', 0.2);
    deck(c, K.concDark, X0 + 0.3, f.z0, X1 - 0.15, f.z1, F2, 'nikkyu-flat');
    roof(c, X0, f.z0, X1, f.z1, F2T - 0.2);
    flat(c, { x0: X0 + 0.3, z0: f.z0, x1: X1 - 0.3, z1: f.z1, y: F2, c0: F2, ceil: F2T, inward: 'w', set: f.set });
    windows(c, false, X0 + 0.3, f.z0, f.z1, F2, 1, ST, 1, { lit: 0, every: 2.4 });
  }
  // shut doors, meter boxes and frosted windows along the corridor
  for (let z = DZ0 + 1.4; z < DZ1 - 1; z += 3.6) {
    if (flats.some((f) => Math.abs(z - (f.z0 + f.z1) / 2) < 2.2)) continue;
    B(c, K.woodDark, X1, F2, z - 0.45, X1 + 0.06, F2 + 2.0, z + 0.45);
    B(c, K.paper, X1, F2 + 1.1, z + 0.75, X1 + 0.04, F2 + 1.9, z + 1.55);
    B(c, K.iron, X1, F2 + 1.8, z - 0.95, X1 + 0.14, F2 + 2.2, z - 0.65);
  }
  for (const f of flats) {
    const m = (f.z0 + f.z1) / 2;
    B(c, K.woodDark, X1 + 0.02, F2, m + 0.75, X1 + 0.08, F2 + 2.1, m + 1.55);
  }
  // the cats' corner in the lane below (SIDES cats): kept clear; a saucer and a crate by the column
  {
    const s = SIDES.find((q) => q.id === 'cats')!;
    cy(c, K.enamel, s.x + 1.2, 0, s.z - 1.4, 0.14, 0.12, 0.04, 10);
    B(c, K.wood, s.x + 1.0, 0, s.z + 2.3, s.x + 1.7, 0.5, s.z + 3.0);
    C(c, s.x + 1.0, s.z + 2.3, s.x + 1.7, s.z + 3.0, 0, 0.5, 'crate', { shots: false });
  }

  // ---------------------------------------------------------------- the sea row: storeys above (façades)
  const blocks = [
    { z0: 41, z1: 52, st: 9 },
    { z0: 29.5, z1: 40, st: 8 },
    { z0: 18, z1: 28.5, st: 9 },
    { z0: 6.5, z1: 17, st: 9 },
    { z0: -6, z1: 5.5, st: 7 },
  ];
  for (let bi = 0; bi < blocks.length; bi++) {
    const bk = blocks[bi]!;
    const top = F2 + (bk.st - 1) * ST;
    B(c, bi % 2 ? K.concPale : K.conc, X0, F2T, bk.z0, X1 - 0.1, top, bk.z1);
    C(c, X0, bk.z0, X1 - 0.1, bk.z1, F2T, top, 'nikkyu-mass', { kind: 'none' });
    // the 2F's own wall faces on the sea side
    B(c, bi % 2 ? K.concPale : K.conc, X0 - 0.02, F2, bk.z0, X0 + 0.02, F2T, bk.z1);
    // west: balconies per flat per storey (2F up), the sliding doors behind them, laundry on some
    for (let s = 1; s < bk.st; s++) {
      const yy = F2 + (s - 1) * ST;
      for (let zc = bk.z0 + 1.8; zc < bk.z1 - 1.4; zc += 3.6) {
        const lit = rnd() < 0.12;
        B(c, lit ? K.lamp : K.winDark, X0 - 0.06, yy + 0.2, zc - 1.0, X0 - 0.02, yy + 2.3, zc + 1.0);
        if (rnd() < 0.08) continue; // a balcony gone in a storm
        B(c, K.concDark, X0 - 1.5, yy - 0.15, zc - 1.55, X0, yy, zc + 1.55);
        B(c, K.wood, X0 - 1.5, yy, zc - 1.55, X0 - 1.42, yy + 1.0, zc + 1.55);
        B(c, K.woodDark, X0 - 1.53, yy + 1.0, zc - 1.58, X0 - 1.39, yy + 1.06, zc + 1.58);
        B(c, K.wood, X0 - 1.5, yy, zc - 1.55, X0, yy + 1.0, zc - 1.48);
        B(c, K.wood, X0 - 1.5, yy, zc + 1.48, X0, yy + 1.0, zc + 1.55);
        if (rnd() < 0.3) {
          B(c, K.iron, X0 - 1.2, yy + 1.9, zc - 1.5, X0 - 1.17, yy + 1.93, zc + 1.5);
          for (let i = 0; i < 3; i++) if (rnd() < 0.7) B(c, [K.paper, K.clothBlue, K.clothPink, K.cloth][Math.floor(rnd() * 4)]!, X0 - 1.22, yy + 1.2, zc - 1.3 + i * 0.9, X0 - 1.15, yy + 1.9, zc - 0.8 + i * 0.9);
        }
        if (rnd() < 0.3) cy(c, K.clay, X0 - 1.1, yy, zc + 1.0, 0.18, 0.14, 0.3, 6);
      }
    }
    // east: a gallery per storey from 3F (the 2F's is the long corridor), its parapet, doors and windows behind
    for (let s = 2; s < bk.st; s++) {
      const yy = F2 + (s - 1) * ST;
      B(c, K.concDark, X1 - 0.1, yy - 0.22, bk.z0 - 0.5, -137.6, yy, bk.z1 + 0.5);
      B(c, K.conc, -137.78, yy, bk.z0 - 0.5, -137.6, yy + 1.0, bk.z1 + 0.5);
      B(c, K.woodDark, -137.82, yy + 1.0, bk.z0 - 0.5, -137.56, yy + 1.07, bk.z1 + 0.5);
      for (let z = bk.z0 + 0.8; z < bk.z1 - 0.5; z += 1.8) {
        const door = Math.round((z - bk.z0) / 1.8) % 2 === 0;
        if (door) B(c, K.woodDark, X1 - 0.1, yy, z - 0.42, X1 - 0.04, yy + 2.0, z + 0.42);
        else B(c, rnd() < 0.14 ? K.lamp : K.winDark, X1 - 0.1, yy + 1.0, z - 0.5, X1 - 0.04, yy + 1.9, z + 0.5);
      }
    }
    // the gallery over the long corridor (its ceiling), whatever the block's height
    B(c, K.concDark, X1 - 0.1, F2T - 0.22, bk.z0 - 0.5, -137.6, F2T, bk.z1 + 0.5);
    // the ends and rain streaks
    if (bi === 0) windows(c, true, SEA.z1, X0, X1, F2, bk.st - 1, ST, 1, { lit: 0.1, every: 2.6 });
    if (bi === blocks.length - 1) windows(c, true, SEA.z0, X0, X1, F2, bk.st - 1, ST, -1, { lit: 0.1, every: 2.6 });
    streaks(c, false, X0, bk.z0, bk.z1, F2, top, -1, 4);
    // the roof: parapet, a garden of planters, the water tank, an aerial
    const ry = top;
    B(c, K.conc, X0 + 0.1, ry, bk.z0, X1 - 0.1, ry + 1.0, bk.z0 + 0.2);
    B(c, K.conc, X0 + 0.1, ry, bk.z1 - 0.2, X1 - 0.1, ry + 1.0, bk.z1);
    B(c, K.conc, X0 + 0.1, ry, bk.z0, X0 + 0.3, ry + 1.0, bk.z1);
    B(c, K.conc, X1 - 0.3, ry, bk.z0, X1 - 0.1, ry + 1.0, bk.z1);
    for (let z = bk.z0 + 1; z < bk.z1 - 1.2; z += 1.6) {
      for (const x of [-150.4, -148.2, -145.2]) {
        B(c, K.wood, x - 0.7, ry, z - 0.3, x + 0.7, ry + 0.4, z + 0.3);
        B(c, rnd() < 0.5 ? K.leaf : K.green, x - 0.65, ry + 0.4, z - 0.25, x + 0.65, ry + 0.55 + rnd() * 0.3, z + 0.25);
      }
    }
    cy(c, K.conc, -143, ry, (bk.z0 + bk.z1) / 2, 1.0, 1.0, 1.8, 10);
    B(c, K.iron, -142.5, ry, bk.z0 + 1.5, -142.45, ry + 3.5, bk.z0 + 1.55);
    B(c, K.iron, -143.1, ry + 3.0, bk.z0 + 1.5, -141.9, ry + 3.04, bk.z0 + 1.55);
  }
  // the joints between the blocks: stair towers set back from the sea face
  for (const [j0, j1, h] of [[40, 41, F2 + 7 * ST], [28.5, 29.5, F2 + 7 * ST], [17, 18, F2 + 8 * ST], [5.5, 6.5, F2 + 6 * ST]] as const) {
    B(c, K.concDark, X0 + 1.2, F2T, j0, X1 - 1.2, h, j1);
    windows(c, false, X0 + 1.2, j0, j1, F2T, Math.floor((h - F2T) / ST), ST, -1, { every: 0.9, w: 0.5, h: 0.6, sill: 1.4, lit: 0.05 });
  }

  // ---------------------------------------------------------------- the rock row: shops below, flats, a roof garden
  {
    const R = ROCK;
    const RT = F2 + 2 * ST;
    const shops: { z0: number; z1: number; open: Gap; kind: string }[] = [
      { z0: 4, z1: 11, open: [5, 10.2], kind: 'coal' },
      { z0: 11, z1: 17, open: [12.2, 15.8], kind: 'rice' },
      { z0: 25, z1: 29.5, open: [26, 28.6], kind: 'tobacco' },
      { z0: 29.5, z1: 37, open: [30.4, 36.2], kind: 'grocer' },
      { z0: 43, z1: 50, open: [45.8, 47.6], kind: 'bar' },
    ];
    const PASS: Gap = [22, 25];
    const SX = -126.5; // the shops' back wall
    // the front (west) wall: shop openings and the passage
    wallRun(c, false, R.x0 + 0.15, R.z0, R.z1, 0, F2, K.concPale, [...shops.map((s) => s.open), PASS], 0, 'nikkyu-rock');
    // the back (east) wall onto the alley, the ends
    wallRun(c, false, R.x1 - 0.15, R.z0, R.z1, 0, F2, K.concPale, [PASS], 0, 'nikkyu-rock');
    wallRun(c, true, R.z0 + 0.15, R.x0, R.x1, 0, F2, K.concPale, [], 0, 'nikkyu-rock');
    wallRun(c, true, R.z1 - 0.15, R.x0, R.x1, 0, F2, K.concPale, [], 0, 'nikkyu-rock');
    // the passage through: walled, lit, roofed
    wallRun(c, true, PASS[0], R.x0 + 0.3, R.x1 - 0.3, 0, F2, K.concDark, [], 0, 'nikkyu-rock', 0.2);
    wallRun(c, true, PASS[1], R.x0 + 0.3, R.x1 - 0.3, 0, F2, K.concDark, [], 0, 'nikkyu-rock', 0.2);
    roof(c, R.x0, PASS[0], R.x1, PASS[1], F2 - 0.4);
    ceilingLamp(c, -126, F2 - 0.3, 23.5, 0.6, 0.3);
    B(c, K.wet, R.x0 + 0.3, 0, PASS[0] + 0.2, R.x1 - 0.3, 0.015, PASS[1] - 0.2);
    // shops: partitions and back walls, solid behind; closed units solid
    let zf = R.z0 + 0.3;
    for (const s of shops) {
      if (s.z0 - zf > 0.2) C(c, R.x0 + 0.3, zf, R.x1 - 0.3, s.z0, 0, F2, 'nikkyu-rock', { kind: 'building' });
      wallRun(c, true, s.z0, R.x0 + 0.3, SX, 0, F2, K.plaster, [], 0, 'nikkyu-shop', 0.2);
      wallRun(c, true, s.z1, R.x0 + 0.3, SX, 0, F2, K.plaster, [], 0, 'nikkyu-shop', 0.2);
      wallRun(c, false, SX, s.z0, s.z1, 0, F2, K.plaster, [], 0, 'nikkyu-shop', 0.2);
      C(c, SX + 0.1, s.z0, R.x1 - 0.3, s.z1, 0, F2, 'nikkyu-rock', { kind: 'building' });
      roof(c, R.x0, s.z0, SX, s.z1, F2 - 0.4);
      B(c, K.terrazzo, R.x0 + 0.3, 0, s.z0 + 0.1, SX - 0.1, 0.02, s.z1 - 0.1);
      ceilingLamp(c, (R.x0 + SX) / 2, F2 - 0.3, (s.z0 + s.z1) / 2);
      // the shutter half up over the opening, a canopy over the front
      B(c, K.rust, R.x0 - 0.12, 2.3, s.open[0], R.x0, 3.1, s.open[1]);
      for (let k = 0; k < 3; k++) B(c, K.iron, R.x0 - 0.14, 2.4 + k * 0.25, s.open[0], R.x0 - 0.11, 2.44 + k * 0.25, s.open[1]);
      B(c, K.wood, R.x0 - 1.2, 3.1, s.open[0] - 0.3, R.x0, 3.18, s.open[1] + 0.3);
      zf = s.z1;
      // the closed unit before the passage, then skip the passage itself
      if (zf < PASS[0] && !shops.some((q) => q.z0 === zf)) {
        C(c, R.x0 + 0.3, zf, R.x1 - 0.3, PASS[0] - 0.1, 0, F2, 'nikkyu-rock', { kind: 'building' });
        zf = PASS[1] + 0.1;
      }
    }
    if (R.z1 - 0.3 - zf > 0.2) C(c, R.x0 + 0.3, zf, R.x1 - 0.3, R.z1 - 0.3, 0, F2, 'nikkyu-rock', { kind: 'building' });
    // shutters down on the closed units
    for (let z = 38; z < 42.5; z += 2.2) {
      B(c, K.rust, R.x0 - 0.08, 0, z - 1, R.x0, 2.5, z + 1);
      for (let k = 1; k < 7; k++) B(c, K.iron, R.x0 - 0.1, k * 0.35, z - 1, R.x0 - 0.07, k * 0.35 + 0.04, z + 1);
    }
    for (const z of [0.5, 19.5]) {
      B(c, K.rust, R.x0 - 0.08, 0, z - 1.4, R.x0, 2.5, z + 1.4);
      for (let k = 1; k < 7; k++) B(c, K.iron, R.x0 - 0.1, k * 0.35, z - 1.4, R.x0 - 0.07, k * 0.35 + 0.04, z + 1.4);
    }
    // -- the coal merchant (the second coal sack lies just inside, JOBS.steam.coal[1])
    {
      const coal = JOBS.steam.coal[1]!;
      for (let i = 0; i < 6; i++) {
        const h = 0.5 + rnd() * 0.7;
        B(c, K.coal, -129.6 + rnd() * 1.6, 0, 4.6 + i * 0.95, -127.0, h, 5.5 + i * 0.95, rnd() * 0.3);
      }
      C(c, -129.8, 4.4, SX - 0.1, 10.6, 0, 1.2, 'coal-heap', { shots: false });
      for (let i = 0; i < 3; i++) B(c, K.burlap, -132.7, i * 0.32, 4.4, -131.7, (i + 1) * 0.32, 5.2, i * 0.15);
      C(c, -132.8, 4.3, -131.6, 5.3, 0, 1.0, 'sacks', { shots: false });
      B(c, K.iron, -131.2, 0, 10.3, -130.4, 0.9, 10.7);
      B(c, K.iron, -131.1, 0.9, 10.35, -130.5, 0.95, 10.65);
      C(c, -131.2, 10.3, -130.4, 10.7, 0, 0.95, 'scale', { shots: false });
      B(c, K.woodDark, coal.x + 2.0, 0, coal.z - 0.5, coal.x + 2.05, 1.3, coal.z - 0.45, 0.3);
      cy(c, K.iron, coal.x + 1.6, 0, coal.z + 1.6, 0.2, 0.18, 0.35, 8);
    }
    // -- the rice shop: wooden bins, sacks, a measuring box on the counter
    {
      B(c, K.wood, -131.4, 0, 16.0, -127.4, 0.9, 16.6);
      C(c, -131.4, 16.0, -127.4, 16.6, 0, 0.9, 'counter', { shots: false });
      for (let i = 0; i < 3; i++) {
        B(c, K.woodDark, -129.4 + i * 0.95, 0, 11.4, -128.6 + i * 0.95, 0.7, 12.4);
        B(c, K.paper, -129.35 + i * 0.95, 0.62, 11.45, -128.65 + i * 0.95, 0.66, 12.35);
      }
      C(c, -129.4, 11.4, SX - 0.1, 12.4, 0, 0.7, 'bins', { shots: false });
      for (let i = 0; i < 6; i++) B(c, K.burlap, -132.6, (i % 3) * 0.32, 14.2 + Math.floor(i / 3) * 0.9, -131.8, (i % 3 + 1) * 0.32, 14.9 + Math.floor(i / 3) * 0.9);
      C(c, -132.7, 14.1, -131.7, 15.9, 0, 1.0, 'sacks', { shots: false });
      B(c, K.woodPale, -129.6, 0.9, 16.1, -129.3, 1.05, 16.4);
    }
    // -- the tobacconist: a glass counter, small packets on shelves
    {
      B(c, K.woodDark, -131.6, 0, 25.4, -131.0, 1.0, 27.4);
      B(c, K.frame, -131.62, 1.0, 25.4, -130.98, 1.06, 27.4);
      C(c, -131.6, 25.4, -131.0, 27.4, 0, 1.06, 'counter', { shots: false });
      B(c, K.woodDark, SX - 0.5, 0, 25.4, SX - 0.1, 2.2, 29.1);
      for (let k = 0; k < 5; k++) for (let i = 0; i < 9; i++) B(c, [K.cloth, K.paper, K.clothBlue, K.leaf, K.amber][(i + k * 2) % 5]!, SX - 0.45, 0.3 + k * 0.4, 25.6 + i * 0.38, SX - 0.15, 0.45 + k * 0.4, 25.85 + i * 0.38);
      C(c, SX - 0.5, 25.4, SX - 0.1, 29.1, 0, 2.2, 'shelf', { shots: false });
    }
    // -- the greengrocer: tiered crate racks, mostly empty, a few cabbages gone dark
    {
      for (const z of [31.0, 35.2]) {
        for (let t = 0; t < 3; t++) B(c, K.wood, -131.8 + t * 0.6, t * 0.35, z - 0.8, -130.6 + t * 0.6, t * 0.35 + 0.3, z + 0.8);
        for (let i = 0; i < 3; i++) if (rnd() < 0.5) mesh(c, new THREE.SphereGeometry(0.16, 7, 5), K.leaf, -131.2 + rnd() * 1.6, 0.42 + Math.floor(rnd() * 2) * 0.35, z - 0.5 + rnd());
        C(c, -131.8, z - 0.8, -129.4, z + 0.8, 0, 1.0, 'racks', { shots: false });
      }
      for (let i = 0; i < 4; i++) B(c, K.wood, SX - 1.2, i * 0.32, 32 + (i % 2) * 0.2, SX - 0.3, (i + 1) * 0.32, 32.9 + (i % 2) * 0.2);
      C(c, SX - 1.2, 31.9, SX - 0.3, 33.2, 0, 1.3, 'crates', { shots: false });
    }
    // -- the tiny bar: a counter and stools, bottles, a lantern's glow in the window
    {
      B(c, K.woodDark, -130, 0, 43.6, -129.4, 1.05, 47.8);
      B(c, K.wood, -130.1, 1.05, 43.6, -129.3, 1.1, 47.8);
      C(c, -130, 43.6, -129.4, 47.8, 0, 1.1, 'bar', { shots: false });
      for (const z of [44.4, 45.6, 46.8]) {
        cy(c, K.iron, -130.6, 0, z, 0.04, 0.04, 0.68, 6);
        cy(c, K.cloth, -130.6, 0.68, z, 0.18, 0.18, 0.06, 10);
      }
      B(c, K.woodDark, SX - 0.4, 0, 43.6, SX - 0.1, 2.2, 49.4);
      for (let i = 0; i < 12; i++) cy(c, rnd() < 0.5 ? K.amber : K.leaf, SX - 0.25, 1.2 + (i % 2) * 0.5, 44 + i * 0.45, 0.05, 0.04, 0.3, 6);
      C(c, SX - 0.4, 43.6, SX - 0.1, 49.4, 0, 2.2, 'shelf', { shots: false });
      B(c, K.lamp, R.x0 - 0.04, 1.1, 43.6, R.x0 - 0.02, 1.9, 44.8);
      mesh(c, new THREE.SphereGeometry(0.22, 8, 6), K.cloth, R.x0 - 0.4, 2.8, 47.9);
    }
    // upper storeys: mass, windows on both faces, little balconies on the lane side
    B(c, K.concPale, R.x0, F2, R.z0, R.x1, RT, R.z1);
    C(c, R.x0, R.z0, R.x1, R.z1, F2, RT, 'nikkyu-rock-mass', { kind: 'none' });
    B(c, K.concDark, R.x0 - 0.1, F2 - 0.15, R.z0 - 0.1, R.x1 + 0.1, F2 + 0.05, R.z1 + 0.1);
    windows(c, false, R.x1, R.z0, R.z1, 0, 1, F2, 1, { lit: 0.08, every: 3.4, skip: [PASS, [6.6, 7.6], [33, 34], [46, 47]] });
    windows(c, true, R.z0, R.x0, R.x1, 0, 1, F2, -1, { lit: 0, every: 3.0 });
    windows(c, true, R.z1, R.x0, R.x1, 0, 1, F2, 1, { lit: 0, every: 3.0 });
    for (const z of [7.1, 33.5, 46.5]) {
      B(c, K.woodDark, R.x1, 0, z - 0.45, R.x1 + 0.06, 2.0, z + 0.45);
      B(c, K.concDark, R.x1, 2.1, z - 0.7, R.x1 + 0.6, 2.2, z + 0.7);
    }
    windows(c, false, R.x0, R.z0, R.z1, F2, 2, ST, -1, { lit: 0.15, every: 2.6 });
    windows(c, false, R.x1, R.z0, R.z1, F2, 2, ST, 1, { lit: 0.1, every: 2.6 });
    windows(c, true, R.z0, R.x0, R.x1, F2, 2, ST, -1, { lit: 0.1, every: 2.6 });
    windows(c, true, R.z1, R.x0, R.x1, F2, 2, ST, 1, { lit: 0.1, every: 2.6 });
    for (let s = 0; s < 2; s++) {
      const yy = F2 + s * ST;
      for (let z = R.z0 + 3; z < R.z1 - 2; z += 7.8) {
        B(c, K.concDark, R.x0 - 0.9, yy - 0.1, z - 1.2, R.x0, yy + 0.02, z + 1.2);
        for (const hh of [0.45, 0.9]) B(c, K.rust, R.x0 - 0.92, yy + hh - 0.04, z - 1.2, R.x0 - 0.86, yy + hh, z + 1.2);
        for (let i = 0; i < 5; i++) B(c, K.rust, R.x0 - 0.92, yy, z - 1.2 + i * 0.6, R.x0 - 0.86, yy + 0.9, z - 1.16 + i * 0.6);
        if (rnd() < 0.6) cy(c, K.clay, R.x0 - 0.5, yy, z + 0.6, 0.16, 0.12, 0.28, 6);
      }
    }
    streaks(c, false, R.x0, R.z0, R.z1, F2, RT, -1, 6);
    // the roof garden: parapet, beds of greens, a frame for gourds, the water tank
    B(c, K.conc, R.x0, RT, R.z0, R.x1, RT + 0.9, R.z0 + 0.2);
    B(c, K.conc, R.x0, RT, R.z1 - 0.2, R.x1, RT + 0.9, R.z1);
    B(c, K.conc, R.x0, RT, R.z0, R.x0 + 0.2, RT + 0.9, R.z1);
    B(c, K.conc, R.x1 - 0.2, RT, R.z0, R.x1, RT + 0.9, R.z1);
    for (let z = R.z0 + 1.5; z < R.z1 - 1.5; z += 2.4) {
      for (const x of [-130.8, -127.6, -124.4]) {
        B(c, K.wood, x - 1.2, RT, z - 0.6, x + 1.2, RT + 0.45, z + 0.6);
        B(c, K.soil, x - 1.1, RT + 0.45, z - 0.5, x + 1.1, RT + 0.5, z + 0.5);
        for (let i = 0; i < 3; i++) if (rnd() < 0.75) mesh(c, new THREE.SphereGeometry(0.28 + rnd() * 0.2, 6, 4), rnd() < 0.6 ? K.leaf : K.green, x - 0.75 + i * 0.75, RT + 0.6, z);
      }
    }
    for (const z of [8, 30]) {
      for (const [dx, dz] of [[0, 0], [3, 0], [0, 4], [3, 4]] as const) B(c, K.iron, -122.5 + dx, RT, z + dz, -122.44 + dx, RT + 2.0, z + dz + 0.06);
      B(c, K.iron, -122.5, RT + 2.0, z, -119.44, RT + 2.04, z + 4.06);
      for (let i = 0; i < 6; i++) mesh(c, new THREE.SphereGeometry(0.4, 6, 4), K.leaf, -122 + rnd() * 2.6, RT + 2.1, z + rnd() * 4);
    }
    cy(c, K.conc, -121, RT, 20, 0.9, 0.9, 1.6, 10);
  }

  // ---------------------------------------------------------------- the lane, the promenade, the back alley, the yard
  {
    // the lane: a gutter down its middle, lamps hung under the deck, bicycles, crates, potted plants
    B(c, K.wet, -135.3, 0, -1, -134.9, 0.02, 50);
    lamp(c, -134.2, 0, 24, { tag: 'nikkyu-lane' });
    for (const [x, z] of [[-134.1, 6], [-134.1, 30], [-134, 41]] as const) {
      cy(c, K.clay, x, 0, z, 0.25, 0.2, 0.4, 7);
      mesh(c, new THREE.SphereGeometry(0.35, 6, 4), K.leaf, x, 0.65, z);
      C(c, x - 0.25, z - 0.25, x + 0.25, z + 0.25, 0, 0.8, 'pot', { shots: false });
    }
    bicycle(c, -134, 0, 17.5, 0);
    bicycle(c, -134, 0, 19.0, 0);
    // the promenade (sea side): lamps, bollards, a capsized boat, dark wet patches
    lamp(c, -155.5, 0, 22, { tag: 'nikkyu-sea' });
    lamp(c, -155.5, 0, 44, { light: false });
    for (let z = -16; z < 52; z += 6) {
      if (Math.abs(z - 10) < 2 || Math.abs(z - 50) < 2) continue;
      cy(c, K.concDark, -158.6, 0, z, 0.22, 0.2, 0.7, 8);
      C(c, -158.85, z - 0.25, -158.35, z + 0.25, 0, 0.7, 'bollard', { shots: false });
    }
    for (const [z0, z1] of [[2, 7], [26, 33], [36, 40]] as const) B(c, K.wet, -157.5, 0, z0, -153.5, 0.012, z1);
    {
      // the rowboat upside down on blocks
      const bx = -157.2;
      const bz = 32;
      B(c, K.woodDark, bx - 0.7, 0.3, bz - 2, bx + 0.7, 0.8, bz + 2);
      B(c, K.wood, bx - 0.5, 0.8, bz - 1.8, bx + 0.5, 0.95, bz + 1.8);
      B(c, K.concDark, bx - 0.5, 0, bz - 1.4, bx + 0.5, 0.3, bz - 1.0);
      B(c, K.concDark, bx - 0.5, 0, bz + 1.0, bx + 0.5, 0.3, bz + 1.4);
      C(c, bx - 0.7, bz - 2, bx + 0.7, bz + 2, 0, 0.95, 'boat', { shots: false });
    }
    // the back alley (between the rock row and the terraces' wall)
    lamp(c, -106, 0, 20, { tag: 'nikkyu-alley' });
    // a public tap and trough against the wall
    B(c, K.conc, -106.2, 0, 12.5, -104.6, 0.8, 15.5);
    B(c, K.wet, -106.0, 0.8, 12.7, -104.8, 0.81, 15.3);
    B(c, K.iron, -104.9, 0.8, 13.9, -104.7, 1.4, 14.1);
    C(c, -106.2, 12.5, -104.6, 15.5, 0, 0.8, 'trough', { shots: false });
    // laundry poles
    for (const [z0, z1] of [[4, 10], [38, 44]] as const) {
      for (const z of [z0, z1]) {
        B(c, K.iron, -116.1, 0, z - 0.05, -116.0, 2.3, z + 0.05);
        C(c, -116.15, z - 0.1, -115.95, z + 0.1, 0, 2.3, 'pole', { shots: false });
      }
      B(c, K.iron, -116.07, 2.1, z0, -116.03, 2.14, z1);
      for (let z = z0 + 0.4; z < z1 - 0.5; z += 0.8) if (rnd() < 0.75) B(c, [K.paper, K.clothBlue, K.clothPink, K.cloth][Math.floor(rnd() * 4)]!, -116.08, 1.3 + rnd() * 0.3, z, -116.02, 2.1, z + 0.6);
    }
    // a vegetable plot, drums, crates, a handcart, pots along the wall
    B(c, K.conc, -116.4, 0, 15, -110.6, 0.3, 20.4);
    B(c, K.soil, -116.2, 0.3, 15.2, -110.8, 0.36, 20.2);
    for (let z = 15.8; z < 20; z += 0.9) for (let x = -115.6; x < -111; x += 0.8) if (rnd() < 0.7) mesh(c, new THREE.SphereGeometry(0.14 + rnd() * 0.08, 5, 4), K.leaf, x, 0.45, z);
    C(c, -116.4, 15, -110.6, 20.4, 0, 0.36, 'plot', { shots: false });
    for (const [x, z] of [[-106, 44], [-106.8, 45], [-105.9, 46.1], [-107.1, 2]] as const) {
      cy(c, K.rust, x, 0, z, 0.3, 0.3, 0.9, 10);
      C(c, x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, 0.9, 'drum', { shots: false, surface: 'metal' });
    }
    for (const [x, z, r] of [[-117.6, 1.5, 0.2], [-117.4, 2.7, -0.1], [-110, 46.5, 0.4]] as const) {
      B(c, K.wood, x - 0.5, 0, z - 0.5, x + 0.5, 1.0, z + 0.5, r);
      C(c, x - 0.55, z - 0.55, x + 0.55, z + 0.55, 0, 1.0, 'crate', { shots: false, surface: 'wood' });
    }
    {
      // the handcart
      const hx = -110;
      const hz = 26;
      B(c, K.wood, hx - 0.6, 0.45, hz - 1.0, hx + 0.6, 0.55, hz + 1.0);
      B(c, K.wood, hx - 0.55, 0.55, hz - 1.0, hx - 0.5, 0.8, hz + 1.0);
      B(c, K.wood, hx + 0.5, 0.55, hz - 1.0, hx + 0.55, 0.8, hz + 1.0);
      B(c, K.woodDark, hx - 0.45, 0.5, hz + 1.0, hx - 0.4, 0.55, hz + 2.4);
      B(c, K.woodDark, hx + 0.4, 0.5, hz + 1.0, hx + 0.45, 0.55, hz + 2.4);
      for (const s of [-1, 1]) mesh(c, new THREE.TorusGeometry(0.42, 0.05, 4, 14), K.woodDark, hx + s * 0.68, 0.42, hz, 0, Math.PI / 2, 0);
      C(c, hx - 0.75, hz - 1.0, hx + 0.75, hz + 2.4, 0, 0.8, 'cart', { shots: false });
    }
    for (let z = 28; z < 32; z += 1.2) {
      cy(c, K.clay, -118.4, 0, z, 0.2, 0.16, 0.34, 6);
      mesh(c, new THREE.SphereGeometry(0.28, 6, 4), K.leaf, -118.4, 0.55, z);
    }
    C(c, -118.7, 27.7, -118.1, 31.5, 0, 0.8, 'pots', { shots: false });
    // the rubble fall that closes the alley's north end (the pick opens it: OBSTACLES rubble, a shortcut)
    // (final polish: the fall is one named mesh, `hs-rubble`, that `hirasaka/arms.ts` hides once the pick opens it; its
    // collider is OBSTACLES rubble's `block`. Only a few broken lumps against the walls stay.)
    {
    const ob = OBSTACLES.find((o) => o.id === 'rubble')!;
    const x0 = ob.at.x + 1.0;
    const outer = c;
    hideable(c.b, 'hs-rubble', (hb) => {
      const c = { ...outer, b: hb } as Ctx;
      for (let i = 0; i < 16; i++) {
        const x = x0 + 0.6 + rnd() * (-104.6 - x0 - 1.2);
        const z = -3.2 + (rnd() - 0.5) * 1.4;
        const w = 1.0 + rnd() * 2.2;
        const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35 + rnd() * 0.4, 0.8 + rnd() * 1.4), rnd() < 0.7 ? K.rubble : K.conc);
        s.position.set(x, 0.3 + rnd() * 1.6, z);
        s.rotation.set((rnd() - 0.5) * 1.2, rnd() * 3, (rnd() - 0.5) * 1.2);
        c.b.add(s, { cast: false });
      }
      for (let i = 0; i < 6; i++) {
        const rx = x0 + 1 + rnd() * 12;
        const rz = -3.2 + (rnd() - 0.5) * 1.2;
        B(c, K.iron, rx, 0.6, rz, rx + 0.04, 2.2 + rnd(), rz + 0.04, rnd());
      }
      // a balcony rail torn off with it, and the heap's base
      B(c, K.wood, x0 + 4, 1.4, -4.0, x0 + 7, 2.3, -3.9, 0.3);
      B(c, K.rubble, x0, 0, -4.1, -104.4, 0.6, -2.2);
    });
    // what the pick leaves: broken slabs heaped against both sides and a few chunks kicked along the alley
    for (const [x, y, z, w, h, d, rx, ry, rz, m] of [
      [x0 + 0.5, 0.25, -3.6, 1.3, 0.5, 1.0, 0.3, 0.4, 0.2, 0],
      [x0 + 0.9, 0.55, -2.9, 0.9, 0.35, 0.8, -0.5, 1.1, 0.4, 1],
      [x0 + 0.4, 0.15, -2.3, 0.8, 0.3, 0.6, 0.1, 2.2, -0.2, 0],
      [-105.2, 0.3, -3.7, 1.4, 0.6, 0.9, -0.2, 0.7, 0.3, 0],
      [-105.6, 0.6, -2.7, 0.8, 0.4, 0.7, 0.6, 1.9, -0.3, 1],
      [-105.0, 0.15, -2.1, 0.7, 0.3, 0.5, 0, 0.3, 0.2, 0],
      [x0 + 5.5, 0.12, -1.2, 0.5, 0.24, 0.4, 0.3, 0.9, 0.1, 1],
      [-109.8, 0.1, -0.6, 0.4, 0.2, 0.35, -0.2, 2.6, 0.3, 0],
    ] as const) mesh(c, new THREE.BoxGeometry(w, h, d), m ? K.conc : K.rubble, x, y, z, rx, ry, rz);
    }
    // the north yard: a bicycle shelter, the ash bins, a bench, a lamp, a pine at the sea's edge
    {
      const sx0 = -127.5;
      const sx1 = -121.5;
      for (const [x, z] of [[sx0, -16], [sx1, -16], [sx0, -11.5], [sx1, -11.5]] as const) {
        B(c, K.iron, x - 0.06, 0, z - 0.06, x + 0.06, 2.4, z + 0.06);
        C(c, x - 0.08, z - 0.08, x + 0.08, z + 0.08, 0, 2.4, 'post', { surface: 'metal' });
      }
      B(c, K.rust, sx0 - 0.3, 2.4, -16.4, sx1 + 0.3, 2.48, -11.1);
      for (let x = sx0 + 0.8; x < sx1 - 0.4; x += 1.1) bicycle(c, x, 0, -13.8, Math.PI / 2);
      C(c, sx0 + 0.3, -14.8, sx1 - 0.3, -12.8, 0, 1.0, 'bicycles', { shots: false });
      B(c, K.conc, -146, 0, -15, -143, 1.0, -14.8);
      B(c, K.conc, -146, 0, -15, -145.8, 1.0, -13);
      B(c, K.conc, -143.2, 0, -15, -143, 1.0, -13);
      C(c, -146, -15, -143, -13, 0, 1.0, 'bins', { shots: false });
      cy(c, K.iron, -145, 0, -14, 0.3, 0.3, 0.7, 8);
      cy(c, K.iron, -144, 0, -14.1, 0.3, 0.3, 0.7, 8);
      bench(c, -138, 0, -15.5, 0, 0);
      lamp(c, -141, 0, -11, { tag: 'nikkyu-yard' });
      pine(c, -157.4, 0, -6, 0, 5.5);
    }
  }
}

function bicycle(c: Ctx, x: number, y: number, z: number, rot: number): void {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  for (const lz of [-0.5, 0.5]) mesh(c, new THREE.TorusGeometry(0.32, 0.025, 4, 14), K.black, x + lz * sn, y + 0.34, z + lz * cs, 0, rot + Math.PI / 2, 0);
  const p = at(c, x, y, z, rot);
  p(K.rust, 0, 0.55, 0, 0.04, 0.04, 0.9);
  p(K.rust, 0, 0.5, -0.1, 0.04, 0.4, 0.04);
  p(K.black, 0, 0.78, -0.12, 0.1, 0.04, 0.22);
  p(K.iron, 0, 0.88, 0.42, 0.5, 0.03, 0.03);
}
function bench(c: Ctx, x: number, y: number, z: number, rot: number, c0: number, len = 1.8): void {
  const p = at(c, x, y, z, rot);
  p(K.wood, 0, 0.44, 0, len, 0.06, 0.42);
  p(K.wood, 0, 0.75, -0.2, len, 0.3, 0.05);
  p(K.woodDark, -len / 2 + 0.1, 0.22, 0, 0.08, 0.44, 0.4);
  p(K.woodDark, len / 2 - 0.1, 0.22, 0, 0.08, 0.44, 0.4);
  pc(c, x, z, len, 0.45, rot, c0, y + 0.9, 'bench');
}
/** A wind-bent pine (trunk and three clouds of needles); `c0` the collider's foot. */
function pine(c: Ctx, x: number, y: number, z: number, c0: number, h: number): void {
  cy(c, K.woodDark, x, y, z, 0.22, 0.14, h * 0.75, 6);
  for (let i = 0; i < 3; i++) mesh(c, new THREE.SphereGeometry(0.9 + rnd() * 0.5, 6, 4), K.leaf, x + 0.6 * i - 0.6, y + h * (0.55 + i * 0.15), z + (rnd() - 0.5), 0, 0, 0);
  C(c, x - 0.25, z - 0.25, x + 0.25, z + 0.25, c0, y + h, 'tree');
}

// =====================================================================================================================
// BLOCK 30
// =====================================================================================================================
function buildBlock30(c: Ctx): void {
  const y = Y.town;
  const S3 = 3.0;
  const GT = y + S3; // the ground floor's ceiling (the 2F gallery)
  const TOP = y + 7 * S3;
  // the lines: outer walls, the ring of rooms, the galleries, the light well
  const XW = -86.6;
  const XWR = -82.4;
  const XWG = -79.6;
  const XEG = -61;
  const XER = -58.2;
  const XE = -54;
  const ZN = 24;
  const ZNR = 28.2;
  const ZNG = 31;
  const ZSG = 42;
  const ZSR = 44.8;
  const ZS = 49;
  const W: Gap = [35.5, 38.5]; // the west and east entrances (z)
  const N: Gap = [-76, -73]; // the north and south entrances (x)
  const wall = K.concOld;
  const inner = K.plaster;
  // ---- the ground floor
  wallRun(c, false, XW + 0.15, ZN, ZS, y, GT, wall, [W], 0, 'block30');
  wallRun(c, false, XE - 0.15, ZN, ZS, y, GT, wall, [W], 0, 'block30');
  wallRun(c, true, ZN + 0.15, XW, XE, y, GT, wall, [N], 0, 'block30');
  wallRun(c, true, ZS - 0.15, XW, XE, y, GT, wall, [N], 0, 'block30');
  // the ring's inner walls (onto the galleries), with the doorways of the open rooms
  wallRun(c, false, XWR, ZN + 0.3, ZS - 0.3, y, GT, inner, [W, [30.4, 32.0], [33.2, 34.8], [39.6, 41.4]], 0, 'block30', 0.2);
  wallRun(c, false, XER, ZN + 0.3, ZS - 0.3, y, GT, inner, [W, [31.6, 33.4]], 0, 'block30', 0.2);
  wallRun(c, true, ZNR, XWR + 0.1, XER - 0.1, y, GT, inner, [N, [-64.9, -63.1]], 0, 'block30', 0.2);
  wallRun(c, true, ZSR, XWR + 0.1, XER - 0.1, y, GT, inner, [N, [-80.4, -78.6]], 0, 'block30', 0.2);
  // partitions in the ring
  for (const z of [30, W[0], W[1], 44]) wallRun(c, true, z, XW + 0.3, XWR - 0.1, y, GT, inner, [], 0, 'block30', 0.2);
  for (const z of [30, W[0], W[1]]) wallRun(c, true, z, XER + 0.1, XE - 0.3, y, GT, inner, [], 0, 'block30', 0.2);
  for (const x of [N[0], N[1], -67, -61]) wallRun(c, false, x, ZN + 0.3, ZNR - 0.1, y, GT, inner, [], 0, 'block30', 0.2);
  for (const x of [N[0], N[1]]) wallRun(c, false, x, ZSR + 0.1, ZS - 0.3, y, GT, inner, [], 0, 'block30', 0.2);
  // the counter under the caretaker's window
  B(c, K.woodDark, XWR - 0.25, y, 33.2, XWR + 0.25, y + 1.0, 34.8);
  B(c, K.wood, XWR - 0.3, y + 1.0, 33.15, XWR + 0.35, y + 1.05, 34.85);
  C(c, XWR - 0.25, 33.2, XWR + 0.25, 34.8, 0, y + 1.05, 'counter', { shots: false });
  // closed rooms: solid
  for (const [x0, z0, x1, z1] of [
    [XW, ZN, XWR, 30],
    [XW, 44, XWR, ZS],
    [XER, ZN, XE, 30],
    [XER, W[1], XE, ZS],
    [XWR, ZN, N[0], ZNR],
    [N[1], ZN, -67, ZNR],
    [-61, ZN, XER, ZNR],
    [N[1], ZSR, XER, ZS],
  ] as const) C(c, x0 + 0.2, z0 + 0.15, x1 - 0.15, z1 - 0.15, 0, GT, 'block30-flats', { kind: 'building' });
  // the roof over the ring (the 2F's floor), with its collider; the well stays open to the sky
  for (const [x0, z0, x1, z1] of [
    [XW, ZN, XE, ZNG],
    [XW, ZSG, XE, ZS],
    [XW, ZNG, XWG, ZSG],
    [XEG, ZNG, XE, ZSG],
  ] as const) {
    B(c, K.concDark, x0, GT, z0, x1, GT + 0.3, z1);
    roof(c, x0, z0, x1, z1, GT);
  }
  // the galleries' floor and the well's: worn concrete, wet in the well
  B(c, K.concDark, XWG, y, ZNG, XEG, y + 0.015, ZSG);
  B(c, K.wet, -78, y + 0.015, 33, -70, y + 0.025, 40);
  // columns at the well's edge (the west one at z 32.4 carries the caretaker's key board)
  const cols: [number, number][] = [];
  for (const z of [ZNG, 32.4, 36.7, ZSG]) cols.push([XWG, z]);
  for (const z of [ZNG, 34.6, 38.6, ZSG]) cols.push([XEG, z]);
  for (const x of [-75.8, -71.4, -67, -63.4]) {
    cols.push([x, ZNG]);
    cols.push([x, ZSG]);
  }
  for (const [x, z] of cols) {
    B(c, wall, x - 0.2, y, z - 0.2, x + 0.2, TOP - 0.3, z + 0.2);
    C(c, x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0, TOP - 0.3, 'column');
  }
  // the key board on the column outside the caretaker's window (JOBS.steam.boilerKey hangs in front of it)
  {
    const bk = JOBS.steam.boilerKey;
    const cx = XWG - 0.2;
    B(c, K.woodDark, cx - 0.06, y + 0.75, bk.z + 0.1, cx, y + 1.65, bk.z + 0.75);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
      B(c, K.iron, cx - 0.1, y + 0.95 + r * 0.22, bk.z + 0.2 + k * 0.14, cx - 0.06, y + 0.97 + r * 0.22, bk.z + 0.22 + k * 0.14);
      if (rnd() < 0.6) B(c, K.paper, cx - 0.08, y + 0.85 + r * 0.22, bk.z + 0.19 + k * 0.14, cx - 0.07, y + 0.95 + r * 0.22, bk.z + 0.24 + k * 0.14);
    }
  }
  // ---- the rooms
  // the caretaker's room: desk and telephone, the key cabinet, the stove, the little raised tatami, a calendar
  {
    const x0 = XW + 0.3;
    const x1 = XWR - 0.1;
    B(c, K.woodPale, x0, y, 30.1, x1, y + 0.03, W[0] - 0.1);
    tatami(c, x0, 30.1, x0 + 1.8, W[0] - 0.1, y + 0.3);
    B(c, K.woodDark, x0, y, 30.1, x0 + 1.8, y + 0.3, W[0] - 0.1);
    C(c, x0, 30.1, x0 + 1.8, W[0] - 0.1, 0, y + 0.35, 'platform', { shots: false });
    B(c, K.woodDark, x1 - 1.2, y, 33.3, x1 - 0.1, y + 0.75, 34.7);
    C(c, x1 - 1.2, 33.3, x1 - 0.1, 34.7, 0, y + 0.75, 'desk', { shots: false });
    B(c, K.black, x1 - 0.8, y + 0.75, 33.8, x1 - 0.5, y + 0.85, 34.1);
    B(c, K.black, x1 - 0.82, y + 0.85, 33.82, x1 - 0.48, y + 0.9, 33.9);
    B(c, K.woodDark, x0 + 2.1, y + 1.2, 30.12, x0 + 3.0, y + 2.0, 30.3);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) B(c, K.iron, x0 + 2.2 + k * 0.2, y + 1.35 + r * 0.22, 30.3, x0 + 2.22 + k * 0.2, y + 1.37 + r * 0.22, 30.36);
    cy(c, K.iron, x0 + 2.2, y, 34.9, 0.22, 0.22, 0.45, 10);
    C(c, x0 + 1.95, 34.65, x0 + 2.45, 35.15, 0, y + 0.45, 'stove', { shots: false });
    tv(c, x0 + 0.5, y + 0.3, 34.6, Math.PI, 0);
    calendar(c, x0 + 2.6, y + 1.6, W[0] - 0.22, Math.PI);
    pendant(c, x0 + 2.0, GT, 32.6);
    clock(c, x0 + 0.03, y + 2.0, 32, Math.PI / 2);
  }
  // the west flat (z 38.5..44): tatami, twin-tub, TV, chabudai
  flat(c, { x0: XW + 0.3, z0: W[1] + 0.1, x1: XWR - 0.1, z1: 43.9, y, c0: 0, ceil: GT, inward: 'w', set: 'tv' });
  // the north-east flat (the photograph lies on its chabudai: PHOTOS[1])
  {
    const p = PHOTOS[1]!;
    const x0 = -67 + 0.1;
    const x1 = -61 - 0.1;
    B(c, K.concDark, p.x - 0.9, y, ZNR - 0.9, p.x + 0.9, y + 0.02, ZNR - 0.1);
    tatami(c, x0, ZN + 0.3, x1, ZNR - 0.9, y);
    chabudai(c, p.x, y, p.z, 0, false);
    B(c, K.paper, p.x - 0.12, y + 0.32, p.z + 0.1, p.x + 0.1, y + 0.33, p.z + 0.25, 0.4);
    tansu(c, x0 + 0.5, y, ZN + 0.55, 0, 0);
    kokeshi(c, x0 + 0.4, y + 1.1, ZN + 0.55);
    // the tiered doll stand against the east partition
    const d = at(c, x1 - 0.35, y, 25.6, -Math.PI / 2);
    for (let k = 0; k < 3; k++) d(K.cloth, 0, 0.15 + k * 0.15, -k * 0.12, 1.0, 0.3 + k * 0.3, 0.42 - k * 0.1);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 3 - k; i++) kokeshi(c, x1 - 0.4 + k * 0.12, y + 0.3 + k * 0.3, 25.6 + (i - (2 - k) / 2) * 0.28, 0.6, k === 2 ? K.paper : K.cloth);
    C(c, x1 - 0.6, 25.1, x1 - 0.05, 26.1, 0, y + 0.8, 'dolls', { shots: false });
    tv(c, x1 - 0.5, y, 27.3, -Math.PI / 2, 0);
    calendar(c, -64.6, y + 1.6, ZN + 0.42, 0);
    pendant(c, p.x, GT, p.z);
    washer(c, x0 + 0.5, y, ZNR - 0.5, Math.PI, 0);
  }
  // the east flat (z 30..35.5): the sewing machine, futons, the radio
  flat(c, { x0: XER + 0.1, z0: 30.1, x1: XE - 0.3, z1: W[0] - 0.1, y, c0: 0, ceil: GT, inward: 'e', set: 'sewing' });
  // the south-west flat (x -82.4..-76): the doll's room
  flat(c, { x0: XWR + 0.1, z0: ZSR + 0.1, x1: N[0] - 0.1, z1: ZS - 0.3, y, c0: 0, ceil: GT, inward: 's', set: 'doll' });
  // the entrances: letter boxes, shoe lockers, a lamp
  for (const [x0, z0, x1, z1] of [
    [XW + 0.3, W[0] + 0.1, XWR - 0.1, W[0] + 0.45],
    [XER + 0.1, W[1] - 0.45, XE - 0.3, W[1] - 0.1],
  ] as const) {
    B(c, K.woodDark, x0, y + 0.9, z0, x1, y + 1.9, z1);
    for (let i = 0; i < 6; i++) B(c, K.iron, x0 + 0.2 + i * 0.6, y + 1.3, (z0 + z1) / 2 - 0.2, x0 + 0.4 + i * 0.6, y + 1.34, (z0 + z1) / 2 + 0.2);
  }
  for (const [x, z] of [[(XW + XWR) / 2, 37], [(XER + XE) / 2, 37], [-74.5, 26.1], [-74.5, 46.9]] as const) ceilingLamp(c, x, GT, z, 0.4, 0.4);
  // ---- the light well: a hand pump, a drain, pots, a bicycle, the stair in its south-west corner, the collapse
  {
    B(c, K.iron, -77.6, y, 34, -77.3, y + 0.9, 34.3);
    B(c, K.iron, -77.6, y + 0.85, 33.6, -77.5, y + 0.9, 34.3, 0.4);
    B(c, K.conc, -78, y, 34.4, -76.9, y + 0.25, 35.2);
    C(c, -78, 33.9, -76.9, 35.2, 0, y + 0.9, 'pump', { shots: false });
    B(c, K.iron, -72.4, y, 36, -71.6, y + 0.03, 36.8);
    for (const [x, z] of [[-78.8, 31.8], [-62.8, 42.6], [-70, 41.4]] as const) {
      cy(c, K.clay, x, y, z, 0.22, 0.17, 0.36, 7);
      mesh(c, new THREE.SphereGeometry(0.3, 6, 4), K.leaf, x, y + 0.6, z);
    }
    bicycle(c, -74, y, 41.2, Math.PI / 2);
    // the stair in the well's south-west corner (its upper flight broken off)
    for (let i = 0; i < 6; i++) B(c, K.conc, -79.4, y, 41.8 - (i + 1) * 0.3, -78.0, y + (i + 1) * 0.25, 41.8 - i * 0.3);
    B(c, K.conc, -79.4, y, 37.6, -77.0, y + 1.5, 39.8);
    for (let i = 0; i < 3; i++) B(c, K.conc, -78.0, y + 1.5, 39.8 - i * 0.3, -77.0, y + 1.5 + (i + 1) * 0.25, 39.5 - i * 0.3 + 0.3);
    B(c, K.woodDark, -78.0, y + 0.3, 39.8, -77.95, y + 2.6, 41.8);
    c.b.add(
      (() => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 2.2), K.conc);
        m.position.set(-77.6, y + 2.6, 38.0);
        m.rotation.set(0.5, 0, 0.15, 'YXZ');
        return m;
      })(),
      { cast: false },
    );
    C(c, -79.4, 37.6, -77.0, 41.8, 0, y + 1.8, 'well-stair');
    // laundry lines across the well from the upper galleries
    for (const [yy, z] of [[y + 8.2, 34], [y + 11.2, 38.5], [y + 14.2, 33]] as const) {
      B(c, K.iron, XWG, yy, z, XEG, yy + 0.02, z + 0.02);
      for (let x = XWG + 1; x < XEG - 4; x += 1.4) if (rnd() < 0.6) B(c, [K.paper, K.clothBlue, K.clothPink][Math.floor(rnd() * 3)]!, x, yy - 0.7, z - 0.02, x + 0.6, yy, z + 0.04);
    }
    // the collapse: slabs from the east galleries leaning into the well, the heap at their feet
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.4 + rnd() * 2.2, 0.3 + rnd() * 0.3, 1.2 + rnd() * 1.8), rnd() < 0.7 ? K.rubble : wall);
      s.position.set(-65.5 + rnd() * 4, y + 0.3 + rnd() * 1.6, 32.4 + rnd() * 8.6);
      s.rotation.set((rnd() - 0.5) * 1.4, rnd() * 3, (rnd() - 0.5) * 1.4);
      c.b.add(s, { cast: false });
    }
    for (const [z, len, ang, w] of [[33.4, 9.5, 0.95, 2.6], [36.6, 11.5, 1.05, 3.0], [39.6, 8.5, 0.85, 2.4]] as const) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, w * 0.8), K.rubble);
      s.position.set(XEG - Math.cos(ang) * len * 0.5 + 0.4, y + Math.sin(ang) * len * 0.5, z);
      s.rotation.set(0, 0, ang, 'YXZ');
      c.b.add(s, { cast: false });
      for (let i = 0; i < 4; i++) B(c, K.iron, XEG - 1 - i * 0.9, y + 1 + i * 1.6, z - w / 2, XEG - 0.96 - i * 0.9, y + 1.7 + i * 1.6, z - w / 2 + 0.04);
    }
    B(c, K.rubble, -67.2, y, 32.3, XEG - 0.4, y + 0.5, 41.1);
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.6 + rnd() * 1.2, 0.4 + rnd() * 0.7, 0.6 + rnd() * 1.2), rnd() < 0.5 ? K.rubble : K.concDark);
      s.position.set(-67 + rnd() * 5.6, y + 0.4 + rnd() * 1.0, 32.6 + rnd() * 8.2);
      s.rotation.set(rnd() * 1.5, rnd() * 3, rnd() * 1.5);
      c.b.add(s, { cast: false });
    }
    C(c, -67.4, 32, XEG - 0.2, 41.4, 0, y + 2.2, 'collapse');
    C(c, -69, 32.6, -67.4, 41, 0, y + 0.8, 'collapse', { shots: false });
    // debris along the east gallery (a path stays open)
    for (const z of [32.2, 36.0, 40.4]) {
      B(c, K.rubble, XEG + 0.25, y, z - 0.6, XEG + 1.0, y + 0.5, z + 0.6, 0.2);
      C(c, XEG + 0.2, z - 0.6, XEG + 1.0, z + 0.6, 0, y + 0.5, 'debris', { shots: false });
    }
    c.b.light({ x: -72, y: y + 3.4, z: 36.5, color: 0xffa860, intensity: 16, distance: 14, mode: 'steady', pool: 3, glow: 0.4, tag: 'block30-well' });
    c.b.light({ x: -81, y: y + 2.6, z: 33.5, color: 0xffb070, intensity: 10, distance: 9, mode: 'flicker', pool: 0, glow: 0.3, tag: 'block30-caretaker' });
  }
  // ---- the storeys above: the ring's masses, the galleries round the well, the collapse on the east
  {
    const masses: [number, number, number, number, number][] = [
      [XW, ZN, XWR, ZS, TOP],
      [XWR, ZN, XER, ZNR, TOP],
      [XWR, ZSR, XER, ZS, TOP],
      [XER, ZN, XE, 33, TOP],
      [XER, 40, XE, ZS, TOP],
      [XER, 33, XE, 40, y + 4 * S3],
    ];
    for (const [x0, z0, x1, z1, top] of masses) {
      B(c, wall, x0, GT + 0.3, z0, x1, top, z1);
      C(c, x0, z0, x1, z1, GT + 0.3, top, 'block30-mass', { kind: 'none' });
    }
    // the broken top of the east wing
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 1.4 + rnd()), wall);
      s.position.set((XER + XE) / 2 - 0.5, y + 4 * S3 + 0.3 + rnd() * 1.2, 33.6 + i * 1.4);
      s.rotation.set((rnd() - 0.5) * 0.6, 0, -0.3 - rnd() * 0.5, 'YXZ');
      c.b.add(s, { cast: false });
    }
    // outer façades
    windows(c, false, XW, ZN, ZS, y, 7, S3, -1, { lit: 0.08, every: 2.4, skip: [W] });
    windows(c, false, XE, ZN, ZS, y, 7, S3, 1, { lit: 0.08, every: 2.4, skip: [W, [33, 40]] });
    windows(c, false, XE, 33, 40, y, 4, S3, 1, { lit: 0, every: 2.4, skip: [W] });
    windows(c, true, ZN, XW, XE, y, 7, S3, -1, { lit: 0.08, every: 2.4, skip: [N] });
    windows(c, true, ZS, XW, XE, y, 7, S3, 1, { lit: 0.08, every: 2.4, skip: [N] });
    for (const [al, f, a, e, n] of [[false, XW, ZN, ZS, -1], [true, ZN, XW, XE, -1], [true, ZS, XW, XE, 1]] as const) streaks(c, al, f, a, e, y, TOP, n, 7);
    // storey bands on the outside
    for (let s = 1; s < 7; s++) {
      const yy = y + s * S3;
      B(c, K.concDark, XW - 0.12, yy - 0.12, ZN - 0.12, XE + 0.12, yy, ZN + 0.02);
      B(c, K.concDark, XW - 0.12, yy - 0.12, ZS - 0.02, XE + 0.12, yy, ZS + 0.12);
      B(c, K.concDark, XW - 0.12, yy - 0.12, ZN, XW + 0.02, yy, ZS);
    }
    // the galleries round the well, storey by storey (the east one gone where it fell)
    for (let s = 1; s < 7; s++) {
      const yy = y + s * S3;
      const gal: [number, number, number, number][] = [
        [XWR, ZNR, XWG, ZSR],
        [XWG, ZNR, XEG, ZNG],
        [XWG, ZSG, XEG, ZSR],
        [XEG, ZNR, XER, 33],
        [XEG, 40, XER, ZSR],
      ];
      if (s >= 4) gal.push([XEG, 33, XER, 40]);
      for (const [x0, z0, x1, z1] of gal) B(c, K.concDark, x0, yy - 0.22, z0, x1, yy + 0.08, z1);
      // parapets at the well's edge, a rusted rail on top
      const par: [number, number, number, number][] = [
        [XWG - 0.15, ZNG, XWG, ZSG],
        [XWG, ZNG - 0.15, XEG, ZNG],
        [XWG, ZSG, XEG, ZSG + 0.15],
        [XEG, ZNG, XEG + 0.15, 33],
        [XEG, 40, XEG + 0.15, ZSG],
      ];
      if (s >= 4) par.push([XEG, 33, XEG + 0.15, 40]);
      for (const [x0, z0, x1, z1] of par) {
        B(c, wall, x0, yy + 0.08, z0, x1, yy + 0.9, z1);
        B(c, K.rust, x0 - 0.03, yy + 0.9, z0 - 0.03, x1 + 0.03, yy + 0.96, z1 + 0.03);
      }
      // doors and windows on the rooms' faces round the galleries
      for (const [al, f, a, e, n] of [
        [false, XWR, ZNR, ZSR, 1],
        [false, XER, ZNR, ZSR, -1],
        [true, ZNR, XWR, XER, 1],
        [true, ZSR, XWR, XER, -1],
      ] as const) {
        for (let p = a + 1.2; p < e - 1; p += 2.0) {
          if (!al && n < 0 && p > 33 && p < 40 && s < 4) continue;
          const door = Math.round((p - a) / 2) % 3 === 0;
          const m = door ? K.woodDark : rnd() < 0.15 ? K.lamp : K.winDark;
          const y0 = door ? yy + 0.08 : yy + 1.0;
          const y1 = door ? yy + 2.0 : yy + 1.9;
          const ff = f + n * 0.12;
          if (al) B(c, m, p - 0.45, y0, ff - 0.03, p + 0.45, y1, ff + 0.03);
          else B(c, m, ff - 0.03, y0, p - 0.45, ff + 0.03, y1, p + 0.45);
        }
      }
      // the ground floor's room faces get their doors too (the shut ones)
      if (s === 1) {
        for (const z of [26, 46.5]) B(c, K.woodDark, XWR + 0.1, y, z - 0.45, XWR + 0.16, y + 2.0, z + 0.45);
        for (const x of [-79.5, -70, -59.6]) B(c, K.woodDark, x - 0.45, y, ZNR + 0.1, x + 0.45, y + 2.0, ZNR + 0.16);
        for (const x of [-70, -64, -60]) B(c, K.woodDark, x - 0.45, y, ZSR - 0.16, x + 0.45, y + 2.0, ZSR - 0.1);
        for (const z of [26, 41]) B(c, K.woodDark, XER - 0.16, y, z - 0.45, XER - 0.1, y + 2.0, z + 0.45);
      }
    }
    // the roof: parapet, weeds and a small tree growing out of it, the water tank
    for (const [x0, z0, x1, z1] of [
      [XW, ZN, XE, ZN + 0.25],
      [XW, ZS - 0.25, XE, ZS],
      [XW, ZN, XW + 0.25, ZS],
      [XE - 0.25, ZN, XE, 33],
      [XE - 0.25, 40, XE, ZS],
    ] as const) B(c, wall, x0, TOP, z0, x1, TOP + 0.9, z1);
    for (let i = 0; i < 10; i++) mesh(c, new THREE.SphereGeometry(0.5 + rnd() * 0.6, 6, 4), rnd() < 0.5 ? K.leaf : K.green, XW + 1 + rnd() * 30, TOP + 0.3, rnd() < 0.5 ? ZN + 1 + rnd() * 3 : ZS - 1 - rnd() * 3, 0, 0, 0);
    cy(c, K.conc, -84, TOP, 46, 1.1, 1.1, 2.0, 10);
    pine(c, -57, TOP, 46.5, TOP, 3.2);
  }
  // ---- round the block: lamps, the bicycle rack, a garden by the hospital's wall, crates by Market Lane
  {
    lamp(c, -95, y, 30, { tag: 'block30-west' });
    for (let x = -101; x < -96; x += 1.0) bicycle(c, x, y, 42, Math.PI / 2);
    B(c, K.iron, -101.5, y, 41.4, -95.6, y + 0.6, 41.45);
    C(c, -101.5, 41.2, -95.6, 42.8, 0, y + 1.0, 'bicycles', { shots: false });
    B(c, K.conc, -70, y, 15.2, -58, y + 0.35, 21.4);
    B(c, K.soil, -69.8, y + 0.35, 15.4, -58.2, y + 0.4, 21.2);
    C(c, -70, 15.2, -58, 21.4, 0, y + 0.4, 'garden', { shots: false });
    for (let i = 0; i < 8; i++) mesh(c, new THREE.SphereGeometry(0.4 + rnd() * 0.3, 6, 4), K.leaf, -69 + rnd() * 10, y + 0.7, 16 + rnd() * 4.5, 0, 0, 0);
    pine(c, -66, y + 0.4, 18.5, 0, 5);
    bench(c, -63, y, 22.5, Math.PI, 0);
    for (const [x, z, r] of [[-48, 28, 0.3], [-47, 29.2, -0.2], [-49.5, 44, 0.1]] as const) {
      B(c, K.wood, x - 0.5, y, z - 0.5, x + 0.5, y + 1.0, z + 0.5, r);
      C(c, x - 0.55, z - 0.55, x + 0.55, z + 0.55, 0, y + 1.0, 'crate', { shots: false, surface: 'wood' });
    }
    cy(c, K.rust, -51, y, 46, 0.3, 0.3, 0.9, 10);
    C(c, -51.3, 45.7, -50.7, 46.3, 0, y + 0.9, 'drum', { shots: false, surface: 'metal' });
  }
}

// =====================================================================================================================
// THE HOSPITAL (Blocks 68 and 69)
// =====================================================================================================================
function buildHospital(c: Ctx): void {
  const y = Y.terrace;
  const SH = 3.6;
  const GT = y + SH;
  const TOP = y + 4 * SH;
  const M = { x0: -96, x1: -60, z0: -19, z1: -3 };
  const I = { x0: -54, x1: -42, z0: -15, z1: -5.4 };
  const COR: Gap = [-12.4, -9.6];
  const outer = K.concPale;
  const inner = K.cream;
  // ---- the main hospital's ground floor
  wallRun(c, true, M.z1 - 0.15, M.x0, M.x1, y, GT, outer, [[-92.4, -89.6]], 0, 'hospital');
  wallRun(c, true, M.z0 + 0.15, M.x0, M.x1, y, GT, outer, [], 0, 'hospital');
  wallRun(c, false, M.x0 + 0.15, M.z0, M.z1, y, GT, outer, [[-7.9, -6.1]], 0, 'hospital');
  wallRun(c, false, M.x1 - 0.15, M.z0, M.z1, y, GT, outer, [[-12.2, -9.8]], 0, 'hospital');
  // the waiting room's east wall (open to the corridor), the corridor's walls with the rooms' doors
  wallRun(c, false, -86, M.z0 + 0.3, M.z1 - 0.3, y, GT, inner, [COR], 0, 'hospital', 0.2);
  wallRun(c, true, COR[0], -86, M.x1 - 0.3, y, GT, inner, [[-83, -81.2], [-74.6, -72.4], [-65.4, -63.6]], 0, 'hospital', 0.2);
  wallRun(c, true, COR[1], -86, M.x1 - 0.3, y, GT, inner, [[-82.4, -80.6], [-73.4, -71.6], [-64.4, -62.6]], 0, 'hospital', 0.2);
  for (const x of [-78, -69]) wallRun(c, false, x, M.z0 + 0.3, COR[0], y, GT, inner, [], 0, 'hospital', 0.2);
  for (const x of [-77, -68]) wallRun(c, false, x, COR[1], M.z1 - 0.3, y, GT, inner, [], 0, 'hospital', 0.2);
  // the floor, the ceiling, the roof collider; the green wainscot down the corridor
  B(c, K.terrazzo, M.x0 + 0.3, y, M.z0 + 0.3, M.x1 - 0.3, y + 0.02, M.z1 - 0.3);
  B(c, K.concDark, M.x0, GT, M.z0, M.x1, GT + 0.3, M.z1);
  roof(c, M.x0, M.z0, M.x1, M.z1, GT);
  for (const z of [COR[0] + 0.11, COR[1] - 0.11]) B(c, K.mint, -86, y, z - 0.01, M.x1 - 0.3, y + 1.2, z + 0.01);
  // benches along the corridor, a gurney left in it
  bench(c, -76.5, y, COR[0] + 0.35, 0, 0, 1.6);
  bench(c, -66.8, y, COR[0] + 0.35, 0, 0, 1.6);
  {
    const gx = -69.4;
    const gz = -10.4;
    B(c, K.iron, gx - 1.0, y + 0.7, gz - 0.3, gx + 1.0, y + 0.75, gz + 0.3);
    B(c, K.paper, gx - 0.95, y + 0.75, gz - 0.28, gx + 0.95, y + 0.82, gz + 0.28);
    for (const dx of [-0.9, 0.9]) for (const dz of [-0.25, 0.25]) B(c, K.iron, gx + dx - 0.02, y, gz + dz - 0.02, gx + dx + 0.02, y + 0.7, gz + dz + 0.02);
    C(c, gx - 1.0, gz - 0.3, gx + 1.0, gz + 0.3, 0, y + 0.82, 'gurney', { shots: false });
  }
  // the corridor's lamps (one still flickering), a broken ceiling panel hanging
  for (let x = -84; x < -61; x += 5) ceilingLamp(c, x, GT, -11, 0.9, 0.25);
  c.b.light({ x: -74, y: GT - 0.4, z: -11, color: 0xfff0d0, intensity: 12, distance: 12, mode: 'flicker', pool: 0, glow: 0.3, tag: 'hospital-corridor' });
  {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.9), K.paper);
    s.position.set(-70.5, GT - 0.5, -11.2);
    s.rotation.set(0.6, 0.2, 0.3, 'YXZ');
    c.b.add(s, { cast: false });
  }
  // ---- the waiting room: benches, the reception counter and window, a scale, the stair up (choked with debris)
  {
    for (const z of [-8.4, -6.0]) for (const x of [-93.4, -89.4]) bench(c, x, y, z, Math.PI, 0, 2.6);
    B(c, K.woodDark, -88.2, y, -15.6, -86.3, y + 1.05, -12.8);
    B(c, K.wood, -88.3, y + 1.05, -15.7, -86.2, y + 1.1, -12.7);
    B(c, K.frame, -88.25, y + 1.1, -15.6, -88.15, y + 2.3, -12.8);
    B(c, K.woodDark, -88.3, y + 2.3, -15.7, -86.2, y + 2.4, -12.7);
    C(c, -88.2, -15.6, -86.3, -12.8, 0, y + 1.1, 'reception', { shots: false });
    B(c, K.paper, -87.6, y + 1.1, -14.4, -87.0, y + 1.14, -13.8, 0.3);
    B(c, K.iron, -91, y, -17.8, -90.4, y + 0.08, -17.2);
    B(c, K.iron, -90.75, y, -18.3, -90.65, y + 1.6, -18.2);
    C(c, -91, -18.3, -90.4, -17.2, 0, y + 1.6, 'scale', { shots: false });
    // the stair in the north-west corner: six steps then the fallen slabs
    for (let i = 0; i < 6; i++) B(c, K.conc, M.x0 + 0.3, y, -11 - (i + 1) * 0.3, M.x0 + 1.7, y + (i + 1) * 0.25, -11 - i * 0.3);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 1.2), rnd() < 0.5 ? K.rubble : outer);
      s.position.set(M.x0 + 1.0, y + 1.6 + i * 0.4, -13.6 - i * 0.6);
      s.rotation.set((rnd() - 0.5) * 0.9, rnd(), (rnd() - 0.5) * 0.9);
      c.b.add(s, { cast: false });
    }
    C(c, M.x0 + 0.3, -18.7, M.x0 + 1.8, -11, 0, y + 2.6, 'hospital-stair');
    cy(c, K.clay, -95.2, y, -4, 0.25, 0.2, 0.45, 7);
    B(c, K.woodDark, -95.25, y + 0.45, -4.05, -95.15, y + 1.3, -3.95, 0.4);
    C(c, -95.5, -4.3, -94.9, -3.7, 0, y + 0.5, 'pot', { shots: false });
    for (const x of [-93.0, -89.0]) wheelchair(c, x, y, -17.4, 0, 0);
    calendar(c, -88.8, y + 1.7, M.z0 + 0.32, 0);
    clock(c, -86.12, y + 2.4, -6, -Math.PI / 2);
    ceilingLamp(c, -91, GT, -11, 0.9, 0.3);
  }
  // ---- ward A (north): three beds, a screen, the drip stand
  {
    for (const x of [-84.4, -81.8, -79.4]) bed(c, x, y, -17.4, 0, 0);
    screen(c, -83.1, y, -15.2, 0);
    drip(c, -80.6, y, -16.4);
    windows(c, true, M.z0 + 0.3, -86, -78, y, 1, SH, 1, { lit: 0, every: 2.6 });
  }
  // ---- the operating room: the table under its lamp, the trolley, the anaesthetic cart, a glass cabinet, the sink
  {
    const ox = -73.5;
    const oz = -15.8;
    B(c, K.mint, -78 + 0.1, y, M.z0 + 0.3, -69 - 0.1, y + 1.8, M.z0 + 0.34);
    B(c, K.mint, -78 + 0.1, y, M.z0 + 0.3, -77.86, y + 1.8, COR[0] - 0.1);
    B(c, K.mint, -69.14, y, M.z0 + 0.3, -69.1, y + 1.8, COR[0] - 0.1);
    B(c, K.mint, -77.9, y + 0.02, -18.6, -69.1, y + 0.035, -12.6);
    B(c, K.iron, ox - 0.25, y, oz - 0.25, ox + 0.25, y + 0.75, oz + 0.25);
    B(c, K.mint, ox - 0.35, y + 0.75, oz - 1.0, ox + 0.35, y + 0.9, oz + 1.0);
    B(c, K.paper, ox - 0.3, y + 0.9, oz - 0.95, ox + 0.3, y + 0.95, oz + 0.6);
    C(c, ox - 0.4, oz - 1.0, ox + 0.4, oz + 1.0, 0, y + 0.95, 'op-table', { shots: false });
    // the lamp: an arm down from the ceiling and a disc of bulbs
    B(c, K.iron, ox - 0.03, GT - 0.9, oz - 0.03, ox + 0.03, GT, oz + 0.03);
    mesh(c, new THREE.CylinderGeometry(0.42, 0.5, 0.18, 14), K.enamel, ox, GT - 0.95, oz);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      B(c, K.lamp, ox + Math.cos(a) * 0.26 - 0.06, GT - 1.06, oz + Math.sin(a) * 0.26 - 0.06, ox + Math.cos(a) * 0.26 + 0.06, GT - 1.03, oz + Math.sin(a) * 0.26 + 0.06);
    }
    B(c, K.lamp, ox - 0.07, GT - 1.06, oz - 0.07, ox + 0.07, GT - 1.03, oz + 0.07);
    c.b.light({ x: ox, y: GT - 1.2, z: oz, color: 0xe8f0ff, intensity: 10, distance: 8, mode: 'fail', pool: 1.2, glow: 0.3, tag: 'hospital-or' });
    // the instrument trolley
    B(c, K.iron, ox + 1.2, y + 0.8, oz - 0.3, ox + 1.9, y + 0.84, oz + 0.3);
    B(c, K.iron, ox + 1.2, y + 0.3, oz - 0.3, ox + 1.9, y + 0.33, oz + 0.3);
    for (const [dx, dz] of [[1.22, -0.28], [1.88, -0.28], [1.22, 0.28], [1.88, 0.28]] as const) B(c, K.iron, ox + dx - 0.015, y, oz + dz - 0.015, ox + dx + 0.015, y + 0.84, oz + dz + 0.015);
    for (let i = 0; i < 5; i++) B(c, K.enamel, ox + 1.3 + i * 0.11, y + 0.84, oz - 0.2, ox + 1.33 + i * 0.11, y + 0.86, oz + 0.15);
    C(c, ox + 1.2, oz - 0.3, ox + 1.9, oz + 0.3, 0, y + 0.86, 'trolley', { shots: false });
    // the anaesthetic cart with its cylinders
    B(c, K.mint, ox - 2.2, y, oz - 0.9, ox - 1.5, y + 1.1, oz - 0.3);
    for (const dz of [-0.75, -0.45]) cy(c, K.green, ox - 1.35, y, oz + dz, 0.09, 0.09, 1.2, 8);
    C(c, ox - 2.2, oz - 0.9, ox - 1.2, oz - 0.3, 0, y + 1.2, 'cart', { shots: false });
    // the glass cabinet on the north wall, the scrub sink by the door
    B(c, K.woodDark, -76.6, y, M.z0 + 0.35, -74.8, y + 1.9, M.z0 + 0.8);
    B(c, K.frame, -76.5, y + 0.2, M.z0 + 0.8, -74.9, y + 1.8, M.z0 + 0.82);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) cy(c, i % 2 ? K.amber : K.paper, -76.3 + i * 0.26, y + 0.35 + k * 0.5, M.z0 + 0.58, 0.05, 0.05, 0.18, 6);
    C(c, -76.6, M.z0 + 0.35, -74.8, M.z0 + 0.8, 0, y + 1.9, 'cabinet', { shots: false });
    B(c, K.enamel, -70.2, y + 0.7, -13.6, -69.2, y + 0.9, -12.8);
    B(c, K.iron, -69.6, y + 0.9, -13.3, -69.55, y + 1.3, -13.25);
    C(c, -70.2, -13.6, -69.2, -12.8, 0, y + 0.9, 'sink', { shots: false });
  }
  // ---- the pharmacy: shelves of bottles on two walls, some on the floor, the dispensing table
  {
    for (const [x0, z0, x1, z1] of [
      [-68.6, M.z0 + 0.35, -60.4, M.z0 + 0.8],
      [-61.0, -18, -60.4, -13],
    ] as const) {
      B(c, K.woodDark, x0, y, z0, x1, y + 2.2, z1);
      const alongX = x1 - x0 > z1 - z0;
      const len = alongX ? x1 - x0 : z1 - z0;
      for (let k = 0; k < 5; k++) for (let i = 0; i < Math.floor(len / 0.2); i++) {
        if (rnd() < 0.3) continue;
        const px = alongX ? x0 + 0.1 + i * 0.2 : x0 - 0.08;
        const pz = alongX ? z1 + 0.06 : z0 + 0.1 + i * 0.2;
        cy(c, [K.amber, K.paper, K.clothBlue, K.leaf][Math.floor(rnd() * 4)]!, px, y + 0.3 + k * 0.4, pz, 0.05, 0.05, 0.16, 6);
      }
      C(c, x0, z0, x1, z1, 0, y + 2.2, 'shelves', { shots: false });
    }
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6), rnd() < 0.5 ? K.amber : K.paper);
      s.position.set(-66 + rnd() * 4, y + 0.05, -16 + rnd() * 3);
      s.rotation.set(Math.PI / 2, rnd() * 3, 0, 'YXZ');
      c.b.add(s, { cast: false });
    }
    B(c, K.wood, -66.6, y, -15.6, -64.2, y + 0.9, -14.8);
    B(c, K.iron, -65.6, y + 0.9, -15.3, -65.2, y + 1.05, -15.0);
    C(c, -66.6, -15.6, -64.2, -14.8, 0, y + 0.9, 'table', { shots: false });
    ceilingLamp(c, -64.5, GT, -16);
  }
  // ---- wards B and C (south): beds, screens, a bed turned over, the wheelchair
  {
    for (const x of [-84.6, -82, -79.4]) bed(c, x, y, -4.6, Math.PI, 0);
    screen(c, -80.7, y, -7.0, Math.PI);
    drip(c, -83.3, y, -5.4);
    for (const x of [-75, -72.4]) bed(c, x, y, -4.6, Math.PI, 0);
    {
      // a bed on its side
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 2.0), K.iron);
      s.position.set(-69.6, y + 0.45, -5.6);
      s.rotation.set(0, 0.3, 1.3, 'YXZ');
      c.b.add(s, { cast: false });
      B(c, K.paper, -70.8, y, -6.6, -69.8, y + 0.15, -4.8, 0.4);
      C(c, -70.4, -6.8, -68.6, -4.4, 0, y + 1.0, 'bed', { shots: false });
    }
    wheelchair(c, -74, y, -7.6, 0.6, 0);
    windows(c, true, M.z1 - 0.3, -86, -68, y, 1, SH, -1, { lit: 0, every: 2.6 });
  }
  // ---- the dental room: the chair, its lamp and spittoon, the instrument cabinet
  {
    const dx = -64;
    const dz = -5.8;
    B(c, K.iron, dx - 0.2, y, dz - 0.2, dx + 0.2, y + 0.45, dz + 0.2);
    B(c, K.mint, dx - 0.35, y + 0.45, dz - 0.6, dx + 0.35, y + 0.6, dz + 0.4);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.12), K.mint);
    back.position.set(dx, y + 0.95, dz - 0.65);
    back.rotation.set(-0.35, 0, 0, 'YXZ');
    c.b.add(back, { cast: false });
    B(c, K.mint, dx - 0.3, y + 0.25, dz + 0.4, dx + 0.3, y + 0.55, dz + 0.9);
    C(c, dx - 0.4, dz - 0.8, dx + 0.4, dz + 0.9, 0, y + 1.3, 'dental-chair', { shots: false });
    B(c, K.iron, dx + 0.6, y, dz - 0.6, dx + 0.66, y + 1.9, dz - 0.54);
    B(c, K.iron, dx + 0.1, y + 1.85, dz - 0.6, dx + 0.66, y + 1.9, dz - 0.54);
    mesh(c, new THREE.CylinderGeometry(0.14, 0.18, 0.1, 10), K.enamel, dx + 0.1, y + 1.78, dz - 0.57);
    cy(c, K.enamel, dx - 0.7, y, dz + 0.2, 0.12, 0.12, 0.85, 8);
    cy(c, K.enamel, dx - 0.7, y + 0.85, dz + 0.2, 0.2, 0.16, 0.12, 10);
    C(c, dx - 0.85, dz + 0.05, dx - 0.55, dz + 0.35, 0, y + 0.97, 'spittoon', { shots: false });
    B(c, K.enamel, -61.0, y, -8.8, -60.4, y + 1.1, -6.6);
    for (let k = 0; k < 4; k++) B(c, K.iron, -61.02, y + 0.2 + k * 0.25, -8.6, -61.0, y + 0.23 + k * 0.25, -6.8);
    C(c, -61.0, -8.8, -60.4, -6.6, 0, y + 1.1, 'cabinet', { shots: false });
    calendar(c, -67.85, y + 1.7, -6, Math.PI / 2);
  }
  // ---- the covered walkway to the isolation ward
  {
    const wz0 = -12.2;
    const wz1 = -9.8;
    for (const z of [wz0, wz1]) {
      B(c, outer, M.x1, y, z - 0.08, I.x0, y + 0.9, z + 0.08);
      C(c, M.x1, z - 0.1, I.x0, z + 0.1, 0, y + 0.9, 'walkway', { shots: false });
      for (const x of [M.x1 + 0.3, I.x0 - 0.3]) {
        B(c, K.iron, x - 0.06, y + 0.9, z - 0.06, x + 0.06, y + 2.8, z + 0.06);
      }
    }
    B(c, K.concDark, M.x1, y + 2.8, wz0 - 0.3, I.x0, y + 3.0, wz1 + 0.3);
    roof(c, M.x1, wz0, I.x0, wz1, y + 2.8);
  }
  // ---- the isolation ward
  {
    wallRun(c, false, I.x0 + 0.15, I.z0, I.z1, y, GT, outer, [[-12, -10]], 0, 'isolation');
    wallRun(c, false, I.x1 - 0.15, I.z0, I.z1, y, GT, outer, [], 0, 'isolation');
    wallRun(c, true, I.z0 + 0.15, I.x0, I.x1, y, GT, outer, [], 0, 'isolation');
    wallRun(c, true, I.z1 - 0.15, I.x0, I.x1, y, GT, outer, [], 0, 'isolation');
    wallRun(c, false, -50, I.z0 + 0.3, I.z1 - 0.3, y, GT, inner, [[-13.4, -11.8], [-8.8, -7.2]], 0, 'isolation', 0.2);
    wallRun(c, true, -10.2, -50, I.x1 - 0.3, y, GT, inner, [], 0, 'isolation', 0.2);
    B(c, K.terrazzo, I.x0 + 0.3, y, I.z0 + 0.3, I.x1 - 0.3, y + 0.02, I.z1 - 0.3);
    B(c, K.concDark, I.x0, GT, I.z0, I.x1, GT + 0.3, I.z1);
    roof(c, I.x0, I.z0, I.x1, I.z1, GT);
    for (const x of [-47.6, -45.4, -43.2]) bed(c, x, y, -13.4, 0, 0);
    screen(c, -45.3, y, -11.4, 0);
    for (const x of [-48.2, -46.0]) bed(c, x, y, -6.8, Math.PI, 0);
    B(c, K.wood, -43.6, y, -9.6, -42.6, y + 0.75, -8.4);
    C(c, -43.6, -9.6, -42.6, -8.4, 0, y + 0.75, 'desk', { shots: false });
    B(c, K.paper, -43.4, y + 0.75, -9.3, -42.9, y + 0.77, -8.8, 0.3);
    drip(c, -52.4, y, -14);
    wheelchair(c, -52.6, y, -6.6, 2.2, 0);
    ceilingLamp(c, -46, GT, -12.6);
    c.b.light({ x: -46.5, y: GT - 0.5, z: -8, color: 0xfff0d0, intensity: 8, distance: 8, mode: 'fail', pool: 0, glow: 0.2, tag: 'hospital-isolation' });
    windows(c, true, I.z0 + 0.3, -50, I.x1, y, 1, SH, 1, { lit: 0, every: 2.6 });
  }
  // ---- the storeys above: masses, windows, the roofs
  {
    B(c, outer, M.x0, GT + 0.3, M.z0, M.x1, TOP, M.z1);
    C(c, M.x0, M.z0, M.x1, M.z1, GT + 0.3, TOP, 'hospital-mass', { kind: 'none' });
    const IT = y + 2 * SH;
    B(c, outer, I.x0, GT + 0.3, I.z0, I.x1, IT, I.z1);
    C(c, I.x0, I.z0, I.x1, I.z1, GT + 0.3, IT, 'isolation-mass', { kind: 'none' });
    windows(c, true, M.z1, M.x0, M.x1, y, 4, SH, 1, { lit: 0.04, every: 2.4, w: 1.6, h: 1.5, skip: [[-92.6, -89.4]] });
    windows(c, true, M.z0, M.x0, M.x1, y, 4, SH, -1, { lit: 0.04, every: 2.4, w: 1.6, h: 1.5 });
    windows(c, false, M.x0, M.z0, M.z1, y, 4, SH, -1, { lit: 0.04, every: 2.4, w: 1.6, h: 1.5, skip: [[-8.2, -5.8]] });
    windows(c, false, M.x1, M.z0, M.z1, y, 4, SH, 1, { lit: 0.04, every: 2.4, w: 1.6, h: 1.5, skip: [[-12.6, -9.4]] });
    windows(c, true, I.z1, I.x0, I.x1, y, 2, SH, 1, { lit: 0.04, every: 2.4, w: 1.6, h: 1.5 });
    windows(c, true, I.z0, I.x0, I.x1, y, 2, SH, -1, { lit: 0, every: 2.4, w: 1.6, h: 1.5 });
    windows(c, false, I.x1, I.z0, I.z1, y, 2, SH, 1, { lit: 0.04, every: 2.4, w: 1.6, h: 1.5 });
    for (let s = 1; s < 4; s++) {
      const yy = y + s * SH;
      B(c, K.concDark, M.x0 - 0.1, yy - 0.15, M.z1 - 0.02, M.x1 + 0.1, yy, M.z1 + 0.15);
      B(c, K.concDark, M.x0 - 0.15, yy - 0.15, M.z0, M.x0 + 0.02, yy, M.z1);
    }
    streaks(c, true, M.z1, M.x0, M.x1, y, TOP, 1, 8);
    streaks(c, false, M.x0, M.z0, M.z1, y, TOP, -1, 4);
    // the entrance canopy over the door
    B(c, K.concDark, -93.4, y + 2.9, M.z1, -88.6, y + 3.1, M.z1 + 1.6);
    for (const x of [-93.2, -88.8]) B(c, K.concDark, x - 0.08, y + 2.6, M.z1, x + 0.08, y + 2.9, M.z1 + 1.4);
    // roofs: parapets, a water tank, weeds
    for (const [x0, z0, x1, z1, t] of [
      [M.x0, M.z0, M.x1, M.z0 + 0.25, TOP],
      [M.x0, M.z1 - 0.25, M.x1, M.z1, TOP],
      [M.x0, M.z0, M.x0 + 0.25, M.z1, TOP],
      [M.x1 - 0.25, M.z0, M.x1, M.z1, TOP],
      [I.x0, I.z0, I.x1, I.z0 + 0.25, IT],
      [I.x0, I.z1 - 0.25, I.x1, I.z1, IT],
      [I.x1 - 0.25, I.z0, I.x1, I.z1, IT],
    ] as const) B(c, outer, x0, t, z0, x1, t + 0.9, z1);
    cy(c, K.conc, -66, TOP, -14, 1.2, 1.2, 2.2, 10);
    for (let i = 0; i < 6; i++) mesh(c, new THREE.SphereGeometry(0.5 + rnd() * 0.5, 6, 4), K.leaf, M.x0 + 2 + rnd() * 30, TOP + 0.3, M.z0 + 1 + rnd() * 13, 0, 0, 0);
  }
  // ---- the forecourt: the five miner statues (SIDES tanko), benches, a pine, the old ambulance, the lamp
  {
    const t = SIDES.find((s) => s.id === 'tanko')!;
    // west to east, all facing the spot (north of them): push, bow, shovel, shade the eyes, lift
    const poses: ['push', 'bow', 'shovel', 'shade', 'lift'] = ['push', 'bow', 'shovel', 'shade', 'lift'];
    const ring: [number, number][] = [[-3.5, 2.2], [-2, 3.6], [0, 4.2], [2, 3.6], [3.5, 2.2]];
    ring.forEach(([dx, dz], i) => statue(c, t.x + dx, y, t.z + dz, Math.atan2(-dx, -dz), poses[i]!));
    bench(c, -98, y, 6.2, Math.PI / 2, 0);
    bench(c, -84.5, y, 8.4, Math.PI, 0);
    pine(c, -99, y, 1, 0, 6.5);
    pine(c, -55, y, 6, 0, 5);
    lamp(c, -78, y, 7, { mode: 'flicker', tag: 'hospital' });
    ambulance(c, -67, y, 4.5);
    // a stretcher left by the door, a wheelchair, the oxygen cylinders by the side door
    B(c, K.iron, -86.6, y + 0.6, -1.6, -84.4, y + 0.65, -1.0);
    B(c, K.paper, -86.5, y + 0.65, -1.55, -84.5, y + 0.72, -1.05);
    for (const x of [-86.4, -84.6]) B(c, K.iron, x - 0.02, y, -1.6, x + 0.02, y + 0.6, -1.0);
    C(c, -86.6, -1.6, -84.4, -1.0, 0, y + 0.72, 'stretcher', { shots: false });
    for (let i = 0; i < 4; i++) cy(c, K.green, -97.6 + (i % 2) * 0.3, y, -9.4 + Math.floor(i / 2) * 0.3, 0.12, 0.12, 1.3, 8);
    C(c, -97.8, -9.6, -97.1, -8.9, 0, y + 1.3, 'cylinders', { shots: false, surface: 'metal' });
    // hedge beds gone wild along the forecourt, the bare flagpole by the door
    for (const [x0, z0, x1, z1] of [
      [-76, 9.6, -60, 11.2],
      [-102.4, -2, -97.6, 3.2],
      [-60, -1.6, -55, 0.4],
    ] as const) {
      B(c, K.conc, x0, y, z0, x1, y + 0.4, z1);
      B(c, K.soil, x0 + 0.15, y + 0.4, z0 + 0.15, x1 - 0.15, y + 0.45, z1 - 0.15);
      for (let x = x0 + 0.6; x < x1 - 0.3; x += 0.9 + rnd() * 0.5) mesh(c, new THREE.SphereGeometry(0.42 + rnd() * 0.25, 6, 4), rnd() < 0.7 ? K.leaf : K.green, x, y + 0.75, (z0 + z1) / 2 + (rnd() - 0.5) * (z1 - z0 - 0.6));
      C(c, x0, z0, x1, z1, 0, y + 0.45, 'hedge', { shots: false });
    }
    B(c, K.iron, -95.6, y, 0.9, -95.5, y + 8, 1.0);
    B(c, K.concDark, -96, y, 0.5, -95.1, y + 0.3, 1.4);
    C(c, -96, 0.5, -95.1, 1.4, 0, y + 8, 'flagpole', { surface: 'metal' });
    // a stone lantern and a cherry tree by the stairs up to the landing
    B(c, K.rock, -52.4, y, 1.6, -51.6, y + 0.3, 2.4);
    B(c, K.rock, -52.15, y + 0.3, 1.85, -51.85, y + 1.0, 2.15);
    B(c, K.rock, -52.5, y + 1.0, 1.5, -51.5, y + 1.4, 2.5);
    B(c, K.rock, -52.6, y + 1.4, 1.4, -51.4, y + 1.55, 2.6);
    C(c, -52.5, 1.5, -51.5, 2.5, 0, y + 1.55, 'lantern');
  }
}

function bed(c: Ctx, x: number, y: number, z: number, rot: number, c0: number): void {
  const p = at(c, x, y, z, rot);
  p(K.iron, 0, 0.42, 0, 0.9, 0.06, 1.95);
  p(K.paper, 0, 0.53, 0.05, 0.86, 0.16, 1.8);
  p(K.enamel, 0, 0.66, -0.75, 0.6, 0.12, 0.32);
  if (rnd() < 0.6) p(K.clothBlue, 0, 0.62, 0.45, 0.88, 0.04, 1.0);
  p(K.iron, 0, 0.6, -0.97, 0.9, 0.9, 0.04);
  p(K.iron, 0, 0.45, 0.97, 0.9, 0.6, 0.04);
  for (const lx of [-0.43, 0.43]) for (const lz of [-0.95, 0.95]) p(K.iron, lx, 0.2, lz, 0.04, 0.4, 0.04);
  pc(c, x, z, 0.95, 2.0, rot, c0, y + 1.05, 'bed');
}
function screen(c: Ctx, x: number, y: number, z: number, rot: number): void {
  const p = at(c, x, y, z, rot);
  for (const lx of [-0.75, 0, 0.75]) p(K.iron, lx, 0.9, 0, 0.03, 1.8, 0.03);
  p(K.iron, 0, 1.8, 0, 1.53, 0.03, 0.03);
  p(K.paper, -0.37, 1.05, 0, 0.7, 1.3, 0.01);
  p(K.paper, 0.37, 1.05, 0, 0.7, 1.3, 0.01);
}
function drip(c: Ctx, x: number, y: number, z: number): void {
  B(c, K.iron, x - 0.02, y, z - 0.02, x + 0.02, y + 1.8, z + 0.02);
  B(c, K.iron, x - 0.25, y, z - 0.25, x + 0.25, y + 0.04, z + 0.25);
  B(c, K.paper, x + 0.04, y + 1.5, z - 0.05, x + 0.14, y + 1.72, z + 0.05);
}
function wheelchair(c: Ctx, x: number, y: number, z: number, rot: number, c0: number): void {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  for (const lx of [-0.3, 0.3]) mesh(c, new THREE.TorusGeometry(0.28, 0.025, 4, 14), K.iron, x + lx * cs, y + 0.3, z - lx * sn, 0, rot + Math.PI / 2, 0);
  const p = at(c, x, y, z, rot);
  p(K.clothBlue, 0, 0.5, 0, 0.5, 0.05, 0.45);
  p(K.clothBlue, 0, 0.78, -0.22, 0.5, 0.5, 0.04);
  p(K.iron, 0, 1.0, -0.3, 0.5, 0.03, 0.03);
  pc(c, x, z, 0.65, 0.6, rot, c0, y + 1.0, 'wheelchair');
}

/** One of the five miner statues on its plinth (stone, front faces rot), in the pose of a verse of the dance. */
function statue(c: Ctx, x: number, y: number, z: number, rot: number, pose: 'shovel' | 'lift' | 'shade' | 'push' | 'bow'): void {
  const stone = K.concPale;
  const p = at(c, x, y, z, rot);
  p(K.concDark, 0, 0.45, 0, 0.95, 0.9, 0.95);
  p(stone, 0, 0.93, 0, 1.0, 0.06, 1.0);
  const b = 0.96;
  p(stone, -0.11, b + 0.4, 0, 0.15, 0.8, 0.17);
  p(stone, 0.11, b + 0.4, 0, 0.15, 0.8, 0.17);
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const W = (lx: number, lz: number): [number, number] => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  // the rotated pieces: a box at local (lx, ly, lz) tilted about local x by `tilt` and local z by `roll`
  const tilted = (lx: number, ly: number, lz: number, w: number, h: number, d: number, tilt: number, roll = 0): void => {
    const [wx, wz] = W(lx, lz);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
    m.position.set(wx, y + ly, wz);
    m.rotation.set(tilt, rot, roll, 'YXZ');
    c.b.add(m, { cast: false });
  };
  const lean = pose === 'bow' ? 0.5 : pose === 'push' ? 0.25 : pose === 'shovel' ? 0.2 : 0;
  // torso (leaning forward about the hips), head and helmet with its lamp
  const tc = 0.32;
  tilted(0, b + 0.8 + Math.cos(lean) * tc, Math.sin(lean) * tc, 0.44, 0.64, 0.26, lean);
  const hy = b + 0.8 + Math.cos(lean) * 0.78;
  const hz = Math.sin(lean) * 0.78;
  const [hx, hzw] = W(0, hz);
  mesh(c, new THREE.SphereGeometry(0.13, 8, 6), stone, hx, y + hy, hzw);
  mesh(c, new THREE.CylinderGeometry(0.15, 0.16, 0.1, 10), stone, hx, y + hy + 0.09, hzw);
  const [lx2, lz2] = W(0, hz + 0.15);
  mesh(c, new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), stone, lx2, y + hy + 0.08, lz2, Math.PI / 2, rot, 0);
  // arms: shoulder height and forward offset follow the lean
  const sy = b + 0.8 + Math.cos(lean) * 0.58;
  const sz = Math.sin(lean) * 0.58;
  const arm = (side: number, tilt: number, roll = 0, len = 0.62): void => {
    const cx = side * 0.28 + Math.sin(roll) * len * 0.5 * side;
    const cyy = sy - Math.cos(tilt) * Math.cos(roll) * len * 0.5;
    const czz = sz + Math.sin(tilt) * len * 0.5;
    tilted(cx, cyy, czz, 0.11, len, 0.11, tilt, roll * side);
  };
  switch (pose) {
    case 'shovel': {
      arm(-1, 0.9);
      arm(1, 0.6);
      // the shovel held low across the body
      tilted(0.05, sy - 0.5, sz + 0.45, 0.05, 1.3, 0.05, 1.0);
      tilted(0.05, b + 0.3, sz + 0.95, 0.3, 0.04, 0.34, 0.2);
      break;
    }
    case 'lift': {
      arm(-1, Math.PI - 0.15);
      arm(1, Math.PI - 0.15);
      tilted(0, sy + 0.72, sz - 0.05, 0.6, 0.3, 0.4, 0);
      break;
    }
    case 'shade': {
      arm(-1, 0.1);
      // the right hand at the brow
      tilted(0.34, sy + 0.05, sz + 0.12, 0.11, 0.36, 0.11, 1.2, -0.9);
      tilted(0.16, sy + 0.28, sz + 0.2, 0.3, 0.1, 0.1, 0, 0);
      break;
    }
    case 'push': {
      arm(-1, Math.PI / 2 - 0.1);
      arm(1, Math.PI / 2 - 0.1);
      break;
    }
    default: {
      arm(-1, lean + 0.05);
      arm(1, lean + 0.05);
    }
  }
  C(c, x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0, y + 2.6, 'statue');
}

/** The hospital's old ambulance (a boxy van, white with a red stripe; no words). */
function ambulance(c: Ctx, x: number, y: number, z: number): void {
  // facing west
  B(c, K.enamel, x - 2.3, y + 0.45, z - 0.9, x + 2.3, y + 2.2, z + 0.9);
  B(c, K.enamel, x - 3.1, y + 0.45, z - 0.88, x - 2.3, y + 1.4, z + 0.88);
  B(c, K.winDark, x - 2.34, y + 1.45, z - 0.8, x - 2.28, y + 2.0, z + 0.8);
  B(c, K.winDark, x - 2.1, y + 1.45, z - 0.92, x - 1.3, y + 1.95, z + 0.92);
  B(c, K.cloth, x - 3.12, y + 1.0, z - 0.93, x + 2.32, y + 1.2, z + 0.93);
  B(c, K.cloth, x - 0.6, y + 2.2, z - 0.25, x - 0.2, y + 2.38, z + 0.25);
  B(c, K.black, x - 3.15, y + 0.45, z - 0.9, x - 3.08, y + 0.75, z + 0.9);
  for (const dx of [-2.3, 1.5]) for (const s of [-1, 1]) mesh(c, new THREE.CylinderGeometry(0.38, 0.38, 0.24, 12), K.black, x + dx, y + 0.38, z + s * 0.82, Math.PI / 2, 0, 0);
  C(c, x - 3.15, z - 0.95, x + 2.35, z + 0.95, 0, y + 2.4, 'ambulance', { surface: 'metal' });
}
