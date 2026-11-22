/**
 * HIRASAKA reborn: the frame (`src/hirasaka/places.ts` is the contract: every pad, flight, room and spot). This file
 * builds what joins the places and what nobody builds alone:
 *
 *  - the sea round the island and the edge of the world;
 *  - the island's PADS: each raised pad is a floor (`ColliderSpec.floor`) on a fill of concrete from the ground up;
 *    where two pads of different height meet, a parapet on the higher one and a stop from y 0 (the y0 = 0 rule: the nav
 *    grid is one height field, so every obstacle on a raised pad spans its body height from the ground); the FLIGHTS
 *    of steps through them (the Hell Stairs and the Stairs of Life among them); the island's outer parapet and seawall;
 *  - Dolphin Pier;
 *  - THE HEIGHTS: Block 65's and the school's top floors and the footbridge, an upper area reached by the school stair;
 *  - THE DEEP: an underground area far east, its rooms carved out of a block of rock (walls where open meets rock,
 *    floors, roofs, the stepped kofun passage and adit stair), joined to the island by the cage and the old adit;
 *  - the obstacles' colliders (opened by `hirasaka/doors.ts`), the map's names, boxes, stations and spawn points.
 *
 * Each place group is built by its own file (`hirasaka<Group>.ts`, one builder each) inside `LevelBuilder.zone`, so a
 * group is drawn only near the player (`hirasaka/runtime.ts` runs the `ZoneSwitch`).
 */
import * as THREE from 'three';
import { MYSTERY_BOX } from '../../config';
import type { BoxCollider } from '../collision';
import type { FloorLink } from '../floors';
import type { SpireHandle, TransmitterHandle } from '../landmarks';
import { groundRect } from '../structures';
import type { Ctx } from './util';
import type { Region } from '../../types';
import { crag, cragLine, dressMats, type DressMats } from './hirasakaDress';
import { H, box } from './hirasakaKit';
import { buildSeawall } from './hirasakaSeawall';
import { buildTown } from './hirasakaTown';
import { buildBlocks } from './hirasakaBlocks';
import { buildSchool } from './hirasakaSchool';
import { buildSummit } from './hirasakaSummit';
import { buildPithead } from './hirasakaPithead';
import { buildGalleries } from './hirasakaGalleries';
import { buildVillage } from './hirasakaVillage';
import { buildRoot } from './hirasakaRoot';
import {
  ADIT,
  CAGE,
  DEEP,
  DEEP_ROOMS,
  DEEP_SPOTS,
  DEEP_Y,
  FLIGHTS,
  GROUPS,
  HEIGHTS,
  HIRASAKA_BOUNDS,
  ISLAND,
  OBSTACLES,
  PADS,
  PIER,
  PLACES_LIST,
  SEA_Y,
  SHRINES,
  STEP_H,
  TREAD,
  WALL_BUYS,
  Y,
  flightRect,
  flightRun,
  slopeY,
  type Flight,
  type GroupId,
} from '../../hirasaka/places';

export interface HirasakaHandles {
  /** The deep's floors area, the cage (players only: always closed to the infected), the old adit (opens on the climb). */
  mineArea: number;
  cageLink: FloorLink;
  aditLink: FloorLink;
  /** The heights (Block 65's and the school's top floors) and the school stair up to them. */
  heightsArea: number;
  heightsLink: FloorLink;
  /** The obstacles' colliders, by `OBSTACLES` index (null: nothing to walk through; built open, `doors.ts` shuts them). */
  obstacles: (BoxCollider | null)[];
  /** The funayūrei's line across the gallery (shut until the ladles are handed over). */
  funaGate: BoxCollider;
}

const B = HIRASAKA_BOUNDS;

/** A stop from y 0 to `top` (absolute), centred on the segment; invisible (the look is built separately). */
function stop(c: Ctx, x0: number, z0: number, x1: number, z1: number, top: number, tag: string, y0 = 0): void {
  const hx = Math.max(0.15, Math.abs(x1 - x0) / 2);
  const hz = Math.max(0.15, Math.abs(z1 - z0) / 2);
  c.b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx, hz, y0, y1: top, mapKind: 'wall', surface: 'concrete', tag });
}

/** Pieces of [a, e] left after cutting out `gaps` (each [from, to]). */
function cut(a: number, e: number, gaps: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  let from = a;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g1 <= from || g0 >= e) continue;
    if (g0 > from) out.push([from, g0]);
    from = Math.max(from, g1);
  }
  if (from < e) out.push([from, e]);
  return out;
}

