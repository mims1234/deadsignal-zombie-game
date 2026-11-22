/**
 * HIRASAKA's arms as pure data (no THREE): what the island hands a player to fight with, and where. The story knows
 * only bits (`story.ts`: `tools`, `obstacles`, `parts`, `built`, `kushi`, `boxAt`, `cageAt`); this file says what each
 * bit is in the hand.
 *
 *   TOOLS TO SWING   each tool is a weapon to swing (`logic/melee.ts`) and opens only its own obstacles (`places.ts`
 *                    OBSTACLES, by `tool`): the tsuruhashi pick the coal seams, the rubble and the fan's shutter; the
 *                    timber axe the boarded door and the rotten props (which drop the roof on whatever stands under
 *                    them); the coal shovel the caches in the slag and the sand; the shrine tachi the Root Hall's roots
 *                    (its heavy swing also strikes behind). An obstacle gives after `OBSTACLE_HITS` blows of its tool
 *                    (a heavy blow counts two). Nothing else marks it.
 *   BUILT            the top tier, from parts found about the island and the deep, built at a workbench (shared by the
 *                    squad once built; each player takes their own from the bench): the Mori (the story's two parts,
 *                    the seawall winch), the Happa (three parts, the bench before the powder magazine), the Sakuganki
 *                    (three, the coal face's bench). The Kushi-bi is Genzō's comb with camellia oil and a wick: lit
 *                    tooth by tooth at the Old Village's Bon fire (`KUSHI.light`); at the revived tree it becomes the
 *                    Ōkamuzumi (`KUSHI.tree`).
 *   WALL BUYS        a gun on each company price board (`places.ts` WALL_BUYS), for points; bought again, its ammunition.
 *   OFFERING BOX     the paid box, an offering box that moves between the four shrines (`places.ts` SHRINES) every few
 *                    openings, only to a shrine the squad can reach (the deep's once the cage has gone down).
 *   PIT WORKSHOP     the upgrade bench rides in the cage: at whichever stop the cage stands (`cageAt`); called from the
 *                    other stop's bell (`act('call', stop)`).
 *
 * Every part, bench and spot stands on its floor and can be walked to (`tests/hirasakaArms.test.ts`).
 */
import type { MeleeId } from '../logic/melee';
import type { HirasakaGunId, WeaponId } from '../types';
import { CAGE, DEEP_SPOTS, DEEP_Y, SHRINES, UMIBOZU, WALL_BUYS, WORKBENCHES, Y, type Spot, type ToolId } from './places';

const S = (x: number, y: number, z: number): Spot => ({ x, y, z });

/** The weapon to swing each tool is. */
export const TOOL_MELEE: Record<ToolId, MeleeId> = { pick: 'tsuruhashi', axe: 'timberAxe', shovel: 'coalShovel', tachi: 'tachi' };
/** Blows of its tool an obstacle takes before it gives (a heavy blow counts two), by tool. */
export const OBSTACLE_HITS: Record<ToolId, number> = { pick: 4, axe: 3, shovel: 3, tachi: 2 };
/** How near (to its spot) and how square on a blow must land to strike an obstacle. */
export const OBSTACLE_REACH = 2.9;
/** The verb on the prompt and the feed, by tool. */
export const TOOL_VERB: Record<ToolId, { verb: string; done: string }> = {
  pick: { verb: 'BREAK', done: 'BROKEN THROUGH' },
  axe: { verb: 'CHOP', done: 'CHOPPED THROUGH' },
  shovel: { verb: 'DIG OUT', done: 'DUG OUT' },
  tachi: { verb: 'CUT', done: 'CUT AWAY' },
};

/** The roof the rotten props hold up: everything under it when they are chopped through is crushed. */
export const PROP_ROOF = { x0: 355.5, z0: 33.5, x1: 364.5, z1: 43.5, y: DEEP_Y, damage: 5000 };
/** What a dug-out cache holds (the slag's is the coal sack, the story's): points, a grenade, an armour plate. */
export const CACHES: Record<string, { cash: number; grenades: number; plates: number }> = { sand: { cash: 500, grenades: 2, plates: 1 } };

