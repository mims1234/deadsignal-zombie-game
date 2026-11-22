// HIRASAKA's two fights played headless to the end, solo with the squad (`src/hirasaka/bossUmi.ts`, `bossKurogane.ts`):
//
//   THE UMIBŌZU  the jobs done by the story's own actions, the Mori built at the seawall winch and taken in hand; then
//                a player at the winch aims the Mori at the giant and fires it whenever it is up over the wall (the
//                gun's own shot: `harpoonHook` -> the bosses' strike test -> the story's `umiHit`), and steps into the
//                other lane of the seafront when a wave comes down theirs, until three hits sink it. A guarded throw
//                (wary after a hit, from low in the water) is only dodged.
//   KUROGANE     down the cage, the gallery and the roots by the story's actions, the hairpin taken; then the hall is
//                worked as a player would: the hoist when he is under the rail, the fan in the north wall, the pump and
//                him brought to the tree; the gun in hand fired at him whenever a window is open, at his thunderlings
//                and miners otherwise.
//
//   node scripts/qa-hirasaka-fights.mjs [url]       default http://127.0.0.1:5183/ (quality Low unless QUALITY=...)
//   SC=<dir>                                        screenshots (default shots/hirasaka/fights)
//
// Moves between places by teleporting but lets the running time pass (5.5 m/s). Health is topped up when it falls under
// 60 and each top-up is counted (the report says how hard each fight hit). Prints how long each fight took in game time,
// and the most draw calls seen in each.
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const out = process.env.SC ?? 'shots/hirasaka/fights';
mkdirSync(out, { recursive: true });
const { browser, page, logs } = await openPage({ w: 1280, h: 720 });
await page.goto(`${base}?nolock`, { waitUntil: 'load' });
const fail = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) fail.push(name);
};
const D = (fn, ...args) => page.evaluate(fn, ...args);
const shot = async (name) => {
  const n = await D(() => window.__dead.game.renderer.renderer.info.render.calls);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`     shot ${name}: ${n} draws`);
};

await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D((q) => {
  localStorage.setItem('deadsignal.map.v1', 'hirasaka');
  const k = 'deadsignal.settings.v1';
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  localStorage.setItem(k, JSON.stringify({ ...s, quality: q, qualityAuto: false, masterVolume: 0 }));
}, process.env.QUALITY ?? 'low');
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 90000 });

