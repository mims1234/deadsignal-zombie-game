/**
 * HIRASAKA: KUROGANE IN THE ROOT HALL (no THREE, no DOM). The overseer, woken by Mio's hairpin. Whoever runs the infected
 * runs this (`director.ts`: the solo game and the co-op simulation); the story carries its state to every screen (`kw`,
 * `kx`) and counts his thunders (`story.ts` `thunder`, `kuPhase`); `bossLook.ts` draws it and works the Root Hall's
 * machinery (`world/layout/hirasakaRoot.ts` ROOT_MACHINES); `bosses.ts` puts the prompts and the HUD's line on it.
 *
 * Eight THUNDERS are drums on his body (shoulders, chest, back, hips, belly, and a ring on his head). Nothing reaches him
 * through his iron while he stands in his strength: each phase the hall itself has to be turned on him, and each time it
 * is, a window opens in which one thunder can be broken (the drum facing the guns; the head only last). Three PHASES,
 * each with its own machine, each changing the room:
 *
 *   1 THE HOIST   the winch on the west wall runs the nearest ore skip along the rail to over him and drops it: under
 *                 the rail (a band along z -23) when it lands, he is down under a tonne of ore for a while. Thunders 0-2.
 *   2 THE FAN     he breathes black damp: a cloud round him that chokes whoever stands in it, and nothing reaches him in
 *                 it. The fan in the north wall blows it out of the hall for a while; as it clears, his thunders split off
 *                 him as THUNDERLINGS. Thunders 3-5.
 *   3 THE PUMP    the sump overflows and the hall floor goes under black water: the roots of the forked tree are under it.
 *                 Pump it dry, and when he comes near the tree the roots take him and hold him for the head. Thunders 6-7.
 *
 * His own blows are the Warden's (the infected's AI runs him whenever nothing holds him). Nothing here is timed for the
 * player: every machine winds back by itself, a miss only costs the wait, and nothing fails the run.
 */
import type { Zombie, ZombieScript } from '../enemies/zombie';
import type { Rng } from '../logic/rng';
import { ROOT_MACHINES } from '../world/layout/hirasakaRoot';
import { DEEP_SPOTS } from './places';
import type { Hurt } from './bossUmi';

interface Stand {
  x: number;
  y: number;
  z: number;
  up: boolean;
}

export const KMACHINE = { hoist: 0, fan: 1, pump: 2 } as const;
export type KMachine = 0 | 1 | 2;

/** The thunders each phase breaks (by index: 0 R shoulder, 1 L shoulder, 2 chest, 3 back, 4 R hip, 5 L hip, 6 belly, 7 head). */
export const PHASE_NODES: readonly (readonly number[])[] = [[], [0, 1, 2], [3, 4, 5], [6, 7]];
/** The side of him each thunder faces (0 front, 1 back, 2 his left, 3 his right; -1 any). */
const NODE_SIDE = [3, 2, 0, 1, 3, 2, 0, -1];

export const KURO = {
  /** His health for each player past the first (the thunders share it equally). */
  squad: 0.5,
  /** Seconds he rages at the start of each phase (nothing reaches him). */
  rage: 2.6,
  /** The ore skips: their rail (x range, its line in z, its height), the trolley's speed, the drop, the band under the rail a dropped skip lands on, how long he is down, the wind back. */
  rail: { x0: ROOT_MACHINES.hoist.rail.x0 + 2, x1: ROOT_MACHINES.hoist.rail.x1 - 2, z: ROOT_MACHINES.hoist.rail.z },
  trolley: 18,
  drop: 0.5,
  band: { x: 2.8, z: 4.6 },
  stun: 7.5,
  lie: { hit: 6, miss: 1.5 },
  hoistBack: 4,
  /** The fan: how long it keeps his gas out, then winds back; thunderlings split off as it clears and with each thunder broken. */
  // (long enough for one player alone to start it in the north wall and get back to him across the hall)
  fan: { window: 16, rearm: 8, split: 2, cap: 5 },
  /** His black damp: how far round him, what it does to a lung a second. */
  gas: { r: 6, dps: 8 },
  /** The pump: seconds to pump the floor dry, seconds for the sump to flood it again; the roots reach him this near the tree, and hold him. */
  pump: { drain: 4, refill: 4.5 },
  roots: { r: 8.5, hold: 10 },
} as const;

