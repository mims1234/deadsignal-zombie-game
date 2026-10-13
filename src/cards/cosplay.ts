/**
 * Procedural 3D stand-ins for the card carriers. Each one reuses the infected skeleton, skinning and animation from
 * `enemies/zombie/` but gets its own head (large eyes instead of a skull), hair volume, outfit and signature props,
 * baked into ONE skinned geometry. Nothing here is read from the card art: the likeness is silhouette and colour.
 */
import * as THREE from 'three';
import { type Ctx, V, addArmsSkin, addHands, addLegsSkin, addNeck, addTorsoSkin, blend2, headCenter, hex } from '../enemies/zombie/body';
import { B, makeDims, restPositions } from '../enemies/zombie/dims';
import { type Outfit, addOutfit, skirtShell, sleeve, torsoShell, trouserLeg } from '../enemies/zombie/garments';
import { Accum, type Splat, type Style, type Weights, box, cone, cyl, ell, taper } from '../enemies/zombie/mesh';
import { computeProbes } from '../enemies/zombie/probes';
import { lerp, mulberry32, smoothstep } from '../enemies/zombie/prng';
import type { TypeAssets } from '../enemies/zombie/rig';
import type { CarrierDef } from './roster';

interface HeadFrame {
  C: THREE.Vector3;
  hs: number;
  k: number;
  rx: number;
  ry: number;
  rz: number;
}

function headFrame(ctx: Ctx): HeadFrame {
  const hs = ctx.D.k * ctx.D.headS;
  return { C: headCenter(ctx.D), hs, k: ctx.D.k, rx: 0.078 * hs, ry: 0.108 * hs, rz: 0.098 * hs };
}

/** How far the skull narrows toward the chin at unit height `y` (-1 chin .. 1 crown). */
const chin = (y: number): number => smoothstep(0.05, -1, y);

/** Z of the face surface at offset (x, y) from the head centre, in metres. */
function faceZ(h: HeadFrame, x: number, y: number): number {
  const low = chin(y / h.ry);
  const ux = x / (h.rx * (1 - 0.3 * low));
  const uy = y / h.ry;
  return h.C.z - h.rz * (1 - 0.08 * low) * Math.sqrt(Math.max(0.05, 1 - ux * ux - uy * uy));
}

/** A smooth head with large, glowing eyes: the infection shows in the eyes and at the mouth, not as a skull. */
function addFace(ctx: Ctx, eye: THREE.Color, lash: THREE.Color): void {
  const { acc } = ctx;
  const h = headFrame(ctx);
  const { C, hs } = h;
  const g = new THREE.SphereGeometry(1, 20, 16);
  const pa = g.attributes.position!;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    const z = pa.getZ(i);
    const low = chin(y);
    pa.setXYZ(i, pa.getX(i) * (1 - 0.3 * low), y, z < 0 ? z * (1 - 0.08 * low) : z);
  }
  g.computeVertexNormals();
  acc.add(g, new THREE.Matrix4().compose(C, new THREE.Quaternion(), V(h.rx, h.ry, h.rz)), { color: ctx.skin.clone(), bone: B.head, spec: 0.08 });
  g.dispose();

  const white: Style = { color: hex(0xb9b8c2), bone: B.head, clean: true };
  const iris: Style = { color: eye, bone: B.head, glow: 0.45, clean: true };
  const dark: Style = { color: hex(0x0c0a10), bone: B.head, clean: true };
  for (const s of [-1, 1]) {
    const ex = C.x + s * 0.035 * hs;
    const ey = C.y + 0.004 * hs;
    const ez = faceZ(h, s * 0.035 * hs, 0.004 * hs);
    const turn: [number, number, number] = [0, -s * 0.38, 0];
    ell(acc, ex, ey, ez - 0.001 * hs, 0.024 * hs, 0.028 * hs, 0.006 * hs, white, turn, 10, 8);
    ell(acc, ex - s * 0.002 * hs, ey - 0.002 * hs, ez - 0.004 * hs, 0.019 * hs, 0.024 * hs, 0.006 * hs, iris, turn, 10, 8);
    ell(acc, ex - s * 0.002 * hs, ey - 0.003 * hs, ez - 0.0075 * hs, 0.008 * hs, 0.013 * hs, 0.005 * hs, dark, turn, 8, 6);
    ell(acc, ex + s * 0.007 * hs, ey + 0.011 * hs, ez - 0.0095 * hs, 0.005 * hs, 0.006 * hs, 0.003 * hs, { color: hex(0xffffff), bone: B.head, glow: 0.5, clean: true }, turn, 6, 5);
    // upper lash line
    ell(acc, ex, ey + 0.027 * hs, ez - 0.003 * hs, 0.027 * hs, 0.005 * hs, 0.007 * hs, { color: lash, bone: B.head, clean: true }, turn, 8, 5);
  }
  // nose and a small, bloodied mouth
  ell(acc, C.x, C.y - 0.024 * hs, faceZ(h, 0, -0.024 * hs) - 0.002 * hs, 0.006 * hs, 0.008 * hs, 0.007 * hs, { color: ctx.skin.clone().lerp(ctx.skinDark, 0.18), bone: B.head }, null, 6, 5);
  ell(acc, C.x, C.y - 0.052 * hs, faceZ(h, 0, -0.052 * hs) - 0.001 * hs, 0.014 * hs, 0.0038 * hs, 0.004 * hs, { color: hex(0x3a0a10), bone: B.head, clean: true }, null, 8, 5);
}

