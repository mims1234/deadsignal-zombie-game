/**
 * VRoid / VRM characters for the Sakura District. A model file (`public/anime/*.vrm`, made in VRoid Studio) is loaded
 * once as a template; every character on screen is a skeleton clone of it that shares its geometry, textures and
 * materials (an infected tint is one shared material set per model, not per zombie).
 *
 * Clones are driven by retargeting: a stand-in skeleton (the game's `Avatar` for people, the posable `StyleFigure` for
 * the infected) is posed as usual, and each frame the model's own bones are turned to match it - the hips, spine and
 * head copy its rotations, the arms and legs reach its hands and feet with a two-bone solve at the model's own limb
 * lengths. Fingers are curled once into a grip. Expressions (blinks, a snarl) are the model's own blend shapes.
 *
 * Kept cheap on purpose: no spring-bone physics on clones (hair and skirts are stiff), the infected draw without the
 * ink outline pass, and loading is all up front.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { type VRM, VRMAimConstraint, VRMLoaderPlugin, type VRMHumanBoneName, VRMNodeConstraintManager, VRMRollConstraint, VRMRotationConstraint, VRMUtils } from '@pixiv/three-vrm';

/**
 * Stand-ins for any missing model, first found wins: `stand-in.vrm` ships with the game as a placeholder until the
 * cast's own models are added; `test/sample.vrm` is a local, git-ignored one for development.
 */
const STAND_INS = ['stand-in.vrm', 'test/sample.vrm'];
const standIn = (): AnimeTemplate | null => STAND_INS.map((f) => templates.get(f)).find((t) => !!t) ?? null;

const BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
] as const satisfies readonly VRMHumanBoneName[];
export type Bone = (typeof BONES)[number];

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const;
const FINGER_SEGS = { Thumb: ['Metacarpal', 'Proximal', 'Distal'], Index: ['Proximal', 'Intermediate', 'Distal'], Middle: ['Proximal', 'Intermediate', 'Distal'], Ring: ['Proximal', 'Intermediate', 'Distal'], Little: ['Proximal', 'Intermediate', 'Distal'] } as const;

/** Rest measurements of a model, in its own metres, standing on y = 0 and facing +Z. */
export interface AnimeMeasure {
  height: number;
  /** Upper-leg pivot (hip joint) height and half-spread. */
  legTop: number;
  hipX: number;
  knee: number;
  ankle: number;
  shoulderY: number;
  shoulderX: number;
  upperArm: number;
  foreArm: number;
  neck: number;
  headBone: number;
}

export interface AnimeTemplate {
  file: string;
  /** Character name from the file's own metadata. */
  title: string;
  author: string;
  scene: THREE.Group;
  /** Raw bone node name for each humanoid bone the model has. */
  boneNames: Map<string, string>;
  /** Expression name -> blend shapes to drive (mesh by its index in traversal order). */
  expressions: Map<string, { mesh: number; index: number; weight: number }[]>;
  measure: AnimeMeasure;
  /** Node constraints (twist bones and the like), by node name: rebuilt on every clone. */
  constraints: ConstraintDef[];
  tris: number;
  materials: number;
  /** Shared infected material sets, by tint key. */
  tints: Map<string, Map<THREE.Material, THREE.Material>>;
  /** A man's body (VRoid's male base: its body material is named M00_...): he groans in a man's voice. */
  male: boolean;
}

/** A node constraint, by node names (the VRM runtime's own constraints point at the template's nodes). */
interface ConstraintDef {
  kind: 'roll' | 'aim' | 'rotation';
  dst: string;
  src: string;
  weight: number;
  axis?: string;
}

// ---------------------------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------------------------

const templates = new Map<string, AnimeTemplate | null>();
const pending = new Map<string, Promise<AnimeTemplate | null>>();
let loader: GLTFLoader | null = null;

