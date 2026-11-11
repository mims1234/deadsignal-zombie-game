/**
 * The UNIVERMAG's ground floor and THE SHELTER under it (`zarya/places.ts`), built from
 * `research_notes/zarya/refs/uni-*.webp` and `sh-*.webp`: one hall of counters round an atrium fir tree and a still
 * escalator, departments along the north wall, the tea room in the north-east corner, the cloakroom and the staff rooms
 * along the south; and below, reached by the staff stairs, a vestibule, the blast door, the main room, the watch room
 * and the storeroom.
 */
import * as THREE from 'three';
import type { BoxCollider } from '../collision';
import type { FloorLink } from '../floors';
import { groundRect, wall } from '../structures';
import type { Ctx } from './util';
import { COLUMNS, CORE, SHELTER, STORE, STORE_BLOCKS, ZARYA } from '../../zarya/places';
import { GOODS, Z, ball, box, counter, cyl, firTree, garland, goods, mandarins, shelves, slab, solid } from './zaryaKit';

const S = STORE;
const P = ZARYA;
const B = CORE;
const T = 0.5;
/** The opening in the stair room's floor the stairs down to the shelter go through (`stairPit`): floors leave it open. */
const PIT = { x0: 136.4, x1: 139.5, z0: 15.2, z1: 22.4, deep: 4, steps: 16 } as const;

/** A flat ground cover over a rectangle, leaving the stair opening uncovered. */
function floorAroundPit(c: Ctx, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const px0 = PIT.x0 - 0.22;
  const px1 = Math.min(x1, PIT.x1 + 0.22);
  groundRect(c.b, mat, x0, z0, px0, z1, y);
  if (px1 < x1) groundRect(c.b, mat, px1, z0, x1, z1, y);
  groundRect(c.b, mat, px0, z0, px1, PIT.z0 - 0.22, y);
  groundRect(c.b, mat, px0, PIT.z1 + 0.22, px1, z1, y);
}

/** A flat disc on the store's west face (the mosaic is made of them). */
function disc(c: Ctx, mat: THREE.Material, y: number, z: number, r: number, sy = 1, sz = 1, out = 0.1, tilt = 0): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 20), mat);
  m.rotation.set(tilt, 0, Math.PI / 2, 'XYZ');
  m.scale.set(sy, 1, sz);
  m.position.set(S.x0 - out, y, z);
  c.b.add(m, { cast: false });
}

/** The mosaic over the doors, as the whole town knows it: a cosmonaut, the sun, a sheaf of wheat, a dove. */
function mosaic(c: Ctx): void {
  const { b } = c;
  const y = 10.4;
  const x = S.x0 - 0.06;
  const w = 12.2;
  const z = (i: number): number => S.z0 + 4 + w / 2 + i * w;
  const grounds = [0x24406e, 0xc9601e, 0x2c6a66, 0x3d78b8];
  for (let i = 0; i < 4; i++) box(b, new THREE.MeshStandardMaterial({ color: grounds[i]!, roughness: 0.7 }), x, y, z(i), 0.1, 6.4, w - 0.2, 0, false);
  box(b, Z.gold, x, y, (S.z0 + S.z1) / 2 - 0.4, 0.06, 6.8, 4 * w + 0.4, 0, false);
  const strip = (mat: THREE.Material, yy: number, zz: number, len: number, wide: number, rx: number): void => slab(b, mat, x - 0.1, yy, zz, 0.05, len, wide, rx, 0, 0, false);
  // the cosmonaut: a white helmet, the visor's dark ring, a face, a red collar
  disc(c, Z.white, y + 0.4, z(0), 2.5);
  disc(c, Z.blue, y + 0.4, z(0), 1.9, 1, 1, 0.14);
  disc(c, Z.cream, y + 0.3, z(0), 1.5, 1.05, 0.9, 0.18);
  for (const s of [-1, 1]) disc(c, Z.black, y + 0.55, z(0) + s * 0.5, 0.16, 1, 1, 0.22);
  strip(Z.red, y - 2.55, z(0), 0.9, 4.6, 0);
  // the sun: a disc and its rays
  disc(c, Z.gold, y, z(1), 1.7, 1, 1, 0.14);
  for (let k = 0; k < 14; k++) strip(k % 2 ? Z.gold : Z.orange, y + Math.cos((k / 14) * Math.PI * 2) * 2.5, z(1) + Math.sin((k / 14) * Math.PI * 2) * 2.5, k % 2 ? 1.3 : 0.9, 0.3, (k / 14) * Math.PI * 2);
  // the sheaf: stalks fanned from a tie, ears of grain at their heads
  for (let k = -3; k <= 3; k++) {
    const a = k * 0.13;
    strip(Z.gold, y - 0.4, z(2) + Math.sin(a) * 1.2, 4.4, 0.16, a);
    for (let e = 0; e < 4; e++) strip(Z.orange, y + 1.5 + e * 0.32, z(2) + Math.sin(a) * (3.0 + e * 0.34), 0.5, 0.26, a + (e % 2 ? 0.6 : -0.6));
  }
  strip(Z.red, y - 1.2, z(2), 0.36, 1.2, 0);
  // the dove: a body, a raised wing, a tail, a head and a beak
  disc(c, Z.white, y - 0.2, z(3) + 0.2, 1.1, 0.8, 1.7, 0.14, -0.2);
  disc(c, Z.white, y + 1.2, z(3) - 0.3, 0.9, 1.9, 0.75, 0.18, 0.5);
  disc(c, Z.white, y + 0.45, z(3) - 1.9, 0.5, 1, 1, 0.14);
  strip(Z.white, y - 0.5, z(3) + 2.4, 0.5, 1.5, 0.3);
  strip(Z.orange, y + 0.4, z(3) - 2.5, 0.14, 0.4, 0);
  strip(Z.greenDark, y + 0.1, z(3) - 2.9, 0.1, 0.9, -0.5);
}

