// HIRASAKA's item icons: one painted picture for every collectable, part, tool and built weapon in the build brief,
// generated through OpenRouter (Node 22+, ffmpeg on PATH):
//
//   OPENROUTER_ENV=path/to/.env node scripts/hirasaka-icons.mjs [ids...]   generate what is missing (FORCE=1 redoes)
//   node scripts/hirasaka-icons.mjs --compose                              only re-make the badges (costs nothing)
//
// How (as scripts/zarya-icons.mjs): the model paints the item alone on a transparent background. The anchor (the cap
// lamp) is painted first and sent as the style reference with every other prompt, so all of them read as one set. The
// painting is kept at full size in research_notes/hirasaka/refs/icons-src; the script crops it to what is painted and
// sets it on a dark round badge with a brass rim that it draws itself (identical for every icon), at 128 px, as WebP
// with alpha, in public/hirasaka/icons/<id>.webp. research_notes/hirasaka/refs/icons.json lists each prompt and cost.
//
// The ids are proposals for the game's item ids (the arms and story sessions may point at them or rename the files):
// finds and story items, the built weapons' parts (`happa_*`, `drill_*`, `mori_*`, `kushi_*`), the four tools and the
// built weapons themselves. Prompts never say "weapon kit" or "gunsmith" (OpenAI's filter refused those before).
//
// The key: OPENROUTER_API_KEY, or OPENROUTER_API_KEY_BOT from the file named by OPENROUTER_ENV (it is never printed).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = 'https://openrouter.ai/api/v1';
const MODEL = process.env.HIRASAKA_ART_MODEL || 'openai/gpt-image-2.6-flare';
const QUALITY = process.env.QUALITY || 'medium';
const SIZE = 128;
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const NOTES = join(ROOT, 'research_notes/hirasaka/refs');
const SRC = join(NOTES, 'icons-src');
const OUT = join(ROOT, 'public/hirasaka/icons');
const TMP = join(tmpdir(), 'hirasaka-icons');
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
  'A single painted video game item icon. The object alone, centred, seen from a three-quarter view a little from above, large in the frame with a small margin, a bold readable silhouette that still reads when shrunk to 48 pixels. Painterly anime game art: clean shapes, soft cel shading, a crisp dark outline round the whole object, warm lamp light from the upper left and a cool storm-teal rim light on the right edge. A real, worn object from a 1970s Japanese coal-mining island. Fully transparent background: no backdrop, no badge, no frame, no floor, no cast shadow, no other objects. No text, no letters, no numbers, no logos, no watermark.';

