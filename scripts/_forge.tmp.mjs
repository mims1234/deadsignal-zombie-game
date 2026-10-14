import { chromium } from 'playwright-core';
import { CHROME } from './lib/browser.mjs';
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:5183/auth/dev?id=9000000009&name=Boss');
await page.goto('http://127.0.0.1:5183/');
await page.waitForFunction(() => window.__dead && window.__dead.game.state === 'title', null, { timeout: 120000 });
await page.evaluate(() => [...document.querySelectorAll('.modes button')].find((b) => b.textContent === 'THE FORGE').click());
await page.waitForFunction(() => window.__dead && window.__dead.game.state === 'title' && window.__dead.game.mapId === 'forge', null, { timeout: 120000 });
await page.screenshot({ path: `${OUT}/f0-title.png` });
const info = await page.evaluate(() => {
  const g = window.__dead.game; const L = g.level; const d = L.data;
  g.flow.compute(d.playerStart.x, d.playerStart.z);
  const r = (p) => g.flow.isReachable(p.x, p.z);
  const unreach = [];
  for (const [k, list] of [['spawn', d.spawnPoints], ['ambient', d.ambient], ['crate', d.crates], ['station', d.stations]]) list.forEach((p, i) => { if (!r(p)) unreach.push(`${k}${i}@${p.x.toFixed(0)},${p.z.toFixed(0)}`); });
  const sites = { defense: r(d.defense), lz: r({ x: d.extraction.lzX, z: d.extraction.lzZ }), terminal: r({ x: d.extraction.terminalX + 1, z: d.extraction.terminalZ + 1 }), boss: r({ x: d.hunt.wardenX, z: d.hunt.wardenZ }) };
  return { id: d.id, name: d.text.name, counts: { spawn: d.spawnPoints.length, ambient: d.ambient.length, crates: d.crates.length, stations: d.stations.length }, placement: { moved: L.placement.moved.length, dropped: L.placement.dropped }, unreach, sites, brief: [...document.querySelectorAll('.ds-brief .title')].map((e) => e.textContent), coopDisabled: [...document.querySelectorAll('.modes button')].find((b) => b.textContent === 'CO-OP').disabled };
});
console.log(JSON.stringify(info));
// play: standard on the forge
await page.evaluate(() => { [...document.querySelectorAll('.modes button')].find((b) => b.textContent === 'STANDARD').click(); window.__dead.start(); window.__dead.freeze(true); });
const play = await page.evaluate(async () => {
  const d = window.__dead, g = d.game;
  const out = { allies0: g.forge.allies.map((a) => a.name + ':' + Math.round(Math.hypot(a.ref.x - g.player.x, a.ref.z - g.player.z))) };
  // walk forward 6 s: allies should follow
  d.hold({ forward: 1 }); d.advance(6); d.hold({ forward: 0 }); d.advance(1);
  out.follow = g.forge.allies.map((a) => Math.round(Math.hypot(a.ref.x - g.player.x, a.ref.z - g.player.z)));
  // a shambler in front of the squad: they should shoot it
  const p = g.player; const zid = d.spawnZombie('shambler', p.x - Math.sin(p.yaw) * 14, p.z - Math.cos(p.yaw) * 14, true);
  const kills0 = g.session.stats.kills; d.setHealth(100, 100);
  d.advance(6);
  const z = g.zombies.zombies.find((q) => q.id === zid);
  out.allyShot = { zombieAlive: !!z && z.alive, hp: z ? Math.round(z.hp) : null, playerKills: g.session.stats.kills - kills0 };
  // embers
  const cash0 = g.session.inv.cash; const e = g.forge.embers[0];
  d.teleport(e.x, e.z); d.advance(0.3);
  out.ember = { taken: e.taken, cash: g.session.inv.cash - cash0 };
  out.objectives = [...document.querySelectorAll('.ds-obj-row .title')].map((x) => x.textContent);
  // ally takes lethal damage
  const a = g.forge.allies[1]; g.forge.hurt(a, 9999); d.advance(0.1);
  out.allyDead = !a.ref.alive;
  out.prompt = g.level.data.text.defensePrompt;
  return out;
});
console.log(JSON.stringify(play));
await page.evaluate(() => { window.__dead.freeze(false); const g = window.__dead.game; g.player.teleport(-6, 8); window.__dead.look(-0.9, -0.05); });
await new Promise((r) => setTimeout(r, 1500)); await page.screenshot({ path: `${OUT}/f1-street.png` });
await page.evaluate(() => { const g = window.__dead.game; g.player.teleport(20, -20); window.__dead.look(-2.5, 0.02); });
await new Promise((r) => setTimeout(r, 1200)); await page.screenshot({ path: `${OUT}/f2-crucible.png` });
console.log('errors', JSON.stringify(errs.slice(0, 4)));
await browser.close();
