/**
 * The Sakura District's kinds of infected (and its armed humans), each one of the stock types underneath - its body,
 * its gait, its pooled rig - with its own stats and a behaviour on top (`Zombie.variantStep`):
 *
 *   commuter   still keeps its routine: paces its platform, half blind; walk past it quietly and it never turns
 *   bloomed    full of blossom: bursts into a cloud of petals when it dies that burns the lungs of anyone in it
 *   rooted     lies under the petals until someone comes close, then comes up running
 *   kuchisake  the stalker: follows you everywhere, freezes while you look at her, closes in when you do not
 *   jorogumo   under the ground it hunts from the ceiling, and drops when close
 *   miko       the shrine maiden: when she sees you she screams the dead to her, and more come
 *   idol       sings; near her you are slowed (do not follow the voice)
 *   oni        huge and slow, and it hits like a car
 *   court      the Kurenai Court: living people with the checkpoint's rifles, who keep their distance and shoot
 *   empress    the Crimson Empress (the boss): calls bloomed to her, more when enraged
 *
 * MUJIN, the unmanned station, has its own (`mujinVariant`):
 *
 *   tall       the Tall Lady: walks, never runs; whoever she hears is hers until they stand in the shrine's salt
 *   crawler    the Rail Crawler: drags itself along the tracks on its arms, fast in a straight line
 *   shape      the White Shape: wriggles far off in the field and never comes closer; looking at it hurts (`mujin/runtime.ts`)
 *   sitter     the Bench Sitter: sits in the waiting room and whispers where the change is; shoot it and the station wakes
 *   master     the Stationmaster (the boss): walks platform 1, punches tickets; nothing stops him until the lamps are lit
 */
import type { ZombieDef } from '../config';
import type { ZombieType } from '../types';
import { zoneAt } from '../world/zones';
import { ZARYA_ZONES } from '../zarya/places';

export const VARIANTS = ['', 'commuter', 'bloomed', 'rooted', 'kuchisake', 'jorogumo', 'miko', 'idol', 'oni', 'court', 'empress', 'tall', 'crawler', 'shape', 'sitter', 'master', 'miner', 'lampeater', 'drowned', 'hag', 'slag', 'resident', 'follower', 'overseer', 'ryazhenye', 'svistok', 'kassirsha', 'gruzchik', 'dvornik', 'rybak', 'morzh', 'domovoi'] as const;
export type ZombieVariant = (typeof VARIANTS)[number];
/** MUJIN's own kinds (the station, `mujin/`), not the Sakura District's field file's. */
export const MUJIN_KINDS = ['tall', 'crawler', 'shape', 'sitter', 'master'] as const;
export type MujinKind = (typeof MUJIN_KINDS)[number];
/**
 * HIRASAKA's own kinds (the island and its mine, `hirasaka/`):
 *
 *   miner      still working the seam: swings at the coal, half deaf to anything but a sprint or a shot
 *   lampeater  thin as a pit prop, goes for your light: its hit blinds you for a few seconds
 *   drowned    lies under the water at the seawall until someone comes close, then rises
 *   hag        a Hag of the Slope: crawls on all fours, fast, and always knows where you are (the climb only)
 *   slag       a miner crusted in burning coal: slow, huge, heavy blows
 *   resident   the islanders as they were in 1974, the lane's and the school's
 *   follower   Mio: she follows you up the slope; nothing hurts her; every look back brings her closer
 *   overseer   Kurogane, the overseer (the boss): orders the miners back to work, and they come
 */
export const HIRASAKA_KINDS = ['miner', 'lampeater', 'drowned', 'hag', 'slag', 'resident', 'follower', 'overseer'] as const;
export type HirasakaKind = (typeof HIRASAKA_KINDS)[number];
/**
 * ZARYA's own kinds (the closed town, `zarya/`): the shatuny are townspeople woken wrong, and they keep the habits of
 * their jobs (`Zombie.variantStep`; their looks are `zombie/zarya.ts`):
 *
 *   ryazhenye  carol-singers in goat and bear masks, hung with rag-ribbons: they come as a pack (the square, the Palace)
 *   svistok    the security guard: the first time he sees someone he stops and blows his whistle, and every one of them
 *              within forty metres knows where that someone is (the store, the depot)
 *   kassirsha  the cashier: keeps her distance and throws shop weights (the market, the store)
 *   gruzchik   the loader, a crate held in front of him: it takes most of a blow from the front until something heavy
 *              breaks it, and he charges (the garages, the market)
 *   dvornik    the yard-keeper in his padded coat, with a steel ice-breaking bar: slow, hard to put down, a long reach
 *   rybak      the ice fisherman: casts his line and reels you in (the pond)
 *   morzh      the winter swimmer, a huge man in swimming trunks: a brute nothing ordinary staggers (the pond)
 *   domovoi    the house spirit: small, dark, unseen until you are close, and its first blow is the worst (the yards)
 */
