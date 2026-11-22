/**
 * HIRASAKA: THE HELL STAIRS, THE FAN HOUSE AND THE SUMMIT (place group 'summit', rect x -40..70, z -76..14).
 * The Hell Stairs' landing is on its own pad (y 10.8, x -40..10, z -24..14); the fan house's terrace at the head of
 * the Stairs of Life is the terrace pad (y 7.2, x 10..70, z -24..14); the summit rock is y 18 (z -76..-24).
 * Spots: `places.ts` JOBS.air (shutter: the frame's obstacle collider sits in the fan house's south doorway; fan),
 * ROCK (the Chibiki-iwa's rest, seal, winches, turn), SHRINES[3], TOOLS.tachi, PHOTOS[3] (manager's house), SIDES
 * drums, CLIMB_MARKS life / landing / rock.
 *
 * The frame built: the pads, the parapets, the Hell Stairs' two flights (x -16: z 14 up to the landing, z -24 up to the
 * summit), the flight from the fan terrace up to the landing (x 10, z 0), the Stairs of Life's head (x 70, z -6).
 *
 * What stands here:
 *  - THE HELL STAIRS' LANDING: the processional from Market Lane's flight to the last flight, between stone lanterns,
 *    a stone torii at the last flight's foot; the last flight climbs in a cutting between dressed-stone walls with
 *    lamps on their heads and iron handrails, to the stone at the top. West of the way, the ruin of the Senpukuji
 *    temple (its roof come down at one corner, the altar inside) and its bell under a little roof; east, the drum shed
 *    (the side story's drums) and a collapsed house you can see into.
 *  - THE FAN TERRACE at the head of the Stairs of Life: the brick fan house (the great fan in its casing, the motor,
 *    the starter; its rusted shutter is the frame's collider in the south doorway), its slanted chimney, a timber gate
 *    at the head of the Stairs of Life, the mine office, coal tubs on a spur of rail, a timber stack.
 *  - THE SUMMIT: the Chibiki-iwa's cradle (a crescent of rock on its east side, a worn groove across to the stair head)
 *    and its three chain winches; the shrine (stone torii, the collapsed worship hall, a plinth for the offering box,
 *    the concrete honden behind), the manager's two-storey wooden house with its engawa and pond garden, the short
 *    white lighthouse with its keeper's hut, salt-bent pines, a row of jizō on the west cliff.
 *
 * Everything here stands on a raised pad: every collider is from y 0 (the island's rule).
 */
import * as THREE from 'three';
import type { Ctx } from './util';
import type { LevelBuilder } from '../builder';
import { H, box as kbox, cyl as kcyl, ground, solid } from './hirasakaKit';
import { gableRoof } from './hirasakaBuilds';
import { crag, dressMats } from './hirasakaDress';
import { M, beam, clutter, fence, flat, lamp, lampPost, reseed, rnd, room, roofCollider, thing, wallLine, windows } from './hirasakaSchool';
import { FLIGHTS, HIRASAKA, ROCK, SHRINES, TOOLS, Y, flightRun } from '../../hirasaka/places';

export const SUMMIT_RECT = { x0: -40, z0: -76, x1: 70, z1: 14 };

// the kit's box and cylinder, casting no shadow unless asked (a shadow caster is a batch of its own)
const box = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0, cast = false): THREE.Mesh => kbox(b, mat, x, y, z, sx, sy, sz, rot, cast);
const cyl = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 8): void => kcyl(b, mat, x, y, z, r0, r1, h, seg, false);

const L = Y.landing;
const TT = Y.terrace;
const S = Y.summit;

export function buildSummit(c: Ctx): void {
  reseed(1801);
  buildHellStairs(c);
  buildLanding(c);
  buildFanTerrace(c);
  buildRockHead(c);
  buildShrine(c);
  buildManagerHouse(c);
  buildLighthouse(c);
  buildSummitGrounds(c);
}

// ---------------------------------------------------------------------------------------------------------------------
// small pieces of this file
// ---------------------------------------------------------------------------------------------------------------------

/** A stone lantern (tōrō): plinth, post, fire box (lit when `lit`), cap. Collides. */
function toro(c: Ctx, x: number, y: number, z: number, lit: boolean): void {
  const { b } = c;
  box(b, H.concreteDark, x, y + 0.2, z, 0.8, 0.4, 0.8);
  cyl(b, H.concrete, x, y + 0.4, z, 0.16, 0.2, 0.8, 8);
  box(b, H.concrete, x, y + 1.25, z, 0.6, 0.12, 0.6);
  box(b, lit ? H.lamp : M.dark, x, y + 1.5, z, 0.42, 0.38, 0.42, 0, false);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.4, 4), H.concrete);
  cap.position.set(x, y + 1.9, z);
  cap.rotation.y = Math.PI / 4;
  b.add(cap);
  box(b, H.concrete, x, y + 2.15, z, 0.14, 0.14, 0.14, 0, false);
  solid(c, x, z, 0.8, 0.8, y + 2.2, 'toro', { shots: false });
}

/** A stone torii (grey, weathered), its posts colliding. `alongX`: the beams run along x. */
function stoneTorii(c: Ctx, x: number, y: number, z: number, span: number, h: number, alongX = true): void {
  const { b } = c;
  for (const s of [-1, 1]) {
    const px = alongX ? x + (s * span) / 2 : x;
    const pz = alongX ? z : z + (s * span) / 2;
    cyl(b, H.concrete, px, y, pz, 0.28, 0.34, h, 10);
    box(b, H.concreteDark, px, y + 0.2, pz, 0.85, 0.4, 0.85);
    solid(c, px, pz, 0.7, 0.7, y + h, 'torii', { kind: 'prop' });
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(alongX ? span + 1.6 : 0.5, 0.45, alongX ? 0.5 : span + 1.6), H.concrete);
  top.position.set(x, y + h + 0.2, z);
  b.add(top);
  box(b, H.concrete, x, y + h - 0.7, z, alongX ? span + 0.6 : 0.34, 0.3, alongX ? 0.34 : span + 0.6);
  // the straw rope and its paper zigzags
  box(b, H.woodPale, x, y + h - 1.05, z, alongX ? span : 0.18, 0.18, alongX ? 0.18 : span, 0, false);
  for (let k = 0; k < 4; k++) {
    const at = -span / 2 + (span * (k + 0.5)) / 4;
    box(b, M.paper, alongX ? x + at : x, y + h - 1.4, alongX ? z : z + at, alongX ? 0.12 : 0.02, 0.5, alongX ? 0.02 : 0.12, 0, false);
  }
}

/** A salt-bent pine: a leaning trunk, flat layered crowns. Collides at the trunk. */
function pine(c: Ctx, x: number, y: number, z: number, h: number, lean: number): void {
  const { b } = c;
  const tx = x + Math.cos(lean) * h * 0.25;
  const tz = z + Math.sin(lean) * h * 0.25;
  beam(b, H.woodDark, x, y, z, tx, y + h * 0.8, tz, 0.3);
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(h * (0.32 - k * 0.07), h * (0.36 - k * 0.07), 0.6, 7), M.leaf);
    g.position.set(tx + (rnd() - 0.5) * 1.4, y + h * (0.62 + k * 0.16), tz + (rnd() - 0.5) * 1.4);
    g.rotation.y = rnd() * 3;
    b.add(g);
  }
  solid(c, x, z, 0.4, 0.4, y + h * 0.7, 'pine', { surface: 'wood' });
}

