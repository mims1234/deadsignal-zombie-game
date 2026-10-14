/**
 * The Matron's sounds (the Asylum's boss, `src/enemies/matron.ts`): her shriek - a thin, high, wavering cry with a
 * second, slightly sour voice under it and the isolation block's hard walls throwing it back - and the ring of keys at
 * her belt, which you hear before you see her.
 */
import { type Ctx, alloc, echoTaps, finalize, noiseLayer, rr, sat, voice } from './dsp';
import { click, ring } from './foley';

/** The shriek: a sharp intake, then a long scream that climbs, wavers and breaks downward. ~2 s. */
export function matronShriek(c: Ctx): Float32Array {
  const { sr, r } = c;
  const D = 1.75 + r() * 0.2;
  const out = alloc(sr, D + 0.65);
  // the breath in
  noiseLayer(out, sr, r, { dur: 0.22, gain: 0.25, attack: 0.15, tau: 0.08, color: 'pink', filters: [{ type: 'bp', f: 2400, q: 0.8 }] });
  const t0 = 0.2;
  const base = rr(r, 560, 640);
  const layer = (mul: number, gain: number, wob: number): void => {
    voice(out, sr, r, {
      start: t0,
      dur: D,
      gain,
      f0: [
        [0, base * 0.8 * mul],
        [0.12, base * 1.3 * mul],
        [D * 0.45, base * 1.45 * mul],
        [D * 0.75, base * 1.2 * mul],
        [D, base * 0.62 * mul],
      ],
      vowels: [
        [0, 'ae'],
        [0.2, 'i'],
        [D * 0.7, 'e'],
        [D, 'a'],
      ],
      formantScale: 1.32,
      bw: [160, 220, 300],
      env: [
        [0, 0],
        [0.06, 1],
        [D * 0.65, 0.85],
        [D, 0],
      ],
      vibrato: { rate: rr(r, 6.5, 8), depth: wob },
      jitter: 0.04,
      shimmer: 0.2,
      breath: 0.35,
      fry: { rate: 46, depth: 0.2, irregular: 0.7 },
      drive: 3.5,
      rasp: { f: 5200, q: 0.9, gain: 0.22 },
    });
  };
  layer(1, 1, 0.035);
  layer(1.06, 0.45, 0.06); // a second voice a little sharp of the first: wrong, like two throats
  echoTaps(out, sr, [
    { t: 0.11, g: 0.3, lp: 2600 },
    { t: 0.23, g: 0.2, lp: 1800 },
    { t: 0.41, g: 0.12, lp: 1200 },
  ]);
  for (let i = 0; i < out.length; i++) out[i] = sat(out[i]! * 1.3);
  return finalize(out, sr, { peak: 0.7, fadeIn: 0.01, fadeOut: 0.2 });
}

/** A ring of old iron and brass keys swinging against each other. ~0.7 s. */
export function keysJingle(c: Ctx): Float32Array {
  const { sr, r } = c;
  const out = alloc(sr, 0.75);
  const n = 6 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const t = Math.pow(r(), 1.4) * 0.38;
    const f = rr(r, 2100, 4600);
    ring(out, sr, r, t, f, rr(r, 0.05, 0.16), rr(r, 0.35, 0.8), [1, 2.42, 4.1, 6.9]);
    click(out, sr, r, t, { f: rr(r, 3000, 6000), q: 1.5, tau: 0.0015, gain: 0.35 });
  }
  return finalize(out, sr, { peak: 0.5, fadeOut: 0.08 });
}
