/**
 * The Sakura District's own sounds: the shrine's great bell, a lantern taking the flame, an omamori found, the bloom,
 * the ghost train, and the two relics from Kisaragi (Hanafubuki's petal stream and Raijin's Drum).
 */
import { type Ctx, alloc, crackles, echoTaps, finalize, modalLayer, noiseLayer, toneLayer } from './dsp';
import { bell, taiko } from './notes';

/** The temple bell (bonshou): one deep strike and a long, beating hum. */
export function templeBell(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 7.5);
  noiseLayer(out, sr, r, { dur: 0.08, gain: 0.4, attack: 0.001, tau: 0.03, color: 'pink', filters: [{ type: 'lp', f: 900 }] });
  modalLayer(out, sr, r, {
    f0: 74,
    gain: 1,
    partials: [
      [1, 1, 5.2],
      [1.012, 0.7, 5.0], // the beating pair
      [2.02, 0.45, 3.2],
      [2.76, 0.35, 2.2],
      [3.9, 0.22, 1.4],
      [5.3, 0.12, 0.8],
    ],
    excite: 'noise',
    detune: 0.002,
  });
  return finalize(out, sr, { peak: 0.8, fadeOut: 0.6 });
}

/** A great lantern takes the flame: a soft rush of air and a high chime. */
export function lanternLight(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 2.2);
  noiseLayer(out, sr, r, { dur: 0.7, gain: 0.5, attack: 0.12, tau: 0.35, filters: [{ type: 'bp', f: 700, f2: 2200, q: 1.2 }] });
  bell(out, sr, r, 0.18, 1318, 0.35, 0.8);
  bell(out, sr, r, 0.3, 1975, 0.22, 0.6);
  return finalize(out, sr, { peak: 0.55, fadeOut: 0.3 });
}

/** An omamori found: two small bells. */
export function omamoriChime(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 1.6);
  bell(out, sr, r, 0, 1568, 0.4, 0.5);
  bell(out, sr, r, 0.14, 2093, 0.35, 0.5);
  return finalize(out, sr, { peak: 0.5, fadeOut: 0.2 });
}

/** The bloom: a deep drum, a swelling choir-like pad and a fall of bells. */
export function bloomSwell(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 6.5);
  taiko(out, sr, r, 0, 0.9, 0.8);
  taiko(out, sr, r, 0.9, 0.7, 0.9);
  for (const [f, g] of [
    [110, 0.4],
    [164.8, 0.3],
    [220, 0.28],
    [261.6, 0.2],
  ] as const) toneLayer(out, sr, r, { start: 0.4, dur: 5.4, gain: g, f0: f, f1: f * 1.004, tau: 4, attack: 2.2, harmonics: [0.4, 0.2, 0.1], vib: { rate: 4.6, depth: 0.004 } });
  for (let i = 0; i < 9; i++) bell(out, sr, r, 2.2 + i * 0.32 + r() * 0.05, [1318, 1175, 988, 880, 784, 659, 587, 523, 440][i]!, 0.18, 0.7);
  echoTaps(out, sr, [
    { t: 0.31, g: 0.3 },
    { t: 0.67, g: 0.18 },
  ]);
  return finalize(out, sr, { peak: 0.75, fadeIn: 0.01, fadeOut: 0.8 });
}

/** The ghost train: a far, falling horn and the rails humming. */
export function ghostTrain(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 4.5);
  for (const f of [311, 392]) toneLayer(out, sr, r, { start: 0.1, dur: 1.6, gain: 0.35, f0: f, f1: f * 0.94, tau: 1.4, attack: 0.15, wave: 'saw', harmonics: [0.3, 0.1] });
  noiseLayer(out, sr, r, { start: 0.4, dur: 3.8, gain: 0.35, attack: 1.2, tau: 2.2, filters: [{ type: 'lp', f: 300 }], am: { rate: 7, depth: 0.5 } });
  echoTaps(out, sr, [
    { t: 0.45, g: 0.35 },
    { t: 0.9, g: 0.2 },
  ]);
  return finalize(out, sr, { peak: 0.6, fadeOut: 0.8 });
}

/** Hanafubuki: one round of the petal stream - a breathy rotary snap. */
export function petalShot(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 0.32);
  noiseLayer(out, sr, r, { dur: 0.12, gain: 0.8, attack: 0.001, tau: 0.03, filters: [{ type: 'bp', f: 2600, q: 0.9 }] });
  toneLayer(out, sr, r, { dur: 0.08, gain: 0.5, f0: 420, f1: 160, tau: 0.03, attack: 0.001, drive: 1.4 });
  bell(out, sr, r, 0.005, 2640 + r() * 300, 0.12, 0.15);
  return finalize(out, sr, { peak: 0.7, fadeOut: 0.05 });
}

/** Raijin's Drum: the drum struck, a thunderclap and the crackle of lightning running out. */
export function thunderShot(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 2.4);
  taiko(out, sr, r, 0, 1, 0.7);
  noiseLayer(out, sr, r, { dur: 1.9, gain: 0.8, attack: 0.002, tau: 0.5, color: 'brown', filters: [{ type: 'lp', f: 1600 }] });
  crackles(out, sr, r, { start: 0.02, dur: 0.9, rate: 260, rateTau: 0.35, gain: 0.35, tau: 0.0015, filters: [{ type: 'hp', f: 2500 }] });
  return finalize(out, sr, { peak: 0.85, fadeOut: 0.4 });
}
