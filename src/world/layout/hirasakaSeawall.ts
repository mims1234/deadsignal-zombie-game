/**
 * HIRASAKA: DOLPHIN PIER, THE SEAWALL AND SHIO-FURI STREET (place group 'seawall', rect x -160..70, z 54..96, y 0).
 * Spots: `places.ts` (UMIBOZU winch + parts, SHRINES[0] Ebisu, TAPES[0], PHOTOS[0], SIDES ferry, OBSTACLES sand,
 * WALL_BUYS seawall).
 *
 * The frame built: the pads, the seawall parapet along z 76 (open at the pier), the pier itself, the flights up to
 * Market Lane (x -14) and Block 30 (x -82).
 *
 * Built here:
 *  - the promenade (x -40..70): the pachinko parlour's basement (its stair up to the parlour fell in), the company
 *    price board on the retaining wall, shuttered stores in that wall, Ebisu's shrine (the offering box's first place),
 *    the pier's waiting room (the timetable, the clock, the calendar stopped at April 1974, the tape on the luggage
 *    table), the ferry ticket kiosk (the last ferry), the harpoon winch on its plinth with its jib over the sea and the
 *    bench beside it (the Mori is built at the winch), lamps, benches.
 *  - the pier's bollards, the snapped mooring line, a life ring, the rusted gangway; the torn ferry heeled over against
 *    the seawall east of the pier; tetrapods along the foot of the wall.
 *  - Shio-furi Street (x -160..-40): the sea gate at its west end (a rusted slab on rails, the hand wheel), the ferry
 *    notice (the first photograph), an upturned boat, the fishermen's shed (the harpoon head at its door), net poles, a
 *    fisherman's house of 1974 and a fallen-in noodle shop against Block 30's wall, the ice store, a red telephone, the
 *    sand drift against the wall (the shovel's cache), the sea coming over the wall in sheets.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../builder';
import type { Ctx } from './util';
import { H, box, slab, solid } from './hirasakaKit';
import { ball } from './zaryaKit';
import { K, bar, bicycle, bx, calendar, cy, floor, lamp, pane, room, room1974, sol, tri } from './hirasakaTown';
import { PHOTOS, SHRINES, SIDES, TAPES, UMIBOZU, WALL_BUYS, Y } from '../../hirasaka/places';

export const SEAWALL_RECT = { x0: -160, z0: 54, x1: 70, z1: 96 };

const S = Y.sea;
type Mat = THREE.Material;

export function buildSeawall(c: Ctx): void {
  basement(c);
  retainingWall(c);
  ebisu(c);
  waitingRoom(c);
  kiosk(c);
  winch(c);
  pier(c);
  ferry(c);
  tetrapods(c);
  promenade(c);
  seaGate(c);
  shioNorth(c);
  shioStreet(c);
}

// ---------------------------------------------------------------------------------------------------------------------
// small pieces
// ---------------------------------------------------------------------------------------------------------------------

/** A pachinko machine whose face looks along +x (`face` 1) or -x (-1), with its stool. */
function pachiX(b: LevelBuilder, x: number, z: number, face: 1 | -1): void {
  bx(b, H.woodDark, x, S, z, 0.4, 0.42, 0.62);
  bx(b, K.cream, x, S + 0.42, z, 0.36, 1.4, 0.62);
  box(b, K.deepBlue, x + face * 0.185, S + 1.3, z, 0.02, 0.62, 0.48, 0, false);
  box(b, K.yellow, x + face * 0.19, S + 1.3, z, 0.02, 0.3, 0.3, 0, false);
  box(b, K.chrome, x + face * 0.24, S + 0.78, z, 0.16, 0.1, 0.5, 0, false);
  cy(b, H.woodDark, x + face * 0.75, S, z, 0.16, 0.16, 0.5, 8);
}

/** A boat's plan (a pointed bow at +x) extruded down `depth` from y 0. */
function hullGeo(len: number, beam: number, bow: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const h = beam / 2;
  s.moveTo(-len / 2, -h);
  s.lineTo(len / 2 - bow, -h);
  s.quadraticCurveTo(len / 2 - bow * 0.25, -h * 0.75, len / 2, 0);
  s.quadraticCurveTo(len / 2 - bow * 0.25, h * 0.75, len / 2 - bow, h);
  s.lineTo(-len / 2, h);
  s.lineTo(-len / 2, -h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(Math.PI / 2);
  return g;
}

/** A spray of sea coming over the seawall at x: a sheet down the wall's inner face, foam spreading on the street. */
function overtop(b: LevelBuilder, x: number, w: number): void {
  slab(b, SEA.crest, x, 1.5, 75.85, w, 0.16, 0.6, 0.15, 0, 0, false);
  box(b, SEA.sheet, x, 0.72, 75.5, w * 0.92, 1.44, 0.04, 0, false);
  for (let k = 0; k < 3; k++) box(b, SEA.crest, x - w * 0.3 + k * w * 0.3, 0.7, 75.46, 0.12, 1.2 - k * 0.2, 0.02, 0, false);
  slab(b, SEA.crest, x, 0.08, 75.05, w * 1.1, 0.06, 0.9, -0.12, 0, 0, false);
  for (let k = 0; k < 4; k++) box(b, SEA.crest, x - w * 0.5 + k * w * 0.33, S + 0.022, 73.6 - (k % 2) * 0.8, 0.35, 0.02, 2.0 + (k % 2), 0.2 * (k - 1.5), false);
  box(b, K.puddle, x, S + 0.015, 72.6, w * 1.6, 0.02, 3.4, 0, false);
}
const SEA = {
  crest: new THREE.MeshStandardMaterial({ color: 0x9ab8b8, roughness: 0.15, metalness: 0.3 }),
  sheet: new THREE.MeshStandardMaterial({ color: 0x5a7e80, roughness: 0.15, metalness: 0.3 }),
};

/** A small vermilion torii facing the sea (pillars, black caps, the two lintels), colliders at its pillars. */
function torii(c: Ctx, x: number, z: number): void {
  const { b } = c;
  for (const s of [-1, 1]) {
    cy(b, K.post, x + s * 0.95, S, z, 0.13, 0.11, 2.3, 10);
    cy(b, K.black, x + s * 0.95, S, z, 0.17, 0.17, 0.25, 10);
    solid(c, x + s * 0.95, z, 0.3, 0.3, 2.4, 'torii', { surface: 'wood' });
  }
  bx(b, K.post, x, 1.85, z, 2.5, 0.13, 0.12);
  bx(b, K.post, x, 1.98, z, 0.12, 0.3, 0.1);
  slab(b, K.post, x, 2.33, z, 3.0, 0.14, 0.18, 0, 0, 0, false);
  slab(b, K.black, x, 2.45, z, 3.3, 0.1, 0.24, 0, 0, 0, false);
  for (const s of [-1, 1]) slab(b, K.black, x + s * 1.6, 2.5, z, 0.3, 0.1, 0.24, 0, 0, s * 0.3, false);
}

/** A rack of fish drying: two crossed bamboo legs at each end, three poles, the fish hung along them. */
function dryRack(c: Ctx, x: number, z: number): void {
  const { b } = c;
  for (const e of [-2, 2])
    for (const s of [-1, 1]) bar(b, K.straw, [x + e, 0, z + s * 0.45], [x + e, 2.1, z - s * 0.15], 0.06);
  for (const y of [1.3, 1.65, 2.0]) bar(b, K.straw, [x - 2.1, y, z], [x + 2.1, y, z], 0.045);
  for (let k = 0; k < 24; k++) {
    const y = [1.3, 1.65, 2.0][k % 3]!;
    box(b, DRY, x - 1.8 + Math.floor(k / 3) * 0.5 + (k % 3) * 0.12, y - 0.17, z, 0.07, 0.3, 0.02, 0, false);
  }
  solid(c, x, z, 4.3, 0.9, 2.1, 'dry-rack', { shots: false });
}
const DRY = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.85 });

