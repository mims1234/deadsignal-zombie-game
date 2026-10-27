/**
 * The stage for SLIME HOLLOW: a burned village on the night after the raid. The village lies to the south (+z); the
 * field in front of it is where the Iron Choir draws up (-z), with a ridge behind them for the archers and banners,
 * and the dawn comes up over that ridge. Built from a handful of merged and instanced meshes.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, glowTex, rng, type Collider } from '../freeroam/world';

export const ARENA = 110;
export const FOG_NIGHT = new THREE.Color(0x0c1220);
export const FOG_DAWN = new THREE.Color(0x4a3a40);
/** The burned house where Kael kneels at the start. */
export const HOME_HOUSE = new THREE.Vector3(2.6, 0, 26);
/** The ridge behind the army. */
const RIDGE_Z = -47;

/** The ground's height: flat, a gentle roll, and the ridge behind the army. */
export function heightAt(x: number, z: number): number {
  const rx = x / 46;
  const rz = (z - RIDGE_Z) / 8;
  const r = Math.max(0, 1 - rx * rx - rz * rz);
  return 3.4 * r * r * (3 - 2 * r) + Math.sin(x * 0.07) * Math.sin(z * 0.05) * 0.15;
}

export interface World {
  colliders: Collider[];
  heightAt: (x: number, z: number) => number;
  fog: THREE.FogExp2;
  sky: THREE.Mesh;
  skyU: { uDawn: { value: number }; uDark: { value: number } };
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  dawn: THREE.DirectionalLight;
  /** the village fires (their light and their flames) */
  fires: { light: THREE.PointLight; at: THREE.Vector3; base: number }[];
  /** the cold ground light under Kael: the Hollow's own */
  hollowLight: THREE.PointLight;
  update(time: number, camera: THREE.Camera, fire: number): void;
}

