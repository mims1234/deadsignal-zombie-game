/**
 * Everything HIRASAKA says aloud. Each line is a file in `public/hirasaka/voice/` (`<id>.mp3`); `text` is the caption
 * (the journal keeps the tapes). `how` is the direction a take is asked for; `say` is what the generator is given (the
 * direction as a leading tag, macrons dropped so the names are read right). Made by `scripts/hirasaka-audio.mjs`
 * (ElevenLabs v4 Turbo through OpenRouter, the hags on Fish Audio Drama 3). A line marked `fresh` has no take yet and
 * plays as its caption only until its voice is made.
 *
 * The cast (all original), each with a voice nobody else on the island uses (`CAST`). Picked 2026-11-22 from three
 * auditions each (`research_notes/hirasaka/voice-samples/`, judged by an audio model for fit and for sounding unlike the rest):
 *   NATSUKI    Natsuki Arai, the survey's structural engineer: dry, precise, kind underneath        matilda  (over laura, sarah)
 *   DAIGO      Daigo Hirata, Genzō's grandson, the ferryman: plain, a little rough, grief worn down  harry    (over roger, chris)
 *   GENZO      Genzō Hirata, Shaft Three, lamp 211, on his cassettes: old, worn, warm               bill     (over george, brian)
 *   MIO        Mio Hirata, his younger sister, lost in 1974: eerie, tender, never shrill            bella    (over lily, jessica)
 *   KUROGANE   the overseer who shut the cage on the shift below: hard and low (pitched down)       adam     (over daniel, callum)
 *   FUNAYŪREI  the drowned in the flooded gallery, whispering for a ladle                           sarah + daniel together
 *                (sarah alone was the best whisper but too close to Mio; two at once are many, and nothing like her)
 *   PA         the island's loudspeakers, the last week's announcements (Japanese, then English)    river
 *   MINER      the night shift muttering at the seam                                                chris, eric, will, charlie
 *   HAG        the hags of the slope                                                                Fish Audio Drama 3
 *   SQUAD-F/M  you, the player                                                                      alice / liam
 * Mio never uses contractions (she speaks as 1974 left her); Genzō does, like an old man talking to a tape.
 */

export type Speaker = 'NATSUKI' | 'DAIGO' | 'GENZO' | 'MIO' | 'KUROGANE' | 'FUNAYŪREI' | 'PA' | 'MINER' | 'HAG' | 'SQUAD-F' | 'SQUAD-M';
/**
 * How a line is played (`sound.ts`): `tape` a worn cassette (hiss, wow), `radio` a handset (squelch), `pa` the island's
 * horn speakers, `phone` the gallery telephone, `close` at your ear, `far` out in the dark, `monster` pitched down and
 * darkened, `dry` as it is.
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
  /** No take yet (a caption until its voice is made). */
  fresh?: boolean;
}

/** One ElevenLabs voice per speaker (`a+b`: both at once), never shared (a test holds it). */
export const CAST = {
  NATSUKI: 'matilda',
  DAIGO: 'harry',
  GENZO: 'bill',
  MIO: 'bella',
  KUROGANE: 'adam',
  /** Two whispers at once, a woman and a man: the drowned are many (alone, either sounded too like Mio). */
  'FUNAYŪREI': 'sarah+daniel',
  PA: 'river',
  'SQUAD-F': 'alice',
  'SQUAD-M': 'liam',
} as const;
/** The four miners at the seam, one voice each, none of them anyone else's. */
export const MINER_VOICES = ['chris', 'eric', 'will', 'charlie'] as const;

/** The words as the generator should read them: macrons dropped (Genzō → Genzo), so the names come out right. */
const plain = (s: string): string => s.replace(/ō/g, 'o').replace(/ū/g, 'u').replace(/Ō/g, 'O').replace(/Ū/g, 'U');
const tagged = (tag: string, text: string): string => `[${tag}] ${plain(text)}`;

