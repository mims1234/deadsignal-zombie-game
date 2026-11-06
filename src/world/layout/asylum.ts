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
import { buildZoneWalls } from '../../asylum/zoneWalls';
import { helipad, quarantineGate, spire, transmitterSite, type SpireHandle, type TransmitterHandle } from '../landmarks';
import { bench, corpse, crateGroup, debris, deadTree, generator, barrelGroup, streetLamp, vehicle } from '../props';
import { ceilingLight, emergencyLight, gurney, labBench, lockerRow, officeDesk, pipeRun, storeShelf } from '../interiors';
import { bathtub, bedside, bookshelf, candles, candleStand, chair, filingCabinets, floorMattress, ironBed, lanternPost, lectern, medicineCabinet, papers, trolley, wallCross, wheelchair } from '../asylumFurniture';
import { addBox, building, groundRect, perimeterWall, wall, wallDecal, type Opening } from '../structures';
import type { BoxCollider } from '../collision';
import type { FloorLink } from '../floors';
import { BELL, LANTERNS, UPSTAIRS } from '../../asylum/nightConfig';
import { straightStairs } from './storeys';
import { surfaceOverrides } from '../../models/library';
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
  /** The furnace's damper wheel, at the foot of the stack (shut it and the fog stops); you stand on its +Z side. */
  damper: { x: 49.5, z: -33.4 },
};

/** What the Asylum's story moves at run time (`asylum/upstairs.ts`). */
export interface AsylumHandles {
  /** Ward Nine's door at the top of the east fire escape: locked until the power is on. */
  ward9: { collider: BoxCollider; panel: THREE.Object3D; lamp: THREE.MeshStandardMaterial; area: number; link: FloorLink };
  /** The two upper floors (area ids). */
  areas: { nurses: number; nine: number };
  /** The furnace damper: the wheel turns when it is shut. */
  damper: { root: THREE.Group; wheel: THREE.Object3D; x: number; z: number };
  /** The chapel's bell rope: it swings when the bell is rung. */
  bell: THREE.Object3D;
}

