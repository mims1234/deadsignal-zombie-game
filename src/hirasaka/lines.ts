/**
 * Everything HIRASAKA says aloud. Each line is a file in `public/hirasaka/voice/` (`<id>.mp3`, made by
 * `scripts/hirasaka-audio.mjs`: ElevenLabs v4 or Fish Audio Drama 3, the best of several takes, each judged by an
 * audio model); `text` is the caption (the journal keeps the tapes). `how` is the direction the take was asked for.
 *
 * The cast (all original):
 *   NATSUKI    Natsuki Hirata, 19, a marine-engineering student; Genzō's granddaughter, raised on his stories
 *   GENZO      Genzō Hirata, foreman of Shaft Three in 1974, on the cassette tapes he hid round the island
 *   MIO        Mio Hirata, his wife, who went down with the night shift's supper on Obon night 1974
 *   KUROGANE   Tetsuji Kurogane, the mine's overseer, the first one bitten, still giving orders below
 *   SAKUMA     Daigo Sakuma, the old fisherman who brings you in on the Kaimaru; a boy on the island in 1974
 *   PA         the island's loudspeakers, still playing what they played the last week (Japanese, then English)
 */

export type Speaker = 'NATSUKI' | 'GENZO' | 'MIO' | 'KUROGANE' | 'SAKUMA' | 'PA' | 'MINER' | 'HAG' | 'SQUAD-F' | 'SQUAD-M';
/**
 * How a line is played (`sound.ts`): `tape` a worn cassette (hiss, wow), `radio` the boat's handset (squelch), `pa` the
 * island's horn speakers (narrow, echoing off the concrete), `phone` the gallery telephone, `close` at your ear, `far`
 * out in the dark, `monster` pitched down and darkened, `dry` as it is.
 */
export type Chain = 'tape' | 'radio' | 'pa' | 'phone' | 'close' | 'far' | 'monster' | 'dry';

export interface Line {
  id: string;
  who: Speaker;
  text: string;
  /** The Japanese the PA says (the caption shows it above the English). */
  ja?: string;
  model: 'eleven' | 'fish';
  voice?: string;
  how: string;
  chain: Chain;
  /** What the generator is given (direction tags inline), when it is not `text`. */
  say?: string;
}

const nat = (id: string, text: string, tag: string, chain: Chain = 'dry'): Line => ({ id: `nat_${id}`, who: 'NATSUKI', text, model: 'eleven', voice: 'laura', how: `a determined young Japanese woman of nineteen, warm and brave, a little scared: ${tag}`, chain, say: `[${tag}] ${text}` });
const genzo = (id: string, text: string, tag: string): Line => ({ id: `tape_${id}`, who: 'GENZO', text, model: 'eleven', voice: 'george', how: `an old Japanese miner recording a confession onto a cassette, slow, grieving, quiet: ${tag}`, chain: 'tape', say: `[${tag}] ${text}` });
const mio = (id: string, text: string, tag: string, chain: Chain = 'close'): Line => ({ id: `mio_${id}`, who: 'MIO', text, model: 'eleven', voice: 'matilda', how: `a gentle young woman's ghost, soft and sad, very close: ${tag}`, chain, say: `[${tag}] ${text}` });
const ku = (id: string, text: string, tag: string, chain: Chain = 'monster'): Line => ({ id: `ku_${id}`, who: 'KUROGANE', text, model: 'eleven', voice: 'callum', how: `a cold, harsh mine overseer, authoritarian, gravel in the voice: ${tag}`, chain, say: `[${tag}] ${text}` });
const sk = (id: string, text: string, tag: string): Line => ({ id: `sk_${id}`, who: 'SAKUMA', text, model: 'eleven', voice: 'brian', how: `an old fisherman on a boat radio in a storm, gruff and kind: ${tag}`, chain: 'radio', say: `[${tag}] ${text}` });
const pa = (id: string, ja: string, en: string): Line[] => [
  { id: `${id}_ja`, who: 'PA', text: en, ja, model: 'eleven', voice: 'river', how: 'a calm Japanese woman making a 1970s public announcement over loudspeakers, polite, measured', chain: 'pa', say: `[calm, measured, a public announcement over loudspeakers] ${ja}` },
  { id: `${id}_en`, who: 'PA', text: en, model: 'eleven', voice: 'river', how: 'the same announcer in English, polite and flat', chain: 'pa', say: `[calm, measured, a public announcement over loudspeakers] ${en}` },
];
const squad = (sex: 'F' | 'M', id: string, text: string, tag: string): Line => ({ id: `sq${sex.toLowerCase()}_${id}`, who: sex === 'F' ? 'SQUAD-F' : 'SQUAD-M', text, model: 'eleven', voice: sex === 'F' ? 'alice' : 'liam', how: tag, chain: 'dry', say: `[${tag}] ${text}` });

