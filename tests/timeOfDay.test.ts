/**
 * The Asylum's day and night: the phase boundaries and blends, the infected's phase multiplier on top of the
 * difficulty, the Matron's hunt that only opens at night, and a mission clock that always leaves room to finish.
 */
import { describe, expect, it } from 'vitest';
import { ASYLUM_CLOCK, ASYLUM_CYCLE, DAWN_RELIEF, FOG, LANTERNS, NIGHTFALL, PHASE_TUNING, TUNING } from '../src/asylum/nightConfig';
import { asylumHour, asylumTuning, bellReady, damperOpen, fogAt, huntClock, lanternFor, lanternLit, lanternsLit, STEPS, storyStep } from '../src/asylum/story';
import { FORGE_STORY, MISSION, ZOMBIE_DIFFICULTY } from '../src/config';
import { ZombieManager } from '../src/enemies/zombieManager';
import { activateDefense, completeHunt, createDefense, createHunt, updateDefense } from '../src/logic/contracts';
import { callExtraction, createExtraction, unlockExtraction, updateExtraction } from '../src/logic/extraction';
import { deadlineRemaining, escalationPhase, missionClock, surgeStartTime } from '../src/logic/mission';
import { Rng } from '../src/logic/rng';
import { combineTuning, dawnStart, gateHunt, huntOpen, IDENTITY_TUNING, phaseTuning, timeOfDay } from '../src/logic/timeOfDay';
import { createNullRigFactory } from '../src/sim/nullRig';
import type { Level } from '../src/world/level';

const { dayEnd, duskLength, dawnLength } = ASYLUM_CYCLE;

