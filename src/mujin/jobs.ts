/**
 * MUJIN's heart, as pure state (no THREE): the five jobs that get the dead station running again, the night that
 * takes it piece by piece while nothing gets done, the payphone, and Ren. The solo game runs one; the co-op simulation
 * runs the shared one and sends it on (`encodeJobs`); every screen draws what it says (`runtime.ts`).
 *
 *   clock      pick up the winding key in the tunnel mouth (the tunnel answers), wind the clock over the gates
 *   crossing   throw the three breakers by the level crossing, then hold the road while it powers up
 *   tickets    find the five lost tickets round the station (each one found draws the dead), feed them into the gates
 *   rope       tie a new rope at the shrine: a long hold, in the Tall Lady's ground
 *   announce   start the announcement at the PA desk, then hold the ticket hall until it has played
 *
 * Each job done lights a lamp on the board beside the bell. The night's clock runs while nothing gets done: when it
 * runs out it takes an area (`SEALS`: the street, the shrine, the field; mist that hurts whoever is in it) and starts
 * again; a fourth time and it takes the station. Every job done winds it back. Five lamps: the dawn (`dawn`), and the
 * Stationmaster can be stopped; the dawn train is the mission's extraction.
 *
 * The payphone rings after each job: Ren, five calls. After the fifth she is on platform 2; take her by the hand to the
 * waiting-room bench and she boards the dawn train with you. If the Tall Lady reaches her first, she is gone.
 */
import { MUJIN, PLACES, SEALS } from './places';

export const JOB_IDS = ['clock', 'crossing', 'tickets', 'rope', 'announce'] as const;
export type JobId = (typeof JOB_IDS)[number];
export const JOB: Record<JobId, number> = { clock: 0, crossing: 1, tickets: 2, rope: 3, announce: 4 };
export const JOB_NAMES: Record<JobId, string> = {
  clock: 'START THE STATION CLOCK',
  crossing: 'POWER THE LEVEL CROSSING',
  tickets: 'RETURN THE LOST TICKETS',
  rope: 'TIE THE SHRINE ROPE',
  announce: 'MAKE THE ANNOUNCEMENT',
};

export const MUJIN_JOBS = {
  /** The night's clock: seconds with no job done before it takes the next area. */
  nightEvery: 420,
  /** The warning before it does (the bell). */
  warnAt: 60,
  /** Seconds to power the crossing, and to play the announcement (someone in the zone the whole time). */
  charge: 35,
  announce: 40,
  /** Tickets to return. */
  tickets: 5,
  /** How close: the key, a breaker, the clock, a ticket, the gates, the rope, the desk, Ren, the bench, the phone. */
  reach: { ren: 2.4, bench: 3.4, phone: 2.2 },
  /** Calls before the last one is live. */
  calls: 5,
};

export const REN_STATE = { unknown: 0, here: 1, safe: 2, gone: 3 } as const;

export interface JobsView {
  /** Bits of `JOB`: done. */
  done: number;
  /** The winding key: 0 in the tunnel, 1 carried (by the squad), 2 used. */
  key: number;
  /** Bits: breakers thrown; the crossing's charge 0..1. */
  breakers: number;
  charge: number;
  /** Bits of `PLACES.tickets`: dropped this run, and picked up; tickets carried and returned. */
  ticketSet: number;
  picked: number;
  carried: number;
  returned: number;
  /** The announcement: started, and how far it has played 0..1. */
  announcing: boolean;
  played: number;
  /** Bits of `SEALS`: taken; seconds left on the night's clock; the night took the station. */
  sealed: number;
  night: number;
  lost: boolean;
  /** Payphone calls answered. */
  calls: number;
  ren: number;
  renLead: number;
  renX: number;
  renZ: number;
  /** Every lamp lit. */
  dawn: boolean;
}

export type JobsEvent =
  | { kind: 'done'; job: JobId; lamps: number }
  | { kind: 'key' }
  | { kind: 'breaker'; i: number; all: boolean }
  | { kind: 'ticket'; i: number; x: number; z: number }
  | { kind: 'returned'; n: number }
  | { kind: 'announcing' }
  | { kind: 'warn' }
  | { kind: 'seal'; i: number }
  | { kind: 'night' }
  | { kind: 'dawn' }
  | { kind: 'call'; n: number }
  | { kind: 'renHere' }
  | { kind: 'renHand'; seat: number }
  | { kind: 'renSafe' }
  | { kind: 'renGone' };

/** Someone standing somewhere (the host's players, for the zones and the reaches). */
export interface Stand {
  x: number;
  z: number;
  up: boolean;
}

export class MujinJobs {
  view: JobsView = MujinJobs.empty();
  private events: JobsEvent[] = [];
  private warned = false;

