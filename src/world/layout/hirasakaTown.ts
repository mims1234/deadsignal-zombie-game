/**
 * HIRASAKA: MARKET LANE AND BLOCK 31 (place group 'town', rect x -40..70, z 14..54). Market Lane is on the town pad
 * (y 3.6, x -40..20); Block 31 is a storey lower (y 0, x 20..70), so its bath is the "basement" under the street.
 * Spots: `places.ts` JOBS.steam (boiler, coal[0]), LADLES, OBSTACLES bathDoor (its collider is the frame's), SIDES
 * barber + reel, WALL_BUYS market.
 *
 * The frame built: the pads, the parapet along x 20 with the flight down to Block 31 (z 32), the Hell Stairs' first
 * flight (x -16, from z 14 up to the landing), the flight up from the seawall (x -14, z 54).
 *
 * Built here (the lane runs east-west between z 35 and 43.5, crossed at x -21..-7 by the way from the seawall flight
 * up to the Hell Stairs' foot):
 *  - north side: three shops (fishmonger, sweet shop, diner) with a back yard and a tenement house behind them; the
 *    Shōwa-kan cinema (foyer, auditorium with the torn screen, the projection room off the foyer: the last reel); a
 *    corner tobacco-and-rice shop by the flight down to Block 31.
 *  - south side: the pachinko parlour (its stair down is fallen in: the basement opens on the seawall, built by
 *    `hirasakaSeawall.ts`) with the company price board, and a row of three shops (hardware, sake, rice).
 *  - Block 31: the six-storey block against the cliff; its lowest storey holds the bath (changing alcove, two tiled
 *    tubs, taps, the ladle shelf) and the boiler room behind the boarded door; the low wing in front holds the barber
 *    (two chairs, the scissors hook) and the post office; the coal yard with its bunker; the square.
 * Everything plain-coloured in a handful of finishes (one draw each per chunk); what glows is `H.lamp` / `H.lantern`.
 * The helpers below (`bx`, `sol`, `win`, `pane`, `room1974`, `bicycle`, `K`) are shared with `hirasakaSeawall.ts`.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import type { Ctx } from './util';
import { H, box, cyl, shell, slab, solid, type Side } from './hirasakaKit';
import { ball } from './zaryaKit';
import { JOBS, LADLES, OBSTACLES, SIDES, WALL_BUYS, Y } from '../../hirasaka/places';

export const TOWN_RECT = { x0: -40, z0: 14, x1: 70, z1: 54 };

// ---------------------------------------------------------------------------------------------------------------------
// the shared kit for the south shore (colours only in finishes the island already uses, so they draw together)
// ---------------------------------------------------------------------------------------------------------------------

const P = (color: number, r = 0.9, m = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m });
/** Extra colours: 0.9 (concrete's finish), 0.85 (wood's), 0.8 (red's), 0.6/0.5 (iron's), 0.15/0.3 (water's). */
export const K = {
  pane: P(0x161e22, 0.15, 0.3),
  rainPane: P(0x2a4448, 0.15, 0.3),
  mirror: P(0x9fb4bc, 0.15, 0.3),
  foam: P(0xc8dcda, 0.15, 0.3),
  puddle: P(0x1c2a2c, 0.15, 0.3),
  black: P(0x0c0d0f, 0.9),
  coal: P(0x101012, 0.9),
  sand: P(0x8a7a5c, 0.9),
  moss: P(0x3a4a30, 0.9),
  cream: P(0xd8cfb4, 0.9),
  sky: P(0x4a7aa8, 0.9),
  deepBlue: P(0x2a4a6a, 0.9),
  awnBlue: P(0x2c4c70, 0.85),
  awnRed: P(0x8e3024, 0.85),
  awnGreen: P(0x3e5e3a, 0.85),
  navy: P(0x1e2a44, 0.85),
  paper: P(0xe2dac4, 0.85),
  straw: P(0xb8a070, 0.85),
  orange: P(0xc8642c, 0.85),
  yellow: P(0xc8a040, 0.85),
  pink: P(0xc87890, 0.85),
  hull: P(0x23385a, 0.85),
  seat: P(0x7a2420, 0.85),
  post: P(0xb8261c, 0.85),
  stain: P(0x4a4a40, 0.9),
  tatami: P(0x8f8a5a, 0.9),
  rustDark: P(0x4a2a1a, 0.85, 0.2),
  steel: P(0x5a6266, 0.6, 0.5),
  tile: P(0x6e7c78, 0.15, 0.3),
  terrazzo: P(0x585c56, 0.15, 0.3),
  carpet: P(0x3a1a18, 0.85),
  boards: P(0x5a4232, 0.85),
  slate: P(0x5a6e8a, 0.9),
  chrome: P(0x9ca2a6, 0.6, 0.5),
  shutter: P(0x5a6064, 0.6, 0.5),
  green: P(0x3a5a40, 0.85),
};
type Mat = THREE.Material;

/** A box standing on `y` (its bottom), no shadow flag (so it draws with the shells' walls). */
export function bx(b: LevelBuilder, m: Mat, x: number, y: number, z: number, w: number, h: number, d: number, rot = 0): void {
  box(b, m, x, y + h / 2, z, w, h, d, rot, false);
}
/** A box on `y` and its collider from y 0 (low things let shots by). */
export function sol(c: Ctx, m: Mat, x: number, y: number, z: number, w: number, h: number, d: number, tag: string, shots = true, rot = 0): void {
  bx(c.b, m, x, y, z, w, h, d, rot);
  solid(c, x, z, w, d, y + h, tag, { shots, rot });
}
/** A cylinder standing on `y`, no shadow flag. */
export function cy(b: LevelBuilder, m: Mat, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 10): void {
  cyl(b, m, x, y, z, r0, r1, h, seg, false);
}
/**
 * An enterable room: the kit's `shell` (walls from y 0, doorways) with its roof drawn here without a shadow flag, so it
 * batches with the walls (the kit's roof slab casts, which splits every finish in two).
 */
export function room(c: Ctx, r: { x0: number; z0: number; x1: number; z1: number }, y: number, h: number, o: Parameters<typeof shell>[4] = {}): { x: number; z: number }[] {
  const out = shell(c, r, y, h, { ...o, roof: null });
  if (o.roof === null) return out;
  box(c.b, o.roof ?? H.concreteDark, (r.x0 + r.x1) / 2, y + h + 0.1, (r.z0 + r.z1) / 2, r.x1 - r.x0 + 0.3, 0.2, r.z1 - r.z0 + 0.3, 0, false);
  c.b.collide({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2, y0: y + h, y1: y + h + 0.2, blocksMove: false, blocksShots: true, mapKind: 'none', tag: 'roof' });
  return out;
}
/** A sodium lamp on a post (the kit's `lampPost`, its post without a shadow flag). */
export function lamp(c: Ctx, x: number, y: number, z: number, o: { color?: number; mode?: 'steady' | 'flicker' | 'fail'; h?: number; tag?: string } = {}): void {
  const h = o.h ?? 4.6;
  box(c.b, H.iron, x, y + h / 2, z, 0.12, h, 0.12, 0, false);
  box(c.b, H.iron, x + 0.3, y + h - 0.05, z, 0.7, 0.08, 0.08, 0, false);
  box(c.b, H.lamp, x + 0.55, y + h - 0.15, z, 0.3, 0.1, 0.18, 0, false);
  solid(c, x, z, 0.14, 0.14, y + h, 'lamp', { surface: 'metal' });
  c.b.light({ x: x + 0.55, y: y + h - 0.3, z, color: o.color ?? 0xffa860, intensity: 20, distance: 14, mode: o.mode ?? 'steady', pool: 3.2, glow: 0.6, tag: o.tag ?? 'lamp' });
}
const nrm = (s: Side): [number, number] => (s === 'N' ? [0, -1] : s === 'S' ? [0, 1] : s === 'W' ? [-1, 0] : [1, 0]);

