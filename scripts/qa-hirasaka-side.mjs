// HIRASAKA's side stories (`src/hirasaka/sides.ts`): plays every one headless to its end, through the real USE prompts,
// and reports what happened (screenshots of each place under $SC, default shots/hirasaka/side).
//
//   node scripts/qa-hirasaka-side.mjs [url] [w] [h]       default http://127.0.0.1:5183/ at 1280x720, quality Low
//   QA_TOUCH=1 node scripts/qa-hirasaka-side.mjs ...       as a phone (adds &touch=1)
//   ONLY=barber,cats node scripts/qa-hirasaka-side.mjs     only these stories
//
// For each place of each story, in order, the player is stood on the nearest point round it from which the USE prompt
// names that place's own step (so it can be reached, the thing seen, and not hidden behind another prompt), facing it;
// a screenshot is taken; USE is pressed or held as the place asks. It checks the step happened, the lines were said, the
// HUD's quiet line shows once the story is found (naming the next step), the journal has its part, and the payoff lands
// (points, ammunition). At every place the draw calls are read on Low, with and without the side things' one mesh.
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const out = process.env.SC ?? 'shots/hirasaka/side';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
mkdirSync(out, { recursive: true });
const tag = touch ? 'phone' : 'pc';

const { browser, page, logs } = await openPage({ w, h });
// other sessions save files in this checkout while it runs: the hot-reload socket is answered and never heard from
await page.routeWebSocket((u) => u.pathname === '/' && u.host === new URL(base).host, () => {});
const bad = [];
page.on('response', (r) => { if (r.status() >= 500) bad.push(`${r.status()} ${r.url()}`); });
await page.goto(`${base}?nolock${touch ? '&touch=1' : ''}`, { waitUntil: 'load' });
const fail = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) fail.push(name);
};
const D = (fn, ...args) => page.evaluate(fn, ...args);
const advance = (sec) => D((s) => window.__dead.advance(s), sec);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => {
  localStorage.setItem('deadsignal.map.v1', 'hirasaka');
  const k = 'deadsignal.settings.v1';
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  localStorage.setItem(k, JSON.stringify({ ...s, quality: 'low', qualityAuto: false, masterVolume: 0 }));
});
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 90000 });
await advance(0.5);

// the stories, from the game's own module
const SIDE = await D(async () => {
  const m = await import('/src/hirasaka/sides.ts');
  return JSON.parse(JSON.stringify(m.SIDE));
});
const TEXT = await D(async () => {
  const m = await import('/src/hirasaka/lines.ts');
  return Object.fromEntries(Object.entries(m.LINE).map(([k, l]) => [k, l.text]));
});

// nobody hunting; the opening's lines let go by; every line said is kept, to be checked
await D(() => {
  const d = window.__dead;
  const g = d.game;
  g.zombies.spawnAllowed = () => false;
  d.clearZombies();
  window.__said = [];
  const real = g.radio.bind(g);
  g.radio = (who, text, secs) => {
    window.__said.push(text);
    return real(who, text, secs);
  };
});
await advance(2);

const state = () =>
  D(async () => {
    const g = window.__dead.game;
    const hs = g.hirasaka;
    const pr = g.io?.prompt ?? null;
    const hb = await import('/src/game/hudBridge.ts');
    const st = hb.buildHudState(g, g.mission, g.cards, g.io, null);
    hs.decorateHud(st, hb.buildMapDynamic(g, g.mission, g.cards, g.markers));
    const objectives = st.objectives.map((o) => ({ id: o.id, title: o.title, detail: o.detail }));
    return {
      sides: [...hs.view.sides], side: hs.view.side, cash: g.session.inv.cash,
      ammo: g.session.inv.slots.map((s) => (s ? s.ammo.reserve : null)),
      prompt: pr?.text ?? null, sub: pr?.sub ?? '', said: [...window.__said], queue: [...hs.sides.queue, ...(hs.sound.queue ?? []).map((e) => e.id)], // (final polish) and the voiced lines waiting their turn in the sound's own queue
      x: g.player.x, y: g.player.y, z: g.player.z, objectives,
    };
  });

