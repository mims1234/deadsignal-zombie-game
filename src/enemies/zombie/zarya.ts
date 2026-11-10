/**
 * ZARYA's shatuny: the closed town's own infected appearance variants (the 'zarya' theme of the rig factory). They are
 * townspeople on New Year's Eve, woken wrong out of the quiet snow: winter coats, fur hats with the flaps down,
 * headscarves, felt boots, rime on their shoulders, and no breath. Pale, frost-bitten skin, eyes like ice; very little
 * blood.
 *
 * The plain ones are the crowd. Each of the town's special kinds (`../variants.ts` ZARYA_KINDS) has a body of its own
 * here, built to be told apart at fifteen metres by its outline or its colours: the carol-singers' horned and eared
 * masks and bright rags, the guard's peaked cap, the cashier's white cap and apron, the loader's crate, the yard-keeper's
 * steel bar, the fisherman's hood and ice auger, the winter swimmer's bare bulk, the house spirit's small dark shape.
 *
 * Everything is baked into the one skinned mesh a rig already draws (same skeleton as the standard variants), so a
 * special kind costs exactly what a plain one does: one draw call, the shared material, no texture of its own.
 *
 * Nothing here runs unless a rig is created with the 'zarya' theme.
 */
import * as THREE from 'three';
import type { ZombieType } from '../../types';
import type { ZaryaKind } from '../variants';
import { type Ctx, type HairStyle, V, addArmsSkin, addFeet, addHands, addHead, addLegsSkin, addNeck, addTorsoSkin, hex, headCenter } from './body';
import { B, type Dims, NOMINAL_HEIGHT, makeDims, restPositions } from './dims';
import { skirtShell, sleeve, torsoShell, trouserLeg } from './garments';
import { Accum, type Splat, type Style, type Weather, box, cone, cyl, ell, taper } from './mesh';
import { mulberry32 } from './prng';

export const ZARYA_VARIANT_COUNT: Record<ZombieType, number> = { shambler: 8, runner: 4, armored: 3, warden: 1 };
/** How many looks each kind has. The loader's two are the same man with his crate (0) and without it (1). */
export const ZARYA_KIND_COUNT: Record<ZaryaKind, number> = { ryazhenye: 4, svistok: 2, kassirsha: 2, gruzchik: 2, dvornik: 2, rybak: 2, morzh: 2, domovoi: 2 };

/** The skeleton each kind is built on: its type's, with the cashier a woman's figure, the swimmer wider, the spirit big-headed. */
export function zaryaDims(type: ZombieType, kind: ZaryaKind | '' = ''): Dims {
  const D = makeDims(type, NOMINAL_HEIGHT[type]);
  if (kind === 'kassirsha') {
    D.fem = true;
    D.torsoW = 1.04;
    D.torsoD = 1.06;
    D.armT = 0.9;
    D.shX *= 0.9;
    D.armAngle += 0.04; // clear of the skirt
  } else if (kind === 'morzh') {
    D.torsoW = 1.42;
    D.torsoD = 1.62;
    D.armT = 1.3;
    D.legT = 1.28;
  } else if (kind === 'domovoi') {
    D.headS *= 1.22;
    D.armT = 0.9;
  }
  return D;
}

type Hat = 'ushanka' | 'ushankaDown' | 'knit' | 'platok' | 'fur' | 'none';

interface Look {
  /** The coat and how far down it comes (in k; 0.86 and up is a jacket to the hips). */
  coat: number;
  hem: number;
  /** Fur at the collar, the cuffs and the hem. */
  trim?: number;
  /** Quilted (a vatnik): stitched rows across it. */
  quilt?: boolean;
  /** A stripe down the sleeves and across the chest (a tracksuit top, a ski sweater). */
  stripe?: number;
  legs: number;
  /** Felt boots (tall), or leather ones. */
  boots: number;
  felt?: boolean;
  hat: Hat;
  hatColor: number;
  scarf?: number;
  mitts?: number;
  skin: number;
  hair: HairStyle;
  hairColor: number;
}

// frost-bitten skins: grey, blue-white, waxy
const PALE = [0x9aa3aa, 0xa8a8a4, 0x8e9aa6, 0xb0aaa2, 0x94a09c];

const SHAMBLERS: Look[] = [
  { coat: 0x3a3c42, hem: 0.5, legs: 0x2a2c30, boots: 0x1e1c1a, hat: 'ushanka', hatColor: 0x5a4632, scarf: 0x6a6e74, mitts: 0x2a2622, skin: PALE[0]!, hair: 'short', hairColor: 0x2a241f },
  { coat: 0x6a2430, hem: 0.44, trim: 0x8a7a66, legs: 0x4a4038, boots: 0x9a968c, felt: true, hat: 'platok', hatColor: 0xb8322e, mitts: 0x7a2a2a, skin: PALE[1]!, hair: 'none', hairColor: 0x4b433a },
  { coat: 0x4a5866, hem: 0.86, quilt: true, legs: 0x33363a, boots: 0x8a867c, felt: true, hat: 'ushankaDown', hatColor: 0x3a3632, mitts: 0x8a7a5a, skin: PALE[2]!, hair: 'short', hairColor: 0x3a2c22 },
  { coat: 0x8a6846, hem: 0.52, trim: 0xd8ccb0, legs: 0x3a3632, boots: 0x2a221c, hat: 'fur', hatColor: 0x6a5238, scarf: 0x9a3a2e, skin: PALE[3]!, hair: 'short', hairColor: 0x55504a },
  { coat: 0x2c3e66, hem: 0.84, legs: 0x3c4658, boots: 0x2a2a2e, hat: 'knit', hatColor: 0xb83a2e, scarf: 0xd8d0b8, mitts: 0xb83a2e, skin: PALE[4]!, hair: 'patchy', hairColor: 0x1f1b18 },
  { coat: 0x3e5a46, hem: 0.46, trim: 0x4a3e34, legs: 0x4a4038, boots: 0xa8a49a, felt: true, hat: 'platok', hatColor: 0xd8d4c8, mitts: 0x5a5650, skin: PALE[1]!, hair: 'none', hairColor: 0x77756d },
  { coat: 0x1e1e22, hem: 0.48, legs: 0x26262a, boots: 0x18181a, hat: 'fur', hatColor: 0x2a2624, scarf: 0x7a7468, mitts: 0x18181a, skin: PALE[0]!, hair: 'short', hairColor: 0x77756d },
  { coat: 0x6a6a62, hem: 0.54, legs: 0x3a3a3e, boots: 0x8e8a80, felt: true, hat: 'knit', hatColor: 0x34507a, scarf: 0x34507a, skin: PALE[3]!, hair: 'patchy', hairColor: 0x3a2c22 },
];

