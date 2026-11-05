#!/usr/bin/env node
/**
 * The Sakura District in co-op, end to end in real headless Chrome: an owner and a guest play the operation and KAIKA
 * together. Checks that one player's work is the other's (the metro's power, the keycard opening the lab's stairs),
 * that each hears the story on their own voice director without a pile-up, and that the dead keep coming.
 * Needs the sim built (`pnpm build:sim`) and both servers running:
 *   DEV_LOGIN=1 ADMIN_IDS=9000000009 DB_FILE=/tmp/coop.db pnpm server      (port 3061)
 *   pnpm dev                                                               (QA_URL, default http://127.0.0.1:5173/)
 */
import { chromium } from 'playwright-core';
import { ANGLE, CHROME, sleep } from './lib/browser.mjs';

const URL = (process.env.QA_URL || 'http://127.0.0.1:5173/').replace(/\/$/, '');
const HOSTING = process.env.HOSTING === 'self' ? 'self' : 'server';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${HOSTING}] ${name}${detail ? '  -> ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [...ANGLE, '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
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
const lobbyShown = () => document.querySelector('.ds-lobby')?.hidden === false;
/** The title's side menu WITH FRIENDS puts it in co-op; its OPEN LOBBY button opens the lobby if that did not. */
async function openLobby(page) {
  const press = (l) => page.evaluate((l) => [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.trim() === l)?.click(), l);
  await press('WITH FRIENDS');
  if (!(await until(page, lobbyShown, null, 3000))) await press('OPEN LOBBY');
  if (!(await until(page, lobbyShown))) throw new Error('the co-op lobby did not open from WITH FRIENDS / OPEN LOBBY');
}

/** Wait out the reload onto the session's map: settled once the page has stayed on it for a moment. */
async function settle(page, map) {
  const on = (m) => window.__dead?.game?.mapId === m && (window.__dead.game.state === 'title' || window.__dead.game.coop.live);
  for (let i = 0; i < 10; i++) {
    if (await until(page, on, map, 15000)) {
      await sleep(1000);
      if (await until(page, on, map, 1000)) return;
    }
  }
  throw new Error(`the guest never settled on ${map}: ${JSON.stringify(await page.evaluate(() => ({ map: window.__dead?.game?.mapId, state: window.__dead?.game?.state, live: window.__dead?.game?.coop?.live, url: location.href, loading: document.querySelector('.ds-loading')?.innerText })).catch((e) => e.message))}`);
}

/** Open a session as the owner and bring a guest in through the invite link. */
async function session(ownerId, guestId, map, kind) {
  const owner = await client(ownerId, 'Owner', { map });
  await openLobby(owner);
  if (HOSTING === 'self') await click(owner, 'SELF HOST');
  await click(owner, 'CREATE SESSION');
  await until(owner, () => window.__dead.game.coop.room.room !== null);
  const code = await owner.evaluate(() => window.__dead.game.coop.room.room.code);
  if (kind !== 'mission') {
    // free roam is a switch on top of the mode in the lobby
    await click(owner, kind === 'roam' ? 'FREE ROAM  OFF' : 'STANDARD MAZOKU');
    if (!(await until(owner, (k) => window.__dead.game.coop.room.room.kind === k, kind, 10000))) throw new Error(`the lobby did not switch the session to ${kind}`);
  }
  // the guest starts on the District whatever the session plays: the link takes them to the right map (a reload)
  const guest = await client(guestId, 'Guest', { query: `?room=${code}` });
  await settle(guest, map);
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


const lines = (page) => page.evaluate(() => [...window.__dead.game.sakura.voice.said]);
const view = (page) => page.evaluate(() => { const s = window.__dead.game.sakura; return { marks: s.view.marks, found: s.view.found, phase: s.view.phase, lab: s.h.theatre.labLink.closed }; });
try {
  // the Sakura District starts admin only on a fresh server: put it live (the dev login's admin), as the real site has it
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${URL}/auth/dev?id=100000000000000001&name=Admin`);
    const r = await p.evaluate(async () => (await fetch('/api/admin/maps/sakura', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DS': '1' }, body: JSON.stringify({ public: true }) })).json());
    check('the Sakura District is live on the test server', r.public === true, JSON.stringify(r));
    await ctx.close();
  }
  for (const kind of ['mission', 'mazoku']) {
    const { owner, guest } = await session(kind === 'mission' ? '6200000001' : '6200000003', kind === 'mission' ? '6200000002' : '6200000004', 'sakura', 'mission');
    // the session is KAIKA whatever its kind: the lobby says so; the card hunt rides on top of it
    check(`${kind}: the lobby calls the session KAIKA`, (await lobby(owner)).includes('KAIKA'), await lobby(owner));
    if (kind === 'mazoku') {
      await click(owner, 'STANDARD MAZOKU');
      check('the lobby switches on the card hunt and the guest sees it', await until(guest, () => window.__dead.game.coop.room.room.kind === 'mazoku', null, 10000));
    }
    await deployBoth(owner, guest);
    await sleep(3000);
    // the owner takes the fuses, from beside each cabinet
    const fz = await owner.evaluate(() => JSON.parse(JSON.stringify(window.__dead.game.sakura.spots.fuses)));
    for (let i = 0; i < 3; i++) {
      const f = fz[i];
      await owner.evaluate(([x, y, z]) => { window.__dead.teleport(x, z, undefined, y); }, [f.x, f.y - 1.4 > 0.5 ? f.y - 1.4 : 0, f.z]);
      await sleep(700);
      await owner.evaluate((i) => window.__dead.game.sakura.act('fuse', i), i);
      await sleep(500);
    }
    check(`${kind}: the owner puts the metro's power back and the guest's view has it`, await until(guest, () => (window.__dead.game.sakura.view.marks & 0b1110) === 0b1110, null, 10000), JSON.stringify(await view(guest)));
    // the guest takes the keycard; the lab's stairs open for both
    const k = await guest.evaluate(() => window.__dead.game.sakura.spots.key);
    await guest.evaluate(([x, z]) => window.__dead.teleport(x, z + 0.5), [k.x, k.z]);
    await sleep(800);
    await guest.evaluate(() => window.__dead.game.sakura.act('key', 0));
    check(`${kind}: the guest takes the keycard and the owner's lab stairs open`, await until(owner, () => !window.__dead.game.sakura.h.theatre.labLink.closed, null, 10000), JSON.stringify(await view(owner)));
    // the lines: both hear the station wake and the keycard (each on their own director), and nobody's queue piles up
    await sleep(75000);
    const lo = await lines(owner);
    const lg = await lines(guest);
    check(`${kind}: both hear the station's announcement and the keycard`, ['pa_delay_en', 'hana_key'].every((id) => lo.includes(id) && lg.includes(id)), `owner ${lo.join(',')} | guest ${lg.join(',')}`);
    const q = await Promise.all([owner, guest].map((p) => p.evaluate(() => window.__dead.game.sakura.voice.pending)));
    const waiting = await owner.evaluate(() => { const v = window.__dead.game.sakura.voice; return { t: Math.round(v.t), busy: Math.round(v.busyUntil), q: v.queue.map((r) => `${r.id ?? r.text.slice(0, 20)}:${r.kind}@${Math.round(r.at)}`) }; });
    check(`${kind}: no pile-up of lines`, q.every((n) => n <= 5), `${JSON.stringify(q)} owner ${JSON.stringify(waiting)}`);
    const hunting = await owner.evaluate(() => window.__dead.game.zombies.zombies.filter((z) => z.alive && z.chasing).length);
    check(`${kind}: the dead are coming`, hunting > 0, String(hunting));
    check(`${kind}: KAIKA's chapter moved on for the guest too`, await guest.evaluate(() => window.__dead.game.sakura.chapter >= 1), String(await guest.evaluate(() => window.__dead.game.sakura.chapter)));
    for (const p of [owner, guest]) await p.context().close();
  }
} catch (e) {
  check('ran to the end', false, e.message);
} finally {
  if (errors.length) console.log('page errors: ' + errors.join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
