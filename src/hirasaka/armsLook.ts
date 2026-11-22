/**
 * HIRASAKA's arms as things in the world (arms wave): the tools, parts and built guns lying where they lie, the guns
 * hung on the price boards, and the obstacles only one tool gets through, shut and opened. Everything is drawn the way
 * ZARYA draws its collectables (`zarya/items.ts`): plain-coloured pieces at their real size, every one of a kind merged
 * into ONE mesh whose items fold into a point when hidden, so the whole of it costs two draw calls (the items, the
 * obstacles) however many there are, and taking or opening one never rebuilds anything.
 *
 *   ITEMS      a model per tool, part, built gun and wall gun (`ITEM_MODEL`), grown a little so it reads from a few
 *              metres, a rim of light in its kind's colour (amber: parts; cold blue: tools; peach: the built guns).
 *   OBSTACLES  each obstacle's shut look and its opened look (`OBSTACLE_LOOKS`), at full size, no rim. Where a zone
 *              already built the shut look (the props, the slag heap, the sand drift, the roots), only the opened look
 *              is drawn here; the Root Hall's roots are the zone's own named mesh, hidden when they are cut.
 *   ICONS      `public/hirasaka/icons/<id>.webp` (the look-book's), for the feed and the bench prompts.
 */
import * as THREE from 'three';
import { ItemMarks, Kit, type ItemSpot } from '../zarya/items';

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const ICONS = new Set(['pick', 'axe', 'shovel', 'tachi', 'mori_head', 'mori_reel', 'mori_spring', 'happa_pipe', 'happa_charge', 'happa_det', 'drill_body', 'drill_hose', 'drill_steel', 'kushi_oil', 'kushi_rope', 'comb', 'happa', 'sakuganki', 'mori', 'kushibi', 'okamuzumi']);
/** The picture for `id`, or '' when there is none. */
export function armsIcon(id: string): string {
  return ICONS.has(id) ? `${BASE}hirasaka/icons/${id}.webp` : '';
}

// ---------------------------------------------------------------------------------------------
// the colours
// ---------------------------------------------------------------------------------------------
const C = {
  oak: 0x6a4a2c,
  ash: 0xc4ab7e,
  iron: 0x3d4045,
  steel: 0xa8acb0,
  rust: 0xa45a32,
  rustDark: 0x7a4024,
  galv: 0x5e6468,
  galvDark: 0x4e5458,
  red: 0xb8321e,
  paper: 0xd8c89a,
  green: 0x2e4a38,
  blue: 0x3c5a7a,
  hose: 0x1a1a1a,
  brass: 0xc09a48,
  lacquer: 0x5a1410,
  straw: 0xc8b070,
  white: 0xf0ece0,
  coal: 0x16161a,
  coal2: 0x24242a,
  slag: 0x3a3634,
  sand: 0xc8b48a,
  sandDark: 0x9a865e,
  plank: 0x7a6040,
  plankDark: 0x4e3a26,
  rock: 0x4a4640,
  rock2: 0x5c574e,
  root: 0x3a2a1c,
  burlap: 0x8a7350,
  hole: 0x0a0806,
} as const;

/** A box given by its size first, then where it stands (`Kit.box` takes the place first). */
function bx(k: Kit, c: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): void {
  k.box(c, x, y, z, sx, sy, sz, ry, rx, rz);
}

/** A quick spread of lumps: `n` balls around (x, z) within `r`, up to `h` high, from `seed`. */
function lumps(k: Kit, n: number, x0: number, y0: number, z0: number, w: number, h: number, d: number, seed: number, cols: readonly number[]): void {
  let s = seed;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  // a heap: each lump rests on the slope of a mound highest in its middle (never hanging in the air)
  for (let i = 0; i < n; i++) {
    const ux = rnd() - 0.5;
    const uz = rnd() - 0.5;
    const x = x0 + ux * w;
    const z = z0 + uz * d;
    const r = 0.15 + rnd() * 0.35;
    const shape = Math.max(0, 1 - Math.abs(ux) * 2) ** 0.25 * Math.max(0, 1 - Math.abs(uz) * 2);
    const y = y0 + Math.max(0, h * shape - r * 0.8) * (0.85 + rnd() * 0.15);
    k.ball(cols[i % cols.length]!, x, y + r * 0.5, z, r, 1 + rnd() * 0.5, 0.7 + rnd() * 0.3, 1 + rnd() * 0.4, 5);
  }
}

