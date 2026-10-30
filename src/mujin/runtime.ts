/**
 * MUJIN in the game: the solo game runs the loop and the station's infected here (`loop.ts`, `director.ts`); a co-op
 * player shows the simulation's loop from its reports (`applyWire`) and sends what they do as requests. Either way,
 * everything on screen and in the ears follows the loop's state, compared frame to frame (`react`): the reset and its
 * flash, the lamps, the change of the loop drawn into the station (`look.ts`), the PA, the bell, the score, the
 * payphone, the Tall Lady's "po", the White Shape's stare, the Stationmaster's punch, Ren, and the dawn.
 *
 * On phones nothing new sits in the middle: the loop and the bell are the top timer, the lamps are in the world, every
 * line said is one caption along the top (the radio line), and the journal waits in the pause menu.
 */
import type { InteractionTarget } from '../game/interaction';
import type { Game } from '../game/game';
import type { HudState, MapDynamic } from '../ui/hudTypes';
import type { Zombie } from '../enemies/zombie';
import { ANOMALIES } from './anomalies';
import { MujinDirector, mujinSpawnAllowed, mujinVariantPicker } from './director';
import { buildJournal, loadMujin, REN_POSTS, saveMujin, type MujinProgress } from './journal';
import { LINE } from './lines';
import { StationLook } from './look';
import { decodeLoop, MujinLoop, MUJIN_LOOP, READ, REN, REN_STATE, type LoopView } from './loop';
import { MUJIN, MUJIN_POCKET, PLATFORM_Y, SEALS, SPOTS, sealedAt } from './places';
import { MujinSound } from './sound';

const SPEAKER = { x: 2, y: 3.6, z: -6.2 };

export class MujinRuntime {
  readonly loop = new MujinLoop();
  private readonly dir: MujinDirector;
  readonly look = new StationLook();
  readonly sound: MujinSound;
  /** A co-op guest: the simulation runs the loop; this shows it and asks. */
  remote = false;
  /** Co-op: what this player does goes to the simulation (`coop.ts` sets it). */
  request: ((a: string, i?: number) => void) | null = null;
  private wire: LoopView | null = null;
  private prev: LoopView | null = null;
  private progress: MujinProgress = loadMujin();
  private active = false;
  private t = 0;
  /** Timers for the station's recurring sounds. */
  private next = { pa: 20, ring: 0, crossing: 0, melody: 0, wrongPa: 6, lost: 0, murmur: 6, tall: 4, bell: 0, master: 0 };
  /** The White Shape's stare on you (0..1+), and the Tall Lady's mark. */
  private gaze = 0;
  private marked = false;
  /** One loop back: in the pocket room since this time (-1: not). */
  private pocketAt = -1;
  /** Leading Ren by the hand (solo; a co-op player asks). */
  private sm = { said: new Set<string>(), near: false, open: false, dead: false };
  private flash: HTMLDivElement | null = null;
  private veil: HTMLDivElement | null = null;
  private dawnT = -1;
  private renBoarded = false;
  private sex: 'f' | 'm' = 'f';

  constructor(private readonly g: Game) {
    this.sound = new MujinSound(g.audio);
    g.worldRoot.add(this.look.root);
    this.dir = new MujinDirector(g.level, g.zombies);
    this.dir.onSealsChange = () => g.flow.cancel();
    g.zombies.pickVariant = mujinVariantPicker();
    g.zombies.spawnAllowed = mujinSpawnAllowed(() => this.view.sealed);
    g.zenv.punch = () => this.punched();
    g.interaction.sources.push((t) => this.targets(t));
    g.menus.pauseTab = () => ({ label: 'JOURNAL', build: () => buildJournal(this.progress, this.view) });
    g.mission.onTrain = (ev) => this.onTrain(ev);
    this.sound.onLine = (id) => this.caption(id);
  }

  /** What the loop is now (the simulation's in co-op). */
  get view(): LoopView {
    return this.remote ? (this.wire ?? this.loop.view) : this.loop.view;
  }

  /** Load the voices and the score (the loading screen waits for it). */
  preload(progress?: (done: number, total: number) => void): Promise<void> {
    return this.sound.load(progress);
  }

  /** A new run. Solo: the loop starts and the Stationmaster is not on the platform yet (call after `populate`). */
  reset(coop: boolean): void {
    this.remote = coop;
    this.wire = null;
    this.active = true;
    this.t = 0;
    this.gaze = 0;
    this.marked = false;
    this.pocketAt = -1;
    this.punchAt = -1;
    this.dawnT = -1;
    this.renBoarded = false;
    this.sm = { said: new Set(), near: false, open: false, dead: false };
    this.next = { pa: 20, ring: 0, crossing: 0, melody: 0, wrongPa: 6, lost: 0, murmur: 6, tall: 4, bell: 0, master: 0 };
    this.sex = Math.random() < 0.5 ? 'f' : 'm';
    this.everTaught.clear();
    this.progress = loadMujin();
    const rng = this.g.rng;
    this.loop.reset(() => rng.f());
    this.loop.drain();
    if (!coop) {
      this.dir.reset();
      this.g.session.hunt.status = 'available';
    }
    this.prev = null;
    this.look.setChange(null);
    this.look.setLamps(0);
    this.sound.stopAll(0.2);
    this.setFilter(0);
    this.opening();
  }