const nat = (id: string, text: string, tag: string): Line => ({ id: `nat_${id}`, who: 'NATSUKI', text, model: 'eleven', voice: CAST.NATSUKI, how: `a Japanese structural engineer in her thirties, dry and precise, warm underneath: ${tag}`, chain: 'dry', say: tagged(tag, text) });
const dg = (id: string, text: string, tag: string): Line => ({ id: `dg_${id}`, who: 'DAIGO', text, model: 'eleven', voice: CAST.DAIGO, how: `a Japanese ferryman of about thirty, plain-spoken, a little rough, grief worn smooth: ${tag}`, chain: 'dry', say: tagged(tag, text) });
const genzo = (id: string, text: string, tag: string): Line => ({ id: `tape_${id}`, who: 'GENZO', text, model: 'eleven', voice: CAST.GENZO, how: `an old Japanese miner talking into a cassette recorder, slow, worn, warm: ${tag}`, chain: 'tape', say: tagged(tag, text) });
const mio = (id: string, text: string, tag: string, chain: Chain = 'close'): Line => ({ id: `mio_${id}`, who: 'MIO', text, model: 'eleven', voice: CAST.MIO, how: `a girl of eighteen from 1974, a ghost: soft, tender, a little eerie, never shrill: ${tag}`, chain, say: tagged(tag, text) });
const ku = (id: string, text: string, tag: string): Line => ({ id: `ku_${id}`, who: 'KUROGANE', text, model: 'eleven', voice: CAST.KUROGANE, how: `a mine overseer, hard and low, a man who has never been disobeyed: ${tag}`, chain: 'monster', say: tagged(tag, text) });
const funa = (id: string, text: string): Line => ({ id: `fy_${id}`, who: 'FUNAYŪREI', text, model: 'eleven', voice: CAST['FUNAYŪREI'], how: 'a drowned woman whispering out of black water, breathy, cold, pleading, barely voiced', chain: 'far', say: tagged('whispering, breathy, cold, pleading, barely voiced', text) });
const pa = (id: string, ja: string, en: string): Line[] => [
  { id: `${id}_ja`, who: 'PA', text: en, ja, model: 'eleven', voice: CAST.PA, how: 'a calm Japanese woman making a 1970s public announcement over loudspeakers, polite, measured', chain: 'pa', say: `[calm, measured, a public announcement over loudspeakers] ${ja}` },
  { id: `${id}_en`, who: 'PA', text: en, model: 'eleven', voice: CAST.PA, how: 'the same announcer in English, polite and flat', chain: 'pa', say: `[calm, measured, a public announcement over loudspeakers] ${en}` },
];
const squad = (sex: 'F' | 'M', id: string, text: string, tag: string): Line => ({ id: `sq${sex.toLowerCase()}_${id}`, who: sex === 'F' ? 'SQUAD-F' : 'SQUAD-M', text, model: 'eleven', voice: sex === 'F' ? CAST['SQUAD-F'] : CAST['SQUAD-M'], how: tag, chain: 'dry', say: `[${tag}] ${text}` });

const SQUAD_LINES: [string, string, string][] = [
  ['tape', 'A cassette. Someone left these here on purpose.', 'curious, quiet'],
  ['photo', 'An old photograph.', 'soft, noticing'],
  ['dark', "My light! I can't see a thing!", 'panicked, blinded'],
  ['wave', 'Wave! Off the wall!', 'shouting, urgent'],
  ['looked', 'I looked back. She is closer!', 'terrified, breathless'],
  ['climb', "Keep climbing! Don't stop!", 'breathless, running, urgent'],
  ['haul', 'Haul! Keep it turning!', 'straining, shouting'],
  ['sealed', "It's over.", 'exhausted, quiet, disbelieving'],
  ['cage', 'Going down. Hold on.', 'tense, low'],
  ['peach', 'Peaches. They actually glow.', 'amazed, quiet'],
];