// ---------------------------------------------------------------------------------------------
// the items (real size; lying on the surface at y 0, long along x)
// ---------------------------------------------------------------------------------------------
export const ITEM_MODEL: Record<string, (k: Kit) => void> = {
  // ---- the tools, lying flat ----
  pick: (k) => {
    k.rod(C.oak, -0.42, 0.03, 0, 0.38, 0.03, 0, 0.018, 0.021);
    bx(k, C.iron, 0.4, 0.06, 0.05, 0.02, 0.05, 0);
    k.rod(C.iron, 0.42, 0.05, 0, 0.42, 0.03, 0.3, 0.018, 0.006);
    k.rod(C.iron, 0.42, 0.05, 0, 0.42, 0.03, -0.3, 0.018, 0.006);
  },
  axe: (k) => {
    k.rod(C.ash, -0.4, 0.025, 0, 0.36, 0.025, 0, 0.016, 0.018);
    bx(k, C.iron, 0.36, 0.05, 0.05, 0.03, 0.05, 0);
    bx(k, C.steel, 0.37, 0.04, 0.14, 0.03, 0.05, 0.08);
  },
  shovel: (k) => {
    k.rod(C.ash, -0.6, 0.025, 0, 0.32, 0.025, 0, 0.016, 0.018);
    k.torus(C.oak, -0.66, 0.025, 0, 0.05, 0.01, Math.PI / 2, 0, 0);
    bx(k, C.iron, 0.52, 0.03, 0.27, 0.0, 0.03, 0, 0, 0, 0.05);
  },
  tachi: (k) => {
    // in its black lacquer scabbard on a low stand
    bx(k, C.oak, 0.9, 0.08, 0.12, 0, 0.04, 0);
    k.rod(C.lacquer, -0.42, 0.16, 0, 0.5, 0.18, 0, 0.018, 0.016);
    k.rod(C.white, -0.66, 0.15, 0, -0.42, 0.16, 0, 0.017, 0.017);
    k.cyl(C.brass, -0.42, 0.16, 0, 0.045, 0.045, 0.012, 14, 0, 0, Math.PI / 2);
  },
  // ---- the Mori's parts: the harpoon head, the winch's cable cutter (the line reel) ----
  mori_head: (k) => {
    k.rod(C.steel, -0.25, 0.03, 0, 0.2, 0.03, 0, 0.012, 0.012);
    k.rod(C.steel, 0.2, 0.03, 0, 0.34, 0.03, 0, 0.03, 0.002);
    k.rod(C.steel, 0.24, 0.03, 0, 0.16, 0.03, 0.07, 0.008, 0.002);
    k.rod(C.steel, 0.24, 0.03, 0, 0.16, 0.03, -0.07, 0.008, 0.002);
  },
  mori_reel: (k) => {
    k.cyl(C.iron, 0, 0.12, 0, 0.12, 0.12, 0.1, 14, Math.PI / 2, 0, 0);
    k.cyl(C.paper, 0, 0.12, 0, 0.1, 0.1, 0.09, 14, Math.PI / 2, 0, 0);
    bx(k, C.iron, 0.36, 0.03, 0.05, 0.12, 0.015, 0);
  },
  // ---- the Happa's ----
  happa_pipe: (k) => {
    k.cyl(C.iron, 0, 0.05, 0, 0.05, 0.05, 0.7, 14, 0, 0, Math.PI / 2);
    k.cyl(C.iron, 0.33, 0.05, 0, 0.057, 0.057, 0.04, 14, 0, 0, Math.PI / 2);
  },
  happa_charge: (k) => {
    // a wooden box of blasting sticks, its lid off
    bx(k, C.oak, 0.42, 0.18, 0.28, 0, 0.09, 0);
    for (let i = 0; i < 5; i++) k.cyl(C.red, -0.15 + i * 0.075, 0.2, 0, 0.022, 0.022, 0.24, 8, Math.PI / 2, 0, 0);
    bx(k, C.paper, 0.3, 0.002, 0.1, 0, 0.181, 0.05);
  },
  happa_det: (k) => {
    bx(k, C.green, 0.2, 0.16, 0.16, 0, 0.08, 0);
    k.rod(C.iron, 0, 0.16, 0, 0, 0.3, 0, 0.01, 0.01);
    bx(k, C.iron, 0.12, 0.02, 0.03, 0, 0.3, 0);
    k.rod(C.paper, 0.1, 0.05, 0.04, 0.3, 0.01, 0.12, 0.006, 0.006);
  },
  // ---- the Sakuganki's ----
  drill_body: (k) => {
    k.cyl(C.blue, 0, 0.07, 0, 0.065, 0.065, 0.42, 14, 0, 0, Math.PI / 2);
    for (let i = 0; i < 5; i++) k.cyl(C.steel, -0.15 + i * 0.07, 0.07, 0, 0.069, 0.069, 0.012, 14, 0, 0, Math.PI / 2);
    bx(k, C.steel, 0.08, 0.06, 0.08, 0.05, 0.15, 0);
    bx(k, C.steel, 0.04, 0.04, 0.28, -0.22, 0.07, 0);
  },
  drill_hose: (k) => {
    for (let i = 0; i < 3; i++) k.torus(C.hose, 0, 0.03 + i * 0.045, 0, 0.22 - i * 0.02, 0.022, Math.PI / 2, 0, 0, Math.PI * 2, 14);
    k.cyl(C.brass, 0.24, 0.03, 0, 0.026, 0.026, 0.06, 10, 0, 0, Math.PI / 2);
  },
  drill_steel: (k) => {
    for (let i = 0; i < 3; i++) k.rod(C.steel, -0.55, 0.02 + i * 0.03, -0.04 + i * 0.04, 0.55, 0.02 + i * 0.03, -0.04 + i * 0.04, 0.012, 0.012, 6);
    bx(k, C.steel, 0.02, 0.06, 0.06, 0.56, 0.05, 0);
  },
  // ---- the comb's oil and wick ----
  kushi_oil: (k) => {
    k.cyl(C.paper, 0, 0.09, 0, 0.045, 0.06, 0.18, 12);
    k.cyl(C.lacquer, 0, 0.2, 0, 0.018, 0.024, 0.05, 10);
    bx(k, C.red, 0.002, 0.07, 0.05, 0.055, 0.09, 0);
  },
  kushi_rope: (k) => {
    for (let i = 0; i < 3; i++) k.torus(C.straw, 0, 0.03 + i * 0.04, 0, 0.18, 0.028, Math.PI / 2, 0, 0, Math.PI * 2, 14);
    for (let i = 0; i < 3; i++) bx(k, C.white, 0.05, 0.12, 0.004, -0.12 + i * 0.12, 0.08, 0.2);
  },
  // ---- the built guns, lying on their benches ----
  happa: (k) => {
    ITEM_MODEL.happa_pipe!(k);
    bx(k, C.oak, 0.22, 0.07, 0.06, -0.42, 0.05, 0);
    bx(k, C.green, 0.1, 0.08, 0.08, 0.05, 0.02, -0.07);
    for (let i = 0; i < 3; i++) k.cyl(C.red, 0.42, 0.05 + (i - 1) * 0.02, (i - 1) * 0.02, 0.018, 0.018, 0.16, 8, 0, 0, Math.PI / 2);
  },
  sakuganki: (k) => {
    ITEM_MODEL.drill_body!(k);
    k.rod(C.steel, 0.21, 0.07, 0, 0.8, 0.07, 0, 0.012, 0.012, 6);
    bx(k, C.steel, 0.02, 0.06, 0.06, 0.81, 0.07, 0);
    k.rod(C.hose, -0.25, 0.07, 0, -0.45, 0.02, 0.15, 0.016, 0.016);
  },
  mori: (k) => {
    bx(k, C.oak, 0.4, 0.07, 0.06, -0.2, 0.05, 0);
    k.rod(C.iron, 0.0, 0.07, 0, 0.5, 0.07, 0, 0.022, 0.022, 10);
    k.rod(C.steel, 0.5, 0.07, 0, 0.66, 0.07, 0, 0.026, 0.002);
    k.cyl(C.iron, -0.05, 0.03, 0.06, 0.05, 0.05, 0.04, 12, Math.PI / 2, 0, 0);
  },
  // ---- the guns hung on the price boards (stood up against the board: long along x) ----
  wall_shotgun: (k) => {
    bx(k, C.oak, 0.3, 0.06, 0.03, -0.3, 0, 0);
    k.rod(C.iron, -0.15, 0.02, 0, 0.45, 0.02, 0, 0.012, 0.012);
    bx(k, C.oak, 0.16, 0.035, 0.035, 0.2, -0.01, 0);
  },
  wall_rifle: (k) => {
    bx(k, C.oak, 0.26, 0.07, 0.03, -0.3, 0, 0);
    bx(k, C.iron, 0.36, 0.05, 0.035, 0.0, 0.01, 0);
    k.rod(C.iron, 0.18, 0.02, 0, 0.5, 0.02, 0, 0.008, 0.008);
    bx(k, C.iron, 0.03, 0.14, 0.025, 0.02, -0.08, 0, 0, 0, 0.2);
  },
  wall_signalka: (k) => {
    bx(k, C.rust, 0.06, 0.12, 0.03, -0.06, -0.04, 0, 0, 0, 0.3);
    k.rod(C.iron, -0.06, 0.02, 0, 0.12, 0.02, 0, 0.022, 0.022);
    k.cyl(C.red, 0.1, 0.02, 0, 0.024, 0.024, 0.02, 10, 0, 0, Math.PI / 2);
  },
  wall_arbalet: (k) => {
    bx(k, C.oak, 0.6, 0.05, 0.03, 0, 0, 0);
    k.rod(C.iron, 0.28, 0, -0.32, 0.28, 0, 0.32, 0.012, 0.012);
    k.rod(C.paper, -0.05, 0.01, 0, 0.28, 0.01, 0.3, 0.003, 0.003);
    k.rod(C.paper, -0.05, 0.01, 0, 0.28, 0.01, -0.3, 0.003, 0.003);
  },
  wall_rpg: (k) => {
    k.cyl(C.green, 0, 0.0, 0, 0.05, 0.05, 0.9, 12, 0, 0, Math.PI / 2);
    k.cyl(C.iron, 0.45, 0, 0, 0.06, 0.06, 0.06, 12, 0, 0, Math.PI / 2);
    bx(k, C.iron, 0.04, 0.12, 0.03, -0.05, -0.08, 0);
  },
  // ---- the cache in the sand: a fisherman's tin strongbox, its lid open ----
  cachebox: (k) => {
    bx(k, C.iron, 0.4, 0.2, 0.26, 0, 0.1, 0);
    bx(k, C.iron, 0.4, 0.02, 0.26, 0, 0.3, -0.12, 0, -1.1, 0);
    bx(k, C.paper, 0.3, 0.04, 0.18, 0, 0.19, 0);
  },
};