const DOOR = 1.6;
const DOOR_H = 2.4;
const door = (at: number, width = DOOR, height = DOOR_H): Opening => ({ at, width, height, kind: 'door', frame: 'wood' });
const win = (at: number, lit = false): Opening => ({ at, width: 1.3, height: 1.7, sill: 1.1, kind: 'window', frame: 'steelDark', lit });
/** A boarded window (barricade): the infected tear the boards off and climb in; players nail them back (src/asylum). */
const boarded = (o: Opening): Opening => ({ ...o, barricade: true });

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
function wardWing(c: Ctx, cx: number, inner: 'E' | 'W', tag: string, boards: { inner: number[]; outer: number[] }): void {
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
  // barricades: the chosen cells' windows are boarded instead of glazed
  const board = (list: Opening[], side: 'E' | 'W', ks: number[]): Opening[] => list.map((o) => (o.kind === 'window' && ks.some((k) => Math.abs(o.at - at(side, mid(k))) < 0.01) ? boarded(o) : o));
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
    x: cx, z: (z0 + z1) / 2, w, d: z1 - z0, height: H, wallMaterial: 'brick', roofMaterial: 'roof', floorMaterial: 'tile', ceilingMaterial: 'plaster',
    sides: {
      [inner]: { openings: board(innerOpen, inner, boards.inner) },
      [outer]: { openings: board(outerOpen, outer, boards.outer) },
      // the corridor runs out of both ends; S measures from the east end, N from the west end
      S: { openings: [door(ix1 + t - cx, 1.8, 2.6)] },
      N: { openings: [door(cx - (ix0 - t), 1.8, 2.6)] },
    },
    partitions,
    tag,
  });
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
      if ((k + (side === 'L' ? 0 : 1)) % 3 === 0) gurney(b, { x: side === 'L' ? ix0 + 1.05 : ix1 - 1.05, z: mid(k) - 1.3, rot: 0, covered: k % 2 === 0 }); // 2 m long: clear of the wall
      else if (k === 3) lockerRow(b, { x: wallX(side) + (side === 'L' ? 0.1 : -0.1), z: mid(k) + 1.2, rot: side === 'L' ? HALF_PI : -HALF_PI, count: 3 });
      if (k % 2 === 1) ceilingLight(b, { x: cellX(side), z: mid(k), y: H - 0.05, kind: 'panel', mode: k === 1 ? 'flicker' : 'steady', color: 0xe6efe0, intensity: 22 });
    }
  }
  wallDecal(b, 'mold', cx - 1.5, 2.2, mid(1), 2.4, 1.6, HALF_PI);
  wallDecal(b, 'grime', cx + 1.5, 1.6, mid(4), 3, 1.4, -HALF_PI);

  // the rest of each cell: an iron bed where there is no cot, a bedside cabinet, a chair by the door, now and then a
  // wheelchair or a dropped file; the west's hydrotherapy room and the east's dispensary. Nothing stands in the band
  // from a cell's window to its door (z = mid +- 0.85): the infected climb in through those windows.
  for (let k = 0; k < 6; k++) {
    for (const side of ['L', 'R'] as const) {
      const vestibule = (side === 'L') === (inner === 'W') ? k === 5 || k === 2 : k === 1;
      if (vestibule) continue;
      const m = mid(k);
      const sg = side === 'L' ? 1 : -1; // inward from the outside wall
      const e = side === 'L' ? ix0 : ix1; // the outside wall's inner face
      const cw = side === 'L' ? corridorL - 0.11 : corridorR + 0.11; // the corridor wall's face
      const cot = (k + (side === 'L' ? 0 : 1)) % 3 === 0;
      const lockers = !cot && k === 3;
      const h = (k * 7 + (side === 'L' ? 1 : 4) + (inner === 'E' ? 0 : 5)) % 6;
      const tub = inner === 'E' && side === 'L' && k === 5;
      const dispensary = inner === 'W' && side === 'R' && k === 0;
      const box = (inner === 'E' && side === 'L' && k === 0) || (inner === 'W' && side === 'L' && k === 4);
      if (tub) {
        bathtub(b, { x: e + sg * 0.95, z: m - 1.6, rot: 0 });
        bathtub(b, { x: e + sg * 0.95, z: m + 1.6, rot: 0 });
        trolley(b, { x: cw - sg * 0.6, z: m + 1.9, rot: HALF_PI });
        continue;
      }
      if (dispensary) {
        medicineCabinet(b, { x: e + sg * 1.6, z: iz0 + 0.22, rot: 0 });
        medicineCabinet(b, { x: e + sg * 2.75, z: iz0 + 0.22, rot: 0 });
        trolley(b, { x: e + sg * 3.3, z: m + 2.15, rot: 0 });
        papers(b, { x: e + sg * 2.4, z: m - 0.2, n: 8, spread: 1 });
        continue;
      }
      if (!cot && !lockers) ironBed(b, { x: e + sg * 1.05, z: m - 1.55, rot: side === 'L' ? 0 : Math.PI, seed: k * 3 + (side === 'L' ? 0 : 1) });
      if (!lockers) bedside(b, { x: e + sg * 0.3, z: m + 2.1, rot: side === 'L' ? HALF_PI : -HALF_PI });
      if (box) c.d.crate(cw - sg * 0.75, m + 1.75, 0.2, 'medium');
      else chair(b, { x: cw - sg * 0.55, z: m + 1.9, rot: side === 'L' ? -HALF_PI : HALF_PI, tipped: h === 2 });
      if (h === 1 || h === 4) wheelchair(b, { x: cw - sg * 0.6, z: m - 1.9, rot: side === 'L' ? -HALF_PI + 0.3 : HALF_PI - 0.3 });
      if (h === 0 || h === 3) papers(b, { x: e + sg * 2.8, z: m - 1.4, n: 5 });
    }
  }
}

/**
 * A ward wing's upper floor, reached by a steel fire escape from the yard: brick walls with windows, a tiled floor on
 * the ward's roof, rooms of its own, and a door off the landing. `kind` 'nurses' is the night nurses' floor (west),
 * 'nine' Ward Nine, the Lantern Ward (east). Returns its area, the stairs and the doorway.
 */
