/**
 * ZARYA: what the squad has found, built and opened, as pure rules (no THREE, no game objects). It is one small piece
 * of shared state - which parts are held, which recipes are built, which gates are open - that the solo game, the
 * co-op simulation and the tests all read the same way.
 *
 * The plan's eight ways of getting things reduce to three kinds of state:
 *   shared    parts found, things built at a workbench, gates opened. They belong to the squad, never to one player,
 *             and nothing is ever lost again: a part taken stays taken through a death.
 *   personal  what a player buys at a counter with their own points, or picks up to swing (`buyOffer`).
 *   none      what is found lying about can be taken as often as anyone likes.
 *
 * Nothing here is timed and nothing can be failed or missed.
 */
import type { Inventory } from '../logic/economy';
import type { MeleeId } from '../logic/melee';
import type { WeaponId } from '../types';
import { BANYA, DEPOT, DVOR, GARAGES, INSTITUTE, RYNOK, TETS } from './places';
import type { ZaryaZone } from './types';

/** What a recipe, an offer or a find hands over: a gun, a weapon to swing, a tool that opens a gate, or armour plates. */
export type Gives = { gun: WeaponId } | { melee: MeleeId } | { tool: string } | { plates: number };

export interface PartDef {
  id: string;
  name: string;
  /** The recipe it belongs to. */
  recipe: string;
  zone: ZaryaZone;
  x: number;
  z: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  gives: Gives;
}

export interface GateDef {
  id: string;
  name: string;
  /** The tool (a recipe's `gives.tool`) that opens it. */
  tool: string;
  /** What the prompt says, and how long the hold is. */
  verb: string;
  hold: number;
}

/** Something a counter sells for points. */
export interface OfferDef {
  id: string;
  name: string;
  price: number;
  gives: Gives;
}

/** Something lying where it would be: taken as often as anyone likes. */
export interface FindDef {
  id: string;
  name: string;
  gives: Gives;
  x: number;
  z: number;
}

export interface Catalog {
  parts: readonly PartDef[];
  recipes: readonly RecipeDef[];
  gates: readonly GateDef[];
  offers: readonly OfferDef[];
  finds: readonly FindDef[];
}

/**
 * The town's catalogue.
 *   built   seven things, each from parts found where they would be. The Signalka is the first (Act I). Line One is
 *           fitted at the tram, not at a bench. The bolt cutters open the garages and the depot. The nail gun, the
 *           Salyut and the bear spear are the strong ones, built only at Timur's bench in the garages. The Ottepel is
 *           the wonder weapon, its last part inside the Institute.
 *   bought  at the Univermag's sports counter and the Okhotnik hunting shop by the depot, with points.
 *   found   where they would be: a maul at the woodpile.
 *
 * Round 3 (notes 5 and 6): ZARYA hands out only a few weapons to swing, each with a job (`obstacles.ts`): the knife,
 * the maul (found), the fire axe (the fire board), the bear spear (built), the shashka (the museum guard's cabinet).
 * The skillet, the ski pole, the dog chain, the bat, the boxing gloves and the hockey stick are other maps' now (their
 * code is kept); the sports counter sells goalie's pads instead (an armour plate), not something to swing.
 */
