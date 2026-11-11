// ZARYA: plays the whole story headless, from the van to an ending, and reports what happened (screenshots under $SC,
// default shots/zarya).
//
//   node scripts/qa-zarya.mjs [url] [w] [h]          default http://127.0.0.1:5183/ at 1280x720
//   QA_TOUCH=1 node scripts/qa-zarya.mjs ...          as a phone (adds ?touch=1)
//   QA_END=2 | QA_END=3 node scripts/qa-zarya.mjs     the other endings (2: the keys out of order; 3: enough sleepers
//                                                     covered that he believes the answer). Default 1.
//
// It walks the story in order (by teleporting to each place and using what is there, as a player would with USE).
// ACT I    the shelter, the blast door, Nina's pistols, the manual release, Gena, the guard and the shutter's plug, the
//          noticeboard, the Signalka's two parts and the workbench, the flare, Line One's handle and fuse, the sack and
//          the bear, the tram.
// ACT II   the Rynok and Borya's cold store, the Dvor, the bolt cutters and the three chains, the garages, the depot,
//          the ornaments and the tree, the escalator and the Tamada, the tickets and Baba Yaga.
// ACT III  the matryoshkas and the pond road, the banya, the plant, the keypad, the Institute, the four keys, Morozko,
//          the console.
// Every place is taken by its NAME from the game's own modules (the dev server serves them), so a zone that moves a
// spot moves the script with it. It checks that nothing runs a clock and that nothing ends the run but the ending.
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const END = Number(process.env.QA_END ?? 1);
const out = process.env.SC ?? 'shots/zarya';
mkdirSync(out, { recursive: true });
const tag = touch ? 'phone' : 'pc';

const { browser, page, logs } = await openPage({ w, h });
// other sessions edit this checkout while the script runs: the dev server's hot-reload socket is answered and never
// heard from, so a file saved half way through the story does not reload the page under it
await page.routeWebSocket((u) => u.pathname === '/' && u.host === new URL(base).host, () => {});
await page.goto(`${base}?nolock${touch ? '&touch=1' : ''}`, { waitUntil: 'load' });
const fail = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) fail.push(name);
};
const D = (fn, ...args) => page.evaluate(fn, ...args);
const shot = (name) => page.screenshot({ path: `${out}/${tag}-${name}.png` });
const advance = (sec) => D((s) => window.__dead.advance(s), sec);

await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await advance(0.5);

// every place and every flag by its name, from the game's own modules
const N = await D(async () => {
  const pl = await import('/src/zarya/places.ts');
  const st = await import('/src/zarya/story.ts');
  const un = await import('/src/zarya/unlock.ts');
  return JSON.parse(JSON.stringify({
    ZARYA: pl.ZARYA, RYNOK: pl.RYNOK, DVOR: pl.DVOR, GARAGES: pl.GARAGES, DEPOT: pl.DEPOT, DK: pl.DK, BANYA: pl.BANYA, TETS: pl.TETS, INSTITUTE: pl.INSTITUTE, CANTEEN: pl.CANTEEN, BERLOGA: pl.BERLOGA, UPSTAIRS: pl.UPSTAIRS,
    STOPS: pl.STOPS, GATES: pl.GATES, CH: st.CH, F: st.F, G: st.G, CLUES: st.CLUES, CLUE: st.CLUE, COVERS: st.COVERS, ORNAMENTS: st.ORNAMENTS, DOLLS: st.DOLLS, TOOLS: st.TOOLS, BENCHES: st.BENCHES, AT: st.AT, STORY: st.STORY, KEYS: st.KEYS,
    parts: un.TOWN.parts, PART: un.PART, RECIPE: un.RECIPE, CHAIN: un.CHAIN,
  }));
});
const { ZARYA, RYNOK, DVOR, GARAGES, DEPOT, DK, BANYA, TETS, INSTITUTE, CANTEEN, BERLOGA, UPSTAIRS, STOPS, GATES, CH, F, G, CLUES, CLUE, COVERS, ORNAMENTS, DOLLS, TOOLS, AT, STORY, KEYS, PART, RECIPE, CHAIN } = N;
const PARTS = N.parts;

