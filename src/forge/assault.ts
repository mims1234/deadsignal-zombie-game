/**
 * The last stand at the Hearth: from the extraction call until the virus burns out, the infected come for the people
 * sheltering there - wave after wave, from out of sight all around, more than the sentry can hold. Each one walks the
 * Forge's streets to the Hearth's gate (a flow field toward it, computed once), goes in, and stands over someone; if
 * nobody stops it in time, that person dies. Shot, or with a player right on top of it, it forgets the errand and
 * hunts as usual.
 *
 * No THREE / DOM: this runs wherever the infected are simulated (the solo game, or the co-op simulation).
 */
import { FORGE_STORY } from '../config';
import type { Zombie, ZombieEnv, ZombieScript } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';
import { FlowField, type NavGrid } from '../world/nav';
import type { HearthDef } from './sites';

const A = FORGE_STORY.assault;

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Someone waiting at the Hearth (holdout index, where they stand). */
export interface HearthTarget {
  i: number;
  x: number;
  z: number;
}

/** One infected's errand: get into the Hearth and kill someone there. */
class HearthScript implements ZombieScript {
  private hp: number;
  private stuck = 0;
  private strikeT = 0;
  private target: HearthTarget | null = null;
  private readonly step2 = { x: 0, z: 0 };

  constructor(
    private readonly dir: AssaultDirector,
    z: Zombie,
  ) {
    this.hp = z.hp;
  }

  step(z: Zombie, dt: number, env: ZombieEnv): boolean {
    const dir = this.dir;
    const h = dir.hearth;
    const pose = z.scriptPose;
    // shot: hunt whoever did it
    if (z.hp < this.hp - 0.01) return dir.release(z, env);
    const p = env.player;
    if (p.alive && Math.hypot(p.x - z.x, p.z - z.z) < A.releaseRange) return dir.release(z, env);
    const inside = z.x > h.x0 - 0.3 && z.x < h.x1 + 0.3 && z.z > h.z0 - 0.3 && z.z < h.z1 + 0.6;
    let gx: number;
    let gz: number;
    if (!inside) {
      // through the streets to the gate
      if (!dir.field.follow(z.x, z.z, this.step2, 10)) {
        this.step2.x = h.gateX;
        this.step2.z = h.z1 - 1.5;
      }
      gx = this.step2.x;
      gz = this.step2.z;
    } else {
      // in: whoever is nearest
      if (!this.target || !dir.alive(this.target.i)) this.target = dir.nearestTarget(z.x, z.z);
      if (!this.target) return dir.release(z, env);
      gx = this.target.x;
      gz = this.target.z;
    }
    const dx = gx - z.x;
    const dz = gz - z.z;
    const dist = Math.hypot(dx, dz);
    const atTarget = inside && this.target !== null && dist < 0.95;
    if (!atTarget) {
      const run = z.type === 'runner';
      const speed = z.def.speedChase * z.speedScale * (run ? 0.9 : 1);
      this.turn(z, Math.atan2(-dx, -dz), dt);
      const stepLen = Math.min(dist, speed * dt);
      const q = { x: z.x + (dx / (dist || 1)) * stepLen, z: z.z + (dz / (dist || 1)) * stepLen };
      env.world.resolveCircle(q, z.def.radius, 0.5, 1.7, 2);
      const moved = Math.hypot(q.x - z.x, q.z - z.z);
      this.stuck = moved < stepLen * 0.2 ? this.stuck + dt : Math.max(0, this.stuck - dt * 0.5);
      z.x = q.x;
      z.z = q.z;
      pose.mode = speed > 2.6 ? 'run' : 'walk';
      pose.speed = speed;
      pose.actionT = 0;
      this.strikeT = 0;
      if (this.stuck > 4) return dir.release(z, env);
      return true;
    }
    // over them: tearing at them until they fall (or someone stops it)
    this.turn(z, Math.atan2(-dx, -dz), dt);
    pose.mode = 'attack';
    pose.speed = 0;
    this.strikeT += dt;
    pose.actionT = (this.strikeT % 0.9) / 0.9;
    if (this.strikeT >= A.strike) {
      this.strikeT = 0;
      if (dir.take(this.target!.i)) this.target = null;
    }
    return true;
  }

  private turn(z: Zombie, target: number, dt: number): void {
    const d = wrap(target - z.yaw);
    const m = z.def.turnRate * 1.5 * dt;
    z.yaw = wrap(z.yaw + Math.max(-m, Math.min(m, d)));
  }
}

export class AssaultDirector {
  /** The way to the Hearth's gate from anywhere (computed the first time it is needed). */
  readonly field: FlowField;
  private computed = false;
  active = false;
  private waveT = 0;
  private takeT = 0;
  private readonly crowd: Zombie[] = [];
  private targets: HearthTarget[] = [];
  /** The story decides whether someone dies (and who may not). */
  onTake: (i: number) => boolean = () => false;

