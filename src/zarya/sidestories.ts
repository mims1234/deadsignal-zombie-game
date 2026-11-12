/**
 * ZARYA's side stories (no THREE): small, self-contained, apart from the main story. Each lives in one or two places,
 * has a few steps of its own and its own payoff. Nobody gives orders: the squad notices something and follows it.
 *
 * The town's own logic: a family left the shuba on the outside sill for a grandfather still at the garages; a yard dog
 * went where it was warm; a parcel waits on a stall for the depot; the Okhotnik promised a rifle for the thirty-first;
 * a letter never got as far as the tea kiosk; the Hare's ears were left with the cloakroom; the studio's last sitting
 * never came up; two fishermen and a night shift each made a bet; the Institute's escaping hamster escaped; Zina wrote
 * in the canteen's complaints book; a teacher keeps a list of lost mittens.
 *
 * Rules (the same as the main story's): nothing is timed, nothing can be failed or missed, every step stays done. A
 * story shows on the HUD only once found (its first step done), as one quiet line under the main story's, and has its
 * own section in the journal.
 *
 * How it is kept: one small number per story in the story's shared state (`StoryView.side`, sent on the wire with the
 * rest by `encodeStory`), `stage * 16 + bits`: the stage the story is at, and which places of that stage are done (a
 * stage's places may be done in any order; most have one). A player asks for a place with the story's act `'side'`
 * and an index `sideIndex(story, stage, place)`; the story checks the zone is open and the player stands in reach
 * (`story.ts`). The screen says the lines, pays the reward and draws the HUD line and the journal (`runtime.ts`); the
 * things in the places are drawn by `look.ts` (`sideModels.ts`). No import from `story.ts`: it imports this.
 */
import type { Line } from './lines';
import { ZARYA } from './places';
import type { Spot, ZaryaZone } from './types';
import { BANYA } from './zones/banya';
import { CANTEEN } from './zones/canteen';
import { DEPOT } from './zones/depot';
import { DK } from './zones/dk';
import { DVOR } from './zones/dvor';
import { GARAGES } from './zones/garages';
import { INSTITUTE } from './zones/institute';
import { RYNOK } from './zones/rynok';
import { TETS } from './zones/tets';
import { UPSTAIRS } from './zones/upstairs';

/** What finishing a story gives: points (to every player), mod parts (the squad's), ammunition or armour (every player's own). */
export interface SideReward {
  cash?: number;
  mod?: number;
  ammo?: true;
  armor?: true;
}

/** A place in a side story: where it is, what using it is called, and what stands there (`sideModels.ts`). */
export interface SidePlace {
  at: Spot;
  /** The height the thing lies at (a sill, a counter, the ground). */
  y: number;
  /** The way the thing faces (a yaw). */
  yaw?: number;
  zone: ZaryaZone;
  /** The USE prompt. */
  verb: string;
  sub?: string;
  /** Seconds to hold USE (0: a tap). */
  hold?: number;
  /** What stands here until the place is done (from the moment the tram runs: it was always there), and after. */
  model?: string;
  after?: string;
  /** Seen before its step comes: a quiet note instead of a prompt (head, sub). */
  early?: readonly [string, string];
  /** Said when this place is done (a stage of several places: each its own). */
  lines?: readonly Line[];
}

export interface SideStage {
  /** The HUD line's detail while this stage is the one to do (the first stage's is never shown: the story is not found yet). */
  hint: string;
  places: readonly SidePlace[];
  /** Said when the whole stage is done. */
  lines: readonly Line[];
  /** What the journal remembers of it, once done. */
  learn: string;
}

export interface SideStory {
  id: string;
  title: string;
  reward: SideReward;
  /** The payoff's banner subtitle (the reward is added to it). */
  done: string;
  /** A piece of the town's history: the journal's last line, once the story is finished. */
  history: string;
  stages: readonly SideStage[];
}

const R = 3;
const SQ = ZARYA.side;