/** A window on a wall face at (x, z) looking out of `face`: a frame, a dark pane (or a lit one), a sill, a mullion. */
export function win(b: LevelBuilder, x: number, y: number, z: number, w: number, h: number, face: Side, o: { lit?: boolean; frame?: Mat; sill?: boolean } = {}): void {
  const [nx, nz] = nrm(face);
  const ax = face === 'N' || face === 'S';
  const at = (k: number): [number, number] => [x + nx * k, z + nz * k];
  const [fx, fz] = at(0.03);
  box(b, o.frame ?? H.woodDark, fx, y + h / 2, fz, ax ? w + 0.16 : 0.06, h + 0.16, ax ? 0.06 : w + 0.16, 0, false);
  const [px, pz] = at(0.065);
  box(b, o.lit ? H.lamp : K.pane, px, y + h / 2, pz, ax ? w : 0.03, h, ax ? 0.03 : w, 0, false);
  const [mx, mz] = at(0.09);
  box(b, o.frame ?? H.woodDark, mx, y + h / 2, mz, ax ? 0.05 : 0.03, h, ax ? 0.03 : 0.05, 0, false);
  if (o.sill !== false) {
    const [sx, sz] = at(0.1);
    box(b, H.concrete, sx, y - 0.04, sz, ax ? w + 0.3 : 0.2, 0.08, ax ? 0.2 : w + 0.3, 0, false);
  }
}
/** A pane straight through a 0.3 m shell wall (seen from both sides), its frame round it. */
export function pane(b: LevelBuilder, x: number, y: number, z: number, w: number, h: number, alongX: boolean, m: Mat = K.rainPane): void {
  box(b, m, x, y + h / 2, z, alongX ? w : 0.34, h, alongX ? 0.34 : w, 0, false);
  box(b, H.woodDark, x, y + h / 2, z, alongX ? 0.06 : 0.36, h, alongX ? 0.36 : 0.06, 0, false);
  box(b, H.woodDark, x, y - 0.03, z, alongX ? w + 0.12 : 0.4, 0.06, alongX ? 0.4 : w + 0.12, 0, false);
}
/** A floor inside a room's walls (r: its wall lines), lifted above the pad so it never fights the ground. */
export function floor(b: LevelBuilder, m: Mat, r: { x0: number; z0: number; x1: number; z1: number }, y: number, lift = 0.04): void {
  box(b, m, (r.x0 + r.x1) / 2, y + lift, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 0.3, 0.02, r.z1 - r.z0 - 0.3, 0, false);
}
/** A flat triangle (a painted peak, a gable end) standing at (x, y, z), its base w wide, h high, facing +z (turned by ry). */
export function tri(b: LevelBuilder, m: Mat, x: number, y: number, z: number, w: number, h: number, ry = 0): void {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(0, h);
  sh.lineTo(-w / 2, 0);
  const g = new THREE.ShapeGeometry(sh);
  const back = g.clone();
  back.scale(-1, 1, 1);
  back.rotateY(Math.PI);
  for (const geo of [g, back]) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    b.add(o, { cast: false });
  }
}
/** A calendar on a wall, stopped at April 1974 (no words: a sheet, a red head, rows of little marks). */
export function calendar(b: LevelBuilder, x: number, y: number, z: number, face: Side): void {
  const [nx, nz] = nrm(face);
  const ax = face === 'N' || face === 'S';
  box(b, K.paper, x + nx * 0.02, y, z + nz * 0.02, ax ? 0.42 : 0.02, 0.58, ax ? 0.02 : 0.42, 0, false);
  box(b, K.post, x + nx * 0.035, y + 0.22, z + nz * 0.035, ax ? 0.42 : 0.02, 0.12, ax ? 0.02 : 0.42, 0, false);
  for (let r = 0; r < 4; r++) box(b, H.woodDark, x + nx * 0.035, y + 0.06 - r * 0.08, z + nz * 0.035, ax ? 0.34 : 0.01, 0.02, ax ? 0.01 : 0.34, 0, false);
}
/** A bicycle standing (leaning) along `rot`. */
export function bicycle(b: LevelBuilder, x: number, y: number, z: number, rot: number, m: Mat = K.awnRed): void {
  const g = new THREE.Group();
  const wheel = new THREE.TorusGeometry(0.33, 0.025, 4, 14);
  for (const s of [-0.52, 0.52]) {
    const w = new THREE.Mesh(wheel, H.iron);
    w.position.set(s, 0.35, 0);
    g.add(w);
  }
  const bar = (x0: number, y0: number, x1: number, y1: number, mm: Mat = m): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const o = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.04), mm);
    o.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    o.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    g.add(o);
  };
  bar(-0.52, 0.35, -0.1, 0.38);
  bar(-0.1, 0.38, 0.38, 0.75);
  bar(-0.1, 0.38, -0.18, 0.8);
  bar(-0.18, 0.8, 0.38, 0.75);
  bar(0.38, 0.75, 0.52, 0.35);
  bar(-0.52, 0.35, -0.18, 0.8);
  bar(-0.28, 0.84, -0.06, 0.84, H.iron);
  bar(0.34, 0.95, 0.42, 0.95, H.iron);
  bar(0.38, 0.75, 0.38, 0.95, H.iron);
  g.position.set(x, y, z);
  g.rotation.set(0, rot, 0.12);
  b.add(g, { cast: false });
}
/** A paper lantern (what glows on the lanes): a lit ball with dark caps. */
function lantern(b: LevelBuilder, x: number, y: number, z: number, r = 0.22): void {
  ball(b, H.lantern, x, y, z, r, 1.25, 8);
  box(b, H.woodDark, x, y + r * 1.25, z, r * 0.9, 0.05, r * 0.9, 0, false);
  box(b, H.woodDark, x, y - r * 1.25, z, r * 0.9, 0.05, r * 0.9, 0, false);
}
/** A thin straight bar between two points (wires, rails, poles). */
export function bar(b: LevelBuilder, m: Mat, a: [number, number, number], e: [number, number, number], t = 0.04): void {
  const dx = e[0] - a[0];
  const dy = e[1] - a[1];
  const dz = e[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const o = new THREE.Mesh(new THREE.BoxGeometry(t, t, len), m);
  o.position.set((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, (a[2] + e[2]) / 2);
  o.lookAt(e[0], e[1], e[2]);
  b.add(o, { cast: false });
}

/**
 * A home of 1974, inside `r` (the room's inner rectangle) at floor `y`, its things along the `back` wall: tatami, a
 * low table and cushions, the TV on its cabinet, a twin-tub washer, a chest with a doll on it, a sewing machine, a
 * calendar stopped at April 1974, a lamp. Everything stands against a wall (no gaps to seal a pocket).
 */
export function room1974(c: Ctx, r: { x0: number; z0: number; x1: number; z1: number }, y: number, back: 'N' | 'S', o: { light?: boolean; seed?: number } = {}): void {
  const { b } = c;
  const s = back === 'N' ? 1 : -1; // into the room from the back wall
  const zb = back === 'N' ? r.z0 : r.z1;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  // tatami (each mat with its dark border), a step of boards by the door
  for (let i = 0; i < Math.floor(w / 1.85); i++)
    for (let j = 0; j < 2; j++) {
      const mx = r.x0 + 0.95 + i * 1.85;
      const mz = zb + s * (0.6 + j * 0.92);
      box(b, K.tatami, mx, y + 0.07, mz, 1.8, 0.03, 0.88, 0, false);
      box(b, H.woodDark, mx, y + 0.062, mz, 1.84, 0.02, 0.92, 0, false);
    }
  box(b, K.boards, cx, y + 0.04, cz, w, 0.02, r.z1 - r.z0, 0, false);
  box(b, H.woodPale, cx, y + 0.06, zb + s * 2.6, w - 0.4, 0.02, 0.9, 0, false);
  if (w >= 7) {
    const fx = r.x0 + 2.45;
    box(b, H.woodDark, fx, y + 0.95, zb + s * 0.02, 1.9, 1.85, 0.03, 0, false);
    for (const k of [-0.47, 0.47]) box(b, K.cream, fx + k, y + 0.95, zb + s * 0.04, 0.86, 1.75, 0.02, 0, false);
    box(b, H.woodDark, r.x1 - 1.6, y + 1.75, zb + s * 0.03, 0.34, 0.26, 0.02, 0, false);
    box(b, K.cream, r.x1 - 1.6, y + 1.75, zb + s * 0.045, 0.26, 0.18, 0.01, 0, false);
  }
  // the chest against the back wall, a doll on it
  const tx = r.x0 + 0.65;
  sol(c, H.woodDark, tx, y, zb + s * 0.25, 1.1, 1.15, 0.45, 'tansu', false);
  for (let k = 0; k < 4; k++) box(b, H.woodPale, tx, y + 0.2 + k * 0.26, zb + s * 0.48, 0.96, 0.02, 0.02, 0, false);
  cy(b, K.awnRed, tx + 0.2, y + 1.15, zb + s * 0.25, 0.09, 0.05, 0.26, 8);
  ball(b, K.paper, tx + 0.2, y + 1.47, zb + s * 0.25, 0.065);
  ball(b, K.black, tx + 0.2, y + 1.5, zb + s * 0.23, 0.07, 0.8);
  // the TV on its cabinet, rabbit ears
  const vx = cx;
  sol(c, H.wood, vx, y, zb + s * 0.25, 0.9, 0.45, 0.45, 'tv', false);
  bx(b, H.woodDark, vx, y + 0.45, zb + s * 0.27, 0.68, 0.54, 0.46);
  box(b, P(0x2c3a36, 0.15, 0.3), vx - 0.06, y + 0.73, zb + s * 0.51, 0.46, 0.38, 0.02, 0, false);
  for (const k of [-1, 1]) bar(b, H.iron, [vx, y + 0.99, zb + s * 0.27], [vx + k * 0.25, y + 1.42, zb + s * 0.2], 0.015);
  // the twin-tub washer at the other end of the back wall
  const wx = r.x1 - 0.5;
  sol(c, K.cream, wx, y, zb + s * 0.32, 0.8, 0.88, 0.5, 'washer', false);
  for (const k of [-0.19, 0.19]) box(b, P(0x8ab0c0, 0.85), wx + k, y + 0.9, zb + s * 0.32, 0.34, 0.03, 0.42, 0, false);
  cy(b, K.black, wx - 0.2, y + 0.6, zb + s * 0.58, 0.04, 0.04, 0.03, 8);
  // the low table and cushions in the middle of the room
  cy(b, H.woodDark, cx - 0.4, y, cz, 0.08, 0.08, 0.3, 8);
  cy(b, H.wood, cx - 0.4, y + 0.3, cz, 0.48, 0.48, 0.05, 14);
  for (const [dx, dz] of [[-0.85, 0], [0.05, 0.1], [-0.4, 0.7]] as const) box(b, K.awnBlue, cx - 0.4 + dx, y + 0.05, cz + dz, 0.5, 0.08, 0.5, 0.3, false);
  // the sewing machine on its table against a side wall
  const sx = r.x0 + 0.3;
  const sz = cz + s * 0.6;
  sol(c, H.wood, sx, y, sz, 0.45, 0.72, 0.9, 'sewing', false);
  bx(b, K.black, sx + 0.02, y + 0.72, sz, 0.18, 0.08, 0.45);
  bx(b, K.black, sx + 0.02, y + 0.8, sz + 0.16, 0.12, 0.22, 0.08);
  bx(b, K.black, sx + 0.02, y + 0.98, sz - 0.02, 0.1, 0.07, 0.36);
  // the calendar, a scroll, a hanging lamp
  calendar(b, r.x1, y + 1.6, cz, 'W');
  box(b, K.paper, cx + 1.2, y + 1.5, zb + s * 0.03, 0.4, 0.9, 0.02, 0, false);
  cy(b, K.paper, cx - 0.4, y + 2.15, cz, 0.32, 0.12, 0.22, 10);
  box(b, H.iron, cx - 0.4, y + 2.5, cz, 0.02, 0.4, 0.02, 0, false);
  if (o.light) c.b.light({ x: cx - 0.4, y: y + 2.1, z: cz, color: 0xffc888, intensity: 6, distance: 7, mode: 'flicker', pool: 0, glow: 0, tag: 'room1974' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the town
// ---------------------------------------------------------------------------------------------------------------------

const T = Y.town;

export function buildTown(c: Ctx): void {
  marketNorth(c);
  cinema(c);
  marketSouth(c);
  pachinko(c);
  laneDressing(c);
  block31Tower(c);
  bath(c);
  boilerRoom(c);
  frontWing(c);
  coalYard(c);
}

/** A shopfront awning over a doorway on the face `zf` (out toward +z when `out` > 0). */
function awning(b: LevelBuilder, m: Mat, x: number, zf: number, w: number, out: number): void {
  const a = Math.atan2(0.55, Math.abs(out));
  slab(b, m, x, T + 2.75, zf + out / 2, w, 0.06, Math.hypot(out, 0.55), out > 0 ? a : -a, 0, 0, false);
  box(b, m, x, T + 2.38, zf + out, w, 0.24, 0.03, 0, false);
}

/** The roll of a shutter above a doorway and its guide rails. */
function shutterBox(b: LevelBuilder, x: number, zf: number, w: number, out: number): void {
  box(b, K.shutter, x, T + 2.62, zf + out * 0.12, w + 0.1, 0.24, 0.22, 0, false);
  for (const k of [-1, 1]) box(b, K.shutter, x + k * (w / 2 + 0.03), T + 1.25, zf + out * 0.06, 0.05, 2.5, 0.06, 0, false);
}

/** An upper storey (or several) over a shop row: plaster, wooden windows on its fronts, a cornice; a shots collider. */
function upperStoreys(c: Ctx, r: { x0: number; z0: number; x1: number; z1: number }, y0: number, n: number, fronts: Side[], o: { wall?: Mat; lit?: number; rail?: boolean } = {}): void {
  const { b } = c;
  const h = n * 3;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  bx(b, o.wall ?? H.plaster, cx, y0, cz, w, h, d);
  bx(b, H.concreteDark, cx, y0 + h, cz, w + 0.3, 0.25, d + 0.3);
  c.b.collide({ x: cx, z: cz, hx: w / 2, hz: d / 2, y0, y1: y0 + h + 0.25, blocksShots: true, mapKind: 'building', tag: 'upper' });
  let k = 0;
  for (const f of fronts) {
    const ax = f === 'N' || f === 'S';
    const len = ax ? w : d;
    const nWin = Math.max(1, Math.floor(len / 3));
    for (let s = 0; s < n; s++)
      for (let i = 0; i < nWin; i++) {
        const t = (i + 0.5) / nWin;
        const x = ax ? r.x0 + t * w : f === 'W' ? r.x0 : r.x1;
        const z = ax ? (f === 'N' ? r.z0 : r.z1) : r.z0 + t * d;
        win(b, x, y0 + 0.9 + s * 3, z, 1.5, 1.2, f, { lit: o.lit !== undefined && k++ % 7 === o.lit });
        if (o.rail && s === 0 && ax) {
          const [, nz] = nrm(f);
          box(b, H.wood, x, y0 + 0.85 + s * 3, z + nz * 0.5, 2.2, 0.08, 0.06, 0, false);
          for (let q = -1; q <= 1; q++) box(b, H.wood, x + q * 1.05, y0 + 0.45 + s * 3, z + nz * 0.5, 0.06, 0.8, 0.06, 0, false);
          box(b, H.wood, x, y0 + s * 3 + 0.02, z + nz * 0.27, 2.2, 0.06, 0.55, 0, false);
        }
      }
  }
}

/** Shelves of goods on a wall (x0..x1 along x, at the wall line z, `s` into the room). */
function goodsShelf(b: LevelBuilder, x0: number, x1: number, z: number, s: number, seed: number, levels = 4): void {
  let q = seed * 7919 + 13;
  const rnd = (): number => ((q = (q * 16807) % 2147483647) / 2147483647);
  const goods = [K.awnRed, K.yellow, K.awnBlue, K.paper, K.green, K.pink, K.orange];
  const zc = z + s * 0.25;
  for (let l = 0; l < levels; l++) {
    const yy = T + 0.35 + l * 0.5;
    box(b, H.woodDark, (x0 + x1) / 2, yy, zc, x1 - x0, 0.04, 0.42, 0, false);
    for (let x = x0 + 0.15; x < x1 - 0.15; x += 0.24 + rnd() * 0.1) {
      if (rnd() < 0.2) continue;
      const h = 0.12 + rnd() * 0.24;
      box(b, goods[Math.floor(rnd() * goods.length)]!, x, yy + 0.02 + h / 2, zc, 0.16, h, 0.24, 0, false);
    }
  }
  for (const x of [x0, x1]) box(b, H.woodDark, x, T + 1.1, zc, 0.05, 2.1, 0.44, 0, false);
}

// ---- the north side of the lane -----------------------------------------------------------------------------------

function marketNorth(c: Ctx): void {
  const { b } = c;
  // three shops in one row (fishmonger, sweet shop, diner), open fronts on the lane
  const R = { x0: -39, z0: 28.5, x1: -21, z1: 35 };
  room(c, R, T, 3.4, { doors: [{ side: 'S', at: 3, w: 3.6 }, { side: 'S', at: 9, w: 3.6 }, { side: 'S', at: 15, w: 3.6 }], wall: H.concrete, tag: 'shop' });
  floor(b, K.terrazzo, R, T);
  for (const x of [-33, -27]) sol(c, H.plaster, x, T, 31.75, 0.2, 3.4, 6.2, 'shop');
  upperStoreys(c, R, T + 3.6, 1, ['S', 'N'], { lit: 2, rail: true });
  const awns = [K.awnBlue, K.awnRed, K.awnGreen];
  for (let i = 0; i < 3; i++) {
    const x = -36 + i * 6;
    awning(b, awns[i]!, x, 35.15, 5.4, 1.6);
    shutterBox(b, x, 35.15, 3.6, 1);
    goodsShelf(b, x - 2.6, x + 1.2, 28.65, 1, 3 + i, i === 2 ? 2 : 4);
    calendar(b, i < 2 ? x + 2.9 : -21.15, T + 1.7, 31, 'W');
  }
  // the fishmonger: ice tubs at the front, crates, a hanging scale, the counter
  sol(c, K.cream, -36.8, T, 32.4, 1.3, 0.7, 0.8, 'fish-tub', false);
  box(b, K.mirror, -36.8, T + 0.72, 32.4, 1.2, 0.04, 0.7, 0, false);
  for (let k = 0; k < 4; k++) box(b, K.chrome, -37.2 + k * 0.26, T + 0.77, 32.4 + (k % 2) * 0.12, 0.22, 0.05, 0.08, 0.3 * k, false);
  sol(c, H.wood, -33.6, T, 31.2, 0.6, 0.9, 3.4, 'counter', false);
  sol(c, H.wood, -38.4, T, 33, 0.8, 0.5, 0.6, 'fish-crate', false);
  bx(b, H.wood, -38.4, T + 0.5, 33, 0.7, 0.4, 0.55);
  // the sweet shop: a glass case at the front, jars
  sol(c, H.wood, -30.6, T, 32.2, 2.2, 0.8, 0.6, 'sweet-case', false);
  bx(b, K.mirror, -30.6, T + 0.8, 32.2, 2.1, 0.4, 0.5);
  for (let k = 0; k < 8; k++) cy(b, [K.awnRed, K.yellow, K.pink, K.green][k % 4]!, -31.5 + k * 0.26, T + 0.82, 32.2, 0.08, 0.08, 0.22, 8);
  sol(c, H.wood, -27.6, T, 31.2, 0.6, 0.9, 3.4, 'counter', false);
  // the diner: a counter with stools, two little tables, a navy noren over the door, bowls stacked
  sol(c, H.wood, -24, T, 29.2, 5.6, 0.95, 0.6, 'diner-counter', false);
  for (let k = 0; k < 5; k++) cy(b, H.woodDark, -26.2 + k * 1.1, T, 30.2, 0.17, 0.17, 0.45, 8);
  for (let k = 0; k < 6; k++) cy(b, K.paper, -26 + k * 0.3, T + 0.95, 29.2, 0.08, 0.06, 0.06 + (k % 3) * 0.04, 8);
  for (const x of [-25.4, -22.6]) {
    sol(c, H.wood, x, T, 33.2, 0.9, 0.72, 0.7, 'diner-table', false);
    for (const dz of [-0.6, 0.6]) cy(b, H.woodDark, x, T, 33.2 + dz, 0.16, 0.16, 0.42, 8);
  }
  for (let k = 0; k < 4; k++) box(b, K.navy, -25.35 + k * 0.9, T + 2.15, 35.32, 0.85, 0.65, 0.02, 0, false);

  // the back yard (z 15..28.5): the tenement house, the water tank, washing on a pole, a pump, a bicycle
  const RH = { x0: -38.5, z0: 15.6, x1: -30, z1: 22.4 };
  room(c, RH, T, 3, { doors: [{ side: 'E', at: 3.4, w: 1.8 }], wall: H.plaster, roof: H.rust, tag: 'tenement' });
  room1974(c, { x0: RH.x0 + 0.15, z0: RH.z0 + 0.15, x1: RH.x1 - 0.15, z1: RH.z1 - 0.15 }, T, 'N', { light: true, seed: 2 });
  pane(b, -34.2, T + 1.0, RH.z1, 1.6, 1.0, true);
  pane(b, RH.x0, T + 1.0, 17.2, 1.4, 1.0, false);
  upperStoreys(c, RH, T + 3.2, 1, ['S', 'E'], { wall: H.plaster });
  for (const [x, z] of [[-24.6, 16.4], [-22.8, 16.4], [-24.6, 18.2], [-22.8, 18.2]] as const) sol(c, H.iron, x, T, z, 0.14, 2.2, 0.14, 'tank-leg');
  cy(b, H.rust, -23.7, T + 2.2, 17.3, 1.1, 1.1, 1.6, 14);
  cy(b, K.rustDark, -23.7, T + 3.8, 17.3, 1.15, 0.2, 0.4, 14);
  for (const x of [-38.6, -33.6]) sol(c, H.woodPale, x, T, 24.6, 0.1, 2.2, 0.1, 'pole');
  bar(b, K.straw, [-38.6, T + 2.1, 24.6], [-33.6, T + 2.1, 24.6], 0.06);
  const cloth = [K.paper, K.awnBlue, K.pink, K.cream, K.awnRed];
  for (let k = 0; k < 5; k++) box(b, cloth[k]!, -38 + k * 0.95, T + 1.6, 24.6, 0.7, 0.9 - (k % 2) * 0.3, 0.02, 0, false);
  sol(c, H.iron, -27, T, 16, 0.3, 1.0, 0.3, 'pump', false);
  bar(b, H.iron, [-27, T + 1.0, 16], [-26.4, T + 1.1, 16.4], 0.05);
  cy(b, H.rust, -26.4, T, 16.6, 0.4, 0.45, 0.35, 12);
  bicycle(b, -22.2, T, 27.2, 0.1);
  sol(c, H.wood, -21.8, T, 21, 1, 1, 1, 'crate', false);
  sol(c, H.wood, -21.8, T, 22.1, 0.9, 0.8, 0.9, 'crate', false);
  for (let k = 0; k < 3; k++) box(b, H.iron, -38.9 + k * 6, T + 1.6, 28.35, 0.1, 3.2, 0.1, 0, false);

  // the corner shop by the flight down to Block 31: tobacco and rice, the red telephone on its counter
  const RC = { x0: 12.4, z0: 15.5, x1: 19.4, z1: 27 };
  room(c, RC, T, 3.4, { doors: [{ side: 'S', at: 3.4, w: 2.6 }], wall: H.concrete, tag: 'corner-shop' });
  floor(b, K.boards, RC, T);
  upperStoreys(c, RC, T + 3.6, 1, ['S', 'W', 'E'], { lit: 3 });
  awning(b, K.awnGreen, 15.8, 27.15, 4, 1.4);
  shutterBox(b, 15.8, 27.15, 2.6, 1);
  goodsShelf(b, 12.8, 18.8, 15.65, 1, 9, 3);
  sol(c, H.wood, 18.6, T, 22.6, 0.6, 0.95, 4, 'counter', false);
  bx(b, K.post, 18.6, T + 0.95, 21.6, 0.3, 0.16, 0.24);
  for (let k = 0; k < 6; k++) {
    const x = 13.2 + (k % 3) * 0.8;
    const yy = T + Math.floor(k / 3) * 0.42;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), K.straw);
    m.position.set(x, yy + 0.25, 24.6);
    m.scale.set(1, 0.62, 0.75);
    b.add(m, { cast: false });
  }
  solid(c, 14, 24.6, 2.6, 0.7, T + 0.8, 'rice-sacks', { shots: false });
  calendar(b, 12.57, T + 1.7, 20, 'E');
}

// ---- the Shōwa-kan ---------------------------------------------------------------------------------------------------

function cinema(c: Ctx): void {
  const { b } = c;
  const R = { x0: -6.5, z0: 15.5, x1: 12, z1: 35 };
  const HT = 6.5;
  room(c, R, T, HT, { doors: [{ side: 'S', at: 10.5, w: 3.2 }], wall: H.brick, roof: null, tag: 'cinema' });
  floor(b, K.carpet, { x0: R.x0, z0: R.z0, x1: R.x1, z1: 27 }, T);
  floor(b, K.terrazzo, { x0: R.x0, z0: 27, x1: R.x1, z1: R.z1 }, T);
  floor(b, K.boards, { x0: R.x0, z0: 27, x1: -0.5, z1: 32.5 }, T, 0.05);
  // the roof, with a hole over the stalls where the typhoon tore it (the rain comes in)
  const ry = T + HT;
  bx(b, H.concreteDark, -0.5, ry, 25.25, 12.3, 0.25, 19.8);
  bx(b, H.concreteDark, 9.15, ry, 18.3, 6, 0.25, 5.9);
  bx(b, H.concreteDark, 9.15, ry, 30.25, 6, 0.25, 9.8);
  bx(b, H.concreteDark, 7.6, ry, 23.0, 2.9, 0.25, 3.5);
  for (const k of [0, 1]) slab(b, H.concreteDark, 6.5 + k * 2.5, ry - 0.5, 23.6 - k * 1.6, 1.4, 0.18, 1.0, 0.6 - k * 1.1, 0.4, 0.3, false);
  c.b.collide({ x: 2.75, z: 25.25, hx: 9.25, hz: 9.75, y0: ry, y1: ry + 0.25, blocksMove: false, blocksShots: true, mapKind: 'none', tag: 'roof' });
  // the brick front: stepped parapet, a canopy over the doors, poster cases, a blank marquee, arched windows
  bx(b, H.brick, 3.5, ry, 35, 7, 1.4, 0.3);
  bx(b, H.brick, 3.5, ry + 1.4, 35, 3, 0.6, 0.3);
  bx(b, H.concrete, 2.75, ry, 35.05, 18.8, 0.2, 0.4);
  bx(b, H.concrete, 3.5, ry + 1.4, 35.05, 7.2, 0.15, 0.4);
  bx(b, K.cream, 4, T + 3.5, 35.2, 6.4, 1.0, 0.12);
  box(b, H.woodDark, 4, T + 4.0, 35.27, 6.6, 1.15, 0.04, 0, false);
  bx(b, H.concreteDark, 4, T + 2.9, 35.95, 5.6, 0.18, 1.6);
  for (const k of [-1, 1]) bar(b, H.iron, [4 + k * 2.4, T + 2.95, 36.7], [4 + k * 2.4, T + 3.9, 35.2], 0.06);
  for (const x of [-2.6, 9.6]) {
    box(b, H.woodDark, x, T + 1.6, 35.2, 1.5, 2.0, 0.1, 0, false);
    box(b, [K.awnRed, K.deepBlue][x < 0 ? 0 : 1]!, x, T + 1.6, 35.26, 1.2, 1.6, 0.03, 0, false);
    box(b, K.yellow, x, T + 2.1, 35.29, 0.8, 0.3, 0.02, 0, false);
    box(b, H.lamp, x, T + 2.66, 35.3, 1.3, 0.06, 0.08, 0, false);
  }
  for (const x of [-4.4, -1.2, 8.2, 10.8]) win(b, x, T + 4.6, 35.15, 1.0, 1.3, 'S', { frame: H.concrete });
  for (const z of [19, 23, 27, 31]) {
    win(b, R.x0 - 0.15, T + 4.4, z, 1.2, 1.4, 'W', { frame: H.concrete });
    win(b, R.x1 + 0.15, T + 4.4, z, 1.2, 1.4, 'E', { frame: H.concrete });
  }
  bx(b, H.concrete, 4, T, 35.5, 3.6, 0.1, 0.9);
  // the cupola on the roof, its little window lit by nothing anyone remembers switching on
  bx(b, H.brick, 3, ry + 0.25, 26, 2.4, 1.6, 2.4);
  slab(b, H.concreteDark, 3, ry + 2.0, 26, 2.9, 0.15, 2.9, 0, Math.PI / 4, 0, false);
  win(b, 3, ry + 0.75, 27.2, 0.8, 0.7, 'S', { lit: true, frame: H.concrete });

  // the wall between the stalls and the foyer (a doorway at x 7.5), the projection room's window in it at x -4
  const zp = 27;
  sol(c, H.brick, -5.68, T, zp, 1.35, HT, 0.25, 'cinema');
  bx(b, H.brick, -4, T, zp, 2, 1.3, 0.25);
  bx(b, H.brick, -4, T + 2.1, zp, 2, HT - 2.1, 0.25);
  solid(c, -4, zp, 2, 0.25, T + HT, 'cinema');
  sol(c, H.brick, 1.75, T, zp, 9.5, HT, 0.25, 'cinema');
  sol(c, H.brick, 10.18, T, zp, 3.35, HT, 0.25, 'cinema');
  bx(b, H.brick, 7.5, T + 2.5, zp, 2, HT - 2.5, 0.25);
  // the projection room: x -6.35..-0.5, z 27..32.5, its door off the foyer
  sol(c, H.brick, -0.5, T, 28.2, 0.25, 3.4, 2.3, 'booth');
  sol(c, H.brick, -0.5, T, 31.85, 0.25, 3.4, 1.3, 'booth');
  bx(b, H.brick, -0.5, T + 2.5, 30.2, 0.25, 0.9, 1.9);
  sol(c, H.brick, -3.42, T, 32.5, 5.85, 3.4, 0.25, 'booth');
  bx(b, H.concreteDark, -3.42, T + 3.4, 29.75, 5.85, 0.15, 5.5);
  // the projector on its stand, its lens through the window; reels; film cans on the shelf; the rewind bench
  const re = SIDES.find((s) => s.id === 'reel')!;
  sol(c, H.iron, re.x, T, 27.75, 0.8, 1.0, 0.6, 'projector', false);
  bx(b, H.iron, re.x, T + 1.0, 27.75, 0.45, 0.45, 0.9);
  bx(b, K.shutter, re.x + 0.24, T + 1.1, 27.9, 0.03, 0.25, 0.4);
  // the booth's own plaster lining (inside the brick), a bare bulb over the bench
  for (const [x, z, w, d] of [[-6.33, 29.75, 0.03, 5.2], [-3.42, 32.36, 5.8, 0.03], [-6.0, 27.14, 0.7, 0.03], [-1.75, 27.14, 2.5, 0.03]] as const) bx(b, H.plaster, x, T, z, w, 3.4, d);
  ball(b, H.lamp, -3.4, T + 2.9, 31.6, 0.07, 1, 6);
  for (const dz of [-0.35, 0.3]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16), H.iron);
    m.rotation.z = Math.PI / 2;
    m.position.set(re.x, T + 1.85, 27.75 + dz);
    b.add(m, { cast: false });
  }
  cy(b, K.steel, re.x, T + 1.15, 27.25, 0.07, 0.07, 0.25, 8);
  box(b, K.black, re.x, T + 1.66, 27.6, 0.3, 0.15, 0.6, 0, false);
  sol(c, H.wood, -6.0, T, 29.8, 0.6, 1.9, 2.6, 'reel-shelf', false);
  for (let k = 0; k < 9; k++) cy(b, K.chrome, -6.0, T + 0.5 + Math.floor(k / 3) * 0.55, 28.9 + (k % 3) * 0.85, 0.3, 0.3, 0.08, 14);
  sol(c, H.woodDark, -3.4, T, 32.05, 2.6, 0.85, 0.6, 'rewind-bench', false);
  for (const dx of [-0.8, 0.6]) cy(b, H.iron, -3.4 + dx, T + 0.85, 32.05, 0.26, 0.26, 0.04, 14);
  bx(b, H.woodDark, -1.6, T, 31.6, 0.45, 0.45, 0.45);
  calendar(b, -0.65, T + 1.7, 31.4, 'W');
  c.b.light({ x: -3.4, y: T + 3.0, z: 30.2, color: 0xffc070, intensity: 11, distance: 8, mode: 'flicker', pool: 0, glow: 0, tag: 'cinema-booth' });

  // the stalls: the torn screen behind its curtains, the stage, six rows of red seats with a gap where some have gone
  bx(b, H.woodDark, 2.75, T, 16.4, 16, 0.6, 1.6);
  solid(c, 2.75, 16.4, 16, 1.6, T + 0.6, 'stage', { shots: false });
  box(b, K.paper, 2.75, T + 3.4, 15.72, 12, 4.4, 0.05, 0, false);
  box(b, K.black, 6.2, T + 4.1, 15.75, 2.1, 1.5, 0.04, 0.0, false);
  slab(b, K.paper, 6.6, T + 3.15, 15.95, 0.8, 1.0, 0.03, 0.5, 0, 0.25, false);
  slab(b, K.paper, 5.6, T + 3.3, 15.9, 0.6, 0.8, 0.03, 0.35, 0, -0.3, false);
  for (const x of [-4.4, 9.9]) bx(b, K.seat, x, T + 0.6, 16.0, 1.8, HT - 0.9, 0.3);
  bx(b, K.seat, 2.75, T + HT - 0.8, 16.0, 16.4, 0.6, 0.32);
  const rows = [19, 20.2, 21.4, 22.6, 23.8, 25];
  rows.forEach((z, ri) => {
    for (const [x0, x1] of [[-4.6, 1.4], [3.6, 10.0]] as const) {
      const n = Math.round((x1 - x0) / 0.55);
      for (let k = 0; k < n; k++) {
        if ((ri === 3 && x0 > 0 && k > 3 && k < 7) || (ri === 1 && x0 < 0 && k < 2)) continue; // torn out
        const x = x0 + (k + 0.5) * ((x1 - x0) / n);
        bx(b, K.seat, x, T + 0.42, z, 0.48, 0.1, 0.48);
        slab(b, K.seat, x, T + 0.78, z + 0.3, 0.48, 0.65, 0.08, ri === 4 && k === 2 ? -0.5 : -0.12, 0, 0, false);
        bx(b, H.iron, x - 0.27, T, z, 0.04, 0.62, 0.5);
      }
      bx(b, H.iron, (x0 + x1) / 2, T, z - 0.1, x1 - x0, 0.05, 0.08);
      solid(c, (x0 + x1) / 2, z + 0.05, x1 - x0, 0.75, T + 0.95, 'seats', { shots: false });
    }
  });
  for (const [x, z] of [[2.4, 21.2], [8.6, 22.6]] as const) bx(b, K.seat, x, T, z, 0.5, 0.12, 0.6, 0.8);
  for (const z of [19, 24]) for (const x of [R.x0 + 0.2, R.x1 - 0.2]) box(b, H.lamp, x, T + 3.2, z, 0.12, 0.3, 0.2, 0, false);
  for (let k = 0; k < 4; k++) box(b, K.puddle, 10.4 + (k % 2) * 0.5, T + 0.012, 22 + k * 0.6, 1.0, 0.02, 0.5, 0, false);

  // the foyer: the ticket window, the sweets case, posters, a bench, an ashtray stand
  sol(c, H.wood, 11.3, T, 31, 1.0, 1.05, 4.4, 'ticket-counter', false);
  bx(b, H.woodDark, 11.6, T + 1.05, 31, 0.4, 1.2, 4.4);
  bx(b, K.mirror, 11.12, T + 1.25, 31, 0.03, 0.8, 1.2);
  sol(c, H.wood, 1.6, T, 27.55, 2.8, 0.85, 0.6, 'sweets-case', false);
  bx(b, K.mirror, 1.6, T + 0.85, 27.55, 2.7, 0.35, 0.5);
  for (const [x, m] of [[4.6, K.awnRed], [10.2, K.deepBlue]] as const) {
    box(b, H.woodDark, x, T + 1.7, zp + 0.15, 1.3, 1.8, 0.04, 0, false);
    box(b, m, x, T + 1.7, zp + 0.18, 1.1, 1.6, 0.02, 0, false);
    box(b, K.cream, x, T + 1.3, zp + 0.2, 0.7, 0.5, 0.02, 0, false);
  }
  sol(c, H.wood, 7.4, T, 34.5, 2.4, 0.45, 0.45, 'bench', false);
  cy(b, H.iron, 0.6, T, 33.6, 0.18, 0.12, 0.9, 8);
  cy(b, H.iron, 0.6, T + 0.9, 33.6, 0.22, 0.22, 0.06, 10);
  calendar(b, 11.85, T + 1.9, 28.4, 'W');
  c.b.light({ x: 5, y: T + 3.2, z: 31, color: 0xffb070, intensity: 7, distance: 9, mode: 'fail', pool: 0, glow: 0, tag: 'cinema-foyer' });
}

// ---- the south side of the lane ----------------------------------------------------------------------------------

function marketSouth(c: Ctx): void {
  const { b } = c;
  const R = { x0: -9, z0: 43.5, x1: 17, z1: 53.4 };
  room(c, R, T, 3.4, { doors: [{ side: 'N', at: 4.3, w: 3.4 }, { side: 'N', at: 12.9, w: 3.4 }, { side: 'N', at: 21.6, w: 3.4 }], wall: H.concrete, tag: 'shop' });
  floor(b, K.boards, R, T);
  for (const x of [-0.4, 8.2]) sol(c, H.plaster, x, T, 48.45, 0.2, 3.4, 9.6, 'shop');
  upperStoreys(c, R, T + 3.6, 1, ['N', 'S'], { lit: 4, rail: true });
  const awns = [K.awnGreen, K.awnBlue, K.awnRed];
  [-4.7, 3.9, 12.6].forEach((x, i) => {
    awning(b, awns[i]!, x, 43.35, 6, -1.5);
    shutterBox(b, x, 43.35, 3.4, -1);
    goodsShelf(b, x - 3.6, x + 1.4, 53.25, -1, 20 + i, 4);
    calendar(b, i < 2 ? x + 4.2 : 16.85, T + 1.7, 46, 'W');
  });
  // the hardware shop: pails and pots, brooms, rope, a ladder on the wall
  for (let k = 0; k < 5; k++) cy(b, [K.steel, H.rust, K.chrome][k % 3]!, -8.2 + k * 0.5, T, 44.4, 0.2, 0.24, 0.32, 10);
  solid(c, -7.2, 44.4, 2.6, 0.6, T + 0.35, 'pails', { shots: false });
  for (let k = 0; k < 4; k++) slab(b, K.straw, -1.4, T + 0.8, 46 + k * 0.25, 0.05, 1.6, 0.05, 0, 0, 0.12, false);
  for (let k = 0; k < 3; k++) cy(b, K.straw, -6.5 + k * 0.7, T, 49.5, 0.28, 0.28, 0.25, 12);
  for (const z of [47.5, 48.4]) box(b, H.woodPale, -8.75, T + 1.6, z, 0.05, 3.0, 0.06, 0, false);
  for (let k = 0; k < 6; k++) box(b, H.woodPale, -8.75, T + 0.4 + k * 0.45, 47.95, 0.05, 0.05, 0.9, 0, false);
  sol(c, H.wood, -1.4, T, 50.2, 0.6, 0.95, 3, 'counter', false);
  // the sake shop: casks, bottles, the counter
  for (let k = 0; k < 3; k++) {
    cy(b, K.cream, 1.2 + k * 1.0, T, 44.5, 0.42, 0.42, 0.9, 14);
    cy(b, K.navy, 1.2 + k * 1.0, T + 0.62, 44.5, 0.43, 0.43, 0.08, 14);
  }
  solid(c, 2.2, 44.5, 3, 0.9, T + 0.9, 'casks', { shots: false });
  for (let k = 0; k < 10; k++) cy(b, P(0x24402a, 0.15, 0.3), 3 + k * 0.32, T + 0.95, 52.6, 0.06, 0.05, 0.32, 8);
  sol(c, H.wood, 7.2, T, 49.8, 0.6, 0.95, 3.4, 'counter', false);
  // the rice shop: sacks, the scale, wooden bins
  for (let k = 0; k < 7; k++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), K.straw);
    m.position.set(9.4 + (k % 4) * 0.8, T + 0.25 + Math.floor(k / 4) * 0.42, 44.5);
    m.scale.set(1, 0.62, 0.75);
    b.add(m, { cast: false });
  }
  solid(c, 10.6, 44.5, 3.2, 0.7, T + 0.8, 'rice-sacks', { shots: false });
  sol(c, K.steel, 14.6, T, 44.6, 0.6, 0.8, 0.5, 'scale', false);
  for (const z of [47.4, 49.2]) sol(c, H.wood, 16.3, T, z, 0.9, 0.8, 1.6, 'bin', false);
  // the way down to the seawall between the shops and the pachinko parlour: a lamp, the parapet's railing
  c.b.light({ x: -3, y: T + 2.6, z: 48.4, color: 0xffc080, intensity: 5, distance: 7, mode: 'flicker', pool: 0, glow: 0, tag: 'shop' });
}