/** What a machine is doing: ready; running; winding back. The pump: flooded (ready), pumping, dry, flooding again. */
export const KSTATE = { ready: 0, running: 1, winding: 2 } as const;
export const PSTATE = { flooded: 0, pumping: 1, dry: 2, refill: 3 } as const;
/** An ore skip: hung at home; running to him and dropping; down on the floor; hoisted back. */
export const SKIP = { hung: 0, running: 1, down: 2, hoisting: 3 } as const;

/**
 * The word (`kw`): bits 0-1 phase; 2 a window is open; 3 down under a skip; 4 held by the roots; 5 raging; 6 his gas;
 * 7-8 the fan; 9-10 the pump; 11-16 the three skips (two bits each); 19-22 the water on the floor (0 dry .. 15 flooded).
 * The second number (`kx`): each skip's place on the rail (6 bits, x - rail.x0) and how far down it hangs (3 bits).
 */
export const Kuro = {
  phase: (kw: number): number => kw & 3,
  open: (kw: number): boolean => ((kw >> 2) & 1) !== 0,
  stunned: (kw: number): boolean => ((kw >> 3) & 1) !== 0,
  pinned: (kw: number): boolean => ((kw >> 4) & 1) !== 0,
  raging: (kw: number): boolean => ((kw >> 5) & 1) !== 0,
  gas: (kw: number): boolean => ((kw >> 6) & 1) !== 0,
  fan: (kw: number): number => (kw >> 7) & 3,
  pump: (kw: number): number => (kw >> 9) & 3,
  skip: (kw: number, i: number): number => (kw >> (11 + i * 2)) & 3,
  water: (kw: number): number => ((kw >> 19) & 15) / 15,
  skipX: (kx: number, i: number): number => KURO.rail.x0 + ((kx >> (i * 9)) & 63),
  skipDrop: (kx: number, i: number): number => ((kx >> (i * 9 + 6)) & 7) / 7,
  /** Machine `m` can be worked now. */
  ready(kw: number, m: number): boolean {
    const ph = Kuro.phase(kw);
    if (ph === 0 || Kuro.raging(kw)) return false;
    if (m === KMACHINE.hoist) return ph === 1 && !Kuro.stunned(kw) && [0, 1, 2].some((i) => Kuro.skip(kw, i) === SKIP.hung) && ![0, 1, 2].some((i) => Kuro.skip(kw, i) === SKIP.running);
    if (m === KMACHINE.fan) return ph === 2 && Kuro.fan(kw) === KSTATE.ready;
    if (m === KMACHINE.pump) return ph === 3 && Kuro.pump(kw) === PSTATE.flooded && !Kuro.pinned(kw);
    return false;
  },
};

/** The machine a phase is worked with, and where it is worked from. */
export const KMACHINES: readonly { id: 'hoist' | 'fan' | 'pump'; verb: string; at: { x: number; y: number; z: number } }[] = [
  { id: 'hoist', verb: 'RUN THE HOIST', at: { x: ROOT_MACHINES.hoist.winch.x, y: 0, z: ROOT_MACHINES.hoist.winch.z + 1.2 } },
  { id: 'fan', verb: 'START THE FAN', at: { x: ROOT_MACHINES.fan.spot.x, y: 0, z: ROOT_MACHINES.fan.spot.z } },
  { id: 'pump', verb: 'START THE PUMP', at: { x: ROOT_MACHINES.pump.spot.x, y: 0, z: ROOT_MACHINES.pump.spot.z } },
];

