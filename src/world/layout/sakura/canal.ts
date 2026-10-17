/**
 * The Kawabata Canal and the shrine (south-east, MEDIUM threat), where the relay is held. Before: the canal of cherry
 * trees the district was famous for, the Hanami festival's stalls along it, the old shrine on its rise with the
 * thousand-year sacred cherry. During: the festival crowd was where it spread; the priest took in families and tied
 * omamori to every fence. Now: boats sunk in the canal, the camp collapsed under the trees, the charms faded, and the
 * sacred tree dead and grey among the pink ones. The army's relay still stands in the shrine's courtyard.
 */
import * as THREE from 'three';
import { transmitterSite, type TransmitterHandle } from '../../landmarks';
import { corpse, crateGroup, debris, sandbagWall, tent } from '../../props';
import { addBox, groundRect } from '../../structures';
import { yawFacing } from '../data';
import { stairwellDown } from '../storeys';
import type { Ctx } from '../util';
import { CANAL, SITES, ZONES } from './consts';
import { MAT, bicycle, cherryTree, grass, groundWords, jpSignMaterial, lanternString, nobori, omamoriFence, petals, sacredTree, shrineHall, signBoard, stoneLantern, tarpCamp, torii } from './props';

/** The canal's metro stairwell on the avenue's south side, its doorway facing north onto Sakura-dori. */
export const CANAL_KIOSK = { x: 52, z: 22.5, yaw: Math.PI };

/** The canal water: one material, so the Easter egg can make it glow. */
export const CANAL_WATER = new THREE.MeshStandardMaterial({ color: 0x1a2826, roughness: 0.12, metalness: 0.35, emissive: 0x000000, emissiveIntensity: 1 });

export interface CanalInfo {
  transmitter: TransmitterHandle;
  /** The five stone lanterns round the courtyard, in the order the haiku names them (`sakura/egg.ts`). */
  lanterns: { x: number; z: number }[];
  /** Where the hall's bell rope hangs. */
  bell: { x: number; z: number };
  sacredTree: { x: number; z: number };
  /** A sunken boat in the canal (an Easter egg spot). */
  boat: { x: number; z: number };
}

const BRIDGES = [
  { x: 4, w: 6, name: '西橋' },
  { x: 60, w: 6, name: '東橋' },
];

