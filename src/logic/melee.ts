/**
 * Melee: the weapons a player swings, as pure rules. Six types, each with a job of its own (ZARYA's plan): a blade that
 * is fast, a blunt thing that staggers, a pole that reaches, a heavy thing that cleaves, a pair that chains, a flail
 * that sweeps wide. Eight are found lying about or bought, four are earned (built from parts, or the prize of a long
 * errand) and hit like it, and one comes only out of Ded Moroz's sack. This file holds the numbers, the swing's timeline (a tap is a light swing, a hold
 * winds up a heavy one, taps chain into a combo), who a swing reaches, and what a guard stops. No drawing, no sound,
 * no game objects: `weapons/meleeSystem.ts` runs it against the world.
 */

export type MeleeType = 'blade' | 'blunt' | 'pole' | 'heavy' | 'paired' | 'flail';
export type MeleeId = 'knife' | 'skillet' | 'skiPole' | 'maul' | 'gloves' | 'chain' | 'bat' | 'hockey' | 'rogatina' | 'fireAxe' | 'serpMolot' | 'shashka' | 'kisten';

export interface MeleeDef {
  id: MeleeId;
  name: string;
  short: string;
  type: MeleeType;
  /** Body damage of a light swing and of a fully wound heavy one. */
  damage: number;
  heavyDamage: number;
  /** How far the swing reaches from the player's centre to the target's surface, in metres. */
  reach: number;
  /** Half-angle of the swing either side of where the player looks, in radians (light and heavy). */
  arc: number;
  heavyArc: number;
  /** Light swing, in seconds: the wind-up before it lands, how long it stays out, and the recovery after. */
  windup: number;
  active: number;
  recover: number;
  /** Heavy swing: how long the hold takes to wind fully, and the recovery after it lands. */
  chargeTime: number;
  heavyRecover: number;
  /** How many infected one swing can strike. */
  maxTargets: number;
  heavyTargets: number;
  /** How hard a hit pushes at a target's poise (1 = like a bullet of the same damage). */
  impulse: number;
  heavyImpulse: number;
  /** The shove and lift given to a body it kills. */
  push: number;
  lift: number;
  /** Damage multiplier when the crosshair was on the head. */
  headMul: number;
  /** Share of a frontal blow a guard stops (0 = this weapon cannot guard). */
  guard: number;
  /** Walking speed multiplier while it is in hand. */
  moveMul: number;
  /** Light swings that chain before the full recovery is owed. */
  combo: number;
  /** A flail's weight wraps their legs: each it strikes and does not kill trips, down this long (a heavy swing longer; never a boss). */
  trip?: number;
}

