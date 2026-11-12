/**
 * The town's infected, beat by beat (no THREE, no DOM): the solo game and the co-op simulation both run one (whoever
 * runs the infected). The shatuny are townspeople woken wrong. Nobody appears out of the air at a trigger: the ones
 * with names stand where the story put them, asleep on their feet until the squad comes, and everything else is the
 * spawn rate rising for a while after a noise (`draw`), with the ones who come walking in from out of sight.
 *
 *   ACT I    Gena by the escalator, the guard under his shutter, the bear behind the ice town.
 *   ACT II   BORYA in the market hall: nothing puts him down, he is led into his own cold store and shut in.
 *            BABA YAGA in her hut on the Palace's stage: it walks the stage and the stalls; she can be hurt only while
 *            the stage's machinery holds her door open (`stage.ts`, the fight's own brain).
 *            THE TAMADA on the canteen's stage: he can be hurt only once his three loudspeakers are unplugged.
 *   ACT III  MOROZKO in the Berloga hall: he fights unless he believed the squad's answer.
 *
 * "Asleep on its feet" is a hold (`Hold`, a `ZombieScript`), not `Zombie.dormant`: that flag is the manager's own
 * far-away sleep (it wakes anyone within 78 m, hides them from shots and from the co-op report). A held one stands
 * where it is, sees and hears nothing and strikes nobody, and can still be seen, named and shot at.
 *
 * Nothing spawns before the town is asleep, in a zone the squad cannot reach yet, or after an ending. The two rooms
 * built beside the map (the canteen, the Berloga hall) are too small for the ordinary spawner, which keeps 24 m from
 * every player: there a draw walks its people in through the room's own doors (`room`).
 */
import type { ZombieVariant } from '../enemies/variants';
import type { Zombie, ZombieScript } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';
import type { Level } from '../world/level';
import { BERLOGA, CANTEEN, DK, RYNOK, ZARYA, inRect, type Rect, type Spot } from './places';
import { CH, DOLLS, F, G, LOOKED, STORY, ZaryaStory, type Stand, type StoryEvent, type StoryView } from './story';
import { yawTo } from './types';
// ---- Baba Yaga's stage (`stage.ts`): the fight, its machines, the hut's size ----
import { ZOMBIES } from '../config';
import { HUT_DEF_PATCH, YAGA, YagaFight, type Hurt, type Machine } from './stage';

/** What the director saw this frame, for the story to note. */
export type DirectorNote = Parameters<ZaryaStory['note']>[0];

/** The ones with names. */
export type Named = 'mishka' | 'borya' | 'yaga' | 'tamada' | 'morozko';

/** How much of a blow from the front the bear suit's padding takes. */
export const BEAR_PADDING = 0.88;

/** The named ones of Acts II and III: health is a multiple of the Warden's. */
export const BOSS = {
  /** Borya sees a standing player this near. Nothing puts him down: his health is never used. */
  borya: { see: 22, hp: 6 },
  /** Baba Yaga notices this near her hut; her health (more for every player past the first: `stage.ts` YAGA). */
  yaga: { see: YAGA.see, hp: YAGA.hp },
  /**
   * The Tamada toasts every `every` seconds while a loudspeaker is plugged in. A toast lasts `len` seconds: by how
   * many loudspeakers still play (index), one more guest every so many seconds, up to so many on their feet at once.
   */
  tamada: { hp: 1.4, every: 20, len: 12, gap: [0, 4.5, 3.2, 2.4], cap: [0, 2, 4, 6] },
  /**
   * Morozko fights a standing player who comes this near once he has asked (nearer than the reach of the answer
   * itself, `story.ts`: an answer is given from up to 6 m). While he fights, one more every `gap` seconds, `cap` at once.
   */
  morozko: { near: 3, hp: 1, gap: 4, cap: 5 },
} as const;

/**
 * Morozko's question. Before each heavy blow (the Warden body's slam) he stops, asks "Are you warm?" and holds the
 * blow for its wind-up (1.1 s): a guard raised to him, or a swing landing in that pause, is a parry. He reels for
 * `stagger` seconds and the weak points open on his coat, one for every clue the squad has found (`weakMax` at most):
 * a blow landing on the side of him an open one is on is worth `weakMul` and closes it. The rest close when he
 * recovers. His health is not changed by any of this (`stepMorozko` scales it by the clues that were looked at).
 */
export const PARRY = {
  stagger: 3,
  weakMul: 3,
  weakMax: 6,
  /** A parry asked for this long after his question is over still counts (in co-op the request takes a moment to arrive). */
  grace: 0.35,
  /** Only a player this near him can have blocked or struck him. */
  reach: 5,
  /** Seconds from one heavy blow (and its question) to the next (the Warden's own are 9 apart). */
  every: 6,
} as const;

/** Which side of his coat each weak point is on (0 front, 1 back, 2 his left, 3 his right), in the order they open. */
export const WEAK_SIDE: readonly (0 | 1 | 2 | 3)[] = [0, 1, 2, 3, 0, 1];