const state = () => D(() => {
  const g = window.__dead.game;
  const v = g.zarya.view;
  const m = g.melee;
  const lv = g.level.zarya;
  const pr = g.io?.prompt ?? null;
  const squad = g.squad.devInfo?.() ?? null;
  return {
    map: g.mapId, ch: v.ch, f: v.f, g: v.g, m: v.m, parts: v.parts, built: v.built, gates: v.gates, clues: v.clues, covered: v.covered, orn: v.orn, dolls: v.dolls, turned: v.turned, end: v.end,
    unarmed: g.zarya.unarmed, hidden: g.weapons.hidden,
    melee: m ? { carried: m.carried, out: m.out, pack: [...m.pack] } : null, slots: g.session.inv.slots.map((s) => s?.id ?? null), cash: g.session.inv.cash,
    hp: g.session.vitals.health, zone: g.zarya.zones.current, drawn: g.zarya.zones.count,
    door: lv.blastDoor.blocksMove, coldDoor: lv.coldDoor.blocksMove, keyDoor: lv.keyDoor.blocksMove, escalator: lv.escalator.closed,
    shut: Object.fromEntries(Object.entries(lv.gates).map(([id, c]) => [id, c.blocksMove])),
    elapsed: g.session.elapsed, ended: g.session.ended,
    zombies: g.zombies.zombies.filter((z) => z.alive).length, squad: squad?.length ?? null,
    close: (squad ?? []).filter((a) => Math.hypot(a.x - g.player.x, a.z - g.player.z) < 10).length,
    draws: g.renderer.renderer.info.render.calls, x: g.player.x, z: g.player.z,
    prompt: pr?.text ?? null, sub: pr?.sub ?? '', can: !!pr && pr.key !== '',
  };
});
/** Stand somewhere, facing a point (on whatever floor is there). */
const go = async (x, z, tx = x + 1, tz = z, wait = 0.3) => {
  await D(([x, z, tx, tz]) => { const d = window.__dead; d.setHealth(100, 100); d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)), d.game.level.world.floorHeight(x, z, 0.3)); }, [x, z, tx, tz]);
  await advance(wait);
};
/** Stand on a named spot; or `back` metres short of it (along z, or along x), facing it. */
const at = (o, back = 0, axis = 'z', wait = 0.3) => (back === 0 ? go(o.x, o.z, o.x, o.z - 1, wait) : axis === 'z' ? go(o.x, o.z + back, o.x, o.z, wait) : go(o.x + back, o.z, o.x, o.z, wait));
/** Use what is here: a tap, or a hold of `sec` seconds. */
const use = async (sec = 0) => {
  if (sec > 0) {
    await D(() => window.__dead.hold({ interact: true }));
    await advance(sec + 0.4);
    await D(() => window.__dead.releaseAll());
  } else await D(() => window.__dead.press('interact'));
  await advance(0.4);
};
/** Put down every infected with this name (or all of them), as bullets would. */
const kill = (name) => D((name) => {
  const g = window.__dead.game;
  for (const z of [...g.zombies.zombies]) if (z.alive && (!name || z.tag === name)) g.zombies.damage(z, 1e6, false, g.zenv, z.yaw);
}, name ?? null);
/** Put down everyone without a name (the ones with names are the story's own). */
const sweep = () => D(() => {
  const g = window.__dead.game;
  for (const z of [...g.zombies.zombies]) if (z.alive && !z.tag) g.zombies.damage(z, 1e6, false, g.zenv, z.yaw);
});
/** One of the named ones: where it is, and what a blow of `hit` took off it just now. */
const named = (name, hit = 0) => D(([name, hit]) => {
  const g = window.__dead.game;
  const z = g.zombies.zombies.find((q) => q.alive && q.tag === name);
  if (!z) return null;
  const hp0 = z.hp;
  if (hit > 0) g.zombies.damage(z, hit, false, g.zenv, z.yaw);
  return { x: z.x, z: z.z, hp: z.hp, hurt: hp0 - z.hp };
}, [name, hit]);
const has = (s, flag) => (s.f & flag) !== 0;
const did = (s, flag) => (s.g & flag) !== 0;
const bit = (mask, i) => (mask & (1 << i)) !== 0;
const count = (mask) => { let n = 0; for (let m = mask; m; m &= m - 1) n++; return n; };
const shells = (s, i) => Math.min(STORY.dollShells, Math.floor(((s.dolls >> (i * 6)) & 63) / STORY.dollKills));
const cash = (n) => D((n) => { window.__dead.game.session.inv.cash = n; }, n);
const stopOf = (id) => STOPS.find((q) => q.id === id);
const gateOf = (id) => GATES.find((q) => q.id === id);
const clueOf = (id) => CLUES.findIndex((q) => q.id === id);
const by = (s, o, r = 2.5) => Math.hypot(s.x - o.x, s.z - o.z) <= r;
/** Paid `price` just now (a kill's few points may have come in on top). */
const paid = (before, after, price) => after >= before - price && after <= before - price + 200;
/** Let whoever is talking finish: nothing is skipped, so a script that runs through the town in minutes has a queue behind it. */
const hush = async (max = 900) => {
  for (let i = 0; i < max && (await D(() => { const q = window.__dead.game.zarya; return q.queue.length > 0 || q.lineT > 0; })); i += 5) {
    await D(() => window.__dead.setHealth(100, 100));
    await advance(5);
  }
};
const say = (s) => `${s.prompt ?? 'no prompt'}${s.sub ? ` / ${s.sub}` : ''}`;
/** Walk over a part (it is picked up in passing) and say whether the squad has it. */
const part = async (name) => {
  const i = PART[name];
  await at(PARTS[i], 1);
  const s = await state();
  check(`part: ${PARTS[i].name.toLowerCase()}`, bit(s.parts, i), `parts ${s.parts}`);
};
/** Notice a clue: the prompt names it, a tap takes it. */
const notice = async (id, words) => {
  const i = clueOf(id);
  await at(CLUES[i].at, 1);
  let s = await state();
  const offered = words.test(s.prompt ?? '') && s.can;
  await use();
  s = await state();
  check(`clue: ${CLUES[i].name.toLowerCase()}`, offered && bit(s.clues, i), say(s));
};
/** Cover a sleeper. */
const cover = async (i) => {
  await at(COVERS[i], 1.1, 'x');
  let s = await state();
  const offered = /^COVER (HER|HIM)$/.test(s.prompt ?? '');
  await use(1.2);
  s = await state();
  return offered && bit(s.covered, i);
};
/** Ride Line One from the stop the player stands at: the prompt has to name `to`. */
const ride = async (from, to, back = false) => {
  const a = stopOf(from);
  await go(a.door.x - (back ? 6 : 0), a.door.z, a.door.x, a.door.z + 4, 0.3);
  let s = await state();
  const offered = new RegExp(`^RIDE ${back ? 'BACK' : 'ON'} TO ${stopOf(to).name}$`).test(s.prompt ?? '');
  const said = say(s);
  await use(1.2);
  await advance(2.4);
  s = await state();
  check(`Line One: ${a.name} ${back ? 'back' : 'on'} to ${stopOf(to).name}, the squad with you`, offered && by(s, stopOf(to).door) && s.close === s.squad, `${said}; at ${s.x.toFixed(0)},${s.z.toFixed(0)}; squad ${s.close}/${s.squad}`);
};

// =====================================================================================================================
// ACT I
// =====================================================================================================================

// ---- the square, alive ----
let s = await state();
check('the town loads as zarya', s.map === 'zarya');
check('the act opens before the snow: chapter 0, nothing found', s.ch === 0 && s.f === 0 && s.parts === 0);
check('nothing is in their hands, and nothing fires', s.unarmed === true && s.hidden === true, `unarmed ${s.unarmed}, hidden ${s.hidden}`);
check('nobody is on their feet who should not be', s.zombies === 0, `${s.zombies} infected`);
check('two squadmates stand with you', s.squad === 2, String(s.squad));
check('on the square the store is drawn and the shelter is not', s.zone === 'square' && s.drawn >= 2 && s.drawn <= 4, `${s.zone} ${s.drawn}`);
await D(() => window.__dead.click());
await advance(0.3);
check('a trigger pull before the rack does nothing', (await D(() => window.__dead.game.session.stats.shotsFired)) === 0);
await advance(2);
await shot('01-alive');
await go(27, 20, 27, -20);
await shot('02-fair-alive');

