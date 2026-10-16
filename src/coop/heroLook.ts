/**
 * The Forge's people (Vulcan's members and leadership, `forge/looks.ts`): a handsome, heroic figure on the same
 * skeleton as every `Avatar` (the walk, the arm solver and the weapon holds are the Avatar's own). A defined jaw and
 * cheekbones, a straight nose, expressive brows, large eyes with irises and catch-lights, fuller lips; hair with real
 * volume built from shaped pieces; an athletic build (broad shoulders and a tapered waist, or an elegant athletic
 * figure, or a lean in-between); Forge outfits (a fitted apron over rolled sleeves, a cropped jacket, a hoodie,
 * workwear, a long coat) with ember trim; and one signature item each.
 *
 * Every piece that does not move on its own is merged per material at the end (`mergeStatic`), so a figure costs a
 * couple of dozen draw calls however much detail it carries.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AvatarLook } from '../config';

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** Shared materials by colour and finish (a figure's look reuses them; they are never disposed). */
export function heroMat(color: number, rough = 0.75, extra: { metal?: number; emissive?: number; glow?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}|${extra.metal ?? 0}|${extra.emissive ?? 0}|${extra.glow ?? 0}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: extra.metal ?? 0, emissive: extra.emissive ?? 0x000000, emissiveIntensity: extra.glow ?? 0 });
    mats.set(key, m);
  }
  return m;
}

const sidedMats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
/** A shared material seen from both sides (skirts, the curtain of long hair, a hat's brim, wings); never disposed. */
export function doubleSided(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let d = sidedMats.get(m);
  if (!d) {
    d = m.clone();
    d.side = THREE.DoubleSide;
    sidedMats.set(m, d);
  }
  return d;
}

function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot?: [number, number, number], scale?: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

const sphere = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);

/** The build of a hero: shoulder width, chest and hips, limb thickness. */
export type HeroBuild = 'm' | 'f' | 'lean';
export function heroBuild(look: AvatarLook): HeroBuild {
  return look.build ?? (look.female ? 'f' : 'm');
}

// ---------------------------------------------------------------------------------------------
// limbs (shared per build; same pivots and lengths as the stock limbs)
// ---------------------------------------------------------------------------------------------

export interface HeroParts {
  upper: THREE.BufferGeometry;
  fore: THREE.BufferGeometry;
  hand: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  shoe: THREE.BufferGeometry;
}
const partsByBuild = new Map<HeroBuild, HeroParts>();
const sharedParts = new Set<THREE.BufferGeometry>();

/** Shared limb geometry is kept when a figure is disposed. */
export function isHeroPart(g: THREE.BufferGeometry | undefined): boolean {
  return !!g && sharedParts.has(g);
}

export function heroParts(build: HeroBuild, upper: number, fore: number, thigh: number, shin: number): HeroParts {
  let p = partsByBuild.get(build);
  if (p) return p;
  const k = build === 'm' ? 1 : build === 'lean' ? 0.9 : 0.84;
  const limb = (r0: number, r1: number, len: number, extra = 0): THREE.BufferGeometry => {
    const g = new THREE.CylinderGeometry(r0 * k, r1 * k, len + extra, 14, 3).translate(0, -(len + extra) / 2 + extra / 2, 0);
    // a little muscle: the middle of the limb swells
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = Math.min(1, Math.max(0, -y / (len + extra)));
      const s = 1 + 0.12 * Math.sin(t * Math.PI) * (build === 'm' ? 1.2 : 0.7);
      pos.setX(i, pos.getX(i) * s);
      pos.setZ(i, pos.getZ(i) * s);
    }
    g.computeVertexNormals();
    return g;
  };
  p = {
    upper: limb(0.058, 0.046, upper, 0.05),
    fore: limb(0.046, 0.034, fore),
    hand: new THREE.BoxGeometry(0.07 * k, 0.095, 0.05).translate(0, -0.05, 0),
    thigh: limb(0.085, 0.06, thigh, 0.05),
    shin: limb(0.06, 0.042, shin),
    shoe: new THREE.BoxGeometry(0.1 * k + 0.02, 0.085, 0.26).translate(0, -0.04, -0.04),
  };
  for (const g of Object.values(p)) sharedParts.add(g);
  partsByBuild.set(build, p);
  return p;
}

// ---------------------------------------------------------------------------------------------
// torso
// ---------------------------------------------------------------------------------------------

/** The torso on the chest group (the waist is its origin; the shoulders sit at 0.47) and the hips on the body group. */
export function addHeroTorso(body: THREE.Object3D, chest: THREE.Object3D, look: AvatarLook, top: THREE.Material, pants: THREE.Material): void {
  const b = heroBuild(look);
  if (b === 'f') {
    const waist = put(chest, new THREE.CylinderGeometry(0.13, 0.105, 0.26, 18), top, 0, 0.13, 0);
    waist.scale.z = 0.76;
    const ribs = put(chest, new THREE.CylinderGeometry(0.165, 0.13, 0.28, 18), top, 0, 0.39, 0);
    ribs.scale.z = 0.72;
    // a dress's bodice is smooth: a softer figure under it
    const dress = look.heroOutfit === 'dress' || look.heroOutfit === 'uniform' || look.heroOutfit === 'school';
    for (const s of [-1, 1]) {
      put(chest, sphere(dress ? 0.05 : 0.058), top, s * 0.054, 0.33, dress ? -0.066 : -0.074, undefined, dress ? [1.1, 0.8, 0.5] : [1, 0.88, 0.72]);
      put(chest, sphere(0.06), top, s * 0.172, 0.47, 0);
    }
    const hip = put(body, new THREE.CylinderGeometry(0.11, 0.17, 0.22, 18), pants, 0, 0.94, 0);
    hip.scale.z = 0.8;
    return;
  }
  const broad = b === 'm' ? 1 : 0.88;
  // a V: broad across the chest and shoulders, narrowing to the waist
  const lower = put(chest, new THREE.CylinderGeometry(0.15 * broad, 0.135 * broad, 0.24, 18), top, 0, 0.12, 0);
  lower.scale.z = 0.7;
  const upper = put(chest, new THREE.CylinderGeometry(0.215 * broad, 0.15 * broad, 0.3, 18), top, 0, 0.38, 0);
  upper.scale.z = 0.62;
  for (const s of [-1, 1]) {
    // the chest and the shoulders
    if (b === 'm') put(chest, sphere(0.085), top, s * 0.075, 0.4, -0.07, undefined, [1.1, 0.75, 0.55]);
    put(chest, sphere(0.072), top, s * 0.215 * broad, 0.47, 0, undefined, [1, 0.95, 1]);
  }
  const hip = put(body, new THREE.CylinderGeometry(0.135 * broad, 0.145 * broad, 0.2, 16), pants, 0, 0.96, 0);
  hip.scale.z = 0.72;
}

// ---------------------------------------------------------------------------------------------
// face
// ---------------------------------------------------------------------------------------------

/**
 * The head itself: one smooth surface - a rounded cranium narrowing to a defined jaw and chin (squarer for a man,
 * finer for a woman), slightly flattened at the face. Built from a sphere whose lower half is drawn in.
 */
function skullGeometry(build: HeroBuild): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.12, 28, 22);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const fem = build === 'f';
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const ny = y / 0.12;
    // narrower overall, a little longer front to back
    x *= 0.86;
    z *= 0.98;
    if (ny < 0) {
      // the jaw: drawn in toward the chin, the chin a touch forward
      const k = -ny;
      const taper = fem ? 0.34 : 0.24;
      x *= 1 - taper * k * k;
      z *= 1 - (fem ? 0.12 : 0.06) * k;
      if (z < 0) z -= 0.012 * k * k;
      y *= fem ? 1.04 : 1.1;
    }
    // the face is flatter than the back of the head
    if (z < 0) z *= 0.92;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** A handsome face on the head group (r 0.12, facing -Z). */
