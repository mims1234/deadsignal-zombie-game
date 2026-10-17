/**
 * The shotengai (the middle band, LOW to MEDIUM threat): the covered shopping street. Before: small shops under an arcade
 * roof - a konbini, ramen, pachinko, karaoke, a coffee shop, izakaya at the east end. During: the shopkeepers welded the
 * shutters, wrote warnings on them, and made their last stand in the pachinko parlour. Now: half the arcade roof has
 * fallen in, trees grow through it, the konbini was picked clean years ago, and a plank bridge still links the karaoke
 * house's first floor to the coffee shop's across the lane.
 */
import * as THREE from 'three';
import { corpse, crateGroup, debris, sandbagWall, vehicle, jerseyBarrier } from '../../props';
import { addBox, building, solidBlock } from '../../structures';
import { yawFacing } from '../data';
import { stairwellDown, storeyBuilding } from '../storeys';
import type { Ctx } from '../util';
import { ARCADE, ZONES } from './consts';
import { MAT, cherryTree, grass, ivy, jpSignMaterial, lanternString, petals, shopFront, signBoard, vendingMachine, wallWords } from './props';

/** The shotengai's metro stairwell: its doorway on the south side of the lane, facing north into the arcade. */
export const SHOTENGAI_KIOSK = { x: 48, z: -1, yaw: Math.PI };

export interface ShotengaiInfo {
  /** The karaoke house's VIP room, first floor (an Easter egg spot). */
  vipRoom: { x: number; y: number; z: number };
  karaokeAreas: number[];
}

const SHOPS: [string, string, string][] = [
  ['ラーメン', 'RAMEN', '#b8341f'],
  ['本屋', 'BOOKS', '#2a4a7a'],
  ['薬局', 'PHARMACY', '#2a7a4a'],
  ['八百屋', 'GREENGROCER', '#5a7a2a'],
  ['寿司', 'SUSHI', '#1a2a4a'],
  ['花屋', 'FLOWERS', '#c86a8a'],
  ['電器', 'ELECTRONICS', '#3a3a6a'],
  ['古着', 'VINTAGE', '#6a4a2a'],
  ['写真館', 'PHOTO STUDIO', '#4a4a4a'],
  ['和菓子', 'SWEETS', '#a85a3a'],
  ['眼鏡', 'OPTICIAN', '#2a5a6a'],
  ['クリーニング', 'CLEANERS', '#4a6a9a'],
];
const WARNINGS = ['開けるな', 'DO NOT OPEN', '中に居る', 'KEEP OUT', '感染者', 'INFECTED INSIDE', '助けて', '閉店'];

