/**
 * The Forge's lost: its own infected appearance variants (the 'forge' theme of the rig factory). They were Vulcan's
 * members - the furnace crews, the market traders, the summoners in their hoodies and work jackets - and they are
 * still recognisably those people, burned: charred skin with glowing ember cracks, eyes like coals, soot rather than
 * blood, clothes scorched at the edges. Same skeleton and proportions as the standard variants, so every animation,
 * hit query and ragdoll works unchanged.
 *
 * Nothing here runs unless a rig is created with the 'forge' theme.
 */
import * as THREE from 'three';
import type { ZombieType } from '../../types';
import { type Ctx, V, addArmsSkin, addFeet, addHands, addHead, addLegsSkin, addNeck, addTorsoSkin, hex, headCenter } from './body';
import { B, restPositions } from './dims';
import { type Outfit, addOutfit } from './garments';
import { addRiotGear } from './gear';
import { Accum, type Splat, type Style, type Weather, box, cone, cyl, ell, taper } from './mesh';
import { mulberry32 } from './prng';
import { dimsFor } from './variants';

export const FORGE_VARIANT_COUNT: Record<ZombieType, number> = { shambler: 14, runner: 8, armored: 5, warden: 1 };

/** Ember night workwear: furnace crews, traders, summoners. Skins are charred (dark, with a warm undertone). */
const SHAMBLERS: Outfit[] = [
  { name: 'furnace-crew', top: 'overalls', topColor: 0x5a3a22, accent: 0x2a2420, sleeves: 'long', bottom: 'jeans', bottomColor: 0x5a3a22, shoes: 'boots', shoeColor: 0x2a1e16, hair: 'none', hairColor: 0x1a1410, skin: 0x4a3a32, extras: ['belt'] },
  { name: 'summoner-hoodie', top: 'hoodie', topColor: 0x2a2a30, accent: 0xff7a1a, sleeves: 'long', bottom: 'jeans', bottomColor: 0x2a3040, shoes: 'sneakers', shoeColor: 0x6a645a, hair: 'patchy', hairColor: 0x1a1410, skin: 0x54443a },
  { name: 'work-jacket', top: 'jacket', topColor: 0x4a2a1a, accent: 0x2a2a2a, sleeves: 'long', bottom: 'cargo', bottomColor: 0x3a3a30, shoes: 'boots', shoeColor: 0x2a2420, hair: 'short', hairColor: 0x2a1c14, skin: 0x5a463a, extras: ['belt', 'pockets'] },
  { name: 'trader', top: 'shirt', topColor: 0x8a5a3a, accent: 0x4a1a1a, sleeves: 'torn', bottom: 'slacks', bottomColor: 0x2a2620, shoes: 'dress', shoeColor: 0x1a1612, hair: 'long', hairColor: 0x2a1810, skin: 0x5e4a3e },
  { name: 'apron', top: 'tshirt', topColor: 0x3a2a24, accent: 0x6a4a2e, sleeves: 'short', bottom: 'jeans', bottomColor: 0x2a2a30, shoes: 'boots', shoeColor: 0x2a2018, hair: 'patchy', hairColor: 0x3a2a1e, skin: 0x4e3e34, extras: ['belt'] },
  { name: 'ember-tank', top: 'tank', topColor: 0x6a4a3a, accent: 0x2a2420, sleeves: 'none', bottom: 'cargo', bottomColor: 0x3a3428, shoes: 'boots', shoeColor: 0x2a2018, hair: 'short', hairColor: 0x14100c, skin: 0x4a3830 },
  { name: 'clan-hoodie', top: 'hoodie', topColor: 0x4a1a14, accent: 0xff9a3a, sleeves: 'torn', bottom: 'jeans', bottomColor: 0x2a2a34, shoes: 'sneakers', shoeColor: 0x8a8070, hair: 'long', hairColor: 0x7a2a1a, skin: 0x54423a },
  { name: 'courier', top: 'jacket', topColor: 0x2a3a4a, accent: 0xffb060, sleeves: 'long', bottom: 'jeans', bottomColor: 0x22262e, shoes: 'sneakers', shoeColor: 0x5a5448, hair: 'strands', hairColor: 0x2a1c14, skin: 0x5a483c, extras: ['lanyard'] },
  { name: 'smith', top: 'overalls', topColor: 0x3a3a34, accent: 0x2a2a2a, sleeves: 'torn', bottom: 'cargo', bottomColor: 0x3a3a34, shoes: 'boots', shoeColor: 0x241c16, hair: 'none', hairColor: 0x1a1410, skin: 0x463830, extras: ['bandage'] },
  { name: 'scholar', top: 'labcoat', topColor: 0x8a8478, accent: 0x5a3a2a, sleeves: 'long', bottom: 'slacks', bottomColor: 0x2a2620, shoes: 'dress', shoeColor: 0x1a1612, hair: 'short', hairColor: 0x3a2a20, skin: 0x5a4a40 },
  // the foundry floor's own (each with its kit, see KIT)
  { name: 'welder', top: 'jacket', topColor: 0x3a2a1e, accent: 0x1a1612, sleeves: 'long', bottom: 'cargo', bottomColor: 0x2e2a24, shoes: 'boots', shoeColor: 0x1e1814, hair: 'none', hairColor: 0x14100c, skin: 0x4a3a32, extras: ['belt'] },
  { name: 'crane-hand', top: 'jacket', topColor: 0xa85a18, accent: 0xd8d0b0, sleeves: 'torn', bottom: 'jeans', bottomColor: 0x2a2e36, shoes: 'boots', shoeColor: 0x241c16, hair: 'short', hairColor: 0x2a1c14, skin: 0x54443a, extras: ['pockets'] },
  { name: 'ash-walker', top: 'none', topColor: 0, accent: 0, sleeves: 'none', bottom: 'cargo', bottomColor: 0x1e1a18, shoes: 'barefoot', shoeColor: 0, hair: 'none', hairColor: 0x14100c, skin: 0x2a2220 },
  { name: 'caster', top: 'overalls', topColor: 0x6a6258, accent: 0x2a2420, sleeves: 'short', bottom: 'cargo', bottomColor: 0x6a6258, shoes: 'boots', shoeColor: 0x2a1e16, hair: 'patchy', hairColor: 0x1a1410, skin: 0x503e34, extras: ['belt', 'bandage'] },
];