function pachinko(c: Ctx): void {
  const { b } = c;
  const R = { x0: -39, z0: 44.6, x1: -21, z1: 53.4 };
  room(c, R, T, 3.6, { doors: [{ side: 'N', at: 4, w: 3 }, { side: 'N', at: 14, w: 3 }], wall: H.concrete, tag: 'pachinko' });
  floor(b, K.navy, R, T);
  upperStoreys(c, R, T + 3.8, 1, ['N'], { wall: H.concrete, lit: 1 });
  // the front: a blank sign frame ringed with bulbs, the company price board between the doors
  bx(b, K.yellow, -30, T + 2.65, 44.33, 16, 0.85, 0.16);
  box(b, K.awnRed, -30, T + 3.08, 44.3, 16.4, 0.1, 0.24, 0, false);
  for (let k = 0; k < 22; k++) ball(b, H.lamp, -37.8 + k * (15.6 / 21), T + 3.18, 44.22, 0.06, 1, 6);
  const wb = WALL_BUYS.find((w) => w.id === 'market')!;
  bx(b, H.woodDark, wb.x, T + 0.4, 44.35, 2.6, 2.0, 0.12);
  box(b, K.paper, wb.x, T + 1.4, 44.27, 2.2, 1.6, 0.04, 0, false);
  for (let r = 0; r < 4; r++) box(b, H.woodDark, wb.x - 0.2, T + 1.95 - r * 0.36, 44.24, 1.5, 0.05, 0.02, 0, false);
  // inside: one island of machines back to back, a row along the back wall, the prize counter, stools
  const machine = (x: number, z: number, face: 1 | -1): void => {
    bx(b, H.woodDark, x, T, z, 0.62, 0.42, 0.4);
    bx(b, K.cream, x, T + 0.42, z, 0.62, 1.4, 0.36);
    box(b, K.deepBlue, x, T + 1.3, z + face * 0.185, 0.48, 0.62, 0.02, 0, false);
    box(b, K.yellow, x, T + 1.3, z + face * 0.19, 0.3, 0.3, 0.02, 0.785, false);
    box(b, K.chrome, x, T + 0.78, z + face * 0.24, 0.5, 0.1, 0.16, 0, false);
    cy(b, H.woodDark, x, T, z + face * 0.75, 0.16, 0.16, 0.5, 8);
  };
  for (let k = 0; k < 18; k++) {
    const x = -36 + k * 0.66;
    machine(x, 48.8, -1);
    machine(x, 49.2, 1);
  }
  solid(c, -30.4, 49, 12, 0.8, T + 1.8, 'pachinko-island');
  for (let k = 0; k < 14; k++) machine(-38.2 + k * 0.66, 53.0, -1);
  solid(c, -33.9, 53.0, 9.4, 0.5, T + 1.8, 'pachinko-row');
  sol(c, H.wood, -38.4, T, 46.6, 0.8, 1.0, 2.6, 'prize-counter', false);
  for (let k = 0; k < 6; k++) bx(b, [K.awnRed, K.yellow, K.awnBlue, K.pink][k % 4]!, -38.4, T + 1.0, 45.6 + k * 0.38, 0.4, 0.2 + (k % 3) * 0.08, 0.3);
  calendar(b, -21.17, T + 1.8, 47, 'W');
  // the stair down to the basement (on the seawall) fell in: rubble fills it, a rail round it
  bx(b, K.black, -24, T + 0.01, 51.9, 3.4, 0.02, 2.4);
  for (let k = 0; k < 3; k++) bx(b, H.concreteDark, -24, T + 0.02, 50.9 + k * 0.5, 3.2, 0.03, 0.4);
  for (const [x, z, s, r] of [[-24.6, 52.3, 1.0, 0.4], [-23.4, 51.6, 0.8, 1.1], [-24.1, 52.6, 0.7, 2.2]] as const) bx(b, H.concrete, x, T, z, s, s * 0.6, s * 0.8, r);
  bx(b, H.iron, -25.75, T + 0.95, 50.6, 0.06, 0.06, 0.06);
  bar(b, H.iron, [-25.75, T + 1.0, 50.6], [-22.3, T + 1.0, 50.6], 0.05);
  bar(b, H.iron, [-25.75, T + 1.0, 50.6], [-25.75, T + 1.0, 53.2], 0.05);
  for (const [x, z] of [[-25.75, 50.6], [-22.3, 50.6], [-25.75, 53.2]] as const) bx(b, H.iron, x, T, z, 0.06, 1.0, 0.06);
  solid(c, -24, 51.9, 3.6, 2.7, T + 1.0, 'stair-down');
  c.b.light({ x: -30, y: T + 3.0, z: 47, color: 0xffd0a0, intensity: 6, distance: 9, mode: 'fail', pool: 0, glow: 0, tag: 'pachinko' });
}

