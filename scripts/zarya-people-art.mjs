// ZARYA's people: one painted head-and-shoulders portrait per character, for the captions, the first-meeting cards and
// the journal's PEOPLE page (`src/zarya/people.ts`). Generated through OpenRouter (Node 22+, ffmpeg on PATH):
//
//   OPENROUTER_ENV=path/to/.env node scripts/zarya-people-art.mjs [ids...]
//
// Nina is painted first and every other portrait is sent her portrait (and the town's style board) as references, so
// the cast reads as one set. Each lands in public/zarya/people/<id>.webp at 256 x 256; people.json beside the script's
// output lists the prompts and what each call cost. Existing files are kept unless FORCE=1. No lettering is ever asked
// for. The key: OPENROUTER_API_KEY, or OPENROUTER_API_KEY_BOT from the file named by OPENROUTER_ENV (never printed).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = 'https://openrouter.ai/api/v1';
const MODEL = process.env.ZARYA_ART_MODEL || 'openai/gpt-image-2.6-flare';
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
const OUT = join(ROOT, 'public/zarya/people');
const NOTES = join(ROOT, 'research_notes/zarya');
const TMP = join(tmpdir(), 'zarya-people');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const LOOK =
  'Painterly anime character portrait for a video game, head and shoulders, face centred and filling most of the frame, three-quarter view, soft cel shading, clean shapes. Lit by a warm sodium-orange street lamp from one side and cold blue winter night on the other; a few soft snowflakes; plain dark blue-black background with no scenery. Square. Warm, humane, someone you would want to protect. No text, no lettering, no logos, no frame, no border, no watermark, one person only.';