const SQUAD_LINES: [string, string, string][] = [
  ['tape', 'A cassette. Someone left these here on purpose.', 'curious, quiet'],
  ['photo', 'An old photograph.', 'soft, noticing'],
  ['dark', "My light! I can't see a thing!", 'panicked, blinded'],
  ['wave', 'Wave! Off the wall!', 'shouting, urgent'],
  ['looked', 'I looked back. She is closer!', 'terrified, breathless'],
  ['climb', "Keep climbing! Don't stop!", 'breathless, running, urgent'],
  ['push', 'Push! Put your back into it!', 'straining, shouting'],
  ['sealed', "It's done. It's sealed.", 'exhausted, quiet relief'],
  ['cage', 'Going down. Hold on.', 'tense, low'],
  ['peach', 'Peaches. They actually glow.', 'amazed, quiet'],
];

export const LINES: readonly Line[] = [
  // ---- Natsuki ----
  nat('arrive', 'That is it. Hirasaka. Grandpa said on clear nights you could hear the mine bell from the mainland. Tonight I can hear it through the storm.', 'awed, raising her voice over wind and rain'),
  nat('brief', "The cage down to Shaft Three needs three things. Grandpa's key from his flat in Block Sixty-five. Power from the lighthouse. And the sea gates open, so the galleries drain. Then we go down.", 'focused, explaining quickly over the storm'),
  nat('seawall', 'Careful on the seawall. In a typhoon the waves come right over it.', 'warning, raising her voice'),
  nat('market', 'Market Lane. Grandpa bought my mother ramune here. Every single summer.', 'soft, nostalgic, a small smile'),
  nat('school', 'The school. They held the Obon dance on its roof. Five thousand people on a rock this size, and they still found room to dance.', 'wistful, quiet'),
  nat('block65', 'Block Sixty-five. Nine floors of people. Grandpa lived in the little room on the roof.', 'looking up, quiet awe'),
  nat('summit', 'That is the stone. The one from the tapes. Someone rolled it back. From below.', 'frightened, almost a whisper'),
  nat('lighthouse', 'The lighthouse generator. Get it running and the whole island lights up.', 'determined'),
  nat('galleries', 'We are under the sea now. Listen. You can hear it right above us.', 'whispering, scared'),
  nat('village', 'A whole village. Down here. Grandpa was not making it up.', 'stunned, breathless whisper'),
  nat('roothall', 'The roots. They are people. The roots are holding people.', 'horrified, shaking'),
  nat('key', "Grandpa's cage key. Still on its nail by the door.", 'emotional, quiet'),
  nat('light', 'Hold the summit until it catches! They will come up every stair on the island!', 'shouting, urgent'),
  nat('lit', 'Look at it. The whole island is awake.', 'breathless wonder'),
  nat('valve', 'One gate open. The sea is going out of the galleries.', 'relieved, quick'),
  nat('gates', 'All three gates. The galleries are draining. We can go down.', 'determined'),
  nat('cage', 'This is it. Shaft Three. Hold on to something.', 'tense, low'),
  nat('peach', 'White peaches. Like the tape said. Throw one and they will not cross where it lands.', 'amazed, then urgent'),
  nat('hairpin', 'Her hairpin. A red camellia. Grandpa described it a hundred times.', 'tearful, very quiet'),
  nat('boss', 'That is him. Kurogane. He is still giving orders down here.', 'angry, afraid'),
  nat('bossdown', 'He is down. Something is moving in the roots.', 'shaky, wary'),
  nat('cable', 'The cable! The cage is gone. There is only the slope now!', 'shouting, panicked'),
  nat('dontlook', 'Do not look back. Whatever you hear behind you. Run, and do not look!', 'desperate, shouting'),
  nat('surface', 'We are out! The sea is coming over the wall! Climb! Climb!', 'shouting, running'),
  nat('stone', 'The stone! Push it! Push it back across!', 'shouting, straining'),
  nat('sealed', 'It is sealed. I am sorry, Grandma. I am so sorry.', 'crying softly'),
  nat('egg', 'Wait. Do not push. In all of his tapes, Grandpa never once said she tried to hurt him. Turn around. Let her see us.', 'trembling, certain'),
  nat('home', 'Grandma. She is going home.', 'crying, smiling'),
  nat('tape', 'Another one of his tapes.', 'quiet'),
  nat('photo', 'A photograph. Keep it. Keep all of them.', 'soft'),
  nat('wave', 'Wave! Get off the wall!', 'shouting'),
  nat('down', 'I am hit! I need you!', 'pained, urgent'),
  nat('rise', 'The water is still rising. Higher! Go higher!', 'panicked, shouting'),
  // ---- Genzō's tapes ----
  genzo('1', 'This is Genzō Hirata, foreman, Shaft Three. It is the twentieth of August, nineteen seventy-four. The company says it was gas. It was not gas. If this island has been opened again, listen to me before you go down.', 'tired, steady, a confession'),
  genzo('2', 'On the thirteenth, Obon night, the night shift could not come up for the dance. So my wife Mio took their supper down, the way she did every year. At nine the pumps stopped. At ten past nine, Shaft Three broke into something under the sea. I went down after her.', 'slow, remembering, grief'),
  genzo('3', 'The men were still working when I found them. Swinging at the coal with nothing in their eyes. Kurogane, the overseer, told us to keep the seam open, whatever came up. He had been bitten a week before. He hid it under his gloves.', 'bitter, quiet anger'),
  genzo('4', 'Below the seam there is a village. Older than the island. Its doors were open and its people were waiting. Mio was there, under a tree of white peaches. She threw a peach, and the dead would not cross where it fell. She said: walk ahead of me. Do not look back.', 'hushed, wonder and fear'),
  genzo('5', 'I walked up the slope with her hand in mine. Halfway, her hand went cold. She said, do not look at me. I looked. I am sorry, Mio. I ran. Kurogane cut the cable and we rolled the stone across, with her on the other side. If it is open again, the stone must go back.', 'breaking down, whispering at the end'),
  // ---- Mio ----
  mio('call', "Genzō? It is me. The telephone in the gallery still works. I am not angry. I never was. I only wanted to come home for the dance. If you ever come back, do not be afraid of my face. Just turn around, and let me see you.", 'soft, loving, a little lost, on an old phone line', 'phone'),
  mio('wake', 'Genzō? Is that you? You came back.', 'a hopeful whisper from far away', 'far'),
  mio('dontlook1', 'Do not look at me.', 'a whisper right at the ear, pleading'),
  mio('dontlook2', 'Please. Do not look.', 'a breathy whisper, close, frightened'),
  mio('wait', 'Wait for me. You are walking too fast.', 'gentle, out of breath, close behind'),
  mio('why', 'Why do you always run?', 'hurt, quiet'),
  mio('looked', 'You looked.', 'cold, hollow, very close', 'monster'),
  mio('stone', 'Not again. Please, not again.', 'desperate, crying'),
  mio('seen', 'You have his eyes.', 'tender, amazed, crying softly'),
  mio('home', 'Thank you. I can hear the dance.', 'peaceful, fading, happy'),
  // ---- Kurogane ----
  ku('wake', 'Who gave you leave to come down? This seam stays open.', 'cold fury, loud'),
  ku('orders', 'Back to work. All of you. Back to work!', 'barking orders, furious'),
  ku('company', 'The company decides who comes up.', 'cold, contemptuous'),
  ku('hurt', 'I sealed this pit with my own hands. I will not be the one buried in it.', 'roaring, wounded'),
  ku('fall', 'The shift... is over.', 'dying, a long breath'),
  ku('near', 'Gloves on. Head down. Keep swinging.', 'menacing murmur'),
  // ---- Captain Sakuma ----
  sk('drop', 'This is as close as the Kaimaru goes in this sea. I will stand off the north side. When I see the lighthouse, I will know you are alive. Go on, girl.', 'shouting over the storm, gruff, caring'),
  sk('light', 'I see the light! First time in fifty-two years!', 'overjoyed, shouting'),
  sk('surge', 'Storm surge coming in! The whole south side is going under! Get high! Get high!', 'shouting, alarmed'),
  sk('dawn', 'The sky is clearing. I am coming in for you.', 'relieved, warm'),
  sk('photo', 'That is me on the bow. I was nine. Mio gave every child a peach on Obon night.', 'nostalgic, choked up'),
  sk('stone', 'The stone is moving! I can see it from here! Keep pushing!', 'shouting, urgent'),
  // ---- the island's loudspeakers ----
  ...pa('pa_shift', '第三坑、夜勤の皆さん。交代の時間です。', 'Shaft Three, night shift. It is time to change shifts.'),
  ...pa('pa_evac', '島民の皆さん、直ちに避難してください。船は桟橋で待っています。', 'All residents, evacuate at once. The boat is waiting at the pier.'),
  ...pa('pa_dance', '今夜は盆踊りです。学校の屋上へお集まりください。', 'Tonight is the Obon dance. Please gather on the school roof.'),
  ...pa('pa_gas', '第三坑で、ガス事故が発生しました。', 'There has been a gas accident in Shaft Three.'),
  ...pa('pa_dont', '坂を上るときは、決して振り返らないでください。', 'When you climb the slope, never look back.'),
  ...pa('pa_light', '灯台の発電機が、起動しました。', 'The lighthouse generator has started.'),
  // ---- the miners at work ----
  ...(
    [
      ['mn_1', 'One more seam. One more seam and we go up.', 'chris'],
      ['mn_2', 'Shift ends at six. Shift ends at six.', 'eric'],
      ['mn_3', 'Tell my wife I will be late.', 'will'],
      ['mn_4', 'Lamp is going out. Lamp is going out.', 'charlie'],
    ] as const
  ).map(([id, text, voice]): Line => ({ id, who: 'MINER', text, model: 'eleven', voice, how: 'an exhausted coal miner muttering to himself, hollow, monotone, half dead', chain: 'far', say: `[muttering to himself, hollow, exhausted, monotone] ${text}` })),
  // ---- the Hags of the Slope ----
  ...(
    [
      ['hag_1', 'Do not look. Do not look.'],
      ['hag_2', 'She is right behind you.'],
      ['hag_3', 'Turn around. Turn around.'],
    ] as const
  ).map(([id, text]): Line => ({ id, who: 'HAG', text, model: 'fish', how: 'an old woman whispering with a rasping, delighted cruelty', chain: 'monster', say: `(an old woman whispering, raspy, cruel, a soft giggle, very quiet) ${text}` })),
  // ---- the squad ----
  ...SQUAD_LINES.flatMap(([id, text, tag]) => [squad('F', id, text, tag), squad('M', id, text, tag)]),
];

