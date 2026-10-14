/**
 * Blackwood's lost: the Asylum's own infected appearance variants (the 'asylum' theme of the rig factory). Everyone left
 * on the hill is a woman - the night nurses who stayed with the Lantern Ward, the patients who were never let go, the
 * orderlies in their padded whites - and they are drawn cute-creepy rather than gory: pale porcelain and pastel skin,
 * soft round faces with big glowing eyes and a small closed mouth (no teeth, no jaw), bandages and stitches instead of
 * open wounds, faded old stains instead of blood.
 *
 * The skeleton is the same 18 bones with a smaller, slimmer figure (`asylumDims`), so every animation, hit query
 * (head / chest / hand), ragdoll and ground probe works unchanged; hit radii and heights still come from `ZOMBIES`.
 * The other maps' variants are untouched: nothing here runs unless a rig is created with the 'asylum' theme.
 */
import * as THREE from 'three';
import type { ZombieType } from '../../types';
import { type Ctx, V, addArmsSkin, addFeet, addHands, addLegsSkin, addNeck, addTorsoSkin, armPath, headCenter, hex, legPath, torsoProf, torsoT, torsoWeights } from './body';
import { B, type Dims, NOMINAL_HEIGHT, makeDims, restPositions } from './dims';
import { skirtShell, sleeve, torsoShell, trouserLeg } from './garments';
import { Accum, box, ell, taper, type Splat, type Style, type Weights } from './mesh';
import { mulberry32, smoothstep } from './prng';

export const ASYLUM_VARIANT_COUNT: Record<ZombieType, number> = { shambler: 7, runner: 5, armored: 3, warden: 1 };

/** A woman's proportions on the same skeleton: a little shorter, narrower shoulders, slimmer limbs, a bigger, rounder head. */
export function asylumDims(type: ZombieType): Dims {
  const D = makeDims(type, NOMINAL_HEIGHT[type] * (type === 'armored' ? 0.93 : 0.95));
  D.fem = true;
  const orderly = type === 'armored';
  D.torsoW = orderly ? 1.12 : type === 'runner' ? 0.9 : 0.95;
  D.torsoD = orderly ? 1.1 : type === 'runner' ? 0.88 : 0.92;
  D.armT = orderly ? 0.95 : type === 'runner' ? 0.76 : 0.8;
  D.legT = orderly ? 1.0 : type === 'runner' ? 0.82 : 0.88;
  D.headS *= type === 'runner' ? 1.28 : 1.2;
  // the head sits lower on the neck (a short neck reads younger and softer)
  D.headCenterUp = 0.075 * D.k * D.headS;
  D.shX *= 0.86;
  D.armAngle += 0.03; // clear of the skirt
  return D;
}

type Cut = 'bob' | 'long' | 'twintails' | 'bun' | 'ponytail' | 'short';
type Role = 'nurse' | 'patient' | 'orderly';

interface Look {
  role: Role;
  /** Dress / gown / jacket. */
  dress: number;
  /** Apron, collar, cap, straps. */
  trim: number;
  skin: number;
  hair: Cut;
  hairColor: number;
  /** Hair ribbons / ties. */
  ribbon?: number;
  /** Glowing eyes (pastel). */
  eye: number;
  /** Nurses: white or cream tights; orderlies: trousers. */
  legs?: number;
  shoes?: number;
  apron?: boolean;
  cap?: boolean;
  mask?: boolean;
  eyePatch?: 1 | -1;
  headBandage?: boolean;
  stitches?: boolean;
  bandageArm?: 1 | -1;
  bandageLeg?: 1 | -1;
  /** Hem height (fraction of standing height at k = 1). */
  hem?: number;
}

const MINT = 0x4dffb8;
const PINK = 0xff6fbe;
const LILAC = 0xa982ff;
const GOLD = 0xffc95a;
const ICE = 0x6fd2ff;

