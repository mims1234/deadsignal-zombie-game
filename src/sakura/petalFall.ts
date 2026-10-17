/**
 * Petals in the air over the Sakura District: a few hundred small cards drifting down and across on the wind around the
 * camera, tumbling as they fall. One instanced draw; the box they fall through follows the camera, and a petal that
 * lands or drifts out of it comes back in on the far side.
 */
import * as THREE from 'three';

const R = 22; // half-width of the box round the camera
const TOP = 14;

export function petalTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath();
  // a cherry petal: a rounded teardrop with a notch at the tip
  g.moveTo(16, 30);
  g.bezierCurveTo(2, 22, 4, 6, 12, 3);
  g.lineTo(16, 7);
  g.lineTo(20, 3);
  g.bezierCurveTo(28, 6, 30, 22, 16, 30);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PetalFall {
  readonly mesh: THREE.InstancedMesh;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly spin: Float32Array;
  private readonly phase: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private t = 0;
  /** The wind: where the petals drift (m/s), and how hard it gusts. */
  wind = { x: 0.55, z: 0.2, gust: 0.35 };

  constructor(count: number, color = 0xffc4dc) {
    this.n = count;
    const mat = new THREE.MeshStandardMaterial({ color, map: petalTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, emissive: color, emissiveIntensity: 0.18 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.07), mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.name = 'petal-fall';
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count);
    this.spin = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = (Math.random() * 2 - 1) * R;
      this.pos[i * 3 + 1] = Math.random() * TOP;
      this.pos[i * 3 + 2] = (Math.random() * 2 - 1) * R;
      this.vel[i] = 0.45 + Math.random() * 0.45;
      for (let k = 0; k < 3; k++) this.spin[i * 3 + k] = (Math.random() * 2 - 1) * 3;
      this.phase[i] = Math.random() * 100;
    }
  }

  /** Recolour them (the Easter egg's bloom turns them crimson). */
  setColor(color: number): void {
    const m = this.mesh.material as THREE.MeshStandardMaterial;
    m.color.set(color);
    m.emissive.set(color);
  }

  /** Drift them on by `dt` round the camera at (cx, cy, cz). Petals are kept relative to the camera's cell. */
  update(dt: number, cx: number, cy: number, cz: number): void {
    this.t += dt;
    const t = this.t;
    const gust = 1 + Math.sin(t * 0.37) * this.wind.gust + Math.sin(t * 1.3) * 0.15;
    const wx = this.wind.x * gust;
    const wz = this.wind.z * gust;
    const p = this.pos;
    const base = Math.max(0, cy - 4);
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      const ph = this.phase[i]!;
      const sway = Math.sin(t * 1.7 + ph) * 0.35;
      p[o]! += (wx + sway) * dt;
      p[o + 1]! -= this.vel[i]! * (0.8 + 0.4 * Math.sin(t * 2.3 + ph)) * dt;
      p[o + 2]! += (wz + Math.cos(t * 1.3 + ph) * 0.25) * dt;
      // wrap round the camera's box (world space): out of one side, in at the other; landed, back up top
      let x = p[o]!;
      let z = p[o + 2]!;
      if (x - cx > R) x -= 2 * R;
      else if (cx - x > R) x += 2 * R;
      if (z - cz > R) z -= 2 * R;
      else if (cz - z > R) z += 2 * R;
      if (p[o + 1]! < base - 0.5 || p[o + 1]! > base + TOP + 4) p[o + 1] = base + TOP * (0.6 + Math.random() * 0.4);
      p[o] = x;
      p[o + 2] = z;
      this.e.set(this.spin[o]! * t + ph, this.spin[o + 1]! * t, this.spin[o + 2]! * t);
      this.q.setFromEuler(this.e);
      this.v.set(x, p[o + 1]!, z);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    const m = this.mesh.material as THREE.MeshStandardMaterial;
    m.map?.dispose();
    m.dispose();
  }
}
