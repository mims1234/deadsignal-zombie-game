/**
 * Sounds for the barricades (boards torn off, nailed back, an infected climbing in) and the power-up drops: a shimmer
 * when one appears and, when one is taken, a deep announcer-like call (formant syllables in the cadence of its name)
 * over a stinger of its own.
 */
import { type Ctx, type Rand, type Vowel, alloc, crackles, echoTaps, finalize, noiseLayer, toneLayer, voice } from './dsp';
import { clack, click, ring, rustle, scrape, thud } from './foley';
import { bell, brass, midi, taiko } from './notes';

// ---------------------------------------------------------------------------------------------
// barricades
// ---------------------------------------------------------------------------------------------

/** A board wrenched off a window: creak, nails shrieking out, the crack of splitting wood. */
export function boardRip(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 0.9);
  toneLayer(out, sr, r, { dur: 0.22, gain: 0.3, wave: 'saw', f0: 210 + r() * 60, f1: 330, tau: 0.25, attack: 0.03, jitter: 0.5, drive: 1.4 });
  scrape(out, sr, r, 0.06, 0.2, { f0: 1700, f1: 2900, gain: 0.32, grit: 0.7, q: 5, flutter: 70 });
  clack(out, sr, r, 0.2, { f: 900, ring: 320, ringTau: 0.07, gain: 0.85, ringGain: 0.6 });
  crackles(out, sr, r, { start: 0.19, dur: 0.18, rate: 420, rateTau: 0.06, gain: 0.5, tau: 0.0012, filters: [{ type: 'bp', f: 2200, q: 0.7 }] });
  thud(out, sr, r, 0.21, { f0: 150, f1: 70, tau: 0.04, gain: 0.6 });
  ring(out, sr, r, 0.23, 3100 + r() * 400, 0.05, 0.12, [1, 2.7]);
  return finalize(out, sr, { peak: 0.7, fadeOut: 0.1 });
}

/** A board nailed back: two hammer blows on wood and nail. */
export function boardHammer(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 0.62);
  for (const t of [0, 0.24]) {
    clack(out, sr, r, t, { f: 2300 + r() * 300, ring: 1250 + r() * 200, ringTau: 0.04, gain: 0.8, ringGain: 0.5 });
    thud(out, sr, r, t, { f0: 210, f1: 110, tau: 0.03, gain: 0.55, bodyF: 900 });
  }
  ring(out, sr, r, 0.25, 2600 + r() * 300, 0.09, 0.16, [1, 2.4, 4.1]);
  return finalize(out, sr, { peak: 0.62, fadeOut: 0.08 });
}

/** An infected hauling itself over a sill and dropping inside. */
export function boardClimb(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 0.9);
  rustle(out, sr, r, 0, 0.45, { gain: 0.35, lo: 300, hi: 2400 });
  scrape(out, sr, r, 0.1, 0.3, { f0: 500, f1: 900, gain: 0.25, grit: 0.5 });
  thud(out, sr, r, 0.52, { f0: 120, f1: 55, tau: 0.06, gain: 0.95, body: 0.7 });
  crackles(out, sr, r, { start: 0.53, dur: 0.2, rate: 60, rateTau: 0.08, gain: 0.25, tau: 0.002, filters: [{ type: 'bp', f: 1600, q: 0.8 }] });
  return finalize(out, sr, { peak: 0.6, fadeOut: 0.12 });
}

// ---------------------------------------------------------------------------------------------
// power-ups
// ---------------------------------------------------------------------------------------------

/** A drop appears: a rising, glassy shimmer. */
export function powerupSpawn(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 1.6);
  [76, 79, 83, 88].forEach((m, i) => bell(out, sr, r, i * 0.07, midi(m), 0.5 - i * 0.05, 0.8));
  noiseLayer(out, sr, r, { dur: 0.6, gain: 0.18, attack: 0.25, tau: 0.4, filters: [{ type: 'bp', f: 3000, f2: 7000, q: 3 }] });
  echoTaps(out, sr, [
    { t: 0.12, g: 0.3, lp: 5000 },
    { t: 0.26, g: 0.18, lp: 3500 },
  ]);
  return finalize(out, sr, { peak: 0.5, fadeOut: 0.3 });
}

