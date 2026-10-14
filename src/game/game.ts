/**
 * Game: owns every subsystem, the main loop, the pointer-lock / pause state machine, restart, and end-of-run flow.
 *
 * States: 'title' (live backdrop) -> 'playing' <-> 'paused' -> 'ending' (death cam / boarding cinematic) -> 'results'.
 * The simulation only advances in 'playing' and 'ending'. dt is clamped, so pausing / tab switches never produce a jump.
 */
import * as THREE from 'three';
import { createAudioEngine } from '../audio/engine';
import type { AudioEngineApi, LoopHandle } from '../audio/ids';
import { CardRuntime } from '../cards/cardRuntime';
import { CoopSession } from '../coop/coop';
import { CoopUi } from '../coop/lobbyUi';
import { DEFAULT_SETTINGS, FREE_ROAM, GRENADE, PLAYER, QUALITY, REGIONS, RENDER, ZOMBIE_AI } from '../config';
import { Zombie, type AttackKind, type ZombieEnv } from '../enemies/zombie';
import { ZombieManager } from '../enemies/zombieManager';
import { createZombieFactory, type ZombieFactoryExt } from '../enemies/zombieRig';
import { createFx } from '../fx/fx';
import type { FxApi } from '../fx/fxTypes';
import { applyDamageToPlayer, regenHealth } from '../logic/damage';
import { addCash, killReward } from '../logic/economy';
import { escalationPhase } from '../logic/mission';
import { extractionInProgress } from '../logic/extraction';
import { Rng } from '../logic/rng';
import { type Account, RunTracker, loadAccount, logout, ping, reportPlayer, reportVisit } from '../net/account';
import { AIM_ASSIST, assistFor, pickTarget, wrapAngle, type AssistPick, type AssistResult, type AssistTarget, type AssistView } from '../player/aimAssist';
import { Input, type Edges } from '../player/input';
import { enterFullscreenLandscape, isTouchDevice } from '../player/touch';
import { mouseToRadians, Player, type PlayerControl } from '../player/player';
import { checkCapabilities, GameRenderer } from '../render/renderer';
import { hasStoredSettings, isBetterRun, loadBest, loadMode, loadSettings, saveBest, saveMode, saveSettings } from '../storage';
import type { BestRun, GameMode, MissionStats, Region, Settings } from '../types';
import { createHud } from '../ui/hud';
import type { HudApi, HudEvent, MapMarker } from '../ui/hudTypes';
import { createMenus } from '../ui/menus';
import { createTouchControls, type TouchControlsApi } from '../ui/touchControls';
import type { MenusApi } from '../ui/hudTypes';
import { GrenadeSystem } from '../weapons/grenades';
import { createViewmodels } from '../weapons/viewmodels';
import type { ViewmodelSet } from '../weapons/viewmodelTypes';
import { WeaponSystem, type WeaponInput } from '../weapons/weaponSystem';
import { buildLevel, type Level } from '../world/level';
import { createMaterialLib, type MaterialLib } from '../world/materials';
import { createGrenadeModel } from '../world/models';
import { FlowField } from '../world/nav';
import type { GameCtx } from './ctx';
import { Entities } from './entities';
import { buildHudState, buildMapDynamic } from './hudBridge';
import { Interaction, type InteractionOutput } from './interaction';
import { MissionRuntime } from './missionRuntime';
import { buildStats, newSession, type Session } from './session';

export type GameState = 'boot' | 'title' | 'playing' | 'paused' | 'ending' | 'results';