const SHAMBLERS: Look[] = [
  { role: 'nurse', dress: 0xe7e4dc, trim: 0xf2efe8, skin: 0xd9d1cb, hair: 'bun', hairColor: 0x4a3426, ribbon: 0xf2efe8, eye: MINT, legs: 0xeeebe4, shoes: 0x201a1a, cap: true },
  { role: 'nurse', dress: 0xe4b4c2, trim: 0xf4f1ea, skin: 0xdccfcf, hair: 'bob', hairColor: 0xd6bd86, eye: PINK, legs: 0xf2efe8, shoes: 0xe8e4dc, cap: true, apron: true, stitches: true },
  { role: 'nurse', dress: 0xc2b2dc, trim: 0xf2efe8, skin: 0xd0d3d8, hair: 'long', hairColor: 0xc9c9d2, eye: LILAC, legs: 0xe8e2d6, shoes: 0x241d22, cap: true, apron: true },
  { role: 'patient', dress: 0xa9c5da, trim: 0xa9c5da, skin: 0xd8d6d2, hair: 'twintails', hairColor: 0x1d1a22, ribbon: 0xf2a6c6, eye: PINK, bandageArm: -1 },
  { role: 'patient', dress: 0xb2d9c8, trim: 0xb2d9c8, skin: 0xd6d0c6, hair: 'long', hairColor: 0x7a3a26, eye: GOLD, eyePatch: 1, bandageLeg: 1 },
  { role: 'patient', dress: 0xe2bccb, trim: 0xe2bccb, skin: 0xd8d4d6, hair: 'bob', hairColor: 0xb59fd2, eye: MINT, headBandage: true, stitches: true },
  { role: 'nurse', dress: 0x9db4d2, trim: 0xf2efe8, skin: 0xd4d0cc, hair: 'ponytail', hairColor: 0x5a3a28, ribbon: 0x9db4d2, eye: ICE, legs: 0xf0ece4, shoes: 0x1d1a1c, cap: true, apron: true, bandageArm: 1 },
];

const RUNNERS: Look[] = [
  { role: 'patient', dress: 0xc8d8e6, trim: 0xc8d8e6, skin: 0xdad6d0, hair: 'ponytail', hairColor: 0xdcc58e, ribbon: 0x9fc4e8, eye: ICE, stitches: true, hem: 0.66 },
  { role: 'patient', dress: 0xebcab4, trim: 0xebcab4, skin: 0xdcd2cc, hair: 'twintails', hairColor: 0xe3a2c2, ribbon: 0xf6f2ea, eye: LILAC, bandageLeg: -1, hem: 0.66 },
  { role: 'patient', dress: 0xcfc0e2, trim: 0xcfc0e2, skin: 0xd2d2d6, hair: 'long', hairColor: 0x17141a, eye: GOLD, bandageArm: 1, hem: 0.62 },
  { role: 'patient', dress: 0xb6dccb, trim: 0xb6dccb, skin: 0xd8d2ca, hair: 'bob', hairColor: 0x5c3d2a, eye: PINK, eyePatch: -1, hem: 0.66 },
  { role: 'nurse', dress: 0xece8e0, trim: 0xf4f1ea, skin: 0xd8cfca, hair: 'bob', hairColor: 0x8a3f26, eye: MINT, legs: 0xf2efe8, shoes: 0x1f1a1a, cap: true, hem: 0.6 },
];

const ORDERLIES: Look[] = [
  { role: 'orderly', dress: 0xe9e7e0, trim: 0x55493f, skin: 0xd8d0ca, hair: 'bun', hairColor: 0x4d3527, eye: MINT, legs: 0xe2e0d8, shoes: 0xe6e3da, cap: true, mask: true },
  { role: 'orderly', dress: 0xb9cde0, trim: 0x4c4a52, skin: 0xd2d2d4, hair: 'bob', hairColor: 0x1b181c, eye: PINK, legs: 0xb2c6da, shoes: 0xe6e3da, mask: true },
  { role: 'orderly', dress: 0xe6e3dc, trim: 0x6d6a66, skin: 0xd6cfcf, hair: 'short', hairColor: 0xc4c4cc, eye: LILAC, legs: 0xdcd9d0, shoes: 0x2a2526, cap: true, stitches: true },
];

const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

function lin(h: number): THREE.Color {
  return hex(h);
}

function skinSet(base: number): { skin: THREE.Color; dark: THREE.Color; light: THREE.Color } {
  const skin = hex(base);
  const hsl = { h: 0, s: 0, l: 0 };
  skin.getHSL(hsl);
  return { skin, dark: new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s + 0.08), hsl.l * 0.62), light: new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(0.92, hsl.l * 1.08)) };
}

// ---------------------------------------------------------------------------------------------------------
// the face
// ---------------------------------------------------------------------------------------------------------

interface Head {
  C: THREE.Vector3;
  hs: number;
  rx: number;
  ry: number;
  rz: number;
}

/** Chin taper of the round face (x multiplier by normalised height). */
const nar = (ny: number): number => 1 - 0.13 * smoothstep(0.05, -0.95, ny);

/** A point on the face surface at (dx, dy) head units from the centre, pushed out by `lift` metres. */
function onFace(h: Head, dx: number, dy: number, lift = 0): THREE.Vector3 {
  const x = dx * h.hs;
  const y = dy * h.hs;
  const rx = h.rx * nar(y / h.ry);
  const q = 1 - (x / rx) ** 2 - (y / h.ry) ** 2;
  const z = -h.rz * Math.sqrt(Math.max(0, q));
  return V(h.C.x + x, h.C.y + y, h.C.z + z - lift);
}

