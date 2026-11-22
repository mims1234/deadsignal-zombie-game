/**
 * HIRASAKA: THE STAIRS OF LIFE AND THE PITHEAD (place group 'pithead', rect x 70..160, z -76..76, y 0): the reclaimed
 * flat east of the rock where the mine's surface plant stood. (The fan house at the head of the Stairs of Life is on
 * the terrace pad and built by `hirasakaSummit.ts`.)
 * Spots: `places.ts` CAGE.top (the cage's stop; the cage is drawn by `hirasaka/look.ts`), ADIT.mouth / out, TOOLS
 * pick / axe / shovel, TAPES[2], BATH, JOBS.steam coal[2] (buried: OBSTACLES slag), SHRINES[1] mine shrine, SIDES
 * okoze, WALL_BUYS pithead.
 *
 * The frame built: the pad, the island's parapets, the Stairs of Life (x 70..80.8, z -8..-4, rising west to the fan
 * terrace, its concrete cheeks), the pit workshop station by the cage (`arms` makes it ride the cage).
 *
 * Built here, round the loop the dead are led about (the headframe in the middle):
 *  - the Stairs of Life roofed as a long covered stair (corrugated roof on posts over the cheeks, two lamps under it);
 *  - the old adit's mouth in the terrace wall at the stair's foot (timber portal, black inside, rails out, its gate);
 *  - the headframe over the shaft house (bell, lamp, hazard paint) and the tub line from it to the slag tip, with a
 *    turntable, tubs on the rails and one tipped at the end;
 *  - the winding house: red brick, arched windows, gable roof and chimney; inside the drum on its bed, the ropes in
 *    from the headframe, the driver's stand and levers, the depth dial, a bench, a calendar stuck at April 1974, the
 *    stack of pit props the timber axe lies by (TOOLS.axe), Genzō's tape on the driver's side (TAPES[2]);
 *  - the lamp room: lit racks of cap lamps behind its windows, the issuing counter, a tag board, the pick (TOOLS.pick);
 *  - the time office with the company price board on its west wall (WALL_BUYS pithead);
 *  - the miners' bath: the dark pool (BATH is at its edge), taps and stools, lockers, duckboards;
 *  - the coal bunker's three bays (the shovel lies in front: TOOLS.shovel), the slag heap with a spill at its foot
 *    where the sack is buried (OBSTACLES slag), the timber yard and its shed, the compressor house (a roofless ruin);
 *  - the mine shrine (SHRINES[1]): a hokora on its plinth, stone lanterns, a small torii; the okoze side story's spot
 *    stays clear south of it.
 */
import * as THREE from 'three';
import type { Ctx } from './util';
import type { LevelBuilder } from '../builder';
import { H, box, cyl, ground, shell, slab, solid } from './hirasakaKit';
import { headframe } from './hirasakaBuilds';
import { ADIT, BATH, CAGE, JOBS, SHRINES, TOOLS, WALL_BUYS, Y } from '../../hirasaka/places';

/** A sodium lamp on an iron post with an arm (the kit's, in this group's batches). */
function post(c: Ctx, x: number, z: number, mode: 'steady' | 'flicker' | 'fail'): void {
  const { b } = c;
  box(b, H.iron, x, 2.3, z, 0.14, 4.6, 0.14, 0, false);
  box(b, H.iron, x + 0.45, 4.55, z, 0.9, 0.08, 0.08, 0, false);
  box(b, H.iron, x + 0.85, 4.45, z, 0.36, 0.12, 0.24, 0, false);
  box(b, H.lamp, x + 0.85, 4.36, z, 0.26, 0.06, 0.16, 0, false);
  solid(c, x, z, 0.16, 0.16, 4.6, 'lamp', { surface: 'metal' });
  c.b.light({ x: x + 0.85, y: 4.2, z, color: 0xffa860, intensity: 20, distance: 14, mode, pool: 3.2, glow: 0.6, tag: 'pithead' });
}

/** A small torii facing z: red pillars, the tie beam, the top beam with its black cap; collides at its pillars. */
function torii(c: Ctx, x: number, z: number, span: number, h: number): void {
  const { b } = c;
  for (const s of [-1, 1]) {
    cyl(b, H.red, x + (s * span) / 2, 0, z, 0.14, 0.12, h, 10, false);
    cyl(b, P.coal, x + (s * span) / 2, 0, z, 0.18, 0.18, 0.3, 10, false);
    solid(c, x + (s * span) / 2, z, 0.3, 0.3, h, 'torii');
  }
  box(b, H.red, x, h * 0.78, z, span + 0.5, 0.14, 0.14, 0, false);
  box(b, H.red, x, h - 0.05, z, span + 1.0, 0.18, 0.24, 0, false);
  box(b, P.coal, x, h + 0.1, z, span + 1.3, 0.12, 0.3, 0, false);
  box(b, H.red, x, h * 0.88, z, 0.14, h * 0.2, 0.12, 0, false);
}

/** The winding engine's drum on its frame, along z, the motor beside it (in this group's batches). */
function drum(b: LevelBuilder, x: number, z: number): void {
  const g = new THREE.CylinderGeometry(1.1, 1.1, 2, 18).rotateX(Math.PI / 2);
  const o = new THREE.Mesh(g, P.steel);
  o.position.set(x, 1.5, z);
  b.add(o, { cast: false });
  for (const dz of [-1.1, 1.1]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.12, 18).rotateX(Math.PI / 2), H.iron);
    f.position.set(x, 1.5, z + dz);
    b.add(f, { cast: false });
  }
  for (const dz of [-1.3, 1.3]) box(b, H.iron, x, 0.75, z + dz, 0.5, 1.5, 0.3, 0, false);
  box(b, P.locker, x + 1.8, 0.7, z, 1.2, 1.4, 1.2, 0, false);
  box(b, H.iron, x + 1.0, 1.5, z, 1.2, 0.2, 0.2, 0, false);
}

export const PITHEAD_RECT = { x0: 70, z0: -76, x1: 160, z1: 76 };

// plain colours this group needs that the kit lacks (merged with everything else of their finish: free)
const own = (color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const P = {
  steel: own(0x5a6266, 0.6, 0.5),
  rustDark: own(0x4a2a1a, 0.85, 0.2),
  wet: own(0x5d6566, 0.9),
  tile: own(0x9aa6a2, 0.85),
  coal: own(0x0e0e10, 0.85, 0.2),
  glass: own(0x10181c, 0.15, 0.3),
  yellow: own(0xb8901c, 0.8),
  bronze: own(0x8a6a2a, 0.6, 0.5),
  corr: own(0x5a4636, 0.85, 0.2),
  locker: own(0x4e6058, 0.6, 0.5),
  straw: own(0xb09a68, 0.9),
  paper: own(0xe8e2d0, 0.9),
  roof: own(0x2a2420, 0.8),
  slag: own(0x2a2826, 0.9),
  sky: own(0x5a7a94, 0.9),
  wave: own(0x2a4a6a, 0.9),
};

type P3 = readonly [number, number, number];

/** A box standing on the floor at `y` with its collider from y 0 (like the kit's `block`, but casting no shadow, so
 * it batches with the rest of this group's boxes). */
function blk(c: Ctx, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, tag: string, o: { shots?: boolean; rot?: number } = {}): void {
  box(c.b, mat, x, y + h / 2, z, w, h, d, o.rot ?? 0, false);
  solid(c, x, z, w, d, y + h, tag, { shots: o.shots, rot: o.rot });
}

/** A beam from a to e, `w` by `h` thick (no collider). */
function beam(b: LevelBuilder, m: THREE.Material, a: P3, e: P3, w: number, h = w): void {
  const A = new THREE.Vector3(a[0], a[1], a[2]);
  const d = new THREE.Vector3(e[0], e[1], e[2]).sub(A);
  const L = d.length();
  if (L < 1e-3) return;
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, L, h), m);
  o.position.copy(A).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.add(o, { cast: false });
}