export const LINES: readonly Line[] = [
  // ---- the opening, on the pier ----
  dg('ferry', 'She held for forty years. Not tonight.', 'flat, soaked, watching his boat break up on the rocks'),
  nat('nobody', 'So nobody comes for us until the wind drops. Fine. We came for the buildings.', 'steadying herself, wry'),
  dg('bell', "That's the cage bell. Shaft Three. Grandad said the last time it rang, it rang for three days.", 'very quiet, the hair standing up'),
  nat('brief', "It's a steam winder. The boiler's under Block Thirty-one, and nobody rides a cage down with the fan dead.", 'thinking aloud, professional'),
  dg('keyroom', 'He never handed in his cage key. Block Sixty-five, top floor. The stairs went in the ninety-one typhoon.', 'remembering'),
  nat('bridge', 'Then we go through the school. The top floor bridges across.', 'decided'),
  // ---- places, the first time anyone walks in ----
  nat('seawall', 'Off the seawall when the big ones come in.', 'warning, raising her voice over the surf'),
  dg('shiofuri', 'Shio-furi. In a typhoon the sea comes over the roofs and falls on you like rain.', 'raising his voice over the water'),
  nat('nikkyu', 'Nine floors on the sea side, three against the rock. Whoever drew this was brilliant. Or desperate.', 'looking up, impressed despite herself'),
  nat('block30', "Block Thirty. Nineteen sixteen, salt in the mix, and it's still standing. Don't lean on the balconies.", 'dry, fond'),
  nat('market', "They left in a week. You can tell by what they didn't bother to take.", 'quiet'),
  dg('block31', 'Grandad bathed down there after every shift. Black water, every night.', 'soft'),
  nat('school', 'They held the Obon dance on this roof. Five thousand people on a rock this size, and still room to dance.', 'wistful, quiet'),
  dg('block65', "That's his window. Top floor, the one with the bars. He watched the pithead from there.", 'pointing, low'),
  nat('summit', 'Someone moved that stone. From the wrong side.', 'frightened, almost a whisper'),
  dg('pithead', "Lamp room, bath, winding house. Grandad's whole life between those three doors.", 'quiet, taking it in'),
  nat('landing', "Six hundred and thirty-six metres. There's a whole sea on top of us.", 'hushed'),
  nat('galleries', "Hear that? That's the tide. Through the rock.", 'whispering, scared'),
  dg('village', "He wasn't making it up. Any of it.", 'stunned, breathless'),
  nat('kofun', "Dry stone, no mortar. Whoever built this, it wasn't the Company.", 'touching the wall, uneasy'),
  nat('roothall', "Don't count them. Please. Just don't count them.", 'horrified, shaking, barely holding together'),
  // ---- act I ----
  dg('ladles', 'Grandad always took a bath ladle down the pit. I thought it was for the heat.', 'picking one up, puzzled'),
  dg('coal', 'He said this boiler ate a sack an hour and still complained.', 'a small smile'),
  nat('steam', "Pressure's coming up. Listen to it knock.", 'satisfied'),
  dg('shutter', 'Fifty years of salt in that.', 'grunting'),
  nat('air', "Fan's turning. You can feel it pull.", 'relieved'),
  dg('key', 'His key. Still on the nail, like he was going back on Monday.', 'emotional, quiet'),
  dg('sea', "Umibozu. Don't stare at it. Boats that stare go under.", 'afraid, very low'),
  nat('umi', "It's going for the shaft head. That winch on the seawall, does it still fire?", 'urgent, fast'),
  dg('mori', "It's a whaling winch. The harpoon head's in the fishermen's shed, the cutter's on the pier.", 'urgent'),
  nat('hit', 'It felt that!', 'shouting'),
  nat('ready', "Hear that? The drum's taking the weight.", 'breathless'),
  // ---- act II ----
  nat('cage', 'Two minutes to the bottom. Somebody talk.', 'tense, low, trying to sound calm'),
  dg('tags', 'Every tag on this side went down and never came back up.', 'barely above a whisper'),
  dg('funa', 'Funayurei. Give them a ladle with the bottom knocked out, or they bail the sea into your boat.', 'hushed, certain'),
  nat('funapass', "Poor things. They'll be bailing forever.", 'whispering, sad'),
  dg('drift', "Roof's come in over the drift. Grandad would have had that open in ten swings.", 'assessing'),
  nat('hearth', "It's still warm. Who's been keeping this fire?", 'uneasy'),
  dg('eat', "Don't! In every story he told, you never eat down here.", 'sharp, too late'),
  nat('mark', "Your hand. That wasn't there before.", 'alarmed, quiet'),
  dg('wash', 'The pithead bath. Grandad said it washed the pit off you.', 'thinking'),
  nat('rice', "Still wrapped. She never ate a grain.", 'very quiet, moved'),
  nat('roots', "They won't take a saw. They've grown through the iron.", 'frustrated'),
  dg('tachi', 'Grandad gave the summit shrine a sword in seventy-four. He never said why.', 'realising'),
  dg('hairpin', 'Her hairpin. A red camellia. Grandad drew it on everything.', 'tearful, very quiet'),
  nat('boss', "Kurogane. He's still running the shift.", 'angry, afraid'),
  nat('ku1', 'The hoist! Drop the skips on him!', 'shouting'),
  nat('ku2', 'The gas! Get the fan on it!', 'coughing, shouting'),
  nat('ku3', 'Pump the floor dry! The roots can reach him!', 'shouting'),
  nat('bossdown', "He's down. Something in the roots is breathing.", 'shaky, wary'),
  nat('cable', "That was the cable. There's only the slope now.", 'shaken, then hard'),
  dg('tree', 'It is blooming. In all his stories, the tree bloomed when she woke.', 'awed, frightened'),
  nat('peach', 'White peaches. Throw them behind us. Nothing dead will cross a peach.', 'amazed, then urgent'),
  nat('dontlook', "Whatever you hear behind us, don't look back. Not once.", 'low, desperate, deadly serious'),
  // ---- act III ----
  nat('surface', "We're out! The sea's coming in behind us. Up! Go up!", 'shouting, running'),
  nat('rise', "It's still coming. Higher!", 'panicked, shouting'),
  dg('rock', 'He shut it once with these chains. On his own.', 'breathless, in awe'),
  nat('winch', 'Every hand on a winch!', 'shouting, straining'),
  nat('sealed', "It's shut. It's shut.", 'exhausted, shaking, almost laughing'),
  dg('lasttape', 'He said to play this one when it was shut again.', 'quiet, taking out a cassette'),
  dg('egg', 'Wait. She never ate. She can still come up. Turn round. Let her see you.', 'trembling, certain'),
  dg('home', 'Go home, Mio-obasan.', 'crying, smiling'),
  nat('tape', 'Another of his tapes.', 'quiet'),
  nat('photo', 'Keep that. Someone should.', 'soft'),
  nat('wave', 'Wave! Get off the wall!', 'shouting'),
  nat('down', "I'm hit! I need you!", 'pained, urgent'),
  // ---- Genzō's tapes ----
  genzo('1', "Genzō Hirata. Shaft Three, lamp two-eleven. Twentieth of April, nineteen seventy-four. The last boat's just gone, and I'm not on it. The Company says the coal ran out. Whoever finds this... write down what I say instead.", 'tired, steady, a confession'),
  genzo('2', 'Every Obon my sister Mio carried the night shift its rice. Last summer the deep cut broke into a passage nobody dug. Stone on stone, older than the island. She heard someone crying in there. A voice she knew. And she went in.', 'slow, remembering, grief'),
  genzo('3', 'Kurogane shut the cage on the shift below. Forty men. He said gas. The Company said gas. The bell rang from the bottom for three days. On the fourth I wound the drum up by hand. Nobody came up who should have.', 'bitter, quiet anger'),
  genzo('4', "At the foot of that passage there's a hall, and a tree with two trunks. You never cut a forked tree underground. Mio was standing in its roots. She said, Nii-san, I'm cold. Walk ahead of me. Don't turn round.", 'hushed, wonder and fear'),
  genzo('5', "Halfway up, I looked. What was behind me wasn't my sister any more... and it was. I threw the tree's peaches and it wouldn't cross them. I rolled the stone across the top with her on the other side. If it ever moves again, roll it back. Or turn round. I could do neither.", 'quiet grief, slow, his voice breaking near the end'),
  genzo('last', "If you're hearing this, it's shut again. Through the stone she told me she'd take a thousand of us every day. I never answered her. I'm answering now. A thousand die each day, so fifteen hundred will be born. Go home, Daigo. Build something.", 'very old, at peace, gentle, a smile at the end'),
  // ---- Mio ----
  mio('call', 'Nii-san? It is me. The telephone down here still rings. I kept the rice. I have not eaten anything they gave me, I promise. If you come back for me, do not be afraid of my face. Just turn round.', 'soft, loving, a little lost, on an old phone line', 'phone'),
  mio('wake', 'Nii-san? Is that you? You came back for me.', 'a hopeful whisper from far away', 'far'),
  mio('dontlook1', 'Do not look at me.', 'a whisper right at the ear, pleading'),
  mio('dontlook2', 'Please, do not look.', 'a breathy whisper, close, frightened'),
  mio('wait', 'Wait for me. You are walking too fast.', 'gentle, out of breath, close behind'),
  mio('why', 'You ran last time too.', 'hurt, quiet, close behind'),
  mio('looked', 'You looked.', 'cold, hollow, very close', 'monster'),
  mio('stone', 'Not again. Please, not again.', 'desperate, crying'),
  mio('seen', 'You have his eyes.', 'tender, amazed, crying softly'),
  mio('home', 'Thank you. I can hear the dance.', 'peaceful, fading, happy', 'far'),
  // ---- Kurogane ----
  ku('wake', 'Who rang the cage? The shift stays below until I say.', 'cold fury, loud'),
  ku('orders', 'Back to work. All of you. Back to work!', 'barking orders, furious'),
  ku('company', 'The Company decides who comes up.', 'cold, contemptuous'),
  ku('hurt', 'I sealed this pit with my own hands. I will not be buried in it.', 'roaring, wounded'),
  ku('fall', 'The shift... is over.', 'dying, a long breath'),
  ku('near', 'Gloves on. Head down. Keep swinging.', 'menacing murmur'),
  // ---- the funayūrei in the flooded gallery (whispered, from the water) ----
  funa('1', 'Lend us a ladle...'),
  funa('2', 'The sea is so cold. A ladle. Just one.'),
  funa('3', 'We only want to bail it out.'),
  // ---- side stories (`sides.ts`) ----
  // the barber's scissors
  nat('sd_barber1', 'Every tool on its own nail, and one nail empty. The dust kept the shape of the scissors.', 'noticing, quiet'),
  dg('sd_barber2', 'Old Kubo. Grandad said he cut every head on the island, and nobody else touched those scissors.', 'remembering, fond'),
  nat('sd_barber3', 'Scissors on the writing table, and a postcard to the mainland. He got as far as Dear.', 'reading, wry'),
  dg('sd_barber4', "He'd have come back for these. Nobody came back for anything.", 'quiet, sad'),
  nat('sd_barber5', 'There. Back where the dust says they go.', 'satisfied, soft'),
  dg('sd_barber6', "Shop's open Monday, Kubo-san.", 'gentle, a small smile'),
  // the last ferry
  nat('sd_ferry1', 'Last sailing, Saturday the twentieth of April, nineteen seventy-four. Nobody ever rubbed it out.', 'reading the board, quiet'),
  dg('sd_ferry2', 'One ticket left in the book, paid for and never clipped.', 'puzzled'),
  dg('sd_ferry3', "That's Grandad's work coat. His lamp number's on the collar. Two-eleven.", 'stunned, quiet'),
  nat('sd_ferry4', "The ticket's still in the pocket. He bought it, walked all the way down here, took his coat off and went back.", 'slowly understanding, moved'),
  dg('sd_ferry5', "There. Now it's been used. I'll say he came across with me tonight.", 'emotional, steady'),
  // the fish pool
  nat('sd_pool1', 'A fish pool on a roof, nine floors over the sea. Silted to the brim.', 'surprised, fond'),
  dg('sd_pool2', "The kindergarten's. Every child had a fish. The pipe comes up from the tank in the back lane.", 'remembering a story'),
  dg('sd_pool3', 'It still runs! Fifty years of rain up there with nowhere to go.', 'surprised, laughing'),
  nat('sd_pool4', "Gravity feed. Up on the roof it'll be filling now.", 'pleased, practical'),
  nat('sd_pool5', 'The floor is painted. Fish. One for every child, each in its own colour.', 'quietly delighted'),
  dg('sd_pool6', 'Forty-one. The last class. They painted their own before they left.', 'soft'),
  // the cats
  nat('sd_cats1', "A cat? Out here? There's nobody left to feed it.", 'surprised, softening'),
  dg('sd_cats2', 'The cats never left. The fishing boats feed them. Look, it wants us to follow.', 'fond'),
  dg('sd_cats3', "There's another. They always go about in twos.", 'amused'),
  nat('sd_cats4', "They're taking us somewhere dry.", 'amused, following'),
  nat('sd_cats5', 'Kittens. Four of them, asleep on a tin.', 'whispering, charmed'),
  dg('sd_cats6', "The bar mama's savings tin. She fed them, so they kept it for her.", 'laughing softly'),
  // the last reel
  nat('sd_reel1', 'Threaded with nothing. The last reel never went on.', 'quiet, curious'),
  dg('sd_reel2', 'On the last night they showed whatever they had. Grandad said the final reel went missing.', 'remembering'),
  dg('sd_reel3', 'In the ticket window, packed to go back on the boat.', 'finding it'),
  nat('sd_reel4', "That's not a studio print. Someone filmed this here, on the island.", 'intrigued'),
  nat('sd_reel5', "It's running. Go and look at the screen.", 'excited, hushed'),
  nat('sd_reel6', 'The school roof, at the Obon dance. The whole island, nineteen seventy-four.', 'awed, quiet'),
  dg('sd_reel7', "There, by the drum. That's Grandad. And the girl next to him. That's Mio.", 'breathless, near tears'),
  // the sayonara letters
  nat('sd_letters1', "Letters from the children, for the closing. The box is nearly empty. The storm's had the door open.", 'gentle, noticing'),
  dg('sd_letters2', "They'll be all over the yard.", 'resigned'),
  nat('sd_lettera', 'Goodbye, island. Thank you for the sea. Sorry I threw stones at it.', "reading a child's letter aloud, gently amused"),
  nat('sd_letterb', 'Dear roof. I will not forget the dance. Please do not fall down.', "reading a child's letter aloud, tender"),
  nat('sd_letterc', 'To my fish, number eleven, the orange one. Somebody will feed you. I asked.', "reading a child's letter aloud, her voice catching"),
  nat('sd_letterd', 'Dear school. When I am grown up I will come back and open you again.', "reading a child's letter aloud, very soft"),
  dg('sd_letters3', "That's all of them. Let's put them back.", 'gentle'),
  nat('sd_letters4', 'There. All of them, back where they were meant to be read.', 'quiet, settled'),
  // okoze
  dg('sd_okoze1', "Yama-no-kami. The mountain's goddess. The miners gave her an okoze every month. The ugliest fish in the sea.", 'explaining, low'),
  nat('sd_okoze2', 'Why the ugliest?', 'puzzled'),
  dg('sd_okoze3', "She's plain, and jealous. Show her something uglier than herself and she laughs, and the roof holds.", 'matter-of-fact, a hint of a grin'),
  nat('sd_okoze4', 'That is the ugliest thing I have ever seen.', 'appalled, laughing'),
  dg('sd_okoze5', "Perfect. She'll love it.", 'delighted'),
  dg('sd_okoze6', 'There you are, Yama-no-kami. Uglier than you. Keep the roof up for us tonight.', 'reverent, half joking, bowing'),
  nat('sd_okoze7', "I'll take any help with the roof I can get.", 'dry, half serious'),
  // tankō-bushi (the moves only: never the song's words)
  dg('sd_tanko1', "Tankō-bushi. The miners' dance. Grandad danced it every Obon on the school roof.", 'fond, remembering'),
  nat('sd_tanko2', 'Five moves on the plate: dig, lift, shade the eyes, push, bow. The statues are all out of step.', 'reading the plate, thoughtful'),
  dg('sd_tanko3', "Dig, lift, look, push, bow. That's how he danced it.", 'quiet, moved'),
  nat('sd_tanko4', 'Five lamps in a ring. You can almost hear the drum.', 'soft, moved'),
  // drums for Mio
  genzo('sd_drums', 'The night Mio went, we searched the old way. A drum where the dark comes first, and her name, shouted, so the mountain would give her back. It never did. Try it for me.', 'tired, pleading, quiet'),
  dg('sd_drums1', 'When a child was taken, the whole village went out at dusk with drums, calling the name.', 'low, solemn'),
  dg('sd_call1', 'Mio! Mio Hirata! Come home!', 'shouting into the dark, raw'),
  nat('sd_call2', "Mio! We're here! Mio!", 'shouting into the dark, self-conscious, then meaning it'),
  dg('sd_call3', "Mio! Your brother's still waiting! Mio!", 'shouting, voice cracking'),
  mio('sd_answer', 'Nii-san? I hear the drum. I am here, under the stone. Keep calling me.', 'a faint answer from very far below, hopeful', 'far'),
  dg('sd_drums2', 'Did you hear that? Tell me you heard that.', 'shaken, urgent whisper'),
  nat('sd_drums3', 'I heard it.', 'shaken, whispering'),
  // the rice ball (and `nat_rice` above)
  nat('sd_rice1', 'Rice, soup, pickles. Laid for one, and not a grain gone.', 'uneasy, quiet'),
  dg('sd_rice2', 'Down here, if you eat what they give you, you belong to them. She knew the story too.', 'low, certain'),
  dg('sd_rice3', 'She kept it for the night shift. Every Obon she carried them their rice.', 'tearful, quiet'),
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
      ['mn_1', 'One more seam. One more seam and we go up.'],
      ['mn_2', 'Shift ends at six. Shift ends at six.'],
      ['mn_3', 'Tell my wife I will be late.'],
      ['mn_4', 'Lamp is going out. Lamp is going out.'],
    ] as const
  ).map(([id, text], i): Line => ({ id, who: 'MINER', text, model: 'eleven', voice: MINER_VOICES[i], how: 'an exhausted coal miner muttering to himself, hollow, monotone, half dead', chain: 'far', say: `[muttering to himself, hollow, exhausted, monotone] ${text}` })),
  // ---- the hags of the slope ----
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
 * them: five notes of a pentatonic phrase, the mine bell's tune. (`hold` is kept as the umibōzu's fight.)
 */
