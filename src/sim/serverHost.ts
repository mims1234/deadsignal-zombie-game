/**
 * The co-op host, run by the server instead of a player's browser: waves, the infected, wave objectives, the squad's
 * relay and the Mazoku carriers, for every player at once. It speaks exactly the protocol a browser host speaks
 * (see `coop/coop.ts`), so to the players' browsers it is simply a host that never plays and never leaves.
 *
 * In:  `message(from, d)` - a player's report ('p'), hit, purge, card pick-up, relay start; the owner's 'cfg' and
 *      'restart'; `players(list)` - who is seated; `tick(dt)` - advance the simulation.
 * Out: `send(to, d)` - to 'all' or one player id.
 */
import * as THREE from 'three';
import { CARD_MODE, COOP, ZOMBIES, type ZombieDef } from '../config';
import { CARRIERS } from '../cards/roster';
import type { PlayerRef, Zombie, ZombieEnv } from '../enemies/zombie';
import { type DirectorContext, ZombieManager } from '../enemies/zombieManager';
import { type CarrierState, createCarrier, downCarrier, purgeCarrier, recoverCarrier, spreadPick, tickCarrier } from '../logic/carriers';
import { type ContractStatus, activateDefense, createDefense, updateDefense } from '../logic/contracts';
import { killReward } from '../logic/economy';
import { Rng } from '../logic/rng';
import {
  MISSION_KINDS,
  MISSION_STATUSES,
  MISSION_TEXT,
  type WaveMission,
  blocksWaveEnd,
  closeMission,
  createMission,
  eliteKilled,
  pickMission,
  playerWentDown,
  stepHold,
  takeCore,
} from '../logic/waveMissions';
import { type WavePhase, createWaves, stepWaves, waveHpScale, waveType } from '../logic/waves';
import type { ZombieType } from '../types';
import type { ZombieMode } from '../enemies/zombieRigTypes';
import { buildLevel, type Level } from '../world/level';
import type { MapId } from '../world/layout/data';
import type { MaterialLib } from '../world/materials';
import { FlowField } from '../world/nav';
import { createNullRigFactory } from './nullRig';

const MODES: ZombieMode[] = ['idle', 'walk', 'run', 'attack', 'stagger', 'death', 'slam', 'charge', 'roar'];
const TYPES: ZombieType[] = ['shambler', 'runner', 'armored', 'warden'];
const PHASES: WavePhase[] = ['break', 'active', 'won', 'lost'];
const RELAY_STATUSES: ContractStatus[] = ['available', 'active', 'complete'];
const CARRIER_PHASES: readonly CarrierState['phase'][] = ['roaming', 'identified', 'downed', 'purged', 'recovered'];
const r1 = (v: number): number => Math.round(v * 10) / 10;
const r2 = (v: number): number => Math.round(v * 100) / 100;

/** A player sends a report this often; one silent this long is treated as away (not a target, not "up"). */
const AWAY_AFTER = 4;

interface Peer {
  id: string;
  name: string;
  ref: PlayerRef;
  yaw: number;
  hp: number;
  kills: number;
  downs: number;
  seen: number;
  env: ZombieEnv;
  field: FlowField;
  fieldT: number;
}

interface CarrierUnit {
  index: number;
  stats: ZombieDef;
  base: 'shambler' | 'runner';
  zombie: Zombie | null;
  state: CarrierState | null;
  lootX: number;
  lootZ: number;
}

/** The level builder wants materials; the server never draws, so one blank material stands in for all of them. */
function blankMaterials(): MaterialLib {
  const m = new THREE.MeshStandardMaterial();
  m.userData.tile = 2;
  const t = new THREE.Texture();
  return { get: () => m, decal: () => m, stencil: () => m, glowTexture: t, lightPoolTexture: t, dispose() {} };
}

const noop = (): void => {};
/** Sounds and effects go nowhere on the server. */
const silent: unknown = new Proxy({}, { get: () => () => ({ stop: noop, setPosition: noop, intensity: () => 0, setVolume: noop, active: false }) });

export interface ServerHostOptions {
  map?: MapId;
  seed?: number;
  send(to: string, d: Record<string, unknown>): void;
}

