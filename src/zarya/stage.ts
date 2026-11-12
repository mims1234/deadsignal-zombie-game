/**
 * ZARYA: BABA YAGA'S STAGE (no THREE, no DOM). The Dom Kultury's stage machinery and the fight it is worked in, shared
 * by whoever runs the infected (`director.ts`: the solo game and the co-op simulation), the story (`story.ts`: what a
 * player may work, and the state every screen is sent), the screen (`runtime.ts`: prompts, the HUD's line, what is said)
 * and what is drawn (`stageLook.ts`).
 *
 * Lyudmila Markovna has played Baba Yaga in the children's pageant for forty winters, and woken wrong she plays it still.
 * Her hut walks on its chicken legs: it stalks the stage, and as she is hurt it comes down into the stalls. From it she
 * sweeps her broom at anyone near, throws pots of something that burns cold on the floor, and calls the carol-singers
 * out of the wings. With its door shut nothing reaches her. The squad works the theatre's machinery to open it:
 *
 *   THE REVOLVE       the winch in the south wing turns whatever stands on the revolve: the hut spins, door to the hall
 *   THE TRAPS         the levers in the orchestra pit drop the trap a leg stands on: the hut is pinned, tipped open
 *   THE FLY BARS      the rail on the fly gallery lets a bar go: a painted sky, the sandbags, a painted moon, on her roof
 *   THE FOLLOW-SPOT   at the back of the stalls: dazzled, her door flies open for a moment, and for a while she is blind
 *
 * Each opens a WINDOW: her door stands open and she can be hurt. A second machine catching her while one is open makes it
 * a bigger window (longer, and every blow worth more). She WATCHES the machine that caught her last and steps clear of
 * it, until a different one has caught her, or the spot has blinded her (blind, she watches nothing). So the squad has to
 * use the whole theatre: in co-op one works a machine while the others fight; alone, one player runs between them.
 *
 * Three PHASES by her health (each ends at its own floor: no window carries her past one): 1 she stalks the stage and
 * roosts on the revolve; 2 she comes down into the stalls on a round of the aisles and goes home to the revolve between;
 * 3 she hunts whoever is nearest anywhere the hut can go, faster, with more singers and three pots at a throw.
 *
 * Nothing is timed for the player: the machines wind back by themselves, nothing is missed, nothing fails the run.
 */
import type { Zombie, ZombieScript } from '../enemies/zombie';
import type { Rng } from '../logic/rng';
import { DK } from './zones/dk';
import type { Rect, Spot } from './types';

/** Someone standing somewhere (the story's `Stand`: the players). */
interface Stand {
  x: number;
  z: number;
  up: boolean;
}

// =====================================================================================================================
// the numbers
// =====================================================================================================================

export const MACHINE = { revolve: 0, trap: 1, fly: 2, spot: 3 } as const;
export type Machine = 0 | 1 | 2 | 3;

/** Each machine: where it is worked from, what working it is called, how long a hold, the window it opens, how long it takes to wind back. */
export const MACHINES: readonly { id: 'revolve' | 'trap' | 'fly' | 'spot'; name: string; verb: string; at: Spot; hold: number; window: number; rearm: number }[] = [
  { id: 'revolve', name: 'THE REVOLVE', verb: 'TURN THE REVOLVE', at: DK.winch, hold: 1.2, window: 7, rearm: 9 },
  { id: 'trap', name: 'THE TRAPS', verb: 'DROP THE TRAP', at: DK.trapLever, hold: 0.8, window: 8, rearm: 12 },
  { id: 'fly', name: 'THE FLY BARS', verb: 'LET THE BAR GO', at: DK.flyRail, hold: 1, window: 7, rearm: 14 },
  { id: 'spot', name: 'THE FOLLOW-SPOT', verb: 'TURN THE SPOT ON HER', at: DK.spot, hold: 0.6, window: 3, rearm: 16 },
];

export const YAGA = {
  /** She notices a standing player this near her hut. */
  see: 26,
  /** Her health, a multiple of the Warden's (`BOSS.yaga.hp` in the director is the same number), and how much more for each player past the first. */
  hp: 5,
  squad: 0.5,
  /** Every blow in a window is worth this much more for each machine past the first that caught her in it (index: the window's level). */
  mul: [0, 1, 1.5, 2],
  /** A second machine catching her in an open window: it lasts at least its own length, and this much more. */
  combo: 3,
  /**
   * The most one window can take off her, a share of her whole health by its level: half a phase with one machine on
   * her, three quarters with two, a whole phase with three. Then she slams her door, whatever was holding her (so every
   * phase takes a few windows, however many guns are on her).
   */
  windowCap: [0, 1 / 6, 1 / 4, 1 / 3],
  /** Seconds the spot leaves her blind. */
  blind: 14,
  /**
   * A bar takes this long to come down, and lands on her if she is within `barReach` m of its line then (the bars hang
   * over the places she stops: the revolve, the corners, the back): let one go while she walks, and it misses.
   */
  barFall: 1,
  barReach: 1.5,
  /** Each phase ends at this share of her health. */
  floors: [1, 2 / 3, 1 / 3, 0],
  /** The hut's pace, by phase. */
  speed: [0, 1.5, 2.05, 2.6],
  /** Seconds she rages at the start of phases 2 and 3 (nothing reaches her, nothing works). */
  rage: 3,
  /** The broom: out to `reach` metres within the arc in front of the hut (cos of its half-angle), after a wind-up. */
  sweep: { reach: 4.8, arc: 0.34, windup: 0.9, damage: 24, knock: 9, every: [0, 3.4, 3, 2.5] },
  /** A pot thrown at someone between `min` and `max` metres off: it lands where they stood, and the floor burns cold. */
  pot: { min: 6, max: 30, windup: 1.1, flight: 1.15, splash: 12, splashR: 1.4, r: 2.4, life: 6, tick: 0.5, tickDamage: 6, every: [0, 6.5, 5.5, 5], volley: [0, 1, 1, 3], wild: 5 },
  /** A stamp of the legs (phases 2 and 3), at anyone this near. */
  stomp: { reach: 3.6, windup: 0.7, damage: 20, knock: 11, every: 4.5 },
  /** The carol-singers: called every so many seconds, so many at a time (one more for each player past the first), never more than `cap` on their feet in the theatre. */
  call: { every: [0, 24, 18, 14], pack: [0, 3, 3, 4], cap: [0, 5, 6, 7] },
} as const;

