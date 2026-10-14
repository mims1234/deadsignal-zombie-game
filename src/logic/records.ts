/**
 * RECOVER THE RECORDS (pure, serializable): the Asylum's day contract. Three patient files lie in the admin offices,
 * a ward cell and the morgue. Each pays once when it is picked up, and the set pays a bonus once when the last one is
 * in. The contract never blocks the extraction: it is the story, and the money.
 *
 * In co-op a pickup is a request (`recordInReach` on the client, `pickUpRecord` on the simulation); the state is just
 * which files are taken.
 */
import { RECORDS, type RecordSpot } from '../asylum/nightConfig';

export interface RecordsContract {
  status: 'active' | 'complete';
  /** One flag per file, in `RECORDS.spots` order. */
  found: boolean[];
  /** The completion bonus has been paid. */
  bonusClaimed: boolean;
}

export interface RecordPickup {
  /** Which file (index into the spots). */
  index: number;
  /** Cash for this file, plus the bonus when it completed the set. */
  cash: number;
  /** How many are in after this one. */
  count: number;
  /** This pickup completed the set. */
  completed: boolean;
}

export function createRecords(count = RECORDS.spots.length): RecordsContract {
  return { status: 'active', found: new Array<boolean>(count).fill(false), bonusClaimed: false };
}

export function recordsFound(c: RecordsContract): number {
  let n = 0;
  for (const f of c.found) if (f) n++;
  return n;
}

/**
 * Take file `index`. Returns what it pays, or null when it was already taken (or does not exist): a file can never
 * pay twice, and the bonus is paid exactly once.
 */
export function pickUpRecord(c: RecordsContract, index: number): RecordPickup | null {
  if (index < 0 || index >= c.found.length || c.found[index]) return null;
  c.found[index] = true;
  const count = recordsFound(c);
  let cash = RECORDS.cashEach;
  let completed = false;
  if (count === c.found.length && !c.bonusClaimed) {
    c.bonusClaimed = true;
    c.status = 'complete';
    cash += RECORDS.bonus;
    completed = true;
  }
  return { index, cash, count, completed };
}

/** The index of the untaken file within reach of (x, z), or -1. */
export function recordInReach(c: RecordsContract, x: number, z: number, spots: readonly RecordSpot[] = RECORDS.spots, radius = RECORDS.pickupRadius): number {
  for (let i = 0; i < spots.length && i < c.found.length; i++) {
    if (c.found[i]) continue;
    const s = spots[i]!;
    if (Math.hypot(s.x - x, s.z - z) <= radius) return i;
  }
  return -1;
}

/** The nearest untaken file to (x, z) and its distance, or null when all are in. */
export function nearestRecord(c: RecordsContract, x: number, z: number, spots: readonly RecordSpot[] = RECORDS.spots): { index: number; distance: number } | null {
  let best: { index: number; distance: number } | null = null;
  for (let i = 0; i < spots.length && i < c.found.length; i++) {
    if (c.found[i]) continue;
    const d = Math.hypot(spots[i]!.x - x, spots[i]!.z - z);
    if (!best || d < best.distance) best = { index: i, distance: d };
  }
  return best;
}