/** The side of someone facing `yaw` that a blow travelling `hitDirYaw` lands on: 0 front, 1 back, 2 their left, 3 their right. */
export function sideHit(yaw: number, hitDirYaw: number): 0 | 1 | 2 | 3 {
  const a = wrap(hitDirYaw - yaw);
  const abs = Math.abs(a);
  if (abs >= (Math.PI * 3) / 4) return 0;
  if (abs <= Math.PI / 4) return 1;
  // travelling toward his right: it came from his left
  return a < 0 ? 2 : 3;
}

/** The open weak point (a bit of `mask`) a blow on `side` lands on, or -1. */
export function weakAt(mask: number, side: number): number {
  for (let i = 0; i < WEAK_SIDE.length; i++) if ((mask & (1 << i)) !== 0 && WEAK_SIDE[i] === side) return i;
  return -1;
}

const WEST = yawTo(0, 0, -1, 0);

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Asleep on its feet: it stands where it is, turned to `yaw` (null: as it was), until the director lets it go. */
class Hold implements ZombieScript {
  constructor(public yaw: number | null) {}

  step(z: Zombie, dt: number): boolean {
    z.vx = z.vz = 0;
    if (this.yaw !== null) {
      const d = wrap(this.yaw - z.yaw);
      const turn = 2.4 * dt;
      z.yaw = Math.abs(d) <= turn ? this.yaw : z.yaw + Math.sign(d) * turn;
    }
    const p = z.scriptPose;
    p.mode = 'idle';
    p.actionT = 0;
    p.speed = 0;
    p.lift = 0;
    return true;
  }
}

/** A room's own draw: seconds it has left, one more every `gap` seconds, never more than `cap` on their feet. */
interface Room {
  rect: Rect;
  spots: readonly (readonly [number, number])[];
  t: number;
  gap: number;
  cap: number;
  next: number;
}

const BIT: Record<Exclude<Named, 'mishka'>, number> = { borya: 1, yaga: 2, tamada: 4, morozko: 8 };

export class ZaryaDirector {
  private lure = { t: 0, len: 1, mul: 1, cap: 0 };
  private view: StoryView = ZaryaStory.empty();
  private gena: Zombie | null = null;
  private guard: Zombie | null = null;
  private readonly named: Record<Named, Zombie | null> = { mishka: null, borya: null, yaga: null, tamada: null, morozko: null };
  /** Bits (`BIT`): who has been stood in their place this run; who has noticed the squad. */
  private placed = 0;
  private woke = 0;
  /** Seconds the bear has left at the hook (counted once he is there). */
  private prizeT = 0;
  /** What a pair of eyes is worth at this difficulty (kept while someone is made blind for a moment). */
  private sight = 1;
  /** Borya: inside his cold store as last reported; stood at the hatch his quarry left by; shut in. */
  private boryaIn = false;
  private baffled = false;
  private shut = false;
  /** Baba Yaga: her fight (`stage.ts`), and whether her door was open last frame (the story's `G.exposed` follows it). */
  private readonly yagaFight = new YagaFight({
    spawn: (x, z, rng) => {
      // a carol-singer in a goat or bear mask, out of the wings and straight at the nearest of the squad
      const q = this.put('runner', x, z, rng, null, true, 'ryazhenye');
      const p = nearest(this.stands, q.x, q.z);
      if (p) q.aggro(p.x, p.z);
    },
    count: (r) => {
      let n = 0;
      for (const z of this.zombies.zombies) if (z.alive && !z.isBoss && inRect(r, z.x, z.z)) n++;
      return n;
    },
  });
  private wasOpen = false;
  /** Everyone as last reported (the fight's carol-singers go for the nearest). */
  private stands: readonly Stand[] = [];
  /** The Tamada: seconds to his next toast; he has come down off the stage. */
  private toastT = 0;
  private tamadaDown = false;
  /** Morozko: his health with every clue found (one weak point each), and whether he is fighting. */
  private morozkoBase = 0;
  private fight = false;
  /**
   * Morozko's question (`PARRY`): he is asking now; seconds since he last finished asking; his health when he began;
   * seconds he still reels from a parry; the weak points open on his coat (bits, `WEAK_SIDE`); parries so far.
   */
  private asking = false;
  private askT = Infinity;
  private askHp = 0;
  private reelT = 0;
  private weak = 0;
  private parries = 0;
  private readonly canteen: Room = { rect: CANTEEN.rect, spots: CANTEEN.spawns, t: 0, gap: 1, cap: 0, next: 1.5 };
  private readonly berloga: Room = { rect: BERLOGA.rect, spots: BERLOGA.spawns, t: 0, gap: BOSS.morozko.gap, cap: BOSS.morozko.cap, next: 1.5 };
  /** An ending has come: everyone stands where they stood, and nothing spawns again. */
  private over = false;
  private counted = new WeakSet<Zombie>();
  private kills: { x: number; z: number }[] = [];
  private readonly notes: DirectorNote[] = [];

