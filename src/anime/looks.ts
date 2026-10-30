/**
 * The Sakura District's kinds of infected, dressed: each kind wears its own VroidStudio body (`ANIME_CAST.kinds`), its
 * own colours (a tint with garments recoloured - the miko's red hakama, the Kuchisake's red coat) and its own gear on
 * the stand-in skeleton's joints (the Oni's club, the Jorogumo's legs, the Empress's parasol), so every kind reads at a
 * glance. The Court (living people) only change colour. Gear is a handful of low meshes per figure on shared geometry
 * and materials; it hides with the model when the infected is drawn in the far crowd.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MujinKind, ZombieVariant } from '../enemies/variants';
import type { Dims, JointName } from './figure';
import type { AnimeTint } from './vrm';

export type SakuraKind = Exclude<ZombieVariant, '' | 'court'>;

/** Where gear goes: a joint of the stand-in figure (it faces -Z, +X on its right; arms and legs hang along -Y). */
export type GearPut = (joint: JointName, o: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Object3D;

export interface KindLook {
  tint: AnimeTint;
  /** Colours of the far crowd's boxes (`farCrowd.ts`). */
  far: { skin: number; cloth: number };
  gear?: (put: GearPut, D: Dims) => void;
  /** A per-frame touch on the gear (the Jorogumo's legs creep). */
  sway?: (gear: THREE.Object3D[], t: number) => void;
  /** MUJIN's Rail Crawler: the whole figure lies forward this far (rad), dragging itself on its arms. */
  lie?: number;
  /** MUJIN's White Shape: the whole figure wriggles from side to side. */
  wriggle?: boolean;
}

// ---------------------------------------------------------------------------------------------
// shared materials and geometry
// ---------------------------------------------------------------------------------------------

const mats = new Map<string, THREE.Material>();
function mat(key: string, color: number, opts: { glow?: number; metal?: number; rough?: number; side?: THREE.Side } = {}): THREE.Material {
  let m = mats.get(key);
  if (!m) {
    const s = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.7, metalness: opts.metal ?? 0, side: opts.side ?? THREE.FrontSide });
    if (opts.glow) {
      s.emissive.set(color);
      s.emissiveIntensity = opts.glow;
    }
    m = s;
    mats.set(key, m);
  }
  return m;
}

const geos = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  return o;
};

/** Several shapes baked into one geometry (one draw). */
function baked(key: string, parts: () => THREE.BufferGeometry[]): THREE.BufferGeometry {
  return geo(key, () => mergeGeometries(parts().map((g) => g.toNonIndexed()), false)!);
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry =>
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));

/** A blossom cluster: five-petal flowers round a centre (pink, faintly lit). */
const blossoms = (): THREE.BufferGeometry =>
  baked('blossoms', () => {
    const out: THREE.BufferGeometry[] = [];
    const flowers = [[0, 0, 0], [0.05, 0.03, 0.01], [-0.045, 0.02, 0.02], [0.01, 0.055, -0.02], [-0.02, -0.04, 0.01], [0.04, -0.03, -0.015]];
    for (const [x, y, z] of flowers) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        out.push(at(new THREE.SphereGeometry(0.018, 5, 3).scale(1, 0.45, 1), x! + Math.cos(a) * 0.018, y!, z! + Math.sin(a) * 0.018));
      }
    }
    return out;
  });

// ---------------------------------------------------------------------------------------------
// gear
// ---------------------------------------------------------------------------------------------

/**
 * Held in a hand, at the wrist. The item is built hanging along -Y; `tilt` swings it about the hand's side-to-side
 * axis (0 hangs down, PI/2 points ahead of the hand, toward PI it stands up).
 */
const inHand = (put: GearPut, D: Dims, side: 'R' | 'L', o: THREE.Object3D, tilt = 0): void => {
  const g = new THREE.Group();
  g.add(o);
  g.rotation.x = tilt;
  put(side === 'R' ? 'foreR' : 'foreL', g, 0, -D.fore - 0.02, -0.02);
};

