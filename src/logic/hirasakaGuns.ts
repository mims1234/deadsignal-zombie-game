/**
 * HIRASAKA's built guns, the parts that are pure numbers (`config.ts` spreads `HIRASAKA_WEAPONS` into its table;
 * `hirasaka/armsGuns.ts` fires them through the weapon system's map-gun hook). They are the top tier on the island,
 * meant to be survived with: each beats everything the offering box or a price board hands out, on one infected and
 * on a crowd (`gunDps`, checked by `tests/hirasakaArms.test.ts`).
 *
 *   happa      a blasting-charge launcher: a lobbed charge that sticks to the first thing it touches (an infected, a
 *              wall, the floor) and goes off a moment later in a very wide blast.
 *   sakuganki  a pneumatic drill lance: each stroke bores through every infected on its line (a wall stops it).
 *   mori       the winch harpoon: through up to four, pins what it strikes and reels it in (and the umibōzu's hide:
 *              the bosses' `umiHit`, through `harpoonHook`).
 *   kushibi    Genzō's comb, lit tooth by tooth: a stream of fire that burns everything in its cone; where it lands
 *              the hags will not cross (a bamboo-like ward, the director's). Its teeth burn down on the model.
 *   okamuzumi  the comb at the revived tree: a peach-light cannon whose bolt bursts wide and drives the dead off.
 *
 * No THREE, no game objects here (the config imports this file: it must not import the config's values).
 */
import type { UpgradeTier, WeaponDef } from '../config';
import type { HirasakaGunId, WeaponId } from '../types';

export const HIRASAKA_GUN_IDS: readonly HirasakaGunId[] = ['happa', 'sakuganki', 'mori', 'kushibi', 'okamuzumi'];

/** The stock gun each is held like (its hands and motion in first person; what a teammate is seen carrying). */
export const HIRASAKA_BASE: Record<HirasakaGunId, 'pistol' | 'rifle' | 'rpg'> = { happa: 'rpg', sakuganki: 'rifle', mori: 'rifle', kushibi: 'pistol', okamuzumi: 'rpg' };

export function isHirasakaGun(id: WeaponId | string): id is HirasakaGunId {
  return id in HIRASAKA_BASE;
}

/** What each does beyond its table row. */
export const HIRASAKA_GUNS = {
  happa: {
    /** The charge's throw (m/s) and its drop (m/s²); it sticks to what it touches and goes off `fuse` s later. */
    speed: 26,
    gravity: 9,
    fuse: 0.55,
    /** Never in the air longer than this (out over the sea it goes off by itself). */
    life: 3,
    radius: 8.5,
    edgeShare: 0.35,
    knock: 14,
  },
  sakuganki: {
    /** How far a stroke bores, and how wide its line is (m). */
    range: 17,
    width: 0.55,
    /** How hard a stroke pushes at each one's poise. */
    impulse: 2.2,
  },
  mori: {
    /** The harpoon goes through this many; each is pinned this long and reeled toward the shooter at `pull` m/s. */
    pierce: 4,
    pin: 2.2,
    pull: 7,
    stopAt: 2.2,
    range: 60,
  },
  kushibi: {
    /** The fire's reach and cone (degrees, the whole angle); at most this many burn at once. */
    range: 8.5,
    cone: 44,
    targets: 6,
    /** Each tooth burns this many ticks of the stream (`magSize` = teeth × ticks). */
    teeth: 10,
    ticks: 6,
    /** A fire ward where the stream lands, at most this often (s): the hags do not cross it. */
    wardEvery: 1.2,
  },
  okamuzumi: {
    speed: 60,
    radius: 9.5,
    edgeShare: 0.4,
    knock: 16,
    life: 2.5,
  },
} as const;

function tier(label: string, description: string, cost: number, damageMul: number, magSizeAdd: number, reserveMaxAdd: number, reloadMul: number): UpgradeTier {
  return { label, description, cost, damageMul, magSizeAdd, reserveMaxAdd, fireRateMul: 1, recoilMul: 1, spreadMul: 1, reloadMul, pelletsAdd: 0, headshotMulAdd: 0, armorPierce: 0.5 };
}

/** A row of the weapon table with the plain parts filled in. */
function row(r: Partial<WeaponDef> & Pick<WeaponDef, 'id' | 'name' | 'short' | 'auto' | 'damage' | 'fireInterval' | 'magSize' | 'reserveStart' | 'reserveMax' | 'reloadTactical' | 'tracerColors' | 'tiers'>): WeaponDef {
  return {
    pellets: 1,
    headshotMul: 1,
    reloadStyle: 'magazine',
    reloadEmpty: r.reloadTactical,
    reloadTransferAt: 0.7,
    shellStart: 0,
    shellEach: 0,
    shellEnd: 0,
    shellPump: 0,
    spreadHip: 0.6,
    spreadAds: 0.2,
    spreadMove: 0.8,
    spreadAir: 2,
    spreadPerShot: 0,
    spreadMax: 0.6,
    spreadRecover: 5,
    recoilPitch: 2,
    recoilYaw: 0.5,
    recoilRecover: 6,
    falloffStart: 999,
    falloffEnd: 1000,
    minMul: 1,
    maxRange: 120,
    adsFovMul: 0.85,
    adsTime: 0.24,
    moveMul: 0.95,
    noise: 50,
    drawTime: 0.55,
    price: 0,
    ammoPrice: 0,
    ...r,
  } as WeaponDef;
}

