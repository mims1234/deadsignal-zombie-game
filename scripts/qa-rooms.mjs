#!/usr/bin/env node
/**
 * Checks for co-op rooms over WebSocket: seats, invite-only access, host powers, relaying, and that a hidden admin
 * never shows up anywhere. Start a throwaway server first:
 *   PORT=3077 DEV_LOGIN=1 ADMIN_IDS=9000000009 DB_FILE=/tmp/qa.db node server/index.mjs
 *   QA_SERVER=http://127.0.0.1:3077 node scripts/qa-rooms.mjs
 */
import WebSocket from 'ws';

const B = process.env.QA_SERVER || 'http://127.0.0.1:3077';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sign in through the dev shortcut and open a socket; `inbox` collects everything received. */
async function connect(id, name) {
  const r = await fetch(`${B}/auth/dev?id=${id}&name=${encodeURIComponent(name)}`, { redirect: 'manual' });
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const ws = new WebSocket(B.replace('http', 'ws') + '/ws', { headers: { cookie } });
  const c = { id, ws, inbox: [], cookie, room: null, closed: null };
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    c.inbox.push(m);
    if (m.t === 'room') c.room = m.room;
    if (m.t === 'closed') c.closed = m.reason;
  });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.last = (t) => [...c.inbox].reverse().find((m) => m.t === t);
  return c;
}

const anon = new WebSocket(B.replace('http', 'ws') + '/ws');
const refused = await new Promise((res) => {
  anon.on('open', () => res(false));
  anon.on('error', () => res(true));
});
check('a signed-out visitor cannot open a socket', refused);

const host = await connect('3000000001', 'Host');
const p2 = await connect('3000000002', 'Two');
const p3 = await connect('3000000003', 'Three');
const p4 = await connect('3000000004', 'Four');
const s1 = await connect('3000000005', 'Watcher');
const adm = await connect('9000000009', 'Boss');

// ---- a self-hosted session: the creator's browser is the host ----
host.send({ t: 'create', visibility: 'public', hosting: 'self' });
await sleep(150);
const code = host.room?.code;
check('host creates a self-hosted session and is its first player', !!code && host.room.players.length === 1 && host.room.hostId === host.id && host.room.ownerId === host.id && host.room.hosting === 'self', code);
p2.send({ t: 'join', code });
p3.send({ t: 'join', code: code.toLowerCase() });
await sleep(150);
check('two more players join (codes are case-insensitive)', host.room.players.length === 3);
p4.send({ t: 'join', code });
await sleep(150);
check('a fourth player is refused: the session is full', p4.room === null && /full/.test(p4.last('error')?.msg || ''));
p4.send({ t: 'join', code, as: 'spectator' });
s1.send({ t: 'join', code, as: 'spectator' });
await sleep(150);
check('spectators take spectator seats', host.room.spectators.length === 2 && host.room.players.length === 3);

// hidden admin
adm.send({ t: 'join', code, hidden: true });
await sleep(150);
check('the admin gets the room state', adm.room?.code === code);
check('a hidden admin is not listed to anyone', !JSON.stringify(host.room).includes('9000000009') && !JSON.stringify(p2.room).includes('Boss') && host.room.spectators.length === 2);
const before = host.inbox.length;
p2.send({ t: 'join', code, hidden: true });
await sleep(100);
check('a player cannot use the hidden seat', /Leave your current/.test(p2.last('error')?.msg || ''));
const info = await (await fetch(`${B}/api/rooms/${code}`, { headers: { cookie: p4.cookie } })).json();
check('the join-link preview counts only visible members', info.players === 3 && info.spectators === 2 && info.host === 'Host', JSON.stringify(info));

// relaying
host.send({ t: 'relay', to: 'all', d: { k: 'snap', n: 1 } });
p2.send({ t: 'relay', to: 'host', d: { k: 'input', x: 5 } });
s1.send({ t: 'relay', to: 'all', d: { k: 'cheat' } });
adm.send({ t: 'relay', to: 'all', d: { k: 'admin-noise' } });
await sleep(150);
check('host broadcasts reach players, spectators and the hidden admin', [p2, p3, p4, s1, adm].every((c) => c.last('relay')?.d.k === 'snap'));
check('a player message reaches the host, stamped with the sender', host.last('relay')?.from === p2.id && host.last('relay').d.x === 5);
check('spectators and the hidden admin cannot send into the game', !host.inbox.concat(p2.inbox).some((m) => m.t === 'relay' && (m.d.k === 'cheat' || m.d.k === 'admin-noise')));

