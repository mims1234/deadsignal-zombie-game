/**
 * The Matron's model and animation (the Asylum's boss, `matron.ts`): a tall, gaunt head nurse in a stained,
 * old-fashioned uniform - long dark dress and shoulder cape, a yellowed apron, a starched cap and veil - with a cracked
 * porcelain face, arms too long for her, a ring of keys at her belt and an oil lantern in her left hand.
 *
 * Built from three.js primitives into one merged geometry per joint (a jointed hierarchy, not a skinned mesh: there is
 * only ever one of her), drawn with the infected's shared material (vertex colours, `aGlow`, `aSpec`). The root sits at
 * her feet facing -Z, as for every `ZombieRig`; every animation mode of the Warden's AI has a pose of her own:
 *   idle    unnaturally still and upright, the head slowly tilting and scanning, now and then a twitch
 *   walk    a gliding, too-upright walk: tiny steps under the long skirt, no bob, the keys and the lantern swinging
 *   run     leaning in with the long right arm reaching ahead of her, fingers curled
 *   attack  a long-armed lunge: the arm drawn high and back, then a sweeping rake as she lunges
 *   roar    the shriek: the head tilts over, then is thrown back with the mouth stretched open, arms spread
 *   slam    both arms raised over her head and brought down as she folds forward
 *   charge  a rushing glide, bent forward, both arms reaching
 *   stagger, death (falls stiff like a statue: backward, forward or to the side), hit flinches, rage (eyes burn)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MATRON_DEF } from './matron';
import type { ZombieAnimState, ZombieMode, ZombieRig } from './zombieRigTypes';

// ---------------------------------------------------------------------------------------------
// geometry: primitives, painted with vertex colours, merged per joint
// ---------------------------------------------------------------------------------------------

interface Paint {
  color: number;
  /** Emissive strength (the vertex colour glows). */
  glow?: number;
  /** 0..1 hard / glossy surface (porcelain, metal, leather). */
  spec?: number;
  /** 0..1 how stained (old rust-brown and yellow blotches). */
  stain?: number;
  /** Darken toward the hem (mud, damp). */
  grime?: number;
}

const hash3 = (x: number, y: number, z: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Smooth value noise 0..1. */
function vnoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1;
    const dy = (k >> 1) & 1;
    const dz = (k >> 2) & 1;
    v += hash3(ix + dx, iy + dy, iz + dz) * (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
  }
  return v;
}

const STAIN_RUST = new THREE.Color(0x4e3020);
const STAIN_YELLOW = new THREE.Color(0x857446);
const GRIME = new THREE.Color(0x15130f);
const TMP_C = new THREE.Color();
const TMP_M = new THREE.Matrix4();
const TMP_Q = new THREE.Quaternion();
const TMP_E = new THREE.Euler();
const TMP_P = new THREE.Vector3();
const TMP_S = new THREE.Vector3();

/** Place a primitive (rotation XYZ, then scale) and paint it. `oy`: the joint's height in the body, for stains and grime. */
function prim(geo: THREE.BufferGeometry, p: Paint, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, oy = 1): THREE.BufferGeometry {
  TMP_E.set(rx, ry, rz, 'XYZ');
  TMP_Q.setFromEuler(TMP_E);
  TMP_M.compose(TMP_P.set(x, y, z), TMP_Q, TMP_S.set(sx, sy, sz));
  geo.applyMatrix4(TMP_M);
  if (!geo.index) {
    const n = geo.attributes.position!.count;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i);
    geo.setIndex(idx);
  }
  const pos = geo.attributes.position!;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const glow = new Float32Array(n);
  const spec = new Float32Array(n);
  const base = new THREE.Color(p.color);
  for (let i = 0; i < n; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    TMP_C.copy(base);
    if (p.stain) {
      // big soft blotches with ragged edges: old, dried, brown and yellow - never fresh
      const b = vnoise(px * 7 + 3.1, (py + oy) * 6, pz * 7) * 0.7 + vnoise(px * 23, (py + oy) * 21, pz * 23) * 0.3;
      const k = Math.max(0, Math.min(1, (b - 0.52) * 4)) * p.stain;
      if (k > 0) TMP_C.lerp(vnoise(px * 3, py * 3 + 9, pz * 3) > 0.5 ? STAIN_RUST : STAIN_YELLOW, k * 0.75);
    }
    if (p.grime) {
      const h = py + oy; // height above the floor at rest
      const k = Math.max(0, Math.min(1, (0.75 - h) / 0.6)) * p.grime;
      TMP_C.lerp(GRIME, k * (0.55 + 0.45 * vnoise(px * 9, h * 9, pz * 9)));
    }
    col[i * 3] = TMP_C.r;
    col[i * 3 + 1] = TMP_C.g;
    col[i * 3 + 2] = TMP_C.b;
    glow[i] = p.glow ?? 0;
    spec[i] = p.spec ?? 0;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geo.setAttribute('aSpec', new THREE.BufferAttribute(spec, 1));
  return geo;
}

/** The inside of a thin shell (skirt, cape, veil): the faces turned inward and drawn just inside the outer layer. */
function inner(geo: THREE.BufferGeometry, shrink = 0.975): THREE.BufferGeometry {
  geo.scale(shrink, 1, shrink);
  const idx = geo.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  const n = geo.attributes.normal!;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return geo;
}

const merge = (list: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const g = mergeGeometries(list, false)!;
  for (const x of list) x.dispose();
  g.computeBoundingSphere();
  return g;
};

const cyl = (rt: number, rb: number, h: number, seg = 10, open = false, t0 = 0, tl = Math.PI * 2): THREE.BufferGeometry => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl);
const sph = (r: number, ws = 12, hs = 9, p0 = 0, pl = Math.PI * 2, t0 = 0, tl = Math.PI): THREE.BufferGeometry => new THREE.SphereGeometry(r, ws, hs, p0, pl, t0, tl);
const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
const lathe = (pts: [number, number][], seg: number, p0 = 0, pl = Math.PI * 2): THREE.BufferGeometry =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, p0, pl);

// ---- palette ----
const DRESS = 0x262e3a;
const CAPE = 0x161b26;
const LINING = 0x4a1416;
const APRON = 0xc4bca6;
const LINEN = 0xd9d4c6;
const SKIN = 0x9c998f;
const PORCELAIN = 0xd8d2c4;
const HAIR = 0x14110e;
const STOCKING = 0x121214;
const SHOE = 0x18120e;
const BRASS = 0x86703c;
const IRON = 0x4c4a46;
const DARK = 0x050404;

