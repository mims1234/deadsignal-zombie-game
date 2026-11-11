// ZARYA: a stand at a painted doll. Puts the player by each doll in turn with the town open, lets the squad fight for
// a while, and reports how many came and how many shells opened (the doll should call them in, and the squad's kills
// should count).   node scripts/qa-zarya-dolls.mjs [url] [seconds]
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const secs = Number(process.argv[3] ?? 40);
const { browser, page, logs } = await openPage({ url: `${base}?nolock`, w: 1280, h: 720 });
const D = (fn, ...a) => page.evaluate(fn, ...a);
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await D(() => {
  const s = window.__dead.game.zarya.story;
  s.ch = 4;
  s.f = (1 << 16) - 1;
  window.__dead.clearZombies();
});
const dolls = [[44, -24], [197, 38], [-40, 122]];
let fail = 0;
for (const [i, [x, z]] of dolls.entries()) {
  await D(([x, z]) => { const d = window.__dead; d.teleport(x + 4, z + 4, 0); d.clearZombies(); }, [x, z]);
  const before = await D((i) => (window.__dead.game.zarya.view.dolls >> (i * 6)) & 63, i);
  let peak = 0;
  for (let t = 0; t < secs; t += 2) {
    await D(() => { window.__dead.setHealth(100, 100); window.__dead.advance(2); });
    const n = await D(([x, z]) => window.__dead.game.zombies.zombies.filter((q) => q.alive && Math.hypot(q.x - x, q.z - z) < 45).length, [x, z]);
    peak = Math.max(peak, n);
  }
  const after = await D((i) => (window.__dead.game.zarya.view.dolls >> (i * 6)) & 63, i);
  const ok = after - before >= 4;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} doll ${i}: ${after - before} counted in ${secs}s, up to ${peak} near it at once`);
}
const errors = logs.filter((l) => l.type === 'pageerror');
console.log(errors.length ? `${errors.length} page errors: ${errors[0].text.slice(0, 200)}` : 'no page errors');
console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
await browser.close();
process.exit(fail ? 1 : 0);
