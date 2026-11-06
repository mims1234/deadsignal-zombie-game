/**
 * Who is where on the Sakura District, and when they come (the solo game and the co-op simulation both run it): what
 * kind each infected spawned in a zone becomes, the Kurenai Court's sentries on the container decks and round their
 * fires, the stalker who comes for you once you have been in the district a while - and the lures.
 *
 * Nobody appears out of the air at a story moment: the district's spawning never stops (the zombie manager's own
 * director, from out of sight), its rate rises as the story goes on (`pressure`), and every loud moment draws the dead
 * for a while (`lure`): the station's lights and its announcement, a charm taken, the lab's alarm, the lanterns going
 * out, the bell - mostly the kinds that live there. The waves that matter (the lanterns, the procession) come from the
 * map's own spawn points through `ZombieManager.queue`.
 */
import { sakuraVariant, type ZombieVariant } from '../enemies/variants';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';
import type { Level } from '../world/level';
import { ZONES } from '../world/layout/sakura/consts';

/** What a lure draws, by the type the director spawns. */
export type LureKinds = Partial<Record<ZombieType, ZombieVariant>>;

/** `ZombieManager.pickVariant` for the Sakura District: by the zone (and floor) an infected is spawned on, or, while a lure is on, mostly the kind it draws. */
export function sakuraVariantPicker(level: Level, lure?: () => LureKinds | null): (type: ZombieType, x: number, z: number, y: number, rng: Rng) => ZombieVariant {
  const fl = level.floors;
  const kisaragi = level.sakura?.kisaragi.area ?? -1;
  return (type, x, z, y, rng) => {
    const drawn = lure?.()?.[type];
    if (drawn && rng.f() < 0.7) return drawn;
    const area = fl.areaAt(x, y, z);
    const kind = fl.areas[area]?.kind;
    let zone = 'street';
    if (area === kisaragi) zone = 'kisaragi';
    else if (kind === 'under') zone = 'under';
    else {
      for (const [name, r] of Object.entries(ZONES)) {
        if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
          zone = name;
          break;
        }
      }
    }
    return sakuraVariant(type, { zone, raised: kind === 'upper' }, () => rng.f());
  };
}

