/**
 * ZARYA, the RYNOK: the covered market east of the Univermag (no THREE). The story (`story.ts`, `runtime.ts`) uses these spots BY NAME: the layout
 * (`world/layout/zarya*.ts`) may move any of them, but every name must stay and must be somewhere a player can stand
 * within 2 m of (unless it says otherwise). x runs east, z south (north is -z).
 *
 * Act II. Reached by tram (its stop is on the north edge, built by the frame) and through two gates in the west
 * wall. Borya the Butcher guards his cold store: he is led inside and the door is barred behind him.
 *
 * The lie of it: the tram line along the north (z = -54) behind its wall, the hall in the middle with three arched
 * doorways north and south and one west, the cold store built onto its east end, shuttered kiosks, the repair booth
 * and the police post down the west side, and the open yard with the matryoshka south of the hall.
 */
import { type PeopleFn, type Rect, type Spot, yawTo } from '../types';

export const RYNOK = {
  rect: { x0: 146, z0: -70, x1: 246, z1: 72 } as Rect,
  /** The covered market hall (its outer walls), and the cold store at its east end (one room, one door, a side hatch a person fits through but Borya does not). */
  hall: { x0: 166, z0: -30, x1: 228, z1: 10 } as Rect,
  coldStore: { x0: 228, z0: -22, x1: 242, z1: 2 } as Rect,
  /** The cold store's door (in the wall between the hall and the store): its middle, and the wall's x. Walkers pass through it east-west. It is 2.4 m wide. */
  coldDoor: { x: 228, z: -10 } as Spot,
  /** Deep inside the cold store, in the aisle between the carcass rows: Borya has to be past this point before the door can be barred. */
  coldInside: { x: 238, z: -10 } as Spot,
  /** Outside the side hatch: where a player comes out, in the open air south of the cold store (NOT inside it). */
  hatch: { x: 235, z: 4.5 } as Spot,
  /** Inside the cold store, at the hatch: a player standing here can climb out through it (the hatch is a small steel flap in the south wall, drawn but not an opening: nothing walks through it). */
  hatchIn: { x: 235, z: 0.6 } as Spot,
  /** Where a player stands to bar the door (in the hall, south of the door: the bar leans on the wall there), and the board of hooks his keys hang on (on the same wall north of the door, past the open leaf: the middle hook is left empty for them). */
  bar: { x: 226.4, z: -7.6 } as Spot,
  keyHook: { x: 226.4, z: -15.2 } as Spot,
  /** Where Borya stands until the squad comes (in the hall's middle aisle, between his meat rows). */
  borya: { x: 214, z: -10 } as Spot,
  /** The police post's counter (the rifle is bought here: the game's own buy station stands at this spot under the post's canopy, facing `policeYaw`: a player stands east of it). */
  police: { x: 158, z: 52 } as Spot,
  policeYaw: -Math.PI / 2,
  /** The butcher's ledger, lying on his counter (a clue: read it from the middle aisle). */
  ledger: { x: 216.75, z: -14.15 } as Spot,
  /** The repair booth (the game's own upgrade station stands here under the striped awning, facing `boothYaw`: a player stands east of it). */
  booth: { x: 156, z: 20 } as Spot,
  boothYaw: -Math.PI / 2,
  /** The painted matryoshka, two metres tall on a plinth (its top is 0.6 m up), out in the yard with ten metres of clear ground round it. */
  doll: { x: 197, z: 38 } as Spot,
  /** Parts lying where they would be: a gas canister (on the floor against the ironmonger's stall, with the welding gear), pipe handles (on the plumber's counter), a samovar (on the tea stall's counter, beside the stall's own). */
  canister: { x: 176, z: -25.3 } as Spot,
  pipes: { x: 203.6, z: 4.2 } as Spot,
  samovar: { x: 172, z: 4.2 } as Spot,
  /** A glass ornament from the town tree, where it rolled: against the end of the yard's east row of stalls, by a hand cart. */
  ornament: { x: 232, z: 40 } as Spot,
  /** Sleepers who can be covered against the cold (a person stands at each: see `people`). */
  cover: [{ x: 186, z: -12 }, { x: 204, z: 30 }] as Spot[],
  /** Where the ones woken wrong come from: out of sight, behind the wall along the tram line and in the yard's far corners. */
  spawns: [[152, -66], [240, -65.5], [241, 66], [153, 67], [238, 30]] as [number, number][],
} as const;

