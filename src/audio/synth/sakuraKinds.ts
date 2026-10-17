/**
 * The Sakura District's kinds of infected, each with a voice of its own, and the district's own air: the Kuchisake's
 * whisper and her shears, the Jorogumo's legs and hiss, the miko's kagura bells and her call, the idol's song, the
 * Oni's roar and iron club, a bloomed bursting, a rooted tearing up out of the ground, the Court's whistle, the
 * Empress's wail, a commuter's mutter (or the phone still buzzing in a pocket); and Aoi's voice opening on the shrine
 * relay, a chapter's koto, wind chimes, crows and the station's departure melody.
 */
import { type Ctx, type Vowel, alloc, crackles, echoTaps, finalize, noiseLayer, rr, toneLayer, voice } from './dsp';
import { click, ring, rustle, scrape, thud, whoosh } from './foley';
import { bell, taiko } from './notes';

/** A woman's vocal tract (formants scaled up), as the horde's women (`creaturesFemale.ts`). */
const TRACT = 1.2;

/** "Watashi... kirei?" - a breathy whisper rising to a question, close behind you. */
export function kuchisakeWhisper(c: Ctx): Float32Array {
  const { sr, r, v } = c;
  const out = alloc(sr, 2.4);
  const syl: Vowel[] = v === 0 ? ['a', 'a', 'i', 'i', 'e'] : ['i', 'e', 'i', 'e', 'a'];
  let t = 0.06;
  syl.forEach((vw, i) => {
    const last = i === syl.length - 1;
    const d = last ? 0.46 : rr(r, 0.14, 0.2);
    // a hushed consonant before some syllables
    if (i === 2 || i === 3) noiseLayer(out, sr, r, { start: t - 0.05, dur: 0.07, gain: 0.35, attack: 0.02, tau: 0.04, filters: [{ type: 'hp', f: i === 2 ? 3400 : 2400 }] });
    voice(out, sr, r, {
      start: t,
      dur: d,
      gain: 0.8,
      f0: [
        [0, 200],
        [d, last ? 270 : 195],
      ],
      vowels: [
        [0, vw],
        [d, vw],
      ],
      formantScale: TRACT,
      bw: [170, 210, 280],
      env: [
        [0, 0],
        [0.03, 1],
        [d * 0.7, 0.8],
        [d, 0],
      ],
      breath: 0.97,
      jitter: 0.05,
      shimmer: 0.3,
    });
    t += d + (i === 2 ? 0.28 : 0.05);
  });
  echoTaps(out, sr, [
    { t: 0.12, g: 0.25 },
    { t: 0.29, g: 0.12 },
  ]);
  return finalize(out, sr, { peak: 0.5, fadeOut: 0.3 });
}

/** Her shears: two hard metal snips. */
export function shearsSnip(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 0.8);
  for (const t of [0.04, 0.2 + r() * 0.04]) {
    scrape(out, sr, r, t - 0.03, 0.06, { f0: 2600, f1: 6200, gain: 0.3 });
    click(out, sr, r, t, { f: 5200, q: 2, tau: 0.002, gain: 0.9 });
    ring(out, sr, r, t, rr(r, 2900, 3300), 0.09, 0.45, [1, 1.52, 2.71, 4.13]);
  }
  return finalize(out, sr, { peak: 0.6, fadeOut: 0.1 });
}

/** Eight legs on concrete: a fast patter of hard taps, and a chitter. */
export function spiderSkitter(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 1.1);
  crackles(out, sr, r, { dur: 0.95, rate: rr(r, 45, 70), gain: 0.8, tau: 0.0016, filters: [{ type: 'bp', f: rr(r, 2000, 2800), q: 1.4 }] });
  crackles(out, sr, r, { start: 0.05, dur: 0.85, rate: 25, gain: 0.45, tau: 0.003, filters: [{ type: 'lp', f: 900 }] });
  toneLayer(out, sr, r, { start: rr(r, 0.2, 0.5), dur: 0.25, gain: 0.25, f0: 1900, f1: 1500, tau: 0.15, wave: 'square', fm: { ratio: 0.03, depth: 6 } });
  return finalize(out, sr, { peak: 0.45, fadeIn: 0.01, fadeOut: 0.15 });
}

