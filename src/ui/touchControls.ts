/**
 * On-screen controls for phones and tablets: a move stick that appears under the left thumb, drag-to-look on the
 * right, and action buttons around the fire button. This module only translates touches into calls on Input (the
 * same object the keyboard and mouse write to), so the game itself has no touch-specific logic.
 */
import './touch.css';
import type { Input, TapAction } from '../player/input';
import { stick, TOUCH } from '../player/touch';
import { el } from './dom';

export interface TouchContext {
  /** An interaction is on offer (the HUD is showing its prompt). */
  canUse: boolean;
  /** A buy / upgrade station menu is open. */
  panelOpen: boolean;
  mapOpen: boolean;
}

export interface TouchControlsDeps {
  root: HTMLElement;
  input: Input;
  onPause(): void;
  /** The device was turned upright, where the game cannot be played. */
  onInterrupt(): void;
}

export interface TouchControlsApi {
  /** Show the controls and accept touches (only while the player is actually in control). */
  setActive(active: boolean): void;
  /** Per-frame context; diffs internally and only touches the DOM on a change. */
  update(ctx: TouchContext): void;
  dispose(): void;
}

const NO_POINTER = -1;

/** Keep getting a finger's events even after it slides off the control. */
function capture(target: HTMLElement, e: PointerEvent): void {
  try {
    target.setPointerCapture(e.pointerId);
  } catch {
    /* the pointer is already gone; the control still works without capture */
  }
}

class TouchControls implements TouchControlsApi {
  private readonly layer: HTMLElement;
  private readonly moveZone: HTMLElement;
  private readonly lookZone: HTMLElement;
  private readonly stickEl: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly fireBtn: HTMLButtonElement;
  private readonly adsBtn: HTMLButtonElement;
  private readonly useBtn: HTMLButtonElement;
  private readonly mapBtn: HTMLButtonElement;
  private readonly rotate: HTMLElement;
  private readonly cleanup: (() => void)[] = [];

  private active = false;
  private adsOn = false;
  private canUse = false;
  private panelOpen = false;
  private mapOpen = false;

  private movePointer = NO_POINTER;
  private moveCX = 0;
  private moveCY = 0;
  private moveRadius = 1;
  private lookPointer = NO_POINTER;
  private lookX = 0;
  private lookY = 0;
  private firePointer = NO_POINTER;
  private fireX = 0;
  private fireY = 0;
  private usePointer = NO_POINTER;

  constructor(private readonly deps: TouchControlsDeps) {
    this.layer = el('div', 'ds-touch-layer', deps.root);
    this.layer.hidden = true;

    this.moveZone = el('div', 'tz move', this.layer);
    this.stickEl = el('div', 'stick', this.moveZone);
    this.knob = el('i', 'knob', this.stickEl);
    this.lookZone = el('div', 'tz look', this.layer);

    this.fireBtn = this.button('fire', 'FIRE', 'Fire');
    this.adsBtn = this.button('ads', 'AIM', 'Aim down sights');
    this.useBtn = this.button('use', 'USE', 'Use');
    this.useBtn.hidden = true;
    this.mapBtn = this.button('map', 'MAP', 'Tactical map');
    const pauseBtn = this.button('pause', 'II', 'Pause');

    const taps: [cls: string, label: string, aria: string, action: TapAction][] = [
      ['reload', 'RELOAD', 'Reload', 'reload'],
      ['jump', 'JUMP', 'Jump', 'jump'],
      ['crouch', 'CROUCH', 'Crouch', 'crouch'],
      ['swap', 'SWAP', 'Switch weapon', 'swap'],
      ['grenade', 'NADE', 'Throw grenade', 'grenade'],
      ['plate', 'PLATE', 'Apply armor plate', 'plate'],
    ];
    for (const [cls, label, aria, action] of taps) {
      const b = this.button(cls, label, aria);
      this.press(b, () => this.deps.input.tap(action));
    }

    this.rotate = el('div', 'ds-rotate', deps.root, 'TURN YOUR PHONE SIDEWAYS TO PLAY');

    // ---- move stick: appears where the thumb lands ----
    this.on(this.moveZone, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (this.mapOpen) {
        this.deps.input.tap('map');
        return;
      }
      if (this.panelOpen && this.pickStationRow(e.clientX, e.clientY)) return;
      if (this.movePointer !== NO_POINTER) return;
      this.movePointer = e.pointerId;
      capture(this.moveZone, e);
      const zone = this.moveZone.getBoundingClientRect();
      const r = Math.max(1, this.stickEl.offsetWidth / 2);
      this.moveRadius = r;
      // keep the whole stick on screen even when the thumb lands in a corner
      this.moveCX = Math.min(Math.max(e.clientX, zone.left + r), Math.max(zone.left + r, zone.right - r));
      this.moveCY = Math.min(Math.max(e.clientY, zone.top + r), Math.max(zone.top + r, zone.bottom - r));
      this.stickEl.style.left = `${this.moveCX - zone.left}px`;
      this.stickEl.style.top = `${this.moveCY - zone.top}px`;
      this.stickEl.classList.add('live');
      this.applyStick(e);
    });
    this.on(this.moveZone, 'pointermove', (e) => {
      if (e.pointerId === this.movePointer) this.applyStick(e);
    });
    this.release(this.moveZone, (e) => {
      if (e.pointerId === this.movePointer) this.releaseStick();
    });

