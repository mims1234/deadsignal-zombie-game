// HIRASAKA reborn, end to end in headless Chrome: load the island, play the whole story by its own actions (the
// placeholder prompts: the tools and their obstacles, the three jobs, the Mori and the umibōzu, the cage, the ladles
// and the funayūrei, the drift, the roots, the hairpin and Kurogane, the climb by place, the Chibiki-iwa) to an
// ending, screenshot each beat, and print the story's state and any page errors.
//
//   SC=<dir> node scripts/qa-hirasaka.mjs [url]       (the dev server, default http://127.0.0.1:5183/)
//   ENDING=sealed | home | both (default both: the run is played twice)
//   QA_TOUCH=1 ...                                   as a phone at 844x390 (adds ?touch=1)
import { mkdirSync } from 'node:fs';
import { openPage, reportLogs, sleep } from './lib/browser.mjs';

const SC = process.env.SC || 'shots/hirasaka/qa';
mkdirSync(SC, { recursive: true });
// (final polish) QA_TOUCH=1: as a phone (adds ?touch=1, 844x390 unless W / H say otherwise)
const touch = !!process.env.QA_TOUCH;
const base = process.argv[2] || 'http://127.0.0.1:5183/';
const url = touch ? `${base}${base.includes('?') ? '&' : '?'}touch=1` : base;
const endings = process.env.ENDING && process.env.ENDING !== 'both' ? [process.env.ENDING] : ['sealed', 'home'];
const { browser, page, logs } = await openPage({ url, w: Number(process.env.W || (touch ? 844 : 1280)), h: Number(process.env.H || (touch ? 390 : 720)) });
const ev = (fn, arg) => page.evaluate(fn, arg);
// a voice or cue the island asks for and does not get (a missing take is a silent line)
const missingAudio = new Set();
page.on('response', (r) => {
  if (r.status() >= 400 && /\/hirasaka\/(voice|music)\//.test(r.url())) missingAudio.add(r.url().replace(/\?.*$/, '').replace(/^.*\/hirasaka\//, ''));
});
let failures = 0;
const check = (ok, what) => {
  if (!ok) failures++;
  console.log(ok ? '  ok  ' : '  FAIL', what);
};
const shot = async (name) => {
  await ev(() => window.__dead.setHealth(100, 100));
  await sleep(700);
  await page.screenshot({ path: `${SC}/hs-${name}.png` });
};
const state = () =>
  ev(() => {
    const g = window.__dead.game;
    const v = g.hirasaka.view;
    const r = g.renderer.renderer.info.render;
    return { act: v.act, done: v.done, coal: v.coal, tools: v.tools, obstacles: v.obstacles, ladles: v.ladles, umi: v.umi, hits: v.umiHits, cage: v.cageDown, hairpin: v.hairpin, boss: v.bossDown, mark: v.mark, lead: v.lead, cranks: v.cranks, photos: v.photos, call: v.call, side: v.side, ending: v.ending, calls: r.calls, p: [g.player.x, g.player.y, g.player.z].map((n) => +n.toFixed(1)), hp: Math.round(g.session.vitals.health), zombies: g.zombies.zombies.filter((z) => z.alive).length };
  });
/** Stand on a spot (on its floor) facing (fx, fz), and give it a moment. */
const at = async (s, look) => {
  await ev(([s, look]) => {
    const d = window.__dead;
    const yaw = look ? Math.atan2(-(look.x - s.x), -(look.z - s.z)) : d.game.player.yaw;
    d.teleport(s.x, s.z, yaw, s.y);
    d.setHealth(100, 100);
  }, [s, look]);
  await sleep(250);
};
const act = (a, i = 0) => ev(([a, i]) => window.__dead.game.hirasaka.act(a, i), [a, i]);
// (arms) a tool is taken into the pack; an obstacle opens to blows of its own tool (`hirasaka/arms.ts`): swing it
const takeTool = (i) => ev((i) => window.__dead.game.hirasaka.arms.takeTool(i), i);
const swingAt = (i) =>
  ev((i) => {
    const a = window.__dead.game.hirasaka.arms;
    for (let k = 0; k < 6; k++) if (a.blow(i, false)) return k + 1;
    return 0;
  }, i);

async function play(ending) {
  console.log(`\n=== HIRASAKA, to the ${ending.toUpperCase()} ending ===`);
  await ev(() => localStorage.setItem('deadsignal.map.v1', 'hirasaka'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__dead && window.__dead.game && window.__dead.game.state === 'title', null, { timeout: 120000 });
  const t0 = Date.now();
  await ev(() => window.__dead.start());
  await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 90000 });
  console.log('started in', Date.now() - t0, 'ms');
  // the places, read from the running game's module graph through the runtime
  const S = await ev(async () => {
    const m = await import('/src/hirasaka/places.ts');
    return { JOBS: m.JOBS, TOOLS: m.TOOLS, TOOL_IDS: m.TOOL_IDS, OBSTACLES: m.OBSTACLES, OBSTACLE: m.OBSTACLE, UMIBOZU: m.UMIBOZU, CAGE: m.CAGE, LADLES: m.LADLES, DEEP_SPOTS: m.DEEP_SPOTS, CLIMB_MARKS: m.CLIMB_MARKS, ROCK: m.ROCK, ADIT: m.ADIT, PHOTOS: m.PHOTOS, TAPES: m.TAPES, SIDE: m.SIDE, HEIGHTS: m.HEIGHTS };
  });
  await ev(() => {
    window.__dead.game.zombies.spawnAllowed = () => false; // the story, not the fight: the infected are tested elsewhere
    window.__dead.clearZombies();
  });
  await sleep(4000);
  await shot(`${ending}-01-pier`);
  console.log(await state());
  // ---- ACT I ----
  for (const [i, id] of S.TOOL_IDS.entries()) {
    await at(S.TOOLS[id]);
    await takeTool(i);
  }
  check((await state()).tools === 15, 'the four tools taken');
  check((await ev(() => window.__dead.game.melee.pack.join(','))).includes('tsuruhashi,timberAxe,coalShovel,tachi'), 'the four tools are in the pack to swing');
  await at(S.JOBS.steam.coal[0]);
  await act('coal', 0);
  await at(S.JOBS.steam.coal[1]);
  await act('coal', 1);
  await at(S.OBSTACLES[S.OBSTACLE.slag].at);
  await swingAt(S.OBSTACLE.slag);
  await at(S.JOBS.steam.boilerKey);
  await act('boilerKey');
  await at(S.OBSTACLES[S.OBSTACLE.bathDoor].at, S.JOBS.steam.boiler);
  await swingAt(S.OBSTACLE.bathDoor);
  await at(S.JOBS.steam.boiler);
  await act('burner');
  await shot(`${ending}-02-boiler`);
  await at(S.JOBS.air.shutter, S.JOBS.air.fan);
  await swingAt(S.OBSTACLE.shutter);
  await at(S.JOBS.air.fan);
  await act('fan');
  await shot(`${ending}-03-fan`);
  await at(S.HEIGHTS.stairHead, S.JOBS.key.key);
  await shot(`${ending}-04-heights`);
  await at(S.JOBS.key.key);
  await act('key');
  let st = await state();
  check(st.done === 7, `the three jobs done (done ${st.done})`);
  check(st.umi === 1, 'the umibōzu rises');
  await at(S.UMIBOZU.parts[0]);
  await act('part', 0);
  await at(S.UMIBOZU.parts[1]);
  await act('part', 1);
  await at(S.UMIBOZU.winch, { x: 40, z: 116 });
  await act('built', 0);
  await sleep(2500);
  await shot(`${ending}-05-umibozu`);
  // (the umibōzu's own fight is scripts/qa-hirasaka-fights.mjs: here the three hits as the Mori sends them)
  for (let i = 0; i < 3; i++) await act('umiHit');
  await at(S.LADLES);
  await act('ladles');
  if (ending === 'home') {
    for (const [i, p] of S.PHOTOS.entries()) {
      if (p.x > 250) continue;
      await at(p);
      await act('photo', i);
    }
  }
  st = await state();
  check(st.umi === 2, 'the umibōzu sunk: the cage runs');
  // ---- ACT II ----
  await at(S.CAGE.top);
  await ev(() => window.__dead.game.hirasaka.rideCage(true));
  await sleep(4500);
  await shot(`${ending}-06-landing`);
  st = await state();
  check(st.act === 1 && st.p[0] > 250, `down the cage (act ${st.act}, at ${st.p})`);
  await at(S.DEEP_SPOTS.bench);
  await act('knock');
  await at(S.DEEP_SPOTS.funa, { x: 400, z: 40 });
  await shot(`${ending}-07-funayurei`);
  await act('funa');
  await at(S.OBSTACLES[S.OBSTACLE.drift].at);
  await swingAt(S.OBSTACLE.drift);
  if (ending === 'home') {
    const p4 = S.PHOTOS[4];
    await at(p4);
    await act('photo', 4);
    await at(S.DEEP_SPOTS.phone);
    await act('phone');
    await at(S.DEEP_SPOTS.riceball);
    await act('side', S.SIDE.riceball);
  }
  await at({ x: 450, y: 9, z: -12 }, S.DEEP_SPOTS.hearth);
  await shot(`${ending}-08-village`);
  await at(S.DEEP_SPOTS.hairpin, S.DEEP_SPOTS.tree);
  await swingAt(S.OBSTACLE.roots);
  await act('hairpin');
  await sleep(1500);
  await shot(`${ending}-09-roothall`);
  st = await state();
  check(st.hairpin, 'the hairpin taken: Kurogane wakes');
  await ev(() => {
    const g = window.__dead.game;
    const b = g.zombies.boss;
    // (his thunders are his fight's, scripts/qa-hirasaka-fights.mjs: here every one broken at once)
    if (b) {
      g.hirasaka.dir.kuro.endNow(b);
      g.zombies.damage(b, 1e6, true, g.zenv, 0);
    }
  });
  await sleep(3000);
  st = await state();
  check(st.boss && st.act === 2, 'Kurogane down: the cable snaps, the climb');
  // ---- ACT III ----
  await at(S.DEEP_SPOTS.peaches);
  await ev(() => window.__dead.game.hirasaka.takeGift('peaches'));
  for (const [i, m] of S.CLIMB_MARKS.entries()) {
    if (i === 1) {
      await at(S.ADIT.door);
      await ev(() => window.__dead.game.hirasaka.climbOut());
      await sleep(2200);
      await shot(`${ending}-10-adit`);
    } else await at(m.at);
    await sleep(600);
  }
  st = await state();
  check(st.mark === S.CLIMB_MARKS.length - 1, `every landmark passed, the sea behind (mark ${st.mark})`);
  await at({ x: -16, y: 18, z: -26 }, { x: -16, z: 20 });
  await shot(`${ending}-11-sea`);
  // keep her off the rock
  await ev(() => {
    for (const z of window.__dead.game.zombies.zombies) if (z.variant === 'follower') { z.x = 0; z.z = 60; }
  });
  if (ending === 'sealed') {
    await at(S.ROCK.winches[0], S.ROCK.rest);
    await ev(() => (window.__dead.game.hirasaka.story.view.cranks = 44));
    for (let i = 0; i < 8; i++) {
      await act('crank', 0);
      await sleep(400);
    }
  } else {
    await at(S.ROCK.turn, { x: -16, z: 20 });
    await act('home');
  }
  await sleep(3500);
  await shot(`${ending}-12-ending`);
  st = await state();
  check(st.ending === (ending === 'sealed' ? 1 : 2), `the ${ending} ending (ending ${st.ending})`);
  await sleep(12000);
  check((await ev(() => window.__dead.game.state)) !== 'playing', 'the results follow');
}

try {
  for (const e of endings) await play(e);
  const decoded = await ev(() => window.__dead.game.hirasaka.sound.buffers.size);
  check(missingAudio.size === 0, `every voice and cue on disk (${missingAudio.size ? [...missingAudio].join(' ') : 'none missing'}; ${decoded} decoded)`);
} catch (e) {
  failures++;
  console.log('FAILED', e.message);
  await page.screenshot({ path: `${SC}/hs-fail.png` });
} finally {
  reportLogs(logs, { warnings: false });
  console.log(failures ? `${failures} FAILED` : 'ALL OK');
  await browser.close();
}