/** The lane itself: lanterns on wires, poles, lamps, puddles and a gutter, a handcart, bicycles, crates. */
function laneDressing(c: Ctx): void {
  const { b } = c;
  // utility poles with cross-arms, wires along the lane, lanterns strung across it
  for (const x of [-20.5, 12.2]) {
    sol(c, H.woodDark, x, T, 42.8, 0.26, 7.6, 0.26, 'pole');
    bx(b, H.woodDark, x, T + 6.8, 42.8, 0.14, 0.14, 1.6);
    bar(b, H.iron, [x, T + 6.9, 42.1], [x + (x < 0 ? -19 : 7.6), T + 6.2, 42.1], 0.03);
  }
  bar(b, H.iron, [-20.5, T + 6.9, 43.5], [12.2, T + 6.9, 43.5], 0.03);
  for (const x of [-36, -27.5, -1.5, 6.5, 14.5]) {
    bar(b, H.iron, [x, T + 4.5, 35.2], [x + 0.5, T + 4.3, 43.4], 0.025);
    for (const t of [0.3, 0.68]) lantern(b, x + 0.5 * t, T + 4.05 - Math.sin(t * Math.PI) * 0.25, 35.2 + 8.2 * t);
  }
  lamp(c, -24, T, 36.7, { tag: 'market' });
  lamp(c, 10, T, 41.7, { tag: 'market', mode: 'flicker' });
  lamp(c, -11.2, T, 27.6, { tag: 'market' });
  // stone lanterns either side of the Hell Stairs' foot; the retaining wall behind the yard: pipes, stains, moss
  for (const x of [-19.8, -12.2]) {
    bx(b, H.concrete, x, T, 25.4, 0.6, 0.25, 0.6);
    bx(b, H.concrete, x, T + 0.25, 25.4, 0.22, 0.9, 0.22);
    bx(b, H.concrete, x, T + 1.15, 25.4, 0.5, 0.08, 0.5);
    box(b, H.lamp, x, T + 1.38, 25.4, 0.3, 0.3, 0.3, 0, false);
    slab(b, H.concrete, x, T + 1.62, 25.4, 0.66, 0.14, 0.66, 0, Math.PI / 4, 0, false);
    solid(c, x, 25.4, 0.6, 0.6, T + 1.7, 'stone-lantern');
  }
  for (const x of [-37.5, -31, -24.5]) {
    box(b, H.iron, x, T + 3.6, 14.12, 0.12, 7.2, 0.12, 0, false);
    box(b, K.stain, x + 0.4, T + 2.8, 14.04, 0.7, 5.4, 0.02, 0, false);
  }
  box(b, K.moss, -30, T + 6.7, 14.04, 18, 0.7, 0.02, 0, false);
  box(b, K.moss, -9, T + 6.6, 14.04, 6, 0.9, 0.02, 0, false);
  // the gutter down the lane, puddles, a manhole
  box(b, K.black, -10, T + 0.014, 39.2, 56, 0.02, 0.32, 0, false);
  for (let x = -37.5; x < 18; x += 1.5) box(b, H.iron, x, T + 0.02, 39.2, 0.05, 0.02, 0.32, 0, false);
  for (const [x0, z0, x1, z1] of [[-37, 36.4, -33, 38], [-15, 37, -10.5, 39], [-5, 40.2, -1, 41.6], [4, 36.2, 9, 37.6], [-19, 46, -15.6, 48.4], [14, 30.4, 17.2, 32.8], [-30, 41, -27, 42.6]] as const)
    box(b, K.puddle, (x0 + x1) / 2, T + 0.012, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, 0, false);
  cy(b, H.iron, -16, T, 41, 0.45, 0.45, 0.03, 14);
  // a handcart, crates of bottles, a bench under the diner's awning, bicycles, buckets
  const cart = new THREE.Group();
  const add = (m: Mat, w: number, h: number, d: number, x: number, y: number, z: number, rz = 0): void => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.rotation.z = rz;
    cart.add(o);
  };
  add(H.wood, 1.6, 0.08, 0.9, 0, 0.55, 0);
  for (const s of [-1, 1]) add(H.wood, 1.6, 0.25, 0.05, 0, 0.7, s * 0.43);
  add(H.wood, 1.4, 0.06, 0.06, 1.3, 0.35, 0.3, 0.38);
  add(H.wood, 1.4, 0.06, 0.06, 1.3, 0.35, -0.3, 0.38);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 4, 12), H.woodDark);
    w.position.set(-0.2, 0.45, s * 0.5);
    cart.add(w);
  }
  cart.position.set(-12.2, T, 38.4);
  cart.rotation.y = 0.5;
  b.add(cart, { cast: false });
  solid(c, -12.2, 38.4, 2.0, 1.4, T + 1.0, 'cart', { shots: false, rot: 0.5 });
  for (const x of [-38.2, -37.2]) bx(b, K.yellow, x, T, 36.6, 0.8, 0.32, 0.55);
  bx(b, K.yellow, -38.2, T + 0.32, 36.6, 0.8, 0.32, 0.55);
  solid(c, -37.7, 36.6, 1.8, 0.6, T + 0.64, 'crates', { shots: false });
  sol(c, H.wood, -22.5, T, 36.0, 1.8, 0.45, 0.45, 'bench', false);
  bicycle(b, -9.6, T, 42.9, Math.PI, K.awnBlue);
  bicycle(b, 16.4, T, 42.8, 0.05, K.green);
  bicycle(b, -38.4, T, 43.9, Math.PI / 2);
  for (const [x, z] of [[8.6, 36.0], [9.1, 36.2]] as const) cy(b, K.steel, x, T, z, 0.2, 0.24, 0.32, 10);
  // a fallen shop sign (blank) and a bamboo pole across the crossing
  slab(b, K.cream, -19.2, T + 0.12, 40.6, 2.0, 0.08, 0.7, 0, 0.3, 0.06, false);
  bar(b, K.straw, [-20.6, T + 0.05, 33.6], [-17.4, T + 0.05, 36.4], 0.07);
}

