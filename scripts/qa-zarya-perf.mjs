// ZARYA's cost on a weak device, as far as a desktop can stand in for one: frame numbers at its viewpoints and in a
// fight, with the CPU slowed down, on one graphics tier. Give another map's name to get the same numbers for it where
// a run starts (an A/B against what already ships).
//
//   node scripts/qa-zarya-perf.mjs [map=zarya] [tier=low] [port=5183] [w=844] [h=390]
//   QA_CPU=4      slow the page's CPU four times (Chrome's throttle): what a phone's cores make of the frame
import { openPage, sleep } from './lib/browser.mjs';

const [, , map = 'zarya', tier = 'low', port = '5183', W = '844', H = '390'] = process.argv;
const cpu = Number(process.env.QA_CPU || 1);
const { browser, context, page, logs } = await openPage({ w: +W, h: +H });
await context.addInitScript(([q, m]) => {
  try {
    localStorage.setItem('deadsignal.map.v1', m);
    const k = 'deadsignal.settings.v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    localStorage.setItem(k, JSON.stringify({ ...s, quality: q, qualityAuto: false, masterVolume: 0 }));
  } catch { /* ignore */ }
}, [tier, map]);
if (cpu > 1) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
}
await page.goto(`http://127.0.0.1:${port}/?nolock&touch=1`, { waitUntil: 'load' });
const D = (fn, ...a) => page.evaluate(fn, ...a);
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 180000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 120000 });
const snap = () => D(() => { const s = window.__dead.snapshot(); return { fps: s.fps, sim: s.cpuSimMs, render: s.cpuRenderMs, draws: s.draws, tris: s.triangles }; });
async function sample(n = 5) {
  const acc = { fps: 0, sim: 0, render: 0, draws: 0, tris: 0 };
  for (let i = 0; i < n; i++) {
    await sleep(500);
    const s = await snap();
    for (const k of Object.keys(acc)) acc[k] += s[k] / n;
  }
  return acc;
}
const row = (name, s) => console.log(`${name.padEnd(16)} ${s.fps.toFixed(0).padStart(4)} fps   sim ${s.sim.toFixed(1).padStart(5)} ms   render ${s.render.toFixed(1).padStart(5)} ms   ${String(Math.round(s.draws)).padStart(4)} draws   ${String(Math.round(s.tris / 1000)).padStart(4)}k tris`);
console.log(`${map}, tier ${tier}, ${W}x${H}, CPU x${cpu}`);

await sleep(2500);
row('where it starts', await sample());
if (map === 'zarya') {
  // the town asleep, every door open, nothing hunting: the scenery's own cost
  await D(() => {
    const g = window.__dead.game;
    const s = g.zarya.story;
    s.ch = 3;
    s.f = 1 | 2 | 4 | 32;
    g.zombies.spawnAllowed = () => false;
    window.__dead.clearZombies();
  });
  // two views in every zone and interior: the scenery alone, then a busy one with both squadmates stood in frame
  // (each costs about 50 draw calls). `ONLY=dk,berloga` limits it to those zones.
  const SPOTS = [
    ['square', -30, -30, 20, 10], ['square+squad', -72, -12, -80, -18, 1], ['square fair', 27, 20, 27, -20],
    ['store', 44, -2, 70, -2], ['store hall+squad', 88, 4, 112, -10, 1],
    ['shelter', 384, 3, 368, 0], ['shelter+squad', 366, 0, 361, 0, 1],
    ['rynok', 165, 0, 200, 0], ['rynok+squad', 200, 30, 200, -10, 1],
    ['dvor', -60, 104, -70, 110], ['dvor+squad', 20, 110, -30, 130, 1], ['dvor east', 40, 130, 80, 110],
    ['garages', 170, 105, 210, 115], ['garages+squad', 220, 128, 180, 150, 1],
    ['depot', 165, -95, 190, -120], ['depot+squad', 190, -150, 170, -170, 1],
    ['dk foyer', -110, -15, -130, -23], ['dk hall+squad', -150, -23, -180, -23, 1], ['dk museum', -120, -45, -150, -45],
    ['banya pond', 60, -125, 60, -150], ['banya house+squad', 114, -159, 137, -162, 1],
    ['tets', -40, -128, -40, -165], ['tets+squad', 10, -112, -30, -100, 1],
    ['institute', -140, -100, -194, -130], ['institute+squad', -150, -130, -194, -130, 1],
    ['canteen', 440, 0, 468, 0], ['canteen+squad', 465, 10, 440, -10, 1],
    ['berloga', 510, 0, 545, 0], ['berloga+squad', 550, -5, 510, 5, 1],
  ];
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  for (const [name, x, z, tx, tz, busy] of SPOTS) {
    if (only && !only.some((o) => name.startsWith(o))) continue;
    await D(([x, z, tx, tz, busy]) => {
      const d = window.__dead;
      const g = d.game;
      d.clearZombies();
      d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)));
      clearInterval(window.__squadHold);
      window.__squadHold = 0;
      if (!busy) return;
      // keep both squadmates a few metres ahead of the camera, either side of the line of sight
      const ax = (tx - x) / Math.hypot(tx - x, tz - z);
      const az = (tz - z) / Math.hypot(tx - x, tz - z);
      window.__squadHold = setInterval(() => {
        (g.squad.allies ?? []).forEach((a, i) => {
          const s = i === 0 ? -1.4 : 1.4;
          a.ref.x = x + ax * 5 - az * s;
          a.ref.z = z + az * 5 + ax * s;
        });
      }, 50);
    }, [x, z, tx, tz, busy ?? 0]);
    await sleep(1500);
    row(name, await sample());
  }
  await D(() => { clearInterval(window.__squadHold); window.__squadHold = 0; });
  await D(() => window.__dead.teleport(-30, -30, Math.atan2(-50, -40)));
}
// a fight where the run is: a dozen infected coming in, the squad shooting
await D(() => {
  const d = window.__dead;
  const g = d.game;
  const p = g.player;
  for (let i = 0; i < 12; i++) d.spawnZombie(i % 4 === 0 ? 'runner' : 'shambler', p.x + 10 + (i % 4) * 2.5, p.z - 6 + Math.floor(i / 4) * 5, true);
});
const fight = { fps: 0, sim: 0, render: 0, draws: 0, tris: 0 };
for (let i = 0; i < 6; i++) {
  await D(() => window.__dead.setHealth(100, 100));
  const s = await sample(2);
  for (const k of Object.keys(fight)) fight[k] += s[k] / 6;
}
row('a fight', fight);
const errors = logs.filter((l) => l.type === 'pageerror');
if (errors.length) console.log(`${errors.length} page errors: ${errors[0].text.slice(0, 360)}`);
await browser.close();
