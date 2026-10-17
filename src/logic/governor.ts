/**
 * The device-tier governor (pure). A device starts on a guessed tier (or the one saved for it), a calibration over the
 * first seconds of play corrects the guess, and the governor then judges the frame times every couple of seconds:
 * the render scale moves first, and only once it is at its floor does the tier step down; the tier steps up only
 * after a long stretch with room to spare. Tiers never change during a defense hold, a horde or an extraction.
 */
import { GOVERNOR, QUALITY, QUALITY_TIERS } from '../config';
import type { QualityLevel } from '../types';

/** What a stretch of frames looked like. */
export interface FrameWindow {
  /** 95th-percentile frame time, ms. */
  p95: number;
  /** Mean frame time, ms. */
  avgMs: number;
  /** Share of frames slower than the tier's budget by `GOVERNOR.slowFactor`. */
  slowShare: number;
  /** Seconds the frames cover. */
  seconds: number;
  frames: number;
}

export const tierIndex = (q: QualityLevel): number => Math.max(0, QUALITY_TIERS.indexOf(q));
const tierAt = (i: number): QualityLevel => QUALITY_TIERS[Math.max(0, Math.min(QUALITY_TIERS.length - 1, i))]!;

/** The 95th percentile of `values` (nearest rank; 0 for none). */
export function p95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]!;
}

/** Summarise frame times (ms) against a tier's budget. */
export function summarize(frameMs: readonly number[], tier: QualityLevel): FrameWindow {
  const slowAt = QUALITY[tier].frameBudgetMs * GOVERNOR.slowFactor;
  let sum = 0;
  let slow = 0;
  for (const ms of frameMs) {
    sum += ms;
    if (ms > slowAt) slow++;
  }
  const n = frameMs.length;
  return { p95: p95(frameMs), avgMs: n ? sum / n : 0, slowShare: n ? slow / n : 0, seconds: sum / 1000, frames: n };
}

/**
 * The first guess, before a frame is drawn. Phones and tablets start on Low (Lite when the browser reports little
 * memory or few cores), computers on Medium (Low when weak). `lowSpec`: `lowSpecHardware()` in `render/lite.ts`.
 */
export function guessTier(touch: boolean, lowSpec: boolean): QualityLevel {
  if (touch) return lowSpec ? 'lite' : 'low';
  return lowSpec ? 'low' : 'medium';
}

/** The highest tier the governor may reach on its own on this device. */
export function tierCeiling(touch: boolean): QualityLevel {
  return touch ? GOVERNOR.touchCeiling : 'high+';
}

/** Where a device starts: the tier saved for it, else the guess; never above its ceiling. */
export function startTier(saved: QualityLevel | null, touch: boolean, lowSpec: boolean): QualityLevel {
  const t = saved ?? guessTier(touch, lowSpec);
  return tierAt(Math.min(tierIndex(t), tierIndex(tierCeiling(touch))));
}

/**
 * The calibration: the first seconds of play judged as one window. Far over budget drops two tiers, over budget one;
 * clearly fast enough for the next tier (p95 under 80% of its budget) raises one.
 */
export function calibrate(w: FrameWindow, tier: QualityLevel, ceiling: QualityLevel): QualityLevel {
  const i = tierIndex(tier);
  const budget = QUALITY[tier].frameBudgetMs;
  if (w.frames === 0) return tier;
  if (w.p95 > budget * 2 && i >= 2) return tierAt(i - 2);
  if (w.p95 > budget * 1.25 && i >= 1) return tierAt(i - 1);
  const next = QUALITY_TIERS[i + 1];
  if (next && i + 1 <= tierIndex(ceiling) && w.p95 <= QUALITY[next].frameBudgetMs * 0.8) return next;
  return tier;
}

export interface GovernorState {
  /** Seconds in a row with the p95 frame time over the tier's budget. */
  over: number;
  /** Seconds with room to spare under the next tier's budget (a bad window resets it). */
  under: number;
  /** Seconds until the render scale may move again. */
  cooldown: number;
  /** Seconds since the last tier step up. */
  sinceUp: number;
  /** The highest tier index the governor may reach (lowered when a step up had to be taken back). */
  ceiling: number;
}