// ---- Block 31 ------------------------------------------------------------------------------------------------------

const B31 = { x0: 30, z0: 15, x1: 68, z1: 37 };
const GH = 4.2; // the bath storey's height

/** The block itself: the bath storey (`bath`, `boilerRoom` fill it) and five storeys of flats over it, the east end fallen open. */
function block31Tower(c: Ctx): void {
  const { b } = c;
  const R = B31;
  room(c, R, Y.sea, GH, { doors: [{ side: 'S', at: 10, w: 2.4 }], wall: H.concrete, roof: H.concreteDark, tag: 'block31' });
  // the wall between the bath and the boiler room, its doorway (the boarded door: the frame's collider) at z 26
  const bd = OBSTACLES.find((o) => o.id === 'bathDoor')!.block!;
  sol(c, H.concrete, 50, Y.sea, (R.z0 + 0.15 + bd.z0) / 2, 0.3, GH, bd.z0 - R.z0 - 0.15, 'block31');
  sol(c, H.concrete, 50, Y.sea, (bd.z1 + R.z1 - 0.15) / 2, 0.3, GH, R.z1 - 0.15 - bd.z1, 'block31');
  bx(b, H.concrete, 50, 2.5, 26, 0.3, GH - 2.5, bd.z1 - bd.z0);
  for (const z of [bd.z0 - 0.06, bd.z1 + 0.06]) bx(b, H.woodDark, 49.8, 0, z, 0.14, 2.5, 0.12);
  bx(b, H.woodDark, 49.8, 2.44, 26, 0.14, 0.12, bd.z1 - bd.z0 + 0.24);
  for (const [z, y, r] of [[23.95, 0.6, 0.3], [28.05, 1.5, -0.4], [23.95, 1.9, 0.5]] as const) slab(b, H.woodPale, 49.7, y, z, 0.05, 0.22, 0.7, r, 0, 0, false);
  for (let k = 0; k < 3; k++) slab(b, H.woodPale, 48.9, 0.9 + k * 0.08, 29.2, 0.05, 2.4, 0.24, 0, 0, 0.22 - k * 0.04, false);

  // the flats over it: five storeys, the east end (x 61..68) a fallen-open ruin above the second
  const y0 = GH + 0.2;
  const top = y0 + 15;
  bx(b, H.concrete, 45.5, y0, 26, 31, 15, 21.6);
  bx(b, H.concrete, 64.5, y0, 26, 7, 6, 21.6);
  c.b.collide({ x: 49, z: 26, hx: 19, hz: 11, y0, y1: top, blocksShots: true, mapKind: 'building', tag: 'block31-flats' });
  // the ruin: slabs, a back wall, partitions, what was left in the rooms, one slab hanging
  for (const yy of [y0 + 6, y0 + 9, y0 + 12]) bx(b, H.concreteDark, 64.8, yy - 0.25, 26, 6.4, 0.25, 21.6);
  bx(b, H.concrete, 64.5, y0 + 6, 15.35, 7, 9, 0.3);
  bx(b, H.concrete, 67.85, y0 + 6, 26, 0.3, 9, 21.6);
  for (const z of [20.5, 27, 32.5]) bx(b, H.plaster, 64.8, y0 + 6, z, 6.2, 3, 0.15);
  for (const z of [22, 29]) bx(b, H.plaster, 64.8, y0 + 9, z, 6.2, 3, 0.15);
  bx(b, H.woodDark, 66.9, y0 + 6, 18, 1.0, 1.6, 0.5);
  bx(b, K.tatami, 64.5, y0 + 6.01, 24, 3.6, 0.03, 1.8);
  bx(b, K.cream, 66.9, y0 + 9, 31, 0.8, 0.9, 0.5);
  slab(b, K.awnBlue, 61.6, y0 + 10.2, 24.5, 1.6, 2.2, 0.06, 0, 0, 0.15, false);
  slab(b, H.concreteDark, 62.0, y0 + 13.4, 33.5, 4.2, 0.25, 3.0, 0.2, 0, -0.55, false);
  bx(b, H.concrete, 64.5, top - 0.6, 15.35, 7, 0.6, 0.3);
  for (const z of [15.6, 36.4]) bx(b, H.concrete, 61.15, y0 + 6, z, 0.3, 9, 0.5);
  // the south face: storeys of wooden balconies and windows, rust streaks, washing; the other faces' windows
  for (let s = 0; s < 5; s++) {
    const yy = y0 + s * 3;
    bx(b, H.concreteDark, 45.5, yy - 0.1, 36.85, 31, 0.2, 0.2);
    for (let i = 0; i < 10; i++) {
      const x = 31.6 + i * 3.05;
      if (s >= 2 && x > 60.5) continue;
      win(b, x, yy + 0.8, 36.8, 1.6, 1.3, 'S', { lit: (s === 1 && i === 3) || (s === 3 && i === 7) });
      bx(b, K.stain, x + 0.5, yy - 0.6, 36.83, 0.12, 1.3, 0.04);
      if ((i + s) % 2 === 0) {
        bx(b, H.concreteDark, x, yy - 0.05, 37.35, 2.7, 0.12, 1.0);
        box(b, H.wood, x, yy + 0.95, 37.82, 2.7, 0.07, 0.06, 0, false);
        for (let q = 0; q < 6; q++) box(b, H.wood, x - 1.3 + q * 0.52, yy + 0.47, 37.82, 0.05, 0.9, 0.05, 0, false);
        if ((i * 3 + s) % 5 === 0) for (let q = 0; q < 3; q++) box(b, [K.paper, K.awnBlue, K.pink][q]!, x - 0.8 + q * 0.7, yy + 1.5, 37.6, 0.55, 0.7, 0.02, 0, false);
        if ((i * 3 + s) % 5 === 0) bar(b, K.straw, [x - 1.3, yy + 1.9, 37.6], [x + 1.3, yy + 1.9, 37.6], 0.04);
      }
    }
    for (let i = 0; i < 7; i++) {
      win(b, 32 + i * 4.2, yy + 0.8, 15.2, 1.4, 1.2, 'N');
      if (i < 5) win(b, 30 - 0.0, yy + 0.8, 17.5 + i * 4.2, 1.4, 1.2, 'W');
    }
    if (s < 2) for (let i = 0; i < 5; i++) win(b, 68, yy + 0.8, 17.5 + i * 4.2, 1.4, 1.2, 'E');
  }
  // the roof: a rim, the water tank, the stair house, the boiler's chimney
  bx(b, H.concreteDark, 45.5, top, 26, 31.3, 0.3, 21.9);
  for (const [x, z, w, d] of [[45.5, 15.25, 31, 0.25], [45.5, 36.75, 31, 0.25], [30.12, 26, 0.25, 21.5]] as const) bx(b, H.concrete, x, top + 0.3, z, w, 0.9, d);
  bx(b, H.concrete, 36, top + 0.3, 20, 3.4, 2.6, 3.0);
  for (const [x, z] of [[41, 19], [43, 19], [41, 21], [43, 21]] as const) bx(b, H.iron, x, top + 0.3, z, 0.15, 1.6, 0.15);
  cy(b, H.rust, 42, top + 1.9, 20, 1.3, 1.3, 1.8, 14);
  cy(b, H.iron, 57, top + 0.3, 19, 0.55, 0.5, 8, 12);
  for (const yy of [top + 3, top + 6]) cy(b, H.rust, 57, yy, 19, 0.6, 0.6, 0.2, 12);
  cy(b, K.rustDark, 57, top + 8.3, 19, 0.7, 0.5, 0.3, 12);
  bar(b, H.iron, [57, top + 6.5, 19], [53, top + 0.3, 16], 0.03);
  bar(b, H.iron, [57, top + 6.5, 19], [60.5, top + 0.3, 22], 0.03);
  // the bath's entrance: a navy noren over the door, a step, the lamp; the yard west of the block
  for (let k = 0; k < 3; k++) box(b, K.navy, 39.2 + k * 0.8, 2.15, 37.2, 0.75, 0.7, 0.02, 0, false);
  bx(b, H.concreteDark, 40, 2.6, 37.6, 3.2, 0.12, 1.2);
  bx(b, H.concrete, 40, 0, 37.5, 3.2, 0.1, 0.8);
  lamp(c, 27, Y.sea, 26, { tag: 'block31' });
  for (const [x, z] of [[21.2, 22], [21.2, 23.2]] as const) cy(b, K.steel, x, 0, z, 0.32, 0.34, 0.9, 10);
  solid(c, 21.2, 22.6, 0.7, 1.9, 0.9, 'bins', { shots: false });
  bicycle(b, 29.4, 0, 20, Math.PI / 2, K.awnBlue);
  for (const [x0, z0, x1, z1] of [[24, 25, 28, 27.2], [33, 39, 38, 40.2]] as const) box(b, K.puddle, (x0 + x1) / 2, 0.012, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, 0, false);
}

