// ZARYA's concept boards (Phase 0 of the map plan), generated through OpenRouter (run with Node 22+, ffmpeg on PATH):
//
//   node scripts/zarya-art.mjs [ids...]     the style board first, then the ten zone boards
//
// Every zone board is sent the style board as a reference image, so the town reads as one place. Nothing here is a game
// asset yet: the boards land in research_notes/zarya/boards as 1536 px wide WebP, with boards.json listing each prompt
// and what the call cost. No lettering is ever asked for; words in the game are set in code.
//
// The key: OPENROUTER_API_KEY, or OPENROUTER_API_KEY_BOT from the file named by OPENROUTER_ENV (it is never printed).
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
const OUT = join(ROOT, 'research_notes/zarya/boards');
const TMP = join(tmpdir(), 'zarya-art');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const LOOK =
  'Painterly anime background art for a video game, clean shapes, soft cel shading. Palette: deep blue-black winter night, warm sodium-orange lamps and windows, small accents of signal red. Heavy quiet snowfall, fog closing in at about sixty metres. Cinematic 16:9, eye level, as a player on foot would see it. No text, no lettering, no writing on signs, no logos, no watermark, nobody in the near foreground.';
const SLEEP = 'The people in the scene stand perfectly still, asleep on their feet with eyes closed, snow gathered on their hats and shoulders, a faint puff of frost breath at each mouth.';

