/**
 * ZARYA: the Tamada's Zenit develops what happened. At six marked spots in town (a faint ring of frost on the ground,
 * `FrostRings`, drawn by `look.ts`) something happened at 23:57. Flashed at one from within `STORY.zenit` m, the
 * camera gives back a photograph of that place at that minute: the game's own scene, drawn once from a fixed camera
 * with the people who stood there then put back as they stood, held as a picture on a faded print (`ZenitPhotos`).
 * It shows for a few seconds in a small card in the screen's top-right corner (never mid-screen), is said on the
 * wire as its caption (`lines.ts`, the clue's own beat), and stays in the journal.
 *
 * A photograph is a clue (`story.ts`: the last six of `CLUES`, on the wire in `StoryView.clues`): one more of
 * Morozko's weak points each (`director.ts`, `PARRY`), nothing off his health and nothing toward an ending.
 *
 * Nothing here costs anything until a photograph is taken: the figures and props exist only for the one frame drawn
 * into the print, and the rings are six small quads, each culled with the zone it lies in.
 */
import * as THREE from 'three';
import type { Game } from '../game/game';
import { LINES } from './lines';
import { CLUES, CH, STORY, ZaryaStory, type StoryView } from './story';
import { yawTo } from './types';

// ---------------------------------------------------------------------------------------------------------------------
// the shots
// ---------------------------------------------------------------------------------------------------------------------

type Pose = 'stand' | 'lookUp' | 'watch' | 'reach' | 'carry' | 'wave' | 'climb';

/** Someone who stood there at 23:57: where, facing what, doing what, in what. */
export interface Figure {
  x: number;
  z: number;
  /** Floor under their feet (the stage's boards, a rung of a ladder). */
  y?: number;
  yaw: number;
  pose: Pose;
  coat: number;
  hat?: number;
  /** 1 a grown man; a child about two thirds. */
  scale?: number;
  /** Ded Moroz's beard and long coat; a gas mask; a butcher's apron; a clipboard in the hand. */
  kit?: ('moroz' | 'mask' | 'apron' | 'board')[];
}

/** A thing that stood there then and does not now (a ladder, the Institute's crates on a sledge). */
export interface Prop {
  kind: 'ladder' | 'crate' | 'sledge';
  x: number;
  z: number;
  y?: number;
  yaw?: number;
  /** A ladder's top (it leans from (x, y, z) to here). */
  top?: readonly [number, number, number];
}

/** One photograph: where the camera stood and what it looked at, who was there, what stood there. */
export interface Shot {
  id: string;
  eye: readonly [number, number, number];
  at: readonly [number, number, number];
  fov: number;
  figures: readonly Figure[];
  props?: readonly Prop[];
  /** Height of the ground under the spot's frost ring. */
  floor: number;
}

const NORTH = 0;
const SOUTH = Math.PI;
const EAST = -Math.PI / 2;
const WEST = Math.PI / 2;
const WHITE_COAT = 0xe4e2da;
const KID = 0.68;

