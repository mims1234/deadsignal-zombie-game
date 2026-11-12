/**
 * ZARYA, the BANYA and the frozen POND, north of the Univermag (no THREE). The story (`story.ts`, `runtime.ts`) uses these spots BY NAME: the layout
 * (`world/layout/zarya*.ts`) may move any of them, but every name must stay and must be somewhere a player can stand
 * within 2 m of (unless it says otherwise). x runs east, z south (north is -z).
 *
 * Act III. Reached through the frozen gate from the depot (east wall, opened by the three matryoshkas), by tram
 * (Pond Road, the stop on the south edge, built by the frame), and on west to the heating plant (west wall, open).
 * The steam room is the one warm place in town: it heals whoever sits in it.
 *
 * How it lies: the pond fills the west, an oval of ice 64 m by 76 m; the winter road between the two gates runs
 * straight across it (z = -130), past the cross-shaped ice-hole. The bathhouse stands in the north-east, its door in
 * its south wall; three rooms in a row, west to east: the changing room, the washing room, the steam room. A small
 * park with a statue fills the south-east, and the tram street runs along the south edge.
 */
import { yawTo, type PeopleFn, type Rect, type Spot } from '../types';

/**
 * A hole a fisherman has drilled in the pond's ice: where it is, the way he stands from it (`a`, radians: x = cos,
 * z = sin), and which tent he has pitched behind him (an index into the layout's tent colours; -1 for none).
 */
export interface FishHole {
  x: number;
  z: number;
  a: number;
  tent: number;
  /** His fisherman is the `cover` sleeper (stood by the `cover` list, not with the rest). */
  cover?: boolean;
  /** (Round 3, the shashka's job: `zarya/obstacles.ts` 'tent'.) His tent is lashed shut with frozen rope: the story draws its flap and the ropes. */
  lashed?: boolean;
}
/** How far from his hole a fisherman stands. */
export const FISH_STAND = 0.8;
export const fisher = (h: FishHole): Spot => ({ x: h.x + Math.cos(h.a) * FISH_STAND, z: h.z + Math.sin(h.a) * FISH_STAND });

export const BANYA = {
  rect: { x0: 20, z0: -190, x1: 146, z1: -70 } as Rect,
  /** The bathhouse (walls, roof), and the spot on the steam room's floor in front of its benches (a player sits here to be healed). */
  house: { x0: 106, z0: -166, x1: 142, z1: -152 } as Rect,
  steam: { x: 137.8, z: -162 } as Spot,
  /** The bathhouse's outer door, in its south wall (into the changing room). */
  door: { x: 110, z: -152 } as Spot,
  /** One of the places Ded Moroz's sack turns up (`zarya/sack.ts`): on the bathhouse's forecourt, south-east of its door under the lamp, on open snow with room all round. */
  sack: { x: 124, z: -140 } as Spot,
  /** A part: the stove's heating coil, at the mouth of the steam room's stove (the stove stands against the south wall). */
  coil: { x: 135, z: -154 } as Spot,
  /** The sleepers in the washing room have colour in their faces (a clue: look at them). Between the two middle benches. */
  faces: { x: 124.3, z: -159.55 } as Spot,
  /** The pond's ice (walkable: an oval inside this rectangle), and the cross-shaped ice-hole (nobody goes in: it is fenced by its own rim). */
  pond: { x0: 30, z0: -176, x1: 94, z1: -100 } as Rect,
  /** The head of the ice-hole's wooden steps, on its south arm (the hole's centre is `cross`, 2.8 m north; the ice cross stands beyond it). */
  iceHole: { x: 60, z: -138.2 } as Spot,
  /** The middle of the cross of black water (inside the rim: nobody can stand here). */
  cross: { x: 60, z: -141 } as Spot,
  /** The wooden jetty from the bathhouse's side of the bank out onto the ice (walkable, railed on both sides). */
  jetty: { x0: 87, z0: -150.75, x1: 101.5, z1: -147.75 } as Rect,
  /** The fishermen's holes: six with tents, six without. */
  holes: [
    { x: 48, z: -164, a: -2.21, tent: 0 },
    { x: 64, z: -168, a: -1.571, tent: 1, lashed: true },
    { x: 80, z: -160, a: -0.795, tent: 2 },
    { x: 38, z: -146, a: 3.142, tent: 3 },
    { x: 66, z: -108, a: 1.571, tent: 4 },
    { x: 82, z: -117, a: 0.644, tent: 5 },
    { x: 70, z: -121.8, a: Math.PI / 2, tent: -1, cover: true },
    { x: 52, z: -150, a: 2.6, tent: -1 },
    { x: 74, z: -150, a: 0.4, tent: -1 },
    { x: 36, z: -138, a: 2.9, tent: -1 },
    { x: 86, z: -140, a: -0.3, tent: -1 },
    { x: 70, z: -158, a: 1.2, tent: -1 },
  ] as FishHole[],
  /** A fisherman out on the open ice with no tent behind him (he can be covered against the cold). */
  cover: [{ x: 70, z: -121 }] as Spot[],
  /**
   * The kiosk shutter bought open with points (`zarya/mods.ts`): the middle of the shutter's foot on a shut kiosk at the
   * south edge of the park, facing `shutterYaw` (south, onto the tram street's pavement). Built by `zaryaBanya.ts`.
   */
  shutter: { x: 124, z: -88.68 } as Spot,
  shutterYaw: Math.PI,
  spawns: [[24, -176], [142, -174], [24, -100], [102, -177], [50, -177.5]] as [number, number][],
  /** The side stories' places (`zarya/sidestories.ts`): a chalk board hung on the jetty's north rail at its land end; the catch on the ice by the fourth and the fifth tented holes. */
  side: {
    board: { x: 100.6, z: -150.6 } as Spot,
    kolya: { x: 65.2, z: -109.3 } as Spot,
    tolya: { x: 80.9, z: -118.1 } as Spot,
  },
} as const;

