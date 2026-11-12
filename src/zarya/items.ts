/**
 * ZARYA's collectables as things: a painted icon for each (the HUD, the feed, the journal, the bench card) and a small
 * model of it lying where it lies in the town (instead of the old amber glint).
 *
 *   ICONS   `public/zarya/icons/<id>.webp`, 128 px, made by `scripts/zarya-icons.mjs` (a part's or a find's own id,
 *           `modpart`, the repairman's tools `iron` `screwdrivers` `multimeter`, the ornaments `orn0`..`orn5`).
 *   MODELS  a handful of plain-coloured boxes, tubes and balls each (`MODEL`), real size times `GROW` so they read from a
 *           few metres. Every model in town is merged into ONE mesh (`ItemMarks`): one draw call for all of them, however
 *           many there are. Each vertex knows which item it belongs to, and a taken item's vertices fold into a point,
 *           so taking one never rebuilds anything. A soft rim of light pulses round each, in its kind's colour (amber
 *           for parts and finds, cold blue for the repairman's tools, brass for mod parts, each ornament its own glass),
 *           and each is lit a little by its own colour, so it still reads in a dark room.
 *
 * Where each lies: `ITEM_Y` is the height of the surface under it (measured in the town with a ray down from the old
 * glint, then checked by eye, 2026-11-12), so a model stands on its counter, shelf or the floor. Where the old glint hung
 * over nothing (the shelter kit, the tea room, housewares, the pipe rack, the shovel rack, the garages' yard), the thing
 * now lies on the floor or the ground below it.
 */
import * as THREE from 'three';
import { MOD_PARTS, ORNAMENTS, TOOLS } from './story';
import { TOWN } from './unlock';

// ---------------------------------------------------------------------------------------------
// icons
// ---------------------------------------------------------------------------------------------

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
/** Every icon there is a picture of. */
const ICONS = new Set([
  ...['tube', 'cartridges', 'handle', 'fuse', 'shears', 'pipes', 'tape', 'nailer', 'canister', 'strips', 'tubes', 'crate', 'cord', 'blade', 'shaft', 'guard', 'samovar', 'coil', 'valve', 'vesna'],
  ...['skillet', 'skiPole', 'chain', 'maul', 'modpart', 'iron', 'screwdrivers', 'multimeter'],
  ...['orn0', 'orn1', 'orn2', 'orn3', 'orn4', 'orn5'],
]);
/** The repairman's three tools, in the order of `TOOLS`. */
export const TOOL_IDS = ['iron', 'screwdrivers', 'multimeter'] as const;

/** The picture for `id`, or '' when there is none. */
export function iconUrl(id: string): string {
  return ICONS.has(id) ? `${BASE}zarya/icons/${id}.webp` : '';
}
export const partIcon = (i: number): string => iconUrl(TOWN.parts[i]?.id ?? '');
export const toolIcon = (i: number): string => iconUrl(TOOL_IDS[i] ?? '');
export const ornamentIcon = (i: number): string => iconUrl(`orn${i}`);
export const MOD_ICON = iconUrl('modpart');

let preloaded = false;
/** Fetch every icon once, so the first pickup's line does not show an empty badge. */
export function preloadIcons(): void {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;
  for (const id of ICONS) {
    const im = new Image();
    im.decoding = 'async';
    im.src = iconUrl(id);
  }
}

// ---------------------------------------------------------------------------------------------
// the models
// ---------------------------------------------------------------------------------------------

/** Every model is made at its real size, then grown by this much so it reads from a few metres. */
const GROW = 1.45;
const Y = new THREE.Vector3(0, 1, 0);

/** Plain-coloured pieces gathered into one geometry (positions, normals, colours; no index). */
class Kit {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly v = new THREE.Vector3();
  private readonly nm = new THREE.Matrix3();

