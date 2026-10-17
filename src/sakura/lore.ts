/**
 * The Sakura District's one paper left lying about: the festival scroll on the theatre stage, whose poem gives the
 * order the great lanterns are lit in (written new each run, `quest.ts`). The rest of the district's story is told
 * aloud now - Aoi Kisaragi on the shrine relay, Hana and Yuzu - and kept in the field file (`campaign.ts`).
 */

/** A note: where it lies and what it says. `area` is a floors area name (`world/floors.ts`), or 'street'. */
export interface SakuraNote {
  id: string;
  zone: 'station' | 'school' | 'shotengai' | 'canal' | 'shrine' | 'theatre' | 'freight' | 'metro' | 'lab';
  area: string;
  x: number;
  z: number;
  title: string;
  source: string;
  /** Before the fall. */
  was: string;
  /** When it fell. */
  during: string;
  /** Seven springs on. */
  now: string;
  /** The Easter egg's hint, if this note carries one (shown under the sakura stamp). */
  clue?: string;
}

export const NOTES: readonly SakuraNote[] = [
  {
    id: 'th-stage',
    zone: 'theatre',
    area: 'street',
    x: 20,
    z: -57,
    title: 'The festival scroll',
    source: 'Nailed to the theatre stage\'s backdrop',
    was: 'The shrine\'s scroll for the Thousand Lanterns: a poem that tells the order the great lanterns are lit, written new each year.',
    during: 'The Court took it from the shrine to hang over their goddess\'s stage. They do not know what it is for.',
    now: 'The poem is read in the order of its lines.',
    clue: 'The poem: the lantern order.',
  },
];