const PEOPLE = [
  { id: 'nina', prompt: 'Nina Pavlovna, about seventy, the night watchwoman of a Soviet department store for thirty years: stern, dry, secretly kind; grey hair pinned up under a knitted grey shawl, a blue-grey watchwoman uniform coat with brass buttons, reading glasses on a cord, deep lines round a mouth that does not smile easily, sharp tired grey eyes.' },
  { id: 'mira', prompt: 'Mira, about twenty-five, a volunteer search-and-rescue squad member in a snowbound Russian town: dark brown hair tucked into a knitted hat, a dark search-squad parka with a reflective orange stripe and a radio on the chest strap, steady dark eyes, a quiet determined face carrying an old grief.' },
  { id: 'timur', prompt: 'Timur, about thirty, the town handyman and electrician, volunteer search squad: short black hair, stubble, warm olive skin, a dark padded work coat with an orange collar and a tool roll strap, a dry half smile, clever dark eyes, a pencil behind one ear.' },
  { id: 'vera', prompt: 'Vera, about twenty-six, a nurse and volunteer search squad member: auburn hair in a ponytail, fair skin flushed with cold, a long dark-red winter coat with a small round green-and-white search-squad patch (no cross), a red knitted scarf, gentle green eyes, worried but hopeful.' },
  { id: 'kostya', prompt: 'Kostya, a seven-year-old boy: a bright red knitted hat with a pom-pom, round rosy cheeks, a too-big winter coat zipped to the chin, serious solemn eyes of a child who believes he is guarding something important, a little defiant.' },
  { id: 'zina', prompt: 'Tyotya Zina, about sixty, a tram driver for thirty-one years: short hennaed hair under a navy uniform cap, a navy tram-driver jacket with a badge, strong hands, a tea glass in a metal holder, a formidable no-nonsense face with laughing eyes.' },
  { id: 'zimin', prompt: 'Arkady Zimin, about seventy, director of a Soviet scientific institute dressed as Ded Moroz, the Russian Grandfather Frost: a long ice-blue fur-trimmed coat and tall hat embroidered with silver snowflakes, a full white beard, pale blue eyes that are kind, grave and very tired, the face of a man who has made a terrible decision for good reasons.' },
  { id: 'danya', prompt: 'Danya, about twenty, a young man asleep: eyes closed, face peaceful and pale with frost on his eyelashes, light brown hair, a grey institute coat, a long dark-orange knitted scarf wound round his neck.' },
  { id: 'babushka', prompt: 'A Russian grandmother of about eighty, asleep in a chair by an open window: eyes closed, a faint smile, a fringed wool shawl round her shoulders, white hair in a bun, frost on her shawl.' },
  { id: 'gena', prompt: 'Gena, about fifty, a butcher from the market meat rows: a heavy man with a big moustache, a flat cap, a white apron over a sheepskin vest, a cigarette tucked behind one ear, a jolly rough face.' },
  { id: 'lida', prompt: 'Lida, about forty, a pharmacist: a blue knitted scarf, a neat fur hat, a white pharmacy coat showing under her winter coat, kind tired eyes, asleep standing with eyes gently closed and frost on her scarf.' },
  { id: 'sorokins', prompt: 'The Sorokin family huddled close together in one portrait, a mother, a father with a fur hat and three small children in bright knitted hats, all asleep standing with eyes closed and snow on their shoulders. Five people in one tight group portrait.' },
  { id: 'oleg', prompt: 'Oleg Petrovich, about fifty-five, a school PE teacher: broad shoulders, a whistle on a cord, a tracksuit top under a brown bear costume with the bear head pushed back like a hood, a moustache, a proud cheerful face.' },
  { id: 'borya', prompt: 'Borya, about forty-five, a market butcher the size of a wardrobe: shaved head, a huge neck, a blood-spotted white apron, a padded jacket, gentle small eyes in a big round face.' },
  { id: 'lyudmila', prompt: 'Lyudmila Markovna, about seventy, an amateur theatre actress who has played Baba Yaga in the children\'s New Year pageant for forty years: wild grey hair under a patched headscarf, a theatrical putty nose pushed up on her forehead, a shawl of rags, bright mischievous eyes, stage make-up.' },
  { id: 'vitya', prompt: 'Vitya, about forty, a bookkeeper from the accounts department and the self-appointed toastmaster of the staff party: a slightly crooked tie, a cheap suit, a paper party crown, a microphone in hand, a camera on a strap round his neck, flushed beaming face.' },
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

async function portrait(p, refs) {
  const out = join(OUT, `${p.id}.webp`);
  if (existsSync(out) && !process.env.FORCE) return { ...p, kept: true };
  const prompt = `${p.prompt} ${LOOK}${refs.length ? ' Match the painting style, palette and lighting of the reference portrait exactly; do not copy its person.' : ''}`;
  const { buf, cost } = await retry(() => image(prompt, refs));
  const raw = join(TMP, `${p.id}.bin`);
  writeFileSync(raw, buf);
  writeFileSync(join(TMP, `${p.id}.full.webp`), buf);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-vf', 'scale=256:256', '-quality', '82', out]);
  console.log(`${p.id}: saved${cost == null ? '' : `, $${Number(cost).toFixed(4)}`}`);
  return { ...p, cost };
}

const want = process.argv.slice(2);
const list = PEOPLE.filter((p) => want.length === 0 || want.includes(p.id));
const results = [];
const anchor = join(OUT, 'nina.webp');
if (list.some((p) => p.id === 'nina') || !existsSync(anchor)) results.push(await portrait(PEOPLE[0], []));
const ref = `data:image/webp;base64,${readFileSync(join(TMP, 'nina.full.webp')).toString('base64')}`;
const rest = list.filter((p) => p.id !== 'nina');
let i = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (i < rest.length) {
      const p = rest[i++];
      try {
        results.push(await portrait(p, [ref]));
      } catch (e) {
        console.log(`${p.id}: FAILED ${e.message}`);
      }
    }
  }),
);
const manifest = join(NOTES, 'people-portraits.json');
const prev = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : [];
const merged = PEOPLE.map((p) => results.find((r) => r.id === p.id && !r.kept) ?? prev.find((q) => q.id === p.id)).filter(Boolean);
writeFileSync(manifest, JSON.stringify(merged.map(({ id, cost, prompt }) => ({ id, file: `public/zarya/people/${id}.webp`, cost, model: MODEL, quality: QUALITY, prompt })), null, 2));
const spent = results.reduce((s, r) => s + (Number(r.cost) || 0), 0);
console.log(`done: ${results.filter((r) => !r.kept).length} painted, $${spent.toFixed(4)} reported by the API`);