export class ServerHost {
  readonly level: Level;
  readonly zombies: ZombieManager;
  private readonly rng: Rng;
  private readonly peers = new Map<string, Peer>();
  private seated = new Map<string, string>();
  private readonly send: ServerHostOptions['send'];
  private time = 0;
  private gen = 0;
  private running = false;
  private waves = createWaves();
  private mission: WaveMission | null = null;
  private defense = createDefense();
  private left = 0;
  private spawnT = 0;
  private sendT = 0;
  private elitePending = false;
  private carrierPending = -1;
  private carrierOrder: number[] = [];
  private readonly carriers: CarrierUnit[];
  private killer: string | null = null;
  private ended = false;
  mazoku = false;

  constructor(opts: ServerHostOptions) {
    this.send = opts.send;
    this.rng = new Rng(opts.seed ?? (Date.now() & 0x7fffffff));
    this.level = buildLevel(blankMaterials(), opts.map ?? 'district');
    // nothing is ever drawn here: let the geometry go
    this.level.root.clear();
    this.zombies = new ZombieManager(createNullRigFactory(), this.level);
    this.zombies.onKill = (z, head) => this.onKill(z, head);
    this.carriers = CARRIERS.map((def, index) => {
      const base = ZOMBIES[def.base];
      const stats: ZombieDef = { ...base, name: def.name, hp: def.hp, speedChase: def.speedChase, damage: def.damage, bodyMul: def.bodyMul, poise: def.poise, radius: 0.3, height: def.height, headRadius: 0.18, sightRange: 30, reward: 0, headshotBonus: 0, dropChance: 0 };
      return { index, stats, base: def.base, zombie: null, state: null, lootX: 0, lootZ: 0 };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // membership and control
  // ---------------------------------------------------------------------------------------------

  /** Who holds a player seat right now (spectators are not listed). */
  players(list: readonly { id: string; name: string }[]): void {
    this.seated = new Map(list.map((p) => [p.id, p.name]));
    for (const id of [...this.peers.keys()]) if (!this.seated.has(id)) this.peers.delete(id);
    // whoever just arrived learns which variant this is
    this.send('all', { k: 'cfg', mz: this.mazoku });
  }

  /** A fresh run (the owner started the session, or asked for another go after the results). */
  begin(): void {
    this.gen++;
    this.running = true;
    this.ended = false;
    this.time = 0;
    this.waves = createWaves();
    this.mission = null;
    this.defense = createDefense();
    this.left = 0;
    this.spawnT = 0;
    this.sendT = 0;
    this.elitePending = false;
    this.carrierPending = -1;
    this.carrierOrder = COOP.carrierWaves.map((_, i) => i).sort(() => this.rng.f() - 0.5);
    this.zombies.clearAll();
    for (const u of this.carriers) {
      u.zombie = null;
      u.state = null;
    }
    for (const p of this.peers.values()) {
      p.kills = 0;
      p.downs = 0;
      p.ref.alive = false;
    }
  }

  /** The run is over (won or lost) and nobody has asked for another. */
  get finished(): boolean {
    return this.ended;
  }

  // ---------------------------------------------------------------------------------------------
  // messages from players
  // ---------------------------------------------------------------------------------------------

  message(from: string, d: Record<string, unknown>, owner: boolean): void {
    if (owner && d.k === 'cfg') {
      this.mazoku = d.mz === true;
      this.send('all', { k: 'cfg', mz: this.mazoku });
      return;
    }
    if (owner && d.k === 'restart') {
      if (!this.running || this.ended) this.begin();
      return;
    }
    if (!this.running) return;
    const name = this.seated.get(from);
    if (name === undefined) return;
    const p = this.peer(from, name);
    switch (d.k) {
      case 'p': {
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
        p.seen = this.time;
        return;
      }
      case 'hit': {
        const z = this.zombies.zombies.find((q) => q.id === d.z);
        if (!z || !z.alive || !p.ref.alive) return;
        this.killer = from;
        // a single hit can never do more than the strongest weapon plausibly could
        this.zombies.damage(z, Math.max(0, Math.min(600, Number(d.a) || 0)), d.h === true, p.env, Number(d.y) || 0, Math.min(20, Number(d.pu) || 0), Math.min(15, Number(d.li) || 0));
        this.killer = null;
        return;
      }
      case 'cure': {
        // only someone standing next to her can purge her
        const u = this.carriers.find((q) => CARRIERS[q.index]!.id === String(d.id));
        const z = u?.zombie;
        if (!u || !z || !u.state || !p.ref.alive || Math.hypot(z.x - p.ref.x, z.z - p.ref.z) > CARD_MODE.cureReach + 2.5) return;
        if (!purgeCarrier(u.state)) return;
        u.lootX = z.x;
        u.lootZ = z.z;
        this.zombies.remove(z);
        u.zombie = null;
        return;
      }
      case 'take': {
        const u = this.carriers.find((q) => CARRIERS[q.index]!.id === String(d.id));
        if (!u?.state || u.state.phase !== 'purged' || !p.ref.alive) return;
        if (Math.hypot(u.lootX - p.ref.x, u.lootZ - p.ref.z) > CARD_MODE.pickupRadius + 2.5) return;
        if (recoverCarrier(u.state)) this.send('all', { k: 'card', id: CARRIERS[u.index]!.id });
        return;
      }
      case 'relay': {
        const c = this.level.transmitter.console;
        if (p.ref.alive && Math.hypot(c.x - p.ref.x, c.z - p.ref.z) < 5) activateDefense(this.defense);
        return;
      }
      default:
        return;
    }
  }

  private peer(id: string, name: string): Peer {
    let p = this.peers.get(id);
    if (p) return p;
    const ref: PlayerRef = { x: 0, y: 0, z: 0, eyeY: 1.6, alive: false, sprinting: false };
    const field = new FlowField(this.level.nav);
    p = { id, name, ref, yaw: 0, hp: 100, kills: 0, downs: 0, seen: -99, env: null as never, field, fieldT: 0 };
    p.env = {
      time: 0,
      world: this.level.world,
      nav: this.level.nav,
      field,
      player: ref,
      rng: this.rng,
      audio: silent as never,
      fx: silent as never,
      hurtPlayer: (amount, sx, sz, _kind, knock) => this.send(id, { k: 'hurt', a: r1(amount), sx: r1(sx), sz: r1(sz), kn: knock }),
      alertNear: (x, z, r, srcId) => this.zombies.alertNear(x, z, r, srcId),
      shake: noop,
    };
    this.peers.set(id, p);
    return p;
  }

  // ---------------------------------------------------------------------------------------------
  // simulation
  // ---------------------------------------------------------------------------------------------

  tick(dt: number): void {
    if (!this.running) return;
    if (this.ended) {
      // the final state stays on air (slowly) for anyone who arrives late
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 1;
        this.snapshot();
      }
      return;
    }
    const envs: ZombieEnv[] = [];
    let up = 0;
    for (const p of this.peers.values()) {
      // a player who stopped reporting (tab in the background, connection gone) is not a target
      if (this.time - p.seen > AWAY_AFTER) p.ref.alive = false;
      p.env.time = this.time;
      p.fieldT -= dt;
      if (p.ref.alive && p.fieldT <= 0) {
        p.field.compute(p.ref.x, p.ref.z);
        p.fieldT = 0.4;
      }
      if (p.ref.alive) up++;
      envs.push(p.env);
    }
    // nobody has deployed yet: hold everything (the first break starts when the first player is in)
    if (envs.length === 0 || (this.waves.n === 0 && up === 0)) {
      this.flush(dt);
      return;
    }
    this.time += dt;
    this.zombies.update(dt, envs[0]!, up > 0, envs);

    const w = this.waves;
    const m = this.mission;
    // an open hold / collect objective (or a running uplink) keeps the wave alive with a trickle of infected
    const trickle = w.phase === 'active' && (blocksWaveEnd(m) || this.defense.status === 'active') && w.toSpawn <= 1;
    if (trickle) w.toSpawn = 1;
    const event = stepWaves(w, dt, this.zombies.hostileCount, up, envs.length);
    if (event === 'wave-start') this.onWaveStart();
    else if ((event === 'wave-clear' || event === 'won') && m && closeMission(m)) this.payBonus(m);
    if (w.phase === 'active') this.stepMission(dt);
    this.stepCarriers(dt);

    // the squad's relay: anyone who is up inside the zone keeps it going
    if (this.defense.status === 'active') {
      const s = this.level.data.defense;
      const inside = [...this.peers.values()].some((p) => p.ref.alive && Math.hypot(p.ref.x - s.x, p.ref.z - s.z) < s.radius);
      updateDefense(this.defense, dt, inside, true);
    }

    if (w.phase === 'active' && (w.toSpawn > 0 || w.bossPending || this.elitePending || this.carrierPending >= 0)) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.zombies.hostileCount < COOP.activeCap) {
        this.spawnT = trickle ? COOP.mission.trickleEvery : COOP.spawnEvery;
        this.spawnOne(envs);
      }
    }
    this.left = w.toSpawn + (w.bossPending ? 1 : 0) + this.zombies.hostileCount - (trickle ? 1 : 0);
    if (w.phase === 'won' || w.phase === 'lost') {
      this.ended = true;
      this.snapshot(); // the outcome goes out at once
      this.sendT = 1;
      return;
    }
    this.flush(dt);
  }

