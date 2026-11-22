/**
 * HIRASAKA's ten side stories (no THREE): small and apart from the main story, each found by noticing something in its
 * place, a few steps of its own, and its own payoff. Nobody gives orders: the squad notices and follows.
 *
 * The island's own logic: Kubo the barber left in a hurry and his scissors stayed on the post office's writing table;
 * the kiosk sold one ticket more than the last ferry carried (Genzō's, in the coat he left on the pier); the rooftop
 * kindergarten's fish pool silted up when the cistern was shut; the island's cats guard the bar mama's tin; the cinema's
 * last reel, shot on the island, never went on; the typhoon blew the children's farewell letters across the schoolyard;
 * Yama-no-kami still wants her ugly fish; the miner statues stand out of the dance's order; Genzō searched for Mio the
 * old way, with drums at dusk; and Mio never ate a grain below (the rice ball in her sleeve: ending 2).
 *
 * Rules (the main story's): nothing is timed, nothing can be failed or missed, every step stays done. A story shows on
 * the HUD only once found (its first step done), as one quiet line, and has its own part of the journal.
 *
 * How it is kept: one small number per story in the story's shared state (`StoryView.sides`, on the wire after every
 * older field), `stage * 16 + bits`: the stage the story is at and which places of it are done (a stage's places in any
 * order; most have one). A player asks for a place with the story's act `'sidep'` and an index `sideIndex(s, stage, k)`;
 * the story checks the step is the next one and the player stands in reach. A finished story also sets its bit in the
 * older `StoryView.side` (the rice ball's bit opens ending 2). The screen says the lines, pays the reward, draws the HUD
 * line and the journal (`sideRuntime.ts`); the things in the places are `sideModels.ts`'s. No import from `story.ts`.
 *
 * Lines are ids in `lines.ts` (the block marked "side stories"); every one of them is `fresh` until it is voiced.
 */
import type { Spot } from './places';

/** A thing drawn in a place (`sideModels.ts` `m`), standing on y (its surface) and turned by yaw (it faces +z at 0). */
export interface SideProp {
  m: string;
  x: number;
  y: number;
  z: number;
  yaw?: number;
}

/** What finishing a story gives: points (every player's own), ammunition (every player's own), a journal page. */
export interface SideReward {
  cash?: number;
  ammo?: true;
  /** A page for the journal (a still, a letter, a ticket): its words. */
  page?: string;
}

export interface SidePlace {
  /** Where the thing is (the prompt is in reach of it): its floor, and `y` the height the thing is at above it. */
  at: Spot;
  y: number;
  /** Reach (default `SIDE_REACH`): wider round a big thing (the fish pool). */
  r?: number;
  verb: string;
  sub?: string;
  /** Seconds to hold USE (0 a tap): never more than a second. */
  hold?: number;
  /** Drawn until this place is done (from the first moment: it was always there), and drawn once it is. */
  before?: readonly SideProp[];
  after?: readonly SideProp[];
  /** Seen before its step comes: a quiet note instead of a prompt (head, sub). */
  early?: readonly [string, string];
  /** Said when this place is done (line ids). */
  lines?: readonly string[];
}

export interface SideStage {
  /** The HUD line's detail while this stage is next (the first stage's is never shown: not found yet). */
  hint: string;
  places: readonly SidePlace[];
  /** Said when the whole stage is done. */
  lines: readonly string[];
  /** What the journal remembers of it, once done. */
  learn: string;
}

export interface SideStory {
  id: string;
  title: string;
  reward: SideReward;
  /** The payoff's banner subtitle (the reward is added to it). */
  done: string;
  /** A piece of the island's history: the journal's last line, once the story is finished. */
  history: string;
  /** Things that stand in the story's places all along. */
  props?: readonly SideProp[];
  stages: readonly SideStage[];
}

const P = (x: number, y: number, z: number): Spot => ({ x, y, z });
const TOWN = 3.6;
const TERRACE = 7.2;
const LANDING = 10.8;
const TOP = 21.6;
const DEEP = 9;

