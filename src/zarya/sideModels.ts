/**
 * ZARYA's side stories, the things in their places (`sidestories.ts`): each a small model of plain shapes at its real
 * size, drawn the way the collectables are (`items.ts` `ItemMarks`: all of them one mesh, one draw call, each shown or
 * folded away by itself, a soft rim of light round what is shown). `look.ts` builds and switches them.
 *
 * Every model stands on y = 0 (the surface under it). One hung on a wall has its back on z = 0 and faces +z (the
 * place's `yaw` turns it to face the room).
 */
import { ItemMarks, type ItemSpot, type Kit } from './items';
import { SIDE_PLACES } from './sidestories';

const PAPER = 0xe8e2d0;
const NEWS = 0xcfc8b4;
const INK = 0x2a2a30;
const WOOD = 0x8a5a32;
const WOOD_DARK = 0x5a3a22;
const STEEL = 0x9aa3ad;
const CHALK = 0x2f3a33;
const WHITE = 0xf2f2ee;
const FUR = 0x9a6a3c;
const FUR_PALE = 0xd8c2a0;

/** A sheet of paper lying flat (or, stood up, on a wall). */
const sheet = (k: Kit, x: number, y: number, z: number, w: number, d: number, c = PAPER, ry = 0): void => void k.box(c, x, y + 0.002, z, w, 0.004, d, ry);
/** Lines of writing on a flat sheet. */
const writing = (k: Kit, x: number, y: number, z: number, w: number, rows: number, ry = 0): void => {
  for (let i = 0; i < rows; i++) k.box(INK, x, y + 0.006, z - 0.03 * (rows / 2) + i * 0.03, w * (0.6 + ((i * 37) % 5) * 0.08), 0.002, 0.006, ry);
};
/** A chalk board on the wall, its frame, a few chalk lines (more when `done`). */
const chalkBoard = (k: Kit, w: number, h: number, done: boolean): void => {
  k.box(WOOD_DARK, 0, h / 2, 0.015, w + 0.08, h + 0.08, 0.03);
  k.box(CHALK, 0, h / 2, 0.035, w, h, 0.012);
  for (let i = 0; i < 5; i++) k.box(WHITE, -w * 0.08 + ((i * 29) % 7) * 0.01, h * 0.82 - i * h * 0.13, 0.043, w * (0.5 + ((i * 13) % 4) * 0.08), 0.012, 0.002);
  if (done) {
    k.box(WHITE, 0, h * 0.14, 0.044, w * 0.7, 0.02, 0.002);
    k.box(WHITE, w * 0.32, h * 0.2, 0.044, 0.02, h * 0.14, 0.002, 0, 0, 0.5);
  }
  k.box(WOOD_DARK, 0, -0.02, 0.06, w * 0.6, 0.03, 0.06);
  k.box(WHITE, w * 0.2, 0.005, 0.07, 0.06, 0.012, 0.012);
};
const dog = (k: Kit, coat: boolean): void => {
  // a mongrel curled nose to tail, asleep
  k.ball(FUR, 0, 0.17, 0, 0.26, 1.3, 0.62, 0.9, 10);
  k.ball(FUR, 0.24, 0.17, 0.17, 0.11, 1.2, 0.9, 1, 8);
  k.ball(FUR_PALE, 0.34, 0.15, 0.2, 0.05, 1.3, 0.8, 1, 6);
  k.ball(INK, 0.4, 0.16, 0.21, 0.018, 1, 1, 1, 5);
  for (const s of [-1, 1]) k.box(FUR, 0.2 + s * 0.04, 0.27, 0.12, 0.05, 0.08, 0.03, 0, 0.3, s * 0.4);
  k.rod(FUR, -0.28, 0.12, 0.08, 0.05, 0.1, 0.28, 0.045, 0.025, 6);
  k.box(0xb03a2a, 0.12, 0.22, 0.13, 0.03, 0.05, 0.18, 0.6);
  if (coat) {
    // his old coat over him, a patched grey wool
    k.box(0x5a5e66, -0.04, 0.29, 0, 0.66, 0.05, 0.46, 0.15, 0.05, 0.08);
    for (const s of [-1, 1]) k.box(0x5a5e66, -0.04, 0.17, s * 0.24, 0.62, 0.22, 0.04, 0.15, s * 0.2);
    k.box(0x7c5a3a, 0.1, 0.32, -0.1, 0.14, 0.012, 0.12, 0.15);
  }
};
const fish = (k: Kit, len: number, c: number, belly: number): void => {
  k.ball(c, 0, 0.04, 0, len / 2, 1, 0.16, 0.22, 8);
  k.ball(belly, 0, 0.03, 0, len / 2.3, 1, 0.1, 0.18, 8);
  k.box(c, -len / 2 - 0.03, 0.04, 0, 0.08, 0.005, 0.1, 0, 0, 0);
  k.ball(INK, len * 0.42, 0.05, 0.03, 0.008, 1, 1, 1, 4);
};
const mitten = (k: Kit, c: number, trim: number): void => {
  k.box(c, 0, 0.012, 0, 0.13, 0.022, 0.2);
  k.box(c, 0.07, 0.012, 0.03, 0.05, 0.02, 0.08, 0.4);
  k.box(trim, 0, 0.013, -0.1, 0.14, 0.024, 0.04);
};
const prints = (k: Kit, gap: boolean): void => {
  // a line across the wall, five prints pegged on it (the second gone once taken)
  k.rod(STEEL, -0.9, 1.62, 0.05, 0.9, 1.62, 0.05, 0.006, 0.006, 4);
  for (let i = 0; i < 5; i++) {
    if (gap && i === 1) continue;
    const x = -0.72 + i * 0.36;
    k.box(i % 2 ? 0xd6d2c4 : 0xc8c4b6, x, 1.47, 0.055, 0.24, 0.3, 0.004);
    k.box(0x4a4a50, x, 1.47, 0.058, 0.2, 0.22, 0.002);
    k.box(WOOD, x, 1.62, 0.06, 0.02, 0.06, 0.015);
  }
};
const pigeonholes = (k: Kit, full: boolean): void => {
  // a box of nine cells on the wall, a name card under each
  k.box(WOOD, 0, 0.3, 0.12, 0.66, 0.6, 0.24);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const x = -0.21 + c * 0.21;
      const y = 0.11 + r * 0.19;
      k.box(WOOD_DARK, x, y + 0.02, 0.2, 0.17, 0.13, 0.1);
      k.box(PAPER, x, y - 0.06, 0.245, 0.12, 0.025, 0.004);
      if ((r * 3 + c) % 4 === 1) k.box(PAPER, x, y, 0.22, 0.13, 0.04, 0.06);
    }
  if (full) {
    // Masha's parcel pushed into the middle cell, too big for it
    k.box(NEWS, 0, 0.32, 0.26, 0.2, 0.12, 0.2);
    k.box(0xb0a080, 0, 0.32, 0.26, 0.205, 0.012, 0.205);
  }
};
const rifle = (k: Kit, whole: boolean): void => {
  // the action and barrel along x; the stock either fitted or lying beside it; the repair tag on a string
  k.box(0x2c2e32, 0.1, 0.03, 0, 0.6, 0.04, 0.04);
  k.cyl(0x2c2e32, 0.62, 0.03, 0, 0.012, 0.012, 0.5, 6, 0, 0, Math.PI / 2);
  k.box(0x2c2e32, 0.05, 0.065, 0, 0.12, 0.03, 0.02);
  if (whole) k.box(WOOD, -0.38, 0.035, 0, 0.42, 0.06, 0.05, 0, 0, 0.06);
  else k.box(WOOD, -0.25, 0.03, 0.16, 0.42, 0.05, 0.05, 0.25);
  k.box(0xd8c890, 0.3, 0.003, -0.1, 0.06, 0.004, 0.09, 0.4);
};