/** Rest layout (metres). The root is at her feet. */
const HIP = 1.17;
const WAIST = 0.1; // the skirt hangs from the waist, above the hip joint
const SPINE = 0.12; // spine joint above the hip joint
const SPINE_LEN = 0.36;
const CHEST_LEN = 0.44;
const NECK_LEN = 0.16;
const HEAD_C = 0.13; // head centre above the head joint
const SH_X = 0.2;
const SH_Y = 0.36;
const UPPER = 0.46;
const FORE = 0.44;
const THIGH = 0.54;
const SHIN = 0.53;

interface Parts {
  skirt: THREE.BufferGeometry;
  spine: THREE.BufferGeometry;
  chest: THREE.BufferGeometry;
  neck: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
  mouth: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  foreArm: THREE.BufferGeometry;
  hand: [THREE.BufferGeometry, THREE.BufferGeometry];
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  foot: THREE.BufferGeometry;
  keys: THREE.BufferGeometry;
  lantern: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
}

let PARTS: Parts | null = null;

function buildParts(): Parts {
  const PI = Math.PI;
  // ---- the skirt: long, flared, rippled at the hem; a stained apron over the front ----
  const hemRipple = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const p = g.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > -0.95) continue;
      const a = Math.atan2(p.getX(i), p.getZ(i));
      const k = 1 + 0.045 * Math.sin(a * 9) * Math.min(1, (-0.95 - y) / 0.18);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  };
  // (lathe profiles run bottom to top, so the faces point outward)
  const skirtPts: [number, number][] = [
    [0.345, -1.13],
    [0.325, -1.04],
    [0.3, -0.92],
    [0.27, -0.7],
    [0.235, -0.4],
    [0.2, -0.16],
    [0.15, 0.0],
    [0.13, 0.08],
  ];
  const apronPts: [number, number][] = skirtPts.slice(3, 7).map(([r, y]) => [r + 0.012, y + 0.02] as [number, number]);
  const skirt = merge([
    prim(hemRipple(lathe(skirtPts, 22)), { color: DRESS, stain: 0.35, grime: 1 }, 0, WAIST, 0, 0, 0, 0, 1, 1, 0.86, HIP),
    prim(inner(hemRipple(lathe(skirtPts, 22))), { color: 0x0c0d10 }, 0, WAIST, 0, 0, 0, 0, 1, 1, 0.86, HIP),
    prim(lathe(apronPts, 10, PI - 0.85, 1.7), { color: APRON, stain: 1, grime: 0.6 }, 0, WAIST, 0, 0, 0, 0, 1, 1, 0.86, HIP),
    // apron ties at the back
    prim(box(0.05, 0.22, 0.012), { color: APRON, stain: 0.5 }, 0.03, WAIST - 0.12, 0.13, 0.12, 0, 0.12, 1, 1, 1, HIP),
  ]);

  // ---- the lower torso: dress, belt and buckle ----
  const spine = merge([
    prim(cyl(0.132, 0.15, SPINE_LEN, 12), { color: DRESS, stain: 0.2 }, 0, SPINE_LEN / 2, 0, 0, 0, 0, 1, 1, 0.7, HIP + SPINE),
    prim(cyl(0.154, 0.156, 0.05, 12), { color: 0x16110d, spec: 0.3 }, 0, 0.03, 0, 0, 0, 0, 1, 1, 0.72),
    prim(box(0.055, 0.045, 0.014), { color: 0x8c8a82, spec: 0.85 }, 0, 0.03, -0.113),
  ]);

  // ---- the chest: dress, apron bib and straps, collar, the shoulder cape (red-lined), a fob watch ----
  const CAPE_PTS: [number, number][] = [[0.235, 0.04], [0.232, 0.12], [0.225, 0.24], [0.205, 0.34], [0.15, 0.43], [0.085, 0.48]];
  const chest = merge([
    prim(cyl(0.178, 0.133, CHEST_LEN, 12), { color: DRESS, stain: 0.2 }, 0, CHEST_LEN / 2, 0, 0, 0, 0, 1, 1, 0.68, HIP + SPINE + SPINE_LEN),
    prim(sph(0.052, 10, 8), { color: DRESS }, SH_X - 0.01, SH_Y, 0, 0, 0, 0, 1, 0.9, 1),
    prim(sph(0.052, 10, 8), { color: DRESS }, -SH_X + 0.01, SH_Y, 0, 0, 0, 0, 1, 0.9, 1),
    prim(box(0.19, 0.27, 0.02), { color: APRON, stain: 1 }, 0, 0.17, -0.106, -0.09, 0, 0, 1, 1, 1, HIP + SPINE + SPINE_LEN),
    prim(box(0.028, 0.17, 0.012), { color: APRON, stain: 0.6 }, 0.078, 0.37, -0.124, -0.1, 0, -0.22),
    prim(box(0.028, 0.17, 0.012), { color: APRON, stain: 0.6 }, -0.078, 0.37, -0.124, -0.1, 0, 0.22),
    prim(new THREE.TorusGeometry(0.068, 0.021, 6, 16), { color: LINEN, stain: 0.4 }, 0, 0.44, 0, PI / 2, 0, 0, 1, 0.82, 1),
    // the cape: open at the front, a dark red edge
    prim(lathe(CAPE_PTS, 18, PI + 0.62, PI * 2 - 1.24), { color: CAPE, stain: 0.15 }, 0, 0, 0.01, 0, 0, 0, 1, 1, 0.72),
    prim(inner(lathe(CAPE_PTS, 18, PI + 0.62, PI * 2 - 1.24), 0.96), { color: LINING }, 0, 0, 0.01, 0, 0, 0, 1, 1, 0.72),
    // fob watch pinned at her breast
    prim(cyl(0.022, 0.022, 0.01, 12), { color: BRASS, spec: 0.85 }, -0.075, 0.27, -0.123, PI / 2 - 0.1, 0, 0),
    prim(box(0.004, 0.035, 0.004), { color: BRASS, spec: 0.85 }, -0.075, 0.305, -0.121),
  ]);

  const neck = merge([prim(cyl(0.04, 0.05, NECK_LEN + 0.02, 8), { color: SKIN }, 0, NECK_LEN / 2, 0)]);

  // ---- the head: a cracked porcelain face, hollow eyes, hair pinned under a starched cap with a veil ----
  const face = merge([
    prim(sph(0.125, 22, 16), { color: PORCELAIN, spec: 0.45 }, 0, HEAD_C, 0, 0, 0, 0, 0.92, 1.18, 1),
    // eye hollows and a small doll's nose
    prim(sph(0.031, 10, 8), { color: DARK }, 0.043, HEAD_C + 0.017, -0.11, 0, 0, -0.15, 1.25, 0.85, 0.5),
    prim(sph(0.031, 10, 8), { color: DARK }, -0.043, HEAD_C + 0.017, -0.11, 0, 0, 0.15, 1.25, 0.85, 0.5),
    prim(sph(0.017, 8, 6), { color: PORCELAIN, spec: 0.45 }, 0, HEAD_C - 0.022, -0.126, 0, 0, 0, 0.7, 1, 0.8),
    // cracks running from the crown through the right eye, and under the left
    prim(box(0.0045, 0.075, 0.006), { color: 0x1c1712 }, 0.022, HEAD_C + 0.085, -0.103, -0.55, 0, 0.35),
    prim(box(0.0045, 0.045, 0.006), { color: 0x1c1712 }, 0.05, HEAD_C + 0.05, -0.112, -0.3, 0, -0.55),
    prim(box(0.0045, 0.05, 0.006), { color: 0x1c1712 }, -0.058, HEAD_C - 0.03, -0.108, 0.15, 0, 0.25),
    prim(box(0.0045, 0.03, 0.006), { color: 0x1c1712 }, -0.075, HEAD_C - 0.06, -0.098, 0.3, 0, -0.5),
  ]);
  const head = merge([
    // hair: the back of the head, pinned up under the cap
    prim(sph(0.133, 14, 10, 0.3, PI - 0.6, 0, PI * 0.8), { color: HAIR }, 0, HEAD_C + 0.006, 0.01, 0, 0, 0, 0.95, 1.2, 1.04),
    // the cap: a starched band and crown, two wings, a faded red cross; the veil down her back
    prim(box(0.2, 0.08, 0.16), { color: LINEN, stain: 0.35 }, 0, HEAD_C + 0.125, 0.012, 0.22, 0, 0),
    prim(box(0.21, 0.025, 0.166), { color: 0xc9c3b2 }, 0, HEAD_C + 0.088, 0.004, 0.22, 0, 0),
    prim(box(0.095, 0.07, 0.008), { color: LINEN }, 0.115, HEAD_C + 0.14, 0.03, 0.2, 0.35, -0.5),
    prim(box(0.095, 0.07, 0.008), { color: LINEN }, -0.115, HEAD_C + 0.14, 0.03, 0.2, -0.35, 0.5),
    prim(box(0.04, 0.012, 0.004), { color: 0x7a2420 }, 0, HEAD_C + 0.13, -0.07, 0.22, 0, 0),
    prim(box(0.012, 0.04, 0.004), { color: 0x7a2420 }, 0, HEAD_C + 0.13, -0.07, 0.22, 0, 0),
    prim(cyl(0.14, 0.15, 0.3, 12, true, -1.0, 2.0), { color: LINEN, stain: 0.45 }, 0, HEAD_C - 0.03, 0.015, -0.06, 0, 0, 1, 1, 0.92),
    prim(inner(cyl(0.14, 0.15, 0.3, 12, true, -1.0, 2.0), 0.97), { color: 0xb9b3a4 }, 0, HEAD_C - 0.03, 0.015, -0.06, 0, 0, 1, 1, 0.92),
  ]);
  // the mouth: a dark slit that stretches open when she shrieks (scaled by the rig)
  const mouth = merge([prim(sph(0.032, 10, 8), { color: DARK }, 0, 0, 0, 0, 0, 0, 1, 1, 0.4)]);
  // pin-point eyes far back in the hollows (scaled up when she rages)
  const eyes = merge([prim(sph(0.0055, 6, 5), { color: 0xd6e2ff, glow: 1.6 })]);

  // ---- arms: long sleeves, starched cuffs, bare grey wrists ----
  const upperArm = merge([prim(cyl(0.04, 0.043, UPPER, 9), { color: DRESS, stain: 0.2 }, 0, -UPPER / 2, 0)]);
  const foreArm = merge([
    prim(cyl(0.034, 0.039, 0.33, 9), { color: DRESS, stain: 0.2 }, 0, -0.165, 0),
    prim(cyl(0.041, 0.041, 0.07, 9), { color: LINEN, stain: 0.5 }, 0, -0.355, 0),
    prim(cyl(0.022, 0.026, 0.07, 8), { color: SKIN }, 0, -0.41, 0),
  ]);
  // hands: a narrow palm and long, thin fingers that end in dark nails (side: +1 right, -1 left)
  const hand = (side: number): THREE.BufferGeometry => {
    const list = [prim(box(0.062, 0.1, 0.024), { color: SKIN }, 0, -0.05, 0)];
    for (let f = 0; f < 4; f++) {
      const x = (-0.022 + f * 0.0147) * side;
      const len = f === 1 || f === 2 ? 0.17 : 0.145;
      const spread = (f - 1.5) * 0.05 * side;
      list.push(prim(cyl(0.0068, 0.0052, len, 5), { color: SKIN }, x + Math.sin(spread) * len * 0.5, -0.1 - len / 2, -0.004, 0.12, 0, spread));
      list.push(prim(sph(0.0058, 5, 4), { color: 0x2a221c, spec: 0.4 }, x + Math.sin(spread) * len, -0.1 - len + 0.002, -0.004));
    }
    list.push(prim(cyl(0.008, 0.0065, 0.1, 5), { color: SKIN }, 0.036 * -side, -0.07, -0.014, 0.25, 0, 0.55 * side));
    return merge(list);
  };

  // ---- legs: black stockings and heavy old nurse's shoes (mostly hidden under the skirt) ----
  const thigh = merge([prim(cyl(0.05, 0.062, THIGH, 8), { color: STOCKING }, 0, -THIGH / 2, 0)]);
  const shin = merge([prim(cyl(0.036, 0.047, SHIN, 8), { color: STOCKING }, 0, -SHIN / 2, 0)]);
  const foot = merge([
    prim(box(0.078, 0.065, 0.2), { color: SHOE, spec: 0.35, grime: 0.6 }, 0, -0.045, -0.045, 0, 0, 0, 1, 1, 1, 0),
    prim(box(0.06, 0.05, 0.05), { color: SHOE, spec: 0.35 }, 0, -0.06, 0.04, 0, 0, 0, 1, 1, 1, 0),
  ]);

  // ---- the ring of keys at her belt: hangs from its joint at the ring's top ----
  const keyList: THREE.BufferGeometry[] = [prim(new THREE.TorusGeometry(0.032, 0.0045, 5, 16), { color: IRON, spec: 0.8 }, 0, -0.032, 0, 0, PI / 2, 0)];
  for (let k = 0; k < 6; k++) {
    const a = (k - 2.5) * 0.17;
    const len = 0.07 + (k % 3) * 0.012;
    const c = k % 2 ? BRASS : IRON;
    const bx = Math.sin(a) * (0.064 + len / 2);
    const by = -0.032 - Math.cos(a) * (0.032 + 0.012 + len / 2);
    keyList.push(prim(box(0.0055, len, 0.0035), { color: c, spec: 0.85 }, 0, by, bx, -a, 0, 0));
    keyList.push(prim(new THREE.TorusGeometry(0.009, 0.0032, 4, 8), { color: c, spec: 0.85 }, 0, -0.032 - Math.cos(a) * 0.044, Math.sin(a) * 0.044, 0, PI / 2, 0));
    const tip = 0.032 + 0.012 + len * 0.9;
    keyList.push(prim(box(0.004, 0.012, 0.014), { color: c, spec: 0.85 }, 0, -0.032 - Math.cos(a) * tip, Math.sin(a) * tip + 0.006, -a, 0, 0));
  }
  const keys = merge(keyList);

  // ---- the lantern: hangs from its handle at her grip ----
  const lanternList: THREE.BufferGeometry[] = [
    prim(new THREE.TorusGeometry(0.05, 0.0045, 4, 12, PI), { color: IRON, spec: 0.7 }, 0, -0.05, 0, 0, 0, 0),
    prim(cyl(0.018, 0.024, 0.04, 8), { color: IRON, spec: 0.7 }, 0, -0.07, 0),
    prim(cyl(0.024, 0.072, 0.055, 8), { color: 0x24201c, spec: 0.6 }, 0, -0.1, 0),
    prim(cyl(0.068, 0.068, 0.03, 8), { color: 0x24201c, spec: 0.6 }, 0, -0.265, 0),
  ];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + PI / 4;
    lanternList.push(prim(box(0.008, 0.14, 0.008), { color: 0x24201c, spec: 0.6 }, Math.sin(a) * 0.055, -0.185, Math.cos(a) * 0.055));
  }
  const lantern = merge(lanternList);
  const glass = merge([prim(cyl(0.048, 0.052, 0.13, 10), { color: 0xffffff }, 0, -0.185, 0)]);

  return { skirt, spine, chest, neck, head, face, mouth, eyes, upperArm, foreArm, hand: [hand(-1), hand(1)], thigh, shin, foot, keys, lantern, glass };
}

