/**
 * MUJIN in the game: "The Last Service". The solo game runs the jobs and the station's infected here (`jobs.ts`,
 * `director.ts`); a co-op player shows the simulation's jobs from its reports (`applyWire`) and sends what they do as
 * requests. Either way everything on screen and in the ears follows the jobs' state, compared frame to frame
 * (`react`): a lamp for every job done, the PA's thanks, the night's warning and the mist when it takes an area, the
 * payphone after each job, Ren, the Stationmaster, the dawn and both endings.
 *
 * On phones nothing new sits in the middle: the night's clock is the top timer, the jobs are the objectives, the lamps
 * are in the world, every line said is one caption along the top (the radio line), and the journal waits in the pause
 * menu.
 */
import type { InteractionTarget } from '../game/interaction';
import type { Game } from '../game/game';
import type { HudState, MapDynamic } from '../ui/hudTypes';
import type { Zombie } from '../enemies/zombie';
import { MujinDirector, inNight, mujinSpawnAllowed, mujinVariantPicker } from './director';
import { buildJournal, loadMujin, REN_POSTS, saveMujin, type MujinProgress } from './journal';
import { decodeJobs, JOB_IDS, JOB_NAMES, MujinJobs, MUJIN_JOBS, REN_STATE, type JobId, type JobsView } from './jobs';
import { LINE } from './lines';
import { StationLook } from './look';
import { MUJIN, MUJIN_POCKET, PLACES, PLATFORM_Y, SEALS } from './places';
import { MujinSound } from './sound';

const SPEAKER = { x: 2, y: 3.6, z: -6.2 };
/** What the Bench Sitter whispers for each job still to do (and the key, still in the tunnel). */
const WHISPER: Record<JobId, string> = { clock: 'wh_clock', crossing: 'wh_crossing', tickets: 'wh_gates', rope: 'wh_rope', announce: 'wh_speaker' };
/** The night's mist hurts (health per second). */
const MIST_DPS = 4;

export class MujinRuntime {
  readonly jobs = new MujinJobs();
  private readonly dir: MujinDirector;
  readonly look = new StationLook();
  readonly sound: MujinSound;
  /** A co-op guest: the simulation runs the jobs; this shows them and asks. */
  remote = false;
  /** Co-op: what this player does goes to the simulation (`coop.ts` sets it). */
  request: ((a: string, i?: number) => void) | null = null;
  private wire: JobsView | null = null;
  private prev: JobsView | null = null;
  private progress: MujinProgress = loadMujin();
  private active = false;
  private t = 0;
  private next = { pa: 25, ring: 0, crossing: 0, murmur: 6, tall: 4, bell: 0, chatter: 30 };
  private gaze = 0;
  private marked = false;
  private pocketAt = -1;
  private punchAt = -1;
  private sm = { said: new Set<string>(), near: false, open: false, dead: false };
  private flash: HTMLDivElement | null = null;
  private veil: HTMLDivElement | null = null;
  private renBoarded = false;
  private sex: 'f' | 'm' = 'f';
  private whisperedAt = -99;
  private readonly told = new Set<string>();

  constructor(private readonly g: Game) {
    this.sound = new MujinSound(g.audio);
    g.worldRoot.add(this.look.root);
    this.dir = new MujinDirector(g.level, g.zombies);
    g.zombies.pickVariant = mujinVariantPicker();
    g.zombies.spawnAllowed = mujinSpawnAllowed();
    g.zenv.punch = () => this.punched();
    g.interaction.sources.push((t) => this.targets(t));
    g.menus.pauseTab = () => ({ label: 'JOURNAL', build: () => buildJournal(this.progress, this.view) });
    g.mission.onTrain = (ev) => this.onTrain(ev);
    this.sound.onLine = (id) => this.caption(id);
  }

  /** What the jobs are now (the simulation's in co-op). */
  get view(): JobsView {
    return this.remote ? (this.wire ?? this.jobs.view) : this.jobs.view;
  }

  /** Load the voices and the score (the loading screen waits for it). */
  preload(progress?: (done: number, total: number) => void): Promise<void> {
    return this.sound.load(progress);
  }

  /** A new run. Solo: the jobs start; the Stationmaster is not on the platform yet (call after `populate`). */
  reset(coop: boolean): void {
    this.remote = coop;
    this.wire = null;
    this.active = true;
    this.t = 0;
    this.gaze = 0;
    this.marked = false;
    this.pocketAt = -1;
    this.punchAt = -1;
    this.renBoarded = false;
    this.whisperedAt = -99;
    this.told.clear();
    this.sm = { said: new Set(), near: false, open: false, dead: false };
    this.next = { pa: 25, ring: 0, crossing: 0, murmur: 6, tall: 4, bell: 0, chatter: 30 };
    this.sex = Math.random() < 0.5 ? 'f' : 'm';
    this.progress = loadMujin();
    const rng = this.g.rng;
    this.jobs.reset(() => rng.f());
    this.jobs.drain();
    if (!coop) {
      this.dir.reset(rng);
      this.g.session.hunt.status = 'available';
    }
    this.prev = null;
    this.sound.stopAll(0.2);
    this.setFilter(0);
    this.opening();
  }