async function fetchModel(file: string): Promise<AnimeTemplate | null> {
  const res = await fetch(`anime/${file}`).catch(() => null);
  if (!res?.ok) return null;
  const buf = await res.arrayBuffer();
  // a missing file can come back as the dev server's index page: check for the glTF magic
  if (buf.byteLength < 4 || new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'glTF') return null;
  loader ??= new GLTFLoader().register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(buf, '');
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) return null;
  return makeTemplate(file, vrm);
}

/** Load a model file once (later calls share the promise); null when it is missing or not a VRM. */
export function loadAnime(file: string): Promise<AnimeTemplate | null> {
  let p = pending.get(file);
  if (!p) {
    p = fetchModel(file)
      .catch((e: unknown) => {
        console.warn(`[anime] ${file}: ${String(e)}`);
        return null;
      })
      .then((t) => {
        templates.set(file, t);
        return t;
      });
    pending.set(file, p);
  }
  return p;
}

/**
 * A loaded model for a slot: the file itself, else the first of `fallbacks` that loaded, else the local stand-in,
 * else nothing (the caller uses the game's stock figure).
 */
export function animeModel(file: string | undefined, fallbacks: readonly string[] = []): AnimeTemplate | null {
  for (const f of [file, ...fallbacks]) {
    if (!f) continue;
    const t = templates.get(f);
    if (t) return t;
  }
  return standIn();
}

/** Whether a slot shows its own file, a stand-in, or nothing. */
export function animeSlotState(file: string): 'own' | 'stand-in' | 'none' {
  if (templates.get(file)) return 'own';
  return standIn() ? 'stand-in' : 'none';
}

/** Load every listed file (and the stand-in), in parallel. */
export async function loadAnimeFiles(files: readonly string[]): Promise<void> {
  await Promise.all([...new Set([...files, ...STAND_INS])].map((f) => loadAnime(f)));
}

function makeTemplate(file: string, vrm: VRM): AnimeTemplate {
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene);
  VRMUtils.rotateVRM0(vrm); // VRM 0.x faces -Z; after this every model faces +Z
  // the runtime's own helper rigs are not needed on clones
  vrm.humanoid.normalizedHumanBonesRoot.removeFromParent();
  const scene = vrm.scene as THREE.Group;
  scene.updateMatrixWorld(true);
  const boneNames = new Map<string, string>();
  const at = (name: VRMHumanBoneName): THREE.Vector3 | null => {
    const n = vrm.humanoid.getRawBoneNode(name);
    return n ? n.getWorldPosition(new THREE.Vector3()) : null;
  };
  for (const b of BONES) {
    const n = vrm.humanoid.getRawBoneNode(b);
    if (n) boneNames.set(b, n.name);
  }
  for (const side of ['left', 'right']) {
    for (const f of FINGERS) {
      for (const seg of FINGER_SEGS[f]) {
        const name = `${side}${f}${seg}` as VRMHumanBoneName;
        const n = vrm.humanoid.getRawBoneNode(name);
        if (n) boneNames.set(name, n.name);
      }
    }
  }
  // meshes in traversal order: clones traverse the same way, so blend shapes are found by index
  const meshes: THREE.Object3D[] = [];
  let tris = 0;
  const mats = new Set<THREE.Material>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes.push(m);
    const g = m.geometry;
    tris += (g.index ? g.index.count : g.attributes.position!.count) / 3;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat);
  });
  const expressions = new Map<string, { mesh: number; index: number; weight: number }[]>();
  for (const ex of vrm.expressionManager?.expressions ?? []) {
    const list: { mesh: number; index: number; weight: number }[] = [];
    for (const bind of ex.binds) {
      const b = bind as unknown as { primitives?: THREE.Mesh[]; index?: number; weight?: number };
      if (!b.primitives || b.index === undefined) continue;
      for (const prim of b.primitives) {
        const i = meshes.indexOf(prim);
        if (i >= 0) list.push({ mesh: i, index: b.index, weight: b.weight ?? 1 });
      }
    }
    if (list.length) expressions.set(ex.expressionName, list);
  }
  const constraints: ConstraintDef[] = [];
  for (const c of vrm.nodeConstraintManager?.constraints ?? []) {
    const k = c instanceof VRMRollConstraint ? 'roll' : c instanceof VRMAimConstraint ? 'aim' : c instanceof VRMRotationConstraint ? 'rotation' : null;
    if (!k || !c.destination.name || !c.source.name) continue;
    constraints.push({ kind: k, dst: c.destination.name, src: c.source.name, weight: c.weight, axis: c instanceof VRMRollConstraint ? c.rollAxis : c instanceof VRMAimConstraint ? c.aimAxis : undefined });
  }
  const box = new THREE.Box3().setFromObject(scene);
  const p = (n: VRMHumanBoneName): THREE.Vector3 => at(n) ?? new THREE.Vector3();
  const legL = p('leftUpperLeg');
  const armL = p('leftUpperArm');
  const meta = vrm.meta as { name?: string; title?: string; authors?: string[]; author?: string };
  return {
    file,
    title: meta.name ?? meta.title ?? file,
    author: meta.authors?.join(', ') ?? meta.author ?? '',
    scene,
    boneNames,
    expressions,
    measure: {
      height: box.max.y - Math.min(0, box.min.y),
      legTop: legL.y,
      hipX: Math.abs(legL.x),
      knee: p('leftLowerLeg').y,
      ankle: p('leftFoot').y,
      shoulderY: armL.y,
      shoulderX: Math.abs(armL.x),
      upperArm: armL.distanceTo(p('leftLowerArm')),
      foreArm: p('leftLowerArm').distanceTo(p('leftHand')),
      neck: p('neck').y,
      headBone: p('head').y,
    },
    constraints,
    tris: Math.round(tris),
    materials: mats.size,
    tints: new Map(),
    male: [...mats].some((m) => /^M00_\d+_\d+_Body/.test(m.name)),
  };
}