  constructor(
    private readonly level: Level,
    private readonly zombies: ZombieManager,
  ) {}

  /**
   * Where the ordinary spawner may put someone: only in a zone the squad can reach (`ZaryaStory.zoneOpen`), never
   * before the town is asleep, never after an ending. The two rooms beside the map are the director's own (`room`).
   */
  spawnAllowed(): (x: number, z: number) => boolean {
    return (x, z) => {
      const v = this.view;
      if (this.over || v.end !== 0 || v.ch >= CH.ended || !ZaryaStory.asleep(v)) return false;
      const zone = ZaryaStory.zoneOf(x, z);
      // (while Baba Yaga fights, the theatre's people are hers: she calls her carol-singers out of the wings, `stage.ts`)
      if (zone === 'dk' && this.yagaFight.phase > 0) return false;
      return zone !== null && zone !== 'canteen' && zone !== 'berloga' && ZaryaStory.zoneOpen(v, zone);
    };
  }

  /** Seconds to the next one the doll a player stands by calls in. */
  private dollT = 0;

  reset(): void {
    this.dollT = 0;
    this.lure = { t: 0, len: 1, mul: 1, cap: 0 };
    this.view = ZaryaStory.empty();
    this.gena = this.guard = null;
    this.named.mishka = this.named.borya = this.named.yaga = this.named.tamada = this.named.morozko = null;
    this.placed = this.woke = 0;
    this.prizeT = 0;
    this.boryaIn = this.baffled = this.shut = false;
    this.yagaFight.reset();
    this.wasOpen = false;
    this.stands = [];
    this.toastT = 0;
    this.tamadaDown = false;
    this.morozkoBase = 0;
    this.fight = false;
    this.asking = false;
    this.askT = Infinity;
    this.askHp = this.reelT = this.weak = this.parries = 0;
    // the first to answer a toast, or Morozko, takes a moment to get to the door
    this.canteen.t = this.berloga.t = 0;
    this.canteen.next = this.berloga.next = 1.5;
    this.over = false;
    this.counted = new WeakSet();
    this.kills = [];
    this.notes.length = 0;
    this.zombies.rateMul = 1;
    this.zombies.capBonus = 0;
    // the town is awake when a run starts: nobody is on their feet who should not be
    this.zombies.vanish(() => true);
  }

  /** One of the named ones, while it is up (the screen draws its costume and says where it is). */
  where(who: Named): Zombie | null {
    const z = this.named[who];
    return z && z.alive ? z : null;
  }

  /**
   * A squadmate leaves this one be (the squad AI's `holdFire`): nothing would come of the shot, or it is asleep on
   * its feet and not theirs to wake (Morozko's fight is the player's to start). Baba Yaga in her turned hut is the
   * one sleeper they do shoot.
   */
  spared(z: Zombie): boolean {
    if (z.invulnerable) return true;
    return z.script instanceof Hold && z !== this.named.yaga;
  }

  /** Morozko's weak points as they stand: which are open (bits of `WEAK_SIDE`), how long he still reels, how many parries so far. */
  get morozko(): { weak: number; reel: number; parries: number } {
    return { weak: this.reelT > 0 ? this.weak : 0, reel: this.reelT, parries: this.parries };
  }

  /** Where each infected died since the last call (the matryoshkas count them: `ZaryaStory.kill`). Not the named bosses. */
  drainKills(): readonly { x: number; z: number }[] {
    const k = this.kills;
    this.kills = [];
    return k;
  }

  /** A noise draws them in: for `seconds`, `mul` times the spawn rate and `cap` more at once (the stronger lure wins). */
  private draw(seconds: number, mul: number, cap: number): void {
    const l = this.lure;
    if (l.t > 0 && (l.mul - 1) * l.t > (mul - 1) * seconds) return;
    this.lure = { t: seconds, len: seconds, mul, cap };
  }

  /** One of the infected at (x, z). `variant`: its kind (`enemies/variants.ts`); left out, whatever its zone makes of it. */
  private put(type: ZombieType, x: number, z: number, rng: Rng, tag: string | null, hunting: boolean, variant?: ZombieVariant): Zombie {
    const y = this.level.world.floorHeight(x, z, 0.3);
    const q = this.zombies.spawn(type, x, z, rng, { state: hunting ? 'chase' : 'idle', y, area: this.level.floors.areaAt(x, y, z), variant });
    q.isAmbient = false;
    if (tag) this.zombies.tagZombie(q, tag, false, 'NO BREATH');
    return q;
  }

