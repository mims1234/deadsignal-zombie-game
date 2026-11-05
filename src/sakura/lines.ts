/**
 * Everything the Sakura District says aloud. Each line is a file in `public/sakura/voice/` (`<id>.mp3`, made by
 * `scripts/sakura-audio.mjs`: ElevenLabs v4 through OpenRouter, the best of several takes, each judged by an audio
 * model); `text` is the caption, `say` what the generator is given (direction in brackets), `how` the delivery asked
 * for. The voice director (`voice.ts`) plays them one at a time, by kind (`LineKind`), so none is lost when the player
 * does two things at once.
 *
 * The cast (all original):
 *   AOI       Aoi Kisaragi, the shrine keeper, seven years dead, on the shrine relay
 *   HANA      Hanabi unit's lead: steady, warm, in command
 *   YUZU      Hanabi unit's second: younger, wry, braver than she sounds
 *   COMMAND   Hanabi unit's command, on the radio from outside the ward
 *   PILOT     the helicopter
 *   PA        Sakuragi station's announcer, still running on the old tapes
 *   SAYO      Sayo Kurenai, the Crimson Empress, patient zero
 *   MEI       Mei Hoshino, the idol who never stopped singing
 *   MASK      the masked woman who follows you
 */

export type Speaker = 'AOI' | 'HANA' | 'YUZU' | 'COMMAND' | 'PILOT' | 'PA' | 'SAYO' | 'MEI' | 'MASK';

/**
 * How a line is played (`voice.ts`): `relay` Aoi through the shrine relay (narrow, a shimmer of reverb), `radio` the
 * team headsets and Command (band-limited, squelch), `pa` the station's speakers (echoing), `stage` Sayo in her
 * theatre (a hall), `far` out in the dark, `close` at your ear.
 */
export type Chain = 'relay' | 'radio' | 'pa' | 'stage' | 'far' | 'close';

export interface VoiceLine {
  id: string;
  who: Speaker;
  text: string;
  voice: string;
  how: string;
  chain: Chain;
  say: string;
  /** The game's own radio text this line voices (the mission's calls), when it is not `text`. */
  match?: string;
}

const CAST: Record<Speaker, { voice: string; how: string; chain: Chain }> = {
  AOI: { voice: 'alice', how: 'a gentle young Japanese shrine maiden, long dead, speaking over an old radio: soft, sorrowful, calm, kind', chain: 'relay' },
  HANA: { voice: 'sarah', how: 'a squad leader in her late twenties on a headset: steady, warm, quietly in command', chain: 'radio' },
  YUZU: { voice: 'jessica', how: 'a younger squad member on a headset: quick, wry, nervous humour over real fear', chain: 'radio' },
  COMMAND: { voice: 'will', how: 'a military commander on a radio from far away: calm, clipped, authoritative', chain: 'radio' },
  PILOT: { voice: 'eric', how: 'a helicopter pilot on the radio over rotor noise: tense, fast, professional', chain: 'radio' },
  PA: { voice: 'river', how: 'a calm Japanese railway announcer on station loudspeakers: polite, measured, flat', chain: 'pa' },
  SAYO: { voice: 'matilda', how: 'a once-beautiful actress, now a monster: dreamy, theatrical, broken, echoing in a theatre', chain: 'stage' },
  MEI: { voice: 'lily', how: 'a young pop idol, far away, voice worn out from singing for years: sweet, hollow, lonely', chain: 'far' },
  MASK: { voice: 'lily', how: 'a woman whispering right behind you: slow, soft, unsettling', chain: 'close' },
};

const L = (id: string, who: Speaker, text: string, tag: string, match?: string): VoiceLine => {
  const c = CAST[who];
  return { id, who, text, voice: c.voice, how: `${c.how}: ${tag}`, chain: c.chain, say: `[${tag}] ${text}`, ...(match ? { match } : {}) };
};

