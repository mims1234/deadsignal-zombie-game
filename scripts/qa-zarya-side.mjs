// ZARYA's side stories (`src/zarya/sidestories.ts`): plays every one headless to its end and reports what happened
// (screenshots of each place under $SC, default shots/zarya/side).
//
//   node scripts/qa-zarya-side.mjs [url] [w] [h]        default http://127.0.0.1:5183/ at 1280x720
//   QA_TOUCH=1 node scripts/qa-zarya-side.mjs ...        as a phone (adds ?touch=1)
//   ONLY=shuba,pike node scripts/qa-zarya-side.mjs       only these stories
//
// The story is put in Act II with every zone open (the tickets, the chains, the escalator, the pond road, the
// checkpoint). For each place of each story, in order, the player is stood on the nearest point round it from which the
// USE prompt names that place's own step (so it can be reached and is not hidden behind something else's prompt),
// facing it; a screenshot is taken; USE is pressed or held as the place asks. It checks that the step happened, that
// the story's lines were said, that the HUD line shows once the story is found (and names the next place), that the
// journal has its section, and that the payoff lands (points, a mod part, ammunition, armour).
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const out = process.env.SC ?? 'shots/zarya/side';
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

await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await advance(0.5);

// the stories, from the game's own module
const SIDE = await D(async () => {
  const m = await import('/src/zarya/sidestories.ts');
  return JSON.parse(JSON.stringify(m.SIDE));
});

// Act II, every zone open, the ones with names already seen to (a boss being fought hides the side line, as it should),
// nobody hunting
await D(async () => {
  const st = await import('/src/zarya/story.ts');
  const d = window.__dead;
  const g = d.game;
  const s = g.zarya.story;
  const F = st.F;
  const G = st.G;
  s.ch = st.CH.act2;
  s.f = F.armed | F.released | F.gena | F.guard | F.guardDown | F.plug | F.notice | F.flare | F.line | F.fuseBox | F.handleFit | F.fuseFit | F.bear | F.bearDown | F.hall;
  s.g = G.tickets | G.pond | G.code | G.escalator | G.borya | G.boryaIn | G.barred | G.cosmoKey | G.yaga | G.yagaDown | G.tamada | G.tamadaDown;
  s.unlock.view.gates = 7;
  g.zombies.spawnAllowed = () => false;
  d.clearZombies();
});
await advance(3);
// every line said on the wire is kept, to be checked
await D(() => {
  const g = window.__dead.game;
  window.__said = [];
  const real = g.radio.bind(g);
  g.radio = (who, text, secs) => {
    window.__said.push(text);
    return real(who, text, secs);
  };
});
// let the act's own opening lines go by
await D(() => {
  const z = window.__dead.game.zarya;
  z.queue.length = 0;
  z.lineT = 0;
});

const state = () => D(async () => {
  const g = window.__dead.game;
  const z = g.zarya;
  const pr = g.io?.prompt ?? null;
  // the HUD's list as the game builds it (`game.ts` updateHud)
  const hb = await import('/src/game/hudBridge.ts');
  const st = hb.buildHudState(g, g.mission, g.cards, g.io, null);
  z.decorateHud(st, hb.buildMapDynamic(g, g.mission, g.cards, g.markers));
  const objectives = st.objectives.map((o) => ({ id: o.id, title: o.title, detail: o.detail }));
  return {
    side: [...z.view.side], cash: g.session.inv.cash, armor: g.session.vitals.armor,
    ammo: g.session.inv.slots.map((s) => (s ? s.ammo.reserve : null)),
    prompt: pr?.text ?? null, sub: pr?.sub ?? '', queue: z.queue.length, said: [...window.__said, ...z.queue.map((l) => l[1])],
    draws: g.renderer.renderer.info.render.calls, x: g.player.x, z: g.player.z, objectives,
  };
});

/**
 * Stand somewhere from which the prompt names `verb`, facing (x, z): tries points round it at 1.0..2.4 m, nearest
 * first. Returns where, or null.
 */
