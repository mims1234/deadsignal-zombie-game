/**
 * HIRASAKA's side stories, the things in their places (`sides.ts` `SIDE_THINGS`): each a small model of plain-coloured
 * pieces at its real size, all of them merged into ONE mesh the way the collectables are drawn (`zarya/items.ts`
 * `ItemMarks`, through `armsLook.ts` `Marks`): one draw call for every side story's things together, each shown or folded
 * away by itself. Nothing carries words: a timetable is slats, a letter is lines, a film is shapes.
 *
 * Every model stands on y = 0 (the surface under it). One hung on a wall has its back on z = 0 and faces +z (the
 * thing's `yaw` turns it). The icons for the feed are the look-book's (`public/hirasaka/icons/`).
 */
import type { Kit } from '../zarya/items';
import { Marks } from './armsLook';
import { SIDE_THINGS } from './sides';

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
/** The feed's picture for a story (the look-book's icons), or ''. */
const ICON: Record<string, string> = { barber: 'scissors', ferry: 'ticket', reel: 'reel', letters: 'letter', okoze: 'okoze', drums: 'drum', riceball: 'riceball', tanko: 'lamp', cats: 'photo', fishpool: 'photo' };
export function sideIcon(id: string): string {
  return ICON[id] ? `${BASE}hirasaka/icons/${ICON[id]}.webp` : '';
}

const C = {
  paper: 0xe6dcc4,
  paperOld: 0xcfc1a0,
  ink: 0x2a2a30,
  steel: 0xb0b6bc,
  chrome: 0xd0d4d8,
  iron: 0x3d4045,
  rust: 0x8a4a2a,
  wood: 0x8a5a32,
  woodDark: 0x553820,
  red: 0xb8321e,
  navy: 0x2a3348,
  coat: 0x2c3650,
  coatLining: 0x6a5a48,
  brass: 0xb89448,
  bronze: 0x6a5434,
  bronzeHi: 0x8a7040,
  silt: 0x4a3e2c,
  leaf: 0x6a5228,
  water: 0x5a8a96,
  waterDeep: 0x3e6c7a,
  white: 0xf0ece0,
  ginger: 0xc8783a,
  gingerPale: 0xe8c08a,
  tabby: 0x7a6a58,
  tabbyDark: 0x4a4038,
  black: 0x1e1c1e,
  pink: 0xd89098,
  lamp: 0xffe6a0,
  lantern: 0xf0a860,
  rice: 0xf4f0e6,
  bamboo: 0x7a8a48,
  lacquer: 0x5a1410,
  straw: 0xc8b070,
  green: 0x3a5a40,
} as const;

