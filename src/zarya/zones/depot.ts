/**
 * ZARYA, the TRAM DEPOT: the sheds and the short street north of the Rynok (no THREE). The story (`story.ts`, `runtime.ts`) uses these spots BY NAME: the layout
 * (`world/layout/zarya*.ts`) may move any of them, but every name must stay and must be somewhere a player can stand
 * within 2 m of (unless it says otherwise). x runs east, z south (north is -z).
 *
 * Act II. Reached through the chained gate from the Rynok (south wall) and, once that is cut, by tram (its stop
 * is in the yard, built by the frame). The Okhotnik hunting shop is on its street. The frozen gate in the west wall
 * leads to the pond road (Act III).
 *
 * How it lies (`world/layout/zaryaDepot.ts`): the street runs east-west at z = -92 with the Okhotnik (x 158..174), the
 * workers' canteen (x 182..208) and the depot's garage and woodshed (x 216..244) along its north side; behind them the
 * yard and the tram stop (z = -128); the three sheds fill the north-east corner (x 204.5..243.5, z -187.6..-159.7,
 * doorways in the south face) with the track gang's store against their west wall; the dispatcher's booth stands at the
 * throat of the fan of tracks.
 */
import { yawTo, type PeopleFn, type Rect, type Spot } from '../types';

export const DEPOT = {
  rect: { x0: 146, z0: -190, x1: 246, z1: -70 } as Rect,
  /** The Okhotnik's counter, from the customer's side (the shotgun and the crossbow are bought here): inside the shop, south of the counter. */
  shop: { x: 165, z: -103.4 } as Spot,
  /** Tyotya Zina's route sheet, pinned to the noticeboard on the north wall inside the dispatcher's booth (a clue). */
  sheet: { x: 190.3, z: -144 } as Spot,
  /** Parts: nail strips (on the shelves along the west wall of the track gang's store), a hunting blade (on the display inside the shop's window). */
  strips: { x: 197.3, z: -182.5 } as Spot,
  blade: { x: 164.5, z: -98 } as Spot,
  /** One of the repairman's three tools (a multimeter, on the desk in the dispatcher's booth). */
  tool: { x: 193.5, z: -140.6 } as Spot,
  /**
   * The kiosk shutter bought open with points (`zarya/mods.ts`): the middle of the shutter's foot on a shut kiosk on the
   * street's south pavement, opposite the canteen, facing `shutterYaw` (north, onto the street). Built by `zaryaDepot.ts`.
   * (Act-2 polish: east of the poster column, not at x 196, where its back stood square in the walk from the Rynok's
   * gate, nine metres in: the first thing through the gate was a wall.)
   */
  shutter: { x: 207, z: -82.62 } as Spot,
  shutterYaw: 0,
  /** A weapon mod part (`zarya/mods.ts`): a gunsmith's tin of springs and sights at the east end of the Okhotnik's counter. */
  modPart: { x: 168.8, z: -104.3 } as Spot,
  /** A red fire board on the canteen's street wall, its axe behind a padlocked bar: a heavy blow breaks the lock. The spot is where the axe hangs. */
  fireBoard: { x: 204.2, z: -96.7 } as Spot,
  /** A glass ornament, rolled under the little fir at the west end of the street. */
  ornament: { x: 151.9, z: -99 } as Spot,
  /** One of the places Ded Moroz's sack turns up (`zarya/sack.ts`): on the south side of the street, across from the depot's garage, on open snow with room all round. */
  sack: { x: 226, z: -86 } as Spot,
  /** A sleeper who can be covered against the cold (a person stands here: see `depotPeople`): at the dead brazier behind the canteen. */
  cover: [{ x: 202, z: -116 }] as Spot[],
  /** Where the ones woken wrong come from: out of sight, in the corners of the yard and the street. */
  spawns: [[150, -184], [150, -160], [241, -75], [240, -114], [150, -76]] as [number, number][],
  /**
   * The side stories' places (`zarya/sidestories.ts`): the drivers' pigeonholes on the dispatcher booth's boarded north
   * wall (east of the noticeboard); a rifle with its stock off on the west end of the Okhotnik's counter; a tin on the
   * track gang's west shelves, three metres north of the nail strips.
   */
  side: {
    pigeonhole: { x: 192.6, z: -144.3 } as Spot,
    rifle: { x: 159.6, z: -104.3 } as Spot,
    pin: { x: 197.3, z: -179.6 } as Spot,
  },
} as const;

/** Everyone caught in this zone, standing where the snow found them (never inside anything solid, never on top of another). */
export const depotPeople: PeopleFn = (add, r) => {
  // twenty-six: depot men in the yard and the sheds, the shopkeeper behind his counter (role 'staff', not solid),
  // people on the street, and one at each `cover` spot
  const at = (x: number, z: number, tx: number, tz: number, role?: Parameters<typeof add>[3], solid?: boolean): void => add(x, z, yawTo(x, z, tx, tz) + (r() - 0.5) * 0.3, role, solid);
  // the brazier behind the canteen: the one who can be covered, and his mate
  for (const c of DEPOT.cover) at(c.x, c.z, 203.4, -114.9);
  at(204.9, -115.9, 203.4, -114.9);
  // two fitters looking over the car that stands in the first shed's doorway
  at(214.2, -151.6, 211, -154);
  at(215.4, -153.3, 211, -154);
  // three round the inspection pit in the middle shed
  at(222.3, -172, 224, -174.5);
  at(225.7, -174.6, 224, -174.5);
  at(222.4, -177.2, 224, -174.5);
  // one at the bench at the back of the third shed
  at(239.5, -185.3, 239.5, -187);
  // the dispatcher at her desk, and a driver outside her window
  at(192.3, -142.9, 194, -142.9);
  at(186.9, -141.8, 190, -141.8);
  // the storeman at his shelves
  at(199.6, -183.6, 197, -183.6);
  // a man with a shovel at the sand box
  at(225.8, -117.4, 229, -118);
  // two waiting for the tram
  at(166.8, -121.8, 166.8, -128);
  at(168.5, -122.3, 168.5, -128);
  // the Okhotnik: the shopkeeper behind his counter, two at the counter, one at the rods
  add(165, -106.4, Math.PI, 'staff', false);
  at(161.8, -103.2, 161.8, -106);
  at(168.4, -103, 168.4, -106);
  at(172.4, -101.2, 174, -101.2);
  // a father and his boy at the shop's window
  at(161.6, -95.7, 162, -98);
  at(163, -95.9, 163, -98, 'child');
  // two outside the canteen's door
  at(192.3, -95.3, 193.8, -94.6);
  at(193.7, -94.5, 192.3, -95.3);
  // a couple walking the street, one reading the poster column, a mechanic at the garage doors
  at(178.2, -91.4, 190, -91.4);
  at(179.5, -92.5, 190, -92.5);
  at(203.3, -85.2, 201.6, -84);
  at(224.4, -95.2, 224, -97);
};
