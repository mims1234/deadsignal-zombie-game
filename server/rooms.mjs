/**
 * Co-op rooms over WebSocket: who is in which room, who may join, and relaying game messages between them.
 * The server does not simulate the game; it owns membership, permissions and limits.
 *
 * A room has one host (its creator), up to MAX_PLAYERS players, up to MAX_SPECTATORS visible spectators, and one
 * extra seat reserved for an admin who watches unseen: a hidden admin is never listed, counted or announced.
 *
 * Client -> server                               Server -> client
 *   {t:'create', visibility, invites}              {t:'room', room, you}     full state, on every change
 *   {t:'join', code, as, hidden}                   {t:'relay', from, d}      a game message from another member
 *   {t:'leave'}                                    {t:'closed', reason}      kicked / ended / host left
 *   {t:'manage', op, ...}   host only              {t:'error', msg}
 *   {t:'relay', to, d}      to: 'all'|'host'|<id>
 */
import { randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';

export const MAX_PLAYERS = 3;
export const MAX_SPECTATORS = 3;
const MAX_MESSAGE = 16 * 1024;
const MAX_PER_SECOND = 90;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createRooms({ userOf, isAdmin, onEvent = () => {} }) {
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
  const person = (m) => ({ id: m.id, name: m.name, avatar: m.avatar });
  const visible = (room, role) => [...room.members.values()].filter((m) => m.role === role && !m.hidden);

  /** What members are told about their room. The invite list goes to the host only; hidden admins appear nowhere. */
  function view(room, forMember) {
    return {
      code: room.code,
      hostId: room.hostId,
      visibility: room.visibility,
      state: room.state,
      players: visible(room, 'player').map(person),
      spectators: visible(room, 'spectator').map(person),
      maxPlayers: MAX_PLAYERS,
      maxSpectators: MAX_SPECTATORS,
      invites: forMember.id === room.hostId ? [...room.invites] : undefined,
    };
  }

  function broadcast(room) {
    for (const m of room.members.values()) send(m.ws, { t: 'room', room: view(room, m), you: { id: m.id, role: m.role, hidden: m.hidden } });
    room.peakPlayers = Math.max(room.peakPlayers, visible(room, 'player').length);
    room.peakSpectators = Math.max(room.peakSpectators, visible(room, 'spectator').length);
  }

  function closeRoom(room, reason) {
    if (!rooms.delete(room.code)) return;
    for (const m of room.members.values()) {
      members.delete(m.id);
      m.room = null;
      send(m.ws, { t: 'closed', reason });
    }
    onEvent('room-end', { room, reason });
    room.members.clear();
  }

  /** Take a member out of its room. The host leaving ends the room for everyone. */
  function remove(m, reason) {
    const room = m.room;
    if (!room) return;
    if (m.id === room.hostId) return closeRoom(room, reason === 'left' ? 'The host ended the session' : 'The host disconnected');
    room.members.delete(m.id);
    members.delete(m.id);
    m.room = null;
    // tell the host a seat emptied so the game can drop that player; a hidden admin leaves without a trace
    if (!m.hidden) {
      const host = room.members.get(room.hostId);
      if (host) send(host.ws, { t: 'relay', from: 'server', d: { k: 'left', id: m.id } });
      broadcast(room);
    }
  }

  function place(m, room, role, hidden) {
    m.room = room;
    m.role = role;
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
        const r = {
          code: newCode(),
          hostId: m.id,
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
      case 'manage': {
        if (!room || room.hostId !== m.id) return send(m.ws, { t: 'error', msg: 'Only the host can manage the session' });
        if (msg.op === 'end') return closeRoom(room, 'The host ended the session');
        if (msg.op === 'kick') {
          const target = room.members.get(String(msg.id));
          // a hidden admin cannot be kicked: to the host it does not exist
          if (!target || target.id === m.id || target.hidden) return;
          room.kicks++;
          room.banned.add(target.id);
          room.invites.delete(target.id);
          send(target.ws, { t: 'closed', reason: 'You were removed by the host' });
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
        } else if (msg.op === 'state') {
          room.state = msg.value === 'playing' ? 'playing' : 'lobby';
        }
        return broadcast(room);
      }
      case 'relay': {
        if (!room) return;
        const out = { t: 'relay', from: m.id, d: msg.d };
        // spectators (and a hidden admin) only listen: nothing they send reaches the game
        if (m.role !== 'player') return;
        if (msg.to === 'all') {
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
      return { code: r.code, host: r.hostName, visibility: r.visibility, state: r.state, players: visible(r, 'player').length, spectators: visible(r, 'spectator').length, maxPlayers: MAX_PLAYERS, maxSpectators: MAX_SPECTATORS };
    },
    /** Admin view of everything live, hidden watchers included. */
    live() {
      return [...rooms.values()].map((r) => ({
        code: r.code,
        host: r.hostName,
        hostId: r.hostId,
        visibility: r.visibility,
        state: r.state,
        ageSeconds: Math.round((Date.now() - r.createdAt) / 1000),
        players: visible(r, 'player').map(person),
        spectators: visible(r, 'spectator').map(person),
        watchedByAdmin: [...r.members.values()].some((x) => x.hidden),
      }));
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