    // ---- look: drag anywhere on the right ----
    this.on(this.lookZone, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (this.mapOpen) {
        this.deps.input.tap('map');
        return;
      }
      if (this.panelOpen && this.pickStationRow(e.clientX, e.clientY)) return;
      if (this.lookPointer !== NO_POINTER) return;
      this.lookPointer = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      capture(this.lookZone, e);
    });
    this.on(this.lookZone, 'pointermove', (e) => {
      if (e.pointerId !== this.lookPointer) return;
      this.deps.input.addLook((e.clientX - this.lookX) * TOUCH.lookScale, (e.clientY - this.lookY) * TOUCH.lookScale);
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    });
    this.release(this.lookZone, (e) => {
      if (e.pointerId === this.lookPointer) this.lookPointer = NO_POINTER;
    });

    // ---- fire: hold to shoot, and keep dragging on it to aim while shooting ----
    this.on(this.fireBtn, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (this.firePointer !== NO_POINTER) return;
      this.firePointer = e.pointerId;
      this.fireX = e.clientX;
      this.fireY = e.clientY;
      capture(this.fireBtn, e);
      this.fireBtn.classList.add('down');
      this.deps.input.setFire(true);
    });
    this.on(this.fireBtn, 'pointermove', (e) => {
      if (e.pointerId !== this.firePointer) return;
      this.deps.input.addLook((e.clientX - this.fireX) * TOUCH.lookScale, (e.clientY - this.fireY) * TOUCH.lookScale);
      this.fireX = e.clientX;
      this.fireY = e.clientY;
    });
    this.release(this.fireBtn, (e) => {
      if (e.pointerId === this.firePointer) this.releaseFire();
    });

    // ---- aim: tap to toggle, since holding it would cost the thumb that looks ----
    this.press(this.adsBtn, () => this.setAds(!this.adsOn));

    // ---- use: a press for plain interactions, held for the ones that need holding ----
    this.on(this.useBtn, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (this.usePointer !== NO_POINTER) return;
      this.usePointer = e.pointerId;
      capture(this.useBtn, e);
      this.useBtn.classList.add('down');
      this.deps.input.setInteract(true);
    });
    this.release(this.useBtn, (e) => {
      if (e.pointerId === this.usePointer) this.releaseUse();
    });

    this.press(this.mapBtn, () => this.deps.input.tap('map'));
    this.press(pauseBtn, () => this.deps.onPause());

    // Long-presses and pinches belong to the game, not the browser.
    this.on(this.layer, 'contextmenu', (e) => e.preventDefault());
    const stop = (e: Event): void => e.preventDefault();
    document.addEventListener('gesturestart', stop);
    this.cleanup.push(() => document.removeEventListener('gesturestart', stop));

    if (typeof window.matchMedia === 'function') {
      const portrait = window.matchMedia('(orientation: portrait)');
      const onTurn = (e: MediaQueryListEvent): void => {
        if (e.matches) this.deps.onInterrupt();
      };
      if (typeof portrait.addEventListener === 'function') {
        portrait.addEventListener('change', onTurn);
        this.cleanup.push(() => portrait.removeEventListener('change', onTurn));
      }
    }
  }

  private button(cls: string, label: string, aria: string): HTMLButtonElement {
    const b = el('button', `tb ${cls}`, this.layer, label);
    b.type = 'button';
    b.tabIndex = -1;
    b.setAttribute('aria-label', aria);
    return b;
  }

  private on<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void): void {
    target.addEventListener(type, fn, { passive: false });
    this.cleanup.push(() => target.removeEventListener(type, fn));
  }

  /** `fn` runs when a finger leaves the control for any reason, including the browser taking the touch away. */
  private release(target: HTMLElement, fn: (e: PointerEvent) => void): void {
    this.on(target, 'pointerup', fn);
    this.on(target, 'pointercancel', fn);
    this.on(target, 'lostpointercapture', fn);
  }

  /** A button that acts once, the moment it is touched. */
  private press(b: HTMLButtonElement, fn: () => void): void {
    this.on(b, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      b.classList.add('down');
      fn();
    });
    this.release(b, () => b.classList.remove('down'));
  }

  private applyStick(e: PointerEvent): void {
    const s = stick(e.clientX - this.moveCX, e.clientY - this.moveCY, this.moveRadius);
    this.deps.input.setStick(s.strafe, s.forward, s.sprint);
    this.knob.style.transform = `translate(${s.knobX.toFixed(1)}px, ${s.knobY.toFixed(1)}px)`;
    this.stickEl.classList.toggle('sprint', s.sprint);
  }

  private releaseStick(): void {
    this.movePointer = NO_POINTER;
    this.deps.input.setStick(0, 0, false);
    this.knob.style.transform = '';
    this.stickEl.style.left = '';
    this.stickEl.style.top = '';
    this.stickEl.classList.remove('live', 'sprint');
  }

  private releaseFire(): void {
    this.firePointer = NO_POINTER;
    this.fireBtn.classList.remove('down');
    this.deps.input.setFire(false);
  }

  private releaseUse(): void {
    this.usePointer = NO_POINTER;
    this.useBtn.classList.remove('down');
    this.deps.input.setInteract(false);
  }

  private setAds(on: boolean): void {
    this.adsOn = on;
    this.adsBtn.classList.toggle('on', on);
    this.deps.input.setAds(on);
  }

  /**
   * Station menus are chosen with number keys on desktop. On touch the rows are tapped instead: the HUD ignores
   * pointers, so the tap lands on the look zone and is matched against the rows by position.
   */
  private pickStationRow(x: number, y: number): boolean {
    const rows = this.deps.root.querySelectorAll<HTMLElement>('.ds-station:not([hidden]) .it');
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const n = Number.parseInt(row.querySelector('kbd')?.textContent ?? '', 10);
      if (Number.isInteger(n)) this.deps.input.digit(n);
      return true;
    }
    return false;
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.layer.hidden = !active;
    if (active) return;
    // The game has taken control away (pause, death, menu): let go of everything so nothing is stuck on return.
    this.releaseStick();
    this.lookPointer = NO_POINTER;
    this.releaseFire();
    this.releaseUse();
    this.setAds(false);
    for (const b of this.layer.querySelectorAll('.tb.down')) b.classList.remove('down');
  }

  update(ctx: TouchContext): void {
    if (ctx.canUse !== this.canUse || ctx.panelOpen !== this.panelOpen) {
      this.canUse = ctx.canUse;
      this.panelOpen = ctx.panelOpen;
      const show = ctx.canUse || ctx.panelOpen;
      if (!show && this.usePointer !== NO_POINTER) this.releaseUse();
      this.useBtn.hidden = !show;
      this.useBtn.textContent = ctx.panelOpen ? 'CLOSE' : 'USE';
      this.layer.classList.toggle('panel-open', ctx.panelOpen);
    }
    if (ctx.mapOpen !== this.mapOpen) {
      this.mapOpen = ctx.mapOpen;
      this.layer.classList.toggle('map-open', ctx.mapOpen);
      this.mapBtn.textContent = ctx.mapOpen ? 'CLOSE' : 'MAP';
    }
  }

  dispose(): void {
    this.setActive(false);
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
    this.layer.remove();
    this.rotate.remove();
  }
}

export function createTouchControls(deps: TouchControlsDeps): TouchControlsApi {
  return new TouchControls(deps);
}
