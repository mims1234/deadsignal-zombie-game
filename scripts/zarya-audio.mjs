// ZARYA's Phase 0 audio samples, generated through OpenRouter (run with Node 22+, ffmpeg on PATH):
//
//   node scripts/zarya-audio.mjs voices     six lines, two candidate voices each, plus one accented variant per character
//   node scripts/zarya-audio.mjs loop       one ambience loop, cut on the bar to exactly 20.000 s
//
// These are samples to judge, not the map's audio. Voices: ElevenLabs v4 Turbo by preset voice name; every take is
// transcribed by an audio model to see whether the words are right and whether the bracketed direction was read aloud.
// Loop: a Lyria 3 clip is always 30 s, so the cue is prompted at 96 BPM (one bar = 2.5 s, the clip = 12 bars); the script
// measures the real tempo, finds the downbeat, keeps eight bars from about bar 3, stretches them to the grid if the tempo
// drifted (up to 3 percent), crossfades the tail into the head and writes a WAV of exactly 20.000 s.
//
// The key: OPENROUTER_API_KEY, or OPENROUTER_API_KEY_BOT from the file named by OPENROUTER_ENV (it is never printed).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = 'https://openrouter.ai/api/v1';
const VOICE_MODEL = process.env.ZARYA_VOICE_MODEL || 'elevenlabs/eleven-v4-turbo';
function key() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = process.env.OPENROUTER_ENV;
  if (file && existsSync(file)) {
    const m = readFileSync(file, 'utf8').match(/^OPENROUTER_API_KEY(?:_BOT)?\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  }
  throw new Error('No OpenRouter key: set OPENROUTER_API_KEY or OPENROUTER_ENV');
}
const H = { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'research_notes/zarya/samples');
const TMP = join(tmpdir(), 'zarya-audio');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}
const ff = (args, opt) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], opt);

// ---------------------------------------------------------------------------------------------
// voices
// ---------------------------------------------------------------------------------------------

const CAST = { NINA: ['lily', 'alice'], VERA: ['sarah', 'laura'], TIMUR: ['liam', 'chris'] };
const LINES = [
  { id: 'nina-door', who: 'NINA', how: 'dry, unhurried', text: 'Thirty years I have kept this door. First time anyone has thanked me for it.' },
  { id: 'nina-gena', who: 'NINA', how: 'quietly, grief held back', text: "He isn't breathing, child. That isn't Gena any more.", accent: true },
  { id: 'vera-breath', who: 'VERA', how: 'hushed, urgent', text: "They're breathing. Look. All of them." },
  { id: 'vera-letgo', who: 'VERA', how: 'sharp, calling across a room', text: 'Hey. Hey! Let go of her.', accent: true },
  { id: 'timur-lifts', who: 'TIMUR', how: 'deadpan', text: 'Good. Then they can explain why the lifts are off.', accent: true },
  { id: 'timur-garage', who: 'TIMUR', how: 'lightly, a little defensive', text: "My garage is the green one. Don't judge." },
];

