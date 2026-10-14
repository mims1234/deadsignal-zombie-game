#!/usr/bin/env node
/**
 * Co-op end to end in real headless Chrome: an owner, a guest and a hidden admin run the story operation together,
 * then a Forge session and a free-roam session. HOSTING=server (default) or self picks who runs the simulation.
 * Needs the sim built (`pnpm build:sim`) and both servers running:
 *   DEV_LOGIN=1 ADMIN_IDS=9000000009 DB_FILE=/tmp/coop.db pnpm server      (port 3061)
 *   pnpm dev                                                               (QA_URL, default http://127.0.0.1:5173/)
 */
import { chromium } from 'playwright-core';
import { CHROME, sleep } from './lib/browser.mjs';

const URL = (process.env.QA_URL || 'http://127.0.0.1:5173/').replace(/\/$/, '');
const HOSTING = process.env.HOSTING === 'self' ? 'self' : 'server';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${HOSTING}] ${name}${detail ? '  -> ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function client(id, name, { query = '', map = 'district' } = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.addInitScript((m) => {
    if (!sessionStorage.getItem('qa-map')) {
      localStorage.setItem('deadsignal.map.v1', m);
      sessionStorage.setItem('qa-map', '1');
    }
    localStorage.setItem('deadsignal.mode.v1', 'standard');
  }, map);
  await page.goto(`${URL}/auth/dev?id=${id}&name=${name}`);
  await page.goto(`${URL}/${query}`);
  // on the title screen, or already brought into a live session it was invited to
  await page.waitForFunction(() => window.__dead && (window.__dead.game.state === 'title' || window.__dead.game.coop.live), null, { timeout: 150000 });
  return page;
}
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 250 }).then(() => true, () => false);
const lobby = (page) => page.evaluate(() => document.querySelector('.ds-lobby')?.innerText.replace(/\n/g, ' | ') ?? '');
// lobby buttons first: the title screen has its own STANDARD / STANDARD MAZOKU / FREE ROAM row
const click = (page, label) => page.evaluate((l) => ([...document.querySelectorAll('.ds-lobby button')].find((b) => b.textContent === l) ?? [...document.querySelectorAll('.modes button')].find((b) => b.textContent === l))?.click(), label);
const keepAlive = (page) => page.evaluate(() => window.__dead.setHealth(1e6, 100));

/** Open a session as the owner and bring a guest in through the invite link. */
async function session(ownerId, guestId, map, kind) {
  const owner = await client(ownerId, 'Owner', { map });
  await click(owner, 'CO-OP');
  await until(owner, () => !document.querySelector('.ds-lobby').hidden);
  if (HOSTING === 'self') await click(owner, 'SELF HOST');
  await click(owner, 'CREATE SESSION');
  await until(owner, () => window.__dead.game.coop.room.room !== null);
  const code = await owner.evaluate(() => window.__dead.game.coop.room.room.code);
  if (kind !== 'mission') {
    await click(owner, kind === 'roam' ? 'FREE ROAM' : 'STANDARD MAZOKU');
    await until(owner, (k) => window.__dead.game.coop.room.room.kind === k, kind);
  }
  // the guest starts on the District whatever the session plays: the link takes them to the right map
  const guest = await client(guestId, 'Guest', { query: `?room=${code}` });
  await click(guest, 'JOIN');
  await until(owner, () => window.__dead.game.coop.room.room.players.length === 2);
  return { owner, guest, code };
}

const autoJoined = [];
async function deployBoth(owner, guest) {
  await owner.evaluate(() => {
    window.__dead.game.coop.start();
    window.__dead.start();
  });
  await until(guest, () => window.__dead.game.coop.canDeploy);
  // the guest is brought in when the owner starts (paused, one click from the mouse) - no button to find
  autoJoined.push(await until(guest, () => window.__dead.game.state === 'paused' && window.__dead.game.coop.live, null, 15000));
  await guest.evaluate(() => window.__dead.start());
  for (const p of [owner, guest]) await keepAlive(p);
}