const RUNNERS: Look[] = [
  { coat: 0x2a4a8a, hem: 0.88, stripe: 0xe8e4d8, legs: 0x23305a, boots: 0x8a8a84, hat: 'knit', hatColor: 0xe8e4d8, skin: PALE[2]!, hair: 'strands', hairColor: 0x1c1816 },
  { coat: 0xa8322a, hem: 0.88, stripe: 0xe8e4d8, legs: 0x2a2c30, boots: 0x2a2622, hat: 'knit', hatColor: 0xa8322a, scarf: 0xe8e4d8, skin: PALE[0]!, hair: 'patchy', hairColor: 0x3d322a },
  { coat: 0x4a4e44, hem: 0.86, quilt: true, legs: 0x33363a, boots: 0x2a2622, hat: 'none', hatColor: 0, scarf: 0x5a5e66, skin: PALE[4]!, hair: 'strands', hairColor: 0x4a423a },
  { coat: 0x5a3a5a, hem: 0.62, legs: 0x3a3440, boots: 0x9a968c, felt: true, hat: 'platok', hatColor: 0xc8b23a, skin: PALE[1]!, hair: 'long', hairColor: 0x2a241f },
];

const HEAVIES: Look[] = [
  { coat: 0x9a7a52, hem: 0.4, trim: 0xd8ccb0, legs: 0x33302c, boots: 0x8a867c, felt: true, hat: 'ushankaDown', hatColor: 0x6a5238, mitts: 0x8a7a5a, skin: PALE[3]!, hair: 'none', hairColor: 0x2a2420 },
  { coat: 0x26282c, hem: 0.86, quilt: true, legs: 0x26282c, boots: 0x1c1a18, hat: 'ushanka', hatColor: 0x2a2826, mitts: 0x5a5046, skin: PALE[0]!, hair: 'none', hairColor: 0x2a2420 },
  { coat: 0x4e5866, hem: 0.44, legs: 0x3a4250, boots: 0x1c1a18, hat: 'ushanka', hatColor: 0x4e5866, scarf: 0x3a3e46, mitts: 0x2a2622, skin: PALE[2]!, hair: 'none', hairColor: 0x2a2420 },
];

function skinSet(base: number): { skin: THREE.Color; dark: THREE.Color; light: THREE.Color } {
  const skin = hex(base);
  const hsl = { h: 0, s: 0, l: 0 };
  skin.getHSL(hsl);
  const dark = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9 + 0.05), hsl.l * 0.52);
  const light = new THREE.Color().setHSL(hsl.h, hsl.s * 0.85, Math.min(0.88, hsl.l * 1.12));
  return { skin, dark, light };
}

/** Rime rather than blood: white on the shoulders and the hat, a dark stain at the mouth and the hands. */
function frost(ctx: Ctx, seed: number, gore = 0.5): Weather {
  const { D, rand } = ctx;
  const k = D.k;
  const hc = headCenter(D);
  const rime = new THREE.Color(0.8, 0.86, 0.95);
  const old = new THREE.Color(0.12, 0.03, 0.03);
  const splats: Splat[] = [];
  for (const s of [-1, 1]) splats.push({ c: V(s * D.shX * 0.9, D.shY + 0.06 * k, 0), r: 0.1 * k, a: 0.3 + rand() * 0.15, color: rime });
  splats.push({ c: V(0, hc.y + 0.13 * k, 0), r: 0.11 * k, a: 0.55, color: rime });
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) splats.push({ c: V((rand() - 0.5) * 0.5 * k, (0.5 + rand() * 1.0) * k, (rand() - 0.5) * 0.24 * k), r: (0.06 + rand() * 0.08) * k, a: 0.3 + rand() * 0.3, color: rime });
  if (gore > 0) {
    splats.push({ c: V(0, hc.y - 0.07 * k, hc.z - 0.07 * k), r: 0.06 * k, a: 0.8 * gore, color: old });
    for (const s of [-1, 1]) {
      const w = ctx.rest[s < 0 ? B.haL : B.haR]!;
      splats.push({ c: V(w.x, w.y - 0.05 * k, w.z), r: 0.09 * k, a: 0.6 * gore, color: old });
    }
  }
  return { seed, dirt: 0.25, tone: 1.3, splats };
}

// ---------------------------------------------------------------------------------------------------------
// winter clothes
// ---------------------------------------------------------------------------------------------------------

const shade = (c: THREE.Color, m: number): THREE.Color => c.clone().multiplyScalar(m);

/** A coat from the neck to `hem` (a jacket above the hips, else skirted), sleeves, a collar. */
function coat(ctx: Ctx, color: number, hem: number, seed: number, o: { trim?: number; quilt?: boolean; stripe?: number; flare?: number; spec?: number } = {}): void {
  const { acc, D } = ctx;
  const k = D.k;
  const c = hex(color);
  const zf = -0.118 * k * D.torsoD * ctx.girth;
  if (hem < 0.84) skirtShell(ctx, 1.47, hem, c, o.flare ?? 0.032, 0.012 * k, seed, 1);
  else torsoShell(ctx, hem, 1.47, c, 0.024 * k, 0.012 * k, seed, { spec: o.spec ?? 0 });
  for (const s of [-1, 1] as const) sleeve(ctx, s, 0.93, c, 0.02 * k, 0.008 * k, seed + 3 * s);
  // the collar: fur, or the coat's own cloth turned up
  const col = o.trim !== undefined ? hex(o.trim) : shade(c, 0.82);
  const cr = Math.sqrt(D.torsoW);
  cyl(acc, 0, 1.488 * k, 0.004 * k, (o.trim !== undefined ? 0.084 : 0.074) * k * cr, 0.094 * k * cr, (o.trim !== undefined ? 0.06 : 0.045) * k, { color: col, bone: B.chest }, null, 10);
  // closed down the front
  box(acc, 0.012 * k, Math.max(hem, 0.7) * 0.5 * k + 0.72 * k, zf - 0.012 * k, 0.014 * k, (1.42 - Math.max(hem, 0.7)) * k, 0.008 * k, { color: shade(c, 0.6), bone: B.chest });
  if (o.trim !== undefined) {
    const t = hex(o.trim);
    for (const s of [-1, 1] as const) {
      const w = ctx.rest[s < 0 ? B.haL : B.haR]!;
      ell(acc, w.x, w.y + 0.03 * k, w.z, 0.052 * k * D.armT, 0.03 * k, 0.052 * k * D.armT, { color: t, bone: s < 0 ? B.elL : B.elR }, null, 8, 5);
    }
  }
  if (o.quilt) {
    const q = shade(c, 0.7);
    for (let i = 0; i < 4; i++) torsoShell(ctx, 0.98 + i * 0.12, 0.992 + i * 0.12, q, 0.027 * k, 0, seed + 31 + i);
  }
  if (o.stripe !== undefined) {
    const st = hex(o.stripe);
    torsoShell(ctx, 1.3, 1.34, st, 0.027 * k, 0, seed + 41);
    for (const s of [-1, 1] as const) {
      const a = ctx.rest[s < 0 ? B.shL : B.shR]!;
      const e = ctx.rest[s < 0 ? B.elL : B.elR]!;
      taper(acc, V(a.x + s * 0.062 * k * D.armT, a.y - 0.04 * k, a.z), V(e.x + s * 0.056 * k * D.armT, e.y, e.z), 0.012 * k, 0.012 * k, { color: st, bone: s < 0 ? B.shL : B.shR, clean: true }, 4);
    }
  }
}

