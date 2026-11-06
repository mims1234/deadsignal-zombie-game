/**
 * Blackwood Hill's story in the browser: owned by the mission runtime on that map only. The rules are `story.ts`
 * (steps, the night, the lanterns and the bell, the black fog's waves); this file draws and says them.
 *
 *  - the five files (glowing folders; walk into one to take it, on its own floor), each read out by its people;
 *  - the step: one objective that says what to do next and why, a marker on the map and compass, a direction line
 *    when a step is done (dropped if it was done meanwhile);
 *  - the night (from the first second; the dawn comes with the helicopter's call);
 *  - the vigil lanterns: each burns on the infected killed beside it (a wisp flies in for each), and once all three
 *    burn the chapel bell's rope can be pulled: lights-out, and the Matron wakes;
 *  - the upper floors' sleepers and the ones that climb in while you are up there (`upstairsRush.ts`);
 *  - the black fog: warnings, the wave's reach (the mission runtime draws the wall and burns whoever is in it), the
 *    infected it drives ahead of it; the damper at the stack, once the Matron's keys are in hand, stops it;
 *  - Ward Nine's door (`upstairs.ts`) opens with the power;
 *  - every word through one voice director (`sakura/voice.ts` with `lines.ts`), the mission's own radio included.
 *
 * Co-op (`follow`): the simulation owns the files, the lanterns, the bell and the damper. A pickup, the bell or the
 * damper is a request; what the simulation decided arrives through `applyRecords` / `applyStory`.
 */
import * as THREE from 'three';
import { applyContractReward } from '../logic/economy';
import { createRecords, pickUpRecord, recordsFound, type RecordsContract } from '../logic/records';
import { refillAll } from '../logic/powerups';
import { gateHunt, type TimeOfDay } from '../logic/timeOfDay';
import type { Zombie } from '../enemies/zombie';
import { DayNightLook } from '../render/dayNight';
import type { HudObjective, HudTimer, MapMarker } from '../ui/hudTypes';
import type { GameCtx } from '../game/ctx';
import type { InteractTarget } from '../game/interaction';
import { ASYLUM } from '../world/layout/asylum';
import { SakuraVoice, type LineKind } from '../sakura/voice';
import { ASY_BY_TEXT, ASYLUM_BANK, SURVIVOR_SPEAKER } from './lines';
import { NIGHT_LINES as L, RECORD_NOTES } from './lore';
import { BELL, FOG, LANTERNS, NIGHT_BEATS, RECORDS, STORY, UPSTAIRS } from './nightConfig';
import { NightHud } from './nightHud';
import { asylumHour, asylumTuning, bellReady, damperOpen, FILE, fogAt, huntClock, inFog, lanternFor, lanternLit, lanternsLit, STEPS, storyStep, type FogState, type StepId, type StoryFacts } from './story';
import { UpstairsRush } from './upstairsRush';
import { setWard9Open, ward9Open } from './upstairs';

interface FolderModel {
  root: THREE.Group;
  folder: THREE.Object3D;
  halo: THREE.Sprite;
  beam: THREE.Mesh;
}

