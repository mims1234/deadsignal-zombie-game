// The Sakura District end to end in headless Chrome: KAIKA (or the Operation with the Thousand Lanterns) played through
// its beats by the story's own actions, travel time between them simulated, every radio line, banner and voice logged
// with its time, and a screenshot at each beat. Shows where lines collide, wait or never come.
//
//   SC=<dir> MODE=kaika|op node scripts/qa-sakura.mjs [url]      (the dev server, default http://127.0.0.1:5183/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { openPage, reportLogs, sleep } from './lib/browser.mjs';

const SC = process.env.SC || '.';
const MODE = process.env.MODE || 'kaika';
const TRAVEL = +(process.env.TRAVEL || 25);
mkdirSync(SC, { recursive: true });
const url = process.argv[2] || 'http://127.0.0.1:5183/';
const { browser, page, logs } = await openPage({ url, w: 1280, h: 720 });
const ev = (fn, arg) => page.evaluate(fn, arg);
let n = 0;
const shot = async (name) => {
  await sleep(600);
  await page.screenshot({ path: `${SC}/${String(n++).padStart(2, '0')}-${name}.png` });
};
/** Teleport next to a spot, look at it, act; then let `travel` seconds of the run pass (lines play, the dead come). */
const beat = async (name, fn, travel = TRAVEL) => {
  const r = await ev(fn);
  await ev((s) => { const d = window.__dead; for (let t = 0; t < s; t += 1) { d.setHealth(100, 100); d.advance(1); } }, travel);
  console.log(`-- ${name}`, r ?? '', JSON.stringify(await ev(() => { const g = window.__dead.game; const s = g.sakura; return { ch: s.chapter, phase: s.view.phase, q: s.voice.pending, cue: s.voice.cueId, rate: +g.zombies.rateMul.toFixed(2), z: g.zombies.zombies.filter((z) => z.alive).length, t: Math.round(g.session.elapsed) }; })));
  await shot(name);
};
try {
  await ev(() => { localStorage.setItem('deadsignal.map.v1', 'sakura'); localStorage.setItem('deadsignal.settings.v1', JSON.stringify({ quality: 'medium', qualityAuto: false })); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
  await ev((m) => { const g = window.__dead.game; g.storyPick = m === 'kaika' ? 'kaika' : null; }, MODE);
  await ev(() => window.__dead.start());
  await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
  // everything said and shown, with the run's time
  await ev(() => {
    const g = window.__dead.game;
    window.__log = [];
    const orig = g.hud.event.bind(g.hud);
    g.hud.event = (e) => {
      if (e.type === 'radio' || e.type === 'banner') window.__log.push({ t: +g.session.elapsed.toFixed(1), type: e.type, who: e.speaker ?? e.title, text: e.text ?? e.subtitle ?? '' });
      return orig(e);
    };
  });
  const S = () => window.__dead.game.sakura;
  const at = (x, z, y = 0) => ({ x, z, y });
  void at;
  await beat('start', () => null, 30);
  const spots = await ev(() => { const s = window.__dead.game.sakura.spots; return JSON.parse(JSON.stringify(s)); });
  const tpAct = (x, y, z, a, i) => ev(([x, y, z, a, i]) => { const d = window.__dead; d.teleport(x, z, undefined, y); d.advance(0.2); window.__dead.game.sakura.act(a, i); return a + i; }, [x, y, z, a, i]);
  for (let i = 0; i < 3; i++) { const f = spots.fuses[i]; await tpAct(f.x, f.y - 1.4 > 0.5 ? f.y - 1.4 : 0, f.z, 'fuse', i); await beat(`fuse${i}`, () => null, i < 2 ? 8 : TRAVEL); }
  const charmY = (c) => (c.y > 2.5 ? c.y - 1.0 : 0);
  for (let i = 0; i < 5; i++) {
    if (i === 4) { await tpAct(spots.key.x, 0, spots.key.z + 0.6, 'key', 0); await beat('keycard', () => null); }
    const c = spots.charms[i];
    await tpAct(c.x, charmY(c), c.z + (i === 3 ? -2.5 : 0), 'charm', i);
    await beat(`charm${i}`, () => null);
  }
  await tpAct(spots.tree.x, 0, spots.tree.z + 2, 'tie', 0); await beat('tie', () => null, 12);
  await tpAct(spots.flame.x, 0, spots.flame.z + 0.6, 'flame', 0); await beat('flame', () => null, 20);
  await ev(() => { const s = window.__dead.game.sakura; const n = s.notes[0]; window.__dead.teleport(n.x, n.z); window.__dead.advance(0.2); s.read(n.n); }); await beat('scroll', () => null, 10);
  const order = await ev(() => window.__dead.game.sakura.view.order);
  for (const j of order) { const l = spots.lanterns[j]; await tpAct(l.x + 1, 0, l.z, 'light', j); await beat(`lantern${j}`, () => null, 6); }
  await ev(() => { const s = window.__dead.game.sakura; const b = s.spots.bell; window.__dead.teleport(b.x - 2, b.z); window.__dead.advance(0.2); s.ring(); }); await beat('bell', () => null, 20);
  await ev(() => { const s = window.__dead.game.sakura; s.ride(0); }); await beat('kisaragi', () => null, 12);
  await ev(() => { const s = window.__dead.game.sakura; const k = s.h.kisaragi; window.__dead.teleport(k.plinths[0].x, k.plinths[0].z + 1); s.takeRelic(0); s.takeRelic(1); }); await beat('relics', () => null, 6);
  await ev(() => { const s = window.__dead.game.sakura; s.ride(s.h.kisaragi.area); }); await beat('back', () => null, 10);
  await ev(() => { const g = window.__dead.game; const d = g.level.data.defense; window.__dead.teleport(d.x, d.z); g.mission.beginDefense(); }); await beat('relay-start', () => null, 10);
  await ev(() => { const g = window.__dead.game; g.session.defense.progress = 1; }); await beat('relay', () => null, 15);
  await ev(() => { const g = window.__dead.game; const b = g.zombies.boss; if (b) { window.__dead.teleport(20, -48); window.__dead.lookAt(b.x, b.z, 2); } return b ? [Math.round(b.x), Math.round(b.z)] : 'no empress'; }, null); await beat('empress-near', () => null, 4);
  await ev(() => { const g = window.__dead.game; const b = g.zombies.boss; if (b && b.alive) { b.hp = 0; g.session.hunt.status = 'complete'; } }); await beat('empress-down', () => null, 15);
  await ev(() => { const g = window.__dead.game; const e = g.level.data.extraction; window.__dead.teleport(e.lzX, e.lzZ); }); await beat('lz', () => null, 6);
  await ev(() => { const g = window.__dead.game; g.mission.callExtraction?.(); if (g.session.extraction.phase === 'available') { g.session.extraction.phase = 'called'; g.session.extraction.countdown = 60; g.session.extraction.calledAt = g.session.elapsed; } return g.session.extraction.phase; });
  await beat('called', () => null, 45);
  const log = await ev(() => window.__log);
  writeFileSync(`${SC}/log.json`, JSON.stringify(log, null, 1));
  for (const e of log) console.log(String(e.t).padStart(6), e.type === 'radio' ? 'R' : 'B', (e.who || '').padEnd(18).slice(0, 18), e.text.slice(0, 110));
} catch (e) { console.log('FAILED', e.message); } finally { reportLogs(logs, { warnings: false }); await browser.close(); }