export const LINE: Record<string, Line> = Object.fromEntries(LINES.map((l) => [l.id, l]));

/**
 * The score: Lyria cues (`public/hirasaka/music/<id>.mp3`), each a 30 s clip. The island's motif runs through all of
 * them: five notes of a pentatonic phrase, the mine bell's tune.
 */
export const CUES = [
  { id: 'island', loop: true, prompt: 'A Japanese island at night in a typhoon. A lonely shakuhachi plays a slow five-note pentatonic phrase, a koto answers it, low strings hold a dark chord, a very distant taiko heartbeat, wind and rain texture under everything. Melancholy, cinematic anime score. Constant level, no build, seamless loop.' },
  { id: 'hold', loop: true, prompt: 'Driving anime action tension: a fast koto ostinato, a relentless taiko pattern, low strings pulsing in eighths, the same five-note pentatonic phrase played by horns over the top, rain and thunder far off. Constant high energy from the first second to the last, loopable.' },
  { id: 'descent', loop: false, prompt: 'A cage lift descending into a deep coal mine. Seconds 0-5: metallic clanks in a slow rhythm and a cable humming. 5-15: a deep descending bass glissando, a distant male choir. 15-25: a five-note pentatonic phrase on a toy piano, pitched low, dripping water. 25-30: everything drops to a single low drone. Dark, cinematic.' },
  { id: 'deep', loop: true, prompt: 'Underground beneath the sea: water dripping in a slow rhythm, a low male choir humming one long chord, a bowed metal drone, a five-note pentatonic phrase on a toy piano far away, cold and lonely. Ambient horror, constant level, seamless loop.' },
  { id: 'village', loop: true, prompt: 'A drowned old Japanese village lit by glowing fruit: a nostalgic children\'s folk melody on toy piano and koto, a gentle shamisen, soft pads, slow and dreamlike, warm but quietly wrong. Constant level, seamless loop.' },
  { id: 'overseer', loop: true, prompt: 'An anime boss battle in a coal mine: industrial taiko and anvil hits, distorted low brass playing a brutal five-note pentatonic riff, a heavy stomping march, metal chains, menacing male choir shouts. Constant intensity, loopable.' },
  { id: 'climb', loop: true, prompt: 'The chase up the slope, an epic anime finale: fast taiko and timpani, full strings in desperate rising runs, a choir chanting, a five-note pentatonic phrase soaring on shakuhachi and horns, heartbeat pulse, relentless and emotional. Constant maximum intensity from the first second, loopable.' },
  { id: 'sealed', loop: false, prompt: 'An anime ending: solo piano and soft strings, bittersweet and tired, the storm clearing at dawn over the sea, a five-note pentatonic phrase played slowly once, then fading out. Quiet grief and relief.' },
  { id: 'home', loop: false, prompt: 'A healing anime ending at sunrise: a five-note pentatonic phrase in a warm major key on koto and shakuhachi, a gentle choir, a festival dance drum far away, tender and joyful, swelling softly and then fading out.' },
  { id: 'loading', loop: true, prompt: 'A small fishing boat crossing a rough sea at night: waves and creaking wood, a solo shakuhachi playing a sparse five-note pentatonic phrase, a low drone. Calm, lonely, seamless loop.' },
] as const;
