/**
 * HIRASAKA in the game: "The Slope Between". The solo game runs the story and the island's infected here (`story.ts`,
 * `director.ts`); a co-op player shows the simulation's story from its reports (`applyWire`) and sends what they do as
 * requests. Either way everything on screen and in the ears follows the story's state, compared frame to frame
 * (`react`): the jobs, the waves, the lighthouse, the cage, the deep, Kurogane, the cable, the climb and the surge,
 * Mio behind you, the stone, both endings.
 *
 * What is only this player's is worked out here: being in the mine (the dark, the headlamp, the music), the waves and
 * the surge's water hurting you, looking back at Mio, the peaches you carry, a lamp-eater putting your light out.
 *
 * On phones nothing new sits in the middle: the jobs are the objectives, every line said is one caption along the top,
 * the edges of the screen carry the warnings (red when you look back, blue in the water), the journal waits in the
 * pause menu.
 */
import * as THREE from 'three';
import type { InteractionTarget } from '../game/interaction';
import type { Game } from '../game/game';
import type { HudState, MapDynamic } from '../ui/hudTypes';
import type { Zombie } from '../enemies/zombie';
import { HirasakaDirector, hirasakaVariantPicker } from './director';
import { buildJournal, loadHirasaka, saveHirasaka, type HirasakaProgress } from './journal';
import { LINE } from './lines';
import { IslandLook } from './look';
import { HIRASAKA, PHOTOS, PLACES, SURGE, TAPES, TIERS, inMine, mineRoomAt, placeAt, type PlaceId } from './places';
import { ACT, decodeStory, HIRASAKA_STORY, HirasakaStory, JOB_IDS, JOB_NAMES, type JobId, type StoryView } from './story';
import { HirasakaSound } from './sound';

/** The surge's water hurts (health per second), the waves' crash too. */
const WATER_DPS = 7;
const WAVE_DAMAGE = 16;
/** Natsuki's line the first time anyone walks into each place. */
const PLACE_LINE: Partial<Record<PlaceId, string>> = { market: 'nat_market', school: 'nat_school', block: 'nat_block65', summit: 'nat_summit', galleries: 'nat_galleries', village: 'nat_village', roothall: 'nat_roothall' };
const SKY = {
  island: { hemi: 2.4, key: 1.5, fill: 0.7, env: 0.3, indoor: 1 },
  mine: { hemi: 1.15, key: 0.1, fill: 0.4, env: 0.1, indoor: 0.8 },
  dawn: { hemi: 3.8, key: 3, fill: 1, env: 0.45, indoor: 1 },
};
type Sky = typeof SKY.island;

export class HirasakaRuntime {
  readonly story = new HirasakaStory();
  private readonly dir: HirasakaDirector;
  readonly look = new IslandLook();
  readonly sound: HirasakaSound;
  /** A co-op guest: the simulation runs the story; this shows it and asks. */
  remote = false;
  /** Co-op: what this player does goes to the simulation (`coop.ts` sets it). */
  request: ((a: string, i?: number, x?: number, z?: number) => void) | null = null;
  private wire: StoryView | null = null;
  private prev: StoryView | null = null;
  private progress: HirasakaProgress = loadHirasaka();
  private active = false;
  private t = 0;
  private sex: 'f' | 'm' = 'f';
  private next = { pa: 50, thunder: 6, mio: 10, hag: 6, miner: 6, ring: 0, grind: 0, ku: 0 };
  private readonly said = new Set<string>();
  private readonly seen = new Set<string>();
  private readonly placesSaid = new Set<PlaceId>();
  /** This player's own: peaches carried, the gaze on Mio, the light out, the cage ride, the wave about to land. */
  peaches = 0;
  private gaze = 0;
  private blindT = 0;
  private rideT = -1;
  private rideTo: { x: number; z: number; y: number; down: boolean; adit?: boolean } | null = null;
  private waveHitAt = -1;
  private flashT = 0;
  private flash2 = -1;
  private endT = -1;
  private ending = 0;
  private overlay: HTMLDivElement | null = null;
  private veil: HTMLDivElement | null = null;
  private underground = false;
  private stormLevel = -1;
  private sky: Sky = { ...SKY.island };
  private fogBase = { density: 0.02 };
  private readonly helmeted = new WeakSet<object>();

  constructor(private readonly g: Game) {
    this.sound = new HirasakaSound(g.audio);
    g.worldRoot.add(this.look.root);
    this.dir = new HirasakaDirector(g.level, g.zombies);
    g.zombies.pickVariant = hirasakaVariantPicker(() => this.dir.lureVariant);
    g.zombies.spawnAllowed = this.dir.spawnAllowed();
    g.zenv.blind = () => this.blind();
    g.interaction.sources.push((t) => this.targets(t));
    g.menus.pauseTab = () => ({ label: 'JOURNAL', build: () => buildJournal(this.progress, this.view, this.seen) });
    this.sound.onLine = (id) => this.caption(id);
    const fog = g.renderer.scene.fog as THREE.FogExp2 | null;
    if (fog && 'density' in fog) this.fogBase.density = fog.density;
  }

  /** What the story is now (the simulation's in co-op). */
  get view(): StoryView {
    return this.remote ? (this.wire ?? this.story.view) : this.story.view;
  }

  /** Load the voices and the score (the loading screen waits for it). */
  preload(progress?: (done: number, total: number) => void): Promise<void> {
    return this.sound.load(progress);
  }

  /** What appears only later (the surge, the wreck, the wards): compiled with the level. */
  prewarmObjects(): THREE.Object3D[] {
    return this.look.prewarm();
  }

  /** A new run (call after `populate`). */
  reset(coop: boolean): void {
    const g = this.g;
    this.remote = coop;
    this.wire = null;
    this.active = true;
    this.t = 0;
    this.sex = Math.random() < 0.5 ? 'f' : 'm';
    this.next = { pa: 50, thunder: 6, mio: 10, hag: 6, miner: 6, ring: 0, grind: 0, ku: 0 };
    this.said.clear();
    this.seen.clear();
    this.placesSaid.clear();
    this.peaches = 0;
    this.gaze = 0;
    this.blindT = 0;
    this.rideT = -1;
    this.rideTo = null;
    this.waveHitAt = -1;
    this.flashT = 0;
    this.flash2 = -1;
    this.endT = -1;
    this.ending = 0;
    this.underground = false;
    this.stormLevel = -1;
    this.sky = { ...SKY.island };
    this.progress = loadHirasaka();
    this.story.reset(() => g.rng.f());
    this.story.drain();
    if (!coop) {
      this.dir.reset();
      g.session.hunt.status = 'available';
    }
    const fx = g.level.hirasaka;
    if (fx) fx.aditLink.closed = true;
    this.look.reset();
    this.prev = null;
    this.sound.stopAll(0.2);
    this.setVeil('none');
    this.opening();
  }

