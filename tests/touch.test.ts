import { describe, expect, it } from 'vitest';
import { isTouchDevice, stick, TOUCH } from '../src/player/touch';

const R = 50;

describe('virtual stick', () => {
  it('is idle at the centre and for unusable input', () => {
    for (const s of [stick(0, 0, R), stick(10, 10, 0), stick(Number.NaN, 0, R), stick(Infinity, 0, R)]) {
      expect(s.strafe).toBe(0);
      expect(s.forward).toBe(0);
      expect(s.sprint).toBe(false);
    }
  });

  it('does not move inside the deadzone, but still draws the knob under the finger', () => {
    const s = stick(0, -R * TOUCH.deadzone * 0.5, R);
    expect(s.forward).toBe(0);
    expect(s.strafe).toBe(0);
    expect(s.knobY).toBeCloseTo(-R * TOUCH.deadzone * 0.5);
  });

  it('starts from zero at the edge of the deadzone, with no jump', () => {
    const justOutside = stick(0, -R * (TOUCH.deadzone + 0.01), R);
    expect(justOutside.forward).toBeGreaterThan(0);
    expect(justOutside.forward).toBeLessThan(0.05);
  });

  it('maps up to forward and right to strafe (screen y grows downward)', () => {
    expect(stick(0, -R, R).forward).toBeCloseTo(1);
    expect(stick(0, R, R).forward).toBeCloseTo(-1);
    expect(stick(R, 0, R).strafe).toBeCloseTo(1);
    expect(stick(-R, 0, R).strafe).toBeCloseTo(-1);
  });

  it('caps at full deflection and keeps the knob inside the ring when the finger overshoots', () => {
    const s = stick(300, -400, R);
    expect(Math.hypot(s.strafe, s.forward)).toBeCloseTo(1);
    expect(Math.hypot(s.knobX, s.knobY)).toBeCloseTo(R);
  });

  it('sprints only when pushed far and mostly forward', () => {
    expect(stick(0, -R, R).sprint).toBe(true);
    expect(stick(0, -R * 0.6, R).sprint).toBe(false); // not far enough
    expect(stick(R, 0, R).sprint).toBe(false); // sideways
    expect(stick(0, R, R).sprint).toBe(false); // backwards
    expect(stick(R * 0.5, -R, R).sprint).toBe(true); // forward with a little drift still counts
  });
});

describe('touch detection', () => {
  it('is off where there is no browser', () => {
    expect(isTouchDevice()).toBe(false);
  });
});
