import { describe, expect, it } from 'vitest';
import { AIM_ASSIST, assistFor, pickTarget, wrapAngle, type AssistPick, type AssistResult, type AssistTarget, type AssistView } from '../src/player/aimAssist';
import { lookGain, TOUCH, wantsSprintLock } from '../src/player/touch';

const DEG = Math.PI / 180;
const newPick = (): AssistPick => ({ index: -1, yawErr: 0, pitchErr: 0, angle: 0, dist: 0 });
const newResult = (): AssistResult => ({ slow: 1, dyaw: 0, dpitch: 0 });
/** Eye at the origin looking along -z (yaw 0), level. */
const view = (yaw = 0, pitch = 0): AssistView => ({ x: 0, y: 1.6, z: 0, yaw, pitch });
/** A target `dist` metres away, `offDeg` degrees to the left (positive yaw) of straight ahead, at eye height. */
const at = (dist: number, offDeg: number, r = 0.4): AssistTarget => ({ x: -Math.sin(offDeg * DEG) * dist, y: 1.6, z: -Math.cos(offDeg * DEG) * dist, r });

describe('wrapAngle', () => {
  it('keeps angles within half a turn', () => {
    expect(wrapAngle(Math.PI * 2 + 0.3)).toBeCloseTo(0.3);
    expect(wrapAngle(-Math.PI * 2 - 0.3)).toBeCloseTo(-0.3);
    expect(wrapAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1);
  });
});

describe('pickTarget', () => {
  it('finds nothing when no target is near the crosshair', () => {
    expect(pickTarget(view(), [at(10, 40)], 1, 45, newPick()).index).toBe(-1);
    expect(pickTarget(view(), [], 0, 45, newPick()).index).toBe(-1);
  });

  it('measures how far the view must turn, with the game sign convention', () => {
    const pick = pickTarget(view(), [at(10, 3)], 1, 45, newPick());
    expect(pick.index).toBe(0);
    expect(pick.yawErr).toBeCloseTo(3 * DEG, 4);
    expect(pick.pitchErr).toBeCloseTo(0, 4);
    expect(pick.dist).toBeCloseTo(10, 4);
  });

  it('prefers the target nearest the crosshair, not the nearest in space', () => {
    const pick = pickTarget(view(), [at(5, 5), at(20, 1)], 2, 45, newPick());
    expect(pick.index).toBe(1);
  });

  it('ignores targets out of range or behind the player', () => {
    expect(pickTarget(view(), [at(60, 0)], 1, 45, newPick()).index).toBe(-1);
    expect(pickTarget(view(), [at(10, 180)], 1, 45, newPick()).index).toBe(-1);
  });

  it('only looks at the first `count` entries, so a reused array can hold stale ones', () => {
    expect(pickTarget(view(), [at(10, 40), at(10, 0)], 1, 45, newPick()).index).toBe(-1);
  });

  it('works across the yaw wrap-around', () => {
    const v = view(Math.PI - 0.01);
    const target: AssistTarget = { x: -Math.sin(-Math.PI + 0.02) * 10, y: 1.6, z: -Math.cos(-Math.PI + 0.02) * 10, r: 0.4 };
    const pick = pickTarget(v, [target], 1, 45, newPick());
    expect(pick.index).toBe(0);
    expect(Math.abs(pick.yawErr)).toBeLessThan(0.05);
  });
});

describe('assistFor', () => {
  const pickAt = (offDeg: number, dist = 10): AssistPick => pickTarget(view(), [at(dist, offDeg)], 1, 45, newPick());

  it('does nothing without a target', () => {
    const r = assistFor(newPick(), 0.4, 0, 1 / 60, true, true, newResult());
    expect(r).toEqual({ slow: 1, dyaw: 0, dpitch: 0 });
  });

  it('slows the view most when dead on target and not at all far from it', () => {
    const on = assistFor(pickAt(0.01), 0.4, 0, 1 / 60, false, false, newResult());
    const off = assistFor(pickAt(8), 0.4, 0, 1 / 60, false, false, newResult());
    expect(on.slow).toBeCloseTo(AIM_ASSIST.stickSlow, 1);
    expect(off.slow).toBe(1);
  });

  it('never moves the view while the player is idle', () => {
    const r = assistFor(pickAt(4), 0.4, 0, 1 / 60, false, false, newResult());
    expect(r.dyaw).toBe(0);
    expect(r.dpitch).toBe(0);
  });

  it('pulls toward the target while engaged, harder when firing, and never past it', () => {
    const calm = assistFor(pickAt(4), 0.4, 0, 1 / 60, true, false, newResult());
    const firing = assistFor(pickAt(4), 0.4, 0, 1 / 60, true, true, newResult());
    expect(calm.dyaw).toBeGreaterThan(0); // target is at positive yaw
    expect(firing.dyaw).toBeGreaterThan(calm.dyaw);
    const longFrame = assistFor(pickAt(4), 0.4, 0, 10, true, true, newResult());
    expect(longFrame.dyaw).toBeLessThanOrEqual(4 * DEG);
  });

  it('pulls the other way for a target on the other side', () => {
    expect(assistFor(pickAt(-4), 0.4, 0, 1 / 60, true, false, newResult()).dyaw).toBeLessThan(0);
  });

  it('stops pulling once the crosshair is on the body', () => {
    const r = assistFor(pickAt(0.2, 5), 0.4, 0, 1 / 60, true, true, newResult());
    expect(r.dyaw).toBe(0);
  });
});

describe('look acceleration', () => {
  it('turns less for a slow drag and more for a fast flick', () => {
    const slow = lookGain(1, 16); // ~60 px/s
    const fast = lookGain(40, 16); // ~2500 px/s
    expect(slow).toBeCloseTo(TOUCH.lookScale * TOUCH.lookSlowGain);
    expect(fast).toBeCloseTo(TOUCH.lookScale * TOUCH.lookFastGain);
    expect(lookGain(12, 16)).toBeGreaterThan(slow);
    expect(lookGain(12, 16)).toBeLessThan(fast);
  });

  it('falls back to the slow gain when the timing is unusable', () => {
    const slow = TOUCH.lookScale * TOUCH.lookSlowGain;
    expect(lookGain(10, 0)).toBe(slow);
    expect(lookGain(0, 16)).toBe(slow);
    expect(lookGain(Number.NaN, 16)).toBe(slow);
  });
});

describe('sprint lock', () => {
  it('needs a slide well above the stick, roughly straight up', () => {
    expect(wantsSprintLock(0, -50 * TOUCH.sprintLockAt, 50)).toBe(true);
    expect(wantsSprintLock(0, -50, 50)).toBe(false); // only at the rim
    expect(wantsSprintLock(60, -110, 50)).toBe(false); // too far to the side
    expect(wantsSprintLock(0, 110, 50)).toBe(false); // downward
    expect(wantsSprintLock(0, -110, 0)).toBe(false);
  });
});