  constructor(
    readonly hearth: HearthDef,
    private readonly zombies: ZombieManager,
    private readonly nav: NavGrid,
  ) {
    this.field = new FlowField(nav);
  }

  reset(): void {
    for (const z of this.crowd) if (z.script instanceof HearthScript) z.script = null;
    this.crowd.length = 0;
    this.active = false;
    this.targets = [];
  }

  private ensureField(): void {
    if (this.computed) return;
    this.field.compute(this.hearth.gateX, this.hearth.z1 - 1.2);
    this.computed = true;
  }

  /** Can something at (x, z) walk to the Hearth (not shut in a room or a yard)? */
  reachable(x: number, z: number): boolean {
    this.ensureField();
    return this.field.isReachable(x, z);
  }

  /** The siege begins: the first wave is close behind the call. */
  start(): void {
    this.ensureField();
    this.active = true;
    this.waveT = 2;
    this.takeT = 0;
  }

  stop(): void {
    this.active = false;
  }

  /** Infected on the errand now. */
  get count(): number {
    return this.crowd.length;
  }

  /** How many are inside the walls right now. */
  inside(): number {
    const h = this.hearth;
    let n = 0;
    for (const z of this.zombies.zombies) if (z.alive && z.x > h.x0 && z.x < h.x1 && z.z > h.z0 && z.z < h.z1 + 0.5) n++;
    return n;
  }

  alive(i: number): boolean {
    return this.targets.some((t) => t.i === i);
  }

  nearestTarget(x: number, z: number): HearthTarget | null {
    let best: HearthTarget | null = null;
    let bd = Infinity;
    for (const t of this.targets) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** A strike lands: someone at the Hearth dies (at most one every `takeEvery` seconds; the story keeps the last). */
  take(i: number): boolean {
    if (this.takeT > 0) return false;
    if (!this.onTake(i)) return false;
    this.takeT = A.takeEvery;
    this.targets = this.targets.filter((t) => t.i !== i);
    return true;
  }

  release(z: Zombie, env: ZombieEnv): boolean {
    const i = this.crowd.indexOf(z);
    if (i >= 0) this.crowd.splice(i, 1);
    z.vx = z.vz = 0;
    if (env.player.alive) z.aggro(env.player.x, env.player.z);
    return false;
  }

  /** Once a simulated frame: who is at the Hearth now, the dead off the list, the next wave when it is due. */
  update(dt: number, targets: HearthTarget[], players: readonly { x: number; z: number; alive: boolean }[], playerCount: number, rng: Rng, seen: (x: number, z: number) => boolean): void {
    this.targets = targets;
    this.takeT = Math.max(0, this.takeT - dt);
    const live = this.zombies.zombies;
    for (let i = this.crowd.length - 1; i >= 0; i--) {
      const z = this.crowd[i]!;
      if (!z.alive || !(z.script instanceof HearthScript) || !live.includes(z)) this.crowd.splice(i, 1);
    }
    if (!this.active) return;
    this.waveT -= dt;
    if (this.waveT > 0) return;
    this.waveT = A.waveEvery * (0.85 + rng.f() * 0.3);
    const want = Math.round(A.wave * (1 + A.perPlayer * Math.max(0, playerCount - 1)));
    const room = Math.max(0, A.maxAlive - this.crowd.length);
    const n = Math.min(want, room);
    for (let k = 0; k < n; k++) {
      const at = this.spawnSpot(players, rng, seen);
      if (!at) continue;
      const v = rng.f();
      const type: ZombieType = v < 0.14 ? 'armored' : v < 0.44 ? 'runner' : 'shambler';
      const z = this.zombies.spawn(type, at.x, at.z, rng, { yaw: Math.atan2(at.x - this.hearth.gateX, at.z - this.hearth.gateZ) });
      z.script = new HearthScript(this, z);
      z.scriptPose.lift = 0;
      this.crowd.push(z);
    }
  }

  /** Out of everyone's sight, well away from the players, on the streets around the Hearth. */
  private spawnSpot(players: readonly { x: number; z: number; alive: boolean }[], rng: Rng, seen: (x: number, z: number) => boolean): { x: number; z: number } | null {
    const h = this.hearth;
    const [d0, d1] = A.spawnAway as readonly [number, number];
    for (let k = 0; k < 14; k++) {
      // the Hearth backs onto the Forge's north wall: they come from the south, east and west
      const a = (rng.f() - 0.5) * Math.PI * 1.25;
      const d = d0 + rng.f() * (d1 - d0);
      const x = h.gateX + Math.sin(a) * d;
      const z = h.gateZ + Math.cos(a) * d * 0.9;
      if (this.nav.isBlockedAt(x, z) || !this.field.isReachable(x, z)) continue;
      if (players.some((p) => p.alive && Math.hypot(p.x - x, p.z - z) < 18)) continue;
      if (seen(x, z)) continue;
      return { x, z };
    }
    return null;
  }
}
