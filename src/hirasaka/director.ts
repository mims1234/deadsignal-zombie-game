/**
 * The island's infected, act by act (no THREE): the solo game and the co-op simulation both run one (whoever runs the
 * infected). Nobody appears out of the air at a story trigger: every loud moment draws the dead in (`draw`: the spawn
 * rate rises for a while and they come from out of sight toward the noise). Only the story's own figures are placed:
 * the funayūrei on their line across the gallery (when the deep first opens, far out of sight), Kurogane (a stand-in
 * the bosses wave replaces), Mio and the hags of the climb.
 *
 * On the climb Mio follows (nothing hurts her; every look back brings her on faster); the hags crawl up behind the
 * hindmost, and faster after anyone whose hand still carries the hearth's mark. The throwables: a peach's ward (nothing
 * of the dead crosses it, Mio included), grapes (the hags stop to eat), the comb (a bamboo wall the hags will not pass).
 */
import { HIRASAKA_HABITS, type ZombieVariant } from '../enemies/variants';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Zombie } from '../enemies/zombie';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';
import type { Level } from '../world/level';
import { CLIMB_MARKS, DEEP_SPOTS, ROCK, deepY, groundY, inDeep } from './places';
import { ACT, HirasakaStory, LADLE, type Stand, type StoryEvent, type StoryView } from './story';
// (hs-bosses) the umibōzu and Kurogane's hall, and what the island makes its kinds do on the climb
import { UmiFight, type Hurt } from './bossUmi';
import { KuroFight, type KMachine } from './bossKurogane';
import { EatScript, FleeScript, HomeScript, LeanScript } from './kinds';

/** A peach's ward: radius and seconds it lasts. The comb's bamboo (hags only), the grapes' pull. */
export const WARD = { r: 4.6, t: 7 };
export const BAMBOO = { r: 6, t: 12 };
export const GRAPES = { r: 12, t: 9 };

/** What an infected spawned at (x, z) becomes (the deep's kinds below, the drowned near the sea, islanders above). */
export function hirasakaKind(type: ZombieType, x: number, z: number, r: () => number): ZombieVariant {
  if (type === 'warden') return 'overseer';
  if (inDeep(x)) {
    // (hs-bosses) the flooded galleries' drowned, until they have their ladles
    if (!HIRASAKA_HABITS.funaGone && type === 'shambler' && x > 310 && x < 394 && z > 28 && z < 60) return r() < 0.55 ? 'funayurei' : 'miner';
    if (type === 'runner') return r() < 0.75 ? 'lampeater' : '';
    if (type === 'armored') return 'slag';
    return r() < 0.8 ? 'miner' : '';
  }
  if (type === 'armored') return r() < 0.6 ? 'slag' : '';
  if (type === 'runner') return r() < 0.5 ? 'resident' : '';
  if (z > 56) return r() < 0.6 ? 'drowned' : 'resident';
  return r() < 0.65 ? 'resident' : '';
}

/** `ZombieManager.pickVariant` for the island. */
export function hirasakaVariantPicker(lure?: () => ZombieVariant): (type: ZombieType, x: number, z: number, y: number, rng: Rng) => ZombieVariant {
  return (type, x, z, _y, rng) => {
    // a lure brings mostly its own kind (the deep's kinds only in the deep, the island's only on the island)
    const v = lure?.() ?? '';
    if (v && type !== 'warden' && (v === 'miner' || v === 'lampeater') === inDeep(x) && (v !== 'slag' || type === 'armored') && rng.f() < 0.65) return v;
    return hirasakaKind(type, x, z, () => rng.f());
  };
}

interface Lure {
  t: number;
  len: number;
  mul: number;
  cap: number;
  variant: ZombieVariant;
}

export interface DirectorStep {
  /** Mio has reached the Chibiki-iwa and leans on it. */
  mioAtStone: boolean;
  /** Kurogane's phase by his wounds (the stand-in's; `bosses` replaces it): 0 when he is not up. */
  kuPhase: number;
  /** How many of the finale's dead fell since the last step. */
  fallen: number;
  /** (hs-bosses) Kurogane's thunders broken since the last step (bits: `story.act('thunder', i)` each). */
  thunders: number;
  /** (hs-bosses) What the waves and his gas did to whom (`i`: their index in `stand`). */
  hurts: Hurt[];
  /** (hs-bosses) The fights for every screen: `story.bossWords(...words)`. */
  words: [number, number, number, number];
}

