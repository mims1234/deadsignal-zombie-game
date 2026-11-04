/**
 * The island's infected, act by act (no THREE): the solo game and the co-op simulation both run one (whoever runs the
 * infected). Every loud moment of the story draws the dead in: nobody
 * appears out of the air at a trigger - the spawn rate rises for a while (`draw`) and they come from out of sight toward
 * the noise: islanders for Genzō's key and the generator, the drowned for the sea gates, the deep for the peaches,
 * miners for Kurogane (who wakes in the Root Hall himself). On the climb Mio follows (nothing hurts her; every look
 * back brings her on faster), the Hags of the Slope crawl up behind, and the surge drives the drowned up ahead of it.
 *
 * Peaches: where one lands, nothing of the dead will cross a ring round it for a few seconds (Mio included).
 */
import { hirasakaVariant, type ZombieVariant } from '../enemies/variants';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Zombie } from '../enemies/zombie';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';
import type { Level } from '../world/level';
import { HIRASAKA, SEA_SPOTS, TIERS, inMine, tierAt } from './places';
import { ACT, HirasakaStory, type Stand, type StoryEvent, type StoryView } from './story';

/** A peach's ward: radius and seconds. */
export const WARD = { r: 4.6, t: 7 };

/** `ZombieManager.pickVariant` for the island. */
export function hirasakaVariantPicker(lure?: () => ZombieVariant): (type: ZombieType, x: number, z: number, y: number, rng: Rng) => ZombieVariant {
  return (type, x, z, _y, rng) => {
    // a lure brings mostly its own kind (the mine's kinds only in the mine, the island's only on the island)
    const v = lure?.() ?? '';
    if (v && type !== 'warden' && (v === 'miner' || v === 'lampeater') === inMine(x) && (v !== 'slag' || type === 'armored') && rng.f() < 0.65) return v;
    return hirasakaVariant(type, x, z, () => rng.f());
  };
}

/** A lure: seconds left and in all, how much faster the dead come, how many more at once, and mostly what kind. */
interface Lure {
  t: number;
  len: number;
  mul: number;
  cap: number;
  variant: ZombieVariant;
}

/** How long the generator's lure lasts (about as long as the summit is held while it catches). */
const GENERATOR_LURE = 45;

export class HirasakaDirector {
  private readonly wards: { x: number; z: number; t: number }[] = [];
  private hagT = 0;
  private burst = 0;
  private mioT = 0;
  private lure: Lure = { t: 0, len: 1, mul: 1, cap: 0, variant: '' };
  /** The story's view as last seen (what `spawnAllowed` reads). */
  private view: StoryView = HirasakaStory.empty();

  constructor(
    private readonly level: Level,
    private readonly zombies: ZombieManager,
  ) {}

  /** Nothing spawns under the surge's water, nor in the mine before anyone has gone down. */
  spawnAllowed(): (x: number, z: number) => boolean {
    return (x, z) => {
      const v = this.view;
      if (v.act === ACT.won) return false;
      if (inMine(x)) return v.cageDown;
      const t = tierAt(x, z);
      if (t < 0) return false;
      return TIERS[t]!.y > HirasakaStory.seaLevel(v) + 0.2;
    };
  }

  /** A new run: Kurogane is not in the Root Hall until his hairpin is taken. */
  reset(): void {
    this.wards.length = 0;
    this.hagT = 0;
    this.burst = 0;
    this.mioT = 0;
    this.lure = { t: 0, len: 1, mul: 1, cap: 0, variant: '' };
    this.zombies.rateMul = 1;
    this.zombies.capBonus = 0;
    this.view = HirasakaStory.empty();
    this.zombies.vanish((z) => z.isBoss);
  }

  get mio(): Zombie | null {
    return this.zombies.zombies.find((z) => z.variant === 'follower' && z.alive) ?? null;
  }

  /** Hunting infected, `n` of `type` round (x, z) (on the floor there). */
  private horde(type: ZombieType, n: number, x: number, z: number, r: number, rng: Rng, variant?: ZombieVariant): void {
    for (let i = 0; i < n; i++) {
      const a = rng.f() * Math.PI * 2;
      const d = r * (0.5 + rng.f() * 0.5);
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const y = this.level.world.floorHeight(px, pz, 0.3);
      this.zombies.spawn(type, px, pz, rng, { state: 'chase', variant, y });
    }
  }

  /** The kind a lure is drawing in (none when nothing is). */
  get lureVariant(): ZombieVariant {
    return this.lure.t > 0 ? this.lure.variant : '';
  }

  /** A noise draws the dead in: for `seconds`, `mul` times the spawn rate and `cap` more at once (the stronger lure wins). */
  private draw(seconds: number, mul: number, cap: number, variant: ZombieVariant = ''): void {
    const l = this.lure;
    if (l.t > 0 && (l.mul - 1) * l.t > (mul - 1) * seconds) return;
    this.lure = { t: seconds, len: seconds, mul, cap, variant };
  }

  /** A ward where a peach landed. */
  peach(x: number, z: number): void {
    this.wards.push({ x, z, t: WARD.t });
  }

