/**
 * THE ASYLUM: Blackwood Hill, a walled psychiatric hospital on a hilltop. Close quarters: two ward wings of cells on a
 * single corridor, an admin block, a walled yard between the wings, then the chapel, the isolation block and the morgue
 * at the back of the grounds.
 *
 *   S    Front grounds   gatehouse and insertion, the drive and fountain, the lawn LZ, the groundskeeper's stores (low)
 *   mid  The wards        admin block, west and east ward wings, the yard, the cemetery, the boiler house (medium)
 *   N    The back        chapel and bell tower, the isolation block (the Matron), the morgue, the crematorium (high)
 *
 * Every room has at least two ways in or out except the cells, and every doorway is at least 1.5 m wide, so nothing
 * (player, helper or infected) can be sealed in; `tests/levels.test.ts` checks it against the real colliders.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { helipad, quarantineGate, spire, transmitterSite, type SpireHandle, type TransmitterHandle } from '../landmarks';
import { bench, corpse, crateGroup, debris, deadTree, generator, barrelGroup, streetLamp, vehicle } from '../props';
import { ceilingLight, emergencyLight, gurney, labBench, lockerRow, officeDesk } from '../interiors';
import { addBox, building, groundRect, perimeterWall, wallDecal, type Opening } from '../structures';
import { HALF_PI, type Ctx } from './util';

export const ASYLUM_BOUNDS = { minX: -56, maxX: 56, minZ: -46, maxZ: 46 };
export const ASYLUM = {
  start: { x: 0, z: 38 },
  lz: { x: -38, z: 31, radius: 10, terminalX: -26.5, terminalZ: 24 },
  /** The boiler house yard: start the generators and hold while they spin up. */
  power: { x: 42, z: 4, radius: 9 },
  /** The isolation block, where the Matron does her rounds. */
  isolation: { x: 0, z: -36 },
  matron: { x: 0, z: -33.5 },
  /** The crematorium stack: the black fog comes from here. */
  stack: { x: 46, z: -40 },
};

const DOOR = 1.6;
const DOOR_H = 2.4;
const door = (at: number, width = DOOR, height = DOOR_H): Opening => ({ at, width, height, kind: 'door', frame: 'wood' });
const win = (at: number, lit = false): Opening => ({ at, width: 1.3, height: 1.7, sill: 1.1, kind: 'window', frame: 'steelDark', lit });

/** The hill: flat inside the walls, falling away beyond them, under a ring of black pines (no colliders). */
function hillside(c: Ctx): void {
  const { b } = c;
  const B = ASYLUM_BOUNDS;
  const drop = (x: number, z: number): number => {
    const out = Math.max(Math.abs(x) - B.maxX, Math.abs(z) - B.maxZ, 0);
    return out < 6 ? 0 : -Math.min(55, (out - 6) * 0.42);
  };
  const ground = new THREE.PlaneGeometry(900, 900, 90, 90);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position!;
  for (let i = 0; i < pos.count; i++) pos.setY(i, drop(pos.getX(i), pos.getZ(i)) - 0.02);
  ground.computeVertexNormals();
  const mesh = new THREE.Mesh(ground, b.mats.get('grass'));
  mesh.receiveShadow = true;
  b.add(mesh);
  const pines: THREE.BufferGeometry[] = [];
  let s = 1961;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 420; i++) {
    const a = rand() * Math.PI * 2;
    const r = 70 + rand() * 120;
    const x = Math.cos(a) * r * 1.15;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < B.maxX + 8 && Math.abs(z) < B.maxZ + 8) continue;
    const h = 9 + rand() * 12;
    const cone = new THREE.ConeGeometry(1.8 + rand() * 1.8, h, 6);
    cone.translate(x, drop(x, z) + h / 2 - 0.5, z);
    pines.push(cone);
  }
  const forest = new THREE.Mesh(mergeGeometries(pines), new THREE.MeshStandardMaterial({ color: 0x0b1610, roughness: 1 }));
  b.add(forest, { cast: false, receive: false });
}

