// MUJIN's voices and score, generated through OpenRouter (run with Node 22+):
//
//   node --experimental-strip-types scripts/mujin-audio.mjs voices [ids...]   every line in src/mujin/lines.ts
//   node --experimental-strip-types scripts/mujin-audio.mjs music [ids...]    every cue
//
// Voices: ElevenLabs v4 (by voice name) or Fish Audio Drama 3, several takes each; every take is judged by an audio
// model (does it say the words, are the direction tags left unspoken, does it fit), the best is trimmed, levelled and
// saved as public/mujin/voice/<id>.mp3 (mono, 64 kbps). Music: Lyria 3 clips, a few takes each, the steadiest (or the
// best built, for the cues that rise) by its loudness curve, saved as public/mujin/music/<id>.mp3.
//
// The key: OPENROUTER_API_KEY, or OPENROUTER_API_KEY_BOT from the file named by OPENROUTER_ENV (it is never printed).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CUES, LINES } from '../src/mujin/lines.ts';

const API = 'https://openrouter.ai/api/v1';
function key() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = process.env.OPENROUTER_ENV;
  if (file && existsSync(file)) {
    const m = readFileSync(file, 'utf8').match(/^OPENROUTER_API_KEY(?:_BOT)?\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  }
  throw new Error('No OpenRouter key: set OPENROUTER_API_KEY or OPENROUTER_ENV');
}
const H = { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', 'X-Title': 'Zombies GenXmims' };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TMP = join(tmpdir(), 'mujin-audio');
mkdirSync(TMP, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw last;
}
async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

// ---------------------------------------------------------------------------------------------
// voices
// ---------------------------------------------------------------------------------------------

async function speak(line) {
  const body = line.model === 'fish' ? { model: 'fish-audio/drama-3', input: line.say ?? line.text, response_format: 'mp3' } : { model: 'elevenlabs/eleven-v4', input: line.say ?? line.text, voice: line.voice, response_format: 'mp3' };
  const r = await fetch(`${API}/audio/speech`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${line.id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 2000) throw new Error(`${line.id}: tiny take`);
  return buf;
}

async function judge(line, file) {
  const b64 = readFileSync(file).toString('base64');
  const words = line.ja ?? line.text;
  const prompt = `This is a voice-over take for a horror game. The line should say: "${words}". Wanted delivery: ${line.how}.\nAnswer as JSON only: {"transcript": "...", "spokeTags": true|false (did it read stage directions in brackets or parentheses aloud), "wordsRight": true|false, "fit": 1-10}.`;
  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ model: 'google/gemini-3.8-flash', messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'input_audio', input_audio: { data: b64, format: 'mp3' } }] }], response_format: { type: 'json_object' } }),
  });
  if (!r.ok) return { score: 1, note: `judge ${r.status}` };
  const j = await r.json();
  try {
    const v = JSON.parse(j.choices[0].message.content.replace(/^```json|```$/g, ''));
    const score = (v.wordsRight ? 10 : 0) + (v.spokeTags ? -20 : 0) + Number(v.fit || 0);
    return { score, note: `${v.fit}/10${v.spokeTags ? ' TAGS' : ''}${v.wordsRight ? '' : ' WORDS'} "${String(v.transcript).slice(0, 60)}"` };
  } catch {
    return { score: 1, note: 'judge unreadable' };
  }
}

async function voice(line) {
  const takes = line.who === 'REN' || line.who === 'STATIONMASTER' ? 3 : 2;
  const results = [];
  for (let t = 0; t < takes; t++) {
    try {
      const buf = await retry(() => speak(line));
      const f = join(TMP, `${line.id}.${t}.mp3`);
      writeFileSync(f, buf);
      const j = await judge(line, f);
      results.push({ f, ...j });
    } catch (e) {
      console.log(`  ${line.id} take ${t}: ${e.message}`);
    }
  }
  if (results.length === 0) return `${line.id}: FAILED`;
  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  const out = join(ROOT, 'public/mujin/voice', `${line.id}.mp3`);
  // trim the silence either end, level it, mono at 64 kbps
  ff(['-i', best.f, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,loudnorm=I=-17:TP=-1.5:LRA=11', '-ac', '1', '-ar', '44100', '-b:a', '64k', out]);
  return `${line.id}: ${best.note} (${results.length} takes)`;
}

// ---------------------------------------------------------------------------------------------
// music
// ---------------------------------------------------------------------------------------------

async function lyria(prompt) {
  const r = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ model: 'google/lyria-3-clip-preview', modalities: ['text', 'audio'], audio: { format: 'mp3' }, stream: true, messages: [{ role: 'user', content: prompt }] }),
  });
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

/** Per-second loudness (dB) of a file. */
function envelope(file) {
  const err = execFileSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'asetnsamples=44100,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  return [...err.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === '-inf' ? -90 : Number(m[1])));
}

async function cue(c) {
  const takes = [];
  for (let t = 0; t < 3; t++) {
    try {
      const buf = await retry(() => lyria(c.prompt), 3);
      const f = join(TMP, `${c.id}.${t}.mp3`);
      writeFileSync(f, buf);
      const env = envelope(f);
      const mean = env.reduce((a, b) => a + b, 0) / Math.max(1, env.length);
      const dev = Math.sqrt(env.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, env.length));
      const rise = env.length > 6 ? env.slice(-5).reduce((a, b) => a + b, 0) / 5 - env.slice(0, 5).reduce((a, b) => a + b, 0) / 5 : 0;
      // loops want a steady level; the cues that build want the biggest rise; the endings want neither extreme
      const score = c.loop ? -dev : c.id === 'bell' || c.id === 'dawn' ? rise : -Math.abs(dev - 4);
      takes.push({ f, score, note: `mean ${mean.toFixed(1)} dB dev ${dev.toFixed(1)} rise ${rise.toFixed(1)}` });
    } catch (e) {
      console.log(`  ${c.id} take ${t}: ${e.message}`);
    }
  }
  if (takes.length === 0) return `${c.id}: FAILED`;
  takes.sort((a, b) => b.score - a.score);
  const out = join(ROOT, 'public/mujin/music', `${c.id}.mp3`);
  const fade = c.loop ? 'afade=t=in:d=0.05' : 'afade=t=in:d=0.05,areverse,afade=t=in:d=1.5,areverse';
  ff(['-i', takes[0].f, '-af', `${fade},loudnorm=I=-19:TP=-1.5:LRA=11`, '-ac', '2', '-ar', '44100', '-b:a', '128k', out]);
  return `${c.id}: ${takes[0].note} (${takes.length} takes)`;
}

// ---------------------------------------------------------------------------------------------

const [what, ...only] = process.argv.slice(2);
mkdirSync(join(ROOT, 'public/mujin/voice'), { recursive: true });
mkdirSync(join(ROOT, 'public/mujin/music'), { recursive: true });
if (what === 'voices') {
  const list = LINES.filter((l) => only.length === 0 || only.includes(l.id));
  console.log(`voices: ${list.length}`);
  const res = await pool(list, 6, async (l) => {
    const r = await voice(l);
    console.log(r);
    return r;
  });
  writeFileSync(join(TMP, 'voices.log'), res.join('\n'));
} else if (what === 'music') {
  const list = CUES.filter((c) => only.length === 0 || only.includes(c.id));
  const res = await pool(list, 3, async (c) => {
    const r = await cue(c);
    console.log(r);
    return r;
  });
  writeFileSync(join(TMP, 'music.log'), res.join('\n'));
} else {
  console.log('usage: mujin-audio.mjs voices|music [ids...]');
}
rmSync(join(TMP, 'never'), { force: true });
