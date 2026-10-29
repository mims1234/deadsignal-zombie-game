#!/usr/bin/env node
/**
 * Checks for guests (played without Discord): which maps they are told they may play, that they can run one of those
 * (and only solo: never co-op or the card hunt), that their runs count in the admin numbers but never rank, the tour
 * and sign-in events, the admin page's guest switch, and that signing in remembers the guest it came from.
 * Start a throwaway server first (it switches things and puts them back):
 *   PORT=3078 DEV_LOGIN=1 ADMIN_IDS=9000000009 DB_FILE=/tmp/qa-guest.db node server/index.mjs
 *   QA_SERVER=http://127.0.0.1:3078 node scripts/qa-guest.mjs
 */
import WebSocket from 'ws';

const B = process.env.QA_SERVER || 'http://127.0.0.1:3078';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

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
  return {
    jar,
    get: (p) => send(p),
    post: (p, b) => send(p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ds': '1' }, body: JSON.stringify(b ?? {}) }),
    cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
  };
}

/** Does the co-op socket upgrade for this client? */
const wsOpens = (c) =>
  new Promise((res) => {
    const ws = new WebSocket(B.replace('http', 'ws') + '/ws', { headers: { cookie: c.cookie() } });
    ws.on('open', () => {
      ws.close();
      res(true);
    });
    ws.on('error', () => res(false));
    ws.on('unexpected-response', () => res(false));
  });

const guest = client();
const player = client();
const admin = client();
await player.get('/auth/dev?id=5000000005&name=Player');
await admin.get('/auth/dev?id=9000000009&name=Admin');
const guestSw = (id, on) => admin.post(`/api/admin/visibility/${id}/guest`, { guest: on });

// ---- what a guest is told ----
let r = await guest.get('/api/me');
check('guest: told which maps it may play', Array.isArray(r.body.guestMaps), JSON.stringify(r.body.guestMaps));
check('guest: the District is open to guests by default', r.body.guestMaps?.includes('district'));
check('guest: a map that needs Discord is not', !r.body.guestMaps?.includes('forge'));
check('guest: an admin-only map is never open to guests', !r.body.guestMaps?.includes('aurelia'));

// ---- a guest's runs ----
await guest.post('/api/visit', { touch: false });
check('guest: has an anonymous id', guest.jar.has('ds_anon'));
r = await guest.post('/api/runs', { mode: 'standard', map: 'district', difficulty: 'normal', version: '0.4.316' });
const runId = r.body?.id;
check('guest: starts a run on the District', r.status === 200 && Number.isInteger(runId), `status ${r.status}`);
r = await guest.post(`/api/runs/${runId}/end`, { outcome: 'victory', stats: { timeSurvived: 120, kills: 999 } });
check('guest: ends its run', r.status === 200 && r.body.ok === true);
r = await guest.post('/api/runs', { mode: 'roam', map: 'district' });
check('guest: free roam on the District', r.status === 200);
r = await guest.post('/api/ping', {});
check('guest: pings while playing', r.status === 200);
r = await guest.post('/api/runs', { mode: 'standard', map: 'forge' });
check('guest: a map that needs Discord asks for the sign-in', r.status === 401 && r.body.error === 'login' && r.body.reason === 'map');
r = await guest.post('/api/runs', { mode: 'cards', map: 'district' });
check('guest: the card hunt asks for the sign-in', r.status === 401 && r.body.reason === 'cards');
r = await guest.post('/api/runs', { mode: 'coop', map: 'district' });
check('guest: a co-op run asks for the sign-in', r.status === 401 && r.body.reason === 'coop');
r = await guest.post('/api/runs/1/card', { card: 'x' });
check('guest: cannot record a card', r.status === 401);
r = await guest.post('/api/reports', { target: '5000000005', reason: 'spam' });
check('guest: cannot report a player', r.status === 401);
r = await guest.get('/api/rooms/ABCDEF');
check('guest: cannot look up a co-op session', r.status === 401);
check('guest: the co-op socket refuses a guest', !(await wsOpens(guest)));
check('a signed-in player still gets the co-op socket', await wsOpens(player));

