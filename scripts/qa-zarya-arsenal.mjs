// ZARYA's arsenal: every weapon taken is carried. Checks it headless against the dev server and takes screenshots
// (under $SC, default shots/zarya-arsenal).
//
//   node scripts/qa-zarya-arsenal.mjs [url]          PC at 1280x720, then a phone (844x390, the compact layout),
//                                                    then the Forge (two slots, exactly as before)
//
// Gives itself everything (`__dead.giveAll`), steps through it all with Q and the wheel, picks with 1-9, fires or
// swings each one, takes a duplicate, opens the phone's weapon list from the mini menu and picks from it with a tap,
// dies and starts again, and measures draw calls and memory with two weapons carried and with every one.
import { mkdirSync } from 'node:fs';
import { openPage, sleep } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const out = process.env.SC ?? 'shots/zarya-arsenal';
mkdirSync(out, { recursive: true });
const fail = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) fail.push(name);
};

async function open(map, { w = 1280, h = 720, touch = false } = {}) {
  const r = await openPage({ w, h, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const { page } = r;
  // other sessions save files in this checkout: the hot-reload socket is answered and never heard from
  await page.routeWebSocket((u) => u.pathname === '/' && u.host === new URL(base).host, () => {});
  await page.goto(`${base}?nolock${touch ? '&touch=1' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
  await page.evaluate((m) => localStorage.setItem('deadsignal.map.v1', m), map);
  await page.reload();
  await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
  await page.evaluate(() => window.__dead.start());
  await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
  const D = (fn, ...a) => page.evaluate(fn, ...a);
  const advance = (s) => D((s) => window.__dead.advance(s), s);
  return { ...r, D, advance };
}

// ---------------------------------------------------------------------------------------------
// PC
// ---------------------------------------------------------------------------------------------
{
  const { browser, page, logs, D, advance } = await open('zarya');
  const shot = (n) => page.screenshot({ path: `${out}/pc-${n}.png` });
  await advance(0.5);
  // armed (Nina's rack), nothing hunting, stood in the square looking down the street
  await D(() => {
    const g = window.__dead.game;
    g.zarya.story.f |= 1;
    g.zombies.spawnAllowed = () => false;
    window.__dead.clearZombies();
    window.__dead.teleport(-30, -30, Math.atan2(-50, -40));
  });
  await advance(1);
  let a = await D(() => window.__dead.arsenal());
  check('ZARYA starts with the arsenal on: the service pistol and the folding knife', a.on && a.rows.map((r) => r.label).join(',') === 'VX-9,KNIFE', JSON.stringify(a.rows));

  // ---- cost with two carried: draws and memory at this view ----
  const measure = () => D(async () => {
    const g = window.__dead.game;
    window.gc?.();
    await new Promise((r) => setTimeout(r, 400));
    const calls = [];
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      calls.push(g.renderer.renderer.info.render.calls);
    }
    window.gc?.();
    const m = g.renderer.renderer.info.memory;
    return { draws: Math.max(...calls), geometries: m.geometries, textures: m.textures, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), viewChildren: g.renderer.viewScene.children.length };
  });
  await D(() => window.__dead.teleport(-30, -30, Math.atan2(-50, -40)));
  const two = await measure();
  const twoAgain = await measure(); // (the same view measured twice: how much the heap moves by itself)
  await shot('01-two-carried');

  // ---- every weapon there is ----
  await D(() => window.__dead.giveAll());
  await advance(1);
  await D(() => window.__dead.teleport(-30, -30, Math.atan2(-50, -40)));
  const all = await measure();
  a = await D(() => window.__dead.arsenal());
  const guns = a.entries.filter((e) => e.kind === 'gun').length;
  const swung = a.entries.length - guns;
  const kinds = await D(async () => {
    const c = await import('/src/config.ts');
    const m = await import('/src/logic/melee.ts');
    return { guns: Object.keys(c.WEAPONS).filter((id) => id !== 'hanafubuki' && id !== 'raijin').length, swung: Object.keys(m.MELEE).length };
  });
  check(`every weapon carried: ${guns} guns and ${swung} to swing`, guns === kinds.guns && swung === kinds.swung, a.rows.map((r) => r.label).join(', '));
  console.log(`     cost, pistol in hand at the same view: 2 carried ${JSON.stringify(two)}; ${a.entries.length} carried ${JSON.stringify(all)}`);
  check('carrying them all costs no draw calls, geometry or textures more than two (only the one in hand is drawn)', all.draws <= two.draws && all.geometries <= two.geometries && all.textures <= two.textures && all.viewChildren === two.viewChildren, `${two.draws} -> ${all.draws} draws, ${two.geometries} -> ${all.geometries} geometries, ${two.textures} -> ${all.textures} textures`);
  const noise = Math.abs(twoAgain.heapMB - two.heapMB);
  check('and next to no memory (a few small objects per weapon; the heap moves by itself between two samples too)', all.heapMB - Math.min(two.heapMB, twoAgain.heapMB) < Math.max(3, noise * 2 + 1), `${two.heapMB} / ${twoAgain.heapMB} -> ${all.heapMB} MB`);
  await shot('02-all-carried-hud');

  // ---- step through everything with Q: each comes to hand, each fires or swings ----
  const n = a.entries.length;
  const seen = [];
  let fired = 0;
  const notFired = [];
  let maxDraws = 0;
  for (let i = 0; i < n; i++) {
    const before = await D(() => {
      const g = window.__dead.game;
      const c = g.weapons.carried;
      return { shots: g.session.stats.shotsFired, swings: g.melee.swings, mag: c ? c.ammo.mag : -1, at: window.__dead.arsenal().at, out: g.melee.out };
    });
    seen.push(before.at);
    // a click (a semi-automatic, a light swing), then the trigger held for a moment (the automatics; the Raketa fires
    // on letting go; the Ottepel throws steam while held)
    await D(() => window.__dead.click());
    await advance(0.5);
    // (a one-bolt crossbow reloads by itself in the time the trigger is then held: its magazine is read here)
    const mid = await D(() => window.__dead.game.weapons.carried?.ammo.mag ?? -1);
    await D(() => window.__dead.hold({ fire: true }));
    await advance(0.7);
    await D(() => window.__dead.releaseAll());
    await advance(0.6);
    const after = await D(() => {
      const g = window.__dead.game;
      const c = g.weapons.carried;
      return { shots: g.session.stats.shotsFired, swings: g.melee.swings, mag: c ? c.ammo.mag : -1, held: window.__dead.arsenal().held, draws: g.renderer.renderer.info.render.calls };
    });
    maxDraws = Math.max(maxDraws, after.draws);
    const did = before.out ? after.swings > before.swings : after.shots > before.shots || after.mag !== before.mag || mid !== before.mag;
    if (did) fired++;
    else notFired.push(after.held);
    if (i === 3) await shot('03-cycled-gun');
    await D(() => window.__dead.press('q'));
    await advance(0.9);
  }
  a = await D(() => window.__dead.arsenal());
  check('Q steps through every one of them in turn and comes back round', seen.every((v, i) => v === i) && a.at === 0, JSON.stringify(seen));
  check('each one fires or swings', fired === n, notFired.join(', '));
  check('no more draw calls while any of them is in hand than the view costs', maxDraws <= two.draws + 40, `${maxDraws} at most, view ${two.draws}`);

  // ---- the wheel goes back; 1-9 pick; a melee in the cycle is swung ----
  await D(() => window.__dead.press('wheelBack'));
  await advance(0.9);
  a = await D(() => window.__dead.arsenal());
  const wrapped = a.at === n - 1 && (await D(() => window.__dead.game.melee.out));
  await shot('04-melee-from-wheel');
  await D(() => window.__dead.digit(5));
  await advance(0.9);
  const five = (await D(() => window.__dead.arsenal())).at;
  await D(() => window.__dead.digit(9));
  await advance(0.9);
  const nine = (await D(() => window.__dead.arsenal())).at;
  check('the wheel back from the first goes round to the last (a weapon to swing, out); 5 and 9 pick the fifth and ninth', wrapped && five === 4 && nine === 8, JSON.stringify({ wrapped, five, nine }));

  // ---- quick steps retarget a switch under way ----
  await D(() => window.__dead.digit(1));
  await advance(0.9);
  await D(() => window.__dead.press('q'));
  await advance(0.05);
  await D(() => window.__dead.press('q'));
  await advance(0.05);
  await D(() => window.__dead.press('q'));
  await advance(1.2);
  a = await D(() => window.__dead.arsenal());
  check('three quick Qs land three along (a step mid-switch goes on)', a.at === 3, `at ${a.at}`);

  // ---- Q no longer puts a plate on; V does ----
  const plate = await D(async () => {
    const d = window.__dead;
    d.setHealth(100, 0);
    d.give({ plates: 2 });
    d.press('q');
    d.advance(0.3);
    const q = d.game.weapons.applyingPlate || d.game.session.vitals.armor > 0;
    d.advance(2);
    d.press('v');
    d.advance(0.3);
    const v = d.game.weapons.applyingPlate;
    d.advance(3);
    return { q, v, armor: d.game.session.vitals.armor, key: document.querySelector('.ds-vitals .plates kbd')?.textContent };
  });
  check('on ZARYA Q steps through the arsenal and the armour plate is on V (the HUD says V)', !plate.q && plate.v && plate.armor > 0 && plate.key === 'V', JSON.stringify(plate));

  // ---- a duplicate tops up its ammunition and adds nothing ----
  const dup = await D(() => {
    const d = window.__dead;
    const inv = d.game.session.inv;
    const n0 = inv.slots.filter(Boolean).length;
    const r = inv.slots.find((w) => w?.id === 'rifle');
    r.ammo.reserve = 4;
    d.giveGun('rifle');
    return { n0, n1: inv.slots.filter(Boolean).length, reserve: r.ammo.reserve, max: r.ammo.reserveMax, rifles: inv.slots.filter((w) => w?.id === 'rifle').length };
  });
  check('taking a gun already carried tops up its ammunition and adds no second one', dup.n0 === dup.n1 && dup.reserve === dup.max && dup.rifles === 1, JSON.stringify(dup));

  // ---- the town's own way of handing over a gun (a prompt's `give`) ----
  const town = await D(() => {
    const g = window.__dead.game;
    const z = g.zarya;
    const inv = g.session.inv;
    inv.slots = [inv.slots[0], null];
    inv.activeSlot = 0;
    z.give({ gun: 'signalka' });
    z.give({ gun: 'arbalet' });
    z.give({ melee: 'maul' });
    return { slots: inv.slots.map((w) => w?.id ?? null), held: window.__dead.arsenal().held, pack: [...g.melee.pack] };
  });
  check("the town's prompts hand guns into the arsenal and nothing is put down", town.slots.join(',') === 'pistol,signalka,arbalet' && town.pack.includes('knife') && town.pack.includes('maul') && town.held === 'maul', JSON.stringify(town));

  // ---- die, and start again ----
  await D(() => {
    const d = window.__dead;
    d.setHealth(100, 0);
    d.game.hurtPlayer(100000, null, null, { ignoreArmor: true });
  });
  await advance(0.5);
  await page.waitForFunction(() => window.__dead.game.session.ended || window.__dead.game.state !== 'playing', null, { timeout: 20000 }).catch(() => {});
  const dead = await D(() => ({ state: window.__dead.game.state, ended: window.__dead.game.session.ended }));
  await D(() => window.__dead.start());
  await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
  await advance(0.5);
  a = await D(() => ({ ...window.__dead.arsenal(), slots: window.__dead.game.session.inv.slots.map((w) => w?.id ?? null) }));
  check('dying ends the run; the next run starts with the arsenal on and only the service pistol', dead.ended && a.on && a.slots.join(',') === 'pistol,' && a.entries.length === 1, JSON.stringify({ dead, slots: a.slots, rows: a.rows }));

  // (a 502 is the account server, which the dev server proxies and which is not running here)
  const errs = logs.filter((l) => l.type === 'pageerror' || (l.type === 'error' && !/favicon|404|502|net::|WebSocket/i.test(l.text)));
  check('no page errors (PC)', errs.length === 0, errs.slice(0, 3).map((e) => e.text.slice(0, 160)).join(' | '));
  await browser.close();
}

// ---------------------------------------------------------------------------------------------
// phone: the compact layout, a tap on the weapon panel, the weapon list from the mini menu
// ---------------------------------------------------------------------------------------------
{
  const { browser, page, logs, D, advance } = await open('zarya', { w: 844, h: 390, touch: true });
  const shot = (n) => page.screenshot({ path: `${out}/phone-${n}.png` });
  await advance(0.5);
  await D(() => {
    const g = window.__dead.game;
    g.zarya.story.f |= 1;
    g.zombies.spawnAllowed = () => false;
    window.__dead.clearZombies();
    window.__dead.teleport(-30, -30, Math.atan2(-50, -40));
    window.__dead.giveAll();
  });
  // real frames from here: the controls answer real pointer events
  await sleep(1200);
  await shot('01-hud');
  const box = async (sel) => page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom } : null;
  }, sel);
  // a tap on the weapon panel steps to the next
  const at0 = (await D(() => window.__dead.arsenal())).at;
  const wp = await box('.ds-weapon');
  await page.mouse.click(wp.x, wp.y);
  await sleep(900);
  const at1 = (await D(() => window.__dead.arsenal())).at;
  check('phone: a tap on the weapon panel steps to the next one', at1 === at0 + 1, `${at0} -> ${at1}`);
  // the menu dot, then WEAPONS
  const dot = await box('.ds-touch-layer .tb.menu');
  await page.mouse.click(dot.x, dot.y);
  await sleep(300);
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.ds-touch-layer .tmenu:not(.tlist) .tm')].map((t) => t.textContent));
  check('phone: the mini menu has WEAPONS (in place of SWAP WEAPON)', tiles.includes('WEAPONS') && !tiles.includes('SWAP WEAPON'), tiles.join(', '));
  await shot('02-mini-menu');
  const wt = await box('.ds-touch-layer .tm.weapons');
  await page.mouse.click(wt.x, wt.y);
  await sleep(400);
  const list = await page.evaluate(() => {
    const l = document.querySelector('.ds-touch-layer .tlist');
    const r = l.getBoundingClientRect();
    return { hidden: l.hidden, rows: [...l.querySelectorAll('.tr')].map((b) => ({ n: b.querySelector('.n').textContent, s: b.querySelector('.s').textContent, on: b.classList.contains('on') })), left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, scroll: l.scrollHeight > l.clientHeight };
  });
  const n = (await D(() => window.__dead.arsenal())).entries.length;
  check('phone: WEAPONS opens a list of everything carried, with ammunition, the one in hand lit', !list.hidden && list.rows.length === n && list.rows.filter((r) => r.on).length === 1 && list.rows[at1]?.on && /\d/.test(list.rows[0].s), `${list.rows.length} rows of ${n}; ${list.rows.slice(0, 3).map((r) => `${r.n} ${r.s}`).join(' | ')}`);
  check('phone: the list keeps to the right-hand third (nothing in the middle of the screen)', list.left >= list.w * 0.6, `left ${Math.round(list.left)} of ${list.w}`);
  await shot('03-weapon-list');
  // a tap on a row lower down (a weapon to swing) brings it out, and the list closes
  const target = n - 2;
  const row = await page.evaluate((i) => {
    const b = document.querySelectorAll('.ds-touch-layer .tlist .tr')[i];
    b.scrollIntoView({ block: 'nearest' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.querySelector('.n').textContent };
  }, target);
  await page.mouse.click(row.x, row.y);
  await sleep(900);
  const picked = await D(() => ({ ...window.__dead.arsenal(), out: window.__dead.game.melee.out, listHidden: document.querySelector('.ds-touch-layer .tlist').hidden }));
  check(`phone: one tap on a row (${row.label}) brings that one to hand and closes the list`, picked.at === target && picked.out && picked.listHidden, JSON.stringify({ at: picked.at, out: picked.out, hidden: picked.listHidden }));
  await shot('04-picked');
  // and back to a gun from the list
  await page.mouse.click(dot.x, dot.y);
  await sleep(250);
  await page.mouse.click(wt.x, wt.y);
  await sleep(300);
  const row2 = await page.evaluate(() => {
    const b = document.querySelectorAll('.ds-touch-layer .tlist .tr')[2];
    b.scrollIntoView({ block: 'nearest' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(row2.x, row2.y);
  await sleep(900);
  const back = await D(() => ({ at: window.__dead.arsenal().at, out: window.__dead.game.melee.out }));
  check('phone: and a gun picked from the list puts the weapon to swing away', back.at === 2 && !back.out, JSON.stringify(back));
  const errs = logs.filter((l) => l.type === 'pageerror' || (l.type === 'error' && !/favicon|404|502|net::|WebSocket/i.test(l.text)));
  check('no page errors (phone)', errs.length === 0, errs.slice(0, 3).map((e) => e.text.slice(0, 160)).join(' | '));
  await browser.close();
}

// ---------------------------------------------------------------------------------------------
// the Forge: two slots, exactly as before
// ---------------------------------------------------------------------------------------------
{
  const { browser, page, D, advance } = await open('forge');
  await advance(0.5);
  const f = await D(async () => {
    const d = window.__dead;
    const g = d.game;
    const inv = g.session.inv;
    const r = { map: g.mapId, arsenal: inv.arsenal ?? null, slots: inv.slots.map((w) => w?.id ?? null), melee: !!g.melee };
    d.press('wheel');
    d.advance(1);
    r.afterWheel = inv.activeSlot;
    d.setHealth(100, 0);
    d.give({ plates: 2 });
    d.press('plate');
    d.advance(0.3);
    r.qPlate = g.weapons.applyingPlate;
    d.advance(3);
    // a gun from the box still replaces the one in hand
    const { takePrize } = await import('/src/logic/mysteryBox.ts');
    const t = takePrize(inv, { kind: 'weapon', id: 'shotgun' });
    r.box = t.message;
    r.slotsAfter = inv.slots.map((w) => w?.id ?? null);
    r.key = document.querySelector('.ds-vitals .plates kbd')?.textContent;
    r.footer = document.querySelector('.ds-weapon .wother .txt')?.textContent;
    return r;
  });
  check('the Forge: two slots, no arsenal, the wheel swaps them, Q is the plate, a box gun replaces the one in hand', f.map === 'forge' && f.arsenal === null && f.slots.length === 2 && f.afterWheel === 1 && f.qPlate && /REPLACES/.test(f.box) && f.slotsAfter.length === 2 && f.key === 'Q', JSON.stringify(f));
  await page.screenshot({ path: `${out}/forge-hud.png` });
  await browser.close();
}

console.log(fail.length ? `\n${fail.length} FAILED:\n  ${fail.join('\n  ')}` : '\nall passed');
process.exit(fail.length ? 1 : 0);