// ---- the bot's helpers, in the page ----
const setup = await D(async () => {
  const d = window.__dead;
  const g = d.game;
  const P = await import('/src/hirasaka/places.ts');
  const U = await import('/src/hirasaka/bossUmi.ts');
  const K = await import('/src/hirasaka/bossKurogane.ts');
  const H = { P, U, K };
  window.__h = H;
  g.zombies.spawnAllowed = () => false; // the fights, not the island's crowd
  d.clearZombies();
  d.advance(0.5);
  const R = { t: 0, heals: 0, taken: 0, maxDraws: 0, shots: 0, log: [] };
  H.R = R;
  H.tick = (sec) => {
    for (let left = sec; left > 1e-6; left -= 0.1) {
      const dt = Math.min(0.1, left);
      const hp0 = g.session.vitals.health + g.session.vitals.armor;
      d.advance(dt);
      R.t += dt;
      const hp1 = g.session.vitals.health + g.session.vitals.armor;
      if (hp1 < hp0) R.taken += hp0 - hp1;
      if (!R.died && (!g.playerAlive() || g.state !== 'playing')) R.died = `${g.state} at ${R.t.toFixed(0)}s`;
      if (g.session.vitals.health < 60) {
        R.heals++;
        d.setHealth(100, g.session.vitals.armor);
      }
    }
    const c = g.session.inv.slots[g.session.inv.activeSlot];
    if (c?.ammo) {
      c.ammo.reserve = Math.max(c.ammo.reserve, 300);
    }
    if (g.hirasaka.view.umi === 1 || (g.hirasaka.view.hairpin && !g.hirasaka.view.bossDown)) R.maxDraws = Math.max(R.maxDraws, g.renderer.renderer.info.render.calls);
    // once a second of play while a fight is on: the cost without the squadmates' bodies too (as qa-hirasaka-look.mjs counts a view)
    const fighting = g.hirasaka.view.umi === 1 || (g.hirasaka.view.hairpin && !g.hirasaka.view.bossDown && !!g.zombies.boss?.alive);
    if (fighting && R.t >= (R.nextDraw ?? 0)) {
      R.nextDraw = R.t + 1;
      const r = g.renderer.renderer.info.render;
      const figs = g.squad.figures().map((f) => f.root ?? f.group ?? f).filter((o) => o && 'visible' in o);
      const was = figs.map((o) => o.visible);
      figs.forEach((o) => (o.visible = false));
      g.renderer.render(0, performance.now() / 1000);
      if (r.calls > (R.maxMap ?? 0)) {
        R.maxMap = r.calls;
        // what it is made of: each part hidden in turn
        const part = (o) => {
          if (!o) return 0;
          const was = o.visible;
          o.visible = false;
          g.renderer.render(0, performance.now() / 1000);
          const n = R.maxMap - r.calls;
          o.visible = was;
          return n;
        };
        const boss = g.zombies.boss?.rig?.root;
        R.maxMapAt = `${g.player.x.toFixed(0)},${g.player.z.toFixed(0)} yaw ${g.player.yaw.toFixed(1)}: infected ${part(g.zombies.root)} (him ${part(boss)}), fx ${part(g.fx.root)}, fights ${part(g.hirasaka.bosses.look.root)}, island look ${part(g.hirasaka.look.root)}, ${g.zombies.zombies.filter((z) => z.alive).length} infected up; drawn under them: ${g.zombies.root.children.filter((c) => c.visible).map((c) => {
          const z = g.zombies.zombies.find((q) => q.rig.root === c);
          let n = 0;
          c.traverseVisible((o) => { if (o.isMesh) n++; });
          return `${z ? `${z.variant || z.type}${z.alive ? '' : '(dead)'}` : c.name || c.type}:${n}`;
        }).join(' ')}`;
      }
      figs.forEach((o, i) => (o.visible = was[i]));
    }
  };
  H.stand = (x, z, face) => d.teleport(x, z, face ?? g.player.yaw, g.level.world.floorHeight(x, z, 0.3));
  H.runTo = (x, z) => {
    const dist = Math.hypot(x - g.player.x, z - g.player.z);
    if (dist > 1) H.tick(dist / 5.5);
    H.stand(x, z);
  };
  H.aimAt = (x, y, z) => {
    const p = g.player;
    p.yaw = Math.atan2(-(x - p.x), -(z - p.z));
    p.pitch = Math.atan2(y - (p.y + 1.6), Math.hypot(x - p.x, z - p.z));
  };
  H.use = (hold = 0.5) => {
    const pr = g.io?.prompt ?? null;
    if (!pr || pr.key === '') {
      R.log.push(`${R.t.toFixed(0)} no prompt (${pr?.text ?? '-'} / ${pr?.sub ?? ''}) at ${g.player.x.toFixed(1)},${g.player.y.toFixed(1)},${g.player.z.toFixed(1)}`);
      if (R.log.length > 40) R.log.shift();
      H.tick(0.25);
      return null;
    }
    d.hold({ interact: true });
    H.tick(hold + 0.3);
    d.releaseAll();
    H.tick(0.1);
    return pr.text;
  };
  H.fire = (x, y, z) => {
    H.aimAt(x, y, z);
    d.click();
    R.shots++;
    H.tick(0.15);
  };
  /** Story actions forced through (the parts of the night these fights do not test). */
  H.force = (a, i = 0) => g.hirasaka.story.act(a, i, { x: g.player.x, y: g.player.y, z: g.player.z }, 0, true);
  return { allies: g.squad.allies?.length ?? g.squad.figures().length };
});
check('solo with the squad (Natsuki and Daigo)', setup.allies === 2, `${setup.allies}`);

