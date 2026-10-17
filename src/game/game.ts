/**
 * Game: owns every subsystem, the main loop, the pointer-lock / pause state machine, restart, and end-of-run flow.
 *
 * States: 'title' (live backdrop) -> 'playing' <-> 'paused' -> 'ending' (death cam / boarding cinematic) -> 'results'.
 * The simulation only advances in 'playing' and 'ending'. dt is clamped, so pausing / tab switches never produce a jump.
 */
import { loadAnimeCast } from '../anime/cast';
import { MAP_IDS, MAP_TEXT, type MapId } from '../world/layout/data';
import * as THREE from 'three';
import { AsylumLoopRuntime } from '../asylum/loopRuntime';
import { createAudioEngine } from '../audio/engine';
import type { AudioEngineApi, LoopHandle } from '../audio/ids';
import { CardRuntime } from '../cards/cardRuntime';
import { CoopSession } from '../coop/coop';
import { CoopUi } from '../coop/lobbyUi';
import { COOP, DEFAULT_SETTINGS, FREE_ROAM, GOVERNOR, GRENADE, PLAYER, QUALITY, QUALITY_TIERS, RAGDOLL, REGIONS, RENDER, VULCAN, ZOMBIE_AI, ZOMBIE_DIFFICULTY, type TeamSkill, type ZombieDifficulty } from '../config';
import { Zombie, type AttackKind, type ZombieEnv } from '../enemies/zombie';
import { ZombieManager } from '../enemies/zombieManager';
import { createZombieFactory, type ZombieFactoryExt } from '../enemies/zombieRig';
import { createFx } from '../fx/fx';
import type { FxApi } from '../fx/fxTypes';
import { applyDamageToPlayer, regenHealth } from '../logic/damage';
import { addCash, killReward } from '../logic/economy';
import { escalationPhase } from '../logic/mission';
import { extractionInProgress } from '../logic/extraction';
import { FrameHistogram, calibrate, governorStep, newGovernor, startTier, summarize, tierCeiling, tierIndex } from '../logic/governor';
import { Rng } from '../logic/rng';
import { type Account, type RunPerf, RunTracker, loadAccount, logout, mapAccess, ping, reportPlayer, reportVisit, roomInfo } from '../net/account';
import { AIM_ASSIST, assistFor, pickTarget, wrapAngle, type AssistPick, type AssistResult, type AssistTarget, type AssistView } from '../player/aimAssist';
import { Input, type Edges } from '../player/input';
import { enterFullscreenLandscape, isTouchDevice } from '../player/touch';
import { DetailCuller, halveTextures, lowSpecHardware } from '../render/lite';
import { deviceReport } from '../render/device';
import { mouseToRadians, Player, type PlayerControl } from '../player/player';
import { checkCapabilities, GameRenderer } from '../render/renderer';
import { setSkyColors } from '../render/stage';
import { hasStoredSettings, isBetterRun, loadBest, loadDifficulty, loadMap, loadMode, loadRoamBase, loadSakura, loadSettings, loadTier, saveBest, saveDifficulty, saveMap, saveMode, saveRoamBase, saveSettings, saveTier } from '../storage';
import type { BestRun, GameMode, MissionStats, QualityLevel, Region, Settings } from '../types';
import { createHud } from '../ui/hud';
import type { HudApi, HudEvent, MapMarker } from '../ui/hudTypes';
import { createMenus } from '../ui/menus';
import { createTouchControls, type TouchControlsApi } from '../ui/touchControls';
import type { MenusApi, ModeInfo } from '../ui/hudTypes';
import { GrenadeSystem, rocketForPrewarm } from '../weapons/grenades';
import { createViewmodels } from '../weapons/viewmodels';
import type { ViewmodelSet } from '../weapons/viewmodelTypes';
import { WeaponSystem, type WeaponInput } from '../weapons/weaponSystem';
import { buildLevel, type Level } from '../world/level';
import { createMaterialLib, type MaterialLib } from '../world/materials';
import { createGrenadeModel } from '../world/models';
import { FlowField, GAMEPLAY_FIELD_RANGE } from '../world/nav';
import type { GameCtx } from './ctx';
import { Entities } from './entities';
import { buildHudState, buildMapDynamic } from './hudBridge';
import { SquadRuntime } from './squad';
import { ForgeRuntime } from '../forge/runtime';
import { farCrowd } from '../anime/farCrowd';
import { loadModels, PACKS } from '../models/library';
import { CourtRig } from '../sakura/courtRig';
import { sakuraVariantPicker } from '../sakura/director';
import { applyStoryStart, isStory, populateStory, settleStoryContracts, STORIES, STORY_IDS, type StoryId } from '../sakura/missions';
import { SakuraRuntime } from '../sakura/runtime';
import { RevealCinematic } from '../forge/reveal';
import { Interaction, type InteractionOutput } from './interaction';
import { wireMatronFx } from './matronFx';
import { MissionRuntime } from './missionRuntime';
import { buildStats, newSession, type Session } from './session';
import { BarricadeRuntime } from '../asylum/barricadeRuntime';
import { PowerupRuntime } from './powerupRuntime';
import { VERSION } from '../version';

export type GameState = 'boot' | 'title' | 'playing' | 'paused' | 'ending' | 'results';

/** Milliseconds a frame may spend spreading a flow field (the player's, the squad's): no frame stalls on a big map. */
const FLOW_SLICE_MS = 1.2;

export interface GameDeps {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

/** Set when the map is changed with Co-op picked, so the reloaded page opens the lobby again. */
const REOPEN_LOBBY = 'deadsignal.reopenLobby';
function reopenLobby(): boolean {
  try {
    const on = sessionStorage.getItem(REOPEN_LOBBY) === '1';
    sessionStorage.removeItem(REOPEN_LOBBY);
    return on;
  } catch {
    return false;
  }
}

/** The first-deploy graphics hint is shown once per browser. */
const QUALITY_HINT = 'deadsignal.qualityHint.v1';
function hintShown(): boolean {
  try {
    return localStorage.getItem(QUALITY_HINT) === '1';
  } catch {
    return true;
  }
}
function markHintShown(): void {
  try {
    localStorage.setItem(QUALITY_HINT, '1');
  } catch {
    /* ignore */
  }
}

export class Game implements GameCtx {
  // ---- subsystems (assigned in init) ----
  renderer!: GameRenderer;
  level!: Level;
  mats!: MaterialLib;
  audio!: AudioEngineApi;
  fx!: FxApi;
  hud!: HudApi;
  menus!: MenusApi;
  player!: Player;
  input!: Input;
  weapons!: WeaponSystem;
  zombies!: ZombieManager;
  grenades!: GrenadeSystem;
  flow!: FlowField;
  entities!: Entities;
  mission!: MissionRuntime;
  interaction!: Interaction;
  viewmodels!: ViewmodelSet;
  zombieFactory!: ZombieFactoryExt;
  cards!: CardRuntime;
  coop!: CoopSession;
  squad!: SquadRuntime;
  /** Power-up drops (every map) and the Asylum's barricades (null on other maps). */
  powerups!: PowerupRuntime;
  barricades: BarricadeRuntime | null = null;
  /** Asylum loop: the purchasable doors, power, perks, wall-buys and Pack-a-Punch (null on other maps). */
  asylum: AsylumLoopRuntime | null = null;
  /** The Forge's story: the holdouts, the Hearth, the ledger, the Pit, the last carrier (null on other maps). */
  forge: ForgeRuntime | null = null;
  /** The Sakura District's own runtime (petals, lore, the Easter egg), on that map only. */
  sakura: SakuraRuntime | null = null;
  /** The Sakura District: the story mission picked on the title screen for solo runs (null: the operation). */
  private storyPick: StoryId | null = null;

  /** The story mission this run plays: the co-op session's kind, or the solo pick (the Sakura District only). */
  get tale(): StoryId | null {
    if (this.mapId !== 'sakura') return null;
    if (this.mode === 'coop') return isStory(this.coop.kind) ? this.coop.kind : null;
    return this.mode === 'standard' ? this.storyPick : null;
  }
  /** Which map was built this page load. */
  mapId: MapId = 'district';
  private coopUi!: CoopUi;
  /** What DEPLOY starts; chosen on the title screen and fixed for the run. */
  mode: GameMode = 'standard';
  /** Show the "graphics are on Low, raise them in Settings" hint on the first deploy. */
  private qualityHint = false;
  /** Free roam is an option on a mode: the one it was switched on from. */
  roamBase: 'standard' | 'cards' = 'standard';
  /** The player's own difficulty picks (solo runs, and the defaults for a co-op session they create). */
  difficulty: { zombies: ZombieDifficulty; team: TeamSkill } = { zombies: 'normal', team: 'regular' };
  account: Account = { online: false, user: null, admin: false, banned: false, banReason: '', cards: {}, loginUrl: '', lockedMaps: [] };
  private readonly tracker = new RunTracker(() => this.account.online && this.account.user !== null);
  readonly worldRoot = new THREE.Group();
  rng = new Rng(1337);
  session: Session = newSession();
  settings: Settings = { ...DEFAULT_SETTINGS };
  time = 0;

  state: GameState = 'boot';
  private best: BestRun | null = null;
  private raf = 0;
  private lastT = 0;
  private fps = 60;
  private frameMs = 16;
  readonly zenv: ZombieEnv;
  private readonly markers: MapMarker[] = [];
  private io: InteractionOutput = { prompt: null, panel: null, panelOpen: false };
  private pendingLock: 'none' | 'start' | 'resume' = 'none';
  private dirty = false;
  private fadeEl!: HTMLDivElement;
  private roamHint!: HTMLDivElement;
  private roamKeys = '';
  private noLock = false;
  /** Played with on-screen controls: there is no pointer to lock, so deploy / resume start straight away. */
  readonly touchMode = isTouchDevice();

  /** Flying with no damage and no HUD: free roam, a co-op free-roam session, and spectators. */
  get flying(): boolean {
    return this.mode === 'roam' || this.coop.role === 'spectator' || (this.mode === 'coop' && this.coop.role !== 'none' && this.coop.kind === 'roam');
  }
  private touch: TouchControlsApi | null = null;
  private playingSince = 0;
  // aim assist / auto fire scratch (touch play); reused every frame so nothing is allocated while playing
  private readonly assistTargets: AssistTarget[] = [];
  private readonly assistView: AssistView = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private readonly assistPick: AssistPick = { index: -1, yawErr: 0, pitchErr: 0, angle: 0, dist: 0 };
  private readonly assistOut: AssistResult = { slow: 1, dyaw: 0, dpitch: 0 };
  private sinceLook = 1;
  private autoOnTarget = 0;
  private autoPulse = 0;
  private escAt = 0;
  private shakeAmt = 0;
  private roll = 0;
  private endingT = 0;
  private endingKind: 'death' | 'board' | 'reveal' | 'none' = 'none';
  /** The Forge: after a won run's boarding cinematic, the ending card and the reveal (`forge/reveal.ts`). */
  private reveal: RevealCinematic | null = null;
  private revealPending = false;
  private pendingResults: { stats: MissionStats; outcome: 'victory' | 'defeat' } | null = null;
  private flowTimer = 0;
  private flowGoalX = 1e9;
  private flowGoalZ = 1e9;
  /** Where the flow field being spread (over several frames) is headed. */
  private flowNextX = 0;
  private flowNextZ = 0;
  private envTimer = 0;
  private lastHurtSound = -1;
  private lastToxicEvent = -1;
  private heartbeat: LoopHandle | null = null;
  private ambience: LoopHandle | null = null;
  private stepSound: { surfaceIndoor: boolean } = { surfaceIndoor: false };
  private readonly camDir = new THREE.Vector3();
  private readonly listenerFwd = { x: 0, y: 0, z: -1 };
  private readonly pushOut = { x: 0, z: 0 };
  /** The last blow that landed (direction away from it, and how hard): a killing one throws the camera. */
  private lastBlow = { x: 0, z: 1, power: 0, at: -9 };
  /** Death camera ragdoll: the eye is thrown, tumbles and comes to rest on the ground. */
  private readonly deathCam = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, roll: 0, rollV: 0, pitch: 0, pitchV: 0, pos: { x: 0, z: 0 } };
  private cinePos = new THREE.Vector3();
  private cineFrom = new THREE.Vector3();
  private devTimeScale = 1;
  /** Dev / QA only: stop the live loop from advancing the simulation (scripted stepping takes over). */
  devFrozen = false;
  onFatal: (message: string) => void = () => {};

