/**
 * Buildings you can go up: storeys with real floors, a switchback stairwell from the ground to the roof, windows on
 * every storey, a walkable roof behind a parapet. Each storey and the roof are areas in `floors.ts`, joined by the
 * stairs, so the infected follow you up (and the people with you do too).
 *
 * Geometry: the footprint is axis-aligned. The stairwell is a rectangle inside it: two flights side by side (lane A goes
 * up from the near end to a landing at the far end, lane B comes back up to the near end, one storey higher), walled on
 * its three other sides. Every floor slab has a hole over the stairwell; both lanes open onto the slab at the near end.
 */
import * as THREE from 'three';
import type { ColliderSpec } from '../collision';
import type { FloorPoint } from '../floors';
import type { MaterialName } from '../materials';
import { addBox, wall, type Opening } from '../structures';
import type { Ctx } from './util';

export type Axis = 'x' | 'z';

export interface StairwellSpec {
  /** The stairwell's near-end centre line: where both lanes meet the floor. */
  x: number;
  z: number;
  /** The way the flights run from the near end (unit, axis-aligned): (1,0), (-1,0), (0,1) or (0,-1). */
  dx: number;
  dz: number;
}

export interface StoreyBuildingSpec {
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Walkable storeys counting the ground floor (2 = a ground floor and one upstairs). */
  storeys: number;
  storeyH?: number;
  /** A walkable roof behind a parapet, up the same stairs. */
  roofAccess?: boolean;
  wall: MaterialName;
  floor?: MaterialName;
  trim?: MaterialName;
  stair: StairwellSpec;
  /** Ground-floor doorways, by side: positions along the side (from its west / north end) and widths. */
  doors?: Partial<Record<'N' | 'S' | 'E' | 'W', { at: number; width: number }[]>>;
  /** Doorways on upper storeys (onto a balcony or a plank bridge across to the next building). */
  upperDoors?: { storey: number; side: 'N' | 'S' | 'E' | 'W'; at: number; width: number }[];
  /** Windows on the upper storeys (and the ground floor unless `groundWindows` is false). */
  windowEvery?: number;
  groundWindows?: boolean;
  /** Interior walls per storey (storey index 0 = ground), each with its own doorways. */
  rooms?: { storey: number; x0: number; z0: number; x1: number; z1: number; openings?: Opening[] }[];
  /** Window glass left out (broken, open holes) on this share of windows. */
  broken?: number;
  tag?: string;
}

export interface StoreyBuilding {
  /** Area id per storey (index 0 is the street, 0); the roof's last when it has one. */
  areas: number[];
  /** Height of each storey's floor. */
  floorY: number[];
  inner: { x0: number; z0: number; x1: number; z1: number };
}

const STEP = { rise: 0.25, tread: 0.3, lane: 1.4, divider: 0.16, landing: 1.5 };

