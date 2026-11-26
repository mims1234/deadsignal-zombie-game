// HIRASAKA: a plan of the island (or the deep) as a walking player knows it, for judging the layout like a town planner.
// Flood-fills everywhere a player can walk (the game's own wall and ground rules, from the pier; the Heights and the
// deep from their own entrances) and draws it from above: reachable ground coloured by its height, walls and solid
// things grey, open ground nobody can reach RED (a pocket), the pads' edges and the flights outlined, places named.
//
//   node scripts/qa-hirasaka-plan.mjs [url]     OPEN=shutter,bathDoor,rubble  with those obstacles opened
//   DEEP=1 ...                                   the deep instead of the island
//   OUT=shots/hirasaka/plan-island.png ...        where to write it
// Prints the pockets (open ground nobody reaches) grouped by place.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { openPage } from './lib/browser.mjs';

const deep = !!process.env.DEEP;
const outFile = process.env.OUT ?? `shots/hirasaka/plan-${deep ? 'deep' : 'island'}.png`;
mkdirSync(dirname(outFile), { recursive: true });
const { browser, page } = await openPage({ url: `${process.argv[2] ?? 'http://127.0.0.1:5183/'}?nolock`, w: 640, h: 360 });
const D = (fn, ...a) => page.evaluate(fn, ...a);
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'hirasaka'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await D(() => { const d = window.__dead; d.game.zombies.spawnAllowed = () => false; d.clearZombies(); });
await D(() => window.__dead.advance(2));
const res = await D(async ({ open, deep }) => {
  const g = window.__dead.game, w = g.level.world;
  const m = await import('/src/hirasaka/places.ts');
  if (open) for (const id of open.split(',')) { const i = m.OBSTACLES.findIndex((o) => o.id === id); const c = g.level.hirasaka.obstacles[i]; if (c) c.blocksMove = false; }
  if (open) g.hirasaka.update = () => {};
  const R = 0.34, STEP = 0.42, H = 1.8, S = 0.25;
  const B = deep ? { x0: m.DEEP.x0 - 4, x1: m.DEEP.x1 + 4, z0: m.DEEP.z0 - 4, z1: m.DEEP.z1 + 4 } : { x0: -166, x1: 166, z0: -82, z1: 98 };
  const nx = Math.round((B.x1 - B.x0) / S), nz = Math.round((B.z1 - B.z0) / S);
  const top = new Float32Array(nx * nz).fill(-99); // the highest reached floor per cell
  const seen = new Map();
  const q = [];
  const push = (i, j, y) => {
    const k = j * nx + i; const yk = Math.round(y * 10);
    let s = seen.get(k); if (!s) seen.set(k, (s = new Set()));
    if (s.has(yk)) return; s.add(yk); q.push([i, j, y]);
    if (y > top[k]) top[k] = y;
  };
  const seed = (x, y, z) => push(Math.round((x - B.x0) / S), Math.round((z - B.z0) / S), y);
  if (deep) { seed(m.CAGE.bottomOut.x, m.CAGE.bottomOut.y, m.CAGE.bottomOut.z); }
  else {
    seed(g.player.x, g.player.y, g.player.z);
    seed(m.HEIGHTS.stairHead.x, m.HEIGHTS.stairHead.y, m.HEIGHTS.stairHead.z);
  }
  let n = 0;
  while (q.length && n < 3e7) {
    const [i, j, y] = q.pop(); n++;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const x = B.x0 + a * S, z = B.z0 + b * S;
      if (w.circleBlocked(x, z, R, y + STEP, y + H)) continue;
      const ny = w.groundHeight(x, z, R * 0.92, y + STEP + 0.001);
      if (ny < -5) continue;
      if (!deep) { const pad = m.padAt(x, z); if (pad && pad.y >= 3 && ny < pad.y - 2.5) continue; }
      push(a, b, ny);
    }
  }
  // each cell: reached (its top y), solid at its floor, or open but never reached (a pocket)
  const kind = new Uint8Array(nx * nz); // 0 off, 1 reached, 2 solid, 3 pocket
  const pockets = {};
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = B.x0 + i * S, z = B.z0 + j * S;
    if (top[k] > -99) { kind[k] = 1; continue; }
    const fy = deep ? m.deepY(x, z) : m.groundY(x, z);
    if (fy < -0.5 && !(deep && fy >= 0)) { if (!deep || fy < 0) { kind[k] = 0; continue; } }
    const solid = w.circleBlocked(x, z, R, fy + STEP, fy + H);
    if (solid) { kind[k] = 2; continue; }
    kind[k] = 3;
    const place = m.placeAt(x, z) ?? 'off';
    const c = (pockets[place] = pockets[place] || { n: 0, x0: 1e9, z0: 1e9, x1: -1e9, z1: -1e9, cells: [] });
    c.n++; c.cells.push([x, z]);
  }
  // cluster the pockets (4-connected), keep those at least 2 m^2
  const lab = new Int32Array(nx * nz).fill(-1);
  const clusters = [];
  for (let k0 = 0; k0 < nx * nz; k0++) {
    if (kind[k0] !== 3 || lab[k0] >= 0) continue;
    const st = [k0]; lab[k0] = clusters.length; let c = { n: 0, x0: 1e9, z0: 1e9, x1: -1e9, z1: -1e9 };
    while (st.length) {
      const k = st.pop(); const i = k % nx, j = (k / nx) | 0; const x = B.x0 + i * S, z = B.z0 + j * S;
      c.n++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.z0 = Math.min(c.z0, z); c.z1 = Math.max(c.z1, z);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const kk = b * nx + a; if (kind[kk] === 3 && lab[kk] < 0) { lab[kk] = clusters.length; st.push(kk); } }
    }
    c.area = c.n * S * S; c.place = m.placeAt((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2) ?? 'off';
    clusters.push(c);
  }
  // draw
  const PX = 2;
  const cv = document.createElement('canvas'); cv.width = nx * PX; cv.height = nz * PX;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(cv.width, cv.height);
  const col = (y) => {
    const stops = deep ? [[0, [150, 60, 60]], [9, [90, 140, 200]], [15, [230, 220, 120]]] : [[0, [60, 110, 200]], [3.6, [60, 180, 170]], [7.2, [90, 190, 80]], [10.8, [220, 200, 70]], [18, [240, 140, 60]], [21.6, [230, 80, 200]]];
    for (let s = 0; s < stops.length - 1; s++) { const [a, ca] = stops[s], [b, cb] = stops[s + 1]; if (y <= b) { const t = Math.max(0, Math.min(1, (y - a) / (b - a))); return ca.map((v, q) => v + (cb[q] - v) * t); } }
    return stops[stops.length - 1][1];
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let c;
    if (kind[k] === 1) c = col(top[k]); else if (kind[k] === 2) c = [70, 70, 74]; else if (kind[k] === 3) c = [230, 20, 30]; else c = [12, 16, 22];
    for (let v = 0; v < PX; v++) for (let u = 0; u < PX; u++) { const p = ((j * PX + v) * cv.width + i * PX + u) * 4; img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255; }
  }
  cx.putImageData(img, 0, 0);
  const X = (x) => ((x - B.x0) / S) * PX, Z = (z) => ((z - B.z0) / S) * PX;
  cx.lineWidth = 1;
  if (!deep) {
    cx.strokeStyle = 'rgba(255,255,255,0.55)';
    for (const p of m.PADS) cx.strokeRect(X(p.x0), Z(p.z0), X(p.x1) - X(p.x0), Z(p.z1) - Z(p.z0));
    cx.strokeStyle = '#fff';
    for (const f of m.FLIGHTS) { const r = m.flightRect(f); cx.strokeRect(X(r.x0), Z(r.z0), X(r.x1) - X(r.x0), Z(r.z1) - Z(r.z0)); }
  } else {
    cx.strokeStyle = 'rgba(255,255,255,0.5)';
    for (const r of m.DEEP_ROOMS) cx.strokeRect(X(r.x0), Z(r.z0), X(r.x1) - X(r.x0), Z(r.z1) - Z(r.z0));
  }
  // the grid every 10 m, labelled every 20
  cx.fillStyle = 'rgba(255,255,255,0.8)'; cx.font = '11px monospace';
  for (let x = Math.ceil(B.x0 / 20) * 20; x <= B.x1; x += 20) cx.fillText(String(x), X(x) + 2, 11);
  for (let z = Math.ceil(B.z0 / 20) * 20; z <= B.z1; z += 20) cx.fillText(String(z), 2, Z(z) - 2);
  cx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let x = Math.ceil(B.x0 / 10) * 10; x <= B.x1; x += 10) { cx.beginPath(); cx.moveTo(X(x), 0); cx.lineTo(X(x), cv.height); cx.stroke(); }
  for (let z = Math.ceil(B.z0 / 10) * 10; z <= B.z1; z += 10) { cx.beginPath(); cx.moveTo(0, Z(z)); cx.lineTo(cv.width, Z(z)); cx.stroke(); }
  cx.font = 'bold 13px sans-serif';
  for (const p of m.PLACES_LIST) {
    if (!!p.deep !== deep) continue;
    const tx = X((p.rect.x0 + p.rect.x1) / 2), tz = Z((p.rect.z0 + p.rect.z1) / 2);
    cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillText(p.name, tx - cx.measureText(p.name).width / 2 + 1, tz + 1);
    cx.fillStyle = '#fff'; cx.fillText(p.name, tx - cx.measureText(p.name).width / 2, tz);
  }
  // the named spots as dots
  cx.fillStyle = '#fff';
  for (const s of m.allSpots()) { if (m.inDeep(s.at.x) !== deep) continue; cx.beginPath(); cx.arc(X(s.at.x), Z(s.at.z), 2.5, 0, 7); cx.fill(); }
  const big = clusters.filter((c) => c.area >= 2).sort((a, b) => b.area - a.area).map((c) => ({ place: c.place, area: c.area, x: [c.x0, c.x1], z: [c.z0, c.z1] }));
  return { png: cv.toDataURL('image/png'), states: n, big };
}, { open: process.env.OPEN ?? '', deep });
writeFileSync(outFile, Buffer.from(res.png.split(',')[1], 'base64'));
console.log('states', res.states, '->', outFile);
console.log(`pockets >= 2 m2: ${res.big.length}`);
for (const c of res.big.slice(0, 60)) console.log(`${c.place.padEnd(10)} ${String(c.area).padStart(6)} m2  x ${c.x[0]}..${c.x[1]}  z ${c.z[0]}..${c.z[1]}`);
await browser.close();
