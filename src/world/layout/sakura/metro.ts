/**
 * Sakuragi metro station, dressed as a Japanese subway: tiled walls with the Sakura Line's pink stripe, fluorescent
 * strips in the ceiling, hanging yellow exit signs, automatic ticket gates, ticket machines under the fare map, the
 * station office (its lost and found), the platform's pillars with the station nameboard, half-height platform gates,
 * benches, drink machines, the departure board, adverts on the track wall, and a ribbed tunnel with its cables and
 * signals.
 *
 * Its power is out: only the red emergency lamps burn and the strips, boards and screens are dark. Three fuses put it
 * back (`metroPower`): every strip lights, the board shows the next train, the machines glow, the train's windows come
 * on. The walls and floors are `underground.ts`'s; this only dresses them.
 */
import * as THREE from 'three';
import type { LevelBuilder } from '../../builder';
import { addBox } from '../../structures';
import type { Ctx } from '../util';
import { jpSignMaterial, signBoard } from './props';

const CEIL = 4.4;

/** Something that glows with the power: its emissive intensity off and on. */
interface Powered {
  mat: THREE.MeshStandardMaterial;
  off: number;
  on: number;
}

const powered: Powered[] = [];
const mats = new Map<string, THREE.MeshStandardMaterial>();

/** A material that lights with the station's power (shared: one per look, so it batches). */
function lit(key: string, color: number, emissive: number, on: number, off = 0.04, rough = 0.5): THREE.MeshStandardMaterial {
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, emissive, emissiveIntensity: off });
    m.userData.noPalette = true;
    mats.set(key, m);
    powered.push({ mat: m, off, on });
  }
  return m;
}

/** A plain material (shared). */
function plain(key: string, color: number, rough = 0.7, metal = 0): THREE.MeshStandardMaterial {
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    mats.set(key, m);
  }
  return m;
}

/** A canvas texture on a lit material (the nameboards, the fare map, the machines' fronts, the board). */
function canvasMat(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, on = 1.1): THREE.MeshStandardMaterial {
  let m = mats.get(key);
  if (!m) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    draw(g, w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.05 });
    m.userData.noPalette = true;
    mats.set(key, m);
    powered.push({ mat: m, off: 0.05, on });
  }
  return m;
}

const FONT = '"Noto Sans JP", "Yu Gothic", "Meiryo", "Hiragino Sans", sans-serif';

/** The station nameboard (eki-meihyo): the name large, its kanji and romaji, the line's bar with the stops either side. */
function nameboard(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#f6f5f0';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1a1a1a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${h * 0.32}px ${FONT}`;
  g.fillText('さくらぎ', w / 2, h * 0.27);
  g.font = `${h * 0.12}px ${FONT}`;
  g.fillText('桜 木   Sakuragi', w / 2, h * 0.52);
  // the line's bar: pink, the stops either side
  g.fillStyle = '#d8507e';
  g.fillRect(0, h * 0.64, w, h * 0.14);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(w * 0.5 - h * 0.08, h * 0.64);
  g.lineTo(w * 0.5 + h * 0.08, h * 0.71);
  g.lineTo(w * 0.5 - h * 0.08, h * 0.78);
  g.fill();
  g.fillStyle = '#1a1a1a';
  g.font = `${h * 0.1}px ${FONT}`;
  g.textAlign = 'left';
  g.fillText('ひがしまち  Higashimachi', w * 0.04, h * 0.89);
  g.textAlign = 'right';
  g.fillText('Kisaragi  きさらぎ', w * 0.96, h * 0.89);
  g.fillStyle = '#d8507e';
  g.font = `bold ${h * 0.1}px ${FONT}`;
  g.textAlign = 'left';
  g.fillText('SK 07', w * 0.04, h * 0.1);
}

