/**
 * A person in the world who is not you: another player, a soldier or a survivor. A jointed figure with a name tag
 * that walks, holds its weapon in both hands (the arms reach the grip and the handguard each frame), aims and fires,
 * cowers (trapped survivors, hands up) and, when killed, is thrown by the blow and falls (a light ragdoll).
 *
 * Frames: the figure faces -Z with +X on its right. The chest group is the frame the arms and the weapon live in.
 */
import * as THREE from 'three';
import type { SoundId } from '../audio/ids';
import type { AvatarLook } from '../config';
import { addFace, addHair, addOutfit } from './avatarLook';

const UNIFORM = [0x4f6b8a, 0x8a6b4f, 0x5f8a5a];

export type AvatarWeapon = 'rifle' | 'pistol' | 'shotgun' | 'rpg' | 'none';
export const AVATAR_WEAPONS: readonly AvatarWeapon[] = ['rifle', 'pistol', 'shotgun', 'rpg', 'none'];

export interface AvatarStyle {
  /** Clothing colour (defaults to a squad uniform by index). */
  color?: number;
  /** Soldiers wear a helmet and carry a rifle; survivors do not until they are freed. */
  helmet?: boolean;
  /** What the figure carries (defaults to a rifle with a helmet, nothing without). */
  weapon?: AvatarWeapon;
  /** A woman's figure, hair, face and outfit (the Asylum's staff and Lantern team). */
  look?: AvatarLook;
  /** Second line under the name, e.g. a rank. */
  tag?: string;
  tagColor?: string;
}

function nameTag(name: string, sub: string | undefined, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = sub ? 76 : 48;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.font = '600 26px system-ui, sans-serif';
  g.strokeText(name.slice(0, 18), 128, 24, 244);
  g.fillStyle = '#e8f1e0';
  g.fillText(name.slice(0, 18), 128, 24, 244);
  if (sub) {
    g.font = '700 17px system-ui, sans-serif';
    g.lineWidth = 4;
    g.strokeText(sub, 128, 56, 244);
    g.fillStyle = color;
    g.fillText(sub, 128, 56, 244);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.5, sub ? 0.445 : 0.28, 1);
  s.position.y = sub ? 2.22 : 2.12;
  return s;
}

// ---- shared parts (every figure uses the same geometry and gun materials) ----
const UPPER = 0.32;
const FORE = 0.28;
/** Elbow to the middle of the palm: what the arm solver reaches with. */
const PALM = FORE + 0.05;
const THIGH = 0.45;
const SHIN = 0.44;
/** Shoulder joints in the chest frame (the chest group sits at the waist, 1.02 m up). */
const SHOULDER_Y = 0.47;

let parts: ReturnType<typeof makeParts> | null = null;
function makeParts() {
  const box = (w: number, h: number, d: number, ty = 0, tz = 0) => new THREE.BoxGeometry(w, h, d).translate(0, ty, tz);
  return {
    gunMetal: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.45, metalness: 0.6 }),
    gunPoly: new THREE.MeshStandardMaterial({ color: 0x2e3329, roughness: 0.8 }),
    rpgTube: new THREE.MeshStandardMaterial({ color: 0x4b5a3a, roughness: 0.7 }),
    flash: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    upper: box(0.12, UPPER + 0.04, 0.13, -UPPER / 2),
    fore: box(0.1, FORE, 0.11, -FORE / 2),
    hand: box(0.08, 0.1, 0.06, -0.05),
    thigh: box(0.17, THIGH, 0.19, -THIGH / 2),
    shin: box(0.14, SHIN, 0.16, -SHIN / 2),
    boot: box(0.15, 0.1, 0.27, -0.05, -0.04),
    flashGeo: new THREE.ConeGeometry(0.06, 0.24, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.12),
  };
}

interface Limb {
  root: THREE.Group;
  joint: THREE.Group;
}

/** Hand points and the muzzle in the weapon's own frame, and where the weapon sits in the chest frame. */
interface GunRig {
  model: THREE.Group;
  /** Weapon origin in the chest frame (the stock's shoulder pocket for long guns). */
  at: THREE.Vector3;
  grip: THREE.Vector3;
  support: THREE.Vector3;
  muzzle: THREE.Vector3;
  /** Where each elbow points. */
  poleR: THREE.Vector3;
  poleL: THREE.Vector3;
  sound: SoundId;
  kick: number;
}