/** Hair follows the head above the neck and the chest below it, so long hair lies on the back instead of swinging rigidly. */
function hairBone(ctx: Ctx): (p: THREE.Vector3) => Weights {
  const k = ctx.D.k;
  return (p) => blend2(p.y, 1.4 * k, 1.56 * k, B.chest, B.head);
}

function hairStyle(ctx: Ctx, color: number): Style {
  return { color: hex(color), bone: hairBone(ctx), spec: 0.22, clean: true };
}

/** Scalp volume with a zig-zag fringe: the part of the sphere in front of the face is folded back inside the skull. */
function hairCap(ctx: Ctx, st: Style, fringe = 0.3): void {
  const h = headFrame(ctx);
  const g = new THREE.SphereGeometry(1, 24, 14);
  const pa = g.attributes.position!;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const y = pa.getY(i);
    const z = pa.getZ(i);
    const front = smoothstep(-0.05, -0.5, z);
    const line = lerp(-0.9, fringe + 0.09 * Math.sin(Math.atan2(x, -z) * 8), front);
    if (y < line) pa.setXYZ(i, x * 0.5, y * 0.5, z * 0.5);
  }
  g.computeVertexNormals();
  const m = new THREE.Matrix4().compose(V(h.C.x, h.C.y + 0.012 * h.hs, h.C.z + 0.012 * h.hs), new THREE.Quaternion(), V(h.rx * 1.17, h.ry * 1.12, h.rz * 1.14));
  ctx.acc.add(g, m, st);
  g.dispose();
  // locks framing the face
  for (const s of [-1, 1]) ell(ctx.acc, h.C.x + s * h.rx * 1.04, h.C.y - 0.075 * h.hs, h.C.z - 0.03 * h.hs, 0.02 * h.hs, 0.095 * h.hs, 0.03 * h.hs, st, [0.08, 0, s * 0.06], 7, 6);
}

/** Hair hanging down the back, `len` (in k) below the head centre. */
function hairBack(ctx: Ctx, st: Style, len: number, width = 1): void {
  const h = headFrame(ctx);
  const k = h.k;
  const half = (len * k) / 2;
  ell(ctx.acc, 0, h.C.y - half + 0.02 * k, 0.105 * k, h.rx * 1.25 * width, half + 0.03 * k, 0.05 * k, st, [0.05, 0, 0], 12, 10);
  // a few thick locks so the hem is not a clean oval
  for (let i = -2; i <= 2; i++) {
    const x = i * 0.036 * k * width;
    const drop = (0.05 + 0.04 * Math.abs(Math.sin(i * 2.3 + len * 9))) * k;
    taper(ctx.acc, V(x, h.C.y - len * k * 0.6, 0.11 * k), V(x * 1.15, h.C.y - len * k - drop, 0.115 * k), 0.03 * k, 0.006 * k, st, 6);
  }
}

