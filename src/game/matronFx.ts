/**
 * What a player sees and hears of the Asylum's Matron (`enemies/matron.ts`): her shriek darkens the edges of the screen
 * and shakes the view of anyone near her, the lamps around her fail, and her keys jingle as she walks. Works the same on
 * a co-op guest (the shriek arrives with the host's report of her).
 */
import type { AudioEngineApi } from '../audio/ids';
import { MATRON, type MatronBrain } from '../enemies/matron';
import type { LightPool } from '../render/lightPool';
import type { HudEvent } from '../ui/hudTypes';

/** The shriek's darkness closing in from the edges (the HUD's full-screen flash takes any CSS background). */
const SHRIEK_VIGNETTE = 'radial-gradient(ellipse at center, rgba(0,0,0,0) 28%, rgba(6,8,12,0.88) 74%, rgba(0,0,0,1) 100%)';

export interface MatronFxHost {
  /** Where the local player stands. */
  listener(): { x: number; z: number };
  shake(strength: number): void;
  hud(e: HudEvent): void;
  audio(): AudioEngineApi;
}

/** Hook her presentation up (no-op off the Asylum, where there is no Matron). */
export function wireMatronFx(matron: MatronBrain | null, lights: LightPool, host: MatronFxHost): void {
  lights.dim = matron ? (lamp) => matron.lampDim(lamp.x, lamp.z) : null;
  if (!matron) return;
  matron.fx = {
    shriek(x, z) {
      const p = host.listener();
      const k = 1 - Math.hypot(p.x - x, p.z - z) / MATRON.feelRadius;
      if (k <= 0) return;
      host.shake(0.25 + 0.55 * k);
      host.hud({ type: 'flash', color: SHRIEK_VIGNETTE, strength: 0.6 + 0.4 * k });
    },
    keys(x, z) {
      host.audio().play('keys_jingle', { pos: { x, y: 1.15, z }, volume: 0.75, priority: 1 });
    },
  };
}
