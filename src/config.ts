/**
 * Central balance and tuning configuration for Zombies GenXmims.
 * Every gameplay number lives here so the game can be balanced in one place.
 * Angles are in degrees unless the field name says otherwise; distances in metres; times in seconds.
 */
import type { QualityLevel, Region, Settings, WeaponId, ZombieType } from './types';
import type { MapId } from './world/layout/data';
import type { SoundId } from './audio/ids';

// ---------------------------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------------------------

/** Multipliers / additions a weapon upgrade tier applies on top of the base weapon stats. */
export interface UpgradeTier {
  /** Short label shown in the UI, e.g. "MK II". */
  label: string;
  /** Description of what the tier does, shown at the upgrade station. */
  description: string;
  cost: number;
  damageMul: number;
  magSizeAdd: number;
  reserveMaxAdd: number;
  fireRateMul: number;
  recoilMul: number;
  spreadMul: number;
  reloadMul: number;
  pelletsAdd: number;
  headshotMulAdd: number;
  /** 0..1 fraction of a zombie's body armour that this weapon ignores. */
  armorPierce: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  short: string;
  /** Fully automatic (hold to fire) or semi-automatic (one shot per click). */
  auto: boolean;
  /** Damage per projectile before falloff / multipliers. */
  damage: number;
  pellets: number;
  headshotMul: number;
  /** Seconds between shots. */
  fireInterval: number;
  magSize: number;
  reserveStart: number;
  reserveMax: number;
  reloadStyle: 'magazine' | 'shell';
  /** Magazine reload: seconds when a round is still chambered / when the gun is dry. */
  reloadTactical: number;
  reloadEmpty: number;
  /** Fraction (0..1) of the reload duration at which ammunition is transferred into the magazine. */
  reloadTransferAt: number;
  /** Shell reload timings (shotgun): start, per shell, end. */
  shellStart: number;
  shellEach: number;
  shellEnd: number;
  /** Chamber the next round after the first shell when the gun was dry. */
  shellPump: number;
  /** Cone half-angles in degrees. */
  spreadHip: number;
  spreadAds: number;
  /** Extra spread while moving at full walking speed / in the air. */
  spreadMove: number;
  spreadAir: number;
  /** Extra spread added per shot (bloom) and its recovery per second. */
  spreadPerShot: number;
  spreadMax: number;
  spreadRecover: number;
  /** Camera kick per shot in degrees. */
  recoilPitch: number;
  recoilYaw: number;
  /** Fraction of the kick that decays per second (higher = faster recovery). */
  recoilRecover: number;
  /** Damage falloff: full damage up to `falloffStart`, lerping to `minMul` at `falloffEnd`, 0 beyond `maxRange`. */
  falloffStart: number;
  falloffEnd: number;
  minMul: number;
  maxRange: number;
  /** FOV multiplier when aiming down sights (smaller = more zoom) and the transition time. */
  adsFovMul: number;
  adsTime: number;
  /** Movement speed multiplier while this weapon is equipped. */
  moveMul: number;
  /** Radius within which the shot alerts zombies. */
  noise: number;
  /** Time to raise the weapon after switching. */
  drawTime: number;
  /** Tracer colours by upgrade tier (hex). */
  tracerColors: [number, number, number];
  /** Price to (re)buy the weapon at the buy station (0 = not sold). */
  price: number;
  /** Price of a full ammo refill at the buy station. */
  ammoPrice: number;
  tiers: [UpgradeTier, UpgradeTier];
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: {
    id: 'rifle',
    name: 'KR-16 Assault Rifle',
    short: 'KR-16',
    auto: true,
    damage: 26,
    pellets: 1,
    headshotMul: 2.2,
    fireInterval: 60 / 700,
    magSize: 30,
    reserveStart: 120,
    reserveMax: 240,
    reloadStyle: 'magazine',
    reloadTactical: 2.05,
    reloadEmpty: 2.6,
    reloadTransferAt: 0.72,
    shellStart: 0,
    shellEach: 0,
    shellEnd: 0,
    shellPump: 0,
    spreadHip: 2.4,
    spreadAds: 0.3,
    spreadMove: 1.6,
    spreadAir: 3.0,
    spreadPerShot: 0.22,
    spreadMax: 2.2,
    spreadRecover: 5.5,
    recoilPitch: 0.62,
    recoilYaw: 0.3,
    recoilRecover: 7.5,
    falloffStart: 32,
    falloffEnd: 85,
    minMul: 0.6,
    maxRange: 160,
    adsFovMul: 0.68,
    adsTime: 0.2,
    moveMul: 1.0,
    noise: 42,
    drawTime: 0.42,
    tracerColors: [0xffe3a3, 0xffb347, 0x6ff0ff],
    price: 700,
    ammoPrice: 250,
    tiers: [
      {
        label: 'MK II',
        description: 'Extended feed: +20% damage, 42-round magazine, faster reload.',
        cost: 1500,
        damageMul: 1.2,
        magSizeAdd: 12,
        reserveMaxAdd: 60,
        fireRateMul: 1.0,
        recoilMul: 0.92,
        spreadMul: 0.95,
        reloadMul: 0.9,
        pelletsAdd: 0,
        headshotMulAdd: 0,
        armorPierce: 0,
      },
      {
        label: 'MK III',
        description: 'Armour-piercing rounds: +45% damage, +10% fire rate, ignores 35% of armour, low recoil.',
        cost: 3200,
        damageMul: 1.45,
        magSizeAdd: 20,
        reserveMaxAdd: 90,
        fireRateMul: 1.1,
        recoilMul: 0.75,
        spreadMul: 0.85,
        reloadMul: 0.82,
        pelletsAdd: 0,
        headshotMulAdd: 0.2,
        armorPierce: 0.35,
      },
    ],
  },
  pistol: {
    id: 'pistol',
    name: 'VX-9 Service Pistol',
    short: 'VX-9',
    auto: false,
    damage: 36,
    pellets: 1,
    headshotMul: 2.4,
    fireInterval: 0.13,
    magSize: 13,
    reserveStart: 78,
    reserveMax: 130,
    reloadStyle: 'magazine',
    reloadTactical: 1.45,
    reloadEmpty: 1.8,
    reloadTransferAt: 0.68,
    shellStart: 0,
    shellEach: 0,
    shellEnd: 0,
    shellPump: 0,
    spreadHip: 1.5,
    spreadAds: 0.22,
    spreadMove: 1.0,
    spreadAir: 2.0,
    spreadPerShot: 0.5,
    spreadMax: 2.0,
    spreadRecover: 6.5,
    recoilPitch: 1.25,
    recoilYaw: 0.35,
    recoilRecover: 9.0,
    falloffStart: 18,
    falloffEnd: 55,
    minMul: 0.5,
    maxRange: 110,
    adsFovMul: 0.82,
    adsTime: 0.14,
    moveMul: 1.05,
    noise: 30,
    drawTime: 0.3,
    tracerColors: [0xfff0c4, 0xffb347, 0x6ff0ff],
    price: 200,
    ammoPrice: 150,
    tiers: [
      {
        label: 'MK II',
        description: 'Match barrel: +30% damage, 17-round magazine.',
        cost: 900,
        damageMul: 1.3,
        magSizeAdd: 4,
        reserveMaxAdd: 34,
        fireRateMul: 1.0,
        recoilMul: 0.9,
        spreadMul: 0.9,
        reloadMul: 0.92,
        pelletsAdd: 0,
        headshotMulAdd: 0,
        armorPierce: 0,
      },
      {
        label: 'MK III',
        description: 'Hand-cannon load: +70% damage, +25% fire rate, +0.4 headshot multiplier, ignores 25% of armour.',
        cost: 2000,
        damageMul: 1.7,
        magSizeAdd: 8,
        reserveMaxAdd: 60,
        fireRateMul: 1.25,
        recoilMul: 0.85,
        spreadMul: 0.8,
        reloadMul: 0.85,
        pelletsAdd: 0,
        headshotMulAdd: 0.4,
        armorPierce: 0.25,
      },
    ],
  },
  shotgun: {
    id: 'shotgun',
    name: 'PS-12 Pump Shotgun',
    short: 'PS-12',
    auto: false,
    damage: 13,
    pellets: 8,
    headshotMul: 1.5,
    fireInterval: 0.78,
    magSize: 6,
    reserveStart: 30,
    reserveMax: 48,
    reloadStyle: 'shell',
    reloadTactical: 0,
    reloadEmpty: 0,
    reloadTransferAt: 0.6,
    shellStart: 0.5,
    shellEach: 0.44,
    shellEnd: 0.4,
    shellPump: 0.5,
    spreadHip: 4.4,
    spreadAds: 3.0,
    spreadMove: 1.2,
    spreadAir: 2.0,
    spreadPerShot: 0.0,
    spreadMax: 4.4,
    spreadRecover: 6,
    recoilPitch: 4.2,
    recoilYaw: 0.8,
    recoilRecover: 6.0,
    falloffStart: 5,
    falloffEnd: 22,
    minMul: 0.18,
    maxRange: 45,
    adsFovMul: 0.85,
    adsTime: 0.2,
    moveMul: 0.96,
    noise: 48,
    drawTime: 0.5,
    tracerColors: [0xffd9a0, 0xffa030, 0x6ff0ff],
    price: 1200,
    ammoPrice: 250,
    tiers: [
      {
        label: 'MK II',
        description: 'Choke and load: +25% damage, 10 pellets per shell, 8-shell tube.',
        cost: 1400,
        damageMul: 1.25,
        magSizeAdd: 2,
        reserveMaxAdd: 16,
        fireRateMul: 1.0,
        recoilMul: 0.95,
        spreadMul: 0.92,
        reloadMul: 0.92,
        pelletsAdd: 2,
        headshotMulAdd: 0,
        armorPierce: 0,
      },
      {
        label: 'MK III',
        description: 'Slug-wad specialty shells: +50% damage, +20% fire rate, tighter spread, ignores 30% of armour.',
        cost: 3000,
        damageMul: 1.5,
        magSizeAdd: 4,
        reserveMaxAdd: 28,
        fireRateMul: 1.2,
        recoilMul: 0.85,
        spreadMul: 0.75,
        reloadMul: 0.8,
        pelletsAdd: 2,
        headshotMulAdd: 0.15,
        armorPierce: 0.3,
      },
    ],
  },
  rpg: {
    id: 'rpg',
    name: 'HX-7 Rocket Launcher',
    short: 'HX-7',
    auto: false,
    /** Centre-of-blast damage; the rocket itself is handled by `ROCKET`. */
    damage: 340,
    pellets: 1,
    headshotMul: 1,
    fireInterval: 0.9,
    magSize: 1,
    reserveStart: 4,
    reserveMax: 6,
    reloadStyle: 'magazine',
    reloadTactical: 2.4,
    reloadEmpty: 2.4,
    reloadTransferAt: 0.7,
    shellStart: 0,
    shellEach: 0,
    shellEnd: 0,
    shellPump: 0,
    spreadHip: 1.2,
    spreadAds: 0.15,
    spreadMove: 1.4,
    spreadAir: 2.5,
    spreadPerShot: 0,
    spreadMax: 1.2,
    spreadRecover: 4,
    recoilPitch: 5.5,
    recoilYaw: 1.2,
    recoilRecover: 4.5,
    falloffStart: 999,
    falloffEnd: 1000,
    minMul: 1,
    maxRange: 140,
    adsFovMul: 0.8,
    adsTime: 0.28,
    moveMul: 0.9,
    noise: 60,
    drawTime: 0.7,
    tracerColors: [0xffc070, 0xff9030, 0x6ff0ff],
    /** Only found in mystery boxes. */
    price: 0,
    ammoPrice: 450,
    tiers: [
      {
        label: 'MK II',
        description: 'Tandem warhead: +30% blast damage, two-rocket rack, faster reload.',
        cost: 1800,
        damageMul: 1.3,
        magSizeAdd: 1,
        reserveMaxAdd: 2,
        fireRateMul: 1.0,
        recoilMul: 0.9,
        spreadMul: 0.9,
        reloadMul: 0.85,
        pelletsAdd: 0,
        headshotMulAdd: 0,
        armorPierce: 0,
      },
      {
        label: 'MK III',
        description: 'Thermobaric fill: +70% blast damage, three-rocket rack, quick reload.',
        cost: 3600,
        damageMul: 1.7,
        magSizeAdd: 2,
        reserveMaxAdd: 4,
        fireRateMul: 1.15,
        recoilMul: 0.8,
        spreadMul: 0.8,
        reloadMul: 0.7,
        pelletsAdd: 0,
        headshotMulAdd: 0,
        armorPierce: 0,
      },
    ],
  },
  // ---- the Sakura District's relics (Kisaragi Station, after the Thousand Lanterns): never sold, never in a box ----
  hanafubuki: {
    id: 'hanafubuki',
    name: 'Hanafubuki Petal Cannon',
    short: 'HANAFUBUKI',
    auto: true,
    damage: 24,
    pellets: 1,
    headshotMul: 2,
    fireInterval: 60 / 1500,
    magSize: 300,
    reserveStart: 600,
    reserveMax: 900,
    reloadStyle: 'magazine',
    reloadTactical: 6,
    reloadEmpty: 6.2,
    reloadTransferAt: 0.8,
    shellStart: 0,
    shellEach: 0,
    shellEnd: 0,
    shellPump: 0,
    spreadHip: 3.2,
    spreadAds: 1.4,
    spreadMove: 1.2,
    spreadAir: 3,
    spreadPerShot: 0.05,
    spreadMax: 1.6,
    spreadRecover: 6,
    recoilPitch: 0.22,
    recoilYaw: 0.18,
    recoilRecover: 9,
    falloffStart: 26,
    falloffEnd: 70,
    minMul: 0.6,
    maxRange: 120,
    adsFovMul: 0.82,
    adsTime: 0.3,
    moveMul: 0.86,
    noise: 50,
    drawTime: 0.9,
    tracerColors: [0xffa8cc, 0xff6aa8, 0xff2a6a],
    price: 0,
    ammoPrice: 900,
    tiers: [
      {
        label: 'SHIDARE',
        description: 'Weeping-cherry belt: +25% damage, 360-round belt, quicker reload.',
        cost: 2600,
        damageMul: 1.25,
        magSizeAdd: 60,
        reserveMaxAdd: 180,
        fireRateMul: 1.0,
        recoilMul: 0.85,
        spreadMul: 0.9,
        reloadMul: 0.85,
        pelletsAdd: 0,
        headshotMulAdd: 0,
        armorPierce: 0.3,
      },
      {
        label: 'YOZAKURA',
        description: 'Night-blossom rounds: +55% damage, 400-round belt, faster spin, ignores 30% of armour.',
        cost: 4800,
        damageMul: 1.55,
        magSizeAdd: 100,
        reserveMaxAdd: 300,
        fireRateMul: 1.12,
        recoilMul: 0.85,
        spreadMul: 0.9,
        reloadMul: 0.75,
        pelletsAdd: 0,
        headshotMulAdd: 0,
        armorPierce: 0.3,
      },
    ],
  },
  raijin: {
    id: 'raijin',
    name: "Raijin's Drum",
    short: 'RAIJIN',
    auto: false,
    /** The bolt's damage at its first target; the shockwave and each jump of the chain take a share (`RAIJIN`). */
    damage: 900,
    pellets: 1,
    headshotMul: 1,
    fireInterval: 1.1,
    magSize: 2,
    reserveStart: 8,
    reserveMax: 12,
    reloadStyle: 'magazine',
    reloadTactical: 3.2,
    reloadEmpty: 3.4,
    reloadTransferAt: 0.7,
    shellStart: 0,
    shellEach: 0,
    shellEnd: 0,
    shellPump: 0,
    spreadHip: 0.6,
    spreadAds: 0.1,
    spreadMove: 0.6,
    spreadAir: 1.2,
    spreadPerShot: 0,
    spreadMax: 0.6,
    spreadRecover: 4,
    recoilPitch: 6,
    recoilYaw: 1.4,
    recoilRecover: 4,
    falloffStart: 999,
    falloffEnd: 1000,
    minMul: 1,
    maxRange: 70,
    adsFovMul: 0.85,
    adsTime: 0.28,
    moveMul: 0.9,
    noise: 70,
    drawTime: 0.8,
    tracerColors: [0x9fd8ff, 0xc8b0ff, 0xfff0a0],
    price: 0,
    ammoPrice: 1200,
    tiers: [
      {
        label: 'FUJIN',
        description: 'The wind god joins in: +30% damage, a third strike in the drum, longer chains.',
        cost: 3000,
        damageMul: 1.3,
        magSizeAdd: 1,
        reserveMaxAdd: 3,
        fireRateMul: 1.0,
        recoilMul: 0.85,
        spreadMul: 0.9,
        reloadMul: 0.85,
        pelletsAdd: 0,
        headshotMulAdd: 0,
        armorPierce: 0.3,
      },
      {
        label: 'KAMINARI',
        description: 'The full storm: +60% damage, four strikes, the chain leaps further and faster.',
        cost: 5200,
        damageMul: 1.6,
        magSizeAdd: 2,
        reserveMaxAdd: 6,
        fireRateMul: 1.15,
        recoilMul: 0.85,
        spreadMul: 0.9,
        reloadMul: 0.7,
        pelletsAdd: 0,
        headshotMulAdd: 0,
        armorPierce: 0.3,
      },
    ],
  },
};