// host powers
p2.send({ t: 'manage', op: 'kick', id: p3.id });
await sleep(100);
check('only the owner can manage', host.room.players.length === 3 && /Only the session owner/.test(p2.last('error')?.msg || ''));
host.send({ t: 'manage', op: 'kick', id: adm.id });
await sleep(100);
check('kicking the hidden admin does nothing', adm.closed === null);
host.send({ t: 'manage', op: 'kick', id: p3.id });
await sleep(150);
check('the owner can kick a player', p3.closed === 'You were removed by the session owner' && host.room.players.length === 2);
check('the host game is told the seat emptied', host.inbox.some((m) => m.t === 'relay' && m.from === 'server' && m.d.k === 'left' && m.d.id === p3.id));
p3.send({ t: 'join', code });
await sleep(100);
check('a kicked player cannot rejoin', p3.room?.code !== code || p3.closed !== null ? /removed/.test(p3.last('error')?.msg || '') : false);

// invite-only
host.send({ t: 'manage', op: 'visibility', value: 'private' });
p4.send({ t: 'leave' });
await sleep(150);
p4.send({ t: 'join', code });
await sleep(150);
check('an invite-only session refuses people who are not invited', /invite-only/.test(p4.last('error')?.msg || ''));
host.send({ t: 'manage', op: 'invite', id: p4.id });
await sleep(100);
check('the invite list is shown to the host only', host.room.invites?.includes(p4.id) && p2.room.invites === undefined);
p4.send({ t: 'join', code });
await sleep(150);
check('an invited player gets in', host.room.players.some((p) => p.id === p4.id));

// admin view and the end of the room
const live = await (await fetch(`${B}/api/admin/rooms`, { headers: { cookie: adm.cookie } })).json();
check('the admin API lists the live session and that it is being watched', live.rooms.length === 1 && live.rooms[0].watchedByAdmin === true && live.rooms[0].players.length === 3);
adm.send({ t: 'leave' });
await sleep(100);
check('the hidden admin leaves without anyone being told', host.inbox.length === before + host.inbox.slice(before).length && !host.inbox.slice(before).some((m) => JSON.stringify(m).includes('9000000009')));
host.ws.close();
await sleep(200);
check('the host disconnecting ends the session for everyone', p2.closed === 'The host disconnected' && s1.closed === 'The host disconnected');
const gone = await fetch(`${B}/api/rooms/${code}`, { headers: { cookie: p4.cookie } });
check('an ended session can no longer be found', gone.status === 404);
const o = await (await fetch(`${B}/api/admin/overview?days=7`, { headers: { cookie: adm.cookie } })).json();
check('the session is recorded for analytics', o.coop.sessions === 1 && o.coop.kicks === 1, JSON.stringify(o.coop));

// ---- a server-hosted session (the default): the game server is the host ----
for (const c of [p2, p3, p4, s1]) if (c.room) c.send({ t: 'leave' });
await sleep(100);
for (const c of [p2, p3, p4, s1]) c.closed = null;
p2.send({ t: 'create', visibility: 'public' });
await sleep(300);
const code2 = p2.room?.code;
check('sessions are server-hosted by default: the server hosts, the creator owns', p2.room?.hosting === 'server' && p2.room.hostId === 'sim' && p2.room.ownerId === p2.id, JSON.stringify(p2.room && { hosting: p2.room.hosting, hostId: p2.room.hostId, ownerId: p2.room.ownerId }));
p3.send({ t: 'join', code: code2 });
p4.send({ t: 'join', code: code2 });
await sleep(200);
p3.inbox.length = 0;
p2.send({ t: 'relay', to: 'host', d: { k: 'p', x: 1, y: 0, z: 1, yaw: 0, up: true, hp: 100 } });
await sleep(150);
check('a message to the host goes to the server, not to the other players', !p3.inbox.some((m) => m.t === 'relay' && m.from === p2.id));
p2.send({ t: 'manage', op: 'state', value: 'playing' });
const cfgSeen = await (async () => {
  for (let i = 0; i < 60; i++) {
    if (p3.inbox.concat(p2.inbox).some((m) => m.t === 'relay' && m.from === 'sim' && m.d.k === 's')) return true;
    await sleep(100);
  }
  return false;
})();
check('the server host speaks to the room (as "sim")', cfgSeen);
p3.send({ t: 'ping', n: 1234.5 });
await sleep(100);
check('ping is answered at once', p3.last('pong')?.n === 1234.5);
p3.send({ t: 'rtt', ms: 42 });
await sleep(150);
check('a measured ping is shown to the room', p2.room.players.find((q) => q.id === p3.id)?.ping === 42, JSON.stringify(p2.room.players));

