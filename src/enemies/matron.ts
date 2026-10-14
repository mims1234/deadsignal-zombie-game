/**
 * THE MATRON: the Asylum's boss. Blackwood Hill's head nurse, forty days into the dark and still doing her rounds of the
 * isolation block - the infection's elite. On the Asylum every 'warden'-type infected is her: the Warden's AI (melee,
 * slam, charge, rage below half health) with her own stats (`MATRON_DEF`), her own model (`matronRig.ts`) and three
 * abilities of her own:
 *   The Shriek   when she notices you, and every so often mid-hunt, she stops and screams: every idle infected within
 *                40 m comes for the player she screams at, and players near her feel it (screen edges darken, shake).
 *   Lights out   lamps near her stutter and fail (`lampDim`, applied by the renderer's light pool).
 *   Her rounds   with nobody seen for a while she walks a fixed route through the isolation block and the back walk,
 *                stopping at cell doors, instead of standing at her post.
 * Gameplay (the shriek's alert, the rounds) is pure logic and runs in the headless co-op simulation too; everything a
 * player sees or hears goes through `fx`, which only a browser sets. A co-op guest learns of a shriek from the boss's
 * `shrieking` flag in the host's reports, so its own `watch` raises the same effects.
 */
import { ZOMBIES, type ZombieDef } from '../config';
import type { PlayerRef, Zombie, ZombieEnv } from './zombie';
import type { ZombieFactory, ZombieRig } from './zombieRigTypes';

/** Her stats. The manager's difficulty tuning scales health, damage, speed and sight on top, as for every infected. */
export const MATRON_DEF: ZombieDef = {
  ...ZOMBIES.warden,
  name: 'THE MATRON',
  hp: 3000,
  speedWalk: 1.9,
  speedChase: 3.0,
  speedVariance: 0,
  radius: 0.42,
  height: 2.6,
  headRadius: 0.2,
  damage: 46,
  attackRange: 2.6,
  attackWindup: 0.75,
  attackStrike: 0.18,
  attackRecovery: 0.8,
  bodyMul: 0.55,
  headMul: 0.85,
  poise: 520,
  staggerTime: 0.9,
  reward: 500,
  headshotBonus: 180,
  sightRange: 42,
  turnRate: 3.0,
  dropChance: 0,
  roar: 'matron_shriek',
};

export interface RouteStop {
  x: number;
  z: number;
  /** Seconds she stands here (looking in at a cell, listening at the door). */
  pause: number;
}

export const MATRON = {
  /** Idle infected this close to her when she shrieks come for the player she shrieks at. */
  shriekRadius: 40,
  /** Seconds into her cry when it goes out. */
  shriekAt: 0.35,
  /** Mid-hunt she stops to shriek again this often (s), when a player is within `shriekRange`. */
  shriekEvery: 17,
  shriekRange: 28,
  /** How long a mid-hunt shriek holds her (s). */
  shriekDuration: 1.7,
  /** Players within this distance feel it (screen edges, shake), strongest close up. */
  feelRadius: 24,
  /** Lamps within this distance of her stutter and fail. */
  lightsRadius: 13,
  /** For a moment after a shriek the lights go out this far. */
  shriekLightsRadius: 24,
  /** Seconds standing at her post (or where she lost you) before she walks her rounds. */
  roundsAfter: 6,
  /** Further than this from her route she is off her rounds (the lair guard brings her back while nobody watches). */
  routeSlack: 9,
  /** A step of her keys while she walks (s). */
  keysEvery: 1.15,
  /**
   * Her rounds, in order and back to the start: the isolation hall (looking in at two cells), out through the south
   * door, along the back walk towards the chapel and the morgue and back in (the yard is behind its own gate).
   * Every leg is clear for her (tests/matron.test.ts) and the whole route lies
   * inside the hunt's search area, so walking it never "reveals" her.
   */
  route: [
    { x: 0, z: -33.5, pause: 2.5 },
    { x: -5.5, z: -34.6, pause: 0 },
    { x: -2.4, z: -36.4, pause: 2 },
    { x: 2.4, z: -36.4, pause: 2 },
    { x: 6, z: -34.2, pause: 0 },
    { x: 0.4, z: -31.6, pause: 0 },
    { x: 0, z: -27.5, pause: 1.5 },
    { x: -6, z: -26, pause: 0 },
    { x: -10, z: -25.2, pause: 1.5 },
    { x: -5, z: -26.5, pause: 0 },
    { x: 0, z: -27, pause: 0 },
    { x: 5, z: -26.5, pause: 0 },
    { x: 10, z: -25.2, pause: 1.5 },
    { x: 5, z: -26, pause: 0 },
    { x: 0, z: -28.5, pause: 0 },
    { x: 0, z: -31, pause: 0 },
  ] as readonly RouteStop[],
};

