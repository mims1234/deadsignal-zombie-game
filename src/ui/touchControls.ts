/**
 * On-screen controls for phones and tablets, laid out the way phone shooters have taught players to expect:
 * a move stick under the left thumb (push far forward to sprint, slide up onto RUN to lock the sprint on),
 * drag-to-look on the right, a fire button under each thumb, and action buttons around the right-hand one.
 *
 * That is the "classic" layout. A map can ask for the "compact" one instead, which keeps three things on screen (the
 * stick, one FIRE button and a small menu dot), fires on a double tap, and moves every other action into a mini menu
 * of large tiles that opens over the running game.
 *
 * This module only translates touches into calls on Input (the same object the keyboard and mouse write to),
 * so the game itself has no touch-specific logic.
 */
import './touch.css';
import type { Input, TapAction } from '../player/input';
import { DoubleTap, lookGain, stick, wantsSprintLock } from '../player/touch';
import { el } from './dom';

export interface TouchContext {
  /** An interaction is on offer (the HUD is showing its prompt). */
  canUse: boolean;
  /** A buy / upgrade station menu is open. */
  panelOpen: boolean;
  mapOpen: boolean;
  /** Compact layout: the game's own word for what USE would do ('BUILD', 'BUY', 'TAKE', 'HELP UP'). Default 'USE'. */
  useLabel?: string;
  /** Compact layout: what the trigger does with the weapon in hand ('SWING' for a melee weapon). Default 'FIRE'. */
  fireLabel?: string;
}

export type TouchLayout = 'classic' | 'compact';

export interface TouchControlsDeps {
  root: HTMLElement;
  input: Input;
  onPause(): void;
  /** The device was turned upright, where the game cannot be played. */
  onInterrupt(): void;
  /** Which set of controls to show. Default 'classic'. */
  layout?: TouchLayout;
  /** Compact layout: one more tile, placed first in the mini menu (the game uses it for RECIPES). */
  menuExtra?: { label: string; onTap(): void };
}

export interface TouchControlsApi {
  /** Show the controls and accept touches (only while the player is actually in control). */
  setActive(active: boolean): void;
  /** Per-frame context; diffs internally and only touches the DOM on a change. */
  update(ctx: TouchContext): void;
  /** Switch layouts (per map). Anything held on a control that goes away is let go. */
  setLayout(layout: TouchLayout): void;
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

/** A short tick under the thumb where the device supports it (Android; iOS ignores it). */
function buzz(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here: silently skip */
  }
}

/**
 * `?touchlayout=compact` (or `classic`) in the URL pins the layout whatever the map asks for. A development aid:
 * it lets either layout be looked at on any map.
 */
function forcedLayout(): TouchLayout | null {
  try {
    if (typeof location === 'undefined') return null;
    const v = new URLSearchParams(location.search).get('touchlayout');
    return v === 'compact' || v === 'classic' ? v : null;
  } catch {
    return null; // no usable URL here
  }
}

/** A drag that turns the view, with the finger-speed gain applied. */
interface LookDrag {
  pointer: number;
  x: number;
  y: number;
  t: number;
}

class TouchControls implements TouchControlsApi {
  private readonly layer: HTMLElement;
  private readonly moveZone: HTMLElement;
  private readonly lookZone: HTMLElement;
  private readonly stickEl: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly runLock: HTMLElement;
  private readonly fireBtn: HTMLButtonElement;
  private readonly fireLeftBtn: HTMLButtonElement;
  private readonly adsBtn: HTMLButtonElement;
  private readonly useBtn: HTMLButtonElement;
  private readonly mapBtn: HTMLButtonElement;
  private readonly menuBtn: HTMLButtonElement;
  private readonly menuEl: HTMLElement;
  private readonly rotate: HTMLElement;
  private readonly cleanup: (() => void)[] = [];

