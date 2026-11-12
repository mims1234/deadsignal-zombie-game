/**
 * ZARYA: the DOM KULTURY (`zarya/zones/dk.ts`), built from `research_notes/zarya/refs/dk-*`: the inside of the Palace
 * of Culture, reached from the square through the passage the frame cuts in the Palace's front block. Three rooms
 * under one roof: the FOYER at the east end (marble, columns, the chandelier, the New Year fir, the box office, the
 * cloakroom), the town MUSEUM along the north side (the plaque, the photographs, the sickle and hammer in their case,
 * the sabre in its cabinet, the town in miniature) and the AUDITORIUM across the west (two blocks of red seats, the
 * stage with its painted forest and the revolve the hut stands on). Baba Yaga's stage house (`stageHouse`) opens the
 * stage into its wings: the fly gallery and its stair in the north wing, the revolve's winch in the south, the orchestra
 * pit with the trap levers in front of the thrust, the follow-spot at the back of the stalls. Behind it all, the park:
 * firs, a fountain under snow, shut off (nobody needs it).
 *
 * Everything indoors is a plain colour, so the whole building is a handful of draw calls; nothing in here casts a
 * shadow (the roof does it for them).
 */
import * as THREE from 'three';
import { groundRect } from '../structures';
import type { LevelBuilder } from '../builder';
import type { Ctx } from './util';
import { DK } from '../../zarya/zones/dk';
import { GOODS, Z, bench, box, bulbString, counter, cyl, firTree, garland, lampPost, slab, solid } from './zaryaKit';

const std = (color: number, roughness = 0.85): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness });
/** Colours the kit lacks, at finishes it already has (so they draw with everything else). */
const M = {
  marble: std(0xb7ab95, 0.7),
  marbleTan: std(0x9a8c76, 0.7),
  marbleDark: std(0x45403c, 0.7),
  wall: std(0xd9c193),
  roof: std(0x8b9199),
  night: std(0x16254a),
  dusk: std(0x2b4a80),
  velvet: std(0x8a1c22),
  carpet: std(0x74191d, 0.95),
};

const R = DK.rect;
const B = DK.building;
const F = DK.foyerRoom;
const MU = DK.museum;
const HL = DK.hall;
const AX = DK.axis;
/** The ceiling, the outer walls' thickness, how high the panelling goes. */
const H = 7;
const T = 0.5;
const DADO = 1.3;
/** The east wall's outer face: just inside the frame's wall on x = -104. */
const XE = B.x1 - 0.3;
/** Where the hall's side walls open into the wings, across the stage's whole depth (Baba Yaga's stage). */
const WING_OPENING: Door = { at: (DK.northWing.x0 + DK.northWing.x1) / 2, w: DK.northWing.x1 - DK.northWing.x0, h: 5.8 };

/** A box that casts no shadow (everything indoors). */
const q = (b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0): THREE.Mesh => box(b, mat, x, y, z, sx, sy, sz, rot, false);
/** A mesh of my own, with the same shadow flags as `q` (so it is drawn in the same batch). */
function put(b: LevelBuilder, m: THREE.Mesh): void {
  m.receiveShadow = true;
  b.add(m, { cast: false });
}
/** A ball (the kit's takes no shadow, and would be drawn apart from everything else in here). */
function orb(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, r: number, sy = 1, seg = 8): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)), mat);
  m.position.set(x, y, z);
  m.scale.y = sy;
  put(b, m);
}

interface Door {
  /** Where its middle is along the wall (a world x or z). */
  at: number;
  w: number;
  h: number;
}
interface RunOpts {
  t?: number;
  doors?: Door[];
  /** Panelling to the shoulder, and a cornice, on the side of lower z (or x) / of higher z (or x). */
  lo?: THREE.Material;
  hi?: THREE.Material;
  cast?: boolean;
}

/** A sand-coloured wall to the ceiling along x (at z = `fixed`) or along z (at x = `fixed`) from `a` to `e`, with doorways. */
function wallRun(c: Ctx, alongX: boolean, fixed: number, a: number, e: number, o: RunOpts = {}): void {
  const { b } = c;
  const t = o.t ?? 0.4;
  const put = (mat: THREE.Material, along: number, y: number, off: number, len: number, h: number, thick: number, cast = false): void => {
    box(b, mat, alongX ? along : fixed + off, y, alongX ? fixed + off : along, alongX ? len : thick, h, alongX ? thick : len, 0, cast);
  };
  const piece = (p0: number, p1: number, y0: number, y1: number): void => {
    const len = p1 - p0;
    if (len < 0.05) return;
    const mid = (p0 + p1) / 2;
    put(M.wall, mid, (y0 + y1) / 2, 0, len, y1 - y0, t, o.cast ?? false);
    b.collide({ x: alongX ? mid : fixed, z: alongX ? fixed : mid, hx: (alongX ? len : t) / 2, hz: (alongX ? t : len) / 2, y0, y1, mapKind: 'wall', surface: 'concrete', tag: 'zarya-dk' });
    for (const [mat, s] of [[o.lo, -1], [o.hi, 1]] as const) {
      if (!mat) continue;
      if (y0 === 0) {
        put(mat, mid, DADO / 2, s * (t / 2 + 0.03), len, DADO, 0.06);
        put(mat === Z.white ? Z.gold : Z.wood, mid, DADO + 0.04, s * (t / 2 + 0.05), len, 0.08, 0.1);
        put(mat === Z.white ? M.marbleDark : Z.black, mid, 0.09, s * (t / 2 + 0.045), len, 0.18, 0.09);
      }
      put(Z.white, mid, H - 0.22, s * (t / 2 + 0.08), len, 0.44, 0.16);
    }
  };
  let cur = a;
  for (const d of [...(o.doors ?? [])].sort((p, k) => p.at - k.at)) {
    piece(cur, d.at - d.w / 2, 0, H);
    piece(d.at - d.w / 2, d.at + d.w / 2, d.h, H);
    // the doorcase: dark wood lining the opening
    for (const s of [-1, 1]) put(Z.woodDark, d.at + s * (d.w / 2 - 0.05), d.h / 2, 0, 0.1, d.h, t + 0.2);
    put(Z.woodDark, d.at, d.h - 0.07, 0, d.w, 0.14, t + 0.2);
    cur = d.at + d.w / 2;
  }
  piece(cur, e, 0, H);
}

/** A shallow pier on a wall with a lamp on it; (nx, nz) is the way the wall faces. */
function pilaster(b: LevelBuilder, x: number, z: number, nx: number, nz: number, lamp = true): void {
  q(b, Z.cream, x + nx * 0.09, H / 2, z + nz * 0.09, nx ? 0.18 : 0.7, H, nx ? 0.7 : 0.18);
  q(b, Z.white, x + nx * 0.11, 0.35, z + nz * 0.11, nx ? 0.22 : 0.8, 0.7, nx ? 0.8 : 0.22);
  q(b, Z.gold, x + nx * 0.11, H - 0.62, z + nz * 0.11, nx ? 0.22 : 0.8, 0.14, nx ? 0.8 : 0.22);
  if (!lamp) return;
  q(b, Z.brass, x + nx * 0.28, 3.0, z + nz * 0.28, nx ? 0.3 : 0.06, 0.06, nx ? 0.06 : 0.3);
  q(b, Z.brass, x + nx * 0.4, 3.1, z + nz * 0.4, 0.05, 0.2, 0.05);
  orb(b, Z.bulb, x + nx * 0.4, 3.3, z + nz * 0.4, 0.13);
}

/** A lamp on a rod from the ceiling. */
function pendant(b: LevelBuilder, x: number, z: number, y = 5.3, r = 0.22): void {
  cyl(b, Z.brass, x, y + r, z, 0.02, 0.02, H - y - r, 5, false);
  cyl(b, Z.brass, x, y + r * 0.7, z, r * 0.6, r * 0.2, r * 0.5, 8, false);
  orb(b, Z.bulb, x, y, z, r);
}

/** A fir painted on a flat: three stacked triangles under white, seen from the east and west (or from north and south with `faceZ`). */
function flatFir(b: LevelBuilder, mat: THREE.Material, x: number, y: number, z: number, h: number, w: number, faceZ = false): void {
  const tri = (m: THREE.Material, r: number, th: number, yc: number, out: number): void => {
    const g = new THREE.Mesh(new THREE.ConeGeometry(r, th, 4), m);
    g.scale.set(faceZ ? 1 : 0.02 / r, 1, faceZ ? 0.02 / r : 1);
    g.position.set(x + (faceZ ? 0 : out), yc, z + (faceZ ? out : 0));
    put(b, g);
  };
  q(b, Z.woodDark, x, y + h * 0.07, z, faceZ ? w * 0.1 : 0.03, h * 0.14, faceZ ? 0.03 : w * 0.1);
  for (let i = 0; i < 3; i++) {
    const r = (w / 2) * (1 - i * 0.25);
    const th = h * 0.44;
    const yc = y + h * (0.12 + i * 0.24) + th / 2;
    tri(mat, r, th, yc, 0);
    tri(Z.snow, r * 0.45, th * 0.42, yc + th * 0.29, 0.014);
  }
}

/** A framed picture on a wall facing (nx, nz): a pale sky over dark ground, a few figures; `who` stands one tall figure in it. */
function picture(b: LevelBuilder, x: number, y: number, z: number, nx: number, nz: number, w: number, h: number, seed: number, who = false): void {
  const at = (out: number, along: number, yy: number, sw: number, sh: number, mat: THREE.Material): void => {
    q(b, mat, x + nx * out + (nx ? 0 : along), yy, z + nz * out + (nx ? along : 0), nx ? 0.02 : sw, sh, nx ? sw : 0.02);
  };
  at(0.03, 0, y, w + 0.14, h + 0.14, Z.woodDark);
  at(0.045, 0, y, w, h, seed % 3 === 0 ? Z.cream : Z.grey);
  at(0.055, 0, y - h * 0.32, w, h * 0.36, seed % 2 ? Z.concreteDark : Z.steel);
  if (who) {
    // the first Ded Moroz: a long pale coat, a beard, a tall hat, a staff
    at(0.065, 0, y - h * 0.12, w * 0.2, h * 0.5, Z.white);
    at(0.07, 0, y + h * 0.17, w * 0.11, h * 0.12, Z.cream);
    at(0.075, 0, y + h * 0.1, w * 0.1, h * 0.12, Z.white);
    at(0.07, 0, y + h * 0.28, w * 0.13, h * 0.12, Z.black);
    at(0.07, w * 0.17, y - h * 0.06, w * 0.02, h * 0.66, Z.black);
    return;
  }
  for (let i = 0; i < 2 + (seed % 3); i++) at(0.065, (i - 1) * w * 0.2 + ((seed * 7 + i * 3) % 5) * 0.02 * w, y - h * 0.1, w * 0.07, h * (0.24 + ((seed + i) % 3) * 0.05), Z.black);
}

