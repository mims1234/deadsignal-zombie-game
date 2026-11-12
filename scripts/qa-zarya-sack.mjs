// ZARYA: Ded Moroz's sack, all the way (round 3). In the running game: the sack is a red gift sack with a gold cord and
// no crate, lid or beacon anywhere; opened, its cord loosens, its mouth opens and the prize rises out and spins over it;
// it has its own marker on the map and the compass; nothing on screen says "box"; and after its openings it moves,
// model and marker and all. One screenshot per moment, a line per check.
//
//   node scripts/qa-zarya-sack.mjs [url] [w] [h]      default http://127.0.0.1:5183/ at 1280x720
//   QA_TOUCH=1 ...                                     as a phone
//
// Writes shots/zarya-sack/*.png (SC picks another folder).
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const out = process.env.SC ?? 'shots/zarya-sack';
mkdirSync(out, { recursive: true });

const { browser, page, logs } = await openPage({ url: `${base}?nolock${touch ? '&touch=1' : ''}`, w, h });
await page.addInitScript(() => {
  const Real = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (protocols === 'vite-hmr' || (Array.isArray(protocols) && protocols.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return new Real(url, protocols);
  };
});
const D = (fn, ...args) => page.evaluate(fn, ...args);
const advance = (s) => D((s) => window.__dead.advance(s), s);
const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 });
let fails = 0;
let n = 0;
const check = (ok, what, info = '') => {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${info ? `  (${info})` : ''}`);
};

await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await advance(0.5);
const { G } = await D(async () => ({ G: JSON.parse(JSON.stringify((await import('/src/zarya/story.ts')).G)) }));
// Act II, every zone open, the town asleep, nothing hunts; points to spend
await D((G) => {
  const d = window.__dead;
  const g = d.game;
  const s = g.zarya.story;
  s.ch = 4;
  s.f = (1 << 16) - 1;
  s.g = G.tickets | G.pond | G.code;
  s.unlock.view.gates = 7;
  g.zombies.spawnAllowed = () => false;
  d.clearZombies();
  g.session.inv.cash = 20000;
  const z = g.zarya;
  z.queue.length = 0;
}, G);
await advance(8); // (the banners the flags raise go by)
await D(() => { const z = window.__dead.game.zarya; z.queue.length = 0; });
// from here the page only draws: time moves when this script says so (`advance`), so every picture is of its moment
await D(() => window.__dead.freeze(true));

const sackInfo = () => D(() => {
  const g = window.__dead.game;
  const c = g.entities.crates.find((q) => q.sack);
  if (!c) return null;
  const names = [];
  c.model.root.traverse((o) => names.push(o.name));
  const reel = c.reel;
  return { x: c.def.x, z: c.def.z, phase: c.phase, spot: c.spot, cost: c.cost, names, rootName: c.model.root.name, reelY: reel?.visible ? reel.position.y : null, markY: c.mark.visible ? c.mark.position.y : null, markTex: !!c.mark.material.map };
});
/** Stand `back` metres from the sack, looking at it from a little above. */
const before = async (back = 2.2, side = 0.5, pitch = -0.3) => {
  const s = await sackInfo();
  await D(([x, z, back, side, pitch]) => {
    const d = window.__dead;
    const g = d.game;
    // the open side of wherever it stands: try a few directions for one with nothing in the way
    let best = 0;
    let bestD = -1;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const hit = g.level.world.raycast(x, 1.2, z, Math.sin(a), 0, Math.cos(a), back + 1, 'shots', { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, surface: 'concrete' });
      const dd = hit ? hit.t : back + 1;
      if (dd > bestD) { bestD = dd; best = a; }
    }
    const px = x + Math.sin(best) * back + Math.cos(best) * side;
    const pz = z + Math.cos(best) * back - Math.sin(best) * side;
    d.teleport(px, pz, Math.atan2(-(x - px), -(z - pz)));
    g.player.pitch = pitch;
  }, [s.x, s.z, back, side, pitch]);
  await advance(0.4);
};

// ---- closed ----
let s = await sackInfo();
check(!!s, 'ZARYA has a sack');
check(s.rootName === 'GiftSack' && !s.names.some((nm) => /lid|beacon|crate/i.test(nm)), 'it is a gift sack: no crate, no lid, no beacon', `${s.rootName}: ${[...new Set(s.names.filter(Boolean))].join(', ')}`);
const old = await D(() => { const z = window.__dead.game.zarya; return z.look.sack?.visible ?? null; });
check(old === false, 'the old sack drawn over a crate is gone (nothing doubled)', String(old));
await before();
const st0 = await D(() => { const g = window.__dead.game; const pr = g.io?.prompt; return { text: pr?.text ?? '', sub: pr?.sub ?? '' }; });
check(/^OPEN DED MOROZ'S SACK  \$\d+/.test(st0.text), "the prompt is the sack's", `${st0.text} / ${st0.sub}`);
s = await sackInfo();
check(s.markY !== null && s.markTex, 'a gold snowflake hangs over it (its "?")', `at ${s.markY?.toFixed(2)} m`);
await shot('closed');
await D(() => window.__dead.game.player.pitch = -0.05);
await advance(0.1);
await shot('closed-level');

// ---- the marker on the map and the compass ----
const marks = async () => D(async () => {
  const g = window.__dead.game;
  const hb = await import('/src/game/hudBridge.ts');
  const st = hb.buildHudState(g, g.mission, g.cards, g.io, null);
  const md = hb.buildMapDynamic(g, g.mission, g.cards, g.markers);
  g.zarya.decorateHud(st, md);
  return md.markers.filter((m) => m.kind === 'sack' || m.kind === 'crate').map((m) => ({ kind: m.kind, label: m.label, x: m.x, z: m.z, compass: !!m.compass, visible: m.visible }));
});
await D(() => { const d = window.__dead; const g = d.game; const c = g.entities.crates.find((q) => q.sack); d.teleport(c.def.x + 40, c.def.z + 5, Math.atan2(40, 5)); });
await advance(0.4);
let mk = await marks();
check(mk.length === 1 && mk[0].kind === 'sack' && mk[0].label === "DED MOROZ'S SACK", "its own marker, a sack, not a crate's", JSON.stringify(mk));
check(mk[0]?.compass === true, 'on the compass while a turn can be paid for', JSON.stringify(mk[0]));
await shot('compass');
await D(() => window.__dead.press('map'));
await advance(0.3);
await shot('map');
await D(() => window.__dead.press('map'));
await advance(0.3);

// ---- open: the cord loosens, the mouth opens, the prize rises out and spins over it ----
await before(2.0, 0.4, -0.2);
await D(() => window.__dead.hold({ interact: true }));
const openAt = await D(async () => {
  const d = window.__dead;
  const c = d.game.entities.crates.find((q) => q.sack);
  let t = 0;
  while (!c.opened && t < 3) { d.advance(1 / 30); t += 1 / 30; }
  return t;
});
await D(() => window.__dead.releaseAll());
check(openAt < 3, 'held, it opens', `${openAt.toFixed(2)} s`);
const ringAt = () => D(() => {
  const c = window.__dead.game.entities.crates.find((q) => q.sack);
  let ring = null;
  let inside = null;
  c.model.root.traverse((o) => {
    if (o.isMesh && o.geometry.type === 'TorusGeometry') ring = o;
    if (o.isMesh && o.geometry.type === 'CircleGeometry') inside = o;
  });
  return { ring: ring.scale.x, cordY: ring.parent.position.y, neck: inside.parent.scale.x, inside: inside.visible, reelY: c.reel?.visible ? c.reel.position.y : null };
});
const frames = [];
for (const [t, name] of [[0.12, 'open-1-cord'], [0.3, 'open-2-mouth'], [0.5, 'open-3-wide'], [0.9, 'open-4-rising'], [1.4, 'open-5-rising']]) {
  await advance(t - (frames.at(-1)?.t ?? 0));
  frames.push({ t, ...(await ringAt()) });
  await shot(name);
}
console.log('     frames:', frames.map((f) => `t${f.t}: cord x${f.ring.toFixed(2)} y${f.cordY.toFixed(2)}, mouth x${f.neck.toFixed(2)}, prize ${f.reelY?.toFixed(2) ?? '-'}`).join(' | '));
check(frames[0].ring > 1.15 && frames[0].neck < 1.25, 'first the cord loosens (the mouth barely open yet)', `cord x${frames[0].ring.toFixed(2)}, mouth x${frames[0].neck.toFixed(2)}`);
check(frames[2].neck > frames[1].neck && frames[4].neck > 1.8 && frames[4].inside, 'then the mouth opens wide, the inside showing', `mouth x${frames[4].neck.toFixed(2)}`);
check(frames[4].cordY < frames[0].cordY, 'the cord slips down onto its shoulders', `${frames[0].cordY.toFixed(2)} -> ${frames[4].cordY.toFixed(2)}`);
check(frames[0].reelY !== null && frames[0].reelY < 1.3 && frames[4].reelY > frames[0].reelY, 'the prize starts down in its mouth and rises out', `${frames[0].reelY?.toFixed(2)} -> ${frames[4].reelY?.toFixed(2)}`);
await advance(1.6);
s = await sackInfo();
check(s.phase === 'offer' && s.reelY > 1.6, 'the prize spins over the top of the sack', `${s.phase}, at ${s.reelY?.toFixed(2)} m`);
await shot('prize-over');
await D(() => window.__dead.game.player.pitch = 0.05);
await advance(0.05);
await shot('prize-over-level');
const offer = await D(() => { const pr = window.__dead.game.io?.prompt; return { text: pr?.text ?? '', sub: pr?.sub ?? '' }; });
check(/sack/i.test(offer.sub) && !/box/i.test(offer.sub), 'leaving the prize: it sinks back into the sack', offer.sub);
const words = await D(() => document.body.innerText);
check(!/MYSTERY BOX|THE BOX\b/i.test(words), 'nothing on screen says box', (words.match(/.{0,30}(MYSTERY BOX|THE BOX).{0,30}/i) ?? [''])[0]);

// ---- it moves: the model, its snowflake and its marker go together ----
const home = await sackInfo();
await D(() => {
  const d = window.__dead;
  const g = d.game;
  const c = g.entities.crates.find((q) => q.sack);
  c.taken();
  c.opens = 99; // due to move at its next rearm
  d.advance(3);
});
await advance(1.5);
const moved = await sackInfo();
check(moved.spot !== home.spot && Math.hypot(moved.x - home.x, moved.z - home.z) > 30, 'after its openings it turns up somewhere else', `place ${home.spot} -> ${moved.spot}, ${Math.hypot(moved.x - home.x, moved.z - home.z).toFixed(0)} m`);
const at = await D(() => { const c = window.__dead.game.entities.crates.find((q) => q.sack); return { mx: c.model.root.position.x, mz: c.model.root.position.z, kx: c.mark.position.x, kz: c.mark.position.z }; });
check(Math.abs(at.mx - moved.x) < 0.01 && Math.abs(at.kx - moved.x) < 0.01 && Math.abs(at.mz - moved.z) < 0.01, 'the sack itself and its snowflake went with it', JSON.stringify(at));
mk = await marks();
check(mk.length === 1 && Math.abs(mk[0].x - moved.x) < 0.01 && Math.abs(mk[0].z - moved.z) < 0.01, 'and so did its marker', JSON.stringify(mk));
await before();
await shot('moved');
const shut = await ringAt();
check(shut.neck < 1.05 && !shut.inside, 'shut again where it turned up, cord tied', `mouth x${shut.neck.toFixed(2)}`);
// ---- co-op: what a guest's screen does with the host's rows (the same path a real session takes, `applyBoxes`) ----
const coop = await D(async () => {
  const d = window.__dead;
  const g = d.game;
  const { BOX_PHASE } = await import('/src/logic/sharedLoot.ts');
  const e = g.entities;
  const c = e.crates.find((q) => q.sack);
  const i = e.crates.indexOf(c);
  const rows = (phase, owner, prize, t, place) => e.crates.map((_, k) => (k === i ? [phase, owner, prize, t, place] : [BOX_PHASE.closed, '', '', 0, 0]));
  // the host moved it to the Rynok: the guest's sack goes there, model and all
  e.applyBoxes(rows(BOX_PHASE.closed, '', '', 0, 1));
  const at = { x: c.def.x, z: c.def.z, mx: c.model.root.position.x, mz: c.model.root.position.z, spot: c.spot };
  d.teleport(c.def.x + 1.6, c.def.z + 0.6, Math.atan2(1.6, 0.6));
  g.player.pitch = -0.3;
  d.advance(0.5);
  // a teammate opens it: the guest sees it open and the prize rise, and may not take it
  e.applyBoxes(rows(BOX_PHASE.spin, 'someone-else', 'w:raketa', 0, 1));
  d.advance(1.2);
  let ring = null;
  let inside = null;
  c.model.root.traverse((o) => {
    if (o.isMesh && o.geometry.type === 'TorusGeometry') ring = o;
    if (o.isMesh && o.geometry.type === 'CircleGeometry') inside = o;
  });
  return { ...at, opened: c.opened, phase: c.phase, neck: inside.parent.scale.x, ring: ring.scale.x, reel: c.reel?.visible ? c.reel.position.y : null };
});
check(coop.spot === 1 && Math.abs(coop.mx - coop.x) < 0.01 && Math.abs(coop.mz - coop.z) < 0.01, "co-op: the host's move puts the guest's sack there", JSON.stringify({ spot: coop.spot, x: coop.x, z: coop.z }));
check(coop.opened && coop.phase === 'spin' && coop.neck > 1.5 && coop.reel !== null, "co-op: a teammate's opening opens it on this screen, the prize rising", `mouth x${coop.neck.toFixed(2)}, prize at ${coop.reel?.toFixed(2)}`);
await shot('coop-teammate-opened');
const draws = await D(() => window.__dead.game.renderer.renderer.info.render.calls);
console.log(`     ${draws} draws in front of the moved sack`);

const errs = logs.filter((l) => l.type === 'pageerror');
for (const e of errs) console.log('page error:', e.text.slice(0, 300));
console.log(`${n - fails}/${n} checks passed${errs.length ? `, ${errs.length} page errors` : ', no page errors'}`);
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
