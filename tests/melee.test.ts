import { describe, expect, it } from 'vitest';
import { MELEE, MELEE_IDS, MELEE_RULES, createSwing, guardedDamage, stepSwing, swingDamage, swingHand, swingProgress, swingReach, type MeleeDef, type MeleeId, type SwingEvent } from '../src/logic/melee';

const DT = 1 / 60;

/** Run the swing for `seconds`, with the trigger held for the first `hold` of them, and collect what happened when. */
function run(id: keyof typeof MELEE, seconds: number, hold: number, taps: number[] = [0]): { events: [number, SwingEvent][]; s: ReturnType<typeof createSwing> } {
  const def = MELEE[id];
  const s = createSwing();
  const events: [number, SwingEvent][] = [];
  const out: SwingEvent[] = [];
  const pending = [...taps];
  for (let t = 0; t < seconds; t += DT) {
    const pressed = pending.length > 0 && t >= pending[0]!;
    if (pressed) pending.shift();
    out.length = 0;
    stepSwing(s, def, DT, { pressed, held: t < hold }, out);
    for (const e of out) events.push([t, e]);
  }
  return { events, s };
}

// what lies about the town and what its shops sell: the eight a player meets first
const FOUND: MeleeId[] = ['knife', 'skillet', 'skiPole', 'maul', 'chain'];
const BOUGHT: MeleeId[] = ['bat', 'gloves', 'hockey'];
const COMMON: MeleeId[] = [...FOUND, ...BOUGHT];
// and the four that are built from parts or fought for
const EARNED: MeleeId[] = ['rogatina', 'fireAxe', 'serpMolot', 'shashka'];
// and the one that only comes out of Ded Moroz's sack (`tests/zaryaSack.test.ts`)
const SACK: MeleeId[] = ['kisten'];

describe('melee: the six weapons', () => {
  it('has one weapon of every type, and each has a job of its own', () => {
    const first: MeleeId[] = ['knife', 'skillet', 'skiPole', 'maul', 'gloves', 'chain'];
    expect(new Set(first.map((id) => MELEE[id].type)).size).toBe(6);
    expect(new Set(MELEE_IDS.map((id) => MELEE[id].type)).size).toBe(6);
    // the pole reaches furthest, the gloves chain longest, the maul hits hardest, the knife lands first
    const by = (k: 'reach' | 'combo' | 'heavyDamage') => [...first].sort((a, b) => MELEE[b][k] - MELEE[a][k])[0];
    expect(by('combo')).toBe('gloves');
    expect(by('heavyDamage')).toBe('maul');
    expect(MELEE.skiPole.reach).toBeGreaterThan(MELEE.knife.reach + 0.8);
    expect(MELEE.chain.arc).toBeGreaterThan(MELEE.skiPole.arc * 2);
    expect(MELEE.skillet.guard).toBeGreaterThan(MELEE.maul.guard);
  });

  it('kills an ordinary infected (100 hp) in a few light swings, never in one unless it was earned', () => {
    for (const id of MELEE_IDS) {
      const d = MELEE[id];
      if (COMMON.includes(id)) expect(d.damage).toBeLessThan(100);
      expect(Math.ceil(100 / d.damage)).toBeLessThanOrEqual(5);
      expect(d.heavyDamage).toBeGreaterThan(d.damage * 1.8);
    }
  });

  it('every weapon is in the table under its own id, with a name and a short one that fits the readout', () => {
    expect([...MELEE_IDS].sort()).toEqual([...COMMON, ...EARNED, ...SACK].sort());
    for (const id of MELEE_IDS) {
      const d = MELEE[id];
      expect(d.id).toBe(id);
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.short.length).toBeGreaterThan(0);
      expect(d.short.length).toBeLessThanOrEqual(7);
    }
    expect(new Set(MELEE_IDS.map((id) => MELEE[id].name)).size).toBe(MELEE_IDS.length);
    expect(new Set(MELEE_IDS.map((id) => MELEE[id].short)).size).toBe(MELEE_IDS.length);
  });

  it('the eight that were here first keep their numbers', () => {
    const was: Record<string, [number, number, number]> = {
      knife: [40, 90, 1.9], skillet: [48, 110, 2.0], skiPole: [42, 95, 2.9], maul: [95, 230, 2.3],
      gloves: [24, 70, 1.6], bat: [64, 150, 2.2], hockey: [56, 125, 3.0], chain: [36, 80, 3.3],
    };
    for (const id of COMMON) expect([MELEE[id].damage, MELEE[id].heavyDamage, MELEE[id].reach]).toEqual(was[id]);
  });
});