/** A line along x (`alongX`) or z at `fixed` from a to e: a parapet on top at `y` and a stop from the ground. */
function parapet(c: Ctx, alongX: boolean, fixed: number, a: number, e: number, y: number, h: number, gaps: readonly (readonly [number, number])[], tag: string, mat: THREE.Material = H.concrete): void {
  for (const [p, q] of cut(a, e, gaps)) {
    const mid = (p + q) / 2;
    const len = q - p;
    const x = alongX ? mid : fixed;
    const z = alongX ? fixed : mid;
    box(c.b, mat, x, y + h / 2, z, alongX ? len : 0.3, h, alongX ? 0.3 : len, 0, false);
    stop(c, alongX ? p : fixed - 0.15, alongX ? fixed - 0.15 : p, alongX ? q : fixed + 0.15, alongX ? fixed + 0.15 : q, y + h, tag);
  }
}

/** A flight of steps (`FLIGHTS`): treads built on the lower pad, rising to the edge; cheeks from the ground up. */
function flight(c: Ctx, f: Flight): void {
  const { b } = c;
  const n = Math.round((f.hi - f.lo) / STEP_H);
  const run = flightRun(f);
  const r = flightRect(f);
  const alongZ = f.up === 'n' || f.up === 's';
  const sgn = f.up === 'n' || f.up === 'w' ? -1 : 1; // the way "up" runs along its axis
  const edge = alongZ ? f.z : f.x;
  const named = !!f.name;
  for (let i = 0; i < n; i++) {
    const top = f.lo + (i + 1) * STEP_H;
    // step i runs from (edge - sgn*(run - i*TREAD)) to (edge - sgn*(run - (i+1)*TREAD)); the last one overlaps the edge
    const a = edge - sgn * (run - i * TREAD);
    const e = edge - sgn * (run - (i + 1) * TREAD) + (i === n - 1 ? sgn * 0.5 : 0);
    const mid = (a + e) / 2;
    const len = Math.abs(e - a) + 0.02;
    const cx = alongZ ? f.x : mid;
    const cz = alongZ ? mid : f.z;
    b.collide({ x: cx, z: cz, hx: alongZ ? f.w / 2 : len / 2, hz: alongZ ? len / 2 : f.w / 2, y0: Math.max(0, top - 0.6), y1: top, floor: true, surface: 'concrete', mapKind: 'none', tag: 'step' });
    box(b, named ? H.concreteWet : H.concrete, cx, (f.lo + top) / 2, cz, alongZ ? f.w : len, top - f.lo, alongZ ? len : f.w, 0, false);
  }
  // the cheeks either side: solid from the ground to a rail above the steps
  for (const s of [-1, 1]) {
    const off = s * (f.w / 2 + 0.18);
    const x0 = alongZ ? f.x + off - 0.18 : r.x0;
    const x1 = alongZ ? f.x + off + 0.18 : r.x1;
    const z0 = alongZ ? r.z0 : f.z + off - 0.18;
    const z1 = alongZ ? r.z1 : f.z + off + 0.18;
    stop(c, x0, z0, x1, z1, f.hi + 0.9, 'cheek');
    box(b, H.concreteDark, (x0 + x1) / 2, (f.lo + f.hi) / 2 + 0.2, (z0 + z1) / 2, x1 - x0, f.hi - f.lo + 0.4, z1 - z0, 0, false);
  }
  void run;
}

