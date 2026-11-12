// ZARYA's item icons: one painted picture for every collectable (the twenty parts, the finds, the weapon mod part, the
// repairman's three tools, the six glass ornaments), generated through OpenRouter (Node 22+, ffmpeg on PATH):
//
//   node scripts/zarya-icons.mjs [ids...]       generate what is missing (FORCE=1 to redo the ids given, or all)
//   node scripts/zarya-icons.mjs --compose      only re-make the badges from the kept paintings (costs nothing)
//
// How: the model paints the item alone on a transparent background. The anchor (the samovar) is painted first, and is
// sent as the style reference with every other prompt, so all of them read as one set. The painting is kept at full
// size in research_notes/zarya/icons-src; the script crops it to what is painted and sets it on a dark round badge
// with a brass rim that it draws itself (identical for every icon), at 128 px, as WebP with alpha, in
// public/zarya/icons/<id>.webp. research_notes/zarya/icons.json lists each prompt and what its call cost.
//
// The ids are the game's own: a part's `TOWN.parts` id, a find's id, `modpart`, the tools `iron` `screwdrivers`
// `multimeter`, the ornaments `orn0`..`orn5` (in the order of `ORNAMENTS`). `src/zarya/items.ts` points at these files.
//
// The key: OPENROUTER_API_KEY, or OPENROUTER_API_KEY_BOT from the file named by OPENROUTER_ENV (it is never printed).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = 'https://openrouter.ai/api/v1';
const MODEL = process.env.ZARYA_ART_MODEL || 'openai/gpt-image-2.6-flare';
const QUALITY = process.env.QUALITY || 'medium';
const SIZE = 128;
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'research_notes/zarya/icons-src');
const OUT = join(ROOT, 'public/zarya/icons');
const TMP = join(tmpdir(), 'zarya-icons');
for (const d of [SRC, OUT, TMP]) mkdirSync(d, { recursive: true });

function key() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = process.env.OPENROUTER_ENV;
  if (file && existsSync(file)) {
    const m = readFileSync(file, 'utf8').match(/^OPENROUTER_API_KEY(?:_BOT)?\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  }
  throw new Error('No OpenRouter key: set OPENROUTER_API_KEY or OPENROUTER_ENV');
}

const LOOK =
  'A single painted video game item icon. The object alone, centred, seen from a three-quarter view a little from above, large in the frame with a small margin, a bold readable silhouette that still reads when shrunk to 48 pixels. Painterly anime game art: clean shapes, soft cel shading, a crisp dark outline round the whole object, warm lamp light from the upper left and a cool pale-blue rim light on the right edge. A real, worn object from a 1970s-80s Soviet town on a snowy winter night. Fully transparent background: no backdrop, no badge, no frame, no floor, no cast shadow, no other objects. No text, no letters, no numbers, no logos, no watermark.';

