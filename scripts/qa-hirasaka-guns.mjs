// HIRASAKA's arms, end to end in headless Chrome (arms wave): build each of the four built guns the story's way (the
// parts where they lie, the bench, the Bon fire, the revived tree), take it, fire it at measured posts, and compare what
// it does with the offering box's and the boards' guns; the tools are swung at their obstacles; the boards sell; the
// pit workshop rides the cage. Prints the numbers and writes a picture of each gun in hand.
//
//   node scripts/qa-hirasaka-guns.mjs [url]       (default http://127.0.0.1:5183/)
//   SC=<dir>                                       pictures (default shots/hirasaka/arms)
import { mkdirSync } from 'node:fs';
import { openPage, reportLogs } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const out = process.env.SC ?? 'shots/hirasaka/arms';
mkdirSync(out, { recursive: true });
const { browser, page, logs } = await openPage({ w: 960, h: 540 });
// other sessions save files while this runs: keep the dev server's hot reload out of this page
await page.addInitScript(() => {
  const Real = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (protocols === 'vite-hmr' || (Array.isArray(protocols) && protocols.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return new Real(url, protocols);
  };
});
await page.goto(`${base}?nolock`, { waitUntil: 'load' });
const D = (fn, ...args) => page.evaluate(fn, ...args);
let failed = 0;
const check = (what, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  (${detail})` : ''}`);
};
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'hirasaka'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 90000 });
const P = await D(async () => {
  const m = await import('/src/hirasaka/places.ts');
  const a = await import('/src/hirasaka/armsPlaces.ts');
  return { TOOLS: m.TOOLS, TOOL_IDS: m.TOOL_IDS, OBSTACLES: m.OBSTACLES, UMIBOZU: m.UMIBOZU, COMB: m.COMB, CAGE: m.CAGE, WALL_BUYS: m.WALL_BUYS, ARMS_PARTS: a.ARMS_PARTS, BENCH: a.BENCH, KUSHI: a.KUSHI, WALL_GUNS: a.WALL_GUNS, WORKSHOP: a.WORKSHOP };
});
await D(() => {
  const d = window.__dead;
  const g = d.game;
  g.zombies.spawnAllowed = () => false;
  g.zombies.rateMul = 0;
  d.clearZombies();
  g.squad.reset?.(false, false);
  d.advance(4);
  d.freeze(true);
});
const at = (s) => D((s) => { const d = window.__dead; d.teleport(s.x, s.z, d.game.player.yaw, s.y); d.setHealth(100, 100); d.advance(0.1); }, s);
const act = (a, i = 0) => D(([a, i]) => window.__dead.game.hirasaka.act(a, i), [a, i]);
const view = () => D(() => { const v = window.__dead.game.hirasaka.view; return { tools: v.tools, obstacles: v.obstacles, parts: v.parts, moriParts: v.moriParts, built: v.built, kushi: v.kushi, cageAt: v.cageAt }; });
const carries = (id) => D((id) => window.__dead.game.session.inv.slots.some((s) => s?.id === id), id);