  /** One of the story's own in a boss's body, stood at `at` facing `yaw`: asleep on its feet, and nothing hurts it. */
  private stand(who: Exclude<Named, 'mishka'>, tag: string, at: Spot, yaw: number, hp: number, rng: Rng): Zombie {
    const y = this.level.world.floorHeight(at.x, at.z, 0.3);
    // not `spawnWarden`: that one is the bear's, and the manager walks its boss back to a lair
    // (Baba Yaga's body is the size of her hut, `stage.ts`; the others the Warden's own, whatever body the pool hands out)
    const def = who === 'yaga' ? { ...ZOMBIES.warden, ...HUT_DEF_PATCH } : ZOMBIES.warden;
    const q = this.zombies.spawn('warden', at.x, at.z, rng, { boss: true, hpScale: hp, yaw, y, area: this.level.floors.areaAt(at.x, y, at.z), variant: '', def });
    q.isAmbient = false;
    q.invulnerable = true;
    this.zombies.tagZombie(q, tag, false, 'NO BREATH');
    this.hold(q, yaw);
    this.named[who] = q;
    this.placed |= BIT[who];
    return q;
  }

  /** Put `z` to sleep on its feet (turned to `yaw`, or as it stands). */
  private hold(z: Zombie, yaw: number | null): void {
    if (z.script instanceof Hold) z.script.yaw = yaw;
    else z.script = new Hold(yaw);
    z.vx = z.vz = 0;
    z.setState('idle');
  }

  /** Wake a held one: it hunts whoever stands nearest. */
  private wake(z: Zombie, up: readonly Stand[]): void {
    if (z.script instanceof Hold) z.script = null;
    const p = nearest(up, z.x, z.z);
    if (p) z.aggro(p.x, p.z);
    else z.setState('chase');
  }

  /** An ending: every infected everywhere stops where it stands, for good. */
  private stop(): void {
    if (this.over) return;
    this.over = true;
    this.lure.t = 0;
    this.canteen.t = this.berloga.t = 0;
    this.zombies.rateMul = 1;
    this.zombies.capBonus = 0;
    for (const z of this.zombies.zombies) if (z.alive) this.hold(z, null);
  }

  /** What each of the story's moments brings. */
  onEvent(e: StoryEvent, v: StoryView, stand: readonly Stand[], rng: Rng): void {
    this.view = v;
    const P = ZARYA;
    if (e.kind === 'end') {
      this.stop();
      return;
    }
    if (this.over) return;
    if (e.kind === 'parry') {
      // someone blocked or swung into Morozko's question: it counts if he was asking (or just had) and they were near him
      const m = this.where('morozko');
      if (m && this.fight && this.reelT <= 0 && (this.asking || this.askT <= PARRY.grace) && Math.hypot(e.x - m.x, e.z - m.z) <= PARRY.reach) this.parry(m, v);
      return;
    }
    if (e.kind === 'stage') {
      // a machine of Baba Yaga's stage worked (the story checked it was ready and the player at it): what it caught
      this.yagaFight.use(e.i as Machine, this.where('yaga'));
      return;
    }
    if (e.kind === 'chapter') {
      if (e.ch === CH.ground) {
        // Gena, at the foot of the escalator with his back to the stairs: he does not look round until someone is in the hall
        const g = this.put('shambler', P.gena.x, P.gena.z, rng, 'GENA', false, '');
        this.sight = g.sightScale;
        g.sightScale = 0;
        g.yaw = Math.atan2(-(P.girl.x - P.gena.x), -(P.girl.z - P.gena.z));
        this.gena = g;
      }
      return;
    }
    if (e.kind !== 'flag') return;
    const up = stand.filter((p) => p.up);
    switch (e.f) {
      case F.hall: {
        const g = this.gena;
        if (g?.alive) {
          g.sightScale = this.sight;
          const p = nearest(up, g.x, g.z);
          if (p) g.aggro(p.x, p.z);
        }
        break;
      }
      case F.guard: {
        // the shutter's motor has been banging at him all night: he wakes wrong, and thirty years of habit put the
        // whistle to his lips (the guard's own kind, `svistok`). They come down from the floors above
        const g = this.put('armored', 71.8, P.shutter.z, rng, 'THE GUARD', true, 'svistok');
        this.guard = g;
        const p = nearest(up, g.x, g.z);
        if (p) g.aggro(p.x, p.z);
        for (const [x, z, type] of [[108, -19, 'shambler'], [116, 2, 'shambler'], [128, 10, 'shambler'], [134, -2, 'runner'], [122, -12, 'shambler']] as const) {
          const q = this.put(type, x, z, rng, null, true);
          if (p) q.aggro(p.x, p.z);
        }
        this.draw(30, 2.4, 4);
        break;
      }
      case F.flare:
        // a red star over the square: every head without breath turns to look
        this.draw(45, 2.8, 6);
        for (const z of this.zombies.zombies) {
          if (!z.alive || z.isBoss) continue;
          const p = nearest(up, z.x, z.z);
          if (p) z.hear(p.x, p.z, 0.5 + rng.f() * 2);
        }
        break;
      case F.bear: {
        // Oleg Petrovich in the fair's bear suit comes out from behind the ice town to see who is at the sack
        const b = this.zombies.spawnWarden(rng);
        this.zombies.tagZombie(b, 'MISHKA', false, 'NO BREATH');
        this.sight = b.sightScale;
        b.frontArmor = BEAR_PADDING;
        b.isAmbient = false;
        const p = nearest(up, b.x, b.z);
        if (p) b.aggro(p.x, p.z);
        else b.setState('chase');
        this.named.mishka = b;
        break;
      }
      case F.prize: {
        // a prize on the slide's hook: handing them out is his job, and he goes to see to it with his back to the square
        const b = this.where('mishka');
        if (b) {
          b.sightScale = 0;
          b.standDown(P.hook.x + 1.2, P.hook.z + 1.4);
          this.prizeT = STORY.prize;
        }
        break;
      }
      default:
        break;
    }
  }