export const ZARYA_KINDS = ['ryazhenye', 'svistok', 'kassirsha', 'gruzchik', 'dvornik', 'rybak', 'morzh', 'domovoi'] as const;
export type ZaryaKind = (typeof ZARYA_KINDS)[number];
/** The numbers of ZARYA's habits (`Zombie.variantStep`). */
export const ZARYA_HABITS = {
  /** The guard's whistle: how far it carries, and how long he stands blowing it. */
  whistle: { radius: 40, stop: 1 },
  /** The cashier's weights: thrown from `min` to `max` metres after `windup` seconds; `lock` seconds in, her aim is set. */
  throw_: { min: 6, max: 18, windup: 0.7, lock: 0.3, speed: 26, hit: 0.65, cooldown: 2.4 },
  /** The loader's crate (the share of a blow from the front it takes), and his charge: begun from `min` to `max` metres, `time` seconds of it at `speed` (enough to cover `max`). */
  crate: 0.8,
  charge: { min: 5, max: 12, speed: 7.5, windup: 0.7, time: 1.5, damageMul: 1.2, knock: 6, cooldown: 7 },
  /** The fisherman's line: cast from `min` to `max` metres after `windup` seconds; reels `speed` m/s for `reel` seconds. */
  cast: { min: 5, max: 14, windup: 0.8, reel: 1, speed: 5, stopAt: 1.8, cooldown: 7, yank: 20 },
  /** The house spirit: shows itself when someone is this close; its first blow is worth this many. */
  domovoi: { reveal: 6, first: 3 },
} as const;

interface VariantInfo {
  name: string;
  /** Multipliers on the base type's health, chase speed and damage; the body's size. */
  hp: number;
  speed: number;
  damage: number;
  scale: number;
  /** Changes to the definition itself. */
  def?: Partial<ZombieDef>;
}

export const VARIANT_INFO: Record<Exclude<ZombieVariant, ''>, VariantInfo> = {
  commuter: { name: 'Commuter', hp: 1, speed: 0.9, damage: 1, scale: 1 },
  bloomed: { name: 'Bloomed', hp: 1.1, speed: 1, damage: 1, scale: 1 },
  rooted: { name: 'Rooted', hp: 1, speed: 1.15, damage: 1.1, scale: 1 },
  kuchisake: { name: 'Kuchisake', hp: 9, speed: 1.1, damage: 2.6, scale: 1.05, def: { poise: 400, staggerTime: 0.3 } },
  jorogumo: { name: 'Jorogumo', hp: 1.6, speed: 1.25, damage: 1.4, scale: 1 },
  miko: { name: 'Miko', hp: 1.5, speed: 1, damage: 1, scale: 1 },
  idol: { name: 'Idol', hp: 2.2, speed: 0.85, damage: 1, scale: 1 },
  oni: { name: 'Oni', hp: 3, speed: 0.8, damage: 1.8, scale: 1.3, def: { poise: 260 } },
  court: {
    name: 'Kurenai Court',
    hp: 1.4,
    speed: 1.3,
    damage: 1,
    scale: 1,
    // a rifle: it fights from range (`Zombie.courtShot`), a round every second and a half or so
    def: { damage: 7, attackRange: 22, attackWindup: 0.45, attackStrike: 0.08, attackRecovery: 0.35, sightRange: 34, reward: 160, headshotBonus: 60 },
  },
  empress: { name: 'The Crimson Empress', hp: 1.2, speed: 1, damage: 1, scale: 1 },
  tall: { name: 'The Tall Lady', hp: 6, speed: 0.42, damage: 2.2, scale: 1.38, def: { poise: 500, staggerTime: 0.25, sightRange: 40 } },
  crawler: { name: 'Rail Crawler', hp: 0.8, speed: 1.45, damage: 1.2, scale: 1, def: { attackRange: 1.9 } },
  shape: { name: 'The White Shape', hp: 1.4, speed: 0, damage: 0, scale: 1.05, def: { poise: 9999, reward: 220, headshotBonus: 60 } },
  sitter: { name: 'The Bench Sitter', hp: 1.2, speed: 1.2, damage: 1.2, scale: 1 },
  master: { name: 'The Stationmaster', hp: 1, speed: 0.55, damage: 1, scale: 1 },
  miner: { name: 'Miner', hp: 1.25, speed: 0.92, damage: 1.15, scale: 1 },
  lampeater: { name: 'Lamp-eater', hp: 0.9, speed: 1.22, damage: 0.9, scale: 0.97, def: { attackRange: 1.7 } },
  drowned: { name: 'The Drowned', hp: 1.5, speed: 0.86, damage: 1.2, scale: 1.04 },
  hag: { name: 'Hag of the Slope', hp: 0.75, speed: 1.55, damage: 1.1, scale: 1, def: { attackRange: 1.9, sightRange: 90 } },
  slag: { name: 'Slag', hp: 2.4, speed: 0.78, damage: 1.9, scale: 1.32, def: { poise: 320 } },
  resident: { name: 'Islander', hp: 1, speed: 1, damage: 1, scale: 1 },
  follower: { name: 'Mio', hp: 40, speed: 1.05, damage: 2.4, scale: 1, def: { poise: 9999, staggerTime: 0.05, sightRange: 240, reward: 0, headshotBonus: 0, dropChance: 0 } },
  overseer: { name: 'Kurogane', hp: 1.25, speed: 1, damage: 1.1, scale: 1 },
  ryazhenye: { name: 'Ryazheny', hp: 0.8, speed: 1.1, damage: 1, scale: 1 },
  // a uniform, not riot plate: the guard takes a bullet like anyone
  svistok: { name: 'Svistok', hp: 0.7, speed: 1.05, damage: 0.9, scale: 1, def: { bodyMul: 1, headMul: 1, poise: 60 } },
  kassirsha: { name: 'Kassirsha', hp: 1, speed: 0.95, damage: 1, scale: 1 },
  gruzchik: { name: 'Gruzchik', hp: 0.9, speed: 1.05, damage: 1, scale: 1.04 },
  dvornik: { name: 'Dvornik', hp: 2, speed: 0.8, damage: 1.1, scale: 1.03, def: { attackRange: 2.75, attackWindup: 0.9 } },
  rybak: { name: 'Rybak', hp: 1.2, speed: 0.9, damage: 1, scale: 1 },
  // bare skin: nothing between him and a bullet but himself, and there is a lot of him
  morzh: { name: 'Morzh', hp: 4, speed: 0.85, damage: 1.5, scale: 1.2, def: { bodyMul: 1, headMul: 1, poise: 600, staggerTime: 0.45 } },
  domovoi: { name: 'Domovoi', hp: 0.5, speed: 1.15, damage: 1, scale: 0.75 },
};

