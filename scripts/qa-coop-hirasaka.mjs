#!/usr/bin/env node
/**
 * HIRASAKA in co-op, in real headless Chrome (adapted from qa-coop-zarya.mjs): an owner and a guest play Act I and the
 * cage ride together through the local server. The guest takes Daigo's seat (`SQUADS.hirasaka.fillsSeats`), so Natsuki
 * is the one AI squadmate beside two players. Checks, on both screens:
 *  - the guest joins and is brought into the run; Natsuki on both screens, in the same place;
 *  - Act I split between the two players, each action sent from the player standing at it (the tools, the coal, the
 *    slag dug out, the boiler key, the boarded door and the burner; the shutter and the fan; the cage key), and every
 *    step seen on BOTH screens (the shared story state: tools, obstacles, jobs);
 *  - an obstacle the guest swings at shuts its collider on both until opened (doors.ts runs on the simulation too);
 *  - the umibōzu rises for both; the Mori's parts and the build; three hits as the Mori sends them (`umiHit`) sink it;
 *  - the ladles; the cage ride: the owner rides down, lands in the deep, and Natsuki comes down with whoever she was with.
 * HOSTING=self (default: the owner's browser runs the simulation from source) or server (needs `pnpm build:sim`).
 * Needs both servers:
 *   node --env-file=.claude/dev.env server/index.mjs        (port 3061, DEV_LOGIN; launch.json `server-dev`)
 *   a Vite dev server (QA_URL, default http://127.0.0.1:5183/; its proxy points at 3061)
 * Shots in shots/coop-hirasaka/ (SC=... for another folder).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { ANGLE, CHROME, sleep } from './lib/browser.mjs';

const URL = (process.env.QA_URL || 'http://127.0.0.1:5183/').replace(/\/$/, '');
const HOSTING = process.env.HOSTING === 'server' ? 'server' : 'self';
const OUT = process.env.SC || 'shots/coop-hirasaka';
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
    const k = 'deadsignal.settings.v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    localStorage.setItem(k, JSON.stringify({ ...s, quality: 'low', qualityAuto: false, masterVolume: 0 }));
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
  const st = await page.evaluate(() => ({ map: window.__dead?.game?.mapId, state: window.__dead?.game?.state, live: window.__dead?.game?.coop?.live, room: window.__dead?.game?.coop?.room?.room?.code ?? null, err: document.querySelector('.ds-lobby .error, .ds-lobby [role=alert]')?.textContent ?? '' }));
  throw new Error(`the guest never settled on ${map}: ${JSON.stringify(st)}`);
}

/** Both screens' view of the squad. */
const squadOf = (page) =>
  page.evaluate(() =>
    window.__dead.game.squad.allies
      .filter((a) => a.kind === 'soldier')
      .map((a) => ({ name: a.name, x: Math.round(a.ref.x * 10) / 10, y: Math.round(a.ref.y * 10) / 10, z: Math.round(a.ref.z * 10) / 10, down: a.down > 0, visible: a.avatar.root.visible })),
  );
const me = (page) => page.evaluate(() => ({ x: window.__dead.game.player.x, y: window.__dead.game.player.y, z: window.__dead.game.player.z }));
/** The shared story state as this screen has it. */
const view = (page) => page.evaluate(() => {
  const v = window.__dead.game.hirasaka.view;
  return { act: v.act, done: v.done, coal: v.coal, tools: v.tools, obstacles: v.obstacles, umi: v.umi, hits: v.umiHits, moriParts: v.moriParts, built: v.built, ladles: v.ladles, cageDown: v.cageDown };
});
const onSim = (page, fn, arg) => page.evaluate(([f, a]) => new Function('sim', 'arg', `return (${f})(sim, arg)`)(window.__dead.game.coop.sim, a), [fn.toString(), arg]);
/** Stand on a spot (its floor height) facing a point, and wait until the simulation has this player there (it checks
 * reach before it takes a story action). */