  private flush(dt: number): void {
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 1 / COOP.snapshotHz;
    this.snapshot();
  }

  private upRefs(): PlayerRef[] {
    return [...this.peers.values()].filter((p) => p.ref.alive).map((p) => p.ref);
  }

  /** Free spots around the squad for an objective: not on top of anyone, not across the map. */
  private sites(count: number): { x: number; z: number }[] {
    const up = this.upRefs();
    const cx = up.reduce((a, p) => a + p.x, 0) / Math.max(1, up.length);
    const cz = up.reduce((a, p) => a + p.z, 0) / Math.max(1, up.length);
    let pool = this.level.data.ambient.filter((a) => {
      const d = Math.hypot(a.x - cx, a.z - cz);
      return d > 14 && d < 60;
    });
    if (pool.length < count) pool = this.level.data.ambient;
    return spreadPick(pool, count, () => this.rng.f()).map((i) => pool[i]!);
  }

  private onWaveStart(): void {
    const n = this.waves.n;
    const kind = pickMission(n, this.rng.f());
    this.mission = kind ? createMission(kind, n, this.sites(COOP.mission.cores)) : null;
    this.elitePending = kind === 'elite';
    const slot = (COOP.carrierWaves as readonly number[]).indexOf(n);
    if (slot >= 0 && this.mazoku) this.carrierPending = this.carrierOrder[slot] ?? -1;
  }

