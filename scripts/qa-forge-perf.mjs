// The Forge's cost on a weak device, as far as a desktop can stand in for one: load time, memory, and frame numbers at
// its landmarks and in a fight, with the CPU slowed down and / or the GPU replaced by a software rasteriser.
//   node scripts/qa-forge-perf.mjs [tier=low] [port=5183] [w=844] [h=390]
//   QA_CPU=4            slow the page's CPU four times (Chrome's throttle): what a phone's cores make of the frame
//   QA_GL=swiftshader   draw on the CPU: every pixel and every shader instruction costs, so fill and shader cost show
// Needs the dev client running (vite on <port>). Run it against two builds on two ports to compare them.
import { openPage, reportLogs, sleep } from './lib/browser.mjs';

const [, , tier = 'low', port = '5183', W = '844', H = '390'] = process.argv;
const cpu = Number(process.env.QA_CPU || 1);
const soft = process.env.QA_GL === 'swiftshader';
const args = ['--js-flags=--expose-gc', ...(soft ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])];
const { browser, context, page, logs } = await openPage({ w: +W, h: +H, args });
await context.addInitScript(([q]) => {
  try {
    localStorage.setItem('deadsignal.map.v1', 'forge');
    const k = 'deadsignal.settings.v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    localStorage.setItem(k, JSON.stringify({ ...s, quality: q, qualityAuto: false, masterVolume: 0 }));
  } catch { /* ignore */ }
}, [tier]);
if (cpu > 1) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
}
const call = (fn, ...a) => page.evaluate(([f, x]) => window.__dead[f](...x), [fn, a]);
const snap = () => page.evaluate(() => { const s = window.__dead.snapshot(); return { fps: s.fps, sim: s.cpuSimMs, render: s.cpuRenderMs, draws: s.draws, tris: s.triangles }; });
/** Mean of a few readings half a second apart (the game's own numbers are already smoothed). */
async function sample(n = 5) {
  const acc = { fps: 0, sim: 0, render: 0, draws: 0, tris: 0 };
  for (let i = 0; i < n; i++) {
    await sleep(500);
    const s = await snap();
    for (const k of Object.keys(acc)) acc[k] += s[k] / n;
  }
  return acc;
}
const SPOTS = [
  ['hearth', -38, -21.6, 0, 0],
  ['crossroads', -16, 0, -Math.PI / 2, 0.02],
  ['plaza', 16, 38, -1.9, 0.1],
  ['hq', 48, -2, Math.PI, 0.12],
  ['crucible', 36, -12, 0, 0.1],
  ['crucible-in', 36, -24, 0.4, 0.05],
  ['pool-close', 36, -29.5, 0.9, -0.5],
  ['market', -34, 26, 2.6, 0.05],
  ['smelter-row', 8, -15.5, -Math.PI / 2, 0.06],
  ['road-wet', -20, 1, -1.35, -0.12],
];
const fmt = (name, s) => `${name.padEnd(13)} fps ${s.fps.toFixed(1).padStart(6)}  sim ${s.sim.toFixed(2)}ms  render ${s.render.toFixed(2)}ms  draws ${Math.round(s.draws)}  tris ${(s.tris / 1000).toFixed(0)}k`;
try {
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?nolock&map=forge`, { waitUntil: 'load' });
  await page.waitForFunction('window.__dead', null, { timeout: 240000 });
  const loadMs = Date.now() - t0;
  await sleep(1500);
  await call('start');
  await sleep(3000);
  await call('setHealth', 99999, 999);
  await call('clearZombies');
  const mem = await page.evaluate(() => {
    if (typeof gc === 'function') gc();
    const r = window.__dead.game.renderer.renderer.info.memory;
    return { heapMb: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0, geometries: r.geometries, textures: r.textures };
  });
  console.log(`tier ${tier}  ${W}x${H}  cpu x${cpu}  gl ${soft ? 'swiftshader' : 'hardware'}  port ${port}`);
  console.log(`load ${(loadMs / 1000).toFixed(1)} s   js heap ${mem.heapMb.toFixed(0)} MB   geometries ${mem.geometries}   textures ${mem.textures}`);
  const all = [];
  for (const [name, x, z, yaw, pitch] of SPOTS) {
    await call('teleport', x, z, yaw);
    await call('look', yaw, pitch);
    await call('clearZombies');
    await sleep(1800);
    const s = await sample();
    all.push(s);
    console.log(fmt(name, s));
  }
  // a fight at the crossroads: two dozen of them on you
  await call('teleport', -16, 0, -Math.PI / 2);
  await call('look', -Math.PI / 2, 0);
  const kinds = ['shambler', 'shambler', 'runner', 'shambler', 'armored', 'runner'];
  for (let i = 0; i < 24; i++) await call('spawnZombie', kinds[i % kinds.length], -6 + (i % 6) * 1.6, -5 + Math.floor(i / 6) * 2.6, true);
  await sleep(2500);
  const fight = await sample(6);
  console.log(fmt('fight x24', fight));
  const mean = (k) => all.reduce((a, s) => a + s[k], 0) / all.length;
  console.log(`MEAN          fps ${mean('fps').toFixed(1).padStart(6)}  sim ${mean('sim').toFixed(2)}ms  render ${mean('render').toFixed(2)}ms  draws ${Math.round(mean('draws'))}  tris ${(mean('tris') / 1000).toFixed(0)}k   | fight fps ${fight.fps.toFixed(1)} sim ${fight.sim.toFixed(2)}ms render ${fight.render.toFixed(2)}ms`);
} catch (e) {
  console.log('FAILED', e.message);
} finally {
  reportLogs(logs, { warnings: false });
  await browser.close();
}
