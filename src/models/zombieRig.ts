/**
 * An infected wearing a model from the library (`library.ts`, the 'zombie' model): its own animation clips play for
 * the game's animation states - Idle, Walk and Run paced to its ground speed, Punch scrubbed in step with the attack
 * (so the hit lands on the frame the game deals it), HitReact for a stagger, Death held on its last frame. Hits are
 * tested against its own Head, Torso and right forearm bones. Each kind of infected is tinted and sized its own way.
 */
import * as THREE from 'three';
import type { ZombieType } from '../types';
import type { ZombieAnimState, ZombieMode, ZombieRig } from '../enemies/zombieRigTypes';
import { modelClone } from './library';

/** Per kind: tint over the model's own colours, size, and which clip it runs with. */
const LOOK: Record<ZombieType, { tint: number; scale: number; run: string }> = {
  shambler: { tint: 0xffffff, scale: 1, run: 'Run' },
  runner: { tint: 0xd8dcf0, scale: 0.96, run: 'Run_Arms' },
  armored: { tint: 0x9a9c8c, scale: 1.12, run: 'Run' },
  warden: { tint: 0xd09090, scale: 1.4, run: 'Run_Attack' },
};

/** The clip each animation state plays, and how its time is driven. */
const CLIP: Record<ZombieMode, { name: string; mode: 'loop' | 'scrub' | 'once' }> = {
  idle: { name: 'Idle', mode: 'loop' },
  walk: { name: 'Walk', mode: 'loop' },
  run: { name: 'Run', mode: 'loop' },
  attack: { name: 'Punch', mode: 'scrub' },
  stagger: { name: 'HitReact', mode: 'scrub' },
  death: { name: 'Death', mode: 'once' },
  slam: { name: 'Punch', mode: 'scrub' },
  charge: { name: 'Run_Attack', mode: 'loop' },
  roar: { name: 'Idle_Attack', mode: 'scrub' },
};

const materials = new Map<string, THREE.Material>();

export class ModelZombieRig implements ZombieRig {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private readonly head: THREE.Object3D | null;
  private readonly chest: THREE.Object3D | null;
  private readonly hand: THREE.Object3D | null;
  private readonly look: (typeof LOOK)[ZombieType];

  constructor(
    readonly type: ZombieType,
    readonly radius: number,
    readonly height: number,
    readonly headRadius: number,
    seed: number,
  ) {
    const m = modelClone('zombie');
    if (!m) throw new Error('the zombie model is not loaded');
    this.look = LOOK[type];
    const body = m.root;
    body.scale.multiplyScalar(this.look.scale * (height / 1.78));
    this.root.add(body);
    // the kind's tint on a shared copy of each of the model's materials
    body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // a skinned body's own bounds do not follow its animation
      const src = mesh.material as THREE.MeshStandardMaterial;
      const key = `${src.uuid}:${type}`;
      let mat = materials.get(key);
      if (!mat) {
        const c = src.clone();
        c.color.multiply(new THREE.Color(this.look.tint));
        mat = c;
        materials.set(key, c);
      }
      mesh.material = mat;
    });
    this.head = body.getObjectByName('Head') ?? null;
    this.chest = body.getObjectByName('Torso') ?? null;
    this.hand = body.getObjectByName('LowerArm.R') ?? null;
    this.mixer = new THREE.AnimationMixer(body);
    for (const clip of m.clips) {
      if (clip.name.includes('|')) continue; // the armature-prefixed duplicates
      const a = this.mixer.clipAction(clip);
      this.actions.set(clip.name, a);
    }
    this.reset(seed);
  }

  reset(seed: number): void {
    // a little variety in height between copies
    const k = 0.94 + ((seed * 9301 + 49297) % 233280) / 233280 * 0.12;
    this.root.scale.setScalar(k);
    this.mixer.stopAllAction();
    this.current = null;
    this.currentName = '';
  }

  private play(name: string, fade: number): THREE.AnimationAction | null {
    const a = this.actions.get(name) ?? this.actions.get('Idle') ?? null;
    if (!a || name === this.currentName) return this.current;
    a.reset();
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (this.current && fade > 0) this.current.crossFadeTo(a, fade, false);
    else if (this.current) this.current.stop();
    this.current = a;
    this.currentName = name;
    return a;
  }

  update(s: ZombieAnimState, dt: number): void {
    const want = s.mode === 'run' ? { name: this.look.run, mode: 'loop' as const } : CLIP[s.mode];
    // death cuts in at once (a blend would hold the body up for its first moments); the rest blend
    const a = this.play(want.name, s.mode === 'death' ? 0 : 0.18);
    if (!a) return;
    const len = a.getClip().duration;
    if (want.mode === 'loop') {
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.paused = false;
      // paced to the ground speed (the clips are made at about 1.1 m/s walking, 3.2 m/s running)
      a.timeScale = s.mode === 'walk' ? THREE.MathUtils.clamp(s.speed / 1.1, 0.5, 1.8) : s.mode === 'run' ? THREE.MathUtils.clamp(s.speed / 3.2, 0.6, 1.6) : 1;
      this.mixer.update(dt);
    } else if (want.mode === 'scrub') {
      // in step with the game's own progress through the attack, the stagger or the roar
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.paused = true;
      a.time = THREE.MathUtils.clamp(s.mode === 'stagger' ? s.staggerT : s.actionT, 0, 0.999) * len;
      // a paused action keeps the time it is given; the mixer still has to run for a blend into it to finish
      this.mixer.update(dt);
    } else {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.paused = true;
      a.time = Math.min(len * 0.999, s.deathT * 1.2);
      this.mixer.update(dt);
    }
    // the bones where they are now: shots this frame test the head and the chest where they are drawn
    this.root.updateMatrixWorld(true);
  }

  getHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.head ? this.head.getWorldPosition(out).add(new THREE.Vector3(0, this.headRadius * 1.4, 0)) : out.copy(this.root.position).setY(this.root.position.y + this.height - this.headRadius);
  }

  getChestWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.chest ? this.chest.getWorldPosition(out) : out.copy(this.root.position).setY(this.root.position.y + this.height * 0.65);
  }

  getHandWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.hand ? this.hand.getWorldPosition(out) : this.getChestWorld(out);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.root.removeFromParent();
  }
}