/** Build a building you can go up; registers its storeys (and roof) and stairs with `c.floors`. */
export function storeyBuilding(c: Ctx, s: StoreyBuildingSpec): StoreyBuilding {
  const { b, floors } = c;
  const H = s.storeyH ?? 4;
  const t = 0.35;
  const slabT = 0.3;
  const floorMat: MaterialName = s.floor ?? 'concreteSlab';
  const tag = s.tag ?? s.name;
  const steps = Math.round(H / 2 / STEP.rise);
  const run = steps * STEP.tread;
  const st = s.stair;
  // the stairwell rectangle: lanes side by side across the run direction
  const W = STEP.lane * 2 + STEP.divider;
  const L = run + STEP.landing;
  const along = st.dx !== 0 ? 'x' : 'z';
  // lane A on the left of the run direction, lane B on the right
  const side = { x: -st.dz, z: st.dx };
  const swX0 = Math.min(st.x, st.x + st.dx * L) - (along === 'z' ? W / 2 : 0);
  const swX1 = Math.max(st.x, st.x + st.dx * L) + (along === 'z' ? W / 2 : 0);
  const swZ0 = Math.min(st.z, st.z + st.dz * L) - (along === 'x' ? W / 2 : 0);
  const swZ1 = Math.max(st.z, st.z + st.dz * L) + (along === 'x' ? W / 2 : 0);
  const laneC = (lane: 'A' | 'B'): { x: number; z: number } => {
    const o = (lane === 'A' ? -1 : 1) * (STEP.lane / 2 + STEP.divider / 2);
    return { x: st.x + side.x * o, z: st.z + side.z * o };
  };
  const box = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, mat: MaterialName | null, spec: Partial<ColliderSpec> | null): void => {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    if (w < 0.01 || d < 0.01) return;
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    if (mat) addBox(b, mat, x, (y0 + y1) / 2, z, w, y1 - y0, d);
    if (spec) b.collide({ x, z, hx: w / 2, hz: d / 2, y0, y1, ...spec });
  };

  // ---- floors: every storey above the ground (and a walkable roof) is slabs round the stairwell hole ----
  const areas = [0];
  const floorY = [0];
  const pad = 0.6;
  const topY = s.storeys * H;
  for (let k = 1; k < s.storeys; k++) {
    const y = k * H;
    floorY.push(y);
    // the slab minus the stairwell: four pieces round the hole
    const pieces: [number, number, number, number][] = [
      [s.x0, s.z0, s.x1, swZ0],
      [s.x0, swZ1, s.x1, s.z1],
      [s.x0, swZ0, swX0, swZ1],
      [swX1, swZ0, s.x1, swZ1],
    ];
    for (const [ax, az, bx, bz] of pieces) {
      box(ax, az, bx, bz, y - slabT, y, floorMat, { floor: true, surface: 'concrete', mapKind: 'none', tag: `${tag}-floor` });
    }
    areas.push(floors.addArea(`${s.name} ${k + 1}F`, 'upper', y, { minX: s.x0 - pad, maxX: s.x1 + pad, minZ: s.z0 - pad, maxZ: s.z1 + pad }));
  }
  if (s.roofAccess) {
    // the roof, walkable: slabs round the stairwell (the stair hut covers the hole)
    floorY.push(topY);
    for (const [ax, az, bx, bz] of [
      [s.x0, s.z0, s.x1, swZ0],
      [s.x0, swZ1, s.x1, s.z1],
      [s.x0, swZ0, swX0, swZ1],
      [swX1, swZ0, s.x1, swZ1],
    ] as const) {
      box(ax, az, bx, bz, topY - slabT, topY, 'roof', { floor: true, surface: 'concrete', mapKind: 'none', tag: `${tag}-roof` });
    }
    areas.push(floors.addArea(`${s.name} roof`, 'upper', topY, { minX: s.x0 - pad, maxX: s.x1 + pad, minZ: s.z0 - pad, maxZ: s.z1 + pad }));
  } else {
    // a roof over everything, not walkable
    box(s.x0, s.z0, s.x1, s.z1, topY - slabT, topY, 'roof', { mapKind: 'building', tag: `${tag}-roof` });
  }

  // ---- outer walls, storey by storey (doors on the ground floor, windows above) ----
  const every = s.windowEvery ?? 3.2;
  const sides: { side: 'N' | 'S' | 'E' | 'W'; x0: number; z0: number; x1: number; z1: number }[] = [
    { side: 'N', x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z0 },
    { side: 'S', x0: s.x0, z0: s.z1, x1: s.x1, z1: s.z1 },
    { side: 'W', x0: s.x0, z0: s.z0, x1: s.x0, z1: s.z1 },
    { side: 'E', x0: s.x1, z0: s.z0, x1: s.x1, z1: s.z1 },
  ];
  let wi = 0;
  for (let k = 0; k < s.storeys; k++) {
    for (const sd of sides) {
      const len = Math.hypot(sd.x1 - sd.x0, sd.z1 - sd.z0);
      const openings: Opening[] = [];
      const doors = k === 0 ? (s.doors?.[sd.side] ?? []) : (s.upperDoors ?? []).filter((u) => u.storey === k && u.side === sd.side);
      for (const d of doors) openings.push({ at: d.at, width: d.width, height: 2.6, kind: 'door', frame: s.trim ?? 'concreteDark' });
      if (k > 0 || s.groundWindows !== false) {
        const n = Math.floor((len - 1.5) / every);
        for (let i = 0; i < n; i++) {
          const at = (len - (n - 1) * every) / 2 + i * every;
          if (doors.some((d) => Math.abs(d.at - at) < d.width / 2 + 1)) continue;
          // the stairwell's walls stay blank
          const wx = sd.x0 + ((sd.x1 - sd.x0) * at) / len;
          const wz = sd.z0 + ((sd.z1 - sd.z0) * at) / len;
          if (wx > swX0 - 0.8 && wx < swX1 + 0.8 && wz > swZ0 - 0.8 && wz < swZ1 + 0.8) continue;
          const brokenOne = (wi++ * 7919) % 100 < (s.broken ?? 0.35) * 100;
          openings.push({ at, width: 1.3, height: 1.4, sill: 1.0, kind: 'window', frame: s.trim ?? 'concreteDark', lit: false, barricade: brokenOne });
        }
      }
      wall(b, { x0: sd.x0, z0: sd.z0, x1: sd.x1, z1: sd.z1, height: H, thickness: t, material: s.wall, openings, y0: k * H, mapKind: 'building', tag: `${tag}-wall` });
    }
  }
  // the roof: a parapet all round
  if (s.roofAccess) {
    for (const sd of sides) wall(b, { x0: sd.x0, z0: sd.z0, x1: sd.x1, z1: sd.z1, height: 1.1, thickness: 0.3, material: s.wall, y0: topY, mapKind: 'none', tag: `${tag}-parapet` });
  }
  // interior walls
  for (const r of s.rooms ?? []) {
    wall(b, { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, height: H - slabT, thickness: 0.2, material: 'plaster', openings: r.openings, y0: r.storey * H, mapKind: 'none', tag: `${tag}-room` });
  }

  // ---- the stairwell: walls on its three closed sides, the divider, the flights and landings ----
  const stairTop = s.roofAccess ? topY : (s.storeys - 1) * H;
  const flightsUpTo = s.roofAccess ? s.storeys : s.storeys - 1;
  const wallTop = s.roofAccess ? topY + 2.6 : topY;
  // closed sides: the two long sides and the far end
  const far = { x: st.x + st.dx * L, z: st.z + st.dz * L };
  const enclose = (ax: number, az: number, bx: number, bz: number): void => {
    wall(b, { x0: ax, z0: az, x1: bx, z1: bz, height: wallTop, thickness: 0.2, material: 'plaster', y0: 0, mapKind: 'none', tag: `${tag}-stairwell` });
  };
  const half = W / 2 + 0.1;
  enclose(st.x + side.x * half, st.z + side.z * half, far.x + side.x * half, far.z + side.z * half);
  enclose(st.x - side.x * half, st.z - side.z * half, far.x - side.x * half, far.z - side.z * half);
  enclose(far.x - side.x * half, far.z - side.z * half, far.x + side.x * half, far.z + side.z * half);
  // the divider between the lanes, from the near end to the landing (rail height above the highest flight)
  for (let k = 0; k < flightsUpTo; k++) {
    const y0 = k * H;
    const d0 = { x: st.x, z: st.z };
    const d1 = { x: st.x + st.dx * run, z: st.z + st.dz * run };
    const dw = along === 'x' ? { w: run, d: STEP.divider } : { w: STEP.divider, d: run };
    addBox(b, 'concreteDark', (d0.x + d1.x) / 2, y0 + H / 2, (d0.z + d1.z) / 2, dw.w, H, dw.d);
    b.collide({ x: (d0.x + d1.x) / 2, z: (d0.z + d1.z) / 2, hx: dw.w / 2, hz: dw.d / 2, y0, y1: y0 + H, mapKind: 'none', tag: `${tag}-divider` });
  }
  // the flights: lane A up to the landing, lane B back up to the next floor
  const stepBox = (lane: 'A' | 'B', i: number, yTop: number): void => {
    const lc = laneC(lane);
    // lane A's step i is i treads from the near end; lane B's is counted from the landing back
    const dist = lane === 'A' ? (i + 0.5) * STEP.tread : run - (i + 0.5) * STEP.tread;
    const cx = lc.x + st.dx * dist;
    const cz = lc.z + st.dz * dist;
    const w = along === 'x' ? STEP.tread : STEP.lane;
    const d = along === 'x' ? STEP.lane : STEP.tread;
    addBox(b, 'concreteSlab', cx, yTop - 0.12, cz, w, 0.24, d);
    b.collide({ x: cx, z: cz, hx: w / 2, hz: d / 2, y0: yTop - 0.24, y1: yTop, floor: true, surface: 'concrete', mapKind: 'none', tag: `${tag}-stair` });
  };
  for (let k = 0; k < flightsUpTo; k++) {
    const base = k * H;
    for (let i = 0; i < steps; i++) stepBox('A', i, base + (i + 1) * STEP.rise);
    // the landing at the far end, across both lanes
    const lmid = { x: st.x + st.dx * (run + STEP.landing / 2), z: st.z + st.dz * (run + STEP.landing / 2) };
    const lw = along === 'x' ? STEP.landing : W;
    const ld = along === 'x' ? W : STEP.landing;
    box(lmid.x - lw / 2, lmid.z - ld / 2, lmid.x + lw / 2, lmid.z + ld / 2, base + H / 2 - 0.24, base + H / 2, 'concreteSlab', { floor: true, surface: 'concrete', mapKind: 'none', tag: `${tag}-landing` });
    for (let i = 0; i < steps; i++) stepBox('B', i, base + H / 2 + (i + 1) * STEP.rise);
    // the walk up, for the infected: in front of lane A, up it, across the landing, down lane B, out onto the floor
    const a = laneC('A');
    const bb = laneC('B');
    const out = 0.9;
    const path: FloorPoint[] = [
      { x: a.x - st.dx * out, y: base, z: a.z - st.dz * out },
      { x: a.x, y: base, z: a.z },
      { x: a.x + st.dx * run, y: base + H / 2, z: a.z + st.dz * run },
      { x: a.x + st.dx * (run + STEP.landing / 2), y: base + H / 2, z: a.z + st.dz * (run + STEP.landing / 2) },
      { x: bb.x + st.dx * (run + STEP.landing / 2), y: base + H / 2, z: bb.z + st.dz * (run + STEP.landing / 2) },
      { x: bb.x + st.dx * run, y: base + H / 2, z: bb.z + st.dz * run },
      { x: bb.x, y: base + H, z: bb.z },
      { x: bb.x - st.dx * out, y: base + H, z: bb.z - st.dz * out },
    ];
    floors.addLink(areas[k]!, areas[k + 1]!, path);
  }
  // on the top floor nothing goes up from lane A: a rail across its near end and along the divider, so nobody walks off
  // into the hole
  {
    const a = laneC('A');
    const y = stairTop;
    const rail = (cx: number, cz: number, w: number, d: number): void => {
      addBox(b, 'steelDark', cx, y + 0.55, cz, w, 1.1, d);
      b.collide({ x: cx, z: cz, hx: w / 2, hz: d / 2, y0: y - 0.3, y1: y + 1.1, blocksShots: false, mapKind: 'none', tag: `${tag}-rail` });
    };
    rail(a.x, a.z, along === 'x' ? 0.08 : STEP.lane, along === 'x' ? STEP.lane : 0.08);
    const m = { x: st.x + st.dx * (run / 2), z: st.z + st.dz * (run / 2) };
    rail(m.x, m.z, along === 'x' ? run : 0.08, along === 'x' ? 0.08 : run);
  }
  // the stair hut on the roof: a little roof over the stairwell
  if (s.roofAccess) {
    box(swX0 - 0.1, swZ0 - 0.1, swX1 + 0.1, swZ1 + 0.1, wallTop - 0.2, wallTop, 'roof', { mapKind: 'none', tag: `${tag}-hut` });
  }
  return { areas, floorY, inner: { x0: s.x0 + t / 2, z0: s.z0 + t / 2, x1: s.x1 - t / 2, z1: s.z1 - t / 2 } };
}