// =====================================================================================================================
// THE UMIBŌZU
// =====================================================================================================================
const umi = await D(() => {
  const d = window.__dead;
  const g = d.game;
  const { P, U, R } = window.__h;
  const H = window.__h;
  for (const [a, i] of [['coal', 0], ['coal', 1], ['open', P.OBSTACLE.slag], ['boilerKey', 0], ['open', P.OBSTACLE.bathDoor], ['burner', 0], ['open', P.OBSTACLE.shutter], ['fan', 0], ['key', 0], ['part', 0], ['part', 1], ['built', 0]]) H.force(a, i);
  H.tick(1);
  // the Mori in hand (as its bench hands it over), and every harpoon it fires counted where it meets the bosses' door
  g.hirasaka.arms.give('mori');
  const guns = g.hirasaka.arms.guns;
  const real = guns.harpoonHook;
  H.hook = { calls: 0, struck: 0 };
  guns.harpoonHook = (o, dir, range) => {
    H.hook.calls++;
    const hit = real ? real(o, dir, range) : false;
    if (hit) H.hook.struck++;
    return hit;
  };
  H.tick(1);
  const inv = g.session.inv;
  return { umi: g.hirasaka.view.umi, built: g.hirasaka.view.built, mori: inv.slots[inv.activeSlot]?.id === 'mori' };
});
check('the jobs done: the umibōzu rises, the Mori built and in hand', umi.umi === 1 && (umi.built & 1) === 1 && umi.mori, JSON.stringify(umi));

await D(() => {
  const { P } = window.__h;
  window.__h.stand(P.UMIBOZU.winch.x, P.UMIBOZU.winch.z, Math.PI);
  window.__h.R.t = 0;
  window.__h.R.maxDraws = 0;
  window.__h.R.heals = 0;
  window.__h.R.taken = 0;
  window.__h.R.maxMap = 0;
});
const shotsU = { windup: false, wave: false };
let umiRes = null;
for (let round = 0; round < 60; round++) {
  const r = await D(() => {
    const g = window.__dead.game;
    const H = window.__h;
    const { P, U, R } = H;
    const W = P.UMIBOZU.winch;
    const res = { hits: 0, dodges: 0, waveHits: 0, guarded: 0, events: [] };
    const end = R.t + 20;
    let dodging = false;
    while (R.t < end) {
      const v = g.hirasaka.view;
      if (v.umi === 2) return { ...res, done: true, t: R.t, hitsNow: v.umiHits };
      if (R.died) return { ...res, died: R.died };
      const waves = U.Umi.waves(v.ub);
      const px = g.player.x;
      const lane = U.Umi.laneAt(g.player.x, g.player.z);
      const danger = waves.find((w) => w.lane === lane && w.x < px + 2.5 && w.x > px - 30);
      if (danger) {
        // a wave down my lane: into the other one until it has gone by
        if (!dodging) res.dodges++;
        dodging = true;
        const z = lane === 0 ? 60 : 70;
        H.runTo(px, z);
        H.tick(0.1);
        continue;
      }
      if (dodging && !waves.some((w) => w.lane === 0 && w.x < W.x + 2.5 && w.x > W.x - 30)) {
        dodging = false;
        H.runTo(W.x, W.z);
      }
      if (dodging) {
        H.tick(0.1);
        continue;
      }
      if (U.Umi.guarded(v.ua) && !H.inGuard) {
        H.inGuard = true;
        res.guarded++;
      }
      if (!U.Umi.guarded(v.ua)) H.inGuard = false;
      if (U.Umi.exposed(v.ua) && Math.hypot(g.player.x - W.x, g.player.z - W.z) < 2) {
        // the Mori fired at its chest (the gun's own shot; loaded again between throws)
        const inv = g.session.inv;
        const k = inv.slots.findIndex((s) => s?.id === 'mori');
        if (k >= 0 && inv.activeSlot !== k) {
          inv.activeSlot = k;
          H.tick(0.6);
        }
        const before = g.hirasaka.view.umiHits;
        H.fire(U.Umi.x(g.hirasaka.view.ua), U.UMI.bodyY, U.UMI.z);
        H.tick(0.2);
        if (g.hirasaka.view.umiHits > before) res.hits++;
        if (!H.firstExposed) return { ...res, ev: 'windup' };
        continue;
      }
      if (waves.length && !H.firstWave) {
        H.firstWave = true;
        return { ...res, ev: 'wave' };
      }
      H.tick(0.1);
    }
    return res;
  });
  if (r.ev === 'windup' && !shotsU.windup) {
    shotsU.windup = true;
    await D(() => (window.__h.firstExposed = true));
    await shot('umi-01-up-over-the-wall');
  }
  if (r.ev === 'wave' && !shotsU.wave) {
    shotsU.wave = true;
    await D(() => {
      const g = window.__dead.game;
      g.player.yaw = Math.PI / 2; // looking west up the street at it coming
      g.player.pitch = -0.05;
    });
    await shot('umi-02-wave-down-the-street');
  }
  if (r.done || r.died) {
    umiRes = r;
    break;
  }
}
const hook = await D(() => window.__h.hook);
const ur = await D(() => ({ t: window.__h.R.t, heals: window.__h.R.heals, taken: Math.round(window.__h.R.taken), draws: window.__h.R.maxDraws, map: window.__h.R.maxMap, at: window.__h.R.maxMapAt }));
check('the umibōzu sunk by three harpoon hits', !!umiRes?.done, umiRes ? JSON.stringify(umiRes) : 'timed out');
check("every hit came from the Mori's own harpoon (harpoonHook, then umiHit)", hook.struck >= 3, `${hook.calls} harpoons fired, ${hook.struck} struck`);
check('the umibōzu fight takes about a minute (45 s or more of game time)', ur.t >= 45, `${ur.t.toFixed(0)} s`);
console.log(`     THE UMIBŌZU: ${ur.t.toFixed(0)} s of game time, ${ur.heals} top-ups, ${ur.taken} health and armour lost, most draws ${ur.draws} with the squad, ${ur.map} without (at ${ur.at})`);
check('the umibōzu fight at 190 draw calls or fewer (the squad apart)', ur.map <= 190, `${ur.map}; ${ur.draws} with the squad`);
await shot('umi-03-sunk');