/** The definition a variant of `base` fights with. */
export function variantDef(base: ZombieDef, v: ZombieVariant): ZombieDef {
  if (!v) return base;
  const i = VARIANT_INFO[v];
  return { ...base, ...i.def, name: i.name, hp: base.hp * i.hp, speedChase: base.speedChase * i.speed, damage: (i.def?.damage ?? base.damage) * i.damage, radius: base.radius * i.scale, height: base.height * i.scale, headRadius: base.headRadius * i.scale };
}

/** Which stock type each variant is built on (the director spawns the type; the variant decides the rest). */
export const VARIANT_BASE: Record<Exclude<ZombieVariant, ''>, ZombieType> = {
  commuter: 'shambler',
  bloomed: 'shambler',
  rooted: 'runner',
  kuchisake: 'runner',
  jorogumo: 'runner',
  miko: 'shambler',
  idol: 'shambler',
  oni: 'armored',
  court: 'shambler',
  empress: 'warden',
  tall: 'runner',
  crawler: 'runner',
  shape: 'shambler',
  sitter: 'shambler',
  master: 'warden',
  miner: 'shambler',
  lampeater: 'runner',
  drowned: 'shambler',
  hag: 'runner',
  slag: 'armored',
  resident: 'shambler',
  follower: 'shambler',
  overseer: 'warden',
  ryazhenye: 'runner',
  svistok: 'armored',
  kassirsha: 'shambler',
  gruzchik: 'armored',
  dvornik: 'armored',
  rybak: 'shambler',
  morzh: 'armored',
  domovoi: 'runner',
};

/** Where an infected is spawned, for `sakuraVariant`. */
export interface VariantSpot {
  /** The zone it is in (`world/layout/sakura/consts.ts` ZONES), 'under' underground, 'kisaragi'. */
  zone: string;
  /** On a raised floor (a storey, a container deck). */
  raised: boolean;
}

/**
 * The Sakura District: what an infected of `type` spawned at a spot becomes. The theatre and the freight yard are the
 * Court's; the underground has its commuters and the jorogumo; the canal park its rooted; the shrine its miko.
 */