export function buildHirasaka(c: Ctx): { transmitter: TransmitterHandle; spire: SpireHandle; handles: HirasakaHandles } {
  const { b, d, floors } = c;
  const M = dressMats(c.mats);
  b.coarsePalette = true; // (final polish) fewer plain-colour finishes: the draw budget on Low and Lite (`world/builder.ts`)

  // ---------------------------------------------------------------------------------------------
  // the sea, the edge of everything
  // ---------------------------------------------------------------------------------------------
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1100, 700).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0c1a1e, roughness: 0.25, metalness: 0.55 }));
  sea.position.set(180, SEA_Y, 0);
  b.add(sea, { cast: false });
  for (const [x0, z0, x1, z1] of [
    [B.minX - 2, B.minZ - 2, B.maxX + 2, B.minZ],
    [B.minX - 2, B.maxZ, B.maxX + 2, B.maxZ + 2],
    [B.minX - 2, B.minZ, B.minX, B.maxZ],
    [B.maxX, B.minZ, B.maxX + 2, B.maxZ],
  ] as const) b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y1: 40, mapKind: 'wall', tag: 'edge' });
  // the sea round the island is solid to everyone (nothing out there is ground anyone could stand on)
  for (const [x0, z0, x1, z1] of [
    [B.minX, B.minZ, ISLAND.x0 - 0.3, B.maxZ],
    [ISLAND.x1 + 0.3, B.minZ, B.maxX, B.maxZ],
    [ISLAND.x0 - 0.3, B.minZ, ISLAND.x1 + 0.3, ISLAND.z0 - 0.3],
    [ISLAND.x0 - 0.3, ISLAND.z1 + 0.3, PIER.x0 - 0.2, B.maxZ],
    [PIER.x1 + 0.2, ISLAND.z1 + 0.3, ISLAND.x1 + 0.3, B.maxZ],
    [PIER.x0 - 0.2, PIER.z1 + 0.5, PIER.x1 + 0.2, B.maxZ],
  ] as const) b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y0: -1, y1: 40, mapKind: 'none', blocksShots: false, tag: 'sea' });
  // sea stacks round the island, and the coast across the strait
  let s = 7213;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const rr = 190 + rand() * 80;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr * 0.7;
    if (x > 150) continue; // keep the line to the deep's headland clear
    const sz = 4 + rand() * 6;
    crag(b, M.rock, { x, y: SEA_Y + 4, z, sx: sz, sy: 6 + rand() * 10, sz: sz * 0.85, seed: 300 + i, rot: rand() * 6 });
  }
  // the island's foot: rock and broken concrete below the outer parapet, where the sea breaks
  const footY = (x: number, z: number): number => {
    const p = PADS.find((q) => x >= q.x0 - 1 && x <= q.x1 + 1 && z >= q.z0 - 1 && z <= q.z1 + 1);
    return (p?.y ?? 0) + 1.4;
  };
  cragLine(b, M.rock, ISLAND.x0 - 3, ISLAND.z1, ISLAND.x0 - 3, ISLAND.z0, 7, 811, { y: SEA_Y - 0.6, h: (x, z) => footY(x + 3, z), w: 4, depth: 3.4 });
  cragLine(b, M.rock, ISLAND.x1 + 3, ISLAND.z1, ISLAND.x1 + 3, ISLAND.z0, 7, 812, { y: SEA_Y - 0.6, h: (x, z) => footY(x - 3, z), w: 4, depth: 3.4 });
  cragLine(b, M.rock, ISLAND.x0, ISLAND.z0 - 3, ISLAND.x1, ISLAND.z0 - 3, 7, 813, { y: SEA_Y - 0.6, h: (x, z) => footY(x, z + 3), w: 4.2, depth: 3.6 });
  box(b, H.concreteDark, 0, -0.9, ISLAND.z1 + 1.5, ISLAND.x1 - ISLAND.x0, 1.6, 3, 0, false);

  // ---------------------------------------------------------------------------------------------
  // the pads: a floor on a fill of concrete, the parapets where heights meet, the island's edge
  // ---------------------------------------------------------------------------------------------
  for (const p of PADS) {
    const w = p.x1 - p.x0;
    const dd = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    if (p.y <= 0) {
      groundRect(b, 'asphaltWet', p.x0, p.z0, p.x1, p.z1, 0.01);
      continue;
    }
    b.collide({ x: cx, z: cz, hx: w / 2, hz: dd / 2, y0: p.y - 0.4, y1: p.y, floor: true, surface: 'concrete', mapKind: 'none', tag: `pad-${p.id}` });
    // the fill: what the pad stands on, seen from below as its retaining wall
    box(b, p.id === 'summit' ? H.rock : H.concreteDark, cx, p.y / 2 - 0.01, cz, w - 0.02, p.y, dd - 0.02, 0, false);
    box(b, p.id === 'summit' ? H.stain : H.concreteWet, cx, p.y + 0.005, cz, w, 0.02, dd, 0, false);
  }
  // where two pads of different height meet
  const gapsAt = (alongX: boolean, fixed: number): [number, number][] =>
    FLIGHTS.filter((f) => (alongX ? f.up === 'n' || f.up === 's' : f.up === 'e' || f.up === 'w') && Math.abs((alongX ? f.z : f.x) - fixed) < 0.01).map((f) => {
      const at = alongX ? f.x : f.z;
      return [at - f.w / 2 - 0.36, at + f.w / 2 + 0.36];
    });
  for (let i = 0; i < PADS.length; i++) {
    for (let j = 0; j < PADS.length; j++) {
      if (i === j) continue;
      const A = PADS[i]!;
      const Bp = PADS[j]!;
      if (A.y <= Bp.y) continue; // the higher pad builds the parapet on its own edge
      // A east of B / west of B / north of B / south of B
      const segs: { alongX: boolean; fixed: number; a: number; e: number; off: number }[] = [];
      if (A.x0 === Bp.x1 || A.x1 === Bp.x0) {
        const a = Math.max(A.z0, Bp.z0);
        const e = Math.min(A.z1, Bp.z1);
        if (e > a) segs.push({ alongX: false, fixed: A.x0 === Bp.x1 ? A.x0 : A.x1, a, e, off: A.x0 === Bp.x1 ? 0.15 : -0.15 });
      }
      if (A.z0 === Bp.z1 || A.z1 === Bp.z0) {
        const a = Math.max(A.x0, Bp.x0);
        const e = Math.min(A.x1, Bp.x1);
        if (e > a) segs.push({ alongX: true, fixed: A.z0 === Bp.z1 ? A.z0 : A.z1, a, e, off: A.z0 === Bp.z1 ? 0.15 : -0.15 });
      }
      for (const g of segs) parapet(c, g.alongX, g.fixed + g.off, g.a, g.e, A.y, 1.05, gapsAt(g.alongX, g.fixed), 'parapet');
    }
  }
  // the island's outer edge: a parapet round every pad over the sea, the seawall along the south (open at the pier)
  for (const p of PADS) {
    const south = p.z1 === ISLAND.z1;
    if (p.x0 === ISLAND.x0) parapet(c, false, p.x0 + 0.15, p.z0, p.z1, p.y, 1.1, [], 'sea-rail');
    if (p.x1 === ISLAND.x1) parapet(c, false, p.x1 - 0.15, p.z0, p.z1, p.y, 1.1, [], 'sea-rail');
    if (p.z0 === ISLAND.z0) parapet(c, true, p.z0 + 0.15, p.x0, p.x1, p.y, 1.1, [], 'cliff');
    if (south) parapet(c, true, p.z1 - 0.2, p.x0, p.x1, p.y, 1.4, [[PIER.x0 - 0.1, PIER.x1 + 0.1]], 'seawall', H.concreteWet);
  }
  for (const f of FLIGHTS) flight(c, f);

  // Dolphin Pier: wooden deck on piles, rails, a lamp at the end
  const P = PIER;
  b.collide({ x: (P.x0 + P.x1) / 2, z: (P.z0 + P.z1) / 2, hx: (P.x1 - P.x0) / 2, hz: (P.z1 - P.z0) / 2, y0: -0.4, y1: 0, floor: true, surface: 'wood', mapKind: 'none', tag: 'pier' });
  box(b, H.woodDark, (P.x0 + P.x1) / 2, -0.2, (P.z0 + P.z1) / 2, P.x1 - P.x0, 0.4, P.z1 - P.z0, 0, false);
  for (const x of [P.x0, P.x1]) {
    parapet(c, false, x + (x === P.x0 ? 0.15 : -0.15), P.z0, P.z1, 0, 1.0, [], 'pier-rail', H.woodDark);
    for (let z = P.z0 + 1; z < P.z1; z += 3) box(b, H.woodDark, x, -1.2, z, 0.35, 2.6, 0.35);
  }
  parapet(c, true, P.z1 - 0.15, P.x0, P.x1, 0, 1.0, [], 'pier-end', H.woodDark);

  // ---------------------------------------------------------------------------------------------
  // the heights: Block 65's and the school's top floors and the footbridge (an upper area)
  // ---------------------------------------------------------------------------------------------
  const hy = HEIGHTS.y;
  const heightsArea = floors.addArea('The Heights', 'upper', hy, { minX: HEIGHTS.rect.x0, maxX: HEIGHTS.rect.x1, minZ: HEIGHTS.rect.z0, maxZ: HEIGHTS.rect.z1 });
  for (const sl of HEIGHTS.slabs) {
    const w = sl.x1 - sl.x0;
    const dd = sl.z1 - sl.z0;
    b.collide({ x: (sl.x0 + sl.x1) / 2, z: (sl.z0 + sl.z1) / 2, hx: w / 2, hz: dd / 2, y0: hy - 0.3, y1: hy, floor: true, surface: sl.id === 'bridge' ? 'metal' : 'concrete', mapKind: 'none', tag: `heights-${sl.id}` });
    box(b, sl.id === 'bridge' ? H.iron : H.concreteDark, (sl.x0 + sl.x1) / 2, hy - 0.15, (sl.z0 + sl.z1) / 2, w, 0.3, dd, 0, false);
    // a rail round its open edges (up here a rail only needs to stand on the slab: the ground's grid never sees it)
    const joins = (alongX: boolean, fixed: number, a: number, e: number): [number, number][] =>
      HEIGHTS.slabs
        .filter((o) => o !== sl)
        .flatMap((o): [number, number][] => {
          if (alongX && (o.z0 === fixed || o.z1 === fixed)) return [[Math.max(a, o.x0), Math.min(e, o.x1)]];
          if (!alongX && (o.x0 === fixed || o.x1 === fixed)) return [[Math.max(a, o.z0), Math.min(e, o.z1)]];
          return [];
        })
        .filter(([p, q]) => q > p);
    for (const [alongX, fixed, a, e, off] of [
      [true, sl.z0, sl.x0, sl.x1, 0.12],
      [true, sl.z1, sl.x0, sl.x1, -0.12],
      [false, sl.x0, sl.z0, sl.z1, 0.12],
      [false, sl.x1, sl.z0, sl.z1, -0.12],
    ] as const) {
      for (const [p, q] of cut(a, e, joins(alongX, fixed, a, e))) {
        const mid = (p + q) / 2;
        const x = alongX ? mid : fixed + off;
        const z = alongX ? fixed + off : mid;
        box(b, H.iron, x, hy + 0.55, z, alongX ? q - p : 0.08, 1.1, alongX ? 0.08 : q - p, 0, false);
        b.collide({ x, z, hx: alongX ? (q - p) / 2 : 0.1, hz: alongX ? 0.1 : (q - p) / 2, y0: hy, y1: hy + 1.1, mapKind: 'wall', surface: 'metal', tag: 'heights-rail' });
      }
    }
  }
  // the school stair (a stairwell: in at its foot on the ground floor, out at its head on the top floor)
  const SF = HEIGHTS.stairFoot;
  const SH = HEIGHTS.stairHead;
  const heightsLink = floors.addLink(0, heightsArea, [
    { x: SF.x, y: SF.y, z: SF.z + 1.6 },
    { x: SF.x, y: SF.y, z: SF.z },
    { x: SH.x, y: SH.y, z: SH.z },
    { x: SH.x, y: SH.y, z: SH.z - 1.6 },
  ], true);

  // ---------------------------------------------------------------------------------------------
  // the place groups (each its own file, drawn only near the player)
  // ---------------------------------------------------------------------------------------------
  const inGroup = (id: GroupId, fn: () => void): void => {
    b.zone = id;
    fn();
    b.zone = null;
  };
  inGroup('seawall', () => buildSeawall(c));
  inGroup('town', () => buildTown(c));
  inGroup('blocks', () => buildBlocks(c));
  inGroup('school', () => buildSchool(c));
  inGroup('summit', () => buildSummit(c));
  inGroup('pithead', () => buildPithead(c));

  // ---------------------------------------------------------------------------------------------
  // the deep
  // ---------------------------------------------------------------------------------------------
  const mine = buildDeep(c, M);
  inGroup('galleries', () => buildGalleries(c));
  inGroup('village', () => buildVillage(c));
  inGroup('root', () => buildRoot(c));

  // the cage: players ride it on purpose; the infected never do
  const cageLink = floors.addLink(
    mine,
    0,
    [
      { x: CAGE.bottomOut.x, y: CAGE.bottom.y, z: CAGE.bottomOut.z },
      { x: CAGE.bottom.x, y: CAGE.bottom.y, z: CAGE.bottom.z },
      { x: CAGE.top.x, y: 0, z: CAGE.top.z },
      { x: CAGE.topOut.x, y: 0, z: CAGE.topOut.z },
    ],
    true,
    { closed: true, manual: true },
  );
  // the old adit: the head of the climb below, out at the foot of the Stairs of Life (opened on the climb, when whatever
  // follows you up can follow you out)
  const aditLink = floors.addLink(
    mine,
    0,
    [
      { x: ADIT.head.x, y: ADIT.head.y, z: ADIT.head.z },
      { x: ADIT.door.x, y: ADIT.door.y, z: ADIT.door.z },
      { x: ADIT.mouth.x + 1, y: 0, z: ADIT.mouth.z },
      { x: ADIT.out.x, y: 0, z: ADIT.out.z },
    ],
    true,
    { closed: true, manual: true },
  );

  // the obstacles that stop walkers until their tool opens them (built open, as ZARYA's are: a run shuts the ones the
  // story has not opened, `hirasaka/doors.ts`)
  const obstacles = OBSTACLES.map((o) => {
    if (!o.block) return null;
    const r = o.block;
    // (arms: what stands in the way is drawn shut and opened by `hirasaka/armsLook.ts`, so nothing still stands once opened)
    const col = b.collide({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2, y0: 0, y1: o.at.y + 3.2, mapKind: 'wall', surface: o.tool === 'pick' ? 'concrete' : 'wood', tag: `obstacle-${o.id}` });
    col.blocksMove = false;
    col.blocksShots = false;
    return col;
  });

  // the funayūrei's line across the gallery: walkers stop, shots pass (the drowned stand on it: `hirasaka/director.ts`)
  const fg = DEEP_SPOTS.funaGate;
  const funaGate = b.collide({ x: (fg.x0 + fg.x1) / 2, z: (fg.z0 + fg.z1) / 2, hx: (fg.x1 - fg.x0) / 2, hz: (fg.z1 - fg.z0) / 2, y0: 0, y1: DEEP_Y + 3, blocksShots: false, mapKind: 'wall', tag: 'funa-gate' });
  funaGate.blocksMove = false;

  // ---------------------------------------------------------------------------------------------
  // the map: regions, names, boxes, stations, spawns
  // ---------------------------------------------------------------------------------------------
  d.regionRects.push(
    { region: 'high', x0: DEEP.x0, z0: DEEP.z0, x1: DEEP.x1, z1: DEEP.z1 },
    { region: 'high', x0: -40, z0: -76, x1: 70, z1: -24 },
    { region: 'medium', x0: -160, z0: -76, x1: 70, z1: 14 },
    { region: 'low', x0: B.minX, z0: B.minZ, x1: B.maxX, z1: B.maxZ },
  );
  for (const p of PLACES_LIST) if (!p.deep) d.label(p.name.replace(/^THE /, ''), (p.rect.x0 + p.rect.x1) / 2, (p.rect.z0 + p.rect.z1) / 2, p.id === 'summit' ? 0.85 : 0.65);
  d.road(-18, 24, -14, -24, 'THE HELL STAIRS');
  d.road(80, -6, 70, -6, 'THE STAIRS OF LIFE');
  // the offering box starts at Ebisu's shrine by the pier (`arms` moves it between the four shrines)
  const eb = SHRINES[0]!;
  d.crate(eb.x + 2.5, eb.z, 0, 'low', MYSTERY_BOX.paidCost);
  for (const [x, z] of [[60, 66], [-150, 62], [150, -20]] as const) d.crate(x, z, 0.4, 'low');
  // the stations: the company price board on the seawall, the pit workshop by the cage (`arms` makes it ride the cage)
  const wb = WALL_BUYS[0]!;
  d.station({ kind: 'buy', name: 'COMPANY STORE', x: wb.x, z: wb.z, yaw: wb.yaw, region: 'low' });
  d.station({ kind: 'upgrade', name: 'PIT WORKSHOP', x: CAGE.top.x - 6, z: CAGE.top.z + 4, yaw: Math.PI / 2, region: 'low' });
  // where the infected come from (out of sight, on every pad; the director gates the deep and the drowned ground)
  for (const g of GROUPS) {
    const pts = SPAWNS[g.id];
    const region: Region = g.id === 'galleries' || g.id === 'village' || g.id === 'root' || g.id === 'summit' ? 'high' : g.id === 'school' ? 'medium' : 'low';
    d.spawn(region, 'general', pts.map(([x, z]) => [x, z]), 1);
  }
  d.spawn('high', 'defense', SPAWNS.summit.slice(0, 4), 1);
  d.spawn('high', 'lz', SPAWNS.summit.slice(4, 8), 1);
  d.zombies('low', 'shambler', [[-120, 64], [-60, 66], [30, 62], [-140, 30], [-80, 40], [0, 40], [40, 30]]);
  d.zombies('medium', 'shambler', [[-80, 0], [-120, -40], [-60, -50], [-20, 0], [40, 0]]);
  d.zombies('low', 'shambler', [[100, 30], [130, -30], [140, 60]]);
  d.zombies('high', 'shambler', [[300, 40], [350, 40], [430, 40], [460, -30], [500, -50], [300, -30]]);
  d.zombies('high', 'runner', [[380, 52], [470, -20]]);

  // the mission's relay console and surge spire are unused here (parked on the summit / in the sea)
  const transmitter: TransmitterHandle = { console: { x: 40, y: Y.summit + 1, z: -50 }, consoleYaw: 0, setState() {}, setProgress() {} };
  const spire: SpireHandle = { top: { x: 0, y: 4, z: ISLAND.z1 + 10 }, setSurge() {} };
  return { transmitter, spire, handles: { mineArea: mine, cageLink, aditLink, heightsArea, heightsLink, obstacles, funaGate } };
}