export const TOWN: Catalog = {
  recipes: [
    { id: 'signalka', name: 'SIGNALKA', gives: { gun: 'signalka' } },
    { id: 'line', name: 'TRAM LINE ONE', gives: { tool: 'line' } },
    { id: 'cutters', name: 'BOLT CUTTERS', gives: { tool: 'cutters' } },
    { id: 'gvozdomyot', name: 'GVOZDOMYOT NAIL GUN', gives: { gun: 'gvozdomyot' } },
    { id: 'salyut', name: 'SALYUT BATTERY', gives: { gun: 'salyut' } },
    { id: 'rogatina', name: 'ROGATINA BEAR SPEAR', gives: { melee: 'rogatina' } },
    { id: 'ottepel', name: 'OTTEPEL, "THE THAW"', gives: { gun: 'ottepel' } },
  ],
  parts: [
    { id: 'tube', name: 'Flare tube', recipe: 'signalka', zone: 'shelter', x: 393, z: 4.2 },
    { id: 'cartridges', name: 'Flare cartridges', recipe: 'signalka', zone: 'square', x: 22.4, z: -8.2 },
    { id: 'handle', name: "Zina's handle", recipe: 'line', zone: 'store', x: 134.5, z: -19 },
    { id: 'fuse', name: 'Line fuse', recipe: 'line', zone: 'square', x: -0.7, z: -2 },
    { id: 'shears', name: 'Garden shears', recipe: 'cutters', zone: 'store', x: 75.4, z: -22.6 },
    { id: 'pipes', name: 'Pipe handles', recipe: 'cutters', zone: 'rynok', ...RYNOK.pipes },
    { id: 'tape', name: 'Friction tape', recipe: 'cutters', zone: 'dvor', ...DVOR.tape },
    { id: 'nailer', name: 'Nailer', recipe: 'gvozdomyot', zone: 'garages', ...GARAGES.nailer },
    { id: 'canister', name: 'Gas canister', recipe: 'gvozdomyot', zone: 'rynok', ...RYNOK.canister },
    { id: 'strips', name: 'Nail strips', recipe: 'gvozdomyot', zone: 'depot', ...DEPOT.strips },
    { id: 'tubes', name: 'Launch tubes', recipe: 'salyut', zone: 'garages', ...GARAGES.tubes },
    { id: 'crate', name: 'Salyut crate', recipe: 'salyut', zone: 'square', x: -15.6, z: 19.4 },
    { id: 'cord', name: 'Fuse cord', recipe: 'salyut', zone: 'dvor', ...DVOR.cord },
    { id: 'blade', name: 'Hunting blade', recipe: 'rogatina', zone: 'depot', ...DEPOT.blade },
    { id: 'shaft', name: 'Shovel shaft', recipe: 'rogatina', zone: 'dvor', ...DVOR.shaft },
    { id: 'guard', name: 'Crossguard', recipe: 'rogatina', zone: 'garages', ...GARAGES.guard },
    { id: 'samovar', name: 'Samovar', recipe: 'ottepel', zone: 'rynok', ...RYNOK.samovar },
    { id: 'coil', name: 'Stove coil', recipe: 'ottepel', zone: 'banya', ...BANYA.coil },
    { id: 'valve', name: 'Pressure valve', recipe: 'ottepel', zone: 'tets', ...TETS.valve },
    { id: 'vesna', name: 'Reagent "Vesna"', recipe: 'ottepel', zone: 'institute', ...INSTITUTE.vesna },
  ],
  // the chained gates: the depot's, and the garages' two
  gates: [
    { id: 'depot', name: 'THE DEPOT GATE', tool: 'cutters', verb: 'CUT THE CHAIN', hold: 1.5 },
    { id: 'garagesN', name: 'THE GARAGES, NORTH GATE', tool: 'cutters', verb: 'CUT THE CHAIN', hold: 1.5 },
    { id: 'garagesW', name: 'THE GARAGES, WEST GATE', tool: 'cutters', verb: 'CUT THE CHAIN', hold: 1.5 },
  ],
  // ---- round 3: the sports counter sells a goalie's pads (one armour plate), nothing to swing ----
  offers: [{ id: 'pads', name: "GOALIE'S PADS", price: 300, gives: { plates: 1 } }],
  // ---- round 3: the maul is the one weapon to swing lying about (it breaks padlocks: `obstacles.ts`) ----
  finds: [{ id: 'maul', name: 'SPLITTING MAUL', gives: { melee: 'maul' }, ...DVOR.woodpile }],
};
/** The Okhotnik's shelf (the hunting shop by the depot): long guns, for points. */
export const OKHOTNIK: readonly OfferDef[] = [
  { id: 'shotgun', name: 'PS-12 SHOTGUN', price: 1200, gives: { gun: 'shotgun' } },
  { id: 'arbalet', name: 'ARBALET CROSSBOW', price: 1500, gives: { gun: 'arbalet' } },
];
/** The police post in the Rynok: one rifle on the rack. */
export const POLICE: readonly OfferDef[] = [{ id: 'rifle', name: 'KR-16 RIFLE', price: 1000, gives: { gun: 'rifle' } }];
/** The parts, by name (their index in `TOWN.parts`). */
export const PART = { tube: 0, cartridges: 1, handle: 2, fuse: 3, shears: 4, pipes: 5, tape: 6, nailer: 7, canister: 8, strips: 9, tubes: 10, crate: 11, cord: 12, blade: 13, shaft: 14, guard: 15, samovar: 16, coil: 17, valve: 18, vesna: 19 } as const;
export const RECIPE = { signalka: 0, line: 1, cutters: 2, gvozdomyot: 3, salyut: 4, rogatina: 5, ottepel: 6 } as const;
/** The chained gates, by name (their index in `TOWN.gates`), and which `GATES` entry each is. */
export const CHAIN = { depot: 0, garagesN: 1, garagesW: 2 } as const;

/** The shared state: one bit per part, per recipe and per gate, in the catalogue's order. */
export interface UnlockView {
  parts: number;
  built: number;
  gates: number;
}

export type UnlockEvent = { kind: 'part'; i: number } | { kind: 'built'; i: number } | { kind: 'gate'; i: number };