// ---- guest runs: in the numbers, never on the boards ----
r = await anon(`/api/leaderboards?map=district&mode=solo&metric=kills`);
check('guest runs never rank', r.status === 200 && !(r.body.entries || []).some((e) => e.name === 'Guest'), JSON.stringify(r.body.entries));
r = await admin.get('/api/admin/overview?days=1');
check('admin overview: counts the guest players and runs', r.body.guests?.players >= 1 && r.body.guests?.runs >= 2, JSON.stringify(r.body.guests));
check('admin overview: guests are not counted as Discord players', r.body.totals.users === 2, `users ${r.body.totals.users}`);
r = await admin.get('/api/admin/players?q=guest');
check('admin players: guests are not listed', (r.body.rows || []).every((u) => !String(u.id).startsWith('guest:')));
r = await admin.get('/api/admin/runs?map=district');
check('admin runs: the guest runs are listed', (r.body.rows || []).some((x) => String(x.user_id).startsWith('guest:')));

// ---- tour and sign-in events ----
r = await guest.post('/api/event', { name: 'tour_shown' });
check('event: the tour', r.status === 200);
r = await guest.post('/api/event', { name: 'login_prompt', detail: 'coop' });
check('event: a sign-in prompt, with why', r.status === 200);
r = await guest.post('/api/event', { name: 'login_click', detail: 'forge' });
check('event: a sign-in click', r.status === 200);
r = await guest.post('/api/event', { name: 'drop_tables' });
check('event: an unknown name is refused', r.status === 400);
r = await guest.post('/api/event', { name: 'tour_step', detail: '<script>' });
check('event: an odd detail is dropped, not refused', r.status === 200);
r = await admin.get('/api/admin/overview?days=1');
check('admin overview: the funnel', r.body.guests?.funnel?.tour_shown?.n >= 1 && r.body.guests?.funnel?.login_click?.n >= 1 && r.body.guests?.prompts?.some((p) => p.reason === 'coop'), JSON.stringify(r.body.guests?.funnel));

// ---- the admin switch ----
r = await player.post('/api/admin/visibility/forge/guest', { guest: true });
check('a player cannot switch guests', r.status === 404);
r = await guestSw('nowhere', true);
check('guest switch: unknown map refused', r.status === 404);
r = await admin.post('/api/admin/visibility/forge/guest', { guest: 'yes' });
check('guest switch: not a boolean refused', r.status === 400);
r = await admin.get('/api/admin/visibility');
const mapsGroup = r.body.groups?.find((g) => g.key === 'maps');
check('admin visibility: each map has its guest switch', mapsGroup?.items.every((i) => typeof i.guest === 'boolean'));
r = await guestSw('forge', true);
check('guest switch: open the Forge to guests', r.status === 200 && r.body.guest === true && r.body.open === true);
r = await guest.get('/api/me');
check('guest: now told the Forge is open', r.body.guestMaps?.includes('forge'));
r = await guest.post('/api/runs', { mode: 'standard', map: 'forge' });
check('guest: plays the Forge now', r.status === 200);
r = await guestSw('district', false);
check('guest switch: the District back to Discord only', r.status === 200 && r.body.open === false);
r = await guest.post('/api/runs', { mode: 'standard', map: 'district' });
check('guest: refused on the District at once', r.status === 401 && r.body.reason === 'map');
r = await guestSw('aurelia', true);
check('guest switch on an admin-only map: kept, but not open', r.status === 200 && r.body.guest === true && r.body.open === false);
r = await guest.get('/api/me');
check('guest: an admin-only map stays hidden even switched to guests', !r.body.guestMaps?.includes('aurelia'));
await guestSw('forge', false);
await guestSw('district', true);
await guestSw('aurelia', false);
r = await guest.get('/api/me');
check('switches put back', r.body.guestMaps?.includes('district') && !r.body.guestMaps?.includes('forge'));

// ---- signing in remembers the guest ----
const before = guest.jar.get('ds_anon');
await guest.get('/auth/dev?id=5000000077&name=Convert');
r = await guest.get('/api/me');
check('the guest signs in', r.body.user?.id === '5000000077');
r = await admin.get('/api/admin/overview?days=1');
check('admin overview: a guest who went on to sign in', r.body.guests?.signedUp >= 1, `anon ${before}`);
r = await guest.post('/api/runs', { mode: 'standard', map: 'forge' });
check('signed in: the Forge is open', r.status === 200);

async function anon(path) {
  return client().get(path);
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
