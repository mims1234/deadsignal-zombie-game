/**
 * ZARYA: BABA YAGA'S STAGE AS IT IS DRAWN (`stage.ts` is the fight; the layout, `world/layout/zaryaDk.ts`, builds what
 * stays still). Everything here moves: the hut walking on its chicken legs (her own body, the Warden's underneath, is
 * hidden: the hut is what is shot at, `HUT_DEF_PATCH`), its door, Lyudmila Markovna in the doorway and her broom at the
 * little window, the revolve's disc, the open trap, the three fly bars, the winch's wheel, the pit's lever, the
 * follow-spot's head and its beam, the frost pools, her pots in the air, and a lamp at each machine saying what it can
 * do now (green: works on her where she stands; amber: ready, she is elsewhere; red: she is watching it; blue: running).
 *
 * About twenty draw calls, all inside the Dom Kultury's site (hidden from anywhere else).
 */
import * as THREE from 'three';
import type { Zombie } from '../enemies/zombie';
import { Paint } from './look';
import { ACT, MACHINE, MSTATE, Stage, YAGA, catches, hutFloor, type Machine } from './stage';
import { DK } from './zones/dk';

const Y = new THREE.Vector3(0, 1, 0);
const approach = (cur: number, to: number, step: number): number => cur + Math.sign(to - cur) * Math.min(Math.abs(to - cur), step);
const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** The hut's frame: logs and roof and chimney (y0 is the cabin's floor above the hut's feet when its legs are straight). */
const Y0 = 1.5;
const FZ = -1.42;
/** Where each leg meets the cabin, in the hut's own frame. */
const HIP = { x: 0.8, y: Y0 - 0.25, z: 0.25 };
/** The leg: hip to knee, knee to ankle (the shank bends back, the toes point forward). */
const THIGH = { y: -0.47, z: -0.67 };
const SHANK = { y: -0.7, z: 0.54 };

export interface StageMaker {
  mesh(p: Paint, parent: THREE.Object3D, mat?: THREE.Material): THREE.Mesh;
  mat<T extends THREE.Material>(m: T): T;
  geo(g: THREE.BufferGeometry): THREE.BufferGeometry;
}

export class StageLook {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly cabin: THREE.Mesh;
  private readonly door: THREE.Mesh;
  private readonly witch: THREE.Mesh;
  private readonly arm: THREE.Mesh;
  private readonly legs: { thigh: THREE.Group; shank: THREE.Group; s: number }[] = [];
  private readonly disc: THREE.Mesh;
  private readonly hole: THREE.Mesh;
  private readonly bars: THREE.Mesh[] = [];
  private readonly wheel: THREE.Mesh;
  private readonly lever: THREE.Mesh;
  private readonly head: THREE.Group;
  private readonly beam: THREE.Mesh;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly pools: THREE.InstancedMesh;
  private readonly poolMat: THREE.MeshBasicMaterial;
  private readonly pots: THREE.InstancedMesh;
  private readonly lamps: THREE.InstancedMesh;

