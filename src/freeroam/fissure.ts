/**
 * The ground the blast tears open: a jagged fissure along the beam's path from her feet to a deep crater where he
 * stood. The courtyard floor is built with that hole already cut, an intact patch covers it until the blast, and a
 * sunken pit with a molten floor lies beneath - real depth, so you can walk or drop down into it.
 */
import * as THREE from 'three';
import { GIANT_STAND } from './world';

const CRATER_DEPTH = 7;
const TRENCH_DEPTH = 3.4;
/** where the fissure starts, just short of her feet */
const TRENCH_TOP = 12.5;

const wob = (z: number): number => Math.sin(z * 0.35) * 1.2 + Math.sin(z * 0.9) * 0.4;
const halfWidth = (z: number): number => (1.9 + 0.8 * Math.sin(z * 0.6 + 1) + 0.45 * Math.sin(z * 1.7)) * (1 - THREE.MathUtils.smoothstep(z, 8, TRENCH_TOP));
const craterR = (a: number): number => 15 + 1.2 * Math.sin(a * 5) + 0.6 * Math.sin(a * 11 + 1);

/** How far below the courtyard the torn ground lies at (x, z): 0 outside the hole. */
export function depthAt(x: number, z: number): number {
  const dx = x - GIANT_STAND.x;
  const dz = z - GIANT_STAND.z;
  const d = Math.hypot(dx, dz);
  const R = craterR(Math.atan2(dz, dx));
  const bowl = d < R ? CRATER_DEPTH * (1 - (d / R) * (d / R)) : 0;
  let trench = 0;
  if (z < TRENCH_TOP) {
    const w = halfWidth(z);
    const lat = Math.abs(x - wob(z));
    if (w > 0.01 && lat < w) trench = TRENCH_DEPTH * (1 - (lat / w) * (lat / w)) * Math.min(1, (TRENCH_TOP - z) / 3);
  }
  return Math.max(bowl, trench);
}

/** The hole's outline (world x, z), counter-clockwise from the fissure's top. */
function outline(): THREE.Vector2[] {
  const inCrater = (x: number, z: number): boolean => {
    const dx = x - GIANT_STAND.x;
    const dz = z - GIANT_STAND.z;
    return Math.hypot(dx, dz) < craterR(Math.atan2(dz, dx));
  };
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  let z = TRENCH_TOP;
  for (; z > GIANT_STAND.z; z -= 0.4) {
    const w = halfWidth(z);
    const l = new THREE.Vector2(wob(z) - w, z);
    if (inCrater(l.x, l.y)) break;
    left.push(l);
  }
  for (let zz = TRENCH_TOP; zz > GIANT_STAND.z; zz -= 0.4) {
    const w = halfWidth(zz);
    const r = new THREE.Vector2(wob(zz) + w, zz);
    if (inCrater(r.x, r.y)) break;
    right.push(r);
  }
  const angle = (p: THREE.Vector2): number => Math.atan2(p.y - GIANT_STAND.z, p.x - GIANT_STAND.x);
  const a0 = angle(left[left.length - 1]);
  let a1 = angle(right[right.length - 1]);
  // the long way round, through the far side of the crater
  if (a1 < a0) a1 += Math.PI * 2;
  const arc: THREE.Vector2[] = [];
  const steps = 72;
  for (let i = 1; i < steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const R = craterR(a);
    arc.push(new THREE.Vector2(GIANT_STAND.x + Math.cos(a) * R, GIANT_STAND.z + Math.sin(a) * R));
  }
  return [...left, ...arc, ...right.reverse()];
}

export interface Ground {
  /** the courtyard floor's height at (x, z): below zero only once the ground is torn */
  heightAt: (x: number, z: number) => number;
  setTorn: (torn: boolean) => void;
  /** heat of the molten floor, 0..1 */
  setHeat: (heat: number) => void;
  /** the hole, as a path in the floor's own (x, -z) plane, for decals that must not cover it */
  holePath: () => THREE.Path;
}

export function buildGround(scene: THREE.Scene, mat: THREE.MeshLambertMaterial, size: number): Ground {
  const hole = outline();
  const toPlane = (p: THREE.Vector2): THREE.Vector2 => new THREE.Vector2(p.x, -p.y);
  const holePath = (): THREE.Path => new THREE.Path(hole.map(toPlane));

  // the floor, with the hole cut out (shape coordinates are metres, so is the texture's repeat)
  const shape = new THREE.Shape([new THREE.Vector2(-size, -size), new THREE.Vector2(size, -size), new THREE.Vector2(size, size), new THREE.Vector2(-size, size)]);
  shape.holes.push(holePath());
  const floorGeo = new THREE.ShapeGeometry(shape);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, mat);
  scene.add(floor);

  // the patch that covers the hole until the blast
  const patchGeo = new THREE.ShapeGeometry(new THREE.Shape(hole.map(toPlane)));
  patchGeo.rotateX(-Math.PI / 2);
  const patch = new THREE.Mesh(patchGeo, mat);
  scene.add(patch);

  // the pit: a grid over the hole's bounds, pushed down by depthAt, glowing where it is deepest
  const xs = hole.map((p) => p.x);
  const zs = hole.map((p) => p.y);
  const x0 = Math.min(...xs) - 1;
  const x1 = Math.max(...xs) + 1;
  const z0 = Math.min(...zs) - 1;
  const z1 = Math.max(...zs) + 1;
  const pitGeo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.ceil((x1 - x0) * 2), Math.ceil((z1 - z0) * 2));
  pitGeo.rotateX(-Math.PI / 2);
  pitGeo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = pitGeo.attributes.position as THREE.BufferAttribute;
  const glow = new Float32Array(pos.count);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const d = depthAt(x, z);
    const jag = d > 0.3 ? Math.sin(x * 3.1 + z * 1.7) * 0.18 + Math.sin(x * 7.3 - z * 5.1) * 0.08 : 0;
    pos.setY(i, -Math.max(d + jag, 0.06));
    const deep = d / CRATER_DEPTH;
    glow[i] = THREE.MathUtils.smoothstep(d, 2.2, 3.4) * 0.6 + THREE.MathUtils.smoothstep(deep, 0.55, 1) * 1.2 + (Math.sin(x * 2.3) * Math.sin(z * 1.9) > 0.55 && d > 1 ? 0.6 : 0);
    const c = 0.22 - deep * 0.12;
    colors.set([c * 1.1, c * 0.85, c * 0.8], i * 3);
  }
  pitGeo.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  pitGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  pitGeo.computeVertexNormals();
  const heat = { value: 1 };
  const pitMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  pitMat.onBeforeCompile = (sh) => {
    sh.uniforms.uHeat = heat;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHeat;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(2.0, 0.42, 0.06) * vGlow * vGlow * uHeat;');
  };
  const pit = new THREE.Mesh(pitGeo, pitMat);
  pit.visible = false;
  scene.add(pit);

  let torn = false;
  return {
    heightAt: (x, z) => (torn ? -depthAt(x, z) : 0),
    setTorn: (t) => {
      if (t === torn) return;
      torn = t;
      patch.visible = !t;
      pit.visible = t;
    },
    setHeat: (h) => {
      heat.value = h;
    },
    holePath,
  };
}