  /** Every frame on whoever runs the infected. Returns what the story should note. */
  step(dt: number, v: StoryView, stand: readonly Stand[], rng: Rng): readonly DirectorNote[] {
    this.view = v;
    this.notes.length = 0;
    const zm = this.zombies;
    const up = stand.filter((p) => p.up);
    const has = (flag: number): boolean => (v.f & flag) !== 0;

    // where each one fell (the corpses lie a while: every one is seen here once)
    for (const z of zm.zombies) {
      if (z.alive || this.counted.has(z)) continue;
      this.counted.add(z);
      if (!z.isBoss) this.kills.push({ x: z.x, z: z.z });
    }
    if (v.end !== 0) this.stop();
    if (this.over) return this.notes;

    // a painted doll with shells still shut and one of the squad standing by it: they come to it, steadily, from
    // thirty-odd metres off, so a stand at the doll is a fight and not a wait (`story.kill` counts what falls)
    if (v.ch >= CH.act2 && !(v.g & G.pond)) {
      const at = DOLLS.findIndex((d, i) => ZaryaStory.shells(v, i) < STORY.dollShells && up.some((p) => Math.hypot(p.x - d.x, p.z - d.z) <= STORY.dollStand));
      if (at < 0) this.dollT = Math.min(this.dollT, 1.5);
      else {
        this.dollT -= dt;
        const d = DOLLS[at]!;
        let near = 0;
        for (const z of zm.zombies) if (z.alive && !z.isBoss && Math.hypot(z.x - d.x, z.z - d.z) < 45) near++;
        if (this.dollT <= 0 && near < 7) {
          this.dollT = 1.6 + rng.f() * 1.4;
          const a = rng.f() * Math.PI * 2;
          const r = 28 + rng.f() * 8;
          const spot = this.level.nav.randomFreeNear(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 5, () => rng.f());
          if (spot && ZaryaStory.zoneOf(spot.x, spot.z) === ZaryaStory.zoneOf(d.x, d.z)) {
            const q = this.put(rng.f() < 0.25 ? 'runner' : 'shambler', spot.x, spot.z, rng, null, true);
            const p = up.reduce((b, c) => (Math.hypot(c.x - d.x, c.z - d.z) < Math.hypot(b.x - d.x, b.z - d.z) ? c : b));
            q.aggro(p.x, p.z);
          }
        }
      }
    }

    this.cast(v, rng);

    // the lure: full strength, then fading out over its last third. Some noises never stop while their cause lasts:
    // the shutter's banging until its plug is pulled (Baba Yaga calls her carol-singers herself: `stage.ts`)
    const l = this.lure;
    let mul = 1;
    let cap = 0;
    if (l.t > 0) {
      l.t = Math.max(0, l.t - dt);
      const k = Math.min(1, l.t / (l.len * 0.35));
      mul = 1 + (l.mul - 1) * k;
      cap = Math.round(l.cap * k);
    }
    if (has(F.guard) && !has(F.plug)) mul = Math.max(mul, 1.5);
    zm.rateMul = mul;
    zm.capBonus = cap;

    if (this.gena && !this.gena.alive) {
      this.gena = null;
      this.notes.push('gena');
    }
    if (this.guard && !this.guard.alive) {
      this.guard = null;
      this.notes.push('guardDown');
    }
    if (this.named.mishka && !this.named.mishka.alive) {
      this.named.mishka = null;
      this.notes.push('bearDown');
    }
    // the bear at the hook: once he is there he stands at it, back to the square, until he has done
    const b = this.where('mishka');
    if (b && has(F.prize)) {
      const hx = ZARYA.hook.x + 1.2;
      const hz = ZARYA.hook.z + 1.4;
      const d = Math.hypot(b.x - hx, b.z - hz);
      if (d < 2.6) {
        this.prizeT -= dt;
        b.yaw = Math.atan2(-(ZARYA.hook.x - b.x), -(ZARYA.hook.z + 2.2 - b.z));
      } else if (b.state !== 'idle') {
        // knocked out of it (a blow turned him): he goes back to it
        b.standDown(hx, hz);
      }
      if (this.prizeT <= 0) {
        b.sightScale = this.sight;
        const p = nearest(up, b.x, b.z);
        if (p) b.aggro(p.x, p.z);
        this.notes.push('prizeDone');
      }
    }

    this.stepBorya(v, up);
    this.stands = stand;
    this.stepYaga(dt, v, stand, rng);
    this.stepTamada(dt, v, up);
    this.stepMorozko(dt, v, up);
    this.room(this.canteen, dt, up, rng);
    this.room(this.berloga, dt, up, rng);
    return this.notes;
  }

