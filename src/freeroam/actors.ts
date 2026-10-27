/**
 * The two figures of the scene, built from primitives and drawn the anime way: three-band toon shading and an ink
 * outline (the inverted hull). Both are posed by a handful of numbers that the director eases between.
 *
 * The knight: a slight black-armoured swordswoman with a dark blade. The giant: a hulking stone-skinned brute with a
 * slab of a sword. Both are original designs.
 */
import * as THREE from 'three';

const bands = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]), 3, 1);
bands.minFilter = bands.magFilter = THREE.NearestFilter;
bands.needsUpdate = true;

const toon = (color: number, emissive = 0x000000): THREE.MeshToonMaterial => new THREE.MeshToonMaterial({ color, emissive, gradientMap: bands });

/** The ink line: back faces pushed out along their normals, drawn black. */
function inkMaterial(thick: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0x050208, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${thick.toFixed(4)};`);
  };
  return m;
}
const INK_KNIGHT = inkMaterial(0.012);
const INK_GIANT = inkMaterial(0.045);

/** A mesh with its ink line. */
function part(geo: THREE.BufferGeometry, mat: THREE.Material, ink: THREE.Material | null): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  if (ink) mesh.add(new THREE.Mesh(geo, ink));
  return mesh;
}

/** A limb that hangs down from its pivot. */
function limbGeo(r1: number, r2: number, len: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  g.translate(0, -len / 2, 0);
  return g;
}

const lerp = THREE.MathUtils.lerp;

// ---------------------------------------------------------------------------------------------------------------------

export interface KnightPose {
  /** torso pitch forward */
  lean: number;
  /** torso turn */
  twist: number;
  /** how far the arms swing the grip up (0: in front of the belly; -2.6: overhead) */
  raise: number;
  /** where the blade points, in the torso's frame (0: up, PI/2: forward, PI: down) */
  blade: number;
  crouch: number;
}

export const KNIGHT_POSES = {
  idle: { lean: 0.04, twist: 0, raise: -0.15, blade: Math.PI, crouch: 0 },
  guard: { lean: 0.14, twist: 0.3, raise: 0.35, blade: 0.85, crouch: 0.3 },
  dash: { lean: 0.6, twist: 0.6, raise: 0.7, blade: 2.6, crouch: 0.4 },
  slashA: { lean: 0.32, twist: 0.9, raise: 0.95, blade: 1.4, crouch: 0.35 },
  slashB: { lean: 0.25, twist: -0.75, raise: 0.15, blade: 0.35, crouch: 0.3 },
  overhead: { lean: -0.1, twist: 0, raise: -2.6, blade: -0.22, crouch: 0.18 },
  release: { lean: 0.5, twist: 0, raise: 0.95, blade: 1.95, crouch: 0.5 },
  /** the sword held upright before her face: the stance she charges from */
  kamae: { lean: 0, twist: 0, raise: 0.55, blade: 0.1, crouch: 0.22 },
  /** blades locked: leaning in, sword level */
  lock: { lean: 0.38, twist: 0.1, raise: 0.55, blade: 1.3, crouch: 0.55 },
  crouch: { lean: 0.5, twist: 0.3, raise: 0.35, blade: 2.6, crouch: 0.95 },
  /** coming down out of a leap */
  aerial: { lean: -0.15, twist: 0, raise: -2.5, blade: -0.5, crouch: 0.1 },
  spin: { lean: 0.3, twist: 2.9, raise: 0.95, blade: 1.5, crouch: 0.4 },
  flung: { lean: -0.65, twist: -0.3, raise: 0.2, blade: 2.9, crouch: 0.2 },
} satisfies Record<string, KnightPose>;

export class Knight {
  readonly root = new THREE.Group();
  /** the blade's point (world position via getWorldPosition) */
  readonly tip = new THREE.Object3D();
  readonly bladeGlow: THREE.MeshBasicMaterial;
  /** the blade of light that grows out of her sword while she charges */
  private readonly lightBlade: THREE.Mesh;
  private readonly lightU = { uTime: { value: 0 }, uAmt: { value: 0 } };
  readonly pose: KnightPose = { ...KNIGHT_POSES.idle };
  /** 0: standing, 1: running */
  stride = 0;
  private phase = 0;
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly grip = new THREE.Group();
  private readonly hands = new THREE.Group();
  private readonly sword = new THREE.Group();
  private readonly arms: THREE.Mesh[] = [];
  private readonly thighs: THREE.Group[] = [];
  private readonly shins: THREE.Group[] = [];
  private readonly cape: THREE.Mesh;
  private readonly capeBase: Float32Array;

  constructor() {
    const armor = toon(0x1c1824);
    const plate = toon(0x2c2636);
    const cloth = toon(0x140e1c);
    const skin = toon(0xf0e2dc);
    const hair = toon(0xe2d6b8);
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.15, 0.25) });
    const ink = INK_KNIGHT;

    this.root.add(this.hips);
    this.hips.position.y = 0.92;

    // the skirt of armour plates, with a red hem
    const skirt = part(new THREE.CylinderGeometry(0.19, 0.44, 0.64, 14, 1, true), cloth, ink);
    (skirt.material as THREE.Material).side = THREE.DoubleSide;
    skirt.position.y = -0.28;
    this.hips.add(skirt);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.012, 4, 28), red);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = -0.6;
    this.hips.add(hem);

    // torso
    this.hips.add(this.torso);
    const waist = part(new THREE.CylinderGeometry(0.12, 0.16, 0.26, 10), armor, ink);
    waist.position.y = 0.12;
    const chest = part(new THREE.CylinderGeometry(0.2, 0.14, 0.34, 10), plate, ink);
    chest.position.y = 0.4;
    chest.scale.z = 0.75;
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.26, 0.01), red);
    line.position.set(0, 0.39, 0.13);
    this.torso.add(waist, chest, line);
    for (const sx of [-1, 1]) {
      const pauldron = part(new THREE.SphereGeometry(0.1, 10, 8), plate, ink);
      pauldron.scale.set(1.25, 0.8, 1.05);
      pauldron.position.set(sx * 0.22, 0.52, 0);
      this.torso.add(pauldron);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), skin);
    neck.position.y = 0.6;
    this.torso.add(neck);

    // head: pale hair in a bun, a black visor with a red slit
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    const face = part(new THREE.SphereGeometry(0.1, 14, 10), skin, ink);
    face.position.y = 0.1;
    const cap = part(new THREE.SphereGeometry(0.108, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, ink);
    cap.position.set(0, 0.11, -0.01);
    const bun = part(new THREE.SphereGeometry(0.05, 10, 8), hair, ink);
    bun.position.set(0, 0.17, -0.09);
    const visor = part(new THREE.BoxGeometry(0.21, 0.065, 0.13), armor, ink);
    visor.position.set(0, 0.115, 0.035);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.008, 0.01), red);
    slit.position.set(0, 0.115, 0.1);
    this.head.add(face, cap, bun, visor, slit);

    // the grip pivot swings both hands; the sword sits in the hands
    this.grip.position.set(0, 0.42, 0.05);
    this.torso.add(this.grip);
    this.hands.position.set(0, -0.42, 0.32);
    this.grip.add(this.hands);
    const fists = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), armor);
    this.hands.add(fists);
    this.hands.add(this.sword);
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 6), cloth);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), plate);
    pommel.position.y = -0.13;
    const guard = part(new THREE.BoxGeometry(0.22, 0.03, 0.045), plate, ink);
    guard.position.y = 0.12;
    const blade = part(new THREE.BoxGeometry(0.065, 1.1, 0.014), toon(0x0c0a10), ink);
    blade.position.y = 0.68;
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.02, 0.018), red);
    groove.position.y = 0.66;
    this.bladeGlow = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.6, 0.4, 3.2),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: null,
    });
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.06), this.bladeGlow);
    glow.position.y = 0.68;
    this.tip.position.y = 1.24;
    this.sword.add(hilt, pommel, guard, blade, groove, glow, this.tip);

    const lb = new THREE.CylinderGeometry(0.06, 0.32, 1, 10, 1, true);
    lb.translate(0, 0.5, 0);
    this.lightBlade = new THREE.Mesh(
      lb,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: this.lightU,
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uAmt;
          varying vec2 vUv;
          float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec2 g = vec2(floor(vUv.x * 10.0), floor(vUv.y * 26.0 - uTime * 9.0));
            float streak = step(0.55, h(g));
            vec3 col = mix(vec3(0.7, 0.08, 1.8), vec3(2.6, 0.2, 0.5), streak);
            col = mix(col, vec3(3.0, 2.4, 3.2), smoothstep(0.85, 1.0, 1.0 - vUv.y) * 0.4);
            float a = uAmt * (0.25 + streak * 0.5) * smoothstep(1.0, 0.75, vUv.y);
            gl_FragColor = vec4(col, a);
          }`,
      }),
    );
    this.lightBlade.position.y = 1.2;
    this.lightBlade.visible = false;
    this.sword.add(this.lightBlade);

    // arms: one gauntleted segment from shoulder to the grip, re-aimed every frame
    const armGeo = new THREE.CylinderGeometry(0.042, 0.052, 1, 8);
    armGeo.translate(0, 0.5, 0);
    for (let i = 0; i < 2; i++) {
      const arm = part(armGeo, armor, ink);
      this.torso.add(arm);
      this.arms.push(arm);
    }

    // legs
    for (const sx of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(sx * 0.09, 0, 0);
      thigh.add(part(limbGeo(0.07, 0.06, 0.45), cloth, ink));
      const shin = new THREE.Group();
      shin.position.y = -0.45;
      shin.add(part(limbGeo(0.062, 0.045, 0.44), armor, ink));
      const boot = part(new THREE.BoxGeometry(0.09, 0.07, 0.2), plate, ink);
      boot.position.set(0, -0.44, 0.04);
      shin.add(boot);
      thigh.add(shin);
      this.hips.add(thigh);
      this.thighs.push(thigh);
      this.shins.push(shin);
    }

    // a short cape that streams behind her
    const capeGeo = new THREE.PlaneGeometry(0.5, 1.0, 2, 8);
    capeGeo.translate(0, -0.5, 0);
    this.cape = new THREE.Mesh(capeGeo, toon(0x1a0a18));
    (this.cape.material as THREE.Material).side = THREE.DoubleSide;
    this.cape.position.set(0, 0.56, -0.13);
    this.torso.add(this.cape);
    this.capeBase = Float32Array.from(capeGeo.attributes.position.array as Float32Array);
  }

  /** The blade of light: `len` metres beyond the steel, at strength `amt`. */
  setLightBlade(len: number, amt: number, time: number): void {
    this.lightBlade.visible = amt > 0.01 && len > 0.05;
    this.lightBlade.scale.set(1 + len * 0.06, Math.max(0.01, len), 1 + len * 0.06);
    this.lightU.uAmt.value = amt;
    this.lightU.uTime.value = time;
  }

  update(dt: number, time: number): void {
    const p = this.pose;
    this.phase += dt * 12 * this.stride;
    const s = Math.sin(this.phase) * this.stride;
    this.hips.position.y = 0.92 - p.crouch * 0.24 + Math.abs(Math.cos(this.phase)) * 0.05 * this.stride;
    this.torso.rotation.set(p.lean, p.twist, 0);
    this.head.rotation.set(-p.lean * 0.6, -p.twist * 0.5, 0);
    this.thighs[0].rotation.x = -p.crouch * 0.8 - s * 0.9;
    this.thighs[1].rotation.x = -p.crouch * 0.3 + s * 0.9;
    this.shins[0].rotation.x = p.crouch * 1.2 + Math.max(0, s) * 1.3;
    this.shins[1].rotation.x = p.crouch * 0.6 + Math.max(0, -s) * 1.3;
    this.grip.rotation.x = p.raise;
    this.sword.rotation.x = p.blade - p.raise;

    // aim both arms from the shoulders at the hands
    const hand = new THREE.Vector3().copy(this.hands.position).applyEuler(this.grip.rotation).add(this.grip.position);
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      const sx = i === 0 ? -1 : 1;
      arm.position.set(sx * 0.2, 0.48, 0);
      const to = new THREE.Vector3(hand.x + sx * 0.035, hand.y, hand.z).sub(arm.position);
      const len = to.length();
      arm.quaternion.setFromUnitVectors(UP, to.divideScalar(len));
      arm.scale.set(1, len, 1);
    }

    // the cape: a wave running down it, blown back harder at a run
    const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      const down = -this.capeBase[i + 1];
      a[i + 2] = this.capeBase[i + 2] - down * (0.12 + this.stride * 0.55 + Math.max(0, p.lean) * 0.4) - Math.sin(time * 4 + down * 5 + this.capeBase[i] * 3) * down * 0.06;
    }
    pos.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------------------------------------------------

