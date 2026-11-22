/**
 * HIRASAKA: THE UMIBŌZU (no THREE, no DOM). The storm giant past the seawall, Act I's set piece: whoever runs the infected
 * (`director.ts`: the solo game and the co-op simulation) runs this; the story carries its state to every screen (`ua`,
 * `ub`); `bossLook.ts` draws it and `bosses.ts` puts the prompt and the HUD's line on it.
 *
 * It wades up and down off the seafront. When anyone is on the seafront (Shio-furi Street and the seawall) it rises to
 * its chest, lifts the sea in both arms (the WIND-UP: its face and chest are over the seawall and a harpoon can reach
 * them) and throws it: the water comes down on the street at the giant's place and runs east along one LANE of the
 * seafront (the seaward half under the seawall, or the landward half by the houses) toward the winch and the pier. A
 * white wall of water a man high, seen coming the length of the street: step into the other lane, up a stair or into a
 * doorway. It hurts and throws you; it never kills on its own.
 *
 * A harpoon hit (the Mori, `story.ts` `umiHit`) while it is up makes it drop what it holds: the wave comes down on the
 * street there and then, and it reels, sinks lower and comes on angrier (quicker throws; after the second hit, one wave
 * in each lane, a moment apart). A hit also makes it WARY: its next throw comes from low in the water, shoulders under
 * the seawall's line and its face behind its arms (GUARDED: nothing to harpoon, only a wave to get out of), and only
 * the throw after that brings it up over the wall again. So every round is a guarded wave, then an open throw and a
 * harpoon. Three hits sink it (about a minute of fighting). Nothing is timed for the player: it throws while someone is
 * on the seafront and only looms while nobody is.
 */
import type { Rng } from '../logic/rng';
import { UMIBOZU } from './places';

/** Someone standing somewhere (by seat). */
interface Stand {
  x: number;
  y: number;
  z: number;
  up: boolean;
}

/** A blow that landed on a player (`i`: their index in the `stand` the director was given). */
export interface Hurt {
  i: number;
  amount: number;
  x: number;
  z: number;
  knock: number;
}

export const UMI = {
  /** Where it wades (x), how far out (z), how fast. */
  x0: -130,
  x1: 24,
  z: UMIBOZU.rise.z,
  wade: 3.2,
  /** The seafront: where the waves run, and its two lanes (z ranges). */
  front: { x0: -160, x1: 70, z0: 54, z1: 76 },
  lanes: [
    [65.5, 76],
    [54, 65.5],
  ] as const,
  /** The wind-up (exposed), the throw (still exposed), a reel after a hit; seconds of wading between throws, by hits. */
  windup: 2.6,
  throw_: 0.8,
  reel: 6,
  gap: [10, 9, 8],
  /** A wave: its speed east (m/s), how thick it is along the street, how high it stands, what it does to whoever it hits. */
  wave: { speed: 10, half: 1.7, top: 2.8, damage: 26, knock: 12 },
  /** After the second hit a second wave follows the first in the other lane this much later. */
  follow: 1.6,
  /** A harpoon reaches it within this of its chest while it is up. */
  bodyR: 11,
  bodyY: 12,
} as const;

/** What it is doing. */
export const UMODE = { down: 0, wade: 1, windup: 2, throw_: 3, reel: 4, sunk: 5 } as const;

interface Wave {
  x: number;
  lane: number;
  /** Seats it has already thrown (each player once). */
  hit: number;
  live: boolean;
  /** Seconds before it comes down (a second wave waits for its moment). */
  wait: number;
}

