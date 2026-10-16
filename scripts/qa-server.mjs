#!/usr/bin/env node
/**
 * API checks for the game server: sign-in, run reporting, card counts, reports, bans and the admin guard.
 * Start a throwaway server first, then run this:
 *   PORT=3077 DEV_LOGIN=1 ADMIN_IDS=9000000009 DB_FILE=/tmp/qa.db node server/index.mjs
 *   QA_SERVER=http://127.0.0.1:3077 node scripts/qa-server.mjs
 * It expects an empty database and the admin id above.
 */
const B = process.env.QA_SERVER || 'http://127.0.0.1:3077';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };
function client() {
  const jar = new Map();
  const send = async (path, opts = {}) => {
    const headers = { ...(opts.headers || {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    const r = await fetch(B + path, { redirect: 'manual', ...opts, headers });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const v = kv.slice(i + 1); if (v) jar.set(kv.slice(0, i), v); else jar.delete(kv.slice(0, i)); }
    let body = null; try { body = await r.json(); } catch {}
    return { status: r.status, body };
  };
  return {
    get: (p) => send(p),
    post: (p, b, hdr = true) => send(p, { method: 'POST', headers: { 'content-type': 'application/json', ...(hdr ? { 'x-ds': '1' } : {}) }, body: JSON.stringify(b ?? {}) }),
  };
}
const anon = client(), p1 = client(), p2 = client(), adm = client();
let r = await anon.get('/api/me'); check('signed out: no user', r.body.user === null && r.body.devLogin === true);
r = await anon.post('/api/runs', { mode: 'standard' }); check('signed out cannot start a run', r.status === 401);
r = await anon.post('/api/visit', { touch: false }, false); check('POST without the guard header is refused', r.status === 403);
r = await anon.post('/api/visit', { touch: false }); check('visit recorded for an anonymous visitor', r.status === 200);
await p1.get('/auth/dev?id=2000000001&name=Player%20One'); await p2.get('/auth/dev?id=2000000002&name=%3Cb%3EBob'); await adm.get('/auth/dev?id=9000000009&name=Boss');
r = await p1.get('/api/me'); check('dev sign-in works', r.body.user?.id === '2000000001' && r.body.admin === false, JSON.stringify(r.body.user));
r = await adm.get('/api/me'); check('admin flag only for the admin id', r.body.admin === true);
r = await p1.get('/admin'); check('admin page is hidden from players (404)', r.status === 404);
r = await p1.get('/api/admin/overview'); check('admin API is hidden from players (404)', r.status === 404);
r = await p1.post('/api/runs', { mode: 'bogus' }); check('unknown mode refused', r.status === 400);
r = await p1.post('/api/runs', { mode: 'cards', touch: true }); const run = r.body.id; check('run started', Number.isInteger(run));
r = await p2.post(`/api/runs/${run}/end`, { outcome: 'victory', stats: {} }); check("another player cannot end someone's run", r.body.ok === false);
r = await p2.post(`/api/runs/${run}/card`, { card: 'sofia' }); check("another player cannot add cards to someone's run", r.status === 400);
r = await p1.post(`/api/runs/${run}/card`, { card: 'sofia' }); await p1.post(`/api/runs/${run}/card`, { card: 'sofia' }); r = await p1.post(`/api/runs/${run}/card`, { card: 'miku' });
check('cards are counted per account', r.body.cards.sofia === 2 && r.body.cards.miku === 1, JSON.stringify(r.body.cards));
r = await p1.post(`/api/runs/${run}/end`, { outcome: 'victory', reason: 'Extracted', stats: { timeSurvived: 99999, kills: 41, headshots: 9, contractsCompleted: 2, cardsRecovered: 3, cashEarned: 5200, shotsFired: 300, shotsHit: 150, highestRegion: 'high' } });
check('run ended', r.body.ok === true);
r = await p1.post(`/api/runs/${run}/end`, { outcome: 'defeat', stats: {} }); check('a run cannot be ended twice', r.body.ok === false);
r = await p1.post(`/api/runs/${run}/card`, { card: 'noire' }); check('no cards after the run has ended', r.status === 400);
r = await p1.post('/api/runs', { mode: 'standard' }); await p1.post(`/api/runs/${r.body.id}/end`, { outcome: 'defeat', reason: 'Killed in action', stats: { timeSurvived: 0, kills: 3 } });
r = await p1.post('/api/reports', { target: '2000000001', reason: 'self' }); check('cannot report yourself', r.status === 400);
r = await p1.post('/api/reports', { target: '2000000002', reason: 'Blocking the helicopter door', context: 'room test' }); check('report filed', r.status === 200);
r = await adm.get('/admin'); check('admin page served to the admin', r.status === 200);
r = await adm.get('/api/admin/overview?days=7'); const o = r.body;
check('overview totals', o.totals.users === 3 && o.totals.runs === 2 && o.totals.wins === 1 && o.totals.visits === 1 && o.totals.openReports === 1, JSON.stringify(o.totals));
const cards = o.modes.find((m) => m.mode === 'cards');
check('run duration is capped by wall-clock time (client cannot claim 27 hours)', cards.avgDuration < 60, `avg ${cards.avgDuration}`);
check('mode breakdown', cards.runs === 1 && cards.wins === 1 && cards.touch === 1 && o.modes.length === 2);
check('failure reasons listed', o.failReasons[0]?.reason === 'Killed in action');
r = await p1.get('/api/admin/runs'); check('the runs list is hidden from players (404)', r.status === 404);
r = await p1.get('/api/admin/players'); check('the players list is hidden from players (404)', r.status === 404);
r = await adm.get('/api/admin/runs?size=5'); check('runs list: every run, newest first', r.body.total === 2 && r.body.rows.length === 2 && r.body.rows[0].mode === 'standard', JSON.stringify({ total: r.body.total }));
r = await adm.get('/api/admin/runs?mode=cards'); check('runs list filters by mode', r.body.total === 1 && r.body.rows[0].mode === 'cards');
r = await adm.get('/api/admin/runs?outcome=defeat&device=desktop'); check('runs list filters by result and device', r.body.total === 1 && r.body.rows[0].outcome === 'defeat' && r.body.rows[0].touch === 0);
r = await adm.get('/api/admin/runs?device=touch&outcome=defeat'); check('runs list: filters combine', r.body.total === 0);
r = await adm.get('/api/admin/runs?q=Player%20One&size=5&page=0'); check('runs list searches by player', r.body.total === 2);
r = await adm.get('/api/admin/runs?mode=bogus'); check('runs list ignores an unknown filter value', r.body.total === 2);
r = await adm.get('/api/admin/runs?size=5&page=1'); check('runs list pages', r.body.total === 2 && r.body.rows.length === 0);
r = await adm.get('/api/admin/players?size=5'); check('players list pages, with the admin ids', r.body.total === 3 && r.body.rows.length === 3 && r.body.admins.includes('9000000009'));
r = await adm.get('/api/admin/players?q=Player%20One'); check('players list searches', r.body.total === 1 && r.body.rows[0].id === '2000000001');
r = await adm.get('/api/admin/reports'); const rep = r.body.reports[0]; check('report queue shows the report', rep?.target_id === '2000000002' && rep.reporter_name === 'Player One');
r = await adm.post('/api/admin/users/9000000009/ban', { reason: 'x' }); check('an admin cannot be banned', r.status === 400);
r = await adm.post('/api/admin/users/2000000002/ban', { reason: 'Griefing' }); check('ban accepted', r.status === 200);
r = await p2.get('/api/me'); check('a banned player is signed out', r.body.user === null);
await p2.get('/auth/dev?id=2000000002&name=Bob'); r = await p2.get('/api/me'); check('signing back in shows the ban and its reason', r.body.banned === true && r.body.banReason === 'Griefing');
r = await p2.post('/api/runs', { mode: 'standard' }); check('a banned player cannot start a run', r.status === 403);
r = await adm.get('/api/admin/players?status=banned'); check('players list filters the banned', r.body.total === 1 && r.body.rows[0].id === '2000000002');
r = await adm.post(`/api/admin/reports/${rep.id}/resolve`, { resolution: 'Banned' }); r = await adm.get('/api/admin/reports'); check('resolved report leaves the open queue', r.body.reports.length === 0);
r = await adm.post('/api/admin/users/2000000002/unban', {}); r = await p2.post('/api/runs', { mode: 'roam' }); check('unban restores access', r.status === 200);
// leaderboards: each player's best run, never an admin's; filtered by build and difficulty; switched off by an admin
const finish = async (c, body, end) => { const s = await c.post('/api/runs', { mode: 'standard', map: 'forge', ...body }); await c.post(`/api/runs/${s.body.id}/end`, end); };
await finish(p1, { version: '0.1.108', difficulty: 'hard' }, { outcome: 'victory', stats: { timeSurvived: 2, kills: 30, headshots: 5 } });
await finish(p1, { version: '0.1.108', difficulty: 'hard' }, { outcome: 'defeat', stats: { timeSurvived: 1, kills: 8, headshots: 1 } });
await finish(adm, { version: '0.1.108', difficulty: 'normal' }, { outcome: 'victory', stats: { timeSurvived: 1, kills: 999, headshots: 99 } });
await finish(p2, { version: '0.1.107', difficulty: 'normal' }, { outcome: 'defeat', stats: { timeSurvived: 1, kills: 12, headshots: 7 } });
const board = (q) => anon.get(`/api/leaderboards?map=forge&mode=solo&${q}`);
r = await board('metric=kills'); check('leaderboard: anyone can read it, best run per player, no admin', r.status === 200 && r.body.enabled === true && r.body.entries.map((e) => `${e.name}:${e.value}`).join(',') === 'Player One:30,Bob:12', JSON.stringify(r.body.entries));
check('leaderboard: how many players each difficulty has', r.body.perDifficulty.hard === 1 && r.body.perDifficulty.normal === 1 && r.body.perDifficulty.easy === 0, JSON.stringify(r.body.perDifficulty));
check('leaderboard: the builds it has runs from, newest first', JSON.stringify(r.body.versions) === '["0.1.108","0.1.107"]', JSON.stringify(r.body.versions));
r = await board('metric=fastest'); check('leaderboard: fastest extraction counts only extractions', r.body.entries.length === 1 && r.body.entries[0].name === 'Player One' && r.body.entries[0].rank === 1);
r = await board('metric=kills&version=0.1.107'); check('leaderboard: filtered by build', r.body.entries.length === 1 && r.body.entries[0].name === 'Bob' && r.body.entries[0].value === 12);
r = await board('metric=kills'); const top = r.body.entries[0];
check('leaderboard: each entry carries its run for the details', top.run.kills === 30 && top.run.headshots === 5 && top.run.outcome === 'victory' && top.run.difficulty === 'hard' && top.run.version === '0.1.108' && top.run.mode === 'standard', JSON.stringify(top.run));
await finish(p2, { mode: 'cards', version: '0.1.108', difficulty: 'normal' }, { outcome: 'defeat', stats: { timeSurvived: 1, kills: 20, headshots: 2 } });
r = await board('metric=kills&difficulty=normal'); check('solo counts Standard Mazoku runs too', r.body.entries.length === 1 && r.body.entries[0].name === 'Bob' && r.body.entries[0].value === 20 && r.body.entries[0].run.mode === 'cards', JSON.stringify(r.body.entries));
r = await anon.get('/api/leaderboards?map=district&mode=solo&metric=kills&difficulty=normal'); check('runs from before the difficulty was recorded count as Normal', r.body.entries[0]?.name === 'Player One' && r.body.entries[0].value === 41, JSON.stringify(r.body.entries));
r = await anon.get('/api/leaderboards?map=forge&mode=standard&metric=kills'); check('the old per-mode boards are gone', r.status === 400);
r = await board('metric=kills&difficulty=hard'); check('leaderboard: filtered by difficulty', r.body.entries.length === 1 && r.body.entries[0].name === 'Player One');
r = await anon.get('/api/leaderboards?map=forge&mode=roam&metric=kills'); check('leaderboard: free roam has none', r.status === 400);
r = await p1.post('/api/admin/leaderboards', { all: false }); check('players cannot switch boards (404)', r.status === 404);
r = await adm.post('/api/admin/leaderboards', { key: 'forge:solo:kills', on: false }); check('admin switches one board off', r.body.ok === true && r.body.off.includes('forge:solo:kills'));
r = await board('metric=kills'); check('a board switched off shows nothing', r.body.enabled === false && r.body.all === true && r.body.entries.length === 0);
r = await board('metric=fastest'); check('the other boards stay on', r.body.enabled === true && r.body.entries.length === 1);
r = await adm.post('/api/admin/leaderboards', { all: false }); r = await board('metric=fastest'); check('admin switches every board off', r.body.enabled === false && r.body.all === false);
r = await adm.get('/api/admin/leaderboards'); const kb = r.body.boards.find((b) => b.key === 'forge:solo:kills');
check('admin list: every board, its switch and its players', r.body.all === false && r.body.boards.length === 12 && kb.on === false && kb.players === 2, JSON.stringify(kb));
await adm.post('/api/admin/leaderboards', { all: true }); await adm.post('/api/admin/leaderboards', { key: 'forge:solo:kills', on: true });
r = await board('metric=kills'); check('boards back on', r.body.enabled === true && r.body.entries.length === 2);
await adm.post('/api/admin/users/2000000002/ban', { reason: 'Cheating' }); r = await board('metric=kills'); check('a banned player drops off the boards', r.body.entries.length === 1);
await adm.post('/api/admin/users/2000000002/unban', {});
r = await p1.post('/auth/logout', {}); r = await p1.get('/api/me'); check('sign out works', r.body.user === null);
r = await anon.get('/auth/discord'); check('Discord sign-in reports that it is not configured', r.status === 503);
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
