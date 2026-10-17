/**
 * The Thousand Lanterns, the Sakura District's Easter egg, as pure state (no THREE): the solo game runs one, the co-op
 * simulation runs the shared one and sends its state on (`encodeQuest`), and every screen draws what it says.
 *
 *   1. charms     find the shrine's five omamori where Aoi left them (the metro's lost and found, the music room piano,
 *                 the karaoke's mirror ball, the sunken boat's bow, the lab's sample fridge)
 *   2. tie        tie them to the bare sacred tree in the shrine grounds (any number at a time)
 *   3. lanterns   light the five great lanterns in the order of this run's poem (nailed up on the theatre stage);
 *                 a wrong one puts them all out and the dead come for the shrine
 *   4. bell       ring the bell while the shrine relay transmits (the defense)
 *   5. bloom      the blood moon: crimson trees, a glowing canal, and a ghost train at the station for Kisaragi
 */

export const CHARM_PLACES = ['the metro lost and found', 'the music room piano', 'the karaoke mirror ball', 'the sunken boat', 'the lab sample fridge'] as const;
export const LANTERN_SIGNS = [
  { kanji: '月', word: 'MOON', line: 'the moon on the water' },
  { kanji: '鶴', word: 'CRANE', line: 'a crane folded from paper' },
  { kanji: '狐', word: 'FOX', line: 'the fox at the shrine gate' },
  { kanji: '波', word: 'WAVE', line: 'waves along the canal' },
  { kanji: '花', word: 'BLOSSOM', line: 'one blossom out of season' },
] as const;

export const QUEST_PHASES = ['charms', 'lanterns', 'bell', 'bloom'] as const;
export type QuestPhase = (typeof QUEST_PHASES)[number];

/** Within reach of a charm, the tree, a lantern or the bell (m). The boat's charm is reached from the bank. */
export const QUEST_REACH = { charm: 2.2, boat: 4.2, tree: 3.4, lantern: 2.4, bell: 3 };

export interface QuestView {
  phase: QuestPhase;
  /** Bits: charms picked up (by anyone), and charms tied to the tree. */
  found: number;
  tied: number;
  /** The run's lantern order (lantern indices), and how many are lit in it so far. */
  order: number[];
  lit: number;
  /** Seconds since the bloom (0 before). */
  bloomT: number;
}

export type QuestEvent =
  | { kind: 'charm'; i: number }
  | { kind: 'tied'; n: number; all: boolean }
  | { kind: 'lit'; lantern: number; n: number }
  | { kind: 'wrong'; lantern: number }
  | { kind: 'bellEarly' }
  | { kind: 'bloom' };

export interface QuestSpots {
  charms: { x: number; y: number; z: number }[];
  tree: { x: number; z: number };
  lanterns: { x: number; z: number }[];
  bell: { x: number; z: number };
}

const ALL = 0b11111;
const bits = (v: number): number => {
  let n = 0;
  for (let i = 0; i < 5; i++) if (v & (1 << i)) n++;
  return n;
};

export class SakuraQuest {
  view: QuestView = SakuraQuest.empty();
  /** What happened since the last `drain()` (the host turns these into banners, waves and sounds). */
  private events: QuestEvent[] = [];

  constructor(readonly spots: QuestSpots) {}

  static empty(): QuestView {
    return { phase: 'charms', found: 0, tied: 0, order: [0, 1, 2, 3, 4], lit: 0, bloomT: 0 };
  }

  /** A new run: a fresh order for the lanterns (`rand` in [0, 1)). */
  reset(rand: () => number): void {
    const order = [0, 1, 2, 3, 4];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    this.view = { ...SakuraQuest.empty(), order };
    this.events.length = 0;
  }

  drain(): QuestEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** The poem on the theatre stage: one line for each lantern, in the order they are to be lit. */
  static poem(order: readonly number[]): string[] {
    return order.map((i, k) => `${['First', 'Then', 'Then', 'Then', 'Last'][k]}, ${LANTERN_SIGNS[i]!.line}.`);
  }

  /** Charms picked up and not yet tied (in any view). */
  static held(v: QuestView): number {
    return bits(v.found & ~v.tied);
  }

  get charmsHeld(): number {
    return bits(this.view.found & ~this.view.tied);
  }

  /** Pick up charm `i` (someone at (x, y, z)). */
  takeCharm(i: number, x: number, y: number, z: number): boolean {
    const s = this.spots.charms[i];
    const v = this.view;
    if (!s || v.found & (1 << i)) return false;
    const reach = i === 3 ? QUEST_REACH.boat : QUEST_REACH.charm;
    if (Math.hypot(s.x - x, s.z - z) > reach || Math.abs(s.y - y) > 2.6) return false;
    v.found |= 1 << i;
    this.events.push({ kind: 'charm', i });
    return true;
  }

