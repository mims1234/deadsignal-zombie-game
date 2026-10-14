/**
 * Objectives that ride on co-op waves (pure). One per wave, shared by the squad, paid to every player when done.
 *   hold      keep at least one player inside a marked circle until the timer fills
 *   collect   pick up every data core
 *   elite     kill the marked Hunter
 *   flawless  clear the wave without anyone going down
 * `hold` and `collect` keep the wave going until they are finished; the other two are judged when the wave ends.
 */
import { COOP } from '../config';

export type MissionKind = 'hold' | 'collect' | 'elite' | 'flawless';
export type MissionStatus = 'active' | 'done' | 'failed';
export const MISSION_KINDS: readonly MissionKind[] = ['hold', 'collect', 'elite', 'flawless'];
export const MISSION_STATUSES: readonly MissionStatus[] = ['active', 'done', 'failed'];

export interface WaveMission {
  kind: MissionKind;
  status: MissionStatus;
  /** 0..1 */
  progress: number;
  /** Hold: centre and radius of the circle. */
  x: number;
  z: number;
  radius: number;
  /** Collect: the cores. */
  items: { x: number; z: number; taken: boolean }[];
  /** Elite: the host's id for the Hunter (0 until it has spawned). */
  eliteId: number;
  /** Cash paid to each player on completion. */
  reward: number;
}

export const MISSION_TEXT: Record<MissionKind, { title: string; brief: string }> = {
  hold: { title: 'HOLD THE POINT', brief: 'Keep someone inside the marked circle' },
  collect: { title: 'RECOVER THE DATA CORES', brief: 'Pick up every core' },
  elite: { title: 'KILL THE HUNTER', brief: 'A marked elite is with this wave' },
  flawless: { title: 'NOBODY GOES DOWN', brief: 'Clear the wave with the whole squad standing' },
};

/** Which objective wave `n` carries, from a roll in [0, 1). None on wave 1 or on a boss wave (the Warden is enough). */
export function pickMission(n: number, roll: number): MissionKind | null {
  if (n <= 1 || n % COOP.bossEvery === 0) return null;
  return MISSION_KINDS[Math.min(MISSION_KINDS.length - 1, Math.floor(roll * MISSION_KINDS.length))]!;
}

/** `sites` are free spots near the squad: the first is the hold point, the first few are the cores. */
export function createMission(kind: MissionKind, n: number, sites: readonly { x: number; z: number }[]): WaveMission {
  const at = sites[0] ?? { x: 0, z: 0 };
  return {
    kind,
    status: 'active',
    progress: 0,
    x: at.x,
    z: at.z,
    radius: COOP.mission.holdRadius,
    items: kind === 'collect' ? sites.slice(0, COOP.mission.cores).map((s) => ({ x: s.x, z: s.z, taken: false })) : [],
    eliteId: 0,
    reward: COOP.mission.rewardBase + COOP.mission.rewardPerWave * n,
  };
}

/** The wave may not end yet. */
export function blocksWaveEnd(m: WaveMission | null): boolean {
  return !!m && m.status === 'active' && (m.kind === 'hold' || m.kind === 'collect');
}

/** Hold: time only counts while someone is inside. True on the step it completes. */
export function stepHold(m: WaveMission, dt: number, playersInside: number): boolean {
  if (m.kind !== 'hold' || m.status !== 'active' || playersInside <= 0) return false;
  m.progress = Math.min(1, m.progress + dt / COOP.mission.holdSeconds);
  if (m.progress < 1) return false;
  m.status = 'done';
  return true;
}

/** Collect: a player reached core `i`. True when that was the last one. */
export function takeCore(m: WaveMission, i: number): boolean {
  const item = m.items[i];
  if (m.kind !== 'collect' || m.status !== 'active' || !item || item.taken) return false;
  item.taken = true;
  const got = m.items.filter((q) => q.taken).length;
  m.progress = got / m.items.length;
  if (got < m.items.length) return false;
  m.status = 'done';
  return true;
}

/** Elite: the Hunter died. True when that completed the objective. */
export function eliteKilled(m: WaveMission): boolean {
  if (m.kind !== 'elite' || m.status !== 'active') return false;
  m.progress = 1;
  m.status = 'done';
  return true;
}

/** Flawless: somebody went down. */
export function playerWentDown(m: WaveMission | null): void {
  if (m && m.kind === 'flawless' && m.status === 'active') m.status = 'failed';
}

/** The wave ended: settle whatever is still open. Returns true when the objective was completed by surviving. */
export function closeMission(m: WaveMission): boolean {
  if (m.status !== 'active') return false;
  if (m.kind === 'flawless') {
    m.progress = 1;
    m.status = 'done';
    return true;
  }
  m.status = 'failed';
  return false;
}

/** One line for the HUD. */
export function missionDetail(m: WaveMission): string {
  if (m.status === 'done') return `Complete  +$${m.reward} each`;
  if (m.status === 'failed') return 'Failed';
  switch (m.kind) {
    case 'hold':
      return `${MISSION_TEXT.hold.brief} - ${Math.round(m.progress * 100)}%`;
    case 'collect':
      return `${m.items.filter((q) => q.taken).length} / ${m.items.length} cores recovered`;
    default:
      return MISSION_TEXT[m.kind].brief;
  }
}