// =====================================================================================================================
// KUROGANE
// =====================================================================================================================
const down = await D(async () => {
  const d = window.__dead;
  const g = d.game;
  const { P } = window.__h;
  const H = window.__h;
  H.stand(P.CAGE.top.x, P.CAGE.top.z);
  g.hirasaka.rideCage(true);
  H.tick(4.5);
  for (const [a, i] of [['ladles', 0], ['knock', 0], ['funa', 0], ['open', P.OBSTACLE.drift], ['open', P.OBSTACLE.roots]]) H.force(a, i);
  H.stand(P.DEEP_SPOTS.hairpin.x - 2, P.DEEP_SPOTS.hairpin.z + 4);
  H.force('hairpin');
  H.tick(0.5);
  d.giveGun?.('pistol');
  const b = g.zombies.boss;
  return { act: g.hirasaka.view.act, boss: b ? b.variant : null, hp: b?.hp, inv: b?.invulnerable };
});
check('down the cage, the hairpin taken: Kurogane wakes', down.boss === 'overseer', JSON.stringify(down));
await D(() => {
  const R = window.__h.R;
  R.t = 0;
  R.maxDraws = 0;
  R.heals = 0;
  R.taken = 0;
  R.phaseAt = [0, 0, 0, 0];
  R.used = [0, 0, 0];
  R.windows = 0;
  R.maxMap = 0;
});
await shot('ku-01-wakes');
const shotK = new Set();
let kuRes = null;
for (let round = 0; round < 60; round++) {
  const r = await D(() => {
    const g = window.__dead.game;
    const H = window.__h;
    const { K, P, R } = H;
    const T = P.DEEP_SPOTS.tree;
    const end = R.t + 15;
    let wasOpen = false;
    while (R.t < end) {
      const k = g.zombies.boss && g.zombies.boss.alive ? g.zombies.boss : null;
      const v = g.hirasaka.view;
      if (!k || v.bossDown) return { done: true, t: R.t, thunders: v.thunders };
      if (R.died) return { died: R.died };
      const kw = v.kw;
      const ph = K.Kuro.phase(kw);
      if (ph && !R.phaseAt[ph]) {
        R.phaseAt[ph] = Math.max(R.t, 0.01);
        return { ev: `phase${ph}` };
      }
      const open = K.Kuro.open(kw);
      if (open && !wasOpen) R.windows++;
      wasOpen = open;
      const dk = Math.hypot(k.x - g.player.x, k.z - g.player.z);
      if (open) {
        // across the hall from him (the fan, the pump): run to a few metres off him first, on our side
        const clear = (x, z) => !g.level.world.segmentBlocked(x, 1.6, z, k.x, k.y + 2, k.z, 'shots') && !g.level.world.circleBlocked(x, z, 0.4, 0.4, 1.6);
        if (dk > 14 || !clear(g.player.x, g.player.z)) {
          // the nearest spot seven metres round him with a clear line (the tree's trunk is in the way of half of them)
          let best = null;
          for (let a = 0; a < 12; a++) {
            const x = k.x + Math.cos((a / 12) * Math.PI * 2) * 7;
            const z = k.z + Math.sin((a / 12) * Math.PI * 2) * 7;
            if (x < 271 || x > 341 || z < -66 || z > -9 || !clear(x, z)) continue;
            const d = Math.hypot(x - g.player.x, z - g.player.z);
            if (!best || d < best.d) best = { x, z, d };
          }
          if (best) H.runTo(best.x, best.z);
        }
        // fire at him from out of his reach: when he is on top of us, out into the hall (toward its middle, never into a corner)
        if (dk < 6 && !K.Kuro.stunned(kw) && !K.Kuro.pinned(kw)) {
          const cx = 310 - k.x;
          const cz = -36 - k.z;
          const cl = Math.max(0.1, Math.hypot(cx, cz));
          const ax = k.x + (cx / cl) * 9;
          const az = k.z + (cz / cl) * 9;
          if (!g.level.world.circleBlocked(ax, az, 0.4, 0.4, 1.6)) H.runTo(ax, az);
        }
        H.fire(k.x, k.y + 2.1, k.z);
        continue;
      }
      // the thunderlings and his miners, when one is close
      const near = g.zombies.zombies.filter((z) => z.alive && !z.isBoss && Math.hypot(z.x - g.player.x, z.z - g.player.z) < 14).sort((a, b) => Math.hypot(a.x - g.player.x, a.z - g.player.z) - Math.hypot(b.x - g.player.x, b.z - g.player.z))[0];
      const M = K.KMACHINES[ph - 1];
      if (ph === 1) {
        // at the hoist's winch; run it when he is under the rail
        if (Math.hypot(g.player.x - M.at.x, g.player.z - (M.at.z - 2)) > 1) H.runTo(M.at.x, M.at.z - 2);
        const under = Math.abs(k.z - K.KURO.rail.z) < K.KURO.band.z - 0.8 && k.x > K.KURO.rail.x0 && k.x < K.KURO.rail.x1;
        if (K.Kuro.ready(kw, 0) && under) {
          if (H.use(0.5)) R.used[0]++;
          H.tick(0.8);
          continue;
        }
      } else if (ph === 2) {
        if (K.Kuro.ready(kw, 1)) {
          H.runTo(M.at.x, M.at.z);
          if (H.use(0.5)) R.used[1]++;
          H.tick(0.05);
          continue;
        }
        // out of his gas while the fan winds back
        if (dk < K.KURO.gas.r + 1.5) {
          const ax = k.x + ((g.player.x - k.x) / Math.max(dk, 0.1)) * 10;
          const az = k.z + ((g.player.z - k.z) / Math.max(dk, 0.1)) * 10;
          H.runTo(Math.max(272, Math.min(340, ax)), Math.max(-64, Math.min(-10, az)));
        }
      } else if (ph === 3) {
        const pump = K.Kuro.pump(kw);
        if (K.Kuro.ready(kw, 2)) {
          H.runTo(M.at.x, M.at.z);
          if (H.use(0.5)) R.used[2]++;
          H.tick(0.05);
          continue;
        }
        if (pump === K.PSTATE.dry) {
          // bring him to the tree: stand by it, on the far side from him
          const sx = T.x + ((T.x - k.x) / Math.max(1, Math.hypot(T.x - k.x, T.z - k.z))) * 6;
          const sz = T.z + ((T.z - k.z) / Math.max(1, Math.hypot(T.x - k.x, T.z - k.z))) * 6;
          if (Math.hypot(g.player.x - sx, g.player.z - sz) > 2 && !g.level.world.circleBlocked(sx, sz, 0.4, 0.4, 1.6)) H.runTo(sx, sz);
        }
      }
      if (near) {
        H.fire(near.x, near.y + 1.2, near.z);
        continue;
      }
      H.tick(0.15);
    }
    return {};
  });
  if (!r.ev) {
    const st = await D(() => {
      const g = window.__dead.game;
      const { K, R } = window.__h;
      const v = g.hirasaka.view;
      const k = g.zombies.boss;
      const kw = v.kw;
      return `t ${R.t.toFixed(0)} phase ${K.Kuro.phase(kw)} thunders ${v.thunders.toString(2)} open ${K.Kuro.open(kw)} gas ${K.Kuro.gas(kw)} fan ${K.Kuro.fan(kw)} pump ${K.Kuro.pump(kw)} water ${K.Kuro.water(kw).toFixed(1)} windows ${R.windows} used ${R.used} heals ${R.heals} him ${k ? `${k.x.toFixed(0)},${k.z.toFixed(0)} hp ${k.hp.toFixed(0)}` : '-'} me ${g.player.x.toFixed(0)},${g.player.z.toFixed(0)} | ${R.log.slice(-1)[0] ?? ''}`;
    });
    console.log('     ' + st);
  }
  if (r.ev && !shotK.has(r.ev)) {
    shotK.add(r.ev);
    await D(() => {
      const g = window.__dead.game;
      const k = g.zombies.boss;
      if (k) window.__h.aimAt(k.x, k.y + 2, k.z);
    });
    await shot(`ku-02-${r.ev}`);
  }
  if (r.done || r.died) {
    kuRes = r;
    break;
  }
}
const kr = await D(() => ({ t: window.__h.R.t, heals: window.__h.R.heals, taken: Math.round(window.__h.R.taken), draws: window.__h.R.maxDraws, phaseAt: window.__h.R.phaseAt.map((n) => +n.toFixed(0)), used: window.__h.R.used, windows: window.__h.R.windows, shots: window.__h.R.shots, act: window.__dead.game.hirasaka.view.act, map: window.__h.R.maxMap, at: window.__h.R.maxMapAt }));
check('Kurogane put down: all eight thunders broken, the climb begins', !!kuRes?.done && kuRes.thunders === 255, kuRes ? JSON.stringify(kuRes) : 'timed out');
console.log(`     KUROGANE: ${kr.t.toFixed(0)} s of game time (phases began at ${kr.phaseAt.slice(1).join(', ')} s), machines worked ${kr.used.join('/')}, ${kr.windows} windows, ${kr.heals} top-ups, ${kr.taken} health and armour lost, most draws ${kr.draws} with the squad, ${kr.map} without (at ${kr.at})`);
check('the Kurogane fight at 190 draw calls or fewer (the squad apart)', kr.map <= 190, `${kr.map}; ${kr.draws} with the squad`);
await D(() => window.__h.tick(2));
await shot('ku-03-down');

const errors = logs.filter((l) => l.type === 'pageerror' || (l.type === 'error' && !/favicon|404|502|Bad Gateway/.test(l.text)));
for (const e of errors.slice(0, 8)) console.log('ERROR', e.text.slice(0, 400));
const blog = await D(() => window.__h?.R?.log ?? []).catch(() => []);
for (const l of blog.slice(-12)) console.log('     bot:', l);
console.log(fail.length ? `${fail.length} FAILED: ${fail.join('; ')}` : 'ALL PASSED');
await browser.close();
