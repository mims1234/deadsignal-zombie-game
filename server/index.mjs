/**
 * DEAD SIGNAL server: serves the built game, signs players in with Discord, records analytics, and gives the admins
 * a dashboard with bans and a report queue.
 *
 *   node --env-file=.env server/index.mjs
 *
 * Environment (see .env.example): PUBLIC_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, ADMIN_IDS, PORT, DATA_DIR.
 */
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARD_MAPS, BOARD_METRICS, BOARD_MODES, DIFFICULTIES, MODES, boardKey, openDb } from './db.mjs';
import { createRooms } from './rooms.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const env = process.env;
const PUBLIC_URL = (env.PUBLIC_URL || `http://127.0.0.1:${env.PORT || 3061}`).replace(/\/$/, '');
const SECURE = PUBLIC_URL.startsWith('https://');
const ADMIN_IDS = new Set((env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
// A local-only shortcut for development. It can never be switched on behind a real (https) address.
const DEV_LOGIN = env.DEV_LOGIN === '1' && !SECURE;
const SESSION_TTL = 30 * 86400;
const REDIRECT = `${PUBLIC_URL}/auth/discord/callback`;

const db = openDb(env.DB_FILE || join(env.DATA_DIR || join(root, 'data'), 'deadsignal.db'));
const app = Fastify({ trustProxy: true, bodyLimit: 16 * 1024, logger: { level: env.LOG_LEVEL || 'warn' } });
await app.register(cookie);

const token = () => randomBytes(32).toString('base64url');
const cookieOpts = (maxAge) => ({ path: '/', httpOnly: true, sameSite: 'lax', secure: SECURE, maxAge });
const isAdmin = (u) => !!u && ADMIN_IDS.has(u.id);

// Every map is live (every player can pick it) or admin only, switched from the dashboard; at least one is always live.
// `live`: where a map starts before an admin has switched it (the game's GATED_MAPS start admin only).
const MAPS = {
  district: { name: 'The District', live: true },
  sakura: { name: 'Sakura District', live: false },
  forge: { name: 'The Forge', live: true },
  asylum: { name: 'The Asylum', live: true },
  aurelia: { name: 'Aurelia', live: false },
};
const mapPublic = (id) => {
  const v = db.setting(`map.${id}.public`);
  return v === null ? !!MAPS[id]?.live : v === '1';
};
/** Maps only admins can play right now. */
const lockedMaps = () => Object.keys(MAPS).filter((id) => !mapPublic(id));
/** Can this player start a run or a session on the map? */
const mapOpenTo = (u, map) => mapPublic(map in MAPS ? map : 'district') || isAdmin(u); // no map named: the District, as the game reads it

// Every cinematic is public (anyone can watch it; it shows on the CINEMATICS page and in the bestiary) or admin only,
// switched from the dashboard; any number can be private. `live`: where it starts before an admin has switched it.
// `page`: its page (`/<page>.html`) and its folder of sounds and images (`/<page>/`). The game keeps the same list
// (src/films.ts).
const FILMS = {
  excalibur: { name: 'Excalibur', page: 'freeroam', live: true },
  hollow: { name: 'Slime Hollow', page: 'hollow', live: false },
};
const filmPublic = (id) => {
  const v = db.setting(`film.${id}.public`);
  return v === null ? !!FILMS[id]?.live : v === '1';
};
/** Films only admins can watch right now. */
const lockedFilms = () => Object.keys(FILMS).filter((id) => !filmPublic(id));

// Everything else players can see or pick, each live for everyone or admin only, switched from the admin page's
// Visibility tab (maps and films have their own lists above). `live`: where it starts before an admin has switched it
// (how it was before there was a switch). The game keeps the same list (src/switches.ts): it hides what is off, and
// the server refuses it here and in the co-op sessions (server/rooms.mjs).
const SWITCHES = {
  coop: { group: 'modes', name: 'Co-op (WITH FRIENDS)', live: true },
  roam: { group: 'modes', name: 'Free roam', live: true },
  cards: { group: 'modes', name: 'Mazoku card hunt (Standard Mazoku)', live: true },
  'host-server': { group: 'hosting', name: 'Co-op: server hosted', live: true },
  'host-self': { group: 'hosting', name: 'Co-op: self host', live: true },
  'story-kaika': { group: 'stories', name: 'KAIKA: The Blooming (Sakura District)', live: true },
  'story-curtain': { group: 'stories', name: 'The Crimson Curtain (Sakura District)', live: true },
  'story-lasttrain': { group: 'stories', name: 'Last Train (Sakura District)', live: true },
  'story-hanami': { group: 'stories', name: 'Hanami (Sakura District)', live: true },
  'aurelia-npc': { group: 'features', name: 'Aurelia herself, on the AURELIA map', live: true },
  bestiary: { group: 'pages', name: 'The bestiary', live: true },
  stylelab: { group: 'pages', name: 'The bestiary: STYLE LAB', live: true },
};
const switchOn = (id) => {
  const v = db.setting(`sw.${id}.public`);
  return v === null ? !!SWITCHES[id]?.live : v === '1';
};
/** Switches only admins get past right now. */
const lockedSwitches = () => Object.keys(SWITCHES).filter((id) => !switchOn(id));
/** May this user use what the switch covers (an admin always may; anything without a switch is open)? */
const switchOpenTo = (u, id) => !Object.hasOwn(SWITCHES, id) || switchOn(id) || isAdmin(u);
/** The switch a run mode or a co-op session kind falls under, if any. */
const switchOfKind = (kind) =>
  kind === 'coop' ? 'coop' : kind === 'roam' ? 'roam' : kind === 'cards' || kind === 'mazoku' ? 'cards' : Object.hasOwn(SWITCHES, `story-${kind}`) ? `story-${kind}` : null;
/** May this user play `kind` (a run mode, a session kind or a story) on `map`? */
const playOpenTo = (u, kind) => {
  const sw = switchOfKind(kind);
  return sw === null || switchOpenTo(u, sw);
};
/**
 * What this player may see: everyone gets what is open; an admin also gets what is switched off (to badge it). Nothing
 * a player cannot see is named to them.
 */
const visibilityFor = (u) => {
  const open = {
    openMaps: Object.keys(MAPS).filter(mapPublic),
    openFilms: Object.keys(FILMS).filter(filmPublic),
    openSwitches: Object.keys(SWITCHES).filter(switchOn),
    boards: boardSwitches().all,
  };
  return isAdmin(u) ? { ...open, lockedMaps: lockedMaps(), lockedFilms: lockedFilms(), lockedSwitches: lockedSwitches() } : open;
};
/** The film a served path belongs to (its page, or a file in its folder), or null. */
const filmOfPath = (p) => {
  const s = String(p).replaceAll('\\', '/').toLowerCase();
  for (const [id, f] of Object.entries(FILMS)) if (s === `/${f.page}.html` || s.startsWith(`/${f.page}/`)) return id;
  return null;
};
const publicUser = (u) => ({ id: u.id, name: u.display_name, username: u.username, avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null });

/** The signed-in user for this request, or null. */
function userOf(req) {
  const t = req.cookies.ds_sess;
  return t ? db.sessionUser(t) : null;
}

const rooms = createRooms({
  // a WebSocket upgrade is a raw Node request: read the session cookie from the header
  userOf(req) {
    const m = /(?:^|;\s*)ds_sess=([^;]+)/.exec(req.headers.cookie || '');
    return m ? db.sessionUser(decodeURIComponent(m[1])) : null;
  },
  isAdmin: (u) => isAdmin(u),
  mapOpenTo: (u, map) => mapOpenTo(u, map),
  // co-op itself, each way to host, and what a session may play (Free roam, Standard Mazoku, the stories)
  switchOpenTo: (u, id) => switchOpenTo(u, id),
  playOpenTo: (u, kind) => playOpenTo(u, kind),
  aureliaOn: () => switchOn('aurelia-npc'),
  // local development only: the sessions accept the co-op QA script's set-ups (scripts/qa-coop.mjs)
  dev: DEV_LOGIN,
  onEvent(kind, { room, reason, message }) {
    if (kind === 'room-start') room.dbId = db.roomStart(room.code, room.ownerId, room.visibility);
    else if (kind === 'room-end' && room.dbId) db.roomEnd(room.dbId, { ...room, reason });
    else if (kind === 'sim-error') console.error(`[sim ${room.code}]`, message);
  },
});

function signIn(reply, profile) {
  const user = db.upsertUser(profile);
  const t = token();
  db.createSession(t, user.id, SESSION_TTL);
  reply.setCookie('ds_sess', t, cookieOpts(SESSION_TTL));
  return user;
}

// ---- request guards ----------------------------------------------------------------------------------

// A custom header cannot be sent cross-site without a CORS preflight (which this server never answers), so
// requiring it on every state-changing call blocks cross-site request forgery.
const hits = new Map();
app.addHook('preHandler', async (req, reply) => {
  if (req.method !== 'POST') return;
  if (req.headers['x-ds'] !== '1') return reply.code(403).send({ error: 'bad request' });
  const minute = Math.floor(Date.now() / 60000);
  const key = `${req.ip}:${minute}`;
  const n = (hits.get(key) ?? 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) for (const k of hits.keys()) if (!k.endsWith(`:${minute}`)) hits.delete(k);
  if (n > 180) return reply.code(429).send({ error: 'slow down' });
});

/** Route guard: a signed-in, unbanned player. */
async function player(req, reply) {
  const u = userOf(req);
  if (!u) return reply.code(401).send({ error: 'sign in first' });
  if (u.banned) return reply.code(403).send({ error: 'banned' });
  req.user = u;
}

async function admin(req, reply) {
  const u = userOf(req);
  // 404, not 403: someone probing should not learn that the page exists
  if (!isAdmin(u)) return reply.code(404).send({ error: 'not found' });
  req.user = u;
}

// ---- sign-in -----------------------------------------------------------------------------------------

app.get('/auth/discord', async (req, reply) => {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) return reply.code(503).type('text/plain').send('Discord sign-in is not configured on this server.');
  const state = token();
  reply.setCookie('ds_oauth', state, cookieOpts(600));
  const p = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT, scope: 'identify', state, prompt: 'none' });
  return reply.redirect(`https://discord.com/oauth2/authorize?${p}`);
});