/** Trousers (`band`: their waistband too, where no long coat hangs over it), and what is on the feet: tall felt boots, or leather ones. */
function legs(ctx: Ctx, color: number, boots: number, felt: boolean, seed: number, band = true): void {
  const { acc, D } = ctx;
  const k = D.k;
  const c = hex(color);
  for (const s of [-1, 1] as const) trouserLeg(ctx, s, 0.965, c, 0.011 * k, 0.01 * k, seed + s, 0.004);
  if (band) torsoShell(ctx, 0.87, 1.02, c, 0.01 * k, 0, seed);
  const b = hex(boots);
  addFeet(ctx, 'boots', b);
  if (felt) {
    for (const s of [-1, 1] as const) {
      const kn = s < 0 ? B.knL : B.knR;
      taper(acc, V(s * D.hipX, D.kneeY - 0.05 * k, 0.004 * k), V(s * D.hipX, D.ankleY + 0.01 * k, 0.004 * k), 0.076 * k * Math.sqrt(D.legT), 0.066 * k * Math.sqrt(D.legT), { color: b.clone(), bone: kn }, 9);
    }
  }
}

function dome(ctx: Ctx, y: number, rx: number, ry: number, rz: number, st: Style, down = 1.5): void {
  const hs = ctx.D.k * ctx.D.headS;
  const C = headCenter(ctx.D);
  const g = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, down);
  ctx.acc.add(g, new THREE.Matrix4().compose(V(C.x, C.y + y * hs, C.z + 0.004 * hs), new THREE.Quaternion(), V(rx * hs, ry * hs, rz * hs)), st);
  g.dispose();
}

function hat(ctx: Ctx, kind: Hat, color: number): void {
  if (kind === 'none') return;
  const { acc, D } = ctx;
  const hs = D.k * D.headS;
  const C = headCenter(D);
  const c = hex(color);
  const st: Style = { color: c, bone: B.head };
  switch (kind) {
    case 'ushanka':
    case 'ushankaDown': {
      dome(ctx, 0.034, 0.102, 0.104, 0.12, st);
      // the front flap turned up
      box(acc, C.x, C.y + 0.078 * hs, C.z - 0.104 * hs, 0.15 * hs, 0.06 * hs, 0.028 * hs, { ...st, color: shade(c, 1.18) }, [0.12, 0, 0]);
      if (kind === 'ushankaDown') {
        for (const s of [-1, 1]) box(acc, C.x + s * 0.094 * hs, C.y - 0.03 * hs, C.z + 0.014 * hs, 0.03 * hs, 0.17 * hs, 0.12 * hs, { ...st, color: shade(c, 1.1) }, [0, 0, s * 0.08]);
        box(acc, C.x, C.y - 0.01 * hs, C.z + 0.1 * hs, 0.17 * hs, 0.13 * hs, 0.03 * hs, st);
      } else {
        for (const s of [-1, 1]) box(acc, C.x + s * 0.1 * hs, C.y + 0.085 * hs, C.z + 0.01 * hs, 0.026 * hs, 0.075 * hs, 0.13 * hs, { ...st, color: shade(c, 1.1) });
        box(acc, C.x, C.y + 0.142 * hs, C.z + 0.006 * hs, 0.05 * hs, 0.014 * hs, 0.05 * hs, { ...st, color: shade(c, 0.7) });
      }
      break;
    }
    case 'knit': {
      dome(ctx, 0.03, 0.094, 0.118, 0.11, st);
      cyl(acc, C.x, C.y + 0.052 * hs, C.z + 0.004 * hs, 0.1 * hs, 0.1 * hs, 0.04 * hs, { ...st, color: shade(c, 0.82) }, null, 12);
      ell(acc, C.x, C.y + 0.16 * hs, C.z + 0.004 * hs, 0.032 * hs, 0.032 * hs, 0.032 * hs, { ...st, color: shade(c, 1.2) }, null, 7, 5);
      break;
    }
    case 'fur':
      cyl(acc, C.x, C.y + 0.1 * hs, C.z + 0.006 * hs, 0.102 * hs, 0.11 * hs, 0.1 * hs, st, null, 12);
      break;
    case 'platok': {
      // a headscarf: over the head and round the face, knotted under the chin, its corner down the back
      ell(acc, C.x, C.y + 0.012 * hs, C.z + 0.026 * hs, 0.098 * hs, 0.12 * hs, 0.108 * hs, st, null, 12, 8);
      ell(acc, C.x, C.y - 0.118 * hs, C.z - 0.062 * hs, 0.032 * hs, 0.026 * hs, 0.026 * hs, { ...st, color: shade(c, 0.85) }, null, 7, 5);
      box(acc, 0, D.neckY - 0.03 * D.k, 0.1 * D.k * D.torsoD, 0.2 * D.k, 0.16 * D.k, 0.02 * D.k, { color: shade(c, 0.9), bone: B.chest }, [-0.25, 0, 0]);
      break;
    }
    default:
      break;
  }
}

function scarf(ctx: Ctx, color: number): void {
  const { acc, D } = ctx;
  const k = D.k;
  const c = hex(color);
  cyl(acc, 0, D.neckY + 0.02 * k, 0.002 * k, 0.082 * k, 0.09 * k, 0.07 * k, { color: c, bone: B.neck }, null, 10);
  box(acc, 0.055 * k, 1.31 * k, -0.126 * k * D.torsoD * ctx.girth, 0.065 * k, 0.3 * k, 0.016 * k, { color: shade(c, 0.9), bone: B.chest }, [0.05, 0, -0.06]);
}

function dress(ctx: Ctx, look: Look, seed: number): void {
  legs(ctx, look.legs, look.boots, look.felt ?? false, seed, look.hem >= 0.84);
  // (a big man's coat hangs wider: his thighs are)
  coat(ctx, look.coat, look.hem, seed + 7, { trim: look.trim, quilt: look.quilt, stripe: look.stripe, flare: ctx.D.type === 'armored' ? 0.06 : undefined });
  if (look.trim !== undefined && look.hem < 0.84) {
    // fur along the hem
    skirtShell(ctx, look.hem + 0.045, look.hem - 0.004, hex(look.trim), 0.036, 0, seed + 9, 1.12);
  }
  hat(ctx, look.hat, look.hatColor);
  if (look.scarf !== undefined) scarf(ctx, look.scarf);
}

function person(D: Dims, seed: number, skin: number, girth: number, o: { eye?: THREE.Color; eyeGlow?: number } = {}): Ctx {
  const sk = skinSet(skin);
  return {
    acc: new Accum(),
    D,
    rest: restPositions(D),
    rand: mulberry32(seed),
    girth,
    skin: sk.skin,
    skinDark: sk.dark,
    skinLight: sk.light,
    // eyes like ice
    eye: o.eye ?? new THREE.Color(0.62, 0.86, 1.0),
    eyeGlow: o.eyeGlow ?? 1.5,
  };
}