/** The miner statues on the hospital forecourt round (-90, 7.2, 0) (`hirasakaBlocks.ts`), and the lamp before each. */
const TANKO_C = { x: -90, z: 0 };
const STATUE = { shovel: [-90, 4.2], lift: [-86.5, 2.2], shade: [-88, 3.6], push: [-93.5, 2.2], bow: [-92, 3.6] } as const;
const lampAt = (k: keyof typeof STATUE): Spot => {
  const [sx, sz] = STATUE[k];
  const dx = TANKO_C.x - sx;
  const dz = TANKO_C.z - sz;
  const d = Math.hypot(dx, dz);
  return P(sx + (dx / d) * 0.95, TERRACE, sz + (dz / d) * 0.95);
};
const lampYaw = (k: keyof typeof STATUE): number => Math.atan2(TANKO_C.x - STATUE[k][0], TANKO_C.z - STATUE[k][1]);
const tankoStage = (k: keyof typeof STATUE, n: number, name: string, pose: string, hint: string, lines: readonly string[] = []): SideStage => {
  const at = lampAt(k);
  return {
    hint,
    places: [{ at, y: 0, verb: `LIGHT A LAMP: ${name}`, sub: `The ${['first', 'second', 'third', 'fourth', 'fifth'][n]} move of the dance`, hold: 0.5, after: [{ m: 'capLamp', x: at.x, y: at.y, z: at.z, yaw: lampYaw(k) }], early: [`A MINER, ${pose}`, 'The dance has its order: not yet'] }],
    lines,
    learn: `The ${['first', 'second', 'third', 'fourth', 'fifth'][n]} lamp: ${name.toLowerCase()}.`,
  };
};

/** The drums' three places, where the dark comes first: the shaft head, the old adit's mouth, the school roof. */
const DRUM_AT = [P(121.4, 0, 13.6), P(77.6, 0, -15.2), P(-76, TOP, -58)] as const;

/** The children's four letters across the schoolyard. */
const LETTER_AT = [P(-49.4, TERRACE, -26.5), P(-43.8, TERRACE, -30.4), P(-55.1, TERRACE, -23.1), P(-74.5, TERRACE, -21.2)] as const;

