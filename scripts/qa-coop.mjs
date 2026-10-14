#!/usr/bin/env node
/**
 * Co-op end to end in real headless Chrome: a host, a guest and a hidden admin spectator, three separate browser
 * sessions against the dev stack. Needs both running:
 *   DEV_LOGIN=1 ADMIN_IDS=9000000009 DB_FILE=/tmp/coop.db pnpm server      (port 3061)
 *   pnpm dev                                                               (QA_URL, default http://127.0.0.1:5173/)
 * Usage: node scripts/qa-coop.mjs [--shots dir]
 */
import { chromium } from 'playwright-core';
import { CHROME, sleep } from './lib/browser.mjs';

const URL = (process.env.QA_URL || 'http://127.0.0.1:5173/').replace(/\/$/, '');
const args = process.argv.slice(2);
const shotDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
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

const host = await client('4000000001', 'Hosty');
await host.evaluate(() => [...document.querySelectorAll('.modes button')].find((b) => b.textContent === 'CO-OP').click());
check('choosing CO-OP opens the lobby', await host.evaluate(() => !document.querySelector('.ds-lobby').hidden));
await host.evaluate(() => [...document.querySelectorAll('.ds-lobby button')].find((b) => b.textContent === 'CREATE SESSION').click());
await until(host, () => window.__dead.game.coop.room.room !== null);
const code = await host.evaluate(() => window.__dead.game.coop.room.room.code);
check('the host creates a session', /^[A-Z0-9]{6}$/.test(code), code);

const guest = await client('4000000002', 'Guesty', `?room=${code}`);
check('an invite link opens the lobby with the code filled in', await guest.evaluate(() => document.querySelector('.ds-lobby input.code')?.value) === code);
await guest.evaluate(() => [...document.querySelectorAll('.ds-lobby button')].find((b) => b.textContent === 'JOIN').click());
await until(host, () => window.__dead.game.coop.room.room.players.length === 2);
check('the guest joins and both lobbies list two players', await until(guest, () => window.__dead.game.coop.room.room?.players.length === 2));
check('the guest waits for the host', await guest.evaluate(() => document.querySelector('.ds-lobby .wait') !== null));
if (shotDir) await host.screenshot({ path: `${shotDir}/coop-1-lobby.png` });

// start: host first, then the guest deploys into the started session
await host.evaluate(() => { const g = window.__dead.game; g.coop.start(); window.__dead.start(); });
await until(guest, () => window.__dead.game.coop.canDeploy);
await guest.evaluate(() => window.__dead.start());
check('both are playing with the right roles', (await host.evaluate(() => window.__dead.game.coop.role)) === 'host' && (await guest.evaluate(() => window.__dead.game.coop.role)) === 'guest');

// the hidden admin
const admin = await client('9000000009', 'Boss', `?room=${code}&watch=admin`);
await until(admin, () => window.__dead.game.coop.canDeploy);
await admin.evaluate(() => window.__dead.start());
check('the admin is in as an unseen spectator', await admin.evaluate(() => window.__dead.game.coop.role === 'spectator' && window.__dead.game.coop.room.you.hidden));

// wave 1 arrives on its own
check('wave 1 starts and the host spawns infected', await until(host, () => { const g = window.__dead.game; return g.coop.waves.n === 1 && g.zombies.aliveCount >= 3; }, null, 40000));
check('the guest sees the same infected as puppets', await until(guest, () => { const g = window.__dead.game; return g.zombies.zombies.length >= 3 && g.zombies.zombies.every((z) => z.puppet); }));
check('the guest sees the host as a player, and the host sees the guest', (await until(guest, () => window.__dead.game.coop.scoreboard().rows.length === 2)) && (await until(host, () => window.__dead.game.coop.scoreboard().rows.some((r) => !r.you && r.alive))));
check('the hidden admin sees both players and the infected', await until(admin, () => { const g = window.__dead.game; return g.coop.scoreboard().rows.length === 2 && g.zombies.zombies.length >= 3; }));
check('nobody is told about the admin', (await host.evaluate(() => JSON.stringify(window.__dead.game.coop.scoreboard()) + JSON.stringify(window.__dead.game.coop.room.room))).includes('Boss') === false);
const hud = await guest.evaluate(() => document.querySelector('.ds-obj')?.innerText.replace(/\n/g, ' | '));
check('the guest HUD shows the wave and the squad', /WAVE 1/.test(hud || '') && /Hosty/.test(hud || ''), hud);

// a guest's shot kills on the host, and the guest is paid
const before = await guest.evaluate(() => ({ kills: window.__dead.game.session.stats.kills, cash: window.__dead.game.session.inv.cash }));
await guest.evaluate(() => { const g = window.__dead.game; const z = g.zombies.zombies.find((q) => q.alive); g.zombies.damage(z, 590, true, g.zenv, 0); });
check('a guest hit kills the infected on the host and pays the guest', await until(guest, (b) => { const s = window.__dead.game.session; return s.stats.kills === b.kills + 1 && s.inv.cash > b.cash; }, before));
check('the host scoreboard credits the guest, not the host', await host.evaluate(() => { const r = window.__dead.game.coop.scoreboard().rows; return r.find((x) => !x.you).kills === 1 && r.find((x) => x.you).kills === 0; }));

// infected hunt the guest and hurt it through the host
await host.evaluate(() => { const g = window.__dead.game; g.player.teleport(g.level.data.playerStart.x, g.level.data.playerStart.z); window.__dead.setHealth(100, 100); });
const hurt = await until(guest, () => {
  const g = window.__dead.game;
  const z = g.zombies.zombies.find((q) => q.alive);
  if (z && Math.hypot(z.x - g.player.x, z.z - g.player.z) > 3) g.player.teleport(z.x + 1.2, z.z);
  return g.session.vitals.health < 100 || g.session.vitals.armor < 50;
}, null, 45000);
check('an infected on the host attacks the guest and the damage arrives', hurt);
if (shotDir) { await guest.screenshot({ path: `${shotDir}/coop-2-guest.png` }); await admin.screenshot({ path: `${shotDir}/coop-3-admin.png` }); }

