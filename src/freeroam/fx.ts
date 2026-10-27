/**
 * The effects of the scene. Anime VFX are mostly shapes, not simulations: hard-edged colour bands, additive streaks
 * and noise scrolling over simple meshes. Everything here is either a shader animated by a time uniform (no CPU work)
 * or a small pooled CPU system. Glowing colours go above 1.0 so the bloom pass picks them up and nothing else.
 */
import * as THREE from 'three';
import { glowTex, KNIGHT_HOME, rng } from './world';

const NOISE = /* glsl */ `
  float hash1(float n) { return fract(sin(n) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
  }
  float noise3(vec3 x) {
    vec3 p = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 57.0 + 113.0 * p.z;
    return mix(mix(mix(hash1(n), hash1(n + 1.0), f.x), mix(hash1(n + 57.0), hash1(n + 58.0), f.x), f.y),
               mix(mix(hash1(n + 113.0), hash1(n + 114.0), f.x), mix(hash1(n + 170.0), hash1(n + 171.0), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) { return noise3(p) * 0.55 + noise3(p * 2.1) * 0.3 + noise3(p * 4.3) * 0.15; }
`;

/** Shared point-sprite fragment: a soft dot. */
const DOT_FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, d) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vCol, a);
  }`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

export interface FxQuality {
  low: boolean;
}

export class Fx {
  readonly time = { value: 0 };
  /** pixels per world unit at distance 1: keeps point sprites the same size at any resolution */
  readonly px = { value: 500 };

  // ---- always on ----
  private readonly embers: THREE.ShaderMaterial;

  // ---- the shadow ----
  private readonly motes: THREE.ShaderMaterial;
  private readonly tendrils: THREE.InstancedMesh;
  private readonly tendrilMat: THREE.ShaderMaterial;

  // ---- the clash ----
  private readonly arcs: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; life: number; spin: number }[] = [];
  private readonly waves: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; size: number }[] = [];
  private readonly sparks: Sparks;

  // ---- the charge ----
  private readonly pillar: THREE.Group;
  private readonly pillarMats: THREE.ShaderMaterial[] = [];
  private readonly bolts: THREE.LineSegments;
  private readonly boltMat: THREE.LineBasicMaterial;
  private boltTimer = 0;

  // ---- the beam ----
  private readonly beam = new THREE.Group();
  private readonly beamMats: THREE.ShaderMaterial[] = [];
  private readonly beamHead: THREE.Sprite;

  // ---- the blast ----
  private readonly fireball: THREE.Mesh;
  private readonly fireMat: THREE.ShaderMaterial;
  private readonly smoke: THREE.Mesh;
  private readonly smokeMat: THREE.ShaderMaterial;
  private readonly debris: Debris;
  private readonly rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];

  readonly swordLight = new THREE.PointLight(0xa040ff, 0, 40, 1.2);
  readonly boomLight = new THREE.PointLight(0xff7a20, 0, 160, 1.1);

  constructor(
    scene: THREE.Scene,
    q: FxQuality,
  ) {
    const r = rng(99);

    // embers: drift up across the whole courtyard, entirely in the vertex shader
    {
      const n = q.low ? 700 : 1800;
      const pos = new Float32Array(n * 3);
      const seed = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (r() - 0.5) * 150;
        pos[i * 3 + 2] = (r() - 0.5) * 150 - 6;
        seed.set([r(), r(), r(), 0.5 + r() * 2], i * 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
      this.embers = new THREE.ShaderMaterial({
        ...additive,
        uniforms: { uTime: this.time, uPx: this.px, uBoost: { value: 1 }, uHeat: { value: 0 } },
        vertexShader: /* glsl */ `
          uniform float uTime, uPx, uBoost, uHeat;
          attribute vec4 seed;
          varying vec3 vCol;
          varying float vA;
          void main() {
            float span = 34.0;
            float h = mod(seed.x * span + uTime * seed.w * (1.0 + uHeat * 2.5), span);
            vec3 p = position;
            p.x += sin(uTime * 0.6 + seed.y * 40.0) * 2.5 + h * (seed.z - 0.5) * 0.6;
            p.z += cos(uTime * 0.45 + seed.z * 40.0) * 2.5;
            p.y = h - 1.0;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = min((0.07 + seed.y * 0.09) * uPx / -mv.z, 24.0);
            float flick = 0.6 + 0.4 * sin(uTime * 9.0 + seed.z * 60.0);
            vA = smoothstep(0.0, 3.0, h) * (1.0 - smoothstep(span - 8.0, span, h)) * flick * uBoost;
            vCol = mix(vec3(3.0, 0.9, 0.2), vec3(3.5, 2.2, 0.6), seed.y) * (0.5 + uHeat);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: DOT_FRAG,
      });
      const pts = new THREE.Points(g, this.embers);
      pts.frustumCulled = false;
      scene.add(pts);
    }

    // dark motes circling the knight; while she charges they pour into the blade
    {
      const n = q.low ? 400 : 1000;
      const pos = new Float32Array(n * 3);
      const seed = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) seed.set([r() * 6.283, 1.5 + Math.pow(r(), 0.6) * 9, r(), r()], i * 4);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
      this.motes = new THREE.ShaderMaterial({
        ...additive,
        uniforms: {
          uTime: this.time,
          uPx: this.px,
          uAmt: { value: 0 },
          uSuck: { value: 0 },
          uCenter: { value: KNIGHT_HOME.clone() },
          uTarget: { value: new THREE.Vector3() },
        },
        vertexShader: /* glsl */ `
          uniform float uTime, uPx, uAmt, uSuck;
          uniform vec3 uCenter, uTarget;
          attribute vec4 seed;
          varying vec3 vCol;
          varying float vA;
          void main() {
            float ang = seed.x + uTime * (0.3 + seed.w * 0.8) * (1.0 + uSuck * 5.0);
            float rad = seed.y;
            float hgt = mod(seed.z * 10.0 + uTime * (0.4 + seed.w), 10.0);
            vec3 orbit = uCenter + vec3(cos(ang) * rad, hgt, sin(ang) * rad);
            float k = clamp(uSuck * 1.6 - seed.w * 0.6, 0.0, 1.0);
            k = k * k;
            vec3 swirl = vec3(cos(ang * 2.0), sin(ang * 3.0), sin(ang * 2.0)) * (1.0 - k) * 1.5;
            vec3 p = mix(orbit, uTarget + swirl, k);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = min((0.06 + seed.w * 0.08) * uPx / -mv.z, 28.0);
            vA = uAmt * smoothstep(0.0, 1.5, hgt + k * 2.0);
            vCol = mix(vec3(0.5, 0.1, 1.3), vec3(1.5, 0.1, 0.3), step(0.82, seed.w));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: DOT_FRAG,
      });
      const pts = new THREE.Points(g, this.motes);
      pts.frustumCulled = false;
      scene.add(pts);
    }

    // shadow tendrils: one instanced tube, waved and grown in the vertex shader
    {
      const n = q.low ? 12 : 22;
      const geo = new THREE.CylinderGeometry(0.32, 0.32, 1, 6, 28, false);
      geo.translate(0, 0.5, 0);
      this.tendrilMat = new THREE.ShaderMaterial({
        uniforms: { uTime: this.time, uGrow: { value: 0 }, uHeat: { value: 0 } },
        vertexShader: /* glsl */ `
          uniform float uTime, uGrow;
          varying float vY;
          varying vec3 vN, vV;
          float h1(float n) { return fract(sin(n) * 43758.5453); }
          void main() {
            float id = float(gl_InstanceID);
            float ph = h1(id * 7.13) * 6.283;
            float len = (5.0 + h1(id * 3.31) * 11.0) * uGrow;
            float y = position.y;
            vec3 p = position;
            p.xz *= (1.0 - y * 0.92) * (0.6 + h1(id) * 0.9);
            p.x += sin(y * 4.5 - uTime * 2.4 + ph) * y * 1.7 + sin(y * 11.0 + uTime * 3.3 + ph * 2.0) * y * 0.35;
            p.z += cos(y * 3.7 - uTime * 1.8 + ph) * y * 1.2 + y * y * len * 0.4;
            p.y = y * len;
            vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
            vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
            vV = normalize(cameraPosition - wp.xyz);
            vY = y;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uHeat;
          varying float vY;
          varying vec3 vN, vV;
          void main() {
            float rim = 1.0 - abs(dot(normalize(vN), vV));
            // hard bands, not a gradient: the anime look
            float band = step(0.55, rim) * 0.5 + step(0.8, rim) * 0.5;
            vec3 col = mix(vec3(0.012, 0.0, 0.025), vec3(0.9, 0.15, 2.2), band);
            float vein = step(0.93, fract(vY * 6.0 - uTime * 1.6));
            col += vec3(2.8, 0.1, 0.35) * vein * uHeat;
            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      this.tendrils = new THREE.InstancedMesh(geo, this.tendrilMat, n);
      const m = new THREE.Matrix4();
      const qt = new THREE.Quaternion();
      const e = new THREE.Euler();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.3;
        const d = 1.6 + r() * 5.5;
        qt.setFromEuler(e.set(0, Math.atan2(Math.cos(a), Math.sin(a)), 0));
        m.compose(new THREE.Vector3(KNIGHT_HOME.x + Math.cos(a) * d, -0.2, KNIGHT_HOME.z + Math.sin(a) * d), qt, new THREE.Vector3(1, 1, 1));
        this.tendrils.setMatrixAt(i, m);
      }
      this.tendrils.frustumCulled = false;
      this.tendrils.visible = false;
      scene.add(this.tendrils);
    }

    // slash arcs: a sweep of light that fades from tail to head
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.ShaderMaterial({
        ...additive,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uFade: { value: 0 } },
        vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uFade;
          varying vec2 vP;
          void main() {
            float t = clamp(atan(vP.y, vP.x) / 2.6, 0.0, 1.0);
            float r = length(vP);
            float w = mix(0.05, 0.3, t);
            float edge = 1.0 - smoothstep(0.0, w, abs(r - 1.85));
            float a = t * t * smoothstep(1.0, 0.92, t) * edge * uFade;
            gl_FragColor = vec4(mix(uColor, vec3(4.0), step(0.75, edge) * t), a);
          }`,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.2, 40, 1, 0, 2.6), mat);
      mesh.visible = false;
      scene.add(mesh);
      this.arcs.push({ mesh, mat, life: 0, spin: 0 });
    }

    // ground shockwaves
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({ ...additive, color: new THREE.Color(), opacity: 0, side: THREE.DoubleSide, fog: false });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.waves.push({ mesh, mat, life: 0, max: 1, size: 1 });
    }

    this.sparks = new Sparks(scene, q.low ? 500 : 1200, this.px);

    // the charge: a column of light into the sky, and bolts crawling down it
    {
      this.pillar = new THREE.Group();
      const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
      geo.translate(0, 0.5, 0);
      for (const [radius, hot] of [
        [1.5, 0],
        [0.3, 1],
      ] as const) {
        const mat = new THREE.ShaderMaterial({
          ...additive,
          side: THREE.DoubleSide,
          uniforms: { uTime: this.time, uAmt: { value: 0 }, uHot: { value: hot } },
          vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: /* glsl */ `
            ${NOISE}
            uniform float uTime, uAmt, uHot;
            varying vec2 vUv;
            void main() {
              float n = noise2(vec2(vUv.x * 14.0, vUv.y * 4.0 - uTime * 3.0));
              float streak = step(0.55, n) * 0.6 + step(0.75, n) * 0.4;
              float fy = smoothstep(0.0, 0.03, vUv.y) * (1.0 - smoothstep(0.4, 1.0, vUv.y));
              vec3 col = mix(vec3(0.45, 0.04, 1.0), vec3(1.4, 0.12, 0.3), streak);
              col = mix(col, vec3(2.2, 1.4, 2.4), uHot);
              gl_FragColor = vec4(col, uAmt * fy * mix(0.05 + streak * 0.3, 0.45, uHot));
            }`,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(radius, 90, radius);
        this.pillar.add(mesh);
        this.pillarMats.push(mat);
      }
      this.pillar.visible = false;
      scene.add(this.pillar);

      const boltGeo = new THREE.BufferGeometry();
      boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 12 * 2 * 3), 3));
      this.boltMat = new THREE.LineBasicMaterial({ ...additive, color: new THREE.Color(2.5, 1.2, 4), opacity: 0 });
      this.bolts = new THREE.LineSegments(boltGeo, this.boltMat);
      this.bolts.frustumCulled = false;
      scene.add(this.bolts);
    }

    // the beam: a dark outer wave, a red-violet body and a white-hot core
    {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 28, 24, true);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0, 0.5);
      const layers: [number, THREE.Color, THREE.Color, boolean, number][] = [
        [3.4, new THREE.Color(0.03, 0.0, 0.06), new THREE.Color(0.5, 0.08, 1.2), false, 0.9],
        [2.2, new THREE.Color(1.4, 0.08, 0.4), new THREE.Color(1.0, 0.15, 2.2), true, 0.7],
        [0.7, new THREE.Color(3.0, 2.0, 3.0), new THREE.Color(3.0, 1.0, 1.8), true, 0.9],
      ];
      for (const [w, a, b, add, op] of layers) {
        const mat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
          side: THREE.DoubleSide,
          uniforms: { uTime: this.time, uAmt: { value: 0 }, uA: { value: a }, uB: { value: b }, uOp: { value: op } },
          vertexShader: /* glsl */ `
            uniform float uTime;
            varying vec2 vUv;
            varying vec3 vN, vV;
            void main() {
              vUv = uv;
              vec3 p = position;
              float ang = atan(p.y, p.x);
              float env = 0.35 + 0.65 * smoothstep(0.0, 0.12, uv.y);
              float wob = 1.0 + 0.16 * sin(uv.y * 34.0 - uTime * 28.0 + ang * 3.0) + 0.08 * sin(ang * 7.0 + uTime * 15.0);
              p.xy *= env * wob;
              vec4 wp = modelMatrix * vec4(p, 1.0);
              vN = normalize(mat3(modelMatrix) * normal);
              vV = normalize(cameraPosition - wp.xyz);
              gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
          fragmentShader: /* glsl */ `
            ${NOISE}
            uniform float uTime, uAmt, uOp;
            uniform vec3 uA, uB;
            varying vec2 vUv;
            varying vec3 vN, vV;
            void main() {
              float n = noise2(vec2(vUv.x * 10.0, vUv.y * 22.0 - uTime * 34.0));
              float rim = 1.0 - abs(dot(normalize(vN), vV));
              float band = step(0.5, n * 0.6 + rim * 0.6);
              vec3 col = mix(uA, uB, band);
              float a = uAmt * uOp * (0.55 + 0.45 * n) * smoothstep(1.0, 0.94, vUv.y);
              gl_FragColor = vec4(col, a);
            }`,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(w, w, 1);
        mesh.frustumCulled = false;
        this.beam.add(mesh);
        this.beamMats.push(mat);
      }
      this.beamHead = new THREE.Sprite(new THREE.SpriteMaterial({ ...additive, map: glowTex, color: new THREE.Color(4, 1.5, 3.5), fog: false }));
      scene.add(this.beamHead);
      this.beam.visible = false;
      this.beamHead.visible = false;
      scene.add(this.beam);
    }

    // the blast: a noise-displaced fireball with a stepped colour ramp, a smoke shell, flying rubble and rings
    {
      const geo = new THREE.IcosahedronGeometry(1, q.low ? 3 : 4);
      const vert = /* glsl */ `
        ${NOISE}
        uniform float uTime, uDisp;
        varying vec3 vN, vV;
        varying float vNz;
        void main() {
          float n = fbm3(position * 2.2 + vec3(0.0, -uTime * 1.6, 0.0));
          vNz = n;
          vec3 p = position * (1.0 + (n - 0.5) * uDisp);
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`;
      this.fireMat = new THREE.ShaderMaterial({
        ...additive,
        uniforms: { uTime: this.time, uDisp: { value: 0.7 }, uFade: { value: 0 }, uHeat: { value: 1 } },
        vertexShader: vert,
        fragmentShader: /* glsl */ `
          uniform float uFade, uHeat;
          varying vec3 vN, vV;
          varying float vNz;
          void main() {
            float facing = abs(dot(normalize(vN), vV));
            float heat = facing * 0.7 + vNz * 0.6 - (1.0 - uHeat) * 0.5;
            // stepped ramp: white core, yellow, orange, red rim
            vec3 col = vec3(1.1, 0.1, 0.03);
            col = mix(col, vec3(2.2, 0.6, 0.08), step(0.45, heat));
            col = mix(col, vec3(3.0, 1.6, 0.3), step(0.7, heat));
            col = mix(col, vec3(3.6, 2.9, 1.8), step(0.92, heat));
            gl_FragColor = vec4(col, uFade * (0.2 + facing * 0.5));
          }`,
      });
      this.fireball = new THREE.Mesh(geo, this.fireMat);
      this.fireball.visible = false;
      scene.add(this.fireball);
      this.smokeMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: this.time, uDisp: { value: 1.1 }, uFade: { value: 0 } },
        vertexShader: vert,
        fragmentShader: /* glsl */ `
          uniform float uFade;
          varying vec3 vN, vV;
          varying float vNz;
          void main() {
            float facing = abs(dot(normalize(vN), vV));
            float b = step(0.5, vNz);
            vec3 col = mix(vec3(0.02, 0.012, 0.02), vec3(0.1, 0.035, 0.03), b);
            gl_FragColor = vec4(col, uFade * smoothstep(0.0, 0.5, facing) * 0.85);
          }`,
      });
      this.smoke = new THREE.Mesh(geo, this.smokeMat);
      this.smoke.visible = false;
      scene.add(this.smoke);

      this.debris = new Debris(scene, q.low ? 40 : 80);

      for (let i = 0; i < 4; i++) {
        const mat = new THREE.MeshBasicMaterial({ ...additive, color: new THREE.Color(), opacity: 0, fog: false });
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 64), mat);
        mesh.visible = false;
        scene.add(mesh);
        this.rings.push({ mesh, mat, life: 0 });
      }
    }

    scene.add(this.swordLight, this.boomLight);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // what the director drives

  setEmbers(boost: number, heat: number): void {
    this.embers.uniforms.uBoost.value = boost;
    this.embers.uniforms.uHeat.value = heat;
  }

  setShadow(grow: number, heat: number, motes: number, suck: number, tip: THREE.Vector3): void {
    this.tendrilMat.uniforms.uGrow.value = grow;
    this.tendrilMat.uniforms.uHeat.value = heat;
    this.tendrils.visible = grow > 0.005;
    this.motes.uniforms.uAmt.value = motes;
    this.motes.uniforms.uSuck.value = suck;
    this.motes.uniforms.uTarget.value.copy(tip);
  }

  setPillar(amt: number, hot: number, at: THREE.Vector3, bolts: boolean, tip: THREE.Vector3, dt: number): void {
    this.pillar.visible = amt > 0.01;
    this.pillar.position.set(at.x, 0, at.z);
    this.pillarMats[0].uniforms.uAmt.value = amt;
    this.pillarMats[1].uniforms.uAmt.value = amt * hot;
    this.boltTimer -= dt;
    if (!bolts) {
      this.boltMat.opacity = 0;
      return;
    }
    if (this.boltTimer <= 0) {
      this.boltTimer = 0.05 + Math.random() * 0.07;
      if (Math.random() < 0.5) this.boltMat.color.setRGB(3.5, 0.3, 0.6);
      else this.boltMat.color.setRGB(2.2, 1.0, 4.0);
      const a = this.bolts.geometry.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      let o = 0;
      const p = new THREE.Vector3();
      const from = new THREE.Vector3();
      for (let b = 0; b < 8; b++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 3 + Math.random() * 9;
        from.set(tip.x + Math.cos(ang) * rad, tip.y + 4 + Math.random() * 18, tip.z + Math.sin(ang) * rad);
        if (b >= 5) from.set(tip.x + Math.cos(ang) * rad, 0.1, tip.z + Math.sin(ang) * rad); // some crawl up from the ground
        p.copy(from);
        for (let s = 0; s < 12; s++) {
          const k = (s + 1) / 12;
          arr[o++] = p.x;
          arr[o++] = p.y;
          arr[o++] = p.z;
          const jitter = (1 - k) * 1.6;
          p.lerpVectors(from, tip, k);
          if (s < 11) p.add(new THREE.Vector3((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter));
          arr[o++] = p.x;
          arr[o++] = p.y;
          arr[o++] = p.z;
        }
      }
      a.needsUpdate = true;
    }
    this.boltMat.opacity = Math.random() < 0.8 ? 1 : 0.2;
  }

  /** `reach` 0..1 is how far the beam has travelled; `amt` its strength. */
  setBeam(from: THREE.Vector3, to: THREE.Vector3, reach: number, amt: number): void {
    const on = amt > 0.01 && reach > 0;
    this.beam.visible = on;
    this.beamHead.visible = on;
    if (!on) return;
    this.beam.position.copy(from);
    this.beam.lookAt(to);
    const len = from.distanceTo(to) * reach + 0.01;
    this.beam.scale.set(1, 1, len);
    for (const m of this.beamMats) m.uniforms.uAmt.value = amt;
    this.beamHead.position.lerpVectors(from, to, reach);
    this.beamHead.scale.setScalar((reach < 1 ? 10 : 14 + Math.sin(this.time.value * 40) * 2) * amt);
  }

  clash(at: THREE.Vector3, big: boolean): void {
    const n = big ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const arc = this.arcs.find((a) => a.life <= 0) ?? this.arcs[0];
      arc.life = 0.32;
      arc.spin = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 6);
      arc.mesh.visible = true;
      arc.mesh.position.copy(at);
      arc.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      arc.mesh.scale.setScalar((big ? 1.6 : 1.1) * (0.8 + Math.random() * 0.5));
      arc.mat.uniforms.uColor.value.setRGB(...(i % 2 ? ([3.2, 0.25, 0.4] as const) : ([1.4, 0.35, 3.6] as const)));
    }
    this.sparks.burst(at, big ? 160 : 70, big ? 16 : 11, [4, 3.4, 3.8], [3.4, 0.3, 0.6], 0.25);
    if (big) this.wave(new THREE.Vector3(at.x, 0.05, at.z), 16, 0.7, [1.6, 0.6, 3.5]);
  }

  wave(at: THREE.Vector3, size: number, life: number, rgb: [number, number, number]): void {
    const w = this.waves.find((x) => x.life <= 0) ?? this.waves[0];
    w.life = w.max = life;
    w.size = size;
    w.mesh.position.copy(at);
    w.mesh.visible = true;
    w.mat.color.setRGB(...rgb);
  }

  sparkBurst(at: THREE.Vector3, n: number, speed: number, a: [number, number, number], b: [number, number, number], gravity: number): void {
    this.sparks.burst(at, n, speed, a, b, gravity);
  }

  explode(at: THREE.Vector3): void {
    this.fireball.position.copy(at);
    this.smoke.position.copy(at);
    this.debris.burst(at);
    this.sparks.burst(at, 400, 34, [4, 2.6, 0.6], [3.6, 0.6, 0.15], 0.6);
    this.wave(new THREE.Vector3(at.x, 0.1, at.z), 70, 1.6, [3.2, 1.0, 0.3]);
  }

  /** `grow` 0..1 of the fireball, `fade` 0..1, `smoke` 0..1. */
  setBlast(grow: number, fade: number, smoke: number): void {
    this.fireball.visible = fade > 0.01;
    this.smoke.visible = smoke > 0.01;
    this.fireball.scale.setScalar(1 + grow * 17);
    this.fireMat.uniforms.uFade.value = fade;
    this.fireMat.uniforms.uHeat.value = 1 - grow * 0.45;
    this.smoke.scale.setScalar(4 + grow * 19);
    this.smokeMat.uniforms.uFade.value = smoke;
    this.boomLight.position.copy(this.fireball.position).setY(8);
    this.boomLight.intensity = fade * 500;
  }

  ring(at: THREE.Vector3, rgb: [number, number, number]): void {
    const r = this.rings.find((x) => x.life <= 0) ?? this.rings[0];
    r.life = 2.4;
    r.mesh.position.copy(at);
    r.mesh.visible = true;
    r.mat.color.setRGB(...rgb);
  }

  /** Everything off (the scene restarts). */
  reset(): void {
    for (const a of this.arcs) (a.life = 0), (a.mesh.visible = false);
    for (const w of this.waves) (w.life = 0), (w.mesh.visible = false);
    for (const r of this.rings) (r.life = 0), (r.mesh.visible = false);
    this.sparks.clear();
    this.debris.clear();
    this.setBlast(0, 0, 0);
  }

  update(dt: number, time: number): void {
    this.time.value = time;
    for (const a of this.arcs) {
      if (a.life <= 0) continue;
      a.life -= dt;
      a.mesh.rotateZ(a.spin * dt);
      a.mesh.scale.multiplyScalar(1 + dt * 1.8);
      a.mat.uniforms.uFade.value = Math.max(0, a.life / 0.32);
      if (a.life <= 0) a.mesh.visible = false;
    }
    for (const w of this.waves) {
      if (w.life <= 0) continue;
      w.life -= dt;
      const k = 1 - w.life / w.max;
      w.mesh.scale.setScalar(0.5 + Math.pow(k, 0.5) * w.size);
      w.mat.opacity = (1 - k) * (1 - k);
      if (w.life <= 0) w.mesh.visible = false;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - r.life / 2.4;
      r.mesh.scale.setScalar(3 + Math.pow(k, 0.6) * 26);
      r.mat.opacity = 1 - k;
      if (r.life <= 0) r.mesh.visible = false;
    }
    this.sparks.update(dt);
    this.debris.update(dt);
  }
}

