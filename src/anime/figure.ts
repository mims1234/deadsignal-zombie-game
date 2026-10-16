/**
 * A posable stand-in skeleton: pelvis, torso, head, two-bone arms and legs, and a rifle mount, posed by one procedural
 * animation (the zombie gait, reach, swipe, stagger and fall; a soldier's carry, aim and fire). What it wears is up to
 * a `Style` (the bestiary's style lab dresses it; the Sakura District's infected leave it bare and drive a VRoid model
 * from its joints). It faces -Z with +X on its right and implements `ZombieRig`.
 */
import * as THREE from 'three';
import { mulberry32 } from '../enemies/zombie/prng';
import type { ZombieAnimState, ZombieRig } from '../enemies/zombieRigTypes';

export type Form = 'squad' | 'zombie';

export interface Dims {
  foot: number;
  thigh: number;
  shin: number;
  torso: number;
  neck: number;
  head: number;
  upper: number;
  fore: number;
  shoulderX: number;
  hipX: number;
  /** Rifle scale. */
  gun: number;
}


const DOWN = new THREE.Vector3(0, -1, 0);
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();

export type JointName = 'pelvis' | 'torso' | 'head' | 'armL' | 'foreL' | 'armR' | 'foreR' | 'legL' | 'shinL' | 'legR' | 'shinR' | 'gun';

export interface Style {
  id: string;
  name: string;
  tagline: string;
  lore: string;
  /** What the look costs: how it is built, and what it would take in the game. */
  notes: string;
  dims: (form: Form) => Dims;
  dress: (f: StyleFigure, form: Form, rnd: () => number) => void;
  /** Limbs are one straight piece (no elbows or knees). */
  stiff?: boolean;
  /** Render the whole view at this fraction of the screen's resolution, scaled up with hard pixels. */
  pixel?: number;
  /** Per-frame hook (shader clocks, glitches). */
  tick?: (f: StyleFigure, time: number) => void;
}

// ---------------------------------------------------------------------------------------------
// the figure
// ---------------------------------------------------------------------------------------------

export class StyleFigure implements ZombieRig {
  readonly type = 'shambler' as const;
  readonly root = new THREE.Group();
  readonly radius = 0.3;
  readonly height: number;
  readonly headRadius: number;
  readonly D: Dims;
  readonly form: Form;
  readonly J: Record<JointName, THREE.Group>;
  /** Pivot at the feet: the whole body turns about it to fall. */
  private readonly fall = new THREE.Group();
  private readonly pelvisY: number;
  /** Muzzle flash, when the style made one (child of the gun). */
  flash: THREE.Object3D | null = null;
  /** Rifle hand points in the gun's frame. */
  grip = new THREE.Vector3(0, -0.07, 0.02);
  support = new THREE.Vector3(0, -0.05, -0.3);
  /** Shared shader clocks the style wants advanced. */
  readonly uniforms: { value: number }[] = [];
  private phase = 0;

  constructor(
    readonly style: Style,
    form: Form,
    seed: number,
  ) {
    this.form = form;
    const D = (this.D = style.dims(form));
    this.pelvisY = D.foot + D.shin + D.thigh;
    this.height = this.pelvisY + D.torso + D.neck + D.head;
    this.headRadius = D.head * 0.5;
    const g = (): THREE.Group => new THREE.Group();
    const J = (this.J = { pelvis: g(), torso: g(), head: g(), armL: g(), foreL: g(), armR: g(), foreR: g(), legL: g(), shinL: g(), legR: g(), shinR: g(), gun: g() });
    this.root.add(this.fall);
    this.fall.add(J.pelvis);
    J.pelvis.add(J.torso, J.legL, J.legR);
    J.torso.add(J.head, J.armL, J.armR);
    if (form === 'squad') J.torso.add(J.gun);
    J.armL.add(J.foreL);
    J.armR.add(J.foreR);
    J.legL.add(J.shinL);
    J.legR.add(J.shinR);
    this.layout();
    this.reset(seed);
  }

