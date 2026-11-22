/**
 * HIRASAKA in the game: "The Slope Between", reborn. The solo game runs the story and the island's infected here
 * (`story.ts`, `director.ts`); a co-op player shows the simulation's story from its reports (`applyWire`) and sends what
 * they do as requests (`act`). Either way everything on screen and in the ears follows the story's state, compared
 * frame to frame (`react`).
 *
 * What is only this player's is worked out here: which place group is drawn (`ZoneSwitch`), being in the deep (the
 * dark, the headlamp, the music), the risen sea hurting you, looking back at Mio, the gifts you carry (peaches, grapes,
 * the comb), a lamp-eater putting your light out, the cage ride and the climb out of the adit.
 *
 * The arms are `arms.ts`'s (tools swung at their own obstacles, the built guns, the boards, the offering box, the pit
 * workshop in the cage). Placeholders still stand in where a later wave has not taken over: the winch's harpoon prompt
 * (beside the Mori's own shot), Kurogane as the hunt's warden, each side story one prompt at its first place.
 *
 * On phones nothing new sits in the middle: the jobs are the objectives, every line is one caption along the top, the
 * edges of the screen carry the warnings (red when you look back, blue in the water), the journal waits in the menu.
 * There is no timer anywhere: the HUD shows no clock and no countdown.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER, QUALITY } from '../config';
import type { InteractionTarget } from '../game/interaction';
import type { Game } from '../game/game';
import type { HudState, MapDynamic } from '../ui/hudTypes';
import type { Zombie } from '../enemies/zombie';
import { ZoneSwitch, type Zone } from '../world/zones';
import { HirasakaDirector, hirasakaVariantPicker } from './director';
import { applyHirasakaDoors } from './doors';
import { buildJournal, loadHirasaka, saveHirasaka, type HirasakaProgress } from './journal';
import { LINE } from './lines';
import { IslandLook } from './look';
import {
  ADIT,
  BATH,
  CAGE,
  CLIMB_MARKS,
  COMB,
  DEEP_SPOTS,
  GROUPS,
  HEIGHTS,
  JOBS,
  LADLES,
  OBSTACLES,
  PHOTOS,
  PLACE,
  ROCK,
  TAPES,
  TOOL_IDS,
  TOOLS,
  UMIBOZU,
  inDeep,
  placeAt,
  type GroupId,
  type PlaceId,
  type Spot,
} from './places';
import { UMODE, Umi } from './bossUmi';
import { ACT, BUILT, decodeStory, HIRASAKA_STORY, HirasakaStory, JOB_IDS, JOB_NAMES, LADLE, type JobId, type StoryView } from './story';
import { HirasakaSound } from './sound';
import { HirasakaBosses } from './bosses'; // (hs-bosses) the fights, the climb and the finale on this screen
import { HirasakaArms } from './arms'; // (arms) the tools, the built guns, the boards, the offering box, the pit workshop
import { HirasakaSides } from './sideRuntime'; // (sides) the ten side stories: prompts, things, lines, payoffs

/** The risen sea hurts (health per second). */
const WATER_DPS = 7;
/** The line the first time anyone walks into each place (Natsuki's or Daigo's). */
const PLACE_LINE: Partial<Record<PlaceId, string>> = {
  shiofuri: 'dg_shiofuri',
  nikkyu: 'nat_nikkyu',
  block30: 'nat_block30',
  market: 'nat_market',
  block31: 'dg_block31',
  school: 'nat_school',
  block65: 'dg_block65',
  summit: 'nat_summit',
  pithead: 'dg_pithead',
  landing: 'nat_landing',
  galleries: 'nat_galleries',
  village: 'dg_village',
  kofun: 'nat_kofun',
  roothall: 'nat_roothall',
};
const SKY = {
  island: { hemi: 2.4, key: 1.5, fill: 0.7, env: 0.3, indoor: 1 },
  mine: { hemi: 1.15, key: 0.1, fill: 0.4, env: 0.1, indoor: 0.8 },
  dawn: { hemi: 3.8, key: 3, fill: 1, env: 0.45, indoor: 1 },
};
type Sky = typeof SKY.island;

/** The place groups as zones of scenery (`world/zones.ts`): a group is drawn near the player only. */
export const HIRASAKA_ZONES: readonly Zone<GroupId>[] = GROUPS.map((g) => ({ id: g.id, name: g.name, ...g.rect, near: g.near }));

export class HirasakaRuntime {
  readonly story = new HirasakaStory();
  private readonly dir: HirasakaDirector;
  readonly look = new IslandLook();
  /** (hs-bosses) the umibōzu, Kurogane, the climb's gifts, the finale and the endings drawn (`bosses.ts`). */
  readonly bosses: HirasakaBosses;
  /** (arms) the tools and their obstacles, the parts and benches and built guns, the boards, the box, the workshop (`arms.ts`). */
  readonly arms: HirasakaArms;
  /** (sides) the ten side stories on this screen (`sideRuntime.ts`). */
  readonly sides: HirasakaSides;
  readonly sound: HirasakaSound;
  readonly zones: ZoneSwitch<GroupId>;
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
  private next = { pa: 50, thunder: 6, mio: 10, hag: 6, miner: 6, funa: 3, ring: 0, ku: 0 };
  private readonly said = new Set<string>();
  /** (final polish: voiced lines) Natsuki down last frame (her `nat_down`), and when the player last shouted at a wave. */
  private natDown = false;
  private waveShoutT = -99;
  private readonly seen = new Set<string>();
  private readonly placesSaid = new Set<PlaceId>();
  /** This player's own gifts for the climb. */
  private peachN = 0;
  grapes = 0;
  combs = 0;
  /** This player's hand carries the hearth's mark. */
  private marked = false;
  private gaze = 0;
  private blindT = 0;
  private rideT = -1;
  private rideTo: { x: number; z: number; y: number; down: boolean } | null = null;
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
  private descentUntil = 0;

