/**
 * Kisaragi Station: the stop on no line (built far south of everything, out of sight; `UNDER.kisaragi`). After the
 * bloom a ghost train waits at Sakuragi's platform and brings you here: one lonely platform under the blood moon, a
 * wooden station house, a path through the long grass to a torii and the Blossom Altar under a great tree, and two
 * stone plinths where the shrine's relics wait (`sakura/runtime.ts` puts them there). The train takes you back.
 */
import { addBox, groundRect } from '../../structures';
import type { FloorLink } from '../../floors';
import type { Ctx } from '../util';
import { UNDER } from './consts';
import { MAT, cherryTree, commuterCar, grass, petals, rails, signBoard, stoneLantern, torii } from './props';

export interface KisaragiInfo {
  area: number;
  /** The ghost train's link (street <-> Kisaragi): closed until the bloom, taken by boarding (an interaction). */
  link: FloorLink;
  /** Where you board on Sakuragi's platform (the ghost train stands on track 1 beside it), and here. */
  boardStreet: { x: number; z: number };
  boardHere: { x: number; z: number };
  /** The ghost train on Sakuragi's track (drawn only in the bloom). */
  ghost: { x: number; z: number };
  /** The two relic plinths (Hanafubuki, Raijin's Drum) and the Blossom Altar. */
  plinths: { x: number; z: number }[];
  altar: { x: number; z: number };
}

const K = { x0: -34, z0: 228, x1: 34, z1: 262 };

export function buildKisaragi(c: Ctx): KisaragiInfo {
  const { b, floors } = c;
  const U = UNDER.kisaragi;
  const area = floors.addArea('Kisaragi', 'under', 0, { minX: U.x0, maxX: U.x1, minZ: U.z0, maxZ: U.z1 });

  // ---- the ground: long grass to the dark, the platform, one track ----
  groundRect(b, 'gravel', K.x0 - 30, K.z0 - 20, K.x1 + 30, K.z1 + 20, 0.01);
  grass(c, { x0: K.x0, z0: K.z0, x1: K.x1, z1: 246, density: 1.2, seed: 901, avoid: (x) => Math.abs(x) < 1.6 });
  groundRect(b, 'concreteSlab', -30, 248, 30, 253.4, 0.06);
  groundRect(b, 'paintYellow', -30, 252.8, 30, 253.2, 0.07);
  rails(c, { x0: K.x0 - 30, z0: 256, x1: K.x1 + 30, z1: 256 });
  // the edge of the world: nobody walks past the grass (rock, not drawn) and the hills close it in
  for (const [x0, z0, x1, z1] of [
    [K.x0 - 2, K.z0 - 2, K.x1 + 2, K.z0],
    [K.x0 - 2, 254.2, K.x1 + 2, K.z1 + 2],
    [K.x0 - 2, K.z0, K.x0, 254.2],
    [K.x1, K.z0, K.x1 + 2, 254.2],
  ] as const) b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y1: 6, mapKind: 'none', tag: 'kisaragi-edge' });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const hill = addBox(b, MAT.stoneDark(), Math.cos(a) * 70, 6, 245 + Math.sin(a) * 46, 40, 16, 22);
    hill.rotation.y = a;
    hill.updateMatrixWorld(true);
  }

  // ---- the station house and its sign ----
  addBox(b, MAT.woodDark(), 0, 1.6, 249.6, 8, 3.2, 3);
  b.collideBox(0, 249.6, 4, 1.5, 3.2, { mapKind: 'building', tag: 'kisaragi-house', surface: 'wood' });
  addBox(b, MAT.woodDark(), 0, 3.35, 249.6, 9, 0.3, 4);
  signBoard(b, { x: 0, z: 247.95, y: 2.4, rot: Math.PI, w: 4.2, h: 0.8, text: 'きさらぎ', sign: { bg: '#f2f0ea', fg: '#1a1a1a', sub: 'KISARAGI', worn: 0.4 } });
  for (const x of [-18, 18]) {
    addBox(b, 'steelDark', x, 1.4, 252.6, 0.12, 2.8, 0.12);
    b.light({ x, y: 2.9, z: 252.6, color: 0xfff0d8, intensity: 14, distance: 10, mode: 'flicker', pool: 2.6, glow: 0.5, tag: 'kisaragi' });
  }
  // the train that brought you, waiting
  commuterCar(b, { x: 6, z: 256, rot: Math.PI / 2, len: 20 });

  // ---- the path to the altar: lanterns, a torii, the great tree ----
  for (let z = 244; z >= 234; z -= 3.4) {
    stoneLantern(b, { x: -2.2, z, lit: true, scale: 0.8 });
    stoneLantern(b, { x: 2.2, z, lit: true, scale: 0.8 });
  }
  torii(b, { x: 0, z: 240, rot: 0, scale: 1.1 });
  cherryTree(c, { x: 0, z: 229.6, scale: 2.6, rot: 0.4 });
  petals(b, { x: 0, z: 231, r: 7 });
  const altar = { x: 0, z: 233.4 };
  addBox(b, MAT.blackLacquer(), altar.x, 0.5, altar.z, 3, 1, 1.4);
  b.collideBox(altar.x, altar.z, 1.5, 0.7, 1, { mapKind: 'prop', tag: 'blossom-altar', surface: 'wood' });
  const plinths = [
    { x: -6, z: 236 },
    { x: 6, z: 236 },
  ];
  for (const p of plinths) {
    addBox(b, MAT.stone(), p.x, 0.5, p.z, 1.2, 1, 1.2);
    b.collideBox(p.x, p.z, 0.6, 0.6, 1, { mapKind: 'prop', tag: 'relic-plinth', surface: 'concrete' });
  }

  // ---- the ghost train: Sakuragi's platform <-> here ----
  const boardStreet = { x: -66, z: 54.2 };
  const boardHere = { x: 10, z: 252.4 };
  const link = floors.addLink(
    area,
    0,
    [
      { x: boardHere.x, y: 0, z: boardHere.z - 2.2 },
      { x: boardHere.x, y: 0, z: boardHere.z },
      { x: boardStreet.x, y: 0, z: boardStreet.z },
      { x: boardStreet.x, y: 0, z: boardStreet.z - 2.2 },
    ],
    true,
    { closed: true, manual: true },
  );
  return { area, link, boardStreet, boardHere, ghost: { x: -66, z: 57.5 }, plinths, altar };
}
