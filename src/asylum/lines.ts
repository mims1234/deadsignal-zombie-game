/**
 * Everything Blackwood Hill says aloud. Each line is a file in `public/asylum/voice/` (`<id>.mp3`, made by
 * `scripts/asylum-audio.mjs`: ElevenLabs v4 (the newer lines v4 Turbo) through OpenRouter, the best of several takes, each judged by an audio
 * model). `text` is the caption, `say` what the generator is given (direction in brackets), `how` the delivery asked
 * for. They are played one at a time by the voice director (`sakura/voice.ts`, given this bank), by kind, so none is
 * lost when the player does two things at once.
 *
 * The cast (all original), each with a voice and an accent of their own so they never sound alike:
 *   OKAFOR    Dr. Imani Okafor, Lantern team's doctor, worked these wards before the fall      American (Houston)
 *   VANCE     Rin Vance, Lantern team's marksman                                                 Scottish (Glasgow)
 *   PILOT     the helicopter                                                                     Australian
 *   MATRON    Agatha Mourne, the Head Nurse, on the hospital's old speakers and in the halls     old upper-class English
 *   BYRNE     Orderly Tom Byrne, his last tape in the morgue                                     Yorkshire
 *   HALLOWAY  Nurse Mary Halloway, night sister (armed once freed)                               Irish (Cork)
 *   ELLIE     Ellie Crane, Patient 117, sixteen (follows unarmed)                                soft southern English
 *   PIP       Pip Arden, trainee nurse (follows unarmed)                                         London
 *   MAEVE     Sister Maeve, the chaplain (follows unarmed)                                       Welsh
 *   SATO      Dr. Yuki Sato, resident (armed once freed)                                         American (California)
 */
import type { VoiceBank } from '../sakura/voice';

export type AsySpeaker = 'OKAFOR' | 'VANCE' | 'PILOT' | 'MATRON' | 'BYRNE' | 'HALLOWAY' | 'ELLIE' | 'PIP' | 'MAEVE' | 'SATO' | 'RAE';
type Chain = 'relay' | 'radio' | 'pa' | 'stage' | 'far' | 'close';

export interface AsyLine {
  id: string;
  who: AsySpeaker;
  text: string;
  voice: string;
  how: string;
  chain: Chain;
  say: string;
  /** The game's own words this line voices (a mission call, a freed survivor's thanks), when they are not `text`. */
  match?: string;
}

/** The caption's name for each speaker. */
export const ASY_LABEL: Record<AsySpeaker, string> = {
  OKAFOR: 'DR. OKAFOR',
  VANCE: 'VANCE',
  PILOT: 'PILOT',
  MATRON: 'THE MATRON',
  BYRNE: 'T. BYRNE  //  TAPE',
  HALLOWAY: 'NURSE HALLOWAY',
  ELLIE: 'ELLIE',
  PIP: 'PIP',
  MAEVE: 'SISTER MAEVE',
  SATO: 'DR. SATO',
  RAE: 'COOK',
};

/** The survivors' names in `config.ts` (SURVIVORS.asylum) by speaker. */
export const SURVIVOR_SPEAKER: Record<string, AsySpeaker> = {
  'Nurse Halloway': 'HALLOWAY',
  'Ellie Crane': 'ELLIE',
  'Pip Arden': 'PIP',
  'Sister Maeve': 'MAEVE',
  'Dr. Yuki Sato': 'SATO',
};

const CAST: Record<AsySpeaker, { voice: string; accent: string; how: string; chain: Chain }> = {
  OKAFOR: { voice: 'laura', accent: 'American accent', how: 'a Nigerian-American doctor from Houston in her forties, on a squad headset: warm, calm, precise, compassionate, steel underneath', chain: 'radio' },
  VANCE: { voice: 'alice', accent: 'Scottish accent', how: 'a Scottish marksman in her thirties with a strong Glasgow accent, on a squad headset: dry, blunt, quick, dark humour', chain: 'radio' },
  PILOT: { voice: 'charlie', accent: 'Australian accent', how: 'an Australian helicopter pilot on the radio over rotor noise: laconic, tense, fast', chain: 'radio' },
  MATRON: { voice: 'lily', accent: 'old-fashioned upper-class English accent', how: 'an elderly English head nurse from the 1950s, refined and gentle, long dead, heard through old hospital loudspeakers: soft, kind, wrong', chain: 'pa' },
  BYRNE: { voice: 'george', accent: 'Yorkshire accent', how: 'an exhausted Yorkshire orderly recording on an old cassette, frightened, whispering in the dark', chain: 'relay' },
  HALLOWAY: { voice: 'lily', accent: 'Irish accent', how: 'an Irish night nurse from Cork in her fifties, fierce and practical, close by', chain: 'close' },
  ELLIE: { voice: 'jessica', accent: 'soft southern English accent', how: 'a frightened sixteen-year-old English girl who has been locked up for weeks: small, breathy, hesitant, close by', chain: 'close' },
  PIP: { voice: 'sarah', accent: 'London accent', how: 'a young London trainee nurse, chatty and nervous, talking fast, close by', chain: 'close' },
  MAEVE: { voice: 'river', accent: 'Welsh accent', how: 'an elderly Welsh nun with a lilting voice, gentle and unafraid, close by', chain: 'close' },
  SATO: { voice: 'matilda', accent: 'American accent', how: 'a calm Californian doctor in her thirties, dry and focused, close by', chain: 'close' },
  RAE: { voice: 'bella', accent: 'light American accent', how: 'the asylum cook in her late twenties, cocky and flirty and enjoying it, close by', chain: 'close' },
};

