/**
 * ZARYA: the things in the way that only one weapon to swing gets through (no THREE). Round 3, notes 5 and 6: ZARYA
 * hands out few weapons to swing, and each one that is not the knife has a job of its own in the town:
 *
 *   the splitting maul     breaks locks and padlocks: the escalator's, the fire board's (`story.ts`), the yard-keeper's shed
 *   the fire axe           chops through wood and ice: a boarded garage, the boarded gap from the market into the
 *                          garages, the ice a burst pipe left over the boiler hall's side door
 *   the Cossack shashka    cuts frozen rope: a fisherman's lashed tent, a stall lashed under its tarpaulin
 *   the Rogatina           a wound-up thrust stops whatever charges onto its crossguard (`logic/melee.ts`: `pin`)
 *
 * Each obstacle is shared state (one bit of `StoryView.m` from `OBIT`): opened once, open for the squad for good. A
 * player asks with the weapon carried (the story trusts the client's word, as it does for a heavy blow). Behind each is
 * a short cut or a cache; a cache is personal (each player takes their own share once: `runtime.ts`).
 *
 * The frame builds what stands still (`world/layout/zaryaObstacles.ts`: the colliders, a gap in a zone's wall); the
 * story's look draws what is broken (`obstacleLook.ts`); `doors.ts` shuts and opens the colliders.
 */
import { PLAYER } from '../config';
import type { CrateReward, Inventory } from '../logic/economy';
import type { MeleeId } from '../logic/melee';
import type { Spot, ZaryaZone } from './types';

export type ObstacleKind = 'padlock' | 'boards' | 'barricade' | 'ice' | 'lashing';

/** The one weapon that gets through each kind. */
export const OBSTACLE_TOOL: Record<ObstacleKind, MeleeId> = { padlock: 'maul', boards: 'fireAxe', barricade: 'fireAxe', ice: 'fireAxe', lashing: 'shashka' };

/** What the prompt says, by kind: the act, and (without the weapon) what it is and what would get through it. */
export const OBSTACLE_WORDS: Record<ObstacleKind, { verb: string; shut: string; wants: string; done: string }> = {
  padlock: { verb: 'BREAK THE PADLOCK', shut: 'PADLOCKED', wants: 'The splitting maul breaks a padlock (the woodpile in the Dvor)', done: 'THE PADLOCK BREAKS' },
  boards: { verb: 'CHOP THROUGH THE BOARDS', shut: 'BOARDED UP', wants: 'The fire axe chops through boards (the fire board, depot street)', done: 'THE BOARDS GIVE' },
  barricade: { verb: 'CHOP THROUGH THE BARRICADE', shut: 'BARRICADED', wants: 'The fire axe chops through it (the fire board, depot street)', done: 'THE BARRICADE GIVES' },
  ice: { verb: 'CHOP THROUGH THE ICE', shut: 'FROZEN OVER', wants: 'The fire axe chops through ice (the fire board, depot street)', done: 'THE ICE GIVES' },
  lashing: { verb: 'CUT THE LASHINGS', shut: 'LASHED SHUT', wants: "Frozen rope: the shashka's edge cuts it (the museum guard's cabinet)", done: 'THE ROPES PART' },
};

export interface ObstacleDef {
  id: string;
  kind: ObstacleKind;
  /** The zone it is in, and every zone that must be open before it can be opened (a short cut between two zones wants both). */
  zone: ZaryaZone;
  zones: readonly ZaryaZone[];
  /** What it is, in the prompt. */
  name: string;
  /** Its middle, where it is used from (within `STORY.reach`). */
  at: Spot;
  /** The way its outside faces (a yaw: x = sin, z = cos), and how wide and high the thing shut is. */
  yaw: number;
  w: number;
  h: number;
  /** The collider it shuts (null: nobody walks through it, what is behind is reached from in front). */
  block: { x: number; z: number; hx: number; hz: number } | null;
  /** A gap the frame leaves in the wall between two zones for it (`along` as `GATES`, at `fixed` on the other axis). */
  wall?: { along: 'x' | 'z'; fixed: number; at: number; half: number };
  /** What is behind it, said when it is opened: a cache (taken at `at`, personal) or a way. */
  cache?: { at: Spot; name: string; cash: number };
  way?: string;
}

