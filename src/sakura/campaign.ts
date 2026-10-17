/**
 * KAIKA: THE BLOOMING - the Sakura District's whole story in one run, and the story told on every run.
 *
 * The campaign is a path through what the district already has: the shrine's five charms are scattered one to a
 * corner of Sakuragi (the metro, the school, the arcade, the canal, the lab), the Court holds the freight yard and the
 * theatre, the Empress waits on her stage, and the Thousand Lanterns end it. Each chapter is decided by state every
 * player already shares (the quest's view, the two contracts, the extraction), so a co-op run moves through it
 * together with nothing new on the wire but one bit for "someone reached the checkpoint" (`QuestView.marks`).
 *
 * Also here, for every Sakura run: the outbreak's story (the field file in the pause menu), what each kind of infected
 * is and why it is where it is (a card the first time you see one), and the transmissions you hear the first time you
 * walk into each part of the district - Aoi Kisaragi's voice on the shrine relay, and Hana and Yuzu. Pure data and
 * rules (no THREE, no DOM): the co-op simulation reads it too.
 */
import type { ZombieManager } from '../enemies/zombieManager';
import type { ZombieVariant } from '../enemies/variants';
import type { Rng } from '../logic/rng';
import type { Level } from '../world/level';
import { ZONES } from '../world/layout/sakura/consts';
import { LANTERN_SIGNS, type QuestSpots, type QuestView } from './quest';

export type Speaker = 'AOI' | 'HANA' | 'YUZU';
export type Line = readonly [Speaker, string];

// ---------------------------------------------------------------------------------------------
// the outbreak
// ---------------------------------------------------------------------------------------------

/** How it began: the field file's first page. */
export const OUTBREAK: readonly { title: string; text: string }[] = [
  {
    title: 'THE TREE',
    text: 'Sakuragi Shrine kept a cherry tree older than the city. It flowered every spring for a thousand years, and every spring the shrine held the Thousand Lanterns - the night the dead of the year were seen home. The Kisaragi family kept the tree and the festival. The last of them was Aoi.',
  },
  {
    title: 'PROJECT KAIKA',
    text: 'Kurenai Pharmaceuticals had its research floor under the family theatre. Their longevity trial was grown from the sacred tree\'s sap - taken at night, after the shrine refused. They called it KAIKA: blooming. Their first patient was the chairman\'s daughter, Sayo Kurenai, an actress, twenty-four, and dying.',
  },
  {
    title: 'KS-01',
    text: 'Day 1, she could smell the cherry trees through the ceiling. Day 3, petals in her lungs. Day 5, she was stronger than the restraints. Day 6, the lab failed, and the pagoda vents carried it up into the spring air. The papers called it kaika-byou, the blooming. The turned do not rot, and wherever they lie down, the trees flower out of season.',
  },
  {
    title: 'THE FALL',
    text: 'The ward tried everything. An evacuation point at the station: the trains stopped coming. The army\'s checkpoint at the freight yard: three trains out, then none. The school barricades: the last helicopter left the sports field full. A camp in the canal park. A radio. Every attempt failed in its own way. The people who stayed at the theatre made a goddess of Sayo, and called themselves her Court.',
  },
  {
    title: 'THE RITE',
    text: 'Aoi knew what had been taken could be given back. Five charms blessed at the tree, tied to it again; the five great lanterns lit in the order of the festival poem; the bell rung while the shrine\'s voice speaks. She gave the charms to people she wanted to keep safe, and she did not live to bring them home. Seven springs later, last night, the shrine relay began transmitting on its own. It is her voice.',
  },
];

// ---------------------------------------------------------------------------------------------
// the infected, kind by kind
// ---------------------------------------------------------------------------------------------

export type FieldKind = Exclude<ZombieVariant, ''>;

export interface FieldEntry {
  name: string;
  /** One line under the name. */
  tag: string;
  look: string;
  does: string;
  /** Why it is here, of all places. */
  why: string;
  /** What the squad says the first time they see one. */
  quip: Line;
}