export function newGovernor(ceiling: QualityLevel): GovernorState {
  return { over: 0, under: 0, cooldown: 4, sinceUp: Infinity, ceiling: tierIndex(ceiling) };
}

export interface GovernorInput {
  window: FrameWindow;
  tier: QualityLevel;
  renderScale: number;
  /** A defense hold, a horde or an extraction: the tier holds still (the render scale may still move). */
  busy: boolean;
  /** False when the player picked the quality by hand: only the render scale moves. */
  auto: boolean;
}

export type GovernorAction = 'none' | 'scale-down' | 'scale-up' | 'tier-down' | 'tier-up';

/** One window's decision. Returns the next state; the caller applies the action. */
export function governorStep(s: GovernorState, inp: GovernorInput): { state: GovernorState; action: GovernorAction } {
  const w = inp.window;
  const dt = w.seconds;
  const i = tierIndex(inp.tier);
  const budget = QUALITY[inp.tier].frameBudgetMs;
  const next = QUALITY_TIERS[i + 1];
  const nextBudget = next ? QUALITY[next].frameBudgetMs : budget;
  const st: GovernorState = { ...s, cooldown: s.cooldown - dt, sinceUp: s.sinceUp + dt };
  if (w.p95 > budget) {
    st.over += dt;
    st.under = 0;
  } else {
    st.over = 0;
    if (w.p95 <= nextBudget * GOVERNOR.upHeadroom) st.under += dt;
  }
  const atFloor = inp.renderScale <= GOVERNOR.minScale + 0.01;
  const atFull = inp.renderScale >= 0.99;
  const sustained = inp.auto && st.over >= GOVERNOR.downAfter;

  // the tier, once the resolution has nothing left to give
  if (sustained && atFloor && !inp.busy && i > 0) {
    if (st.sinceUp < GOVERNOR.regret) st.ceiling = Math.min(st.ceiling, i - 1);
    return { state: { ...st, over: 0, under: 0, cooldown: 4, sinceUp: Infinity }, action: 'tier-down' };
  }
  // the resolution first
  if (st.cooldown <= 0 && !atFloor && (w.slowShare > GOVERNOR.slowShare || sustained)) {
    return { state: { ...st, cooldown: 3 }, action: 'scale-down' };
  }
  if (inp.auto && !inp.busy && next && i < st.ceiling && atFull && st.under >= GOVERNOR.upAfter) {
    return { state: { ...st, over: 0, under: 0, cooldown: 4, sinceUp: 0 }, action: 'tier-up' };
  }
  if (st.cooldown <= 0 && w.slowShare === 0 && !atFull) {
    return { state: { ...st, cooldown: 12 }, action: 'scale-up' };
  }
  return { state: st, action: 'none' };
}

/**
 * A whole run's frame times, for the run report: the mean frame rate and the 95th percentile without keeping every
 * frame (quarter-millisecond bins up to 250 ms).
 */
export class FrameHistogram {
  private readonly bins = new Uint32Array(1000);
  private count = 0;
  private total = 0;

  add(ms: number): void {
    this.bins[Math.min(this.bins.length - 1, Math.max(0, Math.floor(ms * 4)))]!++;
    this.count++;
    this.total += ms;
  }

  get frames(): number {
    return this.count;
  }

  get avgFps(): number {
    return this.total > 0 ? (this.count * 1000) / this.total : 0;
  }

  get p95(): number {
    if (this.count === 0) return 0;
    const want = Math.ceil(this.count * 0.95);
    let seen = 0;
    for (let b = 0; b < this.bins.length; b++) {
      seen += this.bins[b]!;
      if (seen >= want) return (b + 1) / 4;
    }
    return this.bins.length / 4;
  }

  reset(): void {
    this.bins.fill(0);
    this.count = 0;
    this.total = 0;
  }
}
