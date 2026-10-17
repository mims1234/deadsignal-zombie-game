/**
 * The far crowd: every Sakura District infected beyond `FAR` metres is drawn as ten plain boxes (torso, head, arms,
 * forearms, thighs, shins) following its own animated stand-in skeleton, all of them in ONE instanced draw call. Close
 * up each wears its VRoid model (~36k triangles and 13 materials for the stand-in); far away nobody can tell, and the
 * horde stops costing the frame.
 *
 * The rigs write their boxes while they update; the zombie manager starts the count again before every frame's update
 * (`ZombieManager.beforeUpdate`).
 */
import * as THREE from 'three';
import type { StyleFigure } from './figure';

/** Beyond this (m), an infected joins the far crowd. */
export const FAR = 24;
const CAP = 1200;
const PARTS = 10;

const box = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });

const m4 = new THREE.Matrix4();
const local = new THREE.Matrix4();
const c = new THREE.Color();

class Crowd {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;

  constructor() {
    this.mesh = new THREE.InstancedMesh(box, mat, CAP);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'far-crowd';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, c.set(0xffffff));
  }

  /** A new frame: nobody in the crowd until the rigs write again. */
  begin(): void {
    this.n = 0;
    this.mesh.count = 0;
  }

  /** One infected's boxes this frame (`parent`: where the crowd is drawn). */
  write(f: StyleFigure, skin: number, cloth: number, parent: THREE.Object3D | null): void {
    if (parent && this.mesh.parent !== parent) parent.add(this.mesh);
    if (this.n + PARTS > CAP) return;
    const D = f.D;
    const J = f.J;
    const put = (joint: THREE.Object3D, w: number, h: number, d: number, y: number, col: number): void => {
      local.makeScale(w, h, d).setPosition(0, y, 0);
      m4.multiplyMatrices(joint.matrixWorld, local);
      this.mesh.setMatrixAt(this.n, m4);
      this.mesh.setColorAt(this.n, c.setHex(col));
      this.n++;
    };
    put(J.torso, D.shoulderX * 2.1, D.torso, 0.24, D.torso / 2, cloth);
    put(J.head, D.head * 0.75, D.head * 0.85, D.head * 0.8, D.head * 0.45, skin);
    put(J.armL, 0.1, D.upper, 0.1, -D.upper / 2, cloth);
    put(J.armR, 0.1, D.upper, 0.1, -D.upper / 2, cloth);
    put(J.foreL, 0.08, D.fore, 0.08, -D.fore / 2, skin);
    put(J.foreR, 0.08, D.fore, 0.08, -D.fore / 2, skin);
    put(J.legL, 0.15, D.thigh, 0.15, -D.thigh / 2, cloth);
    put(J.legR, 0.15, D.thigh, 0.15, -D.thigh / 2, cloth);
    put(J.shinL, 0.12, D.shin, 0.12, -D.shin / 2, cloth);
    put(J.shinR, 0.12, D.shin, 0.12, -D.shin / 2, cloth);
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

let crowd: Crowd | null = null;

/** The one far crowd (made on first use). */
export function farCrowd(): Crowd {
  crowd ??= new Crowd();
  return crowd;
}