/** Everyone caught in this zone, standing where the snow found them (never inside anything solid, never on top of another). */
export const banyaPeople: PeopleFn = (add, r) => {
  // thirty-three: fishermen at their holes (their stools beside them), two winter swimmers at the ice-hole's steps,
  // children at their hockey, bathers in the changing room and the washing room, a few on the bank
  const face = (x: number, z: number, tx: number, tz: number, role?: Parameters<typeof add>[3], solid = true): void => add(x, z, yawTo(x, z, tx, tz) + (r() - 0.5) * 0.3, role, solid);
  const coverHole = BANYA.holes.find((h) => h.cover)!;
  for (const c of BANYA.cover) add(c.x, c.z, yawTo(c.x, c.z, coverHole.x, coverHole.z));
  for (const h of BANYA.holes) {
    // (round 3: the lashed tent's fisherman went in to warm up and lashed it behind him: his stool is empty)
    if (h.cover || h.lashed) continue;
    const f = fisher(h);
    face(f.x, f.z, h.x, h.z);
  }
  // a friend come over to see what is biting, at two of the tents
  face(62.6, -167.6, 64, -168);
  face(67.5, -108.6, 66, -108);
  // the winter swimmers, either side of the steps down into the ice-hole
  const C = BANYA.cross;
  face(58.4, -137.2, C.x, C.z);
  face(61.7, -137.0, C.x, C.z);
  // hockey on the cleared ice
  face(48, -115, 44.4, -116, 'child');
  face(51.5, -117.2, 48, -115, 'child');
  face(53, -114.5, 48, -115, 'child');
  // one at the jetty's rail looking out over the pond, one by the door, one before the statue in the park
  face(89.5, -148.35, 60, -146);
  face(113.8, -144.8, BANYA.door.x, BANYA.door.z);
  face(126.2, -101.9, 124, -107);

  // ---- the changing room: the attendant behind her desk, a customer at it, three at the benches ----
  add(114.7, -153.8, yawTo(0, 0, 0, -1), 'staff', false);
  face(114.2, -156.5, 114.5, -153.8);
  face(110.5, -164.2, 110.5, -166);
  face(107.9, -157.5, 106, -157.5);
  face(111.2, -161.3, 111.2, -159.6);
  // ---- the washing room: six at the benches and the taps (colour in their faces: `faces`) ----
  face(121.6, -159.5, 121.8, -158.2);
  face(123.0, -157.1, 122.8, -158.2);
  face(126.0, -159.7, 126.2, -160.8);
  face(127.4, -162.0, 127.2, -160.8);
  face(122.0, -163.9, 122.0, -166);
  face(125.5, -153.9, 125.5, -152);
};
