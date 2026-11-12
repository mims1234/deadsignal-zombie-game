// ZARYA: Baba Yaga's fight, played headless to the end (`src/zarya/stage.ts`): the stage machinery worked as a player
// would (the revolve's winch, the trap levers in the pit, the fly rail up on the gallery, the follow-spot), the hut shot
// at with the gun in hand while her door is open, the carol-singers shot between windows. Screenshots of each phase and
// each machine at work land in $SC (default shots/zarya/yaga), with the draw calls of each.
//
//   node scripts/qa-zarya-yaga.mjs [url] [w] [h]       default http://127.0.0.1:5183/ at 1280x720
//   SQUAD=0 ...                                         alone: Timur and Vera sent home (default: the AI squad with you)
//   GUN=pistol ...                                      the gun in hand (default the pistol: nothing built)
//   QA_TOUCH=1 ...                                      as a phone (?touch=1)
//
// It moves between places by teleporting, but lets the time pass that running there would take (5.5 m/s), so the hut
// keeps walking and a machine worked too late misses. Health is topped up when it falls under 75 and every top-up is
// counted: the report says how hard she hit (it tops up under 75, so no single blow can put the player down). It also WALKS (no teleport) up the gallery's stair once, to show it climbs.
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const squad = process.env.SQUAD !== '0';
const gun = process.env.GUN ?? 'pistol';
const out = process.env.SC ?? 'shots/zarya/yaga';
mkdirSync(out, { recursive: true });
const tag = `${squad ? 'squad' : 'solo'}${touch ? '-phone' : ''}`;

const { browser, page, logs } = await openPage({ w, h });
const bad = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
await page.routeWebSocket((u) => u.pathname === '/' && u.host === new URL(base).host, () => {});
await page.goto(`${base}?nolock${touch ? '&touch=1' : ''}`, { waitUntil: 'load' });
const fail = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) fail.push(name);
};
const D = (fn, ...args) => page.evaluate(fn, ...args);
const draws = [];
const shot = async (name) => {
  // (the game runs on in real time while the picture is taken: nobody is put down posing for it)
  const keep = () => D(() => { const v = window.__dead.game.session.vitals; if (window.__dead.game.state === 'playing') window.__dead.setHealth(100, v.armor); });
  await keep();
  await page.waitForTimeout(120);
  const n = await D(() => window.__dead.game.renderer.renderer.info.render.calls);
  draws.push([name, n]);
  await page.screenshot({ path: `${out}/${tag}-${name}.png` });
  await keep();
  console.log(`     shot ${name}: ${n} draws`);
};

await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await page.addStyleTag({ content: '.ds-touch-layer { opacity: 0.35 !important; }' });

// ---- the story jumped to the Palace with its tickets bought; armed; the bot's own helpers ----
const setup = await D(async ([squad, gun]) => {
  const d = window.__dead;
  const g = d.game;
  const st = await import('/src/zarya/story.ts');
  const sg = await import('/src/zarya/stage.ts');
  const pl = await import('/src/zarya/places.ts');
  window.__y = { st, sg, DK: pl.DK };
  const s = g.zarya.story;
  s.ch = st.CH.act2;
  s.f = st.F.armed | st.F.released | st.F.gena | st.F.guard | st.F.guardDown | st.F.plug | st.F.bear | st.F.bearDown | st.F.handleFit | st.F.fuseFit;
  s.g = st.G.tickets;
  d.clearZombies();
  if (!squad) {
    const sq = g.squad;
    for (const a of sq.allies) a.avatar.dispose();
    sq.allies.length = 0;
  }
  d.giveGun(gun);
  d.advance(0.5);
  return { allies: g.squad.allies.length, hut: pl.DK.hut };
}, [squad, gun]);
check(squad ? 'Timur and Vera with you' : 'alone: the squad sent home', squad ? setup.allies === 2 : setup.allies === 0, `${setup.allies} allies`);