/** An upholstered bench against a wall: its back is on the side of (-nx, -nz). */
function banquette(c: Ctx, x: number, z: number, len: number, nx: number, nz: number): void {
  const { b } = c;
  const w = nx ? 0.8 : len;
  const d = nx ? len : 0.8;
  q(b, Z.woodDark, x, 0.16, z, w, 0.32, d);
  q(b, M.velvet, x + nx * 0.05, 0.42, z + nz * 0.05, nx ? 0.7 : len, 0.2, nx ? len : 0.7);
  q(b, M.velvet, x - nx * 0.3, 0.82, z - nz * 0.3, nx ? 0.2 : len, 0.7, nx ? len : 0.2);
  q(b, Z.woodDark, x - nx * 0.3, 1.2, z - nz * 0.3, nx ? 0.24 : len + 0.04, 0.06, nx ? len + 0.04 : 0.24);
  solid(c, x, z, w, d, 0.95, 'zarya-bench', { shots: false, kind: 'none', surface: 'wood' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the shell: walls, floors, the ceiling, the roof
// ---------------------------------------------------------------------------------------------------------------------

function shell(c: Ctx): void {
  const { b } = c;
  const xc = (B.x0 + XE) / 2;
  const zc = (B.z0 + B.z1) / 2;
  const w = XE - B.x0;
  const d = B.z1 - B.z0;
  // the floors: marble in the foyer, stone in the museum, boards in the hall; the sill of the way in
  for (let i = 0; i < 16; i++) for (let j = 0; j < 25; j++) groundRect(b, (i + j) % 2 ? M.marble : M.marbleTan, -136 + i * 2, -40 + j * 2, -134 + i * 2, -38 + j * 2, 0.03);
  groundRect(b, Z.terrazzo, MU.x0, MU.z0, MU.x1, -40, 0.03);
  groundRect(b, Z.wood, HL.x0, -40, -136, -6, 0.03);
  q(b, Z.woodDark, XE + 0.15, 0.03, AX, 0.5, 0.06, 4.4);
  // the ceiling, and beams across it
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w - T, d - T), Z.white);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(xc, H - 0.02, zc);
  put(b, ceil);
  for (const x of [-111, -120.3, -129.6]) q(b, Z.cream, x, H - 0.25, (F.z0 + F.z1) / 2, 0.6, 0.5, F.z1 - F.z0);
  for (const z of [-30, -16]) q(b, Z.cream, (F.x0 + F.x1) / 2, H - 0.3, z, F.x1 - F.x0, 0.6, 0.7);
  for (const x of [-115, -125, -135, -145, -155]) q(b, Z.woodDark, x, H - 0.2, (MU.z0 + MU.z1) / 2, 0.4, 0.4, MU.z1 - MU.z0);
  for (const x of [-144, -152, -160, -168]) q(b, Z.cream, x, H - 0.25, (HL.z0 + HL.z1) / 2, 0.6, 0.5, HL.z1 - HL.z0);
  // a roof overhead is what tells the game it is indoors
  b.collide({ x: xc, z: zc, hx: w / 2, hz: d / 2, y0: H, y1: H + 0.4, mapKind: 'none', tag: 'roof' });
  b.collide({ x: xc, z: zc, hx: w / 2, hz: d / 2, y1: 0.05, blocksMove: false, blocksShots: false, mapKind: 'building', tag: 'footprint' });
  box(b, M.roof, xc, H + 0.5, zc, w + 0.6, 1, d + 0.6);
  box(b, Z.snow, xc, H + 1.12, zc, w + 0.9, 0.25, d + 0.9, 0, false);
  // the fly tower over the stage
  box(b, Z.cream, -180.5, 10.4, AX, 18, 4.8, 33);
  box(b, Z.snow, -180.5, 12.92, AX, 18.5, 0.25, 33.5, 0, false);

  // ---- the outer walls (the east one has the way in from the square) ----
  wallRun(c, true, B.z0 + T / 2, B.x0, XE, { t: T, hi: Z.woodDark, cast: true });
  wallRun(c, true, B.z1 - T / 2, B.x0, XE, { t: T, lo: Z.white, cast: true });
  wallRun(c, false, B.x0 + T / 2, B.z0 + T, B.z1 - T, { t: T, hi: M.velvet, cast: true });
  wallRun(c, false, XE - T / 2, B.z0 + T, -40, { t: T, lo: Z.woodDark, cast: true });
  wallRun(c, false, XE - T / 2, -40, B.z1 - T, { t: T, lo: Z.white, cast: true, doors: [{ at: AX, w: 4.4, h: 4.4 }] });
  // ---- the walls between the rooms ----
  // museum | hall and foyer: a doorway from the hall's cross aisle, a wider one from the foyer
  // (Baba Yaga's stage: open across the stage's depth into the north wing, `stageHouse`)
  wallRun(c, true, -40, B.x0 + T, -136, { lo: Z.woodDark, hi: M.velvet, doors: [{ at: DK.cover[0]!.x, w: 3, h: 3.2 }, WING_OPENING] });
  wallRun(c, true, -40, -136, F.x1, { lo: Z.woodDark, hi: Z.white, doors: [{ at: -116, w: 4, h: 3.6 }] });
  // hall | foyer: the middle doors on the carpet, a door to each side aisle
  wallRun(c, false, -136, F.z0, -6, { lo: M.velvet, hi: Z.white, doors: [{ at: -38.2, w: 2.4, h: 3 }, { at: AX, w: 4.4, h: 3.8 }, { at: -7.8, w: 2.4, h: 3 }] });
  wallRun(c, false, -136, -6, F.z1, { hi: Z.white });
  wallRun(c, true, -6, B.x0 + T, -136, { lo: M.velvet, doors: [WING_OPENING] });
  wallRun(c, false, -160, MU.z0, -40, { hi: Z.woodDark });
  // behind the stage's wings and south of the hall there are only workshops: shut (the wings themselves are the stage's: `stageHouse`)
  const NW = DK.northWing;
  const SW = DK.southWing;
  solid(c, (B.x0 + T - 160.2) / 2, (MU.z0 + NW.z0 - 0.2) / 2, -160.2 - (B.x0 + T), NW.z0 - 0.2 - MU.z0, H, 'zarya-beyond', { kind: 'none' });
  solid(c, (NW.x1 + 0.2 - 160.2) / 2, (NW.z0 - 0.2 - 40.2) / 2, -160.2 - NW.x1 - 0.2, -40.2 - NW.z0 + 0.2, H, 'zarya-beyond', { kind: 'none' });
  solid(c, (SW.x1 + 0.2 - 136.2) / 2, (-5.8 + F.z1) / 2, -136.2 - SW.x1 - 0.2, F.z1 + 5.8, H, 'zarya-beyond', { kind: 'none' });
  solid(c, (B.x0 + T + SW.x1 + 0.2) / 2, (SW.z1 + 0.2 + F.z1) / 2, SW.x1 + 0.2 - (B.x0 + T), F.z1 - SW.z1 - 0.2, H, 'zarya-beyond', { kind: 'none' });

  // ---- what shows from the square, over the wall: lit windows in the corner south of the Palace's front ----
  for (const z of [4.2, 7.4]) {
    box(b, Z.warm, XE + 0.03, 4.9, z, 0.06, 2.4, 1.5, 0, false);
    box(b, Z.white, XE + 0.05, 3.62, z, 0.12, 0.12, 1.8, 0, false);
    box(b, Z.snow, XE + 0.08, 3.72, z, 0.2, 0.08, 1.8, 0, false);
  }
  for (let i = 0; i < 6; i++) box(b, Z.warm, -182 + i * 14, 4.4, B.z1 + 0.03, 2.2, 2.6, 0.06, 0, false);
}

// ---------------------------------------------------------------------------------------------------------------------
// the foyer
// ---------------------------------------------------------------------------------------------------------------------

function column(c: Ctx, x: number, z: number): void {
  const { b } = c;
  q(b, Z.white, x, 0.3, z, 1.2, 0.6, 1.2);
  cyl(b, Z.white, x, 0.6, z, 0.46, 0.4, H - 1.2, 14, false);
  cyl(b, Z.gold, x, 0.6, z, 0.5, 0.5, 0.12, 14, false);
  cyl(b, Z.gold, x, H - 0.78, z, 0.44, 0.44, 0.14, 14, false);
  q(b, Z.white, x, H - 0.3, z, 1.2, 0.6, 1.2);
  for (const s of [-1, 1]) {
    q(b, Z.brass, x + s * 0.52, 3.0, z, 0.2, 0.06, 0.06);
    orb(b, Z.bulb, x + s * 0.62, 3.14, z, 0.12);
  }
  solid(c, x, z, 1.0, 1.0, H, 'zarya-column', { kind: 'wall' });
}

function chandelier(c: Ctx, x: number, z: number): void {
  const { b } = c;
  cyl(b, Z.brass, x, 5.6, z, 0.04, 0.04, H - 5.6, 6, false);
  cyl(b, Z.brass, x, 4.3, z, 0.1, 0.18, 1.3, 8, false);
  const ring = (r: number, y: number, n: number): void => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 28), Z.brass);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    put(b, m);
    for (let i = 0; i < 4; i++) q(b, Z.brass, x, y, z, r * 2, 0.03, 0.03, (i * Math.PI) / 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      q(b, Z.bulb, px, y + 0.17, pz, 0.09, 0.22, 0.09);
      q(b, Z.white, px, y - 0.15, pz, 0.04, 0.2, 0.04);
    }
  };
  ring(2.1, 4.5, 18);
  ring(1.4, 5.0, 12);
  ring(0.7, 5.45, 8);
  orb(b, Z.bulb, x, 4.16, z, 0.24);
  b.light({ x, y: 4.3, z, color: 0xffd9a0, intensity: 44, distance: 32, mode: 'steady', pool: 10, glow: 2.4, weight: 1.5 });
}