/** A clump of weeds or a low bush (no collider: you walk through it). */
function weeds(b: LevelBuilder, x: number, y: number, z: number, s = 1): void {
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Mesh(new THREE.IcosahedronGeometry((0.3 + rnd() * 0.25) * s, 0), M.leaf);
    g.position.set(x + (rnd() - 0.5) * 0.9 * s, y + 0.18 * s, z + (rnd() - 0.5) * 0.6 * s);
    g.scale.y = 0.6;
    b.add(g, { cast: false });
  }
}

/** A hip roof: a curved gable along x over (w x d), lifted to `y`, with low hip ends. */
function hipRoof(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, w: number, d: number, rise: number): void {
  const g = new THREE.Mesh(gableRoof(w, d / 2, rise, 0.22, 0.6), mat);
  g.position.set(x, y, z);
  b.add(g);
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, d * 0.7), mat);
    end.position.set(x + (s * (w + 0.8)) / 2, y + rise * 0.35, z);
    end.rotation.z = s * -0.5;
    b.add(end);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the Hell Stairs: the cutting the last flight climbs, its lamps and handrails
// ---------------------------------------------------------------------------------------------------------------------

function buildHellStairs(c: Ctx): void {
  const { b } = c;
  const f = FLIGHTS.find((q) => q.id === 'hell2')!;
  const run = flightRun(f);
  const foot = f.z + run; // z -13.2
  const inW = f.x - f.w / 2 - 0.36; // the cheeks' outer faces
  const inE = f.x + f.w / 2 + 0.36;
  const top = S + 1.4;
  // the two walls of dressed stone, from the landing up past the summit's edge, battered out at the foot
  for (const [x0, x1] of [
    [inW - 2.6, inW],
    [inE, inE + 2.6],
  ] as const) {
    const cx = (x0 + x1) / 2;
    box(b, H.concrete, cx, (L + top) / 2, (f.z + foot) / 2, x1 - x0, top - L, run, 0, false);
    solid(c, cx, (f.z + foot) / 2, x1 - x0, run, top, 'hell-wall', { kind: 'wall' });
    // courses of stone: a band every 0.9 m, staggered joints
    for (let y = L + 0.9; y < top; y += 0.9) {
      box(b, H.concreteDark, cx, y, (f.z + foot) / 2, x1 - x0 + 0.06, 0.08, run + 0.06, 0, false);
    }
    for (let k = 0; k < 10; k++) {
      const z = f.z + 0.6 + rnd() * (run - 1.2);
      const y = L + 0.5 + Math.floor(rnd() * 8) * 0.9;
      box(b, H.stain, cx, y + 0.45, z, x1 - x0 + 0.08, 0.82, 0.05, 0, false);
    }
    // the battered foot: a buttress where the wall meets the landing
    box(b, H.concreteDark, cx, L + 1.6, foot + 0.7, x1 - x0 + 0.4, 3.2, 1.4);
    solid(c, cx, foot + 0.7, x1 - x0 + 0.4, 1.4, L + 3.2, 'hell-buttress', { kind: 'wall' });
    // a coping on the wall's head
    box(b, H.concrete, cx, top + 0.1, (f.z + foot) / 2, x1 - x0 + 0.3, 0.2, run + 0.3, 0, false);
  }
  // the iron handrails down both cheeks, on posts, rising with the steps
  for (const x of [f.x - f.w / 2 + 0.12, f.x + f.w / 2 - 0.12]) {
    beam(b, H.rust, x, L + 0.95, foot, x, S + 0.95, f.z, 0.06);
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const z = foot + (f.z - foot) * t;
      const y = L + (S - L) * t;
      box(b, H.rust, x, y + 0.5, z, 0.05, 1, 0.05, 0, false);
    }
  }
  // the lamps on the walls' heads (seen from Market Lane: a line of lights up to the stone)
  for (const [x, z] of [
    [inW - 1.3, foot - 2.2],
    [inE + 1.3, foot - 2.2],
    [inW - 1.3, f.z + 2.2],
    [inE + 1.3, f.z + 2.2],
  ] as const) {
    box(b, H.iron, x, top + 1.3, z, 0.1, 2.6, 0.1, 0, false);
    beam(b, H.iron, x, top + 2.5, z, x + (x < f.x ? 0.9 : -0.9), top + 2.6, z, 0.06);
    box(b, H.lamp, x + (x < f.x ? 0.9 : -0.9), top + 2.45, z, 0.3, 0.14, 0.3, 0, false);
  }
  // the bracket lamps inside the cutting, on the cheeks over the steps: these light the climb
  for (const [x, z] of [
    [inW + 0.42, foot - 2.4],
    [inE - 0.42, f.z + 3],
  ] as const) {
    const sy = L + ((S - L) * (foot - z)) / run;
    box(b, H.iron, x, sy + 2.6, z, 0.12, 0.5, 0.12, 0, false);
    box(b, H.lamp, x + (x < f.x ? 0.12 : -0.12), sy + 2.35, z, 0.26, 0.2, 0.26, 0, false);
    c.b.light({ x: x + (x < f.x ? 0.3 : -0.3), y: sy + 2.2, z, color: 0xffa860, intensity: 18, distance: 13, mode: 'steady', pool: 2.8, glow: 0.45, tag: 'hell-stairs' });
  }
  // the summit's rock face either side of the cutting (crags, and a thin collider along the face)
  const D = dressMats(c.mats);
  for (const [x0, x1] of [
    [-39, inW - 2.6],
    [inE + 2.6, 9.5],
  ] as const) {
    const n = Math.max(1, Math.round((x1 - x0) / 5));
    for (let k = 0; k < n; k++) {
      const x = x0 + ((x1 - x0) * (k + 0.5)) / n;
      crag(b, D.rock, { x, y: L + 1.5, z: -24.2, sx: 3 + rnd(), sy: 3.6 + rnd() * 0.8, sz: 1.1, seed: 1800 + k + Math.round(x0), detail: 1 });
    }
    solid(c, (x0 + x1) / 2, -23.7, x1 - x0, 1, S - 1, 'rock-face', { kind: 'wall' });
  }
  for (let k = 0; k < 11; k++) {
    const x = 12 + k * 5.2;
    crag(b, D.rock, { x, y: TT + 1.5, z: -24.2, sx: 3 + rnd(), sy: 5.6 + rnd() * 1.2, sz: 1.1, seed: 1830 + k, detail: 1 });
  }
  solid(c, 40, -23.7, 59, 1, S - 1, 'rock-face', { kind: 'wall' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the landing: the processional, the temple ruin, the bell, the drum shed, a collapsed house
// ---------------------------------------------------------------------------------------------------------------------

function buildLanding(c: Ctx): void {
  const { b } = c;
  const y = L;
  // the processional way: worn paving between stone lanterns, the torii at the last flight's foot
  ground(b, M.wet, -19, -13, -13, 14, y);
  for (const z of [8, 1.5, -5]) {
    toro(c, -20.6, y, z, z !== 1.5);
    toro(c, -11.4, y, z, z === 1.5);
  }
  stoneTorii(c, -16, y, -10.4, 7, 4.6);
  lampPost(c, -24, y, -11, { tag: 'landing' });
  lampPost(c, 4.6, y, 2.8, { mode: 'flicker', tag: 'landing' });
  // the Senpukuji temple: a wooden hall facing the way, its roof come down at the south-east corner
  const tr = { x0: -34, z0: 0, x1: -23, z1: 11 };
  room(c, tr, y, 3.4, 0, { doors: [{ side: 'E', at: 5, w: 3 }], wall: H.woodDark, roof: null, tag: 'temple' });
  ground(b, H.woodPale, tr.x0 + 0.2, tr.z0 + 0.2, tr.x1 - 0.2, tr.z1 - 0.2, y);
  for (const [px, pz] of [
    [tr.x0, tr.z0],
    [tr.x1, tr.z0],
    [tr.x0, tr.z1],
    [tr.x1, tr.z1],
    [tr.x1, 3.3],
    [tr.x1, 6.7],
  ] as const)
    box(b, H.woodDark, px, y + 1.7, pz, 0.34, 3.4, 0.34);
  const roof = new THREE.Mesh(gableRoof(13.4, 7.2, 3, 0.28, 0.8), H.concreteDark);
  roof.position.set((tr.x0 + tr.x1) / 2, y + 3.45, (tr.z0 + tr.z1) / 2);
  roof.rotation.set(0.06, 0, -0.08);
  b.add(roof);
  roofCollider(c, tr, y + 3.4);
  // the fallen corner: broken rafters and roof tiles heaped against the south-east
  for (let k = 0; k < 6; k++) beam(b, H.woodDark, tr.x1 - 0.5 - rnd() * 2, y, tr.z1 + 0.6 + rnd() * 1.4, tr.x1 - 1.5 - rnd() * 3, y + 1.5 + rnd() * 1.6, tr.z1 - 1 - rnd() * 2, 0.18);
  for (let k = 0; k < 5; k++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1), H.concreteDark);
    t.position.set(tr.x1 - 1 - rnd() * 3, y + 0.2 + rnd() * 0.5, tr.z1 + 0.8 + rnd());
    t.rotation.set(rnd() - 0.5, rnd() * 3, rnd() - 0.5);
    b.add(t);
  }
  solid(c, tr.x1 - 2, tr.z1 + 1.3, 4.4, 2, y + 1.2, 'temple-fall', { shots: false });
  // inside: the altar, the seated figure, candles, a wooden fish drum, cushions
  thing(c, H.woodDark, tr.x0 + 1.2, y, 5.5, 1.6, 0.9, 4, 0, 'altar');
  box(b, M.red, tr.x0 + 1.2, y + 0.92, 5.5, 1.5, 0.04, 3.8, 0, false);
  cyl(b, M.gold, tr.x0 + 1.1, y + 0.9, 5.5, 0.42, 0.5, 0.5, 10);
  cyl(b, M.gold, tr.x0 + 1.1, y + 1.4, 5.5, 0.26, 0.32, 0.6, 10);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M.gold);
  head.position.set(tr.x0 + 1.1, y + 2.15, 5.5);
  b.add(head, { cast: false });
  for (const dz of [-1.2, 1.2]) box(b, H.lamp, tr.x0 + 1.7, y + 1.05, 5.5 + dz, 0.06, 0.2, 0.06, 0, false);
  const fish = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M.red);
  fish.position.set(tr.x0 + 3, y + 0.25, 4.2);
  fish.scale.set(1, 0.8, 1.2);
  b.add(fish, { cast: false });
  for (let k = 0; k < 4; k++) box(b, M.pink, tr.x0 + 3.2 + (k % 2) * 1.2, y + 0.06, 6 + Math.floor(k / 2) * 1.2, 0.6, 0.1, 0.6, rnd(), false);
  beam(b, H.woodDark, tr.x0 + 2, y, tr.z0 + 1.5, tr.x1 - 3, y + 3.2, tr.z0 + 3.5, 0.22); // a fallen tie beam inside
  c.b.light({ x: tr.x0 + 1.8, y: y + 1.6, z: 5.5, color: 0xffa040, intensity: 8, distance: 8, mode: 'flicker', pool: 2, glow: 0.3, tag: 'temple' });
  // the temple bell under its little roof
  const bx = -30;
  const bz = -7;
  for (const [px, pz] of [
    [-1.4, -1.4],
    [1.4, -1.4],
    [-1.4, 1.4],
    [1.4, 1.4],
  ] as const) {
    box(b, H.woodDark, bx + px, y + 1.8, bz + pz, 0.22, 3.6, 0.22);
    solid(c, bx + px, bz + pz, 0.24, 0.24, y + 3.6, 'bell-post', { surface: 'wood' });
  }
  box(b, H.concreteDark, bx, y + 0.2, bz, 3.6, 0.4, 3.6, 0, false);
  const broof = new THREE.Mesh(gableRoof(4.2, 2.4, 1.1, 0.16, 0.8), H.concreteDark);
  broof.position.set(bx, y + 3.65, bz);
  b.add(broof);
  box(b, H.woodDark, bx, y + 3.5, bz, 3.2, 0.2, 0.2, 0, false);
  cyl(b, M.copper, bx, y + 1.6, bz, 0.55, 0.62, 1.7, 14);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.copper);
  bell.position.set(bx, y + 3.3, bz);
  b.add(bell, { cast: false });
  beam(b, H.wood, bx + 0.7, y + 2.2, bz - 1.2, bx + 0.7, y + 2.2, bz + 1.2, 0.18); // the striking log
  // the drum shed (the side story: the drums for Mio): four posts, a roof, the big drum on its stand
  for (const [px, pz] of [
    [-1, -17.5],
    [5, -17.5],
    [-1, -12.5],
    [5, -12.5],
  ] as const) {
    box(b, H.wood, px, y + 1.4, pz, 0.2, 2.8, 0.2);
    solid(c, px, pz, 0.22, 0.22, y + 2.8, 'drum-shed', { surface: 'wood' });
  }
  const droof = new THREE.Mesh(gableRoof(6.8, 3.2, 1.2, 0.16, 0.6), H.rust);
  droof.position.set(2, y + 2.85, -15);
  b.add(droof);
  thing(c, H.woodDark, 2.6, y, -15.2, 1.4, 0.8, 1.2, 0, 'drum-stand');
  const taiko = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.9, 16), M.red);
  taiko.rotation.x = Math.PI / 2;
  taiko.position.set(2.6, y + 1.45, -15.2);
  b.add(taiko);
  for (const dz of [-0.46, 0.46]) cyl(b, M.cream, 2.6, y + 1.45 - 0.62, -15.2 + dz, 0.62, 0.62, 0.02, 16);
  cyl(b, M.red, 3.9, y, -13.5, 0.3, 0.3, 0.7, 12);
  cyl(b, M.cream, 3.9, y + 0.7, -13.5, 0.3, 0.3, 0.02, 12);
  for (const dz of [-0.12, 0.12]) beam(b, H.woodPale, 3.6, y + 0.74, -13.5 + dz, 4.2, y + 0.75, -13.4 + dz, 0.05);
  box(b, H.lamp, 0, y + 2.4, -12.6, 0.3, 0.42, 0.3, 0, false);
  box(b, H.lamp, 4, y + 2.4, -12.6, 0.3, 0.42, 0.3, 0, false);
  c.b.light({ x: 2, y: y + 2.3, z: -13, color: 0xff9040, intensity: 10, distance: 9, mode: 'flicker', pool: 2.4, glow: 0.35, tag: 'drums' });
  // a collapsed wooden house you can see into: its north wall gone, the upstairs floor slumped in
  const hr = { x0: -8, z0: 4, x1: 3, z1: 12 };
  room(c, hr, y, 2.8, 0, { doors: [{ side: 'N', at: 5.5, w: 6 }], wall: H.wood, roof: null, tag: 'house' });
  flat(c, hr, y, 0, 'S');
  const slump = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.25, 8.4), H.woodDark);
  slump.position.set(-2.5, y + 2.6, 8);
  slump.rotation.x = -0.1;
  b.add(slump);
  roofCollider(c, hr, y + 2.8);
  for (let k = 0; k < 4; k++) beam(b, H.woodDark, -7 + k * 3, y, 3.2, -6.5 + k * 3, y + 2.4, 4.6, 0.14);
  // rain standing in the hollows of the paving, weeds along the walls' feet
  for (const [x, z, w, d] of [
    [-9, -3, 2.6, 1.4],
    [-26, -14, 3, 1.6],
    [6, -8, 2, 1.2],
    [-18.2, 3.2, 1.6, 1],
    [-36, 6, 2.2, 1.4],
  ] as const)
    box(b, M.water, x, y + 0.025, z, w, 0.02, d);
  for (const [x, z] of [
    [-36, 13],
    [-30, 13.2],
    [-10.5, 13],
    [7, 12.8],
    [-34, -22.4],
    [-27, -22.5],
    [-6, -22.4],
    [5, -22.5],
  ] as const)
    weeds(b, x, y, z);
  // crates, a handcart by the drum shed
  clutter(c, -5, y, -18, 'crate');
  clutter(c, -6.2, y, -18.4, 'crate', 0.4);
  clutter(c, -30, y, -20.5, 'sacks');
}