// ---------------------------------------------------------------------------------------------
// the built weapons
// ---------------------------------------------------------------------------------------------

export type RecipeId = 'mori' | 'happa' | 'sakuganki' | 'kushibi';
export interface ArmsPart {
  id: string;
  name: string;
  recipe: RecipeId;
  /** Where it lies (the floor it is reached from) and how high above that floor the thing itself rests. */
  at: Spot;
  h: number;
}

/**
 * The parts the story keeps in `parts` (one bit each, in this order). The Mori's two are the story's own (`UMIBOZU.parts`,
 * `moriParts`), so they are not here; the comb is the story's `kushi` stage 1.
 */
export const ARMS_PARTS: readonly ArmsPart[] = [
  { id: 'happa_pipe', name: 'LAUNCH PIPE', recipe: 'happa', at: S(286, DEEP_Y, 27), h: 0.02 },
  { id: 'happa_charge', name: 'BLASTING CHARGES', recipe: 'happa', at: S(463, DEEP_Y, 12), h: 0.02 },
  { id: 'happa_det', name: "THE SHOTFIRER'S EXPLODER", recipe: 'happa', at: S(120.6, Y.sea, 38.4), h: 0.76 },
  { id: 'drill_body', name: 'ROCK DRILL', recipe: 'sakuganki', at: S(463, DEEP_Y, 45), h: 0.02 },
  { id: 'drill_hose', name: 'AIR HOSE', recipe: 'sakuganki', at: S(91, Y.sea, -50.5), h: 0.02 },
  { id: 'drill_steel', name: 'DRILL STEEL', recipe: 'sakuganki', at: S(330, DEEP_Y, 46), h: 0.02 },
  { id: 'kushi_oil', name: 'CAMELLIA OIL', recipe: 'kushibi', at: S(24.2, Y.sea, 40.8), h: 0.86 },
  { id: 'kushi_rope', name: 'A LENGTH OF SACRED ROPE', recipe: 'kushibi', at: S(24.5, Y.summit, -67.5), h: 0.02 },
];
export const ARMS_PART: Record<string, number> = Object.fromEntries(ARMS_PARTS.map((p, i) => [p.id, i]));

/** The bits of `parts` each recipe needs. */
export function recipeMask(r: RecipeId): number {
  let m = 0;
  ARMS_PARTS.forEach((p, i) => {
    if (p.recipe === r) m |= 1 << i;
  });
  return m;
}
/** How many of a recipe's parts are held, of how many. */
export function recipeProgress(parts: number, r: RecipeId): { have: number; need: number } {
  let have = 0;
  let need = 0;
  ARMS_PARTS.forEach((p, i) => {
    if (p.recipe !== r) return;
    need++;
    if (parts & (1 << i)) have++;
  });
  return { have, need };
}

/** Where each workbench is (the story's `WORKBENCHES`), and the gun it builds. */
export const BENCH: Record<'mori' | 'happa' | 'sakuganki', Spot> = {
  mori: WORKBENCHES.find((w) => w.id === 'mori')!,
  happa: WORKBENCHES.find((w) => w.id === 'happa')!,
  sakuganki: WORKBENCHES.find((w) => w.id === 'sakuganki')!,
};
export const BUILT_GUN: Record<'mori' | 'happa' | 'sakuganki', HirasakaGunId> = { mori: 'mori', happa: 'happa', sakuganki: 'sakuganki' };

/** Genzō's comb: lit at the Old Village's Bon fire, and at the revived tree it becomes the Ōkamuzumi. */
export const KUSHI = {
  /** The Bon fire on the village's square, where the comb is lit (stage 2) and its teeth are lit again. */
  light: S(466, DEEP_Y, -32),
  /** Before the revived tree (Kurogane dead): stage 3. */
  tree: S(302, 0, -33),
} as const;

// ---------------------------------------------------------------------------------------------
// the wall buys, the offering box, the pit workshop
// ---------------------------------------------------------------------------------------------

