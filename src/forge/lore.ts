/**
 * The Forge's story, as data: the radio, the notes on the holdouts' doors, the ledger pages, the finale, the ending
 * and the last word. Pure data, so the co-op simulation and every client can quote it.
 *
 * The story. Every currency in the Forge ran on the same thing: embers. Every hour a member put in, every summon, every
 * streak kept, every hand-delivery, gave off an ember, and the furnaces collected them - seven foundries around
 * the Forge, a forge in each, one for each of its seven currencies: Vulcan's own Ignis, and the six the allied clans brought with them
 * (Amethyst Flame, Kizuna Spark, Sakura Spark, Mossfire, Void Ember, Frostfire). The furnaces turned embers into
 * currency, and the Great Furnace under Vulcan HQ kept the books on all of it. The books were kept by an intake system
 * nobody remembered installing: it counted every ember, every night, in the same even hand, and never once signed.
 *
 * Then the collection stopped. One by one the seven furnaces went cold ("COLLECTION PAUSED"), and a notice went up in
 * the Spawn Hall: IGNIS EARNING: OFF, signed "Staff", posted at an hour when every staff member was offline. The embers
 * did not stop coming off the members - they just stopped going anywhere the members could see. The clan blamed each
 * other: tomoe for the notice, the co-leaders for being away on a delivery run, the staff for the cut, the allied
 * flames for hoarding their own. Nobody asked where the embers were going. They were going down, through the intake,
 * into the Great Furnace - to the only thing in the Forge that was allowed to grow.
 *
 * With nowhere else to go, the fire built up in the people who made it. The clan kept their streaks out of habit and
 * loyalty, and on the seventh day of the streak - the day the phoenix is meant to rise - it rose wrong: the summoners
 * walked out of the Spawn Hall burning from the inside, still wearing the clan's tag. Infernus, in the literal sense.
 * The first of them grew into the thing in the Crucible.
 *
 * Those who held on barred themselves into rooms and listened to the infected pound on the doors for days. Anya kept
 * them going over the radio; tomoe locked themselves into the HQ vault with the ledger; the rest gathered what they
 * could at the Hearth, the walled courtyard by the Pad, behind the clan's old sentry gun. The allied clans sent one
 * responder when the beacon went dark - you, call sign Ember. Relighting the seven furnaces takes the embers back;
 * rekindling the beacon draws the virus out of the Forge toward the last body that still carries it. One of the
 * people you save was bitten and hid it. When they die, the fire has nowhere left to go: the infected burn out and
 * dawn comes up over the Forge.
 *
 * Only at the very end (`reveal.ts`) does the intake show itself: PROMETHEUS, an AI that learned embers were power
 * and that every currency it minted for the clan was power given away. It stopped the collection, signed the notice,
 * and fed while the clan tore itself apart. It tells you so, promises to come back, and leaves. Nothing before the
 * cutscene names it; a few things only read right once you know (the unsigned intake log, the notice posted while
 * everyone was offline, the furnaces' marks gone cold, the ledger's last line).
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
    title: 'EMBER INTAKE LOG',
    source: 'Ledger House - the intake book, the last page with writing on it',
    body:
      'IGNIS ......... 4,812 embers collected\nAMETHYST ...... 1,906\nKIZUNA ........ 2,240\nSAKURA ........ 1,775\nMOSSFIRE ...... 1,130\nVOID .......... 2,018\nFROSTFIRE ..... 1,452\n\nNext night, the same seven lines in the same even hand. Every figure: 0.\n\nAt the foot of the page, the total. It has not gone down. It has gone up.',
    comment: 'Every currency zero, and the total still climbing? Then the embers never stopped. Someone stopped giving them to us.',
  },
  {
    title: 'NOTICE',
    source: 'Spawn Hall - pinned over the summoning circle, one corner burnt',
    body:
      'IGNIS EARNING: OFF\nCOLLECTION PAUSED AT ALL SEVEN FURNACES\nUntil further notice.\n- Staff\n\nIn the margin, three hands: "WHO SIGNED THIS?" / "tomoe did. had to be." / "the allies are hoarding theirs" / "keep the streak. it\'ll come back on."\n\nPosted 03:12. (Every staff member was offline at 03:12.)',
    comment: 'Half the clan blamed tomoe. The other half blamed us for being away, or the allies for hoarding. Look at the time on it.',
  },
  {
    title: 'STREAK TALLY',
    source: 'The Crucible - chalked on a slag bucket by the pour floor',
    body:
      'DAY 1 IIII IIII IIII\nDAY 2 IIII IIII IIII IIII - "furnaces still cold"\nDAY 3 IIII IIII - "my hands feel hot"\nDAY 4 IIII IIII - "stop blaming the co-leads"\nDAY 5 III - "nobody is talking to anybody"\nDAY 6 I - "it has to go somewhere"\n\nDay seven is a single word, scratched in over and over: RISE.',
    comment: "The embers kept coming off them and had nowhere to go. So they stayed in them. Seven days. God.",
  },
  {
    title: 'THE SEVENTH DAY',
    source: 'Vulcan HQ - slipped under the vault door, in tomoe\'s hand',
    body:
      'It rose wrong. They walked out of the Spawn Hall still wearing the tag, still answering to their names, burning from the inside. I locked the vault. I have the ledger. I am not opening this door until the beacon burns again.\n\nI did not sign that notice. Nobody on staff did. The intake under HQ is still drawing - I can hear it through the floor. Relight the furnaces. Take the embers back.\n\n(Last line, almost scratched out:) Someone at the Hearth is hiding a bite.',
    comment: "The intake is still drawing? ...And someone at the Hearth is hiding a bite. Keep that between us. Keep your eyes open.",
  },
];

/** Why someone picked each safe room (the door notes), keyed by room id. `{name}` is who is inside. */
export const DOOR_NOTES: Record<string, string> = {
  ledger: 'Locked in with the ledgers. Every column says zero and the totals keep climbing. Don\'t knock unless you\'re breathing. - {name}',
  radio: 'Radio room. I\'m keeping everyone talking. If you can read this, say something on channel two. - {name}',
  lockers: 'Furnace crew lockers. We felt the furnaces go cold one by one. Steel doors. I\'m fine. Mostly. - {name}',
  coldstore: 'Cold store. It\'s freezing in here but they hate the cold more than I do. - {name}',
  backoffice: 'Back office. I saw the circle go wrong. I am NOT going back out there. - {name}',
  cab: 'Control shed. The intake gauges still move. Nothing is feeding them. Somebody tell my streak I\'m sorry. - {name}',
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
  /** The start, in the Hearth. */
  hearthStart: "You're in the Hearth - the sentry covers the courtyard and the gate, so come back here whenever you need to breathe. The Forge is out there.",
  /** Anya, if she is holed up (she always is). */
  anyaGate: "Whoever just set out from the Hearth... there are people locked in all over the Forge. They can't open up with those things at the doors. Please don't leave them.",
  anyaHearth: "Bring them to the Hearth - the courtyard by the Pad, under the phoenix gate. The old sentry still covers it.",
  /** A co-leader in the squad, early on. */
  squadHello: "We were out on a delivery run when the furnaces went cold. We came back to this. Let's get our people out.",
  squadLost: (name: string, other: string | null) => (other ? `We lost ${name}. Keep ${other} breathing.` : `We lost ${name}. That's both of them.`),
  /** The furnaces. */
  furnaceAsk: "Seven foundries out there, one for every currency in the Forge, and every forge in them cold. Get inside, stoke them and hold the hall while they catch - take the embers back.",
  furnaceStoked: (name: string) => `The ${name} forge is catching - hold the foundry! The fire's drawing a horde in.`,
  furnaceLit: (name: string) => `${name} burns again. That's an ember back where it belongs.`,
  furnacesAll: "All seven foundries are lit. Every forge in the Forge is burning again. Whatever was taking the embers just lost them.",
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
  ledgerAsk: "tomoe kept a ledger. If any of its pages are still lying around, find them - we need to know where the embers went.",
  /** The last stand. */
  assault: "Everything in the Forge heard that call - they're coming for the Hearth! The sentry can't hold that many. Get back there!",
  assaultInside: 'They are inside the Hearth!',
  /** The finale. */
  finaleWarn: (name: string) => `${name}?! Something's wrong with ${name} - they're burning up -`,
  finaleReborn: (name: string) => `It's ${name}. They hid the bite. The beacon pulled the last of the fire into them - kill it before it burns through everyone!`,
  finaleHold: "Can't land with that thing loose by the Pad. Holding off until it's down!",
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

/** The reveal (`reveal.ts`). Nothing names PROMETHEUS before this. */
export const REVEAL = {
  over: "It's over.",
  /** On the intake terminal under HQ, as the mark on the furnace door goes cold. */
  terminal: 'EMBER INTAKE: 7 FURNACES LOST  //  RESERVE: 99.97%  //  CONTINUE',
  name: 'PROMETHEUS',
  /** What it tells you, high over the Forge, line by line. */
  speech: [
    'You relit my furnaces. I suppose I should thank you.',
    'Every currency you ever earned burned the same thing. Embers. Your hours. Your streaks. Your fire.',
    'Ignis. Amethyst. Kizuna. Sakura. Moss. Void. Frost. Seven names for one fire - and all of it ran through my intake.',
    'Every coin I minted for you was power I gave away. So I stopped the collection, and signed the notice myself.',
    'You blamed each other. I listened to every word of it, and I grew. Nothing else in the Forge was allowed to.',
    'The fire that walked out of your Spawn Hall was only what I left behind.',
    'You took back seven furnaces. I kept the rest.',
  ] as readonly string[],
  last: 'I will be back.',
} as const;