  /** A co-op report's row (`encodeStory`). */
  applyWire(row: unknown): void {
    const v = decodeStory(row);
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
    const p = g.player;
    this.underground = inMine(p.x);
    this.look.update(dt, v, g.renderer.camera, this.underground, (x, z, y) => g.level.world.floorBelow(x, z, 0.1, y, 0.4));
    this.helmet();
    if (playing) {
      this.places(v);
      this.ride(dt);
      this.weather(dt, v);
      this.hazards(dt, v);
      this.kinds(dt, v);
      this.music(v);
      this.ambient(dt, v);
      this.lessons(v);
    }
    this.endingStep(dt);
    this.sound.update();
  }

  /** Solo: the story, the island's infected, Kurogane. */
  private authority(dt: number): void {
    const g = this.g;
    const s = g.session;
    const q = this.story;
    const p = g.player;
    const stand = [{ x: p.x, y: p.y, z: p.z, up: g.playerAlive() }];
    const st = this.dir.step(dt, q.view, stand, g.rng);
    q.tick(dt, stand, st.mioAtStone);
    // Kurogane down: the climb
    if (q.view.hairpin && !q.view.bossDown && s.hunt.status === 'complete') q.overseerDown();
    if (!q.view.hairpin && s.hunt.status !== 'complete') {
      s.hunt.status = 'available';
      g.zombies.vanish((z) => z.isBoss);
    } else if (q.view.hairpin && s.hunt.status === 'available') s.hunt.status = 'active';
    for (const e of q.drain()) {
      this.dir.onEvent(e, q.view, g.rng);
      if (e.kind === 'ready' && s.defense.status !== 'complete') {
        s.defense.status = 'complete';
        s.defense.progress = 1;
        g.mission.completeDefense();
      }
    }
  }

  /** What changed since the last frame, said and shown once (solo and co-op alike). */
  private react(a: StoryView | null, b: StoryView): void {
    const g = this.g;
    if (!a) return;
    const nat = (id: string): void => this.natsuki(id);
    for (let i = 0; i < JOB_IDS.length; i++) if (b.done & (1 << i) && !(a.done & (1 << i))) this.jobDone(JOB_IDS[i]!, b);
    if (b.valves !== a.valves) {
      const n = HirasakaStory.count(b.valves);
      if (n < 3) {
        g.banner('A SEA GATE IS OPEN', `${n} of 3 - the galleries are draining`, 'good', 4);
        nat('nat_valve');
      }
    }
    if (b.generating && !a.generating) {
      g.banner('THE GENERATOR IS TURNING OVER', 'Hold the summit until it catches - they will come up every stair', 'warn', 5);
      nat('nat_light');
    }
    if (HirasakaStory.ready(b) && !HirasakaStory.ready(a)) {
      g.banner('THE CAGE RUNS', 'Ride it down from the mine head on the seawall (west)', 'good', 6);
      nat('nat_gates');
      this.sound.signal({ x: HIRASAKA.cage.x, y: 4, z: HIRASAKA.cage.z }, 3);
    }
    if (b.cageDown && !a.cageDown && !this.underground) this.look.ride();
    if (b.peaches && !a.peaches) {
      g.banner('THE VILLAGE DOORS OPEN', 'Every one of them, at once', 'danger', 5);
      this.look.openDoors();
    }
    if (b.hairpin && !a.hairpin) {
      g.banner("MIO'S HAIRPIN", 'Something old wakes in the Root Hall', 'danger', 5);
      nat('nat_hairpin');
      this.once('ku_wake', { pos: this.bossPos() });
      this.progress.photos |= 0;
    }
    if (b.bossDown && !a.bossDown) {
      g.banner('THE CABLE HAS GONE', 'The cage is down the shaft in pieces. The only way out is the Slope - west from the Root Hall.', 'danger', 7);
      this.sound.cable({ x: HIRASAKA.cageBottom.x, y: 6, z: HIRASAKA.cageBottom.z });
      this.look.cable();
      g.shake(0.6);
      const fx = g.level.hirasaka;
      if (fx) fx.aditLink.closed = false;
      nat('nat_bossdown');
      window.setTimeout(() => {
        nat('nat_cable');
        this.sound.say('mio_wake', { pos: { x: 196, y: 2, z: -30 }, chain: 'far', story: true });
      }, 2600);
      window.setTimeout(() => nat('nat_dontlook'), 9000);
    }
    if (b.surfaced && !a.surfaced) {
      g.banner('THE STORM SURGE', 'The sea is coming up the island behind you. Climb to the summit and push the stone home.', 'danger', 7);
      nat('nat_surface');
      this.sound.say('sk_surge', { story: true });
      this.pa('pa_dont');
    }
    if (b.surge > a.surge) {
      const t = TIERS[Math.min(TIERS.length - 1, b.surge - 1)]!;
      g.banner('THE WATER IS RISING', `${t.name} is under the sea - get higher`, 'danger', 4);
      if (b.surge > 1) nat('nat_rise');
      g.shake(0.3);
    }
    if (b.pushers > 0 && a.pushers === 0 && b.push < 0.05) {
      nat('nat_stone');
      this.once('sk_stone', { delay: 4 });
    }
    if (b.held && !a.held) {
      g.banner('SHE IS AT THE STONE', 'It will not move while she leans on it - drive her off it (a peach)', 'danger', 4);
      this.once('mio_stone', { pos: this.mioPos() });
    }
    if (b.tapes !== a.tapes) {
      const i = bitAdded(a.tapes, b.tapes);
      if (i >= 0) this.tape(i);
    }
    if (b.photos !== a.photos) {
      const i = bitAdded(a.photos, b.photos);
      if (i >= 0) this.photo(i, HirasakaStory.count(b.photos) >= PHOTOS.length);
    }
    if (b.call && !a.call) {
      this.sound.say('mio_call', { chain: 'phone', story: true });
      this.progress.call = true;
      saveHirasaka(this.progress);
      g.banner('THE GALLERY TELEPHONE', 'Mio, in 1974. At the summit, you need not push.', 'good', 7);
    }
    if (b.wave > a.wave + 5) {
      this.look.wave();
      this.sound.wave({ x: this.g.player.x, y: 1, z: 46 });
      this.waveHitAt = this.t + 1.45;
    }
    if (a.wave > HIRASAKA_STORY.waveWarn && b.wave <= HIRASAKA_STORY.waveWarn && b.act === ACT.island && this.onSeawall()) {
      g.banner('WAVE', 'Off the seawall!', 'danger', 2.5);
      nat('nat_wave');
    }
    if (b.looks > a.looks) {
      this.sound.chime();
      this.flashVeil();
      if (b.looks === 1 || b.looks % 4 === 0) this.sound.say('mio_looked', { pos: this.mioPos(), chain: 'monster' });
    }
    if (b.act === ACT.won && a.act !== ACT.won) this.beginEnding(b.ending);
  }