  /** Tie every charm picked up and not yet tied to the sacred tree. */
  tie(x: number, z: number): boolean {
    const v = this.view;
    const t = this.spots.tree;
    if (v.phase !== 'charms' || Math.hypot(t.x - x, t.z - z) > QUEST_REACH.tree) return false;
    const add = v.found & ~v.tied;
    if (!add) return false;
    v.tied |= add;
    const all = v.tied === ALL;
    if (all) v.phase = 'lanterns';
    this.events.push({ kind: 'tied', n: bits(v.tied), all });
    return true;
  }

  /** Light lantern `j`: the next in the poem's order, or a wrong one (they all go out). */
  light(j: number, x: number, z: number): boolean {
    const v = this.view;
    const l = this.spots.lanterns[j];
    if (v.phase !== 'lanterns' || !l || Math.hypot(l.x - x, l.z - z) > QUEST_REACH.lantern) return false;
    if (v.order.indexOf(j) < v.lit) return false; // already burning
    if (v.order[v.lit] === j) {
      v.lit++;
      this.events.push({ kind: 'lit', lantern: j, n: v.lit });
      if (v.lit >= 5) v.phase = 'bell';
    } else {
      v.lit = 0;
      this.events.push({ kind: 'wrong', lantern: j });
    }
    return true;
  }

  /** Ring the bell: with the lanterns lit and the relay transmitting, the bloom. */
  ring(x: number, z: number, relayOn: boolean): boolean {
    const v = this.view;
    const b = this.spots.bell;
    if (Math.hypot(b.x - x, b.z - z) > QUEST_REACH.bell || v.phase === 'bloom') return false;
    if (v.phase === 'bell' && relayOn) {
      v.phase = 'bloom';
      v.bloomT = 0;
      this.events.push({ kind: 'bloom' });
    } else this.events.push({ kind: 'bellEarly' });
    return true;
  }

  tick(dt: number): void {
    if (this.view.phase === 'bloom') this.view.bloomT += dt;
  }

  /** Where the player is with it, in a line (the journal, the objectives). */
  static status(v: QuestView): string {
    switch (v.phase) {
      case 'charms':
        return v.found === 0 ? 'The sacred tree at the shrine stands bare.' : `Omamori found ${bits(v.found)}/5, tied to the sacred tree ${bits(v.tied)}/5.`;
      case 'lanterns':
        return `The charms are on the tree. Great lanterns lit ${v.lit}/5 - the order is in the poem on the theatre stage.`;
      case 'bell':
        return 'Every lantern burns. Ring the shrine bell while the relay transmits.';
      case 'bloom':
        return 'The blood moon is up. A train waits at the station for a stop on no map.';
    }
  }
}

/** On the wire (co-op): [phase, found bits, tied bits, order as five digits, lit, bloom seconds]. */
export type QuestWire = [number, number, number, number, number, number];

export function encodeQuest(v: QuestView): QuestWire {
  return [QUEST_PHASES.indexOf(v.phase), v.found, v.tied, v.order.reduce((m, d) => m * 10 + d, 0), v.lit, Math.round(v.bloomT)];
}

export function decodeQuest(w: unknown): QuestView | null {
  if (!Array.isArray(w)) return null;
  const n = (k: number): number => Math.max(0, Math.floor(Number(w[k]) || 0));
  let o = n(3);
  const order: number[] = [];
  for (let i = 0; i < 5; i++) {
    order.unshift(o % 10);
    o = Math.floor(o / 10);
  }
  if (new Set(order).size !== 5 || order.some((d) => d > 4)) return null;
  return { phase: QUEST_PHASES[n(0)] ?? 'charms', found: n(1) & ALL, tied: n(2) & ALL, order, lit: Math.min(5, n(4)), bloomT: n(5) };
}

/** Spots round the shrine gate where the dead come from when a lantern is lit out of turn. */
const WRATH = [
  [80, 44],
  [80, 56],
  [86, 64],
  [96, 40],
  [76, 50],
  [90, 62],
  [84, 40],
  [78, 60],
] as const;

/**
 * A lantern lit out of turn: the dead come for the shrine (eight of them, two running). `spawn` is the host's spawner
 * (the simulation's in co-op, the game's solo); every one is sent hunting.
 */
export function lanternWrath(spawn: (type: 'shambler' | 'runner', x: number, z: number) => void): void {
  WRATH.forEach(([x, z], i) => spawn(i < 2 ? 'runner' : 'shambler', x, z));
}