/** Stand somewhere (on whatever floor is there), facing a point. */
const go = (x, z, tx, tz, wait = 0.3) => D(([x, z, tx, tz, wait]) => {
  const d = window.__dead;
  d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)), d.game.level.world.floorHeight(x, z, 0.3));
  d.advance(wait);
}, [x, z, tx, tz, wait]);
const view = () => D(() => {
  const g = window.__dead.game;
  const v = g.zarya.view;
  const { Stage } = window.__y.sg;
  const y = g.zombies.zombies.find((z) => z.alive && z.tag === 'BABA YAGA');
  const pr = g.io?.prompt ?? null;
  return {
    st: v.st, g: v.g, phase: Stage.phase(v.st), level: Stage.level(v.st), hut: y ? { x: y.x, z: y.z, hp: y.hp, max: y.maxHp, inv: y.invulnerable } : null,
    prompt: pr?.text ?? null, sub: pr?.sub ?? '', can: !!pr && pr.key !== '', x: g.player.x, y: g.player.y, z: g.player.z, zone: g.zarya.zones.current,
    draws: g.renderer.renderer.info.render.calls,
  };
});
const say = (s) => `${s.prompt ?? 'no prompt'}${s.sub ? ` / ${s.sub}` : ''}`;

// ---- into the hall: she notices, the fight begins ----
await go(-156, -23, -180, -23, 1.2);
let s = await view();
check('in the Palace, the hut on the revolve', s.zone === 'dk' && !!s.hut && Math.hypot(s.hut.x - setup.hut.x, s.hut.z - setup.hut.z) < 1, JSON.stringify(s.hut));
check('Baba Yaga notices the squad: phase 1', s.phase === 1, `st ${s.st}`);
check('her door is shut: nothing reaches her', !!s.hut && s.hut.inv === true);
await shot('01-phase1-stage');

// ---- walking, not teleporting: up the fly gallery's stair to the rail ----
const climb = await D(() => {
  const d = window.__dead;
  const g = d.game;
  const DK = window.__y.DK;
  const S = DK.galleryStair;
  // from the wing's boards at the stair's foot, walking north up it, then west along the deck to the rail
  d.teleport((S.x0 + S.x1) / 2, S.z1 + 0.8, 0, 0.3);
  d.advance(0.2);
  d.hold({ forward: 1 });
  let top = 0;
  for (let i = 0; i < 60; i++) {
    g.player.yaw = 0; // north (-z)
    d.advance(0.1);
    top = Math.max(top, g.player.y);
    if (g.player.z < DK.gallery.z1 - 0.8) break;
  }
  for (let i = 0; i < 80; i++) {
    g.player.yaw = Math.atan2(-(DK.flyRail.x - g.player.x), -(DK.flyRail.z + 0.6 - g.player.z));
    d.advance(0.1);
    if (Math.hypot(g.player.x - DK.flyRail.x, g.player.z - DK.flyRail.z) < 1.2) break;
  }
  d.releaseAll();
  d.advance(0.3);
  const pr = g.io?.prompt ?? null;
  return { top, y: g.player.y, x: g.player.x, z: g.player.z, prompt: pr?.text ?? null, sub: pr?.sub ?? '' };
});
check('the fly gallery\'s stair climbs to the deck, walking', climb.top > 2.5 && climb.y > 2.5, `top ${climb.top.toFixed(2)}, at ${climb.x.toFixed(1)},${climb.y.toFixed(1)},${climb.z.toFixed(1)}`);
check('the fly rail offers itself up there', /BAR|FLY/.test(climb.prompt ?? ''), `${climb.prompt} / ${climb.sub}`);
await D(() => { window.__dead.game.player.pitch = -0.25; });
await shot('02-fly-gallery');

