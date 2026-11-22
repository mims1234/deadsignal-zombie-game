/**
 * HIRASAKA: the two fights drawn from the story's state (every screen alike: the words `ua`, `ub`, `kw`, `kx` and the
 * thunders broken). `bosses.ts` owns one and calls `update` every frame.
 *
 *   THE UMIBŌZU   a bald giant out past the seawall, shoulders in the sea, two pale eyes: drawn without fog and lit from
 *                 inside a little so it reads from anywhere on the seafront, on Low too. It lifts the sea in both arms
 *                 before every throw; the wave is a white wall running east down its lane, and the lane ahead of it
 *                 shows a pale streak of foam the moment it lands.
 *   KUROGANE      his eight thunders (one mesh on his body; which show is a uniform), his black damp round him, the hall
 *                 floor under black water in his last phase, the forked tree's roots round him when they take him; and
 *                 the Root Hall's machinery moved (`world/layout/hirasakaRoot.ts` ROOT_MACHINES, found by name): the ore
 *                 skips run and drop, the fan's rotor turns, the sump drains. His THUNDERLINGS are drawn here too, all
 *                 of them in two instanced draws (their own anime bodies are hidden: a body each was twenty draws).
 *
 * About a dozen draw calls in all, each only where it is: the giant 5, the waves 4, the hall 4.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Zombie } from '../enemies/zombie';
import { ROOT_MACHINES } from '../world/layout/hirasakaRoot';
import { KSTATE, KURO, Kuro } from './bossKurogane';
import { UMI, UMODE, Umi } from './bossUmi';
import type { StoryView } from './story';

/** Where each thunder sits on him (rig space: he faces -z, his right is +x; he is drawn half again a man's size). */
const NODES: readonly (readonly [number, number, number, number])[] = [
  [0.25, 1.46, 0, 0],
  [-0.25, 1.46, 0, 0],
  [0, 1.3, -0.17, 1],
  [0, 1.32, 0.17, 2],
  [0.18, 0.95, -0.07, 1],
  [-0.18, 0.95, -0.07, 1],
  [0, 1.07, -0.18, 1],
  [0, 1.9, 0, 3],
];

const NODE_VERT = /* glsl */ `
attribute float aIdx;
uniform float uMask;
varying float vOn;
varying vec3 vN;
void main() {
  vOn = mod(floor(uMask / exp2(aIdx) + 0.001), 2.0);
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const NODE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpen;
varying float vOn;
varying vec3 vN;
void main() {
  if (vOn < 0.5) discard;
  float rim = 0.55 + 0.45 * abs(vN.z);
  float pulse = 0.7 + 0.3 * sin(uTime * (uOpen > 0.5 ? 14.0 : 5.0));
  vec3 c = mix(vec3(0.35, 0.75, 1.0), vec3(1.0, 0.95, 0.55), uOpen) * (1.4 + uOpen) * pulse * rim;
  gl_FragColor = vec4(c, 1.0);
}`;

