/**
 * HIRASAKA's story as pure state (no THREE): the solo game runs one; the co-op simulation runs the shared one and sends
 * it on (`encodeStory`); every screen draws what it says (`runtime.ts`). Nothing here runs on a clock: no deadline, no
 * hold, no countdown. Every step is something a player does; the only way to lose is to die.
 *
 *   The night. Autumn 2026, a typhoon. Natsuki Arai (structural engineer), Daigo (Genzō's grandson, who ferried them
 *   out) and the player came to record the blocks before they fall. The typhoon tore the ferry off the pier; at 2 a.m.
 *   the cage bell rang from 636 m down, on a shaft dead since 1974, and the dead came up the Stairs of Life. Nobody can
 *   leave before the storm passes, so they go down and close it.
 *
 *   ACT I   THE ISLAND   The winding engine needs three things, any order, each a different kind of job:
 *                        STEAM  fire the boiler under Block 31's bath: three coal sacks (one buried in the slag: the
 *                               shovel), the boiler key (Block 30), through the boarded door (the axe), build the burner.
 *                        AIR    start the fan at the head of the Stairs of Life: its rusted shutter breaks only to the
 *                               pick (the pithead lamp room), then its starter.
 *                        KEY    Genzō's cage key in his room on Block 65's top floor: up the school, over the footbridge.
 *                        The engine's whistle wakes the UMIBŌZU past the seawall: build the Mori at the seawall winch
 *                        (its two parts), three harpoon hits sink it. Then the cage runs.
 *   ACT II  THE DEEP     Ride down. The landing's lamp room (the tag board). The funayūrei across the flooded gallery beg
 *                        for ladles: bring the bath-house ladles from Block 31, knock their bottoms out at the lamp room's
 *                        bench, hand them over. The coal face; the drift to the village is a fallen seam (the pick). The
 *                        Old Village: the hearth heals and marks your hand (the hags follow the mark on the climb until
 *                        it is washed off at the pithead bath). The kofun passage down to the Root Hall; the roots over
 *                        Mio's hairpin are cut only by the shrine tachi (the summit). Taking it wakes KUROGANE.
 *   ACT III THE CLIMB    Kurogane dead: the cage cable snaps and the tree lives (its peaches). Up the kofun passage, the
 *                        adit stair, out of the old adit, up the Stairs of Life, across the landing, up the Hell Stairs.
 *                        Mio follows; do not look back (looks bring her on). The sea rises BY PLACE: when every living
 *                        player has passed a landmark (`CLIMB_MARKS`) the water climbs to the one before. At the head of
 *                        the Hell Stairs, haul the Chibiki-iwa across with the three chain winches: every turn of a winch
 *                        moves it (more hands, faster); Mio leaning on it holds it back (a peach, or shots).
 *   ENDING 1 SEALED      The rock home: Genzō's last tape answers with Izanagi's reply. Dawn, the lighthouse, the ferry.
 *   ENDING 2 HOME        Every photograph, the gallery telephone, and the rice ball still wrapped in Mio's sleeve (she
 *                        never ate): at the rock, turn round and look at her. She walks out with you.
 *
 * Hook points for the later waves (each an `act` the runtime / simulation passes through, or a method):
 *   arms     `act('tool', t)` a tool taken; `act('open', i)` an obstacle opened (`OBSTACLES` i; the placeholder checks
 *            the tool's bit); `act('built', i)` a built weapon (0 Mori, 1 Happa, 2 Sakuganki); `act('kushi', n)` the
 *            comb's stage; `act('box', i)` the offering box moved to shrine i; `act('call', stop)` the cage called.
 *   bosses   `act('umiHit')` a harpoon hit on the umibōzu; `act('kuPhase', n)` Kurogane's phase; `act('thunder', i)` a
 *            thunder node broken; `overseerDown()` (the hunt's end); `fallen(n)` the finale's count.
 *   sides    `act('side', i)` a side story finished (`SIDES` i; 9 = the rice ball, which opens ending 2).
 *            (sides) `act('sidep', i)` a place of a side story (`sides.ts` `sideIndex`), kept in `sides`.
 */