/** The bath: the changing alcove, two tiled tubs, the taps under the mural, the ladle shelf by the door. */
function bath(c: Ctx): void {
  const { b } = c;
  const y = Y.sea;
  // tiles: the floor and a wainscot round the walls; the mural over the taps (a white peak over a blue sea)
  bx(b, K.tile, 42.7, y + 0.01, 26, 14.1, 0.025, 21.4);
  for (const [x, z, w, d] of [[42.7, 15.18, 14.1, 0.04], [42.7, 36.82, 14.1, 0.04], [49.82, 19.45, 0.04, 8.5], [49.82, 32.55, 0.04, 8.5]] as const) bx(b, K.tile, x, y, z, w, 1.5, d);
  bx(b, K.sky, 42.7, 1.9, 15.19, 12, 2.1, 0.03);
  bx(b, K.deepBlue, 42.7, 1.6, 15.2, 12, 0.5, 0.03);
  tri(b, K.slate, 41.6, 2.1, 15.22, 7, 1.6);
  tri(b, K.paper, 41.6, 3.2, 15.23, 2.19, 0.5);
  slab(b, K.deepBlue, 46.4, 2.5, 15.21, 4.6, 0.45, 0.02, 0, 0, 0.3, false);
  // the taps: a ledge, a pipe, a tap and a little mirror each, stools and pails
  sol(c, K.tile, 42.7, y, 15.55, 12.4, 0.3, 0.45, 'tap-ledge', false);
  bx(b, H.iron, 42.7, 0.85, 15.25, 12.4, 0.06, 0.06);
  for (let k = 0; k < 8; k++) {
    const x = 37.4 + k * 1.5;
    bx(b, K.steel, x, 0.65, 15.4, 0.08, 0.22, 0.18);
    box(b, K.mirror, x, 1.25, 15.22, 0.4, 0.5, 0.02, 0, false);
    bx(b, H.wood, x, y, 16.35, 0.32, 0.24, 0.26);
    if (k % 2 === 0) cy(b, H.wood, x + 0.3, 0.3, 15.55, 0.15, 0.13, 0.18, 10);
  }
  // two tubs: tiled rims round green water, a step on the near side of each
  for (const [x0, x1] of [[37, 42.5], [43.5, 48.5]] as const) {
    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    for (const [x, z, ww, dd] of [[cx, 19.12, w, 0.25], [cx, 23.38, w, 0.25], [x0 + 0.12, 21.25, 0.25, 4.5], [x1 - 0.12, 21.25, 0.25, 4.5]] as const) bx(b, K.tile, x, y, z, ww, 0.65, dd);
    bx(b, H.water, cx, 0.48, 21.25, w - 0.5, 0.04, 4.0);
    bx(b, K.tile, cx, y, 23.75, w - 1.2, 0.25, 0.5);
    solid(c, cx, 21.25, w, 4.5, 0.65, 'tub', { shots: false });
  }
  bx(b, H.iron, 39.7, 0.65, 19.0, 0.1, 0.4, 0.1);
  // the steam pipe from the boiler room along the ceiling, down into the first tub
  bx(b, H.iron, 44.5, 3.7, 21.0, 10.8, 0.16, 0.16);
  bx(b, H.iron, 39.15, 0.6, 21.0, 0.16, 3.2, 0.16);
  // the changing alcove: lockers along the west wall, a bench, baskets on the half partition, a scale
  sol(c, H.wood, 30.5, y, 26, 0.6, 2.0, 16, 'lockers');
  for (let k = 0; k < 16; k++) for (const yy of [0.5, 1.4]) box(b, H.woodDark, 30.82, yy, 18.5 + k * 1.0, 0.02, 0.04, 0.6, 0, false);
  sol(c, H.wood, 33, y, 24.5, 0.45, 0.45, 6, 'bench', false);
  sol(c, H.wood, 35.5, y, 21.6, 0.2, 1.8, 12.9, 'partition');
  for (let k = 0; k < 5; k++) cy(b, K.straw, 35.5, 1.8, 16.6 + k * 2.4, 0.28, 0.32, 0.25, 10);
  sol(c, K.chrome, 31.4, y, 35.6, 0.6, 0.12, 0.6, 'scale', false);
  bx(b, K.chrome, 31.4, 0.12, 35.85, 0.08, 1.0, 0.08);
  calendar(b, 30.85, 1.7, 33.5, 'E');
  // the ladle shelf by the door: pails stacked, ladles hanging (the bath's ladles are taken from here)
  floor(b, K.boards, { x0: 30, z0: 15, x1: 35.65, z1: 37 }, y, 0.05);
  for (const x of [38, 42.7, 47.4]) bx(b, H.concreteDark, x, GH - 0.35, 26, 0.4, 0.35, 21.7);
  const L = LADLES;
  sol(c, H.wood, L.x + 3.4, y, 36.45, 4.0, 0.9, 0.5, 'ladle-shelf', false);
  bx(b, H.wood, L.x + 3.4, 1.6, 36.6, 4.0, 0.05, 0.3);
  for (let k = 0; k < 5; k++) {
    cy(b, H.woodPale, L.x + 1.8 + k * 0.8, 0.9, 36.45, 0.2, 0.18, 0.24, 10);
    cy(b, H.woodPale, L.x + 1.8 + k * 0.8, 1.14, 36.45, 0.2, 0.18, 0.24, 10);
    cy(b, H.woodPale, L.x + 1.8 + k * 0.8, 1.65, 36.6, 0.07, 0.07, 0.08, 8);
    bx(b, H.wood, L.x + 1.8 + k * 0.8, 1.73, 36.6, 0.03, 0.4, 0.03);
  }
  // high windows on the yard side, the hanging lamp
  for (const x of [37, 46]) pane(b, x, 2.7, 37, 2.6, 0.9, true);
  cy(b, P(0x2a3a30, 0.6, 0.5), 43, 3.4, 28, 0.4, 0.12, 0.3, 12);
  bx(b, H.iron, 43, 3.7, 28, 0.02, 0.5, 0.02);
  c.b.light({ x: 43, y: 3.3, z: 28, color: 0xffc080, intensity: 9, distance: 10, mode: 'flicker', pool: 0, glow: 0, tag: 'bath' });
}