  private stepMission(dt: number): void {
    const m = this.mission;
    if (!m || m.status !== 'active') return;
    const up = this.upRefs();
    let done = false;
    if (m.kind === 'hold') {
      done = stepHold(m, dt, up.filter((p) => Math.hypot(p.x - m.x, p.z - m.z) < m.radius).length);
    } else if (m.kind === 'collect') {
      m.items.forEach((item, i) => {
        if (!item.taken && up.some((p) => Math.hypot(p.x - item.x, p.z - item.z) < COOP.mission.coreRadius)) done = takeCore(m, i) || done;
      });
    } else if (m.kind === 'elite' && m.eliteId > 0) {
      const z = this.zombies.zombies.find((q) => q.id === m.eliteId);
      if (!z || !z.alive) done = eliteKilled(m);
    }
    if (done) this.payBonus(m);
  }

  private payBonus(m: WaveMission): void {
    this.send('all', { k: 'bonus', c: m.reward, t: MISSION_TEXT[m.kind].title });
  }

  private stepCarriers(dt: number): void {
    for (const u of this.carriers) {
      const z = u.zombie;
      const st = u.state;
      if (!z || !st) continue;
      if (z.state === 'downed') downCarrier(st);
      if (tickCarrier(st, dt)) {
        const near = this.nearestEnv(z.x, z.z);
        if (near) z.revive(CARD_MODE.reviveHp, near);
      }
    }
  }

