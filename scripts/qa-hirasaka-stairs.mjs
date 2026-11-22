// HIRASAKA: take every stairwell on the map through the game's own prompt (the school stair to the Heights, both ways)
// and check the player and the squad come out on the far end's floor, not on the ground inside the hill (v0.4.392).
//
//   node scripts/qa-hirasaka-stairs.mjs [url]     default http://127.0.0.1:5183/
import { openPage } from './lib/browser.mjs';
const { browser, page } = await openPage({ url: `${process.argv[2] ?? 'http://127.0.0.1:5183/'}?nolock`, w: 960, h: 540 });
const D = (fn, ...a) => page.evaluate(fn, ...a);
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'hirasaka'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await D(() => { const d = window.__dead; d.game.zombies.spawnAllowed = () => false; d.clearZombies(); });
await D(() => window.__dead.advance(2));
let bad = 0;
const links = await D(() => window.__dead.game.level.floors.links.map((l, i) => ({ i, teleport: !!l.teleport, lower: l.lower, upper: l.upper, a: l.path[0], b: l.path[l.path.length - 1], a2: l.path[1], b2: l.path[l.path.length - 2] })));
for (const l of links.filter((l) => l.teleport)) {
  for (const [from, end, inner] of [[l.lower, l.a, l.a2], [l.upper, l.b, l.b2]]) {
    const r = await D(([end, inner]) => {
      const d = window.__dead, g = d.game;
      d.teleport(end.x, end.z, 0, end.y);
      g.stairwellCd = 0;
      const out = [];
      g.stairwellPrompt(out);
      const t = out[0];
      if (!t) return { none: true, at: [end.x, end.y, end.z] };
      t.onUse();
      return { text: t.text };
    }, [end, inner]);
    if (r.none) { console.log(`link ${l.i} from area ${from}: no prompt at`, r.at); continue; }
    await D(() => window.__dead.advance(1));
    const s = await D(() => { const g = window.__dead.game, p = g.player, fl = g.level.floors; let vis = 0; g.renderer.scene.traverseVisible((o) => { if (o.isMesh) vis++; }); return { squad: g.squad.allies.map((a) => +a.ref.y.toFixed(2)), p: [p.x, p.y, p.z].map((n) => +n.toFixed(2)), area: fl.areaAt(p.x, p.y, p.z), calls: g.renderer.renderer.info.render.calls, vis }; });
    const to = from === l.lower ? l.b : l.a;
    const ok = Math.abs(s.p[1] - to.y) < 0.6 && s.squad.every((y) => Math.abs(y - to.y) < 0.6);
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} link ${l.i} "${r.text}" -> want y ${to.y} at ${to.x},${to.z}; landed`, JSON.stringify(s));
    await page.screenshot({ path: `shots/hirasaka/stair-${l.i}-${from}.png` });
  }
}
console.log(bad ? `${bad} stairwell exits land at the wrong height` : 'every stairwell exit lands on its floor');
await browser.close();
process.exit(bad ? 1 : 0);