/** What each of the Forge's infected still carries from the job: by outfit name. */
type Kit = 'hardhat' | 'mask' | 'heart' | 'slag' | 'goggles';
const KIT: Record<string, Kit[]> = {
  'furnace-crew': ['hardhat'],
  smith: ['goggles', 'slag'],
  apron: ['goggles'],
  'ember-tank': ['slag'],
  welder: ['mask'],
  'crane-hand': ['hardhat'],
  'ash-walker': ['heart', 'slag'],
  caster: ['hardhat', 'slag'],
  scorched: ['heart'],
  'ember-sprinter': ['heart', 'slag'],
  stoker: ['goggles'],
};

const RUNNERS: Outfit[] = [
  { name: 'torn-hoodie', top: 'hoodie', topColor: 0x3a2a2a, accent: 0x1a1a1a, sleeves: 'torn', bottom: 'jeans', bottomColor: 0x22262e, shoes: 'barefoot', shoeColor: 0, hair: 'strands', hairColor: 0x14100c, skin: 0x4a3a32 },
  { name: 'scorched', top: 'none', topColor: 0, accent: 0, sleeves: 'none', bottom: 'cargo', bottomColor: 0x3a3428, shoes: 'barefoot', shoeColor: 0, hair: 'none', hairColor: 0x14100c, skin: 0x3e302a },
  { name: 'runner-tank', top: 'tank', topColor: 0x5a3a2a, accent: 0x1a1a1a, sleeves: 'none', bottom: 'shorts', bottomColor: 0x2a2a30, shoes: 'sneakers', shoeColor: 0x6a645a, hair: 'patchy', hairColor: 0x2a1c14, skin: 0x4e3e34 },
  { name: 'jacket-runner', top: 'jacket', topColor: 0x4a2a1a, accent: 0x2a2a2a, sleeves: 'torn', bottom: 'jeans', bottomColor: 0x2a3040, shoes: 'boots', shoeColor: 0x2a1e16, hair: 'long', hairColor: 0x1a1410, skin: 0x54443a },
  { name: 'shirt-runner', top: 'tshirt', topColor: 0x6a3a2a, accent: 0x6a3a2a, sleeves: 'short', bottom: 'cargo', bottomColor: 0x3a3a30, shoes: 'barefoot', shoeColor: 0, hair: 'short', hairColor: 0x2a1c14, skin: 0x483a30 },
  { name: 'hood-runner', top: 'hoodie', topColor: 0x2a2440, accent: 0xff8ac8, sleeves: 'long', bottom: 'shorts', bottomColor: 0x22262e, shoes: 'sneakers', shoeColor: 0x8a8070, hair: 'strands', hairColor: 0xb07a40, skin: 0x50403a },
  { name: 'ember-sprinter', top: 'none', topColor: 0, accent: 0, sleeves: 'none', bottom: 'shorts', bottomColor: 0x1e1a18, shoes: 'barefoot', shoeColor: 0, hair: 'none', hairColor: 0x14100c, skin: 0x2e2420 },
  { name: 'stoker', top: 'tank', topColor: 0x3a3430, accent: 0x1a1a1a, sleeves: 'none', bottom: 'cargo', bottomColor: 0x4a3a2a, shoes: 'boots', shoeColor: 0x241c16, hair: 'short', hairColor: 0x14100c, skin: 0x483a30 },
];