  private active = false;
  private adsOn = false;
  private canUse = false;
  private panelOpen = false;
  private mapOpen = false;
  private layout: TouchLayout = 'classic';
  private readonly forced = forcedLayout();
  private menuOpen = false;
  private useLabel = '';
  private fireLabel = '';
  private useText = 'USE';
  private fireText = 'FIRE';

  private movePointer = NO_POINTER;
  private moveCX = 0;
  private moveCY = 0;
  private moveRadius = 1;
  private lockArmed = false;
  private sprintLocked = false;
  private readonly look: LookDrag = { pointer: NO_POINTER, x: 0, y: 0, t: 0 };
  private readonly fireDrag: LookDrag = { pointer: NO_POINTER, x: 0, y: 0, t: 0 };
  private fireLeftPointer = NO_POINTER;
  private usePointer = NO_POINTER;
  /** Compact: the look finger is also holding the trigger (it landed as the second tap of a double tap). */
  private lookFiring = false;
  private readonly doubleTap = new DoubleTap();

  constructor(private readonly deps: TouchControlsDeps) {
    this.layer = el('div', 'ds-touch-layer', deps.root);
    this.layer.hidden = true;

    this.moveZone = el('div', 'tz move', this.layer);
    this.stickEl = el('div', 'stick', this.moveZone);
    this.knob = el('i', 'knob', this.stickEl);
    this.runLock = el('div', 'runlock', this.moveZone, 'RUN');
    this.lookZone = el('div', 'tz look', this.layer);

    this.fireBtn = this.button('fire', 'FIRE', 'Fire');
    this.fireLeftBtn = this.button('fire-left', 'FIRE', 'Fire (left thumb)');
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

    // ---- compact layout: a menu dot, and the mini menu it opens (the game keeps running underneath) ----
    this.menuBtn = this.button('menu', '', 'More actions');
    for (let i = 0; i < 3; i++) el('i', '', this.menuBtn);
    this.menuBtn.setAttribute('aria-expanded', 'false');
    this.menuEl = el('div', 'tmenu', this.layer);
    this.menuEl.hidden = true;
    const extra = deps.menuExtra;
    if (extra) this.tile('extra', extra.label, () => extra.onTap());
    const tiles: [label: string, action: TapAction][] = [
      ['SWAP WEAPON', 'swap'],
      ['THROW', 'grenade'],
      ['RELOAD', 'reload'],
      ['PLATE', 'plate'],
      ['JUMP', 'jump'],
      ['CROUCH', 'crouch'],
      ['MAP', 'map'],
    ];
    for (const [label, action] of tiles) this.tile(action, label, () => this.deps.input.tap(action));
    this.tile('pause', 'PAUSE', () => this.deps.onPause());
    this.press(this.menuBtn, () => this.setMenu(!this.menuOpen));
    // A touch anywhere but a tile or the dot closes the menu, and then goes on to do whatever it normally does.
    const outside = (e: PointerEvent): void => {
      if (!this.menuOpen) return;
      const t = e.target;
      if (t instanceof Element && (t.closest('.tm') || this.menuBtn.contains(t))) return;
      this.setMenu(false);
    };
    this.layer.addEventListener('pointerdown', outside, { capture: true });
    this.cleanup.push(() => this.layer.removeEventListener('pointerdown', outside, { capture: true }));

    this.rotate = el('div', 'ds-rotate', deps.root, 'TURN YOUR PHONE SIDEWAYS TO PLAY');

    // ---- move stick: appears where the thumb lands ----
    this.on(this.moveZone, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (this.tapHud(e.clientX, e.clientY)) return;
      if (this.movePointer !== NO_POINTER) return;
      // touching the stick again is how a locked sprint is released
      if (this.sprintLocked) this.setSprintLock(false);
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
      // the RUN target sits straight above the stick, pulled down if that would be off the top of the screen
      const lockY = Math.max(zone.top + r * 0.5, this.moveCY - r * 2.2);
      this.runLock.style.left = `${this.moveCX - zone.left}px`;
      this.runLock.style.top = `${lockY - zone.top}px`;
      this.applyStick(e);
    });
    this.on(this.moveZone, 'pointermove', (e) => {
      if (e.pointerId === this.movePointer) this.applyStick(e);
    });
    this.release(this.moveZone, (e) => {
      if (e.pointerId !== this.movePointer) return;
      const lock = this.lockArmed;
      this.releaseStick();
      if (lock) this.setSprintLock(true);
    });

