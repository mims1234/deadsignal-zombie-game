/**
 * ZARYA: the TRAM DEPOT (`zarya/zones/depot.ts`), built from the `de-*` reference pictures: three brick sheds in the
 * north-east corner with their doorways to the south, the tracks fanning out to them from the stop's line, the
 * dispatcher's glass booth at the throat of the fan and the track gang's store against the sheds' west wall; the
 * works yard to the west (the tower wagon, the snowplough car on its stub, rails and sleepers under snow); and along the
 * south a short street with the Okhotnik hunting shop (walked into), the workers' canteen with the red fire board on its
 * wall, the depot's garage and its woodshed.
 */
import * as THREE from 'three';
import { addBox, groundRect, wall } from '../structures';
import type { LevelBuilder } from '../builder';
import type { Ctx } from './util';
import { DEPOT } from '../../zarya/zones/depot';
import { shutterKiosk } from './zaryaShutters';
import { GOODS, Z, ball, bench, box, counter, cyl, firTree, goods, lampPost, shelves, slab, solid } from './zaryaKit';

const std = (color: number, roughness = 0.9): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness });
/** Colours the kit lacks, at finishes it already has (so they draw with everything else). */
const C = {
  ochre: std(0xb39a66),
  sand: std(0xb7a273),
  brick: std(0x6e4034),
  doorGreen: std(0x3a5440),
  yellow: std(0xc79a2e, 0.85),
  feather: std(0x4a3a2a, 0.85),
  log: std(0x93714a, 0.85),
  logEnd: std(0xc2a476, 0.85),
  works: std(0xd0781e, 0.8),
  nightGlass: std(0x1d2c4e, 0.85),
};

const R = DEPOT.rect;
/** The stop's line (the frame lays sixty metres of it and stands the tram on it). */
const STOP_Z = -128;
/** The street, and the face of the buildings along its north side. */
const STREET = { z0: -96.5, z1: -87.5 };
const FRONT = -97;
/** The sheds: outer faces, wall thickness, eaves, the rise of each gable, the middle of each bay. */
const SH = { x0: 204.5, x1: 243.5, z0: -187.6, z1: -159.7, t: 0.6, eave: 6.4, rise: 3, bays: [211, 224, 237] as const };
/** Where the fan of tracks leaves the stop's line. */
const FAN_X = 198;

// ---------------------------------------------------------------------------------------------------------------------
// small shapes
// ---------------------------------------------------------------------------------------------------------------------

/** A round thing that takes the light like the boxes round it (the kit's `ball` is for lamps). */
function blob(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sx = 1, sy = 1, sz = 1, seg = 8): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.receiveShadow = true;
  b.add(m, { cast: false });
}

/** A cylinder lying on its side, along x (or z). */
function drum(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, len: number, alongZ: boolean, seg = 10, cast = true): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.set(x, y, z);
  if (alongZ) m.rotation.x = Math.PI / 2;
  else m.rotation.z = Math.PI / 2;
  m.castShadow = cast;
  m.receiveShadow = true;
  b.add(m);
}

/** Draws `draw` round the origin, then stands the lot at (x, z) turned by `yaw` (a parked car, a works tram). */
function turned(c: Ctx, x: number, z: number, yaw: number, draw: (b: LevelBuilder) => void): void {
  const g = new THREE.Group();
  const proxy = {
    mats: c.b.mats,
    add: (o: THREE.Object3D, opts?: { cast?: boolean; receive?: boolean }): void => {
      if (opts?.cast === false) o.castShadow = false;
      if (opts?.receive !== undefined) o.receiveShadow = opts.receive;
      g.add(o);
    },
  } as unknown as LevelBuilder;
  draw(proxy);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  c.b.add(g);
}

/** A gable: a triangle of wall `half` either side of `xc`, standing on `y`, facing north and south. */
function gable(b: LevelBuilder, mat: THREE.Material, xc: number, half: number, y: number, rise: number, z: number, t: number): void {
  const s = new THREE.Shape();
  s.moveTo(-half, 0);
  s.lineTo(half, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(xc, y, z - t / 2);
  // the wall's own texture, laid the way the builder lays it on the wall below
  const tile = (mat.userData?.tile as number | undefined) ?? 0;
  if (tile > 0) {
    const p = g.attributes.position!;
    const uv = g.attributes.uv!;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
  }
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  b.add(m);
}

/**
 * A lit window on a closed wall: a warm pane, a white frame and glazing bars, a sill under snow. (x, z) is on the
 * wall's face, (nx, nz) the way it looks, `y` the sill.
 */
function litWindow(b: LevelBuilder, x: number, y: number, z: number, w: number, h: number, nx: number, nz: number, o: { curtain?: boolean; frame?: THREE.Material; heads?: readonly number[] } = {}): void {
  const frame = o.frame ?? Z.white;
  const put = (mat: THREE.Material, along: number, up: number, out: number, sw: number, sh: number, st: number): void => {
    // along the wall: east on a wall that looks north or south, south on one that looks east or west
    box(b, mat, x + (nz !== 0 ? along : nx * out), y + up, z + (nz !== 0 ? nz * out : along), nz !== 0 ? sw : st, sh, nz !== 0 ? st : sw, 0, false);
  };
  put(Z.warm, 0, h / 2, 0.02, w, h, 0.05);
  put(frame, 0, h + 0.05, 0.05, w + 0.2, 0.1, 0.1);
  put(frame, 0, -0.05, 0.07, w + 0.3, 0.1, 0.18);
  put(Z.snow, 0, 0.03, 0.12, w + 0.2, 0.07, 0.12);
  for (const s of [-1, 1]) put(frame, s * (w / 2 + 0.05), h / 2, 0.05, 0.1, h, 0.1);
  const n = Math.max(1, Math.round(w / 1.3));
  for (let k = 1; k < n; k++) put(frame, -w / 2 + (k * w) / n, h / 2, 0.06, 0.06, h, 0.04);
  put(frame, 0, h * 0.72, 0.06, w, 0.05, 0.04);
  if (o.curtain) put(Z.cream, 0, h * 0.2, 0.05, w - 0.06, h * 0.4, 0.012);
  // somebody asleep on their feet inside: a head and shoulders against the light
  for (const a of o.heads ?? []) {
    put(Z.woodDark, a, h * 0.5, 0.05, 0.5, h * 0.24, 0.012);
    put(Z.woodDark, a, h * 0.5 + h * 0.2, 0.05, 0.24, 0.26, 0.012);
  }
}

/** A bare tree. */
function bareTree(c: Ctx, x: number, z: number, h = 3.8, turn = 0): void {
  const { b } = c;
  cyl(b, Z.woodDark, x, 0, z, 0.17, 0.07, h, 6);
  for (let i = 0; i < 6; i++) slab(b, Z.woodDark, x + Math.cos(i * 2.2 + turn) * 0.5, h - 0.4 + (i % 3) * 0.5, z + Math.sin(i * 2.2 + turn) * 0.5, 0.06, 1.9, 0.06, Math.sin(i * 1.7 + turn) * 0.6, i * 2.2 + turn, 0.7, false);
  solid(c, x, z, 0.4, 0.4, h, 'zarya-tree', { kind: 'none', surface: 'wood' });
}

/** A crate (or a stack of them: `n` high), snow on the top one. */
function crate(c: Ctx, x: number, z: number, s: number, rot = 0, n = 1, snow = true): void {
  const { b } = c;
  for (let i = 0; i < n; i++) {
    const k = s * (1 - i * 0.12);
    box(b, i % 2 ? Z.wood : Z.woodPale, x, s * i + k / 2, z, k, k, k, rot + i * 0.3);
    box(b, Z.woodDark, x, s * i + k * 0.5, z, k + 0.03, k * 0.12, k + 0.03, rot + i * 0.3, false);
  }
  const top = s * (n - 1) + s * (1 - (n - 1) * 0.12);
  if (snow) box(b, Z.snow, x, top + 0.05, z, s * 0.9, 0.1, s * 0.9, rot + (n - 1) * 0.3, false);
  solid(c, x, z, s, s, top, 'zarya-crate', { rot, kind: 'none', surface: 'wood' });
}

/** A heap of ploughed snow (walked round, shot over). */
function heap(c: Ctx, x: number, z: number, r: number, h: number, sx = 1, sz = 1): void {
  blob(c.b, Z.snow, x, 0, z, r, sx, h / r, sz, 9);
  solid(c, x, z, r * sx * 1.5, r * sz * 1.5, h * 0.8, 'zarya-snow', { shots: false, kind: 'none' });
}

// ---------------------------------------------------------------------------------------------------------------------
// trams and tracks
// ---------------------------------------------------------------------------------------------------------------------

/**
 * An old round-ended tram car, drawn round the origin along z with its headlamp at +z: closed (nobody boards these),
 * its windows lit or dark. `snow` is the stretch of roof (along z) that stands out in the weather.
 */
function tram(b: LevelBuilder, len: number, o: { low: THREE.Material; lit: boolean; snow?: readonly [number, number]; plough?: boolean }): void {
  const hw = 1.25;
  const body = len - hw * 2;
  const e = len / 2 - hw;
  const glass = o.lit ? Z.warm : Z.black;
  box(b, Z.iron, 0, 0.36, 0, 1.9, 0.5, len - 3);
  for (const s of [-1, 1]) box(b, Z.black, 0, 0.32, s * (len / 2 - 3.4), 2.2, 0.62, 2.2);
  const layers: readonly (readonly [number, number, number, THREE.Material, boolean])[] = [
    [0.62, 1.16, hw, o.low, true],
    [1.78, 0.16, hw + 0.02, Z.cream, false],
    [1.94, 0.68, hw - 0.07, glass, false],
    [2.62, 0.3, hw, Z.cream, true],
    [2.92, 0.14, hw + 0.05, Z.grey, true],
  ];
  for (const [y0, h, r, mat, cast] of layers) {
    box(b, mat, 0, y0 + h / 2, 0, r * 2, h, body, 0, cast);
    for (const s of [-1, 1]) cyl(b, mat, 0, y0, s * e, r, r, h, 16, cast);
  }
  box(b, Z.cream, 0, 3.12, 0, 1.8, 0.12, len - 2.2, 0, false);
  // window posts down the sides and round the ends, the doors
  for (let z = -body / 2; z <= body / 2 + 0.01; z += body / Math.round(body / 1.55)) for (const s of [-1, 1]) box(b, Z.cream, s * (hw - 0.03), 2.28, z, 0.08, 0.68, 0.12, 0, false);
  for (const s of [-1, 1]) for (const a of [0.5, 1.12]) for (const k of [-1, 1]) box(b, Z.cream, k * Math.sin(a) * (hw - 0.03), 2.28, s * (e + Math.cos(a) * (hw - 0.03)), 0.1, 0.68, 0.1, 0, false);
  for (const s of [-1, 1]) for (const k of [-1, 1]) {
    box(b, Z.redDark, s * (hw + 0.01), 1.6, k * (body / 2 - 0.9), 0.05, 1.96, 1.1, 0, false);
    box(b, glass, s * (hw + 0.03), 2.25, k * (body / 2 - 0.9), 0.03, 0.5, 0.7, 0, false);
  }
  // the lamp, the bumpers, the route board, the bow on the roof
  if (o.lit) ball(b, Z.bulb, 0, 1.25, len / 2 - 0.02, 0.17);
  else blob(b, Z.grey, 0, 1.25, len / 2 - 0.02, 0.17);
  for (const s of [-1, 1]) box(b, Z.iron, 0, 0.62, s * (len / 2 + 0.02), 1.5, 0.16, 0.2);
  box(b, Z.cream, 0, 3.32, e, 0.7, 0.3, 0.08, 0, false);
  for (const s of [-1, 1]) slab(b, Z.iron, 0, 3.84, s * 0.36, 0.05, 1.5, 0.05, -s * 0.55, 0, 0, false);
  box(b, Z.iron, 0, 4.48, 0, 1.5, 0.06, 0.08, 0, false);
  if (o.snow) box(b, Z.snow, 0, 3.27, (o.snow[0] + o.snow[1]) / 2, 2.1, 0.18, o.snow[1] - o.snow[0], 0, false);
  if (o.plough) {
    // the snowplough: two blades in a V ahead of the headlamp
    for (const s of [-1, 1]) slab(b, Z.iron, s * 0.68, 0.6, len / 2 + 0.62, 1.75, 0.9, 0.08, 0, s * 0.72, 0);
    box(b, Z.iron, 0, 0.7, len / 2 + 0.3, 0.2, 0.3, 0.8);
  }
}

/** Two rails along a line of points. */
function rails(b: LevelBuilder, pts: readonly (readonly [number, number])[]): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i]!;
    const [x1, z1] = pts[i + 1]!;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    const rot = Math.atan2(-dz, dx);
    for (const s of [-0.72, 0.72]) box(b, Z.steel, (x0 + x1) / 2 + (-dz / L) * s, 0.05, (z0 + z1) / 2 + (dx / L) * s, L + 0.08, 0.09, 0.08, rot, false);
  }
}

/** The overhead wire along a line of points. */
function wire(b: LevelBuilder, pts: readonly (readonly [number, number])[], y = 5.5): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i]!;
    const [x1, z1] = pts[i + 1]!;
    box(b, Z.black, (x0 + x1) / 2, y, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) + 0.04, 0.03, 0.03, Math.atan2(-(z1 - z0), x1 - x0), false);
  }
}

/** A wire pole at (x, z) with its arm out over the track at (tx, tz). */
function pole(c: Ctx, x: number, z: number, tx: number, tz: number): void {
  const { b } = c;
  cyl(b, Z.iron, x, 0, z, 0.14, 0.1, 6.2, 8);
  cyl(b, Z.snow, x, 6.2, z, 0.12, 0.02, 0.14, 6, false);
  const L = Math.hypot(tx - x, tz - z);
  box(b, Z.iron, (x + tx) / 2, 5.9, (z + tz) / 2, L + 0.3, 0.07, 0.07, Math.atan2(-(tz - z), tx - x), false);
  box(b, Z.iron, tx, 5.7, tz, 0.03, 0.4, 0.03, 0, false);
  solid(c, x, z, 0.3, 0.3, 6.2, 'zarya-pole', { kind: 'none', surface: 'metal' });
}

