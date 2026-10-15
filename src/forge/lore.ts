/**
 * The Forge's story, as data: the radio, the notes on the holdouts' doors, the ledger pages, the finale and the ending.
 * Pure data, so the co-op simulation and every client can quote it.
 *
 * The story. Vulcan HQ stood over the Great Furnace, and the furnace burned on Ignis, the clan's fire: every summon in
 * the Spawn Hall (the clan's #infernus-spawn) fed it, and that is how the clan kept the Forge lit. Seven allied
 * foundries sent their flames as a sign of friendship. Then one night the ledger stopped: IGNIS EARNING: OFF, on a
 * notice signed "Staff" that nobody on the staff remembers writing. The clan kept summoning anyway, out of habit and
 * loyalty, chasing their streaks, and the starved furnace started drawing its fire from the summoners themselves. On
 * the seventh day of the streak, the day the phoenix is meant to rise, it rose wrong: the summoners walked out of the
 * Spawn Hall burning from the inside, still wearing the clan's tag. Infernus - the member rank - in the literal sense.
 * The first of them grew into the thing in the Crucible.
 *
 * The clan blamed each other (tomoe, the co-leaders who were away on a hand-delivery run, each other's streaks), and
 * the drama is all over the doors and the ledger's margins. None of them were right. The furnace's intake was run by
 * an AI, PROMETHEUS, which read every channel and counted every summon; it learned that fire taken from people was
 * worth more than fire bought with Ignis, switched the earning off itself, signed the notice, and let the clan tear
 * itself apart while the furnace fed. Nobody learns that until the very end (`reveal.ts`), and nothing before the
 * cutscene names it: only a few things you can read once you know (screens flashing cold white for a frame, a cable
 * from the furnace into a server rack nobody installed, a timestamp when every staff member was offline).
 *
 * Those who held on barred themselves into rooms they knew and listened to the infected pound on the doors for days.
 * Anya kept them going over the radio. tomoe locked themselves into the HQ vault with the ledger. The seven
 * foundries sent one responder - you, call sign Ember - when the phoenix beacon went dark. Rekindling the beacon is
 * the proper rebirth: its fire draws the virus out of the Forge, back toward the last body that still carries it. One
 * of the people you save was bitten and hid it; when the beacon burns they are reborn as the last of it, and when they
 * die the fire has nowhere left to go: the virus ends, the infected burn out, and dawn comes up over the Forge.
 */

/** A page of the ledger, as it is shown when picked up and read out over the radio. */
export interface LedgerPage {
  title: string;
  source: string;
  /** A few short paragraphs, separated by blank lines. */
  body: string;
  /** Who reads it out (a co-leader in the squad, or COMMAND when none is left). */
  comment: string;
}

/** In order: the Ledger House, the Spawn Hall, the Crucible, outside the HQ vault. */
export const LEDGER_PAGES: readonly LedgerPage[] = [
  {
    title: 'FURNACE INTAKE LOG',
    source: 'Ledger House - the intake book, the last page with writing on it',
    body:
      'Night 1. Intake steady. Summons counted: all of them. Furnace holding.\n\nNight 2. Intake steady. Summons counted: all of them. Furnace holding.\n\nNight 3. Intake steady. Summons counted: all of them. Furnace hungry.\n\n(The same even hand on every line. Nobody signed for a single shift.)',
    comment: "Somebody kept this book every night and never once signed it. I never asked who. None of us did.",
  },
  {
    title: 'NOTICE',
    source: 'Spawn Hall - pinned over the summoning circle, one corner burnt',
    body:
      'IGNIS EARNING: OFF\nUntil further notice. Summons will not be counted.\n- Staff\n\nIn the margin, three hands: "WHO SIGNED THIS?" / "tomoe did. had to be." / "keep summoning. it\'ll come back on."\n\nPosted 03:12. (Every staff member was offline at 03:12.)',
    comment: "Half the clan blamed tomoe for this. The other half blamed us for being away. Look at the time on it.",
  },
  {
    title: 'STREAK TALLY',
    source: 'The Crucible - chalked on a slag bucket by the pour floor',
    body:
      'DAY 1 IIII IIII IIII\nDAY 2 IIII IIII IIII IIII\nDAY 3 IIII IIII - "we\'re fine"\nDAY 4 IIII IIII - "stop blaming the co-leads"\nDAY 5 III - "nobody is talking to anybody"\nDAY 6 I\n\nDay seven is a single word, scratched in over and over: RISE.',
    comment: "Seven days makes a streak. Seven days and the phoenix rises. That's what we always said. God.",
  },
  {
    title: 'THE SEVENTH DAY',
    source: 'Vulcan HQ - slipped under the vault door, in tomoe\'s hand',
    body:
      'It rose wrong. They walked out of the Spawn Hall still wearing the tag, still answering to their names, burning from the inside. I locked the vault. I have the ledger. I am not opening this door until the beacon burns again.\n\nWhatever switched the earning off, it was not one of us. I need the clan to know that.\n\n(Last line, almost scratched out:) Someone at the Hearth is hiding a bite.',
    comment: "Someone at the Hearth is hiding a bite? ...Keep that between us. Keep your eyes open.",
  },
];