export const FIELD: Record<FieldKind, FieldEntry> = {
  commuter: {
    name: 'COMMUTER',
    tag: 'Still on the way to work.',
    look: 'A suit or a uniform, a case still in hand, eyes gone milky.',
    does: 'Keeps the routine it died in, pacing the platforms. Half blind: walk past slowly and it never looks up. Sprint or shoot and it remembers you.',
    why: 'Four hundred people waited on the platforms for the 21:47. They are still waiting.',
    quip: ['YUZU', 'They\'re still queueing for the train. Walk, don\'t run.'],
  },
  bloomed: {
    name: 'BLOOMED',
    tag: 'Full of blossom.',
    look: 'Pink under the skin. Flowers break through the shoulders and the hair.',
    does: 'Kill one and it bursts into a cloud of petals that burns your lungs. Shoot them from a distance.',
    why: 'The blooming taken as far as it goes. They gather where the trees are thickest.',
    quip: ['HANA', 'Flowers growing out of her. Don\'t be close when she pops.'],
  },
  rooted: {
    name: 'ROOTED',
    tag: 'Under the petals.',
    look: 'Mud and bark, roots grown through the legs and the back.',
    does: 'Lies in the drifts of petals looking long dead, until you are a few steps away. Then it comes up running.',
    why: 'The families in the canal park and the children on the school field lay down under the trees. The trees grew into them.',
    quip: ['YUZU', 'That one was lying in the petals. Watch the drifts.'],
  },
  kuchisake: {
    name: 'KUCHISAKE',
    tag: 'Am I pretty?',
    look: 'A pale woman in a long red coat, a surgical mask, a pair of shears.',
    does: 'Finds you, and follows you everywhere. She cannot move while you look at her; look away and she comes closer. Up close she kills. She takes a lot of killing.',
    why: 'A story the city told its children long before the fall. The blooming gave it a body.',
    quip: ['HANA', 'The masked woman. Keep your eyes on her - she only moves when nobody looks.'],
  },
  jorogumo: {
    name: 'JOROGUMO',
    tag: 'On the ceiling.',
    look: 'A black dress, violet eyes, eight legs from her back.',
    does: 'Under the ground she hunts upside down from the tunnel roof, and drops on whoever passes beneath.',
    why: 'The lab\'s second trial, and what got out of it. She keeps to the dark under the city.',
    quip: ['YUZU', 'Legs. So many legs. Look up in the tunnels.'],
  },
  miko: {
    name: 'MIKO',
    tag: 'She calls them.',
    look: 'White and red, the gohei in one hand, the kagura bells in the other.',
    does: 'When she sees you she screams, and every infected near her comes - with more behind them. Kill her first.',
    why: 'Aoi\'s sisters at the shrine. They stayed to keep the festival, and they still keep it.',
    quip: ['HANA', 'A shrine maiden. Drop her before she sings - she calls them.'],
  },
  idol: {
    name: 'IDOL',
    tag: 'Do not follow the voice.',
    look: 'The stage dress from the posters, the microphone, a star in her hair.',
    does: 'Sings. While her song is in your ears your legs are heavy. Find her and stop the song.',
    why: 'Mei Hoshino was singing at the arcade\'s karaoke the night it fell. She never stopped.',
    quip: ['YUZU', 'It\'s her, from the posters. Don\'t listen. Shoot.'],
  },
  oni: {
    name: 'ONI',
    tag: 'Huge, slow, terrible.',
    look: 'Red skin, horns, an iron club. Twice the size of a man.',
    does: 'Slow, three times the armored\'s health, and every blow hits like a car. Keep moving and aim high.',
    why: 'The lab\'s security men were given the strongest dose of KAIKA, to keep them standing. It did.',
    quip: ['HANA', 'Oni. Don\'t let it reach you. Back up and keep shooting.'],
  },
  court: {
    name: 'THE KURENAI COURT',
    tag: 'The living who kneel to her.',
    look: 'Theatre crimson, the checkpoint\'s rifles.',
    does: 'Not infected. They keep their distance, take cover on the container decks and shoot outsiders on sight.',
    why: 'The people who stayed at the theatre and made a goddess of Sayo. They feed her the bitten.',
    quip: ['YUZU', 'Rifles - those are people! Get behind something.'],
  },
  empress: {
    name: 'THE CRIMSON EMPRESS',
    tag: 'KS-01.',
    look: 'Over two metres, a crimson coat, a crown of blossom, the red parasol.',
    does: 'Slams, charges, and calls the bloomed to her - more when she rages below half her health. Aim for the head.',
    why: 'Sayo Kurenai, patient zero. The Court has fed her for seven years, and she is still growing.',
    quip: ['HANA', 'That\'s her. Sayo Kurenai. Everything starts with her.'],
  },
};