/** The line a track takes from the stop's line round into bay `i`: a quarter turn, then straight in at the doorway. */
function fanLine(i: number): [number, number][] {
  const a = SH.bays[i]! - FAN_X;
  const bz = [14, 24, 30][i]!;
  const pts: [number, number][] = [];
  for (let k = 0; k <= 12; k++) {
    const t = (k / 12) * (Math.PI / 2);
    pts.push([FAN_X + a * Math.sin(t), STOP_Z - bz * (1 - Math.cos(t))]);
  }
  pts.push([SH.bays[i]!, SH.z1]);
  return pts;
}

function fan(c: Ctx): void {
  const { b } = c;
  for (let i = 0; i < 3; i++) {
    const pts = fanLine(i);
    rails(b, pts);
    wire(b, pts.filter((_, k) => k % 3 === 0 || k === pts.length - 1));
  }
  // poles, each with an arm out over the nearest track
  pole(c, 205.8, -135.6, 208.5, -133.8);
  pole(c, 216.5, -139.9, 219, -137.9);
  pole(c, 231.9, -138.2, 229.6, -140.4);
  pole(c, 220.6, -148.6, 223.7, -148.2);
  pole(c, 240.2, -152.6, 236.6, -153.3);
  pole(c, 207.6, -151.4, 211, -151.4);
  // the points lever where the fan leaves the line, and a dwarf signal showing red
  box(b, Z.iron, 199.4, 0.08, -126.5, 0.7, 0.16, 0.3);
  slab(b, Z.iron, 199.4, 0.55, -126.5, 0.05, 0.95, 0.05, 0, 0, 0.35, false);
  box(b, Z.white, 199.1, 0.98, -126.5, 0.22, 0.22, 0.06, 0, false);
  solid(c, 199.4, -126.5, 0.7, 0.3, 0.9, 'zarya-lever', { shots: false, kind: 'none', surface: 'metal' });
  cyl(b, Z.iron, 201.2, 0, -124.9, 0.07, 0.06, 2.9, 6);
  box(b, Z.black, 201.2, 3.1, -124.9, 0.34, 0.74, 0.24);
  ball(b, Z.redLamp, 201.02, 3.28, -124.9, 0.09);
  blob(b, Z.iron, 201.02, 2.95, -124.9, 0.09);
  b.glow({ x: 200.95, y: 3.28, z: -124.9, color: 0xff3020, size: 0.7, intensity: 2, mode: 'steady' });
  solid(c, 201.2, -124.9, 0.3, 0.3, 3.4, 'zarya-pole', { kind: 'none', surface: 'metal' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the sheds
// ---------------------------------------------------------------------------------------------------------------------

/** The arch over a shed's doorway: a half-round fanlight glowing from inside, its bars, the ring of pale stones round it. */
function archOver(b: LevelBuilder, x: number, y: number, z: number, r: number, inside = false): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.08, 20, 1, false, Math.PI / 2, Math.PI), inside ? C.nightGlass : Z.warm);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  b.add(m, { cast: false });
  const out = inside ? -1 : 1;
  box(b, Z.iron, x, y - 0.08, z + out * 0.02, r * 2 + 0.5, 0.16, 0.14, 0, false);
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI;
    slab(b, Z.iron, x + (Math.cos(a) * r) / 2, y + (Math.sin(a) * r) / 2, z + out * 0.05, r, 0.07, 0.05, 0, 0, a, false);
  }
  if (inside) return;
  for (let k = 0; k < 10; k++) {
    const a = ((k + 0.5) / 10) * Math.PI;
    slab(b, Z.iron, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, z + 0.05, r * 0.19, 0.06, 0.05, 0, 0, a + Math.PI / 2, false);
  }
  for (let k = 0; k < 13; k++) {
    const a = ((k + 0.5) / 13) * Math.PI;
    slab(b, k === 6 ? Z.white : Z.concrete, x + Math.cos(a) * (r + 0.22), y + Math.sin(a) * (r + 0.22), z, ((r + 0.22) * Math.PI) / 13 + 0.02, k === 6 ? 0.6 : 0.44, 0.16, 0, 0, a + Math.PI / 2, false);
  }
}

