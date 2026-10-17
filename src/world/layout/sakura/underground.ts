/**
 * Underground (built south of the street map, out of sight; joined to it by stairwells, `floors.ts`).
 *
 * - **The metro:** the ticket concourse under the station, the platform with the last train still at it, a tunnel east
 *   under Sakura-dori with a derailed car in it, and an east concourse with stairs up to the shotengai and the canal.
 *   Dark, wet, roots through the ceiling, the emergency lights still flickering on their batteries.
 * - **The lab** under the theatre: Kurenai Biotech's real work - corridors, cold rooms, the specimen room, and the
 *   graft's empty case in the vault.
 */
import * as THREE from 'three';
import { corpse, crateGroup, debris } from '../../props';
import { addBox, groundRect, wall } from '../../structures';
import type { Ctx } from '../util';
import { UNDER } from './consts';
import { MAT, commuterCar, jpSignMaterial, rails, signBoard, wallWords } from './props';
import { type MetroInfo, dressMetro, trainWindows } from './metro';

const CEIL = 4.4;

export interface UnderAreas {
  metro: number;
  lab: number;
}

/** Register the underground areas (before anything links to them). */
export function underAreas(c: Ctx): UnderAreas {
  const m = UNDER.metro;
  const l = UNDER.lab;
  return {
    metro: c.floors.addArea('Sakuragi metro', 'under', 0, { minX: m.x0, maxX: m.x1, minZ: m.z0, maxZ: m.z1 }),
    lab: c.floors.addArea('Kurenai lab', 'under', 0, { minX: l.x0, maxX: l.x1, minZ: l.z0, maxZ: l.z1 }),
  };
}

/** Where the stairs come down in each underground space (the foot of the stairs; you step off it facing -Z). */
export const UNDER_FEET = {
  station: { x: -74, z: 155, yaw: 0 },
  shotengai: { x: 44, z: 155, yaw: 0 },
  canal: { x: 60, z: 155, yaw: 0 },
  lab: { x: 86, z: 155, yaw: 0 },
};

export interface UnderInfo {
  /** The specimen room's fridge (an Easter egg spot) and the graft vault (story). */
  fridge: { x: number; z: number };
  vault: { x: number; z: number };
  /** The metro's fuse cabinets (its power). */
  metro: MetroInfo;
}

/** A box of rock: solid, not drawn (the space round the tunnels), so nobody walks where nothing is. */
function rock(c: Ctx, x0: number, z0: number, x1: number, z1: number): void {
  c.b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y1: CEIL, mapKind: 'none', tag: 'rock' });
}

/** A walled, roofed space: floor, four walls (with openings), ceiling. */
function room(c: Ctx, x0: number, z0: number, x1: number, z1: number, o: { floor?: string; wall?: string; open?: { side: 'N' | 'S' | 'E' | 'W'; at: number; width: number }[] } = {}): void {
  const { b } = c;
  groundRect(b, (o.floor ?? 'tile') as 'tile', x0, z0, x1, z1, 0.03);
  const sides = [
    { side: 'N' as const, ax: x0, az: z0, bx: x1, bz: z0 },
    { side: 'S' as const, ax: x0, az: z1, bx: x1, bz: z1 },
    { side: 'W' as const, ax: x0, az: z0, bx: x0, bz: z1 },
    { side: 'E' as const, ax: x1, az: z0, bx: x1, bz: z1 },
  ];
  for (const s of sides) {
    const openings = (o.open ?? []).filter((p) => p.side === s.side).map((p) => ({ at: p.at, width: p.width, height: 3.2, kind: 'door' as const }));
    wall(b, { x0: s.ax, z0: s.az, x1: s.bx, z1: s.bz, height: CEIL, thickness: 0.4, material: (o.wall ?? 'concreteWall') as 'concreteWall', openings, mapKind: 'none', tag: 'under-wall' });
  }
  addBox(b, 'concreteDark', (x0 + x1) / 2, CEIL + 0.2, (z0 + z1) / 2, x1 - x0 + 0.4, 0.4, z1 - z0 + 0.4);
}

