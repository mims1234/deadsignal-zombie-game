/**
 * The infected at the safe rooms' doors: a few at each occupied door, pounding on it. They never get in - the doors
 * take no damage, it is only them trying. They let go and hunt as usual when someone comes close or shoots one, and
 * while nobody is near a door a new one wanders up now and then, so the siege is still going when you arrive.
 *
 * No THREE / DOM: this runs wherever the infected are simulated (the solo game, or the co-op simulation). The pounding
 * is heard on each client (`runtime.ts` listens for infected in an attack pose at a door).
 */
import { FORGE_STORY } from '../config';
import type { Zombie, ZombieEnv, ZombieScript } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import type { Rng } from '../logic/rng';
import type { ZombieType } from '../types';
import type { NavGrid } from '../world/nav';
import type { SafeRoomDef } from './sites';

const S = FORGE_STORY.siege;

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

function turnTo(z: Zombie, target: number, rate: number, dt: number): void {
  const d = wrap(target - z.yaw);
  const m = rate * dt;
  z.yaw = wrap(z.yaw + Math.max(-m, Math.min(m, d)));
}

/** Where slot `i` stands at a door: the first three shoulder to shoulder at it, the rest a step behind. */
export function doorSlot(r: SafeRoomDef, i: number): { x: number; z: number } {
  const front = i < 3;
  const back = front ? 0.15 : 1.05;
  const side = front ? (i - 1) * 0.62 : (i % 2 === 0 ? -0.4 : 0.4);
  return { x: r.doorX + r.nx * back + r.ax * side, z: r.doorZ + r.nz * back + r.az * side };
}

/** One infected's errand: get to the door and pound on it. */
class DoorScript implements ZombieScript {
  private t = 0;
  private stuck = 0;
  private hp: number;
  private readonly beat: number;
  private readonly off: number;

  constructor(
    private readonly dir: SiegeDirector,
    readonly room: number,
    rng: Rng,
    z: Zombie,
  ) {
    this.hp = z.hp;
    this.beat = 0.95 + rng.f() * 0.4;
    this.off = rng.f() * this.beat;
  }

  step(z: Zombie, dt: number, env: ZombieEnv): boolean {
    const dir = this.dir;
    const r = dir.rooms[this.room]!;
    const pose = z.scriptPose;
    this.t += dt;
    // shot, or something stirred it: hunt as usual
    if (z.hp < this.hp - 0.01 || z.state !== 'idle') return dir.release(z, env);
    const p = env.player;
    if (p.alive) {
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d < S.releaseRange && !env.world.segmentBlocked(z.x, 1.5, z.z, p.x, p.eyeY - 0.15, p.z, 'shots')) return dir.release(z, env);
    }
    // the door's occupant is gone (out the back, to the Hearth): nothing left to pound on
    if (!dir.occupied[this.room]) return dir.release(z, env);
    const slot = dir.slotOf(z, this.room);
    const at = doorSlot(r, Math.max(0, slot));
    const dx = at.x - z.x;
    const dz = at.z - z.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.25) {
      // walking up: straight there (spawns are picked with a clear line to the door)
      const speed = Math.min(z.def.speedWalk * z.speedScale * 1.3, dist > 5 ? 2.4 : 1.4);
      turnTo(z, Math.atan2(-dx, -dz), z.def.turnRate, dt);
      const step = Math.min(dist, speed * dt);
      const q = { x: z.x + (dx / dist) * step, z: z.z + (dz / dist) * step };
      env.world.resolveCircle(q, z.def.radius, 0.5, 1.7, 2);
      const moved = Math.hypot(q.x - z.x, q.z - z.z);
      this.stuck = moved < step * 0.25 ? this.stuck + dt : Math.max(0, this.stuck - dt);
      z.x = q.x;
      z.z = q.z;
      pose.mode = 'walk';
      pose.speed = speed;
      pose.actionT = 0;
      if (this.stuck > 5) return dir.release(z, env);
      return true;
    }
    // at the door: face it and hammer on it, each on its own rhythm (the back rank waits, swaying)
    turnTo(z, Math.atan2(r.nx, r.nz), 6, dt);
    pose.speed = 0;
    if (slot >= 3) {
      pose.mode = 'idle';
      pose.actionT = 0;
      return true;
    }
    pose.mode = 'attack';
    pose.actionT = (((this.t + this.off) % this.beat) / this.beat) * 0.9;
    return true;
  }
}

export class SiegeDirector {
  /** Infected assigned to each room's door, front of the queue first. */
  private readonly queues: Zombie[][];
  /** Somebody is still inside (the director only besieges these). */
  readonly occupied: boolean[];
  private refillT: number[];

  constructor(
    readonly rooms: readonly SafeRoomDef[],
    private readonly zombies: ZombieManager,
    private readonly nav: NavGrid,
  ) {
    this.queues = rooms.map(() => []);
    this.occupied = rooms.map(() => false);
    this.refillT = rooms.map(() => 0);
  }