  private push(g: THREE.BufferGeometry, color: number, m: THREE.Matrix4): this {
    const q = g.index ? g.toNonIndexed() : g;
    const P = q.attributes.position!;
    const N = q.attributes.normal!;
    this.nm.getNormalMatrix(m);
    this.c.setHex(color);
    for (let i = 0; i < P.count; i++) {
      this.v.fromBufferAttribute(P, i).applyMatrix4(m);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.v.fromBufferAttribute(N, i).applyMatrix3(this.nm).normalize();
      this.nor.push(this.v.x, this.v.y, this.v.z);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    if (q !== g) q.dispose();
    g.dispose();
    return this;
  }

  put(g: THREE.BufferGeometry, c: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    this.e.set(rx, ry, rz, 'YXZ');
    return this.push(g, c, this.m.compose(this.p.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(sx, sy, sz)));
  }

  box(c: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0): this {
    return this.put(new THREE.BoxGeometry(sx, sy, sz), c, x, y, z, rx, ry, rz);
  }

  /** A tube standing on its middle at `y` (a cone with `rt` = 0). */
  cyl(c: number, x: number, y: number, z: number, rt: number, rb: number, h: number, seg = 8, rx = 0, ry = 0, rz = 0): this {
    return this.put(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, rx, ry, rz);
  }

  ball(c: number, x: number, y: number, z: number, r: number, sx = 1, sy = 1, sz = 1, seg = 8): this {
    return this.put(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), c, x, y, z, 0, 0, 0, sx, sy, sz);
  }

  /** A tube from a to b, `r0` thick at a and `r1` at b. */
  rod(c: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1 = r0, seg = 6): this {
    this.s.set(bx - ax, by - ay, bz - az);
    const len = this.s.length();
    this.q.setFromUnitVectors(Y, this.s.divideScalar(len || 1));
    return this.push(new THREE.CylinderGeometry(r1, r0, len, seg), c, this.m.compose(this.p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), this.q, this.s.set(1, 1, 1)));
  }

  torus(c: number, x: number, y: number, z: number, R: number, r: number, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2, seg = 12): this {
    return this.put(new THREE.TorusGeometry(R, r, 5, seg, arc), c, x, y, z, rx, ry, rz);
  }

  /** A profile of [radius, height] points turned round the upright. */
  lathe(c: number, pts: readonly (readonly [number, number])[], seg = 10, x = 0, y = 0, z = 0): this {
    return this.put(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), c, x, y, z);
  }
}

// colours
const STEEL = 0x9aa3ad;
const DSTEEL = 0x5a626c;
const IRON = 0x2b2c30;
const BRASS = 0xc9a040;
const WOOD = 0x9a6a3a;
const PALE = 0xcfae78;
const RED = 0xc0261e;
const BLACK = 0x1c1d20;
const CARD = 0xb08850;
const GOLD = 0xe2b030;
const GLASS = [0xd8262e, 0x3a78e0, 0xe0a820, 0x2fa860, 0x9a4ad0, 0xd8dee8];