  // what is eased from frame to frame
  private hx: number = DK.hut.x;
  private hz: number = DK.hut.z;
  private yaw = Math.PI / 2;
  private seen = false;
  private gait = 0;
  private walkK = 0;
  private crouch = 0;
  private doorA = 0;
  private armA = 0;
  private sit = 0;
  private tilt = 0;
  private discA = 0;
  private wheelA = 0;
  private leverA = -0.4;
  private barY: number[] = DK.bars.map(() => DK.barTop);
  private beamK = 0;
  private headYaw = 0;
  private headPitch = 0;
  private poolSeen: string[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private t = 0;

  constructor(make: StageMaker) {
    this.root.name = 'YagaStage';
    const LOG = 0x6a4a2c;
    const LOG2 = 0x7b5a3a;
    const END = 0xa98a5f;
    const LEG = 0xc9982e;

    // ---- the hut: the frame, seven rounds of logs crossing at the corners, the gables, the roof, a crooked chimney ----
    const p = new Paint();
    // (the inside: a dark box, open at the doorway, lit a little by the window)
    p.box(0x33241a, 0, Y0 + 1.0, 0.38, 2.85, 2.0, 1.7).box(0x1a110a, 0, Y0 + 0.02, -0.75, 2.6, 0.04, 0.7);
    for (let r = 0; r < 7; r++) {
      const y = Y0 + 0.15 + r * 0.285;
      for (const s of [-1, 1]) {
        // the front logs stop either side of the doorway (x -0.95..0.05) below its lintel
        if (s < 0 && y < Y0 + 1.66) {
          p.cyl(r % 2 ? LOG : LOG2, -1.33, y, s * 1.26, 0.15, 0.15, 0.76, 6, 0, 0, Math.PI / 2);
          p.cyl(r % 2 ? LOG : LOG2, 0.88, y, s * 1.26, 0.15, 0.15, 1.66, 6, 0, 0, Math.PI / 2);
        } else p.cyl(r % 2 ? LOG : LOG2, 0, y, s * 1.26, 0.15, 0.15, 3.4, 6, 0, 0, Math.PI / 2);
        p.cyl(r % 2 ? LOG2 : LOG, s * 1.46, y + 0.14, 0, 0.15, 0.15, 3.0, 6, Math.PI / 2);
        for (const e of [-1, 1]) p.cyl(END, e * 1.71, y, s * 1.26, 0.11, 0.11, 0.02, 6, 0, 0, Math.PI / 2);
      }
    }
    const gable = new THREE.CylinderGeometry(1, 1, 2.5, 3).rotateX(Math.PI / 2).rotateZ(Math.PI);
    p.put(gable, LOG, 0, Y0 + 2.0 + 0.5 * 0.9, 0, 0, 0, 0, 1.72, 0.9, 1);
    const rise = 1.5;
    const run = 1.85;
    const slope = Math.hypot(rise, run);
    const tiltR = Math.atan2(rise, run);
    for (const s of [-1, 1]) {
      p.box(0x3d3226, s * (run / 2), Y0 + 1.92 + rise / 2 + 0.06, 0, slope + 0.25, 0.1, 3.3, 0, 0, -s * tiltR);
      for (let i = 0; i < 4; i++) p.box(i % 2 ? 0x4a5a34 : 0x54452f, s * (run * (0.2 + i * 0.2)), Y0 + 1.92 + rise * (0.8 - i * 0.2) + 0.13, ((i * 7) % 5) * 0.3 - 0.6, 0.42, 0.05, 1.3, 0, 0, -s * tiltR);
    }
    p.cyl(LOG2, 0, Y0 + 1.92 + rise + 0.1, 0, 0.09, 0.09, 3.6, 6, Math.PI / 2);
    p.box(0x7a3b2e, 0.62, Y0 + 3.5, 0.45, 0.36, 1.1, 0.36, 0.2, 0.1, -0.28).box(0x33241a, 0.78, Y0 + 4.05, 0.5, 0.46, 0.1, 0.46, 0.2, 0.1, -0.28);
    // the door's frame and the little window's, on the front (-z)
    p.box(END, -0.45, Y0 + 1.62, FZ, 1.06, 0.1, 0.06).box(END, -0.95, Y0 + 0.85, FZ, 0.1, 1.6, 0.06).box(END, 0.05, Y0 + 0.85, FZ, 0.1, 1.6, 0.06);
    p.torus(END, 0.85, Y0 + 1.15, FZ, 0.25, 0.05, 0, 0, 0).box(END, 0.85, Y0 + 1.15, FZ, 0.5, 0.04, 0.04).box(END, 0.85, Y0 + 1.15, FZ, 0.04, 0.5, 0.04);
    p.box(LOG2, -0.45, Y0 - 0.06, FZ - 0.2, 1.1, 0.1, 0.45);
    p.rod(0x54452f, 1.5, Y0 + 0.4, FZ - 0.1, 1.62, Y0 + 2.0, FZ - 0.2, 0.03).ball(0xe6e0cc, 1.63, Y0 + 2.1, FZ - 0.2, 0.13, 1, 1.1, 1.1, 6);
    // the underside: a feathered belly between the hips
    p.ball(0x8a6a3a, 0, Y0 - 0.12, 0.2, 0.75, 1.6, 0.35, 1.2, 8);
    this.root.add(this.body);
    this.cabin = make.mesh(p, this.body);

    // ---- the legs: a feathered thigh from the hip to the knee, the shank back to the ankle, three toes and a spur ----
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * HIP.x, HIP.y, HIP.z);
      this.body.add(thigh);
      make.mesh(new Paint().ball(0x8a6a3a, 0, 0.05, 0, 0.3, 1, 1.3, 1, 7).rod(LEG, 0, 0, 0, 0, THIGH.y, THIGH.z, 0.16, 0.11).ball(LEG, 0, THIGH.y, THIGH.z, 0.15, 1, 1, 1, 6), thigh);
      const shank = new THREE.Group();
      shank.position.set(0, THIGH.y, THIGH.z);
      thigh.add(shank);
      const f = new Paint().rod(LEG, 0, 0, 0, 0, SHANK.y, SHANK.z, 0.115, 0.095);
      for (const a of [-0.55, 0, 0.55]) f.rod(LEG, 0, SHANK.y, SHANK.z - 0.02, Math.sin(a) * 0.72, SHANK.y - 0.04, SHANK.z - 0.02 - Math.cos(a) * 0.72, 0.085, 0.03, 5);
      f.rod(LEG, 0, SHANK.y, SHANK.z, 0, SHANK.y - 0.04, SHANK.z + 0.36, 0.05, 0.02, 5);
      make.mesh(f, shank);
      this.legs.push({ thigh, shank, s });
    }

