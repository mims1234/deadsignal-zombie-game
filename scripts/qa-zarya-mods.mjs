// ZARYA: the kiosk shutters, the weapon mods and the repair booth, checked in the running game (one screenshot per
// step, and a line per check). The story is set straight into Act II with every zone open; nothing hunts.
//
//   node scripts/qa-zarya-mods.mjs [url] [w] [h]      default http://127.0.0.1:5183/ at 1280x720
//   QA_TOUCH=1 ...                                     as a phone
//
// Writes shots/zarya-mods/*.png (SC picks another folder).
import { mkdirSync } from 'node:fs';
import { openPage } from './lib/browser.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5183/';
const w = Number(process.argv[3] ?? 1280);
const h = Number(process.argv[4] ?? 720);
const touch = !!process.env.QA_TOUCH;
const out = process.env.SC ?? 'shots/zarya-mods';
mkdirSync(out, { recursive: true });

const { browser, page, logs } = await openPage({ url: `${base}?nolock${touch ? '&touch=1' : ''}`, w, h });
const D = (fn, ...args) => page.evaluate(fn, ...args);
const advance = (s) => D((s) => window.__dead.advance(s), s);
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
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

const N = await D(async () => {
  const st = await import('/src/zarya/story.ts');
  const md = await import('/src/zarya/mods.ts');
  const pl = await import('/src/zarya/places.ts');
  return JSON.parse(JSON.stringify({ SHUTTERS: st.SHUTTERS, MOD_PARTS: st.MOD_PARTS, BENCHES: st.BENCHES, G: st.G, KBIT: st.KBIT, STORY: st.STORY, RYNOK: pl.RYNOK, GARAGES: pl.GARAGES, DVOR: pl.DVOR, MOD: md.MOD }));
});
const { SHUTTERS, MOD_PARTS, BENCHES, G, KBIT, STORY, RYNOK, GARAGES, DVOR, MOD } = N;

// Act II, every zone open (tickets, the pond road, the three chains), the town asleep; nothing hunts
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
}, G);
await advance(1);
if (!process.env.HUD) await page.addStyleTag({ content: '.ds-touch-layer { opacity: 0.25 !important; }' });

const state = () => D(() => {
  const g = window.__dead.game;
  const v = g.zarya.view;
  const pr = g.io?.prompt ?? null;
  const inv = g.session.inv;
  const c = inv.slots[inv.activeSlot];
  return {
    k: v.k, m: v.m, cash: inv.cash, prompt: pr?.text ?? null, sub: pr?.sub ?? '', can: !!pr && pr.key !== '',
    gun: c ? { id: c.id, mag: c.ammo.mag, magSize: c.ammo.magSize, reserve: c.ammo.reserve, reserveMax: c.ammo.reserveMax } : null,
    label: (() => { const hs = { weapon: g.weapons.hudInfo(inv.activeSlot) }; g.zarya.kiosks.decorate(hs); return hs.weapon?.tierLabel ?? null; })(), draws: g.renderer.renderer.info.render.calls,
  };
});
/** Stand `back` metres out in front of a spot that faces `yaw`, looking at it. */
const front = async (at, yaw, back = 1.6, wait = 0.5) => {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  await D(([x, z, tx, tz]) => { const d = window.__dead; d.clearZombies(); d.setHealth(100, 100); d.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))); }, [at.x + fx * back, at.z + fz * back, at.x, at.z]);
  await advance(wait);
};
const holdUse = async (sec) => {
  await D(() => window.__dead.hold({ interact: true }));
  await advance(sec + 0.4);
  await D(() => window.__dead.releaseAll());
  await advance(0.4);
};

// ---- the shutters ----
for (let i = 0; i < SHUTTERS.length; i++) {
  const s = SHUTTERS[i];
  await D(() => {
    const inv = window.__dead.game.session.inv;
    inv.cash = 1000;
    const c = inv.slots[0];
    if (c) { c.ammo.mag = 1; c.ammo.reserve = 0; }
  });
  await front(s.at, s.yaw, 1.7);
  let st = await state();
  check(st.prompt === `BUY THE SHUTTER  $${STORY.shutter}` && st.can, `shutter ${i} (${s.zone}) offers itself`, `${st.prompt} / ${st.sub}`);
  await shot(`shut-${s.zone}`);
  await holdUse(0.9);
  st = await state();
  check((st.k & (1 << (KBIT.shutter + i))) !== 0, `shutter ${i} rolls up`, `k=${st.k}`);
  check(st.cash === 1000 - STORY.shutter, `shutter ${i} took ${STORY.shutter} points`, `cash ${st.cash}`);
  check(!!st.gun && st.gun.reserve === st.gun.reserveMax && st.gun.mag === st.gun.magSize, `shutter ${i} filled the gun in hand`, JSON.stringify(st.gun));
  await front(s.at, s.yaw, 3.2, 0.6);
  st = await state();
  check(st.prompt !== `BUY THE SHUTTER  $${STORY.shutter}`, `shutter ${i} is not offered again`);
  await shot(`open-${s.zone}`);
  console.log(`     ${s.zone}: ${st.draws} draws in front of the open kiosk`);
}
let st = await state();
check(((st.k & 0x1f) === 0x1f), 'all five shutters up');