function shell(c: Ctx): void {
  const { b } = c;
  const xc = (S.x0 + S.x1) / 2;
  const zc = (S.z0 + S.z1) / 2;
  const w = S.x1 - S.x0;
  const d = S.z1 - S.z0;
  const win = (at: number, width: number) => ({ at, width, height: 3.3, sill: 0.7, kind: 'window' as const, lit: true });
  const door = (at: number, width: number, height = 3) => ({ at, width, height, kind: 'door' as const });
  // the west front: three pairs of glass doors with shop windows either side (`at` runs from the north end)
  wall(b, { x0: S.x0 + T / 2, z0: S.z0, x1: S.x0 + T / 2, z1: S.z1, height: S.h, thickness: T, material: 'concreteWall', tag: 'zarya-store', openings: [win(5.5, 7), win(14, 6), ...P.mainDoors.map((z) => door(z - S.z0, 3.2)), win(41, 5), win(48.5, 6)] });
  wall(b, { x0: S.x0, z0: S.z0 + T / 2, x1: S.x1, z1: S.z0 + T / 2, height: S.h, thickness: T, material: 'concreteWall', tag: 'zarya-store' });
  wall(b, { x0: S.x1 - T / 2, z0: S.z0, x1: S.x1 - T / 2, z1: S.z1, height: S.h, thickness: T, material: 'concreteWall', tag: 'zarya-store' });
  // the south side: the door from the service lane into the stair room
  wall(b, { x0: S.x0, z0: S.z1 - T / 2, x1: S.x1, z1: S.z1 - T / 2, height: S.h, thickness: T, material: 'concreteWall', tag: 'zarya-store', openings: [door(P.laneDoor.x - S.x0, 1.7, 2.4)] });
  // the floor, the ceiling, the roof slab over it (a roof overhead is what tells the game it is indoors)
  floorAroundPit(c, Z.terrazzo, S.x0 + T, S.z0 + T, S.x1 - T, S.z1 - T, 0.03);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w - T * 2, d - T * 2), Z.cream);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(xc, S.h - 0.02, zc);
  b.add(ceil, { cast: false });
  b.collide({ x: xc, z: zc, hx: w / 2, hz: d / 2, y0: S.h, y1: S.h + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: xc, z: zc, hx: w / 2, hz: d / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });
  // the floors above (shut: Act III), a band of lit windows on each, the parapet under snow
  box(b, Z.concrete, xc, (S.h + S.top) / 2, zc, w, S.top - S.h, d);
  box(b, Z.snow, xc, S.top + 0.12, zc, w + 0.4, 0.25, d + 0.4, 0, false);
  box(b, Z.warm, S.x0 - 0.04, 6.3, zc - 0.4, 0.06, 0.9, d - 6, 0, false);
  box(b, Z.warm, xc, 8, S.z1 + 0.04, w - 10, 1.2, 0.06, 0, false);
  mosaic(c);
  // the canopy over the doors, on four posts
  box(b, Z.concrete, S.x0 - 2.1, 3.7, -2, 4.4, 0.3, 20);
  box(b, Z.snow, S.x0 - 2.1, 3.94, -2, 4.5, 0.2, 20.1, 0, false);
  box(b, Z.warm, S.x0 - 2.1, 3.53, -2, 2, 0.03, 17, 0, false);
  for (const z of [-11.4, -5, 1, 7.4]) {
    box(b, Z.concreteDark, S.x0 - 4, 1.78, z, 0.3, 3.56, 0.3);
    solid(c, S.x0 - 4, z, 0.3, 0.3, 3.6, 'zarya-post', { kind: 'none' });
  }
  for (const z of [-8, 2]) b.light({ x: S.x0 - 2.4, y: 3.2, z, color: 0xffc27a, intensity: 22, distance: 18, mode: 'steady', pool: 7, weight: 1 });
  // the glass doors: the two northern pairs folded back against the inside of the wall (the way in), the southern pair
  // shut under the jammed shutter
  for (const z of P.mainDoors) {
    const shut = z === P.shutter.z;
    for (const sd of [-1, 1]) {
      if (shut) {
        const lz = z + sd * 0.8;
        box(b, Z.glass, S.x0 + T / 2, 1.5, lz, 0.04, 2.9, 1.5, 0, false);
        box(b, Z.iron, S.x0 + T / 2, 1.5, lz + sd * 0.76, 0.08, 3, 0.08, 0, false);
        box(b, Z.iron, S.x0 + T / 2, 1.5, lz - sd * 0.76, 0.08, 3, 0.08, 0, false);
        for (const y of [0.06, 2.96]) box(b, Z.iron, S.x0 + T / 2, y, lz, 0.08, 0.1, 1.6, 0, false);
        box(b, Z.steel, S.x0 + T / 2 + 0.08, 1.05, lz, 0.04, 0.05, 1.2, 0, false);
      } else {
        const lz = z + sd * 1.66;
        box(b, Z.glass, S.x0 + T + 0.8, 1.5, lz, 1.5, 2.9, 0.04, 0, false);
        box(b, Z.iron, S.x0 + T + 1.56, 1.5, lz, 0.08, 3, 0.08, 0, false);
        for (const y of [0.06, 2.96]) box(b, Z.iron, S.x0 + T + 0.8, y, lz, 1.6, 0.1, 0.08, 0, false);
      }
    }
  }
  // the jammed shutter: its curtain (half down, drawn by `zarya/look.ts`) runs in two guide rails from a roll box over the
  // doors; the motor beside it bangs; the doors under it are shut for the whole story (`zarya/doors.ts`)
  box(b, Z.steel, S.x0 + T + 0.12, 5.0, P.shutter.z, 0.36, 0.4, 3.7);
  for (const sd of [-1, 1]) box(b, Z.steel, S.x0 + T + 0.06, 2.5, P.shutter.z + sd * 1.72, 0.12, 5, 0.1, 0, false);
  box(b, Z.grey, S.x0 + T + 0.25, 4.6, P.shutter.z + 2.25, 0.5, 0.5, 0.6);
  // the motor's lead runs down the wall and along to its plug in a socket
  box(b, Z.iron, S.x0 + T + 0.03, 2.9, P.shutter.z + 2.25, 0.04, 2.9, 0.04, 0, false);
  box(b, Z.iron, S.x0 + T + 0.03, 1.45, (P.shutter.z + 2.25 + P.plug.z) / 2, 0.04, 0.04, P.plug.z - P.shutter.z - 2.25, 0, false);
  box(b, Z.grey, P.plug.x - 0.55, 1.3, P.plug.z, 0.1, 0.26, 0.26);
}