const BOARDS = [
  { id: 'style', title: 'Style board', prompt: `Key art for a snowbound science town in the Russian north on New Year's Eve, at night. A wide view across the town square toward a 1970s Soviet modernist department store whose facade carries a large tile mosaic of four figures in a row: a cosmonaut, the sun, a sheaf of wheat, a dove. A tall decorated fir tree with garlands, an ice town with a lit ice slide, wooden fair kiosks, a stopped tram at the edge of the square. Dozens of townspeople in winter coats and fur hats. ${SLEEP} ${LOOK}` },
  { id: 'uni', title: 'Univermag «Zarya»', prompt: `Interior, ground floor of a 1970s Soviet department store dressed for New Year: terrazzo floor, long glass counters, a still escalator, paper garlands and tinsel, a fir tree reaching the ceiling, crates of mandarins. About thirty shoppers and shop assistants in winter coats, caught mid-step. ${SLEEP} Warm yellow lamps, deep shadow between the aisles. Seen from just inside a stairwell door. ${LOOK}` },
  { id: 'sq', title: 'Zarya Square', prompt: `A town square in the Russian north on New Year's Eve, seen from its centre: an ice town of carved ice blocks and an ice slide lit pale blue from inside, rows of wooden fair kiosks with striped awnings, a stopped two-car tram with its lights on at the edge of the square, a tall decorated fir tree behind. A red gift sack lies under a small fir tree. Groups of townspeople. ${SLEEP} ${LOOK}` },
  { id: 'ry', title: 'Rynok', prompt: `Interior of a Soviet-era covered market hall at night: rows of tiled stalls for meat, jars of pickles, dried fish, fur hats on stands; a vaulted roof on steel trusses with frosted skylights; brass scales and wooden abacuses on the counters; a heavy cold-store door standing ajar with mist rolling out. A few stallholders behind their counters. ${SLEEP} ${LOOK}` },
  { id: 'dv', title: 'Dvor', prompt: `A courtyard between five-storey prefabricated concrete panel apartment blocks in the Russian north, New Year's Eve: a playground with a rusted swing and a metal rocket climbing frame, a carpet-beating rack, benches, a woodpile, boxy sedans buried in snow, an arched passage through one block. Many windows glow warm; through them families can be seen motionless at New Year tables. One window stands open with an old woman asleep at it. ${LOOK}` },
  { id: 'ga', title: 'Garages', prompt: `Rows of low steel garages with plain numbered-looking doors along a snowbound lane in a Russian town. One garage stands open and warmly lit: a workbench with a vice, tools on a pegboard, a half-dismantled motorcycle, shelves of jars full of bolts, a kettle. A chained and padlocked gate in the middle distance. Overhead heating pipes wrapped in foil insulation cross the lane. ${LOOK}` },
  { id: 'de', title: 'Tram depot', prompt: `A small-town tram depot in the Russian north: brick sheds with tall doors, tram tracks under snow, overhead wires, two old rounded tram cars parked inside under yellow lamps. Beside the depot a short street with a small hunting and fishing shop, its lit window showing fishing rods, snowshoes and a stuffed pheasant. ${LOOK}` },
  { id: 'dk', title: 'Dom Kultury', prompt: `A provincial Soviet Palace of Culture: a neoclassical portico of white columns, tall doors open onto a foyer with a chandelier. Through the doors, a theatre stage set for a children's New Year pageant: a wooden hut on chicken legs, paper snowflakes, a painted forest. Carol-singers in goat and bear masks stand motionless on the steps. ${LOOK}` },
  { id: 'ba', title: 'Banya and pond', prompt: `A red-brick public bathhouse in a Russian town with steam leaking from its vents, beside a frozen pond: ice-fishing tents and stools on the ice, a cross-shaped ice-hole with wooden steps down into black water, lanterns on poles. Warm light and steam pour from the bathhouse door. ${LOOK}` },
  { id: 'te', title: 'TETs heating plant', prompt: `A district heating plant in the Russian north: a tall red-and-white striped chimney rising into low cloud, with pale glittering snow drifting out of its top instead of smoke; a boiler hall with huge foil-wrapped pipes, catwalks, valve wheels, pressure gauges, jets of steam, sodium lamps. ${LOOK}` },
  { id: 'ni', title: 'The Institute', prompt: `A brutalist Soviet research institute: a concrete laboratory block with a ribbed facade and a glass entrance, reached past a checkpoint booth and a raised barrier. Beyond it, through an open blast door, an underground hall: rows of glass-fronted dens lit pale green in which brown bears lie asleep, and further back, rows of hospital beds with people asleep under blankets. ${LOOK}` },
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
  const body = { model: MODEL, prompt, n: 1, aspect_ratio: '16:9', quality: QUALITY, output_format: 'webp', output_compression: 85 };
  if (refs.length) body.input_references = refs.map((url) => ({ type: 'image_url', image_url: { url } }));
  const r = await fetch(`${API}/images`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no image in the reply: ${JSON.stringify(j).slice(0, 200)}`);
  return { buf: Buffer.from(b64, 'base64'), cost: j.usage?.cost ?? null };
}

async function board(b, refs) {
  const out = join(OUT, `${b.id}.webp`);
  if (existsSync(out) && !process.env.FORCE) return { ...b, file: `${b.id}.webp`, cost: null, kept: true };
  const { buf, cost } = await retry(() => image(b.prompt, refs));
  const raw = join(TMP, `${b.id}.bin`);
  writeFileSync(raw, buf);
  // whatever came back (WebP, PNG or JPEG), store it as a 1536 px wide WebP
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-vf', 'scale=1536:-2', '-quality', '84', out]);
  console.log(`${b.id}: saved${cost == null ? '' : `, $${Number(cost).toFixed(4)}`}`);
  return { ...b, file: `${b.id}.webp`, cost };
}

const want = process.argv.slice(2);
const list = BOARDS.filter((b) => want.length === 0 || want.includes(b.id));
const results = [];
const styleFile = join(OUT, 'style.webp');
if (list.some((b) => b.id === 'style') || !existsSync(styleFile)) results.push(await board(BOARDS[0], []));
const ref = `data:image/webp;base64,${readFileSync(styleFile).toString('base64')}`;
const rest = list.filter((b) => b.id !== 'style');
let i = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (i < rest.length) {
      const b = rest[i++];
      try {
        results.push(await board(b, [ref]));
      } catch (e) {
        console.log(`${b.id}: FAILED ${e.message}`);
      }
    }
  }),
);
const manifest = join(OUT, 'boards.json');
const prev = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : [];
const merged = BOARDS.map((b) => results.find((r) => r.id === b.id && !r.kept) ?? prev.find((p) => p.id === b.id) ?? results.find((r) => r.id === b.id)).filter(Boolean);
writeFileSync(manifest, JSON.stringify(merged.map(({ id, title, file, cost, prompt }) => ({ id, title, file, cost, model: MODEL, quality: QUALITY, prompt })), null, 2));
const spent = results.reduce((s, r) => s + (Number(r.cost) || 0), 0);
console.log(`done: ${results.filter((r) => !r.kept).length} generated, $${spent.toFixed(4)} reported by the API`);
