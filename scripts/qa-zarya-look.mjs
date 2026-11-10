// ZARYA: a walk round the town with a camera, for judging the build by eye (one screenshot per viewpoint, and how
// many draw calls each costs).
//
//   node scripts/qa-zarya-look.mjs [url] [w] [h]      default http://127.0.0.1:5183/ at 1280x720
//   QA_TOUCH=1 ...                                     as a phone
//   ONLY=fair,hall ...                                 just those viewpoints
//   AWAKE=1 ...                                        the town before the snow (otherwise asleep, every door open)
//   HUD=1 ...                                          keep the HUD on
//   VIEWS="name,x,z,tx,tz;name2,x,z,tx,tz" ...         your own viewpoints instead (stand at x,z looking at tx,tz)
//   EYE=12 ...                                         lift the camera this many metres (a bird's-eye check of a layout)
//
// Writes shots/zarya/town-<name>.png (SC picks another folder).
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const out = process.env.SC ?? 'shots/zarya';
mkdirSync(out, { recursive: true });

// name, x, z, the point looked at (x, z)
const VIEWS = [
  ['start', -60, -35, 0, -10],
  ['square', -30, -30, 20, 10],
  ['tree', -8, 30, -8, 0],
  ['fair', 27, 20, 27, -20],
  ['ice', -30, 24, -58, 40],
  ['slide', -40, 46, -70, 40],
  ['stop', -14, -44, 24, -54],
  ['palace', -56, -22, -84, -22],
  ['front', 44, -2, 70, -2],
  ['doors', 78, -2, 100, -6],
  ['hall', 88, 4, 112, -10],
  ['sport', 97, -17, 97, -27],
  ['tea', 128, -16, 136, -24],
  ['cloak', 86, 8, 86, 20],
  ['bench', 124, 21, 127, 15],
  ['stairs', 134, 23, 137.4, 19],
  ['lane', 110, 33, 135.5, 25],
  ['shelter', 384, 3, 368, 0],
  ['watch', 390, -3, 396.8, -3],
  ['vestibule', 366, 0, 361, 0],
];
const want = process.env.ONLY ? process.env.ONLY.split(',') : null;
if (process.env.VIEWS) {
  VIEWS.length = 0;
  for (const v of process.env.VIEWS.split(';')) {
    const [name, ...n] = v.split(',');
    if (name && n.length === 4) VIEWS.push([name.trim(), ...n.map(Number)]);
  }
}
const eye = Number(process.env.EYE || 0);

const { browser, page, logs } = await openPage({ url: `${base}?nolock${touch ? '&touch=1' : ''}`, w, h });
const D = (fn, ...args) => page.evaluate(fn, ...args);
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await D((awake) => {
  const d = window.__dead;
  const g = d.game;
  // nobody to fight while looking: the squad stays put, nothing hunts
  if (!awake) {
    const s = g.zarya.story;
    s.ch = 3;
    s.f = 1 | 2 | 4 | 32; // armed, released, Gena down, the plug out
  }
  g.zombies.spawnAllowed = () => false;
  d.clearZombies();
}, !!process.env.AWAKE);
await D(() => window.__dead.advance(4));
if (!process.env.HUD) await page.addStyleTag({ content: '.ds-hud, .ds-touch-layer, .ds-prompt { opacity: 0 !important; }' });

for (const [name, x, z, tx, tz] of VIEWS) {
  if (want && !want.includes(name)) continue;
  await D(([x, z, tx, tz]) => {
    const d = window.__dead;
    d.clearZombies();
    d.setHealth(100, 100);
    d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)));
  }, [x, z, tx, tz]);
  await D(() => window.__dead.advance(1.2));
  if (eye > 0) {
    // lifted straight up and tipped down toward the point looked at. The game sets the camera from the player every
    // frame, so the lift is applied inside the renderer's own draw (a one-off render was drawn over at once). Indoors
    // the roof is drawn too: inside an interior this shows the roof, not the room.
    await D(([eye, tx, tz]) => {
      const g = window.__dead.game;
      const rr = g.renderer.renderer;
      window.__eyeAt = [eye, tx, tz];
      if (!rr.__eyeHook) {
        const real = rr.render.bind(rr);
        rr.render = (scene, cam) => {
          const at = window.__eyeAt;
          if (at && cam === g.renderer.camera) {
            cam.position.y = g.player.eyeY() + at[0];
            cam.lookAt(at[1], 0, at[2]);
            cam.updateMatrixWorld(true);
          }
          return real(scene, cam);
        };
        rr.__eyeHook = true;
      }
      g.zarya.zones.showAll();
    }, [eye, tx, tz]);
    await D(() => window.__dead.advance(0.1));
  }
  await page.screenshot({ path: `${out}/town-${name}.png` });
  const info = await D(() => {
    const g = window.__dead.game;
    const r = g.renderer.renderer.info.render;
    return { calls: r.calls, tris: r.triangles, zone: g.zarya.zones.current };
  });
  console.log(`${name.padEnd(10)} ${String(info.calls).padStart(4)} draws  ${String(Math.round(info.tris / 1000)).padStart(5)}k tris  zone ${info.zone}`);
}
const errors = logs.filter((l) => l.type === 'pageerror' || (l.type === 'error' && !/favicon|404|502|Bad Gateway/.test(l.text)));
for (const e of errors.slice(0, 8)) console.log('ERROR', e.text.slice(0, 400));
console.log(errors.length ? `${errors.length} page errors` : 'no page errors');
await browser.close();
