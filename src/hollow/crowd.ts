/**
 * The crowds of SLIME HOLLOW: the Iron Choir (spearmen, torchbearers, archers, banners, officers) and the village
 * (wounded, the clan's fighters, children and elders). Hundreds of people for about a dozen draw calls: every body
 * part is one instanced mesh, and each person is posed every frame from a few numbers the director sets (where they
 * are, which way they face, how they walk, kneel, fall or cover their heads).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowTex } from '../freeroam/world';
import { inkMaterial, toon } from './cast';

export type Kind = 'spear' | 'torch' | 'archer' | 'banner' | 'officer' | 'villager' | 'fighter' | 'elder' | 'child' | 'wounded';

export interface Member {
  kind: Kind;
  /** where they start, and their place in the ranks */
  hx: number;
  hz: number;
  row: number;
  col: number;
  /** 0..1, fixed per person: spreads out their timing */
  seed: number;
  // ---- set by the director every frame ----
  x: number;
  z: number;
  /** lifted off the ground (thrown) */
  y: number;
  yaw: number;
  /** 0 standing, 0.5 walking, 1 running */
  stride: number;
  lean: number;
  head: number;
  kneel: number;
  crouch: number;
  /** tipped onto the ground */
  lie: number;
  /** arms up over the head */
  cover: number;
  /** torch lit (0..1) */
  lit: number;
  /** frozen in cyan crystal (the banners) */
  frost: number;
  scale: number;
  phase: number;
}

const armGeo = (): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(0.045, 0.04, 0.58, 6);
  g.translate(0, -0.29, 0);
  return g;
};
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0): THREE.BufferGeometry => {
  g.rotateX(rx);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};

type Anchor = 'legL' | 'legR' | 'torso' | 'head' | 'armL' | 'armR';

interface Part {
  mesh: THREE.InstancedMesh;
  anchor: Anchor;
  who: number[];
}

