/**
 * The effects of the scene. Anime VFX are mostly shapes, not simulations: hard-edged colour bands, additive streaks
 * and noise scrolling over simple meshes. Everything here is either a shader animated by a time uniform (no CPU work)
 * or a small pooled CPU system. Glowing colours go above 1.0 so the bloom pass picks them up and nothing else.
 */
import * as THREE from 'three';
import { canvasTex, glowTex, KNIGHT_HOME, rng } from './world';

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
  private readonly streams: THREE.Points[] = [];
  private readonly streamU = {
    uTime: this.time,
    uPx: this.px,
    uGrow: { value: 0 },
    uHeat: { value: 0 },
    uSuck: { value: 0 },
    uCenter: { value: KNIGHT_HOME.clone() },
    uTarget: { value: new THREE.Vector3() },
  };
  readonly knightAura: Aura;
  readonly giantAura: Aura;
  readonly levitate: Levitate;
  readonly ripples: Ripples;
  readonly sigil: Sigil;

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
  private readonly shards: Debris;
  /** chips thrown up by his slams: small, and gone again in a few seconds so they never clutter the fight */
  private readonly chips: Debris;
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
      const n = q.low ? 700 : 1600;
      const pos = new Float32Array(n * 3);
      const seed = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) seed.set([r() * 6.283, 1.5 + Math.pow(r(), 0.8) * 24, r(), r()], i * 4);
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

    // the shadow: streams of dark particles flowing up out of the ground in curling strands, with violet sparks
    // running through them - drawn entirely in the vertex shader
    {
      const strands = q.low ? 14 : 22;
      const make = (per: number, dark: boolean): void => {
        const n = strands * per;
        const strand = new Float32Array(n * 4);
        const seed = new Float32Array(n * 4);
        for (let s = 0; s < strands; s++) {
          const a = (s / strands) * Math.PI * 2 + (s * 0.37) % 0.4;
          const d = 1.4 + ((s * 7919) % 100) / 100 * 5.5;
          const len = 5 + ((s * 104729) % 100) / 100 * 11;
          for (let k = 0; k < per; k++) {
            const i = s * per + k;
            strand.set([a, d, s * 1.7, len], i * 4);
            seed.set([r(), r(), r(), r()], i * 4);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        g.setAttribute('strand', new THREE.BufferAttribute(strand, 4));
        g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
        const mat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
          uniforms: this.streamU,
          vertexShader: /* glsl */ `
            uniform float uTime, uPx, uGrow, uHeat, uSuck;
            uniform vec3 uCenter, uTarget;
            attribute vec4 strand;
            attribute vec4 seed;
            varying vec3 vCol;
            varying float vA;
            void main() {
              float u = fract(seed.x + uTime * (0.16 + seed.y * 0.22));
              float len = strand.w * uGrow;
              vec3 o = vec3(cos(strand.x), 0.0, sin(strand.x));
              vec3 side = vec3(-o.z, 0.0, o.x);
              float ph = strand.z;
              vec3 p = uCenter + o * strand.y;
              p += side * (sin(u * 4.5 - uTime * 2.4 + ph) * u * 1.7 + sin(u * 11.0 + uTime * 3.3 + ph * 2.0) * u * 0.35);
              p += o * (cos(u * 3.7 - uTime * 1.8 + ph) * u * 1.2 + u * u * len * 0.4);
              p.y += u * len;
              float loose = (1.0 - u * 0.75) * ${dark ? '0.5' : '0.35'} * seed.w;
              p += vec3(cos(seed.z * 6.283 + uTime * 3.0), sin(seed.w * 6.283 + uTime * 2.0) * 0.6, sin(seed.z * 6.283 + uTime * 3.0)) * loose;
              float k = clamp(uSuck * 1.4 - u * 0.4, 0.0, 1.0);
              p = mix(p, uTarget, k * k);
              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              gl_PointSize = min(${dark ? '0.62' : '0.11'} * (1.0 - u * 0.55) * uPx / -mv.z, ${dark ? '90.0' : '30.0'});
              vA = smoothstep(0.0, 0.07, u) * (1.0 - smoothstep(0.65, 1.0, u)) * step(0.001, uGrow) * min(1.0, uGrow * 3.0);
              ${dark
                ? 'vCol = mix(vec3(0.012, 0.0, 0.03), vec3(0.08, 0.0, 0.12), seed.z); vA *= 0.5;'
                : 'vCol = mix(vec3(0.7, 0.15, 1.9), vec3(2.6, 0.12, 0.35), step(0.8, seed.z) * (0.3 + uHeat));'}
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: DOT_FRAG,
        });
        const pts = new THREE.Points(g, mat);
        pts.frustumCulled = false;
        pts.visible = false;
        scene.add(pts);
        this.streams.push(pts);
      };
      make(q.low ? 36 : 70, true);
      make(q.low ? 30 : 60, false);
    }

    this.knightAura = new Aura(scene, q.low ? 260 : 500, this.time, this.px, [0.8, 0.2, 2.2], 0.7, 2.4);
    this.giantAura = new Aura(scene, q.low ? 300 : 600, this.time, this.px, [2.6, 0.18, 0.12], 1.9, 5.2);
    this.levitate = new Levitate(scene, q.low ? 16 : 26);
    this.ripples = new Ripples(scene);
    this.sigil = new Sigil(scene);

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
              gl_FragColor = vec4(col, uAmt * fy * mix(0.05 + streak * 0.3, 0.3, uHot));
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
      this.shards = new Debris(scene, 26, 0x4a4248);
      this.chips = new Debris(scene, q.low ? 12 : 22, 0x3e3640, 0x000000, 2.2);

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
    this.streamU.uGrow.value = grow;
    this.streamU.uHeat.value = heat;
    this.streamU.uSuck.value = suck;
    this.streamU.uTarget.value.copy(tip);
    for (const p of this.streams) p.visible = grow > 0.005;
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
  setBeam(from: THREE.Vector3, to: THREE.Vector3, reach: number, amt: number, swell = 1): void {
    const on = amt > 0.01 && reach > 0;
    this.beam.visible = on;
    this.beamHead.visible = on;
    if (!on) return;
    this.beam.position.copy(from);
    this.beam.lookAt(to);
    const len = from.distanceTo(to) * reach + 0.01;
    this.beam.scale.set(swell, swell, len);
    for (const m of this.beamMats) m.uniforms.uAmt.value = amt;
    this.beamHead.position.lerpVectors(from, to, reach);
    this.beamHead.scale.setScalar((reach < 1 ? 10 : 14 + Math.sin(this.time.value * 40) * 2) * amt * swell);
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

  /** A trail of light along a dash. */
  streak(from: THREE.Vector3, to: THREE.Vector3, rgb: [number, number, number]): void {
    this.sparks.line(from, to, 70, rgb);
  }

  /** Rubble kicked up where something hits the ground. */
  rubble(at: THREE.Vector3, power: number): void {
    this.chips.burst(at, power, 0.45);
  }

  /** Keep every thrown piece of rubble out of her space. */
  keepClear(at: THREE.Vector3, r = 1.3): void {
    for (const d of [this.debris, this.shards, this.chips]) {
      d.clearAt.copy(at);
      d.clearR = r;
    }
    // the blast's rubble lands well away from her, leaving the ground she stands on (and her mark) clear
    this.debris.clearR = Math.max(r, 6);
    this.debris.clearH = 60;
  }

  /** Her speed made visible: violet light left hanging along the path she just moved. */
  trail(from: THREE.Vector3, to: THREE.Vector3): void {
    const d = from.distanceTo(to);
    if (d < 0.02) return;
    this.sparks.line(from, to, Math.min(60, Math.ceil(d * 30)), [1.8, 0.5, 4.2], 0.5);
  }

  /** The giant's slab breaking apart. */
  shatter(at: THREE.Vector3): void {
    this.shards.burst(at, 0.6, 0.6);
    this.sparks.burst(at, 160, 18, [4, 2.4, 0.8], [3, 0.4, 0.2], 0.5);
  }

  /** Everything off (the scene restarts). */
  reset(): void {
    for (const a of this.arcs) (a.life = 0), (a.mesh.visible = false);
    for (const w of this.waves) (w.life = 0), (w.mesh.visible = false);
    for (const r of this.rings) (r.life = 0), (r.mesh.visible = false);
    this.sparks.clear();
    this.debris.clear();
    this.shards.clear();
    this.chips.clear();
    this.levitate.reset();
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
    this.shards.update(dt);
    this.chips.update(dt);
    this.ripples.update(time);
    this.sigil.update(time);
    this.levitate.update(dt, time);
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

  /** Particles laid along a line, hanging in the air and fading: a dash's afterimage. */
  line(from: THREE.Vector3, to: THREE.Vector3, count: number, rgb: [number, number, number], life = 1): void {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const t = Math.random();
      this.pos.set([from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t + 0.3 + Math.random() * 1.4, from.z + (to.z - from.z) * t], i * 3);
      this.vel.set([(Math.random() - 0.5) * 0.8, Math.random() * 0.8, (Math.random() - 0.5) * 0.8], i * 3);
      this.col.set(rgb, i * 3);
      this.life[i] = this.max[i] = (0.3 + t * 0.5 + Math.random() * 0.2) * life;
      this.grav[i] = 0;
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
  private age = 0;
  /** a space nothing may enter (her, wherever she is) */
  readonly clearAt = new THREE.Vector3(1e6, 0, 0);
  clearR = 0;
  /** how high above her the space reaches (the blast's rubble is kept off her from any height) */
  clearH = 2.2;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  /** `ttl`: seconds before the pieces sink away (Infinity: they stay, like the blast's). */
  constructor(
    scene: THREE.Scene,
    n: number,
    color = 0x2a2228,
    emissive = 0x401006,
    private readonly ttl = Infinity,
  ) {
    this.mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color, emissive }), n);
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

  burst(at: THREE.Vector3, power = 1, size = 1): void {
    for (let i = 0; i < this.p.length; i++) {
      this.p[i].copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 4 * power, Math.random() * 2 * power, (Math.random() - 0.5) * 4 * power));
      const a = Math.random() * Math.PI * 2;
      const out = (8 + Math.random() * 26) * power;
      this.v[i].set(Math.cos(a) * out, (10 + Math.random() * 30) * power, Math.sin(a) * out);
      this.spin[i].set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      this.size[i] = (0.2 + Math.pow(Math.random(), 2) * 1.6) * size * Math.min(1, 0.4 + power);
    }
    this.age = 0;
    this.active = true;
    this.mesh.visible = true;
  }

  clear(): void {
    this.active = false;
    this.mesh.visible = false;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.age += dt;
    if (this.age > this.ttl + 1.2) return this.clear();
    // past its time, everything settles down into the ground
    const sink = this.age > this.ttl ? (this.age - this.ttl) / 1.2 : 0;
    for (let i = 0; i < this.p.length; i++) {
      const p = this.p[i];
      const v = this.v[i];
      v.y -= 26 * dt;
      p.addScaledVector(v, dt);
      // never through her: anything inside her space is pushed out to its edge
      const dx = p.x - this.clearAt.x;
      const dz = p.z - this.clearAt.z;
      const reach = this.clearR + this.size[i];
      const d2 = dx * dx + dz * dz;
      if (d2 < reach * reach && p.y < this.clearAt.y + this.clearH) {
        const d = Math.sqrt(d2) || 0.001;
        p.x = this.clearAt.x + (dx / d) * reach;
        p.z = this.clearAt.z + (dz / d) * reach;
        v.x = Math.abs(v.x) * Math.sign(dx || 1);
        v.z = Math.abs(v.z) * Math.sign(dz || 1);
      }
      const floor = this.size[i] * (0.5 - sink * 1.6);
      if (p.y < floor) {
        p.y = floor;
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

/** Particles rising around a figure: her violet aura, his red rage. */
export class Aura {
  private readonly u: {
    uClock: { value: number };
    uPx: { value: number };
    uAmt: { value: number };
    uFlare: { value: number };
    uRed: { value: number };
    uDensity: { value: number };
    uCenter: { value: THREE.Vector3 };
  };
  private readonly pts: THREE.Points;
  private readonly time: { value: number };
  private last = 0;
  private speed = 1;

  constructor(scene: THREE.Scene, n: number, time: { value: number }, px: { value: number }, rgb: [number, number, number], radius: number, height: number) {
    this.u = { uClock: { value: 0 }, uPx: px, uAmt: { value: 0 }, uFlare: { value: 0 }, uRed: { value: 0 }, uDensity: { value: 1 }, uCenter: { value: new THREE.Vector3() } };
    this.time = time;
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const mat = new THREE.ShaderMaterial({
      ...additive,
      uniforms: this.u,
      vertexShader: /* glsl */ `
        uniform float uClock, uPx, uAmt, uFlare, uRed, uDensity;
        uniform vec3 uCenter;
        attribute vec4 seed;
        varying vec3 vCol;
        varying float vA;
        void main() {
          float h = fract(seed.x + uClock * (0.45 + seed.y * 0.7));
          float ang = seed.z * 6.283 + uClock * (0.6 + seed.w);
          float rad = ${radius.toFixed(2)} * (0.45 + seed.w * 0.8) * (1.0 - h * 0.55) * (1.0 + uFlare * 0.8);
          vec3 p = uCenter + vec3(cos(ang) * rad, h * ${height.toFixed(2)} * (0.7 + uFlare * 0.6), sin(ang) * rad);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min((0.07 + seed.y * 0.07) * (0.55 + 0.45 * uDensity) * uPx / -mv.z, 26.0);
          // thinned out: only a share of the particles show
          vA = uAmt * sin(h * 3.1416) * step(fract(seed.w * 17.31 + seed.x * 3.7), uDensity);
          vCol = mix(vec3(${rgb.map((c) => c.toFixed(2)).join(', ')}), vec3(2.8, 0.12, 0.25), step(1.0 - uRed, fract(seed.z * 7.13))) * (0.6 + seed.y * 0.8);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: DOT_FRAG,
    });
    this.pts = new THREE.Points(g, mat);
    this.pts.frustumCulled = false;
    this.pts.visible = false;
    scene.add(this.pts);
  }

  /**
   * `red`: the share of particles burning red instead of the aura's own colour (0..1); `density`: the share of
   * particles shown (0..1); `speed`: how fast they rise (1 normal).
   */
  set(amt: number, center: THREE.Vector3, flare = 0, red = 0, density = 1, speed = 1): void {
    this.u.uAmt.value = amt;
    this.u.uFlare.value = flare;
    this.u.uRed.value = red;
    this.u.uDensity.value = density;
    this.speed = speed * (1 + flare);
    // its own clock, so a change of speed eases instead of jumping every particle
    const dt = Math.min(0.1, Math.max(0, this.time.value - this.last));
    this.last = this.time.value;
    this.u.uClock.value += dt * this.speed;
    this.u.uCenter.value.copy(center);
    this.pts.visible = amt > 0.01;
  }
}

/** Rubble lifting off the ground around her while she charges, and falling when the blast lets it go. */
export class Levitate {
  private readonly mesh: THREE.InstancedMesh;
  private readonly rocks: { a: number; d: number; h: number; size: number; phase: number; spin: THREE.Vector3; y: number }[] = [];
  private lift = 0;
  private pull = 0;
  private dropT = -1;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly center = KNIGHT_HOME.clone();

  constructor(scene: THREE.Scene, n: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x4a4050, emissive: 0x12041e }), n);
    for (let i = 0; i < n; i++) {
      this.rocks.push({
        a: Math.random() * Math.PI * 2,
        d: 7.5 + Math.random() * 8,
        h: 1.5 + Math.random() * 7.5,
        size: 0.15 + Math.pow(Math.random(), 2) * 0.6,
        phase: Math.random() * 6.28,
        spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
        y: 0,
      });
    }
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** `lift` 0..1 how far they have risen; `pull` 0..1 how far drawn in towards her. */
  set(lift: number, pull: number): void {
    this.lift = lift;
    this.pull = pull;
  }

  drop(): void {
    if (this.dropT < 0) this.dropT = 0;
  }

  reset(): void {
    this.dropT = -1;
    this.lift = 0;
    this.mesh.visible = false;
  }

  update(dt: number, time: number): void {
    const on = this.lift > 0.001 || this.dropT >= 0;
    this.mesh.visible = on;
    if (!on) return;
    if (this.dropT >= 0) this.dropT += dt;
    const ease = this.lift * this.lift * (3 - 2 * this.lift);
    this.rocks.forEach((r, i) => {
      const a = r.a + time * 0.12 * this.lift;
      const d = r.d * (1 - this.pull * 0.15);
      const ground = r.size * 0.5;
      if (this.dropT < 0) r.y = ground + (r.h - ground) * ease + Math.sin(time * 1.3 + r.phase) * 0.25 * ease;
      else r.y = Math.max(ground, r.y - 22 * this.dropT * dt);
      this.v.set(this.center.x + Math.cos(a) * d, r.y, this.center.z + Math.sin(a) * d);
      this.q.setFromEuler(this.e.set(r.spin.x * time * ease, r.spin.y * time * ease, r.spin.z * time * ease));
      this.mesh.setMatrixAt(i, this.m.compose(this.v, this.q, this.s.setScalar(r.size)));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Her aura on the ground: faint violet rings that keep spreading out from her feet. */
export class Ripples {
  private readonly rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private amt = 0;
  private speed = 1;
  private phase = 0;
  private red = 0;
  private last = 0;
  private readonly center = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.RingGeometry(0.94, 1, 72);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.9, 0.3, 2.4),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, mat });
    }
  }

  /** `amt` 0..1 how strong; `speed` how fast they spread (the charge quickens them). */
  /** `red` 0..1: how far the rings turn red (every other ring at half, all of them at full). */
  set(amt: number, center: THREE.Vector3, speed = 1, red = 0): void {
    this.amt = amt;
    this.speed = speed;
    this.red = red;
    this.center.copy(center);
  }

  update(time: number): void {
    const dt = Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    this.phase += dt * 0.32 * this.speed;
    this.rings.forEach(({ mesh, mat }, i) => {
      const k = (this.phase + i / this.rings.length) % 1;
      mesh.visible = this.amt > 0.01;
      mesh.position.set(this.center.x, 0.06, this.center.z);
      mesh.scale.setScalar(0.6 + k * 7.5);
      // faint: in as it leaves her feet, gone by the time it is wide
      mat.opacity = this.amt * 0.35 * Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k) * (1 - k);
      const r = Math.min(1, this.red * (i % 2 ? 2 : 1));
      mat.color.setRGB(0.9 + r * 2.3, 0.3 - r * 0.15, 2.4 - r * 2.1);
    });
  }
}