// ---------------------------------------------------------------------------------------------
// the obstacles (full size; local x along the thing shut, y up from its floor)
// ---------------------------------------------------------------------------------------------
export const OBSTACLE_LOOKS: Record<string, (k: Kit) => void> = {
  // the fan house's shutter: rusted corrugated sheets down to the floor, a bar across at the foot
  shutter: (k) => {
    // (galvanised sheet gone to rust in streaks: pale enough to read as shut in a dark doorway)
    for (let i = 0; i < 16; i++) bx(k, i % 5 === 0 ? C.rustDark : i % 2 ? C.galv : C.galvDark, 0.2, 2.9, 0.06, -1.5 + i * 0.2, 1.45, i % 2 ? 0.05 : 0.08);
    for (let i = 0; i < 5; i++) bx(k, C.rustDark, 0.05, 0.5 + i * 0.15, 0.01, -1.3 + i * 0.62, 0.3 + i * 0.07, 0.12);
    bx(k, C.iron, 3.3, 0.12, 0.12, 0, 0.3, 0.14);
    bx(k, C.iron, 3.3, 0.18, 0.1, 0, 2.86, 0.1);
  },
  shutterOpen: (k) => {
    // broken through: the top rolled up under its head, the lower sheets bent out and lying on the floor
    for (let i = 0; i < 16; i++) bx(k, i % 2 ? C.rust : C.rustDark, 0.2, 0.45, 0.06, -1.5 + i * 0.2, 2.65, i % 2 ? 0.03 : 0);
    bx(k, C.iron, 3.3, 0.18, 0.1, 0, 2.86, 0.02);
    for (let i = 0; i < 5; i++) bx(k, i % 2 ? C.rust : C.rustDark, 0.6, 0.04, 1.2, -1.2 + i * 0.6, 0.05 + (i % 2) * 0.04, 0.9, 0.2 * (i - 2), 0.08 * (i % 3), 0);
    bx(k, C.iron, 1.6, 0.12, 0.12, -0.6, 0.08, 1.4, 0.4);
  },
  // the boarded door to the boiler room: planks nailed across the doorway, every which way
  bathDoor: (k) => {
    const rows = [0.25, 0.6, 0.95, 1.3, 1.65, 2.0];
    rows.forEach((y, i) => {
      bx(k, i % 2 ? C.plank : C.plankDark, 4.1, 0.24, 0.05, (i % 3) * 0.06 - 0.06, y, 0.06 + (i % 2) * 0.03, 0, 0, (i % 2 ? 1 : -1) * 0.04);
      for (const x of [-1.9, 1.9]) bx(k, C.iron, 0.03, 0.03, 0.04, x, y, 0.1);
    });
    bx(k, C.plank, 0.24, 2.0, 0.05, -0.6, 1.15, 0.12, 0, 0, 0.42);
    bx(k, C.plankDark, 0.24, 2.0, 0.05, 0.6, 1.15, 0.12, 0, 0, -0.42);
  },
  bathDoorOpen: (k) => {
    // chopped through: stubs of plank still nailed at either jamb, the rest on the floor
    for (const y of [0.25, 0.95, 1.65, 2.0]) for (const x of [-1.85, 1.85]) bx(k, C.plankDark, 0.5, 0.22, 0.05, x, y, 0.07, 0, 0, 0.1);
    for (let i = 0; i < 5; i++) bx(k, i % 2 ? C.plank : C.plankDark, 1.6, 0.05, 0.24, -1.4 + i * 0.7, 0.04 + (i % 2) * 0.05, 0.9 + (i % 3) * 0.35, 0.3 * (i - 2), 0, 0.05);
  },
  // the coal seam fallen across the drift: a heap of coal and shale from wall to wall
  drift: (k) => {
    // a mound from wall to wall, sloping both ways, lumps of coal and shale lying on its slopes
    k.ball(C.coal, 0, 0, 0, 1, 7.4, 3.0, 1.7, 12);
    lumps(k, 60, 0, 0, 0, 14, 3.2, 3.2, 4377, [C.coal, C.coal2, C.rock]);
  },
  driftOpen: (k) => {
    // broken through: the coal thrown back against both sides, a way clear down the middle
    for (const x of [-5.2, 5.2]) {
      bx(k, C.coal, 3.4, 1.2, 1.4, x, 0.6, 0);
      lumps(k, 22, x, 0, 0, 3.6, 1.8, 2.4, 911 + Math.round(x), [C.coal, C.coal2, C.rock]);
    }
    lumps(k, 14, 0, 0, 1.4, 6, 0.3, 1.4, 5151, [C.coal, C.coal2]);
  },
  // the coal sack in the slag spill: a mound, a corner of sacking showing
  slag: (k) => {
    k.ball(C.slag, 0, 0.1, 0, 1.4, 1.3, 0.45, 1, 10);
    lumps(k, 12, 0, 0, 0, 2.6, 0.6, 2.2, 787, [C.slag, C.coal2]);
    bx(k, C.burlap, 0.5, 0.25, 0.35, 0.5, 0.45, 0.4, 0.4, 0.3, 0.2);
  },
  slagOpen: (k) => {
    k.cyl(C.hole, 0, 0.02, 0, 0.8, 0.8, 0.02, 14);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      k.ball(C.slag, Math.cos(a) * 1.2, 0.1, Math.sin(a) * 1.2, 0.45, 1.2, 0.5, 1, 6);
    }
  },
  // the cache in the seawall sand: a smooth hump with a tin corner showing
  sand: (k) => {
    k.ball(C.sandDark, 0, 0.0, 0, 1.1, 1.4, 0.5, 1, 10);
    bx(k, C.iron, 0.34, 0.14, 0.22, 0.35, 0.42, -0.1, 0.5, 0.3, 0.2);
  },
  sandOpen: (k) => {
    k.cyl(C.sandDark, 0, 0.02, 0, 0.75, 0.75, 0.03, 14);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      k.ball(C.sand, Math.cos(a) * 1.1, 0.08, Math.sin(a) * 1.1, 0.4, 1.3, 0.4, 1, 6);
    }
  },
  // the roof the props held up, down on the lane: slabs of rock, broken timbers, lagging
  propsOpen: (k) => {
    lumps(k, 40, 0, 0, 0, 8, 1.2, 9, 3141, [C.rock, C.rock2, C.coal2]);
    for (let i = 0; i < 5; i++) bx(k, C.rock2, 1.6 + (i % 2), 0.35, 1.2, -2.6 + i * 1.3, 0.3 + (i % 3) * 0.2, -3 + i * 1.5, 0.4 * i, 0.15, 0.1);
    for (let i = 0; i < 4; i++) bx(k, C.plankDark, 0.3, 0.3, 3, -2 + i * 1.4, 0.5 + (i % 2) * 0.3, 0.5 * (i - 1.5), 0.5 * i, 0, 0.25);
  },
  // the roots over Mio's hairpin, cut: their ends lie about where the tachi went through them
  rootsOpen: (k) => {
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7;
      const r = 0.6 + (i % 3) * 0.35;
      k.rod(C.root, Math.cos(a) * r, 0.08, Math.sin(a) * r, Math.cos(a + 0.4) * (r + 0.7), 0.06 + (i % 2) * 0.1, Math.sin(a + 0.4) * (r + 0.7), 0.06 + (i % 3) * 0.02, 0.05);
    }
  },
};