/**
 * A straight flight of steps from (x, z) at `y0` up along (dx, dz) to `y1` (scaffold stairs up a container stack, a
 * flight up to a platform), railed on both sides, and its link between the two areas (`floors.ts`). Returns the top.
 */
export function straightStairs(
  c: Ctx,
  o: { x: number; z: number; dx: number; dz: number; width: number; y0: number; y1: number; lower: number; upper: number; mat?: MaterialName },
): { x: number; z: number } {
  const { b, floors } = c;
  const n = Math.max(1, Math.round((o.y1 - o.y0) / STEP.rise));
  const rise = (o.y1 - o.y0) / n;
  const run = n * STEP.tread;
  const alongX = o.dx !== 0;
  const mat = o.mat ?? 'grating';
  for (let i = 0; i < n; i++) {
    const d = (i + 0.5) * STEP.tread;
    const cx = o.x + o.dx * d;
    const cz = o.z + o.dz * d;
    const top = o.y0 + (i + 1) * rise;
    const w = alongX ? STEP.tread : o.width;
    const dd = alongX ? o.width : STEP.tread;
    addBox(b, mat, cx, top - 0.06, cz, w, 0.12, dd);
    b.collide({ x: cx, z: cz, hx: w / 2, hz: dd / 2, y0: top - 0.24, y1: top, floor: true, surface: 'metal', mapKind: 'none', tag: 'stairs' });
  }
  // the rails: a collider each side from the steps up past the handrail, and the rail itself
  const side = { x: -o.dz, z: o.dx };
  const mid = { x: o.x + (o.dx * run) / 2, z: o.z + (o.dz * run) / 2 };
  for (const s of [-1, 1]) {
    const rx = mid.x + side.x * s * (o.width / 2 + 0.04);
    const rz = mid.z + side.z * s * (o.width / 2 + 0.04);
    const w = alongX ? run : 0.08;
    const d = alongX ? 0.08 : run;
    b.collide({ x: rx, z: rz, hx: w / 2, hz: d / 2, y0: o.y0, y1: o.y1 + 1.1, blocksShots: false, mapKind: 'none', tag: 'stair-rail' });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(alongX ? Math.hypot(run, o.y1 - o.y0) : 0.05, 0.05, alongX ? 0.05 : Math.hypot(run, o.y1 - o.y0)), b.mats.get('steelDark'));
    rail.position.set(rx, (o.y0 + o.y1) / 2 + 1.0, rz);
    const slope = Math.atan2(o.y1 - o.y0, run);
    if (alongX) rail.rotation.z = o.dx > 0 ? slope : -slope;
    else rail.rotation.x = o.dz > 0 ? -slope : slope;
    rail.castShadow = true;
    b.add(rail);
  }
  const top = { x: o.x + o.dx * run, z: o.z + o.dz * run };
  floors.addLink(o.lower, o.upper, [
    { x: o.x - o.dx * 0.8, y: o.y0, z: o.z - o.dz * 0.8 },
    { x: o.x, y: o.y0, z: o.z },
    { x: top.x, y: o.y1, z: top.z },
    { x: top.x + o.dx * 0.8, y: o.y1, z: top.z + o.dz * 0.8 },
  ]);
  return top;
}

