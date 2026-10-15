/**
 * The Forge beyond the four old districts (the map grew from 124 x 100 m to 190 x 150 m). North is -Z.
 *
 *   N  Quench Street, the Hearth (the safe courtyard by the Pad where the run starts: its gate open, a sentry gun in
 *      the middle), Anya's radio room, the pump
 *      house, the Rumble Pit (riry's arena), the quench shed, the Slag Yard and its control shed
 *   W  Flame Row; the pattern shop
 *   E  Ember Road and the Spawn Hall (the clan's #infernus-spawn: where it started), its back office
 *   S  Foundry Street, the Ledger House (the Ignis ledger, the hand-delivery counter) and its office, the furnace
 *      crew's lockers, the market's cold store
 *
 * Around it all stand the seven foundries, one for each ember (`FOUNDRY_SITES`): brick halls with a cold forge inside,
 * spread over the whole map. Stoke one and hold the hall while it catches (`forge/story.ts`).
 *
 * The safe rooms are `forgeRooms.ts`. Everything here registers its colliders, spawn points and resident infected.
 */
import * as THREE from 'three';
import { FORGE_SQUAD } from '../../config';
import type { FurnaceSpot, HearthDef, LedgerSpot, RumblePitDef, SafeRoomDef } from '../../forge/sites';
import { barrelGroup, container, corpse, crateGroup, debris, floodlightTower, fuelTank, jerseyBarrier, pallet, pipeStack, streetLamp, tireStack, vehicle } from '../props';
import { addBox, building, groundRect, type Side, wallDecal } from '../structures';
import { neonLabelMaterial } from '../landmarks/tex';
import { type DoorHandle, safeRoom } from './forgeRooms';
import { ignisMaterial, ignisTerminalMaterial } from './ignis';
import { HALF_PI, type Ctx } from './util';
import { vulcanSigilMaterial } from './vulcan';

export interface OuterResult {
  rooms: SafeRoomDef[];
  hearth: HearthDef;
  ledger: LedgerSpot[];
  rumble: RumblePitDef;
  /** The Hearth's gate glow (amber; red when the last carrier turns). */
  hearthGlow: THREE.MeshStandardMaterial;
  /** The seven foundries' forges (in `FORGE_SQUAD.flames` order). */
  furnaces: FurnaceSpot[];
  /** Each forge's mouth: dark while cold, its ember's colour once stoked. */
  furnaceMouths: THREE.MeshStandardMaterial[];
}

/** Where the seven foundries stand (one per ember, in `FORGE_SQUAD.flames` order), their size, and the side they open on. */
const FOUNDRY_SITES: readonly { x: number; z: number; w: number; d: number; front: Side; side: Side; place: string }[] = [
  { x: -11, z: -66, w: 10, d: 12, front: 'S', side: 'E', place: 'the north end, by Quench Street' },
  { x: 78, z: -36, w: 12, d: 10, front: 'W', side: 'N', place: 'Ember Road, by the Slag Yard' },
  { x: 12, z: 22, w: 12, d: 10, front: 'W', side: 'S', place: 'the middle, off Anvil Road' },
  { x: -87, z: -43, w: 10, d: 12, front: 'E', side: 'S', place: 'the far west, off Flame Row' },
  { x: 72, z: 65, w: 10, d: 12, front: 'N', side: 'W', place: 'the south-east corner, off Foundry Street' },
  { x: -69, z: 65, w: 10, d: 12, front: 'N', side: 'E', place: 'the south-west corner, off Foundry Street' },
  { x: -83, z: 12, w: 10, d: 12, front: 'E', side: 'N', place: 'the west, off Flame Row' },
];

/** Which way a side faces (outward). */
const OUT: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

/**
 * One of the seven foundries: a brick hall you walk into (a wide door at the front, a narrower one at the side), its
 * name in neon over the front door in its ember's colour. Inside, against the back wall, the forge: a brick hearth with
 * a chimney up through the roof and a mouth that is dark until it is stoked; an anvil, a workbench, barrels. Holding
 * the hall while the forge catches is the job (`forge/story.ts`). Returns where it is and the forge's mouth.
 */