function sheds(c: Ctx): void {
  const { b } = c;
  const brick = c.mats.get('brick');
  const zc = (SH.z0 + SH.z1) / 2;
  const depth = SH.z1 - SH.z0;
  const zin = SH.z1 - SH.t;
  // ---- the shell: brick walls, three doorways in the south face, a gable and a pitched roof over each bay ----
  wall(b, { x0: SH.x0, z0: SH.z1 - SH.t / 2, x1: SH.x1, z1: SH.z1 - SH.t / 2, height: SH.eave, thickness: SH.t, material: 'brick', tag: 'zarya-shed', openings: SH.bays.map((x) => ({ at: x - SH.x0, width: 5.2, height: 4.8, kind: 'door' as const })) });
  wall(b, { x0: SH.x0, z0: SH.z0 + SH.t / 2, x1: SH.x1, z1: SH.z0 + SH.t / 2, height: SH.eave, thickness: SH.t, material: 'brick', tag: 'zarya-shed' });
  for (const x of [SH.x0 + SH.t / 2, SH.x1 - SH.t / 2]) wall(b, { x0: x, z0: SH.z0 + SH.t, x1: x, z1: zin, height: SH.eave, thickness: SH.t, material: 'brick', tag: 'zarya-shed' });
  groundRect(b, Z.concreteDark, SH.x0 + SH.t, SH.z0 + SH.t, SH.x1 - SH.t, SH.z1, 0.03);
  const ang = Math.atan2(SH.rise, 6.5);
  const run = Math.hypot(SH.rise, 6.5);
  for (const x of SH.bays) {
    for (const z of [SH.z1 - SH.t / 2, SH.z0 + SH.t / 2]) gable(b, brick, x, 6.5, SH.eave, SH.rise, z, SH.t);
    for (const s of [-1, 1]) {
      slab(b, Z.woodDark, x + s * 3.25, SH.eave + SH.rise / 2 + 0.1, zc, run + 0.2, 0.16, depth + 1.2, 0, 0, -s * ang);
      slab(b, Z.snow, x + s * 3.25, SH.eave + SH.rise / 2 + 0.3, zc, run + 0.1, 0.24, depth + 1.1, 0, 0, -s * ang, false);
    }
    // a ridge vent under its own cap of snow
    box(b, Z.woodDark, x, SH.eave + SH.rise + 0.4, zc, 1.5, 0.8, 6);
    box(b, Z.snow, x, SH.eave + SH.rise + 0.9, zc, 1.9, 0.22, 6.4, 0, false);
    // the doorway: the fanlight over it, the doors folded back, a lamp in the gable
    archOver(b, x, 4.96, SH.z1 + 0.02, 2.5);
    archOver(b, x, 4.96, zin - 0.02, 2.5, true);
    for (const s of [-1, 1]) {
      const hx = x + s * 2.68;
      const yaw = s * 0.3;
      const cx = hx + Math.sin(yaw) * 1.3;
      const cz = SH.z1 + 0.05 + Math.cos(yaw) * 1.3;
      box(b, C.doorGreen, cx, 2.4, cz, 0.12, 4.8, 2.6, yaw);
      for (const y of [0.7, 2.4, 4.1]) box(b, Z.iron, cx, y, cz, 0.16, 0.12, 2.6, yaw, false);
      solid(c, cx, cz, 0.2, 2.6, 4.8, 'zarya-sheddoor', { rot: yaw, kind: 'none', surface: 'wood' });
    }
    box(b, Z.iron, x, 8.35, SH.z1 + 0.3, 0.06, 0.06, 0.6, 0, false);
    cyl(b, Z.iron, x, 8.12, SH.z1 + 0.58, 0.34, 0.06, 0.2, 10, false);
    ball(b, Z.bulb, x, 8.08, SH.z1 + 0.58, 0.16);
    b.glow({ x, y: 8.05, z: SH.z1 + 0.6, color: 0xffb060, size: 1.2, intensity: 2.2, mode: 'steady' });
  }
  // snow lying in the valleys between the roofs, brick piers between the doorways
  for (const x of [217.5, 230.5]) box(b, Z.snow, x, SH.eave + 0.98, zc, 1.3, 0.5, depth + 0.9, 0, false);
  for (const x of [SH.x0 + 0.5, 217.5, 230.5, SH.x1 - 0.5]) {
    addBox(b, 'brick', x, (SH.eave + 0.4) / 2, SH.z1 + 0.1, 1, SH.eave + 0.4, 0.3);
    box(b, Z.snow, x, SH.eave + 0.46, SH.z1 + 0.12, 1.1, 0.12, 0.4, 0, false);
    box(b, Z.concrete, x, 0.35, SH.z1 + 0.16, 1.14, 0.7, 0.34, 0, false);
  }
  // tall lit windows in the west wall, south of the store built against it
  for (const z of [-172, -165.4]) {
    litWindow(b, SH.x0, 2, z, 1.8, 3, -1, 0, { frame: Z.iron });
  }
  b.collide({ x: (SH.x0 + SH.x1) / 2, z: zc, hx: (SH.x1 - SH.x0) / 2, hz: depth / 2, y0: SH.eave, y1: SH.eave + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: (SH.x0 + SH.x1) / 2, z: zc, hx: (SH.x1 - SH.x0) / 2, hz: depth / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });

  // ---- inside: a track and its inspection pit down each bay, piers between the bays, lamps on cords ----
  for (const x of [217.5, 230.5]) {
    addBox(b, 'brick', x, SH.eave - 0.35, zc, 0.9, 0.7, depth - SH.t * 2);
    for (const z of [-166.9, -173.8, -180.7]) {
      addBox(b, 'brick', x, (SH.eave - 0.7) / 2, z, 0.9, SH.eave - 0.7, 0.9);
      solid(c, x, z, 0.9, 0.9, SH.eave, 'zarya-shed', { kind: 'wall' });
    }
  }
  SH.bays.forEach((x, i) => {
    rails(b, [[x, -184.5], [x, SH.z1]]);
    box(b, Z.red, x, 0.55, -184.8, 1.9, 0.3, 0.24);
    for (const s of [-1, 1]) box(b, Z.iron, x + s * 0.72, 0.3, -184.8, 0.14, 0.6, 0.3);
    solid(c, x, -184.8, 1.9, 0.3, 0.7, 'zarya-buffer', { shots: false, kind: 'none', surface: 'metal' });
    groundRect(b, Z.black, x - 0.5, -183, x + 0.5, -166, 0.05);
    for (const s of [-1, 1]) box(b, C.yellow, x + s * 0.57, 0.05, -174.5, 0.07, 0.05, 17.2, 0, false);
    for (const z of [-183.1, -165.9]) box(b, C.yellow, x, 0.05, z, 1.2, 0.05, 0.1, 0, false);
    for (const z of [-164.5, -174, -183.5]) {
      cyl(b, Z.iron, x, 5.5, z, 0.02, 0.02, 0.8, 4, false);
      cyl(b, Z.greenDark, x, 5.3, z, 0.42, 0.08, 0.24, 10, false);
      ball(b, Z.bulb, x, 5.3, z, 0.13);
    }
    for (const z of [-166.9, -173.8, -180.7]) box(b, Z.iron, x, 6.2, z, 12.2, 0.1, 0.1, 0, false);
    b.light({ x: x + (i === 0 ? 3.4 : i === 2 ? -3.4 : 2.4), y: 4.8, z: -166.5, color: 0xffc98a, intensity: 36, distance: 27, mode: 'steady', pool: 8, weight: 1 });
  });

  // ---- the two cars standing half in, half out ----
  for (const [x, z0, z1] of [[SH.bays[0], -168, -153.5], [SH.bays[2], -171, -156.5]] as const) {
    const len = z1 - z0;
    const mid = (z0 + z1) / 2;
    turned(c, x, mid, 0, (tb) => tram(tb, len, { low: Z.red, lit: true, snow: [SH.z1 + 0.4 - mid, len / 2 - 0.5] }));
    solid(c, x, mid, 2.5, len, 3.1, 'zarya-tram', { kind: 'building', surface: 'metal' });
  }

  // ---- what stands along the walls ----
  // bay one: lockers and a bench in the north-west corner, oil drums by the west wall
  for (let i = 0; i < 5; i++) {
    box(b, i % 2 ? Z.green : Z.greenDark, 205.7 + i * 0.84, 0.95, -186.7, 0.8, 1.9, 0.5);
    box(b, Z.iron, 205.95 + i * 0.84, 1.2, -186.43, 0.05, 0.12, 0.03, 0, false);
  }
  solid(c, 207.4, -186.7, 4.3, 0.5, 1.9, 'zarya-lockers', { kind: 'prop', surface: 'metal' });
  box(b, Z.wood, 207.6, 0.45, -185.5, 3.4, 0.07, 0.4);
  for (const s of [-1.5, 1.5]) box(b, Z.iron, 207.6 + s, 0.22, -185.5, 0.06, 0.44, 0.36, 0, false);
  solid(c, 207.6, -185.5, 3.4, 0.4, 0.5, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
  for (const [x, z, m] of [[205.7, -178, Z.blue], [205.75, -177.2, Z.red], [206.45, -177.65, Z.grey]] as const) cyl(b, m, x, 0.03, z, 0.3, 0.3, 0.9, 10);
  solid(c, 206, -177.6, 1.4, 1.5, 0.95, 'zarya-drums', { kind: 'none', surface: 'metal' });
  // bay two: the long bench with its vice and the board of tools over it, spare wheelsets, a hand cart
  box(b, Z.wood, 224, 0.9, -186.75, 8, 0.1, 0.9);
  for (const s of [-3.8, -1.3, 1.3, 3.8]) box(b, Z.woodDark, 224 + s, 0.43, -186.75, 0.1, 0.86, 0.8, 0, false);
  box(b, Z.woodDark, 224, 0.3, -186.8, 7.6, 0.05, 0.7, 0, false);
  box(b, Z.steel, 221, 1.06, -186.6, 0.3, 0.22, 0.26, 0, false);
  box(b, Z.woodPale, 224, 2.1, -187.26, 6, 1.3, 0.05, 0, false);
  for (let i = 0; i < 14; i++) box(b, Z.iron, 221.4 + i * 0.4, 2.1 + ((i * 3) % 4) * 0.12, -187.21, 0.06, 0.42, 0.03, ((i * 5) % 3) * 0.2 - 0.2, false);
  goods(b, 225.6, 0.96, -186.7, 3, false, 17, { mats: [Z.iron, Z.grey, Z.red, Z.woodPale], h: 0.2 });
  solid(c, 224, -186.75, 8, 0.9, 1, 'zarya-workbench', { shots: false, kind: 'prop', surface: 'wood' });
  for (const z of [-168.4, -170.6]) {
    drum(b, Z.iron, 228, 0.42, z, 0.07, 1.7, false, 6);
    for (const s of [-1, 1]) drum(b, Z.steel, 228 + s * 0.72, 0.42, z, 0.42, 0.12, false, 14, false);
  }
  solid(c, 228, -169.5, 1.8, 3.1, 0.85, 'zarya-wheels', { shots: false, kind: 'none', surface: 'metal' });
  box(b, C.works, 220.2, 0.55, -181.2, 1.5, 0.12, 0.9);
  for (const s of [-1, 1]) {
    drum(b, Z.black, 220.2 + s * 0.5, 0.2, -181.2, 0.2, 1, true, 8);
    box(b, Z.iron, 220.2 + s * 0.7, 0.85, -181.62, 0.05, 0.7, 0.05, 0, false);
  }
  box(b, Z.iron, 220.2, 1.2, -181.62, 1.45, 0.05, 0.05, 0, false);
  box(b, Z.grey, 220.1, 0.75, -181.15, 0.6, 0.3, 0.5, 0.2, false);
  solid(c, 220.2, -181.2, 1.5, 1, 0.9, 'zarya-cart', { shots: false, kind: 'none', surface: 'metal' });
  // bay three: a bench at the back, crates, a ladder against the east wall
  box(b, Z.wood, 239, 0.9, -186.75, 5, 0.1, 0.9);
  for (const s of [-2.3, 0, 2.3]) box(b, Z.woodDark, 239 + s, 0.43, -186.75, 0.1, 0.86, 0.8, 0, false);
  goods(b, 238.6, 0.96, -186.7, 3.6, false, 23, { mats: [Z.iron, Z.grey, Z.steel, C.yellow], h: 0.22 });
  cyl(b, Z.greenDark, 240.9, 0.95, -186.8, 0.16, 0.05, 0.22, 8, false);
  solid(c, 239, -186.75, 5, 0.9, 1, 'zarya-workbench', { shots: false, kind: 'prop', surface: 'wood' });
  crate(c, 241.7, -176.4, 1.2, 0.1, 2, false);
  crate(c, 241.8, -178, 1, -0.2, 1, false);
  for (const s of [-0.25, 0.25]) slab(b, Z.woodPale, 242.5, 2.2, -182 + s, 0.06, 4.6, 0.06, 0, 0, -0.16, false);
  for (let i = 0; i < 10; i++) box(b, Z.woodPale, 242.5 - 0.32 + i * 0.07, 0.45 + i * 0.42, -182, 0.04, 0.04, 0.5, 0, false);
}

// ---------------------------------------------------------------------------------------------------------------------
// the dispatcher's booth, the track gang's store
// ---------------------------------------------------------------------------------------------------------------------

function booth(c: Ctx): void {
  const { b } = c;
  const x0 = 188.5;
  const x1 = 194.5;
  const z0 = -144.5;
  const z1 = -139;
  const xc = (x0 + x1) / 2;
  const zc = (z0 + z1) / 2;
  const H = 2.75;
  const doorX = 189.95;
  groundRect(b, Z.wood, x0, z0, x1, z1, 0.03);
  // the north wall is boarded (the noticeboard hangs on it); the other three are glass above a boarded dado
  box(b, Z.green, xc, H / 2, z0 + 0.08, x1 - x0, H, 0.16);
  solid(c, xc, z0 + 0.08, x1 - x0, 0.2, H, 'zarya-booth', { kind: 'wall', surface: 'wood' });
  const glazed = (ax: number, az: number, bx: number, bz: number): void => {
    const len = Math.hypot(bx - ax, bz - az);
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const sz = (l: number, t: number): [number, number] => (alongX ? [l, t] : [t, l]);
    const put = (mat: THREE.Material, y: number, l: number, h: number, t: number, cast = false): void => {
      const [sx, szz] = sz(l, t);
      box(b, mat, mx, y, mz, sx, h, szz, 0, cast);
    };
    put(Z.green, 0.5, len, 1, 0.14, true);
    put(Z.cream, 1.03, len, 0.07, 0.22);
    put(Z.cream, H - 0.14, len, 0.28, 0.16);
    const n = Math.max(1, Math.round(len / 1.05));
    for (let k = 0; k <= n; k++) {
      const t = -len / 2 + (k * len) / n;
      box(b, Z.cream, alongX ? mx + t : mx, (1.06 + H - 0.28) / 2, alongX ? mz : mz + t, 0.07, H - 0.28 - 1.06, 0.07, 0, false);
    }
    put(Z.cream, 2.0, len, 0.05, 0.05);
    const [cw, cd] = sz(len, 0.16);
    solid(c, mx, mz, cw, cd, H, 'zarya-booth', { kind: 'wall', surface: 'glass' });
  };
  glazed(x0 + 0.08, z0, x0 + 0.08, z1);
  glazed(x1 - 0.08, z0, x1 - 0.08, z1);
  glazed(doorX + 0.85, z1 - 0.08, x1, z1 - 0.08);
  glazed(x0, z1 - 0.08, doorX - 0.85, z1 - 0.08);
  for (const [x, z] of [[x0 + 0.08, z0 + 0.08], [x1 - 0.08, z0 + 0.08], [x0 + 0.08, z1 - 0.08], [x1 - 0.08, z1 - 0.08], [doorX - 0.85, z1 - 0.08], [doorX + 0.85, z1 - 0.08]] as const) box(b, Z.cream, x, H / 2, z, 0.18, H, 0.18);
  box(b, Z.cream, doorX, H - 0.3, z1 - 0.08, 1.7, 0.6, 0.16, 0, false);
  // its door stands open against the wall beside it
  box(b, Z.green, doorX + 1.72, 0.52, z1 + 0.1, 1.6, 1, 0.06, 0, false);
  for (const [dx, w] of [[0.94, 0.07], [2.5, 0.07]] as const) box(b, Z.cream, doorX + dx, 1.1, z1 + 0.1, w, 2.15, 0.06, 0, false);
  box(b, Z.cream, doorX + 1.72, 2.14, z1 + 0.1, 1.6, 0.07, 0.06, 0, false);
  // the roof, its snow, the stove pipe through it, the horn on its corner
  box(b, Z.grey, xc, H + 0.07, zc, x1 - x0 + 1, 0.14, z1 - z0 + 1);
  groundRect(b, Z.cream, x0 + 0.16, z0 + 0.16, x1 - 0.16, z1 - 0.16, H - 0.02, 'down');
  box(b, Z.snow, xc, H + 0.27, zc, x1 - x0 + 0.9, 0.26, z1 - z0 + 0.9, 0, false);
  b.collide({ x: xc, z: zc, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y0: H, y1: H + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: xc, z: zc, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });
  cyl(b, Z.iron, 189.15, 0.03, -143.75, 0.28, 0.26, 0.85, 10);
  cyl(b, Z.iron, 189.15, 0.88, -143.75, 0.07, 0.07, 2.8, 6);
  cyl(b, Z.snow, 189.15, 3.68, -143.75, 0.13, 0.03, 0.12, 6, false);
  solid(c, 189.15, -143.75, 0.6, 0.6, 1, 'zarya-stove', { shots: false, kind: 'none', surface: 'metal' });
  // the desk along the east glass, looking out over the fan: the telephone, a lamp, the ledger, the board of lamps
  const dx = x1 - 0.66;
  box(b, Z.wood, dx, 0.8, zc - 0.1, 0.95, 0.07, 3.6);
  for (const s of [-1.7, 1.7]) box(b, Z.woodDark, dx, 0.39, zc - 0.1 + s, 0.85, 0.78, 0.08, 0, false);
  box(b, Z.woodDark, dx + 0.2, 0.5, zc - 0.1, 0.06, 0.5, 3.3, 0, false);
  solid(c, dx, zc - 0.1, 0.95, 3.6, 0.85, 'zarya-desk', { shots: false, kind: 'prop', surface: 'wood' });
  box(b, Z.black, dx, 0.89, -142.6, 0.24, 0.1, 0.2, 0, false);
  box(b, Z.black, dx, 0.97, -142.6, 0.07, 0.05, 0.3, 0, false);
  box(b, Z.white, dx - 0.1, 0.85, -141.9, 0.36, 0.03, 0.5, 0.1, false);
  cyl(b, Z.iron, dx + 0.2, 0.84, -143.2, 0.08, 0.06, 0.03, 8, false);
  cyl(b, Z.iron, dx + 0.2, 0.84, -143.2, 0.015, 0.015, 0.34, 4, false);
  cyl(b, Z.greenDark, dx + 0.2, 1.16, -143.2, 0.16, 0.05, 0.14, 8, false);
  ball(b, Z.bulb, dx + 0.2, 1.15, -143.2, 0.05);
  slab(b, Z.grey, dx + 0.22, 1.0, -141.0, 0.3, 0.36, 0.9, 0, 0, 0.5, false);
  for (let i = 0; i < 6; i++) ball(b, i === 2 ? Z.redLamp : Z.bulb, dx + 0.1 + (i % 2) * 0.12, 1.08 + (i % 2) * 0.07, -141.3 + Math.floor(i / 2) * 0.3, 0.03);
  // the meter's open case, where the meter lies (`tool`)
  const T = DEPOT.tool;
  box(b, Z.woodDark, T.x + 0.02, 0.86, T.z + 0.36, 0.34, 0.05, 0.24, 0.2, false);
  slab(b, Z.woodDark, T.x + 0.02, 0.98, T.z + 0.5, 0.34, 0.03, 0.24, -1.1, 0.2, 0, false);
  box(b, Z.red, T.x - 0.2, 0.845, T.z + 0.1, 0.05, 0.02, 0.2, 0.6, false);
  // a chair pushed back from it
  box(b, Z.woodDark, dx - 0.95, 0.45, -143.75, 0.44, 0.05, 0.44, 0.3);
  box(b, Z.woodDark, dx - 1.1, 0.75, -143.82, 0.05, 0.6, 0.44, 0.3, false);
  for (const [px, pz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]] as const) box(b, Z.woodDark, dx - 0.95 + px, 0.22, -143.75 + pz, 0.04, 0.44, 0.04, 0.3, false);
  // the noticeboard on the north wall: rotas and orders, and the route sheet (`sheet`)
  const S = DEPOT.sheet;
  box(b, Z.woodDark, 191.4, 1.65, z0 + 0.18, 3.5, 1.5, 0.04, 0, false);
  box(b, Z.woodPale, 191.4, 1.65, z0 + 0.2, 3.3, 1.3, 0.04, 0, false);
  for (let i = 0; i < 8; i++) box(b, i % 3 ? Z.white : Z.cream, 191.3 + (i % 4) * 0.56, 1.95 - Math.floor(i / 4) * 0.62, z0 + 0.23, 0.4, 0.52, 0.02, ((i * 37) % 7) * 0.02 - 0.06, false);
  box(b, Z.cream, S.x, 1.7, z0 + 0.235, 0.62, 0.86, 0.02, 0.03, false);
  for (let i = 0; i < 5; i++) box(b, i === 2 ? Z.red : Z.blue, S.x, 1.98 - i * 0.14, z0 + 0.25, 0.46 - (i % 2) * 0.1, 0.025, 0.01, 0.03, false);
  // a row of keys under it, the clock over it
  box(b, Z.woodDark, 192.6, 0.95, z0 + 0.19, 1.2, 0.3, 0.03, 0, false);
  for (let i = 0; i < 6; i++) box(b, C.yellow, 192.15 + i * 0.18, 0.92, z0 + 0.22, 0.03, 0.12, 0.02, 0, false);
  const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), Z.white);
  ck.rotation.x = Math.PI / 2;
  ck.position.set(193.5, 2.2, z0 + 0.2);
  ck.receiveShadow = true;
  b.add(ck, { cast: false });
  slab(b, Z.black, 193.5, 2.26, z0 + 0.235, 0.02, 0.12, 0.01, 0, 0, 0.03, false);
  slab(b, Z.black, 193.47, 2.28, z0 + 0.235, 0.015, 0.17, 0.01, 0, 0, 0.31, false);
  // a bare bulb
  cyl(b, Z.iron, xc, 2.45, zc, 0.015, 0.015, 0.3, 4, false);
  ball(b, Z.bulb, xc, 2.4, zc, 0.1);
  b.light({ x: xc, y: 2.2, z: zc, color: 0xffc98a, intensity: 16, distance: 13, mode: 'steady', pool: 4, weight: 1 });
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.06, 0.46, 10, 1, true), Z.grey);
  horn.position.set(x1 + 0.2, H + 0.75, z1 + 0.25);
  horn.rotation.set(Math.PI / 2, 0, -0.7, 'YXZ');
  horn.receiveShadow = true;
  b.add(horn, { cast: false });
  cyl(b, Z.iron, x1 + 0.2, H + 0.1, z1 + 0.25, 0.04, 0.04, 0.6, 5, false);
  // a bench against its west wall
  bench(c, x0 - 0.6, -140.4, Math.PI / 2);
}