function hall(c: Ctx): void {
  const { b } = c;
  for (const k of COLUMNS) {
    box(b, Z.cream, k.x, S.h / 2, k.z, 0.8, S.h, 0.8);
    box(b, Z.woodDark, k.x, 0.5, k.z, 0.86, 1, 0.86, 0, false);
    for (const [dx, dz] of [[0.43, 0], [-0.43, 0]] as const) box(b, Z.bulb, k.x + dx, 3.1, k.z + dz, 0.06, 0.5, 0.22, 0, false);
    solid(c, k.x, k.z, 0.8, 0.8, S.h, 'zarya-column', { kind: 'wall' });
  }
  // the atrium: a fir to the ceiling in a striped tub, the still escalator beside it
  const A = P.atriumTree;
  firTree(b, A.x, A.z, 4.4, { lights: true, star: true, seed: 5, y: 0.5 });
  cyl(b, Z.red, A.x, 0, A.z, A.r, A.r, 0.5, 20);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    box(b, Z.white, A.x + Math.cos(a) * A.r, 0.25, A.z + Math.sin(a) * A.r, 0.9, 0.5, 0.06, -a + Math.PI / 2, false);
  }
  solid(c, A.x, A.z, A.r * 1.6, A.r * 1.6, 1, 'zarya-tub', { shots: false, kind: 'prop', surface: 'wood' });
  solid(c, A.x, A.z, 1.6, 1.6, 4.6, 'zarya-tree', { kind: 'none', surface: 'wood' });
  const E = P.escalator;
  const ex = (E.x0 + E.x1) / 2;
  const run = E.z1 - E.z0;
  const ang = Math.atan2(S.h, run);
  const L = Math.hypot(run, S.h);
  slab(b, Z.iron, ex, S.h / 2 - 0.1, (E.z0 + E.z1) / 2, 2.2, 0.3, L, ang, 0, 0);
  for (const s of [-1, 1]) {
    slab(b, Z.grey, ex + s * 1.3, S.h / 2 + 0.45, (E.z0 + E.z1) / 2, 0.3, 1.1, L, ang, 0, 0);
    slab(b, Z.black, ex + s * 1.3, S.h / 2 + 1.03, (E.z0 + E.z1) / 2, 0.34, 0.08, L, ang, 0, 0, false);
  }
  for (let i = 0; i < 26; i++) {
    const t = (i + 0.5) / 26;
    box(b, Z.steel, ex, S.h * (1 - t) + 0.08, E.z0 + t * run, 2.1, 0.06, 0.3, 0, false);
  }
  // roped off at its foot, shuttered at its head: the posts are here; the rope with its padlock and the shutter are the
  // story's (`zarya/look.ts`: the rope drops and the shutter rolls up once the padlock is broken)
  for (const s of [-1, 1]) cyl(b, Z.brass, ex + s * 1.3, 0, E.z1 + 0.6, 0.06, 0.06, 1, 6);
  solid(c, ex, (E.z0 + E.z1) / 2 + 0.3, E.x1 - E.x0 + 0.9, run + 0.8, S.h, 'zarya-escalator', { kind: 'prop', surface: 'metal' });

  // ---- the departments along the north wall: shelving behind, a counter in front ----
  const wz = S.z0 + T + 0.36;
  const cz = -24.4;
  const dept = (x0: number, x1: number, seed: number, mats?: readonly THREE.Material[]): void => {
    shelves(c, (x0 + x1) / 2, wz, x1 - x0, false, seed, { goods: mats, h: 3 });
    counter(c, (x0 + x1) / 2, cz, x1 - x0 - 1.2, false, seed + 5, { goods: mats });
  };
  dept(73, 88, 11, [Z.iron, Z.brass, Z.white, Z.grey]); // housewares
  dept(91, 104, 12, [Z.red, Z.blue, Z.woodPale, Z.black]); // sporting goods
  dept(107, 118, 13); // toys
  dept(121, 129, 14); // fabrics and coats
  // housewares: cast-iron pans along the counter, a samovar or two
  for (let i = 0; i < 5; i++) {
    cyl(b, Z.iron, 75 + i * 1.3, 1.06, cz + 0.05, 0.19, 0.17, 0.05, 12);
    box(b, Z.iron, 75 + i * 1.3, 1.08, cz + 0.36, 0.04, 0.03, 0.3, 0, false);
  }
  for (const x of [84.5, 86]) {
    cyl(b, Z.brass, x, 1.05, cz, 0.16, 0.13, 0.42, 10);
    cyl(b, Z.brass, x, 1.47, cz, 0.06, 0.04, 0.16, 8);
  }
  // sporting goods: skis and sticks stood against the shelving's ends, gloves and bats on the counter
  for (let i = 0; i < 6; i++) slab(b, GOODS[i % GOODS.length]!, 91.4 + i * 0.22, 1.1, wz + 0.5, 0.09, 2.1, 0.03, -0.12, 0, 0, false);
  for (let i = 0; i < 5; i++) slab(b, Z.woodPale, 103 + i * 0.16, 0.85, wz + 0.5, 0.04, 1.6, 0.04, -0.12, 0, 0, false);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) ball(b, Z.red, 96 + i * 0.7 + s * 0.14, 1.14, cz, 0.12, 1.2, 8);
  for (let i = 0; i < 3; i++) slab(b, Z.woodPale, 99.4 + i * 0.5, 1.07, cz, 0.07, 0.07, 0.8, 0, 0.3, 0, false);
  // toys: a few big bears on the counter
  for (let i = 0; i < 3; i++) {
    ball(b, Z.plush, 110 + i * 2.2, 1.26, cz, 0.24, 1.1, 8);
    ball(b, Z.plush, 110 + i * 2.2, 1.6, cz, 0.16, 1, 8);
  }

  // ---- the island counters, the coat racks, the mandarins ----
  STORE_BLOCKS.forEach((q, i) => {
    const x = (q.x0 + q.x1) / 2;
    const z = (q.z0 + q.z1) / 2;
    const len = q.x1 - q.x0;
    if (q.kind === 'case') counter(c, x, z, len, false, 60 + i * 3);
    else if (q.kind === 'crates') mandarins(c, x, z, q.x1 - q.x0, q.z1 - q.z0);
    else {
      // coats on a rail
      for (const s of [-1, 1]) cyl(b, Z.steel, x + (s * len) / 2, 0, z, 0.04, 0.04, 1.8, 6);
      box(b, Z.steel, x, 1.78, z, len, 0.05, 0.05, 0, false);
      for (let k = 0; k < len / 0.36; k++) box(b, GOODS[(k * 5 + i) % GOODS.length]!, x - len / 2 + 0.2 + k * 0.36, 1.12, z, 0.26, 1.2, 0.5 + ((k * 7) % 3) * 0.06, 0, false);
      solid(c, x, z, len, 0.8, 1.8, 'zarya-rack', { kind: 'prop', surface: 'wood' });
    }
  });
  for (const [x0, z0, x1, z1] of [[76, -14, 104, -14], [106, 10, 130, 10], [76, 0, 96, 0], [118, -14, 130, -14]] as const) garland(b, x0, z0, x1, z1, 4.5, 34);
  // lamps: a pendant in each bay (a real light in every other one)
  let n = 0;
  for (const x of [76, 88, 100, 112, 124, 135]) {
    for (const z of [-22, -12, 0, 10]) {
      cyl(b, Z.iron, x, 4.5, z, 0.02, 0.02, 0.7, 4, false);
      ball(b, Z.bulb, x, 4.4, z, 0.2);
      if (n++ % 2 === 0) b.light({ x, y: 4.2, z, color: 0xffcf96, intensity: 26, distance: 20, mode: 'steady', pool: 7, weight: 1 });
    }
  }

  // ---- the tea room in the north-east corner ----
  const R = P.teaRoom;
  wall(b, { x0: R.x0, z0: R.z0 + T, x1: R.x0, z1: R.z1, height: 3.2, thickness: 0.2, material: 'plaster', tag: 'zarya-partition', cast: false, openings: [{ at: 11, width: 2.6, height: 2.4, kind: 'door' }] });
  for (const x of [R.x0, R.x1 - 0.7]) box(b, Z.woodDark, x, 1.6, R.z1, 0.2, 3.2, 0.2);
  box(b, Z.redDark, (R.x0 + R.x1) / 2, 3.05, R.z1, R.x1 - R.x0, 0.3, 0.1, 0, false);
  counter(c, R.x1 - 1.3, -23, 11, true, 31, { goods: [Z.woodPale, Z.cream, Z.gold] });
  cyl(b, Z.brass, R.x1 - 1.3, 1.05, -27.4, 0.24, 0.2, 0.62, 12);
  cyl(b, Z.brass, R.x1 - 1.3, 1.67, -27.4, 0.09, 0.06, 0.28, 8);
  const tables: readonly (readonly [number, number])[] = [[133.2, -27], [135.6, -24.6], [132.9, -22.6], [P.zinaTable.x, P.zinaTable.z], [136, -16.6]];
  for (const [x, z] of tables) {
    cyl(b, Z.iron, x, 0, z, 0.05, 0.05, 1.08, 6);
    cyl(b, Z.iron, x, 0, z, 0.3, 0.26, 0.05, 10);
    cyl(b, Z.white, x, 1.08, z, 0.46, 0.46, 0.04, 14);
    cyl(b, Z.brass, x + 0.14, 1.12, z - 0.1, 0.035, 0.035, 0.1, 6, false);
    solid(c, x, z, 0.5, 0.5, 1.1, 'zarya-table', { shots: false, kind: 'none', surface: 'wood' });
  }
  b.light({ x: 135, y: 2.8, z: -22, color: 0xffc27a, intensity: 18, distance: 13, mode: 'steady', pool: 5, weight: 0.9 });
}