  /** A co-op report's row (`encodeJobs`). */
  applyWire(row: unknown): void {
    const v = decodeJobs(row);
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
    this.react(this.prev, v);
    this.prev = { ...v };
    this.look.update(dt, v, g.player);
    if (playing) {
      this.station(dt, v);
      this.lessons(v);
      this.kinds(dt, v);
      this.mist(dt, v);
      this.pocket();
      this.dawn(v);
    }
    this.sound.update();
  }

  /** Solo: the jobs, the station's infected, the Stationmaster, the dawn train. */
  private authority(dt: number): void {
    const g = this.g;
    const s = g.session;
    const q = this.jobs;
    const p = g.player;
    const stand = [{ x: p.x, z: p.z, up: g.playerAlive() && this.pocketAt < 0 }];
    q.tick(dt, stand);
    for (const e of q.drain()) {
      this.dir.onEvent(e, q.view, g.rng);
      if (e.kind === 'night') g.endRun('defeat', 'The night took the station');
      else if (e.kind === 'dawn' && s.defense.status !== 'complete') {
        s.defense.status = 'complete';
        s.defense.progress = 1;
        g.mission.completeDefense();
      }
    }
    if (q.view.renLead >= 0 && !g.playerAlive()) q.dropRen();
    q.stepRen(dt, q.view.renLead >= 0 && g.playerAlive() ? { x: p.x, z: p.z, yaw: p.yaw } : null);
    const st = this.dir.step(dt, q.view, stand, g.rng);
    if (st.renTaken) q.loseRen();
    if (s.hunt.status !== 'complete') s.hunt.status = st.master === 'away' ? 'available' : 'active';
    if (st.master === 'away') g.zombies.vanish((z) => z.isBoss);
    if (s.extraction.phase === 'available') g.mission.callNow();
  }

  /** What changed since the last frame, said and shown once (solo and co-op alike). */
  private react(a: JobsView | null, b: JobsView): void {
    const g = this.g;
    if (!a) return;
    // a job done: its lamp, the PA's thanks, the night wound back
    for (let i = 0; i < JOB_IDS.length; i++) {
      if (b.done & (1 << i) && !(a.done & (1 << i))) this.jobDone(JOB_IDS[i]!, b);
    }
    if (b.key === 1 && a.key === 0) {
      g.banner('THE WINDING KEY', 'Take it to the station clock over the gates', 'good', 4);
      this.sound.say(`sq${this.sex}_spot`, { story: true });
    }
    if (b.breakers !== a.breakers) {
      const n = countBits(b.breakers);
      if (b.breakers === 0b111) {
        g.banner('THE CROSSING IS POWERING UP', 'Hold the road by the crossing until it is running', 'warn', 5);
        this.sound.say(`sq${this.sex}_report`, { story: true });
        this.sound.cue('bell', { fade: 0.6, loop: true });
      } else g.feed(`BREAKER ${n} OF 3 THROWN`, 'good');
    }
    if (b.picked !== a.picked) {
      g.feed(`A LOST TICKET (${b.carried} CARRIED, ${b.returned} RETURNED)`, 'good');
      if (countBits(a.picked) === 0) this.sound.say(`sq${this.sex}_spot`, { story: true });
    }
    if (b.returned > a.returned && b.returned < MUJIN_JOBS.tickets) g.banner('TICKETS RETURNED', `${b.returned} of ${MUJIN_JOBS.tickets} - the rest are still out there`, 'good', 4);
    if (b.announcing && !a.announcing) {
      g.banner('ON AIR', 'Hold the ticket hall while the announcement plays', 'warn', 5);
      this.sound.cue('bell', { fade: 0.6, loop: true });
      this.sound.chime(SPEAKER);
      this.sound.say('pa_arrive_ja', { pos: SPEAKER, story: true });
      this.sound.say('pa_arrive_en', { pos: SPEAKER, story: true });
    }
    // the night
    if (b.night <= MUJIN_JOBS.warnAt && a.night > MUJIN_JOBS.warnAt && !b.dawn) {
      const i = SEALS.findIndex((_, k) => !(b.sealed & (1 << k)));
      g.banner('THE NIGHT IS COMING', i >= 0 ? `Finish a job within a minute, or it takes ${SEALS[i]!.name.toLowerCase()}` : 'Finish a job within a minute, or it takes the station', 'danger', 6);
      this.sound.say('pa_bell_ja', { pos: SPEAKER, story: true });
      this.sound.say('pa_bell_en', { pos: SPEAKER, story: true });
    }
    if (b.sealed !== a.sealed) {
      const i = SEALS.findIndex((_, k) => b.sealed & (1 << k) && !(a.sealed & (1 << k)));
      g.banner('THE NIGHT TAKES IT', `${SEALS[i]?.name ?? 'Part of the station'} is lost in the mist. It hurts to stay in it.`, 'danger', 6);
      this.sound.chime(SPEAKER);
      this.sound.say('pa_wrong_ja', { pos: SPEAKER, story: true });
      this.sound.say('pa_wrong_en', { pos: SPEAKER, story: true });
      this.sound.say(`sq${this.sex}_wrong`, { story: true });
      this.sound.express(6.5, { x: 0, y: 2, z: 1.9 });
      this.loopMusic(b);
    }
    if (b.lost && !a.lost) {
      this.sound.say('pa_night_ja', { pos: SPEAKER, story: true });
      this.sound.say('pa_night_en', { pos: SPEAKER, story: true });
    }
    // the payphone, Ren
    if (b.calls > a.calls) this.call(b.calls);
    if (b.ren !== a.ren) this.renChanged(a.ren, b.ren, b);
    if (b.renLead >= 0 && a.renLead < 0) this.sound.say('ren_hold', { pos: { x: b.renX, y: 1.5, z: b.renZ }, chain: 'close', story: true });
    if (b.dawn && !a.dawn) {
      g.banner('EVERY LAMP IS LIT', 'The station is running. Stop the Stationmaster - then the dawn train comes.', 'good', 7);
      this.sound.say('sm_lamps', { story: true });
      this.sound.cue('master', { loop: true, fade: 2 });
    }
  }