function gangStore(c: Ctx): void {
  const { b } = c;
  const x0 = 196;
  const x1 = SH.x0;
  const z0 = SH.z0;
  const z1 = -177;
  const H = 3.4;
  const T = 0.4;
  const xc = (x0 + x1) / 2;
  const zc = (z0 + z1) / 2;
  wall(b, { x0, z0: z1 - T / 2, x1, z1: z1 - T / 2, height: H, thickness: T, material: 'brick', tag: 'zarya-gangstore', openings: [{ at: 4, width: 2.2, height: 2.5, kind: 'door' }] });
  wall(b, { x0, z0: z0 + T / 2, x1, z1: z0 + T / 2, height: H, thickness: T, material: 'brick', tag: 'zarya-gangstore' });
  wall(b, { x0: x0 + T / 2, z0: z0 + T, x1: x0 + T / 2, z1: z1 - T, height: H, thickness: T, material: 'brick', tag: 'zarya-gangstore' });
  groundRect(b, Z.concreteDark, x0 + T, z0 + T, x1, z1, 0.03);
  box(b, Z.concreteDark, xc - 0.2, H + 0.1, zc + 0.2, x1 - x0 + 0.5, 0.2, z1 - z0 + 0.5);
  box(b, Z.snow, xc - 0.2, H + 0.36, zc + 0.2, x1 - x0 + 0.4, 0.32, z1 - z0 + 0.4, 0, false);
  b.collide({ x: xc, z: zc, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y0: H, y1: H + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: xc, z: zc, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });
  // shelves along the west and north walls: boxes of spikes, bolts, fishplates (the nail strips are on the west run)
  const iron = [Z.iron, Z.steel, Z.grey, Z.woodPale, Z.redDark];
  shelves(c, x0 + T + 0.35, -182.3, 8.4, true, 91, { goods: iron, h: 2.4, rows: 4 });
  shelves(c, 201.3, z0 + T + 0.35, 5.6, false, 97, { goods: iron, h: 2.4, rows: 4 });
  // the bench along the sheds' wall: a vice, a lantern, the gang's tools hung over it
  box(b, Z.wood, x1 - 0.5, 0.9, -182.6, 0.9, 0.1, 4.4);
  for (const s of [-2.1, 0, 2.1]) box(b, Z.woodDark, x1 - 0.5, 0.43, -182.6 + s, 0.8, 0.86, 0.1, 0, false);
  box(b, Z.steel, x1 - 0.45, 1.06, -184.2, 0.26, 0.22, 0.3, 0, false);
  box(b, Z.iron, x1 - 0.5, 1.12, -181.4, 0.2, 0.34, 0.2, 0, false);
  ball(b, Z.bulb, x1 - 0.5, 1.14, -181.4, 0.07);
  box(b, Z.woodPale, x1 - 0.03, 2.05, -182.6, 0.05, 1.3, 3.6, 0, false);
  for (let i = 0; i < 9; i++) box(b, Z.iron, x1 - 0.07, 2.05 + ((i * 3) % 4) * 0.1, -184.2 + i * 0.4, 0.03, 0.5, 0.07, 0, false);
  solid(c, x1 - 0.5, -182.6, 0.9, 4.4, 1, 'zarya-workbench', { shots: false, kind: 'prop', surface: 'wood' });
  // kegs of spikes, a crate of strips by the shelves, sledges and bars stood in the corner, a coil of wire
  for (const [x, z] of [[202.6, -178.2], [203.3, -178.5], [203.6, -179.3]] as const) {
    cyl(b, Z.woodDark, x, 0.03, z, 0.26, 0.24, 0.55, 9);
    cyl(b, Z.iron, x, 0.56, z, 0.22, 0.22, 0.03, 9, false);
  }
  solid(c, 203.2, -178.7, 1.5, 1.5, 0.6, 'zarya-kegs', { shots: false, kind: 'none', surface: 'wood' });
  box(b, Z.woodPale, 197.75, 0.25, -178.6, 0.9, 0.5, 0.7, 0.15);
  goods(b, 197.75, 0.5, -178.6, 0.7, false, 5, { mats: [Z.steel, Z.iron], h: 0.1, d: 0.5 });
  solid(c, 197.75, -178.6, 0.9, 0.7, 0.55, 'zarya-crate', { shots: false, kind: 'none', surface: 'wood' });
  for (let i = 0; i < 4; i++) {
    slab(b, i % 2 ? Z.iron : Z.woodPale, 203.9, 0.8, -186.2 + i * 0.22, 0.045, 1.6, 0.045, 0, 0, -0.18, false);
    if (i % 2 === 0) box(b, Z.iron, 204.03, 1.56, -186.2 + i * 0.22, 0.12, 0.16, 0.26, 0, false);
  }
  cyl(b, Z.black, 202.3, 0.03, -180.6, 0.42, 0.42, 0.16, 12);
  cyl(b, Z.concreteDark, 202.3, 0.04, -180.6, 0.24, 0.24, 0.16, 10, false);
  cyl(b, Z.iron, xc, H - 0.5, -182.4, 0.015, 0.015, 0.5, 4, false);
  ball(b, Z.bulb, xc, H - 0.56, -182.4, 0.1);
  b.light({ x: xc, y: 2.6, z: -182.4, color: 0xffc98a, intensity: 16, distance: 13, mode: 'steady', pool: 4, weight: 1 });
  // outside: a lamp over the door, lengths of rail and a barrow by the wall
  box(b, Z.iron, 200, 3, z1 + 0.25, 0.06, 0.06, 0.5, 0, false);
  ball(b, Z.bulb, 200, 2.92, z1 + 0.5, 0.13);
  b.glow({ x: 200, y: 2.92, z: z1 + 0.5, color: 0xffb060, size: 0.9, intensity: 2, mode: 'steady' });
  for (let i = 0; i < 4; i++) box(b, Z.steel, 197 + (i % 2) * 0.1, 0.1 + Math.floor(i / 2) * 0.16, z1 + 0.5 + (i % 2) * 0.22, 1.8, 0.14, 0.12, 0.02 * i, false);
  box(b, Z.snow, 197.05, 0.36, z1 + 0.6, 1.7, 0.08, 0.4, 0, false);
  solid(c, 197.05, z1 + 0.6, 1.9, 0.5, 0.4, 'zarya-rails', { shots: false, kind: 'none', surface: 'metal' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the street: the Okhotnik, the canteen and its fire board, the garage and the woodshed
// ---------------------------------------------------------------------------------------------------------------------

/** Antlers mounted on a wall that looks south: a plaque, a cap of bone, two beams with their tines. */
function antlers(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, s = 1): void {
  box(b, Z.woodDark, x, y, z, 0.36 * s, 0.46 * s, 0.04, 0, false);
  blob(b, Z.cream, x, y + 0.02 * s, z + 0.05, 0.09 * s, 1, 1.2, 0.7);
  for (const k of [-1, 1]) {
    slab(b, mat, x + k * 0.3 * s, y + 0.34 * s, z + 0.09, 0.05 * s, 0.8 * s, 0.05 * s, 0, 0, -k * 0.75, false);
    for (let i = 0; i < 3; i++) slab(b, mat, x + k * (0.23 + i * 0.14) * s, y + (0.4 + i * 0.145) * s, z + 0.09, 0.035 * s, 0.3 * s, 0.035 * s, 0, 0, k * 0.2, false);
  }
}

/** A snowshoe hung flat on a wall: looking south, or east (`faceX`). */
function snowshoe(b: LevelBuilder, x: number, y: number, z: number, faceX: boolean): void {
  for (const [mat, r, out] of [[Z.woodPale, 0.2, 0], [Z.woodDark, 0.16, 0.012]] as const) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 12), mat);
    if (faceX) {
      m.rotation.z = Math.PI / 2;
      m.scale.set(2.3, 1, 1);
    } else {
      m.rotation.x = Math.PI / 2;
      m.scale.set(1, 1, 2.3);
    }
    m.position.set(x + (faceX ? out : 0), y, z + (faceX ? 0 : out));
    m.receiveShadow = true;
    b.add(m, { cast: false });
  }
  box(b, Z.woodPale, x, y - 0.56, z, 0.04, 0.24, 0.04, 0, false);
}

/** A long gun stood in a rack against a wall that looks south. */
function longGun(b: LevelBuilder, x: number, y: number, z: number, stock: THREE.Material, double: boolean): void {
  slab(b, stock, x, y + 0.27, z + 0.03, 0.08, 0.56, 0.13, -0.1, 0, 0, false);
  box(b, Z.iron, x, y + 0.6, z, 0.06, 0.16, 0.08, 0, false);
  box(b, Z.iron, x - (double ? 0.022 : 0), y + 1.02, z - 0.03, 0.035, 0.74, 0.035, 0, false);
  if (double) box(b, Z.iron, x + 0.022, y + 1.02, z - 0.03, 0.035, 0.74, 0.035, 0, false);
}

/** A stuffed capercaillie on a perch, its beak to the east. `y` is the perch. */
function bird(b: LevelBuilder, x: number, y: number, z: number): void {
  drum(b, Z.woodDark, x, y - 0.03, z, 0.03, 0.5, false, 5, false);
  for (const s of [-1, 1]) box(b, Z.woodDark, x + s * 0.2, y - 0.2, z, 0.04, 0.34, 0.04, 0, false);
  blob(b, C.feather, x - 0.02, y + 0.2, z, 0.17, 1.5, 1, 0.9);
  blob(b, Z.greenDark, x + 0.2, y + 0.4, z, 0.085);
  box(b, C.yellow, x + 0.3, y + 0.39, z, 0.07, 0.035, 0.035, 0, false);
  box(b, Z.red, x + 0.22, y + 0.455, z, 0.06, 0.03, 0.15, 0, false);
  for (let i = -2; i <= 2; i++) slab(b, i % 2 ? Z.black : C.feather, x - 0.32, y + 0.36, z + i * 0.075, 0.03, 0.38, 0.08, i * 0.2, 0, 0.5, false);
}

