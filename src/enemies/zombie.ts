/**
 * A single infected: behaviour state machine (idle, alert, chase, attack, stagger, dead), steering along the shared
 * flow field, telegraphed melee attacks with wall-checked hit tests, Warden specials (slam, charge) and animation state.
 */
import { RAGDOLL, WARDEN, ZOMBIES, ZOMBIE_AI, type ZombieDef } from '../config';
import type { AudioEngineApi, SoundId } from '../audio/ids';
import type { FxApi } from '../fx/fxTypes';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';
import type { CollisionWorld } from '../world/collision';
import type { FloorLink, Floors } from '../world/floors';
import type { FlowField, NavGrid } from '../world/nav';
import type { ZombieAnimState, ZombieMode, ZombieRig } from './zombieRigTypes';
import type { ZombieVariant } from './variants';

/** A woman's voice for each of the horde's noises; the boss gets the Matron's shriek for her roar. */
const FEMALE_VOICE: Partial<Record<SoundId, SoundId>> = {
  zombie_groan: 'fzombie_moan',
  zombie_alert: 'fzombie_giggle',
  zombie_snarl: 'fzombie_hiss',
  zombie_screech: 'fzombie_scream',
  zombie_bellow: 'fzombie_growl',
  zombie_attack: 'fzombie_attack',
  zombie_hurt: 'fzombie_whimper',
  zombie_death: 'fzombie_gasp',
  warden_roar: 'matron_shriek',
};

/**
 * The Sakura District's kinds each have a voice of their own for some of the horde's noises (`synth/sakuraKinds.ts`):
 * the Kuchisake whispers and snips, the Jorogumo skitters and hisses, the miko's call is her bells, the idol sings, the
 * Oni roars and swings its club, a bloomed bursts, a rooted tears up out of the ground, the Court whistles, the Empress
 * wails, a commuter mutters (or its phone buzzes).
 */
const KIND_VOICE: Partial<Record<ZombieVariant, Partial<Record<SoundId, SoundId>>>> = {
  kuchisake: { zombie_alert: 'kuchisake_whisper', zombie_screech: 'kuchisake_whisper', zombie_snarl: 'kuchisake_whisper', zombie_attack: 'shears_snip' },
  jorogumo: { zombie_snarl: 'spider_skitter', zombie_screech: 'spider_hiss', zombie_alert: 'spider_hiss' },
  miko: { zombie_screech: 'miko_call' },
  idol: { zombie_groan: 'idol_song' },
  oni: { zombie_bellow: 'oni_roar', zombie_alert: 'oni_roar', zombie_attack: 'kanabo_swing' },
  bloomed: { zombie_death: 'petal_burst' },
  rooted: { zombie_screech: 'earth_burst' },
  court: { zombie_alert: 'court_whistle', zombie_screech: 'court_whistle' },
  empress: { warden_roar: 'empress_wail' },
  commuter: { zombie_groan: 'commuter_groan' },
};

/** `downed`: a curable carrier at zero health, lying helpless until it is purged or gets back up. */
export type ZombieState = 'idle' | 'alert' | 'chase' | 'attack' | 'stagger' | 'downed' | 'dead';
export type AttackKind = 'melee' | 'slam' | 'charge';

/** One infected as the co-op host reports it to the other clients. */
export interface NetZombie {
  id: number;
  type: ZombieType;
  x: number;
  z: number;
  yaw: number;
  mode: ZombieMode;
  actionT: number;
  staggerT: number;
  speed: number;
  /** 0..1 health. */
  hp: number;
  /** bits 0-1 death style, 4 headshot death, 8 enraged, 16 knocked down (carriers), 32 shrieking (the Matron). */
  flags: number;
  /** Card carrier number (1-based), or 0 for an ordinary infected. */
  carrier: number;
  /** Height of the floor it stands on (floors may stack on the Sakura District, so it is sent). */
  y?: number;
  /** Ragdoll: height of the body off the ground and its tumble (pitch, roll), for bodies thrown by a blast. */
  fy: number;
  fp: number;
  fr: number;
  /** Index of the name it carries (Vulcan's infected on the Forge), -1 for none. */
  tag?: number;
  /** Its kind on the Sakura District (index into `VARIANTS`), 0 for none. */
  v?: number;
}

export interface PlayerRef {
  x: number;
  y: number;
  z: number;
  eyeY: number;
  alive: boolean;
  sprinting: boolean;
  /** Where they look (the Sakura District's stalker freezes while she is watched). */
  yaw?: number;
}

export interface ZombieEnv {
  time: number;
  world: CollisionWorld;
  nav: NavGrid;
  field: FlowField;
  player: PlayerRef;
  rng: Rng;
  audio: AudioEngineApi;
  fx: FxApi;
  /** Damage the player: `kind` selects hit feedback; `knock` is an impulse away from the source (m/s). */
  hurtPlayer(amount: number, srcX: number, srcZ: number, kind: AttackKind, knock: number): void;
  /** Alert other zombies near a point (chain reaction). */
  alertNear(x: number, z: number, radius: number, srcId: number): void;
  /** Shake the camera (slams, explosions). */
  shake(strength: number): void;
  /** Floors above and below the street, and the stairs between them (`floors.ts`); absent on single-level maps. */
  floors?: Floors | null;
}

/**
 * A scripted behaviour that takes over from the AI while it is set on an infected (the Asylum's barricades: walk to a
 * window, tear the boards off, climb in). `step` moves the infected itself and fills `scriptPose`; returning false
 * hands it back to the normal AI. Killed while scripted, the script is simply dropped.
 */
