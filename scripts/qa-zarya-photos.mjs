// ZARYA: the Zenit's photographs and Morozko's parry, played in the real game (headless Chrome).
//
//   node scripts/qa-zarya-photos.mjs [url] [w] [h]       QA_TOUCH=1 for the phone layout, ONLY=photos|parry
//
// PHOTOS: for each marked spot, the story set to where the Zenit can be had and the spot's zone open; the player stood
//   6 m from the spot facing it, the Zenit in hand, one flash. Checks the clue is counted, the print was developed,
//   the card is up in a corner; writes the screen (shots/zarya/photos-<id>.png) and the print itself (print-<id>.jpg).
//   Also: a flash aimed away develops nothing; a flash from 14 m develops nothing.
// PARRY: the Berloga with Morozko fighting (clues found: three looked at, two photographs); the player in front of
//   him with a guard weapon. Waits for his question, raises the guard in it, checks he reels and the weak points
//   open (five), strikes from the front and checks the blow is worth three; then a swing timed into the next question.
import { mkdirSync, writeFileSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const only = process.env.ONLY ?? '';
const out = 'shots/zarya';
const tag = touch ? 'phone-' : '';
mkdirSync(out, { recursive: true });

const { browser, page, logs } = await openPage({ w, h });
// other sessions save into this checkout: the dev server's hot-reload socket is answered and never heard from
await page.routeWebSocket((u) => u.pathname === '/' && u.host === new URL(base).host, () => {});
await page.goto(`${base}?nolock${touch ? '&touch=1' : ''}`, { waitUntil: 'load' });
const D = (fn, ...args) => page.evaluate(fn, ...args);
const advance = (s) => D((t) => window.__dead.advance(t), s);
let fails = 0;
const check = (name, ok, info = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
};

await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => localStorage.setItem('deadsignal.map.v1', 'zarya'));
await page.reload();
await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
await D(() => window.__dead.start());
await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
await advance(0.5);

const N = await D(async () => {
  const st = await import('/src/zarya/story.ts');
  const pl = await import('/src/zarya/places.ts');
  const ph = await import('/src/zarya/photos.ts');
  return JSON.parse(JSON.stringify({ CLUES: st.CLUES, CH: st.CH, F: st.F, G: st.G, BERLOGA: pl.BERLOGA, SHOTS: ph.SHOTS, PHOTO_CLUES: ph.PHOTO_CLUES }));
});
const { CLUES, CH, F, G, BERLOGA, SHOTS, PHOTO_CLUES } = N;
const F_ALL = F.armed | F.released | F.gena | F.plug | F.notice | F.flare;
const G_OPEN = G.tickets | G.escalator | G.tamada | G.tamadaDown | G.pond | G.code;

async function setState(state) {
  await D((state) => {
    const d = window.__dead;
    const g = d.game;
    const s = g.zarya.story;
    for (const k of ['ch', 'f', 'g', 'm', 'clues', 'covered', 'orn', 'dolls', 'turned', 'end']) s[k] = state[k] ?? 0;
    for (const k of ['parts', 'built', 'gates']) s.unlock.view[k] = state[k] ?? 0;
    g.zombies.spawnAllowed = () => false;
    // the last card down, so this one's is the one up
    g.zarya.photos.hideCard();
    g.zarya.photos.queue.length = 0;
    d.clearZombies();
    d.setHealth(100, 100);
  }, state);
}

