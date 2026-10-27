/**
 * The named cast of SLIME HOLLOW, built from primitives and drawn the way Excalibur's figures are: three-band toon
 * shading and an ink outline (the inverted hull). One figure, dressed per character, posed by a handful of numbers
 * that the director eases between.
 *
 * Every character is an original design: Kael (the hero the Hollow Slime takes), Raigen (his sworn brother), Suzu
 * (Raigen's little sister), Goro (the shield of the clan), Nagi (the silent scout), Oriha (the healer) and Captain
 * Auren of the Iron Choir.
 */
import * as THREE from 'three';

const bands = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]), 3, 1);
bands.minFilter = bands.magFilter = THREE.NearestFilter;
bands.needsUpdate = true;

export const toon = (color: number | THREE.Color, emissive = 0x000000): THREE.MeshToonMaterial =>
  new THREE.MeshToonMaterial({ color, emissive, gradientMap: bands });

/** The ink line: back faces pushed out along their normals, drawn black. */
export function inkMaterial(thick: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0x050208, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${thick.toFixed(4)};`);
  };
  return m;
}
const INK = inkMaterial(0.012);

function part(geo: THREE.BufferGeometry, mat: THREE.Material, ink: THREE.Material | null = INK): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  if (ink) mesh.add(new THREE.Mesh(geo, ink));
  return mesh;
}

/** A limb that hangs down from its pivot. */
function limbGeo(r1: number, r2: number, len: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  g.translate(0, -len / 2, 0);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------

export interface Pose {
  /** torso pitch forward */
  lean: number;
  /** torso turn */
  twist: number;
  /** torso lean to the side */
  tilt: number;
  /** head pitch (+ looks down) */
  head: number;
  /** head turn */
  look: number;
  /** shoulder pitch (0 hanging, -1.57 straight forward, -3 overhead) */
  armR: number;
  armL: number;
  /** arm out to the side */
  outR: number;
  outL: number;
  /** elbow bend (negative bends the forearm forward) */
  elbowR: number;
  elbowL: number;
  /** the weapon in each hand, turned about the wrist (0: along the forearm) */
  bladeR: number;
  bladeL: number;
  /** both knees bent */
  crouch: number;
  /** down on the right knee */
  kneel: number;
  /** sitting on the ground, legs out in front */
  sit: number;
  /** tipped back onto the ground */
  lie: number;
}

const P = (o: Partial<Pose>): Pose => ({
  lean: 0.04, twist: 0, tilt: 0, head: 0, look: 0, armR: 0.05, armL: 0.05, outR: 0.12, outL: 0.12, elbowR: -0.2, elbowL: -0.2,
  bladeR: 0, bladeL: 0, crouch: 0, kneel: 0, sit: 0, lie: 0, ...o,
});

/** Every pose any of the cast takes (each figure uses its own share). */
export const POSES = {
  idle: P({}),
  walk: P({ lean: 0.12, head: 0.15 }),
  /** walking out of the smoke: head down, the blade trailing */
  trudge: P({ lean: 0.2, head: 0.45, armR: 0.15, bladeR: 0.3 }),
  run: P({ lean: 0.45, armR: -0.6, armL: 0.5, elbowR: -1.2, elbowL: -1.3 }),
  dash: P({ lean: 0.75, twist: 0.3, armR: 0.9, armL: -0.3, elbowR: -0.3, elbowL: -1.1, crouch: 0.35, bladeR: 1.5 }),
  /** on his knees where it happened, head bowed */
  grieve: P({ lean: 0.55, head: 0.6, armR: -0.4, armL: -0.4, elbowR: -0.9, elbowL: -0.9, kneel: 1, crouch: 0.2 }),
  /** standing, facing them, the sword hanging */
  stand: P({ lean: 0.02, head: 0.18, armR: 0.08, bladeR: 0.15 }),
  /** the order: chin up, the blade lifted toward them */
  order: P({ lean: -0.08, head: -0.12, armR: -1.1, outR: 0.2, elbowR: -0.15, bladeR: -0.25, armL: 0.15, outL: 0.35 }),
  /** the Hollow let loose: arms flung out, head back */
  unleash: P({ lean: -0.3, head: -0.5, armR: -0.4, armL: -0.4, outR: 1.3, outL: 1.3, elbowR: -0.1, elbowL: -0.1, bladeR: 0.6 }),
  /** hanging in the air above them, the blade down */
  hover: P({ lean: 0.18, head: 0.42, armR: 0.25, armL: 0.1, outR: 0.35, outL: 0.6, crouch: 0.35, bladeR: 0.2 }),
  overhead: P({ lean: -0.15, head: -0.1, armR: -2.9, armL: -2.9, outR: -0.1, outL: -0.1, elbowR: -0.4, elbowL: -0.4, bladeR: 0.2, crouch: 0.2 }),
  /** the dive: the blade driven down */
  strike: P({ lean: 0.7, head: 0.3, armR: -1.2, armL: -1.2, outR: -0.15, outL: -0.15, elbowR: -0.3, elbowL: -0.3, bladeR: 0.6, crouch: 0.5 }),
  /** pressing down on the blade that caught his */
  press: P({ lean: 0.45, head: 0.2, armR: -1.5, armL: -1.45, outR: -0.15, outL: -0.12, elbowR: -0.55, elbowL: -0.55, bladeR: 1.05, crouch: 0.4 }),
  struck: P({ lean: -0.5, tilt: 0.35, head: -0.6, look: 0.6, armR: 0.5, armL: -0.3, outR: 0.9, outL: 0.9, bladeR: 0.9, crouch: 0.1 }),
  /** kneeling after, empty */
  spent: P({ lean: 0.4, head: 0.55, armR: 0.2, armL: 0.25, outR: 0.2, outL: 0.25, elbowR: -0.6, kneel: 1, sit: 0.2, bladeR: 1.4 }),
  /** kneeling, holding her */
  hold: P({ lean: 0.3, head: 0.35, armR: -1.2, armL: -1.2, outR: -0.35, outL: -0.35, elbowR: -1.4, elbowL: -1.4, kneel: 1, bladeR: 1.4 }),

  // Raigen
  propped: P({ lean: -0.1, head: 0.25, armR: 0.2, armL: 0.35, outR: 0.4, outL: 0.5, elbowR: -0.5, elbowL: -0.2, sit: 1, lie: 0.35, bladeR: 1.5, bladeL: 0.2 }),
  lookUp: P({ lean: 0.1, head: -0.15, look: 0.2, armR: 0.1, armL: -0.4, outR: 0.4, outL: 0.3, elbowR: -0.5, elbowL: -0.6, sit: 1, lie: 0.15, bladeR: 1.5 }),
  rise: P({ lean: 0.5, head: -0.2, armR: 0.3, armL: 0.6, crouch: 0.6, kneel: 0.5, bladeR: 1.2 }),
  /** the catch: the blade held level overhead, both hands */
  catch: P({ lean: 0.15, head: -0.35, armR: -2.35, armL: -2.2, outR: 0.25, outL: -0.1, elbowR: -0.6, elbowL: -0.9, bladeR: 1.55, crouch: 0.55 }),
  /** the scabbard swung into the side of his head */
  whack: P({ lean: 0.35, twist: -0.8, head: -0.1, armR: -1.9, armL: -1.5, outR: 0.4, outL: 1.25, elbowR: -0.9, elbowL: -0.1, bladeR: 1.4, bladeL: 1.5, crouch: 0.45 }),
  /** gone still on the ground */
  still: P({ lean: 0, head: 0.2, look: 0.9, armR: -0.3, armL: 0.4, outR: 1.1, outL: 0.6, lie: 1, bladeR: 1.4, bladeL: 1.4 }),
  slump: P({ lean: 0.55, head: 0.5, armR: 0.3, armL: 0.25, outR: 0.3, outL: 0.3, sit: 1, lie: 0.1, bladeR: 1.4, bladeL: 1.4 }),
  smile: P({ lean: 0.2, head: 0.1, look: -0.35, armR: 0.3, armL: -0.6, outL: 0.6, elbowL: -1.2, sit: 1, lie: 0.15, bladeR: 1.4, bladeL: 1.4 }),

  // Suzu
  huddle: P({ lean: 0.55, head: 0.5, armR: -0.9, armL: -0.9, outR: -0.4, outL: -0.4, elbowR: -1.8, elbowL: -1.8, kneel: 1, crouch: 0.4 }),
  carried: P({ lean: 0.2, head: 0.4, armR: -1.2, armL: -1.2, outR: -0.5, outL: -0.5, elbowR: -1.6, elbowL: -1.6, crouch: 1 }),
  hug: P({ lean: 0.25, head: -0.1, armR: -1.5, armL: -1.5, outR: -0.45, outL: -0.45, elbowR: -1.3, elbowL: -1.3, crouch: 0.2 }),

  // Goro
  plant: P({ lean: 0.05, head: 0.05, armR: -0.75, armL: -0.75, outR: -0.25, outL: -0.25, elbowR: -0.5, elbowL: -0.5, bladeR: 0.95, crouch: 0.05 }),
  shield: P({ lean: 0.25, head: -0.1, armR: -1.3, armL: -0.4, outR: 0.4, outL: 1.25, elbowR: -0.4, bladeR: 0.35, crouch: 0.45 }),

  // Nagi
  watch: P({ lean: 0.45, head: -0.15, armR: 0.2, armL: 0.2, outR: 0.3, outL: 0.3, elbowR: -0.9, elbowL: -0.9, bladeR: 1.4, bladeL: 1.4, crouch: 0.85 }),
  carry: P({ lean: 0.4, head: 0.1, armR: -1.3, armL: -1.1, outR: -0.2, outL: -0.2, elbowR: -1.2, elbowL: -1.2, bladeR: 1.4, bladeL: 1.4, crouch: 0.25 }),
  guard: P({ lean: 0.3, head: -0.1, armR: -1.2, armL: -0.9, outR: 0.4, outL: 0.6, elbowR: -0.8, elbowL: -1.2, bladeR: 1.9, bladeL: 1.9, crouch: 0.55 }),

  // Oriha
  heal: P({ lean: 0.5, head: 0.4, armR: -1.2, armL: -1.2, outR: -0.15, outL: -0.15, elbowR: -0.3, elbowL: -0.3, kneel: 1 }),

  // Auren
  officer: P({ lean: 0.02, head: -0.05, armR: 0.1, armL: -0.4, outL: 0.25, elbowL: -1.5, bladeR: 0.1 }),
  stagger: P({ lean: -0.4, head: -0.4, armR: -0.8, armL: -1.0, outR: 0.6, outL: 0.6, crouch: 0.2, bladeR: 0.5 }),
  fallen: P({ lean: -0.2, head: -0.3, armR: 0.3, armL: 0.5, outR: 0.7, outL: 0.7, sit: 1, lie: 0.45, bladeR: 1.2 }),
  beg: P({ lean: 0.55, head: -0.35, armR: -1.3, armL: -1.3, outR: -0.35, outL: -0.35, elbowR: -1.6, elbowL: -1.6, kneel: 1, crouch: 0.5 }),
  cower: P({ lean: 0.85, head: 0.6, armR: -2.3, armL: -2.3, outR: -0.3, outL: -0.3, elbowR: -2.2, elbowL: -2.2, kneel: 1, crouch: 0.8 }),
  crawl: P({ lean: 1.1, head: -0.4, armR: -1.2, armL: -1.0, elbowR: -0.3, elbowL: -0.3, kneel: 1, crouch: 0.9 }),
  limp: P({ lean: 0.3, tilt: 0.15, head: 0.35, armR: 0.2, armL: -0.6, elbowL: -1.4 }),
} satisfies Record<string, Pose>;
export type PoseName = keyof typeof POSES;

// ---------------------------------------------------------------------------------------------------------------------

type Weapon = 'katana' | 'scabbard' | 'greatsword' | 'knife' | null;
export interface Look {
  /** overall size: 1 is 1.75 m */
  scale: number;
  skin: number;
  hair: number;
  /** the hair: a short cap, spikes, and strands behind of `hairLen` metres */
  spikes: number;
  hairLen: number;
  top: number;
  bottom: number;
  accent: number;
  /** a long coat or robe below the waist (0: none) */
  skirt: number;
  horns?: { side: -1 | 0 | 1; size: number; curl?: boolean }[];
  mask?: boolean;
  glasses?: boolean;
  /** a fur mantle over the shoulders */
  mantle?: number;
  /** a cape (colour) */
  cape?: number;
  /** armour: breastplate and gorget (colour) */
  plate?: number;
  /** a plume on top (colour) */
  plume?: number;
  weaponR?: Weapon;
  weaponL?: Weapon;
  /** a scabbard worn at the left hip */
  hipScabbard?: boolean;
  /** a sash round the waist (colour) */
  sash?: number;
  /** bandages (white) round the head and an arm */
  bandaged?: boolean;
}

export class Figure {
  readonly root = new THREE.Group();
  readonly pose: Pose = { ...POSES.idle };
  /** 0: standing, 1: running */
  stride = 0;
  /** the points of the weapons (world position via getWorldPosition) */
  readonly tipR = new THREE.Object3D();
  readonly tipL = new THREE.Object3D();
  /** the head, for the camera and the effects */
  readonly headAt = new THREE.Object3D();
  readonly hairMat: THREE.MeshToonMaterial;
  readonly eyeMat: THREE.MeshBasicMaterial;
  /** the long strands behind, scaled by `setHair` */
  private readonly strands = new THREE.Group();
  private readonly cape: THREE.Mesh | null = null;
  private readonly capeBase: Float32Array | null = null;
  private readonly capeMat: THREE.MeshToonMaterial | null = null;
  readonly weaponR = new THREE.Group();
  readonly weaponL = new THREE.Group();
  private phase = Math.random() * 6;
  private readonly body = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly shoulders: THREE.Group[] = [];
  private readonly elbows: THREE.Group[] = [];
  private readonly hands: THREE.Group[] = [];
  private readonly thighs: THREE.Group[] = [];
  private readonly shins: THREE.Group[] = [];

  constructor(readonly look: Look) {
    const skin = toon(look.skin);
    this.hairMat = toon(look.hair);
    const top = toon(look.top);
    const bottom = toon(look.bottom);
    const accent = toon(look.accent);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x140c10 });

    this.root.scale.setScalar(look.scale);
    this.root.add(this.body);
    this.body.add(this.hips);

    // hips and the coat or robe below the waist
    const pelvis = part(new THREE.CylinderGeometry(0.15, 0.17, 0.2, 10), bottom);
    pelvis.position.y = -0.04;
    this.hips.add(pelvis);
    if (look.skirt > 0) {
      const skirt = part(new THREE.CylinderGeometry(0.17, 0.3, look.skirt, 12, 1, true), top);
      (skirt.material as THREE.Material).side = THREE.DoubleSide;
      skirt.position.y = -look.skirt / 2 + 0.02;
      this.hips.add(skirt);
    }
    if (look.sash !== undefined) {
      const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.175, 0.07, 12), toon(look.sash));
      sash.position.y = 0.07;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.015), toon(look.sash));
      tail.position.set(0.12, -0.1, -0.13);
      tail.rotation.z = 0.15;
      this.hips.add(sash, tail);
    }
    if (look.hipScabbard) {
      const sc = part(new THREE.BoxGeometry(0.035, 0.9, 0.05), toon(0x140a0c));
      sc.position.set(-0.19, -0.12, -0.05);
      sc.rotation.set(0.9, 0, 0.15);
      this.hips.add(sc);
    }

    // torso
    this.hips.add(this.torso);
    const waist = part(new THREE.CylinderGeometry(0.13, 0.15, 0.26, 10), top);
    waist.position.y = 0.12;
    const chest = part(new THREE.CylinderGeometry(0.2, 0.14, 0.34, 10), top);
    chest.position.y = 0.4;
    chest.scale.z = 0.72;
    this.torso.add(waist, chest);
    // the open collar of a coat: a stripe of the accent colour down the front
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.01), accent);
    collar.position.set(0, 0.4, 0.125);
    this.torso.add(collar);
    if (look.plate !== undefined) {
      const plateMat = toon(look.plate);
      const bp = part(new THREE.CylinderGeometry(0.205, 0.15, 0.3, 10), plateMat);
      bp.position.y = 0.41;
      bp.scale.z = 0.78;
      const gorget = part(new THREE.CylinderGeometry(0.075, 0.12, 0.09, 10), plateMat);
      gorget.position.y = 0.6;
      this.torso.add(bp, gorget);
      for (const sx of [-1, 1]) {
        const pa = part(new THREE.SphereGeometry(0.095, 10, 8), plateMat);
        pa.scale.set(1.2, 0.8, 1);
        pa.position.set(sx * 0.22, 0.53, 0);
        this.torso.add(pa);
      }
    }
    if (look.mantle !== undefined) {
      const fur = toon(look.mantle);
      for (let i = 0; i < 9; i++) {
        const a = (i / 8 - 0.5) * 3.2;
        const tuft = part(new THREE.DodecahedronGeometry(0.11, 0), fur);
        tuft.position.set(Math.sin(a) * 0.2, 0.56 - Math.abs(a) * 0.02, Math.cos(a) * 0.1 - 0.02);
        tuft.scale.set(1.2, 0.8, 1);
        this.torso.add(tuft);
      }
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), skin);
    neck.position.y = 0.6;
    this.torso.add(neck);

    // head
    this.head.position.y = 0.63;
    this.torso.add(this.head);
    const face = part(new THREE.SphereGeometry(0.1, 14, 10), skin);
    face.position.y = 0.1;
    face.scale.set(0.95, 1.05, 1);
    this.head.add(face);
    this.headAt.position.set(0, 0.12, 0.05);
    this.head.add(this.headAt);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.01), this.eyeMat);
      eye.position.set(sx * 0.038, 0.11, 0.094);
      this.head.add(eye);
    }
    const cap = part(new THREE.SphereGeometry(0.108, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), this.hairMat);
    cap.position.set(0, 0.115, -0.01);
    // and down over the back of the head to the nape
    const back = part(new THREE.SphereGeometry(0.106, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), this.hairMat);
    back.rotation.x = -1.75;
    back.position.set(0, 0.1, -0.012);
    this.head.add(cap, back);
    // a fringe over the brow
    const fringe = part(new THREE.BoxGeometry(0.17, 0.045, 0.04), this.hairMat);
    fringe.position.set(0, 0.17, 0.065);
    fringe.rotation.x = 0.7;
    this.head.add(fringe);
    for (let i = 0; i < look.spikes; i++) {
      const a = (i / Math.max(1, look.spikes - 1) - 0.5) * 2.6;
      const spike = part(new THREE.ConeGeometry(0.035, 0.14, 5), this.hairMat);
      spike.position.set(Math.sin(a) * 0.08, 0.19 - Math.abs(a) * 0.02, -0.02 + Math.cos(a) * -0.04);
      spike.rotation.set(-0.9, 0, -a * 0.55);
      this.head.add(spike);
    }
    // the strands behind: unit length, scaled to the hair's length
    this.strands.position.set(0, 0.17, -0.06);
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 2.2;
      const g = new THREE.BoxGeometry(0.06, 1, 0.025);
      g.translate(0, -0.5, 0);
      const s = part(g, this.hairMat);
      s.position.set(Math.sin(a) * 0.085, 0, Math.cos(a) * -0.03);
      s.rotation.set(0.12, a * 0.25, a * 0.08);
      this.strands.add(s);
    }
    this.head.add(this.strands);
    this.setHair(look.hairLen);
    for (const h of look.horns ?? []) {
      const len = 0.14 * h.size;
      const geo = h.curl ? new THREE.TorusGeometry(0.06 * h.size, 0.018 * h.size, 5, 10, Math.PI * 1.1) : new THREE.ConeGeometry(0.024 * h.size, len, 6);
      const horn = part(geo, toon(0x16100e));
      if (h.curl) {
        horn.position.set(h.side * 0.1, 0.18, -0.02);
        horn.rotation.set(0, Math.PI / 2, h.side > 0 ? -0.6 : Math.PI + 0.6);
      } else {
        horn.position.set(h.side * 0.055, 0.2 + len * 0.35, 0.02);
        horn.rotation.set(-0.35, 0, -h.side * 0.35);
      }
      this.head.add(horn);
    }
    if (look.mask) {
      const mask = part(new THREE.CylinderGeometry(0.104, 0.09, 0.09, 12, 1, true, -Math.PI * 0.55, Math.PI * 1.1), toon(0x2a2830));
      (mask.material as THREE.Material).side = THREE.DoubleSide;
      mask.position.y = 0.06;
      this.head.add(mask);
    }
    if (look.glasses) {
      const rim = new THREE.MeshBasicMaterial({ color: 0x1a1418 });
      for (const sx of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 4, 14), rim);
        lens.position.set(sx * 0.04, 0.11, 0.098);
        this.head.add(lens);
      }
    }
    if (look.plume !== undefined) {
      const helm = part(new THREE.SphereGeometry(0.115, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), toon(look.plate ?? 0x8a8c96));
      helm.position.y = 0.11;
      const crest = part(new THREE.BoxGeometry(0.03, 0.12, 0.26), toon(look.plume));
      crest.position.set(0, 0.25, -0.04);
      this.head.add(helm, crest);
    }
    if (look.bandaged) {
      // a headband of bandage, hugging the brow
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.011, 4, 18), toon(0xe8e2d8));
      wrap.rotation.x = Math.PI / 2 + 0.12;
      wrap.position.y = 0.135;
      this.head.add(wrap);
    }

    // arms: upper arm, forearm, hand; [0] is the right arm (-x, the figure faces +z), [1] the left
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.21, 0.51, 0);
      sh.add(part(limbGeo(0.048, 0.042, 0.29), top));
      const el = new THREE.Group();
      el.position.y = -0.29;
      el.add(part(limbGeo(0.04, 0.034, 0.27), sx < 0 && look.bandaged ? toon(0xe8e2d8) : top));
      const hand = new THREE.Group();
      hand.position.y = -0.29;
      hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), skin));
      el.add(hand);
      sh.add(el);
      this.torso.add(sh);
      this.shoulders.push(sh);
      this.elbows.push(el);
      this.hands.push(hand);
    }
    this.hands[0].add(this.weaponR);
    this.hands[1].add(this.weaponL);
    this.weaponR.add(this.tipR);
    this.weaponL.add(this.tipL);
    this.arm(this.weaponR, this.tipR, look.weaponR ?? null);
    this.arm(this.weaponL, this.tipL, look.weaponL ?? null);

    // legs
    for (const sx of [-1, 1]) {
      const th = new THREE.Group();
      th.position.set(sx * 0.09, -0.02, 0);
      th.add(part(limbGeo(0.07, 0.058, 0.45), bottom));
      const shin = new THREE.Group();
      shin.position.y = -0.45;
      shin.add(part(limbGeo(0.056, 0.044, 0.43), bottom));
      const boot = part(new THREE.BoxGeometry(0.085, 0.065, 0.19), toon(0x1a1416));
      boot.position.set(0, -0.43, 0.04);
      shin.add(boot);
      th.add(shin);
      this.hips.add(th);
      this.thighs.push(th);
      this.shins.push(shin);
    }

    if (look.cape !== undefined) {
      // a cloak that streams behind; ragged at the hem
      const g = new THREE.PlaneGeometry(0.56, 1.25, 4, 10);
      g.translate(0, -0.62, 0);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -1.2) pos.setY(i, pos.getY(i) + Math.sin(i * 2.7) * 0.12);
      this.capeMat = toon(look.cape);
      this.capeMat.side = THREE.DoubleSide;
      this.cape = new THREE.Mesh(g, this.capeMat);
      this.cape.position.set(0, 0.56, -0.13);
      this.torso.add(this.cape);
      this.capeBase = Float32Array.from(pos.array as Float32Array);
    }
  }

  private arm(group: THREE.Group, tip: THREE.Object3D, w: Weapon): void {
    group.clear();
    group.add(tip);
    if (!w) return;
    // weapons point down the forearm's line out of the fist (local -y)
    const steel = toon(0xb8c0cc);
    const dark = toon(0x16100e);
    const len = w === 'greatsword' ? 1.45 : w === 'knife' ? 0.26 : 0.86;
    const wide = w === 'greatsword' ? 0.16 : w === 'knife' ? 0.035 : 0.034;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, w === 'greatsword' ? 0.3 : 0.2, 6), dark);
    grip.position.y = 0.0;
    group.add(grip);
    if (w === 'scabbard') {
      const sc = part(new THREE.BoxGeometry(0.04, len, 0.055), toon(0x1a0a0e));
      sc.position.y = -0.12 - len / 2;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.06), toon(0xb02030));
      band.position.y = -0.3;
      group.add(sc, band);
    } else {
      const guard = part(new THREE.BoxGeometry(w === 'greatsword' ? 0.36 : 0.09, 0.025, w === 'greatsword' ? 0.06 : 0.09), dark);
      guard.position.y = -0.11;
      const blade = part(new THREE.BoxGeometry(wide, len, 0.012), steel);
      blade.position.y = -0.12 - len / 2;
      group.add(guard, blade);
    }
    tip.position.y = -0.12 - len;
  }

  /** Hair length (metres of the strands behind) and colour. */
  setHair(len: number, color?: THREE.Color): void {
    this.strands.visible = len > 0.03;
    this.strands.scale.set(1, Math.max(0.01, len), 1);
    if (color) this.hairMat.color.copy(color);
  }

  /** The cloak's colour (the Hollow darkens and edges it). */
  setCape(color: THREE.Color, visible = true): void {
    if (!this.cape || !this.capeMat) return;
    this.cape.visible = visible;
    this.capeMat.color.copy(color);
  }

  update(dt: number, time: number): void {
    const p = this.pose;
    this.phase += dt * 11 * this.stride;
    const s = Math.sin(this.phase) * this.stride;
    const bob = Math.abs(Math.cos(this.phase)) * 0.05 * this.stride;
    // how low the hips sit: crouching, kneeling, sitting, lying down
    const hipY = 0.92 - p.crouch * 0.26 - p.kneel * 0.42 - p.sit * (0.78 - p.kneel * 0.4) - p.lie * 0.8 * (1 - p.sit) + bob;
    this.body.position.y = Math.max(0.1, hipY);
    // tipped back about the hips: lying flat, the legs point forward along the ground
    this.body.rotation.x = -p.lie * 1.45;
    this.torso.rotation.set(p.lean + Math.sin(time * 1.6 + this.phase) * 0.012, p.twist, p.tilt);
    this.head.rotation.set(p.head, p.look, 0);

    // legs: a walk cycle over the crouch, the right knee down for a kneel, out in front for a sit
    const sitK = p.sit * (1 - p.lie);
    this.thighs[0].rotation.x = -p.crouch * 0.9 - s * 0.85 + p.kneel * 0.15 - sitK * 1.45;
    this.shins[0].rotation.x = p.crouch * 1.5 + Math.max(0, s) * 1.2 + p.kneel * 1.45 + sitK * 0.15;
    this.thighs[1].rotation.x = -p.crouch * 0.5 + s * 0.85 - p.kneel * 1.45 - sitK * 1.45;
    this.shins[1].rotation.x = p.crouch * 0.9 + Math.max(0, -s) * 1.2 + p.kneel * 1.45 + sitK * 0.1;
    this.thighs[0].rotation.z = -sitK * 0.12;
    this.thighs[1].rotation.z = sitK * 0.12;

    // arms: swinging a little with the walk unless they are busy
    const swing = s * 0.5;
    this.shoulders[0].rotation.set(p.armR + swing, 0, -p.outR);
    this.shoulders[1].rotation.set(p.armL - swing, 0, p.outL);
    this.elbows[0].rotation.x = p.elbowR;
    this.elbows[1].rotation.x = p.elbowL;
    this.weaponR.rotation.x = p.bladeR;
    this.weaponL.rotation.x = p.bladeL;

    if (this.cape && this.capeBase) {
      const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) {
        const down = -this.capeBase[i + 1];
        a[i + 2] = this.capeBase[i + 2] - down * (0.1 + this.stride * 0.5 + Math.max(0, p.lean) * 0.35) - Math.sin(time * 3.4 + down * 4 + this.capeBase[i] * 4) * down * 0.07;
      }
      pos.needsUpdate = true;
    }
  }
}

/** Ease every number of `pose` towards `target` (frame-rate independent). */
export function easePose<T extends object>(pose: T, target: T, rate: number, dt: number): void {
  const k = 1 - Math.exp(-rate * dt);
  const p = pose as Record<string, number>;
  const t = target as Record<string, number>;
  for (const key in t) p[key] += (t[key] - p[key]) * k;
}

// ---------------------------------------------------------------------------------------------------------------------
// the cast

export const KAEL_HAIR = new THREE.Color(0x2a2026);
export const KAEL_HOLLOW_HAIR = new THREE.Color(0xeef4f8);

export function makeCast(): { kael: Figure; raigen: Figure; suzu: Figure; goro: Figure; nagi: Figure; oriha: Figure; auren: Figure } {
  return {
    // short dark hair and a plain grey coat; the Hollow lengthens and whitens the hair and grows the cloak
    kael: new Figure({ scale: 1, skin: 0xf0e0d6, hair: 0x2a2026, spikes: 5, hairLen: 0.08, top: 0x4a4650, bottom: 0x24222a, accent: 0x6a6670, skirt: 0.5, cape: 0x050508, weaponR: 'katana', sash: 0x302c34 }),
    // one black horn, a red sash, a katana and its scabbard
    raigen: new Figure({ scale: 1.03, skin: 0xe8cdb8, hair: 0x15101a, spikes: 7, hairLen: 0.22, top: 0x1c1820, bottom: 0x1a161c, accent: 0xb02030, skirt: 0.42, horns: [{ side: 1, size: 1.25 }], sash: 0xb02030, weaponR: 'katana', weaponL: 'scabbard', bandaged: true }),
    // twin small horns, white hair, a haori too big for her
    suzu: new Figure({ scale: 0.72, skin: 0xf6e6dc, hair: 0xf2eee8, spikes: 3, hairLen: 0.18, top: 0xf0b8a0, bottom: 0x6a3a40, accent: 0xffd8c8, skirt: 0.55, horns: [{ side: -1, size: 0.8 }, { side: 1, size: 0.8 }] }),
    // huge, two curled horns, a wolf-fur mantle, a greatsword
    goro: new Figure({ scale: 1.3, skin: 0xdcb898, hair: 0xd8b060, spikes: 6, hairLen: 0.12, top: 0x5a3c1c, bottom: 0x2e2218, accent: 0xd89030, skirt: 0.3, horns: [{ side: -1, size: 1.4, curl: true }, { side: 1, size: 1.4, curl: true }], mantle: 0x8a7a68, weaponR: 'greatsword' }),
    // a cloth mask, short white hair, twin knives
    nagi: new Figure({ scale: 0.95, skin: 0xeedfd6, hair: 0xd8d4dc, spikes: 4, hairLen: 0.06, top: 0x3a3448, bottom: 0x2a2634, accent: 0x7a6a98, skirt: 0, mask: true, weaponR: 'knife', weaponL: 'knife' }),
    // glasses, a long braid, a healer's robe
    oriha: new Figure({ scale: 0.96, skin: 0xf2e2d8, hair: 0x5a3a2a, spikes: 0, hairLen: 0.55, top: 0x2e5a48, bottom: 0x24302a, accent: 0x9adcb0, skirt: 0.62, glasses: true }),
    // the Choir's youngest officer: a gorget, a cracked breastplate, a white crest
    auren: new Figure({ scale: 0.98, skin: 0xf2dcc8, hair: 0xe0c070, spikes: 0, hairLen: 0.05, top: 0xe8e2d4, bottom: 0x4a4038, accent: 0xd8a830, skirt: 0.4, plate: 0x9a9ca6, plume: 0xf4f0e8, weaponR: 'katana' }),
  };
}