/** Her face: smooth and glossy, like glazed porcelain (the infected's shared material is grimy cloth). */
let porcelainMat: THREE.MeshStandardMaterial | null = null;
function porcelain(): THREE.MeshStandardMaterial {
  porcelainMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05, name: 'MatronPorcelain' });
  return porcelainMat;
}

let haloTexture: THREE.Texture | null = null;
function halo(): THREE.Texture | null {
  if (haloTexture || typeof document === 'undefined') return haloTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,214,150,1)');
  gr.addColorStop(0.25, 'rgba(255,170,80,0.55)');
  gr.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  haloTexture = new THREE.CanvasTexture(c);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

// ---------------------------------------------------------------------------------------------
// pose channels
// ---------------------------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/naming-convention */
const BX = 0; // body (pivot at the feet): pitch (+ back), roll, lift
const BZ = 1;
const BY = 2;
const PY = 3; // pelvis: drop, forward shift, pitch, yaw
const PZ = 4;
const PX = 5;
const PYAW = 6;
const SX = 7; // spine (- bends forward)
const SY = 8;
const SZ = 9;
const CX = 10; // chest
const CY = 11;
const CZ = 12;
const NX = 13; // neck
const NY = 14;
const NZ = 15;
const HX = 16; // head (+ looks up), yaw, roll
const HY = 17;
const HZ = 18;
const LSX = 19; // left shoulder (+ raises the arm forward), twist, out (- is outward on the left)
const LSY = 20;
const LSZ = 21;
const LE = 22; // left elbow (+ bends the forearm forward)
const LHX = 23;
const LHZ = 24;
const RSX = 25; // right shoulder (+ out on the right)
const RSY = 26;
const RSZ = 27;
const RE = 28;
const RHX = 29;
const RHZ = 30;
const LT = 31; // left thigh (+ forward), knee (- bends), foot
const LK = 32;
const LF = 33;
const RT = 34;
const RK = 35;
const RF = 36;
const SKX = 37; // skirt sway
const SKZ = 38;
const MOUTH = 39; // 0 closed .. 1 stretched open
const CURL = 40; // right fingers: + curled into claws
const NCH = 41;

