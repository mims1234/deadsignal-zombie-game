/**
 * Aim assist for touch play, in the style phone shooters use: the view slows down as the crosshair crosses a target
 * ("sticky" aim) and is pulled gently toward it while the player is actively aiming. It never fires for the player
 * and never snaps; it only makes a thumb about as precise as a mouse.
 *
 * Pure maths, no game objects: the game supplies the eye, the candidate points and whether there is a clear line of
 * sight, and applies the result.
 */

export const AIM_ASSIST = {
  /** Targets further away than this are ignored (metres). */
  range: 45,
  /** Half-angle of the cone inside which the view is pulled toward a target (radians, about 7 degrees). */
  cone: 0.125,
  /** Half-angle inside which look input is slowed (radians, about 3.4 degrees). */
  stickCone: 0.06,
  /** Look-speed multiplier with the crosshair dead centre on a target. */
  stickSlow: 0.5,
  /** Strongest pull, in radians per second, reached at the centre of the cone. */
  pull: 0.6,
  /** The pull is this much stronger while firing, when staying on target matters most. */
  firingMul: 1.6,
  /** Vertical pull is weaker than horizontal, so going for the head stays the player's own work. */
  pitchMul: 0.6,
} as const;

export interface AssistView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface AssistTarget {
  x: number;
  y: number;
  z: number;
  /** Rough body radius in metres: bigger and nearer targets cover more of the screen. */
  r: number;
}

export interface AssistPick {
  /** Index into the targets, or -1 when nothing is close enough to the crosshair. */
  index: number;
  /** How far the view would have to turn to face the target (radians). */
  yawErr: number;
  pitchErr: number;
  /** On-screen angular distance from the crosshair to the target. */
  angle: number;
  dist: number;
}

export interface AssistResult {
  /** Multiply the player's look input by this. */
  slow: number;
  /** Add these to the view's yaw and pitch. */
  dyaw: number;
  dpitch: number;
}

export function wrapAngle(a: number): number {
  let v = a % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  else if (v < -Math.PI) v += Math.PI * 2;
  return v;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * The target nearest the crosshair among the first `count` entries, if any lies within the assist cone and range.
 * The view looks along (-sin yaw, -cos yaw) on the ground plane and positive pitch is up, matching Player.
 */
export function pickTarget(view: AssistView, targets: readonly AssistTarget[], count: number, range: number, out: AssistPick): AssistPick {
  out.index = -1;
  out.yawErr = 0;
  out.pitchErr = 0;
  out.angle = 0;
  out.dist = 0;
  const cosPitch = Math.cos(view.pitch);
  let bestScore = Infinity;
  for (let i = 0; i < count; i++) {
    const t = targets[i]!;
    const dx = t.x - view.x;
    const dy = t.y - view.y;
    const dz = t.z - view.z;
    const flat = Math.hypot(dx, dz);
    const dist = Math.hypot(flat, dy);
    if (!(dist > 0.6) || dist > range) continue;
    const yawErr = wrapAngle(Math.atan2(-dx, -dz) - view.yaw);
    const pitchErr = Math.atan2(dy, flat) - view.pitch;
    const angle = Math.hypot(yawErr * cosPitch, pitchErr);
    if (angle > AIM_ASSIST.cone + Math.atan2(t.r, dist)) continue;
    // nearest to the crosshair wins; distance only breaks near-ties, in favour of the closer threat
    const score = angle + dist * 0.0008;
    if (score < bestScore) {
      bestScore = score;
      out.index = i;
      out.yawErr = yawErr;
      out.pitchErr = pitchErr;
      out.angle = angle;
      out.dist = dist;
    }
  }
  return out;
}

/**
 * How to adjust the view for a picked target this frame.
 * `engaged` is whether the player is actively playing the shot (looking, moving or firing); the view is only
 * pulled while engaged, so it never drifts on its own.
 */
export function assistFor(
  pick: AssistPick,
  radius: number,
  viewPitch: number,
  dt: number,
  engaged: boolean,
  firing: boolean,
  out: AssistResult,
): AssistResult {
  out.slow = 1;
  out.dyaw = 0;
  out.dpitch = 0;
  if (pick.index < 0 || !(pick.dist > 0) || !(dt > 0)) return out;
  const size = Math.atan2(radius, pick.dist);

  const stick = AIM_ASSIST.stickCone + size;
  if (pick.angle < stick) out.slow = AIM_ASSIST.stickSlow + (1 - AIM_ASSIST.stickSlow) * clamp01(pick.angle / stick);

  // already on the body: nothing to pull toward, and pulling here would only make the crosshair twitch
  const rest = size * 0.35;
  const cosPitch = Math.cos(viewPitch);
  if (!engaged || pick.angle <= rest || cosPitch < 0.2) return out;
  const reach = AIM_ASSIST.cone + size;
  const strength = AIM_ASSIST.pull * (firing ? AIM_ASSIST.firingMul : 1) * clamp01(1 - pick.angle / reach);
  const step = Math.min(pick.angle - rest, strength * dt);
  if (!(step > 0)) return out;
  // unit direction toward the target in screen space, converted back to yaw / pitch
  out.dyaw = ((pick.yawErr * cosPitch) / pick.angle) * (step / cosPitch);
  out.dpitch = (pick.pitchErr / pick.angle) * step * AIM_ASSIST.pitchMul;
  return out;
}
