/**
 * First-person view of whatever the player swings (`logic/melee.ts`): the right hand, the weapon in it, and for a
 * pair (the boxing gloves, the sickle and hammer) the left hand too. One rig holds every weapon and shows the one in
 * hand. It is driven by a
 * `MeleeView` (how far through its swing the weapon is, which swing of the combo, whether it is a heavy one), not by
 * the guns' `ViewmodelPose`, because nothing here has a magazine, a sight or a reload.
 *
 * A moment of a swing is written as WHERE THE HAND IS and WHERE THE WEAPON POINTS, in view space (+X right, +Y up,
 * -Z ahead), never as hand angles: the frustum is 0.87 of the depth wide and 0.49 high either side of the middle at
 * 16:9 (0.40 high on a wide phone), so a row can be checked against the screen by reading it. The hand is then stood
 * so its forearm runs to the elbow, the wrist bends as far as a wrist does toward a hammer grip, and the weapon lies
 * exactly along its row. `scripts/qa-melee-look.mjs` draws every moment of every weapon for judging by eye.
 *
 * The first eight weapons share their type's moves. The four that are earned are longer or stranger than those moves
 * were written for (a spear half as long again as the ski pole, a sabre four times the knife, a different tool in each
 * hand), so each brings its own (`OWN`): its own carry, guard and swings, and three more numbers a row saying WHICH
 * WAY ITS WORKING SIDE FACES (an edge, a hammer's face, a sickle's point), so the edge leads the cut and the flat of a
 * blade is turned to the eye when it is carried, whatever the hand is doing.
 */
import * as THREE from 'three';
import { MELEE, swingHand, type MeleeId, type MeleeType, type SwingPhase } from '../../logic/melee';
import { sampleRows } from './grenade';
import { GloveHand, HAND_POSES, type HandPose } from './hand';
import { PartBuilder } from './kit';
import { RigMaterials, type SharedTextures } from './materials';

export interface MeleeView {
  id: MeleeId;
  /** 0 = put away, 1 = up and ready. */
  raise: number;
  phase: SwingPhase;
  /** 0..1 through the swing (`swingProgress`): wind-up to 0.3, strike to 0.55, recovery to 1. */
  u: number;
  heavy: boolean;
  combo: number;
  /** 0..1 into the guard. */
  guard: number;
  time: number;
  move: number;
  bobPhase: number;
  sprint: number;
  lookYaw: number;
  lookPitch: number;
  reducedMotion: boolean;
}

type Style =
  | 'slashR' | 'slashL' | 'thrust' | 'overhead' | 'jab' | 'hook' | 'whipR' | 'whipL' | 'whipOver'
  // the earned weapons' own: the spear's, the axe's, the sickle and hammer's, the sabre's
  | 'lunge' | 'sweep' | 'hewR' | 'hewL' | 'cleave' | 'rap' | 'reap' | 'smash' | 'cutR' | 'cutL' | 'cutDown';
/** Hand x, y, z, then where the weapon points (for a fist: where the thumb side faces). */
type Pose = readonly [number, number, number, number, number, number];
/** The same, then which way the weapon's working side faces. */
type EdgedPose = readonly [number, number, number, number, number, number, number, number, number];

// how each type is carried between swings
const REST: Record<MeleeType, Pose> = {
  blade: [0.2, -0.13, -0.42, -0.15, 0.85, -0.5],
  // a pan is wide: it is carried low and out to the side, clear of the crosshair
  blunt: [0.3, -0.2, -0.44, 0.25, 0.88, -0.4],
  // a pole is carried like a spear, its point a little under the crosshair
  pole: [0.2, -0.15, -0.36, -0.05, 0.1, -0.99],
  heavy: [0.24, -0.2, -0.42, 0, 0.82, -0.57],
  paired: [0.18, -0.13, -0.48, -0.45, 0.85, -0.1],
  flail: [0.22, -0.08, -0.46, -0.3, 0.9, -0.3],
};
// and held across the body to take a blow
const GUARD: Record<MeleeType, Pose> = {
  blade: [0.05, -0.07, -0.42, -0.8, 0.55, -0.2],
  blunt: [0.05, -0.07, -0.42, -0.8, 0.55, -0.2],
  pole: [0.16, -0.1, -0.4, -0.9, 0.3, -0.3],
  heavy: [0.07, -0.1, -0.44, -0.8, 0.5, -0.3],
  paired: [0.11, -0.04, -0.4, -0.5, 0.85, -0.1],
  flail: REST.flail,
};

