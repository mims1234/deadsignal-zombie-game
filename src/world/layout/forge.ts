/**
 * THE FORGE: the second map, after the Vulcan community's phoenix forge. A foundry district at ember night: black
 * steel and brick, molten runoff in open channels, sodium-orange lamps, a phoenix sigil burning in the crossroads.
 * 190 x 150 m: the four districts at its heart, and the ring around them (`forgeOuter.ts`).
 *
 *   SW  Ember Market   insertion gate, market hall, workshops (low threat)
 *   NW  The Pad        helipad and radio for extraction, fuel farm; the Hearth beyond it (low)
 *   SE  Phoenix Plaza  the beacon to rekindle, and Vulcan HQ (the forge hall) under its phoenix billboard, with the
 *                      Great Furnace, the Spotlight Wall and tomoe's vault inside (medium)
 *   NE  The Crucible   open-roofed foundry with molten pools, the Infernus, the firestorm spire (high)
 */
import * as THREE from 'three';
import { quarantineGate, helipad, skylineBackdrop, spire, transmitterSite, type SpireHandle, type TransmitterHandle } from '../landmarks';
import {
  barrelGroup,
  checkpointBooth,
  container,
  corpse,
  craneGantry,
  crateGroup,
  debris,
  floodlightTower,
  forklift,
  fuelTank,
  generator,
  jerseyBarrier,
  pallet,
  streetLamp,
  tireStack,
  vehicle,
} from '../props';
import type { ForgeSites } from '../../forge/sites';
import { neonLabelMaterial } from '../landmarks/tex';
import { addBox, building, groundRect, perimeterWall, wallDecal } from '../structures';
import { type DoorHandle, hqVault } from './forgeRooms';
import { buildForgeOuter } from './forgeOuter';
import { ignisMaterial } from './ignis';
import { HALF_PI, type Ctx } from './util';
import { vulcanForge, vulcanSigilMaterial } from './vulcan';

export const FORGE_BOUNDS = { minX: -95, maxX: 95, minZ: -75, maxZ: 75 };
export const FORGE = {
  /** The run starts inside the Hearth, facing its gate. */
  start: { x: -42, z: -61.5 },
  lz: { x: -38, z: -30, radius: 11, terminalX: -27.5, terminalZ: -22.5 },
  beacon: { x: 32, z: 29, radius: 11 },
  crucible: { x: 36, z: -29 },
  infernus: { x: 36, z: -27 },
  spire: { x: 54, z: -43 },
};

/** Molten metal: emissive, slowly pulsing. */
function moltenMaterial(c: Ctx): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x3a0c02, emissive: 0xff4a08, emissiveIntensity: 1.4, roughness: 0.35, metalness: 0.1 });
  c.b.tick((_dt, t) => {
    m.emissiveIntensity = 1.25 + Math.sin(t * 1.3) * 0.2 + Math.sin(t * 3.7) * 0.08;
  });
  return m;
}

/** An open channel of molten runoff with a steel rim; nothing walks through it. */
function moltenChannel(c: Ctx, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number): void {
  const { b } = c;
  groundRect(b, mat, x0, z0, x1, z1, 0.03);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const rim = b.mats.get('steelDark');
  if (w > d) {
    addBox(b, rim, cx, 0.25, z0 - 0.15, w, 0.5, 0.3);
    addBox(b, rim, cx, 0.25, z1 + 0.15, w, 0.5, 0.3);
  } else {
    addBox(b, rim, x0 - 0.15, 0.25, cz, 0.3, 0.5, d);
    addBox(b, rim, x1 + 0.15, 0.25, cz, 0.3, 0.5, d);
  }
  b.collideBox(cx, cz, w + 0.6, d + 0.6, 1.1, { mapKind: 'wall', tag: 'molten' });
  b.light({ x: cx, y: 1.2, z: cz, color: 0xff5a14, intensity: 70, distance: Math.max(w, d) * 0.9 + 3 });
}

/** A furnace mouth: brick block with a glowing opening. */
function furnace(c: Ctx, x: number, z: number, rot: number): void {
  const { b } = c;
  addBox(b, 'brick', x, 1.8, z, 4, 3.6, 3, rot);
  addBox(b, 'concreteDark', x, 4.2, z, 2.2, 1.2, 1.8, rot);
  const fx = x - Math.sin(rot) * 1.52;
  const fz = z - Math.cos(rot) * 1.52;
  addBox(b, b.mats.get('emAmber'), fx, 1.2, fz, 1.8, 1.4, 0.06, rot, { cast: false });
  b.collideBox(x, z, 4, 3, 3.6, { mapKind: 'building', tag: 'furnace', rot });
  b.light({ x: fx, y: 1.3, z: fz, color: 0xff6a1a, intensity: 60, distance: 9 });
}