function southStrip(c: Ctx): { stairs: (area: number) => FloorLink } {
  const { b } = c;
  const z = S.strip;
  const zin = S.z1 - T;
  // the cloakroom: a long counter open to the hall, rows of coats behind, an end wall
  counter(c, 83.2, z, 24.6, false, 71, { goods: [Z.brass, Z.woodPale] });
  for (const rz of [17, 20.4]) {
    box(b, Z.steel, 83.2, 1.9, rz, 23, 0.05, 0.05, 0, false);
    for (let k = 0; k < 44; k++) box(b, GOODS[(k * 3) % GOODS.length]!, 72 + k * 0.52, 1.25, rz, 0.34, 1.2, 0.5, 0, false);
    for (let k = 0; k < 8; k++) cyl(b, Z.steel, 71.8 + k * 3.26, 0, rz, 0.04, 0.04, 1.9, 5, false);
    solid(c, 83.2, rz, 23, 0.7, 1.9, 'zarya-rack', { kind: 'prop', surface: 'wood' });
  }
  box(b, Z.cream, 83.2, 4.3, z, 25.4, 1.8, 0.3);
  // from the cloakroom's end to the east wall: the wall the noticeboard and the soda machines stand against, with the
  // door into the staff corridor
  wall(b, { x0: 96, z0: z, x1: S.x1 - T, z1: z, height: S.h, thickness: 0.3, material: 'plaster', tag: 'zarya-partition', cast: false, openings: [{ at: P.staffDoor.x - 96, width: 1.7, height: 2.4, kind: 'door' }] });
  wall(b, { x0: 96, z0: z, x1: 96, z1: zin, height: S.h, thickness: 0.3, material: 'plaster', tag: 'zarya-partition', cast: false });
  wall(b, { x0: P.corridor.x0, z0: z, x1: P.corridor.x0, z1: zin, height: S.h, thickness: 0.3, material: 'plaster', tag: 'zarya-partition', cast: false });
  wall(b, { x0: P.corridor.x1, z0: z, x1: P.corridor.x1, z1: zin, height: S.h, thickness: 0.3, material: 'plaster', tag: 'zarya-partition', cast: false, openings: [{ at: 5.6, width: 1.6, height: 2.4, kind: 'door' }] });
  wall(b, { x0: P.maintenance.x1, z0: z, x1: P.maintenance.x1, z1: zin, height: S.h, thickness: 0.3, material: 'plaster', tag: 'zarya-partition', cast: false, openings: [{ at: 7.6, width: 1.6, height: 2.4, kind: 'door' }] });
  // the doors themselves, each swung open against the wall of the room it opens into (a doorway is a door, held open)
  openLeaf(c, P.staffDoor.x - 0.85, z + 0.15, 'z', 1.6, Z.woodDark);
  openLeaf(c, P.corridor.x1 + 0.15, 19.6 - 0.8, 'x', 1.5, Z.woodDark);
  openLeaf(c, P.maintenance.x1 + 0.15, 21.6 - 0.8, 'x', 1.5, Z.woodDark);
  // the staff noticeboard: rotas, and two sheets that matter (`zarya/lines.ts`)
  const N = P.noticeboard;
  box(b, Z.woodPale, N.x, 1.7, z - 0.2, 3.4, 1.6, 0.06);
  box(b, Z.woodDark, N.x, 1.7, z - 0.18, 3.6, 1.8, 0.04, 0, false);
  for (let i = 0; i < 9; i++) box(b, i === 4 ? Z.cream : Z.white, N.x - 1.3 + (i % 5) * 0.65, 2.05 - Math.floor(i / 5) * 0.75, z - 0.25, 0.44, 0.6, 0.02, ((i * 37) % 7) * 0.02 - 0.06, false);
  // the wire's speaker box above it
  box(b, Z.woodDark, N.x - 2.6, 3.3, z - 0.25, 0.6, 0.45, 0.2);
  // the soda machines
  for (const x of P.soda) {
    box(b, Z.red, x, 1.0, z - 0.6, 1.1, 2.0, 0.9);
    box(b, Z.bulb, x, 1.5, z - 1.06, 0.8, 0.5, 0.02, 0, false);
    box(b, Z.steel, x, 0.8, z - 1.06, 0.5, 0.3, 0.03, 0, false);
  }
  solid(c, (P.soda[0]! + P.soda[3]!) / 2, z - 0.6, P.soda[3]! - P.soda[0]! + 1.1, 0.9, 2, 'zarya-soda', { kind: 'prop', surface: 'metal' });
  b.light({ x: 108, y: 2.6, z: z - 2.2, color: 0xffd0a0, intensity: 12, distance: 10, mode: 'steady', pool: 4, weight: 0.6 });

  // the maintenance room: the workbench with its vice, a pegboard, shelves of jars
  const W = P.bench;
  box(b, Z.wood, W.x, 0.9, W.z, 3.4, 0.1, 0.9);
  for (const s of [-1.5, 1.5]) box(b, Z.steel, W.x + s, 0.43, W.z, 0.08, 0.86, 0.8);
  box(b, Z.steel, W.x - 1.2, 1.05, W.z + 0.2, 0.3, 0.2, 0.24);
  box(b, Z.woodPale, W.x, 2.0, z + 0.2, 3.2, 1.3, 0.05, 0, false);
  for (let i = 0; i < 8; i++) box(b, Z.iron, W.x - 1.3 + i * 0.37, 2.0 + ((i * 3) % 4) * 0.12, z + 0.25, 0.06, 0.4, 0.03, ((i * 5) % 3) * 0.2, false);
  solid(c, W.x, W.z, 3.4, 0.9, 1, 'zarya-bench', { shots: false, kind: 'prop', surface: 'wood' });
  // the shelves of jars stand north of the door from the stair room (in front of it they shut the way through)
  shelves(c, P.maintenance.x1 - 0.6, 17.4, 3.4, true, 81, { goods: [Z.grey, Z.brass, Z.iron], h: 2.2, rows: 3 });
  b.light({ x: W.x, y: 2.8, z: 18, color: 0xffd0a0, intensity: 16, distance: 11, mode: 'steady', pool: 4.5, weight: 1 });
  b.light({ x: 118, y: 2.8, z: 19, color: 0xffd0a0, intensity: 10, distance: 9, mode: 'steady', pool: 4, weight: 0.6 });
  b.light({ x: 134, y: 2.8, z: 22, color: 0xffd0a0, intensity: 12, distance: 10, mode: 'steady', pool: 4, weight: 0.8 });
  // the stairs down, in the stair room (`stairPit`; `floors.ts` carries walkers to the shelter's vestibule)
  stairPit(c);
  return { stairs: (area) => stairLink(c, area) };
}

/**
 * The stair room's stairs down: an opening in the floor along the east wall, railed on its two open sides, and a flight
 * of sixteen steps going down northwards from its south end (the head, by the lane door) to a lit landing, where a steel
 * door frame turns west under the room towards the shelter. Walkers stop at the head (the ENTER prompt is there) and
 * come out at the foot of the same stairs in the shelter's vestibule (`floors.ts`, a teleport link).
 */