// the moments between rest and rest: t, then a Pose
const MIDS: Record<Style, number[][]> = {
  // cocked out to the right, across to the left
  slashR: [
    [0.3, 0.27, 0.0, -0.4, 0.55, 0.8, -0.1],
    [0.42, 0.1, -0.02, -0.56, -0.2, 0.45, -0.87],
    [0.55, -0.14, -0.12, -0.5, -0.9, 0.05, -0.45],
    [0.78, 0.02, -0.14, -0.45, -0.6, 0.5, -0.6],
  ],
  // and back: cocked across the body, out to the right
  slashL: [
    [0.3, -0.02, 0.0, -0.42, -0.8, 0.55, 0.1],
    [0.42, 0.12, -0.02, -0.56, 0.1, 0.45, -0.88],
    [0.55, 0.3, -0.12, -0.48, 0.85, 0.1, -0.5],
    [0.78, 0.26, -0.13, -0.44, 0.3, 0.7, -0.6],
  ],
  // drawn back, straight out
  thrust: [
    [0.3, 0.24, -0.12, -0.3, -0.1, 0.5, -0.85],
    [0.55, 0.08, -0.06, -0.8, -0.12, 0.22, -0.97],
    [0.75, 0.16, -0.1, -0.55, -0.12, 0.5, -0.85],
  ],
  // up over the shoulder, down in front
  overhead: [
    [0.3, 0.2, 0.08, -0.34, 0.1, 0.8, 0.6],
    [0.44, 0.14, 0.04, -0.5, -0.05, 0.75, -0.65],
    [0.55, 0.08, -0.14, -0.6, -0.1, -0.1, -0.99],
    [0.8, 0.14, -0.15, -0.5, -0.12, 0.4, -0.9],
  ],
  // the fists: a straight jab (the fist turns palm down as it lands), a hook for the heavy one
  jab: [
    [0.3, 0.2, -0.13, -0.42, -0.45, 0.85, -0.1],
    [0.55, 0.04, -0.03, -0.82, -0.95, 0.25, 0],
    [0.8, 0.12, -0.1, -0.6, -0.6, 0.7, 0],
  ],
  hook: [
    [0.3, 0.32, -0.08, -0.4, 0, 0.9, 0.4],
    [0.55, -0.06, -0.02, -0.58, -0.3, 0.9, 0.3],
    [0.8, 0.1, -0.1, -0.5, -0.45, 0.85, 0],
  ],
  // the chain: the fist leads and the chain follows it (`CHAIN` below)
  whipR: [
    [0.3, 0.3, 0.04, -0.38, -0.2, 0.9, 0.2],
    [0.42, 0.1, 0.0, -0.55, -0.5, 0.7, -0.4],
    [0.55, -0.12, -0.08, -0.5, -0.8, 0.5, -0.3],
    [0.78, 0.04, -0.06, -0.46, -0.5, 0.8, -0.3],
  ],
  whipL: [
    [0.3, 0.0, 0.04, -0.42, -0.6, 0.8, 0.1],
    [0.42, 0.12, 0.0, -0.55, -0.3, 0.8, -0.5],
    [0.55, 0.3, -0.08, -0.48, 0.1, 0.9, -0.4],
    [0.78, 0.25, -0.06, -0.45, -0.2, 0.9, -0.3],
  ],
  whipOver: [
    [0.3, 0.22, 0.1, -0.36, -0.2, 0.8, 0.5],
    [0.44, 0.14, 0.06, -0.5, -0.3, 0.8, -0.5],
    [0.55, 0.08, -0.1, -0.6, -0.4, 0.5, -0.75],
    [0.8, 0.14, -0.08, -0.5, -0.3, 0.85, -0.4],
  ],

  // ---- the earned weapons' own moves: t, the hand, where the weapon points, which way its working side faces ----
  // They are long, and a long weapon pointed at what it strikes is pointed along the line of sight, where it shows as
  // a stub. So each swing here turns ACROSS the view like a wiper, in a plane tipped a little forward, and the hand
  // goes the other way to keep the working end inside the frame. The edge faces the way the weapon is turning, with
  // the flat turned a little to the eye so a blade is never a hairline.

  // the spear: drawn back with its point a little wide, then straight out at the crosshair, its leaf flat to the eye
  lunge: [
    [0.3, 0.3, -0.2, -0.4, -0.05, 0.3, -0.95, 0.7, 0.69, 0.18],
    [0.55, 0.2, -0.18, -0.7, -0.2, 0.16, -0.967, 0.65, 0.76, -0.01],
    [0.75, 0.25, -0.19, -0.52, -0.2, 0.32, -0.93, 0.68, 0.73, 0.1],
  ],
  // and its sweep: the point out to the right, across everything in front, out to the left
  sweep: [
    [0.3, 0.16, -0.18, -0.56, 0.56, 0.3, -0.77, 0.81, -0.41, 0.42],
    [0.42, 0.1, -0.19, -0.58, 0, 0.25, -0.97, 0.83, 0.54, 0.14],
    [0.55, 0.06, -0.2, -0.56, -0.66, 0.12, -0.74, 0.62, 0.64, -0.45],
    [0.78, 0.16, -0.2, -0.5, -0.5, 0.35, -0.79, 0.79, 0.56, -0.25],
  ],
  // the axe: from the right shoulder down to the left, and back from the left
  hewR: [
    [0.3, 0.26, -0.12, -0.5, 0.4, 0.75, -0.53, -0.91, 0.4, -0.13],
    [0.42, 0.14, -0.14, -0.54, -0.2, 0.65, -0.73, -0.62, -0.66, -0.42],
    [0.55, 0.04, -0.2, -0.54, -0.8, 0.1, -0.59, -0.19, -0.98, 0.09],
    [0.78, 0.1, -0.2, -0.5, -0.55, 0.45, -0.7, -0.44, -0.87, -0.21],
  ],
  hewL: [
    [0.3, 0.06, -0.12, -0.5, -0.6, 0.66, -0.45, 0.8, 0.53, -0.29],
    [0.42, 0.1, -0.15, -0.55, 0.1, 0.66, -0.74, 0.99, -0.02, 0.11],
    [0.55, 0.08, -0.2, -0.56, 0.8, 0.1, -0.59, 0.15, -0.99, 0.04],
    [0.78, 0.2, -0.2, -0.5, 0.3, 0.6, -0.74, 0.4, -0.78, -0.47],
  ],
  // held high where it can be seen, then down and a little across on whatever is under the crosshair
  cleave: [
    [0.3, 0.2, -0.16, -0.52, 0.08, 0.8, -0.6, -0.9, -0.2, -0.38],
    [0.44, 0.2, -0.18, -0.52, -0.12, 0.62, -0.77, -0.85, -0.47, -0.25],
    [0.55, 0.22, -0.24, -0.5, -0.42, 0.02, -0.9, -0.64, -0.72, 0.28],
    [0.8, 0.2, -0.23, -0.48, -0.3, 0.4, -0.87, -0.79, -0.62, -0.01],
  ],
  // the hammer (right hand): a short rap on the head in front
  rap: [
    [0.3, 0.29, -0.08, -0.5, 0.1, 0.97, -0.2, -0.72, -0.07, -0.69],
    [0.55, 0.12, -0.16, -0.64, -0.45, 0.62, -0.64, -0.57, -0.75, -0.33],
    [0.8, 0.22, -0.2, -0.6, -0.25, 0.8, -0.55, -0.67, -0.55, -0.5],
  ],
  // the sickle (left hand, written as a right hand's): hooked in from the outside, its point leading
  reap: [
    [0.3, 0.32, -0.1, -0.52, 0.3, 0.9, -0.3, -0.84, 0.11, -0.53],
    [0.55, 0.06, -0.1, -0.66, -0.5, 0.6, -0.62, -0.74, -0.67, -0.05],
    [0.8, 0.2, -0.18, -0.6, -0.3, 0.85, -0.45, -0.89, -0.42, -0.2],
  ],
  // the hammer raised, and brought down overhead
  smash: [
    [0.3, 0.25, -0.06, -0.5, 0.12, 0.93, -0.35, -0.72, -0.16, -0.68],
    [0.44, 0.17, -0.08, -0.58, -0.1, 0.85, -0.52, -0.59, -0.47, -0.66],
    [0.55, 0.08, -0.22, -0.66, -0.35, 0.35, -0.87, -0.35, -0.91, -0.22],
    [0.8, 0.2, -0.22, -0.6, -0.2, 0.7, -0.68, -0.48, -0.68, -0.56],
  ],
  // the sabre: a cut from the right, the same back from the left
  cutR: [
    [0.3, 0.26, -0.13, -0.48, 0.42, 0.66, -0.62, -0.75, -0.13, -0.65],
    [0.42, 0.14, -0.15, -0.54, -0.25, 0.62, -0.74, -0.77, -0.6, -0.24],
    [0.55, 0.04, -0.2, -0.54, -0.82, 0.12, -0.56, -0.3, -0.92, 0.24],
    [0.78, 0.12, -0.18, -0.48, -0.6, 0.45, -0.66, -0.58, -0.81, -0.03],
  ],
  cutL: [
    [0.3, 0.06, -0.14, -0.5, -0.6, 0.6, -0.53, 0.8, 0.52, -0.31],
    [0.42, 0.1, -0.15, -0.55, 0.1, 0.66, -0.74, 0.99, -0.07, 0.07],
    [0.55, 0.06, -0.2, -0.56, 0.8, 0.1, -0.59, 0.24, -0.96, 0.17],
    [0.78, 0.2, -0.18, -0.5, 0.3, 0.6, -0.74, 0.55, -0.74, -0.38],
  ],
  // and the one that goes through two: stood up high, then down from the shoulder to the opposite hip
  cutDown: [
    [0.3, 0.16, -0.14, -0.54, 0.05, 0.74, -0.67, -0.96, -0.15, -0.23],
    [0.44, 0.1, -0.16, -0.56, -0.35, 0.45, -0.82, -0.88, -0.47, 0.12],
    [0.55, 0.04, -0.24, -0.54, -0.72, -0.15, -0.68, -0.05, -0.96, 0.26],
    [0.8, 0.1, -0.2, -0.5, -0.6, 0.3, -0.74, -0.36, -0.93, -0.09],
  ],
};