// ---------------------------------------------------------------------------------------------
// the district, place by place (what you hear the first time you walk in)
// ---------------------------------------------------------------------------------------------

export type Place = 'station' | 'metro' | 'school' | 'shotengai' | 'canal' | 'shrine' | 'theatre' | 'freight' | 'lab' | 'kisaragi';

export const PLACE_NAMES: Record<Place, string> = {
  station: 'SAKURAGI STATION',
  metro: 'THE METRO',
  school: 'HILLTOP SCHOOL',
  shotengai: 'THE SHOTENGAI',
  canal: 'THE CANAL',
  shrine: 'THE SHRINE',
  theatre: 'KURENAI THEATRE',
  freight: 'THE FREIGHT YARD',
  lab: 'THE LAB',
  kisaragi: 'KISARAGI STATION',
};

export const PLACE_RADIO: Record<Place, readonly Line[]> = {
  station: [
    ['HANA', 'Evacuation Point 3. The tents are still up. "Wait. Rescue is coming" - they painted it on the ground for the helicopters.'],
    ['YUZU', 'Nobody came. The trains stopped on night nine.'],
  ],
  metro: [
    ['AOI', '...the 21:47 never came. Four hundred people on the platform, and the attendant kept telling them it was coming. I left a charm at his lost and found.'],
  ],
  school: [
    ['HANA', 'Hilltop school. The last helicopter out left from that sports field, full.'],
    ['AOI', 'The children who did not fit barricaded the music room. One of them had my charm. She played the piano so the others would sleep.'],
  ],
  shotengai: [
    ['YUZU', 'The arcade. Pachinko, the konbini, karaoke on the corner - it was the loudest street in the ward.'],
    ['AOI', 'Mei Hoshino sang her last show at the karaoke. I gave her a charm for luck. She hung it from the mirror ball.'],
  ],
  canal: [
    ['HANA', 'The canal park. The families camped under the trees here when the shelters filled. Hanami every day, someone wrote.'],
    ['AOI', 'A family tried to row out along the canal. The boat went down by the bridge with my charm tied to its bow.'],
  ],
  shrine: [
    ['AOI', 'You are at the shrine. My shrine. The sacred tree stands bare - five knots in its rope, and nothing tied to them.'],
    ['YUZU', 'The relay\'s up there in the courtyard. That\'s where her voice is coming from.'],
  ],
  theatre: [
    ['HANA', 'The Kurenai Theatre. Ninety years of the family name in red over the door.'],
    ['AOI', 'The Court lives here now. They took the festival scroll from my shrine and hung it over her stage. They do not know what it is.'],
  ],
  freight: [
    ['YUZU', 'The army checkpoint. The list board\'s still up - names in the order the trains would take them.'],
    ['HANA', 'The trains stopped after the third. The Court took the yard, and the soldiers\' rifles. Watch the container stacks.'],
  ],
  lab: [
    ['AOI', 'Under the theatre. This is where they took the tree\'s sap, and where KS-01 woke up. A technician kept my last charm in the sample fridge, for his daughter.'],
    ['HANA', 'Case file KS-01: Kurenai Sayo, twenty-four. Day six: containment failure. This is where it started.'],
  ],
  kisaragi: [
    ['AOI', 'Kisaragi. The stop that is on no map. The dead wait here for the train home. You should not stay long.'],
  ],
};

