/**
 * The model library: 3D models from files (glTF / GLB in `public/models/`) standing in for the game's procedural props
 * and infected. Adding a model is a file and a line in `MODELS`: the library loads it, scales it to the size it is
 * given (so a model made in centimetres or inches fits), stands it on the ground centred on its spot, and hands out
 *
 *   - `modelProp`: a static prop, every mesh of it instanced in the level (one draw call per mesh for all copies);
 *   - `modelClone`: an animated character (skinned meshes and their skeleton cloned, its animation clips shared).
 *
 * Nothing here changes how the game plays: colliders, footprints and the co-op simulation stay with the code that
 * places a prop, and the server never loads a model. A model that is missing (or a pack switched off in Settings)
 * leaves the procedural version in its place.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { LevelBuilder } from '../world/builder';

export interface ModelDef {
  /** Under `public/` (served from the site root). */
  file: string;
  /** The size it is scaled to: its height, or its longest side across the ground (m). */
  height?: number;
  length?: number;
  /** Turn it (rad) so it faces the way the game expects (-Z forward for characters, +X along for long props). */
  yaw?: number;
  /** Shadows: props cast them by default. */
  cast?: boolean;
  /** Where it came from (shown in the credits; every pack's licence is in its folder). */
  credit: string;
}

const Q = 'Quaternius (CC0)';

/** Every model the game knows. The pack a map loads is `PACKS[pack]`. */
export const MODELS = {
  zombie: { file: 'models/quaternius/zombie.glb', height: 1.78, yaw: Math.PI, credit: Q },
  barrel: { file: 'models/quaternius/barrel.glb', height: 0.9, credit: Q },
  cone: { file: 'models/quaternius/cone.glb', height: 0.55, credit: Q },
  hydrant: { file: 'models/quaternius/hydrant.glb', height: 0.75, credit: Q },
  tires: { file: 'models/quaternius/tires.glb', height: 0.82, credit: Q },
  pallet: { file: 'models/quaternius/pallet.glb', length: 1.2, cast: false, credit: Q },
} satisfies Record<string, ModelDef>;

export type ModelId = keyof typeof MODELS;

/** The art packs a player can pick (Settings): 'classic' is the game's own procedural look. */
export type ModelPack = 'classic' | 'quaternius';
export const PACKS: Record<ModelPack, ModelId[]> = {
  classic: [],
  quaternius: ['zombie', 'barrel', 'cone', 'hydrant', 'tires', 'pallet'],
};

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** The mesh in the normalised model's frame (scaled, stood on the ground, centred). */
  matrix: THREE.Matrix4;
}

interface Template {
  /** The normalised scene (a wrapper group whose scale and offset carry the normalisation). */
  root: THREE.Group;
  parts: Part[];
  clips: THREE.AnimationClip[];
  def: ModelDef;
}

const templates = new Map<ModelId, Template>();
const failed = new Set<ModelId>();

/** Load these models (in parallel; a file that fails is left out and its procedural stand-in stays). */
export async function loadModels(ids: readonly ModelId[]): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(
    ids.map(async (id) => {
      if (templates.has(id) || failed.has(id)) return;
      const def: ModelDef = MODELS[id];
      try {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}${def.file}`);
        templates.set(id, normalise(gltf.scene, gltf.animations, def));
      } catch (e) {
        failed.add(id);
        console.warn(`model ${id} (${def.file}) could not be loaded`, e);
      }
    }),
  );
}

/** Is this model loaded (and so used in place of the procedural one)? */
export function hasModel(id: ModelId): boolean {
  return templates.has(id);
}

function normalise(scene: THREE.Group, clips: THREE.AnimationClip[], def: ModelDef): Template {
  const inner = scene;
  inner.rotation.y = def.yaw ?? 0;
  const root = new THREE.Group();
  root.add(inner);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const size = box.getSize(new THREE.Vector3());
  const k = def.height ? def.height / Math.max(1e-6, size.y) : def.length ? def.length / Math.max(1e-6, size.x, size.z) : 1;
  inner.scale.multiplyScalar(k);
  // stand it on the ground, centred over its spot
  inner.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
  root.updateMatrixWorld(true);
  const parts: Part[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.length !== 1) return;
    parts.push({ geometry: m.geometry, material: mats[0]!, matrix: m.matrixWorld.clone() });
  });
  return { root, parts, clips, def };
}

const tmp = new THREE.Matrix4();
const at = new THREE.Matrix4();

/**
 * A static prop at a place: every mesh of the model goes into the level's instanced sets, so all copies of a model
 * cost one draw call per mesh. `extra` (local) turns or tips it first (a fallen cone), `scale` resizes it.
 */
export function modelProp(b: LevelBuilder, id: ModelId, x: number, y: number, z: number, rot = 0, scale = 1, extra?: THREE.Matrix4): boolean {
  const t = templates.get(id);
  if (!t) return false;
  at.makeRotationY(rot).scale(new THREE.Vector3(scale, scale, scale)).setPosition(x, y, z);
  if (extra) at.multiply(extra);
  t.parts.forEach((p, i) => {
    tmp.multiplyMatrices(at, p.matrix);
    b.instanced(`model:${id}:${i}`, p.geometry, p.material, { cast: t.def.cast ?? true, receive: true }).addMatrix(tmp);
  });
  return true;
}

/** A copy of an animated model (its own skeleton; geometry, materials and clips shared) and its clips. */
export function modelClone(id: ModelId): { root: THREE.Object3D; clips: THREE.AnimationClip[] } | null {
  const t = templates.get(id);
  if (!t) return null;
  return { root: cloneSkinned(t.root), clips: t.clips };
}

/** Who made the models in use (for the credits). */
export function modelCredits(): string[] {
  return [...new Set([...templates.values()].map((t) => t.def.credit))];
}