/** A gable (a triangular prism): `len` along its ridge, `w` eave to eave, `rise` to the ridge, its base at y. */
function gable(b: LevelBuilder, m: THREE.Material, x: number, y: number, z: number, len: number, w: number, rise: number, alongZ = false): void {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  if (!alongZ) g.rotateY(Math.PI / 2);
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  b.add(o, { cast: false });
}

/** The two roof slopes over a gable (ridge along x unless `alongZ`), a little overhang all round. */
function slopes(b: LevelBuilder, m: THREE.Material, x: number, y: number, z: number, len: number, w: number, rise: number, alongZ = false): void {
  const half = w / 2;
  const L = Math.hypot(half, rise) + 0.5;
  const a = Math.atan2(rise, half);
  for (const s of [-1, 1]) {
    if (!alongZ) slab(b, m, x, y + rise / 2 + 0.1, z + (s * half) / 2, len + 0.5, 0.14, L, -s * a, 0, 0, false);
    else slab(b, m, x + (s * half) / 2, y + rise / 2 + 0.1, z, L, 0.14, len + 0.5, 0, 0, s * a, false);
  }
}

/** A window in a wall line (an arched one when `arch`): the pane through the wall, a sill; lit panes glow. */
function win(b: LevelBuilder, x: number, y0: number, z: number, w: number, h: number, alongX: boolean, lit: boolean, arch = false): void {
  const pane = lit ? H.lamp : P.glass;
  box(b, pane, x, y0 + h / 2, z, alongX ? w : 0.36, h, alongX ? 0.36 : w, 0, false);
  if (arch) {
    const g = new THREE.CylinderGeometry(w / 2, w / 2, 0.36, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
    if (!alongX) g.rotateY(Math.PI / 2);
    const o = new THREE.Mesh(g, pane);
    o.position.set(x, y0 + h, z);
    b.add(o, { cast: false });
  }
  box(b, H.concrete, x, y0 - 0.06, z, alongX ? w + 0.3 : 0.5, 0.12, alongX ? 0.5 : w + 0.3, 0, false);
}

/** Rails from a to b along x or z: two steel bars on sleepers (flat: walked over, no collider). */
function rails(b: LevelBuilder, x0: number, z0: number, x1: number, z1: number, y = 0): void {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  for (const s of [-0.36, 0.36]) box(b, P.steel, alongX ? cx : cx + s, y + 0.1, alongX ? cz + s : cz, alongX ? len : 0.07, 0.08, alongX ? 0.07 : len, 0, false);
  const n = Math.floor(len / 0.9);
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0.5;
    const x = alongX ? Math.min(x0, x1) + t * len : cx;
    const z = alongX ? cz : Math.min(z0, z1) + t * len;
    box(b, H.woodDark, x, y + 0.04, z, alongX ? 0.22 : 1.1, 0.08, alongX ? 1.1 : 0.22, 0, false);
  }
}

/** A coal tub on the rails (loaded unless `empty`): a riveted steel box on four wheels. */
function tub(c: Ctx, x: number, z: number, alongX: boolean, empty = false, tilt = 0): void {
  const { b } = c;
  const w = alongX ? 1.5 : 0.95;
  const d = alongX ? 0.95 : 1.5;
  if (tilt) {
    slab(b, H.rust, x, 0.75, z, w, 0.8, d, alongX ? 0 : tilt, 0, alongX ? tilt : 0, false);
  } else {
    box(b, H.rust, x, 0.75, z, w, 0.8, d, 0, false);
    box(b, P.rustDark, x, 1.16, z, w + 0.06, 0.06, d + 0.06, 0, false);
    if (!empty) for (let k = 0; k < 3; k++) box(b, P.coal, x + (alongX ? (k - 1) * 0.4 : 0), 1.2 + (k % 2) * 0.08, z + (alongX ? 0 : (k - 1) * 0.4), 0.45, 0.22, 0.45, k * 0.7, false);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10).rotateZ(Math.PI / 2);
      if (!alongX) g.rotateY(Math.PI / 2);
      const o = new THREE.Mesh(g, H.iron);
      o.position.set(x + (alongX ? sx * 0.5 : sx * 0.36), 0.2, z + (alongX ? sz * 0.36 : sz * 0.5));
      b.add(o, { cast: false });
    }
  }
  solid(c, x, z, w + 0.1, d + 0.1, 1.3, 'tub', { shots: false, surface: 'metal' });
}

/** A stack of pit props (square timbers in crossed layers) with its collider. */
function propStack(c: Ctx, x: number, z: number, alongX: boolean, layers = 4): void {
  const { b } = c;
  const L = 4.2;
  for (let k = 0; k < layers; k++) {
    const y = 0.15 + k * 0.3;
    if (k % 2 === 0) {
      for (let i = 0; i < 6; i++) {
        const o = (i - 2.5) * 0.3;
        box(b, k % 4 === 0 ? H.wood : H.woodPale, alongX ? x : x + o, y, alongX ? z + o : z, alongX ? L : 0.26, 0.26, alongX ? 0.26 : L, 0, false);
      }
    } else {
      for (const o of [-1.6, 0, 1.6]) box(b, H.woodDark, alongX ? x + o : x, y, alongX ? z : z + o, alongX ? 0.2 : 2, 0.2, alongX ? 2 : 0.2, 0, false);
    }
  }
  solid(c, x, z, alongX ? L : 1.9, alongX ? 1.9 : L, 0.3 * layers + 0.1, 'prop-stack', { surface: 'wood' });
}

export function buildPithead(c: Ctx): void {
  const { b } = c;
  const y0 = Y.sea;

  coveredStair(c);
  aditMouth(c);
  shaftAndHeadframe(c);
  windingHouse(c);
  lampRoom(c);
  timeOffice(c);
  minersBath(c);
  coalYard(c);
  slagHeap(c);
  timberYard(c);
  compressorRuin(c);
  mineShrine(c);
  walkway(c);

  // coal dust trodden in where the tubs ran
  ground(b, P.coal, 130.4, 2.2, 145, 3.8, y0);
  ground(b, P.coal, 145.2, -50, 146.8, 1.6, y0);
  // the yard's lamps (sodium; one failing over the tub line)
  for (const [x, z, mode] of [
    [86, -2, 'steady'],
    [114, 28, 'steady'],
    [140, -26, 'fail'],
    [96, 62, 'steady'],
    [126, 56, 'flicker'],
  ] as const) post(c, x, z, mode);
}