/** Her hiss from the tunnel roof, with the legs clicking in it. */
export function spiderHiss(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 1.3);
  noiseLayer(out, sr, r, { dur: 1.1, gain: 0.8, attack: 0.08, tau: 0.6, filters: [{ type: 'bp', f: 4200, f2: 3000, q: 1.1 }], am: { rate: 23, depth: 0.45 } });
  crackles(out, sr, r, { start: 0.1, dur: 0.8, rate: 30, gain: 0.5, tau: 0.0018, filters: [{ type: 'bp', f: 2600, q: 1.5 }] });
  return finalize(out, sr, { peak: 0.55, fadeOut: 0.2 });
}

/** The miko's call: the kagura bells shaken hard, and her scream over them. */
export function mikoCall(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 2.6);
  for (let shake = 0; shake < 3; shake++) {
    const t0 = shake * 0.22;
    for (let k = 0; k < 6; k++) bell(out, sr, r, t0 + r() * 0.06, rr(r, 2300, 4200), 0.18, 0.35);
  }
  voice(out, sr, r, {
    start: 0.5,
    dur: 1.6,
    gain: 0.9,
    f0: [
      [0, 560],
      [0.3, 820],
      [1.2, 760],
      [1.6, 600],
    ],
    vowels: [
      [0, 'a'],
      [1.6, 'ae'],
    ],
    formantScale: TRACT,
    env: [
      [0, 0],
      [0.12, 1],
      [1.2, 0.85],
      [1.6, 0],
    ],
    vibrato: { rate: 6.5, depth: 0.035 },
    breath: 0.35,
    jitter: 0.03,
    shimmer: 0.2,
    drive: 1.3,
  });
  echoTaps(out, sr, [
    { t: 0.21, g: 0.28 },
    { t: 0.47, g: 0.14 },
  ]);
  return finalize(out, sr, { peak: 0.7, fadeOut: 0.4 });
}

/** Mei Hoshino's song: a phrase of a minor melody, wavering and a little out of tune, a music box under it. */
export function idolSong(c: Ctx): Float32Array {
  const { sr, r, v } = c;
  // A minor pentatonic phrases (Hz), one per variant
  const tunes = [
    [440, 523.3, 587.3, 659.3, 587.3, 523.3, 440],
    [659.3, 587.3, 523.3, 587.3, 440, 392, 440],
    [523.3, 587.3, 659.3, 784, 659.3, 587.3, 523.3],
  ];
  const tune = tunes[v % tunes.length]!;
  const out = alloc(sr, 3.6);
  let t = 0.05;
  tune.forEach((f, i) => {
    const last = i === tune.length - 1;
    const d = last ? 0.8 : 0.34;
    const sour = 1 + (r() - 0.5) * 0.025;
    voice(out, sr, r, {
      start: t,
      dur: d,
      gain: 0.7,
      f0: [
        [0, f * sour * 0.98],
        [0.06, f * sour],
        [d, f * sour * (last ? 0.96 : 1)],
      ],
      vowels: [
        [0, i % 2 ? 'u' : 'a'],
        [d, i % 2 ? 'o' : 'a'],
      ],
      formantScale: 1.25,
      env: [
        [0, 0],
        [0.05, 1],
        [d * 0.8, 0.8],
        [d, 0],
      ],
      vibrato: { rate: 5.4, depth: last ? 0.03 : 0.018 },
      breath: 0.3,
      jitter: 0.02,
      shimmer: 0.15,
    });
    bell(out, sr, r, t, f * 2, 0.1, 0.5);
    t += d;
  });
  echoTaps(out, sr, [
    { t: 0.18, g: 0.3 },
    { t: 0.41, g: 0.18 },
    { t: 0.73, g: 0.1 },
  ]);
  return finalize(out, sr, { peak: 0.5, fadeIn: 0.01, fadeOut: 0.4 });
}