// ---------------------------------------------------------------------------------------------------------------------
// the fan terrace at the head of the Stairs of Life
// ---------------------------------------------------------------------------------------------------------------------

function buildFanTerrace(c: Ctx): void {
  const { b } = c;
  const y = TT;
  // the fan house (the shutter is the frame's: its collider fills the south doorway until the pick opens it)
  const fr = { x0: 46, z0: -22, x1: 66, z1: -10 };
  room(c, fr, y, 6, 0, { doors: [{ side: 'S', at: 12, w: 3.2 }], wall: M.brick, roof: H.rust, tag: 'fan-house' });
  ground(b, H.concreteDark, fr.x0 + 0.2, fr.z0 + 0.2, fr.x1 - 0.2, fr.z1 - 0.2, y);
  windows(b, fr, 'S', y + 4.4, 1.4, 3, 0.15, { w: 1.6, skip: [[56.4, 59.6]] });
  windows(b, fr, 'W', y + 4.4, 1.4, 3, 0.1, { w: 1.6 });
  for (const x of [fr.x0, fr.x1]) for (const z of [fr.z0, fr.z1]) box(b, M.brick, x, y + 3, z, 0.7, 6, 0.7, 0, false);
  // the shutter's roller box over the doorway and its guide rails (the shutter itself is the story's)
  box(b, H.rust, 58, y + 3.15, -9.7, 3.8, 0.6, 0.5, 0, false);
  for (const x of [56.25, 59.75]) box(b, H.rust, x, y + 1.45, -9.85, 0.14, 2.9, 0.14, 0, false);
  box(b, H.stain, 58, y + 1.5, -9.82, 4.4, 3, 0.02, 0, false);
  // the great fan in its round casing at the east end, facing west, its duct dropping into the floor
  const fx = 63.2;
  const fz = -16;
  const fy = y + 3;
  box(b, H.concreteDark, fx + 1.2, fy, fz, 2.2, 6, 7.4);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.32, 8, 24), H.iron);
  ring.position.set(fx, fy, fz);
  ring.rotation.y = Math.PI / 2;
  b.add(ring);
  const back = new THREE.Mesh(new THREE.CircleGeometry(2.5, 20), M.dark);
  back.position.set(fx + 0.05, fy, fz);
  back.rotation.y = -Math.PI / 2;
  b.add(back, { cast: false });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.1, 0.7), H.steel);
    blade.position.set(fx - 0.2, fy + Math.sin(a) * 1.25, fz + Math.cos(a) * 1.25);
    blade.rotation.set(a, 0, 0.35);
    b.add(blade);
  }
  cyl(b, H.iron, fx - 0.5, fy - 0.4, fz, 0.42, 0.42, 0.8, 12);
  solid(c, fx + 1, fz, 3.4, 7.4, y + 6, 'fan', { kind: 'building', surface: 'metal' });
  // the motor on its plinth, the shaft, the starter cabinet with its lever (the job: start the fan)
  thing(c, H.concreteDark, 57.5, y, -16, 3.6, 0.6, 2, 0, 'motor-plinth', true);
  cyl(b, H.green, 57.5, y + 0.6, -16, 0.8, 0.8, 1.6, 14);
  beam(b, H.steel, 59.2, y + 1.4, -16, fx - 0.6, fy - 0.4, fz, 0.16);
  thing(c, H.steel, 52, y, -18.9, 1.2, 1.6, 0.6, 0, 'fan-starter', true);
  box(b, M.red, 52.35, y + 1.25, -18.55, 0.08, 0.5, 0.08, 0.6, false);
  box(b, H.lamp, 51.7, y + 1.45, -18.58, 0.12, 0.12, 0.04, 0, false);
  // the duct grate in the floor, cables, oil drums, a tool rack
  box(b, H.iron, 61, y + 0.03, -12.2, 3, 0.04, 1.8, 0, false);
  for (let k = 0; k < 8; k++) box(b, M.dark, 59.7 + k * 0.38, y + 0.05, -12.2, 0.12, 0.02, 1.6, 0, false);
  clutter(c, 47.2, y, -21, 'drum');
  clutter(c, 48.1, y, -21.1, 'drum');
  thing(c, H.woodDark, 47, y, -13, 0.5, 1.8, 2.4, 0, 'tool-rack');
  c.b.light({ x: 54, y: y + 5, z: -16, color: 0xd0dcff, intensity: 10, distance: 12, mode: 'fail', pool: 2.8, glow: 0.3, tag: 'fan-house' });
  // the slanted chimney (the evasé) out of the roof's east end
  const ev = new THREE.Mesh(new THREE.BoxGeometry(2.6, 6, 3.4), M.brick);
  ev.position.set(66.5, y + 8, -16);
  ev.rotation.z = -0.32;
  b.add(ev);
  box(b, H.rust, 67.4, y + 11, -16, 3.2, 0.25, 4, 0, false);
  // the timber gate at the head of the Stairs of Life
  for (const z of [-8.7, -3.3]) {
    box(b, H.woodDark, 66.6, y + 1.9, z, 0.3, 3.8, 0.3);
    solid(c, 66.6, z, 0.3, 0.3, y + 3.8, 'gate', { surface: 'wood' });
  }
  box(b, H.woodDark, 66.6, y + 3.6, -6, 0.3, 0.3, 6.6, 0, false);
  box(b, H.woodDark, 66.6, y + 3.1, -6, 0.2, 0.2, 5.8, 0, false);
  // the mine office: desks, a safe, the clock, the shift board (no words)
  const or = { x0: 22, z0: 4, x1: 36, z1: 12 };
  room(c, or, y, 3.2, 0, { doors: [{ side: 'N', at: 7, w: 1.8 }], wall: M.plaster, roof: H.concreteDark, tag: 'mine-office' });
  windows(b, or, 'N', y + 1.7, 1.2, 2.4, 0.3, { w: 1.4, skip: [[28.1, 29.9]] });
  windows(b, or, 'E', y + 1.7, 1.2, 2.4, 0.2, { w: 1.4 });
  ground(b, H.woodPale, or.x0 + 0.2, or.z0 + 0.2, or.x1 - 0.2, or.z1 - 0.2, y);
  for (const [x, z] of [
    [25, 8],
    [32, 8],
  ] as const) {
    thing(c, H.steel, x, y, z, 2.2, 0.75, 1.1, 0, 'desk');
    box(b, M.paper, x - 0.3, y + 0.77, z, 0.4, 0.02, 0.3, 0.3, false);
    box(b, M.chair, x, y + 0.45, z - 0.9, 0.42, 0.04, 0.42, 0, false);
  }
  thing(c, H.iron, 35, y, 11, 0.8, 1.1, 0.7, 0, 'safe');
  box(b, M.board, 22.18, y + 1.7, 8, 0.05, 1.2, 3, 0, false);
  for (let k = 0; k < 12; k++) box(b, k % 3 ? M.cream : M.red, 22.24, y + 1.3 + Math.floor(k / 4) * 0.3, 6.9 + (k % 4) * 0.7, 0.02, 0.12, 0.4, 0, false);
  box(b, M.cream, 29, y + 2.5, 11.82, 0.42, 0.42, 0.04, 0, false);
  // the yard: a spur of rail with three coal tubs, a timber stack, a bench, lamps
  for (const z of [-0.6, 0.6]) box(b, H.steel, 33, y + 0.06, z, 22, 0.08, 0.08, 0, false);
  for (let k = 0; k < 15; k++) box(b, H.woodDark, 22.6 + k * 1.5, y + 0.03, 0, 0.25, 0.06, 1.8, 0, false);
  for (const x of [26, 29, 38]) {
    thing(c, M.rustDark, x, y + 0.3, 0, 1.6, 0.9, 1.2, 0, 'coal-tub', true);
    box(b, M.dark, x, y + 1.25, 0, 1.4, 0.1, 1.0, 0, false);
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.6, 0.6]) cyl(b, H.iron, x + dx, y, dz, 0.2, 0.2, 0.3, 8);
  }
  for (let k = 0; k < 4; k++) box(b, H.wood, 44, y + 0.2 + k * 0.4, 6 + (k % 2) * 0.2, 4.8, 0.36, 0.36);
  solid(c, 44, 6.1, 4.8, 1.4, y + 1.6, 'timber', { shots: false, surface: 'wood' });
  thing(c, H.wood, 40, y, -6, 2.2, 0.45, 0.5, 0, 'bench');
  clutter(c, 41.8, y, -6, 'drum');
  lampPost(c, 30, y, -6, { tag: 'fan' });
  lampPost(c, 62, y, 6, { mode: 'flicker', tag: 'fan' });
  clutter(c, 55, y, 10, 'crate');
  clutter(c, 56.2, y, 10.4, 'crate', 0.6);
  clutter(c, 18, y, -20, 'sacks');
}