  constructor(private readonly g: Game) {
    this.sound = new HirasakaSound(g.audio);
    this.zones = new ZoneSwitch(HIRASAKA_ZONES, g.level.zones);
    g.worldRoot.add(this.look.root);
    this.bosses = new HirasakaBosses(g, this.sound, (a, i) => this.act(a, i ?? 0));
    this.arms = new HirasakaArms(g, () => this.view, (a, i, x, z) => this.act(a, i ?? 0, x, z)); // (arms)
    this.sides = new HirasakaSides(g, () => this.view, (a, i) => this.act(a, i), this.sound); // (sides)
    // (arms) the Mori's harpoon strikes the umibōzu when the bosses' fight says it reaches it (then the story's umiHit)
    this.arms.guns.harpoonHook = (o, d) => {
      if (!this.bosses.strikes(this.view, o, d)) return false;
      this.act('umiHit');
      return true;
    };
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

  /** What appears only later (the sea, the wreck, the wards): compiled with the level. */
  prewarmObjects(): THREE.Object3D[] {
    return [...this.look.prewarm(), ...this.bosses.prewarm()];
  }

  /** A new run (call after `populate`). */
  reset(coop: boolean): void {
    const g = this.g;
    this.remote = coop;
    this.wire = null;
    this.active = true;
    this.t = 0;
    this.sex = Math.random() < 0.5 ? 'f' : 'm';
    this.next = { pa: 50, thunder: 6, mio: 10, hag: 6, miner: 6, funa: 3, ring: 0, ku: 0 };
    this.said.clear();
    this.seen.clear();
    this.placesSaid.clear();
    this.peachN = 0;
    this.grapes = 0;
    this.combs = 0;
    this.marked = false;
    this.gaze = 0;
    this.blindT = 0;
    this.rideT = -1;
    this.rideTo = null;
    this.flashT = 0;
    this.flash2 = -1;
    this.endT = -1;
    this.ending = 0;
    this.underground = false;
    this.stormLevel = -1;
    this.sky = { ...SKY.island };
    this.progress = loadHirasaka();
    this.story.reset();
    this.story.drain();
    if (!coop) {
      this.dir.reset();
      g.session.hunt.status = 'available';
    }
    applyHirasakaDoors(g.level, this.story.view);
    this.look.reset();
    this.bosses.reset();
    this.arms.reset(); // (arms)
    this.sides.reset(); // (sides)
    this.prev = null;
    this.sound.stopAll(0.2);
    this.setVeil('none');
    this.zones.update(g.player.x, g.player.z);
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
    applyHirasakaDoors(g.level, v);
    this.react(this.prev, v);
    this.prev = { ...v };
    const p = g.player;
    this.underground = inDeep(p.x);
    this.zones.update(p.x, p.z);
    this.look.update(dt, v, g.renderer.camera, this.underground, (x, z, y) => g.level.world.floorBelow(x, z, 0.1, y, 0.4));
    this.helmet();
    this.bosses.update(dt, v, this.underground, this.blindT > 0);
    this.arms.update(dt); // (arms)
    this.sides.update(dt); // (sides)
    if (playing) {
      this.places(v);
      this.ride(dt);
      this.weather(dt, v);
      this.hazards(dt, v);
      this.kinds(dt, v);
      this.music(v);
      this.ambient(v);
      this.lessons(v);
    }
    this.endingStep(dt);
    this.sound.update();
  }

  /**
   * Free roam (no story): the island drawn whole, and the way down - fly down the shaft under the headframe at the
   * pithead and you come out at the cage landing below; fly up out of the landing to come back.
   */
  roam(dt: number): void {
    const g = this.g;
    const p = g.player;
    this.t += dt;
    this.underground = inDeep(p.x);
    this.zones.showAll();
    this.look.update(dt, this.view, g.renderer.camera, this.underground, (x, z, y) => g.level.world.floorBelow(x, z, 0.1, y, 0.4));
    if (!this.said.has('roam')) {
      this.said.add('roam');
      g.banner('THE DEEP IS BELOW', 'Fly down the shaft under the headframe at the pithead (east) to go underground. Fly up out of the cage landing to come back.', 'info', 9);
    }
    const C = CAGE.top;
    const D = CAGE.bottom;
    if (!this.underground && Math.hypot(p.x - C.x, p.z - (C.z - 4)) < 3.2 && p.y < 1.5) {
      p.teleport(D.x + 3, D.z, p.yaw);
      p.y = D.y + 2;
      g.banner('THE CAGE LANDING', '636 m down. Fly up here to go back to the island.', 'info', 5);
    } else if (this.underground && Math.hypot(p.x - D.x, p.z - D.z) < 4.5 && p.y > D.y + 5.2) {
      p.teleport(C.x, C.z + 5, p.yaw);
      p.y = 3;
    }
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
    if (st.kuPhase > q.view.kuPhase) q.act('kuPhase', st.kuPhase, { x: p.x, y: p.y, z: p.z });
    if (st.fallen) q.fallen(st.fallen);
    // (hs-bosses) Kurogane's thunders, the fights' state, what the waves and his gas did to this player
    for (let i = 0; i < 8; i++) if (st.thunders & (1 << i)) q.act('thunder', i, { x: p.x, y: p.y, z: p.z });
    q.bossWords(...st.words);
    for (const h of st.hurts) if (h.i === 0) g.zenv.hurtPlayer(h.amount, h.x, h.z, 'melee', h.knock);
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
    const say = (id: string, delay = 0): void => this.squadLine(id, delay);
    for (let i = 0; i < JOB_IDS.length; i++) if (b.done & (1 << i) && !(a.done & (1 << i))) this.jobDone(JOB_IDS[i]!, b);
    if (b.coal !== a.coal) {
      const n = HirasakaStory.count(b.coal);
      g.feed(`COAL SACK ${n} OF 3`, 'good');
      if (n === 3) say('dg_coal', 1);
    }
    if (b.boilerKey && !a.boilerKey) g.feed('THE BOILER KEY', 'good');
    if (b.tools !== a.tools) {
      const i = bitAdded(a.tools, b.tools);
      if (i >= 0) g.feed(`${TOOLS[TOOL_IDS[i]!].name} - IT OPENS WHAT NOTHING ELSE DOES`, 'good');
    }
    if (b.obstacles !== a.obstacles) {
      const i = bitAdded(a.obstacles, b.obstacles);
      const o = i >= 0 ? OBSTACLES[i] : undefined;
      if (o) {
        g.banner('OPENED', o.what.replace(/^the /, '').toUpperCase(), 'good', 3.5);
        if (o.id === 'shutter') say('dg_shutter');
      }
    }
    if (b.ladles !== a.ladles) {
      if (b.ladles === LADLE.carried) say('dg_ladles');
      else if (b.ladles === LADLE.bottomless) g.feed('THE LADLES, BOTTOMS KNOCKED OUT', 'good');
    }
    if (b.moriParts !== a.moriParts) g.feed(`A PART FOR THE MORI (${HirasakaStory.count(b.moriParts)} OF 2)`, 'good');
    if (b.built !== a.built && b.built & (1 << BUILT.mori) && !(a.built & (1 << BUILT.mori))) g.banner('THE MORI', 'The winch harpoon is loaded', 'good', 4);
    if (b.umi === 1 && a.umi === 0) {
      g.banner('SOMETHING IN THE SEA', 'Past the seawall. The winch on the seawall still turns.', 'danger', 7);
      g.shake(0.5);
      say('dg_sea', 1);
      say('nat_umi', 6);
      say('dg_mori', 10);
    }
    // (final polish: voiced lines) the umibōzu throws: whoever is on the seafront shouts it, Natsuki the first time
    if (b.umi === 1 && Umi.mode(b.ua) === UMODE.throw_ && Umi.mode(a.ua) !== UMODE.throw_) {
      const p = g.player;
      if (Umi.laneAt(p.x, p.z) >= 0 && this.t - this.waveShoutT > 20) {
        this.waveShoutT = this.t;
        this.sound.say(`sq${this.sex}_wave`, {});
      }
      say('nat_wave', 0.8);
    }
    if (b.umiHits > a.umiHits && b.umi === 1) {
      g.shake(0.35);
      say('nat_hit');
    }
    if (b.umi === 2 && a.umi === 1) {
      g.banner('IT HAS GONE UNDER', 'The cage runs: ride it down from the headframe at the pithead', 'good', 7);
      say('nat_ready', 2);
      this.sound.signal({ x: CAGE.top.x, y: 4, z: CAGE.top.z }, 3);
    }
    if (b.cageDown && !a.cageDown && !this.underground) this.look.ride();
    if (b.ladles === LADLE.given && a.ladles !== LADLE.given) {
      g.banner('THE FUNAYŪREI LET YOU BY', 'They take the ladles and sink back into the water', 'good', 5);
      say('nat_funapass', 1);
    }
    if (b.hairpin && !a.hairpin) {
      g.banner("MIO'S HAIRPIN", 'Something wakes in the Root Hall. Every door in the village swings open.', 'danger', 6);
      say('dg_hairpin');
      this.once('ku_wake', { pos: this.bossPos(), delay: 3 });
    }
    if (b.kuPhase > a.kuPhase && b.kuPhase <= 3 && !b.bossDown) say(`nat_ku${b.kuPhase}`);
    if (b.bossDown && !a.bossDown) {
      g.banner('THE CABLE HAS GONE', 'The cage is at the bottom of the shaft in pieces. The only way out is the slope: up the kofun passage to the old adit.', 'danger', 8);
      this.sound.cable({ x: CAGE.bottom.x, y: CAGE.bottom.y + 6, z: CAGE.bottom.z });
      this.look.cable();
      g.shake(0.6);
      say('nat_bossdown');
      say('nat_cable', 2.6);
      window.setTimeout(() => this.sound.say('mio_wake', { pos: { x: DEEP_SPOTS.tree.x, y: 2, z: DEEP_SPOTS.tree.z }, chain: 'far', story: true }), 4000);
      say('dg_tree', 7);
      say('nat_dontlook', 11);
    }
    if (b.lead > a.lead) {
      const m = CLIMB_MARKS[b.lead];
      if (m && m.id === 'adit') {
        g.banner('OUT OF THE ADIT', 'Up the Stairs of Life, across the landing, up the Hell Stairs. The sea comes up behind every place you leave.', 'danger', 8);
        say('nat_surface');
        this.pa('pa_dont');
      } else if (m && m.id === 'rock') {
        say('dg_rock');
        say('nat_winch', 3);
        if (HirasakaStory.canGoHome(b)) say('dg_egg', 7);
      }
    }
    if (b.mark > a.mark && b.mark >= 1) {
      g.banner('THE SEA IS RISING', `${CLIMB_MARKS[b.mark - 1]!.name.replace(/^THE /, '')} IS UNDER THE WATER`, 'danger', 4);
      if (b.mark >= 2) say('nat_rise');
      // (final polish: voiced lines) the first place under the water: the player drives them on
      else this.ownOnce(`sq${this.sex}_climb`, 1);
      g.shake(0.3);
    }
    if (b.cranks > 0 && a.cranks === 0) g.banner('THE CHIBIKI-IWA', 'Every turn of a winch moves it. Every hand on a handle, and keep them off you.', 'warn', 6);
    if (b.held && !a.held) {
      g.banner('SHE IS LEANING ON THE ROCK', 'It barely moves while she does. A peach drives her off; enough shots push her back.', 'danger', 6);
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
      g.banner('THE GALLERY TELEPHONE', 'Mio, in 1974.', 'good', 7);
    }
    // (sides: a side story's steps, lines and payoff are `sideRuntime.ts`'s)
    if (b.looks > a.looks) {
      this.sound.chime();
      this.flashVeil();
      // (final polish: voiced lines) the player knows what they did, and she answers
      if (b.looks === 1 || b.looks % 4 === 0) {
        this.sound.say(`sq${this.sex}_looked`, {});
        this.sound.say('mio_looked', { pos: this.mioPos(), chain: 'monster' });
      }
    }
    if (b.act === ACT.won && a.act !== ACT.won) this.beginEnding(b.ending);
  }

  private jobDone(job: JobId, v: StoryView): void {
    const g = this.g;
    const n = HirasakaStory.jobsDone(v);
    g.banner(`${JOB_NAMES[job]}: DONE`, n < 3 ? `${n} of 3 - the winding engine needs all three` : 'The winding engine is ready', 'good', 5);
    this.sound.pick();
    if (job === 'steam') this.squadLine('nat_steam', 1);
    else if (job === 'air') this.squadLine('nat_air', 1);
    else this.squadLine('dg_key', 0.5);
  }

  private tape(i: number): void {
    this.sound.pick();
    this.sound.say(`sq${this.sex}_tape`, { story: true });
    this.sound.say(`tape_${i + 1}`, { chain: 'tape', story: true });
    // (final polish: voiced lines) "Another of his tapes": Natsuki, once there is more than one
    if (HirasakaStory.count(this.view.tapes) >= 2) this.squadLine('nat_tape');
    this.progress.tapes |= 1 << i;
    saveHirasaka(this.progress);
    this.g.feed(`GENZŌ'S TAPE ${i + 1} OF ${TAPES.length} - IN THE JOURNAL`, 'good');
  }

  private photo(i: number, all: boolean): void {
    this.sound.pick();
    this.ownOnce(`sq${this.sex}_photo`); // (final polish: voiced lines) the player's first photograph
    this.squadLine('nat_photo');
    this.progress.photos |= 1 << i;
    saveHirasaka(this.progress);
    this.g.feed(`A PHOTOGRAPH (${HirasakaStory.count(this.view.photos)} OF ${PHOTOS.length}) - IN THE JOURNAL`, 'good');
    if (all) this.g.banner('EVERY PHOTOGRAPH', 'Somewhere in the deep, a telephone has started ringing', 'good', 7);
  }

  /** Natsuki or Daigo says it (they are with you in every room: solo they are the squad, in co-op they stay too). */
  private squadLine(id: string, delay = 0): void {
    if (this.said.has(id) && !id.startsWith('nat_hit')) return;
    this.said.add(id);
    const go = (): void => void this.sound.say(id, { chain: 'dry', story: true });
    if (delay > 0) window.setTimeout(go, delay * 1000);
    else go();
  }

  private once(id: string, o: { pos?: { x: number; y: number; z: number }; delay?: number } = {}): void {
    if (this.said.has(id)) return;
    this.said.add(id);
    if (o.delay) window.setTimeout(() => this.sound.say(id, { pos: o.pos, story: true }), o.delay * 1000);
    else this.sound.say(id, { pos: o.pos, story: true });
  }

  /** (final polish: voiced lines) One of the player's own lines, said once a run. */
  private ownOnce(id: string, delay = 0): void {
    if (this.said.has(id)) return;
    this.said.add(id);
    const go = (): void => void this.sound.say(id, { story: true });
    if (delay > 0) window.setTimeout(go, delay * 1000);
    else go();
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
    if (this.t > 30) say('jobs', 'Three jobs get the winding engine going, any order - they are your objectives. The tools to swing each open only their own obstacles: the pick, the axe, the shovel, the shrine sword.', 11);
    if (this.t > 50) say('tapes', "Genzō's tapes and his photographs are round the island and below it. The journal (in the menu) keeps them.", 8);
    if (this.peachN + this.grapes + this.combs > 0) say('gifts', 'The grenade key throws a gift: a peach (nothing of the dead crosses where it lands, not even her), grapes (the hags stop to eat), the comb (bamboo the hags will not pass).', 11);
    if (v.act === ACT.climb) say('look', 'Do not look back at her: every look brings her on faster. She cannot be killed. The sea rises behind each place once everyone has left it - nothing here is timed.', 11);
  }

  // ---------------------------------------------------------------------------------------------
  // this player's own: places, the cage, the weather, the hazards, what is near
  // ---------------------------------------------------------------------------------------------

  private places(v: StoryView): void {
    const p = this.g.player;
    if (this.t > 25 && p.z > 56 && p.z < 76 && p.x > -40 && p.x < 70 && !this.said.has('nat_seawall')) this.squadLine('nat_seawall');
    // (final polish: voiced lines) Daigo at the lamp-room tag board; at the drift's fallen roof while it is shut
    const tb = DEEP_SPOTS.tagBoard;
    if (this.underground && Math.hypot(p.x - tb.x, p.z - tb.z) < 4.5 && Math.abs(p.y - tb.y) < 2) this.squadLine('dg_tags', 0.5);
    const dr = OBSTACLES.find((o) => o.id === 'drift')!.at;
    if (this.underground && !HirasakaStory.open(v, 'drift') && Math.hypot(p.x - dr.x, p.z - dr.z) < 8 && Math.abs(p.y - dr.y) < 2) this.squadLine('dg_drift');
    // Natsuki (the squad's first figure) goes down: she calls for help, once a run
    const nat = this.g.squad.figures()[0];
    const down = !!nat && nat.fallen;
    if (down && !this.natDown) this.squadLine('nat_down');
    this.natDown = down;
    const at = placeAt(p.x, p.z);
    if (!at || this.placesSaid.has(at)) return;
    this.placesSaid.add(at);
    const id = PLACE_LINE[at];
    if (id && this.t > 20) this.squadLine(id);
    if (at === 'roothall' && !HirasakaStory.open(v, 'roots')) {
      this.squadLine('nat_roots', 5);
      this.squadLine('dg_tachi', 9);
    }
    if (at === 'village' && !v.marked) this.squadLine('nat_hearth', 8);
  }

  /** The cage's ride and the climb out of the adit: a moment of black, then out the other end. */
  private ride(dt: number): void {
    if (this.rideT < 0 || !this.rideTo) return;
    this.rideT += dt;
    const o = this.overlayEl();
    const dur = this.rideTo.down ? 3.2 : 1.6;
    o.style.background = this.rideTo.down ? (Math.floor(this.rideT * 7) % 3 === 0 ? '#2a1e10' : '#000') : '#000';
    o.style.opacity = String(Math.min(1, this.rideT * 4));
    if (this.rideT >= dur) {
      const to = this.rideTo;
      this.teleport(to.x, to.z, to.y);
      this.rideTo = null;
      this.rideT = -1;
      o.style.transition = 'opacity 1.2s';
      o.style.opacity = '0';
      window.setTimeout(() => (o.style.transition = ''), 1300);
    }
  }

  private weather(dt: number, v: StoryView): void {
    const g = this.g;
    const ug = this.underground;
    const want = this.ending > 0 && this.endT > 2 ? SKY.dawn : ug ? SKY.mine : SKY.island;
    const k = Math.min(1, dt * (ug ? 3 : 1.5));
    for (const key of Object.keys(this.sky) as (keyof Sky)[]) this.sky[key] += (want[key] - this.sky[key]) * k;
    this.flashT = Math.max(0, this.flashT - dt);
    if (!ug && this.ending === 0) {
      this.next.thunder -= dt;
      if (this.next.thunder <= 0) {
        this.next.thunder = 9 + Math.random() * 14;
        this.flashT = 0.12;
        this.flash2 = this.t + 0.22;
        this.sound.thunder(0.3 + Math.random() * 0.7);
      }
      if (this.flash2 > 0 && this.t >= this.flash2) {
        this.flash2 = -1;
        this.flashT = 0.08;
      }
    }
    const f = this.flashT > 0 ? 7 : 0;
    const su = g.renderer.sky.userData.uniforms;
    const dawn = this.ending > 0 && this.endT > 2;
    (su.uMid!.value as THREE.Color).setHex(f > 0 ? 0x8a9aa8 : dawn ? 0x8a7a86 : 0x111a1e);
    (su.uZenith!.value as THREE.Color).setHex(f > 0 ? 0x4a5a6a : dawn ? 0x3a4a6a : 0x06090c);
    (su.uHorizon!.value as THREE.Color).setHex(dawn ? 0xe8a888 : 0x1e2c30);
    g.renderer.setSkyLevels({ hemi: this.sky.hemi + f, key: this.sky.key + f * 0.6, fill: this.sky.fill, env: this.sky.env + f * 0.05, indoor: this.sky.indoor });
    const fog = g.renderer.scene.fog as THREE.FogExp2 | null;
    if (fog && 'density' in fog) {
      const dens = ug ? 0.045 : this.ending > 0 ? this.fogBase.density * 0.6 : this.fogBase.density * (v.mark >= 2 ? 1.25 : 1.1);
      fog.density += (dens - fog.density) * Math.min(1, dt * 2);
      const c = ug ? [0.012, 0.011, 0.01] : dawn ? [0.42, 0.38, 0.4] : [0.035, 0.05, 0.06];
      fog.color.setRGB(fog.color.r + (c[0]! - fog.color.r) * k, fog.color.g + (c[1]! - fog.color.g) * k, fog.color.b + (c[2]! - fog.color.b) * k);
      this.fitView(fog.density);
    }
    // the headlamp, in the deep (out for a while after a lamp-eater's hit)
    this.blindT = Math.max(0, this.blindT - dt);
    const lamp = ug && this.blindT <= 0 && g.playerAlive() ? 24 : 0;
    this.look.headlamp.intensity += (lamp - this.look.headlamp.intensity) * Math.min(1, dt * 8);
    const storm = ug ? 0 : this.ending > 0 ? 0.25 : v.act === ACT.climb ? 1.4 : 1;
    if (Math.abs(storm - this.stormLevel) > 0.04) {
      this.stormLevel = storm;
      this.sound.storm(storm);
    }
  }

  /** The risen sea hurts whoever is still in it. */
  private hazards(dt: number, v: StoryView): void {
    const g = this.g;
    const p = g.player;
    if (!g.playerAlive() || this.ending > 0) {
      this.setVeil(this.blindT > 0 ? 'dark' : 'none');
      return;
    }
    const sea = HirasakaStory.seaLevel(v, this.underground);
    const wet = v.act === ACT.climb && p.y < sea - 0.3;
    if (wet) g.hurtPlayer(WATER_DPS * dt, null, null, { ignoreArmor: true, toxic: true });
    this.setVeil(wet ? 'water' : this.blindT > 0 ? 'dark' : this.gaze > 0.15 ? 'look' : 'none');
  }

  /** The kinds near this player: Mio behind you, the hags' whispers, the miners at work, Kurogane. */
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
      if (z.variant === 'drowned' && this.underground && d < 14 && v.ladles < LADLE.given && z.state === 'idle') this.squadLine('dg_funa');
      // the funayūrei whisper for a ladle until they are given theirs
      if (z.variant === 'drowned' && this.underground && d < 11 && v.ladles < LADLE.given && n.funa <= 0) {
        n.funa = 9 + Math.random() * 6;
        this.sound.say(`fy_${1 + Math.floor(Math.random() * 3)}`, { pos: { x: z.x, y: z.y + 1.2, z: z.z }, chain: 'far', volume: 0.8 });
      }
    }
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
      if (d < 30) this.squadLine('nat_boss');
    } else if (v.hairpin && v.bossDown) this.once('ku_fall', { pos: { x: DEEP_SPOTS.kurogane.x, y: 2, z: DEEP_SPOTS.kurogane.z } });
    // the gallery telephone, once every photograph is found
    if (!v.call && HirasakaStory.count(v.photos) >= PHOTOS.length && this.underground && n.ring <= 0) {
      n.ring = 3.2;
      this.sound.ring({ x: DEEP_SPOTS.phone.x, y: DEEP_SPOTS.phone.y + 1.4, z: DEEP_SPOTS.phone.z + 1.5 });
    }
  }

  /** The score for where you are and what is happening. */
  private music(v: StoryView): void {
    if (this.ending > 0 || this.rideT >= 0 || this.t < 10) return;
    const p = this.g.player;
    const at = placeAt(p.x, p.z);
    const boss = this.g.zombies.boss;
    let want: string;
    if (v.act === ACT.climb) want = 'climb';
    else if (this.underground) want = boss?.alive && boss.variant === 'overseer' && (at === 'roothall' || at === 'kofun') ? 'overseer' : at === 'village' ? 'village' : 'deep';
    else want = v.umi === 1 ? 'hold' : 'island';
    if (this.sound.cueId !== want && !(this.sound.cueId === 'descent' && this.t < this.descentUntil)) this.sound.cue(want, { loop: true, fade: 2.2 });
  }

  /** The island's speakers, now and then (on the island, before the climb). */
  private ambient(v: StoryView): void {
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

  /** Do it (solo: the story here; co-op: ask the simulation). */
  private act(a: string, i = 0, x?: number, z?: number): void {
    const p = this.g.player;
    if (this.remote) {
      this.request?.(a, i, x, z);
      return;
    }
    if ((a === 'peach' || a === 'grapes' || a === 'comb') && x !== undefined && z !== undefined) {
      this.dir.thrown(a, x, z);
      return;
    }
    this.story.act(a, i, { x: p.x, y: p.y, z: p.z }, 0);
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
    const push = (id: string, at: Spot, r: number, text: string, sub: string, use: () => void, o: { tone?: InteractionTarget['tone']; hold?: number; enabled?: boolean } = {}): void => {
      const d = near(at, r);
      if (d < 0) return;
      out.push({ id: `hs:${id}`, dist: d, text, sub, tone: o.tone ?? 'good', hold: o.hold ?? 0.6, enabled: o.enabled ?? true, onUse: use });
    };
    const island = v.act === ACT.island || v.act === ACT.deep;
    // ---- act I ----
    if (island) {
      JOBS.steam.coal.forEach((c, i) => {
        if (i !== 2 && !(v.coal & (1 << i))) push(`coal:${i}`, c, 2, 'TAKE THE COAL SACK', 'For the boiler under Block 31', () => this.act('coal', i));
      });
      if (!v.boilerKey) push('boilerKey', JOBS.steam.boilerKey, 2, 'TAKE THE BOILER KEY', 'On the caretaker\'s board', () => this.act('boilerKey'));
      if (!HirasakaStory.isDone(v, 'steam')) {
        const ok = v.coal === 7 && v.boilerKey;
        push('burner', JOBS.steam.boiler, 2.4, ok ? 'BUILD THE BURNER AND FIRE THE BOILER' : 'THE BOILER IS COLD', ok ? 'Three sacks and the key' : `${HirasakaStory.count(v.coal)} of 3 coal sacks${v.boilerKey ? '' : ', and its key'}`, () => this.act('burner'), { enabled: ok, hold: 1.2 });
      }
      if (!HirasakaStory.isDone(v, 'air') && HirasakaStory.open(v, 'shutter')) push('fan', JOBS.air.fan, 2, 'START THE FAN', 'The starter lever', () => this.act('fan'), { hold: 1 });
      if (!HirasakaStory.isDone(v, 'key')) push('key', JOBS.key.key, 2, "TAKE GENZŌ'S CAGE KEY", 'On its nail by the door', () => this.act('key'));
      if (v.ladles === LADLE.none) push('ladles', LADLES, 2, 'TAKE THE BATH LADLES', 'A stack of wooden ladles by the tubs', () => this.act('ladles'));
      // (arms: the Mori's parts, its building and taking are `arms.ts`'s; the winch's harpoon prompt stays the fight's)
      if (v.built & (1 << BUILT.mori) && v.umi === 1) push('harpoon', UMIBOZU.winch, 2.4, 'FIRE THE HARPOON', `${v.umiHits} of ${HIRASAKA_STORY.umiHits} hits`, () => this.act('harpoon'), { tone: 'warn', hold: 0.5, enabled: Umi.exposed(v.ua) });
    }
    // (arms: the tools, and what each opens, are `arms.ts`'s: real swings, each tool only its own obstacles)
    // ---- the cage ----
    if (HirasakaStory.ready(v) && !v.bossDown) {
      push('cage', CAGE.top, 3, 'RIDE THE CAGE DOWN', 'Shaft Three, 636 m', () => this.rideCage(true), { hold: 1 });
      push('cageUp', CAGE.bottom, 3, 'RIDE THE CAGE UP', 'Back to the pithead', () => this.rideCage(false), { tone: 'normal', hold: 1 });
    } else if (!v.bossDown && v.act === ACT.island) push('cageDead', CAGE.top, 3, 'THE CAGE IS DEAD', HirasakaStory.jobsAll(v) ? 'Something in the sea is tearing at the shaft head' : 'The winding engine needs steam, air and the key', () => {}, { enabled: false });
    // ---- act II ----
    if (v.cageDown) {
      if (v.ladles === LADLE.carried) push('knock', DEEP_SPOTS.bench, 2, 'KNOCK THE BOTTOMS OUT OF THE LADLES', 'At the lamp room bench', () => this.act('knock'), { hold: 1 });
      if (v.ladles !== LADLE.given) push('funa', DEEP_SPOTS.funa, 3, v.ladles === LADLE.bottomless ? 'HAND OVER THE LADLES' : 'THE FUNAYŪREI HOLD OUT THEIR HANDS', v.ladles === LADLE.bottomless ? 'Bottomless, so they cannot bail' : v.ladles === LADLE.carried ? 'Not like that: knock the bottoms out first' : 'They want something to bail with', () => this.act('funa'), { enabled: v.ladles === LADLE.bottomless, hold: 1 });
      if (!this.marked) push('eat', DEEP_SPOTS.hearth, 2.4, 'EAT AT THE HEARTH', 'It would heal you', () => this.eat(), { tone: 'warn', hold: 1.2 });
      if (this.grapes < HIRASAKA_STORY.grapes) push('grapes', DEEP_SPOTS.grapes, 2, 'TAKE THE BON GRAPES', `Carry ${HIRASAKA_STORY.grapes} for the climb`, () => this.takeGift('grapes'));
      if (!v.hairpin && HirasakaStory.open(v, 'roots')) push('hairpin', DEEP_SPOTS.hairpin, 2.6, "TAKE MIO'S HAIRPIN", 'A red camellia, in the roots', () => this.act('hairpin'), { tone: 'warn', hold: 1.2 });
    }
    if (this.marked) push('wash', BATH, 2.6, 'WASH YOUR HAND', 'The pithead bath', () => this.wash(), { hold: 1.2 });
    if (this.combs < HIRASAKA_STORY.combs) push('comb', COMB, 2, "TAKE GENZŌ'S COMB", 'Lacquered, a few teeth missing', () => this.takeGift('comb'));
    // ---- act III ----
    if (v.act === ACT.climb) {
      if (this.peachN < HIRASAKA_STORY.peaches) push('peaches', DEEP_SPOTS.peaches, 3, 'PICK THE PEACHES', `Carry ${HIRASAKA_STORY.peaches}: throw one with the grenade key`, () => this.takeGift('peaches'));
      push('adit', ADIT.door, 2.6, 'CLIMB OUT OF THE ADIT', 'Out onto the island', () => this.climbOut(), { hold: 0.5 });
      ROCK.winches.forEach((w, i) => push(`crank:${i}`, w, 2.4, 'TURN THE WINCH', `The Chibiki-iwa: ${Math.round(HirasakaStory.rock(v) * 100)}%${v.held ? ' - she is leaning on it' : ''}`, () => this.crank(i), { tone: 'warn', hold: 0.4 }));
      if (HirasakaStory.canGoHome(v)) push('home', ROCK.turn, 4, 'TURN ROUND AND LOOK AT HER', 'Let her see you', () => this.act('home'), { tone: 'warn', hold: 2 });
    }
    this.bosses.targets(out, v);
    // ---- what is found ----
    TAPES.forEach((t, i) => {
      if (!(v.tapes & (1 << i))) push(`tape:${i}`, t, 2, 'PICK UP THE CASSETTE', `Genzō's tape ${i + 1}`, () => this.act('tape', i), { hold: 0.4 });
    });
    PHOTOS.forEach((ph, i) => {
      if (!(v.photos & (1 << i))) push(`photo:${i}`, ph, 2, 'PICK UP THE PHOTOGRAPH', '', () => this.act('photo', i), { hold: 0.4 });
    });
    if (!v.call && HirasakaStory.count(v.photos) >= PHOTOS.length) push('phone', DEEP_SPOTS.phone, 2.2, 'ANSWER THE TELEPHONE', '', () => this.act('phone'), { hold: 0.3 });
    // (sides: the side stories' prompts are `sideRuntime.ts`'s)
  }

  /** The hearth: it heals, and it marks this player's hand (the hags follow the mark on the climb). */
  private eat(): void {
    const g = this.g;
    g.session.vitals.health = Math.max(g.session.vitals.health, PLAYER.maxHealth);
    this.act('eat');
    this.marked = true;
    g.banner('YOUR HAND IS MARKED', 'The hags will follow it on the climb. The pithead bath washes it off.', 'warn', 7);
    this.squadLine('dg_eat');
    this.squadLine('nat_mark', 3);
    this.squadLine('dg_wash', 7);
  }

  private wash(): void {
    this.act('wash');
    this.marked = false;
    this.g.banner('WASHED OFF', 'The mark is gone', 'good', 4);
  }

  private takeGift(kind: 'peaches' | 'grapes' | 'comb'): void {
    if (kind === 'peaches') {
      this.peachN = HIRASAKA_STORY.peaches;
      this.act('peaches');
      this.sound.say(`sq${this.sex}_peach`, { story: true });
      this.squadLine('nat_peach', 1.8);
      this.g.feed(`WHITE PEACHES x${this.peachN} - THROW WITH THE GRENADE KEY`, 'good');
    } else if (kind === 'grapes') {
      this.grapes = HIRASAKA_STORY.grapes;
      this.act('grapes');
      this.g.feed(`BON GRAPES x${this.grapes} - THE HAGS STOP TO EAT`, 'good');
    } else {
      this.combs = HIRASAKA_STORY.combs;
      this.act('comb');
      this.g.feed("GENZŌ'S COMB - THROWN, IT GROWS BAMBOO", 'good');
    }
    this.sound.pick();
  }

  private crank(i: number): void {
    this.act('crank', i);
    if (Math.random() < 0.15) this.sound.say(`sq${this.sex}_haul`, {});
    this.sound.grind({ x: ROCK.rest.x, y: ROCK.rest.y + 1, z: ROCK.rest.z }, 0.6);
    this.g.shake(0.05);
  }

  /** How many gifts this player carries (the weapon system's grenade key throws one of these first). */
  get gifts(): number {
    return this.peachN + this.grapes + this.combs;
  }

  /** (What the weapon system asks before the grenade key throws a gift instead: every gift counts.) */
  get peaches(): number {
    return this.gifts;
  }

  /** The weapon system's grenade key, while you carry gifts: one thrown instead (a peach first). */
  throwPeach(o: THREE.Vector3, d: THREE.Vector3): boolean {
    const kind = this.peachN > 0 ? 'peach' : this.grapes > 0 ? 'grapes' : this.combs > 0 ? 'comb' : '';
    if (!kind) return false;
    if (kind === 'peach') this.peachN--;
    else if (kind === 'grapes') this.grapes--;
    else this.combs--;
    this.look.throwPeach(o, d, (x, y, z) => {
      if (kind !== 'grapes') this.look.ward(x, y, z, kind === 'comb');
      this.bosses.landed(kind, x, y, z);
      this.sound.peach({ x, y: y + 0.5, z });
      this.act(kind, 0, x, z);
    });
    return true;
  }

  private rideCage(down: boolean): void {
    this.act(down ? 'cage' : 'cageUp');
    const to = down ? CAGE.bottomOut : CAGE.topOut;
    this.rideT = 0;
    this.rideTo = { x: to.x, z: to.z, y: to.y, down };
    if (down) {
      this.sound.cage(3.2);
      this.sound.cue('descent', { fade: 0.4 });
      this.descentUntil = this.t + 12;
      this.sound.say(`sq${this.sex}_cage`, { story: true });
      this.squadLine('nat_cage');
    }
  }

  private climbOut(): void {
    this.rideT = 0;
    this.rideTo = { x: ADIT.out.x, z: ADIT.out.z, y: ADIT.out.y, down: false };
  }

  private teleport(x: number, z: number, y: number): void {
    const g = this.g;
    const p = g.player;
    p.teleport(x, z, p.yaw);
    p.y = y;
    g.flow.cancel();
    g.squad.regroupAt(x, z, p.yaw, g.level.floors.areaAt(x, y, z), y);
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
      g.banner('HOME', 'You turned round. She is only a young woman with a rice ball in her sleeve, and she is smiling.', 'good', 9);
      this.sound.cue('home', { fade: 1.5 });
      this.sound.say('mio_seen', { pos: this.mioPos(), chain: 'close', story: true });
      this.squadLine('dg_home', 3.5);
      window.setTimeout(() => this.sound.say('mio_home', { chain: 'far', story: true }), 7500);
      this.progress.home = true;
    } else {
      g.banner('THE SLOPE IS SEALED', 'The rock is home. The storm is breaking.', 'good', 8);
      this.sound.seal({ x: ROCK.seal.x, y: ROCK.seal.y + 1, z: ROCK.seal.z });
      this.sound.cue('sealed', { fade: 1.2 });
      g.shake(1);
      this.squadLine('nat_sealed', 2);
      this.squadLine('dg_lasttape', 4.5);
      window.setTimeout(() => this.sound.say('tape_last', { chain: 'tape', story: true }), 7000);
      window.setTimeout(() => this.pa('pa_light'), 12000);
      this.progress.sealed = true;
    }
    saveHirasaka(this.progress);
    this.sound.say(`sq${this.sex}_sealed`, { story: true });
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
    if (this.ending === 2 && this.endT > 9.5 && !this.remote) g.zombies.vanish((z) => z.variant === 'follower');
    if (this.endT >= (this.ending === 2 ? 12 : 14) && !this.remote && !g.session.ended) g.endRun('victory', this.ending === 2 ? 'Let her go home' : 'Sealed the slope');
  }

  /** The run is over (the results): everything drawn again. */
  /**
   * (final polish) The view ends where the fog has hidden the island (about 3% left: exp2 fog, 2 / density), never
   * nearer than 90 m (the umibōzu and the ferry are drawn without fog) nor further than the quality's own: the chunks
   * beyond are never drawn. The sky dome shrinks with it, as the renderer does for a quality's view.
   */
  private fitView(density: number): void {
    const cam = this.g.renderer.camera;
    const q = QUALITY[this.g.settings.quality].viewDistance;
    const far = Math.round(Math.min(q, Math.max(90, 2 / Math.max(1e-4, density))) / 5) * 5;
    if (cam.far === far) return;
    cam.far = far;
    cam.updateProjectionMatrix();
    this.g.renderer.sky.scale.setScalar(Math.min(1, (far * 0.9) / 300));
  }

  /** (final polish) The quality's own view back (another map, the title). */
  private resetView(): void {
    const cam = this.g.renderer.camera;
    const far = QUALITY[this.g.settings.quality].viewDistance;
    if (cam.far === far) return;
    cam.far = far;
    cam.updateProjectionMatrix();
    this.g.renderer.sky.scale.setScalar(Math.min(1, (far * 0.9) / 300));
  }

  end(): void {
    this.resetView(); // (final polish)
    this.sides.end(); // (sides)
    this.zones.showAll();
    this.setVeil('none');
    this.sound.storm(0);
    this.stormLevel = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // the HUD (objectives and markers; never a clock)
  // ---------------------------------------------------------------------------------------------

  decorateHud(st: HudState, md: MapDynamic): void {
    if (!this.active) return;
    const v = this.view;
    const p = this.g.player;
    const dist = (o: { x: number; z: number }): number => (inDeep(o.x) !== this.underground ? -1 : Math.hypot(o.x - p.x, o.z - p.z));
    const list: HudState['objectives'] = [];
    const obj = (id: string, title: string, detail: string, done: boolean, progress: number, at: { x: number; z: number } | null, tracked = false): void => {
      list.push({ id: `hs-${id}`, title, detail, state: done ? 'complete' : 'active', progress: done ? 1 : progress, tracked, distance: done || !at ? -1 : dist(at) });
    };
    const mk = (id: string, at: { x: number; z: number }, label: string, color = '#9fffc4', pulse = false, radius?: number): void => {
      if (inDeep(at.x) !== this.underground) return;
      md.markers.push({ id, kind: 'objective', x: at.x, z: at.z, label, color, visible: true, compass: true, pulse, ...(radius ? { radius } : {}) });
    };
    if (v.act === ACT.island) {
      const steam = HirasakaStory.isDone(v, 'steam');
      const air = HirasakaStory.isDone(v, 'air');
      const key = HirasakaStory.isDone(v, 'key');
      const coalLeft = JOBS.steam.coal.findIndex((_, i) => !(v.coal & (1 << i)));
      const steamAt = v.coal !== 7 ? (coalLeft === 2 ? JOBS.steam.coal[2]! : JOBS.steam.coal[coalLeft]!) : !v.boilerKey ? JOBS.steam.boilerKey : JOBS.steam.boiler;
      obj('steam', JOB_NAMES.steam, steam ? 'Done' : v.coal !== 7 ? `Coal sacks: ${HirasakaStory.count(v.coal)} of 3` : !v.boilerKey ? "The boiler key, in Block 30's caretaker's room" : HirasakaStory.open(v, 'bathDoor') ? 'Build the burner at the boiler' : "The boiler room's door is boarded (the axe)", steam, HirasakaStory.count(v.coal) / 4 + (v.boilerKey ? 0.25 : 0), steamAt);
      obj('air', JOB_NAMES.air, air ? 'Done' : HirasakaStory.open(v, 'shutter') ? 'The starter, inside the fan house' : 'The fan house shutter has rusted shut (the pick, from the lamp room)', air, HirasakaStory.open(v, 'shutter') ? 0.5 : 0, HirasakaStory.open(v, 'shutter') ? JOBS.air.fan : JOBS.air.shutter);
      obj('key', JOB_NAMES.key, key ? 'Done' : "Block 65's top floor: up the school, over the footbridge", key, 0, key ? null : this.inHeights() ? JOBS.key.key : HEIGHTS.stairFoot);
      if (v.umi === 1) obj('umi', 'SINK IT', v.built & (1 << BUILT.mori) ? this.bosses.umiDetail(v) : `Build the Mori at the seawall winch (parts ${HirasakaStory.count(v.moriParts)} of 2)`, false, v.umiHits / HIRASAKA_STORY.umiHits, UMIBOZU.winch, true);
      else if (HirasakaStory.ready(v)) obj('cage', 'RIDE THE CAGE DOWN', 'The headframe at the pithead', false, -1, CAGE.top, true);
      else {
        const open = list.filter((o) => o.state !== 'complete' && o.distance >= 0);
        if (open.length) open.reduce((a, b) => (a.distance <= b.distance ? a : b)).tracked = true;
      }
      if (!steam) mk('hs-steam', steamAt, 'STEAM');
      if (!air) mk('hs-air', HirasakaStory.open(v, 'shutter') ? JOBS.air.fan : JOBS.air.shutter, 'AIR');
      if (!key) mk('hs-key', this.inHeights() ? JOBS.key.key : HEIGHTS.stairFoot, 'THE KEY');
      if (v.umi === 1) mk('hs-winch', UMIBOZU.winch, 'THE WINCH', '#ffe08a', true);
      if (HirasakaStory.ready(v)) mk('hs-cage', CAGE.top, 'THE CAGE', '#ffe08a', true);
    } else if (v.act === ACT.deep) {
      if (!this.underground) {
        obj('down', 'RIDE THE CAGE DOWN', 'The others are below', false, -1, CAGE.top, true);
        mk('hs-cage', CAGE.top, 'THE CAGE', '#ffe08a', true);
      } else if (v.ladles !== LADLE.given) {
        const what = v.ladles === LADLE.none ? "Bring the bath ladles from Block 31's bath" : v.ladles === LADLE.carried ? 'Knock their bottoms out at the lamp room bench' : 'Hand them over';
        obj('funa', 'THE FLOODED GALLERY', what, false, v.ladles / 3, v.ladles === LADLE.carried ? DEEP_SPOTS.bench : DEEP_SPOTS.funa, true);
        mk('hs-funa', DEEP_SPOTS.funa, 'FUNAYŪREI');
      } else if (!HirasakaStory.open(v, 'drift')) {
        obj('drift', 'THE DRIFT TO THE VILLAGE', 'A seam has come down across it (the pick)', false, -1, OBSTACLES[3]!.at, true);
        mk('hs-drift', OBSTACLES[3]!.at, 'THE DRIFT');
      } else if (!v.hairpin) {
        const roots = HirasakaStory.open(v, 'roots');
        obj('root', 'THE ROOT HALL', roots ? 'Take what is in the roots' : 'Through the village and down the stone passage; the roots need a blade', false, -1, DEEP_SPOTS.hairpin, true);
        mk('hs-root', DEEP_SPOTS.hairpin, 'THE ROOTS', '#ff8a9a');
      } else {
        const b = this.g.zombies.boss;
        obj('ku', 'PUT DOWN KUROGANE', b?.alive ? this.bosses.kuDetail(v) : 'He is down', !b?.alive, HirasakaStory.count(v.thunders) / 8, b?.alive ? (this.bosses.kuAt(v) ?? b) : null, true);
        if (b?.alive) mk('hs-ku', b, 'KUROGANE', '#ff5a4d', true);
        this.bosses.markers(v, md, this.underground);
      }
    } else if (v.act === ACT.climb) {
      const lead = Math.max(v.lead, this.underground ? -1 : 1);
      const next = CLIMB_MARKS[Math.min(CLIMB_MARKS.length - 1, lead + 1)]!;
      if (this.underground) {
        obj('slope', 'CLIMB OUT', 'Up the kofun passage and the adit stair to the old adit', false, -1, ADIT.door, true);
        mk('hs-adit', ADIT.door, 'THE ADIT', '#ffe08a', true);
      } else if (v.lead < CLIMB_MARKS.length - 1) {
        obj('climb', 'UP TO THE ROCK', `Next: ${next.name.replace(/^THE /, '').toLowerCase()}`, false, Math.max(0, v.lead) / (CLIMB_MARKS.length - 1), next.at, true);
        mk('hs-next', next.at, next.name.replace(/^THE /, ''), '#ffe08a', true);
      } else {
        obj('rock', 'HAUL THE CHIBIKI-IWA', v.held ? 'She is leaning on it: a peach, or shots' : `The three chain winches: ${Math.round(HirasakaStory.rock(v) * 100)}%`, false, HirasakaStory.rock(v), ROCK.rest, true);
        ROCK.winches.forEach((w, i) => mk(`hs-winch-${i}`, w, 'WINCH', '#ffe08a', true));
        if (v.cranks > 0) obj('horde', `THE DEAD: ${v.horde.toLocaleString('en-US')}`, 'Coming up the Hell Stairs', false, -1, null);
      }
      obj('look', 'DO NOT LOOK BACK', v.looks ? `You have looked back ${v.looks} time${v.looks > 1 ? 's' : ''}` : 'Whatever you hear behind you', false, -1, null);
    }
    if (this.gifts > 0) obj('gifts', 'GIFTS FOR THE CLIMB', `Peaches ${this.peachN}, grapes ${this.grapes}, comb ${this.combs} - the grenade key throws one`, false, -1, null);
    if (this.marked) obj('mark', 'YOUR HAND IS MARKED', 'The hags follow it. The pithead bath washes it off.', false, -1, BATH);
    if (v.act !== ACT.won) {
      const tapes = HirasakaStory.count(v.tapes);
      const photos = HirasakaStory.count(v.photos);
      if (tapes > 0 || photos > 0) obj('found', "GENZŌ'S TAPES AND PHOTOGRAPHS", `${tapes} of 5 tapes, ${photos} of 5 photographs - in the journal`, tapes + photos >= 10, (tapes + photos) / 10, null);
    }
    if (!v.call && HirasakaStory.count(v.photos) >= PHOTOS.length) mk('hs-phone', DEEP_SPOTS.phone, 'TELEPHONE', '#ffe08a', true);
    if (v.act !== ACT.won) this.sides.objectives(list, this.underground); // (sides) one quiet line
    st.objectives = [...list, ...st.objectives.filter((o) => o.id !== 'defense' && o.id !== 'hunt' && o.id !== 'extract')];
    void PLACE;
  }

  private inHeights(): boolean {
    return this.g.player.y > HEIGHTS.y - 1;
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

  private flashVeil(): void {
    this.setVeil('look');
    window.setTimeout(() => {
      if (this.veilKind === 'look') this.setVeil('none');
    }, 700);
  }

  /** The run's first seconds: black, the storm, the ferry gone, the cage bell from below, the island fading up. */
  private opening(): void {
    const f = this.overlayEl();
    f.style.transition = 'none';
    f.style.background = '#000';
    f.style.opacity = '1';
    this.sound.cue('loading', { loop: true, fade: 0.5 });
    window.setTimeout(() => {
      f.style.transition = 'opacity 3s';
      f.style.opacity = '0';
    }, 1600);
    window.setTimeout(() => (f.style.transition = ''), 5000);
    this.squadLine('dg_ferry', 2.5);
    this.squadLine('nat_nobody', 6);
    window.setTimeout(() => this.sound.signal({ x: CAGE.top.x, y: 4, z: CAGE.top.z }, 3), 10000);
    this.squadLine('dg_bell', 12);
    this.squadLine('nat_brief', 19);
    this.squadLine('dg_keyroom', 26);
    this.squadLine('nat_bridge', 32);
    this.g.banner('HIRASAKA', 'Autumn 2026, a typhoon night. The ferry is gone, and at two in the morning the cage bell rang from 636 metres down.', 'info', 7);
  }

  /** A line said: its caption on the top line (the speaker's name; the PA in Japanese with the English after). */
  private caption(id: string): void {
    const l = LINE[id];
    if (!l || l.who === 'HAG') return;
    if (l.who === 'PA' && id.endsWith('_en')) return;
    const who = l.who === 'SQUAD-F' || l.who === 'SQUAD-M' ? 'YOU' : l.who === 'GENZO' ? 'GENZŌ (TAPE)' : l.who;
    const text = l.ja ? `${l.ja}  ${l.text}` : l.text;
    this.g.radio(who, text, Math.min(14, 2.5 + text.length / 18));
  }

  private mioPos(): { x: number; y: number; z: number } | undefined {
    const m = this.g.zombies.zombies.find((z) => z.variant === 'follower' && z.alive);
    return m ? { x: m.x, y: m.y + 1.5, z: m.z } : undefined;
  }

  private bossPos(): { x: number; y: number; z: number } {
    const b = this.g.zombies.boss;
    return b ? { x: b.x, y: b.y + 2, z: b.z } : { x: DEEP_SPOTS.kurogane.x, y: 2, z: DEEP_SPOTS.kurogane.z };
  }

  /** The squad wears helmets with lamps (a yellow shell, the lamp lit). */
  private helmet(): void {
    for (const f of this.g.squad.figures()) {
      if (this.helmeted.has(f)) continue;
      this.helmeted.add(f);
      const hat = new THREE.Group();
      // (final polish) the shell and its brim one mesh: one draw call fewer a squadmate
      const shellGeo = mergeGeometries([new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(), new THREE.CylinderGeometry(0.145, 0.145, 0.012, 16).toNonIndexed()], false)!;
      const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.45 }));
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.04, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xfff0c0, emissiveIntensity: 2.5 }));
      lamp.position.set(0, 0.07, -0.118);
      hat.add(shell, lamp);
      hat.position.set(0, 0, 0.01);
      f.onHead(hat);
    }
  }

  dispose(): void {
    this.end();
    this.overlay?.remove();
    this.veil?.remove();
    this.look.dispose();
    this.bosses.dispose();
    this.arms.dispose(); // (arms)
    this.sides.dispose(); // (sides)
    this.sound.stopAll(0);
  }
}

/** The lowest bit set in `b` and not in `a`, or -1. */
function bitAdded(a: number, b: number): number {
  for (let i = 0; i < 16; i++) if (b & (1 << i) && !(a & (1 << i))) return i;
  return -1;
}