export const SIDE_MODELS: Record<string, (k: Kit) => void> = {
  // ---- the shuba on the sill ----
  bowl: (k) => {
    k.lathe(0xd8d4cc, [[0.001, 0], [0.07, 0.005], [0.12, 0.06], [0.13, 0.08], [0.001, 0.08]], 12);
    k.cyl(0x9a3050, 0, 0.09, 0, 0.115, 0.115, 0.02, 12);
    k.cyl(0xf0f0f0, 0, 0.1, 0, 0.13, 0.13, 0.006, 12);
    sheet(k, 0.17, 0, 0.06, 0.1, 0.14, PAPER, 0.3);
  },
  gift: (k) => {
    // a little wooden horse wrapped in newspaper, string round it
    k.box(NEWS, 0, 0.07, 0, 0.26, 0.14, 0.12);
    k.box(INK, 0, 0.1, 0.061, 0.2, 0.004, 0.002);
    k.box(INK, 0, 0.06, 0.061, 0.16, 0.004, 0.002);
    k.box(0xb09060, 0, 0.07, 0, 0.012, 0.145, 0.125);
    k.box(0xb09060, 0, 0.07, 0, 0.265, 0.145, 0.012);
    k.box(WOOD, 0.09, 0.16, 0, 0.05, 0.05, 0.03);
  },
  // ---- Sharik ----
  dog: (k) => dog(k, false),
  dogCoat: (k) => dog(k, true),
  // ---- the honey parcel ----
  parcel: (k) => {
    k.box(NEWS, 0, 0.09, 0, 0.3, 0.18, 0.22);
    k.box(0xb0a080, 0, 0.09, 0, 0.012, 0.185, 0.225);
    k.box(0xb0a080, 0, 0.09, 0, 0.305, 0.185, 0.012);
    sheet(k, 0.06, 0.18, 0.04, 0.12, 0.07, PAPER);
    writing(k, 0.06, 0.18, 0.04, 0.09, 2);
  },
  pigeonholes: (k) => pigeonholes(k, false),
  pigeonholesFull: (k) => pigeonholes(k, true),
  // ---- Semyonov's rifle ----
  rifleParts: (k) => rifle(k, false),
  rifle: (k) => rifle(k, true),
  tin: (k) => {
    k.cyl(0x6a7a5a, 0, 0.05, 0, 0.06, 0.06, 0.1, 10);
    k.cyl(STEEL, 0, 0.1, 0, 0.062, 0.062, 0.01, 10);
    k.box(PAPER, 0, 0.05, 0.061, 0.07, 0.04, 0.003);
  },
  // ---- peg forty-seven ----
  letter: (k) => {
    // a folded coat on the counter, a white envelope out of its pocket
    k.box(0x3a3f4a, 0, 0.05, 0, 0.5, 0.1, 0.34, 0.1);
    k.box(0x2c3038, 0.1, 0.101, 0.06, 0.14, 0.004, 0.12, 0.1);
    k.box(WHITE, 0.1, 0.13, 0.09, 0.12, 0.08, 0.006, 0.1, -0.5);
  },
  // ---- lost property ----
  bag: (k) => {
    k.box(0x5a3a2a, 0, 0.14, 0, 0.42, 0.28, 0.16);
    k.box(0x4a2e20, 0, 0.29, 0, 0.43, 0.03, 0.17);
    k.torus(0x3a2418, 0, 0.32, 0, 0.12, 0.012, 0, 0, 0, Math.PI, 10);
    k.box(PAPER, 0.08, 0.31, 0.03, 0.12, 0.004, 0.1, 0.4);
  },
  mittenRed: (k) => mitten(k, 0xc02a2a, WHITE),
  mittenBlue: (k) => mitten(k, 0x2a5ac0, WHITE),
  mittenGreen: (k) => mitten(k, 0x2a8a3a, 0xe0d040),
  // ---- the Hare's ears ----
  ears: (k) => {
    // a white headband with two tall ears, pink inside, a cloakroom tag on a string
    k.torus(WHITE, 0, 0.09, 0, 0.09, 0.01, Math.PI / 2, 0, 0, Math.PI, 12);
    for (const s of [-1, 1]) {
      k.ball(WHITE, s * 0.05, 0.27, 0, 0.04, 0.8, 4.2, 0.5, 8);
      k.ball(0xf0a8b8, s * 0.05, 0.27, 0.012, 0.025, 0.6, 3.6, 0.3, 6);
    }
    k.box(0xc8a040, 0.1, 0.02, 0.05, 0.05, 0.004, 0.07, 0.3);
  },
  // ---- the last appointment ----
  lectern: (k) => {
    k.cyl(WOOD_DARK, 0, 0.55, 0, 0.03, 0.04, 1.1, 6);
    k.cyl(WOOD_DARK, 0, 0.02, 0, 0.18, 0.2, 0.04, 8);
    k.box(WOOD, 0, 1.12, 0.02, 0.42, 0.03, 0.32, 0, -0.35);
    k.box(PAPER, 0, 1.15, 0.03, 0.38, 0.02, 0.27, 0, -0.35);
    k.box(0x7a2a2a, 0, 1.135, 0.03, 0.4, 0.012, 0.29, 0, -0.35);
  },
  prints: (k) => prints(k, false),
  printsGap: (k) => prints(k, true),
  // ---- opinions ----
  book: (k) => {
    // a little shelf on the wall, the complaints book on it with a pencil on a string
    k.box(WOOD, 0, 0, 0.12, 0.5, 0.03, 0.24);
    k.box(0x2a4a7a, 0, 0.03, 0.13, 0.3, 0.03, 0.22, 0.1);
    k.box(PAPER, 0, 0.047, 0.13, 0.28, 0.004, 0.2, 0.1);
    k.rod(0xd0a040, 0.18, 0.04, 0.1, 0.3, 0.04, 0.16, 0.006, 0.006, 4);
  },
  notice: (k) => {
    k.box(PAPER, 0, 0, 0.004, 0.24, 0.32, 0.006);
    for (let i = 0; i < 7; i++) k.box(INK, -0.02 + ((i * 17) % 5) * 0.006, 0.11 - i * 0.03, 0.008, 0.17 - (i === 6 ? 0.1 : 0), 0.006, 0.002);
    k.box(0xc03030, 0, 0.15, 0.01, 0.015, 0.015, 0.01);
  },
  // ---- the biggest pike ----
  board: (k) => chalkBoard(k, 0.6, 0.42, false),
  boardDone: (k) => chalkBoard(k, 0.6, 0.42, true),
  pike: (k) => fish(k, 0.42, 0x5a6a3a, 0xc8c8a0),
  perch: (k) => {
    fish(k, 0.2, 0x6a7a3a, 0xd0b060);
    // and the boot
    k.box(0x2a2a2a, 0.2, 0.06, 0.18, 0.14, 0.12, 0.08, 0.4);
    k.box(0x2a2a2a, 0.26, 0.03, 0.23, 0.18, 0.06, 0.09, 0.4);
  },
  // ---- the night shift's bet ----
  shiftBoard: (k) => chalkBoard(k, 0.9, 0.6, false),
  shiftBoardDone: (k) => chalkBoard(k, 0.9, 0.6, true),
  docket: (k) => {
    k.box(PAPER, 0, 0, 0.004, 0.14, 0.2, 0.004, 0, 0, 0.08);
    writing(k, 0, -0.01, 0.003, 0.1, 4);
  },
  // ---- Bublik ----
  hamsterBowl: (k) => {
    k.lathe(WHITE, [[0.001, 0], [0.04, 0.003], [0.07, 0.05], [0.072, 0.06], [0.001, 0.06]], 12);
    k.ball(0xc08a50, 0, 0.07, 0, 0.045, 1.2, 0.8, 1, 8);
    k.ball(0xf0e0c0, 0.03, 0.065, 0.02, 0.025, 1, 0.8, 1, 6);
  },
  hamster: (k) => {
    k.ball(0xc08a50, 0, 0.035, 0, 0.045, 1.2, 0.8, 1, 8);
    k.ball(0xf0e0c0, 0.03, 0.03, 0.02, 0.025, 1, 0.8, 1, 6);
  },
};

/** The rim of light round each thing: softer than a collectable's, they are not to be picked up in passing. */
const GLOW = 0xa08860;

/** The side stories' things, as one `ItemMarks`: for every place its `model` and its `after`, in `SIDE_PLACES` order (index -1: none). */
export function sideMarks(): { marks: ItemMarks; model: number[]; after: number[] } {
  const spots: ItemSpot[] = [];
  const add = (m: string | undefined, j: number): number => {
    if (!m || !SIDE_MODELS[m]) return -1;
    const q = SIDE_PLACES[j]!;
    spots.push({ model: m, kind: 'find', x: q.p.at.x, y: q.p.y, z: q.p.at.z, yaw: q.p.yaw ?? 0, glint: GLOW });
    return spots.length - 1;
  };
  const model = SIDE_PLACES.map((q, j) => add(q.p.model, j));
  const after = SIDE_PLACES.map((q, j) => add(q.p.after, j));
  return { marks: new ItemMarks(spots, SIDE_MODELS, 1), model, after };
}
