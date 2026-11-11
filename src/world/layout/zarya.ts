/**
 * ZARYA: the whole town (`src/zarya/places.ts` has the frame, `src/zarya/zones/*.ts` every zone's own places). Ten
 * zones of street map and three interiors built beside it, each built by a file of its own out of the pieces in
 * `zaryaKit.ts`. This file is the frame that joins them: it puts each in its zone (`LevelBuilder.zone`: a zone is only
 * drawn near the player), builds the walls between zones and the gates in them, stands a tram at every stop of Line
 * One, joins the interiors to their doorways, stands the town's people where they were caught, and says where the
 * infected come from.
 */
import { MYSTERY_BOX } from '../../config';
import type { BoxCollider } from '../collision';
import type { FloorLink } from '../floors';
import type { SpireHandle, TransmitterHandle } from '../landmarks';
import type { Ctx } from './util';
import { BANYA, BERLOGA, CANTEEN, CORE, DEPOT, DK, DVOR, GARAGES, GATES, INSTITUTE, RYNOK, STOPS, STORE, TETS, UPSTAIRS, ZARYA, ZARYA_BOUNDS, ZARYA_ZONES, people, type ZaryaZone } from '../../zarya/places';
import type { Region } from '../../types';
import { Z, box, cyl, solid } from './zaryaKit';
import { buildBanya } from './zaryaBanya';
import { buildBerloga } from './zaryaBerloga';
import { buildCanteen } from './zaryaCanteen';
import { buildDepot } from './zaryaDepot';
import { buildDk } from './zaryaDk';
import { buildDvor } from './zaryaDvor';
import { buildGarages } from './zaryaGarages';
import { buildInstitute } from './zaryaInstitute';
import { buildRynok } from './zaryaRynok';
import { buildSquare, tramStop } from './zaryaSquare';
import { buildShelter, buildStore } from './zaryaStore';
import { buildTets } from './zaryaTets';
import { buildUpstairs } from './zaryaUpstairs';

export interface ZaryaHandles {
  /** The doorway under the store's jammed shutter (built open; a run shuts it until the plug is pulled). */
  shutter: BoxCollider;
  /** The shelter's blast door (built open; the story shuts it behind the squad and the manual release opens it). */
  blastDoor: BoxCollider;
  /** The shelter's area (`floors.ts`), and the staff stairs down to it. */
  shelterArea: number;
  stairs: FloorLink;
  /** A collider for each of `people()` that a walker can bump into (null for the ones behind counters). */
  people: (BoxCollider | null)[];
  /** The gates between zones, by `GATES` id (each built open; a run shuts the ones the story has not opened). */
  gates: Record<string, BoxCollider>;
  /** The Rynok's cold store door (built open; barred behind Borya). */
  coldDoor: BoxCollider;
  /**
   * The store's second floor: its area, and the escalator up to it from the ground floor (shut until its padlock is
   * broken). The canteen on the third floor: its area, and the escalator on up to it from the second floor (always
   * open: the padlock below is the only lock on the way).
   */
  upstairsArea: number;
  escalator: FloorLink;
  canteenArea: number;
  escalatorUp: FloorLink;
  /** The Berloga hall under the Institute: its area, the lift down to it, and the door with four key slots. */
  berlogaArea: number;
  lift: FloorLink;
  keyDoor: BoxCollider;
}

const B = ZARYA_BOUNDS;
const P = ZARYA;
const WALL_H = 3;

/**
 * A wall along a zone's edge from (x0, z0) to (x1, z1) (axis-aligned), with gaps where the gates are: a concrete
 * fence three metres high under a cap of snow.
 */