try {
  // ---------------------------------------------------------------------------------------------
  // the District, Standard
  // ---------------------------------------------------------------------------------------------
  const { owner, guest, code } = await session('6100000001', '6100000002', 'district', 'mission');
  check('the lobby shows the mode and map, and pings', /MODE \/\/ THE DISTRICT/i.test(await lobby(owner)) && (await until(owner, () => [...document.querySelectorAll('.ds-lobby .person .ping')].every((p) => /\d+ ms/.test(p.textContent)), null, 15000)), await lobby(owner));
  await click(owner, 'STANDARD MAZOKU');
  check('the owner switches the mode and the guest sees it', await until(guest, () => window.__dead.game.coop.room.room.kind === 'mazoku'));
  await click(owner, 'STANDARD');
  await until(guest, () => window.__dead.game.coop.room.room.kind === 'mission');
  await click(owner, 'HARD');
  await click(owner, 'VETERAN');
  check('the owner sets the difficulty and the guest sees it', (await until(guest, () => { const r = window.__dead.game.coop.room.room; return r.zombies === 'hard' && r.team === 'veteran'; })) && /INFECTED\s*HARD/i.test((await lobby(guest)).replace(/\|/g, ' ')), await lobby(guest));
  await click(owner, 'NORMAL');
  await click(owner, 'REGULAR');
  await until(guest, () => window.__dead.game.coop.room.room.zombies === 'normal' && window.__dead.game.coop.room.room.team === 'regular');
  await deployBoth(owner, guest);
  const roles = [await owner.evaluate(() => window.__dead.game.coop.role), await guest.evaluate(() => window.__dead.game.coop.role)];
  check('roles', roles[1] === 'guest' && roles[0] === (HOSTING === 'self' ? 'host' : 'guest'), roles.join(' / '));

  const admin = await client('9000000009', 'Boss', { query: `?room=${code}&watch=admin` });
  await until(admin, () => window.__dead.game.coop.canDeploy);
  await admin.evaluate(() => window.__dead.start());

  check('both see the district\'s infected as puppets', (await until(owner, () => { const z = window.__dead.game.zombies.zombies; return z.length >= 3 && z.every((q) => q.puppet); }, null, 40000)) && (await until(guest, () => window.__dead.game.zombies.zombies.length >= 3, null, 40000)));
  check('the hidden admin watches it', await until(admin, () => window.__dead.game.zombies.zombies.length >= 3 && window.__dead.game.coop.scoreboard().rows.length === 2));
  check('a guest is brought into the session when the owner starts it', autoJoined[0] === true);
  // a third player joins the running session by its code: they land in it straight away
  const late = await client('6100000003', 'Late', { query: `?room=${code}` });
  await click(late, 'JOIN');
  check('a player who joins a running session is brought into it', await until(late, () => { const g = window.__dead.game; return g.coop.role === 'guest' && g.coop.live && (g.state === 'paused' || g.state === 'playing'); }, null, 40000), await late.evaluate(() => `${window.__dead.game.state} ${window.__dead.game.coop.role}`));
  check('and the squad sees them', await until(owner, () => window.__dead.game.coop.scoreboard().rows.length === 3, null, 20000));
  await late.context().close();
  await until(owner, () => window.__dead.game.coop.scoreboard().rows.length === 2, null, 20000);
  await guest.evaluate(() => {
    const a = window.__dead.game.audio;
    const play = a.play.bind(a);
    window.__heard = [];
    a.play = (id, o) => (/^(zombie|warden)_/.test(id) && window.__heard.push(id), play(id, o));
  });
  // the owner switches to the pistol and fires: the guest sees the pistol in both hands, and the shot
  await until(guest, () => window.__dead.game.coop.avatars.size > 0);
  await guest.evaluate(() => { const a = [...window.__dead.game.coop.avatars.values()][0]; const f = a.fire.bind(a); window.__fired = 0; a.fire = (t) => (window.__fired++, f(t)); });
  await owner.evaluate(() => { const g = window.__dead.game; g.session.inv.activeSlot = g.session.inv.slots.findIndex((c) => c && c.id === 'pistol'); g.session.stats.shotsFired += 1; });
  check('a teammate is drawn with the weapon they hold, and fires', await until(guest, () => { const a = [...window.__dead.game.coop.avatars.values()][0]; return !!a && a.weapon === 'pistol' && window.__fired > 0; }, null, 8000), JSON.stringify(await guest.evaluate(() => { const a = [...window.__dead.game.coop.avatars.values()][0]; return a && { w: a.weapon, aimT: a.aimT }; })));
  check('the guest hears the infected (groans, snarls)', await until(guest, () => window.__heard.length > 0, null, 20000), JSON.stringify(await guest.evaluate(() => window.__heard.slice(0, 6))));
  const hud = await guest.evaluate(() => document.querySelector('.ds-obj')?.innerText.replace(/\n/g, ' | ') ?? '');
  check('the guest HUD shows the operation and the squad', /RESTORE THE RELAY/i.test(hud) && /ELIMINATE THE WARDEN/i.test(hud) && /SQUAD/i.test(hud) && /Owner/i.test(hud), hud);
  check('the operation clock runs from the simulation', await until(guest, () => window.__dead.game.session.elapsed > 2, null, 20000));

  // a kill, credited to the shooter
  const before = await guest.evaluate(() => ({ kills: window.__dead.game.session.stats.kills, cash: window.__dead.game.session.inv.cash }));
  await guest.evaluate(() => { const g = window.__dead.game; const z = g.zombies.zombies.find((q) => q.alive && !q.isBoss); g.zombies.damage(z, 590, true, g.zenv, 0); });
  check('a guest\'s hit kills on the simulation and the guest is paid', await until(guest, (b) => { const s = window.__dead.game.session; return s.stats.kills === b.kills + 1 && s.inv.cash > b.cash; }, before));

  // infected attack a player
  const hurt = await until(owner, () => {
    const g = window.__dead.game;
    const z = g.zombies.zombies.find((q) => q.alive && !q.isBoss);
    if (z && Math.hypot(z.x - g.player.x, z.z - g.player.z) > 2.5) g.player.teleport(z.x + 1.2, z.z);
    return g.session.vitals.health < 1e6 || g.session.vitals.armor < 100;
  }, null, 45000);
  check('the simulation\'s infected hurt a player', hurt);
  await owner.evaluate(() => { const g = window.__dead.game; g.player.teleport(g.level.data.playerStart.x, g.level.data.playerStart.z); window.__dead.setHealth(1e6, 100); });

  // revive
  await guest.evaluate(() => { const g = window.__dead.game; window.__dead.setHealth(1, 0); g.hurtPlayer(9999, null, null, {}); });
  check('a downed player stays in the run, bleeding out', (await guest.evaluate(() => window.__dead.game.coop.life)) === 2 && (await guest.evaluate(() => window.__dead.game.state)) === 'playing');
  check('the teammate sees them down', await until(owner, () => window.__dead.game.coop.scoreboard().rows.some((r) => !r.you && r.status === 'down')));
  const gp = await guest.evaluate(() => ({ x: window.__dead.game.player.x, z: window.__dead.game.player.z }));
  await owner.evaluate((p) => window.__dead.game.player.teleport(p.x + 1, p.z), gp);
  await sleep(500);
  check('the revive prompt appears next to them', await until(owner, () => !!window.__dead.game.coop.reviveTarget()));
  await owner.evaluate(() => { const c = window.__dead.game.coop; c.revive(c.reviveTarget().id); });
  check('the revive brings them back up', await until(guest, () => window.__dead.game.coop.life === 1 && window.__dead.game.playerAlive()));
  await guest.evaluate(() => window.__dead.setHealth(1e6, 100));

  // the relay
  const relay = await guest.evaluate(() => { const g = window.__dead.game; const c = g.mission.transmitterPos(); g.player.teleport(c.x, c.z + 1.2); return { x: g.level.data.defense.x, z: g.level.data.defense.z }; });
  await sleep(500);
  await guest.evaluate(() => window.__dead.game.mission.activateTransmitter());
  check('the relay starts for the squad', (await until(owner, () => window.__dead.game.session.defense.status === 'active')) && (await until(guest, () => window.__dead.game.session.defense.status === 'active')));
  await guest.evaluate((r) => window.__dead.game.player.teleport(r.x + 2, r.z + 2), relay);
  const cash0 = await owner.evaluate(() => window.__dead.game.session.inv.cash);
  const done = await until(guest, () => { window.__dead.setHealth(1e6, 100); return window.__dead.game.session.defense.status === 'complete'; }, null, 90000);
  check('holding the zone completes it', done);
  check('and everyone is paid once', await until(owner, (c) => window.__dead.game.session.defense.rewardClaimed && window.__dead.game.session.inv.cash >= c + 1200, cash0));

  // the boss
  await owner.evaluate(() => { const g = window.__dead.game; const b = g.level.data.hunt; g.player.teleport(b.wardenX + 6, b.wardenZ + 6); window.__dead.setHealth(1e6, 100); });
  const sawBoss = await until(owner, () => { const b = window.__dead.game.zombies.zombies.find((z) => z.type === 'warden' && z.alive); return !!b; }, null, 30000);
  check('the Warden shows up as the squad nears him', sawBoss);
  for (let i = 0; i < 12; i++) {
    await owner.evaluate(() => { const g = window.__dead.game; const b = g.zombies.zombies.find((z) => z.type === 'warden' && z.alive); if (b) g.zombies.damage(b, 600, true, g.zenv, 0); window.__dead.setHealth(1e6, 100); });
    await sleep(250);
  }
  check('killing him completes the hunt for both', (await until(owner, () => window.__dead.game.session.hunt.status === 'complete', null, 20000)) && (await until(guest, () => window.__dead.game.session.hunt.status === 'complete', null, 20000)));
  check('the extraction opens', await until(guest, () => window.__dead.game.session.extraction.phase === 'available', null, 15000));

  // extraction: call, wait for the bird, board
  const ex = await owner.evaluate(() => { const g = window.__dead.game; const e = g.level.data.extraction; g.player.teleport(e.terminalX - 1.2, e.terminalZ); return e; });
  await sleep(500);
  await owner.evaluate(() => window.__dead.game.mission.callExtraction());
  check('the owner calls the helicopter from the radio', await until(guest, () => window.__dead.game.session.extraction.phase === 'called', null, 10000));
  for (const p of [owner, guest]) await p.evaluate((e) => { window.__dead.game.player.teleport(e.heliX + 3, e.heliZ + 3); window.__dead.setHealth(1e6, 100); }, ex);
  const landed = await until(guest, () => { window.__dead.setHealth(1e6, 100); return window.__dead.game.session.extraction.phase === 'landed'; }, null, 90000);
  await owner.evaluate(() => window.__dead.setHealth(1e6, 100));
  check('the helicopter lands for everyone', landed && (await owner.evaluate(() => window.__dead.game.session.extraction.phase)) === 'landed');
  await guest.evaluate(() => { const g = window.__dead.game; const d = g.mission.heliDoorPos(); g.player.teleport(d.x, d.z); });
  await sleep(400);
  await guest.evaluate(() => window.__dead.game.mission.board());
  check('a player boards on their own', await until(guest, () => window.__dead.game.coop.life === 4 && window.__dead.game.state === 'ending'));
  await owner.evaluate(() => { const g = window.__dead.game; const d = g.mission.heliDoorPos(); g.player.teleport(d.x, d.z); });
  await sleep(400);
  await owner.evaluate(() => window.__dead.game.mission.board());
  const wonBoth = (await until(owner, () => window.__dead.game.state === 'results', null, 15000)) && (await until(guest, () => window.__dead.game.state === 'results', null, 15000));
  const res = await guest.evaluate(() => document.querySelector('.ds-results, .results, [class*=result]')?.innerText.slice(0, 120) ?? '');
  check('everyone aboard: extracted, both see the results', wonBoth && /EXTRACT|SUCCESS|COMPLETE/i.test(res), res.replace(/\n/g, ' '));
  for (const p of [owner, guest, admin]) await p.context().close();

  // ---------------------------------------------------------------------------------------------
  // the Forge: the squad, cages and embers in co-op
  // ---------------------------------------------------------------------------------------------
  const f = await session('6100000003', '6100000004', 'forge', 'mission');
  check('a District player following a Forge invite lands on the Forge', (await f.guest.evaluate(() => window.__dead.game.mapId)) === 'forge');
  await deployBoth(f.owner, f.guest);
  check('the Forge squad and cages appear for the guest', await until(f.guest, () => { const s = window.__dead.squad(); return s.filter((a) => a.kind === 'soldier').length === 2 && s.filter((a) => a.kind === 'survivor' && a.trapped).length === 4; }, null, 30000));
  const cage = await f.guest.evaluate(() => window.__dead.squad().find((a) => a.trapped && a.x !== 0));
  await f.guest.evaluate((c) => { window.__dead.game.player.teleport(c.x, c.z - 2.2); window.__dead.setHealth(1e6, 100); }, cage);
  await sleep(500);
  await f.guest.evaluate((c) => window.__dead.game.squad.rescue(c.name), cage);
  check('freeing a survivor frees them for both', (await until(f.owner, (n) => window.__dead.squad().some((a) => a.name === n && !a.trapped), cage.name)) && (await until(f.guest, (n) => window.__dead.squad().some((a) => a.name === n && !a.trapped), cage.name)));
  const tagged = await until(f.guest, () => window.__dead.game.zombies.zombies.some((z) => z.tag), null, 30000);
  check('Vulcan\'s named infected carry their names to the guest', tagged);
  for (const p of [f.owner, f.guest]) await p.context().close();

  // ---------------------------------------------------------------------------------------------
  // free roam
  // ---------------------------------------------------------------------------------------------
  const r = await session('6100000005', '6100000006', 'district', 'roam');
  await deployBoth(r.owner, r.guest);
  await r.owner.evaluate(() => { window.__dead.game.player.y = 20; });
  check('free roam: no infected, flying, and each sees the other', (await until(r.guest, () => window.__dead.game.flying && window.__dead.game.zombies.zombies.length === 0 && window.__dead.game.coop.scoreboard().rows.length === 2, null, 20000)));
  for (const p of [r.owner, r.guest]) await p.context().close();

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  check('script ran to the end', false, err.stack || err.message);
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
