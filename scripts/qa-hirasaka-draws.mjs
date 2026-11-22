// HIRASAKA: what the draw calls at one viewpoint are made of (by zone group and by material), for finding what to
// merge or cut. Uses the same viewpoints as qa-hirasaka-look.mjs.
//
//   VIEW="name,x,z,tx,tz,y" QUALITY=low node scripts/qa-hirasaka-draws.mjs [url]
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const [name, ...n] = (process.env.VIEW ?? 'seawall,40,66,-20,60,0').split(',');
const [x, z, tx, tz, y] = n.map(Number);
const { browser, page } = await openPage({ url: `${base}?nolock`, w: 1280, h: 720 });
const D = (fn, ...args) => page.evaluate(fn, ...args);
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
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await D(() => {
  window.__dead.game.zombies.spawnAllowed = () => false;
  window.__dead.clearZombies();
});
await D(([x, z, tx, tz, y]) => window.__dead.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)), y), [x, z, tx, tz, y]);
await D(() => window.__dead.advance(1.5));
const out = await D(() => {
  const g = window.__dead.game;
  const cam = g.renderer.camera;
  const zones = [...(g.level.zones?.entries() ?? [])];
  const byZone = {};
  const byMat = {};
  let total = 0;
  const shown = (o) => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  const zoneOf = (o) => {
    for (let p = o; p; p = p.parent) {
      const hit = zones.find(([, gr]) => gr === p);
      if (hit) return hit[0];
    }
    return 'unzoned';
  };
  // every drawable shown within the camera's far plane (frustum culling makes the real count lower)
  g.renderer.scene.traverse((o) => {
    if (!o.isMesh && !o.isSprite && !o.isPoints) return;
    if (!shown(o)) return;
    o.geometry?.boundingSphere || o.geometry?.computeBoundingSphere?.();
    const sp = o.geometry?.boundingSphere;
    if (sp && o.frustumCulled !== false) {
      const c = sp.center.clone().applyMatrix4(o.matrixWorld);
      if (c.distanceTo(cam.position) - sp.radius * o.matrixWorld.getMaxScaleOnAxis() > cam.far) return;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mt of mats) {
      total++;
      const zk = zoneOf(o);
      byZone[zk] = (byZone[zk] || 0) + 1;
      const key = (mt?.type ?? '?') + (mt?.emissive && mt.emissive.getHex() ? '+glow' : '') + (mt?.map ? '+tex' : '') + (mt?.transparent ? '+alpha' : '') + (mt?.name ? `:${mt.name}` : '');
      byMat[key] = (byMat[key] || 0) + 1;
    }
  });
  const r = g.renderer.renderer.info.render;
  return { calls: r.calls, shownInRange: total, far: cam.far, byZone, byMat };
});
console.log(name, 'calls', out.calls, 'by zone (shown, uncullled)', JSON.stringify(out.byZone));
// what each part costs: the calls with it hidden
const parts = await D(() => {
  const g = window.__dead.game;
  const rr = g.renderer.renderer;
  const calls = () => {
    const auto = rr.info.autoReset;
    rr.info.autoReset = false;
    rr.info.reset();
    rr.render(g.renderer.scene, g.renderer.camera);
    const n = rr.info.render.calls;
    rr.info.autoReset = auto;
    return n;
  };
  const base = calls();
  const res = { base };
  const hide = (label, objs) => {
    const was = objs.map((o) => o.visible);
    objs.forEach((o) => (o.visible = false));
    res[label] = base - calls();
    objs.forEach((o, i) => (o.visible = was[i]));
  };
  hide('squad figures', g.squad.figures().map((f) => f.root ?? f.group ?? f).filter((o) => o && 'visible' in o));
  hide('hirasaka look', [g.hirasaka.look.root]);
  for (const [id, gr] of g.level.zones) hide('group ' + id, [gr]);
  // the level's own batches outside every group (the frame: pads, parapets, flights, the deep's rock)
  const zoned = new Set([...g.level.zones.values()]);
  const frame = [];
  g.renderer.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible && ![...zoned].some((z) => { for (let q = o; q; q = q.parent) if (q === z) return true; return false; }) && !(() => { for (let q = o; q; q = q.parent) if (q === g.hirasaka.look.root) return true; return false; })()) frame.push(o); });
  hide('everything else (frame, sky, sea, cast)', frame);
  return res;
});
console.log(JSON.stringify(parts));
await browser.close();
