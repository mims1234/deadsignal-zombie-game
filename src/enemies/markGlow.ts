/**
 * The Signalka's mark, as seen: a red-orange spark turning over a marked infected's head and a ring of the same light
 * round its chest. One mesh a body (one draw call, and only while it is marked), one shape and one unlit additive
 * material shared by all of them, no texture. It hangs on the rig's root, so a pooled rig carries it to its next body
 * switched off (`Zombie.pose` asks every frame).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let shared: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null;

function parts(): { geo: THREE.BufferGeometry; mat: THREE.Material } {
  if (shared) return shared;
  // built for a body 1 m tall: the mesh is scaled to the body's height
  const spark = new THREE.OctahedronGeometry(0.075, 0).scale(1, 1.7, 1).translate(0, 1.15, 0);
  const ring = new THREE.TorusGeometry(0.26, 0.012, 4, 20).rotateX(Math.PI / 2).translate(0, 0.66, 0);
  const geo = mergeGeometries([spark.toNonIndexed(), ring.toNonIndexed()])!;
  spark.dispose();
  ring.dispose();
  const mat = new THREE.MeshBasicMaterial({ color: 0xff4a1a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  shared = { geo, mat };
  return shared;
}

/** Show or hide the mark on a rig's root (`height`: the body's, `time`: for its turning). */
export function showMark(root: THREE.Object3D, on: boolean, height: number, time: number): void {
  let glow = root.userData.markGlow as THREE.Mesh | undefined;
  if (!on) {
    if (glow) glow.visible = false;
    return;
  }
  if (!glow) {
    const p = parts();
    glow = new THREE.Mesh(p.geo, p.mat);
    glow.name = 'MarkGlow';
    glow.frustumCulled = false;
    glow.matrixAutoUpdate = true;
    root.userData.markGlow = glow;
    root.add(glow);
  }
  glow.visible = true;
  glow.scale.setScalar(height);
  glow.rotation.y = time * 3.2;
}