// ---------------------------------------------------------------------------------------------
// tints: the infected look, as shared material sets
// ---------------------------------------------------------------------------------------------

export interface AnimeTint {
  key: string;
  /** Multiplies skin (lit and shade colours). */
  skin: number;
  /** Multiplies clothes and hair. */
  cloth: number;
  hair: number;
  /** The irises glow this colour; the eye whites go sallow and the catch-lights go out. Null: the model's own eyes. */
  eyes: number | null;
  /** Draw the ink outline pass (two draws per material). */
  outlines: boolean;
  /**
   * Garments recoloured, by material name (VRoid names them `..._Tops_01_CLOTH`, `_Bottoms_`, `_Onepice_`, `_Shoes_`,
   * `_Accessory_`): `flat` drops the texture for a plain colour (the miko's red hakama), otherwise it multiplies;
   * `glow` lights it up. The first match wins, before the skin / cloth / hair multiply.
   */
  parts?: readonly { match: RegExp; color: number; flat?: boolean; glow?: number }[];
}

type MatLike = THREE.Material & { color?: THREE.Color; shadeColorFactor?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; isOutline?: boolean };

function tinted(t: AnimeTemplate, tint: AnimeTint | null): Map<THREE.Material, THREE.Material> | null {
  const key = tint?.key ?? 'own';
  let set = t.tints.get(key);
  if (set) return set;
  set = new Map();
  const seen = new Set<THREE.Material>();
  t.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) seen.add(mat);
  });
  for (const src of seen) {
    const mat = src.clone() as MatLike;
    const name = src.name;
    if (mat.isOutline) mat.visible = tint?.outlines ?? true;
    if (tint) {
      const mul = (c: number): void => {
        mat.color?.multiply(new THREE.Color(c));
        mat.shadeColorFactor?.multiply(new THREE.Color(c));
      };
      const part = tint.parts?.find((p) => p.match.test(name));
      if (part) {
        const m = mat as MatLike & { map?: THREE.Texture | null; shadeMultiplyTexture?: THREE.Texture | null };
        if (part.flat) {
          m.map = null;
          m.shadeMultiplyTexture = null;
          m.color?.set(part.color);
          m.shadeColorFactor?.set(part.color).multiplyScalar(0.55);
          m.needsUpdate = true;
        } else mul(part.color);
        if (part.glow !== undefined) {
          m.emissive?.set(part.color);
          if (m.emissiveIntensity !== undefined) m.emissiveIntensity = part.glow;
        }
      } else if (/Iris/i.test(name)) {
        if (tint.eyes !== null) {
          mat.emissive?.set(tint.eyes);
          if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 1.4;
          mul(tint.eyes);
        }
      } else if (/Highlight/i.test(name)) mat.visible = tint.eyes === null;
      else if (/EyeWhite/i.test(name)) mul(tint.eyes === null ? 0xffffff : 0xd8cc9a);
      else if (/SKIN|Body|Face_/i.test(name)) mul(tint.skin);
      else if (/HAIR/i.test(name)) mul(tint.hair);
      else if (!/FACE|Eye|Brow|Mouth/i.test(name)) mul(tint.cloth);
    }
    set.set(src, mat);
  }
  t.tints.set(key, set);
  return set;
}