// ---- the bot: one in-page function that fights for `sec` seconds, or until something worth a screenshot ----
await D(() => {
  const d = window.__dead;
  const g = d.game;
  const { Stage, MACHINES, MACHINE, catches, hutFloor } = window.__y.sg;
  const DK = window.__y.DK;
  const R = { hits: 0, heals: 0, taken: 0, caught: [0, 0, 0, 0], combos: 0, misses: 0, used: [0, 0, 0, 0], t: 0, phaseAt: [0, 0, 0, 0], maxLevel: 0, shotsAtHer: 0, carolers: 0, maxDraws: 0, why: {}, cues: [], windows: [], win: null };
  const why = (k) => void (R.why[k] = (R.why[k] ?? 0) + 1);
  window.__y.R = R;
  // every cue the game itself plays for the stage (`runtime.ts` stageCue): what caught her, what missed
  const cue = g.zarya.stageCue.bind(g.zarya);
  g.zarya.stageCue = (c) => {
    if (c.kind === 'caught' || c.kind === 'combo') R.caught[c.m]++;
    if (c.kind === 'combo') R.combos++;
    if (c.kind === 'miss') R.misses++;
    R.cues.push(`${R.t.toFixed(0)} ${c.kind}${c.m ?? ''}${c.n ? '/' + c.n : ''}`);
    return cue(c);
  };
  const yaga = () => g.zombies.zombies.find((z) => z.alive && z.tag === 'BABA YAGA') ?? null;
  const tick = (sec) => {
    // a tenth of a second at a time, topping up under 60 after each
    for (let left = sec; left > 1e-6; left -= 0.1) {
      const dt = Math.min(0.1, left);
      const hp0 = g.session.vitals.health + g.session.vitals.armor;
      d.advance(dt);
      R.t += dt;
      const hp1 = g.session.vitals.health + g.session.vitals.armor;
      if (hp1 < hp0) R.taken += hp0 - hp1;
      if (!R.died && (!g.playerAlive() || g.state !== 'playing')) R.died = `${g.state}, health ${g.session.vitals.health.toFixed(0)} after ${(hp0 - hp1).toFixed(0)} in a tenth of a second`;
      if (g.session.vitals.health < 75) {
        R.heals++;
        d.setHealth(100, g.session.vitals.armor);
      }
    }
    const c = g.session.inv.slots[g.session.inv.activeSlot];
    if (c?.ammo) c.ammo.reserve = Math.max(c.ammo.reserve, 300);
    R.maxDraws = Math.max(R.maxDraws, g.renderer.renderer.info.render.calls);
  };
  /** Run there: the time it takes passes first (the hut walks on), then stand there. */
  const runTo = (x, z, face) => {
    // along the straight line, a quarter of a second at a time (whatever stands in the way is run round in the time)
    const x0 = g.player.x;
    const z0 = g.player.z;
    const dist = Math.hypot(x - x0, z - z0);
    const n = Math.max(1, Math.ceil(dist / 5.5 / 0.25));
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const px = x0 + (x - x0) * k;
      const pz = z0 + (z - z0) * k;
      d.teleport(px, pz, face ?? Math.atan2(-(x - x0), -(z - z0)), g.level.world.floorHeight(px, pz, 0.3));
      if (dist > 1) tick(Math.min(0.25, dist / 5.5 / n));
    }
    d.teleport(x, z, face ?? g.player.yaw, g.level.world.floorHeight(x, z, 0.3));
    tick(0.05);
  };
  const aimAt = (x, y, z) => {
    const p = g.player;
    const ey = p.y + 1.6;
    p.yaw = Math.atan2(-(x - p.x), -(z - p.z));
    p.pitch = Math.atan2(y - ey, Math.hypot(x - p.x, z - p.z));
  };
  /** Where to shoot her from: in front of the hut, out of the broom's reach, inside the theatre. */
  const firingSpot = (y) => {
    const best = [[8, 0], [9, 5], [9, -5], [11, 0], [7, 7], [7, -7]];
    for (const [dx, dz] of best) {
      const x = Math.min(-141, y.x + dx);
      const z = Math.max(-37, Math.min(-9.5, y.z + dz));
      const blocked = g.level.world.segmentBlocked(x, 1.6, z, y.x, 2.4, y.z, 'shots');
      if (!blocked) return { x, z };
    }
    return { x: Math.min(-141, y.x + 9), z: y.z };
  };
  window.__y.fight = (sec, stopOn) => {
    const end = R.t + sec;
    let lastSt = g.zarya.view.st;
    while (R.t < end) {
      const y = yaga();
      if (!y) return { done: true };
      if (R.died) return { done: true, died: true };
      const st = g.zarya.view.st;
      // what happened since the last tick

      R.maxLevel = Math.max(R.maxLevel, Stage.level(st));
      if (Stage.level(st) > 0 && Stage.level(lastSt) === 0) R.win = { hp: y.hp, t: R.t, lv: 1 };
      if (R.win) R.win.lv = Math.max(R.win.lv, Stage.level(st));
      if (Stage.level(st) === 0 && Stage.level(lastSt) > 0 && R.win) {
        R.windows.push(`${(R.t - R.win.t).toFixed(0)}s x${R.win.lv} -${Math.round(R.win.hp - y.hp)}`);
        R.win = null;
      }
      const ph = Stage.phase(st);
      if (ph !== Stage.phase(lastSt)) R.phaseAt[ph] = R.t;
      const ev = stopOn?.(lastSt, st);
      lastSt = st;
      if (ev) return { ev };
      const lv = Stage.level(st);
      // her door is open and there is time: a second machine on her makes it a bigger window (the flyman's stair is slow)
      if (lv === 1) {
        const left = g.zarya.director.yagaFight.winT;
        let second = -1;
        for (const m of [MACHINE.trap, MACHINE.revolve, MACHINE.spot].sort((a, b) => R.used[a] - R.used[b])) {
          if (!Stage.ready(st, m) || !catches(m, y)) continue;
          const run = Math.hypot(MACHINES[m].at.x - g.player.x, MACHINES[m].at.z - g.player.z) / 5.5;
          if (run + MACHINES[m].hold + 1 < left) {
            second = m;
            break;
          }
        }
        if (second >= 0) {
          runTo(MACHINES[second].at.x, MACHINES[second].at.z);
          const pr = g.io?.prompt ?? null;
          if (pr && pr.key !== '') {
            R.used[second]++;
            d.hold({ interact: true });
            tick(MACHINES[second].hold + 0.25);
            d.releaseAll();
            tick(0.1);
            continue;
          }
        }
      }
      if (lv > 0) {
        // her door is open: at the cabin, from here if there is a clear line and it is in range, else from in front of the hut
        const here = Math.hypot(y.x - g.player.x, y.z - g.player.z);
        const clear = here > 5.5 && here < 32 && !g.level.world.segmentBlocked(g.player.x, g.player.y + 1.6, g.player.z, y.x, hutFloor(y.x, y.z) + 2.5, y.z, 'shots');
        const f = firingSpot(y);
        if (!clear && Math.hypot(f.x - g.player.x, f.z - g.player.z) > 2.5) runTo(f.x, f.z);
        aimAt(y.x, hutFloor(y.x, y.z) + 2.5, y.z);
        const before = y.hp;
        d.click();
        R.shotsAtHer++;
        tick(0.14);
        if (y.hp < before) R.hits++;
        continue;
      }
      // her door is shut: a machine that would catch her where she stands, nearest first (the spot when nothing else)
      // (a player who uses the whole theatre: of the machines that would catch her now, the one used least so far)
      let pick = -1;
      if (catches(MACHINE.revolve, y) && !Stage.ready(st, MACHINE.revolve)) why(`on the revolve, its winch ${['ready', 'running', 'winding'][Stage.state(st, 0)]}${Stage.watched(st) === 0 ? ', watched' : ''}`);
      for (const m of [MACHINE.revolve, MACHINE.trap, MACHINE.fly].sort((a, b) => R.used[a] - R.used[b])) if (Stage.ready(st, m) && catches(m, y)) {
        pick = m;
        break;
      }
      if (pick < 0 && Stage.ready(st, MACHINE.spot) && Stage.phase(st) > 0) pick = MACHINE.spot;
      if (pick >= 0) {
        const M = MACHINES[pick];
        // the fly rail is up on the gallery (the stair takes a few seconds more than the run)
        if (pick === MACHINE.fly) tick(2.5);
        runTo(M.at.x, M.at.z);
        if (!(Stage.ready(g.zarya.view.st, pick))) {
          why('notReady');
          continue;
        }
        const pr = g.io?.prompt ?? null;
        if (!pr || pr.key === '' || !/TURN|DROP|LET|SPOT/.test(pr.text)) {
          why(`noPrompt ${pick} ${pr?.text ?? '-'} ${g.player.y.toFixed(1)}`);
          tick(0.2);
          continue;
        }
        R.used[pick]++;
        d.hold({ interact: true });
        tick(M.hold + 0.25);
        d.releaseAll();
        tick(0.15);
        if (pick === MACHINE.fly) {
          // the bar takes a moment to fall: watch it come down
          tick(0.6);
          why(`fly ${Stage.level(g.zarya.view.st) > 0 ? 'caught' : 'missed'}`);
        }
        continue;
      }
      // nothing to work: the carol-singers, or wait at the front of the stalls
      const near = g.zombies.zombies.filter((z) => z.alive && !z.isBoss && Math.hypot(z.x - g.player.x, z.z - g.player.z) < 22).sort((a, b) => Math.hypot(a.x - g.player.x, a.z - g.player.z) - Math.hypot(b.x - g.player.x, b.z - g.player.z))[0];
      if (near) {
        aimAt(near.x, near.y + 1.3, near.z);
        d.click();
        tick(0.16);
        if (!near.alive) R.carolers++;
        continue;
      }
      if (Math.hypot(g.player.x + 150, g.player.z + 23) > 6) runTo(-150, -16);
      tick(0.25);
    }
    return { done: false };
  };
});