describe('melee: the four that are earned', () => {
  it('each lands, and its heavy swing does more than its light one', () => {
    for (const id of EARNED) {
      const def = MELEE[id];
      const tap = run(id, 3, 0.03);
      expect(tap.events.map((e) => e[1])).toEqual(['start', 'strike', 'end']);
      expect(tap.s.heavy).toBe(false);
      expect(swingDamage(tap.s, def)).toBe(def.damage);
      const held = run(id, 4, def.windup + def.chargeTime + 0.05);
      expect(held.events.map((e) => e[1])).toEqual(['start', 'strike', 'end']);
      expect(held.s.heavy).toBe(true);
      expect(swingDamage(held.s, def)).toBeCloseTo(def.heavyDamage, 0);
      expect(swingDamage(held.s, def)).toBeGreaterThan(swingDamage(tap.s, def));
      // and it reaches what stands in front of it, at the end of its reach
      const front = { x: 0, z: -(def.reach + 0.2), y: 0, radius: 0.32 };
      expect(swingReach(0, 0, 0, 0, def.reach, def.arc, [front], def.maxTargets).length).toBe(1);
    }
  });

  it('each is a step up from everything of its type that is found or bought', () => {
    for (const id of EARNED) {
      const d = MELEE[id];
      for (const other of COMMON) {
        const o = MELEE[other];
        if (o.type !== d.type) continue;
        expect(d.damage).toBeGreaterThan(o.damage);
        expect(d.heavyDamage).toBeGreaterThan(o.heavyDamage);
        expect(d.reach).toBeGreaterThanOrEqual(o.reach);
        expect(d.guard).toBeGreaterThanOrEqual(o.guard);
      }
    }
  });

  it('the built spear out-damages every found and bought pole, and nothing clears a crowd like it', () => {
    const spear = MELEE.rogatina;
    expect(spear.type).toBe('pole');
    for (const id of COMMON) {
      const o = MELEE[id];
      if (o.type !== 'pole') continue;
      expect(spear.damage).toBeGreaterThan(o.damage * 2);
      expect(spear.heavyDamage).toBeGreaterThan(o.heavyDamage * 2);
      expect(spear.heavyTargets).toBeGreaterThan(o.heavyTargets);
      expect(spear.reach).toBeGreaterThan(o.reach);
    }
    // its sweep strikes the most infected and deals the most damage among them, and nothing stops a charge like its
    // crossguard: the hardest push at a target's poise, light or heavy
    const sweep = (id: MeleeId): number => MELEE[id].heavyDamage * MELEE[id].heavyTargets;
    for (const id of MELEE_IDS) {
      if (id === 'rogatina') continue;
      const o = MELEE[id];
      expect(spear.heavyTargets).toBeGreaterThan(o.heavyTargets);
      expect(sweep('rogatina')).toBeGreaterThan(sweep(id) * 1.5);
      expect(spear.damage * spear.impulse).toBeGreaterThan(o.damage * o.impulse);
      expect(spear.heavyDamage * spear.heavyImpulse).toBeGreaterThan(o.heavyDamage * o.heavyImpulse);
    }
    expect(spear.heavyTargets).toBe(6);
    expect(spear.guard).toBeCloseTo(0.6);
    // six abreast are all struck by the sweep, and only the two in the middle by the thrust
    const row = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((x) => ({ x, z: -2.2, y: 0, radius: 0.32 }));
    expect(swingReach(0, 0, 0, 0, spear.reach, spear.heavyArc, row, spear.heavyTargets).length).toBe(6);
    expect(swingReach(0, 0, 0, 0, spear.reach, spear.arc, row, spear.maxTargets).map((h) => h.target.x).sort()).toEqual([-0.5, 0.5]);
  });

  it('the fire axe hits harder than the maul and is a little faster', () => {
    const axe = MELEE.fireAxe;
    const maul = MELEE.maul;
    expect(axe.type).toBe('heavy');
    const light = (d: MeleeDef): number => d.windup + d.active + d.recover;
    const heavy = (d: MeleeDef): number => d.windup + d.chargeTime + d.active + d.heavyRecover;
    expect(light(axe)).toBeLessThan(light(maul));
    expect(light(axe)).toBeGreaterThan(light(maul) * 0.8);
    expect(heavy(axe)).toBeLessThan(heavy(maul));
    expect(heavy(axe)).toBeGreaterThan(heavy(maul) * 0.8);
    expect(axe.moveMul).toBeGreaterThanOrEqual(maul.moveMul);
  });

  it('the paired one alternates: the hammer, the sickle, the hammer; and the heavy swing is the hammer', () => {
    const def = MELEE.serpMolot;
    expect(def.type).toBe('paired');
    expect(def.combo).toBe(5);
    expect(def.guard).toBeCloseTo(0.7);
    // five taps, one per swing: note whose turn each strike is
    const cycle = def.windup + def.active + def.recover * MELEE_RULES.chainRecover;
    const s = createSwing();
    const out: SwingEvent[] = [];
    const hands: string[] = [];
    let taps = 0;
    let next = 0;
    for (let t = 0; t < 3; t += DT) {
      const pressed = taps < 5 && t >= next;
      if (pressed) {
        taps++;
        next = t + cycle + 0.02;
      }
      out.length = 0;
      stepSwing(s, def, DT, { pressed, held: false }, out);
      if (out.includes('strike')) hands.push(swingHand(def, s.heavy, s.combo));
    }
    expect(hands).toEqual(['right', 'left', 'right', 'left', 'right']);
    // a wound-up swing is the right hand whichever turn it was
    for (let combo = 0; combo < def.combo; combo++) expect(swingHand(def, true, combo)).toBe('right');
    // the gloves take turns the same way, and nothing held in one hand ever swings from the left
    expect(swingHand(MELEE.gloves, false, 1)).toBe('left');
    for (const id of MELEE_IDS) {
      if (MELEE[id].type === 'paired') continue;
      for (let c = 0; c < 4; c++) expect(swingHand(MELEE[id], false, c)).toBe('right');
    }
    // it chains as long as the gloves, and each blow lands nearly twice as hard
    expect(def.damage).toBeGreaterThan(MELEE.gloves.damage * 1.8);
  });

  it('the shashka: one clean cut kills, and the wound-up one goes through two', () => {
    const def = MELEE.shashka;
    expect(def.type).toBe('blade');
    expect(def.damage).toBeGreaterThanOrEqual(100);
    expect(def.heavyTargets).toBe(2);
    expect(def.reach).toBeCloseTo(2.4);
    // fast: as quick as the knife to within a breath, though it is four times the blade
    const light = (id: MeleeId): number => MELEE[id].windup + MELEE[id].active + MELEE[id].recover;
    expect(light('shashka')).toBeLessThan(light('knife') * 1.15);
    const near = [-0.35, 0.35].map((x) => ({ x, z: -1.6, y: 0, radius: 0.32 }));
    const three = [...near, { x: 0, z: -4, y: 0, radius: 0.32 }, { x: 1.2, z: -1.2, y: 0, radius: 0.32 }];
    expect(swingReach(0, 0, 0, 0, def.reach, def.heavyArc, three, def.heavyTargets).length).toBe(2);
  });
});

