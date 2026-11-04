/**
 * HIRASAKA: a concrete mining island in a typhoon, and the mine under the sea (`src/hirasaka/places.ts` has every place).
 *
 * The island is five tiers climbing north from the seawall (`TIERS`): each is a thin raised floor across the whole width,
 * its south face the retaining wall below it (built as an apartment front, rows of small windows), a rim along every
 * open edge so nobody walks off it or climbs it, and flights of steps through gaps in the rims (`FLIGHTS`). Anything
 * standing on a tier that should stop the infected is a collider from the ground up (the nav grid is one height field:
 * only what spans its body height from y 0 is an obstacle), so every wall and rim here starts at y 0.
 *
 * The mine is an underground area of its own built far east (`MINE`): its rooms are carved out of a grid, walled
 * round their outline and roofed; the Slope climbs out of the Root Hall to a landing at y 9 whose door is the old adit.
 */
import * as THREE from 'three';
import { MYSTERY_BOX } from '../../config';
import type { SpireHandle, TransmitterHandle } from '../landmarks';
import { crateGroup, debris } from '../props';
import { addBox, building, groundRect, type Opening } from '../structures';
import type { FloorLink } from '../floors';
import type { MaterialName } from '../materials';
import type { Ctx } from './util';
import { MAT, bicycle, lanternString, shopFront, shrineHall, stoneLantern, torii, vendingMachine } from './sakura/props';
import { crag, cragLine, dressMats, minka, peachTree, rootTree, type DressMats } from './hirasakaDress';
import { BLOCK_STAIR, FLIGHTS, HIRASAKA, HIRASAKA_BOUNDS, ISLAND_X, LEDGE, MINE, MINE_ROOMS, PLACES, ROOT_TREE, SCHOOL, SEA_Y, SLOPE, STEP_RUN, TIERS, TAPES, PHOTOS } from '../../hirasaka/places';

export interface HirasakaHandles {
  /** The mine's floors area, the cage (players only: always closed to the infected), the old adit (opens on the climb). */
  mineArea: number;
  cageLink: FloorLink;
  aditLink: FloorLink;
}

/** The houses of the Old Village: the doors that all open at once (`hirasaka/look.ts`). */
export const VILLAGE_HOUSES = [
  { x: 180, z: 2, rot: 0 },
  { x: 192, z: 0, rot: 0 },
  { x: 204, z: 2, rot: 0 },
  { x: 214, z: 6, rot: -Math.PI / 2 },
  { x: 178, z: 20, rot: Math.PI },
  { x: 196, z: 26, rot: Math.PI },
  { x: 208, z: 24, rot: Math.PI },
  { x: 216, z: 18, rot: -Math.PI / 2 },
] as const;

const B = HIRASAKA_BOUNDS;
const STEPS = 12;
const STEP_H = 0.3;
const TREAD = STEP_RUN / STEPS;

/** A rim: an invisible-to-the-eye stop from the ground up to `top` (visual parapets are built separately). */
function rim(c: Ctx, x0: number, z0: number, x1: number, z1: number, top: number, tag = 'rim'): void {
  const hx = Math.max(0.15, Math.abs(x1 - x0) / 2);
  const hz = Math.max(0.15, Math.abs(z1 - z0) / 2);
  c.b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx, hz, y0: 0, y1: top, mapKind: 'wall', surface: 'concrete', tag });
}

/** A run of rim along x at `z` from x0 to x1, leaving gaps (x ranges). */
function rimX(c: Ctx, x0: number, x1: number, z: number, top: number, gaps: readonly [number, number][], tag = 'rim'): void {
  let from = x0;
  for (const [a, e] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (a > from) rim(c, from, z - 0.15, a, z + 0.15, top, tag);
    from = Math.max(from, e);
  }
  if (from < x1) rim(c, from, z - 0.15, x1, z + 0.15, top, tag);
}

/** A concrete apartment front: a wall face with rows of small windows (a few lit, most dark, some broken). */
function facade(c: Ctx, x0: number, x1: number, z: number, y0: number, y1: number, facing: 1 | -1, seed: number, litShare = 0.08): void {
  const { b } = c;
  const w = x1 - x0;
  const h = y1 - y0;
  addBox(b, 'concreteDark', (x0 + x1) / 2, (y0 + y1) / 2, z - facing * 0.2, w, h, 0.4, 0, { cast: false });
  let s = seed;
  const r = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const floors = Math.max(1, Math.floor(h / 2.8));
  for (let f = 0; f < floors; f++) {
    const wy = y0 + 1.5 + f * 2.8;
    if (wy + 0.6 > y1) break;
    for (let x = x0 + 1.4; x < x1 - 1; x += 2.6) {
      const roll = r();
      const mat: MaterialName = roll < litShare ? 'windowLit' : roll < 0.75 ? 'glassDark' : 'concreteDark';
      addBox(b, mat, x, wy, z + facing * 0.02, 1.1, 1.1, 0.06, 0, { cast: false, receive: false });
      // a sill under it and a lintel over it, standing out of the face
      addBox(b, 'concreteWall', x, wy - 0.62, z + facing * 0.1, 1.4, 0.12, 0.22, 0, { cast: false });
      addBox(b, 'concreteWall', x, wy + 0.62, z + facing * 0.06, 1.3, 0.1, 0.14, 0, { cast: false });
      // a balcony rail now and then, and stains
      if (roll > 0.82) addBox(b, 'rust', x, wy - 0.7, z + facing * 0.25, 1.6, 0.08, 0.5, 0, { cast: false });
    }
  }
  // a floor slab's edge at every storey, the face's rhythm
  for (let f = 1; f * 2.8 < h - 0.4; f++) addBox(b, 'concreteWall', (x0 + x1) / 2, y0 + f * 2.8 + 0.2, z + facing * 0.12, w, 0.2, 0.26, 0, { cast: false });
  // a downpipe or two
  for (let x = x0 + 6; x < x1; x += 17) addBox(b, 'rust', x, (y0 + y1) / 2, z + facing * 0.12, 0.16, h, 0.16, 0, { cast: false });
}

/** A flight of `STEPS` steps on the tier below `t`, rising north to the edge of `t`. */
function flight(c: Ctx, t: number, x: number, w: number, main: boolean): void {
  const { b } = c;
  const lo = TIERS[t - 1]!.y;
  const hi = TIERS[t]!.y;
  const ze = TIERS[t]!.z1;
  const rise = (hi - lo) / STEPS;
  for (let i = 0; i < STEPS; i++) {
    const top = lo + (i + 1) * rise;
    const za = ze + STEP_RUN - i * TREAD;
    const zb = ze + STEP_RUN - (i + 1) * TREAD;
    const cz = (za + zb) / 2;
    const hz = TREAD / 2 + (i === STEPS - 1 ? 0.25 : 0);
    b.collide({ x, z: cz - (i === STEPS - 1 ? 0.25 : 0), hx: w / 2, hz, y0: Math.max(0, top - 0.6), y1: top, floor: true, surface: 'concrete', mapKind: 'none', tag: 'step' });
    addBox(b, main ? 'concreteSlab' : 'concreteWall', x, (lo + top) / 2, cz, w, top - lo, TREAD + 0.02, 0, { cast: false });
  }
  // the cheeks either side: solid from the ground to a rail above the steps
  for (const s of [-1, 1]) {
    const cx = x + s * (w / 2 + 0.18);
    rim(c, cx - 0.18, ze, cx + 0.18, ze + STEP_RUN, hi + 0.9, 'cheek');
    addBox(b, 'concreteWall', cx, (lo + hi) / 2 + 0.2, ze + STEP_RUN / 2, 0.36, hi - lo + 0.4, STEP_RUN, 0, { cast: false });
    const rail = addBox(b, 'steelDark', cx, (lo + hi) / 2 + 0.95, ze + STEP_RUN / 2, 0.06, 0.06, Math.hypot(STEP_RUN, hi - lo), 0, { cast: false });
    rail.rotation.set(Math.atan2(hi - lo, STEP_RUN), 0, 0);
    rail.updateMatrixWorld(true);
  }
  if (main) {
    // the Hundred Steps: worn stone, a lamp at each landing
    b.light({ x: x + w / 2 + 0.4, y: hi + 2.6, z: ze + 0.6, color: 0xffb070, intensity: 18, distance: 13, mode: t === 2 ? 'fail' : 'flicker', pool: 3, glow: 0.6, tag: 'steps' });
    addBox(b, 'steelDark', x + w / 2 + 0.4, hi + 1.3, ze + 0.6, 0.12, 2.6, 0.12);
  }
}

/** A sea stack: a tall crag out of the water, a smaller one leaning on it. */
function rock(b: Ctx['b'], M: DressMats, x: number, z: number, r: number, h: number, y = SEA_Y): void {
  const seed = Math.round(x * 13 + z * 7);
  crag(b, M.rock, { x, y: y + h * 0.36, z, sx: r, sy: h * 0.6, sz: r * 0.85, seed, rot: x * 0.37 + z });
  crag(b, M.rock, { x: x + r * 0.9, y: y + h * 0.12, z: z - r * 0.5, sx: r * 0.6, sy: h * 0.25, sz: r * 0.55, seed: seed + 1, rot: z });
}

