/**
 * MUJIN: a small rural station on no map, at three minutes before dawn (`src/mujin/places.ts` has every place).
 *
 *   the tracks          two lines east-west through the middle, out of a tunnel in the west hill
 *   platform 1 (north)  the bell, the speaker, the sign, the vending machine, the passengers waiting; the station house
 *                       behind it (ticket hall with the gates, the payphone and lost property; the waiting room)
 *   platform 2 (south)  reached by the footbridge at the west end or across the tracks
 *   the level crossing  the road at the east end, ending at the shrine
 *   the field           north-west, long grass behind a fence (one gap)
 *   the shopping street south, shuttered, behind platform 2 (one gap)
 *   the shrine          south-east, up the road (one gap): the salt circle
 *
 * The three fenced areas are the ones the night takes (`SEALS`): their gaps carry switchable colliders, closed by the
 * loop. The pocket room (one loop back) is a copy of the waiting room built far south, reached only by the
 * Stationmaster's punch (a closed floors link, like the Sakura District's Kisaragi).
 */
import * as THREE from 'three';
import { MYSTERY_BOX } from '../../config';
import type { SpireHandle, TransmitterHandle } from '../landmarks';
import { bench, crateGroup, debris } from '../props';
import { addBox, building, groundRect, type Opening } from '../structures';
import type { BoxCollider } from '../collision';
import type { FloorLink } from '../floors';
import { HALF_PI, type Ctx } from './util';
import { MAT, commuterCar, grass, rails, shopFront, shrineHall, stoneLantern, torii } from './sakura/props';
import { MUJIN, MUJIN_BOUNDS, MUJIN_POCKET, PLACES, PLATFORM_Y, PLATFORMS, SEALS, TRACK_Z } from '../../mujin/places';

export interface MujinHandles {
  /** One collider per gap of each sealable area (`SEALS` order), built open. */
  seals: BoxCollider[][];
  /** The pocket room's floors area, and its (closed, manual) link. */
  pocketArea: number;
  pocketLink: FloorLink;
}

const B = MUJIN_BOUNDS;

/** A wall run from (x0, z0) to (x1, z1), `h` tall, solid to shots. */
function wallRun(c: Ctx, x0: number, z0: number, x1: number, z1: number, h: number, mat: 'concreteWall' | 'concreteDark' | 'wood' = 'concreteWall'): void {
  const { b } = c;
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 0.05) return;
  const rot = Math.atan2(-(z1 - z0), x1 - x0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  addBox(b, mat, cx, h / 2, cz, L, h, 0.3, rot);
  b.collide({ x: cx, z: cz, hx: L / 2, hz: 0.15, rot, y1: h, mapKind: 'wall', surface: mat === 'wood' ? 'wood' : 'concrete', tag: 'mujin-fence' });
}

/** A fence of wooden boards on posts (`h` tall), with a gap left where `gap` says (along its length, from x0/z0). */
function fence(c: Ctx, x0: number, z0: number, x1: number, z1: number, gaps: readonly [number, number][] = []): void {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / L;
  const uz = (z1 - z0) / L;
  let from = 0;
  for (const [a, e] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (a > from) wallRun(c, x0 + ux * from, z0 + uz * from, x0 + ux * a, z0 + uz * a, 2.2, 'wood');
    from = e;
  }
  if (from < L) wallRun(c, x0 + ux * from, z0 + uz * from, x1, z1, 2.2, 'wood');
}

