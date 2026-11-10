import { describe, expect, it } from 'vitest';
import { DoubleTap, isTouchDevice, stick, TOUCH } from '../src/player/touch';

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

describe('double tap', () => {
  /** A quick, still tap at (x, y) starting at `t`; returns what `down` said. */
  const tap = (d: DoubleTap, t: number, x = 500, y = 200, heldMs = 60): boolean => {
    const fired = d.down(t, x, y);
    d.up(t + heldMs, x, y);
    return fired;
  };

  it('never fires on a single tap', () => {
    const d = new DoubleTap();
    expect(tap(d, 1000)).toBe(false);
  });

  it('fires on the second tap when it lands soon after and close to the first', () => {
    const d = new DoubleTap();
    expect(d.down(1000, 500, 200)).toBe(false);
    d.up(1060, 502, 201);
    expect(d.down(1060 + TOUCH.doubleTapMs, 500 + TOUCH.doubleTapPx - 4, 200)).toBe(true);
  });

  it('does not fire when the second tap is too late or too far away', () => {
    const late = new DoubleTap();
    tap(late, 1000);
    expect(late.down(1060 + TOUCH.doubleTapMs + 1, 500, 200)).toBe(false);
    const far = new DoubleTap();
    tap(far, 1000);
    expect(far.down(1150, 500 + TOUCH.doubleTapPx + 2, 200)).toBe(false);
  });

  it('does not count a drag or a long press as the first tap', () => {
    const drag = new DoubleTap();
    drag.down(1000, 500, 200);
    drag.up(1080, 500 + TOUCH.tapSlopPx + 1, 200);
    expect(drag.down(1120, 500 + TOUCH.tapSlopPx + 1, 200)).toBe(false);
    const press = new DoubleTap();
    press.down(1000, 500, 200);
    press.up(1000 + TOUCH.tapMs + 1, 500, 200);
    expect(press.down(1000 + TOUCH.tapMs + 50, 500, 200)).toBe(false);
  });

  it('is used up once it fires: the third tap starts again from one, the fourth fires', () => {
    const d = new DoubleTap();
    expect(tap(d, 1000)).toBe(false);
    expect(tap(d, 1120)).toBe(true);
    expect(tap(d, 1240)).toBe(false);
    expect(tap(d, 1360)).toBe(true);
  });

  it('holding the second tap for a long time does not arm anything afterwards', () => {
    const d = new DoubleTap();
    tap(d, 1000);
    expect(d.down(1120, 500, 200)).toBe(true);
    d.up(4000, 640, 260); // held and dragged while firing
    expect(d.down(4050, 640, 260)).toBe(false);
  });

  it('forgets a pending tap on reset', () => {
    const d = new DoubleTap();
    tap(d, 1000);
    d.reset();
    expect(d.down(1120, 500, 200)).toBe(false);
  });
});

describe('touch detection', () => {
  it('is off where there is no browser', () => {
    expect(isTouchDevice()).toBe(false);
  });
});