function stairPit(c: Ctx): void {
  const { b } = c;
  const { x0, x1, z0, z1 } = PIT;
  const xc = (x0 + x1) / 2;
  const w = x1 - x0;
  const bottom = -PIT.deep;
  const tread = 0.3;
  const rise = PIT.deep / PIT.steps;
  const foot = z1 - PIT.steps * tread;
  // the shaft: concrete walls down to the landing, painted green to the shoulder as the shelter is, a floor at the bottom
  box(b, Z.concrete, x0 - 0.1, bottom / 2 - 0.15, (z0 + z1) / 2, 0.2, PIT.deep + 0.3, z1 - z0);
  box(b, Z.concrete, x1 + 0.1, bottom / 2 - 0.15, (z0 + z1) / 2, 0.2, PIT.deep + 0.3, z1 - z0);
  box(b, Z.concrete, xc, bottom / 2 - 0.15, z0 - 0.1, w + 0.4, PIT.deep + 0.3, 0.2);
  box(b, Z.concrete, xc, bottom / 2 - 0.15, z1 + 0.1, w + 0.4, PIT.deep + 0.3, 0.2);
  box(b, Z.green, x1 - 0.01, bottom + 0.8, (z0 + foot) / 2, 0.02, 1.6, foot - z0, 0, false);
  box(b, Z.green, xc, bottom + 0.8, z0 + 0.01, w, 1.6, 0.02, 0, false);
  box(b, Z.concreteDark, xc, bottom - 0.1, (z0 + foot) / 2, w, 0.2, foot - z0 + 0.1);
  // the flight: each step a block of concrete down to the shaft's floor, with a worn steel nosing
  for (let i = 0; i < PIT.steps; i++) {
    const top = -(i + 1) * rise;
    const z = z1 - (i + 0.5) * tread;
    box(b, Z.concreteDark, xc, (top + bottom - 0.2) / 2, z, w, top - bottom + 0.2, tread);
    box(b, Z.steel, xc, top + 0.01, z + tread / 2 - 0.03, w, 0.02, 0.06, 0, false);
  }
  // the kerb round the opening, and a yellow edge at the head where the first step drops away
  box(b, Z.concreteDark, x0 - 0.1, 0.04, (z0 + z1) / 2, 0.24, 0.08, z1 - z0 + 0.2, 0, false);
  box(b, Z.concreteDark, xc, 0.04, z0 - 0.1, w + 0.2, 0.08, 0.24, 0, false);
  box(b, Z.gold, xc, 0.035, z1 + 0.1, w, 0.01, 0.16, 0, false);
  // the rail along the two open sides, waist high on posts, open at the head; a handrail down each side of the flight
  const railY = 1.0;
  box(b, Z.steel, x0 - 0.1, railY, (z0 + z1) / 2, 0.06, 0.06, z1 - z0 + 0.1, 0, false);
  box(b, Z.steel, x0 - 0.1, railY / 2, (z0 + z1) / 2, 0.04, 0.04, z1 - z0, 0, false);
  box(b, Z.steel, xc, railY, z0 - 0.1, w + 0.2, 0.06, 0.06, 0, false);
  box(b, Z.steel, xc, railY / 2, z0 - 0.1, w + 0.2, 0.04, 0.04, 0, false);
  for (let z = z0 - 0.1; z <= z1 + 0.01; z += (z1 - z0 + 0.1) / 5) box(b, Z.steel, x0 - 0.1, railY / 2, z, 0.06, railY, 0.06, 0, false);
  for (const x of [xc - w / 4, xc + w / 4]) box(b, Z.steel, x, railY / 2, z0 - 0.1, 0.06, railY, 0.06, 0, false);
  const fall = Math.atan2(PIT.deep, PIT.steps * tread);
  const len = Math.hypot(PIT.deep, PIT.steps * tread);
  for (const x of [x0 + 0.08, x1 - 0.08]) {
    slab(b, Z.iron, x, -PIT.deep / 2 + 0.95, (z1 + foot) / 2, 0.05, 0.05, len, -fall, 0, 0, false);
    for (const t of [0.15, 0.5, 0.85]) box(b, Z.iron, x, -PIT.deep * t + 0.5, z1 - t * PIT.steps * tread, 0.05, 0.9, 0.05, 0, false);
  }
  // the landing: a steel door frame in the west wall, the door swung back, the dark of the passage beyond
  const dz = (z0 + foot) / 2;
  box(b, Z.black, x0 - 0.22, bottom + 1.1, dz, 0.04, 2.2, 1.3, 0, false);
  for (const s of [-1, 1]) box(b, Z.iron, x0 + 0.02, bottom + 1.12, dz + s * 0.7, 0.1, 2.24, 0.1, 0, false);
  box(b, Z.iron, x0 + 0.02, bottom + 2.26, dz, 0.1, 0.1, 1.5, 0, false);
  box(b, Z.green, x0 + 0.08, bottom + 1.1, z0 + 0.25, 0.08, 2.2, 0.06 + 0.02, 0, false);
  box(b, Z.greenDark, x0 + 0.62, bottom + 1.1, z0 + 0.1, 1.2, 2.2, 0.08, 0, false);
  // over it a civil-defence plate: white, a red arrow pointing through the doorway
  downArrow(b, x0 + 0.02, bottom + 2.75, dz, 1);
  // a caged lamp on the shaft's north wall (it lights the flight from below), and one over the head
  cyl(b, Z.iron, xc + 0.6, bottom + 2.6, z0 + 0.12, 0.13, 0.13, 0.22, 6, false);
  ball(b, Z.bulb, xc + 0.6, bottom + 2.6, z0 + 0.14, 0.1);
  b.light({ x: xc + 0.4, y: bottom + 2.3, z: z0 + 0.8, color: 0xffc98a, intensity: 16, distance: 9, mode: 'steady', pool: 0, weight: 1 });
  box(b, Z.iron, x1 - 0.2, 3.4, z1 + 0.6, 0.4, 0.06, 0.06, 0, false);
  ball(b, Z.bulb, x1 - 0.42, 3.3, z1 + 0.6, 0.14);
  b.light({ x: xc, y: 3.1, z: z1 + 0.4, color: 0xffd0a0, intensity: 14, distance: 10, mode: 'steady', pool: 3, weight: 1.1 });
  // on the wall at the head: the shelter's plate (white, a red arrow down the stairs)
  downArrow(b, x1 - 0.02, 2.0, z1 - 0.8, -1);
  // nobody walks into the opening: the rail and the drop are one solid block (shots pass); the head is where ENTER is
  b.collide({ x: xc - 0.05, z: (z0 + z1) / 2, hx: w / 2 + 0.15, hz: (z1 - z0) / 2 + 0.15, y1: 1.1, blocksShots: false, mapKind: 'prop', tag: 'zarya-stairwell' });
}

/** A civil-defence plate on a wall that runs north-south: white, a red arrow pointing down (`out` = the way it faces in x). */
function downArrow(b: Ctx['b'], x: number, y: number, z: number, out: 1 | -1): void {
  box(b, Z.white, x, y, z, 0.03, 0.56, 0.5, 0, false);
  box(b, Z.red, x + out * 0.02, y + 0.08, z, 0.02, 0.28, 0.08, 0, false);
  for (const s of [-1, 1]) slab(b, Z.red, x + out * 0.02, y - 0.1, z + s * 0.07, 0.02, 0.2, 0.07, s * 0.75, 0, 0, false);
}

/** The stairs' link (built with the shelter, once its area exists): the head in the store, the foot in the vestibule. */
function stairLink(c: Ctx, area: number): FloorLink {
  const { floors } = c;
  const { x0, x1, z1 } = PIT;
  const xc = (x0 + x1) / 2;
  // the head, and a step back from it into the room (coming up, you come out there, facing the room)
  const head = { x: P.stairHead.x, y: 0, z: P.stairHead.z };
  const room = { x: xc - 2.4, y: 0, z: z1 + 1.0 };
  // in the shelter: the foot of the stairs, and a step out from it into the vestibule
  const F = P.stairFoot;
  // lower end first: [underground out-point, underground foot, street entry, street out-point]
  return floors.addLink(area, 0, [{ x: F.x + 1.6, y: 0, z: F.z }, { x: F.x, y: 0, z: F.z }, head, room], true);
}