/** The boiler room: the riveted boiler (the burner is built at its fire door), the coal heap, pipes, the tank, the bench. */
function boilerRoom(c: Ctx): void {
  const { b } = c;
  const y = Y.sea;
  const bo = JOBS.steam.boiler;
  const bxp = bo.x + 3.6;
  const bzp = bo.z - 3;
  floor(b, H.concreteDark, { x0: 50, z0: 15, x1: 68, z1: 37 }, y);
  bx(b, H.brick, bxp, y, bzp, 4.4, 0.45, 4.4);
  for (const x of [54, 58, 62, 66]) bx(b, H.concreteDark, x, GH - 0.35, 26, 0.4, 0.35, 21.7);
  // the feed pump and its flywheel, piped to the boiler
  sol(c, H.iron, 56.2, y, 17.6, 1.4, 0.8, 0.8, 'feed-pump');
  const fw = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 5, 16), K.rustDark);
  fw.position.set(56.2, 1.15, 18.05);
  b.add(fw, { cast: false });
  bx(b, H.iron, 59.4, 0.5, 17.6, 4.6, 0.12, 0.12);
  bx(b, H.iron, 61.7, 0.5, 19.0, 0.12, 0.12, 2.8);
  // pipes along the north wall, the gauge board, drums of oil, the tool board, an ash bin
  for (const yy of [2.5, 2.95]) bx(b, H.iron, 59, yy, 15.42, 17, 0.14, 0.14);
  box(b, H.woodDark, 60, 1.7, 15.18, 1.6, 0.9, 0.04, 0, false);
  for (let k = 0; k < 3; k++) {
    const g2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 14), K.paper);
    g2.rotation.x = Math.PI / 2;
    g2.position.set(59.5 + k * 0.5, 1.75, 15.22);
    b.add(g2, { cast: false });
  }
  for (const [x, z, m] of [[67.2, 16.0, H.rust], [66.45, 16.0, K.awnBlue], [67.2, 16.75, K.green]] as const) cy(b, m, x, y, z, 0.32, 0.32, 0.9, 10);
  solid(c, 66.9, 16.3, 1.4, 1.4, 0.9, 'drums', { shots: false });
  box(b, H.woodDark, 67.8, 1.6, 25.5, 0.04, 1.4, 2.4, 0, false);
  for (let k = 0; k < 4; k++) bar(b, H.iron, [67.76, 2.2, 24.6 + k * 0.6], [67.76, 0.9, 24.7 + k * 0.6], 0.04);
  sol(c, K.rustDark, 63.2, y, 26.9, 0.9, 0.7, 0.7, 'ash-bin', false);
  // a low wall round the coal heap, a barrow by it
  sol(c, H.concreteDark, 54.75, y, 17.4, 0.25, 0.8, 4.5, 'coal-wall');
  sol(c, H.concreteDark, 52.45, y, 19.75, 4.6, 0.8, 0.25, 'coal-wall');
  slab(b, K.rustDark, 56.4, 0.4, 21.6, 0.7, 0.35, 1.0, 0, 0.4, 0, false);
  bar(b, H.woodDark, [56.0, 0.5, 22.3], [56.3, 0.6, 23.3], 0.05);
  cy(b, K.rustDark, bxp, 0.45, bzp, 2.0, 2.0, 2.4, 20);
  ball(b, K.rustDark, bxp, 2.85, bzp, 2.0, 0.45, 20);
  for (const yy of [0.9, 1.6, 2.3, 2.8]) cy(b, H.rust, bxp, yy, bzp, 2.04, 2.04, 0.08, 20);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    ball(b, H.rust, bxp + Math.cos(a) * 2.05, 1.25, bzp + Math.sin(a) * 2.05, 0.05, 1, 5);
  }
  solid(c, bxp, bzp, 4.1, 4.1, 3.8, 'boiler');
  // the fire door facing the spot (cold: the story lights it), the gauge, the flue, valves
  bx(b, H.iron, bxp - 1.98, 0.75, bzp + 0.7, 0.12, 0.85, 1.0);
  bx(b, K.black, bxp - 2.05, 0.95, bzp + 0.7, 0.04, 0.35, 0.6);
  bx(b, H.iron, bxp - 2.08, 1.25, bzp + 0.7, 0.06, 0.06, 0.4);
  bx(b, K.black, bxp - 1.5, 0.45, bzp + 1.6, 0.9, 0.3, 0.12);
  cy(b, H.iron, bxp - 1.2, 2.3, bzp - 1.2, 0.06, 0.06, 0.6, 8);
  const g = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16), K.paper);
  g.rotation.z = Math.PI / 2;
  g.position.set(bxp - 1.3, 2.95, bzp - 1.2);
  b.add(g, { cast: false });
  cy(b, H.iron, bxp, 3.6, bzp, 0.3, 0.3, 0.6, 10);
  bx(b, H.iron, (50.2 + bxp) / 2, 3.62, 21.0, bxp - 50.2, 0.16, 0.16);
  for (const x of [54, 58]) {
    const v = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 4, 12), K.post);
    v.position.set(x, 3.4, 21.0);
    b.add(v, { cast: false });
    bx(b, H.iron, x, 3.42, 21.0, 0.04, 0.2, 0.04);
  }
  // the coal heap in the corner, the hatch of the chute it came down
  const heap = (x: number, z: number, r: number, h: number): void => cy(b, K.coal, x, y, z, r, r * 0.25, h, 9);
  heap(52.2, 17.2, 1.8, 1.2);
  heap(53.6, 16.4, 1.2, 0.8);
  heap(51.4, 18.8, 1.0, 0.6);
  solid(c, 52.4, 17.4, 3.6, 3.6, 1.2, 'coal', { shots: false });
  bx(b, H.iron, 60, 0.6, 36.75, 1.4, 0.9, 0.12);
  slab(b, H.iron, 60, 0.7, 35.9, 1.2, 0.06, 1.6, -0.5, 0, 0, false);
  // the water tank on its legs, fire buckets, firewood, the burner's bench
  for (const [x, z] of [[65.6, 30.1], [67.4, 30.1], [65.6, 31.9], [67.4, 31.9]] as const) bx(b, H.iron, x, y, z, 0.12, 1.2, 0.12);
  cy(b, H.rust, 66.5, 1.2, 31, 0.95, 0.95, 1.7, 14);
  solid(c, 66.5, 31, 2.1, 2.1, 2.9, 'tank');
  bx(b, H.wood, 67.6, 1.2, 35.0, 0.12, 0.1, 2.4);
  for (let k = 0; k < 4; k++) cy(b, K.post, 67.5, 0.75, 34.1 + k * 0.6, 0.15, 0.12, 0.3, 10);
  for (let k = 0; k < 9; k++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 6), H.woodPale);
    m.rotation.x = Math.PI / 2;
    m.position.set(52 + (k % 3) * 0.22, 0.12 + Math.floor(k / 3) * 0.2, 35.6);
    b.add(m, { cast: false });
  }
  solid(c, 52.2, 35.6, 0.9, 1.1, 0.65, 'firewood', { shots: false });
  sol(c, H.wood, 57.2, y, 34.6, 2.6, 0.85, 0.9, 'burner-bench', false);
  bx(b, H.iron, 56.3, 0.85, 34.4, 0.3, 0.25, 0.2);
  bx(b, K.steel, 57.8, 0.85, 34.7, 0.6, 0.12, 0.3);
  cy(b, H.rust, 58.4, 0.85, 34.3, 0.12, 0.12, 0.5, 8);
  calendar(b, 50.17, 1.8, 33.5, 'E');
  for (const x of [55, 63]) pane(b, x, 2.8, 37, 2.2, 0.8, true, K.pane);
  cy(b, H.iron, 58, 3.6, 26, 0.12, 0.18, 0.3, 8);
  bx(b, H.iron, 58, 3.9, 26, 0.02, 0.3, 0.02);
  c.b.light({ x: 58, y: 3.4, z: 26, color: 0xffb060, intensity: 7, distance: 10, mode: 'fail', pool: 0, glow: 0, tag: 'boiler' });
}