let haloTexture: THREE.CanvasTexture | null = null;
function haloTex(): THREE.Texture {
  if (haloTexture) return haloTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  haloTexture = new THREE.CanvasTexture(c);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

/** What each step asks, and the line that sends you there once the step before it is done. */
const STEP_TEXT: Record<StepId, { title: string; detail: string; dir: string | null }> = {
  office: { title: 'THE ADMIN OFFICES', detail: 'Find the Lantern Program file in the admin offices', dir: null },
  westWard: { title: 'THE WEST WARD', detail: "Find Patient 117's admission card in a west ward cell", dir: 'vance_dir_ward' },
  nurses: { title: "THE NURSES' FLOOR", detail: "Up the west fire escape in the yard: the Head Nurse's day book", dir: 'vance_dir_nurses' },
  power: { title: 'RESTORE THE POWER', detail: 'Start the boiler house generators and hold the yard while they spin up', dir: 'vance_dir_power' },
  nine: { title: 'WARD NINE', detail: 'Up the east fire escape in the yard: the night register', dir: 'okafor_dir_nine' },
  morgue: { title: 'THE MORGUE', detail: "Orderly Byrne's last log, at the east end of the back walk", dir: 'vance_dir_morgue' },
  lanterns: { title: 'THE VIGIL LANTERNS', detail: 'Kill the infected beside each vigil lantern until it burns', dir: 'okafor_dir_lanterns' },
  bell: { title: 'THE CHAPEL BELL', detail: 'Pull the bell rope by the chapel altar when you are ready - she wakes', dir: 'okafor_dir_bell' },
  matron: { title: 'THE ISOLATION BLOCK', detail: 'Put the Matron to rest - her keys open the furnace', dir: 'vance_dir_matron' },
  furnace: { title: 'SHUT THE FURNACE', detail: 'Turn the damper at the foot of the crematorium stack', dir: 'okafor_dir_damper' },
  dawn: { title: 'HOLD UNTIL DAWN', detail: 'Radio the bird from the lawn and hold it until first light', dir: null },
};

/** Who reacts the first time in a place (if they are with you). */
const PLACES: { id: string; line: string; inside: (x: number, y: number, z: number) => boolean }[] = [
  { id: 'nine', line: 'ellie_nine', inside: (x, y, z) => y > 3.5 && x > 15 && x < 29 && z > -22 && z < 10 },
  { id: 'chapel', line: 'maeve_chapel', inside: (x, _y, z) => x > -36 && x < -20 && z > -41 && z < -29 },
  { id: 'isolation', line: 'halloway_isolation', inside: (x, _y, z) => x > -10 && x < 10 && z > -42 && z < -30 },
];

export class AsylumNight {
  readonly root = new THREE.Group();
  /** The files (the trail). */
  records: RecordsContract = createRecords();
  /** The hour this frame. */
  tod: TimeOfDay = asylumHour(0, null);
  /** When the chapel bell was rung (the Matron woke), and when the damper was shut (null: not yet). */
  wakeAt: number | null = null;
  fogStopAt: number | null = null;
  /** What each vigil lantern has burned (`LANTERNS`). */
  souls: number[] = LANTERNS.spots.map(() => 0);
  /** The black fog this frame. */
  fog: FogState = fogAt(0, null);
  /** Co-op: the simulation's copy of the story is the truth; ask it instead of deciding here. */
  follow = false;
  requestRecord: ((index: number) => void) | null = null;
  requestDamper: (() => void) | null = null;
  requestBell: (() => void) | null = null;
  /** Free roam (nobody sleeps upstairs, nothing climbs in). Wired by the game. */
  roam: (() => boolean) | null = null;
  /** Everything said aloud (and the mission's radio, routed here). */
  readonly voice: SakuraVoice;
  /** Can a squad member or a freed survivor speak (alive, and out of the cage)? Wired by the game. */
  canTalk: ((name: string) => boolean) | null = null;
  private readonly look: DayNightLook;
  private readonly hud = new NightHud();
  private readonly folders: FolderModel[] = [];
  private readonly queue: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private lastPhase: TimeOfDay['phase'] | null = null;
  private lastApplied = -1;
  private lastStep = -1;
  private fogWarned = -1;
  private fogWasOut = false;
  private matronSeen = false;
  private matronRaged = false;
  private wheelSpin = 0;
  private ropeSwing = 0;
  private readonly placesSaid = new Set<string>();
  private readonly rush: UpstairsRush;
  /** The upper floors' sleepers are in their beds (placed on the first frame of a run that has infected). */
  private residents = false;
  /** The lanterns' flames: a flame, its glow, the glass. */
  private readonly flames: { flame: THREE.Mesh; glow: THREE.Sprite; glass: THREE.MeshStandardMaterial; shown: number }[] = [];
  /** Souls on their way into a lantern. */
  private readonly wisps: { s: THREE.Sprite; from: THREE.Vector3; to: number; t: number }[] = [];

  constructor(private readonly ctx: GameCtx) {
    this.root.name = 'AsylumNight';
    ctx.worldRoot.add(this.root);
    this.look = new DayNightLook(ctx.renderer, ctx.level);
    this.voice = new SakuraVoice(ctx.audio, ASYLUM_BANK);
    this.voice.onCaption = (who, text, dur) => ctx.hudEvent({ type: 'radio', speaker: who, text, duration: dur });
    this.voice.canSpeak = (who) => this.speaks(who);
    void this.voice.load();
    const manila = new THREE.MeshStandardMaterial({ color: 0xcdb27a, roughness: 0.85, emissive: 0x6a4e1c, emissiveIntensity: 0.9 });
    const tabMat = new THREE.MeshStandardMaterial({ color: 0x8a2a1e, roughness: 0.7, emissive: 0x3a0a06, emissiveIntensity: 0.6 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.95, emissive: 0x4a4636, emissiveIntensity: 0.5 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const haloMat = new THREE.SpriteMaterial({ map: haloTex(), color: 0xffcf73, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (const s of RECORDS.spots) {
      const root = new THREE.Group();
      root.position.set(s.x, s.y, s.z);
      const folder = new THREE.Group();
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.25), manila);
      const sheets = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.012, 0.23), paper);
      sheets.position.set(0.01, 0.018, 0);
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.026, 0.035), tabMat);
      tab.position.set(-0.1, 0, -0.14);
      folder.add(cover, sheets, tab);
      folder.position.y = 0.08;
      folder.scale.setScalar(1.3);
      folder.rotation.y = s.x * 0.37;
      const halo = new THREE.Sprite(haloMat);
      halo.scale.setScalar(0.85);
      halo.position.y = 0.12;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 2.4, 10, 1, true), beamMat);
      beam.position.y = 1.2;
      root.add(folder, halo, beam);
      this.root.add(root);
      this.folders.push({ root, folder, halo, beam });
    }
    // the vigil lanterns' glass and flame (their iron posts are the layout's: the cage is 1.75 m up)
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const flameGeo = new THREE.ConeGeometry(0.06, 0.2, 8);
    for (const l of LANTERNS.spots) {
      const glass = new THREE.MeshStandardMaterial({ color: 0x3a3428, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55, emissive: 0xff9a30, emissiveIntensity: 0, depthWrite: false });
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.28), glass);
      pane.position.set(l.x, l.y + 1.77, l.z);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(l.x, l.y + 1.72, l.z);
      flame.scale.setScalar(0.001);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      glow.position.set(l.x, l.y + 1.75, l.z);
      glow.scale.setScalar(2.4);
      this.root.add(pane, flame, glow);
      this.flames.push({ flame, glow, glass, shown: 0 });
    }
    this.rush = new UpstairsRush(ctx.zombies, ctx.level);
  }

  /** A speaker's line can be said: the squad and the freed while they live (the Matron, Byrne and the pilot always). */
  private speaks(who: string): boolean {
    if (!this.canTalk) return true;
    if (who === 'VANCE') return this.canTalk('Vance');
    if (who === 'OKAFOR') return true; // the story is hers to tell; if she has fallen, Vance is on the same channel
    for (const [name, sp] of Object.entries(SURVIVOR_SPEAKER)) if (sp === who) return this.canTalk(name);
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------------------------

  /** A fresh run: every file in place, every lantern dark, the Matron asleep, the stack quiet. */
  reset(): void {
    const ctx = this.ctx;
    this.records = createRecords();
    for (const f of this.folders) f.root.visible = true;
    this.queue.length = 0;
    this.clock = 0;
    this.lastPhase = null;
    this.lastApplied = -1;
    this.lastStep = -1;
    this.wakeAt = null;
    this.fogStopAt = null;
    this.souls = LANTERNS.spots.map(() => 0);
    this.residents = false;
    this.ropeSwing = 0;
    for (const w of this.wisps) w.s.removeFromParent();
    this.wisps.length = 0;
    for (const f of this.flames) f.shown = -1;
    this.fogWarned = -1;
    this.fogWasOut = false;
    this.matronSeen = false;
    this.matronRaged = false;
    this.wheelSpin = 0;
    this.placesSaid.clear();
    this.voice.stopAll();
    this.hud.hideNote();
    this.tod = asylumHour(0, null);
    this.fog = fogAt(0, null);
    ctx.zombies.setPhaseTuning(asylumTuning(this.tod, false));
    ctx.zombies.rateMul = 1;
    ctx.zombies.capBonus = 0;
    gateHunt(ctx.session.hunt, 0);
    setWard9Open(ctx.level, false);
    this.look.apply(this.tod, ctx.time);
  }

  /** The facts the story follows. */
  facts(): StoryFacts {
    const s = this.ctx.session;
    return { records: this.records.found, power: s.defense.status === 'complete', souls: this.souls, bell: this.wakeAt !== null, matron: s.hunt.status === 'complete', damper: this.fogStopAt !== null };
  }

  /** The step now (index into `STEPS`). */
  step(): number {
    return storyStep(this.facts());
  }

  /** Every frame, before the mission runtime runs its contracts (`dt` 0 on the title screen: no clock). */
  update(dt: number, time: number): void {
    const ctx = this.ctx;
    const s = ctx.session;
    this.clock += dt;
    // night from the first second; the helicopter's call brings the dawn
    const tod = asylumHour(s.elapsed, s.extraction.calledAt);
    this.tod = tod;
    if (Math.abs(s.elapsed - this.lastApplied) > 0.04 || tod.phase === 'dawn' || dt === 0) {
      this.lastApplied = s.elapsed;
      this.look.apply(tod, time);
      ctx.zombies.setPhaseTuning(asylumTuning(tod, this.wakeAt !== null));
    }
    // the hunt is closed until the bell; the upper floors' sleepers, and the ones that climb in (co-op: the simulation)
    if (!this.follow) {
      gateHunt(s.hunt, huntClock(this.wakeAt));
      if (dt > 0 && !this.roam?.()) {
        if (!this.residents) {
          this.residents = true;
          this.rush.reset(ctx.rng);
        }
        this.rush.update(dt, ctx.playerAlive() ? [{ x: ctx.player.x, y: ctx.player.y, z: ctx.player.z, alive: true }] : [], ctx.rng);
      }
      const b = ctx.zombies.boss;
      if (s.hunt.status === 'available' && b && b.alive && !b.puppet) ctx.zombies.remove(b);
    }
    // the black fog, and the infected it drives ahead of it (co-op: the simulation spawns, with the same rule)
    this.fog = fogAt(s.elapsed, this.fogStopAt);
    const out = this.fog.radius > 0.5;
    ctx.zombies.rateMul = out ? FOG.rateMul : 1;
    ctx.zombies.capBonus = out ? FOG.capBonus : 0;
    // Ward Nine's door opens with the power
    setWard9Open(ctx.level, s.defense.status === 'complete');

    if (dt > 0) {
      this.beats(tod);
      this.pickups();
      this.fogBeats(out);
      this.places();
      this.matronBeats();
    }
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i]!.at > this.clock) continue;
      const q = this.queue.splice(i, 1)[0]!;
      i--;
      q.fn();
    }
    this.voice.update(this.clock);
    this.animate(time, dt);
    this.hud.update(dt, tod.phase, this.toNext(tod));
  }

  private later(seconds: number, fn: () => void): void {
    this.queue.push({ at: this.clock + seconds, fn });
  }

  private toNext(tod: TimeOfDay): number {
    if (tod.phase === 'dusk') return 1 - tod.t;
    if (tod.phase === 'dawn') return tod.t;
    return 1;
  }

  // ---------------------------------------------------------------------------------------------
  // what is said
  // ---------------------------------------------------------------------------------------------

  /** The game's radio on this map (the mission's calls, the squad, the freed): voiced where a line matches. */
  onRadio(who: string, text: string): boolean {
    const id = ASY_BY_TEXT.get(`${who}|${text}`) ?? ASY_BY_TEXT.get(text);
    const kind: LineKind = who === 'PILOT' || who === 'COMMAND' ? 'system' : /hit bad/.test(text) ? 'bark' : 'story';
    // the mission's generic calls that have no place in this story are left unsaid
    if (!id && who === 'COMMAND') return true;
    if (!id) {
      this.voice.caption(who, text, { kind });
      return true;
    }
    this.voice.say(id, { kind });
    return true;
  }

  /** The story's turns, each once per run (keyed in the session's flags). */
  private beats(tod: TimeOfDay): void {
    const ctx = this.ctx;
    const s = ctx.session;
    const once = (key: string): boolean => {
      if (s.flags.has(key)) return false;
      s.flags.add(key);
      return true;
    };
    if (s.elapsed >= NIGHT_BEATS.recordsAsk && once('asy:brief2')) this.voice.say('vance_brief', { kind: 'story' });
    // a step done: where next (dropped if that is done too by the time it would be said)
    const step = this.step();
    if (step !== this.lastStep) {
      const first = this.lastStep < 0;
      this.lastStep = step;
      const id = STEPS[step]!;
      const dir = STEP_TEXT[id].dir;
      if (!first && dir && id !== 'dawn') this.voice.say(dir, { kind: 'direction', delay: 1, valid: () => this.step() === step });
    }
    if (tod.phase !== this.lastPhase) {
      this.lastPhase = tod.phase;
      if (tod.phase === 'dawn' && once('asy:dawn')) this.later(2, () => ctx.banner(L.callTitle, L.callSub, 'warn', 4.5));
    }
    if (s.extraction.phase === 'landed' && once('asy:firstLight')) this.voice.say('okafor_dawn', { kind: 'story', delay: 3 });
  }

  /** Lights-out (the bell): the old speakers, a scream from the isolation block. */
  private nightfall(): void {
    const ctx = this.ctx;
    const h = ctx.level.data.hunt;
    ctx.banner(L.nightTitle, L.nightSub, 'danger', 4);
    ctx.audio.play('amb_thunder', { priority: 2, volume: 0.8, delay: 2.5 });
    // the Matron on the tannoy first, then Okafor on what that was (queued in that order, after Vance's word)
    this.later(2.5, () => {
      this.voice.say('matron_lightsout', { kind: 'story' });
      this.voice.say('okafor_wake', { kind: 'story' });
    });
    this.later(3, () => {
      ctx.audio.play('zombie_screech', { priority: 3, volume: 1.5, rate: 0.62, pos: { x: h.wardenX, y: 3, z: h.wardenZ } });
      ctx.audio.play('warden_roar', { priority: 3, volume: 1.2, rate: 0.85, delay: 0.9, pos: { x: h.wardenX, y: 3, z: h.wardenZ } });
      ctx.banner(L.wakeTitle, L.wakeSub, 'danger', 5);
    });
  }

  /** The fog's waves: warned, out, gone. */
  private fogBeats(out: boolean): void {
    const ctx = this.ctx;
    const f = this.fog;
    if (!f.stopped && f.phase === 'calm' && f.next <= FOG.warn && this.fogWarned < f.wave + 1) {
      this.fogWarned = f.wave + 1;
      ctx.banner('THE BLACK FOG', 'It is rolling out of the crematorium - get away from the stack', 'warn', 4);
      ctx.audio.play('klaxon', { priority: 3, volume: 0.7 });
      this.voice.say(this.fogWarned % 2 === 1 ? 'vance_fog_warn' : 'okafor_fog_warn', { kind: 'system' });
      if (this.fogWarned === 1) this.voice.say('sato_fog', { kind: 'place', delay: 6 });
    }
    if (out && !this.fogWasOut) {
      ctx.level.spire.setSurge(true);
      ctx.audio.play('siren_wail', { priority: 2, volume: 0.6 });
    }
    if (!out && this.fogWasOut) {
      ctx.level.spire.setSurge(false);
      if (!f.stopped) this.voice.say('vance_fog_gone', { kind: 'bark' });
    }
    this.fogWasOut = out;
  }

  /** The first time somebody who knew a place is in it with you. */
  private places(): void {
    const p = this.ctx.player;
    for (const pl of PLACES) {
      if (this.placesSaid.has(pl.id) || !pl.inside(p.x, p.y, p.z)) continue;
      this.placesSaid.add(pl.id);
      this.voice.say(pl.line, { kind: 'place', delay: 1.2 });
    }
    // Sister Maeve, the first time you stand by a vigil lantern with her
    if (!this.placesSaid.has('lantern')) {
      for (const l of LANTERNS.spots) {
        if (Math.abs(l.y - p.y) > 2.5 || Math.hypot(l.x - p.x, l.z - p.z) > 6) continue;
        this.placesSaid.add('lantern');
        this.voice.say('maeve_lanterns', { kind: 'place', delay: 0.8 });
        break;
      }
    }
    // Ward Nine's door before the power
    const d = this.ctx.level.asylum?.ward9.collider;
    if (d && !ward9Open(this.ctx.level) && p.y > 3.5 && Math.hypot(d.cx - p.x, d.cz - p.z) < 3.2) this.voice.say('vance_locked', { kind: 'place', once: true });
  }

  /** Her: first sight, her rage at half strength, her rest. */
  private matronBeats(): void {
    const ctx = this.ctx;
    const b = ctx.zombies.boss;
    const s = ctx.session;
    if (b && b.alive && s.hunt.status === 'active') {
      const d = Math.hypot(b.x - ctx.player.x, b.z - ctx.player.z);
      const at = (): { x: number; y: number; z: number } => ({ x: b.x, y: b.y + 2, z: b.z });
      if (!this.matronSeen && d < 22) {
        this.matronSeen = true;
        this.voice.say('matron_seen', { kind: 'story', pos: at(), valid: () => !!b.alive });
        this.voice.say('pip_matron', { kind: 'place' });
      }
      if (!this.matronRaged && b.hp < b.maxHp * 0.5) {
        this.matronRaged = true;
        this.voice.say('matron_rage', { kind: 'story', pos: at(), valid: () => !!b.alive });
      }
    }
    if (s.hunt.status === 'complete' && !s.flags.has('asy:matronDown')) {
      s.flags.add('asy:matronDown');
      this.voice.say('matron_down', { kind: 'story', delay: 0.5 });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // the files
  // ---------------------------------------------------------------------------------------------

  /** Walk into a file to take it (on its own floor). */
  private pickups(): void {
    const ctx = this.ctx;
    if (!ctx.playerAlive()) return;
    const p = ctx.player;
    for (let i = 0; i < RECORDS.spots.length; i++) {
      if (this.records.found[i]) continue;
      const sp = RECORDS.spots[i]!;
      if (Math.hypot(sp.x - p.x, sp.z - p.z) > RECORDS.pickupRadius || Math.abs(sp.y - 0.8 - p.y) > 2.2) continue;
      if (this.follow) {
        this.requestRecord?.(i);
        return;
      }
      const got = pickUpRecord(this.records, i);
      if (got) this.onRecord(got.index, got.cash, got.count, got.completed);
      return;
    }
  }

  /** A file was taken (here, or by the squad in co-op): pay once, show it, read it out. */
  private onRecord(index: number, cash: number, count: number, completed: boolean): void {
    const ctx = this.ctx;
    const total = RECORDS.spots.length;
    this.folders[index]!.root.visible = false;
    const a = applyContractReward(ctx.session.inv, { cash, plates: 0, grenades: 0 });
    ctx.hudEvent({ type: 'cash', amount: a.cash });
    ctx.audio.play('pickup_cash', { priority: 2 });
    ctx.audio.play('objective_ping', { priority: 2, volume: 0.8 });
    const note = RECORD_NOTES[index]!;
    if (completed) {
      ctx.banner(L.recordsDoneTitle, `${note.title}   +$${a.cash.toLocaleString('en-US')}`, 'good', 5);
      ctx.audio.play('contract_complete', { priority: 3 });
      ctx.feed(`EVERY FILE FOUND  +$${a.cash}`, 'good');
    } else {
      ctx.banner(`FILE ${count}/${total}`, `${note.title}   +$${a.cash.toLocaleString('en-US')}`, 'good', 4);
      ctx.feed(`FILE ${count}/${total}  +$${a.cash}`, 'good');
    }
    this.hud.showNote(note, index, total);
    this.voice.sayAll(note.lines, { kind: 'story', delay: 1.5 });
  }

  /** Co-op: the files the simulation says are taken (each newly taken one plays here once). */
  applyRecords(found: readonly boolean[]): void {
    for (let i = 0; i < found.length && i < this.records.found.length; i++) {
      if (!found[i] || this.records.found[i]) continue;
      const got = pickUpRecord(this.records, i);
      if (got) this.onRecord(got.index, got.cash, got.count, got.completed);
    }
  }

  /** Co-op: when the bell was rung and the damper shut (-1: not yet), and what each lantern has burned. */
  applyStory(wakeAt: number, fogStopAt: number, souls?: readonly number[]): void {
    if (souls) {
      for (let i = 0; i < this.souls.length; i++) {
        const n = Math.max(0, Math.floor(souls[i] ?? 0));
        if (n <= this.souls[i]!) continue;
        const was = lanternLit(this.souls, i);
        // a soul flies in for each new one (from somewhere around the lantern: the guest does not know where it died)
        for (let k = 0; k < Math.min(3, n - this.souls[i]!); k++) {
          const l = LANTERNS.spots[i]!;
          const a = Math.random() * Math.PI * 2;
          this.wisp(new THREE.Vector3(l.x + Math.cos(a) * 4, l.y + 1, l.z + Math.sin(a) * 4), i);
        }
        this.souls[i] = n;
        if (!was && lanternLit(this.souls, i)) this.onLanternLit(i);
      }
    }
    const wake = wakeAt >= 0 ? wakeAt : null;
    if (wake !== null && this.wakeAt === null) {
      this.wakeAt = wake;
      this.onBell();
    }
    this.wakeAt = wake;
    const stop = fogStopAt >= 0 ? fogStopAt : null;
    if (stop !== null && this.fogStopAt === null) this.onDamperShut(false);
    this.fogStopAt = stop;
  }

  // ---------------------------------------------------------------------------------------------
  // the vigil lanterns and the bell
  // ---------------------------------------------------------------------------------------------

  /** An infected died (the player's kill or the squad's): a lantern beside it takes its soul. */
  onKill(z: Zombie): void {
    if (this.follow || z.isBoss) return;
    const i = lanternFor(this.souls, z.x, z.y ?? 0, z.z);
    if (i < 0) return;
    this.souls[i]!++;
    this.wisp(new THREE.Vector3(z.x, (z.y ?? 0) + 1.1, z.z), i);
    if (lanternLit(this.souls, i)) this.onLanternLit(i);
  }

  /** A soul on its way into lantern `i` (a small glow that curves up and in over half a second). */
  private wisp(from: THREE.Vector3, i: number): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.setScalar(0.5);
    s.position.copy(from);
    this.root.add(s);
    this.wisps.push({ s, from, to: i, t: 0 });
  }

  /** A lantern burns: pays everyone once (each on their own screen), fills every gun, and says so. */
  private onLanternLit(i: number): void {
    const ctx = this.ctx;
    const l = LANTERNS.spots[i]!;
    const n = lanternsLit(this.souls);
    const total = LANTERNS.spots.length;
    const a = applyContractReward(ctx.session.inv, { cash: LANTERNS.cash, plates: 0, grenades: 0 });
    refillAll(ctx.session.inv);
    ctx.hudEvent({ type: 'cash', amount: a.cash });
    ctx.audio.play('lantern_light', { priority: 3, pos: { x: l.x, y: l.y + 1.8, z: l.z } });
    ctx.audio.play('powerup_max_ammo', { priority: 2, volume: 0.7 });
    ctx.fx.sparkle({ x: l.x, y: l.y + 1.8, z: l.z }, 0xffb050, 26);
    ctx.banner(n >= total ? 'THE LANTERNS BURN' : `VIGIL LANTERN ${n}/${total}`, n >= total ? `The chapel bell can be rung   +$${a.cash.toLocaleString('en-US')}  FULL AMMO` : `${l.place} - it burns   +$${a.cash.toLocaleString('en-US')}  FULL AMMO`, 'good', 4.5);
    ctx.feed(`LANTERN ${n}/${total}  +$${a.cash}  FULL AMMO`, 'good');
    if (n === 1) this.voice.say('vance_lantern_one', { kind: 'story', delay: 1 });
    else if (n === total - 1) this.voice.say('okafor_lantern_two', { kind: 'story', delay: 1 });
  }

  /** The bell rope by the altar: tied off until the lanterns burn, then pull it (hold) and she wakes. */
  bellTarget(): InteractTarget | null {
    const ctx = this.ctx;
    if (this.wakeAt !== null || ctx.session.hunt.status === 'complete' || !ctx.playerAlive()) return null;
    const p = ctx.player;
    const dist = Math.hypot(BELL.x - p.x, BELL.z - p.z);
    if (dist > BELL.reach || p.y > 1.5) return null;
    if (!bellReady(this.facts())) {
      this.voice.say('okafor_bell_locked', { kind: 'place', once: true });
      return { id: 'asy-bell', dist, text: 'THE BELL ROPE IS TIED OFF', sub: `Light the vigil lanterns first (${lanternsLit(this.souls)}/${LANTERNS.spots.length} burning)`, tone: 'warn', hold: 0, enabled: false, onUse: () => {} };
    }
    return { id: 'asy-bell', dist, text: 'RING THE LIGHTS-OUT BELL', sub: 'The Matron wakes and starts her round', tone: 'warn', hold: BELL.hold, enabled: true, onUse: () => this.ringBell() };
  }

  private ringBell(): void {
    if (this.follow) {
      this.requestBell?.();
      return;
    }
    if (this.wakeAt !== null) return;
    this.wakeAt = this.ctx.session.elapsed;
    this.onBell();
  }

  /** Lights-out: the bell tolls three times, and she wakes. */
  private onBell(): void {
    const ctx = this.ctx;
    const at = { x: -18, y: 14, z: -40 }; // the bell tower
    for (let k = 0; k < 3; k++) ctx.audio.play('temple_bell', { priority: 3, volume: 1.2, delay: k * 2.2, pos: at });
    this.ropeSwing = 1;
    ctx.shake(0.15);
    this.voice.say('vance_bell', { kind: 'story', delay: 1 });
    this.nightfall();
  }

  /** The boiler house generators are running (the mission runtime's `onPowerRestored`). */
  powerRestored(): void {
    // `okafor_power` voices the mission's own call
  }

  // ---------------------------------------------------------------------------------------------
  // the damper
  // ---------------------------------------------------------------------------------------------

  /** The furnace damper at the foot of the stack: chained until the Matron's keys are in hand. */
  damperTarget(): InteractTarget | null {
    const ctx = this.ctx;
    if (this.fogStopAt !== null || !ctx.playerAlive()) return null;
    const p = ctx.player;
    const D = ASYLUM.damper;
    const dist = Math.hypot(D.x - p.x, D.z + 0.6 - p.z);
    if (dist > STORY.damperReach || p.y > 1.5) return null;
    if (!damperOpen(this.facts())) {
      this.voice.say('okafor_damper_locked', { kind: 'place', once: true });
      return { id: 'asy-damper', dist, text: 'THE DAMPER IS CHAINED', sub: 'The padlock is the Matron\'s - she keeps the key', tone: 'warn', hold: 0, enabled: false, onUse: () => {} };
    }
    return { id: 'asy-damper', dist, text: 'SHUT THE FURNACE DAMPER', sub: 'The black fog stops for good', tone: 'warn', hold: STORY.damperHold, enabled: true, onUse: () => this.shutDamper() };
  }

  private shutDamper(): void {
    if (this.follow) {
      this.requestDamper?.();
      return;
    }
    if (this.fogStopAt !== null) return;
    this.fogStopAt = this.ctx.session.elapsed;
    this.onDamperShut(true);
  }

  /** The damper is shut: paid once here (co-op: each player is paid on their own screen). */
  private onDamperShut(pay: boolean): void {
    const ctx = this.ctx;
    void pay;
    const a = applyContractReward(ctx.session.inv, { cash: STORY.damperCash, plates: 0, grenades: 0 });
    ctx.hudEvent({ type: 'cash', amount: a.cash });
    ctx.audio.play('contract_complete', { priority: 3 });
    ctx.banner('THE FURNACE IS SHUT', `The black fog will not come again   +$${a.cash.toLocaleString('en-US')}`, 'good', 5);
    ctx.feed(`FURNACE SHUT  +$${a.cash}`, 'good');
    this.wheelSpin = 1;
    this.voice.say('okafor_damper', { kind: 'story', delay: 1 });
  }

  private animate(time: number, dt: number): void {
    for (let i = 0; i < this.folders.length; i++) {
      const f = this.folders[i]!;
      if (!f.root.visible) continue;
      f.folder.position.y = 0.08 + Math.sin(time * 2.1 + i) * 0.025;
      f.folder.rotation.y += 0.004;
      f.halo.material.opacity = 0.7 + 0.25 * Math.sin(time * 3.3 + i * 1.7);
      (f.beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.08 * this.tod.dark;
    }
    // the lanterns' flames grow with what they have burned, and flicker; the souls fly in
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i]!;
      const k = Math.min(1, (this.souls[i] ?? 0) / LANTERNS.souls);
      const lit = k >= 1;
      const fl = 0.85 + 0.15 * Math.sin(time * 13 + i * 2) * Math.sin(time * 7.3 + i);
      f.flame.scale.set(0.4 + 0.6 * k, (0.3 + 0.9 * k) * fl, 0.4 + 0.6 * k);
      f.flame.visible = k > 0;
      f.glass.emissiveIntensity = (lit ? 2.2 : 0.15 + 1.2 * k) * fl;
      (f.glow.material as THREE.SpriteMaterial).opacity = (lit ? 0.95 : 0.15 + 0.5 * k) * fl;
      f.glow.scale.setScalar(lit ? 3.2 : 1.6 + 1.2 * k);
    }
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i]!;
      w.t += dt / 0.7;
      const l = LANTERNS.spots[w.to]!;
      if (w.t >= 1) {
        w.s.removeFromParent();
        w.s.material.dispose();
        this.wisps.splice(i--, 1);
        continue;
      }
      const t = w.t * w.t * (3 - 2 * w.t);
      w.s.position.set(w.from.x + (l.x - w.from.x) * t, w.from.y + (l.y + 1.75 - w.from.y) * t + Math.sin(t * Math.PI) * 1.4, w.from.z + (l.z - w.from.z) * t);
      w.s.material.opacity = 0.9 * (1 - t * 0.5);
    }
    // the bell rope swings after a pull
    const rope = this.ctx.level.asylum?.bell;
    if (rope) {
      this.ropeSwing = Math.max(0, this.ropeSwing - dt / 6);
      rope.rotation.x = Math.sin(time * 2.8) * 0.12 * this.ropeSwing;
      rope.rotation.z = Math.sin(time * 2.1 + 1) * 0.06 * this.ropeSwing;
    }
    const w = this.ctx.level.asylum?.damper.wheel;
    if (w && this.wheelSpin > 0) {
      this.wheelSpin = Math.max(0, this.wheelSpin - dt / 2.5);
      w.rotation.z += dt * 5 * this.wheelSpin;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------------------------

  /** The main clock: the black fog's next wave, the wave while it is out, then time on the hill. */
  timer(): HudTimer {
    const f = this.fog;
    const s = this.ctx.session;
    if (f.stopped) return { label: 'ON THE HILL', seconds: s.elapsed, urgent: false };
    if (f.radius > 0.5) return { label: 'BLACK FOG', seconds: Math.max(0, FOG.rise + FOG.hold + FOG.fall - (FOG.period - f.next)), urgent: true };
    return { label: 'BLACK FOG IN', seconds: Math.max(0, f.next), urgent: f.next <= FOG.warn };
  }

  /** The stack and how far the fog reaches now (the mission runtime draws it and burns whoever is in it). */
  fogRadius(): number {
    return this.fog.radius;
  }

  inFog(x: number, z: number): boolean {
    return inFog(x, z, ASYLUM.stack, this.fog.radius);
  }

  /** Where the step sends you (an upstairs file guides to its fire escape until you are up there). */
  private stepTarget(id: StepId): { x: number; z: number } | null {
    const ctx = this.ctx;
    const p = ctx.player;
    const file = (i: number): { x: number; z: number } => {
      const sp = RECORDS.spots[i]!;
      if (sp.y > 3 && p.y < 3) {
        const fe = i === FILE.nurses ? UPSTAIRS.west : UPSTAIRS.east;
        return { x: fe.x, z: fe.z + 0.8 };
      }
      return { x: sp.x, z: sp.z };
    };
    switch (id) {
      case 'office':
        return file(FILE.admin);
      case 'westWard':
        return file(FILE.ward);
      case 'nurses':
        return file(FILE.nurses);
      case 'power':
        return { x: ctx.level.data.defense.x, z: ctx.level.data.defense.z };
      case 'nine':
        return file(FILE.nine);
      case 'morgue':
        return file(FILE.morgue);
      case 'lanterns': {
        // the nearest lantern still dark (one upstairs guides to the east fire escape until you are up there)
        let best: { x: number; z: number } | null = null;
        let bestD = Infinity;
        for (let i = 0; i < LANTERNS.spots.length; i++) {
          if (lanternLit(this.souls, i)) continue;
          const l = LANTERNS.spots[i]!;
          const at = l.y > 3 && p.y < 3 ? { x: UPSTAIRS.east.x, z: UPSTAIRS.east.z + 0.8 } : { x: l.x, z: l.z };
          const d = Math.hypot(at.x - p.x, at.z - p.z);
          if (d < bestD) {
            bestD = d;
            best = at;
          }
        }
        return best;
      }
      case 'bell':
        return { x: BELL.x, z: BELL.z };
      case 'matron': {
        const b = ctx.zombies.boss;
        return b && b.alive ? { x: b.x, z: b.z } : { x: ASYLUM.isolation.x, z: ASYLUM.isolation.z };
      }
      case 'furnace':
        return { x: ASYLUM.damper.x, z: ASYLUM.damper.z + 1 };
      case 'dawn':
        return null;
    }
  }

  /** One objective for the step, in front of the mission's own (which the step tracks when it is theirs). */
  objectives(list: HudObjective[]): void {
    const ctx = this.ctx;
    const s = ctx.session;
    const p = ctx.player;
    const step = this.step();
    const id = STEPS[step]!;
    const awake = this.wakeAt !== null;
    const t = STEP_TEXT[id];
    const target = this.stepTarget(id);
    const dist = target ? Math.hypot(target.x - p.x, target.z - p.z) : -1;
    let detail = t.detail;
    if (id === 'lanterns') detail = `${t.detail}: ${LANTERNS.spots.map((l, i) => `${lanternLit(this.souls, i) ? 'LIT' : `${this.souls[i]}/${LANTERNS.souls}`}`).join('  ')}`;
    if (id === 'power' && s.defense.status === 'active') detail = s.defense.insideNow ? `Hold the boiler house yard - ${Math.round(s.defense.progress * 100)}%` : 'GET BACK TO THE GENERATORS';
    const n = recordsFound(this.records);
    // a step that is one of the mission's own contracts (the power, the Matron, the dawn) is shown as that contract
    const contract = id === 'power' ? 'defense' : id === 'matron' && awake ? 'hunt' : id === 'dawn' ? 'extract' : null;
    const mine = contract ? list.find((o) => o.id === contract && o.state !== 'locked' && o.state !== 'complete') : undefined;
    if (mine) {
      mine.title = `${step + 1}/${STEPS.length}  ${mine.title}`;
      const at = list.indexOf(mine);
      list.splice(at, 1);
      list.unshift(mine);
    } else {
      const prog = id === 'lanterns' ? this.souls.reduce((a, n) => a + Math.min(n, LANTERNS.souls), 0) / (LANTERNS.souls * LANTERNS.spots.length) : -1;
      list.unshift({ id: 'story', title: `${step + 1}/${STEPS.length}  ${t.title}`, detail, state: 'active', progress: prog, tracked: false, distance: dist });
    }
    // the lanterns, while any is dark and the bell not rung (they can be lit any time)
    const lit = lanternsLit(this.souls);
    if (id !== 'lanterns' && !awake && lit < LANTERNS.spots.length && s.hunt.status !== 'complete' && this.souls.some((n) => n > 0)) {
      list.push({ id: 'lanterns', title: 'THE VIGIL LANTERNS', detail: `${lit}/${LANTERNS.spots.length} burning`, state: 'active', progress: lit / LANTERNS.spots.length, tracked: false, distance: -1 });
    }
    list.push({ id: 'files', title: 'THE FILES', detail: `${n}/${RECORDS.spots.length} found`, state: n >= RECORDS.spots.length ? 'complete' : 'active', progress: n / RECORDS.spots.length, tracked: false, distance: -1 });
    const hunt = list.find((o) => o.id === 'hunt');
    if (hunt && s.hunt.status === 'available') {
      hunt.state = 'locked';
      hunt.detail = 'She sleeps until the chapel bell';
      hunt.progress = -1;
      hunt.distance = -1;
    }
    const ext = list.find((o) => o.id === 'extract');
    if (ext && ext.state === 'locked') ext.detail = 'Put the Matron to rest and shut the furnace first';
    else if (ext && (s.extraction.phase === 'called' || s.extraction.phase === 'inbound' || s.extraction.phase === 'landing')) ext.detail = 'Hold the lawn until first light';
    for (const o of list) o.tracked = false;
    if (list[0]) list[0].tracked = true;
  }

  /** The step's place on the maps and compass; the files still out there, faintly. */
  markers(out: MapMarker[], tracked: string | undefined): void {
    const s = this.ctx.session;
    const id = STEPS[this.step()]!;
    const target = this.stepTarget(id);
    if (target && tracked === 'story') out.push({ id: 'asy-step', kind: 'objective', x: target.x, z: target.z, label: STEP_TEXT[id].title, color: '#ffd27a', visible: true, compass: true, pulse: true });
    for (let i = 0; i < RECORDS.spots.length; i++) {
      if (this.records.found[i]) continue;
      const sp = RECORDS.spots[i]!;
      out.push({ id: `record-${sp.id}`, kind: 'objective', x: sp.x, z: sp.z, label: 'FILE', color: '#ffd27a', visible: true, compass: false, pulse: false, dim: true });
    }
    for (let i = 0; i < LANTERNS.spots.length; i++) {
      if (lanternLit(this.souls, i)) continue;
      const l = LANTERNS.spots[i]!;
      out.push({ id: `lantern-${l.id}`, kind: 'objective', x: l.x, z: l.z, label: 'LANTERN', color: '#ffb050', visible: true, compass: false, pulse: false, dim: id !== 'lanterns' });
    }
    if (bellReady(this.facts()) && id !== 'bell') out.push({ id: 'asy-bell', kind: 'objective', x: BELL.x, z: BELL.z, label: 'BELL', color: '#ffb050', visible: true, compass: false, pulse: false });
    if (s.hunt.status === 'available') {
      const m = out.find((o) => o.id === 'hunt');
      if (m) {
        m.label = 'ISOLATION - ASLEEP';
        m.dim = true;
        m.pulse = false;
        m.compass = false;
      }
    }
    if (this.fogStopAt === null && s.hunt.status === 'complete') out.push({ id: 'asy-damper', kind: 'objective', x: ASYLUM.damper.x, z: ASYLUM.damper.z, label: 'DAMPER', color: '#ff9a5a', visible: true, compass: tracked !== 'story', pulse: false });
  }

  dispose(): void {
    this.voice.stopAll();
    this.look.dispose();
    this.hud.dispose();
    this.root.removeFromParent();
  }
}