/** Each model, made at real size lying on y = 0, about its own centre. */
const MODEL: Record<string, (k: Kit) => void> = {
  // ---- the Signalka ----
  tube: (k) => {
    k.cyl(0xe8601c, 0, 0.032, 0, 0.032, 0.032, 0.22, 10, 0, 0, Math.PI / 2);
    k.cyl(0x2a1a10, 0.112, 0.032, 0, 0.024, 0.024, 0.006, 10, 0, 0, Math.PI / 2);
    k.box(0x3a3a3e, -0.1, 0.04, 0, 0.05, 0.07, 0.045).box(0x3a3a3e, -0.115, 0.0, 0, 0.03, 0.06, 0.035, 0, 0, 0.3);
    k.box(DSTEEL, -0.06, 0.068, 0, 0.03, 0.016, 0.02);
  },
  cartridges: (k) => {
    k.box(CARD, 0, 0.03, 0, 0.17, 0.06, 0.12).box(0x8a6438, 0, 0.061, 0.062, 0.17, 0.002, 0.05, 0, -0.9);
    const caps = [0xd02a20, 0x2fa84a, 0xeeeeee, 0xd02a20, 0x2fa84a, 0xeeeeee];
    for (let i = 0; i < 6; i++) {
      const x = -0.052 + (i % 3) * 0.052;
      const z = i < 3 ? -0.026 : 0.026;
      k.cyl(BRASS, x, 0.07, z, 0.019, 0.019, 0.03, 8).cyl(caps[i]!, x, 0.1, z, 0.018, 0.019, 0.04, 8);
    }
  },
  // ---- Line One ----
  handle: (k) => {
    k.box(DSTEEL, 0, 0.02, 0, 0.04, 0.04, 0.04);
    k.rod(0xd0d6dc, 0, 0.03, 0, 0, 0.13, 0, 0.012).rod(0xd0d6dc, 0, 0.13, 0, 0.07, 0.19, 0, 0.012);
    k.ball(BLACK, 0.075, 0.2, 0, 0.032, 1, 1, 1, 10);
  },
  fuse: (k) => {
    k.cyl(0xeeeae0, 0, 0.028, 0, 0.026, 0.026, 0.11, 10, 0, 0, Math.PI / 2);
    for (const s of [-1, 1]) k.cyl(BRASS, s * 0.065, 0.028, 0, 0.029, 0.029, 0.026, 10, 0, 0, Math.PI / 2).box(BRASS, s * 0.095, 0.028, 0, 0.04, 0.008, 0.03);
  },
  // ---- the bolt cutters ----
  shears: (k) => {
    for (const s of [-1, 1]) {
      k.box(STEEL, 0.06, 0.012, s * 0.012, 0.12, 0.006, 0.022, s * 0.22);
      k.rod(RED, -0.005, 0.012, 0, -0.17, 0.012, s * 0.05, 0.012, 0.014);
    }
    k.cyl(DSTEEL, 0, 0.016, 0, 0.012, 0.012, 0.014, 8);
  },
  pipes: (k) => {
    k.rod(0x7a8088, -0.2, 0.022, -0.06, 0.2, 0.022, 0.06, 0.021).rod(0x8a6a58, -0.18, 0.064, 0.09, 0.18, 0.064, -0.07, 0.021);
    for (const [x, z] of [[-0.2, -0.06], [0.2, 0.06]] as const) k.cyl(DSTEEL, x, 0.022, z, 0.024, 0.024, 0.03, 8, 0, Math.atan2(0.12, 0.4), Math.PI / 2);
  },
  tape: (k) => {
    k.torus(0x1c1c1e, 0, 0.026, 0, 0.042, 0.022, Math.PI / 2, 0, 0, Math.PI * 2, 14);
    k.cyl(0xb89868, 0, 0.026, 0, 0.026, 0.026, 0.046, 12).box(0x1c1c1e, 0.07, 0.003, 0.02, 0.06, 0.004, 0.044, 0.3);
  },
  // ---- the nail gun ----
  nailer: (k) => {
    k.box(0xe8b820, 0, 0.11, 0, 0.24, 0.1, 0.06).box(0x3a3d42, -0.06, 0.05, 0, 0.05, 0.11, 0.045, 0, 0, -0.25);
    k.cyl(0x3a3d42, 0.15, 0.1, 0, 0.022, 0.026, 0.07, 8, 0, 0, Math.PI / 2).box(0x6a7078, 0.08, 0.03, 0, 0.17, 0.035, 0.03);
    k.box(0x3a3d42, -0.12, 0.13, 0, 0.03, 0.05, 0.05);
  },
  canister: (k) => {
    k.cyl(0x2f5fb0, 0, 0.12, 0, 0.068, 0.068, 0.24, 12).ball(0x2f5fb0, 0, 0.24, 0, 0.068, 1, 0.55, 1, 12);
    k.cyl(BRASS, 0, 0.3, 0, 0.016, 0.02, 0.05, 8).cyl(0xeeeeee, 0.03, 0.31, 0, 0.022, 0.022, 0.012, 10, 0, 0, Math.PI / 2);
  },
  strips: (k) => {
    for (let i = 0; i < 3; i++) {
      k.box(0xc8ccd2, 0, 0.012 + i * 0.016, 0, 0.2, 0.012, 0.055, i * 0.08 - 0.08);
      k.box(0x8a9098, 0, 0.012 + i * 0.016, 0.03, 0.2, 0.014, 0.008, i * 0.08 - 0.08);
    }
    k.box(0xe8dcb8, 0, 0.026, 0, 0.03, 0.05, 0.065);
  },
  // ---- the Salyut ----
  tubes: (k) => {
    const at = [[0, 0], [0.064, 0], [-0.064, 0], [0.032, 0.055], [-0.032, 0.055], [0.032, -0.055], [-0.032, -0.055]] as const;
    for (const [x, z] of at) k.cyl(0xc0281e, x, 0.11, z, 0.031, 0.031, 0.22, 8).cyl(GOLD, x, 0.17, z, 0.032, 0.032, 0.03, 8).cyl(0x2a1810, x, 0.221, z, 0.022, 0.022, 0.003, 8);
    k.torus(0xd8c8a0, 0, 0.08, 0, 0.098, 0.005, Math.PI / 2);
  },
  crate: (k) => {
    k.box(0x8a5a30, 0, 0.1, 0, 0.42, 0.2, 0.28);
    for (const y of [0.04, 0.16]) k.box(0x6a4220, 0, y, 0.142, 0.42, 0.04, 0.006).box(0x6a4220, 0, y, -0.142, 0.42, 0.04, 0.006);
    k.box(0xd8c070, 0, 0.2, 0, 0.38, 0.02, 0.24);
    for (let i = 0; i < 5; i++) {
      const x = -0.15 + i * 0.075;
      const z = (i % 2 ? 0.05 : -0.05);
      const tip = 0.36 + (i % 3) * 0.03;
      k.rod(0xc0281e, x, 0.12, z, x + 0.02, tip, z, 0.022).cyl(GOLD, x + 0.02, tip + 0.035, z, 0, 0.024, 0.07, 8);
    }
  },
  cord: (k) => {
    for (let i = 0; i < 4; i++) k.torus(0x3f7a2a, 0, 0.008 + i * 0.012, 0, 0.075 - i * 0.004, 0.0075, Math.PI / 2, 0, 0, Math.PI * 2, 14);
    k.rod(0x3f7a2a, 0.072, 0.008, 0, 0.17, 0.008, 0.07, 0.0075).ball(0x222222, 0.17, 0.008, 0.07, 0.01);
  },
  // ---- the Rogatina ----
  blade: (k) => {
    k.put(new THREE.OctahedronGeometry(1, 0), 0xc8d0d8, 0.05, 0.012, 0, 0, 0, 0, 0.13, 0.01, 0.05);
    k.box(DSTEEL, -0.1, 0.012, 0, 0.05, 0.01, 0.02).cyl(0x6a4024, -0.15, 0.016, 0, 0.016, 0.016, 0.09, 8, 0, 0, Math.PI / 2);
  },
  shaft: (k) => {
    k.rod(PALE, -0.5, 0.019, 0, 0.42, 0.019, 0, 0.019);
    k.torus(BLACK, 0.47, 0.019, 0, 0.05, 0.011, Math.PI / 2, 0, -Math.PI / 2, Math.PI).rod(BLACK, 0.47, 0.019, -0.05, 0.47, 0.019, 0.05, 0.012);
  },
  guard: (k) => {
    k.box(IRON, 0, 0.018, 0, 0.22, 0.034, 0.034).torus(IRON, 0, 0.018, 0, 0.034, 0.011, Math.PI / 2);
    for (const s of [-1, 1]) k.ball(IRON, s * 0.115, 0.018, 0, 0.024);
  },
  // ---- the Ottepel ----
  samovar: (k) => {
    k.lathe(BRASS, [[0, 0], [0.08, 0], [0.08, 0.02], [0.04, 0.05], [0.05, 0.08], [0.11, 0.13], [0.12, 0.2], [0.1, 0.28], [0.05, 0.31], [0.05, 0.34], [0, 0.34]], 12);
    for (const s of [-1, 1]) k.box(BLACK, s * 0.14, 0.24, 0, 0.03, 0.05, 0.022);
    k.rod(BRASS, 0, 0.1, 0.11, 0, 0.09, 0.17, 0.01).box(BLACK, 0, 0.11, 0.165, 0.03, 0.012, 0.012);
    k.ball(0xf2ece0, 0, 0.39, 0, 0.055, 1, 0.8, 1, 10).ball(0xc8402a, 0, 0.39, 0.05, 0.018, 1, 1, 0.4).ball(0xf2ece0, 0, 0.44, 0, 0.012);
  },
  coil: (k) => {
    k.cyl(0x6a6e74, 0, 0.006, 0, 0.11, 0.11, 0.012, 14);
    for (const R of [0.03, 0.055, 0.08]) k.torus(0xe0601c, 0, 0.02, 0, R, 0.007, Math.PI / 2, 0, 0, Math.PI * 2, 16);
    for (const s of [-1, 1]) k.box(DSTEEL, 0.12, 0.02, s * 0.02, 0.05, 0.012, 0.012);
  },
  valve: (k) => {
    k.cyl(0xb89040, 0, 0.06, 0, 0.045, 0.05, 0.12, 10).cyl(0xb89040, 0, 0.05, 0, 0.026, 0.026, 0.24, 8, 0, 0, Math.PI / 2);
    k.rod(0xb89040, 0, 0.12, 0, 0, 0.17, 0, 0.012).torus(RED, 0, 0.175, 0, 0.065, 0.01, Math.PI / 2);
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) k.box(RED, 0, 0.175, 0, 0.13, 0.012, 0.012, a);
    k.cyl(0xeeeeee, 0, 0.08, 0.06, 0.035, 0.035, 0.02, 12, Math.PI / 2).cyl(0xb89040, 0, 0.08, 0.05, 0.038, 0.038, 0.01, 12, Math.PI / 2);
  },
  vesna: (k) => {
    k.ball(0x7ef06a, 0, 0.07, 0, 0.068, 1, 1, 1, 12).cyl(0xbfe8d8, 0, 0.16, 0, 0.022, 0.026, 0.07, 10).cyl(0x7a2a1c, 0, 0.205, 0, 0.026, 0.022, 0.03, 10);
  },
  // ---- what lies about to be swung ----
  skillet: (k) => {
    k.cyl(0x26262a, 0, 0.022, 0, 0.13, 0.115, 0.044, 14).cyl(0x3a3a40, 0, 0.045, 0, 0.11, 0.11, 0.004, 14);
    k.box(0x26262a, 0.21, 0.035, 0, 0.17, 0.02, 0.035);
  },
  skiPole: (k) => {
    k.rod(0xb0b8c0, -0.55, 0.012, 0, 0.55, 0.012, 0, 0.009).cyl(RED, -0.6, 0.016, 0, 0.016, 0.016, 0.12, 8, 0, 0, Math.PI / 2);
    k.torus(BLACK, 0.44, 0.04, 0, 0.045, 0.006, 0, Math.PI / 2, 0).torus(0x6a4024, -0.69, 0.006, 0.03, 0.04, 0.005, Math.PI / 2);
  },
  chain: (k) => {
    for (let i = 0; i < 9; i++) {
      const a = i * 0.55;
      k.torus(0x8a9098, Math.cos(a) * 0.12 * (1 - i * 0.05), 0.012 + (i % 2) * 0.004, Math.sin(a) * 0.12 * (1 - i * 0.05), 0.024, 0.006, i % 2 ? 0 : Math.PI / 2, a, 0, Math.PI * 2, 8);
    }
    k.torus(0x7a4a24, 0.2, 0.014, 0.02, 0.06, 0.014, Math.PI / 2).box(BRASS, 0.26, 0.016, 0.02, 0.02, 0.02, 0.02);
  },
  maul: (k) => {
    k.rod(WOOD, -0.42, 0.02, 0, 0.36, 0.02, 0, 0.018, 0.022).box(0xb02a22, 0.4, 0.04, 0, 0.07, 0.07, 0.18).cyl(STEEL, 0.4, 0.04, -0.11, 0, 0.035, 0.05, 4, -Math.PI / 2, Math.PI / 4);
  },
  // ---- a weapon mod part ----
  modpart: (k) => {
    k.cyl(BRASS, 0, 0.028, 0, 0.026, 0.026, 0.1, 10, 0, 0, Math.PI / 2);
    for (let i = 0; i < 5; i++) k.torus(0xd8dee6, -0.03 + i * 0.015, 0.028, 0, 0.03, 0.004, 0, Math.PI / 2, 0, Math.PI * 2, 10);
    k.cyl(0xb8902c, 0.06, 0.028, 0, 0.036, 0.036, 0.016, 10, 0, 0, Math.PI / 2);
  },
  // ---- the repairman's tools ----
  iron: (k) => {
    k.cyl(0x8a5a30, -0.08, 0.018, 0, 0.018, 0.016, 0.12, 8, 0, 0, Math.PI / 2).rod(STEEL, -0.02, 0.018, 0, 0.1, 0.018, 0, 0.007);
    k.cyl(0xc87a3a, 0.12, 0.018, 0, 0, 0.007, 0.04, 6, 0, 0, -Math.PI / 2).torus(0x5a4030, -0.18, 0.006, 0.03, 0.05, 0.006, Math.PI / 2, 0, 0, Math.PI * 2, 12);
  },
  screwdrivers: (k) => {
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.3;
      const L = 0.1 + i * 0.03;
      k.rod(0xd89a30, 0, 0.014, 0, -Math.cos(a) * 0.09, 0.014, -Math.sin(a) * 0.09, 0.016 - i * 0.002, 0.014 - i * 0.002).rod(STEEL, 0, 0.014, 0, Math.cos(a) * L, 0.014, Math.sin(a) * L, 0.004);
    }
  },
  multimeter: (k) => {
    k.box(0x222428, 0, 0.03, 0, 0.15, 0.06, 0.1).cyl(0xf0ece0, -0.025, 0.061, 0, 0.034, 0.034, 0.004, 12).box(0xd02a20, -0.025, 0.064, -0.012, 0.004, 0.002, 0.03, 0.5);
    k.cyl(0x555a60, 0.045, 0.066, 0, 0.016, 0.016, 0.014, 8);
    k.rod(0xd02a20, 0.075, 0.02, -0.03, 0.18, 0.006, -0.08, 0.004).rod(BLACK, 0.075, 0.02, 0.03, 0.17, 0.006, 0.09, 0.004);
  },
  // ---- the town tree's glass ornaments ----
  orn0: (k) => ornament(k, 0, (c) => k.ball(c, 0, 0.07, 0, 0.065, 1, 1, 1, 12)),
  orn1: (k) => ornament(k, 1, (c) => k.cyl(c, 0, 0.03, 0, 0.022, 0.0, 0.17, 8, 0, 0, Math.PI / 2), true),
  orn2: (k) => ornament(k, 2, (c) => k.lathe(c, [[0, 0.0], [0.065, 0.0], [0.06, 0.02], [0.04, 0.07], [0.03, 0.1], [0, 0.11]], 12)),
  orn3: (k) => ornament(k, 3, (c) => k.ball(c, 0, 0.05, 0, 0.045, 1, 1.5, 1, 8)),
  orn4: (k) => ornament(k, 4, (c) => k.ball(c, 0, 0.06, 0, 0.055, 1, 1, 1, 12).cyl(c, 0, 0.15, 0, 0, 0.02, 0.09, 8)),
  orn5: (k) => ornament(k, 5, (c) => {
    k.cyl(c, 0.0, 0.03, 0, 0.028, 0.028, 0.11, 10, 0, 0, Math.PI / 2).cyl(RED, 0.085, 0.03, 0, 0, 0.028, 0.06, 10, 0, 0, -Math.PI / 2);
    for (const s of [-1, 1]) k.box(RED, -0.05, 0.03 + s * 0.022, 0, 0.04, 0.025, 0.006);
  }, true),
};

