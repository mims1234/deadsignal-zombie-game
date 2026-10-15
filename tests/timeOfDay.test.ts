/**
 * The Asylum's day and night: the phase boundaries and blends, the infected's phase multiplier on top of the
 * difficulty, the Matron's hunt that only opens at night, and a mission clock that always leaves room to finish.
 */
import { describe, expect, it } from 'vitest';
import { ASYLUM_CLOCK, ASYLUM_CYCLE, DAWN_RELIEF, NIGHTFALL, PHASE_TUNING } from '../src/asylum/nightConfig';
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
    expect(escalationPhase(NIGHTFALL, ASYLUM_CLOCK)).toBe(2);
    expect(escalationPhase(NIGHTFALL - 1, ASYLUM_CLOCK)).toBe(1);
  });

  it('leaves the whole night for the hunt and the extraction, with the fog late', () => {
    const c = ASYLUM_CLOCK;
    // the power can be restored by day with time to spare
    expect(MISSION.defense.duration * 2).toBeLessThan(dayEnd);
    // four clean minutes of night before the black fog, more than eight before the gates close
    expect(c.surgeStart - MISSION.hazard.warningLead - NIGHTFALL).toBeGreaterThanOrEqual(240);
    expect(c.deadline - NIGHTFALL).toBeGreaterThanOrEqual(480);
    expect(surgeStartTime(null, c)).toBe(c.surgeStart);
    expect(c.surgeStart).toBeLessThan(c.deadline);
    expect(deadlineRemaining(NIGHTFALL, c)).toBe(c.deadline - NIGHTFALL);
  });

  it('can be finished: a run that plays by the light extracts before the gates close, even with a late call', () => {
    for (const callAt of [NIGHTFALL + 150, ASYLUM_CLOCK.deadline - 1]) {
      const def = createDefense();
      const hunt = createHunt();
      const ex = createExtraction();
      let e = 0;
      const step = 0.25;
      gateHunt(hunt, e);
      activateDefense(def);
      let called = false;
      let landedAt = -1;
      while (e < ASYLUM_CLOCK.deadline + 200) {
        e += step;
        updateDefense(def, step, true, true);
        if (gateHunt(hunt, e)) expect(e).toBeGreaterThanOrEqual(NIGHTFALL);
        if (hunt.status === 'active' && e >= NIGHTFALL + 120) completeHunt(hunt); // two minutes to put her down
        unlockExtraction(ex, def.status === 'complete' && hunt.status === 'complete');
        if (!called && ex.phase === 'available' && e >= callAt) {
          // the deadline only stops a call that never happened
          expect(deadlineRemaining(e, ASYLUM_CLOCK)).toBeGreaterThan(0);
          called = callExtraction(ex, e, true, true);
        }
        if (called) for (const ev of updateExtraction(ex, step)) if (ev === 'touchdown') landedAt = e;
        if (landedAt >= 0) break;
      }
      expect(def.status).toBe('complete');
      expect(called).toBe(true);
      expect(landedAt).toBeGreaterThan(0);
      // first light comes with the bird
      expect(timeOfDay(landedAt, ex.calledAt).phase).toBe('dawn');
      expect(timeOfDay(landedAt, ex.calledAt).t).toBeGreaterThan(0.99);
    }
  });
});