/** What the Forge's story animates (`forge/runtime.ts`, `forge/reveal.ts`): never touched by the simulation. */
export interface ForgeHandles {
  /** One per safe room, in `sites.rooms` order. */
  doors: DoorHandle[];
  hearthGlow: THREE.MeshStandardMaterial;
  /** The Great Furnace's iron door (two leaves) and the Ignis mark on it. */
  furnaceDoor: { left: THREE.Object3D; right: THREE.Object3D; mark: THREE.Mesh };
  /** The phoenix billboard on Vulcan HQ's roof. */
  billboard: THREE.Object3D;
  /** Each foundry forge's mouth, in `sites.furnaces` order. */
  furnaceMouths: THREE.MeshStandardMaterial[];
}

export interface ForgeResult {
  transmitter: TransmitterHandle;
  spire: SpireHandle;
  sites: ForgeSites;
  handles: ForgeHandles;
}

/** The Great Furnace under Vulcan HQ: a brick mass with an iron door bearing the Ignis mark (facing -Z). */
function greatFurnace(c: Ctx, x: number, z: number): ForgeHandles['furnaceDoor'] {
  const { b } = c;
  addBox(b, 'brick', x, 2.2, z, 5, 4.4, 3.6);
  addBox(b, 'concreteDark', x, 5.2, z + 0.4, 2.4, 1.6, 2);
  b.collideBox(x, z, 5, 3.6, 4.4, { mapKind: 'building', tag: 'great-furnace' });
  const fz = z - 1.82;
  // the door: two iron leaves, hinged at their outer edges (the reveal throws them open)
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.55, metalness: 0.75 });
  const leaf = (s: number): THREE.Object3D => {
    const pivot = new THREE.Group();
    pivot.position.set(x + s * 1.15, 0, fz);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 0.12), iron);
    m.position.set(-s * 0.55, 1.4, 0);
    m.castShadow = true;
    pivot.add(m);
    b.addDynamic(pivot);
    return pivot;
  };
  const left = leaf(-1);
  const right = leaf(1);
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), ignisMaterial('dim'));
  mark.position.set(x, 1.7, fz - 0.08);
  mark.rotation.y = Math.PI;
  b.addDynamic(mark);
  // a dull glow leaks round its edges
  addBox(b, b.mats.get('emAmber'), x, 0.12, fz - 0.02, 2.3, 0.08, 0.04, 0, { cast: false });
  b.light({ x, y: 1.2, z: fz - 1.2, color: 0xff5a1a, intensity: 30, distance: 7 });
  return { left, right, mark };
}

/** The Spotlight Wall inside HQ: three plaques for the people who held Vulcan together. */
function spotlightWall(c: Ctx, x0: number, z: number): void {
  const { b } = c;
  const people = [
    { name: 'ATHY', line: 'Helped build Vulcan into what it is.' },
    { name: 'RIRY', line: 'Ran the rumbles. Made every week louder.' },
    { name: 'ANYA', line: 'Took the weight off everyone else.' },
  ];
  people.forEach((p, i) => {
    const x = x0 + i * 2.2;
    addBox(b, 'steelDark', x, 2.0, z, 2.0, 1.4, 0.08, 0, { cast: false });
    addBox(b, neonLabelMaterial(p.name, '#ffb060'), x, 2.4, z + 0.06, 1.4, 0.34, 0.02, 0, { cast: false });
    addBox(b, neonLabelMaterial(p.line, '#d8c8a8'), x, 1.85, z + 0.06, 1.8, 0.17, 0.02, 0, { cast: false });
  });
  addBox(b, neonLabelMaterial('SPOTLIGHT', '#ff7a1a'), x0 + 2.2, 3.05, z + 0.06, 2.2, 0.3, 0.02, 0, { cast: false });
  b.light({ x: x0 + 2.2, y: 3, z: z + 1.4, color: 0xffb060, intensity: 22, distance: 6, weight: 0.5 });
}

