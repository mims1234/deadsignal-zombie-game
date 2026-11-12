/**
 * ZARYA: what is said, beat by beat. Act I is the script the user approved (`research_notes/zarya/phase0.html`), cut
 * to what is spoken during play, plus the few lines a playable version needs where the page had a stage direction.
 * Acts II and III are written in the same voice. Shown as captions on the wire (`Game.radio`); there are no voices yet.
 *
 * The rule for every line: it tells the player something they could not have worked out, or it is the character being
 * themselves. Nobody states the obvious.
 */
export type Speaker = 'MIRA' | 'TIMUR' | 'VERA' | 'NINA' | 'KOSTYA' | 'ZINA' | 'ZIMIN' | 'YAGA';
export type Line = readonly [Speaker, string];

export const LINES = {
  // the square, alive
  arrive: [
    ['VERA', "Babushka, shut the window. You'll freeze the whole flat."],
    ['VERA', '...She says she can see the tree from there. She says I can shut it myself when I come.'],
    ['MIRA', 'Boy, seven, red hat. Kostya. Last seen in toys, second floor, forty minutes ago.'],
    ['TIMUR', 'Same Ded Moroz as when I was five. Same beard. I checked once.'],
    ['MIRA', "You pulled Ded Moroz's beard."],
    ['TIMUR', 'I was five. It was science.'],
  ],
  // ---- co-op: Mira, Timur and Vera, and the one or two volunteers who came out with them tonight (said after `arrive`
  // when the room has more than one player; `runtime.ts` beats) ----
  crewFour: [
    ['VERA', "The rota said three. Four turned up. On New Year's Eve."],
    ['TIMUR', 'Nobody wants to be at home for the speech.'],
  ],
  crewFive: [
    ['VERA', "The rota said three. Five turned up. On New Year's Eve."],
    ['TIMUR', 'Nobody wants to be at home for the speech.'],
  ],
  door: [
    ['NINA', 'Search squad. You took your time.'],
    ['VERA', 'Nina Pavlovna. Where did his mother last see him?'],
    ['NINA', "He isn't lost. They hide. Thirty years, and they always hide in the same place."],
  ],
  shelter: [
    ['KOSTYA', "I'm not lost."],
    ['MIRA', 'Nobody said lost. I said found. Different thing.'],
    ['KOSTYA', "I was guarding the door. It was open. It's not supposed to be open."],
    ['NINA', "He's right. It isn't."],
  ],
  sealed: [
    ['TIMUR', 'We do need to go back out through that.'],
    ['NINA', 'And you will. It keeps the heat in. Sit. There is tea.'],
    ['KOSTYA', 'It did that by itself.'],
  ],
  wake: [
    ['VERA', 'My phone says forty past midnight. No signal. That clock says three to.'],
    ['TIMUR', 'Every clock in town runs off one master clock, up at the Institute. If that one stops, they all stop.'],
    ['MIRA', 'Then why did it stop?'],
    ['NINA', 'Service issue. One for each shift. Fired twice since nineteen seventy-four, both times at the ceiling.'],
  ],
  armed: [
    ['VERA', "Nina Pavlovna, we're a search squad."],
    ['NINA', 'And in my day, when that door seals itself, you do not go up with a torch and good manners.'],
    ['NINA', "The boy stays with me. I'll be on the wire. There is a speaker in every room in this town. I have complained about it for years."],
  ],
  released: [
    ['TIMUR', 'Thank you for the door, Nina Pavlovna.'],
    ['NINA', 'Thirty years I have kept this door. First time anyone has thanked me for it.'],
  ],
  hall: [
    ['VERA', "They're breathing. Look. All of them."],
    ['TIMUR', 'Good. Then they can explain why the lifts are off.'],
    ['MIRA', "That one isn't."],
    ['NINA', 'That is Gena, from the meat rows. Thirty years I told him to stop smoking.'],
    ['NINA', "...He isn't breathing, child. That isn't Gena any more."],
  ],
  genaDown: [
    ['VERA', "Slow. Really slow. Like someone pulled out from under ice. She's all right. She's just not here."],
    ['TIMUR', 'So wake her.'],
    ['VERA', "I'm trying. She won't."],
    ['MIRA', 'There are two hundred of them, Vera.'],
    ['VERA', "Then I've a hundred and ninety-nine to go."],
  ],
  guard: [
    ['VERA', 'His breath stopped before he moved. Did you see? Before.'],
    ['TIMUR', 'So the noise did that.'],
    ['MIRA', 'Being woken like that did that.'],
  ],
  plug: [['TIMUR', 'Right. Nobody shake anybody.']],
  notice: [
    ['TIMUR', 'Mira.'],
    ['MIRA', 'Danya took one of these. Two winters ago. He said it was the easiest money in town.'],
    ['MIRA', "They told my mother he'd left for the mainland."],
    ['VERA', 'And this one. New Year duty wardens. Four names. A cosmonaut, a sun, a sheaf of wheat, a dove.'],
  ],
  tube: [
    ['TIMUR', 'Shelter kit has a flare tube and no flares. Of course it does.'],
    ['VERA', 'Who are we signalling?'],
    ['TIMUR', 'Anyone with eyes and a sky.'],
  ],
  cartridges: [['TIMUR', 'Twelve-gauge signal reds. The fireworks man keeps them under the rockets. Everyone knows.']],
  flare: [
    ['MIRA', "Don't count them."],
    ['TIMUR', "I wasn't."],
    ['TIMUR', '...Thirty-one.'],
    ['VERA', "The snow isn't falling straight. It's coming out of the plant."],
  ],
  sack: [
    ['KOSTYA', "That's Ded Moroz's sack. You can't just take from it."],
    ['TIMUR', "We'll leave something."],
    ['KOSTYA', 'What?'],
    ['TIMUR', '...Money. He takes money now. Times are hard.'],
  ],
  // (round 3) the first weapon mod part the squad finds: what the parts are for, said once (`zarya/modsRuntime.ts`)
  modPart: [
    ['TIMUR', 'Springs and a feed. Gun parts, if you know how. At any bench I can make a gun hold half as much again.'],
    ['VERA', 'Or?'],
    ['TIMUR', "Or pack its rounds in frost. Whatever they hit goes slow. One part each. Bring me the gun."],
  ],
  // the sack is gone from where it stood, the first time (`SACK_MOVED` then says where it went, every time)
  sackGone: [['NINA', 'Ded Moroz never leaves the sack in one place for long. Thirty years. Nobody has ever seen him move it.']],
  line: [
    ['TIMUR', 'Tyotya Zina. Thirty-one years on Line One.'],
    ['TIMUR', "Her handle's gone. Without it the car doesn't move. She never leaves it in the cab. She takes it to tea."],
    ['VERA', 'Tea where?'],
    ['TIMUR', "Univermag tea room. Ground floor. She's banned from the canteen upstairs."],
    ['MIRA', 'Banned for what?'],
    ['TIMUR', 'Opinions.'],
    ['VERA', "Stroiteley Street is four stops. My grandmother's window is open, Timur."],
    ['TIMUR', "Then we get Zina her handle. And a line fuse. There's a spare in the box at every stop. There's supposed to be."],
  ],
  fuseBox: [
    ['TIMUR', 'Empty.'],
    ['TIMUR', '...The tree. Every December they run the tree off the stop. Every January I put the spare back.'],
  ],
  fuse: [
    ['VERA', "You've put the tree out."],
    ['TIMUR', "I'll put it back in January."],
  ],
  handle: [['TIMUR', 'Still warm from her glass. She was coming back for it.']],
  handleFit: [['TIMUR', "There. She's got it. Look at that. She knows."]],
  bear: [
    ['TIMUR', "That's Oleg Petrovich. PE teacher. He's been the bear every year since I was at school."],
    ['MIRA', 'Why does he want the sack?'],
    ['TIMUR', "It's his job. He guards it from children."],
    ['KOSTYA', "He's really good at it."],
  ],
  prize: [['TIMUR', "Prizes go on the slide's hook. He has to see to it. Thirty years. He can't not."]],
  bearDown: [
    ['MIRA', 'A key, on a lanyard. An enamel sun on the tag.'],
    ['MIRA', 'That was on the board. Duty warden, Sun quarter.'],
    ['VERA', 'Duty for what?'],
  ],
  left: [
    ['ZINA', 'Next stop. Rynok.'],
    ['TIMUR', 'Still on time. Thirty-one years.'],
    ['KOSTYA', 'Ded Moroz is following the tram.'],
    ['NINA', 'Ded Moroz is on the stage, Kostya.'],
    ['KOSTYA', "No he isn't."],
  ],

  // ---- Act II: the town opens ----
  rynok: [
    ['TIMUR', "Meat rows, pickles, hats. And the police post, if anyone's left a rifle on the rack."],
    ['NINA', "Borya will be at his counter. He sleeps there in the season. Don't startle him."],
  ],
  borya: [
    ['NINA', "That's Borya. ...No. No breath."],
    ['TIMUR', "He's the size of his own cold store."],
    ['MIRA', "Then that's where he goes. He walks in there forty times a day. Let him walk in once more."],
  ],
  barred: [
    ['TIMUR', 'Barred. He can lean on that till spring.'],
    ['MIRA', 'His keys are on the hook.'],
  ],
  cosmoKey: [
    ['MIRA', 'A cosmonaut on the tag.'],
    ['VERA', 'Wardens. Keys. Somebody gave these out and never said what for.'],
  ],
  ledger: [
    ['MIRA', "Institute account. Forty kilos of meat a week. 'For the bears.'"],
    ['TIMUR', 'What bears?'],
  ],
  dvor: [['VERA', 'Third block. Ground floor. The open window.']],
  babushka: [
    ['VERA', "Babushka. ...It's me. I've shut it. I said I would."],
    ['VERA', "She's breathing. She had her shawl on. She always has her shawl on."],
  ],
  tv: [['TIMUR', 'Every set in the block is on the same frame. Three minutes to twelve. The clock that never got to strike.']],
  cutters: [['TIMUR', "Shears, two lengths of pipe, tape. I've made worse and charged for it."]],
  garages: [['TIMUR', "Row three, number forty. Mine. Kettle's on the left. Don't touch the motorcycle."]],
  crates: [
    ['TIMUR', "These aren't anyone's. Institute stencils. 'Berloga.'"],
    ['MIRA', "A bear's den."],
    ['TIMUR', 'Delivered last week. Somebody here signed for them.'],
  ],
  depot: [
    ['TIMUR', "Okhotnik's still lit. He sells to anyone with a hunting ticket."],
    ['VERA', "We haven't got a hunting ticket."],
    ['TIMUR', "He's asleep, Vera."],
  ],
  sheet: [
    ['TIMUR', "Zina's route sheet. Thirty-one years. Not one missed day."],
    ['TIMUR', "...Tonight's is filled in. Every stop. In her hand."],
  ],
  gvozdomyot: [['TIMUR', "Gas-driven. It was for roofing. It isn't any more."]],
  salyut: [['TIMUR', 'Five tubes, one cord. Do not stand behind it. Do not stand in front of it.']],
  rogatina: [
    ['NINA', "A rogatina. My grandfather had one. For the bear that wakes in winter and can't sleep again. That is what a shatun is, child."],
    // (round 3: what it is for, where it is built)
    ['TIMUR', "Set it low and let them come. Whatever charges, stops on the crossguard. Borya. The big ones off the pond. A bear, if it comes to that."],
  ],
  // ---- round 3 (notes 5 and 6): the first of each kind of obstacle a weapon to swing gets through (`obstacles.ts`) ----
  obsPadlock: [
    ['VERA', 'The yard-keeper locks his shed against the boys. Every winter they get in anyway.'],
    ['TIMUR', "Not through that padlock they don't. That wants the maul off his woodpile."],
  ],
  obsBoards: [
    ['TIMUR', "He boarded his garage up from outside and went to the square. Whatever's in there, he didn't want the neighbours at it."],
    ['MIRA', 'The neighbours are asleep.'],
  ],
  obsBarricade: [['TIMUR', "That's how the garage men got to the market, till the chairman made them use the gate. Old doors and nails. An axe would have it down."]],
  obsIce: [['TIMUR', "A pipe burst over the side door and froze where it fell. Ice like that, you don't climb. You chop."]],
  obsLashing: [['NINA', "Frozen rope. A knife will skate off it. In my grandfather's day they cut it with a sabre, and the museum has one."]],
  tickets: [['NINA', 'Three tickets. Thirty years and I never once saw the pageant. Somebody had to mind the store.']],
  dk: [['KOSTYA', "That's my class. That's Anya, she's the Snowflake. I was supposed to be the Hare."]],
  yaga: [
    ['NINA', 'Lyudmila Markovna. Baba Yaga since before you were born. She never comes out of that hut until it turns.'],
    ['TIMUR', "That hut runs on the stage: the revolve, the traps, the fly bars, the follow-spot. I fixed that revolve in October."],
  ],
  // ---- Baba Yaga's fight (`stage.ts`): she says her part from the pageant, the only lines she has left; Nina knew her ----
  yagaCall: [
    ['YAGA', 'Come out, my little goats! Sing for your supper!'],
    ['NINA', 'The carol-singers were her idea. The same goat mask forty years running, and every year a child cried at it.'],
  ],
  yagaRevolve: [['KOSTYA', "Little hut, little hut, turn your back to the forest and your front to me! That's Ivan's line. I know all of it."]],
  yagaTrap: [['TIMUR', 'I told the director those traps would have somebody one day.']],
  yagaFly: [['YAGA', 'Who drops the sky on an old woman?']],
  yagaSpot: [['YAGA', 'Who lit the lamp? The lamp is for the end!']],
  yagaWatch: [['NINA', 'She learns. Forty winters on that stage, she always knew where the stagehands were.']],
  yagaPhase2: [
    ['YAGA', 'Fu, fu! It smells of a living soul! Let me come down and see the audience.'],
    ['NINA', 'She taught half this town to be afraid of a kitchen broom.'],
  ],
  yagaPhase3: [
    ['YAGA', "I'll roll about, I'll lie about, once I've eaten my fill!"],
    ['NINA', 'After, she gave the frightened ones a sweet from her apron. Every one of them.'],
  ],
  yagaDown: [
    ['MIRA', 'Wheat.'],
    ['NINA', 'Take your bow, Lyudmila. The curtain is down.'],
  ],
  plaque: [
    ['MIRA', "'Zarya-12. Founded 1962, for the Institute of Chronobiology.'"],
    ['TIMUR', 'A whole town for one institute.'],
  ],
  photo: [['NINA', "The first New Year tree, nineteen eighty-seven. That's Arkady Zimin in the coat. Director of the Institute, and our Ded Moroz every year since."]],
  escalator: [['TIMUR', "Staff party's on the third floor. They never invite the depot."]],
  // Kostya's den behind the toy counter, on the store's second floor (a clue)
  den: [
    ['KOSTYA', "That's my den. You're supposed to knock."],
    ['NINA', 'Every Saturday since he could walk. Valya on toys pretends she cannot see him.'],
  ],
  tamada: [
    ['NINA', "Vitya from accounts. Toastmaster. He will not stop while there's a microphone."],
    ['TIMUR', 'Three speakers. Three plugs.'],
  ],
  tamadaDown: [
    ['MIRA', 'A dove.'],
    ['VERA', 'And his camera. He was photographing the party.'],
  ],
  hung: [['KOSTYA', "You put them back! There's a rule. If the tree's whole at midnight, the cabinet in the museum gets opened. Nobody ever managed it."]],
  // ---- Act III: the thaw ----
  doll: [['KOSTYA', "The doll opened. There's another one inside."]],
  pond: [['NINA', 'The pond road. That gate has been iced shut since November. Something has shaken it loose.']],
  banya: [['VERA', "It's warm. Feel that. It's the only warm place in town."]],
  faces: [
    ['VERA', 'Look at their colour. These ones could almost wake.'],
    ['VERA', "It's the cold that's holding them. Not only the snow."],
  ],
  tets: [['TIMUR', "That chimney's meant to make steam. Look what's coming out of it."]],
  pipe: [
    ['TIMUR', 'New weld. Last month, by the scale on it. It runs straight in from the Institute.'],
    ['MIRA', "They're putting it out through the heating plant. The whole town breathes it."],
  ],
  valves: [['TIMUR', "That's the plant ready to push steam the right way round. It needs someone at the other end."]],
  codeUnknown: [['TIMUR', 'Four digits. Institute people are sentimental. A year. The museum would know which.']],
  code: [['MIRA', 'Nineteen sixty-two.']],
  institute: [['MIRA', 'Danya walked in through that door.']],
  clock: [['TIMUR', 'The master clock. Stopped by hand. Somebody put a spanner through it at three minutes to twelve.']],
  office: [
    ['MIRA', "Zimin's notes. 'The plant will not last the winter. They would have frozen by February. Asleep, they need nothing. Asleep, they can wait for spring.'"],
    ['VERA', 'He did it to save them.'],
    ['MIRA', 'He did it to nine thousand people without asking one.'],
  ],
  ottepel: [['TIMUR', "A samovar, a stove coil, a valve, and something blue I'm not going to ask about. It thaws them, Mira. The ones that woke wrong. It lets them lie down."]],
  keyDoor: [['NINA', "Four wardens, four keys. That's what the duty was for. Nobody ever told them."]],
  dens: [
    ['VERA', 'Bears. Real ones. Asleep.'],
    ['TIMUR', "That's where he learned it."],
  ],
  danya: [
    ['MIRA', 'Danya.'],
    ['MIRA', "...Two winters. He hasn't aged a day. He's still wearing my scarf."],
  ],
  // ---- the Zenit's photographs: the place at 23:57 (`photos.ts`; each is also the caption under its picture) ----
  stillSquare: [['KOSTYA', 'Everybody is looking up at the snow. Ded Moroz is looking at his watch.']],
  stillDk: [['KOSTYA', "There's Anya, and the wolves. That gap is the Hare. ...I was in the shelter."]],
  stillRynok: [['TIMUR', "Three to twelve, and Borya's handing over the Institute's order. On New Year's Eve."]],
  stillDvor: [['VERA', "The whole yard's looking at the sky. She's looking at the tree. She was waiting for me."]],
  stillTets: [['TIMUR', 'Night shift at the boilers. One man at the new pipe, in an Institute coat and a gas mask.']],
  stillClock: [['TIMUR', 'A white coat on a ladder, and the spanner going in. Somebody stood here and waited for three to twelve.']],
  asked: [
    ['ZIMIN', 'Are you warm, child?'],
    ['NINA', 'Arkady. ...In the story the girl says yes. Freezing, and she says yes. And he lets her live.'],
  ],
  believed: [
    ['ZIMIN', 'You covered them. All night I watched you stop and cover them.'],
    ['ZIMIN', 'Then I was wrong about what people do in the cold.'],
  ],
  doubted: [['ZIMIN', 'Warm. And how many did you walk past?']],
  morozkoDown: [['ZIMIN', '...The order. It matters. I had it put where nobody in this town could forget it.']],
  end1: [
    ['KOSTYA', "The clock's moving. It's midnight. It's midnight now!"],
    ['NINA', 'Happy New Year, child. Go and find your mother.'],
    ['NINA', "I'm opening the door. Thirty years, and it is the first time I have opened it for anyone but me."],
  ],
  end2: [
    ['NINA', "The store is awake. The banya. The plant. ...The square isn't."],
    ['VERA', 'Then we build over them. And we keep watch. And we wait for spring.'],
    ['NINA', "I'm opening the door. There will be a great many people needing tea."],
  ],
  end3: [
    ['ZIMIN', 'In the order they were painted. ...Happy New Year.'],
    ['KOSTYA', "Ded Moroz did it. I told you he wasn't on the stage."],
    ['NINA', 'Thank you for the door, Arkady. I am opening it now.'],
  ],
} as const satisfies Record<string, readonly Line[]>;