/** The Matron is the boss of this map. */
export function isMatronMap(data: { id: string }): boolean {
  return data.id === 'asylum';
}

/** Her model from a rig factory: the browser's builds her (`matronRig.ts`); one without (headless) stands in a Warden's. */
export function createMatronRig(factory: ZombieFactory, seed: number): ZombieRig {
  return factory.createMatron?.(seed) ?? factory.create('warden', seed);
}

/** What players see and hear of her (set by the game in a browser; absent in the headless simulation). */
export interface MatronFx {
  /** She shrieked at (x, z). */
  shriek(x: number, z: number): void;
  /** Her keys, one step of her walk at (x, z). */
  keys(x: number, z: number): void;
}

/**
 * The Shriek's alert: every idle infected within `radius` of (x, z) (except her, `srcId`) hears the player at (tx, tz)
 * and comes - the nearest first. Sleeping ones wake. Returns how many were roused. Pure logic.
 */
export function shriekAlert(list: readonly Zombie[], x: number, z: number, tx: number, tz: number, radius: number, srcId: number): number {
  let n = 0;
  for (const q of list) {
    if (q.id === srcId || !q.active || q.state !== 'idle' || q.curable) continue;
    const d = Math.hypot(q.x - x, q.z - z);
    if (d > radius) continue;
    if (q.dormant) {
      q.dormant = false;
      q.rig.setVisible(true);
    }
    q.hear(tx, tz, 0.15 + (d / radius) * 1.1);
    n++;
  }
  return n;
}

const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Distance from (x, z) to the segment a-b. */
function segDist(x: number, z: number, a: RouteStop, b: RouteStop): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
}

/** Her abilities and their presentation. The zombie manager owns one on the Asylum (`zombies.matron`). */
export class MatronBrain {
  fx: MatronFx | null = null;
  private boss: Zombie | null = null;
  private prevState = '';
  /** Seconds until the cry she has begun goes out (-1: none pending). */
  private pending = -1;
  /** Seconds the `shrieking` flag stays up after a shriek. */
  private hold = 0;
  private sinceShriek = 0;
  // her rounds
  private leg = -1;
  private paused = false;
  private lastD = Infinity;
  private world: ZombieEnv['world'] | null = null;
  // presentation
  private wasShrieking = false;
  private clock = 0;
  private shriekAtClock = -99;
  private keysT = 0;
  private lastX = NaN;
  private lastZ = NaN;
  /** Where she stands for the lights (NaN: no living Matron). */
  private bx = NaN;
  private bz = NaN;

  /** Shrieks so far (tests, diagnostics). */
  shrieks = 0;

  /**
   * One step of her abilities where the simulation runs (single player, the co-op host): `all` is every infected,
   * `players` everyone she could hunt. Then her presentation (`watch`).
   */
  update(dt: number, boss: Zombie | null, all: readonly Zombie[], players: readonly PlayerRef[], env: ZombieEnv): void {
    if (boss !== this.boss) this.adopt(boss);
    this.world = env.world;
    if (boss && boss.alive && !boss.puppet) {
      if (boss.idleRoute !== this.nextStop) boss.idleRoute = this.nextStop;
      if (boss.state !== 'idle') this.leg = -1; // after a hunt she picks her rounds up again from where she is
      this.sinceShriek += dt;
      // a cry begins whenever she goes on alert (noticing someone, or a mid-hunt shriek); it goes out a beat later
      if (boss.state === 'alert' && this.prevState !== 'alert') this.pending = MATRON.shriekAt;
      this.prevState = boss.state;
      if (this.pending >= 0 && (this.pending -= dt) < 0) {
        this.pending = -1;
        if (boss.state === 'alert') this.cry(boss, all, players);
      }
      if (this.hold > 0 && (this.hold -= dt) <= 0) boss.shrieking = false;
      // mid-hunt: stop and shriek again
      if (boss.state === 'chase' && this.sinceShriek > MATRON.shriekEvery) {
        const t = nearest(boss, players);
        if (t && Math.hypot(t.x - boss.x, t.z - boss.z) < MATRON.shriekRange) boss.shriek(MATRON.shriekDuration, env);
      }
    }
    this.watch(dt, boss);
  }

  private adopt(boss: Zombie | null): void {
    this.boss = boss;
    this.prevState = boss?.state ?? '';
    this.pending = -1;
    this.hold = 0;
    this.sinceShriek = 0;
    this.leg = -1;
    this.paused = false;
    this.wasShrieking = boss?.shrieking ?? false;
    this.lastX = this.lastZ = NaN;
  }

  /** The Shriek goes out. */
  private cry(boss: Zombie, all: readonly Zombie[], players: readonly PlayerRef[]): void {
    this.shrieks++;
    this.sinceShriek = 0;
    boss.shrieking = true;
    this.hold = 1.1;
    const t = nearest(boss, players);
    if (t) shriekAlert(all, boss.x, boss.z, t.x, t.z, MATRON.shriekRadius, boss.id);
  }

