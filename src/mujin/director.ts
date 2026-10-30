/**
 * The station's infected, job by job (no THREE): the solo game and the co-op simulation both run one (whoever runs the
 * infected). Every job answers: the tunnel's crawlers come for whoever takes the key, the dead come for every ticket
 * picked up, the road fills while the crossing powers up, the hall while the announcement plays, the shrine wakes
 * when someone comes for its rope. The White Shape stands in the field, the Bench Sitter waits in the waiting room,
 * the Tall Lady walks from the first lamp on (one more each time the night takes an area), and the Stationmaster
 * walks platform 1 from the first lamp, beyond harm until the fifth.
 */
import { mujinVariant, type ZombieVariant } from '../enemies/variants';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';
import type { Level } from '../world/level';
import { MujinJobs, type JobsEvent, type JobsView, type Stand, REN_STATE } from './jobs';
import { MUJIN, MUJIN_POCKET, PLACES, SEALS, SHAPE_SPOTS, sealedAt } from './places';

/** `ZombieManager.pickVariant` for the station. */
export function mujinVariantPicker(): (type: ZombieType, x: number, z: number, y: number, rng: Rng) => ZombieVariant {
  return (type, x, z, _y, rng) => mujinVariant(type, x, z, () => rng.f());
}

/** Never in the pocket room. */
export function mujinSpawnAllowed(): (x: number, z: number) => boolean {
  return (x, z) => z < MUJIN_POCKET.z0 - 4;
}

export class MujinDirector {
  private sitterT = 0;
  private shrineWoken = false;
  private tallFor = 0;

  constructor(
    level: Level,
    private readonly zombies: ZombieManager,
  ) {
    void level;
  }

  /** A new run: the Stationmaster `populate` placed is sent away (he comes with the first lamp). */
  reset(rng: Rng): void {
    this.sitterT = 0;
    this.shrineWoken = false;
    this.tallFor = 0;
    this.zombies.vanish((z) => z.isBoss);
    const s = SHAPE_SPOTS[Math.floor(rng.f() * SHAPE_SPOTS.length)]!;
    this.zombies.spawn('shambler', s.x, s.z, rng, { ambient: true, variant: 'shape', yaw: 0 });
  }

  /** Hunting infected, `n` of `type` round (x, z). */
  private horde(type: ZombieType, n: number, x: number, z: number, r: number, rng: Rng, variant?: ZombieVariant): void {
    for (let i = 0; i < n; i++) {
      const a = rng.f() * Math.PI * 2;
      const d = r * (0.6 + rng.f() * 0.4);
      this.zombies.spawn(type, x + Math.cos(a) * d, z + Math.sin(a) * d, rng, { state: 'chase', variant });
    }
  }

  private tall(rng: Rng, sealed: number): void {
    const spots = [
      { x: 44, z: 30, area: 1 },
      { x: -44, z: 22, area: 0 },
      { x: -40, z: -20, area: 2 },
      { x: 30, z: -32, area: -1 },
      { x: -12, z: -33, area: -1 },
    ];
    // she comes out of what the night has taken, when it has taken anything
    const from = spots.filter((s) => s.area >= 0 && sealed & (1 << s.area));
    const list = from.length ? from : spots;
    const s = list[Math.floor(rng.f() * list.length)]!;
    this.zombies.spawn('runner', s.x, s.z, rng, { ambient: true, variant: 'tall', yaw: rng.f() * Math.PI * 2 });
  }

  /** What each of the jobs' moments brings. */
  onEvent(e: JobsEvent, v: JobsView, rng: Rng): void {
    switch (e.kind) {
      case 'key':
        this.horde('runner', 4, -40, 0, 4, rng, 'crawler');
        break;
      case 'ticket':
        this.horde('shambler', 3, e.x, e.z, 9, rng);
        break;
      case 'breaker':
        if (e.all) {
          this.horde('runner', 3, 39, -32, 4, rng);
          this.horde('shambler', 5, 39, 8, 4, rng);
        }
        break;
      case 'announcing':
        this.horde('shambler', 5, -5, -30, 5, rng);
        this.horde('runner', 3, -24, -6, 3, rng);
        break;
      case 'seal': {
        const r = SEALS[e.i]!.rect;
        this.horde('shambler', 4, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 8, rng);
        break;
      }
      default:
        break;
    }
    void v;
  }

  /**
   * Every frame on whoever runs the infected. Returns the Stationmaster's state for the hunt ('away' before the first
   * lamp, 'walk' beyond harm, 'open' at dawn) and whether the Tall Lady has reached Ren.
   */
  step(dt: number, v: JobsView, stand: readonly Stand[], rng: Rng): { master: 'away' | 'walk' | 'open'; renTaken: boolean } {
    const zm = this.zombies;
    const lamps = MujinJobs.lamps(v);
    // the Bench Sitter: on the bench, and back a while after it is gone
    this.sitterT -= dt;
    if (this.sitterT <= 0) {
      this.sitterT = 90;
      if (!zm.zombies.some((z) => z.variant === 'sitter' && z.alive)) zm.spawn('shambler', MUJIN.bench.x - 1.6, MUJIN.bench.z - 0.1, rng, { ambient: true, variant: 'sitter', yaw: 0 });
    }
    // the Tall Lady walks from the first lamp on (one more each time the night takes an area)
    const want = (lamps >= 1 ? 1 : 0) + countBits(v.sealed);
    if (want > this.tallFor) {
      this.tallFor = want;
      this.tall(rng, v.sealed);
    }
    // the shrine wakes when someone comes for its rope
    if (!this.shrineWoken && !MujinJobs.isDone(v, 'rope') && stand.some((p) => p.up && Math.hypot(p.x - PLACES.rope.x, p.z - PLACES.rope.z) < 14)) {
      this.shrineWoken = true;
      this.horde('shambler', 4, PLACES.rope.x, PLACES.rope.z, 7, rng);
      zm.spawn('runner', 46, 33, rng, { state: 'chase', variant: 'tall' });
    }
    // Ren: the Tall Lady takes her if she reaches her before the bench
    let renTaken = false;
    if (v.ren === REN_STATE.here) {
      for (const z of zm.zombies) if (z.variant === 'tall' && z.alive && Math.hypot(z.x - v.renX, z.z - v.renZ) < 2) renTaken = true;
    }
    const master = v.dawn ? 'open' : lamps >= 1 ? 'walk' : 'away';
    const boss = zm.boss;
    if (boss) boss.invulnerable = master !== 'open';
    return { master, renTaken };
  }
}

function countBits(n: number): number {
  let c = 0;
  for (let i = 0; i < 8; i++) if (n & (1 << i)) c++;
  return c;
}

/** Standing in an area the night has taken (its mist hurts). */
export function inNight(sealed: number, x: number, z: number): boolean {
  return sealedAt(sealed, x, z);
}
