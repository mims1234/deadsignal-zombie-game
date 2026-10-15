/**
 * Who is where on a Forge run, drawn once per run with the run's RNG (the co-op simulation draws it and tells everyone):
 * two of the three co-leaders deploy with you; the third is holed up somewhere with Anya (always the radio room) and
 * four of the clan's members; tomoe is in the HQ vault. One of the four members is hiding a bite.
 */
import { FORGE_STORY, VULCAN, VULCAN_LEADERSHIP } from '../config';
import type { Rng } from '../logic/rng';
import type { SafeRoomDef } from './sites';

export type VulcanRank = 'leader' | 'coLead' | 'officer' | 'member';

/** One person holed up in a room. */
export interface HoldoutDef {
  name: string;
  rank: VulcanRank;
  /** Index into the map's rooms. */
  room: number;
}

export interface ForgeRoster {
  /** The co-leaders who deploy with you. */
  squad: string[];
  holdouts: HoldoutDef[];
  /** Index into `holdouts`: the member hiding a bite (never the leadership). */
  carrier: number;
}

export function rankOf(name: string): VulcanRank {
  if (name === VULCAN_LEADERSHIP.leader) return 'leader';
  if ((VULCAN_LEADERSHIP.coLeads as readonly string[]).includes(name)) return 'coLead';
  if ((VULCAN_LEADERSHIP.officers as readonly string[]).includes(name)) return 'officer';
  return 'member';
}

/** The line under a name: their rank in the clan. */
export function rankTag(rank: VulcanRank): string {
  // ranks decide who is where (the roster), but nobody's title is ever shown: everyone is simply Vulcan
  void rank;
  return 'VULCAN';
}

/** Who goes first when the reborn takes the Hearth: the members, then the officer, the co-leader, the leader last. */
export function rankOrder(rank: VulcanRank): number {
  return rank === 'member' ? 0 : rank === 'officer' ? 1 : rank === 'coLead' ? 2 : 3;
}

function shuffle<T>(list: T[], rng: Rng): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng.f() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

/** Draw a run's roster for `rooms` (the vault must be among them, and enough others for everyone). */
export function pickForgeRoster(rng: Rng, rooms: readonly SafeRoomDef[]): ForgeRoster {
  const co = shuffle([...VULCAN_LEADERSHIP.coLeads], rng);
  const squad = co.slice(0, 2);
  // the rest of them are holed up somewhere in the Forge
  const leftOver = co.slice(2);
  const members = shuffle([...VULCAN.infected], rng).slice(0, FORGE_STORY.members);
  const vault = rooms.findIndex((r) => r.vault);
  const radio = rooms.findIndex((r) => r.id === 'radio');
  const free = shuffle(
    rooms.map((_, i) => i).filter((i) => i !== vault && i !== radio),
    rng,
  );
  const holdouts: HoldoutDef[] = [];
  if (vault >= 0) holdouts.push({ name: VULCAN_LEADERSHIP.leader, rank: 'leader', room: vault });
  for (const officer of VULCAN_LEADERSHIP.officers) holdouts.push({ name: officer, rank: 'officer', room: radio >= 0 ? radio : free.shift() ?? 0 });
  for (const name of leftOver) holdouts.push({ name, rank: 'coLead', room: free.shift() ?? 0 });
  for (const m of members) {
    const room = free.shift();
    if (room === undefined) break;
    holdouts.push({ name: m, rank: 'member', room });
  }
  const memberIdx = holdouts.map((h, i) => (h.rank === 'member' ? i : -1)).filter((i) => i >= 0);
  const carrier = memberIdx.length > 0 ? memberIdx[Math.floor(rng.f() * memberIdx.length)]! : -1;
  return { squad, holdouts, carrier };
}