const door = (at: number, width = 1.6, height = 2.5): Opening => ({ at, width, height, kind: 'door', frame: 'wood' });
const win = (at: number, width = 1.4, lit = false): Opening => ({ at, width, height: 1.2, sill: 1.0, kind: 'window', frame: 'wood', lit });

export function buildHirasaka(c: Ctx): { transmitter: TransmitterHandle; spire: SpireHandle; handles: HirasakaHandles } {
  const { b, d, floors } = c;
  const M = dressMats(c.mats);

  // ---------------------------------------------------------------------------------------------
  // the sea, the edge of everything
  // ---------------------------------------------------------------------------------------------
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(520, 420).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0c1a1e, roughness: 0.25, metalness: 0.55 }));
  sea.position.set(40, SEA_Y, 0);
  b.add(sea, { cast: false });
  for (const [x0, z0, x1, z1] of [
    [B.minX - 2, B.minZ - 2, B.maxX + 2, B.minZ],
    [B.minX - 2, B.maxZ, B.maxX + 2, B.maxZ + 2],
    [B.minX - 2, B.minZ, B.minX, B.maxZ],
    [B.maxX, B.minZ, B.maxX + 2, B.maxZ],
  ] as const) b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y1: 30, mapKind: 'wall', tag: 'edge' });
  // the sea round the island is solid to everyone (nothing out there is ground anyone could stand on)
  for (const [x0, z0, x1, z1] of [
    [B.minX, B.minZ, ISLAND_X.x0 - 0.3, B.maxZ],
    [ISLAND_X.x1 + 0.3, B.minZ, B.maxX, B.maxZ],
    [ISLAND_X.x0 - 0.3, 44.4, HIRASAKA.pier.x0 - 0.15, B.maxZ],
    [HIRASAKA.pier.x1 + 0.15, 44.4, ISLAND_X.x1 + 0.3, B.maxZ],
    [HIRASAKA.pier.x0 - 0.15, HIRASAKA.pier.z1 + 0.9, HIRASAKA.pier.x1 + 0.15, B.maxZ],
    [ISLAND_X.x0 - 0.3, B.minZ, ISLAND_X.x1 + 0.3, TIERS[4].z0 - 0.4],
  ] as const) b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y0: -1, y1: 8, mapKind: 'none', blocksShots: false, tag: 'sea' });
  // sea stacks and the dark coast across the strait (the mainland's lights far off)
  let s = 7213;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 95 + rand() * 60;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.8;
    if (x > 90 && Math.abs(z) < 70) continue; // keep the line of sight to the mine's rock clear of stacks
    rock(b, M, x, z, 4 + rand() * 6, 8 + rand() * 18);
  }
  // the island's foot: a rough skirt of concrete and rock below the tiers (the sea breaks on it)
  for (const x of [ISLAND_X.x0 - 3, ISLAND_X.x1 + 3]) {
    addBox(b, 'concreteDark', x, 6, -1, 6, 14, 92, 0, { cast: false });
  }
  addBox(b, 'concreteDark', 0, 8, -49, 124, 18, 6, 0, { cast: false });
  addBox(b, 'concreteDark', 0, -0.8, 46.5, 126, 2.4, 5, 0, { cast: false });
  // the rock the concrete was poured over: crags along the island's sides up to each tier, and its north cliff
  const tierTop = (zz: number): number => {
    const t = TIERS.find((q) => zz >= q.z0 - 0.5 && zz <= q.z1 + 0.5);
    return (t ? t.y : zz < 0 ? TIERS[4].y : 0) + 1.6;
  };
  for (const sx of [-1, 1]) cragLine(b, M.rock, sx * 64, 46, sx * 64, -50, 5.5, sx > 0 ? 811 : 812, { y: SEA_Y - 0.6, h: (_x, zz) => tierTop(zz) + 1.2, w: 3.6, depth: 3.4 });
  cragLine(b, M.rock, -66, -54, 66, -54, 6, 813, { y: SEA_Y - 0.6, h: () => TIERS[4].y + 3, w: 4.2, depth: 3.6 });
  for (const sx of [-1, 1]) cragLine(b, M.rock, sx * 12, 49.5, sx * 62, 49.5, 5, sx > 0 ? 814 : 815, { y: SEA_Y - 0.8, h: () => 2.6, w: 3, depth: 2.4 });

  // ---------------------------------------------------------------------------------------------
  // the tiers: floor, retaining wall (an apartment front), rims
  // ---------------------------------------------------------------------------------------------
  const W = ISLAND_X;
  TIERS.forEach((t, i) => {
    const zc = (t.z0 + t.z1) / 2;
    const depth = t.z1 - t.z0;
    if (i === 0) {
      groundRect(b, 'asphaltWet', W.x0, t.z0, W.x1, t.z1, 0.01);
    } else {
      b.collide({ x: 0, z: zc, hx: (W.x1 - W.x0) / 2, hz: depth / 2, y0: t.y - 0.4, y1: t.y, floor: true, surface: 'concrete', mapKind: 'none', tag: `tier-${t.id}` });
      addBox(b, i === 4 ? 'gravel' : i === 3 ? 'concreteSlab' : 'asphaltWet', 0, t.y - 0.2, zc, W.x1 - W.x0, 0.4, depth, 0, { cast: false });
      // its south face: the retaining wall from the tier below, built as an apartment front
      facade(c, W.x0, W.x1, t.z1, TIERS[i - 1]!.y, t.y, 1, 900 + i * 31, 0.06);
      // the parapet along its edge, broken where the flights come up
      const gaps = FLIGHTS.filter((f) => f.tier === i).map((f) => [f.x - f.w / 2 - 0.36, f.x + f.w / 2 + 0.36] as [number, number]);
      // the school's roof runs straight on from Block 65's tier
      if (i === 3) gaps.push([SCHOOL.x0, SCHOOL.x1]);
      rimX(c, W.x0, W.x1, t.z1 - 0.15, t.y + 1, gaps, 'parapet');
      let from: number = W.x0;
      for (const [a, e] of [...gaps].sort((p, q) => p[0] - q[0])) {
        if (a > from) addBox(b, 'concreteWall', (from + a) / 2, t.y + 0.5, t.z1 - 0.15, a - from, 1, 0.3, 0, { cast: false });
        from = e;
      }
      if (from < W.x1) addBox(b, 'concreteWall', (from + W.x1) / 2, t.y + 0.5, t.z1 - 0.15, W.x1 - from, 1, 0.3, 0, { cast: false });
    }
    // the island's sides: a parapet over the sea at each end of every tier
    for (const x of [W.x0, W.x1]) {
      rim(c, x - 0.3, t.z0, x + 0.3, t.z1, t.y + 1.1, 'sea-rail');
      addBox(b, 'concreteWall', x, t.y + 0.55, zc, 0.4, 1.1, depth, 0, { cast: false });
    }
  });
  // the summit's north cliff
  rim(c, W.x0, TIERS[4].z0 - 0.4, W.x1, TIERS[4].z0, TIERS[4].y + 1.1, 'cliff');
  addBox(b, 'concreteWall', 0, TIERS[4].y + 0.55, TIERS[4].z0, W.x1 - W.x0, 1.1, 0.4, 0, { cast: false });
  for (const f of FLIGHTS) flight(c, f.tier, f.x, f.w, !!f.main);

  // ---------------------------------------------------------------------------------------------
  // T0: the seawall, the pier, the mine head, the sea gates
  // ---------------------------------------------------------------------------------------------
  const P = HIRASAKA.pier;
  b.collide({ x: 0, z: (P.z0 + P.z1) / 2 + 0.4, hx: (P.x1 - P.x0) / 2, hz: (P.z1 - P.z0) / 2 + 0.4, y0: -0.4, y1: 0, floor: true, surface: 'wood', mapKind: 'none', tag: 'pier' });
  addBox(b, MAT.woodDark(), 0, -0.2, (P.z0 + P.z1) / 2 + 0.4, P.x1 - P.x0, 0.4, P.z1 - P.z0 + 0.8, 0, { cast: false });
  for (const sx of [-1, 1]) {
    rim(c, sx * P.x1 - 0.15, P.z0, sx * P.x1 + 0.15, P.z1 + 0.6, 1.1, 'pier-rail');
    for (let z = P.z0 + 1; z < P.z1; z += 2.2) addBox(b, MAT.woodDark(), sx * (P.x1 - 0.1), -1, z, 0.3, 2.6, 0.3);
    addBox(b, MAT.woodDark(), sx * (P.x1 - 0.1), 0.95, (P.z0 + P.z1) / 2, 0.08, 0.08, P.z1 - P.z0, 0, { cast: false });
  }
  rim(c, P.x0, P.z1 + 0.5, P.x1, P.z1 + 0.9, 1.1, 'pier-end');
  b.light({ x: 3.8, y: 3.4, z: 49, color: 0xffd08a, intensity: 16, distance: 12, mode: 'flicker', pool: 3, glow: 0.7, tag: 'pier' });
  addBox(b, 'steelDark', 4.4, 1.7, 49, 0.12, 3.4, 0.12);
  // the seawall: a tall parapet the waves come over, open at the pier
  rimX(c, W.x0, W.x1, 44.15, 1.3, [[P.x0 - 0.2, P.x1 + 0.2]], 'seawall');
  for (const [a, e] of [[W.x0, P.x0 - 0.2], [P.x1 + 0.2, W.x1]] as const) addBox(b, 'concreteWall', (a + e) / 2, 0.65, 44.15, e - a, 1.3, 0.5, 0, { cast: false });
  // the sea gate housings on the wall's inner face (their wheels are drawn by `hirasaka/look.ts`)
  for (const v of PLACES.valves) {
    addBox(b, 'concreteDark', v.x, 0.9, 43.6, 2.4, 1.8, 0.8);
    b.collide({ x: v.x, z: 43.6, hx: 1.2, hz: 0.4, y1: 1.8, mapKind: 'prop', surface: 'concrete', tag: 'sea-gate' });
    addBox(b, 'paintYellow', v.x, 1.85, 43.2, 2.4, 0.08, 0.04, 0, { cast: false });
    b.light({ x: v.x, y: 2.6, z: 43, color: 0xff6a3a, intensity: 8, distance: 7, mode: 'blink', period: 1.4, duty: 0.4, glow: 0.4, tag: 'gate' });
  }
  // the mine head: the shaft house, the headframe over it (the cage hangs in it: `look.ts`)
  const C = HIRASAKA.cage;
  for (const [x0, z0, x1, z1] of [
    [C.x - 4, C.z - 4, C.x + 4, C.z - 3.6],
    [C.x - 4, C.z - 4, C.x - 3.6, C.z + 3],
    [C.x + 3.6, C.z - 4, C.x + 4, C.z + 3],
  ] as const) {
    rim(c, x0, z0, x1, z1, 5, 'shaft-house');
    addBox(b, 'corrugatedRust', (x0 + x1) / 2, 2.5, (z0 + z1) / 2, x1 - x0, 5, z1 - z0);
  }
  addBox(b, 'corrugatedRust', C.x, 5.1, C.z - 0.5, 8.4, 0.2, 7.4, 0, { cast: false });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = addBox(b, 'steelDark', C.x + sx * 2.6, 11, C.z - 0.5 + sz * 2.6, 0.4, 22, 0.4);
      leg.rotation.set(sz * 0.08, 0, -sx * 0.08);
      leg.updateMatrixWorld(true);
    }
    for (let y = 4; y < 21; y += 3.4) addBox(b, 'steelDark', C.x + sx * (2.6 - y * 0.08), y, C.z - 0.5, 0.18, 0.18, 5.6 - y * 0.16, 0, { cast: false });
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 6, 24), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.6, metalness: 0.7 }));
  wheel.position.set(C.x, 21.5, C.z - 0.5);
  b.add(wheel);
  b.light({ x: C.x, y: 4.6, z: C.z, color: 0xffc070, intensity: 16, distance: 10, mode: 'flicker', pool: 3, glow: 0.4, tag: 'shaft' });
  groundRect(b, 'hazard', C.x - 3.2, C.z + 2.2, C.x + 3.2, C.z + 2.6, 0.02);
  // the pier hut (tape and photo inside), the bathhouse (the armoury)
  building(b, { x: -11, z: 38, w: 6, d: 5, height: 3, wallMaterial: 'wood', roofMaterial: 'corrugatedRust', floorMaterial: 'wood', ceilingMaterial: 'wood', sides: { S: { openings: [door(3, 1.4)] }, E: { openings: [win(2.5, 1.2, true)] } }, tag: 'pier-hut' });
  b.light({ x: -11, y: 2.7, z: 38, color: 0xffc890, intensity: 10, distance: 8, mode: 'flicker', pool: 2, glow: 0.3, indoor: true, tag: 'hut' });
  building(b, { x: 22, z: 32, w: 14, d: 8, height: 4, wallMaterial: 'plaster', roofMaterial: 'roof', floorMaterial: 'tile', ceilingMaterial: 'plaster', sides: { S: { openings: [door(7, 2.2)] }, N: { openings: [win(3), win(11)] }, W: { openings: [win(4, 1.6, true)] } }, tag: 'bathhouse' });
  b.light({ x: 22, y: 3.7, z: 32, color: 0xe6ecf4, intensity: 16, distance: 11, mode: 'steady', pool: 3, glow: 0.3, indoor: true, tag: 'bathhouse' });
  d.station({ kind: 'upgrade', name: 'PIT WORKSHOP', x: 22, z: 30.2, yaw: 0, region: 'low' });
  // the company store under the market tier's wall
  building(b, { x: -24, z: 28.5, w: 10, d: 6, height: 3.4, wallMaterial: 'concreteWall', roofMaterial: 'corrugated', floorMaterial: 'floorStore', ceilingMaterial: 'plaster', sides: { S: { openings: [door(5, 2.4)] } }, tag: 'company-store' });
  b.light({ x: -24, y: 3.1, z: 28.5, color: 0xffe0b0, intensity: 14, distance: 9, mode: 'steady', pool: 2.6, glow: 0.3, indoor: true, tag: 'store' });
  d.station({ kind: 'buy', name: 'COMPANY STORE', x: -24, z: 29.8, yaw: Math.PI, region: 'low' });
  // the old adit in the market tier's retaining wall: a timbered arch, rubble in it (the Slope comes out here)
  const A = HIRASAKA.adit;
  addBox(b, MAT.woodDark(), A.x - 1.8, 1.6, A.z, 0.4, 3.2, 0.5);
  addBox(b, MAT.woodDark(), A.x + 1.8, 1.6, A.z, 0.4, 3.2, 0.5);
  addBox(b, MAT.woodDark(), A.x, 3.3, A.z, 4.2, 0.4, 0.5);
  addBox(b, MAT.blackLacquer(), A.x, 1.5, A.z - 0.4, 3.2, 3, 0.2, 0, { cast: false });
  debris(b, { x: A.x, z: A.z + 1.6, radius: 2, seed: 5101, big: true });
  // the T0 dressing: nets, crates, bicycles, a dead vending machine
  crateGroup(b, { x: -34, z: 38, rot: 0.4, count: 4, radius: 1.6, seed: 5102 });
  crateGroup(b, { x: 32, z: 40, rot: 1.1, count: 3, radius: 1.3, seed: 5103 });
  bicycle(b, { x: -4, z: 30, rot: 0.4, fallen: true });
  vendingMachine(b, { x: 9, z: 23.2, rot: 0, color: 'white', dead: true });
  b.collide({ x: 9, z: 23.2, hx: 0.6, hz: 0.45, y1: 1.9, mapKind: 'prop', tag: 'vending' });
  torii(b, { x: 0, z: 29.2, rot: 0, scale: 0.9, weathered: true });
  // the T0 lamps (wet asphalt under sodium)
  for (const [x, z] of [[-40, 40], [-16, 41], [16, 41], [44, 38], [-50, 26], [30, 25]] as const) {
    addBox(b, 'steelDark', x, 2.4, z, 0.12, 4.8, 0.12);
    b.collide({ x, z, hx: 0.12, hz: 0.12, y1: 4.8, mapKind: 'prop', surface: 'metal', tag: 'lamp' });
    b.light({ x, y: 4.6, z, color: 0xffa860, intensity: 20, distance: 14, mode: (x * 7 + z) % 3 === 0 ? 'fail' : 'steady', pool: 3.4, glow: 0.7, tag: 'seawall' });
  }

  // ---------------------------------------------------------------------------------------------
  // T1: Market Lane
  // ---------------------------------------------------------------------------------------------
  const T1 = TIERS[1];
  const SHOPS = [
    { x: -45, name: '魚屋', sub: 'FISHMONGER', color: '#2a4a5a' },
    { x: -33, name: '米屋', sub: 'RICE', color: '#5a4a2a' },
    { x: -22, name: '食堂', sub: 'CANTEEN', color: '#6a2a24' },
    { x: -11, name: '駄菓子', sub: 'SWEETS', color: '#5a2a4a' },
    { x: 11, name: '床屋', sub: 'BARBER', color: '#2a3a6a' },
    { x: 22, name: '映画館', sub: 'CINEMA', color: '#4a2a5a' },
    { x: 41, name: '酒屋', sub: 'SAKE', color: '#3a5a2a' },
    { x: 52, name: '郵便局', sub: 'POST OFFICE', color: '#7a2a20' },
  ];
  for (const sh of SHOPS) {
    // the shops are built into the school tier's wall: a box from the ground up so the lane stops at their fronts
    rim(c, sh.x - 4.6, T1.z0, sh.x + 4.6, T1.z0 + 3.4, T1.y + 4, 'shop');
    addBox(b, 'plaster', sh.x, T1.y + 2.2, T1.z0 + 1.7, 9.2, 4.4, 3.4, 0, { cast: false });
    shopFront(b, { x: sh.x, y: T1.y, z: T1.z0 + 3.42, rot: 0, w: 8.6, name: sh.name, sub: sh.sub, color: sh.color, shutter: sh.x === -22 ? 'torn' : 'down', noren: sh.x === -22 ? '食堂' : undefined, lit: sh.x === 22 });
  }
  lanternString(c, { x0: -50, z0: 15, x1: 50, z1: 15, y: T1.y + 4.2, lit: 0.4, seed: 5201 });
  for (const [x, z, r] of [[-28, 17, 0.6], [16, 18, -0.4], [34, 12.6, 1.3]] as const) bicycle(b, { x, y: T1.y, z, rot: r, fallen: r > 1 });
  vendingMachine(b, { x: -5.4, y: T1.y, z: 9.8, rot: 0, color: 'red' });
  b.collide({ x: -5.4, z: 9.8, hx: 0.6, hz: 0.45, y0: 0, y1: T1.y + 1.9, mapKind: 'prop', tag: 'vending' });
  for (const [x, z] of [[-40, 18], [-16, 19], [8, 18.6], [30, 19], [50, 17]] as const) {
    addBox(b, 'steelDark', x, T1.y + 2.2, z, 0.12, 4.4, 0.12);
    b.collide({ x, z, hx: 0.12, hz: 0.12, y0: 0, y1: T1.y + 4.4, mapKind: 'prop', surface: 'metal', tag: 'lamp' });
    b.light({ x, y: T1.y + 4.2, z, color: 0xffb46a, intensity: 18, distance: 13, mode: x === 8 ? 'fail' : 'flicker', pool: 3, glow: 0.6, tag: 'market' });
  }
  debris(b, { x: -2, z: 17, radius: 2.2, seed: 5202 });

  // ---------------------------------------------------------------------------------------------
  // T2: the school (its roof the dance floor, level with T3) and the clinic
  // ---------------------------------------------------------------------------------------------
  const T2 = TIERS[2];
  const S = SCHOOL;
  b.collide({ x: (S.x0 + S.x1) / 2, z: (S.z0 + S.z1) / 2, hx: (S.x1 - S.x0) / 2, hz: (S.z1 - S.z0) / 2, y0: S.roofY - 0.4, y1: S.roofY, floor: true, surface: 'concrete', mapKind: 'none', tag: 'school-roof' });
  rim(c, S.x0 - 0.3, S.z0, S.x0, S.z1, S.roofY + 1.1, 'school');
  rim(c, S.x1, S.z0, S.x1 + 0.3, S.z1, S.roofY + 1.1, 'school');
  rim(c, S.x0, S.z1, S.x1, S.z1 + 0.3, S.roofY + 1.1, 'school');
  addBox(b, 'plaster', (S.x0 + S.x1) / 2, (T2.y + S.roofY) / 2, (S.z0 + S.z1) / 2, S.x1 - S.x0, S.roofY - T2.y, S.z1 - S.z0, 0, { cast: false });
  addBox(b, 'concreteSlab', (S.x0 + S.x1) / 2, S.roofY - 0.1, (S.z0 + S.z1) / 2, S.x1 - S.x0, 0.2, S.z1 - S.z0, 0, { cast: false });
  for (let x = S.x0 + 2; x < S.x1 - 1; x += 3) {
    addBox(b, Math.abs(x - -29) < 2 ? 'windowLit' : 'glassDark', x, T2.y + 1.9, S.z1 + 0.04, 2, 1.4, 0.06, 0, { cast: false, receive: false });
  }
  addBox(b, 'concreteWall', (S.x0 + S.x1) / 2, S.roofY + 0.55, S.z1 + 0.15, S.x1 - S.x0, 1.1, 0.3, 0, { cast: false });
  for (const x of [S.x0, S.x1]) addBox(b, 'concreteWall', x, S.roofY + 0.55, (S.z0 + S.z1) / 2, 0.3, 1.1, S.z1 - S.z0, 0, { cast: false });
  // the dance floor: the yagura stand in the middle, lantern strings from it to the corners
  const yx = (S.x0 + S.x1) / 2;
  const yz = (S.z0 + S.z1) / 2;
  addBox(b, MAT.woodLight(), yx, S.roofY + 1, yz, 2.6, 0.2, 2.6);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) addBox(b, MAT.woodDark(), yx + sx * 1.15, S.roofY + 0.5, yz + sz * 1.15, 0.16, 1, 0.16);
  b.collide({ x: yx, z: yz, hx: 1.3, hz: 1.3, y0: 0, y1: S.roofY + 1.1, mapKind: 'prop', surface: 'wood', tag: 'yagura' });
  for (const [x1, z1] of [[S.x0 + 1, S.z0 + 0.6], [S.x1 - 1, S.z0 + 0.6], [S.x0 + 1, S.z1 - 0.6], [S.x1 - 1, S.z1 - 0.6]] as const) lanternString(c, { x0: yx, z0: yz, x1, z1, y: S.roofY + 3.2, lit: 0.6, seed: 5300 + x1 });
  addBox(b, MAT.woodDark(), yx, S.roofY + 1.7, yz, 0.12, 3.4, 0.12);
  b.light({ x: yx, y: S.roofY + 3, z: yz, color: 0xff9a5a, intensity: 18, distance: 15, mode: 'flicker', pool: 4, glow: 0.8, tag: 'dance' });
  // the school's gate sign
  addBox(b, 'concreteWall', -12, T2.y + 1.1, 4.4, 0.6, 2.2, 0.6);
  b.collide({ x: -12, z: 4.4, hx: 0.3, hz: 0.3, y0: 0, y1: T2.y + 2.2, mapKind: 'prop', tag: 'gatepost' });
  // the clinic, a solid block with a lit window
  rim(c, 18, -9, 44, 0, T2.y + 6, 'clinic');
  addBox(b, 'plaster', 31, T2.y + 3, -4.5, 26, 6, 9, 0, { cast: false });
  for (let x = 20; x < 43; x += 3) addBox(b, x === 32 ? 'windowLit' : 'glassDark', x, T2.y + 2, 0.04, 1.6, 1.3, 0.06, 0, { cast: false, receive: false });
  addBox(b, 'paintRed', 31, T2.y + 4.8, 0.06, 1.2, 0.3, 0.04, 0, { cast: false });
  addBox(b, 'paintRed', 31, T2.y + 4.8, 0.06, 0.3, 1.2, 0.04, 0, { cast: false });
  for (const [x, z] of [[-6, 1], [12, -6], [48, 2], [-52, -6]] as const) {
    addBox(b, 'steelDark', x, T2.y + 2.2, z, 0.12, 4.4, 0.12);
    b.collide({ x, z, hx: 0.12, hz: 0.12, y0: 0, y1: T2.y + 4.4, mapKind: 'prop', surface: 'metal', tag: 'lamp' });
    b.light({ x, y: T2.y + 4.2, z, color: 0xcfe0ff, intensity: 16, distance: 13, mode: x === 12 ? 'fail' : 'steady', pool: 3, glow: 0.5, tag: 'school' });
  }
  crateGroup(b, { x: 6, y: T2.y, z: -7, rot: 0.2, count: 3, radius: 1.2, seed: 5301 });

  // ---------------------------------------------------------------------------------------------
  // T3: Block 65, its outside stair and Genzō's room
  // ---------------------------------------------------------------------------------------------
  const T3 = TIERS[3];
  const BX0 = -46;
  const BX1 = -8;
  rim(c, BX0, -26, BX1, -22, 34, 'block65');
  addBox(b, 'concreteDark', (BX0 + BX1) / 2, (T3.y + 34) / 2, -24, BX1 - BX0, 34 - T3.y, 4, 0, { cast: false });
  facade(c, BX0, BX1, -22, T3.y, 34, 1, 6565, 0.05);
  // the block's two wings running back over the summit (seen from below, the great U)
  addBox(b, 'concreteDark', BX0 - 1.5, 24, -36, 3, 20, 20, 0, { cast: false });
  addBox(b, 'concreteDark', BX1 + 1.5, 24, -36, 3, 20, 20, 0, { cast: false });
  // the block is solid back to the cliff (its courtyard is nobody's ground)
  rim(c, BX0 - 3, -46, BX1 + 3, -26, 34, 'block65-back');
  addBox(b, 'concreteDark', (BX0 + BX1) / 2, 30, -36, BX1 - BX0, 8, 20, 0, { cast: false });
  // "65" painted big on the front
  addBox(b, 'paintWhite', -13, 30, -21.97, 0.6, 3.2, 0.04, 0, { cast: false });
  addBox(b, 'paintWhite', -11.6, 30, -21.97, 0.6, 3.2, 0.04, 0, { cast: false });
  // the outside stair: from T3 at its east foot, west and up to the ledge
  const BS = BLOCK_STAIR;
  const n = Math.round((BS.yTop - BS.yFoot) / STEP_H);
  const run = (BS.xFoot - BS.xTop) / n;
  for (let i = 0; i < n; i++) {
    const top = BS.yFoot + (i + 1) * STEP_H;
    const xa = BS.xFoot - i * run;
    const xb = BS.xFoot - (i + 1) * run;
    const last = i === n - 1;
    b.collide({ x: (xa + xb) / 2 - (last ? 0.2 : 0), z: BS.z, hx: run / 2 + (last ? 0.2 : 0), hz: BS.w / 2, y0: top - 0.6, y1: top, floor: true, surface: 'metal', mapKind: 'none', tag: 'block-stair' });
    addBox(b, 'grating', (xa + xb) / 2, top - 0.05, BS.z, run + 0.02, 0.1, BS.w, 0, { cast: false });
  }
  for (const sz of [-1, 1]) {
    const z = BS.z + sz * (BS.w / 2 + 0.15);
    rim(c, BS.xTop, z - 0.15, BS.xFoot, z + 0.15, BS.yTop + 1, 'block-stair-rail');
    const L = BS.xFoot - BS.xTop;
    const rail = addBox(b, 'steelDark', (BS.xFoot + BS.xTop) / 2, (BS.yFoot + BS.yTop) / 2 + 0.95, z, Math.hypot(L, BS.yTop - BS.yFoot), 0.06, 0.06, 0, { cast: false });
    rail.rotation.set(0, 0, -Math.atan2(BS.yTop - BS.yFoot, L));
    rail.updateMatrixWorld(true);
    for (let x = BS.xTop + 1; x < BS.xFoot; x += 3.5) {
      const y = BS.yFoot + ((BS.xFoot - x) / L) * (BS.yTop - BS.yFoot);
      addBox(b, 'steelDark', x, (T3.y + y) / 2, z, 0.14, y - T3.y, 0.14, 0, { cast: false });
    }
  }
  // the ledge and Genzō's room on it
  const L = LEDGE;
  b.collide({ x: (L.x0 + L.x1) / 2, z: (L.z0 + L.z1) / 2, hx: (L.x1 - L.x0) / 2, hz: (L.z1 - L.z0) / 2, y0: L.y - 0.4, y1: L.y, floor: true, surface: 'concrete', mapKind: 'none', tag: 'ledge' });
  addBox(b, 'concreteSlab', (L.x0 + L.x1) / 2, L.y - 0.2, (L.z0 + L.z1) / 2, L.x1 - L.x0, 0.4, L.z1 - L.z0, 0, { cast: false });
  rim(c, L.x0 - 0.3, L.z0, L.x0, L.z1, L.y + 1, 'ledge');
  rim(c, L.x0, L.z1, L.x1, L.z1 + 0.3, L.y + 1, 'ledge');
  rim(c, L.x1, L.z1 - 1.6, L.x1 + 0.3, L.z1, L.y + 1, 'ledge');
  addBox(b, 'concreteWall', (L.x0 + L.x1) / 2, L.y + 0.5, L.z1 + 0.15, L.x1 - L.x0, 1, 0.3, 0, { cast: false });
  for (let x = L.x0 + 1; x < L.x1; x += 3) addBox(b, 'concreteDark', x, (T3.y + L.y) / 2, L.z1 - 0.3, 0.4, L.y - T3.y, 0.4, 0, { cast: false });
  // the room: walls on three sides, a door on the east
  const RX0 = L.x0;
  const RX1 = L.x0 + 6;
  const RZ0 = L.z0;
  const RZ1 = L.z0 + 4.4;
  rim(c, RX0, RZ1, RX1, RZ1 + 0.2, L.y + 2.6, 'room');
  rim(c, RX1, RZ0, RX1 + 0.2, RZ0 + 1.2, L.y + 2.6, 'room');
  rim(c, RX1, RZ0 + 2.6, RX1 + 0.2, RZ1, L.y + 2.6, 'room');
  addBox(b, 'wood', (RX0 + RX1) / 2, L.y + 1.3, RZ1 + 0.1, RX1 - RX0, 2.6, 0.2);
  addBox(b, 'wood', RX1 + 0.1, L.y + 1.3, RZ0 + 0.6, 0.2, 2.6, 1.2);
  addBox(b, 'wood', RX1 + 0.1, L.y + 1.3, RZ0 + 3.5, 0.2, 2.6, 1.8);
  addBox(b, 'wood', RX1 + 0.1, L.y + 2.4, RZ0 + 1.9, 0.2, 0.4, 1.4);
  addBox(b, 'corrugatedRust', (RX0 + RX1) / 2, L.y + 2.7, (RZ0 + RZ1) / 2, RX1 - RX0 + 0.6, 0.12, RZ1 - RZ0 + 0.6);
  addBox(b, MAT.woodDark(), RX0 + 1.4, L.y + 0.4, RZ0 + 1.2, 2, 0.8, 1);
  b.collide({ x: RX0 + 1.4, z: RZ0 + 1.2, hx: 1, hz: 0.5, y0: 0, y1: L.y + 0.8, mapKind: 'prop', surface: 'wood', tag: 'genzo-desk' });
  b.light({ x: RX0 + 3, y: L.y + 2.4, z: RZ0 + 2.2, color: 0xffc080, intensity: 9, distance: 7, mode: 'flicker', pool: 2, glow: 0.3, tag: 'genzo' });
  // T3 dressing: laundry on poles, a rooftop garden of planters, the lamps
  for (const x of [4, 14, 26, 38, 50]) {
    addBox(b, 'steelDark', x, T3.y + 1.1, -14, 0.08, 2.2, 0.08);
    addBox(b, 'steelDark', x + 5, T3.y + 1.1, -14, 0.08, 2.2, 0.08);
    addBox(b, 'steelDark', x + 2.5, T3.y + 2.1, -14, 5, 0.03, 0.03, 0, { cast: false });
    for (let k = 0; k < 4; k++) addBox(b, (['paintWhite', 'paintBlue', 'paintRed', 'canvasTan'] as const)[(x + k) % 4]!, x + 0.8 + k * 1.1, T3.y + 1.6, -14, 0.8, 0.9, 0.02, 0, { cast: false });
    b.collide({ x: x + 2.5, z: -14, hx: 2.6, hz: 0.1, y0: 0, y1: T3.y + 2.2, mapKind: 'none', blocksShots: false, tag: 'laundry' });
  }
  for (const [x, z] of [[-2, -16], [20, -24], [44, -18], [-4, -24]] as const) {
    addBox(b, 'steelDark', x, T3.y + 2.2, z, 0.12, 4.4, 0.12);
    b.collide({ x, z, hx: 0.12, hz: 0.12, y0: 0, y1: T3.y + 4.4, mapKind: 'prop', surface: 'metal', tag: 'lamp' });
    b.light({ x, y: T3.y + 4.2, z, color: 0xffb070, intensity: 16, distance: 13, mode: x === 20 ? 'fail' : 'flicker', pool: 3, glow: 0.5, tag: 'block' });
  }

  // ---------------------------------------------------------------------------------------------
  // T4: the summit - the shrine, the lighthouse, the stone's groove
  // ---------------------------------------------------------------------------------------------
  const T4 = TIERS[4];
  const sh = HIRASAKA.shrine;
  shrineHall(b, { x: sh.x, y: T4.y, z: sh.z, rot: 0, w: 7, d: 6 });
  rim(c, sh.x - 3.7, sh.z - 3.2, sh.x + 3.7, sh.z + 3.2, T4.y + 4, 'shrine');
  torii(b, { x: sh.x, y: T4.y, z: sh.z + 8, rot: 0, scale: 0.9 });
  for (const z of [sh.z + 5, sh.z + 11]) {
    stoneLantern(b, { x: sh.x - 2.6, y: T4.y, z, lit: true, scale: 0.7 });
    stoneLantern(b, { x: sh.x + 2.6, y: T4.y, z, lit: true, scale: 0.7 });
  }
  b.light({ x: sh.x, y: T4.y + 2.6, z: sh.z + 4, color: 0xff9a50, intensity: 14, distance: 11, mode: 'flicker', pool: 3, glow: 0.6, tag: 'shrine' });
  // the stone's groove across the head of the Hundred Steps, worn into the rock
  const SS = HIRASAKA.stoneSeal;
  groundRect(b, 'rubble', SS.x - 4, SS.z - 1.8, HIRASAKA.stoneRest.x + 3, SS.z + 1, T4.y + 0.02);
  addBox(b, 'paintRed', SS.x - 3.6, T4.y + 0.03, SS.z - 1.9, 0.2, 0.04, 0.2, 0, { cast: false });
  // the lighthouse and its generator shed
  const LH = HIRASAKA.lighthouse;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 16, 14), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.8 }));
  tower.position.set(LH.x, T4.y + 8, LH.z);
  b.add(tower);
  for (let k = 0; k < 3; k++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.25 + k * 0.02, 2.95 - k * 0.25, 1.2, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x9a1e1a, roughness: 0.8 }));
    band.position.set(LH.x, T4.y + 3 + k * 4.6, LH.z);
    b.add(band, { cast: false });
  }
  rim(c, LH.x - 3, LH.z - 3, LH.x + 3, LH.z + 3, T4.y + 16, 'lighthouse');
  const steel = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.5, metalness: 0.7 });
  const lhAt = (m: THREE.Mesh, y: number): void => {
    m.position.set(LH.x, T4.y + y, LH.z);
    b.add(m, { cast: false });
  };
  // the gallery round the top, its railing, the lantern room's glass and its domed cap
  lhAt(new THREE.Mesh(new THREE.CylinderGeometry(3.1, 2.4, 0.4, 20), steel), 16.15);
  lhAt(new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.05, 4, 28).rotateX(Math.PI / 2), steel), 17.25);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), steel);
    post.position.set(LH.x + Math.cos(a) * 3, T4.y + 16.8, LH.z + Math.sin(a) * 3);
    b.add(post, { cast: false });
  }
  lhAt(new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 2.2, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a3438, roughness: 0.1, metalness: 0.4, emissive: 0x6a5a30, emissiveIntensity: 0.35, side: THREE.DoubleSide })), 17.45);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), steel);
    bar.position.set(LH.x + Math.cos(a) * 1.57, T4.y + 17.45, LH.z + Math.sin(a) * 1.57);
    b.add(bar, { cast: false });
  }
  lhAt(new THREE.Mesh(new THREE.SphereGeometry(1.75, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a1c18, roughness: 0.6, metalness: 0.3 })), 18.55);
  lhAt(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 6), steel), 20.6);
  // its door, and the small windows up the stair inside
  addBox(b, MAT.woodDark(), LH.x - 2.62, T4.y + 1.15, LH.z, 0.12, 2.3, 1.2, 0, { cast: false });
  for (const [y, a] of [[5.5, Math.PI * 0.5], [9.5, Math.PI * 0.75], [13, Math.PI * 0.25]] as const) {
    const rr = 2.2 + (3 - 2.2) * (1 - y / 16) + 0.02;
    addBox(b, 'glassDark', LH.x + Math.cos(a) * rr, T4.y + y, LH.z + Math.sin(a) * rr, 0.08, 0.9, 0.55, -a, { cast: false });
  }
  const G = PLACES.generator;
  addBox(b, 'corrugatedRust', G.x + 1.6, T4.y + 1.3, G.z, 2.4, 2.6, 3.6);
  b.collide({ x: G.x + 1.6, z: G.z, hx: 1.2, hz: 1.8, y0: 0, y1: T4.y + 2.6, mapKind: 'prop', surface: 'metal', tag: 'generator-shed' });
  addBox(b, 'oliveMetal', G.x + 0.2, T4.y + 0.55, G.z, 1.2, 1.1, 1.8);
  b.collide({ x: G.x + 0.2, z: G.z, hx: 0.6, hz: 0.9, y0: 0, y1: T4.y + 1.1, mapKind: 'prop', surface: 'metal', tag: 'generator' });
  for (const [x, z] of [[-53, -30], [10, -36], [-2, -42], [28, -44]] as const) {
    addBox(b, 'steelDark', x, T4.y + 2.2, z, 0.12, 4.4, 0.12);
    b.collide({ x, z, hx: 0.12, hz: 0.12, y0: 0, y1: T4.y + 4.4, mapKind: 'prop', surface: 'metal', tag: 'lamp' });
    b.light({ x, y: T4.y + 4.2, z, color: 0xd0dcff, intensity: 14, distance: 13, mode: 'fail', pool: 3, glow: 0.5, tag: 'summit' });
  }
  crateGroup(b, { x: -54, y: T4.y, z: -38, rot: 0.8, count: 3, radius: 1.3, seed: 5401 });

  // ---------------------------------------------------------------------------------------------
  // the tapes and photographs: a small box under each (the things themselves are drawn by `look.ts`)
  // ---------------------------------------------------------------------------------------------
  void TAPES;
  void PHOTOS;

  // ---------------------------------------------------------------------------------------------
  // the mine
  // ---------------------------------------------------------------------------------------------
  const mine = buildMine(c, M);

  // the cage: players ride it on purpose; the infected never do
  const cageLink = floors.addLink(
    mine,
    0,
    [
      { x: HIRASAKA.cageBottom.x + 1.4, y: 0, z: HIRASAKA.cageBottom.z },
      { x: HIRASAKA.cageBottom.x, y: 0, z: HIRASAKA.cageBottom.z },
      { x: C.x, y: 0, z: C.z },
      { x: C.x, y: 0, z: C.z + 1.4 },
    ],
    true,
    { closed: true, manual: true },
  );
  // the old adit: the Slope's door at the top of the climb, out at the foot of the island (opened on the climb, when
  // whatever follows you up can follow you out)
  const aditLink = floors.addLink(
    mine,
    0,
    [
      { x: HIRASAKA.slopeTop.x, y: HIRASAKA.slopeTop.y, z: HIRASAKA.slopeTop.z },
      { x: HIRASAKA.slopeDoor.x, y: HIRASAKA.slopeTop.y, z: HIRASAKA.slopeDoor.z },
      { x: HIRASAKA.adit.x, y: 0, z: HIRASAKA.adit.z + 1 },
      { x: HIRASAKA.aditOut.x, y: 0, z: HIRASAKA.aditOut.z },
    ],
    true,
    { closed: true, manual: true },
  );

  // ---------------------------------------------------------------------------------------------
  // the map: regions, names, boxes, spawns, the residents
  // ---------------------------------------------------------------------------------------------
  d.regionRects.push(
    { region: 'high', x0: MINE.x0, z0: MINE.z0, x1: MINE.x1, z1: MINE.z1 },
    { region: 'high', x0: W.x0, z0: TIERS[4].z0, x1: W.x1, z1: TIERS[4].z1 },
    { region: 'medium', x0: W.x0, z0: TIERS[3].z0, x1: W.x1, z1: TIERS[2].z1 },
    { region: 'low', x0: B.minX, z0: B.minZ, x1: B.maxX, z1: B.maxZ },
  );
  d.label('THE SEAWALL', 0, 36, 0.75);
  d.label('PIER', 0, 49, 0.6);
  d.label('MINE HEAD', -46, 26, 0.65);
  d.label('OLD ADIT', 46, 27, 0.6);
  d.label('MARKET LANE', -16, 15, 0.75);
  d.label('THE SCHOOL', -29, -5, 0.7);
  d.label('CLINIC', 31, -4, 0.6);
  d.label('BLOCK 65', -26, -18, 0.8);
  d.label('THE SUMMIT', 0, -36, 0.8);
  d.label('LIGHTHOUSE', 46, -34, 0.6);
  d.label('SHRINE', -14, -34, 0.6);
  d.road(-3, 44, 3, -26, 'THE HUNDRED STEPS');
  // the boxes: one paid by the company store, a few free ones on the seawall and in the deep
  d.crate(-30, 26, 0, 'low', MYSTERY_BOX.paidCost);
  for (const [x, z, r] of [[36, 36, 0.3], [-52, 38, 0.8]] as const) d.crate(x, z, r, 'low');
  d.crate(150, 30, 0, 'high');
  d.crate(200, 12, 1.2, 'high');
  // spawn points by tier (the director picks near the hunted), and in the mine
  d.spawn('low', 'general', [[-54, 30], [-54, 40], [54, 30], [54, 40], [-20, 40], [26, 40], [-48, 12], [-30, 12], [-10, 14], [12, 13], [30, 14], [52, 12]], 1);
  d.spawn('medium', 'general', [[-54, -4], [-8, -3], [10, -2], [48, -6], [-52, -14], [-2, -12], [24, -16], [52, -22], [36, -12]], 1);
  d.spawn('high', 'general', [[-54, -42], [-53, -32], [-4, -44], [26, -45], [54, -30], [30, -30], [150, 30], [164, 22], [148, 40], [169, 18], [178, -4], [214, 28], [184, 26], [210, -2], [176, -40], [220, -24], [200, -46], [178, -22]], 1);
  d.spawn('low', 'defense', [[-36, 28], [38, 28], [-52, 34], [52, 34]], 1);
  d.spawn('high', 'defense', [[24, -32], [30, -28], [54, -44], [-4, -34]], 1);
  d.spawn('high', 'lz', [[0, -22], [-52, -24], [52, -24], [32, -24]], 1);
  d.zombies('low', 'shambler', [[-30, 34], [-8, 32], [12, 30], [-44, 22.6], [36, 30]]);
  d.zombies('low', 'shambler', [[-44, 14], [-24, 16], [-4, 13], [18, 16], [46, 14]]);
  d.zombies('medium', 'shambler', [[-50, -2], [-4, 0], [12, -2], [46, -6], [-30, -6]]);
  d.zombies('medium', 'runner', [[24, -14], [40, -20]]);
  d.zombies('medium', 'shambler', [[2, -14], [30, -18], [-2, -22]]);
  d.zombies('high', 'shambler', [[-54, -44], [10, -40], [34, -42]]);
  // the mine's own (kept where they are: they are below the map)
  d.zombies('high', 'shambler', [[148, 38], [150, 36], [152, 41], [160, 22], [163, 25], [169, 14], [182, 8], [200, 6], [210, 16], [188, 24]]);
  d.zombies('high', 'runner', [[156, 30], [168, 28], [204, 28]]);

  // the mission's relay console stands at the generator (it does nothing on this map)
  const transmitter: TransmitterHandle = {
    console: { x: G.x, y: T4.y + 1, z: G.z },
    consoleYaw: 0,
    setState() {},
    setProgress() {},
  };
  // the storm surge rises from the sea in the south
  const spire: SpireHandle = { top: { x: 0, y: 4, z: 50 }, setSurge() {} };
  return { transmitter, spire, handles: { mineArea: mine, cageLink, aditLink } };
}