/** What each one is, in plain words. The cap lamp is the anchor: painted first, every other one copies its style. */
const ITEMS = [
  // finds and story items
  { id: 'lamp', kind: 'find', what: "a coal miner's electric cap lamp: a round brass-rimmed lamp head with a thick glass lens glowing warm yellow, a short black cable coiling down to a rectangular black battery box with a belt clip" },
  { id: 'cagekey', kind: 'story', what: 'a big old iron key for a mine cage control box: a long heavy shank, a square bit with two teeth, a ring bow, worn smooth, on a short loop of frayed red cord with a small wooden tag (blank)' },
  { id: 'boilerkey', kind: 'story', what: 'a heavy cast-iron T-handled square socket key for opening a boiler valve, black with rust, the handle worn bright where hands held it' },
  { id: 'coalsack', kind: 'part', what: 'a bulging hessian sack of coal, tied at the neck with rope, black lumps of coal showing at the top and coal dust on the cloth' },
  { id: 'burner', kind: 'part', what: 'a cast-iron boiler burner nozzle part: a short heavy iron cone with a flanged base of bolt holes, a brass jet at its tip and a little lever valve on the side' },
  { id: 'ladle', kind: 'find', what: 'a traditional Japanese wooden bath ladle (hishaku): a round cypress-wood cup bound with a thin metal band, on a long straight wooden handle' },
  { id: 'ladle_open', kind: 'find', what: 'a traditional Japanese wooden bath ladle (hishaku) with its bottom knocked out: a round cypress-wood ring bound with a thin metal band, open right through, splinters at the broken edge, on a long straight wooden handle' },
  { id: 'lamptag', kind: 'story', what: "a small round brass miner's lamp tag with a punched hole at the top, hanging from a tiny iron hook ring, stamped with a simple raised pattern of dots (no numbers), dull and worn" },
  { id: 'peach', kind: 'throw', what: 'a single ripe Japanese peach, round and soft pink-and-cream with a blush of red, a short stem with two green leaves, glowing very faintly with a warm holy light' },
  { id: 'grapes', kind: 'throw', what: 'a bunch of small dark purple wild mountain grapes on a twisting vine with curling tendrils and two vine leaves' },
  { id: 'comb', kind: 'story', what: 'an old Japanese wooden hair comb (kushi): a curved half-moon of dark boxwood with a row of fine teeth, one end tooth longer like a pillar, worn smooth and dark with age' },
  { id: 'hairpin', kind: 'story', what: "a little girl's 1970s hair clip: a small flat metal hairpin with a tiny red enamel flower on it, a little tarnished" },
  { id: 'riceball', kind: 'story', what: 'a triangular Japanese rice ball wrapped in a folded square of faded cloth tied with a knot, a corner of white rice and dark nori showing' },
  { id: 'tape', kind: 'story', what: 'a 1970s audio cassette tape in a clear plastic case, the cassette with a plain cream paper label (blank), brown tape visible in the window, a little scuffed' },
  { id: 'photo', kind: 'story', what: 'an old 1970s square colour photograph with a white border, curled at one corner and water-stained, showing a faded blurred family standing in front of a concrete apartment block' },
  { id: 'scissors', kind: 'side', what: "a pair of old barber's scissors, slightly open: long thin bright steel blades, a curved finger rest, a pivot screw, a little rust spotting" },
  { id: 'ticket', kind: 'side', what: 'a small old Japanese paper ferry ticket, pale green card with a simple printed border pattern and a punched hole, creased, the corner torn (no writing)' },
  { id: 'reel', kind: 'side', what: 'a metal 35 mm film reel with round cut-outs in its sides, loaded with brown film, a loose end of film curling off it' },
  { id: 'letter', kind: 'side', what: 'a folded letter in a pale blue airmail-style envelope, the flap open, a sheet of lined paper half out, a little crumpled (no visible writing)' },
  { id: 'okoze', kind: 'side', what: 'a dried okoze stonefish offering: an ugly lumpy mottled brown-red stonefish with spiny fins, dried stiff, tied at the tail with a twist of white paper' },
  { id: 'drum', kind: 'side', what: 'a small round Japanese hand drum (a festival taiko) with a red-lacquered wooden body, a cream skin held by studs, and a pair of short wooden drumsticks lying across it' },
  // the built weapons' parts
  { id: 'happa_charge', kind: 'part', what: "a small wooden crate with its lid off, packed with plain brown paper-wrapped rolls lying side by side, a hank of string on top" },
  { id: 'happa_det', kind: 'part', what: "an old wooden box with a T-shaped plunger handle on top, two brass terminal screws on its front and a small coil of copper wire beside it" },
  { id: 'happa_pipe', kind: 'part', what: 'a short thick length of heavy steel pipe with a welded flange at one end and a strap bracket, rusted' },
  { id: 'drill_body', kind: 'part', what: 'the body of a pneumatic rock drill used in coal mines: a heavy grey steel cylinder with two side handles and a trigger lever' },
  { id: 'drill_hose', kind: 'part', what: 'a coil of thick black rubber compressed-air hose with brass couplings at both ends' },
  { id: 'drill_steel', kind: 'part', what: 'a long hexagonal rock-drill steel rod with a four-pointed hardened bit on the end' },
  { id: 'mori_head', kind: 'part', what: 'a big forged-iron harpoon head with two barbs and a ring eye for a cable, black with a bright sharpened edge' },
  { id: 'mori_reel', kind: 'part', what: 'a small hand winch drum wound with steel cable, with a ratchet wheel and pawl and a crank handle' },
  { id: 'mori_spring', kind: 'part', what: 'a heavy steel coil spring and a trigger catch from a seawall winch, greasy and rusted' },
  { id: 'kushi_oil', kind: 'part', what: 'a small battered tin can of lamp oil with a narrow spout and a screw cap, a wire handle' },
  { id: 'kushi_rope', kind: 'part', what: 'a short coil of shimenawa sacred straw rope with white paper zigzag streamers (shide) hanging from it' },
  // the four tools
  { id: 'pick', kind: 'tool', what: "a Japanese coal miner's tsuruhashi pick: a long curved steel head pointed at both ends on a worn wooden handle" },
  { id: 'axe', kind: 'tool', what: 'a heavy timber axe for cutting mine pit props: a broad steel head with a bright edge, on a long straight ash handle bound with tape near the end' },
  { id: 'shovel', kind: 'tool', what: 'a coal shovel: a wide square steel blade, black with coal dust, on a wooden handle with a D-shaped grip' },
  { id: 'tachi', kind: 'tool', what: 'an old Shinto shrine tachi sword out of its scabbard: a long gently curved single-edged blade, a plain dark iron guard, a handle wrapped in faded white cord, a small paper shide streamer tied to the pommel' },
  // the built weapons
  { id: 'happa', kind: 'built', what: "a stout industrial pipe device from a coal mine, painted mine-yellow with black hazard stripes: a thick steel pipe with a padded rest at one end, a wooden handle underneath, a small wooden plunger box bolted on its side and coloured wires taped along it" },
  { id: 'sakuganki', kind: 'built', what: 'a pneumatic rock-drill lance: a long grey steel rock drill with a spiralled drill rod tipped with a hardened bit, two handles, a coiled black air hose running to a small brass air tank strapped under it' },
  { id: 'mori', kind: 'built', what: "a ship-red winch harpoon rig from a seawall: a big forged barbed harpoon resting on a short steel rail with a hand-cranked cable winch drum on the side and a coil of steel cable, salt-rusted" },
  { id: 'kushibi', kind: 'built', what: "a Japanese wooden hair comb mounted at the end of a short shrine-wood staff wrapped in sacred straw rope and white paper streamers, the comb's teeth burning with small pale gold holy flames" },
  { id: 'okamuzumi', kind: 'built', what: 'a shrine-wood staff wrapped in sacred straw rope, crowned with a wooden comb on which three glowing peaches sit among pink peach blossoms, radiating soft warm pink-gold light' },
];
const ANCHOR = 'lamp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (String(e.message).startsWith('400')) break; // a refusal does not change on a retry
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
  const s = Math.min(Math.max(w, h), Math.round(Math.max(x1 - x0, y1 - y0) * 1.04) + 2);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { x: Math.round(cx - s / 2), y: Math.round(cy - s / 2), s, w, h, opaque: raw[3] > 200 };
}

