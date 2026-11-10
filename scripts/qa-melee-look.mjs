// What the player swings, as the player sees it: one contact sheet per weapon (rest, the light swings, the heavy
// one, the guard), with the rig held still at each moment. For judging the first-person view by eye.
//
//   node scripts/qa-melee-look.mjs [url] [w] [h]      default http://127.0.0.1:5183/ at 640x360 a tile
//   QA_TOUCH=1 ...                                     as a phone (the touch HUD drawn over it)
//   ONLY=maul,chain ...                                just those weapons
//
// Writes shots/zarya/look-<weapon>.png (SC picks another folder).
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 640);
const h = Number(process.argv[4] ?? 360);
const touch = !!process.env.QA_TOUCH;
const out = process.env.SC ?? 'shots/zarya';
mkdirSync(out, { recursive: true });
const all = ['knife', 'skillet', 'skiPole', 'maul', 'gloves', 'chain', 'bat', 'hockey', 'rogatina', 'fireAxe', 'serpMolot', 'shashka'];
const ids = process.env.ONLY ? process.env.ONLY.split(',') : all;

const { browser, context, page } = await openPage({ url: `${base}?nolock${touch ? '&touch=1' : ''}`, w, h });
const D = (fn, ...args) => page.evaluate(fn, ...args);
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await D(() => {
  const d = window.__dead;
  const g = d.game;
  // on this map nothing is in the player's hands until the story arms them: put the story past that
  const s = g.zarya.story;
  s.ch = 3;
  s.f = 1 | 2 | 4 | 32;
  d.clearZombies();
  for (const a of g.squad.allies ?? []) g.squad.hurt(a, 999, a.ref.x, a.ref.z, 0);
  d.teleport(-44, 0, -Math.PI / 2);
  // the rig is posed by hand from here on: whatever the swing state says, the sheet's own moment wins
  const rig = g.melee.rig;
  const real = rig.update.bind(rig);
  rig.update = (v, dt) => real(Object.assign({}, v, window.__force ?? {}), dt);
});
await D(() => window.__dead.advance(6)); // the opening banner gone
// HUD=1 keeps the HUD over the view (to see what it covers); without it the hands are judged bare
if (!process.env.HUD) await page.addStyleTag({ content: '.ds-hud, .ds-touch-layer, .ds-prompt { opacity: 0 !important; }' });

// [label, forced view]
const moments = [
  ['rest', { phase: 'idle', u: 0, heavy: false, combo: 0, guard: 0 }],
  ['light 1: wound up', { phase: 'windup', u: 0.3, heavy: false, combo: 0, guard: 0 }],
  ['light 1: mid', { phase: 'strike', u: 0.42, heavy: false, combo: 0, guard: 0 }],
  ['light 1: landed', { phase: 'strike', u: 0.55, heavy: false, combo: 0, guard: 0 }],
  ['light 2: wound up', { phase: 'windup', u: 0.3, heavy: false, combo: 1, guard: 0 }],
  ['light 2: landed', { phase: 'strike', u: 0.55, heavy: false, combo: 1, guard: 0 }],
  ['heavy: wound up', { phase: 'windup', u: 0.3, heavy: true, combo: 0, guard: 0 }],
  ['heavy: landed', { phase: 'strike', u: 0.55, heavy: true, combo: 0, guard: 0 }],
  ['guard', { phase: 'idle', u: 0, heavy: false, combo: 0, guard: 1 }],
];

const sheet = await context.newPage();
for (const id of ids) {
  await D((id) => {
    const m = window.__dead.game.melee;
    m.equip(id);
    m.setOut(true);
  }, id);
  await D(() => window.__dead.advance(0.6));
  const tiles = [];
  for (const [label, force] of moments) {
    await D((f) => { window.__force = f; }, { id, raise: 1, move: 0, sprint: 0, lookYaw: 0, lookPitch: 0, ...force });
    await D(() => window.__dead.advance(0.05));
    const png = await page.screenshot();
    tiles.push({ label, src: `data:image/png;base64,${png.toString('base64')}` });
  }
  await D(() => { window.__force = null; });
  await sheet.setViewportSize({ width: w * 3, height: (h + 22) * 3 });
  await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(3,${w}px);font:13px sans-serif;color:#eee">${tiles
    .map((t) => `<div><div style="height:22px;line-height:22px;padding-left:6px">${id} / ${t.label}</div><img src="${t.src}" width="${w}" height="${h}" style="display:block"></div>`)
    .join('')}</body>`);
  await sheet.screenshot({ path: `${out}/look-${touch ? 'phone-' : ''}${id}.png` });
  console.log('wrote', `${out}/look-${touch ? 'phone-' : ''}${id}.png`);
}
await browser.close();