/** A weapon with moves of its own, in place of its type's. */
interface Moves {
  rest: EdgedPose;
  guard: EdgedPose;
  /** The other hand's carry and guard, for a pair with a different tool in each (written as a right hand's). */
  restL?: EdgedPose;
  guardL?: EdgedPose;
  /** The light swings, taken in turn, and the heavy one. */
  light: readonly Style[];
  heavy: Style;
}
const OWN: Partial<Record<MeleeId, Moves>> = {
  // carried slanting up the right of the screen, the leaf above and to the right of the crosshair, flat to the eye
  rogatina: {
    rest: [0.27, -0.19, -0.46, -0.06, 0.5, -0.865, 0.81, 0.53, 0.25],
    guard: [0.2, -0.14, -0.46, -0.75, 0.45, -0.48, 0.53, 0.85, -0.03],
    light: ['lunge'],
    heavy: 'sweep',
  },
  // leaning ahead so the head is inside a phone's screen too, its bit turned in so the whole head is seen
  fireAxe: {
    rest: [0.26, -0.2, -0.44, -0.05, 0.68, -0.73, -0.86, -0.41, -0.32],
    guard: [0.1, -0.12, -0.46, -0.78, 0.5, -0.37, 0.57, 0.82, -0.09],
    light: ['hewR', 'hewL'],
    heavy: 'cleave',
  },
  // a tool stood up in each hand, low and wide of the crosshair; crossed in front to guard
  serpMolot: {
    rest: [0.27, -0.2, -0.58, -0.12, 0.9, -0.42, -0.6, -0.1, -0.8],
    guard: [0.13, -0.12, -0.46, -0.6, 0.78, -0.15, -0.3, -0.2, -0.93],
    restL: [0.28, -0.2, -0.6, -0.1, 0.92, -0.38, -0.6, -0.1, -0.75],
    guardL: [0.13, -0.12, -0.54, -0.6, 0.78, -0.15, -0.78, -0.6, 0],
    light: ['rap', 'reap'],
    heavy: 'smash',
  },
  // its point up under the top of the screen, the flat of the blade to the eye so its curve is seen
  shashka: {
    rest: [0.25, -0.17, -0.44, -0.2, 0.5, -0.84, -0.76, -0.62, -0.19],
    guard: [0.22, -0.12, -0.48, -0.72, 0.45, -0.53, -0.5, -0.85, 0],
    light: ['cutR', 'cutL'],
    heavy: 'cutDown',
  },
};
// which way the chain flies through its swings (it hangs straight down between them): t, x, y, z
const CHAIN: Partial<Record<Style, number[][]>> = {
  whipR: [[0, 0, -1, 0], [0.3, 0.5, 0.4, 0.75], [0.42, -0.2, 0.1, -1], [0.55, -0.9, -0.1, -0.4], [0.78, -0.4, -0.8, -0.2], [1, 0, -1, 0]],
  whipL: [[0, 0, -1, 0], [0.3, -0.6, 0.4, 0.7], [0.42, 0.2, 0.1, -1], [0.55, 0.9, -0.1, -0.4], [0.78, 0.4, -0.8, -0.2], [1, 0, -1, 0]],
  whipOver: [[0, 0, -1, 0], [0.3, 0.1, 0.55, 0.8], [0.44, 0, 0.7, -0.7], [0.55, 0, -0.35, -0.94], [0.8, 0, -0.9, -0.3], [1, 0, -1, 0]],
};