/** Stand where the prompt names `verb` (points round the place at 1.0..2.6 m, nearest first), facing the thing. */
const standAt = async (p, verb) => {
  const tries = [];
  for (const r of [1.1, 1.6, 2.2, 2.6]) for (let k = 0; k < 16; k++) tries.push([r, (k / 16) * Math.PI * 2]);
  for (const [r, a] of tries) {
    if (r > (p.r ?? 2.6) + 0.3) continue;
    const x = p.at.x + Math.cos(a) * r;
    const z = p.at.z + Math.sin(a) * r;
    await D(([x, z, y, tx, tz]) => {
      const d = window.__dead;
      d.clearZombies();
      d.setHealth(100, 100);
      d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)), y);
    }, [x, z, p.at.y, p.at.x, p.at.z]);
    await advance(0.3);
    const s = await state();
    // pushed out of something solid, or fallen off the floor: not a place to stand
    if (Math.hypot(s.x - x, s.z - z) > 0.35 || Math.abs(s.y - p.at.y) > 0.6) continue;
    // the thing can be seen from there (no wall between: a prompt alone goes through walls)
    const seen = await D(([tx, ty, tz]) => {
      const g = window.__dead.game;
      const pl = g.player;
      const ey = pl.eyeY();
      const dx = tx - pl.x;
      const dy = ty - ey;
      const dz = tz - pl.z;
      const L = Math.hypot(dx, dy, dz);
      const hit = g.level.world.raycast(pl.x, ey, pl.z, dx / L, dy / L, dz / L, L, 'shots');
      return !hit || hit.t > L - 0.5;
    }, [p.at.x, p.at.y + p.y + 0.08, p.at.z]);
    if (!seen) continue;
    if (s.prompt === verb) {
      await D(([tx, ty, tz]) => {
        const pl = window.__dead.game.player;
        pl.pitch = Math.atan2(ty - pl.eyeY(), Math.hypot(tx - pl.x, tz - pl.z));
      }, [p.at.x, p.at.y + p.y, p.at.z]);
      await advance(0.15);
      return { x, z, a };
    }
  }
  return null;
};

/** Draw calls now (a real rendered frame), with and without the side things' mesh. */
const draws = async () => {
  await sleep(350);
  const a = await D(() => window.__dead.game.renderer.renderer.info.render.calls);
  // the same frame without the side things' mesh (its own update keeps it hidden for a moment)
  await D(() => {
    const mk = window.__dead.game.hirasaka.sides.marks;
    mk.qaReal = mk.update;
    mk.update = () => (mk.mesh.visible = false);
  });
  await sleep(350);
  const b = await D(() => window.__dead.game.renderer.renderer.info.render.calls);
  await D(() => {
    const mk = window.__dead.game.hirasaka.sides.marks;
    mk.update = mk.qaReal;
  });
  return { all: a, without: b };
};

const use = async (hold) => {
  if (hold > 0) {
    await D(() => window.__dead.hold({ interact: true }));
    await advance(hold + 0.4);
    await D(() => window.__dead.releaseAll());
  } else await D(() => window.__dead.press('interact'));
  await advance(0.4);
};

/** What has been said or is waiting to be, and then quiet (the queue let go). */
const drainLines = async () => {
  const s = await state();
  const said = [...s.said, ...s.queue.map((id) => TEXT[id])];
  await D(() => {
    const q = window.__dead.game.hirasaka.sides;
    q.queue.length = 0;
    q.lineT = 0;
    window.__dead.game.hirasaka.sound.queue.length = 0; // (final polish)
    window.__said = [];
  });
  return said;
};

