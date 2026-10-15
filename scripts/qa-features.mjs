// QA for the HX-7 rocket launcher, ragdolls, mystery boxes, trapped survivors and the Forge's Vulcan HQ.
// Needs the dev server (`pnpm dev`); BASE overrides its address. SC = folder for screenshots (optional).
import { openPage, reportLogs, sleep } from './lib/browser.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5183/';
const SC = process.env.SC;
let pass = 0;
let fail = 0;
const check = (name, ok, info = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  -> ${info}` : ''}`);
};

async function session(map) {
  const { browser, page, logs } = await openPage({ url: 'about:blank', w: 1280, h: 720 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate((m) => localStorage.setItem('deadsignal.map.v1', m), map);
  await page.evaluate((m) => localStorage.setItem('deadsignal.mode.v1', 'standard'), map);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__dead && window.__dead.game.state === "title"', null, { timeout: 90000 });
  await sleep(800);
  const call = (fn, ...a) => page.evaluate(([f, x]) => window.__dead[f](...x), [fn, a]);
  const shot = async (n) => {
    if (!SC) return;
    await page.evaluate(() => window.__dead.game.frameOnce(1 / 60));
    await page.screenshot({ path: `${SC}/f-${n}.png` });
  };
  return { browser, page, logs, call, shot };
}

// ---------------------------------------------------------------------------------------------
// The District: rocket, ragdolls, mystery box, survivors, death camera
// ---------------------------------------------------------------------------------------------
{
  const { browser, page, logs, call, shot } = await session('district');
  try {
    await call('start');
    await call('freeze', true);
    await call('clearZombies');
    check('three survivors are caged on the District', (await call('squad')).filter((s) => s.kind === 'survivor' && s.trapped).length === 3);

    // ---- rocket into a group ----
    await call('teleport', -20, 22.5, -Math.PI / 2);
    await call('giveWeapon', 'rpg');
    await call('advance', 1.0);
    const ids = [];
    for (const dz of [-1.2, 0, 1.2]) ids.push(await call('spawnZombie', 'shambler', -4, 22.5 + dz, false));
    await call('advance', 0.2);
    await call('lookAt', -4, 22.5, 1.0);
    const before = await call('zombieInfo');
    await shot('01-rpg-aim');
    await call('hold', { ads: true });
    await call('advance', 0.5);
    await shot('01b-rpg-ads');
    await call('hold', { ads: false });
    await call('advance', 0.4);
    await call('click');
    await call('advance', 0.12);
    await shot('02-rpg-flight');
    await call('advance', 0.5);
    let snap = await call('snapshot');
    const mid = await call('zombieInfo');
    const peakY = Math.max(...mid.filter((z) => ids.includes(z.id)).map((z) => z.y));
    await shot('03-rpg-blast');
    check('the rocket kills the group', snap.kills >= 3, `kills=${snap.kills}`);
    check('bodies are thrown into the air', peakY > 0.4, `peak root height ${peakY}`);
    await call('advance', 3);
    const after = await call('zombieInfo');
    const moved = ids.map((id) => {
      const a = before.find((z) => z.id === id);
      const b = after.find((z) => z.id === id);
      return a && b ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
    });
    check('blast throws bodies several metres (one may hit a car)', moved.filter((m) => m > 2).length >= 2, moved.map((m) => m.toFixed(1)).join(' '));
    check('bodies come to rest on the ground', after.filter((z) => ids.includes(z.id)).every((z) => Math.abs(z.y) < 0.05), after.map((z) => z.y).join(' '));
    await shot('04-rpg-bodies');
    snap = await call('snapshot');
    check('the launcher reloads from reserve', snap.weapon.id === 'rpg' && (snap.weapon.reloading || snap.weapon.mag === 1), JSON.stringify(snap.weapon));

    // ---- shotgun vs rifle shove ----
    await call('clearZombies');
    const shove = async (weapon) => {
      await call('giveWeapon', weapon);
      await call('advance', 1);
      const id = await call('spawnZombie', 'shambler', -14, 22.5, false);
      await call('advance', 0.1);
      const z0 = (await call('zombieInfo')).find((z) => z.id === id);
      await call('lookAt', -14, 22.5, 1.2);
      // the shotgun kills in one; the rifle needs a few
      await page.evaluate((zid) => {
        const z = window.__dead.game.zombies.zombies.find((q) => q.id === zid);
        z.hp = 5;
      }, id);
      await call('click');
      await call('advance', 2.5);
      const z1 = (await call('zombieInfo')).find((z) => z.id === id);
      return z1 && z1.state === 'dead' ? Math.hypot(z1.x - z0.x, z1.z - z0.z) : -1;
    };
    const rifle = await shove('rifle');
    await call('clearZombies');
    const shotgun = await shove('shotgun');
    check('a rifle kill nudges the body', rifle > 0.3, rifle.toFixed(2));
    check('a shotgun kill throws it much further', shotgun > rifle * 1.6, `${shotgun.toFixed(2)} vs ${rifle.toFixed(2)}`);
    await call('clearZombies');

    // ---- mystery box ----
    const box = (await call('boxes'))[0];
    const fx = -Math.sin(box.yaw);
    const fz = -Math.cos(box.yaw);
    await call('teleport', box.x + fx * 1.6, box.z + fz * 1.6);
    await call('lookAt', box.x, box.z, 0.6);
    await call('hold', { interact: true });
    await call('advance', 1.0);
    await call('hold', { interact: false });
    let b = (await call('boxes')).find((q) => q.id === box.id);
    check('holding E opens the box and the reel spins', b.phase === 'spin', b.phase);
    await call('advance', 1.2);
    await shot('05-box-spin');
    await call('advance', 1.6);
    b = (await call('boxes')).find((q) => q.id === box.id);
    check('the reel lands on a prize and offers it', b.phase === 'offer' && !!b.prize, JSON.stringify(b.prize));
    await shot('06-box-offer');
    // make sure taking it does something (room for ammo and grenades)
    await call('give', { grenades: 0 });
    await page.evaluate(() => { for (const w of window.__dead.game.session.inv.slots) if (w) w.ammo.reserve = 0; });
    const inv0 = await call('snapshot');
    await call('press', 'interact');
    await call('advance', 0.2);
    const inv1 = await call('snapshot');
    b = (await call('boxes')).find((q) => q.id === box.id);
    const changed = JSON.stringify(inv0.slots) !== JSON.stringify(inv1.slots) || inv0.grenades !== inv1.grenades;
    check('pressing E takes the prize', b.phase === 'gone' && changed, `${b.prize.kind}${b.prize.id ? ` ${b.prize.id}` : ''}`);
    // a second box, left alone, takes its prize back
    const box2 = (await call('boxes'))[1];
    await call('teleport', box2.x - Math.sin(box2.yaw) * 1.6, box2.z - Math.cos(box2.yaw) * 1.6);
    await call('lookAt', box2.x, box2.z, 0.6);
    await call('hold', { interact: true });
    await call('advance', 1.0);
    await call('hold', { interact: false });
    await call('advance', 2.8 + 12.5);
    b = (await call('boxes')).find((q) => q.id === box2.id);
    check('a prize left alone sinks back into the box', b.phase === 'gone', b.phase);

    // ---- survivors ----
    const cage = (await call('squad')).find((s) => s.trapped);
    await call('teleport', cage.x, cage.z - 2.2, 0);
    await call('lookAt', cage.x, cage.z, 1.2);
    await call('advance', 0.3);
    await shot('07-cage');
    const prompt = await page.evaluate(() => window.__dead.game.interaction.update(0, { interactPressed: false, digits: [] }, false).prompt?.text ?? '');
    check('the cage offers to free its survivor', prompt.startsWith('FREE '), prompt);
    await call('hold', { interact: true });
    await call('advance', 2.3);
    await call('hold', { interact: false });
    let sq = await call('squad');
    const freed = sq.find((s) => s.name === cage.name);
    check('holding E frees the survivor', freed && !freed.trapped, JSON.stringify(freed));
    // the survivor follows (regrouping when left far behind) and shoots, out on the open road
    await call('teleport', -20, 22.5, -Math.PI / 2);
    await call('advance', 3);
    sq = await call('squad');
    const near = sq.find((s) => s.name === cage.name);
    check('the freed survivor follows the player', near && Math.hypot(near.x + 20, near.z - 22.5) < 12, JSON.stringify(near));
    // in the open, 10 m down the road from wherever the survivor regrouped (a parked car can block one side); nothing
    // else around, or the survivor rightly shoots whatever is nearer
    await call('clearZombies');
    const zid = await page.evaluate(([nx, nz]) => {
      const g = window.__dead.game;
      for (const dx of [10, -10, 0]) {
        const x = nx + dx;
        const z = nz + (dx === 0 ? 10 : 0);
        if (!g.level.world.segmentBlocked(nx, 1.45, nz, x, 1.2, z, 'shots')) return window.__dead.spawnZombie('shambler', x, z, false);
      }
      return window.__dead.spawnZombie('shambler', nx + 10, nz, false);
    }, [near.x, near.z]);
    await call('advance', 6);
    const target = (await call('zombieInfo')).find((z) => z.id === zid);
    check('the freed survivor shoots the infected', !target || target.state === 'dead' || target.hp < target.maxHp, target ? `${target.state} ${target.hp}/${target.maxHp}` : 'gone');
    await shot('08-survivor');
    // and can die, falling over
    await page.evaluate((name) => {
      const g = window.__dead.game;
      const a = g.squad.allies.find((q) => q.name === name);
      g.squad.hurt(a, 999, a.ref.x + 1, a.ref.z, 3);
    }, cage.name);
    await call('advance', 1.2);
    sq = await call('squad');
    const dead = sq.find((s) => s.name === cage.name);
    check('a killed survivor falls and stays down', dead && !dead.alive && dead.fallen, JSON.stringify(dead));
    await shot('09-survivor-down');

    // ---- player death ragdoll ----
    await call('setHealth', 5, 0);
    const p0 = await call('snapshot');
    await page.evaluate(() => {
      const g = window.__dead.game;
      g.blastPlayer(400, g.player.x + 2, g.player.z, 0.9);
    });
    await call('advance', 0.6);
    const cam = await page.evaluate(() => { const c = window.__dead.game.renderer.camera; return { x: c.position.x, y: c.position.y, z: c.position.z, roll: c.rotation.z }; });
    check('a killing blast throws the death camera', Math.hypot(cam.x - p0.player.x, cam.z - p0.player.z) > 1 && Math.abs(cam.roll) > 0.3, JSON.stringify(cam));
    await shot('10-death-cam');
  } catch (e) {
    fail++;
    console.log('SCRIPT ERROR', e.stack || e.message);
  } finally {
    const errors = reportLogs(logs, { warnings: false });
    check('no page errors on the District', errors === 0, `${errors} errors`);
    await browser.close();
  }
}

// ---------------------------------------------------------------------------------------------
// The Forge: Vulcan HQ, named infected, two co-leaders in the squad, the clan holed up in rooms
// ---------------------------------------------------------------------------------------------
{
  const { browser, page, logs, call, shot } = await session('forge');
  try {
    await call('start');
    await call('freeze', true);
    const sq = await call('squad');
    const leads = sq.filter((s) => s.kind === 'soldier').map((s) => s.name);
    check('two of the co-leaders deploy', leads.length === 2 && leads.every((n) => ['Athy', 'Marv03K', 'piryriry'].includes(n)), leads.join(', '));
    check('nobody is caged on the Forge', sq.every((s) => s.kind !== 'survivor'));
    const holdouts = await page.evaluate(() => window.__dead.game.forge.story.view.holdouts.map((h) => h.name));
    check('tomoe, Anya and four members are holed up', holdouts.includes('tomoe') && holdouts.includes('Anya') && holdouts.length === 7, holdouts.join(', '));
    const tags = (await call('zombieInfo')).filter((z) => z.tag).map((z) => z.tag);
    check('some infected carry Vulcan names', tags.length >= 3, `${tags.length}: ${tags.slice(0, 6).join(', ')}`);
    check('names are not repeated', new Set(tags).size === tags.length);
    // the HQ billboard, from the plaza
    await call('clearZombies');
    await call('teleport', 46, -6, Math.PI);
    await call('look', Math.PI, 0.22);
    await call('advance', 0.5);
    await sleep(1200); // the logo image loads
    await shot('11-vulcan-hq');
    await call('teleport', 0, 14, 0);
    await call('look', 0, -0.6);
    await call('advance', 0.2);
    await shot('12-crossroads');
    // a named kill shows the name in the feed
    const zid = await page.evaluate(() => {
      const g = window.__dead.game;
      const z = g.zombies.spawn('shambler', g.player.x, g.player.z - 8, g.rng, {});
      return z.id;
    });
    const tag = await page.evaluate((id) => {
      const g = window.__dead.game;
      const z = g.zombies.zombies.find((q) => q.id === id);
      z.tag = 'Kratox';
      g.zombies.damage(z, 9999, false, g.zenv, 0);
      return z.state;
    }, zid);
    check('named infected die like any other', tag === 'dead');
  } catch (e) {
    fail++;
    console.log('SCRIPT ERROR', e.stack || e.message);
  } finally {
    const errors = reportLogs(logs, { warnings: false });
    check('no page errors on the Forge', errors === 0, `${errors} errors`);
    await browser.close();
  }
}

console.log(`${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
