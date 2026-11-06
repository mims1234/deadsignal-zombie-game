/**
 * The wards' upper floors belong to the sundown cases: a few sleep up there from the start (in the beds, by the night
 * desk), and while anyone is up on a floor more climb in through its windows, one every `UPSTAIRS_RUSH.every` seconds
 * while fewer than `UPSTAIRS_RUSH.cap` are on that floor. They come in at the window farthest from whoever is up there.
 *
 * Shared by the browser game (solo) and the co-op simulation: it only needs the zombie manager, the level and a random
 * source. A co-op guest never runs it (its infected are the simulation's puppets).
 */
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { Level } from '../world/level';
import { UPSTAIRS, UPSTAIRS_RUSH } from './nightConfig';

type Floor = 'nurses' | 'nine';

/** Where they lie at the start, and the windows they climb in by (x, z on each floor; y is `UPSTAIRS.y`). */
const RESIDENTS: Record<Floor, readonly [number, number, 'shambler' | 'runner'][]> = {
  // the dormitory and the Matron's office
  nurses: [[-25, -6, 'shambler'], [-19, -2.5, 'shambler'], [-23.5, 6, 'runner'], [-21, -16.5, 'shambler']],
  // the long ward and the night station
  nine: [[19.5, -9, 'shambler'], [24.5, -5.5, 'runner'], [19.5, -0.5, 'shambler'], [24.5, 3, 'shambler'], [22, -17.5, 'runner']],
};
const WINDOWS: Record<Floor, readonly [number, number][]> = {
  // just inside the outer wall's windows (and the far end's)
  nurses: [[-26.2, -10], [-26.2, -4.2], [-26.2, 4], [-26, 8.6], [-18, -20.8]],
  nine: [[26.2, -10], [26.2, -3], [26.2, 4], [22, 8.8], [26, -20.8]],
};

/** Which floor (x, y, z) is on, if either. */
function floorOf(x: number, y: number, z: number): Floor | null {
  if (y < UPSTAIRS.y - 1.2 || z < -22.5 || z > 10.5) return null;
  if (x > -29.5 && x < -14.5) return 'nurses';
  if (x > 14.5 && x < 29.5) return 'nine';
  return null;
}

export class UpstairsRush {
  private readonly t: Record<Floor, number> = { nurses: 0, nine: 0 };

  constructor(
    private readonly zombies: ZombieManager,
    private readonly level: Level,
  ) {}

  private spawnAt(x: number, z: number, type: 'shambler' | 'runner', rng: Rng, ambient: boolean): void {
    const y = UPSTAIRS.y;
    const area = this.level.floors.areaAt(x, y + 0.5, z);
    this.zombies.spawn(type, x, z, rng, { y, area: area >= 0 ? area : undefined, ambient, ...(ambient ? {} : { state: 'chase' as const }) });
  }

  /** A fresh run: the sleepers in their beds. */
  reset(rng: Rng): void {
    this.t.nurses = 0;
    this.t.nine = 0;
    for (const f of ['nurses', 'nine'] as const) for (const [x, z, type] of RESIDENTS[f]) this.spawnAt(x, z, type, rng, true);
  }

  /** How many are up on each floor now. */
  private counts(): Record<Floor, number> {
    const n: Record<Floor, number> = { nurses: 0, nine: 0 };
    for (const z of this.zombies.zombies) {
      if (!z.alive || z.isBoss) continue;
      const f = floorOf(z.x, z.y ?? 0, z.z);
      if (f) n[f]++;
    }
    return n;
  }

  /** Every tick: while somebody is up on a floor, another climbs in now and then. */
  update(dt: number, players: readonly { x: number; y: number; z: number; alive: boolean }[], rng: Rng): void {
    const up: Record<Floor, { x: number; z: number }[]> = { nurses: [], nine: [] };
    for (const p of players) {
      if (!p.alive) continue;
      const f = floorOf(p.x, p.y, p.z);
      if (f) up[f].push(p);
    }
    let counts: Record<Floor, number> | null = null;
    for (const f of ['nurses', 'nine'] as const) {
      if (up[f].length === 0) {
        this.t[f] = Math.min(this.t[f], UPSTAIRS_RUSH.every * 0.5); // the first comes a little after you arrive
        continue;
      }
      this.t[f] += dt;
      if (this.t[f] < UPSTAIRS_RUSH.every) continue;
      this.t[f] = 0;
      counts ??= this.counts();
      if (counts[f] >= UPSTAIRS_RUSH.cap) continue;
      // the window farthest from everyone up here
      let best = WINDOWS[f][0]!;
      let bestD = -1;
      for (const w of WINDOWS[f]) {
        let d = Infinity;
        for (const p of up[f]) d = Math.min(d, Math.hypot(w[0] - p.x, w[1] - p.z));
        if (d > bestD) {
          bestD = d;
          best = w;
        }
      }
      if (bestD < 5) continue; // nobody climbs in under your nose
      this.spawnAt(best[0], best[1], rng.f() < UPSTAIRS_RUSH.runners ? 'runner' : 'shambler', rng, false);
      counts[f]++;
    }
  }
}