/** A second storey nobody reaches: brick mass with dark (rarely lit) barred windows, on top of a building's roof. */
function upperStorey(c: Ctx, x: number, z: number, w: number, d: number, y0: number, h: number, seed: number): void {
  const { b } = c;
  addBox(b, 'brick', x, y0 + h / 2, z, w, h, d, 0);
  addBox(b, 'concreteDark', x, y0 + h + 0.15, z, w + 0.5, 0.3, d + 0.5, 0); // cornice
  let s = seed;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const face = (horizontal: boolean, sign: number): void => {
    const span = horizontal ? w : d;
    const n = Math.max(1, Math.floor(span / 3.4));
    for (let i = 0; i < n; i++) {
      const along = -span / 2 + (span / n) * (i + 0.5);
      const px = horizontal ? x + along : x + sign * (w / 2 + 0.02);
      const pz = horizontal ? z + sign * (d / 2 + 0.02) : z + along;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), b.mats.get(rand() < 0.08 ? 'windowLit' : 'glassDark'));
      pane.position.set(px, y0 + h / 2, pz);
      pane.rotation.y = horizontal ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? HALF_PI : -HALF_PI;
      b.add(pane, { cast: false, receive: false });
    }
  };
  face(true, 1);
  face(true, -1);
  face(false, 1);
  face(false, -1);
}

/**
 * A ward wing: one long corridor down the middle, six cells either side. `inner` is the side facing the yard (and
 * the admin block). Cells by the doors to the outside are vestibules (a door to the corridor and one outside).
 */