/** The bottom of a stairwell: the flight going back up into the dark behind the foot. */
function stairsUp(c: Ctx, foot: { x: number; z: number }, label?: string): void {
  const { b } = c;
  for (let i = 0; i < 12; i++) addBox(b, 'concreteSlab', foot.x, 0.12 + i * 0.25, foot.z + 0.6 + i * 0.3, 3, 0.24 + i * 0.5 * 0, 0.32);
  for (let i = 0; i < 12; i++) b.collide({ x: foot.x, z: foot.z + 0.6 + i * 0.3, hx: 1.5, hz: 0.15, y1: 0.25 + i * 0.25, mapKind: 'none', tag: 'under-stairs' });
  for (const s of [-1, 1]) addBox(b, 'concreteWall', foot.x + s * 1.7, CEIL / 2, foot.z + 2.4, 0.3, CEIL, 4.4);
  if (label) signBoard(b, { x: foot.x, z: foot.z + 0.3, y: 3.6, rot: Math.PI, w: 2.8, h: 0.5, text: label, sign: { bg: '#1a3a8a', fg: '#ffffff', glow: 0.15, worn: 0.6 } });
}

/** Emergency lights along a line: red and flickering, a few dead. */
function emergencyLights(c: Ctx, x0: number, z0: number, x1: number, z1: number, every = 10): void {
  const { b, rng } = c;
  const L = Math.hypot(x1 - x0, z1 - z0);
  for (let s = every / 2; s < L; s += every) {
    const t = s / L;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const dead = rng.f() < 0.25;
    addBox(b, dead ? 'steelDark' : 'lampRed', x, CEIL - 0.2, z, 0.5, 0.12, 0.2);
    if (!dead) b.light({ x, y: CEIL - 0.4, z, color: 0xff3a2a, intensity: 22, distance: 10, mode: rng.f() < 0.5 ? 'flicker' : 'steady', pool: 3, glow: 0.5, tag: 'emergency', indoor: true });
  }
}

/** Roots grown down through the ceiling, glowing petals caught in them (the tree reaches even here). */
function roots(c: Ctx, x: number, z: number): void {
  const { b, rng } = c;
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.12, 2 + rng.f() * 1.6, 5), MAT.pinkBark());
    r.position.set(x + (rng.f() - 0.5) * 2, CEIL - 1.1, z + (rng.f() - 0.5) * 2);
    r.rotation.set((rng.f() - 0.5) * 0.6, 0, (rng.f() - 0.5) * 0.6);
    b.addDynamic(r);
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffb0d0, emissive: 0xff7ab0, emissiveIntensity: 2 }));
  glow.position.set(x, CEIL - 1.6, z);
  b.addDynamic(glow);
  b.light({ x, y: CEIL - 1.6, z, color: 0xff8ac0, intensity: 6, distance: 6, mode: 'pulse', period: 3, pool: 1.5, glow: 0.6, tag: 'petal-glow', indoor: true });
}