function skinSet(base: number): { skin: THREE.Color; dark: THREE.Color; light: THREE.Color } {
  const skin = hex(base);
  const hsl = { h: 0, s: 0, l: 0 };
  skin.getHSL(hsl);
  const dark = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9 + 0.05), hsl.l * 0.45);
  const light = new THREE.Color().setHSL(hsl.h, hsl.s * 0.8, Math.min(0.7, hsl.l * 1.25));
  return { skin, dark, light };
}

/** Glowing cracks: small ember seams on the skin, each riding the bone under it. */
function emberCracks(ctx: Ctx, n: number): void {
  const { D, rand, acc } = ctx;
  const k = D.k;
  const hc = headCenter(D);
  const spots: [THREE.Vector3, number][] = [
    [V(0.08 * k, 1.38 * k, -0.11 * k), B.chest],
    [V(-0.1 * k, 1.3 * k, -0.1 * k), B.chest],
    [V(0.04 * k, 1.16 * k, -0.12 * k), B.spine],
    [V(-0.06 * k, 1.5 * k, -0.07 * k), B.neck],
    [V(hc.x + 0.05 * k, hc.y + 0.02 * k, hc.z - 0.07 * k), B.head],
    [V(hc.x - 0.04 * k, hc.y - 0.04 * k, hc.z - 0.075 * k), B.head],
    [V(0.12 * k, 1.42 * k, 0.08 * k), B.chest],
    [V(-0.12 * k, 1.2 * k, 0.09 * k), B.spine],
  ];
  const ember = new THREE.Color(1.0, 0.36, 0.08);
  for (let i = 0; i < n; i++) {
    const [c, bone] = spots[Math.floor(rand() * spots.length)]!;
    const len = (0.035 + rand() * 0.05) * k;
    const g = new THREE.SphereGeometry(1, 6, 4);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    const m = new THREE.Matrix4().compose(c.clone().add(V((rand() - 0.5) * 0.03 * k, (rand() - 0.5) * 0.06 * k, 0)), q, V(len, 0.006 * k, 0.012 * k));
    acc.add(g, m, { color: ember, bone, glow: 2.4, clean: true });
    g.dispose();
  }
}

const EMBER = new THREE.Color(1.0, 0.36, 0.08);
const EMBER_HOT = new THREE.Color(1.0, 0.62, 0.2);
const IRON = 0x24211f;