function okhotnik(c: Ctx): void {
  const { b } = c;
  const x0 = 158;
  const x1 = 174;
  const z0 = -109;
  const z1 = FRONT;
  const H = 3.3;
  const T = 0.4;
  const xc = (x0 + x1) / 2;
  const zc = (z0 + z1) / 2;
  const winX = 163;
  const winW = 7.2;
  const doorX = 170.5;
  // ---- the shell: boarded walls, a wide display window and the door in the street front ----
  wall(b, { x0, z0: z1 - T / 2, x1, z1: z1 - T / 2, height: H, thickness: T, material: 'wood', tag: 'zarya-okhotnik', openings: [{ at: winX - x0, width: winW, height: 2.75, kind: 'door' }, { at: doorX - x0, width: 1.8, height: 2.3, kind: 'door' }] });
  wall(b, { x0, z0: z0 + T / 2, x1, z1: z0 + T / 2, height: H, thickness: T, material: 'wood', tag: 'zarya-okhotnik' });
  for (const x of [x0 + T / 2, x1 - T / 2]) wall(b, { x0: x, z0: z0 + T, x1: x, z1: z1 - T, height: H, thickness: T, material: 'wood', tag: 'zarya-okhotnik' });
  // the window: a low wall under it, its bars, and glass nobody walks through (you see the shop through it)
  addBox(b, 'wood', winX, 0.4, z1 - T / 2, winW, 0.8, T);
  box(b, Z.woodPale, winX, 0.83, z1 - T / 2, winW, 0.06, T + 0.24, 0, false);
  box(b, Z.snow, winX, 0.9, z1 + 0.07, winW, 0.08, 0.14, 0, false);
  for (const k of [1, 2]) box(b, Z.woodDark, winX - winW / 2 + (k * winW) / 3, 1.8, z1 - T / 2, 0.08, 1.9, 0.1, 0, false);
  box(b, Z.woodDark, winX, 2.25, z1 - T / 2, winW, 0.06, 0.08, 0, false);
  b.collide({ x: winX, z: z1 - T / 2, hx: winW / 2, hz: T / 2, y1: 2.75, mapKind: 'none', surface: 'glass', tag: 'window' });
  groundRect(b, Z.wood, x0 + T, z0 + T, x1 - T, z1, 0.03);
  groundRect(b, Z.woodPale, x0 + T, z0 + T, x1 - T, z1 - T, H - 0.02, 'down');
  box(b, Z.woodDark, xc, H + 0.1, zc, x1 - x0 + 1, 0.2, z1 - z0 + 1.2);
  box(b, Z.snow, xc, H + 0.37, zc, x1 - x0 + 0.9, 0.34, z1 - z0 + 1.1, 0, false);
  b.collide({ x: xc, z: zc, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y0: H, y1: H + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: xc, z: zc, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });
  // the sign over the window (no words: antlers and a fish), real antlers over the door, a lamp, the step
  box(b, Z.greenDark, winX, H + 0.95, z1 + 0.5, 8, 1.1, 0.12);
  box(b, Z.snow, winX, H + 1.55, z1 + 0.5, 8.1, 0.12, 0.26, 0, false);
  for (const s of [-1, 1]) box(b, Z.woodDark, winX + s * 3.6, H + 0.6, z1 + 0.42, 0.14, 0.5, 0.14, 0, false);
  antlers(b, C.yellow, winX - 1.6, H + 0.72, z1 + 0.57, 1.05);
  blob(b, C.yellow, winX + 1.7, H + 0.95, z1 + 0.57, 0.26, 2.6, 0.8, 0.2);
  for (const s of [-1, 1]) slab(b, C.yellow, winX + 2.5, H + 0.95 + s * 0.14, z1 + 0.57, 0.34, 0.1, 0.04, 0, 0, s * 0.6, false);
  antlers(b, Z.cream, doorX, 2.72, z1 + 0.04, 0.9);
  box(b, Z.iron, x1 - 1.4, 2.95, z1 + 0.3, 0.06, 0.06, 0.6, 0, false);
  cyl(b, Z.greenDark, x1 - 1.4, 2.7, z1 + 0.56, 0.3, 0.06, 0.18, 10, false);
  ball(b, Z.bulb, x1 - 1.4, 2.68, z1 + 0.56, 0.13);
  b.glow({ x: x1 - 1.4, y: 2.66, z: z1 + 0.58, color: 0xffb060, size: 1, intensity: 2.2, mode: 'steady' });
  box(b, Z.concrete, doorX, 0.06, z1 + 0.55, 2.4, 0.12, 1.1, 0, false);
  // the door stands open, pushed in against the wall
  box(b, Z.woodDark, doorX + 0.96, 1.13, z1 - T - 0.86, 0.06, 2.2, 1.7);
  box(b, Z.woodPale, doorX + 0.92, 1.5, z1 - T - 0.86, 0.02, 0.8, 1.1, 0, false);
  solid(c, doorX + 0.96, z1 - T - 0.86, 0.12, 1.7, 2.2, 'zarya-door', { shots: false, kind: 'none', surface: 'wood' });
  // the stove pipe
  cyl(b, Z.iron, 172.8, H + 0.2, -107.7, 0.11, 0.11, 1.5, 6);
  cyl(b, Z.snow, 172.8, H + 1.7, -107.7, 0.17, 0.03, 0.14, 6, false);

  // ---- the window display (seen from the street): snowshoes, the stuffed bird, the blade's stand, tins and reels ----
  const dz = z1 - T - 0.5;
  box(b, Z.woodPale, winX, 0.4, dz, winW - 0.2, 0.8, 0.9);
  box(b, Z.redDark, winX, 0.81, dz, winW - 0.3, 0.02, 0.82, 0, false);
  solid(c, winX, dz, winW - 0.2, 0.9, 0.82, 'zarya-display', { shots: false, kind: 'none', surface: 'wood' });
  box(b, Z.woodDark, 160.3, 1.45, dz - 0.3, 1.3, 1.3, 0.05, 0, false);
  snowshoe(b, 160.0, 1.55, dz - 0.26, false);
  snowshoe(b, 160.6, 1.5, dz - 0.26, false);
  bird(b, 161.9, 1.22, dz);
  const K = DEPOT.blade;
  slab(b, Z.greenDark, K.x, 0.93, K.z - 0.05, 0.7, 0.03, 0.36, 0.5, 0, 0, false);
  for (const s of [-1, 1]) box(b, C.yellow, K.x + s * 0.2, 0.9, K.z + 0.1, 0.03, 0.08, 0.03, 0, false);
  goods(b, 166, 0.82, dz + 0.1, 1.2, false, 7, { mats: [Z.red, C.yellow, Z.greenDark], h: 0.14, d: 0.16 });
  box(b, Z.iron, 165.6, 0.98, dz - 0.25, 0.16, 0.32, 0.16, 0, false);
  ball(b, Z.bulb, 165.6, 0.98, dz - 0.25, 0.06);
  // a decoy duck, a coil of line
  blob(b, C.feather, 163.2, 0.92, dz - 0.05, 0.13, 1.5, 0.8, 0.9);
  blob(b, Z.greenDark, 163.38, 1.03, dz - 0.05, 0.06);
  cyl(b, Z.cream, 163.9, 0.82, dz + 0.2, 0.1, 0.1, 0.05, 8, false);

  // ---- the counter across the shop, and what hangs behind the shopkeeper ----
  counter(c, 164.3, -104.4, 11.4, false, 61, { goods: [C.yellow, Z.red, Z.greenDark, Z.steel] });
  box(b, Z.woodPale, 170.03, 1.42, -104.4, 0.05, 0.84, 0.76, 0, false);
  // the till, a scale, boxes of cartridges
  box(b, Z.iron, 169, 1.2, -104.5, 0.46, 0.34, 0.4);
  box(b, Z.iron, 169, 1.1, -104.22, 0.46, 0.14, 0.2, 0, false);
  box(b, Z.iron, 160.2, 1.07, -104.4, 0.34, 0.1, 0.24, 0, false);
  cyl(b, C.yellow, 160.2, 1.22, -104.4, 0.16, 0.1, 0.05, 10, false);
  cyl(b, Z.iron, 160.2, 1.1, -104.4, 0.02, 0.02, 0.12, 4, false);
  for (let i = 0; i < 6; i++) box(b, i % 2 ? Z.red : C.yellow, 162.6 + (i % 3) * 0.2, 1.07 + Math.floor(i / 3) * 0.09, -104.5, 0.17, 0.08, 0.12, 0, false);
  // the rack of long guns on the north wall, antlers over it
  const nz = z0 + T;
  box(b, Z.woodDark, 162.1, 1.6, nz + 0.03, 6.5, 1.8, 0.05, 0, false);
  box(b, Z.green, 162.1, 1.6, nz + 0.05, 6.3, 1.6, 0.03, 0, false);
  box(b, Z.wood, 162.1, 0.86, nz + 0.14, 6.4, 0.14, 0.28);
  box(b, Z.wood, 162.1, 1.95, nz + 0.1, 6.4, 0.08, 0.16, 0, false);
  for (let i = 0; i < 8; i++) longGun(b, 159.5 + i * 0.74, 0.93, nz + 0.14, i % 3 === 1 ? Z.woodDark : Z.wood, i % 4 === 2);
  antlers(b, Z.cream, 162.1, 2.62, nz + 0.03, 1.25);
  // the crossbow on its board
  box(b, Z.woodPale, 171, 1.9, nz + 0.03, 1.5, 1.3, 0.04, 0, false);
  box(b, Z.wood, 171, 1.9, nz + 0.08, 1, 0.08, 0.06, 0, false);
  box(b, Z.wood, 171.4, 1.82, nz + 0.08, 0.26, 0.2, 0.06, 0, false);
  for (const s of [-1, 1]) slab(b, Z.iron, 170.68, 1.9 + s * 0.24, nz + 0.08, 0.54, 0.05, 0.04, 0, 0, s * 1.09, false);
  box(b, Z.black, 170.81, 1.9, nz + 0.08, 0.012, 0.96, 0.012, 0, false);
  box(b, Z.iron, 170.48, 1.9, nz + 0.08, 0.08, 0.16, 0.04, 0, false);
  // shelves of cartridges and tins between them, the stove in the corner
  shelves(c, 167.6, nz + 0.3, 3.2, false, 63, { goods: [Z.red, C.yellow, Z.greenDark, Z.orange], h: 2.4, rows: 4, goodsH: 0.22 });
  cyl(b, Z.iron, 172.8, 0.03, -107.7, 0.33, 0.3, 0.9, 10);
  cyl(b, Z.iron, 172.8, 0.93, -107.7, 0.1, 0.1, H - 0.9, 6, false);
  box(b, Z.black, 172.8, 0.45, -107.36, 0.22, 0.2, 0.03, 0, false);
  solid(c, 172.8, -107.7, 0.7, 0.7, 1, 'zarya-stove', { shots: false, kind: 'none', surface: 'metal' });

  // ---- the customers' side: snowshoes and a pike on the west wall, boots under them, rods along the east wall ----
  const wx = x0 + T;
  for (const z of [-102.9, -102.3]) snowshoe(b, wx + 0.03, 1.95, z, true);
  for (const z of [-101.4, -100.8]) snowshoe(b, wx + 0.03, 1.85, z, true);
  box(b, Z.woodDark, wx + 0.03, 2.2, -99.4, 0.04, 0.5, 1.3, 0, false);
  blob(b, Z.grey, wx + 0.1, 2.2, -99.4, 0.14, 0.4, 0.9, 3.6);
  slab(b, Z.grey, wx + 0.1, 2.2, -98.84, 0.03, 0.3, 0.2, 0, 0, 0, false);
  box(b, Z.wood, wx + 0.3, 0.42, -101.8, 0.4, 0.06, 3);
  for (const s of [-1.4, 1.4]) box(b, Z.woodDark, wx + 0.3, 0.2, -101.8 + s, 0.36, 0.4, 0.06, 0, false);
  for (let i = 0; i < 5; i++) for (const s of [0, 0.2]) box(b, i % 2 ? Z.black : Z.greenDark, wx + 0.28, 0.66, -103 + i * 0.55 + s, 0.3, 0.42, 0.14, 0, false);
  solid(c, wx + 0.3, -101.8, 0.5, 3, 0.9, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
  const ex = x1 - T;
  box(b, Z.woodDark, ex - 0.12, 1.6, -101.6, 0.1, 0.06, 3.4, 0, false);
  box(b, Z.woodDark, ex - 0.24, 0.12, -101.6, 0.44, 0.24, 3.4);
  for (let i = 0; i < 10; i++) {
    slab(b, i % 3 ? Z.woodPale : Z.black, ex - 0.2, 1.42, -103.1 + i * 0.33, 0.025, 2.6, 0.025, 0, 0, -0.04, false);
    if (i % 2 === 0) drum(b, C.yellow, ex - 0.26, 0.8, -103.1 + i * 0.33, 0.045, 0.05, false, 6, false);
  }
  solid(c, ex - 0.24, -101.6, 0.5, 3.4, 2, 'zarya-rods', { kind: 'none', surface: 'wood' });
  // a rug, two lamps on cords
  groundRect(b, Z.redDark, 162, -102.8, 168.4, -99.6, 0.04);
  for (const x of [162, 168]) {
    cyl(b, Z.iron, x, 2.6, -101.6, 0.015, 0.015, H - 2.6, 4, false);
    cyl(b, Z.greenDark, x, 2.46, -101.6, 0.3, 0.06, 0.16, 10, false);
    ball(b, Z.bulb, x, 2.44, -101.6, 0.1);
  }
  b.light({ x: 165, y: 2.4, z: -101.6, color: 0xffc27a, intensity: 24, distance: 16, mode: 'steady', pool: 5, weight: 1.1 });

  // ---- outside: firewood stacked against the back wall, a sledge left under the window ----
  box(b, C.log, 163.5, 0.6, z0 - 0.42, 6, 1.2, 0.8);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) drum(b, C.logEnd, 160.7 + i * 0.37 + (j % 2) * 0.18, 0.16 + j * 0.3, z0 - 0.84, 0.14, 0.04, true, 7, false);
  box(b, Z.snow, 163.5, 1.26, z0 - 0.42, 6.1, 0.14, 0.9, 0, false);
  solid(c, 163.5, z0 - 0.42, 6, 0.9, 1.3, 'zarya-wood', { shots: false, kind: 'none', surface: 'wood' });
  // on the alley wall: skis nailed up crossed, dustbins under their lids of snow
  for (const s of [-1, 1]) slab(b, s > 0 ? Z.red : Z.blue, x1 + 0.04, 1.9, -103.5, 0.03, 2.1, 0.1, s * 0.5, 0, 0, false);
  for (const z of [-106.6, -107.5]) {
    cyl(b, Z.grey, x1 + 0.45, 0, z, 0.3, 0.34, 0.8, 9);
    cyl(b, Z.snow, x1 + 0.45, 0.8, z, 0.36, 0.2, 0.14, 9, false);
  }
  solid(c, x1 + 0.45, -107.05, 0.7, 1.6, 0.9, 'zarya-bins', { shots: false, kind: 'none', surface: 'metal' });
  // on the west wall: a sledge hung on its pegs
  for (const s of [-1, 1]) box(b, Z.wood, x0 - 0.05, 1.5 + s * 0.22, -103, 0.04, 0.05, 1.5, 0, false);
  for (let i = 0; i < 4; i++) box(b, Z.woodPale, x0 - 0.08, 1.5, -103.55 + i * 0.37, 0.03, 0.5, 0.1, 0, false);
  for (const s of [-1, 1]) box(b, Z.iron, 166.2, 0.07, z1 + 1 + s * 0.2, 1.1, 0.04, 0.04, 0.3, false);
  box(b, Z.woodPale, 166.2, 0.2, z1 + 1, 1, 0.04, 0.46, 0.3, false);
  for (const s of [-1, 1]) box(b, Z.woodDark, 166.2 + s * 0.3, 0.13, z1 + 1 - s * 0.09, 0.04, 0.12, 0.44, 0.3, false);
}