export const MELEE: Record<MeleeId, MeleeDef> = {
  knife: {
    id: 'knife', name: 'FOLDING KNIFE', short: 'KNIFE', type: 'blade',
    damage: 40, heavyDamage: 90, reach: 1.9, arc: 0.5, heavyArc: 0.45,
    windup: 0.1, active: 0.12, recover: 0.24, chargeTime: 0.45, heavyRecover: 0.4,
    maxTargets: 1, heavyTargets: 1, impulse: 0.6, heavyImpulse: 1.5, push: 1.5, lift: 0.5,
    headMul: 1.6, guard: 0, moveMul: 1, combo: 3,
  },
  skillet: {
    id: 'skillet', name: 'CAST-IRON SKILLET', short: 'SKILLET', type: 'blunt',
    damage: 48, heavyDamage: 110, reach: 2.0, arc: 0.75, heavyArc: 0.85,
    windup: 0.16, active: 0.14, recover: 0.32, chargeTime: 0.55, heavyRecover: 0.5,
    maxTargets: 2, heavyTargets: 2, impulse: 1.6, heavyImpulse: 3, push: 4, lift: 1,
    headMul: 1.4, guard: 0.8, moveMul: 0.96, combo: 2,
  },
  skiPole: {
    id: 'skiPole', name: 'SKI POLE', short: 'POLE', type: 'pole',
    damage: 42, heavyDamage: 95, reach: 2.9, arc: 0.3, heavyArc: 1.1,
    windup: 0.14, active: 0.12, recover: 0.28, chargeTime: 0.5, heavyRecover: 0.5,
    maxTargets: 1, heavyTargets: 4, impulse: 1, heavyImpulse: 2.2, push: 3, lift: 0.5,
    headMul: 1.5, guard: 0.35, moveMul: 0.98, combo: 3,
  },
  maul: {
    id: 'maul', name: 'SPLITTING MAUL', short: 'MAUL', type: 'heavy',
    damage: 95, heavyDamage: 230, reach: 2.3, arc: 0.9, heavyArc: 1.0,
    windup: 0.32, active: 0.16, recover: 0.5, chargeTime: 0.7, heavyRecover: 0.7,
    maxTargets: 3, heavyTargets: 4, impulse: 3, heavyImpulse: 6, push: 7, lift: 2,
    headMul: 1.3, guard: 0.4, moveMul: 0.88, combo: 1,
  },
  gloves: {
    id: 'gloves', name: 'BOXING GLOVES', short: 'GLOVES', type: 'paired',
    damage: 24, heavyDamage: 70, reach: 1.6, arc: 0.6, heavyArc: 0.6,
    windup: 0.06, active: 0.08, recover: 0.12, chargeTime: 0.4, heavyRecover: 0.36,
    maxTargets: 1, heavyTargets: 1, impulse: 0.9, heavyImpulse: 2.5, push: 2, lift: 0.4,
    headMul: 1.5, guard: 0.6, moveMul: 1.04, combo: 5,
  },
  // bought at the Univermag's sports counter: a step up from what is found lying about
  bat: {
    id: 'bat', name: 'BASEBALL BAT', short: 'BAT', type: 'blunt',
    damage: 64, heavyDamage: 150, reach: 2.2, arc: 0.8, heavyArc: 0.9,
    windup: 0.16, active: 0.14, recover: 0.3, chargeTime: 0.55, heavyRecover: 0.5,
    maxTargets: 2, heavyTargets: 3, impulse: 2.2, heavyImpulse: 4.2, push: 5.5, lift: 1.4,
    headMul: 1.5, guard: 0.5, moveMul: 0.97, combo: 3,
  },
  hockey: {
    id: 'hockey', name: 'HOCKEY STICK', short: 'STICK', type: 'pole',
    damage: 56, heavyDamage: 125, reach: 3.0, arc: 0.45, heavyArc: 1.2,
    windup: 0.15, active: 0.13, recover: 0.28, chargeTime: 0.5, heavyRecover: 0.5,
    maxTargets: 2, heavyTargets: 5, impulse: 1.5, heavyImpulse: 3.2, push: 4.5, lift: 0.8,
    headMul: 1.5, guard: 0.5, moveMul: 0.98, combo: 3,
  },
  chain: {
    id: 'chain', name: 'DOG CHAIN', short: 'CHAIN', type: 'flail',
    damage: 36, heavyDamage: 80, reach: 3.3, arc: 1.0, heavyArc: 1.3,
    windup: 0.2, active: 0.16, recover: 0.34, chargeTime: 0.6, heavyRecover: 0.55,
    maxTargets: 3, heavyTargets: 5, impulse: 1.2, heavyImpulse: 2.4, push: 3.5, lift: 0.6,
    headMul: 1.2, guard: 0, moveMul: 0.97, combo: 2,
  },
  // out of Ded Moroz's sack only (`config.ts`: `MYSTERY_BOX.mapPrizes`): the old Russian kisten, an iron weight on a
  // chain on a short handle. Twice the dog chain's blow, a touch more reach, and the weight wraps the legs of what it
  // does not kill, so the front of a crowd goes down
  kisten: {
    id: 'kisten', name: 'KISTEN FLAIL', short: 'KISTEN', type: 'flail',
    damage: 72, heavyDamage: 165, reach: 3.4, arc: 1.0, heavyArc: 1.3,
    windup: 0.2, active: 0.16, recover: 0.32, chargeTime: 0.6, heavyRecover: 0.55,
    maxTargets: 3, heavyTargets: 5, impulse: 2, heavyImpulse: 4, push: 4.5, lift: 0.9,
    headMul: 1.3, guard: 0, moveMul: 0.97, combo: 2, trip: 0.9,
  },
  // the four that are earned: each is a clear step up from everything of its type that is found or bought
  // the red fire axe: the maul's cleave, a little faster, and it comes back the other way
  fireAxe: {
    id: 'fireAxe', name: 'FIRE AXE', short: 'AXE', type: 'heavy',
    damage: 110, heavyDamage: 260, reach: 2.4, arc: 0.9, heavyArc: 1.0,
    windup: 0.29, active: 0.16, recover: 0.46, chargeTime: 0.64, heavyRecover: 0.64,
    maxTargets: 3, heavyTargets: 4, impulse: 3, heavyImpulse: 6, push: 7, lift: 2,
    headMul: 1.4, guard: 0.4, moveMul: 0.9, combo: 2,
  },
  // a sickle in the left hand and a hammer in the right: they take turns as fast as fists, and the hammer comes down
  // overhead for the heavy one
  serpMolot: {
    id: 'serpMolot', name: 'SERP AND MOLOT', short: 'SICKLE', type: 'paired',
    damage: 46, heavyDamage: 120, reach: 1.8, arc: 0.65, heavyArc: 0.6,
    windup: 0.07, active: 0.09, recover: 0.15, chargeTime: 0.42, heavyRecover: 0.4,
    maxTargets: 1, heavyTargets: 1, impulse: 1.1, heavyImpulse: 3.5, push: 2.5, lift: 0.6,
    headMul: 1.5, guard: 0.7, moveMul: 1.02, combo: 5,
  },
  // the reward of a long errand: one clean cut kills an ordinary infected, and the wound-up one goes through two
  shashka: {
    id: 'shashka', name: 'COSSACK SHASHKA', short: 'SHASHKA', type: 'blade',
    damage: 150, heavyDamage: 320, reach: 2.4, arc: 0.6, heavyArc: 0.75,
    windup: 0.11, active: 0.12, recover: 0.25, chargeTime: 0.45, heavyRecover: 0.42,
    maxTargets: 1, heavyTargets: 2, impulse: 1.2, heavyImpulse: 2.6, push: 2.5, lift: 0.6,
    headMul: 1.6, guard: 0.3, moveMul: 1, combo: 3,
  },
  // built at the workbench from a hunting blade, a shaft and a crossguard, and the strongest thing to swing at a
  // crowd: the thrust goes through two, the sweep strikes six, and whatever charges onto the crossguard stops there
  rogatina: {
    id: 'rogatina', name: 'ROGATINA BEAR SPEAR', short: 'SPEAR', type: 'pole',
    damage: 120, heavyDamage: 300, reach: 3.3, arc: 0.4, heavyArc: 1.25,
    windup: 0.16, active: 0.13, recover: 0.3, chargeTime: 0.55, heavyRecover: 0.55,
    maxTargets: 2, heavyTargets: 6, impulse: 4, heavyImpulse: 7, push: 6, lift: 1,
    headMul: 1.5, guard: 0.6, moveMul: 0.96, combo: 3,
  },
};