function body(ctx: Ctx, o: { hair: HairStyle; hairColor: number; gaunt?: number; glove?: number; rib?: number; fist?: boolean }): void {
  addTorsoSkin(ctx, undefined, o.rib ?? 0);
  addNeck(ctx);
  addHead(ctx, { hair: o.hair, hairColor: hex(o.hairColor), gaunt: o.gaunt ?? 0.25, teeth: hex(0xa8a08a) });
  addArmsSkin(ctx);
  addLegsSkin(ctx);
  addHands(ctx, o.glove !== undefined ? { glove: hex(o.glove), gloveSpec: 0.05, clawColor: hex(o.glove), fist: o.fist } : { clawColor: hex(0x4a4a52) });
}

// ---------------------------------------------------------------------------------------------------------
// the kinds
// ---------------------------------------------------------------------------------------------------------

const RAGS = [0xe8322a, 0xf2c41a, 0x2aa84a, 0x2a6ae8, 0xe84a9a, 0xf07a1a];

/** Carol-singers: a sheepskin turned inside out, a goat's or a bear's mask, rag-ribbons from the shoulders and the arms. */
function ryazhenye(ctx: Ctx, index: number, seed: number): void {
  const { acc, D, rand } = ctx;
  const k = D.k;
  const hs = k * D.headS;
  const C = headCenter(D);
  const goat = index % 2 === 0;
  body(ctx, { hair: 'none', hairColor: 0x2a241f, gaunt: 0.6, glove: [0xb8322e, 0x2a6ae8, 0x2aa84a, 0xf2c41a][index % 4]! });
  legs(ctx, [0x3a2e2a, 0x2a2c34][index % 2]!, 0x9a968c, true, seed, false);
  // the fleece outside: shaggy and pale, which nobody else in the town is
  coat(ctx, goat ? 0xd8ceb0 : 0xc8b490, 0.56, seed + 5, { trim: goat ? 0xb8ae92 : 0x8a6a48, flare: 0.045 });
  const zf = -0.118 * k * D.torsoD * ctx.girth;
  // rag-ribbons: bright, and they stay bright (no grime, a little light of their own so they read at night)
  const rag = (x: number, y: number, z: number, len: number, bone: number, i: number, rot: [number, number, number]): void => box(acc, x, y - len * 0.5, z, 0.034 * k, len, 0.008 * k, { color: hex(RAGS[(index + i) % RAGS.length]!), bone, clean: true, glow: 0.22 }, rot);
  for (const s of [-1, 1]) {
    const sh = s < 0 ? B.shL : B.shR;
    const el = s < 0 ? B.elL : B.elR;
    const a = ctx.rest[sh]!;
    const e = ctx.rest[el]!;
    const w = ctx.rest[s < 0 ? B.haL : B.haR]!;
    for (let i = 0; i < 3; i++) rag(a.x + s * (0.03 + i * 0.022) * k, a.y + 0.03 * k, a.z + (i - 1) * 0.05 * k, (0.2 + rand() * 0.14) * k, sh, i + (s > 0 ? 3 : 0), [0, 0, s * 0.12]);
    for (let i = 0; i < 2; i++) rag(e.x + s * 0.05 * k, e.y + 0.02 * k, e.z + (i - 0.5) * 0.06 * k, (0.16 + rand() * 0.1) * k, el, i + 1 + (s > 0 ? 2 : 0), [0, 0, s * 0.1]);
    rag(w.x + s * 0.03 * k, w.y + 0.06 * k, w.z, (0.14 + rand() * 0.08) * k, el, s > 0 ? 5 : 0, [0, 0, s * 0.1]);
  }
  for (let i = 0; i < 6; i++) {
    const x = (-0.15 + i * 0.06) * k * D.torsoW;
    rag(x, 1.44 * k, zf - 0.016 * k, (0.2 + rand() * 0.2) * k, B.chest, i, [0.04, 0, (rand() - 0.5) * 0.2]);
    rag(x, 1.43 * k, -zf + 0.016 * k, (0.24 + rand() * 0.2) * k, B.chest, i + 2, [-0.04, 0, (rand() - 0.5) * 0.2]);
  }
  // a rope belt
  torsoShell(ctx, 0.99, 1.02, hex(0x6a5a3a), 0.03 * k, 0, seed + 3);
  if (goat) {
    // the goat: a long pale face, a beard, two tall horns swept back, ears out to the sides
    const face: Style = { color: hex(0xe6dcc0), bone: B.head, clean: true };
    ell(acc, C.x, C.y - 0.012 * hs, C.z - 0.07 * hs, 0.074 * hs, 0.11 * hs, 0.062 * hs, face, [0.12, 0, 0], 10, 7);
    ell(acc, C.x, C.y - 0.07 * hs, C.z - 0.126 * hs, 0.042 * hs, 0.05 * hs, 0.044 * hs, { ...face, color: hex(0xd0c4a4) }, [0.3, 0, 0], 8, 6);
    cone(acc, C.x, C.y - 0.18 * hs, C.z - 0.1 * hs, 0.03 * hs, 0.13 * hs, { color: hex(0xb8ae92), bone: B.head, clean: true }, [Math.PI + 0.25, 0, 0], 5);
    for (const s of [-1, 1]) {
      cone(acc, C.x + s * 0.052 * hs, C.y + 0.21 * hs, C.z + 0.05 * hs, 0.026 * hs, 0.3 * hs, { color: hex(0x4a3a2a), bone: B.head, clean: true }, [-0.5, 0, -s * 0.28], 6);
      box(acc, C.x + s * 0.118 * hs, C.y + 0.05 * hs, C.z - 0.01 * hs, 0.09 * hs, 0.03 * hs, 0.045 * hs, { ...face, color: hex(0xc8bc9c) }, [0, 0, s * 0.35]);
      ell(acc, C.x + s * 0.034 * hs, C.y + 0.02 * hs, C.z - 0.128 * hs, 0.014 * hs, 0.012 * hs, 0.008 * hs, { color: hex(0x08080a), bone: B.head, clean: true }, null, 6, 4);
    }
    ell(acc, C.x, C.y - 0.085 * hs, C.z - 0.168 * hs, 0.016 * hs, 0.01 * hs, 0.008 * hs, { color: hex(0x1a1410), bone: B.head, clean: true }, null, 6, 4);
  } else {
    // the bear: a round brown face, round ears standing well clear of the head, a pale muzzle
    const fur: Style = { color: hex(0x6a4428), bone: B.head, clean: true };
    ell(acc, C.x, C.y + 0.004 * hs, C.z - 0.03 * hs, 0.112 * hs, 0.118 * hs, 0.1 * hs, fur, null, 12, 8);
    for (const s of [-1, 1]) {
      ell(acc, C.x + s * 0.092 * hs, C.y + 0.128 * hs, C.z - 0.01 * hs, 0.05 * hs, 0.05 * hs, 0.024 * hs, fur, null, 9, 6);
      ell(acc, C.x + s * 0.092 * hs, C.y + 0.128 * hs, C.z - 0.03 * hs, 0.028 * hs, 0.028 * hs, 0.012 * hs, { ...fur, color: hex(0xc8a070) }, null, 7, 5);
      ell(acc, C.x + s * 0.04 * hs, C.y + 0.03 * hs, C.z - 0.124 * hs, 0.015 * hs, 0.015 * hs, 0.008 * hs, { color: hex(0x08080a), bone: B.head, clean: true }, null, 6, 4);
    }
    ell(acc, C.x, C.y - 0.035 * hs, C.z - 0.118 * hs, 0.05 * hs, 0.04 * hs, 0.044 * hs, { ...fur, color: hex(0xd8b888) }, null, 9, 6);
    ell(acc, C.x, C.y - 0.022 * hs, C.z - 0.162 * hs, 0.018 * hs, 0.013 * hs, 0.01 * hs, { color: hex(0x0c0a0a), bone: B.head, clean: true }, null, 6, 4);
  }
}

