/**
 * Co-op on the client. One session simulation (`sim/serverHost.ts`) runs the operation for the whole squad - on the
 * game server, or for a self-hosted session inside its owner's browser - and every player is a client of it: they play
 * against puppet infected, report where they are and what they hit, and draw what it reports. Roles:
 *   host       a self-hosted session's owner: runs the simulation locally (and plays as a client of it, like anyone)
 *   guest      a player; the simulation is on the server or on the host's device
 *   spectator  flies freely and watches (a hidden admin is a spectator nobody is told about)
 * Kinds (the owner picks in the lobby): the map's story operation (Standard), the same with the Mazoku carriers, or
 * free roam. A downed player bleeds out unless a teammate revives them; the run is lost when nobody is standing.
 *
 * What the simulation shares besides the infected, the squad and the operation (see `sim/serverHost.ts`):
 *   pu / pd   power-up timers and drops (every map); 'pw' when someone takes one (each client plays it, refills its
 *             own ammo on MAX AMMO and takes the cash it carries)
 *   rc        the Asylum's patient files taken (each client plays and pays itself once per file)
 *   lp        the Asylum's doors and power; a door is bought with a request and paid on the confirmation ('bought')
 *   bd        boards up on each of the Asylum's windows; a repair is a request, paid on the confirmation ('fixed')
 *   fr / fg   the Forge's roster (now and then) and its story's state (`forge/net.ts`): who is holed up where and who
 *             made it to the Hearth, the ledger, the Pit, the finale (each client plays and pays itself once per change)
 */
import { COOP, type TeamSkill, VULCAN, type ZombieDifficulty } from '../config';
import type { NetZombie, PlayerRef } from '../enemies/zombie';
import type { ZombieMode } from '../enemies/zombieRigTypes';
import type { Game } from '../game/game';
import type { AllyRow } from '../game/squad';
import type { ContractStatus } from '../logic/contracts';
import { POWERUP_KINDS } from '../logic/powerups';
import { RoomClient, type RoomRole, type RoomView } from '../net/room';
import { EXTRACTION_PHASES, LIFE, type Life, SessionSim, type SessionKind, sessionDifficulty } from '../sim/serverHost';
import type { ZombieType } from '../types';
import type { HudState, MapDynamic, PauseSession } from '../ui/hudTypes';
import { operatorModel } from '../anime/cast';
import { isStory } from '../sakura/missions';
import { AVATAR_WEAPONS, Avatar, avatarWeaponOf } from './avatar';

const MODES: ZombieMode[] = ['idle', 'walk', 'run', 'attack', 'stagger', 'death', 'slam', 'charge', 'roar'];
const TYPES: ZombieType[] = ['shambler', 'runner', 'armored', 'warden'];
const RELAY_STATUSES: ContractStatus[] = ['available', 'active', 'complete'];
const r1 = (v: number): number => Math.round(v * 10) / 10;
const r2 = (v: number): number => Math.round(v * 100) / 100;

export type CoopRole = 'none' | 'host' | 'guest' | 'spectator';
export type { SessionKind };

interface Peer {
  id: string;
  name: string;
  ref: PlayerRef;
  yaw: number;
  hp: number;
  kills: number;
  downs: number;
  life: Life;
  /** Weapon (index into AVATAR_WEAPONS), view pitch, shots fired (a counter; -1 before the first report). */
  gear: [number, number, number];
  /** Armour, cash, and 1 on a phone (shown over their head). */
  info: [number, number, number];
}

export interface ScoreRow {
  id: string;
  name: string;
  kills: number;
  downs: number;
  alive: boolean;
  you: boolean;
  /** Created / manages the session. */
  host: boolean;
  ping: number | null;
  /** 'up', 'down' (can be revived), 'out' (bled out) or 'aboard'. */
  status: 'up' | 'down' | 'out' | 'aboard';
}

const STATUS: Record<number, ScoreRow['status']> = { 1: 'up', 2: 'down', 3: 'out', 4: 'aboard' };

/** A bit mask from the simulation as `n` flags (bit i: flag i). */
const flags = (mask: number, n: number): boolean[] => Array.from({ length: n }, (_, i) => (mask & (1 << i)) !== 0);