import { KMACHINES, Kuro } from './bossKurogane';
import { Umi } from './bossUmi';
import { ARMS_PARTS, BENCH, recipeMask } from './armsPlaces'; // (arms: the built guns' parts and benches)
import { sideCan, sideDone, sideEmpty, sideFinished, sideFrom, sideNext, sideOf, sidePlace, SIDE_REACH } from './sides'; // (sides)
import { ADIT, BATH, CAGE, CLIMB_MARKS, COMB, DEEP_SPOTS, JOBS, LADLES, OBSTACLE, OBSTACLES, PHOTOS, ROCK, SEA_Y, SIDE, SIDES, TAPES, TOOL_IDS, TOOLS, UMIBOZU, type Spot } from './places';

export const JOB_IDS = ['steam', 'air', 'key'] as const;
export type JobId = (typeof JOB_IDS)[number];
export const JOB: Record<JobId, number> = { steam: 0, air: 1, key: 2 };
export const JOB_NAMES: Record<JobId, string> = {
  steam: 'FIRE THE BOILER',
  air: 'START THE FAN',
  key: "TAKE GENZŌ'S CAGE KEY",
};

export const ACT = { island: 0, deep: 1, climb: 2, won: 3 } as const;
/** The built weapons' bits (`built`). */
export const BUILT = { mori: 0, happa: 1, sakuganki: 2 } as const;
/** The ladles: none, carried, bottomless, handed to the funayūrei. */
export const LADLE = { none: 0, carried: 1, bottomless: 2, given: 3 } as const;

export const HIRASAKA_STORY = {
  /** Turns of the chain winches to haul the Chibiki-iwa home. */
  cranks: 48,
  /** While Mio leans on the rock, a turn moves it this much of a turn. */
  heldRate: 0.25,
  /** A player's turns count at most this often (the winch's ratchet). */
  crankEvery: 0.35,
  /** Harpoon hits that sink the umibōzu. */
  umiHits: 3,
  /** The finale's count: the dead that come for the rock. */
  horde: 1500,
  /** Peaches, grapes and comb teeth each player carries up. */
  peaches: 3,
  grapes: 2,
  combs: 1,
  /** A look back counts at most this often per player. */
  lookEvery: 1.6,
};

export interface StoryView {
  act: number;
  /** Bits of `JOB`: done. */
  done: number;
  /** STEAM: the coal sacks found (3 bits), the boiler key, the burner built. */
  coal: number;
  boilerKey: boolean;
  /** Bits of `TOOL_IDS`: taken by anyone (the placeholder: `arms` gives each player their own). */
  tools: number;
  /** Bits of `OBSTACLES`: opened. */
  obstacles: number;
  /** `LADLE`. */
  ladles: number;
  /** The umibōzu: 0 asleep, 1 risen, 2 sunk; harpoon hits; the Mori's parts (2 bits); the built weapons (`BUILT`). */
  umi: number;
  umiHits: number;
  moriParts: number;
  built: number;
  /** The cage has gone down (once anyone rode it); where the cage is now (0 the pithead, 1 the landing). */
  cageDown: boolean;
  cageAt: number;
  /** Seats whose hand carries the hearth's mark (bits). */
  marked: number;
  grapes: boolean;
  /** The comb's stage (`arms`: 0 none, 1 found, 2 lit, 3 Ōkamuzumi). */
  kushi: number;
  hairpin: boolean;
  /** Kurogane: his phase (1..3) and the thunder nodes broken (8 bits). */
  kuPhase: number;
  thunders: number;
  /** Kurogane is down: the cable snapped, the tree lives, the climb is on. */
  bossDown: boolean;
  peaches: boolean;
  /** The climb: the landmark every living player has passed (-1 none), and the furthest anyone has. */
  mark: number;
  lead: number;
  /** The Chibiki-iwa: turns so far (progress = cranks / HIRASAKA_STORY.cranks), Mio leaning on it, the count left. */
  cranks: number;
  held: boolean;
  horde: number;
  /** Bits: tapes, photographs, the side stories; the hidden call heard. */
  tapes: number;
  photos: number;
  side: number;
  call: boolean;
  looks: number;
  /** The offering box's shrine (`SHRINES` i). */
  boxAt: number;
  /** How it ended: 1 sealed, 2 home. */
  ending: number;
  /**
   * (hs-bosses) The two fights as every screen draws them, set by whoever runs the infected (`bossWords`): the umibōzu
   * (`bossUmi.ts` `Umi`: `ua` the giant, `ub` its waves) and Kurogane's hall (`bossKurogane.ts` `Kuro`: `kw`, `kx`).
   */
  ua: number;
  ub: number;
  kw: number;
  kx: number;
  /** (arms) Bits of `armsPlaces.ts` ARMS_PARTS: the built guns' parts the squad has found (the Mori's are `moriParts`). */
  parts: number;
  /** (sides) One number per side story, `stage * 16 + bits` (`sides.ts`); a finished one also sets its bit in `side`. */
  sides: number[];
  /** (Kept for the simulation's old defence check: there is no hold on this map. Always false / 0.) */
  generating: boolean;
  charge: number;
}