/** A tetrapod (four concrete legs out of one middle), set at random in the surf. */
function tetrapod(b: LevelBuilder, x: number, y: number, z: number, s: number, r: number, m: Mat): void {
  const g = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of [[0, 1, 0], [0.943, -0.333, 0], [-0.471, -0.333, 0.816], [-0.471, -0.333, -0.816]] as const) {
    const v = new THREE.Vector3(d[0], d[1], d[2]);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * s, 0.46 * s, 1.15 * s, 6), m);
    leg.position.copy(v).multiplyScalar(0.55 * s);
    leg.quaternion.setFromUnitVectors(up, v);
    g.add(leg);
  }
  g.position.set(x, y, z);
  g.rotation.set(r * 0.7, r * 2.1, r * 1.3);
  b.add(g, { cast: false });
}

/** Paint on the ground: puddles and wet patches. */
function puddles(b: LevelBuilder, list: readonly (readonly [number, number, number, number])[]): void {
  for (const [x0, z0, x1, z1] of list) box(b, K.puddle, (x0 + x1) / 2, S + 0.014, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, 0, false);
}

/** A roller shutter fixed shut in a wall face at z (facing +z). */
function shutterWall(b: LevelBuilder, x: number, z: number, w: number, h: number): void {
  box(b, H.concrete, x, h / 2 + 0.05, z, w + 0.5, h + 0.3, 0.12, 0, false);
  box(b, K.shutter, x, h / 2, z + 0.07, w, h, 0.04, 0, false);
  for (let k = 0; k < Math.floor(h / 0.3); k++) box(b, H.iron, x, 0.2 + k * 0.3, z + 0.1, w, 0.03, 0.02, 0, false);
  box(b, K.shutter, x, h + 0.12, z + 0.15, w + 0.1, 0.26, 0.24, 0, false);
  box(b, K.stain, x + w * 0.3, h * 0.5, z + 0.095, 0.3, h * 0.8, 0.01, 0, false);
}

// ---------------------------------------------------------------------------------------------------------------------
// the promenade
// ---------------------------------------------------------------------------------------------------------------------

/** The pachinko parlour's basement, opening on the seawall under the market (its stair up fell in). */
function basement(c: Ctx): void {
  const { b } = c;
  const R = { x0: -39.6, z0: 54.4, x1: -31.4, z1: 63.4 };
  room(c, R, S, 3.2, { doors: [{ side: 'S', at: 4.1, w: 2.2 }], wall: H.concrete, tag: 'pachinko-basement' });
  bx(b, H.concreteDark, -35.5, 3.4, 58.9, 8.5, 0.2, 9.3);
  floor(b, K.navy, R, S);
  for (const z of [55.83, 60.53]) bx(b, H.woodDark, -35.5, S, z, 0.86, 1.86, 0.1);
  // machines down both long walls and one island back to back
  for (let k = 0; k < 9; k++) pachiX(b, -39.2, 55.6 + k * 0.66, 1);
  for (let k = 0; k < 7; k++) {
    pachiX(b, -31.8, 57.2 + k * 0.66, -1);
    pachiX(b, -35.7, 56.2 + k * 0.66, -1);
    pachiX(b, -35.3, 56.2 + k * 0.66, 1);
  }
  solid(c, -39.2, 58.24, 0.5, 5.9, 1.8, 'pachinko');
  solid(c, -31.8, 59.18, 0.5, 4.6, 1.8, 'pachinko');
  solid(c, -35.5, 58.18, 0.8, 4.6, 1.8, 'pachinko');
  // the stair up at the back, fallen in: three steps and a heap of slabs over the rest
  for (let k = 0; k < 3; k++) bx(b, H.concreteDark, -33.0, S, 56.0 - k * 0.45, 2.4, 0.3 * (k + 1), 0.45);
  for (const [x, z, s, r] of [[-33.4, 55.0, 1.4, 0.5], [-32.4, 55.2, 1.1, 1.3], [-33.0, 54.9, 1.0, 2.4]] as const) slab(b, H.concrete, x, 1.2 + r * 0.2, z, s, 0.3, s * 0.8, r * 0.5, r, 0.4, false);
  solid(c, -33.0, 55.5, 2.6, 2.1, 2.4, 'stair-rubble');
  // the front: a ring of bulbs round the door, a blank sign, a pane each side
  bx(b, K.yellow, -35.5, 2.55, 63.62, 5.4, 0.5, 0.12);
  for (let k = 0; k < 12; k++) ball(b, H.lamp, -38 + k * (5 / 11), 2.86, 63.6, 0.05, 1, 6);
  for (const x of [-38.4, -32.6]) pane(b, x, 0.9, R.z1, 1.6, 1.2, true, K.pane);
  calendar(b, -31.55, 1.8, 62.2, 'W');
  c.b.light({ x: -35.5, y: 2.9, z: 59, color: 0xffd0a0, intensity: 6, distance: 8, mode: 'fail', pool: 0, glow: 0, tag: 'pachinko-basement' });
}

/** Market Lane's retaining wall along z 54: the company price board, shuttered stores, pipes and stains. */
function retainingWall(c: Ctx): void {
  const { b } = c;
  const wb = WALL_BUYS.find((w) => w.id === 'seawall')!;
  const z = 54.05;
  bx(b, H.woodDark, wb.x, 0.6, z + 0.06, 2.6, 2.0, 0.12);
  box(b, K.paper, wb.x, 1.6, z + 0.14, 2.2, 1.6, 0.04, 0, false);
  for (let r = 0; r < 4; r++) box(b, H.woodDark, wb.x - 0.2, 2.15 - r * 0.36, z + 0.17, 1.5, 0.05, 0.02, 0, false);
  slab(b, H.rust, wb.x, 2.85, z + 0.45, 3.0, 0.06, 0.9, 0.3, 0, 0, false);
  for (const x of [-27, -22.5]) shutterWall(b, x, z, 3, 2.6);
  for (const x of [6.4, 11.0, 15.6]) shutterWall(b, x, z, 3.6, 2.8);
  for (const x of [-29.2, -18.6, -9.4, 8.7, 18.8]) {
    box(b, H.iron, x, 1.8, z + 0.12, 0.12, 3.6, 0.12, 0, false);
    box(b, K.stain, x + 0.25, 1.4, z + 0.02, 0.5, 2.8, 0.02, 0, false);
  }
  box(b, K.moss, -4, 3.1, z + 0.02, 8, 0.6, 0.02, 0, false);
}