export function addHeroFace(head: THREE.Object3D, look: AvatarLook, skin: THREE.Material): void {
  const b = heroBuild(look);
  const fem = b === 'f';
  const skinC = new THREE.Color(look.skin ?? 0xd8a888);
  put(head, skullGeometry(b), skin, 0, 0, 0);
  // the neck runs up into the jaw
  put(head, new THREE.CylinderGeometry(fem ? 0.045 : 0.055, fem ? 0.05 : 0.062, 0.1, 12), skin, 0, -0.11, 0.012);
  if (look.anime) {
    addAnimeFace(head, look, skin);
    return;
  }
  // a straight nose: the bridge and the tip
  put(head, new THREE.BoxGeometry(0.016, 0.05, 0.018), skin, 0, -0.008, -0.108, [-0.22, 0, 0]);
  put(head, sphere(0.0125, 10, 8), skin, 0, -0.032, -0.118, undefined, [1.25, 0.9, 1]);
  // eyes: almond whites, an iris with a dark pupil and a catch-light, a lash line above, brows
  const white = heroMat(0xf2eee8, 0.35);
  const iris = heroMat(look.eyes ?? 0x3a5a7a, 0.25);
  const pupil = heroMat(0x0a0808, 0.2);
  const glint = heroMat(0xffffff, 0.2, { emissive: 0xffffff, glow: 0.9 });
  const lash = heroMat(0x1a1210, 0.8);
  const brow = heroMat(new THREE.Color(look.hairColor ?? 0x2a1c14).multiplyScalar(0.8).getHex(), 0.9);
  for (const s of [-1, 1]) {
    const ex = s * 0.037;
    const ey = 0.012;
    put(head, sphere(0.0165, 14, 10), white, ex, ey, -0.096, undefined, [1.3, fem ? 0.95 : 0.8, 0.45]);
    put(head, sphere(0.0105, 12, 8), iris, ex + s * 0.001, ey, -0.1, undefined, [1, 1, 0.42]);
    put(head, sphere(0.0048, 8, 6), pupil, ex + s * 0.001, ey, -0.1028, undefined, [1, 1, 0.4]);
    put(head, sphere(0.0026, 6, 4), glint, ex + s * 0.001 + 0.003, ey + 0.004, -0.1046);
    // the lash line, heavier and winged for a woman
    put(head, new THREE.BoxGeometry(fem ? 0.036 : 0.032, fem ? 0.0045 : 0.003, 0.006), lash, ex, ey + (fem ? 0.0098 : 0.0085), -0.1, [0, 0, s * (fem ? -0.14 : -0.06)]);
    if (fem) put(head, new THREE.BoxGeometry(0.009, 0.003, 0.004), lash, ex + s * 0.02, ey + 0.012, -0.097, [0, 0, s * -0.5]);
    // brows: straight and strong for a man, finer and arched for a woman
    put(head, new THREE.BoxGeometry(fem ? 0.034 : 0.038, fem ? 0.005 : 0.009, 0.008), brow, ex + s * 0.002, ey + 0.03, -0.1, [0.15, 0, s * (fem ? -0.16 : -0.06)]);
    // ears
    put(head, sphere(0.02, 10, 8), skin, s * 0.102, 0.002, 0.004, undefined, [0.4, 1, 0.72]);
  }
  // lips: the upper a fine line, the lower fuller
  const lipC = fem ? 0xb4545e : skinC.clone().multiplyScalar(0.74).getHex();
  put(head, new THREE.BoxGeometry(0.03, 0.005, 0.008), heroMat(lipC, 0.5), 0, -0.056, -0.104);
  put(head, sphere(0.013, 12, 6), heroMat(lipC, 0.45), 0, -0.063, -0.1, undefined, [1.25, 0.42, 0.5]);
  // a shadow of stubble along the jaw
  if (look.stubble) {
    const st = new THREE.SphereGeometry(0.1215, 24, 10, Math.PI * 1.05, Math.PI * 0.9, Math.PI * 0.6, Math.PI * 0.3);
    const m = put(head, st, heroMat(skinC.clone().multiplyScalar(0.6).getHex(), 0.95), 0, 0.004, 0, undefined, [0.82, 1.08, 0.9]);
    m.renderOrder = 1;
  }
}

/**
 * An anime face: big eyes set low and wide (a white, a tall iris darker at the top, the pupil, two catch-lights, a heavy
 * upper lash with a flick), thin high brows, a dot of a nose, and the mouth - a cat smile and a blush ('soft'), or a
 * fine calm line ('cool').
 */
function addAnimeFace(head: THREE.Object3D, look: AvatarLook, skin: THREE.Material): void {
  const soft = look.anime === 'soft';
  const eyeC = new THREE.Color(look.eyes ?? 0x6a5ad8);
  const white = heroMat(0xfaf8f6, 0.35);
  const iris = heroMat(eyeC.getHex(), 0.2, { emissive: eyeC.getHex(), glow: 0.25 });
  const irisTop = heroMat(eyeC.clone().multiplyScalar(0.42).getHex(), 0.25);
  const pupil = heroMat(0x140c18, 0.2);
  const glint = heroMat(0xffffff, 0.2, { emissive: 0xffffff, glow: 1.1 });
  const lash = heroMat(0x1c1418, 0.8);
  const brow = heroMat(new THREE.Color(look.hairColor ?? 0x2a1c14).multiplyScalar(0.7).getHex(), 0.9);
  for (const s of [-1, 1]) {
    const ex = s * 0.041;
    const ey = -0.004;
    put(head, sphere(0.022, 16, 12), white, ex, ey, -0.096, undefined, [1.05, soft ? 1.3 : 1.12, 0.4]);
    put(head, sphere(0.0175, 16, 12), iris, ex, ey - 0.001, -0.1, undefined, [0.82, soft ? 1.2 : 1.05, 0.42]);
    put(head, sphere(0.0125, 12, 8), irisTop, ex, ey + 0.008, -0.1028, undefined, [0.86, 0.62, 0.38]);
    put(head, sphere(0.0062, 10, 8), pupil, ex, ey - 0.001, -0.1058, undefined, [0.8, 1.15, 0.35]);
    // the catch-lights: a big one high on the same side in both eyes, a small one low on the other
    put(head, sphere(0.0052, 8, 6), glint, ex + 0.0065, ey + 0.009, -0.1092);
    put(head, sphere(0.0026, 6, 4), glint, ex - 0.0062, ey - 0.008, -0.1086);
    // the upper lash: heavy, curving down at the outer corner into a flick
    put(head, new THREE.BoxGeometry(0.05, 0.0068, 0.008), lash, ex, ey + (soft ? 0.0272 : 0.0235), -0.1, [0, 0, s * -0.1]);
    put(head, new THREE.BoxGeometry(0.014, 0.0045, 0.006), lash, ex + s * 0.026, ey + (soft ? 0.022 : 0.018), -0.096, [0, 0, s * -0.65]);
    if (!soft) put(head, new THREE.BoxGeometry(0.03, 0.0025, 0.005), lash, ex, ey - 0.02, -0.1, [0, 0, s * 0.08]); // a lower line: a calmer, narrower eye
    // thin brows, high on the forehead
    put(head, new THREE.BoxGeometry(0.032, 0.0035, 0.007), brow, ex + s * 0.003, ey + 0.047, -0.098, [0.2, 0, s * (soft ? -0.05 : -0.14)]);
    put(head, sphere(0.02, 10, 8), skin, s * 0.102, 0.002, 0.004, undefined, [0.4, 1, 0.72]); // ears
    // a blush across the cheeks
    if (soft) put(head, sphere(0.017, 12, 8), heroMat(0xf4a8b4, 0.7), s * 0.062, -0.032, -0.09, undefined, [1.35, 0.55, 0.3]);
  }
  put(head, sphere(0.0055, 8, 6), skin, 0, -0.03, -0.11); // a dot of a nose
  const lipC = heroMat(soft ? 0x9a4a5a : 0xb06a72, 0.5);
  if (soft) {
    // a cat smile: two little arcs side by side
    for (const s of [-1, 1]) put(head, new THREE.TorusGeometry(0.0075, 0.0017, 4, 10, Math.PI), lipC, s * 0.0075, -0.052, -0.103, [0, 0, Math.PI]);
  } else put(head, new THREE.BoxGeometry(0.017, 0.003, 0.006), lipC, 0, -0.054, -0.103);
}