/** A scorched site helmet: dome, brim, a ridge down the middle, its lamp still lit. */
function hardHat(ctx: Ctx, color: number): void {
  const { acc, D } = ctx;
  const hs = D.k * D.headS;
  const C = headCenter(D);
  const st: Style = { color: hex(color), bone: B.head, spec: 0.45 };
  const dome = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, 1.2);
  acc.add(dome, new THREE.Matrix4().compose(V(C.x, C.y + 0.03 * hs, C.z + 0.004 * hs), new THREE.Quaternion(), V(0.102 * hs, 0.105 * hs, 0.116 * hs)), st);
  dome.dispose();
  cyl(acc, C.x, C.y + 0.066 * hs, C.z - 0.012 * hs, 0.128 * hs, 0.132 * hs, 0.012 * hs, st, [0.12, 0, 0], 14);
  box(acc, C.x, C.y + 0.128 * hs, C.z + 0.004 * hs, 0.022 * hs, 0.018 * hs, 0.19 * hs, { ...st, color: hex(color).multiplyScalar(0.8) });
  box(acc, C.x, C.y + 0.092 * hs, C.z - 0.108 * hs, 0.03 * hs, 0.024 * hs, 0.02 * hs, { color: hex(0x18181a), bone: B.head, spec: 0.5 });
  ell(acc, C.x, C.y + 0.092 * hs, C.z - 0.12 * hs, 0.011 * hs, 0.011 * hs, 0.005 * hs, { color: EMBER_HOT, bone: B.head, glow: 2.2, clean: true }, null, 6, 4);
}

/** A welder's mask, down over the face: iron, with the window lit from inside. */
function weldMask(ctx: Ctx): void {
  const { acc, D } = ctx;
  const hs = D.k * D.headS;
  const C = headCenter(D);
  const st: Style = { color: hex(IRON), bone: B.head, spec: 0.6 };
  box(acc, C.x, C.y - 0.012 * hs, C.z - 0.104 * hs, 0.15 * hs, 0.2 * hs, 0.018 * hs, st, [0.06, 0, 0]);
  for (const s of [-1, 1]) box(acc, C.x + s * 0.08 * hs, C.y - 0.012 * hs, C.z - 0.07 * hs, 0.014 * hs, 0.19 * hs, 0.075 * hs, st, [0, s * 0.35, 0]);
  box(acc, C.x, C.y + 0.094 * hs, C.z - 0.03 * hs, 0.17 * hs, 0.02 * hs, 0.17 * hs, { ...st, color: hex(0x15120f) });
  box(acc, C.x, C.y + 0.03 * hs, C.z - 0.116 * hs, 0.092 * hs, 0.034 * hs, 0.006 * hs, { color: EMBER_HOT, bone: B.head, glow: 2.3, clean: true });
}

/** Round furnace goggles, the lenses glowing. */
function goggles(ctx: Ctx): void {
  const { acc, D } = ctx;
  const hs = D.k * D.headS;
  const C = headCenter(D);
  for (const s of [-1, 1]) {
    cyl(acc, C.x + s * 0.034 * hs, C.y + 0.03 * hs, C.z - 0.098 * hs, 0.026 * hs, 0.028 * hs, 0.024 * hs, { color: hex(0x1c1a18), bone: B.head, spec: 0.6 }, [Math.PI / 2, 0, 0], 10);
    cyl(acc, C.x + s * 0.034 * hs, C.y + 0.03 * hs, C.z - 0.112 * hs, 0.02 * hs, 0.02 * hs, 0.004 * hs, { color: EMBER, bone: B.head, glow: 2.6, clean: true }, [Math.PI / 2, 0, 0], 10);
  }
  box(acc, C.x, C.y + 0.03 * hs, C.z, 0.2 * hs, 0.022 * hs, 0.22 * hs, { color: hex(0x15120f), bone: B.head });
}

/** The fire showing through the ribs: a bright core in the chest behind dark bars of bone. */
function emberHeart(ctx: Ctx): void {
  const { acc, D } = ctx;
  const k = D.k;
  const zf = -0.108 * ctx.girth * D.torsoD * k;
  ell(acc, 0.012 * k, 1.33 * k, zf + 0.012 * k, 0.062 * k, 0.078 * k, 0.03 * k, { color: EMBER_HOT, bone: B.chest, glow: 2.2, clean: true }, null, 10, 6);
  for (let i = 0; i < 4; i++) box(acc, 0.012 * k, (1.275 + i * 0.036) * k, zf - 0.012 * k, 0.15 * k, 0.012 * k, 0.014 * k, { color: hex(0x120d0b), bone: B.chest }, [0, 0, (i % 2 ? 1 : -1) * 0.07]);
}

