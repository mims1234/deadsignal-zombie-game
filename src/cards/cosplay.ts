/**
 * Procedural 3D stand-ins for the card carriers (worn without NEW 3D MODELS, or until her real-asset model is in). Each one reuses the infected skeleton, skinning and animation from
 * `enemies/zombie/` but gets its own head (large eyes instead of a skull), hair volume, outfit and signature props,
 * baked into ONE skinned geometry. Nothing here is read from the card art: the likeness is silhouette and colour.
 */
import * as THREE from 'three';
import { type Ctx, V, addArmsSkin, addHands, addLegsSkin, addNeck, addTorsoSkin, blend2, headCenter, hex } from '../enemies/zombie/body';
import { B, makeDims, restPositions } from '../enemies/zombie/dims';
import { type Outfit, addOutfit, skirtShell, sleeve, torsoShell, trouserLeg } from '../enemies/zombie/garments';
import { Accum, type Splat, type Style, type Weights, ell, taper } from '../enemies/zombie/mesh';
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

/** A fitted bodice with a skirt that flares to `hem`; `under` adds a longer, contrasting petticoat. */
function dress(ctx: Ctx, color: number, hem: number, flare: number, under?: { color: number; drop: number }): void {
  const k = ctx.D.k;
  if (under) skirtShell(ctx, 0.99, hem - under.drop, hex(under.color), flare * 0.88, 0.012 * k, 51, 1);
  skirtShell(ctx, 1.47, hem, hex(color), flare, 0.008 * k, 52, 1);
}

function tights(ctx: Ctx, color: number): void {
  for (const s of [-1, 1] as const) trouserLeg(ctx, s, 0.965, hex(color), 0.004 * ctx.D.k, 0, 61 + s, 0.001);
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
  kaede: {
    // a silver-white bob, an indigo track suit, white trainers
    outfit: { ...BARE, name: 'track', top: 'jacket', topColor: 0x262a52, accent: 0x3a4078, sleeves: 'long', bottom: 'slacks', bottomColor: 0x262a52, shoes: 'sneakers', shoeColor: 0xd8d8dc },
    eye: [0.25, 0.7, 1.0],
    hair: 0xd6d9e8,
    gloves: null,
    build(ctx, hair) {
      hairCap(ctx, hair, 0.3);
      hairBack(ctx, hair, 0.2, 1.05);
    },
  },
  selene: {
    // long rose-pink hair, a wine dress, a long black coat
    outfit: { ...BARE, shoeColor: 0x121014 },
    eye: [0.3, 0.75, 1.0],
    hair: 0xd27a96,
    gloves: null,
    build(ctx, hair) {
      const k = ctx.D.k;
      const black = hex(0x141418);
      tights(ctx, 0x1c1a20);
      dress(ctx, 0x64182c, 0.66, 0.08);
      // the coat: a shell over the dress, open long tails, long sleeves
      torsoShell(ctx, 0.95, 1.47, black, 0.02 * k, 0, 81);
      skirtShell(ctx, 1.0, 0.5, black, 0.09, 0.006 * k, 82, 1);
      for (const s of [-1, 1] as const) sleeve(ctx, s, 0.95, black, 0.02 * k, 0.006 * k, 83 * s);
      hairCap(ctx, hair, 0.32);
      hairBack(ctx, hair, 0.72, 1.15);
    },
  },
  hana: {
    // a honey-blonde braid, a lavender suit
    outfit: { ...BARE, shoes: 'dress', shoeColor: 0x141218 },
    eye: [1.0, 0.72, 0.2],
    hair: 0xdcaa62,
    gloves: null,
    build(ctx, hair) {
      const h = headFrame(ctx);
      const k = h.k;
      const lav = hex(0xae96d6);
      tights(ctx, 0xd9d5de);
      dress(ctx, 0xae96d6, 0.6, 0.13);
      for (const s of [-1, 1] as const) sleeve(ctx, s, 0.88, lav, 0.012 * k, 0.004 * k, 41 * s);
      hairCap(ctx, hair, 0.3);
      // the braid down her back
      for (let i = 0; i < 6; i++) ell(ctx.acc, 0, h.C.y - (0.12 + i * 0.07) * k, 0.12 * k, (0.034 - i * 0.003) * k, 0.04 * k, (0.03 - i * 0.002) * k, hair, null, 8, 6);
    },
  },
  reina: {
    // black hair tied high, a dark red top, black trousers, boots
    outfit: { ...BARE, name: 'kit', top: 'tshirt', topColor: 0x5a1018, accent: 0x5a1018, sleeves: 'short', bottom: 'cargo', bottomColor: 0x1a1a1e, shoes: 'boots', shoeColor: 0x121216, skin: 0x7a5440 },
    eye: [1.0, 0.12, 0.14],
    hair: 0x141418,
    gloves: 0x1c1c26,
    build(ctx, hair) {
      const h = headFrame(ctx);
      const k = h.k;
      hairCap(ctx, hair, 0.26);
      // a high ponytail
      const a = V(h.C.x, h.C.y + h.ry * 0.7, h.C.z + h.rz * 0.95);
      taper(ctx.acc, a, V(a.x, a.y - 0.22 * k, a.z + 0.05 * k), 0.035 * k, 0.012 * k, hair, 7);
    },
  },
  mio: {
    // an auburn bob, a faded blue tee and shorts, trainers
    outfit: { ...BARE, name: 'tee-and-shorts', top: 'tshirt', topColor: 0x46587e, accent: 0x46587e, sleeves: 'short', bottom: 'shorts', bottomColor: 0x46587e, shoes: 'sneakers', shoeColor: 0xbdb9b0 },
    eye: [0.3, 0.45, 1.0],
    hair: 0x8a3a1e,
    gloves: null,
    build(ctx, hair) {
      hairCap(ctx, hair, 0.26);
      hairBack(ctx, hair, 0.24);
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