export class HirasakaDirector {
  private readonly wards: { x: number; z: number; t: number; r: number; hagsOnly: boolean }[] = [];
  private readonly baits: { x: number; z: number; t: number }[] = [];
  private hagT = 0;
  private burst = 0;
  private mioT = 0;
  private lure: Lure = { t: 0, len: 1, mul: 1, cap: 0, variant: '' };
  private readonly finale = new Set<Zombie>();
  /** The funayūrei standing on their line. */
  private readonly funa = new Map<Zombie, { x: number; z: number }>();
  private view: StoryView = HirasakaStory.empty();
  /** (hs-bosses) The umibōzu (`bossUmi.ts`) and Kurogane's fight (`bossKurogane.ts`); how many players there were last step. */
  readonly umi = new UmiFight();
  readonly kuro = new KuroFight({
    spawn: (x, z, rng) => {
      const t = this.zombies.spawn('runner', x, z, rng, { state: 'chase', variant: 'thunderling', y: 0 });
      t.isAmbient = false;
    },
    count: () => this.zombies.zombies.filter((z) => z.alive && z.variant === 'thunderling').length,
  });
  private players = 1;
  private hagAim = 0;
  /** (hs-bosses) Seconds before Mio goes back to lean on the rock (after a peach or a stagger drove her off). */
  private leanRest = 0;

  constructor(
    private readonly level: Level,
    private readonly zombies: ZombieManager,
  ) {}

  /** Nothing spawns under the water, in the deep before anyone has gone down, or near the lamp room's tag board. */
  spawnAllowed(): (x: number, z: number) => boolean {
    return (x, z) => {
      const v = this.view;
      if (v.act === ACT.won) return false;
      if (inDeep(x)) {
        if (!v.cageDown) return false;
        // (hs-bosses) while Kurogane fights, the Root Hall is his: his thunderlings are its only newcomers
        if (v.hairpin && !v.bossDown && x >= 266 && x <= 346 && z >= -70 && z <= -4) return false;
        if (Math.hypot(x - DEEP_SPOTS.tagBoard.x, z - DEEP_SPOTS.tagBoard.z) < 16) return false;
        return deepY(x, z) > HirasakaStory.seaLevel(v, true) + 0.2;
      }
      const y = groundY(x, z);
      return y >= 0 && y > HirasakaStory.seaLevel(v) + 0.2;
    };
  }

  /** A new run: Kurogane is not in the Root Hall until the hairpin is taken. */
  reset(): void {
    this.wards.length = 0;
    this.baits.length = 0;
    this.finale.clear();
    this.hagT = 0;
    this.burst = 0;
    this.mioT = 0;
    this.lure = { t: 0, len: 1, mul: 1, cap: 0, variant: '' };
    this.zombies.rateMul = 1;
    this.zombies.capBonus = 0;
    this.view = HirasakaStory.empty();
    this.umi.reset();
    this.kuro.reset();
    this.leanRest = 0;
    HIRASAKA_HABITS.ladles = false;
    HIRASAKA_HABITS.funaGone = false;
    this.zombies.vanish((z) => z.isBoss || z.variant === 'follower' || z.variant === 'thunderling' || this.funa.has(z));
    this.funa.clear();
  }

  get mio(): Zombie | null {
    return this.zombies.zombies.find((z) => z.variant === 'follower' && z.alive) ?? null;
  }

  /** The kind a lure is drawing in (none when nothing is). */
  get lureVariant(): ZombieVariant {
    return this.lure.t > 0 ? this.lure.variant : '';
  }

  /** A noise draws the dead in: for `seconds`, `mul` times the spawn rate and `cap` more at once (the stronger lure wins). */
  draw(seconds: number, mul: number, cap: number, variant: ZombieVariant = ''): void {
    const l = this.lure;
    if (l.t > 0 && (l.mul - 1) * l.t > (mul - 1) * seconds) return;
    this.lure = { t: seconds, len: seconds, mul, cap, variant };
  }