async function speak(say, voice) {
  const r = await fetch(`${API}/audio/speech`, { method: 'POST', headers: H, body: JSON.stringify({ model: VOICE_MODEL, input: say, voice, response_format: 'mp3' }) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 2000) throw new Error('tiny take');
  return buf;
}
async function judge(text, file) {
  const prompt = `This is one voice-over take for a game. The line should say exactly: "${text}". Answer as JSON only: {"transcript": "...", "spokeTags": true|false (was a stage direction in brackets read aloud), "wordsRight": true|false, "fit": 1-10 (how natural and well acted it sounds)}.`;
  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ model: 'google/gemini-3.8-flash', messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'input_audio', input_audio: { data: readFileSync(file).toString('base64'), format: 'mp3' } }] }], response_format: { type: 'json_object' } }),
  });
  if (!r.ok) return { note: `judge ${r.status}` };
  try {
    const v = JSON.parse((await r.json()).choices[0].message.content.replace(/^```json|```$/g, ''));
    return { transcript: String(v.transcript), spokeTags: !!v.spokeTags, wordsRight: !!v.wordsRight, fit: Number(v.fit) || 0 };
  } catch {
    return { note: 'judge unreadable' };
  }
}
async function voices() {
  const dir = join(OUT, 'voice');
  mkdirSync(dir, { recursive: true });
  const jobs = [];
  for (const l of LINES) {
    for (const v of CAST[l.who]) jobs.push({ ...l, voice: v, say: `[${l.how}] ${l.text}`, file: `${l.id}.${v}.mp3` });
    if (l.accent) jobs.push({ ...l, voice: CAST[l.who][0], variant: 'Russian accent', say: `[Russian accent, ${l.how}] ${l.text}`, file: `${l.id}.${CAST[l.who][0]}.accent.mp3` });
  }
  const report = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (i < jobs.length) {
        const j = jobs[i++];
        try {
          const raw = join(TMP, j.file);
          writeFileSync(raw, await retry(() => speak(j.say, j.voice)));
          const verdict = await judge(j.text, raw);
          ff(['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,loudnorm=I=-17:TP=-1.5:LRA=11', '-ac', '1', '-ar', '44100', '-b:a', '64k', join(dir, j.file)]);
          report.push({ id: j.id, who: j.who, voice: j.voice, variant: j.variant ?? null, text: j.text, how: j.how, file: `voice/${j.file}`, ...verdict });
          console.log(`${j.file}: ${verdict.fit ?? '?'}/10${verdict.spokeTags ? ' TAGS SPOKEN' : ''}${verdict.wordsRight === false ? ' WORDS WRONG' : ''}`);
        } catch (e) {
          console.log(`${j.file}: FAILED ${e.message}`);
        }
      }
    }),
  );
  report.sort((a, b) => LINES.findIndex((l) => l.id === a.id) - LINES.findIndex((l) => l.id === b.id) || String(a.file).localeCompare(b.file));
  writeFileSync(join(OUT, 'voices.json'), JSON.stringify({ model: VOICE_MODEL, chars: jobs.reduce((s, j) => s + j.say.length, 0), takes: report }, null, 2));
}

// ---------------------------------------------------------------------------------------------
// the loop
// ---------------------------------------------------------------------------------------------

const BPM = 96;
const LOOP_PROMPT = `Instrumental only, no vocals, no lyrics. Exactly ${BPM} BPM in 4/4, D minor. Quiet night music for a snowbound town in the Russian north: a soft felt-piano ostinato, a low string pad, a distant balalaika tremolo, a faint sleigh-bell shimmer. A soft, clear kick drum on every beat from the very first second to the last, so the tempo is unmistakable. No intro, no build, no breakdown, no ending: the same steady texture all the way through, made to loop.`;

async function lyria(prompt) {
  const r = await fetch(`${API}/chat/completions`, { method: 'POST', headers: H, body: JSON.stringify({ model: 'google/lyria-3-clip-preview', modalities: ['text', 'audio'], audio: { format: 'mp3' }, stream: true, messages: [{ role: 'user', content: prompt }] }) });
  if (!r.ok) throw new Error(`lyria ${r.status} ${(await r.text()).slice(0, 200)}`);
  const chunks = [];
  let text = '';
  const dec = new TextDecoder();
  for await (const part of r.body) {
    text += dec.decode(part, { stream: true });
    let nl;
    while ((nl = text.indexOf('\n')) >= 0) {
      const ln = text.slice(0, nl).trim();
      text = text.slice(nl + 1);
      if (!ln.startsWith('data:')) continue;
      const data = ln.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const a = JSON.parse(data).choices?.[0]?.delta?.audio?.data;
        if (a) chunks.push(Buffer.from(a, 'base64'));
      } catch {
        /* keep-alive */
      }
    }
  }
  const buf = Buffer.concat(chunks);
  if (buf.length < 20000) throw new Error('lyria: no audio');
  return buf;
}