function addCuteHead(ctx: Ctx, look: Look): Head {
  const { acc, D } = ctx;
  const hs = D.k * D.headS;
  const C = headCenter(D);
  const h: Head = { C, hs, rx: 0.082 * hs, ry: 0.1 * hs, rz: 0.092 * hs };
  const blush = lin(0xf0a2b4);
  const headColor = (p: THREE.Vector3): THREE.Color => {
    tmp.copy(ctx.skin);
    const dx = (p.x - C.x) / hs;
    const dy = (p.y - C.y) / hs;
    const dz = (p.z - C.z) / hs;
    if (dz < -0.03) {
      // a soft shadow round the eyes, and a blush
      const ex = Math.abs(dx) - 0.038;
      const ey = dy - 0.006;
      tmp.lerp(ctx.skinDark, 0.18 * Math.exp(-((ex * ex) / 0.0008 + (ey * ey) / 0.0007)));
      const cx = Math.abs(dx) - 0.05;
      const cy = dy + 0.032;
      tmp.lerp(blush, 0.42 * Math.exp(-(cx * cx + cy * cy) / 0.00045));
    }
    return tmp;
  };
  {
    const g = new THREE.SphereGeometry(1, 18, 14);
    const pa = g.attributes.position!;
    for (let i = 0; i < pa.count; i++) pa.setX(i, pa.getX(i) * nar(pa.getY(i)));
    g.computeVertexNormals();
    // clean porcelain with the faintest glow of its own: no grime or blotches, and it reads in the dark
    acc.add(g, new THREE.Matrix4().compose(C, new THREE.Quaternion(), V(h.rx, h.ry, h.rz)), { color: headColor, bone: B.head, spec: 0.06, glow: 0.1 });
    g.dispose();
  }
  const head = (c: number | THREE.Color, extra: Partial<Style> = {}): Style => ({ color: typeof c === 'number' ? lin(c) : c.clone(), bone: B.head, ...extra });
  // ears
  for (const s of [-1, 1]) ell(acc, C.x + s * h.rx * 0.98, C.y - 0.006 * hs, C.z + 0.006 * hs, 0.011 * hs, 0.02 * hs, 0.013 * hs, head(ctx.skin.clone().lerp(ctx.skinDark, 0.12), { clean: true }), [0, 0, s * 0.15], 6, 5);
  // big glowing eyes in soft dark rims, a catch-light in each; sad little brows
  const eye = lin(look.eye);
  for (const s of [-1, 1] as const) {
    const p = onFace(h, s * 0.038, 0.004, 0);
    if (look.eyePatch === s) {
      // a gauze patch, taped
      ell(acc, p.x, p.y, p.z + 0.004 * hs, 0.032 * hs, 0.03 * hs, 0.012 * hs, head(0xeeeae0, { spec: 0.05 }), [0, s * 0.35, 0], 9, 7);
      box(acc, p.x, p.y + 0.012 * hs, p.z - 0.008 * hs, 0.05 * hs, 0.006 * hs, 0.004 * hs, head(0xd8cfb8), [0, s * 0.35, s * 0.4]);
      continue;
    }
    ell(acc, p.x, p.y, p.z + 0.005 * hs, 0.029 * hs, 0.031 * hs, 0.011 * hs, head(0x150f14), [0, s * 0.35, s * 0.08], 10, 8);
    ell(acc, p.x, p.y - 0.002 * hs, p.z - 0.004 * hs, 0.02 * hs, 0.023 * hs, 0.007 * hs, { color: eye.clone(), bone: B.head, glow: 1.05, clean: true }, [0, s * 0.35, 0], 10, 8);
    ell(acc, p.x + s * 0.007 * hs, p.y + 0.009 * hs, p.z - 0.009 * hs, 0.0055 * hs, 0.0055 * hs, 0.003 * hs, { color: lin(0xffffff), bone: B.head, glow: 1.6, clean: true }, null, 6, 5);
  }
  // a little nose, a small closed mouth
  const n = onFace(h, 0, -0.018, 0.004 * hs);
  ell(acc, n.x, n.y, n.z, 0.008 * hs, 0.007 * hs, 0.006 * hs, head(ctx.skin.clone().lerp(ctx.skinDark, 0.1), { clean: true }), null, 6, 5);
  const m = onFace(h, 0, -0.048, 0.0);
  ell(acc, m.x, m.y, m.z + 0.001 * hs, 0.014 * hs, 0.0035 * hs, 0.004 * hs, head(0x3a1a22), null, 8, 5);
  if (look.stitches) {
    // a stitched seam from the corner of the mouth up the cheek
    const s = 1;
    const a = onFace(h, s * 0.022, -0.05, 0.002 * hs);
    const c = onFace(h, s * 0.07, -0.006, 0.002 * hs);
    const thread = head(0x2b1f26);
    taper(acc, a, c, 0.0016 * hs, 0.0016 * hs, thread, 4);
    const dir = c.clone().sub(a);
    const perp = V(-dir.y, dir.x, 0).normalize().multiplyScalar(0.007 * hs);
    for (let i = 1; i <= 4; i++) {
      const q = a.clone().lerp(c, i / 5);
      taper(acc, q.clone().sub(perp), q.clone().add(perp), 0.0013 * hs, 0.0013 * hs, thread, 3);
    }
  }
  return h;
}