const standAt = async (p, verb) => {
  const tries = [];
  for (const r of [1.1, 1.6, 2.2]) for (let k = 0; k < 16; k++) tries.push([r, (k / 16) * Math.PI * 2]);
  for (const [r, a] of tries) {
    const x = p.at.x + Math.cos(a) * r;
    const z = p.at.z + Math.sin(a) * r;
    const ok = await D(([x, z, tx, tz, ty]) => {
      const d = window.__dead;
      const g = d.game;
      d.clearZombies();
      d.setHealth(100, g.session.vitals.armor);
      const fh = g.level.world.floorHeight(x, z, 0.3);
      // not on top of the counter or the sill itself: the floor under a standing player
      if (fh > ty - 0.25 && ty > 0.4) return false;
      d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)), fh);
      return true;
    }, [x, z, p.at.x, p.at.z, p.y]);
    if (!ok) continue;
    await advance(0.25);
    const s = await state();
    // pushed out of something solid: not a place to stand
    if (Math.hypot(s.x - x, s.z - z) > 0.35) continue;
    // and the thing can be seen from there (no wall between: a prompt alone goes through walls)
    const seen = await D(([tx, ty, tz]) => {
      const g = window.__dead.game;
      const pl = g.player;
      const ey = pl.eyeY();
      const dx = tx - pl.x;
      const dy = ty + 0.08 - ey;
      const dz = tz - pl.z;
      const L = Math.hypot(dx, dy, dz);
      const hit = g.level.world.raycast(pl.x, ey, pl.z, dx / L, dy / L, dz / L, L, 'shots');
      return !hit || hit.t > L - 0.45;
    }, [p.at.x, p.y, p.at.z]);
    if (!seen) continue;
    if (s.prompt === verb) {
      // look at the thing
      await D(([tx, ty, tz]) => {
        const g = window.__dead.game;
        const pl = g.player;
        const dy = ty + 0.05 - pl.eyeY();
        pl.pitch = Math.atan2(dy, Math.hypot(tx - pl.x, tz - pl.z));
      }, [p.at.x, p.y, p.at.z]);
      await advance(0.15);
      return { x, z, a };
    }
  }
  return null;
};

/** Look at the place from a few steps back the way the player came (the HUD hidden), then stand at `from` again. */
const lookAt = async (p, from, file) => {
  for (const r of [3.2, 2.6, 2.0]) {
    const x = p.at.x + Math.cos(from.a) * r;
    const z = p.at.z + Math.sin(from.a) * r;
    await D(([x, z, tx, tz]) => {
      const d = window.__dead;
      const g = d.game;
      d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)), g.level.world.floorHeight(x, z, 0.3));
    }, [x, z, p.at.x, p.at.z]);
    await advance(0.3);
    const s = await state();
    if (Math.hypot(s.x - x, s.z - z) > 0.35 && r > 2.0) continue;
    // (and nothing between: else a step nearer)
    const clear = await D(([tx, ty, tz]) => {
      const g = window.__dead.game;
      const pl = g.player;
      const ey = pl.eyeY();
      const dx = tx - pl.x;
      const dy = ty + 0.08 - ey;
      const dz = tz - pl.z;
      const L = Math.hypot(dx, dy, dz);
      const hit = g.level.world.raycast(pl.x, ey, pl.z, dx / L, dy / L, dz / L, L, 'shots');
      return !hit || hit.t > L - 0.45;
    }, [p.at.x, p.y, p.at.z]);
    if (!clear && r > 2.0) continue;
    await D(([tx, ty, tz]) => {
      const pl = window.__dead.game.player;
      pl.pitch = Math.atan2(ty + 0.05 - pl.eyeY(), Math.hypot(tx - pl.x, tz - pl.z));
    }, [p.at.x, p.y, p.at.z]);
    await advance(0.4);
    const css = await page.addStyleTag({ content: '.ds-hud, .ds-touch-layer, .ds-prompt { opacity: 0 !important; }' });
    await page.screenshot({ path: file });
    await css.evaluate((n) => n.remove());
    break;
  }
  await D(([x, z, tx, tz, ty]) => {
    const d = window.__dead;
    const g = d.game;
    d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)), g.level.world.floorHeight(x, z, 0.3));
    const pl = g.player;
    pl.pitch = Math.atan2(ty + 0.05 - pl.eyeY(), Math.hypot(tx - x, tz - z));
  }, [from.x, from.z, p.at.x, p.at.z, p.y]);
  await advance(0.3);
};

const use = async (hold) => {
  if (hold > 0) {
    await D(() => window.__dead.hold({ interact: true }));
    await advance(hold + 0.4);
    await D(() => window.__dead.releaseAll());
  } else await D(() => window.__dead.press('interact'));
  await advance(0.4);
};

/** Let what is queued be said (the captions), and return what was said. */
const drainLines = async () => {
  const said = (await state()).said;
  await D(() => {
    const z = window.__dead.game.zarya;
    z.queue.length = 0;
    z.lineT = 0;
    window.__said = [];
  });
  return said;
};