function foyer(c: Ctx): void {
  const { b } = c;
  // dark lozenges in the marble (not under the carpets)
  for (let x = -134; x < F.x1 - 1; x += 4) {
    for (let z = -38; z < 1; z += 4) {
      if (Math.abs(z - AX) < 2.2 || (Math.abs(x + 116) < 2.1 && z < AX)) continue;
      q(b, M.marbleDark, x, 0.036, z, 0.5, 0.012, 0.5, Math.PI / 4);
    }
  }
  // the red carpet: from the way in, through the foyer and the middle doors, down the hall's middle aisle to the stage
  const cx0 = DK.apron.x1 - 0.05;
  const cx1 = F.x1 - 0.4;
  q(b, M.velvet, (cx0 + cx1) / 2, 0.045, AX, cx1 - cx0, 0.03, 2.8);
  for (const s of [-1, 1]) q(b, Z.gold, (cx0 + cx1) / 2, 0.045, AX + s * 1.46, cx1 - cx0, 0.03, 0.12);
  // and a branch of it to the museum's door
  q(b, M.velvet, -116, 0.045, (F.z0 - 0.2 + AX - 1.52) / 2, 2.4, 0.03, AX - 1.52 - (F.z0 - 0.2));

  for (const x of [-111, -120.3, -129.6]) for (const z of [-30, -16]) column(c, x, z);
  chandelier(c, -120.3, AX);
  for (const z of [-30, -16]) for (const x of [-129.6, -120.3]) garland(b, x, z, x + 9.3, z, 5.8, 20);
  bulbString(b, -129.6, 6, -30, -129.6, 6, -16, 22, 0.7);
  bulbString(b, -111, 6, -30, -111, 6, -16, 22, 0.7);

  // the walls: piers with lamps
  for (const x of [-107.6, -112.6, -124, -131.6]) pilaster(b, x, F.z0, 0, 1);
  for (const z of [-35.8, -27.6, -18.4, -10.6, -3]) pilaster(b, F.x0, z, 1, 0);
  for (const z of [-28.6, -17.4, -9, 0]) pilaster(b, F.x1, z, -1, 0);
  // the middle doors' leaves, folded back into the foyer
  for (const s of [-1, 1]) {
    const z = AX + s * 2.26;
    q(b, Z.wood, F.x0 + 1.05, 1.85, z, 2.1, 3.7, 0.08);
    for (const y of [1.0, 2.7]) q(b, Z.woodDark, F.x0 + 1.05, y, z - s * 0.05, 1.5, 1.2, 0.03);
    q(b, Z.brass, F.x0 + 1.9, 1.3, z - s * 0.08, 0.05, 0.5, 0.05);
    solid(c, F.x0 + 1.05, z, 2.1, 0.12, 3.7, 'zarya-door', { kind: 'none', surface: 'wood' });
  }
  // posters for the pageant between the doors (shapes, no words), benches under them
  for (const [z, k] of [[-31.6, 0], [-14.4, 1]] as const) {
    for (let i = 0; i < 3; i++) {
      q(b, Z.woodDark, F.x0 + 0.1, 2.7, z - 1.9 + i * 1.9, 0.04, 1.9, 1.4);
      q(b, [M.night, Z.cream, M.dusk][(i + k) % 3]!, F.x0 + 0.13, 2.7, z - 1.9 + i * 1.9, 0.02, 1.7, 1.2);
      q(b, [Z.gold, Z.red, Z.white][(i + k) % 3]!, F.x0 + 0.15, 2.9, z - 1.9 + i * 1.9, 0.02, 0.6, 0.6, 0);
      q(b, [Z.white, Z.greenDark, Z.red][(i + k) % 3]!, F.x0 + 0.15, 2.15, z - 1.9 + i * 1.9, 0.02, 0.3, 0.9);
    }
    banquette(c, F.x0 + 0.5, z, 5.2, 1, 0);
  }
  banquette(c, -127.8, F.z0 + 0.5, 5.4, 0, 1);
  banquette(c, -110.4, F.z0 + 0.5, 3.6, 0, 1);

  // ---- the New Year fir, in a striped tub, presents under it ----
  const T0 = DK.fir;
  firTree(b, T0.x, T0.z, 5.6, { lights: true, star: true, seed: 9, y: 0.5 });
  cyl(b, Z.red, T0.x, 0, T0.z, 1.3, 1.3, 0.5, 18, false);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    q(b, Z.white, T0.x + Math.cos(a) * 1.3, 0.25, T0.z + Math.sin(a) * 1.3, 0.5, 0.5, 0.05, -a + Math.PI / 2);
  }
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.2;
    const s = 0.3 + (i % 3) * 0.1;
    q(b, GOODS[(i * 3) % GOODS.length]!, T0.x + Math.cos(a) * 1.75, s / 2, T0.z + Math.sin(a) * 1.75, s * 1.3, s, s, a);
    q(b, Z.gold, T0.x + Math.cos(a) * 1.75, s / 2, T0.z + Math.sin(a) * 1.75, s * 1.32, s + 0.01, 0.05, a);
  }
  solid(c, T0.x, T0.z, 2.4, 2.4, 1, 'zarya-tub', { shots: false, kind: 'prop', surface: 'wood' });
  solid(c, T0.x, T0.z, 1.2, 1.2, 5.6, 'zarya-tree', { kind: 'none', surface: 'wood' });
  b.light({ x: T0.x + 2, y: 5.2, z: T0.z + 1, color: 0xffcf96, intensity: 24, distance: 24, mode: 'steady', pool: 7, weight: 1 });

  // ---- the cloakroom along the south wall: a long counter, two rows of coats behind it, numbered pegs' brass tags ----
  const cz = 2;
  counter(c, -121.5, cz, 23, false, 71, { goods: [Z.brass, Z.woodPale, Z.cream] });
  for (const x of [-133.1, -109.9]) {
    q(b, Z.woodDark, x, 1.75, cz, 0.3, 3.5, 0.3);
    solid(c, x, cz, 0.3, 0.3, 3.5, 'zarya-post', { kind: 'none', surface: 'wood' });
  }
  q(b, Z.woodDark, -121.5, 3.3, cz, 23.5, 0.4, 0.3);
  for (let i = 0; i < 23; i++) q(b, i % 2 ? M.velvet : Z.redDark, -132.5 + i, 2.95, cz, 1, 0.3 + (i % 2) * 0.12, 0.08);
  for (const rz of [5.6, 9.0]) {
    q(b, Z.steel, -121.5, 1.9, rz, 21, 0.05, 0.05);
    for (let k = 0; k < 40; k++) q(b, GOODS[(k * 3 + (rz > 6 ? 2 : 0)) % GOODS.length]!, -131.7 + k * 0.52, 1.25, rz, 0.34, 1.2, 0.5);
    for (let k = 0; k < 40; k += 3) q(b, Z.plush, -131.7 + k * 0.52, 2.02, rz, 0.3, 0.14, 0.3);
    for (let k = 0; k < 8; k++) cyl(b, Z.steel, -132 + k * 3, 0, rz, 0.04, 0.04, 1.9, 5, false);
    solid(c, -121.5, rz, 21, 0.7, 1.9, 'zarya-rack', { kind: 'prop', surface: 'wood' });
  }
  b.light({ x: -121.5, y: 3.4, z: 4, color: 0xffd0a0, intensity: 16, distance: 15, mode: 'steady', pool: 5, weight: 0.8 });
  // a potted fir either side of the way in, a bench in the corner by the cloakroom
  for (const s of [-1, 1]) {
    const z = AX + s * 4;
    cyl(b, Z.white, F.x1 - 1, 0, z, 0.36, 0.46, 0.7, 10, false);
    firTree(b, F.x1 - 1, z, 2.2, { y: 0.6 });
    solid(c, F.x1 - 1, z, 0.9, 0.9, 1.6, 'zarya-tub', { shots: false, kind: 'none', surface: 'concrete' });
  }
  banquette(c, F.x1 - 0.5, 5.6, 5, -1, 0);

  // ---- the box office, built out from the east wall north of the way in: a lit window behind a brass grille ----
  const kz = -33;
  const kx = F.x1 - 1.5;
  q(b, Z.wood, kx, 1.4, kz, 3, 2.8, 5);
  q(b, Z.woodDark, kx, 0.5, kz, 3.08, 1.0, 5.08);
  q(b, Z.woodDark, kx, 2.9, kz, 3.4, 0.22, 5.4);
  q(b, Z.red, kx - 1.56, 2.5, kz, 0.06, 0.46, 2.6);
  q(b, Z.gold, kx - 1.55, 2.5, kz, 0.05, 0.56, 2.7);
  q(b, Z.warm, kx - 1.52, 1.72, kz, 0.04, 0.9, 1.5);
  for (const dz of [-0.8, 0.8]) q(b, Z.woodDark, kx - 1.54, 1.72, kz + dz, 0.08, 1.06, 0.1);
  for (const y of [1.2, 2.24]) q(b, Z.woodDark, kx - 1.54, y, kz, 0.08, 0.1, 1.7);
  for (let i = 0; i < 6; i++) q(b, Z.brass, kx - 1.58, 1.9, kz - 0.62 + i * 0.25, 0.025, 0.56, 0.025);
  q(b, Z.woodPale, kx - 1.72, 1.16, kz, 0.44, 0.05, 1.9);
  for (const dz of [-1.8, 1.8]) {
    q(b, Z.cream, kx - 1.53, 1.75, kz + dz, 0.03, 1.1, 0.8);
    q(b, dz < 0 ? Z.red : M.dusk, kx - 1.55, 1.9, kz + dz, 0.02, 0.5, 0.5);
  }
  solid(c, kx, kz, 3, 5, 2.9, 'zarya-kassa', { kind: 'prop', surface: 'wood' });
  // the queue's ropes
  for (const dz of [-1.3, 1.3]) {
    for (const x of [-108.8, -111.6]) {
      cyl(b, Z.brass, x, 0, kz + dz, 0.05, 0.05, 1, 6, false);
      cyl(b, Z.brass, x, 0, kz + dz, 0.16, 0.14, 0.05, 8, false);
      solid(c, x, kz + dz, 0.2, 0.2, 1, 'zarya-post', { shots: false, kind: 'none', surface: 'metal' });
    }
    q(b, M.velvet, -110.2, 0.9, kz + dz, 2.8, 0.06, 0.06);
  }
  b.light({ x: -110.5, y: 4.2, z: -33.5, color: 0xffc98a, intensity: 20, distance: 18, mode: 'steady', pool: 6, weight: 0.8 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the museum
// ---------------------------------------------------------------------------------------------------------------------

/** A tall window onto the night, between red drapes, on the museum's north wall. */
function nightWindow(b: LevelBuilder, x: number): void {
  const z = MU.z0;
  q(b, M.night, x, 4.05, z + 0.03, 2.6, 4.3, 0.06);
  q(b, M.dusk, x, 2.3, z + 0.04, 2.6, 0.8, 0.06);
  // the park's firs, out in the dark
  flatFir(b, Z.fir, x - 0.5, 1.9, z + 0.09, 2.6, 1.4, true);
  flatFir(b, Z.fir, x + 0.7, 1.9, z + 0.085, 1.7, 1.0, true);
  for (const dx of [-0.45, 0.45]) q(b, Z.white, x + dx, 4.05, z + 0.13, 0.07, 4.3, 0.08);
  for (const y of [3.3, 4.9]) q(b, Z.white, x, y, z + 0.13, 2.6, 0.07, 0.08);
  for (const dx of [-1.36, 1.36]) q(b, Z.white, x + dx, 4.05, z + 0.12, 0.14, 4.5, 0.14);
  for (const y of [1.84, 6.26]) q(b, Z.white, x, y, z + 0.12, 2.86, 0.14, 0.18);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) q(b, k % 2 ? Z.redDark : M.velvet, x + s * (1.55 + k * 0.2), 3.9, z + 0.2 + (k % 2) * 0.05, 0.22, 5.0, 0.16);
    q(b, Z.gold, x + s * 1.75, 2.6, z + 0.26, 0.66, 0.1, 0.22);
  }
  q(b, Z.redDark, x, 6.5, z + 0.24, 4.3, 0.56, 0.3);
}