export interface GiantPose {
  lean: number;
  /** sword arm: 0 hanging, -2.6 overhead */
  armR: number;
  armL: number;
  /** arms out to the sides */
  spread: number;
  /** head thrown back */
  roar: number;
  crouch: number;
}

export const GIANT_POSES = {
  idle: { lean: 0.15, armR: 0.15, armL: 0.1, spread: 0.2, roar: 0, crouch: 0.1 },
  roar: { lean: -0.25, armR: -0.4, armL: -0.4, spread: 1.1, roar: 1, crouch: 0.25 },
  charge: { lean: 0.55, armR: -2.5, armL: 0.5, spread: 0.3, roar: 0.3, crouch: 0.2 },
  raised: { lean: 0.1, armR: -2.6, armL: -0.3, spread: 0.3, roar: 0.2, crouch: 0.2 },
  cleave: { lean: 0.6, armR: 0.5, armL: 0.3, spread: 0.2, roar: 0, crouch: 0.45 },
  stagger: { lean: -0.4, armR: 0.2, armL: -0.2, spread: 0.7, roar: 0.4, crouch: 0.15 },
  brace: { lean: 0.35, armR: -1.4, armL: -1.3, spread: 0.45, roar: 0.6, crouch: 0.4 },
  struck: { lean: -0.6, armR: -0.8, armL: -0.8, spread: 1.2, roar: 1, crouch: 0.1 },
  slamUp: { lean: -0.2, armR: -2.8, armL: -2.8, spread: 0.1, roar: 0.6, crouch: 0.15 },
  slamDown: { lean: 0.75, armR: 0.7, armL: 0.7, spread: 0.05, roar: 0, crouch: 0.6 },
  block: { lean: 0.2, armR: -1.65, armL: -1.2, spread: 0.3, roar: 0.2, crouch: 0.35 },
  backhand: { lean: 0.25, armR: -0.3, armL: -1.5, spread: 1.4, roar: 0.4, crouch: 0.3 },
  /** leaning his whole weight into the locked blades */
  press: { lean: 0.5, armR: -1.0, armL: -0.7, spread: 0.2, roar: 0.3, crouch: 0.5 },
  kneel: { lean: 0.55, armR: 0.4, armL: 0.3, spread: 0.4, roar: 0, crouch: 0.95 },
} satisfies Record<string, GiantPose>;