  private nearestEnv(x: number, z: number): ZombieEnv | null {
    let best: Peer | null = null;
    let bd = Infinity;
    for (const p of this.peers.values()) {
      const d = Math.hypot(p.ref.x - x, p.ref.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? best.env : null;
  }

  /** A spawn point a fair distance from `t` that its flow field can reach. */
  private farSpot(t: PlayerRef, env: ZombieEnv): { x: number; z: number } | null {
    const spots = this.level.data.spawnPoints.filter((s) => {
      const d = Math.hypot(s.x - t.x, s.z - t.z);
      return d > 24 && d < 75 && env.field.isReachable(s.x, s.z);
    });
    return spots[Math.floor(this.rng.f() * spots.length)] ?? null;
  }

  private spawnOne(envs: ZombieEnv[]): void {
    const upEnvs = envs.filter((e) => e.player.alive);
    if (upEnvs.length === 0) return;
    const env = upEnvs[Math.floor(this.rng.f() * upEnvs.length)]!;
    const t = env.player;
    const w = this.waves;
    if (w.bossPending) {
      const s = this.farSpot(t, env);
      if (!s) return;
      const boss = this.zombies.spawn('warden', s.x, s.z, this.rng, { boss: true, hpScale: 0.3 + 0.2 * envs.length });
      this.zombies.boss = boss;
      boss.aggro(t.x, t.z);
      w.bossPending = false;
      return;
    }
    if (this.carrierPending >= 0) {
      const s = this.farSpot(t, env);
      if (!s) return;
      const u = this.carriers[this.carrierPending];
      if (u && !u.zombie && !u.state) {
        u.zombie = this.zombies.spawn(u.base, s.x, s.z, this.rng, { def: u.stats, curable: true, hpScale: 0.75 + 0.25 * envs.length });
        u.zombie.carrierIdx = u.index + 1;
        u.state = createCarrier(CARRIERS[u.index]!.id);
        u.state.phase = 'identified';
        u.zombie.aggro(t.x, t.z);
      }
      this.carrierPending = -1;
      return;
    }
    const ctx: DirectorContext = { elapsed: this.time, playerX: t.x, playerZ: t.z, playerYaw: 0, playerEyeY: t.eyeY, region: 'low', phase: 0, quality: 'medium', defenseActive: false, extractionElapsed: null, paused: false };
    if (this.elitePending && this.mission) {
      if (this.zombies.spawnForWave('armored', waveHpScale(w.n) * COOP.mission.eliteHp, ctx, env, this.rng)) {
        this.mission.eliteId = this.zombies.zombies[this.zombies.zombies.length - 1]!.id;
        this.elitePending = false;
      }
      return;
    }
    if (w.toSpawn > 0 && this.zombies.spawnForWave(waveType(w.n, this.rng.f()), waveHpScale(w.n), ctx, env, this.rng)) w.toSpawn--;
  }

  private onKill(z: Zombie, head: boolean): void {
    const p = this.killer ? this.peers.get(this.killer) : null;
    if (!p) return;
    p.kills++;
    this.send(p.id, { k: 'kill', n: z.tag ?? z.def.name, h: head, c: killReward(z.def, head, 'low') });
  }

  // ---------------------------------------------------------------------------------------------
  // snapshot
  // ---------------------------------------------------------------------------------------------

  private snapshot(): void {
    const w = this.waves;
    const z = this.zombies.zombies.map((q) => {
      const n = q.toNet();
      const row = [n.id, TYPES.indexOf(n.type), r1(n.x), r1(n.z), r2(n.yaw), MODES.indexOf(n.mode), r2(n.actionT), r2(n.staggerT), r1(n.speed), r2(n.hp), n.flags, n.carrier];
      if (n.fy !== 0 || n.fp !== 0 || n.fr !== 0) row.push(r2(n.fy), r2(n.fp), r2(n.fr));
      return row;
    });
    const p: unknown[][] = [];
    for (const q of this.peers.values()) p.push([q.id, r1(q.ref.x), r1(q.ref.y), r1(q.ref.z), r2(q.yaw), q.ref.alive ? 1 : 0, q.hp, q.kills, q.downs]);
    const m = this.mission;
    const mission = m ? [MISSION_KINDS.indexOf(m.kind), MISSION_STATUSES.indexOf(m.status), r2(m.progress), r1(m.x), r1(m.z), m.eliteId, m.reward, ...m.items.flatMap((i) => [r1(i.x), r1(i.z), i.taken ? 1 : 0])] : null;
    const c: number[][] = [];
    for (const u of this.carriers) {
      if (u.state) c.push([u.index, CARRIER_PHASES.indexOf(u.state.phase), Math.round(u.state.downLeft), r1(u.lootX), r1(u.lootZ)]);
    }
    const rl = [RELAY_STATUSES.indexOf(this.defense.status), r2(this.defense.progress)];
    this.send('all', { k: 's', g: this.gen, w: [w.n, PHASES.indexOf(w.phase), r1(Math.max(0, w.breakLeft)), this.left], z, p, m: mission, c, rl });
  }

  /** Diagnostics for the admin view and tests. */
  stats(): { wave: number; phase: WavePhase; infected: number; players: number; up: number } {
    return { wave: this.waves.n, phase: this.waves.phase, infected: this.zombies.aliveCount, players: this.peers.size, up: this.upRefs().length };
  }
}