export function buildCanal(c: Ctx, metro: { area: number; x: number; z: number; yaw: number }): CanalInfo {
  const { b, d, rng } = c;
  const C = CANAL;

  // ---- the canal: water down between stone banks, two bridges, railings along both banks ----
  const water = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0, C.z1 - C.z0), CANAL_WATER);
  water.rotation.x = -Math.PI / 2;
  water.position.set((C.x0 + C.x1) / 2, C.waterY, (C.z0 + C.z1) / 2);
  b.addDynamic(water);
  const bankH = -C.waterY + 0.25;
  addBox(b, MAT.stone(), (C.x0 + C.x1) / 2, C.waterY - 0.6, (C.z0 + C.z1) / 2, C.x1 - C.x0, 0.2, C.z1 - C.z0); // the bed
  for (const z of [C.z0, C.z1]) addBox(b, MAT.stoneDark(), (C.x0 + C.x1) / 2, -bankH / 2 + 0.25, z, C.x1 - C.x0 + 0.6, bankH, 0.5);
  for (const x of [C.x0, C.x1]) addBox(b, MAT.stoneDark(), x, -bankH / 2 + 0.25, (C.z0 + C.z1) / 2, 0.5, bankH, C.z1 - C.z0);
  const gaps = BRIDGES.map((br) => [br.x - br.w / 2, br.x + br.w / 2] as const);
  for (const z of [C.z0 - 0.15, C.z1 + 0.15]) {
    let x = C.x0;
    for (const [g0, g1] of [...gaps, [C.x1, C.x1] as const]) {
      if (g0 > x) {
        addBox(b, MAT.stoneDark(), (x + g0) / 2, 0.45, z, g0 - x, 0.9, 0.3);
        b.collide({ x: (x + g0) / 2, z, hx: (g0 - x) / 2, hz: 0.2, y1: 0.9, blocksShots: false, mapKind: 'wall', tag: 'canal-rail', surface: 'concrete' });
      }
      x = g1;
    }
  }
  for (const x of [C.x0 - 0.15, C.x1 + 0.15]) b.collide({ x, z: (C.z0 + C.z1) / 2, hx: 0.2, hz: (C.z1 - C.z0) / 2 + 0.3, y1: 0.9, blocksShots: false, mapKind: 'wall', tag: 'canal-rail' });
  // the water itself: nobody wades in (the boat's charm is reached from the bank)
  b.collide({ x: (C.x0 + C.x1) / 2, z: (C.z0 + C.z1) / 2, hx: (C.x1 - C.x0) / 2, hz: (C.z1 - C.z0) / 2, y0: -3, y1: 0.6, blocksShots: false, mapKind: 'none', tag: 'canal-water' });
  // the bridges: an arched deck, vermilion rails; walked level with the street
  for (const br of BRIDGES) {
    const g = new THREE.Group();
    const span = C.z1 - C.z0 + 1;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(br.w, 0.3, span), MAT.woodDark());
    deck.position.y = -0.1;
    g.add(deck);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 0.35, 6, 16, Math.PI), MAT.stoneDark());
    arch.rotation.y = Math.PI / 2;
    arch.position.y = -span / 2 + 0.1;
    arch.scale.set(1, 0.4, 1);
    g.add(arch);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, span), MAT.vermilion());
      rail.position.set((s * br.w) / 2, 0.95, 0);
      g.add(rail);
      for (let k = 0; k <= 5; k++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), MAT.vermilion());
        post.position.set((s * br.w) / 2, 0.5, -span / 2 + (span * k) / 5);
        g.add(post);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), std2());
        cap.position.set((s * br.w) / 2, 1.05, -span / 2 + (span * k) / 5);
        g.add(cap);
      }
      b.collide({ x: br.x + (s * br.w) / 2, z: (C.z0 + C.z1) / 2, hx: 0.12, hz: span / 2, y1: 1.0, blocksShots: false, mapKind: 'wall', tag: 'bridge-rail' });
    }
    g.position.set(br.x, 0, (C.z0 + C.z1) / 2);
    g.updateMatrixWorld(true);
    b.add(g);
    signBoard(b, { x: br.x - br.w / 2 - 0.2, z: C.z0 - 0.6, y: 1.2, rot: 0, w: 0.4, h: 1.2, text: br.name, sign: { vertical: true, bg: '#3a2a1a', fg: '#e8dcc0' } });
  }
  // sunken boats, a bicycle in the water, petals floating
  const boat = { x: 34, z: 33.5 };
  for (const [x, z, r] of [[boat.x, boat.z, 0.3], [-4, 32, -0.2], [48, 35, 0.1]] as const) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 1.6), MAT.woodDark());
    hull.position.set(x, C.waterY + 0.1, z);
    hull.rotation.set(0.25, r, 0.15);
    hull.updateMatrixWorld(true);
    b.add(hull);
  }
  bicycle(b, { x: 20, z: 31.5, y: C.waterY - 0.2, rot: 0.8, fallen: true });
  // the promenade along the north bank: cherry trees, paper lanterns, benches
  for (let x = C.x0 + 3; x < C.x1 - 2; x += 9 + rng.f() * 3) {
    if (BRIDGES.some((br) => Math.abs(x - br.x) < br.w / 2 + 2) || Math.abs(x - CANAL_KIOSK.x) < 4.5) continue;
    cherryTree(c, { x, z: 26 + rng.f() * 1.2, scale: 1 + rng.f() * 0.35, rot: rng.f() * 6 });
    petals(b, { x, z: 27, r: 4 });
  }
  lanternString(c, { x0: C.x0 + 1, z0: 28.6, x1: C.x1 - 1, z1: 28.6, y: 3.4, lit: 0.18, seed: 81 });
  grass(c, { x0: ZONES.canal.x0, z0: 20.4, x1: C.x1, z1: 29.6, density: 0.18, seed: 301, avoid: (x, z) => x > CANAL_KIOSK.x - 3 && x < CANAL_KIOSK.x + 3 && z > 21 && z < 29 });
  stairwellDown(c, CANAL_KIOSK, metro, { sign: jpSignMaterial('地下鉄', { bg: '#1a3a8a', fg: '#ffffff', aspect: 4.8, sub: 'METRO', worn: 0.6 }) });

  // ---- the park on the south bank: the grove, the festival's last night, the families' camp ----
  const parkX1 = 74;
  groundRect(b, 'grass', ZONES.canal.x0, 37.6, parkX1, ZONES.canal.z1, 0.022);
  // two lanes kept open through the grove (from each bridge south), and the trees between them
  const lane = (x: number, z: number): boolean => BRIDGES.some((br) => Math.abs(x - br.x) < 4) || Math.abs(z - 52) < 2.5;
  for (let i = 0; i < 46; i++) {
    const x = ZONES.canal.x0 + 3 + rng.f() * (parkX1 - ZONES.canal.x0 - 6);
    const z = 41 + rng.f() * 22;
    if (lane(x, z)) continue;
    if (!c.placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + 3)) continue;
    const s = 0.9 + rng.f() * 0.5;
    cherryTree(c, { x, z, scale: s, rot: rng.f() * 6 });
    if (i % 2 === 0) petals(b, { x, z, r: 3.5 * s });
  }
  for (const br of BRIDGES) groundRect(b, 'gravel', br.x - 1.8, 37.6, br.x + 1.8, 64, 0.03);
  groundRect(b, 'gravel', ZONES.canal.x0, 50.5, parkX1, 53.5, 0.031);
  grass(c, { x0: ZONES.canal.x0, z0: 38, x1: parkX1, z1: 65.5, density: 0.22, seed: 307, avoid: lane });
  // the festival: yatai stalls fallen in, banners, a lantern string sagging over the path
  for (const [x, z, name] of [[14, 48, 'たこ焼き'], [24, 55, '金魚すくい'], [40, 48, 'わたあめ'], [50, 56, '焼きそば']] as const) {
    addBox(b, MAT.woodLight(), x, 0.5, z, 2.6, 1.0, 1.4);
    const roof = addBox(b, 'canvasTan', x, 2.1, z + 0.2, 3.0, 0.08, 1.9);
    roof.rotation.z = (rng.f() - 0.5) * 0.6;
    roof.updateMatrixWorld(true);
    signBoard(b, { x, z: z - 0.72, y: 1.4, rot: Math.PI, w: 2.4, h: 0.5, text: name, sign: { bg: '#e83a2a', fg: '#fff4d0', worn: 0.9 } });
    b.collideBox(x, z, 2.6, 1.4, 1.0, { mapKind: 'prop', tag: 'yatai', surface: 'wood' });
  }
  nobori(b, { x: 10, z: 53.8, text: '花見祭', color: '#c8323a' });
  nobori(b, { x: 30, z: 53.8, text: '花見祭', color: '#c8323a', torn: true });
  nobori(b, { x: 46, z: 50.2, text: '川端', color: '#2a4a8a' });
  lanternString(c, { x0: -14, z0: 52, x1: 72, z1: 52, y: 3.6, lit: 0.1, seed: 83 });
  // the families' camp under the trees
  tarpCamp(b, { x: -8, z: 58, rot: 0.4, seed: 6 });
  tarpCamp(b, { x: 22, z: 61, rot: -0.2, seed: 7 });
  tarpCamp(b, { x: 54, z: 61, rot: 0.1, seed: 8 });
  tent(b, { x: 66, z: 44, rot: 0.3, kind: 'small', w: 3.6, d: 3 });
  for (const [x, z] of [[-6, 47], [28, 44], [62, 58]] as const) corpse(b, { x, z, rot: rng.f() * 6, kind: 'civilian', seed: Math.round(x + z) });
  omamoriFence(c, { x0: -16, z0: 38.5, x1: -2, z1: 38.5, seed: 1 });
  omamoriFence(c, { x0: 10, z0: 38.5, x1: 56, z1: 38.5, seed: 2 });
  groundWords(b, { x: 28, z: 59, w: 9, h: 2.4, text: '子供たちを守れ', color: '#e0d8c8' });
  debris(b, { x: 34, z: 46, radius: 6, density: 0.45, seed: 31 });

  // ---- the shrine: the torii from the avenue, the courtyard (the relay), the hall, the sacred tree ----
  const D = SITES.defense;
  torii(b, { x: 90, z: 22, rot: 0, scale: 1.3, weathered: true });
  torii(b, { x: 90, z: 33, rot: 0, scale: 1.0, weathered: true });
  groundRect(b, 'gravel', 86.5, 20.5, 93.5, 40, 0.03);
  const ring = new THREE.Mesh(new THREE.CircleGeometry(D.radius + 1.5, 48), b.mats.get('gravel'));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(D.x, 0.028, D.z);
  b.addDynamic(ring);
  const transmitter = transmitterSite(b, { x: D.x, z: D.z, rot: 0, radius: D.radius });
  // the hall facing west over the courtyard
  const hall = shrineHall(b, { x: 121, z: D.z, rot: -Math.PI / 2, w: 8, d: 7 });
  // the five stone lanterns round the courtyard (the order the haiku gives is `lanterns`)
  const lanterns = [
    { x: 86, z: 40 },
    { x: 100, z: 65 },
    { x: 114, z: 37 },
    { x: 86, z: 60 },
    { x: 114, z: 63 },
  ];
  for (const l of lanterns) stoneLantern(b, { x: l.x, z: l.z, rot: yawFacing(D.x - l.x, D.z - l.z) });
  stoneLantern(b, { x: 88, z: 27, toppled: true });
  // the sacred tree, dead
  const tree = { x: 112, z: 62.5 };
  sacredTree(c, { x: tree.x, z: tree.z });
  signBoard(b, { x: 107.5, z: 64.6, y: 1, rot: Math.PI, w: 2.6, h: 1, text: '御神木', sign: { bg: '#3a2a1a', fg: '#e8dcc0', sub: 'SACRED TREE - 1000 YEARS', worn: 0.85 } });
  // charms on every fence round the courtyard; the army's sandbags at its mouth
  omamoriFence(c, { x0: 80, z0: 41, x1: 80, z1: 62, seed: 3 });
  omamoriFence(c, { x0: 80, z0: 65, x1: 125, z1: 65, seed: 4 });
  omamoriFence(c, { x0: 96, z0: 33, x1: 125, z1: 33, seed: 5 });
  sandbagWall(b, { x0: 84, z0: 36, x1: 88, z1: 36, height: 1.1 });
  sandbagWall(b, { x0: 92, z0: 36, x1: 95, z1: 36, height: 1.1 });
  crateGroup(b, { x: 118, z: 37, count: 4, radius: 1.8, kind: 'mil', seed: 91 });
  // the bell tower in the corner
  {
    const g = new THREE.Group();
    for (const [px, pz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]] as const) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, 0.25), MAT.woodDark());
      p.position.set(px, 2.1, pz);
      g.add(p);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.4, 4), MAT.tileRoof());
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 4.9;
    g.add(roof);
    const bellM = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.6, 14), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.4, metalness: 0.8 }));
    bellM.position.y = 3.1;
    g.add(bellM);
    g.position.set(122, 0, 39);
    g.updateMatrixWorld(true);
    b.add(g);
    b.collideBox(122, 39, 3, 3, 4.2, { blocksMove: false, mapKind: 'prop', tag: 'bell-tower' });
    for (const [px, pz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]] as const) b.collideBox(122 + px, 39 + pz, 0.3, 0.3, 4.2, { mapKind: 'prop', tag: 'bell-post', surface: 'wood' });
  }
  // the shrine's cherry trees, behind the hall and along the fences
  for (const [x, z, s] of [[124, 26, 1.2], [104, 25, 1.1], [126, 58, 1.0], [82, 27, 0.9]] as const) {
    cherryTree(c, { x, z, scale: s, rot: rng.f() * 6 });
    petals(b, { x, z, r: 3.6 * s });
  }
  grass(c, { x0: 75, z0: 20.4, x1: 127, z1: 65.5, density: 0.12, seed: 311, avoid: (x, z) => Math.hypot(x - D.x, z - D.z) < D.radius + 2 || (x > 86 && x < 94 && z < 40) });

  // ---- gameplay ----
  d.station({ kind: 'upgrade', name: 'SHRINE FORGE', x: 116, z: 36, yaw: yawFacing(-1, 0.3), region: 'medium' });
  d.crate(-12, 44, 0.3, 'medium');
  d.crate(44, 62, 1.1, 'medium');
  d.crate(124, 46, -0.4, 'medium');
  d.crate(70, 24, 0.2, 'medium');
  d.spawn('medium', 'general', [[-16, 64], [30, 64], [72, 64], [126, 22], [-16, 22]], 1);
  d.spawn('medium', 'defense', [[78, 64], [126, 64], [126, 24], [78, 24], [84, 44], [120, 58]], 1);
  d.zombies('medium', 'shambler', [[0, 45], [16, 58], [36, 50], [52, 44], [66, 60], [-10, 26], [30, 25], [96, 28], [118, 60]]);
  d.zombies('medium', 'runner', [[24, 46], [60, 53], [108, 40]]);
  d.zombies('medium', 'armored', [[44, 59]]);
  return { transmitter, lanterns, bell: hall.bell, sacredTree: tree, boat };
}

function std2(): THREE.Material {
  return MAT.blackLacquer();
}