export const WEAPON_IDS: WeaponId[] = ['rifle', 'pistol', 'shotgun', 'rpg', 'hanafubuki', 'raijin'];

/** Raijin's Drum: a shockwave in front of you, and a bolt that leaps from infected to infected. */
export const RAIJIN = {
  /** The shockwave: reach (m), cone half-angle (rad), share of the weapon's damage, fling. */
  waveRange: 9,
  waveCone: 0.7,
  waveShare: 0.35,
  wavePush: 9,
  waveLift: 3.5,
  /** The chain: jumps (more with each tier), reach of a jump (m), share of the damage each jump keeps. */
  jumps: [6, 8, 10],
  jumpRange: [8, 9, 11],
  jumpKeep: 0.8,
};

/** The HX-7's rocket: flies straight and fast, bursts on whatever it touches. Damage comes from the weapon. */
export const ROCKET = {
  speed: 42,
  /** A little drop so long shots arc. */
  gravity: 2.5,
  /** Detonates by itself after this long (out of the map, into the sky). */
  life: 4,
  radius: 0.08,
  blastRadius: 6.5,
  /** Edge damage as a share of the centre damage. */
  edgeShare: 0.15,
  selfMul: 0.45,
  knockback: 12,
  /** Distance from the camera before it can hit anything (no point-blank surprises). */
  armDistance: 1.2,
} as const;