/**
 * Spawn points per place group: out of sight on each group's pads or rooms, never under the heights' slabs (a spawn
 * stands on the highest floor over it), never on a flight. Zone builders move theirs if a building covers one.
 */
export const SPAWNS: Record<GroupId, [number, number][]> = {
  seawall: [[-150, 72], [-110, 72], [-62, 72], [-30, 73], [32, 74], [62, 72], [-132, 58], [10, 58]],
  town: [[-30, 43], [18, 42], [-30, 27], [-8, 18], [26, 52], [66, 52], [66, 40], [24, 18]],
  blocks: [[-156, 50], [-156, 10], [-150, -16], [-110, -16], [-108, 50], [-100, 50], [-44, 50], [-100, 18], [-100, -16], [-46, -16], [-100, 10], [-46, 10]],
  school: [[-156, -24], [-156, -72], [-96, -72], [-96, -24], [-86, -24], [-44, -24], [-44, -72], [-86, -72]],
  summit: [[-36, -72], [66, -72], [66, -28], [-36, -30], [-38, 12], [6, 10], [-36, -20], [6, -20], [14, -20], [40, -20], [14, 10], [66, 10]],
  pithead: [[156, 72], [156, 0], [156, -72], [76, -72], [76, 60], [110, -50], [130, 72]],
  galleries: [[270, 26], [270, 60], [306, 26], [320, 36], [400, 44], [380, 58], [350, 30], [406, 62], [468, 62], [468, 22], [406, 22]],
  village: [[424, -66], [512, -66], [512, -8], [424, -8]],
  root: [[270, -66], [342, -66], [270, -8], [340, -8]],
};