/** How the hut is drawn and hit: the Warden's body, made the size of a hut (the director and every screen set it on her). */
export const HUT_DEF_PATCH = { radius: 1.45, height: 4, headRadius: 0.62 } as const;

/** The theatre's halls the carol-singers are counted in (the stage, its wings, the stalls). */
const THEATRE: Rect = { x0: -190, z0: -47.5, x1: -136, z1: 1.5 };
/** The boards the fly bars hang over (the stage proper: not the thrust, not the wings). */
const BOARDS: Rect = { x0: DK.stage.x0, z0: DK.stage.z0, x1: DK.stage.x1 - 0.6, z1: DK.stage.z1 };

const inR = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
/** The zombies' yaw convention: facing (-sin, -cos). */
const yawTo = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z));
const EAST = yawTo(0, 0, 1, 0);
const WEST = yawTo(0, 0, -1, 0);

// =====================================================================================================================
// where the hut is: what each machine can do to it there
// =====================================================================================================================

/** The hut stands on the revolve. */
export function onRevolve(h: Spot): boolean {
  return Math.hypot(h.x - DK.hut.x, h.z - DK.hut.z) <= 1.5;
}
/** The trap a leg of the hut stands on, or -1. */
export function trapUnder(h: Spot): number {
  for (let i = 0; i < DK.traps.length; i++) if (Math.hypot(h.x - DK.traps[i]!.x, h.z - DK.traps[i]!.z) <= 1.6) return i;
  return -1;
}
/** The hut is under the fly bars (on the stage proper). */
export function underBars(h: Spot): boolean {
  return inR(BOARDS, h.x, h.z);
}
/** The bar nearest over the hut. */
export function barOver(h: Spot): number {
  let best = 0;
  for (let i = 1; i < DK.bars.length; i++) if (Math.abs(DK.bars[i]! - h.x) < Math.abs(DK.bars[best]! - h.x)) best = i;
  return best;
}
/** Whether machine `m` would catch the hut where it stands now. */
export function catches(m: Machine, h: Spot): boolean {
  if (m === MACHINE.revolve) return onRevolve(h);
  if (m === MACHINE.trap) return trapUnder(h) >= 0;
  if (m === MACHINE.fly) return underBars(h);
  return true;
}
/** The floor under the hut's feet: the boards (the stage, the thrust, the wings) or the hall's. */
export function hutFloor(x: number, z: number): number {
  const onStage = (x >= DK.stage.x0 && x <= DK.stage.x1 && z >= DK.northWing.z0 && z <= DK.southWing.z1) || inR(DK.apron, x, z);
  return onStage ? DK.stageTop : 0;
}

// =====================================================================================================================
// the state every screen is sent (`StoryView.st`, `pa`, `pb`)
// =====================================================================================================================

/** What a machine is doing: ready to work; running (turning, open, down, lit); winding back. */
export const MSTATE = { ready: 0, running: 1, winding: 2 } as const;
/** What she is doing with her hands (bits 21-23 of the word). */
export const ACT = { none: 0, sweep: 1, pot: 2, stomp: 3, call: 4, rage: 5 } as const;

/**
 * The word: bits 0-1 phase (0 not yet begun); 2-3 the window's level (0 shut); 4 blind; 5-7 the machine she watches + 1;
 * 8-15 the four machines' states, two bits each; 16-18 the open trap + 1; 19-20 the bar that is down + 1; 21-23 what
 * she is doing (`ACT`); 24 pinned; 25 spun on the revolve (dizzy for the window); 26 stunned under a bar.
 */
export const Stage = {
  phase: (st: number): number => st & 3,
  level: (st: number): number => (st >> 2) & 3,
  blind: (st: number): boolean => ((st >> 4) & 1) !== 0,
  watched: (st: number): number => ((st >> 5) & 7) - 1,
  state: (st: number, m: number): number => (st >> (8 + m * 2)) & 3,
  openTrap: (st: number): number => ((st >> 16) & 7) - 1,
  bar: (st: number): number => ((st >> 19) & 3) - 1,
  act: (st: number): number => (st >> 21) & 7,
  pinned: (st: number): boolean => ((st >> 24) & 1) !== 0,
  spinning: (st: number): boolean => ((st >> 25) & 1) !== 0,
  stunned: (st: number): boolean => ((st >> 26) & 1) !== 0,
  /** Machine `m` can be worked now: the fight is on, it is wound and ready, and she is not watching it (blind, she watches nothing). */
  ready(st: number, m: number): boolean {
    if (m < 0 || m > 3 || Stage.phase(st) === 0 || Stage.act(st) === ACT.rage) return false;
    if (Stage.state(st, m) !== MSTATE.ready) return false;
    return Stage.blind(st) || Stage.watched(st) !== m;
  },
  /** The frost pools as two numbers (two pools each: a bit for live, then x and z to the metre within the theatre). */
  pools(pa: number, pb: number): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const w of [pa, pb]) {
      for (let k = 0; k < 2; k++) {
        const b = (w >> (k * 13)) & 0x1fff;
        if ((b & 1) === 0) continue;
        out.push({ x: -191 + ((b >> 1) & 63), z: -48 + ((b >> 7) & 63) });
      }
    }
    return out;
  },
};