/** Ebisu's shrine by the pier: a little hokora on a stone base, the red torii toward the sea, lanterns, floats. */
function ebisu(c: Ctx): void {
  const { b } = c;
  const e = SHRINES.find((s) => s.id === 'ebisu')!;
  const stone = H.concrete;
  sol(c, stone, e.x, S, e.z - 2.4, 2.6, 0.5, 2.0, 'ebisu-base', false);
  bx(b, H.concreteDark, e.x, S, e.z - 1.25, 1.4, 0.25, 0.4);
  // the hokora: a body with little doors, a gable roof of green copper, the ridge
  const hz = e.z - 2.5;
  bx(b, H.woodDark, e.x, 0.5, hz, 1.1, 0.95, 0.85);
  for (const s of [-1, 1]) box(b, K.post, e.x + s * 0.22, 0.95, hz + 0.43, 0.4, 0.6, 0.03, 0, false);
  box(b, K.yellow, e.x, 0.95, hz + 0.45, 0.06, 0.6, 0.02, 0, false);
  const cu = new THREE.MeshStandardMaterial({ color: 0x4e7262, roughness: 0.85 });
  for (const s of [-1, 1]) slab(b, cu, e.x + s * 0.36, 1.62, hz, 0.86, 0.06, 1.25, 0, 0, s * -0.55, false);
  box(b, H.woodDark, e.x, 1.85, hz, 0.1, 0.1, 1.3, 0, false);
  for (const s of [-1, 1]) bx(b, H.woodDark, e.x + s * 0.5, 0.5, hz + 0.5, 0.08, 0.95, 0.08);
  // offerings: a red sea bream, two sake bottles, a tiny rod; paper streamers on a rope
  const fish = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), K.awnRed);
  fish.scale.set(2.2, 1, 0.5);
  fish.position.set(e.x, 0.62, e.z - 1.25);
  b.add(fish, { cast: false });
  for (const s of [-1, 1]) cy(b, K.paper, e.x + s * 0.5, 0.25, e.z - 1.25, 0.06, 0.04, 0.3, 8);
  bar(b, H.woodPale, [e.x - 0.65, 0.5, hz + 0.6], [e.x + 0.2, 1.6, hz + 0.75], 0.02);
  bar(b, K.straw, [e.x - 0.55, 1.42, hz + 0.56], [e.x + 0.55, 1.42, hz + 0.56], 0.05);
  for (let k = 0; k < 3; k++) slab(b, K.paper, e.x - 0.3 + k * 0.3, 1.2, hz + 0.58, 0.08, 0.3, 0.01, 0, 0, 0.3, false);
  // the torii toward the sea, stone lanterns either side of the base
  torii(c, e.x, e.z + 2.6);
  for (const s of [-1, 1]) {
    const x = e.x + s * 2.1;
    const z = e.z - 2.3;
    bx(b, stone, x, S, z, 0.5, 0.25, 0.5);
    bx(b, stone, x, 0.25, z, 0.18, 0.75, 0.18);
    bx(b, stone, x, 1.0, z, 0.42, 0.08, 0.42);
    box(b, H.lamp, x, 1.2, z, 0.26, 0.3, 0.26, 0, false);
    slab(b, stone, x, 1.42, z, 0.56, 0.12, 0.56, 0, Math.PI / 4, 0, false);
    solid(c, x, z, 0.5, 0.5, 1.5, 'stone-lantern');
  }
  // glass floats in a net on the wall behind
  bx(b, K.green, e.x, 1.2, 54.15, 2.4, 1.6, 0.04);
  for (let k = 0; k < 7; k++) ball(b, new THREE.MeshStandardMaterial({ color: 0x3e7a62, roughness: 0.15, metalness: 0.3 }), e.x - 0.9 + (k % 4) * 0.6, 1.5 + Math.floor(k / 4) * 0.6, 54.32, 0.2, 1, 8);
  c.b.light({ x: e.x, y: 1.4, z: e.z - 1.6, color: 0xffb070, intensity: 5, distance: 7, mode: 'flicker', pool: 0, glow: 0.3, tag: 'ebisu' });
}

/** The pier's waiting room: benches, the luggage table (the first tape), the timetable, the clock, the ticket hatch. */
function waitingRoom(c: Ctx): void {
  const { b } = c;
  const R = { x0: -9, z0: 57, x1: 4, z1: 64.4 };
  room(c, R, S, 3, { doors: [{ side: 'S', at: 3, w: 3.4 }, { side: 'S', at: 9.6, w: 3.4 }], wall: H.plaster, roof: H.concreteDark, tag: 'waiting-room' });
  bx(b, H.concreteDark, -2.5, 2.85, 65.2, 13.6, 0.18, 1.6);
  for (const x of [-8.7, 3.7]) sol(c, H.iron, x, S, 65.8, 0.14, 2.85, 0.14, 'eave-post');
  floor(b, K.terrazzo, R, S);
  for (const [x, z, w, d] of [[-2.5, 57.17, 12.7, 0.03], [-8.83, 60.7, 0.03, 7.1], [3.83, 60.7, 0.03, 7.1]] as const) bx(b, H.woodDark, x, S, z, w, 1.0, d);
  // benches along the back wall, a forgotten suitcase on one, an umbrella against it
  sol(c, H.wood, -5.2, S, 57.42, 6.6, 0.45, 0.55, 'bench', false);
  for (let k = 0; k < 4; k++) bx(b, H.woodDark, -8.2 + k * 2, 0.45, 57.2, 0.06, 0.5, 0.06);
  bx(b, H.wood, -5.2, 0.9, 57.2, 6.6, 0.08, 0.06);
  bx(b, K.rustDark, -3.4, 0.45, 57.45, 0.7, 0.45, 0.22);
  bar(b, K.navy, [-2.6, 0, 57.8], [-2.8, 0.9, 57.25], 0.04);
  sol(c, H.wood, -8.62, S, 61.5, 0.45, 0.45, 3.4, 'bench', false);
  // the luggage table the tape lies on
  const tp = TAPES[0]!;
  bx(b, H.woodDark, tp.x, 0.8, tp.z, 1.5, 0.08, 0.62);
  for (const [dx, dz] of [[-0.68, -0.25], [0.68, -0.25], [-0.68, 0.25], [0.68, 0.25]] as const) bx(b, H.woodDark, tp.x + dx, S, tp.z + dz, 0.07, 0.8, 0.07);
  bx(b, H.woodDark, tp.x, 0.2, tp.z, 1.4, 0.04, 0.52);
  solid(c, tp.x, tp.z, 1.5, 0.62, 0.88, 'luggage-table', { shots: false });
  // the timetable on the back wall (rows of little slats, a red head), the clock over the bench, posters
  box(b, H.woodDark, 1.4, 1.75, 57.17, 2.1, 1.5, 0.04, 0, false);
  box(b, K.paper, 1.4, 1.75, 57.2, 1.9, 1.3, 0.02, 0, false);
  box(b, K.post, 1.4, 2.32, 57.22, 1.9, 0.16, 0.02, 0, false);
  for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) box(b, q === 0 ? K.navy : H.woodDark, 0.85 + q * 0.6, 2.05 - r * 0.2, 57.22, 0.42, 0.05, 0.02, 0, false);
  const clk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 16), H.woodDark);
  clk.rotation.x = Math.PI / 2;
  clk.position.set(-5.2, 2.3, 57.18);
  b.add(clk, { cast: false });
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), K.paper);
  face.rotation.x = Math.PI / 2;
  face.position.set(-5.2, 2.3, 57.21);
  b.add(face, { cast: false });
  slab(b, K.black, -5.2, 2.35, 57.23, 0.02, 0.11, 0.01, 0, 0, 0.6, false);
  slab(b, K.black, -5.14, 2.28, 57.23, 0.02, 0.16, 0.01, 0, 0, -1.9, false);
  for (const [x, m] of [[-1.2, K.deepBlue], [-0.2, K.awnRed]] as const) {
    box(b, m, x, 1.7, 57.18, 0.7, 1.0, 0.02, 0, false);
    box(b, K.paper, x, 1.45, 57.2, 0.5, 0.3, 0.02, 0, false);
  }
  calendar(b, R.x0 + 0.15, 1.75, 59.2, 'E');
  // the ticket hatch in the east wall, its ledge; a bin; the strip lamp
  pane(b, R.x1, 1.0, 60.4, 1.2, 0.8, false, K.pane);
  bx(b, H.wood, R.x1 - 0.3, 0.95, 60.4, 0.3, 0.06, 1.3);
  cy(b, H.iron, 3.3, S, 63.6, 0.25, 0.22, 0.7, 10);
  for (const x of [-7.3, -0.6]) pane(b, x, 1.0, R.z0, 1.4, 0.9, true);
  box(b, H.lamp, -2.5, 2.88, 60.7, 1.4, 0.06, 0.16, 0, false);
  c.b.light({ x: -2.5, y: 2.6, z: 60.7, color: 0xffe0b8, intensity: 6, distance: 9, mode: 'flicker', pool: 0, glow: 0, tag: 'waiting-room' });
}

