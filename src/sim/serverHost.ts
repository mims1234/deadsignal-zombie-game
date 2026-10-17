/**
 * The co-op session simulation: one implementation of the host, run by the game server (a worker thread per session,
 * `worker.ts`) or, for a self-hosted session, inside the owner's browser. Every player - the self-host included - is a
 * client of it: they report where they are and what they hit, and draw what it reports back. Kinds of session:
 *   mission  the map's story operation, as in Standard: two contracts, the extraction, the squad and survivors,
 *            the Seven Flames and the story (`forge/story.ts`) on the Forge
 *   mazoku   the same operation with the five card carriers walking the map (Standard Mazoku)
 *   roam     no infected: fly around together
 * A player who goes down can be revived by a teammate (they bleed out on their own client); the run is lost when
 * nobody is left standing, won when the helicopter leaves with someone aboard.
 *
 * Every map: power-up drops (rolled on the players' kills, taken by walking through them, insta-kill / double points
 * timers, the nuke and the carpenter carried out here). The Asylum also runs here: the time of day (the Matron only
 * walks at night), the patient files, the buyable doors and the power (`asylum/loop.ts`), and the boarded windows
 * (`asylum/barricadeDirector.ts`).
 *
 * Cash: every player keeps their own wallet on their own client. What the squad earns arrives as 'cash' / 'kill' /
 * 'fixed' / 'pw' messages; what a player buys from the shared world (a door) is a request: the simulation checks the
 * shared state (still shut, reachable, the buyer next to it), opens it for everyone and confirms to the buyer
 * ('bought'), who pays on that confirmation (the client checks it can afford it before asking). Perks, wall-buys and
 * the Pack-a-Punch only change the buyer's own stats and inventory, so they stay on the client; the power they need
 * is the simulation's.
 *
 * In:  `message(from, d, owner)` - reports and requests (see each case); `players(list)`; `tick(dt)`.
 * Out: `send(to, d)` - to 'all' or one player id.
 */
import * as THREE from 'three';
import { CARD_MODE, COOP, FORGE_SQUAD, MISSION, REGIONS, SURVIVORS, TEAM_SKILLS, VULCAN, ZOMBIE_DIFFICULTIES, ZOMBIE_DIFFICULTY, ZOMBIES, type TeamSkill, type ZombieDef, type ZombieDifficulty } from '../config';
import { CARRIERS } from '../cards/roster';
import type { PlayerRef, Zombie, ZombieEnv } from '../enemies/zombie';
import { type DirectorContext, ZombieManager } from '../enemies/zombieManager';
import { type AllyBody, type AllyWorld, allyFight, allyHit, allyMove, allyRecover, cageSpots, makeAllyBody, soldierSpots, squadRoster, survivorRoster } from '../game/allyBrain';
import { type LootState, createLoot, openBox, pickDrop, rollKillDrop, takeBox, tickLoot } from '../logic/sharedLoot';
import { type CarrierState, createCarrier, downCarrier, identifyCarrier, purgeCarrier, recoverCarrier, spreadPick, tickCarrier } from '../logic/carriers';
import { type ContractStatus, activateDefense, allContractsComplete, completeHunt, createDefense, createHunt, updateDefense, updateHunt } from '../logic/contracts';
import { killReward } from '../logic/economy';
import { type ExtractionPhase, atLzOrRadio, callExtraction, createExtraction, extractionInProgress, unlockExtraction, updateExtraction } from '../logic/extraction';
import { escalationPhase, missionClock, type MissionClock } from '../logic/mission';
import { POWERUPS } from '../logic/powerupConfig';
import { type PowerupDrop, POWERUP_KINDS, applyPowerup, cashMultiplier, createPowerups, filterDamage, nukeTargets, resetPowerups, rollDrop, tickPowerups } from '../logic/powerups';
import { createRecords, pickUpRecord } from '../logic/records';
import { Rng } from '../logic/rng';
import { gateHunt, phaseTuning, timeOfDay } from '../logic/timeOfDay';
import { BARRICADE } from '../asylum/barricadeConfig';
import { BarricadeDirector } from '../asylum/barricadeDirector';
import { findBarricades, sideOf } from '../asylum/barricadeLayout';
import { anyDamaged, createPurse, payRepair, repairAll, repairBoard, type RepairPurse } from '../asylum/barricades';
import { createLoopState, doorState, isPowerOn, resetLoopState, setPower, spawnAllowed } from '../asylum/loop';
import { LOOP } from '../asylum/loopConfig';
import { ASYLUM_DOORS, POWER_LEVER, ZONE_NAMES } from '../asylum/loopData';
import { RECORDS } from '../asylum/nightConfig';
import type { ZombieType } from '../types';
import type { ZombieMode } from '../enemies/zombieRigTypes';
import { encodeRoster, encodeState } from '../forge/net';
import { ForgeStory, type StoryTick } from '../forge/story';
import { encodeQuest, lanternWrath, SakuraQuest } from '../sakura/quest';
import { VARIANTS } from '../enemies/variants';
import { questSpots } from '../sakura/spots';
import { populateSakura, sakuraVariantPicker, Stalker } from '../sakura/director';
import { applyStoryStart, isStory, populateStory, settleStoryContracts, STORY_IDS, type StoryId } from '../sakura/missions';
import { buildLevel, type Level } from '../world/level';
import type { MapId } from '../world/layout/data';
import type { MaterialLib } from '../world/materials';
import { FlowField, GAMEPLAY_FIELD_RANGE } from '../world/nav';
import { createNullRigFactory } from './nullRig';

/** 'mission' (Standard), 'mazoku', 'roam', or one of the Sakura District's story missions (`sakura/missions.ts`). */
export type SessionKind = 'mission' | 'mazoku' | 'roam' | StoryId;
export const SESSION_KINDS: readonly SessionKind[] = ['mission', 'mazoku', 'roam', ...STORY_IDS];

const MODES: ZombieMode[] = ['idle', 'walk', 'run', 'attack', 'stagger', 'death', 'slam', 'charge', 'roar'];
const TYPES: ZombieType[] = ['shambler', 'runner', 'armored', 'warden'];
const RELAY_STATUSES: ContractStatus[] = ['available', 'active', 'complete'];
export const EXTRACTION_PHASES: readonly ExtractionPhase[] = ['locked', 'available', 'called', 'inbound', 'landing', 'landed', 'boarding', 'extracted', 'failed'];
const CARRIER_PHASES: readonly CarrierState['phase'][] = ['roaming', 'identified', 'downed', 'purged', 'recovered'];
const r1 = (v: number): number => Math.round(v * 10) / 10;
const r2 = (v: number): number => Math.round(v * 100) / 100;
/** Flags as one number (bit i set: flag i), e.g. the files taken or the doors open. */
export const bits = (flags: readonly (number | boolean)[]): number => flags.reduce<number>((m, f, i) => (f ? m | (1 << i) : m), 0);