export const MELEE_IDS = Object.keys(MELEE) as MeleeId[];

/** The rules that are the same for every weapon. */
export const MELEE_RULES = {
  /** A hold shorter than this share of the wind is still a light swing. */
  heavyAt: 0.5,
  /** A fully wound heavy swing is let go by itself after this long, so a held button never sticks. */
  holdMax: 0.6,
  /** A tap this soon before the swing is over is remembered and starts the next one. */
  buffer: 0.3,
  /** With no swing for this long the combo starts again. */
  comboReset: 0.8,
  /** A chained light swing recovers this much faster than the last one of the combo. */
  chainRecover: 0.55,
  /** Targets more than this far above or below the player's feet are out of a swing's reach. */
  step: 1.5,
  /** A guard only covers blows from within this angle of where the player faces, in radians. */
  guardCone: 1.15,
  /** Striking an infected while it winds up its own blow staggers it for this long, and hits this much harder. */
  parryStagger: 1.1,
  parryMul: 1.5,
} as const;

// ---------------------------------------------------------------------------------------------
// the swing
// ---------------------------------------------------------------------------------------------

export type SwingPhase = 'idle' | 'windup' | 'charge' | 'active' | 'recover';

export interface SwingState {
  phase: SwingPhase;
  /** Seconds into the current phase. */
  t: number;
  /** The swing in flight (or just landed) is a heavy one. */
  heavy: boolean;
  /** How far a heavy swing is wound, 0..1. */
  charge: number;
  /** Which swing of the combo this is, from 0. */
  combo: number;
  /** Seconds since the last swing ended. */
  idleT: number;
  /** A tap remembered for when this swing is over. */
  buffered: number;
}