/** The six photographs, by the id of their clue (`story.ts`). */
export const SHOTS: Readonly<Record<string, Shot>> = {
  // the square's stage: Ded Moroz is looking at his watch while the whole square looks up at the first flakes
  stillSquare: {
    id: 'stillSquare',
    eye: [-8.6, 2.6, 23.6],
    at: [-7.6, 1.9, 14],
    fov: 48,
    floor: 0,
    figures: [
      { x: -6.4, z: 13.4, y: 1, yaw: SOUTH, pose: 'watch', coat: 0x2e5fb0, hat: 0x2e5fb0, kit: ['moroz'] },
      { x: -10.2, z: 13.8, y: 1, yaw: SOUTH + 0.3, pose: 'lookUp', coat: 0xc8d8e8, hat: 0xe8eef4 },
      { x: -11.4, z: 18.4, yaw: NORTH + 0.2, pose: 'lookUp', coat: 0x5b4636, hat: 0x2a2a2a },
      { x: -4.8, z: 18.9, yaw: NORTH - 0.3, pose: 'lookUp', coat: 0x3b4a66, hat: 0x4a3a2a },
      { x: -8.4, z: 17.9, yaw: NORTH, pose: 'wave', coat: 0xb8402f, scale: KID },
    ],
  },
  // the Palace's stage: Kostya's class in line for the pageant, and a gap where the Hare should be
  stillDk: {
    id: 'stillDk',
    eye: [-167.2, 1.55, -22.6],
    at: [-176, 0.95, -22.8],
    fov: 44,
    floor: 0.3,
    figures: [
      { x: -173.6, z: -29.6, y: 0.3, yaw: EAST, pose: 'stand', coat: 0x7a7c80, hat: 0x6a6c70, scale: KID },
      { x: -173.6, z: -28.0, y: 0.3, yaw: EAST, pose: 'stand', coat: 0x7a7c80, hat: 0x6a6c70, scale: KID },
      { x: -173.6, z: -26.3, y: 0.3, yaw: EAST, pose: 'wave', coat: 0xf2f4f8, hat: 0xdfe8f4, scale: KID },
      // (z -23.5: the Hare's place)
      { x: -173.6, z: -20.7, y: 0.3, yaw: EAST, pose: 'stand', coat: 0xd07028, hat: 0xd07028, scale: KID },
      { x: -173.6, z: -19.0, y: 0.3, yaw: EAST, pose: 'stand', coat: 0x6a4a30, hat: 0x5a3a24, scale: KID },
      { x: -173.6, z: -17.3, y: 0.3, yaw: EAST, pose: 'stand', coat: 0xa0502a, hat: 0xa0502a, scale: KID },
      { x: -170.6, z: -12.8, yaw: WEST + 0.4, pose: 'reach', coat: 0x4a4f57, hat: 0x3a3030 },
    ],
  },
  // the cold store's door: Borya hands the Institute its order
  stillRynok: {
    id: 'stillRynok',
    eye: [221.2, 1.75, -15.6],
    at: [227.2, 1.25, -9.6],
    fov: 50,
    floor: 0,
    figures: [
      { x: 225.9, z: -9.5, yaw: WEST - 0.5, pose: 'carry', coat: 0x5a4a40, hat: 0xe8e6e0, scale: 1.12, kit: ['apron'] },
      { x: 223.4, z: -7.2, yaw: yawTo(223.4, -7.2, 225.9, -9.5), pose: 'reach', coat: WHITE_COAT, hat: 0x2a2a2e, kit: ['board'] },
    ],
    props: [
      { kind: 'sledge', x: 225.3, z: -7.6, yaw: 1.4 },
      { kind: 'crate', x: 225.0, z: -7.65, y: 0.42, yaw: 1.4 },
      { kind: 'crate', x: 225.7, z: -7.55, y: 0.42, yaw: 1.45 },
    ],
  },
  // the yard under the grandmother's window: everybody looks up at the snow; she looks at the tree
  stillDvor: {
    id: 'stillDvor',
    eye: [-33.4, 1.75, 98.4],
    at: [-38, 1.7, 87.6],
    fov: 50,
    floor: 0,
    figures: [
      { x: -35.6, z: 93.4, yaw: SOUTH - 0.4, pose: 'lookUp', coat: 0x44553f, hat: 0x2a2a2a },
      { x: -40.6, z: 94.2, yaw: EAST + 0.5, pose: 'lookUp', coat: 0x7b5f7a, hat: 0x5a4a5a },
      { x: -38.7, z: 92.4, yaw: SOUTH + 0.2, pose: 'wave', coat: 0x2f6fb0, hat: 0xd0a030, scale: KID },
    ],
  },
  // the new pipe at the chimney's foot: one man at it, in an Institute coat and a gas mask
  stillTets: {
    id: 'stillTets',
    eye: [-99.6, 1.7, -144.2],
    at: [-94.6, 1.35, -151],
    fov: 50,
    floor: 0,
    figures: [{ x: -95.6, z: -150.3, yaw: EAST + 0.35, pose: 'reach', coat: WHITE_COAT, hat: 0x2a2a2e, kit: ['mask'] }],
  },
  // the master clock: a white coat on a ladder, and the spanner going into the works
  stillClock: {
    id: 'stillClock',
    eye: [-187.4, 1.8, -138.4],
    at: [-189.8, 3.3, -146],
    fov: 52,
    floor: 0,
    figures: [{ x: -191.9, z: -144.85, y: 1.85, yaw: NORTH - 0.35, pose: 'climb', coat: WHITE_COAT, hat: 0x2a2a2e }],
    props: [{ kind: 'ladder', x: -191.9, z: -143.7, y: 0, top: [-191.9, 4.1, -145.55] }],
  },
};

