/**
 * HIRASAKA's kinds, what the island makes them do beyond their own habits (no THREE). The habits themselves (the miners
 * at work until a lamp finds them, the lamp-eaters running at a lamp, the funayūrei's drag, the thunderlings) are
 * `Zombie.variantStep` with their numbers in `enemies/variants.ts` (HIRASAKA_HABITS); the director (`director.ts`) puts
 * these scripts on them for the climb's moments:
 *
 *   EatScript    a hag at the grapes: it squats over them and eats until they are gone
 *   FleeScript   Mio, a peach landed by her: she backs away down the slope from it
 *   HomeScript   Mio at the end of the home ending: she walks away down the Hell Stairs, slowly, and does not look back
 *   LeanScript   Mio at the Chibiki-iwa while it is hauled: she walks to it and leans on it (the rock barely moves); shots
 *                that stagger her push her off, and a peach drives her off
 */
import type { Zombie, ZombieEnv, ZombieScript } from '../enemies/zombie';

const yawTo = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z));

/** Move `z` toward (tx, tz) at `speed`, along the floor, not through walls. Returns the distance left. */
function walk(z: Zombie, env: ZombieEnv, tx: number, tz: number, speed: number, dt: number): number {
  const dx = tx - z.x;
  const dz = tz - z.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return 0;
  const step = Math.min(d, speed * dt);
  const nx = z.x + (dx / d) * step;
  const nz = z.z + (dz / d) * step;
  if (!env.world.circleBlocked(nx, nz, 0.3, z.y + 0.4, z.y + 1.6)) {
    z.x = nx;
    z.z = nz;
    // (down a stair a step at a time)
    z.y = env.world.floorBelow(nx, nz, 0.3, z.y + 0.5, 0.8);
  }
  z.yaw = yawTo(z.x, z.z, tx, tz);
  return d - step;
}

/** A hag eating the grapes at (x, z) for `t` seconds. */
export class EatScript implements ZombieScript {
  constructor(
    private x: number,
    private z: number,
    public t: number,
  ) {}
  step(z: Zombie, dt: number, env: ZombieEnv): boolean {
    this.t -= dt;
    if (this.t <= 0 || !z.alive) return false;
    const left = walk(z, env, this.x, this.z, 3.2, dt);
    z.vx = z.vz = 0;
    const p = z.scriptPose;
    p.mode = left > 0.8 ? 'walk' : 'idle';
    p.speed = left > 0.8 ? 3.2 : 0;
    p.actionT = 0;
    p.lift = 0;
    return true;
  }
}

/** Mio backing away from where a peach came down, for `t` seconds. */
export class FleeScript implements ZombieScript {
  constructor(
    private x: number,
    private z: number,
    public t: number,
  ) {}
  step(z: Zombie, dt: number, env: ZombieEnv): boolean {
    this.t -= dt;
    if (this.t <= 0) return false;
    const dx = z.x - this.x;
    const dz = z.z - this.z;
    const d = Math.max(0.3, Math.hypot(dx, dz));
    walk(z, env, z.x + (dx / d) * 3, z.z + (dz / d) * 3, 3.6, dt);
    // she keeps her face to you as she goes
    z.yaw = yawTo(z.x, z.z, this.x, this.z);
    z.vx = z.vz = 0;
    const p = z.scriptPose;
    p.mode = 'walk';
    p.speed = 2;
    p.actionT = 0;
    p.lift = 0;
    return true;
  }
}

/** Mio going to the Chibiki-iwa at (x, z) and leaning on it (until shots stagger her off, or a peach drives her off). */
export class LeanScript implements ZombieScript {
  leaning = false;
  constructor(
    private readonly x: number,
    private readonly z: number,
  ) {}
  step(z: Zombie, dt: number, env: ZombieEnv): boolean {
    if (z.state === 'stagger') return false;
    const left = walk(z, env, this.x, this.z, 2.6 * z.speedScale, dt);
    this.leaning = left < 0.4;
    z.vx = z.vz = 0;
    const p = z.scriptPose;
    p.mode = this.leaning ? 'slam' : 'walk';
    p.speed = this.leaning ? 0 : 2.6;
    p.actionT = this.leaning ? 0.3 : 0;
    p.lift = 0;
    return true;
  }
}

/** Mio walking home down the slope to (x, z), facing where she goes. */
export class HomeScript implements ZombieScript {
  constructor(
    private readonly x: number,
    private readonly z: number,
  ) {}
  step(z: Zombie, dt: number, env: ZombieEnv): boolean {
    const left = walk(z, env, this.x, this.z, 1.1, dt);
    z.vx = z.vz = 0;
    const p = z.scriptPose;
    p.mode = left > 0.3 ? 'walk' : 'idle';
    p.speed = left > 0.3 ? 1.1 : 0;
    p.actionT = 0;
    p.lift = 0;
    return true;
  }
}