export interface GameDeps {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

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
  private coopUi!: CoopUi;
  /** What DEPLOY starts; chosen on the title screen and fixed for the run. */
  mode: GameMode = 'standard';
  account: Account = { online: false, user: null, admin: false, banned: false, banReason: '', cards: {}, loginUrl: '' };
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
  private readonly touchMode = isTouchDevice();
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
  private endingKind: 'death' | 'board' | 'none' = 'none';
  private pendingResults: { stats: MissionStats; outcome: 'victory' | 'defeat' } | null = null;
  private flowTimer = 0;
  private flowGoalX = 1e9;
  private flowGoalZ = 1e9;
  private envTimer = 0;
  private lastHurtSound = -1;
  private lastToxicEvent = -1;
  private heartbeat: LoopHandle | null = null;
  private ambience: LoopHandle | null = null;
  private stepSound: { surfaceIndoor: boolean } = { surfaceIndoor: false };
  private readonly camDir = new THREE.Vector3();
  private readonly listenerFwd = { x: 0, y: 0, z: -1 };
  private readonly pushOut = { x: 0, z: 0 };
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
    // Phones start on the lightest preset; once the player has saved settings their choice is respected.
    if (this.touchMode && !hasStoredSettings()) this.settings.quality = 'low';
    this.best = loadBest();
    this.mode = loadMode();
    if (this.touchMode) document.documentElement.classList.add('ds-touch');