// ---------------------------------------------------------------------------------------------------------------------
// the head of the Hell Stairs: the Chibiki-iwa's cradle and groove, the three chain winches
// ---------------------------------------------------------------------------------------------------------------------

function buildRockHead(c: Ctx): void {
  const { b } = c;
  const y = S;
  const R = ROCK.rest;
  const D = dressMats(c.mats);
  // the groove the stone rolls along, worn into the summit from its cradle to the head of the stairs
  const dx = ROCK.seal.x - R.x;
  const dz = ROCK.seal.z - R.z;
  const len = Math.hypot(dx, dz);
  box(b, H.stain, (R.x + ROCK.seal.x) / 2, y + 0.02, (R.z + ROCK.seal.z) / 2, len + 4, 0.04, 4.4, Math.atan2(-dz, dx), false);
  // the cradle: a crescent of rock on its east side, a taller crag behind like a niche
  for (let k = 0; k < 5; k++) {
    const a = -1.2 + k * 0.6;
    const x = R.x + Math.cos(a) * 4.4;
    const z = R.z + Math.sin(a) * 4.4;
    crag(b, D.rock, { x, y: y + 0.6, z, sx: 1.4, sy: 1.6 + (k === 2 ? 1 : 0), sz: 1.4, seed: 1850 + k, detail: 1 });
    solid(c, x, z, 2.2, 2.2, y + 2, 'cradle', { kind: 'wall' });
  }
  crag(b, D.rock, { x: R.x + 7, y: y + 2, z: R.z - 1, sx: 2.6, sy: 4.4, sz: 4, seed: 1860, detail: 1 });
  solid(c, R.x + 7, R.z - 1, 4.4, 6.4, y + 5, 'cradle', { kind: 'wall' });
  // stone lanterns either side of the stair head (clear of the stone's path)
  toro(c, -22.6, y, -24.9, true);
  toro(c, -9.4, y, -24.9, false);
  // the winches: each a drum on an iron frame between its crank (where you stand) and the stone, its chain run out
  for (const [i, w] of ROCK.winches.entries()) {
    const ux = R.x - w.x;
    const uz = R.z - w.z;
    const d = Math.hypot(ux, uz);
    const nx = ux / d;
    const nz = uz / d;
    const wx = w.x + nx * 1.7;
    const wz = w.z + nz * 1.7;
    const yaw = Math.atan2(-nz, nx); // the frame's long side across the pull
    winch(c, wx, y, wz, yaw);
    // the chain laid out toward the stone, ending at a snatch block pinned in the rock
    const ex = wx + nx * 4.2;
    const ez = wz + nz * 4.2;
    for (let k = 0; k < 10; k++) {
      const t = (k + 0.5) / 10;
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 4, 8), H.iron);
      link.position.set(wx + (ex - wx) * t, y + 0.08, wz + (ez - wz) * t);
      link.rotation.set(Math.PI / 2, 0, (k % 2) * (Math.PI / 2) + yaw);
      b.add(link, { cast: false });
    }
    cyl(b, H.rust, ex, y, ez, 0.12, 0.16, 0.6, 8);
    box(b, H.iron, ex, y + 0.55, ez, 0.4, 0.4, 0.2, yaw, false);
    void i;
  }
  lamp(c, -27, y, -27.5, 0, { h: 4.2, color: 0xd0dcff, mode: 'fail', tag: 'summit' });
}