/**
 * How hard a killing blow throws the body (m/s along the shot, and up). Explosions scale with distance from the blast.
 */
export const RAGDOLL = {
  push: { rifle: 2.4, pistol: 2.0, shotgun: 6.5, rpg: 0, hanafubuki: 1.6, raijin: 0, ally: 1.8 } as Record<WeaponId | 'ally', number>,
  lift: { rifle: 0.8, pistol: 0.7, shotgun: 2.6, rpg: 0, hanafubuki: 0.4, raijin: 0, ally: 0.6 } as Record<WeaponId | 'ally', number>,
  /** Explosions: speed at the centre, falling off to `blastEdge` at the edge; lift is `blastLift` times that. */
  blastCenter: 15,
  blastEdge: 5,
  blastLift: 0.6,
  gravity: 16,
  /** Ground bounce: share of vertical speed kept, and sliding friction per second. */
  bounce: 0.28,
  friction: 5.5,
  /** Tumble speed (rad/s) per m/s of launch speed. */
  spin: 0.75,
  /** Player hit by their own (or a soldier's) blast while alive: shove and hop. */
  playerBlastPush: 9,
  playerBlastHop: 4.5,
} as const;

export const GRENADE = {
  start: 2,
  max: 4,
  price: 200,
  /** Grenades granted per purchase. */
  purchaseAmount: 2,
  fuse: 2.4,
  throwSpeed: 15,
  throwUp: 0.22,
  radius: 0.09,
  restitution: 0.38,
  friction: 0.7,
  gravity: 17,
  blastRadius: 7.5,
  /** Damage at the centre; falls off linearly to `edgeDamage` at the edge. */
  centerDamage: 260,
  edgeDamage: 25,
  /** Multiplier applied when solid geometry blocks the line to the target. */
  coverMul: 0.0,
  selfMul: 0.4,
  throwDelay: 0.32,
  cooldown: 0.9,
  knockback: 8,
} as const;

// ---------------------------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------------------------

export const PLAYER = {
  radius: 0.34,
  heightStand: 1.8,
  heightCrouch: 1.25,
  eyeStand: 1.68,
  eyeCrouch: 1.14,
  walkSpeed: 4.3,
  sprintSpeed: 6.9,
  crouchSpeed: 2.3,
  adsSpeedMul: 0.62,
  jumpSpeed: 6.4,
  gravity: 21,
  groundAccel: 48,
  airAccel: 9,
  groundFriction: 11,
  stepHeight: 0.42,
  /** Vertical transition speed between standing and crouching eye height (m/s). */
  crouchTransition: 6.5,
  /** Player's max fall speed. */
  terminalVelocity: 40,
  maxHealth: 100,
  healthRegenDelay: 6.5,
  healthRegenRate: 14,
  maxArmor: 100,
  plateArmor: 50,
  maxPlates: 3,
  startPlates: 2,
  plateApplyTime: 2.1,
  maxStamina: 100,
  staminaDrain: 21,
  staminaRegen: 17,
  staminaRegenDelay: 0.9,
  /** After fully exhausting stamina the player must regain this much before sprinting again. */
  staminaResumeAt: 18,
  /** Seconds of sprint that ends when you fire / aim. */
  meleeReach: 0,
  /** Fraction of incoming toxin damage that armour absorbs (toxin ignores armour by design). */
  toxinArmorAbsorb: 0,
  startCash: 600,
  startGrenades: 2,
  interactReach: 2.6,
  /** Maximum simulation step for a single physics sub-step. */
  maxSubstep: 1 / 60,
} as const;

// ---------------------------------------------------------------------------------------------
// Zombies
// ---------------------------------------------------------------------------------------------

export interface ZombieDef {
  type: ZombieType;
  name: string;
  hp: number;
  /** Wander / idle-alert walking speed. */
  speedWalk: number;
  /** Chasing speed (each zombie gets +-speedVariance random scaling). */
  speedChase: number;
  speedVariance: number;
  radius: number;
  height: number;
  headRadius: number;
  damage: number;
  attackRange: number;
  attackWindup: number;
  attackStrike: number;
  attackRecovery: number;
  /** Damage multiplier applied to non-head hits (body armour). */
  bodyMul: number;
  /** Multiplier applied to headshots on top of the weapon's own headshot multiplier. */
  headMul: number;
  /** Damage needed within the recent window to stagger. */
  poise: number;
  staggerTime: number;
  reward: number;
  headshotBonus: number;
  /** Radius at which this zombie notices the player with line of sight. */
  sightRange: number;
  /** Turn rate in radians/second. */
  turnRate: number;
  /** Chance a kill drops a supply pickup (scaled by region). */
  dropChance: number;
  /** Bosses: the voice of their roars and alert cry (default the Warden's roar; the Matron shrieks). */
  roar?: SoundId;
}

export const ZOMBIES: Record<ZombieType, ZombieDef> = {
  shambler: {
    type: 'shambler',
    name: 'Shambler',
    hp: 100,
    speedWalk: 0.9,
    speedChase: 1.95,
    speedVariance: 0.18,
    radius: 0.32,
    height: 1.8,
    headRadius: 0.17,
    damage: 14,
    attackRange: 1.55,
    attackWindup: 0.6,
    attackStrike: 0.15,
    attackRecovery: 0.6,
    bodyMul: 1,
    headMul: 1,
    poise: 34,
    staggerTime: 0.55,
    reward: 55,
    headshotBonus: 20,
    sightRange: 24,
    turnRate: 4.2,
    dropChance: 0.05,
  },
  runner: {
    type: 'runner',
    name: 'Runner',
    hp: 70,
    speedWalk: 1.3,
    speedChase: 4.7,
    speedVariance: 0.12,
    radius: 0.3,
    height: 1.75,
    headRadius: 0.16,
    damage: 9,
    attackRange: 1.65,
    attackWindup: 0.28,
    attackStrike: 0.12,
    attackRecovery: 0.42,
    bodyMul: 1,
    headMul: 1,
    poise: 24,
    staggerTime: 0.4,
    reward: 85,
    headshotBonus: 25,
    sightRange: 30,
    turnRate: 7.5,
    dropChance: 0.07,
  },
  armored: {
    type: 'armored',
    name: 'Armored Infected',
    hp: 260,
    speedWalk: 0.85,
    speedChase: 1.9,
    speedVariance: 0.1,
    radius: 0.38,
    height: 1.95,
    headRadius: 0.2,
    damage: 22,
    attackRange: 1.75,
    attackWindup: 0.75,
    attackStrike: 0.18,
    attackRecovery: 0.85,
    bodyMul: 0.5,
    headMul: 0.75,
    poise: 95,
    staggerTime: 0.6,
    reward: 160,
    headshotBonus: 40,
    sightRange: 26,
    turnRate: 3.2,
    dropChance: 0.14,
  },
  warden: {
    type: 'warden',
    name: 'THE WARDEN',
    hp: 2400,
    speedWalk: 1.2,
    speedChase: 2.8,
    speedVariance: 0,
    radius: 0.52,
    height: 2.55,
    headRadius: 0.27,
    damage: 42,
    attackRange: 2.2,
    attackWindup: 0.9,
    attackStrike: 0.2,
    attackRecovery: 0.9,
    bodyMul: 0.5,
    headMul: 0.9,
    poise: 500,
    staggerTime: 0.9,
    reward: 400,
    headshotBonus: 150,
    sightRange: 40,
    turnRate: 2.6,
    dropChance: 0,
  },
};

