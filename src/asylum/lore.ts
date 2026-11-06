/**
 * Blackwood Hill's story, told through its own paper: five files (one per step of the trail, `story.ts`), each with
 * Dr. Okafor's word on it, voiced (`lines.ts`). Pure data: the co-op simulation and every client can quote it.
 *
 * The story: in 1958 Blackwood's superintendent turned Ward Nine into the Lantern Ward, for "sundown cases" who were
 * quiet by day and violent after dark - the same sickness the exclusion zone is full of now. They were kept under
 * light that was never put out, and its Head Nurse walked their round every night. Blackwood was run by its nursing
 * sisters, and the last Head Nurse was Agatha Mourne. Three years ago it took its last patient, a sixteen-year-old girl
 * who heard them (Ellie Crane, Patient 117), and Mourne promised to look in on her every night for as long as she
 * lived. Forty days ago the generators failed and the lamps went dark for the first time in sixty years. Ward Nine's
 * door sealed itself. The Matron took her lantern and went into isolation alone to settle them. She never came out; she
 * walks at lights-out now, her round unbroken, seeing everyone to bed. The last orderly lit the crematorium for the
 * dead and could not shut it again: the damper is on the Matron's key ring, and the stack has smoked black ever since.
 */

export interface RecordNote {
  /** The file's heading, as typed on it. */
  title: string;
  /** Where and when it was written. */
  source: string;
  /** What it says (a few short paragraphs separated by blank lines). */
  body: string;
  /** What is said over it (a voiced line in `lines.ts`), in order. */
  lines: readonly string[];
}

/** One per record spot, in `RECORDS.spots` order (admin, ward, nurses, nine, morgue). */
export const RECORD_NOTES: readonly RecordNote[] = [
  {
    title: 'THE LANTERN PROGRAM',
    source: "Superintendent's memorandum  //  Blackwood Hill  //  March 1958",
    body:
      'By order of the Board, Ward Nine becomes the Lantern Ward. Our sundown cases - docile by day, violent after dark - are to be kept under light, without interruption, for the length of their treatment.\n\n' +
      'The lamps are not to be put out for any reason. The Head Nurse will keep the night round herself.\n\n' +
      'Our youngest admission, Patient 117, is to be kept apart from them in the west ward.',
    lines: ['okafor_file_admin'],
  },
  {
    title: 'PATIENT 117 - CRANE, ELLIE',
    source: 'Admission card  //  West ward  //  three years ago',
    body:
      'Age sixteen. Night terrors. Insists the patients in Ward Nine "talk to the dark, and the dark talks back." Blackwood\'s last admission.\n\n' +
      "Transferred upstairs to the night nurses' floor at the Head Nurse's request.\n\n" +
      'Margin, red ink, in her hand: She hears them. Keep her lamp lit. I will look in on her every night, as long as I live. - A.M.',
    lines: ['okafor_file_ward'],
  },
  {
    title: "THE HEAD NURSE'S DAY BOOK",
    source: "Night nurses' floor  //  the Matron's desk  //  forty-one days ago",
    body:
      'Generators failing again in the cold. If they stop, the isolation lamps go dark, and Ward Nine\'s door seals itself - the Board\'s precaution, not mine.\n\n' +
      'The orderlies say we should leave. Leave them in the dark? Not while I hold the keys.\n\n' +
      'If the lamps go out, I go in. They know me. They will settle for me.',
    lines: ['okafor_file_nurses'],
  },
  {
    title: 'WARD NINE - NIGHT REGISTER',
    source: 'The Lantern Ward  //  the night desk  //  sixty years of entries',
    body:
      'Every line in the same careful hand for the last twenty years: the date, the beds, "lamps lit, all settled. - A.M."\n\n' +
      'The last line is shakier than the rest.\n\n' +
      '"Lamps out at sundown. I am going in to settle them. Ellie - stay in bed."',
    lines: ['okafor_file_nine', 'vance_sun'],
  },
  {
    title: 'INCIDENT - ISOLATION BLOCK',
    source: 'Last log of Orderly T. Byrne  //  The morgue  //  forty days ago',
    body:
      'The generators would not start. At sundown the isolation lamps went out for the first time since 1958.\n\n' +
      'Matron took her lantern and went in alone. We heard her keys all night. She never came out.\n\n' +
      'I lit the furnace for the dead. It will not stop smoking, and the damper is chained - the key is on her ring. Do not let her finish her round. She means to see everyone to bed.',
    lines: ['byrne_tape', 'okafor_file_morgue'],
  },
];

/** Speaker names on the captions for the lines the game says without a recording. */
export const NIGHT_LINES = {
  okafor: 'OKAFOR',
  vance: 'VANCE',
  pilot: 'PILOT',
  recordsDoneTitle: 'THE PAPER TRAIL IS COMPLETE',
  nightTitle: 'NIGHTFALL',
  nightSub: 'More of them now - faster, and they see further in the dark',
  duskTitle: 'THE SUN IS GOING',
  duskSub: 'Lights-out soon - the infected are stirring',
  wakeTitle: 'LIGHTS OUT',
  wakeSub: 'The Matron begins her round in the isolation block',
  callTitle: 'HOLD UNTIL DAWN',
  callSub: 'The bird lands at first light - hold the lawn',
};