describe('melee: the swing', () => {
  it('a tap lands after the wind-up and is over after the recovery', () => {
    const { events, s } = run('knife', 1.2, 0.03);
    expect(events.map((e) => e[1])).toEqual(['start', 'strike', 'end']);
    const strike = events[1]![0];
    expect(strike).toBeGreaterThanOrEqual(MELEE.knife.windup - DT);
    expect(strike).toBeLessThan(MELEE.knife.windup + 3 * DT);
    expect(s.phase).toBe('idle');
    expect(s.heavy).toBe(false);
  });

  it('a hold winds up a heavy swing, let go on release', () => {
    const def = MELEE.maul;
    const hold = def.windup + def.chargeTime + 0.05;
    const { events, s } = run('maul', 3, hold);
    const strike = events.find((e) => e[1] === 'strike')!;
    expect(strike[0]).toBeGreaterThanOrEqual(hold - 2 * DT);
    expect(s.heavy).toBe(true);
    expect(swingDamage(s, def)).toBeCloseTo(def.heavyDamage, 0);
  });

  it('a short hold is still a light swing, and a part-wound one lands in between', () => {
    const def = MELEE.maul;
    const short = run('maul', 2, def.windup + def.chargeTime * 0.3);
    expect(short.s.heavy).toBe(false);
    expect(swingDamage(short.s, def)).toBe(def.damage);
    const part = run('maul', 2, def.windup + def.chargeTime * 0.7);
    expect(part.s.heavy).toBe(true);
    const dmg = swingDamage(part.s, def);
    expect(dmg).toBeGreaterThan(def.damage);
    expect(dmg).toBeLessThan(def.heavyDamage);
  });

  it('a held button never sticks: the heavy swing goes by itself', () => {
    const def = MELEE.skillet;
    const { events } = run('skillet', 4, 99);
    const strike = events.find((e) => e[1] === 'strike')!;
    expect(strike[0]).toBeLessThan(def.windup + def.chargeTime + MELEE_RULES.holdMax + 3 * DT);
  });

  it('taps chain into a combo, and each chained swing recovers faster than the last one', () => {
    const def = MELEE.gloves;
    // one tap per swing: the buffer remembers a single tap, not a queue of them
    const cycle = def.windup + def.active + def.recover * MELEE_RULES.chainRecover;
    const taps = [0, 1, 2, 3, 4].map((i) => i * (cycle + 0.02));
    const { events } = run('gloves', 3, 0, taps);
    const strikes = events.filter((e) => e[1] === 'strike').map((e) => e[0]);
    expect(strikes.length).toBe(5);
    const gap = strikes[1]! - strikes[0]!;
    expect(gap).toBeLessThan(def.windup + def.active + def.recover);
    // a tap during a swing is remembered rather than lost
    const two = run('knife', 2, 0, [0, 0.12]);
    expect(two.events.filter((e) => e[1] === 'strike').length).toBe(2);
  });

  it('reports its progress from 0 to 1 for whoever draws it', () => {
    const def = MELEE.knife;
    const s = createSwing();
    const out: SwingEvent[] = [];
    let last = 0;
    stepSwing(s, def, DT, { pressed: true, held: false }, out);
    for (let i = 0; i < 200 && s.phase !== 'idle'; i++) {
      const p = swingProgress(s, def);
      expect(p).toBeGreaterThanOrEqual(last - 1e-6);
      expect(p).toBeLessThanOrEqual(1);
      last = p;
      stepSwing(s, def, DT, { pressed: false, held: false }, out);
    }
    expect(last).toBeGreaterThan(0.9);
  });
});