/** The guard: a dark uniform coat with a belt and brass buttons, red tabs, a peaked cap with a red band. */
function svistok(ctx: Ctx, index: number, seed: number): void {
  const { acc, D } = ctx;
  const k = D.k;
  const hs = k * D.headS;
  const C = headCenter(D);
  const cloth = [0x1a2030, 0x22262a][index % 2]!;
  const brass: Style = { color: hex(0xd8b040), bone: B.chest, spec: 0.7, clean: true, glow: 0.12 };
  // white gloves, a white belt and cross-strap: on a dark coat they are what is seen first from across a hall
  body(ctx, { hair: 'short', hairColor: 0x2a2420, gaunt: 0.2, glove: 0xe8e6de });
  legs(ctx, cloth, 0x121214, false, seed, false);
  // a red stripe down each trouser leg
  for (const s of [-1, 1]) box(acc, s * (D.hipX + 0.07 * k * D.legT), 0.52 * k, 0, 0.012 * k, 0.76 * k, 0.03 * k, { color: hex(0xb82a22), bone: s < 0 ? B.hipL : B.hipR, clean: true });
  coat(ctx, cloth, 0.7, seed + 5, { flare: 0.012, spec: 0.1 });
  const zf = -0.118 * k * D.torsoD * ctx.girth - 0.022 * k;
  const white: Style = { color: hex(0xeceae2), bone: B.chest, clean: true };
  torsoShell(ctx, 0.985, 1.05, hex(0xeceae2), 0.032 * k, 0, seed + 8);
  box(acc, 0, 1.015 * k, zf - 0.014 * k, 0.07 * k, 0.06 * k, 0.014 * k, brass);
  // the cross-strap: from his right hip up over his left shoulder and down his back
  taper(acc, V(0.17 * k * D.torsoW, 1.04 * k, zf + 0.004 * k), V(-0.13 * k * D.torsoW, 1.47 * k, zf + 0.05 * k), 0.022 * k, 0.022 * k, white, 4);
  taper(acc, V(-0.13 * k * D.torsoW, 1.47 * k, -zf - 0.05 * k), V(0.17 * k * D.torsoW, 1.04 * k, -zf - 0.004 * k), 0.022 * k, 0.022 * k, white, 4);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) ell(acc, s * 0.05 * k, (1.1 + i * 0.085) * k, zf - 0.004 * k, 0.014 * k, 0.014 * k, 0.008 * k, brass, null, 6, 4);
  // red shoulder boards and collar tabs
  for (const s of [-1, 1]) {
    const a = ctx.rest[s < 0 ? B.shL : B.shR]!;
    box(acc, a.x - s * 0.03 * k, a.y + 0.062 * k, a.z, 0.12 * k, 0.014 * k, 0.07 * k, { color: hex(0xb82a22), bone: B.chest, clean: true }, [0, 0, -s * 0.12]);
    box(acc, s * 0.05 * k, 1.47 * k, zf + 0.03 * k, 0.045 * k, 0.03 * k, 0.012 * k, { color: hex(0xb82a22), bone: B.chest, clean: true }, [0.2, 0, s * 0.3]);
  }
  // the whistle on its cord
  taper(acc, V(-0.06 * k, 1.44 * k, zf + 0.02 * k), V(0.07 * k, 1.3 * k, zf - 0.006 * k), 0.004 * k, 0.004 * k, { color: hex(0xd8d4c8), bone: B.chest, clean: true }, 4);
  ell(acc, 0.075 * k, 1.29 * k, zf - 0.012 * k, 0.022 * k, 0.014 * k, 0.012 * k, { color: hex(0xe8e8ee), bone: B.chest, spec: 0.8, clean: true, glow: 0.15 }, null, 6, 4);
  // the cap: a band, a wide flat crown tipped back, a black peak, a badge
  const cap: Style = { color: hex(cloth), bone: B.head };
  dome(ctx, 0.03, 0.098, 0.1, 0.112, cap, 1.35);
  cyl(acc, C.x, C.y + 0.088 * hs, C.z + 0.004 * hs, 0.1 * hs, 0.1 * hs, 0.036 * hs, { color: hex(0xb82a22), bone: B.head, clean: true }, null, 12);
  cyl(acc, C.x, C.y + 0.134 * hs, C.z + 0.012 * hs, 0.156 * hs, 0.104 * hs, 0.06 * hs, cap, [-0.14, 0, 0], 14);
  box(acc, C.x, C.y + 0.066 * hs, C.z - 0.13 * hs, 0.15 * hs, 0.012 * hs, 0.085 * hs, { color: hex(0x08080a), bone: B.head, spec: 0.6, clean: true }, [0.3, 0, 0]);
  ell(acc, C.x, C.y + 0.1 * hs, C.z - 0.1 * hs, 0.018 * hs, 0.02 * hs, 0.008 * hs, { ...brass, bone: B.head }, null, 6, 4);
}

