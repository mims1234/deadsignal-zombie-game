/**
 * Storage for accounts, sessions, bans, reports and analytics. One SQLite file (WAL mode); every statement is
 * prepared once. Times are Unix seconds. Day buckets use UTC.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const now = () => Math.floor(Date.now() / 1000);
export const MODES = ['standard', 'cards', 'roam', 'coop'];
export const OUTCOMES = ['victory', 'defeat', 'abandoned'];

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,              -- Discord user id
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar TEXT,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      banned INTEGER NOT NULL DEFAULT 0,
      ban_reason TEXT,
      banned_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      day TEXT NOT NULL,                -- YYYY-MM-DD (UTC)
      visitor TEXT NOT NULL,            -- user id, or an anonymous id for signed-out visitors
      user_id TEXT,
      touch INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS visits_day ON visits(day);
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      touch INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      day TEXT NOT NULL,
      ended_at INTEGER,
      outcome TEXT,                     -- victory | defeat | abandoned (NULL while running / tab closed)
      reason TEXT,
      duration REAL,
      kills INTEGER, headshots INTEGER, contracts INTEGER, cards INTEGER, cash INTEGER,
      shots_fired INTEGER, shots_hit INTEGER, region TEXT
    );
    CREATE INDEX IF NOT EXISTS runs_day ON runs(day);
    CREATE INDEX IF NOT EXISTS runs_user ON runs(user_id);
    CREATE TABLE IF NOT EXISTS cards (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      first_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, card_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      context TEXT,
      status TEXT NOT NULL DEFAULT 'open',   -- open | resolved
      resolved_by TEXT,
      resolved_at INTEGER,
      resolution TEXT
    );
    CREATE TABLE IF NOT EXISTS coop_rooms (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL,
      host_id TEXT NOT NULL,
      visibility TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      day TEXT NOT NULL,
      ended_at INTEGER,
      end_reason TEXT,
      peak_players INTEGER, peak_spectators INTEGER, joins INTEGER, kicks INTEGER
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, admin_id TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT
    );
  `);

  // added after the first release: older databases get the column here
  try {
    db.exec('ALTER TABLE runs ADD COLUMN map TEXT');
  } catch {
    /* already there */
  }

  const q = {
    upsertUser: db.prepare(`INSERT INTO users (id, username, display_name, avatar, created_at, last_seen) VALUES (@id, @username, @display_name, @avatar, @t, @t)
      ON CONFLICT(id) DO UPDATE SET username = @username, display_name = @display_name, avatar = @avatar, last_seen = @t`),
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    touchUser: db.prepare('UPDATE users SET last_seen = ? WHERE id = ?'),
    addSession: db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    session: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'),
    dropSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    dropUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    addVisit: db.prepare('INSERT INTO visits (ts, day, visitor, user_id, touch) VALUES (?, ?, ?, ?, ?)'),
    startRun: db.prepare('INSERT INTO runs (user_id, mode, touch, started_at, day, map) VALUES (?, ?, ?, ?, ?, ?)'),
    run: db.prepare('SELECT * FROM runs WHERE id = ?'),
    endRun: db.prepare(`UPDATE runs SET ended_at = @t, outcome = @outcome, reason = @reason, duration = @duration, kills = @kills, headshots = @headshots,
      contracts = @contracts, cards = @cards, cash = @cash, shots_fired = @shots_fired, shots_hit = @shots_hit, region = @region WHERE id = @id AND ended_at IS NULL`),
    addCard: db.prepare(`INSERT INTO cards (user_id, card_id, count, first_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id, card_id) DO UPDATE SET count = count + 1`),
    cards: db.prepare('SELECT card_id, count FROM cards WHERE user_id = ?'),
    addReport: db.prepare('INSERT INTO reports (ts, reporter_id, target_id, reason, context) VALUES (?, ?, ?, ?, ?)'),
    reportsSince: db.prepare('SELECT COUNT(*) n FROM reports WHERE reporter_id = ? AND ts > ?'),
    setBan: db.prepare('UPDATE users SET banned = ?, ban_reason = ?, banned_at = ? WHERE id = ?'),
    resolveReport: db.prepare("UPDATE reports SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution = ? WHERE id = ? AND status = 'open'"),
    audit: db.prepare('INSERT INTO audit (ts, admin_id, action, target, detail) VALUES (?, ?, ?, ?, ?)'),
  };

  const day = (t = now()) => new Date(t * 1000).toISOString().slice(0, 10);
  const int = (v, max = 1e9) => (Number.isFinite(+v) ? Math.max(0, Math.min(max, Math.round(+v))) : 0);
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

  return {
    raw: db,
    now,
    upsertUser(u) {
      q.upsertUser.run({ id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar ?? null, t: now() });
      return q.user.get(u.id);
    },
    user: (id) => q.user.get(id),
    createSession(token, userId, ttl) {
      q.purgeSessions.run(now());
      q.addSession.run(token, userId, now(), now() + ttl);
    },
    sessionUser(token) {
      const u = q.session.get(token, now());
      if (u) q.touchUser.run(now(), u.id);
      return u ?? null;
    },
    dropSession: (token) => q.dropSession.run(token),
    visit: (visitor, userId, touch) => q.addVisit.run(now(), day(), visitor, userId, touch ? 1 : 0),
    startRun: (userId, mode, touch, map) => Number(q.startRun.run(userId, mode, touch ? 1 : 0, now(), day(), ['forge', 'asylum'].includes(map) ? map : 'district').lastInsertRowid),
    /** Close a run with the client's numbers. They are for analytics only: nothing is granted from them. */
    endRun(userId, id, body) {
      const run = q.run.get(id);
      if (!run || run.user_id !== userId || run.ended_at !== null) return false;
      const s = body.stats ?? {};
      q.endRun.run({
        id,
        t: now(),
        outcome: OUTCOMES.includes(body.outcome) ? body.outcome : 'abandoned',
        reason: text(body.reason, 120),
        // never longer than the wall-clock time since the run started
        duration: Math.min(int(s.timeSurvived, 86400), now() - run.started_at + 5),
        kills: int(s.kills, 100000),
        headshots: int(s.headshots, 100000),
        contracts: int(s.contractsCompleted, 10),
        cards: int(s.cardsRecovered, 50),
        cash: int(s.cashEarned, 1e7),
        shots_fired: int(s.shotsFired, 1e6),
        shots_hit: int(s.shotsHit, 1e6),
        region: text(s.highestRegion, 12),
      });
      return true;
    },
    run: (id) => q.run.get(id),
    addCard: (userId, cardId) => q.addCard.run(userId, cardId, now()),
    cards(userId) {
      const out = {};
      for (const r of q.cards.all(userId)) out[r.card_id] = r.count;
      return out;
    },
    /** False when the reporter has filed too many reports in the last hour. */
    addReport(reporterId, targetId, reason, context) {
      if (q.reportsSince.get(reporterId, now() - 3600).n >= 10) return false;
      q.addReport.run(now(), reporterId, targetId, reason, context);
      return true;
    },
    ban(adminId, userId, reason) {
      q.setBan.run(1, reason, now(), userId);
      q.dropUserSessions.run(userId);
      q.audit.run(now(), adminId, 'ban', userId, reason);
    },
    unban(adminId, userId) {
      q.setBan.run(0, null, null, userId);
      q.audit.run(now(), adminId, 'unban', userId, null);
    },
    roomStart: (code, hostId, visibility) => Number(db.prepare('INSERT INTO coop_rooms (code, host_id, visibility, created_at, day) VALUES (?, ?, ?, ?, ?)').run(code, hostId, visibility, now(), day()).lastInsertRowid),
    roomEnd: (id, r) =>
      db.prepare('UPDATE coop_rooms SET ended_at = ?, end_reason = ?, visibility = ?, peak_players = ?, peak_spectators = ?, joins = ?, kicks = ? WHERE id = ?').run(now(), r.reason, r.visibility, r.peakPlayers, r.peakSpectators, r.joins, r.kicks, id),
    resolveReport(adminId, id, resolution) {
      q.resolveReport.run(adminId, now(), resolution, id);
      q.audit.run(now(), adminId, 'resolve-report', String(id), resolution);
    },

    // ---------------------------------------------------------------- admin analytics
    overview(days) {
      const since = day(now() - (days - 1) * 86400);
      const one = (sql, ...a) => db.prepare(sql).get(...a);
      const all = (sql, ...a) => db.prepare(sql).all(...a);
      const totals = {
        users: one('SELECT COUNT(*) n FROM users').n,
        banned: one('SELECT COUNT(*) n FROM users WHERE banned = 1').n,
        online: one('SELECT COUNT(*) n FROM users WHERE last_seen > ?', now() - 300).n,
        newUsers: one('SELECT COUNT(*) n FROM users WHERE created_at >= ?', now() - days * 86400).n,
        activeUsers: one('SELECT COUNT(DISTINCT user_id) n FROM runs WHERE day >= ?', since).n,
        visits: one('SELECT COUNT(*) n FROM visits WHERE day >= ?', since).n,
        visitors: one('SELECT COUNT(DISTINCT visitor) n FROM visits WHERE day >= ?', since).n,
        runs: one('SELECT COUNT(*) n FROM runs WHERE day >= ?', since).n,
        wins: one("SELECT COUNT(*) n FROM runs WHERE day >= ? AND outcome = 'victory'", since).n,
        playSeconds: one('SELECT COALESCE(SUM(duration), 0) n FROM runs WHERE day >= ?', since).n,
        openReports: one("SELECT COUNT(*) n FROM reports WHERE status = 'open'").n,
      };
      const visitDays = new Map(all('SELECT day, COUNT(*) visits, COUNT(DISTINCT visitor) visitors FROM visits WHERE day >= ? GROUP BY day', since).map((r) => [r.day, r]));
      const runDays = new Map(all('SELECT day, COUNT(*) runs, COUNT(DISTINCT user_id) players FROM runs WHERE day >= ? GROUP BY day', since).map((r) => [r.day, r]));
      const daily = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = day(now() - i * 86400);
        daily.push({ day: d, visits: visitDays.get(d)?.visits ?? 0, visitors: visitDays.get(d)?.visitors ?? 0, runs: runDays.get(d)?.runs ?? 0, players: runDays.get(d)?.players ?? 0 });
      }
      const modes = all(
        `SELECT mode, COUNT(*) runs, COUNT(DISTINCT user_id) players,
           SUM(outcome = 'victory') wins, SUM(outcome = 'defeat') defeats, SUM(outcome = 'abandoned') abandoned, SUM(outcome IS NULL) unfinished,
           AVG(duration) avgDuration, AVG(kills) avgKills, SUM(cards) cards, SUM(touch) touch
         FROM runs WHERE day >= ? GROUP BY mode`,
        since,
      );
      const failReasons = all("SELECT reason, COUNT(*) n FROM runs WHERE day >= ? AND outcome = 'defeat' AND reason IS NOT NULL GROUP BY reason ORDER BY n DESC LIMIT 8", since);
      const topPlayers = all(
        `SELECT u.id, u.display_name name, COUNT(*) runs, SUM(r.outcome = 'victory') wins, COALESCE(SUM(r.kills), 0) kills, COALESCE(SUM(r.duration), 0) seconds
         FROM runs r JOIN users u ON u.id = r.user_id WHERE r.day >= ? GROUP BY u.id ORDER BY seconds DESC LIMIT 15`,
        since,
      );
      const cardTotals = all('SELECT card_id, SUM(count) n, COUNT(*) owners FROM cards GROUP BY card_id ORDER BY n DESC');
      const recentRuns = all(
        `SELECT r.id, r.started_at, r.mode, r.map, r.touch, r.outcome, r.reason, r.duration, r.kills, r.cards, u.display_name name, u.id user_id
         FROM runs r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 40`,
      );
      const coop = one(
        `SELECT COUNT(*) sessions, COALESCE(AVG(peak_players), 0) avgPlayers, COALESCE(AVG(ended_at - created_at), 0) avgSeconds,
           COALESCE(SUM(kicks), 0) kicks, COALESCE(SUM(visibility = 'private'), 0) private
         FROM coop_rooms WHERE day >= ?`,
        since,
      );
      const maps = all("SELECT COALESCE(map, 'district') map, COUNT(*) runs, COUNT(DISTINCT user_id) players, SUM(outcome = 'victory') wins, AVG(duration) avgDuration FROM runs WHERE day >= ? GROUP BY 1", since);
      return { days, totals, daily, modes, maps, failReasons, topPlayers, cardTotals, recentRuns, coop };
    },
    users(search) {
      const like = `%${(search ?? '').replace(/[%_]/g, '')}%`;
      return db
        .prepare(
          `SELECT u.id, u.username, u.display_name, u.created_at, u.last_seen, u.banned, u.ban_reason,
             (SELECT COUNT(*) FROM runs r WHERE r.user_id = u.id) runs,
             (SELECT COUNT(*) FROM reports p WHERE p.target_id = u.id) reports
           FROM users u WHERE u.id LIKE ? OR u.username LIKE ? OR u.display_name LIKE ? ORDER BY u.last_seen DESC LIMIT 100`,
        )
        .all(like, like, like);
    },
    reports(status) {
      return db
        .prepare(
          `SELECT p.*, a.display_name reporter_name, b.display_name target_name, b.banned target_banned
           FROM reports p JOIN users a ON a.id = p.reporter_id LEFT JOIN users b ON b.id = p.target_id
           WHERE p.status = ? ORDER BY p.id DESC LIMIT 100`,
        )
        .all(status === 'resolved' ? 'resolved' : 'open');
    },
  };
}