    // ---- its door: planks, two iron straps, hinged on its left edge ----
    this.door = make.mesh(new Paint().box(0x8a2f22, 0.44, 0.74, 0, 0.88, 1.48, 0.06).box(0x2b2f36, 0.44, 0.35, -0.035, 0.88, 0.07, 0.02).box(0x2b2f36, 0.44, 1.15, -0.035, 0.88, 0.07, 0.02).torus(0xb08a3a, 0.74, 0.74, -0.05, 0.05, 0.014), this.body);
    this.door.position.set(-0.89, Y0 + 0.1, FZ - 0.03);

    // ---- Lyudmila Markovna in the doorway: layered skirts, a shawl, her headscarf, the long hooked nose ----
    // (lighter than the costume her body wears elsewhere: she stands in a dark doorway)
    const DULL = 0xb8402e;
    const BROWN = 0x8a6040;
    const SALLOW = 0xc4c6a4;
    const w = new Paint();
    w.cyl(0x6b5a2e, 0, 0.3, 0, 0.36, 0.42, 0.6, 10).cyl(DULL, 0, 0.75, 0, 0.3, 0.36, 0.4, 10).cyl(BROWN, 0, 1.08, 0, 0.22, 0.3, 0.36, 10);
    w.put(new THREE.ConeGeometry(0.36, 0.42, 4, 1, true).rotateX(Math.PI), BROWN, 0, 1.12, -0.06, 0, Math.PI / 4, 0, 1, 1, 0.5);
    w.ball(SALLOW, 0, 1.42, -0.04, 0.15, 1, 1.08, 1, 8).ball(DULL, 0, 1.46, 0.0, 0.18, 1, 1.08, 1, 10).ball(0x5a1c16, 0, 1.55, 0.0, 0.16, 1, 0.5, 1, 8);
    w.rod(SALLOW, 0, 1.42, -0.17, 0, 1.38, -0.38, 0.045, 0.03, 6).rod(SALLOW, 0, 1.38, -0.38, 0, 1.28, -0.42, 0.03, 0.008, 6);
    for (const s of [-1, 1]) w.rod(0xb9b9b4, s * 0.13, 1.44, -0.1, s * 0.17, 1.2, -0.09, 0.025, 0.006, 4).ball(0x111111, s * 0.06, 1.47, -0.15, 0.025, 1, 1, 1, 5);
    this.witch = make.mesh(w, this.body);
    // (bent under the lintel: a small old woman in a low doorway)
    this.witch.position.set(-0.45, Y0 + 0.02, FZ + 0.32);
    this.witch.scale.setScalar(0.86);