const early = [];
for (let s = 0; s < SIDE.length; s++) {
  const q = SIDE[s];
  if (only && !only.includes(q.id)) continue;
  console.log(`---- ${q.title}`);
  // nothing to spare before a story that pays in ammunition or armour, so the payoff shows
  await D(([ammo, armor]) => {
    const g = window.__dead.game;
    if (ammo) for (const w of g.session.inv.slots) if (w) w.ammo.reserve = 0;
    if (armor) window.__dead.setHealth(100, 0);
  }, [!!q.reward.ammo, !!q.reward.armor]);
  const before = await state();
  const mods0 = await D(async () => {
    const st = await import('/src/zarya/story.ts');
    return st.ZaryaStory.modParts(window.__dead.game.zarya.view);
  });
  for (let k = 0; k < q.stages.length; k++) {
    const stage = q.stages[k];
    for (let j = 0; j < stage.places.length; j++) {
      const p = stage.places[j];
      const name = `${q.id} ${k}.${j}`;
      // a place whose step has not come: a note, if it has one
      if (p.early && k > 0 && j === 0) early.push({ q, p });
      const at = await standAt(p, p.verb);
      check(`${name}: "${p.verb}" can be reached`, !!at);
      if (!at) continue;
      await page.screenshot({ path: `${out}/${tag}-${q.id}-${k}-${j}.png` });
      await lookAt(p, at, `${out}/${tag}-${q.id}-${k}-${j}-view.png`);
      const was = (await state()).side[s];
      await use(p.hold ?? 0);
      const now = await state();
      check(`${name}: done`, now.side[s] !== was, `${was} -> ${now.side[s]}`);
      if (p.after) await lookAt(p, at, `${out}/${tag}-${q.id}-${k}-${j}-after.png`);
      const said = await drainLines();
      const want = [...(p.lines ?? []), ...(j === stage.places.length - 1 || stage.places.length === 1 ? stage.lines : [])];
      if (want.length) check(`${name}: the lines are said`, want.every(([, t]) => said.includes(t)), `${said.length} queued`);
      if (k === 0 && j === 0 && q.stages.length > 1) {
        await advance(0.3);
        const hud = (await state()).objectives.find((o) => o.id === `zy-side-${q.id}`);
        const all = (await state()).objectives;
        check(`${name}: found, a quiet line on the HUD`, !!hud && hud.detail === q.stages[1].hint, hud ? hud.detail : all.map((o) => o.title).join(' / '));
      }
    }
  }
  // the payoff
  await advance(0.5);
  const after = await state();
  const r = q.reward;
  if (r.cash) check(`${q.id}: +$${r.cash}`, after.cash - before.cash >= r.cash && after.cash - before.cash < r.cash + 100, `${before.cash} -> ${after.cash}`);
  if (r.armor) check(`${q.id}: armour`, before.armor === 0 && after.armor >= 50, `${before.armor} -> ${after.armor}`);
  if (r.ammo) check(`${q.id}: ammunition`, after.ammo.some((a) => a > 0) && after.ammo.every((a, i) => a === null || a > (before.ammo[i] ?? 0)), JSON.stringify(after.ammo));
  if (r.mod) {
    const mods1 = await D(async () => {
      const st = await import('/src/zarya/story.ts');
      return st.ZaryaStory.modParts(window.__dead.game.zarya.view);
    });
    check(`${q.id}: +${r.mod} mod part`, mods1 - mods0 === r.mod, `${mods0} -> ${mods1}`);
  }
  check(`${q.id}: finished, off the HUD`, !after.objectives.some((o) => o.id === `zy-side-${q.id}`));
  const journal = await D(() => window.__dead.game.zarya.journal().textContent);
  check(`${q.id}: its own section in the journal, with the town's history`, journal.includes(`${q.title}  -  DONE`) && journal.includes(q.history));
}

// a fresh run: every place's thing stands there, and a note where a step has not come yet
await D(async () => {
  const s = window.__dead.game.zarya.story;
  s.side = s.side.map(() => 0);
});
await advance(0.5);
for (const { q, p } of early.slice(0, 4)) {
  const at = await standAt(p, p.early[0]);
  check(`${q.id}: a note at "${p.early[0]}" before its step`, !!at);
}

const errs = logs.filter((l) => (l.type === 'error' || l.type === 'pageerror') && !/favicon|websocket|ws:|net::|404/i.test(l.text)).map((l) => l.text);
if (bad.length) console.log(`(the dev server answered ${bad.length} requests with an error: ${[...new Set(bad)].slice(0, 4).join(', ')})`);
check('no errors in the console', errs.filter((e) => !/status of 50\d/.test(e)).length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${fail.length ? `${fail.length} FAILED` : 'all ok'}  (${tag}, screenshots in ${out})`);
await browser.close();
process.exit(fail.length ? 1 : 0);