function gunRig(kind: AvatarWeapon): GunRig {
  const P = parts!;
  const m = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0): void => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    m.add(mesh);
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const tube = (r: number, len: number) => new THREE.CylinderGeometry(r, r, len, 8).rotateX(Math.PI / 2);
  if (kind === 'pistol') {
    // two hands out in front, at chin height
    add(new THREE.BoxGeometry(0.035, 0.045, 0.19), P.gunMetal, 0, 0.02, -0.07);
    add(new THREE.BoxGeometry(0.032, 0.11, 0.045), P.gunPoly, 0, -0.04, 0.01, -0.25);
    return { model: m, at: v(0.06, 0.4, -0.42), grip: v(0, -0.03, 0.01), support: v(-0.035, -0.05, 0.0), muzzle: v(0, 0.02, -0.17), poleR: v(0.9, -1, 0.3), poleL: v(-0.9, -1, 0.3), sound: 'pistol_shot', kick: 0.05 };
  }
  if (kind === 'rpg') {
    // on the right shoulder, the tube running past the head
    add(tube(0.055, 1.05), P.rpgTube, 0, 0, -0.1);
    add(new THREE.ConeGeometry(0.07, 0.24, 8).rotateX(-Math.PI / 2), P.gunPoly, 0, 0, -0.74);
    add(new THREE.BoxGeometry(0.035, 0.12, 0.05), P.gunPoly, 0, -0.1, -0.12, -0.2);
    add(new THREE.BoxGeometry(0.035, 0.11, 0.05), P.gunPoly, 0, -0.1, -0.38, -0.2);
    add(new THREE.BoxGeometry(0.04, 0.06, 0.1), P.gunMetal, -0.06, 0.04, -0.3);
    return { model: m, at: v(0.22, 0.55, 0.02), grip: v(0, -0.15, -0.12), support: v(0, -0.15, -0.36), muzzle: v(0, 0, -0.86), poleR: v(1, -0.8, 0.2), poleL: v(-0.3, -1, 0), sound: 'rpg_shot', kick: 0.1 };
  }
  // long guns: the stock in the right shoulder pocket, the barrel forward
  const shotgun = kind === 'shotgun';
  add(new THREE.BoxGeometry(0.045, 0.1, 0.22), shotgun ? P.gunPoly : P.gunMetal, 0, -0.03, -0.1); // stock
  add(new THREE.BoxGeometry(0.055, 0.085, 0.3), P.gunMetal, 0, 0, -0.36); // receiver
  add(new THREE.BoxGeometry(0.034, 0.1, 0.045), P.gunPoly, 0, -0.08, -0.26, -0.3); // grip
  if (shotgun) {
    add(tube(0.02, 0.5), P.gunMetal, 0, 0.012, -0.73); // barrel
    add(tube(0.016, 0.38), P.gunMetal, 0, -0.028, -0.7); // magazine tube
    add(new THREE.BoxGeometry(0.06, 0.06, 0.17), P.gunPoly, 0, -0.03, -0.58); // pump
  } else {
    add(new THREE.BoxGeometry(0.038, 0.13, 0.065), P.gunMetal, 0, -0.1, -0.4, 0.25); // magazine
    add(new THREE.BoxGeometry(0.052, 0.065, 0.25), P.gunPoly, 0, 0, -0.6); // handguard
    add(tube(0.012, 0.2), P.gunMetal, 0, 0.01, -0.85); // barrel
    add(new THREE.BoxGeometry(0.022, 0.04, 0.07), P.gunMetal, 0, 0.06, -0.38); // sight
  }
  return { model: m, at: v(0.11, 0.41, -0.04), grip: v(0, -0.11, -0.26), support: v(0, -0.05, shotgun ? -0.58 : -0.55), muzzle: v(0, 0.01, shotgun ? -0.98 : -0.95), poleR: v(1, -0.7, 0.3), poleL: v(-0.5, -1, 0.1), sound: shotgun ? 'shotgun_shot' : 'rifle_shot', kick: shotgun ? 0.09 : 0.04 };
}

// scratch vectors for the arm solver
const DOWN = new THREE.Vector3(0, -1, 0);
const vDir = new THREE.Vector3();
const vPerp = new THREE.Vector3();
const vElbow = new THREE.Vector3();
const vFore = new THREE.Vector3();
const vT = new THREE.Vector3();
const qUpper = new THREE.Quaternion();
const qFore = new THREE.Quaternion();