/** The fare map over the ticket machines: the lines in colour, the fares, one station blanked out. */
function fareMap(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#fbfaf6';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#20305a';
  g.font = `bold ${h * 0.1}px ${FONT}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('運賃表   FARES', w * 0.02, h * 0.08);
  const lines: [string, number][] = [
    ['#d8507e', 0.32],
    ['#2f8ad8', 0.55],
    ['#3aa65a', 0.78],
  ];
  const names = ['さくらぎ', 'ひがしまち', 'かわばた', 'しょうてんがい', 'きさらぎ', 'こうえん', 'みなと'];
  for (const [col, y] of lines) {
    g.strokeStyle = col;
    g.lineWidth = h * 0.05;
    g.beginPath();
    g.moveTo(w * 0.04, h * y);
    g.lineTo(w * 0.96, h * y);
    g.stroke();
    for (let i = 0; i < 7; i++) {
      const x = w * (0.08 + i * 0.14);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x, h * y, h * 0.035, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = col;
      g.lineWidth = h * 0.012;
      g.stroke();
      g.fillStyle = '#333';
      g.font = `${h * 0.045}px ${FONT}`;
      g.textAlign = 'center';
      const name = names[(i + Math.round(y * 10)) % names.length]!;
      // the one stop on no line: struck out in red ink
      if (name === 'きさらぎ') {
        g.fillStyle = '#b01020';
        g.fillText(name, x, h * (y - 0.08));
        g.fillRect(x - h * 0.12, h * (y - 0.08), h * 0.24, h * 0.008);
      } else g.fillText(name, x, h * (y - 0.08));
      g.fillStyle = '#555';
      g.fillText(`${150 + i * 30}`, x, h * (y + 0.08));
    }
  }
}

/** A drink machine's front: rows of bottles and cans, prices under them. */
function vendingFront(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#f0f2f4';
  g.fillRect(0, 0, w, h);
  const cols = ['#d8302a', '#2a7ad8', '#f0c020', '#3aa65a', '#ffffff', '#202020', '#e87a20', '#8a3ab0'];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const x = w * (0.08 + c * 0.15);
      const y = h * (0.06 + r * 0.13);
      g.fillStyle = cols[(r * 3 + c * 5) % cols.length]!;
      g.fillRect(x, y, w * 0.09, h * 0.09);
      g.fillStyle = '#ffffff';
      g.fillRect(x + w * 0.02, y + h * 0.02, w * 0.05, h * 0.02);
      g.fillStyle = '#1a1a1a';
      g.font = `${h * 0.025}px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(`${100 + ((r + c) % 4) * 30}`, x + w * 0.045, y + h * 0.11);
    }
  }
  g.fillStyle = '#2a2e34';
  g.fillRect(w * 0.06, h * 0.62, w * 0.88, h * 0.3);
  g.fillStyle = '#9ad0ff';
  g.fillRect(w * 0.7, h * 0.66, w * 0.18, h * 0.06);
}

