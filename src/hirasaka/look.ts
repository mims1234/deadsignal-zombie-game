/**
 * HIRASAKA's moving and story-dependent things, drawn from the story's state every frame (`runtime.ts` calls `update`):
 * the sea rising on the climb (over the island and through the deep), the cage in its shaft and its wreck, the
 * umibōzu's stand-in shape out past the seawall, the Chibiki-iwa hauled across the head of the Hell Stairs, the things
 * to find (placeholders until `arms` / the look-book give them real models), the village's doors, the revived tree's
 * peaches, the thrown gifts and their wards, the lighthouse's beam at dawn, the headlamp, and the people in the Root
 * Hall's tree (baked once).
 *
 * Everything is built once when the level loads (`prewarm`) and only shown, moved or hidden after that.
 */
import * as THREE from 'three';
import { VILLAGE_HOUSES } from '../world/layout/hirasakaVillage';
import { hordeModel } from '../anime/cast';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AnimeBody, type AnimeTint } from '../anime/vrm';
import { BAMBOO, WARD } from './director';
import { CAGE, COMB, DEEP, DEEP_SPOTS, DEEP_Y, HIRASAKA, ISLAND, JOBS, LADLES, PHOTOS, ROCK, ROOT_PEOPLE, ROOT_TREE, SEA_Y, TAPES, UMIBOZU, rootTrunkR, type Spot } from './places';
import { HirasakaStory, type StoryView } from './story';


/**
 * Part of a mesh (an index range) as plain static geometry moved by `world`: position, normal and uv only, indexed (the
 * rest pose of a skinned mesh is its geometry as stored, so this is the body as it stands at rest).
 */
function bakePart(src: THREE.BufferGeometry, start: number, count: number, world: THREE.Matrix4): THREE.BufferGeometry | null {
  const pos = src.attributes.position;
  if (!pos) return null;
  const idx = src.index;
  const n = idx ? idx.count : pos.count;
  const from = Math.max(0, start);
  const to = Math.min(n, from + (Number.isFinite(count) ? count : n));
  if (to <= from) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos.clone());
  g.setAttribute('normal', src.attributes.normal ? src.attributes.normal.clone() : pos.clone());
  g.setAttribute('uv', src.attributes.uv ? src.attributes.uv.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  const out = new Uint32Array(to - from);
  for (let i = from; i < to; i++) out[i - from] = idx ? idx.getX(i) : i;
  g.setIndex(new THREE.BufferAttribute(out, 1));
  g.applyMatrix4(world);
  if (!src.attributes.normal) g.computeVertexNormals();
  return g;
}

/** The people the Root Hall's tree holds: the island's own faces, grey as the bark, eyes shut. */
const ROOT_TINT: AnimeTint = { key: 'hs-roots', skin: 0xe0d2c4, cloth: 0x8a7a6c, hair: 0x5a4c44, eyes: null, outlines: false };