function sickleCase(c: Ctx): void {
  const { b } = c;
  const { x, z } = DK.sickleCase;
  q(b, Z.woodDark, x, 0.45, z, 1.9, 0.9, 1.2);
  q(b, Z.wood, x, 0.93, z, 2.0, 0.06, 1.3);
  // the glass: a steel frame round nothing
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) q(b, Z.steel, x + sx * 0.93, 1.6, z + sz * 0.58, 0.05, 1.3, 0.05);
  for (const sz of [-1, 1]) q(b, Z.steel, x, 2.25, z + sz * 0.58, 1.91, 0.05, 0.05);
  for (const sx of [-1, 1]) q(b, Z.steel, x + sx * 0.93, 2.25, z, 0.05, 0.05, 1.21);
  // the tools, crossed on a board of red cloth tipped back to be looked at from the south
  const g = new THREE.Group();
  const put = (mat: THREE.Material, px: number, py: number, pz: number, sx: number, sy: number, sz: number, rz = 0): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(px, py, pz);
    m.rotation.z = rz;
    m.receiveShadow = true;
    g.add(m);
  };
  put(Z.gold, 0, 0, -0.05, 1.62, 1.32, 0.04);
  put(Z.redDark, 0, 0, -0.03, 1.5, 1.2, 0.05);
  // the sickle: its handle at the lower left, the blade bent round under, up the right and over the top, wide at the
  // handle and drawn to a point
  const cx = 0.04;
  const cy = 0.08;
  const rr = 0.34;
  const a0 = 4.0;
  const a1 = 8.9;
  const n = 13;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const a = a0 + (a1 - a0) * t;
    put(Z.steel, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.02, ((a1 - a0) / n) * rr * 1.25, 0.12 * (1 - t) + 0.025, 0.03, a + Math.PI / 2);
  }
  put(Z.woodPale, cx + Math.cos(a0) * rr - 0.6 * 0.18, cy + Math.sin(a0) * rr - 0.8 * 0.18, 0.02, 0.4, 0.09, 0.07, 0.927);
  // the hammer across it: its head at the upper left
  const ha = (Math.PI * 3) / 4;
  put(Z.woodPale, cx, cy, 0.07, 0.94, 0.07, 0.06, ha);
  put(Z.iron, cx + Math.cos(ha) * 0.42, cy + Math.sin(ha) * 0.42, 0.07, 0.17, 0.38, 0.15, ha);
  g.rotation.x = -0.55;
  g.position.set(x, 1.56, z);
  b.add(g, { cast: false });
  solid(c, x, z, 1.9, 1.2, 2.25, 'zarya-case', { kind: 'prop', surface: 'glass' });
}

/** The museum guard's cabinet against the north wall: tall, dark, locked; the Cossack sabre hangs in it behind a grille. */
function sabreCabinet(c: Ctx): void {
  const { b } = c;
  const x = DK.cabinet.x;
  const z0 = MU.z0;
  const zf = z0 + 0.9;
  q(b, Z.woodDark, x, 1.4, z0 + 0.45, 1.6, 2.8, 0.9);
  q(b, Z.wood, x, 2.87, z0 + 0.48, 1.8, 0.14, 1.0);
  q(b, Z.wood, x, 0.2, z0 + 0.48, 1.7, 0.4, 0.98);
  q(b, M.velvet, x, 1.55, zf + 0.005, 1.24, 2.1, 0.02);
  // the sabre: a curved blade from the hilt at the lower left to the point at the upper right
  const dx = 0.7;
  const dy = 1.45;
  const L = Math.hypot(dx, dy);
  const pt = (s: number): [number, number] => {
    const k = 0.17 * Math.sin(Math.PI * s);
    return [x - 0.36 + dx * s + (dy / L) * k, 0.85 + dy * s - (dx / L) * k];
  };
  for (let i = 0; i < 9; i++) {
    const [ax, ay] = pt(i / 9);
    const [ex, ey] = pt((i + 1) / 9);
    slab(b, Z.steel, (ax + ex) / 2, (ay + ey) / 2, zf + 0.04, Math.hypot(ex - ax, ey - ay) * 1.1, 0.08 - i * 0.006, 0.02, 0, 0, Math.atan2(ey - ay, ex - ax), false);
  }
  const [gx, gy] = pt(0);
  const [g1x, g1y] = pt(0.05);
  const ang = Math.atan2(g1y - gy, g1x - gx);
  slab(b, Z.black, gx - Math.cos(ang) * 0.14, gy - Math.sin(ang) * 0.14, zf + 0.04, 0.26, 0.06, 0.04, 0, 0, ang, false);
  slab(b, Z.brass, gx, gy, zf + 0.045, 0.05, 0.28, 0.05, 0, 0, ang, false);
  slab(b, Z.brass, gx - Math.cos(ang) * 0.29, gy - Math.sin(ang) * 0.29, zf + 0.04, 0.08, 0.09, 0.05, 0, 0, ang, false);
  // the door's frame (the grille and its padlock are the story's own: `zarya/look.ts` swings them open)
  for (const s of [-1, 1]) q(b, Z.wood, x + s * 0.69, 1.55, zf + 0.06, 0.14, 2.24, 0.14);
  for (const y of [0.43, 2.67]) q(b, Z.wood, x, y, zf + 0.06, 1.52, 0.14, 0.14);
  solid(c, x, z0 + 0.5, 1.7, 1.0, 2.9, 'zarya-cabinet', { kind: 'prop', surface: 'wood' });
}

/** The town in miniature on a table: the square and its fir, the Palace, the store, the blocks, the line, the plant's chimney. */
function townModel(c: Ctx, x: number, z: number): void {
  const { b } = c;
  q(b, Z.woodDark, x, 0.42, z, 5, 0.84, 2.6);
  q(b, Z.wood, x, 0.87, z, 5.1, 0.06, 2.7);
  q(b, Z.snow, x, 0.93, z, 4.8, 0.06, 2.4);
  const y0 = 0.96;
  const house = (mat: THREE.Material, px: number, pz: number, sx: number, sy: number, sz: number): void => {
    q(b, mat, x + px, y0 + sy / 2, z + pz, sx, sy, sz);
    q(b, Z.snow, x + px, y0 + sy + 0.012, z + pz, sx + 0.03, 0.024, sz + 0.03);
  };
  q(b, Z.paving, x - 0.15, y0 + 0.004, z + 0.05, 1.7, 0.01, 1.1);
  // the Palace and its columns on the west of the square, the store on the east
  house(Z.cream, -1.25, 0.05, 0.3, 0.2, 0.62);
  for (let i = 0; i < 5; i++) q(b, Z.white, x - 1.07, y0 + 0.08, z - 0.18 + i * 0.115, 0.025, 0.16, 0.025);
  house(Z.concrete, 1.0, 0.05, 0.5, 0.2, 0.72);
  q(b, Z.warm, x + 0.745, y0 + 0.07, z + 0.05, 0.01, 0.06, 0.5);
  // panel blocks to the south and behind them, the garages
  for (let i = 0; i < 4; i++) house(Z.concrete, -1.5 + i * 0.85, 0.82, 0.62, 0.24, 0.14);
  for (let i = 0; i < 3; i++) house(Z.grey, -1.1 + i * 0.85, 1.05, 0.62, 0.2, 0.12);
  for (let i = 0; i < 6; i++) house(Z.red, 1.5 + (i % 3) * 0.16, 0.85 + Math.floor(i / 3) * 0.2, 0.14, 0.07, 0.16);
  // the line along the north with a tram on it, the fir in the middle of the square, the ice town
  q(b, Z.steel, x, y0 + 0.006, z - 0.72, 4.6, 0.012, 0.05);
  q(b, Z.red, x + 0.3, y0 + 0.045, z - 0.72, 0.36, 0.07, 0.08);
  cyl(b, Z.fir, x - 0.2, y0, z, 0.1, 0, 0.34, 7, false);
  q(b, Z.bulb, x - 0.2, y0 + 0.35, z, 0.03, 0.03, 0.03);
  for (let i = 0; i < 4; i++) q(b, Z.snowBlue, x - 0.8 + (i % 2) * 0.22, y0 + 0.04, z + 0.36 + Math.floor(i / 2) * 0.2, 0.05, 0.08, 0.05);
  // the heating plant and its chimney, the pond, the Institute behind its fence
  house(Z.concreteDark, 1.95, -1.0, 0.34, 0.16, 0.3);
  cyl(b, Z.red, x + 2.15, y0, z - 0.95, 0.035, 0.028, 0.52, 6, false);
  cyl(b, Z.snowBlue, x + 0.9, y0, z - 1.02, 0.3, 0.3, 0.012, 12, false);
  house(Z.grey, -1.95, -0.95, 0.4, 0.34, 0.3);
  house(Z.grey, -1.6, -1.0, 0.2, 0.18, 0.2);
  for (const [px, pz, h] of [[-0.6, -1.0, 0.2], [-0.3, -1.05, 0.26], [0.1, -1.0, 0.18], [-2.1, 0.5, 0.22], [2.1, 0.3, 0.2], [1.8, 0.2, 0.16]] as const) cyl(b, Z.fir, x + px, y0, z + pz, 0.06, 0, h, 6, false);
  // the glass over it: a steel frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) q(b, Z.steel, x + sx * 2.5, 1.25, z + sz * 1.3, 0.05, 0.7, 0.05);
  for (const sz of [-1, 1]) q(b, Z.steel, x, 1.6, z + sz * 1.3, 5.05, 0.05, 0.05);
  for (const sx of [-1, 1]) q(b, Z.steel, x + sx * 2.5, 1.6, z, 0.05, 0.05, 2.65);
  solid(c, x, z, 5.1, 2.7, 1.6, 'zarya-model', { shots: false, kind: 'prop', surface: 'wood' });
}