// ---------------------------------------------------------------------------------------------
// hair
// ---------------------------------------------------------------------------------------------

export type HeroHair = NonNullable<AvatarLook['heroHair']>;

/**
 * Hair with volume on the head group (r 0.12, the face toward -Z). Every style starts from the same base, which
 * leaves the face open: a cap over the crown, the back and sides behind the ears, and a hairline across the forehead.
 */
export function addHeroHair(head: THREE.Object3D, look: AvatarLook): void {
  const style = look.heroHair ?? 'swept';
  const hair = heroMat(look.hairColor ?? 0x2a1c14, 0.68);
  const hi = heroMat(new THREE.Color(look.hairColor ?? 0x2a1c14).lerp(new THREE.Color(0xffffff), 0.14).getHex(), 0.6);
  // three.js spheres: phi 0 is -X, PI/2 the back (+Z), PI is +X, 3PI/2 the face (-Z)
  const shell = (r: number, phiStart: number, phiLen: number, thetaStart: number, thetaLen: number, m = hair, sx = 0.9, sy = 1, sz = 1.02, y = 0.004, z = 0.004): THREE.Mesh =>
    put(head, new THREE.SphereGeometry(r, 24, 14, phiStart, phiLen, thetaStart, thetaLen), m, 0, y, z, undefined, [sx, sy, sz]);
  const base = (thick = 1, length = 0.6, sides = true): void => {
    shell(0.125 * thick, 0, Math.PI * 2, 0, Math.PI * 0.3); // the crown
    // the back and the sides behind the ears
    shell(0.124 * thick, sides ? -0.28 : 0.15, sides ? Math.PI + 0.56 : Math.PI - 0.3, 0, Math.PI * length);
    // the hairline across the forehead
    shell(0.1235 * thick, Math.PI * 1.12, Math.PI * 0.76, Math.PI * 0.12, Math.PI * 0.14);
  };
  const blob = (x: number, y: number, z: number, r: number, sx: number, sy: number, sz: number, m = hair, rx = 0, rz = 0): void => {
    put(head, sphere(r, 14, 10), m, x, y, z, [rx, 0, rz], [sx, sy, sz]);
  };
  const lock = (x: number, y: number, z: number, len: number, r: number, rx: number, rz: number, m = hair): void => {
    put(head, capsule(r, len), m, x, y, z, [rx, 0, rz]);
  };
  switch (style) {
    case 'buzz':
      base(0.985, 0.52);
      break;
    case 'undercut':
      base(0.99, 0.5, false);
      // the top: thick and swept back off the forehead
      blob(0, 0.085, 0.0, 0.09, 0.86, 0.5, 1.15, hair, 0.25);
      blob(0, 0.098, -0.05, 0.05, 1.2, 0.55, 0.9, hi, 0.5);
      break;
    case 'swept':
      base(1, 0.56);
      blob(0.01, 0.085, -0.01, 0.092, 0.92, 0.48, 1.12, hair, 0.18, -0.15);
      lock(0.04, 0.072, -0.085, 0.06, 0.02, 1.25, -1.0, hi);
      break;
    case 'spiky':
      base(1, 0.5);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const back = Math.sin(a) > 0 ? 1 : 0.7;
        put(head, new THREE.ConeGeometry(0.026, 0.085 * back, 5), i % 2 ? hi : hair, Math.cos(a) * 0.055, 0.112, Math.sin(a) * 0.055 + 0.01, [Math.sin(a) * 0.65, 0, -Math.cos(a) * 0.65]);
      }
      put(head, new THREE.ConeGeometry(0.03, 0.09, 5), hair, 0, 0.13, 0.005);
      break;
    case 'wolf':
      base(1.03, 0.66);
      blob(0, 0.07, 0.01, 0.1, 0.95, 0.55, 1.1);
      // a layered fringe, and the longer layers at the nape
      for (let i = 0; i < 5; i++) lock(-0.05 + i * 0.025, 0.066, -0.09, 0.03, 0.013, 1.5, (i - 2) * 0.22, i % 2 ? hi : hair);
      for (const s of [-1, 1]) for (let j = 0; j < 2; j++) lock(s * (0.09 + j * 0.008), -0.03 - j * 0.035, 0.035 + j * 0.03, 0.07, 0.02, 0.2, s * 0.22);
      lock(0, -0.06, 0.095, 0.08, 0.035, 0.3, 0);
      break;
    case 'waves':
    case 'curls': {
      base(1.04, 0.62);
      blob(0, 0.072, 0.01, 0.1, 0.96, 0.55, 1.1);
      // a side part sweeping across, then long hair falling past the shoulders, in waves
      lock(0.035, 0.07, -0.088, 0.07, 0.022, 1.25, -1.05, hi);
      const n = style === 'curls' ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const a = -0.85 + (i / (n - 1)) * 1.7;
        const x = Math.sin(a) * 0.105;
        const z = Math.cos(a) * 0.075 + 0.035;
        for (let j = 0; j < 3; j++) blob(x * (1 + j * 0.05), -0.04 - j * 0.075, z + j * 0.012, style === 'curls' ? 0.034 : 0.03, 1, 1.35, 0.9, j % 2 ? hi : hair);
      }
      break;
    }
    case 'bob':
      base(1.05, 0.64);
      // full and rounded, ending at the jaw, a soft fringe
      blob(0, 0.03, 0.025, 0.122, 0.98, 0.82, 1.0);
      for (let i = 0; i < 5; i++) lock(-0.05 + i * 0.025, 0.065, -0.093, 0.025, 0.014, 1.55, (i - 2) * 0.1, i % 2 ? hi : hair);
      for (const s of [-1, 1]) blob(s * 0.088, -0.035, -0.035, 0.04, 0.55, 1.1, 0.85);
      break;
    case 'highPony':
    case 'lowPony': {
      base(1, 0.55);
      // swept back off the face into the tie, then the tail
      blob(0, 0.08, 0.02, 0.09, 0.92, 0.5, 1.12);
      const y = style === 'highPony' ? 0.09 : -0.03;
      const z = style === 'highPony' ? 0.1 : 0.115;
      put(head, new THREE.TorusGeometry(0.02, 0.007, 6, 12), heroMat(look.accent ?? 0xff7a1a, 0.5), 0, y, z, [Math.PI / 2 - 0.5, 0, 0]);
      for (let j = 0; j < 4; j++) blob(0, y - 0.025 - j * 0.065, z + 0.02 + j * 0.016, 0.034 - j * 0.004, 1, 1.6, 1, j % 2 ? hi : hair);
      // two face-framing strands
      for (const s of [-1, 1]) lock(s * 0.094, -0.02, -0.05, 0.06, 0.011, 0.1, s * 0.12);
      break;
    }
    case 'braids': {
      base(1.02, 0.58);
      blob(0, 0.08, 0.01, 0.09, 0.94, 0.52, 1.1);
      // a centre part, then two thick braids from behind the ears, over the shoulders and down the front
      put(head, new THREE.BoxGeometry(0.004, 0.004, 0.09), heroMat(look.skin ?? 0xd8a888, 0.7), 0, 0.122, -0.02);
      const tie = heroMat(look.accent ?? 0xff7a1a, 0.5);
      for (const s of [-1, 1]) {
        // woven: the segments overlap, alternating a little side to side
        const n = 17;
        for (let j = 0; j < n; j++) {
          const t = j / (n - 1);
          const x = s * (0.086 + 0.016 * Math.sin(t * Math.PI));
          const y = -0.02 - t * 0.42;
          const z = 0.045 - 0.19 * Math.min(1, t * 1.6);
          blob(x + (j % 2 ? s * 0.005 : -s * 0.005), y, z, 0.027 - t * 0.006, 1.05, 1.15, 0.95, j % 2 ? hi : hair, 0, (j % 2 ? 1 : -1) * 0.5);
        }
        put(head, new THREE.TorusGeometry(0.016, 0.006, 6, 12), tie, s * 0.09, -0.455, -0.145, [Math.PI / 2, 0, 0]);
        put(head, new THREE.ConeGeometry(0.018, 0.05, 8), hair, s * 0.09, -0.49, -0.145, [Math.PI, 0, 0]);
      }
      break;
    }
    case 'animeBun': {
      // fluffy and a little messy: big volume on top, chunky bangs over the forehead (clear of the eyes), locks to the
      // chin, tufts at the nape, a stray strand standing up, and one bun at the side tied with a bow
      base(1.1, 0.6);
      blob(0, 0.072, 0.012, 0.114, 1.0, 0.64, 1.1);
      for (let i = 0; i < 7; i++) {
        const x = -0.072 + i * 0.024;
        const len = 0.05 + (i % 2) * 0.016 - (i === 3 ? 0.012 : 0);
        put(head, new THREE.ConeGeometry(0.024, len, 6), i % 2 ? hi : hair, x, 0.058 + (0.06 - len) * 0.5, -0.102 + Math.abs(x) * 0.12, [Math.PI - 0.32, 0, x * -2.4], [1, 1, 0.55]);
      }
      for (const s of [-1, 1]) {
        put(head, capsule(0.021, 0.07), hair, s * 0.1, -0.035, -0.052, [0.12, 0, s * 0.1]);
        put(head, new THREE.ConeGeometry(0.021, 0.04, 6), hi, s * 0.103, -0.1, -0.056, [Math.PI + 0.12, 0, s * 0.1]);
      }
      for (let i = 0; i < 7; i++) {
        const a = -1.2 + (i / 6) * 2.4;
        const x = Math.sin(a) * 0.1;
        const z = Math.cos(a) * 0.085 + 0.02;
        blob(x, -0.06, z, 0.042, 1, 1.25, 0.9, i % 2 ? hi : hair);
        put(head, new THREE.ConeGeometry(0.02, 0.05, 5), hair, x * 1.12, -0.11, z * 1.08, [Math.PI - Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5]);
      }
      put(head, capsule(0.006, 0.06), hi, 0.012, 0.15, -0.01, [-0.5, 0, -0.35]); // the stray strand
      // the side bun with a swirl, and the bow tied under it
      const bx = 0.09;
      const by = 0.082;
      const bz = 0.04;
      blob(bx, by, bz, 0.05, 1, 1, 1);
      put(head, new THREE.TorusGeometry(0.03, 0.01, 6, 14, Math.PI * 1.6), hi, bx + 0.035, by, bz, [0, Math.PI / 2, 0]);
      const bow = heroMat(look.accent ?? 0xa58ae0, 0.5);
      const kx = bx + 0.012;
      const ky = by - 0.05;
      const kz = bz + 0.04;
      put(head, sphere(0.012, 8, 6), bow, kx, ky, kz);
      for (const s of [-1, 1]) {
        put(head, sphere(0.026, 10, 8), bow, kx, ky + s * 0.024, kz + 0.012, [s * 0.5, 0, 0], [0.4, 1, 0.75]);
        put(head, new THREE.BoxGeometry(0.008, 0.06, 0.016), bow, kx + 0.004, ky - 0.03, kz + 0.01 + s * 0.012, [s * 0.25, 0, 0]);
      }
      break;
    }
    case 'animeBob': {
      // a soft, full bob to the jaw, wispy bangs over the brow (clear of the eyes), longer locks framing the face, and
      // one white streak through the bangs
      base(1.08, 0.62);
      blob(0, 0.06, 0.014, 0.12, 1.0, 0.68, 1.06);
      blob(0, -0.01, 0.03, 0.125, 1.0, 0.8, 0.98);
      const streak = look.hairTip !== undefined ? heroMat(look.hairTip, 0.55) : hi;
      for (let i = 0; i < 7; i++) {
        const x = -0.07 + i * 0.0233;
        const len = 0.058 + (i % 2) * 0.014;
        put(head, new THREE.ConeGeometry(0.021, len, 5), i === 4 ? streak : i % 2 ? hi : hair, x, 0.06 + (0.06 - len) * 0.5, -0.102 + Math.abs(x) * 0.12, [Math.PI - 0.32, 0, x * -2.6], [1, 1, 0.55]);
      }
      for (const s of [-1, 1]) {
        put(head, capsule(0.024, 0.09), hair, s * 0.1, -0.05, -0.045, [0.1, 0, s * 0.08]);
        put(head, new THREE.ConeGeometry(0.024, 0.05, 6), hi, s * 0.101, -0.13, -0.05, [Math.PI + 0.1, 0, s * 0.08]);
        // the bob's rounded edge behind the ears
        blob(s * 0.09, -0.07, 0.04, 0.05, 0.8, 0.9, 1.1);
      }
      break;
    }
    case 'animeSpiky': {
      // a big, light, messy shock of spikes in every direction, spiked bangs over the brow (clear of the eyes)
      base(1.08, 0.52);
      blob(0, 0.08, 0.01, 0.128, 1.08, 0.72, 1.12);
      const spikes: [number, number, number, number][] = [
        [0, 1.3, 0.17, 0.042], [0.7, 1.15, 0.15, 0.04], [-0.7, 1.15, 0.15, 0.04], [1.4, 0.9, 0.14, 0.038], [-1.4, 0.9, 0.14, 0.038],
        [2.1, 0.75, 0.13, 0.036], [-2.1, 0.75, 0.13, 0.036], [2.7, 0.7, 0.12, 0.034], [-2.7, 0.7, 0.12, 0.034], [Math.PI, 0.8, 0.13, 0.036],
        [0.35, 0.55, 0.12, 0.034], [-0.35, 0.55, 0.12, 0.034], [1.05, 0.45, 0.11, 0.032], [-1.05, 0.45, 0.11, 0.032],
        [1.75, 0.35, 0.1, 0.03], [-1.75, 0.35, 0.1, 0.03], [2.45, 0.3, 0.1, 0.03], [-2.45, 0.3, 0.1, 0.03],
      ];
      // [heading round the head (0 = back), lean out from straight up, length, thickness]
      spikes.forEach(([a, lean0, len0, r], i) => {
        const ox = Math.sin(a);
        const oz = Math.cos(a);
        // up and out, rooted on the scalp: the spike's middle sits half its length out from its root
        const lean = lean0 * 0.62;
        const len = len0 * 1.5;
        const dx = ox * Math.sin(lean);
        const dy = Math.cos(lean);
        const dz = oz * Math.sin(lean);
        const m = put(head, new THREE.ConeGeometry(r * 1.3, len, 5), i % 3 === 0 ? hi : hair, ox * 0.06 + dx * len * 0.42, 0.075 + dy * len * 0.42, oz * 0.055 + 0.01 + dz * len * 0.42);
        m.rotation.set(oz * lean, 0, -ox * lean);
      });
      for (let i = 0; i < 6; i++) {
        const x = -0.065 + i * 0.026;
        put(head, new THREE.ConeGeometry(0.022, 0.07 + (i % 2) * 0.02, 5), i % 2 ? hi : hair, x, 0.06, -0.103 + Math.abs(x) * 0.12, [Math.PI - 0.45, 0, x * -3], [1, 1, 0.55]);
      }
      for (const s of [-1, 1]) put(head, new THREE.ConeGeometry(0.024, 0.09, 5), hair, s * 0.105, 0.0, -0.02, [0, 0, s * -2.4]);
      break;
    }
    case 'animeRound': {
      // soft and rounded: a full, fluffy dome of hair, a rounded fringe over the brow (clear of the eyes), soft tufts
      // over the ears and at the nape, a sheen on the crown
      base(1.08, 0.55);
      blob(0, 0.075, 0.012, 0.13, 1.06, 0.7, 1.1);
      blob(0, 0.0, 0.05, 0.118, 1.02, 0.8, 0.9);
      for (let i = 0; i < 5; i++) {
        const x = -0.064 + i * 0.032;
        blob(x, 0.058 - Math.abs(x) * 0.15, -0.098 + Math.abs(x) * 0.18, 0.034, 1.15, 0.85, 0.6, i % 2 ? hi : hair);
      }
      for (const s of [-1, 1]) {
        blob(s * 0.104, 0.005, -0.012, 0.042, 0.62, 1.05, 0.95);
        blob(s * 0.06, -0.06, 0.09, 0.045, 1, 0.8, 0.9);
      }
      blob(0.03, 0.14, -0.02, 0.05, 1.3, 0.55, 1.1, hi);
      break;
    }
    case 'animeLong': {
      // long and straight to the waist, fading to `hairTip` at the ends: fine bangs, long locks framing the face and
      // falling down the front, and a curtain down the back
      const tipC = look.hairTip ?? look.hairColor ?? 0x2a1c14;
      const tip = heroMat(tipC, 0.6);
      const mid = heroMat(new THREE.Color(look.hairColor ?? 0x2a1c14).lerp(new THREE.Color(tipC), 0.45).getHex(), 0.62);
      base(1.06, 0.64);
      blob(0, 0.07, 0.012, 0.106, 0.97, 0.56, 1.1);
      for (let i = 0; i < 8; i++) {
        const x = -0.075 + i * 0.0214;
        if (Math.abs(x) < 0.008) continue; // a parting in the middle
        put(head, new THREE.ConeGeometry(0.016, 0.07, 5), i % 2 ? hi : hair, x, 0.052, -0.1 + Math.abs(x) * 0.15, [Math.PI - 0.28, 0, x * -2], [1, 1, 0.6]);
      }
      for (const s of [-1, 1]) {
        put(head, capsule(0.02, 0.22), hair, s * 0.1, -0.16, -0.06, [0.12, 0, s * 0.06]);
        put(head, capsule(0.019, 0.1), mid, s * 0.104, -0.33, -0.085, [0.16, 0, s * 0.04]);
        put(head, new THREE.ConeGeometry(0.019, 0.07, 8), tip, s * 0.105, -0.42, -0.098, [Math.PI + 0.16, 0, s * 0.04]);
      }
      // the curtain: open behind (the arms and shoulders pass at the sides), its ends in the tip colour
      const curtain = doubleSided;
      put(head, new THREE.CylinderGeometry(0.118, 0.14, 0.4, 22, 1, true, -Math.PI * 0.42, Math.PI * 0.84), curtain(hair), 0, -0.24, 0.008);
      put(head, new THREE.CylinderGeometry(0.14, 0.148, 0.14, 22, 1, true, -Math.PI * 0.4, Math.PI * 0.8), curtain(mid), 0, -0.51, 0.008);
      put(head, new THREE.CylinderGeometry(0.148, 0.12, 0.09, 22, 1, true, -Math.PI * 0.38, Math.PI * 0.76), curtain(tip), 0, -0.625, 0.008);
      for (let i = 0; i < 7; i++) {
        const a = -1.05 + (i / 6) * 2.1;
        put(head, capsule(0.012, 0.5), i % 2 ? hi : hair, Math.sin(a) * 0.137, -0.33, Math.cos(a) * 0.137 + 0.008, [0.04, 0, -Math.sin(a) * 0.03]);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// outfit and signature items
// ---------------------------------------------------------------------------------------------

export type HeroOutfit = NonNullable<AvatarLook['heroOutfit']>;
export type HeroAccessory = NonNullable<AvatarLook['accessories']>[number];

/** Clothing over the base figure: the apron, the jacket's open front and collar, the hood, the coat's skirt, the belt. */
export function addHeroOutfit(body: THREE.Object3D, chest: THREE.Object3D, head: THREE.Object3D, look: AvatarLook, cloth: THREE.Material): void {
  const o = look.heroOutfit ?? 'jacket';
  const accent = heroMat(look.accent ?? 0xff7a1a, 0.6);
  const leather = heroMat(0x3a2418, 0.7);
  const dark = heroMat(0x1c1a1a, 0.7);
  const b = heroBuild(look);
  const w = b === 'm' ? 1 : b === 'lean' ? 0.9 : 0.82;
  // a belt with a buckle (a dress has a sash instead)
  if (o !== 'dress' && o !== 'school') {
    put(body, new THREE.CylinderGeometry(0.14 * w + 0.01, 0.14 * w + 0.01, 0.05, 16), dark, 0, 1.05, 0, undefined, [1, 1, 0.75]);
    put(body, new THREE.BoxGeometry(0.05, 0.04, 0.02), heroMat(0xc8a050, 0.35, { metal: 0.8 }), 0, 1.05, -0.11);
  }
  switch (o) {
    case 'dress':
    case 'uniform': {
      // a fitted bodice (the torso, in the dress's colour), a sash at the waist and a flared skirt: to mid-thigh, or
      // long, fading through a paler band to the accent at the hem
      const skirtM = doubleSided(cloth as THREE.MeshStandardMaterial);
      const hemC = look.accent ?? 0x2a4fb0;
      put(body, new THREE.CylinderGeometry(0.128 * w + 0.012, 0.128 * w + 0.012, 0.045, 18), accent, 0, 1.06, 0, undefined, [1, 1, 0.78]);
      if (look.skirt === 'long') {
        const band = doubleSided(heroMat(new THREE.Color((cloth as THREE.MeshStandardMaterial).color.getHex()).lerp(new THREE.Color(hemC), 0.4).getHex(), 0.7));
        const hem = doubleSided(heroMat(hemC, 0.65));
        put(body, new THREE.CylinderGeometry(0.13 * w, 0.24, 0.3, 22, 1, true), skirtM, 0, 0.9, 0, undefined, [1, 1, 0.86]);
        put(body, new THREE.CylinderGeometry(0.24, 0.29, 0.13, 22, 1, true), band, 0, 0.685, 0, undefined, [1, 1, 0.86]);
        put(body, new THREE.CylinderGeometry(0.29, 0.33, 0.12, 22, 1, true), hem, 0, 0.56, 0, undefined, [1, 1, 0.86]);
        // the sash's tails at the back
        for (const s of [-1, 1]) put(body, new THREE.BoxGeometry(0.035, 0.32, 0.008), accent, s * 0.03, 0.88, 0.12, [0.12, 0, s * 0.1]);
      } else {
        put(body, new THREE.CylinderGeometry(0.13 * w, 0.24, 0.24, 22, 1, true), skirtM, 0, 0.93, 0, undefined, [1, 1, 0.86]);
        put(body, new THREE.CylinderGeometry(0.24, 0.25, 0.03, 22, 1, true), doubleSided(heroMat(hemC, 0.6)), 0, 0.8, 0, undefined, [1, 1, 0.86]);
      }
      // a soft collar, the neckline trimmed in the accent, a panel down the front, and puffed sleeves with cuffs
      put(chest, new THREE.TorusGeometry(0.075, 0.02, 6, 18), cloth, 0, 0.53, 0, [Math.PI / 2, 0, 0], [1, 0.86, 1]);
      for (const s of [-1, 1]) {
        put(chest, new THREE.BoxGeometry(0.012, 0.13, 0.01), accent, s * 0.045, 0.45, -0.112, [0.25, 0, s * 0.6]);
        put(chest, sphere(0.068, 12, 10), cloth, s * 0.19, 0.45, 0, undefined, [1, 0.85, 1]);
        put(chest, new THREE.TorusGeometry(0.052, 0.009, 6, 14), accent, s * 0.205, 0.39, 0, [Math.PI / 2, 0, s * 0.25]);
      }
      put(chest, new THREE.BoxGeometry(0.05, 0.3, 0.01), accent, 0, 0.17, -0.1, [0.08, 0, 0], [1, 1, 1]);
      if (o === 'dress') for (let i = 0; i < 3; i++) put(chest, sphere(0.008, 6, 4), heroMat(0xf8f8fc, 0.3), 0, 0.27 - i * 0.07, -0.108);
      else {
        // the uniform: a high dark collar, wide dark lapels, two rows of gold buttons
        const gold = heroMat(0xe0b040, 0.3, { metal: 0.8 });
        put(chest, new THREE.TorusGeometry(0.078, 0.026, 6, 18), accent, 0, 0.55, 0, [Math.PI / 2, 0, 0], [1, 0.86, 1]);
        for (const s of [-1, 1]) {
          put(chest, new THREE.BoxGeometry(0.05, 0.16, 0.012), accent, s * 0.05, 0.43, -0.112, [0.25, 0, s * 0.45]);
          for (let i = 0; i < 3; i++) put(chest, sphere(0.0095, 6, 4), gold, s * 0.04, 0.3 - i * 0.075, -0.112);
        }
      }
      break;
    }
    case 'school': {
      // a white short-sleeved school blouse tucked into a short dark pleated skirt (the accent), a soft collar
      const skirtM = doubleSided(heroMat(look.accent ?? 0x1c2238, 0.75));
      put(body, new THREE.CylinderGeometry(0.128 * w + 0.012, 0.128 * w + 0.012, 0.045, 18), skirtM, 0, 1.06, 0, undefined, [1, 1, 0.78]);
      put(body, new THREE.CylinderGeometry(0.13 * w, 0.23, 0.22, 14, 1, true), skirtM, 0, 0.94, 0, undefined, [1, 1, 0.86]);
      // the pleats: thin dark folds round the skirt
      const fold = heroMat(0x0e1018, 0.8);
      for (let i = 0; i < 14; i++) {
        const t = (i / 14) * Math.PI * 2;
        put(body, new THREE.BoxGeometry(0.006, 0.2, 0.006), fold, Math.sin(t) * 0.19, 0.935, Math.cos(t) * 0.19 * 0.86, [Math.cos(t) * -0.38, 0, Math.sin(t) * 0.38]);
      }
      put(chest, new THREE.TorusGeometry(0.078, 0.022, 6, 18), cloth, 0, 0.53, 0, [Math.PI / 2, 0, 0], [1, 0.86, 1]);
      for (const s of [-1, 1]) {
        // the collar's points, and short loose sleeves
        put(chest, new THREE.BoxGeometry(0.05, 0.06, 0.01), cloth, s * 0.04, 0.5, -0.112, [0.3, 0, s * 0.7]);
        put(chest, sphere(0.068, 12, 10), cloth, s * 0.19, 0.44, 0, undefined, [1, 0.95, 1]);
      }
      // the buttons down the front
      for (let i = 0; i < 3; i++) put(chest, sphere(0.007, 6, 4), heroMat(0xe8e8ee, 0.3), 0, 0.33 - i * 0.08, -0.106);
      break;
    }
    case 'tunic': {
      // a loose shirt to mid-thigh over a navy turtleneck: the roll of the collar, the V of its neck, the shirt's hem
      const tunic = doubleSided(cloth as THREE.MeshStandardMaterial);
      put(body, new THREE.CylinderGeometry(0.15 * w, 0.2, 0.3, 20, 1, true), tunic, 0, 0.9, 0, undefined, [1, 1, 0.82]);
      put(chest, new THREE.TorusGeometry(0.068, 0.03, 8, 18), accent, 0, 0.55, 0, [Math.PI / 2, 0, 0], [1, 0.9, 1]);
      for (const s of [-1, 1]) put(chest, new THREE.BoxGeometry(0.03, 0.17, 0.012), accent, s * 0.032, 0.44, -0.11 * w, [0.2, 0, s * 0.32]);
      put(chest, new THREE.BoxGeometry(0.045, 0.06, 0.012), accent, 0, 0.47, -0.112 * w);
      // short loose sleeves over the long navy ones
      for (const s of [-1, 1]) put(chest, sphere(0.072, 12, 10), cloth, s * 0.2, 0.44, 0, undefined, [1, 1.05, 1]);
      break;
    }
    case 'apron': {
      // a fitted leather forge apron from the chest to the knees, its straps over the shoulders
      put(chest, new THREE.BoxGeometry(0.26 * w, 0.32, 0.02), leather, 0, 0.27, -0.125 * w);
      put(body, new THREE.BoxGeometry(0.3 * w, 0.5, 0.02), leather, 0, 0.78, -0.13 * w, [-0.05, 0, 0]);
      for (const s of [-1, 1]) put(chest, new THREE.BoxGeometry(0.035, 0.3, 0.03), leather, s * 0.1 * w, 0.4, -0.05, [0.5, 0, 0]);
      put(chest, new THREE.BoxGeometry(0.1, 0.06, 0.012), accent, 0.04, 0.2, -0.138 * w);
      break;
    }
    case 'jacket': {
      // a cropped jacket worn open: its front panels, the collar, the shirt between
      for (const s of [-1, 1]) put(chest, new THREE.BoxGeometry(0.1 * w, 0.38, 0.03), cloth, s * 0.1 * w, 0.27, -0.12 * w, [0, s * -0.12, 0]);
      put(chest, new THREE.BoxGeometry(0.08, 0.36, 0.02), accent, 0, 0.27, -0.118 * w);
      put(chest, new THREE.TorusGeometry(0.1 * w, 0.025, 6, 16, Math.PI * 1.3), cloth, 0, 0.5, 0.0, [Math.PI / 2, 0, Math.PI * 0.85]);
      break;
    }
    case 'hoodie': {
      put(chest, sphere(0.11, 12, 8), cloth, 0, 0.56, 0.1, undefined, [1.2, 0.7, 0.7]); // the hood, down
      put(chest, new THREE.BoxGeometry(0.2 * w, 0.1, 0.03), cloth, 0, 0.12, -0.12 * w); // the pocket
      for (const s of [-1, 1]) put(chest, new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), accent, s * 0.03, 0.38, -0.13 * w);
      break;
    }
    case 'workwear': {
      put(chest, new THREE.BoxGeometry(0.1, 0.08, 0.02), accent, -0.07, 0.36, -0.125 * w); // the chest pocket
      put(body, new THREE.BoxGeometry(0.06, 0.12, 0.04), dark, 0.15 * w, 0.95, -0.02); // a tool pouch
      put(chest, new THREE.TorusGeometry(0.095 * w, 0.02, 6, 16, Math.PI), cloth, 0, 0.5, -0.02, [Math.PI / 2, 0, Math.PI]);
      break;
    }
    case 'coat': {
      const coat = doubleSided(cloth as THREE.MeshStandardMaterial);
      put(body, new THREE.CylinderGeometry(0.15 * w, 0.29 * w, 0.62, 18, 1, true, Math.PI * 0.62, Math.PI * 1.76), coat, 0, 1.06 - 0.31, 0);
      for (const s of [-1, 1]) put(chest, new THREE.BoxGeometry(0.1 * w, 0.4, 0.03), cloth, s * 0.1 * w, 0.27, -0.12 * w, [0, s * -0.1, 0]);
      put(chest, new THREE.TorusGeometry(0.105 * w, 0.03, 6, 16, Math.PI * 1.3), cloth, 0, 0.51, 0, [Math.PI / 2, 0, Math.PI * 0.85]);
      put(chest, new THREE.BoxGeometry(0.035, 0.38, 0.02), accent, 0, 0.27, -0.118 * w);
      break;
    }
  }
  for (const a of look.accessories ?? []) addHeroAccessory(body, chest, head, look, a);
}

/** One signature item on a figure (head items on `head`, pins and scarves on `chest`). */
export function addHeroAccessory(body: THREE.Object3D, chest: THREE.Object3D, head: THREE.Object3D, look: AvatarLook, a: HeroAccessory): void {
  const hairM = heroMat(look.hairColor ?? 0x2a1c14, 0.7);
  const accent = heroMat(look.accent ?? 0xff7a1a, 0.55);
  const gold = heroMat(0xd8b050, 0.3, { metal: 0.85 });
  const dark = heroMat(0x18181c, 0.5);
  switch (a) {
    case 'foxEars':
    case 'catEars':
    case 'bunnyEars':
      for (const s of [-1, 1]) {
        if (a === 'bunnyEars') put(head, capsule(0.024, 0.14), heroMat(0xf2ece6, 0.8), s * 0.05, 0.2, 0.01, [0.15, 0, s * 0.18]);
        else {
          put(head, new THREE.ConeGeometry(a === 'foxEars' ? 0.04 : 0.035, a === 'foxEars' ? 0.1 : 0.075, 4), hairM, s * 0.075, 0.14, 0.005, [0, Math.PI / 4, s * 0.35]);
          put(head, new THREE.ConeGeometry(0.02, 0.05, 4), heroMat(0xf0c0a8, 0.8), s * 0.073, 0.135, -0.012, [0, Math.PI / 4, s * 0.35]);
        }
      }
      break;
    case 'horns':
      for (const s of [-1, 1]) put(head, new THREE.ConeGeometry(0.022, 0.12, 8), heroMat(0x2a2020, 0.35), s * 0.07, 0.12, -0.01, [-0.4, 0, s * 0.6]);
      break;
    case 'crown':
      put(head, new THREE.CylinderGeometry(0.085, 0.09, 0.04, 12, 1, true), gold, 0, 0.12, 0);
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2;
        put(head, new THREE.ConeGeometry(0.014, 0.04, 4), gold, Math.cos(t) * 0.085, 0.155, Math.sin(t) * 0.085);
      }
      break;
    case 'flameCrown':
      for (let i = 0; i < 7; i++) {
        const t = (i / 7) * Math.PI * 2;
        put(head, new THREE.ConeGeometry(0.02, 0.08 + (i % 2) * 0.03, 6), heroMat(0xff7a1a, 0.4, { emissive: 0xff5a10, glow: 2 }), Math.cos(t) * 0.07, 0.15, Math.sin(t) * 0.07);
      }
      break;
    case 'mask':
      put(head, new THREE.SphereGeometry(0.124, 16, 10, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.42, Math.PI * 0.32), heroMat(0xe8e4dc, 0.35), 0, 0, 0, [0, Math.PI, 0]);
      for (const s of [-1, 1]) put(head, new THREE.BoxGeometry(0.03, 0.012, 0.01), dark, s * 0.042, 0.012, -0.124);
      break;
    case 'sharkHood':
      put(head, new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), heroMat(0x5a7a9a, 0.75), 0, 0.01, 0.02, undefined, [1, 1, 1.1]);
      put(head, new THREE.ConeGeometry(0.035, 0.11, 4), heroMat(0x5a7a9a, 0.75), 0, 0.18, 0.04, [-0.4, Math.PI / 4, 0], [0.4, 1, 1]);
      for (let i = 0; i < 6; i++) put(head, new THREE.ConeGeometry(0.008, 0.018, 3), heroMat(0xf4f2ee, 0.4), -0.06 + i * 0.024, 0.085, -0.115, [Math.PI, 0, 0]);
      break;
    case 'scarf':
      put(chest, new THREE.TorusGeometry(0.075, 0.03, 8, 16), accent, 0, 0.54, 0, [Math.PI / 2, 0, 0]);
      put(chest, new THREE.BoxGeometry(0.06, 0.22, 0.025), accent, 0.06, 0.4, -0.11, [0.1, 0, 0.12]);
      break;
    case 'goggles':
      for (const s of [-1, 1]) put(head, new THREE.CylinderGeometry(0.026, 0.026, 0.02, 12), heroMat(0x2a3a3a, 0.2, { metal: 0.5 }), s * 0.042, 0.08, -0.105, [Math.PI / 2 - 0.4, 0, 0]);
      put(head, new THREE.TorusGeometry(0.122, 0.009, 6, 24), dark, 0, 0.075, 0, [Math.PI / 2 - 0.15, 0, 0]);
      break;
    case 'headphones':
      put(head, new THREE.TorusGeometry(0.128, 0.012, 6, 20, Math.PI), look.anime ? accent : dark, 0, 0.02, 0, [0, Math.PI / 2, 0]);
      for (const s of [-1, 1]) put(head, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14), accent, s * 0.125, -0.005, 0, [0, 0, Math.PI / 2]);
      break;
    case 'headset':
      put(head, new THREE.BoxGeometry(0.03, 0.06, 0.05), dark, 0.124, 0, 0);
      put(head, new THREE.BoxGeometry(0.008, 0.008, 0.08), dark, 0.1, -0.045, -0.065, [0, -0.5, 0]);
      break;
    case 'glasses':
    case 'shades': {
      const frame = heroMat(a === 'shades' ? 0x101012 : 0x22262c, 0.4, { metal: 0.4 });
      // an anime face's eyes are bigger and lower: round thin frames around them
      const big = !!look.anime && a === 'glasses';
      const ey = big ? -0.003 : 0.012;
      for (const s of [-1, 1]) {
        if (a === 'shades') put(head, new THREE.BoxGeometry(0.04, 0.022, 0.006), frame, s * 0.043, 0.012, -0.125);
        else put(head, new THREE.TorusGeometry(big ? 0.031 : 0.024, big ? 0.0028 : 0.0035, 6, 20), frame, s * (big ? 0.042 : 0.043), ey, big ? -0.114 : -0.123);
      }
      put(head, new THREE.BoxGeometry(big ? 0.022 : 0.03, 0.004, 0.005), frame, 0, ey + 0.006, big ? -0.117 : -0.126);
      break;
    }
    case 'moonPin':
      put(chest, new THREE.TorusGeometry(0.018, 0.006, 6, 12, Math.PI * 1.4), heroMat(0xe8e4d0, 0.3, { emissive: 0xe8e4d0, glow: 0.6 }), -0.09, 0.4, -0.13);
      break;
    case 'stars':
      for (let i = 0; i < 4; i++) put(chest, new THREE.OctahedronGeometry(0.012), heroMat(0xfff0a0, 0.3, { emissive: 0xffe060, glow: 1 }), -0.12 + i * 0.03, 0.3 + (i % 2) * 0.04, -0.132);
      break;
    case 'phoenixPin':
      put(chest, new THREE.OctahedronGeometry(0.022), heroMat(0xff9a3a, 0.3, { emissive: 0xff6a10, glow: 1.6 }), -0.1, 0.41, -0.13, undefined, [1, 1.4, 0.4]);
      break;
    case 'sash':
      put(chest, new THREE.BoxGeometry(0.06, 0.62, 0.02), accent, 0, 0.26, -0.124, [0, 0, 0.7]);
      break;
    case 'sunHat': {
      // a white wide-brimmed hat worn at a tilt, a band in the accent, and a glowing butterfly resting on the brim
      const hat = heroMat(0xf6f6f8, 0.6);
      const tilt: [number, number, number] = [-0.32, 0, 0.12];
      const hg = new THREE.Group();
      hg.position.set(0, 0.092, 0.012);
      hg.rotation.set(...tilt);
      put(hg, new THREE.SphereGeometry(0.136, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 0, 0, undefined, [1, 0.72, 1.04]);
      put(hg, new THREE.CylinderGeometry(0.26, 0.27, 0.008, 32), doubleSided(hat), 0, 0.002, 0);
      put(hg, new THREE.CylinderGeometry(0.139, 0.139, 0.026, 24, 1, true), doubleSided(accent), 0, 0.018, 0);
      const wing = doubleSided(heroMat(0x8ac8ff, 0.3, { emissive: 0x4aa0ff, glow: 1.2 }));
      const wing2 = doubleSided(heroMat(0x3a6ad8, 0.35, { emissive: 0x2a5ad0, glow: 0.8 }));
      const bx = -0.15;
      const bz = -0.11;
      for (const s of [-1, 1]) {
        put(hg, sphere(0.04, 12, 8), wing, bx + s * 0.03, 0.05, bz, [0, 0, s * -0.55], [1, 0.62, 0.08]);
        put(hg, sphere(0.026, 10, 8), wing2, bx + s * 0.022, 0.018, bz, [0, 0, s * 0.6], [1, 0.62, 0.08]);
      }
      put(hg, capsule(0.005, 0.04), dark, bx, 0.032, bz);
      head.add(hg);
      break;
    }
    case 'starClip': {
      // a little white star clip in the hair, above one ear, and a small bow beside it
      const white = heroMat(0xf6f8ff, 0.4, { emissive: 0xdfe8ff, glow: 0.25 });
      const g = new THREE.Group();
      g.position.set(-0.095, 0.075, -0.045);
      g.rotation.set(0, -1.1, 0.3);
      head.add(g);
      for (let i = 0; i < 5; i++) {
        const t = (i / 5) * Math.PI * 2;
        put(g, new THREE.ConeGeometry(0.012, 0.03, 4), white, Math.sin(t) * 0.014, Math.cos(t) * 0.014, 0, [0, 0, -t], [1, 1, 0.4]);
      }
      put(g, sphere(0.01, 8, 6), white, 0, 0, 0, undefined, [1, 1, 0.5]);
      for (const s of [-1, 1]) put(head, sphere(0.014, 8, 6), white, -0.085 + s * 0.016, 0.1, 0.0, [0, 0, s * 0.5], [1, 0.6, 0.5]);
      break;
    }
    case 'oniHorns':
      // two small red horns, high on the brow, through the hair
      for (const s of [-1, 1]) put(head, new THREE.ConeGeometry(0.017, 0.075, 12), heroMat(0xd01a26, 0.25, { emissive: 0x5a0408, glow: 0.4 }), s * 0.052, 0.14, -0.04, [-0.35, 0, s * 0.42]);
      break;
    case 'headband':
      // a white band over the crown, ear to ear, just behind the bangs
      put(head, new THREE.TorusGeometry(0.13, 0.008, 6, 28, Math.PI), heroMat(0xf6f6f8, 0.5), 0, 0.005, -0.03, [-0.42, 0, 0]);
      break;
    case 'tie': {
      // a short orange tie at the collar
      const t = heroMat(0xf08a1a, 0.55);
      put(chest, new THREE.BoxGeometry(0.05, 0.035, 0.02), t, 0, 0.5, -0.13);
      put(chest, new THREE.BoxGeometry(0.04, 0.12, 0.012), t, 0, 0.43, -0.128, [0.12, 0, 0]);
      break;
    }
    case 'skateboard': {
      // a yellow deck slung across the back, a red arrow on it, wheels to the body
      const g = new THREE.Group();
      g.position.set(0.02, 0.28, 0.17);
      g.rotation.set(0.12, 0, 0.42);
      chest.add(g);
      put(g, new THREE.BoxGeometry(0.2, 0.74, 0.024), heroMat(0xf0d018, 0.5), 0, 0, 0);
      for (const s of [-1, 1]) put(g, new THREE.CylinderGeometry(0.1, 0.1, 0.024, 16, 1, false, 0, Math.PI), heroMat(0xf0d018, 0.5), 0, s * 0.37, 0, [Math.PI / 2, s > 0 ? 0 : Math.PI, 0]);
      const red = heroMat(0xd82018, 0.5);
      put(g, new THREE.BoxGeometry(0.05, 0.3, 0.004), red, 0, -0.04, 0.014);
      put(g, new THREE.ConeGeometry(0.075, 0.13, 3), red, 0, 0.17, 0.014, [0, 0, 0], [1, 1, 0.05]);
      for (const y of [-0.26, 0.26]) for (const s of [-1, 1]) put(g, new THREE.CylinderGeometry(0.028, 0.028, 0.03, 10), heroMat(0xe8e0d8, 0.6), s * 0.075, y, -0.03, [0, 0, Math.PI / 2]);
      break;
    }
    case 'bow':
      // a bow at the collar
      for (const s of [-1, 1]) put(chest, sphere(0.032, 10, 8), accent, s * 0.032, 0.47, -0.115, [0, 0, s * 0.4], [1, 0.62, 0.45]);
      put(chest, sphere(0.013, 8, 6), accent, 0, 0.47, -0.122);
      for (const s of [-1, 1]) put(chest, new THREE.BoxGeometry(0.016, 0.07, 0.006), accent, s * 0.016, 0.42, -0.118, [0, 0, s * 0.25]);
      break;
  }
  void body;
}

/**
 * Merge every plain mesh directly in `group` (not its sub-groups: those move) into one mesh per material, keeping their
 * transforms. A figure's head, chest and hips each become a handful of draw calls.
 */
export function mergeStatic(group: THREE.Object3D): void {
  const byMat = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of group.children) {
    const m = child as THREE.Mesh;
    if (!m.isMesh || m.children.length > 0 || Array.isArray(m.material)) continue;
    const list = byMat.get(m.material as THREE.Material) ?? [];
    list.push(m);
    byMat.set(m.material as THREE.Material, list);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos: THREE.BufferGeometry[] = [];
    for (const m of list) {
      m.updateMatrix();
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position as THREE.BufferAttribute).count * 2), 2));
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    for (const m of list) {
      group.remove(m);
      if (!isHeroPart(m.geometry)) m.geometry.dispose();
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    group.add(mesh);
  }
}
