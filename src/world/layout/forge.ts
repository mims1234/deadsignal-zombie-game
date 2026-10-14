/**
 * THE FORGE: the second map, after the Vulcan community's phoenix forge. A foundry district at ember night: black
 * steel and brick, molten runoff in open channels, sodium-orange lamps, a phoenix sigil burning in the crossroads.
 *
 *   SW  Ember Market   insertion gate, market hall, workshops (low threat)
 *   NW  The Pad        helipad and radio for extraction, fuel farm (low)
 *   SE  Phoenix Plaza  the beacon to rekindle, the forge hall with its VULCAN sign (medium)
 *   NE  The Crucible   open-roofed foundry with molten pools, the Infernus, the firestorm spire (high)
 */
import * as THREE from 'three';
import { quarantineGate, helipad, skylineBackdrop, spire, transmitterSite, type SpireHandle, type TransmitterHandle } from '../landmarks';
import { neonLabelMaterial } from '../landmarks/tex';
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
import { addBox, building, groundRect, perimeterWall, wallDecal } from '../structures';
import { HALF_PI, type Ctx } from './util';

export const FORGE_BOUNDS = { minX: -62, maxX: 62, minZ: -50, maxZ: 50 };
export const FORGE = {
  start: { x: -50, z: 41 },
  lz: { x: -38, z: -30, radius: 11, terminalX: -27.5, terminalZ: -22.5 },
  beacon: { x: 32, z: 29, radius: 11 },
  crucible: { x: 36, z: -29 },
  infernus: { x: 36, z: -27 },
  spire: { x: 54, z: -43 },
};

/** A glowing phoenix sigil, painted once on a canvas (a ring with two swept wings and a rising tail). */
function sigilMaterial(): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.translate(256, 256);
  g.strokeStyle = '#ff7a1a';
  g.fillStyle = '#ff7a1a';
  g.lineCap = 'round';
  g.shadowColor = '#ff9a3a';
  g.shadowBlur = 18;
  g.lineWidth = 14;
  g.beginPath();
  g.arc(0, 0, 214, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, 192, 0, Math.PI * 2);
  g.stroke();
  // wings: fans of tapered feathers sweeping up and out
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const a = -0.25 - i * 0.13;
      const len = 150 - i * 9;
      g.beginPath();
      g.moveTo(s * 18, -10 + i * 6);
      g.quadraticCurveTo(s * (60 + i * 8), -40 - i * 4, s * Math.cos(a) * len, Math.sin(a) * len - 30 + i * 14);
      g.lineWidth = 12 - i;
      g.stroke();
    }
  }
  // body, head and the rising tail
  g.beginPath();
  g.ellipse(0, 10, 22, 52, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(0, -58, 17, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(10, -64);
  g.lineTo(44, -56);
  g.lineTo(12, -50);
  g.fill();
  for (const s of [-1, 0, 1]) {
    g.beginPath();
    g.moveTo(0, 50);
    g.quadraticCurveTo(s * 40, 110, s * 70, 160);
    g.lineWidth = 10;
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xff6a10, emissiveMap: tex, emissiveIntensity: 1.6, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
}

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

export interface ForgeResult {
  transmitter: TransmitterHandle;
  spire: SpireHandle;
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
    { x0: -61, z0: -5, x1: 61, z1: 5, name: 'CINDER WAY', mat: 'asphaltWet' as const, y: 0.012 },
    { x0: -5, z0: -49, x1: 5, z1: 49, name: 'ANVIL ROAD', mat: 'asphaltWet' as const, y: 0.013 },
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
  // the sigil burning in the crossroads
  groundRect(b, sigilMaterial(), -7, -7, 7, 7, 0.035);
  b.light({ x: 0, y: 2.5, z: 0, color: 0xff6a14, intensity: 140, distance: 16 });

  d.regionRects.push(
    { region: 'high', x0: 5, z0: -50, x1: 62, z1: -5 },
    { region: 'medium', x0: 5, z0: -5, x1: 62, z1: 50 },
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
  quarantineGate(b, { x: 0, z: Z - 1.8, rot: Math.PI, width: 10, open: 0 });
  quarantineGate(b, { x: -X + 1.8, z: 0, rot: -HALF_PI, width: 10, open: 0 });
  wallDecal(b, 'stencilDanger', X - 0.62, 2.8, 20, 8, 2.2, -HALF_PI);
  wallDecal(b, 'stencilKeepOut', -20, 2.8, -Z + 0.62, 8, 2.2, 0);
  b.collide({ x: 0, z: -B.maxZ - 6, hx: 90, hz: 2, y1: 30, mapKind: 'none' });
  b.collide({ x: 0, z: B.maxZ + 6, hx: 90, hz: 2, y1: 30, mapKind: 'none' });
  b.collide({ x: B.minX - 6, z: 0, hx: 2, hz: 70, y1: 30, mapKind: 'none' });
  b.collide({ x: B.maxX + 6, z: 0, hx: 2, hz: 70, y1: 30, mapKind: 'none' });
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
  const hall = building(b, {
    x: 48, z: 13, w: 18, d: 12, height: 6, wallMaterial: 'brick', roofMaterial: 'roof', floorMaterial: 'floorWarehouse', ceilingMaterial: 'concreteDark', parapet: 0.6,
    sides: {
      N: { openings: [{ at: 9, width: 4, height: 3.6, kind: 'door', frame: 'steelDark' }] },
      W: { openings: [{ at: 6, width: 2, height: 2.4, kind: 'door', frame: 'steelDark' }] },
      S: { openings: [{ at: 4, width: 2.6, height: 1.6, sill: 1.6, kind: 'window', lit: true }, { at: 14, width: 2.6, height: 1.6, sill: 1.6, kind: 'window', lit: true }] },
    },
    tag: 'forge-hall',
  });
  void hall;
  // VULCAN in neon over the hall's street front, and the phoenix pillar at the plaza corner
  addBox(b, neonLabelMaterial('VULCAN FORGE', '#ff7a1a'), 48, 7.2, 6.75, 12, 1.6, 0.12, 0, { cast: false });
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

  return { transmitter: beacon, spire: sp };
}