app.get('/auth/discord/callback', async (req, reply) => {
  const { code, state } = req.query;
  reply.clearCookie('ds_oauth', { path: '/' });
  if (!code || !state || state !== req.cookies.ds_oauth) return reply.redirect('/?login=failed');
  try {
    const tr = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: String(code), redirect_uri: REDIRECT }),
    });
    if (!tr.ok) throw new Error(`token exchange ${tr.status}`);
    const { access_token } = await tr.json();
    const ur = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${access_token}` } });
    if (!ur.ok) throw new Error(`profile ${ur.status}`);
    const d = await ur.json();
    signIn(reply, { id: String(d.id), username: String(d.username), display_name: String(d.global_name || d.username), avatar: d.avatar });
    return reply.redirect('/');
  } catch (err) {
    req.log.warn(err);
    return reply.redirect('/?login=failed');
  }
});

if (DEV_LOGIN) {
  app.get('/auth/dev', async (req, reply) => {
    const id = String(req.query.id || '100000000000000001').replace(/\D/g, '').slice(0, 20) || '1';
    signIn(reply, { id, username: `dev${id.slice(-4)}`, display_name: String(req.query.name || `Dev ${id.slice(-4)}`).slice(0, 32), avatar: null });
    return reply.redirect('/');
  });
}

app.post('/auth/logout', async (req, reply) => {
  if (req.cookies.ds_sess) db.dropSession(req.cookies.ds_sess);
  reply.clearCookie('ds_sess', { path: '/' });
  return { ok: true };
});

// ---- player API --------------------------------------------------------------------------------------

app.get('/api/me', async (req) => {
  const u = userOf(req);
  if (!u) return { user: null, devLogin: DEV_LOGIN, ...visibilityFor(null) };
  if (u.banned) return { user: publicUser(u), banned: true, banReason: u.ban_reason || '', ...visibilityFor(null) };
  return { user: publicUser(u), admin: isAdmin(u), cards: db.cards(u.id), ...visibilityFor(u) };
});

app.post('/api/visit', async (req, reply) => {
  const u = userOf(req);
  let anon = req.cookies.ds_anon;
  if (!anon) {
    anon = token().slice(0, 22);
    reply.setCookie('ds_anon', anon, cookieOpts(365 * 86400));
  }
  // which page: the game, or one of the pages beside it
  const page = ['game', 'excalibur', 'hollow', 'bestiary'].includes(req.body?.page) ? req.body.page : 'game';
  db.visit(u ? u.id : `anon:${anon}`, u ? u.id : null, !!req.body?.touch, page);
  return { ok: true };
});

// keeps "online now" honest while a tab is open (sessionUser refreshes last_seen)
app.post('/api/ping', { preHandler: player }, async () => ({ ok: true }));

app.post('/api/runs', { preHandler: player }, async (req, reply) => {
  const mode = req.body?.mode;
  if (!MODES.includes(mode)) return reply.code(400).send({ error: 'unknown mode' });
  if (!mapOpenTo(req.user, req.body?.map)) return reply.code(403).send({ error: 'that map is not open yet' });
  if (!playOpenTo(req.user, mode)) return reply.code(403).send({ error: 'that mode is not open yet' });
  if (typeof req.body?.story === 'string' && !playOpenTo(req.user, req.body.story)) return reply.code(403).send({ error: 'that story is not open yet' });
  const b = req.body;
  return { id: db.startRun(req.user.id, mode, !!b?.touch, b?.map, b?.version, b?.difficulty, { device: b?.device, gpu: b?.gpu, quality: b?.quality }, b?.story) };
});

app.post('/api/runs/:id/end', { preHandler: player }, async (req) => ({ ok: db.endRun(req.user.id, Number(req.params.id), req.body ?? {}) }));

app.post('/api/runs/:id/card', { preHandler: player }, async (req, reply) => {
  const run = db.run(Number(req.params.id));
  const card = req.body?.card;
  if (!run || run.user_id !== req.user.id || run.ended_at !== null || run.mode !== 'cards') return reply.code(400).send({ error: 'no such run' });
  if (!switchOpenTo(req.user, 'cards')) return reply.code(403).send({ error: 'the card hunt is not open' });
  if (typeof card !== 'string' || !/^[a-z0-9_-]{1,24}$/.test(card)) return reply.code(400).send({ error: 'bad card' });
  db.addCard(req.user.id, card);
  return { cards: db.cards(req.user.id) };
});

app.post('/api/reports', { preHandler: player }, async (req, reply) => {
  const target = String(req.body?.target || '');
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!/^\d{5,20}$/.test(target) || target === req.user.id || reason.length < 3) return reply.code(400).send({ error: 'a report needs a player and a reason' });
  if (!db.user(target)) return reply.code(404).send({ error: 'no such player' });
  if (!db.addReport(req.user.id, target, reason, String(req.body?.context || '').slice(0, 200) || null)) return reply.code(429).send({ error: 'too many reports, try later' });
  return { ok: true };
});

// ---- leaderboards (public: anyone may look, signed in or not) -------------------------------------------

/** Which boards are on: all of them unless an admin switched them all off, or some of them. */
function boardSwitches() {
  let off = [];
  try {
    off = JSON.parse(db.setting('lb.off') || '[]');
  } catch {
    off = [];
  }
  return { all: db.setting('lb.all') !== 'off', off: Array.isArray(off) ? off.filter((k) => typeof k === 'string') : [] };
}

app.get('/api/leaderboards', async (req, reply) => {
  const { map, mode, metric } = req.query;
  if (!BOARD_MAPS.includes(map) || !BOARD_MODES.includes(mode) || !BOARD_METRICS.includes(metric)) return reply.code(400).send({ error: 'unknown board' });
  const version = typeof req.query.version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(req.query.version) ? req.query.version : '';
  const difficulty = DIFFICULTIES.includes(req.query.difficulty) ? req.query.difficulty : '';
  const sw = boardSwitches();
  // a map that is admin only has no board for players (it is not there at all, like the map); nor co-op, when it is off
  if ((!mapPublic(map) || (mode === 'coop' && !switchOn('coop'))) && !isAdmin(userOf(req))) return reply.code(404).send({ error: 'unknown board' });
  if (!sw.all) return { enabled: false, all: false, versions: [], entries: [] };
  if (sw.off.includes(boardKey(map, mode, metric))) return { enabled: false, all: true, versions: [], entries: [] };
  const versions = db.boardVersions(map, mode);
  reply.header('cache-control', mapPublic(map) ? 'public, max-age=20' : 'private, no-cache');
  const exclude = [...ADMIN_IDS];
  return { enabled: true, all: true, versions, perDifficulty: db.boardDifficulties({ map, mode, metric, version, exclude }), entries: db.leaderboard({ map, mode, metric, version, difficulty, exclude }) };
});

app.get('/api/rooms/:code', { preHandler: player }, async (req, reply) => rooms.info(req.params.code, req.user) ?? reply.code(404).send({ error: 'no such session' }));

// Local-only health check for the deploy script: it waits for co-op sessions to finish before restarting.
app.get('/api/health', async (req, reply) => {
  if (req.ip !== '127.0.0.1' && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') return reply.code(404).send({ error: 'not found' });
  return { ok: true, ...rooms.counts() };
});

// the live version (the deployed changelog's newest), never cached: open pages compare it to their own and reload when behind
const LIVE_VERSION = JSON.parse(readFileSync(join(here, 'changelog.json'), 'utf8')).versions[0]?.version ?? '0.0.0';
app.get('/api/version', async (_req, reply) => {
  reply.header('cache-control', 'no-store');
  return { version: LIVE_VERSION };
});

// ---- admin -------------------------------------------------------------------------------------------

app.get('/admin', { preHandler: admin }, async (_req, reply) => reply.type('text/html').send(readFileSync(join(here, 'admin.html'))));
// what each version brought (newest first): the same file the game takes its version from
app.get('/api/admin/changelog', { preHandler: admin }, async () => JSON.parse(readFileSync(join(here, 'changelog.json'), 'utf8')));
/** `?noAdmins=1`: leave the admins' own visits, runs and sessions out (how the game looks without them playing). */
const noAdmins = (q) => (q.noAdmins === '1' ? [...ADMIN_IDS] : []);
app.get('/api/admin/overview', { preHandler: admin }, async (req) => db.overview(Math.max(1, Math.min(90, Number(req.query.days) || 30)), noAdmins(req.query)));
// the Runs and Players tabs: a page at a time, filtered
const pageArgs = (q) => ({ page: Math.max(0, Math.floor(Number(q.page) || 0)), size: Math.max(5, Math.min(200, Math.floor(Number(q.size) || 25))) });
const pick = (v, allowed) => (allowed.includes(String(v ?? '')) ? String(v) : '');
app.get('/api/admin/runs', { preHandler: admin }, async (req) => {
  const q = req.query;
  return db.runPage({
    ...pageArgs(q),
    days: Math.max(0, Math.min(3650, Number(q.days) || 0)),
    mode: pick(q.mode, MODES),
    map: pick(q.map, ['district', 'sakura', 'forge', 'asylum', 'aurelia']),
    outcome: pick(q.outcome, ['victory', 'defeat', 'abandoned', 'unfinished']),
    device: pick(q.device, ['touch', 'desktop']),
    q: String(q.q || '').slice(0, 64),
    exclude: noAdmins(q),
  });
});
app.get('/api/admin/players', { preHandler: admin }, async (req) => ({
  ...db.userPage({ ...pageArgs(req.query), q: String(req.query.q || '').slice(0, 64), status: pick(req.query.status, ['banned', 'active']), exclude: noAdmins(req.query) }),
  admins: [...ADMIN_IDS],
}));
app.get('/api/admin/users', { preHandler: admin }, async (req) => ({ users: db.users(String(req.query.q || '')), admins: [...ADMIN_IDS] }));
app.get('/api/admin/rooms', { preHandler: admin }, async () => ({ rooms: rooms.live() }));
app.get('/api/admin/leaderboards', { preHandler: admin }, async () => {
  const sw = boardSwitches();
  const counts = db.boardCounts([...ADMIN_IDS]);
  const boards = [];
  for (const map of BOARD_MAPS)
    for (const mode of BOARD_MODES)
      for (const metric of BOARD_METRICS) {
        const c = counts.find((x) => x.map === map && x.mode === mode);
        const key = boardKey(map, mode, metric);
        boards.push({ key, map, mode, metric, on: !sw.off.includes(key), players: (metric === 'fastest' ? c?.winners : c?.players) ?? 0 });
      }
  return { all: sw.all, boards };
});
/** Switch every board ({ all }) or one ({ key, on }) on or off. */
app.post('/api/admin/leaderboards', { preHandler: admin }, async (req, reply) => {
  const b = req.body ?? {};
  if (typeof b.all === 'boolean') {
    db.setSetting('lb.all', b.all ? 'on' : 'off');
    db.audit(req.user.id, b.all ? 'boards-on' : 'boards-off', 'all', '');
  } else if (typeof b.key === 'string' && typeof b.on === 'boolean') {
    const [map, mode, metric] = b.key.split(':');
    if (!BOARD_MAPS.includes(map) || !BOARD_MODES.includes(mode) || !BOARD_METRICS.includes(metric)) return reply.code(400).send({ error: 'unknown board' });
    const off = new Set(boardSwitches().off);
    if (b.on) off.delete(b.key);
    else off.add(b.key);
    db.setSetting('lb.off', JSON.stringify([...off]));
    db.audit(req.user.id, b.on ? 'board-on' : 'board-off', b.key, '');
  } else return reply.code(400).send({ error: 'nothing to change' });
  return { ok: true, ...boardSwitches() };
});
app.get('/api/admin/reports', { preHandler: admin }, async (req) => ({ reports: db.reports(String(req.query.status || 'open')) }));
app.get('/api/admin/maps', { preHandler: admin }, async () => ({ maps: Object.entries(MAPS).map(([id, m]) => ({ id, name: m.name, public: mapPublic(id) })) }));

/** Put a map live for everyone, or take it back to admins only (never the last live one). */
app.post('/api/admin/maps/:id', { preHandler: admin }, async (req, reply) => {
  const id = String(req.params.id);
  if (!(id in MAPS)) return reply.code(404).send({ error: 'no such map' });
  const open = req.body?.public === true;
  if (!open && mapPublic(id) && Object.keys(MAPS).filter((m) => mapPublic(m)).length <= 1) return reply.code(409).send({ error: 'At least one map must stay live.' });
  db.setSetting(`map.${id}.public`, open ? '1' : '0');
  db.audit(req.user.id, open ? 'map-public' : 'map-admin-only', id, '');
  if (!open) rooms.closeShut();
  return { id, public: mapPublic(id) };
});

/**
 * The Visibility tab: every map, film, mode, way to host, story, feature and page, each live for everyone or admin only,
 * in one list of groups.
 */
app.get('/api/admin/visibility', { preHandler: admin }, async () => {
  const group = (key, title, items) => ({ key, title, items });
  const sw = (g) => Object.entries(SWITCHES).filter(([, s]) => s.group === g).map(([id, s]) => ({ id, name: s.name, public: switchOn(id) }));
  return {
    groups: [
      group('maps', 'Maps', Object.entries(MAPS).map(([id, m]) => ({ id, name: m.name, public: mapPublic(id) }))),
      group('films', 'Cinematics', Object.entries(FILMS).map(([id, f]) => ({ id, name: f.name, public: filmPublic(id) }))),
      group('modes', 'Modes', sw('modes')),
      group('hosting', 'Co-op hosting', sw('hosting')),
      group('stories', 'Story missions', sw('stories')),
      group('features', 'Features', sw('features')),
      group('pages', 'Pages', sw('pages')),
    ],
  };
});

/** Switch one thing live for everyone or back to admins only (maps and films go through their own rules). */
app.post('/api/admin/visibility/:id', { preHandler: admin }, async (req, reply) => {
  const id = String(req.params.id);
  if (typeof req.body?.public !== 'boolean') return reply.code(400).send({ error: 'public must be true or false' });
  const open = req.body.public;
  if (Object.hasOwn(MAPS, id)) {
    if (!open && mapPublic(id) && Object.keys(MAPS).filter((m) => mapPublic(m)).length <= 1) return reply.code(409).send({ error: 'At least one map must stay live.' });
    db.setSetting(`map.${id}.public`, open ? '1' : '0');
    db.audit(req.user.id, open ? 'map-public' : 'map-admin-only', id, '');
    if (!open) rooms.closeShut();
    return { id, public: mapPublic(id) };
  }
  if (Object.hasOwn(FILMS, id)) {
    db.setSetting(`film.${id}.public`, open ? '1' : '0');
    db.audit(req.user.id, open ? 'film-public' : 'film-admin-only', id, '');
    return { id, public: filmPublic(id) };
  }
  if (!Object.hasOwn(SWITCHES, id)) return reply.code(404).send({ error: 'no such switch' });
  // co-op needs a way to host: keep at least one on while co-op is
  const hosts = ['host-server', 'host-self'];
  if (!open && hosts.includes(id) && switchOn(id) && hosts.filter(switchOn).length <= 1) return reply.code(409).send({ error: 'Keep one way to host on (or switch co-op off instead).' });
  db.setSetting(`sw.${id}.public`, open ? '1' : '0');
  db.audit(req.user.id, open ? 'switch-public' : 'switch-admin-only', id, '');
  if (!open) rooms.closeShut();
  return { id, public: switchOn(id) };
});

app.get('/api/admin/films', { preHandler: admin }, async () => ({ films: Object.entries(FILMS).map(([id, f]) => ({ id, name: f.name, page: `/${f.page}.html`, public: filmPublic(id) })) }));

/** Put a cinematic out for everyone, or take it back to admins only. */
app.post('/api/admin/films/:id', { preHandler: admin }, async (req, reply) => {
  const id = String(req.params.id);
  if (!Object.hasOwn(FILMS, id)) return reply.code(404).send({ error: 'no such film' });
  if (typeof req.body?.public !== 'boolean') return reply.code(400).send({ error: 'public must be true or false' });
  const open = req.body.public;
  db.setSetting(`film.${id}.public`, open ? '1' : '0');
  db.audit(req.user.id, open ? 'film-public' : 'film-admin-only', id, '');
  return { id, public: filmPublic(id) };
});

app.post('/api/admin/users/:id/ban', { preHandler: admin }, async (req, reply) => {
  const id = String(req.params.id);
  if (ADMIN_IDS.has(id)) return reply.code(400).send({ error: 'an admin cannot be banned' });
  if (!db.user(id)) return reply.code(404).send({ error: 'no such player' });
  db.ban(req.user.id, id, String(req.body?.reason || '').slice(0, 200) || 'No reason given');
  rooms.drop(id);
  return { ok: true };
});

app.post('/api/admin/users/:id/unban', { preHandler: admin }, async (req) => {
  db.unban(req.user.id, String(req.params.id));
  return { ok: true };
});

app.post('/api/admin/reports/:id/resolve', { preHandler: admin }, async (req) => {
  db.resolveReport(req.user.id, Number(req.params.id), String(req.body?.resolution || '').slice(0, 200) || 'Reviewed');
  return { ok: true };
});

// ---- the game itself ---------------------------------------------------------------------------------

const dist = join(root, 'dist');
// pages are checked with the server on every visit (a cheap 304 when nothing changed), so an update shows at once; the
// build's hashed files never change and keep for a year; everything else (models, sounds) for an hour. A private film's
// page and files (only admins get them) are never kept by a shared cache.
const cacheFor = (reply, path) => {
  const film = filmOfPath(`/${relative(dist, path)}`);
  const priv = film !== null && !filmPublic(film);
  if (path.endsWith('.html')) reply.header('cache-control', priv ? 'private, no-cache' : 'no-cache');
  else if (/[\\/]assets[\\/]/.test(path)) reply.header('cache-control', 'public, max-age=31536000, immutable');
  else if (priv) reply.header('cache-control', 'private, max-age=3600');
};
// a private film's page and files are served to admins only (to anyone else they are not there at all); the path is
// the one the static server has already decoded and checked
const allowedPath = (path, _root, req) => {
  const film = filmOfPath(path);
  if (film !== null && !filmPublic(film)) return isAdmin(userOf(req));
  // the bestiary, when it is switched off; and the notes that came with the models (not for players)
  const p = String(path).replaceAll('\\', '/').toLowerCase();
  if (p === '/bestiary.html' && !switchOn('bestiary')) return isAdmin(userOf(req));
  if (/^\/anime\/[^/]+\.(md|txt)$/.test(p)) return false;
  return true;
};
// the sitemap lists only the films that are public
app.get('/sitemap.xml', async (_req, reply) => {
  const file = join(dist, 'sitemap.xml');
  if (!existsSync(file)) return reply.code(404).send({ error: 'not found' });
  const hidden = lockedFilms().map((id) => `/${FILMS[id].page}.html<`);
  if (!switchOn('bestiary')) hidden.push('/bestiary.html<');
  const xml = readFileSync(file, 'utf8').split('\n').filter((line) => !hidden.some((h) => line.includes(h))).join('\n');
  reply.header('cache-control', 'no-cache');
  return reply.type('application/xml').send(xml);
});
if (existsSync(dist)) await app.register(fastifyStatic, { root: dist, maxAge: '1h', immutable: false, setHeaders: cacheFor, allowedPath });
else app.log.warn('dist/ not found: run "pnpm build" to serve the game from this server');

rooms.attach(app.server);
// pm2 restart / stop: end the sessions with a reason instead of a dropped connection
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => {
    rooms.closeAll('The server restarted for an update - start a new session');
    setTimeout(() => process.exit(0), 400);
  });
}
const port = Number(env.PORT) || 3061;
await app.listen({ port, host: env.HOST || '0.0.0.0' });
console.log(`DEAD SIGNAL server on ${PUBLIC_URL} (port ${port})  admins: ${ADMIN_IDS.size}  discord: ${env.DISCORD_CLIENT_ID ? 'configured' : 'NOT configured'}${DEV_LOGIN ? '  DEV LOGIN ON' : ''}`);