/** The ferry company's ticket kiosk by the pier (the last ferry's ticket is a side story's). */
function kiosk(c: Ctx): void {
  const { b } = c;
  const fe = SIDES.find((s) => s.id === 'ferry')!;
  const R = { x0: fe.x + 1.6, z0: 57.6, x1: fe.x + 5.6, z1: 62.2 };
  room(c, R, S, 2.8, { doors: [{ side: 'E', at: 2.3, w: 1.6 }], wall: H.plaster, roof: H.rust, tag: 'kiosk' });
  pane(b, R.x0, 1.0, 59.9, 1.6, 0.9, false, K.pane);
  floor(b, K.boards, R, S);
  bx(b, H.wood, R.x0 - 0.25, 0.95, 59.9, 0.35, 0.06, 1.8);
  // inside: the counter under the window, the rack of tickets, a cash box, a stool, a heater, the timetable copy
  sol(c, H.wood, R.x0 + 0.45, S, 59.9, 0.6, 0.9, 2.4, 'kiosk-counter', false);
  bx(b, H.woodDark, R.x0 + 0.4, 0.9, 58.95, 0.4, 0.5, 0.3);
  for (let k = 0; k < 8; k++) box(b, [K.paper, K.pink, K.yellow][k % 3]!, R.x0 + 0.35 + (k % 4) * 0.06, 1.0 + Math.floor(k / 4) * 0.18, 58.95, 0.02, 0.1, 0.18, 0, false);
  bx(b, H.iron, R.x0 + 0.5, 0.9, 60.6, 0.3, 0.12, 0.22);
  cy(b, H.woodDark, R.x0 + 1.4, S, 59.9, 0.18, 0.18, 0.5, 8);
  cy(b, H.rust, R.x1 - 0.5, S, R.z0 + 0.5, 0.22, 0.22, 0.5, 10);
  box(b, K.paper, R.x1 - 0.17, 1.6, 59.6, 0.02, 0.9, 0.7, 0, false);
  calendar(b, (R.x0 + R.x1) / 2, 1.7, R.z1 - 0.15, 'N');
  bx(b, K.post, R.x0 - 0.2, 2.2, 59.9, 0.06, 0.25, 2.0);
}

/** The seawall winch on its plinth (the Mori is built here), its jib out over the sea, the cable and hook, the bench. */
function winch(c: Ctx): void {
  const { b } = c;
  const w = UMIBOZU.winch;
  const px = w.x;
  const pz = w.z + 3.4;
  bx(b, H.concrete, px, S, pz, 3.6, 1.0, 2.2);
  bx(b, K.stain, px, S, pz + 1.12, 3.6, 0.9, 0.04);
  solid(c, px, pz, 3.6, 2.2, 2.7, 'winch', { surface: 'metal' });
  for (const s of [-1, 1]) {
    slab(b, H.iron, px + s * 0.95, 1.85, pz - 0.35, 0.16, 1.8, 0.16, 0.35, 0, 0, false);
    slab(b, H.iron, px + s * 0.95, 1.85, pz + 0.35, 0.16, 1.8, 0.16, -0.35, 0, 0, false);
  }
  const drum = (r: number, len: number, m: Mat, x = px): void => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), m);
    o.rotation.z = Math.PI / 2;
    o.position.set(x, 2.25, pz);
    b.add(o, { cast: false });
  };
  drum(0.55, 1.7, H.iron);
  drum(0.6, 1.4, P2.cable);
  for (const s of [-1, 1]) drum(0.78, 0.08, H.rust, px + s * 0.86);
  drum(0.95, 0.07, H.rust, px + 1.18);
  drum(0.32, 0.12, K.rustDark, px + 1.18);
  bx(b, H.iron, px - 1.35, 1.0, pz + 0.3, 0.7, 0.6, 0.8);
  bar(b, H.iron, [px + 1.25, 2.25, pz], [px + 1.6, 1.9, pz - 0.45], 0.06);
  bar(b, H.woodPale, [px + 1.6, 1.9, pz - 0.45], [px + 1.6, 1.9, pz - 0.85], 0.07);
  // the jib leaning out over the wall, a sheave at its head, the cable down to the hook
  const head: [number, number, number] = [px, 5.4, pz + 5.0];
  bar(b, H.iron, [px - 0.5, 1.0, pz + 0.9], head, 0.18);
  bar(b, H.iron, [px + 0.5, 1.0, pz + 0.9], head, 0.18);
  bar(b, H.iron, [px, 1.0, pz - 0.9], [px, 4.0, pz + 3.4], 0.12);
  const sh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 14), H.rust);
  sh.rotation.y = Math.PI / 2;
  sh.position.set(...head);
  b.add(sh, { cast: false });
  bar(b, P2.cable, [px, 2.85, pz], head, 0.04);
  bar(b, P2.cable, head, [head[0], 2.4, head[2]], 0.04);
  bx(b, H.iron, head[0], 2.0, head[2], 0.12, 0.42, 0.12);
  slab(b, H.iron, head[0], 1.85, head[2] + 0.18, 0.08, 0.5, 0.08, 0.7, 0, 0, false);
  slab(b, H.iron, head[0], 1.85, head[2] - 0.18, 0.08, 0.5, 0.08, -0.7, 0, 0, false);
  // the bench beside it: a vise, a toolbox, a coil of cable, an oil can
  sol(c, H.wood, w.x + 2.9, S, w.z, 0.9, 0.82, 1.8, 'winch-bench', false);
  bx(b, H.iron, w.x + 2.9, 0.82, w.z - 0.7, 0.3, 0.22, 0.24);
  bx(b, K.post, w.x + 2.9, 0.82, w.z + 0.2, 0.36, 0.22, 0.6);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.08, 5, 14), P2.cable);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(w.x + 3.0, 0.1, w.z + 1.6);
  b.add(coil, { cast: false });
  cy(b, H.rust, w.x + 2.75, 0.82, w.z + 0.75, 0.08, 0.06, 0.22, 8);
}
const P2 = { cable: new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.6, metalness: 0.5 }) };

/** Dolphin Pier: bollards, the snapped mooring line, a life ring on its post, a rope coil, the gangway in the sea. */
function pier(c: Ctx): void {
  const { b } = c;
  for (const z of [80, 87, 94])
    for (const x of [9.1, 16.9]) {
      cy(b, H.iron, x, S, z, 0.22, 0.22, 0.45, 10);
      cy(b, H.iron, x, 0.45, z, 0.3, 0.3, 0.08, 10);
      solid(c, x, z, 0.5, 0.5, 0.55, 'bollard', { shots: false, surface: 'metal' });
    }
  // the line that held the ferry, parted, trailing over the rail into the sea toward it
  bar(b, K.straw, [16.9, 0.4, 87], [18.4, 1.0, 87.4], 0.06);
  bar(b, K.straw, [18.4, 1.0, 87.4], [21.5, -0.55, 88.6], 0.06);
  bar(b, K.straw, [16.9, 0.35, 87], [15.8, 0.05, 86.2], 0.06);
  // a life ring on its post, a coil of rope, a fish box stack, wet planks
  bx(b, H.iron, 9.0, S, 83.5, 0.1, 1.5, 0.1);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 6, 16), K.orange);
  ring.position.set(9.08, 1.15, 83.5);
  ring.rotation.y = Math.PI / 2;
  b.add(ring, { cast: false });
  solid(c, 9.0, 83.5, 0.3, 0.3, 1.5, 'life-ring', { shots: false });
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 5, 14), K.straw);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(15.8, 0.09, 81.6);
  b.add(coil, { cast: false });
  sol(c, H.wood, 10.2, S, 89.2, 0.9, 0.55, 0.6, 'fish-box', false);
  bx(b, H.wood, 10.25, 0.55, 89.2, 0.85, 0.5, 0.55, 0.15);
  puddles(b, [[10, 77.5, 13.5, 79.5], [14, 84, 16.5, 85.6], [11, 92.6, 15, 94]]);
  // the rusted gangway, torn off its hinge and hanging into the sea
  slab(b, H.rust, 19.0, -0.5, 80.4, 1.3, 0.1, 4.2, 0, 0.1, -0.7, false);
  for (const s of [-1, 1]) slab(b, H.rust, 19.0, -0.1, 80.4 + s * 0.0, 0.05, 0.8, 4.2, 0, 0.1, -0.7, false);
  lamp(c, 17, S, 95, { color: 0xffd08a, mode: 'flicker', h: 3.4, tag: 'pier' });
}