// ---------------------------------------------------------------------------------------------------------------------

/** Sparks: a ring buffer of points with a little physics. */
class Sparks {
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly alpha: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly grav: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private next = 0;
  private alive = 0;

  constructor(
    scene: THREE.Scene,
    private readonly n: number,
    px: { value: number },
  ) {
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      ...additive,
      uniforms: { uPx: px },
      vertexShader: /* glsl */ `
        uniform float uPx;
        attribute vec3 aCol;
        attribute float aAlpha;
        varying vec3 vCol;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(0.16 * uPx / -mv.z * (0.4 + aAlpha), 40.0);
          vCol = aCol;
          vA = aAlpha;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: DOT_FRAG,
    });
    const pts = new THREE.Points(this.geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
  }

  burst(at: THREE.Vector3, count: number, speed: number, a: [number, number, number], b: [number, number, number], gravity: number): void {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.3 + Math.random() * 0.7);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([s * Math.cos(th) * v, (Math.abs(u) * 0.8 + 0.2) * v, s * Math.sin(th) * v], i * 3);
      const m = Math.random();
      this.col.set([a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m], i * 3);
      this.life[i] = this.max[i] = 0.4 + Math.random() * 0.9;
      this.grav[i] = gravity;
    }
    this.alive = this.n;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number): void {
    if (this.alive <= 0) return;
    let any = 0;
    const drag = Math.exp(-2.2 * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      any++;
      this.life[i] -= dt;
      const o = i * 3;
      this.vel[o] *= drag;
      this.vel[o + 1] = this.vel[o + 1] * drag - 30 * this.grav[i] * dt;
      this.vel[o + 2] *= drag;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] = Math.max(0.05, this.pos[o + 1] + this.vel[o + 1] * dt);
      this.pos[o + 2] += this.vel[o + 2] * dt;
      this.alpha[i] = Math.max(0, this.life[i] / this.max[i]);
    }
    this.alive = any;
    for (const k of ['position', 'aCol', 'aAlpha']) (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Chunks of rubble thrown by the blast. */
class Debris {
  private readonly mesh: THREE.InstancedMesh;
  private readonly p: THREE.Vector3[] = [];
  private readonly v: THREE.Vector3[] = [];
  private readonly spin: THREE.Vector3[] = [];
  private readonly rot: THREE.Euler[] = [];
  private readonly size: number[] = [];
  private active = false;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(scene: THREE.Scene, n: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x2a2228, emissive: 0x401006 }), n);
    for (let i = 0; i < n; i++) {
      this.p.push(new THREE.Vector3());
      this.v.push(new THREE.Vector3());
      this.spin.push(new THREE.Vector3());
      this.rot.push(new THREE.Euler());
      this.size.push(0);
    }
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  burst(at: THREE.Vector3): void {
    for (let i = 0; i < this.p.length; i++) {
      this.p[i].copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4));
      const a = Math.random() * Math.PI * 2;
      const out = 8 + Math.random() * 26;
      this.v[i].set(Math.cos(a) * out, 10 + Math.random() * 30, Math.sin(a) * out);
      this.spin[i].set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      this.size[i] = 0.2 + Math.pow(Math.random(), 2) * 1.6;
    }
    this.active = true;
    this.mesh.visible = true;
  }

  clear(): void {
    this.active = false;
    this.mesh.visible = false;
  }

  update(dt: number): void {
    if (!this.active) return;
    for (let i = 0; i < this.p.length; i++) {
      const p = this.p[i];
      const v = this.v[i];
      v.y -= 26 * dt;
      p.addScaledVector(v, dt);
      if (p.y < this.size[i] * 0.5) {
        p.y = this.size[i] * 0.5;
        v.set(v.x * 0.4, Math.abs(v.y) * 0.25, v.z * 0.4);
        this.spin[i].multiplyScalar(0.5);
      }
      const r = this.rot[i];
      r.set(r.x + this.spin[i].x * dt, r.y + this.spin[i].y * dt, r.z + this.spin[i].z * dt);
      this.mesh.setMatrixAt(i, this.m.compose(p, this.q.setFromEuler(r), this.s.setScalar(this.size[i])));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