/** A timed power-up runs out: two falling notes. */
export function powerupEnd(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 1.1);
  bell(out, sr, r, 0, midi(76), 0.6, 0.6);
  bell(out, sr, r, 0.16, midi(69), 0.6, 0.7);
  toneLayer(out, sr, r, { start: 0.16, dur: 0.6, gain: 0.25, f0: 220, f1: 180, tau: 0.3, attack: 0.02 });
  return finalize(out, sr, { peak: 0.45, fadeOut: 0.2 });
}

type Consonant = 's' | 'k' | 'p' | 'n' | 't' | '';

/** One spoken syllable: an optional consonant, then a vowel glide on a deep, slightly growled announcer voice. */
function syllable(out: Float32Array, sr: number, r: Rand, t: number, dur: number, cons: Consonant, v0: Vowel, v1: Vowel, f0: number): void {
  let at = t;
  if (cons === 's') {
    noiseLayer(out, sr, r, { start: t, dur: 0.11, gain: 0.32, attack: 0.03, tau: 0.08, filters: [{ type: 'hp', f: 4200 }] });
    at += 0.08;
  } else if (cons === 'k' || cons === 't') {
    click(out, sr, r, t, { f: cons === 'k' ? 1700 : 3200, q: 1, tau: 0.006, gain: 0.45 });
    noiseLayer(out, sr, r, { start: t + 0.005, dur: 0.05, gain: 0.15, attack: 0.002, tau: 0.03, filters: [{ type: 'hp', f: 2500 }] });
    at += 0.03;
  } else if (cons === 'p') {
    thud(out, sr, r, t, { f0: 180, f1: 90, tau: 0.012, gain: 0.3 });
    at += 0.02;
  } else if (cons === 'n') {
    toneLayer(out, sr, r, { start: t, dur: 0.08, gain: 0.3, f0, tau: 0.2, attack: 0.01, harmonics: [0.3, 0.1] });
    at += 0.05;
  }
  voice(out, sr, r, {
    start: at,
    dur,
    gain: 0.9,
    f0: [
      [0, f0 * 1.1],
      [dur * 0.35, f0],
      [dur, f0 * 0.82],
    ],
    vowels: [
      [0, v0],
      [dur * 0.85, v1],
    ],
    formantScale: 0.84,
    bw: [85, 115, 170],
    env: [
      [0, 0],
      [0.03, 1],
      [dur * 0.65, 0.85],
      [dur, 0],
    ],
    vibrato: { rate: 5.2, depth: 0.012 },
    jitter: 0.012,
    breath: 0.06,
    sub: 0.22,
    drive: 1.5,
  });
}

/** The announcer's echoing hall. */
function hall(out: Float32Array, sr: number): void {
  echoTaps(out, sr, [
    { t: 0.11, g: 0.26, lp: 2600 },
    { t: 0.23, g: 0.17, lp: 1900 },
    { t: 0.37, g: 0.1, lp: 1400 },
  ]);
}

/** MAX AMMO: a brass fanfare and "max am-mo". */
export function powerupMaxAmmo(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 2.6);
  [57, 64, 69].forEach((m, i) => brass(out, sr, r, { start: 0.02 + i * 0.05, dur: 0.6, release: 0.5, f: midi(m), gain: 0.35, attack: 0.04, cutoff0: 500, cutoff1: 3000, sub: 0.2 }));
  taiko(out, sr, r, 0.02, 0.45);
  syllable(out, sr, r, 0.55, 0.36, 'n', 'ae', 'e', 82);
  syllable(out, sr, r, 1.0, 0.28, '', 'ae', 'uh', 80);
  syllable(out, sr, r, 1.3, 0.5, 'n', 'o', 'u', 70);
  hall(out, sr);
  return finalize(out, sr, { peak: 0.75, fadeOut: 0.3 });
}