// ---------------------------------------------------------------------------------------------------------
// hair
// ---------------------------------------------------------------------------------------------------------

/** Part of a sphere around the head: `w` half-width of the open front (0 = closed), polar range t0..t1. */
function shell(ctx: Ctx, h: Head, w: number, t0: number, t1: number, scale: [number, number, number], style: Style, flare = 0, jag = 0): void {
  const front = (3 * Math.PI) / 2;
  const g = new THREE.SphereGeometry(1, 18, 10, w > 0 ? front + w : 0, w > 0 ? Math.PI * 2 - 2 * w : Math.PI * 2, t0, t1 - t0);
  const pa = g.attributes.position!;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    const f = 1 + flare * Math.max(0, -y);
    const j = jag > 0 && i >= pa.count - 19 ? (Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1) * jag : 0;
    pa.setXYZ(i, pa.getX(i) * f, y + j, pa.getZ(i) * f);
  }
  g.computeVertexNormals();
  ctx.acc.add(g, new THREE.Matrix4().compose(V(h.C.x, h.C.y + 0.004 * h.hs, h.C.z + 0.006 * h.hs), new THREE.Quaternion(), V(h.rx * scale[0], h.ry * scale[1], h.rz * scale[2])), style);
  g.dispose();
}

/** Hair that hangs below the head follows the chest, not just the head. */
function hangWeights(D: Dims): (p: THREE.Vector3) => Weights {
  // below the head bone's pivot a hanging lock would swing up and back when the head drops: hand it to the chest
  const y0 = D.headY + 0.03 * D.k;
  const y1 = D.headY - 0.08 * D.k;
  return (p) => {
    if (p.y >= y0) return [B.head, 1, B.head, 0];
    const t = smoothstep(y0, y1, p.y);
    return [B.head, 1 - t, B.chest, t];
  };
}