  private layout(): void {
    const { D, J } = this;
    J.pelvis.position.set(0, this.pelvisY, 0);
    J.head.position.set(0, D.torso + D.neck, 0);
    J.armL.position.set(-D.shoulderX, D.torso - 0.05 * (D.torso / 0.52), 0);
    J.armR.position.set(D.shoulderX, D.torso - 0.05 * (D.torso / 0.52), 0);
    J.foreL.position.y = J.foreR.position.y = -D.upper;
    J.legL.position.set(-D.hipX, 0, 0);
    J.legR.position.set(D.hipX, 0, 0);
    J.shinL.position.y = J.shinR.position.y = -D.thigh;
    // the rifle at the chest, a little right of centre
    J.gun.position.set(D.shoulderX * 0.45, D.torso * 0.72, -D.upper * 0.45);
    J.gun.scale.setScalar(D.gun);
  }

  /** Add a dressing mesh to a joint. */
  put<T extends THREE.Object3D>(joint: JointName, o: T, x = 0, y = 0, z = 0): T {
    o.position.set(x, y, z);
    o.userData.dress = true;
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && m.userData.noShadow !== true) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.J[joint].add(o);
    return o;
  }

  /** Meshes and line sets, i.e. roughly draw calls for one figure (outline shells count). */
  drawCalls(): number {
    let n = 0;
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh || (o as THREE.LineSegments).isLineSegments) n++;
    });
    return n;
  }

  reset(seed: number): void {
    this.phase = (seed % 1000) * 0.37;
    for (const j of Object.values(this.J)) {
      for (const c of [...j.children]) {
        if (c.userData.dress) {
          c.removeFromParent();
          disposeTree(c);
        }
      }
    }
    this.flash = null;
    this.uniforms.length = 0;
    this.style.dress(this, this.form, mulberry32(seed * 7919 + 13));
  }

  update(s: ZombieAnimState, _dt: number): void {
    pose(this, s, this.time(s.time));
    this.style.tick?.(this, s.time);
    for (const u of this.uniforms) u.value = s.time;
  }

  private time(t: number): number {
    return t + this.phase;
  }

  /** Point an arm (two bones, or one when `stiff`) so its hand reaches `target` in the torso frame. */
  reach(side: 'L' | 'R', target: THREE.Vector3, pole: THREE.Vector3): void {
    const arm = this.J[`arm${side}`];
    const fore = this.J[`fore${side}`];
    const L1 = this.D.upper;
    const L2 = this.style.stiff ? 0 : this.D.fore + 0.04;
    const d = V1.copy(target).sub(arm.position);
    if (this.style.stiff) {
      arm.quaternion.setFromUnitVectors(DOWN, d.normalize());
      fore.quaternion.identity();
      return;
    }
    const dist = THREE.MathUtils.clamp(d.length(), 0.05, L1 + L2 - 0.002);
    const dir = d.normalize();
    const cosA = THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const n = V2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbowDir = V3.copy(dir).multiplyScalar(cosA).addScaledVector(n, sinA);
    arm.quaternion.setFromUnitVectors(DOWN, elbowDir);
    // the hand, from the elbow, in the upper arm's frame
    const elbow = elbowDir.multiplyScalar(L1).add(arm.position);
    const local = V2.copy(target).sub(elbow).normalize().applyQuaternion(Q1.copy(arm.quaternion).invert());
    fore.quaternion.setFromUnitVectors(DOWN, local);
  }

  pelvisBase(): number {
    return this.pelvisY;
  }

  getFall(): THREE.Group {
    return this.fall;
  }

  getHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.J.head.localToWorld(out.set(0, this.D.head * 0.5, 0));
  }
  getChestWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.J.torso.localToWorld(out.set(0, this.D.torso * 0.7, 0));
  }
  getHandWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.J.foreR.localToWorld(out.set(0, -this.D.fore, 0));
  }
  setVisible(v: boolean): void {
    this.root.visible = v;
  }
  dispose(): void {
    disposeTree(this.root);
  }
}

export function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture && v.userData.keep !== true) v.dispose();
      if (mat.userData.keep !== true) mat.dispose();
    }
  });
}

