/**
 * Everything MUJIN says aloud: the station's PA (Japanese, then English), the Stationmaster, Ren, the Bench Sitter's
 * whispers, the Tall Lady, the commuters and the squad's call-outs. Each line is a file in `public/mujin/voice/`
 * (`<id>.mp3`, made by `scripts/mujin-voices.mjs`: ElevenLabs v4 or Fish Audio Drama 3, the best of several takes);
 * `text` is the caption (the journal keeps them). `how` is the direction the take was asked for.
 */

export type Speaker = 'PA' | 'STATIONMASTER' | 'REN' | 'WHISPER' | 'TALL' | 'COMMUTER' | 'SQUAD-F' | 'SQUAD-M';
/** How a line is played (`sound.ts`): through the ceiling speakers, down a phone, at your ear, out in the dark. */
export type Chain = 'pa' | 'phone' | 'close' | 'far' | 'monster' | 'dry';

export interface Line {
  id: string;
  who: Speaker;
  text: string;
  /** The Japanese the PA says (the caption shows it above the English). */
  ja?: string;
  /** The generator and voice: ElevenLabs v4 by name, or Fish Drama 3 (the voice is in the direction). */
  model: 'eleven' | 'fish';
  voice?: string;
  how: string;
  chain: Chain;
  /** What the generator is given (direction tags inline), when it is not `text`. */
  say?: string;
}

const pa = (id: string, ja: string, en: string): Line[] => [
  { id: `${id}_ja`, who: 'PA', text: en, ja, model: 'eleven', voice: 'lily', how: 'a calm Japanese station announcer, recorded, slightly too slow', chain: 'pa', say: `[calm, measured, like a recorded station announcement] ${ja}` },
  { id: `${id}_en`, who: 'PA', text: en, model: 'eleven', voice: 'lily', how: 'the same announcer in English, polite, flat', chain: 'pa', say: `[calm, measured, like a recorded station announcement] ${en}` },
];

const master = (id: string, text: string, tag: string, chain: Chain = 'dry'): Line => ({ id, who: 'STATIONMASTER', text, model: 'eleven', voice: 'bill', how: `an old stationmaster: ${tag}`, chain, say: `[${tag}] ${text}` });
const ren = (id: string, text: string, tag: string, chain: Chain = 'phone'): Line => ({ id, who: 'REN', text, model: 'eleven', voice: 'sarah', how: `a frightened university student: ${tag}`, chain, say: `[${tag}] ${text}` });
const whisper = (id: string, text: string): Line => ({ id, who: 'WHISPER', text, model: 'fish', how: 'a dry, sexless whisper right at the ear, barely voiced', chain: 'close', say: `(whispering very quietly, breathy, almost no voice, close to the microphone) ${text}` });
const squad = (sex: 'F' | 'M', id: string, text: string, tag: string): Line => ({ id: `sq${sex.toLowerCase()}_${id}`, who: sex === 'F' ? 'SQUAD-F' : 'SQUAD-M', text, model: 'eleven', voice: sex === 'F' ? 'alice' : 'liam', how: tag, chain: 'dry', say: `[${tag}] ${text}` });

const SQUAD_LINES: [string, string, string][] = [
  ['spot', "That's not right. That wasn't like that before.", 'uneasy, low, noticing something'],
  ['report', "Reporting it. That's the change.", 'decisive, quiet'],
  ['clear', "Nothing's wrong this time. Ringing the all clear.", 'tense, deciding'],
  ['right', 'A lamp just came on.', 'relieved breath, quiet'],
  ['wrong', 'The lamps... they all went out.', 'dread, almost a whisper'],
  ['marked', 'She heard me. She is coming for me.', 'panicked, breathless'],
  ['punched', 'Where am I? This is the waiting room. Again.', 'disoriented, frightened'],
  ['back', "I'm back. I'm back on the platform.", 'shaky relief'],
  ['dawn', "The sky! It's getting lighter!", 'awed, hopeful'],
  ['board', 'Doors are open! Get on, get on!', 'shouting, urgent'],
];