export const WARDEN = {
  /** Below this health fraction the Warden becomes enraged (faster). */
  rageAt: 0.5,
  rageSpeedMul: 1.35,
  slamRange: 5.5,
  slamRadius: 5.0,
  slamDamage: 32,
  slamWindup: 1.1,
  slamRecovery: 0.9,
  slamCooldown: 9,
  chargeMinRange: 8,
  chargeMaxRange: 22,
  chargeSpeed: 7.2,
  chargeDuration: 1.5,
  chargeWindup: 0.9,
  chargeCooldown: 13,
  chargeDamage: 38,
} as const;

/** Global tuning for how zombies sense, move, and attack. */
export const ZOMBIE_AI = {
  /** Distance within which any zombie notices a sprinting/firing player regardless of sight. */
  footstepHearing: 9,
  sprintHearing: 16,
  /** Attack hit-check cone half angle (degrees). */
  attackCone: 75,
  /** Vertical reach: attacks miss if the player is higher than this above the zombie's feet. */
  attackVerticalReach: 2.1,
  separationRadius: 0.95,
  separationStrength: 3.2,
  /** Flow-field recompute period and movement threshold. */
  flowInterval: 0.35,
  flowMoveThreshold: 1.0,
  /** How long a zombie keeps chasing after losing awareness (seconds). */
  loseInterest: 14,
  /** Ambient wander radius for idle zombies. */
  wanderRadius: 3.5,
  corpseLifetime: 14,
  maxCorpses: 14,
  /** Movement sub-stepping for zombies (max distance per collision step). */
  maxStepDistance: 0.25,
} as const;

// ---------------------------------------------------------------------------------------------
// Threat regions, spawning
// ---------------------------------------------------------------------------------------------

export interface RegionDef {
  id: Region;
  name: string;
  shortName: string;
  color: string;
  /** Multiplier applied to cash rewards from kills. */
  rewardMul: number;
  /** Seconds between director spawns while the player is here. */
  spawnInterval: number;
  /** Active enemy soft cap while the player is here (scaled by mission phase and quality). */
  activeCap: number;
  /** Spawn composition weights. */
  mix: Record<'shambler' | 'runner' | 'armored', number>;
  /** Ambient (pre-placed idle) population to seed the region with at mission start. */
  ambient: number;
  /** Chance multiplier for kill drops. */
  dropMul: number;
  /** Extra damage taken multiplier (danger scaling). */
  damageMul: number;
}

export const REGIONS: Record<Region, RegionDef> = {
  low: {
    id: 'low',
    name: 'LOW THREAT',
    shortName: 'LOW',
    color: '#8fd18a',
    rewardMul: 1.0,
    spawnInterval: 6.0,
    activeCap: 12,
    mix: { shambler: 0.86, runner: 0.14, armored: 0 },
    ambient: 9,
    dropMul: 1,
    damageMul: 1,
  },
  medium: {
    id: 'medium',
    name: 'MEDIUM THREAT',
    shortName: 'MED',
    color: '#f2c14e',
    rewardMul: 1.35,
    spawnInterval: 4.3,
    activeCap: 18,
    mix: { shambler: 0.52, runner: 0.33, armored: 0.15 },
    ambient: 15,
    dropMul: 1.25,
    damageMul: 1,
  },
  high: {
    id: 'high',
    name: 'HIGH THREAT',
    shortName: 'HIGH',
    color: '#ff5a4d',
    rewardMul: 1.8,
    spawnInterval: 2.9,
    activeCap: 26,
    mix: { shambler: 0.28, runner: 0.38, armored: 0.34 },
    ambient: 19,
    dropMul: 1.5,
    damageMul: 1.1,
  },
};

export const SPAWN = {
  /** Never spawn closer than this to the player (straight-line). */
  minDistance: 24,
  /** Prefer spawn points within this ring. */
  maxDistance: 68,
  /** Spawn points inside the player's forward view cone AND with line of sight are rejected. */
  hiddenFromPlayer: true,
  /** Global hard cap on live (non-corpse) enemies, before quality scaling. */
  hardCap: 40,
  /** Extra ambient zombies wake up when the player is this close with line of sight. */
  ambientWakeRange: 20,
  /** Per-phase activeCap multiplier gain. */
  phaseCapGain: 0.12,
  /** Per-phase spawn interval multiplier (interval *= this ^ phase). */
  phaseIntervalMul: 0.9,
  /** Per-phase shift of composition toward runners / armoured (added weight). */
  phaseRunnerGain: 0.05,
  phaseArmoredGain: 0.04,
  /** Spawning pauses when this many enemies are already alerted and near the player. */
  nearbyLimit: 10,
  nearbyRadius: 18,
} as const;

// ---------------------------------------------------------------------------------------------
// Economy, loot
// ---------------------------------------------------------------------------------------------

export const ECONOMY = {
  platePrice: 350,
  /** Cash for a headshot kill bonus is per-zombie; this multiplies all kill cash globally. */
  killCashMul: 0.45,
  crates: {
    low: { cash: [70, 140], mags: [1, 1.8], plateChance: 0.25, grenadeChance: 0.15 },
    medium: { cash: [130, 240], mags: [1.4, 2.4], plateChance: 0.4, grenadeChance: 0.3 },
    high: { cash: [240, 400], mags: [1.8, 3.0], plateChance: 0.6, grenadeChance: 0.4 },
  } as Record<Region, { cash: [number, number]; mags: [number, number]; plateChance: number; grenadeChance: number }>,
  /** Ground pickups dropped by zombies. */
  pickupLifetime: 40,
  ammoPickupMags: 1.0,
  pickupRadius: 1.4,
  maxPickups: 10,
  crateOpenTime: 0.8,
  stationRange: 3.4,
} as const;

/**
 * Mystery boxes (where the supply caches were): opening one pays its region's cash and spins a reel that lands on
 * ammunition, grenades or a gun. The prize floats over the box; take it with E or leave it and it sinks back.
 */
export const MYSTERY_BOX = {
  /** Reel spin, and how long the prize waits to be taken. */
  spin: 2.6,
  offer: 12,
  /** Chances by region (the rest is ammunition); `rpgMul` scales the HX-7's weight among the guns. */
  odds: {
    low: { weapon: 0.32, grenades: 0.26, rpgMul: 0.6 },
    medium: { weapon: 0.42, grenades: 0.24, rpgMul: 1 },
    high: { weapon: 0.52, grenades: 0.2, rpgMul: 1.6 },
  } as Record<Region, { weapon: number; grenades: number; rpgMul: number }>,
  /** Relative weights of the guns a box can hold (only ones you are not carrying are offered). */
  /** The Sakura District's relics are never in its boxes (weight 0): there they are earned at Kisaragi. */
  guns: { rifle: 3, pistol: 2, shotgun: 3, rpg: 2, hanafubuki: 0, raijin: 0 } as Record<WeaponId, number>,
  /** Maps whose boxes hold the relics too, and how often (MUJIN: the station they came through). */
  relicMaps: ['mujin'] as readonly MapId[],
  relics: { hanafubuki: 1, raijin: 1 } as Partial<Record<WeaponId, number>>,
  grenades: 2,
  /** Magazines of reserve for each carried weapon. */
  ammoMags: 3,
} as const;

// ---------------------------------------------------------------------------------------------
// Card recovery (optional mode) and free roam
// ---------------------------------------------------------------------------------------------

export const CARD_MODE = {
  /** Distance at which a carrier's signal is identified. */
  revealRange: 32,
  /** Seconds a knocked-down carrier stays down before it gets back up. */
  downTime: 24,
  /** Health fraction it gets back up with. */
  reviveHp: 0.45,
  /** Hold time and reach for administering the counter-agent. */
  cureHold: 1.6,
  cureReach: 2.6,
  pickupRadius: 1.4,
  /** Cash per recovered card, and the bonus for the full set. */
  reward: 350,
  allBonus: 1500,
  /** Carriers are placed at least this far from the insertion point. */
  minStartDistance: 45,
} as const;

export const COOP = {
  maxPlayers: 3,
  /** World snapshots the simulation sends per second, and position reports each player sends. */
  snapshotHz: 10,
  reportHz: 12,
  /** Cash every player gets when a Mazoku carrier's card is recovered. */
  carrierReward: 350,
  /** A downed player bleeds out after this long unless a teammate within `reviveReach` holds E for `reviveHold`. */
  bleedOut: 30,
  reviveHold: 3,
  reviveReach: 2.6,
  /** Health a revived player gets back up with. */
  reviveHealth: 50,
} as const;

/**
 * Difficulty, picked on the title screen (or by a co-op session's owner), in two independent parts: how dangerous
 * the infected are, and how capable your AI squad is (the Forge soldiers, freed survivors and any other helpers).
 */
