/**
 * ZARYA: Ded Moroz's sack moves (no THREE). The sack is the map's paid mystery box (`world/layout/zarya.ts` puts it
 * under the little fir on the square); after `MYSTERY_BOX.moves.zarya.every` openings it is gone and turns up at
 * another of these places, in a zone the squad can reach (`ZaryaStory.zoneOpen`). The rules of moving a box are
 * `logic/boxMove.ts`; solo `game/entities.ts` moves it, in co-op the host (`sim/serverHost.ts`) and the clients follow.
 * Each place's spot lives in its zone's file as `sack`.
 */
import { MYSTERY_BOX } from '../config';
import { type BoxPlace, nextPlace } from '../logic/boxMove';
import { BANYA, DEPOT, DVOR, RYNOK, ZARYA } from './places';
import { ZaryaStory, type StoryView } from './story';
import type { ZaryaZone } from './types';

export type SackZone = 'square' | 'rynok' | 'dvor' | 'depot' | 'banya';

export interface SackPlace extends BoxPlace {
  zone: SackZone & ZaryaZone;
}

/** The sack's places. The first is where the map put it, under the square's little fir (its box stands where the level left it). */
export const SACK_PLACES: readonly SackPlace[] = [
  { zone: 'square', x: ZARYA.sack.x, z: ZARYA.sack.z, yaw: 0.5 },
  { zone: 'rynok', x: RYNOK.sack.x, z: RYNOK.sack.z, yaw: 0 },
  { zone: 'dvor', x: DVOR.sack.x, z: DVOR.sack.z, yaw: 0 },
  { zone: 'depot', x: DEPOT.sack.x, z: DEPOT.sack.z, yaw: 0 },
  { zone: 'banya', x: BANYA.sack.x, z: BANYA.sack.z, yaw: 0 },
];

/** Openings before the sack moves. */
export const SACK_EVERY = MYSTERY_BOX.moves.zarya?.every ?? 4;

/** May the sack turn up at place `i` now (its zone is one the squad can reach)? */
export function sackPlaceOpen(v: StoryView, i: number): boolean {
  const p = SACK_PLACES[i];
  return !!p && ZaryaStory.zoneOpen(v, p.zone);
}

/** Where the sack at place `current` goes next (`roll` 0..1), or null: nowhere else is open yet. */
export function nextSackPlace(v: StoryView, current: number, roll: number): number | null {
  return nextPlace(SACK_PLACES.length, current, (i) => sackPlaceOpen(v, i), roll);
}