  private jobDone(job: JobId, v: StoryView): void {
    const g = this.g;
    const n = HirasakaStory.jobsDone(v);
    g.banner(`${JOB_NAMES[job]}: DONE`, n < 3 ? `${n} of 3 - the cage needs all three` : 'The cage is ready', 'good', 5);
    if (job === 'key') {
      this.sound.pick();
      this.natsuki('nat_key');
    } else if (job === 'light') {
      this.natsuki('nat_lit');
      this.pa('pa_light');
      window.setTimeout(() => this.sound.say('sk_light', { story: true }), 6000);
    } else if (job === 'gates') this.sound.signal({ x: HIRASAKA.cage.x, y: 4, z: HIRASAKA.cage.z }, 2);
  }

  private tape(i: number): void {
    this.sound.pick();
    this.sound.say(`sq${this.sex}_tape`, { story: true });
    this.sound.say(`tape_${i + 1}`, { chain: 'tape', story: true });
    this.progress.tapes |= 1 << i;
    saveHirasaka(this.progress);
    this.g.feed(`GENZŌ'S TAPE ${i + 1} OF ${TAPES.length} - IN THE JOURNAL`, 'good');
  }

  private photo(i: number, all: boolean): void {
    this.sound.pick();
    this.natsuki('nat_photo');
    if (i === 0) window.setTimeout(() => this.sound.say('sk_photo', { story: true }), 3000);
    this.progress.photos |= 1 << i;
    saveHirasaka(this.progress);
    this.g.feed(`A PHOTOGRAPH (${HirasakaStory.count(this.view.photos)} OF ${PHOTOS.length}) - IN THE JOURNAL`, 'good');
    if (all) this.g.banner('EVERY PHOTOGRAPH', 'Somewhere in the galleries, a telephone has started ringing', 'good', 7);
  }

  /** Natsuki says it: beside you (solo, while she lives), else over the boat's radio (co-op: she stayed aboard). */
  private natsuki(id: string): void {
    const alive = !this.remote && this.g.squad.aliveNames().length > 0;
    this.sound.say(id, { chain: alive ? 'dry' : 'radio', story: true });
  }

  private once(id: string, o: { pos?: { x: number; y: number; z: number }; delay?: number } = {}): void {
    if (this.said.has(id)) return;
    this.said.add(id);
    if (o.delay) window.setTimeout(() => this.sound.say(id, { pos: o.pos, story: true }), o.delay * 1000);
    else this.sound.say(id, { pos: o.pos, story: true });
  }

  private pa(id: string): void {
    this.sound.speaker();
    window.setTimeout(() => {
      this.sound.say(`${id}_ja`, { chain: 'pa', story: true });
      this.sound.say(`${id}_en`, { chain: 'pa', story: true });
    }, 2300);
  }

  /** How the island works, told once as the run goes (a line on the top edge, no voice). */
  private lessons(v: StoryView): void {
    const say = (id: string, text: string, secs = 9): void => {
      if (this.said.has(`l:${id}`)) return;
      this.said.add(`l:${id}`);
      this.g.radio('HIRASAKA', text, secs);
    };
    if (this.t > 24) say('jobs', "Three jobs get the cage running, any order - they are your objectives: Genzō's key up Block 65's outside stair, the lighthouse on the summit, the sea gates along the seawall.", 11);
    if (this.t > 40) say('tapes', "Genzō's tapes and his photographs are hidden round the island and the mine. The journal (pause menu) keeps them.", 8);
    if (v.peaches) say('peach', 'You carry white peaches. Throw one with the grenade key: nothing of the dead crosses the ring where it lands, for a few seconds. Not even her.', 10);
    if (v.act === ACT.climb) say('look', 'Do not look back at her. Every look brings her on faster. Climb, and push the stone home at the summit.', 9);
  }

  // ---------------------------------------------------------------------------------------------
  // this player's own: places, the cage, the weather, the hazards, what is near
  // ---------------------------------------------------------------------------------------------

  private places(v: StoryView): void {
    const p = this.g.player;
    if (this.t > 25 && this.onSeawall() && !this.said.has('nat_seawall')) {
      this.said.add('nat_seawall');
      this.natsuki('nat_seawall');
    }
    const at = placeAt(p.x, p.y, p.z);
    if (!at || this.placesSaid.has(at)) return;
    this.placesSaid.add(at);
    const id = PLACE_LINE[at];
    if (id && this.t > 8) this.natsuki(id);
    if (at === 'summit' && v.act === ACT.climb && HirasakaStory.canGoHome(v)) window.setTimeout(() => this.natsuki('nat_egg'), 4000);
    if (Math.hypot(p.x - PLACES.generator.x, p.z - PLACES.generator.z) < 12 && !this.said.has('nat_lighthouse')) {
      this.said.add('nat_lighthouse');
      this.natsuki('nat_lighthouse');
    }
  }

  /** The cage's ride and the climb out of the adit: a moment of black, then out the other end. */
  private ride(dt: number): void {
    if (this.rideT < 0 || !this.rideTo) return;
    this.rideT += dt;
    const o = this.overlayEl();
    const dur = this.rideTo.down ? 3.2 : 1.6;
    // the shaft's lamps strobing past on the way down
    o.style.background = this.rideTo.down ? (Math.floor(this.rideT * 7) % 3 === 0 ? '#2a1e10' : '#000') : '#000';
    o.style.opacity = String(Math.min(1, this.rideT * 4));
    if (this.rideT >= dur) {
      const to = this.rideTo;
      this.teleport(to.x, to.z, to.y);
      this.rideTo = null;
      this.rideT = -1;
      if (to.adit) this.act('surface');
      o.style.transition = 'opacity 1.2s';
      o.style.opacity = '0';
      window.setTimeout(() => (o.style.transition = ''), 1300);
    }
  }