/** The ferry the typhoon tore off the pier: heeled over against the seawall east of it, its bow up on the tetrapods. */
function ferry(c: Ctx): void {
  const { b } = c;
  const outer = new THREE.Group();
  const g = new THREE.Group();
  outer.add(g);
  const add = (geo: THREE.BufferGeometry, m: Mat, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    g.add(o);
    return o;
  };
  const bxg = (m: Mat, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0): THREE.Mesh => add(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, 0, ry);
  // the hull: blue, a red bottom, a white band under the deck edge, the deck
  add(hullGeo(22.4, 6.4, 5, 0.8), K.awnRed, 0, -2.0, 0);
  add(hullGeo(22, 6.2, 5, 2.4), K.hull, 0, 0.4, 0);
  add(hullGeo(22.1, 6.3, 5, 0.9), H.white, 0, 1.3, 0);
  add(hullGeo(21.4, 5.6, 4.8, 0.1), K.boards, 0, 1.33, 0);
  // the cabin with its band of windows, the wheelhouse on it, the funnel, the mast
  bxg(H.white, -2.5, 1.05, 0, 10, 2.2, 4.4);
  bxg(K.pane, -2.5, 2.0, 0, 9.4, 0.7, 4.46);
  for (let k = 0; k < 8; k++) bxg(H.white, -6.8 + k * 1.2, 2.0, 0, 0.12, 0.7, 4.5);
  bxg(H.concreteDark, -2.5, 3.25, 0, 10.4, 0.12, 4.8);
  bxg(H.white, 1.2, 3.37, 0, 3.2, 1.9, 3.4);
  bxg(K.pane, 1.25, 4.2, 0, 3.26, 0.7, 3.46);
  bxg(H.concreteDark, 1.2, 5.27, 0, 3.6, 0.12, 3.8);
  add(new THREE.CylinderGeometry(0.55, 0.6, 1.6, 12), H.white, -5.5, 4.17, 0);
  add(new THREE.CylinderGeometry(0.57, 0.57, 0.35, 12), K.awnRed, -5.5, 4.6, 0);
  add(new THREE.CylinderGeometry(0.56, 0.56, 0.2, 12), K.black, -5.5, 5.0, 0);
  add(new THREE.BoxGeometry(0.1, 3.0, 0.1), H.iron, 1.8, 6.8, 0);
  add(new THREE.BoxGeometry(0.08, 0.08, 1.8), H.iron, 1.8, 7.6, 0);
  // the rails round the bow deck (one run bent away), life rings on the cabin
  for (let k = 0; k < 7; k++) {
    const x = 3.4 + k * 0.9;
    const hw = x < 6 ? 2.8 : 2.8 - (x - 6) * 0.55;
    for (const s of [-1, 1]) if (!(s > 0 && k > 3)) bxg(H.iron, x, 1.3, s * hw, 0.05, 0.9, 0.05);
  }
  add(new THREE.BoxGeometry(3.0, 0.05, 0.05), H.iron, 4.9, 2.2, -2.8);
  add(new THREE.BoxGeometry(5.6, 0.05, 0.05), H.iron, 6.5, 2.2, -2.2, 0, 0.32);
  add(new THREE.BoxGeometry(3.0, 0.05, 0.05), H.iron, 4.9, 2.2, 2.8);
  add(new THREE.BoxGeometry(2.4, 0.05, 0.05), H.iron, 7.6, 1.9, 3.2, 0.5, -0.5, 0.3);
  for (const x of [-5.6, 0.2]) add(new THREE.TorusGeometry(0.32, 0.08, 6, 14), K.orange, x, 2.4, 2.24);
  // the tear on the sea side: a dark gash, plates bent out round it, rust run down
  bxg(K.black, -4.5, -0.8, 3.08, 3.2, 1.4, 0.06);
  for (const [x, y, r] of [[-5.9, -0.3, 0.6], [-3.2, -0.2, -0.5], [-4.6, 0.55, 0.2], [-4.2, -1.0, -0.2]] as const) add(new THREE.BoxGeometry(1.1, 0.5, 0.06), H.rust, x, y, 3.25, 0.6, r, r);
  for (const x of [-7, 2, 5]) bxg(H.rust, x, -0.6, 3.12, 0.3, 1.8, 0.03);
  outer.position.set(34, -0.3, 85.5);
  outer.rotation.y = 0.42;
  g.rotation.set(-0.3, 0, 0.07);
  b.add(outer, { cast: false });
}

/** Tetrapods along the foot of the seawall, both sides of the pier (not under the ferry). */
function tetrapods(c: Ctx): void {
  const { b } = c;
  let s = 977;
  const r = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let x = -158; x < 68; x += 2.6 + r() * 1.4) {
    if (x > 5 && x < 21) continue;
    if (x > 24 && x < 44 && r() < 0.6) continue;
    const z = 77.6 + r() * 2.2;
    tetrapod(b, x, -0.7 + r() * 0.5, z, 1.0 + r() * 0.3, r() * 6, r() < 0.4 ? H.concreteDark : H.concrete);
    if (r() < 0.4) tetrapod(b, x + 1.2, -0.2, z + 1.4, 0.9, r() * 6, H.concrete);
  }
  for (let k = 0; k < 6; k++) tetrapod(b, 38 + k * 1.6, -0.4 + (k % 2) * 0.4, 78.4 + (k % 3) * 0.8, 1.1, k * 1.7, H.concreteDark);
}

/** The promenade's lamps, benches, drains, bins, puddles and spray. */
function promenade(c: Ctx): void {
  const { b } = c;
  for (const [x, mode] of [[-24, 'steady'], [30, 'flicker'], [62, 'steady']] as const) lamp(c, x, S, 74.2, { mode, tag: 'seawall' });
  for (const x of [-4, 54]) {
    sol(c, H.wood, x, S, 74.4, 2.2, 0.45, 0.5, 'bench', false);
    bx(b, H.wood, x, 0.45, 74.66, 2.2, 0.45, 0.06);
  }
  for (let x = -36; x < 68; x += 13) if (x < 6 || x > 20) box(b, H.iron, x, S + 0.02, 75.2, 1.0, 0.03, 0.5, 0, false);
  for (const x of [-12.5, 49.8]) {
    cy(b, K.steel, x, S, 73.6, 0.3, 0.32, 0.85, 10);
    solid(c, x, 73.6, 0.65, 0.65, 0.85, 'bin', { shots: false, surface: 'metal' });
  }
  bicycle(b, 5.0, S, 62.5, -Math.PI / 2, K.awnBlue);
  puddles(b, [[-38, 70, -33, 72.4], [-14, 66, -9, 68.6], [-2, 70.2, 3, 72], [24, 66, 29, 68.6], [46, 64.2, 52, 66.6], [58, 69.4, 64, 71.4], [-30, 74.4, 66, 75.5]]);
  for (const [x, z] of [[26, 70], [-37.6, 69.6]] as const) {
    sol(c, H.concrete, x, S, z, 1.4, 0.6, 1.4, 'planter', false);
    cy(b, H.woodDark, x, 0.6, z, 0.07, 0.04, 1.6, 6);
    for (let k = 0; k < 3; k++) bar(b, H.woodDark, [x, 1.2 + k * 0.25, z], [x + (k - 1) * 0.6, 1.5 + k * 0.25, z + 0.3], 0.04);
  }
  for (const [x, z, h] of [[27.6, 58.2, 1], [28.6, 58.2, 1], [28.1, 59.2, 0.8]] as const) sol(c, H.wood, x, S, z, 0.9, h, 0.9, 'crate', false);
  bx(b, H.wood, 28.1, 1.0, 58.2, 0.85, 0.7, 0.85, 0.3);
  sol(c, H.wood, 5.4, S, 70.6, 1.0, 0.5, 0.7, 'fish-box', false);
  bx(b, H.wood, 5.4, 0.5, 70.6, 1.0, 0.5, 0.7, 0.1);
  cy(b, K.green, 5.6, S, 68.8, 0.8, 0.5, 0.5, 9);
  solid(c, 5.6, 68.8, 1.4, 1.4, 0.5, 'nets', { shots: false });
  for (const x of [52.4, 53.4]) sol(c, H.wood, x, S, 58.6, 0.9, 0.9, 0.9, 'crate', false);
  overtop(b, 58, 3.4);
  overtop(b, -34, 2.6);
  c.b.light({ x: 44, y: 3.6, z: 76.5, color: 0xffa860, intensity: 8, distance: 10, mode: 'flicker', pool: 0, glow: 0.5, tag: 'winch' });
}

