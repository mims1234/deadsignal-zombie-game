/**
 * The Sakura District's story missions. KAIKA, the whole story (`campaign.ts`), is open from the start; the other three
 * are opened by the Thousand Lanterns (`quest.ts`). Each is the district's operation with its own night: where you come
 * in, which contract is already settled, who else is out there, and what the radio says. The same in solo and co-op
 * (players take the Hanabi girls' places; a co-op run's kind is the mission's id, so the room and the simulation carry
 * it as they do every kind).
 *
 *   KAIKA                the whole story: every corner of Sakuragi, the five charms, the Empress, the Thousand
 *                        Lanterns, and the way home (the helicopter waits for the bloom)
 *   The Crimson Curtain  the relay is up; storm the Kurenai Theatre through the Court and bring the Empress down
 *   Last Train           the last train did come, and stopped under the station: up from the metro to the shrine relay
 *   Hanami               the blood-moon festival night: hold the shrine against the bloomed, then get out
 */
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { Level } from '../world/level';

export const STORY_IDS = ['kaika', 'curtain', 'lasttrain', 'hanami'] as const;
export type StoryId = (typeof STORY_IDS)[number];

export interface StoryDef {
  title: string;
  /** One line under the title (the title screen, the lobby). */
  note: string;
  kicker: string;
  /** The opening radio call. */
  brief: string;
  /** The banner when it starts. */
  banner: string;
  /** Where you come in (floor 0: the street, or an underground space by where it is); none: the operation's own. */
  start?: { x: number; z: number; yaw: number };
  /** The contract already settled when it starts (none: both are to do). */
  settled?: 'defense' | 'hunt';
  /** Open from the start (the rest wait for the Thousand Lanterns). */
  open?: boolean;
  /** The campaign (`campaign.ts`): its chapters lead the run, and the helicopter waits for the bloom. */
  campaign?: boolean;
  /** The blood moon over it from the start. */
  bloodMoon?: boolean;
}

export const STORIES: Record<StoryId, StoryDef> = {
  kaika: {
    title: 'KAIKA: THE BLOOMING',
    note: 'The whole story: every corner of Sakuragi, the five charms, the Empress, the Thousand Lanterns - and home.',
    kicker: 'STORY  //  KAIKA',
    brief: 'Last night the shrine relay started transmitting on its own. The voice on it is Aoi Kisaragi, the shrine keeper - missing seven years. She says she can end this. We listen, and we go where she sends us.',
    banner: 'A dead woman is calling from the shrine relay. Listen to her.',
    open: true,
    campaign: true,
  },
  curtain: {
    title: 'THE CRIMSON CURTAIN',
    note: 'Storm the Kurenai Theatre through the Court and bring the Empress down.',
    kicker: 'STORY  //  THE CRIMSON CURTAIN',
    brief: "The relay's up - the bird can find us. Now the Court. They have the Empress on her stage tonight, the whole Court round her. We go in through the gate, through all of them, and we bring the curtain down.",
    banner: 'The Court has the Empress on stage tonight. Bring the curtain down.',
    start: { x: -4, z: -20, yaw: 0 },
    settled: 'defense',
  },
  lasttrain: {
    title: 'LAST TRAIN',
    note: 'Up from the metro where the last train stopped, to the shrine relay, and out.',
    kicker: 'STORY  //  LAST TRAIN',
    brief: 'The 21:47 came after all. Seven years late, and it stopped under the station with us on it. The commuters are still down here, waiting. Walk past them quietly. Up the stairs, across town to the shrine relay, then the hilltop.',
    banner: 'The last train stopped under the station. Get up to the street - quietly.',
    start: { x: -100, z: 156, yaw: 0 },
    settled: 'hunt',
  },
  hanami: {
    title: 'HANAMI',
    note: 'The blood-moon festival night: hold the shrine against the bloomed.',
    kicker: 'STORY  //  HANAMI',
    brief: "Hanami night. The moon's red and every tree in the city is in flower, and the bloomed are coming up out of the canal park in hundreds. Hold the shrine while the relay calls the bird. Then we go home.",
    banner: 'The festival night under a blood moon. Hold the shrine.',
    start: { x: 30, z: 52, yaw: -Math.PI / 2 },
    settled: 'hunt',
    bloodMoon: true,
  },
};

