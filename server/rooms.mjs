/**
 * Co-op rooms over WebSocket: who is in which room, who may join, and relaying game messages between them.
 *
 * A room has an owner (its creator: manages it - kick, invites, start, end) and a host (runs the simulation):
 *  - server-hosted (the default): the host is a worker thread here (`sim/worker.mjs`, id SIM_ID). Every player is an
 *    equal client, nobody's device carries the session, and the owner leaving hands the room to another player;
 *  - self-hosted: the owner's browser is the host, as before (the session ends if they leave).
 * Up to MAX_PLAYERS players, up to MAX_SPECTATORS visible spectators, and one extra seat reserved for an admin who
 * watches unseen: a hidden admin is never listed, counted or announced.
 *
 * Client -> server                                Server -> client
 *   {t:'create', visibility, invites, hosting,      {t:'room', room, you}     full state, on every change
 *            map, kind,  map: fixed for the room; kind: 'mission' (Standard) | 'mazoku' | 'roam'
 *            zombies, team}  difficulty: the infected (easy..nightmare) and the AI squad (rookie..elite)
 *   {t:'join', code, as, hidden}                    {t:'relay', from, d}      a game message from another member / the host
 *   {t:'ready', value}     a player, in the lobby: ready (the owner can start once every player is)
 *   {t:'leave'}                                     {t:'closed', reason}      kicked / ended / host left
 *   {t:'manage', op, ...}   owner only              {t:'error', msg}
 *   {t:'relay', to, d}      to: 'all'|'host'|<id>   {t:'pong', n}             answer to a ping
 *   {t:'ping', n} / {t:'rtt', ms}                   (rtt: the client's measured round trip, shown to the room)
 */
import { existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { WebSocketServer } from 'ws';

export const MAX_PLAYERS = 3;
export const MAX_SPECTATORS = 3;
const MAX_MESSAGE = 16 * 1024;
const MAX_PER_SECOND = 90;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** The host id of a server-hosted room. */
export const SIM_ID = 'sim';
/** The countdown between the owner pressing start and everyone being brought in. */
const START_COUNTDOWN_MS = 5000;
const MAPS = ['district', 'forge', 'asylum'];
const KINDS = ['mission', 'mazoku', 'roam'];
const ZOMBIE_LEVELS = ['easy', 'normal', 'hard', 'nightmare'];
const TEAM_LEVELS = ['rookie', 'regular', 'veteran', 'elite'];
const SIM_FILE = new URL('./sim/worker.mjs', import.meta.url);
/** Server-hosted sessions at once (each is a worker thread holding a map, ~130 MB). */
const SIM_MAX = Math.max(0, Number(process.env.SIM_MAX_ROOMS ?? 8));

export function createRooms({ userOf, isAdmin, onEvent = () => {}, dev = false }) {
  /** @type {Map<string, any>} */
  const rooms = new Map();
  /** user id -> member (a user is in at most one room, on one connection) */
  const members = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });

  const newCode = () => {
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  };
  const send = (ws, msg) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  };
  const person = (m) => ({ id: m.id, name: m.name, avatar: m.avatar, ping: m.ping ?? null, ready: m.ready === true });
  /** Every seated player but the owner has pressed ready (the owner starts, so the owner is ready). */
  const allReady = (room) => visible(room, 'player').every((p) => p.id === room.ownerId || p.ready === true);
  /** The countdown ran out: the session is live. */
  function goLive(room) {
    if (room.state !== 'starting' || !rooms.has(room.code)) return;
    clearTimeout(room.startTimer);
    room.startTimer = null;
    room.state = 'playing';
    if (room.simReady) room.sim?.postMessage({ type: 'begin' });
    broadcast(room);
  }
  function cancelStart(room) {
    clearTimeout(room.startTimer);
    room.startTimer = null;
    if (room.state === 'starting') room.state = 'lobby';
  }
  const simRooms = () => [...rooms.values()].filter((r) => r.sim).length;
  const visible = (room, role) => [...room.members.values()].filter((m) => m.role === role && !m.hidden);

  /** What members are told about their room. The invite list goes to the host only; hidden admins appear nowhere. */
  function view(room, forMember) {
    return {
      code: room.code,
      hostId: room.hostId,
      ownerId: room.ownerId,
      hosting: room.hosting,
      map: room.map,
      kind: room.kind,
      zombies: room.zombies,
      team: room.team,
      visibility: room.visibility,
      state: room.state,
      // the countdown: what is left of it as this view is sent (each client counts down from its own clock)
      startIn: room.state === 'starting' ? Math.max(0, room.startsAt - Date.now()) : undefined,
      players: visible(room, 'player').map(person),
      spectators: visible(room, 'spectator').map(person),
      maxPlayers: MAX_PLAYERS,
      maxSpectators: MAX_SPECTATORS,
      invites: forMember.id === room.ownerId ? [...room.invites] : undefined,
    };
  }

  function broadcast(room) {
    for (const m of room.members.values()) send(m.ws, { t: 'room', room: view(room, m), you: { id: m.id, role: m.role, hidden: m.hidden } });
    room.peakPlayers = Math.max(room.peakPlayers, visible(room, 'player').length);
    room.peakSpectators = Math.max(room.peakSpectators, visible(room, 'spectator').length);
    // the server host only simulates seated players
    room.sim?.postMessage({ type: 'players', list: visible(room, 'player').map((m) => ({ id: m.id, name: m.name })) });
  }

  /** Server hosting: a worker thread that runs this room's session. */
  function startSim(room) {
    const w = new Worker(SIM_FILE, { workerData: { map: room.map, kind: room.kind, zombies: room.zombies, team: room.team, dev }, resourceLimits: { maxOldGenerationSizeMb: 384 } });
    room.sim = w;
    w.on('message', (msg) => {
      if (!msg || room.sim !== w) return;
      if (msg.type === 'relay') {
        const out = { t: 'relay', from: SIM_ID, d: msg.d };
        if (msg.to === 'all') for (const o of room.members.values()) send(o.ws, out);
        else {
          const target = room.members.get(String(msg.to));
          if (target) send(target.ws, out);
        }
      } else if (msg.type === 'ready') {
        room.simReady = true;
        w.postMessage({ type: 'players', list: visible(room, 'player').map((m) => ({ id: m.id, name: m.name })) });
        if (room.state === 'playing') w.postMessage({ type: 'begin' });
      } else if (msg.type === 'load') {
        room.simLoad = { ms: Number(msg.ms) || 0, infected: Number(msg.infected) || 0 };
      } else if (msg.type === 'error') {
        onEvent('sim-error', { room, message: String(msg.message).slice(0, 2000) });
      }
    });
    const fail = (why) => {
      if (room.sim !== w) return;
      room.sim = null;
      closeRoom(room, `The session's server simulation stopped (${why}) - start a new session`);
    };
    w.on('error', (err) => fail(err && err.message ? err.message : 'error'));
    w.on('exit', (code) => fail(`exit ${code}`));
  }

  function stopSim(room) {
    const w = room.sim;
    room.sim = null;
    if (w) void w.terminate();
  }

  function closeRoom(room, reason) {
    if (!rooms.delete(room.code)) return;
    cancelStart(room);
    stopSim(room);
    for (const m of room.members.values()) {
      members.delete(m.id);
      m.room = null;
      send(m.ws, { t: 'closed', reason });
    }
    onEvent('room-end', { room, reason });
    room.members.clear();
  }

  /**
   * Take a member out of its room. A self-hosted room ends when its host leaves; a server-hosted one passes to another
   * player (and ends only when no player is left).
   */
  function remove(m, reason) {
    const room = m.room;
    if (!room) return;
    if (m.id === room.hostId) return closeRoom(room, reason === 'left' ? 'The host ended the session' : 'The host disconnected');
    if (m.id === room.ownerId) {
      const next = visible(room, 'player').find((x) => x.id !== m.id);
      if (!next) return closeRoom(room, 'Everyone left the session');
      room.ownerId = next.id;
      room.hostName = next.name;
    }
    room.members.delete(m.id);
    members.delete(m.id);
    m.room = null;
    // tell the host a seat emptied so the game can drop that player; a hidden admin leaves without a trace
    if (!m.hidden) {
      const host = room.members.get(room.hostId);
      if (host) send(host.ws, { t: 'relay', from: 'server', d: { k: 'left', id: m.id } });
      broadcast(room);
    }
    // a server-hosted room with nobody left to play ends
    if (room.hosting === 'server' && visible(room, 'player').length === 0) closeRoom(room, 'Everyone left the session');
  }

  function place(m, room, role, hidden) {
    m.room = room;
    m.role = role;
    m.ready = false; // a new seat starts unready
    m.hidden = hidden;
    room.members.set(m.id, m);
    members.set(m.id, m);
    room.joins++;
    if (hidden) send(m.ws, { t: 'room', room: view(room, m), you: { id: m.id, role, hidden } });
    else broadcast(room);
  }

  const cleanIds = (list) => [...new Set((Array.isArray(list) ? list : []).map(String).filter((s) => /^\d{5,20}$/.test(s)))].slice(0, 30);

  function handle(m, msg) {
    const room = m.room;
    switch (msg.t) {
      case 'create': {
        if (room) return send(m.ws, { t: 'error', msg: 'Leave your current session first' });
        let hosting = msg.hosting === 'self' ? 'self' : 'server';
        if (hosting === 'server' && (!existsSync(SIM_FILE) || simRooms() >= SIM_MAX)) {
          return send(m.ws, { t: 'error', msg: 'Server hosting is busy right now - choose SELF HOST to start a session on your own device' });
        }
        const r = {
          code: newCode(),
          hosting,
          map: MAPS.includes(msg.map) ? msg.map : 'district',
          kind: KINDS.includes(msg.kind) ? msg.kind : 'mission',
          zombies: ZOMBIE_LEVELS.includes(msg.zombies) ? msg.zombies : 'normal',
          team: TEAM_LEVELS.includes(msg.team) ? msg.team : 'regular',
          ownerId: m.id,
          hostId: hosting === 'server' ? SIM_ID : m.id,
          hostName: m.name,
          visibility: msg.visibility === 'private' ? 'private' : 'public',
          invites: new Set(cleanIds(msg.invites)),
          state: 'lobby',
          members: new Map(),
          banned: new Set(),
          createdAt: Date.now(),
          joins: 0,
          kicks: 0,
          peakPlayers: 0,
          peakSpectators: 0,
        };
        rooms.set(r.code, r);
        if (hosting === 'server') startSim(r);
        else r.sim = undefined;
        onEvent('room-start', { room: r });
        return place(m, r, 'player', false);
      }
      case 'join': {
        if (room) return send(m.ws, { t: 'error', msg: 'Leave your current session first' });
        const r = rooms.get(String(msg.code || '').toUpperCase());
        if (!r) return send(m.ws, { t: 'error', msg: 'That session does not exist or has ended' });
        const hidden = msg.hidden === true && m.admin;
        if (hidden) {
          // the admin seat: one per room, outside every limit
          if ([...r.members.values()].some((x) => x.hidden)) return send(m.ws, { t: 'error', msg: 'The admin seat is taken' });
          return place(m, r, 'spectator', true);
        }
        if (r.banned.has(m.id)) return send(m.ws, { t: 'error', msg: 'You were removed from this session' });
        if (r.visibility === 'private' && !r.invites.has(m.id) && !m.admin) return send(m.ws, { t: 'error', msg: 'This session is invite-only' });
        const role = msg.as === 'spectator' ? 'spectator' : 'player';
        if (visible(r, role).length >= (role === 'player' ? MAX_PLAYERS : MAX_SPECTATORS)) {
          return send(m.ws, { t: 'error', msg: role === 'player' ? 'The session is full - you can still watch if a spectator seat is free' : 'No spectator seats left' });
        }
        return place(m, r, role, false);
      }
      case 'leave':
        return remove(m, 'left');
      case 'ping':
        return send(m.ws, { t: 'pong', n: msg.n });
      case 'rtt': {
        const ms = Math.round(Number(msg.ms));
        if (!(ms >= 0 && ms < 10000)) return;
        const changed = m.ping === undefined || Math.abs(ms - m.ping) >= 10;
        m.ping = ms;
        // members see each other's ping; tell the room when it moved, at most every few seconds
        if (room && changed && !m.hidden && Date.now() - (m.pingSent ?? 0) > 3000) {
          m.pingSent = Date.now();
          broadcast(room);
        }
        return;
      }
      case 'ready': {
        // a seated player in the lobby; frozen once the countdown runs
        if (!room || m.role !== 'player' || room.state !== 'lobby') return;
        m.ready = msg.value === true;
        return broadcast(room);
      }
      case 'manage': {
        if (!room || room.ownerId !== m.id) return send(m.ws, { t: 'error', msg: 'Only the session owner can manage it' });
        if (msg.op === 'end') return closeRoom(room, 'The session owner ended the session');
        if (msg.op === 'kick') {
          const target = room.members.get(String(msg.id));
          // a hidden admin cannot be kicked: to the host it does not exist
          if (!target || target.id === m.id || target.hidden) return;
          room.kicks++;
          room.banned.add(target.id);
          room.invites.delete(target.id);
          send(target.ws, { t: 'closed', reason: 'You were removed by the session owner' });
          room.members.delete(target.id);
          members.delete(target.id);
          target.room = null;
          send(m.ws, { t: 'relay', from: 'server', d: { k: 'left', id: target.id } });
        } else if (msg.op === 'visibility') {
          room.visibility = msg.value === 'private' ? 'private' : 'public';
        } else if (msg.op === 'invite') {
          for (const id of cleanIds([msg.id])) {
            room.invites.add(id);
            room.banned.delete(id);
          }
        } else if (msg.op === 'uninvite') {
          room.invites.delete(String(msg.id));
        } else if (msg.op === 'config') {
          // what the session plays and how hard; only between runs
          if (room.state === 'lobby' && KINDS.includes(msg.value)) {
            room.kind = msg.value;
            room.sim?.postMessage({ type: 'kind', kind: room.kind });
          }
          if (room.state === 'lobby' && (ZOMBIE_LEVELS.includes(msg.zombies) || TEAM_LEVELS.includes(msg.team))) {
            if (ZOMBIE_LEVELS.includes(msg.zombies)) room.zombies = msg.zombies;
            if (TEAM_LEVELS.includes(msg.team)) room.team = msg.team;
            room.sim?.postMessage({ type: 'difficulty', zombies: room.zombies, team: room.team });
          }
        } else if (msg.op === 'start') {
          // the ready check: every player ready, then a countdown everyone sees, then live
          if (room.state !== 'lobby') return;
          if (!allReady(room)) return send(m.ws, { t: 'error', msg: 'Not everyone is ready yet' });
          room.state = 'starting';
          room.startsAt = Date.now() + START_COUNTDOWN_MS;
          room.startTimer = setTimeout(() => goLive(room), START_COUNTDOWN_MS);
        } else if (msg.op === 'cancel') {
          cancelStart(room);
        } else if (msg.op === 'state') {
          // a direct switch (tools and tests; the lobby uses 'start'). Back to the lobby clears everyone's ready.
          const was = room.state;
          cancelStart(room);
          room.state = msg.value === 'playing' ? 'playing' : 'lobby';
          if (room.state === 'lobby') for (const p of room.members.values()) p.ready = false;
          if (room.state === 'playing' && was !== 'playing' && room.simReady) room.sim?.postMessage({ type: 'begin' });
        }
        return broadcast(room);
      }
      case 'relay': {
        if (!room) return;
        const out = { t: 'relay', from: m.id, d: msg.d };
        // spectators (and a hidden admin) only listen: nothing they send reaches the game
        if (m.role !== 'player') return;
        if (room.sim && (msg.to === 'host' || msg.to === SIM_ID)) {
          room.sim.postMessage({ type: 'msg', from: m.id, d: msg.d, owner: m.id === room.ownerId });
        } else if (msg.to === 'all') {
          for (const o of room.members.values()) if (o !== m) send(o.ws, out);
        } else {
          const target = room.members.get(msg.to === 'host' ? room.hostId : String(msg.to));
          if (target && target !== m) send(target.ws, out);
        }
        return;
      }
      default:
        return;
    }
  }

  wss.on('connection', (ws, user) => {
    const old = members.get(user.id);
    if (old) {
      // the same account opening a second tab takes over; the first one is dropped from its room
      remove(old, 'left');
      old.ws.close(4001, 'signed in elsewhere');
    }
    const m = { id: user.id, name: user.display_name, avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null, admin: isAdmin(user), ws, room: null, role: 'player', hidden: false, tick: 0, count: 0 };
    send(ws, { t: 'hello', id: m.id, admin: m.admin });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== m.tick) {
        m.tick = sec;
        m.count = 0;
      }
      if (++m.count > MAX_PER_SECOND) return;
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg && typeof msg === 'object') handle(m, msg);
    });
    ws.on('close', () => {
      if (members.get(m.id) === m) remove(m, 'disconnected');
    });
    ws.on('error', () => {});
  });

  return {
    /** Wire into the HTTP server: only signed-in, unbanned accounts get a socket. */
    attach(server) {
      server.on('upgrade', (req, socket, head) => {
        if (!req.url || !req.url.startsWith('/ws')) return socket.destroy();
        const user = userOf(req);
        if (!user || user.banned) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          return socket.destroy();
        }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, user));
      });
    },
    /** Join-link preview: enough to show "X's session, 2/3" before connecting. */
    info(code) {
      const r = rooms.get(String(code || '').toUpperCase());
      if (!r) return null;
      return { code: r.code, host: r.hostName, hosting: r.hosting, map: r.map, kind: r.kind, zombies: r.zombies, team: r.team, visibility: r.visibility, state: r.state, players: visible(r, 'player').length, spectators: visible(r, 'spectator').length, maxPlayers: MAX_PLAYERS, maxSpectators: MAX_SPECTATORS };
    },
    /** Admin view of everything live, hidden watchers included. */
    live() {
      return [...rooms.values()].map((r) => ({
        code: r.code,
        host: r.hostName,
        hostId: r.ownerId,
        hosting: r.hosting,
        map: r.map,
        kind: r.kind,
        zombies: r.zombies,
        team: r.team,
        simMs: r.simLoad ? r.simLoad.ms : null,
        infected: r.simLoad ? r.simLoad.infected : null,
        visibility: r.visibility,
        state: r.state,
        ageSeconds: Math.round((Date.now() - r.createdAt) / 1000),
        players: visible(r, 'player').map(person),
        spectators: visible(r, 'spectator').map(person),
        watchedByAdmin: [...r.members.values()].some((x) => x.hidden),
      }));
    },
    /** Sessions open right now and the people in them (hidden admins included). */
    counts() {
      let people = 0;
      for (const r of rooms.values()) people += r.members.size;
      return { rooms: rooms.size, people, serverHosted: simRooms() };
    },
    /** Shutting down: tell every session why, so nobody just sees a dropped connection. */
    closeAll(reason) {
      for (const r of [...rooms.values()]) closeRoom(r, reason);
    },
    /** A banned account is dropped from whatever it is in. */
    drop(userId) {
      const m = members.get(userId);
      if (!m) return;
      remove(m, 'left');
      m.ws.close(4003, 'banned');
    },
  };
}