/** A chain winch: a base, two side frames, the drum with chain wrapped on it, a crank either side. Collides. */
function winch(c: Ctx, x: number, y: number, z: number, yaw: number): void {
  const { b } = c;
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, rx = 0, rz = 0): void => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.rotation.set(rx, 0, rz);
    g.add(m);
  };
  // local frame: the drum's axle along local z (across the pull, which runs along local x)
  add(new THREE.BoxGeometry(1.6, 0.25, 2.0), H.concreteDark, 0, 0.12, 0);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(1.2, 1.3, 0.12), H.iron, 0, 0.9, s * 0.8);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), H.steel, 0, 1.2, s * 1.1, Math.PI / 2);
    add(new THREE.BoxGeometry(0.08, 0.5, 0.08), H.steel, 0, 1.0, s * 1.35);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 6), H.wood, -0.2, 0.75, s * 1.4, 0, Math.PI / 2);
  }
  add(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 14), H.rust, 0, 1.2, 0, Math.PI / 2);
  for (let k = 0; k < 5; k++) add(new THREE.TorusGeometry(0.44, 0.05, 4, 14), H.iron, 0, 1.2, -0.6 + k * 0.3);
  add(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 18), H.iron, 0, 1.2, 0.72, Math.PI / 2);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  b.add(g);
  solid(c, x, z, 1.6, 2.2, y + 1.8, 'chain-winch', { rot: yaw, surface: 'metal' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the shrine: torii, the offering box's plinth, the collapsed worship hall (the tachi before it), the honden
// ---------------------------------------------------------------------------------------------------------------------

function buildShrine(c: Ctx): void {
  const { b } = c;
  const y = S;
  const sh = SHRINES[3]!;
  stoneTorii(c, sh.x, y, -50.8, 5.2, 4.2);
  toro(c, sh.x - 3.6, y, -55.5, true);
  toro(c, sh.x + 3.6, y, -55.5, false);
  ground(b, H.concrete, sh.x - 1.4, -59, sh.x + 1.4, -46.6, y);
  // the offering box's plinth (the box itself is the arms wave's: it moves between the four shrines)
  box(b, H.concreteDark, sh.x, y + 0.1, -59.8, 2, 0.2, 1.1);
  solid(c, sh.x, -59.8, 2, 1.1, y + 0.2, 'offering-plinth', { shots: false });
  // the worship hall, come down: its stone base, a few posts still up, the roof broken in two and the beams heaped
  const hx = sh.x;
  const hz = -65.4;
  box(b, H.concreteDark, hx, y + 0.3, hz, 10.4, 0.6, 7.4);
  for (const [px, pz] of [
    [-4.6, 3.2],
    [4.6, 3.2],
    [-4.6, -3.2],
  ] as const)
    box(b, M.red, hx + px, y + 0.6 + 1.3, hz + pz, 0.28, 2.6, 0.28);
  beam(b, M.red, hx + 4.6, y + 0.6, hz - 3.2, hx + 3.2, y + 1.8, hz - 1.4, 0.28); // a post fallen in
  for (const s of [-1, 1]) {
    const half = new THREE.Mesh(gableRoof(5.6, 4.2, 2.2, 0.26, 0.8), H.concreteDark);
    half.position.set(hx + s * 2.6, y + 0.9, hz + 0.2);
    half.rotation.set(s * 0.18, s * 0.25, s * 0.32);
    b.add(half);
  }
  for (let k = 0; k < 12; k++) beam(b, rnd() < 0.3 ? M.red : H.woodDark, hx - 4 + rnd() * 8, y + 0.6, hz - 2.6 + rnd() * 5.2, hx - 4 + rnd() * 8, y + 1 + rnd() * 2.2, hz - 2.6 + rnd() * 5.2, 0.2 + rnd() * 0.1);
  solid(c, hx, hz, 10.4, 7.4, y + 3, 'worship-hall', { kind: 'building', surface: 'wood' });
  // one beam out of the heap toward the west, where the shrine's sword lies before it
  const tc = TOOLS.tachi;
  beam(b, H.woodDark, hx - 5.2, y + 0.9, hz + 1.4, tc.x + 1.8, y + 0.1, tc.z - 1.4, 0.22);
  box(b, H.woodDark, tc.x + 0.3, y + 0.2, tc.z - 1.6, 1.4, 0.4, 0.4);
  solid(c, tc.x + 0.3, tc.z - 1.6, 1.4, 0.4, y + 0.4, 'sword-rack', { shots: false });
  // the honden behind: concrete, a copper roof, on a plinth with steps
  box(b, H.concreteDark, hx, y + 0.5, -72.4, 7.6, 1, 5.2);
  box(b, H.concrete, hx, y + 2.4, -72.8, 5, 2.8, 3.6);
  box(b, H.woodDark, hx, y + 2.2, -70.98, 1.6, 2, 0.06, 0, false);
  const hr = new THREE.Mesh(gableRoof(6.2, 2.8, 1.4, 0.2, 0.9), M.copper);
  hr.position.set(hx, y + 3.85, -72.8);
  b.add(hr);
  for (let k = 0; k < 3; k++) box(b, H.concrete, hx, y + 0.15 + k * 0.3, -69.4 - k * 0.35, 2.4, 0.3, 0.35);
  solid(c, hx, -72.4, 7.6, 5.2, y + 4, 'honden', { kind: 'building' });
  // a kami tree with its rope
  pine(c, sh.x - 7, y, -70, 7, 0.8);
  box(b, H.woodPale, sh.x - 7, y + 1.6, -70, 0.7, 0.14, 0.7, 0, false);
}

// ---------------------------------------------------------------------------------------------------------------------
// the manager's house: the island's only private house, two storeys of wood, an engawa, a pond garden
// ---------------------------------------------------------------------------------------------------------------------

function buildManagerHouse(c: Ctx): void {
  const { b } = c;
  const y = S;
  const r = { x0: 18, z0: -46, x1: 40, z1: -34 };
  const h = 3.2;
  room(c, r, y, h, 0, { doors: [{ side: 'S', at: 11, w: 1.8 }], wall: H.woodPale, roof: null, tag: 'manager-house' });
  for (const f of ['N', 'E', 'W'] as const) windows(b, r, f, y + 1.6, 1.1, 2.4, 0.2, { w: 1.4, boarded: 0.3 });
  windows(b, r, 'S', y + 1.5, 1.6, 2.4, 0.25, { w: 1.8, boarded: 0.2, skip: [[28.1, 29.9]] });
  for (let x = r.x0; x <= r.x1; x += 2.75) for (const z of [r.z0, r.z1]) box(b, H.woodDark, x, y + h / 2, z, 0.22, h, 0.36, 0, false);
  // inside: the kitchen (west), the parlour with the family altar (middle: the photograph), the study (east)
  wallLine(c, false, 26, r.z0, r.z1, y, h, [[-40.9, -39.1]], M.plaster, 0, 'manager-house');
  wallLine(c, false, 33, r.z0, r.z1, y, h, [[-42.9, -41.1]], M.plaster, 0, 'manager-house');
  flat(c, { x0: 26, z0: r.z0, x1: 33, z1: r.z1 }, y, 0, 'N', { washer: false });
  thing(c, H.woodDark, 28.6, y, -45.5, 1.2, 1.3, 0.5, 0, 'butsudan');
  box(b, M.gold, 28.6, y + 0.9, -45.24, 0.8, 0.5, 0.02, 0, false);
  ground(b, M.tile, r.x0 + 0.2, r.z0 + 0.2, 25.8, r.z1 - 0.2, y);
  thing(c, H.steel, 19.2, y, -44.5, 0.8, 0.85, 2.4, 0, 'stove');
  thing(c, H.white, 19.2, y, -41.2, 0.8, 0.85, 1.6, 0, 'sink');
  thing(c, H.woodDark, 22.6, y, -45.5, 2.2, 1.8, 0.5, 0, 'cupboard');
  thing(c, H.woodDark, 22.4, y, -39, 1.4, 0.72, 0.9, 0, 'kitchen-table');
  ground(b, H.woodPale, 33.2, r.z0 + 0.2, r.x1 - 0.2, r.z1 - 0.2, y);
  thing(c, H.woodDark, 37.6, y, -40, 1.6, 0.76, 0.9, 0, 'study-desk');
  box(b, M.paper, 37.4, y + 0.78, -40.1, 0.5, 0.02, 0.35, 0.2, false);
  box(b, H.wood, 36.4, y + 0.45, -40, 0.45, 0.04, 0.45, 0, false);
  thing(c, H.woodDark, 39.5, y, -44, 0.5, 2.0, 2.6, 0, 'bookshelf');
  for (let k = 0; k < 9; k++) box(b, k % 3 ? M.red : M.cream, 39.2, y + 0.5 + Math.floor(k / 3) * 0.6, -45 + (k % 3) * 0.7, 0.1, 0.35, 0.5, 0, false);
  thing(c, H.iron, 34, y, -45.3, 0.8, 0.9, 0.6, 0, 'safe');
  roofCollider(c, r, y + h);
  c.b.light({ x: 29.5, y: y + 2.6, z: -40, color: 0xffb070, intensity: 9, distance: 9, mode: 'flicker', pool: 2.4, glow: 0.3, tag: 'manager-house' });
  // the eaves' pent roof round the ground floor, the upper storey, the hip roof over it
  const roofMat = H.concreteDark;
  for (const [cx, cz, w, d, rx, rz] of [
    [29, -33.2, 23.4, 2, 0.32, 0],
    [29, -46.8, 23.4, 2, -0.32, 0],
    [17.2, -40, 2, 12, 0, -0.32],
    [40.8, -40, 2, 12, 0, 0.32],
  ] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), roofMat);
    p.position.set(cx, y + h + 0.25, cz);
    p.rotation.set(rx, 0, rz);
    b.add(p);
  }
  box(b, H.woodDark, 29, y + h + 0.08, -40, 22.2, 0.16, 12.2, 0, false);
  const ur = { x0: 20, z0: -44.5, x1: 38, z1: -35.5 };
  box(b, H.woodPale, (ur.x0 + ur.x1) / 2, y + h + 1.6, (ur.z0 + ur.z1) / 2, ur.x1 - ur.x0, 2.9, ur.z1 - ur.z0, 0, false);
  for (const f of ['N', 'S', 'E', 'W'] as const) windows(b, ur, f, y + h + 1.7, 1.2, 2.2, 0.3, { w: 1.5, through: 0.2 });
  for (let x = ur.x0; x <= ur.x1; x += 3) for (const z of [ur.z0, ur.z1]) box(b, H.woodDark, x, y + h + 1.6, z, 0.2, 2.9, 0.24, 0, false);
  // the upstairs balcony rail on the south
  box(b, H.woodDark, 29, y + h + 0.9, ur.z1 + 0.9, ur.x1 - ur.x0, 0.08, 0.08, 0, false);
  box(b, H.woodDark, 29, y + h + 0.3, ur.z1 + 0.5, ur.x1 - ur.x0, 0.1, 1, 0, false);
  for (let x = ur.x0; x <= ur.x1; x += 1.2) box(b, H.woodDark, x, y + h + 0.6, ur.z1 + 0.9, 0.05, 0.6, 0.05, 0, false);
  hipRoof(b, roofMat, 29, y + h + 3.05, -40, 18.6, 11, 2.2);
  // the engawa: a board veranda along the south under the eaves, its posts
  box(b, H.wood, 29, y + 0.06, -33.2, 22, 0.12, 1.6, 0, false);
  for (const x of [18.4, 22.2, 26, 32, 35.8, 39.6]) {
    box(b, H.woodDark, x, y + h / 2 + 0.2, -32.5, 0.16, h + 0.4, 0.16);
    solid(c, x, -32.5, 0.18, 0.18, y + h, 'engawa-post', { surface: 'wood' });
  }
  // the garden west of it: the pond, stepping stones, a stone lantern, a bamboo fence, pines
  const D = dressMats(c.mats);
  cyl(b, H.concreteDark, 10.5, y, -41, 3, 3, 0.2, 18);
  cyl(b, M.water, 10.5, y + 0.12, -41, 2.6, 2.6, 0.1, 18);
  for (let k = 0; k < 6; k++) crag(b, D.rock, { x: 10.5 + Math.cos(k) * 3.1, y: y + 0.15, z: -41 + Math.sin(k) * 3.1, sx: 0.5, sy: 0.4, sz: 0.5, seed: 1870 + k, detail: 1 });
  solid(c, 10.5, -41, 5, 5, y + 0.4, 'pond', { shots: false });
  for (let k = 0; k < 5; k++) cyl(b, H.concrete, 15.8 + k * 0.4, y, -36.8 + k * 0.9, 0.3, 0.3, 0.06, 8);
  toro(c, 14, y, -45, true);
  pine(c, 6.5, y, -45, 6, 2.4);
  pine(c, 15, y, -48.4, 5, 0.6);
  fence(b, true, -48.6, 4.5, 17.5, y, 1.4);
  fence(b, false, 4.5, -48.6, -34, y, 1.4);
}