/** Their rows of the weapon table (`config.ts` WEAPONS). Never sold (`price` 0), never boxed. */
export const HIRASAKA_WEAPONS: Record<HirasakaGunId, WeaponDef> = {
  happa: row({
    id: 'happa', name: 'Happa Blasting Launcher', short: 'HAPPA', auto: false,
    /** The blast's centre damage (`HIRASAKA_GUNS.happa`). */
    damage: 1500, fireInterval: 0.55, magSize: 4, reserveStart: 16, reserveMax: 24, reloadTactical: 2.6, reloadTransferAt: 0.75,
    recoilPitch: 4, recoilYaw: 1, moveMul: 0.9, noise: 80, drawTime: 0.7, ammoPrice: 900,
    tracerColors: [0xffc070, 0xff8a30, 0x8ff0ff],
    tiers: [tier('MK II', 'Bigger charges: +30% blast, 2 more in the bag, a quicker reload.', 3000, 1.3, 1, 8, 0.85), tier('MK III', 'Gelignite: +70% blast, 4 more in the bag, quicker still.', 6000, 1.7, 2, 16, 0.7)],
  }),
  sakuganki: row({
    id: 'sakuganki', name: 'Sakuganki Drill Lance', short: 'SAKUGANKI', auto: true,
    /** Each stroke's damage to every infected on its line. */
    damage: 220, fireInterval: 0.16, magSize: 30, reserveStart: 120, reserveMax: 180, reloadTactical: 2.4, spreadHip: 0.4, spreadAds: 0.1, spreadMax: 0.4,
    recoilPitch: 0.9, recoilYaw: 0.4, moveMul: 0.9, noise: 45, drawTime: 0.6, ammoPrice: 900,
    tracerColors: [0xd8e0e8, 0xa0e8ff, 0x8ff0ff],
    tiers: [tier('MK II', 'A tungsten bit: +30% bore, 10 more strokes a load.', 3000, 1.3, 10, 40, 0.85), tier('MK III', 'Twin hammers: +70% bore, 20 more strokes a load.', 6000, 1.7, 20, 80, 0.7)],
  }),
  mori: row({
    id: 'mori', name: 'Mori Winch Harpoon', short: 'MORI', auto: false,
    /** The harpoon's damage to each it goes through (`HIRASAKA_GUNS.mori`). */
    damage: 1000, headshotMul: 1.5, fireInterval: 0.5, magSize: 1, reserveStart: 20, reserveMax: 30, reloadTactical: 1.1, spreadHip: 0.3, spreadAds: 0.04, spreadMax: 0.3,
    recoilPitch: 2.5, recoilYaw: 0.4, adsFovMul: 0.7, noise: 30, drawTime: 0.6, ammoPrice: 700,
    tracerColors: [0xc8ccd0, 0xffd27a, 0x8ff0ff],
    tiers: [tier('MK II', 'A barbed head: +30% damage, 10 more harpoons.', 2600, 1.3, 0, 10, 0.85), tier('MK III', 'A whaler\'s head: +70% damage, 20 more harpoons.', 5200, 1.7, 1, 20, 0.7)],
  }),
  kushibi: row({
    id: 'kushibi', name: 'Kushi-bi, the Lit Comb', short: 'KUSHI-BI', auto: true,
    /** Damage a SECOND to everything in the fire; `magSize` is the teeth times their ticks (`HIRASAKA_GUNS.kushibi`). */
    damage: 650, fireInterval: 0.15, magSize: 60, reserveStart: 120, reserveMax: 180, reloadTactical: 2.5, reloadTransferAt: 0.6,
    spreadHip: 0, spreadAds: 0, spreadMove: 0, spreadAir: 0, spreadMax: 0, recoilPitch: 0.15, recoilYaw: 0.1, moveMul: 1, noise: 18, drawTime: 0.45, ammoPrice: 1200,
    tracerColors: [0xff9a3a, 0xffc070, 0xffe0f0],
    tiers: [tier('MK II', 'Camellia-soaked teeth: +30% fire, each burns longer.', 3500, 1.3, 12, 36, 0.85), tier('MK III', 'The whole comb alight: +70% fire, longer still.', 7000, 1.7, 24, 72, 0.7)],
  }),
  okamuzumi: row({
    id: 'okamuzumi', name: 'Ōkamuzumi, the Peach-Light', short: 'ŌKAMUZUMI', auto: false,
    /** The bolt's centre damage (`HIRASAKA_GUNS.okamuzumi`). */
    damage: 4000, fireInterval: 0.9, magSize: 3, reserveStart: 15, reserveMax: 24, reloadTactical: 2.8, spreadHip: 0.3, spreadAds: 0.05, spreadMax: 0.3,
    recoilPitch: 3.5, recoilYaw: 0.6, noise: 40, drawTime: 0.6, ammoPrice: 1500,
    tracerColors: [0xffd0e0, 0xffb0d0, 0xfff0ff],
    tiers: [tier('MK II', 'Riper light: +30% burst, a fourth bolt.', 4000, 1.3, 1, 6, 0.85), tier('MK III', 'The whole tree\'s light: +70% burst, a fifth bolt.', 8000, 1.7, 2, 12, 0.7)],
  }),
};