export type StoryEvent =
  | { kind: 'done'; job: JobId; n: number }
  | { kind: 'coal'; i: number; n: number }
  | { kind: 'boilerKey' }
  | { kind: 'tool'; tool: number }
  | { kind: 'open'; i: number }
  | { kind: 'ladles'; stage: number }
  | { kind: 'part'; i: number }
  | { kind: 'apart'; i: number }
  | { kind: 'built'; i: number }
  | { kind: 'jobs' }
  | { kind: 'umiHit'; n: number }
  | { kind: 'ready' }
  | { kind: 'cage' }
  | { kind: 'cageAt'; at: number }
  | { kind: 'funa' }
  | { kind: 'eat'; seat: number }
  | { kind: 'wash'; seat: number }
  | { kind: 'grapes'; seat: number }
  | { kind: 'comb'; seat: number }
  | { kind: 'kushi'; n: number }
  | { kind: 'hairpin' }
  | { kind: 'kuPhase'; n: number }
  | { kind: 'thunder'; i: number }
  | { kind: 'machine'; m: number }
  | { kind: 'cable' }
  | { kind: 'peaches'; seat: number }
  | { kind: 'mark'; i: number }
  | { kind: 'sea'; i: number }
  | { kind: 'hauling' }
  | { kind: 'crank'; seat: number; n: number }
  | { kind: 'sealed' }
  | { kind: 'home' }
  | { kind: 'tape'; i: number }
  | { kind: 'photo'; i: number; all: boolean }
  | { kind: 'call' }
  | { kind: 'side'; i: number }
  | { kind: 'box'; i: number }
  | { kind: 'look'; seat: number; n: number };

/** Someone standing somewhere (the players, for the marks and the reaches). */
export interface Stand {
  x: number;
  y: number;
  z: number;
  up: boolean;
}

/** Within `r` (plus a little) of a spot, on its floor (and on the same side of the water: island or deep). */
export const near = (p: { x: number; y?: number; z: number }, t: { x: number; y?: number; z: number }, r: number): boolean =>
  Math.hypot(p.x - t.x, p.z - t.z) <= r + 0.6 && Math.abs((p.y ?? t.y ?? 0) - (t.y ?? 0)) < 2.4;

const bit = (bits: number, i: number): boolean => (bits & (1 << i)) !== 0;

export class HirasakaStory {
  view: StoryView = HirasakaStory.empty();
  private events: StoryEvent[] = [];
  private lookAt = new Map<number, number>();
  private crankAt = new Map<number, number>();
  private seatMark = new Map<number, number>();
  private t = 0;

  static empty(): StoryView {
    return {
      act: ACT.island,
      done: 0,
      coal: 0,
      boilerKey: false,
      tools: 0,
      obstacles: 0,
      ladles: 0,
      umi: 0,
      umiHits: 0,
      moriParts: 0,
      built: 0,
      cageDown: false,
      cageAt: 0,
      marked: 0,
      grapes: false,
      kushi: 0,
      hairpin: false,
      kuPhase: 0,
      thunders: 0,
      bossDown: false,
      peaches: false,
      mark: -1,
      lead: -1,
      cranks: 0,
      held: false,
      horde: HIRASAKA_STORY.horde,
      tapes: 0,
      photos: 0,
      side: 0,
      call: false,
      looks: 0,
      boxAt: 0,
      ending: 0,
      ua: 0,
      ub: 0,
      kw: 0,
      kx: 0,
      parts: 0, // (arms)
      sides: sideEmpty(), // (sides)
      generating: false,
      charge: 0,
    };
  }

