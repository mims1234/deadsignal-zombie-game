/**
 * Co-op session logic on the client. The room's host runs the real simulation (infected AI, waves, objectives,
 * damage) and broadcasts snapshots; guests and spectators render those snapshots, and guests report their own
 * position and the hits they land. Roles:
 *   host       simulates; every infected hunts the nearest player who is up
 *   guest      plays normally against puppet infected; hits, purges and deaths go through the host
 *   spectator  flies freely and watches (a hidden admin is a spectator nobody is told about)
 */
import type * as THREE from 'three';
import { CARD_MODE, COOP } from '../config';
import type { NetZombie, PlayerRef, ZombieEnv } from '../enemies/zombie';
import type { DirectorContext } from '../enemies/zombieManager';
import type { ZombieMode } from '../enemies/zombieRigTypes';
import type { Game } from '../game/game';
import { spreadPick } from '../logic/carriers';
import { killReward } from '../logic/economy';
import {
  MISSION_KINDS,
  MISSION_STATUSES,
  MISSION_TEXT,
  type WaveMission,
  blocksWaveEnd,
  closeMission,
  createMission,
  eliteKilled,
  missionDetail,
  pickMission,
  playerWentDown,
  stepHold,
  takeCore,
} from '../logic/waveMissions';
import { type WavePhase, createWaves, stepWaves, waveHpScale, waveType } from '../logic/waves';
import { RoomClient, type RoomRole, type RoomView } from '../net/room';
import type { ZombieType } from '../types';
import type { HudState, MapDynamic } from '../ui/hudTypes';
import { type AreaMarker, createAreaMarker, createObjectiveBeam } from '../world/models';
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

/** The objective's markers in the world: the hold circle and a beam over each data core. */
class MissionProps {
  private readonly ring: AreaMarker;
  private readonly beams: THREE.Object3D[] = [];

  constructor(root: THREE.Object3D) {
    this.ring = createAreaMarker(COOP.mission.holdRadius, 0x8fd18a);
    this.ring.root.visible = false;
    root.add(this.ring.root);
    for (let i = 0; i < COOP.mission.cores; i++) {
      const b = createObjectiveBeam(0x6ec6d6);
      b.visible = false;
      root.add(b);
      this.beams.push(b);
    }
  }

  sync(m: WaveMission | null, inside: boolean, dt: number, time: number): void {
    const hold = !!m && m.kind === 'hold' && m.status === 'active';
    this.ring.root.visible = hold;
    if (hold) {
      this.ring.root.position.set(m.x, 0.06, m.z);
      this.ring.setProgress(m.progress);
      this.ring.setActive(inside);
      this.ring.update(dt, time);
    }
    this.beams.forEach((b, i) => {
      const item = m && m.kind === 'collect' && m.status === 'active' ? m.items[i] : undefined;
      b.visible = !!item && !item.taken;
      if (item) b.position.set(item.x, 0, item.z);
    });
  }
}