// ---- the staff door, the stairs, the shelter ----
await go(ZARYA.laneDoor.x, ZARYA.laneDoor.z + 3, ZARYA.laneDoor.x, ZARYA.laneDoor.z - 5, 0.6);
await shot('03-staff-door');
await go(ZARYA.stairHead.x, ZARYA.stairHead.z + 0.2, ZARYA.stairHead.x, ZARYA.stairHead.z - 6, 0.4); // the head of the stairs (zaryaStore.ts stairPit)
s = await state();
check('the stairs down offer themselves at their doorway', /ENTER|DOWN|STAIR/i.test(s.prompt ?? ''), say(s));
await go(ZARYA.stairFoot.x + 2, 0, ZARYA.blastDoor.x + 2, 0, 0.5);
s = await state();
check('in the shelter only the shelter is drawn', s.zone === 'shelter' && s.drawn === 1, `${s.zone} ${s.drawn}`);
check('the blast door stands open until the squad is through it', s.door === false && s.ch === CH.arrive);
await shot('04-vestibule');
await go(ZARYA.sealLine + 2.5, 1, ZARYA.kostya.x, ZARYA.kostya.z, 0.6);
s = await state();
check('through the door, it seals behind them', s.ch === CH.sealed && s.door === true, `ch ${s.ch}, door ${s.door}`);
await shot('05-sealed');
await go(ZARYA.rack.x - 1, ZARYA.rack.z, ZARYA.rack.x + 2, ZARYA.rack.z, 0.3);
s = await state();
check('the rack stays locked until the forty minutes have passed', !s.can && has(s, F.armed) === false, say(s));
// nobody is talked over and nothing is skipped: the dark waits for the last line, and the script waits with it
await hush();
await advance(16);
await shot('06-after-the-skip');
await go(ZARYA.blastDoor.x + 1.4, 0.4, ZARYA.blastDoor.x, 0, 0.3);
s = await state();
check('the sealed door says so', /SEALED/.test(s.prompt ?? ''), say(s));
await go(ZARYA.release.x, ZARYA.release.z - 1.2, ZARYA.release.x, ZARYA.release.z + 1, 0.3);
s = await state();
check('the release waits for the pistols', /RELEASE/.test(s.prompt ?? '') && s.ch === CH.sealed, say(s));
await use(2);
s = await state();
check('and cannot be pulled before them', s.ch === CH.sealed);
await go(ZARYA.rack.x - 1, ZARYA.rack.z, ZARYA.rack.x + 2, ZARYA.rack.z, 0.3);
await shot('07-rack');
await use();
s = await state();
check("Nina's rack arms the squad: a pistol and a knife", has(s, F.armed) && !s.unarmed && !s.hidden && s.slots[0] === 'pistol' && s.melee?.carried === 'knife', JSON.stringify({ f: s.f, slots: s.slots, melee: s.melee }));
await go(PARTS[PART.tube].x, PARTS[PART.tube].z - 0.8, PARTS[PART.tube].x, PARTS[PART.tube].z + 2, 0.4);
s = await state();
check('the flare tube is taken from the shelter kit in passing', bit(s.parts, PART.tube), `parts ${s.parts}`);
await go(ZARYA.release.x, ZARYA.release.z - 1.2, ZARYA.release.x, ZARYA.release.z + 1, 0.3);
await use(2);
s = await state();
check('the manual release opens the door for good', s.ch === CH.ground && s.door === false && has(s, F.released), `ch ${s.ch}`);
await shot('08-released');

// ---- the ground floor: Gena ----
await go(120, 19, ZARYA.staffDoor.x, ZARYA.staffDoor.z, 0.4);
s = await state();
check('one man waits upstairs, and nobody else', s.zombies === 1, `${s.zombies}`);
await go(ZARYA.staffDoor.x, 10, ZARYA.gena.x, ZARYA.gena.z, 1.2);
await shot('09-gena');
s = await state();
check('coming into the hall turns him round', has(s, F.hall));
await kill('GENA');
await advance(0.6);
s = await state();
check('Gena down: the town opens', has(s, F.gena) && s.ch === CH.town, `ch ${s.ch}`);

// ---- the shutter: the guard woken wrong, the plug ----
await go(82, ZARYA.shutter.z, ZARYA.shutter.x, ZARYA.shutter.z, 0.8);
s = await state();
check('the guard under the shutter wakes, and they come down from above', has(s, F.guard) && s.zombies >= 4, `${s.zombies} infected`);
await shot('10-guard');
await go(ZARYA.plug.x + 1.2, ZARYA.plug.z, ZARYA.plug.x - 1, ZARYA.plug.z, 0.3);
s = await state();
check('the plug cannot be pulled while he stands', !/PLUG/.test(s.prompt ?? ''), say(s));
await kill();
await advance(0.6);
await go(ZARYA.plug.x + 1.2, ZARYA.plug.z, ZARYA.plug.x - 1, ZARYA.plug.z, 0.3);
await use(1.4);
s = await state();
check('with the guard down, the plug comes out', has(s, F.guardDown) && has(s, F.plug), `f ${s.f}`);

// ---- the noticeboard, the counters ----
await go(ZARYA.noticeboard.x, ZARYA.noticeboard.z - 1.8, ZARYA.noticeboard.x, ZARYA.noticeboard.z + 1, 0.3);
await use();
s = await state();
check('the noticeboard is read', has(s, F.notice));
await kill();
await cash(3000);
await go(ZARYA.sports.x - 3, ZARYA.sports.z + 1.4, ZARYA.sports.x - 3, ZARYA.sports.z - 2, 0.3);
await shot('11-sports-counter');
await use();
s = await state();
check('the sports counter sells for points', s.cash < 3000 && ['bat', 'gloves', 'hockey'].includes(s.melee?.carried), `cash ${s.cash}, ${s.melee?.carried}`);
await go(80, -22.4, 80, -25, 0.3);
await use();
s = await state();
check('a skillet is taken from housewares', s.melee?.carried === 'skillet', s.melee?.carried);

// ---- the Signalka ----
await go(PARTS[PART.cartridges].x + 1.2, PARTS[PART.cartridges].z - 0.2, 20, -10, 0.4);
s = await state();
check('flare cartridges from the fireworks kiosk', bit(s.parts, PART.cartridges), `parts ${s.parts}`);
await kill();
await go(ZARYA.bench.x, ZARYA.bench.z + 1.8, ZARYA.bench.x, ZARYA.bench.z - 1, 0.3);
await shot('12-workbench');
await use(2);
s = await state();
check('the workbench builds the Signalka', bit(s.built, RECIPE.signalka), `built ${s.built}`);
check('and it lies on the bench for anyone to take', /^TAKE THE SIGNALKA$/.test(s.prompt ?? ''), say(s));
await use();
s = await state();
check('taken: a flare pistol beside the service pistol', s.slots.includes('signalka') && s.slots.includes('pistol'), JSON.stringify(s.slots));
await kill();
await go(-8, 24, -8, 0, 0.3);
await use(1.2);
await advance(4);
s = await state();
check('fired out on the square', has(s, F.flare));
await shot('13-flare');

// ---- Line One ----
await kill();
await go(ZARYA.cab.x, ZARYA.cab.z + 1.8, ZARYA.cab.x, ZARYA.cab.z - 2, 0.3);
await use();
s = await state();
check("Zina's cab is looked into", has(s, F.line));
await go(ZARYA.fuseBox.x, ZARYA.fuseBox.z + 1.6, ZARYA.fuseBox.x, ZARYA.fuseBox.z - 1, 0.3);
await use();
s = await state();
check("the stop's fuse box is empty", has(s, F.fuseBox));
await kill();
await go(PARTS[PART.handle].x, PARTS[PART.handle].z + 0.8, PARTS[PART.handle].x, PARTS[PART.handle].z - 1, 0.4);
s = await state();
check('her handle is on her table in the tea room', bit(s.parts, PART.handle), `parts ${s.parts}`);
await kill();
await go(PARTS[PART.fuse].x + 1.1, PARTS[PART.fuse].z, ZARYA.junction.x, ZARYA.junction.z, 0.3);
await use(1.8);
s = await state();
// the tree's own lights are the one warm-white material in the level that has gone out
const treeDark = await D(() => {
  let dark = false;
  window.__dead.game.level.root.traverse((o) => { const m = o.material; if (m && m.emissive && m.emissive.getHex() === 0xffd9a0 && m.emissiveIntensity < 0.5) dark = true; });
  return dark;
});
check("the fuse comes out of the tree's box", bit(s.parts, PART.fuse), `parts ${s.parts}`);
check('and the town tree goes dark', treeDark === true, String(treeDark));
await shot('14-tree-dark');
await go(ZARYA.cab.x, ZARYA.cab.z + 1.8, ZARYA.cab.x, ZARYA.cab.z - 2, 0.3);
await use(1.4);
await go(ZARYA.fuseBox.x, ZARYA.fuseBox.z + 1.6, ZARYA.fuseBox.x, ZARYA.fuseBox.z - 1, 0.3);
await use(1.4);
s = await state();
check('handle and fuse fitted: Line One is live', has(s, F.handleFit) && has(s, F.fuseFit) && bit(s.built, RECIPE.line), `f ${s.f}, built ${s.built}`);

