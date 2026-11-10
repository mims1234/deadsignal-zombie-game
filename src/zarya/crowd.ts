/**
 * The people of Zarya-12, several hundred of them, as ONE draw call (`places.ts` says where each stands).
 * Every one is the same small figure - a long coat, a fur hat, boots - instanced, with a coat colour and a height of its
 * own. While the town is awake they shift on their feet; when the quiet snow has come down they stand perfectly still
 * with snow on their hats and shoulders, and breathe: a second draw call is every sleeper's frost breath. The ones who
 * are woken wrong have no breath, and are not here at all: they are the infected (`director.ts`).
 *
 * The same figure carries everything else a townsperson can wear, folded away to nothing until a person's `aKit` says
 * otherwise: the blanket a squad puts round a sleeper's shoulders (a scarf, for the one in bed), a carol-singer's goat or bear mask, a grandmother's
 * headscarf. One of them lies down (Danya, in his bed). Nobody under a roof has snow on their hat.
 *
 * Weak devices are bound by how many separate things are drawn, so all of the motion is in the shaders: nothing here
 * costs the CPU anything per person per frame. Only the people within sight of the camera are sent to be drawn at all
 * (`pack`: the town is five hundred metres across and the fog closes at sixty). `Snowfall` (one more draw call) is the
 * weather.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BANYA, DK, GARAGES, INSTITUTE, RYNOK, STORE, TETS, inInterior, inRect, type Person, type PersonRole } from './places';

const COATS = [0x3b4a66, 0x5b4636, 0x4a4f57, 0x6e3a36, 0x44553f, 0x8a7a62, 0x2f3340, 0x7b5f7a, 0x525f73, 0x6b5a48];
const BRIGHT = [0xb8402f, 0x2f6fb0, 0xd0a030, 0x3f8f5f, 0xc04a6a];
const ROLE: Partial<Record<PersonRole, number>> = { staff: 0xd9d6cc, guard: 0x23262e, nina: 0x6a7480, kostya: 0xb8261e, zina: 0x2c3a5a, moroz: 0x2e5fb0, girl: 0xc04a6a, babushka: 0x6a5a6e, danya: 0x9aa7b4 };

/** What a part of the figure is: always there, or one of the things only some wear (`aKit`). */
const BASE = 0;
const BLANKET = 1;
const GOAT = 2;
const BEAR = 3;
const SCARF = 4;
/** The knitted scarf a squad leaves round the neck of someone lying down (Danya, in his bed). */
const NECK = 5;
/** How far round the camera people are drawn, and how far it moves before they are counted again. */
const SIGHT = 104;
const STEP = 9;

type RGB = readonly [number, number, number];

/** One part of the figure: its geometry, its colour, how far the coat's colour tints it, whether it is settled snow. */
function part(g: THREE.BufferGeometry, x: number, y: number, z: number, color: RGB, tint: number, snow = 0, scale?: RGB, kind = BASE): THREE.BufferGeometry {
  const q = g.index ? g.toNonIndexed() : g;
  q.deleteAttribute('uv');
  if (scale) q.scale(scale[0], scale[1], scale[2]);
  q.translate(x, y, z);
  const n = q.attributes.position!.count;
  const lin = new THREE.Color().setRGB(color[0], color[1], color[2], THREE.SRGBColorSpace);
  const c = new Float32Array(n * 3);
  const t = new Float32Array(n);
  const s = new Float32Array(n);
  const k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    c[i * 3] = lin.r;
    c[i * 3 + 1] = lin.g;
    c[i * 3 + 2] = lin.b;
    t[i] = tint;
    s[i] = snow;
    k[i] = kind;
  }
  q.setAttribute('color', new THREE.BufferAttribute(c, 3));
  q.setAttribute('aTint', new THREE.BufferAttribute(t, 1));
  q.setAttribute('aSnow', new THREE.BufferAttribute(s, 1));
  q.setAttribute('aPart', new THREE.BufferAttribute(k, 1));
  return q;
}

