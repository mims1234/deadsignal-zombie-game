/**
 * The Asylum's day and night, in the browser: owned by the mission runtime on that map only.
 *
 *  DAY    RECOVER THE RECORDS (three glowing patient files) and RESTORE THE POWER (the boiler house contract). The
 *         infected are slow and few; the Matron is nowhere on the hill.
 *  DUSK   the lamps come on one by one, the infected stir.
 *  NIGHT  the Matron wakes in the isolation block (PUT DOWN THE MATRON opens), the infected are many and fast.
 *  DAWN   calling the bird starts it: HOLD UNTIL DAWN, and it lands at first light.
 *
 * The hour is a pure function of the mission clock (`logic/timeOfDay.ts`); the records are `logic/records.ts`. This
 * file draws them, plays the radio and banners, keeps the hunt in step with the light and adds the objectives, map
 * markers and the nightfall clock to the HUD.
 *
 * Co-op (`follow`): the simulation owns the hunt and the files. A pickup is a request (`requestRecord`), and the
 * files taken arrive through `applyRecords`; everything else here follows the shared clock by itself.
 */
import * as THREE from 'three';
import { applyContractReward } from '../logic/economy';
import { createRecords, nearestRecord, pickUpRecord, recordInReach, recordsFound, type RecordsContract } from '../logic/records';
import { gateHunt, phaseTuning, timeOfDay, type TimeOfDay } from '../logic/timeOfDay';
import { DayNightLook } from '../render/dayNight';
import type { HudObjective, HudTimer, MapMarker } from '../ui/hudTypes';
import type { GameCtx } from '../game/ctx';
import { NIGHT_LINES as L, RECORD_NOTES } from './lore';
import { NIGHT_BEATS, NIGHTFALL, RECORDS } from './nightConfig';
import { NightHud } from './nightHud';

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

export class AsylumNight {
  readonly root = new THREE.Group();
  /** The day contract. */
  records: RecordsContract = createRecords();
  /** The hour this frame (read by the mission runtime for its clock). */
  tod: TimeOfDay = timeOfDay(0);
  /** Co-op: the simulation's copy of the operation is the truth; ask it for a file instead of taking it. */
  follow = false;
  requestRecord: ((index: number) => void) | null = null;
  private readonly look: DayNightLook;
  private readonly hud = new NightHud();
  private readonly folders: FolderModel[] = [];
  private readonly queue: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private lastPhase: TimeOfDay['phase'] | null = null;
  private lastPhaseApplied = -1;