/** A straight flight of steps along x, from (xTop, yTop) down to (xBottom, yBottom), `w` wide across z. */
function stairsX(c: Ctx, xTop: number, xBottom: number, z: number, w: number, yTop: number, yBottom: number): void {
  const { b } = c;
  const n = Math.ceil((yTop - yBottom) / 0.3);
  const rise = (yTop - yBottom) / n;
  const run = (xBottom - xTop) / n;
  for (let i = 0; i < n; i++) {
    const top = yTop - i * rise;
    const xa = xTop + run * i;
    const xb = xTop + run * (i + 1);
    const cx = (xa + xb) / 2;
    const hx = Math.abs(xb - xa) / 2 + (i === 0 ? 0.3 : 0);
    b.collide({ x: cx, z, hx, hz: w / 2, y0: yBottom, y1: top, floor: true, surface: 'concrete', mapKind: 'none', tag: 'bridge-stair' });
    addBox(b, 'concreteSlab', cx, (yBottom + top) / 2, z, Math.abs(xb - xa) + 0.02, top - yBottom, w, 0, { cast: false });
  }
  // a rail either side
  for (const s of [-1, 1]) {
    const zz = z + s * (w / 2 + 0.06);
    const L = Math.abs(xBottom - xTop);
    const mid = (xTop + xBottom) / 2;
    // the rail falls as the steps do (toward xBottom)
    const rot = Math.atan2(yTop - yBottom, xBottom - xTop) * (xBottom > xTop ? -1 : 1);
    const rail = addBox(b, 'steelDark', mid, (yTop + yBottom) / 2 + 0.9, zz, Math.hypot(L, yTop - yBottom), 0.06, 0.06, 0, { cast: false });
    rail.rotation.set(0, 0, rot);
    rail.updateMatrixWorld(true);
    b.collide({ x: mid, z: zz, hx: L / 2, hz: 0.06, y0: yBottom, y1: yTop + 1, mapKind: 'none', blocksShots: false, tag: 'bridge-rail' });
  }
}

/** The footbridge over both tracks at the west end: a covered deck at 5.3 m, a flight down to each platform. */
function footbridge(c: Ctx): void {
  const { b } = c;
  const x0 = -23;
  const x1 = -20.6;
  const y = 5.3;
  const zA = -7.6;
  const zB = 7.6;
  b.collide({ x: (x0 + x1) / 2, z: 0, hx: (x1 - x0) / 2, hz: (zB - zA) / 2, y0: y - 0.3, y1: y, floor: true, surface: 'metal', mapKind: 'none', tag: 'bridge-deck' });
  addBox(b, 'grating', (x0 + x1) / 2, y - 0.15, 0, x1 - x0, 0.3, zB - zA, 0, { cast: false });
  // its sides: the west one closed end to end; the east one open where each flight comes up (|z| from 5.5 to 7.6)
  addBox(b, 'steelDark', x0, y + 0.55, 0, 0.08, 1.1, zB - zA, 0, { cast: false });
  b.collide({ x: x0, z: 0, hx: 0.08, hz: (zB - zA) / 2, y0: y, y1: y + 1.2, mapKind: 'none', blocksShots: false, tag: 'bridge-side' });
  addBox(b, 'steelDark', x1, y + 0.55, 0, 0.08, 1.1, 11, 0, { cast: false });
  b.collide({ x: x1, z: 0, hx: 0.08, hz: 5.5, y0: y, y1: y + 1.2, mapKind: 'none', blocksShots: false, tag: 'bridge-side' });
  // the west side is closed (it looks out over the tunnel), the east side opens onto each flight
  addBox(b, 'roof', (x0 + x1) / 2, y + 2.6, 0, x1 - x0 + 0.6, 0.12, zB - zA + 0.6, 0, { cast: false });
  for (const z of [zA, zB]) {
    addBox(b, 'steelDark', x0, y + 1.3, z, 0.12, 2.6, 0.12);
    b.collide({ x: x0 - 0.06, z, hx: 0.3, hz: 0.6, y0: y, y1: y + 2.6, mapKind: 'none', tag: 'bridge-end' });
  }
  // legs on each platform
  for (const z of [-5, 5]) {
    for (const x of [x0 + 0.2, x1 - 0.2]) {
      addBox(b, 'steelDark', x, (y - 0.3 + PLATFORM_Y) / 2, z, 0.3, y - 0.3 - PLATFORM_Y, 0.3);
      b.collide({ x, z, hx: 0.16, hz: 0.16, y0: 0, y1: y - 0.3, mapKind: 'prop', surface: 'metal', tag: 'bridge-leg' });
    }
  }
  stairsX(c, x1, x1 + 7.2, -6.6, 2, y, PLATFORM_Y);
  stairsX(c, x1, x1 + 7.2, 6.6, 2, y, PLATFORM_Y);
  b.light({ x: (x0 + x1) / 2, y: y + 2.3, z: 0, color: 0xcfe0ff, intensity: 10, distance: 9, mode: 'fail', glow: 0.5, tag: 'bridge' });
}