/** The two numbers every screen is sent (`StoryView.ua`, `ub`). */
export const Umi = {
  mode: (ua: number): number => ua & 7,
  x: (ua: number): number => ((ua >> 3) & 255) - 150,
  /** How far through the wind-up (0..1). */
  lift: (ua: number): number => ((ua >> 11) & 15) / 15,
  /** This throw comes from low in the water, its face behind its arms (wary after a hit): nothing to harpoon. */
  guarded: (ua: number): boolean => ((ua >> 15) & 1) === 1,
  /** It is up over the seawall (the second half of an open wind-up, and the throw): a harpoon can reach it. */
  exposed: (ua: number): boolean => {
    const m = ua & 7;
    if ((ua >> 15) & 1) return false;
    return (m === UMODE.windup && ((ua >> 11) & 15) >= 7) || m === UMODE.throw_;
  },
  waves(ub: number): { x: number; lane: number }[] {
    const out: { x: number; lane: number }[] = [];
    for (let k = 0; k < 2; k++) {
      const w = (ub >> (k * 12)) & 0xfff;
      if ((w & 1) === 0) continue;
      out.push({ lane: (w >> 1) & 1, x: ((w >> 2) & 1023) / 4 - 170 });
    }
    return out;
  },
  /** The lane (0 seaward, 1 landward) a point on the seafront is in, or -1 off it. */
  laneAt(x: number, z: number): number {
    const F = UMI.front;
    if (x < F.x0 || x > F.x1 || z < F.z0 || z > F.z1) return -1;
    return z >= UMI.lanes[0][0] ? 0 : 1;
  },
};

export class UmiFight {
  mode: number = UMODE.down;
  x: number = UMIBOZU.rise.x;
  private t = 0;
  private goal = 0;
  private lane = 0;
  private hits = 0;
  /** Wary after a hit: the next throw is guarded (from low in the water). */
  private wary = false;
  /** The throw under way is a guarded one. */
  private guard = false;
  readonly waves: Wave[] = [0, 1].map(() => ({ x: 0, lane: 0, hit: 0, live: false, wait: 0 }));
  private hurts: Hurt[] = [];

  reset(): void {
    this.mode = UMODE.down;
    this.x = UMIBOZU.rise.x;
    this.t = 0;
    this.goal = 0;
    this.lane = 0;
    this.hits = 0;
    this.wary = false;
    this.guard = false;
    for (const w of this.waves) w.live = false;
    this.hurts = [];
  }

  /** It has risen (the winding engine's whistle). */
  rise(): void {
    if (this.mode !== UMODE.down) return;
    this.mode = UMODE.wade;
    this.t = 3;
    this.goal = this.x;
  }

  /** A harpoon hit (the story counted it): the throw stops, it reels; the third sinks it. */
  hit(n: number, sunk: boolean): void {
    this.hits = n;
    if (sunk) {
      this.mode = UMODE.sunk;
      for (const w of this.waves) w.live = false;
      return;
    }
    if (this.mode === UMODE.down) return;
    // what it held comes down on the street now
    if (this.mode === UMODE.windup) this.throwWave();
    this.mode = UMODE.reel;
    this.t = UMI.reel;
    this.wary = true;
    this.guard = false;
  }

  get word(): number {
    const lift = this.mode === UMODE.windup ? Math.round(Math.min(1, 1 - this.t / UMI.windup) * 15) : this.mode === UMODE.throw_ ? 15 : 0;
    const guard = this.guard && (this.mode === UMODE.windup || this.mode === UMODE.throw_) ? 1 : 0;
    return (this.mode & 7) | ((Math.max(0, Math.min(255, Math.round(this.x + 150))) & 255) << 3) | ((lift & 15) << 11) | (guard << 15);
  }

  get waveWord(): number {
    let w = 0;
    this.waves.forEach((v, k) => {
      if (!v.live || v.wait > 0) return;
      const q = 1 | ((v.lane & 1) << 1) | ((Math.max(0, Math.min(1023, Math.round((v.x + 170) * 4))) & 1023) << 2);
      w |= q << (k * 12);
    });
    return w;
  }

  drainHurts(): Hurt[] {
    const h = this.hurts;
    this.hurts = [];
    return h;
  }