  constructor(private readonly deps: GameDeps) {
    this.zenv = {
      time: 0,
      world: undefined as never,
      nav: undefined as never,
      field: undefined as never,
      player: { x: 0, y: 0, z: 0, eyeY: 1.6, alive: true, sprinting: false },
      rng: this.rng,
      audio: undefined as never,
      fx: undefined as never,
      hurtPlayer: (amount, sx, sz, kind, knock) => this.zombieHurt(amount, sx, sz, kind, knock),
      alertNear: (x, z, r, id) => this.zombies.alertNear(x, z, r, id),
      shake: (s) => this.shake(s),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // boot
  // ---------------------------------------------------------------------------------------------

  async init(): Promise<boolean> {
    const { canvas, uiRoot } = this.deps;
    this.settings = loadSettings();
    // Auto quality: the tier saved for this device, else a guess from touch, memory and cores (the calibration and the
    // governor correct it in play); a player who never opened Settings is told once where to pick one
    if (this.settings.qualityAuto) this.settings.quality = startTier(loadTier(), this.touchMode, lowSpecHardware());
    this.gov = newGovernor(tierCeiling(this.touchMode));
    this.qualityHint = !hasStoredSettings() && !hintShown();
    this.best = loadBest();
    this.mode = loadMode();
    this.mapId = loadMap();
    this.difficulty = loadDifficulty();
    this.roamBase = loadRoamBase();
    if (this.touchMode) document.documentElement.classList.add('ds-touch');

    this.menus = createMenus({
      onDeploy: () => this.requestStart(false),
      onResume: () => this.requestResume(),
      onRestart: () => this.requestStart(true),
      onQuitToTitle: () => this.quitToTitle(),
      onSettingsChange: (s) => this.applySettings(s, true),
      onModeChange: (m) => this.setMode(m),
      onLogout: () => void logout().then(() => window.location.reload()),
      onMapChange: (m) => this.setMap(m),
      onDifficultyChange: (d) => this.setDifficulty(d),
      onRoamChange: (on) => this.setRoam(on),
      onStoryChange: (id) => {
        this.storyPick = isStory(id) ? id : null;
        this.menus.setModeInfo(this.modeInfo());
      },
    });
    this.menus.mount(uiRoot);
    this.menus.setTouchMode(this.touchMode);
    this.menus.setSettings(this.settings);

    this.account = await loadAccount();
    reportVisit(this.touchMode);
    this.menus.setAccount({
      online: this.account.online,
      name: this.account.user?.name ?? null,
      avatar: this.account.user?.avatar ?? null,
      admin: this.account.admin,
      loginUrl: this.account.loginUrl,
      loginFailed: new URLSearchParams(window.location.search).get('login') === 'failed',
    });
    // a map that is not open to this player (a gated map the admins have not made public): back to the District.
    // An invite to a co-op session on it still gets in - the session's owner chose the map.
    if (mapAccess(this.account, this.mapId) === 'locked' && !new URLSearchParams(window.location.search).get('room')) {
      this.mapId = 'district';
      saveMap('district');
    }
    if (this.account.banned) {
      this.menus.showError('ACCOUNT BANNED', 'This Discord account has been banned from DEAD SIGNAL.', this.account.banReason || undefined);
      return false;
    }

    const caps = checkCapabilities(this.touchMode);
    if (!caps.ok) {
      const needs = this.touchMode ? 'DEAD SIGNAL needs WebGL 2.' : 'DEAD SIGNAL needs WebGL 2 and the Pointer Lock API (desktop keyboard and mouse).';
      this.menus.showError('Unsupported browser', caps.problems.join(' '), needs);
      return false;
    }

    this.menus.showLoading(0.02, 'INITIALISING RENDERER');
    await nextFrame();
    this.renderer = new GameRenderer(canvas);
    this.renderer.scene.add(this.worldRoot);
    this.renderer.hFov = this.settings.fov;
    this.renderer.setQuality(this.settings.quality);

    this.menus.showLoading(0.1, 'SYNTHESISING MATERIALS');
    await nextFrame();
    this.mats = createMaterialLib();

    // a model pack (Settings) loads before the map is built: its props are placed with the map
    const pack = PACKS[this.settings.modelPack];
    if (pack.length > 0) {
      this.menus.showLoading(0.2, 'LOADING MODELS');
      await loadModels(pack);
    }
    this.menus.showLoading(0.25, 'BUILDING DISTRICT');
    await nextFrame();
    this.level = buildLevel(this.mats, this.mapId);
    setSkyColors(this.renderer.sky);
    if (this.mapId === 'forge') {
      // ember night: warm haze, firelit ground bounce and an orange horizon fill
      const fog = this.renderer.scene.fog as THREE.FogExp2 | null;
      fog?.color.set(0x2a1710);
      this.renderer.light.hemi.color.set(0x9a6a52);
      this.renderer.light.hemi.groundColor.set(0x4a1c08);
      this.renderer.light.fill.color.set(0xff7a2a);
    } else if (this.mapId === 'sakura') {
      // blossom dusk: a rose haze, a pink sky over violet ground, a warm fill (the bloom turns it to a blood moon)
      SakuraRuntime.applyDusk(this.renderer);
    } else if (this.mapId === 'asylum') {
      // the long night on the hill: cold moonlight, a grey-green mist, damp lawn underfoot
      const fog = this.renderer.scene.fog as THREE.FogExp2 | null;
      fog?.color.set(0x141c1c);
      this.renderer.light.hemi.color.set(0x7d8fa0);
      this.renderer.light.hemi.groundColor.set(0x141a12);
      this.renderer.light.fill.color.set(0x9fb6d0);
    }
    this.worldRoot.add(this.level.root);
    // which lamps are under a roof (the same test as the camera's): indoors, the room's own lamps are chosen first
    for (const l of this.level.lights) {
      if (l.indoor !== undefined) continue;
      const hit = this.level.world.raycast(l.x, Math.max(0.3, l.y - 0.4), l.z, 0, 1, 0, 14, 'shots');
      l.indoor = !!hit && hit.collider?.tag === 'roof';
    }
    this.renderer.lightPool.setLamps(this.level.lights);

    this.menus.showLoading(0.6, 'PREPARING EFFECTS AND AUDIO');
    await nextFrame();
    this.fx = createFx();
    this.worldRoot.add(this.fx.root);
    this.audio = createAudioEngine();
    this.audio.setMasterVolume(this.settings.masterVolume);

    if (this.mapId === 'sakura') {
      // the cast's VRoid models, all up front (any that are missing fall back to the stock figures)
      this.menus.showLoading(0.66, 'DRESSING THE CAST');
      await loadAnimeCast();
    }
    this.menus.showLoading(0.72, 'RIGGING INFECTED');
    await nextFrame();
    this.zombieFactory = createZombieFactory();
    this.zombieFactory.prewarm(this.mapId === 'asylum' ? 'asylum' : this.mapId === 'forge' ? 'forge' : this.mapId === 'sakura' ? 'sakura' : undefined); // the Asylum's and the Forge's infected have their own looks
    this.viewmodels = createViewmodels({ relics: this.mapId === 'sakura' });

    this.menus.showLoading(0.85, 'ARMING SYSTEMS');
    await nextFrame();
    this.input = new Input(canvas);
    this.player = new Player(this.level.world);
    this.player.events = {
      onStep: (strength, sprinting, crouching) => this.onFootstep(strength, sprinting, crouching),
      onJump: () => this.audio.play('jump', { priority: 1, volume: 0.6 }),
      onLand: (impact) => {
        this.audio.play('land', { priority: 1, volume: Math.min(1, impact / 10) });
        this.fx.dust({ x: this.player.x, y: 0.1, z: this.player.z }, Math.min(1, impact / 12));
      },
    };
    this.flow = new FlowField(this.level.nav);
    this.zenv.world = this.level.world;
    this.zenv.nav = this.level.nav;
    this.zenv.floors = this.level.floors;
    this.zenv.field = this.flow;
    this.zenv.audio = this.audio;
    this.zenv.fx = this.fx;

    this.zombies = new ZombieManager(this.zombieFactory, this.level);
    if (this.mapId === 'sakura') {
      // the Sakura District's kinds of infected, and the Kurenai Court's people (`sakura/director.ts`)
      this.zombies.pickVariant = sakuraVariantPicker(this.level);
      this.zombies.courtRig = (seed) => new CourtRig(seed);
      this.zombies.beforeUpdate = () => farCrowd().begin();
    }
    this.worldRoot.add(this.zombies.root);
    this.zombies.onKill = (z, head) => this.onZombieKilled(z, head);
    // the Asylum's Matron: her shriek on screen, the lamps failing around her, her keys (matronFx.ts)
    wireMatronFx(this.zombies.matron, this.renderer.lightPool, { listener: () => this.player, shake: (s) => this.shake(s), hud: (e) => this.hud.event(e), audio: () => this.audio });
    if (this.mapId === 'forge') {
      // Vulcan HQ fell: some of the Forge's infected are the clan's own Infernus, each name used once at a time
      let bag: string[] = [];
      this.zombies.namer = () => {
        if (this.rng.f() >= VULCAN.namedShare) return null;
        const inUse = new Set(this.zombies.zombies.map((q) => q.tag));
        if (bag.length === 0) bag = [...VULCAN.infected].sort(() => this.rng.f() - 0.5);
        // the people holed up this run are alive: nobody infected carries their names
        const alive = this.forge?.reserved;
        for (let i = 0; i < bag.length; i++) {
          if (!inUse.has(bag[i]!) && !alive?.has(bag[i]!)) return bag.splice(i, 1)[0]!;
        }
        return null;
      };
    }
    this.cards = new CardRuntime(this, this.zombieFactory.material, () => this.zenv);
    await this.cards.load();
    if (this.account.user) this.cards.setCounts(this.account.cards);
    this.cards.onRecovered = (id) =>
      void this.tracker.card(id).then((counts) => {
        if (counts) this.cards.setCounts(counts);
      });

    this.grenades = new GrenadeSystem(
      {
        world: this.level.world,
        zombies: this.zombies,
        zombieEnv: () => this.zenv,
        fx: this.fx,
        audio: this.audio,
        playerPos: () => ({ x: this.player.x, y: this.player.y + 1, z: this.player.z }),
        hurtPlayerExplosion: (amount, x, z, closeness) => this.blastPlayer(amount, x, z, closeness),
        onExplosion: (x, y, z) => this.onExplosion(x, y, z),
        playerVelocity: () => ({ x: this.player.vx, z: this.player.vz }),
        rocketGlow: (at) => this.rocketGlow(at),
      },
      () => createGrenadeModel(this.mats),
    );
    this.worldRoot.add(this.grenades.root);

    this.weapons = new WeaponSystem(
      {
        renderer: this.renderer,
        world: this.level.world,
        zombies: this.zombies,
        zombieEnv: () => this.zenv,
        audio: this.audio,
        fx: this.fx,
        player: this.player,
        get inv() {
          return host.session.inv;
        },
        get vitals() {
          return host.session.vitals;
        },
        reducedMotion: () => this.settings.reducedMotion,
        hudEvent: (e) => this.hud.event(e),
        noise: (radius) => this.zombies.emitNoise(this.player.x, this.player.z, radius),
        throwGrenade: (o, d) => this.grenades.throw(o, d),
        fireRocket: (o, d, dmg) => this.grenades.fireRocket(o, d, dmg),
        recordShot: (hit) => {
          this.session.stats.shotsFired++;
          if (hit) this.session.stats.shotsHit++;
        },
        onPlateApplied: (added) => {
          this.audio.play('pickup_plate', { priority: 2, volume: 0.6 });
          this.feed(`ARMOR +${Math.round(added)}`, 'good');
        },
        alive: () => this.playerAlive(),
      },
      this.viewmodels,
    );
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const host = this;

    this.entities = new Entities(this);
    this.mission = new MissionRuntime(this, this.entities);
    this.interaction = new Interaction(this, this.entities, this.mission, this.cards, {
      rescueTarget: () => this.squad.rescueTarget(),
      rescue: (id) => this.squad.rescue(id),
      reviveTarget: () => this.coop.reviveTarget(),
      revive: (id) => this.coop.revive(id),
    });
    this.coop = new CoopSession(this);
    this.coop.room.device = this.touchMode ? 'phone' : 'pc'; // shown beside our name in the lobby
    this.squad = new SquadRuntime(this);
    if (this.mapId === 'forge' && this.level.data.forge) {
      this.forge = new ForgeRuntime(this);
      // the helicopter holds off while the reborn is loose; after the burnout the firestorm dies down
      this.mission.holdExtraction = () => this.forge?.holdExtraction ?? false;
      this.mission.calm = () => this.forge?.burnedOut ?? false;
    }
    if (this.mapId === 'sakura') this.sakura = new SakuraRuntime(this);
    this.coopUi = new CoopUi(uiRoot, this.coop, {
      userId: () => this.account.user?.id ?? null,
      mapId: () => this.mapId,
      difficulty: () => ({ ...this.difficulty }),
      isAdmin: () => this.account.admin,
      canShow: () => this.mode === 'coop' && (this.state === 'title' || this.state === 'results'),
      deploy: () => this.requestStart(this.state === 'results'),
      playing: () => this.coop.live && (this.state === 'playing' || this.state === 'paused'),
      report: reportPlayer,
    });
    // a session that goes live (or is already live when you join it) brings you in without hunting for a button
    const lobbyChanged = this.coop.onChange;
    let lockedMap: MapId | null = null;
    this.coop.onChange = () => {
      lobbyChanged();
      this.coopAutoJoin();
      // the title locks its map while you are in a session (and unlocks when you leave)
      const locked = this.coop.room.room?.map ?? null;
      if (locked !== lockedMap && this.state === 'title') {
        lockedMap = locked;
        this.menus.setModeInfo(this.modeInfo());
      }
    };

    this.hud = createHud();
    this.hud.mount(uiRoot);
    // ---- power-up drops (every map) and the Asylum's boarded windows ----
    if (this.mapId === 'asylum') this.barricades = new BarricadeRuntime(this, { cashMul: () => this.powerups.cashMul, remote: () => this.coop.live });
    this.powerups = new PowerupRuntime(this, {
      hudRoot: uiRoot.querySelector<HTMLElement>('.ds-hud') ?? uiRoot,
      remote: () => this.coop.live,
      barricades: () => this.barricades,
      speaker: this.mapId === 'asylum' ? 'OKAFOR' : 'COMMAND',
      zombieEnv: () => this.zenv,
    });
    this.zombies.damageFilter = (z, amount) => this.powerups.filterDamage(z, amount);
    if (this.barricades) this.interaction.providers.push(() => this.barricades?.target() ?? null);
    // Asylum loop: built after the HUD (it adds its perk row there)
    if (this.mapId === 'asylum') this.asylum = new AsylumLoopRuntime(this, uiRoot);
    // co-op: SECOND WIND picks a downed teammate up faster (solo: it gets you back up once)
    this.interaction.reviveMul = () => this.asylum?.reviveMul ?? 1;
    // the generators running (RESTORE THE POWER) throws the power on; the lever in the boiler house does it too
    this.mission.onPowerRestored = () => this.asylum?.setPower(true);
    this.hud.setMapData(this.level.data.map);
    this.hud.setVisible(false);
    if (this.touchMode) {
      this.touch = createTouchControls({
        root: uiRoot,
        input: this.input,
        onPause: () => this.pause('menu'),
        onInterrupt: () => this.pause('lost'),
      });
    }

    this.roamHint = document.createElement('div');
    this.roamHint.className = 'ds-roam-hint';
    this.roamKeys = this.touchMode ? '  //  LOOK WHERE YOU WANT TO GO AND PUSH THE STICK  //  RUN = FAST  //  II = MENU' : '  //  WASD FLY  //  SPACE UP  //  C DOWN  //  SHIFT FAST  //  ESC MENU';
    this.roamHint.hidden = true;
    uiRoot.appendChild(this.roamHint);

    this.fadeEl = document.createElement('div');
    this.fadeEl.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;z-index:5';
    uiRoot.appendChild(this.fadeEl);

    this.applySettings(this.settings, false);
    this.installListeners();

    this.menus.showLoading(0.92, 'FINALISING');
    await nextFrame();
    this.resetRun(true);
    this.renderer.resize();
    // Low: every texture at half size, before anything is uploaded (Lite: a quarter); small props stop being drawn at
    // a distance
    this.halveTexturesTo(this.settings.quality);
    this.culler = new DetailCuller(this.level.root);
    this.culler.distance = QUALITY[this.settings.quality].detailDistance;
    if (this.touchMode) this.renderer.setRenderScale(0.85);
    // compile the shaders in the background (in parallel where the browser can) instead of freezing on the first frame
    this.menus.showLoading(0.96, 'COMPILING SHADERS');
    await this.compileShaders();
    // warm shaders / pipelines before the title appears
    this.frameOnce(1 / 60);
    this.menus.hideLoading();
    this.state = 'title';
    this.hud.setVisible(false);
    this.menus.setModeInfo(this.modeInfo());
    this.menus.showTitle(this.best);
    // an invite link (/?room=CODE) goes straight to the lobby; the admin's "watch unseen" link joins hidden
    const invite = new URLSearchParams(window.location.search);
    const code = invite.get('room');
    // a link to a session that has ended (or never existed) is just the main page, with a word about why
    const info = code && this.account.user ? await roomInfo(code) : null;
    const live = !!info;
    if (code && this.account.user && !info) {
      window.history.replaceState(null, '', window.location.pathname);
      this.menus.flash(`Session ${code.toUpperCase().slice(0, 6)} has ended or does not exist.`);
    } else if (info && info.map !== this.mapId) {
      // the session plays another map: switch to it and come back to the same link
      saveMap(info.map);
      window.location.reload();
      return true;
    }
    if (code) {
      // the invite has been read: drop it from the address so a later reload (a map change) does not replay it
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (code && live) {
      this.setMode('coop');
      this.coopUi.open(code);
      if (invite.get('watch') === 'admin' && this.account.admin) void this.coop.room.join(code, 'spectator', true);
    } else if (reopenLobby()) {
      // the map was changed with Co-op picked: back to the lobby on the new map
      this.setMode('coop');
    }
    this.lastT = 0;
    this.raf = requestAnimationFrame(this.frame);
    return true;
  }

  private installListeners(): void {
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('keydown', this.onKeyDownGlobal);
    window.addEventListener('pagehide', () => this.closeRun(true));
    window.setInterval(() => {
      if (this.account.user && document.visibilityState === 'visible') ping();
    }, 60000);
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.renderer.resize());
      this.resizeObserver.observe(this.deps.canvas);
    }
  }

  private resizeObserver: ResizeObserver | null = null;
  private culler: DetailCuller | null = null;
  /** Times every texture has been halved (Low: 1, Lite: 2). Only a page reload brings detail back. */
  private textureHalvings = 0;

  /** Halve the textures until they are as small as `level` wants. False when they are already smaller. */
  private halveTexturesTo(level: QualityLevel): boolean {
    const q = QUALITY[level];
    const want = q.quarterTextures ? 2 : q.halfTextures ? 1 : 0;
    while (this.textureHalvings < want) {
      halveTextures([this.renderer.scene, this.renderer.viewScene]);
      this.textureHalvings++;
    }
    return this.textureHalvings <= want;
  }

  /** Compile the world's and the weapons' shaders without blocking (all weapons shown for the moment it takes). */
  private async compileShaders(): Promise<void> {
    const r = this.renderer;
    try {
      // a failed shader still reports through three's own checks the first time it is drawn
      if (import.meta.env.PROD) r.renderer.debug.checkShaderErrors = false;
      // what only appears later (a rocket in flight; on the Forge the reborn and PROMETHEUS) is compiled now too, out of
      // sight below the ground, so its first appearance has nothing left to build
      const warm = new THREE.Group();
      warm.position.set(this.level.data.playerStart.x, -60, this.level.data.playerStart.z);
      warm.add(rocketForPrewarm());
      const forgeWarm = this.forge?.prewarmObjects() ?? [];
      for (const o of forgeWarm) warm.add(o);
      r.scene.add(warm);
      try {
        await r.renderer.compileAsync(r.scene, r.camera);
      } finally {
        r.scene.remove(warm);
      }
      // ...and drawn once into a tiny target, off screen: that sends their shapes and textures to the GPU now as well
      const stage = new THREE.Scene();
      stage.add(warm);
      const eye = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
      eye.position.set(warm.position.x, warm.position.y + 4, warm.position.z + 22);
      eye.lookAt(warm.position);
      const target = new THREE.WebGLRenderTarget(4, 4);
      const before = r.renderer.getRenderTarget();
      r.renderer.setRenderTarget(target);
      r.renderer.render(stage, eye);
      r.renderer.setRenderTarget(before);
      target.dispose();
      stage.remove(warm);
      const hidden = r.viewScene.children.filter((c) => !c.visible);
      for (const c of hidden) c.visible = true;
      try {
        await r.renderer.compileAsync(r.viewScene, r.viewCamera);
      } finally {
        for (const c of hidden) c.visible = false;
      }
    } catch {
      // older browsers: the first frame compiles them instead
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('keydown', this.onKeyDownGlobal);
    this.resizeObserver?.disconnect();
    this.touch?.dispose();
    this.input?.dispose();
    this.audio?.dispose();
  }

  // ---------------------------------------------------------------------------------------------
  // settings
  // ---------------------------------------------------------------------------------------------

  applySettings(s: Settings, persist: boolean): void {
    // Settings back on Auto: the governor carries on from the current quality (within this device's ceiling)
    if (s.qualityAuto && !this.settings.qualityAuto) {
      s = { ...s, quality: QUALITY_TIERS[Math.min(tierIndex(s.quality), tierIndex(tierCeiling(this.touchMode)))]! };
      this.gov = newGovernor(tierCeiling(this.touchMode));
    }
    // a quality picked by hand: the calibration and the governor's tier steps stop
    if (!s.qualityAuto) this.calFrames = null;
    const qualityChanged = s.quality !== this.settings.quality;
    const packChanged = s.modelPack !== this.settings.modelPack;
    this.settings = { ...s };
    if (persist) saveSettings(this.settings);
    if (persist) this.qualityHint = false; // they found Settings: no need to point at it
    this.renderer.hFov = s.fov;
    this.renderer.updateFov();
    this.audio.setMasterVolume(s.masterVolume);
    if (qualityChanged || !persist) {
      this.applyQuality(s.quality, persist);
      if (persist && !this.halveTexturesTo(s.quality)) this.menus.flash('Full texture detail comes back after a page reload.');
    }
    if (persist && s.qualityAuto) saveTier(s.quality);
    this.menus.setSettings(this.settings);
    // the models are part of building the map: on the title screen the game reloads with them, mid-run they wait
    if (persist && packChanged) {
      if (this.state === 'title' && this.mode !== 'coop') window.location.reload();
      else this.menus.flash('The new models load next time the game starts.');
    }
  }

  /** The renderer, effects and prop culling for a quality preset (and, `live`, the textures: `halveTexturesTo`). */
  private applyQuality(level: QualityLevel, live: boolean): void {
    this.renderer.setQuality(level);
    const q = QUALITY[level];
    this.fx.setQuality(q.particleScale, q.decalScale);
    if (this.culler) this.culler.distance = q.detailDistance;
    if (live) this.halveTexturesTo(level);
  }

  /** Auto quality: move to another tier (the calibration or the governor) and remember it for this device. */
  private setTier(level: QualityLevel): void {
    if (level === this.settings.quality || !this.settings.qualityAuto) return;
    this.settings = { ...this.settings, quality: level };
    this.applyQuality(level, true);
    saveTier(level);
    this.menus.setSettings(this.settings);
    this.feed(`GRAPHICS AUTO: ${level.toUpperCase()}`, 'normal');
  }

  /** What the title screen shows as picked. */
  private modeInfo(): ModeInfo {
    const maps = MAP_IDS.flatMap((id) => {
      const a = mapAccess(this.account, id);
      if (a === 'locked' && id !== this.mapId) return [];
      // the badge is for admins (and dev builds): players just see the map once it is public
      const b = a === 'admin-only' ? (['ADMIN ONLY', 'warn'] as const) : a === 'dev-only' ? (['DEV ONLY', 'warn'] as const) : a === 'public' && this.account.admin ? (['PUBLIC', 'good'] as const) : null;
      return [{ id, badge: b?.[0], badgeTone: b?.[1] }];
    });
    // the Sakura District's story missions, once the Thousand Lanterns has been seen through
    const stories = this.mapId === 'sakura' && loadSakura().egg ? STORY_IDS.map((id) => ({ id, label: STORIES[id].title, note: STORIES[id].note })) : undefined;
    return { mode: this.mode, map: this.mapId, cards: this.cards.collection(), difficulty: { ...this.difficulty }, lockedMap: this.coop.room.room?.map ?? null, roamBase: this.roamBase, maps, stories, story: this.storyPick ?? '' };
  }

  /** Title screen: the infected's difficulty and the AI squad's skill for solo runs (and new co-op sessions). */
  setDifficulty(d: { zombies: ZombieDifficulty; team: TeamSkill }): void {
    this.difficulty = { ...d };
    saveDifficulty(this.difficulty);
    this.menus.setModeInfo(this.modeInfo());
  }

  /** The difficulty this run plays at: the session's in co-op, the player's own otherwise. */
  get runDifficulty(): { zombies: ZombieDifficulty; team: TeamSkill } {
    const r = this.mode === 'coop' ? this.coop.room.room : null;
    return r ? { zombies: r.zombies ?? 'normal', team: r.team ?? 'regular' } : this.difficulty;
  }

  /** Title screen only: switch what DEPLOY starts. The backdrop is a pristine run, so only the carriers change. */
  setMode(mode: GameMode): void {
    if (this.state !== 'title') return;
    // with free roam on, picking Standard / Standard Mazoku only changes what it returns to
    if (this.mode === 'roam' && (mode === 'standard' || mode === 'cards')) {
      this.roamBase = mode;
      saveRoamBase(mode);
      this.menus.setModeInfo(this.modeInfo());
      return;
    }
    this.mode = mode;
    if (mode === 'coop') {
      this.coopUi.open();
    } else {
      saveMode(mode);
      this.coop.leave();
      this.coopUi.close();
    }
    this.cards.reset(mode === 'cards', false);
    this.menus.setModeInfo(this.modeInfo());
  }

  /** Title screen: free roam on (from Standard / Standard Mazoku) or off (back to the one it came from). */
  setRoam(on: boolean): void {
    if (this.state !== 'title') return;
    if (on && (this.mode === 'standard' || this.mode === 'cards')) {
      this.roamBase = this.mode;
      saveRoamBase(this.mode);
      this.setMode('roam');
    } else if (!on && this.mode === 'roam') {
      this.mode = this.roamBase; // set first so setMode does not treat it as a pick within free roam
      this.setMode(this.roamBase);
    }
  }

  /** Title screen only: the other map is built on a fresh page load. */
  setMap(map: MapId): void {
    if (this.state !== 'title' || map === this.mapId) return;
    // a co-op session is on one map: changing it would reload the page and drop you from the session
    if (this.coop.room.room) {
      this.menus.flash('You are in a co-op session on ' + MAP_TEXT[this.coop.room.room.map].name + '. Leave it to change the map.');
      return;
    }
    saveMap(map);
    // with Co-op picked, the lobby opens again on the new map
    try {
      if (this.mode === 'coop') sessionStorage.setItem(REOPEN_LOBBY, '1');
    } catch {
      /* ignore */
    }
    // a clean address: any invite or sign-in parameters belong to the page that is being left
    window.location.assign(window.location.pathname);
  }

  /** Joined a co-op session that plays another map: build that map and come straight back into the session. */
  switchMapForRoom(code: string, map: MapId): void {
    saveMap(map);
    this.coop.room.leave();
    window.location.assign(`${window.location.pathname}?room=${encodeURIComponent(code)}`);
  }

  // ---------------------------------------------------------------------------------------------
  // GameCtx helpers
  // ---------------------------------------------------------------------------------------------

  hudEvent(e: HudEvent): void {
    this.hud.event(e);
  }

  feed(text: string, tone: 'normal' | 'good' | 'warn' | 'danger' = 'normal'): void {
    this.hud.event({ type: 'feed', text, tone });
  }

  banner(title: string, subtitle: string | undefined, tone: 'info' | 'good' | 'warn' | 'danger', duration?: number): void {
    this.hud.event({ type: 'banner', title, subtitle, tone, duration });
  }

  radio(speaker: string, text: string, duration?: number): void {
    this.hud.event({ type: 'radio', speaker, text, duration });
    this.audio.play('radio_chirp', { priority: 1, volume: 0.5 });
  }

  playerAlive(): boolean {
    return this.session.vitals.health > 0 && !this.session.ended;
  }

  playerRegion(): Region {
    return this.level.regionAt(this.player.x, this.player.z);
  }

  shake(strength: number): void {
    this.shakeAmt = Math.min(1.2, this.shakeAmt + strength * (this.settings.reducedMotion ? 0.25 : 1));
  }

  // ---------------------------------------------------------------------------------------------
  // pointer lock / pause / start
  // ---------------------------------------------------------------------------------------------

  private lockPointer(): void {
    const canvas = this.deps.canvas;
    try {
      const req = canvas.requestPointerLock({ unadjustedMovement: true } as PointerLockOptions) as unknown as Promise<void> | undefined;
      if (req && typeof req.catch === 'function') {
        req.catch(() => {
          // some platforms reject raw input: retry with the plain request
          try {
            const r2 = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            if (r2 && typeof r2.catch === 'function') r2.catch(() => this.onLockError());
          } catch {
            this.onLockError();
          }
        });
      }
    } catch {
      try {
        canvas.requestPointerLock();
      } catch {
        this.onLockError();
      }
    }
  }

  /** Deploy / restart button (inside a click). */
  requestStart(restart: boolean): void {
    if (this.account.online && !this.account.user) return; // the title screen offers sign-in instead
    if (this.mode === 'coop' && !this.coop.canDeploy) {
      this.coopUi.open(); // nothing to deploy into until the host starts the session
      return;
    }
    this.audio.init(); // needs the user gesture
    if (restart || this.dirty || this.mode === 'coop') this.resetRun(false);
    this.dirty = true;
    if (this.touchMode) {
      this.startWithoutLock(true);
      return;
    }
    this.pendingLock = 'start';
    this.state = this.state === 'title' ? 'title' : 'paused';
    this.lockPointer();
  }

  /** Resume button (inside a click). */
  requestResume(): void {
    this.audio.init();
    if (this.touchMode) {
      this.startWithoutLock(false);
      return;
    }
    this.pendingLock = 'resume';
    this.lockPointer();
  }

  /** Touch devices: begin (or resume) inside the tap, with fullscreen and landscape if the browser allows them. */
  private startWithoutLock(fresh: boolean): void {
    void enterFullscreenLandscape();
    this.noLock = true;
    this.pendingLock = 'none';
    this.beginPlaying(fresh);
  }

  private readonly onLockChange = (): void => {
    const locked = document.pointerLockElement === this.deps.canvas;
    if (locked) {
      if (this.pendingLock === 'start') this.beginPlaying(true);
      else if (this.state === 'paused' || this.pendingLock === 'resume') this.beginPlaying(false);
      this.pendingLock = 'none';
    } else if (this.state === 'playing' && !this.noLock) {
      this.pause(performance.now() - this.escAt < 400 ? 'menu' : 'lost');
    }
  };

  private readonly onLockError = (): void => {
    this.pendingLock = 'none';
    if (this.state === 'playing') return;
    if (this.state === 'title' || this.state === 'paused') {
      this.state = this.state === 'title' && !this.dirty ? 'title' : 'paused';
      this.menus.showResumePrompt('POINTER LOCK WAS BLOCKED - CLICK TO TRY AGAIN', this.state === 'paused');
    }
  };

  private readonly onKeyDownGlobal = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') this.escAt = performance.now();
    this.reveal?.key(e.code); // the Forge's reveal: skippable after the first viewing
  };

  private readonly onBlur = (): void => {
    // Going fullscreen on a phone can blur the window for an instant; that is not the player leaving.
    if (this.touchMode && performance.now() - this.playingSince < 1000) return;
    if (this.state === 'playing') this.pause('lost');
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden' && this.state === 'playing') this.pause('lost');
  };

  private readonly onResize = (): void => {
    this.renderer.resize();
  };

  private beginPlaying(fresh: boolean): void {
    const wasTitle = this.state === 'title';
    this.state = 'playing';
    this.playingSince = performance.now();
    const spectating = this.coop.role === 'spectator';
    const roam = this.flying;
    this.roamHint.textContent = (spectating ? 'SPECTATING' : 'FREE ROAM') + this.roamKeys;
    if (spectating) {
      const at = this.coop.focusPoint();
      if (at) this.player.teleport(at.x, at.z + 8);
      this.player.y = 9;
    }
    this.coopUi.refresh();
    this.menus.hide();
    this.hud.setVisible(!roam);
    this.roamHint.hidden = !roam;
    this.weapons.hidden = roam;
    this.input.clear();
    this.input.setEnabled(true);
    this.input.fireSuppressed = false;
    this.lastT = 0; // next frame gets dt = 0: no accumulated delta after pause / lock acquisition
    this.audio.resume();
    if (fresh) {
      this.closeRun();
      this.device ??= deviceReport(this.touchMode, this.renderer.renderer.getContext());
      this.runFrames.reset();
      this.runMinScale = this.renderer.renderScale;
      this.tracker.start(this.mode, this.touchMode, this.mapId, VERSION.replace(/^v/, ''), this.runDifficulty.zombies, { ...this.device, quality: this.settings.quality }, this.tale);
      // Auto quality: the first seconds of the page's first real run (free roam has no infected) correct the guess
      if (this.settings.qualityAuto && !this.calibrationDone && !roam && !spectating) {
        this.calibrationDone = true;
        this.calFrames = [];
        this.calClock = 0;
      }
    }
    if (fresh || wasTitle) {
      this.audio.play('ui_deploy', { priority: 3 });
      if (!this.ambience || !this.ambience.active) this.ambience = this.audio.startLoop('ambience', { volume: 0.8, fadeIn: 2 });
      if (this.mode === 'coop') {
        const kind = this.coop.kind;
        const text = this.level.data.text;
        if (spectating) {
          // watching: no briefing
        } else if (kind === 'roam') this.banner('CO-OP  //  FREE ROAM', 'Fly anywhere together. No infected, no clock.', 'info', 4.5);
        else if (isStory(kind)) this.banner(`CO-OP  //  ${STORIES[kind].title}`, STORIES[kind].banner, 'info', 5);
        else this.banner(`CO-OP  //  ${kind === 'mazoku' ? 'STANDARD MAZOKU' : 'STANDARD'}`, `${text.defenseTitle}. ${text.huntTitle}. Extract together - revive anyone who goes down.`, 'info', 5);
      } else if (this.mapId === 'asylum' && !roam) {
        this.banner('BLACKWOOD HILL', 'Late afternoon. Recover the files and restore the power while it is light - at nightfall she begins her rounds.', 'info', 5);
      } else if (this.mapId === 'forge' && !roam) {
        this.banner('THE FORGE', 'Vulcan HQ has fallen. Rekindle the beacon, slay the Infernus, bring the clan home. Rise.', 'info', 5);
      } else if (this.mapId === 'sakura' && !roam) {
        const tale = this.tale;
        if (tale) this.banner(STORIES[tale].title, STORIES[tale].banner, 'info', 5);
        else this.banner('SAKURAGI', 'Seventh spring. Restore the shrine relay, put down the Empress, extract. Nobody is left to save.', 'info', 5);
      } else if (!roam) this.banner('OPERATION DEAD SIGNAL', 'Restore the relay. Kill the Warden. Free the trapped survivors. Extract.', 'info', 4.5);
      // the first deploy on a browser that never opened Settings: where to raise the graphics
      if (this.qualityHint && !spectating) {
        this.qualityHint = false;
        markHintShown();
        const pick = `${this.touchMode ? 'II' : 'ESC'} > SETTINGS`;
        const q = this.settings.quality.toUpperCase();
        this.feed(this.settings.qualityAuto ? `GRAPHICS: AUTO (${q}) - IT ADJUSTS TO THIS DEVICE - ${pick} TO PICK ONE` : `GRAPHICS: ${q} - ${pick} TO CHANGE IT`, 'normal');
      }
    }
  }

  pause(reason: 'menu' | 'lost'): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.setEnabled(false); // clears every held key / button
    this.weapons.cancelActions();
    this.interaction.closePanel(false);
    this.audio.suspend();
    // Desktop always gets the full menu: Esc does not reliably reach the page while the pointer is locked, and a
    // bare "click to resume" left no way to reach the settings.
    if (reason === 'menu' || !this.touchMode) this.menus.showPause(this.coop.pauseSession());
    else this.menus.showResumePrompt('PAUSED - TAP TO RESUME', true, {}, this.coop.pauseSession());
    if (document.pointerLockElement === this.deps.canvas) document.exitPointerLock();
  }

