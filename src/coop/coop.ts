/**
 * Co-op session logic on the client. The room's host runs the real simulation (infected AI, waves, damage) and
 * broadcasts snapshots; guests and spectators render those snapshots, and guests report their own position and the
 * hits they land. Roles:
 *   host       simulates; every infected hunts the nearest player who is up
 *   guest      plays normally against puppet infected; hits and deaths go through the host
 *   spectator  flies freely and watches (a hidden admin is a spectator nobody is told about)
 */
import { COOP } from '../config';
import type { NetZombie, PlayerRef, ZombieEnv } from '../enemies/zombie';
import type { DirectorContext } from '../enemies/zombieManager';
import type { ZombieMode } from '../enemies/zombieRigTypes';
import type { Game } from '../game/game';
import { killReward } from '../logic/economy';
import { type WavePhase, createWaves, stepWaves, waveHpScale, waveType } from '../logic/waves';
import { RoomClient, type RoomRole, type RoomView } from '../net/room';
import type { ZombieType } from '../types';
import type { HudState, MapDynamic } from '../ui/hudTypes';
import { FlowField } from '../world/nav';
import { Avatar } from './avatar';

const MODES: ZombieMode[] = ['idle', 'walk', 'run', 'attack', 'stagger', 'death', 'slam', 'charge', 'roar'];
const TYPES: ZombieType[] = ['shambler', 'runner', 'armored', 'warden'];
const PHASES: WavePhase[] = ['break', 'active', 'won', 'lost'];
const r1 = (v: number): number => Math.round(v * 10) / 10;
const r2 = (v: number): number => Math.round(v * 100) / 100;

export type CoopRole = 'none' | 'host' | 'guest' | 'spectator';

interface Peer {
  id: string;
  name: string;
  ref: PlayerRef;
  yaw: number;
  hp: number;
  kills: number;
  downs: number;
  /** Game time of the last report (host side). */
  seen: number;
  env: ZombieEnv | null;
  field: FlowField | null;
  fieldT: number;
}

export interface ScoreRow {
  id: string;
  name: string;
  kills: number;
  downs: number;
  alive: boolean;
  you: boolean;
  host: boolean;
}

export class CoopSession {
  readonly room: RoomClient;
  role: CoopRole = 'none';
  waves = createWaves();
  /** Infected still to deal with in the current wave. */
  left = 0;
  /** This client has deployed into the session. */
  started = false;
  /** Shown by the lobby: the last refusal from the server, and why the session closed. */
  lastError = '';
  closedReason = '';
  /** The lobby redraws on this. */
  onChange: () => void = () => {};
  private gen = 0;
  private endedGen = -1;
  private readonly peers = new Map<string, Peer>();
  private readonly avatars = new Map<string, Avatar>();
  private me = { kills: 0, downs: 0 };
  private killer: string | null = null;
  private spawnT = 0;
  private sendT = 0;
  private seenWave = 0;
  private seenPhase: WavePhase = 'break';