  private weather(dt: number, v: StoryView): void {
    const g = this.g;
    const ug = this.underground;
    // the sky's light: the storm on the island, the dark of the mine, the dawn at the end
    const want = this.ending > 0 && this.endT > 2 ? SKY.dawn : ug ? SKY.mine : SKY.island;
    const k = Math.min(1, dt * (ug ? 3 : 1.5));
    for (const key of Object.keys(this.sky) as (keyof Sky)[]) this.sky[key] += (want[key] - this.sky[key]) * k;
    // lightning: a flash (and a second), thunder after
    this.flashT = Math.max(0, this.flashT - dt);
    if (!ug && this.ending === 0) {
      this.next.thunder -= dt;
      if (this.next.thunder <= 0) {
        this.next.thunder = 9 + Math.random() * 14;
        const near = 0.3 + Math.random() * 0.7;
        this.flashT = 0.12;
        this.flash2 = this.t + 0.22;
        this.sound.thunder(near);
      }
      if (this.flash2 > 0 && this.t >= this.flash2) {
        this.flash2 = -1;
        this.flashT = 0.08;
      }
    }
    const f = this.flashT > 0 ? 7 : 0;
    // the clouds light up with it
    const su = g.renderer.sky.userData.uniforms;
    (su.uMid!.value as THREE.Color).setHex(f > 0 ? 0x8a9aa8 : this.ending > 0 && this.endT > 2 ? 0x8a7a86 : 0x111a1e);
    (su.uZenith!.value as THREE.Color).setHex(f > 0 ? 0x4a5a6a : this.ending > 0 && this.endT > 2 ? 0x3a4a6a : 0x06090c);
    (su.uHorizon!.value as THREE.Color).setHex(this.ending > 0 && this.endT > 2 ? 0xe8a888 : 0x1e2c30);
    g.renderer.setSkyLevels({ hemi: this.sky.hemi + f, key: this.sky.key + f * 0.6, fill: this.sky.fill, env: this.sky.env + f * 0.05, indoor: this.sky.indoor });
    const fog = g.renderer.scene.fog as THREE.FogExp2 | null;
    if (fog && 'density' in fog) {
      const dens = ug ? 0.045 : this.ending > 0 ? this.fogBase.density * 0.6 : this.fogBase.density * (v.surge > 0 ? 1.25 : 1.1);
      fog.density += (dens - fog.density) * Math.min(1, dt * 2);
      const c = ug ? [0.012, 0.011, 0.01] : this.ending > 0 && this.endT > 2 ? [0.42, 0.38, 0.4] : [0.035, 0.05, 0.06];
      fog.color.setRGB(fog.color.r + (c[0]! - fog.color.r) * k, fog.color.g + (c[1]! - fog.color.g) * k, fog.color.b + (c[2]! - fog.color.b) * k);
    }
    // the headlamp, in the mine (out for a while after a lamp-eater's hit)
    this.blindT = Math.max(0, this.blindT - dt);
    const lamp = ug && this.blindT <= 0 && g.playerAlive() ? 24 : 0;
    this.look.headlamp.intensity += (lamp - this.look.headlamp.intensity) * Math.min(1, dt * 8);
    // the storm in the ears
    const storm = ug ? 0 : this.ending > 0 ? 0.25 : v.surge > 0 ? 1.4 : 1;
    if (Math.abs(storm - this.stormLevel) > 0.04) {
      this.stormLevel = storm;
      this.sound.storm(storm);
    }
  }

  /** The waves over the seawall and the surge's water: they hurt. */
  private hazards(dt: number, v: StoryView): void {
    const g = this.g;
    const p = g.player;
    if (!g.playerAlive() || this.ending > 0) {
      this.setVeil(this.blindT > 0 ? 'dark' : 'none');
      return;
    }
    if (this.waveHitAt > 0 && this.t >= this.waveHitAt) {
      this.waveHitAt = -1;
      if (this.onSeawall()) {
        g.hurtPlayer(WAVE_DAMAGE, p.x, 46, {});
        p.vz = -9;
        p.vy = 3;
        g.shake(0.5);
        this.sound.say(`sq${this.sex}_wave`, {});
      }
    }
    const sea = HirasakaStory.seaLevel(v);
    const wet = !this.underground && v.surge > 0 && p.y < sea - 0.3;
    if (wet) g.hurtPlayer(WATER_DPS * dt, null, null, { ignoreArmor: true, toxic: true });
    this.setVeil(wet ? 'water' : this.blindT > 0 ? 'dark' : this.gaze > 0.15 ? 'look' : 'none');
  }

  private onSeawall(): boolean {
    const p = this.g.player;
    return !this.underground && p.z > 39.5 && p.z < 44.2 && p.y < 1.2;
  }

  /** The island's kinds near this player: Mio behind you, the hags' whispers, the miners at work, Kurogane. */
  private kinds(dt: number, v: StoryView): void {
    const g = this.g;
    const p = g.player;
    const n = this.next;
    for (const k of Object.keys(n) as (keyof typeof n)[]) n[k] -= dt;
    let mio: Zombie | null = null;
    let hag: Zombie | null = null;
    let miner: Zombie | null = null;
    let dHag = Infinity;
    let dMiner = Infinity;
    for (const z of g.zombies.zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (d < 30 && z.variant) this.seen.add(z.variant);
      if (z.variant === 'follower') mio = z;
      else if (z.variant === 'hag' && d < dHag) {
        dHag = d;
        hag = z;
      } else if (z.variant === 'miner' && z.state === 'idle' && d < dMiner) {
        dMiner = d;
        miner = z;
      }
    }
    // looking back at her
    let looking = false;
    if (mio && v.act === ACT.climb && g.playerAlive()) {
      const d = Math.hypot(mio.x - p.x, mio.z - p.z);
      const fx = -Math.sin(p.yaw) * Math.cos(p.pitch);
      const fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
      const tx = (mio.x - p.x) / Math.max(d, 1e-3);
      const tz = (mio.z - p.z) / Math.max(d, 1e-3);
      looking = d < 42 && fx * tx + fz * tz > 0.8 && !g.level.world.segmentBlocked(p.x, p.y + 1.6, p.z, mio.x, mio.y + 1.4, mio.z, 'shots');
      if (!looking && d < 24 && n.mio <= 0) {
        n.mio = 8 + Math.random() * 6;
        const id = ['mio_dontlook1', 'mio_dontlook2', 'mio_wait', 'mio_why'][Math.floor(Math.random() * 4)]!;
        this.sound.say(id, { pos: { x: mio.x, y: mio.y + 1.5, z: mio.z }, chain: 'close' });
      }
    }
    this.gaze = looking ? this.gaze + dt : Math.max(0, this.gaze - dt * 2);
    if (looking && this.gaze > 0.35) {
      this.gaze = 0.16;
      this.act('look');
    }
    if (hag && dHag < 14 && n.hag <= 0) {
      n.hag = 7 + Math.random() * 5;
      this.sound.say(`hag_${1 + Math.floor(Math.random() * 3)}`, { pos: { x: hag.x, y: hag.y + 0.6, z: hag.z }, chain: 'monster', volume: 0.9 });
    }
    if (miner && dMiner < 10 && n.miner <= 0) {
      n.miner = 8 + Math.random() * 6;
      this.sound.say(`mn_${1 + Math.floor(Math.random() * 4)}`, { pos: { x: miner.x, y: miner.y + 1.6, z: miner.z }, chain: 'far', volume: 0.85 });
    }
    // Kurogane
    const b = g.zombies.boss;
    if (b && b.alive && b.variant === 'overseer') {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      const at = { x: b.x, y: b.y + 2, z: b.z };
      if (d < 16) this.once('ku_near', { pos: at });
      if (b.state === 'chase' && n.ku <= 0) {
        n.ku = 19;
        if (this.said.has('ku_near')) this.sound.say(Math.random() < 0.6 ? 'ku_orders' : 'ku_company', { pos: at, chain: 'monster' });
      }
      if (b.hp < b.maxHp * 0.3) this.once('ku_hurt', { pos: at });
      if (d < 30) this.once('nat_boss');
    } else if (v.hairpin && v.bossDown) this.once('ku_fall', { pos: { x: 200, y: 2, z: -30 } });
    // the gallery telephone, once every photograph is found
    if (!v.call && HirasakaStory.count(v.photos) >= PHOTOS.length && this.underground && n.ring <= 0) {
      n.ring = 3.2;
      this.sound.ring({ x: PLACES.phone.x, y: 1.4, z: 24.4 });
    }
    // the stone grinding while it rolls
    if (v.pushers > 0 && !v.held && n.grind <= 0 && v.act === ACT.climb) {
      n.grind = 1;
      this.sound.grind({ x: HIRASAKA.stoneSeal.x + 3, y: TIERS[4].y + 1, z: HIRASAKA.stoneSeal.z }, Math.min(1, 0.5 + v.pushers * 0.25));
      g.shake(0.06);
    }
  }