// ---------------------------------------------------------------------------------------------
// the body: one clone, retargeted from a stand-in skeleton
// ---------------------------------------------------------------------------------------------

/** What a body follows: the stand-in's joints. Limbs hang along their joint's -Y. */
export interface PoseSource {
  /** The body is parented here (it moves, turns and falls with it). */
  frame: THREE.Object3D;
  /** The hips copy this joint's rotation. */
  pelvis: THREE.Object3D;
  /** Optional: this joint's movement from `rest` moves the whole body (a gait's bob). */
  bob?: { joint: THREE.Object3D; rest: THREE.Vector3 };
  chest: THREE.Object3D;
  head: THREE.Object3D;
  /** Upper arm, forearm and forearm length (to the wrist), right then left. */
  arms: [{ upper: THREE.Object3D; fore: THREE.Object3D; len: number }, { upper: THREE.Object3D; fore: THREE.Object3D; len: number }];
  legs: [{ thigh: THREE.Object3D; shin: THREE.Object3D; len: number }, { thigh: THREE.Object3D; shin: THREE.Object3D; len: number }];
}

export interface AnimeBodyOptions {
  /** Uniform scale of the model. */
  scale: number;
  /** Where the model's origin (its feet) sits in the frame. */
  offset: THREE.Vector3;
  tint: AnimeTint | null;
  /** How far the fingers curl (1 = a grip on a weapon). */
  grip: number;
  shadows: boolean;
}

interface Driven {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
  /** The child joint's direction in this bone's frame (the way the segment points). */
  dir: THREE.Vector3;
  /** Segment length in the frame's metres (the model's scale included). */
  len: number;
  /** Rest rotation relative to the frame (full-copy bones). */
  rel: THREE.Quaternion;
}

const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qC = new THREE.Quaternion();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vD = new THREE.Vector3();
const vE = new THREE.Vector3();
const vF = new THREE.Vector3();
const sA = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function worldQ(o: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
  o.matrixWorld.decompose(vE, out, sA);
  return out;
}

export class AnimeBody {
  /** Model wrapper: faces -Z in the frame, like the game's figures. */
  readonly root = new THREE.Group();
  readonly template: AnimeTemplate;
  private readonly model: THREE.Object3D;
  private readonly b = new Map<Bone, Driven>();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly base = new THREE.Vector3();
  private readonly expr = new Map<string, number>();
  /** The model's twist bones and other constraints, on this clone's nodes. */
  private readonly constraints: VRMNodeConstraintManager | null = null;