export class Crowd {
  readonly members: Member[] = [];
  private readonly parts: Part[] = [];
  private readonly anchors: Record<Anchor, THREE.Matrix4[]>;
  /** the torch flames: one point each, at the end of the torch */
  private readonly flames: THREE.Points | null = null;
  private readonly flameAt: Float32Array | null = null;
  private readonly flameA: Float32Array | null = null;
  private readonly torchers: number[] = [];
  /** a few lights that carry the torches' warmth onto the ranks */
  readonly lights: THREE.PointLight[] = [];
  private readonly frostParts: Part[] = [];
  private readonly baseCloth = new THREE.Color(0xe8dcc0);
  private readonly frostCloth = new THREE.Color(0.5, 2.2, 3.0);
  private readonly tmp = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    members: Omit<Member, 'x' | 'z' | 'y' | 'yaw' | 'stride' | 'lean' | 'head' | 'kneel' | 'crouch' | 'lie' | 'cover' | 'lit' | 'frost' | 'phase'>[],
    readonly style: 'choir' | 'village',
    private readonly time: { value: number },
    px: { value: number },
  ) {
    for (const m of members)
      this.members.push({ ...m, x: m.hx, z: m.hz, y: 0, yaw: style === 'choir' ? 0 : Math.PI, stride: 0, lean: 0, head: 0, kneel: 0, crouch: 0, lie: 0, cover: 0, lit: 1, frost: 0, phase: m.seed * 6 });
    const n = this.members.length;
    this.anchors = { legL: [], legR: [], torso: [], head: [], armL: [], armR: [] };
    for (const k of Object.keys(this.anchors) as Anchor[]) for (let i = 0; i < n; i++) this.anchors[k].push(new THREE.Matrix4());
    const all = this.members.map((_, i) => i);
    const of = (...kinds: Kind[]): number[] => all.filter((i) => kinds.includes(this.members[i].kind));
    const ink = inkMaterial(0.02);

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, anchor: Anchor, who: number[], withInk = false, colors?: (i: number) => THREE.Color): Part | null => {
      if (!who.length) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, who.length);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (colors) who.forEach((w, j) => mesh.setColorAt(j, colors(w)));
      scene.add(mesh);
      const p = { mesh, anchor, who };
      this.parts.push(p);
      if (withInk) {
        const inkMesh = new THREE.InstancedMesh(geo, ink, who.length);
        inkMesh.frustumCulled = false;
        scene.add(inkMesh);
        this.parts.push({ mesh: inkMesh, anchor, who });
      }
      return p;
    };

    const leg = new THREE.CylinderGeometry(0.068, 0.052, 0.86, 6);
    leg.translate(0, -0.43, 0);
    const legGeo = mergeGeometries([leg, at(new THREE.BoxGeometry(0.09, 0.07, 0.2), 0, -0.86, 0.04)]);
    const head = at(new THREE.SphereGeometry(0.1, 10, 8), 0, 0.1, 0);
    const skin = toon(0xe8d4c4);
    const r = (i: number): number => this.members[i].seed;

    if (style === 'choir') {
      const tabard = mergeGeometries([at(new THREE.CylinderGeometry(0.2, 0.15, 0.62, 8), 0, 0.31, 0), at(new THREE.CylinderGeometry(0.16, 0.25, 0.4, 8, 1, true), 0, -0.16, 0)]);
      const helmet = mergeGeometries([at(new THREE.SphereGeometry(0.118, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.11, 0), at(new THREE.BoxGeometry(0.02, 0.09, 0.03), 0, 0.08, 0.11)]);
      const plume = at(new THREE.BoxGeometry(0.03, 0.14, 0.26), 0, 0.27, -0.04);
      const steel = toon(0x8a8e98);
      const wood = toon(0x4a3626);
      const cloth = toon(0xffffff);
      add(legGeo, toon(0x3a3430), 'legL', all);
      add(legGeo, toon(0x3a3430), 'legR', all);
      add(tabard, cloth, 'torso', all, true, (i) => new THREE.Color().setHSL(0.11, 0.18, 0.72 + r(i) * 0.12));
      add(head, skin, 'head', all);
      add(helmet, steel, 'head', all, true);
      add(plume, toon(0xf4f0e8), 'head', all.filter((i) => this.members[i].kind === 'officer' || r(i) > 0.82));
      add(armGeo(), cloth, 'armL', all, false, () => new THREE.Color(0xd8d0c0));
      add(armGeo(), cloth, 'armR', of('torch', 'archer', 'officer', 'banner'), false, () => new THREE.Color(0xd8d0c0));
      add(spearUp(), wood, 'armR', of('spear'));
      add(at(new THREE.BoxGeometry(0.52, 0.74, 0.06), 0.02, -0.42, 0.1), toon(0x6a5a48), 'armL', of('spear'), true);
      add(at(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 5), 0, -0.82, 0), wood, 'armR', of('torch'));
      add(at(new THREE.TorusGeometry(0.42, 0.014, 4, 12, Math.PI), 0, -0.58, 0.05, 0, Math.PI / 2), wood, 'armR', of('archer'));
      add(at(new THREE.BoxGeometry(0.03, 0.85, 0.008), 0, -1.0, 0.04), steel, 'armR', of('officer'));
      add(bannerPole(), wood, 'armR', of('banner'));
      const clothPart = add(bannerCloth(), toon(0xffffff), 'armR', of('banner'), false, () => this.baseCloth);
      if (clothPart) this.frostParts.push(clothPart);
    } else {
      const robe = at(new THREE.CylinderGeometry(0.2, 0.27, 1.05, 8), 0, 0.1, 0);
      const hair = at(new THREE.SphereGeometry(0.108, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), 0, 0.12, -0.01);
      const horn = at(new THREE.ConeGeometry(0.022, 0.13, 5), 0.05, 0.26, 0.02, -0.3, -0.3);
      const pal = [0x5a4a6a, 0x3a5060, 0x6a4a3a, 0x4a5a3a, 0x7a6a58, 0x3a3a4a];
      add(legGeo, toon(0x2a2422), 'legL', all);
      add(legGeo, toon(0x2a2422), 'legR', all);
      add(robe, toon(0xffffff), 'torso', all, true, (i) => new THREE.Color(pal[Math.floor(r(i) * pal.length)]));
      add(head, skin, 'head', all);
      add(hair, toon(0xffffff), 'head', all, false, (i) => new THREE.Color(this.members[i].kind === 'elder' ? 0xd8d4d0 : r(i) > 0.7 ? 0xe8e4e0 : 0x241a1a));
      add(horn, toon(0x16100e), 'head', of('fighter', 'child'));
      add(armGeo(), toon(0xffffff), 'armL', all, false, (i) => new THREE.Color(pal[Math.floor(r(i) * pal.length)]));
      add(armGeo(), toon(0xffffff), 'armR', all, false, (i) => new THREE.Color(pal[Math.floor(r(i) * pal.length)]));
      add(at(new THREE.BoxGeometry(0.03, 0.8, 0.01), 0, -0.95, 0.03), toon(0xb8c0cc), 'armR', of('fighter'));
      // bandages on the wounded: a white band round the middle
      add(at(new THREE.CylinderGeometry(0.215, 0.215, 0.12, 8), 0, 0.3, 0), toon(0xece6dc), 'torso', of('wounded'));
    }

    // torch flames
    const torchers = of('torch');
    if (torchers.length) {
      this.torchers = torchers;
      this.flameAt = new Float32Array(torchers.length * 3);
      this.flameA = new Float32Array(torchers.length);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.flameAt, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aA', new THREE.BufferAttribute(this.flameA, 1).setUsage(THREE.DynamicDrawUsage));
      this.flames = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { uPx: px, uTime: time, uMap: { value: glowTex } },
          vertexShader: /* glsl */ `
            uniform float uPx, uTime;
            attribute float aA;
            varying float vA;
            void main() {
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              float flick = 0.8 + 0.2 * sin(uTime * 13.0 + position.x * 7.0) * sin(uTime * 7.3 + position.z * 3.0);
              gl_PointSize = min(0.75 * flick * uPx / -mv.z, 90.0);
              vA = aA * flick;
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: /* glsl */ `
            uniform sampler2D uMap;
            varying float vA;
            void main() {
              vec4 t = texture2D(uMap, gl_PointCoord);
              if (vA < 0.01) discard;
              gl_FragColor = vec4(vec3(3.0, 1.3, 0.4) * t.r, t.r * vA);
            }`,
        }),
      );
      this.flames.frustumCulled = false;
      scene.add(this.flames);
      for (let k = 0; k < 4; k++) {
        const l = new THREE.PointLight(0xff8a3a, 0, 26, 1.5);
        scene.add(l);
        this.lights.push(l);
      }
    }
  }

  private readonly m = new THREE.Matrix4();
  private readonly t = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  /** compose a translation and an XYZ rotation into `out` */
  private tr(out: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number): THREE.Matrix4 {
    return out.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.one);
  }

  update(dt: number, heightAt: (x: number, z: number) => number): void {
    const A = this.anchors;
    const ms = this.members;
    for (let i = 0; i < ms.length; i++) {
      const p = ms[i];
      p.phase += dt * (8 + p.stride * 5) * p.stride;
      const s = Math.sin(p.phase) * Math.min(1, p.stride * 1.4);
      const bob = Math.abs(Math.cos(p.phase)) * 0.06 * p.stride;
      const hy = Math.max(0.1, 0.92 - p.crouch * 0.26 - p.kneel * 0.42 - p.lie * 0.8 + bob);
      // root: on the ground, turned, sized
      const root = this.m.compose(this.v.set(p.x, heightAt(p.x, p.z) + p.y, p.z), this.q.setFromAxisAngle(UPV, p.yaw), this.v2.setScalar(p.scale));
      // the body pivots at the hips: lying, it tips back flat
      const body = this.body.multiplyMatrices(root, this.tr(this.t, 0, hy, 0, -p.lie * 1.45, 0, 0));
      const torso = A.torso[i].multiplyMatrices(body, this.tr(this.t, 0, 0, 0, p.lean, 0, 0));
      A.head[i].multiplyMatrices(torso, this.tr(this.t, 0, 0.66, 0, p.head, 0, 0));
      // arms: the torch held up, the rest hanging and swinging; arms up over the head to cover it
      const torch = p.kind === 'torch' ? -1.9 + (1 - p.lit) * 1.6 : p.kind === 'banner' || p.kind === 'spear' ? -0.35 : 0;
      const armR = THREE.MathUtils.lerp(torch + s * 0.4 * (torch ? 0.2 : 1), -2.7, p.cover);
      const armL = THREE.MathUtils.lerp(-s * 0.45 + (p.kind === 'spear' ? -0.5 : 0), -2.7, p.cover);
      A.armR[i].multiplyMatrices(torso, this.tr(this.t, -0.21, 0.52, 0, armR, 0, -0.12 - p.cover * 0.3));
      A.armL[i].multiplyMatrices(torso, this.tr(this.t, 0.21, 0.52, 0, armL, 0, 0.12 + p.cover * 0.3));
      A.legR[i].multiplyMatrices(body, this.tr(this.t, -0.09, 0, 0, -p.crouch * 0.6 - s * 0.75 + p.kneel * 1.25, 0, 0));
      A.legL[i].multiplyMatrices(body, this.tr(this.t, 0.09, 0, 0, -p.crouch * 0.6 + s * 0.75 - p.kneel * 0.95, 0, 0));
    }
    for (const part of this.parts) {
      const list = A[part.anchor];
      for (let j = 0; j < part.who.length; j++) part.mesh.setMatrixAt(j, list[part.who[j]]);
      part.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const part of this.frostParts) {
      let dirty = false;
      for (let j = 0; j < part.who.length; j++) {
        const f = ms[part.who[j]].frost;
        if (f <= 0 && !part.mesh.userData.frosted) continue;
        part.mesh.setColorAt(j, this.tmp.copy(this.baseCloth).lerp(this.frostCloth, f));
        dirty = true;
      }
      part.mesh.userData.frosted = dirty;
      if (dirty && part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
    }

    // torch flames at the end of each torch, and the light they throw
    if (this.flames && this.flameAt && this.flameA) {
      const sums = [0, 0, 0, 0];
      const pos = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      const cnt = [0, 0, 0, 0];
      this.torchers.forEach((w, j) => {
        this.v.set(0, -1.1, 0).applyMatrix4(A.armR[w]);
        this.flameAt!.set([this.v.x, this.v.y, this.v.z], j * 3);
        const lit = ms[w].lit * (ms[w].lie > 0.5 ? 0.3 : 1);
        this.flameA![j] = lit;
        const seg = Math.min(3, Math.floor((j / this.torchers.length) * 4));
        sums[seg] += lit;
        pos[seg].add(this.v);
        cnt[seg]++;
      });
      (this.flames.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.flames.geometry.attributes.aA as THREE.BufferAttribute).needsUpdate = true;
      this.lights.forEach((l, k) => {
        if (!cnt[k]) return;
        l.position.copy(pos[k].divideScalar(cnt[k])).setY(2.6);
        l.intensity = (sums[k] / cnt[k]) * 32 * (0.85 + 0.15 * Math.sin(this.time.value * 9 + k));
      });
    }
  }

  private readonly body = new THREE.Matrix4();
  private readonly v2 = new THREE.Vector3();
}

const UPV = new THREE.Vector3(0, 1, 0);

/** An arm holding a spear upright: the shaft runs from the ground past the head, the point up. */
function spearUp(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.018, 0.018, 2.5, 5);
  shaft.translate(0, 0.45, 0.06);
  const tip = new THREE.ConeGeometry(0.045, 0.24, 5);
  tip.translate(0, 1.82, 0.06);
  const arm = armGeo();
  // (the shaft is set in the hand: lifted by the arm's length, so the hand closes on it)
  shaft.translate(0, -0.58, 0);
  tip.translate(0, -0.58, 0);
  return mergeGeometries([arm, shaft, tip]);
}

function bannerPole(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(0.025, 0.03, 3.6, 5);
  pole.translate(0, 0.9 - 0.58, 0.06);
  const arm = armGeo();
  return mergeGeometries([arm, pole]);
}

function bannerCloth(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.9, 1.5, 4, 6);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 4 + p.getY(i) * 2) * 0.06);
  g.computeVertexNormals();
  g.translate(0.47, 1.85 - 0.58, 0.06);
  return g;
}
