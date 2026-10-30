/**
 * The loop, MUJIN's heart, as pure state (no THREE): the solo game runs one, the co-op simulation runs the shared one
 * and sends it on (`encodeLoop`), and every screen draws what it says (`runtime.ts`).
 *
 *   fight   the loop runs: the infected come; from `minRead` s in, the squad may read the station: report the one
 *           thing that changed where it is (hold E there), or pull the All Clear at the platform bell. The first read
 *           counts for everyone, and it is final.
 *   bell    the last 20 s: the bell rings; no read by the end is a wrong read.
 *   reset   the station is put back (with a change, or none): a right read lights a lamp on the canopy, a wrong one puts
 *           every lamp out and the night takes the next area (`SEALS`); three wrong in a row and it takes the station.
 *   dawn    every lamp lit (or the last loop run out): no more loops. The Stationmaster can be stopped; then the dawn
 *           train comes (the mission's extraction).
 *
 * The payphone rings once a loop. Five calls answered in a run and the fifth is Ren, live: she is on platform 2 at
 * once, as that loop's change, and after that one loop in three. Put right, she is gone. Taken by the hand to the waiting-room bench, the
 * loop counts as wrong, but she is safe: at dawn she boards with you (the secret ending).
 */
import { ANOMALIES, tierFor } from './anomalies';
import { MUJIN, SEALS, SPOTS, SPOT_INDEX } from './places';

export const MUJIN_LOOP = {
  /** The first loop is a short one. */
  first: 75,
  fight: 100,
  bell: 20,
  reset: 3.5,
  /** Seconds into a loop before the station can be read (nobody reads it blind on arrival). */
  minRead: 8,
  lampsToWin: 5,
  /** After this many loops the dawn train comes anyway (the Stationmaster with it). */
  maxLoops: 20,
  /** Wrong reads in a row that let the night take the station. */
  wrongToLose: 3,
  /** A loop with nothing wrong: about one in three. */
  noneChance: 0.32,
  /** From this loop the Stationmaster walks platform 1. */
  masterFrom: 6,
  /** How close to the bell for the All Clear, to Ren to take her hand, to the bench to sit her down, to the phone. */
  reach: { bell: 2.6, ren: 2.4, bench: 3.4, phone: 2.2 },
  /** Calls answered before the fifth one is Ren. */
  calls: 5,
};

export const LOOP_PHASES = ['fight', 'bell', 'reset', 'dawn'] as const;
export type LoopPhase = (typeof LOOP_PHASES)[number];

/** `LoopView.anomaly`: nothing is wrong, or the change is Ren. */
export const NONE = -1;
export const REN = -2;

/** `LoopView.read`. */
export const READ = { none: 0, fixed: 1, wrong: 2, clear: 3 } as const;
/** `LoopView.ren`: never heard of; heard from (the fifth call); on platform 2 this loop; safe (on the bench); gone. */
export const REN_STATE = { unknown: 0, called: 1, here: 2, safe: 3, gone: 4 } as const;

export interface LoopView {
  loop: number;
  phase: LoopPhase;
  /** Seconds into the phase. */
  t: number;
  /** Lamps lit on the canopy: right reads in a row. */
  lamps: number;
  /** Wrong reads since the last right one. */
  wrongRun: number;
  /** Bits: which `SEALS` the night has taken. */
  sealed: number;
  /** This loop's change (`ANOMALIES` index), `NONE` or `REN`. */
  anomaly: number;
  /** This loop's read so far (`READ`), and the last loop's outcome (0 none, 1 right, 2 wrong). */
  read: number;
  last: number;
  /** Bits of `ANOMALIES` already used this run (each comes once). */
  used: number;
  /** Payphone calls answered, and the loop the last one was answered in. */
  calls: number;
  phoneLoop: number;
  ren: number;
  /** The loop she was called in (she is the change one loop in three after it). */
  renFrom: number;
  /** Someone is leading her by the hand (the leader's seat, -1 nobody), and where she is. */
  renLead: number;
  renX: number;
  renZ: number;
  /** Every lamp lit at least once: the Stationmaster can be hurt. `late`: the last loop ran out instead. */
  dawn: boolean;
  late: boolean;
  /** Reads over the run (the results screen). */
  rights: number;
  wrongs: number;
}