/** How many of a crowd of `n` standing together one shot of each reaches (stock guns and HIRASAKA's). */
function reached(id: WeaponId, n: number): number {
  switch (id) {
    case 'shotgun':
      return Math.min(n, 2);
    case 'rpg':
    case 'happa':
    case 'okamuzumi':
    case 'sakuganki':
      return n;
    case 'arbalet':
      return Math.min(n, 4);
    case 'mori':
      return Math.min(n, HIRASAKA_GUNS.mori.pierce);
    case 'kushibi':
      return Math.min(n, HIRASAKA_GUNS.kushibi.targets);
    default:
      return 1;
  }
}

/** A blast's damage on average over its area (the centre's share of what lands on a crowd). */
const BLAST_AVG = 0.7;

/**
 * Damage a second, sustained over a whole load and its reload, of a gun at tier 0 into a crowd of `n` (body shots, no
 * headshots): what the arms test compares. `def` is that gun's row (the caller passes `WEAPONS[id]`).
 */
export function dpsOf(def: WeaponDef, n: number): number {
  const id = def.id;
  const reload = def.reloadStyle === 'shell' ? def.shellStart + def.magSize * def.shellEach + def.shellEnd : def.reloadTactical;
  const firing = def.magSize * def.fireInterval;
  if (id === 'kushibi') return (def.damage * firing) / (firing + reload) * reached(id, n);
  const blast = id === 'rpg' || id === 'happa' || id === 'okamuzumi';
  const shot = def.damage * def.pellets * (blast ? BLAST_AVG : 1);
  return (def.magSize * shot * reached(id, n)) / (firing + reload);
}

let table: Record<string, WeaponDef> | null = null;
/** (The test's door: `dpsOf` with the config's row, read lazily so this file never imports the config's values.) */
export function useWeaponTable(t: Record<string, WeaponDef>): void {
  table = t;
}
export function gunDps(id: WeaponId, n: number): number {
  const def = table?.[id] ?? (HIRASAKA_WEAPONS as Record<string, WeaponDef>)[id];
  if (!def) throw new Error(`gunDps: no row for ${id} (call useWeaponTable(WEAPONS) first)`);
  return dpsOf(def, n);
}

/** Teeth still burning on the comb (for the model): `mag` ticks left of `magSize`. */
export function teethLit(mag: number, magSize: number): number {
  const per = Math.max(1, magSize / HIRASAKA_GUNS.kushibi.teeth);
  return Math.max(0, Math.min(HIRASAKA_GUNS.kushibi.teeth, Math.ceil(mag / per - 1e-6)));
}

/**
 * Where something at (zx, zz) is after being reeled `dt` seconds toward (px, pz) by the harpoon's winch: at
 * `HIRASAKA_GUNS.mori.pull` m/s, never nearer than `stopAt`.
 */
export function reelToward(px: number, pz: number, zx: number, zz: number, dt: number): { x: number; z: number } {
  const G = HIRASAKA_GUNS.mori;
  const dx = px - zx;
  const dz = pz - zz;
  const d = Math.hypot(dx, dz);
  const step = Math.min(G.pull * dt, d - G.stopAt);
  if (!(step > 0)) return { x: zx, z: zz };
  return { x: zx + (dx / d) * step, z: zz + (dz / d) * step };
}

/**
 * Distance from (tx, tz) to the segment from (ox, oz) along the unit (fx, fz) for `len` metres, and how far along it
 * the nearest point is (the drill lance's line). `along` < 0 or > len: behind or past it.
 */
export function lineOffset(ox: number, oz: number, fx: number, fz: number, len: number, tx: number, tz: number): { off: number; along: number } {
  const dx = tx - ox;
  const dz = tz - oz;
  const along = dx * fx + dz * fz;
  const c = Math.max(0, Math.min(len, along));
  return { off: Math.hypot(dx - fx * c, dz - fz * c), along };
}
