/**
 * ZARYA on screen: the obstacles a weapon to swing gets through (`obstacles.ts`), drawn from the story's state. Each is
 * drawn in its own frame (x along its face, +z out toward whoever comes to it, y up) at its spot, turned by its `yaw`:
 *
 *   padlock    the shed's plank door, a hasp and a padlock on it; broken, the door swings out and the padlock lies in the snow
 *   boards     planks nailed across a garage's mouth; chopped, their halves lie in front of it, stubs left at the nails
 *   barricade  two old doors, a pallet and planks nailed across the gap in the wall; chopped, it lies either side
 *   ice        a sheet of ice from sill to lintel under the burst pipe, icicles off it; chopped, its slabs lie on the floor
 *   lashing    frozen rope over a tent's shut flap, or over a tarpaulin pulled down on a stall; cut, the ends hang
 *
 * and the cache behind each (a tin, a strongbox, a box, the takings), drawn until this player has taken their share.
 *
 * Weak devices are bound by draw calls: every obstacle is one mesh shut and at most three open (what is left, a door,
 * the cache), all in one vertex-coloured material (`look.ts`'s `Paint`), the ice in a second; each hidden while the
 * camera is more than `FAR` from it.
 */
import * as THREE from 'three';
import { Paint } from './look';
import { OBSTACLES, obstacleOpen, type ObstacleDef } from './obstacles';
import type { StoryView } from './story';

const FAR = 70;
/** How long what is left takes to fall, and a door to swing. */
const FALL = 0.3;
const SWING = 0.7;

const WOOD = 0x7b5a3a;
const WOOD_DARK = 0x4d3725;
const WOOD_PALE = 0xa98a5f;
const IRON = 0x2b2f36;
const BRASS = 0xb08a3a;
const RED = 0xb3261e;
const BLUE = 0x2f4f8f;
const ROPE = 0xc8bfa4;
const FROST = 0xdfe8f2;
const CANVAS = 0x8a7d5e;
const TARP = 0x3f5a40;
const DARK = 0x101216;
const STEEL = 0x59626e;
const SNOW = 0xa9b6cc;
const ICE = 0xa8d0ec;

interface One {
  def: ObstacleDef;
  g: THREE.Group;
  shut: THREE.Mesh;
  left: THREE.Mesh | null;
  /** The shed's door: swings on its hinge. */
  leaf: THREE.Mesh | null;
  cache: THREE.Mesh | null;
  /** 0 shut .. 1 opened and fallen. */
  k: number;
  open: boolean;
}

/** A rope from a to b, sagging `sag` at its middle (three straight pieces), frost on it. */
function rope(p: Paint, ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag = 0.04): void {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2 - sag;
  const mz = (az + bz) / 2;
  p.rod(ROPE, ax, ay, az, mx, my, mz, 0.018).rod(ROPE, mx, my, mz, bx, by, bz, 0.018);
  p.ball(FROST, mx, my, mz, 0.03, 1, 1, 1, 5);
}

/** A plank across the face from (x0, y0) to (x1, y1), `z` out from it, with a nail head at each end. */
function plank(p: Paint, x0: number, y0: number, x1: number, y1: number, z: number, w = 0.18, color = WOOD_PALE): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  p.box(color, (x0 + x1) / 2, (y0 + y1) / 2, z, len, w, 0.035, 0, 0, Math.atan2(y1 - y0, x1 - x0));
  for (const [x, y] of [[x0, y0], [x1, y1]] as const) p.box(IRON, x + (x1 - x0) * 0.04, y + (y1 - y0) * 0.04, z + 0.02, 0.025, 0.025, 0.01);
}