  quitToTitle(): void {
    // leaving mid-run leaves the session (for the host that ends it); from the results screen the squad stays together
    if (this.mode === 'coop' && this.state !== 'results') this.coop.leave();
    this.resetRun(false);
    this.dirty = false;
    this.state = 'title';
    this.pendingLock = 'none';
    this.hud.setVisible(false);
    this.roamHint.hidden = true;
    this.audio.stopAll();
    this.audio.resume();
    this.ambience = null;
    this.heartbeat = null;
    this.menus.setModeInfo(this.modeInfo());
    this.menus.showTitle(this.best);
    if (document.pointerLockElement === this.deps.canvas) document.exitPointerLock();
  }

  // ---------------------------------------------------------------------------------------------
  // run lifecycle
  // ---------------------------------------------------------------------------------------------

  /** Reset the world and the player for a fresh mission. Never stacks listeners or loops. */
  /** Report the run in progress as abandoned (restart, quit to title, tab closing). No-op when none is open. */
  private closeRun(keepalive = false): void {
    if (!this.tracker.running) return;
    this.tracker.end('abandoned', 'Left the run', buildStats(this.session, 'defeat', 'Left the run', this.mission.contractsDone()), this.runPerf(), keepalive);
  }

  resetRun(initial: boolean): void {
    if (!initial) this.closeRun();
    this.session = newSession();
    this.session.vitals.health = PLAYER.maxHealth;
    this.session.vitals.armor = PLAYER.plateArmor;
    this.rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);
    this.zenv.rng = this.rng;
    this.endingKind = 'none';
    this.endingT = 0;
    this.pendingResults = null;
    this.revealPending = false;
    if (this.reveal && !this.reveal.finished) this.reveal.finish();
    this.reveal = null;
    this.shakeAmt = 0;
    this.roll = 0;
    this.time = initial ? 0 : this.time;