  step(dt: number, stand: readonly Stand[], rng: Rng): void {
    this.stepWaves(dt, stand);
    if (this.mode === UMODE.down || this.mode === UMODE.sunk) return;
    this.t -= dt;
    const onFront = stand.some((p) => p.up && Umi.laneAt(p.x, p.z) >= 0 && p.y < 3);
    switch (this.mode) {
      case UMODE.wade: {
        // toward its next place off the seafront
        const d = this.goal - this.x;
        this.x += Math.sign(d) * Math.min(Math.abs(d), UMI.wade * dt);
        if (Math.abs(d) < 0.5) this.goal = UMI.x0 + rng.f() * (UMI.x1 - UMI.x0);
        if (this.t <= 0 && onFront) {
          this.mode = UMODE.windup;
          this.t = UMI.windup;
          // wary after a hit: this one from low in the water; the next comes up over the wall again
          this.guard = this.wary;
          this.wary = false;
          // the lane the most of them stand in (the harpooner's, alone)
          const n = [0, 0];
          for (const p of stand) {
            const l = p.up ? Umi.laneAt(p.x, p.z) : -1;
            if (l >= 0) n[l]!++;
          }
          this.lane = n[0]! === n[1]! ? (rng.f() < 0.5 ? 0 : 1) : n[0]! > n[1]! ? 0 : 1;
        }
        break;
      }
      case UMODE.windup:
        if (this.t <= 0) {
          this.mode = UMODE.throw_;
          this.t = UMI.throw_;
          this.throwWave();
        }
        break;
      case UMODE.throw_:
      case UMODE.reel:
        if (this.t <= 0) {
          this.mode = UMODE.wade;
          this.guard = false;
          this.t = UMI.gap[Math.min(2, this.hits)]!;
          this.goal = UMI.x0 + rng.f() * (UMI.x1 - UMI.x0);
        }
        break;
      default:
        break;
    }
  }

  /** The sea comes down on the street at its place and runs east down a lane (two lanes, a moment apart, once it is angry). */
  private throwWave(): void {
    const x = Math.max(UMI.front.x0 + 2, Math.min(UMI.front.x1 - 10, this.x));
    const put = (k: number, lane: number, wait: number): void => {
      const w = this.waves[k]!;
      w.live = true;
      w.x = x;
      w.lane = lane;
      w.hit = 0;
      w.wait = wait;
    };
    const free = this.waves.findIndex((w) => !w.live);
    put(free < 0 ? 0 : free, this.lane, 0);
    if (this.hits >= 2) {
      const other = this.waves.findIndex((w) => !w.live);
      if (other >= 0) put(other, 1 - this.lane, UMI.follow);
    }
  }

  private stepWaves(dt: number, stand: readonly Stand[]): void {
    const W = UMI.wave;
    for (const w of this.waves) {
      if (!w.live) continue;
      if (w.wait > 0) {
        w.wait -= dt;
        continue;
      }
      w.x += W.speed * dt;
      if (w.x > UMI.front.x1 + 4) {
        w.live = false;
        continue;
      }
      const [z0, z1] = UMI.lanes[w.lane]!;
      stand.forEach((p, i) => {
        if (!p.up || w.hit & (1 << i) || p.y > W.top || p.z < z0 - 0.4 || p.z > z1 + 0.4 || Math.abs(p.x - w.x) > W.half) return;
        w.hit |= 1 << i;
        // thrown east with it, from just behind them
        this.hurts.push({ i, amount: W.damage, x: p.x - 3, z: p.z, knock: W.knock });
      });
    }
  }
}

/**
 * Does a harpoon fired from `o` along the unit direction `d` strike it (its chest, while it is up; `ua` as the story
 * carries it)? For the Mori (`arms`) and the placeholder prompt.
 */
export function harpoonStrikes(ua: number, o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }): boolean {
  if (!Umi.exposed(ua)) return false;
  const cx = Umi.x(ua);
  const cy = UMI.bodyY;
  const cz = UMI.z;
  const ox = cx - o.x;
  const oy = cy - o.y;
  const oz = cz - o.z;
  const along = ox * d.x + oy * d.y + oz * d.z;
  if (along < 0) return false;
  const px = ox - d.x * along;
  const py = oy - d.y * along;
  const pz = oz - d.z * along;
  return px * px + py * py + pz * pz <= UMI.bodyR * UMI.bodyR;
}
