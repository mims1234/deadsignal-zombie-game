/**
 * Keyboard / mouse input, plus the virtual controls a touchscreen drives. Held state + one-shot edges that the game
 * consumes each frame. Everything is cleared when input is disabled, on blur, and on visibility changes, so no key
 * or button can stay "stuck" after pausing.
 */
export interface Edges {
  jump: boolean;
  reload: boolean;
  interactPressed: boolean;
  interactReleased: boolean;
  grenade: boolean;
  plate: boolean;
  map: boolean;
  slot1: boolean;
  slot2: boolean;
  crouch: boolean;
  /** Number-key presses 1..6 (used by station panels). */
  digits: number[];
  wheel: number;
  firePressed: boolean;
  adsPressed: boolean;
  mouseDX: number;
  mouseDY: number;
}

/** One-shot actions an on-screen button can trigger. */
export type TapAction = 'jump' | 'reload' | 'grenade' | 'plate' | 'map' | 'crouch' | 'swap';

/**
 * After a finger lifts, browsers replay the tap as mouse events ("compatibility" events) up to roughly 300 ms later.
 * Left alone those would fire the weapon on every tap, so mouse buttons are ignored for this long after a touch.
 */
const TOUCH_MOUSE_GUARD_MS = 800;

const clampUnit = (v: number): number => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyC', 'KeyE', 'KeyR', 'KeyG', 'KeyQ', 'KeyM',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'ControlLeft', 'Tab',
]);

export class Input {
  private keys = new Set<string>();
  private edges: Edges = this.freshEdges();
  fireHeld = false;
  adsHeld = false;
  interactHeld = false;
  /** After resuming via a click, ignore the fire button until it has been released. */
  fireSuppressed = false;
  enabled = false;
  private wheelAcc = 0;
  private wheelCooldown = 0;
  private skipNextMove = 0;
  // Virtual stick (touch). Added to the keyboard axes, so both can be used together.
  private stickForward = 0;
  private stickStrafe = 0;
  private stickSprint = false;
  private lastTouchAt = -1e9;

  constructor(private readonly canvas: HTMLElement) {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('touchstart', this.onTouch, { passive: true, capture: true });
    document.addEventListener('touchend', this.onTouch, { passive: true, capture: true });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
  }