/** Foam streaks on dark water (a small canvas, tiled across the surge). */
function foamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#3a5a5c';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * 0.5 + 0.15;
    x.strokeStyle = `rgba(220,236,236,${a.toFixed(2)})`;
    x.lineWidth = 0.6 + Math.random() * 2;
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    x.beginPath();
    x.moveTo(px, py);
    x.bezierCurveTo(px + 10, py + Math.random() * 6 - 3, px + 20, py + Math.random() * 8 - 4, px + 28 + Math.random() * 30, py + Math.random() * 6 - 3);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class IslandLook {
  readonly root = new THREE.Group();
  /** The headlamp the squad wears in the deep (always in the scene: switching it on rebuilds no shader). */
  readonly headlamp = new THREE.SpotLight(0xfff0d8, 0, 34, 0.55, 0.45, 1.4);
  private readonly surge: THREE.Mesh;
  private readonly flood: THREE.Mesh;
  private readonly surgeMat: THREE.MeshStandardMaterial;
  /** (hs-bosses) the swells' clock. */
  private readonly swell = { value: 0 };
  private readonly foam: THREE.CanvasTexture;
  private readonly beam: THREE.Mesh;
  private readonly lamp: THREE.Mesh;
  private readonly cageTop: THREE.Group;
  private readonly cageBottom: THREE.Group;
  private readonly wreck: THREE.Group;
  private cageT = -1;
  private readonly umi: THREE.Mesh;
  private umiY = -30;
  /** The things to find: each a placeholder model, shown until the story says it is taken. */
  private readonly finds: { o: THREE.Object3D; at: Spot; gone: (v: StoryView) => boolean; spin: boolean }[] = [];
  /** (hs-bosses) the tree's peaches, one instanced draw (the five left once they are picked come first). */
  private readonly peaches: THREE.InstancedMesh;
  private readonly doors: THREE.Object3D[] = [];
  private doorsT = -1;
  private readonly stone: THREE.Mesh;
  private stoneRoll = 0;
  private readonly wards: { ring: THREE.Mesh; t: number }[] = [];
  private readonly thrown: { m: THREE.Mesh; vx: number; vy: number; vz: number; live: boolean; onLand: (x: number, y: number, z: number) => void }[] = [];
  private t = 0;
  private sea = SEA_Y;
  private deepSea = -9;
  private readonly fwd = new THREE.Vector3();
  /** The lighthouse's lamp is lit (at dawn, ending 1). */
  lit = false;
  /** The Root Hall's people, baked (`rootPeople`): drawn only near the tree. */
  private readonly people = new THREE.Group();
  private readonly peopleGeos: THREE.BufferGeometry[] = [];

  constructor() {
    this.root.name = 'HirasakaLook';
    // ---- the sea on the climb: over the island, and through the deep ----
    this.foam = foamTexture();
    this.surgeMat = new THREE.MeshStandardMaterial({ color: 0x2a4c50, map: this.foam, roughness: 0.12, metalness: 0.5, transparent: true, opacity: 0.93, emissive: 0x081a1c });
    // (hs-bosses) a storm sea, not a pond: long swells rolling in from the north, broken by a cross-sea (in the vertex
    // shader: no extra draw); the foam rides the crests
    this.surgeMat.onBeforeCompile = (sh) => {
      sh.uniforms.uSwell = this.swell;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uSwell;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 wp = modelMatrix * vec4(position, 1.0);
          transformed.y += sin(wp.z * 0.21 + uSwell * 1.7) * 0.55 + sin(wp.x * 0.13 - wp.z * 0.08 + uSwell * 1.1) * 0.4 + sin((wp.x + wp.z) * 0.6 + uSwell * 3.1) * 0.08;`,
        );
    };
    this.surge = new THREE.Mesh(new THREE.PlaneGeometry(ISLAND.x1 - ISLAND.x0 + 8, ISLAND.z1 - ISLAND.z0 + 8, 96, 48).rotateX(-Math.PI / 2), this.surgeMat);
    this.surge.position.set((ISLAND.x0 + ISLAND.x1) / 2, SEA_Y, (ISLAND.z0 + ISLAND.z1) / 2);
    this.surge.visible = false;
    this.flood = new THREE.Mesh(new THREE.PlaneGeometry(DEEP.x1 - DEEP.x0, DEEP.z1 - DEEP.z0).rotateX(-Math.PI / 2), this.surgeMat);
    this.flood.position.set((DEEP.x0 + DEEP.x1) / 2, -9, (DEEP.z0 + DEEP.z1) / 2);
    this.flood.visible = false;
    this.root.add(this.surge, this.flood);

    // ---- the lighthouse's lamp and beam (lit at dawn) ----
    const LH = HIRASAKA.lighthouse;
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshStandardMaterial({ color: 0x404040, emissive: 0xfff4d0, emissiveIntensity: 0 }));
    this.lamp.position.set(LH.x, 18 + 17.4, LH.z);
    this.root.add(this.lamp);
    const beamGeo = new THREE.CylinderGeometry(0.4, 6, 70, 18, 1, true).translate(0, -35, 0).rotateZ(Math.PI / 2);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: 'varying float vL; void main(){ vL = clamp(position.x / 70.0, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vL; void main(){ gl_FragColor = vec4(1.0, 0.95, 0.82, 0.2 * pow(1.0 - vL, 1.6)); }',
    });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.position.copy(this.lamp.position);
    this.beam.visible = false;
    this.root.add(this.beam);

    // ---- the cage: at the pithead, at the bottom of the shaft, and its wreck ----
    const cage = (): THREE.Group => {
      const c = new THREE.Group();
      const bar = new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.6, metalness: 0.7 });
      const geo = new THREE.BoxGeometry(0.08, 2.6, 0.08);
      for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4], [0, -1.4], [-1.4, 0], [1.4, 0]] as const) {
        const b = new THREE.Mesh(geo, bar);
        b.position.set(x, 1.3, z);
        c.add(b);
      }
      const floor = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 2.9), bar);
      const roof = floor.clone();
      roof.position.y = 2.65;
      c.add(floor, roof);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 20, 4), new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.8 }));
      cable.position.y = 12.7;
      c.add(cable);
      return c;
    };
    this.cageTop = cage();
    this.cageTop.position.set(CAGE.top.x, CAGE.top.y, CAGE.top.z - 4);
    this.cageBottom = cage();
    this.cageBottom.position.set(CAGE.bottom.x, CAGE.bottom.y, CAGE.bottom.z);
    this.wreck = cage();
    this.wreck.position.set(CAGE.bottom.x + 0.6, CAGE.bottom.y + 0.4, CAGE.bottom.z - 0.4);
    this.wreck.rotation.set(0.5, 0.4, 0.35);
    this.wreck.visible = false;
    this.root.add(this.cageTop, this.cageBottom, this.wreck);

    // ---- the umibōzu's stand-in: a vast dark head out past the seawall (`bosses` replaces it) ----
    this.umi = new THREE.Mesh(new THREE.SphereGeometry(14, 18, 12), new THREE.MeshStandardMaterial({ color: 0x0a1216, roughness: 0.3, metalness: 0.2 }));
    this.umi.scale.set(1, 1.5, 1);
    this.umi.position.set(UMIBOZU.rise.x, -30, UMIBOZU.rise.z);
    this.umi.visible = false;
    this.root.add(this.umi);

    // ---- the things to find (placeholders: `arms` and the look-book give them their own models) ----
    const glow = (color: number, k = 1.4): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.5 });
    const find = (geo: THREE.BufferGeometry, mat: THREE.Material, at: Spot, gone: (v: StoryView) => boolean, spin = true, lift = 0.95): void => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(at.x, at.y + lift, at.z);
      this.root.add(o);
      this.finds.push({ o, at, gone, spin });
    };
    const tapeGeo = new THREE.BoxGeometry(0.22, 0.03, 0.14);
    const tapeMat = glow(0xffd070, 0.8);
    TAPES.forEach((t, i) => find(tapeGeo, tapeMat, t, (v) => (v.tapes & (1 << i)) !== 0));
    const photoGeo = new THREE.BoxGeometry(0.2, 0.26, 0.02);
    const photoMat = glow(0xf0f4ff, 0.9);
    PHOTOS.forEach((p, i) => find(photoGeo, photoMat, p, (v) => (v.photos & (1 << i)) !== 0));
    const keyMat = glow(0xffc040, 1.6);
    find(new THREE.TorusGeometry(0.06, 0.015, 5, 10), keyMat, JOBS.key.key, (v) => HirasakaStory.isDone(v, 'key'));
    find(new THREE.TorusGeometry(0.06, 0.015, 5, 10), keyMat, JOBS.steam.boilerKey, (v) => v.boilerKey);
    find(new THREE.BoxGeometry(0.2, 0.02, 0.06), glow(0xd8b080, 0.6), COMB, (v) => v.kushi > 0);
    const sackGeo = new THREE.BoxGeometry(0.9, 0.5, 0.6);
    const sackMat = new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 1 });
    JOBS.steam.coal.forEach((c, i) => find(sackGeo, sackMat, c, (v) => (v.coal & (1 << i)) !== 0, false, 0.25));
    find(new THREE.CylinderGeometry(0.12, 0.1, 0.5, 8), glow(0xc8a070, 0.4), LADLES, (v) => v.ladles > 0, false, 0.9);
    // (arms: the Mori's parts and the tools are drawn by `armsLook.ts`, each as a model of itself)
    find(new THREE.SphereGeometry(0.09, 8, 6), glow(0xff2030, 2.4), DEEP_SPOTS.hairpin, (v) => v.hairpin, false, 0.5);

    // ---- the revived tree's peaches (they appear once Kurogane is dead) ----
    const peachMat = glow(0xffd8e8, 2.2);
    const peachGeo = new THREE.SphereGeometry(0.14, 10, 8);
    this.peaches = new THREE.InstancedMesh(peachGeo, peachMat, 14);
    const order = [0, 3, 6, 9, 12, 1, 2, 4, 5, 7, 8, 10, 11, 13];
    const at = new THREE.Object3D();
    order.forEach((k, n) => {
      const a = k * 2.39;
      const r = 2.4 + (k % 3) * 0.9;
      at.position.set(ROOT_TREE.x + Math.cos(a) * r, 4.6 + (k % 4) * 0.6, ROOT_TREE.z + Math.sin(a) * r);
      at.updateMatrix();
      this.peaches.setMatrixAt(n, at.matrix);
    });
    this.peaches.visible = false;
    this.root.add(this.peaches);

    // ---- the people in the Root Hall's tree ----
    this.rootPeople();

    // ---- the Old Village's doors (they all swing open at once when the hairpin is taken) ----
    const doorGeo = new THREE.BoxGeometry(1.4, 2.2, 0.08).translate(0.7, 1.1, 0);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
    for (const h of VILLAGE_HOUSES) {
      const d = new THREE.Group();
      d.add(new THREE.Mesh(doorGeo, doorMat));
      const alongX = h.door === 'N' || h.door === 'S';
      const x = alongX ? h.x0 + h.at - 0.7 : h.door === 'W' ? h.x0 : h.x1;
      const z = alongX ? (h.door === 'N' ? h.z0 : h.z1) : h.z0 + h.at - 0.7;
      d.position.set(x, DEEP_Y, z);
      d.rotation.y = alongX ? 0 : -Math.PI / 2;
      d.userData.rest = d.rotation.y;
      this.root.add(d);
      this.doors.push(d);
    }

    // ---- the Chibiki-iwa ----
    const sg = new THREE.SphereGeometry(3, 40, 28);
    const p = sg.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const k = 1 + 0.09 * Math.sin(v.x * 1.4 + v.y * 1.1) + 0.06 * Math.sin(v.z * 2.3) + 0.03 * Math.sin(v.x * 5.7 + v.z * 3.1);
      v.multiplyScalar(k);
      v.y *= 0.82;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    sg.computeVertexNormals();
    this.stone = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x4e4c48, roughness: 0.95 }));
    this.stone.position.set(ROCK.rest.x, ROCK.rest.y + 2.3, ROCK.rest.z);
    this.root.add(this.stone);
    const rope = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.1, 6, 40), new THREE.MeshStandardMaterial({ color: 0xd8c89a, roughness: 1 }));
    rope.rotation.x = Math.PI / 2;
    this.stone.add(rope);

    // ---- the gifts' wards and the gifts in flight (a small pool of each) ----
    const ringGeo = new THREE.RingGeometry(WARD.r - 0.25, WARD.r, 40).rotateX(-Math.PI / 2);
    for (let k = 0; k < 6; k++) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd8ec, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.visible = false;
      this.root.add(ring);
      this.wards.push({ ring, t: 0 });
      const m = new THREE.Mesh(peachGeo, peachMat);
      m.visible = false;
      this.root.add(m);
      this.thrown.push({ m, vx: 0, vy: 0, vz: 0, live: false, onLand: () => {} });
    }

    // ---- the headlamp ----
    this.headlamp.castShadow = false;
    this.root.add(this.headlamp);
    this.root.add(this.headlamp.target);
  }

  /** What appears only later, compiled with the level (and drawn once to send it to the GPU). */
  prewarm(): THREE.Object3D[] {
    return [this.surge, this.flood, this.beam, this.wreck, this.umi, this.peaches, ...this.wards.map((w) => w.ring), ...this.thrown.map((t) => t.m)];
  }

  /** A new run: everything back as it was. */
  reset(): void {
    this.surge.visible = false;
    this.flood.visible = false;
    this.sea = SEA_Y;
    this.deepSea = -9;
    this.cageT = -1;
    this.doorsT = -1;
    this.stoneRoll = 0;
    this.umiY = -30;
    this.lit = false;
    this.cageTop.visible = true;
    this.cageBottom.visible = true;
    this.wreck.visible = false;
    for (const d of this.doors) d.rotation.y = d.userData.rest as number;
    for (const w of this.wards) w.ring.visible = false;
    for (const t of this.thrown) {
      t.live = false;
      t.m.visible = false;
    }
  }

  /** The cage goes down (from the top). */
  ride(): void {
    this.cageT = 0;
  }

  /** The cable parts: the cage smashed at the bottom of the shaft, nothing in the headframe. */
  cable(): void {
    this.cageTop.visible = false;
    this.cageBottom.visible = false;
    this.wreck.visible = true;
  }

  /** Every door in the Old Village swings open. */
  openDoors(): void {
    if (this.doorsT < 0) this.doorsT = 0;
  }

  /** A gift thrown from `o` along `d`; `onLand` when it comes down. */
  throwPeach(o: THREE.Vector3, d: THREE.Vector3, onLand: (x: number, y: number, z: number) => void): void {
    const t = this.thrown.find((q) => !q.live) ?? this.thrown[0]!;
    t.live = true;
    t.m.visible = true;
    t.m.position.copy(o);
    t.vx = d.x * 15;
    t.vy = d.y * 15 + 3;
    t.vz = d.z * 15;
    t.onLand = onLand;
  }

  /** A ward glows where a gift landed (the comb's bamboo is a wider one). */
  ward(x: number, y: number, z: number, bamboo = false): void {
    const w = this.wards.reduce((a, b) => (a.t <= b.t ? a : b));
    w.t = bamboo ? BAMBOO.t : WARD.t;
    w.ring.visible = true;
    w.ring.scale.setScalar(bamboo ? BAMBOO.r / WARD.r : 1);
    w.ring.position.set(x, y + 0.05, z);
  }

  /** Every frame: the story's state drawn. `ground` finds the floor under a point (for the gifts in flight). */
  update(dt: number, v: StoryView, cam: THREE.Camera, underground: boolean, ground: (x: number, z: number, y: number) => number): void {
    this.t += dt;
    const t = this.t;
    void underground;
    this.people.visible = Math.hypot(cam.position.x - ROOT_TREE.x, cam.position.z - ROOT_TREE.z) < 46;
    // the sea on the climb: the water's top eases up to its level, a swell on it
    const target = HirasakaStory.seaLevel(v);
    this.sea += (target - this.sea) * Math.min(1, dt * 0.35);
    this.surge.visible = this.sea > SEA_Y + 0.05;
    this.surge.position.y = this.sea + Math.sin(t * 0.9) * 0.12;
    const deepTarget = HirasakaStory.seaLevel(v, true);
    this.deepSea += (deepTarget - this.deepSea) * Math.min(1, dt * 0.35);
    this.flood.visible = this.deepSea > -0.2;
    this.flood.position.y = this.deepSea + Math.sin(t * 0.7) * 0.08;
    this.foam.offset.set(t * 0.012, -t * 0.03);
    this.swell.value = t;
    // the lighthouse, lit at dawn
    this.lit = v.ending === 1;
    (this.lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = this.lit ? 3 : 0;
    this.beam.visible = this.lit;
    this.beam.rotation.y = t * 0.6;
    // the umibōzu's stand-in: rises with the jobs done, sinks a little with each hit, gone once beaten
    const umiGoal = v.umi === 1 ? 4 - v.umiHits * 3 : -30;
    this.umiY += (umiGoal - this.umiY) * Math.min(1, dt * (v.umi === 1 ? 0.25 : 0.4));
    this.umi.visible = this.umiY > -26;
    this.umi.position.y = this.umiY + Math.sin(t * 0.5) * 0.8;
    // the cage down the shaft and back for whoever is next
    if (this.cageT >= 0 && !v.bossDown) {
      this.cageT += dt;
      const k = this.cageT;
      const y = k < 3 ? -k * 3 : k < 9 ? -9 : Math.min(0, -9 + (k - 9) * 3);
      this.cageTop.position.y = CAGE.top.y + y;
      this.cageTop.visible = y > -8.9;
      if (k > 12) {
        this.cageT = -1;
        this.cageTop.position.y = CAGE.top.y;
        this.cageTop.visible = true;
      }
    }
    if (v.bossDown) this.cable();
    // the things to find
    this.finds.forEach((f, i) => {
      f.o.visible = !f.gone(v);
      if (f.spin && f.o.visible) {
        f.o.rotation.y = t * 1.5 + i;
        f.o.position.y = f.at.y + 0.95 + Math.sin(t * 2 + i) * 0.05;
      }
    });
    this.peaches.visible = v.bossDown;
    this.peaches.count = v.peaches ? 5 : 14;
    // the village's doors, all at once
    if (v.hairpin && this.doorsT < 0) this.doorsT = 0;
    if (this.doorsT >= 0 && this.doorsT < 1.5) {
      this.doorsT += dt;
      const k = Math.min(1, this.doorsT / 0.5);
      for (const d of this.doors) d.rotation.y = (d.userData.rest as number) - k * 1.7;
    }
    // the Chibiki-iwa hauled across (and home once sealed)
    const goal = v.ending === 1 ? 1 : HirasakaStory.rock(v);
    const was = this.stoneRoll;
    this.stoneRoll += (goal - this.stoneRoll) * Math.min(1, dt * 3);
    this.stone.position.x = ROCK.rest.x + (ROCK.seal.x - ROCK.rest.x) * this.stoneRoll;
    this.stone.position.z = ROCK.rest.z + (ROCK.seal.z - ROCK.rest.z) * this.stoneRoll;
    this.stone.rotation.z += (this.stoneRoll - was) * 2.2;
    // the gifts in flight, and their wards
    for (const q of this.thrown) {
      if (!q.live) continue;
      q.vy -= 18 * dt;
      q.m.position.x += q.vx * dt;
      q.m.position.y += q.vy * dt;
      q.m.position.z += q.vz * dt;
      const fy = ground(q.m.position.x, q.m.position.z, q.m.position.y);
      if (q.m.position.y <= fy + 0.1 || q.m.position.y < -5) {
        q.live = false;
        q.m.visible = false;
        q.onLand(q.m.position.x, Math.max(fy, q.m.position.y), q.m.position.z);
      }
    }
    for (const w of this.wards) {
      if (!w.ring.visible) continue;
      w.t -= dt;
      const m = w.ring.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, Math.min(1, w.t / 1.5)) * (0.6 + 0.25 * Math.sin(t * 6));
      w.ring.rotation.y += dt * 0.6;
      if (w.t <= 0) w.ring.visible = false;
    }
    // the headlamp follows the eye
    this.headlamp.position.copy(cam.position);
    this.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.headlamp.target.position.copy(cam.position).addScaledVector(this.fwd, 6);
  }

  /**
   * The people in the Root Hall's tree (`ROOT_PEOPLE`), in the island's own anime bodies: upright in the bark, arms
   * spread round the trunk and the roots wound over them, or lying in the roots with their feet to the trunk. They never
   * move (no animation runs on them: their skeletons stay in the models' rest pose).
   */
  private rootPeople(): void {
    // each body is dressed and placed once, then baked: its meshes in their rest pose, moved where it lies and merged by
    // material with everyone else's (a few dozen draws for all of them, no skinning; a skinned body each was 120)
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    // (hs-bosses) every body's materials folded into two plain ones, bark and hair (they are grey as the bark already):
    // two draws for all the people instead of one per VRoid material (57 in the Kurogane fight on Low)
    const bark = new THREE.MeshStandardMaterial({ color: 0xb4a898, roughness: 0.95, emissive: 0x2a2638, emissiveIntensity: 0.6 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.9 });
    const fold = (m: THREE.Material): THREE.Material => (/hair/i.test(m.name) ? hair : bark);
    const tmp = new THREE.Group();
    ROOT_PEOPLE.forEach((p, i) => {
      const t = hordeModel('shambler', 31 + i, p.kind);
      if (!t) return;
      const body = new AnimeBody(t, { scale: 1.62 / t.measure.height, offset: new THREE.Vector3(), tint: ROOT_TINT, grip: 0.2, shadows: false });
      const g = new THREE.Group();
      g.add(body.root);
      tmp.add(g);
      const ca = Math.cos(p.a);
      const sa = Math.sin(p.a);
      if (p.r === undefined) {
        const d = rootTrunkR(p.y! + 0.9) * 0.97 - 0.06;
        g.position.set(ROOT_TREE.x + ca * d, p.y!, ROOT_TREE.z + sa * d);
        g.rotation.set(0.1, Math.atan2(-ca, -sa), 0, 'YXZ');
      } else {
        g.position.set(ROOT_TREE.x + ca * p.r, 0.16, ROOT_TREE.z + sa * p.r);
        g.rotation.set(Math.PI / 2, Math.atan2(ca, sa), 0, 'YXZ');
      }
      tmp.updateMatrixWorld(true);
      body.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.visible) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const groups = Array.isArray(m.material) && m.geometry.groups.length > 0 ? m.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
        for (const gr of groups) {
          const mat = mats[gr.materialIndex ?? 0];
          if (!mat) continue;
          const geo = bakePart(m.geometry, gr.start, gr.count, m.matrixWorld);
          if (!geo) continue;
          const into = fold(mat);
          const list = byMat.get(into) ?? [];
          list.push(geo);
          byMat.set(into, list);
        }
      });
      body.dispose();
    });
    for (const [mat, geos] of byMat) {
      const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
      if (!merged) continue;
      if (geos.length > 1) for (const g of geos) g.dispose();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      this.people.add(mesh);
      this.peopleGeos.push(merged);
    }
    this.root.add(this.people);
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.peopleGeos) g.dispose();
    this.peopleGeos.length = 0;
  }
}