describe('time of day', () => {
  it('runs day, dusk, night in order with clean boundaries', () => {
    expect(NIGHTFALL).toBe(dayEnd + duskLength);
    expect(timeOfDay(0).phase).toBe('day');
    expect(timeOfDay(dayEnd - 0.01).phase).toBe('day');
    expect(timeOfDay(dayEnd).phase).toBe('dusk');
    expect(timeOfDay(NIGHTFALL - 0.01).phase).toBe('dusk');
    expect(timeOfDay(NIGHTFALL).phase).toBe('night');
    expect(timeOfDay(ASYLUM_CLOCK.deadline + 500).phase).toBe('night');
    // a late afternoon of five to six minutes, a short dusk
    expect(dayEnd).toBeGreaterThanOrEqual(300);
    expect(dayEnd).toBeLessThanOrEqual(360);
    expect(duskLength).toBeGreaterThanOrEqual(30);
  });

  it('darkens smoothly through dusk and counts down to nightfall', () => {
    expect(timeOfDay(10).dark).toBe(0);
    expect(timeOfDay(NIGHTFALL).dark).toBe(1);
    let prev = -1;
    for (let e = dayEnd; e <= NIGHTFALL; e += 2) {
      const d = timeOfDay(e).dark;
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    expect(timeOfDay(dayEnd + duskLength / 2).dark).toBeCloseTo(0.5, 5);
    expect(timeOfDay(0).next).toBe(NIGHTFALL);
    expect(timeOfDay(dayEnd + 10).next).toBeCloseTo(duskLength - 10, 6);
    expect(timeOfDay(NIGHTFALL + 5).next).toBe(-1);
  });

  it('has the sun up by day and the moon by night, as unit directions', () => {
    for (const e of [0, 120, dayEnd - 1, dayEnd + 5]) {
      const t = timeOfDay(e);
      expect(Math.hypot(t.sunDir.x, t.sunDir.y, t.sunDir.z)).toBeCloseTo(1, 6);
      expect(t.sunDir.y).toBeGreaterThan(0);
      expect(t.sun).toBe(1);
    }
    expect(timeOfDay(NIGHTFALL - 0.5).sun).toBeLessThan(0.05);
    expect(timeOfDay(NIGHTFALL + 30).sun).toBe(0);
  });

  it('turns to dawn when the bird is called, never before nightfall', () => {
    const called = 600;
    expect(timeOfDay(called - 1, called).phase).toBe('night');
    expect(timeOfDay(called, called).phase).toBe('dawn');
    expect(timeOfDay(called + dawnLength / 2, called).t).toBeCloseTo(0.5, 6);
    const first = timeOfDay(called + dawnLength + 5, called);
    expect(first.t).toBe(1);
    expect(first.dark).toBeCloseTo(1 - DAWN_RELIEF, 6);
    expect(first.sun).toBe(1);
    // a call by day (not possible in play: it needs the Matron dead) still waits for the night to have fallen
    expect(dawnStart(100)).toBe(NIGHTFALL);
    expect(timeOfDay(150, 100).phase).toBe('day');
    // first light lands with the helicopter
    expect(dawnLength).toBe(MISSION.extraction.countdown);
  });
});

describe('the infected by day and by night', () => {
  it('are sleepier by day and more, faster and sharper at night', () => {
    const d = phaseTuning(timeOfDay(30));
    const n = phaseTuning(timeOfDay(NIGHTFALL + 30));
    expect(d).toEqual(PHASE_TUNING.day);
    expect(n).toEqual(PHASE_TUNING.night);
    expect(d.count).toBeLessThan(1);
    expect(d.speed).toBeLessThan(1);
    expect(n.count).toBeGreaterThan(1);
    expect(n.speed).toBeGreaterThan(1);
    expect(n.sight).toBeGreaterThan(d.sight);
    const mid = phaseTuning(timeOfDay(dayEnd + duskLength / 2));
    expect(mid.speed).toBeGreaterThan(d.speed);
    expect(mid.speed).toBeLessThan(n.speed);
  });

  it('multiply the difficulty instead of replacing it', () => {
    for (const base of Object.values(ZOMBIE_DIFFICULTY)) {
      const c = combineTuning(base, PHASE_TUNING.night);
      expect(c.label).toBe(base.label);
      expect(c.count).toBeCloseTo(base.count * PHASE_TUNING.night.count, 9);
      expect(c.speed).toBeCloseTo(base.speed * PHASE_TUNING.night.speed, 9);
      expect(c.damage).toBeCloseTo(base.damage * PHASE_TUNING.night.damage, 9);
      expect(c.sight).toBeCloseTo(base.sight * PHASE_TUNING.night.sight, 9);
      expect(combineTuning(base, IDENTITY_TUNING)).toEqual(base);
    }
  });

  it('are combined by the zombie manager, which keeps the difficulty and rescales the living at nightfall', () => {
    const level = { data: { bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 } } } as unknown as Level;
    const zm = new ZombieManager(createNullRigFactory(), level);
    const rng = new Rng(7);
    zm.tuning = ZOMBIE_DIFFICULTY.hard;
    expect(zm.tuning).toEqual(ZOMBIE_DIFFICULTY.hard); // no phase: identity
    zm.setPhaseTuning(PHASE_TUNING.day);
    expect(zm.tuning.count).toBeCloseTo(ZOMBIE_DIFFICULTY.hard.count * PHASE_TUNING.day.count, 9);
    const z = zm.spawn('shambler', 0, 0, rng);
    const daySpeed = z.speedScale;
    const daySight = z.sightScale;
    zm.setPhaseTuning(PHASE_TUNING.night);
    expect(zm.tuning.count).toBeCloseTo(ZOMBIE_DIFFICULTY.hard.count * PHASE_TUNING.night.count, 9);
    expect(z.speedScale).toBeCloseTo((daySpeed * PHASE_TUNING.night.speed) / PHASE_TUNING.day.speed, 9);
    expect(z.sightScale).toBeCloseTo((daySight * PHASE_TUNING.night.sight) / PHASE_TUNING.day.sight, 9);
    // a new difficulty keeps the hour
    zm.tuning = ZOMBIE_DIFFICULTY.easy;
    expect(zm.tuning.count).toBeCloseTo(ZOMBIE_DIFFICULTY.easy.count * PHASE_TUNING.night.count, 9);
    expect(zm.tuning.label).toBe(ZOMBIE_DIFFICULTY.easy.label);
  });
});

describe('the Matron keeps night hours', () => {
  it('opens her hunt only at nightfall, once, and never reopens a finished one', () => {
    const h = createHunt();
    expect(gateHunt(h, 0)).toBe(false);
    expect(h.status).toBe('available');
    for (let e = 0; e < NIGHTFALL; e += 7) {
      expect(huntOpen(e)).toBe(false);
      expect(gateHunt(h, e)).toBe(false);
      expect(h.status).toBe('available');
    }
    expect(huntOpen(NIGHTFALL)).toBe(true);
    expect(gateHunt(h, NIGHTFALL)).toBe(true);
    expect(h.status).toBe('active');
    expect(gateHunt(h, NIGHTFALL + 1)).toBe(false);
    completeHunt(h);
    expect(gateHunt(h, 0)).toBe(false);
    expect(h.status).toBe('complete');
  });
});

