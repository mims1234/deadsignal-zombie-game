/**
 * The Asylum's barricades as pure rules and plain state (no THREE, no DOM): boards per window, tearing them down one
 * at a time, nailing them back up, and what repairs pay. Everything is numbers and arrays, so the co-op snapshot can
 * carry it as it is.
 *
 * Authority: on a co-op host (or solo) this state is the truth; guests only draw what the host reports and send
 * repair requests.
 */
import { BARRICADE } from './barricadeConfig';

export interface BarricadeState {
  /** Boards still up, per window (0 = open: the infected can climb through). */
  boards: number[];
  /** Progress 0..1 of the board currently being torn, per window. */
  tear: number[];
}

export function createBarricades(count: number, boards: number = BARRICADE.boards): BarricadeState {
  return { boards: new Array<number>(count).fill(boards), tear: new Array<number>(count).fill(0) };
}

/** Every window fully boarded again (a new run). */
export function resetBarricades(s: BarricadeState, boards: number = BARRICADE.boards): void {
  s.boards.fill(boards);
  s.tear.fill(0);
}

export function isOpen(s: BarricadeState, i: number): boolean {
  return (s.boards[i] ?? 0) <= 0;
}

export function isDamaged(s: BarricadeState, i: number, max: number = BARRICADE.boards): boolean {
  return (s.boards[i] ?? max) < max;
}

export function anyDamaged(s: BarricadeState, max: number = BARRICADE.boards): boolean {
  return s.boards.some((b) => b < max);
}

/**
 * One infected working at window `i` for `dt` seconds at `rate` (1 = a board a `tearTime`). Returns true on the frame
 * a board comes off. Nothing happens once the window is open.
 */
export function tearStep(s: BarricadeState, i: number, dt: number, rate = 1, tearTime: number = BARRICADE.tearTime): boolean {
  if (isOpen(s, i)) {
    s.tear[i] = 0;
    return false;
  }
  s.tear[i] = (s.tear[i] ?? 0) + (dt * rate) / tearTime;
  if (s.tear[i]! < 1) return false;
  s.tear[i] = 0;
  s.boards[i] = Math.max(0, s.boards[i]! - 1);
  return true;
}

/** Nail one board back on window `i`. False (and nothing changes) when it is already fully boarded. */
export function repairBoard(s: BarricadeState, i: number, max: number = BARRICADE.boards): boolean {
  if (i < 0 || i >= s.boards.length || s.boards[i]! >= max) return false;
  s.boards[i]!++;
  return true;
}

/** Board up every window (the Carpenter). Returns how many boards went back up. */
export function repairAll(s: BarricadeState, max: number = BARRICADE.boards): number {
  let n = 0;
  for (let i = 0; i < s.boards.length; i++) {
    n += max - s.boards[i]!;
    s.boards[i] = max;
    s.tear[i] = 0;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// repair pay: a token bucket per player
// ---------------------------------------------------------------------------------------------

/** What a player can still earn from boards: `credit` dollars as of time `at` (refills over time). */
export interface RepairPurse {
  credit: number;
  at: number;
}

export function createPurse(time = 0, cap: number = BARRICADE.payCap): RepairPurse {
  return { credit: cap, at: time };
}

/**
 * Pay for one board at `time`: the board's worth (times `mul`, e.g. double points) up to what is left in the purse.
 * The purse refills at `cap / window` dollars a second, never above `cap`. Returns the cash to award (may be 0).
 */
export function payRepair(
  p: RepairPurse,
  time: number,
  mul = 1,
  pay: number = BARRICADE.repairPay,
  cap: number = BARRICADE.payCap,
  window: number = BARRICADE.payWindow,
): number {
  const refill = Math.max(0, time - p.at) * (cap / window);
  p.credit = Math.min(cap, p.credit + refill);
  p.at = time;
  const base = Math.min(pay, Math.floor(p.credit));
  if (base <= 0) return 0;
  p.credit -= base;
  return Math.round(base * mul);
}
