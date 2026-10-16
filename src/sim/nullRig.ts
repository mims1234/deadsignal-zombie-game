/**
 * Server-side infected have no model: the simulation only needs where they stand. Head, chest and hand positions are
 * estimated from the feet and the type's height (the players' browsers do the real hit detection on their own
 * animated models and report the hits).
 */
import * as THREE from 'three';
import { ZOMBIES } from '../config';
import { MATRON_DEF } from '../enemies/matron';
import type { ZombieType } from '../types';
import type { ZombieAnimState, ZombieFactory, ZombieRig } from '../enemies/zombieRigTypes';

class NullRig implements ZombieRig {
  readonly root = new THREE.Group();
  readonly radius: number;
  readonly height: number;
  readonly headRadius: number;

  constructor(readonly type: ZombieType, d: { radius: number; height: number; headRadius: number } = ZOMBIES[type]) {
    this.radius = d.radius;
    this.height = d.height;
    this.headRadius = d.headRadius;
  }

  reset(): void {}
  update(_state: ZombieAnimState, _dt: number): void {}
  setVisible(): void {}
  dispose(): void {}

  getHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.root.position.x, this.root.position.y + this.height - this.headRadius, this.root.position.z);
  }

  getChestWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.root.position.x, this.root.position.y + this.height * 0.68, this.root.position.z);
  }

  getHandWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.root.position.x, this.root.position.y + this.height * 0.6, this.root.position.z);
  }
}

export function createNullRigFactory(): ZombieFactory {
  return {
    create: (type) => new NullRig(type),
    createMatron: () => new NullRig('warden', MATRON_DEF),
    dispose() {},
  };
}