function museum(c: Ctx): void {
  const { b } = c;
  const zn = MU.z0;
  const zs = MU.z1;
  const mid = (zn + zs) / 2;
  for (const x of [-109.5, -119, -129, -139, -149]) nightWindow(b, x);
  // a runner down the room
  q(b, M.carpet, (MU.x0 + MU.x1) / 2, 0.04, zs - 2.6, MU.x1 - MU.x0 - 3, 0.02, 1.8);

  // ---- the north wall, between the windows ----
  // a red banner, fringed in gold
  q(b, Z.gold, -114.2, 4.7, zn + 0.14, 1.9, 0.07, 0.07);
  q(b, Z.red, -114.2, 3.4, zn + 0.1, 1.6, 2.5, 0.04);
  q(b, Z.gold, -114.2, 2.1, zn + 0.1, 1.6, 0.14, 0.05);
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.17 : 0.42;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }), Z.gold);
  star.position.set(-114.2, 3.7, zn + 0.12);
  put(b, star);
  // the plaque: brass on a dark board, lines of raised lettering nobody can make out from here, a lamp over it
  const P = DK.plaque;
  q(b, Z.woodDark, P.x, 2.47, zn + 0.07, 2.5, 2.0, 0.08);
  q(b, Z.gold, P.x, 2.4, zn + 0.1, 1.86, 1.26, 0.04);
  q(b, Z.brass, P.x, 2.4, zn + 0.12, 1.7, 1.1, 0.05);
  for (let i = 0; i < 5; i++) q(b, Z.gold, P.x, 2.74 - i * 0.17, zn + 0.15, [0.7, 1.3, 1.1, 1.3, 0.5][i]!, 0.05, 0.02);
  q(b, Z.brass, P.x, 3.42, zn + 0.2, 0.05, 0.05, 0.36);
  q(b, Z.brass, P.x, 3.38, zn + 0.38, 1.0, 0.1, 0.12);
  q(b, Z.bulb, P.x, 3.32, zn + 0.38, 0.9, 0.03, 0.08);
  // the photographs: the first Ded Moroz in the big one
  const Ph = DK.photo;
  q(b, Z.woodDark, Ph.x, 2.6, zn + 0.07, 4.9, 2.3, 0.06);
  picture(b, Ph.x, 2.97, zn + 0.08, 0, 1, 1.5, 1.15, 3, true);
  for (const s of [-1, 1]) picture(b, Ph.x + s * 1.55, 2.97, zn + 0.08, 0, 1, 0.9, 1.15, 4 + s);
  for (let i = 0; i < 4; i++) picture(b, Ph.x - 1.65 + i * 1.1, 1.9, zn + 0.08, 0, 1, 0.8, 0.52, 6 + i);
  // a painting of the town in winter, in a gilt frame
  q(b, Z.gold, -144, 3.0, zn + 0.09, 2.9, 1.8, 0.06);
  q(b, M.night, -144, 3.25, zn + 0.13, 2.6, 1.0, 0.02);
  q(b, Z.snow, -144, 2.5, zn + 0.13, 2.6, 0.5, 0.02);
  q(b, Z.cream, -144.5, 2.95, zn + 0.145, 0.9, 0.5, 0.02);
  for (let i = 0; i < 4; i++) q(b, Z.warm, -144.8 + i * 0.2, 2.95, zn + 0.16, 0.07, 0.2, 0.01);
  q(b, Z.concrete, -143.3, 3.05, zn + 0.145, 0.5, 0.7, 0.02);
  flatFir(b, Z.fir, -143.9, 2.7, zn + 0.16, 0.9, 0.5, true);
  sabreCabinet(c);
  // the attendant's chair beside it
  q(b, Z.wood, -157.6, 0.45, zn + 0.5, 0.5, 0.06, 0.5);
  q(b, Z.wood, -157.6, 0.75, zn + 0.28, 0.5, 0.7, 0.06);
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2]) q(b, Z.woodDark, -157.6 + sx, 0.22, zn + 0.5 + sz, 0.05, 0.44, 0.05);
  solid(c, -157.6, zn + 0.5, 0.5, 0.5, 0.9, 'zarya-chair', { shots: false, kind: 'none', surface: 'wood' });

  // ---- on the floor: the sickle and hammer, the town in miniature, the first satellite, a bust at the east end ----
  sickleCase(c);
  townModel(c, -126, mid + 0.25);
  q(b, Z.cream, -136, 0.6, mid, 0.9, 1.2, 0.9);
  q(b, Z.white, -136, 1.23, mid, 1.0, 0.06, 1.0);
  cyl(b, Z.brass, -136, 1.26, mid, 0.03, 0.03, 0.3, 5, false);
  orb(b, Z.steel, -136, 1.78, mid, 0.26, 1, 12);
  for (const [ry, rz] of [[0.4, 0.3], [-0.4, 0.3], [0.4, -0.3], [-0.4, -0.3]] as const) slab(b, Z.steel, -136 - 0.5, 1.78 + rz * 0.5, mid + ry * 0.55, 0.9, 0.018, 0.018, 0, -ry, -rz, false);
  solid(c, -136, mid, 0.9, 0.9, 2.1, 'zarya-case', { kind: 'none' });
  const bx = MU.x1 - 1.6;
  q(b, Z.cream, bx, 0.65, mid, 0.8, 1.3, 0.8);
  q(b, Z.white, bx, 1.33, mid, 0.9, 0.06, 0.9);
  q(b, Z.white, bx, 1.5, mid, 0.5, 0.28, 0.3);
  orb(b, Z.white, bx, 1.84, mid, 0.2, 1.15, 10);
  solid(c, bx, mid, 0.8, 0.8, 2, 'zarya-case', { kind: 'none' });
  for (const s of [-1, 1]) {
    slab(b, Z.brass, bx + 0.9, 1.7, mid + s * 1.5, 0.04, 3.4, 0.04, s * 0.12, 0, 0, false);
    q(b, Z.red, bx + 0.84, 2.6, mid + s * 1.75, 0.03, 1.3, 0.8);
  }
  // the east wall: a map of the north with the town marked on it
  q(b, Z.woodDark, MU.x1 - 0.06, 3.2, mid, 0.06, 2.6, 4.6);
  q(b, Z.snowBlue, MU.x1 - 0.1, 3.2, mid, 0.02, 2.4, 4.4);
  for (const [dz, y, w, h, k] of [[-1.2, 3.5, 1.8, 1.2, 0], [0.6, 3.0, 2.2, 1.4, 1], [1.5, 3.9, 1.0, 0.6, 0]] as const) q(b, k ? Z.cream : Z.green, MU.x1 - 0.12, y, mid + dz, 0.02, h, w);
  q(b, Z.red, MU.x1 - 0.14, 3.3, mid + 0.2, 0.02, 0.16, 0.16, 0);
  for (let i = 0; i < 6; i++) q(b, Z.red, MU.x1 - 0.14, 3.2 - i * 0.12, mid + 0.4 + i * 0.22, 0.02, 0.04, 0.1);

  // ---- along the south wall: glass cases of small things, pictures over them ----
  const cases: readonly (readonly [number, number])[] = [[-109.5, 6], [-126, 8], [-138, 8], [-147, 5.5]];
  cases.forEach(([x, len], i) => {
    counter(c, x, zs - 0.7, len, false, 90 + i * 7, { goods: [Z.brass, Z.iron, Z.cream, Z.red, Z.woodPale] });
    for (let k = 0; k < Math.floor(len / 2.4); k++) picture(b, x - len / 2 + 1.2 + k * 2.4, 2.5, zs, 0, -1, 1.3, 0.9, i * 3 + k);
  });
  // a samovar and a miner's lamp on two of them
  cyl(b, Z.brass, -124, 1.05, zs - 0.7, 0.18, 0.14, 0.46, 10, false);
  cyl(b, Z.brass, -124, 1.51, zs - 0.7, 0.07, 0.05, 0.18, 8, false);
  cyl(b, Z.iron, -139.5, 1.05, zs - 0.7, 0.09, 0.09, 0.3, 8, false);
  q(b, Z.bulb, -139.5, 1.2, zs - 0.7, 0.1, 0.12, 0.1);
  // the west end: a long case under a row of portraits
  counter(c, MU.x0 + 0.9, mid, 5.5, true, 53, { goods: [Z.gold, Z.red, Z.cream, Z.iron] });
  for (let i = 0; i < 3; i++) picture(b, MU.x0, 2.7, mid - 1.9 + i * 1.9, 1, 0, 1.2, 1.5, 11 + i, i === 1);

  for (const x of [-110, -122, -134, -146, -156]) pendant(b, x, mid, 5.2, 0.24);
  for (const x of [-113, -134, -152]) b.light({ x, y: 4.8, z: mid, color: 0xffcf96, intensity: 24, distance: 22, mode: 'steady', pool: 7, weight: 1 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the auditorium
// ---------------------------------------------------------------------------------------------------------------------

function seats(c: Ctx): void {
  const { b } = c;
  const S = DK.seats;
  for (const sec of S.sections) {
    for (const blk of S.blocks) {
      const zc = (blk.z0 + blk.z1) / 2;
      const len = blk.z1 - blk.z0;
      const n = Math.round(len / 0.6);
      for (let i = 0; i < sec.rows; i++) {
        const x = sec.x + i * S.pitch;
        q(b, Z.woodDark, x, 0.14, zc, 0.36, 0.28, len - 0.1);
        q(b, Z.redDark, x - 0.03, 0.36, zc, 0.56, 0.16, len);
        q(b, M.velvet, x + 0.3, 0.66, zc, 0.12, 0.84, len);
        q(b, Z.woodDark, x + 0.375, 0.62, zc, 0.03, 0.8, len);
        for (let k = 0; k <= n; k++) q(b, Z.woodDark, x, 0.53, blk.z0 + (k * len) / n, 0.5, 0.22, 0.06);
      }
      const x0 = sec.x - 0.34;
      const x1 = sec.x + (sec.rows - 1) * S.pitch + 0.4;
      solid(c, (x0 + x1) / 2, zc, x1 - x0, len + 0.06, 1.1, 'zarya-seats', { shots: false, kind: 'prop', surface: 'wood' });
    }
  }
}

function stage(c: Ctx): void {
  const { b } = c;
  const S = DK.stage;
  const A = DK.apron;
  const top = DK.stageTop;
  const xc = (S.x0 + S.x1) / 2;
  const w = S.x1 - S.x0;
  const d = S.z1 - S.z0;
  // the boards: a platform a step high (a floor: walkers and the infected step onto it), and the thrust in front
  q(b, Z.woodPale, xc, top / 2, AX, w, top, d);
  q(b, Z.woodPale, (A.x0 + A.x1) / 2, top / 2, AX, A.x1 - A.x0, top, A.z1 - A.z0);
  for (let z = S.z0 + 1; z < S.z1; z += 1) q(b, Z.wood, xc, top + 0.003, z, w, 0.006, 0.04);
  q(b, Z.woodDark, S.x1 + 0.02, top / 2 - 0.01, AX, 0.04, top - 0.02, d);
  q(b, Z.woodDark, A.x1 + 0.02, top / 2 - 0.01, AX, 0.04, top - 0.02, A.z1 - A.z0);
  for (const z of [A.z0 - 0.02, A.z1 + 0.02]) q(b, Z.woodDark, (A.x0 + A.x1) / 2, top / 2 - 0.01, z, A.x1 - A.x0, top - 0.02, 0.04);
  b.collide({ x: xc, z: AX, hx: w / 2, hz: d / 2, y0: 0, y1: top, floor: true, surface: 'wood', mapKind: 'none', tag: 'zarya-stage' });
  b.collide({ x: (A.x0 + A.x1) / 2, z: AX, hx: (A.x1 - A.x0) / 2, hz: (A.z1 - A.z0) / 2, y0: 0, y1: top, floor: true, surface: 'wood', mapKind: 'none', tag: 'zarya-stage' });
  // the revolve: its iron rim, flat in the floor (the disc of darker boards that turns, and the hut, are the stage's own: `zarya/stageLook.ts`)
  const hut = DK.hut;
  cyl(b, Z.iron, hut.x, top, hut.z, 3.1, 3.1, 0.012, 40, false);

  // ---- the back: a night sky, a moon, a painted forest in two rows of flats, drifts of cotton snow ----
  const xb = S.x0 + 0.25;
  q(b, M.night, xb - 0.05, top + 3.3, AX, 0.1, 6.6, d);
  q(b, M.dusk, xb + 0.01, top + 1.0, AX, 0.02, 2.0, d);
  const moon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.03, 24), Z.cream);
  moon.rotation.z = Math.PI / 2;
  moon.position.set(xb + 0.04, 5.3, AX - 8.5);
  put(b, moon);
  for (let i = 0; i < 16; i++) q(b, Z.white, xb + 0.03, 3.6 + ((i * 53) % 29) * 0.1, S.z0 + 1 + ((i * 37) % 26), 0.01, 0.07, 0.07, 0);
  for (let i = 0; i < 11; i++) flatFir(b, i % 2 ? Z.greenDark : Z.fir, xb + 0.07, top, S.z0 + 1.6 + i * 2.5, 3.4 + ((i * 7) % 5) * 0.55, 2.2 + ((i * 3) % 4) * 0.3);
  for (let i = 0; i < 7; i++) {
    const z = S.z0 + 2.4 + i * 3.9;
    if (Math.abs(z - AX) < 2.5) continue;
    flatFir(b, Z.fir, S.x0 + 1.2, top, z, 2.4 + ((i * 5) % 3) * 0.6, 1.9);
    slab(b, Z.wood, S.x0 + 0.8, top + 0.5, z, 0.05, 1.3, 0.05, 0, 0, 0.6, false);
  }
  for (let i = 0; i < 9; i++) orb(b, Z.snow, S.x0 + 1 + (i % 2) * 0.3, top, S.z0 + 1.5 + i * 3.1, 0.9 + (i % 3) * 0.15, 0.4, 9);
  solid(c, S.x0 + 1, AX, 2, d, 6, 'zarya-scenery', { kind: 'none', surface: 'wood' });

  // ---- paper snowflakes on threads, in a row before the forest (the hut walks the rest of the boards: none over it) ----
  for (let i = 0; i < 19; i++) {
    const x = S.x0 + 1.9 + ((i * 5) % 3) * 0.12;
    const z = S.z0 + 2 + i * 1.33;
    const y = 4.0 + ((i * 53) % 11) * 0.2;
    const sz = 0.55 + ((i * 17) % 5) * 0.14;
    q(b, Z.white, x, (y + H) / 2, z, 0.012, H - y, 0.012);
    for (let k = 0; k < 3; k++) slab(b, Z.white, x, y, z, 0.02, sz, 0.08, (k * Math.PI) / 3 + i, 0, 0, false);
    for (let k = 0; k < 3; k++) slab(b, Z.white, x, y, z, 0.022, sz * 0.5, 0.2, (k * Math.PI) / 3 + i + Math.PI / 6, 0, 0, false);
  }

  // ---- the arch: a pier at each corner of the boards, the beam across, the pelmet, the curtains drawn back ----
  for (const s of [-1, 1]) {
    const pz = AX + s * (d / 2);
    q(b, Z.cream, S.x1, H / 2, pz, 1.0, H, 1.0);
    q(b, Z.white, S.x1, 0.4, pz, 1.14, 0.8, 1.14);
    q(b, Z.gold, S.x1, 5.4, pz, 1.1, 0.16, 1.1);
    solid(c, S.x1, pz, 1.0, 1.0, H, 'zarya-pier', { kind: 'wall' });
    // a lamp on its face, toward the hall
    q(b, Z.brass, S.x1 + 0.6, 3.0, pz, 0.2, 0.06, 0.06);
    orb(b, Z.bulb, S.x1 + 0.7, 3.14, pz, 0.13);
    // the curtain, gathered on the boards beside it
    for (let k = 0; k < 7; k++) q(b, k % 2 ? Z.redDark : M.velvet, S.x1 - 0.3 - (k % 2) * 0.07, top + 2.7, pz - s * (0.64 + k * 0.28), 0.34, 5.4, 0.3);
    q(b, Z.gold, S.x1 - 0.3, top + 2.1, pz - s * 1.5, 0.5, 0.12, 2.0);
    solid(c, S.x1 - 0.3, pz - s * 1.5, 0.5, 2.0, 5.6, 'zarya-curtain', { kind: 'none', surface: 'wood' });
  }
  q(b, Z.cream, S.x1, 6.35, AX, 1.0, 1.3, d - 1);
  q(b, Z.gold, S.x1 + 0.52, 6.35, AX, 0.04, 0.5, 6);
  for (let i = 0; i < 13; i++) {
    const drop = (0.7 + Math.abs(Math.sin((i / 12) * Math.PI * 3)) * 0.5) * (Math.abs(i - 6) <= 1 ? 0.55 : 1);
    q(b, i % 2 ? Z.redDark : M.velvet, S.x1 + 0.1 + (i % 2) * 0.06, 5.72 - drop / 2, S.z0 + 1.1 + i * 2.15, 0.3, drop, 2.16);
  }
  q(b, Z.gold, S.x1 + 0.34, 5.05, AX, 0.03, 0.06, d - 2);
  // footlights along the thrust and the boards' front edge
  bulbString(b, A.x1 - 0.12, top + 0.06, A.z0 + 0.3, A.x1 - 0.12, top + 0.06, A.z1 - 0.3, 28, 0);
  for (const s of [-1, 1]) bulbString(b, S.x1 - 0.12, top + 0.06, AX + s * 9.4, S.x1 - 0.12, top + 0.06, AX + s * 13, 3, 0);

  // the stage's own light: warm from the front, blue on the forest
  b.light({ x: S.x1 - 3, y: 5.4, z: AX, color: 0xffd9a8, intensity: 36, distance: 26, mode: 'steady', pool: 8, weight: 1.3 });
  b.light({ x: S.x0 + 4, y: 4.6, z: AX, color: 0x7aa8ff, intensity: 24, distance: 20, mode: 'steady', pool: 6, weight: 1 });
}