export function buildUnderground(c: Ctx): UnderInfo {
  const { b, d, rng } = c;
  const M = UNDER.metro;

  // ---- the metro: west concourse (under the station), platform, tunnel, east concourse ----
  // west concourse: z 150..162
  room(c, -118, 150, -46, 162, { floor: 'tile', open: [{ side: 'S', at: 36, width: 60 }] });
  stairsUp(c, UNDER_FEET.station, '出口 A');
  signBoard(b, { x: -82, z: 150.25, y: 3.4, rot: 0, w: 6, h: 0.7, text: '桜木駅', sign: { bg: '#f2f0ea', fg: '#1a2a5a', sub: 'SAKURAGI', glow: 0.1 } });
  // the ticket gates, a crush of bodies against them; luggage
  for (let x = -100; x <= -86; x += 2) b.collideBox(x, 159, 0.3, 1.4, 1.1, { mapKind: 'none', tag: 'gate', surface: 'metal' }); // (drawn by `dressMetro`)
  for (const [x, z] of [[-96, 157], [-92, 157.5], [-90, 156.4], [-104, 154]] as const) corpse(b, { x, z, rot: rng.f() * 6, kind: 'civilian', seed: Math.round(x * 3 + z) });
  wallWords(b, { x: -60, y: 2, z: 150.25, rot: 0, w: 8, h: 1.6, text: '地上は安全じゃない\nTHE SURFACE IS NOT SAFE', color: '#e8e0d0' });
  emergencyLights(c, -116, 156, -48, 156, 12);
  // the platform: z 162..168, the track bed and tunnel z 168..176 running east to the far concourse
  groundRect(b, 'concreteSlab', -118, 162, -46, 168, 0.04);
  groundRect(b, 'gravel', -118, 168, M.x1, 176, 0.03);
  rails(c, { x0: -118, z0: 172, x1: M.x1, z1: 172 });
  // walls of the tunnel and platform
  wall(b, { x0: -118, z0: 176, x1: M.x1, z1: 176, height: CEIL, thickness: 0.4, material: 'concreteWall', mapKind: 'none', tag: 'tunnel' });
  wall(b, { x0: -118, z0: 162, x1: -118, z1: 176, height: CEIL, thickness: 0.4, material: 'concreteWall', mapKind: 'none', tag: 'tunnel' });
  wall(b, { x0: -46, z0: 162, x1: -46, z1: 168, height: CEIL, thickness: 0.4, material: 'concreteWall', mapKind: 'none', tag: 'tunnel' });
  wall(b, { x0: -46, z0: 168, x1: 36, z1: 168, height: CEIL, thickness: 0.4, material: 'concreteWall', mapKind: 'none', tag: 'tunnel' });
  addBox(b, 'concreteDark', (-118 + M.x1) / 2, CEIL + 0.2, 172, M.x1 + 118, 0.4, 8.4);
  addBox(b, 'concreteDark', -82, CEIL + 0.2, 165, 72, 0.4, 6.4);
  // the last train, still at the platform; a derailed car further down the tunnel
  commuterCar(b, { x: -84, z: 172, rot: Math.PI / 2, len: 36, doorsChained: false, windows: trainWindows() });
  const derailed = { x: 2, z: 171.4 };
  commuterCar(b, { x: derailed.x, z: derailed.z, rot: Math.PI / 2 + 0.06, len: 16 });
  emergencyLights(c, -116, 165, -48, 165, 14);
  emergencyLights(c, -40, 174.5, M.x1 - 2, 174.5, 16);
  for (const x of [-60, -20, 24]) roots(c, x, 172);
  for (const [x, z] of [[-30, 170], [40, 173], [-70, 164]] as const) debris(b, { x, z, radius: 2.5, density: 0.6, seed: Math.round(x) });
  const metro = dressMetro(c, { x1: M.x1 });
  // east concourse: x 36..70, z 150..168, stairs up to the shotengai and the canal
  room(c, 36, 150, M.x1, 168, { floor: 'tile', open: [{ side: 'S', at: 17, width: 34 }] });
  stairsUp(c, UNDER_FEET.shotengai, '出口 B  商店街');
  stairsUp(c, UNDER_FEET.canal, '出口 C  川端');
  emergencyLights(c, 38, 160, M.x1 - 2, 160, 10);
  roots(c, 52, 162);
  crateGroup(b, { x: 66, z: 164, count: 3, radius: 1.2, kind: 'wood', seed: 111 });
  // the rock between and round it all
  rock(c, -46, 150, 36, 168);
  rock(c, M.x0 - 2, M.z0 - 2, M.x1 + 2, M.z0);
  rock(c, M.x0 - 2, 176, M.x1 + 2, M.z1 + 2);
  rock(c, M.x1, M.z0, M.x1 + 2, M.z1);

  // ---- the lab under the theatre ----
  const L = UNDER.lab;
  room(c, L.x0, L.z0, L.x1, 162, { floor: 'labFloor', wall: 'labPanel', open: [{ side: 'S', at: 22, width: 4 }] });
  stairsUp(c, UNDER_FEET.lab);
  signBoard(b, { x: 102, z: 150.25, y: 3.4, rot: 0, w: 7, h: 0.7, text: '紅バイオ 研究棟', sign: { bg: '#f0f0ee', fg: '#a8141e', sub: 'KURENAI BIOTECH — RESEARCH', glow: 0.1 } });
  // the corridor south and the rooms off it
  room(c, 99, 162, 105, L.z1, { floor: 'labFloor', wall: 'labPanel', open: [{ side: 'N', at: 3, width: 4 }, { side: 'W', at: 5, width: 2 }, { side: 'E', at: 5, width: 2 }, { side: 'W', at: 15, width: 2 }, { side: 'E', at: 15, width: 2 }] });
  room(c, L.x0, 164, 99, 174, { floor: 'labFloor', wall: 'labPanel', open: [{ side: 'E', at: 3, width: 2 }] }); // the cold room
  room(c, 105, 164, L.x1, 174, { floor: 'labFloor', wall: 'labPanel', open: [{ side: 'W', at: 3, width: 2 }] }); // the specimen room
  room(c, L.x0, 175, 99, L.z1, { floor: 'labFloor', wall: 'labPanel', open: [{ side: 'E', at: 2, width: 2 }] }); // the vault
  room(c, 105, 175, L.x1, L.z1, { floor: 'labFloor', wall: 'labPanel', open: [{ side: 'W', at: 2, width: 2 }] }); // the records room
  rock(c, L.x0 - 2, L.z0 - 2, L.x1 + 2, L.z0);
  rock(c, L.x0 - 2, L.z1, L.x1 + 2, L.z1 + 2);
  rock(c, L.x0 - 2, L.z0, L.x0, L.z1);
  rock(c, L.x1, L.z0, L.x1 + 2, L.z1);
  emergencyLights(c, 102, 164, 102, 180, 6);
  emergencyLights(c, 84, 156, 120, 156, 9);
  // the specimen room: the fridges, cherry wood in jars
  const fridge = { x: 120, z: 166 };
  for (let i = 0; i < 4; i++) {
    addBox(b, 'labPanel', 109 + i * 3.6, 1.1, 164.6, 1.6, 2.2, 0.9);
    b.collideBox(109 + i * 3.6, 164.6, 1.6, 0.9, 2.2, { mapKind: 'none', tag: 'fridge', surface: 'metal' });
  }
  for (let i = 0; i < 10; i++) {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0xc8f0d8, transparent: true, opacity: 0.6, emissive: 0x2a6a3a, emissiveIntensity: 0.5 }));
    jar.position.set(108 + (i % 5) * 0.4, 1.02, 172.5 + Math.floor(i / 5) * 0.4);
    b.addDynamic(jar);
  }
  addBox(b, 'steel', 109, 0.45, 172.7, 2.4, 0.9, 1);
  // the cold room: the infected they kept
  for (let i = 0; i < 5; i++) {
    const x = 84 + i * 3;
    for (const s of [-1, 1]) addBox(b, 'steelDark', x + s * 1.2, 1.4, 165, 0.08, 2.8, 0.08);
    addBox(b, 'chainlink', x, 1.4, 165.1, 2.4, 2.8, 0.04);
  }
  wallWords(b, { x: 92, y: 2.2, z: 173.75, rot: Math.PI, w: 7, h: 1.4, text: '被験者 1〜47\nSUBJECTS 1-47', color: '#a8141e' });
  // the vault: the graft's case, open, empty
  const vault = { x: 91, z: 179 };
  addBox(b, 'steel', vault.x, 0.6, vault.z, 1.8, 1.2, 1.2);
  addBox(b, 'glass', vault.x, 1.5, vault.z, 1.6, 0.6, 1.0);
  b.collideBox(vault.x, vault.z, 1.8, 1.2, 1.2, { mapKind: 'none', tag: 'graft-case', surface: 'metal' });
  signBoard(b, { x: vault.x, z: 180.7, y: 2.4, rot: Math.PI, w: 3.4, h: 0.6, text: '移植片 第一号', sign: { bg: '#101010', fg: '#e8c060', sub: 'GRAFT No.1 — SACRED CHERRY', glow: 0.2 } });
  roots(c, 92, 178);
  roots(c, 116, 168);
  corpse(b, { x: 112, z: 170, rot: 1, kind: 'hazmat', seed: 121 });
  corpse(b, { x: 102, z: 178, rot: 2, kind: 'hazmat', seed: 122 });
  void jpSignMaterial;

  // ---- the residents ----
  d.zombies('medium', 'shambler', [[-100, 155], [-80, 158], [-60, 156], [-90, 165], [-70, 164], [-30, 172], [10, 173], [40, 172], [50, 158], [64, 162]]);
  d.zombies('medium', 'runner', [[-110, 165], [-10, 174], [60, 166]]);
  d.zombies('high', 'shambler', [[100, 158], [110, 156], [102, 170], [86, 170], [118, 178]]);
  d.zombies('high', 'armored', [[102, 176]]);
  return { fridge, vault, metro };
}