export type ZombieDifficulty = 'easy' | 'normal' | 'hard' | 'nightmare';
export type TeamSkill = 'rookie' | 'regular' | 'veteran' | 'elite';
export const ZOMBIE_DIFFICULTIES: readonly ZombieDifficulty[] = ['easy', 'normal', 'hard', 'nightmare'];
export const TEAM_SKILLS: readonly TeamSkill[] = ['rookie', 'regular', 'veteran', 'elite'];

export interface ZombieTuning {
  label: string;
  note: string;
  /** Health, damage dealt, movement speed and how far they see you. */
  hp: number;
  damage: number;
  speed: number;
  sight: number;
  /** How many: active caps, how often new ones arrive, the size of hordes and bursts. */
  count: number;
}

export const ZOMBIE_DIFFICULTY: Record<ZombieDifficulty, ZombieTuning> = {
  easy: { label: 'EASY', note: 'Fewer, slower, weaker infected that hit softly.', hp: 0.7, damage: 0.55, speed: 0.9, sight: 0.8, count: 0.7 },
  normal: { label: 'NORMAL', note: 'The exclusion zone as intended.', hp: 1, damage: 1, speed: 1, sight: 1, count: 1 },
  hard: { label: 'HARD', note: 'Tougher, faster infected that hit harder, see farther and come in greater numbers.', hp: 1.35, damage: 1.35, speed: 1.07, sight: 1.2, count: 1.3 },
  nightmare: { label: 'NIGHTMARE', note: 'Nearly twice as tough and deadly, quick, sharp-eyed, and everywhere.', hp: 1.8, damage: 1.8, speed: 1.14, sight: 1.4, count: 1.6 },
};

export interface TeamTuning {
  label: string;
  note: string;
  /** Health, and the share of each hit they take. */
  hp: number;
  damageTaken: number;
  /** Shots: hit chance, rate of fire, damage per hit, engagement range, and the share of hits that are headshots. */
  accuracy: number;
  fireRate: number;
  damage: number;
  range: number;
  headshots: number;
}

export const TEAM_SKILL: Record<TeamSkill, TeamTuning> = {
  rookie: { label: 'ROOKIE', note: 'Green helpers: fragile, slow on the trigger, often miss.', hp: 0.75, damageTaken: 1.2, accuracy: 0.7, fireRate: 0.8, damage: 0.8, range: 0.85, headshots: 0.6 },
  regular: { label: 'REGULAR', note: 'Steady helpers who hold their own.', hp: 1, damageTaken: 1, accuracy: 1, fireRate: 1, damage: 1, range: 1, headshots: 1 },
  veteran: { label: 'VETERAN', note: 'Hardened helpers: tougher, quicker and more accurate.', hp: 1.3, damageTaken: 0.85, accuracy: 1.12, fireRate: 1.2, damage: 1.2, range: 1.1, headshots: 1.5 },
  elite: { label: 'ELITE', note: 'Special forces: hard to kill, rarely miss, often go for the head.', hp: 1.6, damageTaken: 0.7, accuracy: 1.22, fireRate: 1.4, damage: 1.4, range: 1.2, headshots: 2 },
};

/**
 * Vulcan's leadership (vulcan.genxmims.org). On the Forge two of the three co-leaders deploy with you (picked each run),
 * the third is holed up somewhere in the Forge with Anya and four of the clan's members, and tomoe is in the HQ vault.
 */
export const VULCAN_LEADERSHIP = {
  leader: 'tomoe',
  coLeads: ['Athy', 'Marv03K', 'piryriry', '.maidlover.'],
  officers: ['Anya'],
} as const;

/**
 * Aurelia on her own map (`src/aurelia/`): she walks a little ahead of the squad, the infected hunt her, and she cannot
 * die. Killed, she falls (`fall` s), lies in the ash (`ashFirst` s, `ashGrowth` times longer for each death in a row,
 * never more than `ashMax`; a death after `forgiveAfter` s on her feet starts the count again), and rises (`rise` s)
 * in a burst of fire that throws back everything within `burst.radius` m. Infected standing on her ashes hold her down:
 * each one within `trample.radius` slows the rising by `trample.per`, up to `trample.max`.
 */
export const AURELIA_NPC = {
  hp: 260,
  /** Her place in the squad: ahead of whoever she follows (x to the right, z behind, so ahead is negative). */
  slot: { x: 1.2, z: -3.5 },
  fall: 1.2,
  ashFirst: 8,
  ashGrowth: 1.5,
  ashMax: 30,
  forgiveAfter: 90,
  rise: 1.8,
  /** Into the rising when the fire bursts out of her. */
  burstAt: 0.5,
  burst: { radius: 6, center: 45, edge: 15, knock: 9 },
  trample: { radius: 1.4, per: 0.12, max: 0.6 },
  /** Red lilies left where she fell, at most (the oldest go first). */
  lilies: 12,
} as const;

/** The Forge map: the co-leaders who deploy with you, and the Seven Flames. */
export const FORGE_SQUAD = {
  allyHp: 160,
  /** Share of an infected's hit a soldier actually takes (body armour). */
  allyDamageTaken: 0.75,
  /** Engagement range, seconds between shots, and damage per hit. */
  range: 28,
  fireInterval: 0.42,
  bodyDamage: 17,
  headDamage: 44,
  /** A soldier farther than this from the player regroups next to them. */
  regroupDistance: 45,
  /** Cash per co-leader who is still alive at extraction. */
  saveBonus: 500,
  /**
   * The seven embers - the Forge's seven currencies, one furnace each (`FORGE_STORY.furnaces`): Vulcan's own Ignis and
   * the six allied flames. All seven relight the forges on Seven Flames Row.
   */
  flames: [
    { name: 'IGNIS', color: 0xff7a1a },
    { name: 'AMETHYST FLAME', color: 0xb26bff },
    { name: 'KIZUNA SPARK', color: 0xffc84a },
    { name: 'SAKURA SPARK', color: 0xff8ac8 },
    { name: 'MOSSFIRE', color: 0x7ee05a },
    { name: 'VOID EMBER', color: 0x8a6bff },
    { name: 'FROSTFIRE', color: 0x7fd8ff },
  ],
} as const;

/**
 * The Forge's story operation (`src/forge/`): the holdouts barricaded into rooms, the infected at their doors, the
 * Hearth, the ledger, the vault, the Rumble Pit, and the last carrier.
 */
export const FORGE_STORY = {
  /** A bigger map, a longer night: the deadline, the firestorm and the escalation (see `logic/mission.ts`). */
  clock: { deadline: 1080, surgeStart: 760, phases: [150, 420, 760] as readonly number[] },
  /** Ordinary members holed up each run (besides the left-over co-leader and Anya; tomoe is in the vault). */
  members: 4,
  /** No infected on its feet within this of a door, and the people inside open up. */
  doorClear: 6,
  /** Reach of the hold at a door. */
  doorReach: 2.4,
  /** Hold time at a door, and cash for each person who makes it to the Hearth. */
  rescueHold: 1.6,
  rescueCash: 250,
  /** The infected at the doors: how many each, how often one more comes, and when they let go. */
  siege: { min: 3, max: 5, refillEvery: 24, releaseRange: 11, spawnAway: 26 },
  ledger: { pickupRadius: 1.9, cashEach: 250, bonus: 900 },
  rumble: { waves: [6, 9, 13] as readonly number[], gap: 7, cash: 1100, plates: 2, radius: 10 },
  /**
   * The seven foundries, one per ember (`FORGE_SQUAD.flames`), spread over the map: stoke the forge inside one (a hold of
   * E within `reach`), then hold the hall for `hold` seconds while a horde comes for it (`draw` more every `drawEvery`
   * seconds, from `drawAway` metres out, plus `drawPerPlayer` each for every extra player) until it catches. Each ember
   * pays `cash`; all seven pay `bonus` and plates.
   */
  furnaces: { count: 7, hold: 30, reach: 2.8, stoke: 0.8, cash: 150, bonus: 700, plates: 2, drawEvery: 6, draw: [3, 5] as readonly number[], drawPerPlayer: 1, drawAway: [18, 30] as readonly number[] },
  /**
   * The Hearth's sentry gun: it covers the courtyard and the apron outside its gate, and never fires on a boss (its
   * friend-or-foe still reads the Infernus and the reborn as clan).
   */
  sentry: { range: 34, turn: 7, fireEvery: 0.28, damage: 32, headDamage: 80, headChance: 0.22 },
  /**
   * The people you bring to the Hearth pick up a gun there: a weak shotgun each, at the infected in the yard or at its
   * gates near them (never a boss). Damage falls off with distance; their kills pay nothing, like the sentry's.
   */
  guards: { range: 11, fireEvery: 1.5, damage: 20, headDamage: 38, headChance: 0.12 },
  /**
   * The last stand: from the extraction call until the virus burns out, the infected come for the Hearth in waves -
   * more than the sentry can hold. One that stands over someone at the Hearth for `strike` seconds kills them (no more
   * than one every `takeEvery` seconds, and never the last `finale.keep`).
   */
  assault: { waveEvery: 7, wave: 7, perPlayer: 0.45, maxAlive: 30, spawnAway: [26, 44] as readonly number[], strike: 2.4, takeEvery: 8, releaseRange: 5 },
  finale: {
    /** Seconds after the extraction is called before the carrier turns (random between): the siege comes first. */
    delayMin: 30,
    delayMax: 45,
    /** The carrier convulses and glows for this long (the radio cuts in) before the reborn appears. */
    warnLead: 6,
    /** One more person at the Hearth falls every this many seconds while the reborn lives. */
    killEvery: 8,
    /** At least this many are always left at the Hearth. */
    keep: 1,
    hp: 3000,
    /** Extra health for each player after the first (co-op). */
    hpPerPlayer: 0.55,
  },
} as const;

