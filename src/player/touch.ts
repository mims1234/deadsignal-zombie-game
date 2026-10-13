/**
 * Touch-device support that does not need the DOM tree: device detection, the virtual-stick maths and the
 * fullscreen request. The on-screen controls themselves live in ui/touchControls.ts.
 */

export const TOUCH = {
  /** Stick deflection (0..1) below which the player does not move. */
  deadzone: 0.16,
  /** Deflection at which a forward push becomes a sprint. */
  sprintAt: 0.9,
  /** How far "forward" the stick must point (0..1) for a full push to count as a sprint. */
  sprintForward: 0.75,
  /**
   * "Mouse pixels" per CSS pixel of finger travel. Look input is fed through the same path as the mouse, so the
   * sensitivity setting and the aim-down-sights slowdown apply to both; this just makes a thumb swipe turn about as
   * far as a comfortable mouse movement does.
   */
  lookScale: 2.4,
} as const;

export interface StickState {
  /** -1 (left) .. 1 (right). */
  strafe: number;
  /** -1 (back) .. 1 (forward). */
  forward: number;
  sprint: boolean;
  /** Where to draw the knob, in pixels from the stick centre (never further than the radius). */
  knobX: number;
  knobY: number;
}

const IDLE: StickState = { strafe: 0, forward: 0, sprint: false, knobX: 0, knobY: 0 };

/**
 * Turn a finger offset from the stick centre (screen pixels, y down) into movement.
 * Movement is zero inside the deadzone and ramps from zero at its edge, so there is no jump when leaving it.
 */
export function stick(dx: number, dy: number, radius: number): StickState {
  const len = Math.hypot(dx, dy);
  if (!(radius > 0) || !(len > 0) || !Number.isFinite(len)) return IDLE;
  const mag = Math.min(1, len / radius);
  const ux = dx / len;
  const uy = dy / len;
  const knobX = ux * mag * radius;
  const knobY = uy * mag * radius;
  if (mag < TOUCH.deadzone) return { strafe: 0, forward: 0, sprint: false, knobX, knobY };
  const m = (mag - TOUCH.deadzone) / (1 - TOUCH.deadzone);
  return {
    strafe: ux * m,
    forward: -uy * m,
    sprint: mag >= TOUCH.sprintAt && -uy >= TOUCH.sprintForward,
    knobX,
    knobY,
  };
}

/**
 * True when the game should show on-screen controls. A touchscreen laptop with a mouse stays on keyboard and mouse:
 * only devices whose main pointer is a finger, or that cannot capture the mouse at all, count.
 * `?touch=1` / `?touch=0` in the URL forces it either way, for testing.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  try {
    const forced = new URLSearchParams(window.location.search).get('touch');
    if (forced === '1') return true;
    if (forced === '0') return false;
  } catch {
    /* no usable URL: fall through to detection */
  }
  if (!((navigator.maxTouchPoints ?? 0) > 0)) return false;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const noPointerLock = typeof document.documentElement.requestPointerLock !== 'function';
  return coarse || noPointerLock;
}

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null };
type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

/**
 * Ask for fullscreen and landscape. Must be called from inside a tap. Every step is best effort: iPhones refuse
 * fullscreen for web pages and most browsers refuse the orientation lock, and the game plays fine without either.
 */
export async function enterFullscreenLandscape(): Promise<void> {
  if (typeof document === 'undefined') return;
  const root = document.documentElement as FsElement;
  const doc = document as FsDocument;
  try {
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (typeof root.requestFullscreen === 'function') await root.requestFullscreen({ navigationUI: 'hide' });
      else root.webkitRequestFullscreen?.();
    }
    await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape');
  } catch {
    /* refused: carry on windowed */
  }
}