describe('melee: who a swing reaches', () => {
  const z = (x: number, zz: number, y = 0) => ({ x, z: zz, y, radius: 0.32 });

  it('reaches what is in front and in range, not what is behind or too far', () => {
    // yaw 0 looks along -Z
    const front = z(0, -1.5);
    const behind = z(0, 1.5);
    const far = z(0, -4);
    const hits = swingReach(0, 0, 0, 0, MELEE.knife.reach, MELEE.knife.arc, [behind, far, front], 3);
    expect(hits.map((h) => h.target)).toEqual([front]);
  });

  it('a narrow thrust misses what a wide sweep catches', () => {
    const side = z(-1.2, -1.2);
    expect(swingReach(0, 0, 0, 0, 3, MELEE.skiPole.arc, [side], 4).length).toBe(0);
    expect(swingReach(0, 0, 0, 0, 3, MELEE.skiPole.heavyArc, [side], 4).length).toBe(1);
  });

  it('takes the middle of the swing first and stops at the weapon\'s limit', () => {
    const mid = z(0, -1.8);
    const left = z(-0.9, -1.4);
    const right = z(0.9, -1.4);
    const hits = swingReach(0, 0, 0, 0, MELEE.maul.reach, MELEE.maul.arc, [left, right, mid], 2);
    expect(hits.length).toBe(2);
    expect(hits[0]!.target).toBe(mid);
  });

  it('follows the player\'s yaw and ignores another floor', () => {
    const west = z(-1.5, 0);
    expect(swingReach(0, 0, 0, Math.PI / 2, 2, 0.5, [west], 1).length).toBe(1);
    expect(swingReach(0, 0, 0, 0, 2, 0.5, [west], 1).length).toBe(0);
    expect(swingReach(0, 0, 0, 0, 2, 0.5, [z(0, -1.2, 3.2)], 1).length).toBe(0);
  });
});

describe('melee: the guard', () => {
  it('stops its share of a blow from the front only', () => {
    const def = MELEE.skillet;
    expect(guardedDamage(20, def, true, 0, 0, 0, 0, -1)).toBeCloseTo(20 * (1 - def.guard));
    expect(guardedDamage(20, def, true, 0, 0, 0, 0, 1)).toBe(20);
    expect(guardedDamage(20, def, false, 0, 0, 0, 0, -1)).toBe(20);
  });

  it('does nothing with a weapon that cannot guard', () => {
    expect(guardedDamage(20, MELEE.knife, true, 0, 0, 0, 0, -1)).toBe(20);
    expect(guardedDamage(20, null, true, 0, 0, 0, 0, -1)).toBe(20);
  });
});
