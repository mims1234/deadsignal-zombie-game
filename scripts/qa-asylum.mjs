// Blackwood Hill end to end in headless Chrome: the Asylum's story played through its steps by the story's own actions
// (walking into each file, the generators' hold, Ward Nine upstairs, the morgue, the Matron, the furnace damper, the
// dawn), travel time between them simulated, every line, banner and the black fog logged with its time, and a
// screenshot at each step. Shows where lines collide, wait or never come.
//
//   SC=<dir> node scripts/qa-asylum.mjs [url]      (the dev server, default http://127.0.0.1:5183/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { openPage, reportLogs, sleep } from './lib/browser.mjs';

const SC = process.env.SC || '.';
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
const state = () =>
  ev(() => {
    const g = window.__dead.game;
    const ni = g.mission.night;
    const o = g.mission.objectives().find((x) => x.tracked);
    return { step: ni.step(), obj: o ? `${o.title} | ${o.detail}` : '', tod: ni.tod.phase, fog: +ni.fog.radius.toFixed(1), next: Math.round(ni.fog.next), q: ni.voice.pending, cash: g.session.inv.cash, z: g.zombies.zombies.filter((z) => z.alive).length, hunt: g.session.hunt.status, ex: g.session.extraction.phase, t: Math.round(g.session.elapsed), hp: Math.round(g.session.vitals.health) };
  });
/** Let `travel` seconds of the run pass (lines play, the dead come), kept alive. */
const pass = (travel) => ev((s) => { const d = window.__dead; for (let t = 0; t < s; t += 0.5) { d.setHealth(100, 100); d.advance(0.5); } }, travel);
const beat = async (name, travel = TRAVEL) => {
  await pass(travel);
  console.log(`-- ${name}`, JSON.stringify(await state()));
  await shot(name);
};
const tp = (x, z, y = 0, yaw) => ev(([x, z, y, yaw]) => { const d = window.__dead; d.teleport(x, z, yaw, y); d.advance(0.3); }, [x, z, y, yaw]);
try {
  await ev(() => { localStorage.setItem('deadsignal.map.v1', 'asylum'); localStorage.setItem('deadsignal.settings.v1', JSON.stringify({ quality: 'medium', qualityAuto: false })); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
  await ev(() => window.__dead.start());
  await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
  await ev(() => {
    const g = window.__dead.game;
    window.__log = [];
    const orig = g.hud.event.bind(g.hud);
    g.hud.event = (e) => {
      if (e.type === 'radio' || e.type === 'banner') window.__log.push({ t: +g.session.elapsed.toFixed(1), type: e.type, who: e.speaker ?? e.title, text: e.text ?? e.subtitle ?? '' });
      return orig(e);
    };
  });
  const spots = await ev(() => window.__dead.game.mission.night && JSON.parse(JSON.stringify((window.__RECORDS ??= null) || null)));
  void spots;
  // the files, by the story's order (the folder spots: admin, ward, nurses, nine, morgue)
  const S = [
    { x: -7.8, y: 0, z: 6.05 },
    { x: -26, y: 0, z: -2.6 },
    { x: -25.4, y: 5, z: -10.6 },
    { x: 22, y: 5, z: 3.4 },
    { x: 25, y: 0, z: -30.3 },
  ];
  await beat('start', 20);
  await tp(S[0].x, S[0].z + 1.2, 0); await beat('file-admin');
  await tp(S[1].x, S[1].z, 0); await beat('file-ward');
  // up the west fire escape: its foot, then the landing
  await tp(-13.55, -10.5, 0, 0); await shot('fire-escape-foot');
  await tp(-13.9, -19.3, 5, Math.PI / 2); await shot('nurses-landing');
  await tp(-20, -16, 5, Math.PI); await shot('nurses-inside');
  await tp(S[2].x, S[2].z, 5); await beat('file-nurses');
  // Ward Nine's door before the power
  await tp(13.9, -19.3, 5, -Math.PI / 2); await beat('ward9-locked', 6);
  // the power: start the generators, hold
  await ev(() => { const g = window.__dead.game; const d = g.level.data.defense; window.__dead.teleport(d.x, d.z); g.mission.activateTransmitter(); });
  await beat('power-start', 10);
  await ev(() => { window.__dead.game.session.defense.progress = 0.999; });
  await beat('power-done', 10);
  await tp(13.9, -19.3, 5, -Math.PI / 2); await shot('ward9-open');
  await tp(22, -6, 5, 0); await shot('ward9-inside');
  await tp(S[3].x, S[3].z, 5); await beat('file-nine', 15);
  await beat('dusk', 30);
  await beat('night', 15);
  await tp(S[4].x, S[4].z, 0); await beat('file-morgue', 20);
  // the Matron
  await ev(() => { const g = window.__dead.game; const b = g.zombies.boss; window.__dead.teleport(0, -27); if (b) window.__dead.lookAt(b.x, b.z, 2); });
  await beat('matron-near', 4);
  await ev(() => { const g = window.__dead.game; const b = g.zombies.boss; if (b && b.alive) b.hp = b.maxHp * 0.4; });
  await beat('matron-rage', 4);
  await ev(() => { const g = window.__dead.game; const b = g.zombies.boss; if (b && b.alive) { g.zombies.damage(b, 1e6, true, g.zenv, 0, 0, 0); } });
  await beat('matron-down', 12);
  // the damper
  await ev(() => { const d = window.__dead; d.teleport(49.5, -32.0, 0); d.advance(0.3); const t = d.game.mission.night.damperTarget(); if (t && t.enabled) t.onUse(); return t?.text; });
  await beat('damper', 15);
  await ev(() => { const g = window.__dead.game; const e = g.level.data.extraction; window.__dead.teleport(e.lzX, e.lzZ); });
  await beat('lz', 4);
  await ev(() => { const g = window.__dead.game; g.mission.callExtraction(); return g.session.extraction.phase; });
  await beat('called', 70);
  const log = await ev(() => window.__log);
  writeFileSync(`${SC}/log.json`, JSON.stringify(log, null, 1));
  for (const e of log) console.log(String(e.t).padStart(6), e.type === 'radio' ? 'R' : 'B', (e.who || '').padEnd(18).slice(0, 18), e.text.slice(0, 110));
} catch (e) {
  console.log('FAILED', e.message);
} finally {
  reportLogs(logs, { warnings: false });
  await browser.close();
}