/** The low wing in front of the block: the barber (two chairs, the scissors hook) and the post office; the square. */
function frontWing(c: Ctx): void {
  const { b } = c;
  const y = Y.sea;
  const R = { x0: 22, z0: 39.5, x1: 50, z1: 49.5 };
  room(c, R, y, 3.4, { doors: [{ side: 'S', at: 9, w: 1.8 }, { side: 'S', at: 20.5, w: 2 }], wall: H.concrete, tag: 'block31-wing' });
  floor(b, K.cream, { x0: R.x0, z0: R.z0, x1: 35, z1: R.z1 }, y);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 12; j++) if ((i + j) % 2 === 0) box(b, K.black, 22.55 + i * 0.8, y + 0.055, 39.95 + j * 0.8, 0.8, 0.01, 0.8, 0, false);
  floor(b, K.boards, { x0: 35, z0: R.z0, x1: R.x1, z1: R.z1 }, y);
  sol(c, H.plaster, 35, y, 44.5, 0.2, 3.4, 9.7, 'block31-wing');
  upperStoreys(c, R, 3.6, 1, ['S', 'W'], { lit: 5 });
  for (const x of [26, 46]) pane(b, x, 0.9, 49.5, 4, 1.5, true);
  pane(b, 39.2, 0.9, 49.5, 2.6, 1.5, true);
  bx(b, H.concreteDark, 36, 3.0, 50.1, 28.4, 0.15, 1.2);
  // the barber: mirrors along the north wall over a counter, two red chairs, the empty scissors hook
  const bs = SIDES.find((s) => s.id === 'barber')!;
  for (const x of [25.2, 31.3]) {
    box(b, H.woodDark, x, 1.6, 39.67, 2.6, 1.3, 0.03, 0, false);
    box(b, K.mirror, x, 1.6, 39.69, 2.4, 1.1, 0.02, 0, false);
  }
  sol(c, H.wood, 28.25, y, 39.95, 11.5, 0.85, 0.5, 'barber-counter', false);
  for (let k = 0; k < 6; k++) cy(b, [K.awnBlue, K.paper, K.awnRed][k % 3]!, 24.6 + k * 1.3, 0.85, 39.9, 0.05, 0.05, 0.18, 8);
  for (const x of [25.2, 31.3]) {
    cy(b, K.chrome, x, y, 41.6, 0.34, 0.34, 0.06, 14);
    cy(b, K.chrome, x, 0.06, 41.6, 0.1, 0.1, 0.42, 10);
    bx(b, K.seat, x, 0.48, 41.6, 0.6, 0.16, 0.58);
    slab(b, K.seat, x, 0.98, 41.97, 0.58, 0.82, 0.14, -0.18, 0, 0, false);
    bx(b, K.seat, x, 1.42, 42.05, 0.3, 0.18, 0.12);
    for (const s of [-1, 1]) {
      bx(b, K.seat, x + s * 0.36, 0.72, 41.55, 0.12, 0.08, 0.55);
      bx(b, K.chrome, x + s * 0.36, 0.5, 41.45, 0.03, 0.22, 0.03);
    }
    slab(b, K.chrome, x, 0.32, 41.08, 0.42, 0.04, 0.3, 0.5, 0, 0, false);
    solid(c, x, 41.6, 0.8, 0.9, 1.3, 'barber-chair', { shots: false });
  }
  // the hook on the pillar between the mirrors (the scissors that hung here are a side story's)
  bx(b, H.woodDark, 28.25, 1.0, 39.72, 0.5, 1.4, 0.06);
  bx(b, K.chrome, 28.25, 1.85, 39.8, 0.03, 0.03, 0.12);
  bx(b, K.chrome, 28.25, 1.81, 39.86, 0.03, 0.08, 0.03);
  box(b, K.stain, 28.25, 1.6, 39.76, 0.12, 0.3, 0.01, 0, false);
  sol(c, H.wood, 22.45, y, 45.5, 0.45, 0.45, 4.4, 'waiting-bench', false);
  sol(c, K.cream, 33.9, y, 46.6, 0.7, 0.9, 0.7, 'basin', false);
  cy(b, K.chrome, 33.9, 0.9, 46.6, 0.22, 0.2, 0.08, 10);
  cy(b, K.chrome, 23.2, y, 41.3, 0.25, 0.15, 1.1, 10);
  ball(b, K.cream, 23.2, 1.35, 41.3, 0.3, 0.8, 10);
  calendar(b, 34.87, 1.8, 42, 'W');
  // the barber's pole by the door
  cy(b, K.paper, 33.3, 1.2, 49.85, 0.12, 0.12, 1.2, 10);
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.07, 10), k % 2 ? K.awnBlue : K.post);
    m.position.set(33.3, 1.3 + k * 0.18, 49.85);
    m.rotation.z = 0.35;
    b.add(m, { cast: false });
  }
  ball(b, H.lamp, 33.3, 2.47, 49.85, 0.12, 1, 8);
  c.b.light({ x: bs.x - 2, y: 3.0, z: 44, color: 0xffd8a8, intensity: 6, distance: 8, mode: 'flicker', pool: 0, glow: 0, tag: 'barber' });
  // the post office: the counter (a way round its east end), pigeonholes, a safe, a desk, scales, the writing table
  sol(c, H.wood, 40.9, y, 44, 11.3, 1.0, 0.8, 'po-counter');
  bx(b, H.woodDark, 40.9, 1.0, 44, 11.5, 0.05, 0.95);
  bx(b, K.chrome, 38.5, 1.05, 44, 0.4, 0.25, 0.3);
  box(b, H.woodDark, 40.5, 1.7, 39.72, 7, 1.8, 0.1, 0, false);
  for (let i = 0; i <= 10; i++) box(b, H.wood, 37.0 + i * 0.7, 1.7, 39.8, 0.03, 1.8, 0.12, 0, false);
  for (let j = 0; j <= 5; j++) box(b, H.wood, 40.5, 0.8 + j * 0.36, 39.8, 7, 0.03, 0.12, 0, false);
  for (let k = 0; k < 18; k++) box(b, K.paper, 37.35 + (k % 10) * 0.7, 0.9 + Math.floor(k / 10) * 0.72 + (k % 3) * 0.36, 39.82, 0.4, 0.16, 0.08, 0, false);
  sol(c, H.iron, 48.9, y, 40.3, 1.0, 1.2, 0.8, 'safe');
  sol(c, H.wood, 44.2, y, 41.2, 1.6, 0.75, 0.8, 'po-desk', false);
  bx(b, K.black, 44.2, 0.75, 41.2, 0.5, 0.2, 0.4);
  sol(c, H.wood, 36.6, y, 48.6, 1.6, 0.9, 0.7, 'writing-table', false);
  for (const [x, m] of [[44, K.awnRed], [47.5, K.awnGreen]] as const) {
    box(b, m, x, 1.8, 49.33, 1.0, 1.3, 0.02, 0, false);
    box(b, K.paper, x, 1.5, 49.31, 0.6, 0.4, 0.02, 0, false);
  }
  calendar(b, 35.13, 1.8, 46, 'E');
  cy(b, K.post, 39.6, y, 50.5, 0.3, 0.3, 1.3, 14);
  ball(b, K.post, 39.6, 1.3, 50.5, 0.31, 0.6, 14);
  box(b, K.black, 39.6, 1.05, 50.82, 0.3, 0.05, 0.02, 0, false);
  solid(c, 39.6, 50.5, 0.65, 0.65, 1.6, 'postbox', { surface: 'metal' });
  c.b.light({ x: 42, y: 3.0, z: 43, color: 0xffe0b0, intensity: 6, distance: 8, mode: 'fail', pool: 0, glow: 0, tag: 'post-office' });
  // the square: planters with dead shrubs, a bench, a lamp
  for (const x of [36, 47]) {
    sol(c, H.concrete, x, y, 52.6, 1.6, 0.7, 1.2, 'planter', false);
    cy(b, K.moss, x, 0.7, 52.6, 0.55, 0.1, 0.7, 7);
  }
  sol(c, H.wood, 42, y, 52.9, 2.0, 0.45, 0.5, 'bench', false);
  lamp(c, 31, Y.sea, 52.6, { tag: 'block31' });
}

/** The coal yard east of the wing: the bunker of three bays open to the west, a lean-to over it, a coal tub on rails. */
function coalYard(c: Ctx): void {
  const { b } = c;
  const y = Y.sea;
  for (const [x, z, w, d] of [[62.75, 42.5, 11.5, 0.3], [62.75, 50, 11.5, 0.3], [68.35, 46.25, 0.3, 7.8], [63.5, 45, 10, 0.25], [63.5, 47.5, 10, 0.25]] as const) sol(c, H.concreteDark, x, y, z, w, 1.6, d, 'bunker');
  for (const z of [43.75, 46.25, 48.75]) {
    cy(b, K.coal, 63, y, z, 2.6, 0.6, 1.3, 8);
    solid(c, 63.6, z, 9, 1.8, 1.3, 'coal', { shots: false });
  }
  for (const [x, z] of [[57.6, 43.3], [57.4, 49.2]] as const) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), H.woodPale);
    m.position.set(x, 0.24, z);
    m.scale.set(1.1, 0.55, 0.7);
    b.add(m, { cast: false });
  }
  for (const [x, z] of [[57.4, 42.6], [57.4, 49.9], [68.2, 42.6], [68.2, 49.9]] as const) sol(c, H.iron, x, y, z, 0.14, 3.0, 0.14, 'post');
  slab(b, H.rust, 62.8, 3.1, 46.25, 11.6, 0.06, 8.4, 0, 0, 0.08, false);
  // the coal tub on a short length of rail
  for (const z of [51.6, 52.4]) bx(b, H.iron, 54, 0.01, z, 4.2, 0.06, 0.08);
  for (let k = 0; k < 6; k++) bx(b, H.woodDark, 52.3 + k * 0.7, 0, 52, 0.2, 0.04, 1.2);
  bx(b, H.rust, 54.6, 0.35, 52, 1.4, 0.75, 0.95);
  cy(b, K.coal, 54.6, 1.05, 52, 0.55, 0.15, 0.25, 8);
  solid(c, 54.6, 52, 1.5, 1.0, 1.2, 'coal-tub', { shots: false });
}
