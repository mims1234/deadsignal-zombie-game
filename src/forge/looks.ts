/**
 * How Vulcan's people look on the Forge: the leadership's own (bespoke), every member's from their name (the same name
 * always gives the same look: build, face, hair, outfit, colours from Forge palettes), and about twenty-five signature
 * items picked from members' names. Names borrowed from anime or other franchises get a colour hint, never a copy of
 * the character. Drawn by `coop/heroLook.ts`.
 */
import * as THREE from 'three';
import type { AvatarLook } from '../config';
import { addHeroAccessory } from '../coop/heroLook';

type Look = Omit<AvatarLook, 'hero'>;

/** tomoe, the co-leaders and Anya: hero versions with their own hair, outfit and signature item. */
const LEADERSHIP: Record<string, Look & { color: number }> = {
  // the leader: a long ember-lined coat, dark hair tied low, a phoenix pin and a sash
  tomoe: { build: 'lean', heroHair: 'lowPony', hairColor: 0x15121a, skin: 0xe9c7a8, eyes: 0x3a2418, heroOutfit: 'coat', color: 0x1e1a22, accent: 0xff7a1a, pants: 0x18161c, accessories: ['phoenixPin', 'sash'] },
  // co-leader, drawn anime-style: calm, very long pale-blue hair fading to deep blue at the ends, a white wide-brimmed
  // hat with a glowing butterfly on the brim, a long white dress fading to blue at the hem
  Athy: { build: 'f', female: true, anime: 'cool', heroHair: 'animeLong', hairColor: 0xdde8f6, hairTip: 0x3f6fd0, skin: 0xf6e2d6, eyes: 0x4aa6d8, heroOutfit: 'dress', skirt: 'long', color: 0xc2d6f4, accent: 0x2a4fb0, pants: 0xeef2f8, accessories: ['sunHat'] },
  // co-leader, the rumbles, drawn anime-style: round-cheeked and bright, fluffy pink hair with a side bun and a
  // lavender bow, big violet eyes and a cat smile, a soft white dress
  piryriry: { build: 'f', female: true, anime: 'soft', heroHair: 'animeBun', hairColor: 0xf6a6c8, skin: 0xfae6dc, eyes: 0x8a6ad8, heroOutfit: 'dress', skirt: 'short', color: 0xdccdfa, accent: 0xa58ae0, pants: 0xf2eef4, accessories: ['bow'] },
  // co-leader: silver undercut, goggles up, dark workwear
  Marv03K: { build: 'lean', heroHair: 'undercut', hairColor: 0xc8ccd4, skin: 0xc89a7a, eyes: 0x2a3a5a, heroOutfit: 'workwear', color: 0x2a3036, accent: 0xff9a3a, pants: 0x2a3036, accessories: ['goggles'] },
  // the officer: two long braids down the front, a forge apron over rolled sleeves, the radio headset she kept
  // everyone going with
  Anya: { build: 'f', female: true, heroHair: 'braids', hairColor: 0x3a2014, skin: 0xd8a888, eyes: 0x4a3018, heroOutfit: 'apron', color: 0x3a2a22, accent: 0xff7a1a, pants: 0x2a2420, accessories: ['headset'] },
};

/** Signature items picked from members' names (and a colour or two where the name asks for it). */
const SIGNATURE: Record<string, Partial<Look> & { color?: number }> = {
  JaxtheFennec: { accessories: ['foxEars'], hairColor: 0xd88a3a },
  Kitsune: { accessories: ['foxEars'], hairColor: 0xf0b070, heroHair: 'waves', build: 'f', female: true },
  Akansha: { accessories: ['bunnyEars'], build: 'f', female: true },
  Sharky: { accessories: ['sharkHood'] },
  Regen: { accessories: ['sharkHood'] },
  'J18F.5R': { accessories: ['mask'] },
  King: { accessories: ['crown'] },
  Blazeking: { accessories: ['flameCrown'], hairColor: 0xff7a2a },
  DragonsKeep: { accessories: ['horns'], color: 0x2a4a2a },
  DEMON: { accessories: ['horns'], color: 0x2a1414, hairColor: 0x101010 },
  Kratox: { accessories: ['horns'] },
  icecat: { accessories: ['scarf', 'catEars'], hairColor: 0xe0f0ff, accent: 0x7fd8ff },
  Snowy: { accessories: ['scarf'], hairColor: 0xf0f4ff, accent: 0x9fdcff },
  Snowko: { accessories: ['scarf'], hairColor: 0xdce8f4, accent: 0x9fdcff },
  'Snow Alberich': { accessories: ['scarf'], hairColor: 0xe8eef8, accent: 0x7fc8ff, heroHair: 'waves', build: 'f', female: true },
  SniperKing12341: { accessories: ['goggles'], heroOutfit: 'workwear', color: 0x3a4232 },
  Dev: { accessories: ['headphones'] },
  Lab: { accessories: ['glasses'], heroOutfit: 'coat', color: 0xe8e8e2 },
  'Vanilla Oreo': { color: 0x18181a, accent: 0xf2f2ee, hairColor: 0xf0eee8 },
  Cherry: { color: 0x8a1a22, accent: 0xff3a4a, hairColor: 0x7a1018 },
  Peaches_MLG: { accessories: ['shades'], color: 0xf0a070, accent: 0xffd0a0 },
  Night: { accessories: ['moonPin'], color: 0x14162a, hairColor: 0x0c0c18 },
  moon: { accessories: ['moonPin'], color: 0x1c2038, hairColor: 0xd8dce8, build: 'f', female: true },
  Cosmos: { accessories: ['stars'], color: 0x1a1a3a },
  Claw: { accessories: ['catEars'] },
  // a colour hint only (borrowed names)
  'Yuta Okkotsu': { color: 0x1a1a1e, hairColor: 0x101014 },
  'Himemori Luna': { color: 0xf0c0d8, hairColor: 0xf4d0e0, build: 'f', female: true },
  'Agnes Tachyon': { color: 0xe8e4dc, hairColor: 0x7a4a2a, build: 'f', female: true },
  senchou: { color: 0x8a1a2a, hairColor: 0xb02a3a, build: 'f', female: true },
  Zaraki: { color: 0xe8e4dc, hairColor: 0x101010, heroHair: 'spiky' },
  zoro_thelost: { color: 0x2a5a2a, hairColor: 0x3a7a3a },
  Spidey: { color: 0x8a1a1a, accent: 0x1a3a8a },
};