/** The covered walk the shifts took from the lamp room to the cage: a tin roof on posts, a siding of spare tubs by it. */
function walkway(c: Ctx): void {
  const { b } = c;
  const legs: { x0: number; z0: number; x1: number; z1: number }[] = [
    { x0: 90.6, z0: 13.4, x1: 93.4, z1: 29.6 },
    { x0: 90.6, z0: 10.6, x1: 116, z1: 13.4 },
  ];
  for (const r of legs) {
    const alongX = r.x1 - r.x0 > r.z1 - r.z0;
    const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    slab(b, P.corr, cx, 2.95, cz, alongX ? len + 0.4 : 3.6, 0.08, alongX ? 3.6 : len + 0.4, alongX ? 0.06 : 0, 0, alongX ? 0 : 0.06, false);
    const n = Math.round(len / 4);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      for (const side of [0, 1]) {
        const x = alongX ? r.x0 + t * len : side ? r.x1 : r.x0;
        const z = alongX ? (side ? r.z1 : r.z0) : r.z0 + t * len;
        if (!alongX && i === 0) continue;
        box(b, P.steel, x, 1.45, z, 0.14, 2.9, 0.14, 0, false);
        solid(c, x, z, 0.16, 0.16, 2.9, 'walkway', { surface: 'metal' });
      }
    }
    for (const side of [0, 1]) {
      const z = alongX ? (side ? r.z1 : r.z0) : cz;
      const x = alongX ? cx : side ? r.x1 : r.x0;
      box(b, P.steel, x, 2.82, z, alongX ? len : 0.1, 0.12, alongX ? 0.1 : len, 0, false);
    }
  }
  box(b, H.iron, 92, 2.78, 12, 0.3, 0.12, 0.3, 0, false);
  box(b, H.lamp, 92, 2.68, 12, 0.2, 0.08, 0.2, 0, false);
  b.light({ x: 92, y: 2.5, z: 12, color: 0xffb468, intensity: 14, distance: 10, mode: 'flicker', pool: 2.4, glow: 0.3, tag: 'walkway' });
  // spare tubs on a short siding, a stop block at its end
  rails(b, 98, 20, 112, 20);
  for (const x of [101, 102.8, 104.6]) tub(c, x, 20, true, x > 104);
  blk(c, H.woodDark, 112.4, 0, 20, 0.4, 0.7, 1.4, 'stop-block', { shots: false });
}

/** The Stairs of Life as a long covered stair: a corrugated roof on posts over the frame's cheeks, lamps under it. */
function coveredStair(c: Ctx): void {
  const { b } = c;
  const xFoot = 80.8;
  const xTop = 70;
  const roofY = (x: number): number => 8.3 + ((xFoot - x) / (xFoot - xTop)) * 2.3;
  const zc = -6;
  const L = Math.hypot(xFoot - xTop, 2.3) + 0.8;
  const rz = -Math.atan2(2.3, xFoot - xTop);
  const cx = (xFoot + xTop) / 2;
  slab(b, P.corr, cx, roofY(cx), zc, L, 0.1, 5.4, 0, 0, rz, false);
  for (let k = 0; k < 9; k++) slab(b, P.rustDark, cx, roofY(cx) + 0.07, zc - 2.5 + k * 0.625, L, 0.05, 0.08, 0, 0, rz, false);
  for (const z of [-8.2, -3.8]) {
    beam(b, H.woodDark, [xTop - 0.3, roofY(xTop - 0.3) - 0.15, z], [xFoot + 0.3, roofY(xFoot + 0.3) - 0.15, z], 0.22, 0.22);
    for (const x of [71, 73.5, 76, 78.5, 80.6]) box(b, H.woodDark, x, (7.6 + roofY(x)) / 2, z, 0.2, roofY(x) - 7.6, 0.2, 0, false);
    // a wooden rail along each cheek's top
    beam(b, H.wood, [xTop, 8.4, z], [xFoot, 8.4, z], 0.1, 0.1);
  }
  for (const x of [72.5, 77.6]) {
    box(b, H.iron, x, roofY(x) - 0.12, zc, 0.3, 0.1, 0.3, 0, false);
    box(b, H.lamp, x, roofY(x) - 0.28, zc, 0.18, 0.2, 0.18, 0, false);
    b.light({ x, y: roofY(x) - 0.45, z: zc, color: 0xffb468, intensity: 16, distance: 11, mode: x < 75 ? 'flicker' : 'steady', pool: 0, glow: 0.4, tag: 'life-stair' });
  }
}

/** The old adit's mouth in the fan terrace's retaining wall: a timber portal in a concrete head, black inside. */
function aditMouth(c: Ctx): void {
  const { b } = c;
  const A = ADIT.mouth;
  const xw = 70.3;
  box(b, P.coal, xw - 0.22, 1.8, A.z, 0.1, 3.6, 3.7, 0, false);
  for (const dz of [-2.25, 2.25]) blk(c, H.woodDark, xw + 0.25, 0, A.z + dz, 0.42, 3.7, 0.42, 'adit-post', { shots: true });
  box(b, H.woodDark, xw + 0.25, 3.9, A.z, 0.5, 0.42, 5.3, 0, false);
  box(b, H.concreteDark, xw + 0.15, 4.75, A.z, 0.5, 1.3, 7.4, 0, false);
  for (const dz of [-3.2, 3.2]) blk(c, H.concreteDark, xw + 0.15, 0, A.z + dz, 0.5, 4.4, 1.0, 'adit-pier');
  // the rusted gate, swung back flat against the wall south of the mouth
  const gz = A.z + 5.0;
  box(b, P.rustDark, xw + 0.12, 1.6, gz, 0.08, 0.08, 2.4, 0, false);
  box(b, P.rustDark, xw + 0.12, 0.2, gz, 0.08, 0.08, 2.4, 0, false);
  for (let k = 0; k < 7; k++) box(b, H.rust, xw + 0.12, 1.6, gz - 1.15 + k * 0.38, 0.05, 3.0, 0.05, 0, false);
  box(b, P.rustDark, xw + 0.12, 3.05, gz, 0.08, 0.08, 2.4, 0, false);
  // rails out of the dark to the yard, a caged lamp over the lintel
  rails(b, xw - 0.1, A.z, 79, A.z);
  box(b, H.iron, xw + 0.5, 4.35, A.z, 0.26, 0.3, 0.3, 0, false);
  box(b, H.lamp, xw + 0.62, 4.32, A.z, 0.08, 0.18, 0.2, 0, false);
  b.light({ x: xw + 1, y: 4.2, z: A.z, color: 0xffc080, intensity: 14, distance: 9, mode: 'flicker', pool: 2.2, glow: 0.35, tag: 'adit' });
}

