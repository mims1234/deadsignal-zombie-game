/**
 * The Kurenai Court's people, drawn: not infected rigs but the same figure as a teammate (`coop/avatar.ts`) wearing a
 * Court member's VRoid model, carrying a checkpoint rifle. The infected AI moves them (as `ZombieRig`s); this follows:
 * it walks where the root goes, raises the rifle and fires as the attack passes its strike, and falls when killed.
 */
import * as THREE from 'three';
import { ZOMBIES } from '../config';
import { COURT_TINT, courtModel } from '../anime/cast';
import { Avatar } from '../coop/avatar';
import type { ZombieAnimState, ZombieRig } from '../enemies/zombieRigTypes';

export class CourtRig implements ZombieRig {
  readonly type = 'shambler' as const;
  /** Positioned by the infected AI; the figure follows it in world space. */
  readonly root = new THREE.Group();
  readonly radius = ZOMBIES.shambler.radius;
  readonly height = ZOMBIES.shambler.height;
  readonly headRadius = ZOMBIES.shambler.headRadius;
  private readonly fig: Avatar;
  private lastT = 0;
  private dead = false;
  private visible = true;

  constructor(seed: number) {
    this.fig = new Avatar('', seed % 3, { weapon: 'rifle', helmet: false, anime: courtModel(seed % 3), animeTint: COURT_TINT });
    this.root.name = 'court';
  }

  reset(): void {}

  /** Far off, the plain figure stands in for the model. */
  setDistance2(d2: number): void {
    this.fig.animeLod(d2 < 26 * 26);
  }

  update(s: ZombieAnimState, dt: number): void {
    const r = this.root;
    if (!this.fig.root.parent && r.parent) r.parent.add(this.fig.root);
    if (s.mode === 'death') {
      if (!this.dead) {
        this.dead = true;
        this.fig.fall(Math.sin(r.rotation.y), Math.cos(r.rotation.y), 2.2);
      }
    } else {
      this.fig.set(r.position.x, r.position.y, r.position.z, r.rotation.y, this.visible);
      if (s.mode === 'attack' && this.lastT < 0.55 && s.actionT >= 0.55) this.fig.fire();
    }
    this.lastT = s.mode === 'attack' ? s.actionT : 0;
    this.fig.update(dt);
  }

  getHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.root.position).setY(this.root.position.y + (this.dead ? 0.2 : 1.6));
  }

  getChestWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.root.position).setY(this.root.position.y + (this.dead ? 0.2 : 1.2));
  }

  getHandWorld(out: THREE.Vector3): THREE.Vector3 {
    const y = this.root.rotation.y;
    return out.set(this.root.position.x - Math.sin(y) * 0.45, this.root.position.y + 1.2, this.root.position.z - Math.cos(y) * 0.45);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.fig.root.visible = visible;
  }

  dispose(): void {
    this.fig.dispose();
  }
}
