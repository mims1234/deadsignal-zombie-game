// HIRASAKA: flood-fill everywhere a walking player can reach on the island (the game's own wall and ground rules, from
// the pier) and fail on any spot where they would stand well below the pad (inside the hill, nothing drawn round them).
//
//   node scripts/qa-hirasaka-walk.mjs [url]       OPEN=shutter,bathDoor,rubble  with those obstacles opened
import { openPage } from './lib/browser.mjs';
const { browser, page, logs } = await openPage({ url: `${process.argv[2] ?? 'http://127.0.0.1:5183/'}?nolock`, w: 640, h: 360 });
const D = (fn, ...a) => page.evaluate(fn, ...a);
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'hirasaka'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await D(() => { const d = window.__dead; d.game.zombies.spawnAllowed = () => false; d.clearZombies(); });
await D(() => window.__dead.advance(2));
const open = process.env.OPEN ?? '';
const res = await D(async (open) => {
  const g = window.__dead.game, w = g.level.world;
  const m = await import('/src/hirasaka/places.ts');
  // open the obstacles asked for (by id)
  if (open) for (const id of open.split(',')) { const i = m.OBSTACLES.findIndex((o) => o.id === id); const c = g.level.hirasaka.obstacles[i]; if (c) { c.blocksMove = false; } }
  if (open) g.hirasaka.update = () => {}; // keep doors.ts from shutting them again
  const R = 0.34, STEP = 0.42, H = 1.8, S = Number(new URLSearchParams(location.search).get("S") || 0.25);
  const x0 = -166, x1 = 166, z0 = -82, z1 = 98;
  const nx = Math.round((x1 - x0) / S), nz = Math.round((z1 - z0) / S);
  const seen = new Map(); // cell -> Set of y*10
  const q = [];
  const push = (i, j, y, from) => {
    const k = j * nx + i; const yk = Math.round(y * 10);
    let s = seen.get(k); if (!s) seen.set(k, (s = new Set()));
    if (s.has(yk)) return; s.add(yk); q.push([i, j, y, from]);
  };
  const p = g.player;
  push(Math.round((p.x - x0) / S), Math.round((p.z - z0) / S), p.y, null);
  const bad = [];
  let n = 0;
  while (q.length && n < 2e7) {
    const [i, j, y, from] = q.pop(); n++;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const x = x0 + a * S, z = z0 + b * S;
      if (w.circleBlocked(x, z, R, y + STEP, y + H)) continue;
      const ny = w.groundHeight(x, z, R * 0.92, y + STEP + 0.001);
      const pad = m.padAt(x, z);
      if (pad && pad.y >= 3 && ny < pad.y - 2.5) { bad.push({ x, z, y: +ny.toFixed(2), pad: pad.id, from: [+(x0 + i * S).toFixed(1), +y.toFixed(2), +(z0 + j * S).toFixed(1)] }); continue; }
      if (ny < -5) continue;
      push(a, b, ny, null);
    }
  }
  const per = {};
  for (const [k, ys] of seen) { const x = x0 + (k % nx) * S, z = z0 + Math.floor(k / nx) * S; const pad = m.padAt(x, z); const id = pad ? pad.id : 'off'; per[id] = per[id] || {}; for (const yk of ys) { const yy = (yk/10).toFixed(1); per[id][yy] = (per[id][yy] || 0) + 1; } }
  for (const id in per) per[id] = Object.entries(per[id]).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([y,c])=>y+':'+c).join(' ');
  return { n, cells: seen.size, bad, per, start: [p.x, p.y, p.z] };
}, open);
console.log(res.start, res.per);
console.log('states', res.n, 'cells', res.cells, 'under-pad spots', res.bad.length);
// group the entries by where they were entered from (1 m)
const groups = new Map();
for (const b of res.bad) { const k = `${b.pad}@${Math.round(b.from[0] / 2) * 2},${Math.round(b.from[2] / 2) * 2} y${b.from[1]}`; groups.set(k, (groups.get(k) ?? 0) + 1); }
for (const [k, c] of [...groups].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(String(c).padStart(5), k);
await browser.close();
process.exit(res.bad.length ? 1 : 0);