function surgicalMask(put: GearPut, D: Dims): void {
  const g = geo('mask', () => new THREE.CylinderGeometry(0.075, 0.075, 0.075, 10, 1, true, -Math.PI * 0.42, Math.PI * 0.84).rotateY(Math.PI));
  const m = mesh(g, mat('mask', 0xeceae4, { side: THREE.DoubleSide, rough: 0.9 }));
  put('head', m, 0, D.head * 0.2, -0.005);
}

function scissors(put: GearPut, D: Dims): void {
  const g = baked('scissors', () => [
    at(new THREE.BoxGeometry(0.022, 0.46, 0.006), 0.012, -0.25, 0, 0, 0, 0.12),
    at(new THREE.BoxGeometry(0.022, 0.46, 0.006), -0.012, -0.25, 0, 0, 0, -0.12),
  ]);
  const handles = geo('scissorRings', () => mergeGeometries([at(new THREE.TorusGeometry(0.035, 0.009, 4, 10), 0.03, 0.02, 0), at(new THREE.TorusGeometry(0.035, 0.009, 4, 10), -0.03, 0.02, 0)])!);
  const s = new THREE.Group();
  s.add(mesh(g, mat('steel', 0xd8dde4, { metal: 0.9, rough: 0.25 })), mesh(handles, mat('crimson', 0x8a1424)));
  inHand(put, D, 'R', s, 1.35);
}

function spiderLegs(put: GearPut, D: Dims, list: THREE.Object3D[]): void {
  const upper = geo('legUp', () => new THREE.CylinderGeometry(0.024, 0.034, 0.48, 5).translate(0, 0.24, 0));
  const lower = geo('legLo', () => new THREE.ConeGeometry(0.026, 0.7, 5).translate(0, -0.35, 0));
  const chitin = mat('chitin', 0x1a1220, { rough: 0.35, metal: 0.3 });
  const tip = mat('chitinRed', 0x9a1030, { glow: 0.4 });
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1;
    const k = i % 4;
    const leg = new THREE.Group();
    const a = mesh(upper, chitin);
    a.rotation.z = -side * (0.65 + k * 0.08);
    const knee = new THREE.Group();
    knee.position.set(0, 0.48, 0);
    const b = mesh(lower, k % 2 ? tip : chitin);
    // the lower leg reaches down and out from the knee, like a spider's
    b.rotation.z = side * (1.05 + k * 0.08);
    knee.add(b);
    a.add(knee);
    leg.add(a);
    leg.rotation.y = side * (-0.9 + k * 0.6);
    leg.userData.base = leg.rotation.y;
    leg.userData.k = i;
    put('torso', leg, side * 0.06, D.torso * 0.55, 0.1);
    list.push(leg);
  }
}

function gohei(put: GearPut, D: Dims): void {
  const stick = geo('goheiStick', () => new THREE.CylinderGeometry(0.008, 0.008, 0.55, 5).translate(0, -0.2, 0));
  const paper = baked('shide', () => {
    const out: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) out.push(at(new THREE.PlaneGeometry(0.05, 0.045), s * (0.03 + (k % 2) * 0.012), -0.42 - k * 0.045, 0, 0, s * 0.5, 0));
    return out;
  });
  const g = new THREE.Group();
  g.add(mesh(stick, mat('wood', 0xc8a070)), mesh(paper, mat('paper', 0xf6f4ee, { side: THREE.DoubleSide, rough: 1 })));
  inHand(put, D, 'R', g, 2.5);
}

function suzu(put: GearPut, D: Dims): void {
  const bells = baked('suzu', () => {
    const out: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.01, 0.01, 0.16, 5).translate(0, -0.06, 0)];
    for (let k = 0; k < 7; k++) out.push(at(new THREE.SphereGeometry(0.018, 6, 4), Math.cos(k) * 0.03, -0.12 - (k % 3) * 0.03, Math.sin(k) * 0.03));
    return out;
  });
  inHand(put, D, 'L', mesh(bells, mat('gold', 0xe0b040, { metal: 0.8, rough: 0.3 })));
}

