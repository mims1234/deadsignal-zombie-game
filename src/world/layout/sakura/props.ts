/**
 * The Sakura District's own props: everything a Japanese commuter district has (torii, stone lanterns, vending machines,
 * shop fronts with noren and signs, paper lanterns, bicycles, a commuter train), the things people built to survive
 * (tarp camps, desk barricades, luggage, painted SOS), and what seven springs did to it (wild cherry trees, grass,
 * ivy, petals). Built from primitives and canvas textures; repeated pieces are instanced.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelBuilder } from '../../builder';
import { mulberry32 } from '../../landmarks/util';
import { addBox } from '../../structures';
import type { Ctx } from '../util';

export interface At {
  x: number;
  z: number;
  rot?: number;
  y?: number;
}

const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T {
  let v = cache.get(key) as T | undefined;
  if (!v) {
    v = make();
    cache.set(key, v);
  }
  return v;
}

const JP_FONT = '"Noto Sans JP", "Yu Gothic", "YuGothic", "Meiryo", "Hiragino Sans", "MS Gothic", sans-serif';

/** Put a mesh at a place (rotated about Y) and bake it into the static batches. */
function place(b: LevelBuilder, mesh: THREE.Object3D, o: At): void {
  mesh.position.set(o.x, o.y ?? 0, o.z);
  mesh.rotation.y = o.rot ?? 0;
  mesh.updateMatrixWorld(true);
  b.add(mesh);
}

/** A point in a prop's local frame (lx right, lz back) -> world. */
function local(o: At, lx: number, lz: number): [number, number] {
  const c = Math.cos(o.rot ?? 0);
  const s = Math.sin(o.rot ?? 0);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
}