// ---------------------------------------------------------------------------------------------
// the mine
// ---------------------------------------------------------------------------------------------

/** The Slope's floor height at x (0 at the Root Hall end, rising west to its landing). */
export function slopeY(x: number): number {
  if (x <= SLOPE.xTop) return SLOPE.y;
  if (x >= SLOPE.xFoot) return 0;
  const n = Math.round(SLOPE.y / STEP_H);
  const tread = (SLOPE.xFoot - SLOPE.xTop) / n;
  const i = Math.floor((SLOPE.xFoot - x) / tread) + 1;
  return Math.min(SLOPE.y, i * STEP_H);
}

function buildMine(c: Ctx, D: DressMats): number {
  const { b, floors } = c;
  const M = MINE;
  const area = floors.addArea('The Mine', 'under', 0, { minX: M.x0, maxX: M.x1, minZ: M.z0, maxZ: M.z1 });
  const rockMat = D.mineWall;
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.7, metalness: 0.2 });
  const roofMat = D.mineRoof;
  const mineTone = [0.062, 0.052, 0.042] as const;
  let cragSeed = 9000;
  // the shell: the mine sits inside a block of black rock (from the island it is a dark headland far across the water)
  const shell = new THREE.Mesh(new THREE.BoxGeometry(M.x1 - M.x0 + 8, 30, M.z1 - M.z0 + 8), new THREE.MeshStandardMaterial({ color: 0x0a0c0d, roughness: 1, side: THREE.BackSide }));
  shell.position.set((M.x0 + M.x1) / 2, 14, (M.z0 + M.z1) / 2);
  b.add(shell, { cast: false, receive: false });
  const outer = new THREE.Mesh(new THREE.BoxGeometry(M.x1 - M.x0 + 10, 31, M.z1 - M.z0 + 10), new THREE.MeshStandardMaterial({ color: 0x0b0d0e, roughness: 1 }));
  outer.position.set((M.x0 + M.x1) / 2, 14.6, (M.z0 + M.z1) / 2);
  b.add(outer, { cast: false, receive: false });
  // the headland it is cut into, as the island sees it: crags all round the block and over its top
  const hx0 = M.x0 - 7;
  const hx1 = M.x1 + 7;
  const hz0 = M.z0 - 7;
  const hz1 = M.z1 + 7;
  const cliff = (): number => 30;
  cragLine(b, D.rock, hx0, hz1, hx0, hz0, 6.5, 901, { y: SEA_Y - 1, h: cliff, w: 6.5, depth: 5 });
  cragLine(b, D.rock, hx0 + 4, hz1 - 3, hx0 + 4, hz0 + 3, 9, 906, { y: 4, h: () => 32, w: 7, depth: 5 });
  cragLine(b, D.rock, hx0, hz0, hx1, hz0, 8, 902, { y: SEA_Y - 1, h: cliff, w: 7.5, depth: 5 });
  cragLine(b, D.rock, hx0, hz1, hx1, hz1, 8, 903, { y: SEA_Y - 1, h: cliff, w: 7.5, depth: 5 });
  cragLine(b, D.rock, hx1, hz0, hx1, hz1, 10, 904, { y: SEA_Y - 1, h: cliff, w: 7.5, depth: 5 });
  {
    let q = 905;
    const r = (): number => {
      q = (q * 1664525 + 1013904223) >>> 0;
      return q / 4294967296;
    };
    for (let i = 0; i < 26; i++) {
      const x = M.x0 - 2 + r() * (M.x1 - M.x0 + 4);
      const z = M.z0 - 2 + r() * (M.z1 - M.z0 + 4);
      crag(b, D.rock, { x, y: 30, z, sx: 6 + r() * 6, sy: 3 + r() * 6, sz: 6 + r() * 6, seed: 950 + i, rot: r() * 6 });
    }
  }

  // carve: 1 m cells, each open cell knows its floor and roof
  const cols = M.x1 - M.x0;
  const rows = M.z1 - M.z0;
  const open = new Uint8Array(cols * rows);
  const base = new Float32Array(cols * rows);
  const roof = new Float32Array(cols * rows);
  for (const r of MINE_ROOMS) {
    for (let j = Math.max(0, r.z0 - M.z0); j < Math.min(rows, r.z1 - M.z0); j++) {
      for (let i = Math.max(0, r.x0 - M.x0); i < Math.min(cols, r.x1 - M.x0); i++) {
        const k = j * cols + i;
        const x = M.x0 + i + 0.5;
        const y = r.id === 'slope' ? slopeY(x) : r.id === 'slopeTop' ? SLOPE.y : 0;
        open[k] = 1;
        base[k] = Math.max(base[k]!, y);
        roof[k] = Math.max(roof[k]!, y + r.h);
      }
    }
  }
  const isOpen = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < cols && j < rows && open[j * cols + i] === 1;
  // walls along every edge between open and rock, merged into runs of the same height
  const wallMat = rockMat;
  const emit = (x0: number, z0: number, x1: number, z1: number, top: number, inX: number, inZ: number): void => {
    const hx = Math.max(0.25, (x1 - x0) / 2);
    const hz = Math.max(0.25, (z1 - z0) / 2);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    b.collide({ x: cx, z: cz, hx, hz, y0: 0, y1: top + 0.5, mapKind: 'wall', surface: 'concrete', tag: 'mine-wall' });
    const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, top + 0.5, hz * 2), wallMat);
    m.position.set(cx, (top + 0.5) / 2, cz);
    b.add(m, { cast: false });
    // the face is broken rock: crags set into it, standing a little out into the room
    const len = Math.max(hx, hz) * 2;
    if (len < 1.4) return;
    const fx = inX !== 0 ? (inX > 0 ? x1 : x0) : 0;
    const fz = inZ !== 0 ? (inZ > 0 ? z1 : z0) : 0;
    const n = Math.max(1, Math.round(len / 2.6));
    for (let i = 0; i < n; i++) {
      const s = cragSeed++;
      const t = (i + 0.5 + Math.sin(s * 12.9898) * 0.25) / n;
      const along = inX !== 0 ? z0 + (z1 - z0) * t : x0 + (x1 - x0) * t;
      const px = inX !== 0 ? fx + inX * 0.08 : along;
      const pz = inZ !== 0 ? fz + inZ * 0.08 : along;
      const tall = top > 8;
      const hh = tall ? 2.5 + (Math.abs(Math.sin(s * 3.1)) * top) / 2.2 : 0.8 + Math.abs(Math.sin(s * 3.1)) * top * 0.35;
      const w = 1.1 + Math.abs(Math.sin(s * 7.7)) * 0.9;
      crag(b, D.rock, { x: px, y: hh * 0.45 - 0.2, z: pz, sx: inX !== 0 ? 0.42 : w, sy: hh * 0.62, sz: inX !== 0 ? w : 0.42, seed: s, detail: 1, tone: mineTone });
    }
  };
  // rows: walls on the north (j-1 rock) and south (j+1 rock) sides of open cells
  for (const dj of [-1, 1]) {
    for (let j = 0; j < rows; j++) {
      let start = -1;
      let h = 0;
      const flush = (iEnd: number): void => {
        if (start < 0) return;
        const z = M.z0 + j + (dj < 0 ? 0 : 1);
        emit(M.x0 + start, z - (dj < 0 ? 0.5 : 0), M.x0 + iEnd, z + (dj < 0 ? 0 : 0.5), h, 0, -dj);
        start = -1;
      };
      for (let i = 0; i <= cols; i++) {
        const edge = i < cols && isOpen(i, j) && !isOpen(i, j + dj);
        const top = edge ? roof[j * cols + i]! : 0;
        if (edge && start >= 0 && Math.abs(top - h) < 0.01) continue;
        flush(i);
        if (edge) {
          start = i;
          h = top;
        }
      }
    }
  }
  // columns: walls on the west and east sides
  for (const di of [-1, 1]) {
    for (let i = 0; i < cols; i++) {
      let start = -1;
      let h = 0;
      const flush = (jEnd: number): void => {
        if (start < 0) return;
        const x = M.x0 + i + (di < 0 ? 0 : 1);
        emit(x - (di < 0 ? 0.5 : 0), M.z0 + start, x + (di < 0 ? 0 : 0.5), M.z0 + jEnd, h, -di, 0);
        start = -1;
      };
      for (let j = 0; j <= rows; j++) {
        const edge = j < rows && isOpen(i, j) && !isOpen(i + di, j);
        const top = edge ? roof[j * cols + i]! : 0;
        if (edge && start >= 0 && Math.abs(top - h) < 0.01) continue;
        flush(j);
        if (edge) {
          start = j;
          h = top;
        }
      }
    }
  }
  // floors and roofs, room by room
  for (const r of MINE_ROOMS) {
    if (r.id === 'slope') continue;
    const y = r.id === 'slopeTop' ? SLOPE.y : 0;
    const w = r.x1 - r.x0;
    const dd = r.z1 - r.z0;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, dd).rotateX(-Math.PI / 2), D.mineFloor);
    fl.position.set((r.x0 + r.x1) / 2, y + 0.01, (r.z0 + r.z1) / 2);
    b.add(fl, { cast: false });
    const rf = new THREE.Mesh(new THREE.PlaneGeometry(w, dd).rotateX(Math.PI / 2), roofMat);
    rf.position.set((r.x0 + r.x1) / 2, y + r.h, (r.z0 + r.z1) / 2);
    b.add(rf, { cast: false, receive: false });
  }
  // the caverns' roofs hang with rock
  for (const id of ['village', 'roothall'] as const) {
    const room = MINE_ROOMS.find((q) => q.id === id)!;
    for (let i = 0; i < 22; i++) {
      const s = cragSeed++;
      const u = Math.abs(Math.sin(s * 12.9898) * 43758.5453) % 1;
      const v = Math.abs(Math.sin(s * 78.233) * 12543.1234) % 1;
      const x = room.x0 + 2 + u * (room.x1 - room.x0 - 4);
      const z = room.z0 + 2 + v * (room.z1 - room.z0 - 4);
      const len = 1.5 + Math.abs(Math.sin(s)) * 4;
      crag(b, D.rock, { x, y: room.h - len * 0.4, z, sx: 0.6 + u * 0.9, sy: len * 0.6, sz: 0.6 + v * 0.9, seed: s, detail: 1, tone: mineTone });
    }
  }
  // the landing at the top of the Slope
  const st = MINE_ROOMS.find((r) => r.id === 'slopeTop')!;
  b.collide({ x: (st.x0 + st.x1) / 2, z: (st.z0 + st.z1) / 2, hx: (st.x1 - st.x0) / 2, hz: (st.z1 - st.z0) / 2, y0: SLOPE.y - 0.6, y1: SLOPE.y, floor: true, surface: 'concrete', mapKind: 'none', tag: 'slope-top' });
  addBox(b, rockMat, (st.x0 + st.x1) / 2, SLOPE.y / 2, (st.z0 + st.z1) / 2, st.x1 - st.x0, SLOPE.y, st.z1 - st.z0, 0, { cast: false });
  // the Slope's steps: worn rock, each a floor
  const ns = Math.round(SLOPE.y / STEP_H);
  const tread = (SLOPE.xFoot - SLOPE.xTop) / ns;
  for (let i = 0; i < ns; i++) {
    const top = (i + 1) * STEP_H;
    const xa = SLOPE.xFoot - i * tread;
    const xb = SLOPE.xFoot - (i + 1) * tread;
    const cx = (xa + xb) / 2;
    b.collide({ x: cx, z: (SLOPE.z0 + SLOPE.z1) / 2, hx: tread / 2 + 0.02, hz: (SLOPE.z1 - SLOPE.z0) / 2, y0: Math.max(0, top - 0.6), y1: top, floor: true, surface: 'concrete', mapKind: 'none', tag: 'slope' });
    addBox(b, rockMat, cx, top / 2, (SLOPE.z0 + SLOPE.z1) / 2, tread + 0.02, top, SLOPE.z1 - SLOPE.z0, 0, { cast: false });
    const rf = new THREE.Mesh(new THREE.PlaneGeometry(tread + 0.05, SLOPE.z1 - SLOPE.z0).rotateX(Math.PI / 2), roofMat);
    rf.position.set(cx, top + 5, (SLOPE.z0 + SLOPE.z1) / 2);
    b.add(rf, { cast: false, receive: false });
    if (i % 5 === 2) b.light({ x: cx, y: top + 3.6, z: SLOPE.z0 + 0.6, color: 0xff7040, intensity: 30, distance: 13, mode: 'flicker', glow: 0.35, tag: 'slope' });
  }
  // the adit's door at the top of the Slope: grey daylight round its edges
  addBox(b, MAT.woodDark(), HIRASAKA.slopeDoor.x - 0.6, SLOPE.y + 1.5, HIRASAKA.slopeDoor.z, 0.3, 3, 3.4);
  b.light({ x: HIRASAKA.slopeDoor.x + 1, y: SLOPE.y + 2.6, z: HIRASAKA.slopeDoor.z, color: 0xa8c0d8, intensity: 40, distance: 12, mode: 'steady', glow: 0.6, tag: 'adit' });

  // ---- the galleries: timber sets, rails, tubs, lamps ----
  const timber = MAT.woodDark();
  const gallery = (x0: number, z0: number, x1: number, z1: number, h: number, alongX: boolean): void => {
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let s = 2; s < len - 1; s += 4) {
      const x = alongX ? x0 + s : (x0 + x1) / 2;
      const z = alongX ? (z0 + z1) / 2 : z0 + s;
      const half = (alongX ? z1 - z0 : x1 - x0) / 2 - 0.3;
      for (const k of [-1, 1]) addBox(b, timber, alongX ? x : x + k * half, h / 2, alongX ? z + k * half : z, 0.3, h, 0.3, 0, { cast: false });
      addBox(b, timber, x, h - 0.2, z, alongX ? 0.3 : half * 2 + 0.3, 0.3, alongX ? half * 2 + 0.3 : 0.3, 0, { cast: false });
    }
    // the tub rails down the middle
    for (const k of [-0.5, 0.5]) addBox(b, 'steelDark', alongX ? (x0 + x1) / 2 : (x0 + x1) / 2 + k, 0.06, alongX ? (z0 + z1) / 2 + k : (z0 + z1) / 2, alongX ? len : 0.08, 0.08, alongX ? 0.08 : len, 0, { cast: false });
  };
  gallery(134, 27, 170, 33, 4.2, true);
  gallery(166, 6, 172, 33, 4.2, false);
  gallery(144, 33, 154, 44, 4, false);
  for (const [x, z] of [[138, 30], [148, 30], [158, 30], [169, 22], [169, 12], [149, 40], [162, 22], [140, 25.4]] as const) {
    b.light({ x, y: 3.6, z, color: 0xffb060, intensity: 42, distance: 15, mode: (x + z) % 4 === 0 ? 'fail' : 'flicker', pool: 2.6, glow: 0.5, tag: 'gallery' });
  }
  // coal faces: black walls the miners are still working
  addBox(b, coalMat, 149, 2, 43.6, 10, 4, 0.6, 0, { cast: false });
  addBox(b, coalMat, 162, 2, 18.4, 8, 4, 0.6, 0, { cast: false });
  // tubs, and a crushed one
  for (const [x, z, r] of [[142, 30.5, 0], [164, 30.5, 0], [169, 16, Math.PI / 2]] as const) {
    addBox(b, 'rust', x, 0.7, z, r ? 1 : 1.8, 1, r ? 1.8 : 1);
    b.collide({ x, z, hx: r ? 0.5 : 0.9, hz: r ? 0.9 : 0.5, y1: 1.2, mapKind: 'prop', surface: 'metal', tag: 'tub' });
  }
  // the landing: the cage's pit, the signal bell
  groundRect(b, 'hazard', HIRASAKA.cageBottom.x - 2.6, HIRASAKA.cageBottom.z - 2.6, HIRASAKA.cageBottom.x + 2.6, HIRASAKA.cageBottom.z - 2.2, 0.02);
  b.light({ x: 128, y: 5, z: 30, color: 0xffc888, intensity: 55, distance: 16, mode: 'flicker', pool: 3, glow: 0.5, tag: 'landing' });
  // the telephone in its niche
  addBox(b, 'paintBlack', PLACES.phone.x, 1.4, 24.3, 0.5, 0.7, 0.3);
  b.collide({ x: PLACES.phone.x, z: 24.3, hx: 0.3, hz: 0.2, y1: 1.8, mapKind: 'prop', tag: 'mine-phone' });

  // ---- the Old Village: houses, a well, lanterns in the windows, the tree of white peaches ----
  VILLAGE_HOUSES.forEach((h, i) => minka(b, D, h.x, h.z, h.rot, 5600 + i * 17));
  for (const h of VILLAGE_HOUSES) {
    const sideways = Math.abs(Math.sin(h.rot)) > 0.5;
    b.collide({ x: h.x, z: h.z, hx: sideways ? 2.5 : 3, hz: sideways ? 3 : 2.5, y1: 3.2, mapKind: 'building', surface: 'wood', tag: 'village-house' });
  }
  addBox(b, MAT.stone(), 198, 0.5, 14, 2, 1, 2);
  b.collide({ x: 198, z: 14, hx: 1, hz: 1, y1: 1, mapKind: 'prop', tag: 'well' });
  lanternString(c, { x0: 176, z0: 12, x1: 220, z1: 12, y: 4.4, lit: 0.8, seed: 5501 });
  // the peach tree: a twisted trunk, low boughs, a pale crown of blossom (its glowing fruit is `look.ts`'s)
  const PT = PLACES.peaches;
  peachTree(b, D);
  b.collide({ x: PT.x, z: PT.z, hx: 0.9, hz: 0.9, y1: 6, mapKind: 'prop', surface: 'wood', tag: 'peach-tree' });
  b.light({ x: PT.x, y: 5.5, z: PT.z, color: 0xffe8f0, intensity: 110, distance: 34, mode: 'pulse', period: 4, pool: 6, glow: 1.6, weight: 2, tag: 'peach' });
  for (const [x, z] of [[178, 26], [214, -4], [176, -4], [218, 28]] as const) b.light({ x, y: 4, z, color: 0xff9a50, intensity: 36, distance: 16, mode: 'flicker', glow: 0.4, tag: 'village' });

  // ---- the Root Hall: the dead tree whose roots are people ----
  rootTree(b, D);
  b.collide({ x: ROOT_TREE.x, z: ROOT_TREE.z, hx: 3.2, hz: 3.2, y1: 18, mapKind: 'prop', surface: 'wood', tag: 'root-tree' });
  for (const [x, z] of [[176, -30], [216, -26], [206, -44], [184, -44], [196, -24]] as const) b.light({ x, y: 6, z, color: 0xd0406e, intensity: 70, distance: 24, mode: 'pulse', period: 5, glow: 0.7, tag: 'roots' });
  // a cold light on the people the tree holds, from either side of it
  for (const [x, z] of [[203, -31], [189, -30], [196, -44]] as const) b.light({ x, y: 2.6, z, color: 0xe8d8ff, intensity: 40, distance: 13, mode: 'steady', glow: 0, tag: 'root-people' });
  b.light({ x: PLACES.hairpin.x, y: 1.4, z: PLACES.hairpin.z, color: 0xff3048, intensity: 8, distance: 6, mode: 'pulse', period: 2, glow: 0.4, tag: 'hairpin' });
  return area;
}