/** The shaft house round the cage, the headframe over it, and the tub line from the shaft to the slag tip. */
function shaftAndHeadframe(c: Ctx): void {
  const { b } = c;
  const C = { x: CAGE.top.x, z: CAGE.top.z - 4 };
  // the shaft house: corrugated steel on three sides, open south where the cage is boarded
  for (const [x0, z0, x1, z1] of [
    [C.x - 4, C.z - 4, C.x + 4, C.z - 3.6],
    [C.x - 4, C.z - 4, C.x - 3.6, C.z + 2.4],
    [C.x + 3.6, C.z - 4, C.x + 4, C.z + 2.4],
  ] as const) {
    box(b, P.corr, (x0 + x1) / 2, 2.5, (z0 + z1) / 2, x1 - x0, 5, z1 - z0, 0, false);
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let k = 0; k <= Math.floor(len / 0.8); k++) {
      const t = (k * 0.8) / len;
      box(b, P.rustDark, alongX ? x0 + t * len : (x0 + x1) / 2, 2.5, alongX ? (z0 + z1) / 2 : z0 + t * len, alongX ? 0.06 : x1 - x0 + 0.06, 5, alongX ? z1 - z0 + 0.06 : 0.06, 0, false);
    }
    solid(c, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 5, 'shaft-house', { kind: 'wall', surface: 'metal' });
  }
  // the collar: a concrete kerb in front, hazard paint where the riders wait
  box(b, H.concreteDark, C.x, 0.08, C.z + 2.2, 7.2, 0.16, 0.5, 0, false);
  for (let k = 0; k < 9; k++) ground(b, k % 2 ? P.coal : P.yellow, C.x - 3.6 + k * 0.8, C.z + 2.5, C.x - 2.8 + k * 0.8, C.z + 3.0, 0.01);
  headframe(b, C, 22.7, { x: 116, y: 3.3, z: -20 });
  // the signal bell and a caged lamp on the shaft house's front corner posts
  box(b, H.iron, C.x + 3.8, 3.4, C.z + 2.55, 0.5, 0.08, 0.08, 0, false);
  cyl(b, P.bronze, C.x + 4.0, 2.95, C.z + 2.55, 0.22, 0.1, 0.38, 10, false);
  box(b, H.wood, C.x + 4.0, 2.0, C.z + 2.55, 0.03, 1.8, 0.03, 0, false);
  box(b, H.iron, C.x - 3.8, 4.4, C.z + 2.55, 0.3, 0.32, 0.3, 0, false);
  box(b, H.lamp, C.x - 3.8, 4.36, C.z + 2.72, 0.2, 0.2, 0.04, 0, false);
  b.light({ x: C.x - 3.6, y: 4.3, z: C.z + 3.2, color: 0xffb060, intensity: 22, distance: 13, mode: 'steady', pool: 3, glow: 0.45, tag: 'cage-top' });
  // the tub line: east from the shaft past the headframe's struts, a turntable, north to the slag tip
  const ty = C.z - 1;
  rails(b, C.x + 4.2, ty, 145.2, ty);
  cyl(b, H.iron, 146, 0.02, ty, 1.3, 1.3, 0.1, 18, false);
  box(b, P.steel, 146, 0.13, ty, 2.4, 0.04, 0.1, 0, false);
  rails(b, 146, ty - 1.2, 146, -52);
  tub(c, 137.5, ty, true);
  tub(c, 146, -12, false);
  tub(c, 146, -14, false);
  tub(c, 146, -33, false, true);
  // the end of the line: a buffer, one tub tipped over at the edge of the heap
  box(b, H.woodDark, 146, 0.45, -52.4, 1.4, 0.5, 0.4, 0, false);
  solid(c, 146, -52.4, 1.4, 0.4, 0.7, 'buffer', { shots: false });
  tub(c, 147.6, -50.4, false, true, 0.9);
}