/** The first bit of `StoryView.m` the obstacles use (plugs 0-2, valves 3-5, the repairman's tools 6-8). */
export const OBIT = 12;

export const OBSTACLES: readonly ObstacleDef[] = [
  // the Dvor's east yard: the yard-keeper's shed by the east wall, its door in the south face
  {
    id: 'shed', kind: 'padlock', zone: 'dvor', zones: ['dvor'], name: "THE YARD-KEEPER'S SHED",
    at: { x: 96.3, z: 107.8 }, yaw: 0, w: 1, h: 1.95,
    block: { x: 96.3, z: 107.8, hx: 0.55, hz: 0.12 },
    cache: { at: { x: 97.3, z: 105.2 }, name: "HIS CASH TIN AND CARTRIDGES", cash: 300 },
  },
  // the garages: a garage boarded up from outside, on the middle lane in from the Dvor's gate (`GARAGES.bays.boarded`)
  {
    id: 'garage', kind: 'boards', zone: 'garages', zones: ['garages'], name: 'A BOARDED-UP GARAGE',
    at: { x: 123.95, z: 128 }, yaw: Math.PI, w: 3.5, h: 2.3,
    block: { x: 123.95, z: 128, hx: 1.85, hz: 0.15 },
    cache: { at: { x: 125.0, z: 133.0 }, name: 'HIS STRONGBOX', cash: 400 },
  },
  // the wall between the market's yard and the garages: the garage men's old way through, boarded over
  {
    id: 'gap', kind: 'barricade', zone: 'garages', zones: ['rynok', 'garages'], name: 'THE OLD WAY THROUGH',
    at: { x: 152, z: 72 }, yaw: 0, w: 3.2, h: 2.6,
    block: { x: 152, z: 72, hx: 1.6, hz: 0.3 },
    wall: { along: 'x', fixed: 72, at: 152, half: 1.6 },
    way: 'Straight through from the market to the garages',
  },
  // the heating plant: ice over the boiler hall's side door, where a pipe burst above it
  {
    id: 'sideDoor', kind: 'ice', zone: 'tets', zones: ['tets'], name: "THE BOILER HALL'S SIDE DOOR",
    at: { x: -8.5, z: -157 }, yaw: Math.PI / 2, w: 3, h: 3.2,
    block: { x: -8.5, z: -157, hx: 0.3, hz: 1.5 },
    way: 'A second way into the boiler hall',
  },
  // the pond: a fisherman's tent lashed shut (`BANYA.holes`, the one marked `lashed`), its flap toward his hole
  {
    id: 'tent', kind: 'lashing', zone: 'banya', zones: ['banya'], name: "A FISHERMAN'S TENT",
    at: { x: 64, z: -170.2 }, yaw: 0, w: 0.7, h: 1.2,
    block: null,
    cache: { at: { x: 64, z: -170.2 }, name: 'HIS BOX AND HIS FLASK', cash: 250 },
  },
  // the market's yard: the felt-boot stall under the hall's south wall, lashed down under a tarpaulin (`RYNOK_YARD`)
  {
    id: 'stall', kind: 'lashing', zone: 'rynok', zones: ['rynok'], name: 'A STALL UNDER ITS TARPAULIN',
    at: { x: 223.2, z: 22.3 }, yaw: 0, w: 4, h: 1,
    block: null,
    cache: { at: { x: 223.2, z: 22.3 }, name: "THE DAY'S TAKINGS", cash: 450 },
  },
];

/** Obstacle `i` is open. */
export function obstacleOpen(v: { m: number }, i: number): boolean {
  return i >= 0 && i < OBSTACLES.length && (v.m & (1 << (OBIT + i))) !== 0;
}

/** The weapon obstacle `i` wants. */
export function toolFor(i: number): MeleeId | null {
  const o = OBSTACLES[i];
  return o ? OBSTACLE_TOOL[o.kind] : null;
}

/** What a cache holds for the one who takes it: its points, two magazines for every gun carried, a plate, a grenade. */
export function cacheReward(inv: Inventory, cash: number): CrateReward {
  return {
    cash,
    ammo: inv.slots.map((s) => (s ? s.ammo.magSize * 2 : 0)),
    plates: inv.plates < PLAYER.maxPlates ? 1 : 0,
    grenades: 1,
  };
}
