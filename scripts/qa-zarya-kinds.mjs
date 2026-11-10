// ZARYA's special kinds of infected, looked at and measured: a contact sheet per kind (close, at fifteen metres,
// coming on, and its own moment), one of the plain townspeople, and each habit confirmed with numbers in the real game.
//
//   node scripts/qa-zarya-kinds.mjs [url] [w] [h]     default http://127.0.0.1:5183/ at 640x360 a tile
//   ONLY=gruzchik,rybak,plain ...                      just those sheets (and the habits of those names)
//   LOOKS=0 ...                                        skip the sheets (numbers only);  HABITS=0 skips the numbers
//
// Writes shots/zarya/kind-<id>.png and kind-plain.png (SC picks another folder), and prints the numbers as JSON.
//
// The dev server reloads the page whenever a source file changes under it, which kills whatever was running in it:
// the page is given a stand-in for Vite's client so that it does not (HMR=1 keeps the real one), and every job (a
// sheet, a habit) is its own attempt, tried again in a fresh page if it still fails.
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 640);
const h = Number(process.argv[4] ?? 360);
const out = process.env.SC ?? 'shots/zarya';
mkdirSync(out, { recursive: true });
const KINDS = { ryazhenye: 'runner', svistok: 'armored', kassirsha: 'shambler', gruzchik: 'armored', dvornik: 'armored', rybak: 'shambler', morzh: 'armored', domovoi: 'runner' };
const want = process.env.ONLY ? process.env.ONLY.split(',') : null;
// where everything is stood: the player on the square looking east, the infected in front of them
const AT = { x: -44, z: 0 };
const FACE = Math.PI / 2; // an infected east of the player, turned to face them

let S = null; // the open page: { browser, context, page, sheet, logs }
const D = (fn, ...args) => S.page.evaluate(fn, ...args);

// What the page gets in place of Vite's client: the same exports with no socket behind them, so a file saved somewhere
// in the checkout does not reload the page under a job (styles are still put in the document).
const VITE_CLIENT = `
const sheets = new Map();
export function updateStyle(id, css) {
  let el = sheets.get(id);
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(el);
    sheets.set(id, el);
  }
  el.textContent = css;
}
export function removeStyle(id) {
  sheets.get(id)?.remove();
  sheets.delete(id);
}
export function createHotContext() {
  return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {} };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay {}
`;

async function open() {
  S = await openPage({ w, h });
  const page = S.page;
  await S.context.addInitScript(() => {
    try {
      localStorage.setItem('deadsignal.map.v1', 'zarya');
    } catch {
      // (about:blank has no storage)
    }
  });
  if (!process.env.HMR) await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'application/javascript', body: VITE_CLIENT }));
  await page.goto(`${base}?nolock`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dead?.game?.state === 'title', null, { timeout: 120000 });
  await D(() => window.__dead.start());
  await page.waitForFunction(() => window.__dead.game.state === 'playing', null, { timeout: 60000 });
  await D(async (AT) => {
    const d = window.__dead;
    const g = d.game;
    g.devFrozen = true; // only `advance` moves time from here
    // the town starts awake, with nobody infected allowed until the story says: put the story past that
    const s = g.zarya.story;
    s.ch = 3;
    s.f = 1 | 2 | 4 | 32;
    // nobody else in it: the squad would shoot whatever is being looked at, the map's own spawns would wander in
    g.squad.reset(false, false);
    d.clearZombies();
    g.zombies.spawnAllowed = () => false;
    // the wiring this script stands in for (`zarya/kinds.ts` says where it goes in the game)
    const kinds = await import('/src/zarya/kinds.ts');
    g.zombies.pickVariant = kinds.zaryaVariantPicker();
    g.zenv.pull = kinds.zaryaPull(g.player);
    window.__pull = g.zenv.pull;
    window.__z = (id) => g.zombies.zombies.find((q) => q.id === id);
    // an infected that stands where it is put and does nothing (for looking at); `look` picks which of its looks
    window.__stand = (type, kind, x, z, yaw, look) => {
      const id = d.spawnZombie(type, x, z, false, kind, yaw);
      const q = window.__z(id);
      q.sightScale = 0;
      if (look !== undefined) q.rig.reset(look << 3);
      return id;
    };
    window.__fresh = (x = AT.x, z = AT.z) => {
      d.clearZombies();
      d.hold({ forward: 0, strafe: 0, sprint: false });
      d.setHealth(100, 0);
      g.zenv.pull = window.__pull;
      d.teleport(x, z, -Math.PI / 2);
      d.look(-Math.PI / 2, 0);
      g.player.vx = g.player.vz = 0;
    };
    window.__hp = () => g.session.vitals.health;
    window.__fresh();
  }, AT);
  await D(() => window.__dead.advance(6)); // the opening banner gone
  if (!process.env.HUD) await page.addStyleTag({ content: '.ds-hud, .ds-touch-layer, .ds-prompt { opacity: 0 !important; }' });
  S.sheet = await S.context.newPage();
}