function build(o: ObstacleDef): { shut: Paint; left: Paint | null; leaf: Paint | null } {
  const { w, h } = o;
  const shut = new Paint();
  const left = new Paint();
  let leaf: Paint | null = null;
  switch (o.kind) {
    case 'padlock': {
      // the door, made with its hinge at x = 0 (it hangs at the gap's west edge): boards, two ledges and a brace
      leaf = new Paint();
      for (let i = 0; i < 5; i++) leaf.box(i % 2 ? WOOD_DARK : 0x5a412b, 0.1 + i * 0.2, h / 2, 0, 0.19, h, 0.05);
      for (const y of [0.35, h - 0.35]) leaf.box(WOOD_DARK, w / 2, y, -0.045, w - 0.08, 0.12, 0.04);
      leaf.box(WOOD_DARK, w / 2, h / 2, -0.045, 0.1, h - 0.6, 0.035, 0, 0, Math.atan2(h - 0.7, w - 0.2) - Math.PI / 2);
      for (const y of [0.35, h - 0.35]) leaf.box(IRON, 0.18, y, 0.035, 0.34, 0.05, 0.015);
      // the hasp on the door, the staple on the post beyond its edge, and the padlock through them (shut)
      leaf.box(IRON, w - 0.1, 1.05, 0.04, 0.22, 0.06, 0.02);
      shut.box(IRON, w / 2 + 0.06, 1.05, 0.06, 0.05, 0.08, 0.03);
      shut.box(BRASS, w / 2 + 0.02, 0.93, 0.08, 0.12, 0.13, 0.05).torus(STEEL, w / 2 + 0.02, 1.02, 0.08, 0.04, 0.012, 0, 0, 0, Math.PI);
      // broken: the padlock and its staple in the snow at the foot of the post
      left.box(BRASS, 0.4, 0.04, 0.45, 0.12, 0.05, 0.13, 0.6).torus(STEEL, 0.47, 0.03, 0.52, 0.04, 0.012, Math.PI / 2, 0.6, 0, Math.PI);
      left.box(IRON, 0.25, 0.02, 0.62, 0.06, 0.03, 0.09, 1.1);
      break;
    }
    case 'boards': {
      // planks nailed over the mouth from outside: three across, two crossed, a short one, a painted warning
      const x0 = -w / 2;
      const x1 = w / 2;
      for (const [y, c] of [[0.45, WOOD_PALE], [1.25, WOOD], [2.0, WOOD_PALE]] as const) plank(shut, x0 - 0.1, y, x1 + 0.1, y + 0.04, 0.05, 0.2, c);
      plank(shut, x0 + 0.05, 0.2, x1 - 0.05, 2.15, 0.09, 0.16, WOOD);
      plank(shut, x0 + 0.05, 2.15, x1 - 0.05, 0.2, 0.12, 0.16, WOOD_PALE);
      plank(shut, x0 + 0.3, 1.65, x0 + 1.4, 1.62, 0.15, 0.22, 0x8f6d45);
      shut.box(RED, x0 + 0.85, 1.635, 0.17, 0.8, 0.06, 0.005);
      // between the planks, the dark inside
      shut.box(DARK, 0, h / 2, -0.02, w, h, 0.02);
      // chopped: stubs at the nails either side, the halves fallen in front
      for (const s of [-1, 1]) for (const y of [0.45, 1.25, 2.0]) left.box(WOOD_PALE, s * (w / 2 - 0.05), y, 0.05, 0.28, 0.2, 0.035, 0, 0, s * 0.2);
      for (let i = 0; i < 6; i++) {
        const x = -w / 2 + 0.4 + i * 0.55;
        left.box(i % 2 ? WOOD : WOOD_PALE, x, 0.03 + (i % 3) * 0.035, 0.6 + (i % 3) * 0.35, 1.3 + (i % 2) * 0.4, 0.035, 0.18, (i * 1.7) % 1.2 - 0.6);
      }
      break;
    }
    case 'barricade': {
      // two old doors stood in the gap (one blue, one brown, a knob on each), a pallet against them, planks across both faces
      for (const [x, c, t] of [[-0.78, BLUE, 0.05], [0.8, WOOD_DARK, -0.06]] as const) {
        shut.box(c, x, 1.05, t * 0.4, 0.82, 2.05, 0.05, 0, 0, t);
        shut.ball(BRASS, x + 0.3, 1.0, t * 0.4 + 0.05, 0.035).ball(BRASS, x + 0.3, 1.0, t * 0.4 - 0.05, 0.035);
      }
      // a sheet of corrugated iron over the top to the wall's height, an old shutter of boards stood at each side
      for (let i = 0; i < 9; i++) shut.box(i % 2 ? 0x6d7682 : 0x5d6470, -w / 2 + 0.18 + i * ((w - 0.36) / 8), 2.55, -0.02, 0.36, 0.95, 0.03);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) shut.box(i % 2 ? WOOD : WOOD_DARK, s * (w / 2 - 0.12 - i * 0.12), 1.1, 0.0, 0.12, 2.2, 0.04);
      for (let i = 0; i < 5; i++) shut.box(WOOD_PALE, -0.4 + i * 0.2, 0.62, 0.14, 0.1, 1.2, 0.03);
      for (const y of [0.15, 1.1]) shut.box(WOOD, 0, y, 0.17, 1.0, 0.1, 0.06);
      for (const z of [0.2, -0.12]) {
        plank(shut, -w / 2 - 0.15, 0.7, w / 2 + 0.15, 0.82, z, 0.2, WOOD_PALE);
        plank(shut, -w / 2 - 0.15, 1.75, w / 2 + 0.15, 1.62, z, 0.2, WOOD);
        plank(shut, -w / 2 - 0.1, 2.4, w / 2 + 0.1, 2.4, z, 0.18, WOOD_PALE);
      }
      plank(shut, -w / 2, 0.3, w / 2 - 0.2, 2.35, 0.24, 0.16, WOOD);
      shut.ball(SNOW, 0, 0, 0.35, 0.7, 2.2, 0.32, 0.8, 7).ball(SNOW, 0, 0, -0.35, 0.6, 2.2, 0.28, 0.7, 7);
      // chopped: the doors flat on the snow either side of the way, the pallet against the wall, planks about
      left.box(BLUE, -1.0, 0.04, 1.4, 0.82, 0.05, 2.05, 0.35);
      left.box(WOOD_DARK, 1.05, 0.04, -1.5, 0.82, 0.05, 2.05, -0.3);
      for (let i = 0; i < 5; i++) left.box(WOOD_PALE, -w / 2 - 0.35, 0.62, 0.3 + i * 0.03, 0.1, 1.2, 0.03, 0.2);
      for (let i = 0; i < 6; i++) left.box(i % 2 ? WOOD : WOOD_PALE, (i % 2 ? 1 : -1) * (1.2 + (i % 3) * 0.3), 0.03 + i * 0.02, (i % 2 ? -1 : 1) * (0.6 + i * 0.2), 1.6, 0.035, 0.2, i * 0.9);
      left.ball(SNOW, 0, 0, 0.9, 0.5, 2.6, 0.18, 0.7, 7).ball(SNOW, 0, 0, -0.9, 0.5, 2.6, 0.16, 0.7, 7);
      break;
    }
    case 'ice': {
      // the burst pipe over the lintel (in both states), with its split frozen white
      for (const p of [shut, left]) {
        p.rod(STEEL, -w / 2 - 0.6, h + 0.45, 0.35, w / 2 + 0.6, h + 0.45, 0.35, 0.09, 0.09, 8);
        p.ball(FROST, 0.3, h + 0.45, 0.35, 0.16, 1.4, 1, 1, 6);
      }
      // icicles still hanging off the pipe once the sheet is gone
      for (let i = 0; i < 9; i++) left.cyl(ICE, -0.9 + i * 0.25, h + 0.25 - (i % 3) * 0.06, 0.38, 0.04, 0, 0.3 + (i % 3) * 0.1, 5);
      // chopped: slabs of it on the floor either side of the sill
      for (let i = 0; i < 7; i++) left.box(ICE, -w / 2 + 0.3 + i * 0.42, 0.06 + (i % 2) * 0.05, (i % 2 ? 0.7 : -0.7) + (i % 3) * 0.2, 0.5 + (i % 3) * 0.2, 0.12, 0.45, 0, i * 0.7, (i % 2) * 0.3);
      break;
    }
    case 'lashing': {
      if (o.id === 'tent') {
        // the tent's flap, shut and leaning with the canvas, laced to the pegs with frozen rope
        const lean = 0.51;
        const fy = 0.62;
        const tilt = (y: number): number => -(y - fy) * Math.tan(lean);
        shut.put(new THREE.BoxGeometry(0.7, 1.2, 0.03), CANVAS, 0, fy, 0.02, -lean);
        for (let i = 0; i < 4; i++) {
          const y = 0.2 + i * 0.28;
          rope(shut, -0.36, y, 0.06 + tilt(y), 0.36, y + 0.14, 0.06 + tilt(y + 0.14), 0.01);
        }
        rope(shut, -0.34, 0.12, 0.08 + tilt(0.12), 0.34, 1.05, 0.08 + tilt(1.05), 0.02);
        rope(shut, 0.34, 0.12, 0.08 + tilt(0.12), -0.34, 1.05, 0.08 + tilt(1.05), 0.02);
        for (const s of [-1, 1]) shut.box(WOOD_DARK, s * 0.42, 0.08, 0.25, 0.04, 0.2, 0.04);
        // cut: the doorway open and dark, the flap thrown back, the rope ends hanging from the pegs
        left.put(new THREE.BoxGeometry(0.62, 1.15, 0.02), DARK, 0, fy, 0.01, -lean);
        left.put(new THREE.BoxGeometry(0.4, 1.1, 0.03), CANVAS, 0.5, fy, 0.03, -lean, 0, 0.12);
        for (const s of [-1, 1]) {
          left.box(WOOD_DARK, s * 0.42, 0.08, 0.25, 0.04, 0.2, 0.04);
          rope(left, s * 0.42, 0.16, 0.26, s * 0.55, 0.02, 0.45, 0.01);
        }
      } else {
        // the felt-boot stall: a tarpaulin pulled down over the table and its goods, roped to the legs
        const zc = -1.0;
        shut.box(TARP, 0, 1.3, zc, 4.0, 0.06, 1.5);
        for (const s of [-1, 1]) shut.box(TARP, 0, 0.95, zc + s * 0.77, 4.0, 0.7, 0.04);
        for (const s of [-1, 1]) shut.box(TARP, s * 2.01, 0.95, zc, 0.04, 0.7, 1.5);
        shut.ball(SNOW, 0, 1.33, zc, 1.6, 1.15, 0.08, 0.4, 7);
        for (const x of [-1.5, -0.5, 0.5, 1.5]) {
          rope(shut, x, 1.36, zc + 0.78, x, 1.36, zc - 0.78, 0);
          rope(shut, x, 1.33, zc + 0.8, x + 0.05, 0.55, zc + 0.82, 0);
          rope(shut, x, 1.33, zc - 0.8, x + 0.05, 0.55, zc - 0.82, 0);
        }
        rope(shut, -2.03, 1.0, zc + 0.8, 2.03, 1.0, zc + 0.8, 0.05);
        // cut: the tarpaulin hauled back off the far side in a heap, rope ends hanging from the legs
        left.ball(TARP, 0, 0.2, zc - 1.25, 1.2, 1.6, 0.35, 0.45, 7);
        left.ball(SNOW, 0, 0.42, zc - 1.25, 1.0, 1.5, 0.12, 0.4, 7);
        for (const x of [-1.5, 0.5, 1.5]) rope(left, x + 0.05, 0.55, zc + 0.82, x + 0.1, 0.1, zc + 0.95, 0.01);
      }
      break;
    }
  }
  return { shut, left, leaf };
}