export type LoopEvent =
  | { kind: 'loop'; loop: number }
  | { kind: 'bell' }
  | { kind: 'read'; how: 'fixed' | 'wrong' | 'clear' | 'clearWrong'; spot: number; by: string }
  | { kind: 'result'; right: boolean; anomaly: number; lamps: number; sealed: number; newSeal: number }
  | { kind: 'night' }
  | { kind: 'dawn'; late: boolean }
  | { kind: 'call'; n: number; by: string }
  | { kind: 'renHand'; seat: number }
  | { kind: 'renSafe' }
  | { kind: 'renGone' };

export class MujinLoop {
  view: LoopView = MujinLoop.empty();
  private events: LoopEvent[] = [];
  private rand: () => number = Math.random;

  static empty(): LoopView {
    return { loop: 1, phase: 'fight', t: 0, lamps: 0, wrongRun: 0, sealed: 0, anomaly: NONE, read: READ.none, last: 0, used: 0, calls: 0, phoneLoop: 0, ren: REN_STATE.unknown, renFrom: 0, renLead: -1, renX: MUJIN.ren.x, renZ: MUJIN.ren.z, dawn: false, late: false, rights: 0, wrongs: 0 };
  }

  /** A new run. The first loop never has a change (you have never seen the station before). */
  reset(rand: () => number): void {
    this.rand = rand;
    this.view = MujinLoop.empty();
    this.events.length = 0;
    this.events.push({ kind: 'loop', loop: 1 });
  }

  drain(): LoopEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** How long the fight runs in loop `n`. */
  static fightFor(n: number): number {
    return n === 1 ? MUJIN_LOOP.first : MUJIN_LOOP.fight;
  }

  /** Seconds left before the bell stops (the fight's and the bell's together), for the top line. */
  static left(v: LoopView): number {
    if (v.phase === 'fight') return MujinLoop.fightFor(v.loop) - v.t + MUJIN_LOOP.bell;
    if (v.phase === 'bell') return MUJIN_LOOP.bell - v.t;
    return 0;
  }

  /** Can the station be read now (and nobody has yet this loop)? */
  static canRead(v: LoopView): boolean {
    return v.read === READ.none && ((v.phase === 'fight' && v.t >= MUJIN_LOOP.minRead) || v.phase === 'bell');
  }

  /** The spot this loop's change is at (-1: nothing is wrong). The Bench Sitter whispers it. */
  static changeSpot(v: LoopView): number {
    if (v.anomaly === REN) return SPOT_INDEX.ren;
    const a = ANOMALIES[v.anomaly];
    return a ? SPOT_INDEX[a.spot] : -1;
  }

  tick(dt: number): void {
    const v = this.view;
    if (v.phase === 'dawn') return;
    v.t += dt;
    if (v.phase === 'fight' && v.t >= MujinLoop.fightFor(v.loop)) {
      v.phase = 'bell';
      v.t = 0;
      this.events.push({ kind: 'bell' });
    } else if (v.phase === 'bell' && v.t >= MUJIN_LOOP.bell) {
      this.judge();
    } else if (v.phase === 'reset' && v.t >= MUJIN_LOOP.reset) {
      this.next();
    }
  }

  /** Report spot `i` as the change (someone at (x, z)). The first read of a loop counts; it is final. */
  report(i: number, x: number, z: number, by = ''): boolean {
    const v = this.view;
    const s = SPOTS[i];
    if (!s || !MujinLoop.canRead(v)) return false;
    if (Math.hypot(s.x - x, s.z - z) > s.r + 0.6) return false;
    if (s.id === 'ren' && v.anomaly !== REN) return false; // she is only there on her loops
    const right = MujinLoop.changeSpot(v) === i;
    v.read = right ? READ.fixed : READ.wrong;
    if (right && v.anomaly === REN) {
      // put right: the station takes her back, for good
      v.ren = REN_STATE.gone;
      v.renLead = -1;
      this.events.push({ kind: 'renGone' });
    }
    this.events.push({ kind: 'read', how: right ? 'fixed' : 'wrong', spot: i, by });
    return true;
  }