function packPool(p: { x: number; z: number } | undefined): number {
  if (!p) return 0;
  const x = Math.max(0, Math.min(63, Math.round(p.x + 191)));
  const z = Math.max(0, Math.min(63, Math.round(p.z + 48)));
  return 1 | (x << 1) | (z << 7);
}

// =====================================================================================================================
// what a player is shown at each machine (`runtime.ts`)
// =====================================================================================================================

/**
 * The prompt at machine `m`: `use` true when it can be worked now and would catch her (a hold of `hold` seconds), false
 * when it only says why not. `hut`: where the hut stands (null: nowhere to be seen).
 */
export function machinePrompt(st: number, m: Machine, hut: Spot | null): { use: boolean; text: string; sub: string; hold: number } {
  const M = MACHINES[m]!;
  const say = (sub: string): { use: boolean; text: string; sub: string; hold: number } => ({ use: false, text: M.name, sub, hold: 0 });
  const state = Stage.state(st, m);
  if (Stage.act(st) === ACT.rage) return say('Not now: the hut is stamping');
  if (state === MSTATE.running) return say(['Turning', 'The trap is open', 'The bar is down', 'On her'][m]!);
  if (state === MSTATE.winding) return say(['Winding back', 'The trap is closing', 'Hauling the bar back up', 'The lamp is cooling'][m]!);
  if (!Stage.blind(st) && Stage.watched(st) === m) return say(`She is watching ${['the revolve', 'the traps', 'the bars', 'the spot'][m]}. Catch her with something else, or blind her`);
  if (!hut) return say('Nothing to work it on');
  if (m === MACHINE.revolve && !onRevolve(hut)) return say('It turns what stands on it. Wait till the hut is on the circle');
  if (m === MACHINE.trap && trapUnder(hut) < 0) return say('Five chalked traps in the boards. Wait till a leg is on one');
  if (m === MACHINE.fly && !underBars(hut)) return say('The bars hang over the stage. She is not under them');
  if (m === MACHINE.fly && Math.abs(DK.bars[barOver(hut)]! - hut.x) > YAGA.barReach) return { use: true, text: M.verb, sub: 'She is between bars: let it go as she stops under one', hold: M.hold };
  const sub = [
    'Spins the hut: her door to the hall',
    `A leg on trap ${trapUnder(hut) + 1}: drop it through`,
    `The bar over her: ${['the painted sky', 'the sandbags', 'the painted moon'][barOver(hut)]}`,
    'Dazzles her, and blinds her to the machines',
  ][m]!;
  return { use: true, text: M.verb, sub: Stage.level(st) > 0 ? `${sub}. Her door is already open: a bigger window` : sub, hold: M.hold };
}

/** The HUD's line for her: what to do now, and where. */
export function yagaObjective(st: number, hut: Spot | null): { sub: string; at: Spot } {
  const h = hut ?? DK.hut;
  const lv = Stage.level(st);
  if (Stage.act(st) === ACT.rage) return { sub: 'The hut is stamping. Keep clear', at: h };
  if (lv > 0) return { sub: lv > 1 ? `Her door is open, ${lv} machines on her. Now` : 'Her door is open. Now', at: h };
  for (const m of [MACHINE.trap, MACHINE.revolve, MACHINE.fly, MACHINE.spot] as Machine[]) {
    if (!Stage.ready(st, m) || !catches(m, h)) continue;
    const where = ['the winch in the south wing', 'the levers in the orchestra pit', 'the rail on the fly gallery', 'the spot at the back of the stalls'][m]!;
    const why = ['She is on the revolve', 'A leg is on a trap', 'She is under the fly bars', 'Blind her'][m]!;
    return { sub: `${why}: ${where}`, at: MACHINES[m]!.at };
  }
  return { sub: 'Her door is shut. The theatre has machines that open it', at: h };
}

/** What changed between two words, for the screen to say and play (`runtime.ts`). */
export interface StageCue {
  kind: 'begin' | 'phase' | 'caught' | 'combo' | 'miss' | 'shut' | 'blind' | 'sight' | 'call' | 'pot' | 'sweep' | 'stomp';
  m?: number;
  n?: number;
}
/**
 * What changed between two states of the stage (`st` and the second pool number, which also carries the misses: bits
 * 26-27 how many machines have caught nothing so far, mod 4; 28-29 the last that did).
 */
export function stageCues(a: number, b: number, apb = 0, bpb = 0): StageCue[] {
  const out: StageCue[] = [];
  const pa = Stage.phase(a);
  const pb = Stage.phase(b);
  if (pa === 0 && pb > 0) out.push({ kind: 'begin' });
  else if (pb > pa) out.push({ kind: 'phase', n: pb });
  if (pb === 0) return out;
  const la = Stage.level(a);
  const lb = Stage.level(b);
  // a window opened or grew: the machine that did it is the one she watches now
  if (lb > la && pb === pa) out.push({ kind: la === 0 ? 'caught' : 'combo', m: Stage.watched(b), n: lb });
  if (((apb >> 26) & 3) !== ((bpb >> 26) & 3)) out.push({ kind: 'miss', m: (bpb >> 28) & 3 });
  if (la > 0 && lb === 0 && pb === pa) out.push({ kind: 'shut' });
  if (!Stage.blind(a) && Stage.blind(b)) out.push({ kind: 'blind' });
  if (Stage.blind(a) && !Stage.blind(b)) out.push({ kind: 'sight' });
  const aa = Stage.act(a);
  const ab = Stage.act(b);
  if (ab !== aa) {
    if (ab === ACT.call) out.push({ kind: 'call' });
    else if (ab === ACT.pot) out.push({ kind: 'pot' });
    else if (ab === ACT.sweep) out.push({ kind: 'sweep' });
    else if (ab === ACT.stomp) out.push({ kind: 'stomp' });
  }
  return out;
}