  private jobDone(job: JobId, v: JobsView): void {
    const g = this.g;
    const lamps = MujinJobs.lamps(v);
    g.banner(`${JOB_NAMES[job]}: DONE`, lamps < 5 ? `A lamp lights on the board by the bell: ${lamps} of 5.` : 'The fifth lamp is lit.', 'good', 5);
    this.sound.chime(SPEAKER);
    this.sound.say('pa_order_ja', { pos: SPEAKER, story: true });
    this.sound.say('pa_order_en', { pos: SPEAKER, story: true });
    this.sound.say(`sq${this.sex}_right`, { story: true });
    if (!v.dawn) this.loopMusic(v);
    this.progress.posts = Math.min(REN_POSTS.length - 1, this.progress.posts + 1);
    saveMujin(this.progress);
  }

  /** The station's theme: a little more broken for every area the night has taken. */
  private loopMusic(v: JobsView): void {
    const lost = countBits(v.sealed);
    this.sound.cue('loop', { loop: true, fade: 1.5, detune: -lost * 22, rate: 1 - lost * 0.015 });
  }

  /** The payphone answered: Ren on the line (the fifth time, live). */
  private call(n: number): void {
    this.sound.say(`ren_call${Math.min(5, n)}`, { chain: 'phone', story: true });
    this.g.feed(n >= MUJIN_JOBS.calls ? 'THE CALL WAS LIVE' : `A CALL FROM THE STATION (${n} OF 5)`, n >= MUJIN_JOBS.calls ? 'warn' : 'normal');
    this.progress.posts = Math.min(REN_POSTS.length - 1, this.progress.posts + 1);
    saveMujin(this.progress);
  }

  private renChanged(from: number, to: number, v: JobsView): void {
    const g = this.g;
    if (to === REN_STATE.here) g.banner('REN IS ON PLATFORM 2', 'Take her hand and bring her to the waiting-room bench - before the Tall Lady reaches her', 'warn', 6);
    else if (to === REN_STATE.safe) {
      g.banner('REN IS SAFE', 'She waits on the bench. When the dawn train comes, she comes with you.', 'good', 6);
      this.sound.say('ren_safe', { pos: { x: v.renX, y: 1.2, z: v.renZ }, story: true });
      this.sound.say('sm_ren', { story: true });
    } else if (to === REN_STATE.gone && from === REN_STATE.here) {
      this.sound.say('ren_gone', { pos: { x: v.renX, y: 1.4, z: v.renZ }, chain: 'far', story: true });
      g.banner('SHE IS GONE', 'The Tall Lady reached her first.', 'danger', 5);
    }
  }

  /** How the station works, told once as the run goes (a line on the top edge, no voice). */
  private lessons(v: JobsView): void {
    const say = (id: string, text: string, secs = 9): void => {
      if (this.told.has(id)) return;
      this.told.add(id);
      this.g.radio('STATION', text, secs);
    };
    if (this.t > 7) say('jobs', 'The station is dead. Five jobs get it running - they are your objectives, any order. Each one done lights a lamp on the board by the bell; five lit and the dawn train comes.', 11);
    if (this.t > 22) say('night', 'The night does not wait: the clock at the top is how long until it takes part of the station. Every job you finish winds it back.', 9);
    if (MujinJobs.lamps(v) >= 1 && MujinJobs.phoneRinging(v)) say('phone', 'The payphone in the ticket hall is ringing.', 6);
    if (MujinJobs.lamps(v) >= 1) say('master', 'The Stationmaster walks platform 1 now. Nothing hurts him until every lamp is lit - and his punch sends you somewhere else. Keep away.', 9);
  }