// down, then back when the wave is cleared
await guest.evaluate(() => { const g = window.__dead.game; g.session.vitals.armor = 0; g.hurtPlayer(9999, null, null, {}); });
check('a downed guest stays in the session (no results screen)', (await until(host, () => window.__dead.game.coop.scoreboard().rows.some((r) => !r.you && !r.alive))) && (await guest.evaluate(() => window.__dead.game.state)) === 'playing');
await host.evaluate(() => { const g = window.__dead.game; window.__dead.setHealth(100, 100); g.coop.waves.toSpawn = 0; for (const z of g.zombies.zombies) if (z.alive) g.zombies.damage(z, 99999, false, g.zenv, 0); });
check('clearing the wave starts a break', await until(host, () => window.__dead.game.coop.waves.phase === 'break' && window.__dead.game.coop.waves.n === 1));
check('the downed guest is back on their feet', await until(guest, () => window.__dead.game.playerAlive() && window.__dead.game.session.vitals.health === 100));

check('wave 2 starts', await until(host, () => window.__dead.game.coop.waves.n === 2 && window.__dead.game.coop.waves.phase === 'active', null, 40000));

// a wave objective: the host is given a one-core collect objective at the guest's feet
const cashBefore = await guest.evaluate(() => window.__dead.game.session.inv.cash);
const at = await guest.evaluate(() => ({ x: window.__dead.game.player.x, z: window.__dead.game.player.z }));
await host.evaluate((p) => { const c = window.__dead.game.coop; c.elitePending = false; c.mission = { kind: 'collect', status: 'active', progress: 0, x: p.x, z: p.z, radius: 7, items: [{ x: p.x, z: p.z, taken: false }], eliteId: 0, reward: 300 }; }, at);
check('a guest completing the objective pays the whole squad', (await until(guest, (c) => window.__dead.game.session.inv.cash >= c + 300, cashBefore)) && (await until(host, () => window.__dead.game.coop.mission.status === 'done')));
check('the guest HUD shows the objective as complete', await until(guest, () => /RECOVER THE DATA CORES[\s\S]*Complete/.test(document.querySelector('.ds-obj').innerText)));

// a card carrier: spawned by the host, downed and purged by the guest, the card goes to both
await host.evaluate(() => { window.__dead.game.coop.carrierPending = 1; });
check('the carrier appears for the guest as a carrier puppet', await until(guest, () => window.__dead.game.zombies.zombies.some((z) => z.carrierIdx === 2 && z.curable && z.puppet), null, 30000));
await guest.evaluate(() => { const g = window.__dead.game; const z = g.zombies.zombies.find((q) => q.carrierIdx === 2); for (let i = 0; i < 4; i++) g.zombies.damage(z, 590, true, g.zenv, 0); });
check('the guest knocks her down (she is not killed)', await until(guest, () => window.__dead.game.zombies.zombies.find((q) => q.carrierIdx === 2)?.state === 'downed'));
await guest.evaluate(() => { const g = window.__dead.game; const z = g.zombies.zombies.find((q) => q.carrierIdx === 2); g.player.teleport(z.x + 1, z.z); });
check('the guest gets the purge prompt', await until(guest, () => window.__dead.game.cards.cureTarget() !== null));
await sleep(400); // let the host hear where the guest now stands
await guest.evaluate(() => { const g = window.__dead.game; g.cards.cure(g.cards.cureTarget().id); });
check('the purge happens on the host and the card drops', await until(host, () => window.__dead.game.session.carriers.some((c) => c.phase === 'purged')));
const lootAt = await host.evaluate(() => { const g = window.__dead.game; const u = g.cards.units.find((q) => q.state && q.state.phase === 'purged'); return { x: u.loot.position.x, z: u.loot.position.z, id: u.def.id }; });
await guest.evaluate((p) => window.__dead.game.player.teleport(p.x + 0.3, p.z), lootAt);
check('when the guest takes the card, both players get it', (await until(guest, (id) => window.__dead.game.cards.collection().find((c) => c.id === id).count >= 1, lootAt.id)) && (await until(host, (id) => window.__dead.game.cards.collection().find((c) => c.id === id).count >= 1, lootAt.id)));

// everyone down in a wave: lost, for everyone
await guest.evaluate(() => { const g = window.__dead.game; g.session.vitals.armor = 0; g.hurtPlayer(9999, null, null, {}); });
await until(host, () => window.__dead.game.coop.scoreboard().rows.some((r) => !r.you && !r.alive));
await host.evaluate(() => { const g = window.__dead.game; g.session.vitals.armor = 0; g.hurtPlayer(9999, null, null, {}); });
check('with everyone down the session is lost and both see the results', (await until(host, () => window.__dead.game.state === 'results')) && (await until(guest, () => window.__dead.game.state === 'results')));
const res = await guest.evaluate(() => document.querySelector('.ds-results-panel')?.innerText.replace(/\n/g, ' ').slice(0, 90));
check('the results name the wave', /WAVE 2/i.test(res || ''), res);
if (shotDir) await host.screenshot({ path: `${shotDir}/coop-4-results.png` });

// the host leaving ends it for the guest
await host.close();
check('when the host leaves, the guest is returned to the lobby with the reason', await until(guest, () => window.__dead.game.coop.role === 'none' && /host/i.test(document.querySelector('.ds-lobby .problem')?.textContent || '')));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