/** Slag cooled onto them: dark lumps over one shoulder and down that arm, the seams between still lit. */
function slagCrust(ctx: Ctx, side: 1 | -1): void {
  const { acc, D, rand, rest } = ctx;
  const k = D.k;
  const sh = side < 0 ? B.shL : B.shR;
  const el = side < 0 ? B.elL : B.elR;
  const a = rest[sh]!;
  const e = rest[el]!;
  const lump = (x: number, y: number, z: number, r: number, bone: number): void => {
    ell(acc, x, y, z, r * (0.8 + rand() * 0.5), r * (0.6 + rand() * 0.4), r * (0.8 + rand() * 0.5), { color: hex(0x191513), bone, spec: 0.35 }, [rand() * 3, rand() * 3, rand() * 3], 6, 4);
    ell(acc, x + (rand() - 0.5) * r, y - r * 0.3, z - r * 0.5, r * 0.42, r * 0.1, r * 0.3, { color: EMBER, bone, glow: 2.6, clean: true }, [rand() * 3, rand() * 3, 0], 6, 4);
  };
  lump(a.x + side * 0.02 * k, a.y + 0.045 * k, a.z, 0.075 * k * Math.sqrt(D.armT), sh);
  lump(a.x - side * 0.05 * k, a.y + 0.03 * k, a.z + 0.03 * k, 0.06 * k, B.chest);
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    lump(a.x + (e.x - a.x) * t + side * 0.03 * k, a.y + (e.y - a.y) * t, a.z + (e.z - a.z) * t - 0.01 * k, (0.058 - i * 0.006) * k * Math.sqrt(D.armT), sh);
  }
  lump(e.x + side * 0.02 * k, e.y - 0.04 * k, e.z - 0.01 * k, 0.045 * k * Math.sqrt(D.armT), el);
}

function addKit(ctx: Ctx, kit: readonly Kit[], index: number): void {
  for (const it of kit) {
    if (it === 'hardhat') hardHat(ctx, [0xb8922a, 0xa8a49a, 0x9a3a1c][index % 3]!);
    else if (it === 'mask') weldMask(ctx);
    else if (it === 'goggles') goggles(ctx);
    else if (it === 'heart') emberHeart(ctx);
    else slagCrust(ctx, index % 2 ? 1 : -1);
  }
}

/**
 * THE INFERNUS: the first of them, the member who summoned longest. Nothing of the District's hazmat Warden is left in
 * it (the same frame, so it moves and takes hits the same): a charred giant plated in furnace iron that the fire welded
 * on, every seam between the plates lit from inside; a grate over the chest with the furnace burning behind it; a slit
 * helm under a crown of slag; two flues riding its back, their mouths glowing. "Burning plate over burning flesh."
 */