  // ---------------------------------------------------------------------------------------------
  // the station's sounds
  // ---------------------------------------------------------------------------------------------

  private station(dt: number, v: JobsView): void {
    const n = this.next;
    for (const k of Object.keys(n) as (keyof typeof n)[]) n[k] -= dt;
    // the PA, now and then: a train that never comes
    if (n.pa <= 0 && !v.announcing && !v.dawn) {
      n.pa = 45 + Math.random() * 25;
      const which = ['pa_delay', 'pa_name', 'pa_time'][Math.floor(Math.random() * 3)]!;
      this.sound.chime(SPEAKER);
      window.setTimeout(() => {
        this.sound.say(`${which}_ja`, { pos: SPEAKER, story: true });
        this.sound.say(`${which}_en`, { pos: SPEAKER, story: true });
      }, 1700);
    }
    // the announcement on air: the PA keeps talking while it plays
    if (v.announcing && !MujinJobs.isDone(v, 'announce') && n.chatter <= 0) {
      n.chatter = 9;
      const which = ['pa_arrive', 'pa_time', 'pa_name', 'pa_delay'][Math.floor(Math.random() * 4)]!;
      this.sound.say(`${which}_en`, { pos: SPEAKER, story: true });
    }
    // the bell in the night's last twenty seconds
    if (!v.dawn && v.night < 20 && n.bell <= 0) {
      n.bell = 1.2;
      this.sound.bell({ x: MUJIN.bell.x, y: 2.4, z: MUJIN.bell.z });
    }
    if (this.look.crossingRinging && n.crossing <= 0) {
      n.crossing = 6;
      this.sound.crossing({ x: 39, y: 2.4, z: -5.5 }, 5.6);
    }
    if (MujinJobs.phoneRinging(v) && n.ring <= 0) {
      n.ring = 3;
      this.sound.ring({ x: MUJIN.payphone.x - 0.9, y: 1.3, z: MUJIN.payphone.z });
    }
    // the bell cue ends with the hold it was for; the station's theme otherwise
    const holding = (v.breakers === 0b111 && !MujinJobs.isDone(v, 'crossing')) || (v.announcing && !MujinJobs.isDone(v, 'announce'));
    if (!v.dawn && ((this.sound.cueId === 'bell' && !holding) || (this.sound.cueId === null && this.t > 2))) this.loopMusic(v);
  }

  /** The station's own: the Tall Lady's voice and mark, the White Shape's stare, the commuters, the Stationmaster. */
  private kinds(dt: number, v: JobsView): void {
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
    this.gaze = stare ? Math.min(1.6, this.gaze + dt / 2) : Math.max(0, this.gaze - dt / 1.2);
    const k = Math.max(0, this.gaze - 0.25);
    if (k > 0 && g.playerAlive()) {
      p.yaw += Math.sin(this.t * 1.7) * 0.5 * k * dt;
      p.pitch += Math.sin(this.t * 2.3 + 1) * 0.25 * k * dt;
    }
    this.setFilter(k);
    this.sound.hold('shape', Math.min(1, this.gaze), 1760);
    if (nearTall && dTall < 50 && n.tall <= 0) {
      n.tall = 6 + Math.random() * 4;
      this.sound.say(`tall_po${1 + Math.floor(Math.random() * 4)}`, { pos: { x: nearTall.x, y: 2.6, z: nearTall.z }, chain: 'monster' });
    }
    if (hunted !== this.marked) {
      this.marked = hunted;
      if (hunted) {
        g.banner('SHE HEARD YOU', "The Tall Lady will follow you anywhere - stand in the shrine's salt circle to be lost to her", 'danger', 5);
        this.sound.say(`sq${this.sex}_marked`, { story: true });
      }
    }
    if (nearCommuter && dCom < 9 && n.murmur <= 0) {
      n.murmur = 7 + Math.random() * 6;
      this.sound.say(`cm_${1 + Math.floor(Math.random() * 6)}`, { pos: { x: nearCommuter.x, y: 1.6, z: nearCommuter.z }, chain: 'far', volume: 0.8 });
    }
    if (master) {
      const d = Math.hypot(master.x - p.x, master.z - p.z);
      const at = { x: master.x, y: 1.7, z: master.z };
      const once = (id: string): void => {
        if (this.sm.said.has(id)) return;
        this.sm.said.add(id);
        this.sound.say(id, { pos: at, story: true });
      };
      if (!v.dawn) {
        if (d < 12 && !this.sm.near) {
          this.sm.near = true;
          this.sound.say(this.sm.said.has('sm_tickets') ? 'sm_place' : 'sm_tickets', { pos: at });
          this.sm.said.add('sm_tickets');
        }
        if (d < 20) once('sm_early');
        if (d > 25) this.sm.near = false;
        if (MujinJobs.lamps(v) >= 3) once('sm_kept');
      } else if (!this.sm.open && d < 18) {
        this.sm.open = true;
        once('sm_fight');
      }
    }
    if (v.dawn && !this.sm.dead && g.session.hunt.status === 'complete') {
      this.sm.dead = true;
      this.sound.say('sm_fall', { story: true });
    }
  }

