/**
 * The Sakura District's story: KAIKA, the whole story (`campaign.ts`), beside the district's own operation. The same in
 * solo and co-op (players take the Hanabi girls' places; a co-op run's kind is the story's id, so the room and the
 * simulation carry it as they do every kind).
 *
 *   KAIKA   the whole story: every corner of Sakuragi, the five charms, the Thousand Lanterns, the Empress, and the
 *           way home (the helicopter waits for the bloom)
 */
export const STORY_IDS = ['kaika'] as const;
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
  /** The campaign (`campaign.ts`): its chapters lead the run, and the helicopter waits for the bloom. */
  campaign?: boolean;
}

export const STORIES: Record<StoryId, StoryDef> = {
  kaika: {
    title: 'KAIKA: THE BLOOMING',
    note: 'The whole story: every corner of Sakuragi, the five charms, the Thousand Lanterns, the Empress - and home.',
    kicker: 'STORY  //  KAIKA',
    brief: 'Last night the shrine relay started transmitting on its own. The voice on it is Aoi Kisaragi, the shrine keeper - missing seven years. She says she can end this. We listen, and we go where she sends us.',
    banner: 'A dead woman is calling from the shrine relay. Listen to her.',
    campaign: true,
  },
};

/** The story missions this player can pick (KAIKA, always). */
export function storiesOpen(): StoryId[] {
  return [...STORY_IDS];
}

export function isStory(kind: string | null | undefined): kind is StoryId {
  return !!kind && (STORY_IDS as readonly string[]).includes(kind);
}