if (!only || only === 'photos') {
  for (const i of PHOTO_CLUES) {
    const c = CLUES[i];
    const shot = SHOTS[c.id];
    await setState({ ch: CH.act2, f: F_ALL, g: G_OPEN, gates: 7 });
    // 6 m from the spot, toward where the photograph's camera stands
    const dx = shot.eye[0] - c.at.x;
    const dz = shot.eye[2] - c.at.z;
    const k = 6 / Math.hypot(dx, dz);
    const at = { x: c.at.x + dx * k, z: c.at.z + dz * k };
    const r = await D(([at, spot, floor, i]) => {
      const d = window.__dead;
      const g = d.game;
      d.teleport(at.x, at.z, 0, floor);
      d.giveGun('zenit');
      d.advance(0.8);
      d.lookAt(spot.x, spot.z, floor + 0.6);
      d.advance(0.1);
      const before = g.zarya.story.view.clues;
      d.click();
      d.advance(0.6);
      const after = g.zarya.story.view.clues;
      const card = document.querySelector('.zy-print');
      const box = card?.getBoundingClientRect();
      return { before, after, card: box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null, src: g.zarya.photos.prints.get(i) ?? null, cardFor: card?.querySelector('img')?.alt ?? null, zone: g.zarya.zones.current, pos: [g.player.x, g.player.y, g.player.z] };
    }, [at, c.at, shot.floor, i]);
    await advance(1.6);
    await page.screenshot({ path: `${out}/${tag}photos-${c.id}.png` });
    if (r.src?.startsWith('data:image/jpeg;base64,')) writeFileSync(`${out}/print-${c.id}.jpg`, Buffer.from(r.src.split(',')[1], 'base64'));
    const counted = (r.after & (1 << i)) !== 0 && (r.before & (1 << i)) === 0;
    const corner = r.cardFor === c.name && r.card && r.card.x + r.card.w > w * 0.7 && (r.card.y + r.card.h < h * 0.66);
    check(`photo ${c.id}: counted, developed, card in a corner`, counted && !!r.src && !!corner, JSON.stringify({ zone: r.zone, card: r.card, pos: r.pos.map((n) => Math.round(n * 10) / 10) }));
  }
  // aimed away, and too far: nothing
  {
    const c = CLUES[PHOTO_CLUES[0]];
    await setState({ ch: CH.act2, f: F_ALL, g: G_OPEN, gates: 7 });
    const r = await D(([spot]) => {
      const d = window.__dead;
      const g = d.game;
      d.teleport(spot.x + 5, spot.z + 2, 0);
      d.giveGun('zenit');
      d.advance(0.8);
      d.lookAt(spot.x + 30, spot.z + 2, 1.5);
      d.click();
      d.advance(0.4);
      const away = g.zarya.story.view.clues;
      d.teleport(spot.x + 13, spot.z + 8, 0);
      d.advance(0.3);
      d.lookAt(spot.x, spot.z, 0.6);
      d.advance(1.4);
      d.click();
      d.advance(0.4);
      return { away, far: g.zarya.story.view.clues };
    }, [c.at]);
    check('a flash aimed away develops nothing; nor one from 15 m', r.away === 0 && r.far === 0, JSON.stringify(r));
  }
}