/** The story missions this player can pick: KAIKA always, the rest once the Thousand Lanterns is done. */
export function storiesOpen(egg: boolean): StoryId[] {
  return STORY_IDS.filter((id) => egg || STORIES[id].open);
}

export function isStory(kind: string | null | undefined): kind is StoryId {
  return !!kind && (STORY_IDS as readonly string[]).includes(kind);
}

/** The district's own insertion point (kept the first time a story moves it). */
const homeStart = new WeakMap<Level, { x: number; z: number; yaw: number }>();

/** Where this run comes in: the story's start, or the operation's own. */
export function applyStoryStart(level: Level, story: StoryId | null): void {
  const s = level.data.playerStart;
  if (!homeStart.has(level)) homeStart.set(level, { x: s.x, z: s.z, yaw: s.yaw });
  const at = (story && STORIES[story].start) || homeStart.get(level)!;
  s.x = at.x;
  s.z = at.z;
  s.yaw = at.yaw;
}

/** The contract a story settles before it starts. */
export function settleStoryContracts(story: StoryId, defense: { status: string; progress: number; rewardClaimed: boolean }, hunt: { status: string; identified: boolean; rewardClaimed: boolean }): void {
  const settled = STORIES[story].settled;
  if (!settled) return;
  if (settled === 'defense') {
    defense.status = 'complete';
    defense.progress = 1;
    defense.rewardClaimed = true;
  } else {
    hunt.status = 'complete';
    hunt.identified = true;
    hunt.rewardClaimed = true;
  }
}

/** Who else is out there on a story's night (after the district's own residents). */
export function populateStory(story: StoryId, zm: ZombieManager, level: Level, rng: Rng): void {
  // a settled hunt: the Empress is somewhere else tonight
  if (STORIES[story].settled === 'hunt' && zm.boss) {
    zm.remove(zm.boss);
    zm.boss = null;
  }
  const ring = (n: number, x: number, z: number, r: number, f: (x: number, z: number) => void): void => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.f();
      f(x + Math.cos(a) * r * (0.5 + rng.f() * 0.5), z + Math.sin(a) * r * (0.5 + rng.f() * 0.5));
    }
  };
  const free = (x: number, z: number): boolean => !level.nav.isBlockedAt(x, z);
  if (story === 'curtain') {
    // the whole Court round their goddess
    ring(10, 20, -44, 12, (x, z) => free(x, z) && void zm.spawn('shambler', x, z, rng, { ambient: true, variant: 'court' }));
    ring(4, 20, -32, 6, (x, z) => free(x, z) && void zm.spawn('armored', x, z, rng, { ambient: true, variant: 'oni' }));
  } else if (story === 'lasttrain') {
    // the commuters on the platform and the concourse, the jorogumo in the tunnel
    for (const [x, z] of [[-110, 164], [-96, 165], [-84, 164], [-72, 165], [-60, 164], [-90, 155], [-70, 157], [-56, 156]] as const) zm.spawn('shambler', x, z, rng, { ambient: true, variant: 'commuter' });
    for (const [x, z] of [[-20, 172], [20, 172], [50, 170]] as const) zm.spawn('runner', x, z, rng, { ambient: true, variant: 'jorogumo' });
  } else if (story === 'hanami') {
    // the bloomed coming up out of the park, a miko at the gate, rooted in the grass
    ring(12, 30, 50, 14, (x, z) => free(x, z) && void zm.spawn('shambler', x, z, rng, { ambient: true, variant: 'bloomed' }));
    ring(2, 82, 50, 3, (x, z) => free(x, z) && void zm.spawn('shambler', x, z, rng, { ambient: true, variant: 'miko' }));
    ring(6, 60, 55, 10, (x, z) => free(x, z) && void zm.spawn('runner', x, z, rng, { ambient: true, variant: 'rooted' }));
  }
}