    // ---- her arm and broom, out of the little window (it sweeps; it throws the pots) ----
    const a = new Paint().rod(BROWN, 0, 0, 0, 0, 0, -0.55, 0.07, 0.06).ball(SALLOW, 0, 0, -0.58, 0.07, 1, 1, 1, 6);
    a.rod(0x7b5a3a, 0, 0.6, -0.6, 0, -1.4, -0.62, 0.03).put(new THREE.ConeGeometry(0.22, 0.65, 7, 1, true), 0xa98a5f, 0, -1.45, -0.62).cyl(0x4d3725, 0, -1.15, -0.62, 0.07, 0.09, 0.08, 7);
    this.arm = make.mesh(a, this.body);
    this.arm.position.set(0.85, Y0 + 1.15, FZ - 0.02);

    // ---- the revolve's disc of darker boards, with the revolve's own trap chalked in its middle ----
    const d = new Paint().cyl(0x2a1d14, 0, 0, 0, 3, 3, 0.02, 40);
    for (let i = 0; i < 6; i++) d.box(0x6a4a2c, 0, 0.012, 0, 5.96, 0.006, 0.03, (i * Math.PI) / 6);
    for (const s of [-1, 1]) d.box(0xf2f2ea, s * 0.8, 0.014, 0, 0.05, 0.004, 1.65).box(0xf2f2ea, 0, 0.014, s * 0.8, 1.65, 0.004, 0.05);
    d.box(0xf2f2ea, 1.05, 0.014, -0.5, 0.1, 0.004, 0.1).cyl(0xb08a3a, 0, 0, 0, 0.16, 0.16, 0.03, 12);
    this.disc = make.mesh(d, this.root);
    this.disc.position.set(DK.hut.x, DK.stageTop, DK.hut.z);

    // ---- the open trap: a black square and its door hanging down into the trap room ----
    this.hole = make.mesh(new Paint().box(0x020202, 0, 0.006, 0, 1.6, 0.012, 1.6).box(0x7b5a3a, 0, -0.75, 0.78, 1.55, 1.5, 0.06), this.root);
    this.hole.visible = false;

    // ---- the three fly bars: a pipe across the stage with a rolled painted sky, the sandbags, a rolled painted moon; their lines up into the dark ----
    DK.bars.forEach((_, i) => {
      const b = new Paint().cyl(0x2b2f36, 0, 0, 0, 0.05, 0.05, 24, 6, Math.PI / 2);
      for (const z of [-10, 0, 10]) b.box(0xd8d0bc, 0, 4, z, 0.025, 8, 0.025);
      if (i === 1) for (let k = 0; k < 7; k++) b.ball(0x8a7550, 0, -0.32, -9 + k * 3, 0.26, 1, 1.4, 1, 6).box(0xd8d0bc, 0, -0.08, -9 + k * 3, 0.02, 0.2, 0.02);
      else b.cyl(i === 0 ? 0x23407a : 0xe8dfbf, 0, -0.18, 0, 0.17, 0.17, 23, 10, Math.PI / 2).cyl(i === 0 ? 0x16254a : 0xb7ab95, 0, -0.18, 0, 0.175, 0.175, 0.6, 10, Math.PI / 2);
      const m = make.mesh(b, this.root);
      m.position.set(DK.bars[i]!, DK.barTop, DK.axis);
      this.bars.push(m);
    });

