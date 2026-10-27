/**
 * The effects of SLIME HOLLOW. As in Excalibur, anime effects are shapes rather than simulations: animated shaders on
 * simple meshes and small pooled systems. Glowing colours go above 1.0 so the bloom picks them up and nothing else.
 *
 * - the Hollow Slime: a living black ooze with a cyan sheen. It drips from his hands, pools at his feet, climbs him,
 *   becomes his cloak and its tendrils, and at the end slides off him and dies in the mud
 * - shadow spikes bursting out of the ground in rings and lines
 * - the crystal-flame wall: cyan shards and cold fire, rising behind him
 * - crimson-gold lightning (Raigen), the jade healing light (Oriha), ash and embers, ground waves, sparks
 */
import * as THREE from 'three';
import { Aura, Sparks } from '../freeroam/fx';
import { rng } from '../freeroam/world';

const NOISE = /* glsl */ `
  float hash1(float n) { return fract(sin(n) * 43758.5453); }
  float noise3(vec3 x) {
    vec3 p = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 57.0 + 113.0 * p.z;
    return mix(mix(mix(hash1(n), hash1(n + 1.0), f.x), mix(hash1(n + 57.0), hash1(n + 58.0), f.x), f.y),
               mix(mix(hash1(n + 113.0), hash1(n + 114.0), f.x), mix(hash1(n + 170.0), hash1(n + 171.0), f.x), f.y), f.z);
  }
`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;
export const CYAN: [number, number, number] = [0.6, 2.6, 3.6];
export const CRIMSON: [number, number, number] = [3.6, 0.5, 0.35];
export const GOLD: [number, number, number] = [3.6, 2.4, 0.7];
export const JADE: [number, number, number] = [0.6, 3.0, 1.6];