  /** The All Clear at the platform bell: nothing is wrong this loop. */
  allClear(x: number, z: number, by = ''): boolean {
    const v = this.view;
    if (!MujinLoop.canRead(v) || Math.hypot(MUJIN.bell.x - x, MUJIN.bell.z - z) > MUJIN_LOOP.reach.bell) return false;
    const right = v.anomaly === NONE;
    v.read = right ? READ.clear : READ.wrong;
    this.events.push({ kind: 'read', how: right ? 'clear' : 'clearWrong', spot: -1, by });
    return true;
  }

  /** Answer the payphone (once a loop, until the fifth call). */
  answer(x: number, z: number, by = ''): boolean {
    const v = this.view;
    if (!MujinLoop.phoneRinging(v) || Math.hypot(MUJIN.payphone.x - x, MUJIN.payphone.z - z) > MUJIN_LOOP.reach.phone) return false;
    v.calls++;
    v.phoneLoop = v.loop;
    if (v.calls >= MUJIN_LOOP.calls && v.ren === REN_STATE.unknown) {
      // the fifth call is live: she is on platform 2 now, and she is this loop's change (whatever else was)
      v.ren = REN_STATE.here;
      v.renFrom = v.loop;
      if (v.anomaly >= 0) v.used &= ~(1 << v.anomaly);
      v.anomaly = REN;
    }
    this.events.push({ kind: 'call', n: v.calls, by });
    return true;
  }

  /** Is the payphone ringing? Once a loop, in the first minute of the fight, until the fifth call is taken. */
  static phoneRinging(v: LoopView): boolean {
    return v.phase === 'fight' && v.t > 4 && v.t < 64 && v.phoneLoop !== v.loop && v.calls < MUJIN_LOOP.calls && !v.dawn;
  }

  /** Take Ren by the hand (player seat `seat` at (x, z)): she follows them. */
  takeRen(seat: number, x: number, z: number): boolean {
    const v = this.view;
    if (v.ren !== REN_STATE.here || v.renLead >= 0 || v.phase === 'reset') return false;
    if (Math.hypot(v.renX - x, v.renZ - z) > MUJIN_LOOP.reach.ren) return false;
    v.renLead = seat;
    this.events.push({ kind: 'renHand', seat });
    return true;
  }

  /** Sit her down on the waiting-room bench (the one leading her, at (x, z)): she is safe; the loop counts as wrong. */
  seatRen(seat: number, x: number, z: number): boolean {
    const v = this.view;
    if (v.ren !== REN_STATE.here || v.renLead !== seat) return false;
    if (Math.hypot(MUJIN.bench.x - x, MUJIN.bench.z - z) > MUJIN_LOOP.reach.bench) return false;
    v.ren = REN_STATE.safe;
    v.renLead = -1;
    // the change was left as it was: the station counts it against you
    if (v.read === READ.none) v.read = READ.wrong;
    this.events.push({ kind: 'renSafe' });
    return true;
  }

  /**
   * Where she is: a step behind whoever leads her (she is never seen walking: when you turn, she is just there), on the
   * bench once she is safe, else on platform 2 where she waits.
   */
  stepRen(dt: number, leader: { x: number; z: number; yaw: number } | null): void {
    const v = this.view;
    if (v.ren === REN_STATE.safe) {
      v.renX = MUJIN.bench.x + 1.4;
      v.renZ = MUJIN.bench.z;
    } else if (v.ren === REN_STATE.here && v.renLead >= 0 && leader) {
      const tx = leader.x + Math.sin(leader.yaw) * 1.5;
      const tz = leader.z + Math.cos(leader.yaw) * 1.5;
      const d = Math.hypot(tx - v.renX, tz - v.renZ);
      const k = d > 9 ? 1 : Math.min(1, (6 * dt) / Math.max(d, 1e-3));
      v.renX += (tx - v.renX) * k;
      v.renZ += (tz - v.renZ) * k;
    } else if (v.ren !== REN_STATE.here) {
      v.renX = MUJIN.ren.x;
      v.renZ = MUJIN.ren.z;
    }
  }

  /** The one leading her went down or left: she waits where she is. */
  dropRen(): void {
    if (this.view.renLead >= 0) this.view.renLead = -1;
  }