function addCuteHair(ctx: Ctx, h: Head, look: Look): void {
  const { acc, D } = ctx;
  const hs = h.hs;
  const col = lin(look.hairColor);
  const st: Style = { color: col, bone: B.head, spec: 0.16 };
  const hang: Style = { color: col.clone(), bone: hangWeights(D), spec: 0.16 };
  const ribbon = look.ribbon !== undefined ? lin(look.ribbon) : null;
  const C = h.C;
  // crown and back of the head
  shell(ctx, h, 0.95, 0, 1.75, [1.08, 1.07, 1.09], st);
  shell(ctx, h, 0, 0, 0.95, [1.09, 1.075, 1.1], st);
  // a fringe of bangs over the forehead, ragged at the tips
  {
    const front = (3 * Math.PI) / 2;
    const g = new THREE.SphereGeometry(1, 14, 5, front - 1.0, 2.0, 0.6, 0.62);
    const pa = g.attributes.position!;
    for (let i = 0; i < pa.count; i++) {
      const row = Math.floor(i / 15);
      const dip = row === 5 ? (Math.abs(Math.sin(i * 7.31)) * 0.12 + (i % 3 === 0 ? 0.08 : 0)) : 0;
      pa.setY(i, pa.getY(i) - dip);
    }
    g.computeVertexNormals();
    acc.add(g, new THREE.Matrix4().compose(V(C.x, C.y + 0.004 * hs, C.z), new THREE.Quaternion(), V(h.rx * 1.12, h.ry * 1.08, h.rz * 1.12)), st);
    g.dispose();
  }
  switch (look.hair) {
    case 'bob':
      shell(ctx, h, 0.82, 0.7, 2.3, [1.16, 1.08, 1.16], st, 0.12, 0.04);
      break;
    case 'short':
      shell(ctx, h, 0.95, 0.7, 1.95, [1.12, 1.07, 1.13], st, 0.06, 0.05);
      break;
    case 'long': {
      shell(ctx, h, 0.85, 0.7, 2.35, [1.15, 1.08, 1.15], st, 0.08, 0.05);
      // down the back to the shoulder blades, a few loose locks over the shoulders
      ell(acc, C.x, C.y - 0.26 * hs, C.z + 0.072 * hs, 0.088 * hs, 0.25 * hs, 0.03 * hs, hang, [0.18, 0, 0], 10, 8);
      for (const s of [-1, 1]) taper(acc, V(C.x + s * 0.085 * hs, C.y - 0.06 * hs, C.z + 0.01 * hs), V(C.x + s * 0.1 * hs, C.y - 0.36 * hs, C.z + 0.035 * hs), 0.022 * hs, 0.006 * hs, hang, 6);
      break;
    }
    case 'twintails':
      for (const s of [-1, 1]) {
        const tie = V(C.x + s * 0.085 * hs, C.y + 0.035 * hs, C.z + 0.055 * hs);
        const a = V(C.x + s * 0.13 * hs, C.y - 0.045 * hs, C.z + 0.07 * hs);
        const b = V(C.x + s * 0.125 * hs, C.y - 0.19 * hs, C.z + 0.065 * hs);
        const c = V(C.x + s * 0.085 * hs, C.y - 0.31 * hs, C.z + 0.045 * hs);
        taper(acc, tie, a, 0.022 * hs, 0.03 * hs, st, 8);
        taper(acc, a, b, 0.03 * hs, 0.022 * hs, hang, 8);
        taper(acc, b, c, 0.022 * hs, 0.003 * hs, hang, 8);
        ell(acc, a.x, a.y, a.z, 0.03 * hs, 0.032 * hs, 0.03 * hs, st, null, 8, 6);
        if (ribbon) {
          for (const t of [-1, 1]) ell(acc, tie.x + s * 0.008 * hs, tie.y + 0.006 * hs, tie.z + t * 0.024 * hs, 0.01 * hs, 0.018 * hs, 0.022 * hs, { color: ribbon.clone(), bone: B.head }, [t * 0.6, 0, 0], 7, 5);
        }
      }
      break;
    case 'bun': {
      const bun = V(C.x, C.y + 0.07 * hs, C.z + 0.085 * hs);
      ell(acc, bun.x, bun.y, bun.z, 0.05 * hs, 0.047 * hs, 0.046 * hs, st, null, 10, 8);
      if (ribbon) ell(acc, bun.x, bun.y - 0.03 * hs, bun.z - 0.01 * hs, 0.045 * hs, 0.009 * hs, 0.04 * hs, { color: ribbon.clone(), bone: B.head }, [0.4, 0, 0], 9, 4);
      break;
    }
    case 'ponytail': {
      const tie = V(C.x, C.y + 0.02 * hs, C.z + 0.1 * hs);
      const a = V(C.x, C.y - 0.06 * hs, C.z + 0.135 * hs);
      const b = V(C.x, C.y - 0.3 * hs, C.z + 0.12 * hs);
      taper(acc, tie, a, 0.03 * hs, 0.034 * hs, st, 8);
      taper(acc, a, b, 0.034 * hs, 0.006 * hs, hang, 8);
      if (ribbon) ell(acc, tie.x, tie.y, tie.z + 0.004 * hs, 0.034 * hs, 0.012 * hs, 0.02 * hs, { color: ribbon.clone(), bone: B.head }, [0.6, 0, 0], 8, 5);
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------------------------------------
// headwear
// ---------------------------------------------------------------------------------------------------------

function addNurseCap(ctx: Ctx, h: Head, color: number): void {
  const { acc } = ctx;
  const hs = h.hs;
  const C = h.C;
  const st: Style = { color: lin(color), bone: B.head, spec: 0.05, clean: true };
  // a small starched cap perched on the front of the crown, tipped back
  const tilt = -0.35;
  const c = V(C.x, C.y + h.ry * 1.0, C.z - h.rz * 0.22);
  const w = 0.1 * hs;
  const d = 0.05 * hs;
  box(acc, c.x, c.y, c.z, w, 0.03 * hs, d, st, [tilt, 0, 0]);
  for (const s of [-1, 1]) box(acc, c.x + s * (w / 2 + 0.006 * hs), c.y - 0.004 * hs, c.z + 0.006 * hs, 0.024 * hs, 0.026 * hs, 0.004 * hs, st, [tilt, s * 0.6, s * 0.3]);
  // a faded red cross on its front
  const red: Style = { color: lin(0xb0383c), bone: B.head, clean: true };
  const f = V(0, 0.002 * hs, -d / 2 - 0.0015 * hs).applyEuler(new THREE.Euler(tilt, 0, 0)).add(c);
  box(acc, f.x, f.y, f.z, 0.024 * hs, 0.008 * hs, 0.003 * hs, red, [tilt, 0, 0]);
  box(acc, f.x, f.y, f.z, 0.008 * hs, 0.024 * hs, 0.003 * hs, red, [tilt, 0, 0]);
}

/** A pale surgical mask over the lower face, ties to the ears. */
function addMask(ctx: Ctx, h: Head): void {
  const front = (3 * Math.PI) / 2;
  const g = new THREE.SphereGeometry(1, 14, 6, front - 1.15, 2.3, 1.62, 0.95);
  g.computeVertexNormals();
  const st: Style = { color: lin(0xdce9ef), bone: B.head, spec: 0.04, clean: true };
  ctx.acc.add(g, new THREE.Matrix4().compose(h.C, new THREE.Quaternion(), V(h.rx * 1.06, h.ry * 1.05, h.rz * 1.1)), st);
  g.dispose();
  for (const s of [-1, 1]) {
    const a = V(h.C.x + s * h.rx * 0.9, h.C.y - 0.02 * h.hs, h.C.z - 0.03 * h.hs);
    taper(ctx.acc, a, V(h.C.x + s * h.rx * 1.02, h.C.y + 0.0 * h.hs, h.C.z + 0.01 * h.hs), 0.003 * h.hs, 0.003 * h.hs, st, 3);
  }
}

function addHeadBandage(ctx: Ctx, h: Head): void {
  const g = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0, 0.18));
  const st: Style = { color: lin(0xebe6da), bone: B.head };
  ctx.acc.add(g, new THREE.Matrix4().compose(V(h.C.x, h.C.y + 0.05 * h.hs, h.C.z + 0.004 * h.hs), q, V(h.rx * 1.13, 0.028 * h.hs, h.rz * 1.13)), st);
  g.dispose();
}

// ---------------------------------------------------------------------------------------------------------
// clothes
// ---------------------------------------------------------------------------------------------------------

/** The skirt's radius at height y (k units), matching `skirtShell` (flare from the hips down). */
function skirtRadius(ctx: Ctx, y: number, hem: number, flare: number): { rx: number; rz: number } {
  const { D } = ctx;
  const k = D.k;
  const out = { rx: 0, rz: 0 };
  const yb = 0.86 * k;
  torsoProf(ctx)(Math.max(0, Math.min(1, (y * k - yb) / (1.49 * k - yb))), out);
  if (y < 0.93) {
    const f = smoothstep(0.93 * k, hem * k, y * k);
    out.rx += f * flare * k;
    out.rz += f * flare * k * 0.8;
  }
  out.rx += 0.006 * k;
  out.rz += 0.006 * k;
  return out;
}

function skirtWeights(D: Dims): (p: THREE.Vector3) => Weights {
  const k = D.k;
  const w = torsoWeights(D);
  return (p) => {
    if (p.y >= 0.93 * k) return w(0, p);
    const f = smoothstep(0.93 * k, 0.66 * k, p.y) * 0.55;
    return [B.pelvis, 1 - f, p.x < 0 ? B.hipL : B.hipR, f];
  };
}

/** A white collar at the neckline. */
function collar(ctx: Ctx, color: THREE.Color): void {
  const { acc, D } = ctx;
  const k = D.k;
  for (const s of [-1, 1]) box(acc, s * 0.04 * k, 1.455 * k, -0.06 * k * D.torsoD, 0.07 * k, 0.012 * k, 0.05 * k, { color: color.clone(), bone: B.chest, clean: true }, [0.35, s * 0.4, s * 0.25]);
  const g = new THREE.CylinderGeometry(0.058 * k, 0.07 * k, 0.03 * k, 12, 1, true);
  acc.add(g, new THREE.Matrix4().makeTranslation(0, 1.475 * k, 0.004 * k), { color: color.clone(), bone: B.chest });
  g.dispose();
}

function apron(ctx: Ctx, color: THREE.Color, hem: number, flare: number): void {
  const { acc, D } = ctx;
  const k = D.k;
  const top = 0.99;
  const bot = hem + 0.06;
  const rt = skirtRadius(ctx, top, hem, flare);
  const rb = skirtRadius(ctx, bot, hem, flare);
  const g = new THREE.CylinderGeometry(1, rb.rx / rt.rx, 1, 10, 4, true, Math.PI - 0.95, 1.9);
  const pa = g.attributes.position!;
  // the cylinder is unit-radius at the top; squash depth to the skirt's ellipse
  for (let i = 0; i < pa.count; i++) pa.setZ(i, pa.getZ(i) * (rt.rz / rt.rx));
  g.computeVertexNormals();
  acc.add(g, new THREE.Matrix4().compose(V(0, ((top + bot) / 2) * k, 0), new THREE.Quaternion(), V(rt.rx + 0.008 * k, (top - bot) * k, rt.rx + 0.008 * k)), { color: color.clone(), bone: skirtWeights(D) });
  g.dispose();
  // bib and straps
  const out = { rx: 0, rz: 0 };
  torsoProf(ctx)(torsoT(D, 1.2 * k), out);
  box(acc, 0, 1.2 * k, -(out.rz + 0.012 * k), 0.15 * k, 0.17 * k, 0.008 * k, { color: color.clone(), bone: B.chest, clean: true }, [-0.08, 0, 0]);
  for (const s of [-1, 1]) box(acc, s * 0.065 * k, 1.36 * k, -(out.rz + 0.004 * k), 0.022 * k, 0.16 * k, 0.008 * k, { color: color.clone(), bone: B.chest, clean: true }, [-0.25, 0, -s * 0.15]);
  torsoShell(ctx, 0.975, 1.0, color.clone().multiplyScalar(0.96), 0.014 * k, 0, 77);
}

/** A ring of gauze around a limb at parameter t along the path a-b-c. */
function limbBandage(ctx: Ctx, path: THREE.Vector3[], t: number, r: number, bone: number, len: number): void {
  const l1 = path[0]!.distanceTo(path[1]!);
  const l2 = path[1]!.distanceTo(path[2]!);
  let d = t * (l1 + l2);
  let i = 0;
  if (d > l1) {
    d -= l1;
    i = 1;
  }
  const a = path[i]!;
  const b = path[i + 1]!;
  const p = a.clone().lerp(b, d / (i === 0 ? l1 : l2));
  const dir = b.clone().sub(a).normalize();
  const st: Style = { color: lin(0xebe5d8), bone };
  for (let j = 0; j < 3; j++) {
    const c = p.clone().addScaledVector(dir, (j - 1) * len * 0.33);
    const g = new THREE.CylinderGeometry(r * (1 + 0.05 * j), r * (1.04 + 0.05 * j), len * 0.36, 10, 1, true);
    ctx.acc.add(g, new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15 * (j - 1), 0, 0))), V(1, 1, 1)), st);
    g.dispose();
  }
}