// ---------------------------------------------------------------------------------------------------------------------
// the lighthouse on the north cliff and its keeper's hut
// ---------------------------------------------------------------------------------------------------------------------

function buildLighthouse(c: Ctx): void {
  const { b } = c;
  const y = S;
  const LH = HIRASAKA.lighthouse;
  cyl(b, H.concreteDark, LH.x, y, LH.z, 4.4, 4.6, 0.3, 18);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.9, 16, 16), H.white);
  tower.position.set(LH.x, y + 8.8, LH.z);
  b.add(tower);
  cyl(b, M.red, LH.x, y + 13.8, LH.z, 2.28, 2.28, 0.8, 16);
  box(b, M.dark, LH.x, y + 2, LH.z + 2.75, 1.2, 2.2, 0.4, 0, false);
  for (let k = 0; k < 3; k++) box(b, M.glass, LH.x, y + 5.5 + k * 3.5, LH.z + 2.5 - k * 0.12, 0.5, 0.9, 0.3, 0, false);
  // the gallery, its rail, the lantern room's frame (the lamp is lit at dawn by the story), the cap
  cyl(b, H.iron, LH.x, y + 16.8, LH.z, 2.9, 2.6, 0.25, 18);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.04, 4, 24), H.iron);
  rail.position.set(LH.x, y + 17.8, LH.z);
  rail.rotation.x = Math.PI / 2;
  b.add(rail);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    box(b, H.iron, LH.x + Math.cos(a) * 2.8, y + 17.4, LH.z + Math.sin(a) * 2.8, 0.05, 0.8, 0.05, 0, false);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    box(b, H.iron, LH.x + Math.cos(a) * 1.3, y + 18.2, LH.z + Math.sin(a) * 1.3, 0.08, 2.4, 0.08, 0, false);
  }
  cyl(b, M.red, LH.x, y + 19.4, LH.z, 1.5, 1.5, 0.2, 16);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.1, 16), M.red);
  cap.position.set(LH.x, y + 20.15, LH.z);
  b.add(cap);
  solid(c, LH.x, LH.z, 6.4, 6.4, y + 17, 'lighthouse', { kind: 'building' });
  // the keeper's hut: a bunk, a desk with the log, the radio, a kettle
  const kr = { x0: 44, z0: -61, x1: 50.5, z1: -55.5 };
  room(c, kr, y, 2.7, 0, { doors: [{ side: 'S', at: 3.2, w: 1.6 }], wall: H.white, roof: M.red, tag: 'keeper' });
  windows(b, kr, 'W', y + 1.5, 0.8, 2.4, 0.4, { w: 1 });
  thing(c, H.woodDark, 45.4, y, -59.6, 2, 0.5, 0.9, 0, 'bunk');
  box(b, M.paper, 45.4, y + 0.55, -59.6, 1.9, 0.1, 0.8, 0, false);
  thing(c, H.woodDark, 49.3, y, -59.8, 1.2, 0.75, 0.7, 0, 'log-desk');
  box(b, H.steel, 49.5, y + 0.9, -59.9, 0.5, 0.3, 0.3, 0, false);
  box(b, M.cream, 49, y + 0.77, -59.7, 0.3, 0.03, 0.22, 0.2, false);
  // the path's steps up the last rise, an iron rail along the cliff
  for (let k = 0; k < 4; k++) box(b, H.concrete, LH.x - 1, y + 0.05, -56 - k * 0.8, 2.4, 0.1, 0.7, 0, false);
}