// ---- the sack and the bear ----
await kill();
await cash(3000);
await go(ZARYA.sack.x, ZARYA.sack.z + 2.2, ZARYA.sack.x, ZARYA.sack.z, 0.4);
await shot('15-sack');
await use(2);
await advance(1.5);
s = await state();
check("a hand in Ded Moroz's sack brings the bear", has(s, F.bear), say(s));
const pad = await D(() => {
  const g = window.__dead.game;
  const b = g.zombies.zombies.find((z) => z.alive && z.isBoss);
  if (!b) return null;
  const hp0 = b.hp;
  g.zombies.damage(b, 100, false, g.zenv, b.yaw + Math.PI); // a blow to his chest: it travels against the way he faces
  const front = hp0 - b.hp;
  const hp1 = b.hp;
  g.zombies.damage(b, 100, false, g.zenv, b.yaw); // a blow to his back
  return { front, back: hp1 - b.hp, tag: b.tag, armor: b.frontArmor };
});
check('his front is padding, his back is not', !!pad && pad.front > 0 && pad.back > pad.front * 4, JSON.stringify(pad));
await go(ZARYA.hook.x, ZARYA.hook.z - 2.4, ZARYA.hook.x, ZARYA.hook.z + 2, 0.4);
await use(1.2);
s = await state();
check('a prize hung on the slide turns him', has(s, F.prize));
await shot('16-prize');
await kill();
await advance(0.6);
s = await state();
check('the bear down: the Sun key', has(s, F.bearDown) && !has(s, F.prize), `f ${s.f}`);

// ---- next stop ----
await go(ZARYA.tramDoor.x, ZARYA.tramDoor.z + 1.6, ZARYA.tramDoor.x, ZARYA.tramDoor.z - 2, 0.3);
s = await state();
check('the tram offers its doors', /BOARD/.test(s.prompt ?? ''), say(s));
await shot('17-board');
await use(2);
await advance(2.4);
s = await state();
check('aboard: Act II, and the tram has put the squad down at the Rynok', s.ch === CH.act2 && by(s, stopOf('rynok').door) && s.zone === 'rynok' && s.close === s.squad, `ch ${s.ch}, at ${s.x.toFixed(0)},${s.z.toFixed(0)} in ${s.zone}, squad ${s.close}/${s.squad}`);
await shot('18-rynok-stop');
for (let i = 0; i < 20; i++) {
  await D(() => window.__dead.setHealth(100, 100));
  await advance(1);
}
s = await state();
check('boarding ends nothing: the run goes on', !s.ended, `ended ${JSON.stringify(s.ended)}`);

// =====================================================================================================================
// ACT II
// =====================================================================================================================

// ---- Line One: on from the car's door, back from six metres west of it ----
await sweep();
await at(stopOf('rynok').door);
s = await state();
check('at the Rynok stop the tram offers the next stop it calls at', /^RIDE ON TO STROITELEY STREET$/.test(s.prompt ?? ''), say(s));
await go(stopOf('rynok').door.x - 6, stopOf('rynok').door.z, stopOf('rynok').door.x, stopOf('rynok').door.z + 4, 0.3);
s = await state();
check('and, a few steps west, the way back', /^RIDE BACK TO ZARYA SQUARE$/.test(s.prompt ?? ''), say(s));
await at(stopOf('depot').door);
s = await state();
check('it does not call at the depot while the gate is chained', !/RIDE/.test(s.prompt ?? ''), say(s));

// ---- the Rynok: Borya, his cold store, his keys ----
let b = await named('BORYA', 500);
check('Borya stands at his meat rows, and nothing hurts him', !!b && b.hurt === 0 && by(b, RYNOK.borya, 3), JSON.stringify(b));
await go(RYNOK.borya.x - 14, RYNOK.borya.z, RYNOK.borya.x, RYNOK.borya.z, 0.6);
s = await state();
check('he sees the squad', did(s, G.borya), `g ${s.g}`);
await shot('19-borya');
await at(RYNOK.bar);
s = await state();
check('the door cannot be barred on an empty store', !s.can && /COLD STORE/.test(s.prompt ?? '') && !did(s, G.barred), say(s));
// he is led in: the squad goes in ahead of him (here he is simply put there, a few steps deeper than he has to be: he
// is on his way back to the door before the next frame is out), and out by the hatch
const lead = () => D(([door, deep, room]) => {
  const q = window.__dead.game.zombies.zombies.find((k) => k.alive && k.tag === 'BORYA');
  if (!q) return;
  const d = Math.hypot(deep.x - door.x, deep.z - door.z) || 1;
  q.x = Math.max(room.x0 + 1, Math.min(room.x1 - 1, deep.x + ((deep.x - door.x) / d) * 2.5));
  q.z = Math.max(room.z0 + 1, Math.min(room.z1 - 1, deep.z + ((deep.z - door.z) / d) * 2.5));
}, [RYNOK.coldDoor, RYNOK.coldInside, RYNOK.coldStore]);
await at(RYNOK.hatchIn);
await lead();
await advance(0.1);
await D(() => window.__dead.setHealth(100, 100));
s = await state();
check('inside the cold store, the hatch offers the way out', /^CLIMB OUT THE HATCH$/.test(s.prompt ?? '') && did(s, G.boryaIn), `${say(s)}; g ${s.g}`);
await use(1);
s = await state();
check('out by the hatch, and he does not fit through it', by(s, RYNOK.hatch, 1.5), `${s.x.toFixed(1)},${s.z.toFixed(1)}`);
// (put back, in case a blow or a step carried him out while the squad was in there with him)
await lead();
await advance(0.5);
await at(RYNOK.bar);
s = await state();
const barOffered = /^BAR THE DOOR$/.test(s.prompt ?? '');
await use(1.4);
s = await state();
check('the door is barred on him', barOffered && did(s, G.barred) && s.coldDoor === true, `${say(s)}; g ${s.g}; door ${s.coldDoor}`);
await at(RYNOK.keyHook);
await use();
s = await state();
check('his keys come off the hook: the Cosmonaut, two of four', did(s, G.cosmoKey), `g ${s.g}`);
await shot('20-cold-store');
b = await named('BORYA');
check('Borya is still on his feet in there', !!b && by(b, RYNOK.coldInside, 8), JSON.stringify(b));

