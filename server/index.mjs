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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, openDb } from './db.mjs';
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
  if (!u) return { user: null, devLogin: DEV_LOGIN };
  if (u.banned) return { user: publicUser(u), banned: true, banReason: u.ban_reason || '' };
  return { user: publicUser(u), admin: isAdmin(u), cards: db.cards(u.id) };
});

app.post('/api/visit', async (req, reply) => {
  const u = userOf(req);
  let anon = req.cookies.ds_anon;
  if (!anon) {
    anon = token().slice(0, 22);
    reply.setCookie('ds_anon', anon, cookieOpts(365 * 86400));
  }
  db.visit(u ? u.id : `anon:${anon}`, u ? u.id : null, !!req.body?.touch);
  return { ok: true };
});

// keeps "online now" honest while a tab is open (sessionUser refreshes last_seen)
app.post('/api/ping', { preHandler: player }, async () => ({ ok: true }));

app.post('/api/runs', { preHandler: player }, async (req, reply) => {
  const mode = req.body?.mode;
  if (!MODES.includes(mode)) return reply.code(400).send({ error: 'unknown mode' });
  return { id: db.startRun(req.user.id, mode, !!req.body?.touch, req.body?.map) };
});

app.post('/api/runs/:id/end', { preHandler: player }, async (req) => ({ ok: db.endRun(req.user.id, Number(req.params.id), req.body ?? {}) }));

app.post('/api/runs/:id/card', { preHandler: player }, async (req, reply) => {
  const run = db.run(Number(req.params.id));
  const card = req.body?.card;
  if (!run || run.user_id !== req.user.id || run.ended_at !== null || run.mode !== 'cards') return reply.code(400).send({ error: 'no such run' });
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

app.get('/api/rooms/:code', { preHandler: player }, async (req, reply) => rooms.info(req.params.code) ?? reply.code(404).send({ error: 'no such session' }));

// Local-only health check for the deploy script: it waits for co-op sessions to finish before restarting.
app.get('/api/health', async (req, reply) => {
  if (req.ip !== '127.0.0.1' && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') return reply.code(404).send({ error: 'not found' });
  return { ok: true, ...rooms.counts() };
});

// ---- admin -------------------------------------------------------------------------------------------

app.get('/admin', { preHandler: admin }, async (_req, reply) => reply.type('text/html').send(readFileSync(join(here, 'admin.html'))));
app.get('/api/admin/overview', { preHandler: admin }, async (req) => db.overview(Math.max(1, Math.min(90, Number(req.query.days) || 30))));
app.get('/api/admin/users', { preHandler: admin }, async (req) => ({ users: db.users(String(req.query.q || '')), admins: [...ADMIN_IDS] }));
app.get('/api/admin/rooms', { preHandler: admin }, async () => ({ rooms: rooms.live() }));
app.get('/api/admin/reports', { preHandler: admin }, async (req) => ({ reports: db.reports(String(req.query.status || 'open')) }));

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
if (existsSync(dist)) await app.register(fastifyStatic, { root: dist, maxAge: '1h', immutable: false });
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