/** A platform canopy over x0..x1 on platform `p`: posts down the middle, the roof, sodium lamps under it. */
function canopy(c: Ctx, p: (typeof PLATFORMS)[number], x0: number, x1: number): void {
  const { b } = c;
  const zm = (p.z0 + p.z1) / 2;
  const H = 3.8;
  for (let x = x0 + 2; x <= x1 - 1; x += 6) {
    addBox(b, 'steelDark', x, PLATFORM_Y + H / 2, zm, 0.2, H, 0.2);
    b.collide({ x, z: zm, hx: 0.12, hz: 0.12, y0: 0, y1: PLATFORM_Y + H, mapKind: 'prop', surface: 'metal', tag: 'canopy-post' });
  }
  addBox(b, 'roof', (x0 + x1) / 2, PLATFORM_Y + H + 0.1, zm, x1 - x0, 0.16, p.z1 - p.z0 + 0.4, 0);
  addBox(b, 'steelDark', (x0 + x1) / 2, PLATFORM_Y + H - 0.05, zm, x1 - x0, 0.1, 0.2, 0, { cast: false });
  for (let x = x0 + 5; x <= x1 - 3; x += 12) {
    addBox(b, 'lampWarm', x, PLATFORM_Y + H - 0.2, zm, 1.2, 0.08, 0.16, 0, { cast: false });
    b.light({ x, y: PLATFORM_Y + H - 0.4, z: zm, color: 0xffb060, intensity: 22, distance: 13, mode: x % 24 === 1 ? 'fail' : 'steady', pool: 3.6, glow: 0.7, weight: 1.4, tag: 'platform' });
  }
}

/** A level-crossing signal: a post, the black-and-yellow X, two red lamps (lit by the runtime when it rings). */
function crossingSignal(c: Ctx, x: number, z: number, rot: number): void {
  const { b } = c;
  addBox(b, 'paintBlack', x, 1.6, z, 0.16, 3.2, 0.16, rot);
  for (const s of [-1, 1]) {
    const arm = addBox(b, 'paintYellow', x, 2.9, z, 1.2, 0.14, 0.04, rot, { cast: false });
    arm.rotation.set(0, rot, s * 0.75);
    arm.updateMatrixWorld(true);
  }
  addBox(b, 'paintBlack', x, 2.25, z, 0.9, 0.3, 0.1, rot, { cast: false });
  b.collide({ x, z, hx: 0.15, hz: 0.15, y1: 3.2, mapKind: 'prop', surface: 'metal', tag: 'crossing-signal' });
}

/** A dark cedar on the hills round the station (no collider: out of reach). */
function cedar(b: Ctx['b'], x: number, z: number, h: number): void {
  const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.22, h, 7), MAT.moss());
  m.position.set(x, h / 2, z);
  b.add(m, { cast: false });
}

const door = (at: number, width = 1.6, height = 2.5): Opening => ({ at, width, height, kind: 'door', frame: 'wood' });
const win = (at: number, width = 1.4, lit = false): Opening => ({ at, width, height: 1.2, sill: 1.0, kind: 'window', frame: 'wood', lit });