  /** Stand each of the named ones in their place when the story reaches them (once a run). */
  private cast(v: StoryView, rng: Rng): void {
    const did = (flag: number): boolean => (v.g & flag) !== 0;
    const due = (who: Exclude<Named, 'mishka'>): boolean => (this.placed & BIT[who]) === 0;
    if (due('borya') && v.ch >= CH.act2) {
      // Borya at his meat rows, looking down the hall (in his cold store already, if the door was barred before this director came)
      const at = did(G.barred) ? RYNOK.coldInside : RYNOK.borya;
      const hall = RYNOK.hall;
      const q = this.stand('borya', 'BORYA', at, yawTo(at.x, at.z, (hall.x0 + hall.x1) / 2, at.z), BOSS.borya.hp, rng);
      // the market is his: he follows nobody out of it
      q.territory = { ...RYNOK.rect };
    }
    if (due('yaga') && did(G.tickets) && !did(G.yagaDown)) {
      // in her hut on the revolve, its door to the back of the stage, asleep on its legs until the squad comes in
      this.stand('yaga', 'BABA YAGA', DK.hut, WEST, BOSS.yaga.hp, rng);
    }
    if (due('tamada') && did(G.escalator) && !did(G.tamadaDown)) {
      // on the little stage behind his microphone, glass raised to the room
      const q = this.stand('tamada', 'THE TAMADA', CANTEEN.tamada, WEST, BOSS.tamada.hp, rng);
      q.territory = { ...CANTEEN.rect };
    }
    if (due('morozko') && v.ch >= CH.finale && !did(G.morozkoDown)) {
      // Dr Zimin in the frost king's coat, waiting, turned to the door
      const q = this.stand('morozko', 'MOROZKO', BERLOGA.morozko, WEST, BOSS.morozko.hp, rng);
      this.morozkoBase = q.maxHp;
      q.territory = { x0: BERLOGA.doorX, z0: BERLOGA.rect.z0, x1: BERLOGA.rect.x1, z1: BERLOGA.rect.z1 };
    }
  }

  /**
   * BORYA. Blind and still until a standing player comes near; then he hunts through his market, and nothing puts
   * him down. Led deep into his cold store he is reported in; while nobody stands in there with him he stays at the
   * hatch his quarry left by (too small for him), so the door can be barred on him. Barred, he is shut in for good.
   */
  private stepBorya(v: StoryView, up: readonly Stand[]): void {
    const b = this.where('borya');
    if (!b) return;
    if ((v.g & G.barred) !== 0) {
      if (!this.shut) {
        this.shut = true;
        this.baffled = false;
        this.hold(b, yawTo(b.x, b.z, RYNOK.coldDoor.x, RYNOK.coldDoor.z));
      }
      return;
    }
    if ((this.woke & BIT.borya) === 0) {
      if (!up.some((p) => Math.hypot(p.x - b.x, p.z - b.z) <= BOSS.borya.see)) return;
      this.woke |= BIT.borya;
      this.notes.push('boryaUp');
      this.wake(b, up);
    }
    // in: inside the cold store's walls and at least as far from its door as `coldInside` is
    const door = RYNOK.coldDoor;
    const deep = Math.hypot(RYNOK.coldInside.x - door.x, RYNOK.coldInside.z - door.z);
    const inside = inRect(RYNOK.coldStore, b.x, b.z) && Math.hypot(b.x - door.x, b.z - door.z) >= deep;
    if (inside !== this.boryaIn) {
      this.boryaIn = inside;
      this.notes.push(inside ? 'boryaIn' : 'boryaOut');
    }
    const company = up.some((p) => inRect(RYNOK.coldStore, p.x, p.z));
    if (inside && !company) {
      if (!this.baffled) {
        this.baffled = true;
        this.hold(b, yawTo(b.x, b.z, RYNOK.hatch.x, RYNOK.hatch.z));
      }
    } else if (this.baffled) {
      this.baffled = false;
      this.wake(b, up);
    } else if (b.state === 'idle') {
      // lost them: he goes after whoever is still in his market
      const p = nearest(up.filter((q) => inRect(RYNOK.rect, q.x, q.z)), b.x, b.z);
      if (p) b.aggro(p.x, p.z);
    }
  }