function mudTexture(r: () => number): THREE.CanvasTexture {
  const t = canvasTex(512, 512, (g) => {
    g.fillStyle = '#3a342e';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 7000; i++) {
      const v = (30 + r() * 40) | 0;
      g.fillStyle = `rgba(${v + 8},${v + 2},${v - 4},${0.15 + r() * 0.3})`;
      const w = 1 + r() * 6;
      g.fillRect(r() * 512, r() * 512, w, w);
    }
    // ash and scorch
    for (let i = 0; i < 40; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const rad = 10 + r() * 50;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() < 0.6;
      grd.addColorStop(0, dark ? 'rgba(10,8,8,0.55)' : 'rgba(150,145,140,0.25)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function charTexture(r: () => number): THREE.CanvasTexture {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#1c1612';
    g.fillRect(0, 0, 256, 256);
    // charred planks: streaks along the grain, cracks, the odd ember-orange seam
    for (let i = 0; i < 90; i++) {
      const y = r() * 256;
      g.fillStyle = `rgba(${(r() * 20) | 0},${(r() * 14) | 0},${(r() * 10) | 0},0.6)`;
      g.fillRect(0, y, 256, 1 + r() * 3);
    }
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(255,${(80 + r() * 60) | 0},20,${0.2 + r() * 0.4})`;
      g.fillRect(r() * 256, r() * 256, 2 + r() * 20, 1);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildWorld(scene: THREE.Scene, low: boolean): World {
  const r = rng(4242);
  const colliders: Collider[] = [];

  const fog = new THREE.FogExp2(FOG_NIGHT.getHex(), 0.016);
  scene.fog = fog;
  scene.background = new THREE.Color(0x04060c);

  // ---- sky: a cold night with a pale moon, and the dawn that comes up behind the ridge ----
  const moonDir = new THREE.Vector3(0.45, 0.55, -0.7).normalize();
  const skyU = { uDawn: { value: 0 }, uDark: { value: 0 }, uMoon: { value: moonDir } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyU,
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
        uniform vec3 uMoon;
        uniform float uDawn, uDark;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 night = mix(vec3(0.05, 0.07, 0.13), vec3(0.008, 0.01, 0.025), pow(h, 0.5));
          // the dawn: gold low over the ridge (-z), rose above it, the night lifting
          float toward = clamp(-d.z * 0.8 + 0.2, 0.0, 1.0);
          vec3 dawn = mix(vec3(1.2, 0.62, 0.3), vec3(0.32, 0.36, 0.55), pow(h, 0.35));
          dawn += vec3(1.4, 0.8, 0.35) * pow(toward, 3.0) * pow(1.0 - h, 6.0) * 1.2;
          dawn = mix(vec3(0.16, 0.18, 0.3), dawn, toward * 0.8 + 0.2);
          vec3 c = mix(night, dawn, uDawn);
          float m = max(dot(d, uMoon), 0.0);
          float disc = smoothstep(0.99935, 0.9996, m);
          c = mix(c, vec3(0.95, 0.97, 1.0) * 1.4, disc * (1.0 - uDawn * 0.7));
          c += vec3(0.25, 0.3, 0.45) * pow(m, 40.0) * 0.4 * (1.0 - uDawn);
          float s = hash(floor(d * 260.0));
          c += vec3(0.8, 0.85, 1.0) * step(0.9968, s) * smoothstep(0.05, 0.4, d.y) * (0.5 + 0.5 * sin(s * 900.0)) * (1.0 - uDawn);
          // the Hollow darkens the sky
          c *= 1.0 - uDark * 0.6;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0x8090c0, 0x2a2018, 0.8);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xc8d8ff, 0.9);
  moon.position.copy(moonDir).multiplyScalar(100);
  scene.add(moon);
  const dawn = new THREE.DirectionalLight(0xffb070, 0);
  dawn.position.set(-10, 12, -100);
  scene.add(dawn);
  const hollowLight = new THREE.PointLight(0x40d0ff, 0, 30, 1.3);
  scene.add(hollowLight);

  // ---- ground: mud and ash, rolled into the ridge behind the army ----
  const mud = mudTexture(r);
  mud.repeat.set(26, 26);
  const groundGeo = new THREE.PlaneGeometry(260, 260, low ? 80 : 130, low ? 80 : 130);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(gp.getX(i), gp.getZ(i)));
  groundGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ map: mud })));
  // the road through the village and out across the field
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 90),
    new THREE.MeshLambertMaterial({ color: 0x4a4038, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0.5, 0.03, 0);
  scene.add(road);

  // ---- the burned village: charred frames, broken walls, fallen roofs ----
  const charMat = new THREE.MeshLambertMaterial({ map: charTexture(r), color: 0x8a7a70 });
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateX(rx);
    g.rotateZ(rz);
    g.rotateY(ry);
    g.translate(x, y, z);
    parts.push(g);
  };
  const houses: [number, number, number, number][] = [
    [HOME_HOUSE.x, HOME_HOUSE.z, 0.1, 1],
    [-9, 14, -0.2, 0.9],
    [11, 15, 0.25, 1.1],
    [-14, 25, 0.05, 1],
    [14, 29, -0.15, 0.85],
    [-6, 32, 0.3, 1.2],
    [-20, 12, 0.5, 0.8],
    [21, 20, -0.4, 0.95],
    [7, 38, 0.1, 1],
    [-16, 38, -0.2, 1],
  ];
  for (const [hx, hz, ry, s] of houses) {
    const w = 6 * s;
    const d = 4.5 * s;
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    const at = (lx: number, lz: number): [number, number] => [hx + lx * c + lz * sn, hz - lx * sn + lz * c];
    // a raised floor
    box(w + 0.4, 0.4, d + 0.4, hx, 0.2, hz, 0, ry);
    // corner posts and a few standing ones between, burned to different heights
    for (const [lx, lz] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [-w / 2, d / 2],
      [w / 2, d / 2],
      [0, -d / 2],
      [0, d / 2],
    ]) {
      const h = 1.2 + r() * 2.2;
      const [x, z] = at(lx, lz);
      box(0.28, h, 0.28, x, 0.4 + h / 2, z, 0, ry, (r() - 0.5) * 0.12);
      colliders.push({ x, z, r: 0.35, h: h + 0.4 });
    }
    // what is left of the walls: low panels on some sides
    for (const side of [-1, 1]) {
      if (r() < 0.75) {
        const [x, z] = at(0, (side * d) / 2);
        const h = 0.6 + r() * 1.2;
        box(w * (0.4 + r() * 0.5), h, 0.12, x, 0.4 + h / 2, z, 0, ry);
      }
      if (r() < 0.6) {
        const [x, z] = at((side * w) / 2, 0);
        const h = 0.5 + r() * 1.4;
        box(0.12, h, d * (0.4 + r() * 0.5), x, 0.4 + h / 2, z, 0, ry);
      }
    }
    // a roof beam or two fallen across, and half a roof slumped on one side
    for (let k = 0; k < 2; k++) {
      const [x, z] = at((r() - 0.5) * w * 0.6, (r() - 0.5) * d * 0.6);
      box(0.22, 0.22, w * 0.9, x, 1.1 + r() * 0.8, z, (r() - 0.5) * 0.6, ry + Math.PI / 2 + (r() - 0.5) * 0.8, 0);
    }
    if (r() < 0.7) {
      const [x, z] = at(0, -d * 0.25);
      box(w * 0.85, 0.12, d * 0.6, x, 1.6, z, 0.55 + r() * 0.2, ry, (r() - 0.5) * 0.3);
    }
    colliders.push({ x: hx, z: hz, r: 0.1, h: 0.4 });
  }
  // a broken fence along the road, and the village gate
  for (let z = 4; z < 40; z += 1.6) {
    for (const side of [-1, 1]) {
      if (r() < 0.35) continue;
      const h = 0.6 + r() * 0.6;
      box(0.12, h, 0.12, 0.5 + side * 3.4, h / 2, z, 0, 0, (r() - 0.5) * 0.4);
    }
  }
  for (const sx of [-1, 1]) {
    box(0.4, 4.2, 0.4, 0.5 + sx * 3, 2.1, 5);
    colliders.push({ x: 0.5 + sx * 3, z: 5, r: 0.4, h: 4.2 });
  }
  box(8.2, 0.35, 0.5, 0.5, 4.1, 5, 0, 0, 0.06);
  box(7.2, 0.25, 0.3, 0.5, 3.4, 5);
  const village = new THREE.Mesh(mergeGeometries(parts), charMat);
  scene.add(village);

  // ---- dead pines around it all ----
  const treeParts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.42, 10, 6);
  trunk.translate(0, 5, 0);
  treeParts.push(trunk);
  for (let k = 0; k < 6; k++) {
    const len = 1.4 + (6 - k) * 0.35;
    const b = new THREE.CylinderGeometry(0.03, 0.1, len, 4);
    b.translate(0, len / 2, 0);
    b.rotateZ(1.25 + r() * 0.2);
    b.rotateY((k / 6) * Math.PI * 2 + r());
    b.translate(0, 4 + k * 1.0, 0);
    treeParts.push(b);
  }
  const treeN = low ? 110 : 200;
  const trees = new THREE.InstancedMesh(mergeGeometries(treeParts), new THREE.MeshLambertMaterial({ color: 0x18141a }), treeN);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < treeN; i++) {
    const a = r() * Math.PI * 2;
    const d = 46 + r() * 90;
    v.set(Math.sin(a) * d, 0, Math.cos(a) * d + 6);
    v.y = heightAt(v.x, v.z) - 0.2;
    const sc = 0.8 + r() * 0.9;
    q.setFromEuler(e.set((r() - 0.5) * 0.12, r() * 6, (r() - 0.5) * 0.12));
    trees.setMatrixAt(i, m.compose(v, q, s.setScalar(sc)));
    if (d < ARENA + 2) colliders.push({ x: v.x, z: v.z, r: 0.45 * sc, h: 10 * sc });
  }
  scene.add(trees);

  // ---- the fires still burning in the ruins, and the smoke over them ----
  const fireSpots = [
    new THREE.Vector3(HOME_HOUSE.x + 2.6, 0.5, HOME_HOUSE.z + 1.2),
    new THREE.Vector3(-9.5, 0.5, 14.5),
    new THREE.Vector3(11.5, 0.5, 15.5),
    new THREE.Vector3(-14, 0.5, 24.5),
    new THREE.Vector3(13.5, 0.5, 28.5),
    new THREE.Vector3(-6, 0.5, 31),
  ];
  const fires = fireSpots.map((at, i) => {
    const light = new THREE.PointLight(0xff7a30, i < 3 ? 9 : 0, 22, 1.6);
    light.position.copy(at).setY(1.4);
    if (i < 3) scene.add(light);
    return { light, at, base: i < 3 ? 9 : 0 };
  });
  const flameMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(3, 1.2, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flames: THREE.Sprite[] = [];
  for (const at of fireSpots)
    for (let k = 0; k < 4; k++) {
      const sp = new THREE.Sprite(flameMat);
      sp.position.copy(at).add(new THREE.Vector3((r() - 0.5) * 1.2, 0.2 + r() * 0.5, (r() - 0.5) * 1.2));
      sp.userData.base = sp.position.y;
      sp.userData.ph = r() * 6;
      flames.push(sp);
      scene.add(sp);
    }

  const smokeU = { uTime: { value: 0 } };
  const smokeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: smokeU,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vec2(vUv.x * 3.0 + sin(vUv.y * 4.0 + uTime * 0.3) * 0.4, vUv.y * 6.0 - uTime * 0.35);
        float n = n2(p) * 0.6 + n2(p * 2.3) * 0.4;
        float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float a = n * edge * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.4, vUv.y) * 0.55;
        gl_FragColor = vec4(vec3(0.16, 0.15, 0.16), a);
      }`,
  });
  const smokes: THREE.Mesh[] = [];
  for (const at of fireSpots) {
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(7, 28), smokeMat);
    sm.position.copy(at).setY(14);
    smokes.push(sm);
    scene.add(sm);
  }

  return {
    colliders,
    heightAt,
    fog,
    sky,
    skyU,
    hemi,
    moon,
    dawn,
    fires,
    hollowLight,
    update(time, camera, fire) {
      smokeU.uTime.value = time;
      for (const sm of smokes) {
        // turned to face the camera about the vertical only
        sm.rotation.y = Math.atan2(camera.position.x - sm.position.x, camera.position.z - sm.position.z);
      }
      for (const f of flames) {
        const ph = f.userData.ph as number;
        const k = 0.6 + 0.4 * Math.sin(time * 9 + ph) * Math.sin(time * 5.3 + ph * 2);
        f.scale.setScalar((0.9 + k * 0.9) * fire);
        f.position.y = (f.userData.base as number) + k * 0.25;
        f.visible = fire > 0.02;
      }
      for (const f of fires) f.light.intensity = f.base * fire * (0.8 + 0.2 * Math.sin(time * 11 + f.at.x));
    },
  };
}