/**
 * A stairwell down: a covered entrance at street level (a kiosk with a dark doorway and the first steps going down
 * into the dark), and its other end at the foot of the stairs in an underground space. Walking in at either end comes
 * out at the other (`floors.ts`, a teleport link).
 */
export function stairwellDown(
  c: Ctx,
  top: { x: number; z: number; yaw: number },
  under: { area: number; x: number; z: number; yaw: number },
  opts: { roof?: MaterialName; wall?: MaterialName; sign?: THREE.Material } = {},
): void {
  const { b, floors } = c;
  const wallMat = opts.wall ?? 'concreteWall';
  const cos = Math.cos(top.yaw);
  const sin = Math.sin(top.yaw);
  // local frame: forward = -Z rotated by yaw (the way you walk in)
  const at = (lx: number, lz: number): [number, number] => [top.x + lx * cos + lz * sin, top.z - lx * sin + lz * cos];
  const kioskW = 3.4;
  const kioskD = 4.2;
  const H = 3.0;
  // walls: both sides and the back; the front is the doorway
  for (const [lx0, lz0, lx1, lz1] of [
    [-kioskW / 2, 0, -kioskW / 2, -kioskD],
    [kioskW / 2, 0, kioskW / 2, -kioskD],
    [-kioskW / 2, -kioskD, kioskW / 2, -kioskD],
  ] as const) {
    const [x0, z0] = at(lx0, lz0);
    const [x1, z1] = at(lx1, lz1);
    wall(b, { x0, z0, x1, z1, height: H, thickness: 0.25, material: wallMat, mapKind: 'building', tag: 'stairwell' });
  }
  const [rx, rz] = at(0, -kioskD / 2);
  addBox(b, opts.roof ?? 'roof', rx, H + 0.1, rz, kioskW + 0.5, 0.2, kioskD + 0.5, top.yaw);
  // the steps going down into the dark (drawn below the street; the ground is left open there by the layout)
  for (let i = 0; i < 9; i++) {
    const [sx, sz] = at(0, -0.6 - i * 0.32);
    addBox(b, 'concreteSlab', sx, -0.12 - i * 0.24, sz, kioskW - 0.5, 0.24, 0.32, top.yaw);
  }
  // darkness at the bottom
  const [dx, dz] = at(0, -kioskD + 0.6);
  addBox(b, new THREE.MeshBasicMaterial({ color: 0x020203 }), dx, -1.2, dz, kioskW - 0.4, 2.4, 0.4, top.yaw);
  if (opts.sign) {
    const [gx, gz] = at(0, 0.02);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), opts.sign);
    sign.position.set(gx, H - 0.35, gz);
    sign.rotation.y = top.yaw;
    b.add(sign);
  }
  // walking in a metre past the doorway takes you down; coming back up the stairs below brings you out here
  const [ix, iz] = at(0, -1.2);
  const [ox, oz] = at(0, 1.3);
  const ux = under.x;
  const uz = under.z;
  const ucos = Math.cos(under.yaw);
  const usin = Math.sin(under.yaw);
  // in the underground space: the foot of the stairs, and a step out from it
  const footIn = { x: ux, y: 0, z: uz };
  const footOut = { x: ux - usin * 1.6, y: 0, z: uz - ucos * 1.6 };
  // lower end first: [underground out-point, underground foot, street entry, street out-point]
  floors.addLink(under.area, 0, [footOut, footIn, { x: ix, y: 0, z: iz }, { x: ox, y: 0, z: oz }], true);
}