const std = (key: string, color: number, rough = 0.8, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  memo(`mat:${key}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }));

export const MAT = {
  vermilion: () => std('vermilion', 0xb8321f, 0.7),
  blackLacquer: () => std('lacquer', 0x18140f, 0.5),
  stone: () => std('stone', 0x8f8c84, 0.95),
  stoneDark: () => std('stoneDark', 0x5e5c57, 0.95),
  woodDark: () => std('woodDark', 0x3e2a1c, 0.85),
  woodLight: () => std('woodLight', 0x8a6a46, 0.85),
  tileRoof: () => std('tileRoof', 0x2c3036, 0.6),
  paper: () => std('paper', 0xe9e1cf, 0.95),
  white: () => std('whiteMetal', 0xd8dad6, 0.5, { metalness: 0.2 }),
  pinkBark: () => std('bark', 0x3b2a26, 0.95),
  rust: () => std('rustLight', 0x6e4a32, 0.9),
  moss: () => std('moss', 0x3f5a2c, 1),
};

// ---------------------------------------------------------------------------------------------
// signs
// ---------------------------------------------------------------------------------------------

export interface JpSignOpts {
  bg?: string;
  fg?: string;
  /** Characters stacked top to bottom. */
  vertical?: boolean;
  /** Lit from behind. */
  glow?: number;
  /** Faded, stained, peeling. */
  worn?: number;
  /** Width / height of the board. */
  aspect?: number;
  /** A second, smaller line (English or reading). */
  sub?: string;
}

/** A signboard texture: Japanese text (horizontal or vertical) on a coloured board, faded by the years. */
export function jpSignMaterial(text: string, o: JpSignOpts = {}): THREE.MeshStandardMaterial {
  const key = `jpsign:${text}:${o.bg}:${o.fg}:${o.vertical ? 1 : 0}:${o.glow ?? 0}:${o.worn ?? 0.5}:${o.aspect}:${o.sub ?? ''}`;
  return memo(key, () => {
    const aspect = o.aspect ?? (o.vertical ? 0.28 : 3.2);
    const H = 256;
    const W = Math.round(H * aspect);
    const cv = document.createElement('canvas');
    cv.width = Math.max(32, W);
    cv.height = H;
    const g = cv.getContext('2d')!;
    g.fillStyle = o.bg ?? '#1c1a18';
    g.fillRect(0, 0, cv.width, H);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, cv.width - 6, H - 6);
    g.fillStyle = o.fg ?? '#f2ede2';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const chars = [...text];
    if (o.vertical) {
      const size = Math.min(cv.width * 0.8, (H - 20) / Math.max(1, chars.length));
      g.font = `bold ${size}px ${JP_FONT}`;
      chars.forEach((ch, i) => g.fillText(ch, cv.width / 2, 12 + size * (i + 0.5)));
    } else {
      const size = Math.min(H * (o.sub ? 0.56 : 0.72), (cv.width - 30) / Math.max(1, chars.length) * 1.02);
      g.font = `bold ${size}px ${JP_FONT}`;
      g.fillText(text, cv.width / 2, o.sub ? H * 0.4 : H / 2);
      if (o.sub) {
        g.font = `bold ${H * 0.2}px "Arial Narrow", Arial, sans-serif`;
        g.fillText(o.sub, cv.width / 2, H * 0.8);
      }
    }
    // the years: fade, grime streaks, peeling corners
    const worn = o.worn ?? 0.5;
    const rnd = mulberry32(text.length * 131 + chars.reduce((a, c) => a + c.charCodeAt(0), 0));
    g.globalAlpha = 0.18 * worn;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, cv.width, H);
    g.globalAlpha = 1;
    for (let i = 0; i < 20 * worn; i++) {
      g.fillStyle = `rgba(30,24,18,${0.1 + rnd() * 0.25 * worn})`;
      const x = rnd() * cv.width;
      g.fillRect(x, rnd() * H * 0.3, 2 + rnd() * 6, H * (0.3 + rnd() * 0.7));
    }
    for (let i = 0; i < 6 * worn; i++) {
      g.fillStyle = `rgba(70,90,50,${0.3 * worn})`;
      g.beginPath();
      g.arc(rnd() * cv.width, rnd() * H, 6 + rnd() * 26, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const glow = o.glow ?? 0;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, emissive: glow > 0 ? 0xffffff : 0x000000, emissiveMap: glow > 0 ? tex : null, emissiveIntensity: glow });
  });
}

/** A sign board on a wall or a pole: `w` x `h`, facing the way the place faces (+Z after rotation). */
export function signBoard(b: LevelBuilder, o: At & { w: number; h: number; text: string; sign?: JpSignOpts }): void {
  const mat = jpSignMaterial(o.text, { aspect: o.w / o.h, ...o.sign });
  const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, 0.08), [MAT.blackLacquer(), MAT.blackLacquer(), MAT.blackLacquer(), MAT.blackLacquer(), mat, MAT.blackLacquer()]);
  place(b, m, o);
}

/** A canvas decal: big painted words on the ground or a wall (SOS, warnings, the Court's red graffiti). */
export function paintedWordsMaterial(text: string, color: string, opts: { font?: string; scale?: number; drip?: boolean } = {}): THREE.MeshBasicMaterial {
  return memo(`paint:${text}:${color}:${opts.drip ? 1 : 0}`, () => {
    const lines = text.split('\n');
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 256 * lines.length;
    const g = cv.getContext('2d')!;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const rnd = mulberry32(text.length * 977);
    lines.forEach((line, i) => {
      const size = Math.min(220, 1700 / Math.max(3, [...line].length));
      g.font = `bold ${size}px ${opts.font ?? JP_FONT}`;
      g.save();
      g.translate(512, 128 + i * 256);
      g.rotate((rnd() - 0.5) * 0.08);
      g.fillText(line, 0, 0);
      g.restore();
      if (opts.drip) {
        for (let k = 0; k < 14; k++) g.fillRect(150 + rnd() * 724, 160 + i * 256, 4 + rnd() * 5, 20 + rnd() * 70);
      }
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: true });
  });
}

/** Painted words flat on the ground (an SOS on a sports field, KEEP OUT on a road). */
export function groundWords(b: LevelBuilder, o: At & { text: string; w: number; h: number; color: string }): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), paintedWordsMaterial(o.text, o.color));
  m.rotation.set(-Math.PI / 2, 0, o.rot ?? 0);
  m.position.set(o.x, (o.y ?? 0) + 0.035, o.z);
  m.renderOrder = 2;
  b.addDynamic(m);
}

/** Painted words on a wall (spray paint, the Court's graffiti, "WE ARE HERE"). Faces +Z after `rot`. */
export function wallWords(b: LevelBuilder, o: At & { text: string; w: number; h: number; color: string; drip?: boolean }): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), paintedWordsMaterial(o.text, o.color, { drip: o.drip }));
  m.position.set(o.x, o.y ?? 1.6, o.z);
  m.rotation.y = o.rot ?? 0;
  m.renderOrder = 2;
  b.addDynamic(m);
}

// ---------------------------------------------------------------------------------------------
// shrine things
// ---------------------------------------------------------------------------------------------

/** A torii: two vermilion pillars, the tie beam, and the black-capped top beam curving up at its ends. */
export function torii(b: LevelBuilder, o: At & { scale?: number; weathered?: boolean }): void {
  const s = o.scale ?? 1;
  const g = new THREE.Group();
  const red = o.weathered ? std('vermilionOld', 0x8e3324, 0.85) : MAT.vermilion();
  const span = 4.2 * s;
  const H = 4.6 * s;
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.24 * s, H, 12), red);
    p.position.set((side * span) / 2, H / 2, 0);
    g.add(p);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.32 * s, 0.4 * s, 12), MAT.blackLacquer());
    foot.position.set((side * span) / 2, 0.2 * s, 0);
    g.add(foot);
  }
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(span + 1.1 * s, 0.3 * s, 0.22 * s), red);
  nuki.position.y = H - 1.1 * s;
  g.add(nuki);
  // the top beam: a shallow arc of short pieces
  const top = H + 0.35 * s;
  const n = 9;
  const len = span + 2.4 * s;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len / n + 0.02, 0.32 * s, 0.42 * s), red);
    seg.position.set(t * len, top + t * t * 1.6 * s, 0);
    seg.rotation.z = t * 0.9;
    g.add(seg);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len / n + 0.03, 0.12 * s, 0.5 * s), MAT.blackLacquer());
    cap.position.set(t * len, top + 0.22 * s + t * t * 1.6 * s, 0);
    cap.rotation.z = t * 0.9;
    g.add(cap);
  }
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.75 * s, 0.1 * s), MAT.blackLacquer());
  plaque.position.set(0, H - 0.5 * s, 0.13 * s);
  g.add(plaque);
  place(b, g, o);
  for (const side of [-1, 1]) {
    const [x, z] = local(o, (side * span) / 2, 0);
    b.collide({ x, z, hx: 0.25 * s, hz: 0.25 * s, y1: H, mapKind: 'prop', tag: 'torii', surface: 'wood' });
  }
}

/** A stone lantern (tōrō): base, post, light box, roof, jewel. Optionally lit. */
export function stoneLantern(b: LevelBuilder, o: At & { lit?: boolean; scale?: number; toppled?: boolean }): void {
  const s = o.scale ?? 1;
  const g = new THREE.Group();
  const st = MAT.stone();
  const parts: [THREE.BufferGeometry, number][] = [
    [new THREE.CylinderGeometry(0.42 * s, 0.5 * s, 0.25 * s, 6), 0.125 * s],
    [new THREE.CylinderGeometry(0.14 * s, 0.17 * s, 0.9 * s, 8), 0.7 * s],
    [new THREE.CylinderGeometry(0.36 * s, 0.3 * s, 0.18 * s, 6), 1.24 * s],
    [new THREE.BoxGeometry(0.5 * s, 0.42 * s, 0.5 * s), 1.54 * s],
    [new THREE.ConeGeometry(0.6 * s, 0.38 * s, 6), 1.94 * s],
    [new THREE.SphereGeometry(0.11 * s, 8, 6), 2.2 * s],
  ];
  for (const [geo, y] of parts) {
    const m = new THREE.Mesh(geo, st);
    m.position.y = y;
    g.add(m);
  }
  const glowM = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.24 * s, 0.52 * s), o.lit ? std('lanternLit', 0xffc070, 0.6, { emissive: 0xff9a3a, emissiveIntensity: 1.6 }) : std('lanternDark', 0x141210, 0.9));
  glowM.position.y = 1.54 * s;
  g.add(glowM);
  if (o.toppled) {
    g.rotation.z = Math.PI / 2 - 0.15;
    g.position.y = 0.3;
  }
  const holder = new THREE.Group();
  holder.add(g);
  place(b, holder, o);
  b.collide({ x: o.x, z: o.z, hx: 0.42 * s, hz: 0.42 * s, y1: o.toppled ? 0.6 : 2.3 * s, mapKind: 'prop', tag: 'lantern', surface: 'concrete' });
  if (o.lit) b.light({ x: o.x, y: 1.6 * s, z: o.z, color: 0xff9a40, intensity: 18, distance: 9, mode: 'flicker', pool: 2.5, glow: 0.6, tag: 'toro' });
}

/** A low fence of wooden posts tied thick with faded omamori (charms) - what the shrine's families hung for protection. */
export function omamoriFence(c: Ctx, o: { x0: number; z0: number; x1: number; z1: number; seed?: number }): void {
  const { b } = c;
  const dx = o.x1 - o.x0;
  const dz = o.z1 - o.z0;
  const L = Math.hypot(dx, dz);
  const rot = Math.atan2(-dz, dx);
  const rnd = mulberry32(o.seed ?? 7);
  // posts and two rails
  const n = Math.max(2, Math.round(L / 1.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    addBox(b, MAT.woodDark(), o.x0 + dx * t, 0.55, o.z0 + dz * t, 0.12, 1.1, 0.12, rot);
  }
  for (const y of [0.45, 0.95]) addBox(b, MAT.woodDark(), (o.x0 + o.x1) / 2, y, (o.z0 + o.z1) / 2, L, 0.07, 0.05, rot);
  b.collide({ x: (o.x0 + o.x1) / 2, z: (o.z0 + o.z1) / 2, hx: L / 2, hz: 0.12, rot, y1: 1.1, blocksShots: false, mapKind: 'fence', tag: 'omamori-fence' });
  // the charms: little silk pouches in faded colours, hundreds of them
  const geo = memo('omamori-geo', () => new THREE.BoxGeometry(0.05, 0.09, 0.015));
  const cols = [0xb03a3a, 0x3a5ab0, 0xd8b040, 0x3a8a5a, 0xc87aa8, 0xe8e0d0];
  const sets = cols.map((col, i) => b.instanced(`omamori-${i}`, geo, std(`omamori${i}`, col, 0.9), { cast: false }));
  const count = Math.round(L * 9);
  for (let i = 0; i < count; i++) {
    const t = rnd();
    const y = rnd() < 0.5 ? 0.45 : 0.95;
    sets[Math.floor(rnd() * sets.length)]!.add(o.x0 + dx * t + (rnd() - 0.5) * 0.04, y - 0.07 - rnd() * 0.05, o.z0 + dz * t + (rnd() - 0.5) * 0.04, rot + (rnd() - 0.5) * 0.6);
  }
}

/** A tall nobori banner on a pole (festival banners, the Court's red ones). */
export function nobori(b: LevelBuilder, o: At & { text: string; color: string; fg?: string; torn?: boolean }): void {
  addBox(b, 'steelDark', o.x, 2.2, o.z, 0.06, 4.4, 0.06);
  const mat = jpSignMaterial(o.text, { bg: o.color, fg: o.fg ?? '#f4ede0', vertical: true, worn: 0.8 });
  const h = o.torn ? 2.1 : 2.9;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.62, h), mat);
  (flag.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const [fx, fz] = local(o, 0.34, 0);
  flag.position.set(fx, 4.2 - h / 2, fz);
  flag.rotation.y = o.rot ?? 0;
  flag.updateMatrixWorld(true);
  b.add(flag);
}

/** The shrine's hall: a raised wooden hall under a deep tiled roof, an offering box and a bell rope out front. */
export function shrineHall(b: LevelBuilder, o: At & { w: number; d: number }): { bell: { x: number; z: number } } {
  const { w, d } = o;
  const g = new THREE.Group();
  const H = 4.2;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.8, d + 1), MAT.stoneDark());
  plinth.position.y = 0.4;
  g.add(plinth);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), MAT.woodDark());
  body.position.y = 0.8 + H / 2;
  g.add(body);
  // vermilion posts along the front
  for (let i = 0; i <= 4; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, H, 10), MAT.vermilion());
    p.position.set(-w / 2 + (w * i) / 4, 0.8 + H / 2, d / 2 + 0.6);
    g.add(p);
  }
  // the roof: two sloped planes over the ridge, deep eaves
  const ridgeY = 0.8 + H + 2.4;
  const slopeL = Math.hypot(d / 2 + 1.6, 2.4);
  for (const side of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w + 2.6, 0.22, slopeL), MAT.tileRoof());
    r.position.set(0, ridgeY - 1.2, (side * (d / 2 + 1.6)) / 2);
    r.rotation.x = side * Math.atan2(2.4, d / 2 + 1.6);
    g.add(r);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + 2.8, 0.35, 0.4), MAT.blackLacquer());
  ridge.position.y = ridgeY;
  g.add(ridge);
  // the offering box and the bell rope
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.8), MAT.woodLight());
  box.position.set(0, 0.4, d / 2 + 1.8);
  g.add(box);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), std('rope', 0xb8a070, 1));
  rope.position.set(0, 2.6, d / 2 + 1.3);
  g.add(rope);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), std('bellBrass', 0x8a6a2a, 0.35, { metalness: 0.8 }));
  bell.position.set(0, 3.95, d / 2 + 1.3);
  g.add(bell);
  place(b, g, o);
  const rot = o.rot ?? 0;
  b.collide({ x: o.x, z: o.z, hx: (w + 1) / 2, hz: (d + 1) / 2, rot, y1: 0.8 + H, mapKind: 'building', tag: 'shrine-hall', surface: 'wood' });
  const [bx, bz] = local(o, 0, d / 2 + 1.8);
  b.collide({ x: bx, z: bz, hx: 0.8, hz: 0.4, rot, y1: 0.8, mapKind: 'prop', tag: 'offering-box', surface: 'wood' });
  const [rx, rz] = local(o, 0, d / 2 + 1.3);
  return { bell: { x: rx, z: rz } };
}

/** A five-tier pagoda: stacked storeys under flared roofs, a spire on top (the surge rises from here). */
export function pagoda(b: LevelBuilder, o: At & { tiers?: number }): { topY: number } {
  const n = o.tiers ?? 5;
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.8, 7.4), MAT.stoneDark());
  base.position.y = 0.4;
  g.add(base);
  let y = 0.8;
  let w = 6;
  for (let i = 0; i < n; i++) {
    const h = i === 0 ? 3.4 : 2.4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), i % 2 ? MAT.vermilion() : MAT.woodDark());
    body.position.y = y + h / 2;
    g.add(body);
    y += h;
    // the flared roof: a wide flat slab with turned-up corners (short cones at each corner)
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.55, w * 0.95, 0.9, 4), MAT.tileRoof());
    roof.rotation.y = Math.PI / 4;
    roof.position.y = y + 0.45;
    g.add(roof);
    y += 0.9;
    w *= 0.84;
  }
  const spireM = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 6, 8), std('spireBronze', 0x5a4a2a, 0.4, { metalness: 0.7 }));
  spireM.position.y = y + 3;
  g.add(spireM);
  for (let k = 0; k < 9; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 - k * 0.02, 0.05, 6, 16), spireM.material as THREE.Material);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + 0.6 + k * 0.5;
    g.add(ring);
  }
  place(b, g, o);
  b.collide({ x: o.x, z: o.z, hx: 3.7, hz: 3.7, y1: y, mapKind: 'building', tag: 'pagoda', surface: 'wood' });
  return { topY: y + 6 };
}

// ---------------------------------------------------------------------------------------------
// the street
// ---------------------------------------------------------------------------------------------

function drinksTexture(seed: number, dead: boolean): THREE.CanvasTexture {
  return memo(`drinks:${seed}:${dead}`, () => {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 256;
    const g = cv.getContext('2d')!;
    g.fillStyle = dead ? '#20262a' : '#dfe8ee';
    g.fillRect(0, 0, 128, 256);
    const rnd = mulberry32(seed);
    const cols = ['#d23c3c', '#3c7ad2', '#3ca85a', '#e8b030', '#f0f0f0', '#7a3cc8', '#e86a2a'];
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 5; k++) {
        if (dead && rnd() < 0.6) continue;
        g.fillStyle = cols[Math.floor(rnd() * cols.length)]!;
        g.fillRect(8 + k * 23, 14 + row * 34, 14, 26);
      }
    }
    g.fillStyle = dead ? '#111' : '#20262c';
    g.fillRect(10, 170, 108, 40);
    g.fillStyle = '#666';
    g.fillRect(52, 220, 24, 26);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** A drinks vending machine: a white or red box with a lit front, or long dead and smashed open. */
export function vendingMachine(b: LevelBuilder, o: At & { color?: 'white' | 'red' | 'blue'; dead?: boolean; tipped?: boolean; seed?: number }): void {
  const body = o.color === 'red' ? std('vmRed', 0xb8282a, 0.5) : o.color === 'blue' ? std('vmBlue', 0x2a4ab0, 0.5) : MAT.white();
  const front = memo(`vmFront:${o.seed ?? 0}:${o.dead ? 1 : 0}`, () => {
    const tex = drinksTexture(o.seed ?? 1, !!o.dead);
    return new THREE.MeshStandardMaterial({ map: tex, emissive: o.dead ? 0x000000 : 0xffffff, emissiveMap: o.dead ? null : tex, emissiveIntensity: o.dead ? 0 : 0.55, roughness: 0.3 });
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.85, 0.8), [body, body, body, body, front, body]);
  m.position.y = 0.925;
  const holder = new THREE.Group();
  holder.add(m);
  if (o.tipped) {
    holder.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.925, 0);
    holder.position.y = 0.4;
  }
  const outer = new THREE.Group();
  outer.add(holder);
  place(b, outer, o);
  b.collide({ x: o.x, z: o.z, hx: o.tipped ? 0.5 : 0.48, hz: o.tipped ? 0.95 : 0.4, rot: o.rot ?? 0, y1: o.tipped ? 0.8 : 1.85, mapKind: 'prop', tag: 'vending', surface: 'metal' });
  if (!o.dead && !o.tipped) {
    const [lx, lz] = local(o, 0, 0.6);
    b.light({ x: lx, y: 1.2, z: lz, color: 0xd8f0ff, intensity: 8, distance: 6, mode: 'flicker', pool: 1.6, glow: 0, tag: 'vending' });
  }
}

/** A string of red paper lanterns (chōchin) between two points, some fallen, a few still lit. */
export function lanternString(c: Ctx, o: { x0: number; z0: number; x1: number; z1: number; y: number; lit?: number; seed?: number }): void {
  const { b } = c;
  const rnd = mulberry32(o.seed ?? 3);
  const dx = o.x1 - o.x0;
  const dz = o.z1 - o.z0;
  const L = Math.hypot(dx, dz);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, L, 4), MAT.blackLacquer());
  wire.position.set((o.x0 + o.x1) / 2, o.y + 0.25, (o.z0 + o.z1) / 2);
  wire.rotation.set(0, Math.atan2(-dz, dx), Math.PI / 2, 'YXZ');
  wire.updateMatrixWorld(true);
  b.add(wire);
  const geo = memo('chochin-geo', () => new THREE.CylinderGeometry(0.2, 0.2, 0.45, 10).scale(1, 1, 1));
  const red = b.instanced('chochin-red', geo, std('chochinRed', 0xb02a24, 0.85, { emissive: 0x501008, emissiveIntensity: 0.4 }));
  const white = b.instanced('chochin-white', geo, std('chochinWhite', 0xe8dcc0, 0.9, { emissive: 0x403020, emissiveIntensity: 0.3 }));
  const lit = b.instanced('chochin-lit', geo, std('chochinLit', 0xff7a40, 0.7, { emissive: 0xff5a20, emissiveIntensity: 1.8 }));
  const n = Math.max(2, Math.floor(L / 1.3));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = o.x0 + dx * t;
    const z = o.z0 + dz * t;
    const sag = Math.sin(t * Math.PI) * 0.4;
    const r = rnd();
    if (r < 0.15) {
      // fallen to the ground
      (rnd() < 0.5 ? red : white).add(x + (rnd() - 0.5) * 1.5, 0.2, z + (rnd() - 0.5) * 1.5, rnd() * 3, 1, 1, 1);
      continue;
    }
    const isLit = rnd() < (o.lit ?? 0.15);
    (isLit ? lit : rnd() < 0.7 ? red : white).add(x, o.y - sag, z, 0);
    if (isLit && i % 2 === 0) b.light({ x, y: o.y - sag - 0.2, z, color: 0xff7a40, intensity: 10, distance: 7, mode: 'flicker', pool: 1.8, glow: 0.5, tag: 'chochin' });
  }
}

/** A bicycle: two wheels, the frame, the bars; standing in a rack or lying where it fell. */
export function bicycle(b: LevelBuilder, o: At & { fallen?: boolean; color?: number }): void {
  const g = new THREE.Group();
  const frame = std(`bike${o.color ?? 0}`, o.color ?? 0x2a4a6a, 0.5, { metalness: 0.4 });
  const tire = std('bikeTire', 0x151515, 0.9);
  for (const z of [-0.55, 0.55]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 6, 18), tire);
    w.rotation.y = Math.PI / 2;
    w.position.set(0, 0.35, z);
    g.add(w);
  }
  const bar = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 5), frame);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
    g.add(m);
  };
  bar(0, 0.35, -0.55, 0, 0.75, -0.1);
  bar(0, 0.35, 0.55, 0, 0.8, 0.45);
  bar(0, 0.75, -0.1, 0, 0.8, 0.45);
  bar(0, 0.35, -0.55, 0, 0.4, 0.05);
  bar(0, 0.4, 0.05, 0, 0.75, -0.1);
  bar(-0.25, 0.95, 0.45, 0.25, 0.95, 0.45);
  bar(0, 0.8, 0.45, 0, 0.95, 0.45);
  if (o.fallen) {
    g.rotation.z = Math.PI / 2;
    g.position.y = 0.05;
  }
  const holder = new THREE.Group();
  holder.add(g);
  place(b, holder, o);
}

/**
 * A shop front on the face of a building: the shutter (down and painted, rolled up on a dark interior, or torn open),
 * a signboard over it, a noren curtain in the doorway, an awning. Faces +Z after `rot`; `w` wide.
 */
export function shopFront(b: LevelBuilder, o: At & { w: number; name: string; sub?: string; color: string; shutter: 'down' | 'up' | 'torn'; noren?: string; lit?: boolean }): void {
  const g = new THREE.Group();
  const w = o.w;
  // shutter / dark interior
  if (o.shutter === 'down') {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 2.7, 0.06), new THREE.MeshStandardMaterial({ color: 0x8a8e90, roughness: 0.6, metalness: 0.5 }));
    sh.position.set(0, 1.35, 0.05);
    g.add(sh);
  } else {
    const dark = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 2.7, 0.04), std('shopDark', 0x0c0d0e, 1));
    dark.position.set(0, 1.35, 0.02);
    g.add(dark);
    if (o.shutter === 'torn') {
      const half = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 1.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x7a7e80, roughness: 0.6, metalness: 0.5 }));
      half.position.set(0, 2.15, 0.07);
      half.rotation.x = 0.35;
      g.add(half);
    }
  }
  // the signboard
  const sign = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.75, 0.12), [MAT.blackLacquer(), MAT.blackLacquer(), MAT.blackLacquer(), MAT.blackLacquer(), jpSignMaterial(o.name, { bg: o.color, aspect: (w - 0.2) / 0.75, sub: o.sub, glow: o.lit ? 0.6 : 0, worn: 0.7 }), MAT.blackLacquer()]);
  sign.position.set(0, 3.15, 0.1);
  g.add(sign);
  // the awning
  const aw = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.9), std(`awning${o.color}`, new THREE.Color(o.color).multiplyScalar(0.8).getHex(), 0.9));
  aw.position.set(0, 2.78, 0.45);
  aw.rotation.x = 0.18;
  g.add(aw);
  // the noren: split cloth panels in the doorway
  if (o.noren && o.shutter !== 'down') {
    const mat = jpSignMaterial(o.noren, { bg: '#1e2a4a', fg: '#f0ece0', aspect: 1.6, worn: 0.9 });
    const nor = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), mat);
    (nor.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    nor.position.set(0, 2.2, 0.12);
    g.add(nor);
  }
  place(b, g, o);
}

/** A commuter train car: silver with a pink stripe, windows, doors; `barricade` stands it across the tracks as a wall. */
export function commuterCar(b: LevelBuilder, o: At & { len?: number; doorsChained?: boolean }): void {
  const len = o.len ?? 18;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.1, len), std('trainSilver', 0xb8bec4, 0.4, { metalness: 0.6 }));
  body.position.y = 1.0 + 1.55;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.92, 0.25, len + 0.02), std('trainPink', 0xd85a8a, 0.5));
  stripe.position.y = 1.9;
  g.add(stripe);
  const glass = std('trainGlass', 0x1a2228, 0.15, { metalness: 0.3 });
  for (let i = 0; i < Math.floor(len / 2.2); i++) {
    const z = -len / 2 + 1.4 + i * 2.2;
    for (const x of [-1.46, 1.46]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 1.4), glass);
      win.position.set(x, 3.0, z);
      g.add(win);
    }
  }
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, len - 2), std('bogie', 0x262626, 0.9));
  skirt.position.y = 0.5;
  g.add(skirt);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.25, len), std('trainRoof', 0x6a7076, 0.6));
  roof.position.y = 4.2;
  g.add(roof);
  if (o.doorsChained) {
    for (const z of [-len / 4, len / 4]) {
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 16), std('chain', 0x5a5a5a, 0.5, { metalness: 0.8 }));
      chain.position.set(1.5, 2.3, z);
      chain.rotation.y = Math.PI / 2;
      g.add(chain);
    }
  }
  place(b, g, o);
  b.collide({ x: o.x, z: o.z, hx: 1.45, hz: len / 2, rot: o.rot ?? 0, y1: 4.3, mapKind: 'vehicle', tag: 'train', surface: 'metal' });
}

/** Rails: two steel rails on sleepers along a line (the station's tracks, the freight yard's). */
export function rails(c: Ctx, o: { x0: number; z0: number; x1: number; z1: number }): void {
  const { b } = c;
  const dx = o.x1 - o.x0;
  const dz = o.z1 - o.z0;
  const L = Math.hypot(dx, dz);
  const rot = Math.atan2(-dz, dx);
  const ux = dx / L;
  const uz = dz / L;
  for (const side of [-0.72, 0.72]) {
    addBox(b, 'steelDark', (o.x0 + o.x1) / 2 - uz * side, 0.1, (o.z0 + o.z1) / 2 + ux * side, L, 0.14, 0.08, rot);
  }
  const sleeper = b.instanced('sleeper', memo('sleeper-geo', () => new THREE.BoxGeometry(0.25, 0.1, 2.4)), MAT.woodDark(), { cast: false });
  for (let s = 0; s < L; s += 0.7) sleeper.add(o.x0 + ux * s, 0.05, o.z0 + uz * s, rot);
}

// ---------------------------------------------------------------------------------------------
// the people who tried
// ---------------------------------------------------------------------------------------------

/** Tarps strung on poles over bedrolls, a cold cook pot, belongings: a camp from the first days, rotted. */
export function tarpCamp(b: LevelBuilder, o: At & { w?: number; d?: number; seed?: number }): void {
  const w = o.w ?? 4;
  const d = o.d ?? 3;
  const rnd = mulberry32(o.seed ?? 5);
  const g = new THREE.Group();
  const tarp = std(`tarp${(o.seed ?? 0) % 3}`, [0x2a4a7a, 0x6a5a3a, 0x3a5a3a][(o.seed ?? 0) % 3]!, 1, { side: THREE.DoubleSide });
  for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 5), MAT.woodLight());
    pole.position.set(px, 1.05, pz);
    g.add(pole);
  }
  const t = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, d + 0.3, 4, 3), tarp);
  t.rotation.x = -Math.PI / 2 + 0.12;
  t.position.y = 2.0;
  // sag and a tear
  const pos = t.geometry.attributes.position!;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - rnd() * 0.25);
  g.add(t);
  for (let i = 0; i < 3; i++) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.9), std(`bedroll${i}`, [0x5a4a6a, 0x4a5a6a, 0x6a4a3a][i]!, 1));
    bed.position.set(-w / 2 + 0.7 + i * 1.1, 0.06, (rnd() - 0.5) * 0.6);
    bed.rotation.y = (rnd() - 0.5) * 0.4;
    g.add(bed);
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.25, 10), std('pot', 0x2a2a2a, 0.6, { metalness: 0.6 }));
  pot.position.set(w / 2 + 0.6, 0.3, 0);
  g.add(pot);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 5, 10), MAT.stoneDark());
  ring.rotation.x = Math.PI / 2;
  ring.position.set(w / 2 + 0.6, 0.05, 0);
  g.add(ring);
  place(b, g, o);
}

/** School desks and chairs stacked into a wall - a barricade across a doorway or a corridor. */
export function deskBarricade(b: LevelBuilder, o: { x0: number; z0: number; x1: number; z1: number; height?: number; seed?: number; y?: number; broken?: boolean }): void {
  const rnd = mulberry32(o.seed ?? 11);
  const dx = o.x1 - o.x0;
  const dz = o.z1 - o.z0;
  const L = Math.hypot(dx, dz);
  const rot = Math.atan2(-dz, dx);
  const H = o.height ?? 1.8;
  const y0 = o.y ?? 0;
  const top = MAT.woodLight();
  const legs = std('deskLegs', 0x6a6e72, 0.5, { metalness: 0.5 });
  let n = 0;
  for (let y = 0; y < H - 0.3; y += 0.72) {
    for (let s = 0; s < L; s += 0.68) {
      if (o.broken && rnd() < 0.35) continue;
      const t = (s + 0.34) / L;
      const g = new THREE.Group();
      const desk = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.48), top);
      desk.position.y = 0.7;
      g.add(desk);
      for (const [lx, lz] of [[-0.28, -0.2], [0.28, -0.2], [-0.28, 0.2], [0.28, 0.2]] as const) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.03), legs);
        l.position.set(lx, 0.35, lz);
        g.add(l);
      }
      g.position.set(o.x0 + dx * t, y0 + y, o.z0 + dz * t);
      g.rotation.set((rnd() - 0.5) * 0.3, rot + (rnd() - 0.5) * 0.5 + (n++ % 2 ? Math.PI : 0), (rnd() < 0.2 ? Math.PI : 0) + (rnd() - 0.5) * 0.2);
      g.updateMatrixWorld(true);
      b.add(g);
    }
  }
  if (!o.broken) b.collide({ x: (o.x0 + o.x1) / 2, z: (o.z0 + o.z1) / 2, hx: L / 2, hz: 0.3, rot, y0, y1: y0 + H, blocksShots: false, mapKind: 'prop', tag: 'desks', surface: 'wood' });
}

/** Suitcases, bags and a pushchair: what the evacuation left on the platform. */
export function luggagePile(b: LevelBuilder, o: At & { r?: number; count?: number; seed?: number }): void {
  const rnd = mulberry32(o.seed ?? 21);
  const r = o.r ?? 2;
  const cols = [0x2a2a30, 0x8a2a2a, 0x2a4a8a, 0x6a6a2a, 0xa08060, 0x3a6a5a, 0xc0c0c0];
  for (let i = 0; i < (o.count ?? 12); i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r;
    const big = rnd() < 0.6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.45 : 0.35, big ? 0.65 : 0.3, big ? 0.25 : 0.45), std(`luggage${i % cols.length}`, cols[i % cols.length]!, 0.7));
    m.position.set(o.x + Math.cos(a) * d, (big ? 0.325 : 0.15) + (rnd() < 0.2 ? 0.3 : 0), o.z + Math.sin(a) * d);
    m.rotation.set(rnd() < 0.4 ? Math.PI / 2 : 0, rnd() * Math.PI, 0);
    m.updateMatrixWorld(true);
    b.add(m);
  }
}

// ---------------------------------------------------------------------------------------------
// seven springs: cherry trees, grass, ivy, petals
// ---------------------------------------------------------------------------------------------

/** The cherry trees' blossom: one shared material, so the Easter egg can turn every tree on the map crimson at once. */
export const BLOSSOM = memo('blossom-mat', () => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, emissive: 0x2a0a14, emissiveIntensity: 0.25, flatShading: true }));
export const BARK = memo('bark-mat', () => new THREE.MeshStandardMaterial({ color: 0x3a2a26, roughness: 0.95 }));

function treeGeometries(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  return memo('sakura-tree-geo', () => {
    const rnd = mulberry32(2024);
    const parts: THREE.BufferGeometry[] = [];
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 2.6, 8).translate(0, 1.3, 0);
    parts.push(trunk);
    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rnd() * 0.6;
      const len = 1.8 + rnd() * 0.8;
      const dir = new THREE.Vector3(Math.cos(a) * 0.8, 0.75, Math.sin(a) * 0.8).normalize();
      const br = new THREE.CylinderGeometry(0.06, 0.12, len, 6).translate(0, len / 2, 0);
      br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      br.translate(0, 2.3, 0);
      parts.push(br);
      tips.push(dir.clone().multiplyScalar(len).add(new THREE.Vector3(0, 2.3, 0)));
    }
    const trunkGeo = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
    // the canopy: soft clumps round the branch tips and over the crown, each a slightly different pink
    const blobs: THREE.BufferGeometry[] = [];
    const pinks = [new THREE.Color(0xf6c6d2), new THREE.Color(0xf2a8bc), new THREE.Color(0xfadbe2), new THREE.Color(0xe890aa)];
    const centres = [...tips, new THREE.Vector3(0, 4.4, 0), new THREE.Vector3(0.8, 4.0, 0.6), new THREE.Vector3(-0.7, 4.1, -0.5)];
    for (const c of centres) {
      for (let k = 0; k < 2; k++) {
        const r = 1.0 + rnd() * 0.6;
        const blob = new THREE.IcosahedronGeometry(r, 1).toNonIndexed();
        blob.scale(1.25, 0.75, 1.25);
        blob.translate(c.x + (rnd() - 0.5) * 0.8, c.y + (rnd() - 0.2) * 0.5, c.z + (rnd() - 0.5) * 0.8);
        const col = pinks[Math.floor(rnd() * pinks.length)]!;
        const n = blob.attributes.position!.count;
        const colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const v = 0.88 + rnd() * 0.12;
          colors[i * 3] = col.r * v;
          colors[i * 3 + 1] = col.g * v;
          colors[i * 3 + 2] = col.b * v;
        }
        blob.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        blobs.push(blob);
      }
    }
    const canopy = mergeGeometries(blobs)!;
    return { trunk: trunkGeo, canopy };
  });
}

/**
 * A cherry tree, wild after seven springs: a dark trunk, reaching branches, a wide cloud of blossom. Instanced (every
 * tree on the map is two draw calls per chunk). `scale` ~0.8-1.4.
 */
export function cherryTree(c: Ctx, o: At & { scale?: number; collide?: boolean }): void {
  const { b } = c;
  const { trunk, canopy } = treeGeometries();
  const s = o.scale ?? 1;
  const rot = o.rot ?? 0;
  b.instanced('sakura-trunk', trunk, BARK).add(o.x, o.y ?? 0, o.z, rot, s);
  b.instanced('sakura-canopy', canopy, BLOSSOM).add(o.x, o.y ?? 0, o.z, rot, s);
  if (o.collide !== false) b.collide({ x: o.x, z: o.z, hx: 0.24 * s, hz: 0.24 * s, y0: o.y ?? 0, y1: (o.y ?? 0) + 2.4 * s, mapKind: 'prop', tag: 'tree', surface: 'wood' });
  c.placed.push({ x: o.x, z: o.z, r: 0.6 * s });
}

/** The dead sacred tree: huge, grey, leafless, older than the district. */
export function sacredTree(c: Ctx, o: At): void {
  const { b } = c;
  const g = new THREE.Group();
  const grey = std('deadBark', 0x6a6560, 1);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 7, 12), grey);
  trunk.position.y = 3.5;
  g.add(trunk);
  const rnd = mulberry32(99);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.4;
    const len = 4 + rnd() * 3;
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.45, len, 7), grey);
    const dir = new THREE.Vector3(Math.cos(a), 0.7 + rnd() * 0.5, Math.sin(a)).normalize();
    br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    br.position.copy(dir.clone().multiplyScalar(len / 2)).add(new THREE.Vector3(0, 6, 0));
    g.add(br);
  }
  // the shimenawa: the sacred rope round the trunk, with its paper streamers
  const rope = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 8, 24), std('shimenawa', 0xc8b080, 1));
  rope.rotation.x = Math.PI / 2;
  rope.position.y = 2.2;
  g.add(rope);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const shide = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.5), MAT.paper());
    shide.position.set(Math.cos(a) * 1.42, 1.85, Math.sin(a) * 1.42);
    shide.rotation.y = -a + Math.PI / 2;
    g.add(shide);
  }
  place(b, g, o);
  b.collide({ x: o.x, z: o.z, hx: 1.5, hz: 1.5, y1: 7, mapKind: 'prop', tag: 'sacred-tree', surface: 'wood' });
}

function grassTexture(): THREE.CanvasTexture {
  return memo('grass-tex', () => {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const g = cv.getContext('2d')!;
    const rnd = mulberry32(17);
    for (let i = 0; i < 70; i++) {
      const x = 8 + rnd() * 112;
      const h = 50 + rnd() * 75;
      g.strokeStyle = `rgb(${60 + rnd() * 50},${100 + rnd() * 60},${40 + rnd() * 30})`;
      g.lineWidth = 2 + rnd() * 3;
      g.beginPath();
      g.moveTo(x, 128);
      g.quadraticCurveTo(x + (rnd() - 0.5) * 30, 128 - h / 2, x + (rnd() - 0.5) * 40, 128 - h);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

const GRASS = memo('grass-mat', () => new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xc8d8a0 }));
const grassGeo = (): THREE.BufferGeometry =>
  memo('grass-geo', () => {
    const a = new THREE.PlaneGeometry(1.1, 0.7).translate(0, 0.35, 0);
    const b2 = a.clone().rotateY(Math.PI / 2);
    const c2 = a.clone().rotateY(Math.PI / 4);
    return mergeGeometries([a, b2, c2])!;
  });

/** Tall grass and weeds over a rectangle (cracked paving, the sports field, the tracks), clear of `avoid`. */
export function grass(c: Ctx, o: { x0: number; z0: number; x1: number; z1: number; density: number; seed?: number; avoid?: (x: number, z: number) => boolean; y?: number }): void {
  const set = c.b.instanced('grass', grassGeo(), GRASS, { cast: false });
  const rnd = mulberry32(o.seed ?? 31);
  const area = Math.abs((o.x1 - o.x0) * (o.z1 - o.z0));
  const n = Math.round(area * o.density);
  for (let i = 0; i < n; i++) {
    const x = o.x0 + rnd() * (o.x1 - o.x0);
    const z = o.z0 + rnd() * (o.z1 - o.z0);
    if (o.avoid?.(x, z)) continue;
    const s = 0.6 + rnd() * 0.9;
    set.add(x, o.y ?? 0, z, rnd() * Math.PI, s, s * (0.7 + rnd() * 0.6), s);
  }
}

function ivyTexture(): THREE.CanvasTexture {
  return memo('ivy-tex', () => {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 256;
    const g = cv.getContext('2d')!;
    const rnd = mulberry32(41);
    for (let i = 0; i < 9; i++) {
      let x = 20 + rnd() * 216;
      let y = 256;
      g.strokeStyle = 'rgba(60,50,30,0.9)';
      g.lineWidth = 2;
      for (let k = 0; k < 30; k++) {
        const nx = x + (rnd() - 0.5) * 18;
        const ny = y - 6 - rnd() * 6;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(nx, ny);
        g.stroke();
        x = nx;
        y = ny;
        if (y < 30 * rnd()) break;
        for (let l = 0; l < 3; l++) {
          g.fillStyle = `rgb(${40 + rnd() * 40},${80 + rnd() * 60},${30 + rnd() * 30})`;
          g.beginPath();
          g.ellipse(x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 10, 4 + rnd() * 5, 3 + rnd() * 4, rnd() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Ivy climbing a wall: a cut-out sheet of leaves on its face. Faces +Z after `rot`. */
export function ivy(b: LevelBuilder, o: At & { w: number; h: number }): void {
  const mat = memo('ivy-mat', () => new THREE.MeshStandardMaterial({ map: ivyTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), mat);
  m.position.set(o.x, (o.y ?? 0) + o.h / 2, o.z);
  m.rotation.y = o.rot ?? 0;
  m.castShadow = false;
  m.updateMatrixWorld(true);
  b.add(m, { cast: false });
}

function petalTexture(): THREE.CanvasTexture {
  return memo('petal-tex', () => {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 256;
    const g = cv.getContext('2d')!;
    const rnd = mulberry32(59);
    for (let i = 0; i < 500; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * 120;
      g.fillStyle = `rgba(${240 + rnd() * 15},${170 + rnd() * 50},${190 + rnd() * 40},${0.5 + rnd() * 0.5})`;
      g.beginPath();
      g.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 3 + rnd() * 3, 2 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** A drift of fallen petals on the ground under the trees. */
export function petals(b: LevelBuilder, o: At & { r: number }): void {
  const mat = memo('petal-mat', () => new THREE.MeshStandardMaterial({ map: petalTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.r * 2, o.r * 2), mat);
  m.rotation.set(-Math.PI / 2, 0, o.rot ?? 0);
  m.position.set(o.x, (o.y ?? 0) + 0.025, o.z);
  m.receiveShadow = true;
  m.updateMatrixWorld(true);
  b.add(m, { cast: false });
}