/** Smaller feet and shoes: the same builder at a smaller scale (the ankles stay where the skeleton has them). */
function small(ctx: Ctx): Ctx {
  return { ...ctx, D: { ...ctx.D, k: ctx.D.k * 0.8 } };
}

function addClothes(ctx: Ctx, look: Look, seed: number): void {
  const { acc, D } = ctx;
  const k = D.k;
  const dress = lin(look.dress);
  const trim = lin(look.trim);
  if (look.role === 'orderly') {
    // padded whites: a straitjacket-cut tunic with buckled straps, padded sleeves, trousers
    for (const s of [-1, 1] as const) trouserLeg(ctx, s, 0.965, lin(look.legs ?? look.dress), 0.012 * k, 0, seed + s, 0.008);
    torsoShell(ctx, 0.87, 1.02, lin(look.legs ?? look.dress), 0.012 * k, 0, seed);
    torsoShell(ctx, 0.84, 1.47, dress, 0.03 * k, 0, seed + 3);
    for (const s of [-1, 1] as const) sleeve(ctx, s, 0.93, dress, 0.028 * k, 0, seed + 5 * s);
    collar(ctx, dress.clone().multiplyScalar(0.95));
    for (const y of [1.04, 1.24]) torsoShell(ctx, y, y + 0.035, trim, 0.036 * k, 0, seed + Math.round(y * 10));
    const out = { rx: 0, rz: 0 };
    for (const y of [1.06, 1.26]) {
      torsoProf(ctx)(torsoT(D, y * k), out);
      box(acc, 0.05 * k, y * k, -(out.rz + 0.037 * k), 0.03 * k, 0.028 * k, 0.01 * k, { color: lin(0xa8a59c), bone: y < 1.13 ? B.spine : B.chest, spec: 0.7 });
    }
    // quilted seams down the front
    for (const s of [-1, 1]) {
      torsoProf(ctx)(torsoT(D, 1.15 * k), out);
      box(acc, s * 0.05 * k, 1.15 * k, -(out.rz + 0.031 * k), 0.006 * k, 0.5 * k, 0.004 * k, { color: dress.clone().multiplyScalar(0.82), bone: B.chest });
    }
    addFeet(small(ctx), 'sneakers', lin(look.shoes ?? 0xe6e3da));
    return;
  }
  const nurse = look.role === 'nurse';
  const hem = look.hem ?? (nurse ? 0.55 : 0.6);
  const flare = nurse ? 0.055 : 0.035;
  if (nurse && look.legs !== undefined) for (const s of [-1, 1] as const) trouserLeg(ctx, s, 0.965, lin(look.legs), 0.003 * k, 0, seed + s, 0);
  skirtShell(ctx, 1.47, hem, dress, flare, nurse ? 0.006 * k : 0.03 * k, seed + 15, 1);
  for (const s of [-1, 1] as const) sleeve(ctx, s, nurse ? 0.28 : 0.22, dress, (nurse ? 0.018 : 0.012) * k, nurse ? 0 : 0.012 * k, seed + 7 * s);
  if (nurse) {
    collar(ctx, trim);
    if (look.apron) apron(ctx, trim, hem, flare);
    else torsoShell(ctx, 0.975, 1.0, trim, 0.016 * k, 0, seed + 5);
    // a fob watch pinned at the breast
    const out = { rx: 0, rz: 0 };
    torsoProf(ctx)(torsoT(D, 1.33 * k), out);
    ell(acc, -0.07 * k, 1.33 * k, -(out.rz + (look.apron ? 0.02 : 0.012) * k), 0.016 * k, 0.016 * k, 0.005 * k, { color: lin(0xb39a5a), bone: B.chest, spec: 0.8 }, null, 8, 5);
    addFeet(small(ctx), 'dress', lin(look.shoes ?? 0x1f1a1a));
  } else {
    // the gown ties at the back of the neck; a hospital band on the wrist
    for (const s of [-1, 1]) box(acc, s * 0.018 * k, 1.44 * k, 0.07 * k * D.torsoD, 0.012 * k, 0.05 * k, 0.006 * k, { color: dress.clone().multiplyScalar(0.9), bone: B.chest }, [0.2, 0, s * 0.5]);
    limbBandage(ctx, armPath(ctx, -1), 0.95, 0.026 * k * D.armT + 0.004 * k, B.elL, 0.03 * k);
    addFeet(small(ctx), 'barefoot', lin(0));
  }
}