function ribbon(put: GearPut, D: Dims, color: number): void {
  const g = baked('ribbon', () => [at(new THREE.BoxGeometry(0.1, 0.05, 0.02), -0.05, 0, 0, 0, 0, 0.35), at(new THREE.BoxGeometry(0.1, 0.05, 0.02), 0.05, 0, 0, 0, 0, -0.35), new THREE.BoxGeometry(0.03, 0.035, 0.03)]);
  put('head', mesh(g, mat(`ribbon${color}`, color)), 0, D.head * 0.62, 0.11);
}

function microphone(put: GearPut, D: Dims): void {
  const g = baked('mic', () => [new THREE.CylinderGeometry(0.014, 0.01, 0.17, 6).translate(0, -0.06, 0), at(new THREE.SphereGeometry(0.028, 8, 6), 0, -0.16, 0)]);
  inHand(put, D, 'R', mesh(g, mat('mic', 0x2a2a30, { metal: 0.6, rough: 0.35 })), 2.6);
}

function starClip(put: GearPut, D: Dims): void {
  const g = geo('star', () => {
    const s = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 0.018 : 0.042;
      const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      if (k === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false });
  });
  put('head', mesh(g, mat('starGlow', 0xff7ad0, { glow: 1.6 })), 0.08, D.head * 0.75, -0.04);
}

function kanabo(put: GearPut, D: Dims): void {
  const g = baked('kanabo', () => {
    const out: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.075, 0.035, 1.05, 8).translate(0, -0.52, 0)];
    for (let k = 0; k < 14; k++) {
      const y = -0.35 - (k % 7) * 0.1;
      const a = k * 2.4;
      out.push(at(new THREE.ConeGeometry(0.018, 0.05, 4), Math.cos(a) * 0.07, y, Math.sin(a) * 0.07, Math.sin(a) * 1.57, 0, -Math.cos(a) * 1.57));
    }
    return out;
  });
  inHand(put, D, 'R', mesh(g, mat('iron', 0x2c2a2a, { metal: 0.7, rough: 0.45 })), 0.9);
}

function oniHorns(put: GearPut, D: Dims): void {
  const g = baked('oniHorns', () => [at(new THREE.ConeGeometry(0.03, 0.14, 6), 0.055, 0, 0, 0, 0, -0.35), at(new THREE.ConeGeometry(0.03, 0.14, 6), -0.055, 0, 0, 0, 0, 0.35)]);
  put('head', mesh(g, mat('ivory', 0xf0e6cc, { rough: 0.5 })), 0, D.head * 0.82, -0.05);
}

function blooms(put: GearPut, D: Dims, list: THREE.Object3D[]): void {
  const g = blossoms();
  const m = mat('blossom', 0xffa8cc, { glow: 0.55, rough: 0.8 });
  const spots: [JointName, number, number, number, number][] = [
    ['torso', D.shoulderX * 0.9, D.torso * 0.95, 0.02, 2.2],
    ['torso', -D.shoulderX * 0.8, D.torso * 0.85, 0.05, 1.9],
    ['torso', 0.02, D.torso * 0.6, 0.13, 2.6],
    ['torso', -0.06, D.torso * 0.3, 0.12, 2],
    ['head', 0.08, D.head * 0.7, 0.02, 1.7],
    ['head', -0.07, D.head * 0.85, 0.04, 1.4],
    ['torso', -0.05, D.torso * 0.35, -0.11, 1.6],
    ['armL', 0, -D.upper * 0.5, 0.05, 1.5],
    ['armR', 0, -D.upper * 0.3, 0.05, 1.4],
  ];
  for (const [j, x, y, z, s] of spots) {
    const o = mesh(g, m);
    o.scale.setScalar(s);
    o.rotation.set(x * 9, y * 7, z * 5);
    put(j, o, x, y, z);
    list.push(o);
  }
}

function roots(put: GearPut, D: Dims): void {
  const g = baked('roots', () => {
    const out: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 0.06, -0.15, Math.sin(a) * 0.06), new THREE.Vector3(Math.cos(a + 0.8) * 0.08, -0.32, Math.sin(a + 0.8) * 0.08), new THREE.Vector3(Math.cos(a + 1.4) * 0.05, -0.5, Math.sin(a + 1.4) * 0.05)];
      out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.012, 4, false));
    }
    return out;
  });
  const bark = mat('bark', 0x4a3424, { rough: 1 });
  put('legL', mesh(g, bark), 0, -0.02, 0);
  put('legR', mesh(g, bark), 0, -0.1, 0).rotation.y = 1.3;
  const back = mesh(g, bark);
  back.rotation.x = Math.PI;
  put('torso', back, 0, D.torso * 0.5, 0.1);
}