describe('the Asylum clock', () => {
  it('is the Asylum only; the other maps keep the standard clock', () => {
    expect(missionClock('asylum')).toBe(ASYLUM_CLOCK);
    expect(missionClock('district')).toBe(MISSION);
    expect(missionClock('forge')).toBe(FORGE_STORY.clock); // the Forge's longer night
    expect(escalationPhase(0, ASYLUM_CLOCK)).toBe(0);
    expect(escalationPhase(1e5, ASYLUM_CLOCK)).toBe(3);
  });

  it('has no deadline and no spreading front: the black fog comes in waves instead', () => {
    const c = ASYLUM_CLOCK;
    expect(c.deadline).toBe(Infinity);
    expect(deadlineRemaining(1e6, c)).toBe(Infinity);
    expect(surgeStartTime(null, c)).toBe(Infinity);
  });

  it('is night from the first second; the dawn comes only with the bird', () => {
    for (const e of [0, 1, 60, 600, 6000]) expect(asylumHour(e, null).phase).toBe('night');
    expect(asylumHour(100, 40).phase).toBe('dawn');
    expect(asylumHour(40 + ASYLUM_CYCLE.dawnLength + 1, 40).t).toBe(1);
    // restless until the bell, the full night after it
    expect(asylumTuning(asylumHour(10, null), false)).toBe(TUNING.restless);
    expect(asylumTuning(asylumHour(10, null), true)).toBe(TUNING.awake);
    expect(TUNING.awake.count).toBeGreaterThan(TUNING.restless.count);
    // the hunt opens with the bell, not with the clock
    expect(huntClock(null)).toBeLessThan(NIGHTFALL);
    expect(huntClock(123)).toBe(NIGHTFALL);
  });

  it('lights a vigil lantern with the kills beside it, on its own floor only', () => {
    const souls = LANTERNS.spots.map(() => 0);
    const [cem, nine] = LANTERNS.spots;
    expect(lanternFor(souls, cem!.x + 2, 0, cem!.z + 1)).toBe(0);
    expect(lanternFor(souls, cem!.x + LANTERNS.radius + 1, 0, cem!.z)).toBe(-1);
    // keeping vigil: a player beside the lantern, the squad's kill out in the approach, still feeds it
    expect(lanternFor(souls, cem!.x + 20, 0, cem!.z, [{ x: cem!.x + 2, y: 0, z: cem!.z }])).toBe(0);
    expect(lanternFor(souls, cem!.x + LANTERNS.vigilReach + 1, 0, cem!.z, [{ x: cem!.x + 2, y: 0, z: cem!.z }])).toBe(-1);
    expect(lanternFor(souls, cem!.x + 20, 0, cem!.z, [{ x: cem!.x + 15, y: 0, z: cem!.z }])).toBe(-1);
    // Ward Nine's is upstairs: a kill in the ward below does not reach it
    expect(lanternFor(souls, nine!.x, 0, nine!.z)).toBe(-1);
    expect(lanternFor(souls, nine!.x + 1, nine!.y, nine!.z)).toBe(1);
    for (let k = 0; k < LANTERNS.souls; k++) souls[lanternFor(souls, cem!.x, 0, cem!.z)]!++;
    expect(lanternLit(souls, 0)).toBe(true);
    // a lit lantern takes no more
    expect(lanternFor(souls, cem!.x, 0, cem!.z)).toBe(-1);
    expect(lanternsLit(souls)).toBe(1);
  });

  it('can be finished at any pace: the files, the lanterns, the bell, the Matron, the damper, the dawn', () => {
    for (const pace of [1, 3]) {
      const def = createDefense();
      const hunt = createHunt();
      const ex = createExtraction();
      const records = [false, false, false, false, false];
      const souls = LANTERNS.spots.map(() => 0);
      let wakeAt: number | null = null;
      let damper = false;
      let e = 0;
      const step = 0.25;
      gateHunt(hunt, huntClock(wakeAt));
      let called = false;
      let landedAt = -1;
      const seen: number[] = [];
      while (e < 4000 * pace) {
        e += step;
        // the files and the power at the player's pace; the register (file 4) needs the power
        for (let i = 0; i < 5; i++) if (!records[i] && e >= (i + 1) * 60 * pace && (i < 3 || def.status === 'complete')) records[i] = true;
        if (e >= 200 * pace && def.status === 'available') activateDefense(def);
        if (def.status === 'active') updateDefense(def, step, true, true);
        // a kill by a lantern now and then
        if (e > 330 * pace && Math.round(e / step) % 8 === 0) {
          const i = souls.findIndex((_, k) => !lanternLit(souls, k));
          if (i >= 0) souls[i]!++;
        }
        const facts = { records, power: def.status === 'complete', souls, bell: wakeAt !== null, matron: hunt.status === 'complete', damper };
        const st = storyStep(facts);
        if (seen[seen.length - 1] !== st) seen.push(st);
        expect(asylumHour(e, null).phase).toBe('night');
        // the bell, once it can be rung, at the player's pace
        if (wakeAt === null && bellReady(facts) && e > 600 * pace) wakeAt = e;
        // she never walks before the bell, however long it takes
        if (gateHunt(hunt, huntClock(wakeAt))) expect(wakeAt).not.toBeNull();
        if (wakeAt === null) expect(hunt.status).toBe('available');
        if (hunt.status === 'active' && wakeAt !== null && e >= wakeAt + 160) completeHunt(hunt);
        if (damperOpen(facts) && wakeAt !== null && e >= wakeAt + 200) damper = true;
        unlockExtraction(ex, def.status === 'complete' && hunt.status === 'complete' && damper);
        if (!called && ex.phase === 'available') called = callExtraction(ex, e, true, true);
        if (called) for (const ev of updateExtraction(ex, step)) if (ev === 'touchdown') landedAt = e;
        if (landedAt >= 0) break;
      }
      // every step in order, none skipped
      expect(seen).toEqual(STEPS.map((_, i) => i));
      expect(storyStep({ records, power: true, souls, bell: true, matron: true, damper })).toBe(STEPS.length - 1);
      expect(landedAt).toBeGreaterThan(0);
      // first light comes with the bird
      expect(asylumHour(landedAt, ex.calledAt).phase).toBe('dawn');
      expect(asylumHour(landedAt, ex.calledAt).t).toBeGreaterThan(0.99);
    }
  });

  it('sends the black fog in waves that come and go, reach further each time, and stop for good at the damper', () => {
    expect(fogAt(FOG.first - 1, null).radius).toBe(0);
    expect(fogAt(FOG.first - 1, null).next).toBeCloseTo(1, 5);
    const peak = (w: number): number => fogAt(FOG.first + w * FOG.period + FOG.rise + 1, null).radius;
    expect(peak(0)).toBeCloseTo(FOG.reach0, 5);
    expect(peak(1)).toBeGreaterThan(peak(0));
    expect(peak(50)).toBe(FOG.reachMax);
    // calm between the waves
    expect(fogAt(FOG.first + FOG.rise + FOG.hold + FOG.fall + 1, null).radius).toBe(0);
    // never as far as the lawn (the LZ) or the gate
    const stack = { x: 46, z: -40 };
    expect(Math.hypot(-38 - stack.x, 31 - stack.z)).toBeGreaterThan(FOG.reachMax + 20);
    // the damper: it falls back and never comes again
    const stop = FOG.first + FOG.rise + 2;
    expect(fogAt(stop + FOG.stopFall + 0.1, stop).radius).toBe(0);
    for (let e = stop + FOG.stopFall; e < stop + 2000; e += 7) expect(fogAt(e, stop).radius).toBe(0);
    expect(fogAt(stop + 50, stop).stopped).toBe(true);
  });
});

describe('the Asylum hour never goes NaN', () => {
  it('an unreadable clock or call time is the night, every field finite (a NaN light blackens the world)', () => {
    for (const [e, c] of [[NaN, null], [Infinity, null], [320, NaN], [NaN, NaN]] as const) {
      const t = timeOfDay(e as number, c as number | null);
      for (const v of [t.t, t.dark, t.sun, t.sunDir.x, t.sunDir.y, t.sunDir.z]) expect(Number.isFinite(v)).toBe(true);
    }
    expect(timeOfDay(NaN).phase).toBe('night');
  });
});