// ---------------------------------------------------------------------------------------------------------
// variant
// ---------------------------------------------------------------------------------------------------------

export function buildAsylumVariant(type: ZombieType, index: number): THREE.BufferGeometry {
  const D = asylumDims(type);
  const seed = ((type === 'shambler' ? 11 : type === 'runner' ? 12 : 13) * 7919 + index * 104729 + 1961) >>> 0;
  const rand = mulberry32(seed);
  const list = type === 'runner' ? RUNNERS : type === 'armored' ? ORDERLIES : SHAMBLERS;
  const look = list[index % list.length]!;
  const acc = new Accum();
  const sk = skinSet(look.skin);
  const ctx: Ctx = {
    acc,
    D,
    rest: restPositions(D),
    rand,
    girth: type === 'armored' ? 1.0 : type === 'runner' ? 0.92 : 0.96,
    skin: sk.skin,
    skinDark: sk.dark,
    skinLight: sk.light,
    eye: lin(look.eye),
    eyeGlow: 1.9,
  };
  addTorsoSkin(ctx);
  addNeck(ctx, 0.9);
  const h = addCuteHead(ctx, look);
  addCuteHair(ctx, h, look);
  if (look.cap) addNurseCap(ctx, h, look.role === 'orderly' ? 0xe9e7e0 : look.trim);
  if (look.mask) addMask(ctx, h);
  if (look.headBandage) addHeadBandage(ctx, h);
  addArmsSkin(ctx);
  addLegsSkin(ctx);
  addHands(ctx, { size: 0.9, clawColor: ctx.skin.clone().lerp(lin(0xb07a8a), 0.5), glove: look.role === 'orderly' ? lin(0xe8e6e0) : undefined });
  addClothes(ctx, look, Math.floor(rand() * 9999));
  if (look.bandageArm) limbBandage(ctx, armPath(ctx, look.bandageArm), 0.72, 0.034 * D.k * D.armT + 0.004 * D.k, look.bandageArm < 0 ? B.elL : B.elR, 0.07 * D.k);
  if (look.bandageLeg) limbBandage(ctx, legPath(ctx, look.bandageLeg), 0.7, 0.05 * D.k * D.legT + 0.004 * D.k, look.bandageLeg < 0 ? B.knL : B.knR, 0.09 * D.k);
  // old, faded stains and the hill's grime - no blood
  const splats: Splat[] = [];
  const old = new THREE.Color(0.16, 0.11, 0.08);
  const grey = new THREE.Color(0.2, 0.2, 0.2);
  for (let i = 0; i < 3; i++) {
    splats.push({ c: V((rand() - 0.5) * 0.4 * D.k, (0.5 + rand() * 0.8) * D.k, (rand() - 0.5) * 0.2 * D.k), r: (0.05 + rand() * 0.06) * D.k, a: 0.35 + rand() * 0.2, color: rand() < 0.5 ? old : grey });
  }
  return acc.toGeometry({ seed, dirt: 0.45, tone: 1.08, splats });
}

void tmp2;