  /** The night's mist hurts whoever stands in it. */
  private mist(dt: number, v: JobsView): void {
    const g = this.g;
    const p = g.player;
    const inside = g.playerAlive() && this.pocketAt < 0 && inNight(v.sealed, p.x, p.z);
    if (inside) g.hurtPlayer(MIST_DPS * dt, null, null, { ignoreArmor: true, toxic: true });
    this.setVeil(this.marked || inside, inside);
  }

  // ---------------------------------------------------------------------------------------------
  // the Stationmaster's punch: the pocket room
  // ---------------------------------------------------------------------------------------------

  /** His punch landed on this player (solo: his env; co-op: the simulation's word). */
  punched(): void {
    const g = this.g;
    if (this.pocketAt >= 0 || this.punchAt >= 0 || !g.playerAlive()) return;
    this.sound.punch();
    this.sound.say(Math.random() < 0.5 ? 'sm_punch1' : 'sm_punch2', { chain: 'close', story: true });
    if (!this.remote && this.jobs.view.renLead >= 0) this.jobs.dropRen();
    this.punchAt = this.t + 0.65;
  }

  private pocket(): void {
    const g = this.g;
    const p = g.player;
    if (this.punchAt >= 0 && this.t >= this.punchAt) {
      this.punchAt = -1;
      this.whiteFlash();
      this.teleport(MUJIN.pocketWake.x, MUJIN.pocketWake.z, 0);
      this.pocketAt = this.t;
      g.banner('THE WAITING ROOM, AGAIN', 'Somewhere else in the night. Find the door.', 'warn', 4);
      this.sound.say(`sq${this.sex}_punched`, { story: true });
      this.sound.say('sm_pocket', { chain: 'close', story: true });
    }
    if (this.pocketAt < 0) return;
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

  private dawn(v: JobsView): void {
    const g = this.g;
    const ex = g.session.extraction;
    const k = ex.phase === 'locked' || ex.phase === 'available' ? 0 : Math.min(1, (ex.calledAt !== null ? g.session.elapsed - ex.calledAt : 0) / 60);
    const fog = g.renderer.scene.fog as { color: { setRGB(r: number, g: number, b: number): void } } | null;
    if (k > 0) fog?.color.setRGB(0.03 + k * 0.42, 0.035 + k * 0.3, 0.07 + k * 0.32);
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

  /** The run is over (the results). */
  end(): void {
    this.setFilter(0);
    this.setVeil(false, false);
  }

  // ---------------------------------------------------------------------------------------------
  // what can be done here
  // ---------------------------------------------------------------------------------------------

  private act(a: string, i = 0): void {
    const p = this.g.player;
    if (this.remote) {
      this.request?.(a, i);
      return;
    }
    const q = this.jobs;
    if (a === 'key') q.takeKey(p.x, p.z);
    else if (a === 'wind') q.windClock(p.x, p.z);
    else if (a === 'breaker') q.throwBreaker(i, p.x, p.z);
    else if (a === 'ticket') q.takeTicket(i, p.x, p.z);
    else if (a === 'gates') q.returnTickets(p.x, p.z);
    else if (a === 'rope') q.tieRope(p.x, p.z);
    else if (a === 'mic') q.startAnnouncement(p.x, p.z);
    else if (a === 'phone') q.answer(p.x, p.z);
    else if (a === 'take') q.takeRen(0, p.x, p.z);
    else if (a === 'seat') q.seatRen(0, p.x, p.z);
  }

  private targets(out: InteractionTarget[]): void {
    const g = this.g;
    if (!this.active || !g.playerAlive()) return;
    const p = g.player;
    const v = this.view;
    const near = (o: { x: number; z: number }, r: number): number => {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      return d <= r ? d : -1;
    };
    if (this.pocketAt >= 0) {
      const d = near(MUJIN.pocketDoor, 2.2);
      if (d >= 0) out.push({ id: 'mj:pocket', dist: d, text: 'GO BACK THROUGH THE DOOR', sub: this.t - this.pocketAt < 6 ? 'It will not open yet' : 'Back to the platform', tone: 'warn', hold: 2, enabled: this.t - this.pocketAt >= 6, onUse: () => this.leavePocket() });
      return;
    }
    let d: number;
    // the clock: the key in the tunnel, then the clock itself
    if (v.key === 0 && (d = near(PLACES.key, PLACES.key.r)) >= 0) out.push({ id: 'mj:key', dist: d, text: 'TAKE THE WINDING KEY', tone: 'good', hold: 0.6, enabled: true, onUse: () => this.act('key') });
    if (!MujinJobs.isDone(v, 'clock') && (d = near(PLACES.clock, PLACES.clock.r)) >= 0) out.push({ id: 'mj:wind', dist: d, text: v.key === 1 ? 'WIND THE STATION CLOCK' : 'THE CLOCK HAS STOPPED', sub: v.key === 1 ? 'Hold' : 'Its winding key is in the tunnel', tone: 'good', hold: 2.5, enabled: v.key === 1, onUse: () => this.act('wind') });
    // the breakers
    PLACES.breakers.forEach((b, i) => {
      if (v.breakers & (1 << i) || (d = near(b, b.r)) < 0) return;
      out.push({ id: `mj:breaker:${i}`, dist: d, text: 'THROW THE BREAKER', sub: `${countBits(v.breakers)} of 3 - then hold the road`, tone: 'good', hold: 1.2, enabled: true, onUse: () => this.act('breaker', i) });
    });
    // the tickets, and the gates
    PLACES.tickets.forEach((t, i) => {
      if (!(v.ticketSet & (1 << i)) || v.picked & (1 << i) || (d = near(t, 2)) < 0) return;
      out.push({ id: `mj:ticket:${i}`, dist: d, text: 'PICK UP THE LOST TICKET', tone: 'good', hold: 0.4, enabled: true, onUse: () => this.act('ticket', i) });
    });
    if (!MujinJobs.isDone(v, 'tickets') && (d = near(PLACES.gates, PLACES.gates.r)) >= 0) out.push({ id: 'mj:gates', dist: d + 0.4, text: v.carried > 0 ? `FEED ${v.carried} TICKET${v.carried > 1 ? 'S' : ''} INTO THE GATES` : 'THE GATES WANT TICKETS', sub: `${v.returned} of ${MUJIN_JOBS.tickets} returned`, tone: 'good', hold: 1, enabled: v.carried > 0, onUse: () => this.act('gates') });
    // the rope
    if (!MujinJobs.isDone(v, 'rope') && (d = near(PLACES.rope, PLACES.rope.r)) >= 0) out.push({ id: 'mj:rope', dist: d, text: 'TIE A NEW SHRINE ROPE', sub: 'Hold - it takes a while', tone: 'good', hold: 6, enabled: true, onUse: () => this.act('rope') });
    // the announcement
    if (!v.announcing && !MujinJobs.isDone(v, 'announce') && (d = near(PLACES.mic, PLACES.mic.r)) >= 0) out.push({ id: 'mj:mic', dist: d, text: 'START THE ANNOUNCEMENT', sub: 'Then hold the ticket hall', tone: 'good', hold: 1, enabled: true, onUse: () => this.act('mic') });
    // the Bench Sitter: sit beside it and it whispers what is left to do
    for (const z of g.zombies.zombies) {
      if (z.variant !== 'sitter' || !z.alive || z.state !== 'idle') continue;
      if ((d = near(z, 2.4)) < 0) continue;
      const told = this.t - this.whisperedAt < 30;
      out.push({ id: 'mj:sitter', dist: d, text: told ? 'IT HAS NOTHING MORE TO SAY' : 'SIT BESIDE IT', sub: 'The Bench Sitter - do not shoot it', tone: 'normal', hold: 1.4, enabled: !told, onUse: () => this.whisper(z) });
      break;
    }
    if (MujinJobs.phoneRinging(v) && (d = near(MUJIN.payphone, MUJIN_JOBS.reach.phone)) >= 0) out.push({ id: 'mj:phone', dist: d, text: 'ANSWER THE PHONE', tone: 'normal', hold: 0.3, enabled: true, onUse: () => this.act('phone') });
    if (v.ren === REN_STATE.here) {
      if (v.renLead < 0 && (d = near({ x: v.renX, z: v.renZ }, MUJIN_JOBS.reach.ren)) >= 0) {
        out.push({ id: 'mj:ren', dist: d, text: 'TAKE HER HAND', sub: 'Ren', tone: 'good', hold: 0.6, enabled: true, onUse: () => {
          this.act('take');
          this.sound.say('ren_seen', { chain: 'close', story: true });
        } });
      }
      if (v.renLead >= 0 && (d = near(MUJIN.bench, MUJIN_JOBS.reach.bench)) >= 0) out.push({ id: 'mj:seat', dist: d, text: 'SIT HER DOWN ON THE BENCH', sub: 'She will be safe here', tone: 'good', hold: 0.8, enabled: true, onUse: () => this.act('seat') });
    }
  }

  /** The Bench Sitter's whisper: what is still to do (the key first, if it is still in the tunnel). */
  private whisper(z: Zombie): void {
    const v = this.view;
    this.whisperedAt = this.t;
    const job = MujinJobs.nextJob(v);
    const id = v.ren === REN_STATE.here ? 'wh_ren' : !job ? 'wh_none' : job === 'clock' && v.key === 0 ? 'wh_tunnel' : WHISPER[job];
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
    const dist = (o: { x: number; z: number }): number => Math.hypot(o.x - p.x, o.z - p.z);
    if (!v.dawn && !v.lost) {
      const i = SEALS.findIndex((_, k) => !(v.sealed & (1 << k)));
      st.timer = { label: i >= 0 ? `THE NIGHT TAKES ${SEALS[i]!.name.replace(/^THE /, '')} IN` : 'THE NIGHT TAKES THE STATION IN', seconds: Math.max(0, v.night), urgent: v.night < MUJIN_JOBS.warnAt };
    }
    const list: HudState['objectives'] = [];
    const job = (id: JobId, detail: string, progress: number, at: { x: number; z: number }): void => {
      const done = MujinJobs.isDone(v, id);
      list.push({ id: `mj-${id}`, title: JOB_NAMES[id], detail: done ? 'Done - its lamp is lit' : detail, state: done ? 'complete' : 'active', progress: done ? 1 : progress, tracked: false, distance: done ? -1 : dist(at) });
    };
    if (!v.dawn) {
      job('clock', v.key === 0 ? 'The winding key is in the tunnel mouth (west)' : 'Wind the clock over the ticket gates', v.key === 1 ? 0.5 : 0, v.key === 0 ? PLACES.key : PLACES.clock);
      job('crossing', v.breakers === 0b111 ? `Hold the road by the crossing: ${Math.round(v.charge * 100)}%` : `Throw the breakers by the level crossing (${countBits(v.breakers)} of 3)`, v.breakers === 0b111 ? v.charge : countBits(v.breakers) / 6, v.breakers === 0b111 ? PLACES.crossing : (PLACES.breakers.find((_, i) => !(v.breakers & (1 << i))) ?? PLACES.crossing));
      job('tickets', v.carried > 0 ? `Feed ${v.carried} into the ticket gates (${v.returned} of 5 returned)` : `Find the lost tickets (${v.returned} of 5 returned)`, v.returned / MUJIN_JOBS.tickets, v.carried > 0 ? PLACES.gates : (this.nearestTicket(v) ?? PLACES.gates));
      job('rope', 'Tie a new rope at the shrine (south-east)', 0, PLACES.rope);
      job('announce', v.announcing ? `Hold the ticket hall: ${Math.round(v.played * 100)}%` : 'Start it at the PA desk in the ticket hall', v.announcing ? v.played : 0, v.announcing ? PLACES.hall : PLACES.mic);
      // track the nearest job not done
      const open = list.filter((o) => o.state !== 'complete');
      if (open.length) open.reduce((a, b) => (a.distance <= b.distance ? a : b)).tracked = true;
    }
    const hunt = this.g.session.hunt.status;
    if (MujinJobs.lamps(v) >= 1) list.push({ id: 'mj-master', title: 'STOP THE STATIONMASTER', detail: hunt === 'complete' ? 'He is down' : v.dawn ? 'Now he can be stopped' : 'Nothing hurts him until every lamp is lit - keep away from his punch', state: hunt === 'complete' ? 'complete' : 'active', progress: -1, tracked: v.dawn && hunt !== 'complete', distance: -1 });
    if (ex.phase !== 'locked') list.push({ id: 'mj-train', title: 'BOARD THE DAWN TRAIN', detail: ex.phase === 'landed' ? 'The doors are open - get on' : 'It stops at platform 1', state: ex.phase === 'extracted' ? 'complete' : 'active', progress: -1, tracked: true, distance: dist(MUJIN.trainDoor) });
    if (v.ren === REN_STATE.here || v.ren === REN_STATE.safe) list.push({ id: 'mj-ren', title: 'REN', detail: v.ren === REN_STATE.safe ? 'Safe on the bench - she boards with you' : v.renLead >= 0 ? 'Bring her to the waiting-room bench' : 'Take her hand on platform 2', state: v.ren === REN_STATE.safe ? 'complete' : 'active', progress: -1, tracked: false, distance: dist({ x: v.renX, z: v.renZ }) });
    st.objectives = list;
    // markers: only what leads somewhere
    const mk = (id: string, at: { x: number; z: number }, label: string, color = '#9fffc4', pulse = false): void => {
      md.markers.push({ id, kind: 'objective', x: at.x, z: at.z, label, color, visible: true, compass: true, pulse });
    };
    if (!v.dawn) {
      if (!MujinJobs.isDone(v, 'clock')) mk('mj-clock', v.key === 0 ? PLACES.key : PLACES.clock, v.key === 0 ? 'WINDING KEY' : 'CLOCK');
      if (!MujinJobs.isDone(v, 'crossing')) {
        if (v.breakers === 0b111) md.markers.push({ id: 'mj-crossing', kind: 'objective', x: PLACES.crossing.x, z: PLACES.crossing.z, label: 'HOLD THE ROAD', color: '#9fffc4', radius: PLACES.crossing.r, visible: true, compass: true, pulse: true });
        else PLACES.breakers.forEach((b, i) => !(v.breakers & (1 << i)) && mk(`mj-breaker-${i}`, b, 'BREAKER'));
      }
      if (!MujinJobs.isDone(v, 'tickets')) {
        PLACES.tickets.forEach((t, i) => v.ticketSet & (1 << i) && !(v.picked & (1 << i)) && md.markers.push({ id: `mj-ticket-${i}`, kind: 'objective', x: t.x, z: t.z, label: 'TICKET', color: '#ffe08a', visible: true, compass: dist(t) < 40 }));
        if (v.carried > 0) mk('mj-gates', PLACES.gates, 'TICKET GATES', '#9fffc4', true);
      }
      if (!MujinJobs.isDone(v, 'rope')) mk('mj-rope', PLACES.rope, 'SHRINE ROPE');
      if (!MujinJobs.isDone(v, 'announce')) {
        if (v.announcing) md.markers.push({ id: 'mj-hall', kind: 'objective', x: PLACES.hall.x, z: PLACES.hall.z, label: 'HOLD THE HALL', color: '#9fffc4', radius: PLACES.hall.r, visible: true, compass: true, pulse: true });
        else mk('mj-mic', PLACES.mic, 'PA DESK');
      }
    }
    if (MujinJobs.phoneRinging(v)) mk('mj-phone', MUJIN.payphone, 'PAYPHONE', '#ffe08a', true);
    if (v.ren === REN_STATE.here) mk('mj-ren', { x: v.renX, z: v.renZ }, 'REN', '#c8b0ff', v.renLead < 0);
    if (v.renLead >= 0) mk('mj-bench', MUJIN.bench, 'THE BENCH', '#c8b0ff', true);
  }

  private nearestTicket(v: JobsView): { x: number; z: number } | null {
    const p = this.g.player;
    let best: { x: number; z: number } | null = null;
    let bd = Infinity;
    PLACES.tickets.forEach((t, i) => {
      if (!(v.ticketSet & (1 << i)) || v.picked & (1 << i)) return;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    });
    return best;
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
    document.body.appendChild(d);
    if (kind === 'flash') this.flash = d;
    else this.veil = d;
    return d;
  }

  private whiteFlash(): void {
    const f = this.overlay('flash');
    f.style.transition = 'none';
    f.style.background = '#fff';
    f.style.opacity = '1';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        f.style.transition = 'opacity .5s';
        f.style.opacity = '0';
      }),
    );
  }

  /** The edges of the screen: pale while the Tall Lady hunts you, dark violet in the night's mist. */
  private setVeil(on: boolean, mist: boolean): void {
    if (!on && !this.veil) return;
    const v = this.overlay('veil');
    v.style.background = mist ? 'radial-gradient(ellipse at center, rgba(20,14,40,.15) 35%, rgba(10,6,24,.85) 100%)' : 'radial-gradient(ellipse at center, transparent 55%, rgba(240,236,228,.55) 100%)';
    v.style.opacity = on ? String(mist ? 1 : 0.55 + 0.35 * Math.sin(this.t * 3)) : '0';
  }

  private setFilter(k: number): void {
    const c = this.g.renderer.renderer.domElement;
    if (!c) return;
    const f = k > 0.01 ? `blur(${(k * 3.2).toFixed(2)}px) saturate(${(1 - k * 0.6).toFixed(2)}) contrast(${(1 + k * 0.3).toFixed(2)})` : '';
    if (c.style.filter !== f) c.style.filter = f;
  }

  /** The run's first seconds: black, the train's brakes, the PA saying the station's name, the station fading up. */
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
    this.g.banner('MUJIN', 'A dead station on no map. Get it running again before the night takes it.', 'info', 6);
  }

  /** A line said: its caption on the top line (the speaker's name; the PA in Japanese with the English after). */
  private caption(id: string): void {
    const l = LINE[id];
    if (!l || l.who === 'TALL') return;
    if (l.who === 'PA' && id.endsWith('_en')) return;
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

function countBits(n: number): number {
  let c = 0;
  for (let i = 0; i < 8; i++) if (n & (1 << i)) c++;
  return c;
}
