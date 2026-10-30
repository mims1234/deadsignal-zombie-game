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

export const VARIANTS = ['', 'commuter', 'bloomed', 'rooted', 'kuchisake', 'jorogumo', 'miko', 'idol', 'oni', 'court', 'empress', 'tall', 'crawler', 'shape', 'sitter', 'master'] as const;
export type ZombieVariant = (typeof VARIANTS)[number];
/** MUJIN's own kinds (the station, `mujin/`), not the Sakura District's field file's. */
export const MUJIN_KINDS = ['tall', 'crawler', 'shape', 'sitter', 'master'] as const;
export type MujinKind = (typeof MUJIN_KINDS)[number];

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
