/**
 * HIRASAKA's story as pure state (no THREE): the solo game runs one; the co-op simulation runs the shared one and sends
 * it on (`encodeStory`); every screen draws what it says (`runtime.ts`).
 *
 *   ACT I   THE ISLAND   three jobs, any order, get the cage running: Genzō's key from his room on Block 65's roof;
 *                        the lighthouse generator (start it, then hold the summit while it catches); the three sea gates
 *                        along the seawall (the typhoon's waves come over it). Then the cage goes down.
 *   ACT II  THE DEEP     the Galleries, the Old Village (its white peaches: every player carries three, and the village
 *                        doors all open), the Root Hall (Mio's hairpin in the roots wakes Kurogane, the overseer).
 *   ACT III THE CLIMB    Kurogane down, the cage cable snaps: the only way is the Slope, up out of the old adit, and up
 *                        the island with the storm surge climbing behind - and Mio following. Do not look back at her.
 *                        At the summit, push the Sealing Stone across the head of the Hundred Steps.
 *
 * Genzō's five tapes and five photographs lie round the island and the mine. With every photograph found, the gallery
 * telephone rings: Mio's own message from 1974. Heard, the stone can wait: turn round at the summit and look at her.
 */
import { HIRASAKA, PHOTOS, PLACES, SURGE, TAPES } from './places';

export const JOB_IDS = ['key', 'light', 'gates'] as const;
export type JobId = (typeof JOB_IDS)[number];
export const JOB: Record<JobId, number> = { key: 0, light: 1, gates: 2 };
export const JOB_NAMES: Record<JobId, string> = {
  key: "TAKE GENZŌ'S CAGE KEY",
  light: 'LIGHT THE LIGHTHOUSE',
  gates: 'OPEN THE SEA GATES',
};

export const ACT = { island: 0, deep: 1, climb: 2, won: 3 } as const;

export const HIRASAKA_STORY = {
  /** Seconds to bring the generator up (someone on the summit the whole time). */
  charge: 40,
  /** Seconds of pushing (one player) to roll the stone across; each more pusher adds half again. */
  push: 26,
  /** While Mio leans on the stone it still creeps on, this much as fast (shoot her off it, or throw a peach). */
  heldRate: 0.25,
  /** The big waves over the seawall in act I: every so often, with a warning first. */
  waveEvery: [26, 38] as readonly [number, number],
  waveWarn: 3.5,
  /** Peaches each player carries out of the Old Village. */
  peaches: 3,
  /** A look back counts at most this often per player. */
  lookEvery: 1.6,
};

export interface StoryView {
  act: number;
  /** Bits of `JOB`: done. */
  done: number;
  /** Bits: the sea gates opened. */
  valves: number;
  /** The generator: started, and how far it has caught 0..1. */
  generating: boolean;
  charge: number;
  /** The cage has gone down (once anyone rode it). */
  cageDown: boolean;
  peaches: boolean;
  hairpin: boolean;
  /** Kurogane is down: the cable snapped, the climb is on. */
  bossDown: boolean;
  /** Someone came out of the old adit; seconds since. */
  surfaced: boolean;
  surgeT: number;
  /** How many steps of the surge have come (`SURGE`). */
  surge: number;
  /** The stone: how far it has rolled 0..1; how many are pushing now; held back (Mio is at it). */
  push: number;
  pushers: number;
  held: boolean;
  /** Bits: tapes and photographs found; the hidden call heard. */
  tapes: number;
  photos: number;
  call: boolean;
  /** Times anyone looked back at her on the climb. */
  looks: number;
  /** Seconds to the next big wave (act I). */
  wave: number;
  /** How it ended: 1 sealed, 2 home. */
  ending: number;
}