/** Fight until `ev` says stop (it gets the last word and this one), or `sec` seconds pass. */
const fight = (sec, ev) => D(([sec, ev]) => window.__y.fight(sec, ev ? new Function('a', 'b', `const S = window.__y.sg.Stage; return (${ev})(a, b);`) : null), [sec, ev ?? null]);
/** Put the camera somewhere to see the hut, and shoot it. */
const look = async (name, dx, dz, eye = 0) => {
  await D(([dx, dz, eye]) => {
    const d = window.__dead;
    const g = d.game;
    const y = g.zombies.zombies.find((z) => z.alive && z.tag === 'BABA YAGA');
    const hx = y ? y.x : window.__y.DK.hut.x;
    const hz = y ? y.z : window.__y.DK.hut.z;
    const x = Math.min(-138, hx + dx);
    const z = Math.max(-38, Math.min(-8, hz + dz));
    d.teleport(x, z, Math.atan2(-(hx - x), -(hz - z)), g.level.world.floorHeight(x, z, 0.3) + eye);
    g.player.pitch = Math.atan2(2.6 - (1.6 + eye), Math.hypot(hx - x, hz - z));
    d.advance(1 / 60);
  }, [dx, dz, eye]);
  await shot(name);
};

const seen = new Set();
const t0 = Date.now();
// stop for a picture at each machine's first catch, and at each phase's start
const firstEvents = `(a, b) => { if (S.phase(b) > S.phase(a)) return 'p' + S.phase(b); if (S.level(b) > S.level(a)) return 'm' + S.watched(b); return null; }`;
let r;
for (let i = 0; i < 120; i++) {
  r = await fight(30, firstEvents);
  if (r.done) break;
  if (r.ev && !seen.has(r.ev)) {
    seen.add(r.ev);
    await D(() => window.__dead.advance(0.9));
    const name = { m0: '10-revolve', m1: '11-trap', m2: '12-fly-bar', m3: '13-spot', p2: '03-phase2', p3: '04-phase3' }[r.ev];
    if (r.ev === 'm3') await look(name, 14, 4, 0);
    else if (r.ev === 'm2') await look(name, 12, 6, 0);
    else if (r.ev.startsWith('p')) {
      await D(() => window.__dead.advance(4));
      await look(name, 13, 5, 0);
    } else await look(name, 10, 4, 0);
  }
  // a look at her in the stalls once phase 2 has brought her down
  if (!seen.has('stalls')) {
    const v = await view();
    if (v.hut && v.phase >= 2 && v.hut.x > -165) {
      seen.add('stalls');
      await look('05-in-the-stalls', 9, 7, 0);
    }
  }
}
const R = await D(() => ({ ...window.__y.R, alive: !!window.__dead.game.zombies.zombies.find((z) => z.alive && z.tag === 'BABA YAGA') }));
s = await view();
console.log(`     fight: ${R.t.toFixed(0)} s of play (${((Date.now() - t0) / 1000).toFixed(0)} s real); phases began at ${R.phaseAt.map((t) => t.toFixed(0)).join(', ')} s`);
console.log(`     caught by revolve/trap/fly/spot: ${R.caught.join('/')}, worked ${R.used.join('/')}, combos ${R.combos}, misses ${R.misses}, biggest window ${R.maxLevel}`);
console.log(`     why: ${JSON.stringify(R.why)}`);
if (process.env.CUES) console.log(`     cues: ${R.cues.join(', ')}`);
console.log(`     windows (length, machines on her, health taken): ${R.windows.join('; ')}`);
console.log(`     shots at her ${R.shotsAtHer}, landed ${R.hits}; carol-singers shot down ${R.carolers}; damage taken ${R.taken.toFixed(0)}, top-ups ${R.heals}; most draws ${R.maxDraws}`);
check('the player was never put down (topped up under 75)', !R.died, R.died || '');
check('she goes down', !R.alive && (s.g & 128) !== 0, `g ${s.g}`);
check('all three phases were fought', R.phaseAt[2] > 0 && R.phaseAt[3] > R.phaseAt[2]);
check('every machine caught her at least once', R.caught.every((n) => n > 0), R.caught.join('/'));
check('two machines together opened a bigger window', R.combos > 0 || R.maxLevel > 1, `combos ${R.combos}`);
check('she is a threat: the squad took real damage', R.taken > 150, `${R.taken.toFixed(0)} taken`);
check('a real boss: not over in a minute', R.t > 120, `${R.t.toFixed(0)} s`);
await D(() => window.__dead.advance(3));
await look('06-down', 9, 4, 0);
await D(() => window.__dead.advance(6));
s = await view();
check('the Wheat key: the story has her down, the hut sat down for good', (s.g & 128) !== 0 && !s.hut);
// the theatre's draw calls from its corners, with whatever is still on its feet
for (const [name, x, z, tx, tz] of [['20-from-back', -139, -23, -180, -23], ['21-from-pit', -167, -34, -180, -20], ['22-from-gallery', -176, -45.5, -180, -23], ['23-from-wing', -186, -5, -178, -24]]) {
  await go(x, z, tx, tz, 0.4);
  await shot(name);
}
// what the stage's own moving parts cost (`stageLook.ts`): the same view with them hidden
{
  await go(-150, -23, -180, -23, 0.4);
  await page.waitForTimeout(150);
  const withStage = await D(() => window.__dead.game.renderer.renderer.info.render.calls);
  await D(() => { window.__dead.game.zarya.look.hut.stage.root.visible = false; });
  await page.waitForTimeout(150);
  const without = await D(() => window.__dead.game.renderer.renderer.info.render.calls);
  await D(() => { window.__dead.game.zarya.look.hut.stage.root.visible = true; });
  console.log(`     the stage's moving parts: ${withStage - without} draws (${withStage} with, ${without} without)`);
}
const worst = Math.max(...draws.map(([, n]) => n));
check('draw calls in the theatre under 190', worst < 190 && R.maxDraws < 190, `worst shot ${worst}, worst in the fight ${R.maxDraws}`);
if (bad.length) console.log(`     failed loads (not the fight's): ${[...new Set(bad)].slice(0, 5).join(', ')}`);
// (a resource another part of the game asks the dev server for and does not get is reported above, not counted here)
const errors = logs.filter((l) => l.type === 'pageerror' || (l.type === 'error' && !/favicon|404|502|WebSocket|Failed to load resource/.test(l.text)));
check('no page errors', errors.length === 0, errors.slice(0, 3).map((e) => e.text.slice(0, 160)).join(' | '));
console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join('; ')}` : '\nall ok');
await browser.close();
process.exit(fail.length ? 1 : 0);
