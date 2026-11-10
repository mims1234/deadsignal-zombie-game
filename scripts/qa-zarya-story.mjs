// ZARYA: what the story moves on screen (`src/zarya/look.ts`, `crowd.ts`), judged by eye. Stands the player
// somewhere, puts the story in a given state, optionally stands one of the named ones up in their costume, and
// writes a screenshot with the draw calls it cost and how many of them are the look's own.
//
//   VIEWS="name,x,z,tx,tz[,state];..." node scripts/qa-zarya-story.mjs [url] [w] [h]
//       stand at (x, z) looking at (tx, tz); `state` names an entry of STATES (else STATE, else the town asleep)
//   STATE='{"ch":4,"g":16}'                          the story's fields for every view (ch f g m clues covered orn
//                                                    dolls turned end, and parts built gates)
//   STATES='{"open":{"ch":4,"gates":7},"shut":{}}'   named states for single views
//   BOSS="borya,214,-10,3.14"                        a boss body at (x, z) facing yaw, dressed as who
//                                                    (mishka borya yaga tamada morozko); several with ';'
//   WATCH=1                                          make the watcher appear now
//   EYE=12  HUD=1  QA_TOUCH=1  SC=folder  PRE=look-  as qa-zarya-look.mjs; PRE is the file prefix (default look-)
//   WAIT=3                                           seconds of game time before the picture (default 2.6)
//
// Writes shots/zarya/town-<PRE><name>.png.
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const out = process.env.SC ?? 'shots/zarya';
const pre = process.env.PRE ?? 'look-';
mkdirSync(out, { recursive: true });

const VIEWS = [];
for (const v of (process.env.VIEWS ?? '').split(';')) {
  const [name, x, z, tx, tz, state] = v.split(',').map((s) => s.trim());
  if (name && tz !== undefined) VIEWS.push({ name, x: Number(x), z: Number(z), tx: Number(tx), tz: Number(tz), state });
}
if (VIEWS.length === 0) {
  console.log('no VIEWS given');
  process.exit(1);
}
const ASLEEP = { ch: 3, f: 1 | 2 | 4 | 32 };
const STATE = { ...ASLEEP, ...(process.env.STATE ? JSON.parse(process.env.STATE) : {}) };
const STATES = process.env.STATES ? JSON.parse(process.env.STATES) : {};
const BOSS = (process.env.BOSS ?? '').split(';').filter(Boolean).map((b) => b.split(',').map((s) => s.trim()));
const eye = Number(process.env.EYE || 0);
const wait = Number(process.env.WAIT || 2.6);

const { browser, page, logs } = await openPage({ url: `${base}?nolock${touch ? '&touch=1' : ''}`, w, h });
const D = (fn, ...args) => page.evaluate(fn, ...args);
// other sessions are editing this checkout: any save reloads the page under us, so a view that loses its page is
// simply taken again from a fresh start
async function boot() {
  await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
  await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
  await page.reload();
  await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
  await D(() => window.__dead.start());
  await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
  await D(() => {
    const g = window.__dead.game;
    g.zombies.spawnAllowed = () => false;
    window.__dead.clearZombies();
    // the picture is of the state it was given: the infected's director reports nothing and brings nobody
    const dir = g.zarya.director;
    dir.step = () => [];
    dir.onEvent = () => {};
  });
  if (!process.env.HUD) await page.addStyleTag({ content: '.ds-hud, .ds-touch-layer, .ds-prompt, .ds-banner, .ds-caption { opacity: 0 !important; }' });
}
await boot();

for (const view of VIEWS) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await shoot(view);
      break;
    } catch (e) {
      if (attempt === 3 || !/context was destroyed|navigation|Target closed|__dead/i.test(String(e))) throw e;
      console.log(`  (${view.name}: the page reloaded, again)`);
      await new Promise((r) => setTimeout(r, 1500));
      await boot();
    }
  }
}

async function shoot(view) {

  const state = { ...STATE, ...(view.state ? STATES[view.state] ?? {} : {}) };
  await D(
    ([view, state, BOSS, watch]) => {
      const d = window.__dead;
      const g = d.game;
      const s = g.zarya.story;
      for (const k of ['ch', 'f', 'g', 'm', 'clues', 'covered', 'orn', 'dolls', 'turned', 'end']) s[k] = state[k] ?? 0;
      for (const k of ['parts', 'built', 'gates']) s.unlock.view[k] = state[k] ?? 0;
      d.clearZombies();
      for (const z of [...g.zombies.zombies]) if (z.isBoss) z.hp = 0;
      g.zombies.clearAll();
      d.setHealth(100, 100);
      d.teleport(view.x, view.z, Math.atan2(-(view.tx - view.x), -(view.tz - view.z)));
      const look = g.zarya.look;
      look.snap = true;
      for (const [who, x, z, yaw] of BOSS) {
        const b = g.zombies.spawn('warden', Number(x), Number(z), g.rng, { boss: true, yaw: Number(yaw ?? 0), state: 'idle' });
        b.sightScale = 0;
        b.isAmbient = false;
        look.dress(who, b);
      }
      if (watch) look.watchWait = 0;
    },
    [view, state, BOSS, !!process.env.WATCH],
  );
  await D((t) => window.__dead.advance(t), wait);
  if (process.env.WATCH) {
    // turn to face him, wherever he chose to stand
    await D((view) => {
      const d = window.__dead;
      const w = d.game.zarya.look.watcher;
      if (!w.visible) return;
      d.teleport(view.x, view.z, Math.atan2(-(w.position.x - view.x), -(w.position.z - view.z)));
      d.advance(0.3);
    }, view);
  }
  if (eye > 0) {
    await D(([eye, tx, tz]) => {
      const g = window.__dead.game;
      const cam = g.renderer.camera;
      cam.position.y += eye;
      cam.lookAt(tx, 0, tz);
      cam.updateMatrixWorld(true);
      g.renderer.renderer.render(g.renderer.scene, cam);
    }, [eye, view.tx, view.tz]);
  }
  await page.screenshot({ path: `${out}/town-${pre}${view.name}.png` });
  // the same frame without the look: what it adds (a costume rides its body, so those are counted by hand)
  const frame = () => D(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(window.__dead.game.renderer.renderer.info.render.calls)))));
  const calls = await frame();
  await D(() => (window.__dead.game.zarya.look.root.visible = false));
  const bare = await frame();
  const info = await D(() => {
    const g = window.__dead.game;
    g.zarya.look.root.visible = true;
    const w = g.zarya.look.watcher;
    return { tris: g.renderer.renderer.info.render.triangles, zone: g.zarya.zones.current, watcher: w.visible ? [Math.round(w.position.x), Math.round(w.position.z)] : null };
  });
  info.calls = calls;
  info.bare = bare;
  console.log(`${view.name.padEnd(14)} ${String(info.calls).padStart(4)} draws (${String(info.calls - info.bare).padStart(2)} the look's)  ${String(Math.round(info.tris / 1000)).padStart(5)}k tris  zone ${info.zone}${info.watcher ? `  watcher at ${info.watcher}` : ''}`);
}
const errors = logs.filter((l) => l.type === 'pageerror' || (l.type === 'error' && !/favicon|404|502|Bad Gateway/.test(l.text)));
for (const e of errors.slice(0, 8)) console.log('ERROR', e.text.slice(0, 600));
console.log(errors.length ? `${errors.length} page errors` : 'no page errors');
await browser.close();
