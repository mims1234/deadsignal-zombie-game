/**
 * The Sakura District's infected: a woman's voice, turned. Same formant `voice()` synthesiser as the horde
 * (`creatures.ts`), with a higher fundamental, a smaller vocal tract (formants scaled up), more breath and less growl:
 * moans that break into sobs, a creepy giggle when they notice you, hisses on the chase, a scream, whimpers when hit, and
 * a gasp and a rattle when they die.
 */
import { type Ctx, type Vowel, alloc, echoTaps, finalize, noiseLayer, rr, voice } from './dsp';
import { rustle, whoosh } from './foley';

/** A woman's vocal tract: formants ~18-25% higher than a man's. */
const TRACT = 1.2;

const MOAN_VOWELS: Vowel[][] = [
  ['o', 'a', 'u'],
  ['a', 'o', 'uh'],
  ['uh', 'a', 'o'],
];

/** A breath drawn in through the teeth. */
function inhale(out: Float32Array, sr: number, r: () => number, start: number, dur: number, gain: number): void {
  noiseLayer(out, sr, r, { start, dur, gain, attack: dur * 0.7, tau: dur * 0.25, color: 'pink', filters: [{ type: 'bp', f: rr(r, 1800, 2600), q: 0.9 }] });
}

/** Moan (variants 0-2), or a sob that breaks into short whimpering catches (3-4). */
export function fzombieMoan(c: Ctx): Float32Array {
  const { sr, r, v } = c;
  if (v >= 3) {
    // sobbing: three to five catches, each a little lower, a breath between them
    const n = 3 + Math.floor(r() * 3);
    const out = alloc(sr, n * 0.34 + 0.6);
    const base = rr(r, 230, 290);
    let t = 0.05;
    for (let i = 0; i < n; i++) {
      const d = rr(r, 0.18, 0.28) + (i === n - 1 ? 0.35 : 0);
      const f = base * (1 - i * 0.06);
      voice(out, sr, r, {
        start: t,
        dur: d,
        f0: [
          [0, f * 1.12],
          [d * 0.3, f],
          [d, f * 0.78],
        ],
        vowels: [
          [0, 'uh'],
          [d, i === n - 1 ? 'o' : 'uh'],
        ],
        formantScale: TRACT,
        bw: [130, 170, 240],
        env: [
          [0, 0],
          [0.03, 1],
          [d * 0.6, 0.7],
          [d, 0],
        ],
        vibrato: { rate: 7, depth: 0.05 },
        jitter: 0.07,
        shimmer: 0.3,
        breath: 0.55,
        fry: { rate: 30, depth: 0.25, irregular: 0.6 },
        drive: 1.4,
      });
      t += d + rr(r, 0.05, 0.1);
      if (i < n - 1) inhale(out, sr, r, t - 0.08, 0.1, 0.18);
    }
    return finalize(out, sr, { peak: 0.6, fadeIn: 0.005, fadeOut: 0.08 });
  }
  const dur = 1.3 + r() * 0.7;
  const out = alloc(sr, dur + 0.08);
  const base = rr(r, 185, 235);
  const seq = MOAN_VOWELS[v % MOAN_VOWELS.length]!;
  voice(out, sr, r, {
    dur,
    f0: [
      [0, base * 0.95],
      [dur * 0.25, base * 1.12],
      [dur * 0.6, base * 0.96],
      [dur, base * 0.66],
    ],
    vowels: [
      [0, seq[0]!],
      [dur * 0.35, seq[1]!],
      [dur * 0.72, seq[2]!],
      [dur, seq[0]!],
    ],
    formantScale: rr(r, 1.15, 1.24),
    bw: [120, 160, 230],
    env: [
      [0, 0],
      [dur * 0.22, 1],
      [dur * 0.6, 0.82],
      [dur * 0.9, 0.28],
      [dur, 0],
    ],
    vibrato: { rate: rr(r, 5, 6.5), depth: 0.04 },
    jitter: 0.05,
    shimmer: 0.2,
    breath: 0.45,
    fry: { rate: rr(r, 26, 34), depth: 0.28, irregular: 0.5 },
    sub: 0.12,
    drive: 1.3,
    rasp: { f: 3800, q: 1.2, gain: 0.1 },
  });
  return finalize(out, sr, { peak: 0.6, fadeIn: 0.01, fadeOut: 0.06 });
}