/** What each one is, in plain words. The samovar is the anchor: it is painted first and every other one copies its style. */
const ITEMS = [
  { id: 'samovar', kind: 'part', what: 'a polished brass Russian samovar with a small teapot on its crown, black wooden handles and a little tap' },
  { id: 'tube', kind: 'part', what: "a flare pistol's barrel: one short fat steel tube painted signal orange, with a hinge lug and a small trigger block at one end" },
  { id: 'cartridges', kind: 'part', what: 'an open cardboard box of six fat flare cartridges standing upright, brass bases, the caps red, green and white' },
  { id: 'handle', kind: 'part', what: "a tram driver's removable controller handle: a short chrome lever bent at the end, a black bakelite ball knob on top, a square socket at the bottom" },
  { id: 'fuse', kind: 'part', what: 'a big electrical cartridge fuse for a tram line: a white porcelain cylinder with heavy brass caps and blade contacts at both ends' },
  { id: 'shears', kind: 'part', what: 'a pair of garden shears, open: short curved steel blades, a bolt at the pivot, red painted handles' },
  { id: 'pipes', kind: 'part', what: 'two lengths of grey steel water pipe lying crossed, threaded ends, a little rust' },
  { id: 'tape', kind: 'part', what: 'one roll of black cloth friction tape, its loose end curling off the roll' },
  { id: 'nailer', kind: 'part', what: "a builder's pneumatic nailer: a chunky pistol-shaped tool, yellow and dark grey body, a long nose and a straight magazine under it" },
  { id: 'canister', kind: 'part', what: "a small blue welder's gas cylinder, rounded top, a brass valve and a little pressure gauge" },
  { id: 'strips', kind: 'part', what: 'a bundle of collated nail strips: rows of shiny nails glued side by side in flat strips, tied with paper tape' },
  { id: 'tubes', kind: 'part', what: 'a bundle of six firework launch tubes: thick cardboard tubes wrapped in red and gold paper, tied together with string' },
  { id: 'crate', kind: 'part', what: 'a small open wooden crate of New Year fireworks: red rockets with gold cone tips poking out, straw packing' },
  { id: 'cord', kind: 'part', what: 'a neat coil of green fuse cord, one end hanging loose with a frayed black tip' },
  { id: 'blade', kind: 'part', what: 'a large hunting blade with no handle: a broad leaf-shaped steel blade with a long tang wrapped in old leather' },
  { id: 'shaft', kind: 'part', what: 'a long wooden shovel shaft, pale worn ash wood, a black D-shaped grip at one end, lying diagonally' },
  { id: 'guard', kind: 'part', what: 'a forged iron crossguard for a boar spear: a short heavy black-iron crossbar with a ring in its middle and rounded ends' },
  { id: 'coil', kind: 'part', what: "an electric stove's heating element: a flat spiral coil of dark metal glowing dull orange, two terminals sticking out" },
  { id: 'valve', kind: 'part', what: 'a brass pressure valve with a red cast-iron hand wheel on top and a round white pressure gauge on its side' },
  { id: 'vesna', kind: 'part', what: 'a laboratory reagent flask: a round-bottomed glass flask of glowing spring-green liquid, a rubber stopper, frost creeping up the glass' },
  { id: 'skillet', kind: 'find', what: 'a heavy black cast-iron skillet with a short handle' },
  { id: 'skiPole', kind: 'find', what: 'one ski pole lying diagonally: aluminium shaft, a red plastic grip with a leather wrist strap, a round basket near the steel tip' },
  { id: 'chain', kind: 'find', what: 'a heavy steel dog chain in loose loops, a worn leather collar at one end' },
  { id: 'maul', kind: 'find', what: 'a splitting maul: a heavy wedge-shaped steel head painted red on a long wooden handle, lying diagonally' },
  { id: 'modpart', kind: 'mod', what: 'one chunky machined upgrade part: a knurled brass cylinder with a bright steel spring coiled round its middle and a small brass gear at one end' },
  { id: 'iron', kind: 'tool', what: 'an old soldering iron: a copper tip, a steel shaft, a wooden handle, a cloth-covered cord coiled behind it' },
  { id: 'screwdrivers', kind: 'tool', what: 'three screwdrivers of different sizes fanned out, amber plastic handles, steel shafts' },
  { id: 'multimeter', kind: 'tool', what: 'an old Soviet analogue multimeter: a black bakelite box with a round needle dial, a selector knob, and two test leads, one red and one black' },
  { id: 'orn0', kind: 'ornament', what: 'a glass New Year tree ornament: a shiny red glass ball with a silver cap and wire loop, a small white painted snowflake on it' },
  { id: 'orn1', kind: 'ornament', what: 'a glass New Year tree ornament: a long blue glass icicle, twisted, with a silver cap and wire loop' },
  { id: 'orn2', kind: 'ornament', what: 'a glass New Year tree ornament: a gold glass bell with a silver cap and wire loop' },
  { id: 'orn3', kind: 'ornament', what: 'a glass New Year tree ornament: a green glass fir cone with a silver cap and wire loop' },
  { id: 'orn4', kind: 'ornament', what: 'a glass New Year tree ornament: a violet glass ball with a tall pointed spire on top, silver cap and loop' },
  { id: 'orn5', kind: 'ornament', what: 'a glass New Year tree ornament: a small silver-white glass space rocket with red fins, a wire loop at its nose' },
];
const ANCHOR = 'samovar';

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