export const SIDE: readonly SideStory[] = [
  // ---- 0. Block 31: the barber's scissors ----
  {
    id: 'barber',
    title: "THE BARBER'S SCISSORS",
    reward: { cash: 300 },
    done: 'Back on their hook, in the shape the dust kept.',
    history: "Block 31's barber cut hair in the low wing beside the post office from 1957 to the last week: two chairs, and one pair of scissors nobody else was allowed to touch.",
    props: [{ m: 'barberKit', x: 27.4, y: 0.85, z: 40.02, yaw: 0 }],
    stages: [
      {
        hint: '',
        places: [{ at: P(28.25, 0, 40.7), y: 1.6, verb: 'LOOK AT THE EMPTY HOOK', sub: 'Between the mirrors' }],
        lines: ['nat_sd_barber1', 'dg_sd_barber2'],
        learn: "Kubo the barber's scissors are gone from their hook. The dust on the wall still holds their shape.",
      },
      {
        hint: 'Somewhere else in Block 31',
        places: [{ at: P(36.6, 0, 48.0), y: 0.9, verb: 'TAKE THE SCISSORS', sub: 'On the writing table, by a postcard', before: [{ m: 'scissors', x: 36.4, y: 0.9, z: 48.55, yaw: 0.4 }, { m: 'postcard', x: 36.95, y: 0.9, z: 48.6, yaw: -0.2 }], early: ['A PAIR OF SCISSORS', 'On the writing table, by an unfinished postcard'] }],
        lines: ['nat_sd_barber3', 'dg_sd_barber4'],
        learn: "They were on the post office's writing table, beside a postcard to the mainland he never finished.",
      },
      {
        hint: "Back to the barber's: the empty hook",
        places: [{ at: P(28.25, 0, 40.7), y: 1.6, verb: 'HANG THEM ON THEIR HOOK', hold: 0.6, after: [{ m: 'scissorsHung', x: 28.25, y: 1.5, z: 39.84, yaw: 0 }] }],
        lines: ['nat_sd_barber5', 'dg_sd_barber6'],
        learn: 'The scissors hang on their hook again.',
      },
    ],
  },
  // ---- 1. the pier: the last ferry ----
  {
    id: 'ferry',
    title: 'THE LAST FERRY',
    reward: { cash: 250, page: "A ferry ticket, Hirasaka to Nagasaki, Saturday 20 April 1974, the 16:00 sailing. Bought by Genzō Hirata, lamp 211. Clipped in 2026." },
    done: 'Clipped, fifty-two years late.',
    history: 'The last scheduled ferry left Dolphin Pier on 20 April 1974. The kiosk sold one ticket more than it carried.',
    props: [{ m: 'timetable', x: 21.45, y: 1.05, z: 61.35, yaw: -Math.PI / 2 }],
    stages: [
      {
        hint: '',
        places: [{ at: P(20.6, 0, 60.8), y: 1.3, verb: 'READ THE TIMETABLE', sub: 'Beside the kiosk window, never rubbed out' }],
        lines: ['nat_sd_ferry1', 'dg_sd_ferry2'],
        learn: "The kiosk's board stops at the last sailing, 20 April 1974. One ticket in the book was paid for and never clipped.",
      },
      {
        hint: 'Down the pier',
        places: [{ at: P(16.1, 0, 80.9), y: 0.5, verb: 'SEARCH THE COAT', sub: 'Folded over a bollard', before: [{ m: 'coat', x: 16.9, y: 0.53, z: 80, yaw: 0 }], after: [{ m: 'coatOpen', x: 16.9, y: 0.53, z: 80, yaw: 0 }], early: ['A COAT ON A BOLLARD', 'A work coat, folded, soaked through'] }],
        lines: ['dg_sd_ferry3', 'nat_sd_ferry4'],
        learn: "Genzō's work coat was folded over a bollard on the pier, the ticket still in its pocket. He bought it, walked down, and stayed.",
      },
      {
        hint: 'Back to the ticket kiosk',
        places: [{ at: P(20.6, 0, 60.8), y: 1.3, verb: 'CLIP THE TICKET', sub: 'The clippers still hang in the window', hold: 0.6, after: [{ m: 'ticket', x: 21.42, y: 1.02, z: 59.5, yaw: -Math.PI / 2 }] }],
        lines: ['dg_sd_ferry5'],
        learn: 'Daigo clipped the ticket at the kiosk window.',
      },
    ],
  },
  // ---- 2. Block 65's roof: the fish pool ----
  {
    id: 'fishpool',
    title: 'THE FISH POOL',
    reward: { cash: 400 },
    done: 'Full again, over forty-one painted fish.',
    history: "Block 65's roof held the island's kindergarten: a slide, a sandbox and a fish pool nine floors above the sea, because there was no ground to spare.",
    props: [{ m: 'feedTin', x: -114.55, y: TOP + 0.59, z: -51.5, yaw: 0.6 }],
    stages: [
      {
        hint: '',
        places: [{ at: P(-116.5, TOP, -51), y: 0.6, r: 3.3, verb: 'LOOK IN THE POOL', sub: 'Silted to the brim, a tin on the rim' }],
        lines: ['nat_sd_pool1', 'dg_sd_pool2'],
        learn: 'The rooftop kindergarten kept a fish pool, a fish for every child. It is silt now. Its pipe comes up from the cistern in the back lane.',
      },
      {
        hint: 'The cistern, in the back lane behind Block 65',
        places: [
          {
            at: P(-134.6, TERRACE, -66.9),
            y: 0.95,
            verb: 'OPEN THE CISTERN VALVE',
            sub: 'Rusted, but it turns',
            hold: 0.8,
            before: [{ m: 'valveShut', x: -134.8, y: TERRACE, z: -67.1, yaw: 0 }, { m: 'silt', x: -116.5, y: TOP + 0.6, z: -51 }],
            after: [{ m: 'valveOpen', x: -134.8, y: TERRACE, z: -67.1, yaw: 0 }, { m: 'poolClear', x: -116.5, y: TOP + 0.6, z: -51 }],
            early: ['A CISTERN VALVE', 'The tank on its stand, a pipe up the wall to the roof'],
          },
        ],
        lines: ['dg_sd_pool3', 'nat_sd_pool4'],
        learn: "The cistern still held fifty years of rain. Its valve opened, and the pipe filled the roof's pool.",
      },
      {
        hint: "Back up to the fish pool on Block 65's roof",
        places: [{ at: P(-116.5, TOP, -51), y: 0.6, r: 3.3, verb: 'LOOK INTO THE CLEAR WATER', sub: 'Something painted on the floor' }],
        lines: ['nat_sd_pool5', 'dg_sd_pool6'],
        learn: 'Under the clear water the floor is painted with fish: forty-one, each child its own.',
      },
    ],
  },
  // ---- 3. Nikkyū Row: the cats ----
  {
    id: 'cats',
    title: 'THE CATS',
    reward: { cash: 600 },
    done: "The bar mama's tin, and four warm kittens.",
    history: "Hirasaka's cats outlived its people. Boats from the mainland still put in under the seawall to feed them.",
    stages: [
      {
        hint: '',
        places: [{ at: P(-138.9, 0, 39.1), y: 0.1, verb: 'CROUCH BY THE CAT', sub: 'A ginger cat by an empty saucer', before: [{ m: 'catGinger', x: -139.3, y: 0, z: 39.4, yaw: 0.8 }] }],
        lines: ['nat_sd_cats1', 'dg_sd_cats2'],
        learn: "The island's last cats live on, fed from the fishing boats. A ginger one by the lane's saucer wanted to be followed.",
      },
      {
        hint: 'Through the passage in the rock row',
        places: [{ at: P(-124.4, 0, 23.5), y: 0.1, verb: 'FOLLOW THE TABBY', sub: 'It waits, then walks on', before: [{ m: 'catTabby', x: -123.6, y: 0, z: 23.3, yaw: -1.6 }], early: ['A TABBY, WATCHING', 'It waits for someone'] }],
        lines: ['dg_sd_cats3', 'nat_sd_cats4'],
        learn: 'A tabby waited in the passage through the rock row and led on into the back alley.',
      },
      {
        hint: 'The back alley behind the rock row',
        places: [
          {
            at: P(-111.6, 0, 25.4),
            y: 0.15,
            verb: 'LOOK BEHIND THE HANDCART',
            sub: 'Something small and warm',
            before: [{ m: 'kittensTin', x: -111.5, y: 0, z: 25.6, yaw: Math.PI / 2 }],
            after: [{ m: 'kittensOpen', x: -111.5, y: 0, z: 25.6, yaw: Math.PI / 2 }],
            early: ['A HANDCART', 'Something moves behind it'],
          },
        ],
        lines: ['nat_sd_cats5', 'dg_sd_cats6'],
        learn: "Behind the handcart: four kittens asleep on the bar mama's savings tin.",
      },
    ],
  },
  // ---- 4. Market Lane: the Shōwa-kan's last reel ----
  {
    id: 'reel',
    title: 'THE LAST REEL',
    reward: { cash: 500, page: "A still from the Shōwa-kan's last reel: the school roof at the Obon dance, 1974, the whole island in a ring. By the drum, Genzō, and the girl beside him is Mio." },
    done: 'The last thing the island watched was itself.',
    history: "The Shōwa-kan showed films on Market Lane from 1955. On its last night the projectionist ran a reel the islanders had shot themselves.",
    stages: [
      {
        hint: '',
        places: [{ at: P(-4, TOWN, 28.6), y: 1.0, verb: 'LOOK AT THE PROJECTOR', sub: 'Threaded with nothing' }],
        lines: ['nat_sd_reel1', 'dg_sd_reel2'],
        learn: "The Shōwa-kan's projector stopped before its last reel.",
      },
      {
        hint: 'Somewhere in the Shōwa-kan',
        places: [{ at: P(10.6, TOWN, 31.6), y: 1.05, verb: 'TAKE THE FILM CAN', sub: 'In the ticket window, packed for the boat', before: [{ m: 'filmCan', x: 11.15, y: TOWN + 1.05, z: 31.7, yaw: 0.3 }], early: ['A FILM CAN', 'In the ticket window, labelled by hand'] }],
        lines: ['dg_sd_reel3', 'nat_sd_reel4'],
        learn: 'The last reel was packed in the ticket window to go back on the boat. It was shot on the island.',
      },
      {
        hint: 'The projector, in the projection room',
        places: [{ at: P(-4, TOWN, 28.6), y: 1.0, verb: 'THREAD THE LAST REEL', hold: 0.8, after: [{ m: 'reelOn', x: -4, y: TOWN + 1.0, z: 27.75, yaw: 0 }, { m: 'screenFilm', x: 2.75, y: TOWN + 1.5, z: 15.79, yaw: 0 }] }],
        lines: ['nat_sd_reel5'],
        learn: 'The last reel is threaded and running.',
      },
      {
        hint: 'The stalls, before the screen',
        places: [{ at: P(2.75, TOWN, 18.3), y: 1.4, r: 3, verb: 'WATCH THE SCREEN' }],
        lines: ['nat_sd_reel6', 'dg_sd_reel7'],
        learn: 'On the screen: the school roof at the Obon dance in 1974. Genzō by the drum, and Mio beside him.',
      },
    ],
  },
  // ---- 5. the school: the sayonara letters ----
  {
    id: 'letters',
    title: 'SAYONARA LETTERS',
    reward: { cash: 300, page: 'The children\'s letters to the island, 1974: to the sea, to the roof, to fish number eleven, to the school. "When I am grown up I will come back and open you again."' },
    done: 'Every letter back in the box.',
    history: 'When the school closed, the children wrote to the island. On the last day they spelled out goodbye across the yard with their own bodies, for a photograph taken from the air.',
    stages: [
      {
        hint: '',
        places: [{ at: P(-70, TERRACE, -30.5), y: 0.72, verb: 'LOOK AT THE LETTERS', sub: 'A box on the table, nearly empty' }],
        lines: ['nat_sd_letters1', 'dg_sd_letters2'],
        learn: "The children wrote farewell letters for the school's closing. The typhoon had the gym's door open and blew most of them away.",
      },
      {
        hint: 'Across the schoolyard',
        places: LETTER_AT.map((at, k) => ({
          at,
          y: 0.02,
          verb: 'PICK UP THE LETTER',
          sub: 'A child\'s writing, rained on',
          before: [{ m: 'letter', x: at.x, y: at.y, z: at.z, yaw: k * 1.7 }],
          early: ['A LETTER IN THE RAIN', 'A child\'s writing'] as const,
          lines: [`nat_sd_letter${'abcd'[k]}`],
        })),
        lines: ['dg_sd_letters3'],
        learn: 'Four letters had blown across the yard: to the island, to the roof, to a fish, to the school.',
      },
      {
        hint: 'The letters box, in the gym',
        places: [{ at: P(-70, TERRACE, -30.5), y: 0.72, verb: 'PUT THEM BACK IN THE BOX', hold: 0.6, before: [{ m: 'letterBox', x: -70.2, y: TERRACE + 0.72, z: -31.3, yaw: 0 }], after: [{ m: 'letterBoxFull', x: -70.2, y: TERRACE + 0.72, z: -31.3, yaw: 0 }] }],
        lines: ['nat_sd_letters4'],
        learn: 'The letters are back in their box on the table.',
      },
    ],
  },
  // ---- 6. the pithead: okoze for Yama-no-kami ----
  {
    id: 'okoze',
    title: 'OKOZE',
    reward: { cash: 200, ammo: true },
    done: 'She laughed. The roof will hold.',
    history: "Mines all over Japan kept a shrine to the mountain's goddess. Hirasaka's miners brought her a dried okoze each month, and no shift went down without bowing.",
    props: [{ m: 'dish', x: 110.75, y: 0.5, z: 47.5, yaw: 0 }],
    stages: [
      {
        hint: '',
        places: [{ at: P(110.75, 0, 48.6), y: 0.5, verb: 'LOOK AT THE OFFERING DISH', sub: 'Empty, before the mine shrine' }],
        lines: ['dg_sd_okoze1', 'nat_sd_okoze2', 'dg_sd_okoze3'],
        learn: "The miners gave Yama-no-kami, the mountain's goddess, an okoze each month: something uglier than her, so she would laugh and keep the roof up.",
      },
      {
        hint: 'The fish-drying racks on Shio-furi Street',
        places: [{ at: P(-45.95, 0, 65.9), y: 1.1, verb: 'TAKE THE OKOZE', sub: 'Kept back on the rack, for the shrine', before: [{ m: 'okozeHung', x: -45.95, y: 1.3, z: 66.8, yaw: 0 }], early: ['AN UGLY FISH, DRYING', 'All spines and warts'] }],
        lines: ['nat_sd_okoze4', 'dg_sd_okoze5'],
        learn: 'A dried okoze still hung on a Shio-furi drying rack, kept back for the shrine.',
      },
      {
        hint: 'The mine shrine, at the pithead',
        places: [{ at: P(110.75, 0, 48.6), y: 0.5, verb: 'OFFER THE OKOZE', hold: 0.8, after: [{ m: 'okozeDish', x: 110.75, y: 0.52, z: 47.5, yaw: 0 }] }],
        lines: ['dg_sd_okoze6', 'nat_sd_okoze7'],
        learn: 'The okoze lies on her dish.',
      },
    ],
  },
  // ---- 7. the hospital forecourt: tankō-bushi ----
  {
    id: 'tanko',
    title: 'TANKŌ-BUSHI',
    reward: { cash: 500 },
    done: 'Five lamps, in the order of the dance.',
    history: "Tankō-bushi began as the coal miners' work song of Kyushu and became the dance of every Obon in Japan. Its moves are the shift itself: dig, lift, look to the light, push the tub, bow.",
    props: [{ m: 'plaque', x: -90.4, y: TERRACE, z: -1.4, yaw: Math.PI }],
    stages: [
      {
        hint: '',
        places: [{ at: P(-90.4, TERRACE, -1.4), y: 0.05, verb: 'LOOK AT THE FALLEN PLATE', sub: 'Five little miners in bronze' }],
        lines: ['dg_sd_tanko1', 'nat_sd_tanko2'],
        learn: 'The plate shows the miners\' dance in five moves: dig with the shovel, lift, shade the eyes, push the tub, bow. The statues stand out of order.',
      },
      tankoStage('shovel', 0, 'THE SHOVEL', 'DIGGING', 'The miner with the shovel'),
      tankoStage('lift', 1, 'THE LIFT', 'LIFTING', 'The one who lifts'),
      tankoStage('shade', 2, 'SHADING THE EYES', 'SHADING HIS EYES', 'The one shading his eyes'),
      tankoStage('push', 3, 'THE PUSH', 'PUSHING', 'The one pushing'),
      tankoStage('bow', 4, 'THE BOW', 'BOWING', 'The one bowing', ['dg_sd_tanko3', 'nat_sd_tanko4']),
    ],
  },
  // ---- 8. the Hell Stairs landing: drums for Mio ----
  {
    id: 'drums',
    title: 'DRUMS FOR MIO',
    reward: { cash: 400 },
    done: 'She answered.',
    history: 'Kamikakushi: a child hidden by the mountain. At dusk the village searched with drums, gongs and the bottoms of wooden rice measures, calling the name and crying for the child to be given back.',
    stages: [
      {
        hint: '',
        places: [{ at: P(0.6, LANDING, -15.4), y: 0.2, verb: 'TAKE THE HAND DRUM', sub: 'A small drum and a cassette, by the big one', before: [{ m: 'handDrum', x: 0.5, y: LANDING, z: -16.2, yaw: 0.3 }, { m: 'recorder', x: 1.1, y: LANDING, z: -16.4, yaw: -0.4 }] }],
        lines: ['tape_sd_drums', 'dg_sd_drums1'],
        learn: 'Genzō searched for Mio the old way: a drum beaten at dusk where the dark comes first, and her name called. He asked for it to be tried again.',
      },
      {
        hint: 'Where the dark comes first: the shaft head, the old adit, the school roof',
        places: DRUM_AT.map((at, k) => ({
          at,
          y: 0.2,
          verb: 'BEAT THE DRUM AND CALL HER NAME',
          sub: ['The shaft head', "The old adit's mouth", 'The school roof'][k]!,
          hold: 0.8,
          after: [{ m: 'lantern', x: at.x, y: at.y, z: at.z, yaw: k }],
          early: ['A PLACE THE DARK COMES FIRST', ['The shaft head', "The old adit's mouth", 'The school roof'][k]!] as const,
          lines: [['dg_sd_call1', 'nat_sd_call2', 'dg_sd_call3'][k]!],
        })),
        lines: ['mio_sd_answer', 'dg_sd_drums2', 'nat_sd_drums3'],
        learn: 'At the shaft head, the old adit and the school roof the drum was beaten and her name called. The third time, she answered.',
      },
    ],
  },
  // ---- 9. the Old Village: the rice ball (ending 2) ----
  {
    id: 'riceball',
    title: 'THE RICE BALL',
    reward: { cash: 250 },
    done: 'She never ate a thing down here.',
    history: 'Yomotsuhegui: whoever eats at the hearth of the dead belongs to them. Mio kept her rice ball for the night shift and never unwrapped it.',
    props: [{ m: 'trayFull', x: 501.2, y: DEEP, z: -55.6, yaw: 0.2 }],
    stages: [
      {
        hint: '',
        places: [{ at: P(501, DEEP, -55.4), y: 0.1, verb: 'LOOK AT THE TRAY', sub: 'A meal laid for one' }],
        lines: ['nat_sd_rice1', 'dg_sd_rice2'],
        learn: "In Mio's house a meal was laid for one, and never touched.",
      },
      {
        hint: 'Her kimono, on its stand',
        places: [{ at: P(498.6, DEEP, -59.3), y: 0.45, verb: "LOOK IN MIO'S SLEEVE", sub: 'Something wrapped in cloth', hold: 0.6, before: [{ m: 'riceWrapped', x: 498.9, y: DEEP + 0.36, z: -60.1, yaw: 0 }], after: [{ m: 'riceOpen', x: 498.9, y: DEEP + 0.36, z: -60.1, yaw: 0 }], early: ['HER KIMONO', 'Peach and indigo, one sleeve hanging low'] }],
        lines: ['nat_rice', 'dg_sd_rice3'],
        learn: 'The rice ball was still wrapped in her sleeve. Mio never ate anything down here.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// the state: one number per story, `stage * 16 + bits`
// ---------------------------------------------------------------------------------------------

/** How near a player must stand to a place to use it. */
export const SIDE_REACH = 2.6;

export const sideEmpty = (): number[] => SIDE.map(() => 0);
export const sideStage = (n: number): number => n >> 4;
export const sideBits = (n: number): number => n & 15;
export const sideFound = (sides: readonly number[], s: number): boolean => (sides[s] ?? 0) > 0;
export const sideDone = (sides: readonly number[], s: number): boolean => !!SIDE[s] && sideStage(sides[s] ?? 0) >= SIDE[s]!.stages.length;
/** A finished story's number. */
export const sideFinished = (s: number): number => (SIDE[s]?.stages.length ?? 0) * 16;
/** The act's index for place `k` of stage `stage` of story `s`, and back. */
export const sideIndex = (s: number, stage: number, k: number): number => s * 64 + stage * 8 + k;
export const sideOf = (i: number): { s: number; stage: number; k: number } => ({ s: Math.floor(i / 64), stage: Math.floor(i / 8) % 8, k: i % 8 });
/** A sides row from the wire, the right length (a row from before the side stories decodes with none begun). */
export const sideFrom = (r: readonly number[]): number[] => SIDE.map((_, s) => (Number.isInteger(r[s]) && r[s]! >= 0 ? r[s]! : 0));

/** The place an act's index names, or null. */
export function sidePlace(i: number): SidePlace | null {
  if (!Number.isInteger(i) || i < 0) return null;
  const { s, stage, k } = sideOf(i);
  return SIDE[s]?.stages[stage]?.places[k] ?? null;
}

/** Whether place `i` may be done now: its story is at its stage and it is not done yet (the story adds the reach). */
export function sideCan(sides: readonly number[], i: number): boolean {
  const p = sidePlace(i);
  if (!p) return false;
  const { s, stage, k } = sideOf(i);
  const n = sides[s] ?? 0;
  return sideStage(n) === stage && (sideBits(n) & (1 << k)) === 0;
}

/** Place `i` done: the story's new number (the stage moves on once all its places are done). */
export function sideNext(sides: readonly number[], i: number): number {
  const { s, stage, k } = sideOf(i);
  const st = SIDE[s]!.stages[stage]!;
  const bits = sideBits(sides[s] ?? 0) | (1 << k);
  return bits === (1 << st.places.length) - 1 ? (stage + 1) * 16 : stage * 16 + bits;
}

/** Place `k` of stage `stage` of story `s` is done. */
export function sidePlaceDone(sides: readonly number[], s: number, stage: number, k: number): boolean {
  const n = sides[s] ?? 0;
  const at = sideStage(n);
  return at > stage || (at === stage && (sideBits(n) & (1 << k)) !== 0);
}

/** Every place of every story, in order. */
export const SIDE_PLACES: readonly { s: number; stage: number; k: number; p: SidePlace; i: number }[] = SIDE.flatMap((q, s) => q.stages.flatMap((st, stage) => st.places.map((p, k) => ({ s, stage, k, p, i: sideIndex(s, stage, k) }))));

/** Every thing drawn, in a fixed order: each story's props, then each place's `before` and `after` (`sideModels.ts`). */
export interface SideThing extends SideProp {
  key: string;
  /** Whose: the story, and the place (-1: always there). */
  s: number;
  j: number;
  when: 'always' | 'before' | 'after';
}
export const SIDE_THINGS: readonly SideThing[] = [
  ...SIDE.flatMap((q, s) => (q.props ?? []).map((p, n) => ({ ...p, key: `${q.id}:prop${n}`, s, j: -1, when: 'always' as const }))),
  ...SIDE_PLACES.flatMap((q, j) => [
    ...(q.p.before ?? []).map((p, n) => ({ ...p, key: `${SIDE[q.s]!.id}:${q.stage}.${q.k}:b${n}`, s: q.s, j, when: 'before' as const })),
    ...(q.p.after ?? []).map((p, n) => ({ ...p, key: `${SIDE[q.s]!.id}:${q.stage}.${q.k}:a${n}`, s: q.s, j, when: 'after' as const })),
  ]),
];

/** Which of `SIDE_THINGS` is drawn now (`live`: the run has begun). */
export function sideShown(sides: readonly number[], live = true): boolean[] {
  return SIDE_THINGS.map((t) => {
    if (!live) return false;
    if (t.when === 'always') return true;
    const q = SIDE_PLACES[t.j]!;
    const done = sidePlaceDone(sides, q.s, q.stage, q.k);
    return t.when === 'before' ? !done : done;
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
  /** The act's index ('sidep'); -1: a note, nothing to do. */
  i: number;
  at: Spot;
}

/** The prompts in reach of (x, y, z): every place that may be done now, and a note at a place whose step has not come. */
export function sidePrompts(sides: readonly number[], x: number, y: number, z: number): SidePrompt[] {
  const out: SidePrompt[] = [];
  for (const q of SIDE_PLACES) {
    const d = Math.hypot(q.p.at.x - x, q.p.at.z - z);
    if (d > (q.p.r ?? SIDE_REACH) || Math.abs(q.p.at.y - y) > 2.2) continue;
    if (sideCan(sides, q.i)) {
      out.push({ id: `side-${SIDE[q.s]!.id}-${q.stage}-${q.k}`, d, text: q.p.verb, sub: q.p.sub, hold: q.p.hold ?? 0, i: q.i, at: q.p.at });
      continue;
    }
    if (q.p.early && sideStage(sides[q.s] ?? 0) < q.stage) out.push({ id: `side-${SIDE[q.s]!.id}-${q.stage}-${q.k}-early`, d, text: q.p.early[0], sub: q.p.early[1], hold: 0, i: -1, at: q.p.at });
  }
  return out;
}

const countBits = (m: number): number => {
  let c = 0;
  for (let q = m; q; q &= q - 1) c++;
  return c;
};

/** The HUD's quiet line: the found, unfinished story whose next place is nearest (on the same side of the water first). */
export function sideRow(sides: readonly number[], x: number, z: number, here: (at: Spot) => boolean): { id: string; title: string; detail: string; at: Spot; progress: number } | null {
  let best: { id: string; title: string; detail: string; at: Spot; progress: number } | null = null;
  let bestD = Infinity;
  SIDE.forEach((q, s) => {
    if (!sideFound(sides, s) || sideDone(sides, s)) return;
    const n = sides[s]!;
    const stage = sideStage(n);
    const st = q.stages[stage]!;
    st.places.forEach((p, k) => {
      if ((sideBits(n) & (1 << k)) !== 0) return;
      const d = Math.hypot(p.at.x - x, p.at.z - z) + (here(p.at) ? 0 : 10000);
      if (d >= bestD) return;
      bestD = d;
      const left = st.places.length > 1 ? `  ${countBits(sideBits(n))} OF ${st.places.length}` : '';
      best = { id: `side-${q.id}`, title: `${q.title}${left}`, detail: st.hint, at: p.at, progress: stage / q.stages.length };
    });
  });
  return best;
}

/** What changed in one story between two states: the lines to say, the pieces done, found, finished. */
export interface SideChange {
  s: number;
  lines: string[];
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
        if (st.places.length > 1) c.pieces.push(`${q.title}  -  ${countBits(after)} OF ${st.places.length}`);
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
  if (r.ammo) w.push('AMMUNITION FOR EVERY GUN');
  if (r.page) w.push('A PAGE IN THE JOURNAL');
  return w.join('  ');
}

/** The journal: one part per story found, what has been learned, the page, and the island's history once finished. */
export function sideJournal(sides: readonly number[]): { head: string; rows: string[]; page?: string }[] {
  const out: { head: string; rows: string[]; page?: string }[] = [];
  SIDE.forEach((q, s) => {
    if (!sideFound(sides, s)) return;
    const stage = Math.min(sideStage(sides[s]!), q.stages.length);
    const rows = q.stages.slice(0, stage).map((st) => st.learn);
    const done = stage >= q.stages.length;
    if (!done) rows.push(`Next: ${q.stages[stage]!.hint.charAt(0).toLowerCase()}${q.stages[stage]!.hint.slice(1)}.`);
    else rows.push(q.history);
    out.push({ head: `${q.title}${done ? '  -  DONE' : ''}`, rows, ...(done && q.reward.page ? { page: q.reward.page } : {}) });
  });
  return out;
}