  constructor(private readonly ctx: GameCtx) {
    this.root.name = 'AsylumNight';
    ctx.worldRoot.add(this.root);
    this.look = new DayNightLook(ctx.renderer, ctx.level);
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
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 2.6, 10, 1, true), beamMat);
      beam.position.y = 1.3;
      root.add(folder, halo, beam);
      this.root.add(root);
      this.folders.push({ root, folder, halo, beam });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------------------------

  /** A fresh run: afternoon again, every file in place, the Matron asleep. */
  reset(): void {
    const ctx = this.ctx;
    this.records = createRecords();
    for (const f of this.folders) f.root.visible = true;
    this.queue.length = 0;
    this.lastPhase = null;
    this.lastPhaseApplied = -1;
    this.hud.hideNote();
    this.tod = timeOfDay(0);
    // the run starts in daylight: the populate that follows makes sleepy infected, and no Matron
    ctx.zombies.setPhaseTuning(phaseTuning(this.tod));
    gateHunt(ctx.session.hunt, 0);
    this.look.apply(this.tod, ctx.time);
  }

  /** Every frame, before the mission runtime runs its contracts (`dt` 0 on the title screen: no clock). */
  update(dt: number, time: number): void {
    const ctx = this.ctx;
    const s = ctx.session;
    const ex = s.extraction;
    this.clock += dt;
    const tod = timeOfDay(s.elapsed, ex.calledAt);
    this.tod = tod;
    // the light: cheap, but there is no need to redo it for a still clock
    if (Math.abs(s.elapsed - this.lastPhaseApplied) > 0.04 || tod.phase === 'dusk' || tod.phase === 'dawn' || dt === 0) {
      this.lastPhaseApplied = s.elapsed;
      this.look.apply(tod, time);
      ctx.zombies.setPhaseTuning(phaseTuning(tod));
    }

    // the hunt follows the light: closed by day (nobody to hunt), open from nightfall on
    if (!this.follow) {
      gateHunt(s.hunt, s.elapsed);
      const b = ctx.zombies.boss;
      if (s.hunt.status === 'available' && b && b.alive && !b.puppet) ctx.zombies.remove(b);
    }

    if (dt > 0) {
      this.beats(tod);
      this.pickups();
    }
    // the delayed radio
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i]!.at > this.clock) continue;
      const q = this.queue.splice(i, 1)[0]!;
      i--;
      q.fn();
    }
    this.animateFolders(time);
    this.hud.update(dt, tod.phase, this.toNext(tod));
  }

  private later(seconds: number, fn: () => void): void {
    this.queue.push({ at: this.clock + seconds, fn });
  }

  /** 0..1 progress of the bar in the chip: through the day toward nightfall, through dusk, through the dawn. */
  private toNext(tod: TimeOfDay): number {
    if (tod.phase === 'day') return 1 - tod.t;
    if (tod.phase === 'dusk') return 1 - tod.t;
    if (tod.phase === 'dawn') return tod.t;
    return 1;
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
    if (s.elapsed >= NIGHT_BEATS.recordsAsk && recordsFound(this.records) < RECORDS.spots.length && once('asy:records')) {
      ctx.radio(L.okafor, L.recordsAsk, 8);
    }
    if (s.elapsed >= NIGHT_BEATS.duskWarning && s.elapsed < NIGHTFALL && once('asy:duskWarn')) {
      ctx.banner(L.duskWarnTitle, L.duskWarnSub, 'warn', 4);
      ctx.radio(L.vance, L.duskWarn, 6);
      ctx.audio.play('amb_thunder', { priority: 2, volume: 0.6 });
    }
    if (tod.phase !== this.lastPhase) {
      const from = this.lastPhase;
      this.lastPhase = tod.phase;
      if (tod.phase === 'dusk' && once('asy:dusk')) {
        ctx.banner(L.duskTitle, L.duskSub, 'warn', 4.5);
        ctx.radio(L.okafor, L.dusk, 6);
        ctx.audio.play('zombie_groan', { priority: 2, volume: 0.9, rate: 0.7, pos: { x: ctx.player.x + 30, y: 2, z: ctx.player.z - 25 } });
      }
      if (tod.phase === 'night' && from !== null && once('asy:night')) this.nightfall();
      if (tod.phase === 'dawn' && once('asy:dawn')) {
        this.later(2, () => {
          ctx.banner(L.callTitle, L.callSub, 'warn', 4.5);
          ctx.radio(L.pilot, L.call, 7);
        });
      }
    }
    if (s.hunt.status === 'complete' && once('asy:matronDown')) this.later(4, () => ctx.radio(L.okafor, L.matronDown, 5));
    if (s.extraction.phase === 'landed' && once('asy:firstLight')) this.later(3, () => ctx.radio(L.okafor, L.dawn, 6));
  }

  /** Night falls and the Matron wakes: a scream from the isolation block. */
  private nightfall(): void {
    const ctx = this.ctx;
    const h = ctx.level.data.hunt;
    ctx.banner(L.nightTitle, L.nightSub, 'danger', 4);
    ctx.audio.play('amb_thunder', { priority: 2, volume: 0.8 });
    this.later(4.5, () => {
      ctx.audio.play('zombie_screech', { priority: 3, volume: 1.5, rate: 0.62, pos: { x: h.wardenX, y: 3, z: h.wardenZ } });
      ctx.audio.play('warden_roar', { priority: 3, volume: 1.2, rate: 0.85, delay: 0.9, pos: { x: h.wardenX, y: 3, z: h.wardenZ } });
      ctx.banner(L.wakeTitle, L.wakeSub, 'danger', 5);
      ctx.radio(L.okafor, L.wake, 7);
      if (recordsFound(this.records) < RECORDS.spots.length) this.later(9, () => ctx.radio(L.vance, L.recordsLate, 5));
    });
  }

  /** Walk into a file to take it. */
  private pickups(): void {
    const ctx = this.ctx;
    if (!ctx.playerAlive()) return;
    const p = ctx.player;
    const i = recordInReach(this.records, p.x, p.z);
    if (i < 0) return;
    if (this.follow) {
      this.requestRecord?.(i);
      return;
    }
    const got = pickUpRecord(this.records, i);
    if (got) this.onRecord(got.index, got.cash, got.count, got.completed);
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
      ctx.feed(`RECORDS RECOVERED  +$${a.cash}`, 'good');
    } else {
      ctx.banner(`PATIENT FILE ${count}/${total}`, `${note.title}   +$${a.cash.toLocaleString('en-US')}`, 'good', 4);
      ctx.feed(`PATIENT FILE ${count}/${total}  +$${a.cash}`, 'good');
    }
    this.hud.showNote(note, index, total);
    this.later(2.5, () => ctx.radio(L.okafor, note.comment, 8));
  }

  /** Co-op: the files the simulation says are taken (each newly taken one plays here once). */
  applyRecords(found: readonly boolean[]): void {
    for (let i = 0; i < found.length && i < this.records.found.length; i++) {
      if (!found[i] || this.records.found[i]) continue;
      const got = pickUpRecord(this.records, i);
      if (got) this.onRecord(got.index, got.cash, got.count, got.completed);
    }
  }

  /** The boiler house generators are running (the mission runtime's `onPowerRestored`). */
  powerRestored(): void {
    this.later(3, () => this.ctx.radio(L.okafor, L.power, 6));
  }

  private animateFolders(time: number): void {
    for (let i = 0; i < this.folders.length; i++) {
      const f = this.folders[i]!;
      if (!f.root.visible) continue;
      f.folder.position.y = 0.08 + Math.sin(time * 2.1 + i) * 0.025;
      f.folder.rotation.y += 0.004;
      f.halo.material.opacity = 0.7 + 0.25 * Math.sin(time * 3.3 + i * 1.7);
      // the beam marks the spot from across a room, more faintly in the daylight
      (f.beam.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.08 * this.tod.dark;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------------------------

  /** The main clock while it is light: the time left until the Matron's round. */
  timer(): HudTimer | null {
    const tod = this.tod;
    if (tod.phase === 'day' || tod.phase === 'dusk') return { label: 'NIGHTFALL IN', seconds: Math.max(0, tod.next), urgent: tod.phase === 'dusk' };
    return null;
  }

  /**
   * Day and night missions, in order: the records and the power by day, the Matron at night, then the bird. Guides
   * the player to the mission of the hour (the files and the generators while it is light, her once she is awake).
   */
  objectives(list: HudObjective[]): void {
    const ctx = this.ctx;
    const s = ctx.session;
    const p = ctx.player;
    const total = RECORDS.spots.length;
    const n = recordsFound(this.records);
    const near = nearestRecord(this.records, p.x, p.z);
    const night = this.tod.phase === 'night' || this.tod.phase === 'dawn';
    const rec: HudObjective = {
      id: 'records',
      title: 'RECOVER THE RECORDS',
      detail: n >= total ? 'All three patient files recovered' : `Patient files ${n}/${total} - nearest in ${RECORDS.spots[near!.index]!.place}`,
      state: n >= total ? 'complete' : 'active',
      progress: n / total,
      tracked: false,
      distance: near ? near.distance : -1,
    };
    list.unshift(rec);
    const hunt = list.find((o) => o.id === 'hunt');
    if (hunt && s.hunt.status === 'available') {
      hunt.state = 'locked';
      hunt.detail = `She walks at lights-out - nightfall in ${fmt(Math.max(0, this.tod.next))}`;
      hunt.progress = -1;
      hunt.distance = -1;
    }
    const def = list.find((o) => o.id === 'defense');
    if (def && def.state === 'available' && night) def.detail = `${def.detail} - the lamps need it`;
    const ext = list.find((o) => o.id === 'extract');
    if (ext && ext.state === 'locked') ext.detail = 'Restore the power and put her down - then hold the lawn until dawn';
    else if (ext && (s.extraction.phase === 'called' || s.extraction.phase === 'inbound' || s.extraction.phase === 'landing')) ext.detail = 'Hold the lawn until first light';
    // what to do now: by day the files and the generators (nearest first); at night the Matron, then the rest
    for (const o of list) o.tracked = false;
    const open = (o: HudObjective | undefined): o is HudObjective => !!o && (o.state === 'active' || o.state === 'available');
    const order = night ? ['hunt', 'defense', 'records'] : ['records', 'defense'];
    let pick: HudObjective | undefined;
    if (!night) {
      const day = list.filter((o) => order.includes(o.id) && open(o));
      if (day.length > 0) pick = day.reduce((a, b) => (a.distance <= b.distance ? a : b));
    } else {
      for (const id of order) {
        const o = list.find((x) => x.id === id);
        if (open(o)) {
          pick = o;
          break;
        }
      }
    }
    const extract = list.find((o) => o.id === 'extract');
    if (extract && extract.state !== 'locked') pick = extract;
    if (!pick && !night) pick = list.find((o) => o.id === 'hunt');
    if (pick) pick.tracked = true;
  }

  /** The files on the maps and compass; the Matron's block shows as asleep by day. */
  markers(out: MapMarker[], tracked: string | undefined): void {
    const s = this.ctx.session;
    for (let i = 0; i < RECORDS.spots.length; i++) {
      if (this.records.found[i]) continue;
      const sp = RECORDS.spots[i]!;
      out.push({ id: `record-${sp.id}`, kind: 'objective', x: sp.x, z: sp.z, label: 'FILE', color: '#ffd27a', visible: true, compass: true, pulse: tracked === 'records' });
    }
    if (s.hunt.status === 'available') {
      const m = out.find((o) => o.id === 'hunt');
      if (m) {
        m.label = 'ISOLATION - NIGHT';
        m.dim = true;
        m.pulse = false;
        m.compass = false;
      }
    }
  }

  dispose(): void {
    this.look.dispose();
    this.hud.dispose();
    this.root.removeFromParent();
  }
}

function fmt(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