async function paint(prompt, refs) {
  const H = { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' };
  const body = { model: MODEL, prompt, n: 1, aspect_ratio: '1:1', quality: QUALITY, background: 'transparent', output_format: 'png' };
  if (refs.length) body.input_references = refs.map((url) => ({ type: 'image_url', image_url: { url } }));
  const r = await fetch(`${API}/images`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no image in the reply: ${JSON.stringify(j).slice(0, 200)}`);
  return { buf: Buffer.from(b64, 'base64'), cost: j.usage?.cost ?? null };
}

function promptOf(item) {
  const ref = item.id === ANCHOR ? '' : ' Paint it in exactly the same style, outline, lighting and finish as the reference icon, as a matching icon of the same set.';
  return `${item.what[0].toUpperCase()}${item.what.slice(1)}.${ref} ${LOOK}`;
}

/** The painted box of a picture: the smallest square round everything not transparent (with a little margin). */
function paintedBox(file) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim();
  const [w, h] = probe.split(',').map(Number);
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 * 1024 * 1024 });
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (raw[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { x: 0, y: 0, s: Math.min(w, h), w, h, empty: true };
  // a square round the painted part, centred on it, kept inside the picture as far as it goes
  const s = Math.min(Math.max(w, h), Math.round(Math.max(x1 - x0, y1 - y0) * 1.04) + 2);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { x: Math.round(cx - s / 2), y: Math.round(cy - s / 2), s, w, h, opaque: raw[3] > 200 };
}

/** The painting set on the badge: a dark disc shading darker to the edge, a brass rim, the item inside it. */
function compose(id) {
  const src = join(SRC, `${id}.png`);
  const b = paintedBox(src);
  if (b.opaque) console.log(`${id}: WARNING the painting came back with a background (corner opaque)`);
  // pad the picture so the square crop never leaves it, then crop and fit the item inside the rim
  const pad = b.s;
  const inner = 100;
  const R = 'hypot(X-63.5,Y-63.5)';
  const disc = `r='if(lt(${R},58.6),30-17*${R}/58.6+6*lt(Y,40)*(1-${R}/58.6),if(lt(${R},61.4),178,96))':g='if(lt(${R},58.6),38-21*${R}/58.6+6*lt(Y,40)*(1-${R}/58.6),if(lt(${R},61.4),140,72))':b='if(lt(${R},58.6),50-28*${R}/58.6+7*lt(Y,40)*(1-${R}/58.6),if(lt(${R},61.4),80,40))':a='255*clip(63.2-${R},0,1)'`;
  const mask = `r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip(61.6-${R},0,1)'`;
  const filter =
    `[0]format=rgba,pad=iw+${pad * 2}:ih+${pad * 2}:${pad}:${pad}:color=black@0,crop=${b.s}:${b.s}:${b.x + pad}:${b.y + pad},scale=${inner}:${inner}:flags=lanczos[it];` +
    `color=c=black@0:s=${SIZE}x${SIZE},format=rgba,geq=${disc}[bg];` +
    `[bg][it]overlay=(W-w)/2:(H-h)/2:format=auto,format=rgba,geq=${mask}`;
  const out = join(OUT, `${id}.webp`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-filter_complex', filter, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', '-pix_fmt', 'yuva420p', out]);
  return out;
}

async function make(item, refs) {
  const src = join(SRC, `${item.id}.png`);
  if (existsSync(src) && !process.env.FORCE) return { ...item, kept: true, cost: null };
  const prompt = promptOf(item);
  const { buf, cost } = await retry(() => paint(prompt, refs));
  const raw = join(TMP, `${item.id}.bin`);
  writeFileSync(raw, buf);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-frames:v', '1', src]);
  compose(item.id);
  console.log(`${item.id}: painted${cost == null ? '' : `, $${Number(cost).toFixed(4)}`}`);
  return { ...item, prompt, cost };
}

const args = process.argv.slice(2);
if (args.includes('--compose')) {
  for (const it of ITEMS) if (existsSync(join(SRC, `${it.id}.png`))) compose(it.id);
  console.log('badges re-made from the kept paintings');
  process.exit(0);
}
const want = args.filter((a) => !a.startsWith('--'));
const list = ITEMS.filter((it) => want.length === 0 || want.includes(it.id));
const results = [];
const anchor = ITEMS.find((it) => it.id === ANCHOR);
if (list.includes(anchor) || !existsSync(join(SRC, `${ANCHOR}.png`))) results.push(await make(anchor, []));
const refUrl = `data:image/png;base64,${readFileSync(join(SRC, `${ANCHOR}.png`)).toString('base64')}`;
const rest = list.filter((it) => it.id !== ANCHOR);
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < rest.length) {
      const it = rest[next++];
      try {
        results.push(await make(it, [refUrl]));
      } catch (e) {
        console.log(`${it.id}: FAILED ${e.message}`);
      }
    }
  }),
);
const manifest = join(ROOT, 'research_notes/zarya/icons.json');
const prev = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : [];
const rows = ITEMS.map((it) => {
  const now = results.find((r) => r.id === it.id && !r.kept);
  const old = prev.find((p) => p.id === it.id);
  if (now) return { id: it.id, kind: it.kind, file: `public/zarya/icons/${it.id}.webp`, cost: now.cost, calls: (old?.calls ?? 0) + 1, spent: (old?.spent ?? 0) + (Number(now.cost) || 0), model: MODEL, quality: QUALITY, prompt: now.prompt };
  return old ?? null;
}).filter(Boolean);
writeFileSync(manifest, JSON.stringify(rows, null, 2));
const spent = results.reduce((s, r) => s + (Number(r.cost) || 0), 0);
const total = rows.reduce((s, r) => s + (Number(r.spent) || 0), 0);
console.log(`done: ${results.filter((r) => !r.kept).length} painted, $${spent.toFixed(4)} this run, $${total.toFixed(4)} over all runs (as the API reported)`);