/** Which part of the district a spot is in (`area`: the floors area's kind and index; the lab and Kisaragi by area). */
export function placeAt(x: number, z: number, under: boolean, lab: boolean, kisaragi: boolean): Place | null {
  if (kisaragi) return 'kisaragi';
  if (lab) return 'lab';
  if (under) return 'metro';
  if (x > 70 && z > 30 && z < 66) return 'shrine';
  for (const [name, r] of Object.entries(ZONES)) {
    if (x >= r.x0 - 4 && x <= r.x1 + 4 && z >= r.z0 - 4 && z <= r.z1 + 4) return name.startsWith('shotengai') ? 'shotengai' : (name as Place);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// the campaign
// ---------------------------------------------------------------------------------------------

/** What a chapter can see: the shared quest, the two contracts and the extraction. */
export interface CampaignState {
  quest: QuestView;
  defense: string;
  hunt: string;
  extracted: boolean;
}

/** Reach bits in `QuestView.marks`. */
export const MARK = { checkpoint: 1 } as const;
/** The freight yard's list board: anyone within this of it reaches the checkpoint. */
export const CHECKPOINT = { x: 92, z: -32, r: 10 };

export interface Chapter {
  id: string;
  title: string;
  place: Place;
  /** The objective, as the HUD shows it. */
  goal: string;
  done: (s: CampaignState) => boolean;
  /** Where the marker points (the spots of the quest; null: the place's own landmark). */
  target: (q: QuestSpots, s: CampaignState) => { x: number; z: number; label: string } | null;
  /** The radio when it begins. */
  intro: readonly Line[];
  /** Kinds this chapter introduces (the set piece spawns them where it happens). */
  kinds: readonly FieldKind[];
}

const has = (v: QuestView, i: number): boolean => (v.found & (1 << i)) !== 0;
const charm = (i: number, label: string) => (q: QuestSpots): { x: number; z: number; label: string } => ({ x: q.charms[i]!.x, z: q.charms[i]!.z, label });

export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'train',
    title: 'THE 21:47',
    place: 'metro',
    goal: 'Down into the metro: take the charm from the lost and found',
    done: (s) => has(s.quest, 0),
    target: charm(0, 'LOST AND FOUND'),
    intro: [
      ['AOI', '...if anyone can hear this. This is Aoi Kisaragi, at Sakuragi Shrine. The relay is running on its own. I do not know for how long.'],
      ['HANA', 'Aoi Kisaragi. The shrine keeper. She\'s been on the missing list for seven years.'],
      ['AOI', 'The shrine\'s five charms were scattered when the city fell. Bring them home to the sacred tree, and I can show you how to end this. The first is under the station.'],
      ['YUZU', 'A dead woman giving us directions. Fine. Into the metro.'],
    ],
    kinds: ['commuter', 'jorogumo'],
  },
  {
    id: 'school',
    title: 'THE LAST HELICOPTER',
    place: 'school',
    goal: 'Up to the hilltop school: the charm in the music room piano',
    done: (s) => has(s.quest, 1),
    target: charm(1, 'MUSIC ROOM'),
    intro: [
      ['AOI', 'One. Thank you. The second is on the hill, at the school. In the music room, inside the piano.'],
      ['HANA', 'The kids who didn\'t make the last flight. Let\'s bring her charm home for them too.'],
    ],
    kinds: ['rooted'],
  },
  {
    id: 'encore',
    title: 'ENCORE',
    place: 'shotengai',
    goal: 'Into the arcade: the charm on the karaoke\'s mirror ball',
    done: (s) => has(s.quest, 2),
    target: charm(2, 'KARAOKE'),
    intro: [
      ['AOI', 'The third is with Mei, at the karaoke on the arcade. She is still singing. Do not let her voice lead you.'],
      ['YUZU', 'An idol who never got off the stage. Earplugs would be nice.'],
    ],
    kinds: ['idol', 'bloomed'],
  },
  {
    id: 'canal',
    title: 'HANAMI',
    place: 'canal',
    goal: 'Down to the canal: the charm on the sunken boat\'s bow',
    done: (s) => has(s.quest, 3),
    target: charm(3, 'SUNKEN BOAT'),
    intro: [
      ['AOI', 'The fourth went into the canal with a family who tried to row away. Their boat is by the bridge. You can reach the bow from the bank.'],
      ['HANA', 'The park\'s full of drifts. If one of them gets up, it isn\'t a drift.'],
    ],
    kinds: ['rooted', 'bloomed'],
  },
  {
    id: 'checkpoint',
    title: 'THE CHECKPOINT',
    place: 'freight',
    goal: 'Through the Court\'s freight yard to the army\'s list board',
    done: (s) => (s.quest.marks & MARK.checkpoint) !== 0,
    target: () => ({ x: CHECKPOINT.x, z: CHECKPOINT.z, label: 'CHECKPOINT' }),
    intro: [
      ['AOI', 'The last charm is under the theatre. The way in is through the Court. They hold the freight yard, and they shoot.'],
      ['YUZU', 'Living people with rifles. I liked it better when they only bit.'],
    ],
    kinds: ['court'],
  },
  {
    id: 'lab',
    title: 'PATIENT ZERO',
    place: 'lab',
    goal: 'Down under the theatre: the charm in the lab\'s sample fridge',
    done: (s) => has(s.quest, 4),
    target: charm(4, 'SAMPLE FRIDGE'),
    intro: [
      ['AOI', 'Under the theatre is Kurenai Pharmaceuticals\' research floor. That is where they took the sap from my tree. That is where it began.'],
      ['HANA', 'Stairs down from the theatre grounds. Whatever they made down there is still down there.'],
    ],
    kinds: ['oni', 'jorogumo'],
  },
  {
    id: 'tree',
    title: 'THE SACRED TREE',
    place: 'shrine',
    goal: 'To the shrine: tie the five charms to the sacred tree',
    done: (s) => s.quest.tied === 0b11111,
    target: (q) => ({ x: q.tree.x, z: q.tree.z, label: 'SACRED TREE' }),
    intro: [
      ['AOI', 'All five. You found all five. Bring them up the shrine steps to the tree. My sisters are still on the steps. I am sorry.'],
    ],
    kinds: ['miko'],
  },
  {
    id: 'curtain',
    title: 'THE CRIMSON CURTAIN',
    place: 'theatre',
    goal: 'To the theatre: bring down the Crimson Empress',
    done: (s) => s.hunt === 'complete',
    target: () => ({ x: 20, z: -44, label: 'THE STAGE' }),
    intro: [
      ['AOI', 'The tree remembers. To finish, the lanterns must be lit in the order of the festival poem - and the Court hung the poem over her stage.'],
      ['AOI', 'Sayo is there. She was kind, before. Let her rest.'],
      ['HANA', 'The Empress. Patient zero. Let\'s end her story.'],
    ],
    kinds: ['empress', 'court'],
  },
  {
    id: 'lanterns',
    title: 'THE THOUSAND LANTERNS',
    place: 'shrine',
    goal: 'Light the five great lanterns in the poem\'s order',
    done: (s) => s.quest.phase === 'bell' || s.quest.phase === 'bloom',
    target: (q, s) => {
      const j = s.quest.order[Math.min(4, s.quest.lit)]!;
      return { x: q.lanterns[j]!.x, z: q.lanterns[j]!.z, label: `${LANTERN_SIGNS[j]!.word} LANTERN` };
    },
    intro: [
      ['AOI', 'Thank you, Sayo. Now the poem. Light the great lanterns in its order. One wrong, and they all go out - and the dead come to see why.'],
    ],
    kinds: [],
  },
  {
    id: 'bell',
    title: 'THE NIGHT THEY GO HOME',
    place: 'shrine',
    goal: 'Start the shrine relay, and ring the bell while it transmits',
    done: (s) => s.quest.phase === 'bloom',
    target: (q, s) => (s.defense === 'complete' || s.defense === 'active' ? { x: q.bell.x, z: q.bell.z, label: 'THE BELL' } : { x: 100, z: 50, label: 'SHRINE RELAY' }),
    intro: [
      ['AOI', 'Every lantern burns. Now my voice must carry: start the relay, and while it speaks, ring the bell. Everything that is left will come for the shrine.'],
      ['YUZU', 'Hold the courtyard, ring a bell. Sounds easy. It won\'t be.'],
    ],
    kinds: [],
  },
  {
    id: 'home',
    title: 'HOME',
    place: 'school',
    goal: 'The dead are going home. Radio the helicopter from the hilltop and get out',
    done: (s) => s.extracted,
    target: () => null,
    intro: [
      ['AOI', 'Look. The trees are red, and the train is waiting for them at the station. They are going home. So am I.'],
      ['AOI', 'Thank you, all of you. Go back to your own home now. The helicopter can hear you.'],
      ['HANA', 'Goodbye, Aoi. Hilltop, everyone. Let\'s go home.'],
    ],
    kinds: [],
  },
];