    this.input?.clear();
    this.grenades.clear();
    this.zombies.clearAll();
    this.fx.clear();
    this.entities.reset();
    this.mission.reset();
    this.interaction.reset();
    this.powerups.reset();
    this.barricades?.reset();
    this.heartbeat?.stop(0.2);
    this.heartbeat = null;
    if (!initial) {
      this.audio.stopAll();
      this.ambience = null;
    }

    // a story mission comes in somewhere of its own
    if (this.mapId === 'sakura') applyStoryStart(this.level, this.tale);
    const st = this.level.data.playerStart;
    this.player.teleport(st.x, st.z, st.yaw);
    this.player.stamina = PLAYER.maxStamina;
    this.player.staminaExhausted = false;
    this.weapons.reset();
    this.zombies.tuning = ZOMBIE_DIFFICULTY[this.runDifficulty.zombies];
    // the Forge: who is holed up where (drawn before the residents, so none of them carries a living person's name)
    const forgeSquad = this.forge?.reset(this.mode === 'coop') ?? null;
    this.sakura?.reset(this.mode === 'coop', this.tale);
    if (this.mode !== 'coop') this.zombies.populate(this.rng);
    // a story mission's own night: who else is out there, and the contract already settled (co-op: the simulation's)
    const tale = this.tale;
    if (tale && this.mode !== 'coop') {
      populateStory(tale, this.zombies, this.level, this.rng);
      settleStoryContracts(tale, this.session.defense, this.session.hunt);
    }
    this.cards.reset(this.mode === 'cards', false);
    if (this.mode === 'coop') this.coop.begin();
    // the squad: solo runs it here; a co-op story run shows the simulation's
    const solo = this.mode === 'standard' || this.mode === 'cards';
    const coopStory = this.mode === 'coop' && this.coop.role !== 'none' && this.coop.story;
    this.squad.reset(solo || coopStory, solo || coopStory, coopStory, this.runDifficulty.team, coopStory ? Math.max(1, this.coop.room.room?.players.length ?? 1) : 1);
    if (forgeSquad && solo) this.squad.deployForge(forgeSquad);
    // Asylum loop: doors shut and the power off for a new run (after the squad's cages were placed with them open)
    this.asylum?.reset(this.mode === 'coop');
    this.weapons.hidden = this.flying;
    this.flow.cancel();
    this.flowGoalX = this.flowGoalZ = 1e9;
    this.flowTimer = 0;
    this.hud.reset();
    this.fadeEl.style.opacity = '0';
    this.renderer.zoom = 1;
    this.updateCamera(0);
  }

  // ---------------------------------------------------------------------------------------------
  // main loop
  // ---------------------------------------------------------------------------------------------

  private readonly frame = (nowMs: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const t = nowMs / 1000;
    let dt = this.lastT === 0 ? 0 : t - this.lastT;
    this.lastT = t;
    if (dt > 0.1) dt = 0.1; // clamp spikes (tab switches, breakpoints)
    if (dt > 0) {
      this.frameMs += (dt * 1000 - this.frameMs) * 0.05;
      this.fps += (1 / dt - this.fps) * 0.05;
      this.adaptResolution(dt);
    }
    try {
      this.frameOnce(dt);
    } catch (err) {
      console.error(err);
      this.onFatal(err instanceof Error ? err.message : String(err));
    }
  };

  private adaptWindow = 0;
  /** The frame times (ms) of the window being judged. */
  private readonly adaptFrames: number[] = [];
  /** Device tiers (`logic/governor.ts`): the governor's state, the calibration's frames (null when not running). */
  private gov = newGovernor('high+');
  private calFrames: number[] | null = null;
  private calClock = 0;
  private calibrationDone = false;
  /** The run report's frame times and the lowest render scale reached. */
  private readonly runFrames = new FrameHistogram();
  private runMinScale = 1;
  private device: ReturnType<typeof deviceReport> | null = null;

  /**
   * Dynamic resolution and the device-tier governor: every two seconds of play the frames are judged against the
   * tier's budget. The render scale steps down when many frames are slow (never below 0.6) and back up after a clean
   * stretch; with Auto quality the tier steps down once the scale is at its floor and the frames stay over budget, and
   * up after a long stretch with room to spare. Tiers hold still through a defense hold, a horde or an extraction.
   * Only active while playing and never on the dev hooks.
   */
  private adaptResolution(dt: number): void {
    if (this.state !== 'playing' || this.devFrozen) return;
    const ms = dt * 1000;
    this.runFrames.add(ms);
    this.adaptFrames.push(ms);
    this.adaptWindow += dt;
    if (this.calFrames) {
      this.calClock += dt;
      // the first two seconds (spawns, late shader compiles) are left out
      if (this.calClock > 2) this.calFrames.push(ms);
      if (this.calClock >= 2 + GOVERNOR.calibrate) {
        const to = calibrate(summarize(this.calFrames, this.settings.quality), this.settings.quality, QUALITY_TIERS[this.gov.ceiling]!);
        this.calFrames = null;
        this.setTier(to);
        if (this.settings.qualityAuto) saveTier(this.settings.quality);
      }
    }
    if (this.adaptWindow < GOVERNOR.window) return;
    const window = summarize(this.adaptFrames, this.settings.quality);
    this.adaptWindow = 0;
    this.adaptFrames.length = 0;
    const { state, action } = governorStep(this.gov, {
      window,
      tier: this.settings.quality,
      renderScale: this.renderer.renderScale,
      busy: this.calFrames !== null || this.tierHold(),
      auto: this.settings.qualityAuto,
    });
    this.gov = state;
    if (action === 'scale-down') this.renderer.setRenderScale(this.renderer.renderScale - 0.1);
    else if (action === 'scale-up') this.renderer.setRenderScale(this.renderer.renderScale + 0.05);
    else if (action === 'tier-down' || action === 'tier-up') this.setTier(QUALITY_TIERS[tierIndex(this.settings.quality) + (action === 'tier-up' ? 1 : -1)]!);
    this.runMinScale = Math.min(this.runMinScale, this.renderer.renderScale);
  }

  /** A defense hold, an extraction (its horde) or the Forge's last stand is on: the graphics tier holds still. */
  private tierHold(): boolean {
    const s = this.session;
    return s.defense.status === 'active' || extractionInProgress(s.extraction) || (this.forge?.assaultOn ?? false);
  }

  /** How this run ran, for its report (null when too few frames were drawn to say). */
  private runPerf(): RunPerf | null {
    const f = this.runFrames;
    if (f.frames < 60) return null;
    return { quality: this.settings.quality, fps: f.avgFps, p95Ms: f.p95, renderScale: this.runMinScale };
  }

  /** One frame of whatever the current state needs, followed by rendering. */
  frameOnce(dt: number): void {
    const t0 = performance.now();
    switch (this.state) {
      case 'playing':
        if (!this.devFrozen) this.simulate(Math.min(dt, 0.05) * this.devTimeScale);
        break;
      case 'ending':
        this.simulateEnding(Math.min(dt, 0.05));
        break;
      case 'title':
        this.updateTitle(Math.min(dt, 0.05));
        break;
      default:
        // paused / results: the world is frozen, only rendering continues. A co-op session cannot freeze, though:
        // a paused host would stop the game for everyone, and a paused guest would be untouchable.
        if (this.state === 'paused' && this.coop.live && !this.devFrozen) this.simulate(Math.min(dt, 0.05));
        break;
    }
    this.touch?.setActive(this.state === 'playing' && this.playerAlive());
    const t1 = performance.now();
    const shadows = QUALITY[this.settings.quality].shadows && (this.state === 'playing' || this.state === 'ending');
    this.renderer.setShadowPass(shadows);
    this.renderer.showView = this.state !== 'title';
    this.sakura?.frame(dt);
    this.renderer.render(dt, this.time);
    const t2 = performance.now();
    this.perf.sim += (t1 - t0 - this.perf.sim) * 0.05;
    this.perf.render += (t2 - t1 - this.perf.render) * 0.05;
  }

  /** Smoothed CPU milliseconds per frame spent simulating and submitting the render (dev / QA metric). */
  readonly perf = { sim: 0, render: 0 };

  /**
   * Co-op: the session is running and this player is still on the title screen (they joined late, or the owner just
   * started): put them in it. A phone plays at once; a computer lands in the world paused, one click from mouse
   * control (the browser only captures the mouse inside a click). The world runs for them meanwhile.
   */
  private coopAutoJoin(): void {
    if (this.mode !== 'coop' || this.state !== 'title' || this.pendingLock !== 'none') return;
    if (!this.coop.canDeploy || this.coop.role === 'none' || (this.account.online && !this.account.user)) return;
    this.audio.init(); // stays quiet until the first click on some browsers
    this.resetRun(false);
    this.dirty = true;
    if (this.touchMode) {
      this.noLock = true;
      this.beginPlaying(true);
      return;
    }
    this.beginPlaying(true);
    this.pause('lost');
    const spectating = this.coop.role === 'spectator';
    this.menus.showResumePrompt(spectating ? 'THE SESSION IS LIVE. CLICK TO START WATCHING.' : 'YOUR SQUAD HAS DEPLOYED. CLICK TO JOIN THE FIGHT.', true, {
      title: 'SESSION LIVE',
      note: 'You are already in the session: the operation runs while this is open.',
    });
  }

  private updateTitle(dt: number): void {
    this.time += dt;
    // a late join that happened while the page was still loading
    if (this.mode === 'coop' && Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.coopAutoJoin();
    this.zenv.time = this.time;
    this.zenv.player.alive = false;
    this.zombies.update(dt, this.zenv, false);
    this.cards.update(dt);
    this.level.update(dt, this.time, this.renderer.viewportHeight, this.renderer.camera.fov);
    this.fx.update(dt, this.renderer.camera);
    this.entities.update(dt, this.time);
    this.mission.update(0, this.renderer.camera, this.time); // no clock advance: dt = 0 keeps the mission idle
    this.weapons.update(dt, EMPTY_WEAPON_INPUT);
    // slow, restrained camera drift over the checkpoint
    const st = this.level.data.playerStart;
    this.player.yaw = st.yaw + Math.sin(this.time * 0.11) * 0.07;
    this.player.pitch = 0.03 + Math.sin(this.time * 0.13) * 0.012;
    this.updateCamera(dt);
    this.audio.update(dt);
  }

  // ---------------------------------------------------------------------------------------------
  // simulation
  // ---------------------------------------------------------------------------------------------

  /** Advance the simulation by `dt` seconds (already clamped). Also used by the dev harness for deterministic stepping. */
  simulate(dt: number, edgesOverride?: Edges): void {
    if (!(dt > 1e-6)) return; // first frame after resume / lock acquisition: nothing to advance
    const s = this.session;
    const alive = this.playerAlive();
    const edges = edgesOverride ?? this.input.consume(dt);
    if (this.flying) {
      this.simulateRoam(dt, edges);
      return;
    }
    this.time += dt;

    // ---- toggles ----
    if (edges.map) this.hud.toggleTacticalMap();

    // ---- look ----
    if (alive) {
      const zoomScale = Math.tan((this.renderer.camera.fov * Math.PI) / 360) / Math.tan(((this.renderer.hFov > 0 ? 60 : 60) * Math.PI) / 360);
      const sens = this.settings.sensitivity;
      const slow = this.touchMode && this.settings.aimAssist ? this.aimAssist(dt, edges) : 1;
      this.player.look(
        mouseToRadians(edges.mouseDX * slow, sens, Math.min(1, zoomScale)),
        mouseToRadians(edges.mouseDY * slow, sens, Math.min(1, zoomScale)) * (this.settings.invertY ? -1 : 1),
      );
    }

    // ---- movement ----
    const control: PlayerControl = {
      forward: this.input.forward,
      strafe: this.input.strafe,
      sprintHeld: this.input.sprint,
      jumpPressed: edges.jump,
      crouchPressed: edges.crouch,
      ads: this.weapons.adsAmount,
      weaponMoveMul: (this.weapons.def?.moveMul ?? 1) * (this.sakura?.moveMul ?? 1), // the Sakura District: an idol's song drags at you
      noSprint: this.weapons.blocksSprint,
      frozen: !alive,
    };
    this.player.update(dt, control);
    // mutual push with the horde (the player yields less)
    this.zombies.pushPlayer(this.player.x, this.player.z, this.pushOut, this.player.y);
    if (this.pushOut.x !== 0 || this.pushOut.z !== 0) {
      const p = { x: this.player.x + this.pushOut.x, z: this.player.z + this.pushOut.z };
      this.level.world.resolveCircle(p, PLAYER.radius, this.player.y + PLAYER.stepHeight, this.player.y + this.player.height, 3);
      this.player.x = p.x;
      this.player.z = p.z;
    }
    if (!this.player.onGround || this.player.horizontalSpeed < 0.05) this.player.unstick();
    this.clampToBounds();
    if (alive) this.stairwells(dt);

    // ---- weapons ----
    const auto = this.touchMode && this.settings.autoFire && alive && !this.interaction.panelOpen ? this.autoFire(dt) : 0;
    const winput: WeaponInput = {
      fire: this.input.fire || auto > 0,
      firePressed: edges.firePressed || auto > 1,
      ads: this.input.ads,
      reloadPressed: edges.reload,
      slot: this.interaction.panelOpen ? null : edges.slot1 ? 0 : edges.slot2 ? 1 : null,
      wheel: edges.wheel,
      grenadePressed: edges.grenade,
      platePressed: edges.plate,
      locked: !alive || this.hud.tacticalMapOpen && false,
      mouseDX: edges.mouseDX,
      mouseDY: edges.mouseDY,
    };
    this.weapons.update(dt, winput);

    // ---- interactions ----
    this.io = this.interaction.update(dt, edges, this.input.interactHeld);

    // ---- health regeneration ----
    s.sinceDamage += dt;
    if (alive && !this.mission.insideHazard) s.vitals.health = regenHealth(s.vitals.health, s.sinceDamage, dt, this.asylum?.maxHealth ?? this.sakura?.maxHealth); // Asylum loop / the Sakura District's altar: perks raise the max

    // ---- mission ----
    // co-op free roam has no mission; a co-op story run shows the simulation's (the clock comes in its reports)
    this.mission.update(this.coop.live && !this.coop.story ? 0 : dt, this.renderer.camera, this.time);

    // ---- enemies ----
    this.updateEnemies(dt, alive);
    this.cards.update(dt);
    this.squad.update(dt);
    this.forge?.update(dt);
    this.sakura?.update(dt);
    if (this.coop.live) this.coop.update(dt);

    // ---- world ----
    this.grenades.update(dt);
    this.entities.update(dt, this.time);
    this.powerups.update(dt, this.time);
    this.barricades?.update(dt);
    this.asylum?.update(dt); // Asylum loop
    this.level.update(dt, this.time, this.renderer.viewportHeight, this.renderer.camera.fov);
    this.fx.update(dt, this.renderer.camera);

    // ---- camera, audio, HUD ----
    this.updateCamera(dt);
    this.updateAudio(dt, alive);
    this.updateHud(dt);
  }

  /**
   * Free roam: fly through the district with nothing at stake. No collision, no damage, no clock; the infected
   * only idle. Movement follows the view, so looking up and pushing forward climbs.
   */
  private simulateRoam(dt: number, edges: Edges): void {
    this.time += dt;
    const p = this.player;
    const sens = this.settings.sensitivity;
    p.look(mouseToRadians(edges.mouseDX, sens, 1), mouseToRadians(edges.mouseDY, sens, 1) * (this.settings.invertY ? -1 : 1));
    const speed = (this.input.sprint ? FREE_ROAM.fastSpeed : FREE_ROAM.speed) * dt;
    const f = this.input.forward;
    const st = this.input.strafe;
    const cp = Math.cos(p.pitch);
    const lift = (this.input.jumpHeld ? 1 : 0) - (this.input.crouchHeld ? 1 : 0);
    p.x += (-Math.sin(p.yaw) * cp * f + Math.cos(p.yaw) * st) * speed;
    p.z += (-Math.cos(p.yaw) * cp * f - Math.sin(p.yaw) * st) * speed;
    p.y = Math.max(0, Math.min(FREE_ROAM.ceiling, p.y + (Math.sin(p.pitch) * f + lift) * speed));
    p.vx = p.vy = p.vz = 0;
    p.onGround = false;
    this.clampToBounds();

    const z = this.zenv;
    z.time = this.time;
    z.player.x = p.x;
    z.player.y = p.y;
    z.player.z = p.z;
    z.player.eyeY = p.eyeY();
    z.player.alive = false;
    if (this.coop.live) {
      this.coop.updateEnemies(dt);
      this.coop.update(dt);
    } else {
      this.zombies.update(dt, z, false);
    }
    this.cards.update(dt);
    this.mission.update(0, this.renderer.camera, this.time); // dt = 0: the clock never starts
    this.entities.update(dt, this.time);
    this.level.update(dt, this.time, this.renderer.viewportHeight, this.renderer.camera.fov);
    this.fx.update(dt, this.renderer.camera);
    this.weapons.update(dt, EMPTY_WEAPON_INPUT);
    this.updateCamera(dt);
    this.updateAudio(dt, true);
    this.touch?.update({ canUse: false, panelOpen: false, mapOpen: false });
  }

  /**
   * Touch play: find the infected nearest the crosshair and, if it is in plain view, turn the view a little toward
   * it. Returns the factor to slow the player's own look input by (1 = no change).
   */
  private aimAssist(dt: number, edges: Edges): number {
    const p = this.player;
    this.sinceLook = edges.mouseDX !== 0 || edges.mouseDY !== 0 ? 0 : this.sinceLook + dt;
    const range = Math.min(AIM_ASSIST.range, this.weapons.def?.maxRange ?? AIM_ASSIST.range);
    const targets = this.assistTargets;
    let n = 0;
    for (const z of this.zombies.zombies) {
      if (!z.active || z.dormant) continue;
      const dx = z.x - p.x;
      const dz = z.z - p.z;
      if (dx * dx + dz * dz > range * range) continue;
      let t = targets[n];
      if (!t) {
        t = { x: 0, y: 0, z: 0, r: 0 };
        targets[n] = t;
      }
      // upper chest: a safe centre of mass that still leaves the head for the player to find
      t.x = z.x;
      t.y = z.def.height * 0.68;
      t.z = z.z;
      t.r = z.def.radius;
      n++;
    }
    if (n === 0) return 1;
    const view = this.assistView;
    view.x = p.x;
    view.y = p.eyeY();
    view.z = p.z;
    view.yaw = p.yaw;
    view.pitch = p.pitch;
    const pick = pickTarget(view, targets, n, range, this.assistPick);
    if (pick.index < 0) return 1;
    const t = targets[pick.index]!;
    // never help the player aim at something behind a wall
    if (this.level.world.segmentBlocked(view.x, view.y, view.z, t.x, t.y, t.z, 'shots')) return 1;
    const engaged = this.input.fire || this.sinceLook < 0.4 || this.input.forward !== 0 || this.input.strafe !== 0;
    const a = assistFor(pick, t.r, view.pitch, dt, engaged, this.input.fire, this.assistOut);
    if (a.dyaw !== 0 || a.dpitch !== 0) {
      p.yaw = wrapAngle(p.yaw + a.dyaw);
      p.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, p.pitch + a.dpitch));
    }
    return a.slow;
  }

  /**
   * Touch play, when the player has turned it on: is the crosshair resting on an infected in plain view?
   * Returns 0 for no, 1 to hold the trigger, 2 to also pull it afresh this frame (single-shot weapons).
   */
  private autoFire(dt: number): number {
    const p = this.player;
    const cp = Math.cos(p.pitch);
    const dx = -Math.sin(p.yaw) * cp;
    const dy = Math.sin(p.pitch);
    const dz = -Math.cos(p.yaw) * cp;
    const ex = p.x;
    const ey = p.eyeY();
    const ez = p.z;
    const range = Math.min(55, this.weapons.def?.maxRange ?? 55);
    const hit = this.zombies.raycast(ex, ey, ez, dx, dy, dz, range);
    const clear = hit !== null && !this.level.world.segmentBlocked(ex, ey, ez, hit.x, hit.y, hit.z, 'shots');
    this.autoPulse -= dt;
    if (!clear) {
      this.autoOnTarget = 0;
      return 0;
    }
    // a short beat on target first, so sweeping past an enemy does not waste a round
    this.autoOnTarget += dt;
    if (this.autoOnTarget < 0.09) return 0;
    if (this.autoPulse <= 0) {
      this.autoPulse = 0.16;
      return 2;
    }
    return 1;
  }

  /** Seconds before a stairwell can take the player again (so coming out never sends them straight back). */
  private stairwellCd = 0;
  private passFadeEl: HTMLDivElement | null = null;

  /**
   * Walking into a stairwell's doorway (`floors.ts`): a moment of black, then out at its other end - down into the
   * underground or back up to the street - with the squad close behind.
   */
  private stairwells(dt: number): void {
    const fl = this.level.floors;
    if (!fl.hasFloors) return;
    this.stairwellCd = Math.max(0, this.stairwellCd - dt);
    if (this.stairwellCd > 0) return;
    const p = this.player;
    const area = fl.areaAt(p.x, p.y, p.z);
    const link = fl.stairwellAt(area, p.x, p.z, 0.9);
    if (!link) return;
    const out = fl.exitOf(link, area);
    this.stairwellCd = 1.5;
    this.fadeThroughBlack(0.45);
    p.teleport(out.x, out.z, out.yaw);
    this.squad.regroupAt(out.x, out.z, out.yaw, out.area);
    this.audio.play('step_concrete', { priority: 1, volume: 0.7 });
  }

  /** Black for a moment, fading back in (a stairwell, a train). */
  fadeThroughBlack(seconds: number): void {
    if (!this.passFadeEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;background:#000;pointer-events:none;opacity:0;z-index:2147482000;transition:opacity 0.18s linear';
      document.body.appendChild(el);
      this.passFadeEl = el;
    }
    const el = this.passFadeEl;
    el.style.transition = 'none';
    el.style.opacity = '1';
    // force the style to apply before fading back
    void el.offsetWidth;
    el.style.transition = `opacity ${seconds}s ease-out`;
    el.style.opacity = '0';
  }

  private clampToBounds(): void {
    const b = this.level.data.worldBounds;
    const m = 1.0;
    this.player.x = Math.max(b.minX + m, Math.min(b.maxX - m, this.player.x));
    this.player.z = Math.max(b.minZ + m, Math.min(b.maxZ - m, this.player.z));
  }

  private updateEnemies(dt: number, alive: boolean): void {
    const p = this.player;
    const z = this.zenv;
    z.time = this.time;
    z.player.x = p.x;
    z.player.y = p.y;
    z.player.z = p.z;
    z.player.eyeY = p.eyeY();
    z.player.alive = alive;
    z.player.sprinting = p.sprinting;
    z.player.yaw = p.yaw;

    // flow field toward the player: refreshed when the player has moved or periodically, spread over a few frames so a
    // big map never stalls one (the infected follow the previous field until the new one is in). Co-op: the
    // simulation's infected chase the players, so this client needs none.
    this.flowTimer -= dt;
    if (this.coop.live) {
      // nothing
    } else if (this.flow.busy) {
      if (this.flow.advance(FLOW_SLICE_MS)) {
        this.flowGoalX = this.flowNextX;
        this.flowGoalZ = this.flowNextZ;
      }
    } else if (this.flowTimer <= 0) {
      const moved = Math.hypot(p.x - this.flowGoalX, p.z - this.flowGoalZ);
      if (moved > ZOMBIE_AI.flowMoveThreshold || this.flowTimer < -1.5) {
        // the first field of a run is wanted at once; after that, a slice a frame
        const first = this.flowGoalX > 1e8;
        if (this.flow.begin(p.x, p.z, GAMEPLAY_FIELD_RANGE)) {
          this.flowNextX = p.x;
          this.flowNextZ = p.z;
          if (this.flow.advance(first ? Infinity : FLOW_SLICE_MS)) {
            this.flowGoalX = p.x;
            this.flowGoalZ = p.z;
          }
        }
        this.flowTimer = ZOMBIE_AI.flowInterval;
      } else {
        this.flowTimer = 0.1;
      }
    }
    if (this.coop.live) {
      this.coop.updateEnemies(dt);
      return;
    }
    const boarding = this.endingKind === 'board';
    this.zombies.update(dt, z, alive && !boarding, this.squad.envs(z));
    if (alive && !boarding) {
      const s = this.session;
      const ex = s.extraction;
      this.zombies.director(
        dt,
        {
          elapsed: s.elapsed,
          playerX: p.x,
          playerZ: p.z,
          playerYaw: p.yaw,
          playerEyeY: p.eyeY(),
          region: this.playerRegion(),
          phase: escalationPhase(s.elapsed, this.mission.clock), // the Asylum's clock runs longer
          quality: this.settings.quality,
          defenseActive: s.defense.status === 'active',
          // the Forge's last stand brings its own waves to the Hearth (`forge/assault.ts`)
          extractionElapsed: extractionInProgress(ex) && ex.calledAt !== null && !this.forge ? s.elapsed - ex.calledAt : null,
          // the Forge: the director stands down for the assault, and after the burnout nothing more comes
          paused: this.forge?.quietDirector ?? false,
        },
        z,
        this.rng,
      );
      // sprinting is loud
      if (p.sprinting) this.zombies.emitNoise(p.x, p.z, ZOMBIE_AI.sprintHearing * 0.6);
    }
  }

  /** The infected's flow field is recomputed on the next frame (a door opened or shut: Asylum loop). */
  invalidateFlow(): void {
    this.flow.cancel();
    this.flowGoalX = this.flowGoalZ = 1e9;
    this.flowTimer = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // damage & kills
  // ---------------------------------------------------------------------------------------------

  private zombieHurt(amount: number, sx: number, sz: number, kind: AttackKind, knock: number): void {
    if (!this.playerAlive() || this.endingKind === 'board') return;
    this.hurtPlayer(amount, sx, sz, {});
    const p = this.player;
    const dx = p.x - sx;
    const dz = p.z - sz;
    const d = Math.hypot(dx, dz) || 1;
    p.vx += (dx / d) * knock;
    p.vz += (dz / d) * knock;
    this.lastBlow = { x: dx / d, z: dz / d, power: knock, at: this.time };
    if (kind !== 'melee') this.shake(0.5);
    this.audio.play('zombie_claw_hit', { priority: 3, volume: 0.9 });
    p.kickPitch += (this.settings.reducedMotion ? 0.01 : 0.03) * (kind === 'melee' ? 1 : 2);
  }

  hurtPlayer(amount: number, srcX: number | null, srcZ: number | null, opts: { ignoreArmor?: boolean; toxic?: boolean } = {}): void {
    if (!this.playerAlive() || this.endingKind === 'board' || this.flying) return;
    const s = this.session;
    const mul = opts.toxic ? 1 : REGIONS[this.playerRegion()].damageMul;
    const res = applyDamageToPlayer(s.vitals, amount * mul, { ignoreArmor: opts.ignoreArmor });
    s.sinceDamage = 0;
    if (opts.toxic) {
      if (this.time - this.lastToxicEvent > 0.5) {
        this.lastToxicEvent = this.time;
        this.hud.event({ type: 'damage', amount: 6, toxic: true });
      }
    } else if (srcX !== null && srcZ !== null) {
      const p = this.player;
      const dx = srcX - p.x;
      const dz = srcZ - p.z;
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      const rx = Math.cos(p.yaw);
      const rz = -Math.sin(p.yaw);
      this.hud.event({ type: 'damage', angle: Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz), amount: res.healthLost + res.armorLost });
    } else {
      this.hud.event({ type: 'damage', amount: res.healthLost + res.armorLost });
    }
    if (!opts.toxic && this.time - this.lastHurtSound > 0.35) {
      this.lastHurtSound = this.time;
      this.audio.play('player_hurt', { priority: 3, volume: 0.8 });
    }
    if (res.dead && !this.asylum?.secondWind()) this.onPlayerDied(); // Asylum loop: SECOND WIND gets you up once
  }

  /** Caught in a blast: hurt, and shoved away from it (with a hop) in proportion to how close it was. */
  private blastPlayer(amount: number, x: number, z: number, closeness: number): void {
    if (!this.playerAlive() || this.endingKind === 'board' || this.flying) return;
    const p = this.player;
    const dx = p.x - x;
    const dz = p.z - z;
    const d = Math.hypot(dx, dz) || 1;
    const push = RAGDOLL.playerBlastPush * closeness;
    p.vx += (dx / d) * push;
    p.vz += (dz / d) * push;
    if (closeness > 0.25) {
      p.vy = Math.max(p.vy, RAGDOLL.playerBlastHop * closeness);
      p.onGround = false;
    }
    this.lastBlow = { x: dx / d, z: dz / d, power: push * 1.6, at: this.time };
    this.hurtPlayer(amount, x, z, {});
  }

  private onPlayerDied(): void {
    if (this.session.ended) return;
    // the body goes where the blow sent it
    const blow = this.time - this.lastBlow.at < 0.5 ? this.lastBlow : { x: 0, z: 0, power: 0, at: 0 };
    const cam = this.deathCam;
    const p = this.player;
    cam.x = p.x;
    cam.y = p.eyeY();
    cam.z = p.z;
    const power = Math.min(14, blow.power);
    cam.vx = p.vx * 0.5 + blow.x * (1.2 + power * 0.7);
    cam.vz = p.vz * 0.5 + blow.z * (1.2 + power * 0.7);
    cam.vy = 0.6 + power * 0.35;
    // fall sideways, away from the blow's side of the view
    const right = blow.x * Math.cos(p.yaw) - blow.z * Math.sin(p.yaw);
    cam.roll = 0;
    cam.rollV = (right >= 0 ? 1 : -1) * (1.6 + power * 0.25);
    cam.pitch = 0;
    cam.pitchV = -0.6 - power * 0.06;
    this.audio.play('player_death', { priority: 3 });
    this.asylum?.onPlayerDown(); // Asylum loop: perks are lost
    this.weapons.cancelActions();
    this.interaction.closePanel(false);
    if (this.coop.live) {
      this.coop.onLocalDeath(); // not the end: a teammate can pick them up
      return;
    }
    this.endRun('defeat', this.session.extraction.phase === 'landed' ? 'Killed before boarding the helicopter' : 'Killed in action');
  }

  private onZombieKilled(z: Zombie, head: boolean): void {
    if (this.forge?.noReward) return; // the Forge's burnout and its sentry pay nobody
    if (this.squad.allyShooting) {
      // an ally's kill: it still counts for the contract, but it is not the player's
      if (z.isBoss) this.mission.onWardenKilled();
      return;
    }
    const s = this.session;
    s.stats.kills++;
    if (this.powerups.nuking) return; // a nuke's kills count, but pay nothing and drop nothing (the nuke pays)
    if (head) s.stats.headshots++;
    const region = this.level.regionAt(z.x, z.z);
    const cash = Math.round(killReward(z.def, head, region) * this.powerups.cashMul); // double points
    addCash(s.inv, cash);
    this.hud.event({ type: 'cash', amount: cash });
    this.feed(`+$${cash}  ${z.tag ? `${z.tag.toUpperCase()} (INFECTED)` : z.def.name.toUpperCase()}${head ? '  HEADSHOT' : ''}`, head ? 'good' : 'normal');
    // supply drops
    const def = z.def;
    if (!z.isBoss && this.rng.chance(def.dropChance * REGIONS[region].dropMul)) {
      const r = this.rng.f();
      const kind = r < 0.65 ? 'ammo' : r < 0.78 ? 'plate' : 'grenade';
      this.entities.spawnPickup(kind, z.x, z.z);
    }
    this.powerups.onKill(z);
    if (z.isBoss && !this.coop.live) this.mission.onWardenKilled();
  }

  /** True while the explosion light is lent to a rocket in flight. */
  private rocketLit = false;

  /** A rocket's motor lights its way, on the explosion light while no blast needs it (no light is ever added mid-run). */
  private rocketGlow(at: { x: number; y: number; z: number } | null): void {
    const l = this.renderer.explosionLight;
    if (at) {
      if (!this.rocketLit && l.intensity > 1) return; // a blast is fading: it keeps the light
      this.rocketLit = true;
      l.position.set(at.x, at.y, at.z);
      l.intensity = 28;
    } else if (this.rocketLit) {
      this.rocketLit = false;
      l.intensity = 0;
    }
  }

  private onExplosion(x: number, y: number, z: number): void {
    this.rocketLit = false;
    const r = this.renderer;
    r.explosionLight.position.set(x, y + 1, z);
    r.explosionLight.intensity = 900;
    const start = performance.now();
    const fade = (): void => {
      const k = 1 - (performance.now() - start) / 260;
      r.explosionLight.intensity = Math.max(0, 900 * k * k);
      if (k > 0) requestAnimationFrame(fade);
      else r.explosionLight.intensity = 0;
    };
    requestAnimationFrame(fade);
    const d = Math.hypot(x - this.player.x, z - this.player.z);
    this.shake(Math.max(0, 0.9 - d / 20));
    this.hud.event({ type: 'flash', color: '#ffb060', strength: Math.max(0, 0.5 - d / 16) });
    this.zombies.emitNoise(x, z, 45);
  }

  // ---------------------------------------------------------------------------------------------
  // ending
  // ---------------------------------------------------------------------------------------------

  beginBoarding(): void {
    if (this.endingKind !== 'none') return;
    this.endingKind = 'board';
    this.endingT = 0;
    this.state = 'ending';
    this.input.setEnabled(false);
    this.weapons.cancelActions();
    this.interaction.closePanel(false);
    this.cineFrom.set(this.player.x, this.player.eyeY(), this.player.z);
    this.weapons.hidden = true;
    this.hud.setVisible(false);
    this.hud.toggleTacticalMap(false);
  }

  endRun(outcome: 'victory' | 'defeat', reason: string): void {
    const s = this.session;
    if (s.ended) return;
    if (outcome === 'victory') this.squad.onExtracted();
    if (outcome === 'victory' && this.tale) this.sakura?.completeStory(this.tale);
    s.ended = { outcome, reason, at: s.elapsed };
    this.mission.endAudio();
    const stats = buildStats(s, outcome, reason, this.mission.contractsDone());
    this.pendingResults = { stats, outcome };
    if (outcome === 'defeat') {
      this.endingKind = 'death';
      this.endingT = 0;
      this.state = 'ending';
      this.input.setEnabled(false);
      this.hud.toggleTacticalMap(false);
      this.audio.play('defeat_sting', { priority: 3 });
    } else {
      // the Forge: a won run ends on the ending card and the reveal (after the boarding cinematic)
      this.revealPending = this.mapId === 'forge' && !!this.forge && !this.flying;
      // victory: the boarding cinematic is already running
      if (this.endingKind !== 'board') {
        this.endingKind = 'board';
        this.endingT = 0;
        this.state = 'ending';
        this.input.setEnabled(false);
      }
      this.audio.play('victory_sting', { priority: 3 });
    }
  }

  private simulateEnding(dt: number): void {
    this.endingT += dt;
    this.time += dt;
    if (this.endingKind === 'reveal') {
      // the Forge's ending card and reveal: the world holds still around it (fx, level animations), then the results
      this.level.update(dt, this.time, this.renderer.viewportHeight, this.renderer.camera.fov);
      this.fx.update(dt, this.renderer.camera);
      this.entities.update(dt, this.time);
      this.updateCamera(dt);
      this.updateAudio(dt, false);
      if (this.reveal && !this.reveal.update(dt) && this.pendingResults) this.showResults();
      return;
    }
    const boarding = this.endingKind === 'board';
    // the world keeps moving: enemies, fx, helicopter
    this.updateEnemies(dt, this.playerAlive() && !boarding);
    this.cards.update(dt);
    if (boarding) this.mission.update(dt, this.renderer.camera, this.time);
    this.grenades.update(dt);
    this.level.update(dt, this.time, this.renderer.viewportHeight, this.renderer.camera.fov);
    this.fx.update(dt, this.renderer.camera);
    this.entities.update(dt, this.time);
    this.weapons.update(dt, EMPTY_WEAPON_INPUT);
    this.updateCamera(dt);
    this.updateAudio(dt, false);
    this.updateHud(dt);
    const fadeStart = this.endingKind === 'board' ? 2.4 : 1.3;
    const total = this.endingKind === 'board' ? 3.4 : 2.6;
    this.fadeEl.style.opacity = String(Math.max(0, Math.min(1, (this.endingT - fadeStart) / (total - fadeStart))));
    // the Forge: a won run goes on to the ending card and the reveal before the results
    if (boarding && this.revealPending && this.pendingResults && this.endingT >= total && this.forge) {
      this.revealPending = false;
      this.endingKind = 'reveal';
      this.endingT = 0;
      this.fadeEl.style.opacity = '0';
      const voice = this.squad.aliveNames()[0]?.toUpperCase() ?? 'ANYA';
      this.reveal = new RevealCinematic(this, this.forge.ending(), voice);
      this.reveal.start(this.deps.uiRoot);
      return;
    }
    if (this.endingT >= total && this.pendingResults) this.showResults();
  }

  // ---------------------------------------------------------------------------------------------
  // co-op hooks (called by CoopSession)
  // ---------------------------------------------------------------------------------------------

  /** The session was won or lost: straight to the results, with no death or boarding cinematic. */
  finishCoop(outcome: 'victory' | 'defeat', reason: string): void {
    const s = this.session;
    if (s.ended || this.state === 'results' || this.state === 'title') return;
    if (outcome === 'victory' && this.tale) this.sakura?.completeStory(this.tale);
    s.ended = { outcome, reason, at: s.elapsed };
    this.pendingResults = { stats: buildStats(s, outcome, reason, 0), outcome };
    this.input.setEnabled(false);
    this.weapons.cancelActions();
    this.interaction.closePanel(false);
    this.audio.play(outcome === 'victory' ? 'victory_sting' : 'defeat_sting', { priority: 3 });
    this.showResults();
    this.coopUi.refresh();
  }

  /** A teammate picked this player up. */
  coopRevived(by: string): void {
    this.session.vitals.health = COOP.reviveHealth;
    this.session.sinceDamage = 0;
    this.banner('BACK ON YOUR FEET', `${by} revived you`, 'good', 3);
    this.feed(`REVIVED BY ${by.toUpperCase()}`, 'good');
    this.audio.play('pickup_plate', { priority: 2 });
  }

  /** This player made it aboard: the boarding cinematic, then the results. */
  coopBoarded(): void {
    this.beginBoarding();
    this.endRun('victory', 'Extracted');
  }

  /** Cash the whole squad earns together (a survivor freed, an ember, the squad's extraction bonus). */
  coopCash(cash: number, title: string, plates: number): void {
    if (cash > 0) {
      addCash(this.session.inv, cash);
      this.hud.event({ type: 'cash', amount: cash });
    }
    if (plates > 0) this.session.inv.plates = Math.min(PLAYER.maxPlates, this.session.inv.plates + plates);
    this.feed(`${title}  +$${cash}${plates > 0 ? `  +${plates} ARMOR PLATES` : ''}`, 'good');
    if (plates > 0 || /COMPLETE/.test(title)) {
      this.banner(title, `+$${cash}${plates > 0 ? `   +${plates} ARMOR PLATES` : ''}`, 'good', 4);
      this.audio.play('contract_complete', { priority: 3 });
    } else this.audio.play('pickup_cash', { priority: 2 });
  }

  /** The simulation confirmed one of this player's kills (and may leave a pickup where the body fell). */
  creditKill(cash: number, name: string, head: boolean, x = NaN, z = NaN, dropChance = 0): void {
    const s = this.session;
    s.stats.kills++;
    if (head) s.stats.headshots++;
    addCash(s.inv, cash);
    this.hud.event({ type: 'cash', amount: cash });
    this.hud.event({ type: 'hit', head, kill: true });
    this.feed(`+$${cash}  ${name.toUpperCase()}${head ? '  HEADSHOT' : ''}`, head ? 'good' : 'normal');
    if (Number.isFinite(x) && Number.isFinite(z) && this.rng.chance(dropChance * REGIONS[this.level.regionAt(x, z)].dropMul)) {
      const r = this.rng.f();
      this.entities.spawnPickup(r < 0.65 ? 'ammo' : r < 0.78 ? 'plate' : 'grenade', x, z);
    }
  }

  /** An infected on the host struck this player. */
  takeRemoteHit(amount: number, sx: number, sz: number, knock: number): void {
    this.zombieHurt(amount, sx, sz, 'melee', knock);
  }

  /** Kicked, the host left, or the connection dropped. */
  coopClosed(reason: string): void {
    if (this.mode !== 'coop') return;
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'ending') this.quitToTitle();
    this.coopUi.open();
    void reason; // shown by the lobby
  }

  private showResults(): void {
    const pr = this.pendingResults!;
    this.pendingResults = null;
    this.tracker.end(pr.outcome, pr.stats.reason, pr.stats, this.runPerf());
    this.state = 'results';
    this.menus.setModeInfo(this.modeInfo());
    this.hud.setVisible(false);
    this.hud.toggleTacticalMap(false);
    this.audio.stopAll();
    this.audio.resume();
    this.ambience = null;
    this.heartbeat = null;
    let isNew = false;
    if (pr.outcome === 'victory') {
      const cand: BestRun = { time: pr.stats.timeSurvived, kills: pr.stats.kills, headshots: pr.stats.headshots, cash: pr.stats.cashEarned, date: new Date().toISOString().slice(0, 10) };
      if (isBetterRun(cand, this.best)) {
        isNew = true;
        this.best = cand;
        saveBest(cand);
      }
    }
    this.menus.showResults(pr.stats, this.best, isNew);
    if (document.pointerLockElement === this.deps.canvas) document.exitPointerLock();
  }

  // ---------------------------------------------------------------------------------------------
  // camera, audio, HUD
  // ---------------------------------------------------------------------------------------------

  private updateCamera(dt: number): void {
    const cam = this.renderer.camera;
    if (this.state === 'ending' && this.endingKind === 'reveal' && this.reveal) {
      // the Forge's reveal directs the camera itself
      this.reveal.camera(cam);
      this.culler?.update(dt, cam.position);
      this.renderer.updateFov();
      cam.getWorldDirection(this.camDir);
      this.listenerFwd.x = this.camDir.x;
      this.listenerFwd.y = this.camDir.y;
      this.listenerFwd.z = this.camDir.z;
      return;
    }
    const p = this.player;
    let ex = p.x;
    let ey = p.eyeY();
    let ez = p.z;
    let pitch = p.pitch + p.kickPitch;
    let yaw = p.yaw + p.kickYaw;
    let roll = 0;
    if (!this.settings.reducedMotion) {
      // gentle strafe lean
      const target = -this.input?.strafe * 0.012 * Math.min(1, p.moveAmount * 1.6);
      this.roll += ((Number.isFinite(target) ? target : 0) - this.roll) * Math.min(1, dt * 8);
      roll = this.roll;
      if (p.landing > 0) ey -= 0.05 * p.landing;
    }
    if (this.shakeAmt > 0.001) {
      const k = this.shakeAmt * 0.02;
      pitch += (Math.random() * 2 - 1) * k;
      yaw += (Math.random() * 2 - 1) * k;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
    // co-op: down (or bled out) - the view lies on the ground, tipped over, until someone comes
    if (this.state !== 'ending' && this.coop.live && this.coop.life !== 1 && this.coop.life !== 4) {
      ey = 0.45;
      pitch = Math.min(pitch, 0.15);
      roll = this.settings.reducedMotion ? 0.15 : 0.42;
    }
    if (this.state === 'ending') {
      if (this.endingKind === 'death') {
        // ragdoll camera: thrown by the killing blow, bouncing off walls, rolling onto its side on the ground
        const c = this.deathCam;
        const step = Math.min(dt, 1 / 30);
        c.vy -= RAGDOLL.gravity * step;
        c.pos.x = c.x + c.vx * step;
        c.pos.z = c.z + c.vz * step;
        if (this.level.world.resolveCircle(c.pos, 0.25, Math.max(0.05, c.y - 0.3), c.y + 0.1, 2)) {
          c.vx *= -0.2;
          c.vz *= -0.2;
        }
        c.x = c.pos.x;
        c.z = c.pos.z;
        c.y += c.vy * step;
        const floor = 0.3;
        if (c.y <= floor) {
          c.y = floor;
          c.vy = c.vy < -3 ? -c.vy * 0.25 : 0;
          const k = Math.exp(-6 * step);
          c.vx *= k;
          c.vz *= k;
        }
        const restRoll = (c.rollV >= 0 ? 1 : -1) * 1.35;
        c.roll += (restRoll - c.roll) * Math.min(1, step * Math.abs(c.rollV) * 1.4);
        c.pitch += (-0.3 - c.pitch) * Math.min(1, step * Math.abs(c.pitchV) * 2.5);
        ex = c.x;
        ey = c.y;
        ez = c.z;
        pitch += this.settings.reducedMotion ? c.pitch * 0.5 : c.pitch;
        roll = this.settings.reducedMotion ? c.roll * 0.4 : c.roll;
      } else if (this.endingKind === 'board') {
        const t = Math.min(1, this.endingT / 1.6);
        const e = t * t * (3 - 2 * t);
        this.mission.heliCabinWorld(this.cinePos);
        ex = this.cineFrom.x + (this.cinePos.x - this.cineFrom.x) * e;
        ey = this.cineFrom.y + (this.cinePos.y - this.cineFrom.y) * e;
        ez = this.cineFrom.z + (this.cinePos.z - this.cineFrom.z) * e;
        // look into the cabin, then out of the door as it lifts
        const heliYaw = this.mission.heliRoot.rotation.y;
        yaw = heliYaw - Math.PI / 2 * (1 - e) + yaw * (1 - e) * 0.0;
        pitch = pitch * (1 - e) - 0.05 * e;
      }
    }
    cam.position.set(ex, ey, ez);
    cam.rotation.set(pitch, yaw, roll, 'YXZ');
    this.culler?.update(dt, cam.position);
    this.renderer.updateFov();
    cam.getWorldDirection(this.camDir);
    this.listenerFwd.x = this.camDir.x;
    this.listenerFwd.y = this.camDir.y;
    this.listenerFwd.z = this.camDir.z;
  }

  private onFootstep(strength: number, sprinting: boolean, crouching: boolean): void {
    if (this.state !== 'playing') return;
    const indoor = this.stepSound.surfaceIndoor;
    const pos = { x: this.player.x, y: 0, z: this.player.z };
    const id = indoor ? 'step_indoor' : this.level.world.groundSurface(this.player.x, this.player.z) === 'dirt' ? 'step_dirt' : 'step_concrete';
    this.audio.play(id, { volume: strength * 0.7, rate: 0.92 + Math.random() * 0.16, priority: 0, pos });
    void sprinting;
    void crouching;
  }

  private updateAudio(dt: number, alive: boolean): void {
    const p = this.player;
    const cam = this.renderer.camera;
    this.audio.setListener({ x: cam.position.x, y: cam.position.y, z: cam.position.z }, this.listenerFwd, { x: 0, y: 1, z: 0 });
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 0.3;
      const hit = this.level.world.raycast(p.x, p.eyeY(), p.z, 0, 1, 0, 14, 'shots');
      const indoor = !!hit && hit.collider?.tag === 'roof';
      this.stepSound.surfaceIndoor = indoor;
      this.renderer.setIndoor(indoor);
      this.audio.setEnvironment(indoor ? 'indoor' : 'outdoor');
    }
    // low-health heartbeat
    const hp = this.session.vitals.health;
    if (alive && hp < 38) {
      if (!this.heartbeat || !this.heartbeat.active) this.heartbeat = this.audio.startLoop('heartbeat', { volume: 0.5 });
      this.heartbeat.setVolume(0.35 + 0.65 * (1 - hp / 38), 0.3);
    } else if (this.heartbeat) {
      this.heartbeat.stop(0.6);
      this.heartbeat = null;
    }
    this.audio.update(dt);
  }

  private updateHud(dt: number): void {
    const show = this.settings.showFps ? this.fps : null;
    const st = buildHudState(this, this.mission, this.cards, this.io, show);
    const md = buildMapDynamic(this, this.mission, this.cards, this.markers);
    if (this.coop.live) this.coop.decorateHud(st, md);
    else {
      this.squad.objectives(st.objectives);
      this.squad.markers(md.markers);
    }
    this.forge?.decorateHud(st, md);
    this.asylum?.decorateHud(st, md); // Asylum loop: max health with perks, doors and machines on the maps
    this.sakura?.decorateHud(st, md); // the Sakura District: the Thousand Lanterns, the ghost train, the altar's blessing
    this.hud.update(st, md, dt);
    this.touch?.update({ canUse: this.io.prompt !== null, panelOpen: this.io.panelOpen, mapOpen: this.hud.tacticalMapOpen });
  }

  // ---------------------------------------------------------------------------------------------
  // dev / test support (only wired up in dev builds by dev/testApi.ts)
  // ---------------------------------------------------------------------------------------------

  /** Start playing without pointer lock (automation). */
  devStartWithoutLock(fresh = true): void {
    this.audio.init();
    if (fresh && (this.dirty || this.mode === 'coop')) this.resetRun(false);
    this.dirty = true;
    this.noLock = true;
    this.beginPlaying(fresh);
  }

  get devFps(): number {
    return this.fps;
  }

  get devFrameMs(): number {
    return this.frameMs;
  }

  set timeScale(v: number) {
    this.devTimeScale = v;
  }

  get devNoLock(): boolean {
    return this.noLock;
  }

  get bestRun(): BestRun | null {
    return this.best;
  }

  get menusApi(): MenusApi {
    return this.menus;
  }

  get canvas(): HTMLCanvasElement {
    return this.deps.canvas;
  }

  get inputState(): Input {
    return this.input;
  }

  get renderInfo(): THREE.WebGLInfo {
    return this.renderer.renderer.info;
  }

  static readonly RENDER = RENDER;
  static readonly GRENADE = GRENADE;
}

const EMPTY_WEAPON_INPUT: WeaponInput = {
  fire: false,
  firePressed: false,
  ads: false,
  reloadPressed: false,
  slot: null,
  wheel: 0,
  grenadePressed: false,
  platePressed: false,
  locked: true,
  mouseDX: 0,
  mouseDY: 0,
};
