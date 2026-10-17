/**
 * Hilltop School (north-west, LOW threat), where the helicopter comes down. Before: a three-storey high school, a gym,
 * a dirt sports field. During: the official shelter - desks over every window, names on the chalkboards, the gym full
 * of cots; its last broadcast was a song from the PA, on a loop until the power died. Now: the SOS on the field is
 * under tall grass, the rooftop camp has rotted, and the classrooms are where the shelter's people still walk.
 */
import { corpse, crateGroup, debris, utilityPole, sandbagWall, chainlinkFence } from '../../props';
import { helipad } from '../../landmarks';
import { addBox, building, groundRect } from '../../structures';
import { yawFacing } from '../data';
import { storeyBuilding } from '../storeys';
import type { Ctx } from '../util';
import { SITES, ZONES } from './consts';
import { bicycle, cherryTree, deskBarricade, grass, groundWords, ivy, petals, signBoard, tarpCamp, wallWords } from './props';

/** The school's areas: its storeys and roof (`floors.ts`), and the music room on the third floor (an Easter egg spot). */
export interface SchoolInfo {
  areas: number[];
  musicRoom: { x: number; y: number; z: number };
}

export function buildSchool(c: Ctx): SchoolInfo {
  const { b, d, rng } = c;
  const Z = ZONES.school;

  // ---- the school wall along Kita-dori, the gate ----
  for (const [x0, x1] of [[Z.x0, -76], [-68, Z.x1]] as const) {
    addBox(b, 'concreteWall', (x0 + x1) / 2, 1.0, Z.z1 - 0.3, x1 - x0, 2, 0.3);
    b.collideBox((x0 + x1) / 2, Z.z1 - 0.3, x1 - x0, 0.3, 2, { mapKind: 'wall', tag: 'school-wall' });
  }
  signBoard(b, { x: -79.2, z: Z.z1 - 0.1, y: 1.6, rot: 0, w: 0.5, h: 1.8, text: '丘上高等学校', sign: { vertical: true, bg: '#e8e2d2', fg: '#1a1a1a', worn: 0.8 } });
  ivy(b, { x: -100, z: Z.z1 - 0.12, rot: 0, w: 10, h: 2 });
  ivy(b, { x: -45, z: Z.z1 - 0.12, rot: 0, w: 7, h: 2 });

  // ---- the main building: three storeys and the roof, the stairs at its south end ----
  const main = storeyBuilding(c, {
    name: 'Hilltop School',
    x0: -124,
    z0: -64,
    x1: -108,
    z1: -30,
    storeys: 3,
    roofAccess: true,
    wall: 'plaster',
    floor: 'tile',
    trim: 'concreteDark',
    stair: { x: -116, z: -36, dx: 0, dz: -1 },
    doors: { E: [{ at: 6, width: 2.4 }, { at: 22, width: 2.4 }], S: [{ at: 8, width: 2.6 }] },
    windowEvery: 3.4,
    broken: 0.5,
    rooms: [
      // classrooms off a corridor along the west wall, on every storey
      ...[0, 1, 2].flatMap((k) => [
        { storey: k, x0: -119, z0: -64, x1: -119, z1: -42, openings: [{ at: 4, width: 1.4, height: 2.3, kind: 'door' as const }, { at: 14, width: 1.4, height: 2.3, kind: 'door' as const }] },
        { storey: k, x0: -124, z0: -53, x1: -119, z1: -53 },
      ]),
    ],
    tag: 'school',
  });
  signBoard(b, { x: -107.8, z: -47, y: 10.5, rot: Math.PI / 2, w: 8, h: 1.2, text: '丘上高校', sign: { bg: '#e8e2d2', fg: '#203a7a', sub: 'HILLTOP HIGH SCHOOL', worn: 0.8 } });
  ivy(b, { x: -107.8, z: -58, rot: Math.PI / 2, w: 5, h: 8 });
  ivy(b, { x: -107.8, z: -38, rot: Math.PI / 2, w: 4, h: 5 });
  // the shelter: desks over the windows on every storey, names on the walls
  for (let k = 0; k < 3; k++) {
    const y = k * 4;
    deskBarricade(b, { x0: -109, z0: -62, x1: -109, z1: -54, y, height: 1.5, seed: 10 + k, broken: k === 0 });
    deskBarricade(b, { x0: -123, z0: -50, x1: -123, z1: -44, y, height: 1.5, seed: 20 + k });
    wallWords(b, { x: -119.12, y: y + 1.9, z: -58, rot: Math.PI / 2, w: 4, h: 1.4, text: k === 0 ? 'WE ARE HERE\nここにいる' : k === 1 ? '3年B組 全員無事\n(ほぼ)' : 'お母さん ごめんね', color: '#f0ece0' });
  }
  // the music room (third floor, north end): the piano, and the stamped page you need
  const musicRoom = { x: -121.5, y: 8, z: -60 };
  addBox(b, 'paintBlack', -121.5, 8.55, -61.5, 1.6, 1.1, 0.7);
  b.collide({ x: -121.5, z: -61.5, hx: 0.8, hz: 0.35, y0: 8, y1: 9.1, mapKind: 'none', tag: 'piano', surface: 'wood' });
  // the roof: the camp the shelter's last people made, rotted; an SOS in white paint
  tarpCamp(b, { x: -118, z: -52, y: 12, rot: 0, w: 5, d: 3.4, seed: 4 });
  tarpCamp(b, { x: -114, z: -44, y: 12, rot: 1.2, w: 3.6, d: 3, seed: 5 });
  groundWords(b, { x: -116, z: -60, y: 12, w: 7, h: 2.2, text: 'SOS', color: '#f0ece0' });
  // the PA horn, still on its pole by the gate
  utilityPole(b, { x: -82, z: -28, rot: 0, wireTo: [] });
  addBox(b, 'steelDark', -82, 7.2, -28.4, 0.5, 0.5, 0.7);

  // ---- the gym: the shelter's dormitory ----
  building(b, {
    x: -95,
    z: -57,
    w: 18,
    d: 14,
    height: 7,
    wallMaterial: 'plaster',
    roofMaterial: 'roof',
    floorMaterial: 'wood',
    sides: { S: { openings: [{ at: 9, width: 3.4, height: 3.2, kind: 'door' }] }, E: { openings: [{ at: 7, width: 2.4, height: 1.4, sill: 3, kind: 'window' }] } },
    tag: 'gym',
  });
  for (let i = 0; i < 6; i++) {
    const x = -102 + (i % 3) * 5;
    const z = -61 + Math.floor(i / 3) * 5;
    addBox(b, 'canvasOlive', x, 0.4, z, 0.9, 0.08, 2.0);
    addBox(b, 'steelDark', x, 0.2, z, 0.95, 0.4, 2.05);
  }
  corpse(b, { x: -92, z: -60, rot: 1.2, kind: 'bodybag', seed: 1 });
  corpse(b, { x: -90, z: -58.5, rot: 1.4, kind: 'bodybag', seed: 2 });
  d.crate(-100, -52, yawFacing(0, 1), 'low');

  // ---- the sports field: the helipad, the SOS under the grass ----
  groundRect(b, 'dirt', -86, -62, -32, -30, 0.022);
  helipad(b, { x: SITES.lz.x, z: SITES.lz.z, radius: SITES.lz.radius });
  groundWords(b, { x: -46, z: -52, w: 18, h: 7, text: 'SOS', color: '#e8e4d8' });
  grass(c, { x0: -86, z0: -62, x1: -32, z1: -30, density: 0.32, seed: 201, avoid: (x, z) => Math.hypot(x - SITES.lz.x, z - SITES.lz.z) < SITES.lz.radius + 1 || Math.hypot(x - SITES.lz.terminalX, z - SITES.lz.terminalZ) < 2.5 });
  // goalposts, rusted
  for (const x of [-84, -34]) {
    for (const z of [-49, -43]) addBox(b, 'rust', x, 1.2, z, 0.12, 2.4, 0.12);
    addBox(b, 'rust', x, 2.4, -46, 0.12, 0.12, 6.2);
  }
  // the army's chain-link and sandbags round the pad, from the evacuation
  chainlinkFence(b, { x0: -74, z0: -32, x1: -50, z1: -32, height: 2.2, damaged: true, gaps: [{ at: 11, width: 4 }] });
  sandbagWall(b, { x0: -68, z0: -56, x1: -63, z1: -56, height: 1.1 });
  sandbagWall(b, { x0: -56, z0: -56, x1: -52, z1: -54, height: 1.1 });
  crateGroup(b, { x: -40, z: -60, count: 4, radius: 2, kind: 'mil', seed: 51 });
  // the bicycle shed by the wall
  addBox(b, 'corrugatedRust', -42, 2.2, -29, 12, 0.08, 2.6);
  for (let x = -47; x < -37; x += 0.8) bicycle(b, { x, z: -29, rot: Math.PI / 2, fallen: rng.f() < 0.5, color: 0x6a6a6a });
  // cherry trees along the field's edge
  for (const [x, z, s] of [[-88, -32, 1.1], [-34, -62, 1.2], [-36, -36, 1.0], [-104, -34, 1.3], [-126, -28, 1.0]] as const) {
    cherryTree(c, { x, z, scale: s, rot: rng.f() * 6 });
    petals(b, { x, z, r: 3.4 * s });
  }
  debris(b, { x: -70, z: -34, radius: 3, density: 0.5, seed: 21 });

  // ---- gameplay ----
  d.station({ kind: 'upgrade', name: 'SCIENCE LAB BENCH', x: -101, z: -36, yaw: yawFacing(0, 1), region: 'low' });
  d.crate(-110, -28, 0.4, 'low');
  d.crate(-36, -40, 1.2, 'low');
  d.spawn('low', 'general', [[-126, -64], [-80, -64], [-36, -64], [-126, -28]], 1);
  d.spawn('low', 'lz', [[-84, -60], [-36, -60], [-84, -32], [-38, -32], [-60, -62]], 1);
  d.zombies('low', 'shambler', [[-100, -40], [-90, -46], [-72, -52], [-50, -40], [-44, -58], [-80, -36]]);
  d.zombies('low', 'runner', [[-60, -58], [-96, -50]]);
  return { areas: main.areas, musicRoom };
}