/** How a teammate or survivor looks (read by `coop/avatarLook.ts`); without one they are the stock figure. */
export interface AvatarLook {
  female?: boolean;
  hair?: 'bob' | 'short' | 'long' | 'ponytail' | 'twintails' | 'bun' | 'puff' | 'veil';
  hairColor?: number;
  outfit?: 'nurse' | 'gown' | 'coat' | 'tactical' | 'habit';
  skin?: number;
  eyes?: number;
  glasses?: boolean;
  /** Trim: a nurse's cross and collar, ribbons, scrubs under a coat. */
  accent?: number;
  /**
   * The Forge's people (`coop/heroLook.ts`, `forge/looks.ts`): the handsome hero figure instead of the stock one, its
   * build (a man's, a woman's, or a lean in-between), hair, outfit, signature items and a shadow of stubble.
   */
  hero?: boolean;
  build?: 'm' | 'f' | 'lean';
  heroHair?: 'undercut' | 'swept' | 'wolf' | 'waves' | 'highPony' | 'braids' | 'spiky' | 'buzz' | 'bob' | 'lowPony' | 'curls' | 'animeBun' | 'animeLong' | 'animeSpiky' | 'animeBob' | 'animeRound';
  heroOutfit?: 'apron' | 'jacket' | 'hoodie' | 'workwear' | 'coat' | 'dress' | 'uniform' | 'tunic' | 'school';
  /** Shirt / trousers colours under the outfit (the outfit's own colour is the figure's `color`); tights under a dress. */
  pants?: number;
  accessories?: readonly ('foxEars' | 'catEars' | 'bunnyEars' | 'horns' | 'crown' | 'flameCrown' | 'mask' | 'sharkHood' | 'scarf' | 'goggles' | 'headphones' | 'glasses' | 'shades' | 'moonPin' | 'stars' | 'headset' | 'phoenixPin' | 'sash' | 'sunHat' | 'bow' | 'oniHorns' | 'headband' | 'tie' | 'skateboard' | 'starClip')[];
  stubble?: boolean;
  /**
   * An anime-style figure (two of the co-leaders): a bigger head, large shining eyes, a small nose, and the mouth -
   * 'soft' is round-cheeked with a blush and a cat smile, 'cool' is calm with a fine line of a mouth.
   */
  anime?: 'soft' | 'cool';
  /** A dress's skirt: to mid-thigh, or long and flared below the knee (fading to the accent at the hem). */
  skirt?: 'short' | 'long';
  /** The colour long hair fades to at its ends. */
  hairTip?: number;
  /** Shoes (default dark leather). */
  shoes?: number;
  /** What they carry in their hands when they have no gun out (held like one). */
  instrument?: 'bass';
}

/** The helpers who deploy with you, by map (the District has none). They use the Forge soldiers' numbers. */
export interface SquadDef {
  /** Who deploys; with `pick`, the pool `pick` of them are drawn from each run. */
  names: readonly string[];
  pick?: number;
  tag: string;
  tagColor: string;
  weapons: readonly ('rifle' | 'shotgun' | 'pistol')[];
  helmets: readonly boolean[];
  colors?: readonly number[];
  looks?: readonly AvatarLook[];
  /** VRoid models they wear (the Sakura District, `ANIME_CAST`). */
  models?: readonly string[];
  /** Co-op players take their places: the squad and the players together are at most `COOP.maxPlayers`. */
  fillsSeats?: boolean;
}
export const SQUADS: Partial<Record<MapId, SquadDef>> = {
  // two of Vulcan's three co-leaders, drawn each run (`forge/roster.ts`); their looks are `forge/looks.ts`
  forge: { names: VULCAN_LEADERSHIP.coLeads, pick: 2, tag: 'VULCAN', tagColor: '#ff9a4a', weapons: ['rifle', 'shotgun'], helmets: [false, false] },
  // Aurelia's valley: two of Vulcan's own cross the river with you (their looks are `forge/looks.ts`)
  aurelia: { names: ['Athy', 'piryriry'], tag: 'VULCAN', tagColor: '#ff9a4a', weapons: ['rifle', 'shotgun'], helmets: [false, false] },
  // Lantern team: Rin Vance, a marksman, and Dr. Imani Okafor, who worked the wards before the fall
  asylum: {
    names: ['Vance', 'Okafor'],
    tag: 'LANTERN',
    tagColor: '#9fd0ff',
    weapons: ['rifle', 'shotgun'],
    helmets: [false, false],
    colors: [0x47523f, 0xeef0ec],
    looks: [
      { female: true, outfit: 'tactical', hair: 'ponytail', hairColor: 0x2b1b12, skin: 0xe8c3a2, eyes: 0x3a2a1a, accent: 0x2a2e32 },
      { female: true, outfit: 'coat', hair: 'puff', hairColor: 0x1b120d, skin: 0x8a5634, eyes: 0x24160e, accent: 0x5f8fa8 },
    ],
  },
  // the Sakura District: two girls of the Hanabi unit deploy with you
  sakura: {
    names: ['Hana', 'Yuzu'],
    tag: 'HANABI',
    tagColor: '#ff9ec8',
    weapons: ['rifle', 'shotgun'],
    helmets: [false, false],
    looks: [
      { female: true, outfit: 'tactical', hair: 'twintails', hairColor: 0xf2a6c8, skin: 0xf6dccb, eyes: 0x8a3a6a, accent: 0x3a2a3a },
      { female: true, outfit: 'tactical', hair: 'ponytail', hairColor: 0x2a2236, skin: 0xf3d6c2, eyes: 0x3a4a8a, accent: 0x2a2e3a },
    ],
    models: ['hana.vrm', 'yuzu.vrm'],
    fillsSeats: true,
  },
};

/**
 * The Sakura District's cast: VRoid Studio models (.vrm) in `public/anime/` (see the README there), by role. A file can
 * play several roles (it loads once). Any missing file falls back to another loaded model of its kind, then to the
 * game's own figures. `core` loads before the run starts; the rest stream in behind it (a role whose file is not in yet
 * wears a horde model until it is).
 */
export const ANIME_CAST = {
  /** Worn by `SQUADS.sakura`, in order: Hana (the user's own 02 Cyberpunk), Yuzu. */
  squad: ['hana.vrm', 'yuzu.vrm'],
  /** Worn by co-op players (a teammate's figure, by seat), in order. */
  operators: ['fumiriya.vrm', 'kuro.vrm', 'bibi.vrm'],
  /** Worn by the Kurenai Court, the district's armed humans, in order (in the Court's crimson). */
  survivors: ['hoodie.vrm', 'student-m.vrm', 'fumiriya.vrm'],
  /** The plain horde: every shambler, runner and armored infected with no kind of its own wears one of these. */
  horde: ['student-f.vrm', 'student-m.vrm', 'shino.vrm', 'fumiriya.vrm'],
  /** Each Sakura kind's own body (`anime/looks.ts` dresses it). */
  kinds: {
    commuter: 'student-m.vrm',
    bloomed: 'bibi.vrm',
    rooted: 'hoodie.vrm',
    kuchisake: 'shino.vrm',
    jorogumo: 'kuro.vrm',
    miko: 'student-f.vrm',
    idol: 'victoria.vrm',
    oni: 'vita.vrm',
    empress: 'empress.vrm',
    // MUJIN's own (`anime/looks.ts` dresses them)
    tall: 'fumiriya.vrm',
    crawler: 'student-f.vrm',
    shape: 'student-f.vrm',
    sitter: 'shino.vrm',
    master: 'student-m.vrm',
  },
  /** The boss (the Warden's part). */
  boss: 'empress.vrm',
  /** Loaded before the run starts: the squad, the horde and the Court. */
  core: ['hana.vrm', 'yuzu.vrm', 'student-f.vrm', 'student-m.vrm', 'shino.vrm', 'fumiriya.vrm', 'hoodie.vrm'],
  /** Live infected at once on this map: each one draws far more than a stock zombie. Phones get fewer. */
  hardCap: 24,
  hardCapTouch: 12,
} as const;