/** A player sends a report this often; one silent this long is treated as away (not a target, not "up"). */
const AWAY_AFTER = 4;

/** Player state in reports and snapshots: 1 up, 2 down (can be revived), 3 out (bled out), 4 aboard (extracted). */
export const LIFE = { up: 1, down: 2, out: 3, aboard: 4 } as const;
export type Life = (typeof LIFE)[keyof typeof LIFE];

interface Peer {
  id: string;
  name: string;
  ref: PlayerRef;
  yaw: number;
  hp: number;
  kills: number;
  downs: number;
  seen: number;
  life: Life;
  /** What the player shows the others: weapon (index into AVATAR_WEAPONS), view pitch, shots fired (a counter). */
  gear: [number, number, number];
  /** What the others see over this player: armour, cash, and 1 on a phone. */
  info: [number, number, number];
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

interface SimAlly extends AllyBody {
  /** The player who freed them / whom they follow. */
  leader: string | null;
}

/** The level builder wants materials; the simulation never draws, so one blank material stands in for all of them. */
function blankMaterials(): MaterialLib {
  const m = new THREE.MeshStandardMaterial();
  m.userData.tile = 2;
  const t = new THREE.Texture();
  return { get: () => m, decal: () => m, stencil: () => m, glowTexture: t, lightPoolTexture: t, dispose() {} };
}

const noop = (): void => {};
/** Sounds and effects go nowhere in the simulation. */
const silent: unknown = new Proxy({}, { get: () => () => ({ stop: noop, setPosition: noop, intensity: () => 0, setVolume: noop, active: false }) });

export interface SessionDifficulty {
  zombies: ZombieDifficulty;
  team: TeamSkill;
}

/** A valid difficulty from anything (a message, worker data); unknown parts fall back to normal / regular. */
export function sessionDifficulty(d: unknown): SessionDifficulty {
  const o = (d && typeof d === 'object' ? d : {}) as { zombies?: unknown; team?: unknown };
  return {
    zombies: (ZOMBIE_DIFFICULTIES as readonly unknown[]).includes(o.zombies) ? (o.zombies as ZombieDifficulty) : 'normal',
    team: (TEAM_SKILLS as readonly unknown[]).includes(o.team) ? (o.team as TeamSkill) : 'regular',
  };
}

export interface SessionOptions {
  map?: MapId;
  kind?: SessionKind;
  /** The infected's difficulty and the AI squad's skill (the session owner's picks). */
  difficulty?: SessionDifficulty;
  seed?: number;
  /**
   * Local development only (the game server with DEV_LOGIN, or a Vite dev build): the session owner may send the
   * co-op QA script's set-ups ('dev': drop a power-up next to them, tear boards off a window). Never on a live server.
   */
  dev?: boolean;
  /** A level the caller already built (a self-hosting browser passes its own); otherwise one is built here. */
  level?: Level;
  send(to: string, d: Record<string, unknown>): void;
}

export class SessionSim {
  readonly level: Level;
  readonly map: MapId;
  readonly zombies: ZombieManager;
  kind: SessionKind;
  /** Applies from the next run (the lobby sets it before the owner starts). */
  difficulty: SessionDifficulty;
  private readonly rng: Rng;
  private readonly peers = new Map<string, Peer>();
  private seated = new Map<string, string>();
  private readonly send: SessionOptions['send'];
  private readonly dev: boolean;
  private time = 0;
  private gen = 0;
  private running = false;
  private ended = false;
  private sendT = 0;
  private killer: string | null = null;
  private readonly carriers: CarrierUnit[];
  private defense = createDefense();
  private elapsed = 0;
  private hunt = createHunt();
  private extraction = createExtraction();
  private outcome: { won: boolean; reason: string } | null = null;
  private readonly aboard = new Set<string>();
  private allies: SimAlly[] = [];
  /** The mystery boxes and kill drops, shared by the squad (`logic/sharedLoot.ts`). */
  private loot: LootState = createLoot(0);
  private shots: number[][] = [];
  private directorTurn = 0;
  private readonly allyWorld: AllyWorld;
  private allyLeader: Peer | null = null;
  /** This map's deadline and escalation (the Asylum's night runs longer). */
  private readonly clock: MissionClock;
  /** The Asylum: day and night, the files, the doors and the power, the boarded windows. */
  private readonly asylum: boolean;
  /** The Asylum's doors and power (perks stay on each player's client: they only change that player). */
  readonly loop = createLoopState();
  private records = createRecords();
  private readonly barricades: BarricadeDirector | null = null;
  /** What each player can still earn from nailing boards back (a token bucket each, see `asylum/barricades.ts`). */
  private readonly purses = new Map<string, RepairPurse>();
  private readonly powerups = createPowerups();
  /** True while a nuke is killing: those kills pay nothing and drop nothing. */
  private nuking = false;
  /** The Forge's story (`forge/story.ts`): the holdouts and their doors, the Hearth, the ledger, the Pit, the finale. */
  readonly forge: ForgeStory | null = null;
  private forgeTick: StoryTick | null = null;
  /** When the Forge's roster last went out (it goes every couple of seconds, for anyone who joins late). */
  private rosterSentAt = -99;
  /** The Sakura District's Easter egg, the Thousand Lanterns (`sakura/quest.ts`): shared by everyone in the run. */
  readonly sakura: SakuraQuest | null = null;
  /** The Sakura District's stalker, who comes once a run (`sakura/director.ts`). */
  private readonly stalker = new Stalker();