/** Which swing this is: lights alternate sides (a pole always thrusts), and each type's heavy swing is its own. */
function styleFor(id: MeleeId, type: MeleeType, heavy: boolean, combo: number): Style {
  const own = OWN[id];
  if (own) return heavy ? own.heavy : own.light[combo % own.light.length]!;
  if (type === 'paired') return heavy ? 'hook' : 'jab';
  if (type === 'flail') return heavy ? 'whipOver' : combo % 2 === 0 ? 'whipR' : 'whipL';
  if (heavy) return type === 'blade' ? 'thrust' : type === 'pole' ? 'slashR' : 'overhead';
  if (type === 'pole') return 'thrust';
  return combo % 2 === 0 ? 'slashR' : 'slashL';
}

// a pole's thrust starts from its own carry (it is already pointing ahead)
const POLE_THRUST: number[][] = [
  [0.3, 0.22, -0.15, -0.24, -0.05, 0.1, -0.99],
  [0.55, 0.12, -0.1, -0.66, -0.03, 0.05, -1],
  [0.75, 0.17, -0.13, -0.46, -0.05, 0.1, -0.99],
];

const rowsCache = new Map<string, Map<Style, number[][]>>();
const rowsCacheL = new Map<string, Map<Style, number[][]>>();
/**
 * A style's rows for one weapon: from its rest (its own, or its type's), through the style's moments, back to rest.
 * `left` asks for the other hand's, for a pair that carries each hand differently.
 */
function rowsFor(id: MeleeId, type: MeleeType, style: Style, left: boolean): number[][] {
  const own = OWN[id];
  const cache = left ? rowsCacheL : rowsCache;
  const key = own ? id : type;
  let styles = cache.get(key);
  if (!styles) {
    styles = new Map();
    cache.set(key, styles);
  }
  let rows = styles.get(style);
  if (!rows) {
    const mids = !own && type === 'pole' && style === 'thrust' ? POLE_THRUST : MIDS[style];
    const rest = own ? ((left && own.restL) || own.rest) : REST[type];
    rows = [[0, ...rest], ...mids, [1, ...rest]];
    styles.set(style, rows);
  }
  return rows;
}

// ---- the outlines of the earned weapons' blades, as [f, y]: f toward the working side, y along the weapon ----

/** A leaf: broadest a third of the way up, drawn to a point. */
function leafPts(y0: number, len: number, half: number): [number, number][] {
  const side: [number, number][] = [[0.3, 0], [0.82, 0.13], [1, 0.3], [0.88, 0.5], [0.56, 0.75], [0.22, 0.93]];
  const out: [number, number][] = side.map(([w, t]) => [w * half, y0 + t * len]);
  out.push([0, y0 + len]);
  for (let i = side.length - 1; i >= 0; i--) out.push([-side[i]![0] * half, y0 + side[i]![1] * len]);
  return out;
}

/** A sabre: `bow` is how far the point lies back of the grip's line; the edge is the outside of the curve. */
function sabrePts(y0: number, len: number, bow: number, wide: number): [number, number][] {
  const n = 12;
  const edge: [number, number][] = [];
  const spine: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const back = -wide / 2 - bow * t * t;
    // the last fifth: the edge sweeps back to meet the spine at the point
    const w = t < 0.8 ? wide * (1 - 0.2 * t) : wide * 0.84 * Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2));
    spine.push([back, y0 + len * t]);
    if (i < n) edge.push([back + w, y0 + len * t]);
  }
  return [...edge, ...spine.reverse()];
}