// ---------------------------------------------------------------------------------------------
// the one animation every style shares
// ---------------------------------------------------------------------------------------------

const ease = (k: number): number => k * k * (3 - 2 * k);
const POLE_R = new THREE.Vector3(0.8, -1, 0.3);
const POLE_L = new THREE.Vector3(-0.8, -1, 0.4);
const HAND = new THREE.Vector3();

function pose(f: StyleFigure, s: ZombieAnimState, t: number): void {
  const { J, D } = f;
  for (const j of Object.values(J)) j.rotation.set(0, 0, 0);
  const fall = f.getFall();
  fall.rotation.set(0, 0, 0);
  fall.position.set(0, 0, 0);
  J.pelvis.position.y = f.pelvisBase();
  J.gun.position.set(D.shoulderX * 0.45, D.torso * 0.72, -D.upper * 0.45);
  if (f.flash) f.flash.visible = false;
  const zombie = f.form === 'zombie';
  const stiff = f.style.stiff === true;
  const legLen = D.thigh + D.shin;

  // legs: a gait cycle when moving
  const moving = s.mode === 'walk' || s.mode === 'run' || s.mode === 'charge';
  const run = s.mode === 'run' || s.mode === 'charge';
  const hz = run ? 1.55 : zombie ? 0.85 : 1;
  const ph = t * Math.PI * 2 * hz;
  if (moving) {
    const A = run ? 0.8 : 0.42;
    const limp = zombie && !run ? 0.55 : 1;
    J.legL.rotation.x = A * Math.sin(ph);
    J.legR.rotation.x = -A * limp * Math.sin(ph);
    if (!stiff) {
      J.shinL.rotation.x = -(run ? 1.3 : 0.7) * Math.max(0, Math.cos(ph));
      J.shinR.rotation.x = -(run ? 1.3 : 0.7) * limp * Math.max(0, -Math.cos(ph));
    }
    J.pelvis.position.y -= (run ? 0.06 : 0.025) * Math.abs(Math.cos(ph)) * (legLen / 0.87);
    J.pelvis.rotation.y = 0.12 * Math.sin(ph);
    J.torso.rotation.y = -0.18 * Math.sin(ph);
    J.torso.rotation.x = run ? -0.32 : -0.06;
  } else {
    // weight on one leg
    J.pelvis.rotation.z = 0.03 * Math.sin(t * 0.9);
    if (!stiff) {
      J.legL.rotation.x = 0.06;
      J.shinL.rotation.x = -0.1;
    }
  }

  if (zombie) {
    // hunched, head lolling, arms reaching
    J.torso.rotation.x += -0.22;
    J.torso.rotation.z += 0.06 * Math.sin(t * 0.7);
    J.head.rotation.z = 0.28 + 0.12 * Math.sin(t * 0.55);
    J.head.rotation.x = 0.15 + 0.08 * Math.sin(t * 1.3) * s.aggro;
    const reach = moving ? (run ? 0.9 : 1.35) : 0.55;
    const sw = moving ? Math.sin(ph) : Math.sin(t * 1.1);
    J.armL.rotation.set(reach + 0.15 * sw + (run ? 0.6 * Math.sin(ph + Math.PI) : 0), 0, -0.12);
    J.armR.rotation.set(reach - 0.12 * sw + (run ? 0.6 * Math.sin(ph) : 0), 0, 0.12 + (moving ? 0 : 0.1));
    if (!stiff) {
      J.foreL.rotation.x = moving ? 0.15 : 0.35;
      J.foreR.rotation.x = moving ? 0.3 : 0.5;
    }
    if (s.mode === 'attack' || s.mode === 'slam' || s.mode === 'roar') {
      const a = s.actionT;
      let arms: number;
      let lean: number;
      if (a < 0.55) {
        const k = ease(a / 0.55);
        arms = 1.2 + 1.5 * k;
        lean = -0.22 + 0.32 * k;
      } else if (a < 0.72) {
        const k = ease((a - 0.55) / 0.17);
        arms = 2.7 - 2.1 * k;
        lean = 0.1 - 0.75 * k;
      } else {
        const k = ease((a - 0.72) / 0.28);
        arms = 0.6 + 0.6 * k;
        lean = -0.65 + 0.43 * k;
      }
      J.armL.rotation.set(arms, 0, -0.25);
      J.armR.rotation.set(arms, 0, 0.25);
      J.foreL.rotation.x = J.foreR.rotation.x = stiff ? 0 : 0.4;
      J.torso.rotation.x = lean;
      J.head.rotation.x = lean * -0.6;
    }
  } else {
    // a soldier carries the rifle at low ready, shoulders it to fire
    const firing = s.mode === 'attack';
    let pitch = firing ? 0 : moving ? -0.75 : -0.55;
    if (firing) {
      const every = 0.11;
      const burst = s.time % 1.6 < 0.65;
      const k = burst ? 1 - (s.time % every) / every : 0;
      pitch += 0.06 * k;
      J.gun.position.z += 0.035 * k;
      J.torso.rotation.x += -0.05 + 0.02 * k;
      if (f.flash) {
        f.flash.visible = burst && k > 0.55;
        f.flash.rotation.z = s.time * 40;
      }
    } else {
      J.gun.position.y -= 0.06;
      J.gun.position.x -= 0.03;
    }
    J.gun.rotation.set(pitch, firing ? 0.02 : 0.35, firing ? 0 : 0.2);
    J.head.rotation.x = firing ? 0.12 : moving ? 0 : 0.05;
    J.head.rotation.y = firing ? 0 : 0.15 * Math.sin(t * 0.4);
    J.gun.updateMatrix();
    f.reach('R', HAND.copy(f.grip).applyMatrix4(J.gun.matrix), POLE_R);
    f.reach('L', HAND.copy(f.support).applyMatrix4(J.gun.matrix), POLE_L);
  }

  // breathing
  J.torso.rotation.x += 0.015 * Math.sin(t * 1.7);

  if (s.mode === 'stagger') {
    const k = Math.sin(Math.PI * s.staggerT);
    J.torso.rotation.x += 0.45 * k;
    J.head.rotation.x -= 0.4 * k;
    J.pelvis.position.z = 0.08 * k;
    if (zombie) {
      J.armL.rotation.z -= 0.7 * k;
      J.armR.rotation.z += 0.7 * k;
    }
  }

  if (s.mode === 'death') {
    const k = Math.min(1, s.deathT / 0.85);
    const e = k * k;
    const settle = k >= 1 ? Math.exp(-(s.deathT - 0.85) * 9) * Math.sin((s.deathT - 0.85) * 30) * 0.04 : 0;
    const lie = (Math.PI / 2) * e + settle;
    const thick = D.head * 0.45;
    if (s.deathStyle === 0) fall.rotation.x = lie;
    else if (s.deathStyle === 1) fall.rotation.x = -lie;
    else fall.rotation.z = lie;
    fall.position.y = thick * e;
    // limbs go loose
    J.armL.rotation.set(0.3 + 1.2 * e, 0, -0.9 * e);
    J.armR.rotation.set(0.5 + 0.9 * e, 0, 1.1 * e);
    J.foreL.rotation.set(stiff ? 0 : 0.5 * e, 0, 0);
    J.foreR.rotation.set(stiff ? 0 : 0.3 * e, 0, 0);
    J.legL.rotation.set(0.2 * e, 0, -0.15 * e);
    J.legR.rotation.set(-0.1 * e, 0, 0.2 * e);
    J.shinL.rotation.set(stiff ? 0 : -0.5 * e, 0, 0);
    J.shinR.rotation.set(0, 0, 0);
    J.torso.rotation.set(0, 0, 0);
    J.head.rotation.set(s.deathStyle === 1 ? 0 : -0.3 * e, 0.5 * e, 0);
    J.pelvis.position.y = f.pelvisBase();
    J.pelvis.position.z = 0;
    J.gun.rotation.set(-0.9 * e, 0.6 * e, 0.4 * e);
  }
}