export function buildShotengai(c: Ctx, metro: { area: number; x: number; z: number; yaw: number }): ShotengaiInfo {
  const { b, d, rng } = c;
  let shopI = 0;
  let warnI = 0;
  /** A row of shops along x0..x1 on the north (z -16..-8) or south (z -1..8) side of the lane, skipping `skip` spans. */
  const row = (x0: number, x1: number, side: 'N' | 'S', skip: [number, number][]): void => {
    let x = x0;
    while (x < x1 - 4) {
      const w = Math.min(x1 - x, 6 + rng.f() * 4);
      const cx = x + w / 2;
      if (skip.some(([a, e]) => x + w > a && x < e)) {
        x += 1;
        continue;
      }
      const z0 = side === 'N' ? -16 : ARCADE.z1;
      const z1 = side === 'N' ? ARCADE.z0 : 8;
      const h = 6.5 + rng.f() * 3;
      solidBlock(b, { x: cx, z: (z0 + z1) / 2, w: w - 0.3, d: z1 - z0, height: h, wallMaterial: rng.f() < 0.5 ? 'plaster' : 'brick', facade: { floors: 2, floorHeight: 3.2, seed: Math.round(cx * 13), faces: [side === 'N' ? 'S' : 'N'], litFraction: 0 } });
      const [name, sub, color] = SHOPS[shopI++ % SHOPS.length]!;
      const faceZ = side === 'N' ? ARCADE.z0 + 0.02 : ARCADE.z1 - 0.02;
      const shut = rng.f();
      shopFront(b, { x: cx, z: faceZ, rot: side === 'N' ? 0 : Math.PI, w: w - 0.6, name, sub, color, shutter: shut < 0.6 ? 'down' : shut < 0.85 ? 'torn' : 'up', noren: shut > 0.6 ? name : undefined });
      // warnings painted on the welded shutters
      if (shut < 0.6 && rng.f() < 0.55) {
        const text = WARNINGS[warnI++ % WARNINGS.length]!;
        wallWords(b, { x: cx, y: 1.4, z: faceZ + (side === 'N' ? 0.08 : -0.08), rot: side === 'N' ? 0 : Math.PI, w: Math.min(3, w - 1), h: 1.1, text, color: rng.f() < 0.5 ? '#c83a2a' : '#e8e0d0', drip: true });
      }
      if (rng.f() < 0.35) ivy(b, { x: cx + (rng.f() - 0.5) * 2, z: faceZ + (side === 'N' ? 0.05 : -0.05), rot: side === 'N' ? 0 : Math.PI, w: 2.4, h: 3 + rng.f() * 3, y: 3 });
      x += w;
    }
  };

  // ---- the arcade roof over the lane: trusses on posts, panels mostly gone, a tree through it ----
  const lanes: [number, number][] = [[ZONES.shotengaiW.x0, ZONES.shotengaiW.x1], [ZONES.shotengaiM.x0, ZONES.shotengaiM.x1], [ZONES.shotengaiE.x0, ZONES.shotengaiE.x1]];
  const panel = new THREE.MeshStandardMaterial({ color: 0x9ab0b8, transparent: true, opacity: 0.35, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  for (const [x0, x1] of lanes) {
    const lw = ARCADE.z1 - ARCADE.z0;
    const cz = (ARCADE.z0 + ARCADE.z1) / 2;
    for (let x = x0 + 2; x <= x1 - 1; x += 8) {
      for (const z of [ARCADE.z0 + 0.3, ARCADE.z1 - 0.3]) {
        addBox(b, 'steelDark', x, ARCADE.roofY / 2, z, 0.2, ARCADE.roofY, 0.2);
        b.collideBox(x, z, 0.3, 0.3, ARCADE.roofY, { mapKind: 'none', tag: 'arcade-post', surface: 'metal' });
      }
      addBox(b, 'steelDark', x, ARCADE.roofY, cz, 0.16, 0.3, lw);
    }
    addBox(b, 'steelDark', (x0 + x1) / 2, ARCADE.roofY + 0.2, ARCADE.z0 + 0.3, x1 - x0, 0.2, 0.2);
    addBox(b, 'steelDark', (x0 + x1) / 2, ARCADE.roofY + 0.2, ARCADE.z1 - 0.3, x1 - x0, 0.2, 0.2);
    for (let x = x0 + 2; x < x1 - 4; x += 4) {
      if (rng.f() < 0.55) continue; // fallen out
      const p = new THREE.Mesh(new THREE.PlaneGeometry(3.8, lw), panel);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x + 2, ARCADE.roofY + 0.32, cz);
      b.addDynamic(p);
    }
    // paper lanterns strung along the lane, most dead
    lanternString(c, { x0: x0 + 2, z0: cz - 1.4, x1: x1 - 2, z1: cz - 1.4, y: 4.6, lit: 0.12, seed: Math.round(x0) });
    lanternString(c, { x0: x0 + 2, z0: cz + 1.4, x1: x1 - 2, z1: cz + 1.4, y: 4.4, lit: 0.08, seed: Math.round(x1) });
    grass(c, { x0, z0: ARCADE.z0 + 0.4, x1, z1: ARCADE.z1 - 0.4, density: 0.12, seed: Math.round(x0 * 3) });
    debris(b, { x: (x0 + x1) / 2, z: cz, radius: 6, density: 0.4, seed: Math.round(x1) });
  }
  // trees that have broken up through the roof
  for (const x of [-96, -40, 6, 58, 104]) {
    cherryTree(c, { x, z: (ARCADE.z0 + ARCADE.z1) / 2 + (rng.f() - 0.5) * 2, scale: 1.25, rot: rng.f() * 6 });
    petals(b, { x, z: -4.5, r: 3.5 });
  }

  // ---- west: houses and small shops, the konbini (picked clean) ----
  row(ZONES.shotengaiW.x0, ZONES.shotengaiW.x1, 'N', []);
  row(ZONES.shotengaiW.x0, ZONES.shotengaiW.x1, 'S', [[-66, -48]]);
  building(b, {
    x: -57,
    z: 3.5,
    w: 17,
    d: 9,
    height: 4.2,
    wallMaterial: 'plaster',
    roofMaterial: 'roof',
    floorMaterial: 'floorStore',
    sides: { N: { openings: [{ at: 6, width: 2.6, height: 2.6, kind: 'door' }, { at: 12, width: 4, height: 1.8, sill: 0.6, kind: 'window' }] } },
    tag: 'konbini',
  });
  signBoard(b, { x: -57, z: -1.1, y: 3.6, rot: Math.PI, w: 9, h: 0.9, text: 'サクラマート', sign: { bg: '#f4f4f0', fg: '#d84a7a', sub: '24H  SAKURA MART', glow: 0 } });
  for (let i = 0; i < 4; i++) {
    addBox(b, 'steel', -62 + i * 3.2, 0.8, 4.5, 0.5, 1.6, 4.5);
    b.collideBox(-62 + i * 3.2, 4.5, 0.5, 4.5, 1.6, { mapKind: 'none', tag: 'shelf', surface: 'metal' });
  }
  vendingMachine(b, { x: -66.5, z: -0.5, rot: 0, color: 'white', dead: true, tipped: true, seed: 5 });
  d.station({ kind: 'buy', name: 'SAKURA MART', x: -51, z: 4.5, yaw: yawFacing(0, -1), region: 'low' });

  // ---- the middle: the pachinko fort, the karaoke house and the coffee shop with the bridge between ----
  row(ZONES.shotengaiM.x0, ZONES.shotengaiM.x1, 'N', [[-2, 16], [26, 38]]);
  row(ZONES.shotengaiM.x0, ZONES.shotengaiM.x1, 'S', [[28, 42], [44, 52]]);
  // pachinko: the shopkeepers' last stand
  building(b, {
    x: 7,
    z: -12,
    w: 17,
    d: 8,
    height: 6,
    wallMaterial: 'metalPanel',
    roofMaterial: 'roof',
    floorMaterial: 'floorStore',
    sides: { S: { openings: [{ at: 4, width: 2.4, height: 2.6, kind: 'door' }, { at: 13, width: 2.4, height: 2.6, kind: 'door' }] } },
    tag: 'pachinko',
  });
  signBoard(b, { x: 7, z: -7.9, y: 5.2, rot: 0, w: 12, h: 1.4, text: 'パチンコ 夢', sign: { bg: '#d82a5a', fg: '#ffe040', sub: 'PACHINKO YUME', glow: 0.15, worn: 0.8 } });
  // the sandbag line between its two doors (they fought from the doorways)
  sandbagWall(b, { x0: 4.2, z0: -6.8, x1: 9.8, z1: -6.8, height: 1.2 });
  // the balls spilled out of every machine: a carpet of steel
  const ballGeo = new THREE.SphereGeometry(0.06, 6, 4);
  const ballSet = b.instanced('pachinko-ball', ballGeo, new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.2 }), { cast: false });
  for (let i = 0; i < 600; i++) ballSet.add(1 + rng.f() * 13, 0.06, -7 + rng.f() * 5.5, 0);
  for (let i = 0; i < 6; i++) {
    addBox(b, 'paintRed', 0 + i * 2.6, 1, -14.6, 1.6, 2, 0.6);
  }
  corpse(b, { x: 4, z: -10, rot: 0.5, kind: 'civilian', seed: 31 });
  corpse(b, { x: 10, z: -9.4, rot: 2.1, kind: 'civilian', seed: 32 });
  wallWords(b, { x: 7, y: 2.6, z: -7.85, rot: 0, w: 6, h: 1.2, text: '最後まで戦った\nWE HELD', color: '#e8e0d0' });
  d.crate(10, -12.5, yawFacing(0, 1), 'medium');
  // the karaoke house: two floors and a roof; its first floor a door out onto the plank bridge
  const karaoke = storeyBuilding(c, {
    name: 'Karaoke Kirameki',
    x0: 26,
    z0: -16,
    x1: 38,
    z1: -8,
    storeys: 2,
    roofAccess: true,
    wall: 'plaster',
    floor: 'wood',
    stair: { x: 35.5, z: -10, dx: 0, dz: -1 },
    doors: { S: [{ at: 3, width: 2.2 }] },
    upperDoors: [{ storey: 1, side: 'S', at: 7, width: 1.6 }],
    rooms: [{ storey: 1, x0: 26, z0: -12.5, x1: 32, z1: -12.5, openings: [{ at: 3, width: 1.2, height: 2.2, kind: 'door' }] }],
    tag: 'karaoke',
  });
  signBoard(b, { x: 32, z: -7.85, y: 8.6, rot: 0, w: 8, h: 1.1, text: 'カラオケ きらめき', sign: { bg: '#5a2a8a', fg: '#ffd8f0', sub: 'KARAOKE KIRAMEKI', glow: 0.2, worn: 0.75 } });
  const vipRoom = { x: 28.5, y: 4, z: -14.5 };
  addBox(b, 'paintRed', 28.5, 4.4, -15.4, 3.2, 0.8, 0.9); // the VIP booth's sofa
  // the coffee shop across the lane, two floors, its first floor door onto the bridge
  const cafe = storeyBuilding(c, {
    name: 'Kissa Hanami',
    x0: 30,
    z0: ARCADE.z1,
    x1: 40,
    z1: 8,
    storeys: 2,
    wall: 'brick',
    floor: 'wood',
    stair: { x: 37.5, z: 5, dx: 0, dz: -1 },
    doors: { N: [{ at: 2.5, width: 2 }] },
    upperDoors: [{ storey: 1, side: 'N', at: 3, width: 1.6 }],
    tag: 'kissaten',
  });
  signBoard(b, { x: 35, z: ARCADE.z1 - 0.1, y: 7.6, rot: Math.PI, w: 7, h: 0.9, text: '喫茶 花見', sign: { bg: '#3a2a1a', fg: '#f0d8b0', sub: 'KISSA HANAMI', worn: 0.8 } });
  // the plank bridge across the lane at the first floor
  {
    const bx = 33;
    const y = 4;
    for (let z = ARCADE.z0 - 0.3; z < ARCADE.z1 + 0.3; z += 0.42) addBox(b, 'wood', bx + (rng.f() - 0.5) * 0.05, y - 0.04, z + 0.2, 1.7, 0.07, 0.38);
    b.collide({ x: bx, z: (ARCADE.z0 + ARCADE.z1) / 2, hx: 0.85, hz: (ARCADE.z1 - ARCADE.z0) / 2 + 0.4, y0: y - 0.3, y1: y, floor: true, surface: 'wood', mapKind: 'none', tag: 'plank-bridge' });
    for (const s of [-1, 1]) {
      addBox(b, MAT.woodDark(), bx + s * 0.85, y + 0.55, (ARCADE.z0 + ARCADE.z1) / 2, 0.06, 0.06, ARCADE.z1 - ARCADE.z0 + 0.6);
      b.collide({ x: bx + s * 0.9, z: (ARCADE.z0 + ARCADE.z1) / 2, hx: 0.05, hz: (ARCADE.z1 - ARCADE.z0) / 2 + 0.3, y0: y - 0.3, y1: y + 1.1, blocksShots: false, mapKind: 'none', tag: 'bridge-rail' });
    }
    // the bridge for the infected: across, from one first floor to the other
    c.floors.addLink(karaoke.areas[1]!, cafe.areas[1]!, [
      { x: bx, y, z: ARCADE.z0 - 1.0 },
      { x: bx, y, z: ARCADE.z0 + 0.1 },
      { x: bx, y, z: ARCADE.z1 - 0.1 },
      { x: bx, y, z: ARCADE.z1 + 1.0 },
    ]);
  }
  // the metro stairwell on the lane
  stairwellDown(c, SHOTENGAI_KIOSK, metro, { sign: jpSignMaterial('地下鉄', { bg: '#1a3a8a', fg: '#ffffff', aspect: 4.8, sub: 'METRO', worn: 0.6 }) });
  // a car driven into the arcade's west mouth, and the barrier that failed at its east end
  vehicle(b, { x: -15, z: -4.5, rot: 1.2, kind: 'van', paint: 'white', wrecked: true, seed: 61 });
  jerseyBarrier(b, { x: 64, z: -6, rot: 0.2 });
  jerseyBarrier(b, { x: 64.5, z: -2.5, rot: -0.1 });
  crateGroup(b, { x: 60, z: -4, count: 3, radius: 1.4, kind: 'wood', seed: 63 });

  // ---- the east: the izakaya alley, the apartment block ----
  row(ZONES.shotengaiE.x0, 98, 'N', []);
  row(ZONES.shotengaiE.x0, 98, 'S', []);
  for (let x = 100; x < 126; x += 6.5) {
    solidBlock(b, { x: x + 3, z: -12, w: 6.2, d: 8, height: 5, wallMaterial: 'wood', facade: { floors: 1, floorHeight: 3, seed: Math.round(x), faces: ['S'] } });
    shopFront(b, { x: x + 3, z: ARCADE.z0 + 0.02, rot: 0, w: 5.6, name: ['居酒屋', '焼鳥', 'おでん', '酒場'][Math.floor((x - 100) / 6.5) % 4]!, sub: 'IZAKAYA', color: '#3a1a12', shutter: 'up', noren: '酒', lit: rng.f() < 0.3 });
  }
  lanternString(c, { x0: 100, z0: -7.2, x1: 126, z1: -7.2, y: 3.2, lit: 0.35, seed: 71 });
  const apt = storeyBuilding(c, {
    name: 'Sakuragi Heights',
    x0: 100,
    z0: ARCADE.z1,
    x1: 124,
    z1: 8,
    storeys: 4,
    roofAccess: true,
    wall: 'concreteWall',
    floor: 'concreteSlab',
    stair: { x: 121, z: 5.5, dx: -1, dz: 0 },
    doors: { N: [{ at: 4, width: 2.2 }] },
    windowEvery: 3,
    broken: 0.45,
    tag: 'apartments',
  });
  void apt;
  signBoard(b, { x: 112, z: ARCADE.z1 - 0.12, y: 3.2, rot: Math.PI, w: 6, h: 0.8, text: '桜木ハイツ', sign: { bg: '#e8e4dc', fg: '#2a2a2a', sub: 'SAKURAGI HEIGHTS' } });
  ivy(b, { x: 104, z: ARCADE.z1 - 0.1, rot: Math.PI, w: 6, h: 12 });
  vendingMachine(b, { x: 98.5, z: -2.2, rot: Math.PI, color: 'red', dead: false, seed: 7 });
  d.station({ kind: 'buy', name: 'IZAKAYA ROW', x: 90, z: -4.5, yaw: yawFacing(0, 1), region: 'medium' });

  // ---- gameplay ----
  d.crate(-110, -4.5, 0.2, 'low');
  d.crate(-34, -6, 1.4, 'low');
  d.crate(52, -6.5, 0.6, 'medium');
  d.crate(120, -4.4, 0, 'medium');
  d.spawn('low', 'general', [[-126, -4], [-36, -12], [-36, 4]], 1);
  d.spawn('medium', 'general', [[-16, -12], [60, 4], [80, -14], [126, -4], [20, 6]], 1);
  d.zombies('low', 'shambler', [[-118, -4], [-100, -5], [-82, -3], [-64, -6], [-46, -4]]);
  d.zombies('medium', 'shambler', [[-10, -4], [14, -3], [24, -6], [44, -4], [62, -5], [86, -4], [110, -5]]);
  d.zombies('medium', 'runner', [[0, -5], [40, -2.5], [96, -6]]);
  return { vipRoom, karaokeAreas: karaoke.areas };
}