const stand = async (page, s, look) => {
  await page.evaluate(([s, look]) => {
    const d = window.__dead;
    const yaw = look ? Math.atan2(-(look.x - s.x), -(look.z - s.z)) : d.game.player.yaw;
    d.teleport(s.x, s.z, yaw, s.y);
    d.setHealth(1e6, 100);
  }, [s, look]);
  await sleep(900);
};
/** A story action sent from this player's screen (to the simulation in co-op). */
const act = (page, a, i = 0) => page.evaluate(([a, i]) => window.__dead.game.hirasaka.act(a, i), [a, i]);
/** Wait until both screens see `fn(view)` true. */
const both = async (owner, guest, fn, timeout = 8000) => {
  const ok = await Promise.all([owner, guest].map((p) => until(p, new Function('return (' + fn.toString() + ')(window.__dead.game.hirasaka.view)'), null, timeout)));
  return ok.every(Boolean);
};

try {
  const owner = await client('7300000011', 'Owner', { map: 'hirasaka' });
  await openLobby(owner);
  if (HOSTING === 'self') await click(owner, 'SELF HOST');
  await click(owner, 'CREATE SESSION');
  await until(owner, () => window.__dead.game.coop.room.room !== null);
  const code = await owner.evaluate(() => window.__dead.game.coop.room.room.code);
  const guest = await client('7300000012', 'Guest', { query: `?room=${code}` });
  await settle(guest, 'hirasaka');
  await click(guest, 'JOIN');
  check('the guest joins the HIRASAKA session', await until(owner, () => window.__dead.game.coop.room.room.players.length === 2), code);
  await owner.evaluate(() => {
    window.__dead.game.coop.start();
    window.__dead.start();
  });
  await until(guest, () => window.__dead?.game?.coop?.canDeploy, null, 120000);
  const brought = await until(guest, () => window.__dead?.game?.state === 'paused' && window.__dead.game.coop.live, null, 120000);
  check('the guest is brought into the run when the owner starts', brought, JSON.stringify(await guest.evaluate(() => ({ state: window.__dead?.game?.state, live: window.__dead?.game?.coop?.live, map: window.__dead?.game?.mapId }))));
  await guest.evaluate(() => window.__dead.start());
  for (const p of [owner, guest]) await keepAlive(p);
  if (HOSTING === 'self') await onSim(owner, (sim) => { sim.zombies.spawnAllowed = () => false; for (const z of [...sim.zombies.zombies]) sim.zombies.remove(z); });
  await sleep(6000);
  const S = await owner.evaluate(async () => {
    const m = await import('/src/hirasaka/places.ts');
    return { JOBS: m.JOBS, TOOLS: m.TOOLS, TOOL_IDS: m.TOOL_IDS, OBSTACLES: m.OBSTACLES, OBSTACLE: m.OBSTACLE, UMIBOZU: m.UMIBOZU, CAGE: m.CAGE, LADLES: m.LADLES };
  });

  // ---- the squad: the guest has Daigo's seat; Natsuki on both screens, in the same place ----
  const so = await squadOf(owner);
  const sg = await squadOf(guest);
  check("two players: Natsuki is on the owner's screen (the guest has Daigo's seat)", so.map((a) => a.name).join() === 'Natsuki' && so.every((a) => a.visible && !a.down), JSON.stringify(so));
  check("and on the guest's", sg.map((a) => a.name).join() === 'Natsuki' && sg.every((a) => a.visible), JSON.stringify(sg));
  const apart = so.map((a, i) => (sg[i] ? Math.hypot(a.x - sg[i].x, a.z - sg[i].z) : 99));
  check('both screens agree where she stands', apart.every((d) => d < 2), apart.map((d) => d.toFixed(2)).join(' '));
  await owner.screenshot({ path: `${OUT}/owner-pier.png` });

  // ---- ACT I, split between the two players ----
  // the tools: each player takes their own (arms: a tool is per player; the story's bit says the squad has it)
  for (const [i, id] of S.TOOL_IDS.entries()) {
    for (const p of [owner, guest]) {
      await stand(p, S.TOOLS[id]);
      await p.evaluate((i) => window.__dead.game.hirasaka.arms.takeTool(i), i);
    }
  }
  check('the four tools taken: both screens see them', await both(owner, guest, (v) => v.tools === 15), JSON.stringify([await view(owner), await view(guest)].map((v) => v.tools)));
  // STEAM: the owner the coal, the guest digs the slag and carries the key, the owner the door and the burner
  await stand(owner, S.JOBS.steam.coal[0]);
  await act(owner, 'coal', 0);
  await stand(guest, S.JOBS.steam.coal[1]);
  await act(guest, 'coal', 1);
  check('two coal sacks, one from each player, on both screens', await both(owner, guest, (v) => v.coal >= 2), JSON.stringify((await view(guest)).coal));
  // the guest's swings at the slag (the shovel): blows on the guest's own screen open it for everyone
  await stand(guest, S.OBSTACLES[S.OBSTACLE.slag].at);
  await guest.evaluate((i) => { const a = window.__dead.game.hirasaka.arms; for (let k = 0; k < 8; k++) if (a.blow(i, false)) break; }, S.OBSTACLE.slag);
  check("the guest digs the third sack out of the slag: opened on the owner's screen too", await both(owner, guest, (v, i = 0) => (v.obstacles & 4) !== 0), `${(await view(owner)).obstacles}`);
  await stand(guest, S.JOBS.steam.boilerKey);
  await act(guest, 'boilerKey');
  // the boarded door: shut on the simulation until the axe opens it (doors.ts on the host)
  if (HOSTING === 'self') {
    const shut = await onSim(owner, (sim, i) => sim.level.hirasaka.obstacles[i]?.blocksMove, S.OBSTACLE.bathDoor);
    check("the boarded door is shut on the simulation's level before the axe", shut === true, String(shut));
  }
  await stand(owner, S.OBSTACLES[S.OBSTACLE.bathDoor].at, S.JOBS.steam.boiler);
  await owner.evaluate((i) => { const a = window.__dead.game.hirasaka.arms; for (let k = 0; k < 8; k++) if (a.blow(i, false)) break; }, S.OBSTACLE.bathDoor);
  await sleep(800);
  if (HOSTING === 'self') {
    const open = await onSim(owner, (sim, i) => sim.level.hirasaka.obstacles[i]?.blocksMove, S.OBSTACLE.bathDoor);
    check('the axe opens it on the simulation too', open === false, String(open));
  }
  await stand(owner, S.JOBS.steam.boiler);
  await act(owner, 'burner');
  // AIR: the guest breaks the shutter and starts the fan
  await stand(guest, S.JOBS.air.shutter, S.JOBS.air.fan);
  await guest.evaluate((i) => { const a = window.__dead.game.hirasaka.arms; for (let k = 0; k < 8; k++) if (a.blow(i, true)) break; }, S.OBSTACLE.shutter);
  await sleep(500);
  await stand(guest, S.JOBS.air.fan);
  await act(guest, 'fan');
  // KEY: the owner takes Genzō's cage key
  await stand(owner, S.JOBS.key.key);
  await act(owner, 'key');
  check('the three jobs done, seen on both screens', await both(owner, guest, (v) => v.done === 7), JSON.stringify([(await view(owner)).done, (await view(guest)).done]));
  check('the umibōzu rises for both', await both(owner, guest, (v) => v.umi === 1), JSON.stringify((await view(guest)).umi));
  // the Mori: the guest the harpoon head, the owner the cable cutter and the build
  await stand(guest, S.UMIBOZU.parts[0]);
  await act(guest, 'part', 0);
  await stand(owner, S.UMIBOZU.parts[1]);
  await act(owner, 'part', 1);
  await stand(owner, S.UMIBOZU.winch, { x: 40, z: 116 });
  await act(owner, 'built', 0);
  check('the Mori built at the winch, on both screens', await both(owner, guest, (v) => (v.built & 1) === 1), JSON.stringify((await view(guest)).built));
  await stand(guest, { ...S.UMIBOZU.winch, x: S.UMIBOZU.winch.x - 3 }, { x: 40, z: 116 });
  await sleep(1500);
  await guest.screenshot({ path: `${OUT}/guest-umibozu.png` });
  // three hits as the Mori sends them (its own fight is qa-hirasaka-fights.mjs): two from the owner, one from the guest
  for (const p of [owner, guest, owner]) {
    await act(p, 'umiHit');
    await sleep(400);
  }
  check('three harpoon hits from both players sink it: the cage runs on both screens', await both(owner, guest, (v) => v.umi === 2), JSON.stringify([(await view(owner)).hits, (await view(guest)).hits]));
  await stand(guest, S.LADLES);
  await act(guest, 'ladles');
  check("the guest carries the bath-house ladles (the owner's screen knows)", await both(owner, guest, (v) => v.ladles >= 1), JSON.stringify((await view(owner)).ladles));
  await owner.screenshot({ path: `${OUT}/owner-act1-done.png` });

  // ---- the cage ride: the owner rides down; Natsuki, keeping up with the owner, comes down too ----
  // she keeps up with whoever she is with: the owner goes to her, the guest well off along the seafront; then the owner
  // walks her to the cage (in steps, so she keeps up) and stands in it
  const nat = (await squadOf(owner))[0];
  await stand(owner, { x: nat.x + 1, y: nat.y, z: nat.z });
  await guest.evaluate(() => window.__dead.teleport(-120, 66));
  await sleep(5000);
  const o0 = await me(owner);
  for (let k = 1; k <= 6; k++) {
    const f = k / 6;
    await stand(owner, { x: o0.x + (S.CAGE.top.x - o0.x) * f, y: k === 6 ? S.CAGE.top.y : o0.y, z: o0.z + (S.CAGE.top.z - o0.z) * f });
    await sleep(1600);
  }
  await sleep(3000);
  if (HOSTING === 'self') {
    const ownerId = await owner.evaluate(() => window.__dead.game.coop.room.you.id);
    const withWho = await onSim(owner, (sim) => sim.debug.allies.filter((a) => a.kind === 'soldier').map((a) => a.with));
    check('beside the cage, Natsuki keeps up with the owner', withWho.every((w) => w === ownerId), withWho.join());
  }
  await owner.evaluate(() => window.__dead.game.hirasaka.rideCage(true));
  await sleep(6000);
  const o1 = await me(owner);
  check('the owner rides the cage down to the deep', o1.x > 250, `${o1.x.toFixed(1)},${o1.y.toFixed(1)},${o1.z.toFixed(1)} (from ${o0.x.toFixed(0)},${o0.z.toFixed(0)})`);
  check('the cage is down on both screens', await both(owner, guest, (v) => v.cageDown && v.act === 1), JSON.stringify([await view(owner), await view(guest)].map((v) => [v.cageDown, v.act])));
  const rodeO = (await squadOf(owner)).map((a) => Math.hypot(a.x - o1.x, a.z - o1.z));
  const rodeG = (await squadOf(guest)).map((a) => Math.hypot(a.x - o1.x, a.z - o1.z));
  check("Natsuki comes down with the owner (owner's screen)", rodeO.every((d) => d < 8), rodeO.map((d) => d.toFixed(1)).join(' '));
  check('and the guest sees her down there too', rodeG.every((d) => d < 8), rodeG.map((d) => d.toFixed(1)).join(' '));
  await owner.evaluate(() => {
    const g = window.__dead.game;
    const a = g.squad.allies.find((q) => q.kind === 'soldier');
    if (a) g.player.yaw = Math.atan2(-(a.ref.x - g.player.x), -(a.ref.z - g.player.z));
  });
  await sleep(500);
  await owner.screenshot({ path: `${OUT}/owner-cage-landing.png` });
  // the guest follows down the cage
  await stand(guest, S.CAGE.top);
  await guest.evaluate(() => window.__dead.game.hirasaka.rideCage(true));
  await sleep(6000);
  const g1 = await me(guest);
  check('the guest rides down after', g1.x > 250, `${g1.x.toFixed(1)},${g1.y.toFixed(1)},${g1.z.toFixed(1)}`);
  await guest.screenshot({ path: `${OUT}/guest-cage-landing.png` });
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
