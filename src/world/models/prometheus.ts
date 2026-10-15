/**
 * PROMETHEUS, as it leaves the Forge (`forge/reveal.ts`): a machine hundreds of metres tall, built from black iron
 * plates and furnace slag bound together by glowing fibre-light cables, a slowly turning halo of floating panels behind
 * it, and a single cold-white eye in the shape of the Ignis mark turned upside down. Cold white and steel blue - the
 * opposite of the Forge's orange - so it reads as foreign at once. It only exists during the cutscene.
 *
 * Built about 10 m tall in its own units (the reveal scales it up); its feet at the origin, facing -Z.
 */
import * as THREE from 'three';
import { ignisMaterial } from '../layout/ignis';

export interface PrometheusRig {
  root: THREE.Group;
  /** Turn its gaze (yaw) and the brightness of its eye and cables (0..1+). */
  update(dt: number, glow: number): void;
  /** World position of the eye (after the root's transform is up to date). */
  eye(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

export function createPrometheus(): PrometheusRig {
  const root = new THREE.Group();
  root.name = 'PROMETHEUS';
  const iron = new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.45, metalness: 0.85 });
  const slag = new THREE.MeshStandardMaterial({ color: 0x241a16, roughness: 0.9, metalness: 0.2 });
  const cable = new THREE.MeshStandardMaterial({ color: 0x0a1822, emissive: 0xbfe8ff, emissiveIntensity: 2.4, roughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.35, metalness: 0.9, emissive: 0x6fa8d8, emissiveIntensity: 0.35 });
  const geos: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, parent: THREE.Object3D = root): THREE.Mesh => {
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  };
  const seeded = (seed: number): (() => number) => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const r = seeded(7);

  // ---- the body: a tall, narrow torso of overlapping plates, slag packed in the seams ----
  for (let i = 0; i < 9; i++) {
    const y = 4.2 + i * 0.42;
    const w = 1.5 + Math.sin((i / 8) * Math.PI) * 0.7;
    add(new THREE.BoxGeometry(w, 0.5, 0.9), i % 3 === 1 ? slag : iron, (r() - 0.5) * 0.15, y, (r() - 0.5) * 0.1, (r() - 0.5) * 0.12, (r() - 0.5) * 0.2, (r() - 0.5) * 0.12);
  }
  add(new THREE.CylinderGeometry(0.55, 0.85, 1.4, 8), iron, 0, 3.5, 0);
  // the shoulders, like furnace doors
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(1.1, 0.9, 1.0), iron, s * 1.35, 7.6, 0, 0, 0, s * 0.25);
    add(new THREE.BoxGeometry(0.9, 0.12, 1.05), steel, s * 1.38, 8.0, -0.05, 0, 0, s * 0.25);
    // long arms that hang almost to the ground, jointed twice
    const arm = new THREE.Group();
    arm.position.set(s * 1.75, 7.4, 0);
    arm.rotation.z = s * 0.12;
    root.add(arm);
    add(new THREE.BoxGeometry(0.45, 2.6, 0.5), iron, 0, -1.3, 0, 0, 0, 0, arm);
    add(new THREE.SphereGeometry(0.32, 10, 8), slag, 0, -2.65, 0, 0, 0, 0, arm);
    add(new THREE.BoxGeometry(0.38, 2.4, 0.42), iron, 0, -3.9, 0.05, 0, 0, 0, arm);
    for (let f = 0; f < 3; f++) add(new THREE.ConeGeometry(0.07, 0.6, 5), steel, (f - 1) * 0.13, -5.35, -0.05, 0.15, 0, 0, arm);
    add(new THREE.CylinderGeometry(0.035, 0.035, 5, 6), cable, 0.15 * s, -2.5, -0.27, 0, 0, 0, arm);
  }
  // legs: two pillars of plate
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.6, 2.2, 0.7), iron, s * 0.45, 1.1, 0, 0, 0, s * 0.05);
    add(new THREE.BoxGeometry(0.55, 1.3, 0.65), slag, s * 0.42, 2.7, 0.02);
    add(new THREE.BoxGeometry(0.85, 0.2, 1.0), steel, s * 0.48, 0.1, -0.1);
  }
  // ---- the cables: fibre-light running down the plates, binding them ----
  for (let i = 0; i < 14; i++) {
    const x = (r() - 0.5) * 2.2;
    const z = -0.47 - r() * 0.05;
    add(new THREE.CylinderGeometry(0.025, 0.025, 2 + r() * 3, 5), cable, x, 4 + r() * 3.5, z, 0, 0, (r() - 0.5) * 0.4);
  }
  for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(0.85 + i * 0.05, 0.03, 6, 24), cable, 0, 4.5 + i * 0.75, 0, Math.PI / 2, 0, 0);
  // ---- the head: a narrow hood of plate, and the eye ----
  const head = new THREE.Group();
  head.position.set(0, 8.7, -0.1);
  root.add(head);
  add(new THREE.BoxGeometry(0.9, 1.05, 0.85), iron, 0, 0.45, 0, 0, 0, 0, head);
  add(new THREE.ConeGeometry(0.62, 0.9, 4), iron, 0, 1.2, 0.05, 0, Math.PI / 4, 0, head);
  const eyeMat = ignisMaterial('cold');
  const eye = add(new THREE.PlaneGeometry(0.55, 0.55), eyeMat, 0, 0.42, -0.44, 0, Math.PI, Math.PI, head); // turned upside down
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  add(new THREE.CircleGeometry(0.75, 24), glowMat, 0, 0.42, -0.46, 0, Math.PI, 0, head);
  // ---- the halo: floating panels turning slowly behind the head ----
  const halo = new THREE.Group();
  halo.position.set(0, 8.0, 1.2);
  root.add(halo);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = add(new THREE.BoxGeometry(0.5, 0.95, 0.05), i % 2 ? steel : iron, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0, 0, 0, a + Math.PI / 2, halo);
    p.rotation.y = 0.3;
    add(new THREE.BoxGeometry(0.06, 0.6, 0.06), cable, Math.cos(a) * 2.6, Math.sin(a) * 2.6, -0.06, 0, 0, a + Math.PI / 2, halo);
  }
  add(new THREE.TorusGeometry(2.6, 0.02, 6, 64), cable, 0, 0, 0, 0, 0, 0, halo);
  const light = new THREE.PointLight(0xcfe8ff, 0, 0, 1.5);
  light.position.set(0, 6, -6);
  root.add(light);

  let t = 0;
  return {
    root,
    update(dt, glow) {
      t += dt;
      halo.rotation.z += dt * 0.25;
      cable.emissiveIntensity = (1.4 + Math.sin(t * 2.3) * 0.5) * glow;
      eyeMat.emissiveIntensity = 2.2 * glow;
      glowMat.opacity = 0.25 + 0.25 * glow;
      // its own cold light on the ground in front of it (the plates stay black iron)
      light.intensity = 140 * glow * root.scale.x * root.scale.x;
      light.distance = 30 * root.scale.x;
      head.rotation.x = Math.sin(t * 0.4) * 0.03;
    },
    eye(out) {
      root.updateMatrixWorld(true);
      return eye.getWorldPosition(out);
    },
    dispose() {
      root.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of [iron, slag, cable, steel, glowMat]) m.dispose();
    },
  };
}