// joining mid-game: the code keeps working while the run is under way, as far as the owner allows
const joinNow = async (c, as) => {
  c.inbox.length = 0;
  c.send({ t: 'join', code: code2, as });
  await sleep(200);
  return c.room?.code === code2;
};
const leaveNow = async (c) => {
  c.send({ t: 'leave' });
  await sleep(150);
  c.room = null;
};
p4.send({ t: 'leave' });
await sleep(150);
p4.room = null;
check('mid-game joining is open to players and watchers by default', p2.room.state === 'playing' && p2.room.late === 'all');
check('a player can join a server-hosted session mid-game', (await joinNow(s1, 'player')) && p2.room.players.some((q) => q.id === s1.id));
await leaveNow(s1);
p3.send({ t: 'manage', op: 'late', value: 'off' });
await sleep(150);
check('only the owner chooses who may join mid-game', p2.room.late === 'all' && /Only the session owner/.test(p3.last('error')?.msg || ''));
p2.send({ t: 'manage', op: 'late', value: 'watch' });
await sleep(150);
check('the owner can make it watch-only mid-game', p2.room.late === 'watch' && p3.room.late === 'watch');
check('watch-only: a new player is turned away', !(await joinNow(s1, 'player')) && /watch only/.test(s1.last('error')?.msg || ''));
check('watch-only: they can still watch', await joinNow(s1, 'spectator'));
await leaveNow(s1);
p2.send({ t: 'manage', op: 'late', value: 'off' });
await sleep(150);
check('closed: nobody new may come in', !(await joinNow(s1, 'spectator')) && /not letting anyone in/.test(s1.last('error')?.msg || ''));
const preview = await (await fetch(`${B}/api/rooms/${code2}`, { headers: { cookie: s1.cookie } })).json();
check('the join-link preview says the run is under way and who may join', preview.state === 'playing' && preview.late === 'off');
p2.send({ t: 'manage', op: 'invite', id: s1.id });
await sleep(150);
check('closed: someone the owner invites still gets in', await joinNow(s1, 'player'));
await leaveNow(s1);
p2.send({ t: 'manage', op: 'late', value: 'all' });
await sleep(150);
check('a player who left can come back in', await joinNow(p4, 'player'));
// a self-hosted session under way takes nobody new: it runs on its owner's device
adm.send({ t: 'create', visibility: 'public', hosting: 'self' });
await sleep(250);
const selfCode = adm.room?.code;
adm.send({ t: 'manage', op: 'state', value: 'playing' });
await sleep(150);
s1.inbox.length = 0;
s1.send({ t: 'join', code: selfCode, as: 'spectator' });
await sleep(200);
check("a self-hosted session under way cannot be joined, even to watch", s1.room?.code !== selfCode && /self-hosted session can only be joined from its lobby/.test(s1.last('error')?.msg || ''));
adm.send({ t: 'manage', op: 'state', value: 'lobby' });
await sleep(150);
check('back in its lobby, it can be joined again', await (async () => { s1.send({ t: 'join', code: selfCode, as: 'spectator' }); await sleep(200); return s1.room?.code === selfCode; })());
s1.send({ t: 'leave' });
adm.send({ t: 'leave' });
await sleep(200);
p2.send({ t: 'leave' });
await sleep(200);
check('the owner leaving hands the session to another player', p3.closed === null && p3.room?.ownerId === p3.id && p3.room.players.length === 2, JSON.stringify(p3.room && { ownerId: p3.room.ownerId, players: p3.room.players.length }));
p4.send({ t: 'manage', op: 'kick', id: p3.id });
await sleep(100);
check('only the new owner can manage it', /Only the session owner/.test(p4.last('error')?.msg || ''));
p4.send({ t: 'leave' });
p3.send({ t: 'leave' });
await sleep(200);
const gone2 = await fetch(`${B}/api/rooms/${code2}`, { headers: { cookie: p4.cookie } });
check('a server-hosted session ends when nobody is left in it', gone2.status === 404);

for (const c of [p2, p3, p4, s1, adm]) c.ws.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