export const SIDE: readonly SideStory[] = [
  // ---- the Dvor and the garages ----
  {
    id: 'shuba',
    title: 'THE SHUBA ON THE SILL',
    reward: { cash: 500 },
    done: 'The horse is on the sill, by the bowl.',
    history: 'In the panel blocks the window is the larder from November to March: the shuba, the pickles and the New Year champagne all wait on the outside sill.',
    stages: [
      {
        hint: '',
        places: [{ at: DVOR.side.sill, y: 1.6, yaw: Math.PI / 2, zone: 'dvor', verb: 'LOOK AT THE SILL', sub: 'A bowl under a plate, and a note', model: 'bowl', after: 'bowl' }],
        lines: [
          ['VERA', 'Herring under a fur coat, on the outside sill. Best fridge in the block at minus thirty.'],
          ['MIRA', "There's a note under the plate. 'Papa. We've started without you. Again. Come when the garage lets you go. Galya.'"],
        ],
        learn: "Galya's family left the shuba on the outside sill for her father, who was still at the garages.",
      },
      {
        hint: "Galya's father: at the garages",
        places: [{ at: GARAGES.side.gift, y: 0.78, yaw: 0.3, zone: 'garages', verb: 'TAKE THE PARCEL', sub: "Wrapped in newspaper: 'For Lenochka'", model: 'gift', early: ['A PARCEL IN NEWSPAPER', "On the neighbours' table. 'For Lenochka'"] }],
        lines: [
          ['TIMUR', "That's old Fyodor from forty-one. He's been carving that horse since October."],
          ['TIMUR', 'He was going to walk it over at midnight. He says the garage is warmer than his son-in-law.'],
        ],
        learn: "Her father fell asleep at the neighbours' table in the garages, with a wooden horse for his granddaughter.",
      },
      {
        hint: 'Back to the sill: the west block of the Dvor',
        places: [{ at: DVOR.side.sill, y: 1.6, yaw: Math.PI / 2, zone: 'dvor', verb: 'LEAVE IT BY THE BOWL', hold: 0.8, after: 'gift' }],
        lines: [
          ['VERA', "There. When they wake, it's on the sill. They'll think he came."],
          ['MIRA', 'He nearly did.'],
        ],
        learn: 'The wooden horse is on the sill, beside the shuba.',
      },
    ],
  },
  {
    id: 'sharik',
    title: 'SHARIK',
    reward: { cash: 250 },
    done: 'Asleep where it is warm, under his own coat.',
    history: 'Every yard in Zarya has a dog that belongs to nobody and is fed by everyone. The yard-keeper builds Sharik a new kennel every other winter and Sharik sleeps by the transformer hut.',
    stages: [
      {
        hint: '',
        places: [{ at: DVOR.side.kennel, y: 0.1, zone: 'dvor', verb: 'LOOK IN THE KENNEL' }],
        lines: [
          ['KOSTYA', "That's Sharik's house. Everyone in the yard feeds him."],
          ['TIMUR', 'Bowl frozen with the food still in it. He went off before he ate.'],
          ['VERA', "His old coat's in there. I'll bring it. Dogs go where it's warm."],
        ],
        learn: 'Sharik, the yard dog, left his kennel before he ate. His old coat was still in it.',
      },
      {
        hint: 'Somewhere warm, in the east yard',
        places: [
          { at: DVOR.side.dog, y: 0.02, yaw: 0.2, zone: 'dvor', verb: 'COVER HIM WITH HIS COAT', hold: 0.8, model: 'dog', after: 'dogCoat', early: ['A DOG, ASLEEP', "Against the transformer hut. It hums, and it's warm"] },
        ],
        lines: [
          ['VERA', 'Breathing. Even the dogs.'],
          ['KOSTYA', 'He sleeps there all winter. The hut hums. He likes it.'],
        ],
        learn: 'Sharik is asleep against the transformer hut, under his own coat.',
      },
    ],
  },
  // ---- the Rynok and the depot ----
  {
    id: 'honey',
    title: 'THE HONEY PARCEL',
    reward: { cash: 400 },
    done: "In Zina's pigeonhole, for when she comes off the line.",
    history: 'Line One has run its loop since 1964. Zina has driven it for thirty-one of those years; the dispatchers keep every one of her route sheets in a cupboard, and not one of them has a gap.',
    stages: [
      {
        hint: '',
        places: [{ at: RYNOK.side.parcel, y: 1.03, yaw: 0.2, zone: 'rynok', verb: 'TAKE THE PARCEL', sub: 'Addressed in pencil', model: 'parcel' }],
        lines: [
          ['MIRA', "A parcel on the honey counter. 'Tyotya Zina, Line One. Leave with the dispatcher. Happy New Year. Masha.'"],
          ['TIMUR', 'Masha from the honey row. Every year. The dispatcher sits in the glass booth at the depot.'],
        ],
        learn: "Masha from the honey row was sending her New Year parcel to Tyotya Zina, care of the depot's dispatcher.",
      },
      {
        hint: "The dispatcher's booth, at the tram depot",
        places: [{ at: DEPOT.side.pigeonhole, y: 1.15, zone: 'depot', verb: "LEAVE IT IN ZINA'S PIGEONHOLE", hold: 0.6, model: 'pigeonholes', after: 'pigeonholesFull' }],
        lines: [
          ['TIMUR', "Honey. Thirty-one jars in thirty-one years. She says it's for her throat."],
          ['TIMUR', "It's for calling the stops. She calls every one herself. The loudspeaker can't say Stroiteley."],
        ],
        learn: "The honey is in Zina's pigeonhole. She calls every stop herself: the loudspeaker cannot say Stroiteley.",
      },
    ],
  },
  {
    id: 'rifle',
    title: "SEMYONOV'S RIFLE",
    reward: { mod: 1 },
    done: "Finished, as promised. Under it, the Okhotnik's spares tin.",
    history: 'The Okhotnik has sold to anyone with a hunting ticket since 1971. He mends for anyone without one, and does not ask.',
    stages: [
      {
        hint: '',
        places: [{ at: DEPOT.side.rifle, y: 1.03, yaw: 0.1, zone: 'depot', verb: 'READ THE REPAIR TAG', sub: 'A rifle, its stock off', model: 'rifleParts', after: 'rifleParts' }],
        lines: [
          ['MIRA', "A rifle on the counter, stock off. The tag: 'Semyonov. Firing pin. Ready the thirty-first. Promised.'"],
          ['TIMUR', "Promised, underlined twice. The track gang turn his pins on their lathe. He'll have sent for it."],
        ],
        learn: "The Okhotnik promised Semyonov his rifle for the thirty-first. The firing pin was coming from the track gang's store.",
      },
      {
        hint: "A firing pin: the track gang's store, at the depot",
        places: [{ at: DEPOT.side.pin, y: 0.95, zone: 'depot', verb: 'TAKE THE PIN', sub: "A tin marked 'Okhotnik'", model: 'tin', early: ['A TIN MARKED OKHOTNIK', 'On the shelf. Something small rattles in it'] }],
        lines: [['TIMUR', 'Turned, wrapped in a rag, his name on the tin. Nobody at the depot throws anything away.']],
        learn: 'The track gang turned the pin and left it in a tin with his name on it.',
      },
      {
        hint: "Back to the Okhotnik's counter",
        places: [{ at: DEPOT.side.rifle, y: 1.03, yaw: 0.1, zone: 'depot', verb: 'FIT THE PIN', sub: 'And the stock', hold: 1.4, after: 'rifle' }],
        lines: [
          ['TIMUR', 'Pin in. Stock on. Ready the thirty-first, as promised.'],
          ['MIRA', "It's the first."],
          ['TIMUR', 'Not by any clock in this town.'],
        ],
        learn: "Semyonov's rifle is finished, on the counter. Under it was the Okhotnik's tin of spare gun parts: the squad took one.",
      },
    ],
  },
  // ---- the store and the square ----
  {
    id: 'letter',
    title: 'PEG FORTY-SEVEN',
    reward: { cash: 300 },
    done: "In Lida's pocket. She will find it when she wakes.",
    history: "Nina knows every regular's peg in the Univermag's cloakroom. Forty-seven has been Gena's since the store opened, and he never once collected his coat before eleven.",
    stages: [
      {
        hint: '',
        places: [{ at: SQ.letter, y: 1.03, yaw: 0.1, zone: 'store', verb: 'READ THE LETTER', sub: 'In the pocket of the last coat on the counter', model: 'letter' }],
        lines: [
          ['MIRA', "Peg forty-seven. A letter in the pocket. 'Lida. I'll be at the tea kiosk at a quarter to twelve. If you come, I'll say it. Gena.'"],
          ['NINA', "Gena. From the meat rows. Thirty years he has bought tea at that kiosk. He doesn't like tea."],
        ],
        learn: 'Gena from the meat rows wrote to Lida from the pharmacy: he would be at the tea kiosk at a quarter to twelve.',
      },
      {
        hint: "Lida: by the fair's tea kiosk",
        places: [{ at: SQ.lida, y: 1, zone: 'square', verb: 'GIVE LIDA THE LETTER', sub: 'Into her coat pocket', hold: 0.8 }],
        lines: [
          ['VERA', "In her pocket. She'll find it when she wakes."],
          ['NINA', 'She will read it twice. Then she will come and ask me what he meant. I will tell her.'],
        ],
        learn: 'The letter is in Lida\'s pocket. Gena never got as far as the kiosk.',
      },
    ],
  },
  {
    id: 'mittens',
    title: 'LOST PROPERTY',
    reward: { cash: 300 },
    done: "All three, back in Marina Sergeyevna's bag.",
    history: "Every New Year the square loses about forty mittens. School Number Two's teacher gets about thirty-nine of them back.",
    stages: [
      {
        hint: '',
        places: [{ at: SQ.bag, y: 0.02, yaw: 0.4, zone: 'square', verb: "LOOK IN THE TEACHER'S BAG", sub: 'By the stage', model: 'bag', after: 'bag' }],
        lines: [
          ['KOSTYA', "That's Marina Sergeyevna's bag. She counts us every ten minutes and the mittens every five."],
          ['VERA', "A list. 'Red, with a deer. Blue. Green: Vovka's, again.' Three still out."],
        ],
        learn: "School Number Two's teacher keeps a list of lost mittens in her bag by the stage. Three were still out.",
      },
      {
        hint: 'Three lost mittens, round the square',
        places: [
          { at: SQ.mittenFence, y: 0.03, zone: 'square', verb: 'PICK UP THE MITTEN', model: 'mittenRed', lines: [['VERA', "Red, with a deer. On the tree's fence, where somebody put it to be seen."]] },
          { at: SQ.mittenKiosk, y: 1.03, yaw: 1.2, zone: 'square', verb: 'PICK UP THE MITTEN', model: 'mittenBlue', lines: [['TIMUR', 'Blue. Handed in at the mitten stall. Of course it was.']] },
          { at: SQ.mittenIce, y: 0.03, yaw: 2.2, zone: 'square', verb: 'PICK UP THE MITTEN', model: 'mittenGreen', lines: [['KOSTYA', "Green. That's Vovka's. It's always Vovka's."]] },
        ],
        lines: [],
        learn: 'All three found: on the tree\'s fence, at the mitten stall, in the ice town.',
      },
      {
        hint: "Back to the teacher's bag, by the stage",
        places: [{ at: SQ.bag, y: 0.02, yaw: 0.4, zone: 'square', verb: 'PUT THEM IN HER BAG', hold: 0.6 }],
        lines: [['NINA', 'She will count them in the morning. She will want them all. She always does.']],
        learn: "The mittens are in Marina Sergeyevna's bag.",
      },
    ],
  },
  // ---- the Palace of Culture ----
  {
    id: 'hare',
    title: "THE HARE'S EARS",
    reward: { cash: 300 },
    done: 'There is a Hare in the line now.',
    history: "School Number Two has put on 'Morozko' for the New Year pageant every year since the Palace opened. The Hare has two lines, and every boy in the second class wants them.",
    stages: [
      {
        hint: '',
        places: [{ at: DK.side.ears, y: 1.03, yaw: 0.3, zone: 'dk', verb: "TAKE THE HARE'S EARS", sub: "A cloakroom tag on them: 'Hare. 2B'", model: 'ears' }],
        lines: [
          ['KOSTYA', "Those are mine. I left them with the cloakroom so they wouldn't get bent."],
          ['NINA', 'And then you went to the Univermag to guard a door.'],
          ['KOSTYA', 'Somebody had to.'],
        ],
        learn: "Kostya left the Hare's ears with the Palace's cloakroom, so they would not get bent before the pageant.",
      },
      {
        hint: "The gap in the line, on the Palace's stage",
        places: [{ at: DK.side.gap, y: 0.31, yaw: -Math.PI / 2, zone: 'dk', verb: 'PUT THE EARS IN THE GAP', sub: 'Between the Snowflake and the wolves', hold: 0.8, after: 'ears' }],
        lines: [
          ['KOSTYA', "Now there's a Hare."],
          ['KOSTYA', 'Anya says the Hare is the most important. He has the most lines. He has two.'],
        ],
        learn: "The ears are in the Hare's place in the line, between the Snowflake and the wolves.",
      },
    ],
  },
  // ---- the store's second floor and the canteen ----
  {
    id: 'studio',
    title: 'THE LAST APPOINTMENT',
    reward: { cash: 400 },
    done: 'With the Sorokins, all five, in their best.',
    history: "The Univermag's photo studio has photographed every family in Zarya in front of the same painted winter since 1966. The negatives fill a cupboard to the ceiling.",
    stages: [
      {
        hint: '',
        places: [{ at: UPSTAIRS.side.book, y: 0, yaw: 0, zone: 'upstairs', verb: 'READ THE APPOINTMENT BOOK', model: 'lectern', after: 'lectern' }],
        lines: [
          ['MIRA', "The studio's book. Last sitting, twenty-three forty-five: 'The Sorokins, family, five. Paid.'"],
          ['KOSTYA', "They come every year. He's always cross because one of them blinks."],
        ],
        learn: "The Sorokins had the photo studio's last appointment of the year, at a quarter to twelve. They never came up.",
      },
      {
        hint: "Their print from last year, on the studio's drying line",
        places: [{ at: UPSTAIRS.side.prints, y: 0, yaw: Math.PI / 2, zone: 'upstairs', verb: 'TAKE THEIR PRINT', sub: "Last New Year's. Never collected", model: 'prints', after: 'printsGap', early: ['PRINTS ON A LINE', 'Pegged up to dry. Names on the backs'] }],
        lines: [['VERA', 'Last year\'s. Never collected. Somebody blinked.']],
        learn: 'Their print from last New Year was still pegged on the drying line, never collected.',
      },
      {
        hint: 'The Sorokins: by the ice slide, on the square',
        places: [{ at: SQ.sorokins, y: 1, zone: 'square', verb: 'GIVE THE SOROKINS THEIR PRINT', hold: 0.8 }],
        lines: [
          ['NINA', 'All five, in their best, waiting to have their picture taken. He owes me for a cloakroom tag since March.'],
          ['NINA', 'He can owe me for this too.'],
        ],
        learn: 'The print is with the Sorokins, by the slide, where they stood dressed for the photograph.',
      },
    ],
  },
  {
    id: 'kotlety',
    title: 'OPINIONS',
    reward: { cash: 200 },
    done: 'Eleven years, and no apology.',
    history: 'The staff canteen over the Univermag feeds four hundred at the New Year party. Its kotlety have not changed since 1970, which is the point Zina makes.',
    stages: [
      {
        hint: '',
        places: [{ at: CANTEEN.side.complaints, y: 1.0, yaw: Math.PI, zone: 'canteen', verb: 'READ THE COMPLAINTS BOOK', model: 'book', after: 'book' }],
        lines: [
          ['MIRA', "Complaints book. 'The kotlety are an insult to the working people of Line One. Z. Mukhina, thirty-one years a customer.'"],
          ['TIMUR', "Tyotya Zina. That's the opinion."],
        ],
        learn: "Tyotya Zina wrote in the canteen's complaints book that the kotlety are an insult to the working people of Line One.",
      },
      {
        hint: "The management's reply, by the serving hatch",
        places: [{ at: CANTEEN.side.reply, y: 1.45, yaw: Math.PI, zone: 'canteen', verb: 'READ THE NOTICE', model: 'notice', after: 'notice', early: ['A NOTICE BY THE HATCH', 'Typed, and signed'] }],
        lines: [
          ['MIRA', "'Comrade Mukhina is banned until she apologises to the kotlety. The Management.'"],
          ['TIMUR', 'Eleven years. She says they know what they did.'],
        ],
        learn: 'The management banned her until she apologises to the kotlety. That was eleven years ago.',
      },
    ],
  },
  // ---- the banya and the pond, the heating plant ----
  {
    id: 'pike',
    title: 'THE BIGGEST PIKE',
    reward: { armor: true },
    done: "Kolya, by a pike. Tolya's vatnik is the squad's.",
    history: 'The pond has been fished through the ice since before the town had a name. Nobody caught a pike in it from 1979 until tonight, and the board on the jetty said so in small chalk.',
    stages: [
      {
        hint: '',
        places: [{ at: BANYA.side.board, y: 0.55, yaw: 0, zone: 'banya', verb: 'READ THE BOARD', sub: 'Chalk, on the jetty rail', model: 'board', after: 'board' }],
        lines: [
          ['TIMUR', "'Biggest pike by the bells. Kolya against Tolya. Loser stands the banya and hands over his vatnik.'"],
          ['TIMUR', 'Every year. Neither of them has ever caught a pike.'],
        ],
        learn: 'Kolya and Tolya bet on the biggest pike by the bells: the loser stands the banya and hands over his quilted vatnik.',
      },
      {
        hint: 'Their catches, by two of the tents on the ice',
        places: [
          { at: BANYA.side.kolya, y: 0.1, yaw: 0.6, zone: 'banya', verb: 'LOOK AT THE CATCH', model: 'pike', after: 'pike', lines: [['TIMUR', "Kolya's. A pike. An actual pike. Forty centimetres if it's one."]] },
          { at: BANYA.side.tolya, y: 0.1, yaw: 2.1, zone: 'banya', verb: 'LOOK AT THE CATCH', model: 'perch', after: 'perch', lines: [['TIMUR', "Tolya's. A perch. And a boot."]] },
        ],
        lines: [['MIRA', 'Kolya wins.']],
        learn: 'Kolya caught a pike. Tolya caught a perch, and a boot.',
      },
      {
        hint: "Chalk the winner on the jetty's board",
        places: [{ at: BANYA.side.board, y: 0.55, yaw: 0, zone: 'banya', verb: 'CHALK UP THE WINNER', hold: 0.8, after: 'boardDone' }],
        lines: [
          ['TIMUR', 'Kolya, by a pike. Tolya will say it was measured wrong.'],
          ['MIRA', "Tolya's asleep."],
          ['TIMUR', "He'll say it in spring. His vatnik's on the rail. Wear it. He'd want it worn."],
        ],
        learn: "Kolya, by a pike. Tolya's vatnik was on the jetty rail: the squad wears it.",
      },
    ],
  },
  {
    id: 'shift',
    title: "THE NIGHT SHIFT'S BET",
    reward: { ammo: true },
    done: "Petrov wins. Grishin's tin of cartridges goes round the squad.",
    history: 'The heating plant has not once let the town go cold since 1962. The night shift keeps its bets on the same board as the pressures, and keeps the bets better.',
    stages: [
      {
        hint: '',
        places: [{ at: TETS.side.board, y: 1.5, yaw: Math.PI, zone: 'tets', verb: 'READ THE SHIFT BOARD', model: 'shiftBoard', after: 'shiftBoard' }],
        lines: [
          ['TIMUR', "'Bet: the coal comes in before the bells. Petrov: yes. Grishin: no. Stake: Grishin's tin of cartridges.'"],
          ['TIMUR', "Grishin hunts. Petrov doesn't. That's why it's the cartridges."],
        ],
        learn: 'The night shift bet on the coal coming in before the bells. Grishin staked his tin of cartridges against it.',
      },
      {
        hint: "The coal truck's docket, in its cab, in the yard",
        places: [{ at: TETS.side.docket, y: 2.0, yaw: Math.PI, zone: 'tets', verb: 'READ THE DOCKET', sub: 'Tucked in the cab window', model: 'docket', after: 'docket', early: ['THE COAL TRUCK', 'Loaded. A docket in the window'] }],
        lines: [['MIRA', "'Delivered twenty-three fifty-two.' Five minutes before the clocks stopped."]],
        learn: "The coal truck's docket says it came in at 23:52.",
      },
      {
        hint: 'Back to the shift board, in the boiler hall',
        places: [{ at: TETS.side.board, y: 1.5, yaw: Math.PI, zone: 'tets', verb: 'CHALK IT UP', hold: 0.8, after: 'shiftBoardDone' }],
        lines: [
          ['TIMUR', "Petrov wins. Grishin's tin is on the ledge under the board."],
          ['MIRA', "Take it. Petrov doesn't hunt."],
        ],
        learn: "Petrov won. Grishin's tin of cartridges went round the squad.",
      },
    ],
  },
  // ---- the Institute ----
  {
    id: 'bublik',
    title: 'BUBLIK',
    reward: { cash: 400 },
    done: 'Back in cage twelve. He will have it open by spring.',
    history: 'The Institute of Chronobiology numbers its sleepers: hamsters on the ground floor, bears below. The card on every cage gives the hour it last woke.',
    stages: [
      {
        hint: '',
        places: [{ at: INSTITUTE.side.cage, y: 0.86, yaw: -Math.PI / 2, zone: 'institute', verb: 'LOOK AT THE EMPTY CAGE', sub: 'The door open, a card on it' }],
        lines: [
          ['VERA', "Every cage asleep. Every one numbered. That one's open."],
          ['MIRA', "'Twelve. Bublik. Escapes. Look on the reception desk first.'"],
        ],
        learn: 'Number twelve in the animal lab, Bublik, escapes. The card says to look on the reception desk first.',
      },
      {
        hint: 'The reception desk, in the lobby',
        places: [{ at: INSTITUTE.side.desk, y: 1.1, yaw: 1.2, zone: 'institute', verb: 'PICK UP BUBLIK', model: 'hamsterBowl', early: ['A HAMSTER, ASLEEP', 'In the sugar bowl'] }],
        lines: [
          ['MIRA', 'In the sugar bowl. Asleep, with his cheeks full.'],
          ['KOSTYA', 'Can we keep him?'],
          ['NINA', 'No.'],
        ],
        learn: 'Bublik was asleep in the sugar bowl at reception, his cheeks full.',
      },
      {
        hint: 'Back to his cage, in the animal lab',
        places: [{ at: INSTITUTE.side.cage, y: 0.86, yaw: -Math.PI / 2, zone: 'institute', verb: 'PUT HIM BACK', sub: 'And shut the door', hold: 0.6, after: 'hamster' }],
        lines: [
          ['VERA', 'There. Shut the door this time.'],
          ['TIMUR', "He'll have it open by spring."],
        ],
        learn: 'Bublik is back in cage twelve, with the door shut.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// the state: one number per story, `stage * 16 + bits`
// ---------------------------------------------------------------------------------------------

/** A fresh `StoryView.side`. */
export const sideEmpty = (): number[] => SIDE.map(() => 0);
export const sideStage = (n: number): number => n >> 4;
export const sideBits = (n: number): number => n & 15;
/** Story `s` is found (its first step done) / finished. */
export const sideFound = (side: readonly number[], s: number): boolean => (side[s] ?? 0) > 0;
export const sideDone = (side: readonly number[], s: number): boolean => !!SIDE[s] && sideStage(side[s] ?? 0) >= SIDE[s]!.stages.length;
/** The act's index for place `k` of stage `stage` of story `s`, and back. */
export const sideIndex = (s: number, stage: number, k: number): number => s * 64 + stage * 8 + k;
export const sideOf = (i: number): { s: number; stage: number; k: number } => ({ s: Math.floor(i / 64), stage: Math.floor(i / 8) % 8, k: i % 8 });
/** A side row from the wire, made the right length (a row from before side stories decodes with none done). */
export const sideFrom = (r: readonly number[]): number[] => SIDE.map((_, s) => (Number.isInteger(r[s]) && r[s]! >= 0 ? r[s]! : 0));

/** The place an act's index names, or null. */
export function sidePlace(i: number): SidePlace | null {
  const { s, stage, k } = sideOf(i);
  return SIDE[s]?.stages[stage]?.places[k] ?? null;
}

/**
 * Whether place `i` may be done now: its story is at its stage, it is not done yet, and its zone can be reached
 * (`open`, from the story). The story adds when (from the tram's first run to the end) and the player's reach.
 */
export function sideCan(side: readonly number[], i: number, open: (z: ZaryaZone) => boolean): boolean {
  if (!Number.isInteger(i) || i < 0) return false;
  const { s, stage, k } = sideOf(i);
  const p = sidePlace(i);
  if (!p) return false;
  const n = side[s] ?? 0;
  if (sideStage(n) !== stage || (sideBits(n) & (1 << k)) !== 0) return false;
  return open(p.zone);
}

/** Place `i` done: the story's new number (the stage moves on once all its places are done). */
export function sideNext(side: readonly number[], i: number): number {
  const { s, stage, k } = sideOf(i);
  const st = SIDE[s]!.stages[stage]!;
  const bits = sideBits(side[s] ?? 0) | (1 << k);
  return bits === (1 << st.places.length) - 1 ? (stage + 1) * 16 : stage * 16 + bits;
}

/** How near a player must stand to a place to use it. */
export const SIDE_REACH = R;

/** Mod parts the side stories have given the squad (`ZaryaStory.modParts` adds them). */
export function sideMods(side: readonly number[] | undefined): number {
  if (!side) return 0;
  let n = 0;
  SIDE.forEach((q, s) => {
    if (q.reward.mod && sideDone(side, s)) n += q.reward.mod;
  });
  return n;
}

/** Place `k` of stage `stage` of story `s` is done. */
export function sidePlaceDone(side: readonly number[], s: number, stage: number, k: number): boolean {
  const n = side[s] ?? 0;
  const at = sideStage(n);
  return at > stage || (at === stage && (sideBits(n) & (1 << k)) !== 0);
}

/** Every place of every story, in order (for whoever draws them, `look.ts`). */
export const SIDE_PLACES: readonly { s: number; stage: number; k: number; p: SidePlace; i: number }[] = SIDE.flatMap((q, s) => q.stages.flatMap((st, stage) => st.places.map((p, k) => ({ s, stage, k, p, i: sideIndex(s, stage, k) }))));

/**
 * What stands at each place now: its `model` until it is done, its `after` once done and not taken over by a later
 * place on the same spot that has an `after` of its own. From the tram's first run (`live`), nothing before.
 */
export function sideShown(side: readonly number[], live: boolean): { model: boolean; after: boolean }[] {
  return SIDE_PLACES.map((q, j) => {
    if (!live) return { model: false, after: false };
    const done = sidePlaceDone(side, q.s, q.stage, q.k);
    let after = done && !!q.p.after;
    if (after) {
      for (let l = j + 1; l < SIDE_PLACES.length; l++) {
        const o = SIDE_PLACES[l]!;
        if (o.s !== q.s || !o.p.after) continue;
        if (Math.hypot(o.p.at.x - q.p.at.x, o.p.at.z - q.p.at.z) < 0.6 && sidePlaceDone(side, o.s, o.stage, o.k)) after = false;
      }
    }
    return { model: !done && !!q.p.model, after };
  });
}

// ---------------------------------------------------------------------------------------------
// what the screen shows: the prompts, the HUD's line, what changed, the journal
// ---------------------------------------------------------------------------------------------

export interface SidePrompt {
  id: string;
  d: number;
  text: string;
  sub?: string;
  hold: number;
  /** The act's index ('side'); -1: a note, nothing to do. */
  i: number;
  /** Where the thing is, and how high (the screen checks it can be seen). */
  at: Spot;
  y: number;
}

/**
 * The prompts in reach of (x, z): every place that may be done now (`can`), and a note at a place whose step has not
 * come yet (`early`).
 */
export function sidePrompts(side: readonly number[], x: number, z: number, can: (i: number) => boolean, live: boolean): SidePrompt[] {
  const out: SidePrompt[] = [];
  if (!live) return out;
  for (const q of SIDE_PLACES) {
    const d = Math.hypot(q.p.at.x - x, q.p.at.z - z);
    if (d > R) continue;
    if (can(q.i)) {
      out.push({ id: `side-${SIDE[q.s]!.id}-${q.stage}-${q.k}`, d, text: q.p.verb, sub: q.p.sub, hold: q.p.hold ?? 0, i: q.i, at: q.p.at, y: q.p.y });
      continue;
    }
    if (q.p.early && sideStage(side[q.s] ?? 0) < q.stage) out.push({ id: `side-${SIDE[q.s]!.id}-${q.stage}-${q.k}-early`, d, text: q.p.early[0], sub: q.p.early[1], hold: 0, i: -1, at: q.p.at, y: q.p.y });
  }
  return out;
}

/**
 * The HUD's one quiet line: the found, unfinished story whose next place is nearest (a place in an open zone first).
 * Null when nothing is found or all are finished.
 */
export function sideRow(side: readonly number[], x: number, z: number, open: (z: ZaryaZone) => boolean): { id: string; title: string; detail: string; at: Spot; progress: number } | null {
  let best: { id: string; title: string; detail: string; at: Spot; progress: number } | null = null;
  let bestD = Infinity;
  SIDE.forEach((q, s) => {
    if (!sideFound(side, s) || sideDone(side, s)) return;
    const n = side[s]!;
    const stage = sideStage(n);
    const st = q.stages[stage]!;
    st.places.forEach((p, k) => {
      if ((sideBits(n) & (1 << k)) !== 0) return;
      const d = Math.hypot(p.at.x - x, p.at.z - z) + (open(p.zone) ? 0 : 10000);
      if (d >= bestD) return;
      bestD = d;
      const left = st.places.length > 1 ? `  ${countBits(sideBits(n))} OF ${st.places.length}` : '';
      best = { id: `side-${q.id}`, title: `${q.title}${left}`, detail: st.hint, at: p.at, progress: stage / q.stages.length };
    });
  });
  return best;
}

const countBits = (m: number): number => {
  let c = 0;
  for (let q = m; q; q &= q - 1) c++;
  return c;
};

/** What changed in one story between two states: the lines to say, the feed lines, and whether it has just been finished. */
export interface SideChange {
  s: number;
  lines: Line[];
  /** Places done that are pieces of a bigger stage ("2 OF 3"). */
  pieces: string[];
  found: boolean;
  finished: boolean;
}

export function sideChanges(a: readonly number[] | undefined, b: readonly number[] | undefined): SideChange[] {
  const out: SideChange[] = [];
  if (!b) return out;
  SIDE.forEach((q, s) => {
    const was = a?.[s] ?? 0;
    const now = b[s] ?? 0;
    if (now === was) return;
    const c: SideChange = { s, lines: [], pieces: [], found: was === 0 && now > 0, finished: !sideDone(a ?? [], s) && sideDone(b, s) };
    const s0 = sideStage(was);
    const s1 = Math.min(sideStage(now), q.stages.length);
    for (let stage = s0; stage <= Math.min(s1, q.stages.length - 1); stage++) {
      const st = q.stages[stage]!;
      const before = stage === s0 ? sideBits(was) : 0;
      const after = stage < s1 ? (1 << st.places.length) - 1 : sideBits(now);
      st.places.forEach((p, k) => {
        if ((after & ~before & (1 << k)) === 0) return;
        if (p.lines) c.lines.push(...p.lines);
        if (st.places.length > 1) c.pieces.push(`${p.verb.replace(/^PICK UP |^LOOK AT /, '')}  -  ${countBits(after)} OF ${st.places.length}`);
      });
      if (stage < s1) c.lines.push(...st.lines);
    }
    out.push(c);
  });
  return out;
}

/** What a finished story's reward is, in words (the banner). */
export function sideRewardWords(r: SideReward): string {
  const w: string[] = [];
  if (r.cash) w.push(`+$${r.cash}`);
  if (r.mod) w.push(r.mod === 1 ? '+1 MOD PART' : `+${r.mod} MOD PARTS`);
  if (r.ammo) w.push('AMMUNITION FOR EVERY GUN');
  if (r.armor) w.push('ARMOUR');
  return w.join('  ');
}

/** The journal: one section per story found, what has been learned, and the town's history once finished. */
export function sideJournal(side: readonly number[]): { head: string; rows: string[] }[] {
  const out: { head: string; rows: string[] }[] = [];
  SIDE.forEach((q, s) => {
    if (!sideFound(side, s)) return;
    const stage = Math.min(sideStage(side[s]!), q.stages.length);
    const rows = q.stages.slice(0, stage).map((st) => st.learn);
    const done = stage >= q.stages.length;
    if (!done) rows.push(`Next: ${q.stages[stage]!.hint.charAt(0).toLowerCase()}${q.stages[stage]!.hint.slice(1)}.`);
    else rows.push(q.history);
    out.push({ head: `${q.title}${done ? '  -  DONE' : ''}`, rows });
  });
  return out;
}
