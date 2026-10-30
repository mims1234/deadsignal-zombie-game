/**
 * The changes: what can be wrong with the station in a loop (no THREE). Each one happens at one of the `SPOTS`; a
 * report at that spot puts it right. `tier` says from which loop it can come (`tierFor`): the plain ones first, the
 * sounds from loop 3, the people from loop 4, the ones about you from loop 6. The screen draws them (`look.ts`).
 */
import type { SpotId } from './places';

export interface Anomaly {
  id: string;
  spot: SpotId;
  tier: 1 | 2 | 3 | 4 | 5;
  /** What it was, said once it has been put right (the feed, the journal). */
  was: string;
}

export const ANOMALIES: readonly Anomaly[] = [
  // ---- tier 1: plain to see ----
  { id: 'clock_back', spot: 'clock', tier: 1, was: 'The station clock was running backwards.' },
  { id: 'vend_lit', spot: 'vending', tier: 1, was: 'The dead vending machine was lit.' },
  { id: 'poster_face', spot: 'poster', tier: 1, was: 'The face on the poster was looking at you.' },
  { id: 'timetable_extra', spot: 'timetable', tier: 1, was: 'The timetable had one more train on it: 04:44, not in service.' },
  { id: 'tunnel_light', spot: 'tunnel', tier: 1, was: 'There was a light burning inside the tunnel.' },
  { id: 'sign_red', spot: 'sign', tier: 1, was: "The station sign's letters were red." },
  // ---- tier 2: look closer ----
  { id: 'bench_extra', spot: 'bench', tier: 2, was: 'There was one more passenger on the waiting-room bench.' },
  { id: 'sign_order', spot: 'sign', tier: 2, was: "The station sign's letters were the wrong way round." },
  { id: 'umbrella_red', spot: 'umbrellas', tier: 2, was: 'One of the umbrellas in the stand was red.' },
  { id: 'shutter_down', spot: 'shutter', tier: 2, was: "The clock shop's shutter was down, and something stood under it." },
  { id: 'rope_black', spot: 'rope', tier: 2, was: "The shrine's rope was black." },
  { id: 'footprints_wall', spot: 'footprints', tier: 2, was: 'Wet footprints led across platform 2 and into the edge.' },
  { id: 'mapboard_tunnel', spot: 'mapboard', tier: 2, was: "The map's YOU ARE HERE was inside the tunnel." },
  { id: 'gates_red', spot: 'gates', tier: 2, was: 'Every ticket gate was showing red.' },
  { id: 'bridge_figure', spot: 'bridge', tier: 2, was: 'Someone was standing on the footbridge, looking down.' },
  // ---- tier 3: sound ----
  { id: 'crossing_ring', spot: 'crossing', tier: 3, was: 'The level crossing was ringing with no train coming.' },
  { id: 'vend_melody', spot: 'vending', tier: 3, was: 'The vending machine was playing a melody.' },
  { id: 'pa_wrong', spot: 'speaker', tier: 3, was: 'The announcement was calling a different station.' },
  { id: 'lostprop_ring', spot: 'lostprop', tier: 3, was: 'A phone was ringing inside lost property.' },
  { id: 'music_back', spot: 'speaker', tier: 3, was: 'The music on the platform was playing backwards.' },
  // ---- tier 4: the people ----
  { id: 'rows_turn', spot: 'rows', tier: 4, was: 'The passengers on platform 1 were facing the wall.' },
  { id: 'rows_extra', spot: 'rows', tier: 4, was: 'There was one more passenger waiting on platform 1.' },
  { id: 'bench_watch', spot: 'bench', tier: 4, was: 'The passengers on the bench were watching you.' },
  { id: 'body_up', spot: 'body', tier: 4, was: 'The body on platform 2 was standing up.' },
  // ---- tier 5: you ----
  { id: 'window_you', spot: 'window', tier: 5, was: 'Someone in the waiting-room window was wearing your clothes.' },
  { id: 'body_you', spot: 'body', tier: 5, was: 'The body on platform 2 was wearing your clothes.' },
  { id: 'mapboard_name', spot: 'mapboard', tier: 5, was: "The map showed the station's name." },
  { id: 'clock_stop', spot: 'clock', tier: 5, was: 'The station clock had stopped at 04:57.' },
];

export const ANOMALY_INDEX: Record<string, number> = Object.fromEntries(ANOMALIES.map((a, i) => [a.id, i]));

/** The highest tier a loop can bring. */
export function tierFor(loop: number): number {
  return loop >= 6 ? 5 : Math.min(4, Math.max(1, loop));
}