function wardUpstairs(c: Ctx, cx: number, kind: 'nurses' | 'nine'): { area: number; link: FloorLink; door: { x: number; z: number } } {
  const { b, floors } = c;
  const Y = UPSTAIRS.y;
  const H = 3.4;
  const t = 0.4;
  const x0 = cx - 7;
  const x1 = cx + 7;
  const z0 = -22;
  const z1 = 10;
  const s = cx < 0 ? 1 : -1; // toward the yard
  const innerX = cx + s * 7; // the face toward the yard
  const fe = kind === 'nurses' ? UPSTAIRS.west : UPSTAIRS.east;
  const lane = 1.4;
  // the landing reaches from the wall out over the stairs
  const landOut = fe.x + s * (lane / 2);
  const area = floors.addArea(kind === 'nurses' ? "the nurses' floor" : 'Ward Nine', 'upper', Y, {
    minX: Math.min(x0, landOut) - 0.6,
    maxX: Math.max(x1, landOut) + 0.6,
    minZ: z0 - 0.6,
    maxZ: z1 + 0.6,
  });

  // ---- the floor (on the ward's roof) and a roof of its own ----
  // 2 cm proud of the ward's roof (whose top is exactly Y): level with it, the two flicker against each other
  addBox(b, 'tile', cx, Y - 0.03, (z0 + z1) / 2, 14 - 2 * t, 0.1, z1 - z0 - 2 * t, 0, { cast: false });
  b.collide({ x: cx, z: (z0 + z1) / 2, hx: 7, hz: (z1 - z0) / 2, y0: Y - 0.1, y1: Y, floor: true, surface: 'concrete', mapKind: 'none', tag: `${kind}-floor` });
  addBox(b, 'roof', cx, Y + H + 0.2, (z0 + z1) / 2, 14.5, 0.4, z1 - z0 + 0.5, 0);
  b.collide({ x: cx, z: (z0 + z1) / 2, hx: 7.25, hz: (z1 - z0 + 0.5) / 2, y0: Y + H, y1: Y + H + 0.4, mapKind: 'none', tag: 'roof' });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14 - 2 * t, z1 - z0 - 2 * t), b.mats.get('plaster'));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, Y + H - 0.02, (z0 + z1) / 2);
  b.add(ceil, { cast: false });
  addBox(b, 'concreteDark', cx, Y + H + 0.5, (z0 + z1) / 2, 14.7, 0.2, z1 - z0 + 0.7, 0, { cast: false }); // cornice

  // ---- walls: windows all round, the door off the landing ----
  const winAt = (len: number, skip: (at: number) => boolean, lit: number[]): Opening[] => {
    const out: Opening[] = [];
    const n = Math.floor((len - 1.5) / 3.4);
    for (let i = 0; i < n; i++) {
      const at = (len - (n - 1) * 3.4) / 2 + i * 3.4;
      if (skip(at)) continue;
      out.push({ at, width: 1.2, height: 1.5, sill: 1.0, kind: 'window', frame: 'steelDark', lit: lit.includes(i) });
    }
    return out;
  };
  const W = (ax: number, az: number, bx: number, bz: number, openings: Opening[]): void => {
    wall(b, { x0: ax, z0: az, x1: bx, z1: bz, height: H, thickness: t, material: 'brick', openings, y0: Y, mapKind: 'building', tag: `${kind}-wall` });
  };
  const zi0 = z0 + t;
  const zi1 = z1 - t;
  W(x0, z0 + t / 2, x1, z0 + t / 2, winAt(14, () => false, []));
  W(x1, z1 - t / 2, x0, z1 - t / 2, winAt(14, () => false, [1]));
  // the inner wall runs from the north end: its door is `fe.doorZ - zi0` along it
  const doorAt = fe.doorZ - zi0;
  W(innerX - s * (t / 2), zi0, innerX - s * (t / 2), zi1, [{ at: doorAt, width: 1.6, height: 2.4, kind: 'door', frame: 'wood' }, ...winAt(zi1 - zi0, (a) => Math.abs(a - doorAt) < 2.2, kind === 'nine' ? [3, 5] : [2])]);
  const outerX = cx - s * 7;
  W(outerX + s * (t / 2), zi0, outerX + s * (t / 2), zi1, winAt(zi1 - zi0, () => false, kind === 'nine' ? [1, 4, 7] : [6]));

  // ---- the fire escape: steel stairs up from the yard, a landing by the door ----
  const top = straightStairs(c, { x: fe.x, z: fe.z, dx: 0, dz: -1, width: lane, y0: 0, y1: Y, lower: 0, upper: area, mat: 'grating' });
  const link = floors.links[floors.links.length - 1]!;
  const lzA = top.z; // the landing's near edge (the top step)
  const lzB = fe.doorZ - 1.6;
  const lxA = innerX; // the wall's face
  const lxB = landOut;
  const lx = (lxA + lxB) / 2;
  const lw = Math.abs(lxB - lxA);
  addBox(b, 'grating', lx, Y - 0.06, (lzA + lzB) / 2, lw, 0.12, lzA - lzB, 0);
  b.collide({ x: lx, z: (lzA + lzB) / 2, hx: lw / 2, hz: (lzA - lzB) / 2, y0: Y - 0.24, y1: Y, floor: true, surface: 'metal', mapKind: 'none', tag: 'fire-escape' });
  // posts under it, and its rails (the open sides)
  for (const [px, pz] of [[lxB, lzB], [lxB, lzA], [lxA + s * 0.15, lzB]] as const) addBox(b, 'steelDark', px, Y / 2, pz, 0.12, Y, 0.12, 0);
  const rail = (rx: number, rz: number, w2: number, d2: number): void => {
    addBox(b, 'steelDark', rx, Y + 1.0, rz, Math.max(w2, 0.05), 0.05, Math.max(d2, 0.05), 0, { cast: false });
    addBox(b, 'steelDark', rx, Y + 0.5, rz, Math.max(w2, 0.03), 0.03, Math.max(d2, 0.03), 0, { cast: false });
    b.collide({ x: rx, z: rz, hx: Math.max(w2, 0.08) / 2, hz: Math.max(d2, 0.08) / 2, y0: Y - 0.3, y1: Y + 1.1, blocksShots: false, mapKind: 'none', tag: 'stair-rail' });
  };
  rail(lxB, (lzA + lzB) / 2, 0.08, lzA - lzB); // the far side
  rail(lx, lzB, lw, 0.08); // the end
  const gapW = Math.abs(fe.x - s * (lane / 2) - lxA); // between the wall and the stairs, at the top step
  rail(lxA + (s * gapW) / 2, lzA, gapW, 0.08);
  // a lamp over the door
  ceilingLight(b, { x: innerX + s * 0.6, z: fe.doorZ, y: Y + 2.9, kind: 'caged', color: 0xffc880, intensity: 18, mode: kind === 'nine' ? 'flicker' : 'steady' });

  // ---- inside ----
  const inX0 = x0 + t;
  const inX1 = x1 - t;
  const part = (z: number, at: number): void => {
    wall(b, { x0: inX0, z0: z, x1: inX1, z1: z, height: H - 0.05, thickness: 0.2, material: 'plaster', openings: [{ at, width: 1.6, height: 2.3, kind: 'door', frame: 'wood' }], y0: Y, mapKind: 'none', tag: 'partition', cast: false });
  };
  const lampY = Y + H - 0.05;
  if (kind === 'nurses') {
    // the night station by the door, the dormitory, the Matron's office at the far end
    part(-14, 6.6);
    part(2, 6.6);
    officeDesk(b, { x: cx + 3.6, z: -18.5, y: Y, rot: Math.PI / 2, chair: true });
    lockerRow(b, { x: x0 + 1, z: -18, y: Y, rot: HALF_PI, count: 4 });
    medicineCabinet(b, { x: cx - 3.5, z: z0 + t + 0.22, y: Y, rot: 0 });
    trolley(b, { x: cx + 0.5, z: z0 + t + 0.7, y: Y, rot: 0 });
    c.d.crate(x0 + 1.4, -15.3, 0.4, 'medium', undefined, Y);
    // the dormitory: iron beds down both walls, a cabinet between some
    for (let k = 0; k < 4; k++) {
      ironBed(b, { x: x0 + t + 1.05, z: -8 + k * 2.6, y: Y, rot: 0, seed: 40 + k });
      ironBed(b, { x: x1 - t - 1.05, z: -8 + k * 2.6, y: Y, rot: Math.PI, seed: 50 + k });
      if (k < 3) bedside(b, { x: x0 + t + 0.3, z: -6.7 + k * 2.6, y: Y, rot: HALF_PI });
    }
    wheelchair(b, { x: cx + 2.6, z: -11.6, y: Y, rot: 2.4 });
    officeDesk(b, { x: -25.2, z: -11.9, y: Y, rot: 0, chair: false }); // the day book lies on it (`RECORDS`)
    // the Matron's office: her desk, her books, her files, and her strongbox
    officeDesk(b, { x: cx, z: 7.6, y: Y, rot: Math.PI, chair: true }); // the Matron's
    lockerRow(b, { x: x1 - 0.6, z: 5, y: Y, rot: -HALF_PI, count: 3 });
    // between the outer wall's windows (theirs at z 2.5 and 5.9, 1.2 m wide), never in front of one
    bookshelf(b, { x: x0 + t + 0.18, z: 4.2, y: Y, rot: HALF_PI });
    filingCabinets(b, { x: x0 + t + 0.32, z: 8.6, y: Y, rot: HALF_PI, count: 2 });
    chair(b, { x: cx - 1.6, z: 5.6, y: Y, rot: 0.4 });
    c.d.crate(x1 - 1.3, 8.6, 0.3, 'high', undefined, Y);
    ceilingLight(b, { x: cx, z: -18, y: lampY, kind: 'panel', color: 0xfff0d8, intensity: 24 });
    ceilingLight(b, { x: cx, z: -6, y: lampY, kind: 'tube', rot: HALF_PI, mode: 'flicker', color: 0xe8f0e0, intensity: 24 });
    ceilingLight(b, { x: cx, z: 6, y: lampY, kind: 'caged', color: 0xffd8a0, intensity: 28 });
    wallDecal(b, 'mold', inX0 + 0.05, Y + 2.2, -4, 2.4, 1.4, HALF_PI);
  } else {
    // Ward Nine: the long ward, beds down both walls under lamps that were never put out; the night desk at the end
    part(-14, 6.6);
    for (let k = 0; k < 5; k++) {
      const z = -11 + k * 3.2;
      ironBed(b, { x: x0 + t + 1.05, z, y: Y, rot: 0, made: k % 2 === 0, seed: 60 + k });
      ironBed(b, { x: x1 - t - 1.05, z, y: Y, rot: Math.PI, made: k % 2 === 1, seed: 70 + k });
      if (k < 4) {
        bedside(b, { x: x0 + t + 0.3, z: z + 1.6, y: Y, rot: HALF_PI });
        bedside(b, { x: x1 - t - 0.3, z: z + 1.6, y: Y, rot: -HALF_PI });
      }
    }
    officeDesk(b, { x: 22, z: 4.7, y: Y, rot: Math.PI, chair: true }); // the night register (`RECORDS`)
    papers(b, { x: 20.6, z: 6.4, y: Y, n: 7 });
    lockerRow(b, { x: x1 - 0.6, z: -18, y: Y, rot: -HALF_PI, count: 3 });
    medicineCabinet(b, { x: 25.2, z: -14.32, y: Y, rot: Math.PI });
    trolley(b, { x: 18.6, z: -15.0, y: Y, rot: 0 });
    c.d.crate(19.6, -20.7, 0.2, 'high', undefined, Y);
    for (const z of [-10, -2, 6]) ceilingLight(b, { x: cx, z, y: lampY, kind: 'caged', color: 0xffc070, intensity: 30, mode: z === -2 ? 'flicker' : 'steady' });
    ceilingLight(b, { x: cx, z: -18, y: lampY, kind: 'tube', rot: HALF_PI, mode: 'fail', color: 0xe8f0e0 });
    wallDecal(b, 'bloodOld1', inX1 - 0.05, Y + 1.3, -6, 2.2, 1.4, -HALF_PI);
  }
  return { area, link, door: { x: innerX - s * (t / 2), z: fe.doorZ } };
}