  private judge(): void {
    const v = this.view;
    const right = v.read === READ.fixed || v.read === READ.clear;
    let newSeal = -1;
    if (right) {
      v.lamps++;
      v.wrongRun = 0;
      v.rights++;
    } else {
      v.lamps = 0;
      v.wrongRun++;
      v.wrongs++;
      for (let i = 0; i < SEALS.length; i++) {
        if (!(v.sealed & (1 << i))) {
          v.sealed |= 1 << i;
          newSeal = i;
          break;
        }
      }
    }
    // she was the change and nobody took her: she goes back to wherever she waits
    if (v.ren === REN_STATE.here) {
      v.ren = REN_STATE.called;
      v.renLead = -1;
    }
    v.last = right ? 1 : 2;
    this.events.push({ kind: 'result', right, anomaly: v.anomaly, lamps: v.lamps, sealed: v.sealed, newSeal });
    if (!right && v.wrongRun >= MUJIN_LOOP.wrongToLose) {
      v.phase = 'dawn';
      this.events.push({ kind: 'night' });
      return;
    }
    if (v.lamps >= MUJIN_LOOP.lampsToWin || v.loop >= MUJIN_LOOP.maxLoops) {
      v.dawn = true;
      v.late = v.lamps < MUJIN_LOOP.lampsToWin;
      v.phase = 'dawn';
      v.t = 0;
      v.anomaly = NONE;
      this.events.push({ kind: 'dawn', late: v.late });
      return;
    }
    v.phase = 'reset';
    v.t = 0;
  }

  /** The next loop: the station put back, with this loop's change. */
  private next(): void {
    const v = this.view;
    v.loop++;
    v.phase = 'fight';
    v.t = 0;
    v.read = READ.none;
    v.anomaly = this.pick();
    if (v.anomaly === REN) v.ren = REN_STATE.here;
    this.events.push({ kind: 'loop', loop: v.loop });
  }

  private pick(): number {
    const v = this.view;
    // Ren: the loop after her call, then one loop in three
    if (v.ren === REN_STATE.called && (v.loop - v.renFrom) % 3 === 1) return REN;
    if (this.rand() < MUJIN_LOOP.noneChance) return NONE;
    const tier = tierFor(v.loop);
    const open: number[] = [];
    for (let i = 0; i < ANOMALIES.length; i++) if (ANOMALIES[i]!.tier <= tier && !(v.used & (1 << i))) open.push(i);
    // the newest tier first, when there is one left
    const fresh = open.filter((i) => ANOMALIES[i]!.tier === tier);
    const from = fresh.length > 0 && this.rand() < 0.55 ? fresh : open;
    if (from.length === 0) return NONE;
    const i = from[Math.floor(this.rand() * from.length)]!;
    v.used |= 1 << i;
    return i;
  }
}

/** The co-op wire: the view as a row of numbers. */
export function encodeLoop(v: LoopView): number[] {
  return [v.loop, LOOP_PHASES.indexOf(v.phase), Math.round(v.t * 10) / 10, v.lamps, v.wrongRun, v.sealed, v.anomaly, v.read, v.last, v.used, v.calls, v.phoneLoop, v.ren, v.renFrom, v.renLead, Math.round(v.renX * 10) / 10, Math.round(v.renZ * 10) / 10, v.dawn ? 1 : 0, v.late ? 1 : 0, v.rights, v.wrongs];
}

export function decodeLoop(row: unknown): LoopView | null {
  if (!Array.isArray(row) || row.length < 21) return null;
  const n = row.map(Number);
  return {
    loop: n[0]!,
    phase: LOOP_PHASES[n[1]!] ?? 'fight',
    t: n[2]!,
    lamps: n[3]!,
    wrongRun: n[4]!,
    sealed: n[5]!,
    anomaly: n[6]!,
    read: n[7]!,
    last: n[8]!,
    used: n[9]!,
    calls: n[10]!,
    phoneLoop: n[11]!,
    ren: n[12]!,
    renFrom: n[13]!,
    renLead: n[14]!,
    renX: n[15]!,
    renZ: n[16]!,
    dawn: n[17] === 1,
    late: n[18] === 1,
    rights: n[19]!,
    wrongs: n[20]!,
  };
}