export type StoryEvent =
  | { kind: 'done'; job: JobId; n: number }
  | { kind: 'valve'; i: number; n: number }
  | { kind: 'generating' }
  | { kind: 'ready' }
  | { kind: 'cage' }
  | { kind: 'peaches' }
  | { kind: 'hairpin' }
  | { kind: 'cable' }
  | { kind: 'surfaced' }
  | { kind: 'surge'; i: number }
  | { kind: 'pushing' }
  | { kind: 'sealed' }
  | { kind: 'home' }
  | { kind: 'tape'; i: number }
  | { kind: 'photo'; i: number; all: boolean }
  | { kind: 'call' }
  | { kind: 'waveWarn' }
  | { kind: 'wave' }
  | { kind: 'look'; seat: number; n: number };

/** Someone standing somewhere (the players, for the zones and the reaches). */
export interface Stand {
  x: number;
  y: number;
  z: number;
  up: boolean;
}

const near = (p: { x: number; y?: number; z: number }, t: { x: number; y?: number; z: number }, r: number): boolean => Math.hypot(p.x - t.x, p.z - t.z) <= r + 0.6 && Math.abs((p.y ?? 0) - (t.y ?? 0)) < 2.4;

export class HirasakaStory {
  view: StoryView = HirasakaStory.empty();
  private events: StoryEvent[] = [];
  private warned = false;
  private lookAt = new Map<number, number>();
  private t = 0;
  private rand: () => number = Math.random;

  static empty(): StoryView {
    return { act: ACT.island, done: 0, valves: 0, generating: false, charge: 0, cageDown: false, peaches: false, hairpin: false, bossDown: false, surfaced: false, surgeT: 0, surge: 0, push: 0, pushers: 0, held: false, tapes: 0, photos: 0, call: false, looks: 0, wave: 30, ending: 0 };
  }

  reset(rand: () => number): void {
    this.rand = rand;
    this.view = HirasakaStory.empty();
    this.view.wave = this.nextWave();
    this.events.length = 0;
    this.warned = false;
    this.lookAt.clear();
    this.t = 0;
  }

  drain(): StoryEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private nextWave(): number {
    const [a, b] = HIRASAKA_STORY.waveEvery;
    return a + this.rand() * (b - a);
  }

  static jobsDone(v: StoryView): number {
    let n = 0;
    for (let i = 0; i < JOB_IDS.length; i++) if (v.done & (1 << i)) n++;
    return n;
  }

  static isDone(v: StoryView, job: JobId): boolean {
    return (v.done & (1 << JOB[job])) !== 0;
  }

  /** Every job on the island done: the cage runs. */
  static ready(v: StoryView): boolean {
    return HirasakaStory.jobsDone(v) >= JOB_IDS.length;
  }

  static count(bits: number): number {
    let c = 0;
    for (let i = 0; i < 8; i++) if (bits & (1 << i)) c++;
    return c;
  }

  /** Every photograph found and the call heard: the stone can wait (the other ending). */
  static canGoHome(v: StoryView): boolean {
    return v.call && HirasakaStory.count(v.photos) >= PHOTOS.length;
  }

  /** The water's height on the island now. */
  static seaLevel(v: StoryView): number {
    return v.surge > 0 ? SURGE[v.surge - 1]!.y : -0.6;
  }

