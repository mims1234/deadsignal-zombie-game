/**
 * The Sakura District's relics, in your hands: each is one of the stock rigs (its hands, its motion, its reload)
 * dressed as something else. Hanafubuki is the rifle's frame under a pink-lacquered body with a six-barrel rotor that
 * spins up as it fires and a petal drum for the belt; Raijin's Drum is the launcher's tube with a lacquered thunder
 * drum and its ring of tomoe at the front, crackling blue.
 */
import * as THREE from 'three';
import type { ViewmodelPose, ViewmodelRig } from '../viewmodelTypes';
import type { SharedTextures } from './materials';
import { createRifle } from './rifle';
import { createRpg } from './rpg';
import type { BaseRig } from './rigBase';

/** Recolour a rig's own materials (each rig has its own set, so the stock gun is not touched). */
function recolor(gun: THREE.Object3D, colors: Record<string, number>, emissive: Record<string, number> = {}): void {
  const seen = new Set<THREE.Material>();
  gun.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (seen.has(mat) || !mat.color) continue;
      seen.add(mat);
      const c = colors[mat.name];
      if (c !== undefined) mat.color.setHex(c);
      const e = emissive[mat.name];
      if (e !== undefined && mat.emissive) {
        mat.emissive.setHex(e);
        mat.emissiveIntensity = 0.6;
      }
    }
  });
}

class RelicRig implements ViewmodelRig {
  readonly root: THREE.Group;
  readonly muzzle: THREE.Object3D;
  readonly ejectPort: THREE.Object3D;
  private spin = 0;
  private spinV = 0;

  constructor(
    readonly id: 'hanafubuki' | 'raijin',
    private readonly inner: BaseRig,
    private readonly rotor: THREE.Object3D | null,
    private readonly glow: THREE.MeshStandardMaterial | null,
    private readonly extra: THREE.Object3D[],
  ) {
    this.root = inner.root;
    this.muzzle = inner.muzzle;
    this.ejectPort = inner.ejectPort;
  }

  update(pose: ViewmodelPose, dt: number): void {
    this.inner.update(pose, dt);
    // the rotor spins up while it fires and winds down after
    this.spinV = Math.max(0, this.spinV - dt * 22);
    this.spin += this.spinV * dt;
    if (this.rotor) this.rotor.rotation.z = this.spin;
    if (this.glow) this.glow.emissiveIntensity = 0.9 + Math.sin(pose.time * (this.id === 'raijin' ? 23 : 3)) * (this.id === 'raijin' ? 0.5 : 0.2) + this.spinV * 0.01;
  }

  onFire(tier: number, strength?: number): void {
    this.inner.onFire(tier, strength);
    this.spinV = Math.min(60, this.spinV + 9);
    if (this.glow) this.glow.emissiveIntensity = 2.4;
  }

  setTier(tier: number): void {
    this.inner.setTier(tier);
  }

  reset(): void {
    this.inner.reset();
    this.spinV = 0;
  }

  dispose(): void {
    this.inner.dispose();
    for (const o of this.extra)
      o.traverse((q) => {
        const m = q as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
  }
}

/** Hanafubuki: the rifle under pink lacquer, a six-barrel rotor, a petal drum. */
export function createHanafubuki(tex: SharedTextures): ViewmodelRig {
  const rig = createRifle(tex);
  recolor(rig.gun, { polymer: 0xe8a0bc, grip: 0x4a2a36, metal: 0xd8d0d4, blued: 0x8a5a6e, olive: 0xe8a0bc }, { polymer: 0x3a0a1a });
  const lacquer = new THREE.MeshStandardMaterial({ color: 0xf2c2d4, roughness: 0.35, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8c4c8, roughness: 0.3, metalness: 0.85 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xff7aa8, emissive: 0xff3a7a, emissiveIntensity: 0.9, roughness: 0.4 });
  // the rotor: six barrels round the muzzle axis, reaching back along the handguard
  const rotor = new THREE.Group();
  const barrel = new THREE.CylinderGeometry(0.0055, 0.0055, 0.24, 8).rotateX(Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(barrel, steel);
    m.position.set(Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0.1);
    rotor.add(m);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 16), glow);
  collar.position.z = 0.0;
  rotor.add(collar);
  rotor.position.copy(rig.muzzle.position);
  rig.gun.add(rotor);
  // the petal drum under the receiver (where a magazine would be) and blossoms painted on it
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 20).rotateZ(Math.PI / 2), lacquer);
  drum.position.set(rig.muzzle.position.x - 0.005, rig.muzzle.position.y - 0.085, rig.muzzle.position.z + 0.36);
  rig.gun.add(drum);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.004, 6, 24).rotateY(Math.PI / 2), glow);
  band.position.copy(drum.position);
  rig.gun.add(band);
  return new RelicRig('hanafubuki', rig, rotor, glow, [rotor, drum, band]);
}

/** Raijin's Drum: the launcher's tube with a lacquered drum and its ring of tomoe at the front. */
export function createRaijin(tex: SharedTextures): ViewmodelRig {
  const rig = createRpg(tex);
  recolor(rig.gun, { olive: 0x1c2234, blued: 0x2a2a3a, polymer: 0x1c2234, metal: 0xb89a4a, steel: 0xd8b860 });
  const lacquer = new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.35, metalness: 0.1 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x4aa8ff, emissiveIntensity: 1, roughness: 0.3 });
  const at = rig.muzzle.position;
  const drum = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 24).rotateX(Math.PI / 2), lacquer);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), skin);
  face.position.z = -0.046;
  face.rotation.y = Math.PI;
  drum.add(shell, face);
  // the ring of tomoe round the drum, glowing
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), glow);
    t.position.set(Math.cos(a) * 0.088, Math.sin(a) * 0.088, 0);
    drum.add(t);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.004, 6, 32), glow);
  drum.add(ring);
  drum.position.set(at.x, at.y, at.z + 0.12);
  rig.gun.add(drum);
  return new RelicRig('raijin', rig, null, glow, [drum]);
}