export function buildMujin(c: Ctx): { transmitter: TransmitterHandle; spire: SpireHandle; handles: MujinHandles } {
  const { b, d, floors } = c;

  // ---- the ground, the hills, the edge ----
  groundRect(b, 'gravel', B.minX - 40, B.minZ - 40, B.maxX + 40, B.maxZ + 40, 0.005);
  groundRect(b, 'dirt', -18, -36, 37, -22, 0.008);
  for (const [x0, z0, x1, z1] of [
    [B.minX - 2, B.minZ - 2, B.maxX + 2, B.minZ],
    [B.minX - 2, B.maxZ, B.maxX + 2, B.maxZ + 2],
    [B.minX - 2, B.minZ, B.minX, B.maxZ],
    [B.maxX, B.minZ, B.maxX + 2, B.maxZ],
  ] as const) b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y1: 8, mapKind: 'wall', tag: 'mujin-edge' });
  let s = 4447;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  // the hills the station sits in: low rounded mounds all round, wooded
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x1c2420, roughness: 1 });
  // never into the station's grounds (the shrine is near its edge) or the pocket room built out in the south
  const keepOut = [
    { x0: B.minX - 4, x1: B.maxX + 4, z0: B.minZ - 4, z1: B.maxZ + 4 },
    { x0: MUJIN_POCKET.x0 - 4, x1: MUJIN_POCKET.x1 + 4, z0: MUJIN_POCKET.z0 - 4, z1: MUJIN_POCKET.z1 + 4 },
  ];
  const clearOf = (x: number, z: number): number => Math.min(...keepOut.map((q) => Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1))));
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rand() * 0.2;
    const r = 30 + rand() * 16;
    const h = 14 + rand() * 14;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.scale.set(1, h / r, 1);
    let x = Math.cos(a) * (96 + rand() * 10);
    let z = Math.sin(a) * (78 + rand() * 8);
    while (clearOf(x, z) < r) {
      x *= 1.04;
      z *= 1.04;
    }
    hill.position.set(x, -1, z);
    b.add(hill, { cast: false });
  }
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.08 + rand() * 0.4;
    const x = Math.cos(a) * (B.maxX + 6) * r;
    const z = Math.sin(a) * (B.maxZ + 6) * r;
    cedar(b, x, z, 9 + rand() * 9);
  }

  // ---- the tracks and the tunnel ----
  for (const z of TRACK_Z) rails(c, { x0: B.minX - 30, z0: z, x1: B.maxX + 30, z1: z });
  groundRect(b, 'gravel', B.minX - 30, -3.6, B.maxX + 30, 3.6, 0.012);
  // the tunnel mouth in the west hill: a concrete portal, black inside
  addBox(b, 'concreteDark', -47, 4.5, -7.5, 6, 9, 6);
  addBox(b, 'concreteDark', -47, 4.5, 7.5, 6, 9, 6);
  addBox(b, 'concreteDark', -47, 7.4, 0, 6, 3.2, 9);
  addBox(b, MAT.blackLacquer(), -49.4, 2.9, 0, 0.4, 5.8, 9, 0, { cast: false });
  b.collide({ x: -47, z: 0, hx: 3, hz: 10.5, y1: 9, mapKind: 'wall', surface: 'concrete', tag: 'tunnel' });
  addBox(b, MAT.stoneDark(), -47, 11, 0, 8, 4, 22, 0, { cast: false });
  groundRect(b, 'paintYellow', -43.8, -4.6, -43.6, 4.6, 0.02);

  // ---- the platforms ----
  for (const p of PLATFORMS) {
    b.collide({ x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2, hx: (p.x1 - p.x0) / 2, hz: (p.z1 - p.z0) / 2, y0: 0, y1: PLATFORM_Y, floor: true, surface: 'concrete', mapKind: 'none', tag: 'platform' });
    addBox(b, 'concreteSlab', (p.x0 + p.x1) / 2, PLATFORM_Y / 2, (p.z0 + p.z1) / 2, p.x1 - p.x0, PLATFORM_Y, p.z1 - p.z0, 0, { cast: false });
    // the yellow line along the track edge
    const edge = p.z0 < 0 ? p.z1 - 0.7 : p.z0 + 0.5;
    groundRect(b, 'paintYellow', p.x0, edge, p.x1, edge + 0.2, PLATFORM_Y + 0.004);
    canopy(c, p, -12, 30);
  }
  footbridge(c);

  // ---- the station house: the ticket hall (west) and the waiting room (east), the plaza behind ----
  building(b, {
    x: 0,
    z: -15.25,
    w: 28,
    d: 13.5,
    height: 4.2,
    wallMaterial: 'plaster',
    roofMaterial: 'roof',
    floorMaterial: 'floorStore',
    ceilingMaterial: 'plaster',
    sides: {
      // the south side's openings are measured from its east end: the waiting room's window and door, the gates' arch
      S: { openings: [win(4, 3), door(9, 1.6), door(19, 4.4, 2.6)] },
      N: { openings: [door(9, 3, 2.6)] },
      // the west side runs north from its south end: a side door by the gates
      W: { openings: [door(2.6, 1.6)] },
      E: { openings: [win(7, 2, true)] },
    },
    partitions: [{ x0: 3, z0: -22, x1: 3, z1: -8.5, openings: [door(9, 1.4)] }],
    tag: 'station-house',
  });
  // the ticket gates: four cabinets with passages between
  for (const x of [-8, -6, -4, -2]) {
    addBox(b, 'steel', x, 0.5, -10.6, 0.32, 1, 1.4);
    addBox(b, 'emBlue', x, 1.02, -10.1, 0.24, 0.04, 0.2, 0, { cast: false });
    b.collide({ x, z: -10.6, hx: 0.17, hz: 0.7, y1: 1, mapKind: 'prop', surface: 'metal', tag: 'ticket-gate' });
  }
  // the payphone, the kiosk counter, lost property's hatch on the partition
  addBox(b, 'paintGrey', MUJIN.payphone.x - 0.9, 1.2, MUJIN.payphone.z, 0.3, 0.8, 0.5);
  b.collide({ x: MUJIN.payphone.x - 0.9, z: MUJIN.payphone.z, hx: 0.2, hz: 0.3, y1: 1.8, mapKind: 'prop', tag: 'payphone' });
  addBox(b, 'wood', -10.5, 0.55, -19.6, 3, 1.1, 0.8);
  b.collide({ x: -10.5, z: -19.6, hx: 1.5, hz: 0.4, y1: 1.1, mapKind: 'prop', surface: 'wood', tag: 'kiosk' });
  addBox(b, 'wood', 2.75, 1.25, -18.5, 0.1, 0.8, 1.4, 0, { cast: false });
  // the waiting room's bench along its back wall
  addBox(b, 'wood', MUJIN.bench.x, 0.45, MUJIN.bench.z - 5.2, 8, 0.1, 0.5);
  b.collide({ x: MUJIN.bench.x, z: MUJIN.bench.z - 5.2, hx: 4, hz: 0.3, y1: 0.5, mapKind: 'prop', surface: 'wood', tag: 'bench-back' });
  addBox(b, 'wood', MUJIN.bench.x, 0.45, MUJIN.bench.z, 6, 0.1, 0.5);
  addBox(b, 'wood', MUJIN.bench.x, 0.8, MUJIN.bench.z - 0.24, 6, 0.6, 0.06);
  b.collide({ x: MUJIN.bench.x, z: MUJIN.bench.z, hx: 3, hz: 0.28, y1: 0.5, mapKind: 'prop', surface: 'wood', tag: 'bench' });
  // the rooms are lit as well as the platforms are (going in never plunges the screen into the dark)
  for (const [x, z] of [[-9.5, -12], [-9.5, -18.5], [-3, -12], [-3, -18.5]] as const) b.light({ x, y: 3.9, z, color: 0xe6ecf4, intensity: 20, distance: 12, mode: 'steady', pool: 3, glow: 0.35, indoor: true, tag: 'hall' });
  for (const [x, z] of [[6.5, -12.5], [11, -12.5], [8.5, -18.5]] as const) b.light({ x, y: 3.9, z, color: 0xffd4a0, intensity: 18, distance: 11, mode: 'steady', pool: 3, glow: 0.35, indoor: true, tag: 'waiting' });
  d.station({ kind: 'buy', name: 'STATION KIOSK', x: -10.5, z: -18.6, yaw: Math.PI, region: 'low' });

  // ---- the plaza, the east lot, the storehouse ----
  groundRect(b, 'asphalt', -18, -32, 37, -28, 0.01);
  bench(b, { x: -8, z: -26, rot: 0 });
  bench(b, { x: 6, z: -26, rot: 0 });
  addBox(b, 'paintGrey', 12, 1.3, -26.5, 0.1, 2.6, 0.1);
  addBox(b, 'paintBlue', 12, 2.5, -26.5, 0.8, 0.5, 0.06, 0, { cast: false });
  building(b, {
    x: 26,
    z: -20,
    w: 8,
    d: 7,
    height: 3.4,
    wallMaterial: 'wood',
    roofMaterial: 'roof',
    floorMaterial: 'wood',
    ceilingMaterial: 'wood',
    sides: { W: { openings: [door(3.5, 2.2)] }, S: { openings: [win(4)] } },
    tag: 'storehouse',
  });
  d.station({ kind: 'upgrade', name: 'LINE WORKS STORE', x: 26, z: -20, yaw: HALF_PI, region: 'low' });
  crateGroup(b, { x: 31, z: -12, rot: 0.3, count: 3, radius: 1.2, seed: 811 });
  debris(b, { x: -14, z: -30, radius: 2.4, seed: 812 });

  // ---- the level crossing and its road (to the shrine) ----
  groundRect(b, 'asphalt', 37, -36, 41, 12.4, 0.01);
  groundRect(b, 'paintYellow', 37, -4.6, 41, -4.4, 0.016);
  groundRect(b, 'paintYellow', 37, 4.4, 41, 4.6, 0.016);
  crossingSignal(c, 35.6, -5.5, 0);
  crossingSignal(c, 42.4, 5.5, Math.PI);
  for (const [x, z] of [[36.2, -4.8], [41.8, 4.8]] as const) {
    addBox(b, 'paintBlack', x, 0.5, z, 0.3, 1, 0.3);
    b.collide({ x, z, hx: 0.16, hz: 0.16, y1: 1, mapKind: 'prop', tag: 'barrier-box' });
  }

  // ---- the field (north-west), fenced, one gap ----
  const fieldGap = SEALS[2].gaps[0];
  fence(c, -50, -12.4, -18.4, -12.4);
  fence(c, -18.4, -36, -18.4, -12.4, [[fieldGap.z - fieldGap.hz + 36, fieldGap.z + fieldGap.hz + 36]]);
  grass(c, { x0: -48, z0: -34, x1: -20, z1: -14, density: 1.1, seed: 821 });

  // ---- the shopping street (south), fenced, one gap ----
  const streetGap = SEALS[0].gaps[0];
  fence(c, -50, 10.4, 20.6, 10.4, [[streetGap.x - streetGap.hx + 50, streetGap.x + streetGap.hx + 50]]);
  fence(c, 21, 10.4, 21, 36);
  groundRect(b, 'asphalt', -50, 20, 20.6, 26, 0.01);
  const SHOPS = [
    { x: -40, name: '喫茶 ハル', sub: 'COFFEE HARU', color: '#5a3a2a' },
    { x: -30, name: '本屋', sub: 'BOOKS', color: '#2a3a5a' },
    { x: -20, name: '八百屋', sub: 'GREENGROCER', color: '#3a5a2a' },
    { x: -6, name: '時計店', sub: 'CLOCKS', color: '#4a2a4a' },
    { x: 4, name: '薬局', sub: 'PHARMACY', color: '#2a4a4a' },
  ];
  for (const sh of SHOPS) {
    addBox(b, 'plaster', sh.x, 2.2, 14.7, 9, 4.4, 6.6);
    b.collide({ x: sh.x, z: 14.7, hx: 4.5, hz: 3.3, y1: 4.4, mapKind: 'building', surface: 'concrete', tag: 'shop' });
    // the clock shop's shutter is the one that can be wrong (the runtime draws it)
    if (sh.x !== -6) shopFront(b, { x: sh.x, z: 18.02, rot: 0, w: 8.4, name: sh.name, sub: sh.sub, color: sh.color, shutter: 'down' });
    else shopFront(b, { x: sh.x, z: 18.02, rot: 0, w: 8.4, name: sh.name, sub: sh.sub, color: sh.color, shutter: 'up' });
  }
  for (const x of [-38, -24, -10, 6]) {
    addBox(b, 'plaster', x, 2.4, 31.5, 12, 4.8, 7);
    b.collide({ x, z: 31.5, hx: 6, hz: 3.5, y1: 4.8, mapKind: 'building', surface: 'concrete', tag: 'shop' });
    shopFront(b, { x, z: 27.98, rot: Math.PI, w: 11, name: x === -24 ? '銭湯' : 'シャッター', sub: x === -24 ? 'BATHHOUSE' : 'CLOSED', color: '#3a3a3a', shutter: 'down' });
  }
  crateGroup(b, { x: -46, z: 23, rot: 0.2, count: 3, radius: 1.2, seed: 831 });
  debris(b, { x: -14, z: 23, radius: 2, seed: 832 });

  // ---- the shrine (south-east), fenced, one gap ----
  const shrineGap = SEALS[1].gaps[0];
  fence(c, 21, 12.4, 50, 12.4, [[shrineGap.x - shrineGap.hx - 21, shrineGap.x + shrineGap.hx - 21]]);
  torii(b, { x: 39, z: 15, rot: 0, scale: 1 });
  for (let z = 17.5; z <= 26; z += 3.4) {
    stoneLantern(b, { x: 36.6, z, lit: true, scale: 0.8 });
    stoneLantern(b, { x: 41.4, z, lit: true, scale: 0.8 });
  }
  shrineHall(b, { x: 39, z: 31.5, rot: 0, w: 7, d: 6 });
  // the salt circle on the shrine path (the Tall Lady loses whoever stands in it)
  const salt = new THREE.Mesh(new THREE.RingGeometry(MUJIN.salt.r - 0.18, MUJIN.salt.r, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 1, emissive: 0x302c28 }));
  salt.position.set(MUJIN.salt.x, 0.02, MUJIN.salt.z);
  b.add(salt, { cast: false });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const pile = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 1 }));
    pile.position.set(MUJIN.salt.x + Math.cos(a) * (MUJIN.salt.r + 0.25), 0.11, MUJIN.salt.z + Math.sin(a) * (MUJIN.salt.r + 0.25));
    b.add(pile, { cast: false });
  }
  b.light({ x: 39, y: 2.6, z: 28, color: 0xff9a50, intensity: 16, distance: 10, mode: 'flicker', pool: 3, glow: 0.6, tag: 'shrine' });
  for (const [x, z] of [[28, 20], [30, 32], [46, 18], [47, 30]] as const) cedar(b, x, z, 10);
  for (const [x, z] of [[28, 20], [30, 32], [46, 18], [47, 30]] as const) b.collide({ x, z, hx: 0.6, hz: 0.6, y1: 6, mapKind: 'prop', surface: 'wood', tag: 'cedar' });

  // ---- the sealable gaps: colliders that start open (`mujin/seals.ts` closes them) ----
  const seals = SEALS.map((area) => area.gaps.map((g) => b.collide({ ...g, y1: 6, blocksMove: false, blocksShots: false, mapKind: 'none', tag: `seal:${area.id}` })));

  // ---- the train that brought you, gone: only the dawn train comes (the mission's), and the express ----
  void commuterCar;

  // ---- the pocket room: the waiting room again, one loop back ----
  const P = MUJIN_POCKET;
  const pocketArea = floors.addArea('Pocket', 'under', 0, { minX: P.x0, maxX: P.x1, minZ: P.z0, maxZ: P.z1 });
  groundRect(b, 'floorStore', P.x0, P.z0, P.x1, P.z1, 0.02);
  for (const [x0, z0, x1, z1] of [
    [P.x0, P.z0, P.x1, P.z0],
    [P.x0, P.z1, P.x1, P.z1],
    [P.x0, P.z0, P.x0, P.z1],
    [P.x1, P.z0, P.x1, P.z1],
  ] as const) wallRun(c, x0, z0, x1, z1, 4, 'concreteDark');
  addBox(b, 'plaster', 0, 4.1, (P.z0 + P.z1) / 2, P.x1 - P.x0, 0.2, P.z1 - P.z0, 0, { cast: false });
  addBox(b, 'wood', 0, 0.45, 82, 6, 0.1, 0.5);
  addBox(b, 'wood', 0, 0.8, 82.24, 6, 0.6, 0.06);
  b.collide({ x: 0, z: 82, hx: 3, hz: 0.28, y1: 0.5, mapKind: 'prop', surface: 'wood', tag: 'pocket-bench' });
  addBox(b, MAT.blackLacquer(), MUJIN.pocketDoor.x, 1.25, P.z0 + 0.05, 1.4, 2.5, 0.1, 0, { cast: false });
  b.light({ x: 0, y: 3.8, z: 77, color: 0xffc890, intensity: 10, distance: 12, mode: 'fail', pool: 3, glow: 0.4, indoor: true, tag: 'pocket' });
  const pocketLink = floors.addLink(
    pocketArea,
    0,
    [
      { x: MUJIN.pocketDoor.x, y: 0, z: MUJIN.pocketDoor.z + 1 },
      { x: MUJIN.pocketDoor.x, y: 0, z: MUJIN.pocketDoor.z },
      { x: MUJIN.pocketReturn.x, y: PLATFORM_Y, z: MUJIN.pocketReturn.z },
      { x: MUJIN.pocketReturn.x, y: PLATFORM_Y, z: MUJIN.pocketReturn.z + 0.6 },
    ],
    true,
    { closed: true, manual: true },
  );

  // ---- the map: regions, names ----
  d.regionRects.push(
    { region: 'high', x0: 21.4, z0: 12.4, x1: 50, z1: 36 },
    { region: 'medium', x0: -50, z0: 10.4, x1: 20.6, z1: 36 },
    { region: 'medium', x0: -50, z0: -36, x1: -18.4, z1: -12.4 },
    { region: 'low', x0: B.minX, z0: B.minZ, x1: B.maxX, z1: B.maxZ },
  );
  d.label('PLATFORM 1', 6, -6, 0.75);
  d.label('PLATFORM 2', 6, 6, 0.75);
  d.label('STATION', 0, -15, 0.8);
  d.label('TUNNEL', -42, 0, 0.7);
  d.label('CROSSING', 39, -8, 0.7);
  d.label('THE FIELD', -34, -24, 0.75);
  d.label('SHOPPING STREET', -16, 23, 0.75);
  d.label('SHRINE', 39, 24, 0.75);
  d.road(37, -36, 41, 12, 'CROSSING ROAD');

  // ---- the boxes (one paid, by the station house, opened as often as you can pay; three free ones out in the
  // night), spawn points, the people still waiting ----
  d.crate(-17, -10.5, 0, 'medium', MYSTERY_BOX.paidCost);
  for (const [x, z, r] of [[-30, -16, 0.2], [12, 22, 0.3], [46, 34, 0.8]] as const) d.crate(x, z, r, x > 21 && z > 12 ? 'high' : 'medium');
  d.spawn('low', 'general', [[-42, -2], [-42, 2], [0, -34], [-12, -34], [28, -33], [39, -34], [46, -12]], 1);
  d.spawn('medium', 'general', [[-46, 23], [-30, 24], [0, 24], [14, 24], [-44, -30], [-30, -33], [-24, -18]], 1);
  d.spawn('high', 'general', [[46, 33], [26, 34], [47, 16]], 1);
  d.spawn('low', 'defense', [[-30, -6], [30, -6], [-30, 6], [30, 6]], 1);
  d.spawn('low', 'lz', [[-40, -1.5], [-40, 1.5], [44, -1.5], [44, 1.5], [-30, -10], [30, -10]], 1);
  d.zombies('low', 'shambler', [[-28, -5.2], [-26.5, -5.2], [-25, -5.2], [24, 5.2], [25.5, 5.2], [-6, -13], [-3, -16], [6, -24], [30, -24]]);
  d.zombies('medium', 'shambler', [[-36, 23], [-12, 22], [8, 24], [-36, -22]]);
  d.zombies('medium', 'runner', [[-20, 24], [-28, -28]]);
  d.zombies('high', 'shambler', [[34, 22], [44, 26]]);

  // ---- the platform bell (the mission's "relay" console stands here; it does nothing on this map) ----
  const bell = MUJIN.bell;
  addBox(b, 'steelDark', bell.x, PLATFORM_Y + 1.2, bell.z - 0.6, 0.12, 2.4, 0.12);
  b.collide({ x: bell.x, z: bell.z - 0.6, hx: 0.12, hz: 0.12, y0: 0, y1: PLATFORM_Y + 2.4, mapKind: 'prop', surface: 'metal', tag: 'bell-post' });
  // the jobs' things (`mujin/look.ts` draws them): the PA desk, the breaker cabinets
  b.collide({ x: PLACES.mic.x, z: PLACES.mic.z, hx: 0.55, hz: 0.3, y1: 0.9, mapKind: 'prop', surface: 'wood', tag: 'pa-desk' });
  for (const k of PLACES.breakers) b.collide({ x: k.x, z: k.z, hx: 0.35, hz: 0.23, y1: 1.4, mapKind: 'prop', surface: 'metal', tag: 'breaker' });
  // the lamp board beside the bell (`mujin/look.ts` draws it)
  b.collide({ x: 1, z: -8.15, hx: 2.1, hz: 0.12, y0: 0, y1: PLATFORM_Y + 3.2, mapKind: 'prop', surface: 'wood', tag: 'lamp-board' });
  const transmitter: TransmitterHandle = {
    console: { x: bell.x, y: PLATFORM_Y + 1, z: bell.z },
    consoleYaw: 0,
    setState() {},
    setProgress() {},
  };
  // the night comes out of the tunnel at the very end
  const spire: SpireHandle = { top: { x: -46, y: 6, z: 0 }, setSurge() {} };
  return { transmitter, spire, handles: { seals, pocketArea, pocketLink } };
}