  reset(_rand?: () => number): void {
    this.view = HirasakaStory.empty();
    this.events.length = 0;
    this.lookAt.clear();
    this.crankAt.clear();
    this.seatMark.clear();
    this.t = 0;
  }

  drain(): StoryEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---- reading the state ----

  static count(bits: number): number {
    let c = 0;
    for (let i = 0; i < 16; i++) if (bits & (1 << i)) c++;
    return c;
  }
  static jobsDone(v: StoryView): number {
    return HirasakaStory.count(v.done & 7);
  }
  static isDone(v: StoryView, job: JobId): boolean {
    return bit(v.done, JOB[job]);
  }
  /** All three jobs done (the umibōzu rises). */
  static jobsAll(v: StoryView): boolean {
    return HirasakaStory.jobsDone(v) >= JOB_IDS.length;
  }
  /** The cage runs: every job done and the umibōzu sunk. */
  static ready(v: StoryView): boolean {
    return HirasakaStory.jobsAll(v) && v.umi === 2;
  }
  static open(v: StoryView, id: string): boolean {
    return bit(v.obstacles, OBSTACLE[id] ?? 31);
  }
  static hasTool(v: StoryView, t: number): boolean {
    return bit(v.tools, t);
  }
  /** The Chibiki-iwa's progress 0..1. */
  static rock(v: StoryView): number {
    return Math.min(1, v.cranks / HIRASAKA_STORY.cranks);
  }
  /** Every photograph found, the call heard and the rice ball found: the rock can wait (the other ending). */
  static canGoHome(v: StoryView): boolean {
    return v.call && HirasakaStory.count(v.photos) >= PHOTOS.length && bit(v.side, SIDE.riceball!);
  }
  /** The water's height (on the island, or in the deep) now. */
  static seaLevel(v: StoryView, deep = false): number {
    if (v.act !== ACT.climb && v.act !== ACT.won) return deep ? -9 : SEA_Y;
    if (deep) return v.mark >= 1 ? CLIMB_MARKS[1]!.sea : v.mark >= 0 ? CLIMB_MARKS[0]!.sea : -9;
    return v.mark >= 2 ? CLIMB_MARKS[v.mark]!.sea : SEA_Y;
  }

  /**
   * Every frame on the host. `stand`: the players (by seat); `mioAtRock`: she has reached the Chibiki-iwa and leans on
   * it. Only the climb's landmarks are worked out here (by where the players are, never by time).
   */
  tick(dt: number, stand: readonly Stand[], mioAtRock = false): void {
    const v = this.view;
    this.t += dt;
    if (v.act !== ACT.climb) {
      v.held = false;
      return;
    }
    stand.forEach((p, seat) => {
      if (!p.up) return;
      let best = this.seatMark.get(seat) ?? -1;
      CLIMB_MARKS.forEach((m, i) => {
        if (i > best && near(p, m.at, m.r)) best = i;
      });
      this.seatMark.set(seat, best);
    });
    const up = stand.map((p, seat) => (p.up ? (this.seatMark.get(seat) ?? -1) : null)).filter((m): m is number => m !== null);
    if (up.length) {
      const lead = Math.max(...up);
      const hind = Math.min(...up);
      while (v.lead < lead) {
        v.lead++;
        this.events.push({ kind: 'mark', i: v.lead });
      }
      while (v.mark < hind) {
        v.mark++;
        this.events.push({ kind: 'sea', i: v.mark });
      }
    }
    v.held = mioAtRock;
  }

  private finish(job: JobId): void {
    const v = this.view;
    if (HirasakaStory.isDone(v, job)) return;
    v.done |= 1 << JOB[job];
    const n = HirasakaStory.jobsDone(v);
    this.events.push({ kind: 'done', job, n });
    if (n >= JOB_IDS.length && v.umi === 0) {
      v.umi = 1;
      this.events.push({ kind: 'jobs' });
    }
  }

  private win(ending: number): void {
    const v = this.view;
    if (v.act === ACT.won) return;
    v.act = ACT.won;
    v.ending = ending;
    this.events.push({ kind: ending === 2 ? 'home' : 'sealed' });
  }

  private hit(): void {
    const v = this.view;
    if (v.umi !== 1) return;
    v.umiHits++;
    this.events.push({ kind: 'umiHit', n: v.umiHits });
    if (v.umiHits >= HIRASAKA_STORY.umiHits) {
      v.umi = 2;
      this.events.push({ kind: 'ready' });
    }
  }