function buildInfernus(ctx: Ctx): void {
  const { acc, D, rest } = ctx;
  const k = D.k;
  const gW = D.torsoW;
  const gD = D.torsoD;
  const plate: Style = { color: hex(0x2b2725), bone: B.chest, spec: 0.6 };
  const plateLit: Style = { color: hex(0x3a332e), bone: B.chest, spec: 0.7 };
  const seam = (bone: number, glow = 2.1): Style => ({ color: EMBER, bone, glow, clean: true });
  const zf = -(0.112 * gD * k + 0.02 * k);
  const zb = 0.112 * gD * k + 0.02 * k;

  // ---- breastplate: two slabs round a grate, the furnace behind it ----
  for (const s of [-1, 1]) {
    box(acc, s * 0.115 * k * gW, 1.3 * k, zf, 0.14 * k * gW, 0.36 * k, 0.05 * k, plate, [0, s * 0.22, s * 0.04]);
    box(acc, s * 0.12 * k * gW, 1.42 * k, zf - 0.012 * k, 0.12 * k * gW, 0.1 * k, 0.03 * k, plateLit, [0.1, s * 0.22, 0]);
  }
  ell(acc, 0, 1.3 * k, zf + 0.02 * k, 0.06 * k * gW, 0.13 * k, 0.03 * k, { color: EMBER_HOT, bone: B.chest, glow: 2.3, clean: true }, null, 10, 6);
  for (let i = 0; i < 5; i++) box(acc, 0, (1.2 + i * 0.05) * k, zf - 0.012 * k, 0.11 * k * gW, 0.016 * k, 0.02 * k, { color: hex(0x151210), bone: B.chest, spec: 0.5 });
  for (const s of [-1, 1]) box(acc, s * 0.05 * k * gW, 1.3 * k, zf - 0.014 * k, 0.014 * k, 0.27 * k, 0.022 * k, { color: hex(0x151210), bone: B.chest, spec: 0.5 });
  // belly plates, overlapping, a lit seam under each
  for (let i = 0; i < 3; i++) {
    const y = (1.08 - i * 0.07) * k;
    box(acc, 0, y, zf + 0.012 * k + i * 0.004 * k, (0.3 - i * 0.02) * k * gW, 0.085 * k, 0.04 * k, { ...plate, bone: B.spine }, [-0.08, 0, 0]);
    box(acc, 0, y - 0.04 * k, zf + 0.02 * k, (0.27 - i * 0.02) * k * gW, 0.01 * k, 0.03 * k, seam(B.spine, 1.9));
  }
  // back plate and spine ridge
  box(acc, 0, 1.28 * k, zb, 0.3 * k * gW, 0.42 * k, 0.05 * k, plate);
  for (let i = 0; i < 4; i++) box(acc, 0, (1.14 + i * 0.09) * k, zb + 0.035 * k, 0.05 * k, 0.07 * k, 0.05 * k, plateLit, [0.4, 0, 0]);
  box(acc, 0, 1.28 * k, zb + 0.012 * k, 0.012 * k, 0.4 * k, 0.03 * k, seam(B.chest, 2.2));
  // the flues on its back
  for (const s of [-1, 1]) {
    cyl(acc, s * 0.1 * k * gW, 1.56 * k, zb + 0.04 * k, 0.04 * k, 0.052 * k, 0.34 * k, { color: hex(0x1c1917), bone: B.chest, spec: 0.5 }, [-0.22, 0, s * 0.16], 8);
    ell(acc, s * (0.1 * gW + 0.027) * k, 1.735 * k, zb + 0.078 * k, 0.036 * k, 0.012 * k, 0.036 * k, { color: EMBER_HOT, bone: B.chest, glow: 2.3, clean: true }, [-0.22, 0, s * 0.16], 8, 4);
  }

  // ---- shoulders, arms, legs ----
  for (const s of [-1, 1] as const) {
    const sh = s < 0 ? B.shL : B.shR;
    const el = s < 0 ? B.elL : B.elR;
    const ha = s < 0 ? B.haL : B.haR;
    const a = rest[sh]!;
    const e = rest[el]!;
    const w = rest[ha]!;
    // pauldron: three stacked plates and a spike of slag
    for (let i = 0; i < 3; i++) {
      ell(acc, a.x + s * (0.01 + i * 0.022) * k, a.y + (0.05 - i * 0.035) * k, a.z, (0.12 - i * 0.008) * k * Math.sqrt(D.armT), 0.055 * k, 0.135 * k, { color: hex(i === 0 ? 0x332d29 : 0x26221f), bone: sh, spec: 0.6 }, [0, 0, -s * (0.35 + i * 0.22)], 10, 6);
    }
    cone(acc, a.x + s * 0.03 * k, a.y + 0.14 * k, a.z, 0.035 * k, 0.16 * k, { color: hex(0x191513), bone: sh, spec: 0.4 }, [0, 0, -s * 0.5], 5);
    ell(acc, a.x + s * 0.02 * k, a.y - 0.04 * k, a.z - 0.1 * k, 0.07 * k, 0.012 * k, 0.02 * k, seam(sh));
    // upper arm band, elbow cap, vambrace with lit seams
    taper(acc, V(a.x + (e.x - a.x) * 0.35, a.y + (e.y - a.y) * 0.35, a.z), V(a.x + (e.x - a.x) * 0.75, a.y + (e.y - a.y) * 0.75, e.z), 0.072 * k * D.armT, 0.066 * k * D.armT, { color: hex(0x26221f), bone: sh, spec: 0.55 }, 7);
    ell(acc, e.x, e.y, e.z + 0.01 * k, 0.07 * k * D.armT, 0.075 * k, 0.075 * k * D.armT, { color: hex(0x332d29), bone: el, spec: 0.6 }, null, 8, 6);
    taper(acc, V(e.x, e.y - 0.05 * k, e.z - 0.01 * k), V(w.x, w.y + 0.03 * k, w.z - 0.01 * k), 0.068 * k * D.armT, 0.058 * k * D.armT, { color: hex(0x2b2725), bone: el, spec: 0.6 }, 7);
    for (let i = 0; i < 3; i++) {
      const t = 0.25 + i * 0.25;
      ell(acc, e.x + (w.x - e.x) * t, e.y + (w.y - e.y) * t, e.z - 0.062 * k * D.armT, 0.03 * k, 0.008 * k, 0.012 * k, seam(el, 2.0));
    }
    // thigh plate, knee cap, greave
    const hb = s < 0 ? B.hipL : B.hipR;
    const kb = s < 0 ? B.knL : B.knR;
    box(acc, s * D.hipX, 0.8 * k, -0.085 * k * D.legT, 0.125 * k * D.legT, 0.27 * k, 0.035 * k, { ...plate, bone: hb });
    box(acc, s * D.hipX, 0.655 * k, -0.092 * k * D.legT, 0.1 * k * D.legT, 0.01 * k, 0.02 * k, seam(hb, 1.9));
    ell(acc, s * D.hipX, D.kneeY + 0.01 * k, -0.068 * k * D.legT, 0.07 * k * D.legT, 0.085 * k, 0.05 * k, { color: hex(0x332d29), bone: kb, spec: 0.6 }, null, 9, 6);
    box(acc, s * D.hipX, 0.28 * k, -0.07 * k * D.legT, 0.105 * k * D.legT, 0.3 * k, 0.032 * k, { ...plate, bone: kb });
    box(acc, s * D.hipX, 0.28 * k, 0.07 * k * D.legT, 0.1 * k * D.legT, 0.28 * k, 0.028 * k, { ...plate, bone: kb });
  }

  // ---- the helm: a slit visor, a jaw guard, a crown of slag ----
  const hs = k * D.headS;
  const C = headCenter(D);
  const helm: Style = { color: hex(0x24201d), bone: B.head, spec: 0.65 };
  const dome = new THREE.SphereGeometry(1, 16, 9, 0, Math.PI * 2, 0, 1.45);
  acc.add(dome, new THREE.Matrix4().compose(V(C.x, C.y + 0.012 * hs, C.z + 0.006 * hs), new THREE.Quaternion(), V(0.108 * hs, 0.126 * hs, 0.122 * hs)), helm);
  dome.dispose();
  box(acc, C.x, C.y + 0.058 * hs, C.z - 0.106 * hs, 0.18 * hs, 0.05 * hs, 0.03 * hs, helm, [0.2, 0, 0]);
  box(acc, C.x, C.y - 0.045 * hs, C.z - 0.1 * hs, 0.17 * hs, 0.1 * hs, 0.03 * hs, helm, [-0.12, 0, 0]);
  box(acc, C.x, C.y + 0.014 * hs, C.z - 0.104 * hs, 0.15 * hs, 0.026 * hs, 0.012 * hs, { color: EMBER_HOT, bone: B.head, glow: 2.6, clean: true });
  for (let i = -1; i <= 1; i++) box(acc, C.x + i * 0.04 * hs, C.y - 0.05 * hs, C.z - 0.118 * hs, 0.008 * hs, 0.07 * hs, 0.008 * hs, seam(B.head, 2.2));
  for (let i = 0; i < 7; i++) {
    const a = -1.3 + (i / 6) * 2.6;
    const up = 0.12 + 0.07 * Math.cos(a * 1.2);
    cone(acc, C.x + Math.sin(a) * 0.092 * hs, C.y + (0.1 + up * 0.5) * hs, C.z + (0.02 - Math.cos(a) * 0.02) * hs, 0.02 * hs, up * hs, { color: hex(0x191513), bone: B.head, spec: 0.4 }, [0.1, 0, -Math.sin(a) * 0.55], 5);
  }
  // gorget
  cyl(acc, 0, D.neckY + 0.02 * k, 0, 0.1 * k, 0.13 * k, 0.09 * k, { color: hex(0x26221f), bone: B.neck, spec: 0.55 }, null, 10, true);
}