/** The gun on each company price board, and its price (bought again: a full load of its ammunition for `ammo`). */
export const WALL_GUNS: Record<string, { gun: WeaponId; price: number; ammo: number; name: string }> = {
  seawall: { gun: 'shotgun', price: 900, ammo: 450, name: 'PS-12 SHOTGUN' },
  nikkyu: { gun: 'signalka', price: 600, ammo: 300, name: 'SIGNAL PISTOL' },
  market: { gun: 'rifle', price: 1000, ammo: 500, name: 'KR-16 RIFLE' },
  school: { gun: 'arbalet', price: 1400, ammo: 700, name: 'CROSSBOW' },
  pithead: { gun: 'rpg', price: 2000, ammo: 1000, name: 'HX-7 LAUNCHER' },
  face: { gun: 'rifle', price: 1000, ammo: 500, name: 'KR-16 RIFLE' },
};
/** A board's prompt is read from this far, in front of it. */
export const WALL_REACH = 2.4;
/** Where a board is used from: its own spot (the zone builders hung each board on its wall there). */
export function wallSpot(w: (typeof WALL_BUYS)[number]): Spot {
  return { x: w.x, y: w.y, z: w.z };
}

/** Openings of the offering box before it moves to another shrine. */
export const BOX_EVERY = 4;
/** Where the box stands at each shrine (beside its spot, on its floor), and the way it faces. */
export const BOX_PLACES: readonly { x: number; y: number; z: number; yaw: number }[] = [
  { x: SHRINES[0]!.x + 2.5, y: SHRINES[0]!.y, z: SHRINES[0]!.z, yaw: 0 },
  { x: SHRINES[1]!.x + 2.2, y: SHRINES[1]!.y, z: SHRINES[1]!.z + 1.2, yaw: 0 },
  // the village shrine has a saisen-bako of its own at its foot: the travelling box stands on the lane before it
  { x: SHRINES[2]!.x, y: SHRINES[2]!.y, z: SHRINES[2]!.z + 2.2, yaw: 0 },
  // the summit: on the stone plinth the zone left for it
  { x: SHRINES[3]!.x, y: SHRINES[3]!.y + 0.2, z: -59.8, yaw: 0 },
];
/** May the offering box go to shrine `i` now (the village shrine only once someone has ridden the cage down)? */
export function shrineOpen(i: number, cageDown: boolean): boolean {
  return i >= 0 && i < BOX_PLACES.length && (i !== 2 || cageDown);
}

/** The pit workshop in the cage: where the bench stands at each stop (inside the cage, facing out of its door). */
export const WORKSHOP: readonly { x: number; y: number; z: number; yaw: number }[] = [
  // (the cage hangs 4 m north of its stop at the headframe: `look.ts`)
  { x: CAGE.top.x, y: CAGE.top.y, z: CAGE.top.z - 3.1, yaw: 0 },
  { x: CAGE.bottom.x + 0.4, y: CAGE.bottom.y, z: CAGE.bottom.z, yaw: Math.PI / 2 },
];

/** Everything above that a player walks to (the reachability test). */
export function armsSpots(): { id: string; at: Spot }[] {
  return [
    ...ARMS_PARTS.map((p) => ({ id: `part:${p.id}`, at: p.at })),
    { id: 'kushiLight', at: KUSHI.light },
    { id: 'kushiTree', at: KUSHI.tree },
    ...WALL_BUYS.map((w) => ({ id: `wall:${w.id}`, at: wallSpot(w) })),
    ...BOX_PLACES.map((b, i) => ({ id: `box${i}`, at: { x: b.x, y: b.y, z: b.z } })),
    ...WORKSHOP.map((w, i) => ({ id: `workshop${i}`, at: { x: w.x, y: w.y, z: w.z } })),
  ];
}

/** (The Mori's parts are the story's; re-exported here so the arms read one place.) */
export const MORI_PARTS = UMIBOZU.parts;
export const ROOT_TREE_SPOT = DEEP_SPOTS.tree;