/** The departure board: amber LEDs on black. */
function departures(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#060606';
  g.fillRect(0, 0, w, h);
  g.textBaseline = 'middle';
  const row = (y: number, a: string, b: string, c: string, col: string): void => {
    g.fillStyle = col;
    g.font = `bold ${h * 0.2}px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(a, w * 0.03, y);
    g.fillText(b, w * 0.24, y);
    g.textAlign = 'right';
    g.fillText(c, w * 0.97, y);
  };
  row(h * 0.28, '各停', '21:47', 'きさらぎ', '#ffa020');
  row(h * 0.72, 'LOCAL', '21:47', 'KISARAGI', '#ff7a10');
}

/** An advert on the track wall (the city before: the festival, the idol, the company). */
const ADS: { text: string; sub: string; bg: string; fg: string }[] = [
  { text: '桜まつり', sub: 'SAKURAGI CHERRY FESTIVAL — THE THOUSAND LANTERNS', bg: '#ffd6e4', fg: '#a01a40' },
  { text: '星野メイ LIVE', sub: 'MEI HOSHINO — ONE NIGHT ONLY — SHOTENGAI', bg: '#2a1a4a', fg: '#ff9ade' },
  { text: '紅製薬', sub: 'KURENAI PHARMACEUTICALS — BLOOM FOREVER', bg: '#f6f2ee', fg: '#a8141e' },
  { text: '紅劇場', sub: 'KURENAI THEATRE — SAYO KURENAI IN “THE LAST SPRING”', bg: '#1a0a0e', fg: '#ff6a7a' },
  { text: '終電 21:47', sub: 'LAST TRAIN 21:47 — DO NOT MISS IT', bg: '#20305a', fg: '#ffffff' },
];

/** Ceiling strips and their lamps along a line (the lamps fail until the power is back). */
function strips(c: Ctx, x0: number, x1: number, z: number, every = 4, lampEvery = 2): void {
  const { b } = c;
  const mat = lit('metroStrip', 0xe8eef8, 0xeef4ff, 2.6, 0.05, 0.35);
  const housing = plain('metroHousing', 0x9aa0a8, 0.6, 0.3);
  let k = 0;
  for (let x = x0; x <= x1; x += every, k++) {
    addBox(b, housing, x, CEIL - 0.08, z, 1.5, 0.08, 0.28, 0, { cast: false });
    addBox(b, mat, x, CEIL - 0.14, z, 1.35, 0.04, 0.16, 0, { cast: false });
    if (k % lampEvery === 0) b.light({ x, y: CEIL - 0.4, z, color: 0xe8f0ff, intensity: 34, distance: 11, mode: 'fail', pool: 2.6, glow: 0, tag: 'metro-power', indoor: true });
  }
}

/** A yellow exit sign hanging from the ceiling. */
function exitSign(b: LevelBuilder, x: number, z: number, rot: number, text: string, sub: string): void {
  signBoard(b, { x, z, y: 3.45, rot, w: 2.6, h: 0.55, text, sign: { bg: '#f2c200', fg: '#111111', sub, glow: 0.35, worn: 0.25 } });
  for (const s of [-1, 1]) addBox(b, 'steelDark', x + Math.cos(rot) * s * 1.1, 3.95, z - Math.sin(rot) * s * 1.1, 0.03, 0.4, 0.03, 0, { cast: false });
}

/** A fuse cabinet on a wall (the fuse itself is the runtime's, while it is still there to take). */
function fuseCabinet(b: LevelBuilder, x: number, z: number, rot: number): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.3), plain('cabinet', 0x7a8288, 0.5, 0.4));
  body.position.y = 1.4;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.31), plain('cabinetHazard', 0xe8c020, 0.6));
  stripe.position.y = 2.05;
  g.add(stripe);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), jpSignMaterial('電源', { bg: '#e8c020', fg: '#111', sub: 'POWER', aspect: 3.3 }));
  sign.position.set(0, 1.85, 0.16);
  g.add(sign);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  g.updateMatrixWorld(true);
  b.add(g);
}

export interface MetroInfo {
  /** The three fuse cabinets (where each fuse is taken from). */
  fuses: { x: number; y: number; z: number }[];
}

/** Dress the metro (`underground.ts` built its walls, floors and tracks). */
export function dressMetro(c: Ctx, o: { x1: number }): MetroInfo {
  const { b } = c;
  // the tiles catch the light when the power is back (a faint glow off, the station's white on)
  const tile = lit('metroTile', 0xe9ebe6, 0x9aa0a8, 0.32, 0.0, 0.35);
  const stripe = plain('metroStripe', 0xd8507e, 0.5);
  const blueTile = plain('metroBlueTile', 0x2a4a7a, 0.4);

  // ---- tiled walls with the Sakura Line's stripe: the concourse's north wall, the track wall ----
  for (const [x0, x1, z, face] of [
    [-117.6, -46.4, 150.25, 1],
    [-117.6, o.x1 - 0.4, 175.75, -1],
    [36.4, o.x1 - 0.4, 150.25, 1],
  ] as const) {
    const cx = (x0 + x1) / 2;
    addBox(b, tile, cx, 1.25, z + face * 0.03, x1 - x0, 2.5, 0.04, 0, { cast: false });
    addBox(b, stripe, cx, 1.55, z + face * 0.06, x1 - x0, 0.22, 0.03, 0, { cast: false });
  }

  // ---- the ceiling: panels that glow with the power (black overhead without it) ----
  const ceiling = lit('metroCeiling', 0x7a7e86, 0x8e96a4, 0.55, 0.0, 0.8);
  for (const [x0, z0, x1, z1] of [
    [-118, 150, -46, 162],
    [-118, 162, -46, 176],
    [-46, 168, o.x1, 176],
    [36, 150, o.x1, 168],
  ] as const) addBox(b, ceiling, (x0 + x1) / 2, CEIL - 0.02, (z0 + z1) / 2, x1 - x0, 0.04, z1 - z0, 0, { cast: false, receive: false });

  // ---- ceiling strips (dark until the power is back) ----
  strips(c, -114, -50, 153.4);
  strips(c, -114, -50, 158.6);
  strips(c, -114, -50, 165, 4, 2);
  strips(c, -44, o.x1 - 4, 172, 6, 2);
  strips(c, 40, o.x1 - 4, 155);
  strips(c, 40, o.x1 - 4, 163);

  // ---- the concourse ----
  // the automatic ticket gates (the cabinets the walls built; their tops and their lit arrows)
  const gateTop = plain('gateTop', 0x2a2e34, 0.4, 0.3);
  const arrow = lit('gateArrow', 0x1a8a4a, 0x2aff8a, 1.6);
  for (let x = -100; x <= -86; x += 2) {
    addBox(b, plain('gateBody', 0xdcdcd8, 0.45), x, 0.52, 159, 0.34, 1.04, 1.44, 0, { cast: true });
    addBox(b, gateTop, x, 1.08, 159, 0.36, 0.06, 1.46, 0, { cast: false });
    addBox(b, arrow, x, 1.115, 158.4, 0.2, 0.012, 0.18, 0, { cast: false });
  }
  signBoard(b, { x: -93, z: 159, y: 3.3, rot: 0, w: 4.2, h: 0.55, text: '改札口', sign: { bg: '#20305a', fg: '#ffffff', sub: 'TICKET GATES', glow: 0.3, worn: 0.3 } });
  // the ticket machines under the fare map
  const machine = plain('ticketMachine', 0x8aa0c0, 0.5, 0.2);
  const screen = lit('ticketScreen', 0x203040, 0x5ab0ff, 1.4);
  for (let i = 0; i < 4; i++) {
    const x = -112 + i * 1.9;
    addBox(b, machine, x, 0.85, 150.7, 1.4, 1.7, 0.5);
    addBox(b, screen, x, 1.15, 150.97, 0.9, 0.55, 0.02, 0, { cast: false });
    b.collideBox(x, 150.7, 1.4, 0.5, 1.7, { mapKind: 'none', tag: 'ticket-machine', surface: 'metal' });
  }
  const fare = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.6), canvasMat('fareMap', 1024, 220, fareMap, 0.9));
  fare.position.set(-109.15, 2.85, 150.5);
  fare.updateMatrixWorld(true);
  b.add(fare, { cast: false });
  // the station office and its lost and found (the shrine's charm waits on the counter)
  const office = plain('officePanel', 0xcfd2cc, 0.6);
  addBox(b, office, -80.5, 1.3, 152.3, 7, 2.6, 4);
  b.collideBox(-80.5, 152.3, 7, 4, 2.6, { mapKind: 'none', tag: 'station-office' });
  addBox(b, lit('officeWindow', 0x2a3440, 0xfff2d0, 1.2), -80.5, 1.6, 154.32, 5.6, 1.1, 0.04, 0, { cast: false });
  addBox(b, plain('counter', 0x6a5a48, 0.6), -80, 0.45, 156.5, 2.2, 0.9, 0.6);
  b.collideBox(-80, 156.5, 2.2, 0.6, 0.9, { mapKind: 'none', tag: 'lost-and-found' });
  signBoard(b, { x: -80.5, z: 154.45, y: 2.85, rot: 0, w: 4.6, h: 0.6, text: 'お忘れ物取扱所', sign: { bg: '#f6f5f0', fg: '#20305a', sub: 'LOST & FOUND', glow: 0.25, worn: 0.4 } });
  // the exits
  exitSign(b, -74, 154.2, 0, '出口 A  ↑', 'EXIT A  STATION PLAZA');
  exitSign(b, -106, 160.4, Math.PI, 'のりば  1  ↓', 'PLATFORM 1  FOR KISARAGI');

  // ---- the platform ----
  // tactile paving and the white edge line
  addBox(b, plain('tactile', 0xf2c200, 0.8), -82, 0.045, 166.9, 71.6, 0.03, 0.32, 0, { cast: false, receive: true });
  addBox(b, 'paintWhite', -82, 0.05, 167.65, 71.6, 0.02, 0.14, 0, { cast: false });
  // the pillars, the nameboards on them facing the track
  const nameMat = canvasMat('nameboard', 768, 320, nameboard, 1.2);
  for (const x of [-112, -100, -88, -76, -64, -52]) {
    addBox(b, tile, x, CEIL / 2, 164.6, 0.7, CEIL, 0.7);
    addBox(b, blueTile, x, 0.6, 164.6, 0.74, 1.2, 0.74, 0, { cast: false });
    b.collideBox(x, 164.6, 0.7, 0.7, CEIL, { mapKind: 'none', tag: 'pillar' });
    if ((x + 112) % 24 === 0) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.0), nameMat);
      board.position.set(x, 2.5, 164.97);
      board.updateMatrixWorld(true);
      b.add(board, { cast: false });
      addBox(b, 'steelDark', x, 2.5, 164.95, 2.5, 1.1, 0.04, 0, { cast: false });
    }
  }
  // benches between the pillars, drink machines at the ends
  for (const x of [-106, -94, -70, -58]) {
    addBox(b, plain('benchSeat', 0x2a6ab0, 0.5), x, 0.45, 163.4, 2.4, 0.08, 0.5);
    addBox(b, 'steelDark', x, 0.22, 163.4, 2.3, 0.44, 0.08, 0, { cast: false });
    b.collideBox(x, 163.4, 2.4, 0.5, 0.5, { mapKind: 'none', tag: 'bench' });
  }
  const vend = canvasMat('vending', 256, 512, vendingFront, 1);
  for (const x of [-116.4, -47.6]) {
    addBox(b, plain('vendBody', 0xf4f4f2, 0.4), x, 0.95, 163.2, 0.85, 1.9, 0.9);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.6), vend);
    front.position.set(x + (x < -80 ? 0.44 : -0.44), 1.05, 163.2);
    front.rotation.y = x < -80 ? Math.PI / 2 : -Math.PI / 2;
    front.updateMatrixWorld(true);
    b.add(front, { cast: false });
    b.collideBox(x, 163.2, 0.85, 0.9, 1.9, { mapKind: 'none', tag: 'vending', surface: 'metal' });
  }
  // half-height platform gates, open where the train's doors stand
  const gate = plain('platformGate', 0xd8dad6, 0.4, 0.2);
  const gateGlass = plain('platformGateGlass', 0x8ab0c0, 0.1, 0.2);
  for (let x = -116; x < -48; x += 4.5) {
    addBox(b, gate, x + 1.4, 0.65, 167.95, 2.6, 1.3, 0.12);
    addBox(b, gateGlass, x + 1.4, 0.95, 167.95, 2.2, 0.5, 0.13, 0, { cast: false });
    b.collideBox(x + 1.4, 167.95, 2.6, 0.12, 1.3, { mapKind: 'none', tag: 'platform-gate' });
  }
  // the departure boards, hanging over the platform both ways
  const board = canvasMat('departures', 512, 128, departures, 1.6);
  for (const x of [-96, -68]) {
    for (const r of [Math.PI / 2, -Math.PI / 2]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), board);
      p.position.set(x + (r > 0 ? 0.07 : -0.07), 3.5, 165);
      p.rotation.y = r;
      p.updateMatrixWorld(true);
      b.add(p, { cast: false });
    }
    addBox(b, 'steelDark', x, 3.5, 165, 0.12, 0.66, 2.46, 0, { cast: false });
  }
  // adverts on the track wall
  ADS.forEach((a, i) => signBoard(b, { x: -110 + i * 13, z: 175.7, y: 2.3, rot: Math.PI, w: 5.2, h: 1.6, text: a.text, sign: { bg: a.bg, fg: a.fg, sub: a.sub, glow: 0.12, worn: 0.55 } }));

  // ---- the tunnel: ribs, cables, signals, the third rail ----
  const rib = plain('tunnelRib', 0x5a5c5e, 0.9);
  for (let x = -40; x < o.x1 - 4; x += 6) {
    if (x < 35) addBox(b, rib, x, CEIL / 2, 168.25, 0.4, CEIL, 0.3, 0, { cast: false }); // (the east concourse opens onto the tunnel)
    addBox(b, rib, x, CEIL / 2, 175.75, 0.4, CEIL, 0.3, 0, { cast: false });
    addBox(b, rib, x, CEIL - 0.15, 172, 0.4, 0.3, 7.8, 0, { cast: false });
  }
  const cable = plain('cable', 0x18181a, 0.7);
  for (const y of [2.6, 2.85, 3.1]) addBox(b, cable, (-117 + o.x1) / 2, y, 175.6, o.x1 + 117, 0.06, 0.06, 0, { cast: false });
  addBox(b, plain('thirdRail', 0x6a6a5a, 0.5, 0.6), (-118 + o.x1) / 2, 0.22, 170.2, o.x1 + 118, 0.12, 0.18, 0, { cast: false });
  for (const [x, col] of [[-44, 0xff2020], [10, 0xff2020], [52, 0x20ff60]] as const) {
    addBox(b, 'steelDark', x, 2.1, 175.5, 0.3, 0.7, 0.2, 0, { cast: false });
    addBox(b, lit(`signal${col}`, col, col, 2.2, 0.6), x, 2.25, 175.38, 0.14, 0.14, 0.04, 0, { cast: false });
  }

  // ---- the east concourse: its gates and its exits ----
  for (let x = 44; x <= 56; x += 2) {
    addBox(b, plain('gateBody', 0xdcdcd8, 0.45), x, 0.52, 158, 0.34, 1.04, 1.44);
    addBox(b, gateTop, x, 1.08, 158, 0.36, 0.06, 1.46, 0, { cast: false });
    addBox(b, arrow, x, 1.115, 157.4, 0.2, 0.012, 0.18, 0, { cast: false });
    b.collideBox(x, 158, 0.34, 1.44, 1.04, { mapKind: 'none', tag: 'gate', surface: 'metal' });
  }
  exitSign(b, 44, 153.6, 0, '出口 B  ↑', 'EXIT B  SHOTENGAI');
  exitSign(b, 60, 153.6, 0, '出口 C  ↑', 'EXIT C  CANAL');

  // ---- the fuse cabinets ----
  const fuses = [
    { x: -117.25, y: 1.4, z: 156, rot: Math.PI / 2 }, // the concourse's far end
    { x: -46.75, y: 1.4, z: 165, rot: -Math.PI / 2 }, // the platform's east end
    { x: 22, y: 1.4, z: 175.25, rot: Math.PI }, // in the tunnel, past the derailed car
  ];
  for (const f of fuses) fuseCabinet(b, f.x, f.z, f.rot);
  return { fuses: fuses.map((f) => ({ x: f.x + Math.sin(f.rot) * 0.35, y: f.y, z: f.z + Math.cos(f.rot) * 0.35 })) };
}

/** The train's windows: dark, lit with the station's power. */
export function trainWindows(): THREE.MeshStandardMaterial {
  return lit('trainWindows', 0x1a2228, 0xfff4dc, 1.3, 0.02, 0.15);
}

/** The station's power: on, every strip and board and machine lights and the lamps stop failing; off, dark again. */
export function metroPower(lights: readonly { tag?: string; mode?: string }[], on: boolean): void {
  for (const p of powered) p.mat.emissiveIntensity = on ? p.on : p.off;
  for (const l of lights) {
    if (l.tag === 'metro-power') l.mode = on ? 'steady' : 'fail';
  }
}
