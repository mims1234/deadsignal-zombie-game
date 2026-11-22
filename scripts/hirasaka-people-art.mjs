// HIRASAKA's people: one painted head-and-shoulders portrait per character, for the captions, the first-meeting cards
// and the journal's PEOPLE page (the same system ZARYA uses, `src/zarya/people.ts`). Generated through OpenRouter
// (Node 22+, ffmpeg on PATH):
//
//   OPENROUTER_ENV=path/to/.env node scripts/hirasaka-people-art.mjs [ids...]      (FORCE=1 redoes the ids given)
//
// Natsuki is painted first, sent ZARYA's anchor portrait (Nina) as a style reference so the two maps' casts match; every
// other portrait is sent Natsuki's as its reference, so HIRASAKA's cast reads as one set. Each lands in
// public/hirasaka/people/<id>.webp at 256 x 256 (as ZARYA's do); research_notes/hirasaka/refs/people.json lists the
// prompts and what each call cost; the full-size paintings are kept in research_notes/hirasaka/refs/people-src. No
// lettering is ever asked for. The key: OPENROUTER_API_KEY, or OPENROUTER_API_KEY_BOT from the file named by
// OPENROUTER_ENV (never printed).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://openrouter.ai/api/v1';
const MODEL = process.env.HIRASAKA_ART_MODEL || 'openai/gpt-image-2.6-flare';
const QUALITY = process.env.QUALITY || 'medium';
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
const OUT = join(ROOT, 'public/hirasaka/people');
const NOTES = join(ROOT, 'research_notes/hirasaka/refs');
const SRC = join(NOTES, 'people-src');
for (const d of [OUT, SRC]) mkdirSync(d, { recursive: true });

const LOOK =
  'Painterly anime character portrait for a video game, head and shoulders, face centred and filling most of the frame, three-quarter view, soft cel shading, clean shapes. Lit by a warm sodium-orange lamp from one side and cold storm-teal night light on the other; a few faint streaks of rain; plain dark teal-black background with no scenery. Square. No text, no lettering, no logos, no frame, no border, no watermark, one person only.';
const OLD =
  'Painted as if from a faded 1974 colour photograph: warm washed-out film colours, soft grain, slightly lifted blacks, the same painterly anime portrait style.';

const PEOPLE = [
  { id: 'natsuki', prompt: 'Natsuki Arai, a Japanese structural engineer in her late twenties: a short teal-dyed bob haircut, dark teal eyes, fair skin, a bright orange high-visibility work jacket with reflective stripes over a dark navy top, a yellow hard hat pushed back on her head with rain on it, a small torch clipped to her collar; a sharp, capable, determined face, a little wry, someone who reads buildings for a living.' },
  { id: 'daigo', prompt: 'Daigo, a Japanese man of about thirty, a fishing-boat skipper who ferries people out to the islands: short messy black hair wet with rain, a few days of stubble, sun- and salt-weathered skin, a dark yellow oilskin rain jacket with the hood down over a navy work sweater, an orange life vest strap over one shoulder, a small towel round his neck; steady, warm, stubborn eyes, a half smile under strain.' },
  { id: 'genzo', prompt: `Genzo, a Japanese coal miner in 1974, about thirty, worn older than his years: a hard pit helmet with a cap lamp, a white towel knotted round his neck, a grimy open-collared work shirt, coal dust in the lines of a lean strong face, short cropped black hair, deep tired kind eyes looking straight at the camera, the faint start of a smile. ${OLD}` },
  { id: 'mio', prompt: `Mio, a Japanese girl of about eleven in 1974: a neat bob haircut with a short fringe and a single small hairpin, a cream blouse with a round collar under a knitted cardigan, a gentle shy face, large dark eyes, very pale skin with a faint cool blue tint as if lit by moonlight, calm and a little sad, not frightening, no wounds, no blood, an innocent child. ${OLD}` },
  { id: 'kurogane', prompt: 'Kurogane, the overseer of a Japanese coal mine in 1974, a man of about fifty: a black hard pit helmet with a dented brass badge plate (no writing), a dark military-cut company overseer uniform with a high collar and a whistle on a chain, a heavy square face with a cruel thin mouth and a scar through one eyebrow, grey-tinged skin, coal dust in the creases, cold eyes glowing faintly thunder violet, a faint violet crackle of light at his brow; menacing, hard and dangerous, no gore.' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(2500 * (i + 1));
    }
  }
  throw last;
}

async function image(prompt, refs) {
  const body = { model: MODEL, prompt, n: 1, aspect_ratio: '1:1', quality: QUALITY, output_format: 'webp', output_compression: 85 };
  if (refs.length) body.input_references = refs.map((url) => ({ type: 'image_url', image_url: { url } }));
  const r = await fetch(`${API}/images`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no image in the reply: ${JSON.stringify(j).slice(0, 200)}`);
  return { buf: Buffer.from(b64, 'base64'), cost: j.usage?.cost ?? null };
}

const dataUrl = (f) => `data:image/webp;base64,${readFileSync(f).toString('base64')}`;

async function portrait(p, refs) {
  const out = join(OUT, `${p.id}.webp`);
  if (existsSync(out) && !process.env.FORCE) return { ...p, kept: true };
  const prompt = `${p.prompt} ${LOOK}${refs.length ? ' Match the painting style, rendering and finish of the reference portrait exactly; do not copy its person, clothes or colours.' : ''}`;
  const { buf, cost } = await retry(() => image(prompt, refs));
  const full = join(SRC, `${p.id}.webp`);
  writeFileSync(full, buf);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', full, '-vf', 'scale=256:256', '-quality', '82', out]);
  console.log(`${p.id}: saved${cost == null ? '' : `, $${Number(cost).toFixed(4)}`}`);
  return { ...p, prompt, cost };
}

const want = process.argv.slice(2);
const list = PEOPLE.filter((p) => want.length === 0 || want.includes(p.id));
const results = [];
const zaryaAnchor = join(ROOT, 'public/zarya/people/nina.webp');
if (list.some((p) => p.id === 'natsuki') || !existsSync(join(SRC, 'natsuki.webp'))) results.push(await portrait(PEOPLE[0], existsSync(zaryaAnchor) ? [dataUrl(zaryaAnchor)] : []));
const ref = dataUrl(join(SRC, 'natsuki.webp'));
const rest = list.filter((p) => p.id !== 'natsuki');
await Promise.all(
  rest.map(async (p) => {
    try {
      results.push(await portrait(p, [ref]));
    } catch (e) {
      console.log(`${p.id}: FAILED ${e.message}`);
    }
  }),
);
const manifest = join(NOTES, 'people.json');
const prev = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : [];
const rows = PEOPLE.map((p) => {
  const now = results.find((r) => r.id === p.id && !r.kept);
  const old = prev.find((q) => q.id === p.id);
  if (now) return { id: p.id, file: `public/hirasaka/people/${p.id}.webp`, cost: now.cost, calls: (old?.calls ?? 0) + 1, spent: (old?.spent ?? 0) + (Number(now.cost) || 0), model: MODEL, quality: QUALITY, prompt: now.prompt };
  return old ?? null;
}).filter(Boolean);
writeFileSync(manifest, JSON.stringify(rows, null, 2));
const spent = results.reduce((s, r) => s + (Number(r.cost) || 0), 0);
console.log(`done: ${results.filter((r) => !r.kept).length} painted, $${spent.toFixed(4)} reported by the API`);