function figure(): THREE.BufferGeometry {
  const W = [1, 1, 1] as const;
  const DARK = [0.16, 0.16, 0.2] as const;
  const SKIN = [0.82, 0.62, 0.52] as const;
  const SNOW = [0.95, 0.97, 1] as const;
  // few sides and no hidden caps: several hundred of these are most of the triangles on screen
  const tube = (rt: number, rb: number, h: number, seg: number, open = true): THREE.BufferGeometry => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const ballG = (r: number, w: number, h: number): THREE.BufferGeometry => new THREE.SphereGeometry(r, w, h);
  /** A cone leaning: its tip `rx` back (toward +z) and `rz` to one side. */
  const horn = (r: number, h: number, rx: number, rz: number): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, 4, 1, true).rotateX(rx).rotateZ(rz);
  /** A cone with its tip forward (the figure faces -z). */
  const snout = (r: number, h: number): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, 5, 1, true).rotateX(-Math.PI / 2);
  const WARM = [0.8, 0.44, 0.15] as const;
  const WARM2 = [0.5, 0.15, 0.11] as const;
  const BONE = [0.86, 0.82, 0.7] as const;
  const GOATFACE = [0.78, 0.76, 0.7] as const;
  const FUR = [0.34, 0.22, 0.13] as const;
  const TAN = [0.64, 0.48, 0.3] as const;
  const BERRY = [0.56, 0.13, 0.2] as const;
  const WOOL = [0.66, 0.62, 0.64] as const;
  const parts = [
    part(tube(0.19, 0.27, 0.98, 7), 0, 0.96, 0, W, 1),
    part(ballG(0.21, 7, 4), 0, 1.42, 0, W, 1, 0, [1.15, 0.45, 0.8]),
    part(tube(0.065, 0.07, 0.62, 5), -0.27, 1.1, 0, [0.85, 0.85, 0.85], 1),
    part(tube(0.065, 0.07, 0.62, 5), 0.27, 1.1, 0, [0.85, 0.85, 0.85], 1),
    part(tube(0.085, 0.09, 0.5, 5), -0.1, 0.25, 0, DARK, 0),
    part(tube(0.085, 0.09, 0.5, 5), 0.1, 0.25, 0, DARK, 0),
    part(new THREE.BoxGeometry(0.12, 0.1, 0.26), -0.1, 0.05, -0.04, [0.1, 0.1, 0.11], 0),
    part(new THREE.BoxGeometry(0.12, 0.1, 0.26), 0.1, 0.05, -0.04, [0.1, 0.1, 0.11], 0),
    part(tube(0.14, 0.16, 0.09, 7), 0, 1.46, 0, [0.7, 0.7, 0.7], 1),
    part(ballG(0.115, 7, 5), 0, 1.57, 0, SKIN, 0),
    part(tube(0.13, 0.137, 0.13, 7, false), 0, 1.67, 0, [0.36, 0.3, 0.26], 0.3),
    // the snow that settles: on the hat, on each shoulder
    part(tube(0.12, 0.134, 0.05, 7, false), 0, 1.765, 0, SNOW, 0, 1),
    part(ballG(0.085, 5, 3), -0.19, 1.5, 0, SNOW, 0, 1, [1.3, 0.4, 1.1]),
    part(ballG(0.085, 5, 3), 0.19, 1.5, 0, SNOW, 0, 1, [1.3, 0.4, 1.1]),

    // a blanket round the shoulders, down past the elbows, with a dark border
    part(tube(0.25, 0.4, 0.6, 7), 0, 1.19, 0, WARM, 0, 0, undefined, BLANKET),
    part(tube(0.405, 0.42, 0.1, 7), 0, 0.88, 0, WARM2, 0, 0, undefined, BLANKET),
    // a carol-singer's goat: two horns swept back, a long pale face, a beard
    part(horn(0.04, 0.3, 0.55, 0.3), -0.085, 1.85, 0.06, BONE, 0, 0, undefined, GOAT),
    part(horn(0.04, 0.3, 0.55, -0.3), 0.085, 1.85, 0.06, BONE, 0, 0, undefined, GOAT),
    part(snout(0.105, 0.3), 0, 1.56, -0.13, GOATFACE, 0, 0, undefined, GOAT),
    part(new THREE.ConeGeometry(0.04, 0.17, 4, 1, true).rotateX(Math.PI), 0, 1.4, -0.14, BONE, 0, 0, undefined, GOAT),
    // a carol-singer's bear: a brown head over the hat, round ears, a tan muzzle with a black nose
    part(ballG(0.165, 6, 4), 0, 1.63, 0.005, FUR, 0, 0, [1, 1.1, 1], BEAR),
    part(ballG(0.07, 5, 3), -0.125, 1.81, 0, FUR, 0, 0, [1, 1, 0.6], BEAR),
    part(ballG(0.07, 5, 3), 0.125, 1.81, 0, FUR, 0, 0, [1, 1, 0.6], BEAR),
    part(snout(0.085, 0.16), 0, 1.585, -0.19, TAN, 0, 0, undefined, BEAR),
    part(new THREE.BoxGeometry(0.045, 0.04, 0.04), 0, 1.59, -0.275, [0.06, 0.06, 0.07], 0, 0, undefined, BEAR),
    // a grandmother's headscarf tied under the chin, her face in it, a wool shawl
    part(ballG(0.165, 6, 4), 0, 1.63, 0.02, BERRY, 0, 0, [1, 1.12, 1.05], SCARF),
    part(ballG(0.09, 5, 3), 0, 1.565, -0.142, SKIN, 0, 0, [1, 1.1, 0.35], SCARF),
    part(tube(0.2, 0.31, 0.3, 7), 0, 1.36, 0, WOOL, 0, 0, undefined, SCARF),
    // a knitted scarf: wound round the neck, red with a white band, one end down the chest
    part(tube(0.135, 0.15, 0.1, 7, false), 0, 1.49, 0, [0.72, 0.12, 0.12], 0, 0, undefined, NECK),
    part(tube(0.138, 0.153, 0.03, 7, false), 0, 1.49, 0, [0.92, 0.9, 0.86], 0, 0, undefined, NECK),
    part(new THREE.BoxGeometry(0.1, 0.42, 0.035), 0.05, 1.25, -0.2, [0.72, 0.12, 0.12], 0, 0, undefined, NECK),
    part(new THREE.BoxGeometry(0.104, 0.04, 0.04), 0.05, 1.1, -0.2, [0.92, 0.9, 0.86], 0, 0, undefined, NECK),
  ];
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