const GAS_FRAG = /* glsl */ `
uniform float uTime;
uniform float uK;
varying vec3 vP;
varying vec3 vN;
float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  float edge = pow(abs(vN.z), 1.4);
  float n = n3(vP * 0.7 + vec3(0.0, uTime * 0.6, uTime * 0.25)) * 0.6 + n3(vP * 1.7 - vec3(uTime * 0.4)) * 0.4;
  float a = edge * smoothstep(0.25, 0.75, n) * 0.85 * uK;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vec3(0.03, 0.03, 0.035), a);
}`;
const GAS_VERT = /* glsl */ `
varying vec3 vP;
varying vec3 vN;
void main() {
  vP = position;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const unlit = (color: number, o: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color, fog: false, ...o });

export class BossLook {
  readonly root = new THREE.Group();
  // ---- the umibōzu ----
  private readonly giant = new THREE.Group();
  private readonly arms: THREE.Mesh[] = [];
  private readonly lifted: THREE.Mesh;
  private giantY = -45;
  private giantX = UMI.x0;
  private readonly waves: { crest: THREE.Mesh; streak: THREE.Mesh; x: number; live: boolean }[] = [];
  // ---- Kurogane ----
  private readonly nodes: THREE.Mesh;
  private readonly nodeMat: THREE.ShaderMaterial;
  private readonly gas: THREE.Mesh;
  private readonly gasMat: THREE.ShaderMaterial;
  private gasK = 0;
  private readonly flood: THREE.Mesh;
  private readonly roots: THREE.Mesh;
  private rootsK = 0;
  private machines: { skips: (THREE.Object3D | null)[]; rest: THREE.Vector3[]; rotor: THREE.Object3D | null; sump: THREE.Object3D | null } | null = null;
  private fanSpin = 0;
  private t = 0;
  private readonly imps: THREE.InstancedMesh;
  private readonly impGlow: THREE.InstancedMesh;

  constructor() {
    this.root.name = 'HirasakaBosses';
    // ---- the giant: one body (head, shoulders, the chest going down into the sea), its eyes, two arms, the sea it lifts ----
    const skin = new THREE.MeshStandardMaterial({ color: 0x0b1519, roughness: 0.25, metalness: 0.15, emissive: 0x0e3036, emissiveIntensity: 0.9, fog: false });
    const head = new THREE.SphereGeometry(7, 20, 14).scale(1, 1.18, 1).translate(0, 25, 0);
    const shoulders = new THREE.SphereGeometry(1, 20, 12).scale(15, 7, 9).translate(0, 13, 0);
    const chest = new THREE.CylinderGeometry(11, 15, 18, 18, 1, true).translate(0, 2, 0);
    const brow = new THREE.SphereGeometry(1, 12, 6).scale(6.4, 1.4, 3).translate(0, 26.6, 4.6);
    const body = mergeGeometries([head, shoulders, chest, brow].map((g) => g.toNonIndexed()));
    this.giant.add(new THREE.Mesh(body!, skin));
    const eye = new THREE.SphereGeometry(1.05, 10, 8);
    const eyes = mergeGeometries([eye.clone().translate(-2.6, 25.2, 6.3), eye.clone().translate(2.6, 25.2, 6.3)]);
    this.giant.add(new THREE.Mesh(eyes!, unlit(0xdafff2)));
    const armGeo = mergeGeometries([new THREE.CylinderGeometry(2.6, 3.4, 16, 10).translate(0, -8, 0), new THREE.SphereGeometry(3.6, 10, 8).translate(0, -16.5, 0)].map((g) => g.toNonIndexed()));
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(armGeo!, skin);
      a.position.set(s * 13.5, 15, 0);
      this.giant.add(a);
      this.arms.push(a);
    }
    // the sea it lifts between its hands (white-green, shown as it winds up)
    this.lifted = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(15, 7, 6),
      new THREE.MeshStandardMaterial({ color: 0xb8dcd8, emissive: 0x2a5a5a, emissiveIntensity: 0.8, roughness: 0.2, transparent: true, opacity: 0.85, fog: false }),
    );
    this.lifted.position.set(0, 20, 8);
    this.giant.add(this.lifted);
    this.giant.position.set(UMI.x0, -45, UMI.z);
    // its face (local +z) toward the island, which lies to the south (-z)
    this.giant.rotation.y = Math.PI;
    this.giant.visible = false;
    this.root.add(this.giant);

    // ---- the waves: a curling white wall across its lane, and the streak of foam down the lane ahead ----
    const crestGeo = (() => {
      const g = new THREE.BoxGeometry(3.2, UMI.wave.top, 1, 6, 6, 1);
      const p = g.attributes.position!;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i) + UMI.wave.top / 2;
        // the top leans forward (east) and curls; the back slopes away
        const k = y / UMI.wave.top;
        p.setXYZ(i, x * (1 - k * 0.55) + k * k * 1.3, y, p.getZ(i));
      }
      g.computeVertexNormals();
      return g;
    })();
    // (drawn without fog: white water reads through the storm the length of the street, so it is seen coming)
    const crestMat = new THREE.MeshStandardMaterial({ color: 0xe6f4f2, emissive: 0x5a8a8a, emissiveIntensity: 1, roughness: 0.3, transparent: true, opacity: 0.94, fog: false });
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xcfeeee, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const streakGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
    for (let k = 0; k < 2; k++) {
      const crest = new THREE.Mesh(crestGeo, crestMat);
      crest.visible = false;
      const streak = new THREE.Mesh(streakGeo, streakMat);
      streak.visible = false;
      this.root.add(crest, streak);
      this.waves.push({ crest, streak, x: 0, live: false });
    }

    // ---- Kurogane's thunders: small drums, one mesh, a mask for which still beat ----
    const geos: THREE.BufferGeometry[] = [];
    NODES.forEach(([x, y, z, kind], i) => {
      const g = kind === 3 ? new THREE.TorusGeometry(0.17, 0.05, 6, 16).rotateX(Math.PI / 2) : new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12);
      if (kind === 0) g.rotateZ(Math.PI / 2 * Math.sign(x));
      else if (kind === 1) g.rotateX(Math.PI / 2);
      else if (kind === 2) g.rotateX(-Math.PI / 2);
      g.translate(x, y, z);
      const n = g.toNonIndexed();
      n.setAttribute('aIdx', new THREE.Float32BufferAttribute(new Array(n.attributes.position!.count).fill(i), 1));
      n.deleteAttribute('uv');
      geos.push(n);
    });
    this.nodeMat = new THREE.ShaderMaterial({ vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, uniforms: { uMask: { value: 255 }, uTime: { value: 0 }, uOpen: { value: 0 } } });
    this.nodes = new THREE.Mesh(mergeGeometries(geos)!, this.nodeMat);
    this.nodes.name = 'kurogane-thunders';
    this.nodes.frustumCulled = false;

    // ---- his black damp ----
    this.gasMat = new THREE.ShaderMaterial({ vertexShader: GAS_VERT, fragmentShader: GAS_FRAG, uniforms: { uTime: { value: 0 }, uK: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.gas = new THREE.Mesh(new THREE.IcosahedronGeometry(KURO.gas.r, 3).scale(1, 0.55, 1), this.gasMat);
    this.gas.visible = false;
    this.root.add(this.gas);

    // ---- the hall's floor under black water ----
    this.flood = new THREE.Mesh(new THREE.PlaneGeometry(76, 62).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x050807, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.88 }));
    this.flood.position.set(306, 0, -37);
    this.flood.visible = false;
    this.root.add(this.flood);

    // ---- the roots that take him: pale, curling up out of the floor ----
    const rg: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6),
        new THREE.Vector3(Math.cos(a) * 2.0, 1.2, Math.sin(a) * 2.0),
        new THREE.Vector3(Math.cos(a + 0.6) * 1.1, 2.2 + (k % 3) * 0.4, Math.sin(a + 0.6) * 1.1),
        new THREE.Vector3(Math.cos(a + 1.3) * 0.7, 3.0 + (k % 2) * 0.5, Math.sin(a + 1.3) * 0.7),
      ]);
      rg.push(new THREE.TubeGeometry(curve, 10, 0.16 - (k % 3) * 0.02, 5, false));
    }
    this.roots = new THREE.Mesh(mergeGeometries(rg)!, new THREE.MeshStandardMaterial({ color: 0xc4b8a0, roughness: 0.95, emissive: 0x3a3450, emissiveIntensity: 0.7 }));
    this.roots.visible = false;
    this.root.add(this.roots);

    // ---- the thunderlings: a hunched imp of soot, a drum on its back and lightning in its fists ----
    const imp = mergeGeometries([
      new THREE.SphereGeometry(0.32, 8, 6).scale(1, 1.15, 0.9).translate(0, 0.72, 0).toNonIndexed(),
      new THREE.SphereGeometry(0.2, 8, 6).translate(0, 1.12, -0.12).toNonIndexed(),
      new THREE.CylinderGeometry(0.06, 0.08, 0.6, 5).rotateX(1.1).translate(0.3, 0.75, -0.25).toNonIndexed(),
      new THREE.CylinderGeometry(0.06, 0.08, 0.6, 5).rotateX(1.1).translate(-0.3, 0.75, -0.25).toNonIndexed(),
      new THREE.CylinderGeometry(0.07, 0.05, 0.5, 5).translate(0.14, 0.25, 0).toNonIndexed(),
      new THREE.CylinderGeometry(0.07, 0.05, 0.5, 5).translate(-0.14, 0.25, 0).toNonIndexed(),
    ])!;
    this.imps = new THREE.InstancedMesh(imp, new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.6, emissive: 0x123850, emissiveIntensity: 0.8 }), 8);
    const glow = mergeGeometries([
      new THREE.CylinderGeometry(0.2, 0.2, 0.16, 10).rotateX(Math.PI / 2).translate(0, 0.86, 0.3).toNonIndexed(),
      new THREE.IcosahedronGeometry(0.09, 0).translate(0.32, 0.6, -0.5).toNonIndexed(),
      new THREE.IcosahedronGeometry(0.09, 0).translate(-0.32, 0.6, -0.5).toNonIndexed(),
      new THREE.SphereGeometry(0.05, 6, 4).translate(0.07, 1.16, -0.3).toNonIndexed(),
      new THREE.SphereGeometry(0.05, 6, 4).translate(-0.07, 1.16, -0.3).toNonIndexed(),
    ])!;
    this.impGlow = new THREE.InstancedMesh(glow, new THREE.MeshBasicMaterial({ color: 0xaaf0ff, fog: false }), 8);
    for (const m of [this.imps, this.impGlow]) {
      m.count = 0;
      m.frustumCulled = false;
      this.root.add(m);
    }
  }

  /** The thunderlings, every frame (on every screen: the guests' puppets too). */
  private thunderlings(list: readonly Zombie[]): void {
    let n = 0;
    const o = BossLook.tmp;
    for (const z of list) {
      if (z.variant !== 'thunderling') continue;
      z.rig.root.visible = false;
      if (!z.alive || n >= 8) continue;
      const hop = Math.abs(Math.sin(this.t * 11 + z.id)) * 0.12;
      o.position.set(z.x, z.y + hop, z.z);
      o.rotation.set(0.25, z.yaw, Math.sin(this.t * 17 + z.id) * 0.1);
      const s = 1.2 + Math.sin(this.t * 23 + z.id * 3) * 0.04;
      o.scale.setScalar(s);
      o.updateMatrix();
      this.imps.setMatrixAt(n, o.matrix);
      this.impGlow.setMatrixAt(n, o.matrix);
      n++;
    }
    this.imps.count = this.impGlow.count = n;
    this.imps.visible = this.impGlow.visible = n > 0;
    if (n) {
      this.imps.instanceMatrix.needsUpdate = true;
      this.impGlow.instanceMatrix.needsUpdate = true;
    }
  }
  private static readonly tmp = new THREE.Object3D();

  /** What appears only later (compiled with the level). */
  prewarm(): THREE.Object3D[] {
    return [this.giant, this.waves[0]!.crest, this.waves[0]!.streak, this.gas, this.flood, this.roots, this.imps, this.impGlow];
  }

  reset(): void {
    this.giantY = -45;
    this.giant.visible = false;
    for (const w of this.waves) {
      w.live = false;
      w.crest.visible = w.streak.visible = false;
    }
    this.gasK = this.rootsK = 0;
    this.gas.visible = this.flood.visible = this.roots.visible = false;
    this.nodes.removeFromParent();
    this.restMachines();
  }

  /** The Root Hall's moving parts, found by name the first time they are wanted. */
  private bind(find: (name: string) => THREE.Object3D | null): void {
    if (this.machines) return;
    const skips = ROOT_MACHINES.hoist.skips.map((s) => find(s.name));
    this.machines = { skips, rest: skips.map((o) => (o ? o.position.clone() : new THREE.Vector3())), rotor: find(ROOT_MACHINES.fan.name), sump: find(ROOT_MACHINES.pump.name) };
  }

  private restMachines(): void {
    const m = this.machines;
    if (!m) return;
    m.skips.forEach((o, i) => o?.position.copy(m.rest[i]!));
    if (m.sump) m.sump.position.y = ROOT_MACHINES.pump.waterY;
  }

  /** Every frame. `boss`: Kurogane while he stands; `find`: the level's named objects; `near`: the camera is in the deep. */
  update(dt: number, v: StoryView, boss: Zombie | null, find: (name: string) => THREE.Object3D | null, deep: boolean, zombies: readonly Zombie[]): void {
    this.t += dt;
    this.thunderlings(zombies);
    this.umi(dt, v, deep);
    this.hall(dt, v, boss, find, deep);
  }

  private umi(dt: number, v: StoryView, deep: boolean): void {
    const mode = Umi.mode(v.ua);
    const up = v.umi === 1 && mode !== UMODE.down;
    const lift = Umi.lift(v.ua);
    // its height: shoulders at the water while it wades, up to its chest as it lifts, down with a hit, gone when sunk
    const base = -2 - v.umiHits * 2.5;
    // (final polish) a guarded throw comes from low in the water: shoulders under the wall's line, face behind its arms
    const guard = Umi.guarded(v.ua);
    const want = !up || v.umi === 2 ? -48 : mode === UMODE.reel ? base - 7 : guard ? base - 3 + lift * 1.5 : base + lift * 7 + (mode === UMODE.throw_ ? 6 : 0);
    this.giantY += (want - this.giantY) * Math.min(1, dt * (mode === UMODE.reel ? 2.5 : 1.1));
    const gx = Umi.x(v.ua);
    if (up) this.giantX += (gx - this.giantX) * Math.min(1, dt * 3);
    this.giant.visible = !deep && this.giantY > -44;
    if (this.giant.visible) {
      this.giant.position.set(this.giantX, this.giantY + Math.sin(this.t * 0.6) * 0.6, UMI.z);
      this.giant.rotation.z = mode === UMODE.reel ? Math.sin(this.t * 7) * 0.05 : Math.sin(this.t * 0.4) * 0.02;
      const raise = mode === UMODE.throw_ ? 1 : lift;
      this.arms.forEach((a, i) => {
        const s = i === 0 ? -1 : 1;
        // arms down in the sea while it wades; up and forward over its head with the sea in them; flung at the throw
        a.rotation.x = -raise * (guard ? 1.6 : 2.4) + (mode === UMODE.throw_ ? 0.9 : 0);
        a.rotation.z = s * (guard ? 0.25 - raise * 0.35 : 0.25 + raise * 0.25);
      });
      this.lifted.visible = mode === UMODE.windup || (mode === UMODE.throw_ && this.t % 1 < 0.2);
      this.lifted.scale.setScalar(Math.max(0.05, lift));
      this.lifted.position.y = guard ? 14 + lift * 6 : 20 + lift * 14;
    }
    // the waves (moving on between the reports, eased to them)
    const rep = Umi.waves(v.ub);
    this.waves.forEach((w, k) => {
      const r = rep[k];
      if (!r || v.umi !== 1) {
        w.live = false;
        w.crest.visible = w.streak.visible = false;
        return;
      }
      if (!w.live || Math.abs(w.x - r.x) > 4) w.x = r.x;
      else w.x += UMI.wave.speed * dt + (r.x - w.x) * Math.min(1, dt * 4);
      w.live = true;
      const [z0, z1] = UMI.lanes[r.lane]!;
      w.crest.visible = !deep;
      w.crest.position.set(w.x, 0, (z0 + z1) / 2);
      w.crest.scale.set(1, 1 + Math.sin(this.t * 9 + k) * 0.06, z1 - z0);
      const len = Math.max(0.1, UMI.front.x1 - w.x);
      w.streak.visible = !deep;
      w.streak.position.set(w.x + 1.6, 0.06, (z0 + z1) / 2);
      w.streak.scale.set(len, 1, (z1 - z0) * 0.9);
    });
  }

  private hall(dt: number, v: StoryView, boss: Zombie | null, find: (name: string) => THREE.Object3D | null, deep: boolean): void {
    const kw = v.kw;
    const on = v.hairpin && !v.bossDown;
    if (deep) this.bind(find);
    const m = this.machines;
    // ---- his thunders ----
    if (boss && on) {
      if (this.nodes.parent !== boss.rig.root) boss.rig.root.add(this.nodes);
      // (the drums are placed for a body 1.8 tall, in his rig's own units: the rig is scaled up as a whole)
      this.nodes.scale.setScalar(boss.rig.height / 1.8);
      this.nodeMat.uniforms.uMask!.value = 255 & ~v.thunders;
      this.nodeMat.uniforms.uTime!.value = this.t;
      this.nodeMat.uniforms.uOpen!.value = Kuro.open(kw) ? 1 : 0;
    } else this.nodes.removeFromParent();
    // ---- his gas ----
    this.gasK += ((on && boss && Kuro.gas(kw) ? 1 : 0) - this.gasK) * Math.min(1, dt * (Kuro.gas(kw) ? 1.2 : 3));
    this.gas.visible = deep && this.gasK > 0.03 && !!boss;
    if (this.gas.visible && boss) {
      this.gas.position.set(boss.x, boss.y + 2, boss.z);
      this.gas.rotation.y += dt * 0.3;
      this.gasMat.uniforms.uTime!.value = this.t;
      this.gasMat.uniforms.uK!.value = this.gasK;
    }
    // ---- the water on the floor, and the sump ----
    const water = on && Kuro.phase(kw) === 3 ? Kuro.water(kw) : 0;
    this.flood.visible = deep && water > 0.02;
    this.flood.position.y = 0.04 + water * 0.42 + Math.sin(this.t * 0.8) * 0.01;
    if (m?.sump) m.sump.position.y = on && Kuro.phase(kw) === 3 ? ROOT_MACHINES.pump.dryY + (ROOT_MACHINES.pump.waterY - ROOT_MACHINES.pump.dryY) * water : ROOT_MACHINES.pump.waterY;
    // ---- the roots ----
    this.rootsK += ((on && Kuro.pinned(kw) ? 1 : 0) - this.rootsK) * Math.min(1, dt * 3);
    this.roots.visible = deep && this.rootsK > 0.03 && !!boss;
    if (this.roots.visible && boss) {
      this.roots.position.set(boss.x, boss.y, boss.z);
      this.roots.scale.set(1, this.rootsK, 1);
      this.roots.rotation.y += dt * 0.2;
    }
    // ---- the skips and the fan ----
    if (m) {
      m.skips.forEach((o, i) => {
        if (!o) return;
        const rest = m.rest[i]!;
        if (!on || Kuro.phase(kw) !== 1) {
          o.position.copy(rest);
          return;
        }
        const x = Kuro.skipX(v.kx, i);
        const drop = Kuro.skipDrop(v.kx, i);
        o.position.x += (x - o.position.x) * Math.min(1, dt * 10);
        const y = rest.y - drop * (ROOT_MACHINES.hoist.skips[i]!.bottom - 0.15);
        o.position.y += (y - o.position.y) * Math.min(1, dt * 12);
      });
      const fan = on && Kuro.phase(kw) === 2 ? Kuro.fan(kw) : -1;
      const want = fan === KSTATE.running ? 14 : fan === KSTATE.winding ? 3 : 0.4;
      this.fanSpin += (want - this.fanSpin) * Math.min(1, dt * 1.5);
      if (m.rotor) m.rotor.rotation.z += this.fanSpin * dt;
    }
  }

  dispose(): void {
    this.restMachines();
    this.nodes.removeFromParent();
    this.root.removeFromParent();
  }
}