export const LINES: readonly Line[] = [
  // ---- the station PA ----
  ...pa('pa_arrive', 'まもなく、一番線に、電車がまいります。黄色い線の内側まで、お下がりください。', 'A train will soon arrive at platform one. Please stand behind the yellow line.'),
  ...pa('pa_delay', 'ただいま、電車が遅れております。ご迷惑をおかけしております。', 'We are sorry. The train is delayed.'),
  ...pa('pa_name', 'むじん、むじん。お忘れ物のないよう、ご注意ください。', 'Mujin. Mujin. Please make sure you have all your belongings.'),
  ...pa('pa_time', 'ただいまの時刻は、四時五十七分です。', 'The time is four fifty-seven.'),
  ...pa('pa_bell', 'ベルが鳴り終わるまでに、駅の確認をお願いいたします。', 'Please check the station before the bell stops ringing.'),
  ...pa('pa_order', '駅の安全確認が、完了しました。ご協力、ありがとうございました。', 'The station has been checked. Thank you for your help.'),
  ...pa('pa_disorder', '駅に、異常があります。', 'There is something wrong with the station.'),
  ...pa('pa_wrong', '次は、よもつ。よもつ。お出口は、ありません。', 'The next stop is Yomotsu. Yomotsu. There is no exit on this side.'),
  ...pa('pa_express', '通過電車が、まいります。危ないですから、ご注意ください。', 'A through train is passing. Please stand well back.'),
  ...pa('pa_dawn', '始発電車が、まいります。', 'The first train of the morning is now arriving.'),
  ...pa('pa_doors', 'ドアが閉まります。ご注意ください。', 'The doors are closing. Please stand clear.'),
  ...pa('pa_night', '本日の運転は、すべて終了いたしました。', 'All services for today have ended.'),
  // ---- the Stationmaster ----
  master('sm_tickets', 'Tickets, please.', 'old man, formal, kind, unhurried'),
  master('sm_early', 'You are early. The dawn train does not come until the station is in order.', 'old man, patient, gentle'),
  master('sm_punch1', 'Your ticket. Thank you. One loop back.', 'old man, polite, quietly final', 'close'),
  master('sm_punch2', 'This ticket has been used before.', 'old man, softly, close, a little sad', 'close'),
  master('sm_kept', 'I have kept this station for a very long time.', 'old man, tired, proud'),
  master('sm_place', 'Everything in its place.', 'old man, murmuring to himself'),
  master('sm_pocket', 'Sit. Wait. The night goes round again.', 'old man, whispering, very close', 'close'),
  master('sm_lamps', 'Five lamps. So you can see it too.', 'old man, surprised, then cold'),
  master('sm_fight', 'Then the last thing out of place... is me.', 'old man, cold and very close, menacing', 'monster'),
  master('sm_fall', 'The dawn train. On time. For once.', 'old man, dying, a faint smile in the voice'),
  master('sm_ren', 'She was on the last train. I kept her ticket. I kept all of them.', 'old man, grief, quiet'),
  // ---- Ren ----
  ren('ren_call1', 'Hello? Is someone there? I am at a station that is not on any map.', 'whispering into a phone, scared, hopeful'),
  ren('ren_call2', 'The man in the cap says the train comes at dawn. It has been dawn for hours.', 'whispering, tired, trying not to cry'),
  ren('ren_call3', 'There was one more person on the bench than before. I counted. I counted twice.', 'whispering, shaking'),
  ren('ren_call4', 'My battery is at four percent. If you are here too, do not trust the clock.', 'whispering fast, urgent'),
  ren('ren_call5', 'I am on the platform. You keep walking past me.', 'quiet, hurt, very close to the phone'),
  ren('ren_seen', 'You can see me?', 'startled, a breath, wonder', 'close'),
  ren('ren_hold', 'Do not let go. If you let go, I go back to where I was.', 'urgent whisper', 'close'),
  ren('ren_safe', 'Okay. I will wait here. Come back for me when it is light.', 'brave, small voice', 'dry'),
  ren('ren_gone', 'Oh. So that is what I am.', 'quiet realisation, fading', 'far'),
  ren('ren_board', 'It is really morning. Thank you. Thank you.', 'crying with relief', 'dry'),
  ren('ren_end', 'The station has a name now. I can read it from the window.', 'soft, smiling', 'dry'),
  // ---- the Bench Sitter's whispers: where the change is ----
  whisper('wh_clock', 'the clock'),
  whisper('wh_timetable', 'the timetable'),
  whisper('wh_poster', 'the poster'),
  whisper('wh_mapboard', 'the map'),
  whisper('wh_umbrellas', 'the umbrellas'),
  whisper('wh_gates', 'the gates'),
  whisper('wh_lostprop', 'lost property'),
  whisper('wh_bench', 'this bench'),
  whisper('wh_window', 'the window'),
  whisper('wh_vending', 'the machine'),
  whisper('wh_sign', 'the sign'),
  whisper('wh_speaker', 'listen'),
  whisper('wh_rows', 'the ones waiting'),
  whisper('wh_bridge', 'up on the bridge'),
  whisper('wh_body', 'the one lying down'),
  whisper('wh_footprints', 'the footprints'),
  whisper('wh_tunnel', 'the tunnel'),
  whisper('wh_crossing', 'the crossing'),
  whisper('wh_shutter', 'the shop'),
  whisper('wh_rope', 'the rope'),
  whisper('wh_ren', 'her'),
  whisper('wh_none', 'nothing. nothing is wrong.'),
  // ---- the Tall Lady ----
  ...[1, 2, 3, 4].map((n): Line => ({ id: `tall_po${n}`, who: 'TALL', text: 'po... po... po...', model: 'fish', how: 'a woman humming a low, flat "po" sound, three times, slow and empty', chain: 'monster', say: '(a woman, low and hollow, slowly, with long gaps, not singing) po... po... po...' })),
  // ---- the commuters ----
  ...(
    [
      ['cm_1', "Yes... yes, I'm on the train.", 'chris'],
      ['cm_2', "I'll be late again. I'm sorry.", 'eric'],
      ['cm_3', 'Is this my stop? Is this my stop?', 'matilda'],
      ['cm_4', 'Which platform... which platform...', 'daniel'],
      ['cm_5', 'The four forty-four. The four forty-four.', 'roger'],
      ['cm_6', 'Sorry. Sorry. Excuse me. Sorry.', 'jessica'],
    ] as const
  ).map(([id, text, voice]): Line => ({ id, who: 'COMMUTER', text, model: 'eleven', voice, how: 'a commuter muttering to themselves, half asleep, hollow', chain: 'far', say: `[muttering to themselves, hollow, half asleep, monotone] ${text}` })),
  // ---- the squad ----
  ...SQUAD_LINES.flatMap(([id, text, tag]) => [squad('F', id, text, tag), squad('M', id, text, tag)]),
];