    // ---- the winch's wheel (it turns the revolve), the pit's lever, the follow-spot's lamp ----
    const wh = new Paint().torus(0x2b2f36, 0, 0, 0, 0.6, 0.05, 0, Math.PI / 2, 0).cyl(0x2b2f36, 0, 0, 0, 0.1, 0.1, 0.3, 8, 0, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * Math.PI * 2;
      wh.rod(0x2b2f36, 0, 0, 0, 0, Math.sin(an) * 0.58, Math.cos(an) * 0.58, 0.025).rod(0xb3261e, -0.04, Math.sin(an) * 0.62, Math.cos(an) * 0.62, -0.22, Math.sin(an) * 0.66, Math.cos(an) * 0.66, 0.03);
    }
    this.wheel = make.mesh(wh, this.root);
    this.wheel.position.set(DK.southWing.x1 - 1.2, DK.stageTop + 1.15, DK.winch.z);
    this.lever = make.mesh(new Paint().cyl(0x2b2f36, 0, 0, 0, 0.08, 0.08, 1.2, 8, Math.PI / 2).rod(0x59626e, 0, 0, 0, 0, 1.1, 0, 0.05).box(0x101216, 0, 1.0, 0, 0.1, 0.3, 0.1).ball(0xb3261e, 0, 1.2, 0, 0.1), this.root);
    this.lever.position.set(DK.pit.x0 + 0.3, 0.45, DK.trapLever.z);
    this.head = new THREE.Group();
    this.head.position.set(DK.spot.x + 1.2, 1.6, DK.spot.z);
    this.root.add(this.head);
    make.mesh(new Paint().cyl(0x2b2f36, 0, 0, -0.1, 0.2, 0.24, 0.9, 10, Math.PI / 2).cyl(0xfff2c8, 0, 0, -0.56, 0.17, 0.17, 0.02, 10, Math.PI / 2).box(0x2b2f36, 0, -0.12, 0.3, 0.06, 0.06, 0.3).box(0x59626e, 0, 0.26, 0, 0.04, 0.12, 0.5), this.head);
    // the beam: a long pale cone from the lamp to her (only while the spot is on her)
    this.beamMat = make.mat(new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam = new THREE.Mesh(make.geo(new THREE.CylinderGeometry(2, 0.2, 1, 16, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2)), this.beamMat);
    this.beam.visible = false;
    this.root.add(this.beam);

    // ---- the frost pools: pale discs on the floor where a pot came down ----
    this.poolMat = make.mat(new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.pools = new THREE.InstancedMesh(make.geo(new THREE.CircleGeometry(YAGA.pot.r, 20).rotateX(-Math.PI / 2)), this.poolMat, 4);
    this.pools.count = 0;
    this.pools.frustumCulled = false;
    this.root.add(this.pools);
    // her pots in the air: a round clay pot, its lid tied down
    const pot = new Paint().ball(0x8a4a2a, 0, 0, 0, 0.2, 1, 0.9, 1, 8).cyl(0x5a3020, 0, 0.16, 0, 0.11, 0.13, 0.06, 8).ball(0x9fdcff, 0, 0.21, 0, 0.06, 1, 1, 1, 5);
    this.pots = new THREE.InstancedMesh(make.geo(pot.build()), (this.cabin.material as THREE.Material), 3);
    this.pots.count = 0;
    this.pots.frustumCulled = false;
    this.root.add(this.pots);
    // a lamp at each machine, and the hut's little window lit from inside
    this.lamps = new THREE.InstancedMesh(make.geo(new THREE.SphereGeometry(0.12, 8, 6)), make.mat(new THREE.MeshBasicMaterial({ color: 0xffffff })), 6);
    this.lamps.frustumCulled = false;
    this.lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(18), 3);
    this.root.add(this.lamps);
    const at = [
      [DK.southWing.x1 - 0.65, DK.stageTop + 1.95, DK.winch.z],
      [DK.pit.x0 + 0.18, 1.6, DK.trapLever.z + 0.5],
      [DK.flyRail.x + 0.7, DK.galleryTop + 2.2, DK.northWing.z0 + 0.3],
      [DK.spot.x + 1.2, 2.0, DK.spot.z],
    ];
    at.forEach(([x, y, z], i) => {
      this.m.makeTranslation(x!, y!, z!);
      this.lamps.setMatrixAt(i, this.m);
    });
  }

  /** The hut sits in its place for a run's first frame (no easing from wherever it last stood). */
  reset(): void {
    this.hx = DK.hut.x;
    this.hz = DK.hut.z;
    this.yaw = Math.PI / 2;
    this.seen = false;
    this.doorA = this.armA = this.sit = this.tilt = this.discA = this.wheelA = this.beamK = this.crouch = this.walkK = 0;
    this.leverA = -0.4;
    this.barY = DK.bars.map(() => DK.barTop);
    this.poolSeen = [];
  }