function pcm(args) {
  const raw = ff([...args, '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.byteLength & ~3)));
}

/** The clip's real tempo (searched 3 percent either side of the asked one), its beat phase and which beat is the downbeat. */
function analyse(file) {
  const sr = 11025;
  const hop = 128;
  const fps = sr / hop;
  const x = pcm(['-i', file, '-ac', '1', '-ar', String(sr)]);
  const n = Math.floor(x.length / hop);
  const on = new Float32Array(n); // onset strength: the rise in log energy from one hop to the next
  let prev = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < hop; j++) s += x[i * hop + j] ** 2;
    const e = Math.log(1e-7 + s / hop);
    if (i > 0) on[i] = Math.max(0, e - prev);
    prev = e;
    mean += on[i] / n;
  }
  const at = (t) => {
    const i = Math.floor(t);
    if (i < 0 || i + 1 >= n) return 0;
    return on[i] * (1 - (t - i)) + on[i + 1] * (t - i);
  };
  let best = { score: -1 };
  for (let bpm = BPM * 0.97; bpm <= BPM * 1.03; bpm += 0.02) {
    const p = (60 / bpm) * fps;
    for (let k = 0; k < 32; k++) {
      const ph = (k / 32) * p;
      let s = 0;
      let c = 0;
      for (let t = ph; t < n - 1; t += p) {
        s += at(t);
        c++;
      }
      if (s / c > best.score) best = { score: s / c, bpm, p, ph };
    }
  }
  const beats = [];
  for (let t = best.ph; t < n - 1; t += best.p) beats.push(t / fps);
  let down = 0;
  let downScore = -1;
  for (let m = 0; m < 4; m++) {
    let s = 0;
    let c = 0;
    for (let b = m; b < beats.length; b += 4) {
      s += at(beats[b] * fps);
      c++;
    }
    if (s / c > downScore) {
      downScore = s / c;
      down = m;
    }
  }
  return { bpm: best.bpm, beat: 60 / best.bpm, firstDown: beats[down], duration: x.length / sr, confidence: best.score / (mean || 1e-9) };
}

/** Eight bars from about bar 3, on the grid, tail crossfaded into the head. Returns the measurements. */
function cut(file, out) {
  const a = analyse(file);
  const bar = a.beat * 4;
  const len = bar * 8;
  let t0 = a.firstDown;
  while (t0 < 2 * bar - 0.25 * bar) t0 += bar; // skip the ramp-in
  while (t0 + len + 0.2 > a.duration && t0 - bar >= 0) t0 -= bar;
  const ratio = len / 20; // atempo above 1 plays faster, so eight real bars land on 20 s
  const sr = 44100;
  const N = 20 * sr;
  const X = Math.round(0.03 * sr);
  const s = pcm(['-ss', (t0 - 0.008).toFixed(4), '-t', (len + 0.25).toFixed(4), '-i', file, '-af', `atempo=${ratio.toFixed(6)}`, '-ac', '2', '-ar', String(sr)]);
  if (s.length < (N + X) * 2) throw new Error('clip too short for an eight-bar cut');
  const o = s.slice(0, N * 2);
  for (let i = 0; i < X; i++) {
    const th = (i / X) * (Math.PI / 2);
    for (let ch = 0; ch < 2; ch++) o[i * 2 + ch] = o[i * 2 + ch] * Math.sin(th) + s[(N + i) * 2 + ch] * Math.cos(th);
  }
  let sq = 0;
  let peak = 0;
  for (let i = 0; i < o.length; i++) {
    sq += o[i] * o[i];
    peak = Math.max(peak, Math.abs(o[i]));
  }
  const gain = Math.min(0.1 / Math.sqrt(sq / o.length), 0.89 / peak); // about -20 dBFS RMS, one gain for the whole loop
  const wav = Buffer.alloc(44 + N * 4);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + N * 4, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(sr, 24);
  wav.writeUInt32LE(sr * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N * 2; i++) wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(o[i] * gain * 32767))), 44 + i * 2);
  writeFileSync(out, wav);
  // the join: how big the step from the last sample back to the first is, against a typical step between neighbours
  let step = 0;
  for (let i = 2; i < o.length; i++) step += (o[i] - o[i - 2]) ** 2;
  const typical = Math.sqrt(step / (o.length - 2));
  const wrap = Math.max(Math.abs(o[0] - o[o.length - 2]), Math.abs(o[1] - o[o.length - 1]));
  return { bpm: Number(a.bpm.toFixed(2)), drift: Number(((a.bpm / BPM - 1) * 100).toFixed(2)), confidence: Number(a.confidence.toFixed(2)), cutFrom: Number(t0.toFixed(3)), stretch: Number(ratio.toFixed(5)), samples: N, seconds: N / sr, seamStep: Number((wrap / (typical || 1e-9)).toFixed(2)) };
}

