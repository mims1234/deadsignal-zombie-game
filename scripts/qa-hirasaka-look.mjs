// HIRASAKA: a walk round the island and the deep with a camera, for judging a build by eye (one screenshot per
// viewpoint, and how many draw calls each costs: at most 190 from any view on Low and Lite).
//
//   node scripts/qa-hirasaka-look.mjs [url] [w] [h]      default http://127.0.0.1:5183/ at 1280x720
//   QA_TOUCH=1 ...                                         as a phone
//   ONLY=pier,market ...                                   just those viewpoints
//   HUD=1 ...                                              keep the HUD on
//   VIEWS="name,x,z,tx,tz[,y];name2,..." ...               your own viewpoints (stand at x,z on the floor at y - the
//                                                          highest floor there when left out - looking at tx,tz)
//   QUALITY=low ...                                        the graphics quality (low / lite / medium / high / high+)
//   EYE=25 ...                                             lift the camera this many metres (a bird's-eye check)
//
// Writes shots/hirasaka/look-<name>.png (SC picks another folder). Prefix your viewpoint names with your group's id.
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const out = process.env.SC ?? 'shots/hirasaka';
mkdirSync(out, { recursive: true });

// name, x, z, the point looked at (x, z), and the floor's height (the highest floor there when left out)
const VIEWS = [
  ['pier', 13, 92, 13, 40, 0],
  ['seawall', 40, 66, -20, 60, 0],
  ['shiofuri', -60, 66, -150, 64, 0],
  ['nikkyu', -120, 40, -150, 0, 0],
  ['block30', -50, 40, -90, 30, 3.6],
  ['market', -30, 34, 10, 34, 3.6],
  ['block31', 40, 48, 50, 20, 0],
  ['hospital', -50, 10, -90, -10, 7.2],
  ['school', -70, -24, -66, -60, 7.2],
  ['block65', -120, -24, -122, -60, 7.2],
  ['heights', -60, -42, -140, -51, 21.6],
  ['hellfoot', -16, 30, -16, -24, 3.6],
  ['landing', -16, 0, -16, -30, 10.8],
  ['fan', 30, -4, 56, -16, 7.2],
  ['summit', 20, -30, 30, -66, 18],
  ['rock', -16, -20, -10, -36, 10.8],
  ['life', 100, -6, 70, -6, 0],
  ['pithead', 100, 20, 126, 4, 0],
  ['cagebottom', 284, 42, 300, 54, 9],
  ['gallery', 330, 40, 392, 40, 9],
  ['face', 420, 40, 466, 30, 9],
  ['village', 436, -10, 470, -40, 9],
  ['kofun', 390, -36, 344, -36, 7.5],
  ['roothall', 336, -20, 300, -40, 0],
];
const want = process.env.ONLY ? process.env.ONLY.split(',') : null;
if (process.env.VIEWS) {
  VIEWS.length = 0;
  for (const v of process.env.VIEWS.split(';')) {
    const [name, ...n] = v.split(',');
    if (name && n.length >= 4) VIEWS.push([name.trim(), ...n.map(Number)]);
  }
}
const eye = Number(process.env.EYE || 0);

const { browser, page, logs } = await openPage({ url: `${base}?nolock${touch ? '&touch=1' : ''}`, w, h });
const D = (fn, ...args) => page.evaluate(fn, ...args);
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D((q) => {
  localStorage.setItem('deadsignal.map.v1', 'hirasaka');
  if (q) {
    const k = 'deadsignal.settings.v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    localStorage.setItem(k, JSON.stringify({ ...s, quality: q, qualityAuto: false, masterVolume: 0 }));
  }
}, process.env.QUALITY ?? '');
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await D(() => {
  const d = window.__dead;
  const g = d.game;
  g.zombies.spawnAllowed = () => false;
  d.clearZombies();
});
await D(() => window.__dead.advance(4));
if (!process.env.HUD) await page.addStyleTag({ content: '.ds-hud, .ds-touch-layer, .ds-prompt { opacity: 0 !important; }' });

for (const [name, x, z, tx, tz, y] of VIEWS) {
  if (want && !want.includes(name)) continue;
  await D(([x, z, tx, tz, y]) => {
    const d = window.__dead;
    const g = d.game;
    d.clearZombies();
    d.setHealth(100, 100);
    const fy = Number.isFinite(y) ? y : g.level.world.floorHeight(x, z, 0.3);
    d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)), fy);
  }, [x, z, tx, tz, y]);
  await D(() => window.__dead.advance(1.2));
  if (eye > 0) {
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
      g.hirasaka.zones.showAll();
    }, [eye, tx, tz]);
    await D(() => window.__dead.advance(0.1));
  }
  await page.screenshot({ path: `${out}/look-${name}.png` });
  // the map's own cost, with the squadmates hidden (their anime bodies are the squad's cost, printed apart)
  const info = await D(() => {
    const g = window.__dead.game;
    const r = g.renderer.renderer.info.render;
    const withSquad = r.calls;
    const figs = g.squad.figures().map((f) => f.root ?? f.group ?? f).filter((o) => o && 'visible' in o);
    const was = figs.map((o) => o.visible);
    figs.forEach((o) => (o.visible = false));
    g.renderer.render(0, performance.now() / 1000);
    const calls = r.calls;
    const tris = r.triangles;
    figs.forEach((o, i) => (o.visible = was[i]));
    return { calls, withSquad, tris, zone: g.hirasaka.zones.current, y: +g.player.y.toFixed(1) };
  });
  const squad = Math.max(0, info.withSquad - info.calls);
  console.log(`${name.padEnd(11)} ${String(info.calls).padStart(4)} draws  ${String(Math.round(info.tris / 1000)).padStart(5)}k tris  (+${squad} squad)  y ${String(info.y).padStart(5)}  group ${info.zone}${info.calls > 190 ? '   OVER 190' : ''}`);
}
const errors = logs.filter((l) => l.type === 'pageerror' || (l.type === 'error' && !/favicon|404|502|Bad Gateway/.test(l.text)));
for (const e of errors.slice(0, 8)) console.log('ERROR', e.text.slice(0, 400));
console.log(errors.length ? `${errors.length} page errors` : 'no page errors');
await browser.close();
