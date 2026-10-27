/**
 * Walking and flying: mouse-look with pointer lock and WASD on a computer; a thumb stick (wherever the left thumb
 * lands) and drag-to-look on a phone. Nothing else - there is nothing to shoot here.
 */
import * as THREE from 'three';
import { ARENA_RADIUS, type Collider } from './world';

const EYE = 1.7;
const RADIUS = 0.4;

export class Controls {
  readonly pos = new THREE.Vector3(13, EYE, 36);
  yaw = 0.33;
  pitch = 0.02;
  fly = false;
  /** a jump (or, flying, a climb) is held */
  up = false;
  /** asked to switch flying on or off (a double-tap of Space) */
  onToggleFly: () => void = () => {};
  /** the player moved or looked (the page leaves the film camera for it) */
  onInput: () => void = () => {};
  /** where the view is heading: mouse and touch turn these, and the view eases after them */
  private aimYaw = 0.33;
  private aimPitch = 0.02;
  private vy = 0;
  private grounded = true;
  private readonly keys = new Set<string>();
  private readonly joy = { id: -1, x0: 0, y0: 0, x: 0, y: 0 };
  private readonly look = { id: -1, x: 0, y: 0 };

  constructor(
    canvas: HTMLCanvasElement,
    private readonly stick: { base: HTMLElement; knob: HTMLElement },
  ) {
    let lastSpace = 0;
    const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyQ', 'ControlLeft']);
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (MOVE.has(e.code)) this.onInput();
      if (e.code === 'Space') {
        e.preventDefault();
        this.up = true;
        // tap Space twice to take off (or to land)
        const now = performance.now();
        if (now - lastSpace < 300) this.onToggleFly();
        lastSpace = now;
      }
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.up = false;
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.up = false;
    });
    canvas.addEventListener('click', () => {
      if (matchMedia('(pointer: fine)').matches && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    // mouse-look: pointer lock when the browser allows it, otherwise hold the button and drag. Browsers now and
    // then report a huge jump in one event: those are dropped, not turned into a snap of the view.
    addEventListener('mousemove', (e) => {
      if (Math.abs(e.movementX) > 220 || Math.abs(e.movementY) > 220) return;
      const locked = document.pointerLockElement === canvas;
      if (!locked && !(e.buttons & 1 && e.target === canvas)) return;
      if (e.movementX || e.movementY) this.onInput();
      const k = locked ? 0.0022 : 0.004;
      this.turn(e.movementX * k, e.movementY * k);
    });
    canvas.addEventListener('touchstart', (e) => this.touchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.touchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.touchEnd(e));
    canvas.addEventListener('touchcancel', (e) => this.touchEnd(e));
  }

  private turn(dx: number, dy: number): void {
    this.aimYaw -= dx;
    this.aimPitch = THREE.MathUtils.clamp(this.aimPitch - dy, -1.45, 1.45);
  }

  /** Point the view straight at (yaw, pitch), with no easing. */
  setLook(yaw: number, pitch: number): void {
    this.yaw = this.aimYaw = yaw;
    this.pitch = this.aimPitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);
  }

  /** Ease the view after the aim: smooth, but quick enough to feel direct. */
  private ease(dt: number): void {
    const k = 1 - Math.exp(-dt * 28);
    this.yaw += (this.aimYaw - this.yaw) * k;
    this.pitch += (this.aimPitch - this.pitch) * k;
  }

  private touchStart(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < innerWidth * 0.45 && this.joy.id < 0) {
        Object.assign(this.joy, { id: t.identifier, x0: t.clientX, y0: t.clientY, x: 0, y: 0 });
        this.stick.base.style.transform = `translate(${t.clientX - 60}px, ${t.clientY - 60}px)`;
        this.stick.knob.style.transform = 'translate(0px, 0px)';
        this.stick.base.classList.add('on');
        this.onInput();
      } else if (this.look.id < 0) {
        this.onInput();
        Object.assign(this.look, { id: t.identifier, x: t.clientX, y: t.clientY });
      }
    }
  }

  private touchMove(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joy.id) {
        let dx = t.clientX - this.joy.x0;
        let dy = t.clientY - this.joy.y0;
        const len = Math.hypot(dx, dy);
        if (len > 50) (dx *= 50 / len), (dy *= 50 / len);
        this.joy.x = dx / 50;
        this.joy.y = dy / 50;
        this.stick.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (t.identifier === this.look.id) {
        this.turn((t.clientX - this.look.x) * 0.0055, (t.clientY - this.look.y) * 0.0055);
        this.look.x = t.clientX;
        this.look.y = t.clientY;
      }
    }
  }

  private touchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joy.id) {
        Object.assign(this.joy, { id: -1, x: 0, y: 0 });
        this.stick.base.classList.remove('on');
      } else if (t.identifier === this.look.id) this.look.id = -1;
    }
  }

  update(dt: number, colliders: Collider[], heightAt: (x: number, z: number) => number = () => 0): void {
    this.ease(dt);
    const k = this.keys;
    let fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - this.joy.y;
    let side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.joy.x;
    const len = Math.hypot(fwd, side);
    if (len > 1) (fwd /= len), (side /= len);
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.95;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);

    if (this.fly) {
      const speed = run ? 32 : 14;
      const cp = Math.cos(this.pitch);
      const sp = Math.sin(this.pitch);
      this.pos.x += (-sy * cp * fwd + cy * side) * speed * dt;
      this.pos.z += (-cy * cp * fwd - sy * side) * speed * dt;
      this.pos.y += (sp * fwd + (this.up ? 1 : 0) - (k.has('ControlLeft') || k.has('KeyQ') ? 1 : 0)) * speed * dt;
      this.pos.y = Math.min(this.pos.y, 120);
      this.vy = 0;
    } else {
      const speed = run ? 10 : 5;
      this.pos.x += (-sy * fwd + cy * side) * speed * dt;
      this.pos.z += (-cy * fwd - sy * side) * speed * dt;
      if (this.up && this.grounded) {
        this.vy = 6.5;
        this.grounded = false;
      }
      this.vy -= 20 * dt;
      this.pos.y += this.vy * dt;
    }

    // stand on the ground or on top of whatever is underfoot; walls push you out
    let floor = EYE + heightAt(this.pos.x, this.pos.z);
    const feet = this.pos.y - EYE;
    for (const c of colliders) {
      const dx = this.pos.x - c.x;
      const dz = this.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const reach = c.r + RADIUS;
      if (d >= reach) continue;
      if (feet >= c.h - 0.35) {
        floor = Math.max(floor, c.h + EYE);
        continue;
      }
      const push = (reach - d) / (d || 1);
      this.pos.x += dx * push;
      this.pos.z += dz * push;
    }
    const out = Math.hypot(this.pos.x, this.pos.z);
    if (out > ARENA_RADIUS) this.pos.multiplyScalar(1).set((this.pos.x / out) * ARENA_RADIUS, this.pos.y, (this.pos.z / out) * ARENA_RADIUS);
    if (!this.fly && this.pos.y <= floor) {
      this.pos.y = floor;
      this.vy = 0;
      this.grounded = true;
    } else if (this.fly) this.pos.y = Math.max(this.pos.y, floor);
  }

  apply(cam: THREE.PerspectiveCamera): void {
    cam.position.copy(this.pos);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
