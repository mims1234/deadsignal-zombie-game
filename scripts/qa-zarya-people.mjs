// ZARYA: who is speaking. Says a line from each of several speakers through the story's own queue and photographs the
// caption each time; then the journal's PEOPLE page and a named sleeper's plate (`src/zarya/people.ts`).
//
//   node scripts/qa-zarya-people.mjs [url] [w] [h]      default http://127.0.0.1:5183/ at 1280x720
//   QA_TOUCH=1 node scripts/qa-zarya-people.mjs http://127.0.0.1:5183/ 844 390     as a phone
//   TAG=before ...                                      a prefix for the screenshots (default the layout's name)
//
// Writes shots/zarya/people-<tag>-*.png (SC picks another folder) and prints ok/FAIL lines.
import { mkdirSync } from 'node:fs';
import { openPage, reportLogs } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const out = process.env.SC ?? 'shots/zarya';
const tag = process.env.TAG ?? (touch ? 'phone' : 'pc');
mkdirSync(out, { recursive: true });

const { browser, page, logs } = await openPage({ w, h });
// other sessions save files in this checkout: the hot-reload socket is answered and never heard from
await page.routeWebSocket((u) => u.pathname === '/' && u.host === new URL(base).host, () => {});
await page.goto(`${base}?nolock${touch ? '&touch=1' : ''}`, { waitUntil: 'load' });
const D = (fn, ...args) => page.evaluate(fn, ...args);
const shot = (name) => page.screenshot({ path: `${out}/people-${tag}-${name}.png` });
const fail = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) fail.push(name);
};

await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
// the store's ground floor after the plug: nothing hunts, nothing else is said
await D(() => {
  const d = window.__dead;
  const g = d.game;
  const s = g.zarya.story;
  s.ch = 3;
  s.f = 1 | 2 | 4 | 32;
  g.zombies.spawnAllowed = () => false;
  d.clearZombies();
  d.teleport(88, 4, Math.PI * 0.75);
});
// (the banners the jump in the story brings are let through first: on a phone they share the line with the captions)
await D(() => window.__dead.advance(16));
await D(() => {
  const z = window.__dead.game.zarya;
  z.queue.length = 0;
  z.lineT = 99;
  // what was said on the way here is cleared off the screen
  window.__dead.game.hud.topLine?.reset();
  window.__dead.game.hud.radio?.reset();
});

// one line each, said through the story's queue as the game says them
const LINES = [
  ['NINA', 'That is Gena, from the meat rows. Thirty years I told him to stop smoking.'],
  ['TIMUR', "Tyotya Zina. Thirty-one years on Line One."],
  ['KOSTYA', "That's Ded Moroz's sack. You can't just take from it."],
  ['ZINA', 'Next stop. Rynok.'],
  ['ZIMIN', 'Are you warm, child?'],
  ['VERA', "They're breathing. Look. All of them."],
  ['MIRA', "That one isn't."],
];
const seenAll = [];
for (const [who, text] of LINES) {
  await D(([who, text]) => {
    const z = window.__dead.game.zarya;
    z.queue.push([who, text]);
    z.lineT = 0;
  }, [who, text]);
  await D(() => window.__dead.advance(0.7));
  const seen = await D(() => {
    const vis = (sel) => {
      const e = document.querySelector(sel);
      return e && !e.hidden && getComputedStyle(e).display !== 'none' ? e : null;
    };
    const cap = vis('.ds-topline') ?? vis('.ds-radio');
    const card = vis('.zy-meet');
    const face = cap?.querySelector('.face');
    return {
      tag: cap?.querySelector('.tag')?.textContent ?? '',
      text: cap?.querySelector('.text')?.textContent ?? '',
      face: !!face && getComputedStyle(face).display !== 'none' && face.complete && face.naturalWidth > 0,
      color: cap ? getComputedStyle(cap.querySelector('.tag')).color : '',
      card: card ? card.querySelector('.nm')?.textContent ?? '' : '',
    };
  });
  seenAll.push({ who, ...seen });
  console.log(`     ${who}: tag "${seen.tag}" ${seen.color} | text "${seen.text}"${seen.face ? ' | portrait' : ''}${seen.card ? ` | card "${seen.card}"` : ''}`);
  await shot(who.toLowerCase());
  // the rest of the line's time, then a breath
  await D((t) => window.__dead.advance(t), Math.min(7.5, Math.max(2.4, 1.3 + text.split(/\s+/).length * 0.3)) + 0.4);
}
check('every caption shows a portrait', seenAll.every((s) => s.face), seenAll.filter((s) => !s.face).map((s) => s.who).join(','));
check('every caption names its speaker', seenAll.every((s) => s.tag.includes(s.who)), seenAll.map((s) => s.tag).join(','));
check('a first-meeting card shows whoever has just spoken for the first time', seenAll.filter((s) => s.card && s.card.includes(s.tag)).length >= 6, seenAll.map((s) => s.card || '-').join(','));
check('colours differ between speakers', new Set(seenAll.map((s) => s.color)).size >= 6);

// a named sleeper: Nina names Lida on the wire; standing by her, her name shows
await D(() => {
  const z = window.__dead.game.zarya;
  z.queue.push(['NINA', 'The one by the kiosk in the blue scarf is Lida, from the pharmacy. Breathing. Leave her be.']);
  z.lineT = 0;
});
await D(() => window.__dead.advance(1));
const lida = await D(() => {
  const z = window.__dead.game.zarya;
  const pl = z.people.plates.find((q) => q.id === 'lida');
  window.__dead.teleport(pl.x + 2.6, pl.z + 1.2, Math.atan2(-(pl.x - (pl.x + 2.6)), -(pl.z - (pl.z + 1.2))));
  return { x: pl.x, z: pl.z };
});
await D(() => window.__dead.advance(1));
await D(([x, z]) => {
  const g = window.__dead.game;
  const p = g.player;
  p.yaw = Math.atan2(-(x - p.x), -(z - p.z));
  p.pitch = 0.05;
}, [lida.x, lida.z]);
await D(() => window.__dead.advance(0.5));
const lidaOn = await D(() => window.__dead.game.zarya.people.plates.filter((q) => q.sprite.visible).map((q) => q.id));
await shot('lida-plate');
check("Lida's name shows when standing by her", lidaOn.includes('lida'), lidaOn.join(','));

// the journal's PEOPLE page
await D(() => window.__dead.game.pause('menu'));
await page.waitForTimeout(400);
const people = await D(() => {
  const tab = [...document.querySelectorAll('button, [role=tab]')].find((b) => /JOURNAL/i.test(b.textContent ?? ''));
  tab?.click();
  return null;
});
await page.waitForTimeout(400);
const names = await D(() => [...document.querySelectorAll('.zy-people .zy-person .nm')].map((e) => e.textContent));
await D(() => document.querySelector('.zy-people')?.scrollIntoView());
await shot('journal');
check('the journal has a PEOPLE page with everyone heard', names.length >= 8, names.join(', '));
await D(() => window.__dead.press('Escape'));

// (a 502 is the dev server's proxy to a co-op server that is not running: not this page's doing)
const errors = reportLogs(logs.filter((l) => !/status of 502/.test(l.text)), { warnings: false });
check('no page errors', errors === 0);
await browser.close();
console.log(fail.length ? `${fail.length} FAILED` : 'all ok');
process.exit(fail.length ? 1 : 0);
