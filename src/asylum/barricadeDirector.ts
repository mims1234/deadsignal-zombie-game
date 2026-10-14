/**
 * The infected side of the barricades: a share of the director's spawns appear outside a boarded window near the
 * player, walk to it, tear the boards off one at a time, climb through and only then hunt with the normal AI (inside,
 * on the shared flow field). Outside, they never path: each one is scripted to its own window, so the flow field never
 * has to know about windows at all.
 *
 * No THREE / DOM here (sounds go through `env.audio`, which the co-op server stubs): this runs wherever the infected
 * are simulated - the solo game, or a co-op host.
 */
import type { SpawnType } from '../logic/director';
import type { Rng } from '../logic/rng';
import type { SpawnGroup } from '../world/layout/data';
import type { Zombie, ZombieEnv, ZombieScript } from '../enemies/zombie';
import type { DirectorContext, ZombieManager } from '../enemies/zombieManager';
import { BARRICADE } from './barricadeConfig';
import { type BarricadeDef, indoors, sideOf } from './barricadeLayout';
import { type BarricadeState, createBarricades, isOpen, resetBarricades, tearStep } from './barricades';

/** What happened at a window (for the visuals and anything else listening). */
export type BarricadeEvent =
  | { kind: 'tear'; window: number; boards: number; x: number; z: number }
  | { kind: 'climb'; window: number }
  | { kind: 'swipe'; window: number };

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const smooth = (t: number): number => t * t * (3 - 2 * t);

type Phase = 'approach' | 'tear' | 'climb';

/** One infected's errand to window `win`. */
class WindowScript implements ZombieScript {
  phase: Phase = 'approach';
  private t = 0;
  private swipeT = -1;
  private swipeCd = 0.6;
  private swipeHit = false;
  private fromX = 0;
  private fromZ = 0;

  constructor(
    private readonly dir: BarricadeDirector,
    readonly win: number,
  ) {}

  step(z: Zombie, dt: number, env: ZombieEnv): boolean {
    const dir = this.dir;
    const d = dir.defs[this.win]!;
    const pose = z.scriptPose;
    this.t += dt;
    if (this.swipeCd > 0) this.swipeCd -= dt;
    const p = env.player;

    if (this.phase === 'climb') return this.climb(z, d, dt, env);

    // a player out in the grounds right next to it: forget the window and go for them
    if (p.alive && sideOf(d, p.x, p.z) > 0.3) {
      const dist = Math.hypot(p.x - z.x, p.z - z.z);
      if (dist < BARRICADE.breakOffRange && !env.world.segmentBlocked(z.x, 1.5, z.z, p.x, p.eyeY - 0.15, p.z, 'shots')) return dir.release(z, env);
    }

    const slot = dir.slotOf(z, this.win);
    const front = slot === 0;
    // where to stand: the front one at the boards, the rest queued behind it, a little to either side
    const back = front ? 0 : 0.6 + slot * 0.75;
    const side = front ? 0 : (slot % 2 === 1 ? 1 : -1) * 0.55;
    const tx = d.outX + d.nx * back + d.ax * side;
    const tz = d.outZ + d.nz * back + d.az * side;
    const dist = Math.hypot(tx - z.x, tz - z.z);

    if (this.phase === 'approach') {
      if (dist > 0.22) {
        const speed = Math.min(z.def.speedChase * z.speedScale, dist > 4 ? 9 : 2.2);
        walk(z, tx, tz, speed, dt, env);
        pose.mode = speed > 3 ? 'run' : 'walk';
        pose.speed = speed;
        pose.actionT = 0;
        if (this.t > BARRICADE.approachTimeout) return dir.release(z, env);
        return true;
      }
      if (!front) {
        // waiting its turn: shuffle and growl at the window
        idle(z, d, dt);
        return true;
      }
      this.phase = 'tear';
      this.t = 0;
    }

    // ---- at the window ----
    if (!front) {
      // the one in front climbed in or died: step up
      this.phase = 'approach';
      return true;
    }
    if (dist > 0.3) walk(z, tx, tz, 1.6, dt, env);
    turnTo(z, Math.atan2(-(d.x - z.x), -(d.z - z.z)), 8, dt);
    pose.speed = 0;
    pose.mode = 'attack';

    // a player standing at the window inside gets a swipe through the gaps
    if (this.swipeT >= 0) {
      this.swipeT += dt;
      pose.actionT = Math.min(1, this.swipeT / 0.75);
      if (!this.swipeHit && pose.actionT >= 0.55) {
        this.swipeHit = true;
        if (p.alive && sideOf(d, p.x, p.z) < 0 && Math.hypot(p.x - d.x, p.z - d.z) < BARRICADE.swipeReach + 0.25) {
          env.hurtPlayer(z.def.damage * z.dmgScale * BARRICADE.swipeDamage, z.x, z.z, 'melee', 1.2);
        }
      }
      if (this.swipeT >= 0.75) this.swipeT = -1;
      return true;
    }
    if (this.swipeCd <= 0 && p.alive && sideOf(d, p.x, p.z) < 0 && Math.hypot(p.x - d.x, p.z - d.z) < BARRICADE.swipeReach) {
      this.swipeT = 0;
      this.swipeHit = false;
      this.swipeCd = BARRICADE.swipeEvery;
      env.audio.play('zombie_attack', { pos: { x: z.x, y: 1.4, z: z.z }, volume: 0.8, priority: 2, rate: 0.9 + env.rng.f() * 0.2 });
      dir.emit({ kind: 'swipe', window: this.win });
      return true;
    }

    if (isOpen(dir.state, this.win)) {
      this.phase = 'climb';
      this.t = 0;
      this.fromX = z.x;
      this.fromZ = z.z;
      return true;
    }
    // tearing: wind up on the board, rip it off at the strike of the swing
    const rate = BARRICADE.tearRate[z.type] ?? 1;
    const off = tearStep(dir.state, this.win, dt, rate);
    pose.actionT = off ? 0.6 : Math.min(0.62, (dir.state.tear[this.win] ?? 0) * 0.62);
    if (off) {
      const left = dir.state.boards[this.win]!;
      env.audio.play('board_rip', { pos: { x: d.x, y: 1.8, z: d.z }, volume: 1, priority: 2, rate: 0.9 + env.rng.f() * 0.2 });
      dir.emit({ kind: 'tear', window: this.win, boards: left, x: z.x, z: z.z });
    }
    return true;
  }