// =====================================================================================================================
// the hut's ways about the theatre
// =====================================================================================================================

const NODE_NAMES = Object.keys(DK.walk);
const NODES: readonly Spot[] = NODE_NAMES.map((k) => DK.walk[k]!);
const NODE = Object.fromEntries(NODE_NAMES.map((k, i) => [k, i])) as Record<string, number>;
const LINKS: number[][] = NODES.map(() => []);
for (const e of DK.walkEdges) {
  const [a, b] = e.split('-').map((k) => NODE[k]!);
  LINKS[a!]!.push(b!);
  LINKS[b!]!.push(a!);
}
/** The ways on the stage itself (phase 1 keeps to them). */
const STAGE_NODES = ['R', 'W', 'N1', 'S1', 'N2', 'S2', 'F'].map((k) => NODE[k]!);
/** A round of the stalls, from the front of the stage and back to it. */
const ROUND = ['F', 'A', 'P', 'M', 'C', 'CN', 'C', 'CS', 'C', 'M', 'P', 'A', 'F', 'R'].map((k) => NODE[k]!);

/** The shortest way from node `a` to node `b` along the links (every node after `a`). */
function route(a: number, b: number, allowed: ReadonlySet<number> | null): number[] {
  if (a === b) return [];
  const prev = new Map<number, number>([[a, -1]]);
  const q = [a];
  while (q.length) {
    const n = q.shift()!;
    if (n === b) break;
    for (const k of LINKS[n]!) {
      if (prev.has(k) || (allowed && !allowed.has(k))) continue;
      prev.set(k, n);
      q.push(k);
    }
  }
  if (!prev.has(b)) return [];
  const out: number[] = [];
  for (let n = b; n !== a; n = prev.get(n)!) out.unshift(n);
  return out;
}
function nearestNode(x: number, z: number, among: readonly number[]): number {
  let best = among[0]!;
  let bd = Infinity;
  for (const n of among) {
    const d = Math.hypot(NODES[n]!.x - x, NODES[n]!.z - z);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}
const ALL_NODES = NODES.map((_, i) => i);
const STAGE_SET = new Set(STAGE_NODES);

// =====================================================================================================================
// the fight
// =====================================================================================================================

/** The hut moves itself (`YagaFight.step` sets where it stands): the zombie's own AI never runs while this is on it. */
class HutScript implements ZombieScript {
  speed = 0;
  mode: 'idle' | 'walk' | 'slam' | 'stagger' = 'idle';

  step(z: Zombie): boolean {
    z.vx = z.vz = 0;
    const p = z.scriptPose;
    p.mode = this.mode;
    p.actionT = 0;
    p.speed = this.speed;
    p.lift = 0;
    return true;
  }
}

/** A blow that landed on a player: `i` is their index in the `stand` the director was given this frame. */
export interface Hurt {
  i: number;
  amount: number;
  x: number;
  z: number;
  knock: number;
}

export interface FightHooks {
  /** A carol-singer in a mask, out of the wings at (x, z), hunting the nearest standing player. */
  spawn(x: number, z: number, rng: Rng): void;
  /** How many infected (not the named) are on their feet inside a rectangle. */
  count(r: Rect): number;
}

interface MachineRun {
  state: number;
  t: number;
}

export class YagaFight {
  phase = 0;
  /** The open window: seconds left and its level (0 shut). */
  private winT = 0;
  level = 0;
  private blindT = 0;
  watched = -1;
  readonly machines: MachineRun[] = [0, 1, 2, 3].map(() => ({ state: MSTATE.ready, t: 0 }));
  /** What holds the hut still: spinning on the revolve, pinned in a trap (which), stunned under a bar (which, and how soon it lands). */
  private spinT = 0;
  private pinT = 0;
  trap = -1;
  private stunT = 0;
  bar = -1;
  private barFall = -1;
  private barFallX = 0;
  private dazeT = 0;
  private dizzyT = 0;
  private rageT = 0;
  /** What her hands are doing: the act, seconds into it, and who it is for. */
  private act: number = ACT.none;
  private actT = 0;
  private aim = { x: 0, z: 0 };
  private sweepCd = 2;
  private potCd = 3;
  private stompCd = 2;
  private callT = 6;
  /** Pots in the air, and the floor burning cold where they came down. */
  private readonly pots: { x0: number; z0: number; x1: number; z1: number; t: number }[] = [];
  readonly pools: { x: number; z: number; t: number; tick: number }[] = [];
  /** The hut's way: the nodes still to walk, and how long to stand at the end of them. */
  private path: number[] = [];
  private dwell = 0;
  private round = -1;
  private homeT = 0;
  private plan = 0;
  private hurts: Hurt[] = [];
  private script: HutScript | null = null;
  private squad = 1;
  private misses = 0;
  private missed = 0;
  /** What the open window has taken off her so far (`YAGA.windowCap`). */
  private dealt = 0;

  constructor(private readonly hooks: FightHooks) {}

  reset(): void {
    this.phase = 0;
    this.winT = this.level = this.blindT = 0;
    this.watched = -1;
    for (const m of this.machines) {
      m.state = MSTATE.ready;
      m.t = 0;
    }
    this.spinT = this.pinT = this.stunT = this.dazeT = this.dizzyT = this.rageT = 0;
    this.trap = this.bar = this.barFall = -1;
    this.act = ACT.none;
    this.actT = 0;
    this.sweepCd = 2;
    this.potCd = 3;
    this.stompCd = 2;
    this.callT = 6;
    this.pots.length = 0;
    this.pools.length = 0;
    this.path = [];
    this.dwell = 0;
    this.round = -1;
    this.homeT = 0;
    this.plan = 0;
    this.hurts = [];
    this.script = null;
    this.squad = 1;
    this.misses = this.missed = 0;
    this.dealt = 0;
  }

  /** The word every screen is sent (`Stage`). */
  get word(): number {
    let w = this.phase & 3;
    w |= (this.level & 3) << 2;
    if (this.blindT > 0) w |= 1 << 4;
    w |= ((this.watched + 1) & 7) << 5;
    this.machines.forEach((m, i) => (w |= (m.state & 3) << (8 + i * 2)));
    if (this.trap >= 0 && this.machines[MACHINE.trap]!.state === MSTATE.running) w |= ((this.trap + 1) & 7) << 16;
    if (this.bar >= 0 && this.machines[MACHINE.fly]!.state === MSTATE.running) w |= ((this.bar + 1) & 3) << 19;
    w |= (this.act & 7) << 21;
    if (this.pinT > 0) w |= 1 << 24;
    if (this.spinT > 0 || this.dizzyT > 0) w |= 1 << 25;
    if (this.stunT > 0) w |= 1 << 26;
    return w;
  }
  /** The pools, as the two numbers the word travels with. */
  get poolWords(): [number, number] {
    const p = this.pools;
    // (the misses ride in the second number's top bits: `stageCues`)
    return [packPool(p[0]) | (packPool(p[1]) << 13), packPool(p[2]) | (packPool(p[3]) << 13) | ((this.misses & 3) << 26) | ((this.missed & 3) << 28)];
  }

  /** A machine worked on nothing: the screen says so (`stageCues`). */
  private miss(m: Machine): void {
    this.misses++;
    this.missed = m;
  }

  drainHurts(): Hurt[] {
    const h = this.hurts;
    this.hurts = [];
    return h;
  }

  /** She has noticed the squad: the fight begins (her health for this many players). */
  begin(y: Zombie, players: number): void {
    if (this.phase > 0) return;
    this.phase = 1;
    this.squad = Math.max(1, players);
    const hp = y.maxHp * (1 + YAGA.squad * (this.squad - 1));
    y.maxHp = y.hp = hp;
    y.invulnerable = true;
    this.take(y);
    this.dwell = 2.5;
    this.callT = 5;
  }

  /** Put the hut's own script on her (a body that had another's loses it). */
  private take(y: Zombie): void {
    if (!(y.script instanceof HutScript)) {
      this.script = new HutScript();
      y.script = this.script;
    } else this.script = y.script;
    // every blow in a window is worth the window's level; none carries her past the floor of her phase
    y.hurtMul = (amount) => {
      const floor = y.maxHp * YAGA.floors[this.phase]!;
      const room = y.maxHp * YAGA.windowCap[this.level]! - this.dealt;
      const a = Math.max(0, Math.min(amount * YAGA.mul[this.level]!, y.hp - floor, room));
      this.dealt += a;
      return a;
    };
  }

  /**
   * A player worked machine `m` (the story let them: it was ready and she was not watching it). It runs whether it
   * catches her or not; if the hut was not where it bites, it only winds back.
   */
  use(m: Machine, y: Zombie | null): void {
    const run = this.machines[m]!;
    if (this.phase === 0 || run.state !== MSTATE.ready || this.rageT > 0) return;
    run.state = MSTATE.running;
    run.t = 1.2;
    if (!y || !y.alive) return;
    const h = { x: y.x, z: y.z };
    if (m === MACHINE.fly) {
      // the bar falls: it lands in a moment, on whatever is under it then
      if (!underBars(h)) return this.miss(m);
      this.bar = barOver(h);
      this.barFall = YAGA.barFall;
      this.barFallX = DK.bars[this.bar]!;
      run.t = 30;
      return;
    }
    if (!catches(m, h)) return this.miss(m);
    this.caught(m, y);
  }

  /** Machine `m` caught her: the window opens, or grows. */
  private caught(m: Machine, y: Zombie): void {
    const M = MACHINES[m]!;
    const run = this.machines[m]!;
    if (this.level === 0) {
      this.level = 1;
      this.winT = M.window;
    } else {
      this.level = Math.min(3, this.level + 1);
      this.winT = Math.max(this.winT, M.window) + YAGA.combo;
    }
    y.invulnerable = false;
    this.act = ACT.none;
    this.actT = 0;
    this.path = [];
    if (m === MACHINE.revolve) {
      // the revolve spins her round: she ends with her door to the hall, and stands there dizzy for the whole window
      this.spinT = 1.4;
      this.dizzyT = this.winT;
      run.t = 1.4;
    } else if (m === MACHINE.trap) {
      this.trap = trapUnder(y);
      const t = DK.traps[this.trap]!;
      y.x = t.x + (y.x - t.x) * 0.3;
      y.z = t.z + (y.z - t.z) * 0.3;
      this.pinT = this.winT;
      run.t = this.winT;
    } else if (m === MACHINE.fly) {
      this.stunT = this.winT;
      run.t = this.winT;
    } else {
      this.dazeT = M.window;
      this.blindT = YAGA.blind;
      run.t = YAGA.blind;
    }
    // what she was held by before goes on holding her for the whole of the bigger window
    if (this.pinT > 0) this.pinT = Math.max(this.pinT, this.winT);
    if (this.dizzyT > 0) this.dizzyT = Math.max(this.dizzyT, this.winT);
    if (this.stunT > 0) this.stunT = Math.max(this.stunT, this.winT);
    if (this.trap >= 0 && this.machines[MACHINE.trap]!.state === MSTATE.running) this.machines[MACHINE.trap]!.t = Math.max(this.machines[MACHINE.trap]!.t, this.pinT);
    if (this.bar >= 0 && this.machines[MACHINE.fly]!.state === MSTATE.running) this.machines[MACHINE.fly]!.t = Math.max(this.machines[MACHINE.fly]!.t, this.stunT);
    this.watched = m;
  }

  /** Every frame while she stands. `stand`: every player (their index is what a `Hurt` names). */
  step(dt: number, y: Zombie, stand: readonly Stand[], rng: Rng): void {
    if (this.phase === 0) return;
    if (!(y.script instanceof HutScript)) this.take(y);
    const s = this.script!;
    const up = stand.map((p, i) => ({ ...p, i })).filter((p) => p.up);

    // ---- the machines wind back by themselves ----
    for (let m = 0; m < 4; m++) {
      const run = this.machines[m]!;
      if (run.state === MSTATE.ready) continue;
      run.t -= dt;
      if (run.t > 0) continue;
      if (run.state === MSTATE.running) {
        run.state = MSTATE.winding;
        run.t = MACHINES[m]!.rearm;
        if (m === MACHINE.trap) this.trap = -1;
        if (m === MACHINE.fly) this.bar = -1;
      } else run.state = MSTATE.ready;
    }
    // the bar coming down: on her roof if she is still under it
    if (this.barFall > 0) {
      this.barFall -= dt;
      if (this.barFall <= 0) {
        this.barFall = -1;
        if (underBars(y) && Math.abs(y.x - this.barFallX) <= YAGA.barReach) this.caught(MACHINE.fly, y);
        else {
          this.machines[MACHINE.fly]!.t = 1.4;
          this.miss(MACHINE.fly);
        }
      }
    }

    // ---- the window, and what holds her ----
    if (this.blindT > 0) this.blindT = Math.max(0, this.blindT - dt);
    if (this.winT > 0) {
      this.winT -= dt;
      if (this.winT <= 0) this.shut(y);
    }
    this.spinT = Math.max(0, this.spinT - dt);
    this.pinT = Math.max(0, this.pinT - dt);
    this.stunT = Math.max(0, this.stunT - dt);
    this.dazeT = Math.max(0, this.dazeT - dt);
    this.dizzyT = Math.max(0, this.dizzyT - dt);

    // ---- the window has taken all it may: she slams her door, and whatever held her lets go ----
    if (this.level > 0 && this.dealt >= y.maxHp * YAGA.windowCap[this.level]! - 1e-3) {
      this.shut(y);
      this.spinT = this.pinT = this.stunT = this.dazeT = this.dizzyT = 0;
      for (const m of this.machines) if (m.state === MSTATE.running && m !== this.machines[MACHINE.spot]) m.t = 0;
    }

    // ---- her health at the floor of this phase: the next one begins ----
    if (this.phase < 3 && y.hp <= y.maxHp * YAGA.floors[this.phase]! + 1e-3) {
      this.phase++;
      this.shut(y);
      this.spinT = this.pinT = this.stunT = this.dazeT = this.dizzyT = 0;
      for (const m of this.machines) if (m.state === MSTATE.running) m.t = 0;
      // furious, she watches nothing in particular, and the spot's dazzle is gone
      this.watched = -1;
      this.blindT = 0;
      this.rageT = YAGA.rage;
      this.act = ACT.rage;
      this.actT = 0;
      this.path = [];
      this.round = -1;
      this.dwell = 0;
      this.callT = 0.5;
      this.homeT = 0;
    }
    y.y = hutFloor(y.x, y.z);

    // ---- the pots in the air and the pools on the floor ----
    this.stepPots(dt, up);

    s.speed = 0;
    s.mode = 'idle';
    if (this.rageT > 0) {
      // she stamps: anyone close is thrown off, and she calls them in
      this.rageT -= dt;
      s.mode = 'slam';
      if (this.rageT <= 0) {
        this.act = ACT.none;
        this.stompAt(y, up, YAGA.stomp.reach + 0.6, YAGA.stomp.damage);
      }
      return;
    }
    if (this.spinT > 0) {
      // round on the revolve, to her door facing the hall
      y.yaw = this.spinT > 0.25 ? wrap(y.yaw + dt * 9) : EAST;
      y.x = DK.hut.x + (y.x - DK.hut.x) * 0.9;
      y.z = DK.hut.z + (y.z - DK.hut.z) * 0.9;
      s.mode = 'stagger';
      return;
    }
    if (this.pinT > 0 || this.stunT > 0 || this.dazeT > 0 || this.dizzyT > 0) {
      s.mode = 'stagger';
      return;
    }

    // ---- the carol-singers ----
    this.callT -= dt;
    if (this.callT <= 0 && this.blindT <= 0 && this.act === ACT.none) {
      this.callT = YAGA.call.every[this.phase]!;
      const room = YAGA.call.cap[this.phase]! + (this.squad - 1) * 2 - this.hooks.count(THEATRE);
      const n = Math.min(room, YAGA.call.pack[this.phase]! + (this.squad - 1));
      if (n > 0) {
        this.act = ACT.call;
        this.actT = 0;
        // out of the wing farthest from the squad
        const spots = [...DK.carols].sort((a, b) => far(up, b) - far(up, a));
        for (let k = 0; k < n; k++) {
          const c = spots[k % 2]!;
          this.hooks.spawn(c[0] + (k % 3) * 0.7, c[1] + Math.floor(k / 3) * 0.7, rng);
        }
      }
    }

    // ---- her hands ----
    if (this.act !== ACT.none) {
      this.actT += dt;
      this.stepAct(dt, y, up, rng);
      if (this.act === ACT.sweep || this.act === ACT.stomp) s.mode = 'slam';
      return;
    }
    this.sweepCd -= dt;
    this.potCd -= dt;
    this.stompCd -= dt;
    const near = nearestUp(up, y.x, y.z);
    const dNear = near ? Math.hypot(near.x - y.x, near.z - y.z) : Infinity;
    const blind = this.blindT > 0;
    if (near && this.sweepCd <= 0 && dNear <= YAGA.sweep.reach - (blind ? 1.5 : 0)) {
      this.start(ACT.sweep, near);
      return;
    }
    if (near && this.phase >= 2 && this.stompCd <= 0 && dNear <= YAGA.stomp.reach - 0.4 && this.path.length > 0) {
      this.start(ACT.stomp, near);
      return;
    }
    if (this.potCd <= 0) {
      const far2 = up.filter((p) => {
        const d = Math.hypot(p.x - y.x, p.z - y.z);
        return d >= YAGA.pot.min && d <= YAGA.pot.max && inR(THEATRE, p.x, p.z);
      });
      if (far2.length) {
        this.start(ACT.pot, far2[Math.floor(rng.f() * far2.length)]!);
        return;
      }
    }

    // ---- the hut walks ----
    this.walk(dt, y, up, rng, s);
  }

  /** The window shuts: her door bangs to, and nothing reaches her. */
  private shut(y: Zombie): void {
    this.winT = 0;
    this.level = 0;
    this.dealt = 0;
    y.invulnerable = true;
  }

  private start(act: number, who: { x: number; z: number }): void {
    this.act = act;
    this.actT = 0;
    this.aim.x = who.x;
    this.aim.z = who.z;
  }

  /** The act in hand, one frame: a wind-up facing them, then it lands. */
  private stepAct(dt: number, y: Zombie, up: readonly (Stand & { i: number })[], rng: Rng): void {
    const turn = (rate: number): void => {
      const want = yawTo(y.x, y.z, this.aim.x, this.aim.z);
      const d = wrap(want - y.yaw);
      y.yaw = wrap(y.yaw + Math.sign(d) * Math.min(Math.abs(d), rate * dt));
    };
    if (this.act === ACT.call) {
      if (this.actT > 1.4) this.act = ACT.none;
      return;
    }
    if (this.act === ACT.sweep) {
      const S = YAGA.sweep;
      const near = nearestUp(up, y.x, y.z);
      if (near && this.actT < S.windup * 0.6) {
        this.aim.x = near.x;
        this.aim.z = near.z;
      }
      turn(3);
      if (this.actT >= S.windup) {
        // the broom comes round: everyone in front of the hut within its reach
        const fx = -Math.sin(y.yaw);
        const fz = -Math.cos(y.yaw);
        for (const p of up) {
          const dx = p.x - y.x;
          const dz = p.z - y.z;
          const d = Math.hypot(dx, dz);
          if (d > S.reach || (d > 1.2 && (dx * fx + dz * fz) / d < S.arc)) continue;
          this.hurts.push({ i: p.i, amount: S.damage, x: y.x, z: y.z, knock: S.knock });
        }
        this.act = ACT.none;
        this.sweepCd = S.every[this.phase]!;
      }
      return;
    }
    if (this.act === ACT.stomp) {
      const S = YAGA.stomp;
      if (this.actT >= S.windup) {
        this.stompAt(y, up, S.reach, S.damage);
        this.act = ACT.none;
        this.stompCd = S.every;
      }
      return;
    }
    if (this.act === ACT.pot) {
      const P = YAGA.pot;
      turn(4);
      if (this.actT >= P.windup) {
        // out of the little window: where they stood (blind, wherever her hand goes), and in phase 3 two more either side
        const n = P.volley[this.phase]!;
        for (let k = 0; k < n; k++) {
          let tx = this.aim.x;
          let tz = this.aim.z;
          if (k > 0) {
            const side = k === 1 ? 1 : -1;
            const dx = tx - y.x;
            const dz = tz - y.z;
            const d = Math.max(1, Math.hypot(dx, dz));
            tx += (-dz / d) * 3.2 * side;
            tz += (dx / d) * 3.2 * side;
          }
          if (this.blindT > 0) {
            tx += (rng.f() * 2 - 1) * P.wild;
            tz += (rng.f() * 2 - 1) * P.wild;
          }
          this.pots.push({ x0: y.x, z0: y.z, x1: tx, z1: tz, t: 0 });
        }
        this.act = ACT.none;
        this.potCd = P.every[this.phase]!;
      }
    }
  }

  private stompAt(y: Zombie, up: readonly (Stand & { i: number })[], reach: number, damage: number): void {
    for (const p of up) if (Math.hypot(p.x - y.x, p.z - y.z) <= reach) this.hurts.push({ i: p.i, amount: damage, x: y.x, z: y.z, knock: YAGA.stomp.knock });
  }

  private stepPots(dt: number, up: readonly (Stand & { i: number })[]): void {
    const P = YAGA.pot;
    for (let k = this.pots.length - 1; k >= 0; k--) {
      const pot = this.pots[k]!;
      pot.t += dt;
      if (pot.t < P.flight) continue;
      this.pots.splice(k, 1);
      for (const p of up) if (Math.hypot(p.x - pot.x1, p.z - pot.z1) <= P.splashR) this.hurts.push({ i: p.i, amount: P.splash, x: pot.x1, z: pot.z1, knock: 3 });
      if (this.pools.length >= 4) this.pools.shift();
      this.pools.push({ x: pot.x1, z: pot.z1, t: P.life, tick: P.tick });
    }
    for (let k = this.pools.length - 1; k >= 0; k--) {
      const pool = this.pools[k]!;
      pool.t -= dt;
      pool.tick -= dt;
      if (pool.tick <= 0) {
        pool.tick += P.tick;
        for (const p of up) if (Math.hypot(p.x - pool.x, p.z - pool.z) <= P.r) this.hurts.push({ i: p.i, amount: P.tickDamage, x: pool.x, z: pool.z, knock: 0 });
      }
      if (pool.t <= 0) this.pools.splice(k, 1);
    }
  }

  /** Pots still in the air: where from, where to, and how far along (0..1), for the screen. */
  get flying(): readonly { x0: number; z0: number; x1: number; z1: number; k: number }[] {
    return this.pots.map((p) => ({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, k: p.t / YAGA.pot.flight }));
  }

  /** The hut's next way, by phase. */
  private choose(y: Zombie, up: readonly Stand[], rng: Rng): void {
    const at = nearestNode(y.x, y.z, ALL_NODES);
    const go = (to: number, dwell: number, allowed: ReadonlySet<number> | null): void => {
      this.path = route(at, to, allowed);
      if (Math.hypot(NODES[at]!.x - y.x, NODES[at]!.z - y.z) > 0.3) this.path.unshift(at);
      this.dwell = dwell;
    };
    const R = NODE.R!;
    const onBoards = up.filter((p) => inR({ x0: DK.stage.x0, z0: DK.northWing.z0, x1: DK.apron.x1, z1: DK.southWing.z1 }, p.x, p.z));
    if (this.phase === 1) {
      // home to the revolve; then out to one of the stage's corners (toward whoever is up on the boards), and home again
      if (at !== R) return go(R, 6 + rng.f() * 3, STAGE_SET);
      const t = onBoards.length && rng.f() < 0.7 ? nearestNode(onBoards[0]!.x, onBoards[0]!.z, STAGE_NODES) : STAGE_NODES[1 + Math.floor(rng.f() * (STAGE_NODES.length - 1))]!;
      return go(t === R ? NODE.N1! : t, 3 + rng.f() * 2, STAGE_SET);
    }
    if (this.phase === 2) {
      // a round of the stalls, then home to the revolve for a while, then a turn of the stage, then the stalls again
      this.plan++;
      if (this.plan % 3 === 1) {
        this.path = at === R ? [NODE.F!] : route(at, NODE.F!, null);
        this.round = 0;
        this.dwell = 0;
        return;
      }
      if (this.plan % 3 === 2) return go(R, 7 + rng.f() * 2, null);
      const t = STAGE_NODES[1 + Math.floor(rng.f() * (STAGE_NODES.length - 1))]!;
      return go(t, 3, null);
    }
    // phase 3: after whoever is nearest, wherever the hut can go; home to the revolve now and then to catch her breath
    this.homeT += 1;
    if (this.homeT >= 3) {
      this.homeT = 0;
      return go(R, 5, null);
    }
    const p = nearestUp(up, y.x, y.z);
    const t = p ? nearestNode(p.x, p.z, ALL_NODES) : STAGE_NODES[Math.floor(rng.f() * STAGE_NODES.length)]!;
    return go(t === at ? STAGE_NODES[Math.floor(rng.f() * STAGE_NODES.length)]! : t, 1.2, null);
  }

  private walk(dt: number, y: Zombie, up: readonly Stand[], rng: Rng, s: HutScript): void {
    if (this.path.length === 0) {
      if (this.round >= 0) {
        // on a round of the stalls: the next leg of it
        this.round++;
        if (this.round < ROUND.length) {
          this.path = [ROUND[this.round]!];
          this.dwell = ROUND[this.round] === NODE.C || ROUND[this.round] === NODE.CN || ROUND[this.round] === NODE.CS ? 2.5 : 0;
        } else this.round = -1;
      }
      if (this.path.length === 0) {
        if (this.dwell > 0) {
          this.dwell -= dt;
          // standing: the hut turns to keep its little window on whoever is nearest
          const p = nearestUp(up, y.x, y.z);
          if (p) {
            const want = yawTo(y.x, y.z, p.x, p.z);
            const d = wrap(want - y.yaw);
            y.yaw = wrap(y.yaw + Math.sign(d) * Math.min(Math.abs(d), 1.6 * dt));
          }
          return;
        }
        this.choose(y, up, rng);
        if (this.path.length === 0) {
          this.dwell = 1;
          return;
        }
      }
    }
    const to = NODES[this.path[0]!]!;
    const dx = to.x - y.x;
    const dz = to.z - y.z;
    const d = Math.hypot(dx, dz);
    const v = YAGA.speed[this.phase]! * (this.blindT > 0 ? 0.6 : 1);
    if (d <= v * dt + 0.02) {
      y.x = to.x;
      y.z = to.z;
      this.path.shift();
    } else {
      y.x += (dx / d) * v * dt;
      y.z += (dz / d) * v * dt;
    }
    const want = yawTo(0, 0, dx, dz);
    const turn = wrap(want - y.yaw);
    y.yaw = wrap(y.yaw + Math.sign(turn) * Math.min(Math.abs(turn), 3.2 * dt));
    s.speed = v;
    s.mode = 'walk';
  }
}

function nearestUp<T extends Stand>(up: readonly T[], x: number, z: number): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const p of up) {
    if (!p.up) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
function far(up: readonly Stand[], c: readonly [number, number]): number {
  let d = Infinity;
  for (const p of up) d = Math.min(d, Math.hypot(p.x - c[0], p.z - c[1]));
  return d;
}

void WEST;