export const LINES: readonly VoiceLine[] = [
  // ---- COMMAND: the operation's calls (the mission's own radio, voiced) ----
  L('cmd_brief_op', 'COMMAND', "Hanabi unit, you're on the ground. Seven years of silence, and last night the shrine relay started transmitting on its own. We need that uplink - but the relay draws from the station substation, and the grid's been dead since the fall. Get down into the metro and put the power back.", 'calm, clipped, a briefing'),
  L('cmd_brief_kaika', 'COMMAND', "Hanabi unit, you're on the ground. We ran the voice on the shrine relay. Aoi Kisaragi - the shrine keeper, missing seven years. Listen to her. The bird doesn't fly in until whatever she started is finished.", 'calm, clipped, a briefing with a trace of unease'),
  L('cmd_power_op', 'COMMAND', "Power's flowing. The relay's live on our board. Get to the shrine and start the uplink - every infected in the ward will hear it.", 'satisfied, brisk'),
  L('cmd_nopower', 'COMMAND', "Relay's dead, Hanabi. No current. Restore the substation under the metro first.", 'firm, brief'),
  L('cmd_uplink', 'COMMAND', "Uplink running. Hold that courtyard until it's through - they'll come for the signal.", 'urgent, focused', 'Uplink initiated. Stay inside the marked area. They will come for the signal.'),
  L('cmd_uplink_co', 'COMMAND', 'Uplink running. One of you stays in that zone at all times - it counts for the whole squad.', 'urgent, focused', 'Uplink initiated. One of you stays in that zone at all times - it counts for the whole squad.'),
  L('cmd_outside', 'COMMAND', "You're outside the relay zone. Get back in there.", 'sharp', "You're outside the relay zone. Get back in there."),
  L('cmd_relay_done', 'COMMAND', 'Uplink complete. We have the whole district on the board. Nice work.', 'pleased, steady', 'Relay restored. Nice work.'),
  L('cmd_empress_next', 'COMMAND', "Next, the Empress. Kurenai Theatre, north side. The Court guards her - and the Court shoots back.", 'clipped, a warning'),
  L('cmd_empress_down', 'COMMAND', 'Confirmed kill. The Crimson Empress is down.', 'relieved, clipped', 'Confirmed kill. The crimson empress is down.'),
  L('cmd_both', 'COMMAND', 'Both contracts complete. Get to the hilltop and radio the bird.', 'brisk', 'Both contracts complete. Move to LZ HILLTOP and radio the bird.'),
  L('cmd_called', 'COMMAND', "Bird's inbound. Hold the perimeter - everything nearby is heading your way.", 'urgent', 'Bird is inbound. Hold the perimeter - everything nearby is heading your way.'),
  L('cmd_minute', 'COMMAND', 'One minute until the district is sealed. Call extraction now.', 'urgent, hard', 'One minute until the district is sealed. Call extraction now.'),
  L('cmd_surge_warn', 'COMMAND', "Containment's failing at the theatre. Surge in twenty seconds.", 'alarmed', 'Containment is failing at the compound. Surge in twenty seconds.'),
  L('cmd_surge', 'COMMAND', 'Contamination surge! Stay ahead of the front and get to the landing zone.', 'shouting over static', 'Contamination surge! Stay ahead of the front and reach the LZ.'),
  L('cmd_glow', 'COMMAND', 'Something glowing where that one fell - whatever this place was cooking, it is on our side for once. Walk through it.', 'puzzled, then dry'),
  L('cmd_lost_hana', 'COMMAND', "We lost Hana. Keep the other one breathing.", 'grim, controlled', 'We lost Hana. Keep the other one breathing.'),
  L('cmd_lost_yuzu', 'COMMAND', "We lost Yuzu. Keep the other one breathing.", 'grim, controlled', 'We lost Yuzu. Keep the other one breathing.'),
  L('cmd_aoi_ignore', 'COMMAND', 'Whoever that is, she is not your mission. Stick to the contracts, Hanabi.', 'flat, dismissive'),
  L('cmd_bloom_op', 'COMMAND', 'Hanabi, every reading in the ward just went red. What did you do?', 'alarmed'),
  L('pilot_approach', 'PILOT', 'Bird on approach. Mark your position.', 'tense, over rotors', 'Bird on approach. Mark your position.'),
  L('pilot_hot', 'PILOT', 'Coming in hot - clear the pad!', 'shouting over rotors', 'Coming in hot - clear the pad!'),
  L('pilot_ground', 'PILOT', "We're on the ground - get aboard, now!", 'shouting, urgent', "We're on the ground - get aboard, now!"),

  // ---- the squad: on the radio, and on the move ----
  L('hana_boss', 'HANA', "That's her - the Empress. She hits like a truck. Head shots, and don't let her close.", 'tense, focused', "That's her - the Empress. She hits like a truck. Head shots, and don't let her close."),
  L('hana_hit', 'HANA', "I'm hit bad - cover me!", 'in pain, urgent', "I'm hit bad - cover me!"),
  L('yuzu_hit', 'YUZU', "I'm hit bad - cover me!", 'in pain, frightened', "I'm hit bad - cover me!"),
  L('hana_aoi', 'HANA', "Aoi Kisaragi. She went missing seven years ago. That's who's on the relay?", 'quiet, unsettled'),
  L('yuzu_aoi', 'YUZU', 'Five charms. She sounds so sure of it. Maybe we keep an ear out.', 'curious, half joking'),
  L('hana_start_kaika', 'HANA', "If she's leading, we follow. Look at the ground - petals. She's marking the way.", 'quiet, decided'),
  L('yuzu_metro', 'YUZU', "First stop, the metro. It's pitch black down there - three fuses on the walls. Lovely.", 'wry, nervous'),
  L('yuzu_kisaragi_pa', 'YUZU', "Did the announcement just say Kisaragi? There's no Kisaragi on this line.", 'unnerved, whispering'),
  L('hana_key', 'HANA', 'Kurenai Biotech, level B2. Somebody scratched three words into it: never open this.', 'reading, quiet'),
  L('yuzu_key', 'YUZU', "So naturally, we're opening it.", 'dry, nervous'),
  L('hana_locked', 'HANA', "It's sealed. The lab needs a keycard - the army took them to their checkpoint at the freight yard.", 'brief'),
  L('hana_tree', 'HANA', 'The tree just moved. There is gold on the branches.', 'awed, hushed'),
  L('yuzu_wrong', 'YUZU', 'They went out! All of them - and something heard it!', 'panicked'),
  L('yuzu_bloom', 'YUZU', "The moon just went red. Every tree in the city is crimson - and there's a train at the station, with its lights on.", 'awed, frightened, quiet'),
  L('yuzu_relic', 'YUZU', "A petal cannon. Of course it's a petal cannon.", 'amused, impressed'),
  L('hana_relic', 'HANA', 'A drum that calls the thunder. I will take it.', 'quiet, impressed'),
  L('hana_oni', 'HANA', 'Oni on the slope! Keep them off the pad!', 'shouting, urgent'),
  L('yuzu_last', 'YUZU', 'That is the last of them - hold on!', 'shouting, breathless'),
  L('yuzu_procession', 'YUZU', 'That is a lot of red trees walking.', 'breathless, grim humour'),
  L('hana_goodbye', 'HANA', 'Goodbye, Aoi. Hilltop, everyone - we are going home.', 'moved, steady'),
  L('hana_empress_rage', 'HANA', "She's enraged - the bloomed are coming to her. Keep moving!", 'urgent'),
  L('yuzu_stalker', 'YUZU', 'Something is following us. A woman with a mask. When I look at her, she stops.', 'whispering, frightened'),
  L('hana_stalker', 'HANA', 'Then keep looking at her. She only moves when nobody does.', 'calm, low'),
  L('hana_idol', 'HANA', "That voice - it's Mei Hoshino, the idol from the posters. Don't listen to her. Don't walk toward it.", 'low, urgent'),

  // ---- the squad: the first time into each part of the district ----
  L('place_station_1', 'HANA', 'Evacuation Point 3. "Wait. Rescue is coming." They painted it on the ground for the helicopters.', 'quiet, sombre'),
  L('place_station_2', 'YUZU', 'Nobody came. The trains stopped on night nine.', 'quiet'),
  L('place_metro', 'YUZU', 'Four hundred people waited on this platform for the 21:47. Some of them still are.', 'whispering'),
  L('place_school', 'HANA', 'Hilltop school. The last helicopter out left from that sports field. Full.', 'sombre'),
  L('place_shotengai', 'YUZU', 'The arcade. Pachinko, the konbini, karaoke on the corner. The loudest street in the ward.', 'wistful, wry'),
  L('place_canal', 'HANA', 'The canal park. Families camped under the trees when the shelters filled. "Hanami every day," someone wrote.', 'gentle, sad'),
  L('place_shrine', 'YUZU', "The relay's up in the courtyard. That's where her voice is coming from.", 'hushed'),
  L('place_theatre', 'HANA', "The Kurenai Theatre. The Court's home. Red cloth on everything - stay sharp.", 'low, wary'),
  L('place_freight_1', 'YUZU', "The army checkpoint. The list board's still up - names in the order the trains would take them.", 'quiet'),
  L('place_freight_2', 'HANA', "The Court took the yard, and the soldiers' rifles. Watch the container stacks.", 'low, tactical'),
  { ...L('place_lab', 'HANA', 'Case file KS-01. Kurenai Sayo, twenty-four. Day six: containment failure. This is where it started.', 'reading, grim'), say: '[reading, grim] Case file K S zero one. Kurenai Sayo, twenty-four. Day six: containment failure. This is where it started.' },
  L('place_kisaragi', 'YUZU', "...Where are we? There is no Kisaragi on any map.", 'hushed, frightened'),

  // ---- the field file: the first sight of each kind ----
  L('kind_commuter', 'YUZU', "They're still queueing for the train. Walk, don't run.", 'whispering'),
  L('kind_bloomed', 'HANA', "Flowers growing out of her. Don't be close when she pops.", 'tense'),
  L('kind_rooted', 'YUZU', 'That one was lying in the petals. Watch the drifts.', 'startled'),
  L('kind_kuchisake', 'HANA', 'The masked woman. Keep your eyes on her - she only moves when nobody looks.', 'low, tense'),
  L('kind_jorogumo', 'YUZU', 'Legs. So many legs. Look up in the tunnels.', 'disgusted, scared'),
  L('kind_miko', 'HANA', 'A shrine maiden. Drop her before she sings - she calls them.', 'urgent'),
  L('kind_idol', 'YUZU', "It's her, from the posters. Don't listen. Shoot.", 'tense'),
  L('kind_oni', 'HANA', "Oni. Don't let it reach you. Back up and keep shooting.", 'urgent'),
  L('kind_court', 'YUZU', 'Rifles - those are people! Get behind something!', 'shouting'),
  L('kind_empress', 'HANA', "That's her. Sayo Kurenai. Everything starts with her.", 'quiet, grim'),

  // ---- Aoi: her first call, the way, and the charms' stories ----
  L('aoi_call', 'AOI', '...if anyone can hear this. This is Aoi Kisaragi, at Sakuragi Shrine. My five charms can end this. Bring them home.', 'faint, pleading, through static'),
  L('aoi_power', 'AOI', 'The station has been dark for seven years. Bring the light back - and the relay will have the strength to carry my voice.', 'hopeful'),
  L('aoi_dir_metro', 'AOI', 'The lights... The lost and found is by the ticket gates. My first charm is there.', 'soft, guiding'),
  L('aoi_dir_school', 'AOI', 'The second is on the hill, at the school. In the music room, inside the piano.', 'soft, guiding'),
  L('aoi_dir_karaoke', 'AOI', 'The third is with Mei, at the karaoke on the arcade. She is still singing. Do not follow her voice.', 'soft, a warning'),
  L('aoi_dir_canal', 'AOI', "The fourth went into the canal, tied to a boat's bow by the bridge. You can reach it from the bank.", 'soft, sad'),
  L('aoi_dir_key', 'AOI', 'The last is under the theatre, in their laboratory. The army sealed it, and took the key to their checkpoint at the freight yard.', 'soft, uneasy'),
  L('aoi_dir_lab', 'AOI', 'This is where they took the sap from my tree, and where Sayo woke. Go down. Be quick.', 'tense, sad'),
  L('aoi_charm_0', 'AOI', 'That was Kenji\'s. The station attendant. He kept telling them the 21:47 was coming, so they would not be afraid. He believed it too.', 'tender, grieving'),
  L('aoi_charm_1', 'AOI', 'Hina played that piano every night, so the little ones could sleep. She was eleven. Thank you for bringing it out of the dark.', 'tender, grieving'),
  L('aoi_charm_2', 'AOI', 'Mei. She sang until her voice was gone, and then she kept singing. Let her rest now.', 'tender, grieving'),
  L('aoi_charm_3', 'AOI', 'The Morishitas rowed for the sea. The father tied my charm to the bow. He said it would steer them home.', 'tender, grieving'),
  L('aoi_charm_4', 'AOI', 'Doctor Sena kept it cold, for his daughter. He was the one who opened the door for Sayo. He never forgave himself.', 'tender, heavy'),
  L('aoi_all', 'AOI', 'All five. Bring them up the shrine steps to the sacred tree. My sisters are still on the steps. I am sorry.', 'moved, then sorrowful'),
  L('aoi_tied', 'AOI', 'It remembers. Now the lanterns, in the order of the festival poem. I left the scroll on the offering box before the hall.', 'hushed, hopeful'),
  L('aoi_poem', 'AOI', 'Read it line by line - that is the order of the lanterns. One wrong, and they all go out, and the dead come to see why.', 'careful, quiet'),
  L('aoi_again', 'AOI', 'Again. From the first line.', 'patient, gentle'),
  L('aoi_bell', 'AOI', 'Every lantern burns. Ring the bell, and let them hear it.', 'solemn, quiet joy'),
  L('aoi_bloom', 'AOI', 'That train is for the dead. It stops at Kisaragi, where my family kept what the shrine could not. Take it - you will need it before this night is over.', 'solemn, quiet'),
  L('aoi_kisaragi', 'AOI', 'Kisaragi. The stop on no map. The dead wait here for the train home. Take the relics, and do not stay long.', 'whispering, solemn'),
  L('aoi_empress', 'AOI', 'Before you go home - Sayo. She is on her stage with her Court round her. She was kind, before. Let her rest.', 'sad, resolved'),
  L('aoi_rest', 'AOI', 'Rest, Sayo.', 'tender, a whisper'),
  L('aoi_relay', 'AOI', 'One more thing. The relay - start it, and hold the courtyard while it speaks. It calls your helicopter too.', 'softly, asking a favour'),
  L('aoi_relay_done', 'AOI', 'Can you hear it? My voice, all the way to the sea.', 'wondering, happy'),
  L('aoi_home', 'AOI', 'They are going home. So am I. Thank you, all of you. Go back to your own home now.', 'peaceful, tearful, warm'),
  L('aoi_procession', 'AOI', 'They heard the bell. Every one of them is coming up the hill to go home - and they will take you with them.', 'frightened, urgent'),
  L('aoi_procession_2', 'AOI', 'Hold until the bird lands. What Kisaragi gave you is for this.', 'steady, encouraging'),
  L('aoi_op_bloom', 'AOI', 'Thank you. They can go home now - but they will all come up the hill to do it. Be ready when you call your helicopter.', 'grateful, quiet'),

  // ---- the station's speakers ----
  { ...L('pa_delay_ja', 'PA', '21時47分発、きさらぎ行き各駅停車は、ただいま遅れております。', 'calm, measured, a station announcement in Japanese'), say: '[calm, measured, a station announcement] 21時47分発、きさらぎ行き各駅停車は、ただいま遅れております。ご迷惑をおかけしております。' },
  L('pa_delay_en', 'PA', 'The 21:47 local service for Kisaragi is delayed. We apologise for the inconvenience.', 'calm, measured, a station announcement'),
  L('pa_line', 'PA', 'For your safety, please stand behind the yellow line.', 'calm, measured, a station announcement'),
  L('pa_arriving', 'PA', 'The train for Kisaragi is now arriving at platform one. Please do not leave anything behind.', 'calm, measured, slightly too slow'),

  // ---- the ones who are not on the radio ----
  L('sayo_seen', 'SAYO', 'Is the show over? ...They are all still watching me.', 'dreamy, hollow, echoing'),
  L('sayo_rage', 'SAYO', "Don't leave! The second act has not even started!", 'shrieking, desperate'),
  L('sayo_down', 'SAYO', 'Thank you... Bring down the curtain.', 'fading, relieved'),
  L('mei_sing', 'MEI', 'Stay... just one more song... everyone is still here...', 'far away, sweet, hollow'),
  L('mask_near', 'MASK', 'Am I pretty?', 'a slow whisper, very close'),
];