// ---------------------------------------------------------------------------------------------------------------------
// Shio-furi Street
// ---------------------------------------------------------------------------------------------------------------------

/** The sea gate at the street's west end: a rusted slab between two piers, its rails, the lifting gear, the hand wheel. */
function seaGate(c: Ctx): void {
  const { b } = c;
  const gx = -158.9;
  for (const z of [61.4, 70.6]) sol(c, H.concrete, gx, S, z, 1.6, 4.4, 1.4, 'sea-gate');
  bx(b, H.concrete, gx, 4.4, 66, 1.7, 0.8, 10.6);
  bx(b, K.stain, gx + 0.82, 0.2, 61.4, 0.02, 3.8, 0.9);
  // the slab, ribbed and riveted, a hand's width proud of the wall it seals
  sol(c, H.rust, gx + 0.2, S, 66, 0.36, 3.1, 7.8, 'sea-gate');
  for (let k = 0; k < 5; k++) bx(b, K.rustDark, gx + 0.42, 0.2 + k * 0.7, 66, 0.1, 0.12, 7.8);
  for (const z of [63.2, 66, 68.8]) bx(b, K.rustDark, gx + 0.42, S, z, 0.1, 3.1, 0.14);
  for (const z of [62.25, 69.75]) bx(b, H.iron, gx + 0.3, S, z, 0.2, 4.4, 0.16);
  // the lifting gear on the lintel, chains to the slab
  bx(b, H.iron, gx + 0.1, 5.2, 66, 1.0, 0.7, 2.2);
  for (const z of [64.2, 67.8]) bar(b, H.iron, [gx + 0.3, 5.2, z], [gx + 0.3, 3.1, z], 0.06);
  // the hand wheel on its pedestal, a shaft up to the gear
  const wx = -156.2;
  const wz = 72.2;
  sol(c, H.iron, wx, S, wz, 0.5, 1.05, 0.5, 'gate-wheel');
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 6, 20), H.rust);
  wheel.add(rim);
  for (let k = 0; k < 3; k++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.06), H.rust);
    sp.rotation.z = (k * Math.PI) / 3;
    wheel.add(sp);
  }
  wheel.position.set(wx + 0.32, 1.45, wz);
  wheel.rotation.y = Math.PI / 2;
  b.add(wheel, { cast: false });
  bar(b, H.iron, [wx, 1.05, wz], [wx + 0.3, 1.45, wz], 0.08);
  bar(b, H.iron, [wx - 0.1, 1.0, wz], [gx + 0.5, 4.9, 69.2], 0.07);
  // the sea coming under it: foam along its foot, the wet spreading down the street
  for (let k = 0; k < 6; k++) box(b, SEA.crest, gx + 0.9 + (k % 3) * 0.9, S + 0.022, 62.8 + k * 1.2, 0.5 + (k % 2) * 0.6, 0.02, 0.3, 0.3 * (k - 2), false);
  puddles(b, [[-157.6, 60.5, -151, 71.5], [-150, 66.5, -144, 70]]);
  c.b.light({ x: gx + 0.8, y: 4.0, z: 66, color: 0xff6040, intensity: 5, distance: 8, mode: 'blink', pool: 0, glow: 0.4, tag: 'sea-gate' });
  // the ferry notice the first photograph is pinned to (facing the street)
  const ph = PHOTOS[0]!;
  const nz = ph.z - 1.9;
  for (const s of [-1, 1]) sol(c, H.woodDark, ph.x + s * 1.2, S, nz, 0.12, 2.6, 0.12, 'notice');
  bx(b, H.woodDark, ph.x, 1.0, nz, 2.6, 1.4, 0.08);
  for (const [x, y, w, h, m] of [[-0.7, 1.75, 0.7, 0.9, K.paper], [0.15, 1.85, 0.8, 0.6, K.cream], [0.8, 1.45, 0.5, 0.7, K.paper], [-0.1, 1.3, 0.6, 0.45, K.pink]] as const)
    box(b, m, ph.x + x, y, nz + 0.05, w, h, 0.02, 0, false);
  box(b, K.post, ph.x - 0.7, 2.1, nz + 0.065, 0.7, 0.14, 0.01, 0, false);
  slab(b, H.rust, ph.x, 2.62, nz + 0.1, 3.0, 0.05, 0.6, 0.2, 0, 0, false);
}