/**
 * Trapped survivors (Standard, Standard Mazoku and the Asylum): caged in around the map, freed with a hold of E, then
 * they fight alongside you. Side contract: get them out alive. The Forge is different (`src/forge/`): its people
 * barricaded themselves into rooms, and once their door is clear they slip away to the Hearth instead of fighting.
 */
export const SURVIVORS = {
  /** Who is waiting on each map. The Forge's list is Vulcan's leadership (its holdouts are drawn each run). */
  district: [
    { name: 'Dr. Lena Ortiz', tag: 'FIELD MEDIC', color: 0xb8c4c8 },
    { name: 'Kowalski', tag: 'MECHANIC', color: 0x6b6f4a },
    { name: 'Mika Reyes', tag: 'COURIER', color: 0x7a4a6a },
  ],
  // the Sakura District: nobody is left to save (seven years on, everyone left has turned, or turned on you)
  sakura: [] as readonly { name: string; tag: string; color: number; model?: string; look?: AvatarLook }[],
  // MUJIN: nobody to free; the only passenger you can save is the one the station keeps (`mujin/runtime.ts`)
  mujin: [] as readonly { name: string; tag: string; color: number; model?: string; look?: AvatarLook }[],
  // Aurelia's valley: Vulcan's own, taken across the river and caged on the bank (looks: `forge/looks.ts`)
  aurelia: [
    { name: 'Marv03K', tag: 'VULCAN', color: 0x8a4a22 },
    { name: '.maidlover.', tag: 'VULCAN', color: 0xb8202a },
    { name: 'Anya', tag: 'VULCAN', color: 0x9a3d1c },
  ],
  // Blackwood's staff were all women, and so was its last patient (see `asylum/lore.ts`)
  asylum: [
    { name: 'Nurse Halloway', tag: 'NIGHT NURSE', color: 0xf4f1ea, look: { female: true, outfit: 'nurse', hair: 'bun', hairColor: 0x8c3a1e, skin: 0xf1d3bd, eyes: 0x2a5a3a, accent: 0xd8404e } },
    { name: 'Ellie Crane', tag: 'PATIENT 117', color: 0xbfe2e4, look: { female: true, outfit: 'gown', hair: 'long', hairColor: 0xdcdce8, skin: 0xf6e0d2, eyes: 0x5a6ab0, accent: 0x9cc8cc } },
    { name: 'Pip Arden', tag: 'TRAINEE NURSE', color: 0xffd3e2, look: { female: true, outfit: 'nurse', hair: 'twintails', hairColor: 0xf0a2c4, skin: 0xf7dfcc, eyes: 0x6a2a4a, accent: 0xe0607e } },
    { name: 'Sister Maeve', tag: 'CHAPLAIN', color: 0x23232c, look: { female: true, outfit: 'habit', hair: 'veil', skin: 0xf0d6c2, eyes: 0x3a4a6a } },
    { name: 'Dr. Yuki Sato', tag: 'RESIDENT', color: 0xf3f3ef, look: { female: true, outfit: 'coat', hair: 'bob', hairColor: 0x16161c, skin: 0xf2d8c0, eyes: 0x2a1a14, glasses: true, accent: 0x6c8fae } },
  ],
  forge: [
    { name: 'tomoe', tag: 'VULCAN', color: 0xb5501a },
    { name: 'Athy', tag: 'VULCAN', color: 0x8a4a22 },
    { name: 'Marv03K', tag: 'VULCAN', color: 0x8a4a22 },
    { name: 'piryriry', tag: 'VULCAN', color: 0x8a4a22 },
    { name: '.maidlover.', tag: 'VULCAN', color: 0xb8202a },
    { name: 'Anya', tag: 'VULCAN', color: 0x9a3d1c },
  ],
  hp: 110,
  damageTaken: 0.85,
  range: 24,
  fireInterval: 0.6,
  bodyDamage: 13,
  headDamage: 34,
  /** Hold time at the cage, and cash for each one freed. */
  rescueHold: 2,
  rescueCash: 200,
  /** Cash for each freed survivor who is still alive at extraction. */
  extractBonus: 400,
  /** Cages are placed at least this far from the insertion point. */
  minStartDistance: 40,
} as const;

/**
 * Vulcan's members, on the Forge: the infection reached Vulcan HQ, and these are the clan's Infernus who did not make
 * it out. Some of the Forge's infected carry their names. Decorated names (script letters, emoji) are written plainly
 * so the name plates can draw them. Co-op sends a name as its index here, so new members go on the end.
 */
export const VULCAN = {
  /** Share of the Forge's ordinary infected that carry a name. */
  namedShare: 0.3,
  infected: [
    'icecat', 'abhyudaya_xd', 'Agnes Tachyon', 'AshWasTaken', 'ChadRevive', 'Clumsy', 'DragonsKeep', 'Error109wastaken',
    'Faust1nus', 'grace', 'Hakouren', 'HoangKim', 'JaxtheFennec', 'kaleopsis', 'Keo', 'Kratox', 'Michiko', 'Night',
    'Pietro', 'rintairou97', 'Seiji', 'Sharky', 'Skyrat', 'Snowko', 'Tao', 'Tuann', 'yukine', 'Airtic', 'Arcy', 'Azu',
    'Blazeking', 'Cherry', 'Cosmos', 'Dreamy', 'etienne', 'gravity', 'hezzuki', 'Juanzzz', 'Kamito', 'Monquixote',
    'Nookq', 'Prab', 'Remix', 'sai', 'Shinchan', 'Snowy', 'Tesseris', 'Vanilla Oreo', 'Yoru', 'Yuta Okkotsu',
    'zoro_thelost', 'Aristo', 'Chris', 'dhairya', 'GumBall', 'Himemori Luna', 'Kanishk', 'Kirill', 'Lekvest', 'Mace',
    'Peaches_MLG', 'ReNoin', 'Saku', 'senchou', 'Shua', 'SniperKing12341', 'Spidey', 'Wind', 'Abhay', 'Aesc',
    'AnimeFreak', 'Arsam', 'Beru', 'dattoh', 'Downhill', 'Eeriie', 'Fallen', 'Gouda', 'H0LL0W', 'hiro', 'Kazu',
    'Lenkun', 'Nex Venrick', 'Quintino', 'Salagast', 'Serenity', 'SJ', 'ToastiestOrb', 'Xarosa', 'Yuichiro', 'Zaraki',
    '_itz_diablo_', '!sikao', '.piesek.', 'jnkyu', 'Vorn', 'AndriD', 'hemantt', '$hivam', 'abi', 'Adisty',
    'Akansha', 'Aoi', 'Bai Momints', 'BikRaM69', 'BROKE', 'bron', 'Claw', 'Danish.', 'DEMON', 'Dev', 'e1sh3ths',
    'Ezer', 'Fear', 'FonduKing', 'hsyil', 'IDK', 'Jackette', 'Jum', 'J18F.5R', 'King', 'Kitsune', 'Lab',
    'Lord Autismo', 'Lost', 'March', 'moon', 'Phlangor Mutupil', 'Qifrey', 'Regen', 'Rhea', 'Sen', 'Sloth broth',
    'Snow Alberich', 'tafer____', 'The Voice of Desert Bluffs', 'Yandere Extraordinaire', 'yu', 'YACHIYO', 'ZF',
    'さなえ', 'ソフィー', 'Tsu', '他は雅', '刘枭',
  ],
} as const;

export const FREE_ROAM = {
  speed: 9,
  fastSpeed: 26,
  /** Flight ceiling above the ground, metres. */
  ceiling: 120,
} as const;

// ---------------------------------------------------------------------------------------------
// Mission
// ---------------------------------------------------------------------------------------------

/**
 * The Sakura District's clocks: the biggest map (a street grid, a metro and a lab under it, a shrine on its hill) needs
 * more time than `MISSION`; KAIKA, its whole story in twelve chapters across all of it, far more.
 */
/**
 * MUJIN's clock: the longest night in the game, so there is time for the loops and the station's secret. The night
 * only comes out of the tunnel at the very end (the surge); each loop is ~2 minutes (`MUJIN_LOOP`).
 */
export const MUJIN_CLOCK = { deadline: 3300, surgeStart: 3000, phases: [240, 900, 1800] as readonly number[] };

export const SAKURA_CLOCK = {
  operation: { deadline: 1200, surgeStart: 860, phases: [150, 420, 860] as readonly number[] },
  kaika: { deadline: 2700, surgeStart: 2280, phases: [180, 900, 1800] as readonly number[] },
} as const;