const small = (r: PersonRole): boolean => r === 'child' || r === 'kostya' || r === 'girl';

/** Under a roof: the snow settles on nobody here. */
function roofed(p: Person): boolean {
  if (inInterior(p.x) || p.role === 'zina' || p.role === 'babushka') return true;
  for (const q of [STORE, DK.building, INSTITUTE.block, BANYA.house, RYNOK.hall, RYNOK.coldStore, TETS.hall, GARAGES.timur]) if (q && inRect(q, p.x, p.z)) return true;
  return false;
}

export class Crowd {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly breath: THREE.Points;
  private readonly uniforms = { uTime: { value: 0 }, uAsleep: { value: 0 } };
  private readonly breathU = { uTime: { value: 0 }, uOn: { value: 0 }, uSize: { value: 120 } };
  private readonly hidden = new Set<number>();
  // everyone as they are (the buffers the GPU has hold only the ones within sight, packed to the front)
  private readonly n: number;
  private readonly mats: Float32Array;
  private readonly cols: Float32Array;
  private readonly kits: Float32Array;
  private readonly heads: Float32Array;
  private readonly dirs: Float32Array;
  private readonly phases: Float32Array;
  private readonly kit: THREE.InstancedBufferAttribute;
  private readonly at = new THREE.Vector2(1e9, 1e9);
  private dirty = true;