/** A glass ornament: its body in its colour, a silver cap and wire loop (on its side when `lying`, else upright). */
function ornament(k: Kit, i: number, body: (c: number) => void, lying = false): void {
  body(GLASS[i % GLASS.length]!);
  if (lying) k.cyl(0xd8dce4, -0.07, 0.03, 0, 0.012, 0.012, 0.02, 8, 0, 0, Math.PI / 2).torus(0xd8dce4, -0.09, 0.03, 0, 0.01, 0.002, Math.PI / 2);
  else k.cyl(0xd8dce4, 0, 0.13, 0, 0.012, 0.014, 0.02, 8).torus(0xd8dce4, 0, 0.15, 0, 0.01, 0.002);
}

/** The height of the surface each lies on (see the header); a key is a part's or find's id, `tool<i>`, `mod<i>`, `orn<i>`. */
export const ITEM_Y: Record<string, number> = {
  tube: 0.01, cartridges: 1.24, handle: 0.03, fuse: 0.012, shears: 0.03, pipes: 1.07, tape: 0.95, nailer: 0.95, canister: 0.32, strips: 0.95, tubes: 0.03, crate: 0.012, cord: 0.024, blade: 0.92, shaft: 0.004, guard: 0.03, samovar: 1.01, coil: 0.65, valve: 0.95, vesna: 1.2,
  skillet: 0.03, skiPole: 0.02, chain: 1.16, maul: 0.7,
  tool0: 1.545, tool1: 0.012, tool2: 0.835, mod0: 1.17, mod1: 0.03,
  orn0: 0.02, orn1: 0.02, orn2: 0.004, orn3: 0.004, orn4: 0.012, orn5: 0.2,
};