function foundry(c: Ctx, i: number): { spot: FurnaceSpot; mouth: THREE.MeshStandardMaterial } {
  const { b, d } = c;
  const site = FOUNDRY_SITES[i]!;
  const flame = FORGE_SQUAD.flames[i]!;
  const H = 5.4;
  const len = (s: Side): number => (s === 'N' || s === 'S' ? site.w : site.d);
  const info = building(b, {
    x: site.x,
    z: site.z,
    w: site.w,
    d: site.d,
    height: H,
    wallMaterial: 'brick',
    roofMaterial: 'roof',
    floorMaterial: 'floorWarehouse',
    ceilingMaterial: 'concreteDark',
    parapet: 0.5,
    sides: {
      [site.front]: { openings: [{ at: len(site.front) / 2, width: 3.4, height: 3.3, kind: 'door', frame: 'steelDark' }] },
      [site.side]: { openings: [{ at: 2.6, width: 2.2, height: 2.5, kind: 'door', frame: 'steelDark' }, { at: len(site.side) - 2.6, width: 1.8, height: 1.1, sill: 2.4, kind: 'window', lit: true }] },
    },
    tag: 'foundry',
  });
  const [nx, nz] = OUT[site.front];
  const inner = info.inner;
  const cx = (inner.x0 + inner.x1) / 2;
  const cz = (inner.z0 + inner.z1) / 2;
  const half = nx !== 0 ? (inner.x1 - inner.x0) / 2 : (inner.z1 - inner.z0) / 2;
  // the forge against the back wall, its mouth to the front door
  const hx = cx - nx * (half - 0.75);
  const hz = cz - nz * (half - 0.75);
  const yaw = Math.atan2(-nx, -nz);
  const across = nx !== 0;
  const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0): void => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    b.add(mesh);
  };
  const brick = b.mats.get('brick');
  const iron = b.mats.get('steelDark');
  put(new THREE.BoxGeometry(across ? 1.5 : 2.8, 1.7, across ? 2.8 : 1.5), brick, hx, 0.85, hz);
  put(new THREE.BoxGeometry(across ? 1.1 : 1.8, 1.0, across ? 1.8 : 1.1), b.mats.get('concreteDark'), hx - nx * 0.1, 2.2, hz - nz * 0.1);
  put(new THREE.BoxGeometry(0.7, H + 1.6 - 2.7, 0.7), iron, hx - nx * 0.3, 2.7 + (H + 1.6 - 2.7) / 2, hz - nz * 0.3);
  b.collideBox(hx, hz, across ? 1.6 : 2.9, across ? 2.9 : 1.6, 2.6, { mapKind: 'prop', tag: 'foundry-forge' });
  // the mouth (it glows as it catches: kept out of the static batches)
  const mouth = new THREE.MeshStandardMaterial({ color: 0x0c0806, emissive: flame.color, emissiveIntensity: 0.05, roughness: 0.6 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), mouth);
  m.position.set(hx + nx * 0.77, 0.75, hz + nz * 0.77);
  m.rotation.y = yaw + Math.PI;
  b.addDynamic(m);
  // the Ignis mark over the mouth, gone dim
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), ignisMaterial('dim'));
  mark.position.set(hx + nx * 0.56, 2.2, hz + nz * 0.56);
  mark.rotation.y = yaw + Math.PI;
  b.add(mark);
  // an anvil on a block in front of it, a workbench along a side wall, barrels in the corners
  put(new THREE.BoxGeometry(0.5, 0.6, 0.5), iron, cx - nx * 0.6 + nz * 1.6, 0.3, cz - nz * 0.6 - nx * 1.6);
  put(new THREE.BoxGeometry(across ? 0.9 : 0.35, 0.22, across ? 0.35 : 0.9), iron, cx - nx * 0.6 + nz * 1.6, 0.71, cz - nz * 0.6 - nx * 1.6);
  b.collideBox(cx - nx * 0.6 + nz * 1.6, cz - nz * 0.6 - nx * 1.6, 0.6, 0.6, 0.85, { mapKind: 'prop', tag: 'anvil' });
  const sideX = nz !== 0 ? (nz > 0 ? inner.x0 + 0.45 : inner.x1 - 0.45) : cx;
  const sideZ = nx !== 0 ? (nx > 0 ? inner.z1 - 0.45 : inner.z0 + 0.45) : cz;
  put(new THREE.BoxGeometry(across ? 2.4 : 0.8, 0.9, across ? 0.8 : 2.4), b.mats.get('wood'), sideX, 0.45, sideZ);
  b.collideBox(sideX, sideZ, across ? 2.4 : 0.8, across ? 0.8 : 2.4, 1, { mapKind: 'prop', tag: 'workbench' });
  barrelGroup(b, { x: cx - nx * (half - 0.8) - nz * 0 + (nx !== 0 ? 0 : half - 0.9), z: cz - nz * (half - 0.8) + (nz !== 0 ? 0 : half - 0.9), rot: 0, count: 2, radius: 0.6, seed: 700 + i, colors: ['rust'] });
  b.light({ x: cx, y: 3.4, z: cz, color: flame.color, intensity: 20, distance: 11, weight: 0.6 });
  // the name in neon over the front door
  const fx = cx + nx * (half + 0.45);
  const fz = cz + nz * (half + 0.45);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.62), neonLabelMaterial(flame.name, `#${flame.color.toString(16).padStart(6, '0')}`));
  sign.position.set(fx, 3.95, fz);
  sign.rotation.y = Math.atan2(nx, nz);
  b.add(sign);
  d.label(flame.name, cx, cz, 0.7);
  const stand = { x: hx + nx * 2.2, z: hz + nz * 2.2 };
  return {
    spot: { x: stand.x, z: stand.z, yaw, place: site.place, x0: inner.x0, z0: inner.z0, x1: inner.x1, z1: inner.z1, doorX: cx + nx * (half + 2.5), doorZ: cz + nz * (half + 2.5) },
    mouth,
  };
}

