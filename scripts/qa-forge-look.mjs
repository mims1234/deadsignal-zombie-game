// The Forge at a glance: screenshots and frame numbers at its landmarks.
//   node scripts/qa-forge-look.mjs <outdir> [quality=high+] [port=5183] [w=1600] [h=900] [touch]
// Needs the dev client running (vite on <port>).
import { mkdirSync } from 'node:fs';
import { openPage, reportLogs, sleep } from './lib/browser.mjs';

const [, , out = 'shots/forge', quality = 'high+', port = '5183', W = '1600', H = '900', touch = ''] = process.argv;
mkdirSync(out, { recursive: true });
const { browser, context, page, logs } = await openPage({ w: +W, h: +H, args: touch ? ['--touch-events=enabled'] : [] });
await context.addInitScript(([q]) => {
  try {
    localStorage.setItem('deadsignal.map.v1', 'forge');
    const k = 'deadsignal.settings.v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    localStorage.setItem(k, JSON.stringify({ ...s, quality: q, qualityAuto: false, masterVolume: 0 }));
  } catch { /* ignore */ }
}, [quality]);
const call = (fn, ...args) => page.evaluate(([f, a]) => window.__dead[f](...a), [fn, args]);
const SPOTS = [
  ['hearth', -38, -21.6, 0, 0],
  ['crossroads', -16, 0, -Math.PI / 2, 0.02],
  ['plaza', 16, 38, -1.9, 0.1],
  ['pool', 36, -29.5, 0.9, -0.5],
  ['channel', 17.5, -30, 1.2, -0.3],
  ['road-wet', -20, 1, -1.35, -0.12],
  ['stacks', 36, -56, Math.PI, 0.42],
  ['north-door', 36, -44, Math.PI, 0.05],
  ['slag', 19.5, -44, 1.2, -0.25],
  ['bridge', 17.5, -8, 0, 0.12],
  ['hq', 48, -2, Math.PI, 0.12],
  ['crucible', 36, -12, 0, 0.1],
  ['crucible-in', 36, -24, 0.4, 0.05],
  ['market', -34, 26, 2.6, 0.05],
  ['smelter-row', 8, -15.5, -Math.PI / 2, 0.06],
];
try {
  await page.goto(`http://127.0.0.1:${port}/?nolock&map=forge`, { waitUntil: 'load' });
  await page.waitForFunction('window.__dead', null, { timeout: 90000 });
  await sleep(1500);
  await call('start');
  await sleep(2500);
  await call('setHealth', 99999, 999);
  await call('clearZombies');
  for (const [name, x, z, yaw, pitch] of SPOTS) {
    await call('teleport', x, z, yaw);
    await call('look', yaw, pitch);
    await call('clearZombies');
    await sleep(2200);
    const s = await page.evaluate(() => JSON.parse(JSON.stringify(window.__dead.snapshot())));
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(`${name.padEnd(12)} fps ${s.fps}  sim ${s.cpuSimMs}ms render ${s.cpuRenderMs}ms  draws ${s.draws}  tris ${(s.triangles / 1000).toFixed(0)}k  q ${s.quality ?? '?'}`);
  }
  // the infected, lined up under a lamp
  await call('teleport', -30, 2, Math.PI / 2);
  await call('look', Math.PI / 2, 0);
  await call('freeze', true);
  const kinds = ['shambler', 'shambler', 'shambler', 'runner', 'runner', 'armored', 'armored', 'shambler', 'shambler'];
  for (let i = 0; i < kinds.length; i++) await call('spawnZombie', kinds[i], -35.5 - (i % 2) * 1.6, -2.6 + i * 0.75, false);
  await sleep(1500);
  await page.screenshot({ path: `${out}/infected.png` });
  await call('clearZombies');
  await call('freeze', false);
  // the Infernus, face to face
  const boss = await page.evaluate(() => { const b = window.__dead.game.zombies.boss; return b ? { x: b.x, z: b.z } : null; });
  if (boss) {
    await call('teleport', boss.x + 4.6, boss.z + 1.5, 0);
    await sleep(1600);
    for (let i = 0; i < 6; i++) {
      const at = await page.evaluate(() => { const b = window.__dead.game.zombies.boss; window.__dead.lookAt(b.x, b.z, 1.7); return [b.x, b.z]; });
      void at;
      await sleep(120);
    }
    await page.screenshot({ path: `${out}/infernus.png` });
  }
  // the ladle: throw the lever and watch it pour
  await call('give', { cash: 5000 });
  await call('teleport', 36, -21.6, 0);
  await call('look', 0, 0.02);
  await sleep(600);
  const prompt = await page.evaluate(() => { const o = []; window.__dead.game.forge.ladle.target(o, true); return o.map((t) => t.text + ' | ' + t.enabled); });
  console.log('ladle prompt:', JSON.stringify(prompt));
  await call('spawnZombie', 'shambler', 36, -29, false);
  await call('spawnZombie', 'runner', 34, -30, false);
  await page.evaluate(() => window.__dead.game.forge.ladle.tip());
  await sleep(3600);
  await page.screenshot({ path: `${out}/ladle-pour.png` });
  const z = await page.evaluate(() => ({ phase: window.__dead.game.forge.ladle.phase, cash: window.__dead.game.session.inv.cash, alive: window.__dead.game.zombies.zombies.filter((q) => q.active && q.hp > 0 && Math.hypot(q.x - 36, q.z + 29.8) < 4.4).length }));
  console.log('ladle after 3.6 s:', JSON.stringify(z));
  await sleep(7500);
  await page.screenshot({ path: `${out}/ladle-cool.png` });
  console.log('ladle later:', await page.evaluate(() => window.__dead.game.forge.ladle.phase));
  // the lever cannot be thrown through the wall from the street, and it comes back up when the ladle has refilled
  await sleep(3600);
  const rearm = await page.evaluate(async () => {
    const d = window.__dead;
    const l = d.game.forge.ladle;
    const lever = d.game.level.forgeFx.ladle.lever;
    const thrown = lever.rotation.x;
    l.since = 1e3;
    await new Promise((r) => setTimeout(r, 400));
    d.teleport(34.7, -19.6, Math.PI);
    const outside = [];
    l.target(outside, true);
    d.teleport(36, -21.6, 0);
    const inside = [];
    l.target(inside, true);
    return { phase: l.phase, leverThrown: +thrown.toFixed(2), leverNow: +lever.rotation.x.toFixed(2), promptsOutsideTheWall: outside.length, promptsInside: inside.map((t) => t.text) };
  });
  console.log('ladle re-armed:', JSON.stringify(rearm));
  const v = await call('validateLevel');
  console.log('level:', JSON.stringify(v));
} catch (e) {
  console.log('FAILED', e.message);
} finally {
  reportLogs(logs, { warnings: false });
  await browser.close();
}