  /** Hunting infected, `n` of `type` round (x, z), on the floor there. */
  private horde(type: ZombieType, n: number, x: number, z: number, r: number, rng: Rng, variant?: ZombieVariant, y?: number): Zombie[] {
    const out: Zombie[] = [];
    for (let i = 0; i < n; i++) {
      const a = rng.f() * Math.PI * 2;
      const d = r * (0.5 + rng.f() * 0.5);
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const py = this.level.world.floorBelow(px, pz, 0.3, (y ?? 0) + 0.4, 0.8);
      out.push(this.zombies.spawn(type, px, pz, rng, { state: 'chase', variant, y: py }));
    }
    return out;
  }

  /** A thrown gift landed: a peach's ward, grapes (bait for the hags), the comb's bamboo. */
  thrown(kind: string, x: number, z: number): void {
    if (kind === 'grapes') this.baits.push({ x, z, t: GRAPES.t });
    else if (kind === 'comb') this.wards.push({ x, z, t: BAMBOO.t, r: BAMBOO.r, hagsOnly: true });
    else {
      this.wards.push({ x, z, t: WARD.t, r: WARD.r, hagsOnly: false });
      // (hs-bosses) a peach near her drives her off: she backs away down the slope (off the rock, too)
      const m = this.mio;
      if (m && Math.hypot(m.x - x, m.z - z) < WARD.r + 5) {
        m.script = new FleeScript(x, z, 4.5);
        this.leanRest = 7;
      }
    }
  }

  /** (The old name: a peach's ward.) */
  peach(x: number, z: number): void {
    this.thrown('peach', x, z);
  }

  /** What each of the story's moments brings. */
  onEvent(e: StoryEvent, v: StoryView, rng: Rng): void {
    this.view = v;
    switch (e.kind) {
      case 'done':
        // the burner's roar under Block 31, the fan spinning up, Genzō's door kicked in up on Block 65
        this.draw(30, 2.6, 5, 'resident');
        break;
      case 'open':
        this.draw(14, 1.8, 2);
        break;
      case 'jobs':
        // the winding engine's whistle: the sea answers
        this.draw(40, 2.8, 6, 'drowned');
        this.umi.rise();
        break;
      case 'umiHit':
        this.draw(18, 2.2, 3, 'drowned');
        this.umi.hit(e.n, v.umi === 2);
        break;
      case 'ready':
        this.draw(25, 2, 4, 'resident');
        this.umi.hit(v.umiHits, true);
        break;
      case 'machine':
        // (hs-bosses) the Root Hall turned on Kurogane
        this.kuro.use(e.m as KMachine, this.kurogane);
        break;
      case 'cage':
        // the cage's bell below: the night shift comes to see who rang it; the funayūrei wait on their line
        this.draw(35, 2.6, 5, 'miner');
        this.placeFuna(rng);
        break;
      case 'funa':
        this.zombies.vanish((z) => this.funa.has(z));
        this.funa.clear();
        this.draw(20, 2, 3, 'miner');
        break;
      case 'hairpin': {
        // Kurogane wakes where he lies in the Root Hall and calls his shift back to work (the stand-in)
        const h = this.level.data.hunt as { wardenX: number; wardenZ: number };
        h.wardenX = DEEP_SPOTS.kurogane.x;
        h.wardenZ = DEEP_SPOTS.kurogane.z;
        const b = this.zombies.spawnWarden(rng);
        b.setState('chase');
        this.kuro.reset();
        this.kuro.begin(b, this.players, v.thunders);
        // (hs-bosses) his shift answers, a few (his fight brings its own: the thunderlings)
        this.draw(30, 1.8, 2, 'miner');
        break;
      }
      case 'cable':
        this.zombies.vanish((z) => z.variant === 'thunderling');
        // Mio wakes in the roots
        this.spawnMio(rng, DEEP_SPOTS.tree.x + 6, DEEP_SPOTS.tree.z + 6, 0);
        this.hagT = 4;
        break;
      case 'sea':
        // the water coming over a place drives the drowned up ahead of it
        if (e.i >= 1) this.draw(22, 2.2, 4, 'drowned');
        break;
      case 'hauling':
        // the counted dead come for the rock
        this.draw(600, 3.2, 10, 'resident');
        this.hagT = 1;
        break;
      case 'look':
        this.burst = 1.6;
        break;
      case 'sealed':
      case 'home':
        for (const z of this.zombies.zombies) {
          if (!z.alive) continue;
          z.invulnerable = false;
          z.setState('idle');
          // (hs-bosses) she walks home down the slope
          if (z.variant === 'follower' && e.kind === 'home') z.script = new HomeScript(ROCK.seal.x, ROCK.seal.z + 22);
        }
        this.draw(0.1, 1, 0);
        break;
      default:
        break;
    }
  }

