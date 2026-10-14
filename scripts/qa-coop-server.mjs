#!/usr/bin/env node
/**
 * Server-hosted co-op end to end in real headless Chrome: the game server runs the session (a worker thread) and two
 * players plus a hidden admin are equal clients. Needs the sim built (`pnpm build:sim`) and both servers running:
 *   DEV_LOGIN=1 ADMIN_IDS=9000000009 DB_FILE=/tmp/coop.db pnpm server      (port 3061)
 *   pnpm dev                                                               (QA_URL, default http://127.0.0.1:5173/)
 */
import { chromium } from 'playwright-core';
import { CHROME } from './lib/browser.mjs';

const URL = (process.env.QA_URL || 'http://127.0.0.1:5173/').replace(/\/$/, '');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function client(id, name, query = '') {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${URL}/auth/dev?id=${id}&name=${name}`);
  await page.goto(`${URL}/${query}`);
  await page.waitForFunction(() => window.__dead && window.__dead.game.state === 'title', null, { timeout: 120000 });
  return page;
}
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const lobbyText = (page) => page.evaluate(() => document.querySelector('.ds-lobby')?.innerText.replace(/\n/g, ' | ') ?? '');

try {
  const owner = await client('5000000001', 'Owner');
  await owner.evaluate(() => [...document.querySelectorAll('.modes button')].find((b) => b.textContent === 'CO-OP').click());
  check('the lobby shows your ping before you create anything', await until(owner, () => /YOUR PING[\s|]*\d+ ms/i.test(document.querySelector('.ds-lobby').innerText)), await lobbyText(owner));
  check('server hosting is the default choice', await owner.evaluate(() => [...document.querySelectorAll('.ds-lobby button.on')].some((b) => b.textContent === 'SERVER HOSTED')));
  await owner.evaluate(() => [...document.querySelectorAll('.ds-lobby button')].find((b) => b.textContent === 'CREATE SESSION').click());
  await until(owner, () => window.__dead.game.coop.room.room !== null);
  const room = await owner.evaluate(() => window.__dead.game.coop.room.room);
  check('the session is server-hosted: the server is the host, the creator owns it', room.hosting === 'server' && room.hostId === 'sim' && room.ownerId === '5000000001', JSON.stringify({ hosting: room.hosting, hostId: room.hostId, ownerId: room.ownerId }));

  const guest = await client('5000000002', 'Guest', `?room=${room.code}`);
  await guest.evaluate(() => [...document.querySelectorAll('.ds-lobby button')].find((b) => b.textContent === 'JOIN').click());
  check('both players are listed with a ping', await until(owner, () => document.querySelectorAll('.ds-lobby .person .ping').length >= 2 && [...document.querySelectorAll('.ds-lobby .person .ping')].every((p) => /\d+ ms/.test(p.textContent)), null, 20000), await lobbyText(owner));
  check('the guest is told who will start it', /Waiting for Owner/i.test(await lobbyText(guest)));

  await owner.evaluate(() => {
    window.__dead.game.coop.start();
    window.__dead.start();
  });
  await until(guest, () => window.__dead.game.coop.canDeploy);
  await guest.evaluate(() => window.__dead.start());
  // a long test: nobody should die of standing around while the browsers load
  for (const pg of [owner, guest]) await pg.evaluate(() => window.__dead.setHealth(1e6, 100));
  check('nobody plays host: both are clients of the server', (await owner.evaluate(() => window.__dead.game.coop.role)) === 'guest' && (await guest.evaluate(() => window.__dead.game.coop.role)) === 'guest');

  const admin = await client('9000000009', 'Boss', `?room=${room.code}&watch=admin`);
  await until(admin, () => window.__dead.game.coop.canDeploy);
  await admin.evaluate(() => window.__dead.start());

  check('the server starts wave 1 and both see the same infected', (await until(owner, () => { const g = window.__dead.game; return g.coop.waves.n === 1 && g.zombies.zombies.length >= 3 && g.zombies.zombies.every((z) => z.puppet); }, null, 45000)) && (await until(guest, () => window.__dead.game.zombies.zombies.length >= 3)));
  check('the hidden admin watches the server session', await until(admin, () => window.__dead.game.zombies.zombies.length >= 3 && window.__dead.game.coop.scoreboard().rows.length === 2));

  const before = await guest.evaluate(() => ({ kills: window.__dead.game.session.stats.kills, cash: window.__dead.game.session.inv.cash }));
  await guest.evaluate(() => { const g = window.__dead.game; const z = g.zombies.zombies.find((q) => q.alive); g.zombies.damage(z, 590, true, g.zenv, 0); });
  check('a hit is decided by the server and the shooter is paid', await until(guest, (b) => { const s = window.__dead.game.session; return s.stats.kills === b.kills + 1 && s.inv.cash > b.cash; }, before));

  const hurt = await until(owner, () => {
    const g = window.__dead.game;
    const z = g.zombies.zombies.find((q) => q.alive);
    if (z && Math.hypot(z.x - g.player.x, z.z - g.player.z) > 3) g.player.teleport(z.x + 1.2, z.z);
    return g.session.vitals.health < 1e6 || g.session.vitals.armor < 100;
  }, null, 45000);
  check('the server\'s infected hurt a player', hurt);
  await owner.evaluate(() => window.__dead.setHealth(1e6, 100));

  // the relay, run by the server for the squad
  const relay = await guest.evaluate(() => { const g = window.__dead.game; const c = g.mission.transmitterPos(); g.player.teleport(c.x, c.z + 1.2); return { x: g.level.data.defense.x, z: g.level.data.defense.z }; });
  await new Promise((r) => setTimeout(r, 400));
  await guest.evaluate(() => window.__dead.game.mission.activateTransmitter());
  check('a player starts the relay and the server runs it for both', (await until(owner, () => window.__dead.game.session.defense.status === 'active')) && (await until(guest, () => window.__dead.game.session.defense.status === 'active')));
  await guest.evaluate((r) => { window.__dead.game.player.teleport(r.x + 2, r.z + 2); window.__dead.setHealth(1e6, 100); }, relay);
  check('it fills while one of them is in the zone', await until(owner, () => window.__dead.game.session.defense.progress > 0.02, null, 15000));

  const scores = await owner.evaluate(() => window.__dead.game.coop.scoreboard().rows.map((r) => r.ping));
  check('the scoreboard carries everyone\'s ping', scores.length === 2 && scores.every((p) => typeof p === 'number'), JSON.stringify(scores));

  // the owner leaves: the session carries on and the other player owns it
  const waveBefore = await guest.evaluate(() => window.__dead.game.coop.waves.n);
  await owner.evaluate(() => window.__dead.game.coop.leave());
  check('the owner leaving does not end a server-hosted session', await until(guest, () => window.__dead.game.coop.room.room !== null && window.__dead.game.coop.room.isOwner, null, 10000));
  check('the game keeps running for those still in it', await until(guest, (w) => { const g = window.__dead.game; return g.coop.live && g.coop.waves.n >= w && g.zombies.zombies.length > 0; }, waveBefore));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  check('script ran to the end', false, err.stack || err.message);
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