async function loop() {
  const takes = Number(process.env.TAKES) || 2;
  const results = [];
  for (let t = 0; t < takes; t++) {
    try {
      const raw = join(OUT, `loop-raw.${t}.mp3`);
      if (!existsSync(raw) || process.env.FORCE) writeFileSync(raw, await retry(() => lyria(LOOP_PROMPT)));
      const wav = join(TMP, `loop.${t}.wav`);
      const m = cut(raw, wav);
      results.push({ take: t, raw: `loop-raw.${t}.mp3`, wav, ...m });
      console.log(`take ${t}: ${m.bpm} BPM (${m.drift}% off), stretch ${m.stretch}, join step x${m.seamStep}, beat confidence ${m.confidence}`);
    } catch (e) {
      console.log(`take ${t}: FAILED ${e.message}`);
    }
  }
  if (results.length === 0) throw new Error('no usable take');
  // the take that needed the least stretching, among those the beat tracker was sure about
  results.sort((a, b) => Math.abs(a.drift) - Math.abs(b.drift) - (a.confidence - b.confidence) * 0.2);
  const best = results[0];
  writeFileSync(join(OUT, 'loop.wav'), readFileSync(best.wav));
  ff(['-i', best.wav, '-b:a', '160k', join(OUT, 'loop.mp3')]);
  // a second opinion on the join: the loop played twice back to back, heard by an audio model
  const twice = join(TMP, 'loop-twice.mp3');
  ff(['-stream_loop', '1', '-i', best.wav, '-b:a', '128k', twice]);
  let heard = { note: 'not checked' };
  try {
    const prompt = 'This file is one 20-second piece of music played twice back to back, so the join is at exactly 20.0 seconds. Listen closely around 20 seconds. Answer as JSON only: {"clickAtJoin": true|false, "beatStumbles": true|false (does the rhythm skip, stutter or change speed at the join), "notes": "one sentence"}.';
    const r = await fetch(`${API}/chat/completions`, { method: 'POST', headers: H, body: JSON.stringify({ model: 'google/gemini-3.8-flash', messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'input_audio', input_audio: { data: readFileSync(twice).toString('base64'), format: 'mp3' } }] }], response_format: { type: 'json_object' } }) });
    if (r.ok) heard = JSON.parse((await r.json()).choices[0].message.content.replace(/^```json|```$/g, ''));
    else heard = { note: `listener ${r.status}` };
  } catch (e) {
    heard = { note: 'listener unreadable' };
  }
  console.log(`join, as heard: ${JSON.stringify(heard)}`);
  writeFileSync(join(OUT, 'loop.json'), JSON.stringify({ asked: { bpm: BPM, prompt: LOOP_PROMPT }, chosen: best.take, heard, takes: results.map(({ wav, ...r }) => r) }, null, 2));
  console.log(`chose take ${best.take}: ${best.samples} samples = ${best.seconds.toFixed(3)} s`);
}

const cmd = process.argv[2];
if (cmd === 'voices') await voices();
else if (cmd === 'loop') await loop();
else console.log('usage: node scripts/zarya-audio.mjs voices | loop');