  private opened(i: number): void {
    const v = this.view;
    if (bit(v.obstacles, i)) return;
    v.obstacles |= 1 << i;
    this.events.push({ kind: 'open', i });
    // the slag heap gives up its coal sack as it is dug
    if (OBSTACLES[i]?.id === 'slag') this.coalFound(2);
  }

  private coalFound(i: number): void {
    const v = this.view;
    if (bit(v.coal, i)) return;
    v.coal |= 1 << i;
    this.events.push({ kind: 'coal', i, n: HirasakaStory.count(v.coal) });
  }

  /**
   * What a player does (the host checks they are where they say). `a`: the action, `i` its index, `at`: where the
   * player stands, `seat`: who. Returns whether it did anything. Hooks (no reach check): tool, open with `force`,
   * built, kushi, box, umiHit, kuPhase, thunder, side with `force`. (hs-bosses: `kuMachine` i works Kurogane's
   * machine i, `bossKurogane.ts` KMACHINES.)
   */
  act(a: string, i: number, at: Spot, seat = 0, force = false): boolean {
    const v = this.view;
    if (v.act === ACT.won) return false;
    const at2 = (s: { x: number; y?: number; z: number }, r = 2.2): boolean => force || near(at, s, r);
    switch (a) {
      // ---- act I ----
      case 'coal': {
        const s = JOBS.steam.coal[i];
        if (!s || i === 2 || bit(v.coal, i) || !at2(s)) return false;
        this.coalFound(i);
        return true;
      }
      case 'boilerKey':
        if (v.boilerKey || !at2(JOBS.steam.boilerKey)) return false;
        v.boilerKey = true;
        this.events.push({ kind: 'boilerKey' });
        return true;
      case 'burner':
        if (HirasakaStory.isDone(v, 'steam') || v.coal !== 7 || !v.boilerKey || !at2(JOBS.steam.boiler, 2.6)) return false;
        this.finish('steam');
        return true;
      case 'fan':
        if (HirasakaStory.isDone(v, 'air') || !HirasakaStory.open(v, 'shutter') || !at2(JOBS.air.fan)) return false;
        this.finish('air');
        return true;
      case 'key':
        if (HirasakaStory.isDone(v, 'key') || !at2(JOBS.key.key)) return false;
        this.finish('key');
        return true;
      case 'tool': {
        const id = TOOL_IDS[i];
        if (!id || bit(v.tools, i) || !at2(TOOLS[id])) return false;
        v.tools |= 1 << i;
        this.events.push({ kind: 'tool', tool: i });
        return true;
      }
      case 'open': {
        const o = OBSTACLES[i];
        if (!o || bit(v.obstacles, i)) return false;
        if (!force && (!bit(v.tools, TOOL_IDS.indexOf(o.tool)) || !near(at, o.at, 2.6))) return false;
        this.opened(i);
        return true;
      }
      case 'ladles':
        if (v.ladles !== LADLE.none || !at2(LADLES)) return false;
        v.ladles = LADLE.carried;
        this.events.push({ kind: 'ladles', stage: v.ladles });
        return true;
      case 'knock':
        if (v.ladles !== LADLE.carried || !at2(DEEP_SPOTS.bench)) return false;
        v.ladles = LADLE.bottomless;
        this.events.push({ kind: 'ladles', stage: v.ladles });
        return true;
      case 'funa':
        if (v.ladles !== LADLE.bottomless || !at2(DEEP_SPOTS.funa, 3)) return false;
        v.ladles = LADLE.given;
        this.events.push({ kind: 'ladles', stage: v.ladles });
        this.events.push({ kind: 'funa' });
        return true;
      case 'part': {
        const s = UMIBOZU.parts[i];
        if (!s || bit(v.moriParts, i) || !at2(s)) return false;
        v.moriParts |= 1 << i;
        this.events.push({ kind: 'part', i });
        return true;
      }
      // ---- (arms) a part of the Happa or the Sakuganki or the comb's oil and wick, taken where it lies (shared) ----
      case 'apart': {
        const p = ARMS_PARTS[i];
        if (!p || bit(v.parts, i) || !at2(p.at, 2.4)) return false;
        v.parts |= 1 << i;
        this.events.push({ kind: 'apart', i });
        return true;
      }
      case 'built': {
        // (arms) a weapon built at its bench with all its parts: the Mori at the seawall winch (its two parts), the
        // Happa before the powder magazine, the Sakuganki at the coal face (theirs in `parts`)
        if (bit(v.built, i)) return false;
        const id = i === BUILT.mori ? 'mori' : i === BUILT.happa ? 'happa' : i === BUILT.sakuganki ? 'sakuganki' : null;
        if (!id) return false;
        const has = id === 'mori' ? v.moriParts === 3 : (v.parts & recipeMask(id)) === recipeMask(id);
        if (!force && (!has || !near(at, BENCH[id], 2.6))) return false;
        v.built |= 1 << i;
        this.events.push({ kind: 'built', i });
        return true;
      }
      case 'harpoon':
        // the placeholder: fire the Mori from the winch while the umibōzu is up over the seawall (the Mori itself sends umiHit)
        if (v.umi !== 1 || !bit(v.built, BUILT.mori) || !near(at, UMIBOZU.winch, 2.6) || (!force && !Umi.exposed(v.ua))) return false;
        this.hit();
        return true;
      case 'umiHit':
        if (v.umi !== 1) return false;
        this.hit();
        return true;
      // ---- the cage ----
      case 'cage':
        // ride down from the pithead (the first ride turns the act)
        if (!HirasakaStory.ready(v) || v.bossDown || !near(at, CAGE.top, 3)) return false;
        v.cageAt = 1;
        this.events.push({ kind: 'cageAt', at: 1 });
        if (!v.cageDown) {
          v.cageDown = true;
          v.act = ACT.deep;
          this.events.push({ kind: 'cage' });
        }
        return true;
      case 'cageUp':
        if (!v.cageDown || v.bossDown || !near(at, CAGE.bottom, 3)) return false;
        v.cageAt = 0;
        this.events.push({ kind: 'cageAt', at: 0 });
        return true;
      case 'call': {
        // call the cage (and the pit workshop in it) to this stop
        const stop = i === 1 ? CAGE.bottom : CAGE.top;
        if (!HirasakaStory.ready(v) || v.bossDown || v.cageAt === i || (!force && !near(at, stop, 3))) return false;
        v.cageAt = i === 1 ? 1 : 0;
        this.events.push({ kind: 'cageAt', at: v.cageAt });
        return true;
      }
      // ---- act II ----
      case 'eat':
        if (bit(v.marked, seat) || !at2(DEEP_SPOTS.hearth, 2.4)) return false;
        v.marked |= 1 << seat;
        this.events.push({ kind: 'eat', seat });
        return true;
      case 'wash':
        if (!bit(v.marked, seat) || !at2(BATH, 2.6)) return false;
        v.marked &= ~(1 << seat);
        this.events.push({ kind: 'wash', seat });
        return true;
      case 'grapes':
        if (!v.cageDown || !at2(DEEP_SPOTS.grapes)) return false;
        v.grapes = true;
        this.events.push({ kind: 'grapes', seat });
        return true;
      case 'comb':
        if (!at2(COMB)) return false;
        if (v.kushi < 1) v.kushi = 1;
        this.events.push({ kind: 'comb', seat });
        return true;
      case 'kushi':
        if (i <= v.kushi) return false;
        v.kushi = i;
        this.events.push({ kind: 'kushi', n: i });
        return true;
      case 'hairpin':
        if (v.hairpin || !v.cageDown || !HirasakaStory.open(v, 'roots') || !at2(DEEP_SPOTS.hairpin, 2.6)) return false;
        v.hairpin = true;
        this.events.push({ kind: 'hairpin' });
        return true;
      case 'kuPhase':
        if (!v.hairpin || v.bossDown || i <= v.kuPhase) return false;
        v.kuPhase = i;
        this.events.push({ kind: 'kuPhase', n: i });
        return true;
      case 'thunder':
        if (!v.hairpin || v.bossDown || i < 0 || i > 7 || bit(v.thunders, i)) return false;
        v.thunders |= 1 << i;
        this.events.push({ kind: 'thunder', i });
        return true;
      case 'kuMachine': {
        // (hs-bosses) the Root Hall turned on Kurogane: `i` the machine of his phase (`KMACHINES`), ready, worked from where it stands
        const k = KMACHINES[i];
        if (!k || !v.hairpin || v.bossDown || !Kuro.ready(v.kw, i) || !at2(k.at, 2.6)) return false;
        this.events.push({ kind: 'machine', m: i });
        return true;
      }
      // ---- act III ----
      case 'peaches':
        if (!v.bossDown || !at2(DEEP_SPOTS.peaches, 3)) return false;
        v.peaches = true;
        this.events.push({ kind: 'peaches', seat });
        return true;
      case 'crank': {
        const w = ROCK.winches[i];
        if (v.act !== ACT.climb || !w || !near(at, w, 2.4)) return false;
        const last = this.crankAt.get(seat) ?? -99;
        if (this.t - last < HIRASAKA_STORY.crankEvery) return false;
        this.crankAt.set(seat, this.t);
        if (v.cranks === 0) this.events.push({ kind: 'hauling' });
        v.cranks = Math.min(HIRASAKA_STORY.cranks, v.cranks + (v.held ? HIRASAKA_STORY.heldRate : 1));
        this.events.push({ kind: 'crank', seat, n: v.cranks });
        if (v.cranks >= HIRASAKA_STORY.cranks) this.win(1);
        return true;
      }
      case 'home':
        // at the rock, with everything that proves she never ate: turn round and let her see you
        if (v.act !== ACT.climb || !HirasakaStory.canGoHome(v) || !near(at, ROCK.turn, 4)) return false;
        this.win(2);
        return true;
      case 'look':
        return this.look(seat);
      // ---- what is found ----
      case 'tape': {
        const t = TAPES[i];
        if (!t || bit(v.tapes, i) || !at2(t)) return false;
        v.tapes |= 1 << i;
        this.events.push({ kind: 'tape', i });
        return true;
      }
      case 'photo': {
        const p = PHOTOS[i];
        if (!p || bit(v.photos, i) || !at2(p)) return false;
        v.photos |= 1 << i;
        this.events.push({ kind: 'photo', i, all: HirasakaStory.count(v.photos) >= PHOTOS.length });
        return true;
      }
      case 'phone':
        if (v.call || HirasakaStory.count(v.photos) < PHOTOS.length || !at2(DEEP_SPOTS.phone)) return false;
        v.call = true;
        this.events.push({ kind: 'call' });
        return true;
      case 'side': {
        const s = SIDES[i];
        if (!s || bit(v.side, i) || !at2(s, 2.6)) return false;
        v.side |= 1 << i;
        v.sides = v.sides.map((n, k) => (k === i ? sideFinished(i) : n)); // (sides: the whole story counts as done)
        this.events.push({ kind: 'side', i });
        return true;
      }
      case 'sidep': {
        // (sides) one place of a side story (`sides.ts`), its next step, by whoever stands in reach of it
        const p = sidePlace(i);
        if (!p || !sideCan(v.sides, i) || !at2(p.at, p.r ?? SIDE_REACH)) return false;
        const s = sideOf(i).s;
        const next = sideNext(v.sides, i);
        v.sides = v.sides.map((n, k) => (k === s ? next : n));
        if (sideDone(v.sides, s) && !bit(v.side, s)) {
          v.side |= 1 << s;
          this.events.push({ kind: 'side', i: s });
        }
        return true;
      }
      case 'box':
        if (i < 0 || i > 3 || i === v.boxAt) return false;
        v.boxAt = i;
        this.events.push({ kind: 'box', i });
        return true;
      default:
        return false;
    }
  }