/** The painting set on the badge: a dark storm-teal disc shading darker to the edge, a brass rim, the item inside. */
function compose(id) {
  const src = join(SRC, `${id}.png`);
  const b = paintedBox(src);
  if (b.opaque) console.log(`${id}: WARNING the painting came back with a background (corner opaque)`);
  const pad = b.s;
  const inner = 100;
  const R = 'hypot(X-63.5,Y-63.5)';
  const disc = `r='if(lt(${R},58.6),24-14*${R}/58.6+6*lt(Y,40)*(1-${R}/58.6),if(lt(${R},61.4),178,96))':g='if(lt(${R},58.6),40-22*${R}/58.6+6*lt(Y,40)*(1-${R}/58.6),if(lt(${R},61.4),140,72))':b='if(lt(${R},58.6),44-24*${R}/58.6+7*lt(Y,40)*(1-${R}/58.6),if(lt(${R},61.4),80,40))':a='255*clip(63.2-${R},0,1)'`;
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
const manifest = join(NOTES, 'icons.json');
const prev = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : [];
const rows = ITEMS.map((it) => {
  const now = results.find((r) => r.id === it.id && !r.kept);
  const old = prev.find((p) => p.id === it.id);
  if (now) return { id: it.id, kind: it.kind, file: `public/hirasaka/icons/${it.id}.webp`, cost: now.cost, calls: (old?.calls ?? 0) + 1, spent: (old?.spent ?? 0) + (Number(now.cost) || 0), model: MODEL, quality: QUALITY, prompt: now.prompt };
  return old ?? null;
}).filter(Boolean);
writeFileSync(manifest, JSON.stringify(rows, null, 2));
const spent = results.reduce((s, r) => s + (Number(r.cost) || 0), 0);
const total = rows.reduce((s, r) => s + (Number(r.spent) || 0), 0);
console.log(`done: ${results.filter((r) => !r.kept).length} painted, $${spent.toFixed(4)} this run, $${total.toFixed(4)} over all runs (as the API reported)`);