function canteen(c: Ctx): void {
  const { b } = c;
  const x0 = 182;
  const x1 = 208;
  const z0 = -109;
  const z1 = FRONT;
  const H = 4.6;
  const xc = (x0 + x1) / 2;
  const zc = (z0 + z1) / 2;
  box(b, C.ochre, xc, H / 2, zc, x1 - x0, H, z1 - z0);
  box(b, Z.concreteDark, xc, 0.4, zc, x1 - x0 + 0.16, 0.8, z1 - z0 + 0.16, 0, false);
  box(b, Z.cream, xc, H - 0.16, zc, x1 - x0 + 0.3, 0.32, z1 - z0 + 0.3, 0, false);
  box(b, Z.snow, xc, H + 0.17, zc, x1 - x0 + 0.5, 0.34, z1 - z0 + 0.5, 0, false);
  for (const [x, z] of [[188, -105], [201.5, -106.5]] as const) {
    box(b, C.brick, x, H + 0.9, z, 0.9, 1.2, 0.9);
    box(b, Z.snow, x, H + 1.56, z, 1.05, 0.14, 1.05, 0, false);
  }
  solid(c, xc, zc, x1 - x0, z1 - z0, H, 'zarya-canteen', { kind: 'building' });
  // the street front: two long windows (lace to the middle of them, people asleep at the tables), the door, the fire board
  litWindow(b, 186, 1, z1, 5.2, 2.2, 0, 1, { curtain: true, heads: [-1.7, 0.4, 1.5] });
  litWindow(b, 191.9, 1, z1, 4.6, 2.2, 0, 1, { curtain: true, heads: [-1.2, 1.3] });
  const dx = 196.5;
  box(b, Z.white, dx, 1.3, z1 + 0.03, 2.3, 2.6, 0.08, 0, false);
  for (const s of [-1, 1]) {
    box(b, Z.woodDark, dx + s * 0.5, 1.2, z1 + 0.07, 0.96, 2.3, 0.06, 0, false);
    box(b, Z.warm, dx + s * 0.5, 1.7, z1 + 0.1, 0.5, 0.7, 0.03, 0, false);
    box(b, C.yellow, dx + s * 0.08, 1.15, z1 + 0.13, 0.04, 0.3, 0.05, 0, false);
  }
  box(b, Z.concrete, dx, 0.09, z1 + 0.7, 3, 0.18, 1.4, 0, false);
  box(b, Z.concrete, dx, 2.85, z1 + 0.75, 3.2, 0.14, 1.5);
  box(b, Z.snow, dx, 3.02, z1 + 0.75, 3.3, 0.22, 1.6, 0, false);
  for (const s of [-1, 1]) slab(b, Z.iron, dx + s * 1.5, 2.45, z1 + 0.6, 0.05, 1.3, 0.05, 0.95, 0, 0, false);
  // its sign: a plate, a knife and a fork on a blue board
  box(b, Z.blue, dx, 3.75, z1 + 0.06, 2.6, 0.9, 0.08, 0, false);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), Z.white);
  plate.rotation.x = Math.PI / 2;
  plate.position.set(dx, 3.75, z1 + 0.11);
  plate.receiveShadow = true;
  b.add(plate, { cast: false });
  for (const s of [-1, 1]) box(b, Z.white, dx + s * 0.6, 3.75, z1 + 0.11, 0.06, 0.62, 0.02, 0, false);
  for (const k of [-0.08, 0, 0.08]) box(b, Z.white, dx - 0.6 + k, 4, z1 + 0.11, 0.03, 0.2, 0.02, 0, false);
  box(b, Z.iron, dx + 1.75, 3.3, z1 + 0.25, 0.05, 0.05, 0.5, 0, false);
  ball(b, Z.bulb, dx + 1.75, 3.2, z1 + 0.5, 0.15);
  b.light({ x: dx + 1.75, y: 3.2, z: z1 + 0.9, color: 0xffb46a, intensity: 26, distance: 18, mode: 'steady', pool: 6, glow: 1, weight: 1.1 });
  // the yard side: the kitchen's small windows, the back door, crates and churns beside it
  for (const [x, heads] of [[185.5, [0.2]], [190, []], [194.5, [-0.3]], [199, []]] as const) litWindow(b, x, 1.5, z0, 1.7, 1.4, 0, -1, { heads });
  box(b, Z.white, 204, 1.15, z0 - 0.03, 1.4, 2.3, 0.08, 0, false);
  box(b, Z.woodDark, 204, 1.08, z0 - 0.07, 1.1, 2.1, 0.06, 0, false);
  box(b, Z.concrete, 204, 0.08, z0 - 0.5, 1.8, 0.16, 1, 0, false);
  box(b, Z.iron, 204, 2.75, z0 - 0.25, 0.05, 0.05, 0.5, 0, false);
  ball(b, Z.bulb, 204, 2.66, z0 - 0.5, 0.12);
  b.glow({ x: 204, y: 2.66, z: z0 - 0.52, color: 0xffb060, size: 0.9, intensity: 2, mode: 'steady' });
  for (const [x, z] of [[205.6, -109.6], [206.2, -109.75], [205.9, -110.3]] as const) {
    cyl(b, Z.grey, x, 0.03, z, 0.19, 0.19, 0.5, 9);
    cyl(b, Z.grey, x, 0.53, z, 0.19, 0.1, 0.14, 9, false);
    cyl(b, Z.grey, x, 0.67, z, 0.12, 0.12, 0.05, 9, false);
  }
  solid(c, 205.9, -109.9, 1.1, 1.1, 0.7, 'zarya-churns', { shots: false, kind: 'none', surface: 'metal' });
  crate(c, 201.6, -109.8, 0.9, 0.1, 2);
  crate(c, 200.5, -109.7, 0.8, -0.15);
  // the alley side, a window and a drain pipe
  litWindow(b, x0, 1.4, -103, 1.8, 1.6, -1, 0, { curtain: true });
  cyl(b, Z.iron, x0 - 0.12, 0, z1 - 0.5, 0.07, 0.07, H, 6);
  blob(b, Z.ice, x0 - 0.2, 0.06, z1 - 0.3, 0.5, 1, 0.12, 1.3, 9);
}

/** The red fire board on the canteen's street wall: buckets, a shovel, a hook, and the axe's place behind a padlocked bar. */
function fireBoard(c: Ctx): void {
  const { b } = c;
  const F = DEPOT.fireBoard;
  const z = FRONT;
  const x = F.x - 1;
  box(b, Z.white, x, 1.8, z + 0.03, 3.5, 2.2, 0.06, 0, false);
  box(b, Z.red, x, 1.8, z + 0.07, 3.3, 2, 0.05, 0, false);
  slab(b, Z.redDark, x, 3.02, z + 0.3, 3.8, 0.06, 0.7, 0.35, 0, 0, false);
  slab(b, Z.snow, x, 3.1, z + 0.3, 3.7, 0.1, 0.66, 0.35, 0, 0, false);
  for (const dx of [-1.2, -0.66]) {
    cyl(b, Z.redDark, x + dx, 1.3, z + 0.3, 0.03, 0.17, 0.38, 10, false);
    box(b, Z.iron, x + dx, 1.74, z + 0.22, 0.3, 0.025, 0.025, 0, false);
    box(b, Z.iron, x + dx, 1.8, z + 0.14, 0.04, 0.14, 0.1, 0, false);
  }
  box(b, Z.woodPale, x - 0.08, 2, z + 0.15, 0.045, 1.1, 0.045, 0, false);
  box(b, Z.iron, x - 0.08, 1.3, z + 0.15, 0.25, 0.34, 0.03, 0, false);
  box(b, Z.iron, x + 0.35, 1.8, z + 0.15, 0.03, 1.5, 0.03, 0, false);
  slab(b, Z.iron, x + 0.42, 2.5, z + 0.15, 0.2, 0.03, 0.03, 0, 0, -0.7, false);
  // where the axe hangs (the story draws it): two pegs, the bar across it, the padlock
  for (const y of [1.4, 2.3]) box(b, Z.iron, F.x, y, z + 0.14, 0.1, 0.05, 0.1, 0, false);
  // the axe on its pegs behind the bar (it was only a place before, which the board's padlock made no sense of): a
  // pale haft, a dark head with a bright edge and a pick behind, against the red (taking it leaves the board as it
  // is: the axe can be taken again)
  box(b, Z.woodPale, F.x, 1.8, z + 0.19, 0.06, 1.06, 0.04, 0, false);
  box(b, Z.iron, F.x + 0.12, 2.22, z + 0.19, 0.3, 0.16, 0.05, 0, false);
  box(b, Z.white, F.x + 0.29, 2.22, z + 0.19, 0.05, 0.22, 0.045, 0, false);
  slab(b, Z.iron, F.x - 0.13, 2.2, z + 0.19, 0.22, 0.06, 0.045, 0, 0, 0.25, false);
  box(b, Z.iron, F.x, 1.85, z + 0.24, 0.96, 0.08, 0.03, 0, false);
  for (const s of [-1, 1]) box(b, Z.iron, F.x + s * 0.48, 1.85, z + 0.16, 0.06, 0.18, 0.16, 0, false);
  box(b, C.yellow, F.x + 0.48, 1.7, z + 0.26, 0.11, 0.13, 0.05, 0, false);
  box(b, Z.steel, F.x + 0.48, 1.79, z + 0.26, 0.07, 0.06, 0.02, 0, false);
  // the sand chest under it, a red lamp over it
  box(b, Z.red, x - 0.75, 0.36, z + 0.42, 1.3, 0.72, 0.7);
  box(b, Z.snow, x - 0.75, 0.77, z + 0.42, 1.34, 0.1, 0.74, 0, false);
  solid(c, x - 0.75, z + 0.42, 1.3, 0.7, 0.8, 'zarya-sandchest', { shots: false, kind: 'none', surface: 'wood' });
  box(b, Z.iron, x, 3.5, z + 0.2, 0.05, 0.05, 0.4, 0, false);
  ball(b, Z.redLamp, x, 3.44, z + 0.42, 0.11);
  b.glow({ x, y: 3.44, z: z + 0.44, color: 0xff3020, size: 0.9, intensity: 2, mode: 'steady' });
}