function wardWing(c: Ctx, cx: number, inner: 'E' | 'W', tag: string): void {
  const { b } = c;
  const w = 14;
  const z0 = -22;
  const z1 = 10;
  const t = 0.4;
  const H = 4.6;
  const ix0 = cx - w / 2 + t;
  const ix1 = cx + w / 2 - t;
  const iz0 = z0 + t;
  const iz1 = z1 - t;
  const cell = (iz1 - iz0) / 6; // 5.2 m
  const mid = (k: number): number => iz0 + cell * (k + 0.5);
  // E side runs from iz0 upward; W side from iz1 downward: `at` along each
  const atE = (z: number): number => z - iz0;
  const atW = (z: number): number => iz1 - z;
  const at = (side: 'E' | 'W', z: number): number => (side === 'E' ? atE(z) : atW(z));
  const outer: 'E' | 'W' = inner === 'E' ? 'W' : 'E';
  // inner side: to the admin block (cell 5) and the yard (cell 2); outer side: to the grounds (cell 1); windows elsewhere
  const innerOpen = [door(at(inner, mid(5)), 1.6), door(at(inner, mid(2)), 1.6), win(at(inner, mid(0))), win(at(inner, mid(3)), true), win(at(inner, mid(4)))];
  const outerOpen = [door(at(outer, mid(1)), 1.6), win(at(outer, mid(0))), win(at(outer, mid(2))), win(at(outer, mid(3))), win(at(outer, mid(4)), true), win(at(outer, mid(5)))];
  const corridorL = cx - 1.6;
  const corridorR = cx + 1.6;
  const partitions = [];
  for (const x of [corridorL, corridorR]) {
    partitions.push({ x0: x, z0: iz0, x1: x, z1: iz1, material: 'plaster' as const, thickness: 0.22, openings: [0, 1, 2, 3, 4, 5].map((k) => door(mid(k) - iz0, 1.5, 2.3)) });
  }
  for (let k = 1; k < 6; k++) {
    const z = iz0 + cell * k;
    partitions.push({ x0: ix0, z0: z, x1: corridorL - 0.11, z1: z, material: 'plaster' as const, thickness: 0.2 });
    partitions.push({ x0: corridorR + 0.11, z0: z, x1: ix1, z1: z, material: 'plaster' as const, thickness: 0.2 });
  }
  building(b, {
    x: cx, z: (z0 + z1) / 2, w, d: z1 - z0, height: H, wallMaterial: 'brick', roofMaterial: 'roof', floorMaterial: 'tile', ceilingMaterial: 'plaster', parapet: 0.4,
    sides: {
      [inner]: { openings: innerOpen },
      [outer]: { openings: outerOpen },
      // the corridor runs out of both ends; S measures from the east end, N from the west end
      S: { openings: [door(ix1 + t - cx, 1.8, 2.6)] },
      N: { openings: [door(cx - (ix0 - t), 1.8, 2.6)] },
    },
    partitions,
    tag,
  });
  upperStorey(c, cx, (z0 + z1) / 2, w, z1 - z0, H + 0.4, 3.6, tag.length * 97);
  // the corridor: tube lights, some failing; an emergency beacon at each end
  for (let k = 0; k < 6; k++) ceilingLight(b, { x: cx, z: mid(k), y: H - 0.05, kind: 'tube', rot: HALF_PI, mode: k === 2 ? 'fail' : k === 4 ? 'flicker' : 'steady', color: 0xd8e6dc, intensity: 26 });
  emergencyLight(b, { x: cx, y: H - 0.3, z: iz0 + 0.3, phase: cx });
  emergencyLight(b, { x: cx, y: H - 0.3, z: iz1 - 0.3, phase: cx + 0.7 });
  // cells: a cot (gurney) against the outer wall in most, lockers in the day room, an overturned desk
  const cellX = (side: 'L' | 'R'): number => (side === 'L' ? (ix0 + corridorL) / 2 : (corridorR + ix1) / 2);
  const wallX = (side: 'L' | 'R'): number => (side === 'L' ? ix0 + 0.6 : ix1 - 0.6);
  for (let k = 0; k < 6; k++) {
    for (const side of ['L', 'R'] as const) {
      const vestibule = (side === 'L') === (inner === 'W') ? k === 5 || k === 2 : k === 1;
      if (vestibule) continue;
      if ((k + (side === 'L' ? 0 : 1)) % 3 === 0) gurney(b, { x: wallX(side), z: mid(k) - 1.3, rot: 0, covered: k % 2 === 0 });
      else if (k === 3) lockerRow(b, { x: wallX(side) + (side === 'L' ? 0.1 : -0.1), z: mid(k) + 1.2, rot: side === 'L' ? HALF_PI : -HALF_PI, count: 3 });
      if (k % 2 === 1) ceilingLight(b, { x: cellX(side), z: mid(k), y: H - 0.05, kind: 'panel', mode: k === 1 ? 'flicker' : 'steady', color: 0xe6efe0, intensity: 22 });
    }
  }
  wallDecal(b, 'mold', cx - 1.5, 2.2, mid(1), 2.4, 1.6, HALF_PI);
  wallDecal(b, 'grime', cx + 1.5, 1.6, mid(4), 3, 1.4, -HALF_PI);
}

export interface AsylumResult {
  transmitter: TransmitterHandle;
  spire: SpireHandle;
}