export type Beat = keyof typeof LINES;

/**
 * Where Ded Moroz's sack has gone (`zarya/sack.ts`), said on the wire each time it turns up somewhere else. Kostya
 * knows; he always knows where the sack is.
 */
export const SACK_MOVED: Readonly<Record<'square' | 'rynok' | 'dvor' | 'depot' | 'banya', Line>> = {
  square: ['KOSTYA', "The sack's back under the little fir on the square. He always comes back to the square."],
  rynok: ['KOSTYA', "The sack's at the market now. By the big matryoshka. He likes her."],
  dvor: ['KOSTYA', "He's put the sack in the courtyards. Under the yard fir. He likes a fir best."],
  depot: ['KOSTYA', "The sack's on the depot street. By the trams. He rides Line One too."],
  banya: ['KOSTYA', "The sack's outside the banya. Not inside. It's too hot in there for him."],
};

/** Nina on the wire while the squad fights on the square: she tells them who people are. One at a time, never twice. */
export const NINA_WIRE: readonly string[] = [
  'The one by the kiosk in the blue scarf is Lida, from the pharmacy. Breathing. Leave her be.',
  "The tall one behind her isn't. I don't know him. That makes it easier, I'm ashamed to say.",
  'Mind the Sorokins by the slide. All five. He owes me for a cloakroom tag since March.',
  'That is the whole of School Number Two by the stage. Their teacher counts them every ten minutes. She will want them all.',
  'If you see a man with a samovar under his arm, he took it from my canteen. I want it back when this is over.',
];

/**
 * Morozko's question before each heavy blow (`director.ts`): he stops, asks, and holds the blow for a second. A guard
 * or a swing in that pause staggers him. Said in turn, round and round.
 */
export const ARE_YOU_WARM: readonly string[] = ['Are you warm?', 'Are you warm, child?', 'And now? Are you warm?', 'Warm yet?', 'Still warm, child?'];

/** How long a line stays up: long enough to read it on a phone. */
export function lineSeconds(text: string): number {
  return Math.min(7.5, Math.max(2.4, 1.3 + text.split(/\s+/).length * 0.3));
}