/** The winding house: red brick, arched windows, gable roof, chimney; the drum, its ropes, the driver's stand. */
function windingHouse(c: Ctx): void {
  const { b } = c;
  const r = { x0: 96, z0: -36, x1: 116, z1: -16 };
  const h = 8;
  shell(c, r, 0, h, { doors: [{ side: 'E', at: 10, w: 2.6 }, { side: 'S', at: 8, w: 2.0 }], wall: H.brick, roof: H.concreteDark, floor: H.concreteDark, tag: 'winding-house' });
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  gable(b, H.brick, cx, h + 0.2, cz, r.x1 - r.x0 + 0.3, r.z1 - r.z0 + 0.3, 3.4);
  slopes(b, H.rust, cx, h + 0.2, cz, r.x1 - r.x0 + 0.3, r.z1 - r.z0 + 0.3, 3.4);
  // a ventilator on the ridge, the boiler chimney at the west end, brick piers up the walls
  box(b, P.rustDark, cx + 3, h + 3.9, cz, 3, 0.8, 1.2, 0, false);
  gable(b, H.rust, cx + 3, h + 4.3, cz, 3.4, 1.8, 0.6);
  box(b, H.brick, r.x0 + 1.5, h + 3.5, r.z0 + 3, 1.4, 7, 1.4, 0, false);
  box(b, H.concreteDark, r.x0 + 1.5, h + 7.1, r.z0 + 3, 1.6, 0.25, 1.6, 0, false);
  for (const x of [r.x0, 100, 106, 112, r.x1]) for (const z of [r.z0, r.z1]) box(b, H.brick, x, h / 2, z, 0.7, h, 0.55, 0, false);
  // arched windows (two lit: someone left the stand's lamp on)
  for (const [x, lit] of [
    [98.6, false],
    [101.6, true],
    [108.5, false],
    [110.8, false],
    [113.8, false],
  ] as const) win(b, x, 2.2, r.z1, 1.4, 2.8, true, lit, true);
  for (const z of [-33, -30.2, -23]) win(b, r.x1, 2.2, z, 1.4, 2.8, false, false, true);
  for (const z of [-32, -26, -20]) win(b, r.x0, 2.2, z, 1.4, 2.8, false, false, true);
  for (const x of [100, 106, 112]) win(b, x, 2.6, r.z0, 1.4, 2.4, true, false, true);

  // the drum on its bed, the ropes coming in through the east wall from the headframe's wheels
  const D = { x: 110, z: -21 };
  blk(c, H.concreteDark, D.x + 0.6, 0, D.z, 4.6, 0.4, 3.4, 'drum-bed', { shots: false });
  drum(b, D.x, D.z);
  solid(c, D.x + 0.6, D.z, 4.4, 3.2, 2.8, 'winding-drum', { surface: 'metal' });
  for (const z of [-20, -21.04]) beam(b, P.coal, [r.x1 - 0.1, 3.3, z], [D.x + 0.3, 2.62, z], 0.06, 0.06);
  box(b, P.coal, r.x1, 3.3, -20.5, 0.4, 0.5, 1.6, 0, false);
  // the brake posts and the driver's stand: a raised platform, two levers, a seat, the depth dial on its column
  for (const dz of [-1.7, 1.7]) blk(c, H.iron, D.x - 1.4, 0, D.z + dz, 0.4, 2.2, 0.4, 'brake-post', { shots: false });
  blk(c, H.woodDark, 113.4, 0, -29.5, 2.6, 0.5, 2.4, 'driver-stand', { shots: false });
  for (const dx of [-0.6, 0.6]) {
    beam(b, P.steel, [113.4 + dx, 0.5, -28.6], [113.4 + dx * 1.2, 1.7, -28.2], 0.07, 0.07);
    box(b, H.red, 113.4 + dx * 1.2, 1.75, -28.2, 0.12, 0.12, 0.12, 0, false);
  }
  box(b, H.woodDark, 113.4, 0.95, -30.3, 0.6, 0.08, 0.6, 0, false);
  box(b, H.woodDark, 113.4, 1.3, -30.6, 0.6, 0.6, 0.08, 0, false);
  blk(c, H.iron, 113.4, 0, -33.6, 0.6, 2.8, 0.6, 'depth-dial', { shots: false });
  {
    const g = new THREE.CylinderGeometry(0.55, 0.55, 0.08, 20).rotateX(Math.PI / 2);
    const o = new THREE.Mesh(g, P.paper);
    o.position.set(113.4, 2.6, -33.24);
    b.add(o, { cast: false });
  }
  beam(b, P.coal, [113.4, 2.6, -33.18], [113.7, 2.95, -33.18], 0.03, 0.02);
  // the motor's oil drums, a bench, a gauge board, the calendar stuck at April 1974
  for (const [x, z] of [
    [114.6, -17.2],
    [115.3, -17.6],
  ] as const) {
    cyl(b, H.rust, x, 0, z, 0.3, 0.3, 0.9, 10, false);
    solid(c, x, z, 0.6, 0.6, 0.9, 'drum', { shots: false, surface: 'metal' });
  }
  blk(c, H.wood, 97, 0, -27, 0.8, 0.9, 3.2, 'bench', { shots: false });
  box(b, H.woodDark, 96.25, 2.1, -22.6, 0.08, 1.0, 1.4, 0, false);
  for (let k = 0; k < 3; k++) {
    const g = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 14).rotateZ(Math.PI / 2);
    const o = new THREE.Mesh(g, P.paper);
    o.position.set(96.31, 2.3 - (k % 2) * 0.4, -23 + k * 0.4);
    b.add(o, { cast: false });
  }
  box(b, P.paper, 96.22, 1.9, -30.8, 0.03, 0.62, 0.44, 0, false);
  box(b, H.red, 96.24, 2.18, -30.8, 0.03, 0.08, 0.44, 0, false);
  for (let k = 0; k < 12; k++) box(b, P.coal, 96.24, 1.82 - Math.floor(k / 4) * 0.12, -30.95 + (k % 4) * 0.1, 0.02, 0.06, 0.06, 0, false);
  // the pit props stacked by the north wall, where the timber axe lies (TOOLS.axe stays clear)
  const ax = TOOLS.axe;
  for (let k = 0; k < 4; k++) box(b, k % 2 ? H.woodPale : H.wood, ax.x - 1.2 + k * 0.05, 0.16 + k * 0.3, ax.z - 3.5, 5.2, 0.28, 0.28 + (k % 2) * 0.1, 0, false);
  for (let k = 0; k < 3; k++) box(b, H.wood, ax.x - 1.2 + (k - 1) * 0.5, 0.15, ax.z - 4.2, 5.2, 0.3, 0.3, 0, false);
  solid(c, ax.x - 1.2, ax.z - 3.9, 5.4, 1.6, 1.3, 'prop-stack', { surface: 'wood' });
  blk(c, H.woodDark, ax.x + 2.6, 0, ax.z - 1.0, 0.7, 0.55, 0.7, 'chopping-block', { shots: false });
  // a tool board on the north wall (shapes only)
  box(b, H.woodDark, 103, 2.2, r.z0 + 0.22, 3.2, 1.6, 0.06, 0, false);
  for (let k = 0; k < 5; k++) box(b, k % 2 ? P.steel : H.wood, 101.8 + k * 0.6, 2.2, r.z0 + 0.3, 0.06, 1.1, 0.06, 0, false);
  box(b, H.iron, 106, h - 0.25, -26, 0.4, 0.2, 0.4, 0, false);
  box(b, H.lamp, 106, h - 0.42, -26, 0.24, 0.14, 0.24, 0, false);
  b.light({ x: 106, y: h - 0.7, z: -26, color: 0xffc080, intensity: 26, distance: 15, mode: 'flicker', pool: 3, glow: 0.3, tag: 'winding-house' });
}

/** The pithead lamp room: racks of cap lamps glowing behind the windows, the issuing counter, the pick. */
function lampRoom(c: Ctx): void {
  const { b } = c;
  const r = { x0: 84, z0: 30, x1: 100, z1: 46 };
  const h = 4.2;
  shell(c, r, 0, h, { doors: [{ side: 'E', at: 8, w: 2.4 }, { side: 'N', at: 8, w: 2.0 }], wall: H.concrete, roof: H.concreteDark, floor: P.wet, tag: 'lamp-room' });
  box(b, H.concreteDark, (r.x0 + r.x1) / 2, h + 0.45, (r.z0 + r.z1) / 2, r.x1 - r.x0 + 0.6, 0.5, r.z1 - r.z0 + 0.6, 0, false);
  box(b, P.rustDark, 90, h + 1.0, 36, 1.2, 0.8, 1.2, 0, false);
  for (const x of [86.2, 89.6, 93]) win(b, x, 1.4, r.z1, 1.6, 1.4, true, true);
  for (const z of [33, 43]) win(b, r.x1, 1.4, z, 1.6, 1.4, false, z === 43);
  // the racks: shelves of cap lamps (battery and head), along the west wall and the north wall's two ends
  const rack = (x0: number, z0: number, x1: number, z1: number, face: 1 | -1): void => {
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (const k of [0, 1, 2, 3]) {
      const y = 0.5 + k * 0.62;
      box(b, H.wood, cx, y, cz, alongX ? len : 0.5, 0.05, alongX ? 0.5 : len, 0, false);
      const n = Math.floor(len / 0.34);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const lx = alongX ? x0 + t * len : cx;
        const lz = alongX ? cz : z0 + t * len;
        box(b, H.iron, lx, y + 0.15, lz, 0.16, 0.24, 0.12, 0, false);
        box(b, (i + k) % 7 === 3 ? P.steel : H.lamp, alongX ? lx : lx + face * 0.12, y + 0.33, alongX ? lz + face * 0.12 : lz, alongX ? 0.1 : 0.04, 0.1, alongX ? 0.04 : 0.1, 0, false);
      }
    }
    for (const t of [0, 1]) box(b, H.woodDark, alongX ? x0 + t * len : cx, 1.4, alongX ? cz : z0 + t * len, 0.08, 2.8, 0.08, 0, false);
    solid(c, cx, cz, alongX ? len : 0.55, alongX ? 0.55 : len, 2.8, 'lamp-rack', { surface: 'wood' });
  };
  rack(r.x0 + 0.2, r.z0 + 1.2, r.x0 + 0.75, r.z1 - 1.2, 1);
  rack(r.x0 + 1.4, r.z0 + 0.2, 90.4, r.z0 + 0.75, 1);
  rack(93.6, r.z0 + 0.2, r.x1 - 1.4, r.z0 + 0.75, 1);
  // the issuing counter by the east door, its hatch, the tag board behind it on the south wall
  blk(c, H.wood, 97.2, 0, 43, 0.8, 1.05, 5, 'issue-counter');
  box(b, H.woodDark, 97.2, 1.08, 43, 0.95, 0.06, 5.1, 0, false);
  box(b, H.woodDark, 97.5, 1.8, r.z1 - 0.2, 3.6, 1.6, 0.08, 0, false);
  const brass = H.bone;
  for (let i = 0; i < 40; i++) if (i % 9 !== 4) box(b, brass, 96 + (i % 10) * 0.32, 2.4 - Math.floor(i / 10) * 0.36, r.z1 - 0.27, 0.12, 0.18, 0.02, 0, false);
  // a bench under the south windows
  blk(c, H.woodDark, 89, 0, r.z1 - 0.7, 4, 0.45, 0.45, 'bench', { shots: false });
  box(b, H.iron, 92, h - 0.2, 38, 0.4, 0.14, 0.4, 0, false);
  box(b, H.lamp, 92, h - 0.32, 38, 0.26, 0.1, 0.26, 0, false);
  b.light({ x: 92, y: h - 0.6, z: 38, color: 0xffc070, intensity: 18, distance: 11, mode: 'steady', pool: 2.6, glow: 0.25, tag: 'lamp-room' });
}