  /** What each of the story's moments brings. */
  onEvent(e: StoryEvent, v: StoryView, rng: Rng): void {
    switch (e.kind) {
      case 'done':
        // Genzō's door slamming open on Block 65's roof is heard across the island
        if (e.job === 'key') this.draw(30, 2.6, 4, 'resident');
        break;
      case 'generating':
        // the generator's roar on the summit, as long as it runs up
        this.draw(GENERATOR_LURE, 3, 6, 'resident');
        break;
      case 'valve':
        // each sea gate grinding open; the last one loudest
        this.draw(e.n === 3 ? 30 : 20, e.n === 3 ? 3 : 2.4, e.n === 3 ? 5 : 3, 'drowned');
        break;
      case 'peaches':
        // every door in the village opens at once (`look.ts`), and the deep comes to see who took them
        this.draw(35, 3, 6, 'miner');
        break;
      case 'hairpin': {
        // Kurogane wakes where he lies in the Root Hall and calls his shift back to work
        const b = this.zombies.spawnWarden(rng);
        b.setState('chase');
        this.draw(40, 2.6, 5, 'miner');
        break;
      }
      case 'cable': {
        // Mio wakes in the roots
        this.spawnMio(rng, 196, -30);
        this.hagT = 4;
        break;
      }
      case 'surfaced':
        this.draw(30, 2.4, 4, 'drowned');
        this.hagT = 2;
        break;
      case 'surge':
        // the sea coming over a tier drives the drowned up ahead of it
        this.draw(25, 2.2, 4, 'drowned');
        break;
      case 'look':
        this.burst = 1.6;
        break;
      case 'sealed':
      case 'home':
        // the dead stop where they stand
        for (const z of this.zombies.zombies) {
          if (!z.alive) continue;
          z.invulnerable = false;
          z.setState('idle');
        }
        break;
      default:
        break;
    }
    void v;
  }

  private spawnMio(rng: Rng, atX: number, atZ: number): void {
    const y = this.level.world.floorHeight(atX, atZ, 0.3);
    const m = this.zombies.spawn('shambler', atX, atZ, rng, { state: 'chase', variant: 'follower', y });
    m.invulnerable = true;
    m.isAmbient = false;
  }

  /**
   * Every frame on whoever runs the infected: the wards, Mio's pace, the hags on the climb. Returns whether Mio has
   * reached the stone (it will not roll while she leans on it).
   */
  step(dt: number, v: StoryView, stand: readonly Stand[], rng: Rng): { mioAtStone: boolean } {
    this.view = v;
    const zm = this.zombies;
    // the lure: full strength, then fading out over its last third
    const l = this.lure;
    if (l.t > 0) {
      l.t = Math.max(0, l.t - dt);
      const k = Math.min(1, l.t / (l.len * 0.35));
      zm.rateMul = 1 + (l.mul - 1) * k;
      zm.capBonus = Math.round(l.cap * k);
    } else {
      zm.rateMul = 1;
      zm.capBonus = 0;
    }
    // the peaches' wards: nothing of the dead stands inside one
    for (let i = this.wards.length - 1; i >= 0; i--) {
      const w = this.wards[i]!;
      w.t -= dt;
      if (w.t <= 0) {
        this.wards.splice(i, 1);
        continue;
      }
      for (const z of zm.zombies) {
        if (!z.alive || z.puppet) continue;
        const dx = z.x - w.x;
        const dz = z.z - w.z;
        const d = Math.hypot(dx, dz);
        if (d >= WARD.r || d < 1e-3) continue;
        const k = (WARD.r - d) / d;
        const nx = z.x + dx * k;
        const nz = z.z + dz * k;
        if (!this.level.world.circleBlocked(nx, nz, 0.3, z.y + 0.4, z.y + 1.6)) {
          z.x = nx;
          z.z = nz;
        }
        z.vx = (dx / d) * 1.5;
        z.vz = (dz / d) * 1.5;
      }
    }
    let mioAtStone = false;
    if (v.act === ACT.climb) {
      // Mio: never far behind, faster with every look back
      const m = this.mio;
      this.burst = Math.max(0, this.burst - dt);
      if (m) {
        m.speedScale = Math.min(2.2, 0.95 + v.looks * 0.09) * (this.burst > 0 ? 1.8 : 1);
        m.dormant = false;
        mioAtStone = v.surfaced && Math.hypot(m.x - HIRASAKA.stonePush.x, m.z - HIRASAKA.stonePush.z) < HIRASAKA.stonePush.r + 1.5 && m.y > 13;
        this.mioT = 0;
      } else {
        // lost somewhere (never killed): she comes again behind the hindmost
        this.mioT += dt;
        if (this.mioT > 6) {
          this.mioT = 0;
          const last = [...stand].filter((p) => p.up).sort((a, b) => b.z - a.z)[0];
          if (last) {
            if (inMine(last.x)) this.spawnMio(rng, 196, -30);
            else this.spawnMio(rng, HIRASAKA.aditOut.x, HIRASAKA.aditOut.z);
          }
        }
      }
      // the Hags of the Slope crawl up behind
      this.hagT -= dt;
      if (this.hagT <= 0) {
        this.hagT = v.surfaced ? 7 : 9;
        const up = stand.filter((p) => p.up);
        const anyMine = up.some((p) => inMine(p.x));
        if (anyMine) this.horde('runner', 2, 198, -30, 6, rng, 'hag');
        if (v.surfaced) {
          // out of the adit, or up out of the water behind the hindmost
          const sea = HirasakaStory.seaLevel(v);
          const t = TIERS.findIndex((q) => q.y > sea + 0.2);
          if (t <= 0) this.horde('runner', 2, HIRASAKA.aditOut.x, HIRASAKA.aditOut.z + 2, 2, rng, 'hag');
          else {
            const s = SEA_SPOTS[Math.floor(rng.f() * SEA_SPOTS.length)]!;
            this.horde('runner', 2, s.x, TIERS[t]!.z1 - 2.5, 2, rng, 'hag');
          }
        }
      }
    }
    return { mioAtStone };
  }
}