/** The ooze's look: glossy black, a cold cyan sheen at the edges, its surface always moving. */
function oozeMaterial(time: { value: number }, wobble: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uGlow: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vV;
      varying float vR;
      ${NOISE}
      void main() {
        vec3 p = position;
        #ifdef USE_INSTANCING
          vec4 wp0 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
          vec4 wp0 = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        float n = noise3(p * 3.0 + wp0.xyz * 0.7 + vec3(0.0, uTime * 1.6, uTime * 0.7));
        p += normal * (n - 0.5) * ${wobble.toFixed(3)};
        #ifdef USE_INSTANCING
          vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #else
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vN = normalize(normalMatrix * normal);
        #endif
        vec4 mv = viewMatrix * wp;
        vV = normalize(-mv.xyz);
        vR = n;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      varying vec3 vN;
      varying vec3 vV;
      varying float vR;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), vV)), 3.4);
        vec3 c = vec3(0.004, 0.006, 0.012);
        c += vec3(0.1, 0.62, 0.95) * f * uGlow * (0.6 + vR * 0.8);
        // a wet highlight
        float spec = pow(max(dot(normalize(vN), normalize(vec3(0.3, 0.8, 0.5))), 0.0), 24.0);
        c += vec3(0.5, 0.7, 0.9) * spec * 0.35;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export class Fx {
  readonly time = { value: 0 };
  readonly px = { value: 500 };
  readonly sparks: Sparks;
  readonly kaelAura: Aura;
  readonly heal: Aura;
  readonly raigenAura: Aura;

  // ---- the Hollow Slime ----
  private readonly blobs: THREE.InstancedMesh;
  private readonly blobState: { a: number; h: number; r: number; s: number; ph: number; y: number }[] = [];
  private readonly tendrils: THREE.InstancedMesh;
  private readonly pool: THREE.Mesh;
  private readonly poolU = { uTime: this.time, uAmt: { value: 0 }, uGlow: { value: 1 } };

  // ---- spikes ----
  private readonly spikes: THREE.InstancedMesh;
  private spikeList: Spike[] = [];

  // ---- the crystal-flame wall ----
  private readonly crystals: THREE.InstancedMesh;
  private readonly crystalList: { x: number; z: number; h: number; r: number; tilt: number; delay: number }[] = [];
  private readonly crystalU = { uTime: this.time, uAmt: { value: 0 } };
  private readonly wallAt = new THREE.Vector3();

  // ---- lightning ----
  private readonly bolts: THREE.LineSegments;
  private readonly boltMat: THREE.LineBasicMaterial;
  private readonly boltPos: Float32Array;
  private boltTimer = 0;

  // ---- ash and embers ----
  private readonly ashU = { uTime: this.time, uPx: this.px, uFall: { value: 1 }, uEmber: { value: 1 } };

  // ---- ground waves ----
  private readonly waves: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; size: number }[] = [];

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly low: boolean,
  ) {
    const r = rng(77);
    this.sparks = new Sparks(scene, low ? 900 : 1600, this.px);
    this.kaelAura = new Aura(scene, low ? 110 : 170, this.time, this.px, [0.25, 1.1, 1.5], 0.9, 2.6);
    this.heal = new Aura(scene, 60, this.time, this.px, [0.3, 1.5, 0.8], 0.55, 1.2);
    this.raigenAura = new Aura(scene, 80, this.time, this.px, [1.6, 0.25, 0.2], 0.7, 2.2);

    // the slime: blobs that crawl over him, and the tendrils of his cloak
    const blobN = 22;
    this.blobs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), oozeMaterial(this.time, 0.45), blobN);
    this.blobs.frustumCulled = false;
    for (let i = 0; i < blobN; i++) this.blobState.push({ a: r() * Math.PI * 2, h: i / blobN, r: 0.15 + r() * 0.08, s: 0.045 + r() * 0.05, ph: r() * 6, y: 0 });
    scene.add(this.blobs);
    const tg = new THREE.ConeGeometry(0.16, 1, 7, 6);
    tg.translate(0, 0.5, 0);
    this.tendrils = new THREE.InstancedMesh(tg, oozeMaterial(this.time, 0.25), 10);
    this.tendrils.frustumCulled = false;
    scene.add(this.tendrils);

    // the pool at his feet: black, its edge crawling, cracked with cyan
    this.pool = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        uniforms: this.poolU,
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uAmt, uGlow;
          varying vec2 vUv;
          ${NOISE}
          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float d = length(p);
            float a = atan(p.y, p.x);
            float edge = 0.78 + 0.18 * noise3(vec3(cos(a) * 2.5, sin(a) * 2.5, uTime * 0.6));
            float body = smoothstep(edge, edge - 0.06, d);
            float n = noise3(vec3(p * 7.0, uTime * 0.4));
            float vein = smoothstep(0.03, 0.0, abs(n - 0.5)) * body * smoothstep(0.1, 0.6, d);
            vec3 c = vec3(0.005, 0.008, 0.014) + vec3(0.3, 1.9, 2.7) * (vein * 0.9 + smoothstep(edge - 0.12, edge - 0.02, d) * body * 0.5) * uGlow;
            gl_FragColor = vec4(c, body * uAmt * 0.96);
          }`,
      }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.visible = false;
    scene.add(this.pool);

    // spikes: black with a cyan edge burning up their length
    const sg = new THREE.ConeGeometry(0.32, 1, 5, 4);
    sg.translate(0, 0.5, 0);
    this.spikes = new THREE.InstancedMesh(sg, oozeMaterial(this.time, 0.12), low ? 220 : 340);
    this.spikes.frustumCulled = false;
    this.spikes.count = 0;
    scene.add(this.spikes);

    // the crystal-flame wall: tall hexagonal shards, glowing from within, cold fire running up them
    const cg = new THREE.CylinderGeometry(0.0, 1, 1, 6, 3);
    cg.translate(0, 0.5, 0);
    for (let i = 0; i < (low ? 46 : 70); i++) {
      const a = (i / (low ? 46 : 70)) * Math.PI * 1.25 - Math.PI * 0.625 + (r() - 0.5) * 0.08;
      const d = 6 + r() * 4.5;
      this.crystalList.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, h: 2.5 + Math.pow(r(), 0.6) * 7.5 * (1 - Math.abs(a) * 0.35), r: 0.35 + r() * 0.6, tilt: (r() - 0.5) * 0.5, delay: Math.abs(a) * 0.35 + r() * 0.3 });
    }
    this.crystals = new THREE.InstancedMesh(
      cg,
      new THREE.ShaderMaterial({
        ...additive,
        side: THREE.DoubleSide,
        uniforms: this.crystalU,
        vertexShader: /* glsl */ `
          varying vec3 vP;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vP = position;
            vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
            vec4 mv = viewMatrix * wp;
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uAmt;
          varying vec3 vP;
          varying vec3 vN;
          varying vec3 vV;
          ${NOISE}
          void main() {
            float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
            float fire = noise3(vec3(vP.x * 4.0, vP.y * 3.0 - uTime * 2.6, vP.z * 4.0));
            float streak = smoothstep(0.55, 0.85, fire);
            vec3 c = vec3(0.03, 0.2, 0.32) * (0.2 + f * 1.2) + vec3(0.25, 0.95, 1.25) * streak * (1.0 - vP.y * 0.6);
            gl_FragColor = vec4(c * uAmt * 0.65, (0.2 + f * 0.4 + streak * 0.35) * uAmt);
          }`,
      }),
      this.crystalList.length,
    );
    this.crystals.frustumCulled = false;
    this.crystals.visible = false;
    scene.add(this.crystals);

    // lightning: a pool of jagged segments, regenerated many times a second
    this.boltPos = new Float32Array(3 * 2 * 160);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.boltPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.boltMat = new THREE.LineBasicMaterial({ color: new THREE.Color(...CRIMSON), ...additive });
    this.bolts = new THREE.LineSegments(bg, this.boltMat);
    this.bolts.frustumCulled = false;
    this.bolts.visible = false;
    scene.add(this.bolts);

    // ash drifting down over the whole field, embers lifting off the village
    {
      const n = low ? 900 : 1800;
      const pos = new Float32Array(n * 3);
      const seed = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (r() - 0.5) * 120;
        pos[i * 3 + 2] = (r() - 0.5) * 120;
        seed.set([r(), r(), r(), r()], i * 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
      const pts = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: this.ashU,
          vertexShader: /* glsl */ `
            uniform float uTime, uPx, uFall, uEmber;
            attribute vec4 seed;
            varying vec3 vCol;
            varying float vA;
            varying float vHot;
            void main() {
              // a share are embers rising (hot), the rest ash falling
              float hot = step(0.82, seed.w);
              float span = 26.0;
              float y = hot > 0.5 ? mod(seed.x * span + uTime * (0.8 + seed.y), span) : span - mod(seed.x * span + uTime * (0.35 + seed.y * 0.4) * uFall, span);
              vec3 p = vec3(position.x + sin(uTime * 0.4 + seed.z * 9.0) * 1.6, y, position.z + cos(uTime * 0.3 + seed.y * 7.0) * 1.6);
              if (hot > 0.5) p.z = mod(p.z, 40.0) + 4.0;
              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              gl_PointSize = min((hot > 0.5 ? 0.09 : 0.06 + seed.y * 0.05) * uPx / -mv.z, 14.0);
              vHot = hot;
              vA = (hot > 0.5 ? uEmber * (1.0 - y / span) : 0.55) * smoothstep(0.0, 2.0, y);
              vCol = hot > 0.5 ? vec3(3.0, 1.1, 0.3) : vec3(0.42, 0.4, 0.42);
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: /* glsl */ `
            varying vec3 vCol;
            varying float vA;
            varying float vHot;
            void main() {
              float d = length(gl_PointCoord - 0.5);
              float a = smoothstep(0.5, 0.15, d) * vA;
              if (a < 0.01) discard;
              gl_FragColor = vec4(vCol, a);
            }`,
        }),
      );
      pts.frustumCulled = false;
      scene.add(pts);
    }

    // ground waves
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.waves.push({ mesh, mat, life: 0, max: 1, size: 1 });
    }
  }

  // ------------------------------------------------------------------------------------------------------------------

  /**
   * The Hollow Slime on him. `amt`: 0 none, 0.2 dripping from his hands, 0.6 climbing him, 1 his whole cloak;
   * `spread`: the pool's reach (metres); `shed`: 0..1, sliding off him into the mud; `feet`, `hand`: where he is (he
   * may be in the air); `groundY`: the ground under him. `glow`: the cyan in it (the drained grade keeps cyan alive).
   */
  setSlime(amt: number, spread: number, shed: number, feet: THREE.Vector3, groundY: number, hand: THREE.Vector3, glow: number): void {
    const t = this.time.value;
    const live = amt > 0.01 || shed < 1;
    this.blobs.visible = this.tendrils.visible = amt > 0.01;
    (this.blobs.material as THREE.ShaderMaterial).uniforms.uGlow.value = glow;
    (this.tendrils.material as THREE.ShaderMaterial).uniforms.uGlow.value = glow;
    this.poolU.uGlow.value = glow;
    const ground = feet.y;
    this.blobState.forEach((b, i) => {
      // each blob's place: its share of the climb up his body (hands first, then from the feet up)
      const handBlob = i < 5;
      const climb = THREE.MathUtils.clamp((amt - b.h * 0.7) / 0.3, 0, 1);
      const a = b.a + t * (0.4 + (i % 3) * 0.2);
      let x: number;
      let y: number;
      let z: number;
      if (handBlob) {
        // dripping off his hand: a bead that slides down and falls, again and again
        const fall = (t * 0.7 + b.ph) % 1;
        x = hand.x + Math.cos(a) * 0.04;
        z = hand.z + Math.sin(a) * 0.04;
        y = THREE.MathUtils.lerp(hand.y, groundY, fall * fall);
      } else {
        const h = b.h * 1.75 * climb;
        const rad = b.r * (1 - h * 0.25) + 0.05;
        x = feet.x + Math.cos(a) * rad;
        z = feet.z + Math.sin(a) * rad;
        y = ground + h;
      }
      // shedding: everything slides down into the pool
      y = THREE.MathUtils.lerp(y, groundY - 0.05, shed);
      const size = (handBlob ? b.s * 0.6 * Math.min(1, amt * 5) : b.s * climb * (0.7 + amt * 0.6)) * (1 - shed * 0.85) * (0.85 + 0.15 * Math.sin(t * 3 + b.ph));
      this.blobs.setMatrixAt(i, this.m.compose(this.v.set(x, y, z), this.q.identity(), this.s.set(size, size * 1.2, size)));
    });
    this.blobs.instanceMatrix.needsUpdate = true;
    // the cloak's tendrils: hanging from his waist and streaming, ragged, when the Hollow has him whole
    const cloak = THREE.MathUtils.clamp((amt - 0.7) / 0.3, 0, 1) * (1 - shed);
    const air = Math.min(1, Math.max(0, ground - groundY));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.sin(t * 0.5 + i) * 0.3;
      const len = (0.9 + (i % 3) * 0.35 + air * 0.9) * cloak * (0.85 + 0.15 * Math.sin(t * 2.2 + i * 1.7));
      const rad = 0.16 + (i % 2) * 0.06;
      // pointing down and a little out, swaying (and blown back more in the air)
      this.e.set(Math.PI + Math.sin(t * 1.3 + i) * 0.18 - Math.sin(a) * (0.25 + air * 0.15), 0, Math.cos(t * 1.1 + i * 2) * 0.18 + Math.cos(a) * (0.25 + air * 0.15));
      this.tendrils.setMatrixAt(i, this.m.compose(this.v.set(feet.x + Math.cos(a) * rad, ground + 1.15, feet.z + Math.sin(a) * rad), this.q.setFromEuler(this.e), this.s.set(0.7 + cloak * 0.3, Math.max(0.001, len), 0.7 + cloak * 0.3)));
    }
    this.tendrils.instanceMatrix.needsUpdate = true;
    // the pool
    this.pool.visible = live && spread > 0.05;
    this.pool.position.set(feet.x, groundY + 0.03, feet.z);
    this.pool.scale.setScalar(Math.max(0.05, spread));
    this.poolU.uAmt.value = Math.min(1, spread * 2) * (1 - Math.max(0, shed - 0.6) / 0.4);
  }

  /** The spikes the Hollow throws up, all at once: the director lays them out in time and space. */
  setSpikes(list: Spike[]): void {
    this.spikeList = list;
  }

  /** Every spike at time `t`: bursting out, holding, then crumbling back down. */
  private placeSpikes(t: number): void {
    let n = 0;
    const max = this.spikes.instanceMatrix.count;
    for (const sp of this.spikeList) {
      const age = t - sp.t;
      if (age < 0 || age > sp.life) continue;
      if (n >= max) break;
      const up = 1 - Math.pow(1 - Math.min(1, age / 0.11), 3);
      const down = age > sp.life - 0.9 ? (age - (sp.life - 0.9)) / 0.9 : 0;
      const h = sp.h * up * (1 - down * down);
      if (h < 0.02) continue;
      this.e.set(sp.tiltX, sp.yaw, sp.tiltZ);
      this.spikes.setMatrixAt(n++, this.m.compose(this.v.set(sp.x, sp.y - down * 0.3, sp.z), this.q.setFromEuler(this.e), this.s.set(sp.w, h, sp.w)));
    }
    this.spikes.count = n;
    this.spikes.instanceMatrix.needsUpdate = true;
  }

  /** The wall of crystal and cold fire round `at`, curving behind him on the village's side (+z). `amt` 0..1. */
  setWall(amt: number, at: THREE.Vector3): void {
    this.wallAt.copy(at);
    this.crystals.visible = amt > 0.01;
    this.crystalU.uAmt.value = Math.min(1, amt * 1.4);
    if (!this.crystals.visible) return;
    this.crystalList.forEach((c, i) => {
      const k = THREE.MathUtils.clamp((amt - c.delay * 0.4) / 0.6, 0, 1);
      const g = 1 - Math.pow(1 - k, 3);
      this.e.set(c.tilt, i, -c.tilt * 0.6);
      this.crystals.setMatrixAt(i, this.m.compose(this.v.set(at.x + c.x, 0, at.z + c.z), this.q.setFromEuler(this.e), this.s.set(c.r * (0.4 + g * 0.6), Math.max(0.001, c.h * g), c.r * (0.4 + g * 0.6))));
    });
    this.crystals.instanceMatrix.needsUpdate = true;
  }

  /** The wall breaks: a storm of cyan shards. */
  shatterWall(): void {
    for (let i = 0; i < this.crystalList.length; i += 3) {
      const c = this.crystalList[i];
      this.sparks.burst(this.v.set(this.wallAt.x + c.x, c.h * 0.5, this.wallAt.z + c.z), 18, 9, CYAN, [2.6, 3.2, 3.6], 0.5);
    }
  }

  /**
   * Lightning between pairs of points (each pair one bolt, jagged and re-drawn many times a second), at `amt`, in a
   * colour from crimson (0) to gold (1).
   */
  setBolts(pairs: [THREE.Vector3, THREE.Vector3][], amt: number, gold: number, dt: number): void {
    this.bolts.visible = amt > 0.01 && pairs.length > 0;
    if (!this.bolts.visible) return;
    this.boltMat.color.setRGB(...CRIMSON).lerp(new THREE.Color(...GOLD), gold).multiplyScalar(0.6 + amt * 0.8);
    this.boltTimer -= dt;
    if (this.boltTimer > 0) return;
    this.boltTimer = 0.045;
    const P = this.boltPos;
    let o = 0;
    const segs = Math.floor(P.length / 6 / pairs.length);
    for (const [a, b] of pairs) {
      let px = a.x;
      let py = a.y;
      let pz = a.z;
      const len = a.distanceTo(b);
      for (let s = 1; s <= segs; s++) {
        const k = s / segs;
        const j = s === segs ? 0 : len * 0.09;
        const nx = a.x + (b.x - a.x) * k + (Math.random() - 0.5) * j;
        const ny = a.y + (b.y - a.y) * k + (Math.random() - 0.5) * j;
        const nz = a.z + (b.z - a.z) * k + (Math.random() - 0.5) * j;
        P.set([px, py, pz, nx, ny, nz], o);
        o += 6;
        px = nx;
        py = ny;
        pz = nz;
      }
    }
    P.fill(0, o);
    (this.bolts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  wave(at: THREE.Vector3, size: number, life: number, rgb: [number, number, number]): void {
    const w = this.waves.find((x) => x.life <= 0) ?? this.waves[0];
    w.life = w.max = life;
    w.size = size;
    w.mesh.position.copy(at);
    w.mesh.visible = true;
    w.mat.color.setRGB(...rgb);
  }

  /** Ash falling (1 normal, 0 hanging still); embers rising off the village (0..1). */
  setAir(fall: number, embers: number): void {
    this.ashU.uFall.value = fall;
    this.ashU.uEmber.value = embers;
  }

  reset(): void {
    this.sparks.clear();
    for (const w of this.waves) (w.life = 0), (w.mesh.visible = false);
  }

  update(dt: number, time: number, sceneT: number): void {
    this.time.value = time;
    this.placeSpikes(sceneT);
    for (const w of this.waves) {
      if (w.life <= 0) continue;
      w.life -= dt;
      const k = 1 - w.life / w.max;
      w.mesh.scale.setScalar(0.5 + Math.pow(k, 0.5) * w.size);
      w.mat.opacity = (1 - k) * (1 - k);
      if (w.life <= 0) w.mesh.visible = false;
    }
    this.sparks.update(dt);
    void this.low;
  }
}

/** One spike of the Hollow: when it bursts out, where, how tall and wide, its lean, and how long it stands. */
export interface Spike {
  t: number;
  x: number;
  y: number;
  z: number;
  h: number;
  w: number;
  tiltX: number;
  tiltZ: number;
  yaw: number;
  life: number;
}
