// The Asylum's per-frame mission cost in headless Chrome: wraps the mission, the night runtime and their helpers
// with timers, walks the map (both floors, every wing) for a while, and prints every frame whose mission update took
// longer than MS (default 4) with what inside it was slow, plus the distribution. Frames are stepped back to back
// (yielding to the event loop between them), so FRAMES=3600 is a minute of play in well under a minute.
//
//   node scripts/qa-asylum-spike.mjs [url]      (default http://127.0.0.1:5183/; FRAMES=, MS=)
import { openPage, sleep } from './lib/browser.mjs';

const url = process.argv[2] || 'http://127.0.0.1:5183/';
const FRAMES = +(process.env.FRAMES || 3600);
const MS = +(process.env.MS || 4);
const { browser, page, logs } = await openPage({ url, w: 960, h: 540 });
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  await ev(() => { localStorage.setItem('deadsignal.map.v1', 'asylum'); localStorage.setItem('deadsignal.settings.v1', JSON.stringify({ quality: 'low', qualityAuto: false })); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
  await ev(() => window.__dead.start());
  await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
  await sleep(1500);
  const out = await ev(async ([FRAMES, MS]) => {
    const d = window.__dead;
    const g = d.game;
    const m = g.mission;
    const ni = m.night;
    const stack = [];
    let frame = new Map();
    const wrap = (obj, label) => {
      if (!obj) return;
      const proto = Object.getPrototypeOf(obj);
      for (const k of Object.getOwnPropertyNames(proto)) {
        if (k === 'constructor') continue;
        const desc = Object.getOwnPropertyDescriptor(proto, k);
        if (!desc || typeof desc.value !== 'function') continue;
        const fn = desc.value;
        const name = `${label}.${k}`;
        obj[k] = function (...a) {
          const t0 = performance.now();
          try { return fn.apply(this, a); } finally {
            const dt = performance.now() - t0;
            frame.set(name, (frame.get(name) ?? 0) + dt);
          }
        };
      }
    };
    wrap(m, 'mission');
    wrap(ni, 'night');
    wrap(ni.voice, 'voice');
    wrap(ni.rush, 'rush');
    wrap(ni.look, 'look');
    wrap(ni.hud, 'nightHud');
    wrap(g.zombies, 'zombies');
    wrap(g.audio, 'audio');
    wrap(g.hud, 'hud');
    wrap(g.level.floors, 'floors');
    // a walk around the map: ground floor wings, both upper floors, the yard
    const route = [[-7.8, 7.2, 0], [-26, -2.6, 0], [-41, -7.8, 0], [-25.4, -10.6, 5], [-22, 0, 5], [0, -10, 0], [22, 3.4, 5], [22, -10, 5], [25, -30.3, 0], [-6.5, -27.8, 0], [0, 20, 0], [10, 0, 0]];
    const slow = [];
    const all = [];
    const tick = () => new Promise((r) => setTimeout(r, 0));
    for (let f = 0; f < FRAMES; f++) {
      await tick(); // between frames the page's event loop runs, as in play (the audio synthesis worker's results land)
      if (f % 90 === 0) { const r = route[(f / 90) % route.length]; d.teleport(r[0], r[1], undefined, r[2]); }
      d.setHealth(100, 100);
      frame = new Map();
      const t0 = performance.now();
      g.frameOnce(1 / 60);
      const total = performance.now() - t0;
      const mu = frame.get('mission.update') ?? 0;
      all.push(mu);
      if (mu > MS) slow.push({ f, t: +g.session.elapsed.toFixed(1), total: +total.toFixed(1), mu: +mu.toFixed(1), top: [...frame].filter(([k]) => k !== 'mission.update').sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' ') });
    }
    all.sort((a, b) => a - b);
    const q = (p) => +all[Math.min(all.length - 1, Math.floor(all.length * p))].toFixed(2);
    return { slow, p50: q(0.5), p99: q(0.99), max: +all[all.length - 1].toFixed(1), frames: all.length, over: slow.length };
  }, [FRAMES, MS]);
  for (const s of out.slow) console.log(JSON.stringify(s));
  console.log(`mission.update over ${out.frames} frames: p50 ${out.p50} ms, p99 ${out.p99} ms, max ${out.max} ms, ${out.over} over ${MS} ms`);
} finally {
  for (const l of logs) if (l.type === 'pageerror') console.log('PAGEERROR', l.text.slice(0, 300));
  await browser.close();
}
