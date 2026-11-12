// ZARYA's six guns, as the player sees them and as the numbers say: for each gun a contact sheet (held at the hip,
// aimed, mid reload, the moment of a shot) and its own stills, then each is fired at spawned infected and what it did is
// measured against its line in the table (`config.ts`: WEAPONS and ZARYA_GUNS).
//
//   node scripts/qa-zarya-guns.mjs [url] [w] [h]      default http://127.0.0.1:5183/ at 640x360 a tile
//   ONLY=signalka,zenit ...                            just those guns
//   LOOK=0 / NUM=0 ...                                 skip the pictures / the numbers
//
// Writes shots/zarya/gun-<id>-<moment>.png and gun-<id>-sheet.png (SC picks another folder).
import { mkdirSync } from 'node:fs';
import { openPage, reportLogs } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 640);
const h = Number(process.argv[4] ?? 360);
const out = process.env.SC ?? 'shots/zarya';
mkdirSync(out, { recursive: true });
const all = ['signalka', 'arbalet', 'gvozdomyot', 'salyut', 'ottepel', 'zenit', 'raketa'];
const ids = process.env.ONLY ? process.env.ONLY.split(',') : all;

const { browser, context, page, logs } = await openPage({ w, h });
// other people are editing this project while it is measured: the dev server's hot reload is kept out of this page, so
// a file saved somewhere else does not reload it in the middle of a run
await page.addInitScript(() => {
  const Real = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (protocols === 'vite-hmr' || (Array.isArray(protocols) && protocols.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return new Real(url, protocols);
  };
});
await page.goto(`${base}?nolock`, { waitUntil: 'load' });
const D = (fn, ...args) => page.evaluate(fn, ...args);
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
const WHERE = (process.env.AT ?? '-44,0').split(',').map(Number);
await D(([x, z]) => {
  const d = window.__dead;
  const g = d.game;
  // on this map nothing is in the player's hands until the story arms them: put the story past that
  const s = g.zarya.story;
  s.ch = 3;
  s.f = 1 | 2 | 4 | 32;
  g.zombies.rateMul = 0; // nobody walks in on the test
  g.zombies.capBonus = -999;
  d.clearZombies();
  g.squad.reset(false, false); // nobody else shooting at what is measured
  g.melee?.setOut(false);
  d.teleport(x, z, -Math.PI / 2);
  d.setHealth(100, 100);
}, WHERE);
await D(() => window.__dead.advance(6)); // the opening banner gone
// from here the page only draws: time moves when this script says so (`advance`), so every picture is of its moment
await D(() => window.__dead.freeze(true));
const hudOff = process.env.HUD ? null : await page.addStyleTag({ content: '.ds-hud, .ds-touch-layer, .ds-prompt { opacity: 0 !important; }' });

const reset = (id) =>
  D((id) => {
    const d = window.__dead;
    d.releaseAll();
    d.clearZombies();
    d.game.melee?.setOut(false);
    d.giveWeapon(id);
    d.look(-Math.PI / 2, 0);
    d.setHealth(100, 100);
    d.advance(1.2);
  }, id);

// ---------------------------------------------------------------------------------------------
// the pictures
// ---------------------------------------------------------------------------------------------
if (process.env.LOOK !== '0') {
  const sheet = await context.newPage();
  for (const id of ids) {
    await reset(id);
    const tiles = [];
    const snap = async (label) => {
      const file = `${out}/gun-${id}-${label}.png`;
      // (a busy machine can take a while to hand a frame over: once more before giving up)
      const png = await page.screenshot({ path: file, timeout: 60000 }).catch(() => page.screenshot({ path: file, timeout: 120000 }));
      tiles.push({ label, src: `data:image/png;base64,${png.toString('base64')}` });
    };
    await snap('hip');
    // the same moment with the HUD over it (its picture of the gun, its fire-mode word, its count)
    await hudOff?.evaluate((n) => { n.disabled = true; });
    await page.screenshot({ path: `${out}/gun-${id}-hud.png`, timeout: 120000 });
    await hudOff?.evaluate((n) => { n.disabled = false; });
    await D(() => {
      window.__dead.hold({ ads: true });
      window.__dead.advance(0.7);
    });
    await snap('ads');
    await D(() => {
      window.__dead.releaseAll();
      window.__dead.advance(0.6);
    });
    // (the Raketa: first the suck, held, with its lamps counting; its shot is the blast as it is let go)
    if (id === 'raketa') {
      await D(() => {
        const d = window.__dead;
        d.game.weapons.carried.ammo.mag = 0;
        d.hold({ fire: true });
        d.advance(1.0);
      });
      await snap('suck');
    }
    // the moment of a shot (two frames in), then the middle of whatever reload follows
    await D((id) => {
      const d = window.__dead;
      if (id === 'raketa') {
        d.releaseAll();
        d.advance(2 / 60);
      } else if (id === 'ottepel') {
        d.hold({ fire: true });
        d.advance(0.35);
      } else if (id === 'gvozdomyot') {
        // (its barrels up to full speed: half a second of spin-up, then a moment at 1700 a minute)
        d.hold({ fire: true });
        d.advance(0.8);
      } else {
        d.click();
        d.advance(2 / 60);
      }
    }, id);
    await snap('fire');
    await D((id) => {
      const d = window.__dead;
      d.releaseAll();
      const def = d.weaponDefs[id];
      if (id === 'gvozdomyot') d.press('reload');
      if (id === 'ottepel' || id === 'zenit' || id === 'raketa') d.advance(0.5);
      // (the nail gun's long reload: the drum caught as it drops)
      else if (id === 'gvozdomyot') d.advance(def.reloadEmpty * 0.22);
      else d.advance(0.5 + def.reloadEmpty * 0.42);
    }, id);
    await snap(id === 'ottepel' || id === 'zenit' || id === 'raketa' ? 'after' : 'reload');
    await sheet.setViewportSize({ width: w * 2, height: (h + 22) * 2 });
    await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(2,${w}px);font:13px sans-serif;color:#eee">${tiles
      .map((t) => `<div><div style="height:22px;line-height:22px;padding-left:6px">${id} / ${t.label}</div><img src="${t.src}" width="${w}" height="${h}" style="display:block"></div>`)
      .join('')}</body>`);
    await sheet.screenshot({ path: `${out}/gun-${id}-sheet.png` });
    console.log('wrote', `${out}/gun-${id}-sheet.png`);
  }
  await sheet.close();
}

// ---------------------------------------------------------------------------------------------
// the numbers
// ---------------------------------------------------------------------------------------------
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
// infected stood in a row `dist` metres in front of the player (who faces +X... yaw -PI/2 looks toward +X)
const spawnRow = (type, dists, side = 0) =>
  D(
    ([type, dists, side]) => {
      const d = window.__dead;
      const g = d.game;
      const p = g.player;
      return dists.map((dist, i) => {
        const id = d.spawnZombie(type, p.x + dist, p.z + (Array.isArray(side) ? side[i] : side), false);
        const z = g.zombies.zombies.find((q) => q.id === id);
        z.maxHp = z.hp = 100000; // a post to measure on
        z.dormant = false;
        return id;
      });
    },
    [type, dists, side],
  );
const hpLost = (ids) => D((ids) => ids.map((id) => 100000 - (window.__dead.game.zombies.zombies.find((q) => q.id === id)?.hp ?? 100000)), ids);
const zs = (ids) => D((ids) => ids.map((id) => { const z = window.__dead.game.zombies.zombies.find((q) => q.id === id); return z ? { state: z.state, markedT: +z.markedT.toFixed(2), hp: z.hp } : null; }), ids);
const aimAt = (id, head = false) =>
  D(([id, head]) => {
    const d = window.__dead;
    const z = d.game.zombies.zombies.find((q) => q.id === id);
    d.lookAt(z.x, z.z, z.y + (head ? z.def.height - z.def.headRadius : 1.0));
  }, [id, head]);
const still = () => D(() => { for (const z of window.__dead.game.zombies.zombies) { z.speedScale = 0; } });

if (process.env.NUM !== '0') {
  for (const id of ids) {
    await reset(id);
    const def = await D((id) => { const d = window.__dead.weaponDefs[id]; const c = window.__dead.game.weapons.carried; return { damage: d.damage, fireInterval: d.fireInterval, reload: d.reloadEmpty, mag: c.ammo.mag, reserve: c.ammo.reserve, noise: d.noise, auto: d.auto, name: d.name }; }, id);
    console.log(`\n== ${id}: ${def.name}  mag ${def.mag}  reserve ${def.reserve}`);

    if (id === 'signalka') {
      check('one flare loaded, 12 in reserve', def.mag === 1 && def.reserve === 12, `${def.mag} / ${def.reserve}`);
      const [a] = await spawnRow('shambler', [12]);
      await still();
      await aimAt(a);
      await D(() => window.__dead.click());
      await D(() => window.__dead.advance(0.6));
      const [lost] = await hpLost([a]);
      const [st] = await zs([a]);
      check('a hit does 180', Math.abs(lost - 180) < 1, `${lost}`);
      check('and marks it for 10 s', st.markedT > 9 && st.markedT <= 10, `markedT ${st.markedT}`);
      const glow = await D((a) => { const z = window.__dead.game.zombies.zombies.find((q) => q.id === a); return !!z.rig.root.userData.markGlow?.visible; }, a);
      check('the mark is drawn on it', glow);
      // what a marked one looks like (one stood nearer, marked the same way)
      await D(() => { const d = window.__dead; const p = d.game.player; const id = d.spawnZombie('shambler', p.x + 5, p.z - 1.2, false); const z = d.game.zombies.zombies.find((q) => q.id === id); z.speedScale = 0; z.mark(10); d.look(-Math.PI / 2, 0); d.advance(0.1); });
      await page.screenshot({ path: `${out}/gun-signalka-mark.png`, timeout: 120000 });
      await D(() => { const d = window.__dead; const z = d.game.zombies.zombies[d.game.zombies.zombies.length - 1]; z.x += 60; });
      // double from every source: the dev hook's plain damage
      await D((a) => window.__dead.damageZombie(a, 50), a);
      const [lost2] = await hpLost([a]);
      check('a marked infected takes double (50 -> 100)', Math.abs(lost2 - lost - 100) < 1, `${lost2 - lost}`);
      // reload about 1.8 s: from the shot to a loaded flare (the reload begins by itself 0.45 s after the shot)
      const t = await D(() => { const d = window.__dead; let t = 0; while (d.game.weapons.carried.ammo.mag === 0 && t < 5) { d.advance(1 / 60); t += 1 / 60; } return t; });
      const reserve = await D(() => window.__dead.game.weapons.carried.ammo.reserve);
      check('reloads in about 1.8 s (the transfer is at 70% of it)', t > 0.4 && t < 1.8, `loaded again ${(t + 0.6).toFixed(2)} s after the shot; reserve ${reserve}`);
      await D(() => window.__dead.advance(9.5));
      const [st2] = await zs([a]);
      check('the mark runs out', st2.markedT === 0, `markedT ${st2.markedT}`);
      const single = await D((a) => { const z = window.__dead.game.zombies.zombies.find((q) => q.id === a); const h = z.hp; window.__dead.damageZombie(a, 50); return h - z.hp; }, a);
      check('and then damage is single again', Math.abs(single - 50) < 1, `${single}`);
    }

    if (id === 'arbalet') {
      check('one bolt, 30 in reserve', def.mag === 1 && def.reserve === 30, `${def.mag} / ${def.reserve}`);
      const row = await spawnRow('shambler', [8, 9.2, 10.4, 11.6]);
      await still();
      await aimAt(row[0]);
      // an idle infected a way off, to hear (or not) the shot
      const far = await D(() => { const d = window.__dead; const p = d.game.player; return d.spawnZombie('shambler', p.x - 34, p.z, false); });
      await D(() => window.__dead.click());
      await D(() => window.__dead.advance(0.2));
      const lost = await hpLost(row);
      check('320 to the first body', Math.abs(lost[0] - 320) < 1, `${lost[0]}`);
      check('through two bodies and into a third, no further', lost[1] === 320 && lost[2] === 320 && lost[3] === 0, lost.join(', '));
      await D(() => window.__dead.advance(1.8)); // (a noise is heard after a moment that grows with the distance)
      const [fz] = await zs([far]);
      check('silent: an idle infected 34 m behind hears nothing', fz.state === 'idle', fz.state);
      await D(() => window.__dead.advance(0.6));
      await D((ids) => { for (const id of ids.slice(1)) { const z = window.__dead.game.zombies.zombies.find((q) => q.id === id); z.x += 40; } }, row);
      await aimAt(row[0], true);
      const before = (await hpLost([row[0]]))[0];
      await D(() => window.__dead.click());
      await D(() => window.__dead.advance(0.2));
      const after = (await hpLost([row[0]]))[0];
      check('a headshot does x2.5 (800)', Math.abs(after - before - 800) < 1, `${after - before}`);
      const t = await D(() => { const d = window.__dead; let t = 0; while (d.game.weapons.carried.ammo.mag === 0 && t < 5) { d.advance(1 / 60); t += 1 / 60; } return t; });
      check('reloads in about 1.5 s', t > 0.3 && t < 1.5, `loaded again ${(t + 0.2).toFixed(2)} s after the shot`);
      // the rifle, for the comparison: it does wake that infected
      await D(() => { window.__dead.giveWeapon('rifle'); window.__dead.advance(1); window.__dead.look(-Math.PI / 2, 0.5); window.__dead.click(); window.__dead.advance(1.8); });
      const [fz2] = await zs([far]);
      check('(the rifle, from the same place, does wake it)', fz2.state !== 'idle', fz2.state);
    }

    if (id === 'gvozdomyot') {
      check('a 150-nail drum, 450 in reserve', def.mag === 150 && def.reserve === 450, `${def.mag} / ${def.reserve}`);
      const [a] = await spawnRow('shambler', [7]);
      await still();
      await aimAt(a);
      // held from still: when the first nail leaves, how many leave in each half second after, what each does
      const fire = await D((a) => {
        const d = window.__dead;
        const g = d.game;
        const z = g.zombies.zombies.find((q) => q.id === a);
        const c = g.weapons.carried;
        d.hold({ fire: true });
        const halves = [];
        const steps = [];
        let first = -1;
        let mag = c.ammo.mag;
        let hp = z.hp;
        let n = 0;
        let slow = 1;
        for (let i = 0; i < 150; i++) {
          d.lookAt(z.x, z.z, z.y + 0.9);
          d.advance(1 / 60);
          const shot = mag - c.ammo.mag;
          mag = c.ammo.mag;
          if (shot > 0 && first < 0) first = (i + 1) / 60;
          n += shot;
          if ((i + 1) % 30 === 0) {
            halves.push(n);
            n = 0;
          }
          if (z.hp !== hp) steps.push(+(hp - z.hp).toFixed(2));
          hp = z.hp;
          slow = Math.min(slow, g.weapons.moveMul);
        }
        const spin = g.weapons.barrelSpin;
        d.releaseAll();
        d.advance(0.2);
        const after02 = g.weapons.barrelSpin;
        d.advance(0.8);
        return { halves, steps, first, spin, after02, after10: g.weapons.barrelSpin, slow, idle: g.weapons.moveMul, used: 150 - c.ammo.mag };
      }, a);
      check('a short spin-up: the first nail leaves after about a fifth of a second', fire.first > 0.08 && fire.first < 0.3, `${fire.first.toFixed(2)} s`);
      check('the rate climbs over the first half second', fire.halves[0] < fire.halves[2] * 0.75, `nails per half second: ${fire.halves.join(', ')}`);
      const full = (fire.halves[2] + fire.halves[3] + fire.halves[4]) / 1.5;
      check('then about 1500-1800 a minute', full * 60 >= 1500 && full * 60 <= 1850, `${(full * 60).toFixed(0)} rpm`);
      check('28 a nail (49 to the head)', fire.steps.length > 0 && fire.steps.every((v) => Math.abs(v - 28) < 0.5 || Math.abs(v - 49) < 0.5 || Math.abs(v - 56) < 0.5), `${fire.steps.length} hits of ${[...new Set(fire.steps)].join(' / ')}`);
      check('the barrels at full speed while it fires, and winding down after', fire.spin > 0.99 && fire.after02 > 0.4 && fire.after02 < 0.95 && fire.after10 === 0, `spin ${fire.spin.toFixed(2)}, 0.2 s after ${fire.after02.toFixed(2)}, 1 s after ${fire.after10.toFixed(2)}`);
      check('heavy, and slower still while it turns', fire.idle < 0.95 && fire.slow < fire.idle * 0.85, `walk x${fire.idle.toFixed(2)} held, x${fire.slow.toFixed(2)} firing`);
      // the slow, walked: two seconds forward, firing against not
      const walk = await D(() => {
        const d = window.__dead;
        const g = d.game;
        d.clearZombies();
        d.giveWeapon('gvozdomyot');
        d.advance(1);
        const p = g.player;
        const leg = (fire) => {
          d.look(-Math.PI / 2, 0);
          const x0 = p.x;
          const z0 = p.z;
          d.hold({ forward: true, fire });
          d.advance(0.8);
          const x1 = p.x;
          const z1 = p.z;
          d.advance(1.5);
          const v = Math.hypot(p.x - x1, p.z - z1) / 1.5;
          d.releaseAll();
          d.advance(1.2);
          d.teleport(x0, z0, -Math.PI / 2);
          d.advance(0.2);
          void z0;
          return v;
        };
        const plain = leg(false);
        const firing = leg(true);
        return { plain, firing };
      });
      check('a player firing it walks slower', walk.firing < walk.plain * 0.88, `${walk.plain.toFixed(2)} m/s walking, ${walk.firing.toFixed(2)} m/s firing`);
      // a drum lasts about five seconds held down
      const drum = await D(() => {
        const d = window.__dead;
        d.giveWeapon('gvozdomyot');
        d.advance(1);
        const c = d.game.weapons.carried;
        c.ammo.mag = c.ammo.magSize;
        d.look(-Math.PI / 2, 0.3);
        d.hold({ fire: true });
        let t = 0;
        while (c.ammo.mag > 0 && t < 12) {
          d.advance(1 / 60);
          t += 1 / 60;
        }
        d.releaseAll();
        return t;
      });
      check('a full drum lasts about five seconds held down (spin-up and all)', drum > 4.8 && drum < 6.4, `${drum.toFixed(2)} s`);
      // a charging line is stopped: an armoured one sent at the player from 12 m, how near does it get in 3 s under fire?
      await D(() => { window.__dead.clearZombies(); window.__dead.giveWeapon('gvozdomyot'); window.__dead.advance(1); });
      const run = await D(() => {
        const d = window.__dead;
        const p = d.game.player;
        const id = d.spawnZombie('armored', p.x + 12, p.z, true);
        const z = d.game.zombies.zombies.find((q) => q.id === id);
        z.maxHp = z.hp = 100000;
        d.hold({ fire: true });
        let stag = 0;
        let n = 0;
        for (let i = 0; i < 180; i++) {
          d.lookAt(z.x, z.z, 1.0);
          d.advance(1 / 60);
          if (z.state === 'stagger') stag++;
          n++;
        }
        d.releaseAll();
        return { dist: Math.hypot(z.x - p.x, z.z - p.z), stag: stag / n };
      });
      check('an armoured one charging from 12 m is held back by the nails', run.dist > 6 && run.stag > 0.4, `after 3 s it is ${run.dist.toFixed(1)} m away, staggered ${(run.stag * 100).toFixed(0)}% of the time`);
      const t = await D(() => { const d = window.__dead; d.giveWeapon('gvozdomyot'); d.advance(1); const a = d.game.weapons.carried.ammo; a.mag = 0; d.press('reload'); let t = 0; while (a.mag === 0 && t < 8) { d.advance(1 / 60); t += 1 / 60; } while (a.reload && t < 8) { d.advance(1 / 60); t += 1 / 60; } return t; });
      check('a long reload: 4.5 s', Math.abs(t - 4.5) < 0.1, `${t.toFixed(2)} s`);
      // and nothing fires meanwhile, however the trigger is held
      const busy = await D(() => { const d = window.__dead; const a = d.game.weapons.carried.ammo; a.mag = 0; d.press('reload'); d.advance(0.3); d.hold({ fire: true }); d.advance(2); const m = a.mag; const sp = d.game.weapons.barrelSpin; d.releaseAll(); return { m, sp }; });
      check('nothing fires and the barrels stay still while the drum is changed', busy.m === 0 && busy.sp === 0, `mag ${busy.m}, spin ${busy.sp}`);
    }

    if (id === 'salyut') {
      check('one volley, six in reserve', def.mag === 1 && def.reserve === 6, `${def.mag} / ${def.reserve}`);
      // a crowd 22 m out, five across
      const row = await spawnRow('shambler', [22, 22, 22, 22, 22, 22.5, 27], [-3, -1.5, 0, 1.5, 3, 0, 0]);
      await still();
      await D(() => window.__dead.look(-Math.PI / 2, 0.02));
      const rockets = await D(() => { const d = window.__dead; d.click(); return d.game.grenades.rockets?.length ?? -1; });
      await D(() => window.__dead.advance(0.3));
      await page.screenshot({ path: `${out}/gun-salyut-flight.png`, timeout: 120000 });
      await D(() => window.__dead.advance(0.36));
      await page.screenshot({ path: `${out}/gun-salyut-burst.png`, timeout: 120000 });
      await D(() => window.__dead.advance(1.0));
      const lost = await hpLost(row);
      check('one pull, five rockets', rockets === 5, `${rockets}`);
      check('every one of a crowd five across is hit', lost.slice(0, 5).every((v) => v > 200), lost.map((v) => Math.round(v)).join(', '));
      check('about 420 at a blast\'s centre (the middle one stands in several)', lost[2] >= 380, `${Math.round(lost[2])}`);
      // point blank at a wall: what the firer takes, against the HX-7's
      const self = async (gun) => D((gun) => {
        const d = window.__dead;
        d.clearZombies();
        d.giveWeapon(gun);
        d.setHealth(1000, 0);
        d.game.session.vitals.health = 1000;
        d.advance(1);
        d.look(-Math.PI / 2, -1.2); // at the floor in front of the feet
        d.click();
        d.advance(1.5);
        const lost = 1000 - d.game.session.vitals.health;
        d.setHealth(100, 100);
        return lost;
      }, gun);
      const mine = await self('salyut');
      const theirs = await self('rpg');
      check('the firer takes much less from a volley at their feet than from one HX-7 rocket', mine < theirs * 0.5, `Salyut ${mine.toFixed(0)}, HX-7 ${theirs.toFixed(0)}`);
      const t = await D(() => { const d = window.__dead; d.giveWeapon('salyut'); d.advance(1); d.look(-Math.PI / 2, 0.6); d.click(); let t = 0; while (d.game.weapons.carried.ammo.mag === 0 && t < 6) { d.advance(1 / 60); t += 1 / 60; } while (d.game.weapons.carried.ammo.reload && t < 6) { d.advance(1 / 60); t += 1 / 60; } return t; });
      check('reloads in 3 s', t > 3.2 && t < 3.7, `${t.toFixed(2)} s from the shot (0.45 s before it begins)`);
    }

    if (id === 'ottepel') {
      check('a gauge of 100, nothing in reserve', def.mag === 100 && def.reserve === 0, `${def.mag} / ${def.reserve}`);
      // in the cone at 5 m and 9.5 m, outside it to the side, beyond it, and one behind a wall is tried below
      const row = await spawnRow('shambler', [5, 9.5, 5, 12], [0, 0, 4.2, 0]);
      await still();
      await D(() => window.__dead.look(-Math.PI / 2, -0.06));
      await D(() => { window.__dead.hold({ fire: true }); window.__dead.advance(2.1); window.__dead.releaseAll(); });
      const lost = await hpLost(row);
      const gauge = await D(() => window.__dead.game.weapons.carried.ammo.mag);
      check('900 a second to what is in the steam, in ticks of 180', lost[0] === lost[1] && lost[0] % 180 === 0 && Math.abs(lost[0] / 2.1 - 900) <= 90, `${lost[0]} and ${lost[1]} in 2.1 s held = ${lost[0] / 180} ticks`);
      check('nothing 40 degrees off to the side, nothing past 10 m', lost[2] === 0 && lost[3] === 0, `${lost[2]}, ${lost[3]}`);
      check('drains 14 a second', Math.abs(100 - gauge - 29.4) < 1, `${(100 - gauge).toFixed(1)} in 2.1 s`);
      await D(() => window.__dead.advance(2));
      const gauge2 = await D(() => window.__dead.game.weapons.carried.ammo.mag);
      check('refills 6 a second by itself', Math.abs(gauge2 - gauge - 12) < 0.5, `${(gauge2 - gauge).toFixed(1)} in 2 s`);
      // held until dry, and on: it never stays dry
      const dry = await D(() => { const d = window.__dead; d.hold({ fire: true }); d.advance(8); const low = d.game.weapons.carried.ammo.mag; d.advance(4); const still = d.game.weapons.carried.ammo.mag; d.releaseAll(); d.advance(5); return { low, still, back: d.game.weapons.carried.ammo.mag }; });
      check('held past empty it sputters on and never runs dry for good', dry.low < 9 && dry.still < 9 && dry.back > 25, `gauge ${dry.low.toFixed(1)} after 8 s held, ${dry.still.toFixed(1)} after 12 s, ${dry.back.toFixed(1)} five seconds after letting go`);
      // on the back (the other slot in hand) it still makes pressure
      const back = await D(() => { const d = window.__dead; const inv = d.game.session.inv; const o = inv.activeSlot === 0 ? 1 : 0; const mine = inv.slots[inv.activeSlot]; mine.ammo.mag = 10; inv.slots[o] = inv.slots[o] ?? null; d.giveWeapon('ottepel'); const me = inv.slots[inv.activeSlot]; me.ammo.mag = 10; inv.slots[o] = me; inv.slots[inv.activeSlot] = null; d.game.session.inv.slots[inv.activeSlot] = null; d.advance(2); const v = me.ammo.mag; inv.slots[inv.activeSlot] = me; inv.slots[o] = null; return v; });
      check('it makes pressure on the back too', Math.abs(back - 22) < 0.5, `10 -> ${back.toFixed(1)} in 2 s`);
    }

    if (id === 'zenit') {
      check('twelve flashbulbs, no reserve', def.mag === 12 && def.reserve === 0, `${def.mag} / ${def.reserve}`);
      // in the cone at 6 and 17 m, outside it at the side and beyond 18 m; and a boss
      const row = await spawnRow('shambler', [6, 17, 6, 20], [0, 0, 5.5, 0]);
      const [boss] = await D(() => { const d = window.__dead; const g = d.game; const p = g.player; const z = g.zombies.spawn('warden', p.x + 10, p.z + 2, g.rng, { boss: true }); z.dormant = false; return [z.id]; });
      await still();
      await D(() => window.__dead.look(-Math.PI / 2, 0));
      await D(() => window.__dead.click());
      const st = await zs([...row, boss]);
      const lost = await hpLost(row);
      check('everything in the cone is staggered, nothing outside it', st[0].state === 'stagger' && st[1].state === 'stagger' && st[2].state !== 'stagger' && st[3].state !== 'stagger', st.map((s) => s.state).join(', '));
      check('it hurts nobody', lost.every((v) => v === 0), lost.join(', '));
      check('a boss is staggered too', st[4].state === 'stagger', st[4].state);
      const times = await D(([a, b]) => {
        const d = window.__dead;
        const za = d.game.zombies.zombies.find((q) => q.id === a);
        const zb = d.game.zombies.zombies.find((q) => q.id === b);
        let ta = -1;
        let tb = -1;
        let t = 1 / 60;
        while (t < 6 && (ta < 0 || tb < 0)) {
          d.advance(1 / 60);
          t += 1 / 60;
          if (ta < 0 && za.state !== 'stagger') ta = t;
          if (tb < 0 && zb.state !== 'stagger') tb = t;
        }
        return [ta, tb];
      }, [row[0], boss]);
      check('for 3.5 seconds, a boss for 1', Math.abs(times[0] - 3.5) < 0.1 && Math.abs(times[1] - 1) < 0.1, `${times[0].toFixed(2)} s, boss ${times[1].toFixed(2)} s`);
      const n = await D(() => { const d = window.__dead; d.giveWeapon('zenit'); d.advance(1); let n = 0; const a = d.game.weapons.carried.ammo; d.hold({ fire: false }); const t0 = a.mag; d.click(); d.advance(0.6); d.click(); d.advance(0.5); const mid = t0 - a.mag; d.advance(0.3); d.click(); d.advance(0.1); n = t0 - a.mag; return { mid, n, reload: !!a.reload, reserve: a.reserve }; });
      check('1.2 s between flashes, no reload', n.mid === 1 && n.n === 2 && !n.reload && n.reserve === 0, `1 flash in the first 1.1 s, ${n.n} after 1.5 s`);
    }

    // ZARYA's sack gun: hold to suck (drags the infected in its cone in, reeling, and swallows rounds), let go to fire them all
    if (id === 'raketa') {
      check('six rounds in it, no reserve', def.mag === 6 && def.reserve === 0, `${def.mag} / ${def.reserve}`);
      const emptied = await D(() => { const d = window.__dead; d.look(-Math.PI / 2, 0.9); d.hold({ fire: true }); d.advance(0.1); d.releaseAll(); d.advance(0.8); return d.game.weapons.carried.ammo.mag; });
      check('let go, it fires everything it holds at once', emptied === 0, `${emptied} left`);
      // one in the cone 7 m ahead, one 7 m ahead and 7 m to the side
      const row = await spawnRow('shambler', [7, 7], [0, 7]);
      await still();
      const where = (ids) => D((ids) => { const p = window.__dead.game.player; return ids.map((i) => { const z = window.__dead.game.zombies.zombies.find((q) => q.id === i); return +Math.hypot(z.x - p.x, z.z - p.z).toFixed(2); }); }, ids);
      const d0 = await where(row);
      await D(() => { const d = window.__dead; d.look(-Math.PI / 2, 0); d.hold({ fire: true }); d.advance(2.5); });
      const d1 = await where(row);
      const held = await D(() => window.__dead.game.weapons.carried.ammo.mag);
      const st = await zs(row);
      check('held, it swallows a round every 0.38 s up to six', held === 6, `${held} after 2.5 s`);
      check('it drags the one in its cone in toward the player, not the one beside it', d1[0] < d0[0] - 3 && d1[0] >= 1.6 && Math.abs(d1[1] - d0[1]) < 0.05, `${d0[0]} -> ${d1[0]} m; beside ${d0[1]} -> ${d1[1]} m`);
      check('and holds it reeling', st[0].state === 'stagger', st[0].state);
      await aimAt(row[0]);
      await D(() => { const d = window.__dead; d.releaseAll(); d.advance(2 / 60); });
      const lost = await hpLost(row);
      const d2 = await where(row);
      check('let go, the six rounds land on it: six times 160', lost[0] >= 6 * 160 * 0.95 && lost[0] <= 6 * 160 * 1.25 + 1 && lost[1] === 0, `${lost.join(', ')}`);
      check('and throw it back', d2[0] > d1[0] + 1, `${d1[0]} -> ${d2[0]} m`);
      const left = await D(() => window.__dead.game.weapons.carried.ammo.mag);
      check('the gauge is empty again after the blast', left === 0, `${left}`);
    }
  }
}
const errors = reportLogs(logs.filter((l) => !/502 \(Bad Gateway\)/.test(l.text)), { warnings: false });
console.log(`\n${failed} failed, ${errors} console errors`);
await browser.close();
process.exit(failed || errors ? 1 : 0);
