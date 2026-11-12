/**
 * ZARYA, the Univermag's third floor: the staff CANTEEN (an interior built beside the map) (no THREE). The story (`story.ts`, `runtime.ts`) uses these spots BY NAME: the layout
 * (`world/layout/zarya*.ts`) may move any of them, but every name must stay and must be somewhere a player can stand
 * within 2 m of (unless it says otherwise). x runs east, z south (north is -z).
 *
 * Act III. Reached by the store's escalator once the padlock on its shutter is broken. The staff party is frozen
 * mid-toast. The Tamada, the toastmaster, is on the little stage; his three loudspeakers stand in three corners,
 * each plugged into a wall socket a player can reach.
 *
 * The room, west to east: the head of the escalator in the west wall with the coats either side of it, a red runner
 * down the middle aisle, two rows of long tables (each row two runs of five tables, with a way across between the
 * runs), the stage against the east wall. Windows onto the night all along the north wall; the kitchen's serving hatch
 * in the south wall.
 */
import { yawTo, type PeopleFn, type Rect, type Spot } from '../types';

/** One run of five long tables set end to end along x, and who is at each of its twelve places a side (see `SeatKind`). */
export interface CanteenTable {
  /** Its west end, and the line its middle lies on. */
  x0: number;
  z: number;
  /** Twelve places along its north side and twelve along its south, west to east. */
  north: string;
  south: string;
}
/** '.' an empty chair pushed in; 's' someone sitting; 'S' someone on their feet, glass raised, chair pushed back; '_' a chair left pushed back. */
export type SeatKind = '.' | 's' | 'S' | '_';

export const CANTEEN = {
  rect: { x0: 430, z0: -14, x1: 474, z1: 14 } as Rect,
  h: 4.2,
  /** The head of the escalator: where the stairwell from the store comes out (heading east into the room), on the comb plate between the two handrails. */
  head: { x: 433, z: 0 } as Spot,
  /** The little stage with the microphone, where the Tamada stands (on its boards, 0.3 m up, a step behind the microphone). */
  tamada: { x: 468.4, z: 0 } as Spot,
  /**
   * The three loudspeakers' wall sockets (a player pulls each plug): a pale plate at knee height with a black plug in
   * it, on the north wall's pier between the second and third windows, on the south wall beside the stage, and on the
   * south wall west of the serving hatch. Each spot is the floor in front of its socket.
   */
  plugs: [{ x: 443.5, z: -13 }, { x: 467, z: 13 }, { x: 443.5, z: 13 }] as Spot[],
  /** The loudspeakers themselves, in the order of `plugs` (a cable runs along the floor from each to its socket): north-west corner, south-east, south-west. */
  speakers: [{ x: 431.4, z: -12.4 }, { x: 471, z: 12.4 }, { x: 431.4, z: 12.4 }] as Spot[],
  /** Where the party's shatuny come from when he toasts: the aisle under the windows, the kitchen's serving hatch, the cloakroom. */
  spawns: [[452, -11.6], [456, 11.4], [435.6, 9.6]] as [number, number][],
  /** The stage's boards (walkable, `h` above the floor). */
  stage: { x0: 465.6, z0: -5.5, x1: 473.8, z1: 5.5 } as Rect,
  stageH: 0.3,
  /** The serving hatch in the south wall (its middle, and how wide the opening is). */
  hatch: { x: 456, w: 6 },
  /** The long tables. */
  tables: [
    { x0: 437.4, z: -7.4, north: '.S...s._..S.', south: '..s...S..s..' },
    { x0: 452, z: -7.4, north: 'S....s..S...', south: '.s...S._..s.' },
    { x0: 437.4, z: 7.4, north: '.S....s..S..', south: '..s..S.._.s.' },
    { x0: 452, z: 7.4, north: '.s.._..S..S.', south: 'S...s....S..' },
  ] as CanteenTable[],
  /** The side stories' places (`zarya/sidestories.ts`): the complaints book on its shelf on the south wall, west of the serving hatch; the management's notice pinned up east of it. */
  side: {
    complaints: { x: 451.6, z: 13.72 } as Spot,
    reply: { x: 459.8, z: 13.75 } as Spot,
  },
} as const;

/** A run of tables: how long, how wide, how far apart its places are. */
export const CANTEEN_TABLE = { len: 12, w: 1.3, step: 1 } as const;
/** How far from a table's middle line: a chair pushed in, someone standing with a glass, the chair they pushed back. */
export const CANTEEN_SEAT = { chair: 0.95, stand: 1.48, back: 2.12 } as const;
/** Someone sitting is this far down (the figure is drawn standing: sunk, it sits on its chair with its coat to the floor). */
export const CANTEEN_SIT = -0.4;

export interface CanteenSeat {
  /** The place's x, the table's middle line, and which side of it the place is on (-1 north, +1 south). */
  x: number;
  tableZ: number;
  side: -1 | 1;
  kind: SeatKind;
  /** The way a chair pushed in here faces (toward the table). */
  yaw: number;
}

/** Every place at the long tables. */
export function canteenSeats(): CanteenSeat[] {
  const out: CanteenSeat[] = [];
  for (const t of CANTEEN.tables) {
    for (const side of [-1, 1] as const) {
      const row = side < 0 ? t.north : t.south;
      for (let i = 0; i < row.length; i++) out.push({ x: t.x0 + CANTEEN_TABLE.step * (i + 0.5), tableZ: t.z, side, kind: row[i] as SeatKind, yaw: yawTo(0, 0, 0, -side) });
    }
  }
  return out;
}

export interface CanteenGuest {
  x: number;
  z: number;
  y: number;
  yaw: number;
  /** Sitting (else on their feet with a glass raised: the layout draws the arm). */
  sits: boolean;
}

/** The guests, each where the snow found them: the same list for whoever stands them and whoever draws their glasses. */
export function canteenGuests(): CanteenGuest[] {
  const T = CANTEEN.tamada;
  const out: CanteenGuest[] = [];
  canteenSeats().forEach((s, i) => {
    if (s.kind === 's') out.push({ x: s.x, z: s.tableZ + s.side * CANTEEN_SEAT.chair, y: CANTEEN_SIT, yaw: s.yaw + (((i * 5) % 3) - 1) * 0.14, sits: true });
    else if (s.kind === 'S') {
      // on their feet and turned to the toastmaster
      const z = s.tableZ + s.side * CANTEEN_SEAT.stand;
      out.push({ x: s.x, z, y: 0, yaw: yawTo(s.x, z, T.x, T.z) + (((i * 7) % 5) - 2) * 0.07, sits: false });
    }
  });
  // one at the head of the north-west table, who stood to answer the toast
  const first = CANTEEN.tables[0]!;
  out.push({ x: first.x0 - 0.75, z: first.z, y: 0, yaw: yawTo(first.x0 - 0.75, first.z, T.x, T.z), sits: false });
  return out;
}

/** Everyone caught in this zone, standing where the snow found them (never inside anything solid, never on top of another). */
export const canteenPeople: PeopleFn = (add) => {
  // twenty-five: shop assistants in party clothes at the long tables, sitting or on their feet with a glass raised
  // (role 'staff', solid); none in the middle aisle, none near the escalator's head, the stage or a socket
  for (const g of canteenGuests()) add(g.x, g.z, g.yaw, 'staff', true, g.y);
};