export interface ZombieScript {
  step(z: Zombie, dt: number, env: ZombieEnv): boolean;
}

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class Zombie {
  readonly id: number;
  type: ZombieType;
  def: ZombieDef;
  rig: ZombieRig;
  x = 0;
  z = 0;
  /**
   * The floor under its feet: 0 on the ground, higher on a raised floor (a foundry's deck and its stairs,
   * `CollisionWorld.floorHeight`). Worked out from (x, z) wherever it moves, the host and co-op guests alike.
   */
  y = 0;
  /** `y` eased for drawing, so it climbs a stair step by step rather than in jumps. */
  private drawY = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  hp = 100;
  maxHp = 100;
  state: ZombieState = 'idle';
  stateTime = 0;
  dormant = false;
  isBoss = false;
  isAmbient = false;
  /** Card carriers: cannot be killed (zero health knocks them down instead) and never go dormant. */
  curable = false;
  /** False when the rig belongs to someone else and must not be returned to the shared pools. */
  ownsRig = true;
  /** Co-op guest: this infected is simulated on the host and only follows its reports here. */
  puppet = false;
  /** The host's id for this infected (puppets only). */
  netId = 0;
  /** Card carrier number (1-based), or 0. */
  carrierIdx = 0;
  /** Co-op host: index of the player this infected is hunting. */
  targetIdx = 0;
  /** A name this infected carries (the Forge: one of Vulcan's fallen), shown over its head and in the kill feed. */
  tag: string | null = null;
  /** Whose voice it has: the Sakura District's infected are women (`audio/synth/creaturesFemale.ts`). */
  voiceKind: 'female' | null = null;
  /** The Sakura District's kinds (`variants.ts`): how this one behaves on top of its type. */
  variant: ZombieVariant = '';
  /** Rooted: lying in wait under the petals until someone comes close. */
  buried = false;
  /** Jorogumo: up on the ceiling (drawn there; drops when close). */
  ceiling = false;
  /** Infected it calls up (the miko, the Empress): the manager spawns them after the update. */
  readonly summons: { type: ZombieType; x: number; z: number; variant: ZombieVariant }[] = [];
  /** A variant's own clock (a call's cooldown, the next whisper, a cloud's next sting). */
  private varT = 0;
  /** Co-op guest: the Court's last action progress (a shot is drawn when it passes the strike). */
  private shotPrevT = 0;
  /** Which walkable area it is in (`floors.ts`): 0 the street, else a storey, a roof or an underground space. */
  area = 0;
  /** Crossing stairs or a stairwell toward whoever it hunts (`floors.ts`). */
  private crossing: { link: FloorLink; from: number; prog: { s: number } } | null = null;
  private netY = 0;
  private netX = 0;
  private netZ = 0;
  private netYaw = 0;
  private netMode: ZombieMode = 'idle';
  private netActionT = 0;
  private netStaggerT = 0;
  private netSpeed = 0;
  homeX = 0;
  homeZ = 0;
  speedScale = 1;
  /** Difficulty: damage dealt and how far it sees (set by the manager at spawn). */
  dmgScale = 1;
  sightScale = 1;
  enraged = false;
  /** The Matron (`matron.ts`): crying out right now (The Shriek). Co-op guests get it as flag 32. */
  shrieking = false;
  /** Idle walk override (the Matron's rounds, `matron.ts`): where to walk next (her own spot: stand) and the seconds before it asks again, or null to wander as usual. */
  idleRoute: ((z: Zombie) => { x: number; z: number; wait: number } | null) | null = null;

  // ---- awareness ----
  private seesPlayer = false;
  private memory = 99;
  private lastKnownX = 0;
  private lastKnownZ = 0;
  private senseTimer = 0;
  private alertTimer = 0;
  private alertDelay = -1;
  private alertNoticed = false;
  // ---- steering ----
  private steerX = 0;
  private steerZ = 0;
  private steerTimer = 0;
  private hasSteer = false;
  private directUntil = 0;
  private wanderX = 0;
  private wanderZ = 0;
  private wanderWait = 1;
  private stuckTimer = 0;
  // ---- combat ----
  attackKind: AttackKind = 'melee';
  private attackTime = 0;
  private attackDidHit = false;
  private attackDir = 0;
  private cooldown = 0;
  private slamCd = 3;
  private chargeCd = 6;
  private chargeLock = false;
  private chargeBlocked = 0;
  private poise = 0;
  private staggerT = 0;
  private staggerDur = 0.5;
  private hitKick = 0;
  // ---- ragdoll: a killed body is thrown, tumbles, bounces off walls and the floor, then settles ----
  private flingVX = 0;
  private flingVY = 0;
  private flingVZ = 0;
  private flingY = 0;
  private flying = false;
  /** Tumble about the body's own sideways (pitch) and forward (roll) axes, and their rates. */
  private tumbleP = 0;
  private tumbleR = 0;
  private tumblePV = 0;
  private tumbleRV = 0;
  private readonly flingPos = { x: 0, z: 0 };
  // ---- death ----
  deathT = 0;
  private deathStyle: 0 | 1 | 2 = 0;
  private headshotDeath = false;
  // ---- audio ----
  private voiceTimer = 3;
  private readonly anim: ZombieAnimState = {
    mode: 'idle',
    speed: 0,
    time: 0,
    actionT: 0,
    staggerT: 0,
    deathT: 0,
    aggro: 0,
    hitKick: 0,
    deathStyle: 0,
    headshotDeath: false,
    enraged: false,
  };
  private readonly tmp = { x: 0, z: 0 };
  private shadowMeshes: import('three').Mesh[] | null = null;
  shadowOn = true;
  /** Simulation time of death (for corpse ordering). */
  diedAt = 0;
  /** Nav field distance to the player (metres); refreshed periodically. */
  pathDist = Infinity;
  // ---- scripted behaviour (see ZombieScript) ----
  script: ZombieScript | null = null;
  /** The pose a script asks for: animation mode / progress, ground speed, and lift off the floor (climbing a sill). */
  readonly scriptPose: { mode: ZombieMode; actionT: number; speed: number; lift: number } = { mode: 'walk', actionT: 0, speed: 0, lift: 0 };

  constructor(id: number, type: ZombieType, rig: ZombieRig) {
    this.id = id;
    this.type = type;
    this.def = ZOMBIES[type];
    this.rig = rig;
  }

  /** (Re)initialise for a fresh life. */
  init(x: number, z: number, yaw: number, rng: Rng, opts: { state?: ZombieState; ambient?: boolean; boss?: boolean; hpScale?: number; def?: ZombieDef; curable?: boolean; y?: number; area?: number } = {}): void {
    if (opts.def) this.def = opts.def;
    this.curable = opts.curable ?? false;
    this.x = this.homeX = x;
    this.z = this.homeZ = z;
    // stood on whatever floor is there at its first step (a storey's, when spawned up there)
    this.y = this.drawY = this.netY = opts.y ?? 0;
    this.area = opts.area ?? 0;
    this.crossing = null;
    this.yaw = yaw;
    this.vx = this.vz = 0;
    this.maxHp = this.def.hp * (opts.hpScale ?? 1);
    this.hp = this.maxHp;
    this.state = opts.state ?? 'idle';
    this.stateTime = 0;
    this.dormant = false;
    this.isBoss = opts.boss ?? false;
    this.isAmbient = opts.ambient ?? false;
    this.enraged = false;
    this.buried = this.variant === 'rooted' && (opts.state ?? 'idle') === 'idle';
    this.ceiling = false;
    this.varT = this.variant === 'empress' ? 12 : 0;
    this.shotPrevT = 0;
    this.summons.length = 0;
    this.speedScale = 1 + (rng.f() * 2 - 1) * this.def.speedVariance;
    this.seesPlayer = false;
    this.memory = 99;
    this.senseTimer = rng.f() * 0.3;
    this.alertTimer = 0;
    this.alertDelay = -1;
    this.alertNoticed = false;
    this.hasSteer = false;
    this.steerTimer = rng.f() * 0.2;
    this.directUntil = 0;
    this.wanderWait = 0.5 + rng.f() * 3;
    this.wanderX = x;
    this.wanderZ = z;
    this.stuckTimer = 0;
    this.attackTime = 0;
    this.attackDidHit = false;
    this.cooldown = 0.4 + rng.f() * 0.5;
    this.slamCd = 3 + rng.f() * 3;
    this.chargeCd = 5 + rng.f() * 3;
    this.chargeLock = false;
    this.poise = 0;
    this.staggerT = 0;
    this.hitKick = 0;
    this.deathT = 0;
    this.headshotDeath = false;
    this.flying = false;
    this.flingVX = this.flingVY = this.flingVZ = this.flingY = 0;
    this.tumbleP = this.tumbleR = this.tumblePV = this.tumbleRV = 0;
    this.voiceTimer = 1 + rng.f() * 6;
    this.pathDist = Infinity;
    this.script = null;
    this.scriptPose.lift = 0;
    this.rig.reset(this.id * 7919 + Math.floor(x * 31 + z * 17));
    this.rig.setVisible(true);
    this.syncRoot();
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** Alive and on its feet: a threat, a target and an obstacle. */
  get active(): boolean {
    return this.state !== 'dead' && this.state !== 'downed';
  }

  get chasing(): boolean {
    return this.state === 'chase' || this.state === 'attack' || this.state === 'alert';
  }

  /** The animation it is playing right now (a co-op puppet's comes from the host): the Forge's doors listen for 'attack'. */
  get poseMode(): ZombieMode {
    return this.anim.mode;
  }

  /** Progress through the current action (0..1). */
  get poseT(): number {
    return this.anim.actionT;
  }

  /** Co-op host: this infected as a report for the other clients. */
  toNet(): NetZombie {
    const a = this.anim;
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      mode: a.mode,
      actionT: a.actionT,
      staggerT: a.staggerT,
      speed: a.speed,
      hp: Math.max(0, this.hp / this.maxHp),
      flags: this.deathStyle | (this.headshotDeath ? 4 : 0) | (this.enraged ? 8 : 0) | (this.state === 'downed' ? 16 : 0) | (this.shrieking ? 32 : 0) | (this.buried ? 64 : 0) | (this.ceiling ? 128 : 0),
      carrier: this.carrierIdx,
      y: this.y,
      fy: this.flingY + this.scriptPose.lift,
      fp: this.tumbleP,
      fr: this.tumbleR,
    };
  }

  /** Co-op: sounds a puppet owes from its last report (it runs no AI, so it voices what the host says it does). */
  private netSounds = 0;

  /** Co-op guest: take the host's latest report. */
  applyNet(n: NetZombie): void {
    // what changed is what makes a noise: an attack, a roar or a slam starting, a stagger, a fall
    if (n.mode !== this.netMode) {
      if (n.mode === 'attack') this.netSounds |= 1;
      else if (n.mode === 'roar' || n.mode === 'charge') this.netSounds |= 2;
      else if (n.mode === 'slam') this.netSounds |= 4;
      else if (n.mode === 'stagger') this.netSounds |= 8;
    }
    if (n.mode === 'death' && this.state !== 'dead' && this.state !== 'downed') this.netSounds |= n.flags & 16 ? 8 : 16;
    this.netX = n.x;
    this.netZ = n.z;
    this.netY = n.y ?? this.netY;
    this.netYaw = n.yaw;
    this.netMode = n.mode;
    this.netActionT = n.actionT;
    this.netStaggerT = n.staggerT;
    this.netSpeed = n.speed;
    this.flingY = n.fy;
    this.tumbleP = n.fp;
    this.tumbleR = n.fr;
    this.hp = n.hp * this.maxHp;
    this.enraged = (n.flags & 8) !== 0;
    this.shrieking = (n.flags & 32) !== 0;
    this.buried = (n.flags & 64) !== 0;
    this.ceiling = (n.flags & 128) !== 0;
    if (n.flags & 16) {
      if (this.state !== 'downed') {
        this.state = 'downed';
        this.deathT = 0;
        this.deathStyle = (n.flags & 3) as 0 | 1 | 2;
      }
    } else if (this.state === 'downed') {
      // back on her feet
      this.rig.reset(this.id * 7919);
      this.state = 'chase';
    } else if (n.mode === 'death' && this.state !== 'dead') {
      this.state = 'dead';
      this.deathT = 0;
      this.deathStyle = (n.flags & 3) as 0 | 1 | 2;
      this.headshotDeath = (n.flags & 4) !== 0;
    } else if (n.mode !== 'death' && this.state !== 'chase') {
      this.state = 'chase';
    }
  }

  /** Co-op: play the noises this puppet owes, and its groans and snarls while it hunts. */
  private puppetVoice(dt: number, env: ZombieEnv): void {
    const pos = { x: this.x, y: 1.4, z: this.z };
    const s = this.netSounds;
    this.netSounds = 0;
    const boss = this.type === 'warden';
    const court = this.variant === 'court';
    if (s & 1 && !court) this.say(env, 'zombie_attack', { pos, volume: 0.8, priority: 2, rate: 0.9 + env.rng.f() * 0.2 });
    if (s & 2) this.say(env, boss ? this.roarId : this.type === 'runner' ? 'zombie_screech' : 'zombie_alert', { pos, volume: boss ? 1.2 : 0.9, priority: boss ? 3 : 2 });
    if (s & 4) this.say(env, 'warden_slam', { pos, volume: 1.2, priority: 3 });
    if (s & 8) this.say(env, 'zombie_hurt', { pos, volume: 0.8, priority: 1 });
    if (s & 16) this.say(env, 'zombie_death', { pos, volume: boss ? 1.3 : 1, priority: 2 });
    if (this.state === 'dead' || this.state === 'downed' || court || this.buried) return;
    const p = env.player;
    this.voiceTimer -= dt;
    if (this.voiceTimer > 0 || Math.hypot(p.x - this.x, p.z - this.z) > 38) return;
    if (this.netMode === 'idle') {
      this.say(env, 'zombie_groan', { pos, volume: 0.55, priority: 0, rate: 0.85 + env.rng.f() * 0.2 });
      this.voiceTimer = 6 + env.rng.f() * 8;
    } else {
      const id = this.type === 'runner' ? 'zombie_snarl' : this.type === 'armored' ? 'zombie_bellow' : boss ? this.roarId : 'zombie_groan';
      this.say(env, id, { pos, volume: boss ? 0.9 : 0.8, priority: boss ? 3 : 1, rate: 0.92 + env.rng.f() * 0.16 });
      this.voiceTimer = boss ? 8 + env.rng.f() * 4 : 3.5 + env.rng.f() * 5;
    }
  }

  /** Co-op guest: glide toward the last report and pose. */
  puppetStep(dt: number, env: ZombieEnv): void {
    this.puppetVoice(dt, env);
    // the Court's rifle: a shot each time the host's attack passes its strike
    if (this.variant === 'court') {
      const t = this.netMode === 'attack' ? this.netActionT : 0;
      if (this.shotPrevT < 0.55 && t >= 0.55) this.shotFx(env, env.rng.f() < 0.4);
      this.shotPrevT = t;
    }
    if (this.state === 'dead' && this.variant === 'bloomed') this.bloomCloud(dt, env);
    const k = Math.min(1, dt * 12);
    this.x += (this.netX - this.x) * k;
    this.z += (this.netZ - this.z) * k;
    this.yaw = wrap(this.yaw + wrap(this.netYaw - this.yaw) * k);
    if (env.floors?.hasFloors) {
      // floors stack here: the host says how high it stands
      this.y = this.netY;
      const d = this.y - this.drawY;
      this.drawY = Math.abs(d) > 2.5 ? this.y : this.drawY + d * Math.min(1, dt * 14);
    } else {
      this.settle(env.world, dt);
    }
    this.hitKick = Math.max(0, this.hitKick - dt * 5);
    if (this.state === 'dead' || this.state === 'downed') this.deathT += dt;
    this.pose(env, this.netSpeed);
  }

  // ---------------------------------------------------------------------------------------------
  // the Sakura District's kinds (`variants.ts`)
  // ---------------------------------------------------------------------------------------------

  /** A variant's own behaviour this frame: a ground speed when it has handled the frame, -1 to run the usual AI. */
  private variantStep(dt: number, env: ZombieEnv, dist: number, dx: number, dz: number): number {
    const p = env.player;
    const pos = { x: this.x, y: 1.4, z: this.z };
    switch (this.variant) {
      case 'rooted': {
        if (!this.buried) return -1;
        this.vx = this.vz = 0;
        // up out of the petals at whoever comes close (or whoever shoots it)
        if ((p.alive && dist < 6 && Math.abs(p.y - this.y) < 2) || this.hp < this.maxHp) {
          this.buried = false;
          this.memory = 0;
          this.lastKnownX = p.x;
          this.lastKnownZ = p.z;
          this.enterState('chase');
          this.say(env, 'zombie_screech', { pos, volume: 1, priority: 2 });
          env.fx.dust({ x: this.x, y: 0.3, z: this.z }, 0.7);
        }
        return 0;
      }
      case 'kuchisake':
        return this.stalk(dt, env, dist, dx, dz);
      case 'jorogumo': {
        const under = env.floors?.areas[this.area]?.kind === 'under';
        this.ceiling = under && this.state !== 'attack' && this.state !== 'stagger' && dist > 5;
        return -1;
      }
      case 'miko': {
        this.varT -= dt;
        if (this.state === 'chase' && this.seesPlayer && this.varT <= 0) {
          // she screams the dead to her, and more come
          this.varT = 22;
          this.say(env, 'zombie_screech', { pos, volume: 1.2, priority: 3, rate: 1.15 });
          env.alertNear(this.x, this.z, 35, this.id);
          for (let i = 0; i < 3; i++) {
            const a = env.rng.f() * Math.PI * 2;
            this.summons.push({ type: 'shambler', x: this.x + Math.cos(a) * 5, z: this.z + Math.sin(a) * 5, variant: '' });
          }
        }
        return -1;
      }
      case 'idol': {
        // she sings while anyone is near
        this.varT -= dt;
        if (this.varT <= 0 && dist < 32) {
          this.varT = 3.2 + env.rng.f() * 1.5;
          this.say(env, 'zombie_groan', { pos, volume: 0.9, priority: 1, rate: 1.45 + env.rng.f() * 0.15 });
        }
        return -1;
      }
      case 'court':
        return this.courtStep(dt, env, dist, dx, dz);
      case 'empress': {
        // the Empress calls her bloomed to her; enraged, twice as many
        this.varT -= dt;
        if (this.state === 'chase' && this.varT <= 0) {
          this.varT = this.enraged ? 14 : 22;
          const n = this.enraged ? 4 : 2;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + env.rng.f();
            this.summons.push({ type: 'shambler', x: this.x + Math.cos(a) * 4, z: this.z + Math.sin(a) * 4, variant: 'bloomed' });
          }
          env.fx.sparkle({ x: this.x, y: 2, z: this.z }, 0xff2a4a, 40);
        }
        return -1;
      }
      default:
        return -1;
    }
  }

  /** Is the player looking at it (within about 25 degrees, nothing between)? */
  private watched(env: ZombieEnv, dist: number): boolean {
    const p = env.player;
    if (p.yaw === undefined || dist > 45) return false;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const tx = (this.x - p.x) / Math.max(dist, 1e-3);
    const tz = (this.z - p.z) / Math.max(dist, 1e-3);
    if (fx * tx + fz * tz < 0.9) return false;
    return !env.world.segmentBlocked(p.x, p.eyeY, p.z, this.x, this.y + 1.5, this.z, 'shots');
  }

  /** The stalker: knows where you are; still while you look at her, coming on while you do not. */
  private stalk(dt: number, env: ZombieEnv, dist: number, dx: number, dz: number): number {
    const p = env.player;
    if (!p.alive || this.state === 'attack' || this.state === 'stagger') return -1;
    this.memory = 0;
    this.lastKnownX = p.x;
    this.lastKnownZ = p.z;
    if (this.state !== 'chase') this.enterState('chase');
    this.varT -= dt;
    if (this.watched(env, dist) && dist > this.def.attackRange) {
      // frozen while watched: only her head follows you
      this.vx *= Math.max(0, 1 - 12 * dt);
      this.vz *= Math.max(0, 1 - 12 * dt);
      this.turnToward(Math.atan2(-dx, -dz), 3, dt);
      if (this.varT <= 0 && dist < 16) {
        this.varT = 5 + env.rng.f() * 3;
        this.say(env, 'zombie_alert', { pos: { x: this.x, y: 1.5, z: this.z }, volume: 0.7, priority: 2, rate: 1.2 });
      }
      return 0;
    }
    return -1;
  }

  /** The Court: within range and in sight, stand and shoot; else close the distance. */
  private courtStep(dt: number, env: ZombieEnv, dist: number, dx: number, dz: number): number {
    const p = env.player;
    if (this.state !== 'chase' || !p.alive || Math.abs(p.y - this.y) > 6) return -1;
    if (dist > this.def.attackRange || env.world.segmentBlocked(this.x, this.y + 1.5, this.z, p.x, p.eyeY - 0.1, p.z, 'shots')) return -1;
    this.vx *= Math.max(0, 1 - 8 * dt);
    this.vz *= Math.max(0, 1 - 8 * dt);
    this.turnToward(Math.atan2(-dx, -dz), 6, dt);
    if (this.cooldown <= 0) this.beginAttack('melee', env);
    return 0;
  }

  /** A Court rifle round: a tracer, the shot, and a hit by the odds (worse far off, worse at a sprinting target). */
  private courtShot(env: ZombieEnv, dist: number): void {
    const p = env.player;
    if (!p.alive) return;
    const blocked = env.world.segmentBlocked(this.x, this.y + 1.5, this.z, p.x, p.eyeY - 0.1, p.z, 'shots');
    const chance = blocked ? 0 : Math.max(0.12, 0.5 - dist / 45) * (p.sprinting ? 0.65 : 1);
    const hit = env.rng.f() < chance;
    this.shotFx(env, hit);
    if (hit) env.hurtPlayer(this.def.damage * this.dmgScale, this.x, this.z, 'melee', 0.6);
  }

  /** The shot as seen and heard (the host's and every guest's own). */
  private shotFx(env: ZombieEnv, hit: boolean): void {
    const p = env.player;
    const from = { x: this.x - Math.sin(this.yaw) * 0.6, y: this.drawY + 1.45, z: this.z - Math.cos(this.yaw) * 0.6 };
    const miss = hit ? 0 : 1.6;
    const to = { x: p.x + (env.rng.f() - 0.5) * miss * 2, y: p.eyeY - 0.3 + (env.rng.f() - 0.5) * miss, z: p.z + (env.rng.f() - 0.5) * miss * 2 };
    env.audio.play('rifle_shot', { pos: from, volume: 0.85, priority: 2, rate: 0.95 + env.rng.f() * 0.1 });
    env.fx.tracer(from, to, 0xffd890);
  }

  /** A bloomed one's death: a cloud of petals that stings anyone in it for a few seconds. */
  private bloomCloud(dt: number, env: ZombieEnv): void {
    if (this.deathT > 4.5) return;
    const at = { x: this.x, y: this.drawY + 1, z: this.z };
    if (this.deathT <= dt * 1.5) {
      env.fx.sparkle(at, 0xff7aa8, 40);
      this.say(env, 'fzombie_hiss', { pos: at, volume: 0.9, priority: 1 });
      this.varT = 0;
    }
    this.varT -= dt;
    if (this.varT > 0) return;
    this.varT = 0.45;
    env.fx.sparkle(at, 0xff9ec8, 8);
    const p = env.player;
    if (!this.puppet && p.alive && Math.hypot(p.x - this.x, p.z - this.z) < 3.2 && Math.abs(p.y - this.y) < 2) env.hurtPlayer(4 * this.dmgScale, this.x, this.z, 'melee', 0);
  }

  /** Put it at a point (crossing stairs, coming out of a stairwell): drawn there at once. */
  placeAt(x: number, y: number, z: number, yaw: number): void {
    this.x = x;
    this.z = z;
    this.y = this.drawY = y;
    this.yaw = yaw;
  }

  /** Stand on the floor under it now (`y`), easing the height it is drawn at toward it. */
  private settle(world: CollisionWorld, dt: number): void {
    // the floor it is on, or drops to: a storey overhead never lifts it (floors stack on the Sakura District)
    this.y = world.floorBelow(this.x, this.z, 0.2, this.y);
    const d = this.y - this.drawY;
    this.drawY = Math.abs(d) < 0.003 ? this.y : this.drawY + d * Math.min(1, dt * 14);
  }

  /** Flinch as if hit (a guest's own shots, before the host confirms the damage). */
  flinch(): void {
    this.hitKick = 1;
  }

  /** Only zombies near the player cast shadows (the shadow pass is the most expensive part of a horde). */
  setShadowLod(near: boolean): void {
    if (near === this.shadowOn) return;
    if (!this.shadowMeshes) {
      const list: import('three').Mesh[] = [];
      this.rig.root.traverse((o) => {
        const m = o as import('three').Mesh;
        if (m.isMesh && m.castShadow) list.push(m);
      });
      this.shadowMeshes = list;
    }
    this.shadowOn = near;
    for (const m of this.shadowMeshes) m.castShadow = near;
  }

  private syncRoot(): void {
    const r = this.rig.root;
    if (this.ceiling) {
      // the jorogumo, upside down on the tunnel roof
      r.position.set(this.x, this.drawY + 4.1, this.z);
      r.rotation.set(Math.PI, -this.yaw, 0, 'YXZ');
      return;
    }
    if (this.flingY === 0 && this.tumbleP === 0 && this.tumbleR === 0) {
      r.position.set(this.x, this.drawY + this.scriptPose.lift, this.z);
      r.rotation.set(0, this.yaw, 0, 'YXZ');
      return;
    }
    // tumble about the middle of the body, not the feet. `flingY` is the height of the body's lowest point, so the hips
    // drop as it tips over: upright they are a half-height up, lying flat only a body's thickness - a body tipped flat
    // lies on the ground instead of floating at waist height
    const h = 0.9;
    const sp = Math.sin(this.tumbleP);
    const cp = Math.cos(this.tumbleP);
    const sr = Math.sin(this.tumbleR);
    const cr = Math.cos(this.tumbleR);
    const lx = -h * sr;
    const ly = h * cr * cp;
    const lz = h * cr * sp;
    const up = Math.abs(cr * cp);
    const hips = this.drawY + this.flingY + h * up + 0.14 * (1 - up);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    r.position.set(this.x - (lx * cy + lz * sy), hips - ly, this.z - (-lx * sy + lz * cy));
    r.rotation.set(this.tumbleP, this.yaw, this.tumbleR, 'YXZ');
  }

  /**
   * Throw the body that was just killed (or knocked down): `yaw` is the direction of travel, `speed` m/s along it,
   * `lift` m/s up. Heavier infected fly less; the Warden barely moves.
   */
  fling(yaw: number, speed: number, lift: number): void {
    if ((this.state !== 'dead' && this.state !== 'downed') || this.deathT > 0.15 || (speed <= 0 && lift <= 0)) return;
    const mass = this.isBoss ? 0.2 : this.type === 'armored' ? 0.6 : this.type === 'runner' ? 1.1 : 1;
    const s = speed * mass;
    this.flingVX += -Math.sin(yaw) * s;
    this.flingVZ += -Math.cos(yaw) * s;
    this.flingVY = Math.max(this.flingVY, lift * mass);
    this.flying = true;
    // spin end over end in the direction of travel, relative to the way the body faces
    const rel = wrap(yaw - this.yaw);
    const spin = (Math.hypot(s, lift * mass) * RAGDOLL.spin) * (0.8 + Math.random() * 0.4);
    this.tumblePV += -Math.cos(rel) * spin;
    this.tumbleRV += Math.sin(rel) * spin;
  }

  private stepFling(dt: number, env: ZombieEnv): void {
    if (!this.flying) return;
    // never left hanging: a body still in the air or tumbling a few seconds after it died settles where it is
    if (this.deathT > 3) {
      this.flying = false;
      this.flingY = this.tumbleP = this.tumbleR = 0;
      this.flingVX = this.flingVY = this.flingVZ = 0;
      this.tumblePV = this.tumbleRV = 0;
      return;
    }
    this.flingVY -= RAGDOLL.gravity * dt;
    this.flingY += this.flingVY * dt;
    const p = this.flingPos;
    p.x = this.x + this.flingVX * dt;
    p.z = this.z + this.flingVZ * dt;
    // walls stop the body (and take most of its speed)
    if (env.world.resolveCircle(p, 0.3, this.y + this.flingY + 0.2, this.y + this.flingY + 1.4, 2)) {
      this.flingVX *= -0.25;
      this.flingVZ *= -0.25;
      this.tumblePV *= 0.5;
      this.tumbleRV *= 0.5;
    }
    this.x = p.x;
    this.z = p.z;
    // thrown off a deck it falls to the floor below (and onto one, lands there): its height stays put in the world
    const top = this.y + this.flingY;
    this.settle(env.world, dt);
    this.drawY = this.y;
    this.flingY = Math.max(0, top - this.y);
    let grounded = false;
    if (this.flingY <= 0) {
      this.flingY = 0;
      grounded = true;
      if (this.flingVY < -2.5) {
        this.flingVY = -this.flingVY * RAGDOLL.bounce;
        this.tumblePV *= 0.6;
        this.tumbleRV *= 0.6;
        env.fx.dust({ x: this.x, y: this.y + 0.1, z: this.z }, 0.35);
      } else {
        this.flingVY = 0;
      }
    }
    if (grounded && this.flingVY === 0) {
      const k = Math.exp(-RAGDOLL.friction * dt);
      this.flingVX *= k;
      this.flingVZ *= k;
      // roll to rest: each tumble eases to the nearest whole turn, so the body ends in its lying pose
      const ease = Math.min(1, dt * 7);
      const tp = Math.round(this.tumbleP / (Math.PI * 2)) * Math.PI * 2;
      const tr = Math.round(this.tumbleR / (Math.PI * 2)) * Math.PI * 2;
      this.tumbleP += (tp - this.tumbleP) * ease;
      this.tumbleR += (tr - this.tumbleR) * ease;
      this.tumblePV = this.tumbleRV = 0;
      if (Math.hypot(this.flingVX, this.flingVZ) < 0.15 && Math.abs(tp - this.tumbleP) < 0.01 && Math.abs(tr - this.tumbleR) < 0.01) {
        this.flying = false;
        this.flingY = 0;
        this.tumbleP = this.tumbleR = 0;
        this.flingVX = this.flingVZ = 0;
      }
    } else {
      this.tumbleP += this.tumblePV * dt;
      this.tumbleR += this.tumbleRV * dt;
    }
  }

  /** Called by noise events (gunshots, sprinting) and by alerted neighbours. */
  hear(x: number, z: number, delay: number): void {
    if (this.state !== 'idle') return;
    this.lastKnownX = x;
    this.lastKnownZ = z;
    this.memory = 0;
    if (this.alertDelay < 0) this.alertDelay = delay;
  }

  /** Back at (x, z), calm, with it as home (the Warden returning to his lair while nobody watches). */
  returnHome(x: number, z: number, yaw: number): void {
    this.x = this.homeX = this.wanderX = x;
    this.z = this.homeZ = this.wanderZ = z;
    this.yaw = yaw;
    this.vx = this.vz = 0;
    this.enterState('idle');
    this.seesPlayer = false;
    this.memory = 99;
    this.alertDelay = -1;
    this.alertNoticed = false;
    this.hasSteer = false;
    this.stuckTimer = 0;
  }

  /** Force this zombie to hunt the player (director spawns). */
  aggro(px: number, pz: number): void {
    if (!this.active) return;
    this.lastKnownX = px;
    this.lastKnownZ = pz;
    this.memory = 0;
    this.enterState('chase');
  }

  /** Stop mid-hunt and cry out for `seconds` (the Matron's shriek, `matron.ts`), then hunt on. */
  shriek(seconds: number, env: ZombieEnv): void {
    if (this.state !== 'chase') return;
    this.enterState('alert');
    this.alertTimer = seconds;
    this.vx = this.vz = 0;
    this.say(env, this.roarId, { pos: { x: this.x, y: 2, z: this.z }, volume: 1.3, priority: 3 });
  }

  /** Every noise this infected makes, in its own voice (a woman's on the Sakura District). */
  private say(env: ZombieEnv, id: SoundId, opts: Parameters<AudioEngineApi['play']>[1]): void {
    const own = this.variant ? KIND_VOICE[this.variant]?.[id] : undefined;
    // a kind's own voice plays at its own pitch (only a touch of the caller's variation)
    if (own) env.audio.play(own, { ...opts, rate: 1 + ((opts?.rate ?? 1) - 1) * 0.15 });
    else env.audio.play(this.voiceKind === 'female' ? (FEMALE_VOICE[id] ?? id) : id, opts);
  }

  /** A boss's roar (the Warden's, unless its stats bring another voice). */
  private get roarId(): SoundId {
    return this.def.roar ?? 'warden_roar';
  }

  private enterState(s: ZombieState): void {
    this.state = s;
    this.stateTime = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // damage
  // ---------------------------------------------------------------------------------------------

  /** Apply already-computed damage. Returns true if this killed the zombie. */
  takeDamage(amount: number, head: boolean, env: ZombieEnv, hitDirYaw: number, impulse = 1): boolean {
    if (!this.active || amount <= 0) return false;
    this.hp -= amount;
    this.hitKick = 1;
    if (this.state === 'idle') {
      this.lastKnownX = env.player.x;
      this.lastKnownZ = env.player.z;
      this.memory = 0;
      this.alertDelay = 0.05;
    }
    if (this.hp <= 0) {
      if (this.curable) {
        this.knockDown(env, hitDirYaw);
        return false;
      }
      this.die(head, env, hitDirYaw);
      return true;
    }
    if (this.isBoss && !this.enraged && this.hp / this.maxHp < WARDEN.rageAt) {
      this.enraged = true;
      this.say(env, this.roarId, { pos: { x: this.x, y: 1.5, z: this.z }, volume: 1.2, priority: 3 });
    }
    // poise: enough damage in a short window staggers (the Warden is poise-immune except when charging into a wall)
    this.poise += amount * impulse;
    if (this.poise >= this.def.poise && this.state !== 'stagger') {
      this.poise = 0;
      if (!this.isBoss) this.stagger(this.def.staggerTime, env);
    }
    return false;
  }

  stagger(duration: number, env: ZombieEnv): void {
    if (!this.active) return;
    this.enterState('stagger');
    this.staggerT = 0;
    this.staggerDur = duration;
    this.vx = this.vz = 0;
    this.chargeLock = false;
    this.say(env, 'zombie_hurt', { pos: { x: this.x, y: 1.4, z: this.z }, volume: 0.8, priority: 1 });
  }

  private fallStyle(env: ZombieEnv, hitDirYaw: number): void {
    // fall away from the shot direction relative to facing: shot from the front -> fall backwards
    const rel = Math.abs(wrap(hitDirYaw - this.yaw));
    this.deathStyle = rel > Math.PI * 0.6 ? 0 : rel < Math.PI * 0.3 ? 1 : 2;
    if (env.rng.chance(0.25)) this.deathStyle = 2;
  }

  private die(head: boolean, env: ZombieEnv, hitDirYaw: number): void {
    this.enterState('dead');
    this.hp = 0;
    this.deathT = 0;
    this.headshotDeath = head;
    this.vx = this.vz = 0;
    this.fallStyle(env, hitDirYaw);
    this.say(env, 'zombie_death', { pos: { x: this.x, y: 1.2, z: this.z }, volume: this.isBoss ? 1.3 : 1, priority: 2 });
  }

  private knockDown(env: ZombieEnv, hitDirYaw: number): void {
    this.enterState('downed');
    this.hp = 0;
    this.deathT = 0;
    this.headshotDeath = false;
    this.vx = this.vz = 0;
    this.fallStyle(env, hitDirYaw);
    this.say(env, 'zombie_hurt', { pos: { x: this.x, y: 1.2, z: this.z }, volume: 1, priority: 2 });
  }

  /** A downed carrier gets back up with part of its health. */
  revive(hpFraction: number, env: ZombieEnv): void {
    if (this.state !== 'downed') return;
    this.flying = false;
    this.flingY = this.tumbleP = this.tumbleR = 0;
    this.flingVX = this.flingVY = this.flingVZ = 0;
    this.hp = Math.max(1, this.maxHp * hpFraction);
    this.poise = 0;
    this.rig.reset(this.id * 7919);
    this.enterState('stagger');
    this.staggerT = 0;
    this.staggerDur = 0.8;
    this.lastKnownX = env.player.x;
    this.lastKnownZ = env.player.z;
    this.memory = 0;
    this.say(env, 'zombie_alert', { pos: { x: this.x, y: 1.4, z: this.z }, volume: 1, priority: 2 });
  }

  // ---------------------------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------------------------

  update(dt: number, env: ZombieEnv, neighbors: Zombie[]): void {
    const p = env.player;
    this.stateTime += dt;
    this.hitKick = Math.max(0, this.hitKick - dt * 5);
    this.poise = Math.max(0, this.poise - dt * 40);
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.slamCd > 0) this.slamCd -= dt;
    if (this.chargeCd > 0) this.chargeCd -= dt;

    if (this.state === 'dead' || this.state === 'downed') {
      if (this.script) this.dropScript();
      this.deathT += dt;
      if (this.variant === 'bloomed') this.bloomCloud(dt, env);
      this.stepFling(dt, env);
      this.pose(env, 0);
      return;
    }

    const dx = p.x - this.x;
    const dz = p.z - this.z;
    let dist = Math.hypot(dx, dz);
    // on another floor: how far it is to walk there (the underground is built off to one side of the map)
    if (env.floors?.hasFloors && this.state === 'chase') {
      const pa = env.floors.areaAt(p.x, p.y, p.z);
      if (pa !== this.area) dist = Math.min(dist, env.floors.walkDistance(this.area, this.x, this.z, pa, p.x, p.z));
    }

    // crossing stairs or a stairwell to reach whoever it hunts on another floor
    if (this.crossing && env.floors) {
      const c = this.crossing;
      const speed = this.state === 'idle' ? this.def.speedWalk * 0.55 : Math.max(this.def.speedWalk, this.chaseSpeed() * 0.75);
      this.vx = this.vz = 0;
      if (env.floors.traverse(this, c.link, c.from, c.prog, speed, dt)) {
        this.voice(dt, env, dist);
        this.pose(env, speed);
        return;
      }
      this.crossing = null;
      this.hasSteer = false;
      this.homeX = this.x;
      this.homeZ = this.z;
      // off the stairs: the scent it followed leads to where they are now, not to where it last saw them a floor away
      this.lastKnownX = env.player.x;
      this.lastKnownZ = env.player.z;
    }

    // a script (the Asylum's barricades) drives this infected instead of the AI until it lets go
    if (this.script) {
      if (this.script.step(this, dt, env)) {
        this.voice(dt, env, dist);
        this.pose(env, this.scriptPose.speed);
        return;
      }
      this.dropScript();
    }

    this.sense(dt, env, dist);
    this.voice(dt, env, dist);

    let moveSpeed = 0;
    const vs = this.variant ? this.variantStep(dt, env, dist, dx, dz) : -1;
    if (vs >= 0) moveSpeed = vs;
    else switch (this.state) {
      case 'idle':
        moveSpeed = this.updateIdle(dt, env, dist);
        break;
      case 'alert':
        this.updateAlert(dt, env, dx, dz);
        break;
      case 'chase':
        moveSpeed = this.updateChase(dt, env, dx, dz, dist);
        break;
      case 'attack':
        moveSpeed = this.updateAttack(dt, env, dx, dz, dist);
        break;
      case 'stagger':
        this.staggerT += dt;
        // slide back a little
        this.vx *= Math.max(0, 1 - 6 * dt);
        this.vz *= Math.max(0, 1 - 6 * dt);
        if (this.staggerT >= this.staggerDur) {
          this.enterState(p.alive ? 'chase' : 'idle');
          this.cooldown = Math.max(this.cooldown, 0.25);
        }
        break;
      default:
        break;
    }

    // ---- separation from other zombies and the player ----
    let sx = 0;
    let sz = 0;
    const R = ZOMBIE_AI.separationRadius;
    for (let i = 0; i < neighbors.length; i++) {
      const o = neighbors[i]!;
      if (o === this || !o.active || Math.abs(o.y - this.y) > 1.2) continue; // one up on a deck, one below
      const ox = this.x - o.x;
      const oz = this.z - o.z;
      const d2 = ox * ox + oz * oz;
      const rr = (this.def.radius + o.def.radius) * 1.15 + (R - 0.6);
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const k = (rr - d) / rr;
      // the heavier zombie pushes the lighter one
      const w = o.isBoss ? 1.6 : 1;
      sx += (ox / d) * k * w;
      sz += (oz / d) * k * w;
    }
    // keep off the player's body (mutual push is handled in the manager for the player side)
    if (p.alive && dist < this.def.radius + 0.34 + 0.05 && dist > 1e-4 && Math.abs(p.y - this.y) < 1.2) {
      const k = (this.def.radius + 0.39 - dist) / 0.4;
      sx -= (dx / dist) * k * 1.5;
      sz -= (dz / dist) * k * 1.5;
    }

    // ---- integrate with wall collision ----
    const bx = this.x;
    const bz = this.z;
    const move = { x: this.x + (this.vx + sx * ZOMBIE_AI.separationStrength) * dt, z: this.z + (this.vz + sz * ZOMBIE_AI.separationStrength) * dt };
    // sub-step long moves so nothing tunnels through thin walls (and a stair is climbed a step at a time)
    const stepLen = Math.hypot(move.x - bx, move.z - bz);
    if (stepLen > ZOMBIE_AI.maxStepDistance) {
      const n = Math.ceil(stepLen / ZOMBIE_AI.maxStepDistance);
      const p2 = { x: bx, z: bz };
      for (let i = 1; i <= n; i++) {
        p2.x = bx + ((move.x - bx) * i) / n;
        p2.z = bz + ((move.z - bz) * i) / n;
        env.world.resolveCircle(p2, this.def.radius, this.y + 0.5, this.y + 1.7, 2);
        if (i < n) this.y = env.world.floorBelow(p2.x, p2.z, 0.2, this.y);
      }
      move.x = p2.x;
      move.z = p2.z;
    } else {
      env.world.resolveCircle(move, this.def.radius, this.y + 0.5, this.y + 1.7, 2);
    }
    this.x = move.x;
    this.z = move.z;
    this.settle(env.world, dt);
    if (env.floors?.hasFloors) this.area = env.floors.areaAt(this.x, this.y, this.z);
    const actual = Math.hypot(this.x - bx, this.z - bz) / Math.max(dt, 1e-4);

    // stuck detection while chasing: nudge sideways / re-path
    if (this.state === 'chase' && moveSpeed > 0.5 && actual < moveSpeed * 0.25) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.6) {
        this.hasSteer = false;
        this.steerTimer = 0;
        this.stuckTimer = 0;
        this.directUntil = 0;
      }
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt);
    }
    // charge ends when the Warden slams into something
    if (this.state === 'attack' && this.attackKind === 'charge' && this.chargeLock) {
      if (actual < WARDEN.chargeSpeed * 0.3) this.chargeBlocked += dt;
      else this.chargeBlocked = 0;
      if (this.chargeBlocked > 0.12) {
        this.chargeLock = false;
        this.chargeBlocked = 0;
        env.shake(0.5);
        env.fx.dust({ x: this.x, y: 1, z: this.z }, 1);
        this.say(env, 'warden_slam', { pos: { x: this.x, y: 1, z: this.z }, volume: 1, priority: 3 });
        this.stagger(1.3, env);
      }
    }

    this.pose(env, actual);
  }

  /** End a script: a body held up by one (on a window sill) falls from there. */
  private dropScript(): void {
    this.script = null;
    if (this.scriptPose.lift > 0.02) {
      this.flingY = Math.max(this.flingY, this.scriptPose.lift);
      this.flying = true;
    }
    this.scriptPose.lift = 0;
    this.vx = this.vz = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // senses
  // ---------------------------------------------------------------------------------------------

  private sense(dt: number, env: ZombieEnv, dist: number): void {
    const p = env.player;
    this.senseTimer -= dt;
    if (this.senseTimer > 0) {
      this.memory += dt;
      return;
    }
    this.senseTimer = 0.18 + env.rng.f() * 0.08;
    let sees = false;
    if (p.alive) {
      let range = this.def.sightRange * this.sightScale;
      if (this.state !== 'idle') range *= 1.8;
      // the commuters keep their routine: walk past quietly and they never look up
      if (this.variant === 'commuter' && !p.sprinting) range *= 0.3;
      if (p.sprinting) range = Math.max(range, ZOMBIE_AI.sprintHearing);
      if (dist < range) {
        // idle zombies have a limited field of view; awake ones see all around
        let inView = true;
        if (this.state === 'idle') {
          const facing = Math.atan2(-(p.x - this.x), -(p.z - this.z));
          inView = Math.abs(wrap(facing - this.yaw)) < 1.25 || dist < 6;
        }
        if (inView && !env.world.segmentBlocked(this.x, this.y + 1.5, this.z, p.x, p.eyeY - 0.15, p.z, 'shots')) sees = true;
      }
      // very close: they smell/hear you regardless
      if (dist < ZOMBIE_AI.footstepHearing * (this.variant === 'commuter' ? 0.12 : 0.5) && this.state === 'idle') sees = true;
    }
    this.seesPlayer = sees;
    if (sees) {
      this.memory = 0;
      this.lastKnownX = p.x;
      this.lastKnownZ = p.z;
    } else {
      this.memory += 0.2;
    }
  }

  private voice(dt: number, env: ZombieEnv, dist: number): void {
    if (this.variant === 'court' || this.buried) return; // living people, and the ones lying in wait, keep quiet
    this.voiceTimer -= dt;
    if (this.voiceTimer > 0 || dist > 38) return;
    const pos = { x: this.x, y: 1.5, z: this.z };
    if (this.state === 'chase' || this.state === 'attack') {
      const id = this.type === 'runner' ? 'zombie_snarl' : this.type === 'armored' ? 'zombie_bellow' : this.type === 'warden' ? this.roarId : 'zombie_groan';
      this.say(env, id, { pos, volume: this.type === 'warden' ? 0.9 : 0.8, priority: this.type === 'warden' ? 3 : 1, rate: 0.92 + env.rng.f() * 0.16 });
      this.voiceTimer = this.type === 'warden' ? 8 + env.rng.f() * 4 : 3.5 + env.rng.f() * 5;
    } else if (this.state === 'idle') {
      this.say(env, 'zombie_groan', { pos, volume: 0.55, priority: 0, rate: 0.85 + env.rng.f() * 0.2 });
      this.voiceTimer = 6 + env.rng.f() * 8;
    } else {
      this.voiceTimer = 2;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // states
  // ---------------------------------------------------------------------------------------------

  private updateIdle(dt: number, env: ZombieEnv, dist: number): number {
    void dist;
    // notice -> alert
    if (this.seesPlayer || (this.alertDelay >= 0 && (this.alertDelay -= dt) <= 0 && this.memory < 5)) {
      this.alertDelay = -1;
      this.beginAlert(env);
      return 0;
    }
    if (this.alertDelay >= 0 && this.alertDelay <= 0) this.alertDelay = -1;
    // wander near home
    this.wanderWait -= dt;
    const dxw = this.wanderX - this.x;
    const dzw = this.wanderZ - this.z;
    const dw = Math.hypot(dxw, dzw);
    if (dw < 0.5 || this.wanderWait <= -8) {
      // the Matron walks her rounds instead (`idleRoute`)
      const stop = this.wanderWait <= 0 ? this.idleRoute?.(this) : null;
      if (stop) {
        this.wanderX = stop.x;
        this.wanderZ = stop.z;
        this.wanderWait = stop.wait;
      } else if (this.wanderWait <= 0) {
        const nav = env.floors?.hasFloors ? env.floors.navOf(this.area) : env.nav;
        const pt = nav.randomFreeNear(this.homeX, this.homeZ, ZOMBIE_AI.wanderRadius, () => env.rng.f());
        if (pt && env.world.segmentBlocked(this.x, this.y + 0.9, this.z, pt.x, this.y + 0.9, pt.z, 'move') === false) {
          this.wanderX = pt.x;
          this.wanderZ = pt.z;
        }
        this.wanderWait = 2 + env.rng.f() * 5;
      }
      this.vx *= Math.max(0, 1 - 8 * dt);
      this.vz *= Math.max(0, 1 - 8 * dt);
      return 0;
    }
    const sp = this.def.speedWalk * 0.55 * this.speedScale;
    this.turnToward(Math.atan2(-dxw, -dzw), this.def.turnRate * 0.5, dt);
    this.vx = (dxw / dw) * sp;
    this.vz = (dzw / dw) * sp;
    return sp;
  }

  private beginAlert(env: ZombieEnv): void {
    this.enterState('alert');
    this.alertTimer = (this.type === 'runner' ? 0.45 : this.type === 'warden' ? 1.5 : 0.8) + env.rng.f() * 0.4;
    this.vx = this.vz = 0;
    const pos = { x: this.x, y: 1.5, z: this.z };
    this.say(env, this.type === 'runner' ? 'zombie_screech' : this.type === 'warden' ? this.roarId : 'zombie_alert', {
      pos,
      volume: this.type === 'warden' ? 1.2 : 0.9,
      priority: this.type === 'warden' ? 3 : 2,
    });
    if (!this.alertNoticed) {
      this.alertNoticed = true;
      env.alertNear(this.x, this.z, 9, this.id);
    }
  }

  private updateAlert(dt: number, env: ZombieEnv, dx: number, dz: number): void {
    this.alertTimer -= dt;
    const tx = this.memory < 1 ? env.player.x - this.x : this.lastKnownX - this.x;
    const tz = this.memory < 1 ? env.player.z - this.z : this.lastKnownZ - this.z;
    void dx;
    void dz;
    this.turnToward(Math.atan2(-tx, -tz), 8, dt);
    this.vx *= Math.max(0, 1 - 10 * dt);
    this.vz *= Math.max(0, 1 - 10 * dt);
    if (this.alertTimer <= 0) this.enterState('chase');
  }

  private chaseSpeed(): number {
    let s = this.def.speedChase * this.speedScale;
    if (this.isBoss && this.enraged) s *= WARDEN.rageSpeedMul;
    return s;
  }

  private updateChase(dt: number, env: ZombieEnv, dx: number, dz: number, dist: number): number {
    const p = env.player;
    // lose interest
    if (!p.alive || (this.memory > ZOMBIE_AI.loseInterest && dist > 45)) {
      // the Warden keeps his lair as home (the manager walks him back there); the rest settle where they are
      if (!this.isBoss) {
        this.homeX = this.x;
        this.homeZ = this.z;
      }
      this.enterState('idle');
      this.alertNoticed = false;
      return 0;
    }

    // ---- on another floor: make for the stairs (or the stairwell) toward them (they follow the scent, seen or not) ----
    const fl = env.floors?.hasFloors ? env.floors : null;
    const pArea = fl ? fl.areaAt(p.x, p.y, p.z) : 0;
    if (fl && pArea !== this.area) return this.chaseAcross(dt, env, fl, pArea);

    // ---- special attacks (Warden) ----
    if (this.isBoss && this.cooldown <= 0) {
      if (this.slamCd <= 0 && dist < WARDEN.slamRange) {
        this.beginAttack('slam', env);
        return 0;
      }
      if (this.chargeCd <= 0 && dist > WARDEN.chargeMinRange && dist < WARDEN.chargeMaxRange && this.seesPlayer) {
        this.beginAttack('charge', env);
        return 0;
      }
    }
    // ---- melee ----
    const reach = this.def.attackRange;
    if (this.cooldown <= 0 && dist < reach * 0.94 && Math.abs(p.y - this.y) < ZOMBIE_AI.attackVerticalReach) {
      if (!env.world.segmentBlocked(this.x, this.y + 1.1, this.z, p.x, Math.max(p.y + 0.6, p.eyeY - 0.5), p.z, 'move')) {
        this.beginAttack('melee', env);
        return 0;
      }
    }

    // ---- steering target ----
    const tx = this.memory < 0.6 ? p.x : this.lastKnownX;
    const tz = this.memory < 0.6 ? p.z : this.lastKnownZ;
    // up a storey or underground, that area's own grid and a field toward them there; on the street, the shared one
    const nav = fl && this.area !== 0 ? fl.navOf(this.area) : env.nav;
    const field = fl && this.area !== 0 ? fl.liveField(this.area, tx, tz) : env.field;
    return this.steerTo(tx, tz, dt, env, nav, field, dist, reach);
  }

  /** Hunting someone on another floor: walk to the near end of the next stairs toward them, then cross. */
  private chaseAcross(dt: number, env: ZombieEnv, fl: Floors, toArea: number): number {
    const link = fl.route(this.area, toArea);
    if (!link) {
      // no way there: wait below (they have to come down sometime)
      this.vx *= 0.8;
      this.vz *= 0.8;
      return 0;
    }
    const end = fl.endIn(link, this.area);
    const d = Math.hypot(end.x - this.x, end.z - this.z);
    if (d < 0.8) {
      this.crossing = { link, from: this.area, prog: { s: 0 } };
      return 0;
    }
    return this.steerTo(end.x, end.z, dt, env, fl.navOf(this.area), fl.fieldTo(this.area, end.x, end.z), d, 0);
  }

  /**
   * Steer toward (tx, tz): straight at it when the grid shows a clear line, else down `field` around obstacles. Builds
   * speed along its heading (weighty turns), slowing within `slowWithin` metres of the target.
   */
  private steerTo(tx: number, tz: number, dt: number, env: ZombieEnv, nav: NavGrid, field: FlowField | null, dist: number, slowWithin: number): number {
    this.steerTimer -= dt;
    if (this.steerTimer <= 0 || !this.hasSteer) {
      this.steerTimer = 0.12 + env.rng.f() * 0.06;
      // direct line when clear (cheap grid LOS), otherwise follow the flow field around obstacles
      let direct = false;
      if (dist < 22 || env.time < this.directUntil) direct = nav.los(this.x, this.z, tx, tz);
      if (direct) {
        this.steerX = tx;
        this.steerZ = tz;
        this.hasSteer = true;
        this.directUntil = env.time + 0.5;
      } else if (field?.follow(this.x, this.z, this.tmp, 10)) {
        this.steerX = this.tmp.x;
        this.steerZ = this.tmp.z;
        this.hasSteer = true;
        this.directUntil = 0;
      } else {
        this.steerX = tx;
        this.steerZ = tz;
        this.hasSteer = true;
      }
    }
    const sx = this.steerX - this.x;
    const sz = this.steerZ - this.z;
    const sd = Math.hypot(sx, sz);
    if (sd < 0.05) {
      this.vx *= 0.8;
      this.vz *= 0.8;
      return 0;
    }
    const desired = Math.atan2(-sx, -sz);
    this.turnToward(desired, this.def.turnRate * (this.isBoss && this.enraged ? 1.3 : 1), dt);
    // move along the current heading (not instantly along the desired direction) for weighty turning
    const align = Math.max(0.3, Math.cos(wrap(desired - this.yaw)));
    let speed = this.chaseSpeed() * align;
    // slow down when right on the player so they do not shove through
    if (dist < slowWithin) speed *= 0.5;
    const hx = -Math.sin(this.yaw);
    const hz = -Math.cos(this.yaw);
    this.vx += (hx * speed - this.vx) * Math.min(1, dt * 10);
    this.vz += (hz * speed - this.vz) * Math.min(1, dt * 10);
    return speed;
  }

  private beginAttack(kind: AttackKind, env: ZombieEnv): void {
    this.enterState('attack');
    this.attackKind = kind;
    this.attackTime = 0;
    this.attackDidHit = false;
    this.chargeLock = false;
    this.chargeBlocked = 0;
    this.attackDir = this.yaw;
    const pos = { x: this.x, y: 1.4, z: this.z };
    if (kind === 'melee') {
      if (this.variant !== 'court') this.say(env, 'zombie_attack', { pos, volume: 0.8, priority: 2, rate: 0.9 + env.rng.f() * 0.2 });
    } else {
      this.say(env, this.roarId, { pos, volume: 1.2, priority: 3 });
    }
  }

  private attackTimes(): { windup: number; strike: number; recovery: number } {
    const d = this.def;
    switch (this.attackKind) {
      case 'slam':
        return { windup: WARDEN.slamWindup, strike: 0.25, recovery: WARDEN.slamRecovery };
      case 'charge':
        return { windup: WARDEN.chargeWindup, strike: WARDEN.chargeDuration, recovery: 0.9 };
      default:
        return { windup: d.attackWindup * (this.isBoss && this.enraged ? 0.75 : 1), strike: d.attackStrike, recovery: d.attackRecovery };
    }
  }

  private updateAttack(dt: number, env: ZombieEnv, dx: number, dz: number, dist: number): number {
    const p = env.player;
    this.attackTime += dt;
    const t = this.attackTimes();
    const total = t.windup + t.strike + t.recovery;
    const faceTarget = Math.atan2(-dx, -dz);

    if (this.attackKind === 'charge') {
      if (this.attackTime < t.windup) {
        // wind up, tracking the player until the last moment
        if (this.attackTime < t.windup * 0.7) this.turnToward(faceTarget, 5, dt);
        this.attackDir = this.yaw;
        this.vx *= Math.max(0, 1 - 8 * dt);
        this.vz *= Math.max(0, 1 - 8 * dt);
        return 0;
      }
      if (this.attackTime < t.windup + t.strike && this.chargeLock !== false) {
        // charging along the locked direction
        this.vx = -Math.sin(this.attackDir) * WARDEN.chargeSpeed;
        this.vz = -Math.cos(this.attackDir) * WARDEN.chargeSpeed;
        this.yaw = this.attackDir;
        if (!this.attackDidHit && p.alive && dist < this.def.radius + 0.34 + 0.9) {
          this.attackDidHit = true;
          env.hurtPlayer(WARDEN.chargeDamage * this.dmgScale, this.x, this.z, 'charge', 9);
          this.chargeLock = false;
        }
        return WARDEN.chargeSpeed;
      }
      if (this.attackTime >= t.windup && this.attackTime < t.windup + 0.02 && !this.chargeLock) {
        this.chargeLock = true;
        return WARDEN.chargeSpeed;
      }
      // recovery
      this.chargeLock = false;
      this.vx *= Math.max(0, 1 - 6 * dt);
      this.vz *= Math.max(0, 1 - 6 * dt);
      if (this.attackTime >= total || this.attackTime >= t.windup + t.strike + t.recovery) this.finishAttack(env);
      return 0;
    }

    // melee / slam: face the target through the windup
    if (this.attackTime < t.windup) {
      this.turnToward(faceTarget, this.attackKind === 'slam' ? 2 : this.def.turnRate * 0.8, dt);
      const creep = this.variant === 'court' ? 0 : this.type === 'runner' ? 0.9 : this.type === 'shambler' ? 0.35 : 0;
      this.vx = -Math.sin(this.yaw) * creep;
      this.vz = -Math.cos(this.yaw) * creep;
    } else if (this.attackTime < t.windup + t.strike) {
      if (!this.attackDidHit) {
        this.attackDidHit = true;
        this.resolveStrike(env, dist);
      }
      const lunge = this.variant === 'court' ? 0 : this.type === 'runner' ? 3.4 : 0.8;
      this.vx = -Math.sin(this.yaw) * lunge;
      this.vz = -Math.cos(this.yaw) * lunge;
    } else {
      this.vx *= Math.max(0, 1 - 9 * dt);
      this.vz *= Math.max(0, 1 - 9 * dt);
      if (this.attackTime >= total) this.finishAttack(env);
    }
    return 0;
  }

  private finishAttack(env: ZombieEnv): void {
    this.enterState(env.player.alive ? 'chase' : 'idle');
    this.cooldown = this.variant === 'court' ? 1.1 + env.rng.f() * 0.8 : this.attackKind === 'melee' ? 0.15 : 0.9;
    if (this.attackKind === 'slam') this.slamCd = WARDEN.slamCooldown;
    if (this.attackKind === 'charge') this.chargeCd = WARDEN.chargeCooldown;
    this.chargeLock = false;
  }

  private resolveStrike(env: ZombieEnv, dist: number): void {
    const p = env.player;
    if (!p.alive) return;
    if (this.attackKind === 'slam') {
      const pos = { x: this.x - Math.sin(this.yaw) * 1.6, y: 0.1, z: this.z - Math.cos(this.yaw) * 1.6 };
      this.say(env, 'warden_slam', { pos, volume: 1.2, priority: 3 });
      env.fx.dust(pos, 1);
      env.fx.explosion({ x: pos.x, y: 0.2, z: pos.z }, 1.5);
      env.shake(0.9);
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < WARDEN.slamRadius && Math.abs(p.y - this.y) < 1.4) {
        const fall = 1 - 0.6 * (d / WARDEN.slamRadius);
        env.hurtPlayer(WARDEN.slamDamage * fall * this.dmgScale, pos.x, pos.z, 'slam', 10);
      }
      return;
    }
    if (this.variant === 'court') {
      this.courtShot(env, dist);
      return;
    }
    // melee: distance, cone, vertical reach and a wall check
    const reach = this.def.attackRange + 0.35;
    if (dist > reach) return;
    if (Math.abs(p.y - this.y) > ZOMBIE_AI.attackVerticalReach) return;
    const facing = Math.atan2(-(p.x - this.x), -(p.z - this.z));
    if (Math.abs(wrap(facing - this.yaw)) > (ZOMBIE_AI.attackCone * Math.PI) / 180) return;
    if (env.world.segmentBlocked(this.x, this.y + 1.1, this.z, p.x, Math.max(p.y + 0.6, p.eyeY - 0.5), p.z, 'move')) return;
    env.hurtPlayer(this.def.damage * this.dmgScale, this.x, this.z, 'melee', this.type === 'armored' ? 3 : 1.5);
  }

  private turnToward(target: number, rate: number, dt: number): void {
    const d = wrap(target - this.yaw);
    const m = rate * dt;
    this.yaw += Math.max(-m, Math.min(m, d));
    this.yaw = wrap(this.yaw);
  }

  // ---------------------------------------------------------------------------------------------
  // animation
  // ---------------------------------------------------------------------------------------------

  private pose(env: ZombieEnv, speed: number): void {
    const a = this.anim;
    a.time = env.time;
    a.speed = speed;
    a.hitKick = this.hitKick;
    a.enraged = this.enraged;
    a.deathStyle = this.deathStyle;
    a.headshotDeath = this.headshotDeath;
    a.deathT = this.deathT;
    a.staggerT = this.state === 'stagger' ? Math.min(1, this.staggerT / Math.max(0.01, this.staggerDur)) : 0;
    a.actionT = 0;
    a.aggro = this.state === 'idle' ? 0.1 : this.state === 'alert' ? 0.7 : 1;
    switch (this.state) {
      case 'dead':
      case 'downed':
        a.mode = 'death';
        break;
      case 'stagger':
        a.mode = 'stagger';
        break;
      case 'alert':
        a.mode = this.type === 'warden' || this.type === 'runner' ? 'roar' : 'idle';
        a.actionT = Math.min(1, this.stateTime / Math.max(0.2, this.alertTimer + this.stateTime));
        break;
      case 'attack': {
        const t = this.attackTimes();
        const total = t.windup + t.strike + t.recovery;
        a.mode = this.attackKind === 'slam' ? 'slam' : this.attackKind === 'charge' ? (this.attackTime < t.windup ? 'roar' : this.attackTime < t.windup + t.strike ? 'charge' : 'idle') : 'attack';
        if (this.attackKind === 'charge') {
          a.actionT = Math.min(1, this.attackTime / Math.max(0.01, t.windup));
        } else {
          // windup -> [0, 0.55), strike -> [0.55, 0.72), recovery -> [0.72, 1]
          const at = this.attackTime;
          if (at < t.windup) a.actionT = (at / t.windup) * 0.55;
          else if (at < t.windup + t.strike) a.actionT = 0.55 + ((at - t.windup) / t.strike) * 0.17;
          else a.actionT = 0.72 + Math.min(1, (at - t.windup - t.strike) / Math.max(0.01, t.recovery)) * 0.28;
          void total;
        }
        break;
      }
      case 'chase':
        a.mode = speed > 3.0 ? 'run' : speed > 0.35 ? 'walk' : 'idle';
        break;
      default:
        a.mode = speed > 0.3 ? 'walk' : 'idle';
        break;
    }
    if (this.script) {
      a.mode = this.scriptPose.mode;
      a.actionT = this.scriptPose.actionT;
    }
    if (this.puppet) {
      a.mode = this.netMode;
      a.actionT = this.netActionT;
      a.staggerT = this.netStaggerT;
      a.aggro = 1;
    }
    if (this.buried) {
      // lying under the petals, as if dead
      a.mode = 'death';
      a.deathT = 6;
      a.deathStyle = 1;
    }
    this.syncRoot();
    this.rig.update(a, 1 / 60);
  }
}
