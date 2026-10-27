/**
 * What the blast leaves behind: a smoking crater with a molten floor, scorch marks thrown out across the courtyard,
 * the pillars knocked flat away from it, charred stone and trees, fires burning and smoke climbing. Everything is a
 * function of the scene clock, so it holds still when the scene is held at its end and resets when it loops.
 */
import * as THREE from 'three';
import { canvasTex, GIANT_STAND, KNIGHT_HOME, rng, type World } from './world';

/** The moment of the blast (scene seconds). */
export const BLAST_AT = 64;

const seg = (t: number, a: number, b: number): number => Math.min(1, Math.max(0, (t - a) / (b - a)));

const DOT = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vCol, a);
  }`;

export class Ruin {
  private readonly crater: THREE.Mesh;
  private readonly craterU = { uTime: { value: 0 }, uHeat: { value: 0 }, uAmt: { value: 0 } };
  private readonly scorch: THREE.MeshBasicMaterial;
  private readonly rim: THREE.InstancedMesh;
  private readonly fireU: { uTime: { value: number }; uPx: { value: number }; uAmt: { value: number } };
  private readonly smokeU: { uTime: { value: number }; uPx: { value: number }; uAmt: { value: number }; uHeat: { value: number } };
  private readonly fire: THREE.Points;
  private readonly smoke: THREE.Points;
  private readonly stoneBase = new THREE.Color();
  private readonly treeBase = new THREE.Color();
  private readonly pillarRest: { x: number; z: number; h: number; dir: THREE.Vector3; start: number; snap: number }[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private applied = -1;

  constructor(
    scene: THREE.Scene,
    private readonly world: World,
    time: { value: number },
    px: { value: number },
    low: boolean,
  ) {
    const r = rng(4242);
    this.stoneBase.copy(world.stoneMat.color);
    this.treeBase.copy(world.treeMat.color);

    // the crater: scorched glass in the middle, molten cracks that cool slowly
    this.craterU.uTime = time;
    this.crater = new THREE.Mesh(
      new THREE.CircleGeometry(17, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        uniforms: this.craterU,
        vertexShader: `varying vec2 vP; void main() { vP = position.xy / 17.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uHeat, uAmt;
          varying vec2 vP;
          float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
          void main() {
            float r = length(vP);
            float ang = atan(vP.y, vP.x);
            vec3 col = mix(vec3(0.015, 0.01, 0.012), vec3(0.07, 0.045, 0.04), smoothstep(0.25, 1.0, r));
            float veins = step(0.8, n2(vec2(ang * 6.0, r * 12.0))) + step(0.86, n2(vec2(ang * 13.0 + 4.0, r * 22.0)));
            float core = 1.0 - smoothstep(0.0, 0.45, r);
            float pulse = 0.8 + 0.2 * sin(uTime * 2.5 + r * 9.0);
            col += vec3(3.2, 0.75, 0.12) * (core * 0.7 + veins * (1.0 - r) * 0.9) * uHeat * pulse;
            gl_FragColor = vec4(col, uAmt * smoothstep(1.0, 0.82, r));
          }`,
      }),
    );
    this.crater.rotation.x = -Math.PI / 2;
    // a pool of molten rock at the bottom of the crater
    this.crater.position.set(GIANT_STAND.x, -6.85, GIANT_STAND.z);
    this.crater.scale.setScalar(0.22);
    this.crater.visible = false;
    scene.add(this.crater);

    // scorch: black streaks thrown out from the blast
    const scorchTex = canvasTex(1024, 1024, (g) => {
      g.translate(512, 512);
      const core = g.createRadialGradient(0, 0, 0, 0, 0, 420);
      core.addColorStop(0, 'rgba(0,0,0,0.75)');
      core.addColorStop(0.35, 'rgba(0,0,0,0.4)');
      core.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = core;
      g.fillRect(-512, -512, 1024, 1024);
      g.lineCap = 'round';
      for (let i = 0; i < 260; i++) {
        const a = r() * Math.PI * 2;
        const from = 60 + r() * 80;
        const len = 120 + Math.pow(r(), 0.6) * 380;
        g.strokeStyle = `rgba(0,0,0,${0.25 + r() * 0.5})`;
        g.lineWidth = 2 + r() * 14;
        g.beginPath();
        g.moveTo(Math.cos(a) * from, Math.sin(a) * from);
        g.lineTo(Math.cos(a) * (from + len), Math.sin(a) * (from + len));
        g.stroke();
      }
    });
    this.scorch = new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, color: 0xffffff });
    // the decal is the floor's own shape around the blast, hole and all, so it never lids the crater
    const S = 60;
    const cx = GIANT_STAND.x;
    const cz = -GIANT_STAND.z;
    const scorchShape = new THREE.Shape([new THREE.Vector2(cx - S, cz - S), new THREE.Vector2(cx + S, cz - S), new THREE.Vector2(cx + S, cz + S), new THREE.Vector2(cx - S, cz + S)]);
    scorchShape.holes.push(world.ground.holePath());
    const scorchGeo = new THREE.ShapeGeometry(scorchShape);
    const uv = scorchGeo.attributes.uv as THREE.BufferAttribute;
    const sp = scorchGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (sp.getX(i) - (cx - S)) / (2 * S), (sp.getY(i) - (cz - S)) / (2 * S));
    scorchGeo.rotateX(-Math.PI / 2);
    const scorch = new THREE.Mesh(scorchGeo, this.scorch);
    scorch.position.y = 0.025;
    scene.add(scorch);

    // the crater's lip: boulders heaved up around it
    const rimN = low ? 26 : 44;
    this.rim = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), world.stoneMat, rimN);
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    for (let i = 0; i < rimN; i++) {
      const a = (i / rimN) * Math.PI * 2 + r() * 0.2;
      const d = 17.5 + r() * 5;
      const size = 0.5 + Math.pow(r(), 1.5) * 1.8;
      v.set(GIANT_STAND.x + Math.cos(a) * d, size * 0.35, GIANT_STAND.z + Math.sin(a) * d);
      this.rim.setMatrixAt(i, this.m.compose(v, this.q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3)), s.set(size * 1.3, size * 0.8, size)));
    }
    this.rim.visible = false;
    scene.add(this.rim);

    // fires: flickering columns of flame particles at spots around the courtyard
    const spots: THREE.Vector3[] = [];
    while (spots.length < (low ? 16 : 30)) {
      const a = r() * Math.PI * 2;
      const d = 6 + Math.pow(r(), 0.8) * (spots.length < 20 ? 34 : 55);
      const p = new THREE.Vector3(GIANT_STAND.x + Math.cos(a) * d, 0, GIANT_STAND.z + Math.sin(a) * d);
      if (p.distanceTo(KNIGHT_HOME) < 5) continue;
      spots.push(p);
    }
    const per = low ? 18 : 30;
    {
      const n = spots.length * per;
      const base = new Float32Array(n * 3);
      const seed = new Float32Array(n * 4);
      spots.forEach((p, k) => {
        const scale = 0.6 + r() * 1.4;
        for (let j = 0; j < per; j++) {
          base.set([p.x, scale, p.z], (k * per + j) * 3);
          seed.set([r(), r(), r(), r()], (k * per + j) * 4);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(base, 3));
      g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
      this.fireU = { uTime: time, uPx: px, uAmt: { value: 0 } };
      this.fire = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: this.fireU,
          vertexShader: /* glsl */ `
            uniform float uTime, uPx, uAmt;
            attribute vec4 seed;
            varying vec3 vCol;
            varying float vA;
            void main() {
              float scale = position.y;
              float h = fract(seed.x + uTime * (0.9 + seed.y * 0.9));
              float sway = sin(uTime * 3.0 + seed.z * 20.0) * 0.25;
              vec3 p = vec3(position.x, 0.0, position.z)
                + vec3(cos(seed.z * 6.283) * 0.5 * (1.0 - h) + sway * h, h * (1.0 + seed.w * 1.6) * scale, sin(seed.z * 6.283) * 0.5 * (1.0 - h));
              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              gl_PointSize = min((0.35 + seed.w * 0.3) * scale * (1.0 - h * 0.6) * uPx / -mv.z, 120.0);
              vA = uAmt * smoothstep(0.0, 0.12, h) * (1.0 - h);
              vCol = mix(vec3(3.2, 2.0, 0.5), vec3(2.0, 0.25, 0.04), h);
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: DOT,
        }),
      );
      this.fire.frustumCulled = false;
      this.fire.visible = false;
      scene.add(this.fire);
    }

    // smoke: slow dark columns from the crater and the biggest fires
    {
      const columns = [GIANT_STAND.clone(), GIANT_STAND.clone().add(new THREE.Vector3(5, 0, 3)), GIANT_STAND.clone().add(new THREE.Vector3(-6, 0, -2)), ...spots.slice(0, 4)];
      const per2 = low ? 30 : 60;
      const n = columns.length * per2;
      const base = new Float32Array(n * 3);
      const seed = new Float32Array(n * 4);
      columns.forEach((p, k) => {
        for (let j = 0; j < per2; j++) {
          base.set([p.x, k < 3 ? 1.6 : 0.8, p.z], (k * per2 + j) * 3);
          seed.set([r(), r(), r(), r()], (k * per2 + j) * 4);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(base, 3));
      g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
      this.smokeU = { uTime: time, uPx: px, uAmt: { value: 0 }, uHeat: { value: 0 } };
      this.smoke = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: this.smokeU,
          vertexShader: /* glsl */ `
            uniform float uTime, uPx, uAmt, uHeat;
            attribute vec4 seed;
            varying vec3 vCol;
            varying float vA;
            void main() {
              float big = position.y;
              float h = fract(seed.x + uTime * 0.045 * (0.6 + seed.y));
              vec3 p = vec3(position.x, 0.0, position.z)
                + vec3(h * h * 14.0 + (seed.z - 0.5) * h * 9.0 * big, h * 38.0 * big, (seed.w - 0.5) * h * 9.0 * big);
              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              gl_PointSize = min(3.2 * big * (0.4 + h * 1.6) * uPx / -mv.z, 220.0);
              vA = uAmt * 0.32 * sin(h * 3.1416);
              vCol = mix(vec3(0.05, 0.035, 0.035), vec3(0.6, 0.18, 0.04), (1.0 - smoothstep(0.0, 0.25, h)) * uHeat);
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: DOT,
        }),
      );
      this.smoke.frustumCulled = false;
      this.smoke.visible = false;
      scene.add(this.smoke);
    }

    // which way each pillar falls (away from the blast) and when (the wave reaches the far ones later)
    for (const p of world.pillars.items) {
      const dir = new THREE.Vector3(p.x - GIANT_STAND.x, 0, p.z - GIANT_STAND.z);
      const d = dir.length();
      dir.normalize();
      this.pillarRest.push({ x: p.x, z: p.z, h: p.h, dir, start: BLAST_AT + 0.15 + d / 70, snap: r() < 0.4 ? 0.5 : 1 });
    }
  }

  /** Set everything for scene time `t`. */
  apply(t: number): void {
    const gone = t >= BLAST_AT;
    const heat = gone ? 1 - seg(t, BLAST_AT + 2, BLAST_AT + 40) * 0.85 : 0;

    this.crater.visible = gone;
    this.world.ground.setTorn(gone);
    this.world.ground.setHeat(heat);
    this.rim.visible = gone;
    this.craterU.uAmt.value = gone ? 1 : 0;
    this.craterU.uHeat.value = heat;
    this.scorch.opacity = gone ? 0.8 : 0;
    this.fire.visible = gone;
    this.fireU.uAmt.value = gone ? seg(t, BLAST_AT + 0.6, BLAST_AT + 2.5) : 0;
    this.smoke.visible = gone;
    this.smokeU.uAmt.value = gone ? seg(t, BLAST_AT + 1.5, BLAST_AT + 6) : 0;
    this.smokeU.uHeat.value = heat;

    // charred stone and trees, glowing at first
    this.world.stoneMat.color.copy(this.stoneBase).multiplyScalar(gone ? 0.38 : 1);
    this.world.stoneMat.emissive.setRGB(0.32 * heat * (gone ? 1 : 0) * (1 - seg(t, BLAST_AT, BLAST_AT + 14)), 0.06 * heat * (gone ? 1 : 0) * (1 - seg(t, BLAST_AT, BLAST_AT + 14)), 0);
    this.world.treeMat.color.copy(this.treeBase).multiplyScalar(gone ? 0.35 : 1);

    // the pillars: only touch them while something is changing
    const state = gone ? Math.min(1, seg(t, BLAST_AT, BLAST_AT + 3)) : -1;
    if (state === this.applied && (state === -1 || state === 1)) return;
    this.applied = state;
    const pm = this.world.pillars.mesh;
    this.pillarRest.forEach((p, i) => {
      const k = gone ? Math.pow(seg(t, p.start, p.start + 1.1), 2) : 0;
      const angle = k * 1.47;
      this.axis.set(p.dir.z, 0, -p.dir.x);
      this.q.setFromAxisAngle(this.axis, angle);
      const h = p.h * (k > 0 ? p.snap : 1);
      pm.setMatrixAt(i, this.m.compose(new THREE.Vector3(p.x, 0.6 * (1 - k) + 0.85 * k, p.z), this.q, new THREE.Vector3(1, h, 1)));
      // walk over the fallen ones
      const c = this.world.pillars.items[i].collider;
      if (k > 0.5) {
        c.x = p.x + p.dir.x * h * 0.5;
        c.z = p.z + p.dir.z * h * 0.5;
        c.h = 1.8;
        c.r = Math.max(1.3, h * 0.35);
      } else {
        c.x = p.x;
        c.z = p.z;
        c.h = p.h + 0.6;
        c.r = 1.3;
      }
    });
    pm.instanceMatrix.needsUpdate = true;
  }
}