  /** The score for where you are and what is happening. */
  private music(v: StoryView): void {
    // the boat's crossing plays under the opening; the island's own after it
    if (this.ending > 0 || this.rideT >= 0 || this.t < 10) return;
    const p = this.g.player;
    const room = mineRoomAt(p.x, p.z);
    const boss = this.g.zombies.boss;
    let want: string;
    if (v.act === ACT.climb) want = 'climb';
    else if (this.underground) want = boss?.alive && boss.variant === 'overseer' && (room === 'roothall' || room === 'pass') ? 'overseer' : room === 'village' ? 'village' : 'deep';
    else want = v.generating && !HirasakaStory.isDone(v, 'light') ? 'hold' : 'island';
    if (this.sound.cueId !== want && !(this.sound.cueId === 'descent' && this.t < this.descentUntil)) this.sound.cue(want, { loop: true, fade: 2.2 });
  }

  private descentUntil = 0;

  /** The island's speakers, now and then (on the island, before the climb). */
  private ambient(dt: number, v: StoryView): void {
    void dt;
    if (this.underground || v.act === ACT.climb || this.ending > 0) return;
    if (this.next.pa <= 0) {
      this.next.pa = 70 + Math.random() * 40;
      this.pa(['pa_shift', 'pa_evac', 'pa_dance', 'pa_gas'][Math.floor(Math.random() * 4)]!);
    }
  }

  /** A lamp-eater's hit: the headlamp out, the edges dark, for a few seconds. */
  blind(): void {
    if (!this.underground) return;
    if (this.blindT <= 0) this.sound.say(`sq${this.sex}_dark`, {});
    this.blindT = 5;
  }

  // ---------------------------------------------------------------------------------------------
  // what can be done here
  // ---------------------------------------------------------------------------------------------

  private act(a: string, i = 0, x?: number, z?: number): void {
    const p = this.g.player;
    if (this.remote) {
      this.request?.(a, i, x, z);
      return;
    }
    const q = this.story;
    if (a === 'key') q.takeKey(p.x, p.y, p.z);
    else if (a === 'gen') q.startGenerator(p.x, p.y, p.z);
    else if (a === 'valve') q.openValve(i, p.x, p.y, p.z);
    else if (a === 'cage') q.rideCage(p.x, p.z);
    else if (a === 'peaches') q.takePeaches(p.x, p.z);
    else if (a === 'hairpin') q.takeHairpin(p.x, p.z);
    else if (a === 'surface') q.surface(p.x, p.z);
    else if (a === 'tape') q.takeTape(i, p.x, p.y, p.z);
    else if (a === 'photo') q.takePhoto(i, p.x, p.y, p.z);
    else if (a === 'phone') q.answer(p.x, p.z);
    else if (a === 'look') q.look(0);
    else if (a === 'home') q.turnAround(p.x, p.y, p.z);
    else if (a === 'peach' && x !== undefined && z !== undefined) this.dir.peach(x, z);
  }