/** Twin tails from the sides of the head. `front` lets short tails rest on the collarbones instead of behind the shoulders. */
function twinTails(ctx: Ctx, st: Style, high: boolean, len: number, front = false): THREE.Vector3[] {
  const h = headFrame(ctx);
  const k = h.k;
  const anchors: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const a = V(h.C.x + s * h.rx * 1.02, h.C.y + (high ? 0.06 : -0.05) * h.hs, h.C.z + (front ? -0.01 : 0.03) * h.hs);
    const zEnd = front ? -0.075 * k : 0.085 * k;
    const p1 = V(a.x + s * 0.06 * k, a.y - 0.02 * k, lerp(a.z, zEnd, 0.4));
    const p2 = V(a.x + s * (front ? 0.02 : 0.075) * k, a.y - len * k * 0.55, zEnd);
    const p3 = V(a.x + s * (front ? 0.0 : 0.05) * k, a.y - len * k, zEnd);
    ell(ctx.acc, a.x, a.y, a.z, 0.036 * k, 0.036 * k, 0.036 * k, st, null, 8, 6);
    taper(ctx.acc, a, p1, 0.03 * k, 0.04 * k, st, 7);
    ell(ctx.acc, p1.x, p1.y, p1.z, 0.04 * k, 0.04 * k, 0.04 * k, st, null, 8, 6);
    taper(ctx.acc, p1, p2, 0.04 * k, 0.034 * k, st, 7);
    ell(ctx.acc, p2.x, p2.y, p2.z, 0.034 * k, 0.034 * k, 0.034 * k, st, null, 8, 6);
    taper(ctx.acc, p2, p3, 0.034 * k, 0.006 * k, st, 7);
    anchors.push(a);
  }
  return anchors;
}

function bow(ctx: Ctx, p: THREE.Vector3, size: number, color: number, bone: number, knot = 0x15131a): void {
  for (const s of [-1, 1]) box(ctx.acc, p.x + s * size * 0.5, p.y, p.z, size, size * 0.55, size * 0.16, { color: hex(color), bone, clean: true }, [0, 0, s * 0.45]);
  box(ctx.acc, p.x, p.y, p.z, size * 0.3, size * 0.34, size * 0.24, { color: hex(knot), bone, clean: true });
}

/** A fitted bodice with a skirt that flares to `hem`; `under` adds a longer, contrasting petticoat. */
function dress(ctx: Ctx, color: number, hem: number, flare: number, under?: { color: number; drop: number }): void {
  const k = ctx.D.k;
  if (under) skirtShell(ctx, 0.99, hem - under.drop, hex(under.color), flare * 0.88, 0.012 * k, 51, 1);
  skirtShell(ctx, 1.47, hem, hex(color), flare, 0.008 * k, 52, 1);
}

function tights(ctx: Ctx, color: number): void {
  for (const s of [-1, 1] as const) trouserLeg(ctx, s, 0.965, hex(color), 0.004 * ctx.D.k, 0, 61 + s, 0.001);
}

function choker(ctx: Ctx, color: number): void {
  const k = ctx.D.k;
  cyl(ctx.acc, 0, 1.528 * k, 0, 0.05 * k, 0.052 * k, 0.022 * k, { color: hex(color), bone: B.neck, clean: true }, null, 10, true);
}

interface Look {
  outfit: Outfit;
  /** Linear RGB of the eye glow. */
  eye: [number, number, number];
  hair: number;
  /** Glove colour, or null for bare hands. */
  gloves: number | null;
  build: (ctx: Ctx, hair: Style) => void;
}

const BARE: Outfit = { name: 'dress', top: 'none', topColor: 0, accent: 0, sleeves: 'none', bottom: 'none', bottomColor: 0, shoes: 'boots', shoeColor: 0x121216, hair: 'none', hairColor: 0, skin: 0xe2d2cc };