function garage(c: Ctx): void {
  const { b } = c;
  // ---- the garage: brick, two pairs of plank doors on the street ----
  const x0 = 216;
  const x1 = 232;
  const z0 = -109;
  const H = 4.2;
  const xc = (x0 + x1) / 2;
  const zc = (z0 + FRONT) / 2;
  addBox(b, 'brick', xc, H / 2, zc, x1 - x0, H, FRONT - z0);
  box(b, Z.concreteDark, xc, 0.35, zc, x1 - x0 + 0.14, 0.7, FRONT - z0 + 0.14, 0, false);
  box(b, Z.concrete, xc, H + 0.1, zc, x1 - x0 + 0.5, 0.2, FRONT - z0 + 0.5);
  box(b, Z.snow, xc, H + 0.36, zc, x1 - x0 + 0.4, 0.32, FRONT - z0 + 0.4, 0, false);
  solid(c, xc, zc, x1 - x0, FRONT - z0, H, 'zarya-garage', { kind: 'building' });
  for (const x of [220, 228]) {
    box(b, Z.concrete, x, 3.42, FRONT + 0.04, 4.9, 0.3, 0.12, 0, false);
    for (const s of [-1, 1]) {
      box(b, C.doorGreen, x + s * 1.1, 1.65, FRONT + 0.05, 2.16, 3.2, 0.1, 0, false);
      for (const y of [0.6, 1.7, 2.8]) box(b, Z.iron, x + s * 1.1, y, FRONT + 0.11, 2.1, 0.1, 0.03, 0, false);
      box(b, Z.black, x + s * 1.1, 2.3, FRONT + 0.11, 0.7, 0.5, 0.02, 0, false);
    }
    slab(b, Z.snow, x, 0.2, FRONT + 0.7, 4.4, 0.5, 1.2, 0.3, 0, 0, false);
  }
  box(b, Z.iron, xc, 3.9, FRONT + 0.25, 0.05, 0.05, 0.5, 0, false);
  ball(b, Z.bulb, xc, 3.8, FRONT + 0.5, 0.14);
  b.glow({ x: xc, y: 3.8, z: FRONT + 0.52, color: 0xffb060, size: 1, intensity: 2.2, mode: 'steady' });
  for (let i = 0; i < 3; i++) cyl(b, Z.black, 216.7, 0.03 + i * 0.26, FRONT + 0.6, 0.44, 0.44, 0.24, 12);
  solid(c, 216.7, FRONT + 0.6, 0.9, 0.9, 0.8, 'zarya-tyres', { shots: false, kind: 'none' });
  // the yard side: two dark windows, an oil tank on trestles
  for (const x of [220, 228]) {
    box(b, Z.black, x, 2.6, z0 - 0.03, 2, 1, 0.05, 0, false);
    box(b, Z.concrete, x, 2.04, z0 - 0.08, 2.3, 0.1, 0.18, 0, false);
    box(b, Z.snow, x, 2.12, z0 - 0.1, 2.2, 0.07, 0.14, 0, false);
    for (const k of [-0.5, 0, 0.5]) box(b, Z.iron, x + k, 2.6, z0 - 0.06, 0.05, 1, 0.03, 0, false);
  }
  drum(b, Z.grey, 224, 1.2, z0 - 1, 0.6, 3, false, 12);
  box(b, Z.snow, 224, 1.76, z0 - 1, 2.8, 0.12, 0.7, 0, false);
  for (const s of [-1, 1]) box(b, Z.iron, 224 + s, 0.3, z0 - 1, 0.14, 0.6, 1.1);
  solid(c, 224, z0 - 1, 3, 1.2, 1.8, 'zarya-tank', { kind: 'none', surface: 'metal' });

  // ---- the woodshed: a roof on posts, cut logs stacked to the rafters ----
  const wx0 = x1;
  const wx1 = 244.2;
  const wz0 = -108;
  const wz1 = FRONT - 1;
  const wxc = (wx0 + wx1) / 2;
  const wzc = (wz0 + wz1) / 2;
  box(b, Z.wood, wxc, 1.4, wz0 + 0.08, wx1 - wx0, 2.8, 0.16);
  for (const x of [wx0 + 0.15, wx0 + 4.1, wx0 + 8.1, wx1 - 0.15]) box(b, Z.woodDark, x, 1.5, wz1 - 0.1, 0.2, 3, 0.2);
  slab(b, Z.woodDark, wxc, 3.0, wzc, wx1 - wx0 + 0.6, 0.12, wz1 - wz0 + 1.2, -0.06, 0, 0);
  slab(b, Z.snow, wxc, 3.22, wzc, wx1 - wx0 + 0.5, 0.3, wz1 - wz0 + 1.1, -0.06, 0, 0, false);
  for (const [sx0, sx1, rows] of [[wx0 + 0.4, wx0 + 3.9, 7], [wx0 + 4.4, wx0 + 7.9, 5], [wx0 + 8.4, wx1 - 0.4, 8]] as const) {
    const h = rows * 0.3 + 0.05;
    box(b, C.log, (sx0 + sx1) / 2, h / 2, wz1 - 1.3, sx1 - sx0, h, 1.6);
    for (let j = 0; j < rows; j++) for (let x = sx0 + 0.16 + (j % 2) * 0.15; x < sx1 - 0.1; x += 0.31) drum(b, C.logEnd, x, 0.17 + j * 0.3, wz1 - 0.49, 0.14, 0.04, true, 7, false);
  }
  solid(c, wxc, wzc, wx1 - wx0, wz1 - wz0, 3, 'zarya-woodshed', { kind: 'building', surface: 'wood' });
  // the block, split logs round it, a saw-horse
  cyl(b, C.log, 235.4, 0, FRONT + 0.2, 0.34, 0.36, 0.5, 9);
  cyl(b, C.logEnd, 235.4, 0.5, FRONT + 0.2, 0.33, 0.33, 0.02, 9, false);
  for (let i = 0; i < 7; i++) drum(b, i % 2 ? C.log : C.logEnd, 236.2 + ((i * 0.37) % 1) * 1.1, 0.1, FRONT + 0.1 + ((i * 0.61) % 1) * 0.9, 0.09, 0.42, i % 2 === 0, 5, false);
  solid(c, 235.4, FRONT + 0.2, 0.7, 0.7, 0.5, 'zarya-block', { shots: false, kind: 'none', surface: 'wood' });
  for (const s of [-1, 1]) for (const k of [-1, 1]) slab(b, Z.wood, 239.6 + s * 0.5, 0.42, FRONT + 0.5, 0.06, 1, 0.06, k * 0.5, 0, 0, false);
  box(b, Z.wood, 239.6, 0.62, FRONT + 0.5, 1.3, 0.07, 0.07, 0, false);
  drum(b, C.log, 239.6, 0.82, FRONT + 0.5, 0.1, 1.5, false, 6, false);
  solid(c, 239.6, FRONT + 0.5, 1.4, 0.8, 0.9, 'zarya-sawhorse', { shots: false, kind: 'none', surface: 'wood' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the street's furniture, the yards
// ---------------------------------------------------------------------------------------------------------------------

/** A car under snow, drawn along x with its bonnet to +x. */
function car(b: LevelBuilder, mat: THREE.Material): void {
  box(b, mat, 0, 0.72, 0, 4.2, 0.6, 1.66);
  box(b, mat, -0.25, 1.28, 0, 2.2, 0.56, 1.5);
  box(b, Z.black, -0.25, 1.3, 0, 1.9, 0.38, 1.54, 0, false);
  box(b, Z.black, -0.25, 1.3, 0, 2.24, 0.36, 1.3, 0, false);
  box(b, Z.snow, -0.25, 1.64, 0, 2.1, 0.16, 1.4, 0, false);
  box(b, Z.snow, 1.5, 1.07, 0, 1.1, 0.1, 1.5, 0, false);
  box(b, Z.snow, -1.75, 1.07, 0, 0.6, 0.1, 1.5, 0, false);
  for (const sx of [-1.3, 1.3]) for (const sz of [-0.78, 0.78]) drum(b, Z.black, sx, 0.34, sz, 0.34, 0.22, true, 10);
  for (const s of [-1, 1]) {
    blob(b, Z.grey, 2.08, 0.82, s * 0.56, 0.12);
    box(b, Z.grey, s * 2.14, 0.5, 0, 0.1, 0.12, 1.7, 0, false);
  }
}

/** The depot's tower wagon (for the overhead wire), drawn along x with its bonnet to +x. */
function towerWagon(b: LevelBuilder): void {
  box(b, Z.iron, 0, 0.72, 0, 6.2, 0.24, 1.2);
  for (const wx of [2.3, -1.7]) for (const wz of [-0.95, 0.95]) drum(b, Z.black, wx, 0.46, wz, 0.46, 0.32, true, 12);
  box(b, Z.green, 1.2, 1.7, 0, 1.6, 1.7, 2.2);
  box(b, Z.black, 2.02, 2.05, 0, 0.04, 0.6, 1.9, 0, false);
  box(b, Z.black, 1.3, 2.05, 0, 0.9, 0.55, 2.24, 0, false);
  box(b, Z.green, 2.65, 1.3, 0, 1.3, 0.85, 1.7);
  box(b, Z.iron, 3.32, 1.25, 0, 0.06, 0.6, 1.2, 0, false);
  for (const s of [-1, 1]) {
    blob(b, Z.grey, 3.3, 1.35, s * 0.7, 0.14);
    box(b, Z.black, 2.4, 0.98, s * 0.98, 1.5, 0.1, 0.36, 0, false);
  }
  box(b, Z.iron, 3.45, 0.75, 0, 0.14, 0.16, 2.2);
  box(b, Z.woodDark, -1.4, 1.02, 0, 3.6, 0.36, 2.3);
  // the tower: four legs, cross braces, the platform and its rail
  for (const dx of [-2.7, -0.5]) for (const dz of [-0.85, 0.85]) box(b, Z.wood, dx, 2.7, dz, 0.12, 3, 0.12);
  for (const dz of [-0.85, 0.85]) for (const s of [-1, 1]) slab(b, Z.wood, -1.6, 2.7, dz, 0.07, 3.6, 0.07, 0, 0, s * 0.63, false);
  box(b, Z.woodPale, -1.6, 4.25, 0, 2.9, 0.1, 2.1);
  for (const dz of [-1, 1]) box(b, Z.wood, -1.6, 5.15, dz, 2.9, 0.07, 0.07, 0, false);
  for (const dx of [-3.02, -0.18]) {
    box(b, Z.wood, dx, 5.15, 0, 0.07, 0.07, 2, 0, false);
    for (const dz of [-1, 1]) box(b, Z.wood, dx, 4.72, dz, 0.07, 0.9, 0.07, 0, false);
  }
  // a ladder up the back, snow where it lies
  for (const s of [-0.22, 0.22]) slab(b, Z.wood, -3.5, 2.6, s, 0.05, 3.5, 0.05, 0, 0, -0.2, false);
  for (let i = 0; i < 8; i++) box(b, Z.wood, -3.84 + i * 0.085, 1.15 + i * 0.42, 0, 0.04, 0.04, 0.5, 0, false);
  box(b, Z.snow, 1.2, 2.61, 0, 1.5, 0.14, 2.1, 0, false);
  box(b, Z.snow, 2.7, 1.78, 0, 1.2, 0.1, 1.6, 0, false);
  box(b, Z.snow, -1.6, 4.36, 0, 2.8, 0.12, 2, 0, false);
}

function street(c: Ctx): void {
  const { b } = c;
  // lamps along the kerb, benches facing the shops, bare trees along the Rynok's wall
  lampPost(c, 167, -86.9, true);
  lampPost(c, 186.5, -86.9, false);
  lampPost(c, 212, -86.9, true);
  lampPost(c, 232, -86.9, false);
  for (const x of [160, 176.5, 219]) bench(c, x, -86.2, 0);
  [156, 167.5, 178, 187.5, 204.5, 214, 224.5].forEach((x, i) => bareTree(c, x, -73.8 - (i % 2) * 0.8, 3.6 + (i % 3) * 0.5, i));
  // snow shovelled off the street against the wall and the kerb
  for (const [x, z, r, h, sx] of [[162, -73.4, 1.6, 0.8, 2.6], [183, -73.2, 1.4, 0.7, 2.2], [209, -73.3, 1.5, 0.8, 2.4], [228, -73.6, 1.7, 0.9, 2.8], [149.2, -86, 1.4, 0.9, 1], [171.5, -85.4, 1, 0.5, 1.6], [226.5, -80, 1.3, 0.6, 1.5]] as const) heap(c, x, z, r, h, sx);
  // a car left at the kerb, the kvas barrel on its trailer, the round poster column
  turned(c, 189.6, -84.6, 0.08, (tb) => car(tb, Z.blue));
  solid(c, 189.6, -84.6, 4.3, 1.7, 1.6, 'zarya-car', { rot: 0.08, kind: 'prop', surface: 'metal' });
  drum(b, C.yellow, 181.6, 1.25, -84.9, 0.75, 2.2, false, 14);
  for (const s of [-1, 1]) {
    drum(b, C.yellow, 181.6 + s * 1.12, 1.25, -84.9, 0.6, 0.1, false, 14);
    drum(b, Z.black, 181.6, 0.34, -84.9 + s * 0.8, 0.34, 0.2, true, 10);
  }
  box(b, Z.iron, 181.6, 0.5, -84.9, 2.4, 0.12, 1.4);
  box(b, Z.iron, 183.3, 0.4, -84.9, 1.2, 0.06, 0.06, 0, false);
  box(b, Z.iron, 183.8, 0.2, -84.9, 0.06, 0.4, 0.06, 0, false);
  box(b, Z.snow, 181.6, 2.0, -84.9, 1.9, 0.14, 0.8, 0, false);
  box(b, Z.steel, 181.2, 0.95, -85.68, 0.06, 0.06, 0.2, 0, false);
  solid(c, 181.8, -84.9, 2.8, 1.6, 2, 'zarya-kvas', { kind: 'prop', surface: 'metal' });
  cyl(b, Z.concrete, 201.6, 0, -84, 0.8, 0.8, 0.3, 14);
  cyl(b, Z.cream, 201.6, 0.3, -84, 0.7, 0.7, 2.3, 14);
  cyl(b, Z.greenDark, 201.6, 2.6, -84, 0.9, 0.2, 0.5, 14);
  cyl(b, Z.snow, 201.6, 2.72, -84, 0.74, 0.1, 0.44, 14, false);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    box(b, GOODS[(i * 3) % GOODS.length]!, 201.6 + Math.sin(a) * 0.7, 1.2 + (i % 2) * 0.75, -84 + Math.cos(a) * 0.7, 0.44, 0.62, 0.03, a, false);
    box(b, Z.white, 201.6 + Math.sin(a + 0.35) * 0.7, 1.9 - (i % 2) * 0.75, -84 + Math.cos(a + 0.35) * 0.7, 0.4, 0.5, 0.03, a + 0.35, false);
  }
  solid(c, 201.6, -84, 1.5, 1.5, 3, 'zarya-column', { kind: 'prop' });
  // a fir in the corner by the woodshed, the little fir by the shop with the shop's own lights on it (the ornament rolled under it)
  firTree(b, 234.5, -78.5, 6.5);
  solid(c, 234.5, -78.5, 1, 1, 5, 'zarya-tree', { kind: 'none', surface: 'wood' });
  firTree(b, 150.2, -100.4, 4.2, { lights: true, seed: 23 });
  solid(c, 150.2, -100.4, 0.9, 0.9, 4, 'zarya-tree', { kind: 'none', surface: 'wood' });
  blob(b, Z.snow, 151.2, 0, -99.4, 1.3, 1.2, 0.2, 0.9, 9);
  // a snowed-in handcart and bins at the dead end of the street
  box(b, Z.wood, 149.4, 0.6, -93.2, 1.6, 0.5, 1, 0.3);
  box(b, Z.snow, 149.4, 0.9, -93.2, 1.5, 0.14, 0.9, 0.3, false);
  for (const s of [-1, 1]) drum(b, Z.woodDark, 149.4 + s * 0.16, 0.36, -93.2 + s * 0.54, 0.36, 0.06, true, 10);
  solid(c, 149.4, -93.2, 1.8, 1.4, 1, 'zarya-cart', { rot: 0.3, shots: false, kind: 'none', surface: 'wood' });
}

function yard(c: Ctx): void {
  const { b } = c;
  // ---- between the street's backs and the stop: a bench and a lamp where people wait, the brazier, crates ----
  lampPost(c, 183, -121.6, true);
  bench(c, 187.2, -121.9, 0);
  bench(c, 172, -121.9, 0);
  // the dead brazier behind the canteen (the man who can be covered stands at it)
  cyl(b, Z.iron, 203.4, 0.25, -114.9, 0.3, 0.3, 0.6, 9);
  for (const a of [0.4, 2.5, 4.6]) box(b, Z.iron, 203.4 + Math.cos(a) * 0.28, 0.13, -114.9 + Math.sin(a) * 0.28, 0.05, 0.26, 0.05, 0, false);
  cyl(b, Z.black, 203.4, 0.82, -114.9, 0.26, 0.26, 0.04, 9, false);
  for (let i = 0; i < 3; i++) slab(b, Z.black, 203.4 + (i - 1) * 0.1, 0.92, -114.9, 0.06, 0.34, 0.06, i - 1, i * 2, 0.5, false);
  solid(c, 203.4, -114.9, 0.6, 0.6, 0.9, 'zarya-brazier', { shots: false, kind: 'none', surface: 'metal' });
  crate(c, 188.4, -111, 1.1, 0.1, 2);
  crate(c, 189.8, -110.8, 0.9, -0.2);
  crate(c, 187.2, -110.7, 0.8, 0.3);
  crate(c, 219.5, -111.2, 1.2, 0.05, 2);
  crate(c, 218, -110.9, 1, 0.4);
  // ---- the sand box (the cars' sand): a timber bin, the heap half under snow, a shovel, pails, a riddle ----
  const sx = 230;
  const sz = -118;
  for (const s of [-1, 1]) {
    box(b, Z.woodDark, sx, 0.45, sz + s * 2.42, 6, 0.9, 0.16);
    box(b, Z.woodDark, sx + s * 2.92, 0.45, sz, 0.16, 0.9, 5);
    for (const k of [-1, 1]) box(b, Z.wood, sx + s * 2.92, 0.55, sz + k * 2.42, 0.22, 1.1, 0.22);
    box(b, Z.snow, sx, 0.93, sz + s * 2.42, 6, 0.08, 0.22, 0, false);
  }
  blob(b, C.sand, sx - 0.4, 0, sz + 0.2, 2.2, 1.1, 0.62, 0.95, 10);
  blob(b, Z.snow, sx + 0.6, 0.1, sz - 0.5, 1.9, 1.1, 0.6, 0.9, 10);
  slab(b, Z.woodPale, sx - 1.6, 1.3, sz + 1.2, 0.045, 1.3, 0.045, 0.2, 0, 0.15, false);
  box(b, Z.iron, sx - 1.52, 0.72, sz + 1.1, 0.26, 0.3, 0.04, 0, false);
  solid(c, sx, sz, 6, 5, 1.2, 'zarya-sandbox', { shots: false, kind: 'prop', surface: 'wood' });
  for (const [x, z] of [[226.4, -119.3], [226.75, -119.9]] as const) {
    cyl(b, Z.grey, x, 0, z, 0.13, 0.17, 0.32, 9);
    cyl(b, C.sand, x, 0.29, z, 0.15, 0.15, 0.03, 9, false);
  }
  slab(b, Z.wood, 233.5, 0.6, sz + 0.6, 0.08, 1.3, 1.3, 0, 0, -0.3, false);
  lampPost(c, 222, -122, true);
  // ---- the east wall's corner: old sleepers stacked, a heap of snow ----
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) box(b, Z.woodDark, j % 2 ? 240.3 + i * 0.62 : 241.2, 0.13 + j * 0.26, j % 2 ? -121 : -120.1 - i * 0.62, j % 2 ? 0.26 : 2.5, 0.24, j % 2 ? 2.5 : 0.26);
  box(b, Z.snow, 241.2, 1.1, -121, 2.5, 0.12, 2.5, 0, false);
  solid(c, 241.2, -121, 2.6, 2.6, 1.1, 'zarya-sleepers', { shots: false, kind: 'none', surface: 'wood' });
  // (north of the line: Line One now runs on east past the stop to its portal in this wall, `LINE_PORTALS` 'depot')
  heap(c, 241.4, -136.6, 1.8, 1, 1, 1.6);

  // ---- the works yard, west of the booth ----
  lampPost(c, 156.5, -137.2, true);
  lampPost(c, 201.6, -148.2, true);
  lampPost(c, 170, -173, true);
  lampPost(c, 178, -141, false);
  // the tower wagon, parked by the booth
  const ty = 0.12;
  turned(c, 170.5, -149, ty, towerWagon);
  solid(c, 170.5 + Math.cos(ty) * 0.2, -149 - Math.sin(ty) * 0.2, 6.9, 2.3, 2.5, 'zarya-wagon', { rot: ty, kind: 'prop', surface: 'metal' });
  solid(c, 170.5 - Math.cos(ty) * 1.6, -149 + Math.sin(ty) * 1.6, 3, 2.2, 5.2, 'zarya-wagon', { rot: ty, kind: 'none', surface: 'wood' });
  // the snowplough car on its stub of track
  rails(b, [[153, -163], [177, -163]]);
  for (const s of [-1, 1]) box(b, Z.iron, 153, 0.4, -163 + s * 0.72, 0.16, 0.8, 0.16);
  box(b, Z.red, 153, 0.75, -163, 0.2, 0.26, 1.9);
  solid(c, 153, -163, 0.3, 1.9, 0.9, 'zarya-buffer', { shots: false, kind: 'none', surface: 'metal' });
  turned(c, 163.5, -163, Math.PI / 2, (tb) => tram(tb, 11, { low: C.works, lit: false, snow: [-4.4, 4.4], plough: true }));
  solid(c, 164, -163, 12, 2.5, 3.1, 'zarya-tram', { kind: 'building', surface: 'metal' });
  for (const x of [173.4, 175.2]) {
    // spare wheelsets left on the stub
    drum(b, Z.iron, x, 0.47, -163, 0.07, 1.7, true, 6);
    for (const s of [-1, 1]) drum(b, Z.steel, x, 0.47, -163 + s * 0.72, 0.42, 0.12, true, 14, false);
  }
  solid(c, 174.3, -163, 2.7, 1.8, 0.9, 'zarya-wheels', { shots: false, kind: 'none', surface: 'metal' });
  // an old car kept as the gang's mess room: lit, a stove pipe through its roof, a step at its door
  rails(b, [[173.5, -176.4], [188, -176.4]]);
  turned(c, 181, -176.4, -Math.PI / 2, (tb) => tram(tb, 10.5, { low: Z.blue, lit: true, snow: [-4.2, 4.2] }));
  solid(c, 181, -176.4, 10.5, 2.5, 3.1, 'zarya-tram', { kind: 'building', surface: 'metal' });
  cyl(b, Z.iron, 183.2, 3.1, -176, 0.09, 0.09, 1.1, 6);
  cyl(b, Z.snow, 183.2, 4.2, -176, 0.14, 0.03, 0.12, 6, false);
  box(b, Z.wood, 178.2, 0.2, -174.8, 1.2, 0.4, 0.7);
  box(b, Z.snow, 178.2, 0.43, -174.8, 1.1, 0.07, 0.6, 0, false);
  solid(c, 178.2, -174.8, 1.2, 0.7, 0.45, 'zarya-step', { shots: false, kind: 'none', surface: 'wood' });
  b.glow({ x: 181, y: 2.3, z: -175, color: 0xffb060, size: 1.6, intensity: 1.6, mode: 'steady' });
  // spare wire poles laid on bearers, the coal for the stoves in its pen
  for (const x of [160.5, 164.5, 168.5]) box(b, Z.woodDark, x, 0.1, -169.2, 0.24, 0.2, 1.3);
  for (let i = 0; i < 5; i++) drum(b, Z.iron, 164.5 + (i % 2) * 0.3, 0.33 + Math.floor(i / 3) * 0.24, -169.7 + (i % 3) * 0.3 + Math.floor(i / 3) * 0.15, 0.13, 9.4, false, 8, i < 3);
  box(b, Z.snow, 164.6, 0.72, -169.3, 9, 0.1, 0.8, 0, false);
  solid(c, 164.6, -169.3, 9.6, 1.3, 0.7, 'zarya-poles', { shots: false, kind: 'none', surface: 'metal' });
  for (const s of [-1, 1]) box(b, Z.woodDark, 182.6 + s * 1.5, 0.5, -157.2, 0.14, 1, 2.4);
  box(b, Z.woodDark, 182.6, 0.5, -158.4, 3.1, 1, 0.14);
  for (const [px, pz] of [[181.1, -156], [184.1, -156]] as const) box(b, Z.wood, px, 0.6, pz, 0.2, 1.2, 0.2);
  blob(b, Z.black, 182.6, 0, -157.3, 1.25, 1, 0.6, 0.85, 9);
  blob(b, Z.snow, 182.9, 0.3, -157.8, 0.9, 1, 0.45, 0.7, 8);
  slab(b, Z.woodPale, 183.6, 0.75, -156.3, 0.045, 1.3, 0.045, 0.3, 0, -0.2, false);
  solid(c, 182.6, -157.3, 3.2, 2.5, 1.1, 'zarya-coal', { shots: false, kind: 'none', surface: 'wood' });
  // rails stacked under snow, a pile of sleepers, cable drums
  for (const x of [158.5, 163, 167.5]) box(b, Z.woodDark, x, 0.1, -181, 0.24, 0.2, 1.7);
  for (let i = 0; i < 9; i++) box(b, Z.steel, 163, 0.28 + Math.floor(i / 5) * 0.17, -181.56 + (i % 5) * 0.28 + Math.floor(i / 5) * 0.14, 12, 0.15, 0.12, 0, false);
  box(b, Z.snow, 163, 0.56, -181, 11.6, 0.1, 1.2, 0, false);
  solid(c, 163, -181, 12, 1.7, 0.6, 'zarya-rails', { shots: false, kind: 'none', surface: 'metal' });
  for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) box(b, Z.woodDark, j % 2 ? 177.1 + i * 0.62 : 178, 0.13 + j * 0.26, j % 2 ? -182 : -181.1 - i * 0.62, j % 2 ? 0.26 : 2.5, 0.24, j % 2 ? 2.5 : 0.26);
  box(b, Z.snow, 178, 1.36, -182, 2.5, 0.12, 2.5, 0, false);
  solid(c, 178, -182, 2.6, 2.6, 1.3, 'zarya-sleepers', { kind: 'none', surface: 'wood' });
  for (const [x, z, alongZ] of [[154, -172.5, false], [156.6, -175, true]] as const) {
    drum(b, Z.black, x, 0.95, z, 0.6, 1, alongZ, 12);
    for (const s of [-1, 1]) drum(b, Z.woodPale, x + (alongZ ? 0 : s * 0.55), 0.95, z + (alongZ ? s * 0.55 : 0), 0.95, 0.1, alongZ, 14);
    box(b, Z.snow, x, 1.9, z, alongZ ? 0.5 : 1.2, 0.1, alongZ ? 1.2 : 0.5, 0, false);
    solid(c, x, z, alongZ ? 1.9 : 1.2, alongZ ? 1.2 : 1.9, 1.9, 'zarya-drum', { kind: 'none', surface: 'wood' });
  }
  // the water column, its spill frozen where it ran
  cyl(b, Z.iron, 185, 0, -166, 0.16, 0.12, 2.8, 8);
  box(b, Z.iron, 185.7, 2.7, -166, 1.5, 0.14, 0.14);
  box(b, Z.iron, 186.4, 2.5, -166, 0.14, 0.4, 0.14, 0, false);
  cyl(b, Z.ice, 186.4, 1.5, -166, 0.02, 0.07, 0.8, 5, false);
  const ice = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.04, 12), Z.ice);
  ice.position.set(186.6, 0.03, -165.6);
  ice.scale.set(1.3, 1, 0.8);
  ice.receiveShadow = true;
  b.add(ice, { cast: false });
  solid(c, 185, -166, 0.4, 0.4, 2.8, 'zarya-pole', { kind: 'none', surface: 'metal' });
  // bare trees and heaps of snow along the north and west walls, crates by the booth
  [152, 161, 171.5, 182, 191].forEach((x, i) => bareTree(c, x, -186.2, 4 + (i % 3) * 0.5, i * 1.3));
  [-178, -167, -153, -144, -117, -108].forEach((z, i) => bareTree(c, 148.4, z, 3.8 + (i % 2) * 0.6, i * 0.9));
  for (const [x, z, r, h, sx2, sz2] of [[166, -186.4, 1.5, 0.9, 2.6, 1], [186.5, -186.5, 1.4, 0.8, 2, 1], [149, -172, 1.3, 0.8, 1, 2.2], [149.1, -148.5, 1.4, 0.9, 1, 2], [149, -112.5, 1.3, 0.8, 1, 2.2]] as const) heap(c, x, z, r, h, sx2, sz2);
  crate(c, 186.6, -146.2, 1, 0.2, 2);
  crate(c, 185.5, -147.2, 0.9, -0.1);
  // the drift against the pond road's gate: blown up either side of it (the story clears the gate itself)
  for (const z of [-136.4, -123.4]) blob(b, Z.snow, 148.6, 0, z, 1.6, 0.68, 0.5, 1.5, 9);
}