/** The cashier: a blue shop dress, a white apron with a bib, a tall white cap, white cuffs. */
function kassirsha(ctx: Ctx, index: number, seed: number): void {
  const { acc, D } = ctx;
  const k = D.k;
  const hs = k * D.headS;
  const C = headCenter(D);
  const white = 0xf2f0ea;
  const cloth = [0x3a5e9a, 0x7a3a56][index % 2]!;
  body(ctx, { hair: 'long', hairColor: [0x8a4a22, 0x2a241f][index % 2]!, gaunt: 0.15 });
  // thick stockings, felt boots
  for (const s of [-1, 1] as const) trouserLeg(ctx, s, 0.965, hex(0x6a5e52), 0.004 * k, 0, seed + s, 0);
  addFeet(ctx, 'boots', hex(0x8e8a80));
  for (const s of [-1, 1]) taper(acc, V(s * D.hipX, D.kneeY - 0.14 * k, 0.004 * k), V(s * D.hipX, D.ankleY + 0.01 * k, 0.004 * k), 0.066 * k, 0.06 * k, { color: hex(0x8e8a80), bone: s < 0 ? B.knL : B.knR }, 9);
  skirtShell(ctx, 1.47, 0.5, hex(cloth), 0.06, 0.008 * k, seed + 5, 1.1);
  for (const s of [-1, 1] as const) {
    sleeve(ctx, s, 0.9, hex(cloth), 0.016 * k, 0.006 * k, seed + 7 * s);
    const w = ctx.rest[s < 0 ? B.haL : B.haR]!;
    ell(acc, w.x, w.y + 0.035 * k, w.z, 0.046 * k * D.armT, 0.026 * k, 0.046 * k * D.armT, { color: hex(white), bone: s < 0 ? B.elL : B.elR, clean: true }, null, 8, 5);
  }
  const wS: Style = { color: hex(white), bone: B.chest, clean: true };
  const zf = -0.118 * k * D.torsoD * ctx.girth - 0.018 * k;
  // the apron: a bib over the chest, a skirt of it over the dress, the straps, the bow behind
  box(acc, 0, 1.25 * k, zf - 0.004 * k, 0.2 * k * D.torsoW, 0.26 * k, 0.012 * k, wS, [0.03, 0, 0]);
  for (const s of [-1, 1]) taper(acc, V(s * 0.08 * k, 1.36 * k, zf), V(s * 0.1 * k, 1.485 * k, -0.01 * k), 0.016 * k, 0.016 * k, wS, 4);
  torsoShell(ctx, 1.07, 1.115, hex(white), 0.026 * k, 0, seed + 11);
  box(acc, 0, 0.82 * k, zf - 0.04 * k, 0.3 * k * D.torsoW, 0.52 * k, 0.012 * k, { ...wS, bone: B.pelvis }, [-0.06, 0, 0]);
  ell(acc, 0, 1.09 * k, -zf + 0.012 * k, 0.07 * k, 0.035 * k, 0.02 * k, { ...wS, bone: B.spine }, null, 7, 5);
  cyl(acc, 0, 1.488 * k, 0.004 * k, 0.078 * k, 0.092 * k, 0.04 * k, wS, null, 10);
  // the cap: tall, stiff, white
  const cap: Style = { color: hex(white), bone: B.head, clean: true };
  cyl(acc, C.x, C.y + 0.135 * hs, C.z + 0.008 * hs, 0.108 * hs, 0.096 * hs, 0.15 * hs, cap, [-0.06, 0, 0], 12);
  cyl(acc, C.x, C.y + 0.072 * hs, C.z + 0.006 * hs, 0.1 * hs, 0.1 * hs, 0.03 * hs, { ...cap, color: hex(0xd8d6ce) }, null, 12);
}

/** The loader: a quilted jacket, canvas mitts, a cloth cap; and (look 0) the crate he carries in front of him. */
function gruzchik(ctx: Ctx, crate: boolean, seed: number): void {
  const { acc, D } = ctx;
  const k = D.k;
  const hs = k * D.headS;
  const C = headCenter(D);
  body(ctx, { hair: 'none', hairColor: 0x2a2420, gaunt: 0.3, glove: 0xa8946a, fist: true });
  legs(ctx, 0x30343a, 0x1a1816, false, seed);
  coat(ctx, 0x586878, 0.86, seed + 5, { quilt: true });
  // a canvas apron over the jacket, to the knees
  const zf = -0.118 * k * D.torsoD * ctx.girth - 0.026 * k;
  box(acc, 0, 0.84 * k, zf - 0.02 * k, 0.3 * k * D.torsoW, 0.5 * k, 0.012 * k, { color: hex(0x7a7058), bone: B.pelvis }, [-0.05, 0, 0]);
  // a flat cloth cap, the peak pulled down
  const cap: Style = { color: hex(0x3a3630), bone: B.head };
  dome(ctx, 0.04, 0.108, 0.07, 0.124, cap, 1.5);
  box(acc, C.x, C.y + 0.05 * hs, C.z - 0.118 * hs, 0.12 * hs, 0.012 * hs, 0.06 * hs, { ...cap, color: hex(0x2a2622) }, [0.35, 0, 0]);
  if (!crate) return;
  // the crate: pale new wood, wider than he is, from his belt to his chin
  const wood = 0xc8a060;
  const w = 0.74 * k;
  const h = 0.56 * k;
  const d = 0.46 * k;
  const y = 1.17 * k;
  const z = -(0.118 * k * D.torsoD + 0.06 * k + d * 0.5);
  const st: Style = { color: hex(wood), bone: B.chest, clean: true };
  box(acc, 0, y, z, w, h, d, st);
  // slats, corner posts, a stencil
  const dark: Style = { color: hex(0x7a5a30), bone: B.chest, clean: true };
  for (let i = 0; i < 3; i++) box(acc, 0, y + (i - 1) * h * 0.34, z - d * 0.5 - 0.006 * k, w + 0.012 * k, 0.03 * k, 0.012 * k, dark);
  for (const s of [-1, 1]) {
    box(acc, s * (w * 0.5 - 0.02 * k), y, z - d * 0.5 - 0.008 * k, 0.045 * k, h + 0.012 * k, 0.016 * k, dark);
    for (let i = 0; i < 3; i++) box(acc, s * (w * 0.5 + 0.006 * k), y + (i - 1) * h * 0.34, z, 0.012 * k, 0.03 * k, d + 0.012 * k, dark);
  }
  box(acc, 0, y + h * 0.5 + 0.006 * k, z, w + 0.012 * k, 0.014 * k, d + 0.012 * k, dark);
  box(acc, 0.06 * k, y + 0.02 * k, z - d * 0.5 - 0.012 * k, 0.2 * k, 0.11 * k, 0.006 * k, { color: hex(0x8a1a16), bone: B.chest, clean: true }, [0, 0, 0.08]);
}