  static empty(): JobsView {
    return { done: 0, key: 0, breakers: 0, charge: 0, ticketSet: 0, picked: 0, carried: 0, returned: 0, announcing: false, played: 0, sealed: 0, night: MUJIN_JOBS.nightEvery, lost: false, calls: 0, ren: REN_STATE.unknown, renLead: -1, renX: MUJIN.ren.x, renZ: MUJIN.ren.z, dawn: false };
  }

  /** A new run: five of the ticket spots get a ticket. */
  reset(rand: () => number): void {
    const v = MujinJobs.empty();
    const idx = PLACES.tickets.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    for (const i of idx.slice(0, MUJIN_JOBS.tickets)) v.ticketSet |= 1 << i;
    this.view = v;
    this.events.length = 0;
    this.warned = false;
  }

  drain(): JobsEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  static lamps(v: JobsView): number {
    let n = 0;
    for (let i = 0; i < JOB_IDS.length; i++) if (v.done & (1 << i)) n++;
    return n;
  }

  static isDone(v: JobsView, job: JobId): boolean {
    return (v.done & (1 << JOB[job])) !== 0;
  }

  /** Is the payphone ringing? After each job, until it is answered (five calls in all). */
  static phoneRinging(v: JobsView): boolean {
    return v.calls < Math.min(MUJIN_JOBS.calls, MujinJobs.lamps(v)) && !v.lost;
  }

  /** The first job not yet done (what the Bench Sitter whispers), or null. */
  static nextJob(v: JobsView): JobId | null {
    for (const id of JOB_IDS) if (!MujinJobs.isDone(v, id)) return id;
    return null;
  }

  /** Every frame on the host: the zones that charge, the night's clock, Ren. `stand`: the players. */
  tick(dt: number, stand: readonly Stand[]): void {
    const v = this.view;
    if (v.lost) return;
    const inside = (c: { x: number; z: number; r: number }): boolean => stand.some((p) => p.up && Math.hypot(p.x - c.x, p.z - c.z) < c.r);
    // the crossing powers up while someone holds the road
    if (!MujinJobs.isDone(v, 'crossing') && v.breakers === 0b111) {
      if (inside(PLACES.crossing)) v.charge = Math.min(1, v.charge + dt / MUJIN_JOBS.charge);
      if (v.charge >= 1) this.finish('crossing');
    }
    // the announcement plays while someone holds the hall
    if (!MujinJobs.isDone(v, 'announce') && v.announcing) {
      if (inside(PLACES.hall)) v.played = Math.min(1, v.played + dt / MUJIN_JOBS.announce);
      if (v.played >= 1) this.finish('announce');
    }
    // the night's clock (it stops at dawn)
    if (!v.dawn) {
      v.night -= dt;
      if (v.night <= MUJIN_JOBS.warnAt && !this.warned) {
        this.warned = true;
        this.events.push({ kind: 'warn' });
      }
      if (v.night <= 0) this.nightfall();
    }
  }

  private nightfall(): void {
    const v = this.view;
    this.warned = false;
    v.night = MUJIN_JOBS.nightEvery;
    for (let i = 0; i < SEALS.length; i++) {
      if (!(v.sealed & (1 << i))) {
        v.sealed |= 1 << i;
        this.events.push({ kind: 'seal', i });
        return;
      }
    }
    v.lost = true;
    this.events.push({ kind: 'night' });
  }

  private finish(job: JobId): void {
    const v = this.view;
    if (MujinJobs.isDone(v, job)) return;
    v.done |= 1 << JOB[job];
    v.night = MUJIN_JOBS.nightEvery;
    this.warned = false;
    const lamps = MujinJobs.lamps(v);
    this.events.push({ kind: 'done', job, lamps });
    if (lamps >= JOB_IDS.length) {
      v.dawn = true;
      this.events.push({ kind: 'dawn' });
    }
  }

  // ---- what players do (the host checks they are where they say) ----

  takeKey(x: number, z: number): boolean {
    const v = this.view;
    if (v.key !== 0 || Math.hypot(PLACES.key.x - x, PLACES.key.z - z) > PLACES.key.r + 0.6) return false;
    v.key = 1;
    this.events.push({ kind: 'key' });
    return true;
  }

  windClock(x: number, z: number): boolean {
    const v = this.view;
    if (v.key !== 1 || Math.hypot(PLACES.clock.x - x, PLACES.clock.z - z) > PLACES.clock.r + 0.6) return false;
    v.key = 2;
    this.finish('clock');
    return true;
  }

  throwBreaker(i: number, x: number, z: number): boolean {
    const v = this.view;
    const b = PLACES.breakers[i];
    if (!b || v.breakers & (1 << i) || Math.hypot(b.x - x, b.z - z) > b.r + 0.6) return false;
    v.breakers |= 1 << i;
    this.events.push({ kind: 'breaker', i, all: v.breakers === 0b111 });
    return true;
  }

