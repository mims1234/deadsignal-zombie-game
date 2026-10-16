/**
 * PROMETHEUS, as it leaves the Forge (`forge/reveal.ts`): an orb forged the way Vulcan forges things. A shell of black
 * iron plates with molten seams between them (a furnace's core shows through every gap), a bronze belt with ember
 * runes around its middle, two gyroscope rings of iron turning on their own axes with plates riding them, a crest of
 * phoenix flame fanned out behind - and one eye, the Ignis mark in a lens, that burns ember-orange like everything
 * else in the Forge until it speaks, and then goes cold white: the one thing about it that was never Vulcan's.
 *
 * Built with a radius of 1 in its own units, centred on the origin, the eye facing -Z (the reveal scales it up to
 * tens of metres). It only exists during the cutscene (and, once seen, in the bestiary).
 */
import * as THREE from 'three';
import { ignisMaterial } from '../layout/ignis';

export interface PrometheusRig {
  root: THREE.Group;
  /** Turn its parts and set the brightness of its core, seams and eye (0..1+). It brings no light of its own. */
  update(dt: number, glow: number): void;
  /** How cold the eye has gone: 0 ember-orange, 1 cold white. */
  cold(k: number): void;
  /** World position of the eye (after the root's transform is up to date). */
  eye(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

export function createPrometheus(): PrometheusRig {
  const root = new THREE.Group();
  root.name = 'PROMETHEUS';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const mat = <M extends THREE.Material>(m: M): M => {
    mats.push(m);
    return m;
  };
  const iron = mat(new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.42, metalness: 0.9 }));
  const ironWarm = mat(new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 0.5, metalness: 0.8 }));
  const bronze = mat(new THREE.MeshStandardMaterial({ color: 0x7a5228, roughness: 0.35, metalness: 0.95 }));
  const core = mat(new THREE.MeshStandardMaterial({ color: 0x3a0c02, emissive: 0xff5a10, emissiveIntensity: 2.4, roughness: 0.4 }));
  const rune = mat(new THREE.MeshStandardMaterial({ color: 0x2a0a02, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 0.4 }));
  const lens = mat(new THREE.MeshStandardMaterial({ color: 0x1a0802, emissive: 0xff7a1a, emissiveIntensity: 2.5, roughness: 0.15, metalness: 0.2 }));
  const flame = mat(new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const flame2 = mat(new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const aura = mat(new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false }));
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  };
  // ---- the core: a furnace's heart, showing through every seam ----
  add(new THREE.SphereGeometry(0.94, 32, 24), core, 0, 0, 0);
  // ---- the shell: iron plates in bands, a gap between each (the eye's place left open at the front) ----
  const bands = 7;
  const cols = 12;
  const gap = 0.026;
  for (let b = 0; b < bands; b++) {
    const t0 = (b / bands) * Math.PI;
    const tl = Math.PI / bands;
    const n = b === 0 || b === bands - 1 ? 6 : cols;
    for (let c = 0; c < n; c++) {
      const p0 = (c / n) * Math.PI * 2;
      const pl = (Math.PI * 2) / n;
      // the front-middle patch (three.js: phi 3PI/2 is -Z) stays open for the eye
      const mid = p0 + pl / 2;
      const front = Math.abs(((mid - Math.PI * 1.5 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < pl * 0.75 && b === 3;
      if (front) continue;
      const g = new THREE.SphereGeometry(1, 6, 4, p0 + gap, pl - gap * 2, t0 + gap, tl - gap * 2);
      // some plates stand a little proud of the rest
      add(g, (b + c) % 3 === 0 ? ironWarm : iron, 0, 0, 0).scale.setScalar((b * 7 + c * 3) % 5 === 0 ? 1.025 : 1);
    }
  }
  // ---- the belt: bronze, with ember runes ----
  add(new THREE.TorusGeometry(1.04, 0.06, 10, 72), bronze, 0, 0, 0, root, Math.PI / 2);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    if (Math.abs(Math.sin(a) + 1) < 0.25) continue; // not across the eye
    add(new THREE.BoxGeometry(0.05, 0.035 + (i % 3) * 0.015, 0.012), rune, Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1, root, 0, -a + Math.PI / 2, 0);
  }
  // ---- the eye: a bronze socket, the lens, the Ignis mark inside ----
  const eyeG = new THREE.Group();
  eyeG.position.set(0, 0, -0.97);
  root.add(eyeG);
  add(new THREE.TorusGeometry(0.3, 0.06, 10, 36), bronze, 0, 0, 0, eyeG);
  add(new THREE.TorusGeometry(0.38, 0.025, 8, 36), iron, 0, 0, 0.02, eyeG);
  const lensMesh = add(new THREE.SphereGeometry(0.27, 24, 16), lens, 0, 0, 0.02, eyeG);
  lensMesh.scale.set(1, 1, 0.45);
  const markLit = ignisMaterial('lit');
  const markCold = ignisMaterial('cold');
  const mark = add(new THREE.PlaneGeometry(0.34, 0.34), markLit, 0, 0, -0.11, eyeG, 0, Math.PI, 0);
  const eyePoint = new THREE.Object3D();
  eyePoint.position.set(0, 0, -0.2);
  eyeG.add(eyePoint);
  // ---- the gyroscope: two rings of iron on their own axes, plates riding them ----
  const gyro = [1.45, 1.72].map((r, k) => {
    const g = new THREE.Group();
    g.rotation.set(k === 0 ? 0.5 : -0.35, 0, k === 0 ? 0.25 : -0.6);
    root.add(g);
    add(new THREE.TorusGeometry(r, 0.035, 8, 96), k === 0 ? bronze : iron, 0, 0, 0, g, Math.PI / 2);
    const n = k === 0 ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      add(new THREE.BoxGeometry(0.16, 0.05, 0.3), k === 0 ? iron : ironWarm, Math.cos(a) * r, 0, Math.sin(a) * r, g, 0, -a, 0);
      add(new THREE.BoxGeometry(0.1, 0.012, 0.04), rune, Math.cos(a) * r, 0.032, Math.sin(a) * r, g, 0, -a, 0);
    }
    return g;
  });
  // ---- the crest: phoenix feathers of flame fanned out behind and above ----
  const crest = new THREE.Group();
  crest.position.set(0, 0.25, 0.6);
  root.add(crest);
  const feather = (len: number, w: number): THREE.BufferGeometry => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.quadraticCurveTo(w, len * 0.4, w * 0.2, len);
    s.quadraticCurveTo(-w * 0.5, len * 0.45, 0, 0);
    return new THREE.ShapeGeometry(s, 8);
  };
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const a = -1.25 + t * 2.5;
    const len = 1.5 + 0.9 * Math.cos(a * 0.9);
    const f = add(feather(len, 0.32), i % 2 ? flame : flame2, 0, 0, 0, crest);
    f.rotation.set(-0.5, 0, a);
  }
  // ---- a heat haze around it ----
  const auraMesh = add(new THREE.SphereGeometry(1.35, 24, 16), aura, 0, 0, 0);

  let t = 0;
  let coldK = 0;
  const warm = new THREE.Color(0xff7a1a);
  const white = new THREE.Color(0xd8f0ff);
  return {
    root,
    update(dt, glow) {
      t += dt;
      gyro[0]!.rotation.y += dt * 0.35;
      gyro[1]!.rotation.y -= dt * 0.22;
      gyro[1]!.rotation.x += dt * 0.05;
      crest.rotation.z = Math.sin(t * 0.7) * 0.05;
      for (let i = 0; i < crest.children.length; i++) crest.children[i]!.scale.y = 1 + Math.sin(t * 3 + i * 0.8) * 0.06;
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.9);
      core.emissiveIntensity = 2.2 * glow * pulse;
      rune.emissiveIntensity = (1.6 + Math.sin(t * 2.6) * 0.5) * glow;
      lens.emissive.copy(warm).lerp(white, coldK);
      lens.emissiveIntensity = (2.5 + 1.5 * coldK) * glow;
      aura.opacity = 0.08 + 0.06 * glow * pulse;
      flame.opacity = 0.4 + 0.15 * glow;
      void auraMesh;
    },
    cold(k) {
      coldK = Math.max(0, Math.min(1, k));
      mark.material = coldK > 0.5 ? markCold : markLit;
    },
    eye(out) {
      root.updateMatrixWorld(true);
      return eyePoint.getWorldPosition(out);
    },
    dispose() {
      root.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