  constructor(template: AnimeTemplate, opts: AnimeBodyOptions) {
    this.template = template;
    this.model = cloneSkinned(template.scene);
    this.root.add(this.model);
    this.root.rotation.y = Math.PI;
    this.root.scale.setScalar(opts.scale);
    this.base.copy(opts.offset);
    this.root.position.copy(this.base);
    const byName = new Map<string, THREE.Object3D>();
    this.model.traverse((o) => {
      if (o.name) byName.set(o.name, o);
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        this.meshes.push(m);
        m.castShadow = opts.shadows;
        m.receiveShadow = opts.shadows;
        // a body can lie flat from its feet: bound everything within a height of them
        (m as THREE.SkinnedMesh).boundingSphere = new THREE.Sphere(new THREE.Vector3(0, template.measure.height * 0.5, 0), template.measure.height * 1.2);
        m.userData.noShadow = !opts.shadows;
      }
    });
    this.shareSkeletons(byName);
    this.setTint(opts.tint);
    this.model.updateMatrixWorld(true);
    // rest data, measured with the wrapper as if the frame were identity
    this.root.updateMatrixWorld(true);
    const child: Partial<Record<Bone, Bone>> = {
      leftUpperArm: 'leftLowerArm', leftLowerArm: 'leftHand', rightUpperArm: 'rightLowerArm', rightLowerArm: 'rightHand',
      leftUpperLeg: 'leftLowerLeg', leftLowerLeg: 'leftFoot', rightUpperLeg: 'rightLowerLeg', rightLowerLeg: 'rightFoot',
    };
    for (const name of BONES) {
      const node = byName.get(template.boneNames.get(name) ?? '');
      if (!node) continue;
      const c = child[name];
      const cNode = c ? byName.get(template.boneNames.get(c) ?? '') : undefined;
      const dir = cNode ? cNode.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const len = cNode ? cNode.getWorldPosition(new THREE.Vector3()).distanceTo(node.getWorldPosition(new THREE.Vector3())) : 0;
      this.b.set(name, { bone: node, rest: node.quaternion.clone(), dir, len, rel: worldQ(node, new THREE.Quaternion()) });
    }
    this.curl(byName, opts.grip);
    if (template.constraints.length) {
      const mgr = new VRMNodeConstraintManager();
      for (const c of template.constraints) {
        const dst = byName.get(c.dst);
        const src = byName.get(c.src);
        if (!dst || !src) continue;
        const k = c.kind === 'roll' ? new VRMRollConstraint(dst, src) : c.kind === 'aim' ? new VRMAimConstraint(dst, src) : new VRMRotationConstraint(dst, src);
        if (k instanceof VRMRollConstraint && c.axis) k.rollAxis = c.axis as VRMRollConstraint['rollAxis'];
        if (k instanceof VRMAimConstraint && c.axis) k.aimAxis = c.axis as VRMAimConstraint['aimAxis'];
        k.weight = c.weight;
        mgr.addConstraint(k);
      }
      mgr.setInitState();
      this.constraints = mgr;
    }
  }

  /**
   * The template's meshes share one skeleton, but a clone gets a skeleton per mesh - and every skeleton recomputes all
   * of its bone matrices each frame (13 meshes x 129 bones on a typical VRoid model). Share them again: one per
   * template skeleton, on this clone's bones.
   */
  private shareSkeletons(byName: Map<string, THREE.Object3D>): void {
    const shared = new Map<THREE.Skeleton, THREE.Skeleton>();
    let i = 0;
    this.template.scene.traverse((o) => {
      const src = o as THREE.SkinnedMesh;
      if (!src.isMesh) return;
      const dst = this.meshes[i++] as THREE.SkinnedMesh;
      if (!src.isSkinnedMesh || !dst.isSkinnedMesh) return;
      let sk = shared.get(src.skeleton);
      if (!sk) {
        const bones = src.skeleton.bones.map((b) => (byName.get(b.name) as THREE.Bone | undefined) ?? b);
        sk = new THREE.Skeleton(bones, src.skeleton.boneInverses);
        shared.set(src.skeleton, sk);
      }
      dst.skeleton.dispose();
      dst.bind(sk, dst.bindMatrix);
    });
  }

  /** Swap to a shared infected material set, or back to the model's own materials (null). */
  setTint(tint: AnimeTint | null): void {
    const set = tint ? tinted(this.template, tint) : null;
    let i = 0;
    this.template.scene.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const dst = this.meshes[i++]!;
      if (Array.isArray(src.material)) dst.material = src.material.map((m) => set?.get(m) ?? m);
      else dst.material = set?.get(src.material) ?? src.material;
    });
  }

  /** Curl every finger toward the palm, once (they never move after). Measured in the rest pose, then applied. */
  private curl(byName: Map<string, THREE.Object3D>, grip: number): void {
    const down = new THREE.Vector3(0, -1, 0);
    const todo: { node: THREE.Object3D; q: THREE.Quaternion }[] = [];
    for (const side of ['left', 'right']) {
      for (const f of FINGERS) {
        FINGER_SEGS[f].forEach((seg, k) => {
          const node = byName.get(this.template.boneNames.get(`${side}${f}${seg}`) ?? '');
          const parent = node?.parent;
          const next = node?.children.find((c) => (c as THREE.Bone).isBone);
          if (!node || !parent || !next) return;
          // arms out, palms down: a finger curls about (its direction x down), turning toward the palm
          const d = new THREE.Vector3().setFromMatrixPosition(next.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(node.matrixWorld)).normalize();
          const axis = new THREE.Vector3().crossVectors(d, down);
          if (axis.lengthSq() < 1e-6) return;
          axis.normalize();
          const angle = grip * (f === 'Thumb' ? 0.35 : [1.05, 1.2, 0.8][k]!);
          const pq = worldQ(parent, new THREE.Quaternion());
          const r = new THREE.Quaternion().setFromAxisAngle(axis, angle);
          todo.push({ node, q: pq.clone().invert().multiply(r).multiply(pq).multiply(node.quaternion) });
        });
      }
    }
    for (const t of todo) t.node.quaternion.copy(t.q);
  }

  /** Set a blend-shape expression (0..1) by the model's expression name (blink, happy, angry, aa, ...). */
  setExpression(name: string, w: number): void {
    const list = this.template.expressions.get(name);
    if (!list || this.expr.get(name) === w) return;
    this.expr.set(name, w);
    for (const e of list) {
      const inf = this.meshes[e.mesh]?.morphTargetInfluences;
      if (inf) inf[e.index] = Math.min(1, e.weight * w);
    }
  }

  hasExpression(name: string): boolean {
    return this.template.expressions.has(name);
  }

  /** The model's own bone node (for gear held in a hand or worn on the head). */
  boneNode(name: Bone): THREE.Object3D | null {
    return this.b.get(name)?.bone ?? null;
  }

  /** World position of a bone (as of the last `follow`). */
  boneWorld(name: Bone, out: THREE.Vector3): THREE.Vector3 {
    const d = this.b.get(name);
    return d ? out.setFromMatrixPosition(d.bone.matrixWorld) : this.root.getWorldPosition(out);
  }

  /** Turn the model's bones to match the stand-in. The stand-in's world matrices must be current. */
  follow(src: PoseSource): void {
    if (src.bob) this.root.position.copy(this.base).add(vA.copy(src.bob.joint.position).sub(src.bob.rest));
    // the wrapper and the armature nodes above the hips
    this.b.get('hips')?.bone.parent?.updateWorldMatrix(true, false);
    // trunk: full rotations
    this.copyRot('hips', src.pelvis);
    this.copyRot('spine', src.chest);
    this.keep('chest');
    this.keep('upperChest');
    this.keep('neck');
    this.copyRot('head', src.head);
    // arms: shoulders stay, then reach the stand-in's wrists with the elbows where its elbows are
    const [R, L] = src.arms;
    this.keep('rightShoulder');
    this.limb('rightUpperArm', 'rightLowerArm', R.fore.localToWorld(vB.set(0, -R.len, 0)), R.fore.getWorldPosition(vC));
    this.keep('rightHand');
    this.keep('leftShoulder');
    this.limb('leftUpperArm', 'leftLowerArm', L.fore.localToWorld(vB.set(0, -L.len, 0)), L.fore.getWorldPosition(vC));
    this.keep('leftHand');
    const [LR, LL] = src.legs;
    this.limb('rightUpperLeg', 'rightLowerLeg', LR.shin.localToWorld(vB.set(0, -LR.len, 0)), LR.shin.getWorldPosition(vC));
    this.keep('rightFoot');
    this.limb('leftUpperLeg', 'leftLowerLeg', LL.shin.localToWorld(vB.set(0, -LL.len, 0)), LL.shin.getWorldPosition(vC));
    this.keep('leftFoot');
    this.constraints?.update();
  }

  /** Leave a bone at rest (under its posed parent) and bring its world matrix up to date. */
  private keep(name: Bone): void {
    const d = this.b.get(name);
    if (!d) return;
    d.bone.quaternion.copy(d.rest);
    d.bone.updateWorldMatrix(false, false);
  }

  /** The bone's world rotation = the joint's world rotation times the bone's rest rotation relative to the frame. */
  private copyRot(name: Bone, joint: THREE.Object3D): void {
    const d = this.b.get(name);
    if (!d) return;
    const want = worldQ(joint, qA).multiply(d.rel);
    // relative to the frame: the frame's own rotation is already in the joint's world rotation
    d.bone.quaternion.copy(worldQ(d.bone.parent!, qB).invert().multiply(want));
    d.bone.updateWorldMatrix(false, false);
  }

  /** Swing a bone from its rest so its segment points along `dir` (world). */
  private swing(d: Driven, dir: THREE.Vector3): void {
    const pq = worldQ(d.bone.parent!, qB);
    const restW = qC.copy(pq).multiply(d.rest);
    const r = vD.copy(d.dir).applyQuaternion(restW);
    qA.setFromUnitVectors(r, dir);
    d.bone.quaternion.copy(pq.invert().multiply(qA).multiply(restW));
    d.bone.updateWorldMatrix(false, false);
  }

  /** Two-bone reach: the end of `lower` to `target`, the joint between them toward `hint` (world). */
  private limb(upperName: Bone, lowerName: Bone, target: THREE.Vector3, hint: THREE.Vector3): void {
    const U = this.b.get(upperName);
    const Lw = this.b.get(lowerName);
    if (!U || !Lw) return;
    const k = this.root.parent!.matrixWorld.getMaxScaleOnAxis();
    const L1 = U.len * k;
    const L2 = Lw.len * k;
    const S = vA.setFromMatrixPosition(U.bone.matrixWorld);
    const to = vD.copy(target).sub(S);
    const dist = THREE.MathUtils.clamp(to.length(), 0.02, L1 + L2 - 0.001);
    const dir = to.normalize();
    const cosA = THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const n = vC.copy(hint).sub(S);
    n.addScaledVector(dir, -n.dot(dir));
    if (n.lengthSq() < 1e-8) n.copy(UP).cross(dir);
    n.normalize();
    const elbowDir = vF.copy(dir).multiplyScalar(cosA).addScaledVector(n, Math.sqrt(1 - cosA * cosA));
    const elbow = vC.copy(S).addScaledVector(elbowDir, L1);
    const wristDir = vB.copy(S).addScaledVector(dir, dist).sub(elbow).normalize();
    this.swing(U, elbowDir);
    this.swing(Lw, wristDir);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Geometry, textures and materials are the template's: only the clone goes. */
  dispose(): void {
    this.root.removeFromParent();
    for (const sk of new Set(this.meshes.map((m) => (m as THREE.SkinnedMesh).skeleton))) sk?.dispose();
  }
}