export type StallKind = 'iron' | 'veg' | 'milk' | 'fish' | 'honey' | 'sweets' | 'meat' | 'butcher' | 'bread' | 'hats' | 'pickles' | 'tea' | 'pharmacy' | 'plumber' | 'felt';

/** The hall's stalls: four rows of four blocks (counters all round, the seller inside), with aisles between them. */
const COLS: readonly (readonly [number, number])[] = [[170.2, 180.8], [185.9, 194.5], [199.5, 208.1], [213.2, 222.4]];
const ROWS: readonly (readonly [number, number])[] = [[-24.6, -21.6], [-16.8, -13.8], [-6.2, -3.2], [1.6, 4.6]];
const KINDS: readonly (readonly StallKind[])[] = [
  ['iron', 'veg', 'milk', 'fish'],
  ['honey', 'sweets', 'meat', 'butcher'],
  ['bread', 'hats', 'pickles', 'meat'],
  ['tea', 'pharmacy', 'plumber', 'felt'],
];
export const RYNOK_STALLS: readonly (Rect & { kind: StallKind })[] = ROWS.flatMap(([z0, z1], r) => COLS.map(([x0, x1], k) => ({ x0, z0, x1, z1, kind: KINDS[r]![k]! })));

export type YardKind = 'veg' | 'apples' | 'mandarins' | 'pots' | 'toys' | 'felt' | 'fish' | 'honey';
/** The open-air stalls: a table under a canvas on four posts, 4.2 m by 2.5 m, its front the way `rot` turns +z (0 south, pi north, pi/2 east). */
export const RYNOK_YARD: readonly { x: number; z: number; rot: number; kind: YardKind }[] = [
  // under the hall's south wall
  { x: 171, z: 21, rot: 0, kind: 'veg' },
  { x: 176.2, z: 21, rot: 0, kind: 'apples' },
  { x: 218, z: 21, rot: 0, kind: 'pots' },
  { x: 223.2, z: 21, rot: 0, kind: 'felt' },
  // the yard's south-west rows, facing each other
  { x: 171, z: 41, rot: 0, kind: 'mandarins' },
  { x: 176.2, z: 41, rot: 0, kind: 'toys' },
  { x: 171, z: 50, rot: Math.PI, kind: 'honey' },
  { x: 176.2, z: 50, rot: Math.PI, kind: 'veg' },
  // and its south-east rows
  { x: 218, z: 41, rot: 0, kind: 'toys' },
  { x: 223.2, z: 41, rot: 0, kind: 'mandarins' },
  { x: 228.4, z: 41, rot: 0, kind: 'honey' },
  { x: 218, z: 50, rot: Math.PI, kind: 'fish' },
  { x: 223.2, z: 50, rot: Math.PI, kind: 'apples' },
  // north of the hall, by the cold store's lorry
  { x: 226, z: -39, rot: 0, kind: 'pots' },
  { x: 234, z: -39, rot: 0, kind: 'veg' },
  // the west lane
  { x: 151, z: -8, rot: Math.PI / 2, kind: 'felt' },
  // either side of the way in from the garages' gate, facing it
  { x: 189.6, z: 59.5, rot: Math.PI / 2, kind: 'pots' },
  { x: 189.6, z: 64.6, rot: Math.PI / 2, kind: 'fish' },
  { x: 204.4, z: 59.5, rot: -Math.PI / 2, kind: 'apples' },
  { x: 204.4, z: 64.6, rot: -Math.PI / 2, kind: 'honey' },
];