  /** A fresh run: who is in which room, and the first infected at each occupied door. */
  reset(occupied: readonly boolean[], rng: Rng): void {
    for (const q of this.queues) {
      for (const z of q) if (z.script instanceof DoorScript) z.script = null;
      q.length = 0;
    }
    this.rooms.forEach((_, i) => {
      this.occupied[i] = occupied[i] === true;
      this.refillT[i] = S.refillEvery * (0.4 + rng.f() * 0.6);
    });
    this.rooms.forEach((r, i) => {
      if (!this.occupied[i]) return;
      const n = S.min + Math.floor(rng.f() * (S.max - S.min + 1));
      for (let k = 0; k < n; k++) {
        const at = doorSlot(r, k);
        const z = this.zombies.spawn(this.pickType(rng, k), at.x, at.z, rng, { ambient: true, yaw: Math.atan2(r.nx, r.nz) });
        this.attach(z, i, rng);
      }
    });
  }

  private pickType(rng: Rng, k: number): ZombieType {
    const v = rng.f();
    return k === 0 && v < 0.2 ? 'armored' : v < 0.22 ? 'runner' : 'shambler';
  }

  /** The person in room `i` is out (or fell): the infected at that door lose interest. */
  vacate(i: number): void {
    this.occupied[i] = false;
  }

  slotOf(z: Zombie, room: number): number {
    return this.queues[room]!.indexOf(z);
  }

  /** How many are at room `i`'s door. */
  count(i: number): number {
    return this.queues[i]!.length;
  }

  /** Infected on their feet within `radius` of room `i`'s door (the door is clear when there are none). */
  threatsAt(i: number, radius: number = FORGE_STORY.doorClear): number {
    const r = this.rooms[i]!;
    let n = 0;
    for (const z of this.zombies.zombies) if (z.active && Math.hypot(z.x - r.doorX, z.z - r.doorZ) < radius) n++;
    return n;
  }

  private attach(z: Zombie, room: number, rng: Rng): void {
    z.script = new DoorScript(this, room, rng, z);
    z.scriptPose.lift = 0;
    this.queues[room]!.push(z);
  }

  /** Hand `z` back to the normal AI, hunting whoever is in `env`. Always false (a script's "let go"). */
  release(z: Zombie, env: ZombieEnv): boolean {
    for (const q of this.queues) {
      const i = q.indexOf(z);
      if (i >= 0) q.splice(i, 1);
    }
    z.vx = z.vz = 0;
    if (env.player.alive) z.aggro(env.player.x, env.player.z);
    return false;
  }

  /**
   * Once a frame: drop the dead and the released from the queues; top up a door nobody is near now and then (from a
   * spot out of everyone's sight, with a straight walk to the door).
   */
  update(dt: number, players: readonly { x: number; z: number; alive: boolean }[], rng: Rng, seenFrom: (x: number, z: number) => boolean): void {
    const live = this.zombies.zombies;
    for (const q of this.queues) {
      for (let i = q.length - 1; i >= 0; i--) {
        const z = q[i]!;
        if (!z.alive || !(z.script instanceof DoorScript) || !live.includes(z)) q.splice(i, 1);
      }
    }
    this.rooms.forEach((r, i) => {
      if (!this.occupied[i]) return;
      this.refillT[i]! -= dt;
      if (this.refillT[i]! > 0) return;
      this.refillT[i] = S.refillEvery * (0.75 + rng.f() * 0.5);
      if (this.queues[i]!.length >= S.max) return;
      // nobody close: the siege only grows behind your back
      if (players.some((p) => p.alive && Math.hypot(p.x - r.doorX, p.z - r.doorZ) < S.spawnAway)) return;
      const spot = this.spawnSpot(r, rng, seenFrom);
      if (!spot) return;
      const z = this.zombies.spawn(this.pickType(rng, 1), spot.x, spot.z, rng, { ambient: true, yaw: Math.atan2(r.doorX - spot.x, r.doorZ - spot.z) + Math.PI });
      this.attach(z, i, rng);
    });
  }

  /** A free spot 7-13 m out from the door with a clear walk to it, that no player can see. */
  private spawnSpot(r: SafeRoomDef, rng: Rng, seenFrom: (x: number, z: number) => boolean): { x: number; z: number } | null {
    for (let k = 0; k < 10; k++) {
      const d = 7 + rng.f() * 6;
      const lat = (rng.f() - 0.5) * 12;
      const x = r.doorX + r.nx * d + r.ax * lat;
      const z = r.doorZ + r.nz * d + r.az * lat;
      if (this.nav.isBlockedAt(x, z) || !this.nav.los(x, z, r.doorX + r.nx * 0.8, r.doorZ + r.nz * 0.8)) continue;
      if (seenFrom(x, z)) continue;
      return { x, z };
    }
    return null;
  }
}