export function buildForge(c: Ctx): ForgeResult {
  const { b, d } = c;
  const B = FORGE_BOUNDS;
  const molten = moltenMaterial(c);

  // ---- ground and roads ----
  const base = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), b.mats.get('dirt'));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.02;
  base.receiveShadow = true;
  b.add(base);
  const roads = [
    { x0: -94, z0: -5, x1: 94, z1: 5, name: 'CINDER WAY', mat: 'asphaltWet' as const, y: 0.012 },
    { x0: -5, z0: -74, x1: 5, z1: 74, name: 'ANVIL ROAD', mat: 'asphaltWet' as const, y: 0.013 },
    { x0: -61, z0: 22, x1: -5, z1: 28, name: 'ASH LANE', mat: 'asphalt' as const, y: 0.011 },
    { x0: 5, z0: -18, x1: 61, z1: -13, name: 'SMELTER ROW', mat: 'asphalt' as const, y: 0.0115 },
  ];
  for (const r of roads) {
    groundRect(b, r.mat, r.x0, r.z0, r.x1, r.z1, r.y);
    d.road(r.x0, r.z0, r.x1, r.z1, r.name);
  }
  groundRect(b, 'sidewalk', -61, 5, -5, 22, 0.02);
  groundRect(b, 'sidewalk', -61, 28, -5, 49, 0.02);
  groundRect(b, 'concreteSlab', -61, -49, -5, -5, 0.02);
  groundRect(b, 'concreteSlab', 5, 5, 61, 49, 0.02);
  groundRect(b, 'concreteSlab', 5, -49, 61, -18, 0.02);
  groundRect(b, 'concreteSlab', 5, -13, 61, -5, 0.02);
  // Vulcan's phoenix burning in the crossroads
  groundRect(b, vulcanSigilMaterial(), -7, -7, 7, 7, 0.035);
  b.light({ x: 0, y: 2.5, z: 0, color: 0xff6a14, intensity: 140, distance: 16 });

  d.regionRects.push(
    // the Spawn Hall and the Slag Yard first (the first rectangle that holds a point wins)
    { region: 'high', x0: 62, z0: -75, x1: 95, z1: 34 },
    { region: 'high', x0: -20, z0: -75, x1: 62, z1: -50 },
    { region: 'high', x0: 5, z0: -50, x1: 62, z1: -5 },
    { region: 'medium', x0: 5, z0: -5, x1: 62, z1: 50 },
    { region: 'medium', x0: 62, z0: 34, x1: 95, z1: 75 },
    { region: 'medium', x0: -30, z0: 50, x1: 62, z1: 75 },
  );
  d.label('EMBER MARKET', -34, 38, 0.9);
  d.label('THE PAD', -38, -40, 0.9);
  d.label('PHOENIX PLAZA', 32, 42, 0.9);
  d.label('THE CRUCIBLE', 36, -44, 0.9);

  // ---- boundary ----
  const X = B.maxX - 0.6;
  const Z = B.maxZ - 0.6;
  perimeterWall(b, -X, -Z, X, -Z, 6, 'concreteDark');
  perimeterWall(b, -X, Z, X, Z, 6, 'concreteDark');
  perimeterWall(b, -X, -Z, -X, Z, 6, 'concreteDark');
  perimeterWall(b, X, -Z, X, Z, 6, 'concreteDark');
  // the south gate stands clear of the Ledger House (a gate behind it would seal off the strip between them)
  quarantineGate(b, { x: -26, z: Z - 1.8, rot: Math.PI, width: 10, open: 0 });
  quarantineGate(b, { x: -X + 1.8, z: 0, rot: -HALF_PI, width: 10, open: 0 });
  wallDecal(b, 'stencilDanger', X - 0.62, 2.8, -20, 8, 2.2, -HALF_PI);
  wallDecal(b, 'stencilKeepOut', -20, 2.8, -Z + 0.62, 8, 2.2, 0);
  b.collide({ x: 0, z: -B.maxZ - 6, hx: B.maxX + 12, hz: 2, y1: 30, mapKind: 'none' });
  b.collide({ x: 0, z: B.maxZ + 6, hx: B.maxX + 12, hz: 2, y1: 30, mapKind: 'none' });
  b.collide({ x: B.minX - 6, z: 0, hx: 2, hz: B.maxZ + 12, y1: 30, mapKind: 'none' });
  b.collide({ x: B.maxX + 6, z: 0, hx: 2, hz: B.maxZ + 12, y1: 30, mapKind: 'none' });
  skylineBackdrop(b, { bounds: B, seed: 41 });

  // ---- lamps: sodium orange all along the roads ----
  for (let x = -54; x <= 54; x += 16) {
    streetLamp(b, { x, z: -6.4, rot: HALF_PI, armDir: HALF_PI, style: 'cobra', on: true, color: 0xff9a40, mode: x === 6 ? 'flicker' : 'steady' });
    streetLamp(b, { x: x + 8, z: 6.4, rot: -HALF_PI, armDir: -HALF_PI, style: 'cobra', on: true, color: 0xff9a40 });
  }
  for (let z = -42; z <= 42; z += 18) streetLamp(b, { x: 6.4, z, rot: 0, armDir: Math.PI, style: 'double', on: true, color: 0xffa050 });

  // ---- SW: Ember Market ----
  checkpointBooth(b, { x: -54, z: 31, rot: HALF_PI });
  jerseyBarrier(b, { x: -46, z: 29.5, rot: 0.1 });
  jerseyBarrier(b, { x: -41, z: 30, rot: -0.15 });
  building(b, {
    x: -24, z: 38, w: 16, d: 12, height: 4.4, wallMaterial: 'brick', roofMaterial: 'roof', floorMaterial: 'floorStore', ceilingMaterial: 'plaster', parapet: 0.5,
    sides: {
      N: { openings: [{ at: 4, width: 2.4, height: 1.6, sill: 1, kind: 'window', lit: true }, { at: 8, width: 2.2, height: 2.4, kind: 'door', frame: 'steelDark' }, { at: 12.5, width: 2.4, height: 1.6, sill: 1, kind: 'window' }] },
      E: { openings: [{ at: 6, width: 1.9, height: 2.3, kind: 'door', frame: 'steelDark' }] },
      S: { openings: [{ at: 5, width: 2, height: 1.2, sill: 2.4, kind: 'window', lit: true }] },
    },
    tag: 'market',
  });
  building(b, {
    x: -46, z: 13, w: 12, d: 10, height: 4.8, wallMaterial: 'corrugatedRust', roofMaterial: 'roof', floorMaterial: 'floorWarehouse', ceilingMaterial: 'metalPanel',
    sides: { S: { openings: [{ at: 6, width: 3.4, height: 3, kind: 'door', frame: 'steelDark' }] }, E: { openings: [{ at: 3, width: 1.6, height: 1.2, sill: 1.4, kind: 'window', lit: true }] } },
    tag: 'workshop',
  });
  furnace(c, -20, 13, Math.PI);
  vehicle(b, { x: -34, z: 25, rot: HALF_PI + 0.05, kind: 'pickup', seed: 201 });
  vehicle(b, { x: -14, z: 23.6, rot: -HALF_PI, kind: 'van', seed: 202 });
  crateGroup(b, { x: -56, z: 20, rot: 0.3, count: 4, radius: 1.4, seed: 203 });
  barrelGroup(b, { x: -12, z: 46, rot: 0, count: 5, radius: 1.4, seed: 204, colors: ['rust', 'red'] });
  debris(b, { x: -30, z: 47, radius: 3, seed: 205 });
  corpse(b, { x: -38, z: 33, rot: 0.7 });
  d.station({ kind: 'buy', name: 'EMBER SUPPLY', x: -34, z: 10.5, yaw: Math.PI, region: 'low' });
  d.crate(-56, 46, 0.3, 'low');
  d.crate(-11, 31, 1.2, 'low');
  d.crate(-52, 8, 0, 'low');

  // ---- NW: The Pad ----
  helipad(b, { x: FORGE.lz.x, z: FORGE.lz.z, rot: 0, radius: 8.6 });
  fuelTank(b, { x: -55, z: -43, radius: 3, height: 7, color: 'rust' });
  fuelTank(b, { x: -55, z: -34, radius: 3, height: 7, color: 'grey' });
  fuelTank(b, { x: -18, z: -44, radius: 2.4, height: 3.4, horizontal: true, color: 'olive', rot: 0.1 });
  generator(b, { x: -22, z: -12, rot: 0.4, running: true });
  building(b, {
    x: -50, z: -14, w: 12, d: 9, height: 4, wallMaterial: 'metalPanel', roofMaterial: 'roof', floorMaterial: 'floorWarehouse', ceilingMaterial: 'metalPanel',
    sides: { S: { openings: [{ at: 4, width: 1.9, height: 2.3, kind: 'door', frame: 'steelDark' }, { at: 8.5, width: 2.4, height: 1.4, sill: 1, kind: 'window', lit: true }] } },
    tag: 'pad-office',
  });
  container(b, { x: -14, z: -30, rot: HALF_PI, stack: 2, color: 'rust', seed: 210 });
  container(b, { x: -14, z: -17, rot: HALF_PI, color: 'red', doorsOpen: true, seed: 211 });
  floodlightTower(b, { x: -58, z: -24, rot: -HALF_PI, on: true });
  floodlightTower(b, { x: -24, z: -46, rot: Math.PI, on: true });
  d.crate(-30, -46, 0.4, 'low');
  d.crate(-58, -8, 0, 'low');

  // ---- SE: Phoenix Plaza ----
  const beacon = transmitterSite(b, { x: FORGE.beacon.x, z: FORGE.beacon.z, rot: 0, radius: FORGE.beacon.radius });
  // Vulcan HQ: tomoe's vault in its south-east corner, the Great Furnace against its back wall, the Spotlight Wall
  const vaultDoors: DoorHandle[] = [];
  const vault = hqVault(c, { x0: 39.4, z0: 7.4, x1: 56.6, z1: 18.6 }, vaultDoors);
  building(b, {
    x: 48, z: 13, w: 18, d: 12, height: 6, wallMaterial: 'brick', roofMaterial: 'roof', floorMaterial: 'floorWarehouse', ceilingMaterial: 'concreteDark', parapet: 0.6,
    sides: {
      N: { openings: [{ at: 9, width: 4, height: 3.6, kind: 'door', frame: 'steelDark' }] },
      W: { openings: [{ at: 6, width: 2, height: 2.4, kind: 'door', frame: 'steelDark' }] },
      S: { openings: [{ at: 4, width: 2.6, height: 1.6, sill: 1.6, kind: 'window', lit: true }, { at: 14, width: 2.6, height: 1.6, sill: 1.6, kind: 'window', lit: true }] },
    },
    partitions: vault.partitions,
    tag: 'forge-hall',
  });
  const furnaceDoor = greatFurnace(c, 44.5, 16.2);
  spotlightWall(c, 40.4, 7.5);
  // the hall is Vulcan HQ: the phoenix billboard on its roof, its name in neon, the quarantine it fell under;
  // the clan's banners hang around the perimeter. Then the phoenix pillar at the plaza corner.
  const billboard = vulcanForge(c, { x: 48, z: 13, frontZ: 7, height: 6 }, B);
  b.light({ x: 48, y: 7, z: 5.5, color: 0xff7a1a, intensity: 110, distance: 14 });
  addBox(b, 'steelDark', 14, 4.5, 14, 1.4, 9, 1.4, Math.PI / 4);
  addBox(b, b.mats.get('emAmber'), 14, 9.3, 14, 1.8, 0.8, 1.8, Math.PI / 4, { cast: false });
  b.collideBox(14, 14, 2, 2, 9, { mapKind: 'prop', tag: 'pillar' });
  b.light({ x: 14, y: 9.6, z: 14, color: 0xff8a2a, intensity: 150, distance: 18 });
  furnace(c, 58, 34, -HALF_PI);
  furnace(c, 58, 44, -HALF_PI);
  forklift(b, { x: 20, z: 40, rot: 0.8, loaded: true });
  container(b, { x: 14, z: 30, rot: 0, color: 'yellow', seed: 220 });
  container(b, { x: 50, z: 46, rot: 0, stack: 2, color: 'red', seed: 221 });
  pallet(b, { x: 40, z: 20, rot: 0.2 });
  tireStack(b, { x: 24, z: 46, rot: 0 });
  d.station({ kind: 'upgrade', name: 'THE ANVIL', x: 22, z: 10, yaw: Math.PI, region: 'medium' });
  d.crate(56, 22, -0.4, 'medium');
  d.crate(10, 46, 0.2, 'medium');
  d.crate(42, 46, 0, 'medium');

  // ---- NE: The Crucible ----
  building(b, {
    x: FORGE.crucible.x, z: FORGE.crucible.z, w: 30, d: 18, height: 8, wallMaterial: 'concreteDark', floorMaterial: 'floorWarehouse', roof: false,
    sides: {
      S: { openings: [{ at: 8, width: 5, height: 5, kind: 'door', frame: 'steelDark' }, { at: 22, width: 5, height: 5, kind: 'door', frame: 'steelDark' }] },
      W: { openings: [{ at: 9, width: 4, height: 4, kind: 'door', frame: 'steelDark' }] },
      N: { openings: [{ at: 15, width: 3, height: 3, kind: 'door', frame: 'steelDark' }] },
    },
    tag: 'crucible',
  });
  // molten pools inside the hall and runoff channels outside it
  moltenChannel(c, molten, 27, -35, 33, -31);
  moltenChannel(c, molten, 39, -35, 45, -31);
  moltenChannel(c, molten, 12, -46, 15, -22);
  moltenChannel(c, molten, 52, -30, 58, -27);
  craneGantry(b, { x: FORGE.crucible.x, z: -33, rot: 0, span: 20, height: 7, length: 6 });
  const sp = spire(b, { x: FORGE.spire.x, z: FORGE.spire.z, rot: 0, height: 50 });
  container(b, { x: 22, z: -9, rot: 0, color: 'rust', seed: 230 });
  container(b, { x: 52, z: -9, rot: 0, stack: 2, color: 'olive', seed: 231 });
  barrelGroup(b, { x: 18, z: -40, rot: 0, count: 6, radius: 1.6, seed: 232, colors: ['rust', 'yellow'] });
  crateGroup(b, { x: 56, z: -20, rot: 0.6, count: 4, radius: 1.4, kind: 'mil', seed: 233 });
  debris(b, { x: 44, z: -16, radius: 3.4, seed: 234, big: true });
  corpse(b, { x: 30, z: -19, rot: 2.1 });
  floodlightTower(b, { x: 59, z: -47, rot: Math.PI * 0.75, on: true });
  floodlightTower(b, { x: 9, z: -47, rot: Math.PI * 1.25, on: true });
  d.crate(48, -46, 0.5, 'high');
  d.crate(21, -26, 1.1, 'high');
  d.crate(36, -24, 0, 'high');

  // ---- spawn points and resident infected ----
  d.spawn('low', 'general', [[-58, 47], [-58, 16], [-28, 48], [-8, 40], [-58, -20], [-40, -47], [-9, -40], [-28, -8]], 1);
  d.spawn('medium', 'general', [[58, 48], [58, 26], [30, 47], [10, 20], [42, 8]], 1);
  d.spawn('high', 'general', [[58, -40], [58, -11], [24, -47], [10, -16], [46, -22]], 1.2);
  d.spawn('medium', 'defense', [[20, 18], [46, 40], [44, 22], [18, 42]], 1);
  d.spawn('low', 'lz', [[-50, -44], [-24, -40], [-50, -22], [-22, -20]], 1);
  d.zombies('low', 'shambler', [[-30, 18], [-14, 34], [-40, 46], [-26, -36], [-48, -26], [-12, -24], [-56, 2.5]]);
  d.zombies('medium', 'shambler', [[24, 24], [40, 36], [54, 30], [12, 38]]);
  d.zombies('medium', 'runner', [[30, 16], [46, 44]]);
  d.zombies('high', 'shambler', [[26, -24], [46, -24], [20, -12], [56, -16]]);
  d.zombies('high', 'runner', [[30, -40], [50, -36]]);
  d.zombies('high', 'armored', [[24, -32], [48, -32], [40, -10]]);

  // ---- the ring around it all: the Hearth, the Pit, the seven foundries, the Spawn Hall, the Ledger House ----
  const outerDoors: DoorHandle[] = [];
  const outer = buildForgeOuter(c, outerDoors);
  const sites: ForgeSites = {
    rooms: [...outer.rooms, vault.def],
    hearth: outer.hearth,
    ledger: [...outer.ledger, { x: 52.4, y: 0.06, z: 11.2, place: 'Vulcan HQ' }],
    rumble: outer.rumble,
    furnaces: outer.furnaces,
    furnace: { x: 44.5, z: 16.2 - 1.82, yaw: 0 },
    hq: { x: 48, z: 13, roofY: 6.4 },
  };
  return {
    transmitter: beacon,
    spire: sp,
    sites,
    handles: { doors: [...outerDoors, ...vaultDoors], hearthGlow: outer.hearthGlow, furnaceDoor, billboard, furnaceMouths: outer.furnaceMouths },
  };
}