/** The photographs' clues, in the order of `CLUES` (their bit is their index there). */
export const PHOTO_CLUES: readonly number[] = CLUES.flatMap((c, i) => (c.zenit ? [i] : []));
const PHOTO_BITS = PHOTO_CLUES.reduce((m, i) => m | (1 << i), 0);

/** A photograph's caption: its clue's line (`lines.ts`). */
export function captionOf(id: string): { who: string; text: string } {
  const l = (LINES as Record<string, readonly (readonly [string, string])[]>)[id]?.[0];
  return { who: l?.[0] ?? '', text: l?.[1] ?? '' };
}

// ---------------------------------------------------------------------------------------------------------------------
// the film
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A frame read back from the GPU (bottom row first, linear colour) as a faded Soviet colour print: the right way up,
 * to sRGB, washed out and warmed, the flash falling off toward the corners, grain. Pure: the same frame and seed give
 * the same print.
 */
export function filmLook(src: ArrayLike<number>, w: number, h: number, seed = 1): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
  const toS = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  // the exposure: a flash a pace from a pale wall burns it out, one across a dark hall barely reaches; the print is
  // brought to the same middle grey either way (weighted to the middle of the frame, where the flash was aimed)
  let sum = 0;
  let wsum = 0;
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      const i = (y * w + x) * 4;
      const dx = x / w - 0.5;
      const dy = y / h - 0.5;
      const wt = Math.max(0.05, 1 - (dx * dx + dy * dy) * 3);
      sum += wt * toS((0.3 * (src[i] ?? 0) + 0.59 * (src[i + 1] ?? 0) + 0.11 * (src[i + 2] ?? 0)) / 255);
      wsum += wt;
    }
  }
  const gain = Math.min(2.2, Math.max(0.45, 0.42 / Math.max(0.02, sum / Math.max(1e-6, wsum))));
  for (let y = 0; y < h; y++) {
    const row = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const i = (row * w + x) * 4;
      let r = toS((src[i] ?? 0) / 255);
      let g = toS((src[i + 1] ?? 0) / 255);
      let b = toS((src[i + 2] ?? 0) / 255);
      // the flash: what it reached is lifted, the corners fall away
      const dx = x / w - 0.5;
      const dy = y / h - 0.48;
      const vig = Math.max(0, 1 - (dx * dx + dy * dy) * 2.1);
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      // half the colour gone out of it, a warm cast, the blacks lifted and the whites dulled
      r = lum + (r - lum) * 0.45;
      g = lum + (g - lum) * 0.45;
      b = lum + (b - lum) * 0.45;
      const k = (0.25 + 0.95 * vig) * gain;
      r = 0.07 + Math.min(1, r * k * 1.06) * 0.86;
      g = 0.06 + Math.min(1, g * k * 0.98) * 0.84;
      b = 0.05 + Math.min(1, b * k * 0.82) * 0.78;
      const grain = (rnd() - 0.5) * 0.09;
      const o = (y * w + x) * 4;
      out[o] = (r + grain) * 255;
      out[o + 1] = (g + grain) * 255;
      out[o + 2] = (b + grain) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// the people and the props
// ---------------------------------------------------------------------------------------------------------------------

const SKIN = 0xc89a7c;
const DARK = 0x1c1c22;

class Kit {
  private readonly mats = new Map<number, THREE.MeshStandardMaterial>();
  private readonly geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
    ball: new THREE.SphereGeometry(1, 10, 8),
    cone: new THREE.ConeGeometry(1, 1, 8),
    /** A coat: narrower at the shoulders than at the hem. */
    flare: new THREE.CylinderGeometry(0.72, 1, 1, 10),
  };

  mat(c: number): THREE.MeshStandardMaterial {
    let m = this.mats.get(c);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 });
      this.mats.set(c, m);
    }
    return m;
  }

  part(to: THREE.Object3D, kind: keyof Kit['geo'], c: number, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
    const m = new THREE.Mesh(this.geo[kind], this.mat(c));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    to.add(m);
    return m;
  }

  /** One figure as it stood (it faces -z before `yaw` turns it). */
  figure(f: Figure): THREE.Group {
    const g = new THREE.Group();
    const moroz = f.kit?.includes('moroz') ?? false;
    // legs and boots (Ded Moroz's coat goes to the floor)
    if (!moroz) for (const sx of [-1, 1]) this.part(g, 'box', DARK, sx * 0.1, 0.4, 0, 0.14, 0.8, 0.17);
    // the coat, the shoulders, the head, the hat
    if (moroz) {
      this.part(g, 'flare', f.coat, 0, 0.76, 0, 0.32, 1.4, 0.32);
      this.part(g, 'cyl', 0xf4f4f0, 0, 0.08, 0, 0.34, 0.1, 0.34);
    } else this.part(g, 'flare', f.coat, 0, 0.95, 0, 0.29, 0.95, 0.29);
    this.part(g, 'cyl', f.coat, 0, 1.47, 0, 0.21, 0.14, 0.21);
    this.part(g, 'ball', SKIN, 0, 1.63, 0, 0.115, 0.13, 0.115);
    if (moroz) {
      this.part(g, 'cyl', f.coat, 0, 1.82, 0, 0.12, 0.26, 0.12);
      this.part(g, 'cyl', 0xf4f4f0, 0, 1.71, 0, 0.14, 0.06, 0.14);
      this.part(g, 'cone', 0xf2f2ee, 0, 1.38, -0.1, 0.13, 0.42, 0.06).rotation.x = Math.PI;
      for (const y of [0.55, 1.05]) this.part(g, 'cyl', 0xf4f4f0, 0, y, 0, 0.27, 0.05, 0.27);
    } else if (f.hat !== undefined) this.part(g, 'cyl', f.hat, 0, 1.76, 0, 0.13, 0.15, 0.13);
    if (f.kit?.includes('mask')) {
      this.part(g, 'box', DARK, 0, 1.6, -0.1, 0.16, 0.12, 0.06);
      this.part(g, 'cyl', 0x3a3d40, 0, 1.55, -0.15, 0.045, 0.08, 0.045).rotation.x = Math.PI / 2;
    }
    if (f.kit?.includes('apron')) this.part(g, 'box', 0xeeeae2, 0, 1.0, -0.24, 0.36, 0.8, 0.04);
    // the arms: a pivot at each shoulder, the arm hanging from it (rotation.x lifts it forward, z out to the side)
    const lift = (side: -1 | 1): [number, number] => {
      switch (f.pose) {
        case 'lookUp':
          return side > 0 ? [2.5, 0.15] : [0.1, 0.1];
        case 'watch':
          // the left forearm up across the chest, the wrist turned to the face
          return side < 0 ? [1.55, -1.05] : [0.15, 0.1];
        case 'reach':
          return [1.25, -0.12 * side];
        case 'carry':
          return [1.05, -0.2 * side];
        case 'wave':
          return side > 0 ? [2.7, 0.45] : [0.2, 0.1];
        case 'climb':
          return side > 0 ? [2.85, 0.1] : [1.9, -0.1];
        default:
          return [0.08, 0.08 * side];
      }
    };
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.27, 1.45, 0);
      const [x, z] = lift(side);
      pivot.rotation.set(x, 0, z * side);
      this.part(pivot, 'box', f.coat, 0, -0.3, 0, 0.11, 0.6, 0.12);
      this.part(pivot, 'ball', moroz ? 0xf4f4f0 : SKIN, 0, -0.62, 0, 0.06, 0.06, 0.06);
      if (f.pose === 'climb' && side > 0) this.part(pivot, 'box', 0x9aa0a6, 0, -0.66, -0.12, 0.04, 0.04, 0.32);
      g.add(pivot);
    }
    if (f.kit?.includes('board')) this.part(g, 'box', 0xdcd2b8, 0.05, 1.12, -0.42, 0.26, 0.34, 0.02).rotation.x = -0.6;
    if (f.pose === 'carry') this.part(g, 'box', 0x8a6a44, 0, 1.12, -0.5, 0.56, 0.38, 0.4);
    g.position.set(f.x, f.y ?? 0, f.z);
    g.rotation.y = f.yaw;
    g.scale.setScalar(f.scale ?? 1);
    return g;
  }

  prop(p: Prop): THREE.Group {
    const g = new THREE.Group();
    if (p.kind === 'crate') {
      this.part(g, 'box', 0x8a6a44, 0, 0.21, 0, 0.6, 0.42, 0.45);
      this.part(g, 'box', 0xd8d2c0, 0, 0.24, -0.226, 0.34, 0.12, 0.01);
    } else if (p.kind === 'sledge') {
      this.part(g, 'box', 0x6a5038, 0, 0.36, 0, 0.8, 0.06, 1.5);
      for (const sx of [-1, 1]) this.part(g, 'box', 0x3a3a40, sx * 0.34, 0.16, 0, 0.05, 0.32, 1.5);
    } else if (p.kind === 'ladder' && p.top) {
      const dx = p.top[0] - p.x;
      const dy = p.top[1] - (p.y ?? 0);
      const dz = p.top[2] - p.z;
      const len = Math.hypot(dx, dy, dz);
      const lean = new THREE.Group();
      // stood up along +y, then leaned toward the top
      lean.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
      for (const sx of [-1, 1]) this.part(lean, 'box', 0x8a6a44, sx * 0.24, len / 2, 0, 0.06, len, 0.06);
      for (let y = 0.3; y < len; y += 0.32) this.part(lean, 'box', 0x7a5c3a, 0, y, 0, 0.48, 0.04, 0.05);
      g.add(lean);
    }
    g.position.set(p.x, p.y ?? 0, p.z);
    if (p.kind !== 'ladder') g.rotation.y = p.yaw ?? 0;
    return g;
  }

  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
    for (const k of Object.values(this.geo)) k.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the camera