export class CoopSession {
  readonly room: RoomClient;
  role: CoopRole = 'none';
  waves = createWaves();
  /** The current wave's objective (kept through the following break so its result stays on screen). */
  mission: WaveMission | null = null;
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
  private props: MissionProps | null = null;
  private elitePending = false;
  /** Carrier (0-based) waiting for a spawn spot, or -1. */
  private carrierPending = -1;
  private carrierOrder: number[] = [];

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
    this.mission = null;
    this.g.zombies.netDamage = null;
    this.g.cards.coopMode = 'off';
    this.props?.sync(null, false, 0, 0);
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
  }

  private dropPeer(id: string): void {
    this.peers.delete(id);
    this.avatars.get(id)?.dispose();
    this.avatars.delete(id);
  }

  /** A run is starting on this client (called from the game's reset). */
  begin(): void {
    const g = this.g;
    this.started = this.role !== 'none';
    const remote = this.role === 'guest' || this.role === 'spectator';
    g.zombies.netDamage = remote ? (z, a, h, y) => this.room.send('host', { k: 'hit', z: z.netId, a: r1(a), h, y: r2(y) }) : null;
    g.zombies.carrierRig = (i) => g.cards.rigFor(i);
    g.cards.coopMode = this.role === 'host' ? 'host' : remote ? 'remote' : 'off';
    g.cards.onCoopCure = (id) => this.room.send('host', { k: 'cure', id });
    g.cards.onCoopTake = (id) => this.room.send('host', { k: 'take', id });
    g.cards.onCoopRecovered = (id) => {
      this.room.send('all', { k: 'card', id });
      g.cards.award(id, COOP.carrierReward);
    };
    this.props ??= new MissionProps(g.worldRoot);
    this.me = { kills: 0, downs: 0 };
    this.mission = null;
    this.seenWave = 0;
    this.seenPhase = 'break';
    this.spawnT = 0;
    this.sendT = 0;
    this.elitePending = false;
    this.carrierPending = -1;
    if (this.role === 'host') {
      this.gen++;
      this.endedGen = -1;
      this.waves = createWaves();
      this.carrierOrder = COOP.carrierWaves.map((_, i) => i).sort(() => g.rng.f() - 0.5);
      for (const p of this.peers.values()) {
        p.kills = 0;
        p.downs = 0;
        p.env = null;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // host simulation
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

  /** Every player who is up, the local one included (host side). */
  private upPlayers(): PlayerRef[] {
    const out: PlayerRef[] = [];
    if (this.g.playerAlive()) out.push(this.g.zenv.player);
    for (const p of this.peers.values()) if (p.ref.alive) out.push(p.ref);
    return out;
  }

  /** Free spots around the squad for an objective: not on top of anyone, not across the map. */
  private sites(count: number): { x: number; z: number }[] {
    const g = this.g;
    const up = this.upPlayers();
    const cx = up.reduce((a, p) => a + p.x, 0) / Math.max(1, up.length);
    const cz = up.reduce((a, p) => a + p.z, 0) / Math.max(1, up.length);
    let pool = g.level.data.ambient.filter((a) => {
      const d = Math.hypot(a.x - cx, a.z - cz);
      return d > 14 && d < 60;
    });
    if (pool.length < count) pool = g.level.data.ambient;
    return spreadPick(pool, count, () => g.rng.f()).map((i) => pool[i]!);
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
    const m = this.mission;
    // an open hold / collect objective keeps the wave alive with a trickle of infected
    const trickle = w.phase === 'active' && blocksWaveEnd(m) && w.toSpawn <= 1;
    if (trickle) w.toSpawn = 1;
    const event = stepWaves(w, dt, g.zombies.hostileCount, up, envs.length);
    if (event === 'wave-start') this.onWaveStart();
    else if ((event === 'wave-clear' || event === 'won') && m && closeMission(m)) this.payBonus(m);
    if (w.phase === 'active') this.stepMission(dt);

    if (w.phase === 'active' && (w.toSpawn > 0 || w.bossPending || this.elitePending || this.carrierPending >= 0)) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && g.zombies.hostileCount < COOP.activeCap) {
        this.spawnT = trickle ? COOP.mission.trickleEvery : COOP.spawnEvery;
        this.spawnOne(envs);
      }
    }
    this.left = w.toSpawn + (w.bossPending ? 1 : 0) + g.zombies.hostileCount - (trickle ? 1 : 0);
  }

  private onWaveStart(): void {
    const g = this.g;
    const n = this.waves.n;
    const kind = pickMission(n, g.rng.f());
    this.mission = kind ? createMission(kind, n, this.sites(COOP.mission.cores)) : null;
    this.elitePending = kind === 'elite';
    const slot = (COOP.carrierWaves as readonly number[]).indexOf(n);
    if (slot >= 0) this.carrierPending = this.carrierOrder[slot] ?? -1;
  }

  private stepMission(dt: number): void {
    const g = this.g;
    const m = this.mission;
    if (!m || m.status !== 'active') return;
    const up = this.upPlayers();
    let done = false;
    if (m.kind === 'hold') {
      done = stepHold(m, dt, up.filter((p) => Math.hypot(p.x - m.x, p.z - m.z) < m.radius).length);
    } else if (m.kind === 'collect') {
      m.items.forEach((item, i) => {
        if (!item.taken && up.some((p) => Math.hypot(p.x - item.x, p.z - item.z) < COOP.mission.coreRadius)) {
          done = takeCore(m, i) || done;
          g.fx.sparkle({ x: item.x, y: 0.8, z: item.z }, 0x6ec6d6, 16);
        }
      });
    } else if (m.kind === 'elite' && m.eliteId > 0) {
      const z = g.zombies.zombies.find((q) => q.id === m.eliteId);
      if (!z || !z.alive) done = eliteKilled(m);
    }
    if (done) this.payBonus(m);
  }

  /** Objective complete: every player is paid. */
  private payBonus(m: WaveMission): void {
    const title = MISSION_TEXT[m.kind].title;
    this.room.send('all', { k: 'bonus', c: m.reward, t: title });
    this.g.grantBonus(m.reward, title);
  }

  /** A spawn point a fair distance from `t` that its flow field can reach. */
  private farSpot(t: PlayerRef, env: ZombieEnv): { x: number; z: number } | null {
    const g = this.g;
    const spots = g.level.data.spawnPoints.filter((s) => {
      const d = Math.hypot(s.x - t.x, s.z - t.z);
      return d > 24 && d < 75 && env.field.isReachable(s.x, s.z);
    });
    return spots[Math.floor(g.rng.f() * spots.length)] ?? null;
  }

  private spawnOne(envs: ZombieEnv[]): void {
    const g = this.g;
    const upEnvs = envs.filter((e) => e.player.alive);
    if (upEnvs.length === 0) return;
    const env = upEnvs[Math.floor(g.rng.f() * upEnvs.length)]!;
    const t = env.player;
    const w = this.waves;
    if (w.bossPending) {
      const s = this.farSpot(t, env);
      if (!s) return;
      const boss = g.zombies.spawn('warden', s.x, s.z, g.rng, { boss: true, hpScale: 0.3 + 0.2 * envs.length });
      g.zombies.boss = boss;
      boss.aggro(t.x, t.z);
      w.bossPending = false;
      return;
    }
    if (this.carrierPending >= 0) {
      const s = this.farSpot(t, env);
      if (!s) return;
      const z = g.cards.coopSpawn(this.carrierPending, s.x, s.z, 0.75 + 0.25 * envs.length);
      z?.aggro(t.x, t.z);
      this.carrierPending = -1;
      return;
    }
    const ctx: DirectorContext = { elapsed: g.session.elapsed, playerX: t.x, playerZ: t.z, playerYaw: 0, playerEyeY: t.eyeY, region: 'low', phase: 0, quality: g.settings.quality, defenseActive: false, extractionElapsed: null, paused: false };
    if (this.elitePending && this.mission) {
      if (g.zombies.spawnForWave('armored', waveHpScale(w.n) * COOP.mission.eliteHp, ctx, env, g.rng)) {
        this.mission.eliteId = g.zombies.zombies[g.zombies.zombies.length - 1]!.id;
        this.elitePending = false;
      }
      return;
    }
    if (w.toSpawn > 0 && g.zombies.spawnForWave(waveType(w.n, g.rng.f()), waveHpScale(w.n), ctx, env, g.rng)) w.toSpawn--;
  }

  // ---------------------------------------------------------------------------------------------
  // per-frame, every role
  // ---------------------------------------------------------------------------------------------

  /** Networking, avatars, objective markers and the wave banners. Call once per simulated frame while live. */
  update(dt: number): void {
    const g = this.g;
    const room = this.room.room;
    if (!room || !this.live) return;
    g.session.elapsed += dt;
    for (const a of this.avatars.values()) a.update(dt);
    const m = this.mission;
    this.props?.sync(m, !!m && Math.hypot(g.player.x - m.x, g.player.z - m.z) < m.radius, dt, g.time);

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
      const boss = w.n % COOP.bossEvery === 0;
      g.banner(`WAVE ${w.n}`, boss ? 'The Warden is with them' : m ? MISSION_TEXT[m.kind].title : `${this.left} infected inbound`, boss ? 'danger' : 'warn', 3.4);
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
      return [n.id, TYPES.indexOf(n.type), r1(n.x), r1(n.z), r2(n.yaw), MODES.indexOf(n.mode), r2(n.actionT), r2(n.staggerT), r1(n.speed), r2(n.hp), n.flags, n.carrier];
    });
    const me = g.player;
    const p: unknown[][] = [[room.hostId, r1(me.x), r1(me.y), r1(me.z), r2(me.yaw), g.playerAlive() ? 1 : 0, Math.round(g.session.vitals.health), this.me.kills, this.me.downs]];
    for (const q of this.peers.values()) p.push([q.id, r1(q.ref.x), r1(q.ref.y), r1(q.ref.z), r2(q.yaw), q.ref.alive ? 1 : 0, q.hp, q.kills, q.downs]);
    const m = this.mission;
    const mission = m ? [MISSION_KINDS.indexOf(m.kind), MISSION_STATUSES.indexOf(m.status), r2(m.progress), r1(m.x), r1(m.z), m.eliteId, m.reward, ...m.items.flatMap((i) => [r1(i.x), r1(i.z), i.taken ? 1 : 0])] : null;
    this.room.send('all', { k: 's', g: this.gen, w: [w.n, PHASES.indexOf(w.phase), r1(Math.max(0, w.breakLeft)), this.left], z, p, m: mission, c: g.cards.coopState() });
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
        if (p.ref.alive && !up) {
          p.downs++;
          playerWentDown(this.mission);
        }
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
      } else if (d.k === 'cure') {
        // only someone standing next to her can purge her
        const at = g.cards.downedAt(String(d.id));
        if (at && p.ref.alive && Math.hypot(at.x - p.ref.x, at.z - p.ref.z) < CARD_MODE.cureReach + 2.5) g.cards.cure(String(d.id));
      } else if (d.k === 'take') {
        if (p.ref.alive) g.cards.coopTake(String(d.id), p.ref.x, p.ref.z);
      }
      return;
    }
    if (from !== room.hostId) return;
    if (d.k === 's') this.applySnapshot(d);
    else if (this.role !== 'guest') return;
    else if (d.k === 'hurt') g.takeRemoteHit(Number(d.a) || 0, Number(d.sx) || 0, Number(d.sz) || 0, Number(d.kn) || 0);
    else if (d.k === 'kill') g.creditKill(Number(d.c) || 0, String(d.n || 'INFECTED'), d.h === true);
    else if (d.k === 'bonus') g.grantBonus(Number(d.c) || 0, String(d.t || 'OBJECTIVE'));
    else if (d.k === 'card') g.cards.award(String(d.id), COOP.carrierReward);
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
    const list: NetZombie[] = (d.z as number[][]).map((q) => ({ id: q[0]!, type: TYPES[q[1]!] ?? 'shambler', x: q[2]!, z: q[3]!, yaw: q[4]!, mode: MODES[q[5]!] ?? 'idle', actionT: q[6]!, staggerT: q[7]!, speed: q[8]!, hp: q[9]!, flags: q[10]!, carrier: q[11] ?? 0 }));
    g.zombies.syncPuppets(list, g.rng);
    g.cards.coopApply((d.c as number[][] | undefined) ?? [], (carrier) => g.zombies.zombies.find((z) => z.carrierIdx === carrier) ?? null);

    const q = d.m as number[] | null | undefined;
    if (!q) {
      this.mission = null;
    } else {
      const items: WaveMission['items'] = [];
      for (let i = 7; i + 2 < q.length; i += 3) items.push({ x: q[i]!, z: q[i + 1]!, taken: q[i + 2] === 1 });
      this.mission = { kind: MISSION_KINDS[q[0]!] ?? 'flawless', status: MISSION_STATUSES[q[1]!] ?? 'active', progress: q[2]!, x: q[3]!, z: q[4]!, radius: COOP.mission.holdRadius, eliteId: q[5]!, reward: q[6]!, items };
    }

    const myId = this.room.you?.id;
    const seen = new Set<string>();
    for (const row of d.p as unknown[][]) {
      const id = String(row[0]);
      if (id === myId) {
        this.me.kills = Number(row[7]) || 0;
        this.me.downs = Number(row[8]) || 0;
        continue;
      }
      const p = this.peer(id);
      if (!p) continue;
      seen.add(id);
      p.ref.x = Number(row[1]);
      p.ref.y = Number(row[2]);
      p.ref.z = Number(row[3]);
      p.yaw = Number(row[4]);
      p.ref.alive = row[5] === 1;
      p.hp = Number(row[6]);
      p.kills = Number(row[7]);
      p.downs = Number(row[8]);
      this.showAvatar(p);
    }
    for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.dropPeer(id);
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
    if (this.role === 'host') {
      this.me.downs++;
      playerWentDown(this.mission);
    }
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
    const g = this.g;
    const w = this.waves;
    const m = this.mission;
    const resting = w.phase === 'break';
    const cards = st.objectives.filter((o) => o.id === 'cards');
    st.objectives = [
      {
        id: 'wave',
        title: resting ? (w.n === 0 ? 'GET READY' : `WAVE ${w.n} CLEARED`) : `WAVE ${w.n} / ${COOP.waves}`,
        detail: resting ? `Next wave in ${Math.ceil(w.breakLeft)}s` : `${Math.max(0, this.left)} infected left`,
        state: 'active',
        progress: w.n / COOP.waves,
        tracked: !m || m.status !== 'active',
        distance: -1,
      },
    ];
    if (m) {
      const far = m.kind === 'hold' ? Math.hypot(m.x - g.player.x, m.z - g.player.z) : -1;
      st.objectives.push({
        id: 'mission',
        title: MISSION_TEXT[m.kind].title,
        detail: missionDetail(m),
        state: m.status === 'done' ? 'complete' : m.status === 'failed' ? 'failed' : 'active',
        progress: m.kind === 'hold' || m.kind === 'collect' ? m.progress : -1,
        tracked: m.status === 'active',
        distance: m.status === 'active' ? far : -1,
      });
    }
    st.objectives.push(...cards);
    const squad = [...this.peers.values()];
    if (squad.length > 0) {
      st.objectives.push({ id: 'squad', title: 'SQUAD', detail: squad.map((p) => `${p.name}${p.ref.alive ? '' : ' (down)'}`).join('   '), state: 'active', progress: -1, tracked: false, distance: -1 });
    }
    st.timer = resting ? { label: 'NEXT WAVE IN', seconds: w.breakLeft, urgent: w.breakLeft < 5 } : { label: `WAVE ${w.n} OF ${COOP.waves}`, seconds: g.session.elapsed, urgent: false };
    st.subTimer = null;
    const boss = g.zombies.boss;
    st.boss = boss && boss.alive ? { name: 'THE WARDEN', fraction: Math.max(0, boss.hp / boss.maxHp), enraged: boss.enraged } : g.cards.bossInfo();

    md.markers = md.markers.filter((k) => k.kind === 'buy' || k.kind === 'upgrade' || k.kind === 'crate' || k.kind === 'start' || k.id.startsWith('card:'));
    for (const p of this.peers.values()) {
      if (p.ref.alive) md.markers.push({ id: `mate:${p.id}`, kind: 'objective', x: p.ref.x, z: p.ref.z, label: p.name.toUpperCase(), color: '#8fd18a', visible: true, compass: true });
    }
    if (m && m.status === 'active') {
      if (m.kind === 'hold') md.markers.push({ id: 'm:hold', kind: 'objective', x: m.x, z: m.z, label: 'HOLD', color: '#8fd18a', radius: m.radius, visible: true, compass: true, pulse: true });
      m.items.forEach((item, i) => {
        if (!item.taken) md.markers.push({ id: `m:core${i}`, kind: 'objective', x: item.x, z: item.z, label: 'CORE', color: '#6ec6d6', visible: true, compass: true });
      });
      const elite = m.kind === 'elite' ? g.zombies.zombies.find((z) => (z.puppet ? z.netId : z.id) === m.eliteId && z.alive) : undefined;
      if (elite) md.markers.push({ id: 'm:elite', kind: 'hunt', x: elite.x, z: elite.z, label: 'THE HUNTER', color: '#ff5a4d', visible: true, compass: true, pulse: true });
    }
  }
}