const LOOKS: Record<string, Look> = {
  shiroko: {
    outfit: BARE,
    eye: [0.25, 0.7, 1.0],
    hair: 0xd6d9e8,
    gloves: null,
    build(ctx, hair) {
      const h = headFrame(ctx);
      const k = h.k;
      tights(ctx, 0x1a1a22);
      dress(ctx, 0x17171f, 0.6, 0.07);
      for (const s of [-1, 1] as const) sleeve(ctx, s, 0.9, hex(0x1b1b24), 0.014 * k, 0.012 * k, 31 * s);
      hairCap(ctx, hair);
      hairBack(ctx, hair, 0.82);
      // the stray lock on top
      taper(ctx.acc, V(h.C.x, h.C.y + h.ry * 1.05, h.C.z), V(h.C.x + 0.03 * h.hs, h.C.y + h.ry * 1.05 + 0.07 * h.hs, h.C.z - 0.03 * h.hs), 0.012 * h.hs, 0.002 * h.hs, hair, 5);
      // wolf ears with dark inner fur
      for (const s of [-1, 1]) {
        const top = h.C.y + h.ry * 1.05;
        cone(ctx.acc, h.C.x + s * 0.05 * h.hs, top + 0.032 * h.hs, h.C.z + 0.01 * h.hs, 0.036 * h.hs, 0.11 * h.hs, hair, [-0.12, 0, -s * 0.3], 5);
        cone(ctx.acc, h.C.x + s * 0.05 * h.hs, top + 0.024 * h.hs, h.C.z - 0.006 * h.hs, 0.02 * h.hs, 0.075 * h.hs, { color: hex(0x3b3654), bone: B.head, clean: true }, [-0.12, 0, -s * 0.3], 5);
      }
      // dark halo: a thin ring with a broken inner arc
      const haloAt = new THREE.Matrix4().compose(V(h.C.x, h.C.y + h.ry + 0.14 * h.hs, h.C.z + 0.02 * h.hs), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.14, 0, 0.08)), V(1, 1, 1));
      const haloStyle: Style = { color: new THREE.Color(0.22, 0.24, 0.9), bone: B.head, glow: 1.3, clean: true };
      const ring = new THREE.TorusGeometry(0.11 * k, 0.0055 * k, 6, 30);
      ctx.acc.add(ring, haloAt, haloStyle);
      ring.dispose();
      const arc = new THREE.TorusGeometry(0.075 * k, 0.004 * k, 5, 20, Math.PI * 1.3);
      ctx.acc.add(arc, haloAt, haloStyle);
      arc.dispose();
      choker(ctx, 0x0f0f14);
      const pin: Style = { color: new THREE.Color(0.35, 0.8, 1.0), bone: B.head, glow: 0.9, clean: true };
      const pz = faceZ(h, 0.055 * h.hs, 0.07 * h.hs) - 0.028 * h.hs;
      box(ctx.acc, h.C.x + 0.058 * h.hs, h.C.y + 0.075 * h.hs, pz, 0.008 * h.hs, 0.04 * h.hs, 0.008 * h.hs, pin, [0, -0.5, 0.2]);
      box(ctx.acc, h.C.x + 0.058 * h.hs, h.C.y + 0.08 * h.hs, pz, 0.03 * h.hs, 0.008 * h.hs, 0.008 * h.hs, pin, [0, -0.5, 0.2]);
    },
  },
  sofia: {
    outfit: { ...BARE, shoeColor: 0x121014 },
    eye: [0.3, 0.75, 1.0],
    hair: 0xee9dbb,
    gloves: 0x141218,
    build(ctx, hair) {
      const h = headFrame(ctx);
      const k = h.k;
      const black = hex(0x18161c);
      const wine = hex(0x64182c);
      tights(ctx, 0x8a8690);
      // wine top, short black skirt, long black sleeves
      torsoShell(ctx, 0.92, 1.47, wine, 0.012 * k, 0, 71);
      skirtShell(ctx, 1.08, 0.7, black, 0.075, 0.006 * k, 72, 1);
      for (const s of [-1, 1] as const) sleeve(ctx, s, 0.92, black, 0.016 * k, 0.008 * k, 73 * s);
      // cape: black outside, wine lining, standing collar
      const capeBone = (p: THREE.Vector3): Weights => blend2(p.y, 0.95 * k, 1.3 * k, B.spine, B.chest);
      ell(ctx.acc, 0, 0.98 * k, 0.15 * k, 0.27 * k, 0.5 * k, 0.03 * k, { color: black.clone(), bone: capeBone, clean: true }, [0.06, 0, 0], 12, 10);
      ell(ctx.acc, 0, 0.98 * k, 0.135 * k, 0.25 * k, 0.48 * k, 0.02 * k, { color: wine.clone(), bone: capeBone, clean: true }, [0.06, 0, 0], 12, 10);
      for (const s of [-1, 1]) ell(ctx.acc, s * 0.13 * k, 1.44 * k, 0.03 * k, 0.07 * k, 0.045 * k, 0.11 * k, { color: black.clone(), bone: B.chest, clean: true }, [0, 0, s * 0.35], 8, 6);
      cyl(ctx.acc, 0, 1.52 * k, 0.01 * k, 0.085 * k, 0.07 * k, 0.07 * k, { color: black.clone(), bone: B.chest, clean: true }, null, 10, true);
      hairCap(ctx, hair, 0.34);
      hairBack(ctx, hair, 0.74, 1.15);
      // one drilled curl over the shoulder
      taper(ctx.acc, V(-h.rx * 1.05, h.C.y - 0.09 * h.hs, -0.02 * k), V(-0.11 * k, 1.3 * k, -0.095 * k), 0.03 * k, 0.026 * k, hair, 7);
      for (let i = 0; i < 3; i++) ell(ctx.acc, -0.11 * k, (1.27 - i * 0.045) * k, -0.1 * k, (0.036 - i * 0.006) * k, 0.028 * k, (0.036 - i * 0.006) * k, hair, null, 8, 6);
      // eye mask: a band around the head that the eyes show through
      const mask: Style = { color: hex(0x0d0c10), bone: B.head, clean: true, spec: 0.3 };
      ell(ctx.acc, h.C.x, h.C.y + 0.006 * h.hs, h.C.z, h.rx * 1.02, 0.038 * h.hs, h.rz * 1.02, mask, null, 18, 8);
      // top hat, tilted
      const pivot = V(h.C.x, h.C.y + h.ry * 0.86, h.C.z + 0.01 * h.hs);
      ctx.acc.frame = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.1, 0, -0.14)));
      const felt: Style = { color: hex(0x15131a), bone: B.head, clean: true, spec: 0.15 };
      cyl(ctx.acc, 0, 0.012 * h.hs, 0, 0.155 * h.hs, 0.155 * h.hs, 0.014 * h.hs, felt, null, 18);
      cyl(ctx.acc, 0, 0.1 * h.hs, 0, 0.098 * h.hs, 0.09 * h.hs, 0.17 * h.hs, felt, null, 18);
      cyl(ctx.acc, 0, 0.04 * h.hs, 0, 0.094 * h.hs, 0.093 * h.hs, 0.04 * h.hs, { color: hex(0x8a2450), bone: B.head, clean: true }, null, 18);
      ell(ctx.acc, 0.05 * h.hs, 0.05 * h.hs, -0.085 * h.hs, 0.03 * h.hs, 0.03 * h.hs, 0.022 * h.hs, { color: hex(0xb01828), bone: B.head, clean: true }, null, 8, 6);
      ell(ctx.acc, 0.085 * h.hs, 0.04 * h.hs, -0.06 * h.hs, 0.018 * h.hs, 0.018 * h.hs, 0.014 * h.hs, { color: hex(0x7a1220), bone: B.head, clean: true }, null, 6, 5);
      ctx.acc.frame = null;
      // roses at the waist
      for (const x of [-0.06, -0.015]) ell(ctx.acc, x * k, 1.03 * k, -0.125 * k, 0.026 * k, 0.026 * k, 0.02 * k, { color: hex(0xa81626), bone: B.spine, clean: true }, null, 7, 5);
    },
  },
  mahiru: {
    outfit: { ...BARE, shoes: 'dress', shoeColor: 0x141218 },
    eye: [1.0, 0.72, 0.2],
    hair: 0xe9c486,
    gloves: 0x1a1820,
    build(ctx, hair) {
      const h = headFrame(ctx);
      const k = h.k;
      const lav = 0xbe9be6;
      tights(ctx, 0xd9d5de);
      dress(ctx, 0x1a1820, 0.62, 0.17, { color: lav, drop: 0.09 });
      for (const s of [-1, 1] as const) sleeve(ctx, s, 0.88, hex(0x1d1b24), 0.014 * k, 0.03 * k, 41 * s);
      torsoShell(ctx, 1.02, 1.065, hex(lav), 0.021 * k, 0, 7);
      // lacing down the skirt front and bows
      for (const y of [0.9, 0.82, 0.74]) bow(ctx, V(0, y * k, -(0.13 + (0.93 - y) * 0.42) * k), 0.035 * k, lav, B.pelvis);
      bow(ctx, V(0, 1.41 * k, -0.118 * k), 0.055 * k, lav, B.chest);
      choker(ctx, 0x1a1820);
      hairCap(ctx, hair, 0.32);
      hairBack(ctx, hair, 0.22);
      const anchors = twinTails(ctx, hair, true, 0.68);
      for (const a of anchors) bow(ctx, V(a.x, a.y + 0.012 * k, a.z - 0.022 * k), 0.045 * k, lav, B.head);
      // frilled headdress
      ell(ctx.acc, h.C.x, h.C.y + h.ry * 0.95, h.C.z - 0.014 * h.hs, h.rx * 1.14, 0.022 * h.hs, 0.03 * h.hs, { color: hex(0x18161c), bone: B.head, clean: true }, null, 12, 5);
      ell(ctx.acc, h.C.x, h.C.y + h.ry * 0.9, h.C.z - 0.03 * h.hs, h.rx * 1.12, 0.012 * h.hs, 0.022 * h.hs, { color: hex(lav), bone: B.head, clean: true }, null, 12, 5);
      const wing: Style = { color: hex(0x3a2b52), bone: B.chest, clean: true };
      for (const s of [-1, 1]) {
        // little bat wings on the headdress and a larger pair on the back
        ell(ctx.acc, h.C.x + s * 0.09 * h.hs, h.C.y + h.ry * 1.1, h.C.z - 0.01 * h.hs, 0.052 * h.hs, 0.03 * h.hs, 0.006 * h.hs, { ...wing, bone: B.head }, [0, 0, s * 0.5], 6, 4);
        ell(ctx.acc, s * 0.21 * k, 1.36 * k, 0.13 * k, 0.18 * k, 0.085 * k, 0.008 * k, wing, [0, -s * 0.5, s * 0.45], 8, 5);
        ell(ctx.acc, s * 0.29 * k, 1.25 * k, 0.16 * k, 0.11 * k, 0.06 * k, 0.008 * k, wing, [0, -s * 0.6, s * 0.1], 8, 5);
      }
      // teddy bear clutched in the left hand
      const hand = ctx.rest[B.haL]!;
      const fur: Style = { color: hex(0xb07e46), bone: B.haL, clean: true };
      const bx = hand.x + 0.03 * k;
      const by = hand.y - 0.11 * k;
      const bz = hand.z - 0.05 * k;
      ell(ctx.acc, bx, by, bz, 0.055 * k, 0.065 * k, 0.05 * k, fur, null, 9, 7);
      ell(ctx.acc, bx, by + 0.095 * k, bz, 0.05 * k, 0.046 * k, 0.046 * k, fur, null, 9, 7);
      for (const s of [-1, 1]) {
        ell(ctx.acc, bx + s * 0.04 * k, by + 0.135 * k, bz, 0.018 * k, 0.018 * k, 0.012 * k, fur, null, 6, 5);
        ell(ctx.acc, bx + s * 0.055 * k, by - 0.01 * k, bz - 0.01 * k, 0.02 * k, 0.034 * k, 0.02 * k, fur, [0, 0, s * 0.6], 6, 5);
        ell(ctx.acc, bx + s * 0.03 * k, by - 0.07 * k, bz - 0.02 * k, 0.024 * k, 0.03 * k, 0.03 * k, fur, null, 6, 5);
        ell(ctx.acc, bx + s * 0.018 * k, by + 0.105 * k, bz - 0.042 * k, 0.006 * k, 0.006 * k, 0.004 * k, { ...fur, color: hex(0x18120e) }, null, 5, 4);
      }
      ell(ctx.acc, bx, by + 0.085 * k, bz - 0.04 * k, 0.02 * k, 0.016 * k, 0.014 * k, { ...fur, color: hex(0xdcc090) }, null, 6, 5);
      bow(ctx, V(bx, by + 0.045 * k, bz - 0.045 * k), 0.03 * k, 0x5f8fd0, B.haL, 0x3a5f96);
    },
  },
  noire: {
    outfit: { ...BARE, shoeColor: 0x15151a },
    eye: [1.0, 0.12, 0.14],
    hair: 0x25253e,
    gloves: 0x1c1c26,
    build(ctx, hair) {
      const h = headFrame(ctx);
      const k = h.k;
      const red = hex(0xb8202e);
      tights(ctx, 0xdcdae0);
      dress(ctx, 0x1a1a22, 0.64, 0.15, { color: 0xb8202e, drop: 0.07 });
      torsoShell(ctx, 1.37, 1.41, red, 0.022 * k, 0, 11);
      cyl(ctx.acc, 0, 1.5 * k, 0, 0.062 * k, 0.07 * k, 0.03 * k, { color: red.clone(), bone: B.neck, clean: true }, null, 10, true);
      // armour: chest piece, waist plates and long gauntlets
      const plate: Style = { color: hex(0x2b2e3c), bone: B.chest, spec: 0.75, clean: true };
      const trim: Style = { color: new THREE.Color(0.5, 0.75, 1.0), bone: B.chest, glow: 0.8, clean: true };
      box(ctx.acc, 0, 1.25 * k, -0.108 * k, 0.12 * k, 0.17 * k, 0.03 * k, plate, [0.1, 0, 0]);
      box(ctx.acc, 0, 1.25 * k, -0.126 * k, 0.012 * k, 0.16 * k, 0.006 * k, trim, [0.1, 0, 0]);
      for (const s of [-1, 1] as const) {
        box(ctx.acc, s * 0.11 * k, 1.0 * k, -0.07 * k, 0.07 * k, 0.11 * k, 0.02 * k, { ...plate, bone: B.pelvis }, [0.15, -s * 0.7, 0]);
        const el = ctx.rest[s < 0 ? B.elL : B.elR]!;
        const ha = ctx.rest[s < 0 ? B.haL : B.haR]!;
        taper(ctx.acc, V(el.x, el.y + 0.03 * k, el.z), V(ha.x, ha.y + 0.02 * k, ha.z), 0.047 * k, 0.038 * k, { ...plate, bone: s < 0 ? B.elL : B.elR }, 8);
      }
      hairCap(ctx, hair, 0.28);
      hairBack(ctx, hair, 0.26);
      const anchors = twinTails(ctx, hair, true, 0.78);
      for (const a of anchors) {
        const s = Math.sign(a.x);
        // tall two-tone ribbons standing up from each tail
        for (const [dx, col] of [[0.0, 0xb8202e], [0.03, 0x15131a]] as const) {
          box(ctx.acc, a.x + s * (0.02 + dx) * k, a.y + 0.07 * k, a.z, 0.035 * k, 0.13 * k, 0.012 * k, { color: hex(col), bone: B.head, clean: true }, [0, 0, -s * (0.25 + dx * 9)]);
        }
        ell(ctx.acc, a.x, a.y + 0.012 * k, a.z - 0.025 * k, 0.022 * k, 0.022 * k, 0.016 * k, { color: hex(0xe8d6dc), bone: B.head, clean: true }, null, 6, 5);
      }
    },
  },
  miku: {
    outfit: { ...BARE, name: 'tee-and-skirt', top: 'tshirt', topColor: 0x3b3c45, accent: 0x3b3c45, sleeves: 'short', bottom: 'shorts', bottomColor: 0xa8486a, shoes: 'sneakers', shoeColor: 0xbdb9b0 },
    eye: [0.3, 0.45, 1.0],
    hair: 0xa9593c,
    gloves: null,
    build(ctx, hair) {
      const h = headFrame(ctx);
      const k = h.k;
      hairCap(ctx, hair, 0.24);
      hairBack(ctx, hair, 0.44);
      twinTails(ctx, hair, false, 0.34, true);
      // heavy fringe falling over one eye
      ell(ctx.acc, h.C.x + 0.036 * h.hs, h.C.y + 0.03 * h.hs, faceZ(h, 0.036 * h.hs, 0.03 * h.hs) - 0.012 * h.hs, 0.03 * h.hs, 0.05 * h.hs, 0.014 * h.hs, hair, [0, -0.38, -0.3], 7, 6);
      // pleated skirt (rigid on the pelvis) with a darker check band, and the pink print on the shirt
      const pink: Style = { color: hex(0xb24c70), bone: B.pelvis, clean: true };
      cyl(ctx.acc, 0, 0.865 * k, 0, 0.16 * k, 0.225 * k, 0.17 * k, pink, null, 14, true);
      cyl(ctx.acc, 0, 0.81 * k, 0, 0.196 * k, 0.213 * k, 0.03 * k, { ...pink, color: hex(0x6e2c48) }, null, 14, true);
      ell(ctx.acc, 0, 1.2 * k, -0.118 * k, 0.065 * k, 0.05 * k, 0.008 * k, { color: hex(0xd66a9a), bone: B.chest, clean: true }, [0.08, 0, 0], 8, 5);
      // headphones worn around the neck
      const blue: Style = { color: hex(0x2f62b0), bone: B.chest, clean: true, spec: 0.5 };
      const g = new THREE.TorusGeometry(0.072 * k, 0.011 * k, 6, 20, Math.PI * 1.25);
      const m = new THREE.Matrix4().compose(V(0, 1.475 * k, 0.012 * k), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.25, 0, -Math.PI * 0.125)), V(1, 1, 1));
      ctx.acc.add(g, m, blue);
      g.dispose();
      for (const s of [-1, 1]) ell(ctx.acc, s * 0.07 * k, 1.44 * k, -0.045 * k, 0.02 * k, 0.04 * k, 0.04 * k, blue, [0, s * 0.3, 0], 8, 6);
      choker(ctx, 0x101014);
    },
  },
};