// ---------------------------------------------------------------------------------------------------------------------

/** The print's picture, in pixels (3:2). */
const PRINT = { w: 360, h: 240 };
/** Seconds the card stays up. */
const CARD_SECS = 7;

export class ZenitPhotos {
  /** The photographs this screen has developed (data URLs, by clue index). */
  private readonly prints = new Map<number, string>();
  private readonly kit = new Kit();
  /** The clue bits of the photographs as last seen; whether this run has been looked at once (a co-op join brings some). */
  private had = 0;
  private primed = false;
  /** The Zenit's flashbulbs as last seen in the hand (-1: not in hand). */
  private bulbs = -1;
  private hinted = false;
  private card: HTMLDivElement | null = null;
  private cardT = 0;
  private queue: number[] = [];

  /** `keep`: the town's own look (the people asleep in the streets, the story's doors and levers), which stays in the picture. */
  constructor(
    private readonly g: Game,
    private readonly keep: THREE.Object3D,
  ) {}

  reset(): void {
    this.prints.clear();
    this.had = 0;
    this.primed = false;
    this.bulbs = -1;
    this.hinted = false;
    this.queue.length = 0;
    this.hideCard();
  }

  /**
   * Every frame: a flash of the Zenit in this player's hands at a marked spot asks the story for its photograph
   * (`take`); a photograph the story has newly counted (whoever took it) is developed and shown.
   */
  update(dt: number, v: StoryView, take: (i: number) => void): void {
    const g = this.g;
    const now = v.clues & PHOTO_BITS;
    if (!this.primed) {
      // joining a run already under way: what was taken before is in the journal, not shown again
      this.primed = true;
      this.had = now;
    }
    const fresh = now & ~this.had;
    this.had = now;
    for (const i of PHOTO_CLUES) if (fresh & (1 << i)) this.queue.push(i);

    const c = g.weapons.carried;
    if (c?.id === 'zenit' && g.playerAlive()) {
      const mag = c.ammo.mag;
      if (this.bulbs >= 0 && mag < this.bulbs) this.flashed(v, take);
      this.bulbs = mag;
      if (!this.hinted && this.nearest(v, 8) >= 0) {
        this.hinted = true;
        g.feed('THE ZENIT  -  FLASH IT AT THE FROST RING', 'normal');
      }
    } else this.bulbs = -1;

    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) this.hideCard();
    }
    if (this.cardT <= 0 && this.queue.length) {
      const i = this.queue.shift()!;
      this.showCard(i);
    }
  }

  /** The marked spot not yet photographed nearest this player within `r` m, or -1. */
  private nearest(v: StoryView, r: number): number {
    const p = this.g.player;
    let best = -1;
    let bd = r;
    for (const i of PHOTO_CLUES) {
      if (!ZaryaStory.can(v, 'photo', i)) continue;
      const at = CLUES[i]!.at;
      const d = Math.hypot(at.x - p.x, at.z - p.z);
      if (d <= bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** The flash went off: the marked spot it was aimed at (in its cone, near enough, nothing between) is photographed. */
  private flashed(v: StoryView, take: (i: number) => void): void {
    const g = this.g;
    const cam = g.renderer.camera;
    const eye = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    let best = -1;
    let bd = Infinity;
    for (const i of PHOTO_CLUES) {
      if (!ZaryaStory.can(v, 'photo', i)) continue;
      const at = CLUES[i]!.at;
      const shot = SHOTS[CLUES[i]!.id];
      if (!shot) continue;
      const d = Math.hypot(at.x - eye.x, at.z - eye.z);
      if (d > STORY.zenit) continue;
      const ty = shot.floor + 0.8;
      const to = new THREE.Vector3(at.x - eye.x, ty - eye.y, at.z - eye.z);
      // the flash's own cone (60 degrees), a little wider for a spot underfoot
      if (to.length() > 1.5 && to.normalize().dot(fwd) < Math.cos((38 * Math.PI) / 180)) continue;
      if (g.level.world.segmentBlocked(eye.x, eye.y, eye.z, at.x, ty, at.z, 'shots')) continue;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) take(best);
  }

  /** The picture of clue `i`'s place at 23:57 (drawn the first time it is asked for). */
  print(i: number): string | null {
    const have = this.prints.get(i);
    if (have) return have;
    const shot = SHOTS[CLUES[i]?.id ?? ''];
    if (!shot) return null;
    const url = this.develop(shot, i);
    if (url) this.prints.set(i, url);
    return url;
  }

  /**
   * Draw the place as it was: the town as it stands, without anyone of now (the infected, the squad, what lies
   * about), with the people of 23:57 put back, lit by the flash from the camera. One frame into a small target, read
   * back, and made a print of.
   */
  private develop(shot: Shot, seed: number): string | null {
    const g = this.g;
    const r = g.renderer;
    const gl = r.renderer;
    const set = new THREE.Group();
    for (const f of shot.figures) set.add(this.kit.figure(f));
    for (const p of shot.props ?? []) set.add(this.kit.prop(p));
    const hidden: THREE.Object3D[] = [];
    for (const o of g.worldRoot.children) {
      if (o === g.level.root || o === this.keep || !o.visible) continue;
      o.visible = false;
      hidden.push(o);
    }
    // the zone it is in, drawn for the moment (a squadmate far off may have taken it)
    const zone = CLUES.find((c) => c.id === shot.id)?.zone;
    const zg = zone ? g.level.zones.get(zone) : undefined;
    const zoneWas = zg?.visible ?? true;
    if (zg) zg.visible = true;
    g.worldRoot.add(set);
    const cam = new THREE.PerspectiveCamera(shot.fov, PRINT.w / PRINT.h, 0.1, 140);
    cam.position.set(shot.eye[0], shot.eye[1], shot.eye[2]);
    cam.lookAt(shot.at[0], shot.at[1], shot.at[2]);
    cam.updateMatrixWorld();
    const l = r.flashLight;
    const was = { pos: l.position.clone(), color: l.color.getHex(), distance: l.distance, intensity: l.intensity };
    l.color.setHex(0xfff4e6);
    l.position.copy(cam.position);
    l.distance = 34;
    l.intensity = 520;
    const rt = new THREE.WebGLRenderTarget(PRINT.w, PRINT.h, { depthBuffer: true });
    const prev = gl.getRenderTarget();
    const pixels = new Uint8Array(PRINT.w * PRINT.h * 4);
    let url: string | null = null;
    try {
      gl.setRenderTarget(rt);
      gl.clear();
      gl.render(r.scene, cam);
      gl.readRenderTargetPixels(rt, 0, 0, PRINT.w, PRINT.h, pixels);
      const canvas = document.createElement('canvas');
      canvas.width = PRINT.w;
      canvas.height = PRINT.h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(new ImageData(filmLook(pixels, PRINT.w, PRINT.h, seed + 7) as unknown as Uint8ClampedArray<ArrayBuffer>, PRINT.w, PRINT.h), 0, 0);
        url = canvas.toDataURL('image/jpeg', 0.82);
      }
    } catch {
      url = null;
    } finally {
      gl.setRenderTarget(prev);
      rt.dispose();
      l.position.copy(was.pos);
      l.color.setHex(was.color);
      l.distance = was.distance;
      l.intensity = was.intensity;
      g.worldRoot.remove(set);
      for (const o of hidden) o.visible = true;
      if (zg) zg.visible = zoneWas;
    }
    return url;
  }

  // ---- the card ----

  private showCard(i: number): void {
    const url = this.print(i);
    const id = CLUES[i]!.id;
    const cap = captionOf(id);
    this.hideCard();
    const el = document.createElement('div');
    el.className = 'zy-print';
    const phone = this.g.touchMode || window.innerWidth < 760;
    // (a phone's card is smaller and below the objective chip; its caption is on the top line, said on the wire)
    const w = phone ? 132 : 210;
    el.style.cssText = [
      'position:fixed',
      `right:${phone ? 10 : 18}px`,
      `top:${phone ? 88 : 232}px`,
      `width:${w}px`,
      `padding:${phone ? '5px 5px 4px' : '7px 7px 6px'}`,
      'background:#efe9dc',
      'box-shadow:0 6px 18px rgba(0,0,0,.45)',
      'transform:rotate(1.6deg) translateX(30px)',
      'opacity:0',
      'transition:opacity .35s ease, transform .45s ease',
      'pointer-events:none',
      'z-index:40',
      'font-family:Georgia,serif',
      'color:#2a2620',
    ].join(';');
    const img = document.createElement('img');
    img.alt = CLUES[i]!.name;
    if (url) img.src = url;
    img.style.cssText = 'display:block;width:100%;aspect-ratio:3/2;background:#fff;filter:brightness(3) saturate(0);transition:filter 1.6s ease-out';
    const head = document.createElement('div');
    head.textContent = `${CLUES[i]!.name.replace(' AT 23:57', '')}  ·  23:57`;
    head.style.cssText = `margin-top:5px;font-size:${phone ? 8 : 9}px;letter-spacing:.12em;font-family:inherit;opacity:.75`;
    const line = document.createElement('div');
    line.textContent = cap.text;
    line.style.cssText = `margin-top:2px;font-size:${phone ? 9 : 11}px;line-height:1.25;font-style:italic`;
    el.append(img, head);
    if (!phone) el.append(line);
    document.body.appendChild(el);
    this.card = el;
    this.cardT = CARD_SECS;
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'rotate(1.6deg) translateX(0)';
      // it comes up out of the white of the flash
      img.style.filter = 'brightness(1) saturate(1)';
    });
    this.g.audio.play('upgrade_ok', { priority: 2, volume: 0.5 });
  }

  private hideCard(): void {
    this.card?.remove();
    this.card = null;
    this.cardT = 0;
  }

  /** The journal's page of photographs (null while there are none). */
  journal(v: StoryView): HTMLElement | null {
    const have = PHOTO_CLUES.filter((i) => (v.clues & (1 << i)) !== 0);
    if (!have.length) return null;
    const root = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = `PHOTOGRAPHS  -  ${have.length} OF ${PHOTO_CLUES.length}`;
    h.style.cssText = 'margin:10px 0 6px;font-size:12px;letter-spacing:.14em';
    root.appendChild(h);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px';
    for (const i of have) {
      const fig = document.createElement('figure');
      fig.style.cssText = 'margin:0;padding:5px 5px 4px;background:#efe9dc;color:#2a2620';
      const img = document.createElement('img');
      const url = this.print(i);
      if (url) img.src = url;
      img.alt = CLUES[i]!.name;
      img.style.cssText = 'display:block;width:100%;aspect-ratio:3/2;background:#ccc';
      const cap = document.createElement('figcaption');
      cap.textContent = captionOf(CLUES[i]!.id).text;
      cap.style.cssText = 'margin-top:3px;font-size:11px;line-height:1.3;font-style:italic;font-family:Georgia,serif';
      fig.append(img, cap);
      grid.appendChild(fig);
    }
    root.appendChild(grid);
    return root;
  }

  dispose(): void {
    this.hideCard();
    this.kit.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the frost rings
// ---------------------------------------------------------------------------------------------------------------------

const RING_VERT = /* glsl */ `
varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const RING_FRAG = /* glsl */ `
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  float r = length(vUv);
  float a = atan(vUv.y, vUv.x);
  // a thin ring of rime, uneven, with a few crystals that catch the light now and then
  float band = smoothstep(0.08, 0.0, abs(r - 0.78 - 0.03 * sin(a * 7.0 + uSeed)));
  float feather = smoothstep(0.24, 0.0, abs(r - 0.72)) * 0.25;
  vec2 cell = floor(vec2(a * 9.0, r * 14.0));
  float glint = step(0.93, hash(cell + uSeed)) * (0.5 + 0.5 * sin(uTime * 2.3 + hash(cell) * 30.0));
  float alpha = (band * (0.24 + 0.6 * glint) + feather * 0.4) * smoothstep(1.0, 0.92, r);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vec3(0.82, 0.9, 1.0) * (0.9 + glint * 0.6), alpha);
  #include <fog_fragment>
}`;

/**
 * A faint ring of frost on the ground at each marked spot not photographed yet (drawn from the second act, when the
 * Zenit can be had). Six small quads, each its own mesh so the frustum culls it; nothing per frame but a time uniform.
 */
export class FrostRings {
  readonly root = new THREE.Group();
  private readonly rings: { i: number; mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[] = [];
  private readonly geo = new THREE.PlaneGeometry(2.8, 2.8).rotateX(-Math.PI / 2);

  constructor() {
    this.root.name = 'zenit-rings';
    for (const i of PHOTO_CLUES) {
      const c = CLUES[i]!;
      const shot = SHOTS[c.id];
      const mat = new THREE.ShaderMaterial({
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSeed: { value: i * 1.7 } }]),
        transparent: true,
        depthWrite: false,
        fog: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.position.set(c.at.x, (shot?.floor ?? 0) + 0.025, c.at.z);
      mesh.renderOrder = 2;
      mesh.visible = false;
      this.root.add(mesh);
      this.rings.push({ i, mesh, mat });
    }
  }

  update(time: number, v: StoryView): void {
    const on = v.ch >= CH.act2 && v.ch < CH.ended;
    for (const r of this.rings) {
      r.mesh.visible = on && (v.clues & (1 << r.i)) === 0;
      if (r.mesh.visible) r.mat.uniforms.uTime!.value = time;
    }
  }

  dispose(): void {
    this.geo.dispose();
    for (const r of this.rings) r.mat.dispose();
  }
}