function ground(c: Ctx): void {
  const { b } = c;
  groundRect(b, Z.snow, R.x0, R.z0, R.x1, R.z1, 0.004);
  const path = (x0: number, z0: number, x1: number, z1: number): void => groundRect(b, Z.packed, x0, z0, x1, z1, 0.012);
  path(147, STREET.z0, 244.2, STREET.z1); // the street
  path(193, STREET.z1, 199, -70.3); // from the Rynok's gate
  path(176, -125.8, 180, STREET.z0); // the alley between the shop and the canteen, to the stop
  path(153.5, -125.8, 156.5, STREET.z0); // round the shop's west end
  path(146.3, -134, 156, -125.8); // in at the pond road's gate
  path(189, -139, 191, -130.2); // from the stop to the dispatcher's door
  path(196, -151, 198, -130.2); // from the stop to the sheds
  path(196, -159.7, SH.x1, -151); // the apron before the doorways
  path(199, -177, 201, -159.7); // to the track gang's store
  path(213, -151, 215.5, STREET.z0); // from the street, past the canteen's east end
  path(160, -161, 162.5, -130.2); // across the works yard to the snowplough
  path(162.5, -155.4, 196, -153.4); // and from there past the tower wagon to the sheds
  path(178.6, -174.6, 180.6, -155.4); // to the mess car's door
  // the walls on the two edges the frame leaves open (the map ends there): the yard's north wall, the east wall
  const nx1 = 196;
  box(b, Z.concreteDark, (R.x0 + nx1) / 2, 1.5, -188.3, nx1 - R.x0, 3, 0.4);
  box(b, Z.snow, (R.x0 + nx1) / 2, 3.07, -188.3, nx1 - R.x0, 0.14, 0.54, 0, false);
  solid(c, (R.x0 + nx1) / 2, -189.3, nx1 - R.x0, 2.4, 3, 'zarya-border', { kind: 'wall' });
  solid(c, (nx1 + R.x1) / 2, -188.7, R.x1 - nx1, 2.6, 3, 'zarya-beyond', { kind: 'none' });
  solid(c, 244.7, (SH.z0 + SH.z1) / 2, 2.6, SH.z1 - SH.z0, 3, 'zarya-beyond', { kind: 'none' });
  const ez0 = SH.z1;
  const ez1 = R.z1 - 0.2;
  box(b, Z.concreteDark, 244.4, 1.5, (ez0 + ez1) / 2, 0.4, 3, ez1 - ez0);
  box(b, Z.snow, 244.4, 3.07, (ez0 + ez1) / 2, 0.54, 0.14, ez1 - ez0, 0, false);
  solid(c, 245.1, (ez0 + ez1) / 2, 1.8, ez1 - ez0, 3, 'zarya-border', { kind: 'wall' });
}

export interface DepotHandles {
  /** Nothing the story moves here yet. */
  none?: undefined;
}

export function buildDepot(c: Ctx): DepotHandles {
  ground(c);
  fan(c);
  sheds(c);
  booth(c);
  gangStore(c);
  okhotnik(c);
  canteen(c);
  fireBoard(c);
  garage(c);
  street(c);
  // a shut kiosk, its shutter bought open with points (`zarya/mods.ts`, `zaryaShutters.ts`)
  shutterKiosk(c, DEPOT.shutter, DEPOT.shutterYaw, 1);
  yard(c);
  return {};
}