function hall(c: Ctx): void {
  const { b } = c;
  seats(c);
  stage(c);
  stageHouse(c);
  // runners down the side aisles, and across the hall between the two sections of seats
  for (const z of [HL.z0 + 1.6, HL.z1 - 1.6]) q(b, M.carpet, (-136.2 + -167) / 2, 0.045, z, 30.8, 0.03, 2.2);
  q(b, M.carpet, DK.cover[0]!.x, 0.04, (HL.z0 + HL.z1) / 2, 2.4, 0.016, HL.z1 - HL.z0 - 0.3);
  // piers with lamps down both walls and across the back
  for (const x of [-141.5, -147.5, -158.5, -164.5]) {
    pilaster(b, x, HL.z0, 0, 1);
    pilaster(b, x, HL.z1, 0, -1);
  }
  for (const z of [AX - 9.5, AX + 9.5]) pilaster(b, HL.x1, z, -1, 0);
  // red drapes between them (the hall's acoustics), a gilt rail over each
  for (const [x, north] of [[-144.5, true], [-161.5, true], [-144.5, false], [-153, false], [-161.5, false]] as const) {
    const z = north ? HL.z0 : HL.z1;
    const s = north ? 1 : -1;
    for (let k = 0; k < 8; k++) q(b, k % 2 ? Z.redDark : M.velvet, x - 1.4 + k * 0.4, 3.5, z + s * (0.1 + (k % 2) * 0.04), 0.4, 3.6, 0.1);
    q(b, Z.gold, x, 5.36, z + s * 0.14, 3.5, 0.1, 0.12);
  }
  // the projection room's window over the middle doors
  q(b, Z.woodDark, HL.x1 - 0.06, 5.1, AX, 0.06, 0.9, 2.2);
  q(b, Z.warm, HL.x1 - 0.1, 5.1, AX, 0.03, 0.6, 0.5);
  for (const s of [-1, 1]) q(b, Z.black, HL.x1 - 0.1, 5.1, AX + s * 0.7, 0.03, 0.4, 0.4);
  // lamps over the seats (a real light in two of them)
  for (const x of [-144, -152, -160]) for (const z of [AX - 8, AX + 8]) pendant(b, x, z, 5.6, 0.26);
  for (const x of [-145, -159]) b.light({ x, y: 5.2, z: AX, color: 0xffcf96, intensity: 24, distance: 24, mode: 'steady', pool: 8, weight: 1 });
  for (const z of [AX - 11.5, AX + 11.5]) garland(b, -138, z, -168, z, 5.6, 44);
}

// ---------------------------------------------------------------------------------------------------------------------
// Baba Yaga's stage house (`zarya/stage.ts`): the wings, the fly gallery and its stair, the orchestra pit, and the fixed
// parts of the four machines (what moves - the revolve's disc, the open trap, the bars, the winch's wheel, the pit's
// lever, the follow-spot's head - is drawn by `zarya/stageLook.ts`)
// ---------------------------------------------------------------------------------------------------------------------