export const MISSION = {
  /** Seconds until the district is sealed (last chance to call extraction). */
  deadline: 720,
  /** Mission time (elapsed seconds) when the contamination surge begins if extraction hasn't been called. */
  surgeStart: 450,
  /** Elapsed seconds at which escalation phases begin. */
  phases: [120, 300, 450],
  hazard: {
    startRadius: 14,
    /** Damage per second inside the toxic zone (ignores armour). */
    dps: 7,
    /** Distance the front stops short of the LZ centre while an extraction is in progress. */
    lzStandoff: 16,
    /** Warning lead time before the surge starts. */
    warningLead: 20,
  },
  defense: {
    id: 'defense',
    title: 'RESTORE THE RELAY',
    summary: 'Activate the transmitter and hold the marked area until the uplink completes.',
    activateHold: 1.2,
    /** Seconds of presence required to complete. */
    duration: 55,
    radius: 10,
    /** Progress lost per second while the player is outside the area. */
    decayPerSecond: 2.4,
    /** Progress rate multiplier while inside (1 = real time). */
    rate: 1,
    /** Director boosts spawns near the site while active. */
    spawnInterval: 2.2,
    burstEvery: 9,
    burstSize: 4,
    activeCap: 26,
    reward: { cash: 1200, plates: 2, grenades: 0 },
  },
  hunt: {
    id: 'hunt',
    title: 'ELIMINATE THE WARDEN',
    summary: 'Locate and eliminate the elite infected inside the research compound.',
    /** Distance within which the Warden is identified on the HUD. */
    revealRange: 46,
    /** Radius of the search area drawn on the map. */
    searchRadius: 26,
    reward: { cash: 1800, plates: 2, grenades: 2 },
  },
  extraction: {
    title: 'EXTRACT',
    /** Hold time on the beacon to call the helicopter. */
    callHold: 1.5,
    /** Seconds from calling to helicopter touchdown. */
    countdown: 60,
    /** The helicopter becomes visible this many seconds before touchdown. */
    visibleAt: 26,
    landingDuration: 9,
    /** Seconds the helicopter stays on the ground for boarding. */
    boardingWindow: 50,
    boardRadius: 4.6,
    boardingCinematic: 3.6,
    /** Final horde waves: seconds after the call, number of enemies. */
    waves: [
      { at: 0, count: 7, armored: 1 },
      { at: 14, count: 8, armored: 1 },
      { at: 28, count: 9, armored: 1 },
      { at: 44, count: 9, armored: 2 },
      { at: 60, count: 8, armored: 1 },
      { at: 76, count: 6, armored: 1 },
    ],
    activeCap: 26,
    /** Mix for the final horde (shambler/runner; armoured come from `armored` above). */
    runnerFraction: 0.28,
  },
} as const;

// ---------------------------------------------------------------------------------------------
// Rendering, quality, audio, FX limits
// ---------------------------------------------------------------------------------------------

export interface QualityPreset {
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  msaaSamples: number;
  /** Number of real dynamic point lights assigned to the nearest lamps. */
  lightPool: number;
  particleScale: number;
  maxEnemies: number;
  /** Maximum decals of each family (bullet holes, blood, scorches). */
  decalScale: number;
  /** Nothing is drawn beyond this (the fog has hidden it by ~190 m anyway). */
  viewDistance: number;
  /** Small props (under ~4 m) are not drawn beyond this. */
  detailDistance: number;
  /** Paint every texture at half size: a quarter of the texture memory (phones, weak laptops). */
  halfTextures: boolean;
  /** Halve them once more (a quarter of the size, a sixteenth of the memory): budget phones. Needs `halfTextures`. */
  quarterTextures: boolean;
  /** Seconds between an ally's path-field refreshes. */
  allyPathEvery: number;
  /** The 95th-percentile frame time (ms) this preset should hold: what the tier governor measures against. */
  frameBudgetMs: number;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  // T1, budget phones: fewer infected alive at once (each a little tougher, see `liteOffset`), a short view
  lite: {
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 1024,
    bloom: false,
    msaaSamples: 0,
    lightPool: 2,
    particleScale: 0.4,
    maxEnemies: 16,
    decalScale: 0.4,
    viewDistance: 120,
    detailDistance: 35,
    halfTextures: true,
    quarterTextures: true,
    allyPathEvery: 1.6,
    frameBudgetMs: 1000 / 30,
  },
  low: {
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 1024,
    bloom: false,
    msaaSamples: 0,
    lightPool: 3,
    particleScale: 0.5,
    maxEnemies: 24,
    decalScale: 0.5,
    viewDistance: 190,
    detailDistance: 55,
    halfTextures: true,
    quarterTextures: false,
    allyPathEvery: 1.2,
    frameBudgetMs: 1000 / 30,
  },
  // Default. The shadow pass was redrawing the whole district and was the frame-time cost,
  // so medium keeps the enemy cap and skips shadows, bloom and MSAA.
  medium: {
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 1024,
    bloom: false,
    msaaSamples: 0,
    lightPool: 4,
    particleScale: 0.8,
    maxEnemies: 34,
    decalScale: 0.8,
    viewDistance: 420,
    detailDistance: 90,
    halfTextures: false,
    quarterTextures: false,
    allyPathEvery: 0.6,
    frameBudgetMs: 20,
  },
  high: {
    pixelRatioCap: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    bloom: false,
    msaaSamples: 0,
    lightPool: 5,
    particleScale: 1,
    maxEnemies: 40,
    decalScale: 1,
    viewDistance: 420,
    detailDistance: Infinity,
    halfTextures: false,
    quarterTextures: false,
    allyPathEvery: 0.6,
    frameBudgetMs: 20,
  },
  // T5: High with MSAA and bloom and a bigger crowd, for a GPU with headroom left (the governor reaches it after a
  // long clean stretch on High)
  'high+': {
    pixelRatioCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    msaaSamples: 4,
    lightPool: 5,
    particleScale: 1,
    maxEnemies: 60,
    decalScale: 1,
    viewDistance: 420,
    detailDistance: Infinity,
    halfTextures: false,
    quarterTextures: false,
    allyPathEvery: 0.6,
    frameBudgetMs: 20,
  },
};

/** The presets from lightest to heaviest: the device tiers T1-T5 the governor steps between. */
export const QUALITY_TIERS: readonly QualityLevel[] = ['lite', 'low', 'medium', 'high', 'high+'];

/**
 * The tier governor (`logic/governor.ts`): frames are judged in windows of `window` seconds. Resolution steps come
 * first; the tier steps down after `downAfter` seconds over budget (with the render scale already at its floor) and up
 * only after `upAfter` seconds with room to spare under the next tier's budget. Never during a defense hold, a horde
 * or an extraction.
 */
export const GOVERNOR = {
  window: 2,
  /** The first seconds of play, judged as one: the calibration. */
  calibrate: 20,
  downAfter: 10,
  upAfter: 120,
  /** Up only while the p95 frame time is under this share of the next tier's budget. */
  upHeadroom: 0.9,
  /** A frame this much over budget counts as slow (the resolution steps). */
  slowFactor: 1.1,
  /** Share of slow frames in a window that steps the resolution down. */
  slowShare: 0.25,
  /** Never below 75% (lower looked like a pixelated mess mid-fight). */
  minScale: 0.75,
  /** A step down within this many seconds of a step up makes the tier above the session's ceiling. */
  regret: 60,
  /** Phones and tablets stop at this tier unless picked by hand (memory kills an iOS tab without slowing it first). */
  touchCeiling: 'low' as QualityLevel,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  fov: 90,
  masterVolume: 0.7,
  // with qualityAuto the game picks the tier for the device (`logic/governor.ts`) and this is only the fallback;
  // picking one in Settings keeps it
  quality: 'low',
  qualityAuto: true,
  reducedMotion: false,
  invertY: false,
  showFps: false,
  aimAssist: true,
  autoFire: false,
  modelPack: 'classic',
};

export const RENDER = {
  fogColor: 0x3b4c62,
  fogDensity: 0.0105,
  exposure: 1.15,
  viewmodelFov: 52,
  near: 0.06,
  far: 420,
  /** Radians of camera rotation per mouse pixel at sensitivity 1. */
  mouseRadPerPixel: 0.0022,
  /** Bloom tuning (kept restrained). */
  bloomStrength: 0.3,
  bloomRadius: 0.32,
  bloomThreshold: 1.75,
} as const;

export const AUDIO = {
  maxVoices: 32,
  /** Reference distance for spatialised sounds. */
  refDistance: 4,
  maxDistance: 90,
} as const;

export const FX = {
  maxParticles: 1800,
  maxBulletHoles: 72,
  maxBloodSplats: 40,
  maxScorches: 8,
  maxTracers: 24,
  maxCasings: 24,
} as const;

/** Is this weapon id valid. */
export function isWeaponId(v: string): v is WeaponId {
  return v === 'rifle' || v === 'pistol' || v === 'shotgun';
}