type PoseArr = Float32Array;

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerpPose = (out: PoseArr, a: PoseArr, b: PoseArr, t: number): void => {
  for (let i = 0; i < NCH; i++) out[i] = a[i]! + (b[i]! - a[i]!) * t;
};

const IDLE_STATE: ZombieAnimState = { mode: 'idle', speed: 0, time: 0, actionT: 0, staggerT: 0, deathT: 0, aggro: 0, hitKick: 0, deathStyle: 0, headshotDeath: false, enraged: false };

// ---------------------------------------------------------------------------------------------
// the rig
// ---------------------------------------------------------------------------------------------

const V = new THREE.Vector3();

export class MatronRig implements ZombieRig {
  readonly type = 'warden' as const;
  readonly root = new THREE.Group();
  readonly radius = MATRON_DEF.radius;
  readonly height = MATRON_DEF.height;
  readonly headRadius = MATRON_DEF.headRadius;

  private readonly body = new THREE.Group();
  private readonly pelvis = new THREE.Group();
  private readonly skirt = new THREE.Group();
  private readonly spine = new THREE.Group();
  private readonly keys = new THREE.Group();
  private readonly chest = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly mouth: THREE.Mesh;
  private readonly eyes: THREE.Mesh[];
  private readonly shL = new THREE.Group();
  private readonly elL = new THREE.Group();
  private readonly haL = new THREE.Group();
  private readonly shR = new THREE.Group();
  private readonly elR = new THREE.Group();
  private readonly haR = new THREE.Group();
  private readonly fingersR: THREE.Mesh;
  private readonly lantern = new THREE.Group();
  private readonly glassMat: THREE.MeshBasicMaterial;
  private readonly halo: THREE.Sprite | null = null;
  private readonly haloMat: THREE.SpriteMaterial | null = null;
  private readonly thL = new THREE.Group();
  private readonly knL = new THREE.Group();
  private readonly ftL = new THREE.Group();
  private readonly thR = new THREE.Group();
  private readonly knR = new THREE.Group();
  private readonly ftR = new THREE.Group();
  private readonly joints: THREE.Object3D[];