/** A dimmed Ignis terminal on a post, facing yaw `rot`. */
function ignisTerminal(c: Ctx, x: number, z: number, rot: number): void {
  const { b } = c;
  addBox(b, 'steelDark', x, 0.6, z, 0.5, 1.2, 0.35, rot);
  addBox(b, 'steelDark', x, 1.35, z, 0.7, 0.5, 0.12, rot);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.39), ignisTerminalMaterial());
  screen.position.set(x - Math.sin(rot) * 0.065, 1.35, z - Math.cos(rot) * 0.065);
  screen.rotation.y = rot + Math.PI;
  b.add(screen);
  b.collideBox(x, z, 0.6, 0.45, 1.6, { mapKind: 'prop', tag: 'terminal', rot });
}

/** A slag heap: a low dark mound you go around. */
function slagHeap(c: Ctx, x: number, z: number, r: number, h: number): void {
  const { b } = c;
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), b.mats.get('rubble'));
  m.position.set(x, h / 2 - 0.05, z);
  m.rotation.y = x * 0.37 + z;
  m.castShadow = true;
  m.receiveShadow = true;
  b.add(m);
  b.collide({ x, z, hx: r * 0.72, hz: r * 0.72, rot: 0.785, y1: h * 0.8, mapKind: 'prop', tag: 'slag', surface: 'concrete' });
}