    this.menus = createMenus({
      onDeploy: () => this.requestStart(false),
      onResume: () => this.requestResume(),
      onRestart: () => this.requestStart(true),
      onQuitToTitle: () => this.quitToTitle(),
      onSettingsChange: (s) => this.applySettings(s, true),
      onModeChange: (m) => this.setMode(m),
      onLogout: () => void logout().then(() => window.location.reload()),
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

    this.menus.showLoading(0.25, 'BUILDING DISTRICT');
    await nextFrame();
    this.level = buildLevel(this.mats);
    this.worldRoot.add(this.level.root);
    this.renderer.lightPool.setLamps(this.level.lights);

    this.menus.showLoading(0.6, 'PREPARING EFFECTS AND AUDIO');
    await nextFrame();
    this.fx = createFx();
    this.worldRoot.add(this.fx.root);
    this.audio = createAudioEngine();
    this.audio.setMasterVolume(this.settings.masterVolume);

    this.menus.showLoading(0.72, 'RIGGING INFECTED');
    await nextFrame();
    this.zombieFactory = createZombieFactory();
    this.zombieFactory.prewarm();
    this.viewmodels = createViewmodels();

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
    this.zenv.field = this.flow;
    this.zenv.audio = this.audio;
    this.zenv.fx = this.fx;

    this.zombies = new ZombieManager(this.zombieFactory, this.level);
    this.worldRoot.add(this.zombies.root);
    this.zombies.onKill = (z, head) => this.onZombieKilled(z, head);
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
        hurtPlayerExplosion: (amount, x, z) => this.hurtPlayer(amount, x, z, {}),
        onExplosion: (x, y, z) => this.onExplosion(x, y, z),
        playerVelocity: () => ({ x: this.player.vx, z: this.player.vz }),
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
    this.interaction = new Interaction(this, this.entities, this.mission, this.cards);
    this.coop = new CoopSession(this);
    this.coopUi = new CoopUi(uiRoot, this.coop, {
      userId: () => this.account.user?.id ?? null,
      isAdmin: () => this.account.admin,
      canShow: () => this.mode === 'coop' && (this.state === 'title' || this.state === 'results'),
      deploy: () => this.requestStart(this.state === 'results'),
      playing: () => this.coop.live && (this.state === 'playing' || this.state === 'paused'),
      report: reportPlayer,
    });

    this.hud = createHud();
    this.hud.mount(uiRoot);
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

    this.menus.showLoading(0.95, 'FINALISING');
    await nextFrame();
    this.resetRun(true);
    this.renderer.resize();
    // warm shaders / pipelines before the title appears
    this.frameOnce(1 / 60);
    this.menus.hideLoading();
    this.state = 'title';
    this.hud.setVisible(false);
    this.menus.setModeInfo({ mode: this.mode, cards: this.cards.collection() });
    this.menus.showTitle(this.best);
    // an invite link (/?room=CODE) goes straight to the lobby; the admin's "watch unseen" link joins hidden
    const invite = new URLSearchParams(window.location.search);
    const code = invite.get('room');
    if (code && this.account.user) {
      this.setMode('coop');
      this.coopUi.open(code);
      if (invite.get('watch') === 'admin' && this.account.admin) void this.coop.room.join(code, 'spectator', true);
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
    const qualityChanged = s.quality !== this.settings.quality;
    this.settings = { ...s };
    if (persist) saveSettings(this.settings);
    this.renderer.hFov = s.fov;
    this.renderer.updateFov();
    this.audio.setMasterVolume(s.masterVolume);
    if (qualityChanged || !persist) {
      this.renderer.setQuality(s.quality);
      const q = QUALITY[s.quality];
      this.fx.setQuality(q.particleScale, q.decalScale);
    }
    this.menus.setSettings(this.settings);
  }

  /** Title screen only: switch what DEPLOY starts. The backdrop is a pristine run, so only the carriers change. */
  setMode(mode: GameMode): void {
    if (this.state !== 'title') return;
    this.mode = mode;
    if (mode === 'coop') {
      this.coopUi.open();
    } else {
      saveMode(mode);
      this.coop.leave();
      this.coopUi.close();
    }
    this.cards.reset(mode === 'cards' || mode === 'roam', mode === 'roam');
    this.menus.setModeInfo({ mode, cards: this.cards.collection() });
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
    const roam = this.mode === 'roam' || spectating;
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
      this.tracker.start(this.mode, this.touchMode);
    }
    if (fresh || wasTitle) {
      this.audio.play('ui_deploy', { priority: 3 });
      if (!this.ambience || !this.ambience.active) this.ambience = this.audio.startLoop('ambience', { volume: 0.8, fadeIn: 2 });
      if (this.mode === 'coop') {
        if (!spectating) this.banner('CO-OP  //  WAVE SURVIVAL', 'Hold out for ten waves. Anyone who goes down returns when the wave is cleared.', 'info', 5);
      } else if (this.mode === 'cards') this.banner('OPERATION DEAD SIGNAL', 'Restore the relay. Kill the Warden. Recover the cards. Extract.', 'info', 4.5);
      else if (!roam) this.banner('OPERATION DEAD SIGNAL', 'Contain the outbreak. Restore the relay. Kill the Warden. Extract.', 'info', 4.5);
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
    if (reason === 'menu' || !this.touchMode) this.menus.showPause();
    else this.menus.showResumePrompt('PAUSED - TAP TO RESUME', true);
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
    this.menus.setModeInfo({ mode: this.mode, cards: this.cards.collection() });
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
    this.tracker.end('abandoned', 'Left the run', buildStats(this.session, 'defeat', 'Left the run', this.mission.contractsDone()), keepalive);
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
    this.heartbeat?.stop(0.2);
    this.heartbeat = null;
    if (!initial) {
      this.audio.stopAll();
      this.ambience = null;
    }

    const st = this.level.data.playerStart;
    this.player.teleport(st.x, st.z, st.yaw);
    this.player.stamina = PLAYER.maxStamina;
    this.player.staminaExhausted = false;
    this.weapons.reset();
    if (this.mode !== 'coop') this.zombies.populate(this.rng);
    this.cards.reset(this.mode === 'cards' || this.mode === 'roam', this.mode === 'roam');
    if (this.mode === 'coop') this.coop.begin();
    this.weapons.hidden = this.mode === 'roam' || this.coop.role === 'spectator';
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
  private adaptSlow = 0;
  private adaptFrames = 0;
  private adaptCooldown = 4;

  /**
   * Dynamic resolution: if a large share of frames miss ~50 fps over a two-second window the render scale steps down
   * (never below 0.6); after a long clean stretch it steps back up. Only active while playing and never on the dev hooks.
   */
  private adaptResolution(dt: number): void {
    if (this.state !== 'playing' || this.devFrozen) return;
    this.adaptWindow += dt;
    this.adaptFrames++;
    if (dt > 0.022) this.adaptSlow++;
    if (this.adaptWindow < 2) return;
    const slowShare = this.adaptSlow / Math.max(1, this.adaptFrames);
    this.adaptCooldown -= this.adaptWindow;
    if (this.adaptCooldown <= 0) {
      if (slowShare > 0.25 && this.renderer.renderScale > 0.61) {
        this.renderer.setRenderScale(this.renderer.renderScale - 0.1);
        this.adaptCooldown = 3;
      } else if (slowShare === 0 && this.renderer.renderScale < 0.99) {
        this.renderer.setRenderScale(this.renderer.renderScale + 0.05);
        this.adaptCooldown = 12;
      }
    }
    this.adaptWindow = 0;
    this.adaptSlow = 0;
    this.adaptFrames = 0;
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
    this.renderer.render(dt, this.time);
    const t2 = performance.now();
    this.perf.sim += (t1 - t0 - this.perf.sim) * 0.05;
    this.perf.render += (t2 - t1 - this.perf.render) * 0.05;
  }

  /** Smoothed CPU milliseconds per frame spent simulating and submitting the render (dev / QA metric). */
  readonly perf = { sim: 0, render: 0 };

  private updateTitle(dt: number): void {
    this.time += dt;
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
    if (this.mode === 'roam' || this.coop.role === 'spectator') {
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
      weaponMoveMul: this.weapons.def?.moveMul ?? 1,
      noSprint: this.weapons.blocksSprint,
      frozen: !alive,
    };
    this.player.update(dt, control);
    // mutual push with the horde (the player yields less)
    this.zombies.pushPlayer(this.player.x, this.player.z, this.pushOut);
    if (this.pushOut.x !== 0 || this.pushOut.z !== 0) {
      const p = { x: this.player.x + this.pushOut.x, z: this.player.z + this.pushOut.z };
      this.level.world.resolveCircle(p, PLAYER.radius, this.player.y + PLAYER.stepHeight, this.player.y + this.player.height, 3);
      this.player.x = p.x;
      this.player.z = p.z;
    }
    if (!this.player.onGround || this.player.horizontalSpeed < 0.05) this.player.unstick();
    this.clampToBounds();

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
    if (alive && !this.mission.insideHazard) s.vitals.health = regenHealth(s.vitals.health, s.sinceDamage, dt);

    // ---- mission ----
    this.mission.update(this.coop.live ? 0 : dt, this.renderer.camera, this.time); // co-op runs on waves, not the mission clock

    // ---- enemies ----
    this.updateEnemies(dt, alive);
    this.cards.update(dt);
    if (this.coop.live) this.coop.update(dt);

    // ---- world ----
    this.grenades.update(dt);
    this.entities.update(dt, this.time);
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
      this.coop.updateEnemies(dt, false);
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

  private clampToBounds(): void {
    const b = this.level.data.bounds;
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

    // flow field toward the player: refreshed when the player has moved or periodically
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      const moved = Math.hypot(p.x - this.flowGoalX, p.z - this.flowGoalZ);
      if (moved > ZOMBIE_AI.flowMoveThreshold || this.flowTimer < -1.5) {
        if (this.flow.compute(p.x, p.z)) {
          this.flowGoalX = p.x;
          this.flowGoalZ = p.z;
        }
        this.flowTimer = ZOMBIE_AI.flowInterval;
      } else {
        this.flowTimer = 0.1;
      }
    }
    if (this.coop.live) {
      this.coop.updateEnemies(dt, alive);
      return;
    }
    const boarding = this.endingKind === 'board';
    this.zombies.update(dt, z, alive && !boarding);
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
          phase: escalationPhase(s.elapsed),
          quality: this.settings.quality,
          defenseActive: s.defense.status === 'active',
          extractionElapsed: extractionInProgress(ex) && ex.calledAt !== null ? s.elapsed - ex.calledAt : null,
          paused: false,
        },
        z,
        this.rng,
      );
      // sprinting is loud
      if (p.sprinting) this.zombies.emitNoise(p.x, p.z, ZOMBIE_AI.sprintHearing * 0.6);
    }
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
    if (kind !== 'melee') this.shake(0.5);
    this.audio.play('zombie_claw_hit', { priority: 3, volume: 0.9 });
    p.kickPitch += (this.settings.reducedMotion ? 0.01 : 0.03) * (kind === 'melee' ? 1 : 2);
  }