function briefcase(put: GearPut, D: Dims): void {
  const g = baked('briefcase', () => [new THREE.BoxGeometry(0.09, 0.3, 0.4).translate(0, -0.2, 0), at(new THREE.TorusGeometry(0.035, 0.008, 4, 8, Math.PI), 0, -0.04, 0, 0, Math.PI / 2, 0)]);
  inHand(put, D, 'L', mesh(g, mat('leather', 0x3a2618, { rough: 0.6 })));
}

function glasses(put: GearPut, D: Dims): void {
  const g = baked('glasses', () => [at(new THREE.TorusGeometry(0.024, 0.004, 4, 12), 0.033, 0, 0), at(new THREE.TorusGeometry(0.024, 0.004, 4, 12), -0.033, 0, 0), new THREE.BoxGeometry(0.02, 0.005, 0.005)]);
  put('head', mesh(g, mat('frames', 0x101014)), 0, D.head * 0.42, -0.085);
}

function parasol(put: GearPut, D: Dims): void {
  const stick = geo('parasolStick', () => new THREE.CylinderGeometry(0.01, 0.01, 1.15, 5).translate(0, 0.45, 0));
  const canopy = geo('parasolTop', () => new THREE.ConeGeometry(0.62, 0.24, 16, 1, true).translate(0, 1.1, 0));
  const g = new THREE.Group();
  g.add(mesh(stick, mat('wood', 0xc8a070)), mesh(canopy, mat('wagasa', 0xa8102a, { side: THREE.DoubleSide, rough: 0.8 })));
  put('foreL', g, 0, -D.fore, 0.02);
}

/** The Tall Lady's wide summer hat. */
function sunHat(put: GearPut, D: Dims): void {
  const g = baked('sunHat', () => [new THREE.CylinderGeometry(0.3, 0.3, 0.012, 18), at(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 14), 0, 0.05, 0)]);
  put('head', mesh(g, mat('sunHat', 0xf4efe2, { rough: 0.95 })), 0, D.head * 0.82, 0);
}

/** The Stationmaster's peaked cap, and the hand lamp he carries down the platform. */
function stationCap(put: GearPut, D: Dims): void {
  const g = baked('stationCap', () => [new THREE.CylinderGeometry(0.105, 0.1, 0.07, 14), at(new THREE.BoxGeometry(0.16, 0.012, 0.08), 0, -0.03, -0.1, 0.25)]);
  put('head', mesh(g, mat('capNavy', 0x141a2c, { rough: 0.6 })), 0, D.head * 0.78, 0);
  const band = geo('capBand', () => new THREE.CylinderGeometry(0.107, 0.107, 0.018, 14, 1, true));
  put('head', mesh(band, mat('capGold', 0xc8a040, { metal: 0.7, rough: 0.35 })), 0, D.head * 0.72, 0);
}
function handLamp(put: GearPut, D: Dims): void {
  const lamp = new THREE.Group();
  lamp.add(mesh(geo('lampBody', () => new THREE.BoxGeometry(0.1, 0.14, 0.1).translate(0, -0.12, 0)), mat('lampTin', 0x2a2a2a, { metal: 0.6 })));
  lamp.add(mesh(geo('lampGlass', () => new THREE.BoxGeometry(0.07, 0.08, 0.07).translate(0, -0.12, 0)), mat('lampGlow', 0xffc060, { glow: 2.4 })));
  inHand(put, D, 'L', lamp, 0);
}

