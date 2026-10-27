/**
 * The stage for the Excalibur free roam: a ruined castle courtyard in a dead forest under a red moon. Everything is
 * built from a handful of merged / instanced meshes so the whole place costs a few draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildGround, type Ground } from './fissure';

export const KNIGHT_HOME = new THREE.Vector3(0, 0, 14);
export const GIANT_HOME = new THREE.Vector3(0, 0, -26);
/** Where the giant ends up after the clash, and where the blast lands. */
export const GIANT_STAND = new THREE.Vector3(0, 0, -18);
export const ARENA_RADIUS = 110;
export const FOG_BASE = new THREE.Color(0x1a0a20);

export interface Collider {
  x: number;
  z: number;
  r: number;
  /** top of the obstacle: above it you walk over it */
  h: number;
}

export interface World {
  colliders: Collider[];
  /** the cracks that glow around the knight */
  cracks: THREE.MeshBasicMaterial;
  crackMesh: THREE.Mesh;
  /** the floor, which the blast tears open */
  ground: Ground;
  /** the courtyard's pillars, one instance each so the blast can throw them down */
  pillars: { mesh: THREE.InstancedMesh; items: { x: number; z: number; h: number; collider: Collider }[] };
  /** the stone and the trees, which the blast chars */
  stoneMat: THREE.MeshLambertMaterial;
  treeMat: THREE.MeshLambertMaterial;
  /** the scorched trench the beam leaves */
  trench: THREE.MeshBasicMaterial;
  fog: THREE.FogExp2;
  sky: THREE.Mesh;
  skyTint: THREE.Color;
  skyUniforms: { uTint: { value: THREE.Color }; uTintAmt: { value: number } };
}

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A soft round glow, shared by every sprite. */
export const glowTex = canvasTex(128, 128, (g) => {
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
});

function stoneTexture(r: () => number, base: string, joints: boolean): THREE.CanvasTexture {
  const t = canvasTex(512, 512, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6000; i++) {
      const v = (20 + r() * 50) | 0;
      g.fillStyle = `rgba(${v + 12},${v},${v + 14},${0.2 + r() * 0.35})`;
      const w = 1 + r() * 5;
      g.fillRect(r() * 512, r() * 512, w, w);
    }
    if (joints) {
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 3;
      for (let y = 0; y < 512; y += 64) for (let x = ((y / 64) % 2) * 48; x < 560; x += 96) g.strokeRect(x + r() * 4, y + r() * 4, 96, 64);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Jagged cracks running out from the middle (white: the material tints them). */
function crackTexture(r: () => number): THREE.CanvasTexture {
  return canvasTex(1024, 1024, (g) => {
    g.translate(512, 512);
    g.strokeStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = 10;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const crack = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
      const steps = 7 + ((r() * 6) | 0);
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      const forks: [number, number, number][] = [];
      for (let i = 0; i < steps; i++) {
        a += (r() - 0.5) * 0.8;
        x += (Math.cos(a) * len) / steps;
        y += (Math.sin(a) * len) / steps;
        g.lineTo(x, y);
        if (depth < 3 && r() < 0.3) forks.push([x, y, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6)]);
      }
      g.stroke();
      for (const [fx, fy, fa] of forks) crack(fx, fy, fa, len * 0.5, w * 0.6, depth + 1);
    };
    for (let i = 0; i < 16; i++) crack(0, 0, (i / 16) * Math.PI * 2 + r() * 0.3, 260 + r() * 220, 7, 0);
  });
}