/**
 * A door standing open at right angles to its wall: hinged at (x, z), its leaf running `len` along +`along` from the hinge
 * (into the room it opens into), a handle near its free edge. A thin collider so nobody walks through it.
 */
function openLeaf(c: Ctx, x: number, z: number, along: 'x' | 'z', len: number, mat: THREE.Material): void {
  const { b } = c;
  const cx = along === 'x' ? x + len / 2 : x;
  const cz = along === 'z' ? z + len / 2 : z;
  const w = along === 'x' ? len : 0.05;
  const d = along === 'z' ? len : 0.05;
  box(b, mat, cx, 1.15, cz, w, 2.3, d);
  const hx = along === 'x' ? x + len - 0.15 : x;
  const hz = along === 'z' ? z + len - 0.15 : z;
  for (const s of [-1, 1]) box(b, Z.brass, hx + (along === 'z' ? s * 0.05 : 0), 1.05, hz + (along === 'x' ? s * 0.05 : 0), 0.04, 0.04, 0.12, 0, false);
  c.b.collide({ x: cx, z: cz, hx: Math.max(w / 2, 0.05), hz: Math.max(d / 2, 0.05), y1: 2.3, blocksShots: false, mapKind: 'none', surface: 'wood', tag: 'zarya-door' });
}

/** What lies round the store: the pavement north of it, the service lane behind, and the wall that ends the map. */
function outside(c: Ctx): void {
  const { b } = c;
  floorAroundPit(c, Z.snow, 68, B.minZ, B.maxX, B.maxZ, 0.004);
  groundRect(b, Z.packed, 68, S.z1, B.maxX, 40, 0.012);
  groundRect(b, Z.packed, 68, -47, B.maxX, S.z0, 0.012);
  // the tram line going on east
  const z = P.trackZ;
  for (const s of [-1, 1]) box(b, Z.steel, (68 + B.maxX) / 2, 0.05, z + s * 0.72, B.maxX - 68, 0.09, 0.08, 0, false);
  box(b, Z.black, (68 + B.maxX) / 2, 5.5, z, B.maxX - 68, 0.03, 0.03, 0, false);
  for (const x of [84, 110, 136]) {
    cyl(b, Z.iron, x, 0, z - 3.6, 0.14, 0.1, 6.2, 8);
    box(b, Z.iron, x, 5.9, z - 1.8, 0.07, 0.07, 3.6, 0, false);
    solid(c, x, z - 3.6, 0.3, 0.3, 6.2, 'zarya-pole', { kind: 'none', surface: 'metal' });
  }
  groundRect(b, Z.packed, 68, z - 2.2, B.maxX, z + 2.2, 0.012);
  box(b, Z.concreteDark, (68 + B.maxX) / 2, 1.3, z - 6.6, B.maxX - 68, 2.6, 0.3);
  // the service lane: a loading dock, crates, a fence along its far side
  box(b, Z.concrete, 96, 0.5, S.z1 + 1.6, 16, 1, 3.2);
  solid(c, 96, S.z1 + 1.6, 16, 3.2, 1, 'zarya-dock', { shots: false, kind: 'prop' });
  box(b, Z.steel, 96, 2.4, S.z1 + 0.06, 6, 2.8, 0.1, 0, false);
  for (const [x, zz, w] of [[110, S.z1 + 1.2, 1.6], [112, S.z1 + 1.4, 1.2], [78, S.z1 + 1.2, 1.8], [124, 38.4, 1.6]] as const) {
    box(b, Z.woodPale, x, w / 2, zz, w, w, w, 0.2);
    solid(c, x, zz, w, w, w, 'zarya-crate', { kind: 'none', surface: 'wood' });
  }
  box(b, Z.concreteDark, (68 + B.maxX) / 2, 1.5, 40.2, B.maxX - 68, 3, 0.4);
  box(b, Z.snow, (68 + B.maxX) / 2, 3.06, 40.2, B.maxX - 68, 0.14, 0.5, 0, false);
  solid(c, (68 + B.maxX) / 2, 40.2, B.maxX - 68, 0.4, 3, 'zarya-wall', { kind: 'wall' });
  // the staff door, held open (Nina stands in it), its steel leaf swung out into the lane
  openLeaf(c, P.laneDoor.x - 0.85, S.z1 + 0.25, 'z', 1.6, Z.steel);
  // a lamp over the staff door
  box(b, Z.iron, P.laneDoor.x, 3.1, S.z1 + 0.3, 0.1, 0.1, 0.6, 0, false);
  ball(b, Z.bulb, P.laneDoor.x, 3.0, S.z1 + 0.6, 0.16);
  b.light({ x: P.laneDoor.x, y: 2.9, z: S.z1 + 1.2, color: 0xffb060, intensity: 20, distance: 15, mode: 'steady', pool: 5, weight: 1.2 });
  b.light({ x: 96, y: 4, z: S.z1 + 3, color: 0xffb060, intensity: 14, distance: 14, mode: 'steady', pool: 5, weight: 0.5 });
  b.light({ x: 105, y: 4.5, z: S.z0 - 6, color: 0xffb060, intensity: 14, distance: 16, mode: 'steady', pool: 6, weight: 0.5 });
}

export interface StoreHandles {
  /** The doorway under the jammed shutter (built open; a run shuts it until the plug is pulled). */
  shutter: BoxCollider;
}

export function buildStore(c: Ctx): { handles: StoreHandles; stairs: (area: number) => FloorLink } {
  outside(c);
  shell(c);
  hall(c);
  const strip = southStrip(c);
  const shutter = c.b.collide({ x: S.x0 + T / 2, z: P.shutter.z, hx: T / 2 + 0.1, hz: 1.6, y1: 3, blocksMove: false, blocksShots: false, mapKind: 'none', surface: 'metal', tag: 'zarya-shutter' });
  return { handles: { shutter }, stairs: strip.stairs };
}

// ---------------------------------------------------------------------------------------------------------------------
// the shelter
// ---------------------------------------------------------------------------------------------------------------------

export interface ShelterHandles {
  area: number;
  /** The blast door's opening (built open; the story shuts it behind the squad). */
  door: BoxCollider;
  stairs: FloorLink;
}

/** Half the width of the stair shaft coming down into the shelter's vestibule. */
const SHAFT_HALF = 1.4;

/**
 * The foot of the staff stairs in the shelter, matching their head in the store (`stairPit`): the same sixteen concrete
 * steps with steel nosings, coming down from the west through the vestibule's west wall out of a lit shaft (a landing at
 * the top where the stairs turn, its caged lamp, a handrail each side, green to the shoulder). Nobody walks up them:
 * LEAVE at their foot (`floors.ts`).
 */
