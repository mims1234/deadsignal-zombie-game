#!/usr/bin/env node
/**
 * Checks for the admin page's Visibility switches: what a player is told (only what is open), what an admin can switch,
 * and that the server refuses what is off - runs, the card hunt, story missions, leaderboards of an admin-only map,
 * the bestiary page, co-op sessions (co-op itself, a way to host, a map, a mode) and the join-link lookup.
 * Start a throwaway server first (it switches things and puts them back):
 *   PORT=3077 DEV_LOGIN=1 ADMIN_IDS=9000000009 DB_FILE=/tmp/qa-vis.db node server/index.mjs
 *   QA_SERVER=http://127.0.0.1:3077 node scripts/qa-visibility.mjs
 */
import WebSocket from 'ws';

const B = process.env.QA_SERVER || 'http://127.0.0.1:3077';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A browser: a cookie jar, GET and POST. */
function client() {
  const jar = new Map();
  const send = async (path, opts = {}) => {
    const headers = { ...(opts.headers || {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    const r = await fetch(B + path, { redirect: 'manual', ...opts, headers });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const v = kv.slice(i + 1);
      if (v) jar.set(kv.slice(0, i), v);
      else jar.delete(kv.slice(0, i));
    }
    let body = null;
    const text = await r.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: r.status, body };
  };
  const c = {
    jar,
    get: (p) => send(p),
    post: (p, b) => send(p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ds': '1' }, body: JSON.stringify(b ?? {}) }),
    cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
  };
  return c;
}

/** A co-op connection for a signed-in client; `inbox` collects everything received. */
async function socket(c) {
  const ws = new WebSocket(B.replace('http', 'ws') + '/ws', { headers: { cookie: c.cookie() } });
  const s = { ws, inbox: [], room: null };
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    s.inbox.push(m);
    if (m.t === 'room') s.room = m.room;
  });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  s.send = (m) => ws.send(JSON.stringify(m));
  /** Send and wait for a room or an error. */
  s.ask = async (m) => {
    const n = s.inbox.length;
    s.send(m);
    for (let i = 0; i < 40; i++) {
      await sleep(50);
      const got = s.inbox.slice(n).find((x) => x.t === 'room' || x.t === 'error');
      if (got) return got;
    }
    return null;
  };
  return s;
}

const anon = client();
const player = client();
const admin = client();
await player.get('/auth/dev?id=5000000005&name=Player');
await admin.get('/auth/dev?id=9000000009&name=Admin');
const sw = (id, on) => admin.post(`/api/admin/visibility/${id}`, { public: on });

// ---- what each is told ----
let r = await anon.get('/api/me');
check('signed out: told what is open', Array.isArray(r.body.openMaps) && Array.isArray(r.body.openSwitches) && typeof r.body.boards === 'boolean');
check('signed out: never told what is hidden', r.body.lockedMaps === undefined && r.body.lockedFilms === undefined && r.body.lockedSwitches === undefined);
r = await player.get('/api/me');
check('a player: never told what is hidden', r.body.user && r.body.lockedMaps === undefined && !r.body.openMaps.includes('aurelia'));
r = await admin.get('/api/me');
check('an admin: told what is off too', r.body.admin === true && r.body.lockedMaps.includes('aurelia'));

// ---- the Visibility tab ----
r = await player.get('/api/admin/visibility');
check('a player cannot read the switches (the admin routes are not there for them)', [401, 403, 404].includes(r.status) && !r.body?.groups, `status ${r.status}`);
r = await admin.get('/api/admin/visibility');
const keys = (r.body.groups || []).map((g) => g.key);
check('the admin sees every group', ['maps', 'films', 'modes', 'hosting', 'stories', 'features', 'pages'].every((k) => keys.includes(k)), keys.join(','));
r = await admin.post('/api/admin/visibility/nope', { public: false });
check('an unknown switch is refused', r.status === 404);
r = await admin.post('/api/admin/visibility/roam', { public: 'yes' });
check('a switch needs true or false', r.status === 400);

// ---- modes: Free roam, the card hunt ----
await sw('roam', false);
r = await player.get('/api/me');
check('Free roam off: not open to a player', !r.body.openSwitches.includes('roam'));
r = await player.post('/api/runs', { mode: 'roam', map: 'district' });
check('Free roam off: a player cannot start a run', r.status === 403);
r = await admin.post('/api/runs', { mode: 'roam', map: 'district' });
check('Free roam off: an admin still can', r.status === 200 && r.body.id > 0);
await sw('roam', true);
r = await player.post('/api/runs', { mode: 'roam', map: 'district' });
check('Free roam back on: a player can again', r.status === 200);