/** Ward Nine's door: a steel fire door with a red lamp, shut until the power's back (`asylum/upstairs.ts`). */
function ward9Door(c: Ctx, at: { x: number; z: number }): { collider: BoxCollider; panel: THREE.Object3D; lamp: THREE.MeshStandardMaterial } {
  const { b } = c;
  const Y = UPSTAIRS.y;
  const panel = new THREE.Group();
  panel.position.set(at.x, Y, at.z);
  const steel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.38, 1.58), b.mats.get('steelDark'));
  steel.position.y = 1.19;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.5), b.mats.get('hazard'));
  plate.position.y = 1.55;
  panel.add(steel, plate);
  b.addDynamic(panel);
  const lamp = new THREE.MeshStandardMaterial({ color: 0x400808, emissive: 0xff2a1a, emissiveIntensity: 2.2 });
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), lamp);
  bulb.position.set(at.x, Y + 2.62, at.z);
  b.addDynamic(bulb);
  const collider = b.collide({ x: at.x, z: at.z, hx: 0.3, hz: 0.92, y0: Y, y1: Y + 2.6, mapKind: 'none', surface: 'metal', tag: 'ward9-door' });
  return { collider, panel, lamp };
}

/** The furnace damper: an iron wheel on the flue pipe at the foot of the crematorium stack. */
function damperWheel(c: Ctx): { root: THREE.Group; wheel: THREE.Object3D; x: number; z: number } {
  const { b } = c;
  const { x, z } = ASYLUM.damper;
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  const iron = b.mats.get('steelDark');
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a3418, roughness: 0.85, metalness: 0.4 });
  // the flue pipe out of the stack's plinth, its collar, the wheel on a short spindle
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 14), rust);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0, 1.1, -0.9);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.3, 14), iron);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 1.1, 0.15);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), b.mats.get('concreteDark'));
  post.position.set(0, 0.55, -0.4);
  const wheel = new THREE.Group();
  wheel.position.set(0, 1.1, 0.5);
  // a red-painted valve wheel, so it reads against the grey plinth
  const red = new THREE.MeshStandardMaterial({ color: 0xa3241a, roughness: 0.6, metalness: 0.35 });
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), red));
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(1, 0.07, 0.07), red);
    spoke.rotation.z = (i * Math.PI) / 3;
    wheel.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8), iron);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.04), b.mats.get('hazard'));
  sign.position.set(0, 1.85, -0.2);
  root.add(pipe, collar, post, sign);
  b.add(root);
  // the wheel turns (drawn on its own)
  wheel.position.set(x, 1.1, z + 0.5);
  b.addDynamic(wheel);
  b.collideBox(x, z - 0.6, 1.2, 2.4, 1.7, { mapKind: 'prop', surface: 'metal', tag: 'damper' });
  return { root, wheel, x, z };
}