/** The time office: a small brick hut, the company price board on its west wall facing the yard. */
function timeOffice(c: Ctx): void {
  const { b } = c;
  const wb = WALL_BUYS[4]!;
  const r = { x0: wb.x + 1.6, z0: wb.z - 3, x1: wb.x + 6, z1: wb.z + 3 };
  shell(c, r, 0, 3, { doors: [{ side: 'S', at: 2.4, w: 1.8 }], wall: H.brick, roof: H.concreteDark, floor: H.concreteDark, tag: 'time-office' });
  win(b, r.x1, 1.2, wb.z, 1.2, 1.0, false, false);
  // the price board on the west wall, a tin awning over it
  box(b, H.woodDark, r.x0 - 0.12, 1.7, wb.z, 0.1, 1.5, 2.6, 0, false);
  for (let k = 0; k < 6; k++) box(b, P.paper, r.x0 - 0.18, 2.15 - Math.floor(k / 2) * 0.42, wb.z - 0.6 + (k % 2) * 1.2, 0.02, 0.3, 0.9, 0, false);
  slab(b, P.corr, r.x0 - 0.5, 2.85, wb.z, 1.0, 0.06, 3.2, 0, 0, 0.18, false);
  // inside: the clerk's desk and chair, the clock-card rack, a calendar
  blk(c, H.wood, r.x1 - 1.0, 0, wb.z - 1.6, 1.2, 0.75, 1.6, 'desk', { shots: false });
  box(b, H.woodDark, r.x1 - 1.8, 0.45, wb.z - 1.6, 0.4, 0.06, 0.4, 0, false);
  box(b, H.woodDark, r.x0 + 0.25, 1.6, wb.z + 1.4, 0.08, 1.4, 1.6, 0, false);
  for (let k = 0; k < 24; k++) box(b, P.paper, r.x0 + 0.31, 2.1 - Math.floor(k / 6) * 0.3, wb.z + 0.8 + (k % 6) * 0.22, 0.02, 0.2, 0.1, 0, false);
  box(b, P.paper, r.x1 - 0.2, 1.9, wb.z + 1.6, 0.03, 0.55, 0.4, 0, false);
  box(b, H.red, r.x1 - 0.22, 2.12, wb.z + 1.6, 0.03, 0.08, 0.4, 0, false);
}

/** The miners' bath: tiled walls, the dark pool (the hearth's mark washes off at its edge), taps, stools, lockers. */
function minersBath(c: Ctx): void {
  const { b } = c;
  const r = { x0: 132, z0: 36, x1: 152, z1: 52 };
  const h = 4;
  shell(c, r, 0, h, { doors: [{ side: 'W', at: 8, w: 2.4 }], wall: H.concrete, roof: H.concreteDark, floor: P.tile, tag: 'miners-bath' });
  // tiles inside to shoulder height (the west wall either side of the door)
  for (const [x, z, w, d] of [
    [(r.x0 + r.x1) / 2, r.z0 + 0.17, r.x1 - r.x0 - 0.4, 0.04],
    [(r.x0 + r.x1) / 2, r.z1 - 0.17, r.x1 - r.x0 - 0.4, 0.04],
    [r.x1 - 0.17, (r.z0 + r.z1) / 2, 0.04, r.z1 - r.z0 - 0.4],
    [r.x0 + 0.17, r.z0 + 3.25, 0.04, 6.1],
    [r.x0 + 0.17, r.z1 - 3.25, 0.04, 6.1],
  ] as const) box(b, P.tile, x, 0.9, z, w, 1.8, d, 0, false);
  // the mural over the pool on the east wall: sky, a snow-capped mountain, waves
  const mx = r.x1 - 0.2;
  box(b, P.sky, mx, 2.9, 44, 0.03, 1.8, 9, 0, false);
  gable(b, P.wave, mx - 0.02, 2.0, 44.6, 0.03, 6.4, 1.9);
  gable(b, H.white, mx - 0.04, 3.25, 44.6, 0.03, 2.05, 0.65);
  for (let k = 0; k < 6; k++) gable(b, H.white, mx - 0.05, 1.95, 40 + k * 1.6, 0.03, 1.4, 0.3);
  for (const x of [136, 141, 146]) win(b, x, 2.6, r.z0, 1.6, 0.9, true, false);
  box(b, H.concrete, 149, h + 1.4, 49, 0.9, 2.6, 0.9, 0, false);
  // the pool: a tiled rim round dark still water (BATH stands at its west edge)
  const p = { x0: BATH.x + 2.2, z0: 38.4, x1: 151.2, z1: 49.6 };
  const pcx = (p.x0 + p.x1) / 2;
  const pcz = (p.z0 + p.z1) / 2;
  for (const [x, z, w, d] of [
    [pcx, p.z0 + 0.2, p.x1 - p.x0, 0.4],
    [pcx, p.z1 - 0.2, p.x1 - p.x0, 0.4],
    [p.x0 + 0.2, pcz, 0.4, p.z1 - p.z0],
    [p.x1 - 0.2, pcz, 0.4, p.z1 - p.z0],
  ] as const) box(b, H.white, x, 0.25, z, w, 0.5, d, 0, false);
  box(b, H.water, pcx, 0.38, pcz, p.x1 - p.x0 - 0.8, 0.04, p.z1 - p.z0 - 0.8, 0, false);
  solid(c, pcx, pcz, p.x1 - p.x0, p.z1 - p.z0, 0.5, 'bath-pool', { shots: false });
  // two steps down into it at its west side, wooden duckboards along the rim
  box(b, H.white, p.x0 + 0.7, 0.3, pcz, 0.5, 0.06, 2, 0, false);
  for (let k = 0; k < 8; k++) box(b, H.woodPale, p.x0 - 0.8, 0.04, p.z0 + 0.8 + k * 1.3, 1.2, 0.05, 1.0, 0, false);
  // the taps along the south wall: a pipe, a tap each, a stool and a wooden bucket
  box(b, P.steel, 138, 1.05, r.z1 - 0.25, 10.5, 0.08, 0.08, 0, false);
  for (let k = 0; k < 8; k++) {
    const x = 133.4 + k * 1.3;
    box(b, P.steel, x, 0.92, r.z1 - 0.34, 0.06, 0.2, 0.14, 0, false);
    blk(c, H.woodPale, x, 0, r.z1 - 1.0, 0.36, 0.3, 0.36, 'stool', { shots: false });
    if (k % 2 === 0) cyl(b, H.wood, x + 0.45, 0, r.z1 - 0.7, 0.16, 0.18, 0.26, 10, false);
  }
  // lockers along the north wall (one open), a bench before them
  for (let k = 0; k < 14; k++) {
    const x = 133 + k * 0.62;
    box(b, P.locker, x, 0.95, r.z0 + 0.45, 0.58, 1.9, 0.5, 0, false);
    box(b, H.iron, x, 0.95, r.z0 + 0.71, 0.03, 1.8, 0.02, 0, false);
  }
  box(b, P.locker, 137.5, 0.95, r.z0 + 1.0, 0.04, 1.8, 0.56, 0.5, false);
  solid(c, 137.3, r.z0 + 0.45, 8.8, 0.55, 1.9, 'lockers', { surface: 'metal' });
  blk(c, H.woodPale, 137.3, 0, r.z0 + 1.6, 6, 0.42, 0.4, 'bench', { shots: false });
  box(b, H.iron, BATH.x, h - 0.2, BATH.z, 0.3, 0.12, 0.3, 0, false);
  box(b, H.lamp, BATH.x, h - 0.3, BATH.z, 0.2, 0.08, 0.2, 0, false);
  b.light({ x: BATH.x + 1, y: h - 0.5, z: BATH.z, color: 0xd8e4e0, intensity: 16, distance: 12, mode: 'flicker', pool: 2.4, glow: 0.25, tag: 'bath' });
}