  /** Up onto the sill, through, and down inside; then the normal AI takes over. */
  private climb(z: Zombie, d: BarricadeDef, dt: number, env: ZombieEnv): boolean {
    void dt;
    const pose = z.scriptPose;
    const u = Math.min(1, this.t / BARRICADE.climbTime);
    const k = smooth(u);
    z.x = this.fromX + (d.inX - this.fromX) * k;
    z.z = this.fromZ + (d.inZ - this.fromZ) * k;
    // held at sill height while crossing the wall (the middle of the climb), a small hop over it
    pose.lift = d.sill * Math.min(1, 1.7 * Math.sin(Math.PI * u)) + 0.12 * Math.sin(Math.PI * u);
    pose.mode = u < 0.75 ? 'walk' : 'stagger';
    pose.speed = 0.9;
    pose.actionT = u;
    z.yaw = Math.atan2(d.nx, d.nz); // facing in
    if (u < 1) return true;
    pose.lift = 0;
    env.audio.play('board_climb', { pos: { x: z.x, y: 0.5, z: z.z }, volume: 0.9, priority: 1 });
    this.dir.emit({ kind: 'climb', window: this.win });
    return this.dir.release(z, env);
  }
}

function turnTo(z: Zombie, target: number, rate: number, dt: number): void {
  const d = wrap(target - z.yaw);
  const m = rate * dt;
  z.yaw = wrap(z.yaw + Math.max(-m, Math.min(m, d)));
}

/** Walk toward (tx, tz) at `speed`, sliding along walls. */
function walk(z: Zombie, tx: number, tz: number, speed: number, dt: number, env: ZombieEnv): void {
  const dx = tx - z.x;
  const dz = tz - z.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return;
  turnTo(z, Math.atan2(-dx, -dz), z.def.turnRate, dt);
  const step = Math.min(d, speed * dt);
  const p = { x: z.x + (dx / d) * step, z: z.z + (dz / d) * step };
  env.world.resolveCircle(p, z.def.radius, 0.5, 1.7, 2);
  z.x = p.x;
  z.z = p.z;
}

function idle(z: Zombie, d: BarricadeDef, dt: number): void {
  turnTo(z, Math.atan2(-(d.x - z.x), -(d.z - z.z)), 4, dt);
  z.scriptPose.mode = 'idle';
  z.scriptPose.speed = 0;
  z.scriptPose.actionT = 0;
}

export class BarricadeDirector {
  /** Authoritative board counts (host / solo). */
  readonly state: BarricadeState;
  /** Infected assigned to each window, front of the queue first. */
  private readonly queues: Zombie[][];
  /** Everything that happens at the windows (board torn off, a climb, a swipe). */
  onEvent: (e: BarricadeEvent) => void = () => {};
  /** Only spawn through windows while this says so (e.g. not before the run starts). */
  enabled = true;