  /** Kurogane is down (the hunt complete): the cable goes, the tree lives, and the climb begins. */
  overseerDown(): void {
    const v = this.view;
    if (v.bossDown || !v.hairpin) return;
    v.bossDown = true;
    v.act = ACT.climb;
    v.kuPhase = 3;
    this.events.push({ kind: 'cable' });
  }

  /** (hs-bosses) The fights' state for every screen (whoever runs the infected sets it each frame). */
  bossWords(ua: number, ub: number, kw: number, kx: number): void {
    const v = this.view;
    v.ua = ua;
    v.ub = ub;
    v.kw = kw;
    v.kx = kx;
  }

  /** The finale's count: `n` more of the dead fell at the rock. */
  fallen(n: number): void {
    const v = this.view;
    if (v.act !== ACT.climb || v.cranks <= 0) return;
    v.horde = Math.max(0, v.horde - n);
  }

  /** Someone looked back at her on the climb (each player counts at most every `lookEvery` s). */
  look(seat: number): boolean {
    const v = this.view;
    if (v.act !== ACT.climb) return false;
    const last = this.lookAt.get(seat) ?? -99;
    if (this.t - last < HIRASAKA_STORY.lookEvery) return false;
    this.lookAt.set(seat, this.t);
    v.looks++;
    this.events.push({ kind: 'look', seat, n: v.looks });
    return true;
  }