  /**
   * Every frame on the host: the generator's hold, the waves, the surge, the stone. `stand`: the players; `mioAtStone`:
   * she has reached the stone (it barely moves while she leans on it).
   */
  tick(dt: number, stand: readonly Stand[], mioAtStone = false): void {
    const v = this.view;
    this.t += dt;
    if (v.act === ACT.won) return;
    const inside = (c: { x: number; z: number; r: number }, y: number): number => stand.filter((p) => p.up && Math.hypot(p.x - c.x, p.z - c.z) < c.r && Math.abs(p.y - y) < 2.4).length;
    // the generator catches while someone holds the summit
    if (v.generating && !HirasakaStory.isDone(v, 'light')) {
      if (inside(PLACES.summit, 14.4) > 0) v.charge = Math.min(1, v.charge + dt / HIRASAKA_STORY.charge);
      if (v.charge >= 1) this.finish('light');
    }
    // the typhoon's waves over the seawall (act I)
    if (v.act === ACT.island) {
      v.wave -= dt;
      if (v.wave <= HIRASAKA_STORY.waveWarn && !this.warned) {
        this.warned = true;
        this.events.push({ kind: 'waveWarn' });
      }
      if (v.wave <= 0) {
        this.events.push({ kind: 'wave' });
        v.wave = this.nextWave();
        this.warned = false;
      }
    }
    // the climb: the surge, the stone
    if (v.act === ACT.climb && v.surfaced) {
      v.surgeT += dt;
      while (v.surge < SURGE.length && v.surgeT >= SURGE[v.surge]!.at) {
        v.surge++;
        this.events.push({ kind: 'surge', i: v.surge - 1 });
      }
      const n = inside(HIRASAKA.stonePush, 14.4);
      if (n > 0 && v.pushers === 0) this.events.push({ kind: 'pushing' });
      v.pushers = n;
      v.held = mioAtStone && n > 0;
      if (n > 0) v.push = Math.min(1, v.push + (dt / HIRASAKA_STORY.push) * (1 + 0.5 * (n - 1)) * (v.held ? HIRASAKA_STORY.heldRate : 1));
      if (v.push >= 1) this.win(1);
    } else v.pushers = 0;
  }

  private finish(job: JobId): void {
    const v = this.view;
    if (HirasakaStory.isDone(v, job)) return;
    v.done |= 1 << JOB[job];
    const n = HirasakaStory.jobsDone(v);
    this.events.push({ kind: 'done', job, n });
    if (n >= JOB_IDS.length) this.events.push({ kind: 'ready' });
  }

  private win(ending: number): void {
    const v = this.view;
    if (v.act === ACT.won) return;
    v.act = ACT.won;
    v.ending = ending;
    v.pushers = 0;
    this.events.push({ kind: ending === 2 ? 'home' : 'sealed' });
  }

  // ---- what players do (the host checks they are where they say) ----

  takeKey(x: number, y: number, z: number): boolean {
    const v = this.view;
    if (HirasakaStory.isDone(v, 'key') || !near({ x, y, z }, PLACES.key, PLACES.key.r)) return false;
    this.finish('key');
    return true;
  }

  startGenerator(x: number, y: number, z: number): boolean {
    const v = this.view;
    if (v.generating || HirasakaStory.isDone(v, 'light') || !near({ x, y, z }, PLACES.generator, PLACES.generator.r)) return false;
    v.generating = true;
    this.events.push({ kind: 'generating' });
    return true;
  }

  openValve(i: number, x: number, y: number, z: number): boolean {
    const v = this.view;
    const k = PLACES.valves[i];
    if (!k || v.valves & (1 << i) || !near({ x, y, z }, k, k.r)) return false;
    v.valves |= 1 << i;
    const n = HirasakaStory.count(v.valves);
    this.events.push({ kind: 'valve', i, n });
    if (n >= PLACES.valves.length) this.finish('gates');
    return true;
  }

  /** Someone rode the cage down (the first time is the act's turn). */
  rideCage(x: number, z: number): boolean {
    const v = this.view;
    if (!HirasakaStory.ready(v) || v.bossDown || Math.hypot(x - HIRASAKA.cage.x, z - HIRASAKA.cage.z) > HIRASAKA.cage.r + 0.8) return false;
    if (!v.cageDown) {
      v.cageDown = true;
      v.act = ACT.deep;
      this.events.push({ kind: 'cage' });
    }
    return true;
  }

  takePeaches(x: number, z: number): boolean {
    const v = this.view;
    if (!v.cageDown || !near({ x, z }, PLACES.peaches, PLACES.peaches.r)) return false;
    if (!v.peaches) {
      v.peaches = true;
      this.events.push({ kind: 'peaches' });
    }
    return true;
  }