/** Where each obstacle's look stands (its floor), and the way its length runs (a yaw). */
export const OBSTACLE_AT: Record<string, { x: number; y: number; z: number; yaw: number }> = {
  shutter: { x: 58, y: 7.2, z: -9.78, yaw: 0 }, // (on the wall's outer face: the zone's dark doorway panel is just inside)
  bathDoor: { x: 50, y: 0, z: 26, yaw: Math.PI / 2 },
  drift: { x: 437, y: 9, z: 3.7, yaw: 0 },
  slag: { x: 150.4, y: 0, z: -56.2, yaw: 0 },
  sand: { x: -69, y: 0, z: 73.2, yaw: 0 },
  props: { x: 360, y: 9, z: 38.5, yaw: 0 },
  roots: { x: 306, y: 0, z: -40, yaw: 0 },
};

/** One merged mesh of things that show and hide one by one (`ItemMarks`, from ZARYA): `models` at `grow` times size. */
export class Marks {
  readonly marks: ItemMarks;
  private readonly index = new Map<string, number>();
  constructor(spots: readonly (ItemSpot & { key: string })[], models: Record<string, (k: Kit) => void>, grow: number) {
    this.marks = new ItemMarks(spots, models, grow);
    spots.forEach((s, i) => this.index.set(s.key, i));
  }
  get mesh(): THREE.Mesh {
    return this.marks.mesh;
  }
  set(key: string, on: boolean): void {
    const i = this.index.get(key);
    if (i !== undefined) this.marks.set(i, on);
  }
  update(t: number): void {
    this.marks.update(t);
  }
  dispose(): void {
    this.marks.dispose();
  }
}