/** The cache behind obstacle `o`, at its own spot (made about its foot). */
function cachePaint(o: ObstacleDef): Paint | null {
  if (!o.cache) return null;
  const p = new Paint();
  switch (o.id) {
    case 'shed':
      // his cash tin and two boxes of cartridges, on an upturned crate
      p.box(WOOD_PALE, 0, 0.2, 0, 0.5, 0.4, 0.4).box(RED, 0, 0.47, 0, 0.3, 0.12, 0.2).box(BRASS, 0, 0.5, 0.105, 0.05, 0.04, 0.01);
      for (const s of [-1, 1]) p.box(0x3c6f8a, s * 0.17, 0.44, -0.08, 0.12, 0.08, 0.16);
      break;
    case 'garage':
      // a steel strongbox on the floor, a bag beside it
      p.box(0x46505e, 0, 0.2, 0, 0.6, 0.4, 0.4).box(IRON, 0, 0.41, 0, 0.62, 0.04, 0.42).box(BRASS, 0, 0.25, 0.205, 0.08, 0.1, 0.01);
      p.ball(0x6b5a3a, -0.5, 0.15, 0.05, 0.2, 1, 0.8, 1, 6);
      break;
    case 'tent':
      // his box and his flask, in the mouth of the flap
      p.box(STEEL, 0, 0.17, 0.3, 0.5, 0.3, 0.3).box(WOOD_DARK, 0, 0.33, 0.3, 0.5, 0.025, 0.06);
      p.cyl(0x3c6f8a, 0.33, 0.14, 0.42, 0.05, 0.05, 0.28, 8);
      break;
    case 'stall':
      // the cash box on the front of the table, and a box of cartridges under the counter's lip
      p.box(0x46505e, -0.6, 0.97, -0.55, 0.36, 0.18, 0.26).box(BRASS, -0.6, 0.98, -0.415, 0.06, 0.06, 0.01);
      p.box(0x3c6f8a, 0.2, 0.93, -0.5, 0.16, 0.1, 0.2);
      break;
  }
  return p;
}