  // ---- the simulation's old calls (`sim/serverHost.ts`), until it routes everything through `act` ----
  takeKey(x: number, y: number, z: number): boolean {
    return this.act('key', 0, { x, y, z });
  }
  startGenerator(_x: number, _y: number, _z: number): boolean {
    return false;
  }
  openValve(_i: number, _x: number, _y: number, _z: number): boolean {
    return false;
  }
  rideCage(x: number, z: number): boolean {
    return this.act('cage', 0, { x, y: CAGE.top.y, z });
  }
  takePeaches(x: number, z: number): boolean {
    return this.act('peaches', 0, { x, y: DEEP_SPOTS.peaches.y, z });
  }
  takeHairpin(x: number, z: number): boolean {
    return this.act('hairpin', 0, { x, y: DEEP_SPOTS.hairpin.y, z });
  }
  surface(x: number, z: number): boolean {
    return Math.hypot(x - ADIT.out.x, z - ADIT.out.z) < 4;
  }
  takeTape(i: number, x: number, y: number, z: number): boolean {
    return this.act('tape', i, { x, y, z });
  }
  takePhoto(i: number, x: number, y: number, z: number): boolean {
    return this.act('photo', i, { x, y, z });
  }
  answer(x: number, z: number): boolean {
    return this.act('phone', 0, { x, y: DEEP_SPOTS.phone.y, z });
  }
  turnAround(x: number, y: number, z: number): boolean {
    return this.act('home', 0, { x, y, z });
  }
}