/** Two-bone reach: point the upper arm and forearm so the hand lands on `target` (chest frame), elbow toward `pole`. */
function reach(arm: Limb, target: THREE.Vector3, pole: THREE.Vector3): void {
  const S = arm.root.position;
  vDir.subVectors(target, S);
  const raw = vDir.length() || 1e-4;
  vDir.divideScalar(raw);
  const d = Math.min(Math.max(raw, 0.08), UPPER + PALM - 0.002);
  const cosA = Math.min(1, Math.max(-1, (UPPER * UPPER + d * d - PALM * PALM) / (2 * UPPER * d)));
  const a = Math.acos(cosA);
  vPerp.copy(pole).addScaledVector(vDir, -pole.dot(vDir));
  if (vPerp.lengthSq() < 1e-6) vPerp.set(0, -1, 0);
  vPerp.normalize();
  // upper arm: rotate the reach direction toward the pole by the shoulder angle
  const u = vElbow.copy(vDir).multiplyScalar(Math.cos(a)).addScaledVector(vPerp, Math.sin(a));
  qUpper.setFromUnitVectors(DOWN, u);
  arm.root.quaternion.copy(qUpper);
  // forearm: from the elbow to the (reachable) target
  vT.copy(S).addScaledVector(vDir, d);
  vFore.copy(S).addScaledVector(u, UPPER);
  vFore.subVectors(vT, vFore).normalize();
  qFore.setFromUnitVectors(DOWN, vFore);
  arm.joint.quaternion.copy(qUpper.invert()).multiply(qFore);
}

export class Avatar {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  /** The whole figure tips over about its feet when it falls. */
  private readonly tilt = new THREE.Group();
  /** Waist up: leans into the aim. */
  private readonly chest = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legs: Limb[] = [];
  private readonly arms: Limb[] = [];
  private readonly helmet: THREE.Mesh;
  private readonly tag: THREE.Sprite;
  private readonly gunHolder = new THREE.Group();
  private gun: GunRig | null = null;
  private weaponKind: AvatarWeapon = 'none';
  private readonly flash: THREE.Mesh;
  private flashT = 0;
  private recoil = 0;
  /** Aiming: raised and level with the target for a moment after a shot. */
  private aimT = 0;
  private aimPitch = 0;
  private tx = 0;
  private ty = 0;
  private tz = 0;
  private tyaw = 0;
  private phase = 0;
  private time = 0;
  private placed = false;
  /** Hands up and crouched (trapped). */
  cowering = false;
  /** Where the head and weapon point, up positive (a co-op player's reported view). */
  pitch = 0;
  // ---- falling ----
  private down = false;
  private fallT = 0;
  private fvx = 0;
  private fvy = 0;
  private fvz = 0;
  private fallDir = 1;