  /** The funayūrei on their line across the gallery: they stand and beg, and nothing harms them. */
  private placeFuna(rng: Rng): void {
    if ([...this.funa.keys()].some((z) => z.alive)) return;
    const g = DEEP_SPOTS.funaGate;
    for (const z of [g.z0 + 2.5, (g.z0 + g.z1) / 2, g.z1 - 2.5]) {
      const f = this.zombies.spawn('shambler', g.x1 + 1.2, z, rng, { state: 'idle', variant: 'funayurei', y: deepY(g.x1 + 1.2, z) });
      f.invulnerable = true;
      f.isAmbient = false;
      this.funa.set(f, { x: f.x, z: f.z });
    }
  }

  /** (hs-bosses) Kurogane while he stands. */
  get kurogane(): Zombie | null {
    const b = this.zombies.boss;
    return b && b.alive && b.variant === 'overseer' ? b : null;
  }

  private spawnMio(rng: Rng, atX: number, atZ: number, y: number): void {
    const m = this.zombies.spawn('shambler', atX, atZ, rng, { state: 'chase', variant: 'follower', y });
    m.invulnerable = true;
    m.isAmbient = false;
  }

  /** Every frame on whoever runs the infected: the lure, the wards and baits, Mio, the hags, the stand-ins. */
  step(dt: number, v: StoryView, stand: readonly Stand[], rng: Rng): DirectorStep {
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
    // the wards: nothing of the dead stands inside one (the bamboo stops only the hags)
    for (let i = this.wards.length - 1; i >= 0; i--) {
      const w = this.wards[i]!;
      w.t -= dt;
      if (w.t <= 0) {
        this.wards.splice(i, 1);
        continue;
      }
      for (const z of zm.zombies) {
        if (!z.alive || z.puppet || (w.hagsOnly && z.variant !== 'hag')) continue;
        const dx = z.x - w.x;
        const dz = z.z - w.z;
        const d = Math.hypot(dx, dz);
        if (d >= w.r || d < 1e-3) continue;
        const k = (w.r - d) / d;
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
    // the grapes go (the hags at them eat until then: `EatScript`)
    for (let i = this.baits.length - 1; i >= 0; i--) {
      const g = this.baits[i]!;
      g.t -= dt;
      if (g.t <= 0) this.baits.splice(i, 1);
    }
    // the funayūrei stand on their line and beg; they never leave it
    for (const [f, at] of this.funa) {
      if (!f.alive) continue;
      if (f.state !== 'idle') f.setState('idle');
      f.x = at.x;
      f.z = at.z;
      f.vx = 0;
      f.vz = 0;
    }
    // (hs-bosses) the funayūrei's ladles; the umibōzu; Kurogane's fight
    HIRASAKA_HABITS.ladles = v.ladles >= LADLE.bottomless;
    HIRASAKA_HABITS.funaGone = v.ladles === LADLE.given;
    this.players = Math.max(1, stand.length);
    const hurts: Hurt[] = [];
    if (v.umi === 1) {
      this.umi.step(dt, stand, rng);
      hurts.push(...this.umi.drainHurts());
    }
    let kuPhase = 0;
    let thunders = 0;
    const boss = this.kurogane;
    if (boss && v.hairpin && !v.bossDown) {
      if (this.kuro.phase === 0) this.kuro.begin(boss, this.players, v.thunders);
      this.kuro.step(dt, boss, stand, rng);
      kuPhase = this.kuro.phase;
      hurts.push(...this.kuro.drainHurts());
    }
    // (the head's blow kills him: it is counted though he no longer stands)
    if (v.hairpin && !v.bossDown) thunders = this.kuro.drainBroken();
    // the finale's count
    let fallen = 0;
    for (const z of this.finale) {
      if (z.alive) continue;
      this.finale.delete(z);
      fallen++;
    }
    let mioAtStone = false;
    if (v.act === ACT.climb) {
      const m = this.mio;
      this.burst = Math.max(0, this.burst - dt);
      this.leanRest = Math.max(0, this.leanRest - dt);
      if (m) {
        m.speedScale = Math.min(2.2, 0.95 + v.looks * 0.09) * (this.burst > 0 ? 1.8 : 1);
        m.dormant = false;
        // (hs-bosses) while the rock is hauled she goes to it and leans on it (a stagger or a peach drives her off a while)
        if (m.state === 'stagger' && !m.script) this.leanRest = Math.max(this.leanRest, 4);
        if (v.cranks > 0 && this.leanRest <= 0 && !m.script) m.script = new LeanScript(ROCK.seal.x + 2.6, ROCK.seal.z - 1.4);
        mioAtStone = m.script instanceof LeanScript && m.script.leaning;
        this.mioT = 0;
      } else {
        // lost somewhere (never killed): she comes again behind the hindmost
        this.mioT += dt;
        if (this.mioT > 6) {
          this.mioT = 0;
          const back = CLIMB_MARKS[Math.max(0, v.mark)]!.at;
          this.spawnMio(rng, back.x + 2, back.z + 2, back.y);
        }
      }
      // the hags crawl up behind the hindmost (faster on a marked hand)
      this.hagT -= dt;
      if (this.hagT <= 0) {
        const marked = v.marked !== 0;
        this.hagT = (v.cranks > 0 ? 4 : v.mark >= 1 ? 7 : 9) * (marked ? 0.7 : 1);
        const up = stand.filter((p) => p.up);
        const deepFolk = up.some((p) => inDeep(p.x));
        if (deepFolk && v.mark < 1) this.horde('runner', 2, DEEP_SPOTS.tree.x + 10, DEEP_SPOTS.tree.z, 6, rng, 'hag', 0);
        if (up.some((p) => !inDeep(p.x))) {
          // out of the adit, or up out of the water behind the hindmost
          const back = CLIMB_MARKS[Math.max(1, Math.min(CLIMB_MARKS.length - 1, v.mark))]!;
          const hags = this.horde('runner', marked ? 3 : 2, back.at.x, back.at.z, 4, rng, 'hag', back.at.y);
          if (v.cranks > 0) for (const h of hags) this.finale.add(h);
        }
        if (v.cranks > 0) {
          // and the counted dead come up the Hell Stairs at the rock
          for (const h of this.horde('shambler', 3, ROCK.seal.x, ROCK.seal.z + 14, 4, rng, 'resident', 10.8)) this.finale.add(h);
        }
      }
      // (hs-bosses) the hags: faster on a marked hand and with every look back (most just after one); they go for the
      // marked hand; at the grapes they stop and eat
      const hagSpeed = (marked(v) ? 1.25 : 1) * (1 + Math.min(0.5, v.looks * 0.04)) * (this.burst > 0 ? 1.6 : 1);
      this.hagAim -= dt;
      const aim = this.hagAim <= 0;
      if (aim) this.hagAim = 0.8;
      const marks = stand.filter((p, seat) => p.up && (v.marked & (1 << seat)) !== 0);
      for (const z of zm.zombies) {
        if (!z.alive || z.variant !== 'hag') continue;
        z.speedScale = hagSpeed;
        if (z.script) continue;
        const bait = this.baits.find((g) => Math.hypot(z.x - g.x, z.z - g.z) <= GRAPES.r);
        if (bait) {
          z.script = new EatScript(bait.x, bait.z, bait.t);
          continue;
        }
        if (aim && marks.length) {
          const p = marks.reduce((a, b) => (Math.hypot(a.x - z.x, a.z - z.z) <= Math.hypot(b.x - z.x, b.z - z.z) ? a : b));
          z.aggro(p.x, p.z);
        }
      }
    }
    return { mioAtStone, kuPhase, fallen, thunders, hurts, words: [this.umi.word, this.umi.waveWord, this.kuro.word, this.kuro.skipWord] };
  }
}

const marked = (v: StoryView): boolean => v.marked !== 0;