/** The north side of Shio-furi: the upturned boat, the fishermen's shed, net poles, the houses against Block 30's wall, the ice store. */
function shioNorth(c: Ctx): void {
  const { b } = c;
  // an upturned boat on two trestles
  for (const x of [-145, -141]) sol(c, H.wood, x, S, 57.5, 0.3, 0.85, 1.6, 'trestle', false);
  const boat = new THREE.Mesh(hullGeo(6.4, 1.9, 1.8, 0.7), H.woodDark);
  boat.rotation.z = Math.PI;
  boat.position.set(-143, 0.88, 57.5);
  b.add(boat, { cast: false });
  bx(b, H.white, -143, 0.86, 57.5, 5.2, 0.06, 1.95);
  solid(c, -143, 57.5, 6.4, 1.9, 1.6, 'boat', { shots: false });
  for (let k = 0; k < 2; k++) slab(b, H.woodPale, -146.6 + k * 0.4, 1.1, 59.1, 0.1, 2.4, 0.18, 0.1, 0, 0.35, false);

  // the fishermen's shed (the harpoon head lies on a net at its door)
  const RS = { x0: -128, z0: 57, x1: -114, z1: 64 };
  room(c, RS, S, 3, { doors: [{ side: 'S', at: 7, w: 2.4 }], wall: H.wood, roof: null, tag: 'fish-shed' });
  floor(b, K.boards, RS, S);
  for (let x = RS.x0 + 0.5; x < RS.x1 - 0.2; x += 0.8) for (const z of [RS.z0 - 0.17, RS.z1 + 0.17]) if (Math.abs(x + 121) > 1.3 || z < 60) box(b, H.woodDark, x, 1.5, z, 0.08, 3.0, 0.03, 0, false);
  for (let z = RS.z0 + 0.5; z < RS.z1 - 0.2; z += 0.8) for (const x of [RS.x0 - 0.17, RS.x1 + 0.17]) box(b, H.woodDark, x, 1.5, z, 0.03, 3.0, 0.08, 0, false);
  for (const s2 of [-1, 1]) slab(b, H.rust, -121, 3.32, 60.5 + s2 * 1.78, 14.7, 0.06, 3.75, s2 * 0.17, 0, 0, false);
  bx(b, K.rustDark, -121, 3.58, 60.5, 14.7, 0.1, 0.24);
  for (const x of [RS.x0, RS.x1]) tri(b, H.wood, x, 3.0, 60.5, 7.0, 0.62, Math.PI / 2);
  c.b.collide({ x: -121, z: 60.5, hx: 7, hz: 3.5, y0: 3.0, y1: 3.2, blocksMove: false, blocksShots: true, mapKind: 'none', tag: 'roof' });
  for (const x of [-126, -116]) pane(b, x, 1.0, RS.z1, 1.4, 0.9, true, K.pane);
  sol(c, H.wood, -124, S, 57.55, 4, 0.85, 0.8, 'shed-bench', false);
  for (let k = 0; k < 4; k++) cy(b, H.iron, -125.5 + k * 0.6, 0.85, 57.5, 0.06, 0.0, 0.32, 6);
  bx(b, H.iron, -122.6, 0.85, 57.6, 0.3, 0.18, 0.2);
  for (let k = 0; k < 3; k++) {
    bar(b, H.woodPale, [-114.35, 0.05, 58.6 + k * 0.5], [-114.35, 2.9, 58.4 + k * 0.5], 0.06);
    cy(b, H.iron, -114.35, 2.9, 58.4 + k * 0.5, 0.06, 0.0, 0.35, 6);
  }
  for (let k = 0; k < 2; k++) slab(b, H.woodPale, -114.4, 1.4, 61.4 + k * 0.4, 0.06, 2.6, 0.16, 0, 0, 0.08, false);
  const net = (x: number, z: number, r: number): void => cy(b, K.green, x, S, z, r, r * 0.6, 0.55, 9);
  net(-127, 62.6, 0.9);
  net(-126.2, 63.2, 0.7);
  solid(c, -126.8, 62.8, 2.2, 1.8, 0.6, 'nets', { shots: false });
  for (let k = 0; k < 5; k++) ball(b, new THREE.MeshStandardMaterial({ color: 0x3e7a62, roughness: 0.15, metalness: 0.3 }), -127.4 + k * 0.35, 0.75, 62.7 + (k % 2) * 0.3, 0.16, 1, 8);
  sol(c, H.wood, -116, S, 57.6, 1.0, 0.5, 0.7, 'fish-box', false);
  bx(b, H.wood, -116, 0.5, 57.6, 1.0, 0.5, 0.7);
  cy(b, H.iron, -120, S, 57.6, 0.3, 0.3, 0.8, 10);
  bx(b, H.iron, -120, 0.8, 57.4, 0.1, 2.3, 0.1);
  for (const x of [-118.6, -118.2]) cy(b, K.black, x, S, 63.5, 0.1, 0.1, 0.45, 8);
  box(b, K.yellow, -127.75, 1.5, 59.8, 0.04, 1.1, 0.7, 0, false);
  calendar(b, RS.x0 + 0.15, 1.7, 61, 'E');
  c.b.light({ x: -121, y: 2.6, z: 60.5, color: 0xffc070, intensity: 6, distance: 8, mode: 'flicker', pool: 0, glow: 0, tag: 'fish-shed' });
  const part = UMIBOZU.parts[0]!;
  box(b, K.green, part.x, S + 0.02, part.z, 1.6, 0.02, 1.1, 0.2, false);
  // net poles beside it, nets hung out to dry
  for (const x of [-112, -109, -106]) sol(c, H.woodPale, x, S, 59, 0.12, 2.4, 0.12, 'net-pole');
  bar(b, K.straw, [-112, 2.3, 59], [-106, 2.3, 59], 0.06);
  for (const x of [-110.5, -107.5]) box(b, K.green, x, 1.45, 59, 2.6, 1.6, 0.02, 0, false);

  // a fisherman's house of 1974 against Block 30's wall
  const RA = { x0: -102, z0: 54.4, x1: -90, z1: 61.5 };
  room(c, RA, S, 3, { doors: [{ side: 'S', at: 6, w: 1.8 }], wall: H.plaster, roof: H.rust, tag: 'house' });
  room1974(c, { x0: RA.x0 + 0.15, z0: RA.z0 + 0.15, x1: RA.x1 - 0.15, z1: RA.z1 - 0.15 }, S, 'N', { light: true, seed: 5 });
  for (const x of [-99.6, -92.4]) pane(b, x, 1.0, RA.z1, 1.6, 1.0, true);
  slab(b, H.rust, -96, 2.6, 62.3, 3.0, 0.05, 1.7, 0.25, 0, 0, false);
  for (const x of [-97.4, -94.6]) bx(b, H.woodDark, x, S, 63.0, 0.08, 2.4, 0.08);
  for (const [x, z] of [[-100.6, 62.1], [-91.4, 62.1]] as const) cy(b, K.awnRed, x, S, z, 0.22, 0.28, 0.35, 10);
  for (const [x, z] of [[-100.6, 62.1], [-91.4, 62.1]] as const) cy(b, K.moss, x, 0.35, z, 0.25, 0.05, 0.5, 6);
  box(b, H.iron, -90.2, 1.5, RA.z1 + 0.18, 0.1, 3.0, 0.1, 0, false);
  bicycle(b, -102.6, S, 58, Math.PI / 2, K.awnRed);

  // the noodle shop, fallen in: the front wall down to a stub, the front half of the roof lying inside it
  const x0 = -77;
  const x1 = -64;
  sol(c, H.plaster, (x0 + x1) / 2, S, 54.55, x1 - x0, 3.0, 0.3, 'ruin');
  for (const x of [x0, x1]) sol(c, H.plaster, x, S, 58, 0.3, 3.0, 6.9, 'ruin');
  bx(b, H.plaster, x0, 3.0, 56.2, 0.3, 0.6, 3.6);
  sol(c, H.plaster, -73.25, S, 61.4, 7.5, 0.9, 0.3, 'ruin', false);
  sol(c, H.plaster, -65.45, S, 61.4, 2.9, 0.6, 0.3, 'ruin', false);
  bx(b, H.plaster, -65.45, 0.6, 61.4, 2.9, 1.4, 0.3);
  bx(b, H.concreteDark, (x0 + x1) / 2, 3.0, 56.4, x1 - x0 + 0.3, 0.2, 4.2);
  c.b.collide({ x: (x0 + x1) / 2, z: 56.4, hx: (x1 - x0) / 2, hz: 2.1, y0: 3.0, y1: 3.2, blocksMove: false, blocksShots: true, mapKind: 'none', tag: 'roof' });
  slab(b, H.concreteDark, -73.6, 1.55, 59.9, 6.4, 0.2, 3.9, 0.85, 0, 0.06, false);
  solid(c, -73.6, 60.4, 6.4, 1.6, 1.4, 'ruin-slab');
  for (const [x, z, s, r] of [[-71.2, 62.4, 0.8, 0.4], [-69.6, 62.9, 0.6, 1.2], [-75.8, 62.2, 0.7, 2.0], [-66.4, 62.3, 0.5, 0.7]] as const) bx(b, H.plaster, x, S, z, s, s * 0.5, s * 0.7, r);
  // what was left: the counter, stools, the rice cooker, stacked bowls, a blank sign fallen, broken crockery
  sol(c, H.wood, -65.0, S, 57.8, 0.7, 0.95, 4.6, 'noodle-counter', false);
  for (let k = 0; k < 4; k++) cy(b, H.woodDark, -66.0, S, 56.2 + k * 1.0, 0.17, 0.17, 0.45, 8);
  cy(b, K.cream, -65.0, 0.95, 56.4, 0.2, 0.2, 0.3, 10);
  for (let k = 0; k < 5; k++) cy(b, K.paper, -65.0, 0.95 + k * 0.05, 58.2, 0.09, 0.07, 0.05, 8);
  slab(b, K.cream, -68.5, 0.2, 58.4, 1.8, 0.06, 0.6, 0.15, 0.7, 0.2, false);
  for (let k = 0; k < 6; k++) bx(b, K.paper, -68 + (k % 3) * 0.4, S, 59.6 + Math.floor(k / 3) * 0.3, 0.12, 0.04, 0.08, k);
  calendar(b, x1 - 0.15, 1.7, 56.5, 'W');
  bar(b, H.woodDark, [-76.8, 2.9, 57.6], [-70.4, 0.15, 59.2], 0.18);
  bar(b, H.woodDark, [-64.3, 2.8, 58.4], [-69.5, 0.2, 60.6], 0.16);
  for (let k = 0; k < 5; k++) bar(b, K.rustDark, [-76.4 + k * 1.3, 3.0, 58.5], [-76.2 + k * 1.3, 3.5, 59.4 + (k % 2) * 0.4], 0.03);
  slab(b, H.woodDark, -68.8, 0.05, 57.2, 1.0, 0.04, 1.8, 0, 0.5, 0, false);
  slab(b, K.paper, -68.8, 0.08, 57.2, 0.85, 0.02, 1.65, 0, 0.5, 0, false);
  cy(b, K.paper, -67.6, 2.2, 56.3, 0.3, 0.12, 0.22, 10);
  bar(b, H.iron, [-67.6, 2.42, 56.3], [-67.4, 3.0, 56.1], 0.015);

  // the ice store: blocks stacked at the back, sawdust, tongs on the wall, a handcart, fish boxes
  const RI = { x0: -60, z0: 54.4, x1: -47, z1: 61 };
  room(c, RI, S, 3.2, { doors: [{ side: 'S', at: 6.5, w: 2.0 }], wall: H.concrete, roof: H.concreteDark, tag: 'ice-store' });
  floor(b, H.concreteDark, RI, S);
  const ice = new THREE.MeshStandardMaterial({ color: 0xbcd4d8, roughness: 0.15, metalness: 0.3 });
  for (let k = 0; k < 12; k++) bx(b, ice, -58.6 + (k % 6) * 0.95, Math.floor(k / 6) * 0.55, 55.2, 0.85, 0.5, 0.6);
  solid(c, -56.2, 55.2, 5.8, 0.7, 1.1, 'ice');
  cy(b, K.sand, -49, S, 56, 1.2, 0.3, 0.6, 9);
  solid(c, -49, 56, 2.0, 2.0, 0.6, 'sawdust', { shots: false });
  for (let k = 0; k < 2; k++) slab(b, H.iron, -59.82, 1.6, 57.6 + k * 0.4, 0.04, 0.8, 0.06, 0, 0, 0.2, false);
  sol(c, H.wood, -58.6, S, 59.6, 1.2, 0.5, 0.8, 'fish-box', false);
  bx(b, H.wood, -58.6, 0.5, 59.6, 1.1, 0.45, 0.75);
  pane(b, -50.5, 1.4, RI.z1, 1.2, 0.7, true, K.pane);
  box(b, K.shutter, -53.5, 2.75, RI.z1 + 0.2, 2.2, 0.26, 0.24, 0, false);
  // a red telephone on its pillar by the wall
  sol(c, H.concrete, -43, S, 55.0, 0.5, 1.1, 0.4, 'phone');
  bx(b, K.post, -43, 1.1, 55.0, 0.36, 0.28, 0.3);
  bx(b, K.black, -43, 1.38, 55.0, 0.32, 0.06, 0.12);
  slab(b, H.rust, -43, 2.2, 55.2, 1.0, 0.05, 0.8, 0.25, 0, 0, false);
  box(b, H.iron, -43.4, 1.1, 54.18, 0.06, 2.2, 0.06, 0, false);
}