function border(c: Ctx, x0: number, z0: number, x1: number, z1: number, gaps: readonly { at: number; half: number }[] = []): void {
  const { b } = c;
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const from = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const to = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const fixed = alongX ? z0 : x0;
  const cuts = [...gaps].sort((p, q) => p.at - q.at);
  let cur = from;
  const run = (a: number, e: number): void => {
    const len = e - a;
    if (len < 0.2) return;
    const mid = (a + e) / 2;
    const x = alongX ? mid : fixed;
    const z = alongX ? fixed : mid;
    box(b, Z.concreteDark, x, WALL_H / 2, z, alongX ? len : 0.4, WALL_H, alongX ? 0.4 : len);
    box(b, Z.snow, x, WALL_H + 0.07, z, alongX ? len : 0.54, 0.14, alongX ? 0.54 : len, 0, false);
    solid(c, x, z, alongX ? len : 0.4, alongX ? 0.4 : len, WALL_H, 'zarya-border', { kind: 'wall' });
  };
  for (const g of cuts) {
    run(cur, g.at - g.half);
    cur = g.at + g.half;
  }
  run(cur, to);
}

/** A gate's posts, and its collider (built open: the story shuts and opens it). */
function gate(c: Ctx, g: (typeof GATES)[number]): BoxCollider {
  const { b } = c;
  const alongX = g.along === 'x';
  for (const s of [-1, 1]) {
    const x = alongX ? g.x + s * (g.half + 0.2) : g.x;
    const z = alongX ? g.z : g.z + s * (g.half + 0.2);
    box(b, Z.iron, x, 1.8, z, 0.4, 3.6, 0.4);
    box(b, Z.snow, x, 3.66, z, 0.5, 0.12, 0.5, 0, false);
  }
  return b.collide({ x: g.x, z: g.z, hx: alongX ? g.half : 0.25, hz: alongX ? 0.25 : g.half, y1: WALL_H, blocksMove: false, blocksShots: false, mapKind: 'none', surface: 'metal', tag: `zarya-gate-${g.id}` });
}

/**
 * A doorway into an interior built beside the map, from the street (or from another interior, `from`): walk in at
 * `top` heading `top.yaw`, come out at `foot` facing `foot.yaw`.
 */
function doorway(c: Ctx, area: number, top: { x: number; z: number; yaw: number }, foot: { x: number; z: number; yaw: number }, from = 0): FloorLink {
  const step = (o: { x: number; z: number; yaw: number }, d: number) => ({ x: o.x - Math.sin(o.yaw) * d, y: 0, z: o.z - Math.cos(o.yaw) * d });
  // lower end first: [interior out-point, interior foot, entry on the near side, out-point on the near side]
  return c.floors.addLink(area, from, [step(foot, 1.6), { x: foot.x, y: 0, z: foot.z }, { x: top.x, y: 0, z: top.z }, step(top, -1.6)], true);
}