export function buildAsylum(c: Ctx): AsylumResult {
  const { b, d } = c;
  const B = ASYLUM_BOUNDS;

  // ---- ground: the hilltop lawn, falling away beyond the walls into a pine forest ----
  hillside(c);
  groundRect(b, 'gravel', -3, 18, 3, 45, 0.012);
  d.road(-3, 18, 3, 45, 'THE DRIVE');
  groundRect(b, 'gravel', -55, 16, 55, 19, 0.011);
  d.road(-55, 16, 55, 19, 'FRONT WALK');
  groundRect(b, 'gravel', -55, -26, 55, -23, 0.0115);
  d.road(-55, -26, 55, -23, 'BACK WALK');
  groundRect(b, 'concreteSlab', -15, -22, 15, 4, 0.013); // the yard's flagstones
  groundRect(b, 'dirt', -52, -21, -33, 9, 0.014); // the cemetery
  groundRect(b, 'concreteSlab', 31, -21, 54, 13, 0.0125); // the boiler house yard
  groundRect(b, 'gravel', -10, -30, 10, -26, 0.012);

  d.regionRects.push(
    { region: 'high', x0: -57, z0: -47, x1: 57, z1: -26 },
    { region: 'medium', x0: -57, z0: -26, x1: 57, z1: 16 },
  );
  d.label('FRONT GROUNDS', 22, 40, 0.8);
  d.label('THE LAWN', -38, 44, 0.8);
  d.label('WEST WARD', -22, -6, 0.75);
  d.label('EAST WARD', 22, -6, 0.75);
  d.label('THE YARD', 0, -12, 0.75);
  d.label('CEMETERY', -43, -6, 0.75);
  d.label('BOILER HOUSE', 44, -22, 0.75);
  d.label('CHAPEL', -28, -44, 0.75);
  d.label('ISOLATION', 0, -44, 0.75);
  d.label('MORGUE', 28, -44, 0.75);

  // ---- boundary: a high brick wall all round, the iron gate at the foot of the drive ----
  const X = B.maxX - 0.6;
  const Z = B.maxZ - 0.6;
  perimeterWall(b, -X, -Z, X, -Z, 5.5, 'brick');
  perimeterWall(b, -X, Z, X, Z, 5.5, 'brick');
  perimeterWall(b, -X, -Z, -X, Z, 5.5, 'brick');
  perimeterWall(b, X, -Z, X, Z, 5.5, 'brick');
  quarantineGate(b, { x: 0, z: Z - 1.8, rot: Math.PI, width: 8, open: 0 });
  wallDecal(b, 'stencilQuarantine', 14, 2.6, Z - 0.62, 8, 2.2, Math.PI);
  wallDecal(b, 'stencilKeepOut', -X + 0.62, 2.6, -10, 8, 2.2, HALF_PI);
  b.collide({ x: 0, z: -B.maxZ - 6, hx: 90, hz: 2, y1: 30, mapKind: 'none' });
  b.collide({ x: 0, z: B.maxZ + 6, hx: 90, hz: 2, y1: 30, mapKind: 'none' });
  b.collide({ x: B.minX - 6, z: 0, hx: 2, hz: 70, y1: 30, mapKind: 'none' });
  b.collide({ x: B.maxX + 6, z: 0, hx: 2, hz: 70, y1: 30, mapKind: 'none' });

  // ---- front grounds (low) ----
  building(b, {
    x: -10, z: 41, w: 7, d: 5, height: 3.4, wallMaterial: 'brick', roofMaterial: 'roof', floorMaterial: 'wood', ceilingMaterial: 'plaster',
    sides: { E: { openings: [door(2.3, 1.6)] }, N: { openings: [win(3.5, true)] } },
    tag: 'gatehouse',
  });
  ceilingLight(b, { x: -10, z: 41, y: 3.35, kind: 'caged', color: 0xffd8a0, intensity: 40 });
  // the fountain in the turning circle
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.7, 20), b.mats.get('concreteWall'));
  basin.position.set(0, 0.35, 29);
  b.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), b.mats.get('glassDark'));
  water.rotation.x = -HALF_PI;
  water.position.set(0, 0.62, 29);
  b.add(water, { cast: false });
  // a weathered stone figure on a plinth: the founder, arms open to the drive
  addBox(b, 'concreteDark', 0, 1.0, 29, 0.9, 0.9, 0.9);
  addBox(b, 'concreteWall', 0, 2.05, 29, 0.42, 1.2, 0.3);
  addBox(b, 'concreteWall', 0, 2.5, 29, 1.1, 0.16, 0.18);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), b.mats.get('concreteWall'));
  head.position.set(0, 2.85, 29);
  b.add(head);
  b.collideBox(0, 29, 5, 5, 0.75, { mapKind: 'prop', tag: 'fountain' });
  b.collideBox(0, 29, 0.7, 0.7, 2.5, { mapKind: 'prop', tag: 'fountain' });
  for (const [x, z] of [[-4, 22], [4, 22], [-4, 36], [4, 36]] as const) streetLamp(b, { x, z, rot: x < 0 ? HALF_PI : -HALF_PI, armDir: x < 0 ? HALF_PI : -HALF_PI, style: 'cobra', on: true, color: 0xffc070, mode: x > 0 && z > 30 ? 'flicker' : 'steady' });
  // the lawn and its emergency pad; an abandoned ambulance by the drive
  helipad(b, { x: ASYLUM.lz.x, z: ASYLUM.lz.z, rot: 0, radius: 7.6 });
  vehicle(b, { x: -8, z: 26, rot: 0.2, kind: 'van', seed: 301 });
  vehicle(b, { x: 9, z: 41, rot: HALF_PI + 0.1, kind: 'sedan', seed: 302 });
  deadTree(b, { x: -18, z: 36, scale: 1.2, seed: 303 });
  deadTree(b, { x: 22, z: 24, scale: 1, seed: 304 });
  bench(b, { x: -6, z: 31, rot: HALF_PI });
  bench(b, { x: 6, z: 31, rot: -HALF_PI });
  // groundskeeper's stores (the buy station)
  building(b, {
    x: 36, z: 33, w: 10, d: 8, height: 3.6, wallMaterial: 'wood', roofMaterial: 'roof', floorMaterial: 'wood', ceilingMaterial: 'wood',
    sides: { W: { openings: [door(4, 1.8)] }, S: { openings: [win(5, true)] }, N: { openings: [door(5, 1.6)] } },
    tag: 'stores',
  });
  ceilingLight(b, { x: 36, z: 33, y: 3.55, kind: 'caged', color: 0xffd8a0, intensity: 45 });
  crateGroup(b, { x: 50, z: 40, rot: 0.4, count: 4, radius: 1.3, seed: 305 });
  barrelGroup(b, { x: 50, z: 25, rot: 0, count: 4, radius: 1.2, seed: 306, colors: ['rust', 'green'] });
  d.station({ kind: 'buy', name: 'GROUNDSKEEPER STORES', x: 26, z: 30, yaw: HALF_PI, region: 'low' });
  d.crate(-20, 44, 0.3, 'low');
  d.crate(18, 44, 1.1, 'low');
  d.crate(-50, 20, 0, 'low');

  // ---- the admin block: the front hall, three offices behind it ----
  building(b, {
    x: 0, z: 11, w: 24, d: 14, height: 5.2, wallMaterial: 'brick', roofMaterial: 'roof', floorMaterial: 'wood', ceilingMaterial: 'plaster', parapet: 0.5,
    sides: {
      S: { openings: [door(12, 2.6, 3), win(5, true), win(19)] },
      N: { openings: [door(12, 2, 2.6)] },
      W: { openings: [door(17.6 - 7, 1.6)] },
      E: { openings: [door(7 - 4.4, 1.6)] },
    },
    partitions: [
      { x0: -11.6, z0: 11, x1: 11.6, z1: 11, material: 'plaster', openings: [door(3.6, 1.6), door(11.6, 1.8), door(19.6, 1.6)] },
      { x0: -4, z0: 4.4, x1: -4, z1: 10.9, material: 'plaster' },
      { x0: 4, z0: 4.4, x1: 4, z1: 10.9, material: 'plaster' },
    ],
    tag: 'admin',
  });
  upperStorey(c, 0, 11, 24, 14, 5.6, 4, 411);
  // a clock tower over the entrance
  addBox(b, 'brick', 0, 11.5, 17, 4, 4, 4);
  addBox(b, 'concreteDark', 0, 13.7, 17, 4.6, 0.4, 4.6);
  // the clock stopped at the hour the power failed; a dim lamp still shows its face
  const clock = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), b.mats.get('paintWhite'));
  clock.position.set(0, 11.6, 19.03);
  b.add(clock, { cast: false });
  for (const [len, rot] of [[0.55, -0.9], [0.85, 0.35]] as const) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, len, 0.02).translate(0, len / 2, 0), b.mats.get('paintBlack'));
    hand.position.set(0, 11.6, 19.06);
    hand.rotation.z = rot;
    b.add(hand, { cast: false });
  }
  b.light({ x: 0, y: 12.8, z: 19.8, color: 0xffe0a0, intensity: 10, distance: 5 });
  ceilingLight(b, { x: -6, z: 14.5, y: 5.15, kind: 'panel', color: 0xfff0d8, intensity: 30 });
  ceilingLight(b, { x: 6, z: 14.5, y: 5.15, kind: 'panel', mode: 'flicker', color: 0xfff0d8, intensity: 30 });
  ceilingLight(b, { x: -8, z: 7.5, y: 5.15, kind: 'tube', color: 0xe8f0e0 });
  ceilingLight(b, { x: 8, z: 7.5, y: 5.15, kind: 'tube', mode: 'fail', color: 0xe8f0e0 });
  officeDesk(b, { x: -8, z: 6, rot: Math.PI, chair: true });
  officeDesk(b, { x: 9, z: 6.4, rot: Math.PI - 0.4, chair: false });
  officeDesk(b, { x: 0, z: 14.4, rot: 0, chair: true }); // reception
  lockerRow(b, { x: -11.2, z: 14.5, rot: HALF_PI, count: 4 });

  // ---- the ward wings ----
  wardWing(c, -22, 'E', 'west-ward');
  wardWing(c, 22, 'W', 'east-ward');

  // ---- the yard: flagstones, a dead elm, planters and benches for cover ----
  deadTree(b, { x: 0, z: -9, scale: 1.5, seed: 311 });
  for (const [x, z, rot] of [[-8, -4, 0], [8, -4, 0], [-8, -16, 0], [8, -16, 0]] as const) {
    addBox(b, 'concreteWall', x, 0.45, z, 3.2, 0.9, 1.2, rot);
    b.collideBox(x, z, 3.2, 1.2, 0.9, { mapKind: 'prop', tag: 'planter', rot });
  }
  bench(b, { x: -4, z: -14, rot: 0 });
  bench(b, { x: 4, z: -3, rot: Math.PI });
  corpse(b, { x: 5, z: -12, rot: 1.2 });
  debris(b, { x: -10, z: -20, radius: 2.2, seed: 312 });
  for (const [x, z] of [[-12, -1], [12, -1], [-12, -20], [12, -20]] as const) streetLamp(b, { x, z, rot: x < 0 ? HALF_PI : -HALF_PI, armDir: x < 0 ? HALF_PI : -HALF_PI, style: 'cobra', on: z > -10, color: 0xbfd8c8, mode: x > 0 && z < -10 ? 'flicker' : 'steady' });

  // ---- the cemetery (west grounds) ----
  for (let gx = -50; gx <= -36; gx += 3.5) {
    for (let gz = -19; gz <= 6; gz += 3.2) {
      const tilt = Math.sin(gx * 3.1 + gz * 1.7) * 0.12;
      addBox(b, 'concreteWall', gx, 0.45, gz, 0.7, 0.9, 0.18, tilt);
      b.collideBox(gx, gz, 0.7, 0.2, 0.9, { mapKind: 'prop', tag: 'grave', rot: tilt });
    }
  }
  deadTree(b, { x: -44, z: -22.5, scale: 1.3, seed: 321 });
  deadTree(b, { x: -53, z: 12, scale: 1.1, seed: 322 });

  // ---- the boiler house (east grounds): the power contract ----
  building(b, {
    x: 44, z: -14, w: 12, d: 10, height: 5, wallMaterial: 'brick', roofMaterial: 'roof', floorMaterial: 'floorWarehouse', ceilingMaterial: 'metalPanel',
    sides: { S: { openings: [door(6, 2.4, 3)] }, W: { openings: [door(4.6, 1.6)] }, N: { openings: [win(6)] } },
    tag: 'boiler-house',
  });
  addBox(b, 'brick', 48, 8, -17, 1.6, 6, 1.6); // its chimney
  generator(b, { x: 41, z: -12, rot: 0, running: false });
  generator(b, { x: 47, z: -12, rot: Math.PI, running: false });
  ceilingLight(b, { x: 44, z: -14, y: 4.95, kind: 'caged', mode: 'flicker', color: 0xffd8a0 });
  const power = transmitterSite(b, { x: ASYLUM.power.x, z: ASYLUM.power.z, rot: 0, radius: ASYLUM.power.radius });
  barrelGroup(b, { x: 53, z: -4, rot: 0.3, count: 5, radius: 1.3, seed: 331, colors: ['rust', 'yellow'] });
  crateGroup(b, { x: 33, z: 12, rot: 0, count: 3, radius: 1.2, seed: 332 });
  d.station({ kind: 'upgrade', name: 'THE BOILER ROOM BENCH', x: 36, z: -6, yaw: -HALF_PI, region: 'medium' });
  d.crate(53, 12, 0.2, 'medium');
  d.crate(-53, -12, 0.6, 'medium');
  d.crate(0, -20, 0, 'medium');

  // ---- the back (high): chapel, isolation, morgue, the crematorium ----
  building(b, {
    x: -28, z: -35, w: 16, d: 12, height: 6.5, wallMaterial: 'brick', roofMaterial: 'roof', floorMaterial: 'wood', ceilingMaterial: 'wood', parapet: 0.3,
    sides: {
      S: { openings: [door(8, 2.4, 3.4)] },
      E: { openings: [door(5.6, 1.6), win(9, true)] },
      W: { openings: [win(3, true), win(8)] },
    },
    tag: 'chapel',
  });
  // pews either side of a 3.4 m aisle, the altar under a candle glow
  for (let z = -38.5; z <= -31; z += 1.9) {
    for (const x of [-32.6, -23.4]) {
      addBox(b, 'wood', x, 0.45, z, 3.2, 0.9, 0.55);
      b.collideBox(x, z, 3.2, 0.6, 0.9, { mapKind: 'prop', tag: 'pew' });
    }
  }
  addBox(b, 'wood', -28, 0.55, -40.2, 3, 1.1, 0.9);
  b.collideBox(-28, -40.2, 3, 0.9, 1.1, { mapKind: 'prop', tag: 'altar' });
  b.light({ x: -28, y: 1.8, z: -39.6, color: 0xffb060, intensity: 45, distance: 10 });
  b.light({ x: -33, y: 2.4, z: -35, color: 0xff9a40, intensity: 18, distance: 7, mode: 'flicker' });
  // the bell tower
  addBox(b, 'brick', -18, 8, -40, 3.2, 16, 3.2);
  const steeple = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5, 4), b.mats.get('roof'));
  steeple.position.set(-18, 18.5, -40);
  steeple.rotation.y = Math.PI / 4;
  b.add(steeple);
  b.collideBox(-18, -40, 3.2, 3.2, 16, { mapKind: 'building', tag: 'bell-tower' });

  building(b, {
    x: ASYLUM.isolation.x, z: ASYLUM.isolation.z, w: 20, d: 12, height: 4.8, wallMaterial: 'concreteWall', roofMaterial: 'roof', floorMaterial: 'tile', ceilingMaterial: 'plaster',
    sides: { S: { openings: [door(10, 2.6, 3)] }, E: { openings: [door(8.6, 1.6)] }, W: { openings: [door(2.6, 1.6)] } },
    // padded cells along the back wall, the hall in front where she walks
    partitions: [
      { x0: -9.6, z0: -37.4, x1: 9.6, z1: -37.4, material: 'plaster', openings: [door(2.4, 1.5), door(7.2, 1.5), door(12, 1.5), door(16.8, 1.5)] },
      { x0: -4.8, z0: -41.6, x1: -4.8, z1: -37.5, material: 'plaster' },
      { x0: 0, z0: -41.6, x1: 0, z1: -37.5, material: 'plaster' },
      { x0: 4.8, z0: -41.6, x1: 4.8, z1: -37.5, material: 'plaster' },
    ],
    tag: 'isolation',
  });
  upperStorey(c, 0, -36, 20, 12, 5.2, 3, 511);
  ceilingLight(b, { x: -5, z: -33.5, y: 4.75, kind: 'tube', mode: 'flicker', color: 0xc8f0d8, rot: HALF_PI });
  ceilingLight(b, { x: 5, z: -33.5, y: 4.75, kind: 'tube', mode: 'fail', color: 0xc8f0d8, rot: HALF_PI });
  emergencyLight(b, { x: 0, y: 4.4, z: -30.6 });
  gurney(b, { x: -8, z: -32, rot: HALF_PI, covered: true });
  wallDecal(b, 'bloodOld1', -6, 1.4, -37.2, 2.4, 1.6, 0);
  wallDecal(b, 'mold', 6, 2.2, -37.2, 3, 1.8, 0);

  building(b, {
    x: 28, z: -35, w: 16, d: 12, height: 4.4, wallMaterial: 'concreteWall', roofMaterial: 'roof', floorMaterial: 'tile', ceilingMaterial: 'plaster',
    sides: { S: { openings: [door(8, 2.2, 2.8)] }, W: { openings: [door(3.6, 1.6)] }, E: { openings: [door(6, 1.6)] } },
    partitions: [{ x0: 31, z0: -40.6, x1: 31, z1: -29.4, material: 'plaster', openings: [door(5.6, 1.6)] }],
    tag: 'morgue',
  });
  gurney(b, { x: 24, z: -37, rot: 0, covered: true });
  gurney(b, { x: 27.5, z: -37, rot: 0, covered: true });
  labBench(b, { x: 25.5, z: -31.2, rot: Math.PI, length: 3 });
  // the cold room: a wall of body drawers
  addBox(b, 'steel', 33.4, 1.3, -40.2, 3.6, 2.6, 0.7);
  b.collideBox(33.4, -40.2, 3.6, 0.7, 2.6, { mapKind: 'prop', tag: 'drawers' });
  ceilingLight(b, { x: 25.5, z: -35, y: 4.35, kind: 'panel', color: 0xd8f0ff, intensity: 34 });
  ceilingLight(b, { x: 33.5, z: -35, y: 4.35, kind: 'panel', mode: 'flicker', color: 0xc8e8ff, intensity: 30 });
  const stack = spire(b, { x: ASYLUM.stack.x, z: ASYLUM.stack.z, rot: 0, height: 34 });
  debris(b, { x: 40, z: -30, radius: 2.6, seed: 341, big: true });
  corpse(b, { x: -14, z: -30, rot: 0.4 });
  for (const [x, z] of [[-40, -28], [40, -28], [-12, -28], [12, -28]] as const) streetLamp(b, { x, z, rot: HALF_PI, armDir: HALF_PI, style: 'cobra', on: x > 0, color: 0xa8c8b8, mode: 'flicker' });
  d.crate(-52, -42, 0.3, 'high');
  d.crate(14, -44, 0.9, 'high');
  d.crate(52, -30, 0, 'high');

  // ---- spawn points and resident infected ----
  d.spawn('low', 'general', [[-52, 44], [52, 44], [-52, 22], [52, 22], [24, 44], [-24, 44]], 1);
  d.spawn('medium', 'general', [[-53, -2], [-46, -22], [53, 8], [53, -6], [-40, 12], [40, 14], [0, -21]], 1);
  d.spawn('high', 'general', [[-52, -43], [52, -44], [-14, -44], [14, -44], [40, -28], [-40, -28]], 1.2);
  d.spawn('medium', 'defense', [[53, 0], [30, 12], [53, 14], [33, -8]], 1);
  d.spawn('low', 'lz', [[-52, 42], [-52, 22], [-22, 42], [-24, 20]], 1);
  d.zombies('low', 'shambler', [[-30, 38], [16, 36], [-14, 24], [44, 40], [-48, 30]]);
  d.zombies('medium', 'shambler', [[-22, -16], [22, -1], [-6, -10], [7, -18], [-44, -10], [-40, 2], [48, -2], [3, 8]]);
  d.zombies('medium', 'runner', [[-26, 1.8], [26, -13.8], [36, 10]]);
  d.zombies('high', 'shambler', [[-28, -33], [26, -33], [-6, -33], [36, -28], [-44, -36]]);
  d.zombies('high', 'runner', [[6, -40], [-38, -40]]);
  d.zombies('high', 'armored', [[34, -35], [-12, -40], [18, -30]]);

  return { transmitter: power, spire: stack };
}