    // ---- look: drag anywhere on the right ----
    this.on(this.lookZone, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (this.tapHud(e.clientX, e.clientY)) return;
      if (this.look.pointer !== NO_POINTER) return;
      this.beginDrag(this.look, e);
      capture(this.lookZone, e);
      // compact: the second tap of a double tap holds the trigger until this finger lifts, and still drags the aim
      if (this.layout === 'compact' && this.doubleTap.down(e.timeStamp, e.clientX, e.clientY)) {
        this.lookFiring = true;
        buzz(8);
        this.syncFire();
      }
    });
    this.on(this.lookZone, 'pointermove', (e) => this.drag(this.look, e));
    this.release(this.lookZone, (e) => {
      if (e.pointerId !== this.look.pointer) return;
      this.look.pointer = NO_POINTER;
      // only a finger that really lifted can be the first half of a double tap
      if (e.type === 'pointerup') this.doubleTap.up(e.timeStamp, e.clientX, e.clientY);
      else this.doubleTap.reset();
      if (this.lookFiring) {
        this.lookFiring = false;
        this.syncFire();
      }
    });

    // ---- fire: hold to shoot, and keep dragging on it to aim while shooting ----
    this.on(this.fireBtn, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (this.fireDrag.pointer !== NO_POINTER) return;
      this.beginDrag(this.fireDrag, e);
      capture(this.fireBtn, e);
      this.fireBtn.classList.add('down');
      buzz(8);
      this.syncFire();
    });
    this.on(this.fireBtn, 'pointermove', (e) => this.drag(this.fireDrag, e));
    this.release(this.fireBtn, (e) => {
      if (e.pointerId !== this.fireDrag.pointer) return;
      this.fireDrag.pointer = NO_POINTER;
      this.fireBtn.classList.remove('down');
      this.syncFire();
    });

    // ---- second fire button for the left thumb, so the right one can stay on the aim ----
    this.on(this.fireLeftBtn, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      if (this.fireLeftPointer !== NO_POINTER) return;
      this.fireLeftPointer = e.pointerId;
      capture(this.fireLeftBtn, e);
      this.fireLeftBtn.classList.add('down');
      buzz(8);
      this.syncFire();
    });
    this.release(this.fireLeftBtn, (e) => {
      if (e.pointerId !== this.fireLeftPointer) return;
      this.fireLeftPointer = NO_POINTER;
      this.fireLeftBtn.classList.remove('down');
      this.syncFire();
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
      buzz(8);
      this.deps.input.setInteract(true);
    });
    this.release(this.useBtn, (e) => {
      if (e.pointerId === this.usePointer) this.releaseUse();
    });

    this.press(this.mapBtn, () => this.deps.input.tap('map'));
    this.press(pauseBtn, () => this.deps.onPause());

    this.setLayout(deps.layout ?? 'classic');

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

  /** A mini-menu tile: acts the moment it is touched, and the menu closes with it. */
  private tile(cls: string, label: string, fn: () => void): void {
    const b = el('button', `tm ${cls}`, this.menuEl, label);
    b.type = 'button';
    b.tabIndex = -1;
    this.on(b, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      buzz(8);
      this.setMenu(false);
      fn();
    });
  }

  private setMenu(open: boolean): void {
    if (open === this.menuOpen) return;
    this.menuOpen = open;
    this.menuEl.hidden = !open;
    this.menuBtn.classList.toggle('on', open);
    this.menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /** A button that acts once, the moment it is touched. */
  private press(b: HTMLButtonElement, fn: () => void): void {
    this.on(b, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      b.classList.add('down');
      buzz(8);
      fn();
    });
    this.release(b, () => b.classList.remove('down'));
  }

  // ---- look drags ----

  private beginDrag(d: LookDrag, e: PointerEvent): void {
    d.pointer = e.pointerId;
    d.x = e.clientX;
    d.y = e.clientY;
    d.t = e.timeStamp;
  }

  private drag(d: LookDrag, e: PointerEvent): void {
    if (e.pointerId !== d.pointer) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const gain = lookGain(Math.hypot(dx, dy), e.timeStamp - d.t);
    this.deps.input.addLook(dx * gain, dy * gain);
    d.x = e.clientX;
    d.y = e.clientY;
    d.t = e.timeStamp;
  }

  /** Either fire button held, or a double tap still down, means the trigger is held. */
  private syncFire(): void {
    this.deps.input.setFire(this.fireDrag.pointer !== NO_POINTER || this.fireLeftPointer !== NO_POINTER || this.lookFiring);
  }

  // ---- move stick ----

  private applyStick(e: PointerEvent): void {
    const dx = e.clientX - this.moveCX;
    const dy = e.clientY - this.moveCY;
    const s = stick(dx, dy, this.moveRadius);
    this.deps.input.setStick(s.strafe, s.forward, s.sprint);
    this.knob.style.transform = `translate(${s.knobX.toFixed(1)}px, ${s.knobY.toFixed(1)}px)`;
    this.stickEl.classList.toggle('sprint', s.sprint);
    // RUN shows once the stick is sprinting; sliding up onto it arms the lock, which takes effect on release
    const armed = s.sprint && wantsSprintLock(dx, dy, this.moveRadius);
    this.runLock.classList.toggle('show', s.sprint);
    if (armed !== this.lockArmed) {
      this.lockArmed = armed;
      this.runLock.classList.toggle('armed', armed);
      if (armed) buzz(12);
    }
  }

  private releaseStick(): void {
    this.movePointer = NO_POINTER;
    this.lockArmed = false;
    this.deps.input.setStick(0, 0, false);
    this.knob.style.transform = '';
    this.stickEl.style.left = '';
    this.stickEl.style.top = '';
    this.stickEl.classList.remove('live', 'sprint');
    this.runLock.classList.remove('show', 'armed');
    this.runLock.style.left = '';
    this.runLock.style.top = '';
  }

  /** Locked: the player keeps sprinting straight ahead with the left thumb free, until the stick is touched again. */
  private setSprintLock(on: boolean): void {
    this.sprintLocked = on;
    this.runLock.classList.toggle('locked', on);
    this.runLock.textContent = on ? 'RUNNING' : 'RUN';
    this.stickEl.classList.toggle('idle-hidden', on);
    this.deps.input.setStick(0, on ? 1 : 0, on);
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

  // ---- taps that land on the HUD ----

  private inside(selector: string, x: number, y: number): HTMLElement | null {
    for (const node of this.deps.root.querySelectorAll<HTMLElement>(selector)) {
      const r = node.getBoundingClientRect();
      if (r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return node;
    }
    return null;
  }

  /**
   * The HUD ignores pointers so it can never swallow a look or a move, which means a tap on it arrives at the zone
   * underneath. A few HUD elements are meant to be tapped on a phone, so the tap is matched to them by position:
   * anywhere closes the tactical map, a station row buys it, and the weapon readout swaps weapons.
   */
  private tapHud(x: number, y: number): boolean {
    const input = this.deps.input;
    if (this.mapOpen) {
      input.tap('map');
      return true;
    }
    if (this.panelOpen) {
      const row = this.inside('.ds-station:not([hidden]) .it', x, y);
      if (row) {
        const n = Number.parseInt(row.querySelector('kbd')?.textContent ?? '', 10);
        if (Number.isInteger(n)) {
          input.digit(n);
          buzz(8);
        }
        return true;
      }
      return false;
    }
    if (this.inside('.ds-weapon', x, y)) {
      input.tap('swap');
      buzz(8);
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
    if (this.sprintLocked) this.setSprintLock(false);
    this.look.pointer = NO_POINTER;
    this.fireDrag.pointer = NO_POINTER;
    this.fireLeftPointer = NO_POINTER;
    this.lookFiring = false;
    this.doubleTap.reset();
    this.syncFire();
    this.releaseUse();
    this.setAds(false);
    this.setMenu(false);
    for (const b of this.layer.querySelectorAll('.tb.down')) b.classList.remove('down');
  }

  setLayout(layout: TouchLayout): void {
    const next = this.forced ?? layout;
    if (next === this.layout) return;
    this.layout = next;
    this.layer.classList.toggle('compact', next === 'compact');
    // the HUD outside this layer moves for the compact layout too (the prompt leaves the middle of the screen)
    document.documentElement.classList.toggle('ds-touch-compact', next === 'compact');
    // Controls that exist in only one layout must not be left held when they disappear.
    const wasHeld = this.fireLeftPointer !== NO_POINTER || this.lookFiring;
    this.fireLeftPointer = NO_POINTER;
    this.fireLeftBtn.classList.remove('down');
    this.lookFiring = false;
    this.doubleTap.reset();
    if (wasHeld) this.syncFire();
    if (this.adsOn) this.setAds(false);
    this.setMenu(false);
    this.syncLabels();
  }

  /** The words on USE and FIRE. Classic always says USE / FIRE; compact uses the game's word when it gives one. */
  private syncLabels(): void {
    const compact = this.layout === 'compact';
    const use = this.panelOpen ? 'CLOSE' : (compact && this.useLabel) || 'USE';
    const fire = (compact && this.fireLabel) || 'FIRE';
    if (use !== this.useText) {
      this.useText = use;
      this.useBtn.textContent = use;
      this.useBtn.classList.toggle('long', use.length > 7);
    }
    if (fire !== this.fireText) {
      this.fireText = fire;
      this.fireBtn.textContent = fire;
      this.fireBtn.classList.toggle('long', fire.length > 6);
    }
  }

  update(ctx: TouchContext): void {
    if (ctx.canUse !== this.canUse || ctx.panelOpen !== this.panelOpen) {
      this.canUse = ctx.canUse;
      this.panelOpen = ctx.panelOpen;
      const show = ctx.canUse || ctx.panelOpen;
      if (!show && this.usePointer !== NO_POINTER) this.releaseUse();
      this.useBtn.hidden = !show;
      this.layer.classList.toggle('panel-open', ctx.panelOpen);
      // a station menu opens over the place the mini menu uses
      if (ctx.panelOpen) this.setMenu(false);
      this.syncLabels();
    }
    if (ctx.mapOpen !== this.mapOpen) {
      this.mapOpen = ctx.mapOpen;
      this.layer.classList.toggle('map-open', ctx.mapOpen);
      this.mapBtn.textContent = ctx.mapOpen ? 'CLOSE' : 'MAP';
      if (ctx.mapOpen) this.setMenu(false);
    }
    const useLabel = ctx.useLabel ?? '';
    const fireLabel = ctx.fireLabel ?? '';
    if (useLabel !== this.useLabel || fireLabel !== this.fireLabel) {
      this.useLabel = useLabel;
      this.fireLabel = fireLabel;
      this.syncLabels();
    }
  }

  dispose(): void {
    this.setActive(false);
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
    this.layer.remove();
    this.rotate.remove();
    document.documentElement.classList.remove('ds-touch-compact');
  }
}

export function createTouchControls(deps: TouchControlsDeps): TouchControlsApi {
  return new TouchControls(deps);
}