export function buildZarya(c: Ctx): { transmitter: TransmitterHandle; spire: SpireHandle; handles: ZaryaHandles } {
  const { b, d } = c;
  const inZone = <T>(id: ZaryaZone, fn: () => T): T => {
    b.zone = id;
    const out = fn();
    b.zone = null;
    return out;
  };
  const gapsOn = (along: 'x' | 'z', fixed: number): { at: number; half: number }[] => GATES.filter((g) => g.along === along && (along === 'x' ? g.z : g.x) === fixed).map((g) => ({ at: along === 'x' ? g.x : g.z, half: g.half }));

  // ---- the zones ----
  inZone('square', () => buildSquare(c));
  const store = inZone('store', () => buildStore(c));
  const shelter = inZone('shelter', () => buildShelter(c, store.stairs));
  const rynok = inZone('rynok', () => buildRynok(c));
  inZone('dvor', () => buildDvor(c));
  inZone('garages', () => buildGarages(c));
  inZone('depot', () => buildDepot(c));
  inZone('dk', () => buildDk(c));
  inZone('banya', () => buildBanya(c));
  inZone('tets', () => buildTets(c));
  inZone('institute', () => buildInstitute(c));
  // the interiors reached by a doorway of their own: up the store's escalator to its second floor, on up the next
  // escalator from there to the canteen on the third, down the Institute's lift
  const upstairs = inZone('upstairs', () => buildUpstairs(c, (area) => doorway(c, area, { x: 112, z: -0.9, yaw: 0 }, { x: UPSTAIRS.foot.x, z: UPSTAIRS.foot.z, yaw: 0 })));
  const canteen = inZone('canteen', () => buildCanteen(c, (area) => doorway(c, area, { x: UPSTAIRS.up.x, z: UPSTAIRS.up.z, yaw: -Math.PI / 2 }, { x: CANTEEN.head.x, z: CANTEEN.head.z, yaw: -Math.PI / 2 }, upstairs.area)));
  const berloga = inZone('berloga', () => buildBerloga(c, (area) => doorway(c, area, { x: INSTITUTE.lift.x, z: INSTITUTE.lift.z, yaw: INSTITUTE.liftYaw }, { x: BERLOGA.liftFoot.x, z: BERLOGA.liftFoot.z, yaw: -Math.PI / 2 })));
  // the escalator is roped off and shuttered until its padlock is broken (`zarya/runtime.ts`)
  upstairs.link.closed = true;

  // ---- the walls between zones, and the gates in them (each wall drawn with the zone on its far side from the square) ----
  inZone('dvor', () => border(c, CORE.minX, 72, 100, 72, gapsOn('x', 72)));
  inZone('garages', () => {
    border(c, 100, 72, B.maxX, 72, gapsOn('x', 72));
    border(c, 100, 72, 100, B.maxZ, gapsOn('z', 100));
  });
  inZone('rynok', () => border(c, 146, CORE.minZ, 146, 72, gapsOn('z', 146)));
  inZone('depot', () => {
    border(c, 146, -70, B.maxX, -70, gapsOn('x', -70));
    border(c, 146, B.minZ, 146, -70, gapsOn('z', 146));
  });
  inZone('banya', () => border(c, 20, -70, 146, -70));
  inZone('tets', () => {
    border(c, CORE.minX, -70, 20, -70);
    border(c, 20, B.minZ, 20, -70, gapsOn('z', 20));
  });
  inZone('institute', () => {
    border(c, B.minX, -70, CORE.minX, -70);
    border(c, CORE.minX, B.minZ, CORE.minX, -70, gapsOn('z', -104));
  });
  // the Palace's back wall is the Dom Kultury's front: the passage through the Palace comes out at z = -23
  inZone('dk', () => {
    border(c, CORE.minX, -70, CORE.minX, 72, [{ at: -23, half: 2.2 }]);
    border(c, B.minX, 72, CORE.minX, 72);
  });
  const gates: Record<string, BoxCollider> = {};
  for (const g of GATES) gates[g.id] = inZone(g.zones[1], () => gate(c, g));

  // ---- Line One: a stop and a car at every stop but the square's (which the square builds itself, with Zina in the cab) ----
  for (const s of STOPS) {
    if (s.id === 'square') continue;
    const side = s.door.z > s.z ? 1 : -1;
    inZone(s.zone, () => {
      tramStop(c, s.x, s.z, side, GATES);
      // the folding steps under each open door (the doors were gaps 0.9 m up a red flank, with nothing to climb by):
      // a car's near doors are 2.7 m either side of the coupling, its far doors 13.8 m (`STOPS[].door` is one of them)
      for (const dx of [-13.8, -2.7, 2.7, 13.8]) {
        box(c.b, Z.iron, s.x + dx, 0.5, s.z + side * 1.42, 1.3, 0.06, 0.36, 0, false);
        box(c.b, Z.iron, s.x + dx, 0.24, s.z + side * 1.66, 1.3, 0.06, 0.32, 0, false);
        for (const e of [-1, 1]) box(c.b, Z.iron, s.x + dx + e * 0.62, 0.38, s.z + side * 1.5, 0.05, 0.36, 0.5, 0, false);
      }
    });
  }

  // ---- the edges of the map, and the ground nobody can get to ----
  for (const [x0, z0, x1, z1] of [
    [B.minX - 2, B.minZ - 2, B.maxX + 2, B.minZ],
    [B.minX - 2, B.maxZ, B.maxX + 2, B.maxZ + 2],
    [B.minX - 2, B.minZ, B.minX, B.maxZ],
    [B.maxX, B.minZ, B.maxX + 2, B.maxZ],
  ] as const) b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y1: 8, mapKind: 'wall', tag: 'zarya-edge' });
  const beyond = (x0: number, z0: number, x1: number, z1: number, h = 3, shots = true): void => {
    solid(c, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, 'zarya-beyond', { kind: 'none', shots });
  };
  // south-west of the town there is nothing: the corner outside the Dvor's west wall
  beyond(B.minX, 72.2, CORE.minX, B.maxZ);
  inZone('dvor', () => border(c, CORE.minX, 72, CORE.minX, B.maxZ));
  // behind the wall along the tram line, the Palace's corner, behind the store's lane, the back of the cloakroom,
  // the space behind the noticeboard's wall
  const wallZ = P.trackZ - 6.8;
  solid(c, (CORE.minX + CORE.maxX) / 2, P.trackZ - 6.6, CORE.maxX - CORE.minX, 0.4, 3, 'zarya-wall', { kind: 'wall' });
  beyond(CORE.minX, CORE.minZ, CORE.maxX, wallZ);
  beyond(CORE.minX, wallZ, P.palace.x1, P.palace.z0);
  beyond(68, 40.4, 146, 72);
  beyond(96, STORE.strip + 0.2, 114, STORE.z1 - 0.2, STORE.h);
  beyond(70.6, STORE.strip + 0.9, 95.8, STORE.z1 - 0.3, 1, false);

  // ---- the people of the town, standing where they were caught: nothing passes through them, nothing hurts them ----
  const stood = people().map((p) => {
    if (!p.solid) return null;
    const small = p.role === 'child' || p.role === 'kostya' || p.role === 'girl';
    return b.collide({ x: p.x, z: p.z, hx: 0.26, hz: 0.26, y0: p.y, y1: p.y + (small ? 1.2 : 1.75), surface: 'fabric', mapKind: 'none', tag: 'sleeper' });
  });

  // ---- the map: how dangerous each zone is, its name, where the ones woken wrong come from ----
  const zone = (id: ZaryaZone) => ZARYA_ZONES.find((q) => q.id === id)!;
  const SPAWNS: readonly [ZaryaZone, Region, readonly (readonly [number, number])[]][] = [
    ['rynok', 'medium', RYNOK.spawns],
    ['dvor', 'medium', DVOR.spawns],
    ['garages', 'medium', GARAGES.spawns],
    ['depot', 'medium', DEPOT.spawns],
    ['dk', 'high', DK.spawns],
    ['banya', 'high', BANYA.spawns],
    ['tets', 'high', TETS.spawns],
    ['institute', 'high', INSTITUTE.spawns],
    ['upstairs', 'medium', UPSTAIRS.spawns],
    ['canteen', 'high', CANTEEN.spawns],
    ['berloga', 'high', BERLOGA.spawns],
  ];
  d.regionRects.push({ region: 'low', x0: STORE.x0, z0: CORE.minZ, x1: CORE.maxX, z1: CORE.maxZ }, { region: 'low', x0: 350, z0: -40, x1: 410, z1: 40 });
  for (const [id, region, pts] of SPAWNS) {
    const q = zone(id);
    d.regionRects.push({ region, x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1 });
    const list = pts.map(([x, z]) => [x, z] as [number, number]);
    d.spawn(region, 'general', list, 1);
    d.spawn(region, 'defense', list.slice(0, 2), 1);
    d.spawn(region, 'lz', list.slice(0, 2), 1);
  }
  d.regionRects.push({ region: 'medium', x0: CORE.minX, z0: CORE.minZ, x1: STORE.x0, z1: CORE.maxZ });
  for (const q of ZARYA_ZONES) {
    if (q.x0 > B.maxX) continue;
    const at: Partial<Record<ZaryaZone, [number, number]>> = { square: [-8, 34], store: [105, 20], dk: [-150, -23] };
    const [lx, lz] = at[q.id] ?? [(q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2];
    d.label(q.name, lx, lz, 0.9);
  }
  d.label('PALACE OF CULTURE', -94, -22, 0.6);
  d.label('ICE TOWN', -56, 34, 0.6);
  d.label('THE FAIR', 27, -4, 0.6);
  d.label('TRAM LINE 1', 24, -57, 0.6);

  // ---- where things are bought: cartridges at the store's hunting counter and the Rynok's police post, the repair
  // booth in the Rynok, and Ded Moroz's sack under the little fir on the square (the paid box) ----
  d.station({ kind: 'buy', name: 'HUNTING COUNTER', x: 102, z: -23.2, yaw: Math.PI, region: 'low' });
  d.station({ kind: 'buy', name: 'POLICE POST', x: RYNOK.police.x, z: RYNOK.police.z, yaw: RYNOK.policeYaw, region: 'medium' });
  d.station({ kind: 'upgrade', name: 'REPAIR BOOTH', x: RYNOK.booth.x, z: RYNOK.booth.z, yaw: RYNOK.boothYaw, region: 'medium' });
  d.crate(P.sack.x, P.sack.z, 0.5, 'medium', MYSTERY_BOX.paidCost);

  // the square and the store, as before
  d.spawn('medium', 'general', [[-76, -18], [-76, 12], [-50, 53], [-6, 53], [36, 53], [62, 44], [60, -46], [-34, -47], [-20, 50], [56, 52]], 1);
  d.spawn('medium', 'defense', [[-76, 12], [36, 53], [60, -46]], 1);
  d.spawn('medium', 'lz', [[-76, -18], [-6, 53]], 1);
  d.spawn('low', 'general', [[136, 0], [128, 11], [74, -20], [90, 11], [136, -12], [108, -20]], 1);
  d.spawn('low', 'defense', [[136, 0], [90, 11]], 1);
  d.spawn('low', 'lz', [[136, 0], [74, -20]], 1);
  // a few already on their feet out on the square (the story clears them until the town has gone quiet)
  d.zombies('medium', 'shambler', [[-40, -12], [10, 44], [48, 8], [-24, 22], [38, -36], [-62, 4]]);
  d.zombies('medium', 'runner', [[-10, -34], [30, 30]]);
  d.zombies('low', 'shambler', [[126, -2], [88, 10]]);
  void cyl;
  void DK;
  void GARAGES;
  void DEPOT;
  void BANYA;
  void TETS;

  // the mission's relay console and surge spire stand somewhere on every map; here they are in a corner and do nothing
  const transmitter: TransmitterHandle = { console: { x: B.minX + 3, y: 1, z: B.minZ + 3 }, consoleYaw: 0, setState() {}, setProgress() {} };
  const spire: SpireHandle = { top: { x: B.maxX - 3, y: 6, z: B.maxZ - 3 }, setSurge() {} };
  return {
    transmitter,
    spire,
    handles: {
      shutter: store.handles.shutter,
      blastDoor: shelter.door,
      shelterArea: shelter.area,
      stairs: shelter.stairs,
      people: stood,
      gates,
      coldDoor: rynok.coldDoor,
      upstairsArea: upstairs.area,
      escalator: upstairs.link,
      canteenArea: canteen.area,
      escalatorUp: canteen.link,
      berlogaArea: berloga.area,
      lift: berloga.link,
      keyDoor: berloga.keyDoor,
    },
  };
}