/** A rectangle of ground. */
type Ground = { x0: number; z0: number; x1: number; z1: number };
const inside = (r: Ground, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const within = (r: Ground, m: number): Ground => ({ x0: r.x0 + m, z0: r.z0 + m, x1: r.x1 - m, z1: r.z1 - m });

/**
 * `ZombieManager.territoryOf` for the Sakura District: the Empress keeps to her theatre's compound, the Court to the
 * ground it was found on (the theatre's compound or the freight yard). They hold it and shoot from its edge; they do not
 * follow anyone down the streets, so the district can be crossed without bringing them along.
 */
export function sakuraTerritory(): (z: { isBoss: boolean; variant: string; x: number; z: number }) => Ground | null {
  const theatre = within(ZONES.theatre, 1.4);
  const freight = within(ZONES.freight, 1.2);
  return (z) => {
    if (z.isBoss) return theatre;
    if (z.variant !== 'court') return null;
    if (inside(ZONES.freight, z.x, z.z)) return freight;
    if (inside(ZONES.theatre, z.x, z.z)) return theatre;
    return null;
  };
}

/**
 * The Empress's hunt opens at her moment, not before (she is not on the map until then): once the trees are red and
 * someone has brought back what Kisaragi kept (a relic), so she is faced with it.
 */
export function empressAwake(phase: string, marks: number): boolean {
  return phase === 'bloom' && (marks & 0b100000) !== 0;
}

/** The Empress's health, against the Warden's (she has been fed for seven years). */
export const EMPRESS_HP = 2;

/** A run's start: the Court's sentries up on the container decks and round the fires before the theatre. */
export function populateSakura(zm: ZombieManager, level: Level, rng: Rng): void {
  const h = level.sakura;
  if (!h) return;
  for (const d of h.freight.decks) {
    for (const dz of [0, 9]) zm.spawn('shambler', d.x, d.z + dz, rng, { ambient: true, y: d.y, area: d.area, variant: 'court', yaw: Math.PI });
  }
  for (const f of h.theatre.fires) {
    for (let i = 0; i < 2; i++) {
      const a = rng.f() * Math.PI * 2;
      zm.spawn('shambler', f.x + Math.cos(a) * 2.2, f.z + Math.sin(a) * 2.2, rng, { ambient: true, variant: 'court', yaw: a + Math.PI });
    }
  }
}

/** The stalker: after a while in the district she comes, from somewhere behind and out of sight. Once a run. */
export class Stalker {
  private t = 0;
  spawned = false;
  /** Seconds in before she comes. */
  static readonly AFTER = 110;

  reset(): void {
    this.t = 0;
    this.spawned = false;
  }

  /** Returns true the moment she is out there. */
  update(dt: number, zm: ZombieManager, level: Level, players: readonly { x: number; z: number; alive: boolean }[], rng: Rng): boolean {
    if (this.spawned) return false;
    this.t += dt;
    if (this.t < Stalker.AFTER) return false;
    const up = players.filter((p) => p.alive);
    if (up.length === 0) return false;
    // a spawn point 30-55 m from the nearest player, none of them able to see it
    const world = level.world;
    const ok = level.data.spawnPoints.filter((s) => {
      const d = Math.min(...up.map((p) => Math.hypot(p.x - s.x, p.z - s.z)));
      return d > 30 && d < 55 && up.every((p) => world.segmentBlocked(p.x, 1.6, p.z, s.x, 1.5, s.z, 'shots'));
    });
    if (ok.length === 0) return false;
    const s = ok[Math.floor(rng.f() * ok.length)]!;
    zm.spawn('runner', s.x, s.z, rng, { state: 'chase', variant: 'kuchisake' });
    this.spawned = true;
    return true;
  }
}

/** A lure: seconds left, how much faster the dead come, how many more at once, and what kinds mostly. */
interface Lure {
  t: number;
  mul: number;
  cap: number;
  kinds: LureKinds;
}

/** The moments that draw the dead, and how hard (seconds, rate, extra at once, kinds). */
export const LURES = {
  power: { t: 40, mul: 2.2, cap: 4, kinds: { shambler: 'commuter', runner: 'jorogumo' } },
  charm: [
    { t: 35, mul: 2, cap: 3, kinds: { shambler: 'commuter', runner: 'jorogumo' } },
    { t: 35, mul: 2, cap: 3, kinds: { runner: 'rooted' } },
    { t: 35, mul: 2, cap: 3, kinds: { shambler: 'bloomed' } },
    { t: 35, mul: 2, cap: 3, kinds: { runner: 'rooted', shambler: 'bloomed' } },
    { t: 40, mul: 2.2, cap: 4, kinds: { armored: 'oni', runner: 'jorogumo' } },
  ],
  key: { t: 30, mul: 1.8, cap: 3, kinds: {} },
  flame: { t: 45, mul: 2, cap: 4, kinds: { shambler: 'bloomed', runner: 'rooted' } },
  lab: { t: 40, mul: 2, cap: 3, kinds: { armored: 'oni', runner: 'jorogumo' } },
  tied: { t: 30, mul: 1.8, cap: 3, kinds: { shambler: 'miko' } },
  wrong: { t: 25, mul: 3, cap: 6, kinds: {} },
  bloom: { t: 70, mul: 2.4, cap: 6, kinds: { shambler: 'bloomed', runner: 'rooted' } },
  procession: { t: 50, mul: 2, cap: 8, kinds: { shambler: 'bloomed', runner: 'rooted', armored: 'oni' } },
} as const satisfies Record<string, { t: number; mul: number; cap: number; kinds: LureKinds } | readonly { t: number; mul: number; cap: number; kinds: LureKinds }[]>;

/**
 * The district's pressure (the solo runtime and the co-op simulation each run one for whoever spawns): a base rate that
 * rises with the story, times the strongest lure going.
 */
export class SakuraDirector {
  private lure: Lure = { t: 0, mul: 1, cap: 0, kinds: {} };
  /** How far the story has come (0..1): the base rate rises with it. */
  progress = 0;

  constructor(private readonly zombies: ZombieManager) {}

  reset(): void {
    this.lure = { t: 0, mul: 1, cap: 0, kinds: {} };
    this.progress = 0;
    this.zombies.rateMul = 1;
    this.zombies.capBonus = 0;
  }

  /** What the current lure draws (none when nothing is). */
  get kinds(): LureKinds | null {
    return this.lure.t > 0 ? this.lure.kinds : null;
  }

  /** A loud moment: for `t` seconds `mul` times the spawn rate and `cap` more at once (the stronger lure wins). */
  draw(l: { t: number; mul: number; cap: number; kinds: LureKinds }): void {
    const now = this.lure;
    if (now.t > 0 && (now.mul - 1) * now.t > (l.mul - 1) * l.t) return;
    this.lure = { t: l.t, mul: l.mul, cap: l.cap, kinds: { ...l.kinds } };
  }

  tick(dt: number): void {
    const l = this.lure;
    l.t = Math.max(0, l.t - dt);
    // the base: a little busier from the start, up to half as busy again by the end of the story
    const base = 1.15 + 0.45 * Math.min(1, Math.max(0, this.progress));
    const k = l.t > 0 ? Math.min(1, l.t / 6) : 0; // a lure eases off over its last seconds
    this.zombies.rateMul = base * (1 + (l.mul - 1) * k);
    this.zombies.capBonus = Math.round(l.cap * k) + Math.round(2 * this.progress);
  }
}