  hurtPlayer(amount: number, srcX: number | null, srcZ: number | null, opts: { ignoreArmor?: boolean; toxic?: boolean } = {}): void {
    if (!this.playerAlive() || this.endingKind === 'board' || this.mode === 'roam' || this.coop.role === 'spectator') return;
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
    if (res.dead) this.onPlayerDied();
  }

  private onPlayerDied(): void {
    if (this.session.ended) return;
    this.audio.play('player_death', { priority: 3 });
    this.weapons.cancelActions();
    this.interaction.closePanel(false);
    if (this.coop.live) {
      this.coop.onLocalDeath(); // not the end: the wave decides
      return;
    }
    this.endRun('defeat', this.session.extraction.phase === 'landed' ? 'Killed before boarding the helicopter' : 'Killed in action');
  }

  private onZombieKilled(z: Zombie, head: boolean): void {
    if (this.coop.live && this.coop.onKill(z, head)) return; // another player's kill: they are paid, not the host
    const s = this.session;
    s.stats.kills++;
    if (head) s.stats.headshots++;
    const region = this.level.regionAt(z.x, z.z);
    const cash = killReward(z.def, head, region);
    addCash(s.inv, cash);
    this.hud.event({ type: 'cash', amount: cash });
    this.feed(`+$${cash}  ${z.def.name.toUpperCase()}${head ? '  HEADSHOT' : ''}`, head ? 'good' : 'normal');
    // supply drops
    const def = z.def;
    if (!z.isBoss && this.rng.chance(def.dropChance * REGIONS[region].dropMul)) {
      const r = this.rng.f();
      const kind = r < 0.65 ? 'ammo' : r < 0.78 ? 'plate' : 'grenade';
      this.entities.spawnPickup(kind, z.x, z.z);
    }
    if (z.isBoss && !this.coop.live) this.mission.onWardenKilled();
  }