function stageHouse(c: Ctx): void {
  const { b } = c;
  const top = DK.stageTop;
  const NW = DK.northWing;
  const SW = DK.southWing;
  const S = DK.stage;
  const board = (x0: number, z0: number, x1: number, z1: number): void => {
    q(b, Z.woodDark, (x0 + x1) / 2, top / 2, (z0 + z1) / 2, x1 - x0, top, z1 - z0);
    for (let x = x0 + 1; x < x1; x += 1) q(b, Z.black, x, top + 0.003, (z0 + z1) / 2, 0.03, 0.006, z1 - z0);
    b.collide({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y0: 0, y1: top, floor: true, surface: 'wood', mapKind: 'none', tag: 'zarya-stage' });
  };

  // ---- the wings: boards at the stage's height (out to the hall's side wall, and the strip beside the stage inside it) ----
  board(NW.x0, NW.z0, NW.x1, -40.2);
  board(NW.x0, -40.2, S.x1, S.z0);
  board(SW.x0, -5.8, SW.x1, SW.z1);
  board(SW.x0, S.z1, S.x1, -5.8);
  // their walls, painted black backstage
  wallRun(c, true, NW.z0 - 0.2, B.x0 + T, NW.x1 + 0.4, { t: 0.4 });
  wallRun(c, false, NW.x1 + 0.2, NW.z0 - 0.4, -40.2, { t: 0.4 });
  wallRun(c, true, SW.z1 + 0.2, B.x0 + T, SW.x1 + 0.4, { t: 0.4 });
  wallRun(c, false, SW.x1 + 0.2, -5.8, SW.z1 + 0.4, { t: 0.4 });
  q(b, Z.black, (NW.x0 + NW.x1) / 2, H / 2, NW.z0 + 0.01, NW.x1 - NW.x0, H, 0.02);
  q(b, Z.black, NW.x1 - 0.01, H / 2, (NW.z0 - 40) / 2, 0.02, H, -40 - NW.z0);
  q(b, Z.black, (SW.x0 + SW.x1) / 2, H / 2, SW.z1 - 0.01, SW.x1 - SW.x0, H, 0.02);
  q(b, Z.black, SW.x1 - 0.01, H / 2, (SW.z1 - 6) / 2, 0.02, H, SW.z1 + 6);
  q(b, Z.black, B.x0 + T + 0.03, H / 2, (NW.z0 - 40) / 2, 0.02, H, -40 - NW.z0);
  q(b, Z.black, B.x0 + T + 0.03, H / 2, (SW.z1 - 6) / 2, 0.02, H, SW.z1 + 6);
  // black masking legs hanging at the wing's edge either side (they hide the wings from the stalls; the hut walks between them)
  for (const z of [S.z0 - 0.6, S.z1 + 0.6]) {
    for (const x of [-185.5, -178.5]) {
      for (let k = 0; k < 4; k++) q(b, Z.black, x - 0.54 + k * 0.36, (top + H) / 2, z + (k % 2) * 0.06, 0.38, H - top, 0.05);
      solid(c, x, z, 1.44, 0.16, H, 'zarya-masking', { shots: false, kind: 'none', surface: 'wood' });
    }
  }

  // ---- the fly gallery: a deck 2.7 m up along the north wing's back wall (stacked scenery under it), a steel stair ----
  const G = DK.gallery;
  const gt = DK.galleryTop;
  const gx = (G.x0 + G.x1) / 2;
  const gz = (G.z0 + G.z1) / 2;
  q(b, Z.wood, gx, gt - 0.06, gz, G.x1 - G.x0, 0.12, G.z1 - G.z0);
  for (let x = G.x0 + 0.5; x < G.x1; x += 0.5) q(b, Z.woodDark, x, gt + 0.002, gz, 0.02, 0.004, G.z1 - G.z0);
  q(b, Z.black, gx, (gt - 0.12) / 2, G.z1 - 0.02, G.x1 - G.x0, gt - 0.12, 0.04);
  b.collide({ x: gx, z: gz, hx: (G.x1 - G.x0) / 2, hz: (G.z1 - G.z0) / 2, y0: 0, y1: gt, floor: true, surface: 'wood', mapKind: 'none', tag: 'zarya-gallery' });
  // steel beams under its edge, and painted flats stacked against the face below it (a sky, a hut's wall, a birch wood)
  q(b, Z.iron, gx, gt - 0.22, G.z1 + 0.05, G.x1 - G.x0, 0.2, 0.12);
  for (let x = G.x0 + 2; x < G.x1 - 0.5; x += 3.4) q(b, Z.iron, x, (gt - 0.3) / 2, G.z1 + 0.05, 0.14, gt - 0.3, 0.14);
  const flats = [M.dusk, Z.fir, M.night, Z.cream, Z.woodPale, M.dusk, Z.greenDark];
  flats.forEach((mat, i) => slab(b, mat, G.x0 + 1.4 + i * 1.9, 1.1 + top, G.z1 + 0.16 + (i % 2) * 0.06, 1.7, 2.1, 0.05, -0.08, 0, 0, false));
  for (let i = 0; i < 4; i++) q(b, i % 2 ? Z.woodDark : Z.wood, G.x0 + 2.5 + i * 3.3, top + 0.3, G.z1 + 0.35, 0.8, 0.6, 0.5);
  // its rail along the open edge (the stair comes up at the east end)
  const st = DK.galleryStair;
  for (const y of [gt + 0.5, gt + 1.0]) q(b, Z.iron, (G.x0 + st.x0) / 2, y, G.z1 - 0.06, st.x0 - G.x0, 0.05, 0.05);
  for (let x = G.x0 + 0.3; x <= st.x0; x += 1.2) q(b, Z.iron, x, gt + 0.52, G.z1 - 0.06, 0.05, 1.04, 0.05);
  b.collide({ x: (G.x0 + st.x0) / 2, z: G.z1 - 0.06, hx: (st.x0 - G.x0) / 2, hz: 0.06, y0: gt, y1: gt + 1.05, mapKind: 'none', surface: 'metal', tag: 'zarya-gallery-rail' });
  // the stair: eight treads from the wing's boards up to the deck, rising north
  const steps = 8;
  const run = (st.z1 - st.z0) / steps;
  for (let k = 1; k <= steps; k++) {
    const t = top + (gt - top) * (k / steps);
    const z1 = st.z1 - (k - 1) * run;
    const z0 = z1 - run;
    q(b, Z.steel, (st.x0 + st.x1) / 2, t - 0.03, (z0 + z1) / 2, st.x1 - st.x0, 0.06, run);
    q(b, Z.black, (st.x0 + st.x1) / 2, (t - 0.06) / 2, z1 - 0.02, st.x1 - st.x0 - 0.1, t - 0.06, 0.03);
    b.collide({ x: (st.x0 + st.x1) / 2, z: (z0 + z1) / 2, hx: (st.x1 - st.x0) / 2, hz: run / 2, y0: 0, y1: t, floor: true, surface: 'metal', mapKind: 'none', tag: 'zarya-gallery-stair' });
  }
  // a stringer and a handrail up its open side
  const sl = Math.hypot(st.z1 - st.z0, gt - top);
  slab(b, Z.iron, st.x0 + 0.04, (top + gt) / 2 + 0.05, (st.z0 + st.z1) / 2, 0.06, 0.24, sl, Math.atan2(gt - top, st.z1 - st.z0), 0, 0, false);
  slab(b, Z.iron, st.x0 + 0.04, (top + gt) / 2 + 0.95, (st.z0 + st.z1) / 2, 0.05, 0.05, sl, Math.atan2(gt - top, st.z1 - st.z0), 0, 0, false);
  for (let k = 0; k <= 4; k++) {
    const f = k / 4;
    q(b, Z.iron, st.x0 + 0.04, top + (gt - top) * f + 0.5, st.z1 - (st.z1 - st.z0) * f, 0.04, 0.9, 0.04);
  }
  // the pin rail along the back wall: a timber rail of belaying pins, ropes going up into the dark to the bars, sandbags
  const R = DK.flyRail;
  q(b, Z.woodDark, (G.x0 + G.x1) / 2 - 1, gt + 0.95, NW.z0 + 0.25, G.x1 - G.x0 - 4, 0.16, 0.22);
  for (const y of [gt + 0.5, gt + 1.6]) q(b, Z.iron, (G.x0 + G.x1) / 2 - 1, y, NW.z0 + 0.12, G.x1 - G.x0 - 4, 0.08, 0.08);
  for (let i = 0; i < 18; i++) {
    const x = G.x0 + 1.6 + i * 0.66;
    q(b, Z.wood, x, gt + 0.95, NW.z0 + 0.3, 0.05, 0.42, 0.05);
    q(b, Z.cream, x, (gt + 1.2 + H) / 2, NW.z0 + 0.36, 0.025, H - gt - 1.2, 0.025);
    if (i % 3 === 1) q(b, Z.packed, x, gt + 2 + ((i * 7) % 5) * 0.55, NW.z0 + 0.42, 0.34, 0.5, 0.3);
  }
  // the three lines that work the bars, painted at the rail in red, white and blue, and a lamp over the place to stand
  [Z.red, Z.white, Z.blue].forEach((mat, i) => q(b, mat, R.x - 0.4 + i * 0.4, gt + 1.18, NW.z0 + 0.32, 0.12, 0.08, 0.06));
  q(b, Z.brass, R.x, gt + 2.3, NW.z0 + 0.14, 0.5, 0.06, 0.2);
  orb(b, Z.bulb, R.x, gt + 2.2, NW.z0 + 0.3, 0.12);
  b.light({ x: R.x, y: 5.2, z: NW.z0 + 2, color: 0x9ab8ff, intensity: 9, distance: 13, mode: 'steady', pool: 3, weight: 0.6 });

  // ---- the fly bars' blocks at the grid, over each bar's ends (the bars themselves move: `stageLook.ts`) ----
  for (const x of DK.bars) for (const z of [S.z0 + 2, S.z1 - 2]) q(b, Z.iron, x, H - 0.16, z, 0.3, 0.3, 0.2);

  // ---- the traps: chalked squares in the boards, numbered in dots (the revolve's own is on its disc: `stageLook.ts`) ----
  DK.traps.forEach((t, i) => {
    if (i === 0) return;
    for (const s of [-1, 1]) {
      q(b, Z.white, t.x + s * 0.8, top + 0.004, t.z, 0.05, 0.004, 1.65);
      q(b, Z.white, t.x, top + 0.004, t.z + s * 0.8, 1.65, 0.004, 0.05);
    }
    for (let k = 0; k <= i; k++) q(b, Z.white, t.x + 1.05, top + 0.004, t.z - 0.5 + k * 0.25, 0.1, 0.004, 0.1);
  });

  // ---- the winch that turns the revolve, against the south wing's wall: cast-iron frames, the cable in its channel ----
  const W = DK.winch;
  const wx = SW.x1 - 0.65;
  for (const dz of [-0.75, 0.75]) {
    slab(b, Z.iron, wx, top + 0.75, W.z + dz, 0.1, 1.6, 0.12, 0, 0, 0.22, false);
    slab(b, Z.iron, wx, top + 0.75, W.z + dz, 0.1, 1.6, 0.12, 0, 0, -0.22, false);
  }
  q(b, Z.iron, wx, top + 0.06, W.z, 1.1, 0.12, 1.8);
  q(b, Z.grey, wx + 0.2, top + 0.5, W.z, 0.5, 0.6, 1.0);
  solid(c, wx, W.z, 1.1, 1.8, 1.7, 'zarya-winch', { kind: 'prop', surface: 'metal' });
  // the cable: along the floor to the revolve
  q(b, Z.black, (wx + DK.hut.x) / 2, top + 0.004, W.z, wx - DK.hut.x, 0.004, 0.16);
  q(b, Z.black, DK.hut.x, top + 0.004, (W.z + DK.hut.z + 3.1) / 2, 0.16, 0.004, W.z - DK.hut.z - 3.1);
  q(b, Z.iron, SW.x1 - 0.06, 4.1, W.z, 0.12, 0.3, 0.3);
  orb(b, Z.redLamp, SW.x1 - 0.16, 4.1, W.z, 0.12);
  b.light({ x: W.x - 0.6, y: 3, z: W.z + 0.8, color: 0xff7a50, intensity: 9, distance: 9, mode: 'steady', pool: 3, weight: 0.7 });
  // the south wing's things: the carol-singers' rail of coats and masks, a prop table, a stack of flats
  q(b, Z.iron, -184, 1.9, SW.z1 - 0.7, 4.4, 0.05, 0.05);
  for (let i = 0; i < 9; i++) q(b, [M.velvet, Z.redDark, Z.cream, Z.woodDark, Z.green][i % 5]!, -186 + i * 0.48, 1.25, SW.z1 - 0.7, 0.36, 1.2, 0.5);
  for (let i = 0; i < 5; i++) {
    const x = -186.2 + i * 1.1;
    q(b, i % 2 ? Z.woodPale : Z.white, x, 2.6, SW.z1 - 0.12, 0.42, 0.5, 0.18);
    q(b, Z.black, x - 0.1, 2.68, SW.z1 - 0.2, 0.08, 0.08, 0.04);
    q(b, Z.black, x + 0.1, 2.68, SW.z1 - 0.2, 0.08, 0.08, 0.04);
  }
  q(b, Z.woodDark, -179.5, top + 0.8, SW.z1 - 0.7, 2.2, 0.08, 0.8);
  for (const [dx, dz] of [[-1, -0.3], [1, -0.3], [-1, 0.3], [1, 0.3]] as const) q(b, Z.woodDark, -179.5 + dx, top + 0.4, SW.z1 - 0.7 + dz, 0.06, 0.8, 0.06);
  q(b, Z.ice, -180, top + 0.95, SW.z1 - 0.7, 0.3, 0.22, 0.3);
  q(b, Z.brass, -179, top + 0.92, SW.z1 - 0.6, 0.24, 0.16, 0.24);
  solid(c, -179.5, SW.z1 - 0.7, 2.2, 0.8, 0.9, 'zarya-props', { kind: 'prop', surface: 'wood' });
  for (let i = 0; i < 5; i++) slab(b, [M.dusk, Z.fir, Z.cream, M.night, Z.greenDark][i]!, SW.x0 + 0.25 + i * 0.07, top + 1.3, -2 - i * 0.2, 0.05, 2.5, 2.2, 0, 0, 0.06, false);
  solid(c, SW.x0 + 0.5, -2.4, 0.9, 2.6, 2.6, 'zarya-flats', { kind: 'none', surface: 'wood' });

  // ---- the orchestra pit: a dark floor, a low panelled wall along the front row with a gap at the middle aisle ----
  const P = DK.pit;
  groundRect(b, Z.black, P.x0, P.z0, P.x1, P.z1, 0.036);
  for (const [z0, z1] of [[P.z0, -24.7], [-21.3, P.z1]] as const) {
    const zc = (z0 + z1) / 2;
    q(b, M.velvet, P.x1 - 0.06, 0.47, zc, 0.12, 0.94, z1 - z0);
    q(b, Z.brass, P.x1 - 0.06, 0.97, zc, 0.1, 0.05, z1 - z0);
    solid(c, P.x1 - 0.06, zc, 0.14, z1 - z0, 0.95, 'zarya-pit', { kind: 'prop', surface: 'wood' });
  }
  // the band's chairs and stands against the stage's front (the walkway along the wall stays clear), the timpani, the piano
  for (const [z0, z1] of [[-27.6, -25.2], [-20.6, -17]] as const) {
    for (let z = z0; z <= z1; z += 0.8) {
      for (const x of [-169.9, -169.05]) {
        q(b, Z.black, x, 0.45, z, 0.42, 0.04, 0.42);
        q(b, Z.black, x + 0.19, 0.7, z, 0.04, 0.5, 0.42);
        q(b, Z.iron, x - 0.45, 0.6, z, 0.02, 1.2, 0.02);
        slab(b, Z.black, x - 0.45, 1.15, z, 0.02, 0.32, 0.46, 0, 0, -0.35, false);
        q(b, Z.white, x - 0.43, 1.17, z, 0.01, 0.22, 0.32);
      }
    }
  }
  for (const [x, z] of [[-169.6, -31.3], [-168.5, -31.5]] as const) {
    cyl(b, Z.brass, x, 0, z, 0.32, 0.4, 0.7, 12, false);
    cyl(b, Z.cream, x, 0.7, z, 0.4, 0.4, 0.02, 12, false);
  }
  solid(c, -169.05, -31.4, 1.8, 0.9, 0.8, 'zarya-timpani', { kind: 'prop', surface: 'metal' });
  q(b, Z.woodDark, -169.2, 0.62, -15, 0.62, 1.24, 1.5);
  q(b, Z.white, -168.87, 0.82, -15, 0.04, 0.05, 1.3);
  q(b, Z.black, -168.85, 0.85, -15, 0.03, 0.02, 1.3);
  solid(c, -169.2, -15, 0.7, 1.55, 1.25, 'zarya-piano', { kind: 'prop', surface: 'wood' });
  // the trap room's levers against the thrust's front: an iron frame, the slate with the five traps chalked on it, a hatch
  const L = DK.trapLever;
  const lx = P.x0 + 0.16;
  q(b, Z.iron, lx, 0.06, L.z, 0.5, 0.12, 1.4);
  for (const dz of [-0.6, 0.6]) q(b, Z.iron, lx, 0.75, L.z + dz, 0.12, 1.4, 0.12);
  q(b, Z.iron, lx, 1.42, L.z, 0.14, 0.1, 1.32);
  q(b, Z.black, lx + 0.02, 1.98, L.z, 0.04, 0.8, 1.2);
  q(b, Z.woodDark, lx + 0.02, 1.98, L.z, 0.05, 0.86, 1.26);
  q(b, Z.black, lx + 0.05, 1.98, L.z, 0.02, 0.76, 1.16);
  DK.traps.forEach((t) => q(b, Z.white, lx + 0.07, 1.98 + (t.x + 180) * -0.06, L.z + (t.z + 23) * 0.06, 0.01, 0.08, 0.08));
  q(b, Z.woodDark, lx - 0.02, 0.62, L.z + 1.6, 0.06, 1.1, 0.9);
  q(b, Z.brass, lx + 0.03, 0.62, L.z + 1.92, 0.03, 0.08, 0.08);
  solid(c, lx, L.z, 0.5, 1.4, 1.5, 'zarya-trap-levers', { kind: 'prop', surface: 'metal' });

  // ---- the follow-spot at the back of the stalls: a tripod on a crate (its lamp turns to her: `stageLook.ts`) ----
  const Sp = DK.spot;
  const sx = Sp.x + 1.2;
  q(b, Z.woodDark, sx, 0.25, Sp.z, 0.9, 0.5, 0.9);
  for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) slab(b, Z.iron, sx + Math.cos(a) * 0.22, 0.95, Sp.z + Math.sin(a) * 0.22, 0.04, 0.95, 0.04, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25, false);
  q(b, Z.iron, sx, 1.45, Sp.z, 0.08, 0.2, 0.08);
  solid(c, sx, Sp.z, 0.9, 0.9, 1.6, 'zarya-spot', { kind: 'prop', surface: 'metal' });
}