export type ItemKind = 'part' | 'find' | 'tool' | 'mod' | 'ornament';

/** One thing lying in the town: which model, where, and in what colour its rim of light pulses. */
export interface ItemSpot {
  model: string;
  kind: ItemKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  glint: number;
}

const GLINT: Record<ItemKind, number> = { part: 0xffb84a, find: 0xffb84a, tool: 0x8fd8ff, mod: 0xffd27a, ornament: 0xffffff };
/** A yaw that looks thrown down rather than lined up, the same every run. */
const yawOf = (x: number, z: number): number => (((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) + 1) * Math.PI;

/**
 * Every collectable in the town, in a fixed order: the parts (`TOWN.parts`), the finds (`TOWN.finds`), the repairman's
 * tools (`TOOLS`), the mod parts lying about (`MOD_PARTS`), the ornaments where they rolled (`ORNAMENTS`). The offsets
 * of each run are returned so the look can switch each on and off.
 */
export function townItems(): { spots: ItemSpot[]; at: { part: number; find: number; tool: number; mod: number; ornament: number } } {
  const spots: ItemSpot[] = [];
  const add = (model: string, kind: ItemKind, x: number, z: number, key: string, fallback: number): void => {
    const glint = kind === 'ornament' ? GLASS[Number(model.slice(3)) % GLASS.length]! : GLINT[kind];
    spots.push({ model: MODEL[model] ? model : 'modpart', kind, x, y: ITEM_Y[key] ?? fallback, z, yaw: yawOf(x, z), glint });
  };
  const at = { part: 0, find: 0, tool: 0, mod: 0, ornament: 0 };
  at.part = spots.length;
  for (const p of TOWN.parts) add(p.id, 'part', p.x, p.z, p.id, 1.0);
  at.find = spots.length;
  for (const f of TOWN.finds) add(f.id, 'find', f.x, f.z, f.id, 1.1);
  at.tool = spots.length;
  TOOLS.forEach((t, i) => add(TOOL_IDS[i] ?? 'iron', 'tool', t.x, t.z, `tool${i}`, 1.0));
  at.mod = spots.length;
  MOD_PARTS.forEach((m, i) => add('modpart', 'mod', m.x, m.z, `mod${i}`, 1.05));
  at.ornament = spots.length;
  ORNAMENTS.forEach((o, i) => add(`orn${i}`, 'ornament', o.x, o.z, `orn${i}`, 0.02));
  return { spots, at };
}

/** The local geometry of one model (grown), for whoever wants to show it alone (a test, a preview). */
export function itemGeometry(model: string): THREE.BufferGeometry {
  const k = new Kit();
  (MODEL[model] ?? MODEL.modpart!)(k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(k.pos.map((v) => v * GROW), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(k.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(k.col, 3));
  return g;
}

/**
 * Every collectable in the town as ONE mesh (one draw call). `set(i, on)` shows or hides item `i`; `update(t)` moves the
 * pulse of the rims. Hidden items cost nothing to draw (their triangles fold into a point).
 */
export class ItemMarks {
  readonly mesh: THREE.Mesh;
  private readonly on: Float32Array;
  private readonly time = { value: 0 };
  private readonly mat: THREE.MeshStandardMaterial;

  constructor(readonly spots: readonly ItemSpot[]) {
    const n = Math.max(1, spots.length);
    this.on = new Float32Array(n);
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const slot: number[] = [];
    const pivot: number[] = [];
    const glint: number[] = [];
    const m = new THREE.Matrix4();
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      const k = new Kit();
      (MODEL[s.model] ?? MODEL.modpart!)(k);
      m.compose(v.set(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(Y, s.yaw), new THREE.Vector3(GROW, GROW, GROW));
      nm.getNormalMatrix(m);
      c.setHex(s.glint);
      for (let j = 0; j < k.pos.length; j += 3) {
        v.set(k.pos[j]!, k.pos[j + 1]!, k.pos[j + 2]!).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        v.set(k.nor[j]!, k.nor[j + 1]!, k.nor[j + 2]!).applyMatrix3(nm).normalize();
        nor.push(v.x, v.y, v.z);
        col.push(k.col[j]!, k.col[j + 1]!, k.col[j + 2]!);
        slot.push(i);
        pivot.push(s.x, s.y + 0.05, s.z);
        glint.push(c.r, c.g, c.b);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSlot', new THREE.Float32BufferAttribute(slot, 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(pivot, 3));
    g.setAttribute('aGlint', new THREE.Float32BufferAttribute(glint, 3));
    g.computeBoundingSphere();

    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
    const on = { value: this.on };
    const time = this.time;
    this.mat.customProgramCacheKey = () => `zarya-items-${n}`;
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uOn = on;
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float aSlot;\nattribute vec3 aPivot;\nattribute vec3 aGlint;\nuniform float uOn[${n}];\nuniform float uTime;\nvarying vec3 vGlint;`)
        .replace(
          '#include <begin_vertex>',
          // a hidden item folds into a point; a lit one's rim breathes, each in its own time
          `float itemOn = uOn[int(aSlot + 0.5)];\nvec3 transformed = mix(aPivot, vec3(position), itemOn);\nvGlint = aGlint * itemOn * (0.6 + 0.4 * sin(uTime * 2.4 + aSlot * 1.7));`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGlint;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n{\n  float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));\n  totalEmissiveRadiance += vGlint * (rim * rim * 1.6 + 0.05) + diffuseColor.rgb * 0.22;\n}`,
        );
    };
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'ZaryaItems';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    preloadIcons();
  }

  /** Show (or hide) item `i`. */
  set(i: number, on: boolean): void {
    if (i >= 0 && i < this.on.length) this.on[i] = on ? 1 : 0;
  }

  /** Every frame: the pulse; nothing is drawn while every item is hidden. */
  update(t: number): void {
    this.time.value = t;
    let any = false;
    for (let i = 0; i < this.on.length; i++) if (this.on[i]! > 0) any = true;
    this.mesh.visible = any;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