  private targets(out: InteractionTarget[]): void {
    const g = this.g;
    if (!this.active || !g.playerAlive() || this.rideT >= 0 || this.ending > 0) return;
    const p = g.player;
    const v = this.view;
    const near = (o: { x: number; y?: number; z: number }, r: number): number => {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      return d <= r && Math.abs((o.y ?? p.y) - p.y) < 2.2 ? d : -1;
    };
    let d: number;
    if (!HirasakaStory.isDone(v, 'key') && (d = near(PLACES.key, PLACES.key.r)) >= 0) out.push({ id: 'hs:key', dist: d, text: "TAKE GENZŌ'S CAGE KEY", sub: 'On its nail by the door', tone: 'good', hold: 0.6, enabled: true, onUse: () => this.act('key') });
    if (!v.generating && !HirasakaStory.isDone(v, 'light') && (d = near(PLACES.generator, PLACES.generator.r)) >= 0) out.push({ id: 'hs:gen', dist: d, text: 'START THE LIGHTHOUSE GENERATOR', sub: 'Then hold the summit while it catches', tone: 'good', hold: 1.4, enabled: true, onUse: () => this.act('gen') });
    PLACES.valves.forEach((k, i) => {
      if (v.valves & (1 << i) || (d = near(k, k.r)) < 0) return;
      out.push({ id: `hs:valve:${i}`, dist: d, text: 'OPEN THE SEA GATE', sub: `${HirasakaStory.count(v.valves)} of 3 open - watch for the waves`, tone: 'good', hold: 1.6, enabled: true, onUse: () => this.act('valve', i) });
    });
    // the cage: down from the mine head, back up from the landing (until the cable goes)
    if ((d = near(HIRASAKA.cage, HIRASAKA.cage.r)) >= 0) {
      const ready = HirasakaStory.ready(v) && !v.bossDown;
      out.push({ id: 'hs:cage', dist: d, text: ready ? 'RIDE THE CAGE DOWN' : v.bossDown ? 'THE CABLE HAS GONE' : 'THE CAGE IS DEAD', sub: ready ? 'Shaft Three' : v.bossDown ? '' : "It needs Genzō's key, the lighthouse and the sea gates", tone: 'good', hold: 1, enabled: ready, onUse: () => this.rideCage(true) });
    }
    if (!v.bossDown && (d = near(HIRASAKA.cageBottom, 2.6)) >= 0) out.push({ id: 'hs:cageup', dist: d, text: 'RIDE THE CAGE UP', sub: 'Back to the seawall', tone: 'normal', hold: 1, enabled: true, onUse: () => this.rideCage(false) });
    if (v.cageDown && this.peaches < HIRASAKA_STORY.peaches && (d = near(PLACES.peaches, PLACES.peaches.r)) >= 0) out.push({ id: 'hs:peaches', dist: d, text: 'PICK THE WHITE PEACHES', sub: `Carry ${HIRASAKA_STORY.peaches}: throw one with the grenade key`, tone: 'good', hold: 1, enabled: true, onUse: () => this.takePeaches() });
    if (v.cageDown && !v.hairpin && (d = near(PLACES.hairpin, PLACES.hairpin.r)) >= 0) out.push({ id: 'hs:hairpin', dist: d, text: "TAKE MIO'S HAIRPIN", sub: 'A red camellia, in the roots', tone: 'warn', hold: 1.2, enabled: true, onUse: () => this.act('hairpin') });
    TAPES.forEach((t, i) => {
      if (v.tapes & (1 << i) || (d = near(t, 2)) < 0) return;
      out.push({ id: `hs:tape:${i}`, dist: d, text: 'PICK UP THE CASSETTE', sub: `Genzō's tape ${i + 1}`, tone: 'good', hold: 0.4, enabled: true, onUse: () => this.act('tape', i) });
    });
    PHOTOS.forEach((ph, i) => {
      if (v.photos & (1 << i) || (d = near(ph, 2)) < 0) return;
      out.push({ id: `hs:photo:${i}`, dist: d, text: 'PICK UP THE PHOTOGRAPH', tone: 'good', hold: 0.4, enabled: true, onUse: () => this.act('photo', i) });
    });
    if (!v.call && HirasakaStory.count(v.photos) >= PHOTOS.length && (d = near(PLACES.phone, PLACES.phone.r)) >= 0) out.push({ id: 'hs:phone', dist: d, text: 'ANSWER THE TELEPHONE', tone: 'good', hold: 0.3, enabled: true, onUse: () => this.act('phone') });
    // the climb: out of the adit; at the stone, the other ending
    if (v.act === ACT.climb && (d = near({ x: HIRASAKA.slopeDoor.x, y: HIRASAKA.slopeTop.y, z: HIRASAKA.slopeDoor.z }, 2.6)) >= 0) out.push({ id: 'hs:adit', dist: d, text: 'CLIMB OUT OF THE ADIT', sub: 'Out onto the island', tone: 'good', hold: 0.5, enabled: true, onUse: () => this.climbOut() });
    if (v.act === ACT.climb && v.surfaced && HirasakaStory.canGoHome(v) && (d = near({ ...HIRASAKA.stonePush, y: TIERS[4].y }, HIRASAKA.stonePush.r + 1)) >= 0) out.push({ id: 'hs:home', dist: d, text: 'TURN AROUND AND LOOK AT HER', sub: 'Let her see you', tone: 'warn', hold: 2.5, enabled: true, onUse: () => this.act('home') });
  }

  private takePeaches(): void {
    this.peaches = HIRASAKA_STORY.peaches;
    this.act('peaches');
    this.sound.pick();
    this.sound.say(`sq${this.sex}_peach`, { story: true });
    if (!this.said.has('nat_peach')) {
      this.said.add('nat_peach');
      window.setTimeout(() => this.natsuki('nat_peach'), 1800);
    }
    this.g.feed(`WHITE PEACHES x${this.peaches} - THROW WITH THE GRENADE KEY`, 'good');
  }

  /** The weapon system's grenade key, while you carry peaches: one thrown instead. Returns whether it threw one. */
  throwPeach(o: THREE.Vector3, d: THREE.Vector3): boolean {
    if (this.peaches <= 0) return false;
    this.peaches--;
    this.look.throwPeach(o, d, (x, y, z) => {
      this.look.ward(x, y, z);
      this.sound.peach({ x, y: y + 0.5, z });
      this.act('peach', 0, x, z);
    });
    return true;
  }

  private rideCage(down: boolean): void {
    if (down) this.act('cage');
    const to = down ? HIRASAKA.cageBottom : HIRASAKA.cage;
    this.rideT = 0;
    // out of the cage, not inside its bars: east into the landing below, south out of the shaft house above
    this.rideTo = { x: to.x + (down ? 2.8 : 0), z: to.z + (down ? 0 : 3), y: 0, down };
    if (down) {
      this.sound.cage(3.2);
      this.sound.cue('descent', { fade: 0.4 });
      this.descentUntil = this.t + 12;
      this.sound.say(`sq${this.sex}_cage`, { story: true });
      if (!this.said.has('nat_cage')) {
        this.said.add('nat_cage');
        this.natsuki('nat_cage');
      }
    }
  }

  private climbOut(): void {
    this.rideT = 0;
    this.rideTo = { x: HIRASAKA.aditOut.x, z: HIRASAKA.aditOut.z, y: 0, down: false, adit: true };
  }

  private teleport(x: number, z: number, y: number): void {
    const g = this.g;
    const p = g.player;
    p.teleport(x, z, p.yaw);
    p.y = y;
    g.flow.cancel();
    g.squad.regroupAt(x, z, p.yaw, g.level.floors.areaAt(x, y, z));
  }

  // ---------------------------------------------------------------------------------------------
  // the endings
  // ---------------------------------------------------------------------------------------------

