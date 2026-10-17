/**
 * The Sakura District's own runtime (built when the map is): the petals in the air, and what the map's story, its lore
 * and its Easter egg do while a run is on.
 */
import type { Game } from '../game/game';
import { PetalFall } from './petalFall';

export class SakuraRuntime {
  readonly petals: PetalFall;

  constructor(private readonly g: Game) {
    this.petals = new PetalFall(g.touchMode ? 140 : 320);
    g.worldRoot.add(this.petals.mesh);
  }

  /** Every rendered frame (menus too): what is only to be seen. */
  frame(dt: number): void {
    const c = this.g.renderer.camera.position;
    this.petals.update(dt, c.x, c.y, c.z);
  }

  /** A run's simulation step. */
  update(dt: number): void {
    void dt;
  }

  /** A new run. */
  reset(): void {}
}