  /** Her rounds (`Zombie.idleRoute`): the next stop, or null to stand at her post a while first. */
  private readonly nextStop = (z: Zombie): { x: number; z: number; wait: number } | null => {
    if (z.stateTime < MATRON.roundsAfter) {
      this.leg = -1; // just calmed down (or brought back to her post): she picks the route up afresh
      return null;
    }
    const R = MATRON.route;
    if (this.leg < 0) {
      // join the route at the nearest stop she can walk straight to; none: she lingers (the lair guard takes her home)
      let best = Infinity;
      for (let i = 0; i < R.length; i++) {
        const d = Math.hypot(R[i]!.x - z.x, R[i]!.z - z.z);
        if (d < best && !this.world?.segmentBlocked(z.x, 0.9, z.z, R[i]!.x, 0.9, R[i]!.z, 'move')) {
          best = d;
          this.leg = i;
        }
      }
      if (this.leg < 0) return null;
      this.paused = false;
      this.lastD = Infinity;
    } else {
      const s = R[this.leg]!;
      const d = Math.hypot(s.x - z.x, s.z - z.z);
      if (d < 1.2) {
        if (s.pause > 0 && !this.paused) {
          // there: stand and look a while
          this.paused = true;
          return { x: z.x, z: z.z, wait: s.pause };
        }
        this.leg = (this.leg + 1) % R.length;
        this.paused = false;
        this.lastD = Infinity;
      } else if (d > this.lastD - 0.5) {
        // not getting there (something in the way): on to the next stop
        this.leg = (this.leg + 1) % R.length;
        this.paused = false;
        this.lastD = Infinity;
      } else {
        this.lastD = d;
      }
    }
    const s = R[this.leg]!;
    if (this.lastD === Infinity) this.lastD = Math.hypot(s.x - z.x, s.z - z.z);
    return { x: s.x, z: s.z, wait: 0 };
  };

  /** Off her rounds: further than `routeSlack` from every leg of the route. */
  offRoute(z: { x: number; z: number }): boolean {
    const R = MATRON.route;
    for (let i = 0; i < R.length; i++) if (segDist(z.x, z.z, R[i]!, R[(i + 1) % R.length]!) <= MATRON.routeSlack) return false;
    return true;
  }

  /**
   * Presentation, wherever she is drawn: a shriek starting (her `shrieking` flag going up - on a co-op guest it comes
   * with the host's report) and her keys while she moves. Also keeps where she is for the lights.
   */
  watch(dt: number, boss: Zombie | null): void {
    this.clock += dt;
    if (!boss || !boss.alive) {
      this.bx = this.bz = NaN;
      this.wasShrieking = false;
      return;
    }
    this.bx = boss.x;
    this.bz = boss.z;
    if (boss.shrieking && !this.wasShrieking) {
      this.shriekAtClock = this.clock;
      this.fx?.shriek(boss.x, boss.z);
    }
    this.wasShrieking = boss.shrieking;
    const moved = Number.isNaN(this.lastX) || dt <= 0 ? 0 : Math.hypot(boss.x - this.lastX, boss.z - this.lastZ) / dt;
    this.lastX = boss.x;
    this.lastZ = boss.z;
    if (moved > 0.35) {
      this.keysT -= dt * Math.min(2.5, 0.6 + moved * 0.4);
      if (this.keysT <= 0) {
        this.keysT = MATRON.keysEvery;
        this.fx?.keys(boss.x, boss.z);
      }
    }
  }

  /**
   * Lights out: an intensity multiplier (0..1) for a lamp at (x, z). Near her the lamps stutter and mostly fail; for a
   * moment after a shriek they go out further away. 1 when there is no living Matron.
   */
  lampDim(x: number, z: number): number {
    if (Number.isNaN(this.bx)) return 1;
    const d = Math.hypot(x - this.bx, z - this.bz);
    const since = this.clock - this.shriekAtClock;
    const reach = since < 1.6 ? MATRON.shriekLightsRadius : MATRON.lightsRadius;
    if (d >= reach) return 1;
    const k = 1 - d / reach;
    // each lamp stutters on its own beat: mostly dying, now and then catching for a moment
    const f = hash(Math.floor(this.clock * 9 + x * 0.37 + z * 0.91));
    const out = since < 1.6 ? 0.95 : f > 0.3 ? 0.88 : 0.35;
    return 1 - Math.min(1, k * 1.6) * out;
  }
}

function nearest(boss: Zombie, players: readonly PlayerRef[]): PlayerRef | null {
  let best: PlayerRef | null = null;
  let bd = Infinity;
  for (const p of players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - boss.x, p.z - boss.z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