const shoot = async (tiles, name, cols = 2) => {
  const sheet = S.sheet;
  await sheet.setViewportSize({ width: w * cols, height: (h + 22) * Math.ceil(tiles.length / cols) });
  await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px);font:13px sans-serif;color:#eee">${tiles
    .map((t) => `<div><div style="height:22px;line-height:22px;padding-left:6px">${t.label}</div><img src="${t.src}" width="${w}" height="${h}" style="display:block"></div>`)
    .join('')}</body>`);
  await sheet.screenshot({ path: `${out}/${name}.png` });
  console.log('wrote', `${out}/${name}.png`);
};
const tile = async (label) => ({ label, src: `data:image/png;base64,${(await S.page.screenshot()).toString('base64')}` });

// ---------------------------------------------------------------------------------------------------------
// the sheets
// ---------------------------------------------------------------------------------------------------------

async function plainSheet() {
  const tiles = [];
  const rows = [['shambler', 0, 4, 'shamblers, looks 1-4'], ['shambler', 4, 4, 'shamblers, looks 5-8'], ['runner', 0, 4, 'runners'], ['armored', 0, 3, 'the heavy ones']];
  for (const [type, from, n, label] of rows) {
    await D(({ AT, type, from, n, FACE }) => {
      window.__fresh();
      for (let i = 0; i < n; i++) window.__stand(type, '', AT.x + 3.6, AT.z + (i - (n - 1) / 2) * 1.2, FACE, from + i);
      window.__dead.advance(0.1);
    }, { AT, type, from, n, FACE });
    tiles.push(await tile(`plain townspeople: ${label}, at 3.6 m`));
  }
  await shoot(tiles, 'kind-plain');
}

async function kindSheet(id) {
  const type = KINDS[id];
  const tiles = [];
  // close: two of them side by side (two looks), one turned side-on
  await D(({ AT, type, id, FACE }) => {
    window.__fresh();
    window.__stand(type, id, AT.x + 4, AT.z - 0.9, FACE, 0);
    window.__stand(type, id, AT.x + 4.4, AT.z + 0.9, FACE + 1.2, id === 'gruzchik' ? 0 : 1);
    // the house spirit is looked at as it is once it has shown itself (its unseen self is the last tile)
    for (const q of window.__dead.game.zombies.zombies) q.hidden = false;
    window.__dead.advance(0.1);
  }, { AT, type, id, FACE });
  tiles.push(await tile(`${id} (on ${type}): at 4 m, front and side`));
  // at fifteen metres, between two plain ones of its type
  await D(({ AT, type, id, FACE }) => {
    window.__fresh();
    window.__stand(type, '', AT.x + 15, AT.z - 2.2, FACE, 1);
    window.__stand(type, id, AT.x + 15, AT.z, FACE, 0);
    window.__stand(type, '', AT.x + 15, AT.z + 2.2, FACE, 2);
    for (const q of window.__dead.game.zombies.zombies) q.hidden = false;
    window.__dead.advance(0.1);
  }, { AT, type, id, FACE });
  tiles.push(await tile(`${id}: at 15 m, a plain ${type} either side`));
  // coming on
  await D(({ AT, type, id, FACE }) => {
    window.__fresh();
    const d = window.__dead;
    const q = window.__z(d.spawnZombie(type, AT.x + 11, AT.z + 0.5, true, id, FACE));
    // nobody throws, casts, charges or whistles for this one: it is the walk that is looked at
    q.actCd = 99;
    q.chargeCd = 99;
    q.whistled = true;
    d.advance(id === 'ryazhenye' || id === 'domovoi' ? 1.0 : 2.4);
  }, { AT, type, id, FACE });
  tiles.push(await tile(`${id}: coming on`));
  // its own moment
  const moment = await D(({ AT, type, id, FACE }) => {
    window.__fresh();
    const d = window.__dead;
    const until = (q, test, max = 600) => {
      for (let i = 0; i < max && !test(q); i++) d.advance(1 / 60);
    };
    if (id === 'gruzchik') {
      const a = window.__stand(type, id, AT.x + 4, AT.z, FACE);
      d.strikeZombie(a, 60, true);
      d.advance(1.4);
      return 'the crate broken by a heavy blow';
    }
    if (id === 'domovoi') {
      window.__stand(type, id, AT.x + 7, AT.z, FACE);
      d.advance(0.2);
      return 'standing unseen at 7 m, in the middle of the picture';
    }
    if (id === 'svistok') {
      const q = window.__z(d.spawnZombie(type, AT.x + 7, AT.z, false, id, FACE));
      until(q, (z) => z.state === 'alert' && z.stateTime > 0.55);
      return 'blowing his whistle';
    }
    if (id === 'kassirsha' || id === 'rybak') {
      const q = window.__z(d.spawnZombie(type, AT.x + 9, AT.z, true, id, FACE));
      q.actCd = 0;
      until(q, (z) => z.state === 'attack' && z.attackTime > (id === 'rybak' ? 1.25 : 0.55));
      return id === 'rybak' ? 'the line on the player, reeling' : 'the wind-up of a throw';
    }
    const q = window.__z(d.spawnZombie(type, AT.x + (id === 'dvornik' ? 3.4 : 2.6), AT.z, true, id, FACE));
    q.whistled = true;
    until(q, (z) => z.state === 'attack' && z.poseT > 0.45);
    return 'the blow';
  }, { AT, type, id, FACE });
  tiles.push(await tile(`${id}: ${moment}`));
  await shoot(tiles, `kind-${id}`);
}

// ---------------------------------------------------------------------------------------------------------
// the habits, with numbers
// ---------------------------------------------------------------------------------------------------------

const HABITS = {
  // the whistle: who was told, and what they were told
  svistok: () =>
    D(({ AT, FACE }) => {
      window.__fresh();
      const d = window.__dead;
      const g = d.game;
      // three turned away at 12, 25 and 38 m from him, one at 52 m (beyond the whistle, and beyond a neighbour's stir); none of them can see anyone
      const guard = window.__z(d.spawnZombie('armored', AT.x + 12, AT.z, false, 'svistok', FACE));
      const others = [12, 25, 38, 52].map((r) => {
        const q = window.__z(d.spawnZombie('shambler', guard.x + r * 0.6, guard.z + r * 0.8, false, '', -FACE));
        q.sightScale = 0;
        return { r, q };
      });
      let stood = 0;
      let whistled = -1;
      for (let i = 0; i < 360; i++) {
        d.advance(1 / 60);
        if (guard.whistled && whistled < 0) whistled = i / 60;
        if (guard.state === 'alert' && guard.whistled) stood += 1 / 60;
      }
      const p = g.player;
      return {
        whistledAfter: +whistled.toFixed(2),
        stoodFor: +stood.toFixed(2),
        told: others.map(({ r, q }) => ({ metresFromGuard: r, state: q.state, quarryIsThePlayer: Math.hypot(q.quarry.x - p.x, q.quarry.z - p.z) < 1.5 })),
      };
    }, { AT, FACE }),

  // the throw: standing still it lands; side-stepping after her aim is set it misses; with no clear line she does not throw
  kassirsha: () =>
    D(({ AT, FACE }) => {
      const d = window.__dead;
      const g = d.game;
      const p = g.player;
      const one = (move) => {
        window.__fresh();
        const q = window.__z(d.spawnZombie('shambler', AT.x + 12, AT.z, true, 'kassirsha', FACE));
        q.actCd = 0;
        let windup = 0;
        let flight = 0;
        let threwAt = -1;
        let hitAt = -1;
        const hp0 = window.__hp();
        for (let i = 0; i < 300 && hitAt < 0; i++) {
          d.advance(1 / 60);
          if (q.state === 'attack' && q.act === 1) {
            if (q.attackTime <= 0.7) windup = q.attackTime;
            if (move && q.attackTime > 0.3) p.z += 4.3 / 60; // a walk to the side, from the moment her aim is set
          }
          if (q.shot.live && threwAt < 0) threwAt = i;
          if (q.shot.live) flight++;
          if (window.__hp() < hp0) hitAt = i;
          if (threwAt >= 0 && !q.shot.live && i > threwAt + 2) break;
        }
        return { damage: +(hp0 - window.__hp()).toFixed(1), windup: +windup.toFixed(2), flightSeconds: +(flight / 60).toFixed(2), fromMetres: +Math.hypot(q.x - AT.x, q.z - AT.z).toFixed(1) };
      };
      const still = one(false);
      const stepped = one(true);
      // no clear line: somewhere 10-14 m off with something solid between (the stage, a kiosk, the tree)
      let cover = null;
      for (const from of [[-44, 0], [-20, 20], [20, 12], [27, -8], [-30, 30]]) {
        window.__fresh(from[0], from[1]);
        const world = g.level.world;
        let spot = null;
        for (let r = 10; r <= 14 && !spot; r += 1) {
          for (let a = 0; a < 6.28 && !spot; a += 0.1) {
            const x = p.x + Math.cos(a) * r;
            const z = p.z + Math.sin(a) * r;
            if (world.circleBlocked(x, z, 0.5, 0.3, 1.8)) continue;
            if (world.segmentBlocked(x, 1.5, z, p.x, 1.3, p.z, 'shots')) spot = { x: +x.toFixed(1), z: +z.toFixed(1) };
          }
        }
        if (!spot) continue;
        const q = window.__z(d.spawnZombie('shambler', spot.x, spot.z, true, 'kassirsha'));
        q.actCd = 0;
        let threwBlind = false;
        let blockedFor = 0;
        for (let i = 0; i < 180; i++) {
          const blocked = world.segmentBlocked(q.x, q.y + 1.5, q.z, p.x, p.eyeY() - 0.3, p.z, 'shots');
          const was = q.act === 1;
          d.advance(1 / 60);
          if (blocked) blockedFor += 1 / 60;
          // a throw begun on a frame when there was no line to them
          if (blocked && !was && q.act === 1) threwBlind = true;
        }
        cover = { player: from, she: spot, secondsWithNoLine: +blockedFor.toFixed(2), threwWithNoLine: threwBlind, movedMetres: +Math.hypot(q.x - spot.x, q.z - spot.z).toFixed(1) };
        break;
      }
      // closer than six metres: a blow, not a throw
      window.__fresh();
      const q = window.__z(d.spawnZombie('shambler', AT.x + 4, AT.z, true, 'kassirsha', FACE));
      q.actCd = 0;
      let threw = false;
      for (let i = 0; i < 240; i++) {
        d.advance(1 / 60);
        if (q.act === 1) threw = true;
      }
      return { standingStill: still, sideStepping: stepped, behindCover: cover, close: { threw, damage: +(100 - window.__hp()).toFixed(1), endedMetres: +Math.hypot(q.x - p.x, q.z - p.z).toFixed(1) } };
    }, { AT, FACE }),

  // the crate: what a 50-point blow takes off him from the front, from behind, and after a heavy one
  gruzchik: () =>
    D(({ AT, FACE }) => {
      window.__fresh();
      const d = window.__dead;
      const id = window.__stand('armored', 'gruzchik', AT.x + 3, AT.z, FACE);
      const q = window.__z(id);
      d.advance(0.05);
      const withCrate = q.rig.skinnedMesh.geometry.attributes.position.count;
      const front = d.strikeZombie(id, 50);
      d.teleport(AT.x + 6, AT.z, Math.PI / 2);
      const behind = d.strikeZombie(id, 50);
      d.teleport(AT.x, AT.z, -Math.PI / 2);
      const armorBefore = q.frontArmor;
      const heavy = d.strikeZombie(id, 50, true);
      const after = d.strikeZombie(id, 50);
      d.advance(0.1);
      const without = q.rig.skinnedMesh.geometry.attributes.position.count;
      // a charge: his top speed against his walk, and what being run down costs
      window.__fresh();
      const c = window.__z(d.spawnZombie('armored', AT.x + 11, AT.z, true, 'gruzchik', FACE));
      c.chargeCd = 0;
      let top = 0;
      let charged = 0;
      for (let i = 0; i < 300; i++) {
        d.advance(1 / 60);
        if (c.poseMode === 'charge') {
          charged += 1 / 60;
          top = Math.max(top, Math.hypot(c.vx, c.vz));
        }
      }
      return { from50: { front, behind, theHeavyBlowItself: heavy, frontAfterIt: after }, frontArmor: { before: armorBefore, after: q.frontArmor }, crateBroken: q.crateBroken, vertices: { withCrate, without }, charge: { topSpeed: +top.toFixed(1), walk: +c.def.speedChase.toFixed(1), seconds: +charged.toFixed(2), damage: +(100 - window.__hp()).toFixed(1) } };
    }, { AT, FACE }),

  // the reel: how far the player is moved, with the game's own wiring and without it
  rybak: () =>
    D(({ AT, FACE }) => {
      const d = window.__dead;
      const g = d.game;
      const p = g.player;
      const one = (wired, walkAway) => {
        window.__fresh();
        if (!wired) delete g.zenv.pull;
        const q = window.__z(d.spawnZombie('shambler', AT.x + 10, AT.z, true, 'rybak', FACE));
        q.actCd = 0;
        let windup = 0;
        let reel = 0;
        let x0 = p.x;
        let hooked = false;
        let cd = 0;
        for (let i = 0; i < 400; i++) {
          // (walking away: from the moment the hook is in)
          if (walkAway && q.reelT > 0 && !hooked) {
            d.look(Math.PI / 2, 0);
            d.hold({ forward: 1 });
          }
          d.advance(1 / 60);
          if (q.state === 'attack' && q.act === 2) {
            if (q.attackTime <= 0.8) {
              windup = q.attackTime;
              x0 = p.x;
            }
            if (q.reelT > 0) {
              reel += 1 / 60;
              hooked = true;
            }
          } else if (hooked) {
            cd = q.actCd;
            // let the last of it run out
            for (let j = 0; j < 20; j++) d.advance(1 / 60);
            break;
          }
        }
        d.hold({ forward: 0 });
        return { windup: +windup.toFixed(2), reelSeconds: +reel.toFixed(2), movedTowardHim: +(p.x - x0).toFixed(2), damage: +(100 - window.__hp()).toFixed(1), nextCastIn: +cd.toFixed(1) };
      };
      return { wiredStandingStill: one(true, false), wiredWalkingAway: one(true, true), unwiredYank: one(false, false) };
    }, { AT, FACE }),

  // the house spirit: unseen until six metres, and its first blow
  domovoi: () =>
    D(({ AT, FACE }) => {
      window.__fresh();
      const d = window.__dead;
      const id = d.spawnZombie('runner', AT.x + 12, AT.z, false, 'domovoi', FACE);
      const q = window.__z(id);
      d.advance(1);
      const mesh = q.rig.skinnedMesh;
      const unseen = { hidden: q.hidden, opacity: mesh.material.opacity, transparent: mesh.material.transparent, castsShadow: mesh.castShadow, moved: +Math.hypot(q.x - (AT.x + 12), q.z - AT.z).toFixed(2) };
      // walk up to it, five centimetres a frame
      let shownAt = -1;
      for (let i = 0; i < 200 && shownAt < 0; i++) {
        d.teleport(d.game.player.x + 0.05, AT.z, -Math.PI / 2);
        d.advance(1 / 60);
        if (!q.hidden) shownAt = Math.hypot(q.x - d.game.player.x, q.z - d.game.player.z);
      }
      d.advance(0.05);
      const shown = { atMetres: +shownAt.toFixed(2), opacity: mesh.material.opacity, state: q.state };
      const hits = [];
      let hp = window.__hp();
      for (let i = 0; i < 400 && hits.length < 2; i++) {
        d.advance(1 / 60);
        if (window.__hp() < hp) {
          hits.push(+(hp - window.__hp()).toFixed(1));
          hp = window.__hp();
        }
      }
      return { unseen, shown, firstTwoBlows: hits, plainBlow: q.def.damage };
    }, { AT, FACE }),

  // the yard-keeper's reach and the swimmer's weight, against a plain heavy one
  heavies: () =>
    D(({ AT, FACE }) => {
      const d = window.__dead;
      const reach = (kind) => {
        window.__fresh();
        const q = window.__z(d.spawnZombie('armored', AT.x + 7, AT.z, true, kind, FACE));
        let from = -1;
        for (let i = 0; i < 600 && from < 0; i++) {
          d.advance(1 / 60);
          if (q.state === 'attack') from = Math.hypot(q.x - d.game.player.x, q.z - d.game.player.z);
        }
        for (let i = 0; i < 90; i++) d.advance(1 / 60);
        return { strikesFromMetres: +from.toFixed(2), blow: +(100 - window.__hp()).toFixed(1), hp: q.maxHp, chase: +q.def.speedChase.toFixed(2) };
      };
      const stagger = (kind) => {
        window.__fresh();
        const id = window.__stand('armored', kind, AT.x + 5, AT.z, FACE);
        d.strikeZombie(id, 120);
        return window.__z(id).state;
      };
      return { plain: { ...reach(''), after120: stagger('') }, dvornik: { ...reach('dvornik'), after120: stagger('dvornik') }, morzh: { ...reach('morzh'), after120: stagger('morzh') } };
    }, { AT, FACE }),

  // what a special kind costs to draw: one mesh, the shared material
  cost: () =>
    D(async ({ AT, FACE }) => {
      window.__fresh();
      const res = {};
      // what baking the map's looks costs when the level loads (every plain look, every kind's)
      const Z = await import('/src/enemies/zombie/zarya.ts');
      const t0 = performance.now();
      let baked = 0;
      for (const [type, n] of Object.entries(Z.ZARYA_VARIANT_COUNT)) if (type !== 'warden') for (let i = 0; i < n; i++, baked++) Z.buildZaryaVariant(type, i).dispose();
      const t1 = performance.now();
      const base = { ryazhenye: 'runner', svistok: 'armored', kassirsha: 'shambler', gruzchik: 'armored', dvornik: 'armored', rybak: 'shambler', morzh: 'armored', domovoi: 'runner' };
      for (const [kind, n] of Object.entries(Z.ZARYA_KIND_COUNT)) for (let i = 0; i < n; i++, baked++) Z.buildZaryaVariant(base[kind], i, kind).dispose();
      res.bake = { looks: baked, plainMs: Math.round(t1 - t0), kindsMs: Math.round(performance.now() - t1) };
      const kinds = { '': 'shambler', ryazhenye: 'runner', svistok: 'armored', kassirsha: 'shambler', gruzchik: 'armored', dvornik: 'armored', rybak: 'shambler', morzh: 'armored', domovoi: 'runner' };
      for (const [kind, type] of Object.entries(kinds)) {
        const q = window.__z(window.__stand(type, kind, AT.x + 6, AT.z, FACE, 0));
        let meshes = 0;
        const mats = new Set();
        q.rig.root.traverse((o) => {
          if (o.isMesh) {
            meshes++;
            mats.add(o.material.name);
          }
        });
        res[kind || 'plain'] = { meshes, materials: [...mats].join(','), triangles: q.rig.skinnedMesh.geometry.index.count / 3 };
        window.__dead.clearZombies();
      }
      return res;
    }, { AT, FACE }),
};

// ---------------------------------------------------------------------------------------------------------

const jobs = [];
if (process.env.LOOKS !== '0') {
  if (!want || want.includes('plain')) jobs.push(['sheet plain', plainSheet]);
  for (const id of Object.keys(KINDS)) if (!want || want.includes(id)) jobs.push([`sheet ${id}`, () => kindSheet(id)]);
}
const numbers = {};
if (process.env.HABITS !== '0') {
  for (const [name, fn] of Object.entries(HABITS)) {
    if (want && !want.includes(name)) continue;
    jobs.push([`habit ${name}`, async () => void (numbers[name] = await fn())]);
  }
}
let failed = 0;
for (const [name, job] of jobs) {
  for (let attempt = 1; ; attempt++) {
    try {
      if (!S) await open();
      await job();
      break;
    } catch (e) {
      console.log(`${name}: attempt ${attempt} failed: ${String(e && e.message ? e.message : e).slice(0, 200)}`);
      await S?.browser.close().catch(() => {});
      S = null;
      if (attempt >= 5) {
        failed++;
        break;
      }
    }
  }
}
if (Object.keys(numbers).length) console.log(JSON.stringify(numbers, null, 1));
let errors = 0;
for (const l of S?.logs ?? []) {
  if (l.type !== 'pageerror' && l.type !== 'error') continue;
  if (/502|Failed to load resource/.test(l.text)) continue;
  errors++;
  console.log(`[${l.type}] ${l.text.slice(0, 300)}`);
}
console.log(`jobs failed: ${failed}; console errors in the last page: ${errors}`);
await S?.browser.close();
process.exit(failed ? 1 : 0);