/** Shio-furi's street: lamps, the sea over the wall in sheets, the sand drift, bicycles, a fallen bamboo pole, crates. */
function shioStreet(c: Ctx): void {
  const { b } = c;
  for (const [x, mode] of [[-134, 'steady'], [-96, 'flicker'], [-58, 'fail']] as const) lamp(c, x, S, 74.2, { mode, tag: 'shiofuri' });
  for (const [x, w] of [[-146, 3.4], [-122, 4.2], [-104, 3.0], [-88, 3.6], [-50, 4.0]] as const) overtop(b, x, w);
  // the wet strip the whole length of the wall's foot, drains in it
  box(b, K.puddle, -99, S + 0.013, 75.0, 118, 0.02, 1.0, 0, false);
  for (let x = -154; x < -42; x += 12) box(b, H.iron, x, S + 0.02, 75.1, 1.0, 0.03, 0.5, 0, false);
  puddles(b, [[-140, 64, -135, 66.5], [-118, 68, -112, 70.4], [-98, 64, -93, 66], [-84, 66, -78, 68.4], [-62, 64.5, -56, 66.4], [-48, 68, -43, 70]]);
  // the sand the sea has piled against the wall (something is buried in it)
  box(b, K.sand, -70, S + 0.06, 74.4, 14, 0.12, 2.6, 0, false);
  slab(b, K.sand, -70.6, 0.18, 75.0, 9, 0.3, 1.6, -0.12, 0, 0, false);
  slab(b, K.sand, -66.5, 0.12, 73.5, 4, 0.2, 1.6, 0.06, 0.4, 0, false);
  slab(b, H.wood, -67.4, 0.1, 74.9, 0.6, 0.4, 0.5, 0.3, 0.5, 0.4, false);
  for (let k = 0; k < 4; k++) slab(b, K.moss, -74 + k * 2.2, 0.2, 74.2 + (k % 2) * 0.6, 1.4, 0.03, 0.12, 0, k, 0, false);
  // racks of fish hung out to dry down the middle of the street, gaps between them to pass
  for (const x of [-136, -108, -92, -62, -48]) dryRack(c, x, 66.8);
  // bicycles, a fallen bamboo pole with washing, crates, drums
  bicycle(b, -88.6, S, 55.6, Math.PI / 2, K.green);
  for (const [a, e] of [[[-133.4, 4.5, 74.2], [-128, 3.0, 64.2]], [[-95.4, 4.5, 74.2], [-96, 3.0, 61.7]], [[-57.4, 4.5, 74.2], [-55, 3.2, 61.2]], [[-133.4, 4.4, 74.2], [-95.4, 4.4, 74.2]], [[-95.4, 4.4, 74.2], [-57.4, 4.4, 74.2]]] as const)
    bar(b, H.iron, [a[0], a[1], a[2]], [e[0], e[1], e[2]], 0.025);
  for (const [x, z, n] of [[-130.6, 62.6, 3], [-129.5, 63.0, 2]] as const) {
    sol(c, H.wood, x, S, z, 1.0, 0.45 * n, 0.7, 'fish-boxes', false);
    for (let k = 1; k < n; k++) box(b, H.woodDark, x, k * 0.45, z, 1.02, 0.03, 0.72, 0, false);
  }
  sol(c, K.navy, -42.8, S, 63.6, 2.2, 0.9, 1.4, 'tarp', false);
  slab(b, K.navy, -42.8, 0.92, 63.6, 2.4, 0.06, 1.6, 0.05, 0.1, 0.04, false);
  for (const s2 of [-1, 1]) bar(b, K.straw, [-42.8 + s2 * 1.1, 0.95, 62.8], [-42.8 + s2 * 1.4, 0.0, 62.4], 0.03);
  bicycle(b, -61.2, S, 61.9, 0.02);
  bar(b, K.straw, [-110, 0.06, 63.8], [-104.2, 0.06, 66.8], 0.07);
  bar(b, K.straw, [-109, 0.5, 63.2], [-104.6, 0.05, 62.2], 0.06);
  for (let k = 0; k < 3; k++) slab(b, [K.paper, K.awnBlue, K.cream][k]!, -108.6 + k * 1.6, 0.04, 64.6 + k * 0.8, 0.8, 0.02, 0.6, 0, k, 0, false);
  for (const [x, z] of [[-139.5, 61.2], [-138.6, 61.2]] as const) sol(c, H.wood, x, S, z, 0.9, 0.9, 0.9, 'crate', false);
  bx(b, H.wood, -139, 0.9, 61.2, 0.85, 0.8, 0.85, 0.3);
  for (const [x, z] of [[-86.6, 61.4], [-46.4, 62.4], [-112.6, 62.2]] as const) {
    cy(b, H.rust, x, S, z, 0.3, 0.3, 0.9, 10);
    solid(c, x, z, 0.6, 0.6, 0.9, 'drum', { shots: false, surface: 'metal' });
  }
}