/** The coal bunker's three bays (open to the yard, where the shovel lies), sacks, a barrow. */
function coalYard(c: Ctx): void {
  const { b } = c;
  const s = TOOLS.shovel;
  const zb = s.z - 14; // the back wall
  const zf = s.z - 4.5; // the bays' open front
  blk(c, H.concreteDark, s.x + 1, 0, zb, 18.4, 2.6, 0.4, 'bunker');
  for (const x of [s.x - 8, s.x - 2, s.x + 4, s.x + 10]) blk(c, H.concreteDark, x, 0, (zb + zf) / 2, 0.4, 2.2, zf - zb, 'bunker');
  for (const [k, x] of [s.x - 5, s.x + 1, s.x + 7].entries()) {
    cyl(b, P.coal, x, 0, zb + 3.4, 2.6, 0.3, 1.7 + (k % 2) * 0.4, 7, false);
    solid(c, x, zb + 3.4, 5, 6, 1.6, 'coal-pile', { shots: false });
  }
  // spilt coal at the bays' mouths, sacks waiting, a barrow
  ground(b, P.coal, s.x - 8, zf, s.x + 10, zf + 1.6, 0.005);
  for (const [x, z] of [
    [s.x - 6, s.z - 2],
    [s.x - 4.6, s.z - 1.6],
    [s.x - 5.4, s.z - 0.4],
  ] as const) {
    box(b, H.woodPale, x, 0.3, z, 1.1, 0.6, 0.75, x * 0.3, false);
    solid(c, x, z, 1.1, 0.75, 0.6, 'sacks', { shots: false, rot: x * 0.3 });
  }
  const bx = s.x + 3.4;
  const bz = s.z - 1.2;
  box(b, H.rust, bx, 0.55, bz, 0.8, 0.4, 1.0, 0.3, false);
  beam(b, H.wood, [bx - 0.3, 0.45, bz + 0.5], [bx - 0.6, 0.6, bz + 1.4], 0.06, 0.06);
  beam(b, H.wood, [bx + 0.3, 0.45, bz + 0.5], [bx + 0.0, 0.6, bz + 1.5], 0.06, 0.06);
  cyl(b, H.iron, bx + 0.1, 0.0, bz - 0.6, 0.2, 0.2, 0.06, 10, false);
  solid(c, bx, bz + 0.2, 1.0, 1.6, 0.8, 'barrow', { shots: false });
}

/** The slag heap in the north-east corner; the coal sack is buried in a spill at its foot (OBSTACLES slag). */
function slagHeap(c: Ctx): void {
  const { b } = c;
  // tipped spoil: three cones run together, flat-faceted, lumps at their feet
  cyl(b, P.slag, 140, 0, -67.5, 9.5, 1.2, 8.5, 9, false);
  cyl(b, P.slag, 150.5, 0, -65.5, 4.6, 0.6, 4.2, 8, false);
  cyl(b, P.slag, 131, 0, -70.5, 4.6, 0.8, 3.6, 7, false);
  solid(c, 140, -67.5, 15, 11, 6, 'slag-heap', { kind: 'wall' });
  solid(c, 150.5, -65.5, 6.8, 6.4, 3.4, 'slag-heap');
  solid(c, 131, -70.5, 6.8, 5.6, 2.8, 'slag-heap');
  for (let k = 0; k < 7; k++) {
    const a = 0.4 + k * 0.42;
    slab(b, P.slag, 140 + Math.cos(a) * 9.8, 0.2, -67.5 + Math.sin(a) * 9.8, 0.9 + (k % 3) * 0.3, 0.5, 0.7, 0.3, a, 0.2, false);
  }
  // the tip's trestle: the tub line climbing onto the heap on timber legs
  for (let k = 0; k < 4; k++) {
    const z = -53 - k * 1.8;
    const yy = 0.6 + k * 0.7;
    for (const s of [-0.5, 0.5]) box(b, H.woodDark, 146 + s, yy / 2, z, 0.2, yy, 0.2, 0, false);
    box(b, H.woodDark, 146, yy, z, 1.4, 0.18, 0.3, 0, false);
  }
  // the spill where the sack lies (walked over: the shovel digs it)
  const sk = JOBS.steam.coal[2]!;
  cyl(b, P.slag, sk.x + 0.4, 0, sk.z - 1.4, 1.8, 0.6, 0.45, 7, false);
  box(b, H.woodPale, sk.x - 0.2, 0.08, sk.z - 0.4, 0.5, 0.14, 0.35, 0.6, false);
}

