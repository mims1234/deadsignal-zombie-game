/**
 * What changes on the island as the story goes (`story.ts` says what; this draws it): the typhoon's rain, the waves
 * over the seawall, the sea gates' wheels, the lighthouse's beam and the island's windows coming on, the cage in the
 * headframe and at the bottom of the shaft (and smashed when the cable goes), the tapes, the photographs, the key, the
 * peaches, the hairpin, the Old Village's doors all opening, the Sealing Stone rolling home, the storm surge climbing
 * the island, and the peaches' wards.
 *
 * Everything is built once, here, when the level loads (the game compiles it with the level: `prewarm`), and only
 * shown, moved or hidden after that, so nothing is ever built in the middle of play.
 */
import * as THREE from 'three';
import { VILLAGE_HOUSES } from '../world/layout/hirasaka';
import { WARD } from './director';
import { HIRASAKA, PHOTOS, PLACES, TAPES, TIERS, ISLAND_X, SEA_Y } from './places';
import { HirasakaStory, type StoryView } from './story';

const RAIN = 2200;

const RAIN_VERT = /* glsl */ `
  attribute vec3 seed;
  uniform float uTime;
  uniform vec3 uCam;
  varying float vA;
  void main() {
    // each drop: a fixed spot in a 60 m box round the camera, falling and wrapping; the second vertex trails above
    float h = 26.0;
    float fall = mod(seed.z * h - uTime * (17.0 + seed.x * 4.0), h);
    vec3 p = vec3(mod(seed.x * 60.0 - uCam.x + 30.0, 60.0) - 30.0 + uCam.x, uCam.y - 8.0 + fall, mod(seed.y * 60.0 - uCam.z + 30.0, 60.0) - 30.0 + uCam.z);
    p.y += position.y * 0.9;
    p.x += position.y * 0.18;
    vA = 0.22 + 0.2 * seed.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const RAIN_FRAG = /* glsl */ `
  varying float vA;
  uniform float uAmt;
  void main() { gl_FragColor = vec4(0.72, 0.8, 0.88, vA * uAmt); }`;

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
  /** The headlamp the squad wears in the mine (always in the scene: switching it on rebuilds no shader). */
  readonly headlamp = new THREE.SpotLight(0xfff0d8, 0, 34, 0.55, 0.45, 1.4);
  private readonly rain: THREE.LineSegments;
  private readonly rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmt: { value: 1 } };
  private readonly surge: THREE.Mesh;
  private readonly surgeMat: THREE.MeshStandardMaterial;
  private readonly foam: THREE.CanvasTexture;
  private readonly waveSheet: THREE.Mesh;
  private waveT = -1;
  private readonly wheels: THREE.Mesh[] = [];
  private readonly gateLamps: THREE.Mesh[] = [];
  private readonly beam: THREE.Mesh;
  private readonly lamp: THREE.Mesh;
  private readonly windowsMat: THREE.MeshStandardMaterial;
  private readonly cageTop: THREE.Group;
  private readonly cageBottom: THREE.Group;
  private readonly wreck: THREE.Group;
  private cageT = -1;
  private readonly tapes: THREE.Object3D[] = [];
  private readonly photos: THREE.Object3D[] = [];
  private readonly key: THREE.Object3D;
  private readonly peaches: THREE.Mesh[] = [];
  private readonly hairpin: THREE.Object3D;
  private readonly doors: THREE.Object3D[] = [];
  private doorsT = -1;
  private readonly stone: THREE.Mesh;
  private stoneRoll = 0;
  private readonly wards: { ring: THREE.Mesh; t: number }[] = [];
  private readonly thrown: { m: THREE.Mesh; vx: number; vy: number; vz: number; live: boolean; onLand: (x: number, y: number, z: number) => void }[] = [];
  private t = 0;
  private sea = SEA_Y;
  private readonly fwd = new THREE.Vector3();
  /** The lighthouse's lamp is lit. */
  lit = false;

  constructor() {
    this.root.name = 'HirasakaLook';
    // ---- the rain ----
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(RAIN * 6);
    const seed = new Float32Array(RAIN * 6);
    for (let i = 0; i < RAIN; i++) {
      const a = Math.random();
      const b = Math.random();
      const c = Math.random();
      pos.set([0, 0, 0, 0, 1, 0], i * 6);
      seed.set([a, b, c, a, b, c], i * 6);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    this.rain = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: this.rainU, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.root.add(this.rain);

    // ---- the storm surge over the island, and the waves over the seawall ----
    this.foam = foamTexture();
    this.surgeMat = new THREE.MeshStandardMaterial({ color: 0x3a6a6c, map: this.foam, roughness: 0.12, metalness: 0.5, transparent: true, opacity: 0.9, emissive: 0x0c2224 });
    this.surge = new THREE.Mesh(new THREE.PlaneGeometry(ISLAND_X.x1 - ISLAND_X.x0 + 6, 100, 24, 20).rotateX(-Math.PI / 2), this.surgeMat);
    this.surge.position.set(0, SEA_Y, 0);
    this.surge.visible = false;
    this.root.add(this.surge);
    this.waveSheet = new THREE.Mesh(new THREE.BoxGeometry(ISLAND_X.x1 - ISLAND_X.x0, 1, 2.5), new THREE.MeshStandardMaterial({ color: 0xc8dce0, roughness: 0.3, transparent: true, opacity: 0.75, emissive: 0x203034 }));
    this.waveSheet.visible = false;
    this.root.add(this.waveSheet);

    // ---- the sea gates' wheels and their lamps ----
    const wheelGeo = new THREE.TorusGeometry(0.45, 0.06, 6, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x9a2a1a, roughness: 0.5, metalness: 0.6 });
    for (const v of PLACES.valves) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(v.x, 1.2, 43.12);
      this.root.add(w);
      this.wheels.push(w);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff3020, emissiveIntensity: 2 }));
      l.position.set(v.x + 0.9, 1.6, 43.15);
      this.root.add(l);
      this.gateLamps.push(l);
    }

    // ---- the lighthouse's lamp and beam; the island's windows ----
    const LH = HIRASAKA.lighthouse;
    const top = TIERS[4].y + 17.4;
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshStandardMaterial({ color: 0x404040, emissive: 0xfff4d0, emissiveIntensity: 0 }));
    this.lamp.position.set(LH.x, top, LH.z);
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
    this.windowsMat = new THREE.MeshStandardMaterial({ color: 0x1a1a18, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.4 });
    const win = new THREE.PlaneGeometry(1.1, 1.1);
    const spots: [number, number, number][] = [];
    for (let i = 1; i < TIERS.length; i++) {
      const t = TIERS[i]!;
      const lo = TIERS[i - 1]!.y;
      for (let x = ISLAND_X.x0 + 2.7; x < ISLAND_X.x1 - 1; x += 7.8) spots.push([x + ((i * 3) % 5), lo + 1.5, t.z1 + 0.08]);
    }
    for (let f = 0; f < 7; f++) for (let x = -44; x < -9; x += 5.2) spots.push([x + (f % 2) * 2.6, TIERS[3].y + 4.3 + f * 2.8, -21.92]);
    const wins = new THREE.InstancedMesh(win, this.windowsMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, y, z], i) => wins.setMatrixAt(i, m.makeTranslation(x, y, z)));
    this.root.add(wins);

    // ---- the cage: in the headframe, at the bottom of the shaft, and its wreck ----
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
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0x302a20, emissive: 0xffc070, emissiveIntensity: 1.5 }));
      lamp.position.y = 2.5;
      c.add(lamp);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 20, 4), new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.8 }));
      cable.position.y = 12.7;
      c.add(cable);
      return c;
    };
    this.cageTop = cage();
    this.cageTop.position.set(HIRASAKA.cage.x, 0, HIRASAKA.cage.z);
    this.cageBottom = cage();
    this.cageBottom.position.set(HIRASAKA.cageBottom.x, 0, HIRASAKA.cageBottom.z);
    this.wreck = cage();
    this.wreck.position.set(HIRASAKA.cageBottom.x + 0.6, 0.4, HIRASAKA.cageBottom.z - 0.4);
    this.wreck.rotation.set(0.5, 0.4, 0.35);
    this.wreck.visible = false;
    this.root.add(this.cageTop, this.cageBottom, this.wreck);

    // ---- the things to find ----
    const glow = (color: number, k = 1.4): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.5 });
    const tapeGeo = new THREE.BoxGeometry(0.22, 0.03, 0.14);
    const tapeMat = glow(0xffd070, 0.8);
    for (const t of TAPES) {
      const o = new THREE.Mesh(tapeGeo, tapeMat);
      o.position.set(t.x, t.y + 0.9, t.z);
      this.root.add(o);
      this.tapes.push(o);
    }
    const photoGeo = new THREE.BoxGeometry(0.2, 0.26, 0.02);
    const photoMat = glow(0xf0f4ff, 0.9);
    for (const p of PHOTOS) {
      const o = new THREE.Mesh(photoGeo, photoMat);
      o.position.set(p.x, p.y + 1, p.z);
      this.root.add(o);
      this.photos.push(o);
    }
    this.key = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 5, 10), glow(0xffc040, 2));
    this.key.position.set(PLACES.key.x - 0.3, PLACES.key.y + 1.5, PLACES.key.z);
    this.root.add(this.key);
    const peachMat = glow(0xffd8e8, 2.2);
    const peachGeo = new THREE.SphereGeometry(0.14, 10, 8);
    for (let k = 0; k < 14; k++) {
      const a = k * 2.39;
      const r = 1.6 + (k % 3) * 0.7;
      const p = new THREE.Mesh(peachGeo, peachMat);
      p.position.set(PLACES.peaches.x + Math.cos(a) * r, 5.6 + (k % 4) * 0.5, PLACES.peaches.z + Math.sin(a) * r);
      this.root.add(p);
      this.peaches.push(p);
    }
    this.hairpin = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glow(0xff2030, 2.4));
    this.hairpin.position.set(PLACES.hairpin.x, 0.5, PLACES.hairpin.z);
    this.root.add(this.hairpin);

    // ---- the Old Village's doors ----
    const doorGeo = new THREE.BoxGeometry(1.4, 2.2, 0.08).translate(0.7, 1.1, 0);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
    for (const h of VILLAGE_HOUSES) {
      const d = new THREE.Group();
      const leaf = new THREE.Mesh(doorGeo, doorMat);
      d.add(leaf);
      const fx = Math.sin(h.rot) * 2.55;
      const fz = Math.cos(h.rot) * 2.55;
      d.position.set(h.x + fx - Math.cos(h.rot) * 0.7, 0, h.z + fz + Math.sin(h.rot) * 0.7);
      d.rotation.y = h.rot;
      d.userData.rest = h.rot;
      this.root.add(d);
      this.doors.push(d);
    }

    // ---- the Sealing Stone ----
    const sg = new THREE.SphereGeometry(1.9, 40, 28);
    const p = sg.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const k = 1 + 0.09 * Math.sin(v.x * 2.1 + v.y * 1.7) + 0.06 * Math.sin(v.z * 3.3) + 0.03 * Math.sin(v.x * 7.7 + v.z * 5.1);
      v.multiplyScalar(k);
      v.y *= 0.82;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    sg.computeVertexNormals();
    this.stone = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x4e4c48, roughness: 0.95, flatShading: false }));
    this.stone.castShadow = true;
    this.stone.position.set(HIRASAKA.stoneRest.x, TIERS[4].y + 1.45, HIRASAKA.stoneRest.z);
    this.root.add(this.stone);
    // a shimenawa round it
    const rope = new THREE.Mesh(new THREE.TorusGeometry(2.02, 0.07, 6, 40), new THREE.MeshStandardMaterial({ color: 0xd8c89a, roughness: 1 }));
    rope.rotation.x = Math.PI / 2;
    rope.position.y = 0.05;
    this.stone.add(rope);

    // ---- the peaches' wards and the peaches in flight (a small pool of each) ----
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
    return [this.surge, this.waveSheet, this.beam, this.wreck, ...this.wards.map((w) => w.ring), ...this.thrown.map((t) => t.m)];
  }

  /** A new run: everything back as it was. */
  reset(): void {
    this.surge.visible = false;
    this.sea = SEA_Y;
    this.waveT = -1;
    this.cageT = -1;
    this.doorsT = -1;
    this.stoneRoll = 0;
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

  /** A wave comes over the seawall. */
  wave(): void {
    this.waveT = 0;
  }

  /** The cage goes down (from the top), and is at the bottom. */
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

  /** A peach thrown from `o` along `d`; `onLand` when it comes down. */
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

  /** A ward glows where a peach landed. */
  ward(x: number, y: number, z: number): void {
    const w = this.wards.reduce((a, b) => (a.t <= b.t ? a : b));
    w.t = WARD.t;
    w.ring.visible = true;
    w.ring.position.set(x, y + 0.05, z);
  }

  /** Every frame: the story's state drawn. `ground` finds the floor under a point (for the peaches in flight). */
  update(dt: number, v: StoryView, cam: THREE.Camera, underground: boolean, ground: (x: number, z: number, y: number) => number): void {
    this.t += dt;
    const t = this.t;
    // rain round the camera (none underground, harder in the surge)
    this.rain.visible = !underground;
    this.rainU.uTime.value = t;
    this.rainU.uCam.value.copy(cam.position);
    this.rainU.uAmt.value = v.surge > 0 ? 1.4 : 1;
    // the surge: the water's top eases up to its level, a swell on it
    const target = HirasakaStory.seaLevel(v);
    this.sea += (target - this.sea) * Math.min(1, dt * 0.35);
    this.surge.visible = v.surge > 0 || this.sea > SEA_Y + 0.05;
    this.surge.position.y = this.sea + Math.sin(t * 0.9) * 0.12;
    this.surge.position.z = 2 + Math.sin(t * 0.4) * 0.6;
    this.foam.offset.set(t * 0.012, -t * 0.03);
    // a wave over the seawall: up over the wall, crashing down onto the promenade
    if (this.waveT >= 0) {
      this.waveT += dt;
      const k = this.waveT;
      const w = this.waveSheet;
      w.visible = k < 3;
      const up = Math.min(1, k / 1.3);
      const down = Math.max(0, (k - 1.3) / 1.4);
      w.position.set(0, -1 + up * 4.2 - down * 4.5, 46 - down * 7);
      w.scale.set(1, 1 + up * 3 - down * 2, 1 + down * 2);
      (w.material as THREE.MeshStandardMaterial).opacity = 0.75 * (1 - down);
      if (k >= 3) this.waveT = -1;
    }
    // the sea gates
    PLACES.valves.forEach((_, i) => {
      const open = (v.valves & (1 << i)) !== 0;
      if (open) this.wheels[i]!.rotation.z += dt * 3;
      const lm = this.gateLamps[i]!.material as THREE.MeshStandardMaterial;
      lm.emissive.setHex(open ? 0x30ff60 : 0xff3020);
      lm.color.copy(lm.emissive);
    });
    // the lighthouse: the generator catching, then the beam
    const lightOn = HirasakaStory.isDone(v, 'light');
    this.lit = lightOn;
    const lm = this.lamp.material as THREE.MeshStandardMaterial;
    lm.emissiveIntensity = lightOn ? 3 : v.generating ? 0.4 + v.charge * 1.2 + 0.4 * Math.sin(t * 20) * (1 - v.charge) : 0;
    this.beam.visible = lightOn;
    this.beam.rotation.y = t * 0.6;
    this.windowsMat.emissiveIntensity += ((lightOn ? 1.6 : 0) - this.windowsMat.emissiveIntensity) * Math.min(1, dt * 0.5);
    // the cage down the shaft, and back up for whoever is next
    if (this.cageT >= 0 && !v.bossDown) {
      this.cageT += dt;
      const k = this.cageT;
      const y = k < 3 ? -k * 3 : k < 9 ? -9 : Math.min(0, -9 + (k - 9) * 3);
      this.cageTop.position.y = y;
      this.cageTop.visible = y > -8.9;
      if (k > 12) {
        this.cageT = -1;
        this.cageTop.position.y = 0;
        this.cageTop.visible = true;
      }
    }
    if (v.bossDown) this.cable();
    // the things to find
    this.tapes.forEach((o, i) => {
      o.visible = !(v.tapes & (1 << i));
      o.rotation.y = t * 1.5 + i;
      o.position.y = TAPES[i]!.y + 0.95 + Math.sin(t * 2 + i) * 0.05;
    });
    this.photos.forEach((o, i) => {
      o.visible = !(v.photos & (1 << i));
      o.rotation.y = t * 1.2 + i;
      o.position.y = PHOTOS[i]!.y + 1.05 + Math.sin(t * 2.2 + i) * 0.05;
    });
    this.key.visible = !HirasakaStory.isDone(v, 'key');
    this.key.rotation.y = t * 2;
    this.hairpin.visible = !v.hairpin;
    this.peaches.forEach((p, i) => (p.visible = !v.peaches || i % 3 === 0));
    // the village's doors, all at once
    if (v.peaches && this.doorsT < 0) this.doorsT = 0;
    if (this.doorsT >= 0 && this.doorsT < 1.5) {
      this.doorsT += dt;
      const k = Math.min(1, this.doorsT / 0.5);
      for (const d of this.doors) d.rotation.y = (d.userData.rest as number) - k * 1.7;
    }
    // the stone rolls as it is pushed (and is home once sealed)
    const S0 = HIRASAKA.stoneRest;
    const S1 = HIRASAKA.stoneSeal;
    const goal = v.ending === 1 ? 1 : v.push;
    const was = this.stoneRoll;
    this.stoneRoll += (goal - this.stoneRoll) * Math.min(1, dt * 3);
    this.stone.position.x = S0.x + (S1.x - S0.x) * this.stoneRoll;
    this.stone.position.z = S0.z + (S1.z - S0.z) * this.stoneRoll;
    this.stone.rotation.z += (this.stoneRoll - was) * 3.2;
    // the peaches in flight, and their wards
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

  dispose(): void {
    this.root.removeFromParent();
  }
}
