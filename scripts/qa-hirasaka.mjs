// HIRASAKA end to end in headless Chrome: load the island, play the story through its beats (the jobs, the cage, the
// deep, Kurogane, the climb, the surge, the stone) by the story's own actions, and screenshot each. Prints the
// story's state and any console errors.
//
//   SC=<dir> node scripts/qa-hirasaka.mjs [url]      (the dev server, default http://127.0.0.1:5183/)
import { mkdirSync } from 'node:fs';
import { openPage, reportLogs, sleep } from './lib/browser.mjs';

const SC = process.env.SC || '.';
mkdirSync(SC, { recursive: true });
const url = process.argv[2] || 'http://127.0.0.1:5183/';
const W = +(process.env.W || 1280);
const H = +(process.env.H || 720);
const { browser, page, logs } = await openPage({ url, w: W, h: H });
const ev = (fn, arg) => page.evaluate(fn, arg);
const fps = () => ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); }; requestAnimationFrame(f); }));
const shot = async (name) => {
  await ev(() => window.__dead.setHealth(100, 100));
  await sleep(900);
  await page.screenshot({ path: `${SC}/hs-${name}.png` });
  console.log('shot', name);
};
const state = () => ev(() => {
  const g = window.__dead.game;
  const v = g.hirasaka.view;
  return { act: v.act, done: v.done, valves: v.valves, gen: v.generating, charge: +v.charge.toFixed(2), cage: v.cageDown, peaches: v.peaches, hairpin: v.hairpin, bossDown: v.bossDown, surfaced: v.surfaced, surge: v.surge, push: +v.push.toFixed(2), looks: v.looks, ending: v.ending, photos: v.photos, tapes: v.tapes, call: v.call, calls: g.renderer.renderer.info.render.calls, tris: g.renderer.renderer.info.render.triangles, hunt: g.session.hunt.status, defense: g.session.defense.status, hp: Math.round(g.session.vitals.health), p: [g.player.x, g.player.y, g.player.z].map((n) => +n.toFixed(1)), zombies: g.zombies.zombies.filter((z) => z.alive).length, kinds: [...new Set(g.zombies.zombies.filter((z) => z.alive).map((z) => z.variant))] };
});
const tp = (x, z, yaw, y = 0, pitch = 0) => ev(([x, z, yaw, y, pitch]) => {
  const d = window.__dead;
  d.teleport(x, z, yaw, y);
  d.look(yaw, pitch);
}, [x, z, yaw, y, pitch]);
const act = (a, i = 0) => ev(([a, i]) => window.__dead.game.hirasaka.act(a, i), [a, i]);
try {
  await ev(() => localStorage.setItem('deadsignal.map.v1', 'hirasaka'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__dead && window.__dead.game && window.__dead.game.state === 'title', null, { timeout: 120000 });
  await sleep(800);
  await shot('00-title');
  const t0 = Date.now();
  await ev(() => window.__dead.start());
  await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
  console.log('started in', Date.now() - t0, 'ms');
  await sleep(5500);
  await shot('01-pier');
  console.log(await state(), 'fps', await fps());
  await ev(() => window.__dead.setHealth(100, 100));
  // ---- ACT I ----
  await tp(-39.4, -20, Math.PI / 2, 18, -0.15);
  await shot('02-genzo-room');
  await act('key');
  await tp(18, -35.4, Math.PI, 14.4, 0);
  await act('tape', 1);
  await tp(28.5, -15.2, 0, 10.8, 0);
  await act('photo', 2);
  await tp(-20, -14, -0.4, 10.8, 0.1);
  await shot('03-block65');
  await tp(37.8, -36, Math.PI / 2, 14.4, 0.15);
  await act('gen');
  await shot('04-generator');
  await ev(() => window.__dead.game.hirasaka.story.view.charge = 0.99);
  await sleep(1500);
  await tp(30, -30, -0.8, 14.4, 0.35);
  await shot('05-lit');
  for (let i = 0; i < 3; i++) {
    const v = [[-30, 41], [14, 41], [40, 41]][i];
    await tp(v[0], v[1], 0, 0, 0);
    await act('valve', i);
  }
  await ev(() => (window.__dead.game.hirasaka.story.view.wave = 4));
  await tp(-11, 37.5, Math.PI, 0, 0.1);
  await sleep(2600);
  await shot('06-wave');
  await act('tape', 0);
  await tp(-20, 42.6, Math.PI, 0, 0);
  await act('photo', 0);
  await tp(-20, -5, 0, 10.8, 0);
  await act('photo', 1);
  await shot('07-school-roof');
  console.log(await state());
  // ---- the cage ----
  await tp(-46, 33.5, 0, 0, 0);
  await ev(() => window.__dead.game.hirasaka.rideCage(true));
  await sleep(4500);
  await shot('08-landing');
  console.log(await state());
  await tp(150, 38, 0, 0, 0);
  await act('tape', 2);
  await shot('09-coalface');
  await tp(186, 11.5, 0, 0, 0.25);
  await act('peaches');
  await ev(() => window.__dead.game.hirasaka.takePeaches());
  await sleep(1200);
  await shot('10-village');
  console.log('fps village', await fps());
  await tp(202, 21, Math.PI, 0, 0);
  await act('tape', 3);
  await tp(192, 6, 0, 0, 0);
  await act('photo', 3);
  await tp(176, -24, Math.PI / 2, 0, 0);
  await act('tape', 4);
  await tp(212.5, -30.5, 0, 0, 0);
  await act('photo', 4);
  await tp(189.5, -39.5, -Math.PI / 2, 0, 0.05);
  await act('hairpin');
  await sleep(1500);
  await shot('11-roothall-boss');
  console.log(await state());
  // put Kurogane down
  await ev(() => {
    const g = window.__dead.game;
    const b = g.zombies.boss;
    if (b) g.zombies.damage(b, 1e6, true, g.zenv, 0);
  });
  await sleep(3000);
  console.log(await state());
  await tp(150, -33, -Math.PI / 2, 4, 0);
  await sleep(1200);
  await shot('12-slope');
  // the phone (every photo found)
  await tp(140, 26, 0, 0, 0);
  await act('phone');
  console.log('after phone', await state());
  // out of the adit
  await tp(123.5, -33, Math.PI / 2, 9, 0);
  await ev(() => window.__dead.game.hirasaka.climbOut());
  await sleep(2600);
  await shot('13-surfaced');
  console.log(await state());
  // the surge
  await ev(() => (window.__dead.game.hirasaka.story.view.surgeT = 175));
  await sleep(4000);
  await tp(0, 2, Math.PI, 7.2, -0.25);
  await shot('14-surge');
  console.log('fps surge', await fps());
  await tp(3, -31, -Math.PI / 2 - 0.3, 14.4, -0.05);
  await sleep(500);
  await shot('15-stone-mio');
  console.log(await state());
  // ENDING=sealed: push the stone home; otherwise turn round (every photo, the call heard): the other ending
  await tp(4.6, -28.6, Math.PI, 14.4, 0);
  if (process.env.ENDING === 'sealed') {
    await ev(() => {
      const g = window.__dead.game;
      for (const z of g.zombies.zombies) if (z.variant === 'follower') { z.x = 150; z.z = -33; }
      g.hirasaka.story.view.push = 0.95;
    });
    await sleep(2500);
  } else await act('home');
  await sleep(4000);
  await shot('16-home');
  await sleep(9000);
  console.log(await state(), await ev(() => window.__dead.game.state));
} catch (e) {
  console.log('FAILED', e.message);
  await page.screenshot({ path: `${SC}/hs-fail.png` });
} finally {
  reportLogs(logs, { warnings: false });
  await browser.close();
}