function shaft(c: Ctx): void {
  const { b } = c;
  const V = SHELTER.vestibule;
  const h = SHAFT_HALF;
  const tread = 0.3;
  const rise = 0.25;
  const n = 16;
  const start = P.stairFoot.x - 0.6; // the first step's nose
  const top = n * rise;
  const landing = start - n * tread; // the top step's back edge, where the landing starts
  const west = landing - 1.4;
  const ceil = top + 2.6;
  // the shaft's walls (north, south, west), its ceiling, the wall over the vestibule's opening
  box(b, Z.concrete, (west + V.x0) / 2, ceil / 2, -h - 0.15, V.x0 - west + 0.3, ceil, 0.3);
  box(b, Z.concrete, (west + V.x0) / 2, ceil / 2, h + 0.15, V.x0 - west + 0.3, ceil, 0.3);
  box(b, Z.concrete, west - 0.15, ceil / 2, 0, 0.3, ceil, h * 2 + 0.6);
  box(b, Z.white, (west + V.x0) / 2, ceil + 0.1, 0, V.x0 - west + 0.3, 0.2, h * 2 + 0.6);
  box(b, Z.concrete, V.x0, (SHELTER.h + ceil) / 2, 0, 0.4, ceil - SHELTER.h, h * 2 + 0.2);
  box(b, Z.iron, V.x0 + 0.21, SHELTER.h - 0.06, 0, 0.04, 0.12, h * 2, 0, false);
  // green to the shoulder, following the steps up
  const fall = Math.atan2(top, start - landing);
  const len = Math.hypot(top, start - landing);
  for (const s of [-1, 1]) {
    slab(b, Z.green, (start + landing) / 2, top / 2 + 0.8, s * (h - 0.01), len, 1.6, 0.02, 0, 0, -fall, false);
    box(b, Z.green, (west + landing) / 2, top + 0.8, s * (h - 0.01), landing - west, 1.6, 0.02, 0, false);
  }
  // the steps, and their nosings
  for (let i = 0; i < n; i++) {
    const y = (i + 1) * rise;
    const x = start - (i + 0.5) * tread;
    box(b, Z.concreteDark, x, y / 2, 0, tread, y, h * 2);
    box(b, Z.steel, x + tread / 2 - 0.03, y + 0.01, 0, 0.06, 0.02, h * 2, 0, false);
  }
  box(b, Z.concreteDark, (west + landing) / 2, top / 2, 0, landing - west, top, h * 2);
  // the handrails, one each side on brackets
  for (const s of [-1, 1]) {
    slab(b, Z.iron, (start + landing) / 2, top / 2 + 0.95, s * (h - 0.08), len, 0.05, 0.05, 0, 0, -fall, false);
    for (const t of [0.15, 0.5, 0.85]) box(b, Z.iron, start - t * (start - landing), top * t + 0.5, s * (h - 0.08), 0.05, 0.9, 0.05, 0, false);
  }
  // the landing: where the stairs turn north (the way up to the store), a dark doorway in the north wall
  box(b, Z.black, (west + landing) / 2, top + 1.1, -h - 0.01, 1.1, 2.2, 0.04, 0, false);
  for (const s of [-1, 1]) box(b, Z.iron, (west + landing) / 2 + s * 0.6, top + 1.12, -h + 0.02, 0.1, 2.24, 0.1, 0, false);
  box(b, Z.iron, (west + landing) / 2, top + 2.26, -h + 0.02, 1.3, 0.1, 0.1, 0, false);
  // its caged lamp, high on the west wall, lighting the flight down
  cyl(b, Z.iron, west + 0.12, top + 2.1, 0, 0.13, 0.13, 0.22, 6, false);
  ball(b, Z.bulb, west + 0.14, top + 2.1, 0, 0.1);
  b.light({ x: west + 0.8, y: top + 1.8, z: 0, color: 0xffc98a, intensity: 16, distance: 10, mode: 'steady', pool: 0, weight: 1 });
  // nobody walks up them: the flight is one solid block (LEAVE at its foot)
  b.collide({ x: (start + west) / 2, z: 0, hx: (start - west) / 2, hz: h, y1: ceil, blocksShots: false, mapKind: 'none', tag: 'stairwell-door' });
}

