/**
 * The Forge's story on the wire (co-op). The simulation puts two fields in its story snapshots:
 *   fr  the run's roster: [squad names, [name, rank, room] per holdout] (every couple of seconds, and in the first)
 *   fg  the story's state: [holdout phases, ledger bits, rumble [phase, wave], finale [phase, carrier]]
 * The carrier stays -1 until the turn, so nobody can see it coming.
 */
import type { VulcanRank } from './roster';
import { FINALE_PHASES, type ForgeView, HOLDOUT_PHASES, RUMBLE_PHASES } from './story';

const RANKS: readonly VulcanRank[] = ['leader', 'coLead', 'officer', 'member'];

export type RosterWire = [string[], [string, number, number][]];
export type StateWire = [number[], number, [number, number], [number, number]];

export function encodeRoster(v: ForgeView): RosterWire {
  return [[...v.squad], v.holdouts.map((h) => [h.name, RANKS.indexOf(h.rank), h.room])];
}

export function encodeState(v: ForgeView): StateWire {
  const ledger = v.ledger.reduce((m, f, i) => (f ? m | (1 << i) : m), 0);
  return [v.holdouts.map((h) => HOLDOUT_PHASES.indexOf(h.phase)), ledger, [RUMBLE_PHASES.indexOf(v.rumble.phase), v.rumble.wave], [FINALE_PHASES.indexOf(v.finale.phase), v.finale.carrier]];
}

/** A view from the wire: the roster (once known) with the latest state on it. Null until the roster has arrived. */
export function decodeView(roster: unknown, state: unknown, ledgerCount: number): ForgeView | null {
  if (!Array.isArray(roster) || !Array.isArray(roster[0]) || !Array.isArray(roster[1])) return null;
  const squad = (roster[0] as unknown[]).map((n) => String(n)).slice(0, 4);
  const holdouts = (roster[1] as unknown[]).slice(0, 16).map((row) => {
    const r = Array.isArray(row) ? row : [];
    return { name: String(r[0] ?? ''), rank: RANKS[Number(r[1])] ?? 'member', room: Math.max(0, Math.floor(Number(r[2]) || 0)), phase: 'room' as const };
  });
  const view: ForgeView = { squad, holdouts, ledger: new Array<boolean>(ledgerCount).fill(false), rumble: { phase: 'idle', wave: 0 }, finale: { phase: 'idle', carrier: -1 } };
  if (Array.isArray(state)) {
    const phases = Array.isArray(state[0]) ? (state[0] as unknown[]) : [];
    view.holdouts.forEach((h, i) => (h.phase = HOLDOUT_PHASES[Number(phases[i])] ?? 'room'));
    const bits = Number(state[1]) || 0;
    for (let i = 0; i < ledgerCount; i++) view.ledger[i] = (bits & (1 << i)) !== 0;
    const ru = Array.isArray(state[2]) ? (state[2] as unknown[]) : [];
    view.rumble = { phase: RUMBLE_PHASES[Number(ru[0])] ?? 'idle', wave: Math.max(0, Number(ru[1]) || 0) };
    const fi = Array.isArray(state[3]) ? (state[3] as unknown[]) : [];
    const carrier = Math.floor(Number(fi[1]));
    view.finale = { phase: FINALE_PHASES[Number(fi[0])] ?? 'idle', carrier: carrier >= 0 && carrier < holdouts.length ? carrier : -1 };
  }
  return view;
}