  /**
   * BABA YAGA. Asleep on her hut's legs on the revolve until a standing player comes within `BOSS.yaga.see` m; then the
   * fight (`stage.ts`): the hut walks, she attacks from it, and only the stage's machinery opens her door. Her door's
   * being open is the story's `G.exposed` (each opening and shutting is noted).
   */
  private stepYaga(dt: number, v: StoryView, stand: readonly Stand[], rng: Rng): void {
    const y = this.named.yaga;
    if (!y) return;
    const up = stand.filter((p) => p.up);
    if (!y.alive) {
      this.named.yaga = null;
      if (this.wasOpen) this.notes.push('hutBack');
      this.wasOpen = false;
      this.yagaFight.phase = 0;
      this.notes.push('yagaDown');
      return;
    }
    if ((this.woke & BIT.yaga) === 0 && up.some((p) => Math.hypot(p.x - y.x, p.z - y.z) <= BOSS.yaga.see)) {
      this.woke |= BIT.yaga;
      this.notes.push('yagaUp');
      this.yagaFight.begin(y, Math.max(1, stand.length));
    }
    if ((this.woke & BIT.yaga) === 0) return;
    // (a director that comes in after she noticed the squad: the fight is begun where the story says it was)
    if (this.yagaFight.phase === 0 && (v.g & G.yaga) !== 0) this.yagaFight.begin(y, Math.max(1, stand.length));
    this.yagaFight.step(dt, y, stand, rng);
    const open = this.yagaFight.level > 0;
    if (open !== this.wasOpen) {
      this.wasOpen = open;
      this.notes.push(open ? 'hutTurned' : 'hutBack');
    }
  }

  /** Baba Yaga's stage as every screen should draw it (`stage.ts` `Stage`): the word and the pools' two numbers. */
  get stage(): [number, number, number] {
    const [pa, pb] = this.yagaFight.poolWords;
    return [this.yagaFight.word, pa, pb];
  }

  /** Her pots in the air (the solo screen draws them; a guest sees only where they came down). */
  get pots(): YagaFight['flying'] {
    return this.yagaFight.flying.slice();
  }

  /** What her broom, her stamping and her pots did to the players since the last call (`i`: their index in the last `stand`). */
  drainHurts(): Hurt[] {
    return this.yagaFight.drainHurts();
  }

  /**
   * THE TAMADA. Asleep on the canteen's stage until someone comes into the room. Then he toasts, and each toast brings
   * the party to its feet: weaker with every loudspeaker unplugged (bits 0-2 of `v.m`). With all three out he comes
   * down off the stage, and only then can he be hurt.
   */
  private stepTamada(dt: number, v: StoryView, up: readonly Stand[]): void {
    const t = this.named.tamada;
    if (!t) return;
    if (!t.alive) {
      this.named.tamada = null;
      this.canteen.t = 0;
      this.notes.push('tamadaDown');
      return;
    }
    const company = up.some((p) => inRect(CANTEEN.rect, p.x, p.z));
    if ((this.woke & BIT.tamada) === 0) {
      if (!company) return;
      this.woke |= BIT.tamada;
      this.toastT = 0;
      this.notes.push('tamadaUp');
    }
    const playing = 3 - ZaryaStory.count(v.m & 7);
    if (playing > 0) {
      // a toast is for someone: he does not raise his glass to an empty room
      if (!company) return;
      this.toastT -= dt;
      if (this.toastT <= 0) {
        this.toastT = BOSS.tamada.every;
        this.canteen.t = BOSS.tamada.len;
        this.canteen.gap = BOSS.tamada.gap[playing]!;
        this.canteen.cap = BOSS.tamada.cap[playing]!;
      }
    } else if (!this.tamadaDown) {
      this.tamadaDown = true;
      this.canteen.t = 0;
      t.invulnerable = false;
      this.wake(t, up);
    }
  }

  /**
   * MOROZKO. He stands and waits; once he has asked, a blow lands. Believed, he never fights. Otherwise the fight
   * starts the moment the answer is not believed, or he is hurt, or a standing player walks right up to him: he hunts,
   * and the hall's sleepers keep waking for as long as he stands. Every clue the squad found is one weak point more
   * (`PARRY`), and every clue that was looked at takes something off his health.
   */
  private stepMorozko(dt: number, v: StoryView, up: readonly Stand[]): void {
    const m = this.named.morozko;
    if (!m) return;
    const did = (flag: number): boolean => (v.g & flag) !== 0;
    if (!m.alive) {
      this.named.morozko = null;
      this.fight = false;
      this.asking = false;
      this.reelT = this.weak = 0;
      this.berloga.t = 0;
      this.notes.push('morozkoDown');
      // the hall goes quiet: whoever else was woken in it stands where they are
      for (const z of this.zombies.zombies) if (z.alive && inRect(BERLOGA.rect, z.x, z.z)) this.hold(z, null);
      return;
    }
    // (the Zenit's photographs open weak points, but take nothing off his health)
    const want = this.morozkoBase * (2.4 - 0.1 * ZaryaStory.count(v.clues & LOOKED));
    if (Math.abs(m.maxHp - want) > 1e-6) {
      const left = m.hp / m.maxHp;
      m.maxHp = want;
      m.hp = left >= 1 ? want : want * left;
    }
    if (did(G.believed)) {
      m.invulnerable = true;
      this.asking = false;
      this.reelT = this.weak = 0;
      if (this.fight) {
        // believed after the fight had started (the answer can be given mid-fight, from 6.6 m): he stops, and so does
        // the hall, as when he falls - a believed Morozko never goes on fighting the squad that warmed his town
        this.fight = false;
        this.berloga.t = 0;
        this.hold(m, null);
        for (const z of this.zombies.zombies) if (z.alive && z !== m && inRect(BERLOGA.rect, z.x, z.z)) this.hold(z, null);
      }
      return;
    }
    if (this.fight) {
      // for as long as he stands (and anyone stands against him: `room`)
      this.berloga.t = 1;
      this.question(dt, m, v);
      return;
    }
    if (!did(G.asked)) return;
    m.invulnerable = false;
    const hurt = m.hp < m.maxHp * 0.9999;
    if (did(G.answered) || hurt || up.some((p) => Math.hypot(p.x - m.x, p.z - m.z) <= BOSS.morozko.near)) {
      this.fight = true;
      this.berloga.t = 1;
      // his heavy blow comes with his question, and a swing into it is a parry (`Zombie.windingUp`)
      m.parrySlam = true;
      m.slamGap = PARRY.every;
      m.hurtMul = (amount, dir) => this.weakHit(m, amount, dir);
      this.wake(m, up);
    }
  }