/** A sickle's crescent round (cf, cy): from angle a0 round to a1, widest near the tang and drawn to a point. */
function sicklePts(cf: number, cy: number, r: number, a0: number, a1: number, wide: number): [number, number][] {
  const n = 16;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const w = wide * Math.min(1, 0.6 + 1.6 * t) * (1 - t ** 3);
    outer.push([cf + Math.cos(a) * r, cy + Math.sin(a) * r]);
    if (i < n) inner.push([cf + Math.cos(a) * (r - w), cy + Math.sin(a) * (r - w)]);
  }
  return [...outer, ...inner.reverse()];
}

const UP = new THREE.Vector3(0, 1, 0);
/** How far a wrist bends off the line of the forearm, radians. */
const WRIST = 0.7;
// where a weapon's grip sits in the hand (hand space: fingers along -Z, the back of the hand +Y, the thumb -X)
const PALM = new THREE.Vector3(0, -0.027, -0.085);
// and where a chain leaves the fist (the little-finger side)
const FIST_END = new THREE.Vector3(0.045, -0.035, -0.055);
// the thumb closed over the fingers (the gun poses leave it lying along a frame that is not there)
const wrapped = (p: HandPose): HandPose => ({ ...p, thumb: { bx: 0.7, by: 0.75, bz: 0.2, c1: 0.8, c2: 0.7 } });
const GRIP = wrapped(HAND_POSES.grip);
// the earned weapons' grip: the thumb brought round under the handle onto the tips of the first two fingers, closing
// the ring (the pose above leaves it lying out along the weapon, which shows as a spare finger from most sides)
const HOLD: HandPose = { ...HAND_POSES.grip, thumb: { bx: 0.4, by: -0.3, bz: 0.8, c1: 0.2, c2: 1.2 } };
const FIST = wrapped(HAND_POSES.fist);
const CHAIN_SEGS = 3;
const CHAIN_LINKS = 4;
const LINK = 0.04;

export class MeleeRig {
  readonly root = new THREE.Group();
  private readonly mats: RigMaterials;
  private readonly own = new Map<string, THREE.Material>();
  private readonly rh: GloveHand;
  private readonly lh: GloveHand;
  private readonly weapons = new Map<MeleeId, THREE.Group>();
  /** What the left hand wears or holds, for the pairs. */
  private readonly lefts = new Map<MeleeId, THREE.Group>();
  private shown: MeleeId | null = null;
  private readonly chainSegs: THREE.Group[] = [];
  private readonly chainDirs: THREE.Vector3[] = [];
  private readonly builders: PartBuilder[] = [];
  // a hand's pose: x, y, z, where the weapon points, and (an earned weapon's rows) which way its working side faces
  private readonly a = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  private readonly b = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  private readonly c = [0, 0, 0];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qw = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly arm = new THREE.Vector3();
  private readonly hx = new THREE.Vector3();
  private readonly hy = new THREE.Vector3();
  private readonly hz = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3(0.34, -0.62, 0.32);