function crown(put: GearPut, D: Dims): void {
  const g = blossoms();
  const m = mat('crimsonBloom', 0xff2850, { glow: 0.9 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const o = mesh(g, m);
    o.scale.setScalar(0.85);
    put('head', o, Math.cos(a) * 0.08, D.head * 0.88, Math.sin(a) * 0.08);
  }
}

// ---------------------------------------------------------------------------------------------
// the kinds
// ---------------------------------------------------------------------------------------------

const TOPS = /Tops|Onepice|Onepiece/i;
const BOTTOMS = /Bottoms/i;

const SAKURA_LOOKS: Record<Exclude<SakuraKind, MujinKind>, KindLook> = {
  // the 07:12 to the city every morning for twenty years: still in the suit, still carrying the case, eyes gone milky
  commuter: {
    tint: { key: 'commuter', skin: 0x9aa494, cloth: 0x9098a4, hair: 0x7c7c80, eyes: 0xc8d4dc, outlines: false, parts: [{ match: TOPS, color: 0x8a9098 }, { match: /Tie/i, color: 0x6a1a24, flat: true }] },
    far: { skin: 0x9aa494, cloth: 0x4a4e58 },
    gear: (put, D) => {
      briefcase(put, D);
      glasses(put, D);
    },
  },
  // full of blossom, pink under the skin
  bloomed: {
    tint: { key: 'bloomed', skin: 0xf0c8d4, cloth: 0xf4c4d4, hair: 0xf8a0c8, eyes: 0xff6fb0, outlines: false },
    far: { skin: 0xf0c0d0, cloth: 0xd890b0 },
    gear: (put, D) => blooms(put, D, []),
  },
  // lay in the park's petals: mud, bark, roots grown through them
  rooted: {
    tint: { key: 'rooted', skin: 0x8c8466, cloth: 0x7a6a50, hair: 0x5a4a38, eyes: 0xa8ff58, outlines: false },
    far: { skin: 0x8c8466, cloth: 0x5a4a34 },
    gear: roots,
  },
  // the slit-mouthed woman: pale, a mask, a long red coat, the shears
  kuchisake: {
    tint: { key: 'kuchisake', skin: 0xe4dcd8, cloth: 0x8a2a24, hair: 0x40363c, eyes: 0xff2020, outlines: false, parts: [{ match: TOPS, color: 0x8c2a22, flat: true }, { match: BOTTOMS, color: 0x24181a, flat: true }, { match: /Accessory/i, color: 0x8c2a22, flat: true }] },
    far: { skin: 0xe4dcd8, cloth: 0x8c2a22 },
    gear: (put, D) => {
      surgicalMask(put, D);
      scissors(put, D);
    },
  },
  // the spider-woman of the tunnels: a black dress, violet eyes, eight legs
  jorogumo: {
    tint: { key: 'jorogumo', skin: 0xb8acd0, cloth: 0x2a2030, hair: 0x2a2036, eyes: 0xc040ff, outlines: false, parts: [{ match: TOPS, color: 0x1c1424, flat: true }] },
    far: { skin: 0xb8acd0, cloth: 0x1c1424 },
    gear: (put, D) => spiderLegs(put, D, []),
    sway: (gear, t) => {
      for (const g of gear) {
        if (g.userData.base === undefined) continue;
        g.rotation.y = g.userData.base + Math.sin(t * 7 + g.userData.k * 1.3) * 0.12;
      }
    },
  },
  // the shrine maiden: white kosode, red hakama, the gohei and the kagura bells
  miko: {
    tint: { key: 'miko', skin: 0xccc4bc, cloth: 0xf0ece4, hair: 0x2a2226, eyes: 0xff3040, outlines: false, parts: [{ match: TOPS, color: 0xf2efe6, flat: true }, { match: BOTTOMS, color: 0xb3142a, flat: true }, { match: /Tie|Accessory/i, color: 0xb3142a, flat: true }, { match: /Shoes/i, color: 0xece8e0, flat: true }] },
    far: { skin: 0xccc4bc, cloth: 0xb3142a },
    gear: (put, D) => {
      gohei(put, D);
      suzu(put, D);
      ribbon(put, D, 0xb3142a);
    },
  },
  // Mei Hoshino, still in the stage dress from the posters, still holding the microphone
  idol: {
    tint: { key: 'idol', skin: 0xe4d4dc, cloth: 0xffd8ec, hair: 0xf4e4f4, eyes: 0xff60e0, outlines: false },
    far: { skin: 0xe4d4dc, cloth: 0xf0a0d0 },
    gear: (put, D) => {
      microphone(put, D);
      starClip(put, D);
    },
  },
  // red-skinned, horned, the iron club
  oni: {
    tint: { key: 'oni', skin: 0xff5440, cloth: 0x586480, hair: 0xf8f0e0, eyes: 0xffc020, outlines: false },
    far: { skin: 0xd0604c, cloth: 0x3a4460 },
    gear: (put, D) => {
      kanabo(put, D);
      oniHorns(put, D);
    },
  },
  // the Crimson Empress: Sayo Kurenai, in crimson, a crown of blossom and the red parasol
  empress: {
    tint: { key: 'empress', skin: 0xf4e4ec, cloth: 0x7a0f22, hair: 0xffeef4, eyes: 0xff1848, outlines: true, parts: [{ match: TOPS, color: 0x7a0f22, flat: true }] },
    far: { skin: 0xf4e4ec, cloth: 0x7a0f22 },
    gear: (put, D) => {
      parasol(put, D);
      crown(put, D);
    },
  },
};

/** MUJIN's kinds (`enemies/variants.ts`): the station's own. */
const MUJIN_LOOKS: Record<MujinKind, KindLook> = {
  // a white summer dress, a wide hat, long black hair; taller than the doorways
  tall: {
    tint: { key: 'tall', skin: 0xeee8e4, cloth: 0xf4f1ea, hair: 0x0e0c0e, eyes: 0x101010, outlines: false, parts: [{ match: TOPS, color: 0xf4f1ea, flat: true }, { match: BOTTOMS, color: 0xf4f1ea, flat: true }] },
    far: { skin: 0xeee8e4, cloth: 0xf4f1ea },
    gear: sunHat,
  },
  // what is left of a passenger: grey, lying forward on the sleepers, arms out
  crawler: {
    tint: { key: 'crawler', skin: 0x7a8278, cloth: 0x50545a, hair: 0x30302e, eyes: 0xff4020, outlines: false },
    far: { skin: 0x7a8278, cloth: 0x40444a },
    lie: 1.25,
  },
  // white all over, faceless, wriggling
  shape: {
    tint: { key: 'shape', skin: 0xffffff, cloth: 0xffffff, hair: 0xffffff, eyes: 0xffffff, outlines: false, parts: [{ match: /./, color: 0xffffff, flat: true }] },
    far: { skin: 0xffffff, cloth: 0xffffff },
    wriggle: true,
  },
  // grey as the bench it sits on, its face turned to the window
  sitter: {
    tint: { key: 'sitter', skin: 0xa8aaa6, cloth: 0x6a6c70, hair: 0x2a2a2c, eyes: 0xd8e0e4, outlines: false },
    far: { skin: 0xa8aaa6, cloth: 0x5a5c60 },
  },
  // navy uniform, the cap and the lamp
  master: {
    tint: { key: 'master', skin: 0xc8c0b8, cloth: 0x1c2440, hair: 0xb8b8b8, eyes: 0xffd060, outlines: true, parts: [{ match: TOPS, color: 0x1c2440, flat: true }, { match: BOTTOMS, color: 0x141a2c, flat: true }] },
    far: { skin: 0xc8c0b8, cloth: 0x1c2440 },
    gear: (put: GearPut, D: Dims) => {
      stationCap(put, D);
      handLamp(put, D);
    },
  },
};

export const KIND_LOOKS: Record<SakuraKind, KindLook> = { ...SAKURA_LOOKS, ...MUJIN_LOOKS };

/** The Kurenai Court: living people in the theatre's crimson (no infected look, no gear). */
export const COURT_TINT: AnimeTint = {
  key: 'court',
  skin: 0xffffff,
  cloth: 0xffffff,
  hair: 0xffffff,
  eyes: null,
  outlines: true,
  parts: [{ match: TOPS, color: 0x8a1424, flat: true }, { match: BOTTOMS, color: 0x1c1a1e, flat: true }, { match: /Accessory|Tie/i, color: 0xe8e4dc, flat: true }],
};