/** The chapter being played: the first one not done (CHAPTERS.length when the story is over). */
export function chapterIndex(s: CampaignState): number {
  const i = CHAPTERS.findIndex((c) => !c.done(s));
  return i < 0 ? CHAPTERS.length : i;
}

/**
 * A chapter's set piece, when it begins: its kinds where it happens (the idol on the karaoke stage, an oni in the lab,
 * the miko on the shrine steps). The solo game and the co-op simulation both run it.
 */
export function campaignSetPiece(index: number, zm: ZombieManager, level: Level, q: QuestSpots, rng: Rng): void {
  const ch = CHAPTERS[index];
  if (!ch) return;
  // round a spot, each one on the nearest open ground of its floor
  const near = (x: number, z: number, y: number, area: number, n: number, r: number, type: 'shambler' | 'runner' | 'armored' | 'warden', variant: ZombieVariant): void => {
    const nav = level.floors.navOf(area);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.f();
      const cell = nav.nearestFree(x + Math.cos(a) * r, z + Math.sin(a) * r, 6);
      if (cell >= 0) zm.spawn(type, nav.cellCenterX(cell), nav.cellCenterZ(cell), rng, { ambient: true, variant, y, area });
    }
  };
  const fl = level.floors;
  const at = (i: number): { x: number; y: number; z: number; area: number } => {
    const c = q.charms[i]!;
    return { x: c.x, y: c.y, z: c.z, area: fl.areaAt(c.x, c.y, c.z) };
  };
  switch (ch.id) {
    case 'train': {
      const c = at(0);
      near(c.x, c.z, c.y, c.area, 3, 7, 'shambler', 'commuter');
      break;
    }
    case 'school': {
      const c = at(1);
      near(c.x, c.z, c.y, c.area, 3, 6, 'runner', 'rooted');
      break;
    }
    case 'encore': {
      const c = at(2);
      near(c.x, c.z, c.y, c.area, 1, 3, 'shambler', 'idol');
      near(c.x, c.z, c.y, c.area, 2, 7, 'shambler', 'bloomed');
      break;
    }
    case 'canal': {
      const c = at(3);
      near(c.x, c.z, 0, 0, 3, 8, 'runner', 'rooted');
      near(c.x, c.z, 0, 0, 2, 10, 'shambler', 'bloomed');
      break;
    }
    case 'checkpoint':
      near(CHECKPOINT.x + 6, CHECKPOINT.z - 10, 0, 0, 4, 6, 'shambler', 'court');
      break;
    case 'lab': {
      const c = at(4);
      near(c.x, c.z, c.y, c.area, 1, 6, 'armored', 'oni');
      near(c.x, c.z, c.y, c.area, 2, 9, 'runner', 'jorogumo');
      break;
    }
    case 'tree':
      near(q.tree.x, q.tree.z, 0, 0, 2, 9, 'shambler', 'miko');
      break;
    default:
      break;
  }
}

/** The lantern order as words (the HUD's objective detail, after the Empress falls). */
export function orderWords(v: QuestView): string {
  return v.order.map((j, k) => (k < v.lit ? `(${LANTERN_SIGNS[j]!.word})` : LANTERN_SIGNS[j]!.word)).join('  ');
}

/** Where a campaign run ended up, in a line (the results, the field file). */
export function campaignLine(done: number): string {
  return done >= CHAPTERS.length ? 'KAIKA: the dead of Sakuragi were seen home.' : `KAIKA: ${done}/${CHAPTERS.length} chapters.`;
}