export function buildWorld(scene: THREE.Scene, low: boolean): World {
  const r = rng(1234);
  const colliders: Collider[] = [];

  const fog = new THREE.FogExp2(FOG_BASE.getHex(), 0.013);
  scene.fog = fog;
  scene.background = new THREE.Color(0x05030a);

  // ---- sky: a gradient dome with stars and a moon halo; it follows the camera ----
  const moonDir = new THREE.Vector3(-0.35, 0.32, -1).normalize();
  const skyUniforms = {
    uTop: { value: new THREE.Color(0x030208) },
    uHorizon: { value: new THREE.Color(0x1e0a20) },
    uMoon: { value: moonDir },
    uTint: { value: new THREE.Color(0x5a10a0) },
    uTintAmt: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uMoon, uTint;
        uniform float uTintAmt;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 c = mix(uHorizon, uTop, pow(h, 0.45));
          float m = max(dot(d, uMoon), 0.0);
          c += vec3(0.35, 0.03, 0.06) * pow(m, 60.0) * 0.25 + vec3(0.12, 0.01, 0.04) * pow(m, 8.0) * 0.12;
          // the moon: a red disc with a darker rim and a tight halo
          float disc = smoothstep(0.99935, 0.9996, m);
          c = mix(c, mix(vec3(0.55, 0.06, 0.05), vec3(0.95, 0.42, 0.32), smoothstep(0.9994, 0.99995, m)), disc);
          c += vec3(0.5, 0.05, 0.08) * pow(m, 900.0) * 0.5;
          c += uTint * uTintAmt * (1.0 - h * 0.7);
          float s = hash(floor(d * 260.0));
          c += vec3(0.8, 0.75, 1.0) * step(0.9965, s) * smoothstep(0.05, 0.4, d.y) * (0.5 + 0.5 * sin(s * 900.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  scene.add(sky);


  // ---- light: cold violet fill and a red moon ----
  scene.add(new THREE.HemisphereLight(0x8a7ac0, 0x2a1418, 2.6));
  const moonLight = new THREE.DirectionalLight(0xff8080, 2.4);
  moonLight.position.copy(moonDir).multiplyScalar(100);
  scene.add(moonLight);

  // ---- ground ----
  const groundTex = stoneTexture(r, '#4a3c46', true);
  groundTex.repeat.set(0.176, 0.176); // the floor's coordinates are metres: one flagstone tile every 5.7 m
  const ground = buildGround(scene, new THREE.MeshLambertMaterial({ map: groundTex }), 170);

  const cracks = new THREE.MeshBasicMaterial({
    map: crackTexture(r),
    color: new THREE.Color(0.7, 0.2, 1.4),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const crackMesh = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), cracks);
  crackMesh.rotation.x = -Math.PI / 2;
  crackMesh.position.set(KNIGHT_HOME.x, 0.02, KNIGHT_HOME.z);
  scene.add(crackMesh);

  const trenchTex = canvasTex(64, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 512);
  });
  const trench = new THREE.MeshBasicMaterial({
    map: trenchTex,
    color: new THREE.Color(2.2, 0.5, 0.15),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const trenchLen = KNIGHT_HOME.z - GIANT_STAND.z + 8;
  const trenchMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, trenchLen), trench);
  trenchMesh.rotation.x = -Math.PI / 2;
  trenchMesh.position.set(0, 0.03, (KNIGHT_HOME.z + GIANT_STAND.z - 8) / 2);
  scene.add(trenchMesh);

  // ---- the ruined courtyard: broken walls, pillars and a far keep, merged into one mesh ----
  const stoneTex = stoneTexture(r, '#5a4e60', true);
  stoneTex.repeat.set(0.35, 0.35);
  const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTex });
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rz = 0): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateZ(rz);
    g.rotateY(ry);
    g.translate(x, y, z);
    parts.push(g);
  };
  const wallR = 44;
  const gate = (a: number): boolean => [0, Math.PI / 2, Math.PI, Math.PI * 1.5].some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.2);
  for (let a = 0; a < Math.PI * 2; a += 0.155) {
    if (gate(a) || r() < 0.18) continue;
    const x = Math.sin(a) * wallR;
    const z = Math.cos(a) * wallR;
    const h = 2 + r() * 7;
    box(7.2, h, 1.8, x, h / 2, z, a);
    if (r() < 0.6) box(2 + r() * 3, 1 + r() * 2.5, 1.9, x + Math.cos(a) * (r() - 0.5) * 3, h + 0.6, z - Math.sin(a) * (r() - 0.5) * 3, a, (r() - 0.5) * 0.3);
    for (let k = -1; k <= 1; k++) colliders.push({ x: x + Math.cos(a) * k * 2.6, z: z - Math.sin(a) * k * 2.6, r: 1.8, h });
  }
  const pillarItems: { x: number; z: number; h: number; collider: Collider }[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    const x = Math.sin(a) * 29;
    const z = Math.cos(a) * 29 - 4;
    if (Math.abs(x) < 6) continue; // keep the beam's line clear
    const h = 2.5 + r() * 9;
    box(2.4, 0.6, 2.4, x, 0.3, z);
    const collider = { x, z, r: 1.3, h: h + 0.6 };
    colliders.push(collider);
    pillarItems.push({ x, z, h, collider });
  }
  const pillarGeo = new THREE.CylinderGeometry(0.85, 0.95, 1, 10);
  pillarGeo.translate(0, 0.5, 0);
  const pillars = new THREE.InstancedMesh(pillarGeo, stoneMat, pillarItems.length);
  pillarItems.forEach((p, i) => pillars.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.6, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.h, 1))));
  scene.add(pillars);
  // the far keep and a broken tower: silhouettes against the moon
  for (const [x, z, w, h] of [
    [-34, -82, 14, 20],
    [-18, -88, 8, 26],
    [36, -78, 12, 17],
    [52, -64, 7, 22],
  ] as const) {
    box(w, h, w, x, h / 2, z);
    // battlements on all four sides, a few knocked out
    const m = w / 7;
    for (let k = 0; k < 4; k++) {
      const o = -w / 2 + m / 2 + k * 2 * m;
      for (const [bx, bz] of [
        [o, w / 2 - m / 2],
        [o, -w / 2 + m / 2],
        [w / 2 - m / 2, o],
        [-w / 2 + m / 2, o],
      ])
        if (r() > 0.2) box(m, 1.6, m, x + bx, h + 0.8, z + bz);
    }
    if (r() < 0.7) {
      const spire = new THREE.ConeGeometry(w * 0.32, w * 0.9, 6);
      spire.translate(x + w * 0.2, h + w * 0.45, z - w * 0.2);
      parts.push(spire);
    }
    colliders.push({ x, z, r: w * 0.7, h });
  }
  const tower = new THREE.CylinderGeometry(6, 7, 40, 14, 1, true);
  tower.translate(10, 20, -96);
  parts.push(tower);
  const ruins = new THREE.Mesh(mergeGeometries(parts), stoneMat);
  scene.add(ruins);

  // ---- rubble ----
  const rubbleN = low ? 160 : 300;
  const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), stoneMat, rubbleN);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < rubbleN; i++) {
    const a = r() * Math.PI * 2;
    const d = 6 + Math.pow(r(), 0.7) * 50;
    v.set(Math.sin(a) * d, 0, Math.cos(a) * d);
    // the lane where she fights stays clear: nothing for her to run through
    if (Math.abs(v.x) < 6.5 && v.z > -26 && v.z < 18) v.x += 6.5 * Math.sign(v.x || 1);
    const sc = 0.15 + Math.pow(r(), 2.5) * 1.4;
    v.y = sc * 0.3;
    s.set(sc * (0.8 + r() * 0.6), sc * (0.6 + r() * 0.5), sc * (0.8 + r() * 0.6));
    q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3));
    rubble.setMatrixAt(i, m.compose(v, q, s));
    if (sc > 0.9) colliders.push({ x: v.x, z: v.z, r: sc * 0.9, h: sc });
  }
  scene.add(rubble);

  // ---- the dead forest ----
  const treeParts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.55, 9, 6);
  trunk.translate(0, 4.5, 0);
  treeParts.push(trunk);
  for (let k = 0; k < 5; k++) {
    const len = 2.5 + r() * 2.5;
    const b = new THREE.CylinderGeometry(0.04, 0.16, len, 4);
    b.translate(0, len / 2, 0);
    b.rotateZ(0.6 + r() * 0.5);
    b.rotateY((k / 5) * Math.PI * 2 + r());
    b.translate(0, 4 + k * 0.9, 0);
    treeParts.push(b);
  }
  const treeGeo = mergeGeometries(treeParts);
  const treeN = low ? 120 : 220;
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x1e141c });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeN);
  for (let i = 0; i < treeN; i++) {
    const a = r() * Math.PI * 2;
    const d = 54 + r() * 100;
    v.set(Math.sin(a) * d, 0, Math.cos(a) * d);
    if (Math.abs(v.x) < 8 && v.z > 0 && v.z < 70) v.x += 16 * Math.sign(v.x || 1); // the approach stays open
    const sc = 0.8 + r() * 0.9;
    q.setFromEuler(e.set((r() - 0.5) * 0.15, r() * 6, (r() - 0.5) * 0.15));
    trees.setMatrixAt(i, m.compose(v, q, s.setScalar(sc)));
    if (d < ARENA_RADIUS + 2) colliders.push({ x: v.x, z: v.z, r: 0.55 * sc, h: 9 * sc });
  }
  scene.add(trees);

  return {
    colliders,
    cracks,
    crackMesh,
    ground,
    pillars: { mesh: pillars, items: pillarItems },
    stoneMat,
    treeMat,
    trench,
    fog,
    sky,
    skyTint: skyUniforms.uTint.value,
    skyUniforms,
  };
}