  constructor(opts: SessionOptions) {
    this.send = opts.send;
    this.dev = opts.dev === true;
    this.map = opts.map ?? 'district';
    this.kind = opts.kind ?? 'mission';
    this.difficulty = sessionDifficulty(opts.difficulty);
    this.rng = new Rng(opts.seed ?? (Date.now() & 0x7fffffff));
    if (opts.level) {
      this.level = opts.level;
    } else {
      this.level = buildLevel(blankMaterials(), this.map);
      // nothing is ever drawn here: let the geometry go
      this.level.root.clear();
    }
    this.zombies = new ZombieManager(createNullRigFactory(), this.level);
    if (this.map === 'sakura') this.zombies.pickVariant = sakuraVariantPicker(this.level);
    this.zombies.onKill = (z, head) => this.onKill(z, head);
    // insta-kill: any hit kills (not bosses, not carriers)
    this.zombies.damageFilter = (z, amount) => filterDamage(this.powerups, amount, z);
    this.clock = missionClock(this.map);
    this.asylum = this.map === 'asylum';
    if (this.asylum) {
      // the director only spawns in zones whose doors are open; a share of its spawns come in through the windows
      this.zombies.spawnAllowed = (x, z) => spawnAllowed(this.loop, x, z);
      this.barricades = new BarricadeDirector(findBarricades(this.level.world, this.level.nav), this.zombies);
      this.barricades.install();
    }
    this.carriers = CARRIERS.map((def, index) => {
      const base = ZOMBIES[def.base];
      const stats: ZombieDef = { ...base, name: def.name, hp: def.hp, speedChase: def.speedChase, damage: def.damage, bodyMul: def.bodyMul, poise: def.poise, radius: 0.3, height: def.height, headRadius: 0.18, sightRange: 30, reward: 0, headshotBonus: 0, dropChance: 0 };
      return { index, stats, base: def.base, zombie: null, state: null, lootX: 0, lootZ: 0 };
    });
    this.allyWorld = {
      level: this.level,
      zombies: this.zombies,
      rng: this.rng,
      followLeader: (x, z, out) => !!this.allyLeader && this.allyLeader.field.follow(x, z, out, 10),
    };
    const sites = this.level.data.forge;
    if (this.map === 'forge' && sites) {
      this.forge = new ForgeStory(sites, this.zombies, this.level.nav);
      this.forgeTick = {
        elapsed: 0,
        defenseDone: false,
        huntDone: false,
        calledAt: null,
        players: [],
        playerCount: 0,
        envNear: (x, z) => this.nearestUpEnv(x, z),
        seen: (x, z) => this.upPeers().some((p) => Math.hypot(p.ref.x - x, p.ref.z - z) < 70 && !this.level.world.segmentBlocked(p.ref.x, p.ref.eyeY, p.ref.z, x, 1.5, z, 'shots')),
      };
    }
    if (this.map === 'sakura' && this.level.sakura) this.sakura = new SakuraQuest(questSpots(this.level.sakura));
  }

  /** The Thousand Lanterns' consequences: the dead at the shrine for a wrong lantern; the ghost train at the bloom. */
  private sakuraEvents(): void {
    if (!this.sakura) return;
    for (const e of this.sakura.drain()) {
      if (e.kind === 'wrong') lanternWrath((type, x, z) => void this.zombies.spawn(type, x, z, this.rng, { state: 'chase' }));
      else if (e.kind === 'bloom' && this.level.sakura) this.level.sakura.kisaragi.link.closed = false;
    }
  }