if (!only || only === 'parry') {
  const clues = 0b111 | (1 << PHOTO_CLUES[0]) | (1 << PHOTO_CLUES[1]);
  await setState({ ch: CH.finale, f: F_ALL, g: G_OPEN | G.keyDoor | G.asked, gates: 7, clues });
  const m0 = BERLOGA.morozko;
  await D(([m0]) => {
    const d = window.__dead;
    const g = d.game;
    // (the first frame after the armed flag hands out Nina's knife: the bat after it)
    d.advance(0.3);
    d.giveGun('pistol');
    g.melee.equip('bat');
    g.melee.setOut(true);
    // in front of him (he faces west, toward the door)
    d.teleport(m0.x - 2.2, m0.z, -Math.PI / 2);
    d.advance(0.6);
  }, [m0]);
  // wait for his question, keeping everyone else out of it
  const waitAsk = async (secs) => {
    for (let t = 0; t < secs; t += 0.1) {
      const r = await D(() => {
        const d = window.__dead;
        const g = d.game;
        for (const z of g.zombies.zombies) if (z.alive && !z.isBoss) z.hp = 0;
        d.setHealth(100, 100);
        const m = g.zombies.zombies.find((z) => z.alive && z.tag === 'MOROZKO');
        if (m) d.lookAt(m.x, m.z, 1.6);
        d.advance(0.1);
        return m ? { mode: m.poseMode, t: m.poseT, hp: m.hp, max: m.maxHp, x: m.x, z: m.z } : null;
      });
      if (r && r.mode === 'slam' && r.t < 0.3) return r;
    }
    return null;
  };
  const ask1 = await waitAsk(20);
  const caption = await D(() => [...document.querySelectorAll('.ds-caption, .ds-radio, [class*=radio]')].map((e) => e.textContent).join(' | '));
  check('Morozko stops and asks his question before the heavy blow', !!ask1 && /warm/i.test(caption), `${JSON.stringify(ask1)}; ${caption.slice(0, 120)}`);
  await page.screenshot({ path: `${out}/${tag}parry-ask.png` });
  // the guard raised in the pause
  const blocked = await D(() => {
    const d = window.__dead;
    const g = d.game;
    d.hold({ ads: true });
    for (let k = 0; k < 8; k++) d.advance(0.1);
    d.hold({ ads: false });
    d.advance(0.15);
    const m = g.zombies.zombies.find((z) => z.alive && z.tag === 'MOROZKO');
    const dir = g.zarya.director.morozko;
    return { state: m?.state, mode: m?.poseMode, weak: dir.weak, reel: dir.reel, parries: dir.parries, hp: m?.hp };
  });
  // (five open; the squadmates' shots may already have closed some: anyone's blow on an open one closes it)
check('a guard raised in the pause staggers him, and his weak points open (five, less any the squad has hit)', blocked.parries === 1 && blocked.state === 'stagger' && blocked.weak !== 0 && (blocked.weak & ~0b11111) === 0 && blocked.reel > 2, JSON.stringify(blocked));
  await advance(0.3);
  await page.screenshot({ path: `${out}/${tag}parry-weak.png` });
  // a blow from the front on an open weak point
  const struck = await D(() => {
    const d = window.__dead;
    const g = d.game;
    const m = g.zombies.zombies.find((z) => z.alive && z.tag === 'MOROZKO');
    const weakBefore = g.zarya.director.morozko.weak;
    // a blow on the side the first open one is on (0 front, 1 back, 2 his left, 3 his right)
    const SIDE = [0, 1, 2, 3, 0, 1];
    const i = SIDE.findIndex((_, k) => (weakBefore & (1 << k)) !== 0);
    const dir = m.yaw + [Math.PI, 0, -Math.PI / 2, Math.PI / 2][SIDE[i]];
    const before = m.hp;
    g.zombies.damage(m, 100, false, g.zenv, dir);
    const front = before - m.hp;
    const weakAfter = g.zarya.director.morozko.weak;
    // and a blow on a side with none open is worth one
    const left = weakAfter;
    const none = [0, 1, 2, 3].find((sd) => !SIDE.some((q, k) => q === sd && (left & (1 << k)) !== 0));
    const b2 = m.hp;
    if (none !== undefined) g.zombies.damage(m, 100, false, g.zenv, m.yaw + [Math.PI, 0, -Math.PI / 2, Math.PI / 2][none]);
    return { front, plain: none === undefined ? 100 : b2 - m.hp, weakBefore, weakAfter, i };
  });
  check('a blow on an open weak point is worth three and closes it; elsewhere one', Math.abs(struck.front - 300) < 1 && struck.weakAfter === (struck.weakBefore & ~(1 << struck.i)) && Math.abs(struck.plain - 100) < 1, JSON.stringify(struck));
  const recovered = await D(() => {
    const d = window.__dead;
    for (let k = 0; k < 32; k++) {
      d.setHealth(100, 100);
      d.advance(0.1);
    }
    const g = d.game;
    return g.zarya.director.morozko;
  });
  check('the weak points close when he recovers', recovered.weak === 0 && recovered.reel === 0, JSON.stringify(recovered));
  // a swing timed into the next question
  const ask2 = await waitAsk(20);
  const swung = await D(() => {
    const d = window.__dead;
    const g = d.game;
    const m = g.zombies.zombies.find((z) => z.alive && z.tag === 'MOROZKO');
    d.teleport(m.x - Math.sin(m.yaw) * 1.6, m.z - Math.cos(m.yaw) * 1.6);
    d.lookAt(m.x, m.z, 1.5);
    d.click();
    for (let k = 0; k < 6; k++) d.advance(0.1);
    return { ...g.zarya.director.morozko, state: m.state, windingUp: m.windingUp };
  });
  check('a swing landed in the pause is a parry too', !!ask2 && swung.parries === 2 && swung.reel > 0, JSON.stringify(swung));
}

const errors = logs.filter((l) => l.type === 'pageerror' || (l.type === 'error' && !/favicon|404|Failed to load resource/.test(l.text)));
for (const e of errors.slice(0, 8)) console.log('  page:', e.text.slice(0, 300));
check('no page errors', errors.length === 0, `${errors.length}`);
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
process.exit(fails ? 1 : 0);