  /** A co-op report's row (`encodeLoop`). */
  applyWire(row: unknown): void {
    const v = decodeLoop(row);
    if (v) this.wire = v;
  }

  // ---------------------------------------------------------------------------------------------
  // every frame
  // ---------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.active) return;
    const g = this.g;
    this.t += dt;
    const playing = g.state === 'playing';
    if (!this.remote && playing && !g.session.ended) this.authority(dt);
    const v = this.view;
    if (this.remote) this.dir.syncSeals(v.sealed);
    this.react(this.prev, v);
    this.prev = { ...v };
    // the station as this loop has it
    const a = v.anomaly >= 0 ? ANOMALIES[v.anomaly]! : null;
    this.look.setChange(v.phase === 'dawn' ? null : (a?.id ?? null));
    this.look.setLamps(v.dawn ? 5 : v.lamps);
    const renShown = v.ren === REN_STATE.here || v.ren === REN_STATE.safe;
    const p = g.player;
    this.look.setRen(v.renX, v.renZ, Math.atan2(-(p.x - v.renX), -(p.z - v.renZ)), renShown && !this.renBoarded);
    this.look.setCrossing(a?.id === 'crossing_ring' || g.session.extraction.phase === 'landing' || g.session.extraction.phase === 'inbound');
    this.look.update(dt, p, v.sealed);
    if (!playing) {
      this.sound.update();
      return;
    }
    this.station(dt, v);
    this.lessons(v);
    this.kinds(dt, v);
    this.keepOut(v);
    this.pocket();
    this.dawn(dt, v);
    this.sound.update();
  }

  /** Solo: the loop, the station's infected, the Stationmaster, the dawn train. */
  private authority(dt: number): void {
    const g = this.g;
    const s = g.session;
    const q = this.loop;
    q.tick(dt);
    for (const e of q.drain()) {
      if (e.kind === 'result' && !e.right) this.dir.wrong();
      else if (e.kind === 'night') g.endRun('defeat', 'The night took the station');
      else if (e.kind === 'dawn' && s.defense.status !== 'complete') {
        s.defense.status = 'complete';
        s.defense.progress = 1;
        g.mission.completeDefense();
      }
    }
    if (q.view.renLead >= 0 && !g.playerAlive()) q.dropRen();
    q.stepRen(dt, q.view.renLead >= 0 && g.playerAlive() ? { x: g.player.x, z: g.player.z, yaw: g.player.yaw } : null);
    const state = this.dir.step(q.view, g.rng);
    if (s.hunt.status !== 'complete') s.hunt.status = state === 'away' ? 'available' : 'active';
    if (state === 'away') g.zombies.vanish((z) => z.isBoss);
    if (s.extraction.phase === 'available') g.mission.callNow();
  }

  /** What changed since the last frame, said and shown once (solo and co-op alike). */
  private react(a: LoopView | null, b: LoopView): void {
    const g = this.g;
    if (!a) {
      if (b.phase === 'fight') this.loopStart(b);
      return;
    }
    if (b.loop !== a.loop || (b.phase === 'fight' && a.phase !== 'fight' && a.phase !== 'dawn')) this.loopStart(b);
    if (b.phase === 'bell' && a.phase === 'fight') {
      g.banner('THE BELL', b.read === READ.none ? 'Report the change, or ring the All Clear, before it stops' : 'The station has been read - hold on', 'warn', 4);
      this.sound.say('pa_bell_ja', { pos: SPEAKER, story: true });
      this.sound.say('pa_bell_en', { pos: SPEAKER, story: true });
      this.sound.cue('bell', { fade: 0.4 });
    }
    // a read: who, and where
    if (b.read !== a.read && b.read !== READ.none) {
      g.feed(b.read === READ.clear || this.lastClear ? 'THE ALL CLEAR WAS RUNG' : 'THE STATION HAS BEEN READ', 'warn');
      this.lastClear = false;
    }
    // the reset: the result, the lamps, the night
    if (b.phase !== a.phase && (b.phase === 'reset' || b.phase === 'dawn') && a.phase === 'bell') this.result(a, b);
    if (b.calls > a.calls) this.call(b.calls);
    if (b.ren !== a.ren) this.renChanged(a.ren, b.ren);
    if (b.renLead >= 0 && a.renLead < 0) this.sound.say('ren_hold', { pos: { x: b.renX, y: 1.5, z: b.renZ }, chain: 'close', story: true });
  }

  private lastClear = false;
  /** The first loops' lessons, each said once (a text line on the top edge, no voice). */
  private readonly taught = new Set<string>();

  private teach(id: string, text: string, secs = 9): void {
    if (this.taught.has(`${this.view.loop}:${id}`) || this.everTaught.has(id)) return;
    this.taught.add(`${this.view.loop}:${id}`);
    this.everTaught.add(id);
    this.g.radio('STATION', text, secs);
  }
  private readonly everTaught = new Set<string>();

  /** How the station works, told as the first loops go (once a run). */
  private lessons(v: LoopView): void {
    if (v.loop === 1 && v.phase === 'fight') {
      if (v.t > 6) this.teach('lamps', 'Five lamps hang under the roof of platform 1. Each loop you read the station right, one lights. Five lit and the dawn train comes.');
      if (v.t > 14) this.teach('echoes', 'The pale people waiting are echoes of the last train - not infected, not alive. They are part of the station. Watch them: they can change too.', 9);
      if (v.t > 26 && v.read === READ.none) this.teach('clear', 'Nothing changes in the first loop: learn how the station looks. Then go to the platform bell and hold E to ring the All Clear.');
    }
    if (v.loop === 2 && v.phase === 'fight' && v.t > 5) this.teach('report', 'From now on one thing may be different. Walk up to it and hold E to report it - the map shows every place that can change. If nothing is different, ring the All Clear.', 10);
    if (v.loop >= 2 && v.phase === 'fight' && v.t > 30 && v.read === READ.none && v.lamps === 0) this.teach('stuck', 'Reports are final: the first one in a loop counts. Wrong, and every lamp goes out.', 8);
  }

  /** A loop begins: the station put back, its time said, the music changed a little more. */
  private loopStart(v: LoopView): void {
    const g = this.g;
    const a = v.anomaly >= 0 ? ANOMALIES[v.anomaly] : null;
    this.next.wrongPa = 6;
    this.sm.near = false;
    if (v.loop > 1) g.banner(`LOOP ${v.loop}`, v.lamps > 0 ? `${v.lamps} of 5 lamps lit. Something may have changed.` : 'Something may have changed. Look carefully.', 'info', 3.5);
    else g.banner('MUJIN', 'Light the five lamps on platform 1 to bring the dawn train. Loop 1: nothing has changed yet.', 'info', 6);
    this.taught.clear();
    // the PA's chime and the time
    this.sound.chime(SPEAKER);
    window.setTimeout(() => {
      this.sound.say('pa_time_ja', { pos: SPEAKER, story: true });
      this.sound.say('pa_time_en', { pos: SPEAKER, story: true });
    }, 1800);
    // the loop theme: the same each loop, and a little more broken for every lamp that went out
    const broken = Math.min(4, v.wrongs);
    this.sound.cue('loop', { loop: true, fade: 1.2, detune: -broken * 18 + (v.loop % 2 ? 6 : -6), rate: 1 - broken * 0.012, backwards: a?.id === 'music_back' });
  }

  /** The bell stopped: right or wrong. */
  private result(a: LoopView, b: LoopView): void {
    const g = this.g;
    const right = b.last === 1;
    const was = a.anomaly >= 0 ? ANOMALIES[a.anomaly]!.was : a.anomaly === REN ? 'The girl on platform 2 was out of place.' : 'Nothing was wrong.';
    this.sound.reset();
    window.setTimeout(() => this.whiteFlash(), 1300);
    if (right) {
      g.banner('A LAMP IS LIT', `${was}  ${b.lamps} of 5.`, 'good', 5);
      this.sound.say('pa_order_ja', { pos: SPEAKER, story: true });
      this.sound.say(`sq${this.sex}_right`, { story: true });
      // a post of Ren's thread for every right read; the change, remembered
      this.progress.posts = Math.min(REN_POSTS.length - 1, this.progress.posts + 1);
      if (a.anomaly >= 0 && !this.progress.found.includes(ANOMALIES[a.anomaly]!.id)) this.progress.found.push(ANOMALIES[a.anomaly]!.id);
      saveMujin(this.progress);
    } else {
      const seal = SEALS.findIndex((_, i) => (b.sealed & (1 << i)) !== 0 && !(a.sealed & (1 << i)));
      g.banner('THE LAMPS GO OUT', `${was}${seal >= 0 ? `  The night takes ${SEALS[seal]!.name.toLowerCase()}.` : ''}`, 'danger', 6);
      this.sound.say('pa_disorder_ja', { pos: SPEAKER, story: true });
      this.sound.say('pa_disorder_en', { pos: SPEAKER, story: true });
      this.sound.say(`sq${this.sex}_wrong`, { story: true });
      if (b.wrongRun === MUJIN_LOOP.wrongToLose - 1) g.feed('ONE MORE WRONG READ AND THE NIGHT TAKES THE STATION', 'danger');
    }
    if (b.phase === 'dawn' && b.dawn) {
      g.banner(b.late ? 'THE LAST LOOP' : 'EVERY LAMP IS LIT', b.late ? 'The night has run out. The Stationmaster waits on platform 1.' : 'The station is in order. Stop the Stationmaster - then the dawn train comes.', 'good', 7);
      this.sound.say('sm_lamps', { story: true });
      this.sound.cue('master', { loop: true, fade: 2 });
    }
    if (b.phase === 'dawn' && !b.dawn) {
      this.sound.say('pa_night_ja', { pos: SPEAKER, story: true });
      this.sound.say('pa_night_en', { pos: SPEAKER, story: true });
    }
  }

  /** The payphone answered: Ren on the line (or, the fifth time, live). */
  private call(n: number): void {
    const id = `ren_call${Math.min(5, n)}`;
    this.sound.say(id, { chain: 'phone', story: true });
    this.g.feed(n >= MUJIN_LOOP.calls ? 'THE CALL WAS LIVE' : `A CALL FROM THE STATION (${n} OF 5)`, n >= MUJIN_LOOP.calls ? 'warn' : 'normal');
    this.progress.posts = Math.min(REN_POSTS.length - 1, this.progress.posts + 1);
    saveMujin(this.progress);
  }

  private renChanged(from: number, to: number): void {
    const g = this.g;
    const v = this.view;
    if (to === REN_STATE.here) g.banner('SOMEONE ON PLATFORM 2', 'A girl stands on the far platform. The station counts her as out of place.', 'warn', 5);
    else if (to === REN_STATE.safe) {
      g.banner('REN IS SAFE', 'She waits on the bench. The station counts it against you - bring her the dawn.', 'good', 6);
      this.sound.say('ren_safe', { pos: { x: v.renX, y: 1.2, z: v.renZ }, story: true });
      window.setTimeout(() => this.sound.say('sm_ren', { story: true }), 4500);
    } else if (to === REN_STATE.gone && from === REN_STATE.here) {
      this.sound.say('ren_gone', { pos: { x: v.renX, y: 1.4, z: v.renZ }, chain: 'far', story: true });
      g.feed('SHE IS GONE', 'danger');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // the station's sounds through a loop
  // ---------------------------------------------------------------------------------------------

  private station(dt: number, v: LoopView): void {
    const n = this.next;
    for (const k of Object.keys(n) as (keyof typeof n)[]) n[k] -= dt;
    const a = v.anomaly >= 0 ? ANOMALIES[v.anomaly]!.id : null;
    const fight = v.phase === 'fight' || v.phase === 'bell';
    // the bell rings through its last twenty seconds
    if (v.phase === 'bell' && n.bell <= 0) {
      n.bell = 0.6;
      this.sound.bell({ x: MUJIN.bell.x, y: 2.4, z: MUJIN.bell.z });
    }
    // the PA, now and then: a train that never comes
    if (fight && n.pa <= 0 && a !== 'pa_wrong') {
      n.pa = 38 + Math.random() * 20;
      const which = ['pa_arrive', 'pa_delay', 'pa_name'][Math.floor(Math.random() * 3)]!;
      this.sound.chime(SPEAKER);
      window.setTimeout(() => {
        this.sound.say(`${which}_ja`, { pos: SPEAKER, story: true });
        this.sound.say(`${which}_en`, { pos: SPEAKER, story: true });
      }, 1700);
    }
    if (!fight) return;
    // the changes that are heard
    if (a === 'pa_wrong' && n.wrongPa <= 0) {
      n.wrongPa = 26;
      this.sound.chime(SPEAKER);
      window.setTimeout(() => {
        this.sound.say('pa_wrong_ja', { pos: SPEAKER, story: true });
        this.sound.say('pa_wrong_en', { pos: SPEAKER, story: true });
      }, 1700);
    }
    if (a === 'crossing_ring' && n.crossing <= 0) {
      n.crossing = 6;
      this.sound.crossing({ x: 39, y: 2.4, z: -5.5 }, 5.6);
    }
    if (a === 'vend_melody' && n.melody <= 0) {
      n.melody = 7;
      this.sound.chime({ x: SPOTS[9]!.x, y: 1.2, z: SPOTS[9]!.z });
    }
    if (a === 'lostprop_ring' && n.lost <= 0) {
      n.lost = 3;
      this.sound.ring({ x: 3.4, y: 1.2, z: -18.5 });
    }
    // the payphone, ringing for whoever will answer
    if (MujinLoop.phoneRinging(v) && n.ring <= 0) {
      n.ring = 3;
      this.sound.ring({ x: MUJIN.payphone.x - 0.9, y: 1.3, z: MUJIN.payphone.z });
    }
  }

  /** The station's own: the Tall Lady's voice and mark, the White Shape's stare, the commuters, the Stationmaster. */
  private kinds(dt: number, v: LoopView): void {
    const g = this.g;
    const p = g.player;
    const n = this.next;
    let stare = false;
    let hunted = false;
    let nearTall: Zombie | null = null;
    let nearCommuter: Zombie | null = null;
    let master: Zombie | null = null;
    let dTall = Infinity;
    let dCom = Infinity;
    const fx = -Math.sin(p.yaw) * Math.cos(p.pitch);
    const fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    for (const z of g.zombies.zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (z.variant === 'tall') {
        if (d < dTall) {
          dTall = d;
          nearTall = z;
        }
        if (d < 40 && (z.state === 'chase' || z.state === 'attack')) hunted = true;
      } else if (z.variant === 'shape' && d < 75) {
        const tx = (z.x - p.x) / Math.max(d, 1e-3);
        const tz = (z.z - p.z) / Math.max(d, 1e-3);
        if (fx * tx + fz * tz > 0.93 && !g.level.world.segmentBlocked(p.x, p.y + 1.6, p.z, z.x, 1.4, z.z, 'shots')) stare = true;
      } else if (z.variant === 'commuter' && d < dCom) {
        dCom = d;
        nearCommuter = z;
      } else if (z.variant === 'master') master = z;
    }
    // the White Shape: looked at, the world goes soft and your aim wanders
    this.gaze = stare ? Math.min(1.6, this.gaze + dt / 2) : Math.max(0, this.gaze - dt / 1.2);
    const k = Math.max(0, this.gaze - 0.25);
    if (k > 0 && g.playerAlive()) {
      p.yaw += Math.sin(this.t * 1.7) * 0.5 * k * dt;
      p.pitch += Math.sin(this.t * 2.3 + 1) * 0.25 * k * dt;
    }
    this.setFilter(k);
    this.sound.hold('shape', Math.min(1, this.gaze), 1760);
    // the Tall Lady: her voice from wherever she is, and the mark on whoever she hunts
    if (nearTall && dTall < 50 && n.tall <= 0) {
      n.tall = 6 + Math.random() * 4;
      this.sound.say(`tall_po${1 + Math.floor(Math.random() * 4)}`, { pos: { x: nearTall.x, y: 2.6, z: nearTall.z }, chain: 'monster' });
    }
    if (hunted !== this.marked) {
      this.marked = hunted;
      if (hunted) {
        g.banner('SHE HEARD YOU', 'The Tall Lady will follow you anywhere - stand in the shrine\'s salt circle to be lost to her', 'danger', 5);
        this.sound.say(`sq${this.sex}_marked`, { story: true });
      }
    }
    this.setVeil(this.marked);
    // the commuters mutter as you pass
    if (nearCommuter && dCom < 9 && n.murmur <= 0) {
      n.murmur = 7 + Math.random() * 6;
      this.sound.say(`cm_${1 + Math.floor(Math.random() * 6)}`, { pos: { x: nearCommuter.x, y: 1.6, z: nearCommuter.z }, chain: 'far', volume: 0.8 });
    }
    // the Stationmaster: his words, his theme while he is near
    if (master) {
      const d = Math.hypot(master.x - p.x, master.z - p.z);
      const say = (id: string): void => {
        if (this.sm.said.has(id)) return;
        this.sm.said.add(id);
        this.sound.say(id, { pos: { x: master!.x, y: 1.7, z: master!.z }, story: true });
      };
      if (!v.dawn) {
        if (d < 12 && !this.sm.near) {
          this.sm.near = true;
          this.sound.say(this.sm.said.has('sm_tickets') ? 'sm_place' : 'sm_tickets', { pos: { x: master.x, y: 1.7, z: master.z } });
          this.sm.said.add('sm_tickets');
        }
        if (d < 20 && v.loop >= MUJIN_LOOP.masterFrom && !this.sm.said.has('sm_early')) say('sm_early');
        if (d > 25) this.sm.near = false;
        if (v.loop >= MUJIN_LOOP.masterFrom + 2) say('sm_kept');
      } else if (!this.sm.open && d < 18) {
        this.sm.open = true;
        say('sm_fight');
      }
    }
    if (v.dawn && !this.sm.dead && g.session.hunt.status === 'complete') {
      this.sm.dead = true;
      this.sound.say('sm_fall', { story: true });
    }
  }

  /** Anyone inside an area the night has taken is put back on platform 1. */
  private keepOut(v: LoopView): void {
    const g = this.g;
    const p = g.player;
    if (!v.sealed || this.pocketAt >= 0 || !g.playerAlive()) return;
    if (!sealedAt(v.sealed, p.x, p.z)) return;
    const i = SEALS.findIndex((_, k) => (v.sealed & (1 << k)) !== 0 && sealedAt(1 << k, p.x, p.z));
    this.teleport(MUJIN.start.x, MUJIN.start.z, PLATFORM_Y);
    this.whiteFlash();
    g.banner('THE NIGHT TOOK IT', `${SEALS[i]?.name ?? 'That part of the station'} is gone. You are back on platform 1.`, 'danger', 4);
  }

  // ---------------------------------------------------------------------------------------------
  // the Stationmaster's punch: one loop back
  // ---------------------------------------------------------------------------------------------

  /** His punch landed on this player (solo: his env; co-op: the simulation's word). */
  punched(): void {
    const g = this.g;
    if (this.pocketAt >= 0 || this.punchAt >= 0 || !g.playerAlive()) return;
    this.sound.punch();
    this.sound.say(Math.random() < 0.5 ? 'sm_punch1' : 'sm_punch2', { chain: 'close', story: true });
    // whoever she was holding on to has let go
    if (!this.remote && this.loop.view.renLead >= 0) this.loop.dropRen();
    this.punchAt = this.t + 0.65;
  }

  /** When the punch takes them (on the game's clock, so a pause or a background tab never loses it). */
  private punchAt = -1;

  private pocket(): void {
    const g = this.g;
    const p = g.player;
    if (this.punchAt >= 0 && this.t >= this.punchAt) {
      this.punchAt = -1;
      this.whiteFlash();
      this.teleport(MUJIN.pocketWake.x, MUJIN.pocketWake.z, 0);
      this.pocketAt = this.t;
      g.banner('ONE LOOP BACK', 'The waiting room, again. Find the door.', 'warn', 4);
      this.sound.say(`sq${this.sex}_punched`, { story: true });
      this.sound.say('sm_pocket', { chain: 'close', story: true });
    }
    if (this.pocketAt < 0) return;
    // anything that keeps them in (a fall, a stray step) stays inside the room
    if (p.z < MUJIN_POCKET.z0 - 2 && this.t - this.pocketAt > 1) this.pocketAt = -1;
  }

  private leavePocket(): void {
    this.teleport(MUJIN.pocketReturn.x, MUJIN.pocketReturn.z, PLATFORM_Y);
    this.pocketAt = -1;
    this.whiteFlash();
    this.sound.say(`sq${this.sex}_back`, { story: true });
  }

  private teleport(x: number, z: number, y: number): void {
    const p = this.g.player;
    p.teleport(x, z, p.yaw);
    p.y = y;
    this.g.flow.cancel();
  }

  // ---------------------------------------------------------------------------------------------
  // the dawn and the endings
  // ---------------------------------------------------------------------------------------------

  private dawn(dt: number, v: LoopView): void {
    const g = this.g;
    const ex = g.session.extraction;
    if (v.dawn && this.dawnT < 0) this.dawnT = 0;
    if (this.dawnT >= 0) this.dawnT += dt;
    // the sky lightens from the moment the train is called
    const k = ex.phase === 'locked' || ex.phase === 'available' ? 0 : Math.min(1, (ex.calledAt !== null ? g.session.elapsed - ex.calledAt : 0) / 60);
    const fog = g.renderer.scene.fog as { color: { setRGB(r: number, g: number, b: number): void } } | null;
    fog?.color.setRGB(0.03 + k * 0.42, 0.035 + k * 0.3, 0.07 + k * 0.32);
    g.renderer.light.hemi.intensity = 0.55 + k * 0.6;
    // Ren boards with whoever boards (solo: you; co-op: the simulation's word reaches every screen)
    if ((ex.phase === 'boarding' || ex.phase === 'extracted') && v.ren === REN_STATE.safe && !this.renBoarded) {
      this.renBoarded = true;
      this.sound.say('ren_board', { story: true });
    }
  }

  private onTrain(ev: 'express' | 'arrive' | 'doors' | 'depart'): void {
    const pos = { x: 0, y: 2, z: -1.9 };
    if (ev === 'express') {
      this.sound.say('pa_express_ja', { pos: SPEAKER, story: true });
      this.sound.express(6.5, { x: 0, y: 2, z: 1.9 });
    } else if (ev === 'arrive') {
      this.sound.cue('dawn', { fade: 1.2 });
      this.sound.chime(SPEAKER);
      this.sound.say('pa_dawn_ja', { pos: SPEAKER, story: true });
      this.sound.say('pa_dawn_en', { pos: SPEAKER, story: true });
      this.sound.arrive(pos);
      this.sound.say(`sq${this.sex}_dawn`, { story: true });
    } else if (ev === 'doors') {
      this.sound.say(`sq${this.sex}_board`, { story: true });
    } else if (ev === 'depart') {
      this.sound.doors(pos);
      this.sound.say('pa_doors_ja', { pos: SPEAKER, story: true });
      const egg = this.view.ren === REN_STATE.safe;
      this.sound.cue(egg ? 'passenger' : 'morning', { fade: 2 });
      if (egg) {
        this.progress.egg = true;
        this.progress.posts = REN_POSTS.length;
        saveMujin(this.progress);
        window.setTimeout(() => this.sound.say('ren_end', { story: true }), 5000);
        this.g.banner('THE PASSENGER', 'Ren is going home. The station has a name now.', 'good', 8);
      }
    }
  }

  /** The run is over (the results): the score of the ending plays on, everything else stops. */
  end(): void {
    this.setFilter(0);
    this.setVeil(false);
  }

  // ---------------------------------------------------------------------------------------------
  // what can be done here
  // ---------------------------------------------------------------------------------------------

  private act(a: string, i = 0): void {
    const p = this.g.player;
    if (this.remote) {
      this.request?.(a, i);
      if (a === 'clear') this.lastClear = true;
      return;
    }
    const q = this.loop;
    if (a === 'report') q.report(i, p.x, p.z, 'YOU');
    else if (a === 'clear' && q.allClear(p.x, p.z, 'YOU')) this.lastClear = true;
    else if (a === 'phone') q.answer(p.x, p.z, 'YOU');
    else if (a === 'take') q.takeRen(0, p.x, p.z);
    else if (a === 'seat') q.seatRen(0, p.x, p.z);
  }

  private targets(out: InteractionTarget[]): void {
    const g = this.g;
    if (!this.active || !g.playerAlive()) return;
    const p = g.player;
    const v = this.view;
    if (this.pocketAt >= 0) {
      const d = Math.hypot(MUJIN.pocketDoor.x - p.x, MUJIN.pocketDoor.z - p.z);
      if (d < 2.2) out.push({ id: 'mj:pocket', dist: d, text: 'GO BACK THROUGH THE DOOR', sub: this.t - this.pocketAt < 6 ? 'It will not open yet' : 'Back to the platform', tone: 'warn', hold: 2, enabled: this.t - this.pocketAt >= 6, onUse: () => this.leavePocket() });
      return;
    }
    const canRead = MujinLoop.canRead(v);
    if (canRead) {
      SPOTS.forEach((s, i) => {
        if (s.id === 'ren' && v.anomaly !== REN) return;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d > s.r || Math.abs(p.y - s.y) > 4) return;
        out.push({ id: `mj:spot:${s.id}`, dist: d + 0.5, text: `REPORT ${s.name}`, sub: 'Hold: this is what changed (final for the loop)', tone: 'warn', hold: 0.9, enabled: true, onUse: () => this.act('report', i) });
      });
      const db = Math.hypot(MUJIN.bell.x - p.x, MUJIN.bell.z - p.z);
      if (db < MUJIN_LOOP.reach.bell) out.push({ id: 'mj:clear', dist: db, text: 'RING THE ALL CLEAR', sub: 'Hold: nothing has changed this loop (final)', tone: 'good', hold: 1.2, enabled: true, onUse: () => this.act('clear') });
    }
    // the Bench Sitter: sit beside it and it whispers where the change is (it never says it twice in a loop)
    for (const z of g.zombies.zombies) {
      if (z.variant !== 'sitter' || !z.alive || z.state !== 'idle') continue;
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (d > 2.4) continue;
      const told = this.whispered === v.loop;
      out.push({ id: 'mj:sitter', dist: d, text: told ? 'IT HAS NOTHING MORE TO SAY' : 'SIT BESIDE IT', sub: 'The Bench Sitter', tone: 'normal', hold: 1.4, enabled: !told, onUse: () => this.whisper(z) });
      break;
    }
    if (MujinLoop.phoneRinging(v)) {
      const d = Math.hypot(MUJIN.payphone.x - p.x, MUJIN.payphone.z - p.z);
      if (d < MUJIN_LOOP.reach.phone) out.push({ id: 'mj:phone', dist: d, text: 'ANSWER THE PHONE', tone: 'normal', hold: 0.3, enabled: true, onUse: () => this.act('phone') });
    }
    if (v.ren === REN_STATE.here) {
      const dr = Math.hypot(v.renX - p.x, v.renZ - p.z);
      if (v.renLead < 0 && dr < MUJIN_LOOP.reach.ren) {
        out.push({ id: 'mj:ren', dist: dr, text: 'TAKE HER HAND', sub: 'Ren', tone: 'good', hold: 0.6, enabled: true, onUse: () => {
          this.act('take');
          this.sound.say('ren_seen', { chain: 'close', story: true });
        } });
      }
      const dbn = Math.hypot(MUJIN.bench.x - p.x, MUJIN.bench.z - p.z);
      if (v.renLead >= 0 && dbn < MUJIN_LOOP.reach.bench) out.push({ id: 'mj:seat', dist: dbn, text: 'SIT HER DOWN ON THE BENCH', sub: 'She will be safe; the loop counts as wrong', tone: 'good', hold: 0.8, enabled: true, onUse: () => this.act('seat') });
    }
  }

  private whispered = 0;

  /** The Bench Sitter's whisper: the place this loop's change is, or that nothing is wrong. */
  private whisper(z: Zombie): void {
    const v = this.view;
    this.whispered = v.loop;
    const i = MujinLoop.changeSpot(v);
    const id = i < 0 ? 'wh_none' : `wh_${SPOTS[i]!.id}`;
    this.sound.say(id, { pos: { x: z.x, y: 1.1, z: z.z }, chain: 'close', story: true });
  }

  // ---------------------------------------------------------------------------------------------
  // the HUD
  // ---------------------------------------------------------------------------------------------

  decorateHud(st: HudState, md: MapDynamic): void {
    if (!this.active) return;
    const v = this.view;
    const p = this.g.player;
    const ex = this.g.session.extraction;
    if (v.phase === 'fight' || v.phase === 'bell') st.timer = { label: `LOOP ${v.loop}  -  ${v.phase === 'bell' ? 'THE BELL STOPS IN' : 'THE BELL IN'}`, seconds: v.phase === 'bell' ? MujinLoop.left(v) : MujinLoop.left(v) - MUJIN_LOOP.bell, urgent: v.phase === 'bell' };
    else if (v.phase === 'reset') st.timer = { label: 'THE NIGHT BEGINS AGAIN', seconds: Math.max(0, MUJIN_LOOP.reset - v.t), urgent: false };
    const read = v.read !== READ.none;
    const lampsLine = `${'●'.repeat(v.dawn ? 5 : v.lamps)}${'○'.repeat(5 - (v.dawn ? 5 : v.lamps))}`;
    const loopObj = {
      id: 'mj-loop',
      title: `PUT THE STATION IN ORDER  ${lampsLine}`,
      detail: v.dawn
        ? 'Every lamp is lit'
        : read
          ? 'Read for this loop - the lamp lights (or goes out) when the bell stops'
          : v.loop === 1
            ? 'Nothing has changed yet: ring the All Clear at the platform bell to light the first lamp'
            : MujinLoop.canRead(v)
              ? 'A right read lights a lamp: hold E on what changed, or ring the All Clear at the bell if nothing did'
              : 'Look round: something may have changed',
      state: v.dawn ? 'complete' : 'active',
      progress: (v.dawn ? 5 : v.lamps) / 5,
      tracked: !v.dawn && !read && MujinLoop.canRead(v),
      distance: !v.dawn && !read && MujinLoop.canRead(v) ? Math.hypot(MUJIN.bell.x - p.x, MUJIN.bell.z - p.z) : -1,
    } as const;
    const list: HudState['objectives'] = [{ ...loopObj }];
    const hunt = this.g.session.hunt.status;
    if (v.loop >= MUJIN_LOOP.masterFrom || v.dawn) {
      list.push({ id: 'mj-master', title: 'STOP THE STATIONMASTER', detail: hunt === 'complete' ? 'He is down' : v.dawn ? 'Now he can be stopped' : 'He cannot be hurt until every lamp is lit - keep away from his punch', state: hunt === 'complete' ? 'complete' : 'active', progress: -1, tracked: v.dawn && hunt !== 'complete', distance: -1 });
    }
    if (ex.phase !== 'locked') list.push({ id: 'mj-train', title: 'BOARD THE DAWN TRAIN', detail: ex.phase === 'landed' ? 'The doors are open - get on' : 'It stops at platform 1', state: ex.phase === 'extracted' ? 'complete' : 'active', progress: -1, tracked: true, distance: Math.hypot(MUJIN.trainDoor.x - p.x, MUJIN.trainDoor.z - p.z) });
    if (v.ren === REN_STATE.here || v.ren === REN_STATE.safe) list.push({ id: 'mj-ren', title: 'REN', detail: v.ren === REN_STATE.safe ? 'Safe on the bench - board the dawn train and she comes too' : v.renLead >= 0 ? 'Bring her to the waiting-room bench' : 'Take her hand, or put her right', state: v.ren === REN_STATE.safe ? 'complete' : 'active', progress: -1, tracked: false, distance: Math.hypot(v.renX - p.x, v.renZ - p.z) });
    st.objectives = list;
    // the bell (the All Clear while the loop can be read), and every place that can change: the map shows what can be
    // reported, never which one it is
    const open = !read && MujinLoop.canRead(v) && !v.dawn;
    md.markers.push({ id: 'mj-bell', kind: 'objective', x: MUJIN.bell.x, z: MUJIN.bell.z, label: open ? 'ALL CLEAR' : 'BELL', color: '#9fe0ff', visible: true, compass: open, pulse: v.phase === 'bell' && open, dim: !open });
    if (!v.dawn) {
      for (const s of SPOTS) {
        if (s.id === 'ren') continue;
        md.markers.push({ id: `mj-spot-${s.id}`, kind: 'landmark', x: s.x, z: s.z, label: s.name.replace(/^THE /, ''), color: '#cfd8e6', visible: true, compass: false, dim: !open, mapOnly: true });
      }
    }
    if (MujinLoop.phoneRinging(v)) md.markers.push({ id: 'mj-phone', kind: 'objective', x: MUJIN.payphone.x, z: MUJIN.payphone.z, label: 'PAYPHONE', color: '#ffe08a', visible: true, compass: true, pulse: true });
    if (v.ren === REN_STATE.here) md.markers.push({ id: 'mj-ren', kind: 'objective', x: v.renX, z: v.renZ, label: 'REN', color: '#c8b0ff', visible: true, compass: true, pulse: v.renLead < 0 });
    if (v.renLead >= 0) md.markers.push({ id: 'mj-benchgoal', kind: 'objective', x: MUJIN.bench.x, z: MUJIN.bench.z, label: 'THE BENCH', color: '#c8b0ff', visible: true, compass: true, pulse: true });
  }

  // ---------------------------------------------------------------------------------------------
  // the screen's own effects (DOM over the canvas: never in the middle on phones, only a tint)
  // ---------------------------------------------------------------------------------------------

  private overlay(kind: 'flash' | 'veil'): HTMLDivElement {
    const have = kind === 'flash' ? this.flash : this.veil;
    if (have) return have;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;transition:opacity .25s';
    if (kind === 'flash') d.style.background = '#fff';
    else d.style.background = 'radial-gradient(ellipse at center, transparent 55%, rgba(240,236,228,.55) 100%)';
    document.body.appendChild(d);
    if (kind === 'flash') this.flash = d;
    else this.veil = d;
    return d;
  }

  /** Two frames of white: the reset. */
  private whiteFlash(): void {
    const f = this.overlay('flash');
    f.style.transition = 'none';
    f.style.opacity = '1';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        f.style.transition = 'opacity .5s';
        f.style.opacity = '0';
      }),
    );
  }

  private setVeil(on: boolean): void {
    if (!on && !this.veil) return;
    const v = this.overlay('veil');
    v.style.opacity = on ? String(0.55 + 0.35 * Math.sin(this.t * 3)) : '0';
  }

  /** The world gone soft round the White Shape. */
  private setFilter(k: number): void {
    const c = this.g.renderer.renderer.domElement;
    if (!c) return;
    const f = k > 0.01 ? `blur(${(k * 3.2).toFixed(2)}px) saturate(${(1 - k * 0.6).toFixed(2)}) contrast(${(1 + k * 0.3).toFixed(2)})` : '';
    if (c.style.filter !== f) c.style.filter = f;
  }

  /** The run's first seconds: black, the train's brakes, the PA saying a name, and the station fading up. */
  private opening(): void {
    const f = this.overlay('flash');
    f.style.transition = 'none';
    f.style.background = '#000';
    f.style.opacity = '1';
    window.setTimeout(() => {
      this.sound.arrive({ x: -10, y: 2, z: -1.9 });
      this.sound.say('pa_name_ja', { pos: SPEAKER, story: true });
      this.sound.say('pa_name_en', { pos: SPEAKER, story: true });
    }, 300);
    window.setTimeout(() => {
      f.style.transition = 'opacity 3s';
      f.style.opacity = '0';
    }, 1200);
    window.setTimeout(() => (f.style.background = '#fff'), 4400);
  }

  /** A line said: its caption on the top line (the speaker's name; the PA in Japanese with the English after). */
  private caption(id: string): void {
    const l = LINE[id];
    if (!l || l.who === 'TALL') return;
    if (l.who === 'PA' && id.endsWith('_en')) return; // shown with the Japanese
    const who = l.who === 'SQUAD-F' || l.who === 'SQUAD-M' ? 'YOU' : l.who === 'WHISPER' ? '...' : l.who;
    const text = l.ja ? `${l.ja}  ${l.text}` : l.text;
    this.g.radio(who, text, Math.min(8, 2.5 + text.length / 22));
  }

  dispose(): void {
    this.end();
    this.flash?.remove();
    this.veil?.remove();
    this.look.dispose();
    this.sound.stopAll(0);
  }
}

export { LINE };