export const LINE: Record<string, Line> = Object.fromEntries(LINES.map((l) => [l.id, l]));

/** The score: Lyria cues (`public/mujin/music/<id>.mp3`), each a 30 s clip made from a second-by-second prompt. */
export const CUES = [
  { id: 'loop', loop: true, prompt: 'A slow, eerie loop: a lonely music box playing a simple six-note melody over a slightly detuned upright piano and the low electrical hum of platform lights. Calm but wrong, nostalgic Japanese summer night, cicadas far away. Constant level, no build, no drums. Seamless loop.' },
  { id: 'bell', loop: false, prompt: 'Twenty seconds of rising tension: a ticking clock pulse, a low string drone rising in pitch, the music-box melody stripped to two notes repeating faster and faster, ending suddenly.' },
  { id: 'master', loop: true, prompt: 'A slow, heavy waltz in three on low strings and a muffled upright piano, old-fashioned, dignified and menacing, like a ghostly stationmaster walking a platform with a lamp. Steady, loopable.' },
  { id: 'dawn', loop: false, prompt: 'A climactic anime finale: taiko drums and full strings build from quiet to huge over thirty seconds, the music-box melody returning in full orchestra, a train rushing in, hopeful and desperate at once.' },
  { id: 'morning', loop: false, prompt: 'A gentle, bittersweet ending: solo piano with soft strings, morning light after a long night, a train pulling away from a country station, quiet relief. Fades out.' },
  { id: 'passenger', loop: false, prompt: 'The same six-note music-box melody now in a warm major key, with soft piano and a gentle choir pad, tender and healing, like someone finally going home. Fades out.' },
  { id: 'loading', loop: true, prompt: 'The six-note music-box melody heard faintly through the window of a moving night train, muffled, with the rhythmic clack of rails and a low hum. Calm, sleepy, loopable.' },
] as const;