/** The co-op wire: the view as a row of numbers. */
const FIELDS = 31;
export function encodeStory(v: StoryView): number[] {
  const r = (n: number): number => Math.round(n * 100) / 100;
  return [
    v.act, v.done, v.coal, v.boilerKey ? 1 : 0, v.tools, v.obstacles, v.ladles, v.umi, v.umiHits, v.moriParts, v.built,
    v.cageDown ? 1 : 0, v.cageAt, v.marked, v.grapes ? 1 : 0, v.kushi, v.hairpin ? 1 : 0, v.kuPhase, v.thunders,
    v.bossDown ? 1 : 0, v.peaches ? 1 : 0, v.mark, v.lead, r(v.cranks), v.held ? 1 : 0, v.horde, v.tapes, v.photos,
    v.side, v.call ? 1 : 0, v.looks, v.boxAt, v.ending, v.ua, v.ub, v.kw, v.kx, v.parts,
    ...(v.sides ?? sideEmpty()), // (sides: after every older field)
  ];
}

export function decodeStory(row: unknown): StoryView | null {
  if (!Array.isArray(row) || row.length < FIELDS + 2) return null;
  const n = row.map(Number);
  if (n.some((x) => !Number.isFinite(x))) return null;
  let k = 0;
  const g = (): number => n[k++]!;
  const b = (): boolean => n[k++] === 1;
  return {
    act: g(), done: g(), coal: g(), boilerKey: b(), tools: g(), obstacles: g(), ladles: g(), umi: g(), umiHits: g(),
    moriParts: g(), built: g(), cageDown: b(), cageAt: g(), marked: g(), grapes: b(), kushi: g(), hairpin: b(),
    kuPhase: g(), thunders: g(), bossDown: b(), peaches: b(), mark: g(), lead: g(), cranks: g(), held: b(), horde: g(),
    tapes: g(), photos: g(), side: g(), call: b(), looks: g(), boxAt: g(), ending: g(), ua: n[k++] ?? 0, ub: n[k++] ?? 0, kw: n[k++] ?? 0, kx: n[k++] ?? 0, parts: n[k++] ?? 0, sides: sideFrom(n.slice(k)), generating: false, charge: 0,
  };
}