export class CoopSession {
  readonly room: RoomClient;
  role: CoopRole = 'none';
  /** This client has deployed into the session. */
  started = false;
  /** Shown by the lobby: the last refusal from the server, and why the session closed. */
  lastError = '';
  closedReason = '';
  /** The lobby redraws on this. */
  onChange: () => void = () => {};
  /** This player's state: up, down (bleeding out), out (bled out, watching), aboard (extracted). */
  life: Life = LIFE.up;
  /** Seconds left before a downed player bleeds out. */
  bleed = 0;
  private gen = 0;
  private endedGen = -1;
  private readonly peers = new Map<string, Peer>();
  private readonly avatars = new Map<string, Avatar>();
  private me = { kills: 0, downs: 0 };
  private sendT = 0;
  /** A self-hosted session's simulation (owner's browser only). */
  private sim: SessionSim | null = null;
  /** When each patient file was last asked for (the pickup asks every frame while you stand on it). */
  private readonly recordAsked: number[] = [];

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
      onPing: () => this.onChange(),
    });
  }

  // ---------------------------------------------------------------------------------------------
  // membership
  // ---------------------------------------------------------------------------------------------

  /** Deployed and connected: the co-op rules are in force. */
  get live(): boolean {
    return this.started && this.role !== 'none';
  }

  /** The owner has started the session, so this client may deploy into it. */
  get canDeploy(): boolean {
    return this.room.room?.state === 'playing';
  }

  /** What the session plays: the story operation (Standard), with the Mazoku carriers, or free roam. */
  get kind(): SessionKind {
    return this.room.room?.kind ?? 'mission';
  }

  /** The story kinds: contracts, extraction, revives. */
  get story(): boolean {
    return this.kind === 'mission' || this.kind === 'mazoku' || isStory(this.kind);
  }

  /** A live free-roam session: fly, no damage, no HUD. */
  get roaming(): boolean {
    return this.live && this.kind === 'roam';
  }

  /** The session runs on the game server, not on anyone's device. */
  get serverHosted(): boolean {
    return this.room.room?.hosting === 'server';
  }

  private onRoom(room: RoomView | null, you: { id: string; role: RoomRole; hidden: boolean } | null): void {
    if (!room || !you) {
      this.cleanup();
    } else {
      this.lastError = '';
      this.closedReason = '';
      // joined with a code while on another map: switch to the session's map and come back to it
      if (room.map !== this.g.mapId) {
        this.g.switchMapForRoom(room.code, room.map);
        return;
      }
      this.role = you.role === 'spectator' ? 'spectator' : room.hostId === you.id ? 'host' : 'guest';
      // a self-hosted session's owner runs the simulation, on the map they are on
      if (this.role === 'host') {
        this.sim ??= new SessionSim({ level: this.g.level, map: this.g.mapId, kind: room.kind, difficulty: sessionDifficulty(room), dev: import.meta.env.DEV, send: (to, d) => this.fromSim(to, d) });
        if (!this.sim.finished && this.sim.stats().elapsed === 0) {
          this.sim.kind = room.kind;
          this.sim.difficulty = sessionDifficulty(room);
        }
        this.sim.players(room.players.map((p) => ({ id: p.id, name: p.name })));
      }
      // drop anyone who is no longer a player
      for (const id of [...this.peers.keys()]) if (!room.players.some((p) => p.id === id)) this.dropPeer(id);
    }
    this.onChange();
  }

  /** The pause menu's view of the session (null outside a live one): its code, and who may join mid-game. */
  pauseSession(): PauseSession | null {
    const r = this.room.room;
    if (!this.live || !r) return null;
    return {
      code: r.code,
      link: `${location.origin}/?room=${r.code}`,
      serverHosted: r.hosting === 'server',
      owner: this.room.isOwner,
      late: r.late ?? 'all',
      setLate: (value) => this.room.manage('late', { value }),
    };
  }

  /** Owner: what the session plays (lobby only). */
  setKind(kind: SessionKind): void {
    if (!this.room.isOwner || !this.room.room || this.room.room.state !== 'lobby') return;
    this.room.manage('config', { value: kind });
  }

  /** Owner: how hard the session is (lobby only). */
  setDifficulty(d: { zombies?: ZombieDifficulty; team?: TeamSkill }): void {
    if (!this.room.isOwner || !this.room.room || this.room.room.state !== 'lobby') return;
    this.room.manage('config', d);
  }

  /** Owner: start the ready check's countdown (every player must be ready; the server checks). */
  requestStart(): void {
    if (!this.room.isOwner || this.room.room?.state !== 'lobby') return;
    this.room.manage('start');
  }

  /** Owner: stop the countdown. */
  cancelStart(): void {
    if (this.room.isOwner && this.room.room?.state === 'starting') this.room.manage('cancel');
  }

  /** A player: ready or not. */
  setReady(value: boolean): void {
    if (this.room.room?.state === 'lobby' && this.role !== 'spectator') this.room.setReady(value);
  }

  /** Every seated player is ready (the owner counts as ready). */
  get allReady(): boolean {
    const r = this.room.room;
    return !!r && r.players.every((p) => p.id === r.ownerId || p.ready === true);
  }

  /** Owner: open the session for play at once (tools and tests; the lobby uses the ready check). */
  start(): void {
    if (!this.room.isOwner || !this.room.room) return;
    this.room.manage('state', { value: 'playing' });
    this.room.room.state = 'playing'; // the server will confirm; the owner deploys in the same click
  }

  leave(): void {
    this.room.leave();
    this.cleanup();
  }

  private cleanup(): void {
    this.role = 'none';
    this.started = false;
    this.sim = null;
    this.g.mission.shared = false;
    this.g.mission.follow = false;
    this.g.zombies.netDamage = null;
    this.g.cards.coopMode = 'off';
    this.g.entities.coop = null;
    if (this.g.asylum) this.g.asylum.remote = null;
    if (this.g.barricades) this.g.barricades.requestRepair = null;
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
  }

  private dropPeer(id: string): void {
    this.peers.delete(id);
    this.avatars.get(id)?.dispose();
    this.avatars.delete(id);
  }

  /** Everything this client says to the simulation (a self-host's own goes straight in). */
  private toHost(d: Record<string, unknown>): void {
    if (this.role === 'host' && this.sim) this.sim.message(this.room.you?.id ?? '', d, true);
    else this.room.send('host', d);
  }

  /** A self-hosted simulation's output: out to the room, and to this client as if it came from the host. */
  private fromSim(to: string, d: Record<string, unknown>): void {
    const me = this.room.you?.id;
    const hostId = this.room.room?.hostId ?? '';
    if (to === 'all') {
      this.room.send('all', d);
      this.onRelay(hostId, d);
    } else if (to === me) this.onRelay(hostId, d);
    else this.room.send(to, d);
  }

  /** A run is starting on this client (called from the game's reset). */
  begin(): void {
    const g = this.g;
    this.started = this.role !== 'none';
    // every hit goes to the simulation, which decides it and pays for it
    g.zombies.netDamage = this.started ? (z, a, h, y, pu, li) => this.toHost({ k: 'hit', z: z.netId, a: r1(a), h, y: r2(y), pu: r1(pu), li: r1(li) }) : null;
    g.zombies.carrierRig = (i) => g.cards.rigFor(i);
    g.cards.coopMode = this.started ? 'remote' : 'off';
    g.cards.onCoopCure = (id) => this.toHost({ k: 'cure', id });
    g.cards.onCoopTake = (id) => this.toHost({ k: 'take', id });
    g.mission.shared = this.started;
    g.mission.follow = this.started && this.story;
    g.mission.requestRelay = () => this.toHost({ k: 'relay' });
    g.mission.requestCall = () => this.toHost({ k: 'call' });
    g.mission.requestBoard = () => this.toHost({ k: 'board' });
    g.squad.requestRescue = (name) => this.toHost({ k: 'rescue', id: name });
    // the mystery boxes and the drops are the squad's: opening, taking and picking up are requests
    g.entities.coop = this.started && this.story
      ? {
          me: () => this.room.you?.id ?? null,
          nameOf: (id) => this.peers.get(id)?.name ?? 'A teammate',
          open: (i, prize) => this.toHost({ k: 'box', i, pz: prize }),
          take: (i) => this.toHost({ k: 'boxTake', i }),
          pick: (id) => this.toHost({ k: 'pick', id }),
        }
      : null;
    // the Asylum: files, doors, the power switch and window repairs are the simulation's to decide
    this.recordAsked.length = 0;
    if (g.mission.night) {
      g.mission.night.requestRecord = (i) => {
        const now = performance.now();
        if (now - (this.recordAsked[i] ?? -1e9) < 600) return;
        this.recordAsked[i] = now;
        this.toHost({ k: 'rec', i });
      };
    }
    if (g.asylum) g.asylum.remote = this.started ? { door: (i) => this.toHost({ k: 'door', i }), lever: () => this.toHost({ k: 'lever' }) } : null;
    // the Forge: talking someone out, a furnace, a ledger page and riry's bell are the simulation's to decide
    if (g.forge) {
      g.forge.requestHold = (i) => this.toHost({ k: 'hold', i });
      g.forge.requestLedger = (i) => this.toHost({ k: 'ledger', i });
      g.forge.requestBell = () => this.toHost({ k: 'bell' });
      g.forge.requestStoke = (i) => this.toHost({ k: 'stoke', i });
    }
    // the Sakura District's Thousand Lanterns: the charms, the tree, the lanterns and the bell are the simulation's
    if (g.sakura) {
      g.sakura.request = (a, i) => this.toHost({ k: 'sq', a, i });
    }
    if (g.barricades) g.barricades.requestRepair = this.started ? (i) => this.toHost({ k: 'fix', i }) : null;
    this.me = { kills: 0, downs: 0 };
    this.life = LIFE.up;
    this.bleed = 0;
    this.sendT = 0;
    if (this.role === 'host' && this.sim) {
      this.sim.kind = this.kind;
      if (this.room.room) this.sim.difficulty = sessionDifficulty(this.room.room);
      this.sim.begin();
    } else if (this.role === 'guest' && this.room.isOwner) {
      // the owner asks a server-hosted session for another run (it ignores this while one is still going)
      this.toHost({ k: 'restart' });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // per frame
  // ---------------------------------------------------------------------------------------------

  /** The infected are the simulation's: here they only follow its reports. */
  updateEnemies(dt: number): void {
    this.g.zombies.updatePuppets(dt, this.g.zenv);
  }

  /** Networking, the simulation (self-host), avatars, the relay, bleeding out. Once per simulated frame while live. */
  update(dt: number): void {
    const g = this.g;
    const room = this.room.room;
    if (!room || !this.live) return;
    this.sim?.tick(dt);
    for (const a of this.avatars.values()) a.update(dt);
    // the squad's relay: anyone who is up inside the zone keeps it going (the simulation decides)
    const rd = g.level.data.defense;
    const atRelay = [...this.peers.values()].some((q) => q.ref.alive && Math.hypot(q.ref.x - rd.x, q.ref.z - rd.z) < rd.radius) || (g.playerAlive() && Math.hypot(g.player.x - rd.x, g.player.z - rd.z) < rd.radius);
    if (this.story) g.mission.sharedRelay(dt, g.time, atRelay, false);

    // bleeding out
    if (this.life === LIFE.down) {
      this.bleed -= dt;
      if (this.bleed <= 0) {
        this.life = LIFE.out;
        g.banner('YOU BLED OUT', 'Watch the squad - you are back on the next run', 'danger', 5);
        g.audio.play('defeat_sting', { priority: 2, volume: 0.5 });
      }
    }

    this.sendT -= dt;
    if (this.sendT <= 0 && this.role !== 'spectator') {
      this.sendT = 1 / COOP.reportHz;
      const p = g.player;
      const inv = g.session.inv;
      const w = Math.max(0, AVATAR_WEAPONS.indexOf(avatarWeaponOf(inv.slots[inv.activeSlot]?.id ?? 'none')));
      this.toHost({ k: 'p', x: r1(p.x), y: r1(p.y), z: r1(p.z), yaw: r2(p.yaw), up: this.life === LIFE.up, st: this.life, hp: Math.round(g.session.vitals.health), w, pi: r2(p.pitch), f: g.session.stats.shotsFired % 4096, ar: Math.round(g.session.vitals.armor), cs: Math.round(g.session.inv.cash), dv: g.touchMode ? 1 : 0 });
    }
  }

  private showAvatar(p: Peer, fired = false): void {
    let a = this.avatars.get(p.id);
    if (!a) {
      // the Sakura District: everyone wears a VRoid model, teammates too
      a = new Avatar(p.name, this.avatars.size, this.g.mapId === 'sakura' ? { anime: operatorModel(this.avatars.size) } : undefined);
      this.g.worldRoot.add(a.root);
      this.avatars.set(p.id, a);
    }
    // a teammate who goes down falls where they stood (and gets up again when revived); aboard means gone
    const down = p.life === LIFE.down || p.life === LIFE.out;
    if (down && a.root.visible && !a.fallen) a.fall(Math.sin(p.yaw), Math.cos(p.yaw), 1.5);
    else if (p.life === LIFE.up && a.fallen) a.rise();
    a.set(p.ref.x, p.ref.y, p.ref.z, p.yaw, p.life !== LIFE.aboard && (p.ref.alive || a.fallen));
    a.setWeapon(AVATAR_WEAPONS[p.gear[0]] ?? 'rifle');
    // their card: device, name, health, armour, gun and money
    a.setInfo({ hp: p.hp, armor: p.info[0], cash: p.info[1], weapon: a.weapon, device: p.info[2] === 1 ? 'phone' : 'pc', down: p.life === LIFE.down || p.life === LIFE.out });
    a.pitch = p.gear[1];
    if (fired && p.life === LIFE.up && a.root.visible) {
      // a teammate's shot: their weapon kicks and flashes, and you hear it from where they stand
      const muzzle = a.fire();
      this.g.audio.play(a.shotSound, { pos: muzzle, volume: 0.6, priority: 1, rate: 0.97 + this.g.rng.f() * 0.06 });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // messages from the simulation
  // ---------------------------------------------------------------------------------------------

  private onRelay(from: string, d: Record<string, unknown>): void {
    const g = this.g;
    const room = this.room.room;
    if (!room) return;
    // a self-host's simulation hears the other players (it runs even before the owner has deployed)
    if (this.role === 'host' && this.sim && from !== room.hostId) {
      if (room.players.some((p) => p.id === from)) this.sim.message(from, d, from === room.ownerId);
      return;
    }
    if (!this.live || from !== room.hostId) return;
    if (d.k === 's') {
      this.applySnapshot(d);
      return;
    }
    if (this.role === 'spectator') return;
    switch (d.k) {
      case 'hurt':
        if (this.life === LIFE.up) g.takeRemoteHit(Number(d.a) || 0, Number(d.sx) || 0, Number(d.sz) || 0, Number(d.kn) || 0);
        return;
      case 'kill':
        g.creditKill(Number(d.c) || 0, String(d.n || 'INFECTED'), d.h === true, Number(d.x), Number(d.zz), Number(d.dc) || 0);
        return;
      case 'cash':
        g.coopCash(Number(d.c) || 0, String(d.t || ''), Number(d.pl) || 0);
        return;
      case 'card':
        g.cards.award(String(d.id), COOP.carrierReward);
        return;
      case 'boarded':
        this.life = LIFE.aboard;
        g.coopBoarded();
        return;
      case 'boxed':
        g.entities.boxGranted(Number(d.i));
        return;
      case 'picked':
        if (d.kind === 'ammo' || d.kind === 'plate' || d.kind === 'grenade') g.entities.dropGranted(Number(d.id), d.kind);
        return;
      case 'revived':
        if (this.life !== LIFE.down) return;
        this.life = LIFE.up;
        g.coopRevived(String(d.by || 'A teammate'));
        return;
      case 'note':
        g.feed(String(d.t || ''), 'good');
        return;
      case 'pw': {
        // someone took a power-up (the simulation already did the nuke and the carpenter)
        const kind = POWERUP_KINDS[Number(d.w)];
        if (kind) g.powerups.takeRemote(Number(d.id) || 0, kind, Number(d.x) || 0, Number(d.z) || 0, Math.max(0, Number(d.c) || 0), String(d.n || ''));
        return;
      }
      case 'bought':
        g.asylum?.confirmDoor(Number(d.i), Math.max(0, Number(d.c) || 0));
        return;
      case 'fixed':
        g.barricades?.repaired(Number(d.i), Math.max(0, Number(d.c) || 0));
        return;
      default:
        return;
    }
  }

  private applySnapshot(d: Record<string, unknown>): void {
    const g = this.g;
    const gen = Number(d.g) || 0;
    if (gen !== this.gen) this.gen = gen; // a fresh run on the simulation
    const list: NetZombie[] = (d.z as number[][]).map((q) => ({ id: q[0]!, type: TYPES[q[1]!] ?? 'shambler', x: q[2]!, z: q[3]!, yaw: q[4]!, mode: MODES[q[5]!] ?? 'idle', actionT: q[6]!, staggerT: q[7]!, speed: q[8]!, hp: q[9]!, flags: q[10]!, carrier: q[11] ?? 0, fy: q[12] ?? 0, fp: q[13] ?? 0, fr: q[14] ?? 0, tag: q[15] ?? -1, y: q[16] ?? 0, v: q[17] ?? 0 }));
    g.zombies.syncPuppets(list, g.rng, (i) => VULCAN.infected[i] ?? null);
    g.cards.coopApply((d.c as number[][] | undefined) ?? [], (carrier) => g.zombies.zombies.find((z) => z.carrierIdx === carrier) ?? null);
    const rl = d.rl as number[] | undefined;
    if (rl) g.mission.applySharedRelay(RELAY_STATUSES[rl[0]!] ?? 'available', Number(rl[1]) || 0);

    const ms = d.ms as number[] | undefined;
    if (ms) {
      g.mission.applyMission({
        elapsed: ms[0]!,
        huntStatus: RELAY_STATUSES[ms[1]!] ?? 'active',
        huntIdentified: ms[2] === 1,
        phase: EXTRACTION_PHASES[ms[3]!] ?? 'locked',
        countdown: ms[4]!,
        windowLeft: ms[5]!,
        calledAt: ms[6]! < 0 ? null : ms[6]!,
      });
      // the Forge's story first: its roster deploys the co-leaders the squad rows below are about
      if (g.forge && d.fg !== undefined) g.forge.applyWire(d.fr, d.fg);
      if (g.sakura && d.lq !== undefined) g.sakura.applyWire(d.lq);
      g.squad.applyRemote((d.sq as AllyRow[] | undefined) ?? [], (d.sh as number[][] | undefined) ?? []);
      if (g.aurelia && d.au !== undefined) g.aurelia.applyWire(d.au);
    }
    // power-ups (every map), the Asylum's files, doors and power, and its boarded windows
    const pu = d.pu as number[] | undefined;
    if (pu) g.powerups.applyRemote(Number(pu[0]) || 0, Number(pu[1]) || 0, (d.pd as number[][] | undefined) ?? []);
    // the squad's mystery boxes and drops
    if (Array.isArray(d.bx)) g.entities.applyBoxes(d.bx as (number | string)[][]);
    if (Array.isArray(d.dr)) g.entities.applyDrops(d.dr as number[][]);
    if (typeof d.rc === 'number' && g.mission.night) g.mission.night.applyRecords(flags(d.rc, g.mission.night.records.found.length));
    const lp = d.lp as number[] | undefined;
    if (lp && g.asylum) g.asylum.applyRemote(Number(lp[0]) || 0, lp[1] === 1);
    const bd = d.bd as number[] | undefined;
    if (bd && g.barricades) g.barricades.applyBoards(bd);

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
      p.life = (Number(row[9]) || LIFE.up) as Life;
      const shots = Number(row[12] ?? 0);
      const fired = p.gear[2] >= 0 && shots !== p.gear[2];
      p.gear = [Number(row[10]) || 0, Number(row[11]) || 0, shots];
      p.info = [Number(row[13]) || 0, Number(row[14]) || 0, Number(row[15]) || 0];
      this.showAvatar(p, fired);
    }
    for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.dropPeer(id);

    // the end of the run
    const outcome = ms ? ms[7]! : 0;
    if (outcome !== 0 && this.endedGen !== gen) {
      this.endedGen = gen;
      const won = outcome === 1;
      const why = String(d.why || (won ? 'Extracted' : 'Mission failed'));
      if (this.role === 'spectator') g.banner(won ? 'THE SQUAD GOT OUT' : 'MISSION FAILED', why, won ? 'good' : 'danger', 6);
      else if (this.life !== LIFE.aboard) g.finishCoop('defeat', won ? 'Left behind - the helicopter left without you' : why);
    }
  }

  private peer(id: string): Peer | null {
    let p = this.peers.get(id);
    if (p) return p;
    const person = this.room.room?.players.find((q) => q.id === id);
    if (!person || id === this.room.you?.id) return null;
    p = { id, name: person.name, ref: { x: 0, y: 0, z: 0, eyeY: 1.6, alive: false, sprinting: false }, yaw: 0, hp: 100, kills: 0, downs: 0, life: LIFE.up, gear: [0, 0, -1], info: [0, 0, 0] };
    this.peers.set(id, p);
    return p;
  }

  // ---------------------------------------------------------------------------------------------
  // going down and getting back up
  // ---------------------------------------------------------------------------------------------

  /** This player's health ran out. In the story kinds they are down, not dead. */
  onLocalDeath(): void {
    this.life = LIFE.down;
    this.bleed = COOP.bleedOut;
    const others = [...this.peers.values()].some((p) => p.life === LIFE.up);
    this.g.banner('YOU ARE DOWN', others ? `A teammate can revive you - ${COOP.bleedOut} seconds` : 'Nobody is left standing', 'danger', 5);
  }

  /** The downed teammate in reach of this player, if any. */
  reviveTarget(): { id: string; name: string; dist: number } | null {
    if (!this.live || !this.story || this.life !== LIFE.up) return null;
    const me = this.g.player;
    let best: { id: string; name: string; dist: number } | null = null;
    for (const p of this.peers.values()) {
      if (p.life !== LIFE.down) continue;
      const d = Math.hypot(p.ref.x - me.x, p.ref.z - me.z);
      if (d < COOP.reviveReach && (!best || d < best.dist)) best = { id: p.id, name: p.name, dist: d };
    }
    return best;
  }

  revive(id: string): void {
    this.toHost({ k: 'revive', id });
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
    const ping = (id: string): number | null => (id === myId ? (this.room.ping === null ? null : Math.round(this.room.ping)) : (room.players.find((q) => q.id === id)?.ping ?? null));
    if (this.role !== 'spectator') rows.push({ id: myId, name: this.g.account.user?.name ?? 'You', kills: this.me.kills, downs: this.me.downs, alive: this.life === LIFE.up, you: true, host: room.ownerId === myId, ping: ping(myId), status: STATUS[this.life]! });
    for (const p of this.peers.values()) rows.push({ id: p.id, name: p.name, kills: p.kills, downs: p.downs, alive: p.life === LIFE.up, you: false, host: room.ownerId === p.id, ping: ping(p.id), status: STATUS[p.life] ?? 'up' });
    return { rows, spectators: room.spectators.map((s) => s.name) };
  }

  /** The squad on the HUD and the map: teammates, who is down, and this player's own bleed-out clock. */
  decorateHud(st: HudState, md: MapDynamic): void {
    const g = this.g;
    const squad = [...this.peers.values()];
    if (squad.length > 0) {
      const label = (p: Peer): string => (p.life === LIFE.down ? `${p.name} DOWN` : p.life === LIFE.out ? `${p.name} (out)` : p.life === LIFE.aboard ? `${p.name} (aboard)` : p.name);
      st.objectives.push({ id: 'coop-squad', title: 'SQUAD', detail: squad.map(label).join('   '), state: squad.some((p) => p.life === LIFE.down) ? 'failed' : 'active', progress: -1, tracked: false, distance: -1 });
    }
    if (this.life === LIFE.down) st.subTimer = { label: 'BLEEDING OUT', seconds: Math.max(0, this.bleed), urgent: true };
    for (const p of squad) {
      if (p.life === LIFE.aboard) continue;
      const down = p.life === LIFE.down;
      md.markers.push({ id: `mate:${p.id}`, kind: 'objective', x: p.ref.x, z: p.ref.z, label: down ? `REVIVE ${p.name.toUpperCase()}` : p.name.toUpperCase(), color: down ? '#ff5a4d' : '#8fd18a', visible: p.life !== LIFE.out, compass: down || p.ref.alive, pulse: down });
    }
    void g;
  }
}