/** The Oni's roar: a huge throat, a subharmonic growl and the ground humming under it. */
export function oniRoar(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 2.2);
  voice(out, sr, r, {
    start: 0.02,
    dur: 1.8,
    gain: 1,
    f0: [
      [0, 62],
      [0.3, 78],
      [1.4, 66],
      [1.8, 50],
    ],
    vowels: [
      [0, 'o'],
      [0.5, 'a'],
      [1.8, 'uh'],
    ],
    formantScale: 0.72,
    env: [
      [0, 0],
      [0.15, 1],
      [1.3, 0.85],
      [1.8, 0],
    ],
    fry: { rate: 34, depth: 0.55, irregular: 0.5 },
    sub: 0.5,
    drive: 2.2,
    rasp: { f: 900, q: 0.8, gain: 0.35 },
    breath: 0.2,
  });
  toneLayer(out, sr, r, { start: 0, dur: 1.9, gain: 0.45, f0: 42, f1: 36, tau: 1.2, attack: 0.2 });
  return finalize(out, sr, { peak: 0.85, fadeOut: 0.3 });
}

/** The iron club coming round. */
export function kanaboSwing(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 0.8);
  whoosh(out, sr, r, 0.02, 0.6, { f0: 160, f1: 520, f2: 180, gain: 0.9, q: 0.8 });
  return finalize(out, sr, { peak: 0.6, fadeOut: 0.1 });
}

/** The club landing: a heavy blow and a low iron ring. */
export function kanaboHit(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 1.2);
  thud(out, sr, r, 0, { f0: 120, f1: 45, tau: 0.09, gain: 1, body: 0.6, bodyF: 300 });
  ring(out, sr, r, 0.005, 176, 0.35, 0.4, [1, 2.4, 3.9, 5.6]);
  crackles(out, sr, r, { start: 0.02, dur: 0.35, rate: 120, rateTau: 0.12, gain: 0.35, tau: 0.002, filters: [{ type: 'lp', f: 2500 }] });
  return finalize(out, sr, { peak: 0.85, fadeOut: 0.2 });
}

/** A bloomed bursting: a soft pop, a breath of air and a shower of petals. */
export function petalBurst(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 1.6);
  thud(out, sr, r, 0, { f0: 190, f1: 80, tau: 0.05, gain: 0.7 });
  whoosh(out, sr, r, 0.01, 0.7, { f0: 600, f1: 2400, f2: 900, gain: 0.6 });
  rustle(out, sr, r, 0.08, 1.2, { gain: 0.45, lo: 2000, hi: 7000 });
  for (let k = 0; k < 4; k++) bell(out, sr, r, 0.15 + r() * 0.6, rr(r, 3000, 4800), 0.05, 0.3);
  return finalize(out, sr, { peak: 0.55, fadeOut: 0.3 });
}

/** A rooted tearing up out of the ground: roots snapping, earth falling, a drawn breath. */
export function earthBurst(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 1.5);
  crackles(out, sr, r, { dur: 0.6, rate: 260, rateTau: 0.25, gain: 0.7, tau: 0.0025, filters: [{ type: 'lp', f: 1600 }] });
  for (let k = 0; k < 3; k++) click(out, sr, r, 0.05 + r() * 0.25, { f: rr(r, 900, 1600), q: 1.2, tau: 0.006, gain: 0.6 });
  noiseLayer(out, sr, r, { start: 0.1, dur: 0.9, gain: 0.5, attack: 0.05, tau: 0.4, color: 'brown', filters: [{ type: 'lp', f: 700 }] });
  noiseLayer(out, sr, r, { start: 0.55, dur: 0.6, gain: 0.45, attack: 0.4, tau: 0.15, color: 'pink', filters: [{ type: 'bp', f: rr(r, 1500, 2200), q: 0.9 }] });
  return finalize(out, sr, { peak: 0.65, fadeOut: 0.2 });
}