  constructor(name: string, index: number, style: AvatarStyle = {}) {
    parts ??= makeParts();
    const P = parts;
    const cloth = new THREE.MeshStandardMaterial({ color: style.color ?? UNIFORM[index % UNIFORM.length], roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(style.color ?? UNIFORM[index % UNIFORM.length]).multiplyScalar(0.62), roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.7 });
    const look = style.look;
    const female = look?.female === true;
    const outfit = look?.outfit;
    const skin = new THREE.MeshStandardMaterial({ color: look?.skin ?? 0xc9a183, roughness: 0.8 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.9 });
    const soldier = style.helmet !== false;
    const geared = soldier || outfit === 'tactical';
    // legs and shoes by outfit: white tights under a nurse's dress, bare under a gown, scrubs under a coat
    const legMat = outfit === 'nurse' ? new THREE.MeshStandardMaterial({ color: 0xf0ece8, roughness: 0.7 }) : outfit === 'gown' ? skin : outfit === 'coat' ? new THREE.MeshStandardMaterial({ color: look?.accent ?? 0x6c8fae, roughness: 0.85 }) : outfit === 'habit' ? dark : null;
    const shoeMat = outfit === 'nurse' ? new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.5 }) : outfit === 'gown' ? skin : dark;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // ---- hips and legs ----
    add(new THREE.BoxGeometry(female ? 0.37 : 0.36, 0.2, female ? 0.22 : 0.23), legMat ?? trim, 0, 0.97, 0, this.body); // pelvis
    if (!female || geared || outfit === 'coat') add(new THREE.BoxGeometry(female ? 0.34 : 0.38, 0.05, 0.25), dark, 0, 1.06, 0, this.body); // belt
    for (const s of [-1, 1]) {
      const root = new THREE.Group();
      root.position.set(s * (female ? 0.1 : 0.11), 0.93, 0);
      if (female) root.scale.set(0.84, 1, 0.84);
      add(P.thigh, legMat ?? cloth, 0, 0, 0, root);
      const joint = new THREE.Group();
      joint.position.y = -THIGH;
      add(P.shin, legMat ?? trim, 0, 0, 0, joint);
      add(P.boot, shoeMat, 0, -SHIN, 0, joint);
      root.add(joint);
      this.body.add(root);
      this.legs.push({ root, joint });
    }
    // ---- chest, head, arms ----
    this.chest.position.y = 1.02;
    this.body.add(this.chest);
    add(new THREE.BoxGeometry(female ? 0.35 : 0.42, female ? 0.48 : 0.5, female ? 0.22 : 0.24), cloth, 0, 0.28, 0, this.chest); // torso
    if (!female) add(new THREE.BoxGeometry(0.46, 0.34, 0.3), soldier ? dark : trim, 0, 0.3, 0, this.chest); // vest / jacket
    else if (geared) add(new THREE.BoxGeometry(0.39, 0.3, 0.27), dark, 0, 0.3, 0, this.chest); // a fitted plate carrier
    if (geared) {
      for (const x of female ? [-0.09, 0.09] : [-0.12, 0, 0.12]) add(new THREE.BoxGeometry(0.1, 0.11, 0.06), trim, x, 0.2, female ? -0.155 : -0.17, this.chest); // pouches
      add(new THREE.BoxGeometry(female ? 0.28 : 0.34, female ? 0.32 : 0.38, female ? 0.12 : 0.14), trim, 0, 0.3, female ? 0.19 : 0.21, this.chest); // pack
    }
    add(new THREE.CylinderGeometry(female ? 0.045 : 0.055, female ? 0.055 : 0.065, 0.1, 8), skin, 0, 0.56, 0, this.chest); // neck
    this.head.position.set(0, 0.68, 0);
    this.chest.add(this.head);
    add(new THREE.SphereGeometry(0.12, 16, 12), skin, 0, 0, 0, this.head);
    if (female && look) {
      // a slightly larger, softer head: big eyes, hair, and whatever the outfit puts on it
      this.head.scale.setScalar(1.1);
      addFace(this.head, look);
      addHair(this.head, look);
      addOutfit(this.body, this.chest, this.head, look, cloth);
    } else add(new THREE.BoxGeometry(0.16, 0.035, 0.03), dark, 0, 0.02, -0.105, this.head); // brow / eyes
    this.helmet = add(new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, 0, 0.02, 0, this.head);
    this.helmet.scale.set(1, 0.85, 1.08);
    this.helmet.visible = soldier && !female;
    for (const s of [1, -1]) {
      // right arm first: arms[0] holds the grip, arms[1] the handguard
      const root = new THREE.Group();
      root.position.set(s * (female ? 0.21 : 0.24), SHOULDER_Y, s < 0 ? -0.04 : 0);
      if (female) root.scale.set(0.84, 1, 0.84);
      add(P.upper, cloth, 0, 0.02, 0, root);
      const joint = new THREE.Group();
      joint.position.y = -UPPER;
      add(P.fore, cloth, 0, 0, 0, joint);
      add(P.hand, geared ? glove : skin, 0, -FORE, 0, joint);
      root.add(joint);
      this.chest.add(root);
      this.arms.push({ root, joint });
    }
    this.chest.add(this.gunHolder);
    this.flash = new THREE.Mesh(P.flashGeo, P.flash);
    this.flash.visible = false;
    this.setWeapon(style.weapon ?? (geared ? 'rifle' : 'none'));
    this.tag = nameTag(name, style.tag, style.tagColor ?? '#ffb060');
    this.tilt.add(this.body);
    this.root.add(this.tilt, this.tag);
    this.root.visible = false;
    this.pose(0, 0, 1);
  }

  get weapon(): AvatarWeapon {
    return this.weaponKind;
  }

  /** What the figure holds; the hands move to it on the next frame. */
  setWeapon(kind: AvatarWeapon): void {
    if (kind === this.weaponKind && (this.gun || kind === 'none')) return;
    this.weaponKind = kind;
    if (this.gun) {
      this.gun.model.removeFromParent();
      this.gun.model.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.gun = kind === 'none' ? null : gunRig(kind);
    if (this.gun) {
      this.gunHolder.add(this.gun.model);
      this.flash.position.copy(this.gun.muzzle);
      this.gun.model.add(this.flash);
    }
  }

  /** A freed survivor picks up a weapon. */
  arm(kind: AvatarWeapon = 'pistol'): void {
    this.setWeapon(kind);
    this.cowering = false;
  }

  /** Latest reported state. `y` is the height of the feet. */
  set(x: number, y: number, z: number, yaw: number, visible: boolean): void {
    if (this.down) return; // a body lies where it fell
    this.tx = x;
    this.ty = y;
    this.tz = z;
    this.tyaw = yaw;
    if (!this.placed || !this.root.visible) {
      this.root.position.set(x, y, z);
      this.body.rotation.y = yaw;
      this.placed = true;
    }
    this.root.visible = visible;
  }

  /**
   * A shot toward a world point (or straight ahead with no target): the weapon comes up and kicks, the muzzle
   * flashes. Returns where the muzzle is, for a tracer.
   */
  fire(target?: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    if (target) {
      const p = this.root.position;
      const h = Math.hypot(target.x - p.x, target.z - p.z) || 1;
      this.aimPitch = Math.max(-0.7, Math.min(0.7, Math.atan2(target.y - (p.y + 1.45), h)));
    } else this.aimPitch = this.pitch;
    this.aimT = 1.2;
    this.recoil = 1;
    this.flashT = 0.06;
    this.flash.visible = !!this.gun;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.pose(0, 0, 1);
    this.root.updateMatrixWorld(true);
    const out = new THREE.Vector3();
    if (this.gun) this.flash.getWorldPosition(out);
    else this.chest.localToWorld(out.set(0.2, 0.4, -0.5));
    return { x: out.x, y: out.y, z: out.z };
  }

  /** The sound this figure's weapon makes. */
  get shotSound(): SoundId {
    return this.gun?.sound ?? 'pistol_shot';
  }

  /** Killed: thrown along (dx, dz) at `speed` m/s, falling backwards away from the blow. */
  fall(dx: number, dz: number, speed: number): void {
    if (this.down) return;
    this.down = true;
    this.fallT = 0;
    const d = Math.hypot(dx, dz) || 1;
    this.fvx = (dx / d) * speed;
    this.fvz = (dz / d) * speed;
    this.fvy = 0.8 + speed * 0.3;
    // fall over toward the direction of travel, relative to the way the figure faces
    const fx = -Math.sin(this.body.rotation.y);
    const fz = -Math.cos(this.body.rotation.y);
    this.fallDir = fx * this.fvx + fz * this.fvz > 0 ? -1 : 1;
    // the tilt group takes over the heading so the fall happens in the figure's own frame
    this.tilt.rotation.set(0, this.body.rotation.y, 0, 'YXZ');
    this.body.rotation.y = 0;
    this.tag.visible = false;
    this.gunHolder.visible = false; // the weapon is dropped
    this.flash.visible = false;
  }

  /** On their feet again (a co-op player who came back). */
  rise(): void {
    if (!this.down) return;
    this.down = false;
    this.body.rotation.y = this.tilt.rotation.y;
    this.tilt.rotation.set(0, 0, 0);
    this.tag.visible = true;
    this.gunHolder.visible = true;
    this.placed = false;
  }

  get fallen(): boolean {
    return this.down;
  }

  update(dt: number): void {
    if (!this.root.visible) return;
    this.time += dt;
    const p = this.root.position;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }
    if (this.down) {
      // ragdoll-lite: fly, bounce once, slide to a stop, tip over onto the back or the face
      this.fallT += dt;
      this.fvy -= 16 * dt;
      p.x += this.fvx * dt;
      p.z += this.fvz * dt;
      p.y = Math.max(0, p.y + this.fvy * dt);
      if (p.y === 0) {
        this.fvy = this.fvy < -3 ? -this.fvy * 0.25 : 0;
        const k = Math.exp(-6 * dt);
        this.fvx *= k;
        this.fvz *= k;
      }
      const t = Math.min(1, this.fallT / 0.55);
      this.tilt.rotation.x = this.fallDir * (Math.PI / 2 - 0.08) * t * t;
      this.pose(dt, 0, 0);
      return;
    }
    const k = Math.min(1, dt * 12);
    const moved = Math.hypot(this.tx - p.x, this.tz - p.z);
    p.x += (this.tx - p.x) * k;
    p.y += (this.ty - p.y) * k;
    p.z += (this.tz - p.z) * k;
    let d = this.tyaw - this.body.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.body.rotation.y += d * k;
    const walking = moved > 0.02;
    this.phase += walking ? dt * 9 : 0;
    this.pose(dt, walking ? 1 : 0, 0);
  }

  /** Legs, lean, weapon and the arms that hold it. `snap` 1 sets the pose at once. */
  private pose(dt: number, walk: number, snap: number): void {
    const ease = snap || Math.min(1, dt * 14);
    const lerp = (a: number, b: number) => a + (b - a) * ease;
    // ---- legs: the thigh swings, the knee folds on the back swing; a crouch for cowering ----
    const swing = Math.sin(this.phase) * 0.55 * walk;
    const crouch = this.cowering ? 1 : 0;
    this.legs.forEach((leg, i) => {
      const s = i === 0 ? swing : -swing;
      const knee = walk * Math.max(0, Math.sin(this.phase + (i === 0 ? -1.4 : Math.PI - 1.4))) * 0.9;
      leg.root.rotation.x = lerp(leg.root.rotation.x, s + crouch * 1.1);
      leg.joint.rotation.x = lerp(leg.joint.rotation.x, -knee - crouch * 1.7);
    });
    this.body.position.y = lerp(this.body.position.y, this.down ? 0 : crouch * -0.3 - walk * Math.abs(Math.cos(this.phase)) * 0.03);
    // ---- the aim: up after a shot, a relaxed carry otherwise, a co-op player's own view ----
    this.aimT = Math.max(0, this.aimT - dt);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const aiming = this.aimT > 0;
    const want = aiming ? this.aimPitch : this.pitch !== 0 ? this.pitch : -0.32;
    const aim = Math.max(-0.75, Math.min(0.75, want));
    this.chest.rotation.x = lerp(this.chest.rotation.x, this.down ? 0 : aim * 0.35 - crouch * 0.25);
    this.head.rotation.x = lerp(this.head.rotation.x, this.down ? 0 : aim * 0.4 + crouch * 0.2);
    const gun = this.gun;
    const R = this.arms[0]!;
    const L = this.arms[1]!;
    if (this.down) {
      // arms thrown out
      vT.set(0.6, 0.6, 0.15);
      reach(R, vT, vPerp.set(0, -1, 0.5));
      vT.set(-0.6, 0.6, 0.15);
      reach(L, vT, vPerp.set(0, -1, 0.5));
      return;
    }
    if (this.cowering || !gun) {
      const bob = Math.sin(this.time * 3.3) * 0.03;
      for (const [arm, s] of [[R, 1], [L, -1]] as const) {
        if (this.cowering) vT.set(s * 0.17, 0.98 + bob, -0.14);
        else vT.set(s * 0.29, -0.06, -Math.sin(this.phase) * s * 0.18 * walk);
        reach(arm, vT, vPerp.set(s * 0.8, this.cowering ? 0.2 : -0.4, 0.6));
      }
      return;
    }
    // weapon held: the gun sits at its carry point, pitched with the aim, kicked back by a shot
    const h = this.gunHolder;
    h.position.copy(gun.at);
    h.position.z += this.recoil * gun.kick;
    h.position.y += walk * Math.sin(this.phase * 2) * 0.012;
    // the HX-7 rides level on the shoulder; the others dip when carried and turn a little across the body
    const carry = this.weaponKind === 'rpg' ? Math.max(aim, -0.08) : aim;
    h.rotation.set(carry * 0.65 + this.recoil * 0.12, aiming || this.weaponKind === 'rpg' ? 0 : 0.12, 0);
    h.updateMatrix();
    vT.copy(gun.grip).applyMatrix4(h.matrix);
    reach(R, vT, gun.poleR);
    vT.copy(gun.support).applyMatrix4(h.matrix);
    reach(L, vT, gun.poleL);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      // shared parts stay for the next figure
      if (parts && (m.geometry === parts.upper || m.geometry === parts.fore || m.geometry === parts.hand || m.geometry === parts.thigh || m.geometry === parts.shin || m.geometry === parts.boot || m.geometry === parts.flashGeo)) return;
      m.geometry?.dispose();
    });
  }
}