export function buildShelter(c: Ctx, stairs: (area: number) => FloorLink): ShelterHandles {
  const { b, floors } = c;
  const H = SHELTER;
  const area = floors.addArea('The Shelter', 'under', 0, { minX: H.x0 - 2, maxX: H.x1 + 2, minZ: H.z0 - 2, maxZ: H.z1 + 2 });
  // the earth it is dug into: a dark block round it all, so no sky shows through a doorway
  const earth = new THREE.Mesh(new THREE.BoxGeometry(H.x1 - H.x0 + 12, 12, H.z1 - H.z0 + 8), new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1, side: THREE.BackSide }));
  earth.position.set((H.x0 + H.x1) / 2 - 2, 4, 0);
  b.add(earth, { cast: false, receive: false });
  const W = (x0: number, z0: number, x1: number, z1: number, openings?: { at: number; width: number }[], t = 0.4): void => {
    wall(b, { x0, z0, x1, z1, height: H.h, thickness: t, material: 'concreteWall', tag: 'zarya-shelter', cast: false, openings: openings?.map((o) => ({ ...o, height: 2.2, kind: 'door' as const, frame: 'steelDark' as const })) });
  };
  const V = H.vestibule;
  W(V.x0, V.z0, V.x1, V.z0);
  W(V.x0, V.z1, V.x1, V.z1);
  // the vestibule's west wall is open in the middle: the stairs come down through it (`shaft` below)
  W(V.x0, V.z0, V.x0, -SHAFT_HALF - 0.1);
  W(V.x0, SHAFT_HALF + 0.1, V.x0, V.z1);
  W(H.doorX, H.z0, H.doorX, H.z1, [{ at: -H.z0, width: H.doorHalf * 2 }], 0.7);
  W(H.doorX, H.z0, H.x1, H.z0);
  W(H.doorX, H.z1, H.x1, H.z1);
  W(H.x1, H.z0, H.x1, H.z1);
  W(H.main.x1, H.z0, H.main.x1, H.z1, [{ at: 3, width: 1.3 }, { at: 9, width: 1.3 }], 0.3);
  W(H.main.x1, 0, H.x1, 0, undefined, 0.3);
  // floor, ceiling (a roof overhead: indoors), the pipes along it
  groundRect(b, Z.concreteDark, H.x0, H.z0, H.x1, H.z1, 0.02);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0), Z.white);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((H.x0 + H.x1) / 2, H.h - 0.02, 0);
  b.add(ceil, { cast: false });
  b.collide({ x: (H.x0 + H.x1) / 2, z: 0, hx: (H.x1 - H.x0) / 2 + 1, hz: (H.z1 - H.z0) / 2 + 1, y0: H.h, y1: H.h + 0.4, mapKind: 'none', tag: 'roof' });
  for (const z of [-5.2, -4.9]) box(b, Z.grey, (H.doorX + H.x1) / 2, 2.95, z, H.x1 - H.doorX - 1, 0.1, 0.1, 0, false);
  // green to the shoulder on every wall of the main room and the vestibule
  const M = H.main;
  for (const z of [M.z0 + 0.22, M.z1 - 0.22]) box(b, Z.green, (M.x0 + M.x1) / 2, 0.8, z, M.x1 - M.x0 - 0.5, 1.6, 0.04, 0, false);
  for (const z of [V.z0 + 0.22, V.z1 - 0.22]) box(b, Z.green, (V.x0 + V.x1) / 2, 0.8, z, V.x1 - V.x0 - 0.5, 1.6, 0.04, 0, false);
  shaft(c);
  // lockers along the north wall, gas-mask bags on hooks beside them
  for (let i = 0; i < 10; i++) {
    box(b, Z.locker, 370.4 + i * 0.92, 0.95, M.z0 + 0.5, 0.88, 1.9, 0.56);
    box(b, Z.iron, 370.4 + i * 0.92 + 0.3, 1.2, M.z0 + 0.8, 0.05, 0.12, 0.03, 0, false);
  }
  solid(c, 374.6, M.z0 + 0.5, 9.4, 0.6, 1.9, 'zarya-lockers', { kind: 'prop', surface: 'metal' });
  box(b, Z.woodDark, 383, 1.75, M.z0 + 0.26, 5, 0.08, 0.06, 0, false);
  for (let i = 0; i < 7; i++) box(b, Z.greenDark, 380.9 + i * 0.7, 1.3, M.z0 + 0.4, 0.42, 0.7, 0.24, 0, false);
  // the clock that says 23:57, the wire's speaker box
  const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16), Z.white);
  ck.rotation.x = Math.PI / 2;
  ck.position.set(385.2, 2.4, M.z0 + 0.26);
  b.add(ck, { cast: false });
  slab(b, Z.black, 385.19, 2.47, M.z0 + 0.3, 0.03, 0.16, 0.01, 0, 0, 0.03, false);
  slab(b, Z.black, 385.165, 2.5, M.z0 + 0.3, 0.02, 0.24, 0.01, 0, 0, 0.31, false);
  box(b, Z.woodDark, 386.6, 2.3, M.z0 + 0.32, 0.6, 0.42, 0.2);
  box(b, Z.black, 386.6, 2.3, M.z0 + 0.43, 0.4, 0.26, 0.02, 0, false);
  // posters on the south wall (no words: shapes in red and black), the bunk benches under them
  for (let i = 0; i < 3; i++) {
    box(b, Z.cream, 372 + i * 5, 2.2, M.z1 - 0.23, 1.5, 1.0, 0.03, 0, false);
    box(b, i === 1 ? Z.black : Z.red, 372 + i * 5, 2.15, M.z1 - 0.25, 0.8, 0.6, 0.02, 0, false);
  }
  // (the first stands clear of the manual release by the door)
  for (const x of [373.8, 381.8]) {
    box(b, Z.wood, x, 0.45, M.z1 - 0.7, 6, 0.1, 0.9);
    box(b, Z.wood, x, 0.9, M.z1 - 0.3, 6, 0.6, 0.08, 0, false);
    for (const s of [-2.8, 2.8]) box(b, Z.woodDark, x + s, 0.22, M.z1 - 0.7, 0.1, 0.44, 0.9);
    solid(c, x, M.z1 - 0.7, 6, 0.9, 0.6, 'zarya-bunk', { shots: false, kind: 'none', surface: 'wood' });
  }
  // the long table: the teapot, the glasses
  const Tb = P.table;
  box(b, Z.wood, Tb.x, 0.78, Tb.z, 6.4, 0.1, 1.3);
  for (const s of [-2.9, 2.9]) box(b, Z.woodDark, Tb.x + s, 0.36, Tb.z, 0.14, 0.73, 1.1);
  for (const s of [-1, 1]) {
    box(b, Z.wood, Tb.x, 0.45, Tb.z + s * 1.15, 6, 0.08, 0.36);
    solid(c, Tb.x, Tb.z + s * 1.15, 6, 0.36, 0.5, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
  }
  cyl(b, Z.white, Tb.x - 0.4, 0.83, Tb.z, 0.13, 0.11, 0.2, 10);
  for (let i = 0; i < 5; i++) cyl(b, Z.brass, Tb.x + 0.3 + (i % 3) * 0.22, 0.83, Tb.z - 0.12 + Math.floor(i / 3) * 0.22, 0.035, 0.035, 0.1, 6, false);
  solid(c, Tb.x, Tb.z, 6.4, 1.3, 0.85, 'zarya-table', { shots: false, kind: 'prop', surface: 'wood' });
  // the manual release: a grey panel by the door (its lever is drawn by `zarya/look.ts`)
  const Rl = P.release;
  box(b, Z.grey, Rl.x, 1.3, M.z1 - 0.26, 0.7, 0.9, 0.1);
  // the watch room: a desk and lamp, the key cabinet, the safe, the rack (the pistols on it: `zarya/look.ts`)
  box(b, Z.wood, 391, 0.76, -5.0, 1.8, 0.08, 0.9);
  for (const s of [-0.8, 0.8]) box(b, Z.woodDark, 391 + s, 0.36, -5.0, 0.08, 0.72, 0.8);
  solid(c, 391, -5.0, 1.8, 0.9, 0.8, 'zarya-desk', { shots: false, kind: 'none', surface: 'wood' });
  cyl(b, Z.greenDark, 390.5, 0.8, -5.2, 0.1, 0.02, 0.3, 8, false);
  box(b, Z.woodDark, 389.2, 1.7, H.z0 + 0.3, 0.9, 1.1, 0.16);
  for (let i = 0; i < 12; i++) box(b, Z.brass, 388.9 + (i % 4) * 0.2, 2.0 - Math.floor(i / 4) * 0.3, H.z0 + 0.4, 0.04, 0.12, 0.02, 0, false);
  box(b, Z.locker, 393.6, 0.75, H.z0 + 0.7, 1.1, 1.5, 0.9);
  cyl(b, Z.iron, 393.6, 0.9, H.z0 + 1.16, 0.12, 0.12, 0.04, 10, false);
  solid(c, 393.6, H.z0 + 0.7, 1.1, 0.9, 1.5, 'zarya-safe', { kind: 'prop', surface: 'metal' });
  box(b, Z.woodDark, H.x1 - 0.3, 1.5, P.rack.z, 0.12, 1.1, 1.6);
  for (let i = 0; i < 3; i++) box(b, Z.woodPale, H.x1 - 0.42, 1.2 + i * 0.3, P.rack.z, 0.14, 0.04, 1.3, 0, false);
  // the storeroom: crates, the shelter kit on its shelf, a rolled stretcher
  for (const [x, z, w] of [[389.6, 4.8, 1.3], [391.2, 5.0, 1.0], [389.5, 1.2, 1.1], [395.6, 1.4, 1.2]] as const) {
    box(b, Z.woodPale, x, w / 2, z, w, w, w);
    solid(c, x, z, w, w, w, 'zarya-crate', { kind: 'none', surface: 'wood' });
  }
  box(b, Z.wood, 393.4, 0.9, 5.4, 3, 0.06, 0.7);
  for (const s of [-1.4, 1.4]) box(b, Z.woodDark, 393.4 + s, 0.45, 5.4, 0.08, 0.9, 0.7);
  box(b, Z.greenDark, P.kit.x, 1.1, 5.4, 0.8, 0.34, 0.5);
  box(b, Z.white, P.kit.x, 1.1, 5.14, 0.24, 0.07, 0.02, 0, false);
  box(b, Z.white, P.kit.x, 1.1, 5.14, 0.07, 0.24, 0.02, 0, false);
  cyl(b, Z.greenDark, 396.2, 0, 4.4, 0.2, 0.2, 1.9, 8);
  solid(c, 393.4, 5.4, 3, 0.7, 1.3, 'zarya-shelf', { shots: false, kind: 'none', surface: 'wood' });
  // bare bulbs in cages
  for (const [x, z, k] of [[364, 0, 0.7], [372, -1, 1], [378, 1.5, 1], [384, -1, 1], [392.4, -3, 0.8], [392.4, 3, 0.8]] as const) {
    cyl(b, Z.iron, x, H.h - 0.3, z, 0.02, 0.02, 0.3, 4, false);
    ball(b, Z.bulb, x, H.h - 0.4, z, 0.1);
    b.light({ x, y: H.h - 0.5, z, color: 0xffc98a, intensity: 13 * k, distance: 10, mode: 'steady', pool: 4, weight: 1 });
  }
  const door = b.collide({ x: H.doorX, z: 0, hx: 0.4, hz: H.doorHalf, y1: 2.4, blocksMove: false, blocksShots: false, mapKind: 'none', surface: 'metal', tag: 'zarya-blastdoor' });
  void goods;
  return { area, door, stairs: stairs(area) };
}