// ---------------------------------------------------------------------------------------------
console.log('\n== the tools: taken into the pack, each opens only its own');
for (const [i, id] of P.TOOL_IDS.entries()) {
  await at(P.TOOLS[id]);
  await D((i) => window.__dead.game.hirasaka.arms.takeTool(i), i);
}
const pack = await D(() => window.__dead.game.melee.pack.join(','));
check('the four tools are in the pack', ['tsuruhashi', 'timberAxe', 'coalShovel', 'tachi'].every((t) => pack.includes(t)), pack);
// a real swing: the pick in hand, facing the fan shutter, light swings by the trigger, until it gives
const shutter = P.OBSTACLES.findIndex((o) => o.id === 'shutter');
const bath = P.OBSTACLES.findIndex((o) => o.id === 'bathDoor');
{
  const o = P.OBSTACLES[bath];
  // the wrong tool first: the pick on the boarded door does nothing
  await D(([o]) => { const d = window.__dead; d.teleport(o.at.x - 1.6, o.at.z, -Math.PI / 2, o.at.y); d.lookAt(o.at.x, o.at.z, 1.2); const m = d.game.melee; m.select('tsuruhashi'); m.setOut(true); d.advance(0.5); }, [o]);
  for (let k = 0; k < 6; k++) await D(() => { const d = window.__dead; d.click(); d.advance(1.0); });
  check('the pick does nothing to the boarded door', !((await view()).obstacles & (1 << bath)));
  const swings = await D(([o]) => {
    const d = window.__dead;
    const m = d.game.melee;
    m.select('timberAxe');
    m.setOut(true);
    d.advance(0.5);
    let n = 0;
    for (; n < 10 && !(d.game.hirasaka.view.obstacles & (1 << o)); n++) {
      d.click();
      d.advance(1.0);
    }
    return n;
  }, [bath]);
  check('the timber axe chops through the boarded door by swinging it', !!((await view()).obstacles & (1 << bath)), `${swings} swings`);
  await page.screenshot({ path: `${out}/obstacle-bathdoor-open.png` });
}
{
  const o = P.OBSTACLES[shutter];
  await D(([o]) => { const d = window.__dead; d.teleport(o.at.x, o.at.z + 1.5, 0, o.at.y); d.lookAt(o.at.x, o.at.z, o.at.y + 1.2); d.advance(0.3); }, [o]);
  await page.screenshot({ path: `${out}/obstacle-shutter-shut.png` });
  const swings = await D(([i]) => {
    const d = window.__dead;
    const m = d.game.melee;
    m.select('tsuruhashi');
    m.setOut(true);
    d.advance(0.5);
    let n = 0;
    // heavy blows: the trigger held through the wind-up
    for (; n < 8 && !(d.game.hirasaka.view.obstacles & (1 << i)); n++) {
      d.click(); // (the press that starts the swing; then held through the wind-up)
      d.hold({ fire: true });
      d.advance(1.1);
      d.releaseAll();
      d.advance(1.0);
    }
    return n;
  }, [shutter]);
  check('the pick breaks the fan shutter with heavy blows', !!((await view()).obstacles & (1 << shutter)), `${swings} heavy swings`);
  await page.screenshot({ path: `${out}/obstacle-shutter-open.png` });
}

// ---------------------------------------------------------------------------------------------
console.log('\n== the built guns: parts, benches, taking');
await D(() => { const d = window.__dead; d.game.melee.setOut(false); d.advance(0.2); });
for (const [i, p] of P.UMIBOZU.parts.entries()) {
  await at(p);
  await act('part', i);
}
await at(P.UMIBOZU.winch);
await D(() => window.__dead.game.hirasaka.arms['owed'].add('mori'));
await act('built', 0);
await D(() => window.__dead.advance(0.2));
check('the Mori built at the seawall winch and in hand', await carries('mori'));
for (const [i, p] of P.ARMS_PARTS.entries()) {
  await at(p.at);
  await act('apart', i);
}
check('every part taken where it lies', (await view()).parts === (1 << P.ARMS_PARTS.length) - 1, `parts ${(await view()).parts}`);
for (const [b, i] of [['happa', 1], ['sakuganki', 2]]) {
  await at(P.BENCH[b]);
  await D((b) => window.__dead.game.hirasaka.arms['owed'].add(b), b);
  await act('built', i);
  await D(() => window.__dead.advance(0.2));
  check(`the ${b} built at its bench and in hand`, await carries(b));
}
await at(P.COMB);
await D(() => window.__dead.game.hirasaka.takeGift('comb'));
await at(P.KUSHI.light);
await D(() => window.__dead.game.hirasaka.arms['owed'].add('kushibi'));
await act('kushi', 2);
await D(() => window.__dead.advance(0.2));
check('the comb lit at the Bon fire: the Kushi-bi in hand', await carries('kushibi'));