  constructor(private readonly list: readonly Person[]) {
    this.root.name = 'ZaryaCrowd';
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.uniforms.uAsleep = this.uniforms.uAsleep;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTint;\nattribute float aSnow;\nattribute float aPart;\nattribute vec4 aKit;\nuniform float uTime;\nuniform float uAsleep;')
        // only the coat takes the instance's colour: the face, the boots and the snow keep their own
        .replace(
          '#include <color_vertex>',
          '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n  vColor = vec4( 1.0 );\n#endif\n#ifdef USE_COLOR\n  vColor.rgb *= color;\n#endif\n#ifdef USE_INSTANCING_COLOR\n  vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, aTint );\n#endif',
        )
        // what only some wear is folded away to a point for everyone else; awake, they shift on their feet; asleep,
        // the snow has settled on them (never under a roof)
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  float zOn = 1.0;\n  if ( aPart > 0.5 ) zOn = aPart < 1.5 ? 1.0 - step( 0.5, abs( aKit.x - 1.0 ) ) : aPart < 2.5 ? 1.0 - step( 0.5, abs( aKit.y - 1.0 ) ) : aPart < 3.5 ? 1.0 - step( 0.5, abs( aKit.y - 2.0 ) ) : aPart < 4.5 ? aKit.z : 1.0 - step( 0.5, abs( aKit.x - 2.0 ) );\n  float zBare = aSnow * max( 1.0 - uAsleep, step( 0.5, aKit.w ) );\n  transformed *= zOn * ( 1.0 - step( 0.999, zBare ) );\n  transformed.y -= zBare * 0.09;\n#ifdef USE_INSTANCING\n  float zph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;\n  float zaw = ( 1.0 - uAsleep ) * ( 1.0 - step( 1.5, aKit.w ) );\n  transformed.x += sin( uTime * 1.6 + zph ) * 0.03 * position.y * zaw;\n  transformed.z += cos( uTime * 1.1 + zph * 1.3 ) * 0.02 * position.y * zaw;\n#endif',
        );
    };
    const n = (this.n = list.length);
    this.mats = new Float32Array(n * 16);
    this.cols = new Float32Array(n * 3);
    this.kits = new Float32Array(n * 4);
    this.heads = new Float32Array(n * 3);
    this.dirs = new Float32Array(n * 3);
    this.phases = new Float32Array(n);
    const geo = figure();
    this.kit = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute('aKit', this.kit);
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    const col = new THREE.Color();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    list.forEach((p, i) => {
      const kid = small(p.role);
      const h = kid ? 0.64 + p.seed * 0.1 : 0.93 + p.seed * 0.14;
      const w = kid ? 0.7 : 0.94 + ((p.seed * 7) % 1) * 0.14;
      const lies = p.role === 'danya';
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      if (lies) {
        // on his back, his head the way he would have faced, the blanket's height off the bed
        e.set(Math.PI / 2, p.yaw + Math.PI, 0, 'YXZ');
        m.compose(new THREE.Vector3(p.x - fx * 0.85 * h, p.y + 0.27 * w, p.z - fz * 0.85 * h), q.setFromEuler(e), new THREE.Vector3(w, h, w));
        this.heads.set([p.x + fx * 0.72 * h, p.y + 0.42 * w, p.z + fz * 0.72 * h], i * 3);
        this.dirs.set([0, 1, 0], i * 3);
      } else {
        e.set(0, p.yaw, 0);
        m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromEuler(e), new THREE.Vector3(w, h, w));
        this.heads.set([p.x + fx * 0.15, p.y + 1.53 * h, p.z + fz * 0.15], i * 3);
        this.dirs.set([fx, 0, fz], i * 3);
      }
      m.toArray(this.mats, i * 16);
      const pal = kid || p.role === 'masked' ? BRIGHT : COATS;
      col.setHex(ROLE[p.role] ?? pal[Math.floor(((p.seed * 13) % 1) * pal.length)]!);
      col.toArray(this.cols, i * 3);
      this.kits[i * 4 + 1] = p.role === 'masked' ? ((p.seed * 17) % 1 < 0.5 ? 1 : 2) : 0;
      this.kits[i * 4 + 2] = p.role === 'babushka' ? 1 : 0;
      this.kits[i * 4 + 3] = lies ? 2 : roofed(p) ? 1 : 0;
      this.phases[i] = (p.seed * 31) % 1;
    });
    this.mesh.setColorAt(0, col);
    this.mesh.count = 0;
    this.root.add(this.mesh);

    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    bg.setAttribute('aDir', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    bg.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(n), 1));
    bg.setDrawRange(0, 0);
    this.breath = new THREE.Points(
      bg,
      new THREE.ShaderMaterial({
        uniforms: this.breathU,
        transparent: true,
        depthWrite: false,
        vertexShader:
          'attribute float aPhase;\nattribute vec3 aDir;\nuniform float uTime;\nuniform float uOn;\nuniform float uSize;\nvarying float vA;\nvoid main() {\n  float t = fract( uTime * 0.26 + aPhase );\n  float ex = smoothstep( 0.0, 0.45, t );\n  vec3 p = position + aDir * ex * 0.28 + vec3( 0.0, ex * 0.14, 0.0 );\n  vec4 mv = modelViewMatrix * vec4( p, 1.0 );\n  gl_Position = projectionMatrix * mv;\n  float d = -mv.z;\n  gl_PointSize = uSize * ( 0.35 + ex ) / max( d, 0.5 );\n  vA = uOn * ( 1.0 - t ) * smoothstep( 0.0, 0.08, t ) * 0.55 * clamp( 1.0 - d / 42.0, 0.0, 1.0 );\n}',
        fragmentShader: 'varying float vA;\nvoid main() {\n  float r = length( gl_PointCoord - 0.5 );\n  float a = smoothstep( 0.5, 0.1, r ) * vA;\n  if ( a < 0.01 ) discard;\n  gl_FragColor = vec4( 0.86, 0.92, 1.0, a );\n}',
      }),
    );
    this.breath.frustumCulled = false;
    this.root.add(this.breath);
  }

  /** Send the ones within sight of (x, z) to be drawn, packed to the front of every buffer. */
  private pack(x: number, z: number): void {
    const im = this.mesh.instanceMatrix.array as Float32Array;
    const ic = this.mesh.instanceColor!.array as Float32Array;
    const ik = this.kit.array as Float32Array;
    const g = this.breath.geometry;
    const bp = g.attributes.position as THREE.BufferAttribute;
    const bd = g.attributes.aDir as THREE.BufferAttribute;
    const bf = g.attributes.aPhase as THREE.BufferAttribute;
    const P = bp.array as Float32Array;
    const D = bd.array as Float32Array;
    const F = bf.array as Float32Array;
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      const p = this.list[i]!;
      if (this.hidden.has(i) || Math.abs(p.x - x) > SIGHT || Math.abs(p.z - z) > SIGHT) continue;
      for (let j = 0; j < 16; j++) im[k * 16 + j] = this.mats[i * 16 + j]!;
      for (let j = 0; j < 3; j++) {
        ic[k * 3 + j] = this.cols[i * 3 + j]!;
        P[k * 3 + j] = this.heads[i * 3 + j]!;
        D[k * 3 + j] = this.dirs[i * 3 + j]!;
      }
      for (let j = 0; j < 4; j++) ik[k * 4 + j] = this.kits[i * 4 + j]!;
      F[k] = this.phases[i]!;
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.kit.needsUpdate = true;
    bp.needsUpdate = bd.needsUpdate = bf.needsUpdate = true;
    g.setDrawRange(0, k);
    this.at.set(x, z);
    this.dirty = false;
  }

  /** The first of them with this role. */
  indexOf(role: PersonRole): number {
    return this.list.findIndex((p) => p.role === role);
  }

  /** Whoever stands nearest (x, z), within `r` (or -1). */
  nearest(x: number, z: number, r = 2): number {
    let best = -1;
    let d = r;
    this.list.forEach((p, i) => {
      const q = Math.hypot(p.x - x, p.z - z);
      if (q <= d) {
        d = q;
        best = i;
      }
    });
    return best;
  }

  /** Someone is here, or is not (the guard once he has woken; Ded Moroz once he has left the stage). */
  show(i: number, on: boolean): void {
    if (i < 0 || this.hidden.has(i) !== on) return;
    if (on) this.hidden.delete(i);
    else this.hidden.add(i);
    this.dirty = true;
  }

  /** Someone has been covered against the cold (a blanket, or a scarf for one lying in bed), or has not. */
  cover(i: number, on: boolean): void {
    if (i < 0 || i >= this.n) return;
    // someone lying down gets a scarf round the neck; everyone else, a blanket round the shoulders
    const kit = on ? (this.kits[i * 4 + 3] === 2 ? 2 : 1) : 0;
    if (this.kits[i * 4] === kit) return;
    this.kits[i * 4] = kit;
    this.dirty = true;
  }

  /** 0 = the town awake, 1 = asleep under the quiet snow. `cam`: where it is seen from. */
  update(time: number, asleep: number, viewportH: number, cam: { x: number; z: number }): void {
    if (this.dirty || Math.abs(cam.x - this.at.x) > STEP || Math.abs(cam.z - this.at.y) > STEP) this.pack(cam.x, cam.z);
    this.uniforms.uTime.value = time;
    this.uniforms.uAsleep.value = asleep;
    this.breathU.uTime.value = time;
    this.breathU.uOn.value = asleep;
    this.breathU.uSize.value = viewportH * 0.16;
    this.breath.visible = asleep > 0.02;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.breath.geometry.dispose();
    (this.breath.material as THREE.Material).dispose();
    this.root.removeFromParent();
  }
}