/**
 * The deep: an `under` area far east, carved out of a block of black rock in 1 m cells (`DEEP_ROOMS`). Walls stand
 * along every edge between open and rock from y 0 to the roof (the y0 = 0 rule holds down here too); raised rooms get
 * a floor at their height, slopes a floor per step.
 */
function buildDeep(c: Ctx, D: DressMats): number {
  const { b, floors } = c;
  const M = DEEP;
  const area = floors.addArea('The Deep', 'under', 0, { minX: M.x0, maxX: M.x1, minZ: M.z0, maxZ: M.z1 });
  const rockMat = D.mineWall;
  const roofMat = D.mineRoof;
  // the shell: the deep sits inside a block of black rock (from the island it is a dark headland across the water)
  const shell = new THREE.Mesh(new THREE.BoxGeometry(M.x1 - M.x0 + 8, 40, M.z1 - M.z0 + 8), new THREE.MeshStandardMaterial({ color: 0x0a0c0d, roughness: 1, side: THREE.BackSide }));
  shell.position.set((M.x0 + M.x1) / 2, 19, (M.z0 + M.z1) / 2);
  b.add(shell, { cast: false, receive: false });
  const outer = new THREE.Mesh(new THREE.BoxGeometry(M.x1 - M.x0 + 10, 41, M.z1 - M.z0 + 10), new THREE.MeshStandardMaterial({ color: 0x0b0d0e, roughness: 1 }));
  outer.position.set((M.x0 + M.x1) / 2, 19.6, (M.z0 + M.z1) / 2);
  b.add(outer, { cast: false, receive: false });
  cragLine(b, D.rock, M.x0 - 7, M.z1 + 7, M.x0 - 7, M.z0 - 7, 9, 901, { y: SEA_Y - 1, h: () => 40, w: 7, depth: 5 });

  // carve: 1 m cells, each open cell knows its floor and roof
  const cols = M.x1 - M.x0;
  const rows = M.z1 - M.z0;
  const open = new Uint8Array(cols * rows);
  const roof = new Float32Array(cols * rows);
  for (const r of DEEP_ROOMS) {
    for (let j = Math.max(0, r.z0 - M.z0); j < Math.min(rows, r.z1 - M.z0); j++) {
      for (let i = Math.max(0, r.x0 - M.x0); i < Math.min(cols, r.x1 - M.x0); i++) {
        const k = j * cols + i;
        const x = M.x0 + i + 0.5;
        const z = M.z0 + j + 0.5;
        const y = r.slope ? slopeY(r, x, z) : r.y;
        open[k] = 1;
        roof[k] = Math.max(roof[k]!, y + r.h);
      }
    }
  }
  const isOpen = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < cols && j < rows && open[j * cols + i] === 1;
  const roofOf = (i: number, j: number): number => roof[j * cols + i]!;
  let seed = 9000;
  const emit = (x0: number, z0: number, x1: number, z1: number, y0: number, top: number, solidWall: boolean): void => {
    const hx = Math.max(0.25, (x1 - x0) / 2);
    const hz = Math.max(0.25, (z1 - z0) / 2);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    if (solidWall) b.collide({ x: cx, z: cz, hx, hz, y0: 0, y1: top + 0.5, mapKind: 'wall', surface: 'concrete', tag: 'deep-wall' });
    const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, top + 0.5 - y0, hz * 2), rockMat);
    m.position.set(cx, (top + 0.5 + y0) / 2, cz);
    b.add(m, { cast: false });
    seed++;
  };
  // rows: walls on the north and south sides of open cells (merged into runs of one height); between open cells of
  // different roofs, the face between the roofs (seen, never solid)
  for (const dj of [-1, 1]) {
    for (let j = 0; j < rows; j++) {
      let start = -1;
      let h = 0;
      let lo = 0;
      let solidRun = true;
      const flush = (iEnd: number): void => {
        if (start < 0) return;
        const z = M.z0 + j + (dj < 0 ? 0 : 1);
        emit(M.x0 + start, z - (dj < 0 ? 0.5 : 0), M.x0 + iEnd, z + (dj < 0 ? 0 : 0.5), lo, h, solidRun);
        start = -1;
      };
      for (let i = 0; i <= cols; i++) {
        let edge = false;
        let top = 0;
        let bot = 0;
        let sol = true;
        if (i < cols && isOpen(i, j)) {
          if (!isOpen(i, j + dj)) {
            edge = true;
            top = roofOf(i, j);
          } else if (roofOf(i, j + dj) < roofOf(i, j) - 0.5) {
            edge = true;
            top = roofOf(i, j);
            bot = roofOf(i, j + dj);
            sol = false;
          }
        }
        if (edge && start >= 0 && Math.abs(top - h) < 0.01 && Math.abs(bot - lo) < 0.01 && sol === solidRun) continue;
        flush(i);
        if (edge) {
          start = i;
          h = top;
          lo = bot;
          solidRun = sol;
        }
      }
    }
  }
  for (const di of [-1, 1]) {
    for (let i = 0; i < cols; i++) {
      let start = -1;
      let h = 0;
      let lo = 0;
      let solidRun = true;
      const flush = (jEnd: number): void => {
        if (start < 0) return;
        const x = M.x0 + i + (di < 0 ? 0 : 1);
        emit(x - (di < 0 ? 0.5 : 0), M.z0 + start, x + (di < 0 ? 0 : 0.5), M.z0 + jEnd, lo, h, solidRun);
        start = -1;
      };
      for (let j = 0; j <= rows; j++) {
        let edge = false;
        let top = 0;
        let bot = 0;
        let sol = true;
        if (j < rows && isOpen(i, j)) {
          if (!isOpen(i + di, j)) {
            edge = true;
            top = roofOf(i, j);
          } else if (roofOf(i + di, j) < roofOf(i, j) - 0.5) {
            edge = true;
            top = roofOf(i, j);
            bot = roofOf(i + di, j);
            sol = false;
          }
        }
        if (edge && start >= 0 && Math.abs(top - h) < 0.01 && Math.abs(bot - lo) < 0.01 && sol === solidRun) continue;
        flush(j);
        if (edge) {
          start = j;
          h = top;
          lo = bot;
          solidRun = sol;
        }
      }
    }
  }
  // floors and roofs, room by room (a raised room's floor is a raised floor; a slope's every step is)
  for (const r of DEEP_ROOMS) {
    const w = r.x1 - r.x0;
    const dd = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    if (!r.slope) {
      if (r.y > 0) {
        b.collide({ x: cx, z: cz, hx: w / 2, hz: dd / 2, y0: r.y - 0.4, y1: r.y, floor: true, surface: 'concrete', mapKind: 'none', tag: `deep-${r.id}` });
        box(b, rockMat, cx, r.y / 2, cz, w, r.y, dd, 0, false);
      }
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, dd).rotateX(-Math.PI / 2), D.mineFloor);
      fl.position.set(cx, r.y + 0.01, cz);
      b.add(fl, { cast: false });
      const rf = new THREE.Mesh(new THREE.PlaneGeometry(w, dd).rotateX(Math.PI / 2), roofMat);
      rf.position.set(cx, r.y + r.h, cz);
      b.add(rf, { cast: false, receive: false });
      continue;
    }
    // a slope: one floor per step, across the room
    const sl = r.slope;
    const len = sl.along === 'x' ? w : dd;
    const n = Math.round(Math.abs(sl.y2 - r.y) / STEP_H);
    const tread = len / n;
    for (let k = 0; k < n; k++) {
      const top = r.y + Math.sign(sl.y2 - r.y) * (k + 1) * STEP_H;
      const a = k * tread;
      const e = (k + 1) * tread;
      const mid = (a + e) / 2;
      const at = sl.from === 'min' ? (sl.along === 'x' ? r.x0 : r.z0) + mid : (sl.along === 'x' ? r.x1 : r.z1) - mid;
      const sx = sl.along === 'x' ? at : cx;
      const sz = sl.along === 'x' ? cz : at;
      const hx = sl.along === 'x' ? tread / 2 + 0.02 : w / 2;
      const hz = sl.along === 'x' ? dd / 2 : tread / 2 + 0.02;
      b.collide({ x: sx, z: sz, hx, hz, y0: Math.max(0, top - 0.6), y1: top, floor: true, surface: 'concrete', mapKind: 'none', tag: `deep-${r.id}` });
      box(b, rockMat, sx, top / 2, sz, hx * 2, top, hz * 2, 0, false);
      const rf = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2 + 0.05, hz * 2 + 0.05).rotateX(Math.PI / 2), roofMat);
      rf.position.set(sx, top + r.h, sz);
      b.add(rf, { cast: false, receive: false });
    }
  }
  void seed;
  return area;
}