/** The mark she leaves where she stood: jagged veins of red and violet light crept out through the stone. */
export class Sigil {
  private readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private amt = 0;
  private red = 0;

  constructor(scene: THREE.Scene) {
    const r = rng(77);
    const tex = canvasTex(1024, 1024, (g) => {
      g.translate(512, 512);
      g.strokeStyle = '#fff';
      g.shadowColor = '#fff';
      g.shadowBlur = 9;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // a wandering, forking vein: never straight, never round
      const vein = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
        const steps = 5 + ((r() * 7) | 0);
        g.lineWidth = w;
        g.globalAlpha = 0.45 + r() * 0.55;
        g.beginPath();
        g.moveTo(x, y);
        const forks: [number, number, number][] = [];
        for (let i = 0; i < steps; i++) {
          a += (r() - 0.5) * 1.1;
          x += (Math.cos(a) * len) / steps;
          y += (Math.sin(a) * len) / steps;
          g.lineTo(x, y);
          if (depth < 2 && r() < 0.28) forks.push([x, y, a + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.9)]);
        }
        g.stroke();
        for (const [fx, fy, fa] of forks) vein(fx, fy, fa, len * (0.35 + r() * 0.3), w * 0.6, depth + 1);
      };
      const n = 9 + ((r() * 5) | 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.9;
        const start = 30 + r() * 60;
        vein(Math.cos(a) * start, Math.sin(a) * start, a, 160 + r() * 300, 3 + r() * 4, 0);
      }
      // a few broken, uneven scraps of light near her feet
      g.globalAlpha = 0.35;
      for (let i = 0; i < 6; i++) {
        const a0 = r() * Math.PI * 2;
        g.lineWidth = 2 + r() * 2;
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = a0 + k * (0.12 + r() * 0.08);
          const rad = 70 + r() * 50;
          if (k === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
          else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    });
    this.mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(1.2, 0.3, 2.6),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.rotation.z = 0.7;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  set(amt: number, at: THREE.Vector3, red: number): void {
    this.amt = amt;
    this.red = red;
    this.mesh.position.set(at.x, 0.07, at.z);
  }

  update(time: number): void {
    this.mesh.visible = this.amt > 0.01;
    if (!this.mesh.visible) return;
    // a slow, uneven flicker, drifting between violet and red
    const pulse = 0.7 + 0.18 * Math.sin(time * 1.3) + 0.12 * Math.sin(time * 3.7 + 1);
    const swing = this.red * (0.5 + 0.5 * Math.sin(time * 0.6));
    this.mat.opacity = this.amt * pulse * 0.5;
    this.mat.color.setRGB(1.2 + swing * 2.0, 0.3 - swing * 0.15, 2.6 - swing * 2.3);
  }
}