await sw('cards', false);
r = await player.post('/api/runs', { mode: 'cards', map: 'district' });
check('card hunt off: a player cannot start one', r.status === 403);
await sw('cards', true);
r = await player.post('/api/runs', { mode: 'cards', map: 'district' });
check('card hunt on: a player can', r.status === 200);
const cardRun = r.body.id;
await sw('cards', false);
r = await player.post(`/api/runs/${cardRun}/card`, { card: 'shiroko' });
check('card hunt switched off mid-run: no card recorded', r.status === 403);
await sw('cards', true);

// ---- a story mission (on the Sakura District, opened for the test) ----
await sw('sakura', true);
await sw('story-kaika', false);
r = await player.post('/api/runs', { mode: 'standard', map: 'sakura', story: 'kaika' });
check('a story off: a player cannot play it', r.status === 403);
r = await player.post('/api/runs', { mode: 'standard', map: 'sakura', story: 'curtain' });
check('another story still plays', r.status === 200);
await sw('story-kaika', true);
await sw('sakura', false);
r = await player.post('/api/runs', { mode: 'standard', map: 'sakura' });
check('an admin-only map: a player cannot play it', r.status === 403);

// ---- leaderboards of an admin-only map ----
r = await player.get('/api/leaderboards?map=aurelia&mode=solo&metric=kills');
check('admin-only map: no board for a player', r.status === 404);
r = await anon.get('/api/leaderboards?map=aurelia&mode=solo&metric=kills');
check('admin-only map: no board signed out', r.status === 404);
r = await admin.get('/api/leaderboards?map=aurelia&mode=solo&metric=kills');
check('admin-only map: an admin sees its board', r.status === 200);
r = await player.get('/api/leaderboards?map=district&mode=solo&metric=kills');
check('a live map: its board for everyone', r.status === 200);

// ---- pages ----
r = await anon.get('/anime/README.md');
check('the models\' notes are not served', r.status === 404);
r = await anon.get('/bestiary.html');
const bestiaryServed = r.status === 200;
await sw('bestiary', false);
r = await player.get('/bestiary.html');
check('bestiary off: not served to a player', !bestiaryServed || r.status === 404, `status ${r.status}`);
r = await admin.get('/bestiary.html');
check('bestiary off: still served to an admin', !bestiaryServed || r.status === 200, `status ${r.status}`);
r = await anon.get('/sitemap.xml');
check('bestiary off: not in the sitemap', r.status !== 200 || !String(r.body).includes('/bestiary.html<'));
await sw('bestiary', true);

// ---- co-op hosting: one way always stays on ----
r = await sw('host-self', false);
check('self host can be switched off', r.status === 200 && r.body.public === false);
r = await sw('host-server', false);
check('the last way to host cannot be switched off', r.status === 409);
await sw('host-self', true);

// ---- co-op sessions ----
const ps = await socket(player);
const as = await socket(admin);
await sw('coop', false);
let m = await ps.ask({ t: 'create', hosting: 'self', map: 'district', kind: 'mission' });
check('co-op off: a player cannot open a session', m?.t === 'error' && /not open/i.test(m.msg), m?.msg);
m = await as.ask({ t: 'create', hosting: 'self', map: 'district', kind: 'mission', visibility: 'public' });
check('co-op off: an admin can', m?.t === 'room');
const code1 = as.room.code;
m = await ps.ask({ t: 'join', code: code1 });
check('co-op off: a player cannot join an admin\'s session', m?.t === 'error');
r = await player.get(`/api/rooms/${code1}`);
check('co-op off: the join link shows nothing to a player', r.status === 404);
as.send({ t: 'manage', op: 'invite', id: '5000000005' });
await sleep(150);
m = await ps.ask({ t: 'join', code: code1 });
check('co-op off: an invited player still comes in', m?.t === 'room');
ps.send({ t: 'leave' });
as.send({ t: 'manage', op: 'end' });
await sleep(200);
await sw('coop', true);