  private beginEnding(kind: number): void {
    const g = this.g;
    this.ending = kind || 1;
    this.endT = 0;
    this.sound.stopCue(1);
    if (this.ending === 2) {
      g.banner('HOME', 'You turned round. She is only a woman in an apron, and she is smiling.', 'good', 9);
      this.sound.cue('home', { fade: 1.5 });
      this.sound.say('mio_seen', { pos: this.mioPos(), chain: 'close', story: true });
      window.setTimeout(() => this.natsuki('nat_home'), 3500);
      window.setTimeout(() => this.sound.say('mio_home', { chain: 'far', story: true }), 7500);
      this.progress.home = true;
    } else {
      g.banner('THE SLOPE IS SEALED', 'The stone is home. The storm is breaking.', 'good', 8);
      this.sound.seal({ x: HIRASAKA.stoneSeal.x, y: TIERS[4].y + 1, z: HIRASAKA.stoneSeal.z });
      this.sound.cue('sealed', { fade: 1.2 });
      g.shake(1);
      window.setTimeout(() => this.natsuki('nat_sealed'), 2500);
      window.setTimeout(() => this.sound.say('sk_dawn', { story: true }), 7000);
      this.progress.sealed = true;
    }
    saveHirasaka(this.progress);
    this.sound.say(`sq${this.sex}_sealed`, { story: true });
    // the dead stop where they stand, and fall
    if (!this.remote) {
      for (const z of [...g.zombies.zombies]) {
        if (!z.alive) continue;
        if (z.variant === 'follower') {
          if (this.ending === 1) g.zombies.remove(z);
          continue;
        }
        z.invulnerable = false;
        g.zombies.damage(z, 1e6, false, g.zenv, 0);
      }
    }
  }

  private endingStep(dt: number): void {
    if (this.ending === 0) return;
    this.endT += dt;
    const g = this.g;
    // HOME: she walks away into the light and is gone
    if (this.ending === 2 && this.endT > 9.5 && !this.remote) g.zombies.vanish((z) => z.variant === 'follower');
    if (this.endT >= (this.ending === 2 ? 12 : 10) && !this.remote && !g.session.ended) g.endRun('victory', this.ending === 2 ? 'Let her go home' : 'Sealed the slope');
  }