/** The timber yard by the seawall: stacks of pit props, a shed with its saw bench. */
function timberYard(c: Ctx): void {
  const { b } = c;
  propStack(c, 135, 60, true);
  propStack(c, 135, 66, true, 3);
  propStack(c, 141.5, 63, false, 5);
  shell(c, { x0: 146, z0: 58, x1: 154, z1: 65 }, 0, 3.2, { doors: [{ side: 'W', at: 3.5, w: 2.2 }], wall: H.woodDark, roof: P.corr, floor: H.wood, tag: 'timber-shed' });
  blk(c, H.wood, 150.5, 0, 63.4, 3, 0.9, 1.0, 'saw-bench', { shots: false });
  cyl(b, P.steel, 150.5, 0.9, 63.4, 0.35, 0.35, 0.03, 16, false);
  for (let k = 0; k < 5; k++) box(b, H.woodPale, 153.5, 1.4, 59.2 + k * 0.25, 0.1, 2.6, 0.2, 0.05 * k, false);
  solid(c, 153.5, 59.7, 0.4, 1.4, 2.6, 'planks', { surface: 'wood' });
}

/** The compressor house: roofless brick walls broken off at different heights, the compressor rusting inside. */
function compressorRuin(c: Ctx): void {
  const { b } = c;
  const r = { x0: 80, z0: -60, x1: 92, z1: -46 };
  const hs = [4.8, 5.2, 3.6, 2.4, 4.4, 5.4, 3.0, 4.6];
  let k = 0;
  const wallRun = (x0: number, z0: number, x1: number, z1: number, gaps: [number, number][]): void => {
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let a = 0; a < len - 0.01; a += 2) {
      const e = Math.min(len, a + 2);
      if (gaps.some(([p, q]) => a >= p - 0.01 && e <= q + 0.01)) continue;
      const hh = hs[k++ % hs.length]!;
      const m = (a + e) / 2;
      blk(c, H.brick, alongX ? x0 + m : x0, 0, alongX ? z0 : z0 + m, alongX ? e - a : 0.4, hh, alongX ? 0.4 : e - a, 'compressor-house');
    }
  };
  wallRun(r.x0, r.z0, r.x1, r.z0, []);
  wallRun(r.x0, r.z1, r.x1, r.z1, [[4, 8]]);
  wallRun(r.x0, r.z0, r.x0, r.z1, [[6, 8]]);
  wallRun(r.x1, r.z0, r.x1, r.z1, [[2, 4], [10, 12]]);
  // the roof trusses fallen in, rubble, the compressor on its bed
  beam(b, H.woodDark, [r.x0 + 1, 4.6, r.z0 + 0.5], [r.x0 + 4, 0.2, r.z0 + 6], 0.3, 0.25);
  beam(b, H.woodDark, [r.x1 - 1, 5.0, r.z0 + 0.5], [r.x1 - 2.5, 0.2, r.z0 + 5.5], 0.3, 0.25);
  slab(b, P.corr, r.x0 + 3, 1.2, r.z1 - 3, 3.6, 0.08, 2.4, 0.5, 0.4, 0.2, false);
  for (let k = 0; k < 6; k++) slab(b, H.brick, r.x0 + 1.4 + (k % 3) * 0.6, 0.2 + Math.floor(k / 3) * 0.3, r.z0 + 2 + (k % 2) * 0.7, 0.9, 0.3, 0.5, 0.2 * k, k, 0.1, false);
  solid(c, r.x0 + 2, r.z0 + 2.4, 2.6, 2.2, 0.9, 'rubble', { shots: false });
  blk(c, H.concreteDark, 87, 0, -54, 6, 0.4, 2.4, 'compressor-bed', { shots: false });
  {
    const g = new THREE.CylinderGeometry(0.9, 0.9, 4, 16).rotateZ(Math.PI / 2);
    const o = new THREE.Mesh(g, H.green);
    o.position.set(86.4, 1.4, -54);
    b.add(o, { cast: false });
    const f = new THREE.CylinderGeometry(1.2, 1.2, 0.25, 18).rotateZ(Math.PI / 2);
    const w = new THREE.Mesh(f, H.iron);
    w.position.set(89.2, 1.6, -54);
    b.add(w, { cast: false });
  }
  solid(c, 87.2, -54, 6, 2.6, 2.8, 'compressor', { surface: 'metal' });
  cyl(b, H.rust, 94.6, 0, -50, 0.8, 0.8, 4.4, 14, false);
  solid(c, 94.6, -50, 1.6, 1.6, 4.4, 'air-receiver', { surface: 'metal' });
  beam(b, H.iron, [94.6, 3.6, -50.8], [r.x1 + 0.2, 3.6, -50.8], 0.12, 0.12);
}

/** The mine shrine (SHRINES[1]): a hokora on its plinth facing south, stone lanterns, a small torii. */
function mineShrine(c: Ctx): void {
  const { b } = c;
  const ms = SHRINES[1]!;
  const hz = ms.z - 3.1;
  blk(c, H.concrete, ms.x, 0, hz, 2.4, 0.5, 1.8, 'hokora-plinth');
  blk(c, H.woodDark, ms.x, 0.5, hz, 1.3, 1.3, 1.0, 'hokora');
  gable(b, P.roof, ms.x, 1.8, hz, 1.6, 1.7, 0.55, true);
  box(b, H.wood, ms.x, 1.15, hz + 0.52, 0.8, 0.9, 0.04, 0, false);
  // the straw rope and its paper zigzags across the hokora's front
  box(b, P.straw, ms.x, 1.75, hz + 0.6, 1.5, 0.08, 0.08, 0, false);
  for (const dx of [-0.45, 0, 0.45]) box(b, P.paper, ms.x + dx, 1.55, hz + 0.62, 0.1, 0.32, 0.02, 0, false);
  // the stone lanterns either side (one lit)
  for (const s of [-1, 1]) {
    const x = ms.x + s * 2.7;
    const z = ms.z - 1.6;
    blk(c, H.concrete, x, 0, z, 0.5, 0.9, 0.5, 'toro');
    box(b, s < 0 ? H.lamp : H.concreteDark, x, 1.1, z, 0.36, 0.34, 0.36, 0, false);
    box(b, H.concrete, x, 1.33, z, 0.7, 0.12, 0.7, 0, false);
    box(b, H.concrete, x, 1.46, z, 0.24, 0.14, 0.24, 0, false);
  }
  torii(c, ms.x, ms.z + 3.3, 1.9, 2.4);
  ground(b, P.wet, ms.x - 1.4, ms.z - 2, ms.x + 1.4, ms.z + 4.5, 0.01);
  b.light({ x: ms.x - 2.7, y: 1.6, z: ms.z - 1.2, color: 0xffa050, intensity: 10, distance: 8, mode: 'flicker', pool: 1.8, glow: 0.3, tag: 'mine-shrine' });
}