export const LINE: Record<string, VoiceLine> = Object.fromEntries(LINES.map((l) => [l.id, l]));

/** The game's own radio text -> the line that voices it (the mission's calls, the squad's barks). */
export const BY_TEXT: ReadonlyMap<string, string> = new Map([...LINES.map((l) => [`${l.who}|${l.text}`, l.id] as const), ...LINES.filter((l) => l.match).map((l) => [`${l.who}|${l.match}`, l.id] as const)]);

/** Music: Lyria clips (`scripts/sakura-audio.mjs`), each a 30-second piece looped or played once. */
export interface Cue {
  id: string;
  loop: boolean;
  prompt: string;
}

export const CUES: readonly Cue[] = [
  {
    id: 'dusk',
    loop: true,
    prompt: 'A 30-second seamless loop for a melancholy survival game at dusk in an abandoned Japanese city full of cherry blossoms. Instruments: a soft koto playing a slow, sparse pentatonic melody, a breathy shakuhachi answering it now and then, a low warm synth pad underneath, distant wind chimes. Slow (60 bpm), quiet, sad and beautiful, no drums, no vocals. 0-10 s: the pad and one koto phrase. 10-20 s: the shakuhachi answers. 20-30 s: koto again, ending where it began so it loops.',
  },
  {
    id: 'bloom',
    loop: true,
    prompt: 'A 30-second seamless loop for a horror game under a blood-red moon in a Japanese city where every cherry tree has turned crimson. Instruments: deep slow taiko hits, a detuned koto, low drones, a choir humming far away, a temple bell now and then. 70 bpm, ominous, sacred and frightening, no lyrics. Even level throughout so it loops cleanly.',
  },
  {
    id: 'procession',
    loop: true,
    prompt: 'A 30-second seamless loop for an intense last stand on a hilltop while a helicopter comes in and an endless procession of the dead climbs toward you under a red moon. Instruments: driving taiko ensemble, fast shamisen ostinato, low strings, rising synth pulses, distant choir. 130 bpm, relentless and heroic, no vocals, constant intensity so it loops.',
  },
  {
    id: 'kisaragi',
    loop: true,
    prompt: 'A 30-second seamless loop for a ghostly railway platform that exists on no map, under a red moon, the dead waiting for their train. Instruments: a slow music box melody slightly out of tune, soft reverse cymbals, a far station departure chime, a deep hum. Very slow, eerie, gentle and sad, no drums, no vocals.',
  },
  {
    id: 'home',
    loop: false,
    prompt: 'A 30-second ending piece for a game where the dead of a Japanese city are finally laid to rest at dawn. Instruments: koto and piano together playing a warm, hopeful pentatonic theme, soft strings swelling, wind chimes. 0-10 s: piano alone, quiet. 10-22 s: koto and strings join and rise. 22-30 s: resolves gently and fades to silence.',
  },
];