const SKIN = [0xf3d6c0, 0xe9c4a6, 0xdcae88, 0xc8946c, 0xa87250, 0x8a5a3c, 0x6e4430];
const HAIR = [0x15121a, 0x2a1c14, 0x4a2c1a, 0x7a4a2a, 0xb07a40, 0xd8b070, 0x8a2a1a, 0xc8ccd4, 0x2a3a6a, 0x6a2a4a];
const EYES = [0x3a2418, 0x2a3a5a, 0x3a5a2a, 0x5a4a2a, 0x2a2a2a, 0x4a6a8a, 0x6a3a2a];
/** Outfit colours: ember night - charcoal, rust, oxblood, olive, steel, leather. */
const CLOTH = [0x2a2a30, 0x5a2a1a, 0x4a1a1e, 0x3a3e2a, 0x2a3440, 0x5a3a22, 0x1e1e24, 0x6a4a2a];
const ACCENT = [0xff7a1a, 0xffb060, 0xff4a2a, 0xffd27a, 0xff8ac8, 0x7fd8ff, 0x9be07a, 0xb26bff];
const M_HAIR: readonly NonNullable<Look['heroHair']>[] = ['undercut', 'swept', 'wolf', 'spiky', 'buzz', 'swept', 'curls'];
const F_HAIR: readonly NonNullable<Look['heroHair']>[] = ['waves', 'highPony', 'braids', 'bob', 'lowPony', 'wolf', 'curls'];
const OUTFITS: readonly NonNullable<Look['heroOutfit']>[] = ['apron', 'jacket', 'hoodie', 'workwear', 'coat', 'jacket', 'apron'];

/** A stable 32-bit hash of a name. */
export function nameHash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** How someone in Vulcan looks (always the same for the same name), and the colour of what they wear. */
export function vulcanLook(name: string): { look: AvatarLook; color: number } {
  const lead = LEADERSHIP[name];
  if (lead) {
    const { color, ...rest } = lead;
    return { look: { ...rest, hero: true }, color };
  }
  let h = nameHash(name);
  const next = (n: number): number => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return h % n;
  };
  const female = next(100) < 42;
  const look: AvatarLook = {
    hero: true,
    build: female ? 'f' : next(100) < 30 ? 'lean' : 'm',
    female,
    skin: SKIN[next(SKIN.length)],
    hairColor: HAIR[next(HAIR.length)],
    eyes: EYES[next(EYES.length)],
    heroHair: female ? F_HAIR[next(F_HAIR.length)] : M_HAIR[next(M_HAIR.length)],
    heroOutfit: OUTFITS[next(OUTFITS.length)],
    accent: ACCENT[next(ACCENT.length)],
    pants: [0x1e1e22, 0x2a2420, 0x24282e, 0x2a2a1e][next(4)],
    stubble: !female && next(100) < 35,
  };
  let color = CLOTH[next(CLOTH.length)]!;
  const sig = SIGNATURE[name];
  if (sig) {
    const { color: c, ...rest } = sig;
    Object.assign(look, rest);
    if (rest.female === true) {
      look.build = 'f';
      if (!rest.heroHair) look.heroHair = F_HAIR[nameHash(name) % F_HAIR.length];
    }
    if (c !== undefined) color = c;
  }
  return { look, color };
}

/** The members with a signature item (for tests: every one must still be in the clan). */
export const SIGNATURE_NAMES: readonly string[] = Object.keys(SIGNATURE);
export const LEADERSHIP_NAMES: readonly string[] = Object.keys(LEADERSHIP);

const HEAD_ITEMS: ReadonlySet<string> = new Set(['foxEars', 'catEars', 'bunnyEars', 'horns', 'crown', 'flameCrown', 'mask', 'sharkHood', 'goggles', 'headphones', 'glasses', 'shades']);

/**
 * The Forge's named infected keep their signature item (the head ones: ears, horns, a crown, a mask...), centred on
 * the head (`ZombieRig.headAttach`). Null for anyone without one.
 */
export function headAccessory(name: string): THREE.Group | null {
  if (!SIGNATURE[name]?.accessories) return null;
  const { look } = vulcanLook(name);
  const items = (look.accessories ?? []).filter((a) => HEAD_ITEMS.has(a));
  if (items.length === 0) return null;
  const g = new THREE.Group();
  const elsewhere = new THREE.Group();
  for (const a of items) addHeroAccessory(elsewhere, elsewhere, g, look, a);
  return g;
}