const L = (id: string, who: AsySpeaker, text: string, tag: string, match?: string): AsyLine => {
  const c = CAST[who];
  return { id, who, text, voice: c.voice, how: `${c.how}: ${tag}`, chain: c.chain, say: `[${c.accent}] [${tag}] ${text}`, ...(match ? { match } : {}) };
};

export const ASY_LINES: readonly AsyLine[] = [
  // ---- the way in ----
  L('okafor_brief', 'OKAFOR', "Blackwood Hill. I worked these wards before the fall - I know where they kept the paper. Start in the admin offices, up the drive. If anyone wrote down what happened here, it's in there.", 'calm briefing, a trace of dread', 'Lantern team, you are inside the walls and it is full dark. Blackwood kept files on what happened here. Start in the admin offices and follow them.'),
  L('vance_brief', 'VANCE', "Quiet for a madhouse. I don't like quiet. Every one of them we drop pays - spend it on doors and guns.", 'dry, wary'),
  L('vance_boards', 'VANCE', "They're pulling the boards off the windows. Hold E at one to nail it back - and it pays.", 'quick, practical', 'They are pulling the boards off the windows - that is how they got into the wards the first time. Hold E at a window to nail them back.'),

  // ---- the files (story: said when each is taken) ----
  L('okafor_file_admin', 'OKAFOR', "Sundown cases - quiet by day, violent after dark. That's what's out there now, and this place knew it in 1958. Patient 117 was kept in the west ward. Let's find her card.", 'reading, troubled, then decisive'),
  L('okafor_file_ward', 'OKAFOR', "Ellie Crane. Sixteen. Mourne moved her upstairs, to the night nurses' floor. There's a fire escape from the yard - their floor is up there.", 'gentle, then focused'),
  L('okafor_file_nurses', 'OKAFOR', "Her day book. When the generators die, Ward Nine's door seals itself. We need the boiler house running before we can get in there.", 'reading quickly, alarmed'),
  L('okafor_file_nine', 'OKAFOR', "Lamps out at sundown. I am going in to settle them. That's the last thing she wrote.", 'quiet, shaken'),
  L('byrne_tape', 'BYRNE', "Byrne. Forty days. She walks at lights-out, same round, every night. I lit the furnace for the dead and it won't stop smoking. The damper's chained - the key's on her ring. God help whoever finds this.", 'whispering into a tape recorder, terrified, exhausted'),
  L('okafor_file_morgue', 'OKAFOR', "Her keys open the damper. Put her to rest, take the keys, shut the flue - and the black fog stops for good.", 'resolute'),

  // ---- where next (directions: dropped if already done when their turn comes) ----
  L('vance_dir_ward', 'VANCE', "West ward's the door on the left of the lawn. Cost us, but the card's in there.", 'brisk'),
  L('vance_dir_nurses', 'VANCE', 'Yard door at the back of the ward, fire escape on the wall. Up we go.', 'brisk'),
  L('vance_dir_power', 'VANCE', 'Boiler house is out past the east ward. Get those generators turning and hold the yard while they spin up.', 'brisk, focused'),
  L('okafor_dir_nine', 'OKAFOR', "Ward Nine is the top floor of the east wing - the fire escape on the yard side. The door should open now.", 'urgent, hopeful'),
  L('vance_dir_morgue', 'VANCE', "Before we knock on her door - the morgue. Back walk, east end. Byrne left something.", 'low, careful'),
  L('okafor_dir_lanterns', 'OKAFOR', "Lights-out here was the chapel bell, and the sisters never rang it until the three vigil lanterns were burning. They burn on the dead - kill those things close to a lantern. Light all three.", 'thoughtful, then decisive'),
  L('okafor_dir_bell', 'OKAFOR', "All three are burning. The bell rope is in the chapel, by the altar. Ring it when you're ready - she'll answer it.", 'quiet, steeling herself'),
  L('vance_dir_matron', 'VANCE', "Isolation block, back of the grounds. She'll be on her round. Head shots.", 'hard, focused'),
  L('okafor_dir_damper', 'OKAFOR', "The damper is at the foot of the stack, behind the morgue. Her keys - turn the wheel.", 'urgent'),
  L('okafor_lawn', 'OKAFOR', "That's everything. The lawn - radio the bird.", 'relieved, firm', 'Both contracts complete. Move to THE LAWN and radio the bird.'),

  // ---- the power ----
  L('vance_gens', 'VANCE', "Generators are turning over. Hold this yard till they're up to speed - every one of them heard that.", 'loud over machinery', 'Uplink initiated. Stay inside the marked area. They will come for the signal.'),
  L('vance_gens_co', 'VANCE', 'Generators are turning over. One of us stays in this yard till they are up to speed.', 'loud over machinery', 'Uplink initiated. One of you stays in that zone at all times - it counts for the whole squad.'),
  L('vance_gens_out', 'VANCE', "You've left the generators - get back in that yard!", 'sharp', "You're outside the relay zone. Get back in there."),
  L('okafor_power', 'OKAFOR', "Power's back. The perk machines are awake, and Ward Nine's door just let go.", 'pleased, quick', 'Relay restored. Nice work.'),
  L('vance_locked', 'VANCE', "Door's mag-locked. No power, no Ward Nine.", 'flat, annoyed'),

  // ---- the vigil lanterns and the bell ----
  L('maeve_lanterns', 'MAEVE', 'The vigil lanterns. We lit one for every soul that left this hill. Give them something to burn, child.', 'gentle, knowing'),
  L('vance_lantern_one', 'VANCE', "That's one burning. Don't ask me how.", 'dry, uneasy'),
  L('okafor_lantern_two', 'OKAFOR', 'Two lanterns lit. One more.', 'focused, encouraging'),
  L('okafor_bell_locked', 'OKAFOR', "The rope's tied off. The sisters never rang it before the lanterns were lit.", 'matter-of-fact'),
  L('vance_bell', 'VANCE', 'Well. Everyone heard that.', 'dry, tense, readying her rifle'),

  // ---- the night and the Matron ----
  L('matron_lightsout', 'MATRON', 'Lights out, my dears. Into your beds, now. Matron is coming round.', 'tender, slow, a lullaby voice through crackling loudspeakers'),
  L('okafor_wake', 'OKAFOR', "That was the old tannoy. That was her voice. She's started her round in the isolation block.", 'whispering, stunned'),
  L('okafor_matron_seen', 'OKAFOR', "That's her. That's Mourne. Don't let her scream - the whole ward comes when she does. Go for the face.", 'urgent, frightened', "That's her. That's Mourne. Don't let her scream - the whole ward comes when she does. Go for the face."),
  L('matron_seen', 'MATRON', "You're out of bed. That won't do. That won't do at all.", 'gentle, disappointed, then cold'),
  L('matron_rage', 'MATRON', 'Who put out my lamps?', 'a rising shriek of grief and fury'),
  L('matron_down', 'MATRON', 'Is everyone in bed? Then I can rest.', 'fading, peaceful, a last breath'),
  L('okafor_matron_down', 'OKAFOR', 'Rest now, Matron. Your round is over. Her keys - the damper at the foot of the stack.', 'soft, then decisive', 'Confirmed kill. The matron is down.'),
  L('okafor_damper_locked', 'OKAFOR', "It's chained, and the padlock is Mourne's. We need her keys.", 'frustrated'),
  L('okafor_damper', 'OKAFOR', "Flue's shut. Listen - the stack's gone quiet. That's the last of the fog.", 'relieved, awed'),

  // ---- the black fog ----
  L('vance_fog_warn', 'VANCE', "Stack's belching again - black fog's coming. Get clear of the back!", 'shouting, urgent'),
  L('okafor_fog_warn', 'OKAFOR', "The fog is coming off the crematorium again - and it's driving them ahead of it. Move!", 'urgent'),
  L('vance_fog_gone', 'VANCE', "Fog's pulling back. Catch your breath while you can.", 'breathing hard, relieved'),

  // ---- the bird ----
  L('pilot_call', 'PILOT', "Lantern, I'm not putting down on that hill in the dark. First light in sixty seconds - hold the lawn till then.", 'laconic, tense', 'Bird is inbound. Hold the perimeter - everything nearby is heading your way.'),
  L('pilot_approach', 'PILOT', 'Bird on approach. Mark your position.', 'tense, over rotors', 'Bird on approach. Mark your position.'),
  L('pilot_hot', 'PILOT', 'Coming in hot - clear the pad!', 'shouting over rotors', 'Coming in hot - clear the pad!'),
  L('pilot_ground', 'PILOT', "We're on the ground - get aboard, now!", 'shouting, urgent', "We're on the ground - get aboard, now!"),
  L('okafor_dawn', 'OKAFOR', "First light. Get aboard - and don't look back at the windows.", 'quiet, tired, relieved'),

  // ---- the squad ----
  L('vance_hit', 'VANCE', "I'm hit bad - cover me!", 'pained, shouting', "I'm hit bad - cover me!"),
  L('okafor_hit', 'OKAFOR', "I'm hit bad - cover me!", 'pained, shouting', "I'm hit bad - cover me!"),
  L('okafor_lost_vance', 'OKAFOR', "Vance is down. She's gone. Keep moving - please.", 'grief held back', 'We lost Vance. Keep the other one breathing.'),
  L('vance_lost_okafor', 'VANCE', "Doc's gone. Doc's gone. Keep moving.", 'stunned, angry', 'We lost Okafor. Keep the other one breathing.'),
  L('vance_glow', 'VANCE', "Something glowing where that one fell - walk through it. Don't ask.", 'dry', 'Something glowing where that one fell - whatever this place was cooking, it is on our side for once. Walk through it.'),

  // ---- the locked-in (freed: their thanks; then a word at the places that were theirs) ----
  L('halloway_freed', 'HALLOWAY', "Mary Halloway, night sister. Give me that pistol - I've waited forty days to use one.", 'fierce, grateful'),
  L('ellie_freed', 'ELLIE', "You're not her. You're real. She checks on me every night - please don't let her find me awake.", 'shaking, whispering'),
  L('pip_freed', 'PIP', "Oh thank God. Pip - trainee. I'm useless with a gun, so I'll stay right behind you, alright?", 'nervous, fast, relieved'),
  L('maeve_freed', 'MAEVE', "Bless you. I'll not carry a gun, child, but I'll walk with you - and I'll pray loudly.", 'warm, lilting'),
  L('rae_freed', 'RAE', "Rae - I ran the kitchen. Forty days on tinned peaches and I still look this good. Take me with you, sweetheart, I'm handy with sharp things.", 'cocky, flirty, relieved'),
  L('sato_freed', 'SATO', "Yuki Sato, resident. Hand me something with a trigger. I'll watch your back.", 'dry, steady'),
  L('ellie_nine', 'ELLIE', "This was her ward. She used to sing to them. I could hear it through the floor.", 'hushed, sad'),
  L('maeve_chapel', 'MAEVE', 'I kept the chapel lamp lit for her, every night. It did not help her.', 'quiet, sorrowful'),
  L('pip_matron', 'PIP', "That's Matron. Oh God - that's really her.", 'horrified whisper'),
  L('halloway_isolation', 'HALLOWAY', 'Isolation. She told me to lock the door behind her. I did. God forgive me.', 'hollow, guilty'),
  L('rae_ward', 'RAE', "See that room? My kitchen. Three hot meals a day for two hundred people, and not one of them ever said thank you. You can be the first.", 'dry, flirty'),
  L('rae_low', 'RAE', "Low on rounds? Come here, I'll show you where to hold it. The gun. Mostly.", 'flirty, teasing'),
  L('rae_reload', 'RAE', "Nine years on the night stove. I know hot, I know fast, and I know when something's done. Reload, gorgeous.", 'warm, flirty'),
  L('sato_fog', 'SATO', "Don't breathe that. Whatever's in it, it isn't smoke.", 'clinical, sharp'),
];

/** The score: none yet on Blackwood Hill (its own sound is the wind and the wards). */
export const ASY_CUES: readonly { id: string; loop: boolean; prompt: string }[] = [];

export const ASY_LINE: Record<string, AsyLine> = Object.fromEntries(ASY_LINES.map((l) => [l.id, l]));

/** The game's own words to the line that voices them (the mission's calls, the squad's cries, the thanks). */
export const ASY_BY_TEXT: ReadonlyMap<string, string> = new Map([
  ...ASY_LINES.map((l) => [l.text, l.id] as const),
  ...ASY_LINES.filter((l) => l.match).map((l) => [l.match!, l.id] as const),
  ...ASY_LINES.map((l) => [`${l.who}|${l.text}`, l.id] as const),
]);

/** The voice director's bank for Blackwood Hill. */
export const ASYLUM_BANK: VoiceBank = { base: './asylum/', lines: ASY_LINES, cues: ASY_CUES, label: ASY_LABEL };