/** She has seen you: a high, breathy giggle - "hee-hee-hee" - with a second voice just off-key beside it. */
export function fzombieGiggle(c: Ctx): Float32Array {
  const { sr, r } = c;
  const n = 4 + Math.floor(r() * 3);
  const step = rr(r, 0.11, 0.14);
  const out = alloc(sr, n * step + 0.75);
  const base = rr(r, 330, 420);
  inhale(out, sr, r, 0, 0.14, 0.2);
  const run = (mul: number, gain: number): void => {
    for (let i = 0; i < n; i++) {
      const d = rr(r, 0.075, 0.1);
      // each catch a touch lower, with a lilt up on the second and the last
      const f = base * mul * (1 - i * 0.035) * (i === 1 || i === n - 1 ? 1.08 : 1);
      voice(out, sr, r, {
        start: 0.14 + i * step,
        dur: d,
        gain,
        f0: [
          [0, f * 1.06],
          [d, f * 0.9],
        ],
        vowels: [
          [0, 'i'],
          [d, 'e'],
        ],
        formantScale: 1.26,
        bw: [140, 190, 260],
        env: [
          [0, 0],
          [0.012, 1],
          [d * 0.55, 0.6],
          [d, 0],
        ],
        jitter: 0.04,
        shimmer: 0.25,
        breath: 0.6,
        drive: 1.6,
      });
    }
  };
  run(1, 1);
  run(1.045, 0.38); // the off-key second voice
  echoTaps(out, sr, [
    { t: 0.09, g: 0.22, lp: 3200 },
    { t: 0.19, g: 0.12, lp: 2200 },
  ]);
  return finalize(out, sr, { peak: 0.62, fadeIn: 0.004, fadeOut: 0.12 });
}

/** On the chase: a cat-like hiss through bared teeth, with a thin voiced edge under it. */
export function fzombieHiss(c: Ctx): Float32Array {
  const { sr, r } = c;
  const dur = 0.5 + r() * 0.25;
  const out = alloc(sr, dur + 0.08);
  noiseLayer(out, sr, r, { dur, gain: 0.8, attack: 0.03, tau: dur * 0.6, color: 'white', filters: [{ type: 'bp', f: rr(r, 4200, 5600), q: 0.8 }, { type: 'hp', f: 2200 }], am: { rate: rr(r, 18, 26), depth: 0.25 } });
  const base = rr(r, 210, 260);
  voice(out, sr, r, {
    dur: dur * 0.85,
    gain: 0.45,
    f0: [
      [0, base],
      [dur * 0.85, base * 0.82],
    ],
    vowels: [
      [0, 'e'],
      [dur * 0.85, 'ae'],
    ],
    formantScale: TRACT,
    bw: [140, 180, 260],
    env: [
      [0, 0],
      [0.05, 1],
      [dur * 0.6, 0.7],
      [dur * 0.85, 0],
    ],
    jitter: 0.06,
    shimmer: 0.3,
    breath: 0.8,
    fry: { rate: 38, depth: 0.5, irregular: 0.7 },
    drive: 2.2,
    rasp: { f: 5200, q: 1.0, gain: 0.3 },
  });
  return finalize(out, sr, { peak: 0.58, fadeIn: 0.004, fadeOut: 0.05 });
}

/** A runner sees you: a short, piercing scream. */
export function fzombieScream(c: Ctx): Float32Array {
  const { sr, r } = c;
  const D = 0.75 + r() * 0.3;
  const out = alloc(sr, D + 0.5);
  inhale(out, sr, r, 0, 0.12, 0.22);
  const base = rr(r, 520, 680);
  const layer = (mul: number, gain: number): void => {
    voice(out, sr, r, {
      start: 0.1,
      dur: D,
      gain,
      f0: [
        [0, base * 0.85 * mul],
        [0.08, base * 1.2 * mul],
        [D * 0.5, base * 1.28 * mul],
        [D, base * 0.7 * mul],
      ],
      vowels: [
        [0, 'ae'],
        [0.12, 'i'],
        [D * 0.75, 'e'],
        [D, 'a'],
      ],
      formantScale: 1.28,
      bw: [170, 230, 320],
      env: [
        [0, 0],
        [0.04, 1],
        [D * 0.6, 0.85],
        [D, 0],
      ],
      vibrato: { rate: rr(r, 7, 9), depth: 0.04 },
      jitter: 0.05,
      shimmer: 0.22,
      breath: 0.35,
      fry: { rate: 48, depth: 0.22, irregular: 0.7 },
      drive: 3,
      rasp: { f: 4800, q: 0.9, gain: 0.2 },
    });
  };
  layer(1, 1);
  layer(1.05, 0.35);
  echoTaps(out, sr, [
    { t: 0.1, g: 0.25, lp: 2800 },
    { t: 0.22, g: 0.14, lp: 1800 },
  ]);
  return finalize(out, sr, { peak: 0.62, fadeIn: 0.004, fadeOut: 0.1 });
}