  /** The environment of the nearest player who is up (else anyone at all): what the Forge's reborn hunts. */
  private nearestUpEnv(x: number, z: number): ZombieEnv | null {
    let best: Peer | null = null;
    let bd = Infinity;
    for (const p of this.peers.values()) {
      const d = Math.hypot(p.ref.x - x, p.ref.z - z) + (p.ref.alive ? 0 : 1e4);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? best.env : null;
  }

  private get story(): boolean {
    return this.kind === 'mission' || this.kind === 'mazoku' || isStory(this.kind);
  }

  // ---------------------------------------------------------------------------------------------
  // membership and control
  // ---------------------------------------------------------------------------------------------

  /** Who holds a player seat right now (spectators are not listed). */
  players(list: readonly { id: string; name: string }[]): void {
    this.seated = new Map(list.map((p) => [p.id, p.name]));
    for (const id of [...this.peers.keys()]) if (!this.seated.has(id)) this.peers.delete(id);
  }

  /** A fresh run (the owner started the session, or asked for another go after the results). */
  begin(): void {
    this.gen++;
    this.running = true;
    this.ended = false;
    this.time = 0;
    this.sendT = 0;
    this.defense = createDefense();
    this.zombies.clearAll();
    this.zombies.tuning = ZOMBIE_DIFFICULTY[this.difficulty.zombies];
    // the Asylum's run starts in the afternoon: the population is made sleepy and few
    if (this.asylum) this.zombies.setPhaseTuning(phaseTuning(timeOfDay(0)));
    this.zombies.namer = null;
    this.zombies.sleepFar = this.story;
    for (const u of this.carriers) {
      u.zombie = null;
      u.state = null;
    }
    for (const p of this.peers.values()) {
      p.kills = 0;
      p.downs = 0;
      p.ref.alive = false;
      p.life = LIFE.up;
    }
    this.elapsed = 0;
    this.hunt = createHunt();
    this.extraction = createExtraction();
    this.outcome = null;
    this.aboard.clear();
    this.allies = [];
    this.shots = [];
    this.loot = createLoot(this.level.data.crates.length);
    this.records = createRecords();
    this.barricades?.reset();
    this.purses.clear();
    resetPowerups(this.powerups);
    this.nuking = false;
    // the Asylum's doors: open while the squad's cages are placed (as in solo), then shut for the run; free roam
    // tours the whole hill with every door open and the lights on
    resetLoopState(this.loop);
    if (this.kind === 'roam') {
      this.loop.doors.fill(1);
      this.loop.power = 1;
    }
    this.level.doors?.setAll(true);
    if (this.story) this.setUpStory();
    this.level.doors?.sync(this.loop.doors);
    if (this.asylum && this.story) {
      // by day there is nobody to hunt: the Matron wakes at nightfall
      gateHunt(this.hunt, 0);
      this.keepBossAway();
    }
  }

  /** The Asylum by day: the Matron is not on the hill while her hunt is closed. */
  private keepBossAway(): void {
    const b = this.zombies.boss;
    if (this.hunt.status === 'available' && b && b.alive) this.zombies.remove(b);
  }

  /** The story operation's world: residents and the boss, the Vulcan names, the squad, the cages, carriers. */
  private setUpStory(): void {
    const level = this.level;
    const rng = this.rng;
    // the Forge: who is holed up where this run (and the first infected at their doors), before the residents, so none
    // of them carries a living person's name; the co-leaders who deploy come from the same roster
    // a Sakura District story mission comes in somewhere of its own
    const tale = this.map === 'sakura' && isStory(this.kind) ? this.kind : null;
    if (this.map === 'sakura') applyStoryStart(this.level, tale);
    const roster = this.forge?.reset(rng) ?? null;
    // the Thousand Lanterns: a new poem, and the ghost train gone until the next bloom
    this.sakura?.reset(() => rng.f());
    if (this.level.sakura) this.level.sakura.kisaragi.link.closed = true;
    this.rosterSentAt = -99;
    if (this.map === 'forge') {
      let bag: string[] = [];
      const alive = this.forge?.reserved;
      this.zombies.namer = () => {
        if (rng.f() >= VULCAN.namedShare) return null;
        const inUse = new Set(this.zombies.zombies.map((q) => q.tag));
        if (bag.length === 0) bag = [...VULCAN.infected].sort(() => rng.f() - 0.5);
        for (let i = 0; i < bag.length; i++) if (!inUse.has(bag[i]!) && !alive?.has(bag[i]!)) return bag.splice(i, 1)[0]!;
        return null;
      };
    }
    this.zombies.populate(rng);
    if (this.map === 'sakura') {
      populateSakura(this.zombies, this.level, rng);
      this.stalker.reset();
      if (tale) {
        populateStory(tale, this.zombies, this.level, rng);
        settleStoryContracts(tale, this.defense, this.hunt);
      }
    }
    const st = level.data.playerStart;
    const squad = roster ? roster.squad : squadRoster(this.map, Math.max(1, this.seated.size));
    const at = soldierSpots(level, rng, squad.length);
    squad.forEach((name, i) => this.allies.push({ ...makeAllyBody(level, name, 'soldier', at[i]!.x, at[i]!.z, st.yaw, at[i]!.slot, false, this.allies.length, this.difficulty.team), leader: null }));
    // cages everywhere but the Forge (its people are holed up in rooms)
    const caged = this.forge ? [] : survivorRoster(this.map);
    cageSpots(level, rng, caged.length).forEach((c, i) => this.allies.push({ ...makeAllyBody(level, caged[i]!.name, 'survivor', c.x, c.z, 0, c.slot, true, this.allies.length, this.difficulty.team), leader: null }));
    if (this.kind === 'mazoku') this.placeCarriers();
  }

  /** The five card carriers at spread-out resident spots, away from the start, the LZ, the boss and the relay. */
  private placeCarriers(): void {
    const data = this.level.data;
    const far = (p: { x: number; z: number }, x: number, z: number, d: number): boolean => Math.hypot(p.x - x, p.z - z) > d;
    let spots = data.ambient.filter(
      (a) =>
        far(a, data.playerStart.x, data.playerStart.z, CARD_MODE.minStartDistance) &&
        far(a, data.extraction.lzX, data.extraction.lzZ, 28) &&
        far(a, data.hunt.wardenX, data.hunt.wardenZ, 42) &&
        far(a, data.defense.x, data.defense.z, data.defense.radius + 8),
    );
    if (spots.length < this.carriers.length) spots = data.ambient;
    const rand = (): number => this.rng.f();
    const picks = spreadPick(spots, this.carriers.length, rand);
    const order = this.carriers.map((_, i) => i).sort(() => rand() - 0.5);
    picks.forEach((spotIndex, n) => {
      const u = this.carriers[order[n]!]!;
      const spot = spots[spotIndex]!;
      const at = this.level.nav.randomFreeNear(spot.x, spot.z, 3, rand) ?? spot;
      u.zombie = this.zombies.spawn(u.base, at.x, at.z, this.rng, { ambient: true, def: u.stats, curable: true });
      u.zombie.carrierIdx = u.index + 1;
      u.state = createCarrier(CARRIERS[u.index]!.id);
    });
  }

  /** The run is over (won or lost) and nobody has asked for another. */
  get finished(): boolean {
    return this.ended;
  }

  // ---------------------------------------------------------------------------------------------
  // messages from players
  // ---------------------------------------------------------------------------------------------

  message(from: string, d: Record<string, unknown>, owner: boolean): void {
    if (owner && d.k === 'restart') {
      if (!this.running || this.ended) this.begin();
      return;
    }
    if (!this.running) return;
    const name = this.seated.get(from);
    if (name === undefined) return;
    const p = this.peer(from, name);
    const up = p.life === LIFE.up;
    switch (d.k) {
      case 'p': {
        p.ref.x = Number(d.x) || 0;
        p.ref.y = Number(d.y) || 0;
        p.ref.z = Number(d.z) || 0;
        p.ref.eyeY = p.ref.y + 1.6;
        p.yaw = Number(d.yaw) || 0;
        p.ref.yaw = p.yaw;
        p.hp = Number(d.hp) || 0;
        p.gear = [Math.max(0, Math.min(4, Math.floor(Number(d.w) || 0))), Math.max(-1.6, Math.min(1.6, Number(d.pi) || 0)), Math.floor(Number(d.f) || 0) % 4096];
        p.info = [Math.max(0, Math.min(999, Math.round(Number(d.ar) || 0))), Math.max(0, Math.min(9999999, Math.round(Number(d.cs) || 0))), d.dv === 1 ? 1 : 0];
        p.seen = this.time;
        if (p.life === LIFE.aboard) return; // aboard for good
        const st = Number(d.st);
        const life: Life = st === LIFE.up || st === LIFE.down || st === LIFE.out ? (st as Life) : d.up === true ? LIFE.up : LIFE.down;
        if (p.life === LIFE.up && life !== LIFE.up) p.downs++;
        p.life = life;
        p.ref.alive = life === LIFE.up;
        return;
      }
      case 'hit': {
        const z = this.zombies.zombies.find((q) => q.id === d.z);
        if (!z || !z.alive || !up) return;
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
        if (!u || !z || !u.state || !up || Math.hypot(z.x - p.ref.x, z.z - p.ref.z) > CARD_MODE.cureReach + 2.5) return;
        if (!purgeCarrier(u.state)) return;
        u.lootX = z.x;
        u.lootZ = z.z;
        this.zombies.remove(z);
        u.zombie = null;
        return;
      }
      case 'take': {
        const u = this.carriers.find((q) => CARRIERS[q.index]!.id === String(d.id));
        if (!u?.state || u.state.phase !== 'purged' || !up) return;
        if (Math.hypot(u.lootX - p.ref.x, u.lootZ - p.ref.z) > CARD_MODE.pickupRadius + 2.5) return;
        if (recoverCarrier(u.state)) this.send('all', { k: 'card', id: CARRIERS[u.index]!.id });
        return;
      }
      case 'relay': {
        const c = this.level.transmitter.console;
        if (up && Math.hypot(c.x - p.ref.x, c.z - p.ref.z) < 5) activateDefense(this.defense);
        return;
      }
      case 'call': {
        // in the zone or at its radio (slack for the report lag); the radio may stand outside the zone's circle
        if (this.story && up && atLzOrRadio(p.ref.x, p.ref.z, this.level.data.extraction, 1.5)) callExtraction(this.extraction, this.elapsed, true, true);
        return;
      }
      case 'board': {
        const e = this.level.data.extraction;
        if (!this.story || !up || this.extraction.phase !== 'landed') return;
        if (Math.hypot(p.ref.x - e.heliX, p.ref.z - e.heliZ) > MISSION.extraction.boardRadius + 3.5) return;
        this.aboard.add(from);
        p.life = LIFE.aboard;
        p.ref.alive = false;
        this.send(from, { k: 'boarded' });
        this.send('all', { k: 'note', t: `${p.name.toUpperCase()} IS ABOARD` });
        return;
      }
      case 'revive': {
        const t = this.peers.get(String(d.id));
        if (!this.story || !up || !t || t.life !== LIFE.down || Math.hypot(t.ref.x - p.ref.x, t.ref.z - p.ref.z) > 3.2) return;
        t.life = LIFE.up;
        t.ref.alive = true;
        this.send(t.id, { k: 'revived', by: p.name });
        this.send('all', { k: 'note', t: `${p.name.toUpperCase()} REVIVED ${t.name.toUpperCase()}` });
        return;
      }
      case 'rescue': {
        const a = this.allies.find((q) => q.name === String(d.id) && q.trapped && q.ref.alive);
        if (!this.story || !up || !a || Math.hypot(a.ref.x - p.ref.x, a.ref.z - p.ref.z) > 4) return;
        a.trapped = false;
        a.leader = from;
        a.yaw = p.yaw;
        a.ref.z -= 1.6; // step out of the door
        const freed = this.allies.filter((q) => q.kind === 'survivor' && !q.trapped).length;
        const total = this.allies.filter((q) => q.kind === 'survivor').length;
        this.send('all', { k: 'cash', c: SURVIVORS.rescueCash, t: `${a.name.toUpperCase()} FREED ${freed}/${total}` });
        return;
      }
      case 'stoke': {
        // the Forge: stoke furnace i (its circle must then be held while it catches)
        if (!this.forge || !this.story || !up) return;
        this.forge.stoke(Number(d.i), p.ref.x, p.ref.z);
        return;
      }
      case 'hold': {
        // the Forge: talk holdout i out of their room (at their door, with nothing on its feet at it)
        if (!this.forge || !this.story || !up) return;
        this.forge.rescue(Number(d.i), p.ref.x, p.ref.z);
        return;
      }
      case 'sq': {
        // the Thousand Lanterns: a charm, the tree, a lantern or the bell (the quest checks they are within reach)
        if (!this.sakura || !this.story || !up) return;
        const q = this.sakura;
        const i = Math.floor(Number(d.i));
        if (d.a === 'charm') q.takeCharm(i, p.ref.x, p.ref.y, p.ref.z);
        else if (d.a === 'tie') q.tie(p.ref.x, p.ref.z);
        else if (d.a === 'light') q.light(i, p.ref.x, p.ref.z);
        else if (d.a === 'ring') q.ring(p.ref.x, p.ref.z, this.defense.status === 'active');
        this.sakuraEvents();
        return;
      }
      case 'ledger': {
        if (!this.forge || !this.story || !up) return;
        this.forge.takeLedger(Number(d.i), p.ref.x, p.ref.z);
        return;
      }
      case 'bell': {
        if (!this.forge || !this.story || !up || !this.forgeTick) return;
        this.forge.ringBell(p.ref.x, p.ref.z, this.fillForgeTick(), this.rng);
        return;
      }
      case 'box': {
        // a mystery box: the first to open it wins it (their client rolled the prize; it pays the opening cash on 'boxed')
        const i = Number(d.i);
        const c = this.level.data.crates[i];
        if (!this.story || !up || !c || Math.hypot(c.x - p.ref.x, c.z - p.ref.z) > 4) return;
        if (openBox(this.loot, i, from, String(d.pz ?? ''))) this.send(from, { k: 'boxed', i });
        return;
      }
      case 'boxTake': {
        takeBox(this.loot, Number(d.i), from);
        return;
      }
      case 'pick': {
        // a drop: whoever walks over it first (their client applies it on 'picked')
        if (!up) return;
        const kind = pickDrop(this.loot, Number(d.id), p.ref.x, p.ref.z);
        if (kind) this.send(from, { k: 'picked', id: Number(d.id), kind });
        return;
      }
      case 'rec': {
        // the Asylum: a patient file, taken by whoever stands at it (every client pays itself once for each file)
        const i = Number(d.i);
        const spot = RECORDS.spots[i];
        if (!this.asylum || !this.story || !up || !spot || Math.hypot(spot.x - p.ref.x, spot.z - p.ref.z) > RECORDS.pickupRadius + 2.5) return;
        pickUpRecord(this.records, i);
        return;
      }
      case 'door': {
        // the Asylum: buy a door for the squad (the buyer's client checked its cash, and pays on the confirmation)
        const i = Number(d.i);
        const door = ASYLUM_DOORS[i];
        if (!this.asylum || this.kind === 'roam' || !up || !door || doorState(this.loop, i, Infinity) !== 'ok') return;
        if (Math.hypot(door.x - p.ref.x, door.z - p.ref.z) > LOOP.reach + door.width / 2 + 2.5) return;
        this.loop.doors[i] = 1;
        this.level.doors?.sync(this.loop.doors);
        this.send(from, { k: 'bought', i, c: door.cost });
        const beyond = door.zones.find((z) => z !== 'front') ?? door.zones[1];
        this.send('all', { k: 'note', t: `${p.name.toUpperCase()} OPENED ${ZONE_NAMES[beyond]}` });
        return;
      }
      case 'lever': {
        // the Asylum: the power switch in the boiler house (free; wakes the perk machines and the press for everyone)
        const L = POWER_LEVER;
        if (!this.asylum || !up || isPowerOn(this.loop) || Math.hypot(L.x - p.ref.x, L.z - p.ref.z) > LOOP.reach + 2.5) return;
        setPower(this.loop, true);
        this.send('all', { k: 'note', t: `${p.name.toUpperCase()} THREW THE POWER` });
        return;
      }
      case 'dev': {
        // the QA script's set-ups (development only, the owner only): a power-up 3 m in front of them, boards torn off
        if (!this.dev || !owner || !this.story) return;
        const kind = POWERUP_KINDS[Number(d.drop)];
        if (kind) this.powerups.drops.push({ id: this.powerups.nextId++, kind, x: p.ref.x - Math.sin(p.yaw) * 3, z: p.ref.z - Math.cos(p.yaw) * 3, age: 0 });
        const w = this.barricades?.state;
        const i = Number(d.tear);
        if (w && i >= 0 && i < w.boards.length) w.boards[i] = Math.max(0, w.boards[i]! - 3);
        return;
      }
      case 'fix': {
        // nail one board back on window i: from the inside, within reach; pays out of that player's own purse
        const b = this.barricades;
        const w = b?.defs[Number(d.i)];
        if (!b || !w || !this.story || !up) return;
        if (Math.hypot(w.x - p.ref.x, w.z - p.ref.z) > BARRICADE.repairReach + 2 || sideOf(w, p.ref.x, p.ref.z) > 0.5) return;
        if (!repairBoard(b.state, w.id)) return;
        let purse = this.purses.get(from);
        if (!purse) this.purses.set(from, (purse = createPurse(this.time)));
        this.send(from, { k: 'fixed', i: w.id, c: payRepair(purse, this.time, cashMultiplier(this.powerups)) });
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
    p = { id, name, ref, yaw: 0, hp: 100, kills: 0, downs: 0, seen: -99, life: LIFE.up, gear: [0, 0, 0], info: [0, 0, 0], env: null as never, field, fieldT: 0 };
    p.env = this.makeEnv(ref, field, (amount, sx, sz, knock) => this.send(id, { k: 'hurt', a: r1(amount), sx: r1(sx), sz: r1(sz), kn: knock }));
    this.peers.set(id, p);
    return p;
  }

  private makeEnv(ref: PlayerRef, field: FlowField, hurt: (amount: number, sx: number, sz: number, knock: number) => void): ZombieEnv {
    return {
      time: 0,
      world: this.level.world,
      nav: this.level.nav,
      floors: this.level.floors,
      field,
      player: ref,
      rng: this.rng,
      audio: silent as never,
      fx: silent as never,
      hurtPlayer: (amount, sx, sz, _kind, knock) => hurt(amount, sx, sz, knock),
      alertNear: (x, z, r, srcId) => this.zombies.alertNear(x, z, r, srcId),
      shake: noop,
    };
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
    if (this.kind === 'roam') {
      this.time += dt;
      for (const p of this.peers.values()) if (this.time - p.seen > AWAY_AFTER) p.ref.alive = false;
      this.flush(dt);
      return;
    }
    const envs: ZombieEnv[] = [];
    let up = 0;
    let reported = 0;
    for (const p of this.peers.values()) {
      // a player who stopped reporting (tab in the background, connection gone) is not a target
      if (this.time - p.seen > AWAY_AFTER) p.ref.alive = false;
      else reported++;
      p.env.time = this.time;
      p.fieldT -= dt;
      if (p.ref.alive && p.fieldT <= 0) {
        p.field.compute(p.ref.x, p.ref.z, GAMEPLAY_FIELD_RANGE);
        p.fieldT = 0.4;
      }
      if (p.ref.alive) up++;
      envs.push(p.env);
    }
    // nobody has deployed yet: hold everything (the clock starts when the first player is in)
    if (envs.length === 0 || (this.elapsed === 0 && up === 0)) {
      this.flush(dt);
      return;
    }
    this.time += dt;
    this.tickStory(dt, envs, up, reported);
    if (this.ended) {
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

  private upPeers(): Peer[] {
    return [...this.peers.values()].filter((p) => p.ref.alive);
  }

  /** What the Forge's story sees of the run this frame. */
  private fillForgeTick(): StoryTick {
    const t = this.forgeTick!;
    t.elapsed = this.elapsed;
    t.defenseDone = this.defense.status === 'complete';
    t.huntDone = this.hunt.status === 'complete';
    t.calledAt = this.extraction.calledAt;
    t.players = [...this.peers.values()].map((p) => ({ x: p.ref.x, z: p.ref.z, alive: p.ref.alive, eyeY: p.ref.eyeY }));
    t.playerCount = Math.max(1, this.peers.size);
    return t;
  }

  private stepRelay(dt: number): void {
    if (this.defense.status !== 'active') return;
    const s = this.level.data.defense;
    const inside = this.upPeers().some((p) => Math.hypot(p.ref.x - s.x, p.ref.z - s.z) < s.radius);
    updateDefense(this.defense, dt, inside, true);
  }

  // ---- story -----------------------------------------------------------------------------------

  private tickStory(dt: number, envs: ZombieEnv[], up: number, reported: number): void {
    this.elapsed += dt;
    tickLoot(this.loot, dt);
    const peers = this.upPeers();
    // the squad: allies who are fighting are targets too
    const allyEnvs: ZombieEnv[] = [];
    for (const a of this.allies) {
      if (!a.ref.alive || a.trapped) continue;
      a.env ??= this.makeEnv(a.ref, a.field, (amount, sx, sz) => this.hurtAlly(a, amount, sx, sz));
      a.env.time = this.time;
      allyEnvs.push(a.env);
    }
    this.zombies.update(dt, envs[0]!, up > 0, envs.concat(allyEnvs));

    // the director keeps the pressure on each player in turn
    if (peers.length > 0) {
      const p = peers[this.directorTurn++ % peers.length]!;
      const ex = this.extraction;
      const ctx: DirectorContext = {
        elapsed: this.elapsed,
        playerX: p.ref.x,
        playerZ: p.ref.z,
        playerYaw: p.yaw,
        playerEyeY: p.ref.eyeY,
        region: this.level.regionAt(p.ref.x, p.ref.z),
        phase: escalationPhase(this.elapsed, this.clock),
        quality: 'medium',
        defenseActive: this.defense.status === 'active',
        // the Forge's last stand brings its own waves to the Hearth (`forge/assault.ts`)
        extractionElapsed: extractionInProgress(ex) && ex.calledAt !== null && !this.forge ? this.elapsed - ex.calledAt : null,
        // the Forge after the burnout: the virus is over, nothing more comes
        paused: this.forge?.quietDirector ?? false,
      };
      this.zombies.director(dt, ctx, p.env, this.rng);
    }
    if (this.forge) this.forge.tick(dt, this.fillForgeTick(), this.rng);
    if (this.sakura) {
      this.sakura.tick(dt);
      this.sakuraEvents();
      if (this.story) this.stalker.update(dt, this.zombies, this.level, [...this.peers.values()].map((q) => ({ x: q.ref.x, z: q.ref.z, alive: q.ref.alive })), this.rng);
    }

    // the Asylum: the infected follow the light, and the Matron's hunt is only open at night
    if (this.asylum) {
      this.zombies.setPhaseTuning(phaseTuning(timeOfDay(this.elapsed, this.extraction.calledAt)));
      gateHunt(this.hunt, this.elapsed);
      this.keepBossAway();
    }
    // contracts (never unwinnable: an uncredited Warden death completes the hunt; a missing Warden is back home)
    if (this.hunt.status === 'active') {
      const b = this.zombies.boss;
      if (b && !b.alive) completeHunt(this.hunt);
      else if (!b) this.zombies.spawnWarden(this.rng);
    }
    const boss = this.zombies.boss;
    if (boss && boss.alive && this.hunt.status === 'active') {
      let near = Infinity;
      for (const p of peers) near = Math.min(near, Math.hypot(boss.x - p.ref.x, boss.z - p.ref.z));
      // out of the search area: revealed, so everyone's marker follows him
      const h = this.level.data.hunt;
      if (Math.hypot(boss.x - h.searchX, boss.z - h.searchZ) > h.searchRadius + 10) near = 0;
      updateHunt(this.hunt, near, true);
    }
    this.stepRelay(dt);
    // the Asylum: the generators running (RESTORE THE POWER) throw the power on, as the lever does
    if (this.asylum && this.defense.status === 'complete') setPower(this.loop, true);
    this.barricades?.update();
    this.stepPowerups(dt, peers);
    unlockExtraction(this.extraction, allContractsComplete(this.defense, this.hunt));
    this.stepExtraction(dt, up);
    this.stepAllies(dt, peers);
    this.stepCarriers(dt);
    for (const u of this.carriers) {
      const z = u.zombie;
      if (!z || !u.state) continue;
      let near = Infinity;
      for (const p of peers) near = Math.min(near, Math.hypot(z.x - p.ref.x, z.z - p.ref.z));
      identifyCarrier(u.state, near);
    }

    // the end: the district sealed, or nobody left standing
    if (!this.outcome && !extractionInProgress(this.extraction) && this.elapsed > this.clock.deadline) this.finish(false, 'The district was sealed before extraction was called');
    if (!this.outcome && up === 0 && reported > 0 && this.aboard.size === 0 && [...this.peers.values()].every((p) => p.life !== LIFE.up)) {
      this.finish(false, 'The whole squad went down');
    }
  }

  private stepExtraction(dt: number, up: number): void {
    const ex = this.extraction;
    if (!extractionInProgress(ex)) return;
    // the Forge: the bird holds off while the reborn is loose
    for (const ev of updateExtraction(ex, this.forge?.holdExtraction ? 0 : dt)) {
      if (ev === 'departed') {
        // the boarding window ran out: whoever is aboard leaves with it
        if (this.aboard.size > 0) {
          ex.phase = 'extracted';
          this.finish(true, 'Extracted');
        } else this.finish(false, 'The helicopter departed without the squad');
      }
    }
    // everyone still standing is aboard: the bird leaves now
    if (ex.phase === 'landed' && this.aboard.size > 0 && up === 0) {
      ex.phase = 'extracted';
      this.finish(true, 'Extracted');
    }
  }

  private finish(won: boolean, reason: string): void {
    if (this.outcome) return;
    this.outcome = { won, reason };
    this.ended = true;
    if (won) {
      // the squad's bonuses go to everyone who made it out
      const soldiers = this.allies.filter((a) => a.kind === 'soldier' && a.ref.alive).length;
      // the freed (cages), or everyone waiting at the Forge's Hearth
      const survivors = this.forge ? this.forge.view.holdouts.filter((h) => h.phase === 'hearth').length : this.allies.filter((a) => a.kind === 'survivor' && a.ref.alive && !a.trapped).length;
      for (const id of this.aboard) {
        if (soldiers > 0) this.send(id, { k: 'cash', c: soldiers * FORGE_SQUAD.saveBonus, t: `SQUAD EXTRACTED ${soldiers}` });
        if (survivors > 0) this.send(id, { k: 'cash', c: survivors * SURVIVORS.extractBonus, t: `SURVIVORS EXTRACTED ${survivors}` });
      }
    }
  }

  private stepAllies(dt: number, peers: Peer[]): void {
    this.allies.forEach((a, i) => {
      if (!a.ref.alive || a.trapped) return;
      allyRecover(a, dt);
      a.fieldT -= dt;
      if (a.fieldT <= 0) {
        a.field.compute(a.ref.x, a.ref.z, GAMEPLAY_FIELD_RANGE);
        a.fieldT = 1;
      }
      // follow whoever freed them while they are up, else the nearest player who is
      let leader = a.leader ? this.peers.get(a.leader) : undefined;
      if (!leader || !leader.ref.alive) {
        let bd = Infinity;
        leader = undefined;
        for (const p of peers) {
          const d = Math.hypot(p.ref.x - a.ref.x, p.ref.z - a.ref.z);
          if (d < bd) {
            bd = d;
            leader = p;
          }
        }
      }
      if (leader) {
        this.allyLeader = leader;
        allyMove(a, this.allyWorld, dt, leader.ref.x, leader.ref.z, leader.yaw, leader.ref.y);
        this.allyLeader = null;
      }
      const shot = allyFight(a, this.allyWorld, dt);
      if (!shot) return;
      if (shot.hit && shot.target.alive && a.env) allyHit(a, shot, this.zombies, a.env);
      if (this.shots.length < 40) this.shots.push([i, r1(shot.to.x), r1(shot.to.y), r1(shot.to.z), shot.hit ? 1 : 0]);
    });
  }

  private hurtAlly(a: SimAlly, amount: number, sx: number, sz: number): void {
    if (!a.ref.alive) return;
    a.hp -= amount * a.stats.damageTaken;
    a.sinceHurt = 0;
    if (a.hp > 0) return;
    a.hp = 0;
    a.ref.alive = false;
    // facing the blow: the clients throw the body away from it
    a.yaw = Math.atan2(-(sx - a.ref.x), -(sz - a.ref.z));
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

  /** Power-ups: drops float and time out, timers run down, and a drop goes to the nearest player who walks into it. */
  private stepPowerups(dt: number, peers: Peer[]): void {
    const s = this.powerups;
    tickPowerups(s, dt);
    for (let i = s.drops.length - 1; i >= 0; i--) {
      const d = s.drops[i]!;
      let best: Peer | null = null;
      // reports come a dozen times a second: a little slack so a player running through is not missed
      let bd = POWERUPS.pickupRadius + 0.6;
      for (const p of peers) {
        const dist = Math.hypot(p.ref.x - d.x, p.ref.z - d.z);
        if (dist <= bd) {
          bd = dist;
          best = p;
        }
      }
      if (!best) continue;
      s.drops.splice(i, 1);
      this.takePowerup(d, best);
    }
  }

  /** `p` took drop `d`: the nuke and the carpenter happen here; every client hears it, shows it and is paid its cash. */
  private takePowerup(d: PowerupDrop, p: Peer): void {
    const e = applyPowerup(this.powerups, d.kind);
    if (e.killAll) {
      const list = this.zombies.zombies;
      const victims = nukeTargets(list).map((i) => list[i]!);
      this.nuking = true;
      for (const z of victims) this.zombies.damage(z, z.hp + 1e6, false, p.env, Math.atan2(-(z.x - p.ref.x), -(z.z - p.ref.z)), 2.5, 2);
      this.nuking = false;
    }
    if (e.repairAll && this.barricades) repairAll(this.barricades.state);
    // MAX AMMO: each client refills its own player's ammo when it hears this
    this.send('all', { k: 'pw', id: d.id, w: POWERUP_KINDS.indexOf(d.kind), x: r1(d.x), z: r1(d.z), n: p.name, c: Math.round(e.cash * cashMultiplier(this.powerups)) });
  }

  private onKill(z: Zombie, head: boolean): void {
    // the Forge's burnout: the virus ending pays nobody (and the reborn is not the hunt's boss)
    if (this.forge?.noReward) return;
    if (z.isBoss && this.story && z !== this.forge?.reborn) completeHunt(this.hunt);
    const p = this.killer ? this.peers.get(this.killer) : null;
    // a nuke's kills pay nothing and drop nothing (the nuke pays)
    if (!p || this.nuking) return;
    p.kills++;
    const cash = Math.round(killReward(z.def, head, this.story ? this.level.regionAt(z.x, z.z) : 'low') * cashMultiplier(this.powerups)); // double points
    // the drop is the squad's (shared below), so the killer's client does not roll its own
    this.send(p.id, { k: 'kill', n: z.tag ?? z.def.name, h: head, c: cash, x: r1(z.x), zz: r1(z.z), dc: 0 });
    if (this.story && !z.isBoss) rollKillDrop(this.loot, r1(z.x), r1(z.z), z.def.dropChance * REGIONS[this.level.regionAt(z.x, z.z)].dropMul, this.rng);
    if (this.story) rollDrop(this.powerups, this.rng, z.x, z.z, { eligible: !z.isBoss && !z.curable, carpenter: !!this.barricades && anyDamaged(this.barricades.state) });
  }

  // ---------------------------------------------------------------------------------------------
  // snapshot
  // ---------------------------------------------------------------------------------------------

  private snapshot(): void {
    const z: number[][] = [];
    for (const q of this.zombies.zombies) {
      // the story's sleeping residents are nobody's business until someone comes near
      if (q.dormant) continue;
      const n = q.toNet();
      const row = [n.id, TYPES.indexOf(n.type), r1(n.x), r1(n.z), r2(n.yaw), MODES.indexOf(n.mode), r2(n.actionT), r2(n.staggerT), r1(n.speed), r2(n.hp), n.flags, n.carrier];
      const tag = q.tag ? (VULCAN.infected as readonly string[]).indexOf(q.tag) : -1;
      // the floor it stands on and its kind (the Sakura District's storeys and variants) ride after the name
      const y = r1(n.y ?? 0);
      const v = VARIANTS.indexOf(q.variant);
      const more = tag >= 0 || y !== 0 || v > 0;
      if (n.fy !== 0 || n.fp !== 0 || n.fr !== 0 || more) row.push(r2(n.fy), r2(n.fp), r2(n.fr));
      if (more) row.push(tag, y, v);
      z.push(row);
    }
    const p: unknown[][] = [];
    for (const q of this.peers.values()) p.push([q.id, r1(q.ref.x), r1(q.ref.y), r1(q.ref.z), r2(q.yaw), q.ref.alive ? 1 : 0, q.hp, q.kills, q.downs, q.life, q.gear[0], r2(q.gear[1]), q.gear[2], q.info[0], q.info[1], q.info[2]]);
    const c: number[][] = [];
    for (const u of this.carriers) {
      if (u.state) c.push([u.index, CARRIER_PHASES.indexOf(u.state.phase), Math.round(u.state.downLeft), r1(u.lootX), r1(u.lootZ)]);
    }
    const rl = [RELAY_STATUSES.indexOf(this.defense.status), r2(this.defense.progress)];
    const out: Record<string, unknown> = { k: 's', g: this.gen, kind: this.kind, z, p, c, rl };
    if (this.story) {
      const ex = this.extraction;
      out.ms = [r1(this.elapsed), RELAY_STATUSES.indexOf(this.hunt.status), this.hunt.identified ? 1 : 0, EXTRACTION_PHASES.indexOf(ex.phase), r1(ex.countdown), r1(ex.windowLeft), ex.calledAt === null ? -1 : r1(ex.calledAt), this.outcome ? (this.outcome.won ? 1 : 2) : 0];
      if (this.outcome) out.why = this.outcome.reason;
      out.sq = this.allies.map((a, i) => [i, r1(a.ref.x), r1(a.ref.z), r2(a.yaw), !a.ref.alive ? 0 : a.trapped ? 2 : 1, Math.round(a.hp)]);
      out.sh = this.shots;
      this.shots = [];
      // power-ups: the timers (insta-kill, double points) and the drops [id, kind, x, z, age]
      const pw = this.powerups;
      out.pu = [r1(pw.timers.instaKill), r1(pw.timers.doublePoints)];
      out.pd = pw.drops.map((q) => [q.id, POWERUP_KINDS.indexOf(q.kind), r1(q.x), r1(q.z), r1(q.age)]);
      // shared loot: each box [phase, opener, prize, seconds in phase]; each drop [id, kind, x, z]
      out.bx = this.loot.boxes.map((b) => [b.phase, b.owner ?? '', b.prize, r1(b.t)]);
      out.dr = this.loot.drops.map((q) => [q.id, q.kind, q.x, q.z]);
      if (this.asylum) {
        out.rc = bits(this.records.found); // the patient files taken
        if (this.barricades) out.bd = [...this.barricades.state.boards]; // boards up per window
      }
      if (this.sakura) out.sq = encodeQuest(this.sakura.view); // the Thousand Lanterns
      if (this.forge) {
        // the Forge's story: its state every time, the run's roster now and then (late joiners need it)
        out.fg = encodeState(this.forge.view);
        if (this.time - this.rosterSentAt > 2) {
          this.rosterSentAt = this.time;
          out.fr = encodeRoster(this.forge.view);
        }
      }
    }
    // the Asylum's doors (bit i: door i open) and the power
    if (this.asylum) out.lp = [bits(this.loop.doors), this.loop.power];
    this.send('all', out);
  }

  /** Diagnostics for the admin view and tests. */
  stats(): { kind: SessionKind; infected: number; players: number; up: number; elapsed: number; extraction: ExtractionPhase; outcome: string | null } {
    return {
      kind: this.kind,
      infected: this.zombies.aliveCount,
      players: this.peers.size,
      up: this.upPeers().length,
      elapsed: this.elapsed,
      extraction: this.extraction.phase,
      outcome: this.outcome ? `${this.outcome.won ? 'won' : 'lost'}: ${this.outcome.reason}` : null,
    };
  }

  /** Tests: the story's internals. */
  get debug(): {
    defense: ReturnType<typeof createDefense>;
    hunt: ReturnType<typeof createHunt>;
    extraction: ReturnType<typeof createExtraction>;
    allies: SimAlly[];
    aboard: Set<string>;
    records: ReturnType<typeof createRecords>;
    barricades: BarricadeDirector | null;
    powerups: ReturnType<typeof createPowerups>;
    /** Move the mission clock (nightfall on the Asylum without waiting for it). */
    setElapsed(t: number): void;
  } {
    return { defense: this.defense, hunt: this.hunt, extraction: this.extraction, allies: this.allies, aboard: this.aboard, records: this.records, barricades: this.barricades, powerups: this.powerups, setElapsed: (t) => void (this.elapsed = t) };
  }
}

/** The name the server worker and the earlier tests know it by. */
export { SessionSim as ServerHost };
