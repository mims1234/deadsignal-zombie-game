/**
 * HIRASAKA: the climb and the finale drawn (every screen alike, from the story's state). `bosses.ts` owns one.
 *
 *   THE GIFTS       where the comb lands a ring of bamboo shoots up (the hags will not pass it, `director.ts` BAMBOO);
 *                   where grapes land, the bunch lies on the ground until the hags have eaten it.
 *   THE WINCHES     the three chain winches at the Chibiki-iwa: their drums turn with every turn of a handle, and each
 *                   chain runs taut from its drum to the rock, wherever the rock has got to.
 *   THE DEAD        the counted 1,500 massed on the Hell Stairs' landing below the rock while it is hauled: one figure
 *                   for every few still to come, swaying, thinning as they fall (one draw).
 *   ENDING 1        the ferry comes back at dawn, its lamps lit, in across the open sea under the summit's cliffs toward
 *                   the pier (the lighthouse is `look.ts`).
 *   ENDING 2        in the morning, spirit boats go out from the foot of the summit's cliffs for the named dead, a
 *                   lantern in each. (Both seen from the rock: the view turns that way, `bosses.ts`.)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BAMBOO, GRAPES } from './director';
import { ROCK, Y } from './places';
import { HirasakaStory, type StoryView } from './story';

const tmp = new THREE.Object3D();
/** The ferry's way in at dawn: out at sea beyond the summit, along under the cliffs toward the island's east end. */
const FERRY = { from: { x: -150, z: -240 }, to: { x: 110, z: -140 } };

/** One boat's plan extruded (bow toward +z), `len` long. */
function hull(len: number, beam: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-beam / 2, -len / 2);
  s.lineTo(beam / 2, -len / 2);
  s.lineTo(beam / 2, len * 0.2);
  s.quadraticCurveTo(beam / 2, len / 2, 0, len / 2);
  s.quadraticCurveTo(-beam / 2, len / 2, -beam / 2, len * 0.2);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, depth * 0.35, 0);
}

export class ClimbLook {
  readonly root = new THREE.Group();
  private readonly bamboo: { m: THREE.Mesh; t: number }[] = [];
  private readonly grapes: { m: THREE.Mesh; t: number }[] = [];
  private readonly drums: THREE.Mesh[] = [];
  private readonly drumAt: { x: number; z: number; yaw: number }[] = [];
  private readonly links: THREE.InstancedMesh;
  private readonly crowd: THREE.InstancedMesh;
  private readonly crowdAt: { x: number; z: number; ph: number }[] = [];
  private readonly ferry: THREE.Group;
  private readonly boats: THREE.InstancedMesh;
  private readonly lanterns: THREE.InstancedMesh;
  private readonly boatAt: { x: number; z: number; ph: number }[] = [];
  private roll = 0;
  private turn = 0;
  private t = 0;
  private endT = -1;