// ---------------------------------------------------------------------------------------------
console.log('\n== a board sells');
{
  const w = P.WALL_BUYS.find((b) => b.id === 'market');
  await at(w);
  const r = await D(([w, o]) => {
    const d = window.__dead;
    const g = d.game;
    g.session.inv.cash = 5000;
    const rows = [];
    for (const s of g.interaction.sources) s(rows);
    const t = rows.find((r) => r.id === `hs-arms:wall:${w.id}`);
    t?.onUse();
    return { text: t?.text ?? '', cash: g.session.inv.cash, has: g.session.inv.slots.some((s) => s?.id === o.gun) };
  }, [w, P.WALL_GUNS.market]);
  check('the market board sells its rifle', r.has && r.cash === 5000 - P.WALL_GUNS.market.price, `${r.text}, cash left ${r.cash}`);
}
console.log('\n== fired at posts (damage a second over 8 s of fire and reload, tier 0)');
const WHERE = { x: -84, y: 0, z: 64 };
const fire = (id, crowd) =>
  D(([id, crowd, W]) => {
    const d = window.__dead;
    const g = d.game;
    d.releaseAll();
    d.clearZombies();
    g.melee?.setOut(false);
    d.teleport(W.x, W.z, -Math.PI / 2, W.y);
    const inv = g.session.inv;
    const at = inv.slots.findIndex((s) => s?.id === id);
    if (at >= 0) inv.activeSlot = at;
    else d.giveGun(id);
    const c = g.weapons.carried;
    c.ammo.mag = c.ammo.magSize;
    c.ammo.reserve = c.ammo.reserveMax;
    g.weapons.cancelActions();
    d.advance(1.2);
    const p = g.player;
    const spots = crowd ? [[6, -0.6], [6, 0.6], [6.8, 0], [7.6, -0.6], [7.6, 0.6], [8.4, 0]] : [[7, 0]];
    const ids = spots.map(([dx, dz]) => {
      const zid = d.spawnZombie('shambler', p.x + dx, p.z + dz, false);
      const z = g.zombies.zombies.find((q) => q.id === zid);
      z.maxHp = z.hp = 1e6;
      z.dormant = false;
      z.speedScale = 0;
      return zid;
    });
    const auto = d.weaponDefs[id].auto;
    const T = 8;
    // auto: the trigger held; semi-auto: clicked as fast as it will take (a click is one frame, then one frame off)
    for (let f = 0; f < T * 60; f++) {
      const z0 = g.zombies.zombies.find((q) => q.id === ids[0]);
      if (z0) d.lookAt(z0.x, z0.z, z0.y + 1.0);
      if (auto) {
        d.hold({ fire: true });
        d.advance(1 / 60);
      } else if (f % 2 === 0) d.click();
      else d.advance(1 / 60);
    }
    d.releaseAll();
    d.advance(1.5); // what is still in flight lands
    const lost = ids.map((zid) => 1e6 - (g.zombies.zombies.find((q) => q.id === zid)?.hp ?? 1e6));
    const total = lost.reduce((a, b) => a + b, 0);
    d.clearZombies();
    return { dps: Math.round(total / T), each: lost.map((n) => Math.round(n)) };
  }, [id, crowd, WHERE]);
const box = ['pistol', 'rifle', 'shotgun', 'rpg', 'arbalet', 'signalka'];
const built = ['happa', 'sakuganki', 'mori', 'kushibi'];
const res = {};
for (const id of [...box, ...built]) {
  const one = await fire(id, false);
  const six = await fire(id, true);
  res[id] = { one: one.dps, six: six.dps };
  console.log(`  ${id.padEnd(10)} one: ${String(one.dps).padStart(6)}/s   six: ${String(six.dps).padStart(6)}/s   (${six.each.join(' ')})`);
}
const best1 = Math.max(...box.map((id) => res[id].one));
const best6 = Math.max(...box.map((id) => res[id].six));
for (const id of built) {
  if (id !== 'mori') check(`${id} beats every box and board gun on one infected`, res[id].one > best1, `${res[id].one} vs ${best1}`);
  check(`${id} beats every box and board gun on a crowd of six`, res[id].six > best6, `${res[id].six} vs ${best6}`);
}
// the Mori pins and reels in
{
  const r = await D(([W]) => {
    const d = window.__dead;
    const g = d.game;
    d.clearZombies();
    d.teleport(W.x, W.z, -Math.PI / 2, W.y);
    const inv = g.session.inv;
    inv.activeSlot = inv.slots.findIndex((s) => s?.id === 'mori');
    g.weapons.carried.ammo.mag = 1;
    d.advance(1);
    const p = g.player;
    const zid = d.spawnZombie('shambler', p.x + 14, p.z, false);
    const z = g.zombies.zombies.find((q) => q.id === zid);
    z.maxHp = z.hp = 1e6;
    z.speedScale = 0;
    const d0 = Math.hypot(z.x - p.x, z.z - p.z);
    d.lookAt(z.x, z.z, z.y + 1);
    d.click();
    d.advance(1.5);
    return { d0, d1: Math.hypot(z.x - p.x, z.z - p.z), state: z.state };
  }, [WHERE]);
  check('the Mori reels its catch in', r.d1 < r.d0 - 4, `${r.d0.toFixed(1)} -> ${r.d1.toFixed(1)} m (${r.state})`);
}
// the comb's teeth burn down
{
  const r = await D(() => {
    const d = window.__dead;
    const g = d.game;
    const inv = g.session.inv;
    inv.activeSlot = inv.slots.findIndex((s) => s?.id === 'kushibi');
    const c = g.weapons.carried;
    c.ammo.mag = c.ammo.magSize;
    d.advance(0.8);
    d.hold({ fire: true });
    d.advance(3);
    d.releaseAll();
    d.advance(0.1);
    return { mag: c.ammo.mag, size: c.ammo.magSize };
  });
  check('the Kushi-bi burns its teeth as it fires', r.mag <= r.size * 0.7, `${r.mag} of ${r.size} ticks left`);
  await page.screenshot({ path: `${out}/gun-kushibi-burnt.png` });
}