/** The quiet snow: flakes in a box that follows the camera, slanting in from the north. One draw call. */
export class Snowfall {
  readonly points: THREE.Points;
  private readonly u = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSize: { value: 60 }, uOn: { value: 1 } };

  constructor(count = 1300) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    let s = 20261231;
    const r = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      pos.set([r(), r(), r()], i * 3);
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.u,
        transparent: true,
        depthWrite: false,
        vertexShader:
          'attribute float aSeed;\nuniform float uTime;\nuniform vec3 uCam;\nuniform float uSize;\nuniform float uOn;\nvarying float vA;\nvoid main() {\n  vec3 box = vec3( 44.0, 26.0, 44.0 );\n  vec3 p = position * box;\n  p.y -= uTime * ( 1.1 + aSeed * 0.9 );\n  p.x += sin( uTime * 0.5 + aSeed * 40.0 ) * 0.6;\n  p.z += uTime * 0.7;\n  p = mod( p - uCam, box ) - box * 0.5 + uCam;\n  vec4 mv = viewMatrix * vec4( p, 1.0 );\n  gl_Position = projectionMatrix * mv;\n  float d = -mv.z;\n  gl_PointSize = uSize * ( 0.5 + aSeed ) / max( d, 1.0 );\n  vA = uOn * clamp( d / 3.0, 0.0, 1.0 ) * clamp( 1.0 - d / 24.0, 0.0, 1.0 );\n}',
        fragmentShader: 'varying float vA;\nvoid main() {\n  float r = length( gl_PointCoord - 0.5 );\n  float a = smoothstep( 0.5, 0.15, r ) * vA * 0.85;\n  if ( a < 0.01 ) discard;\n  gl_FragColor = vec4( 0.92, 0.95, 1.0, a );\n}',
      }),
    );
    this.points.frustumCulled = false;
    this.points.name = 'ZaryaSnow';
  }

  /** `on` 0..1: none under a roof. */
  update(time: number, cam: THREE.Vector3, on: number, viewportH: number): void {
    this.u.uTime.value = time;
    this.u.uCam.value.copy(cam);
    this.u.uOn.value = on;
    this.u.uSize.value = viewportH * 0.075;
    this.points.visible = on > 0.02;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.removeFromParent();
  }
}
