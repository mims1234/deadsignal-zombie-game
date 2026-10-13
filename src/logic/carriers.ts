/**
 * Card carrier side contract (pure). Each carrier walks the district as a named infected. It cannot be killed:
 * emptying its health knocks it down, a knocked-down carrier can be purged with the counter-agent, and purging
 * leaves its card on the ground to pick up. Left alone on the ground too long, it gets back up.
 *
 *   roaming -> identified -> downed -> purged -> recovered
 *                    ^----------'  (timer ran out)
 */
import { CARD_MODE } from '../config';

export type CarrierPhase = 'roaming' | 'identified' | 'downed' | 'purged' | 'recovered';

export interface CarrierState {
  id: string;
  phase: CarrierPhase;
  /** Seconds left before a downed carrier gets back up. */
  downLeft: number;
  /** Times it has been knocked down this run. */
  downs: number;
}

export function createCarrier(id: string): CarrierState {
  return { id, phase: 'roaming', downLeft: 0, downs: 0 };
}

/** The player got close enough to read the signal. True on the frame it happens. */
export function identifyCarrier(c: CarrierState, distance: number): boolean {
  if (c.phase !== 'roaming' || distance > CARD_MODE.revealRange) return false;
  c.phase = 'identified';
  return true;
}

/** Health reached zero. Counts as an identification too (a grenade can drop a carrier nobody has seen yet). */
export function downCarrier(c: CarrierState): boolean {
  if (c.phase !== 'roaming' && c.phase !== 'identified') return false;
  c.phase = 'downed';
  c.downLeft = CARD_MODE.downTime;
  c.downs++;
  return true;
}

/** Advance the get-up timer. Returns true on the frame the carrier gets back up. */
export function tickCarrier(c: CarrierState, dt: number): boolean {
  if (c.phase !== 'downed') return false;
  c.downLeft -= dt;
  if (c.downLeft > 0) return false;
  c.downLeft = 0;
  c.phase = 'identified';
  return true;
}

/** Administer the counter-agent. Only a downed carrier can be purged. */
export function purgeCarrier(c: CarrierState): boolean {
  if (c.phase !== 'downed') return false;
  c.phase = 'purged';
  c.downLeft = 0;
  return true;
}

/** Pick the card up. Pays out exactly once. */
export function recoverCarrier(c: CarrierState): boolean {
  if (c.phase !== 'purged') return false;
  c.phase = 'recovered';
  return true;
}

export function recoveredCount(list: readonly CarrierState[]): number {
  let n = 0;
  for (const c of list) if (c.phase === 'recovered') n++;
  return n;
}

/** Cash for a recovered card, plus the bonus when it was the last one. */
export function recoveryReward(list: readonly CarrierState[]): number {
  const all = list.length > 0 && recoveredCount(list) === list.length;
  return CARD_MODE.reward + (all ? CARD_MODE.allBonus : 0);
}

/**
 * Pick `count` well-separated spots from `candidates`: the first at random, each next one the candidate furthest
 * from everything already chosen. Returns indices into `candidates` (fewer when there are not enough).
 */
export function spreadPick(candidates: readonly { x: number; z: number }[], count: number, rand: () => number): number[] {
  const picked: number[] = [];
  if (candidates.length === 0 || count <= 0) return picked;
  picked.push(Math.min(candidates.length - 1, Math.floor(rand() * candidates.length)));
  while (picked.length < count && picked.length < candidates.length) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (picked.includes(i)) continue;
      let near = Infinity;
      for (const j of picked) {
        const d = Math.hypot(candidates[i]!.x - candidates[j]!.x, candidates[i]!.z - candidates[j]!.z);
        if (d < near) near = d;
      }
      if (near > bestD) {
        bestD = near;
        best = i;
      }
    }
    if (best < 0) break;
    picked.push(best);
  }
  return picked;
}