/** The armored ones: a low, rough growl - still a woman's throat, but torn. */
export function fzombieGrowl(c: Ctx): Float32Array {
  const { sr, r } = c;
  const dur = 0.8 + r() * 0.35;
  const out = alloc(sr, dur + 0.06);
  const base = rr(r, 135, 165);
  voice(out, sr, r, {
    dur,
    f0: [
      [0, base],
      [0.1, base * 1.35],
      [dur * 0.55, base * 1.15],
      [dur, base * 0.75],
    ],
    vowels: [
      [0, 'uh'],
      [0.15, 'a'],
      [dur * 0.7, 'a'],
      [dur, 'o'],
    ],
    formantScale: 1.12,
    bw: [120, 160, 220],
    env: [
      [0, 0],
      [0.04, 1],
      [dur * 0.55, 0.85],
      [dur, 0],
    ],
    vibrato: { rate: 6, depth: 0.02 },
    jitter: 0.06,
    shimmer: 0.25,
    breath: 0.35,
    fry: { rate: rr(r, 38, 48), depth: 0.6, irregular: 0.6 },
    sub: 0.3,
    drive: 3,
    rasp: { f: 3200, q: 1.0, gain: 0.26 },
  });
  return finalize(out, sr, { peak: 0.62, fadeIn: 0.004, fadeOut: 0.06 });
}

/** The lunge: cloth and air, and a sharp "hah!". */
export function fzombieAttack(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 0.45);
  whoosh(out, sr, r, 0.0, 0.24, { f0: 480, f1: 2400, f2: 900, gain: 0.45 });
  rustle(out, sr, r, 0.0, 0.14, { gain: 0.14, lo: 700, hi: 2800 });
  const base = rr(r, 260, 320);
  voice(out, sr, r, {
    start: 0.03,
    dur: 0.2,
    gain: 0.8,
    f0: [
      [0, base * 1.1],
      [0.2, base * 0.75],
    ],
    vowels: [
      [0, 'a'],
      [0.2, 'uh'],
    ],
    formantScale: TRACT,
    bw: [130, 170, 240],
    env: [
      [0, 0],
      [0.015, 1],
      [0.12, 0.6],
      [0.2, 0],
    ],
    jitter: 0.05,
    shimmer: 0.2,
    breath: 0.5,
    fry: { rate: 40, depth: 0.3, irregular: 0.5 },
    drive: 2.2,
  });
  return finalize(out, sr, { peak: 0.7, fadeIn: 0.002, fadeOut: 0.05 });
}

/** Hit: a yelp that falls into a whimper. */
export function fzombieWhimper(c: Ctx): Float32Array {
  const { sr, r } = c;
  const dur = 0.38 + r() * 0.14;
  const out = alloc(sr, dur + 0.06);
  const base = rr(r, 300, 380);
  voice(out, sr, r, {
    dur,
    f0: [
      [0, base * 1.15],
      [0.06, base * 1.25],
      [dur * 0.45, base * 0.85],
      [dur, base * 0.62],
    ],
    vowels: [
      [0, 'i'],
      [dur * 0.35, 'e'],
      [dur, 'uh'],
    ],
    formantScale: 1.22,
    bw: [140, 180, 250],
    env: [
      [0, 0],
      [0.012, 1],
      [dur * 0.4, 0.55],
      [dur, 0],
    ],
    vibrato: { rate: 8, depth: 0.05 },
    jitter: 0.07,
    shimmer: 0.3,
    breath: 0.55,
    fry: { rate: 34, depth: 0.25, irregular: 0.7 },
    drive: 1.8,
  });
  return finalize(out, sr, { peak: 0.6, fadeIn: 0.002, fadeOut: 0.05 });
}

/** Dying: a sharp gasp in, a long falling sigh out, and the rattle at the end of it. */
export function fzombieGasp(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 1.9);
  // the gasp in: rising, through an open throat
  noiseLayer(out, sr, r, { dur: 0.24, gain: 0.55, attack: 0.18, tau: 0.05, color: 'pink', filters: [{ type: 'bp', f: rr(r, 1500, 2100), q: 1.1 }] });
  const base = rr(r, 230, 280);
  const t0 = 0.3;
  const d = 1.2;
  voice(out, sr, r, {
    start: t0,
    dur: d,
    f0: [
      [0, base],
      [0.25, base * 0.85],
      [0.7, base * 0.6],
      [d, base * 0.4],
    ],
    vowels: [
      [0, 'a'],
      [0.6, 'uh'],
      [d, 'u'],
    ],
    formantScale: TRACT,
    bw: [130, 170, 240],
    env: [
      [0, 0],
      [0.05, 0.9],
      [0.5, 0.6],
      [d * 0.85, 0.2],
      [d, 0],
    ],
    vibrato: { rate: 5, depth: 0.04 },
    jitter: 0.08,
    shimmer: 0.3,
    breath: 0.6,
    // the rattle grows as the breath runs out
    fry: { rate: 22, depth: 0.55, irregular: 0.8 },
    sub: 0.2,
    drive: 1.5,
    rasp: { f: 2600, q: 1.2, gain: 0.14 },
  });
  return finalize(out, sr, { peak: 0.62, fadeIn: 0.004, fadeOut: 0.15 });
}