// ---------------------------------------------------------------------------------------------------------------------
// the park behind the Palace: seen over the wall from the square and from above, never walked
// ---------------------------------------------------------------------------------------------------------------------

function park(c: Ctx): void {
  const { b } = c;
  groundRect(b, Z.snow, R.x0, R.z0, R.x1, R.z1, 0.004);
  const Ft = { x: -150, z: 33 };
  // the paths: from the Palace's south side to the fountain, and east to the wall
  groundRect(b, Z.packed, Ft.x - 2, B.z1, Ft.x + 2, Ft.z - 8, 0.012);
  groundRect(b, Z.packed, Ft.x - 9, Ft.z - 9, Ft.x + 9, Ft.z + 9, 0.012);
  groundRect(b, Z.packed, Ft.x + 9, Ft.z - 1.6, R.x1 - 1, Ft.z + 1.6, 0.012);
  // the fountain: a round basin full of snow, a bowl on a stem
  cyl(b, Z.concrete, Ft.x, 0, Ft.z, 5.2, 5.2, 0.7, 24, false);
  cyl(b, Z.snow, Ft.x, 0.5, Ft.z, 4.8, 4.8, 0.34, 24, false);
  cyl(b, Z.concrete, Ft.x, 0.6, Ft.z, 0.6, 0.4, 1.6, 10, false);
  cyl(b, Z.concrete, Ft.x, 2.2, Ft.z, 0.5, 1.4, 0.4, 14, false);
  orb(b, Z.snow, Ft.x, 2.6, Ft.z, 1.3, 0.3, 10);
  bench(c, Ft.x, Ft.z - 7.6, Math.PI);
  bench(c, Ft.x - 7.6, Ft.z, -Math.PI / 2);
  bench(c, Ft.x + 7.6, Ft.z - 4, Math.PI / 2);
  bench(c, -128, Ft.z - 2.4, Math.PI);
  lampPost(c, Ft.x - 7.4, Ft.z - 7.4, false);
  lampPost(c, Ft.x + 7.4, Ft.z + 7.4, false);
  lampPost(c, -122, Ft.z - 2.6, false);
  lampPost(c, -109, Ft.z + 2.6, false);
  // a low iron fence along the path east
  for (const s of [-1, 1]) {
    const z = Ft.z + s * 2.2;
    const x0 = Ft.x + 10;
    const x1 = R.x1 - 2;
    for (const y of [0.55, 0.95]) q(b, Z.iron, (x0 + x1) / 2, y, z, x1 - x0, 0.05, 0.05);
    for (let x = x0; x <= x1; x += 2.5) q(b, Z.iron, x, 0.55, z, 0.08, 1.1, 0.08);
  }
  // firs: a row along the wall (they show from the square), and a scatter over the rest
  const stood: [number, number][] = [];
  const fir = (x: number, z: number, h: number): void => {
    stood.push([x, z]);
    firTree(b, x, z, h);
  };
  for (const [x, z, h] of [[-110, 16, 9], [-111, 25, 11], [-110, 41, 10.5], [-112, 50, 9], [-109.5, 58, 11], [-111, 67, 10], [-121, 54, 8.5], [-124, 65, 10], [-134, 58, 9], [-110, -58, 9], [-111, -65, 10.5]] as const) fir(x, z, h);
  let s = 4177;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 140 && stood.length < 46; i++) {
    const x = R.x0 + 4 + rnd() * (R.x1 - R.x0 - 9);
    const z = R.z0 + 4 + rnd() * (R.z1 - R.z0 - 8);
    const h = 6 + rnd() * 5;
    if (x > B.x0 - 4 && z > B.z0 - 4 && z < B.z1 + 4) continue;
    if (Math.abs(x - Ft.x) < 12 && Math.abs(z - Ft.z) < 12) continue;
    if (Math.abs(x - Ft.x) < 4 && z > B.z1 && z < Ft.z) continue;
    if (x > Ft.x && Math.abs(z - Ft.z) < 5) continue;
    if (z > 43 && x < -140) continue; // nobody sees the far corner: bare snow
    if (stood.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7.5)) continue;
    fir(x, z, h);
  }
  // snow drifted against the Palace's back walls
  for (const [x, z, w, d, ry] of [[-150, B.z1 + 1.4, 30, 3, 0.02], [-120, B.z0 - 1.4, 26, 3, -0.02], [B.x0 - 1.4, -20, 3, 30, 0.01]] as const) slab(b, Z.snow, x, 0.2, z, w, 0.8, d, 0, ry, 0, false);

  // nobody gets out here: the park is shut on all three sides of the building
  solid(c, (R.x0 + B.x0) / 2, (R.z0 + R.z1) / 2, B.x0 - R.x0, R.z1 - R.z0, 3, 'zarya-beyond', { kind: 'none' });
  solid(c, (B.x0 + R.x1) / 2, (R.z0 + B.z0) / 2, R.x1 - B.x0, B.z0 - R.z0, 3, 'zarya-beyond', { kind: 'none' });
  solid(c, (B.x0 + R.x1) / 2, (B.z1 + R.z1) / 2, R.x1 - B.x0, R.z1 - B.z1, 3, 'zarya-beyond', { kind: 'none' });
}

export interface DkHandles {
  /** Nothing the story moves here yet. */
  none?: undefined;
}

export function buildDk(c: Ctx): DkHandles {
  park(c);
  shell(c);
  foyer(c);
  museum(c);
  hall(c);
  return {};
}