export interface SwingInput {
  pressed: boolean;
  held: boolean;
}

/** What happened in one step: a swing began, it landed (resolve who it hits now), it ended. */
export type SwingEvent = 'start' | 'strike' | 'end';

export function createSwing(): SwingState {
  return { phase: 'idle', t: 0, heavy: false, charge: 0, combo: 0, idleT: 99, buffered: 0 };
}

export function resetSwing(s: SwingState): void {
  s.phase = 'idle';
  s.t = 0;
  s.heavy = false;
  s.charge = 0;
  s.combo = 0;
  s.idleT = 99;
  s.buffered = 0;
}

/** How long the recovery of the swing that just landed is. */
export function recoverTime(s: SwingState, def: MeleeDef): number {
  if (s.heavy) return def.heavyRecover;
  return s.combo + 1 < def.combo ? def.recover * MELEE_RULES.chainRecover : def.recover;
}

/** Advance the swing by `dt`. Events are pushed onto `out` in the order they happened. */
export function stepSwing(s: SwingState, def: MeleeDef, dt: number, input: SwingInput, out: SwingEvent[]): void {
  if (input.pressed) s.buffered = MELEE_RULES.buffer;
  else s.buffered = Math.max(0, s.buffered - dt);

  if (s.phase === 'idle') {
    s.idleT += dt;
    if (s.idleT > MELEE_RULES.comboReset) s.combo = 0;
    if (s.buffered > 0) {
      s.buffered = 0;
      s.phase = 'windup';
      s.t = 0;
      s.heavy = false;
      s.charge = 0;
      out.push('start');
    }
    return;
  }

  s.t += dt;
  if (s.phase === 'windup') {
    if (s.t < def.windup) return;
    // still holding at the top of the wind-up: keep winding for a heavy one
    if (input.held) {
      s.phase = 'charge';
      s.t = 0;
      return;
    }
    strike(s, out);
    return;
  }
  if (s.phase === 'charge') {
    s.charge = Math.min(1, s.t / def.chargeTime);
    const over = s.t >= def.chargeTime + MELEE_RULES.holdMax;
    if (input.held && !over) return;
    s.heavy = s.charge >= MELEE_RULES.heavyAt;
    strike(s, out);
    return;
  }
  if (s.phase === 'active') {
    if (s.t < def.active) return;
    s.phase = 'recover';
    s.t = 0;
    return;
  }
  // recover
  if (s.t < recoverTime(s, def)) return;
  const chained = !s.heavy && s.combo + 1 < def.combo;
  s.combo = chained ? s.combo + 1 : 0;
  s.phase = 'idle';
  s.t = 0;
  s.idleT = 0;
  out.push('end');
  if (s.buffered > 0) {
    s.buffered = 0;
    s.phase = 'windup';
    s.heavy = false;
    s.charge = 0;
    out.push('start');
  }
}

function strike(s: SwingState, out: SwingEvent[]): void {
  s.phase = 'active';
  s.t = 0;
  // a tap never carries an old swing's buffer into a second swing by itself
  s.buffered = 0;
  out.push('strike');
}