  takeTicket(i: number, x: number, z: number): boolean {
    const v = this.view;
    const t = PLACES.tickets[i];
    if (!t || !(v.ticketSet & (1 << i)) || v.picked & (1 << i) || Math.hypot(t.x - x, t.z - z) > 2.2) return false;
    v.picked |= 1 << i;
    v.carried++;
    this.events.push({ kind: 'ticket', i, x: t.x, z: t.z });
    return true;
  }

  returnTickets(x: number, z: number): boolean {
    const v = this.view;
    if (v.carried <= 0 || Math.hypot(PLACES.gates.x - x, PLACES.gates.z - z) > PLACES.gates.r + 0.6) return false;
    v.returned += v.carried;
    v.carried = 0;
    this.events.push({ kind: 'returned', n: v.returned });
    if (v.returned >= MUJIN_JOBS.tickets) this.finish('tickets');
    return true;
  }

  tieRope(x: number, z: number): boolean {
    const v = this.view;
    if (MujinJobs.isDone(v, 'rope') || Math.hypot(PLACES.rope.x - x, PLACES.rope.z - z) > PLACES.rope.r + 0.6) return false;
    this.finish('rope');
    return true;
  }

  startAnnouncement(x: number, z: number): boolean {
    const v = this.view;
    if (v.announcing || MujinJobs.isDone(v, 'announce') || Math.hypot(PLACES.mic.x - x, PLACES.mic.z - z) > PLACES.mic.r + 0.6) return false;
    v.announcing = true;
    this.events.push({ kind: 'announcing' });
    return true;
  }

  answer(x: number, z: number): boolean {
    const v = this.view;
    if (!MujinJobs.phoneRinging(v) || Math.hypot(MUJIN.payphone.x - x, MUJIN.payphone.z - z) > MUJIN_JOBS.reach.phone) return false;
    v.calls++;
    this.events.push({ kind: 'call', n: v.calls });
    if (v.calls >= MUJIN_JOBS.calls && v.ren === REN_STATE.unknown) {
      v.ren = REN_STATE.here;
      v.renX = MUJIN.ren.x;
      v.renZ = MUJIN.ren.z;
      this.events.push({ kind: 'renHere' });
    }
    return true;
  }

  takeRen(seat: number, x: number, z: number): boolean {
    const v = this.view;
    if (v.ren !== REN_STATE.here || v.renLead >= 0 || Math.hypot(v.renX - x, v.renZ - z) > MUJIN_JOBS.reach.ren) return false;
    v.renLead = seat;
    this.events.push({ kind: 'renHand', seat });
    return true;
  }

  seatRen(seat: number, x: number, z: number): boolean {
    const v = this.view;
    if (v.ren !== REN_STATE.here || v.renLead !== seat || Math.hypot(MUJIN.bench.x - x, MUJIN.bench.z - z) > MUJIN_JOBS.reach.bench) return false;
    v.ren = REN_STATE.safe;
    v.renLead = -1;
    this.events.push({ kind: 'renSafe' });
    return true;
  }

  /** The Tall Lady reached her before the bench did. */
  loseRen(): void {
    const v = this.view;
    if (v.ren !== REN_STATE.here) return;
    v.ren = REN_STATE.gone;
    v.renLead = -1;
    this.events.push({ kind: 'renGone' });
  }

  dropRen(): void {
    if (this.view.renLead >= 0) this.view.renLead = -1;
  }

  /** Where she is: a step behind whoever leads her, on the bench once safe, else where she waits. */
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
    }
  }
}

/** The co-op wire: the view as a row of numbers. */
export function encodeJobs(v: JobsView): number[] {
  const r = (n: number): number => Math.round(n * 100) / 100;
  return [v.done, v.key, v.breakers, r(v.charge), v.ticketSet, v.picked, v.carried, v.returned, v.announcing ? 1 : 0, r(v.played), v.sealed, Math.round(v.night * 10) / 10, v.lost ? 1 : 0, v.calls, v.ren, v.renLead, r(v.renX), r(v.renZ), v.dawn ? 1 : 0];
}

export function decodeJobs(row: unknown): JobsView | null {
  if (!Array.isArray(row) || row.length < 19) return null;
  const n = row.map(Number);
  return { done: n[0]!, key: n[1]!, breakers: n[2]!, charge: n[3]!, ticketSet: n[4]!, picked: n[5]!, carried: n[6]!, returned: n[7]!, announcing: n[8] === 1, played: n[9]!, sealed: n[10]!, night: n[11]!, lost: n[12] === 1, calls: n[13]!, ren: n[14]!, renLead: n[15]!, renX: n[16]!, renZ: n[17]!, dawn: n[18] === 1 };
}