// ---------------------------------------------------------------------------------------------
console.log('\n== the Ōkamuzumi at the revived tree');
await D(() => { const v = window.__dead.game.hirasaka.story.view; v.hairpin = true; v.bossDown = true; v.act = 2; });
await at(P.KUSHI.tree);
await D(() => window.__dead.game.hirasaka.arms['owed'].add('okamuzumi'));
await act('kushi', 3);
await D(() => window.__dead.advance(0.2));
check('the comb becomes the Ōkamuzumi', (await carries('okamuzumi')) && !(await carries('kushibi')));
{
  const one = await fire('okamuzumi', false);
  const six = await fire('okamuzumi', true);
  res.okamuzumi = { one: one.dps, six: six.dps };
  console.log(`  okamuzumi  one: ${String(one.dps).padStart(6)}/s   six: ${String(six.dps).padStart(6)}/s`);
  check('the Ōkamuzumi beats everything boxed, on one and on six', one.dps > best1 && six.dps > best6);
}

// ---------------------------------------------------------------------------------------------
console.log('\n== the workshop rides the cage');
{
  const st = await D(() => { const s = window.__dead.game.entities.stations.find((q) => q.def.kind === 'upgrade'); return { x: s.def.x, z: s.def.z }; });
  check('the pit workshop stands in the cage at the pithead', Math.hypot(st.x - P.WORKSHOP[0].x, st.z - P.WORKSHOP[0].z) < 0.1, `${st.x}, ${st.z}`);
  await D(() => { const v = window.__dead.game.hirasaka.story.view; v.cageAt = 1; window.__dead.advance(0.1); });
  const st2 = await D(() => { const s = window.__dead.game.entities.stations.find((q) => q.def.kind === 'upgrade'); return { x: s.def.x, z: s.def.z, y: s.model.root.position.y }; });
  check('and goes down with the cage to the landing', Math.hypot(st2.x - P.WORKSHOP[1].x, st2.z - P.WORKSHOP[1].z) < 0.1 && st2.y > 8, `${st2.x}, ${st2.z}, y ${st2.y}`);
}

// ---------------------------------------------------------------------------------------------
console.log('\n== each gun in hand');
for (const id of [...built, 'okamuzumi']) {
  await D(([id, W]) => {
    const d = window.__dead;
    const g = d.game;
    d.clearZombies();
    d.teleport(W.x, W.z, -Math.PI / 2, W.y);
    const inv = g.session.inv;
    let at = inv.slots.findIndex((s) => s?.id === id);
    if (at < 0) { d.giveGun(id); at = inv.activeSlot; }
    inv.activeSlot = at;
    const c = g.weapons.carried;
    c.ammo.mag = c.ammo.magSize;
    g.weapons.cancelActions();
    d.look(-Math.PI / 2, 0);
    d.advance(1.2);
  }, [id, WHERE]);
  await page.screenshot({ path: `${out}/gun-${id}.png` });
}
const draws = await D(() => window.__dead.game.renderer.renderer.info.render.calls);
console.log('draw calls at the test spot:', draws);
const errors = reportLogs(logs.filter((l) => !/502 \(Bad Gateway\)/.test(l.text)), { warnings: false });
console.log(`\n${failed} failed, ${errors} console errors`);
console.log(JSON.stringify(res));
await browser.close();
process.exit(failed || errors ? 1 : 0);