// ---- the mod parts lying about ----
for (let i = 0; i < MOD_PARTS.length; i++) {
  const p = MOD_PARTS[i];
  await D(([x, z]) => window.__dead.teleport(x, z, 0), [p.x + 1, p.z + 0.4]);
  await advance(0.6);
  st = await state();
  check((st.k & (1 << (KBIT.part + i))) !== 0, `mod part ${i} picked up in passing`, `k=${st.k}`);
}
const parts = await D(() => window.__dead.game.zarya.view.k);
console.log(`     parts held: ${(await D(async () => (await import('/src/zarya/story.ts')).ZaryaStory.modParts(window.__dead.game.zarya.view)))}  (k=${parts})`);

// ---- the repair booth ----
const booth = RYNOK.booth;
await D(([x, z]) => { const d = window.__dead; d.teleport(x + 2.2, z + 0.3, Math.PI / 2); }, [booth.x, booth.z]);
await advance(0.6);
st = await state();
check(st.prompt === 'THE REPAIRMAN IS ASLEEP' && !st.can, 'the booth refuses with no tools back', `${st.prompt} / ${st.sub}`);
await shot('booth-none');
await D(() => { window.__dead.game.zarya.story.m |= (1 << 6) | (1 << 7); });
await advance(0.4);
st = await state();
check(st.prompt === 'THE REPAIRMAN IS ASLEEP' && /2 of his 3/.test(st.sub) && /dispatcher/.test(st.sub), 'two tools back: it says which is still out', st.sub);
await D(([x, z]) => { const d = window.__dead; d.teleport(x + 3.6, z - 3.2, Math.atan2(3.4, -2.4)); d.game.player.pitch = -0.32; }, [booth.x, booth.z]);
await advance(0.4);
await shot('booth-two');
await D(() => { window.__dead.game.zarya.story.m |= 1 << 8; });
await D(([x, z]) => { const d = window.__dead; d.teleport(x + 2.2, z + 0.3, Math.PI / 2); }, [booth.x, booth.z]);
await advance(0.5);
st = await state();
check(st.can && /ARMORY|BENCH|UPGRADE/i.test(st.prompt ?? ''), 'all three back: the booth works', st.prompt);
await D(([x, z]) => { const d = window.__dead; d.teleport(x + 3.6, z - 3.2, Math.atan2(3.4, -2.4)); d.game.player.pitch = -0.32; }, [booth.x, booth.z]);
await advance(0.4);
await shot('booth-three');
await D(([x, z]) => { const d = window.__dead; d.teleport(x + 2.1, z - 0.2, Math.atan2(2.1, -0.6)); d.game.player.pitch = -0.42; }, [booth.x, booth.z]);
await advance(0.4);
await shot('booth-close');