export const CUES = [
  { id: 'island', loop: true, prompt: 'A Japanese island at night in a typhoon. A lonely shakuhachi plays a slow five-note pentatonic phrase, a koto answers it, low strings hold a dark chord, a very distant taiko heartbeat, wind and rain texture under everything. Melancholy, cinematic anime score. Constant level, no build, seamless loop.' },
  { id: 'hold', loop: true, prompt: 'Driving anime action tension: a fast koto ostinato, a relentless taiko pattern, low strings pulsing in eighths, the same five-note pentatonic phrase played by horns over the top, rain and thunder far off. Constant high energy from the first second to the last, loopable.' },
  { id: 'descent', loop: false, prompt: 'A cage lift descending into a deep coal mine. Seconds 0-5: metallic clanks in a slow rhythm and a cable humming. 5-15: a deep descending bass glissando, a distant male choir. 15-25: a five-note pentatonic phrase on a toy piano, pitched low, dripping water. 25-30: everything drops to a single low drone. Dark, cinematic.' },
  { id: 'deep', loop: true, prompt: 'Underground beneath the sea: water dripping in a slow rhythm, a low male choir humming one long chord, a bowed metal drone, a five-note pentatonic phrase on a toy piano far away, cold and lonely. Ambient horror, constant level, seamless loop.' },
  { id: 'village', loop: true, prompt: "A drowned old Japanese village lit by glowing fruit: a nostalgic children's folk melody on toy piano and koto, a gentle shamisen, soft pads, slow and dreamlike, warm but quietly wrong. Constant level, seamless loop." },
  { id: 'overseer', loop: true, prompt: 'An anime boss battle in a coal mine: industrial taiko and anvil hits, distorted low brass playing a brutal five-note pentatonic riff, a heavy stomping march, metal chains, menacing male choir shouts. Constant intensity, loopable.' },
  { id: 'climb', loop: true, prompt: 'The chase up the slope, an epic anime finale: fast taiko and timpani, full strings in desperate rising runs, a choir chanting, a five-note pentatonic phrase soaring on shakuhachi and horns, heartbeat pulse, relentless and emotional. Constant maximum intensity from the first second, loopable.' },
  { id: 'sealed', loop: false, prompt: 'An anime ending: solo piano and soft strings, bittersweet and tired, the storm clearing at dawn over the sea, a five-note pentatonic phrase played slowly once, then fading out. Quiet grief and relief.' },
  { id: 'home', loop: false, prompt: 'A healing anime ending at sunrise: a five-note pentatonic phrase in a warm major key on koto and shakuhachi, a gentle choir, a festival dance drum far away, tender and joyful, swelling softly and then fading out.' },
  { id: 'loading', loop: true, prompt: 'A small fishing boat crossing a rough sea at night: waves and creaking wood, a solo shakuhachi playing a sparse five-note pentatonic phrase, a low drone. Calm, lonely, seamless loop.' },
] as const;