/** INSTA-KILL: a skull-rattle of bells and "in-sta-kill". */
export function powerupInstaKill(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 2.6);
  [62, 61, 62, 68].forEach((m, i) => bell(out, sr, r, i * 0.07, midi(m), 0.45, 0.7));
  toneLayer(out, sr, r, { dur: 0.9, gain: 0.3, wave: 'saw', f0: 55, f1: 49, tau: 0.6, attack: 0.05, drive: 2 });
  syllable(out, sr, r, 0.55, 0.22, '', 'i', 'i', 84);
  syllable(out, sr, r, 0.8, 0.26, 's', 'uh', 'a', 80);
  syllable(out, sr, r, 1.22, 0.55, 'k', 'i', 'uh', 72);
  hall(out, sr);
  return finalize(out, sr, { peak: 0.75, fadeOut: 0.3 });
}

/** DOUBLE POINTS: two bright chimes, a cash-register ring and "dou-ble points". */
export function powerupDoublePoints(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 2.6);
  bell(out, sr, r, 0, midi(79), 0.55, 0.8);
  bell(out, sr, r, 0.13, midi(91), 0.5, 0.8);
  ring(out, sr, r, 0.26, 2900, 0.3, 0.25, [1, 2.7, 5.2]);
  syllable(out, sr, r, 0.55, 0.26, 't', 'uh', 'uh', 84);
  syllable(out, sr, r, 0.86, 0.22, 'p', 'uh', 'o', 80);
  syllable(out, sr, r, 1.18, 0.6, 'p', 'o', 'i', 72);
  noiseLayer(out, sr, r, { start: 1.72, dur: 0.12, gain: 0.25, attack: 0.03, tau: 0.08, filters: [{ type: 'hp', f: 4200 }] });
  hall(out, sr);
  return finalize(out, sr, { peak: 0.75, fadeOut: 0.3 });
}

/** NUKE: a long rising whine, a huge low boom and a drawn-out "nuke". */
export function powerupNuke(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 3.2);
  toneLayer(out, sr, r, { dur: 0.5, gain: 0.3, f0: 300, f1: 1400, tau: 2, attack: 0.3 });
  taiko(out, sr, r, 0.45, 0.9, 0.6);
  toneLayer(out, sr, r, { start: 0.45, dur: 2.2, gain: 0.7, f0: 48, f1: 30, tau: 0.9, attack: 0.01, drive: 2.2 });
  noiseLayer(out, sr, r, { start: 0.45, dur: 2.2, gain: 0.55, attack: 0.01, tau: 0.8, color: 'brown', filters: [{ type: 'lp', f: 900, f2: 200 }] });
  crackles(out, sr, r, { start: 0.5, dur: 1.2, rate: 90, rateTau: 0.5, gain: 0.2, tau: 0.003, filters: [{ type: 'bp', f: 1200, q: 0.7 }] });
  syllable(out, sr, r, 1.0, 0.8, 'n', 'u', 'u', 66);
  click(out, sr, r, 1.85, { f: 1600, q: 1, tau: 0.008, gain: 0.3 });
  hall(out, sr);
  return finalize(out, sr, { peak: 0.85, fadeOut: 0.4 });
}

/** CARPENTER: hammer blows in rhythm and "car-pen-ter". */
export function powerupCarpenter(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 2.6);
  for (const t of [0, 0.14, 0.28]) {
    clack(out, sr, r, t, { f: 2200, ring: 1200 + t * 600, ringTau: 0.05, gain: 0.6, ringGain: 0.5 });
    thud(out, sr, r, t, { f0: 200, f1: 100, tau: 0.03, gain: 0.4, bodyF: 900 });
  }
  brass(out, sr, r, { start: 0.3, dur: 0.5, release: 0.4, f: midi(55), gain: 0.3, attack: 0.05, cutoff0: 400, cutoff1: 2200, sub: 0.3 });
  syllable(out, sr, r, 0.6, 0.3, 'k', 'a', 'a', 82);
  syllable(out, sr, r, 0.96, 0.24, 'p', 'e', 'e', 80);
  syllable(out, sr, r, 1.24, 0.5, 't', 'uh', 'uh', 70);
  hall(out, sr);
  return finalize(out, sr, { peak: 0.75, fadeOut: 0.3 });
}