/** The lights-out bell's rope through the chapel ceiling, a red and white sally to pull (swung at run time). */
function bellRope(c: Ctx): THREE.Object3D {
  const { b } = c;
  const top = 6.45;
  const g = new THREE.Group();
  g.position.set(BELL.x, top, BELL.z);
  const hemp = new THREE.MeshStandardMaterial({ color: 0x9a8058, roughness: 0.95 });
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, top - 0.9, 6), hemp);
  rope.position.y = -(top - 0.9) / 2;
  const red = new THREE.MeshStandardMaterial({ color: 0x8a1e1a, roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.85 });
  for (let i = 0; i < 6; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), i % 2 ? white : red);
    band.position.y = -(top - 2.2) - i * 0.12;
    g.add(band);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 14), b.mats.get('steelDark'));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.02;
  g.add(rope, ring);
  b.addDynamic(g);
  return g;
}

export interface AsylumResult {
  transmitter: TransmitterHandle;
  spire: SpireHandle;
  handles: AsylumHandles;
}

/**
 * With a model pack on, the whole hill is drawn in scanned surfaces (`MAP_SURFACES.asylum`: brick, plaster, tile,
 * concrete, roofs, wood, the ground) in place of the painted ones while it is built; nothing else changes.
 */
export function buildAsylum(c: Ctx): AsylumResult {
  const lib = c.b.mats;
  const scanned = surfaceOverrides('asylum');
  if (scanned.size === 0) return buildHill(c);
  const get = lib.get;
  lib.get = (name) => scanned.get(name) ?? get.call(lib, name);
  try {
    return buildHill(c);
  } finally {
    lib.get = get;
  }
}