/** The yard-keeper: a long padded coat, a canvas apron, an ushanka with the flaps down, and the steel bar. */
function dvornik(ctx: Ctx, index: number, seed: number): void {
  const { acc, D } = ctx;
  const k = D.k;
  body(ctx, { hair: 'none', hairColor: 0x2a2420, gaunt: 0.3, glove: 0x5a5046, fist: true });
  legs(ctx, 0x2a2c30, 0x8a867c, true, seed, false);
  coat(ctx, [0x34383a, 0x3e3830][index % 2]!, 0.4, seed + 5, { quilt: true, flare: 0.05 });
  // an orange-brown canvas apron, chest to shin: his colour
  const zf = -0.118 * k * D.torsoD * ctx.girth - 0.03 * k;
  const ap: Style = { color: hex(0xb8742a), bone: B.chest };
  box(acc, 0, 1.24 * k, zf - 0.002 * k, 0.24 * k * D.torsoW, 0.3 * k, 0.012 * k, ap, [0.03, 0, 0]);
  box(acc, 0, 0.76 * k, zf - 0.05 * k, 0.34 * k * D.torsoW, 0.66 * k, 0.012 * k, { ...ap, bone: B.pelvis }, [-0.07, 0, 0]);
  torsoShell(ctx, 1.06, 1.1, hex(0x8a5420), 0.03 * k, 0, seed + 9);
  hat(ctx, 'ushankaDown', [0x4a4038, 0x6a5238][index % 2]!);
  scarf(ctx, 0x5a5e56);
  // the lom: a steel bar gripped in the right fist, a third of it behind the hand, its chisel end forward (up, as he
  // carries it: the forearm is bent)
  const hnd = ctx.rest[B.haR]!;
  const gy = hnd.y - 0.085 * k;
  const steel: Style = { color: hex(0x9aa2aa), bone: B.haR, spec: 0.85, clean: true };
  taper(acc, V(hnd.x, gy, hnd.z + 0.62 * k), V(hnd.x, gy, hnd.z - 1.12 * k), 0.02 * k, 0.02 * k, steel, 6);
  taper(acc, V(hnd.x, gy, hnd.z - 1.12 * k), V(hnd.x, gy, hnd.z - 1.34 * k), 0.03 * k, 0.006 * k, { ...steel, color: hex(0xc8d0d8) }, 4);
  ell(acc, hnd.x, gy, hnd.z + 0.63 * k, 0.03 * k, 0.03 * k, 0.03 * k, steel, null, 6, 4);
}

/** The ice fisherman: a hooded canvas cape to the shins, his box on its strap, the ice auger over his shoulder. */
function rybak(ctx: Ctx, index: number, seed: number): void {
  const { acc, D } = ctx;
  const k = D.k;
  const hs = k * D.headS;
  const C = headCenter(D);
  const canvas = [0x7a7a48, 0x6a7258][index % 2]!;
  body(ctx, { hair: 'none', hairColor: 0x55504a, gaunt: 0.4, glove: 0x4a4a3a });
  legs(ctx, 0x3a3e34, 0x8e8a80, true, seed, false);
  coat(ctx, canvas, 0.36, seed + 5, { flare: 0.075 });
  // the hood, up: deep, coming forward over the brow
  const hood: Style = { color: hex(canvas), bone: B.head };
  ell(acc, C.x, C.y + 0.02 * hs, C.z + 0.034 * hs, 0.116 * hs, 0.14 * hs, 0.128 * hs, hood, null, 12, 8);
  box(acc, C.x, C.y + 0.1 * hs, C.z - 0.07 * hs, 0.17 * hs, 0.03 * hs, 0.09 * hs, hood, [0.35, 0, 0]);
  ell(acc, 0, D.neckY - 0.01 * k, 0.03 * k, 0.17 * k, 0.07 * k, 0.13 * k, { color: shade(hex(canvas), 0.92), bone: B.chest }, null, 10, 6);
  // the box: plywood and aluminium corners, on a strap across the chest, at his left hip
  const zf = -0.118 * k * D.torsoD * ctx.girth - 0.03 * k;
  const bx = -(0.2 * D.torsoW + 0.1) * k;
  box(acc, bx, 0.9 * k, 0.02 * k, 0.2 * k, 0.24 * k, 0.34 * k, { color: hex(0xb89a5a), bone: B.pelvis, clean: true });
  box(acc, bx, 1.03 * k, 0.02 * k, 0.21 * k, 0.02 * k, 0.35 * k, { color: hex(0xc8ccd0), bone: B.pelvis, spec: 0.7, clean: true });
  taper(acc, V(bx + 0.05 * k, 1.02 * k, zf + 0.02 * k), V(0.16 * k, 1.47 * k, -0.02 * k), 0.016 * k, 0.016 * k, { color: hex(0x2a2a24), bone: B.chest }, 4);
  // the auger: a steel shaft over the right shoulder, its screw above his head, the crank at the top
  const steel: Style = { color: hex(0xb8c0c8), bone: B.chest, spec: 0.8, clean: true };
  const a0 = V(0.2 * k, 0.86 * k, 0.2 * k * D.torsoD);
  const a1 = V(0.26 * k, 2.12 * k, 0.3 * k * D.torsoD);
  taper(acc, a0, a1, 0.014 * k, 0.014 * k, steel, 5);
  for (let i = 0; i < 4; i++) {
    const p = a0.clone().lerp(a1, 0.62 + i * 0.085);
    ell(acc, p.x, p.y, p.z, 0.075 * k, 0.012 * k, 0.075 * k, { ...steel, color: hex(i % 2 ? 0x2a6ac8 : 0xb8c0c8) }, [0.3, i * 1.1, 0.25], 8, 4);
  }
  box(acc, a0.x + 0.05 * k, a0.y + 0.02 * k, a0.z, 0.12 * k, 0.02 * k, 0.02 * k, steel);
  // the short winter rod in his right hand, a red tip
  const hnd = ctx.rest[B.haR]!;
  taper(acc, V(hnd.x, hnd.y - 0.08 * k, hnd.z + 0.08 * k), V(hnd.x, hnd.y - 0.08 * k, hnd.z - 0.62 * k), 0.012 * k, 0.005 * k, { color: hex(0x2a2a2a), bone: B.haR, clean: true }, 4);
  ell(acc, hnd.x, hnd.y - 0.08 * k, hnd.z - 0.63 * k, 0.014 * k, 0.014 * k, 0.014 * k, { color: hex(0xff3a2a), bone: B.haR, clean: true, glow: 0.6 }, null, 5, 4);
}

/** The winter swimmer: nothing on him but trunks and a rubber cap. Flushed pink where everyone else is grey. */
function morzh(ctx: Ctx, index: number, seed: number): void {
  const { acc, D } = ctx;
  const k = D.k;
  // bare, and built with a belly (the rib argument stays 0: there is nothing gaunt about him)
  body(ctx, { hair: 'none', hairColor: 0x2a2420, gaunt: 0 });
  addFeet(ctx, 'barefoot', ctx.skin);
  const trunks = hex([0x1a3a9a, 0xa82a22][index % 2]!);
  for (const s of [-1, 1] as const) trouserLeg(ctx, s, 0.2, trunks, 0.008 * k, 0, seed + s, 0);
  torsoShell(ctx, 0.87, 1.0, trunks, 0.012 * k, 0, seed, { spec: 0.2 });
  torsoShell(ctx, 0.985, 1.005, hex(0xe8e4d8), 0.016 * k, 0, seed + 3);
  // the belly, out over the trunks
  ell(acc, 0, 1.1 * k, -0.07 * k * D.torsoD, 0.19 * k * D.torsoW, 0.17 * k, 0.15 * k * D.torsoD, { color: ctx.skin.clone(), bone: B.spine, spec: 0.12 }, null, 12, 8);
  // a moustache: he is somebody's uncle
  const hs = k * D.headS;
  const C = headCenter(D);
  ell(acc, C.x, C.y - 0.045 * hs, C.z - 0.096 * hs, 0.045 * hs, 0.014 * hs, 0.014 * hs, { color: hex(0x6a5a4a), bone: B.head }, null, 7, 4);
  // the rubber cap: bright, tight, shiny
  dome(ctx, 0.012, 0.086, 0.114, 0.106, { color: hex([0xe8e4d8, 0xf2c41a][index % 2]!), bone: B.head, spec: 0.6, clean: true }, 1.25);
}