  constructor(tex: SharedTextures) {
    this.mats = new RigMaterials(tex);
    this.root.visible = false;
    this.own.set('wood', new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.82, metalness: 0 }));
    this.own.set('iron', new THREE.MeshStandardMaterial({ color: 0x3d4045, roughness: 0.58, metalness: 0.5 }));
    this.own.set('leather', new THREE.MeshStandardMaterial({ color: 0x9a1f1c, roughness: 0.55, metalness: 0.05 }));
    this.own.set('tape', new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.85, metalness: 0 }));
    this.own.set('ash', new THREE.MeshStandardMaterial({ color: 0xc4ab7e, roughness: 0.78, metalness: 0 }));
    this.own.set('paint', new THREE.MeshStandardMaterial({ color: 0xb3261c, roughness: 0.48, metalness: 0.15 }));
    this.own.set('horn', new THREE.MeshStandardMaterial({ color: 0x33271f, roughness: 0.46, metalness: 0.05 }));
    const mat = (k: string): THREE.Material => this.own.get(k) ?? this.mats.get(k);

    this.rh = new GloveHand({ side: 'right', seed: 41 }, this.mats);
    this.lh = new GloveHand({ side: 'left', seed: 43 }, this.mats);
    this.root.add(this.rh.root, this.lh.root);

    const make = (fn: (b: PartBuilder) => void): THREE.Group => {
      const b = new PartBuilder();
      fn(b);
      this.builders.push(b);
      return b.build(mat, { wood: 14, leather: 12, iron: 9 });
    };
    // a weapon stands along +Y with its grip at the origin and its working side toward -Z (a blade's edge, the face
    // of a pan, a maul's wedge); `orient` lays it along the swing each frame
    const held = (id: MeleeId, fn: (b: PartBuilder) => void): void => {
      const g = make(fn);
      g.position.copy(PALM);
      g.visible = false;
      this.rh.root.add(g);
      this.weapons.set(id, g);
    };
    held('knife', (b) => {
      b.cyl('grip', 0.014, 0.015, 0.11, 0, 0, 0, 'y', 10);
      b.box('steel', 0.012, 0.012, 0.042, 0, 0.06, 0);
      b.box('steel', 0.0035, 0.13, 0.03, 0, 0.13, 0, 0.001);
      b.box('steel', 0.003, 0.03, 0.018, 0, 0.205, 0.004, 0.001, { rx: 0.5 });
    });
    held('skillet', (b) => {
      b.cyl('iron', 0.011, 0.012, 0.2, 0, 0.05, 0, 'y', 10);
      b.cyl('iron', 0.11, 0.098, 0.03, 0, 0.25, 0, 'z', 22);
      b.torus('iron', 0.108, 0.007, 0, 0.25, -0.015, undefined, 22);
    });
    held('skiPole', (b) => {
      b.cyl('rubber', 0.014, 0.015, 0.14, 0, 0, 0, 'y', 10);
      b.cyl('steel', 0.006, 0.0075, 0.95, 0, 0.53, 0, 'y', 8);
      b.torus('polymer', 0.04, 0.004, 0, 0.9, 0, { rx: Math.PI / 2 }, 14);
      b.cyl('steel', 0.001, 0.006, 0.07, 0, 1.04, 0, 'y', 6);
    });
    held('maul', (b) => {
      b.cyl('wood', 0.015, 0.018, 0.72, 0, 0.24, 0, 'y', 10);
      b.box('iron', 0.065, 0.085, 0.18, 0, 0.56, 0, 0.004);
      b.box('iron', 0.012, 0.08, 0.05, 0, 0.56, -0.105, 0.002);
    });
    held('bat', (b) => {
      b.cyl('wood', 0.03, 0.016, 0.74, 0, 0.26, 0, 'y', 12);
      b.cyl('rubber', 0.017, 0.018, 0.2, 0, -0.02, 0, 'y', 10);
      b.cyl('wood', 0.022, 0.022, 0.02, 0, -0.12, 0, 'y', 10);
    });
    held('hockey', (b) => {
      b.box('wood', 0.022, 1.1, 0.03, 0, 0.44, 0, 0.004);
      b.cyl('rubber', 0.018, 0.018, 0.18, 0, -0.04, 0, 'y', 8);
      // the blade, turned forward at the foot
      b.box('wood', 0.012, 0.07, 0.28, 0, 1.0, -0.13, 0.003);
      b.box('rubber', 0.014, 0.075, 0.1, 0, 1.0, -0.2, 0.003);
    });
    // the gloves are built round the fist itself, in the hand's own space, so they need no laying along anything
    const glove = (b: PartBuilder): void => {
      b.sphere('leather', 0.064, 0, -0.01, -0.082, 1, 0.94, 1.32, 16);
      b.sphere('leather', 0.03, -0.055, -0.016, -0.072, 1, 1, 1.5, 10);
      b.cyl('leather', 0.046, 0.05, 0.07, 0, -0.004, 0.025, 'z', 14);
      b.torus('tape', 0.049, 0.005, 0, -0.004, 0.058, undefined, 14);
    };
    const rightGlove = make(glove);
    rightGlove.visible = false;
    this.rh.root.add(rightGlove);
    this.weapons.set('gloves', rightGlove);
    const leftGlove = make(glove);
    leftGlove.visible = false;
    this.lh.root.add(leftGlove);
    this.lefts.set('gloves', leftGlove);

    // ---- the four that are earned ----
    // the rogatina: a long ash shaft, a broad leaf of steel, and under it the crossguard a bear is stopped on
    held('rogatina', (b) => {
      b.cyl('ash', 0.0125, 0.0145, 0.86, 0, 0.31, 0, 'y', 10);
      b.cyl('steel', 0.011, 0.0175, 0.15, 0, 0.745, 0, 'y', 10);
      b.box('steel', 0.016, 0.024, 0.22, 0, 0.72, 0, 0.005);
      b.sphere('steel', 0.016, 0, 0.72, 0.11, 1, 1, 1, 8);
      b.sphere('steel', 0.016, 0, 0.72, -0.11, 1, 1, 1, 8);
      b.side('steel', leafPts(0.8, 0.36, 0.066), 0.009, 0, 0.004);
      b.box('steel', 0.014, 0.27, 0.01, 0, 0.94, 0, 0.004);
    });
    // the fire axe: a red head with its edge ground bright, a pick behind, a pale handle
    held('fireAxe', (b) => {
      const y = 0.55;
      b.cyl('ash', 0.015, 0.017, 0.74, 0, 0.25, 0, 'y', 10);
      b.cyl('ash', 0.02, 0.018, 0.04, 0, -0.12, 0, 'y', 10);
      b.box('paint', 0.04, 0.076, 0.05, 0, y, 0, 0.006);
      b.side('paint', [[0.02, y - 0.034], [0.085, y - 0.066], [0.105, y - 0.08], [0.105, y + 0.07], [0.085, y + 0.058], [0.02, y + 0.034]], 0.026, 0, 0.005);
      b.side('steel', [[0.1, y - 0.078], [0.128, y - 0.092], [0.143, y - 0.04], [0.143, y + 0.03], [0.128, y + 0.08], [0.1, y + 0.068]], 0.012, 0, 0.0055);
      b.side('paint', [[-0.02, y + 0.024], [-0.075, y + 0.013], [-0.075, y - 0.017], [-0.02, y - 0.028]], 0.022, 0, 0.004);
      b.side('steel', [[-0.072, y + 0.013], [-0.128, y - 0.012], [-0.072, y - 0.017]], 0.014, 0, 0.004);
    });
    // the shashka: no guard, a dark grip with a hooked pommel, a long blade with a little curve to it
    held('shashka', (b) => {
      b.box('horn', 0.02, 0.118, 0.029, 0, 0.005, 0, 0.009);
      b.side('horn', [[-0.0145, -0.045], [0.0145, -0.045], [0.03, -0.062], [0.03, -0.08], [0.012, -0.079], [-0.0145, -0.066]], 0.02, 0, 0.005);
      b.box('brass', 0.024, 0.014, 0.034, 0, 0.068, 0, 0.003);
      b.side('steel', sabrePts(0.072, 0.66, 0.045, 0.033), 0.005, 0, 0.002);
    });
    // serp and molot: the hammer in the right hand...
    held('serpMolot', (b) => {
      b.cyl('wood', 0.0135, 0.0155, 0.33, 0, 0.065, 0, 'y', 10);
      b.box('metal', 0.04, 0.044, 0.1, 0, 0.215, -0.004, 0.005);
      b.box('metal', 0.046, 0.05, 0.016, 0, 0.215, -0.056, 0.004);
      b.side('metal', [[-0.04, 0.237], [-0.082, 0.224], [-0.082, 0.207], [-0.04, 0.193]], 0.04, 0, 0.004);
    });
    // ...and the sickle in the left: it lives on the left hand, which is the right one in a mirror
    const sickle = make((b) => {
      b.cyl('wood', 0.0135, 0.0155, 0.18, 0, 0, 0, 'y', 10);
      b.cyl('steel', 0.012, 0.0155, 0.03, 0, 0.1, 0, 'y', 8);
      b.side('steel', sicklePts(0.067, 0.167, 0.095, -2.356, -6.46, 0.03), 0.005, 0, 0.002);
    });
    sickle.position.copy(PALM);
    sickle.visible = false;
    this.lh.root.add(sickle);
    this.lefts.set('serpMolot', sickle);
    // the chain is three short lengths that each follow the one before, so it trails and whips instead of standing
    // like a rod; it hangs from the fist but lives in view space
    for (let s = 0; s < CHAIN_SEGS; s++) {
      const g = make((b) => {
        for (let i = 0; i < CHAIN_LINKS; i++) b.torus('steel', 0.014, 0.004, 0, LINK * (i + 0.5), 0, { ry: (s * CHAIN_LINKS + i) % 2 ? Math.PI / 2 : 0 }, 10);
        if (s === CHAIN_SEGS - 1) b.sphere('iron', 0.028, 0, LINK * CHAIN_LINKS + 0.02, 0, 1, 1, 1, 10);
      });
      g.visible = false;
      this.root.add(g);
      this.chainSegs.push(g);
      this.chainDirs.push(new THREE.Vector3(0, -1, 0));
    }
  }

  /** Show or hide a hand's own fingers (a boxing glove covers them, and they would poke through it). */
  private bare(hand: GloveHand, on: boolean): void {
    for (const c of hand.root.children) if ((c as THREE.SkinnedMesh).isSkinnedMesh) c.visible = on;
  }

  /**
   * Stand a hand at `p` with its thumb side toward the pose's direction, its forearm running to the elbow. Worked in
   * the right hand's space: the left hand is the same pose seen in a mirror. Leaves the direction in `this.d` and the
   * hand's rotation in `this.q` (both in the right hand's space).
   */
  private orient(hand: GloveHand, p: readonly number[], mirror: boolean, dx: number, dy: number): void {
    const s = mirror ? -1 : 1;
    const { pos, d, arm, hx, hy, hz, v } = this;
    pos.set(p[0]! + s * dx, p[1]! + dy, p[2]!);
    d.set(p[3]!, p[4]!, p[5]!).normalize();
    arm.copy(this.elbow).sub(pos).normalize();
    // a hammer grip wants the hand square to the weapon; the wrist gives it as much of that as a wrist has
    hz.copy(arm);
    v.copy(arm).addScaledVector(d, -arm.dot(d));
    const len = v.length();
    if (len > 1e-4) {
      v.multiplyScalar(1 / len);
      const th = Math.acos(THREE.MathUtils.clamp(arm.dot(v), -1, 1));
      if (th > 1e-3) {
        const t = Math.min(1, WRIST / th);
        hz.copy(arm).multiplyScalar(Math.sin((1 - t) * th)).addScaledVector(v, Math.sin(t * th)).normalize();
      }
    }
    // the thumb side: along the weapon as far as the hand can (a breath of "up" keeps it steady when they line up)
    v.copy(d).addScaledVector(hz, -d.dot(hz)).addScaledVector(UP, 0.03).addScaledVector(hz, -0.03 * UP.dot(hz));
    hx.copy(v).normalize().negate();
    hy.crossVectors(hz, hx);
    this.q.setFromRotationMatrix(this.m.makeBasis(hx, hy, hz));
    hand.root.position.set(s * pos.x, pos.y, pos.z);
    hand.root.quaternion.set(this.q.x, s * this.q.y, s * this.q.z, this.q.w);
    hand.root.updateMatrix();
    v.set(s * this.elbow.x, this.elbow.y, this.elbow.z).applyMatrix4(this.m.copy(hand.root.matrix).invert());
    hand.aimForearm(v.x, v.y, v.z);
  }

  /** A hand's pose `at` along its rows, raised toward the guard by `k`. */
  private sample(rows: number[][], at: number, guard: readonly number[], k: number, out: number[]): number[] {
    sampleRows(rows, at, out);
    for (let i = 0; i < guard.length; i++) out[i] = out[i]! + (guard[i]! - out[i]!) * k;
    return out;
  }

  /**
   * Lay what a hand holds exactly along its row (call straight after `orient`, which leaves the hand's frame behind).
   * A row that says which way the working side faces is obeyed; otherwise the flat turns with the back of the hand.
   */
  private lay(weapon: THREE.Group, p: readonly number[], edged: boolean): void {
    const { hx, hy, hz, d } = this;
    if (edged) {
      hz.set(p[6]!, p[7]!, p[8]!).addScaledVector(d, -(p[6]! * d.x + p[7]! * d.y + p[8]! * d.z)).normalize().negate();
      hx.crossVectors(d, hz);
    } else {
      hx.copy(hy).addScaledVector(d, -hy.dot(d)).normalize();
      hz.crossVectors(hx, d);
    }
    this.qw.setFromRotationMatrix(this.m.makeBasis(hx, d, hz));
    weapon.quaternion.copy(this.q).invert().multiply(this.qw);
  }

  /** Bring out the weapon in hand and put the others away. */
  private show(id: MeleeId): void {
    this.shown = id;
    for (const [k, g] of this.weapons) g.visible = k === id;
    for (const [k, g] of this.lefts) g.visible = k === id;
  }

  update(view: MeleeView, dt: number): void {
    const vis = view.raise > 0.02;
    this.root.visible = vis;
    if (!vis) return;
    const def = MELEE[view.id];
    const type = def.type;
    if (view.id !== this.shown) this.show(view.id);
    const paired = type === 'paired';
    const flail = type === 'flail';
    // a pair is the boxing gloves, which cover the hands they are built round, or a tool held in each bare hand
    const fists = view.id === 'gloves';
    this.lh.root.visible = paired;
    this.bare(this.rh, !fists);
    if (paired) this.bare(this.lh, !fists);
    for (const g of this.chainSegs) g.visible = flail;

    const own = OWN[view.id];
    const edged = own !== undefined;
    const style = styleFor(view.id, type, view.heavy, view.combo);
    const rows = rowsFor(view.id, type, style, false);
    const idle = view.phase === 'idle';
    const u = idle ? 0 : view.u;
    // a pair takes turns: the right hand throws the even swings, the left the odd ones, and the other one waits
    const leftThrows = swingHand(def, view.heavy, view.combo) === 'left';
    const k = idle ? view.guard : 0;
    const guard = own ? own.guard : GUARD[type];

    const ms = view.reducedMotion ? 0.35 : 1;
    const dx = Math.cos(view.bobPhase) * 0.006 * view.move * ms - view.lookYaw * 0.012 * ms;
    const dy = Math.sin(view.bobPhase * 2) * 0.008 * view.move * ms + view.lookPitch * 0.01 * ms + Math.sin(view.time * 1.7) * 0.003 * ms - (1 - view.raise) * 0.5 - view.sprint * 0.06;

    const right = this.sample(rows, leftThrows ? 0 : u, guard, k, this.a);
    this.orient(this.rh, right, false, dx, dy);
    this.rh.setPose(fists || flail ? FIST : own ? HOLD : GRIP);
    const weapon = this.weapons.get(view.id);
    if (weapon && !fists && !flail) this.lay(weapon, right, edged);
    if (flail) this.hang(style, u, idle, view, dt, ms);
    if (paired) {
      const rowsL = own?.restL ? rowsFor(view.id, type, style, true) : rows;
      const left = this.sample(rowsL, leftThrows ? u : 0, own?.guardL ?? guard, k, this.b);
      this.orient(this.lh, left, true, dx, dy);
      this.lh.setPose(fists ? FIST : own ? HOLD : GRIP);
      const tool = this.lefts.get(view.id);
      if (tool && !fists) this.lay(tool, left, edged);
    }
    this.root.updateMatrixWorld(true);
  }

  /** The chain: each length swings toward where the swing sends it, the far ones later than the near ones. */
  private hang(style: Style, u: number, idle: boolean, view: MeleeView, dt: number, ms: number): void {
    const rows = CHAIN[style];
    if (rows && !idle) sampleRows(rows, u, this.c);
    else {
      // at rest it hangs, and sways a little with the walk
      this.c[0] = Math.sin(view.time * 2.1) * 0.03 * ms + Math.cos(view.bobPhase) * 0.1 * view.move * ms;
      this.c[1] = -1;
      this.c[2] = 0.06 + Math.sin(view.bobPhase * 2) * 0.06 * view.move * ms;
    }
    const want = this.w.set(this.c[0]!, this.c[1]!, this.c[2]!).normalize();
    const at = this.v.copy(FIST_END).applyMatrix4(this.rh.root.matrix);
    for (let s = 0; s < CHAIN_SEGS; s++) {
      const dir = this.chainDirs[s]!;
      // a still frame (dt 0) snaps; otherwise the first length keeps up and the last one lags
      const rate = dt > 0 ? Math.min(1, dt * (46 - s * 14)) : 1;
      dir.lerp(want, rate).normalize();
      const g = this.chainSegs[s]!;
      g.position.copy(at);
      g.quaternion.setFromUnitVectors(UP, dir);
      at.addScaledVector(dir, LINK * CHAIN_LINKS);
    }
  }

  reset(): void {
    this.root.visible = false;
    for (const d of this.chainDirs) d.set(0, -1, 0);
  }

  dispose(): void {
    this.rh.dispose();
    this.lh.dispose();
    for (const b of this.builders) b.dispose();
    for (const m of this.own.values()) m.dispose();
    this.mats.dispose();
  }
}