const bit = (i: number): number => 1 << i;

export class Unlock {
  readonly view: UnlockView = { parts: 0, built: 0, gates: 0 };
  private events: UnlockEvent[] = [];

  constructor(readonly cat: Catalog) {
    if (cat.parts.length > 30 || cat.recipes.length > 30 || cat.gates.length > 30) throw new Error('Unlock: more than 30 of a kind does not fit the wire');
    for (const p of cat.parts) if (!cat.recipes.some((r) => r.id === p.recipe)) throw new Error(`Unlock: part ${p.id} belongs to no recipe`);
    for (const g of cat.gates) if (!cat.recipes.some((r) => 'tool' in r.gives && r.gives.tool === g.tool)) throw new Error(`Unlock: nothing builds the tool for gate ${g.id}`);
  }

  static has(mask: number, i: number): boolean {
    return (mask & bit(i)) !== 0;
  }

  /** A new run. */
  reset(): void {
    this.view.parts = 0;
    this.view.built = 0;
    this.view.gates = 0;
    this.events = [];
  }

  /** What happened since the last call (for whoever plays the sound and says the line). */
  drain(): UnlockEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** A squad member walked over part `i`. False when the squad already has it. */
  takePart(i: number): boolean {
    if (i < 0 || i >= this.cat.parts.length || Unlock.has(this.view.parts, i)) return false;
    this.view.parts |= bit(i);
    this.events.push({ kind: 'part', i });
    return true;
  }

  /** How many of recipe `r`'s parts the squad holds, of how many. */
  static progress(cat: Catalog, v: UnlockView, r: number): { have: number; need: number } {
    const id = cat.recipes[r]?.id;
    let have = 0;
    let need = 0;
    cat.parts.forEach((p, i) => {
      if (p.recipe !== id) return;
      need++;
      if (Unlock.has(v.parts, i)) have++;
    });
    return { have, need };
  }

  /** The parts of recipe `r` the squad does not hold yet. */
  static missing(cat: Catalog, v: UnlockView, r: number): PartDef[] {
    const id = cat.recipes[r]?.id;
    return cat.parts.filter((p, i) => p.recipe === id && !Unlock.has(v.parts, i));
  }

  /** Every part of recipe `r` is held and it is not built yet. */
  static canBuild(cat: Catalog, v: UnlockView, r: number): boolean {
    if (r < 0 || r >= cat.recipes.length || Unlock.has(v.built, r)) return false;
    const p = Unlock.progress(cat, v, r);
    return p.need > 0 && p.have === p.need;
  }

  /** The first recipe that can be built now, or -1. */
  static buildable(cat: Catalog, v: UnlockView): number {
    for (let r = 0; r < cat.recipes.length; r++) if (Unlock.canBuild(cat, v, r)) return r;
    return -1;
  }

  /** The squad has built the thing that hands over `tool`. */
  static hasTool(cat: Catalog, v: UnlockView, tool: string): boolean {
    return cat.recipes.some((r, i) => 'tool' in r.gives && r.gives.tool === tool && Unlock.has(v.built, i));
  }

  /** Gate `g` can be opened now: its tool is built and it is still shut. */
  static canOpen(cat: Catalog, v: UnlockView, g: number): boolean {
    const gate = cat.gates[g];
    return !!gate && !Unlock.has(v.gates, g) && Unlock.hasTool(cat, v, gate.tool);
  }

  /** Build recipe `r` at a workbench. False when a part is missing or it is built already. */
  build(r: number): boolean {
    if (!Unlock.canBuild(this.cat, this.view, r)) return false;
    this.view.built |= bit(r);
    this.events.push({ kind: 'built', i: r });
    return true;
  }

  /** Open gate `g` with its tool. */
  open(g: number): boolean {
    if (!Unlock.canOpen(this.cat, this.view, g)) return false;
    this.view.gates |= bit(g);
    this.events.push({ kind: 'gate', i: g });
    return true;
  }
}

/** A player pays for an offer out of their own points. False when they cannot afford it. */
export function buyOffer(inv: Inventory, offer: OfferDef): boolean {
  if (inv.cash < offer.price) return false;
  inv.cash -= offer.price;
  return true;
}

/** The shared state as a co-op report's row, and back (null when the row is not one). */
export function encodeUnlock(v: UnlockView): number[] {
  return [v.parts, v.built, v.gates];
}

export function decodeUnlock(row: unknown): UnlockView | null {
  if (!Array.isArray(row) || row.length < 3 || !row.every((n) => Number.isInteger(n) && n >= 0)) return null;
  return { parts: row[0] as number, built: row[1] as number, gates: row[2] as number };
}