  private freshEdges(): Edges {
    return {
      jump: false, reload: false, interactPressed: false, interactReleased: false, grenade: false, plate: false, map: false,
      slot1: false, slot2: false, crouch: false, digits: [], wheel: 0, firePressed: false, adsPressed: false, mouseDX: 0, mouseDY: 0,
    };
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) this.clear();
    if (enabled && !this.enabled) this.skipNextMove = 2; // pointer-lock acquire can deliver a huge first delta
    this.enabled = enabled;
  }

  /** Forget every held key / button and pending edge. */
  clear(): void {
    this.keys.clear();
    this.fireHeld = false;
    this.adsHeld = false;
    this.interactHeld = false;
    this.edges = this.freshEdges();
    this.wheelAcc = 0;
    this.stickForward = 0;
    this.stickStrafe = 0;
    this.stickSprint = false;
  }

  held(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  get forward(): number {
    const keys = (this.held('KeyW') ? 1 : 0) - (this.held('KeyS') ? 1 : 0);
    return this.enabled ? clampUnit(keys + this.stickForward) : 0;
  }

  get strafe(): number {
    const keys = (this.held('KeyD') ? 1 : 0) - (this.held('KeyA') ? 1 : 0);
    return this.enabled ? clampUnit(keys + this.stickStrafe) : 0;
  }

  get sprint(): boolean {
    return this.held('ShiftLeft') || this.held('ShiftRight') || (this.enabled && this.stickSprint);
  }

  get jumpHeld(): boolean {
    return this.held('Space');
  }

  get fire(): boolean {
    return this.enabled && this.fireHeld && !this.fireSuppressed;
  }

  get ads(): boolean {
    return this.enabled && this.adsHeld;
  }

  // ---- virtual controls (touch). Each is a no-op while input is disabled, exactly like the keyboard. ----

  /** Virtual stick position: strafe and forward in -1..1, and whether it is pushed far enough to sprint. */
  setStick(strafe: number, forward: number, sprint: boolean): void {
    if (!this.enabled) return;
    this.stickStrafe = clampUnit(strafe);
    this.stickForward = clampUnit(forward);
    this.stickSprint = sprint;
  }

  /** Turn the view by a drag, in the same "mouse pixel" units the mouse reports. */
  addLook(dx: number, dy: number): void {
    if (!this.enabled || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.edges.mouseDX += Math.max(-250, Math.min(250, dx));
    this.edges.mouseDY += Math.max(-250, Math.min(250, dy));
  }

  setFire(held: boolean): void {
    if (held) {
      if (!this.enabled) return;
      if (!this.fireHeld) this.edges.firePressed = true;
      this.fireHeld = true;
    } else {
      this.fireHeld = false;
      this.fireSuppressed = false;
    }
  }

  setAds(held: boolean): void {
    if (held) {
      if (!this.enabled) return;
      if (!this.adsHeld) this.edges.adsPressed = true;
      this.adsHeld = true;
    } else {
      this.adsHeld = false;
    }
  }

  setInteract(held: boolean): void {
    if (held) {
      if (!this.enabled || this.interactHeld) return;
      this.edges.interactPressed = true;
      this.interactHeld = true;
    } else if (this.interactHeld) {
      this.edges.interactReleased = true;
      this.interactHeld = false;
    }
  }

  tap(action: TapAction): void {
    if (!this.enabled) return;
    switch (action) {
      case 'jump': this.edges.jump = true; break;
      case 'reload': this.edges.reload = true; break;
      case 'grenade': this.edges.grenade = true; break;
      case 'plate': this.edges.plate = true; break;
      case 'map': this.edges.map = true; break;
      case 'crouch': this.edges.crouch = true; break;
      // the weapon system swaps slots on any wheel movement
      case 'swap': this.edges.wheel += 1; break;
      default: break;
    }
  }

  /** A station-menu choice (1..6), as if that number key had been pressed. */
  digit(n: number): void {
    if (!this.enabled || !Number.isInteger(n) || n < 1 || n > 6) return;
    this.edges.digits.push(n);
  }

  private fromTouch(): boolean {
    return performance.now() - this.lastTouchAt < TOUCH_MOUSE_GUARD_MS;
  }

  private readonly onTouch = (): void => {
    this.lastTouchAt = performance.now();
  };

  /** Returns the pending edges and resets them. */
  consume(dt: number): Edges {
    const e = this.edges;
    this.edges = this.freshEdges();
    if (this.wheelCooldown > 0) this.wheelCooldown -= dt;
    return e;
  }

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (!this.enabled) return;
    if (GAME_KEYS.has(ev.code)) ev.preventDefault();
    if (ev.repeat) return;
    this.keys.add(ev.code);
    switch (ev.code) {
      case 'Space': this.edges.jump = true; break;
      case 'KeyR': this.edges.reload = true; break;
      case 'KeyE':
        this.edges.interactPressed = true;
        this.interactHeld = true;
        break;
      case 'KeyG': this.edges.grenade = true; break;
      case 'KeyQ': this.edges.plate = true; break;
      case 'KeyM': this.edges.map = true; break;
      case 'KeyC': this.edges.crouch = true; break;
      case 'Digit1': this.edges.slot1 = true; this.edges.digits.push(1); break;
      case 'Digit2': this.edges.slot2 = true; this.edges.digits.push(2); break;
      case 'Digit3': this.edges.digits.push(3); break;
      case 'Digit4': this.edges.digits.push(4); break;
      case 'Digit5': this.edges.digits.push(5); break;
      case 'Digit6': this.edges.digits.push(6); break;
      default: break;
    }
  };

  private readonly onKeyUp = (ev: KeyboardEvent): void => {
    if (ev.code === 'KeyE' && this.interactHeld) {
      this.edges.interactReleased = true;
      this.interactHeld = false;
    }
    this.keys.delete(ev.code);
  };

  private readonly onMouseDown = (ev: MouseEvent): void => {
    if (!this.enabled || this.fromTouch()) return;
    if (ev.button === 0) {
      if (!this.fireHeld) this.edges.firePressed = true;
      this.fireHeld = true;
    } else if (ev.button === 2) {
      if (!this.adsHeld) this.edges.adsPressed = true;
      this.adsHeld = true;
    }
  };

  private readonly onMouseUp = (ev: MouseEvent): void => {
    if (this.fromTouch()) return;
    if (ev.button === 0) {
      this.fireHeld = false;
      this.fireSuppressed = false;
    } else if (ev.button === 2) {
      this.adsHeld = false;
    }
  };

  private readonly onMouseMove = (ev: MouseEvent): void => {
    if (!this.enabled || document.pointerLockElement !== this.canvas) return;
    if (this.skipNextMove > 0) {
      this.skipNextMove--;
      return;
    }
    const dx = Math.max(-250, Math.min(250, ev.movementX));
    const dy = Math.max(-250, Math.min(250, ev.movementY));
    this.edges.mouseDX += dx;
    this.edges.mouseDY += dy;
  };

  private readonly onWheel = (ev: WheelEvent): void => {
    if (!this.enabled) return;
    ev.preventDefault();
    this.wheelAcc += ev.deltaY;
    if (Math.abs(this.wheelAcc) >= 40 && this.wheelCooldown <= 0) {
      this.edges.wheel += Math.sign(this.wheelAcc);
      this.wheelAcc = 0;
      this.wheelCooldown = 0.18;
    }
  };

  private readonly onContextMenu = (ev: Event): void => {
    if (this.enabled) ev.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.clear();
  };

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('touchstart', this.onTouch, { capture: true });
    document.removeEventListener('touchend', this.onTouch, { capture: true });
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onBlur);
  }
}