  private readonly cur: PoseArr = new Float32Array(NCH);
  private readonly tgt: PoseArr = new Float32Array(NCH);
  private readonly k0: PoseArr = new Float32Array(NCH);
  private readonly k1: PoseArr = new Float32Array(NCH);
  private readonly k2: PoseArr = new Float32Array(NCH);
  // per-instance
  private phaseOff = 0;
  private side = 1;
  private twitchOff = 0;
  // gait
  private phase = 0;
  private moveW = 0;
  private runW = 0;
  private lanternSwing = 0;
  private lanternVel = 0;
  private keysSwing = 0;
  private keysVel = 0;
  private lastMode: ZombieMode = 'idle';
  private settled = false;
  private lampFade = 1;
  // animated key points in root space
  private readonly headLocal = new THREE.Vector3();
  private readonly chestLocal = new THREE.Vector3();
  private readonly handLocal = new THREE.Vector3();

  constructor(material: THREE.Material, seed: number) {
    PARTS ??= buildParts();
    const P = PARTS;
    this.root.name = 'Zombie:matron';
    const mesh = (geo: THREE.BufferGeometry, parent: THREE.Object3D, mat: THREE.Material = material): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    this.root.add(this.body);
    this.body.add(this.pelvis);
    this.pelvis.position.y = HIP;
    // skirt and legs
    this.pelvis.add(this.skirt);
    mesh(P.skirt, this.skirt);
    for (const [th, kn, ft, x] of [[this.thL, this.knL, this.ftL, -0.085], [this.thR, this.knR, this.ftR, 0.085]] as const) {
      th.position.set(x, -0.02, 0);
      kn.position.y = -THIGH;
      ft.position.y = -SHIN;
      this.pelvis.add(th);
      th.add(kn);
      kn.add(ft);
      mesh(P.thigh, th);
      mesh(P.shin, kn);
      mesh(P.foot, ft);
    }
    // torso
    this.spine.position.y = SPINE;
    this.pelvis.add(this.spine);
    mesh(P.spine, this.spine);
    this.keys.position.set(-0.148, 0.0, -0.035);
    this.spine.add(this.keys);
    mesh(P.keys, this.keys).castShadow = false;
    this.chest.position.y = SPINE_LEN;
    this.spine.add(this.chest);
    mesh(P.chest, this.chest);
    this.neck.position.y = CHEST_LEN;
    this.chest.add(this.neck);
    mesh(P.neck, this.neck);
    this.head.position.set(0, NECK_LEN, -0.012);
    this.head.scale.setScalar(1.1);
    this.neck.add(this.head);
    mesh(P.face, this.head, porcelain());
    mesh(P.head, this.head);
    this.mouth = mesh(P.mouth, this.head);
    this.mouth.position.set(0, HEAD_C - 0.068, -0.107);
    this.mouth.castShadow = false;
    this.eyes = [-1, 1].map((sx) => {
      const e = mesh(P.eyes, this.head);
      e.position.set(0.043 * sx, HEAD_C + 0.017, -0.122);
      e.castShadow = false;
      return e;
    });
    // arms
    for (const [sh, el, ha, s] of [[this.shL, this.elL, this.haL, -1], [this.shR, this.elR, this.haR, 1]] as const) {
      sh.position.set(SH_X * s, SH_Y, 0);
      el.position.y = -UPPER;
      ha.position.y = -FORE;
      this.chest.add(sh);
      sh.add(el);
      el.add(ha);
      mesh(P.upperArm, sh);
      mesh(P.foreArm, el);
    }
    mesh(P.hand[0], this.haL);
    this.fingersR = mesh(P.hand[1], this.haR);
    // the lantern, gripped in the left hand
    this.lantern.position.set(0, -0.07, -0.004);
    this.haL.add(this.lantern);
    mesh(P.lantern, this.lantern);
    this.glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.75, 0.22) });
    mesh(P.glass, this.lantern, this.glassMat).castShadow = false;
    const tex = halo();
    if (tex) {
      this.haloMat = new THREE.SpriteMaterial({ map: tex, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 });
      this.halo = new THREE.Sprite(this.haloMat);
      this.halo.scale.setScalar(0.62);
      this.halo.position.y = -0.185;
      this.lantern.add(this.halo);
    }
    this.joints = [this.body, this.pelvis, this.skirt, this.spine, this.keys, this.chest, this.neck, this.head, this.mouth, ...this.eyes, this.shL, this.elL, this.haL, this.shR, this.elR, this.haR, this.lantern, this.thL, this.knL, this.ftL, this.thR, this.knR, this.ftR];
    this.reset(seed);
  }

  reset(seed: number): void {
    let s = (seed * 2654435761 + 7) >>> 0;
    const r = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    this.phaseOff = r() * Math.PI * 2;
    this.side = r() < 0.5 ? -1 : 1;
    this.twitchOff = r() * 40;
    this.phase = 0;
    this.moveW = this.runW = 0;
    this.lanternSwing = this.lanternVel = this.keysSwing = this.keysVel = 0;
    this.settled = false;
    this.lampFade = 1;
    this.root.visible = true;
    this.lastMode = 'idle';
    IDLE_STATE.time = 0;
    this.pose(IDLE_STATE, 0);
    this.cur.set(this.tgt);
    this.apply(IDLE_STATE, 0);
  }

  update(s: ZombieAnimState, dt: number): void {
    if (!(dt >= 0)) dt = 0;
    else if (dt > 0.1) dt = 0.1;
    if (this.settled && s.mode === 'death') return;
    this.settled = false;
    const wasDeath = this.lastMode === 'death';
    this.pose(s, dt);
    // back on her feet (a co-op puppet's correction, the bestiary looping her death): no slow stand-up
    const snap = dt === 0 || (wasDeath && s.mode !== 'death');
    const rate = s.mode === 'death' ? 16 : s.mode === 'attack' || s.mode === 'slam' || s.mode === 'stagger' ? 24 : s.mode === 'roar' || s.mode === 'charge' ? 14 : 9;
    const k = snap ? 1 : 1 - Math.exp(-rate * dt);
    for (let i = 0; i < NCH; i++) this.cur[i] = this.cur[i]! + (this.tgt[i]! - this.cur[i]!) * k;
    this.lastMode = s.mode;
    this.apply(s, dt);
    if (s.mode === 'death' && s.deathT > 2) this.settled = true;
  }

  // ---- targets ---------------------------------------------------------------------------

  /** Target pose for this frame into `tgt`. */
  private pose(s: ZombieAnimState, dt: number): void {
    const T = this.tgt;
    const t = s.time + this.phaseOff * 3;
    const side = this.side;
    const moving = s.mode === 'walk' || s.mode === 'run' || s.mode === 'charge';
    const speed = moving ? Math.max(s.speed, s.mode === 'walk' ? 0.8 : 2.5) : 0;
    const wk = 1 - Math.exp(-6 * dt);
    this.moveW += ((moving ? 1 : 0) - this.moveW) * (dt === 0 ? 1 : wk);
    this.runW += ((s.mode === 'run' || s.mode === 'charge' ? 1 : 0) - this.runW) * (dt === 0 ? 1 : wk);
    // gait: long, slow strides walking; quick ones running
    const freq = speed > 0 ? 0.32 + speed * 0.3 : 0;
    this.phase += Math.PI * 2 * freq * dt;
    const ph = this.phase + this.phaseOff;
    const mw = this.moveW;
    const rw = this.runW;
    const sn = Math.sin(ph);
    const cs = Math.cos(ph);

    // ---- base: standing too straight; the left hand carries the lantern a little ahead ----
    T.fill(0);
    T[CX] = -0.03;
    T[NX] = 0.04;
    // the head: a slow tilt to one side and a slow scan, and now and then a twitch
    const twitchPh = (t * 0.13 + this.twitchOff) % 1;
    const twitch = twitchPh < 0.035 ? Math.sin((twitchPh / 0.035) * Math.PI) : 0;
    T[HZ] = side * (0.22 + 0.13 * Math.sin(t * 0.21)) + twitch * 0.32 * side;
    T[HY] = Math.sin(t * 0.33) * 0.42 * (1 - rw) + twitch * 0.18;
    T[HX] = -0.06 + Math.sin(t * 0.17) * 0.05;
    T[LSX] = 0.22;
    T[LSZ] = -0.09;
    T[LE] = 0.55;
    T[LHX] = -0.25;
    T[RSX] = 0.04;
    T[RSZ] = 0.1;
    T[RE] = 0.1;
    T[RHX] = 0.05;
    T[CURL] = 0.25 + 0.12 * Math.sin(t * 1.1);
    // breathing, barely
    T[CX] += Math.sin(t * 1.3) * 0.012;

    // ---- walk: a glide - small steps, no bob, the body never sways ----
    if (mw > 0.001) {
      const st = 0.26 * (1 - rw) + 0.5 * rw;
      T[LT] = sn * st * mw;
      T[RT] = -sn * st * mw;
      T[LK] = -Math.max(0, cs) * (0.35 + 0.5 * rw) * mw;
      T[RK] = -Math.max(0, -cs) * (0.35 + 0.5 * rw) * mw;
      T[LF] = -T[LT]! * 0.5 - T[LK]! * 0.3;
      T[RF] = -T[RT]! * 0.5 - T[RK]! * 0.3;
      T[BY] = Math.abs(Math.sin(ph * 2)) * 0.006 * mw;
      T[SKX] = Math.sin(ph * 2) * 0.02 * mw - 0.12 * rw;
      T[SKZ] = sn * 0.035 * mw;
      T[PYAW] = sn * 0.05 * mw;
      T[RSX] += sn * 0.07 * mw * (1 - rw);
    }
    // ---- run / charge: bent into it, the long right arm reaching ahead, the head up and fixed on you ----
    if (rw > 0.001) {
      const charge = s.mode === 'charge' ? 1 : 0;
      const rage = s.enraged ? 1 : 0;
      T[BX] += -(0.3 + 0.12 * rage + 0.18 * charge) * rw;
      T[SX] += -0.06 * rw;
      T[NX] += 0.16 * rw;
      T[HX] += (0.2 + 0.1 * charge) * rw;
      T[HZ] *= 1 - 0.5 * rw;
      T[RSX] += (1.3 + sn * 0.12 + 0.15 * charge) * rw;
      T[RSZ] += -0.05 * rw;
      T[RE] += 0.05 * rw;
      T[LSX] += (0.55 + 0.6 * charge) * rw;
      T[LSZ] += (-0.1 + 0.1 * charge) * rw;
      T[LE] += (-0.25 - 0.2 * charge) * rw;
      T[CURL] += (0.45 - 0.7 * charge) * rw; // charging: fingers splayed wide
      if (s.enraged) T[HY] += Math.sin(t * 31) * 0.05;
    }

    // ---- actions ----
    const a = clamp01(s.actionT);
    switch (s.mode) {
      case 'attack':
        this.attackPose(a, t);
        break;
      case 'roar':
        this.roarPose(a, t);
        break;
      case 'slam':
        this.slamPose(a);
        break;
      case 'stagger':
        this.staggerPose(s.staggerT);
        break;
      case 'death':
        this.deathPose(s);
        break;
      default:
        break;
    }
    if (s.enraged && s.mode !== 'death') {
      T[CX] -= 0.06;
      T[CURL] += 0.2;
    }
  }

  /** The long-armed lunge: drawn high and back, then a raking sweep forward and down as she lunges. */
  private attackPose(a: number, t: number): void {
    const T = this.tgt;
    const B = this.k0;
    const W = this.k1;
    const S = this.k2;
    B.set(T);
    W.set(T);
    W[RSX] = -0.65;
    W[RSZ] = 1.35;
    W[RE] = 1.15;
    W[RHX] = -0.4;
    W[CY] = -0.38;
    W[SY] = -0.12;
    W[BX] = 0.07;
    W[HZ] = T[HZ]! + 0.25 * this.side;
    W[HX] = 0.05;
    W[LSZ] = -0.35;
    W[CURL] = 0.1;
    W[MOUTH] = 0.25;
    S.set(W);
    S[RSX] = 1.8;
    S[RSZ] = -0.08;
    S[RE] = 0.05;
    S[RHX] = 0.3;
    S[CY] = 0.42;
    S[SY] = 0.15;
    S[BX] = -0.4;
    S[PZ] = -0.32;
    S[PY] = -0.06;
    S[HX] = 0.22;
    S[HY] = 0;
    S[CURL] = 0.85;
    S[LSX] = 0.6;
    S[LSZ] = -0.55;
    S[MOUTH] = 0.5;
    S[LT] = 0.35;
    S[RK] = -0.3;
    if (a < 0.55) lerpPose(T, B, W, ease(a / 0.55));
    else if (a < 0.72) lerpPose(T, W, S, ease((a - 0.55) / 0.17));
    else lerpPose(T, S, B, ease((a - 0.72) / 0.28));
    void t;
  }

  /** The shriek: the head tilts slowly over, then is thrown back, mouth stretched, arms spread, shuddering. */
  private roarPose(a: number, t: number): void {
    const T = this.tgt;
    const B = this.k0;
    const D = this.k1;
    const Sh = this.k2;
    const side = this.side;
    B.set(T);
    D.set(T);
    D[HZ] = 0.85 * side;
    D[HX] = -0.05;
    D[HY] = 0;
    D[CX] = 0.06;
    D[LSZ] = -0.3;
    D[RSZ] = 0.3;
    D[MOUTH] = 0.15;
    Sh.set(D);
    Sh[HX] = 0.5;
    Sh[HZ] = 0.62 * side;
    Sh[NX] = 0.15;
    Sh[CX] = 0.14;
    Sh[BX] = 0.07;
    Sh[LSZ] = -1.15;
    Sh[RSZ] = 1.15;
    Sh[LSX] = 0.35;
    Sh[RSX] = 0.35;
    Sh[LE] = 0.3;
    Sh[RE] = 0.25;
    Sh[CURL] = -0.35;
    Sh[MOUTH] = 1;
    if (a < 0.22) lerpPose(T, B, D, ease(a / 0.22));
    else if (a < 0.85) {
      lerpPose(T, D, Sh, ease((a - 0.22) / 0.1));
      // the scream shakes her
      T[HY] += Math.sin(t * 57) * 0.07;
      T[HZ] += Math.sin(t * 43) * 0.06;
      T[CZ] += Math.sin(t * 37) * 0.02;
    } else lerpPose(T, Sh, B, ease((a - 0.85) / 0.15));
  }

  /** Both arms raised over her head and brought down as she folds forward and drops. */
  private slamPose(a: number): void {
    const T = this.tgt;
    const B = this.k0;
    const U = this.k1;
    const D = this.k2;
    B.set(T);
    U.set(T);
    U[LSX] = 2.75;
    U[RSX] = 2.75;
    U[LSZ] = -0.28;
    U[RSZ] = 0.28;
    U[LE] = 0.35;
    U[RE] = 0.35;
    U[BX] = 0.12;
    U[CX] = 0.1;
    U[HX] = 0.25;
    U[HY] = 0;
    U[PY] = 0.04;
    U[MOUTH] = 0.6;
    U[CURL] = 0.5;
    D.set(U);
    D[LSX] = 0.95;
    D[RSX] = 0.95;
    D[LSZ] = -0.1;
    D[RSZ] = 0.1;
    D[LE] = 0.05;
    D[RE] = 0.05;
    D[BX] = -0.22;
    D[SX] = -0.45;
    D[CX] = -0.18;
    D[HX] = 0.45;
    D[PY] = -0.12;
    D[LT] = 0.3;
    D[RT] = 0.3;
    D[LK] = -0.45;
    D[RK] = -0.45;
    D[LF] = 0.15;
    D[RF] = 0.15;
    D[MOUTH] = 0.8;
    D[CURL] = 0.9;
    if (a < 0.55) lerpPose(T, B, U, ease(a / 0.55));
    else if (a < 0.72) lerpPose(T, U, D, ease((a - 0.55) / 0.17));
    else lerpPose(T, D, B, ease((a - 0.72) / 0.28));
  }

  private staggerPose(st: number): void {
    const T = this.tgt;
    const k = st < 0.25 ? Math.sin((st / 0.25) * Math.PI * 0.5) : Math.max(0, 1 - (st - 0.25) / 0.75);
    T[BX] += 0.28 * k;
    T[CX] += 0.15 * k;
    T[HX] += 0.45 * k;
    T[HZ] += 0.3 * k * this.side;
    T[LSZ] += -0.7 * k;
    T[RSZ] += 0.7 * k;
    T[LSX] += -0.3 * k;
    T[RSX] += -0.3 * k;
    T[MOUTH] = 0.6 * k;
    T[CURL] = -0.3 * k;
  }

  /** She goes down stiff, like a statue tipping off its plinth: a buckle at the knees, then the fall, a small bounce. */
  private deathPose(s: ZombieAnimState): void {
    const T = this.tgt;
    const d = s.deathT;
    const sink = ease(d / 0.45);
    const f = clamp01((d - 0.3) / 0.8);
    const fall = f * f;
    const bounce = Math.sin(clamp01((d - 1.1) / 0.35) * Math.PI) * 0.07;
    const ang = (Math.PI / 2 - 0.07) * fall - bounce;
    T.fill(0);
    T[PY] = -0.16 * sink;
    T[LT] = T[RT] = 0.5 * sink * (1 - fall);
    T[LK] = T[RK] = -0.8 * sink * (1 - fall);
    T[SX] = -0.12 * sink;
    T[HZ] = 0.4 * this.side * sink;
    T[LSZ] = -0.25;
    T[RSZ] = 0.25;
    T[LE] = 0.3;
    T[CURL] = 0.6;
    T[MOUTH] = 0.55 * sink;
    if (s.deathStyle === 0) {
      T[BX] = ang;
      // arms flung out to the sides, lying on the floor
      T[LSZ] = -0.25 - 1.15 * fall;
      T[RSZ] = 0.25 + 1.15 * fall;
      T[LSX] = T[RSX] = 0.35 * fall;
      T[BY] = 0.13 * fall;
    } else if (s.deathStyle === 1) {
      T[BX] = -ang;
      T[LSX] = T[RSX] = 2.6 * fall; // reaching out ahead of her as she goes down
      T[HX] = 0.4 * fall;
      T[BY] = 0.12 * fall;
    } else {
      T[BZ] = ang * this.side;
      T[BY] = 0.16 * fall;
      T[LSZ] = -0.25 - 0.9 * fall * (this.side < 0 ? 0 : 1);
      T[RSZ] = 0.25 + 0.9 * fall * (this.side > 0 ? 0 : 1);
    }
    if (s.headshotDeath) {
      T[HX] = 0.7;
      T[NX] = 0.2;
    }
  }

  // ---- apply ---------------------------------------------------------------------------

  private apply(s: ZombieAnimState, dt: number): void {
    const C = this.cur;
    const kick = s.mode === 'death' ? 0 : s.hitKick;
    this.body.rotation.set(C[BX]!, 0, C[BZ]!);
    this.body.position.y = C[BY]!;
    this.pelvis.position.set(0, HIP + C[PY]!, C[PZ]!);
    this.pelvis.rotation.set(C[PX]!, C[PYAW]!, 0);
    this.skirt.rotation.set(C[SKX]! - C[PX]!, -C[PYAW]! * 0.5, C[SKZ]!);
    this.spine.rotation.set(C[SX]!, C[SY]! - C[PYAW]!, C[SZ]!);
    this.chest.rotation.set(C[CX]! + 0.1 * kick, C[CY]!, C[CZ]!);
    this.neck.rotation.set(C[NX]!, C[NY]!, C[NZ]!);
    this.head.rotation.set(C[HX]! + 0.2 * kick, C[HY]!, C[HZ]!, 'YXZ');
    this.shL.rotation.set(C[LSX]!, C[LSY]!, C[LSZ]!);
    this.elL.rotation.set(C[LE]!, 0, 0);
    this.haL.rotation.set(C[LHX]!, 0, C[LHZ]!);
    this.shR.rotation.set(C[RSX]!, C[RSY]!, C[RSZ]!);
    this.elR.rotation.set(C[RE]!, 0, 0);
    this.haR.rotation.set(C[RHX]!, 0, C[RHZ]!);
    this.thL.rotation.set(C[LT]!, 0, -0.02);
    this.knL.rotation.set(C[LK]!, 0, 0);
    this.ftL.rotation.set(C[LF]!, 0, 0);
    this.thR.rotation.set(C[RT]!, 0, 0.02);
    this.knR.rotation.set(C[RK]!, 0, 0);
    this.ftR.rotation.set(C[RF]!, 0, 0);
    // the mouth stretches open (a porcelain face should not do that)
    const m = Math.max(0, C[MOUTH]!);
    this.mouth.scale.set(0.9 + 0.25 * m, 0.14 + 1.9 * m, 1);
    this.mouth.position.y = HEAD_C - 0.068 - 0.022 * m;
    // the fingers: curled into claws or splayed (a cheap squash of the right hand's fingers)
    this.fingersR.scale.set(1 + Math.min(0, C[CURL]!) * -0.5, 1 - Math.max(0, C[CURL]!) * 0.22, 1);
    this.fingersR.rotation.x = Math.max(0, C[CURL]!) * 0.35;
    // eyes burn when she rages or screams
    const burn = s.mode === 'death' ? Math.max(0, 1 - s.deathT * 0.8) : 1 + (s.enraged ? 0.9 : 0) + m * 0.6;
    for (const e of this.eyes) {
      e.scale.setScalar(Math.max(0.01, burn));
      e.visible = burn > 0.02;
    }
    // pendulums: the lantern and the keys hang from where they are held, swinging behind the motion
    const dead = s.mode === 'death';
    const lanternRest = -(C[BX]! + C[PX]! + C[SX]! + C[CX]! + C[LSX]! + C[LE]! + C[LHX]!);
    const keysRest = -(C[BX]! + C[PX]! + C[SX]!);
    if (dt > 0) {
      const drive = Math.cos(this.phase + this.phaseOff) * 2.2 * this.moveW + (s.mode === 'attack' || s.mode === 'slam' ? Math.sin(s.time * 6) * 2 : 0);
      this.lanternVel += (-this.lanternSwing * 38 - this.lanternVel * 3.2 + drive) * dt;
      this.lanternSwing += this.lanternVel * dt;
      this.keysVel += (-this.keysSwing * 70 - this.keysVel * 4 + drive * 1.6) * dt;
      this.keysSwing += this.keysVel * dt;
    }
    this.lantern.rotation.set(dead ? 0 : lanternRest + this.lanternSwing, 0, dead ? 0 : -(C[BZ]! + C[LSZ]! + C[LHZ]!) + this.lanternSwing * 0.3);
    this.keys.rotation.set(dead ? 0.2 : keysRest + this.keysSwing * 0.5, 0, dead ? 0 : -C[BZ]! + this.keysSwing);
    // the lantern burns, flickering; it gutters out when she falls
    this.lampFade = dead ? Math.max(0, this.lampFade - dt * 0.7) : Math.min(1, this.lampFade + dt * 2);
    const flick = 0.82 + 0.18 * Math.sin(s.time * 13.7) * Math.sin(s.time * 7.3 + 1.1);
    const lamp = this.lampFade * flick * (s.enraged ? 1.25 : 1);
    this.glassMat.color.setRGB(0.1 + 1.5 * lamp, 0.06 + 0.7 * lamp, 0.03 + 0.2 * lamp);
    if (this.halo && this.haloMat) {
      this.haloMat.opacity = 0.75 * lamp;
      this.halo.visible = lamp > 0.02;
    }

    // key points (root space) for hit detection
    for (const j of this.joints) j.updateMatrix();
    this.local(this.head, V.set(0, HEAD_C, 0), this.headLocal);
    this.local(this.chest, V.set(0, 0.22, 0), this.chestLocal);
    this.local(this.haR, V.set(0, -0.16, 0), this.handLocal);
  }

  /** `p` in `o`'s space to root space (walks the joint chain with the local matrices). */
  private local(o: THREE.Object3D, p: THREE.Vector3, out: THREE.Vector3): void {
    out.copy(p);
    let n: THREE.Object3D | null = o;
    while (n && n !== this.root) {
      out.applyMatrix4(n.matrix);
      n = n.parent;
    }
  }

  private toWorld(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const r = this.root;
    const yaw = r.rotation.y;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    out.set(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
    out.x += r.position.x;
    out.y += r.position.y;
    out.z += r.position.z;
    return out;
  }

  getHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.toWorld(this.headLocal, out);
  }

  getChestWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.toWorld(this.chestLocal, out);
  }

  getHandWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.toWorld(this.handLocal, out);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.glassMat.dispose();
    this.haloMat?.dispose();
  }
}
