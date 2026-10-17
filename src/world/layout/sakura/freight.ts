/**
 * The freight yard (north-east, HIGH threat). Before: the rail freight yard behind the district. During: the army's
 * evacuation checkpoint - containers stacked into a fort, a list of names for the trains that never came - overrun,
 * then taken by the gang that became the Kurenai Court, who painted it red and watched the yard from the container
 * tops. Now: long lanes between the stacks, blind corners, and the old sniper nests up top.
 */
import { container, corpse, crateGroup, debris, floodlightTower, hescoWall, sandbagWall, watchtower, chainlinkFence, barrelGroup } from '../../props';
import { addBox, groundRect } from '../../structures';
import { straightStairs } from '../storeys';
import type { Ctx } from '../util';
import { CH, CW } from '../util';
import { ZONES } from './consts';
import { cherryTree, grass, petals, rails, signBoard, wallWords } from './props';

export interface FreightInfo {
  /** The two container decks (areas, `floors.ts`) and their centres: where the Court's snipers watch from. */
  decks: { area: number; x: number; z: number; y: number }[];
}

const ROWS = [86, 98, 110, 122];
const DECK_Y = CH * 2;

export function buildFreight(c: Ctx): FreightInfo {
  const { b, d, rng, floors } = c;
  const Z = ZONES.freight;
  groundRect(b, 'concreteSlab', Z.x0, Z.z0, Z.x1, Z.z1, 0.023);
  rails(c, { x0: 104, z0: Z.z1, x1: 104, z1: Z.z0 + 1 });

  // ---- the container lanes, two high ----
  const colors = ['red', 'blue', 'green', 'rust', 'olive', 'white', 'yellow'] as const;
  for (const x of ROWS) {
    for (const z of [-55.5, -40.5]) container(b, { x, z, rot: Math.PI / 2, stack: 2, color: colors[Math.floor(rng.f() * colors.length)], seed: Math.round(x * 7 + z) });
  }
  // the decks on two rows: planks over the gap between the stacks, the Court's nest on each
  const decks: FreightInfo['decks'] = [];
  for (const [x, stair] of [
    [98, { x: 91, z: -42, dx: 1, dz: 0 }],
    [110, { x: 115.7, z: -56, dx: -1, dz: 0 }],
  ] as const) {
    const z0 = -61.6;
    const z1 = -34.4;
    b.collide({ x, z: (z0 + z1) / 2, hx: CW / 2, hz: (z1 - z0) / 2, y0: DECK_Y - 0.18, y1: DECK_Y, floor: true, surface: 'metal', mapKind: 'none', tag: 'container-deck' });
    addBox(b, 'wood', x, DECK_Y + 0.03, -48, CW, 0.06, 3.2); // the planks over the gap
    const area = floors.addArea(`freight deck ${x}`, 'upper', DECK_Y, { minX: x - CW / 2 - 0.6, maxX: x + CW / 2 + 0.6, minZ: z0 - 0.6, maxZ: z1 + 0.6 });
    straightStairs(c, { x: stair.x, z: stair.z, dx: stair.dx, dz: stair.dz, width: 1.3, y0: 0, y1: DECK_Y, lower: 0, upper: area });
    // the nest: sandbags at the north end, a tarp, spent casings
    sandbagWall(b, { x0: x - 1, z0: -59.5, x1: x + 1, z1: -59.5, height: 0.8 });
    for (const s of [-1, 1]) addBox(b, 'sandbag', x + s * 1.0, DECK_Y + 0.4, -58, 0.4, 0.8, 2.6);
    decks.push({ area, x, z: -57, y: DECK_Y });
  }
  // the Court's red paint on the stacks
  wallWords(b, { x: 87.25, y: 3.4, z: -40, rot: Math.PI / 2, w: 9, h: 2.4, text: '紅の宮廷', color: '#b81424', drip: true });
  wallWords(b, { x: 109.75, y: 2.6, z: -55, rot: -Math.PI / 2, w: 8, h: 2, text: '女神は見ている', color: '#b81424', drip: true });
  wallWords(b, { x: 121.75, y: 1.6, z: -42, rot: -Math.PI / 2, w: 7, h: 1.6, text: 'TURN BACK', color: '#b81424', drip: true });

  // ---- the army's checkpoint by the gate, overrun ----
  hescoWall(b, { x0: 79, z0: -48, x1: 79, z1: -44, height: 2 });
  hescoWall(b, { x0: 79, z0: -36, x1: 79, z1: -30, height: 2 });
  sandbagWall(b, { x0: 82, z0: -46, x1: 82, z1: -41, height: 1.2 });
  watchtower(b, { x: 124, z: -62, rot: Math.PI, height: 6 });
  floodlightTower(b, { x: 80, z: -62, rot: 0.5, height: 8, on: false });
  floodlightTower(b, { x: 126, z: -30, rot: -2.4, height: 8, on: false });
  // the list of names for the trains that never came
  addBox(b, 'wood', 92, 1.4, -28.6, 4.2, 2.6, 0.12);
  signBoard(b, { x: 92, z: -28.5, y: 1.5, rot: 0, w: 4, h: 2.4, text: '避難者名簿', sign: { bg: '#e8e4d8', fg: '#1a1a1a', sub: 'EVACUEES  —  PLEASE WAIT FOR YOUR NAME', worn: 0.95 } });
  for (const [x, z] of [[84, -44], [88, -33], [101, -46], [116, -36]] as const) corpse(b, { x, z, rot: rng.f() * 6, kind: rng.f() < 0.6 ? 'soldier' : 'civilian', seed: Math.round(x + z * 3) });
  crateGroup(b, { x: 82, z: -58, count: 5, radius: 2, kind: 'mil', seed: 101 });
  barrelGroup(b, { x: 126, z: -48, count: 4, radius: 1.4, seed: 103 });
  // the yard fence on Kita-dori, its gate
  chainlinkFence(b, { x0: Z.x0, z0: Z.z1 - 0.4, x1: 96, z1: Z.z1 - 0.4, height: 2.6, barbed: true, damaged: true });
  chainlinkFence(b, { x0: 106, z0: Z.z1 - 0.4, x1: Z.x1, z1: Z.z1 - 0.4, height: 2.6, barbed: true });
  // seven springs: grass between the sleepers, a young cherry tree in a lane
  grass(c, { x0: 102, z0: Z.z0 + 1, x1: 106, z1: Z.z1, density: 0.6, seed: 501 });
  grass(c, { x0: Z.x0, z0: Z.z0, x1: Z.x1, z1: Z.z1, density: 0.04, seed: 503 });
  cherryTree(c, { x: 92.5, z: -60, scale: 1.0, rot: 1 });
  petals(b, { x: 92.5, z: -60, r: 3 });
  cherryTree(c, { x: 116, z: -30, scale: 0.9, rot: 2 });
  debris(b, { x: 104, z: -48, radius: 5, density: 0.5, seed: 51 });

  // ---- gameplay ----
  d.crate(92, -50, 0.2, 'high');
  d.crate(126, -58, 1.4, 'high');
  d.crate(116, -45, 0, 'high');
  d.spawn('high', 'general', [[126, -64], [80, -64], [126, -28], [104, -64]], 1.2);
  d.zombies('high', 'shambler', [[92, -36], [104, -40], [104, -58], [116, -50], [92, -56], [126, -40]]);
  d.zombies('high', 'runner', [[104, -30], [116, -62]]);
  d.zombies('high', 'armored', [[84, -38], [104, -48]]);
  return { decks };
}