// ---- the mods (round 3): a big magazine and frost rounds, at any bench, saying what they will do ----
const said = await D(() => [...window.__dead.game.zarya.said].includes('modPart'));
check(said, 'the first mod part found: Timur says what the parts are for');
const benchFront = async (b) => {
  await D(([x, z]) => { const d = window.__dead; d.clearZombies(); d.teleport(x, z + 1.1, 0); }, [b.at.x, b.at.z]);
  await advance(0.5);
};
const timur = BENCHES.find((b) => b.main && Math.abs(b.at.x - GARAGES.bench.x) < 1);
const dvor = BENCHES.find((b) => Math.abs(b.at.x - DVOR.bench.x) < 1);
const mask = () => D(() => { const g = window.__dead.game; const inv = g.session.inv; return g.zarya.kiosks.mods.mask(inv.slots[inv.activeSlot]); });
await D(() => { const c = window.__dead.game.session.inv.slots[0]; c.ammo.mag = 5; c.ammo.reserve = 40; });
await benchFront(dvor);
st = await state();
check(st.prompt === 'FIT BIG MAGAZINE TO THE VX-9' && st.can, "the Dvor's bench offers a big magazine for the pistol", `${st.prompt} / ${st.sub}`);
check(/^13 -> 20 rounds a load\. Uses 1 of the squad's 7 mod parts$/.test(st.sub), 'and says what fitting it will do', st.sub);
await shot('bench-bigmag');
await holdUse(1.4);
st = await state();
check(st.gun?.magSize === 20 && st.gun?.mag === 20, 'a big magazine: 13 a load become 20, and the load in it is topped up at once', `${st.gun?.mag} / ${st.gun?.magSize}`);
check(st.label === 'BIG MAG', 'the weapon panel says BIG MAG', st.label);
await shot('hud-bigmag');
await advance(0.3);
st = await state();
check(st.prompt === 'FIT FROST ROUNDS TO THE VX-9' && st.can, 'then frost rounds', `${st.prompt} / ${st.sub}`);
check(/^Its rounds will slow what they hit for 2 seconds\./.test(st.sub), 'saying what they will do', st.sub);
await holdUse(1.4);
check(((await mask()) & 6) === 6, 'both mods on the pistol');
st = await state();
check(st.label === 'BIG MAG + FROST', 'the weapon panel names them, short', st.label);
check(!/CHARGE/.test(JSON.stringify(st)), 'nothing offers or names the Charge');
await shot('hud-mods');
// the nail gun at Timur's bench: a bigger drum, said in nails
await D(() => { const d = window.__dead; d.giveGun('gvozdomyot'); d.advance(1.2); });
await benchFront(timur);
st = await state();
check(st.prompt === 'FIT BIG MAGAZINE TO THE GVOZDOMYOT' && /^150 -> 225 nails a load/.test(st.sub), "Timur's bench: the nail gun's drum, in nails", `${st.prompt} / ${st.sub}`);
await shot('bench-nailer');
await holdUse(1.4);
st = await state();
check(st.gun?.magSize === 225, 'the nail gun holds 225 a load', `${st.gun?.magSize}`);
// a frosted round, fired: it slows what it strikes, and the frost is seen on it
await D(() => { const d = window.__dead; const g = d.game; const inv = g.session.inv; const i = inv.slots.findIndex((c) => c?.id === 'pistol'); inv.activeSlot = i; g.weapons.cancelActions(); d.advance(1.2); });
const slow = await D(() => {
  const d = window.__dead;
  const g = d.game;
  const p = g.player;
  d.clearZombies();
  d.teleport(-44, 0, -Math.PI / 2); // (out on the open square, nothing between)
  d.advance(0.2);
  const id = d.spawnZombie('shambler', p.x - Math.sin(p.yaw) * 6, p.z - Math.cos(p.yaw) * 6, false);
  const z = g.zombies.zombies.find((q) => q.id === id);
  z.maxHp = z.hp = 100000;
  z.dormant = false;
  d.advance(0.3);
  const before = z.speedScale;
  d.lookAt(z.x, z.z, z.y + 1.0);
  const m0 = g.weapons.carried.ammo.mag;
  d.click();
  d.advance(0.1);
  return { before, after: z.speedScale, id, frosted: g.zarya.kiosks.mods.frosted, gun: g.weapons.carried.id, shot: m0 - g.weapons.carried.ammo.mag, hit: 100000 - z.hp, mask: g.zarya.kiosks.mods.mask(g.weapons.carried) };
});
check(slow.gun === 'pistol' && slow.after < slow.before * 0.6, 'a frosted round, fired, slows what it hits', `${slow.gun}: ${slow.before.toFixed(2)} -> ${slow.after.toFixed(2)}; shot ${slow.shot}, hit ${slow.hit}, mask ${slow.mask}`);
check(slow.frosted === 1, 'and it is counted frosted (its glitter goes on while it is slowed)', String(slow.frosted));
await advance(0.25);
await shot('frost-on-it');
await advance(2.4);
const back = await D((id) => window.__dead.game.zombies.zombies.find((q) => q.id === id)?.speedScale ?? -1, slow.id);
check(Math.abs(back - slow.before) < 1e-6, 'and gives its pace back after two seconds', back.toFixed(2));

// what is left: 7 parts found, 3 spent
const left = await D(async () => (await import('/src/zarya/story.ts')).ZaryaStory.modParts(window.__dead.game.zarya.view));
check(left === 4, 'four parts left for the squad', String(left));
// the journal's mods section: what each does, what it needs, where the parts are, which gun has it
const journal = await D(() => window.__dead.game.menus.pauseTab().build().textContent);
check(/WEAPON MODS/.test(journal) && /4 to fit, 7 of 7 found/.test(journal), 'the journal has a mods section with the parts', journal.match(/Mod parts:[^.]*\./)?.[0] ?? '');
check(/BIG MAGAZINE: half as many rounds again in every load\. Fits any gun that loads more than one round\. On your VX-9, GVOZDOMYOT\./.test(journal), 'it says what the big magazine does, fits and is on', journal.match(/BIG MAGAZINE:[^]*?\.(?= FROST)/)?.[0] ?? '');
check(/FROST ROUNDS: whatever its rounds hit is slowed for 2 seconds\. Fits .*On your VX-9\./.test(journal), 'and frost rounds', '');
check(/shut kiosks/.test(journal) && /garage's back wall \(taken\)/.test(journal), 'and where the parts are, found or not', '');
const modsPart = journal.slice(journal.indexOf('WEAPON MODS'));
check(!/charge/i.test(modsPart), 'the journal names no Charge', modsPart.slice(0, 600));

const errs = logs.filter((l) => l.type === 'pageerror');
for (const e of errs) console.log('page error:', e.text.slice(0, 300));
console.log(`${n - fails}/${n} checks passed${errs.length ? `, ${errs.length} page errors` : ', no page errors'}`);
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