/** Damage of the swing that just landed (a part-wound heavy swing lands between the two). */
export function swingDamage(s: SwingState, def: MeleeDef): number {
  if (!s.heavy) return def.damage;
  const k = (s.charge - MELEE_RULES.heavyAt) / (1 - MELEE_RULES.heavyAt);
  return def.damage + (def.heavyDamage - def.damage) * (0.6 + 0.4 * Math.max(0, Math.min(1, k)));
}

/** Which hand throws a swing: a pair takes turns, the right hand first, and its wound-up swing is always the right. */
export function swingHand(def: MeleeDef, heavy: boolean, combo: number): 'right' | 'left' {
  return def.type === 'paired' && !heavy && combo % 2 === 1 ? 'left' : 'right';
}

/** 0..1 through the whole swing (wind-up, strike, recovery), for whoever draws it. */
export function swingProgress(s: SwingState, def: MeleeDef): number {
  const rec = recoverTime(s, def);
  switch (s.phase) {
    case 'windup':
      return (Math.min(1, s.t / def.windup) * 0.3);
    case 'charge':
      return 0.3;
    case 'active':
      return 0.3 + Math.min(1, s.t / def.active) * 0.25;
    case 'recover':
      return 0.55 + Math.min(1, s.t / rec) * 0.45;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------------------------
// who a swing reaches
// ---------------------------------------------------------------------------------------------

export interface MeleeTarget {
  x: number;
  z: number;
  /** Height of the floor it stands on. */
  y: number;
}

/** How wide a target is, when it does not say so itself. */
const radiusOfTarget = (t: MeleeTarget): number => (t as { radius?: number }).radius ?? 0.32;

export interface SwingHit<T> {
  target: T;
  /** Distance from the player's centre to the target's surface. */
  dist: number;
  /** Angle between where the player looks and the target, in radians. */
  off: number;
}

/**
 * The targets a swing from (px, pz), feet at `py`, looking along `yaw`, reaches: within `reach` of their surface and
 * inside the arc (a wide body counts when any of it is), nearest to the middle of the swing first, at most `max`.
 * Yaw is the game's: 0 looks along -Z, and it grows turning left. `radiusOf` says how wide a target is (its own
 * `radius` when it has one).
 */
export function swingReach<T extends MeleeTarget>(px: number, py: number, pz: number, yaw: number, reach: number, arc: number, targets: readonly T[], max: number, out: SwingHit<T>[] = [], radiusOf: (t: T) => number = radiusOfTarget): SwingHit<T>[] {
  out.length = 0;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  for (const t of targets) {
    if (Math.abs(t.y - py) > MELEE_RULES.step) continue;
    const dx = t.x - px;
    const dz = t.z - pz;
    const centre = Math.hypot(dx, dz);
    const radius = radiusOf(t);
    const dist = Math.max(0, centre - radius);
    if (dist > reach) continue;
    // standing inside it: always in the arc
    let off = 0;
    if (centre > 1e-4) {
      const cos = Math.max(-1, Math.min(1, (dx * fx + dz * fz) / centre));
      off = Math.max(0, Math.acos(cos) - Math.atan2(radius, centre));
    }
    if (off > arc) continue;
    out.push({ target: t, dist, off });
  }
  // the middle of the swing lands first; among those, the nearest
  out.sort((a, b) => a.off - b.off + (a.dist - b.dist) * 0.25);
  if (out.length > max) out.length = max;
  return out;
}

// ---------------------------------------------------------------------------------------------
// the guard
// ---------------------------------------------------------------------------------------------

/**
 * What is left of a blow of `amount` when the player guards with `def`: nothing changes unless they are guarding and
 * the attacker at (ax, az) is in front of them.
 */
export function guardedDamage(amount: number, def: MeleeDef | null, guarding: boolean, px: number, pz: number, yaw: number, ax: number, az: number): number {
  if (!def || !guarding || def.guard <= 0) return amount;
  const dx = ax - px;
  const dz = az - pz;
  const d = Math.hypot(dx, dz);
  if (d > 1e-4) {
    const cos = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / d;
    if (Math.acos(Math.max(-1, Math.min(1, cos))) > MELEE_RULES.guardCone) return amount;
  }
  return amount * (1 - def.guard);
}