  constructor(
    readonly defs: readonly BarricadeDef[],
    private readonly zombies: ZombieManager,
  ) {
    this.state = createBarricades(defs.length);
    this.queues = defs.map(() => []);
  }

  /** Take over a share of the director's spawns. */
  install(): void {
    this.zombies.spawnOverride = (type, group, ctx, env, rng, phase) => this.spawn(type, group, ctx, env, rng, phase);
  }

  uninstall(): void {
    if (this.zombies.spawnOverride) this.zombies.spawnOverride = null;
  }

  /** Fresh run: every window boarded, no queues. */
  reset(): void {
    resetBarricades(this.state);
    for (const q of this.queues) {
      for (const z of q) if (z.script) z.script = null;
      q.length = 0;
    }
  }

  emit(e: BarricadeEvent): void {
    this.onEvent(e);
  }

  /** Position of `z` in window `w`'s queue (0 = at the boards), or -1. */
  slotOf(z: Zombie, w: number): number {
    return this.queues[w]!.indexOf(z);
  }

  queueLength(w: number): number {
    return this.queues[w]!.length;
  }

  /** Infected that are still out at the windows (all queues). */
  get pending(): number {
    let n = 0;
    for (const q of this.queues) n += q.length;
    return n;
  }

  /** Drop anything that died or was removed from the queues. Call once a frame. */
  update(): void {
    const live = this.zombies.zombies;
    for (const q of this.queues) {
      for (let i = q.length - 1; i >= 0; i--) {
        const z = q[i]!;
        if (!z.alive || !(z.script instanceof WindowScript) || !live.includes(z)) q.splice(i, 1);
      }
    }
  }

  /** Send `z` to window `w` (it walks there from wherever it is). False when that window's queue is full. */
  attach(z: Zombie, w: number): boolean {
    const q = this.queues[w];
    if (!q || q.length >= BARRICADE.queueMax || !z.alive) return false;
    z.aggro(z.x, z.z); // awake and hunting (the script drives it until it is inside)
    z.script = new WindowScript(this, w);
    z.scriptPose.lift = 0;
    q.push(z);
    return true;
  }

  /** Hand `z` back to the normal AI, hunting the player in `env`. Always returns false (a script's "let go"). */
  release(z: Zombie, env: ZombieEnv): boolean {
    for (const q of this.queues) {
      const i = q.indexOf(z);
      if (i >= 0) q.splice(i, 1);
    }
    z.scriptPose.lift = 0;
    z.vx = z.vz = 0;
    z.aggro(env.player.x, env.player.z);
    return false;
  }

  /** The director's spawn hook: maybe bring this one in through a window near the player. */
  private spawn(type: SpawnType, group: SpawnGroup, ctx: DirectorContext, env: ZombieEnv, rng: Rng, phase: number): Zombie | null {
    if (!this.enabled || group === 'lz' || this.defs.length === 0) return null;
    if (!indoors(this.defs, ctx.playerX, ctx.playerZ)) return null;
    if (!rng.chance(BARRICADE.spawnShare)) return null;
    let total = 0;
    const weights: number[] = [];
    for (const d of this.defs) {
      const dist = Math.hypot(d.x - ctx.playerX, d.z - ctx.playerZ);
      let w = 0;
      if (dist < BARRICADE.spawnRange && this.queues[d.id]!.length < BARRICADE.queueMax) {
        // not right in the player's face: a spawn point the player can see from close by is skipped
        const seen = !env.world.segmentBlocked(ctx.playerX, ctx.playerEyeY, ctx.playerZ, d.spawnX, 1.4, d.spawnZ, 'shots');
        const sd = Math.hypot(d.spawnX - ctx.playerX, d.spawnZ - ctx.playerZ);
        if (!(seen && sd < 10)) w = 1 / (1 + dist / 9);
      }
      weights.push(w);
      total += w;
    }
    if (total <= 0) return null;
    let r = rng.f() * total;
    let pick = 0;
    for (; pick < weights.length - 1; pick++) {
      r -= weights[pick]!;
      if (r <= 0 && weights[pick]! > 0) break;
    }
    if (weights[pick]! <= 0) return null;
    const d = this.defs[pick]!;
    // a little scatter so a queue does not start stacked on one spot
    const sx = d.spawnX + d.ax * (rng.f() - 0.5) * 1.2;
    const sz = d.spawnZ + d.az * (rng.f() - 0.5) * 1.2;
    const z = this.zombies.spawn(type, sx, sz, rng, { hpScale: 1 + 0.08 * phase, yaw: Math.atan2(d.nx, d.nz) });
    this.attach(z, pick);
    return z;
  }
}