/** Something holds him (down, pinned, raging): the infected's AI stands aside. */
class HeldScript implements ZombieScript {
  held = false;
  mode: 'stagger' | 'slam' = 'stagger';
  step(z: Zombie): boolean {
    if (!this.held) return false;
    z.vx = z.vz = 0;
    const p = z.scriptPose;
    p.mode = this.mode;
    p.actionT = 0;
    p.speed = 0;
    p.lift = 0;
    return true;
  }
}

export interface KuroHooks {
  /** A thunderling split off him at (x, z), hunting the nearest player. */
  spawn(x: number, z: number, rng: Rng): void;
  /** How many thunderlings are on their feet. */
  count(): number;
}

interface SkipRun {
  state: number;
  x: number;
  /** 0 hung at the rail .. 1 on the floor. */
  drop: number;
  t: number;
}

/** The open middle of the Root Hall (clear of the tree, the sump and the machines). */
const HALL_MIDDLE = { x: 316, z: -34 };

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class KuroFight {
  phase = 0;
  private rageT = 0;
  private open = false;
  private stunT = 0;
  private pinT = 0;
  private fanState: number = KSTATE.ready;
  private fanT = 0;
  private pumpState: number = PSTATE.flooded;
  private pumpT = 0;
  /** The water on the floor (1 flooded .. 0 dry). */
  water = 0;
  readonly skips: SkipRun[] = ROOT_MACHINES.hoist.skips.map((s) => ({ state: SKIP.hung, x: s.x, drop: 0, t: 0 }));
  private target = -1;
  private nodeHp: number[] = new Array(8).fill(0);
  /** Thunders broken (bits), and the ones broken since the director last asked. */
  broken = 0;
  private fresh = 0;
  private gasTick = 0;
  private hurts: Hurt[] = [];
  private notes: string[] = [];
  private script: HeldScript | null = null;
  /** He hunts the nearest of them (asked once a second), and is eased out of a corner he has stuck in. */
  private aimT = 0;
  private stuck = { x: 0, z: 0, t: 0 };

  constructor(private readonly hooks: KuroHooks) {}

  reset(): void {
    this.phase = 0;
    this.rageT = this.stunT = this.pinT = this.fanT = this.pumpT = this.gasTick = 0;
    this.open = false;
    this.fanState = KSTATE.ready;
    this.pumpState = PSTATE.flooded;
    this.water = 0;
    ROOT_MACHINES.hoist.skips.forEach((s, i) => Object.assign(this.skips[i]!, { state: SKIP.hung, x: s.x, drop: 0, t: 0 }));
    this.target = -1;
    this.nodeHp.fill(0);
    this.broken = this.fresh = 0;
    this.hurts = [];
    this.notes = [];
    this.script = null;
  }

  get word(): number {
    let w = this.phase & 3;
    if (this.open) w |= 1 << 2;
    if (this.stunT > 0) w |= 1 << 3;
    if (this.pinT > 0) w |= 1 << 4;
    if (this.rageT > 0) w |= 1 << 5;
    if (this.gasOn) w |= 1 << 6;
    w |= (this.fanState & 3) << 7;
    w |= (this.pumpState & 3) << 9;
    this.skips.forEach((s, i) => (w |= (s.state & 3) << (11 + i * 2)));
    w |= (Math.round(Math.max(0, Math.min(1, this.water)) * 15) & 15) << 19;
    return w;
  }

  get skipWord(): number {
    let w = 0;
    this.skips.forEach((s, i) => {
      const x = Math.max(0, Math.min(63, Math.round(s.x - KURO.rail.x0)));
      const d = Math.round(Math.max(0, Math.min(1, s.drop)) * 7);
      w |= (x | (d << 6)) << (i * 9);
    });
    return w;
  }

  /** His black damp is round him (phase 2, the fan not blowing). */
  get gasOn(): boolean {
    return this.phase === 2 && this.fanState !== KSTATE.running && this.rageT <= 0;
  }

  drainHurts(): Hurt[] {
    const h = this.hurts;
    this.hurts = [];
    return h;
  }

  /** Thunders broken since the last call (bits). */
  drainBroken(): number {
    const b = this.fresh;
    this.fresh = 0;
    return b;
  }

  /** What the screens should say (`miss`, `stun`, `pin`, `split`). */
  drainNotes(): string[] {
    const n = this.notes;
    this.notes = [];
    return n;
  }

  /** He wakes (the hairpin taken): his health for this many players, shared by his thunders; `broken` those already gone. */
  begin(k: Zombie, players: number, broken = 0): void {
    if (this.phase > 0) return;
    const hp = k.maxHp * (1 + KURO.squad * (Math.max(1, players) - 1));
    k.maxHp = hp;
    this.broken = broken;
    for (let i = 0; i < 8; i++) this.nodeHp[i] = broken & (1 << i) ? 0 : hp / 8;
    k.hp = this.nodeHp.reduce((a, b) => a + b, 0);
    this.phase = 1;
    while (this.phase < 3 && PHASE_NODES[this.phase]!.every((i) => broken & (1 << i))) this.phase++;
    this.rageT = KURO.rage;
    this.take(k);
    this.enterPhase();
  }

  private take(k: Zombie): void {
    if (!(k.script instanceof HeldScript)) {
      this.script = new HeldScript();
      k.script = this.script;
    } else this.script = k.script;
    // (put back every frame nothing holds him: the infected drop a script that lets go, so this keeps the window's state)
    k.invulnerable = !this.open;
    // a blow in a window breaks the thunder facing it (one thunder a window; the head only last)
    k.hurtMul = (amount, dirYaw) => {
      if (!this.open) return 0;
      const i = this.nodeFor(k, dirYaw);
      if (i < 0) return 0;
      const a = Math.min(amount, this.nodeHp[i]!);
      this.nodeHp[i]! -= a;
      if (this.nodeHp[i]! <= 1e-3) {
        this.nodeHp[i] = 0;
        this.broken |= 1 << i;
        this.fresh |= 1 << i;
        this.shut(k);
        if (this.broken === 255) return k.hp + 1;
        if (this.phase === 2) this.split(k, 2);
      }
      return a;
    };
  }

  /** The live thunder of this phase on the side a blow travelling along `dirYaw` strikes (the head only once the rest are gone). */
  private nodeFor(k: Zombie, dirYaw: number): number {
    const live = PHASE_NODES[this.phase]!.filter((i) => !(this.broken & (1 << i)) && (i !== 7 || (this.broken & 127) === 127));
    if (!live.length) return -1;
    const a = wrap(dirYaw - k.yaw);
    const abs = Math.abs(a);
    const side = abs >= (Math.PI * 3) / 4 ? 0 : abs <= Math.PI / 4 ? 1 : a < 0 ? 2 : 3;
    return live.find((i) => NODE_SIDE[i] === side) ?? live[0]!;
  }

  private shut(k: Zombie): void {
    this.open = false;
    k.invulnerable = true;
  }

  private openWindow(k: Zombie): void {
    this.open = true;
    k.invulnerable = false;
  }

  private enterPhase(): void {
    this.fanState = KSTATE.ready;
    this.fanT = 0;
    this.stunT = this.pinT = 0;
    if (this.phase === 3) {
      // the sump comes over: the floor floods
      this.pumpState = PSTATE.refill;
      this.pumpT = KURO.pump.refill;
    }
  }

  /** (QA and tests only) Every thunder broken at once and his iron off: the next blow puts him down. */
  endNow(k: Zombie): void {
    this.fresh |= 255 & ~this.broken;
    this.broken = 255;
    this.open = true;
    k.invulnerable = false;
    k.hurtMul = null;
  }

  /** A player worked machine `m` (the story let them: it was ready). */
  use(m: KMachine, k: Zombie | null): void {
    if (this.phase === 0 || this.rageT > 0 || !k || !k.alive) return;
    if (m === KMACHINE.hoist && this.phase === 1) {
      if (this.skips.some((s) => s.state === SKIP.running)) return;
      // the hung skip nearest over him runs to him
      let best = -1;
      this.skips.forEach((s, i) => {
        if (s.state !== SKIP.hung) return;
        if (best < 0 || Math.abs(s.x - k.x) < Math.abs(this.skips[best]!.x - k.x)) best = i;
      });
      if (best < 0) return;
      const s = this.skips[best]!;
      s.state = SKIP.running;
      s.drop = 0;
      this.target = Math.max(KURO.rail.x0, Math.min(KURO.rail.x1, k.x));
    } else if (m === KMACHINE.fan && this.phase === 2 && this.fanState === KSTATE.ready) {
      this.fanState = KSTATE.running;
      this.fanT = KURO.fan.window;
      this.openWindow(k);
      this.split(k, KURO.fan.split);
    } else if (m === KMACHINE.pump && this.phase === 3 && this.pumpState === PSTATE.flooded) {
      this.pumpState = PSTATE.pumping;
      this.pumpT = KURO.pump.drain;
    }
  }

  /** Thunderlings split off him (as many as the cap allows). */
  private split(k: Zombie, n: number): void {
    const room = Math.min(n, KURO.fan.cap - this.hooks.count());
    if (room <= 0) return;
    this.notes.push('split');
    for (let i = 0; i < room; i++) {
      const a = k.yaw + Math.PI / 2 + i * Math.PI;
      this.splits.push({ x: k.x + Math.cos(a) * 2.2, z: k.z + Math.sin(a) * 2.2 });
    }
  }
  private readonly splits: { x: number; z: number }[] = [];

  /** Nothing holds him: he goes for the nearest standing player, and does not stay wedged in a corner of the hall. */
  private hunt(dt: number, k: Zombie, stand: readonly Stand[]): void {
    let near: Stand | null = null;
    let best = Infinity;
    for (const p of stand) {
      const d = Math.hypot(p.x - k.x, p.z - k.z);
      if (p.up && d < best) {
        best = d;
        near = p;
      }
    }
    if (!near) return;
    this.aimT -= dt;
    if (this.aimT <= 0) {
      this.aimT = 1;
      if (k.state !== 'attack' && k.state !== 'stagger') k.aggro(near.x, near.z);
    }
    // no headway for a while with them still out of reach: out toward the middle of the hall
    if (Math.hypot(k.x - this.stuck.x, k.z - this.stuck.z) > 1 || best < 4) {
      this.stuck = { x: k.x, z: k.z, t: 0 };
      return;
    }
    this.stuck.t += dt;
    if (this.stuck.t > 4) {
      const c = HALL_MIDDLE;
      const d = Math.max(0.1, Math.hypot(c.x - k.x, c.z - k.z));
      k.x += ((c.x - k.x) / d) * Math.min(d, dt * 3);
      k.z += ((c.z - k.z) / d) * Math.min(d, dt * 3);
      if (this.stuck.t > 7) this.stuck.t = 0;
    }
  }

  /** Every frame while he stands. */
  step(dt: number, k: Zombie, stand: readonly Stand[], rng: Rng): void {
    if (this.phase === 0) return;
    if (!(k.script instanceof HeldScript)) this.take(k);
    const s = this.script!;
    for (const p of this.splits.splice(0)) this.hooks.spawn(p.x, p.z, rng);

    // ---- the phase's thunders all broken: the next phase ----
    if (this.phase < 3 && PHASE_NODES[this.phase]!.every((i) => this.broken & (1 << i))) {
      this.phase++;
      this.shut(k);
      this.rageT = KURO.rage;
      this.enterPhase();
      this.notes.push('phase');
    }
    this.rageT = Math.max(0, this.rageT - dt);

    // ---- the hoist ----
    for (let i = 0; i < 3; i++) {
      const sk = this.skips[i]!;
      const home = ROOT_MACHINES.hoist.skips[i]!.x;
      if (sk.state === SKIP.running) {
        const d = this.target - sk.x;
        if (Math.abs(d) > 0.05) sk.x += Math.sign(d) * Math.min(Math.abs(d), KURO.trolley * dt);
        else {
          sk.drop = Math.min(1, sk.drop + dt / KURO.drop);
          if (sk.drop >= 1) {
            const under = Math.abs(k.x - sk.x) <= KURO.band.x && Math.abs(k.z - KURO.rail.z) <= KURO.band.z;
            sk.state = SKIP.down;
            sk.t = under ? KURO.lie.hit : KURO.lie.miss;
            if (under) {
              this.stunT = KURO.stun;
              this.openWindow(k);
              this.notes.push('stun');
            } else this.notes.push('miss');
          }
        }
      } else if (sk.state === SKIP.down) {
        sk.t -= dt;
        if (sk.t <= 0) {
          sk.state = SKIP.hoisting;
          sk.t = KURO.hoistBack;
        }
      } else if (sk.state === SKIP.hoisting) {
        sk.t -= dt;
        const k2 = Math.max(0, sk.t / KURO.hoistBack);
        sk.drop = Math.min(sk.drop, k2);
        sk.x += (home - sk.x) * Math.min(1, dt * 1.5);
        if (sk.t <= 0) {
          sk.state = SKIP.hung;
          sk.drop = 0;
          sk.x = home;
        }
      }
    }
    if (this.stunT > 0) {
      this.stunT -= dt;
      if (this.stunT <= 0) this.shut(k);
    }

    // ---- the fan and his gas ----
    if (this.fanState !== KSTATE.ready) {
      this.fanT -= dt;
      if (this.fanT <= 0) {
        if (this.fanState === KSTATE.running) {
          this.fanState = KSTATE.winding;
          this.fanT = KURO.fan.rearm;
          if (this.phase === 2) this.shut(k);
        } else this.fanState = KSTATE.ready;
      }
    }
    if (this.gasOn) {
      this.gasTick -= dt;
      if (this.gasTick <= 0) {
        this.gasTick = 0.5;
        stand.forEach((p, i) => {
          if (p.up && Math.hypot(p.x - k.x, p.z - k.z) <= KURO.gas.r && Math.abs(p.y - k.y) < 3) this.hurts.push({ i, amount: KURO.gas.dps * 0.5, x: k.x, z: k.z, knock: 0 });
        });
      }
    }

    // ---- the pump, the water, the roots ----
    if (this.phase === 3) {
      if (this.pumpState === PSTATE.pumping) {
        this.pumpT -= dt;
        this.water = Math.max(0, this.pumpT / KURO.pump.drain);
        if (this.pumpT <= 0) {
          this.pumpState = PSTATE.dry;
          this.water = 0;
        }
      } else if (this.pumpState === PSTATE.refill) {
        this.pumpT -= dt;
        this.water = Math.min(1, 1 - this.pumpT / KURO.pump.refill);
        if (this.pumpT <= 0) {
          this.pumpState = PSTATE.flooded;
          this.water = 1;
        }
      } else if (this.pumpState === PSTATE.dry && this.pinT <= 0 && this.rageT <= 0) {
        const T = DEEP_SPOTS.tree;
        if (Math.hypot(k.x - T.x, k.z - T.z) <= KURO.roots.r) {
          this.pinT = KURO.roots.hold;
          this.openWindow(k);
          this.notes.push('pin');
        }
      }
      if (this.pinT > 0) {
        this.pinT -= dt;
        // the roots draw him in to the trunk
        const T = DEEP_SPOTS.tree;
        const d = Math.hypot(k.x - T.x, k.z - T.z);
        if (d > T.r + 2.2) {
          k.x += ((T.x - k.x) / d) * Math.min(d - T.r - 2.2, dt * 1.5);
          k.z += ((T.z - k.z) / d) * Math.min(d - T.r - 2.2, dt * 1.5);
        }
        if (this.pinT <= 0 || !this.open) {
          this.pinT = 0;
          this.shut(k);
          this.pumpState = PSTATE.refill;
          this.pumpT = KURO.pump.refill;
        }
      }
    }

    // ---- what holds him ----
    s.held = this.rageT > 0 || this.stunT > 0 || this.pinT > 0;
    if (!s.held) this.hunt(dt, k, stand);
    s.mode = this.rageT > 0 ? 'slam' : 'stagger';
  }
}