// an admin-only map
m = await ps.ask({ t: 'create', hosting: 'self', map: 'aurelia', kind: 'mission' });
check('admin-only map: a player cannot open a session on it', m?.t === 'error');
m = await ps.ask({ t: 'create', hosting: 'self', map: 'not-a-map', kind: 'mission' });
check('an unknown map is the District', m?.t === 'room' && ps.room.map === 'district');
ps.send({ t: 'manage', op: 'end' });
await sleep(200);
m = await as.ask({ t: 'create', hosting: 'self', map: 'aurelia', kind: 'mission', visibility: 'public' });
const code2 = as.room?.code;
m = await ps.ask({ t: 'join', code: code2 });
check('admin-only map: a player cannot join a public session on it', m?.t === 'error');
r = await player.get(`/api/rooms/${code2}`);
check('admin-only map: its join link shows nothing to a player', r.status === 404);
as.send({ t: 'manage', op: 'invite', id: '5000000005' });
await sleep(150);
r = await player.get(`/api/rooms/${code2}`);
check('admin-only map: an invited player sees the session', r.status === 200 && r.body.map === 'aurelia');
m = await ps.ask({ t: 'join', code: code2 });
check('admin-only map: an invited player comes in', m?.t === 'room');
ps.send({ t: 'leave' });
as.send({ t: 'manage', op: 'end' });
await sleep(200);

// a mode that is off
await sw('roam', false);
m = await ps.ask({ t: 'create', hosting: 'self', map: 'district', kind: 'roam' });
check('Free roam off: a player cannot open a free-roam session', m?.t === 'error');
m = await ps.ask({ t: 'create', hosting: 'self', map: 'district', kind: 'mission' });
ps.send({ t: 'manage', op: 'config', value: 'roam' });
await sleep(200);
check('Free roam off: a player cannot switch their session to it', ps.room?.kind === 'mission', ps.room?.kind);
ps.send({ t: 'manage', op: 'end' });
await sleep(150);
await sw('roam', true);

// a way to host that is off
await sw('host-self', false);
m = await ps.ask({ t: 'create', hosting: 'self', map: 'district', kind: 'mission' });
check('self host off: a player cannot self host', m?.t === 'error' && /self host/i.test(m.msg), m?.msg);
await sw('host-self', true);

// an invite gets past a switch only from an admin owner: a player who inherits the session cannot hand it out
const other = client();
await other.get('/auth/dev?id=6000000006&name=Other');
const os = await socket(other);
// server hosted: when its owner leaves, the session carries on under the next player
m = await as.ask({ t: 'create', hosting: 'server', map: 'aurelia', kind: 'mission', visibility: 'public' });
const code3 = as.room?.code;
as.send({ t: 'manage', op: 'invite', id: '5000000005' });
await sleep(150);
m = await ps.ask({ t: 'join', code: code3 });
check('admin-only map: invited player in', m?.t === 'room');
as.send({ t: 'leave' });
await sleep(250);
check('the player now owns the session', JSON.stringify(ps.room ?? {}).includes('5000000005') && !JSON.stringify(ps.room ?? {}).includes('9000000009'), JSON.stringify(ps.room?.owner ?? ps.room?.ownerId ?? null));
ps.send({ t: 'manage', op: 'invite', id: '6000000006' });
await sleep(150);
m = await os.ask({ t: 'join', code: code3 });
check('a player owner\'s invite does not get anyone onto an admin-only map', m?.t === 'error', m?.msg);
ps.send({ t: 'leave' });
await sleep(200);

// switching something off ends the players' sessions it closes
m = await ps.ask({ t: 'create', hosting: 'self', map: 'district', kind: 'mission' });
check('a player opens a session', m?.t === 'room');
const before = ps.inbox.length;
await sw('coop', false);
await sleep(300);
check('co-op switched off: the player\'s session ends', ps.inbox.slice(before).some((x) => x.t === 'closed'));
r = await player.post('/api/runs', { mode: 'coop', map: 'district' });
check('co-op off: no co-op run recorded for a player', r.status === 403);
r = await player.get('/api/leaderboards?map=district&mode=coop&metric=kills');
check('co-op off: no co-op board for a player', r.status === 404);
await sw('coop', true);
r = await player.get('/api/leaderboards?map=district&mode=coop&metric=kills');
check('co-op on: its board is back', r.status === 200);

os.ws.close();
ps.ws.close();
as.ws.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
