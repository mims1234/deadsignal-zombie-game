#!/usr/bin/env node
/**
 * ZARYA in co-op, end to end in real headless Chrome: an owner and a guest play together, and Timur and Vera play
 * beside them as AI squadmates (they never give up their places to players). Checks, on both screens: both squadmates
 * are there and agree in place; the volunteers' lines; empty hands before Nina's rack, guns after; they fire (seen on
 * both clients); a tram ride brings them along with the player they were with; one goes down and the guest helps him up.
 * HOSTING=self (default here: the owner's browser runs the simulation from source) or server (needs `pnpm build:sim`).
 * Needs both servers running:
 *   node --env-file=.claude/dev.env server/index.mjs                         (port 3061, DEV_LOGIN)
 *   pnpm dev                                                                 (QA_URL, default http://127.0.0.1:5183/)
 * Shots in shots/coop-zarya/.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { ANGLE, CHROME, sleep } from './lib/browser.mjs';

const URL = (process.env.QA_URL || 'http://127.0.0.1:5183/').replace(/\/$/, '');
const HOSTING = process.env.HOSTING === 'server' ? 'server' : 'self';
const OUT = 'shots/coop-zarya';
mkdirSync(OUT, { recursive: true });
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
  await page.waitForFunction(() => window.__dead && (window.__dead.game.state === 'title' || window.__dead.game.coop.live), null, { timeout: 240000 });
  return page;
}
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 250 }).then(() => true, () => false);
const click = (page, label) => page.evaluate((l) => ([...document.querySelectorAll('.ds-lobby button')].find((b) => b.textContent === l) ?? [...document.querySelectorAll('.modes button')].find((b) => b.textContent === l))?.click(), label);
const keepAlive = (page) => page.evaluate(() => window.__dead.setHealth(1e6, 100));
const lobbyShown = () => document.querySelector('.ds-lobby')?.hidden === false;
async function openLobby(page) {
  const press = (l) => page.evaluate((l) => [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.trim() === l)?.click(), l);
  await press('WITH FRIENDS');
  if (!(await until(page, lobbyShown, null, 3000))) await press('OPEN LOBBY');
  if (!(await until(page, lobbyShown))) throw new Error('the co-op lobby did not open from WITH FRIENDS / OPEN LOBBY');
}
async function settle(page, map) {
  const on = (m) => window.__dead?.game?.mapId === m && (window.__dead.game.state === 'title' || window.__dead.game.coop.live);
  for (let i = 0; i < 16; i++) {
    if (await until(page, on, map, 15000)) {
      await sleep(1000);
      if (await until(page, on, map, 1000)) return;
    }
  }
  throw new Error(`the guest never settled on ${map}`);
}

/** Both screens' view of the squad: name, place, standing / down, what is in their hands, drawn or not. */
const squadOf = (page) =>
  page.evaluate(() =>
    window.__dead.game.squad.allies
      .filter((a) => a.kind === 'soldier')
      .map((a) => ({ name: a.name, x: Math.round(a.ref.x * 10) / 10, z: Math.round(a.ref.z * 10) / 10, down: a.down > 0, weapon: a.avatar.weapon, visible: a.avatar.root.visible, fallen: a.avatar.fallen })),
  );
const me = (page) => page.evaluate(() => ({ x: window.__dead.game.player.x, z: window.__dead.game.player.z }));
/** Count the squad's shots each screen draws from the simulation's reports. */
const countShots = (page) =>
  page.evaluate(() => {
    const sq = window.__dead.game.squad;
    if (sq.__shots === undefined) {
      sq.__shots = 0;
      const apply = sq.applyRemote.bind(sq);
      sq.applyRemote = (rows, shots) => {
        sq.__shots += shots.length;
        apply(rows, shots);
      };
    }
    return sq.__shots;
  });
/** The owner's simulation (self-hosted). */
const onSim = (page, fn, arg) => page.evaluate(([f, a]) => new Function('sim', 'arg', `return (${f})(sim, arg)`)(window.__dead.game.coop.sim, a), [fn.toString(), arg]);

