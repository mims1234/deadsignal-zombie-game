/**
 * Blackwood Hill's story, told through the day / night operation: the three patient files (RECOVER THE RECORDS) and
 * the radio lines at each turn of the light. Pure data: the co-op simulation and every client can quote it.
 *
 * The story: in 1958 Blackwood's superintendent turned Ward Nine into the Lantern Ward, for "sundown cases" who were
 * quiet by day and violent after dark - the same sickness the exclusion zone is full of now. They were kept under
 * light that was never put out, and its Head Nurse walked their round every night. Blackwood was run by its nursing
 * sisters - every one of its staff a woman - and the last Head Nurse was Agatha Mourne. Three years ago it took its
 * last patient, a sixteen-year-old girl who heard them (Ellie Crane, Patient 117), and Mourne promised to look in on
 * her every night for as long as she lived. Forty days ago the power failed and the isolation lamps went dark for the
 * first time in sixty years. The Matron took her lantern and went in alone to calm them. She never came out; she only
 * walks at lights-out now, her round unbroken, seeing everyone to bed. The last orderly lit the crematorium for the
 * dead, and its stack has smoked black ever since.
 */

export interface RecordNote {
  /** The file's heading, as typed on it. */
  title: string;
  /** Where and when it was written. */
  source: string;
  /** What it says (a few short paragraphs separated by blank lines). */
  body: string;
  /** Dr. Okafor reading it over the radio. */
  comment: string;
}

/** One per record spot, in `RECORDS.spots` order (admin, ward, morgue). */
export const RECORD_NOTES: readonly RecordNote[] = [
  {
    title: 'THE LANTERN PROGRAM',
    source: "Superintendent's memorandum  //  Blackwood Hill  //  March 1958",
    body:
      'By order of the Board, Ward Nine becomes the Lantern Ward. Our sundown cases - docile by day, violent after dark - are to be kept under light, without interruption, for the length of their treatment.\n\n' +
      'The lamps are not to be put out for any reason. The Head Nurse will keep the night round herself.\n\n' +
      'Whatever is in them sleeps in the light. We do not yet know what it does in the dark.',
    comment: 'Sundown cases. Quiet by day, violent after dark - that is exactly what we are seeing out there. This place knew in 1958.',
  },
  {
    title: 'PATIENT 117 - CRANE, ELLIE',
    source: 'Admission card  //  West ward  //  three years ago',
    body:
      'Age sixteen. Night terrors. Insists the patients in Ward Nine "talk to the dark, and the dark talks back." Blackwood\'s last admission.\n\n' +
      "Moved to the west ward at the Head Nurse's request.\n\n" +
      'Margin, red ink, in her hand: She hears them. Keep her lamp lit. I will look in on her every night, as long as I live. - A.M.',
    comment: "Ellie Crane. Patient 117 could still be locked in somewhere on this hill - and Mourne kept her promise. Every night. Let's be the ones who let her out.",
  },
  {
    title: 'INCIDENT - ISOLATION BLOCK',
    source: 'Last log of Orderly T. Byrne  //  The morgue  //  forty days ago',
    body:
      'The generators would not start. At sundown the isolation lamps went out for the first time since 1958.\n\n' +
      'Matron took her lantern and went in alone - they know me, she said, they will settle for me. We heard her keys all night. She never came out.\n\n' +
      'She walks at lights-out now, the same round, every night, and by morning she is gone into the dark again. I lit the furnace for the dead. It will not stop smoking. Do not let her finish her round. She means to see everyone to bed.',
    comment: "She's not hunting. She's doing her rounds - checking on her patients, and anyone still awake after lights-out. When she walks tonight, we end it. Gently, if we can.",
  },
];

/** Radio and banner text for the turns of the light. Speakers are the Lantern team and the pilot. */
export const NIGHT_LINES = {
  okafor: 'DR. OKAFOR',
  vance: 'VANCE',
  pilot: 'PILOT',
  recordsAsk: "Okafor. Blackwood kept files on something called the Lantern Program - the admin offices, the west ward, the morgue. Find them while it's light. I want to know what we're walking into.",
  duskWarnTitle: 'THE LIGHT IS GOING',
  duskWarnSub: 'Nightfall soon - the infected wake at dark',
  duskWarn: "Sun's on the pines. Whatever we haven't done by dark, we do in the dark.",
  duskTitle: 'DUSK',
  duskSub: 'The lamps are coming on. The infected are stirring.',
  dusk: "Hear that? They're getting restless. The light's going, and so is their patience.",
  nightTitle: 'NIGHTFALL',
  nightSub: 'More of them now - faster, and they see further in the dark',
  wakeTitle: 'THE MATRON WAKES',
  wakeSub: 'Lights-out. Her round begins in the isolation block.',
  wake: "That scream came from isolation. Lights-out - she's started her round. That's where we find her.",
  power: 'Power is back. The isolation block will have its lamps tonight - for whatever good it does now.',
  recordsDoneTitle: 'THE RECORDS ARE RECOVERED',
  recordsLate: "Still missing some of the files. They'll keep - she won't. Watch the dark.",
  matronDown: 'Rest now, Matron. Your round is over.',
  call: "Lantern, I'm not putting down on that hill in the dark. First light in sixty seconds - hold the lawn till then.",
  callTitle: 'HOLD UNTIL DAWN',
  callSub: 'The bird lands at first light - hold the lawn',
  dawn: "First light. Get aboard - and don't look back at the windows.",
};