/** The Court's whistle: two shrill blasts - outsiders. */
export function courtWhistle(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 1.2);
  for (const [t, d] of [
    [0.02, 0.26],
    [0.36, 0.5],
  ] as const) {
    toneLayer(out, sr, r, { start: t, dur: d, gain: 0.6, f0: 2950, f1: 2900, tau: 2, attack: 0.01, vib: { rate: 27, depth: 0.025 } });
    noiseLayer(out, sr, r, { start: t, dur: d, gain: 0.25, attack: 0.01, tau: 2, filters: [{ type: 'bp', f: 2950, q: 3 }] });
  }
  echoTaps(out, sr, [{ t: 0.24, g: 0.25 }]);
  return finalize(out, sr, { peak: 0.5, fadeOut: 0.15 });
}

/** The Empress: an operatic wail with a second voice an octave under it and the air swelling round them. */
export function empressWail(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 3);
  const line: [number, number][] = [
    [0, 520],
    [0.4, 784],
    [1.6, 700],
    [2.4, 560],
  ];
  for (const [k, g] of [
    [1, 0.9],
    [0.5, 0.45],
  ] as const) {
    voice(out, sr, r, {
      start: 0.05,
      dur: 2.4,
      gain: g,
      f0: line.map(([t, f]) => [t, f * k] as [number, number]),
      vowels: [
        [0, 'a'],
        [1.6, 'o'],
        [2.4, 'u'],
      ],
      formantScale: k === 1 ? TRACT : 1,
      env: [
        [0, 0],
        [0.3, 1],
        [1.8, 0.8],
        [2.4, 0],
      ],
      vibrato: { rate: 5.8, depth: 0.04 },
      breath: 0.2,
      jitter: 0.02,
      drive: 1.4,
    });
  }
  noiseLayer(out, sr, r, { dur: 2.6, gain: 0.3, attack: 1.4, tau: 0.6, color: 'pink', filters: [{ type: 'bp', f: 800, f2: 2400, q: 0.7 }] });
  toneLayer(out, sr, r, { dur: 2.8, gain: 0.3, f0: 55, tau: 2, attack: 0.5, harmonics: [0.3] });
  echoTaps(out, sr, [
    { t: 0.3, g: 0.3 },
    { t: 0.62, g: 0.16 },
  ]);
  return finalize(out, sr, { peak: 0.8, fadeOut: 0.5 });
}

/** A commuter: a tired mutter (variants 0-1), or the phone still buzzing in its pocket (2). */
export function commuterGroan(c: Ctx): Float32Array {
  const { sr, r, v } = c;
  if (v === 2) {
    const out = alloc(sr, 1.6);
    for (let k = 0; k < 2; k++) toneLayer(out, sr, r, { start: 0.05 + k * 0.6, dur: 0.38, gain: 0.5, f0: 172, tau: 3, attack: 0.01, wave: 'square', drive: 1.4 });
    return finalize(out, sr, { peak: 0.35, fadeOut: 0.05 });
  }
  const out = alloc(sr, 1.4);
  const f = rr(r, 100, 125);
  voice(out, sr, r, {
    start: 0.04,
    dur: 1.1,
    gain: 0.8,
    f0: [
      [0, f],
      [0.5, f * 0.95],
      [1.1, f * 0.8],
    ],
    vowels: [
      [0, 'uh'],
      [0.6, v ? 'e' : 'o'],
      [1.1, 'uh'],
    ],
    env: [
      [0, 0],
      [0.15, 0.9],
      [0.8, 0.6],
      [1.1, 0],
    ],
    breath: 0.45,
    jitter: 0.05,
    fry: { rate: 28, depth: 0.3, irregular: 0.5 },
  });
  return finalize(out, sr, { peak: 0.5, fadeOut: 0.2 });
}

/** Aoi's voice opening on the shrine relay: static, a warble, the carrier. */
export function relayVoice(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 0.9);
  noiseLayer(out, sr, r, { dur: 0.75, gain: 0.55, attack: 0.02, tau: 0.35, filters: [{ type: 'bp', f: 1800, q: 0.7 }], am: { rate: 17, depth: 0.5 } });
  crackles(out, sr, r, { dur: 0.6, rate: 90, rateTau: 0.3, gain: 0.35, tau: 0.001, filters: [{ type: 'hp', f: 1200 }] });
  toneLayer(out, sr, r, { start: 0.08, dur: 0.45, gain: 0.25, f0: 1200, f1: 1650, tau: 0.5, wave: 'tri', vib: { rate: 11, depth: 0.04 } });
  return finalize(out, sr, { peak: 0.4, fadeOut: 0.15 });
}