export function sakuraVariant(type: ZombieType, at: VariantSpot, r: () => number): ZombieVariant {
  if (type === 'warden') return 'empress';
  const z = at.zone;
  if (at.raised && (z === 'freight' || z === 'theatre')) return 'court';
  if (type === 'armored') return r() < 0.45 ? 'oni' : '';
  if (z === 'under') return type === 'runner' ? (r() < 0.7 ? 'jorogumo' : '') : r() < 0.6 ? 'commuter' : '';
  if (z === 'kisaragi') return 'commuter';
  if (z === 'theatre' || z === 'freight') return type === 'shambler' && r() < 0.5 ? 'court' : r() < 0.2 ? 'bloomed' : '';
  if (type === 'runner') return z === 'canal' || z === 'school' ? (r() < 0.6 ? 'rooted' : '') : r() < 0.25 ? 'rooted' : '';
  if (z === 'canal' && r() < 0.12) return 'miko';
  if (z === 'station') return r() < 0.35 ? 'commuter' : r() < 0.2 ? 'bloomed' : '';
  if (z.startsWith('shotengai')) return r() < 0.06 ? 'idol' : r() < 0.25 ? 'bloomed' : r() < 0.2 ? 'commuter' : '';
  return r() < 0.2 ? 'bloomed' : '';
}

/**
 * MUJIN: what an infected of `type` spawned at (x, z) becomes. The Stationmaster is the boss; on the tracks the runners
 * crawl; the platforms and the station house are the commuters'. The Tall Lady, the White Shape and the Bench Sitter
 * are placed by the station itself (`mujin/director.ts`), never picked here.
 */
export function mujinVariant(type: ZombieType, x: number, z: number, r: () => number): ZombieVariant {
  if (type === 'warden') return 'master';
  const onTracks = Math.abs(z) < 3.6 && x > -46;
  if (type === 'runner') return onTracks || r() < 0.3 ? 'crawler' : '';
  if (type === 'armored') return '';
  const station = z > -23 && z < 9 && x > -33 && x < 33;
  return station ? (r() < 0.75 ? 'commuter' : '') : r() < 0.3 ? 'commuter' : '';
}

/**
 * HIRASAKA: what an infected of `type` spawned at (x, z) becomes. Kurogane is the boss. In the mine (east of x 110) the
 * miners and the lamp-eaters, and the slag; on the seawall the drowned; up the island the islanders. The hags and Mio
 * are placed by the island itself (`hirasaka/director.ts`), never picked here.
 */
export function hirasakaVariant(type: ZombieType, x: number, z: number, r: () => number): ZombieVariant {
  if (type === 'warden') return 'overseer';
  if (x > 110) {
    if (type === 'runner') return r() < 0.75 ? 'lampeater' : '';
    if (type === 'armored') return 'slag';
    return r() < 0.8 ? 'miner' : '';
  }
  if (type === 'armored') return r() < 0.6 ? 'slag' : '';
  if (type === 'runner') return r() < 0.5 ? 'resident' : '';
  if (z > 36) return r() < 0.6 ? 'drowned' : 'resident';
  return r() < 0.65 ? 'resident' : '';
}

/**
 * ZARYA: what an infected of `type` spawned at (x, z) becomes, by the zone it is in (`zarya/places.ts` ZARYA_ZONES).
 * Most stay plain townspeople in every zone; the bear is the story's own and is never picked here; nothing special in
 * the Institute or indoors (the shelter, the canteen, the Berloga hall), nor outside every zone.
 *
 *   square    the carol-singers' pack (most runners), a yard-keeper among the heavy ones
 *   dk        the carol-singers' pack
 *   store     the guard, a cashier or two
 *   rynok     cashiers, loaders
 *   dvor      the yard-keeper, and the house spirit
 *   garages   loaders
 *   depot     the guard
 *   banya     fishermen, the winter swimmers
 */
export function zaryaVariant(type: ZombieType, x: number, z: number, r: () => number): ZombieVariant {
  if (type === 'warden') return '';
  switch (zoneAt(ZARYA_ZONES, x, z)?.id) {
    case 'square':
      return type === 'runner' ? (r() < 0.65 ? 'ryazhenye' : '') : type === 'armored' ? (r() < 0.5 ? 'dvornik' : '') : '';
    case 'dk':
      return type === 'runner' && r() < 0.75 ? 'ryazhenye' : '';
    case 'store':
      return type === 'armored' ? (r() < 0.55 ? 'svistok' : '') : type === 'shambler' ? (r() < 0.2 ? 'kassirsha' : '') : '';
    case 'rynok':
      return type === 'armored' ? (r() < 0.6 ? 'gruzchik' : '') : type === 'shambler' ? (r() < 0.25 ? 'kassirsha' : '') : '';
    case 'dvor':
      return type === 'armored' ? (r() < 0.6 ? 'dvornik' : '') : type === 'runner' ? (r() < 0.4 ? 'domovoi' : '') : '';
    case 'garages':
      return type === 'armored' && r() < 0.75 ? 'gruzchik' : '';
    case 'depot':
      return type === 'armored' && r() < 0.6 ? 'svistok' : '';
    case 'banya':
      return type === 'armored' ? (r() < 0.5 ? 'morzh' : '') : type === 'shambler' ? (r() < 0.28 ? 'rybak' : '') : '';
    default:
      return '';
  }
}