function skinSet(base: number): { skin: THREE.Color; dark: THREE.Color; light: THREE.Color } {
  const skin = hex(base);
  const hsl = { h: 0, s: 0, l: 0 };
  skin.getHSL(hsl);
  return {
    skin,
    dark: new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9 + 0.06), hsl.l * 0.5),
    light: new THREE.Color().setHSL(hsl.h, hsl.s * 0.85, Math.min(0.85, hsl.l * 1.14)),
  };
}

/** Bake one carrier into rig assets that `ZombieRigImpl` can use directly. */
export function buildCarrierAssets(def: CarrierDef, index: number): TypeAssets {
  const look = LOOKS[def.id];
  if (!look) throw new Error(`no look defined for carrier "${def.id}"`);
  // a slimmer build with a larger head than the stock infected, whichever of them it moves like
  const D = makeDims(def.base, def.height);
  const k = D.k;
  D.torsoW = 0.88;
  D.torsoD = 0.84;
  D.armT = 0.78;
  D.legT = 0.74;
  D.shX = 0.172 * k;
  D.hipX = 0.081 * k;
  D.upperArm = 0.3 * k;
  D.foreArm = 0.27 * k;
  D.armAngle = 0.13;
  D.headS = 1.22;
  D.headCenterUp = 0.1 * k * D.headS;
  const rest = restPositions(D);
  const seed = 9001 + index * 7919;
  const sk = skinSet(look.outfit.skin);
  const ctx: Ctx = { acc: new Accum(), D, rest, rand: mulberry32(seed), girth: 1, skin: sk.skin, skinDark: sk.dark, skinLight: sk.light, eye: new THREE.Color(...look.eye), eyeGlow: 2.2 };
  addTorsoSkin(ctx);
  addNeck(ctx);
  addFace(ctx, ctx.eye, hex(look.hair).multiplyScalar(0.35));
  addArmsSkin(ctx);
  addLegsSkin(ctx);
  addHands(ctx, look.gloves === null ? { clawColor: hex(0x6a4040) } : { glove: hex(look.gloves), clawColor: hex(look.gloves) });
  addOutfit(ctx, look.outfit);
  look.build(ctx, hairStyle(ctx, look.hair));

  const hc = headCenter(D);
  const hs = k * D.headS;
  const blood = new THREE.Color(0.2, 0.018, 0.016);
  const splats: Splat[] = [
    { c: V(0.01 * hs, hc.y - 0.07 * hs, hc.z - 0.08 * hs), r: 0.035 * hs, a: 0.9, color: blood },
    { c: V(0.05 * k, 1.18 * k, -0.11 * k), r: 0.11 * k, a: 0.4, color: blood },
  ];
  for (const b of [B.haL, B.haR]) splats.push({ c: V(rest[b]!.x, rest[b]!.y - 0.05 * k, rest[b]!.z), r: 0.1 * k, a: 0.6, color: blood });
  const geo = ctx.acc.toGeometry({ seed, dirt: 0.4, tone: 1.32, splats });
  return {
    type: def.base,
    D,
    rest,
    inverses: null,
    variants: [geo],
    probes: [computeProbes(geo, rest)],
    legLen: D.hipY,
    boundSphere: new THREE.Sphere(new THREE.Vector3(0, D.H * 0.5, 0), D.H),
  };
}