/** The house spirit: small, shaggy, the colour of the space behind the stove; a beard to its belt; eyes like coals. */
function domovoi(ctx: Ctx, index: number, seed: number): void {
  const { acc, D, rand } = ctx;
  const k = D.k;
  const hs = k * D.headS;
  const C = headCenter(D);
  const furC = [0x1c1814, 0x221c1a][index % 2]!;
  body(ctx, { hair: 'long', hairColor: furC, gaunt: 0.7, rib: 0.4 });
  addFeet(ctx, 'barefoot', ctx.skin);
  // a ragged shirt to the knees, tied with a cord
  skirtShell(ctx, 1.47, 0.56, hex(0x2a221c), 0.03, 0.06 * k, seed + 5, 1);
  for (const s of [-1, 1] as const) sleeve(ctx, s, 0.72, hex(0x2a221c), 0.014 * k, 0.04 * k, seed + 7 * s);
  torsoShell(ctx, 1.0, 1.02, hex(0x4a3a22), 0.026 * k, 0, seed + 9);
  // the beard and the mane
  const fur: Style = { color: hex(0x3a342e), bone: B.head };
  ell(acc, C.x, C.y - 0.13 * hs, C.z - 0.07 * hs, 0.07 * hs, 0.12 * hs, 0.05 * hs, fur, [0.2, 0, 0], 8, 6);
  cone(acc, C.x, C.y - 0.27 * hs, C.z - 0.07 * hs, 0.05 * hs, 0.16 * hs, { ...fur, bone: B.chest }, [Math.PI + 0.15, 0, 0], 6);
  ell(acc, C.x, C.y + 0.03 * hs, C.z + 0.04 * hs, 0.125 * hs, 0.13 * hs, 0.12 * hs, { ...fur, color: hex(furC) }, null, 10, 7);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand();
    cone(acc, C.x + Math.cos(a) * 0.1 * hs, C.y + (0.06 + rand() * 0.08) * hs, C.z + 0.04 * hs + Math.sin(a) * 0.1 * hs, 0.03 * hs, (0.1 + rand() * 0.06) * hs, { ...fur, color: hex(furC) }, [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], 4);
  }
  // tufts at the shoulders and the elbows
  for (const s of [-1, 1]) {
    const a = ctx.rest[s < 0 ? B.shL : B.shR]!;
    const e = ctx.rest[s < 0 ? B.elL : B.elR]!;
    cone(acc, a.x + s * 0.03 * k, a.y + 0.06 * k, a.z, 0.045 * k, 0.12 * k, { color: hex(furC), bone: s < 0 ? B.shL : B.shR }, [0, 0, -s * 0.7], 4);
    cone(acc, e.x + s * 0.03 * k, e.y, e.z + 0.02 * k, 0.03 * k, 0.09 * k, { color: hex(furC), bone: s < 0 ? B.elL : B.elR }, [0.6, 0, -s * 1.2], 4);
  }
}

const KIND_INDEX: Record<ZaryaKind, number> = { ryazhenye: 1, svistok: 2, kassirsha: 3, gruzchik: 4, dvornik: 5, rybak: 6, morzh: 7, domovoi: 8 };

/** One of a kind's looks, baked. */
function buildKind(type: ZombieType, kind: ZaryaKind, index: number): THREE.BufferGeometry {
  const D = zaryaDims(type, kind);
  const seed = (KIND_INDEX[kind] * 49979687 + index * 86028121 + 4099) >>> 0;
  let ctx: Ctx;
  let gore = 0.5;
  switch (kind) {
    case 'ryazhenye':
      ctx = person(D, seed, PALE[index % PALE.length]!, 0.94);
      ryazhenye(ctx, index, seed);
      break;
    case 'svistok':
      ctx = person(D, seed, PALE[(index + 1) % PALE.length]!, 0.96);
      svistok(ctx, index, seed);
      break;
    case 'kassirsha':
      ctx = person(D, seed, PALE[(index + 3) % PALE.length]!, 1.04);
      kassirsha(ctx, index, seed);
      break;
    case 'gruzchik':
      // the same man with and without his crate: one seed for both looks
      ctx = person(D, (KIND_INDEX[kind] * 49979687 + 4099) >>> 0, PALE[2]!, 1.02);
      gruzchik(ctx, index % 2 === 0, seed);
      break;
    case 'dvornik':
      ctx = person(D, seed, PALE[(index + 4) % PALE.length]!, 1.06);
      dvornik(ctx, index, seed);
      break;
    case 'rybak':
      ctx = person(D, seed, PALE[index % PALE.length]!, 1.08);
      rybak(ctx, index, seed);
      break;
    case 'morzh':
      // flushed with the cold: the one warm colour in the town
      ctx = person(D, seed, [0xd89a86, 0xcf8f80][index % 2]!, 1.12);
      morzh(ctx, index, seed);
      gore = 0.25;
      break;
    default:
      ctx = person(D, seed, 0x1e1a18, 0.92, { eye: new THREE.Color(1.0, 0.55, 0.12), eyeGlow: 3 });
      domovoi(ctx, index, seed);
      gore = 0;
      break;
  }
  return ctx.acc.toGeometry(frost(ctx, seed, gore));
}

/** A plain townsperson (or, with `kind`, one of the town's special kinds) of `type`, look `index`. */
export function buildZaryaVariant(type: ZombieType, index: number, kind: ZaryaKind | '' = ''): THREE.BufferGeometry {
  if (kind) return buildKind(type, kind, index);
  const D = zaryaDims(type);
  const t = type === 'shambler' ? 1 : type === 'runner' ? 2 : 3;
  const seed = (t * 32452867 + index * 15485867 + 1931) >>> 0;
  const list = type === 'runner' ? RUNNERS : type === 'armored' ? HEAVIES : SHAMBLERS;
  const look = list[index % list.length]!;
  const ctx = person(D, seed, look.skin, type === 'runner' ? 0.92 : type === 'armored' ? 1.04 : 0.96 + (index % 3) * 0.06);
  body(ctx, { hair: look.hat === 'none' || look.hat === 'platok' ? look.hair : 'none', hairColor: look.hairColor, gaunt: type === 'runner' ? 0.7 : 0.25, glove: look.mitts, fist: look.mitts !== undefined && type === 'armored' });
  dress(ctx, look, seed);
  return ctx.acc.toGeometry(frost(ctx, seed, type === 'runner' ? 0.9 : 0.5));
}