/** Everyone caught in this zone, standing where the snow found them (never inside anything solid, never on top of another). */
export const rynokPeople: PeopleFn = (add, r) => {
  // forty-two: shoppers along the rows, stallholders behind their counters (role 'staff', not solid), and one at each `cover` spot
  const turn = (): number => (r() - 0.5) * 0.5;
  // ---- the hall: a seller inside most of the blocks, looking out over one counter or the other ----
  RYNOK_STALLS.forEach((q, i) => {
    if (q.kind === 'pharmacy' || i % 3 === 1) return;
    add(q.x0 + 1.6 + r() * (q.x1 - q.x0 - 3.2), (q.z0 + q.z1) / 2, (r() < 0.5 ? 0 : Math.PI) + turn(), 'staff', false);
  });
  // shoppers at the counters: [block, side (-1 its north face, +1 its south), how far along it (0..1)]
  const atCounter: readonly (readonly [number, number, number])[] = [
    [4, 1, 0.3], [6, 1, 0.6], [7, 1, 0.75], // honey, meat, the butcher's (clear of the ledger)
    [9, -1, 0.5], [10, -1, 0.3], // hats, pickles
    [1, -1, 0.4], [3, -1, 0.5], // vegetables, dried fish
    [12, 1, 0.75], [13, 1, 0.5], // tea, the pharmacy window
    [5, -1, 0.5], // sweets
  ];
  for (const [i, s, t] of atCounter) {
    const q = RYNOK_STALLS[i]!;
    const x = q.x0 + 1 + t * (q.x1 - q.x0 - 2);
    add(x, s < 0 ? q.z0 - 0.75 : q.z1 + 0.75, (s < 0 ? Math.PI : 0) + turn(), i === 5 ? 'child' : 'towns');
  }
  // ---- the yard: customers at the open stalls, their sellers under the canvas ----
  const front = (i: number, u: number, d: number): [number, number] => {
    const s = RYNOK_YARD[i]!;
    return [s.x + u * Math.cos(s.rot) + d * Math.sin(s.rot), s.z - u * Math.sin(s.rot) + d * Math.cos(s.rot)];
  };
  for (const [i, u] of [[0, -0.6], [4, 0.5], [7, -0.4], [9, 0.3], [13, 0.6]] as const) {
    const [x, z] = front(i, u, 2.05);
    const s = RYNOK_YARD[i]!;
    add(x, z, yawTo(x, z, s.x, s.z) + turn());
  }
  for (const i of [0, 4, 9, 14]) {
    const [x, z] = front(i, 0.4, -0.75);
    add(x, z, RYNOK_YARD[i]!.rot + Math.PI + turn(), 'staff', false);
  }
  // looking at the matryoshka, and the two who can be covered
  const D = RYNOK.doll;
  for (const [x, z] of [[190.6, 44], [203.6, 44.6], [189.2, 44.9]] as const) add(x, z, yawTo(x, z, D.x, D.z) + turn(), x < 190 ? 'child' : 'towns');
  add(RYNOK.cover[0]!.x, RYNOK.cover[0]!.z, yawTo(RYNOK.cover[0]!.x, RYNOK.cover[0]!.z, 190, -14) + turn());
  add(RYNOK.cover[1]!.x, RYNOK.cover[1]!.z, yawTo(RYNOK.cover[1]!.x, RYNOK.cover[1]!.z, D.x, D.z) + turn());
  // waiting for the tram that never left (south of its doors, clear of the stop), one at the police counter, one at
  // the repair booth, one in front of a shut kiosk, a loader by the lorry
  for (const [x, z, tx, tz] of [
    [180, -48.4, 184, -54], [181.4, -47.8, 186, -54], [207.6, -48.2, 204, -54],
    [160.6, 55.2, RYNOK.police.x, RYNOK.police.z], [158.8, 16.6, RYNOK.booth.x, RYNOK.booth.z],
    [152.6, -31, 149, -31], [233.2, -30.6, 236, -27.4],
  ] as const) add(x, z, yawTo(x, z, tx, tz) + turn());
};
