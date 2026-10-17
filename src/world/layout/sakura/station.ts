/**
 * Sakuragi Station (south-west, LOW threat), where Hanabi unit comes in. Before: a two-track commuter station, a plaza,
 * a taxi rank, the bike park. During: evacuation point 3 - the police parked a train across the tracks and chained its
 * doors, the families waited on the platform with their luggage for trains that never came. Now: the luggage is still
 * there under the moss, a cherry tree grows out of the train's roof, and the metro stairs lead down into the dark.
 */
import { corpse, crateGroup, debris, sandbagWall, tent, vehicle, bench, busShelter } from '../../props';
import { addBox, building, groundDecal, groundRect } from '../../structures';
import { yawFacing } from '../data';
import { stairwellDown } from '../storeys';
import type { Ctx } from '../util';
import { SITES, ZONES } from './consts';
import { bicycle, cherryTree, commuterCar, grass, groundWords, ivy, jpSignMaterial, luggagePile, petals, rails, signBoard, tarpCamp, wallWords } from './props';

/** The station's metro stairwell (the kiosk on the plaza): its doorway, facing north onto the plaza. */
export const STATION_KIOSK = { x: -74, z: 36, yaw: Math.PI };

export function buildStation(c: Ctx, metro: { area: number; x: number; z: number; yaw: number }): void {
  const { b, d, rng } = c;
  const Z = ZONES.station;

  // ---- the tracks and the platform along the south ----
  rails(c, { x0: Z.x0, z0: 57.5, x1: Z.x1, z1: 57.5 });
  rails(c, { x0: Z.x0, z0: 62.5, x1: Z.x1, z1: 62.5 });
  groundRect(b, 'gravel', Z.x0, 55.5, Z.x1, Z.z1, 0.025);
  // the platform: a long slab, the yellow tactile line along its edge
  groundRect(b, 'concreteSlab', -124, 50, -40, 55.4, 0.06);
  groundRect(b, 'paintYellow', -124, 54.8, -40, 55.2, 0.07);
  grass(c, { x0: Z.x0, z0: 56, x1: Z.x1, z1: Z.z1 - 0.5, density: 0.9, seed: 101 });
  // the platform canopy: posts and a long roof, half fallen in
  for (let x = -120; x <= -44; x += 8) {
    addBox(b, 'steelDark', x, 2.2, 52.6, 0.22, 4.4, 0.22);
    b.collideBox(x, 52.6, 0.3, 0.3, 4.4, { mapKind: 'prop', tag: 'canopy-post', surface: 'metal' });
  }
  addBox(b, 'corrugated', -100, 4.5, 52.6, 42, 0.12, 4.6);
  const fallen = addBox(b, 'corrugatedRust', -62, 2.4, 52.8, 30, 0.12, 4.4);
  fallen.rotation.x = 0.0;
  fallen.rotation.z = 0.18;
  fallen.updateMatrixWorld(true);
  // the police wall: a commuter car stood across both tracks at the east end, doors chained
  commuterCar(b, { x: -36, z: 60, rot: 0, len: 12, doorsChained: true });
  // a train that never left, on track 1, a cherry tree grown up through its roof
  commuterCar(b, { x: -96, z: 57.5, rot: Math.PI / 2, len: 22, doorsChained: true });
  cherryTree(c, { x: -96, z: 57.5, y: 1.6, scale: 1.25, collide: false });
  petals(b, { x: -96, z: 54, r: 5 });
  // the departure board, frozen at the last train
  signBoard(b, { x: -100, z: 50.2, y: 3.1, rot: Math.PI, w: 3.2, h: 0.9, text: '最終 21:47 各駅停車', sign: { bg: '#101418', fg: '#ffb040', glow: 0.25, sub: 'LAST TRAIN 21:47  —  DELAYED' } });
  // the families who waited: luggage under moss, bedrolls along the platform, the dead
  luggagePile(b, { x: -110, z: 52.5, r: 2.4, count: 16, seed: 3 });
  luggagePile(b, { x: -84, z: 53, r: 2, count: 12, seed: 7 });
  luggagePile(b, { x: -64, z: 52, r: 2.2, count: 14, seed: 11 });
  luggagePile(b, { x: -52, z: 53, r: 1.6, count: 9, seed: 13 });
  for (const [x, z, k] of [[-116, 51.5, 'civilian'], [-74, 53.8, 'civilian'], [-58, 51.2, 'bodybag'], [-46, 53.6, 'bodybag']] as const) corpse(b, { x, z, rot: rng.f() * 6, kind: k, seed: Math.round(x) });

  // ---- the station building: the ticket hall, sandbagged doors, ivy over everything ----
  const hall = building(b, {
    x: -102,
    z: 45,
    w: 30,
    d: 9,
    height: 5.5,
    wallMaterial: 'plaster',
    roofMaterial: 'roof',
    floorMaterial: 'tile',
    sides: {
      N: { openings: [{ at: 8, width: 3.2, height: 3, kind: 'door' }, { at: 22, width: 3.2, height: 3, kind: 'door' }, { at: 15, width: 2.6, height: 1.6, sill: 1.2, kind: 'window' }] },
      S: { openings: [{ at: 15, width: 4, height: 3, kind: 'door' }] },
    },
    tag: 'station-hall',
  });
  void hall;
  signBoard(b, { x: -102, z: 40.4, y: 6.2, rot: Math.PI, w: 9, h: 1.3, text: '桜木駅', sign: { bg: '#f2f0ea', fg: '#1a2a5a', sub: 'SAKURAGI STATION', worn: 0.7 } });
  ivy(b, { x: -112, z: 40.45, rot: Math.PI, w: 6, h: 5.4 });
  ivy(b, { x: -90, z: 40.45, rot: Math.PI, w: 4, h: 4.2 });
  sandbagWall(b, { x0: -97.5, z0: 39, x1: -92.5, z1: 39, height: 1.1 });
  sandbagWall(b, { x0: -111.5, z0: 39, x1: -106.5, z1: 39, height: 1.1 });
  // inside: the ticket gates welded shut, benches, a mystery box
  for (let x = -108; x <= -96; x += 2) {
    addBox(b, 'steel', x, 0.55, 47.2, 0.3, 1.1, 1.4);
    b.collideBox(x, 47.2, 0.3, 1.4, 1.1, { mapKind: 'prop', tag: 'ticket-gate', surface: 'metal' });
  }
  d.crate(-112, 43, yawFacing(1, 0), 'low');

  // ---- the plaza: evacuation point 3 ----
  groundRect(b, 'concreteSlab', -128, 22, -60, 40, 0.03);
  const evac = jpSignMaterial('第三避難所', { bg: '#1a5a2a', fg: '#ffffff', aspect: 4.2, sub: 'EVACUATION POINT 3', worn: 0.85 });
  for (const x of [-116, -88]) {
    addBox(b, 'steelDark', x, 2.6, 34, 0.18, 5.2, 0.18);
    b.collideBox(x, 34, 0.3, 0.3, 5.2, { mapKind: 'prop', tag: 'banner-post', surface: 'metal' });
  }
  const banner = addBox(b, evac, -102, 4.6, 34, 26, 1.6, 0.05);
  void banner;
  tent(b, { x: -116, z: 27, rot: 0, kind: 'medical', w: 7, d: 4.6 });
  tent(b, { x: -82, z: 26, rot: 0.1, kind: 'small', w: 4, d: 3 });
  tarpCamp(b, { x: -94, z: 37, rot: 0.2, seed: 1 });
  tarpCamp(b, { x: -70, z: 25, rot: -0.3, seed: 2 });
  crateGroup(b, { x: -122, z: 37, count: 5, radius: 2, kind: 'mil', seed: 41 });
  groundWords(b, { x: -100, z: 25, w: 10, h: 2.6, text: '待て 救助は来る', color: '#d8d0b0' });
  wallWords(b, { x: -102, y: 2.4, z: 40.42, rot: Math.PI, w: 8, h: 1.6, text: 'NO TRAINS\n電車は来ない', color: '#c83a2a', drip: true });
  bench(b, { x: -84, z: 38, rot: Math.PI });
  busShelter(b, { x: -66, z: 22.5, rot: 0 });
  // the taxi rank: three cabs, grown over
  for (const [x, rot] of [[-120, 0.05], [-112, -0.1], [-104, 0.2]] as const) vehicle(b, { x, z: 23.5, rot: Math.PI / 2 + rot, kind: 'sedan', paint: 'yellow', wrecked: true, doorsOpen: rng.f() < 0.5, seed: Math.round(-x) });
  // cherry trees across the plaza
  for (const [x, z, s] of [[-124, 30, 1.2], [-90, 31, 1.0], [-66, 34, 1.3], [-78, 23, 0.9]] as const) {
    cherryTree(c, { x, z, scale: s, rot: rng.f() * 6 });
    petals(b, { x, z, r: 3.5 * s });
  }
  grass(c, { x0: -128, z0: 22, x1: -60, z1: 40, density: 0.08, seed: 103, avoid: (x, z) => Math.hypot(x - SITES.start.x, z - SITES.start.z) < 4 });
  debris(b, { x: -86, z: 30, radius: 4, density: 0.6, seed: 9 });

  // ---- the metro stairwell kiosk on the plaza ----
  stairwellDown(c, STATION_KIOSK, metro, { sign: jpSignMaterial('地下鉄', { bg: '#1a3a8a', fg: '#ffffff', aspect: 4.8, sub: 'METRO', worn: 0.6 }) });

  // ---- the bike park: rows of bicycles, most fallen, under a rusted shelter ----
  groundRect(b, 'asphalt', -58, 24, -32, 48, 0.025);
  for (let row = 0; row < 4; row++) {
    const z = 27 + row * 5.6;
    addBox(b, 'corrugatedRust', -45, 2.3, z, 24, 0.08, 2.4);
    for (const x of [-56, -34]) {
      addBox(b, 'steelDark', x, 1.15, z, 0.12, 2.3, 0.12);
      b.collideBox(x, z, 0.2, 0.2, 2.3, { mapKind: 'prop', tag: 'shelter-post', surface: 'metal' });
    }
    for (let x = -56; x < -34; x += 0.9) {
      if (rng.f() < 0.25) continue;
      bicycle(b, { x, z: z + (rng.f() - 0.5) * 0.4, rot: Math.PI / 2 + (rng.f() - 0.5) * 0.3, fallen: rng.f() < 0.55, color: [0x2a4a6a, 0x8a2a2a, 0xd8d8d8, 0x3a6a3a, 0x2a2a2a][Math.floor(rng.f() * 5)] });
    }
  }
  grass(c, { x0: -58, z0: 24, x1: -32, z1: 48, density: 0.25, seed: 107 });
  groundDecal(b, 'bloodOld1', -44, 41, 2.4, 2.4, 0.4);

  // ---- gameplay: shops, crates, spawns, the start's resident infected ----
  d.station({ kind: 'buy', name: 'STATION KIOSK', x: -88, z: 24, yaw: yawFacing(0, 1), region: 'low' });
  d.crate(-60, 46, 0.3, 'low');
  d.crate(-122, 49, 0, 'low');
  d.spawn('low', 'general', [[-124, 64], [-34, 64], [-50, 22], [-64, 48], [-36, 36]], 1);
  d.zombies('low', 'shambler', [[-112, 53], [-88, 52.5], [-72, 54], [-56, 52], [-48, 40], [-40, 28], [-70, 44]]);
  d.zombies('low', 'runner', [[-44, 53], [-120, 46]]);
}
