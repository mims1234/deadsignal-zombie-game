/**
 * The Forge's story on the wire (co-op). The simulation puts two fields in its story snapshots:
 *   fr  the run's roster: [squad names, [name, rank, room] per holdout, [spot, ember] per furnace] (every couple of
 *       seconds, and in the first)
 *   fg  the story's state: [holdout phases, ledger bits, rumble [phase, wave], finale [phase, carrier], Hearth spots,
 *       furnaces [phase, progress %], sentry [yaw x100, shots, x, z], assault phase]
 * The carrier stays -1 until they start to turn, so nobody can see it coming.
 */
import type { VulcanRank } from './roster';
import { ASSAULT_PHASES, FINALE_PHASES, FURNACE_PHASES, ForgeStory, type ForgeView, HOLDOUT_PHASES, RUMBLE_PHASES } from './story';

const RANKS: readonly VulcanRank[] = ['leader', 'coLead', 'officer', 'member'];

export type RosterWire = [string[], [string, number, number][], [number, number][]];
export type StateWire = [number[], number, [number, number], [number, number], number[], [number, number][], [number, number, number, number], number];

const r1 = (v: number): number => Math.round(v * 10) / 10;

export function encodeRoster(v: ForgeView): RosterWire {
  return [[...v.squad], v.holdouts.map((h) => [h.name, RANKS.indexOf(h.rank), h.room]), v.furnaces.map((f) => [f.spot, f.flame])];
}

export function encodeState(v: ForgeView): StateWire {
  const ledger = v.ledger.reduce((m, f, i) => (f ? m | (1 << i) : m), 0);
  return [
    v.holdouts.map((h) => HOLDOUT_PHASES.indexOf(h.phase)),
    ledger,
    [RUMBLE_PHASES.indexOf(v.rumble.phase), v.rumble.wave],
    [FINALE_PHASES.indexOf(v.finale.phase), v.finale.carrier],
    v.holdouts.map((h) => h.slot),
    v.furnaces.map((f) => [FURNACE_PHASES.indexOf(f.phase), Math.round(f.progress * 100)]),
    [Math.round(v.sentry.yaw * 100), v.sentry.shots, r1(v.sentry.tx), r1(v.sentry.tz)],
    ASSAULT_PHASES.indexOf(v.assault),
  ];
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
const num = (v: unknown): number => Number(v) || 0;

/** A view from the wire: the roster (once known) with the latest state on it. Null until the roster has arrived. */
export function decodeView(roster: unknown, state: unknown, ledgerCount: number, furnaceSpots: number): ForgeView | null {
  if (!Array.isArray(roster) || !Array.isArray(roster[0]) || !Array.isArray(roster[1])) return null;
  const squad = (roster[0] as unknown[]).map((n) => String(n)).slice(0, 4);
  const holdouts = (roster[1] as unknown[]).slice(0, 16).map((row) => {
    const r = arr(row);
    return { name: String(r[0] ?? ''), rank: RANKS[num(r[1])] ?? 'member', room: Math.max(0, Math.floor(num(r[2]))), phase: 'room' as const, slot: -1 };
  });
  const furnaces = arr(roster[2])
    .slice(0, 16)
    .map((row) => {
      const r = arr(row);
      return { spot: Math.floor(num(r[0])), flame: Math.floor(num(r[1])), phase: 'cold' as const, progress: 0 };
    })
    .filter((f) => f.spot >= 0 && f.spot < furnaceSpots);
  const view: ForgeView = { ...ForgeStory.empty(), squad, holdouts, ledger: new Array<boolean>(ledgerCount).fill(false), furnaces };
  if (Array.isArray(state)) {
    const phases = arr(state[0]);
    view.holdouts.forEach((h, i) => (h.phase = HOLDOUT_PHASES[num(phases[i])] ?? 'room'));
    const bits = num(state[1]);
    for (let i = 0; i < ledgerCount; i++) view.ledger[i] = (bits & (1 << i)) !== 0;
    const ru = arr(state[2]);
    view.rumble = { phase: RUMBLE_PHASES[num(ru[0])] ?? 'idle', wave: Math.max(0, num(ru[1])) };
    const fi = arr(state[3]);
    const carrier = Math.floor(Number(fi[1]));
    view.finale = { phase: FINALE_PHASES[num(fi[0])] ?? 'idle', carrier: carrier >= 0 && carrier < holdouts.length ? carrier : -1 };
    const slots = arr(state[4]);
    view.holdouts.forEach((h, i) => (h.slot = slots[i] === undefined ? -1 : Math.floor(Number(slots[i]))));
    const fu = arr(state[5]);
    view.furnaces.forEach((f, i) => {
      const r = arr(fu[i]);
      f.phase = FURNACE_PHASES[num(r[0])] ?? 'cold';
      f.progress = Math.max(0, Math.min(1, num(r[1]) / 100));
    });
    const se = arr(state[6]);
    view.sentry = { yaw: num(se[0]) / 100, shots: num(se[1]), tx: num(se[2]), tz: num(se[3]) };
    view.assault = ASSAULT_PHASES[num(state[7])] ?? 'idle';
  }
  return view;
}