/** A sheet lying flat. */
const sheet = (k: Kit, x: number, y: number, z: number, w: number, d: number, c: number = C.paper, ry = 0): void => void k.box(c, x, y + 0.002, z, w, 0.004, d, ry);
/** Lines of writing on a flat sheet (no words: strokes). */
const writing = (k: Kit, x: number, y: number, z: number, w: number, rows: number, ry = 0): void => {
  for (let i = 0; i < rows; i++) k.box(C.ink, x, y + 0.005, z - 0.012 * rows + i * 0.024, w * (0.55 + ((i * 37) % 5) * 0.08), 0.002, 0.005, ry);
};
const coatOn = (k: Kit, open: boolean): void => {
  // a work coat thrown over the bollard's head (radius 0.3): the shoulders across the top, the body hanging down the
  // sea side, the sleeves hanging down the near side, the collar turned up with the lamp-number tab
  k.box(C.coat, 0, 0.03, 0, 0.5, 0.05, 0.62);
  k.box(C.coat, 0.3, -0.24, 0, 0.05, 0.52, 0.64, 0, 0, -0.1);
  k.box(C.coatLining, 0.27, -0.24, 0, 0.012, 0.48, 0.58, 0, 0, -0.1);
  for (const s of [-1, 1]) k.rod(C.coat, -0.24, 0.0, s * 0.24, -0.34, -0.36, s * 0.34, 0.05, 0.042, 6);
  k.box(0x2e3238, -0.02, 0.08, 0, 0.12, 0.06, 0.5);
  k.box(C.white, -0.02, 0.115, 0.12, 0.05, 0.004, 0.06);
  // the pocket on the hanging front: a flap, buttoned, or open and empty
  if (open) k.box(C.coatLining, 0.34, -0.3, 0.14, 0.03, 0.12, 0.18, 0, 0, -0.6);
  else k.box(0x30343a, 0.335, -0.26, 0.14, 0.02, 0.06, 0.18, 0, 0, -0.1);
};
const scissorsFlat = (k: Kit): void => {
  for (const s of [-1, 1]) {
    k.box(C.chrome, 0.06, 0.006, s * 0.01, 0.14, 0.006, 0.016, s * 0.12);
    k.torus(C.iron, -0.05, 0.006, s * 0.028, 0.026, 0.007, Math.PI / 2, 0, 0);
  }
  k.cyl(C.brass, 0, 0.012, 0, 0.007, 0.007, 0.014, 6);
};
const cat = (k: Kit, fur: number, pale: number, stripes: number | null): void => {
  // sitting, tail round its feet, ears up, looking out along +z
  k.ball(fur, 0, 0.13, 0, 0.11, 0.9, 1.25, 1.05, 9);
  k.ball(pale, 0, 0.12, 0.07, 0.06, 0.8, 1.2, 0.6, 7);
  k.ball(fur, 0, 0.3, 0.06, 0.075, 1.05, 0.95, 0.95, 9);
  for (const s of [-1, 1]) {
    k.cyl(fur, s * 0.04, 0.38, 0.05, 0.002, 0.025, 0.05, 4, 0.2, 0, s * -0.3);
    k.ball(0xd8c040, s * 0.026, 0.31, 0.125, 0.012, 1, 0.8, 0.6, 5);
    k.ball(pale, s * 0.05, 0.02, 0.09, 0.025, 1, 0.6, 1.4, 5);
  }
  k.ball(C.pink, 0, 0.29, 0.135, 0.008, 1, 0.8, 0.8, 4);
  k.torus(fur, 0, 0.02, 0, 0.12, 0.022, Math.PI / 2, 0, 0, Math.PI * 1.2, 10);
  if (stripes !== null) for (let i = 0; i < 4; i++) k.box(stripes, 0, 0.1 + i * 0.045, -0.04, 0.2, 0.012, 0.09, 0, 0.3);
};
const kitten = (k: Kit, x: number, z: number, c: number, r: number): void => {
  k.ball(c, x, 0.05, z, 0.055, 1.3, 0.75, 1, 7);
  k.ball(c, x + Math.cos(r) * 0.06, 0.06, z + Math.sin(r) * 0.06, 0.035, 1, 0.9, 1, 6);
};
const tin = (k: Kit, open: boolean): void => {
  k.box(0x9a2a24, 0, 0.06, 0, 0.32, 0.12, 0.22);
  k.box(C.brass, 0, 0.06, 0.111, 0.06, 0.04, 0.004);
  if (open) {
    k.box(0x9a2a24, 0, 0.18, -0.13, 0.32, 0.12, 0.012, 0, -1.2);
    k.box(0x2a4a2a, 0, 0.115, 0, 0.29, 0.01, 0.19);
  } else k.box(0xa83430, 0, 0.125, 0, 0.33, 0.012, 0.23);
};
const fishShape = (k: Kit, x: number, y: number, z: number, len: number, c: number, ry: number): void => {
  k.ball(c, x, y, z, len / 2, 1, 0.12, 0.45, 6);
  const tx = x - Math.cos(ry) * len * 0.55;
  const tz = z + Math.sin(ry) * len * 0.55;
  k.box(c, tx, y, tz, len * 0.25, 0.006, len * 0.35, ry);
};
const okozeOn = (k: Kit, y: number): void => {
  // the stonefish lying on its side: a lumpy mottled body, a huge down-turned mouth, a crest of spines; dried, stiff
  k.ball(0x7a5a3a, 0, y, 0, 0.11, 1.3, 0.75, 0.8, 8);
  k.ball(0x5a3e28, 0.09, y, 0, 0.07, 1, 0.9, 1.1, 7);
  k.box(0x3a2418, 0.15, y - 0.025, 0, 0.03, 0.01, 0.08);
  for (let i = 0; i < 6; i++) k.cyl(0x4a3020, 0.07 - i * 0.04, y + 0.07, 0, 0.002, 0.01, 0.07, 4, 0, 0, 0.2);
  for (let i = 0; i < 9; i++) k.ball(0x9a7a52, ((i * 37) % 9) * 0.025 - 0.1, y + ((i * 13) % 5) * 0.02 - 0.03, ((i * 7) % 3 - 1) * 0.07, 0.016, 1, 1, 1, 4);
  k.box(0x6a4a2e, -0.16, y, 0, 0.06, 0.08, 0.008);
};
const lacquerDish = (k: Kit): void => {
  // a sanbō: a low stand, its tray
  k.box(C.wood, 0, 0.05, 0, 0.18, 0.1, 0.18);
  k.box(C.white, 0, 0.11, 0, 0.32, 0.02, 0.32);
  for (const s of [-1, 1]) {
    k.box(C.white, s * 0.155, 0.135, 0, 0.012, 0.03, 0.32);
    k.box(C.white, 0, 0.135, s * 0.155, 0.32, 0.03, 0.012);
  }
};
const letterBox = (k: Kit, n: number): void => {
  k.box(C.woodDark, 0, 0.005, 0, 0.42, 0.01, 0.3);
  for (const [x, z, w, d] of [[0, 0.145, 0.42, 0.01], [0, -0.145, 0.42, 0.01], [0.205, 0, 0.01, 0.3], [-0.205, 0, 0.01, 0.3]] as const) k.box(C.woodDark, x, 0.07, z, w, 0.14, d);
  for (let i = 0; i < n; i++) k.box(i % 3 ? C.paper : C.paperOld, -0.17 + i * (0.34 / Math.max(1, n - 1)), 0.08, 0, 0.012, 0.12, 0.2, 0, 0, 0.12 - ((i * 7) % 5) * 0.05);
};
const filmReel = (k: Kit, x: number, y: number, z: number, r: number, full: number): void => {
  k.cyl(C.steel, x, y, z, r, r, 0.012, 16, 0, 0, Math.PI / 2);
  k.cyl(C.black, x + 0.008, y, z, r * full, r * full, 0.03, 16, 0, 0, Math.PI / 2);
  k.cyl(C.steel, x + 0.024, y, z, r, r, 0.012, 16, 0, 0, Math.PI / 2);
};