  /**
   * Morozko fighting, one frame: he asks his question in each slam's wind-up (the screens show it from his pose:
   * `Zombie.poseMode` 'slam'). A swing landing in it staggers him (`meleeSystem`, any screen that runs the infected):
   * that is a parry. A guard raised to him in it is asked for (`story.act('parry')`, `onEvent`).
   */
  private question(dt: number, m: Zombie, v: StoryView): void {
    const slam = m.windingUp && m.poseMode === 'slam';
    if (slam && !this.asking) {
      this.asking = true;
      this.askHp = m.hp;
    } else if (!slam && this.asking) {
      this.asking = false;
      this.askT = 0;
    } else if (!slam) this.askT += dt;
    // a blow that landed in the pause and threw him back
    if (this.reelT <= 0 && (this.asking || this.askT <= PARRY.grace) && m.state === 'stagger' && m.hp < this.askHp - 1e-6) this.parry(m, v);
    if (this.reelT > 0) {
      this.reelT -= dt;
      if (this.reelT <= 0) {
        this.reelT = 0;
        this.weak = 0;
      } else if (m.state !== 'stagger') {
        // something else stopped him for less (the Zenit's flash): he reels for the rest of it
        m.stagger(this.reelT);
      }
    }
  }

  /** Caught in his question: he reels, and his weak points open (one for every clue found, `PARRY.weakMax` at most). */
  private parry(m: Zombie, v: StoryView): void {
    this.asking = false;
    this.askT = Infinity;
    this.reelT = PARRY.stagger;
    this.weak = (1 << Math.min(PARRY.weakMax, ZaryaStory.count(v.clues))) - 1;
    this.parries++;
    m.stagger(PARRY.stagger);
  }

  /** A blow on Morozko: on an open weak point's side it is worth `PARRY.weakMul`, and that one closes. */
  private weakHit(m: Zombie, amount: number, dir: number): number {
    if (this.reelT <= 0 || this.weak === 0) return amount;
    const i = weakAt(this.weak, sideHit(m.yaw, dir));
    if (i < 0) return amount;
    this.weak &= ~(1 << i);
    return amount * PARRY.weakMul;
  }

  /**
   * A room's draw, one frame: while it lasts and someone stands in the room, one more comes in through the door
   * farthest from everybody, never more than the room's cap on their feet.
   */
  private room(r: Room, dt: number, up: readonly Stand[], rng: Rng): void {
    if (r.t <= 0) return;
    r.t -= dt;
    const inside = up.filter((p) => inRect(r.rect, p.x, p.z));
    if (inside.length === 0) return;
    r.next -= dt;
    if (r.next > 0) return;
    r.next = r.gap * (0.8 + rng.f() * 0.4);
    let n = 0;
    for (const z of this.zombies.zombies) if (z.alive && !z.isBoss && inRect(r.rect, z.x, z.z)) n++;
    if (n >= r.cap) return;
    let best: readonly [number, number] | null = null;
    let far = 6; // nobody steps out of a door someone is standing in
    for (const s of r.spots) {
      const d = Math.min(...inside.map((p) => Math.hypot(p.x - s[0], p.z - s[1])));
      if (d > far) {
        far = d;
        best = s;
      }
    }
    if (!best) return;
    const q = this.put(rng.f() < 0.25 ? 'runner' : 'shambler', best[0], best[1], rng, null, true);
    const p = nearest(inside, q.x, q.z);
    if (p) q.aggro(p.x, p.z);
  }
}

function nearest(stand: readonly Stand[], x: number, z: number): Stand | null {
  let best: Stand | null = null;
  let bd = Infinity;
  for (const p of stand) {
    if (!p.up) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