function buildInfernusGeometry(): THREE.BufferGeometry {
  const D = dimsFor('warden');
  const seed = 0x1f3a7;
  const rand = mulberry32(seed);
  const acc = new Accum();
  const sk = skinSet(0x2a201c);
  const ctx: Ctx = { acc, D, rest: restPositions(D), rand, girth: 1, skin: sk.skin, skinDark: sk.dark, skinLight: sk.light, eye: new THREE.Color(1.0, 0.5, 0.12), eyeGlow: 2.8 };
  addTorsoSkin(ctx);
  addNeck(ctx, 1.4);
  addHead(ctx, { hair: 'none', hairColor: hex(0x14100c), gaunt: 0.5, teeth: hex(0x6a5a48) });
  addArmsSkin(ctx);
  addLegsSkin(ctx);
  addHands(ctx, { glove: hex(0x1e1a18), gloveSpec: 0.5, clawColor: hex(0x120e0c), size: 1.15 });
  addFeet(ctx, 'combat', hex(0x171412));
  buildInfernus(ctx);
  emberCracks(ctx, 14);
  return acc.toGeometry(soot(ctx, seed));
}

/** Soot rather than blood: dark smudges, a few scorch marks. */
function soot(ctx: Ctx, seed: number): Weather {
  const { D, rand } = ctx;
  const k = D.k;
  const ash = new THREE.Color(0.05, 0.04, 0.035);
  const scorch = new THREE.Color(0.14, 0.06, 0.03);
  const splats: Splat[] = [];
  const n = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) splats.push({ c: V((rand() - 0.5) * 0.5 * k, (0.4 + rand() * 1.2) * k, (rand() - 0.5) * 0.24 * k), r: (0.08 + rand() * 0.1) * k, a: 0.5 + rand() * 0.4, color: rand() < 0.6 ? ash : scorch });
  return { seed, dirt: 0.9, tone: 1.15, splats };
}

