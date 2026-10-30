/**
 * Mission runtime: contracts, extraction sequence (flare, helicopter, boarding), contamination surge, clock and
 * deadline, radio / banner scripting, and the data the HUD and maps need (objectives, markers, timers).
 */
import * as THREE from 'three';
import { MISSION, ZOMBIES } from '../config';
import type { LoopHandle } from '../audio/ids';
import type { FlareHandle } from '../fx/fxTypes';
import {
  activateDefense,
  allContractsComplete,
  claimDefenseReward,
  claimHuntReward,
  completeHunt,
  contractsCompleted,
  createDefense,
  updateDefense,
  updateHunt,
} from '../logic/contracts';
import { applyContractReward } from '../logic/economy';
import type { ExtractionPhase } from '../logic/extraction';
import {
  boardHelicopter,
  callExtraction,
  atLzOrRadio,
  canBoard,
  extractionInProgress,
  failExtraction,
  unlockExtraction,
  updateExtraction,
} from '../logic/extraction';
import { deadlineRemaining, escalationPhase, hazardRadius, isInsideHazard, missionClock, surgeActive, surgeStartTime, type MissionClock } from '../logic/mission';
import { AsylumNight } from '../asylum/nightRuntime';
import type { HudObjective, HudTimer, MapMarker } from '../ui/hudTypes';
import {
  createAreaMarker,
  createContaminationWall,
  createExtractionTerminal,
  createFlareModel,
  createHelicopter,
  createObjectiveBeam,
  type AreaMarker,
  type ContaminationWall,
  type HelicopterRig,
  type TerminalModel,
} from '../world/models';
import type { GameCtx } from './ctx';
import type { Entities } from './entities';
import type { MissionApi } from './interaction';
import { bumpRegion } from './session';
import { createDawnTrain, createExpress } from '../mujin/train';
import { TRACK_Z } from '../mujin/places';

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export class MissionRuntime implements MissionApi {
  readonly root = new THREE.Group();
  /** A briefing of its own for this run (the Sakura District's story missions), instead of the map's. */
  brief: (() => string | null) | null = null;
  private readonly areaMarker: AreaMarker;
  private readonly wall: ContaminationWall;
  private readonly beam: THREE.Object3D;
  private readonly terminal: TerminalModel;
  private readonly flareModel: THREE.Object3D;
  private readonly heli: HelicopterRig;
  private readonly heliLight: THREE.PointLight;
  private flare: FlareHandle | null = null;
  private heliLoop: LoopHandle | null = null;
  private flareLoop: LoopHandle | null = null;
  private gasLoop: LoopHandle | null = null;
  private sirenLoop: LoopHandle | null = null;
  private transmitterLoop: LoopHandle | null = null;
  private heliVisible = false;
  private heliPos = new THREE.Vector3();
  private heliYaw = 0;
  private heliRotor = 0;
  private heliDoor = 0;
  private departT = -1;
  private hazardR = 0;
  /** 0..1: the firestorm dying down after the Forge's burnout. */
  private calmT = 0;
  private hazardWasInside = false;
  private coughTimer = 0;
  private wasInsideDefense = true;
  private lastRegion = 'low';
  /**
   * Co-op: the relay belongs to the squad. The host decides its progress from everyone's positions; starting it is
   * a request (`requestRelay`) and nobody calls extraction - the session is won on waves.
   */
  shared = false;
  requestRelay: (() => void) | null = null;
  /**
   * Co-op story: the whole operation is the simulation's (contracts, extraction, the clock). This runtime only shows it:
   * `applyMission` takes its reports and plays the banners, the flare and the helicopter on each change; calling the
   * extraction and boarding are requests.
   */
  follow = false;
  requestCall: (() => void) | null = null;
  requestBoard: (() => void) | null = null;
  private tmp = new THREE.Vector3();
  private readonly lz;
  private readonly toLzDist: number;
  /** This run's deadline, black fog / surge and escalation timings (by map, and on the Sakura District by story). */
  clock: MissionClock;
  /** The Asylum only: the day / night cycle, the records, the Matron's hours (`asylum/nightRuntime.ts`). */
  readonly night: AsylumNight | null;
  /** The defense contract completed: on the Asylum the boiler house power is back (wire to the power switch here). */
  onPowerRestored: (() => void) | null = null;
  /** The Forge: the helicopter holds off (its countdown stops) while the reborn is loose. */
  holdExtraction: () => boolean = () => false;
  /** Besides the contracts, what the helicopter waits for (KAIKA: the bloom). */
  extractGate: () => boolean = () => true;
  /** The Forge after the burnout: the firestorm dies down and stops hurting. */
  calm: () => boolean = () => false;
  /**
   * MUJIN: no helicopter. The dawn train is the extraction (`mujin/train.ts`): nobody calls it (the station does,
   * `callNow`), a through express rushes past on track 2 first, then it pulls in on track 1 and opens its doors.
   * `onTrain` lets the station play each moment's sound and voice.
   */
  readonly train: boolean;
  private readonly express: THREE.Group | null;
  private readonly trainSaid = new Set<string>();
  onTrain: ((ev: 'express' | 'arrive' | 'doors' | 'depart') => void) | null = null;

  constructor(
    private readonly ctx: GameCtx,
    private readonly entities: Entities,
  ) {
    void this.entities;
    const data = ctx.level.data;
    this.train = data.id === 'mujin';
    this.clock = missionClock(data.id);
    this.night = data.id === 'asylum' ? new AsylumNight(ctx) : null;
    this.lz = data.extraction;
    this.toLzDist = Math.hypot(data.hazardCenter.x - this.lz.lzX, data.hazardCenter.z - this.lz.lzZ);
    ctx.worldRoot.add(this.root);
    this.root.name = 'Mission';

    this.areaMarker = createAreaMarker(data.defense.radius, 0x3ad0ff);
    this.areaMarker.root.position.set(data.defense.x, 0.06, data.defense.z);
    this.root.add(this.areaMarker.root);

    this.wall = createContaminationWall();
    this.wall.setCenter(data.hazardCenter.x, data.hazardCenter.z);
    this.wall.setIntensity(0);
    this.root.add(this.wall.root);

    this.beam = createObjectiveBeam(0xffc040);
    this.beam.position.set(this.lz.lzX, 0, this.lz.lzZ);
    this.beam.visible = false;
    this.root.add(this.beam);

    this.terminal = createExtractionTerminal(ctx.mats);
    this.terminal.root.position.set(this.lz.terminalX, 0, this.lz.terminalZ);
    this.terminal.root.rotation.y = this.lz.terminalYaw;
    this.root.add(this.terminal.root);

    this.flareModel = createFlareModel(ctx.mats);
    this.flareModel.visible = false;
    this.root.add(this.flareModel);

    this.heli = this.train ? createDawnTrain() : createHelicopter(ctx.mats);
    this.heli.root.visible = false;
    this.root.add(this.heli.root);
    this.express = this.train ? createExpress() : null;
    if (this.express) this.root.add(this.express);
    if (this.train) {
      // the station's bell stands where the relay would be, and nobody radios a train
      this.areaMarker.root.visible = false;
      this.terminal.root.visible = false;
    }
    this.heliLight = new THREE.PointLight(0xdfe9ff, 0, 42, 2);
    this.root.add(this.heliLight);
  }

  // ---------------------------------------------------------------------------------------------
  // MissionApi (interactions)
  // ---------------------------------------------------------------------------------------------

  transmitterPos(): { x: number; z: number } {
    const c = this.ctx.level.transmitter.console;
    return { x: c.x, z: c.z };
  }

  canActivateTransmitter(): boolean {
    return !this.train && this.ctx.session.defense.status === 'available';
  }

  activateTransmitter(): void {
    if (this.shared && this.requestRelay) {
      this.requestRelay();
      return;
    }
    this.beginDefense();
  }

  /** The uplink starts (solo: the player's hold; co-op: the host's word, on every client). */
  beginDefense(): void {
    const ctx = this.ctx;
    const s = ctx.session;
    if (!activateDefense(s.defense)) return;
    ctx.level.transmitter.setState('active');
    ctx.audio.play('defense_start', { priority: 3 });
    this.transmitterLoop = ctx.audio.startLoop('transmitter', { volume: 0.6, pos: { x: ctx.level.data.defense.x, y: 3, z: ctx.level.data.defense.z } });
    ctx.banner(ctx.level.data.text.defenseStart, this.shared ? 'Squad objective - keep at least one of you inside the marked area' : 'Hold the marked area until it completes', 'warn', 4.5);
    ctx.radio('COMMAND', this.shared ? 'Uplink initiated. One of you stays in that zone at all times - it counts for the whole squad.' : 'Uplink initiated. Stay inside the marked area. They will come for the signal.');
    ctx.feed('TRANSMITTER ACTIVATED', 'warn');
  }

  terminalPos(): { x: number; z: number } {
    return { x: this.lz.terminalX, z: this.lz.terminalZ };
  }

  terminalState(): 'locked' | 'available' | 'busy' {
    if (this.shared && !this.follow) return 'busy'; // co-op free roam: no extraction to call
    if (this.train) return 'busy'; // MUJIN: the station calls the dawn train itself
    const ph = this.ctx.session.extraction.phase;
    if (ph === 'locked') return 'locked';
    if (ph === 'available') return 'available';
    return 'busy';
  }

  callExtraction(): boolean {
    const ctx = this.ctx;
    const s = ctx.session;
    const p = ctx.player;
    // at the radio counts: it can stand a little outside the zone's circle
    const inLz = atLzOrRadio(p.x, p.z, this.lz);
    if (this.follow) {
      if (inLz && ctx.playerAlive()) this.requestCall?.();
      return false;
    }
    if (!callExtraction(s.extraction, s.elapsed, inLz, ctx.playerAlive())) return false;
    this.onCalled();
    return true;
  }

  /** MUJIN: the station calls the dawn train itself (nobody stands at a radio). */
  callNow(): void {
    const s = this.ctx.session;
    if (this.follow) return;
    if (callExtraction(s.extraction, s.elapsed, true, true)) this.onCalled();
  }

  /** The flare is lit at the radio and the bird is on its way. */
  private onCalled(): void {
    const ctx = this.ctx;
    if (this.train) {
      ctx.banner('THE DAWN TRAIN', 'The first train of the morning is coming - hold platform 1', 'warn', 5);
      ctx.feed('THE DAWN TRAIN IS COMING', 'warn');
      return;
    }
    this.terminal.setState('called');
    const f = this.terminal.flareLocal.clone();
    this.terminal.root.localToWorld(f);
    this.flare = ctx.fx.flare({ x: f.x, y: f.y, z: f.z });
    this.flareModel.position.copy(f);
    this.flareModel.visible = true;
    this.flareLoop = ctx.audio.startLoop('flare', { volume: 0.7, pos: { x: f.x, y: 0.5, z: f.z } });
    ctx.audio.play('flare_ignite', { pos: { x: f.x, y: 0.5, z: f.z }, priority: 3 });
    ctx.audio.play('radio_chirp', { priority: 3 });
    ctx.banner('EXTRACTION CALLED', 'Hold the landing zone - helicopter ETA 1:00', 'danger', 5);
    ctx.radio('COMMAND', "Bird is inbound. Hold the perimeter - everything nearby is heading your way.");
    ctx.feed('EXTRACTION REQUESTED', 'danger');
    this.beam.visible = true;
  }

  heliDoorPos(): { x: number; z: number } | null {
    if (!this.heliVisible) return null;
    const d = this.heli.doorLocal.clone();
    this.heli.root.localToWorld(d);
    return { x: d.x, z: d.z };
  }

  canBoard(): boolean {
    const door = this.heliDoorPos();
    if (!door) return false;
    const p = this.ctx.player;
    return canBoard(this.ctx.session.extraction, Math.hypot(door.x - p.x, door.z - p.z), this.ctx.playerAlive());
  }

  board(): boolean {
    const door = this.heliDoorPos();
    if (!door) return false;
    const p = this.ctx.player;
    if (this.follow) {
      if (this.canBoard()) this.requestBoard?.();
      return false;
    }
    if (!boardHelicopter(this.ctx.session.extraction, Math.hypot(door.x - p.x, door.z - p.z), this.ctx.playerAlive())) return false;
    this.ctx.audio.play('boarding', { priority: 3 });
    this.ctx.beginBoarding();
    return true;
  }

  /** World position of the helicopter cabin (cinematic camera target). */
  heliCabinWorld(out: THREE.Vector3): THREE.Vector3 {
    out.set(0.4, 1.3, 0.2);
    this.heli.root.localToWorld(out);
    return out;
  }

  get heliRoot(): THREE.Object3D {
    return this.heli.root;
  }

  // ---------------------------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------------------------

  reset(): void {
    const ctx = this.ctx;
    this.shared = false;
    this.follow = false;
    this.areaMarker.root.visible = !this.train;
    this.areaMarker.setProgress(0);
    this.areaMarker.setActive(false);
    this.wall.setIntensity(0);
    this.wall.setRadius(0);
    this.beam.visible = false;
    this.terminal.setState('idle');
    this.flareModel.visible = false;
    this.heli.root.visible = false;
    this.heliVisible = false;
    if (this.express) this.express.visible = false;
    this.trainSaid.clear();
    this.heliRotor = 0;
    this.heliDoor = 0;
    this.departT = -1;
    this.heliLight.intensity = 0;
    this.stopLoops();
    this.flare?.stop();
    this.flare = null;
    ctx.renderer.flareLight.intensity = 0;
    ctx.level.transmitter.setState('ready');
    ctx.level.transmitter.setProgress(0);
    ctx.level.spire.setSurge(false);
    this.hazardR = 0;
    this.calmT = 0;
    this.hazardWasInside = false;
    this.coughTimer = 0;
    this.wasInsideDefense = true;
    this.lastRegion = 'low';
    this.night?.reset();
  }

  private stopLoops(): void {
    for (const l of [this.heliLoop, this.flareLoop, this.gasLoop, this.sirenLoop, this.transmitterLoop]) l?.stop(0.3);
    this.heliLoop = this.flareLoop = this.gasLoop = this.sirenLoop = this.transmitterLoop = null;
  }

  /** Stop mission audio loops but keep visuals (results screen). */
  endAudio(): void {
    this.stopLoops();
  }

  // ---------------------------------------------------------------------------------------------
  // per-frame update
  // ---------------------------------------------------------------------------------------------

  update(dt: number, camera: THREE.Camera, time: number): void {
    const ctx = this.ctx;
    const s = ctx.session;
    const alive = ctx.playerAlive();
    const p = ctx.player;
    const ex = s.extraction;
    const data = ctx.level.data;

    if (!this.follow) s.elapsed += dt; // co-op: the simulation's clock arrives in its reports
    if (this.night) {
      // the Asylum: the light, the records, and the hunt kept closed until nightfall (before the hunt below)
      this.night.follow = this.follow;
      this.night.update(dt, time);
    }
    const region = ctx.playerRegion();
    bumpRegion(s, region);
    if (region !== this.lastRegion) {
      this.lastRegion = region;
      const names = data.text.regions;
      if (region === 'medium') ctx.banner('MEDIUM THREAT', names.medium, 'warn', 3);
      else if (region === 'high') ctx.banner('HIGH THREAT', names.high, 'danger', 3.5);
      else ctx.banner('LOW THREAT', names.low, 'info', 2.2);
    }

    // ---- defense contract ----
    const d = data.defense;
    const inside = Math.hypot(p.x - d.x, p.z - d.z) < d.radius;
    if (this.shared) {
      // the squad's relay is driven by the co-op session (sharedRelay)
    } else if (s.defense.status === 'active') {
      const done = updateDefense(s.defense, dt, inside, alive);
      ctx.level.transmitter.setProgress(s.defense.progress);
      this.areaMarker.setProgress(s.defense.progress);
      this.areaMarker.setActive(inside);
      if (!inside && this.wasInsideDefense && alive) {
        ctx.banner('LEAVING THE RELAY AREA', 'Uplink progress is draining - return to the marked zone', 'danger', 2.5);
        ctx.radio('COMMAND', "You're outside the relay zone. Get back in there.");
        ctx.audio.play('klaxon', { priority: 2, volume: 0.6 });
      }
      this.wasInsideDefense = inside;
      if (done) this.completeDefense();
    } else if (s.defense.status === 'available') {
      this.areaMarker.setActive(inside);
      this.areaMarker.setProgress(0);
    }
    this.areaMarker.update(dt, time);

    // ---- hunt contract ----
    if (!this.follow && dt > 0 && s.hunt.status === 'active') {
      // never unwinnable: a Warden who died uncredited completes it; one who is gone is back at his lair
      // (the Asylum's hunt is only `active` at night, so the Matron is never brought back by day)
      const b = ctx.zombies.boss;
      if (b && !b.alive) this.onWardenKilled();
      else if (!b) ctx.zombies.spawnWarden(ctx.rng);
    }
    const boss = ctx.zombies.boss;
    if (!this.follow && s.hunt.status === 'active' && boss && boss.alive) {
      const dist = Math.hypot(boss.x - p.x, boss.z - p.z);
      // out of the search area (drawn out by the fighting): reveal him so the marker follows him, not an empty compound
      const strayed = Math.hypot(boss.x - data.hunt.searchX, boss.z - data.hunt.searchZ) > data.hunt.searchRadius + 10;
      if (updateHunt(s.hunt, strayed ? 0 : dist, true)) {
        ctx.banner('TARGET IDENTIFIED', `${data.text.boss} - ${data.text.bossSighted}`, 'danger', 4.5);
        ctx.radio(data.text.bossRadio.from, data.text.bossRadio.text);
        ctx.audio.play('objective_ping', { priority: 2 });
      }
    }

    // ---- unlock extraction ----
    if (!this.follow && unlockExtraction(ex, allContractsComplete(s.defense, s.hunt) && this.extractGate())) this.onUnlocked();

    // ---- extraction sequence ----
    if (extractionInProgress(ex)) {
      if (!this.follow) for (const ev of updateExtraction(ex, this.holdExtraction() ? 0 : dt)) this.onExtractionEvent(ev);
      this.animateHelicopter(dt, time, camera);
    } else if (ex.phase === 'extracted' || ex.phase === 'failed') {
      this.animateHelicopter(dt, time, camera);
    }
    // flare light + audio
    if (this.flare) {
      const k = this.flare.intensity();
      const f = this.flareModel.position;
      ctx.renderer.flareLight.position.set(f.x, 1.2, f.z);
      ctx.renderer.flareLight.intensity = 26 * k;
      this.flare.setPosition({ x: f.x, y: f.y + 0.1, z: f.z });
    }
    this.terminal.update(dt, time);

    // ---- countdown ticks in the final seconds ----
    if (ex.phase === 'called' || ex.phase === 'inbound' || ex.phase === 'landing') {
      const sec = Math.ceil(ex.countdown);
      const key = `tick${sec}`;
      if (sec <= 10 && sec > 0 && !s.flags.has(key)) {
        s.flags.add(key);
        ctx.audio.play(sec <= 3 ? 'countdown_final' : 'countdown_tick', { priority: 2, volume: 0.7 });
      }
    }

    // ---- contamination ----
    this.updateHazard(dt, camera, time, alive);

    // ---- deadline (co-op: the simulation decides how the run ends) ----
    if (this.follow) {
      // nothing
    } else if (!extractionInProgress(ex) && ex.phase !== 'extracted' && ex.phase !== 'failed') {
      const left = deadlineRemaining(s.elapsed, this.clock);
      if (left <= 60 && !s.flags.has('deadline60') && !this.train) {
        s.flags.add('deadline60');
        ctx.banner('LAST CALL', 'The district seals in 60 seconds - call extraction', 'danger', 4);
        ctx.radio('COMMAND', 'One minute until the district is sealed. Call extraction now.');
        ctx.audio.play('klaxon', { priority: 3 });
      }
      if (left <= 0) ctx.endRun('defeat', this.train ? 'The night never ended' : 'The district was sealed before extraction was called');
    }
    if (!this.follow && ex.phase === 'failed' && !s.ended) ctx.endRun('defeat', this.train ? 'The dawn train left without you' : (ex.failReason ?? 'Extraction failed'));
    if (!this.follow && ex.phase === 'extracted' && !s.ended) ctx.endRun('victory', this.train ? 'Left on the dawn train' : 'Extracted');

    // ---- staged narrative beats ----
    if (s.elapsed > 4 && !s.flags.has('brief')) {
      s.flags.add('brief');
      ctx.radio('COMMAND', this.brief?.() ?? data.text.brief, 8);
      ctx.audio.play('contract_new', { priority: 3 });
    }
    void escalationPhase;
  }

  /**
   * Co-op relay, every client, every frame. `squadInside`: someone who is up stands in the zone. Only the host moves
   * the progress (`authority`); the others take it from the snapshots. Returns true on the frame it completes here.
   */
  sharedRelay(dt: number, time: number, squadInside: boolean, authority: boolean): boolean {
    const ctx = this.ctx;
    const s = ctx.session;
    const def = s.defense;
    let done = false;
    if (def.status === 'active') {
      if (authority) done = updateDefense(def, dt, squadInside, true);
      ctx.level.transmitter.setProgress(def.progress);
      this.areaMarker.setProgress(def.progress);
      this.areaMarker.setActive(squadInside);
      if (!squadInside && this.wasInsideDefense && ctx.playerAlive()) {
        ctx.banner('NOBODY IS AT THE RELAY', 'Uplink progress is draining - one of you get back in the zone', 'danger', 2.5);
        ctx.audio.play('klaxon', { priority: 2, volume: 0.6 });
      }
      this.wasInsideDefense = squadInside;
    } else {
      if (def.status === 'available') this.areaMarker.setProgress(0);
      this.areaMarker.setActive(squadInside);
    }
    this.areaMarker.update(dt, time);
    if (done) this.completeDefense();
    return done;
  }

  /** Both contracts are done: the LZ opens. */
  private onUnlocked(): void {
    const ctx = this.ctx;
    if (this.train) return; // the station says it (`mujin/runtime.ts`)
    const data = ctx.level.data;
    ctx.banner('EXTRACTION AVAILABLE', `Proceed to ${data.text.lz} and signal the helicopter`, 'good', 5);
    ctx.radio('COMMAND', `Both contracts complete. Move to ${data.text.lz} and radio the bird.`);
    ctx.audio.play('contract_complete', { priority: 3 });
    this.beam.visible = true;
    this.terminal.setState('idle');
  }

  /**
   * Co-op story: the simulation's view of the operation. Each change plays what the solo game plays at that moment
   * (the target identified, the hunt's reward claimed once, the LZ opening, the flare, the helicopter's approach,
   * touchdown and departure).
   */
  applyMission(m: { elapsed: number; huntStatus: 'available' | 'active' | 'complete'; huntIdentified: boolean; phase: ExtractionPhase; countdown: number; windowLeft: number; calledAt: number | null }): void {
    const ctx = this.ctx;
    const s = ctx.session;
    const data = ctx.level.data;
    s.elapsed = m.elapsed;
    // the Asylum's hunt is closed by day and opens at nightfall: follow the simulation (a finished hunt stays finished)
    if (m.huntStatus !== 'complete' && s.hunt.status !== 'complete') {
      s.hunt.status = m.huntStatus;
      if (m.huntStatus === 'available') s.hunt.identified = false;
    }
    if (m.huntIdentified && !s.hunt.identified && s.hunt.status === 'active') {
      s.hunt.identified = true;
      ctx.banner('TARGET IDENTIFIED', `${data.text.boss} - ${data.text.bossSighted}`, 'danger', 4.5);
      ctx.audio.play('objective_ping', { priority: 2 });
    }
    if (m.huntStatus === 'complete' && s.hunt.status !== 'complete') this.onWardenKilled();
    const ex = s.extraction;
    ex.countdown = m.countdown;
    ex.windowLeft = m.windowLeft;
    ex.calledAt = m.calledAt;
    if (m.phase === ex.phase) return;
    const order: ExtractionPhase[] = ['locked', 'available', 'called', 'inbound', 'landing', 'landed', 'boarding', 'extracted', 'failed'];
    const from = order.indexOf(ex.phase);
    const to = order.indexOf(m.phase);
    ex.phase = m.phase;
    // play every step that was passed (a late joiner can skip several at once)
    const passed = (p: ExtractionPhase): boolean => from < order.indexOf(p) && to >= order.indexOf(p) && m.phase !== 'failed';
    if (passed('available')) this.onUnlocked();
    if (passed('called')) this.onCalled();
    if (passed('inbound')) this.onExtractionEvent('heliVisible');
    if (passed('landing')) this.onExtractionEvent('landingStart');
    if (passed('landed')) this.onExtractionEvent('touchdown');
    if (m.phase === 'extracted') this.departT = 0; // the bird leaves with whoever is aboard
    if (m.phase === 'failed') this.onExtractionEvent('departed');
  }

  /** Co-op guest: the host's view of the relay. Starts and completes it here too (each player claims the reward once). */
  applySharedRelay(status: 'available' | 'active' | 'complete', progress: number): void {
    const ctx = this.ctx;
    const def = ctx.session.defense;
    if (status === 'available' && def.status !== 'available') {
      // the host started a fresh run
      Object.assign(def, createDefense());
      ctx.level.transmitter.setState('ready');
      ctx.level.transmitter.setProgress(0);
      this.transmitterLoop?.stop(0.3);
      this.transmitterLoop = null;
      return;
    }
    if (status !== 'available' && def.status === 'available') this.beginDefense();
    if (def.status === 'active') def.progress = progress;
    if (status === 'complete' && def.status === 'active') {
      def.status = 'complete';
      def.progress = 1;
      this.completeDefense();
    }
  }

  completeDefense(): void {
    const ctx = this.ctx;
    const s = ctx.session;
    ctx.level.transmitter.setState('done');
    ctx.level.transmitter.setProgress(1);
    this.transmitterLoop?.stop(0.6);
    this.transmitterLoop = null;
    ctx.audio.play('contract_complete', { priority: 3 });
    const r = claimDefenseReward(s.defense); // exactly once
    if (r) {
      const a = applyContractReward(s.inv, r);
      ctx.hudEvent({ type: 'cash', amount: a.cash });
      ctx.banner(ctx.level.data.text.defenseDone, `+$${a.cash.toLocaleString('en-US')}${a.plates ? `   +${a.plates} ARMOR PLATES` : ''}`, 'good', 5);
      ctx.feed(`CONTRACT COMPLETE  +$${a.cash}`, 'good');
      if (a.plates) ctx.feed(`+${a.plates} ARMOR PLATES`, 'good');
      ctx.radio('COMMAND', 'Relay restored. Nice work.');
    }
    this.areaMarker.setProgress(1);
    this.onPowerRestored?.();
    this.night?.powerRestored();
  }

  /** Called when the Warden dies. */
  onWardenKilled(): void {
    const ctx = this.ctx;
    const s = ctx.session;
    if (!completeHunt(s.hunt)) return;
    ctx.audio.play('contract_complete', { priority: 3 });
    const r = claimHuntReward(s.hunt); // exactly once
    if (r) {
      const a = applyContractReward(s.inv, r);
      ctx.hudEvent({ type: 'cash', amount: a.cash });
      ctx.banner(`${ctx.level.data.text.boss} IS DOWN`, `+$${a.cash.toLocaleString('en-US')}${a.plates ? `   +${a.plates} ARMOR PLATES` : ''}${a.grenades ? `   +${a.grenades} GRENADES` : ''}`, 'good', 5.5);
      ctx.feed(`CONTRACT COMPLETE  +$${a.cash}`, 'good');
      ctx.radio('COMMAND', `Confirmed kill. ${ctx.level.data.text.boss.toLowerCase().replace(/^the /, 'The ')} is down.`);
    }
  }

  private onExtractionEvent(ev: 'heliVisible' | 'landingStart' | 'touchdown' | 'departed' | 'extracted'): void {
    const ctx = this.ctx;
    switch (ev) {
      case 'heliVisible': {
        if (this.train) {
          this.heliVisible = true;
          ctx.banner('A THROUGH TRAIN', 'Stand back from the edge', 'warn', 3);
          break;
        }
        this.heliVisible = true;
        this.heli.root.visible = true;
        this.heliRotor = 0.6;
        const from = this.lz.heliFrom;
        this.heliPos.set(from.x, from.y, from.z);
        this.heliLoop = ctx.audio.startLoop('heli', { volume: 0.2, rate: 0.9, pos: { x: from.x, y: from.y, z: from.z }, fadeIn: 2 });
        ctx.banner('HELICOPTER INBOUND', 'Survive until touchdown', 'warn', 4);
        ctx.radio('PILOT', 'Bird on approach. Mark your position.');
        break;
      }
      case 'landingStart':
        if (!this.train) ctx.radio('PILOT', 'Coming in hot - clear the pad!');
        break;
      case 'touchdown':
        if (this.train) {
          ctx.banner('THE DOORS ARE OPEN', 'Get on the dawn train - platform 1', 'good', 5);
          break;
        }
        ctx.audio.play('heli_land', { pos: { x: this.lz.heliX, y: 0.3, z: this.lz.heliZ }, priority: 3 });
        ctx.banner('HELICOPTER LANDED', 'Reach the open door and BOARD NOW', 'good', 5);
        ctx.radio('PILOT', "We're on the ground - get aboard, now!");
        this.terminal.setState('done');
        break;
      case 'departed':
        this.departT = 0;
        ctx.banner(this.train ? 'THE DOORS CLOSED' : 'HELICOPTER DEPARTED', this.train ? 'The dawn train left without you' : 'You missed the extraction', 'danger', 4);
        break;
      case 'extracted':
        break;
    }
  }

  /** MUJIN's dawn train (and the express before it), instead of the helicopter. */
  private animateTrain(dt: number): void {
    const ex = this.ctx.session.extraction;
    const E = MISSION.extraction;
    const cd = ex.countdown;
    const stop = 4.5; // its door (the second car's) level with the platform's middle
    const z = TRACK_Z[0];
    const say = (ev: 'express' | 'arrive' | 'doors' | 'depart'): void => {
      if (this.trainSaid.has(ev)) return;
      this.trainSaid.add(ev);
      this.onTrain?.(ev);
    };
    let x = -400;
    let visible = false;
    const xp = this.express;
    if (xp) {
      // the express: the moment it is heard, until it is through
      const into = E.visibleAt - cd;
      const on = (ex.phase === 'inbound' || ex.phase === 'called') && into > 0 && into < 6.5;
      xp.visible = on;
      if (on) {
        say('express');
        xp.position.set(-190 + (into / 6.5) * 380, 0, TRACK_Z[1]);
      }
    }
    if (ex.phase === 'landing') {
      visible = true;
      say('arrive');
      const p = Math.min(1, Math.max(0, 1 - cd / E.landingDuration));
      const ease = 1 - (1 - p) * (1 - p);
      x = stop - (1 - ease) * 180;
    } else if (ex.phase === 'landed') {
      visible = true;
      x = stop;
      this.heliDoor = Math.min(1, this.heliDoor + dt / 1.2);
      say('doors');
    } else if (!this.follow && (ex.phase === 'boarding' || ex.phase === 'extracted')) {
      visible = true;
      const t = E.boardingCinematic - ex.boardLeft;
      this.heliDoor = Math.max(0, 1 - Math.max(0, t - 0.4) / 0.6);
      x = stop + Math.max(0, t - 1) ** 2 * 4;
      say('depart');
    } else if (ex.phase === 'failed' || ex.phase === 'extracted') {
      if (this.departT >= 0) {
        this.departT += dt;
        visible = this.departT < 12;
        this.heliDoor = Math.max(0, this.heliDoor - dt);
        x = stop + this.departT ** 2 * 4;
        say('depart');
      }
    }
    this.heli.root.visible = visible;
    this.heliPos.set(x, 0, z);
    this.heli.root.position.copy(this.heliPos);
    this.heli.root.rotation.y = 0;
    this.heli.update(dt, { rotor: 0, lights: true, doorOpen: this.heliDoor, pitch: 0, roll: 0 });
    this.heliLight.intensity = 0;
  }

  private animateHelicopter(dt: number, time: number, camera: THREE.Camera): void {
    const ctx = this.ctx;
    const ex = ctx.session.extraction;
    if (!this.heliVisible) return;
    if (this.train) {
      this.animateTrain(dt);
      return;
    }
    const from = this.lz.heliFrom;
    const hoverY = 20;
    const hover = new THREE.Vector3(this.lz.heliX + 6, hoverY, this.lz.heliZ + 4);
    let pitch = 0;
    let lightsOn = true;
    let target = this.heliPos;
    const cd = ex.countdown;
    if (ex.phase === 'inbound' || ex.phase === 'called') {
      const p = ease(clamp01(1 - (cd - MISSION.extraction.landingDuration) / (MISSION.extraction.visibleAt - MISSION.extraction.landingDuration)));
      target = this.tmp.set(from.x + (hover.x - from.x) * p, from.y + (hover.y - from.y) * p, from.z + (hover.z - from.z) * p);
      pitch = 0.15 * (1 - p);
      this.heliRotor = Math.min(1, this.heliRotor + dt * 0.3);
      const dx = hover.x - from.x;
      const dz = hover.z - from.z;
      this.heliYaw = Math.atan2(-dx, -dz);
    } else if (ex.phase === 'landing') {
      const p = ease(clamp01(1 - cd / MISSION.extraction.landingDuration));
      target = this.tmp.set(hover.x + (this.lz.heliX - hover.x) * p, hoverY * (1 - p), hover.z + (this.lz.heliZ - hover.z) * p);
      // settle heading toward the pad's orientation
      let dy = this.lz.heliYaw - this.heliYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.heliYaw += dy * Math.min(1, dt * 1.6);
      this.heliRotor = 1;
      const low = 1 - clamp01(target.y / 16);
      if (low > 0.05) ctx.fx.downwash({ x: this.lz.heliX, y: 0, z: this.lz.heliZ }, 13, low);
    } else if (ex.phase === 'landed') {
      target = this.tmp.set(this.lz.heliX, 0, this.lz.heliZ);
      this.heliYaw = this.lz.heliYaw;
      this.heliRotor = 0.85;
      this.heliDoor = Math.min(1, this.heliDoor + dt / 1.4);
      ctx.fx.downwash({ x: this.lz.heliX, y: 0, z: this.lz.heliZ }, 11, 0.35);
    } else if (!this.follow && (ex.phase === 'boarding' || ex.phase === 'extracted')) {
      // lift off with the player aboard
      const t = MISSION.extraction.boardingCinematic - ex.boardLeft;
      const lift = Math.max(0, t - 1.0);
      target = this.tmp.set(this.lz.heliX, Math.min(40, lift * lift * 2.2), this.lz.heliZ);
      this.heliRotor = 1;
      this.heliDoor = Math.max(0, 1 - Math.max(0, t - 0.6) / 0.8);
      ctx.fx.downwash({ x: this.lz.heliX, y: 0, z: this.lz.heliZ }, 13, clamp01(1 - target.y / 20));
    } else if (ex.phase === 'failed' || ex.phase === 'extracted') {
      if (this.departT >= 0) {
        this.departT += dt;
        const t = this.departT;
        target = this.tmp.set(this.lz.heliX + t * t * 3, t * t * 1.6, this.lz.heliZ - t * t * 3);
        this.heliDoor = Math.max(0, this.heliDoor - dt);
        this.heliRotor = 1;
        if (t > 8) this.heli.root.visible = false;
      }
    }
    if (target !== this.heliPos) this.heliPos.copy(target);
    this.heli.root.position.copy(this.heliPos);
    this.heli.root.rotation.y = this.heliYaw;
    this.heli.update(dt, { rotor: this.heliRotor, lights: lightsOn, doorOpen: this.heliDoor, pitch, roll: pitch * 0.4 });
    lightsOn = true;
    // light + rotor audio follow the helicopter
    this.heliLight.position.set(this.heliPos.x, Math.max(2, this.heliPos.y - 2), this.heliPos.z);
    this.heliLight.intensity = this.heliPos.y < 26 ? 55 * (1 - clamp01(this.heliPos.y / 26)) + 10 : 0;
    if (this.heliLoop) {
      const dist = camera.position.distanceTo(this.heliPos);
      this.heliLoop.setPosition({ x: this.heliPos.x, y: this.heliPos.y, z: this.heliPos.z });
      this.heliLoop.setVolume(Math.min(1.2, 0.25 + 60 / (dist + 20)), 0.2);
      this.heliLoop.setRate(0.6 + 0.5 * this.heliRotor);
    }
    void time;
  }

  private updateHazard(dt: number, camera: THREE.Camera, time: number, alive: boolean): void {
    const ctx = this.ctx;
    // MUJIN has no toxic front: its night takes the station area by area (`mujin/director.ts`)
    if (this.train) {
      this.hazardR = 0;
      return;
    }
    const s = ctx.session;
    const ex = s.extraction;
    const p = ctx.player;
    const data = ctx.level.data;
    const calledAt = ex.calledAt;
    const start = surgeStartTime(calledAt, this.clock);
    // advance warning
    if (!s.flags.has('surgeWarn') && s.elapsed >= start - MISSION.hazard.warningLead && calledAt === null) {
      s.flags.add('surgeWarn');
      ctx.banner('CONTAINMENT FAILING', `${data.text.surge} in 20 seconds`, 'warn', 4);
      ctx.radio('COMMAND', 'Containment is failing at the compound. Surge in twenty seconds.');
      ctx.audio.play('klaxon', { priority: 3 });
    }
    const active = surgeActive(s.elapsed, calledAt, this.clock);
    if (active && !s.flags.has('surge')) {
      s.flags.add('surge');
      ctx.banner(data.text.surge, 'A toxic front is spreading - reach extraction', 'danger', 6);
      ctx.radio('COMMAND', 'Contamination surge! Stay ahead of the front and reach the LZ.');
      ctx.audio.play('siren_wail', { priority: 3 });
      this.sirenLoop = ctx.audio.startLoop('siren', { volume: 0.3 });
      ctx.level.spire.setSurge(true);
    }
    const calm = this.calm();
    if (calm && this.calmT < 1) this.calmT = Math.min(1, this.calmT + dt / 6);
    else if (!calm) this.calmT = 0;
    const r = active && this.calmT < 1 ? hazardRadius(s.elapsed, calledAt, extractionInProgress(ex), this.toLzDist, this.clock) * (1 - this.calmT) : 0;
    this.hazardR = r;
    this.wall.setRadius(r);
    this.wall.setIntensity(active ? clamp01((s.elapsed - start) / 5) * (1 - this.calmT) : 0);
    if (calm && this.sirenLoop) {
      this.sirenLoop.stop(2);
      this.sirenLoop = null;
      ctx.level.spire.setSurge(false);
    }
    this.wall.update(dt, time, camera);
    const inside = alive && isInsideHazard(p.x, p.z, data.hazardCenter.x, data.hazardCenter.z, r);
    if (inside) {
      ctx.hurtPlayer(MISSION.hazard.dps * dt, null, null, { ignoreArmor: true, toxic: true });
      this.coughTimer -= dt;
      if (this.coughTimer <= 0) {
        this.coughTimer = 1.4 + Math.random();
        ctx.audio.play('cough', { priority: 2 });
      }
      if (!this.gasLoop) this.gasLoop = ctx.audio.startLoop('gas', { volume: 0.5, fadeIn: 0.5 });
      if (!this.hazardWasInside) ctx.banner('TOXIC EXPOSURE', 'Leave the contaminated zone immediately', 'danger', 2.5);
    } else if (this.gasLoop) {
      this.gasLoop.stop(0.8);
      this.gasLoop = null;
    }
    this.hazardWasInside = inside;
    void ZOMBIES;
  }

  // ---------------------------------------------------------------------------------------------
  // HUD data
  // ---------------------------------------------------------------------------------------------

  get hazardRadiusNow(): number {
    return this.hazardR;
  }

  get insideHazard(): boolean {
    const p = this.ctx.player;
    const h = this.ctx.level.data.hazardCenter;
    return isInsideHazard(p.x, p.z, h.x, h.z, this.hazardR);
  }

  timers(): { timer: HudTimer; subTimer: HudTimer | null } {
    const s = this.ctx.session;
    const ex = s.extraction;
    let timer: HudTimer;
    if (ex.phase === 'landed') timer = { label: this.train ? 'BOARD - THE DOORS CLOSE IN' : 'BOARD - HELICOPTER LEAVES IN', seconds: ex.windowLeft, urgent: ex.windowLeft < 15 };
    else if (ex.phase === 'called' || ex.phase === 'inbound' || ex.phase === 'landing') timer = { label: this.train ? 'THE DAWN TRAIN' : 'HELICOPTER ETA', seconds: Math.max(0, ex.countdown), urgent: ex.countdown < 15 };
    else if (ex.phase === 'boarding' || ex.phase === 'extracted') timer = { label: 'EXTRACTING', seconds: Math.max(0, ex.boardLeft), urgent: false };
    else if (this.night?.timer()) timer = this.night.timer()!;
    else {
      const left = deadlineRemaining(s.elapsed, this.clock);
      timer = { label: surgeActive(s.elapsed, ex.calledAt, this.clock) ? 'FRONT REACHES LZ IN' : this.ctx.level.data.text.sealed, seconds: left, urgent: left < 90 };
    }
    let subTimer: HudTimer | null = null;
    if (s.defense.status === 'active') {
      subTimer = { label: 'UPLINK', seconds: Math.max(0, (1 - s.defense.progress) * MISSION.defense.duration), urgent: !s.defense.insideNow };
    }
    return { timer, subTimer };
  }

  objectives(): HudObjective[] {
    const ctx = this.ctx;
    const s = ctx.session;
    const p = ctx.player;
    const data = ctx.level.data;
    const list: HudObjective[] = [];
    const defDist = Math.hypot(data.defense.x - p.x, data.defense.z - p.z);
    const dstate = s.defense.status;
    let ddetail: string;
    if (dstate === 'available') ddetail = `${data.text.defensePrompt.charAt(0)}${data.text.defensePrompt.slice(1).toLowerCase()} (${Math.round(defDist)} m)`;
    else if (dstate === 'active') ddetail = s.defense.insideNow ? `Hold the area - ${Math.round(s.defense.progress * 100)}%` : 'RETURN TO THE MARKED AREA';
    else ddetail = 'Complete';
    list.push({
      id: 'defense',
      title: data.text.defenseTitle,
      detail: ddetail,
      state: dstate === 'complete' ? 'complete' : dstate === 'active' ? 'active' : 'available',
      progress: dstate === 'available' ? -1 : s.defense.progress,
      tracked: false,
      distance: dstate === 'complete' ? -1 : defDist,
    });
    const boss = ctx.zombies.boss;
    const huntDist = Math.hypot(data.hunt.searchX - p.x, data.hunt.searchZ - p.z);
    const hstate = s.hunt.status;
    let hdetail: string;
    if (hstate === 'complete') hdetail = `${data.text.boss} is dead`;
    else if (s.hunt.identified && boss?.alive) hdetail = `Eliminate ${data.text.boss} (${Math.round(Math.hypot(boss.x - p.x, boss.z - p.z))} m)`;
    else hdetail = `Search ${data.text.huntSite} (${Math.round(huntDist)} m)`;
    list.push({
      id: 'hunt',
      title: data.text.huntTitle,
      detail: hdetail,
      state: hstate === 'complete' ? 'complete' : 'active',
      progress: hstate === 'complete' ? 1 : boss && s.hunt.identified ? 1 - boss.hp / boss.maxHp : -1,
      tracked: false,
      distance: hstate === 'complete' ? -1 : s.hunt.identified && boss?.alive ? Math.hypot(boss.x - p.x, boss.z - p.z) : huntDist,
    });
    const ex = s.extraction;
    const lzDist = Math.hypot(this.lz.lzX - p.x, this.lz.lzZ - p.z);
    let edetail = 'Complete both contracts to unlock';
    let estate: HudObjective['state'] = 'locked';
    if (ex.phase === 'available') {
      edetail = `Signal the helicopter at ${data.text.lz} (${Math.round(lzDist)} m)`;
      estate = 'available';
    } else if (ex.phase === 'called' || ex.phase === 'inbound' || ex.phase === 'landing') {
      edetail = this.train ? 'Hold platform 1 until the train is in' : 'Hold the landing zone until touchdown';
      estate = 'active';
    } else if (ex.phase === 'landed') {
      edetail = this.train ? 'BOARD THE TRAIN' : 'BOARD THE HELICOPTER';
      estate = 'active';
    } else if (ex.phase === 'boarding' || ex.phase === 'extracted') {
      edetail = 'Extracted';
      estate = 'complete';
    } else if (ex.phase === 'failed') {
      edetail = 'Extraction failed';
      estate = 'failed';
    }
    list.push({
      id: 'extract',
      title: data.text.extractTitle,
      detail: edetail,
      state: estate,
      progress: -1,
      tracked: false,
      distance: estate === 'locked' ? -1 : lzDist,
    });
    // guide the player to the nearest unfinished objective (extraction takes over once both contracts are done)
    const open = list.filter((o) => o.id !== 'extract' && o.state !== 'complete');
    let tracked: HudObjective | undefined;
    if (open.length > 0) tracked = open.reduce((a, b) => (a.distance <= b.distance ? a : b));
    else tracked = list.find((o) => o.id === 'extract');
    if (tracked) tracked.tracked = true;
    this.night?.objectives(list); // the Asylum: day and night missions, in order
    return list;
  }

  /** Mission markers for the maps and compass (positions in world space). */
  markers(out: MapMarker[]): void {
    const ctx = this.ctx;
    const s = ctx.session;
    const data = ctx.level.data;
    out.length = 0;
    const ex = s.extraction;
    const tracked = this.objectives().find((o) => o.tracked)?.id;
    out.push({
      id: 'defense',
      kind: 'transmitter',
      x: data.defense.x,
      z: data.defense.z,
      label: data.text.defenseSite,
      color: '#5ad0ff',
      radius: data.defense.radius,
      visible: true,
      compass: s.defense.status !== 'complete',
      pulse: tracked === 'defense',
      dim: s.defense.status === 'complete',
    });
    const boss = ctx.zombies.boss;
    if (s.hunt.status !== 'complete') {
      if (s.hunt.identified && boss?.alive) {
        out.push({ id: 'hunt', kind: 'hunt', x: boss.x, z: boss.z, label: data.text.boss, color: '#ff5a4d', visible: true, compass: true, pulse: true });
      } else {
        out.push({ id: 'hunt', kind: 'hunt', x: data.hunt.searchX, z: data.hunt.searchZ, label: 'SEARCH AREA', color: '#ff8a5a', radius: data.hunt.searchRadius, visible: true, compass: true, pulse: tracked === 'hunt' });
      }
    }
    const lzShown = ex.phase !== 'locked';
    out.push({
      id: 'lz',
      kind: 'lz',
      x: this.lz.lzX,
      z: this.lz.lzZ,
      label: data.text.lz,
      color: '#ffc040',
      radius: lzShown ? this.lz.lzRadius : undefined,
      visible: true,
      compass: lzShown && ex.phase !== 'extracted',
      pulse: ex.phase === 'available' || ex.phase === 'landed',
      dim: !lzShown,
    });
    if (this.heliVisible && this.heli.root.visible) {
      out.push({ id: 'heli', kind: 'helicopter', x: this.heliPos.x, z: this.heliPos.z, label: this.train ? 'DAWN TRAIN' : 'HELICOPTER', color: '#ffe08a', visible: true, compass: false, pulse: ex.phase === 'landed' });
    }
    out.push({ id: 'start', kind: 'start', x: data.playerStart.x, z: data.playerStart.z, label: 'INSERTION', visible: true, dim: true });
    for (const st of data.stations) {
      out.push({ id: st.id, kind: st.kind, x: st.x, z: st.z, label: st.kind === 'buy' ? 'SUPPLY' : 'ARMORY', visible: true });
    }
    const player = ctx.player;
    for (const c of this.entities.crates) {
      out.push({ id: c.def.id, kind: 'crate', x: c.def.x, z: c.def.z, visible: c.discovered && !c.opened || (!c.opened && Math.hypot(c.def.x - player.x, c.def.z - player.z) < 30) });
    }
    out.push({ id: 'spire', kind: 'landmark', x: data.hazardCenter.x, z: data.hazardCenter.z, label: data.text.hazardSite, color: '#5fe08a', visible: true, dim: true });
    this.night?.markers(out, tracked);
  }

  contractsDone(): number {
    return contractsCompleted(this.ctx.session.defense, this.ctx.session.hunt);
  }

  failExtractionNow(reason: string): void {
    failExtraction(this.ctx.session.extraction, reason);
  }

  dispose(): void {
    this.stopLoops();
    this.flare?.stop();
    this.root.removeFromParent();
    this.heli.dispose();
    this.wall.dispose();
    this.areaMarker.dispose();
    this.terminal.dispose();
    this.night?.dispose();
  }
}