  private onExplosion(x: number, y: number, z: number): void {
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
    if (this.endingT >= total && this.pendingResults) this.showResults();
  }

  // ---------------------------------------------------------------------------------------------
  // co-op hooks (called by CoopSession)
  // ---------------------------------------------------------------------------------------------

  /** The session was won or lost: straight to the results, with no death or boarding cinematic. */
  finishCoop(outcome: 'victory' | 'defeat', reason: string): void {
    const s = this.session;
    if (s.ended || this.state === 'results' || this.state === 'title') return;
    s.ended = { outcome, reason, at: s.elapsed };
    this.pendingResults = { stats: buildStats(s, outcome, reason, 0), outcome };
    this.input.setEnabled(false);
    this.weapons.cancelActions();
    this.interaction.closePanel(false);
    this.audio.play(outcome === 'victory' ? 'victory_sting' : 'defeat_sting', { priority: 3 });
    this.showResults();
    this.coopUi.refresh();
  }

  /** Back on your feet at the insertion point (between waves, or when the host starts a new run). */
  revivePlayer(): void {
    const st = this.level.data.playerStart;
    this.session.vitals.health = PLAYER.maxHealth;
    this.session.vitals.armor = Math.max(this.session.vitals.armor, PLAYER.plateArmor);
    this.player.teleport(st.x, st.z, st.yaw);
    this.feed('BACK IN THE FIGHT', 'good');
  }

  /** The host confirmed one of this player's kills. */
  creditKill(cash: number, name: string, head: boolean): void {
    const s = this.session;
    s.stats.kills++;
    if (head) s.stats.headshots++;
    addCash(s.inv, cash);
    this.hud.event({ type: 'cash', amount: cash });
    this.hud.event({ type: 'hit', head, kill: true });
    this.feed(`+$${cash}  ${name.toUpperCase()}${head ? '  HEADSHOT' : ''}`, head ? 'good' : 'normal');
  }

  /** A wave objective was completed: the squad bonus. */
  grantBonus(cash: number, title: string): void {
    addCash(this.session.inv, cash);
    this.hud.event({ type: 'cash', amount: cash });
    this.banner('OBJECTIVE COMPLETE', `${title}  +$${cash}`, 'good', 4);
    this.feed(`OBJECTIVE COMPLETE  +$${cash}`, 'good');
    this.audio.play('contract_complete', { priority: 3 });
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
    this.tracker.end(pr.outcome, pr.stats.reason, pr.stats);
    this.state = 'results';
    this.menus.setModeInfo({ mode: this.mode, cards: this.cards.collection() });
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
    if (this.state === 'ending') {
      if (this.endingKind === 'death') {
        const t = Math.min(1, this.endingT / 0.9);
        ey = ey + (0.32 - ey) * (t * t * (3 - 2 * t));
        pitch += t * -0.35;
        roll = t * 0.6;
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