export const SIDE_MODELS: Record<string, (k: Kit) => void> = {
  // ---- the barber ----
  barberKit: (k) => {
    k.box(C.black, -0.12, 0.006, 0, 0.16, 0.012, 0.03, 0.1);
    for (let i = 0; i < 12; i++) k.box(C.black, -0.19 + i * 0.012, 0.016, -0.012, 0.004, 0.012, 0.02);
    k.box(C.woodDark, 0.08, 0.008, 0.01, 0.13, 0.016, 0.03, -0.2);
    k.box(C.chrome, 0.08, 0.017, 0.03, 0.1, 0.004, 0.012, -0.2);
    k.box(0x6a3a20, 0.3, 0.004, -0.02, 0.4, 0.008, 0.06, 0.05);
  },
  scissors: (k) => scissorsFlat(k),
  postcard: (k) => {
    sheet(k, 0, 0, 0, 0.15, 0.1, C.paper);
    k.box(C.red, 0.055, 0.005, -0.03, 0.025, 0.002, 0.03);
    writing(k, -0.025, 0, 0.01, 0.05, 1);
  },
  scissorsHung: (k) => {
    // hanging on the hook from the finger rings, blades down, on the wall (back on z 0)
    for (const s of [-1, 1]) {
      k.box(C.chrome, s * 0.008, 0.18, 0.02, 0.014, 0.15, 0.005, 0, 0, s * 0.06);
      k.torus(C.iron, s * 0.028, 0.32, 0.02, 0.026, 0.007, 0, 0, 0);
    }
    k.cyl(C.brass, 0, 0.26, 0.025, 0.007, 0.007, 0.012, 6, Math.PI / 2, 0, 0);
  },
  // ---- the last ferry ----
  timetable: (k) => {
    // a slatted board on the wall by the window (back on z 0): a red head, white slats in two columns, one row chalked through
    k.box(C.woodDark, 0, 0.32, 0.012, 0.58, 0.66, 0.024);
    k.box(C.paperOld, 0, 0.3, 0.026, 0.52, 0.52, 0.004);
    k.box(C.red, 0, 0.6, 0.028, 0.52, 0.08, 0.006);
    for (let i = 0; i < 6; i++) {
      const y = 0.5 - i * 0.075;
      k.box(C.ink, -0.13, y, 0.03, 0.18, 0.012, 0.003);
      k.box(C.ink, 0.12, y, 0.03, 0.16, 0.012, 0.003);
    }
    k.box(C.red, 0, 0.125, 0.032, 0.5, 0.014, 0.003, 0, 0, 0.04);
    k.rod(C.iron, 0, 0.66, 0.01, 0, 0.72, 0.01, 0.006, 0.006, 4);
  },
  coat: (k) => coatOn(k, false),
  coatOpen: (k) => coatOn(k, true),
  ticket: (k) => {
    sheet(k, 0, 0, 0, 0.06, 0.12, 0xd8c890);
    k.box(C.red, 0, 0.005, -0.04, 0.06, 0.002, 0.012);
    k.cyl(C.black, 0.015, 0.006, 0.02, 0.008, 0.008, 0.003, 6);
  },
  // ---- the fish pool ----
  feedTin: (k) => {
    k.cyl(0xc89a30, 0, 0.05, 0, 0.04, 0.04, 0.1, 10);
    k.cyl(C.rust, 0, 0.102, 0, 0.041, 0.041, 0.006, 10);
    k.box(0xd84a2a, 0, 0.05, 0.041, 0.04, 0.03, 0.002);
  },
  silt: (k) => {
    k.cyl(C.silt, 0, 0, 0, 1.92, 1.92, 0.02, 22);
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39;
      const r = 0.3 + ((i * 53) % 15) * 0.1;
      k.box(i % 3 ? C.leaf : 0x8a6a30, Math.cos(a) * r, 0.012, Math.sin(a) * r, 0.12, 0.004, 0.06, a);
    }
    for (let i = 0; i < 5; i++) k.rod(0x5a5030, -1 + i * 0.4, 0.01, 0.6 - i * 0.2, -0.9 + i * 0.4, 0.35, 0.5 - i * 0.2, 0.008, 0.004, 4);
  },
  poolClear: (k) => {
    k.cyl(C.water, 0, 0, 0, 1.92, 1.92, 0.02, 22);
    k.cyl(C.waterDeep, 0, 0.004, 0, 1.0, 1.0, 0.016, 18);
    // forty-one painted fish on the floor, read through the water: each child's own colour
    const cols = [0xe0702a, 0xd83a3a, 0xf0c040, 0x3a7ad8, 0xe8e0d0, 0x40a060, 0xd060a0];
    for (let i = 0; i < 41; i++) {
      const ring = i < 14 ? 1.55 : i < 28 ? 1.1 : 0.6;
      const a = i * 0.449 + (i < 14 ? 0 : i < 28 ? 0.2 : 0.5);
      fishShape(k, Math.cos(a) * ring, 0.014, Math.sin(a) * ring, 0.16, cols[i % cols.length]!, -a - Math.PI / 2);
    }
  },
  valveShut: (k) => {
    // the cistern's down pipe along its leg, a gate valve at chest height, the wheel square to the pipe
    k.cyl(C.rust, 0, 1.6, 0, 0.05, 0.05, 3.2, 8);
    k.box(C.iron, 0, 0.95, 0.05, 0.14, 0.18, 0.12);
    k.torus(0xa83a2a, 0, 0.95, 0.16, 0.12, 0.014, 0, 0, 0);
    k.box(0xa83a2a, 0, 0.95, 0.16, 0.22, 0.016, 0.016);
    k.box(0xa83a2a, 0, 0.95, 0.16, 0.016, 0.22, 0.016);
    k.cyl(C.rust, 0, 0.12, 0.12, 0.05, 0.05, 0.2, 8, Math.PI / 2, 0, 0);
  },
  valveOpen: (k) => {
    k.cyl(C.rust, 0, 1.6, 0, 0.05, 0.05, 3.2, 8);
    k.box(C.iron, 0, 0.95, 0.05, 0.14, 0.18, 0.12);
    k.torus(0xa83a2a, 0, 0.95, 0.16, 0.12, 0.014, 0, 0, 0.78);
    k.box(0xa83a2a, 0, 0.95, 0.16, 0.22, 0.016, 0.016, 0, 0, 0.78);
    k.box(0xa83a2a, 0, 0.95, 0.16, 0.016, 0.22, 0.016, 0, 0, 0.78);
    k.cyl(C.rust, 0, 0.12, 0.12, 0.05, 0.05, 0.2, 8, Math.PI / 2, 0, 0);
    // a dark wet patch where it spat when it opened
    k.cyl(0x3a4448, 0.1, 0.005, 0.35, 0.4, 0.4, 0.008, 12);
  },
  // ---- the cats ----
  catGinger: (k) => cat(k, C.ginger, C.gingerPale, 0xa85a28),
  catTabby: (k) => cat(k, C.tabby, 0xb8a890, C.tabbyDark),
  kittensTin: (k) => {
    tin(k, false);
    kitten(k, -0.08, 0.02, C.ginger, 0.4);
    kitten(k, 0.06, -0.03, C.tabby, 2.2);
    kitten(k, 0.1, 0.06, C.black, 3.5);
    kitten(k, -0.02, -0.07, C.white, 5);
    k.ball(C.black, -0.3, 0.1, 0.12, 0.12, 1.4, 0.7, 0.9, 8);
    k.ball(C.black, -0.18, 0.15, 0.2, 0.065, 1, 1, 1, 7);
    for (const s of [-1, 1]) k.cyl(C.black, -0.18 + s * 0.035, 0.22, 0.2, 0.002, 0.02, 0.04, 4);
  },
  kittensOpen: (k) => {
    tin(k, true);
    kitten(k, -0.36, 0.25, C.ginger, 0.4);
    kitten(k, -0.25, 0.32, C.tabby, 2.2);
    kitten(k, -0.32, 0.38, C.black, 3.5);
    kitten(k, -0.42, 0.33, C.white, 5);
    k.ball(C.black, -0.38, 0.1, 0.28, 0.13, 1.5, 0.7, 1, 8);
    k.ball(C.black, -0.22, 0.15, 0.36, 0.065, 1, 1, 1, 7);
  },
  // ---- the last reel ----
  filmCan: (k) => {
    k.cyl(C.steel, 0, 0.02, 0, 0.18, 0.18, 0.04, 18);
    k.cyl(0x8a9096, 0, 0.042, 0, 0.17, 0.17, 0.004, 18);
    sheet(k, 0, 0.043, 0, 0.12, 0.05, C.paper);
    k.rod(C.paperOld, -0.1, 0.045, 0.08, 0.14, 0.045, -0.06, 0.004, 0.004, 4);
  },
  reelOn: (k) => {
    // the feed reel up on its arm, the take-up below, the film between them through the gate
    k.box(C.iron, 0, 0.3, 0, 0.04, 0.6, 0.04);
    filmReel(k, 0.03, 0.62, 0, 0.2, 0.92);
    filmReel(k, 0.03, 0.1, 0.25, 0.18, 0.35);
    k.box(C.black, 0.05, 0.36, 0.12, 0.004, 0.5, 0.02, 0, 0.5);
  },
  screenFilm: (k) => {
    // what the last reel throws on the screen: the school roof at the Obon dance, in faded colour, the island in a ring
    const W = 6.4;
    const H = 3.4;
    k.box(0xf2e2b8, 0, H / 2, 0.004, W, H, 0.006);
    k.box(0x6a7488, 0, H * 0.78, 0.009, W - 0.3, H * 0.4, 0.004);
    k.box(0x9a8a70, 0, H * 0.3, 0.009, W - 0.3, H * 0.5, 0.004);
    k.box(0x7a6a58, 0, H * 0.56, 0.011, W - 0.3, 0.08, 0.004);
    // the yagura (the dance tower), lanterns on lines from it
    k.box(0x5a3a28, 0, H * 0.5, 0.013, 0.5, 0.9, 0.004);
    k.box(0xd03a2a, 0, H * 0.62, 0.014, 0.34, 0.24, 0.004);
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      k.box(0xf0b060, -2.8 + t * 5.6, H * 0.94 - Math.abs(t - 0.5) * 0.7, 0.014, 0.08, 0.1, 0.004);
    }
    // the ring of dancers, one arm up (the third move), small and dark against the floor
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const x = Math.cos(a) * 2.2;
      const y = H * 0.3 + Math.sin(a) * 0.45;
      const c = [0x2a2a38, 0x4a3a5a, 0x3a4a5a, 0xe8e0d0][i % 4]!;
      k.box(c, x, y, 0.016, 0.12, 0.34, 0.004);
      k.box(c, x, y + 0.24, 0.016, 0.08, 0.08, 0.004);
      k.box(c, x + 0.07, y + 0.22, 0.016, 0.03, 0.16, 0.004, 0, 0, -0.5);
    }
    // the grain and the burn at the edges: a darker frame
    for (const s of [-1, 1]) {
      k.box(0x8a7a5a, s * (W / 2 - 0.05), H / 2, 0.018, 0.1, H, 0.002);
      k.box(0x8a7a5a, 0, H / 2 + s * (H / 2 - 0.05), 0.018, W, 0.1, 0.002);
    }
  },
  // ---- the sayonara letters ----
  letter: (k) => {
    sheet(k, 0, 0, 0, 0.2, 0.14, C.paper, 0);
    writing(k, 0, 0.002, 0, 0.15, 4);
    k.box(0x8aa0c0, 0.075, 0.006, -0.045, 0.03, 0.002, 0.03);
  },
  letterBox: (k) => letterBox(k, 3),
  letterBoxFull: (k) => letterBox(k, 15),
  // ---- okoze ----
  dish: (k) => lacquerDish(k),
  okozeHung: (k) => {
    // tied by the tail to the lowest pole, hanging head down
    k.rod(C.straw, 0, 0, 0, 0, -0.08, 0, 0.004, 0.004, 4);
    const kk = k;
    // the fish hangs along y: build it lying, stood on its tail (the kit's pieces are rotated by hand)
    kk.ball(0x7a5a3a, 0, -0.22, 0, 0.11, 0.8, 1.3, 0.75, 8);
    kk.ball(0x5a3e28, 0, -0.32, 0, 0.07, 1.1, 1, 0.9, 7);
    kk.box(0x3a2418, 0, -0.39, 0.03, 0.08, 0.03, 0.01);
    for (let i = 0; i < 6; i++) kk.cyl(0x4a3020, 0, -0.14 - i * 0.035, -0.07, 0.002, 0.01, 0.07, 4, Math.PI / 2, 0, 0);
    for (let i = 0; i < 9; i++) kk.ball(0x9a7a52, ((i * 7) % 3 - 1) * 0.06, -0.12 - ((i * 37) % 9) * 0.025, 0.06, 0.016, 1, 1, 1, 4);
    kk.box(0x6a4a2e, 0, -0.09, 0, 0.08, 0.06, 0.008);
  },
  okozeDish: (k) => {
    lacquerDish(k);
    okozeOn(k, 0.2);
  },
  // ---- tankō-bushi ----
  plaque: (k) => {
    // the fallen bronze plate: five little miners in relief, each in his move, left to right (no words)
    k.box(C.bronze, 0, 0.02, 0, 1.2, 0.04, 0.42);
    k.box(C.bronzeHi, 0, 0.042, 0, 1.12, 0.004, 0.36);
    const fig = (x: number, arm: number, lean: number, bow: number): void => {
      k.box(C.bronze, x, 0.05, 0.02 - bow * 0.04, 0.05, 0.012, 0.16, 0, 0, lean);
      k.box(C.bronze, x, 0.05, -0.08 + bow * 0.05, 0.05, 0.012, 0.05);
      k.box(C.bronze, x + 0.04, 0.052, 0.0 - arm * 0.06, 0.02, 0.012, 0.12, arm);
    };
    fig(-0.44, 0.9, 0.3, 0); // the shovel
    fig(-0.22, -0.4, 0, 0); // the lift
    fig(0, 1.4, 0, 0); // shading the eyes
    fig(0.22, 0.2, -0.4, 0); // the push
    fig(0.44, 0, 0, 1); // the bow
  },
  capLamp: (k) => {
    // a miner's cap lamp on its battery, its cord, the lamp head lit and turned up to the statue
    k.box(0x2a2c30, 0, 0.09, 0, 0.12, 0.18, 0.06);
    k.box(0x4a4c50, 0, 0.185, 0, 0.13, 0.012, 0.07);
    k.rod(C.black, 0, 0.19, 0, 0.06, 0.26, 0.05, 0.008, 0.008, 4);
    k.cyl(C.brass, 0.06, 0.28, 0.06, 0.04, 0.035, 0.06, 10, -0.9, 0, 0);
    k.cyl(C.lamp, 0.06, 0.3, 0.085, 0.034, 0.034, 0.012, 10, -0.9, 0, 0);
  },
  // ---- drums for Mio ----
  handDrum: (k) => {
    // a shime-daiko: laced heads, the rope tight round it; two sticks across
    k.cyl(C.lacquer, 0, 0.09, 0, 0.17, 0.17, 0.14, 14);
    for (const s of [-1, 1]) k.cyl(C.white, 0, 0.09 + s * 0.08, 0, 0.2, 0.2, 0.02, 14);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      k.rod(0xd8b070, Math.cos(a) * 0.19, 0.17, Math.sin(a) * 0.19, Math.cos(a + 0.3) * 0.19, 0.01, Math.sin(a + 0.3) * 0.19, 0.005, 0.005, 3);
    }
    k.rod(C.wood, -0.25, 0.2, 0.05, 0.12, 0.19, 0.12, 0.012, 0.012, 5);
    k.rod(C.wood, -0.22, 0.21, 0.12, 0.15, 0.2, 0.02, 0.012, 0.012, 5);
  },
  recorder: (k) => {
    k.box(0x2a2a2e, 0, 0.04, 0, 0.26, 0.08, 0.16);
    k.box(0x6a6a70, -0.04, 0.081, 0.02, 0.12, 0.004, 0.07);
    k.box(C.paperOld, -0.04, 0.084, 0.02, 0.07, 0.002, 0.04);
    for (let i = 0; i < 5; i++) k.box(0x8a8a90, 0.06 + i * 0.022, 0.085, -0.05, 0.016, 0.01, 0.024);
    k.cyl(0x4a4a50, 0.08, 0.081, 0.04, 0.035, 0.035, 0.004, 10);
  },
  lantern: (k) => {
    // a paper lantern left lit on a stake where her name was called
    k.rod(C.wood, 0, 0, 0, 0, 1.1, 0, 0.012, 0.01, 4);
    k.rod(C.wood, 0, 1.1, 0, 0.18, 1.12, 0, 0.008, 0.008, 4);
    k.cyl(C.black, 0.18, 1.08, 0, 0.07, 0.07, 0.025, 10);
    k.ball(C.lantern, 0.18, 0.95, 0, 0.11, 1, 1.25, 1, 10);
    k.cyl(C.black, 0.18, 0.81, 0, 0.07, 0.07, 0.025, 10);
  },
  // ---- the rice ball ----
  trayFull: (k) => {
    // a lacquer tray on the tatami: rice heaped in its bowl, the soup, pickles, chopsticks still in their paper
    k.box(C.lacquer, 0, 0.012, 0, 0.42, 0.024, 0.32);
    k.lathe(0x2a1a14, [[0.001, 0.024], [0.04, 0.026], [0.06, 0.07], [0.062, 0.08], [0.001, 0.08]], 12, -0.09, 0, 0.04);
    k.ball(C.rice, -0.09, 0.08, 0.04, 0.055, 1, 0.55, 1, 9);
    k.lathe(0x5a1410, [[0.001, 0.024], [0.04, 0.026], [0.055, 0.07], [0.057, 0.078], [0.001, 0.078]], 12, 0.09, 0, 0.05);
    k.cyl(0x8a6a3a, 0.09, 0.074, 0.05, 0.05, 0.05, 0.004, 10);
    k.cyl(0xe8e0c8, 0.0, 0.03, -0.08, 0.04, 0.035, 0.012, 10);
    k.box(0xe0c040, 0.0, 0.04, -0.08, 0.04, 0.012, 0.03);
    k.box(C.white, 0.0, 0.03, 0.12, 0.2, 0.008, 0.025);
    k.box(C.red, 0.06, 0.035, 0.12, 0.02, 0.002, 0.026);
  },
  riceWrapped: (k) => {
    // in the sleeve's end: a bundle of bamboo leaf, tied with straw
    k.ball(C.bamboo, 0, 0.05, 0, 0.07, 1.2, 0.85, 0.9, 8);
    k.box(C.straw, 0, 0.05, 0, 0.012, 0.11, 0.14);
    k.box(C.straw, 0, 0.05, 0, 0.17, 0.11, 0.012);
  },
  riceOpen: (k) => {
    k.box(C.bamboo, 0, 0.02, 0, 0.2, 0.01, 0.16, 0.2);
    k.ball(C.rice, 0, 0.07, 0, 0.055, 1.1, 0.95, 0.85, 9);
    k.box(C.black, 0, 0.05, 0.04, 0.07, 0.04, 0.006);
  },
};

/** The things that are big or part of a place (a film on a screen, water, a pipe): no rim of light round them. */
const PLAIN = new Set(['coat', 'coatOpen', 'screenFilm', 'poolClear', 'silt', 'valveShut', 'valveOpen', 'plaque', 'timetable', 'dish', 'trayFull', 'barberKit', 'feedTin']);
/** The rim round a thing to notice: softer than a collectable's. */
const GLOW = 0xa08860;

/** Every side story's thing as one mesh (one draw call): `set(key, on)` shows or hides `SIDE_THINGS` by its key. */
export function sideMarks(): Marks {
  const spots = SIDE_THINGS.map((t) => ({ key: t.key, model: t.m, kind: 'find' as const, x: t.x, y: t.y, z: t.z, yaw: t.yaw ?? 0, glint: PLAIN.has(t.m) ? 0 : GLOW }));
  const m = new Marks(spots, SIDE_MODELS, 1);
  m.mesh.name = 'HirasakaSideThings';
  return m;
}