export function buildForgeOuter(c: Ctx, doors: DoorHandle[]): OuterResult {
  const { b, d } = c;

  // ---- roads and ground ----
  const roads = [
    { x0: -94, z0: -56, x1: 94, z1: -50, name: 'QUENCH STREET', mat: 'asphaltWet' as const, y: 0.0125 },
    { x0: -94, z0: 50, x1: 94, z1: 56, name: 'FOUNDRY STREET', mat: 'asphaltWet' as const, y: 0.0125 },
    { x0: -70, z0: -50, x1: -64, z1: 50, name: 'FLAME ROW', mat: 'asphalt' as const, y: 0.0115 },
    { x0: 64, z0: -50, x1: 70, z1: 50, name: 'EMBER ROAD', mat: 'asphalt' as const, y: 0.0115 },
  ];
  for (const r of roads) {
    groundRect(b, r.mat, r.x0, r.z0, r.x1, r.z1, r.y);
    d.road(r.x0, r.z0, r.x1, r.z1, r.name);
  }
  groundRect(b, 'concreteSlab', -94, -74, 94, -56, 0.019);
  groundRect(b, 'concreteSlab', -94, 56, 94, 74, 0.019);
  groundRect(b, 'sidewalk', -94, -50, -70, 50, 0.019);
  groundRect(b, 'concreteSlab', 70, -50, 94, 50, 0.019);
  groundRect(b, 'sidewalk', -64, -50, -62, 50, 0.019);
  groundRect(b, 'sidewalk', 62, -50, 64, 50, 0.019);
  for (const x of [-86, -64, -10, 24, 46, 62, 88]) streetLamp(b, { x, z: -57, rot: -HALF_PI, armDir: -HALF_PI, style: 'cobra', on: true, color: 0xff9a40, mode: x === 46 ? 'flicker' : 'steady' });
  for (const x of [-80, -56, -30, 6, 30, 70, 86]) streetLamp(b, { x, z: 57, rot: HALF_PI, armDir: HALF_PI, style: 'cobra', on: true, color: 0xff9a40 });
  for (const z of [-40, -16, 16, 40]) {
    streetLamp(b, { x: -63, z, rot: 0, armDir: Math.PI, style: 'cobra', on: true, color: 0xffa050 });
    streetLamp(b, { x: 63, z: z + 6, rot: Math.PI, armDir: 0, style: 'cobra', on: true, color: 0xffa050 });
  }

  const rooms: SafeRoomDef[] = [];

  // ---- N: the Hearth (x -54..-30, z -72..-58): a walled courtyard where the run starts, its gate standing open onto
  // Quench Street, a sentry gun in the middle ----
  const hx0 = -54;
  const hx1 = -30;
  const hz0 = -72;
  const hz1 = -58;
  const gateX = -42;
  const H = 3.8;
  addBox(b, 'concreteWall', (hx0 + hx1) / 2, H / 2, hz0 + 0.2, hx1 - hx0, H, 0.4);
  b.collideBox((hx0 + hx1) / 2, hz0 + 0.2, hx1 - hx0, 0.4, H, { mapKind: 'wall', tag: 'hearth' });
  for (const x of [hx0 + 0.2, hx1 - 0.2]) {
    addBox(b, 'concreteWall', x, H / 2, (hz0 + hz1) / 2, 0.4, H, hz1 - hz0);
    b.collideBox(x, (hz0 + hz1) / 2, 0.4, hz1 - hz0, H, { mapKind: 'wall', tag: 'hearth' });
  }
  // the front wall either side of the gate, and the gate itself: two barred leaves swung open against the wall
  const gw = 5;
  for (const [a, e] of [[hx0, gateX - gw / 2], [gateX + gw / 2, hx1]] as const) {
    addBox(b, 'concreteWall', (a + e) / 2, H / 2, hz1 - 0.2, e - a, H, 0.4);
    b.collideBox((a + e) / 2, hz1 - 0.2, e - a, 0.4, H, { mapKind: 'wall', tag: 'hearth' });
  }
  for (const s of [-1, 1]) {
    const lx = gateX + s * (gw / 2 + 0.1);
    for (let k = 0; k <= 10; k++) addBox(b, 'steelDark', lx, 1.6, hz1 + 0.1 + k * 0.25, 0.06, 3.2, 0.06, 0, { cast: false });
    for (const y of [0.15, 1.6, 3.1]) addBox(b, 'steelDark', lx, y, hz1 + 1.35, 0.1, 0.08, 2.5, 0, { cast: false });
    b.collideBox(lx, hz1 + 1.35, 0.16, 2.5, 3.3, { mapKind: 'prop', tag: 'hearth-gate', blocksShots: false });
  }
  // the phoenix arch over the gate, glowing (amber; the runtime turns it red at the end)
  const hearthGlow = new THREE.MeshStandardMaterial({ color: 0x2a0f04, emissive: 0xff8a2a, emissiveIntensity: 1.3, roughness: 0.6 });
  addBox(b, 'steelDark', gateX, H + 0.6, hz1 - 0.2, gw + 1.6, 1.2, 0.5);
  addBox(b, hearthGlow, gateX, H + 0.6, hz1 + 0.07, gw + 1.2, 0.85, 0.04, 0, { cast: false });
  const sigil = new THREE.Mesh(new THREE.CircleGeometry(1.4, 28), vulcanSigilMaterial());
  sigil.position.set(gateX, H + 2.3, hz1 + 0.12);
  b.add(sigil);
  addBox(b, neonLabelMaterial('THE HEARTH', '#ffb060'), gateX, H + 0.6, hz1 + 0.11, 4.2, 0.6, 0.05, 0, { cast: false });
  b.light({ x: gateX, y: H + 1.2, z: hz1 + 1.5, color: 0xff9a40, intensity: 70, distance: 14 });
  // inside: braziers, cots, crates (where the people you save wait), and the sentry's plinth in the middle (the gun
  // itself turns: `forge/runtime.ts`)
  groundRect(b, 'floorWarehouse', hx0 + 0.4, hz0 + 0.4, hx1 - 0.4, hz1 - 0.4, 0.025);
  const sentryX = gateX;
  const sentryZ = -66;
  addBox(b, 'concreteDark', sentryX, 0.3, sentryZ, 1.5, 0.6, 1.5);
  addBox(b, 'steelDark', sentryX, 0.75, sentryZ, 0.9, 0.3, 0.9);
  b.collideBox(sentryX, sentryZ, 1.5, 1.5, 1.1, { mapKind: 'prop', tag: 'sentry' });
  for (const [x, z] of [[-49, -68], [-35, -68]] as const) {
    addBox(b, 'steelDark', x, 0.45, z, 0.9, 0.9, 0.9);
    addBox(b, b.mats.get('emAmber'), x, 0.95, z, 0.7, 0.12, 0.7, 0, { cast: false });
    b.light({ x, y: 1.6, z, color: 0xff8a30, intensity: 26, distance: 8, weight: 0.6 });
  }
  for (const x of [-52, -50, -34, -32]) addBox(b, 'canvasOlive', x, 0.3, -70, 0.9, 0.3, 2);
  crateGroup(b, { x: -52.3, z: -66.5, rot: 0.2, count: 3, radius: 1, seed: 501 });
  // either side of the lane from the gate to the sentry, facing the gate
  const slots: HearthDef['slots'] = [];
  for (const z of [-61, -63.6]) for (const x of [-46, -38, -48.5, -35.5, -51, -33]) slots.push({ x, z, yaw: Math.PI });
  const hearth: HearthDef = { x: (hx0 + hx1) / 2, z: (hz0 + hz1) / 2, gateX, gateZ: hz1 + 2.2, x0: hx0 + 0.4, z0: hz0 + 0.4, x1: hx1 - 0.4, z1: hz1 - 0.4, sentryX, sentryZ, slots };
  d.label('THE HEARTH', gateX, -66, 0.8);

  // Anya's radio room, beside the Hearth
  rooms.push(safeRoom(c, { id: 'radio', place: 'the radio room', x: -23.5, z: -63, w: 7, d: 6, door: 'S', wall: 'metalPanel' }, doors));
  addBox(b, 'steelDark', -21, 5.4, -63, 0.15, 4, 0.15); // the antenna
  addBox(b, 'steelDark', -21, 7.4, -63, 1.6, 0.06, 0.06);
  // the pump house, west of the Hearth
  rooms.push(safeRoom(c, { id: 'pump', place: 'the pump house', x: -74, z: -65.5, w: 7, d: 5, door: 'S', wall: 'concreteDark' }, doors));
  pipeStack(b, { x: -64, z: -68, rot: HALF_PI, length: 5, count: 4 });
  // the pattern shop, in the north-west corner
  rooms.push(safeRoom(c, { id: 'pattern', place: 'the pattern shop', x: -88, z: -64, w: 7, d: 7, door: 'E', wall: 'corrugatedRust' }, doors));

  // ---- N: the Rumble Pit (riry's arena) ----
  const pit = { x: 10, z: -64.5, radius: 8.5 };
  const ring = 18;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    // three gaps: south (onto Quench Street), west and east
    const deg = (a * 180) / Math.PI;
    if (Math.abs(deg - 90) < 14 || Math.abs(deg - 180) < 14 || deg < 8 || deg > 352) continue;
    const x = pit.x + Math.cos(a) * pit.radius;
    const z = pit.z + Math.sin(a) * pit.radius;
    jerseyBarrier(b, { x, z, rot: -a + HALF_PI });
  }
  groundRect(b, 'gravel', pit.x - 8, pit.z - 8, pit.x + 8, pit.z + 8, 0.022);
  // riry's bell on its post in the middle
  addBox(b, 'steelDark', pit.x, 1.4, pit.z, 0.16, 2.8, 0.16);
  addBox(b, 'steelDark', pit.x, 2.85, pit.z, 1.2, 0.12, 0.12);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.36, 0.5, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide }));
  bell.position.set(pit.x + 0.4, 2.5, pit.z);
  b.add(bell);
  b.collideBox(pit.x, pit.z, 0.5, 0.5, 2.9, { mapKind: 'prop', tag: 'bell' });
  addBox(b, neonLabelMaterial('RUMBLE PIT', '#ff8ac8'), pit.x, 3.4, pit.z - pit.radius - 0.6, 5, 0.7, 0.08, 0, { cast: false });
  floodlightTower(b, { x: pit.x - 13, z: pit.z + 5, rot: -2.4, on: true });
  floodlightTower(b, { x: pit.x + 13, z: pit.z + 5, rot: 2.4, on: true });
  const rumble: RumblePitDef = {
    x: pit.x,
    z: pit.z,
    radius: pit.radius,
    bellX: pit.x,
    bellZ: pit.z + 1.2,
    gates: [
      { x: pit.x - 15, z: pit.z },
      { x: pit.x + 15, z: pit.z },
      { x: pit.x - 12, z: pit.z - 6 },
      { x: pit.x + 12, z: pit.z - 6 },
    ],
  };
  d.label('RUMBLE PIT', pit.x, pit.z, 0.8);

  // the quench shed
  rooms.push(safeRoom(c, { id: 'quench', place: 'the quench shed', x: 36, z: -66, w: 7, d: 5, door: 'S', wall: 'corrugatedRust' }, doors));
  fuelTank(b, { x: 28, z: -70, radius: 2, height: 3, horizontal: true, color: 'grey', rot: 0 });
  // ---- NE: the Slag Yard ----
  for (const [x, z, r, h] of [[52, -68, 4.5, 3.4], [60, -60, 3.5, 2.6], [84, -68, 5, 3.8], [90, -58, 3, 2.2], [48, -59, 2.6, 1.8]] as const) slagHeap(c, x, z, r, h);
  rooms.push(safeRoom(c, { id: 'cab', place: 'the slag yard control shed', x: 72, z: -66, w: 7, d: 5, door: 'S', wall: 'metalPanel' }, doors));
  container(b, { x: 78, z: -44, rot: 0, stack: 2, color: 'rust', seed: 520 });
  container(b, { x: 88, z: -30, rot: HALF_PI, color: 'olive', seed: 521 });
  barrelGroup(b, { x: 80, z: -18, rot: 0, count: 6, radius: 1.6, seed: 522, colors: ['rust', 'yellow'] });
  d.label('SLAG YARD', 70, -60, 0.8);

  // ---- W: Flame Row ----
  barrelGroup(b, { x: -76, z: 44, rot: 0, count: 4, radius: 1.3, seed: 530, colors: ['rust'] });
  tireStack(b, { x: -76, z: -48, rot: 0 });

  // ---- E: the Spawn Hall (where it started) and its back office ----
  building(b, {
    x: 83, z: 18, w: 18, d: 24, height: 7, wallMaterial: 'concreteDark', roofMaterial: 'roof', floorMaterial: 'floorWarehouse', ceilingMaterial: 'concreteDark', parapet: 0.6,
    sides: {
      W: { openings: [{ at: 12, width: 4.5, height: 4.2, kind: 'door', frame: 'steelDark' }, { at: 4, width: 2.4, height: 1.4, sill: 2.6, kind: 'window', lit: true }, { at: 20, width: 2.4, height: 1.4, sill: 2.6, kind: 'window', lit: true }] },
      N: { openings: [{ at: 9, width: 2.2, height: 2.4, kind: 'door', frame: 'steelDark' }] },
    },
    tag: 'spawn-hall',
  });
  // the summoning circle, gone wrong: a scorched ring on the floor, a burst intake pipe from the furnace's side
  const circle = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.8, 40), new THREE.MeshStandardMaterial({ color: 0x1a0602, emissive: 0xff3a10, emissiveIntensity: 1.1, roughness: 0.8, side: THREE.DoubleSide }));
  circle.rotation.x = -Math.PI / 2;
  circle.position.set(83, 0.04, 18);
  b.add(circle);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), ignisMaterial('dim'));
  inner.rotation.x = -Math.PI / 2;
  inner.position.set(83, 0.05, 18);
  b.add(inner);
  b.light({ x: 83, y: 1.4, z: 18, color: 0xff4a1a, intensity: 50, distance: 12 });
  addBox(b, 'rust', 89.5, 2.6, 10, 1.2, 1.2, 9);
  addBox(b, 'burnt', 89.5, 2.6, 15.4, 1.6, 1.6, 0.6);
  // the server rack nobody remembers installing, and the thick cable running into it
  addBox(b, 'paintBlack', 90.6, 1.1, 24, 0.9, 2.2, 1.6);
  addBox(b, b.mats.get('lampCool'), 90.13, 1.5, 24, 0.04, 0.05, 1.2, 0, { cast: false });
  b.collideBox(90.6, 24, 0.9, 1.6, 2.2, { mapKind: 'prop', tag: 'rack' });
  addBox(b, 'rubber', 90.6, 0.08, 18.5, 0.22, 0.16, 9);
  ignisTerminal(c, 76.5, 26, HALF_PI);
  corpse(b, { x: 80, z: 13, rot: 1.2 });
  corpse(b, { x: 86, z: 22, rot: -0.4 });
  addBox(b, neonLabelMaterial('SPAWN HALL', '#ff5a2a'), 73.9, 6, 18, 0.08, 0.9, 7, HALF_PI, { cast: false });
  wallDecal(b, 'stencilQuarantine', 73.85, 2.8, 8, 3, 1.5, -HALF_PI);
  rooms.push(safeRoom(c, { id: 'backoffice', place: 'the Spawn Hall back office', x: 83, z: 37, w: 8, d: 6, door: 'W', wall: 'concreteDark' }, doors));
  d.label('SPAWN HALL', 83, 18, 0.9);
  container(b, { x: 88, z: -6, rot: 0, color: 'red', seed: 540 });
  pallet(b, { x: 76, z: 44, rot: 0.3 });

  // ---- S: the Ledger House, its office, the lockers, the cold store ----
  building(b, {
    x: 0, z: 65, w: 20, d: 12, height: 5, wallMaterial: 'brick', roofMaterial: 'roof', floorMaterial: 'floorStore', ceilingMaterial: 'plaster', parapet: 0.5,
    sides: {
      N: { openings: [{ at: 10, width: 2.6, height: 2.6, kind: 'door', frame: 'steelDark' }, { at: 4, width: 2.6, height: 1.6, sill: 1, kind: 'window', lit: true }, { at: 16, width: 2.6, height: 1.6, sill: 1, kind: 'window', lit: true }] },
    },
    tag: 'ledger-house',
  });
  // the Ignis mark over the door, the ledger desks and the delivery counter inside
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), ignisMaterial('lit'));
  mark.position.set(0, 4.1, 58.88);
  mark.rotation.y = Math.PI;
  b.add(mark);
  b.light({ x: 0, y: 4.2, z: 57.6, color: 0xff8a3a, intensity: 40, distance: 9 });
  addBox(b, neonLabelMaterial('LEDGER HOUSE', '#ffb060'), 0, 5.6, 58.8, 7, 0.8, 0.1, 0, { cast: false });
  for (const x of [-6, -2, 2, 6]) {
    addBox(b, 'wood', x, 0.4, 68, 1.6, 0.8, 0.9);
    b.collideBox(x, 68, 1.6, 0.9, 0.85, { mapKind: 'prop', tag: 'desk' });
  }
  addBox(b, 'wood', 0, 0.55, 62.2, 8, 1.1, 0.6);
  b.collideBox(0, 62.2, 8, 0.6, 1.1, { mapKind: 'prop', tag: 'counter' });
  addBox(b, neonLabelMaterial('HAND DELIVERY', '#ffd27a'), 0, 2.2, 62.0, 3, 0.4, 0.05, 0, { cast: false });
  ignisTerminal(c, -7.5, 61, Math.PI);
  rooms.push(safeRoom(c, { id: 'ledger', place: 'the ledger office', x: 16, z: 65, w: 7, d: 6, door: 'N', wall: 'brick' }, doors));
  rooms.push(safeRoom(c, { id: 'lockers', place: 'the furnace crew lockers', x: 56, z: 66, w: 8, d: 6, door: 'N', wall: 'metalPanel' }, doors));
  rooms.push(safeRoom(c, { id: 'coldstore', place: 'the market cold store', x: -44, z: 66, w: 8, d: 6, door: 'N', wall: 'plaster' }, doors));
  d.label('LEDGER HOUSE', 0, 65, 0.8);
  vehicle(b, { x: 34, z: 60, rot: 0.05, kind: 'van', seed: 550 });
  vehicle(b, { x: -24, z: 61, rot: -0.1, kind: 'pickup', seed: 551 });
  container(b, { x: 80, z: 64, rot: HALF_PI, stack: 2, color: 'blue', seed: 552 });
  container(b, { x: -78, z: 64, rot: HALF_PI, color: 'rust', seed: 553 });
  debris(b, { x: 70, z: 70, radius: 3, seed: 554 });
  barrelGroup(b, { x: -60, z: 70, rot: 0, count: 5, radius: 1.4, seed: 555, colors: ['rust', 'red'] });
  corpse(b, { x: 26, z: 70, rot: 0.4 });
  fuelTank(b, { x: -88, z: 46, radius: 2.4, height: 5, color: 'rust' });

  // ---- the ledger pages: the Ledger House desk, the Spawn Hall circle, the Crucible pour floor (HQ: forge.ts) ----
  const ledger: LedgerSpot[] = [
    { x: 2, y: 0.82, z: 68, place: 'the Ledger House' },
    { x: 80.5, y: 0.06, z: 18.4, place: 'the Spawn Hall' },
    { x: 31, y: 0.06, z: -25, place: 'the Crucible' },
  ];

  // ---- gameplay: crates, a station, spawn points, residents, regions ----
  d.crate(-60, -70, 0.3, 'low');
  d.crate(-84, 30, 0, 'low');
  d.crate(20, -71, 1.1, 'high');
  d.crate(90, -44, 0.2, 'high');
  d.crate(80, 48, 0.5, 'medium');
  d.crate(-30, 70, 0, 'medium');
  d.crate(44, 70, 0.6, 'medium');
  d.station({ kind: 'buy', name: 'DELIVERY COUNTER', x: -8, z: 57.6, yaw: 0, region: 'medium' });
  d.spawn('low', 'general', [[-90, -58], [-80, -72], [-90, -20], [-90, 40], [-74, 72], [-50, 72]], 1);
  d.spawn('medium', 'general', [[-20, 72], [20, 72], [44, 72], [90, 72], [90, 46]], 1);
  d.spawn('high', 'general', [[0, -72], [30, -72], [60, -72], [92, -62], [92, -36], [92, -4], [92, 34]], 1.2);
  d.spawn('low', 'lz', [[-60, -60], [-20, -56]], 1);
  d.zombies('low', 'shambler', [[-80, -50], [-76, -26], [-74, 18], [-82, 48], [-66, -66], [-56, 64], [-34, 60]]);
  d.zombies('low', 'runner', [[-86, 6], [-74, -36]]);
  d.zombies('medium', 'shambler', [[-14, 60], [10, 70], [30, 64], [64, 60], [84, 56], [-6, 72]]);
  d.zombies('medium', 'runner', [[46, 62], [88, 62]]);
  d.zombies('high', 'shambler', [[-6, -62], [26, -62], [44, -66], [64, -56], [80, -60], [90, -40], [80, 3], [86, 12], [78, 26], [90, 41]]);
  d.zombies('high', 'runner', [[56, -70], [84, 24], [76, -24]]);
  d.zombies('high', 'armored', [[86, 18], [68, -70], [88, -16]]);

  // ---- the seven foundries ----
  const built = FORGE_SQUAD.flames.map((_, i) => foundry(c, i));
  const furnaces: FurnaceSpot[] = built.map((f) => f.spot);
  const furnaceMouths = built.map((f) => f.mouth);
  return { rooms, hearth, ledger, rumble, hearthGlow, furnaces, furnaceMouths };
}