  /**
   * One frame (only while the theatre is in sight). `st`, `pa`, `pb`: the stage's state (`StoryView`); `y`: her body
   * while she stands (null once she is down, or before she is placed); `down`: she is down for good;
   * `pots`: her pots in the air where this screen runs the fight (empty on a guest's).
   * Returns the pools that came down since the last frame (for a splash and a sound).
   */
  update(dt: number, st: number, pa: number, pb: number, y: Zombie | null, down: boolean, pots: readonly { x0: number; z0: number; x1: number; z1: number; k: number }[]): { x: number; z: number }[] {
    this.t += dt;
    const t = this.t;
    const k = (rate: number): number => Math.min(1, dt * rate);

    // ---- where the hut is, and how it walks ----
    if (y) {
      if (!this.seen) {
        this.hx = y.x;
        this.hz = y.z;
        this.yaw = y.yaw;
      }
      this.seen = true;
      const dx = y.x - this.hx;
      const dz = y.z - this.hz;
      const step = Math.hypot(dx, dz);
      this.hx = step > 4 ? y.x : this.hx + dx * k(14);
      this.hz = step > 4 ? y.z : this.hz + dz * k(14);
      this.yaw = wrap(this.yaw + wrap(y.yaw - this.yaw) * k(12));
      const speed = step / Math.max(dt, 1e-3);
      this.walkK = approach(this.walkK, Math.min(1, speed / 1.5), dt * 4);
      this.gait += Math.min(step, 0.3) * 2.4;
      this.hideBody(y);
    } else this.walkK = approach(this.walkK, 0, dt * 3);
    const phase = Stage.phase(st);
    const act = Stage.act(st);
    const open = Stage.level(st) > 0;
    const pinned = Stage.pinned(st);
    const dizzy = Stage.spinning(st);
    const stunned = Stage.stunned(st);
    const B = this.body;
    const floor = hutFloor(this.hx, this.hz);
    // under the arch (x about -172) she crouches on her legs: the pelmet hangs there
    const arch = Math.max(0, 1 - Math.abs(this.hx + 172) / 2.6);
    this.crouch = approach(this.crouch, arch * 0.95, dt * 2.5);
    this.sit = approach(this.sit, down ? 1 : 0, dt * 1.4);
    const stamp = act === ACT.stomp || act === ACT.rage ? Math.max(0, Math.sin(t * 9)) * 0.35 : 0;
    const bob = Math.abs(Math.sin(this.gait)) * 0.1 * this.walkK;
    const lower = this.crouch + this.sit * 1.0 + (pinned ? 0.45 : 0) + (stunned ? 0.25 : 0);
    B.position.set(this.hx, floor - lower + bob + stamp, this.hz);
    this.tilt = approach(this.tilt, pinned ? 0.22 : down ? 0.08 : 0, dt * 1.5);
    B.rotation.set(0, this.yaw, 0, 'YXZ');
    B.rotateZ(this.tilt + (dizzy ? Math.sin(t * 7) * 0.07 : 0) + Math.sin(this.gait) * 0.03 * this.walkK);
    if (stunned) B.rotateX(Math.sin(t * 3) * 0.03);
    // the legs: a stride while it walks, folded as it crouches, sits or is pinned
    const fold = Math.min(1, lower / 1.2);
    for (const L of this.legs) {
      const sw = Math.sin(this.gait + (L.s > 0 ? 0 : Math.PI)) * 0.5 * this.walkK;
      L.thigh.rotation.x = sw - fold * 0.75;
      L.shank.rotation.x = fold * 1.25 + Math.max(0, -Math.sin(this.gait + (L.s > 0 ? 0 : Math.PI))) * 0.45 * this.walkK;
      L.thigh.rotation.z = (pinned && L.s > 0 ? 0.25 : 0) * L.s;
    }
    // the door: open while a window is, banging to when it shuts; open for good once she is down
    this.doorA = approach(this.doorA, open || down ? 1.9 : 0, dt * (open ? 5 : 3));
    this.door.rotation.y = this.doorA;
    // she shows in the doorway while it is open: shading her eyes from the spot, reeling, slumped once down
    this.witch.visible = this.doorA > 0.15;
    this.witch.rotation.set(down ? 0.5 : open ? Math.sin(t * 4) * 0.08 : 0, 0, dizzy ? Math.sin(t * 6) * 0.25 : 0);
    // the broom out of the little window: raised in a wind-up, round in the sweep, a pot in the hand to throw
    const armTo = act === ACT.sweep ? 1.6 : act === ACT.pot ? 2.2 : act === ACT.call ? 2.6 : down ? -0.2 : 0.2;
    this.armA = approach(this.armA, armTo, dt * (act === ACT.sweep ? 2.5 : 4));
    this.arm.rotation.set(-this.armA * 0.6, act === ACT.sweep ? Math.sin(t * 10) * 0.9 : 0, 0);
    // (the broom is out only to sweep, to throw, to call them in)
    this.arm.visible = !down && (act === ACT.sweep || act === ACT.pot || act === ACT.call || this.armA > 0.6);

    // ---- the revolve turns while its winch does; the winch's wheel with it ----
    const rv = Stage.state(st, MACHINE.revolve);
    if (rv === MSTATE.running) {
      this.discA += dt * 4.5;
      this.wheelA += dt * 9;
    } else if (rv === MSTATE.winding) this.wheelA -= dt * 1.5;
    this.disc.rotation.y = this.discA;
    this.wheel.rotation.x = this.wheelA;

    // ---- the open trap, the pit's lever thrown while it is ----
    const tr = Stage.openTrap(st);
    this.hole.visible = tr >= 0;
    if (tr >= 0) this.hole.position.set(DK.traps[tr]!.x, DK.stageTop + (tr === 0 ? 0.03 : 0.005), DK.traps[tr]!.z);
    this.leverA = approach(this.leverA, Stage.state(st, MACHINE.trap) === MSTATE.running ? 0.7 : -0.4, dt * 4);
    this.lever.rotation.z = -this.leverA;

    // ---- the bars: the one let go falls (onto her roof if it caught her), and is hauled back up ----
    const bd = Stage.bar(st);
    DK.bars.forEach((x, i) => {
      const down2 = bd === i;
      const roof = stunned && Math.abs(this.hx - x) < 2.4 ? floor + Y0 + 3.4 - lower : DK.stageTop + 0.5;
      const to = down2 ? roof : DK.barTop;
      this.barY[i] = down2 ? approach(this.barY[i]!, to, dt * 14) : approach(this.barY[i]!, to, dt * 0.8);
      this.bars[i]!.position.y = this.barY[i]!;
    });

    // ---- the follow-spot: its lamp keeps on her; the beam while it is on ----
    const sx = DK.spot.x + 1.2;
    const sy = 1.6;
    const sz = DK.spot.z;
    const tx = this.hx;
    const ty = floor + Y0 + 1 - lower;
    const tz = this.hz;
    const wantYaw = Math.atan2(-(tx - sx), -(tz - sz));
    const wantPitch = Math.atan2(ty - sy, Math.hypot(tx - sx, tz - sz));
    this.headYaw = wrap(this.headYaw + wrap(wantYaw - this.headYaw) * k(4));
    this.headPitch += (wantPitch - this.headPitch) * k(4);
    this.head.rotation.set(this.headPitch, this.headYaw, 0, 'YXZ');
    const on = Stage.state(st, MACHINE.spot) === MSTATE.running && Stage.blind(st);
    this.beamK = approach(this.beamK, on ? 1 : 0, dt * 6);
    this.beam.visible = this.beamK > 0.01;
    if (this.beam.visible) {
      const len = Math.hypot(tx - sx, ty - sy, tz - sz);
      this.beam.position.set(sx, sy, sz);
      this.beam.lookAt(tx, ty, tz);
      this.beam.scale.set(1, 1, len);
      this.beamMat.opacity = (0.3 + Math.sin(t * 13) * 0.03) * this.beamK;
    }

    // ---- the frost pools, and the ones that just came down ----
    const pools = Stage.pools(pa, pb);
    const fresh: { x: number; z: number }[] = [];
    const keys = pools.map((q) => `${q.x},${q.z}`);
    for (const [i, q] of pools.entries()) if (!this.poolSeen.includes(keys[i]!)) fresh.push(q);
    this.poolSeen = keys;
    this.pools.count = pools.length;
    pools.forEach((q, i) => {
      const s = 0.92 + Math.sin(t * 3 + i) * 0.05;
      this.s.set(s, 1, s);
      this.p.set(q.x, hutFloor(q.x, q.z) + 0.05 + i * 0.004, q.z);
      this.m.compose(this.p, this.q.identity(), this.s);
      this.pools.setMatrixAt(i, this.m);
    });
    this.pools.instanceMatrix.needsUpdate = true;
    this.poolMat.opacity = 0.42 + Math.sin(t * 2.2) * 0.08;
    this.pots.count = Math.min(3, pots.length);
    for (let i = 0; i < this.pots.count; i++) {
      const q = pots[i]!;
      const f = Math.min(1, q.k);
      this.p.set(q.x0 + (q.x1 - q.x0) * f, 3.4 + Math.sin(f * Math.PI) * 3 - f * 3.2, q.z0 + (q.z1 - q.z0) * f);
      this.e.set(t * 7, t * 3, 0);
      this.m.compose(this.p, this.q.setFromEuler(this.e), this.s.set(1, 1, 1));
      this.pots.setMatrixAt(i, this.m);
    }
    this.pots.instanceMatrix.needsUpdate = true;

    // ---- the lamps at the machines, and the little window ----
    const hut = { x: this.hx, z: this.hz };
    for (let m = 0; m < 4; m++) {
      const s = Stage.state(st, m);
      let hex = 0x1a1a1a;
      let glow = 1;
      if (phase === 0 || down) hex = 0x1a1a1a;
      else if (s === MSTATE.running) hex = 0x4aa0ff;
      else if (s === MSTATE.winding) {
        hex = 0x7a4a10;
        glow = 0.6 + Math.sin(t * 6) * 0.3;
      } else if (!Stage.ready(st, m)) hex = 0xb01810;
      else if (catches(m as Machine, hut)) {
        hex = 0x30ff60;
        glow = 1.6 + Math.sin(t * 8) * 0.5;
      } else hex = 0xffa020;
      this.lamps.setColorAt(m, this.c.setHex(hex).multiplyScalar(glow));
    }
    this.p.set(0.85, Y0 + 1.15, FZ - 0.03).applyAxisAngle(Y, this.yaw);
    this.m.makeTranslation(B.position.x + this.p.x, B.position.y + this.p.y, B.position.z + this.p.z);
    this.lamps.setMatrixAt(4, this.m);
    this.lamps.setColorAt(4, this.c.setHex(0xffb866).multiplyScalar(down ? 0.05 : act === ACT.pot ? 2.4 : 1.2 + Math.sin(t * 9) * 0.2));
    // a lantern hung inside the doorway over her head (only while the door is open)
    this.p.set(-0.45, Y0 + 1.45, FZ + 0.45).applyAxisAngle(Y, this.yaw);
    this.m.makeTranslation(B.position.x + this.p.x, B.position.y + this.p.y, B.position.z + this.p.z);
    this.lamps.setMatrixAt(5, this.m);
    this.lamps.setColorAt(5, this.c.setHex(0xffc070).multiplyScalar(this.doorA > 0.15 ? 1.8 + Math.sin(t * 7) * 0.3 : 0));
    this.lamps.instanceMatrix.needsUpdate = true;
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
    return fresh;
  }

  /** Her own body is the Warden's under a hut: only the hut is drawn (her name stays, over the roof). */
  private hideBody(y: Zombie): void {
    const root = y.rig.root;
    let hid = HIDDEN.get(root);
    if (!hid) HIDDEN.set(root, (hid = []));
    root.traverse((o) => {
      if (o === root) return;
      if ((o as THREE.Sprite).isSprite) {
        o.position.y = 6.1 - y.y;
        return;
      }
      if ((o as THREE.Mesh).isMesh && o.visible) {
        o.visible = false;
        hid!.push(o);
      }
    });
  }
}

/** The parts of each body hidden under the hut (to be drawn again when the body is someone else's). */
const HIDDEN = new WeakMap<THREE.Object3D, THREE.Object3D[]>();

/** A body that was Baba Yaga's and is now someone else's (the pool hands bodies round): drawn again, name where it was. */
export function showBody(z: Zombie): void {
  const hid = HIDDEN.get(z.rig.root);
  if (!hid) return;
  for (const o of hid) o.visible = true;
  HIDDEN.delete(z.rig.root);
  z.rig.root.traverse((o) => {
    if ((o as THREE.Sprite).isSprite) o.position.y = z.def.height + 0.45;
  });
}