  constructor() {
    this.root.name = 'HirasakaClimb';
    // ---- the bamboo (a ring of stalks, grown up from nothing) and the grapes ----
    const stalks: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2 + (k % 3) * 0.05;
      const r = BAMBOO.r - 0.3 + (k % 2) * 0.5;
      const h = 4.5 + (k % 5) * 0.7;
      stalks.push(new THREE.CylinderGeometry(0.07, 0.1, h, 6).translate(Math.cos(a) * r, h / 2, Math.sin(a) * r).toNonIndexed());
      stalks.push(new THREE.ConeGeometry(0.5, 1.2, 5).translate(Math.cos(a) * r, h + 0.2, Math.sin(a) * r).toNonIndexed());
    }
    const bambooGeo = mergeGeometries(stalks)!;
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0x6a9a3a, roughness: 0.7, emissive: 0x1a2a0a, emissiveIntensity: 0.5 });
    const bunch: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 14; k++) bunch.push(new THREE.SphereGeometry(0.07, 6, 4).translate(Math.cos(k * 2.4) * 0.12 * (1 - k / 16), 0.4 - k * 0.022, Math.sin(k * 2.4) * 0.12 * (1 - k / 16)).toNonIndexed());
    const grapeGeo = mergeGeometries(bunch)!;
    const grapeMat = new THREE.MeshStandardMaterial({ color: 0x4a1a5a, roughness: 0.3, emissive: 0x2a0a3a, emissiveIntensity: 0.6 });
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(bambooGeo, bambooMat);
      m.visible = false;
      this.root.add(m);
      this.bamboo.push({ m, t: 0 });
      const g = new THREE.Mesh(grapeGeo, grapeMat);
      g.visible = false;
      this.root.add(g);
      this.grapes.push({ m: g, t: 0 });
    }

    // ---- the winches' drums (with their cranks) over the built ones, and their chains (one draw of links) ----
    const drumGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.46, 0.46, 1.42, 14).rotateX(Math.PI / 2).toNonIndexed(),
      new THREE.BoxGeometry(0.08, 0.7, 0.08).translate(0, 0.3, 0.86).toNonIndexed(),
      new THREE.BoxGeometry(0.08, 0.7, 0.08).translate(0, -0.3, -0.86).toNonIndexed(),
      new THREE.BoxGeometry(0.06, 0.06, 0.4).translate(0, 0.62, 1.0).toNonIndexed(),
      new THREE.BoxGeometry(0.06, 0.06, 0.4).translate(0, -0.62, -1.0).toNonIndexed(),
    ])!;
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.6, metalness: 0.5 });
    for (const w of ROCK.winches) {
      const ux = ROCK.rest.x - w.x;
      const uz = ROCK.rest.z - w.z;
      const d = Math.hypot(ux, uz);
      const x = w.x + (ux / d) * 1.7;
      const z = w.z + (uz / d) * 1.7;
      const yaw = Math.atan2(-uz / d, ux / d);
      const m = new THREE.Mesh(drumGeo, drumMat);
      m.position.set(x, Y.summit + 1.2, z);
      m.rotation.order = 'YZX';
      m.rotation.y = yaw;
      this.root.add(m);
      this.drums.push(m);
      this.drumAt.push({ x, z, yaw });
    }
    this.links = new THREE.InstancedMesh(new THREE.TorusGeometry(0.11, 0.035, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3a3634, roughness: 0.5, metalness: 0.7 }), 3 * 24);
    this.links.count = 0;
    this.links.frustumCulled = false;
    this.root.add(this.links);

    // ---- the dead massed on the landing (a figure: body, head, arms reaching) ----
    const fig = mergeGeometries([
      new THREE.CylinderGeometry(0.2, 0.26, 1.15, 6).translate(0, 0.62, 0).toNonIndexed(),
      new THREE.SphereGeometry(0.16, 6, 4).translate(0, 1.36, -0.03).toNonIndexed(),
      new THREE.BoxGeometry(0.09, 0.09, 0.6).translate(0.18, 1.08, -0.3).toNonIndexed(),
      new THREE.BoxGeometry(0.09, 0.09, 0.6).translate(-0.18, 1.08, -0.3).toNonIndexed(),
    ])!;
    this.crowd = new THREE.InstancedMesh(fig, new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.95, emissive: 0x0a0c10 }), 260);
    this.crowd.count = 0;
    this.crowd.frustumCulled = false;
    for (let k = 0; k < 260; k++) {
      // the landing's back half and the foot of the last flight, packed toward the stairs
      const r = Math.sqrt((k + 0.5) / 260);
      const a = k * 2.399;
      this.crowdAt.push({ x: -16 + Math.cos(a) * r * 20, z: 2 + Math.abs(Math.sin(a)) * r * 12 - 6 + (k % 7) * 0.2, ph: k * 0.37 });
    }
    this.root.add(this.crowd);

    // ---- the ferry (ending 1): hull, cabin, funnel; its lamps lit ----
    this.ferry = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.6 });
    const ferryBody = mergeGeometries([
      hull(22, 6, 2.6).toNonIndexed(),
      new THREE.BoxGeometry(4.4, 2.2, 9).translate(0, 2.1, -2).toNonIndexed(),
      new THREE.BoxGeometry(3.6, 1.6, 6).translate(0, 4, -2.5).toNonIndexed(),
      new THREE.CylinderGeometry(0.5, 0.6, 2.4, 8).translate(0, 5.6, -5).toNonIndexed(),
    ])!;
    this.ferry.add(new THREE.Mesh(ferryBody, hullMat));
    const lamps: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) lamps.push(new THREE.BoxGeometry(4.5, 0.35, 0.6).translate(0, 2.4, -5.6 + k * 1.4).toNonIndexed());
    lamps.push(new THREE.SphereGeometry(0.35, 8, 6).translate(0, 6.2, 6).toNonIndexed());
    this.ferry.add(new THREE.Mesh(mergeGeometries(lamps)!, new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: false })));
    this.ferry.visible = false;
    this.root.add(this.ferry);

    // ---- the spirit boats (ending 2): little boats of straw and paper, a lantern in each ----
    this.boats = new THREE.InstancedMesh(hull(1.6, 0.6, 0.35), new THREE.MeshStandardMaterial({ color: 0xc8b07a, roughness: 0.9, emissive: 0x3a2a10, emissiveIntensity: 0.5 }), 16);
    this.lanterns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8).translate(0, 0.55, 0), new THREE.MeshBasicMaterial({ color: 0xffc070, fog: false }), 16);
    for (let k = 0; k < 16; k++) this.boatAt.push({ x: -50 + k * 9 + Math.sin(k * 3.1) * 3, z: -160 - (k % 3) * 3, ph: k * 0.7 });
    this.boats.visible = this.lanterns.visible = false;
    this.boats.frustumCulled = this.lanterns.frustumCulled = false;
    this.root.add(this.boats, this.lanterns);
  }

  prewarm(): THREE.Object3D[] {
    return [this.bamboo[0]!.m, this.grapes[0]!.m, this.crowd, this.links, this.ferry, this.boats, this.lanterns];
  }

  reset(): void {
    for (const b of [...this.bamboo, ...this.grapes]) {
      b.t = 0;
      b.m.visible = false;
    }
    this.roll = this.turn = 0;
    this.endT = -1;
    this.ferry.visible = this.boats.visible = this.lanterns.visible = false;
    this.crowd.count = 0;
    this.links.count = 0;
  }

  /** A gift came down at (x, y, z). */
  landed(kind: string, x: number, y: number, z: number): void {
    const pool = kind === 'comb' ? this.bamboo : kind === 'grapes' ? this.grapes : null;
    if (!pool) return;
    const b = pool.reduce((a, c) => (a.t <= c.t ? a : c));
    b.t = kind === 'comb' ? BAMBOO.t : GRAPES.t;
    b.m.position.set(x, y, z);
    b.m.rotation.y = Math.random() * Math.PI;
    b.m.scale.set(1, kind === 'comb' ? 0.01 : 1, 1);
    b.m.visible = true;
  }

  update(dt: number, v: StoryView, cam: THREE.Camera, deep: boolean): void {
    this.t += dt;
    const t = this.t;
    // ---- the gifts ----
    for (const b of this.bamboo) {
      if (!b.m.visible) continue;
      b.t -= dt;
      // up in a moment, and down again as it withers at the end
      b.m.scale.y = Math.min(1, b.m.scale.y + dt * 2.5) * Math.min(1, Math.max(0.02, b.t / 1.2));
      b.m.rotation.z = Math.sin(t * 1.3) * 0.015;
      if (b.t <= 0) b.m.visible = false;
    }
    for (const g of this.grapes) {
      if (!g.m.visible) continue;
      g.t -= dt;
      g.m.scale.setScalar(Math.max(0.2, Math.min(1, g.t / GRAPES.t + 0.2)));
      if (g.t <= 0) g.m.visible = false;
    }
    // ---- the rock's winches ----
    const nearRock = !deep && Math.hypot(cam.position.x - ROCK.rest.x, cam.position.z - ROCK.rest.z) < 90;
    const goal = v.ending === 1 ? 1 : HirasakaStory.rock(v);
    this.roll += (goal - this.roll) * Math.min(1, dt * 3);
    this.turn += (v.cranks * 0.9 - this.turn) * Math.min(1, dt * 6);
    this.drums.forEach((d) => {
      d.visible = nearRock;
      d.rotation.z = -this.turn;
    });
    this.links.visible = nearRock && v.act >= 2;
    if (this.links.visible) {
      const sx = ROCK.rest.x + (ROCK.seal.x - ROCK.rest.x) * this.roll;
      const sz = ROCK.rest.z + (ROCK.seal.z - ROCK.rest.z) * this.roll;
      let n = 0;
      for (const w of this.drumAt) {
        // from the top of the drum to the rope round the rock (its near side, at its girth)
        const ax = w.x;
        const az = w.z;
        const ay = Y.summit + 1.66;
        const dx = sx - ax;
        const dz = sz - az;
        const d = Math.hypot(dx, dz);
        const bx = ax + (dx / d) * (d - 2.9);
        const bz = az + (dz / d) * (d - 2.9);
        const by = Y.summit + 2.2;
        const len = Math.hypot(bx - ax, by - ay, bz - az);
        const links = Math.min(24, Math.max(2, Math.floor(len / 0.26)));
        const yaw = Math.atan2(dx, dz);
        for (let k = 0; k < links; k++) {
          const f = (k + 0.5) / links;
          tmp.position.set(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f);
          tmp.rotation.set(0, yaw, (k % 2) * (Math.PI / 2));
          tmp.updateMatrix();
          this.links.setMatrixAt(n++, tmp.matrix);
        }
      }
      this.links.count = n;
      this.links.instanceMatrix.needsUpdate = true;
    }
    // ---- the dead massed below the rock, thinning as they fall ----
    const want = v.act === 2 && v.cranks > 0 && v.ending === 0 ? Math.min(260, Math.ceil(v.horde / 6)) : 0;
    this.crowd.visible = want > 0 && !deep;
    if (this.crowd.visible) {
      for (let k = 0; k < want; k++) {
        const c = this.crowdAt[k]!;
        tmp.position.set(c.x + Math.sin(t * 0.7 + c.ph) * 0.15, Y.landing, c.z + Math.sin(t * 0.5 + c.ph * 2) * 0.2);
        tmp.rotation.set(Math.sin(t * 1.3 + c.ph) * 0.08, Math.PI + Math.sin(c.ph) * 0.5, Math.sin(t * 0.9 + c.ph) * 0.06);
        tmp.updateMatrix();
        this.crowd.setMatrixAt(k, tmp.matrix);
      }
      this.crowd.count = want;
      this.crowd.instanceMatrix.needsUpdate = true;
    }
    // ---- the endings ----
    if (v.ending > 0 && this.endT < 0) this.endT = 0;
    if (this.endT >= 0) this.endT += dt;
    const e = this.endT;
    this.ferry.visible = v.ending === 1 && e > 2;
    if (this.ferry.visible) {
      // in from the open sea, along under the cliffs, round toward the pier
      const k = Math.min(1, (e - 2) / 11.5);
      const ease = 1 - (1 - k) * (1 - k);
      const x = FERRY.from.x + (FERRY.to.x - FERRY.from.x) * ease;
      const z = FERRY.from.z + (FERRY.to.z - FERRY.from.z) * ease;
      this.ferry.position.set(x, -0.9 + Math.sin(t * 0.8) * 0.15, z);
      this.ferry.rotation.set(Math.sin(t * 0.6) * 0.02, Math.atan2(FERRY.to.x - FERRY.from.x, FERRY.to.z - FERRY.from.z), Math.sin(t * 0.7) * 0.03);
    }
    const boats = v.ending === 2 && e > 5;
    this.boats.visible = this.lanterns.visible = boats;
    if (boats) {
      const out = (e - 5) * 2.4;
      this.boatAt.forEach((b, k) => {
        const z = b.z - Math.max(0, out - (k % 4) * 3);
        tmp.position.set(b.x + Math.sin(t * 0.3 + b.ph) * 1.5, -0.55 + Math.sin(t * 1.1 + b.ph) * 0.08, z);
        tmp.rotation.set(Math.sin(t + b.ph) * 0.05, Math.sin(b.ph) * 0.3, Math.sin(t * 0.8 + b.ph) * 0.06);
        // (twice their size: they are seen from the cliff top, far out)
        tmp.scale.setScalar(2);
        tmp.updateMatrix();
        this.boats.setMatrixAt(k, tmp.matrix);
        this.lanterns.setMatrixAt(k, tmp.matrix);
      });
      tmp.scale.setScalar(1);
      this.boats.instanceMatrix.needsUpdate = true;
      this.lanterns.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