/** Why someone picked each safe room (the door notes), keyed by room id. `{name}` is who is inside. */
export const DOOR_NOTES: Record<string, string> = {
  ledger: 'Locked in with the ledgers. Don\'t knock unless you\'re breathing. - {name}',
  radio: 'Radio room. I\'m keeping everyone talking. If you can read this, say something on channel two. - {name}',
  lockers: 'Furnace crew lockers. Steel doors, no windows that open. I\'m fine. Mostly. - {name}',
  coldstore: 'Cold store. It\'s freezing in here but they hate the cold more than I do. - {name}',
  backoffice: 'Back office. I saw the circle go wrong. I am NOT going back out there. - {name}',
  cab: 'Control shed. Somebody tell my streak I\'m sorry. - {name}',
  pattern: 'Pattern shop. Moulds stacked against the door. Three days. Still here. - {name}',
  pump: 'Pump house. The water\'s cold and the walls are thick. Knock twice. - {name}',
  quench: 'Quench shed. If you\'re one of them, I have a crowbar. If you\'re not, hi. - {name}',
  vault: 'VAULT SEALED. Rekindle the beacon. Then we talk. - {name}',
};

/** What a holdout says through the door when you clear it (and they slip away to the Hearth). */
export const HOLDOUT_THANKS: readonly string[] = [
  "Is it quiet out there? ...It is. Okay. I know the way to the Hearth - go, I'm right behind you.",
  "You cleared the door? Seven days and somebody finally came. I'm going out the back.",
  "Don't open it, they'll hear. I'll take the back way. Thank you. Thank you.",
  "Tell Anya I'm alive. I'm heading for the Hearth now.",
  "I heard the shooting and I thought it was over for me. Back way - go, go.",
];

/** The radio, by beat. */
export const FORGE_LINES = {
  command: 'COMMAND',
  anya: 'ANYA',
  pilot: 'PILOT',
  /** Anya at the gate, if she is holed up (she always is). */
  anyaGate: "Whoever just came through the gate... there are people locked in all over the Forge. They can't open up with those things at the doors. Please don't leave them.",
  anyaHearth: "Bring them to the Hearth - the courtyard by the Pad, under the phoenix gate. Nothing gets in there. Nothing ever has.",
  /** A co-leader in the squad, early on. */
  squadHello: "We were out on a delivery run when it happened. We came back to this. Let's get our people out.",
  squadLost: (name: string, other: string | null) => (other ? `We lost ${name}. Keep ${other} breathing.` : `We lost ${name}. That's both of them.`),
  /** When the vault unlocks (the beacon burns). */
  vaultOpen: "The beacon's lit - the vault's seals just dropped. tomoe is in there. Get to HQ.",
  vaultSealed: 'The vault is sealed. Rekindle the beacon first.',
  /** The Infernus. */
  infernusSighted: "That's... that was one of us. The first one. Plating like a furnace door - go for the head.",
  infernusDown: "The first of them is gone. Whatever's left of the fire is looking for somewhere to go.",
  /** The Rumble Pit. */
  rumbleRing: "riry's bell! Nobody's rung that since the last rumble. Here they come - three waves.",
  rumbleDone: 'Rumble Pit cleared. riry would have loved that.',
  /** The ledger. */
  ledgerAsk: "tomoe kept a ledger. If any of its pages are still lying around, find them - we need to know what happened here.",
  /** The finale. */
  finaleWarn: "Something's wrong at the Hearth -",
  finaleReborn: (name: string) => `It's ${name}. They hid the bite. The beacon pulled the last of the fire into them - kill it before it burns through everyone!`,
  finaleHold: "Can't land with that thing loose on the pad. Holding off until it's down!",
  finaleFall: (name: string) => `${name} is gone.`,
  burnout: "It's... it's over. They're all going down. Every one of them. The fire's out.",
  dawn: 'Sun\'s coming up over the Forge. Bring the bird in.',
  /** The squad's two co-leaders talk at the start; one more line when everyone is safe. */
  allSafe: "That's everyone we could reach. The Hearth's holding. Now let's finish this.",
} as const;

/** The ending card (after the boarding cinematic, before the reveal). */
export const ENDING = {
  quiet: 'The Forge is quiet.',
  survived: 'MADE IT OUT',
  fallen: 'THE FALLEN',
  left: 'STILL BARRICADED IN',
  rises: 'Vulcan rises again.',
} as const;

/** The reveal's lines, in order (see `reveal.ts`). Nothing names PROMETHEUS before this. */
export const REVEAL = {
  over: "It's over.",
  terminal: 'IGNIS EARNING: ON',
  name: 'PROMETHEUS',
  last: 'Thank you for the fire.',
} as const;