export class Giant {
  readonly root = new THREE.Group();
  readonly pose: GiantPose = { ...GIANT_POSES.idle };
  readonly skin: THREE.MeshToonMaterial;
  readonly eyes: THREE.MeshBasicMaterial;
  /** his slab of a sword (it breaks under the beam) and its glowing edge */
  readonly slab = new THREE.Group();
  readonly slabEdge: THREE.MeshBasicMaterial;
  stride = 0;
  private phase = 0;
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly shoulders: THREE.Group[] = [];
  private readonly elbows: THREE.Group[] = [];
  private readonly thighs: THREE.Group[] = [];
  private readonly shins: THREE.Group[] = [];

  constructor() {
    this.skin = toon(0x3a3230, 0x000000);
    const dark = toon(0x16100f);
    const stone = toon(0x4a4248);
    this.eyes = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) });
    this.slabEdge = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.2, 0.1) });
    const ink = INK_GIANT;

    this.root.add(this.hips);
    this.hips.position.y = 2.3;
    const pelvis = part(new THREE.SphereGeometry(0.55, 12, 8), dark, ink);
    pelvis.scale.set(1.25, 0.75, 0.95);
    this.hips.add(pelvis, this.torso);

    const belly = part(new THREE.SphereGeometry(0.72, 12, 10), this.skin, ink);
    belly.position.y = 0.5;
    const chest = part(new THREE.SphereGeometry(1, 14, 10), this.skin, ink);
    chest.scale.set(1.3, 0.95, 0.85);
    chest.position.set(0, 1.35, 0.05);
    this.torso.add(belly, chest);

    this.head.position.set(0, 2.05, 0.35);
    this.torso.add(this.head);
    const skull = part(new THREE.SphereGeometry(0.34, 12, 10), this.skin, ink);
    skull.scale.set(1, 0.95, 1.05);
    const jaw = part(new THREE.BoxGeometry(0.42, 0.18, 0.32), this.skin, ink);
    jaw.position.set(0, -0.2, 0.1);
    this.head.add(skull, jaw);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), this.eyes);
      eye.position.set(sx * 0.12, 0.04, 0.3);
      this.head.add(eye);
    }
    for (let i = 0; i < 9; i++) {
      const spike = part(new THREE.ConeGeometry(0.12, 0.9, 5), dark, ink);
      const a = (i / 8 - 0.5) * 2.4;
      spike.position.set(Math.sin(a) * 0.28, 0.2, -0.15 + Math.cos(a) * -0.05);
      spike.rotation.set(-1.9 + Math.abs(a) * 0.2, 0, -a * 0.6);
      this.head.add(spike);
    }

    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(sx * 1.3, 1.7, 0);
      const ball = part(new THREE.SphereGeometry(0.42, 10, 8), this.skin, ink);
      sh.add(ball, part(limbGeo(0.34, 0.27, 1.15), this.skin, ink));
      const el = new THREE.Group();
      el.position.y = -1.15;
      el.add(part(limbGeo(0.27, 0.22, 1.05), this.skin, ink));
      const fist = part(new THREE.SphereGeometry(0.32, 10, 8), dark, ink);
      fist.position.y = -1.1;
      el.add(fist);
      if (sx === 1) {
        const slab = part(new THREE.BoxGeometry(0.5, 3.2, 0.16), stone, ink);
        slab.position.set(0, -2.7, 0.15);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.0, 0.18), this.slabEdge);
        edge.position.set(0.25, -2.7, 0.15);
        this.slab.add(slab, edge);
        el.add(this.slab);
      }
      sh.add(el);
      this.torso.add(sh);
      this.shoulders.push(sh);
      this.elbows.push(el);
    }

    for (const sx of [-1, 1]) {
      const th = new THREE.Group();
      th.position.set(sx * 0.48, -0.1, 0);
      th.add(part(limbGeo(0.38, 0.3, 1.15), dark, ink));
      const sh = new THREE.Group();
      sh.position.y = -1.15;
      sh.add(part(limbGeo(0.3, 0.24, 1.05), this.skin, ink));
      const foot = part(new THREE.BoxGeometry(0.4, 0.22, 0.7), dark, ink);
      foot.position.set(0, -1.08, 0.15);
      sh.add(foot);
      th.add(sh);
      this.hips.add(th);
      this.thighs.push(th);
      this.shins.push(sh);
    }
  }

  update(dt: number, time: number): void {
    const p = this.pose;
    this.phase += dt * 6.5 * this.stride;
    const s = Math.sin(this.phase) * this.stride;
    const breathe = Math.sin(time * 1.8) * 0.03;
    this.hips.position.y = 2.3 - p.crouch * 0.45 + Math.abs(Math.cos(this.phase)) * 0.15 * this.stride;
    this.torso.rotation.set(p.lean + breathe, 0, Math.sin(this.phase) * 0.06 * this.stride);
    this.head.rotation.set(-p.roar * 0.7 + p.lean * -0.4, 0, 0);
    // [0] is the left arm (-x), [1] the sword arm (+x)
    this.shoulders[1].rotation.set(p.armR, 0, p.spread * 0.6);
    this.shoulders[0].rotation.set(p.armL - s * 0.4, 0, -p.spread * 0.6);
    this.elbows[1].rotation.x = lerp(-0.5, -0.1, Math.min(1, -p.armR / 2.6));
    this.elbows[0].rotation.x = -0.6;
    this.thighs[0].rotation.x = -p.crouch * 0.7 - s * 0.7;
    this.thighs[1].rotation.x = -p.crouch * 0.5 + s * 0.7;
    this.shins[0].rotation.x = p.crouch * 1.1 + Math.max(0, s) * 1.0;
    this.shins[1].rotation.x = p.crouch * 0.9 + Math.max(0, -s) * 1.0;
  }
}

/** Ease every number of `pose` towards `target` (frame-rate independent). */
export function easePose<T extends object>(pose: T, target: T, rate: number, dt: number): void {
  const k = 1 - Math.exp(-rate * dt);
  const p = pose as Record<string, number>;
  const t = target as Record<string, number>;
  for (const key in t) p[key] += (t[key] - p[key]) * k;
}
