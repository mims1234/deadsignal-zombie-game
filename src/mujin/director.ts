/**
 * The station's infected and its walls, loop by loop (no THREE): the solo game and the co-op simulation both run one
 * (whoever runs the infected). On every reset the station is put back: everything that came in during the loop is
 * gone, the people who wait here are back where they wait, and the loop's own come (the White Shape in the field, the
 * Bench Sitter some loops, the Tall Lady from loop 3, one more of her for every wrong read). The night closes the
 * areas it has taken (`MujinSeals`); nothing spawns in them and nothing is left inside.
 */
import { mujinVariant, type ZombieVariant } from '../enemies/variants';
import type { Zombie } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';
import type { BoxCollider, CollisionWorld } from '../world/collision';
import type { Level } from '../world/level';
import type { NavGrid } from '../world/nav';
import { MUJIN_LOOP, type LoopView } from './loop';
import { MUJIN, MUJIN_POCKET, SEALS, SHAPE_SPOTS, inSeal, sealedAt } from './places';

/** `ZombieManager.pickVariant` for the station. */
export function mujinVariantPicker(): (type: ZombieType, x: number, z: number, y: number, rng: Rng) => ZombieVariant {
  return (type, x, z, _y, rng) => mujinVariant(type, x, z, () => rng.f());
}

/** The gaps the night closes: colliders switched on, the nav re-rasterised round them (like the Asylum's doors). */
export class MujinSeals {
  sealed = 0;
  onChange: (() => void) | null = null;

  constructor(
    private readonly world: CollisionWorld,
    private readonly nav: NavGrid,
    private readonly gaps: readonly (readonly BoxCollider[])[],
  ) {}

  /** Match the bits of `SEALS` that are closed. */
  sync(bits: number): void {
    if (bits === this.sealed) return;
    for (let i = 0; i < SEALS.length; i++) {
      const on = (bits & (1 << i)) !== 0;
      for (const c of this.gaps[i] ?? []) {
        if (c.blocksMove === on) continue;
        c.blocksMove = on;
        c.blocksShots = on;
        const m = 1.2;
        this.nav.refresh(this.world, c.minX - m, c.minZ - m, c.maxX + m, c.maxZ + m);
      }
    }
    this.sealed = bits;
    this.onChange?.();
  }
}

/** Nowhere the night has taken, and never the pocket room. */
export function mujinSpawnAllowed(sealed: () => number): (x: number, z: number) => boolean {
  return (x, z) => z < MUJIN_POCKET.z0 - 4 && !sealedAt(sealed(), x, z);
}

export class MujinDirector {
  private readonly seals: MujinSeals | null;
  /** The loop the station's own were last placed for. */
  private placedFor = 0;
  private tallOwed = 0;

  constructor(
    level: Level,
    private readonly zombies: ZombieManager,
  ) {
    const h = level.mujin;
    this.seals = h ? new MujinSeals(level.world, level.nav, h.seals) : null;
  }

  set onSealsChange(fn: (() => void) | null) {
    if (this.seals) this.seals.onChange = fn;
  }

  get sealed(): number {
    return this.seals?.sealed ?? 0;
  }

  /** A new run: every area open again; the Stationmaster is not on the platform yet. */
  reset(): void {
    this.seals?.sync(0);
    this.placedFor = 0;
    this.tallOwed = 0;
    // the Warden `populate` places is the Stationmaster: he comes later (`step`)
    this.zombies.vanish((z) => z.isBoss);
  }

  /** A co-op player's own copy of the station: its walls follow the simulation's loop (nothing else runs here). */
  syncSeals(bits: number): void {
    this.seals?.sync(bits);
  }

  /** A wrong read: the night sends one more of her. */
  wrong(): void {
    this.tallOwed++;
  }

  /**
   * Every frame on whoever runs the infected. The areas follow the loop; on a new loop the station is put back.
   * Returns the Stationmaster's state for the hunt: 'away' (not yet), 'walk' (he walks, nothing hurts him), 'open'.
   */
  step(v: LoopView, rng: Rng): 'away' | 'walk' | 'open' {
    this.seals?.sync(v.sealed);
    if (v.phase === 'fight' && v.loop !== this.placedFor) {
      this.placedFor = v.loop;
      this.putBack(v, rng);
    }
    // anything the night has taken in is gone
    if (v.sealed) this.zombies.vanish((z) => !z.isBoss && z.alive && sealedAt(v.sealed, z.x, z.z));
    const boss = this.zombies.boss;
    const state = v.dawn ? 'open' : v.loop >= MUJIN_LOOP.masterFrom ? 'walk' : 'away';
    if (boss) boss.invulnerable = state !== 'open';
    return state;
  }

  /** The station put back for a new loop. */
  private putBack(v: LoopView, rng: Rng): void {
    const zm = this.zombies;
    if (v.loop > 1) {
      zm.vanish((z) => !z.isBoss);
      zm.repopulate(rng, (x, z) => !sealedAt(v.sealed, x, z));
    }
    const fieldOpen = !(v.sealed & (1 << 2));
    if (v.loop >= 2 && fieldOpen) {
      const s = SHAPE_SPOTS[v.loop % SHAPE_SPOTS.length]!;
      zm.spawn('shambler', s.x, s.z, rng, { ambient: true, variant: 'shape', yaw: 0 });
    }
    if (v.loop >= 2 && rng.f() < 0.55) {
      zm.spawn('shambler', MUJIN.bench.x - 1.6, MUJIN.bench.z - 0.1, rng, { ambient: true, variant: 'sitter', yaw: 0 });
    }
    const tall = (v.loop >= 3 ? 1 : 0) + this.tallOwed;
    this.tallOwed = 0;
    for (let i = 0; i < Math.min(3, tall); i++) {
      const spot = this.tallSpot(v.sealed, rng);
      zm.spawn('runner', spot.x, spot.z, rng, { ambient: true, variant: 'tall', yaw: rng.f() * Math.PI * 2 });
    }
  }

  /** Somewhere at the edge the night has not taken: the shrine, the street, the field, the far end of the plaza. */
  private tallSpot(sealed: number, rng: Rng): { x: number; z: number } {
    const spots = [
      { x: 44, z: 30, area: 1 },
      { x: -44, z: 22, area: 0 },
      { x: -40, z: -20, area: 2 },
      { x: 30, z: -32, area: -1 },
      { x: -12, z: -33, area: -1 },
    ].filter((s) => s.area < 0 || !(sealed & (1 << s.area)));
    return spots[Math.floor(rng.f() * spots.length)]!;
  }
}

/** Is this one of the station's own (who keep the loop, not the director's horde)? */
export function stationKind(z: Zombie): boolean {
  return z.variant === 'tall' || z.variant === 'shape' || z.variant === 'sitter';
}

export { inSeal };