try {
  const owner = await client('7300000001', 'Owner', { map: 'zarya' });
  await openLobby(owner);
  if (HOSTING === 'self') await click(owner, 'SELF HOST');
  await click(owner, 'CREATE SESSION');
  await until(owner, () => window.__dead.game.coop.room.room !== null);
  const code = await owner.evaluate(() => window.__dead.game.coop.room.room.code);
  const guest = await client('7300000002', 'Guest', { query: `?room=${code}` });
  await settle(guest, 'zarya');
  await click(guest, 'JOIN');
  check('the guest joins the ZARYA session', await until(owner, () => window.__dead.game.coop.room.room.players.length === 2), code);
  await owner.evaluate(() => {
    window.__dead.game.coop.start();
    window.__dead.start();
  });
  await until(guest, () => window.__dead?.game?.coop?.canDeploy, null, 120000);
  const brought = await until(guest, () => window.__dead?.game?.state === 'paused' && window.__dead.game.coop.live, null, 120000);
  check('the guest is brought into the run when the owner starts', brought, JSON.stringify(await guest.evaluate(() => ({ state: window.__dead?.game?.state, live: window.__dead?.game?.coop?.live, map: window.__dead?.game?.mapId }))));
  await guest.evaluate(() => window.__dead.start());
  for (const p of [owner, guest]) await keepAlive(p);
  await sleep(6000);

  // ---- both squadmates on both screens, in the same places ----
  const so = await squadOf(owner);
  const sg = await squadOf(guest);
  check('two players: Timur and Vera are on the owner\'s screen', so.map((a) => a.name).join() === 'Timur,Vera' && so.every((a) => a.visible && !a.down), JSON.stringify(so));
  check('and on the guest\'s', sg.map((a) => a.name).join() === 'Timur,Vera' && sg.every((a) => a.visible && !a.down), JSON.stringify(sg));
  const apart = so.map((a, i) => Math.hypot(a.x - sg[i].x, a.z - sg[i].z));
  check('both screens agree where they stand', apart.every((d) => d < 2), apart.map((d) => d.toFixed(2)).join(' '));
  if (HOSTING === 'self') {
    const simSquad = await onSim(owner, (sim) => sim.debug.allies.filter((a) => a.kind === 'soldier').map((a) => a.name));
    check('the simulation runs both beside two players', simSquad.join() === 'Timur,Vera', simSquad.join());
  }

  // ---- the volunteers' lines (the room has two players: "Four turned up") ----
  const said = await Promise.all([owner, guest].map((p) => until(p, () => window.__dead.game.zarya.said.has('crewFour'), null, 20000)));
  check('both hear the squad count the volunteers (crewFour)', said.every(Boolean), said.join());

  // ---- empty hands before Nina's rack ----
  check('before the rack their hands are empty on both screens', [...so, ...sg].every((a) => a.weapon === 'none'), [...so, ...sg].map((a) => a.weapon).join());
  // they keep up: the owner walks off; the squad (with the owner, nearer than the guest) follows
  const o0 = await me(owner);
  await guest.evaluate(([x, z]) => window.__dead.teleport(x - 4, z + 3), [o0.x, o0.z]);
  await owner.evaluate(([x, z]) => window.__dead.teleport(x + 12, z - 8), [o0.x, o0.z]);
  await sleep(7000);
  const o1 = await me(owner);
  const kept = (await squadOf(guest)).map((a) => Math.min(Math.hypot(a.x - o1.x, a.z - o1.z), Math.hypot(a.x - (o0.x - 4), a.z - (o0.z + 3))));
  check('they keep up with the players (seen on the guest\'s screen)', kept.every((d) => d < 7), kept.map((d) => d.toFixed(1)).join(' '));

  if (HOSTING === 'self') {
    // ---- armed: Nina's pistols are off the rack ----
    await onSim(owner, (sim) => void (sim.zarya.f |= 1));
    const armed = await Promise.all([owner, guest].map((p) => until(p, () => window.__dead.game.squad.allies.filter((a) => a.kind === 'soldier').every((a) => a.avatar.weapon !== 'none'), null, 10000)));
    check('armed: both screens put guns in their hands', armed.every(Boolean), JSON.stringify((await squadOf(guest)).map((a) => a.weapon)));

    // ---- they fight: an infected by the squad, and both screens draw the squad's shots ----
    const [s0o, s0g] = [await countShots(owner), await countShots(guest)];
    await onSim(owner, (sim) => {
      const a = sim.debug.allies.find((q) => q.kind === 'soldier');
      for (let k = 0; k < 3; k++) {
        const at = sim.level.nav.randomFreeNear(a.ref.x + 5, a.ref.z + 4 * (k - 1), 3, Math.random) ?? { x: a.ref.x + 5, z: a.ref.z };
        sim.zombies.spawn('shambler', at.x, at.z, sim.rng, { state: 'idle' });
      }
    });
    await sleep(5000);
    const [s1o, s1g] = [await countShots(owner), await countShots(guest)];
    check('they fire, and both screens draw it', s1o > s0o && s1g > s0g, `owner ${s1o - s0o}, guest ${s1g - s0g}`);
    await owner.screenshot({ path: `${OUT}/owner-fight.png` });
    await guest.screenshot({ path: `${OUT}/guest-fight.png` });

    // ---- a tram ride: the owner rides to Stroiteley Street; the squad steps down beside the owner ----
    await onSim(owner, (sim) => { for (const z of [...sim.zombies.zombies]) sim.zombies.remove(z); });
    // the squad keeps up with whoever is nearest: the guest walks off to the far side of the square, so they are the owner's
    const o1b = await me(owner);
    await guest.evaluate(([x, z]) => window.__dead.teleport(x - 40, z + 20), [o1b.x, o1b.z]);
    await sleep(4000);
    const withOwner = await onSim(owner, (sim) => sim.debug.allies.filter((a) => a.kind === 'soldier').map((a) => a.with));
    const ownerId = await owner.evaluate(() => window.__dead.game.coop.room.you.id);
    check('with the guest gone off, the squad keeps up with the owner', withOwner.every((w) => w === ownerId), withOwner.join());
    await owner.evaluate(() => window.__dead.game.zarya.ride(5));
    await sleep(4500);
    const o2 = await me(owner);
    const rodeO = (await squadOf(owner)).map((a) => Math.hypot(a.x - o2.x, a.z - o2.z));
    const rodeG = (await squadOf(guest)).map((a) => Math.hypot(a.x - o2.x, a.z - o2.z));
    check('a tram ride brings them along with the owner (owner\'s screen)', rodeO.every((d) => d < 6), `owner at ${o2.x.toFixed(1)},${o2.z.toFixed(1)}; ${rodeO.map((d) => d.toFixed(1)).join(' ')}`);
    check('and the guest sees them there too', rodeG.every((d) => d < 6), rodeG.map((d) => d.toFixed(1)).join(' '));
    // look at them from the owner's eyes
    await owner.evaluate(() => {
      const g = window.__dead.game;
      const a = g.squad.allies.find((q) => q.kind === 'soldier');
      g.player.yaw = Math.atan2(-(a.ref.x - g.player.x), -(a.ref.z - g.player.z));
    });
    await sleep(500);
    await owner.screenshot({ path: `${OUT}/owner-after-ride.png` });

    // ---- one goes down, both screens see it, the guest helps him up ----
    await onSim(owner, (sim) => {
      const a = sim.debug.allies.find((q) => q.kind === 'soldier');
      sim.hurtAlly(a, 1000, a.ref.x, a.ref.z + 1);
    });
    const downBoth = await Promise.all([owner, guest].map((p) => until(p, () => window.__dead.game.squad.allies.find((a) => a.kind === 'soldier').down > 0, null, 5000)));
    check('Timur goes down on both screens', downBoth.every(Boolean), downBoth.join());
    const t = (await squadOf(guest))[0];
    await guest.evaluate(([x, z]) => window.__dead.teleport(x + 1, z), [t.x, t.z]);
    await sleep(800);
    await guest.evaluate(() => window.__dead.game.squad.requestHelp(window.__dead.game.squad.allies.findIndex((a) => a.kind === 'soldier')));
    const upBoth = await Promise.all([owner, guest].map((p) => until(p, () => window.__dead.game.squad.allies.find((a) => a.kind === 'soldier').down === 0, null, 5000)));
    check('the guest helps him up and both screens see him stand', upBoth.every(Boolean), upBoth.join());
    await guest.screenshot({ path: `${OUT}/guest-helped-up.png` });
  }
  for (const p of [owner, guest]) await p.context().close();
} catch (e) {
  check('ran to the end', false, e.message);
} finally {
  if (errors.length) console.log('page errors: ' + errors.slice(0, 8).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