  constructor(private readonly g: Game) {
    this.room = new RoomClient({
      onRoom: (room, you) => this.onRoom(room, you),
      onRelay: (from, d) => this.onRelay(from, d),
      onClosed: (reason) => {
        this.closedReason = reason;
        this.cleanup();
        this.g.coopClosed(reason);
        this.onChange();
      },
      onError: (msg) => {
        this.lastError = msg;
        this.onChange();
      },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // membership
  // ---------------------------------------------------------------------------------------------

  /** Deployed and connected: the co-op rules are in force. */
  get live(): boolean {
    return this.started && this.role !== 'none';
  }

  /** The host has started the session, so this client may deploy into it. */
  get canDeploy(): boolean {
    return this.room.room?.state === 'playing';
  }

  private onRoom(room: RoomView | null, you: { id: string; role: RoomRole; hidden: boolean } | null): void {
    if (!room || !you) {
      this.cleanup();
    } else {
      this.lastError = '';
      this.closedReason = '';
      this.role = you.role === 'spectator' ? 'spectator' : room.hostId === you.id ? 'host' : 'guest';
      // drop anyone who is no longer a player
      for (const id of [...this.peers.keys()]) if (!room.players.some((p) => p.id === id)) this.dropPeer(id);
    }
    this.onChange();
  }

  /** Host: open the session for play. */
  start(): void {
    if (this.role !== 'host' || !this.room.room) return;
    this.room.manage('state', { value: 'playing' });
    this.room.room.state = 'playing'; // the server will confirm; the host deploys in the same click
  }

  leave(): void {
    this.room.leave();
    this.cleanup();
  }

  private cleanup(): void {
    this.role = 'none';
    this.started = false;
    this.g.zombies.netDamage = null;
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
    for (const a of this.avatars.values()) a.dispose();
    this.avatars.clear();
  }

  private dropPeer(id: string): void {
    this.peers.delete(id);
    this.avatars.get(id)?.dispose();
    this.avatars.delete(id);
  }

  /** A run is starting on this client (called from the game's reset). */
  begin(): void {
    this.started = this.role !== 'none';
    this.g.zombies.netDamage = this.role === 'guest' || this.role === 'spectator' ? (z, a, h, y) => this.room.send('host', { k: 'hit', z: z.netId, a: r1(a), h, y: r2(y) }) : null;
    this.me = { kills: 0, downs: 0 };
    this.seenWave = 0;
    this.seenPhase = 'break';
    this.spawnT = 0;
    this.sendT = 0;
    if (this.role === 'host') {
      this.gen++;
      this.endedGen = -1;
      this.waves = createWaves();
      for (const p of this.peers.values()) {
        p.kills = 0;
        p.downs = 0;
        p.env = null;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // per-frame
  // ---------------------------------------------------------------------------------------------

  private peer(id: string): Peer | null {
    let p = this.peers.get(id);
    if (p) return p;
    const person = this.room.room?.players.find((q) => q.id === id);
    if (!person || id === this.room.you?.id) return null;
    p = { id, name: person.name, ref: { x: 0, y: 0, z: 0, eyeY: 1.6, alive: false, sprinting: false }, yaw: 0, hp: 100, kills: 0, downs: 0, seen: 0, env: null, field: null, fieldT: 0 };
    this.peers.set(id, p);
    return p;
  }

  /** Replaces the single-player enemy update while a session is live. */
  updateEnemies(dt: number, alive: boolean): void {
    const g = this.g;
    if (this.role !== 'host') {
      g.zombies.updatePuppets(dt, g.zenv);
      return;
    }
    const envs: ZombieEnv[] = [g.zenv];
    let up = alive ? 1 : 0;
    for (const p of this.peers.values()) {
      // a guest that stopped reporting (tab in the background, connection gone) is not a target
      if (g.time - p.seen > 4) p.ref.alive = false;
      if (!p.field) p.field = new FlowField(g.level.nav);
      if (!p.env) {
        const id = p.id;
        p.env = { ...g.zenv, player: p.ref, field: p.field, hurtPlayer: (amount, sx, sz, _kind, knock) => this.room.send(id, { k: 'hurt', a: r1(amount), sx: r1(sx), sz: r1(sz), kn: knock }) };
      }
      p.env.time = g.zenv.time;
      p.env.rng = g.zenv.rng;
      p.fieldT -= dt;
      if (p.ref.alive && p.fieldT <= 0) {
        p.field.compute(p.ref.x, p.ref.z);
        p.fieldT = 0.4;
      }
      if (p.ref.alive) up++;
      envs.push(p.env);
    }
    g.zombies.update(dt, g.zenv, up > 0, envs.length > 1 ? envs : undefined);

    const w = this.waves;
    stepWaves(w, dt, g.zombies.aliveCount, up, envs.length);
    if (w.phase === 'active' && (w.toSpawn > 0 || w.bossPending)) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && g.zombies.aliveCount < COOP.activeCap) {
        this.spawnT = COOP.spawnEvery;
        this.spawnOne(envs);
      }
    }
    this.left = w.toSpawn + (w.bossPending ? 1 : 0) + g.zombies.aliveCount;
  }

  private spawnOne(envs: ZombieEnv[]): void {
    const g = this.g;
    const upEnvs = envs.filter((e) => e.player.alive);
    if (upEnvs.length === 0) return;
    const env = upEnvs[Math.floor(g.rng.f() * upEnvs.length)]!;
    const t = env.player;
    const w = this.waves;
    if (w.bossPending) {
      const spots = g.level.data.spawnPoints.filter((s) => {
        const d = Math.hypot(s.x - t.x, s.z - t.z);
        return d > 24 && d < 75 && env.field.isReachable(s.x, s.z);
      });
      const s = spots[Math.floor(g.rng.f() * spots.length)];
      if (!s) return;
      const boss = g.zombies.spawn('warden', s.x, s.z, g.rng, { boss: true, hpScale: 0.3 + 0.2 * envs.length });
      g.zombies.boss = boss;
      boss.aggro(t.x, t.z);
      w.bossPending = false;
      return;
    }
    const ctx: DirectorContext = { elapsed: g.session.elapsed, playerX: t.x, playerZ: t.z, playerYaw: 0, playerEyeY: t.eyeY, region: 'low', phase: 0, quality: g.settings.quality, defenseActive: false, extractionElapsed: null, paused: false };
    if (g.zombies.spawnForWave(waveType(w.n, g.rng.f()), waveHpScale(w.n), ctx, env, g.rng)) w.toSpawn--;
  }

  /** Networking, avatars and the wave banners. Call once per simulated frame while live. */
  update(dt: number): void {
    const g = this.g;
    const room = this.room.room;
    if (!room || !this.live) return;
    g.session.elapsed += dt;
    for (const a of this.avatars.values()) a.update(dt);

    this.sendT -= dt;
    if (this.sendT <= 0) {
      if (this.role === 'host') {
        this.sendT = 1 / COOP.snapshotHz;
        this.sendSnapshot(room);
      } else if (this.role === 'guest') {
        this.sendT = 1 / COOP.reportHz;
        const p = g.player;
        this.room.send('host', { k: 'p', x: r1(p.x), y: r1(p.y), z: r1(p.z), yaw: r2(p.yaw), up: g.playerAlive(), hp: Math.round(g.session.vitals.health) });
      }
    }
    if (this.role === 'host') {
      for (const p of this.peers.values()) this.showAvatar(p);
    }

    // wave changes, the same for everyone
    const w = this.waves;
    if (w.n !== this.seenWave && w.phase === 'active') {
      this.seenWave = w.n;
      g.banner(`WAVE ${w.n}`, w.n % COOP.bossEvery === 0 ? 'The Warden is with them' : `${this.left || ''} infected inbound`.trim(), w.n % COOP.bossEvery === 0 ? 'danger' : 'warn', 3.2);
      g.audio.play('klaxon', { priority: 2, volume: 0.5 });
    }
    if (w.phase !== this.seenPhase) {
      const was = this.seenPhase;
      this.seenPhase = w.phase;
      if (w.phase === 'break' && was === 'active') {
        g.banner(`WAVE ${w.n} CLEARED`, `Next wave in ${COOP.breakTime} seconds - resupply`, 'good', 3.5);
        g.audio.play('contract_complete', { priority: 3 });
        if (this.role !== 'spectator' && !g.playerAlive()) g.revivePlayer();
      } else if ((w.phase === 'won' || w.phase === 'lost') && this.endedGen !== this.gen) {
        this.endedGen = this.gen;
        // the host stops simulating once its results are up, so the outcome has to go out now
        if (this.role === 'host') this.sendSnapshot(room);
        if (this.role === 'spectator') g.banner(w.phase === 'won' ? 'SESSION COMPLETE' : 'SQUAD WIPED OUT', undefined, w.phase === 'won' ? 'good' : 'danger', 6);
        else g.finishCoop(w.phase === 'won' ? 'victory' : 'defeat', w.phase === 'won' ? `Survived all ${COOP.waves} waves` : `Squad wiped out on wave ${w.n}`);
      }
    }
  }

  private showAvatar(p: Peer): void {
    let a = this.avatars.get(p.id);
    if (!a) {
      a = new Avatar(p.name, this.avatars.size);
      this.g.worldRoot.add(a.root);
      this.avatars.set(p.id, a);
    }
    a.set(p.ref.x, p.ref.y, p.ref.z, p.yaw, p.ref.alive);
  }

  // ---------------------------------------------------------------------------------------------
  // messages
  // ---------------------------------------------------------------------------------------------

  private sendSnapshot(room: RoomView): void {
    const g = this.g;
    const w = this.waves;
    const z = g.zombies.zombies.map((q) => {
      const n = q.toNet();
      return [n.id, TYPES.indexOf(n.type), r1(n.x), r1(n.z), r2(n.yaw), MODES.indexOf(n.mode), r2(n.actionT), r2(n.staggerT), r1(n.speed), r2(n.hp), n.flags];
    });
    const me = g.player;
    const p: unknown[][] = [[room.hostId, r1(me.x), r1(me.y), r1(me.z), r2(me.yaw), g.playerAlive() ? 1 : 0, Math.round(g.session.vitals.health), this.me.kills, this.me.downs]];
    for (const q of this.peers.values()) p.push([q.id, r1(q.ref.x), r1(q.ref.y), r1(q.ref.z), r2(q.yaw), q.ref.alive ? 1 : 0, q.hp, q.kills, q.downs]);
    this.room.send('all', { k: 's', g: this.gen, w: [w.n, PHASES.indexOf(w.phase), r1(Math.max(0, w.breakLeft)), this.left], z, p });
  }

  private onRelay(from: string, d: Record<string, unknown>): void {
    const g = this.g;
    const room = this.room.room;
    if (!room || !this.live) return;
    if (this.role === 'host') {
      if (from === 'server') {
        if (d.k === 'left') this.dropPeer(String(d.id));
        return;
      }
      const p = this.peer(from);
      if (!p) return;
      if (d.k === 'p') {
        const up = d.up === true;
        if (p.ref.alive && !up) p.downs++;
        p.ref.x = Number(d.x) || 0;
        p.ref.y = Number(d.y) || 0;
        p.ref.z = Number(d.z) || 0;
        p.ref.eyeY = p.ref.y + 1.6;
        p.ref.alive = up;
        p.yaw = Number(d.yaw) || 0;
        p.hp = Number(d.hp) || 0;
        p.seen = g.time;
      } else if (d.k === 'hit') {
        const z = g.zombies.zombies.find((q) => q.id === d.z);
        if (!z || !z.alive) return;
        this.killer = from;
        // a single hit can never do more than the strongest weapon plausibly could
        g.zombies.damage(z, Math.max(0, Math.min(600, Number(d.a) || 0)), d.h === true, g.zenv, Number(d.y) || 0);
        this.killer = null;
      }
      return;
    }
    if (from !== room.hostId) return;
    if (d.k === 's') this.applySnapshot(d);
    else if (d.k === 'hurt' && this.role === 'guest') g.takeRemoteHit(Number(d.a) || 0, Number(d.sx) || 0, Number(d.sz) || 0, Number(d.kn) || 0);
    else if (d.k === 'kill' && this.role === 'guest') g.creditKill(Number(d.c) || 0, String(d.n || 'INFECTED'), d.h === true);
  }

  private applySnapshot(d: Record<string, unknown>): void {
    const g = this.g;
    const w = d.w as number[];
    const gen = Number(d.g) || 0;
    if (gen !== this.gen) {
      // the host started a fresh run
      this.gen = gen;
      this.seenWave = 0;
      this.seenPhase = 'break';
      if (this.role === 'guest' && !g.playerAlive()) g.revivePlayer();
    }
    this.waves.n = w[0] ?? 0;
    this.waves.phase = PHASES[w[1] ?? 0] ?? 'break';
    this.waves.breakLeft = w[2] ?? 0;
    this.left = w[3] ?? 0;
    const list: NetZombie[] = (d.z as number[][]).map((q) => ({ id: q[0]!, type: TYPES[q[1]!] ?? 'shambler', x: q[2]!, z: q[3]!, yaw: q[4]!, mode: MODES[q[5]!] ?? 'idle', actionT: q[6]!, staggerT: q[7]!, speed: q[8]!, hp: q[9]!, flags: q[10]! }));
    g.zombies.syncPuppets(list, g.rng);
    const myId = this.room.you?.id;
    const seen = new Set<string>();
    for (const q of d.p as unknown[][]) {
      const id = String(q[0]);
      if (id === myId) {
        this.me.kills = Number(q[7]) || 0;
        this.me.downs = Number(q[8]) || 0;
        continue;
      }
      const p = this.peer(id) ?? this.hostPeer(id);
      if (!p) continue;
      seen.add(id);
      p.ref.x = Number(q[1]);
      p.ref.y = Number(q[2]);
      p.ref.z = Number(q[3]);
      p.yaw = Number(q[4]);
      p.ref.alive = q[5] === 1;
      p.hp = Number(q[6]);
      p.kills = Number(q[7]);
      p.downs = Number(q[8]);
      this.showAvatar(p);
    }
    for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.dropPeer(id);
  }

  /** A spectator is not in the player list, so `peer()` cannot tell it who the others are by exclusion alone. */
  private hostPeer(id: string): Peer | null {
    const person = this.room.room?.players.find((q) => q.id === id);
    if (!person) return null;
    const p: Peer = { id, name: person.name, ref: { x: 0, y: 0, z: 0, eyeY: 1.6, alive: false, sprinting: false }, yaw: 0, hp: 100, kills: 0, downs: 0, seen: 0, env: null, field: null, fieldT: 0 };
    this.peers.set(id, p);
    return p;
  }

  /** Host: who gets the kill. True when it was another player's (they are paid; the host is not). */
  onKill(z: { def: { name: string; reward: number; headshotBonus: number } }, head: boolean): boolean {
    if (this.role !== 'host') return false;
    const p = this.killer ? this.peers.get(this.killer) : null;
    if (!p) {
      this.me.kills++;
      return false;
    }
    p.kills++;
    this.room.send(p.id, { k: 'kill', n: z.def.name, h: head, c: killReward(z.def as never, head, 'low') });
    return true;
  }

  onLocalDeath(): void {
    if (this.role === 'host') this.me.downs++;
    this.g.banner('YOU ARE DOWN', 'You return when the wave is cleared', 'danger', 5);
  }

  // ---------------------------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------------------------

  /** Where a spectator should start looking: the first player who is up. */
  focusPoint(): { x: number; y: number; z: number } | null {
    for (const p of this.peers.values()) if (p.ref.alive) return p.ref;
    return null;
  }

  scoreboard(): { rows: ScoreRow[]; spectators: string[] } {
    const room = this.room.room;
    const rows: ScoreRow[] = [];
    if (!room) return { rows, spectators: [] };
    const myId = this.room.you?.id ?? '';
    if (this.role !== 'spectator') rows.push({ id: myId, name: this.g.account.user?.name ?? 'You', kills: this.me.kills, downs: this.me.downs, alive: this.g.playerAlive(), you: true, host: room.hostId === myId });
    for (const p of this.peers.values()) rows.push({ id: p.id, name: p.name, kills: p.kills, downs: p.downs, alive: p.ref.alive, you: false, host: room.hostId === p.id });
    return { rows, spectators: room.spectators.map((s) => s.name) };
  }

  /** Swap the solo mission readouts for the wave ones. */
  decorateHud(st: HudState, md: MapDynamic): void {
    const w = this.waves;
    const resting = w.phase === 'break';
    st.objectives = [
      {
        id: 'wave',
        title: resting ? (w.n === 0 ? 'GET READY' : `WAVE ${w.n} CLEARED`) : `WAVE ${w.n} / ${COOP.waves}`,
        detail: resting ? `Next wave in ${Math.ceil(w.breakLeft)}s` : `${this.left} infected left`,
        state: 'active',
        progress: w.n / COOP.waves,
        tracked: true,
        distance: -1,
      },
    ];
    const squad = [...this.peers.values()];
    if (squad.length > 0) {
      st.objectives.push({ id: 'squad', title: 'SQUAD', detail: squad.map((p) => `${p.name}${p.ref.alive ? '' : ' (down)'}`).join('   '), state: 'active', progress: -1, tracked: false, distance: -1 });
    }
    st.timer = resting ? { label: 'NEXT WAVE IN', seconds: w.breakLeft, urgent: w.breakLeft < 5 } : { label: `WAVE ${w.n} OF ${COOP.waves}`, seconds: this.g.session.elapsed, urgent: false };
    st.subTimer = null;
    const boss = this.g.zombies.boss;
    st.boss = boss && boss.alive ? { name: 'THE WARDEN', fraction: Math.max(0, boss.hp / boss.maxHp), enraged: boss.enraged } : null;
    md.markers = md.markers.filter((m) => m.kind === 'buy' || m.kind === 'upgrade' || m.kind === 'crate' || m.kind === 'start');
    for (const p of this.peers.values()) {
      if (p.ref.alive) md.markers.push({ id: `mate:${p.id}`, kind: 'objective', x: p.ref.x, z: p.ref.z, label: p.name.toUpperCase(), color: '#8fd18a', visible: true, compass: true });
    }
  }
}