// ---- the Rynok's own: three parts, the ledger, an ornament, two sleepers, the police post's rifle ----
await sweep();
await part('pipes');
await part('canister');
await part('samovar');
await notice('ledger', /^READ THE BUTCHER'S LEDGER$/);
await at(RYNOK.ornament, 1);
s = await state();
check('a glass ornament, picked up in passing', count(s.orn) >= 1, `orn ${s.orn}`);
check('a sleeper in the Rynok is covered', await cover(2));
check('and another', await cover(3));
await cash(5000);
const post = { x: RYNOK.police.x + Math.cos(RYNOK.policeYaw) * 1.6, z: RYNOK.police.z - Math.sin(RYNOK.policeYaw) * 1.6 };
await go(post.x, post.z, RYNOK.police.x - Math.sin(RYNOK.policeYaw) * 3, RYNOK.police.z - Math.cos(RYNOK.policeYaw) * 3, 0.3);
s = await state();
const rifleOffered = /^BUY KR-16 RIFLE$/.test(s.prompt ?? '');
await use();
s = await state();
check("the police post's rifle, for points", rifleOffered && s.slots.includes('rifle') && paid(5000, s.cash, 1000), `${say(s)}; ${JSON.stringify(s.slots)}; $${s.cash}`);
await at(gateOf('depot'), 2);
s = await state();
check('the depot gate is chained, and says what would cut it', s.shut.depot === true && !s.can && /CHAINED/.test(s.prompt ?? '') && /cutters/i.test(s.sub), say(s));

// ---- the store again: the shears, the girl by the escalator, the padlock (the store's ornament is upstairs) ----
await sweep();
await part('shears');
await go(ZARYA.girl.x - 1, ZARYA.girl.z + 0.9, ZARYA.girl.x, ZARYA.girl.z, 0.3);
s = await state();
const girlOffered = /^COVER HER$/.test(s.prompt ?? '');
await use(1.2);
s = await state();
check('the girl Gena had by the hood is covered', girlOffered && bit(s.covered, 0), say(s));
await go(AT.escalator.x, AT.escalator.z + 0.4, AT.escalator.x, AT.escalator.z - 3, 0.3);
s = await state();
check('the escalator is padlocked, and a skillet will not do', s.escalator === true && !s.can && /PADLOCKED/.test(s.prompt ?? '') && /heavy/i.test(s.sub), `${say(s)}; ${s.melee?.carried}`);

// ---- the Dvor: by tram to Stroiteley Street ----
await ride('rynok', 'dvor');
await shot('21-dvor-stop');
await sweep();
await part('tape');
await part('cord');
await part('shaft');
await at(TOOLS[0], 1);
await at(DVOR.ornament, 1);
s = await state();
check("one of the repairman's tools, and another ornament, in passing", bit(s.m, 6) && bit(s.orn, ORNAMENTS.findIndex((o) => o.x === DVOR.ornament.x && o.z === DVOR.ornament.z)), `m ${s.m}, orn ${s.orn}`);
await at(DVOR.babushka);
s = await state();
const babOffered = /^COVER HER$/.test(s.prompt ?? '');
await use(1.2);
s = await state();
check("Vera's grandmother, at her window", babOffered && bit(s.covered, 1), say(s));
await notice('tv', /^LOOK AT THE TELEVISION$/);
check('a sleeper in the Dvor is covered', await cover(4));
await at(DVOR.woodpile);
s = await state();
const maulOffered = /^TAKE SPLITTING MAUL$/.test(s.prompt ?? '');
await use();
s = await state();
check('the splitting maul from the woodpile: something heavy', maulOffered && s.melee?.carried === 'maul', `${say(s)}; ${s.melee?.carried}`);
await at(DVOR.bench);
s = await state();
const cutOffered = /^BUILD THE BOLT CUTTERS$/.test(s.prompt ?? '');
await use(2);
s = await state();
check("the Dvor's bench builds the bolt cutters", cutOffered && bit(s.built, RECIPE.cutters), `${say(s)}; built ${s.built}`);
await shot('22-dvor-bench');

// ---- the three chains ----
await sweep();
for (const [id, i, back, axis, name] of [['garagesW', CHAIN.garagesW, -2, 'x', "the garages' west gate"], ['garagesN', CHAIN.garagesN, -2, 'z', "the garages' north gate"], ['depot', CHAIN.depot, 2, 'z', 'the depot gate']]) {
  await at(gateOf(id), back, axis);
  s = await state();
  const offered = /^CUT THE CHAIN$/.test(s.prompt ?? '') && s.shut[id] === true;
  await use(2);
  s = await state();
  check(`the chain is cut: ${name}`, offered && bit(s.gates, i) && s.shut[id] === false, `${say(s)}; gates ${s.gates}; shut ${s.shut[id]}`);
}
await at(stopOf('rynok').door);
s = await state();
check('Line One calls at the depot now', /^RIDE ON TO TRAM DEPOT$/.test(s.prompt ?? ''), say(s));

// ---- the garages ----
await at({ x: GARAGES.bench.x, z: GARAGES.bench.z }, 1);
await advance(0.5);
await sweep();
await part('nailer');
await part('tubes');
await part('guard');
await at(TOOLS[1], 1);
await at(GARAGES.ornament, 1);
await notice('crates', /^LOOK AT THE CRATES$/);

// ---- the depot ----
await ride('rynok', 'depot');
await shot('23-depot-stop');
await sweep();
await part('strips');
await part('blade');
await at(TOOLS[2], 1);
await at(DEPOT.ornament, 1);
s = await state();
check("all three of the repairman's tools", ((s.m >> 6) & 7) === 7, `m ${s.m}`);
await notice('sheet', /^READ ZINA'S ROUTE SHEET$/);
await at(DEPOT.fireBoard, 1);
s = await state();
const boardOffered = /^BREAK THE LOCK$/.test(s.prompt ?? '');
await use(1.4);
s = await state();
check("a heavy blow breaks the fire board's lock", boardOffered && did(s, G.fireBoard), `${say(s)}; g ${s.g}`);
check('and the axe is there to be taken', /^TAKE THE FIRE AXE$/.test(s.prompt ?? ''), say(s));
await use();
s = await state();
check('the fire axe in hand', s.melee?.carried === 'fireAxe', s.melee?.carried);
await cash(5000);
await go(DEPOT.shop.x - 1.1, DEPOT.shop.z, DEPOT.shop.x - 1.1, DEPOT.shop.z - 2, 0.3);
s = await state();
const shotgunOffered = /^BUY PS-12 SHOTGUN$/.test(s.prompt ?? '');
await go(DEPOT.shop.x + 1.1, DEPOT.shop.z, DEPOT.shop.x + 1.1, DEPOT.shop.z - 2, 0.3);
s = await state();
const bowOffered = /^BUY ARBALET CROSSBOW$/.test(s.prompt ?? '');
await use();
s = await state();
check("the Okhotnik's shelf: a shotgun, and the crossbow bought", shotgunOffered && bowOffered && s.slots.includes('arbalet') && paid(5000, s.cash, 1500), `${say(s)}; ${JSON.stringify(s.slots)}; $${s.cash}`);
await at(gateOf('pond'), 2, 'x');
s = await state();
check('the pond road gate is frozen shut', s.shut.pond === true && !s.can && /FROZEN/.test(s.prompt ?? ''), say(s));

// ---- the square: the Salyut's crate, an ornament (the tree waits for the one on the store's second floor) ----
await ride('depot', 'rynok', true);
await ride('rynok', 'square', true);
await sweep();
await part('crate');
await at(ORNAMENTS[1], 1);

// ---- Timur's bench: the strong ones ----
await at(DVOR.bench);
s = await state();
check('a lesser bench will not build the strong ones', !s.can && /WORKBENCH/.test(s.prompt ?? '') && /proper bench/.test(s.sub), say(s));
await at(GARAGES.bench);
const built = [];
for (let i = 0; i < 3; i++) {
  s = await state();
  if (/^BUILD THE /.test(s.prompt ?? '')) built.push(s.prompt);
  await use(2);
}
s = await state();
check("Timur's bench builds the nail gun, the Salyut and the bear spear", bit(s.built, RECIPE.gvozdomyot) && bit(s.built, RECIPE.salyut) && bit(s.built, RECIPE.rogatina), `${built.join(', ')}; built ${s.built}`);
const took = [];
for (let i = 0; i < 3; i++) {
  s = await state();
  if (/^TAKE THE /.test(s.prompt ?? '') && s.can) took.push(s.prompt);
  await use();
}
s = await state();
// (the arsenal: every gun taken is kept, so both guns are carried; the spear joins the knife)
check('and each lies on the bench to be taken', took.length === 3 && s.slots.includes('gvozdomyot') && s.slots.includes('salyut') && s.melee?.carried === 'rogatina' && s.melee.pack.includes('knife'), `${took.join(', ')}; ${JSON.stringify(s.slots)}; ${JSON.stringify(s.melee)}`);
await shot('25-timur-bench');

// ---- the escalator, the second floor, the canteen, the Tamada ----
await at(DVOR.woodpile);
await use();
await go(AT.escalator.x, AT.escalator.z + 0.4, AT.escalator.x, AT.escalator.z - 3, 0.3);
s = await state();
const padOffered = /^BREAK THE PADLOCK$/.test(s.prompt ?? '');
await use(1.4);
s = await state();
check('a heavy blow breaks the padlock on the escalator', padOffered && did(s, G.escalator) && s.escalator === false, `${say(s)}; g ${s.g}; closed ${s.escalator}`);
await advance(0.4);
s = await state();
check('and the escalator offers the way up to the second floor', /SECOND FLOOR/.test(s.prompt ?? '') && /^Up the escalator$/.test(s.sub), say(s));
await use(0.6);
await advance(0.6);
s = await state();
check('up the escalator: on the second floor, only it drawn, at the head of the escalator', s.zone === 'upstairs' && s.drawn === 1 && by(s, UPSTAIRS.foot, 2.5), `${s.zone} ${s.drawn}; ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`);
await shot('26a-second-floor');
await sweep();
await at(ORNAMENTS[0], 1);
s = await state();
check("the store's glass ornament, by the toy railway", bit(s.orn, 0), `orn ${s.orn}`);
await notice('den', /^LOOK INTO THE DEN$/);
await shot('26b-den');
await go(UPSTAIRS.up.x - 1.2, UPSTAIRS.up.z, UPSTAIRS.up.x + 3, UPSTAIRS.up.z, 0.4);
s = await state();
check('the next escalator offers the way on up to the canteen', /CANTEEN/.test(s.prompt ?? '') && /^Up the escalator$/.test(s.sub), say(s));
await use(0.6);
await advance(0.6);
s = await state();
check('up it: in the canteen', s.zone === 'canteen' && by(s, CANTEEN.head, 3), `${s.zone}; ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`);
await sweep();
await go(CANTEEN.head.x + 3, CANTEEN.head.z, CANTEEN.tamada.x, CANTEEN.tamada.z, 0.8);
s = await state();
check('in the canteen only the canteen is drawn, and the Tamada has noticed', s.zone === 'canteen' && s.drawn === 1 && did(s, G.tamada), `${s.zone} ${s.drawn}; g ${s.g}`);
await shot('26-canteen');
b = await named('THE TAMADA', 500);
check('nothing hurts him while a loudspeaker plays', !!b && b.hurt === 0, JSON.stringify(b));
for (let i = 0; i < 3; i++) {
  await at(CANTEEN.plugs[i]);
  s = await state();
  const offered = /^PULL THE PLUG$/.test(s.prompt ?? '');
  await use(1.2);
  s = await state();
  check(`loudspeaker ${i + 1} of 3 is unplugged`, offered && bit(s.m, i), `${say(s)}; m ${s.m}`);
}
await advance(0.6);
b = await named('THE TAMADA', 50);
check('with all three out, a blow lands', !!b && b.hurt > 0, JSON.stringify(b));
await kill('THE TAMADA');
await advance(0.6);
s = await state();
check('the Tamada down: the Dove key', did(s, G.tamadaDown), `g ${s.g}`);
await sweep();
await at(CANTEEN.tamada);
s = await state();
const zenitOffered = /^TAKE THE ZENIT$/.test(s.prompt ?? '');
await use();
s = await state();
check('his camera is taken from the stage', zenitOffered && s.slots.includes('zenit'), `${say(s)}; ${JSON.stringify(s.slots)}`);
await shot('27-zenit');
await go(CANTEEN.head.x + 1.2, CANTEEN.head.z, CANTEEN.head.x - 3, CANTEEN.head.z, 0.4);
s = await state();
check('the way down from the canteen is to the second floor', /SECOND FLOOR/.test(s.prompt ?? '') && /^Down the escalator$/.test(s.sub), say(s));

// ---- the town tree, whole again ----
s = await state();
check('six glass ornaments', count(s.orn) === ORNAMENTS.length, `orn ${s.orn}`);
await at(AT.hang);
s = await state();
const hangOffered = /^HANG THE ORNAMENTS$/.test(s.prompt ?? '');
await use(2);
s = await state();
check('hung back on the town tree', hangOffered && did(s, G.hung), `${say(s)}; g ${s.g}`);
await shot('24-tree-whole');

// ---- the Palace: tickets, the museum, Baba Yaga ----
await at(gateOf('palace'), 2, 'x');
s = await state();
check('the Palace doors want tickets', s.shut.palace === true && !s.can && /PALACE/.test(s.prompt ?? ''), say(s));
await cash(100);
await at(AT.tickets);
s = await state();
check('three tickets cost more than a hundred', /TICKETS/.test(s.prompt ?? '') && !s.can, say(s));
await cash(2000);
await advance(0.2);
await use(1.2);
s = await state();
check('three tickets, from the buyer\'s own points: the doors open', did(s, G.tickets) && paid(2000, s.cash, STORY.tickets) && s.shut.palace === false, `g ${s.g}; $${s.cash}; shut ${s.shut.palace}`);
await at(DK.foyer, 0, 'z', 0.6);
s = await state();
check('inside the Palace', s.zone === 'dk', s.zone);
await shot('28-foyer');
await sweep();
await notice('photo', /^LOOK AT THE PHOTOGRAPH$/);
await at(DK.sickleCase, 1);
s = await state();
const caseOffered = /^BREAK THE GLASS$/.test(s.prompt ?? '');
await use(1.4);
s = await state();
check("a heavy blow breaks the museum's case", caseOffered && did(s, G.sickleCase), `${say(s)}; g ${s.g}`);
await use();
s = await state();
check('the serp and molot in hand', s.melee?.carried === 'serpMolot', s.melee?.carried);
await at(DK.cabinet, 1);
s = await state();
const sabreOffered = /^TAKE THE SHASHKA$/.test(s.prompt ?? '');
await use();
s = await state();
check("the guard's cabinet stands open: the shashka", sabreOffered && s.melee?.carried === 'shashka', `${say(s)}; ${s.melee?.carried}`);
await at(DK.hallCentre, 0, 'z', 0.6);
s = await state();
check('Baba Yaga has noticed the squad', did(s, G.yaga), `g ${s.g}`);
await shot('29-hut');
b = await named('BABA YAGA', 500);
check("nothing hurts her while the hut's back is to the hall", !!b && b.hurt === 0, JSON.stringify(b));
await at(DK.lever);
s = await state();
const leverOffered = /^PULL THE LEVER$/.test(s.prompt ?? '');
await use(1.2);
s = await state();
check('the lever turns the hut', leverOffered && did(s, G.exposed), `${say(s)}; g ${s.g}`);
await advance(0.4);
b = await named('BABA YAGA', 50);
check('and now a blow lands', !!b && b.hurt > 0, JSON.stringify(b));
await kill('BABA YAGA');
await advance(0.6);
s = await state();
check('Baba Yaga down: the Wheat key, four of four', did(s, G.yagaDown) && has(s, F.bearDown) && did(s, G.cosmoKey) && did(s, G.tamadaDown), `g ${s.g}`);

// =====================================================================================================================
// ACT III
// =====================================================================================================================

// ---- the matryoshkas: kills made beside each open its shells ----
for (let i = 0; i < DOLLS.length; i++) {
  await sweep();
  await go(DOLLS[i].x - 6, DOLLS[i].z, DOLLS[i].x, DOLLS[i].z, 0.4);
  for (let k = 0; k < STORY.dollShells + 2 && shells(await state(), i) < STORY.dollShells; k++) {
    await D(([x, z, n]) => { const d = window.__dead; for (let j = 0; j < n; j++) d.spawnZombie('shambler', x + 3 + j, z + 4, true, ''); }, [DOLLS[i].x, DOLLS[i].z, STORY.dollKills]);
    await advance(0.2);
    await sweep();
    await advance(0.3);
    await D(() => window.__dead.setHealth(100, 100));
  }
  s = await state();
  check(`matryoshka ${i + 1} of ${DOLLS.length} stands open to the last shell`, shells(s, i) === STORY.dollShells, `${shells(s, i)} shells`);
  if (i === 0) await shot('30-doll');
}
s = await state();
check('with all three open, the pond road gate gives', did(s, G.pond) && s.shut.pond === false && s.shut.plant === false, `g ${s.g}; ${JSON.stringify(s.shut)}`);

// ---- the banya ----
await ride('rynok', 'depot');
await ride('depot', 'pond');
await shot('31-pond-stop');
await sweep();
await part('coil');
await notice('faces', /^LOOK AT THE BATHERS$/);
await at(BANYA.steam);
await D(() => window.__dead.setHealth(35, 0));
await advance(0.2);
s = await state();
const steamOffered = /^SIT IN THE STEAM$/.test(s.prompt ?? '');
await use(2.4);
s = await state();
check('the steam room warms whoever sits in it', steamOffered && s.hp >= 90, `${say(s)}; hp ${s.hp}`);

// ---- the heating plant: the valves, the new pipe, the keypad ----
await ride('pond', 'plant');
await sweep();
await part('valve');
await notice('pipe', /^LOOK AT THE NEW PIPE$/);
for (let i = 0; i < 3; i++) {
  await at(TETS.valves[i], 1);
  s = await state();
  const offered = /^TURN THE VALVE WHEEL$/.test(s.prompt ?? '');
  await use(2);
  s = await state();
  check(`valve wheel ${i + 1} of 3 is turned`, offered && bit(s.m, 3 + i), `${say(s)}; m ${s.m}`);
}
await at(TETS.keypad, 1);
await advance(0.4);
s = await state();
check('the keypad wants four digits, and nobody knows them', s.shut.checkpoint === true && !s.can && /KEYPAD/.test(s.prompt ?? '') && /digits/i.test(s.sub), say(s));
await shot('32-keypad');
await notice('plaque', /^READ THE BRASS PLAQUE$/);
await at(TETS.keypad, 1);
s = await state();
const codeOffered = /^ENTER 1962$/.test(s.prompt ?? '');
await use(1.4);
s = await state();
check("the year on the museum's plaque opens the checkpoint", codeOffered && did(s, G.code) && s.shut.checkpoint === false, `${say(s)}; g ${s.g}`);

// ---- the Institute ----
await at(INSTITUTE.lobby, 0, 'z', 0.6);
s = await state();
check('inside the Institute', s.zone === 'institute', s.zone);
await shot('33-institute');
await sweep();
await part('vesna');
await notice('clock', /^LOOK AT THE MASTER CLOCK$/);
await notice('office', /^READ THE NOTES ON THE DESK$/);
await at(INSTITUTE.bench, 1);
s = await state();
const thawOffered = /^BUILD THE OTTEPEL$/.test(s.prompt ?? '');
await use(2);
s = await state();
check("the Institute's lab bench builds the Ottepel", thawOffered && bit(s.built, RECIPE.ottepel), `${say(s)}; built ${s.built}`);
for (let i = 0; i < 6 && !(await state()).slots.includes('ottepel'); i++) await use();
s = await state();
check('and it is taken from the bench', s.slots.includes('ottepel'), JSON.stringify(s.slots));
// ---- the arsenal: nothing taken on the way was ever put down, and Q / the wheel / 1-9 / the phone list reach all of it ----
{
  const kept = ['pistol', 'signalka', 'rifle', 'arbalet', 'gvozdomyot', 'salyut', 'zenit', 'ottepel'];
  check('the arsenal keeps every gun taken on the way', kept.every((id) => s.slots.includes(id)) && ['knife', 'rogatina'].every((id) => s.melee?.pack.includes(id)), `${JSON.stringify(s.slots)}; ${JSON.stringify(s.melee?.pack)}`);
  const ars = () => D(() => window.__dead.arsenal());
  const step = async (k, n) => {
    await D(([k, n]) => (n === undefined ? window.__dead.press(k) : window.__dead.press(k, n)), [k, n]);
    await advance(0.9);
    return ars();
  };
  let a = await step('slot1', 1);
  const n = a.entries.length;
  const first = a.at;
  a = await step('q');
  const q1 = a.at;
  a = await step('wheelBack');
  const back = a.at;
  await D((i) => window.__dead.pickWeapon(i), n - 1);
  await advance(0.9);
  a = await ars();
  const last = a.at;
  const swung = a.entries[n - 1]?.kind === 'melee' && (await state()).melee?.out === true;
  a = await step('slot1', 1);
  check('the arsenal cycles: 1 picks the first, Q the next, the wheel back, the phone list the last (a weapon to swing)', first === 0 && q1 === 1 && back === 0 && last === n - 1 && swung && a.at === 0 && (await state()).melee?.out === false, JSON.stringify({ n, first, q1, back, last, swung, now: a.at }));
}
// the ones the squad stopped for (the third ending wants nine; the others are played with fewer)
if (END === 3) for (const i of [5, 6, 7, 8, 9, 10, 11]) check(`sleeper ${i} is covered`, await cover(i));
await sweep();
await go(INSTITUTE.lift.x + Math.sin(INSTITUTE.liftYaw) * 1.2, INSTITUTE.lift.z + Math.cos(INSTITUTE.liftYaw) * 1.2, INSTITUTE.lift.x, INSTITUTE.lift.z, 0.4);
s = await state();
const liftOffered = /BERLOGA/.test(s.prompt ?? '') && /lift/i.test(s.sub);
await use(0.8);
await advance(0.6);
s = await state();
check('the freight lift goes down to the Berloga', liftOffered && s.zone === 'berloga' && s.drawn === 1, `${say(s)}; ${s.zone} ${s.drawn}`);

// ---- the door with four key slots ----
await at(BERLOGA.slots);
s = await state();
const slotsOffered = /^FIT THE FOUR KEYS$/.test(s.prompt ?? '') && s.keyDoor === true;
await shot('34-key-door');
await use(2);
s = await state();
check('four keys open the door: the finale', slotsOffered && did(s, G.keyDoor) && s.ch === CH.finale && s.keyDoor === false, `${say(s)}; g ${s.g}; ch ${s.ch}`);
await notice('dens', /^LOOK INTO THE GLASS DENS$/);
await notice('danya', /^LOOK AT BED FORTY-ONE$/);
s = await state();
check('Danya is covered', await cover(COVERS.length - 1));
s = await state();
check(`sleepers covered: ${END === 3 ? 'enough' : 'too few'} for him to believe it`, END === 3 ? count(s.covered) >= STORY.warm : count(s.covered) < STORY.warm, `${count(s.covered)} of ${STORY.warm}`);

// ---- Morozko ----
await go(BERLOGA.askLine + 2, 0, BERLOGA.morozko.x, BERLOGA.morozko.z, 0.6);
s = await state();
check('crossing the hall, he asks', did(s, G.asked), `g ${s.g}`);
await go(BERLOGA.morozko.x - 5, BERLOGA.morozko.z, BERLOGA.morozko.x, BERLOGA.morozko.z, 0.3);
await shot('35-morozko');
s = await state();
const answerOffered = /^ANSWER: WARM, DEDUSHKA$/.test(s.prompt ?? '');
await use(1);
s = await state();
check('the squad answers: warm', answerOffered && did(s, G.answered), `${say(s)}; g ${s.g}`);
if (END === 3) {
  check('he believes it', did(s, G.believed), `g ${s.g}`);
  b = await named('MOROZKO', 500);
  check('and nobody raises a hand to him', !!b && b.hurt === 0, JSON.stringify(b));
} else {
  check('he does not believe it', !did(s, G.believed), `g ${s.g}`);
  await advance(0.5);
  b = await named('MOROZKO', 50);
  check('he fights, and a blow lands', !!b && b.hurt > 0, JSON.stringify(b));
  await kill('MOROZKO');
  await advance(0.6);
  s = await state();
  check('Morozko down', did(s, G.morozkoDown), `g ${s.g}`);
}

// ---- the purge console ----
await sweep();
await hush();
const order = END === 2 ? [1, 0, 2, 3] : [0, 1, 2, 3];
const verb = END === 3 ? 'GIVE HIM' : 'TURN';
for (const i of order) {
  await at(BERLOGA.keys[i]);
  s = await state();
  const offered = new RegExp(`^${verb} THE ${KEYS[i]} KEY$`).test(s.prompt ?? '');
  if (i === order[0]) await shot('36-console');
  await use(1.2);
  s = await state();
  check(`the ${KEYS[i].toLowerCase()} key`, offered && String(s.turned).includes(String(i + 1)), `${say(s)}; turned ${s.turned}`);
}
s = await state();
check(`ending ${END}`, s.end === END && s.ch === CH.ended, `end ${s.end}, ch ${s.ch}`);
const clockHidden = () => D(() => { const c = document.querySelector('.ds-clock'); return c ? (c.hidden || getComputedStyle(c).display === 'none') : true; });
check('no clock was drawn on the way', await clockHidden());
await advance(2);
await shot('37-ending');
const banner = await D(() => document.body.innerText);
check('the ending is named', new RegExp(['', 'HAPPY NEW YEAR', 'UNTIL SPRING', 'WARM'][END]).test(banner), banner.replace(/\s+/g, ' ').slice(0, 160));
for (let i = 0; i < 60 && !(await state()).ended; i++) {
  await D(() => window.__dead.setHealth(100, 100));
  await advance(1);
}
s = await state();
check('the last lines are said, and the run is won', s.ended?.outcome === 'victory', JSON.stringify(s.ended));
check('nor is one drawn once it is over', await clockHidden());
await shot('38-end');

const errors = logs.filter((l) => l.type === 'pageerror' || (l.type === 'error' && !/favicon|404|502|Bad Gateway/.test(l.text)));
check('no page errors', errors.length === 0, errors.slice(0, 3).map((e) => e.text.slice(0, 360)).join(' | '));
console.log(`\n${fail.length === 0 ? 'ALL PASSED' : `${fail.length} FAILED: ${fail.join('; ')}`}`);
await browser.close();
process.exit(fail.length ? 1 : 0);
