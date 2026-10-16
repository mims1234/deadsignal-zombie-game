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
import { type Ctx, V, addArmsSkin, addHands, addHead, addLegsSkin, addNeck, addTorsoSkin, hex, headCenter } from './body';
import { B, restPositions } from './dims';
import { type Outfit, addOutfit } from './garments';
import { addRiotGear } from './gear';
import { Accum, type Splat, type Weather } from './mesh';
import { mulberry32 } from './prng';
import { dimsFor } from './variants';

export const FORGE_VARIANT_COUNT: Record<ZombieType, number> = { shambler: 10, runner: 6, armored: 3, warden: 1 };

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
];

const RUNNERS: Outfit[] = [
  { name: 'torn-hoodie', top: 'hoodie', topColor: 0x3a2a2a, accent: 0x1a1a1a, sleeves: 'torn', bottom: 'jeans', bottomColor: 0x22262e, shoes: 'barefoot', shoeColor: 0, hair: 'strands', hairColor: 0x14100c, skin: 0x4a3a32 },
  { name: 'scorched', top: 'none', topColor: 0, accent: 0, sleeves: 'none', bottom: 'cargo', bottomColor: 0x3a3428, shoes: 'barefoot', shoeColor: 0, hair: 'none', hairColor: 0x14100c, skin: 0x3e302a },
  { name: 'runner-tank', top: 'tank', topColor: 0x5a3a2a, accent: 0x1a1a1a, sleeves: 'none', bottom: 'shorts', bottomColor: 0x2a2a30, shoes: 'sneakers', shoeColor: 0x6a645a, hair: 'patchy', hairColor: 0x2a1c14, skin: 0x4e3e34 },
  { name: 'jacket-runner', top: 'jacket', topColor: 0x4a2a1a, accent: 0x2a2a2a, sleeves: 'torn', bottom: 'jeans', bottomColor: 0x2a3040, shoes: 'boots', shoeColor: 0x2a1e16, hair: 'long', hairColor: 0x1a1410, skin: 0x54443a },
  { name: 'shirt-runner', top: 'tshirt', topColor: 0x6a3a2a, accent: 0x6a3a2a, sleeves: 'short', bottom: 'cargo', bottomColor: 0x3a3a30, shoes: 'barefoot', shoeColor: 0, hair: 'short', hairColor: 0x2a1c14, skin: 0x483a30 },
  { name: 'hood-runner', top: 'hoodie', topColor: 0x2a2440, accent: 0xff8ac8, sleeves: 'long', bottom: 'shorts', bottomColor: 0x22262e, shoes: 'sneakers', shoeColor: 0x8a8070, hair: 'strands', hairColor: 0xb07a40, skin: 0x50403a },
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
    outfit = { name: 'forge-riot', top: 'jacket', topColor: [0x3a2a22, 0x2a2a2a, 0x4a3022][index % 3]!, accent: 0x2a2420, sleeves: 'long', bottom: 'cargo', bottomColor: 0x2a2620, shoes: 'combat', shoeColor: 0x1e1814, hair: 'none', hairColor: 0x14100c, skin: 0x40322a };
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
  if (type === 'armored') addRiotGear(ctx, index);
  emberCracks(ctx, type === 'runner' ? 7 : 5);
  return acc.toGeometry(soot(ctx, seed));
}