/** A koto pluck. */
function koto(out: Float32Array, sr: number, r: () => number, t: number, f: number, gain: number): void {
  toneLayer(out, sr, r, { start: t, dur: 1.6, gain, f0: f * 1.006, f1: f, tau: 0.55, attack: 0.002, wave: 'tri', harmonics: [0.5, 0.35, 0.2, 0.12] });
  noiseLayer(out, sr, r, { start: t, dur: 0.03, gain: gain * 0.4, attack: 0.0005, tau: 0.008, filters: [{ type: 'bp', f: f * 3, q: 2 }] });
}

/** A chapter begins: a soft drum and a rising koto figure (hirajoshi). */
export function chapterKoto(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 2.6);
  taiko(out, sr, r, 0, 0.5, 1.1);
  [440, 587.3, 659.3, 698.5, 880].forEach((f, i) => koto(out, sr, r, 0.12 + i * 0.16, f, i === 4 ? 0.55 : 0.4));
  echoTaps(out, sr, [
    { t: 0.24, g: 0.25 },
    { t: 0.5, g: 0.12 },
  ]);
  return finalize(out, sr, { peak: 0.55, fadeOut: 0.5 });
}

/** A fuurin, a glass wind chime, in the breeze. */
export function ambFurin(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 2.8);
  const n = 2 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) bell(out, sr, r, k * rr(r, 0.25, 0.6), rr(r, 2600, 3600), 0.25, 0.9);
  return finalize(out, sr, { peak: 0.3, fadeOut: 0.4 });
}

/** A crow, somewhere up on the wires: two or three hoarse caws. */
export function ambCrow(c: Ctx): Float32Array {
  const { sr, r } = c;
  const n = 2 + Math.floor(r() * 2);
  const out = alloc(sr, n * 0.45 + 0.4);
  for (let k = 0; k < n; k++) {
    const d = rr(r, 0.24, 0.32);
    voice(out, sr, r, {
      start: 0.05 + k * rr(r, 0.38, 0.46),
      dur: d,
      gain: 0.8,
      f0: [
        [0, 520],
        [d * 0.4, 600],
        [d, 430],
      ],
      vowels: [
        [0, 'a'],
        [d, 'ae'],
      ],
      formantScale: 1.6,
      env: [
        [0, 0],
        [0.02, 1],
        [d * 0.6, 0.8],
        [d, 0],
      ],
      fry: { rate: 70, depth: 0.7, irregular: 0.6 },
      rasp: { f: 2200, q: 1, gain: 0.5 },
      drive: 2,
      breath: 0.3,
    });
  }
  echoTaps(out, sr, [{ t: 0.3, g: 0.2 }]);
  return finalize(out, sr, { peak: 0.35, fadeOut: 0.2 });
}

/** The station's departure melody on a broken speaker, ringing round the concourse. */
export function stationChime(c: Ctx): Float32Array {
  const { sr, r, v } = c;
  const out = alloc(sr, 3.4);
  const tunes = [
    [1046.5, 1318.5, 1568, 2093, 1568, 1318.5],
    [1568, 1318.5, 1174.7, 1046.5, 1174.7, 1568],
  ];
  tunes[v % tunes.length]!.forEach((f, i) => bell(out, sr, r, 0.05 + i * 0.2, f * (1 + (r() - 0.5) * 0.01), 0.3, 0.7));
  echoTaps(out, sr, [
    { t: 0.33, g: 0.35 },
    { t: 0.7, g: 0.2 },
    { t: 1.1, g: 0.1 },
  ]);
  return finalize(out, sr, { peak: 0.35, fadeOut: 0.6 });
}