  takeHairpin(x: number, z: number): boolean {
    const v = this.view;
    if (v.hairpin || !v.cageDown || !near({ x, z }, PLACES.hairpin, PLACES.hairpin.r)) return false;
    v.hairpin = true;
    this.events.push({ kind: 'hairpin' });
    return true;
  }

  /** Kurogane is down (the hunt complete): the cable goes, and the climb begins. */
  overseerDown(): void {
    const v = this.view;
    if (v.bossDown || !v.hairpin) return;
    v.bossDown = true;
    v.act = ACT.climb;
    this.events.push({ kind: 'cable' });
  }

  /** Someone came out of the old adit onto the island. */
  surface(x: number, z: number): boolean {
    const v = this.view;
    if (v.act !== ACT.climb || Math.hypot(x - HIRASAKA.aditOut.x, z - HIRASAKA.aditOut.z) > 4) return false;
    if (!v.surfaced) {
      v.surfaced = true;
      v.surgeT = 0;
      this.events.push({ kind: 'surfaced' });
    }
    return true;
  }

  takeTape(i: number, x: number, y: number, z: number): boolean {
    const v = this.view;
    const t = TAPES[i];
    if (!t || v.tapes & (1 << i) || !near({ x, y, z }, t, 2.2)) return false;
    v.tapes |= 1 << i;
    this.events.push({ kind: 'tape', i });
    return true;
  }

  takePhoto(i: number, x: number, y: number, z: number): boolean {
    const v = this.view;
    const p = PHOTOS[i];
    if (!p || v.photos & (1 << i) || !near({ x, y, z }, p, 2.2)) return false;
    v.photos |= 1 << i;
    this.events.push({ kind: 'photo', i, all: HirasakaStory.count(v.photos) >= PHOTOS.length });
    return true;
  }

  /** The gallery telephone, once every photograph is found. */
  answer(x: number, z: number): boolean {
    const v = this.view;
    if (v.call || HirasakaStory.count(v.photos) < PHOTOS.length || Math.hypot(x - PLACES.phone.x, z - PLACES.phone.z) > PLACES.phone.r + 0.6) return false;
    v.call = true;
    this.events.push({ kind: 'call' });
    return true;
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

  /** At the stone, with Mio's message heard: turn round and let her see you. */
  turnAround(x: number, y: number, z: number): boolean {
    const v = this.view;
    if (v.act !== ACT.climb || !v.surfaced || !HirasakaStory.canGoHome(v) || !near({ x, y, z }, { ...HIRASAKA.stonePush, y: 14.4 }, HIRASAKA.stonePush.r + 2)) return false;
    this.win(2);
    return true;
  }
}

/** The co-op wire: the view as a row of numbers. */
export function encodeStory(v: StoryView): number[] {
  const r = (n: number): number => Math.round(n * 100) / 100;
  return [v.act, v.done, v.valves, v.generating ? 1 : 0, r(v.charge), v.cageDown ? 1 : 0, v.peaches ? 1 : 0, v.hairpin ? 1 : 0, v.bossDown ? 1 : 0, v.surfaced ? 1 : 0, Math.round(v.surgeT * 10) / 10, v.surge, r(v.push), v.pushers, v.held ? 1 : 0, v.tapes, v.photos, v.call ? 1 : 0, v.looks, Math.round(v.wave * 10) / 10, v.ending];
}

export function decodeStory(row: unknown): StoryView | null {
  if (!Array.isArray(row) || row.length < 21) return null;
  const n = row.map(Number);
  return { act: n[0]!, done: n[1]!, valves: n[2]!, generating: n[3] === 1, charge: n[4]!, cageDown: n[5] === 1, peaches: n[6] === 1, hairpin: n[7] === 1, bossDown: n[8] === 1, surfaced: n[9] === 1, surgeT: n[10]!, surge: n[11]!, push: n[12]!, pushers: n[13]!, held: n[14] === 1, tapes: n[15]!, photos: n[16]!, call: n[17] === 1, looks: n[18]!, wave: n[19]!, ending: n[20]! };
}