function buildHill(c: Ctx): AsylumResult {
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
  officeDesk(b, { x: -10, z: 39.35, rot: 0, chair: true });
  filingCabinets(b, { x: -12.78, z: 42, rot: HALF_PI, count: 2 });
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
  storeShelf(b, { x: 40.15, z: 33, rot: -HALF_PI, length: 3 });
  storeShelf(b, { x: 33.6, z: 36.15, rot: Math.PI, length: 2.4 });
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
      S: { openings: [door(12, 2.6, 3), boarded(win(5, true)), boarded(win(19))] },
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
  // the offices: files, books, a box nobody emptied; a row of chairs in the front hall
  filingCabinets(b, { x: -4.42, z: 8.6, rot: -HALF_PI, count: 2 });
  filingCabinets(b, { x: 4.42, z: 8.6, rot: HALF_PI, count: 2 });
  bookshelf(b, { x: -10.4, z: 10.72, rot: Math.PI });
  bookshelf(b, { x: 10.4, z: 10.72, rot: Math.PI });
  papers(b, { x: 2, z: 7.5, n: 9, spread: 1.2 });
  for (const x of [-5.6, -5, -4.4]) chair(b, { x, z: 11.45, rot: 0 });
  d.crate(-10.6, 5.3, 0.3, 'low');

  // ---- the ward wings ----
  // the boarded windows avoid the cells whose cot or lockers stand under the sill
  wardWing(c, -22, 'E', 'west-ward', { inner: [0, 4], outer: [2, 4, 5] });
  wardWing(c, 22, 'W', 'east-ward', { inner: [4], outer: [0, 3, 4] });
  // their upper floors, up fire escapes from the yard: the night nurses' floor (west) and Ward Nine (east)
  const nurses = wardUpstairs(c, -22, 'nurses');
  const nine = wardUpstairs(c, 22, 'nine');
  const w9 = ward9Door(c, nine.door);

  // ---- the yard: flagstones, a dead elm, planters and benches for cover ----
  deadTree(b, { x: 0, z: -9, scale: 1.5, seed: 311 });
  for (const [x, z, rot] of [[-8, -4, 0], [8, -4, 0], [-8, -16, 0], [8, -16, 0]] as const) {
    addBox(b, 'concreteWall', x, 0.45, z, 3.2, 0.9, 1.2, rot);
    b.collideBox(x, z, 3.2, 1.2, 0.9, { mapKind: 'prop', tag: 'planter', rot });
  }
  bench(b, { x: -4, z: -14, rot: 0 });
  bench(b, { x: 4, z: -3, rot: Math.PI });
  corpse(b, { x: 5, z: -12, rot: 1.2 });
  debris(b, { x: -6, z: -20, radius: 2.2, seed: 312 });
  for (const [x, z] of [[-12, -1], [12, -1], [-10.5, -21], [10.5, -21]] as const) streetLamp(b, { x, z, rot: x < 0 ? HALF_PI : -HALF_PI, armDir: x < 0 ? HALF_PI : -HALF_PI, style: 'cobra', on: z > -10, color: 0xbfd8c8, mode: x > 0 && z < -10 ? 'flicker' : 'steady' });

  // ---- the cemetery (west grounds) ----
  for (let gx = -50; gx <= -36; gx += 3.5) {
    for (let gz = -19; gz <= 6; gz += 3.2) {
      const tilt = Math.sin(gx * 3.1 + gz * 1.7) * 0.12;
      addBox(b, 'concreteWall', gx, 0.45, gz, 0.7, 0.9, 0.18, tilt);
      b.collideBox(gx, gz, 0.7, 0.2, 0.9, { mapKind: 'prop', tag: 'grave', rot: tilt });
    }
  }
  deadTree(b, { x: -32.5, z: -19.5, scale: 1.3, seed: 321 });
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
  // the boiler under its chimney, its pipes, the fitters' bench, a box of spares
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.8, 18), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.7, metalness: 0.5 }));
  boiler.position.set(47.8, 1.4, -16.9);
  b.add(boiler, { cast: false });
  b.collideBox(47.8, -16.9, 2, 2, 2.8, { mapKind: 'prop', surface: 'metal', tag: 'boiler' });
  pipeRun(b, { x0: 47.8, y0: 2.8, z0: -16.9, x1: 47.8, y1: 4.9, z1: -16.9, radius: 0.18 });
  pipeRun(b, { x0: 46.8, y0: 2.2, z0: -16.9, x1: 39, y1: 4.2, z1: -16.9, radius: 0.08 });
  labBench(b, { x: 39.2, z: -16.4, rot: HALF_PI, length: 2.4 });
  d.crate(49, -10.3, 0.1, 'medium');
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
      W: { openings: [boarded(win(3, true)), boarded(win(8))] },
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
  // the cross over the altar, its candles, a stand of them, the lectern; the lights-out bell's rope (`BELL`)
  wallCross(b, { x: -28, y: 3.7, z: -40.5 });
  candles(b, { x: -28, y: 1.1, z: -40.2, n: 7, spread: 1.2 });
  candleStand(b, { x: -31, z: -39.8 });
  lectern(b, { x: -26.2, z: -38.3, rot: 0.3 });
  d.crate(-34.5, -30.2, 1.2, 'high');
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
  for (const x of [-7.2, -2.4, 2.4, 7.2]) floorMattress(b, { x, z: -41.05, rot: 0 });
  trolley(b, { x: 7, z: -31.1, rot: 0 });
  wheelchair(b, { x: -5.4, z: -30.9, rot: 2.6 });
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
  medicineCabinet(b, { x: 22.4, z: -40.38, rot: 0 });
  trolley(b, { x: 29.4, z: -33.6, rot: HALF_PI });
  d.crate(34.6, -30.4, 0.6, 'high');
  ceilingLight(b, { x: 33.5, z: -35, y: 4.35, kind: 'panel', mode: 'flicker', color: 0xc8e8ff, intensity: 30 });
  const stack = spire(b, { x: ASYLUM.stack.x, z: ASYLUM.stack.z, rot: 0, height: 34 });
  debris(b, { x: 40, z: -30, radius: 2.6, seed: 341, big: true });
  corpse(b, { x: -14, z: -30, rot: 0.4 });
  for (const [x, z] of [[-40, -28], [40, -28], [-12, -28], [12, -28]] as const) streetLamp(b, { x, z, rot: HALF_PI, armDir: HALF_PI, style: 'cobra', on: x > 0, color: 0xa8c8b8, mode: 'flicker' });
  d.crate(-52, -42, 0.3, 'high');
  d.crate(14, -44, 0.9, 'high');
  d.crate(52, -30, 0, 'high');

  // ---- the vigil lanterns' posts (their flames are the story's, `asylum/nightRuntime.ts`) and the bell rope ----
  for (const l of LANTERNS.spots) lanternPost(b, { x: l.x, y: l.y, z: l.z });
  const rope = bellRope(c);

  // ---- the zone walls and boarded doorways of the purchasable loop (src/asylum/zoneWalls.ts) ----
  buildZoneWalls(b);

  // ---- spawn points and resident infected ----
  d.spawn('low', 'general', [[-52, 44], [52, 44], [-52, 22], [52, 22], [24, 44], [-24, 44]], 1);
  d.spawn('medium', 'general', [[-53, -2], [-48.2, -20.8], [53, 8], [53, -6], [-40, 12], [40, 14], [0, -21]], 1);
  d.spawn('high', 'general', [[-52, -43], [52, -44], [-14, -44], [14, -44], [40, -28], [-40, -28]], 1.2);
  d.spawn('medium', 'defense', [[53, 0], [30, 12], [53, 14], [33, -8]], 1);
  d.spawn('low', 'lz', [[-52, 42], [-52, 22], [-22, 42], [-24, 20]], 1);
  d.zombies('low', 'shambler', [[-30, 38], [16, 36], [-14, 24], [44, 40], [-48, 30]]);
  d.zombies('medium', 'shambler', [[-22, -16], [22, -1], [-6, -10], [7, -18], [-44, -10], [-40, 2], [48, -2], [3, 8]]);
  d.zombies('medium', 'runner', [[-26, 1.8], [26, -13.8], [36, 10]]);
  d.zombies('high', 'shambler', [[-28, -33], [26, -33], [-6, -33], [36, -28], [-44, -36]]);
  d.zombies('high', 'runner', [[6, -40], [-38, -40]]);
  d.zombies('high', 'armored', [[34, -35], [-12, -40], [18, -30]]);

  const damper = damperWheel(c);
  return { transmitter: power, spire: stack, handles: { ward9: { ...w9, area: nine.area, link: nine.link }, areas: { nurses: nurses.area, nine: nine.area }, damper, bell: rope } };
}