let worst = { calls: 0, where: '', mine: 0 };
for (let s = 0; s < SIDE.length; s++) {
  const q = SIDE[s];
  if (only && !only.includes(q.id)) continue;
  console.log(`---- ${q.title}`);
  // nothing to spare before a story that pays in ammunition, so the payoff shows
  await D((ammo) => {
    const g = window.__dead.game;
    if (ammo) for (const w of g.session.inv.slots) if (w) w.ammo.reserve = 0;
  }, !!q.reward.ammo);
  const before = await state();
  // a fresh story: its second step's place shows a quiet note before that step comes
  const p1 = q.stages[1]?.places[0];
  if (p1?.early) check(`${q.id}: a note ("${p1.early[0]}") before its step`, !!(await standAt(p1, p1.early[0])));
  for (let k = 0; k < q.stages.length; k++) {
    const stage = q.stages[k];
    for (let j = 0; j < stage.places.length; j++) {
      const p = stage.places[j];
      const name = `${q.id} ${k}.${j}`;
      const at = await standAt(p, p.verb);
      check(`${name}: "${p.verb}" can be reached and seen`, !!at);
      if (!at) continue;
      const dc = await draws();
      if (dc.all > worst.calls) worst = { calls: dc.all, where: name, mine: dc.all - dc.without };
      await page.screenshot({ path: `${out}/${tag}-${q.id}-${k}-${j}.png` });
      const was = (await state()).sides[s];
      await use(p.hold ?? 0);
      const now = await state();
      check(`${name}: done`, now.sides[s] !== was, `${was} -> ${now.sides[s]}  draws ${dc.all} (side things ${dc.all - dc.without})`);
      if (p.after?.length) {
        const css = await page.addStyleTag({ content: '.ds-hud, .ds-touch-layer, .ds-prompt { opacity: 0 !important; }' });
        // the after: look at the first thing that appeared from where the player stands
        const t = p.after[0];
        await D(([tx, ty, tz]) => {
          const pl = window.__dead.game.player;
          pl.yaw = Math.atan2(-(tx - pl.x), -(tz - pl.z));
          pl.pitch = Math.atan2(ty - pl.eyeY(), Math.hypot(tx - pl.x, tz - pl.z));
        }, [t.x, t.y + 0.1, t.z]);
        await advance(0.2);
        await sleep(300);
        await page.screenshot({ path: `${out}/${tag}-${q.id}-${k}-${j}-after.png` });
        await css.evaluate((n) => n.remove());
      }
      const said = await drainLines();
      const want = [...(p.lines ?? []), ...(j === stage.places.length - 1 || stage.places.length === 1 ? stage.lines : [])].map((id) => TEXT[id]);
      if (want.length) check(`${name}: the lines are said`, want.every((t) => said.includes(t)), `${want.filter((t) => !said.includes(t)).length} missing of ${want.length}`);
      if (k === 0 && j === 0) {
        await advance(0.3);
        const all = (await state()).objectives;
        const hud = all.find((o) => o.id === `hs-side-${q.id}`);
        check(`${name}: found, one quiet line on the HUD`, !!hud && hud.detail === q.stages[1].hint, hud ? hud.detail : all.map((o) => o.title).join(' / '));
      }
    }
  }
  // the payoff
  await advance(0.5);
  const after = await state();
  const r = q.reward;
  if (r.cash) check(`${q.id}: +$${r.cash}`, after.cash - before.cash >= r.cash && after.cash - before.cash < r.cash + 100, `${before.cash} -> ${after.cash}`);
  if (r.ammo) check(`${q.id}: ammunition`, after.ammo.some((a) => a > 0) && after.ammo.every((a, i) => a === null || a > (before.ammo[i] ?? 0)), JSON.stringify(after.ammo));
  check(`${q.id}: finished (its bit in the story's side)`, (after.side & (1 << s)) !== 0);
  check(`${q.id}: finished, off the HUD`, !after.objectives.some((o) => o.id === `hs-side-${q.id}`));
  const journal = await D(async () => {
    const m = await import('/src/hirasaka/journal.ts');
    const g = window.__dead.game;
    return m.buildJournal({ tapes: 0, photos: 0, call: false, home: false, sealed: false }, g.hirasaka.view, new Set()).textContent;
  });
  check(`${q.id}: its own part in the journal, with the island's history`, journal.includes(`${q.title}  -  DONE`) && journal.includes(q.history) && (!r.page || journal.includes(r.page)));
}
if (!only) {
  const v = await state();
  check('all ten finished: the rice ball bit (ending 2) is set', (v.side & 1023) === 1023, String(v.side));
}
console.log(`\nworst draw calls at a side place on Low: ${worst.calls} at ${worst.where} (the side things: ${worst.mine})`);

const errs = logs.filter((l) => (l.type === 'error' || l.type === 'pageerror') && !/favicon|websocket|ws:|net::|404/i.test(l.text)).map((l) => l.text);
if (bad.length) console.log(`(the dev server answered ${bad.length} requests with an error: ${[...new Set(bad)].slice(0, 4).join(', ')})`);
check('no errors in the console', errs.filter((e) => !/status of 50\d/.test(e)).length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${fail.length ? `${fail.length} FAILED` : 'all ok'}  (${tag}, screenshots in ${out})`);
await browser.close();
process.exit(fail.length ? 1 : 0);