export function buildForgeVariant(type: ZombieType, index: number): THREE.BufferGeometry {
  if (type === 'warden') return buildInfernusGeometry();
  const D = dimsFor(type);
  const t = type === 'shambler' ? 1 : type === 'runner' ? 2 : type === 'armored' ? 3 : 4;
  const seed = (t * 15485863 + index * 32452843 + 777) >>> 0;
  const rand = mulberry32(seed);
  const acc = new Accum();
  let outfit: Outfit;
  let girth = 0.94 + rand() * 0.18;
  if (type === 'runner') {
    outfit = RUNNERS[index % RUNNERS.length]!;
    girth = 0.9 + rand() * 0.08;
  } else if (type === 'armored') {
    outfit = { name: 'forge-riot', top: 'jacket', topColor: [0x3a2a22, 0x2a2a2a, 0x4a3022, 0x1e1a18, 0x2a1c14][index % 5]!, accent: 0x2a2420, sleeves: 'long', bottom: 'cargo', bottomColor: 0x2a2620, shoes: 'combat', shoeColor: 0x1e1814, hair: 'none', hairColor: 0x14100c, skin: 0x40322a };
    girth = 1.02;
  } else outfit = SHAMBLERS[index % SHAMBLERS.length]!;
  const sk = skinSet(outfit.skin);
  const ctx: Ctx = {
    acc,
    D,
    rest: restPositions(D),
    rand,
    girth,
    skin: sk.skin,
    skinDark: sk.dark,
    skinLight: sk.light,
    // eyes like coals
    eye: new THREE.Color(1.0, 0.42, 0.1),
    eyeGlow: 2.6,
  };
  addTorsoSkin(ctx, undefined, type === 'runner' ? 0.6 : 0.1);
  addNeck(ctx);
  // a face that was a person's: not gaunt, not torn
  addHead(ctx, { hair: type === 'armored' ? 'none' : outfit.hair, hairColor: hex(outfit.hairColor), gaunt: type === 'runner' ? 0.4 : 0.1, teeth: hex(0x9a8a70) });
  addArmsSkin(ctx);
  addLegsSkin(ctx);
  addHands(ctx, type === 'armored' ? { glove: hex(0x1b1c1e), gloveSpec: 0.2, clawColor: hex(0x1b1c1e) } : { clawColor: hex(0x2a1a12) });
  addOutfit(ctx, outfit);
  if (type === 'armored') {
    addRiotGear(ctx, index);
    // the two the furnace kept longest: slag over the plates, down both arms
    if (index >= 3) {
      slagCrust(ctx, 1);
      slagCrust(ctx, -1);
    }
  } else addKit(ctx, KIT[outfit.name] ?? [], index);
  emberCracks(ctx, outfit.top === 'none' ? 12 : type === 'runner' ? 7 : 5);
  return acc.toGeometry(soot(ctx, seed));
}