// ---------------------------------------------------------------------------------------------------------------------
// the summit's ground: paths, pines, rocks at the cliff, the jizō on the west edge, lamps
// ---------------------------------------------------------------------------------------------------------------------

function buildSummitGrounds(c: Ctx): void {
  const { b } = c;
  const y = S;
  // paths of worn stones: from the stair head east past the house, round to the shrine and the lighthouse
  for (const [x0, z0, x1, z1] of [
    [1, -28.8, 26, -26.6],
    [27.8, -32.6, 30.2, -26.6],
    [42.6, -50, 45, -26.6],
    [24, -52, 46, -49.6],
    [46, -55.2, 55, -53.6],
    [-30, -40, -12, -38],
  ] as const)
    ground(b, H.concrete, x0, z0, x1, z1, y);
  // pines and rocks along the cliffs (none near the winches, the stair head or the stone's road)
  const D = dressMats(c.mats);
  for (const [x, z, h, lean] of [
    [-34, -58, 6, 0.4],
    [-28, -70, 7, 1.2],
    [-12, -66, 6.5, 2],
    [0, -56, 5.5, 0.8],
    [8, -70, 6, 1.6],
    [14, -30, 5, 2.6],
    [52, -40, 6, 0.2],
    [64, -50, 5.5, 3],
    [38, -70, 6.5, 1],
    [-36, -46, 5, 0.3],
    [-24, -58, 6, 1.9],
    [-16, -71, 5.5, 0.5],
    [-31, -64, 4.5, 2.8],
  ] as const)
    pine(c, x, y, z, h, lean);
  for (const [x, z, sz] of [
    [-30, -50, 1.6],
    [-8, -58, 1.4],
    [-20, -64, 1.8],
    [2, -64, 1.3],
    [36, -29, 1.2],
    [62, -54, 1.5],
    [-36, -66, 1.4],
    [-12, -52, 1.2],
    [20, -68, 1.3],
  ] as const)
    weeds(b, x, y, z, sz);
  for (let k = 0; k < 9; k++) {
    const x = -34 + k * 12 + rnd() * 4;
    if (Math.abs(x - HIRASAKA.lighthouse.x) < 7) continue;
    crag(b, D.rock, { x, y: y + 0.4, z: -74.6, sx: 2.2 + rnd(), sy: 1.4 + rnd(), sz: 1.1, seed: 1880 + k, detail: 1 });
  }
  for (const [x, z, s] of [
    [-6, -50, 1.4],
    [12, -57, 1.1],
    [60, -34, 1.3],
    [-36, -36, 1],
  ] as const) {
    crag(b, D.rock, { x, y: y + 0.3, z, sx: s * 1.3, sy: s, sz: s * 1.1, seed: 1890 + Math.round(x), detail: 1 });
    solid(c, x, z, s * 2, s * 1.8, y + s * 1.1, 'boulder', { kind: 'prop' });
  }
  // the jizō along the west cliff: small stone figures in red bibs, a few cups before them
  for (let k = 0; k < 6; k++) {
    const z = -52 - k * 1.1;
    cyl(b, H.concrete, -38.3, y, z, 0.2, 0.24, 0.55, 8);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), H.concrete);
    hd.position.set(-38.3, y + 0.7, z);
    b.add(hd, { cast: false });
    box(b, M.red, -38.12, y + 0.45, z, 0.06, 0.24, 0.32, 0, false);
    if (k % 2) cyl(b, M.cream, -37.8, y, z, 0.05, 0.05, 0.08, 6);
  }
  solid(c, -38.3, -54.75, 0.6, 6.4, y + 0.8, 'jizo', { shots: false });
  lamp(c, 8, y, -36, 0, { h: 4.2, color: 0xd0dcff, mode: 'fail', tag: 'summit' });
  lamp(c, 46.5, y, -46, 0, { h: 4.2, color: 0xd0dcff, mode: 'fail', tag: 'summit' });
}