  /** The run is over (the results). */
  end(): void {
    this.setVeil('none');
    this.sound.storm(0);
    this.stormLevel = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // the HUD
  // ---------------------------------------------------------------------------------------------

  decorateHud(st: HudState, md: MapDynamic): void {
    if (!this.active) return;
    const v = this.view;
    const p = this.g.player;
    const dist = (o: { x: number; z: number }): number => (inMine(o.x) !== this.underground ? -1 : Math.hypot(o.x - p.x, o.z - p.z));
    const list: HudState['objectives'] = [];
    const obj = (id: string, title: string, detail: string, done: boolean, progress: number, at: { x: number; z: number } | null, tracked = false): void => {
      list.push({ id: `hs-${id}`, title, detail, state: done ? 'complete' : 'active', progress: done ? 1 : progress, tracked, distance: done || !at ? -1 : dist(at) });
    };
    const mk = (id: string, at: { x: number; z: number }, label: string, color = '#9fffc4', pulse = false, radius?: number): void => {
      if (inMine(at.x) !== this.underground) return;
      md.markers.push({ id, kind: 'objective', x: at.x, z: at.z, label, color, visible: true, compass: true, pulse, ...(radius ? { radius } : {}) });
    };
    if (v.act === ACT.island) {
      const key = HirasakaStory.isDone(v, 'key');
      const light = HirasakaStory.isDone(v, 'light');
      const gates = HirasakaStory.isDone(v, 'gates');
      obj('key', JOB_NAMES.key, key ? 'Done' : "Genzō's room, up Block 65's outside stair", key, 0, PLACES.key);
      obj('light', JOB_NAMES.light, light ? 'Done - the island is lit' : v.generating ? `Hold the summit: ${Math.round(v.charge * 100)}%` : 'Start the generator by the lighthouse (summit, east)', light, v.charge, v.generating ? PLACES.summit : PLACES.generator);
      obj('gates', JOB_NAMES.gates, gates ? 'Done - the galleries are draining' : `Along the seawall (${HirasakaStory.count(v.valves)} of 3 open)`, gates, HirasakaStory.count(v.valves) / 3, PLACES.valves.find((_, i) => !(v.valves & (1 << i))) ?? PLACES.valves[0]);
      if (HirasakaStory.ready(v)) obj('cage', 'RIDE THE CAGE DOWN', 'The mine head, on the seawall (west)', false, -1, HIRASAKA.cage, true);
      else {
        const open = list.filter((o) => o.state !== 'complete' && o.distance >= 0);
        if (open.length) open.reduce((a, b) => (a.distance <= b.distance ? a : b)).tracked = true;
      }
      if (!key) mk('hs-key', PLACES.key, 'THE KEY');
      if (!light) {
        if (v.generating) mk('hs-summit', PLACES.summit, 'HOLD THE SUMMIT', '#9fffc4', true, PLACES.summit.r);
        else mk('hs-gen', PLACES.generator, 'GENERATOR');
      }
      if (!gates) PLACES.valves.forEach((k, i) => !(v.valves & (1 << i)) && mk(`hs-valve-${i}`, k, 'SEA GATE'));
      if (HirasakaStory.ready(v)) mk('hs-cage', HIRASAKA.cage, 'THE CAGE', '#ffe08a', true);
    } else if (v.act === ACT.deep) {
      if (!this.underground) {
        obj('down', 'RIDE THE CAGE DOWN', 'The others are below', false, -1, HIRASAKA.cage, true);
        mk('hs-cage', HIRASAKA.cage, 'THE CAGE', '#ffe08a', true);
      } else if (!v.peaches) {
        obj('village', 'FIND THE OLD VILLAGE', 'East along the gallery, then north', false, -1, PLACES.peaches, true);
        mk('hs-peaches', PLACES.peaches, 'THE PEACH TREE');
      } else if (!v.hairpin) {
        obj('root', 'THE ROOT HALL', 'South of the village: find what Genzō left behind', false, -1, PLACES.hairpin, true);
        mk('hs-hairpin', PLACES.hairpin, 'THE ROOTS', '#ff8a9a');
      } else {
        const b = this.g.zombies.boss;
        obj('ku', 'PUT DOWN KUROGANE', b?.alive ? 'The overseer - aim for the lamp on his helmet' : 'He is down', !b?.alive, b?.alive ? 1 - b.hp / b.maxHp : 1, b ?? null, true);
        if (b?.alive) mk('hs-ku', b, 'KUROGANE', '#ff5a4d', true);
      }
    } else if (v.act === ACT.climb) {
      if (!v.surfaced || this.underground) {
        obj('slope', 'CLIMB THE SLOPE', 'West out of the Root Hall, up to the old adit', false, -1, HIRASAKA.slopeDoor, true);
        mk('hs-adit', HIRASAKA.slopeDoor, 'THE ADIT', '#ffe08a', true);
      }
      if (v.surfaced && !this.underground) {
        obj('stone', 'PUSH THE SEALING STONE', v.held ? 'She is leaning on it - drive her off' : v.pushers > 0 ? `Rolling: ${Math.round(v.push * 100)}%` : 'At the head of the Hundred Steps, on the summit', false, v.push, HIRASAKA.stonePush, true);
        mk('hs-stone', HIRASAKA.stonePush, 'THE STONE', '#ffe08a', true, HIRASAKA.stonePush.r);
        if (v.surge < SURGE.length) {
          const s = SURGE[v.surge]!;
          st.timer = { label: `THE SEA REACHES ${TIERS[v.surge]!.name.replace(/^THE /, '')} IN`, seconds: Math.max(0, s.at - v.surgeT), urgent: s.at - v.surgeT < 20 };
        }
      }
      obj('look', 'DO NOT LOOK BACK', v.looks ? `You have looked back ${v.looks} time${v.looks > 1 ? 's' : ''}` : 'Whatever you hear behind you', false, -1, null);
    }
    if (this.peaches > 0) obj('peach', `WHITE PEACHES x${this.peaches}`, 'The grenade key throws one: a ring the dead will not cross', false, -1, null);
    if (v.act !== ACT.won) {
      const tapes = HirasakaStory.count(v.tapes);
      const photos = HirasakaStory.count(v.photos);
      if (tapes > 0 || photos > 0) obj('found', "GENZŌ'S TAPES AND PHOTOGRAPHS", `${tapes} of 5 tapes, ${photos} of 5 photographs - in the journal`, tapes + photos >= 10, (tapes + photos) / 10, null);
    }
    if (!v.call && HirasakaStory.count(v.photos) >= PHOTOS.length) mk('hs-phone', PLACES.phone, 'TELEPHONE', '#ffe08a', true);
    // the island's acts replace the operation's contracts (the squad's own lines stay)
    st.objectives = [...list, ...st.objectives.filter((o) => o.id !== 'defense' && o.id !== 'hunt' && o.id !== 'extract')];
  }

  // ---------------------------------------------------------------------------------------------
  // the screen's own effects (DOM over the canvas: never in the middle on phones, only the edges)
  // ---------------------------------------------------------------------------------------------

  private overlayEl(): HTMLDivElement {
    if (this.overlay) return this.overlay;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;background:#000';
    document.body.appendChild(d);
    this.overlay = d;
    return d;
  }

  private veilKind = 'none';
  private setVeil(kind: 'none' | 'look' | 'water' | 'dark'): void {
    if (kind === this.veilKind && kind !== 'look') return;
    this.veilKind = kind;
    if (kind === 'none' && !this.veil) return;
    if (!this.veil) {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .25s';
      const c = this.g.renderer.renderer.domElement;
      if (c.parentElement) c.parentElement.insertBefore(d, c.nextSibling);
      else document.body.appendChild(d);
      this.veil = d;
    }
    const v = this.veil;
    v.style.background =
      kind === 'water' ? 'radial-gradient(ellipse at center, rgba(10,40,60,.2) 30%, rgba(4,24,40,.85) 100%)' : kind === 'dark' ? 'radial-gradient(ellipse at center, rgba(0,0,0,.35) 20%, rgba(0,0,0,.9) 100%)' : 'radial-gradient(ellipse at center, transparent 50%, rgba(160,0,20,.6) 100%)';
    v.style.opacity = kind === 'none' ? '0' : '1';
  }

  /** The look-back: a red flash at the edges. */
  private flashVeil(): void {
    this.setVeil('look');
    window.setTimeout(() => {
      if (this.veilKind === 'look') this.setVeil('none');
    }, 700);
  }

  /** The run's first seconds: black, the boat's engine, the captain, Natsuki, the island fading up. */
  private opening(): void {
    const f = this.overlayEl();
    f.style.transition = 'none';
    f.style.background = '#000';
    f.style.opacity = '1';
    this.sound.cue('loading', { loop: true, fade: 0.5 });
    window.setTimeout(() => this.sound.say('sk_drop', { story: true }), 600);
    window.setTimeout(() => {
      f.style.transition = 'opacity 3s';
      f.style.opacity = '0';
    }, 1600);
    window.setTimeout(() => this.natsuki('nat_arrive'), 9500);
    window.setTimeout(() => this.natsuki('nat_brief'), 17000);
    window.setTimeout(() => (f.style.transition = ''), 5000);
    this.g.banner('HIRASAKA', 'Obon night, Typhoon No. 13. The island that sealed its mine. Do not look back.', 'info', 6);
  }

  /** A line said: its caption on the top line (the speaker's name; the PA in Japanese with the English after). */
  private caption(id: string): void {
    const l = LINE[id];
    if (!l || l.who === 'HAG') return;
    if (l.who === 'PA' && id.endsWith('_en')) return;
    const who = l.who === 'SQUAD-F' || l.who === 'SQUAD-M' ? 'YOU' : l.who === 'GENZO' ? 'GENZŌ (TAPE)' : l.who === 'MIO' ? 'MIO' : l.who;
    const text = l.ja ? `${l.ja}  ${l.text}` : l.text;
    this.g.radio(who, text, Math.min(14, 2.5 + text.length / 18));
  }

  private mioPos(): { x: number; y: number; z: number } | undefined {
    const m = this.g.zombies.zombies.find((z) => z.variant === 'follower' && z.alive);
    return m ? { x: m.x, y: m.y + 1.5, z: m.z } : undefined;
  }

  private bossPos(): { x: number; y: number; z: number } {
    const b = this.g.zombies.boss;
    return b ? { x: b.x, y: b.y + 2, z: b.z } : { x: 200, y: 2, z: -30 };
  }

  /** Natsuki wears her grandfather's helmet (a yellow shell, the lamp lit). */
  private helmet(): void {
    for (const f of this.g.squad.figures()) {
      if (this.helmeted.has(f)) continue;
      this.helmeted.add(f);
      const hat = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.45 }));
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.012, 16), shell.material);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.04, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xfff0c0, emissiveIntensity: 2.5 }));
      lamp.position.set(0, 0.07, -0.118);
      hat.add(shell, brim, lamp);
      hat.position.set(0, 0, 0.01);
      f.onHead(hat);
    }
  }

  dispose(): void {
    this.end();
    this.overlay?.remove();
    this.veil?.remove();
    this.look.dispose();
    this.sound.stopAll(0);
  }
}

/** The lowest bit set in `b` and not in `a`, or -1. */
function bitAdded(a: number, b: number): number {
  for (let i = 0; i < 16; i++) if (b & (1 << i) && !(a & (1 << i))) return i;
  return -1;
}