export class ObstacleLook {
  readonly root = new THREE.Group();
  private readonly list: One[] = [];
  private readonly paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 });
  private readonly ice = new THREE.MeshStandardMaterial({ color: ICE, emissive: 0x3a78b0, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 });
  private readonly geos: THREE.BufferGeometry[] = [];
  private snap = true;

  constructor() {
    this.root.name = 'ZaryaObstacles';
    for (const def of OBSTACLES) {
      const g = new THREE.Group();
      g.position.set(def.at.x, 0, def.at.z);
      g.rotation.y = def.yaw;
      this.root.add(g);
      const parts = build(def);
      const shut = this.mesh(parts.shut, g);
      if (def.kind === 'ice') {
        // the sheet itself, in the ice's own material: sill to lintel, thicker at the foot, a frozen bulge, icicles
        const p = new Paint();
        p.box(ICE, 0, def.h / 2, 0, def.w, def.h, 0.32);
        p.ball(ICE, 0, 0.5, 0.12, 0.9, 1.4, 0.6, 0.35, 8).ball(ICE, 0.4, 1.9, 0.14, 0.5, 1.2, 1.8, 0.3, 7);
        for (let i = 0; i < 11; i++) p.cyl(ICE, -def.w / 2 + 0.2 + i * 0.26, def.h - 0.15 - (i % 3) * 0.1, 0.2, 0.05, 0, 0.5 + (i % 4) * 0.15, 5);
        for (let i = 0; i < 6; i++) p.cyl(ICE, -def.w / 2 + 0.3 + i * 0.5, def.h + 0.15, 0.38, 0.05, 0, 0.5, 5);
        const sheet = this.mesh(p, shut, this.ice);
        sheet.position.set(0, 0, 0);
      }
      const left = parts.left ? this.mesh(parts.left, g) : null;
      let leaf: THREE.Mesh | null = null;
      if (parts.leaf) {
        leaf = this.mesh(parts.leaf, g);
        leaf.position.set(-def.w / 2, 0, 0.03);
      }
      const cp = cachePaint(def);
      let cache: THREE.Mesh | null = null;
      if (cp && def.cache) {
        cache = this.mesh(cp, this.root);
        cache.position.set(def.cache.at.x, 0, def.cache.at.z);
        cache.rotation.y = def.yaw;
      }
      this.list.push({ def, g, shut, left, leaf, cache, k: 0, open: false });
    }
  }

  private mesh(p: Paint, parent: THREE.Object3D, mat: THREE.Material = this.paint): THREE.Mesh {
    const geo = p.build();
    this.geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** A new run: everything shut, nothing caught half way. */
  reset(): void {
    this.snap = true;
  }

  /** `taken`: the caches this player has had their share of. */
  update(dt: number, v: StoryView, cam: THREE.Vector3, taken: ReadonlySet<number>): void {
    const snap = this.snap;
    this.snap = false;
    this.list.forEach((o, i) => {
      const near = Math.abs(o.def.at.x - cam.x) < FAR && Math.abs(o.def.at.z - cam.z) < FAR;
      o.g.visible = near;
      const open = obstacleOpen(v, i);
      if (open !== o.open) {
        o.open = open;
        if (!open || snap || !near) o.k = open ? 1 : 0;
      }
      if (open && o.k < 1) o.k = Math.min(1, o.k + dt / Math.max(FALL, o.leaf ? SWING : FALL));
      o.shut.visible = !open;
      if (o.left) {
        o.left.visible = open;
        o.left.position.y = (1 - Math.min(1, o.k * (o.leaf ? SWING / FALL : 1))) * 0.5;
      }
      if (o.leaf) {
        const e = 1 - (1 - o.k) * (1 - o.k);
        o.leaf.rotation.y = -1.75 * e;
      }
      if (o.cache) o.cache.visible = near && open && !taken.has(i);
    });
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.paint.dispose();
    this.ice.dispose();
    this.root.removeFromParent();
  }
}
