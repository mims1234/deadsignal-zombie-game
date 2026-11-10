/**
 * Thrown frag grenades (visible ballistic travel, world collision with bounce, fuse, distance-based blast with cover
 * checks) and the HX-7's rockets (fast, nearly straight, bursting on the first wall, floor or infected they touch).
 * ZARYA's Salyut fires its fireworks and the Signalka its flare through the same flight (`RocketOpts`): a firework is a
 * small rocket in a colour of its own that also bursts by itself in the air, a flare bursts nothing: it hurts and marks
 * the one infected it hits.
 */
import * as THREE from 'three';
import type { AudioEngineApi } from '../audio/ids';
import { GRENADE, ROCKET, ZARYA_GUNS } from '../config';
import type { ZombieEnv } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import type { FxApi } from '../fx/fxTypes';
import type { CollisionWorld } from '../world/collision';
import { makeRayHit } from '../world/collision';

interface Live {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  spin: THREE.Vector3;
  lastBounce: number;
}

interface Rocket {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  travelled: number;
  damage: number;
  smokeT: number;
  /** The HX-7's rocket, or one of ZARYA's (`RocketOpts`). */
  kind: 'rocket' | 'firework' | 'flare';
  color: number;
  glow: RocketOpts['glow'];
  hit: RocketOpts['hit'];
}

/** A rocket that is not the HX-7's: one of the Salyut's fireworks, or the Signalka's flare. */
export interface RocketOpts {
  kind: 'firework' | 'flare';
  /** What it burns (and, a firework, bursts) in. */
  color: number;
  /** A flare: where it is each frame in flight, and once more where it lands (the firer lights the place). */
  glow?: (x: number, y: number, z: number, landed: boolean) => void;
  /** A flare: it hit an infected (the firer's hit marker and accuracy). */
  hit?: (kill: boolean, head: boolean) => void;
}

export interface GrenadeHost {
  world: CollisionWorld;
  zombies: ZombieManager;
  zombieEnv(): ZombieEnv;
  fx: FxApi;
  audio: AudioEngineApi;
  /** Player position for self damage. */
  playerPos(): { x: number; y: number; z: number };
  /** `closeness` 0..1: how near the centre the player was (drives the shove). */
  hurtPlayerExplosion(amount: number, x: number, z: number, closeness: number): void;
  onExplosion(x: number, y: number, z: number): void;
  playerVelocity(): { x: number; z: number };
  /**
   * The glow of a rocket in flight (null: none flying). Lent by an existing light: adding a light to the scene at runtime
   * would recompile every material in it (the first-shot stutter).
   */
  rocketGlow?(at: { x: number; y: number; z: number } | null): void;
}

const MAX_LIVE = 4;

let rocketParts: { geo: THREE.BufferGeometry[]; mat: THREE.Material[] } | null = null;

/** A finned rocket with a burning motor, nose down its local +Z (so `lookAt` points it along its flight). */
function makeRocket(): THREE.Object3D {
  rocketParts ??= {
    geo: [
      new THREE.CylinderGeometry(0.035, 0.035, 0.36, 10).rotateX(Math.PI / 2),
      new THREE.ConeGeometry(0.05, 0.2, 10).rotateX(Math.PI / 2).translate(0, 0, 0.28),
      new THREE.BoxGeometry(0.16, 0.006, 0.08).translate(0, 0, -0.16),
      new THREE.SphereGeometry(0.07, 8, 6).scale(1, 1, 2.2).translate(0, 0, -0.32),
    ],
    mat: [
      new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.6, metalness: 0.3 }),
      new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
    ],
  };
  const [tube, head, fin, flame] = rocketParts.geo as [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry];
  const [body, glow] = rocketParts.mat as [THREE.Material, THREE.Material];
  const g = new THREE.Group();
  const fin2 = new THREE.Mesh(fin, body);
  fin2.rotation.z = Math.PI / 2;
  g.add(new THREE.Mesh(tube, body), new THREE.Mesh(head, body), new THREE.Mesh(fin, body), fin2, new THREE.Mesh(flame, glow));
  return g;
}

let brightGeo: THREE.BufferGeometry | null = null;
const brightMats = new Map<number, THREE.Material>();

/** A firework or a flare in flight: one burning drop of its colour (one mesh, unlit, the rocket flame's material). */
function brightMat(color: number): THREE.Material {
  let mat = brightMats.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    brightMats.set(color, mat);
  }
  return mat;
}

function makeBright(color: number): THREE.Mesh {
  brightGeo ??= new THREE.SphereGeometry(0.075, 8, 6).scale(1, 1, 2.6);
  return new THREE.Mesh(brightGeo, brightMat(color));
}

/** A rocket to compile the shaders with while the level loads (the first shot then has nothing left to build). */
export function rocketForPrewarm(): THREE.Object3D {
  return makeRocket();
}

export class GrenadeSystem {
  private readonly live: Live[] = [];
  private readonly free: THREE.Object3D[] = [];
  private readonly rockets: Rocket[] = [];
  private readonly freeRockets: THREE.Object3D[] = [];
  private readonly freeBright: THREE.Mesh[] = [];
  private readonly ray = makeRayHit();
  private readonly dirV = new THREE.Vector3();
  private readonly tmpV = new THREE.Vector3();
  readonly root = new THREE.Group();

  constructor(
    private readonly host: GrenadeHost,
    private readonly makeModel: () => THREE.Object3D,
  ) {
    this.root.name = 'Grenades';
  }

  get count(): number {
    return this.live.length;
  }

  throw(origin: THREE.Vector3, dir: THREE.Vector3): void {
    if (this.live.length >= MAX_LIVE) {
      // oldest detonates immediately to stay bounded
      this.explode(this.live[0]!, 0);
    }
    const obj = this.free.pop() ?? this.makeModel();
    obj.visible = true;
    this.root.add(obj);
    const pv = this.host.playerVelocity();
    const vel = new THREE.Vector3(dir.x, dir.y + GRENADE.throwUp, dir.z).normalize().multiplyScalar(GRENADE.throwSpeed);
    vel.x += pv.x * 0.5;
    vel.z += pv.z * 0.5;
    this.live.push({ obj, pos: origin.clone(), vel, fuse: GRENADE.fuse, spin: new THREE.Vector3(6 + Math.random() * 4, 3, 5 + Math.random() * 3), lastBounce: -1 });
  }

  /**
   * Launch a rocket from `origin` along `dir` (unit). `damage` is the blast's centre damage (a flare's: its hit).
   * `opts`: one of ZARYA's instead of the HX-7's.
   */
  fireRocket(origin: THREE.Vector3, dir: THREE.Vector3, damage: number, opts?: RocketOpts): void {
    let obj: THREE.Object3D;
    if (opts) {
      const m = this.freeBright.pop() ?? makeBright(opts.color);
      m.material = brightMat(opts.color);
      obj = m;
    } else obj = this.freeRockets.pop() ?? makeRocket();
    obj.visible = true;
    obj.position.copy(origin);
    this.root.add(obj);
    const Z = opts?.kind === 'flare' ? ZARYA_GUNS.signalka : opts ? ZARYA_GUNS.salyut : ROCKET;
    this.rockets.push({ obj, pos: origin.clone(), vel: dir.clone().normalize().multiplyScalar(Z.speed), life: Z.life, travelled: 0, damage, smokeT: 0, kind: opts?.kind ?? 'rocket', color: opts?.color ?? 0, glow: opts?.glow, hit: opts?.hit });
  }

  update(dt: number): void {
    this.updateRockets(dt);
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i]!;
      g.fuse -= dt;
      for (let s = 0; s < steps; s++) {
        g.vel.y -= GRENADE.gravity * h;
        g.pos.x += g.vel.x * h;
        g.pos.y += g.vel.y * h;
        g.pos.z += g.vel.z * h;
        if (this.host.world.collideSphere(g.pos, g.vel, GRENADE.radius, GRENADE.restitution, GRENADE.friction)) {
          const speed = Math.hypot(g.vel.x, g.vel.y, g.vel.z);
          if (speed > 2.2 && g.fuse > 0 && g.lastBounce < 0) {
            this.host.audio.play('grenade_bounce', { pos: g.pos, volume: Math.min(1, speed / 8), priority: 1 });
            g.lastBounce = 0.15;
          }
        }
      }
      g.lastBounce = g.lastBounce > 0 ? g.lastBounce - dt : -1;
      g.obj.position.copy(g.pos);
      g.obj.rotation.x += g.spin.x * dt * Math.min(1, Math.hypot(g.vel.x, g.vel.y, g.vel.z) / 4);
      g.obj.rotation.z += g.spin.z * dt * Math.min(1, Math.hypot(g.vel.x, g.vel.y, g.vel.z) / 4);
      if (g.fuse <= 0) this.explode(g, i);
    }
  }

  private updateRockets(dt: number): void {
    const host = this.host;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]!;
      r.life -= dt;
      r.vel.y -= (r.kind === 'flare' ? ZARYA_GUNS.signalka.gravity : r.kind === 'firework' ? ZARYA_GUNS.salyut.gravity : ROCKET.gravity) * dt;
      const speed = r.vel.length();
      const step = speed * dt;
      const d = this.dirV.copy(r.vel).divideScalar(Math.max(1e-6, speed));
      // the first thing along this step: a wall or the floor, or (once armed) an infected
      const wall = host.world.raycast(r.pos.x, r.pos.y, r.pos.z, d.x, d.y, d.z, step + ROCKET.radius, 'shots', this.ray);
      let hitT = wall ? wall.t : Infinity;
      // (a flare bursts nothing, so it needs no arming: it may hit whoever stands right in front of the barrel)
      let struck: ReturnType<ZombieManager['raycast']> = null;
      if (r.kind === 'flare' || r.travelled + step > ROCKET.armDistance) {
        const zh = host.zombies.raycast(r.pos.x, r.pos.y, r.pos.z, d.x, d.y, d.z, Math.min(hitT, step + 0.3));
        if (zh) {
          hitT = Math.min(hitT, zh.t);
          struck = zh;
        }
      }
      if (d.y < 0) hitT = Math.min(hitT, (r.pos.y - 0.02) / -d.y);
      if (hitT <= step + ROCKET.radius || r.life <= 0) {
        if (Number.isFinite(hitT)) r.pos.addScaledVector(d, Math.max(0, Math.min(hitT, step) - 0.12));
        if (r.kind === 'flare') this.flareLand(r, i, struck && struck.t <= hitT + 1e-6 ? struck : null, d);
        else this.rocketBlast(r, i);
        continue;
      }
      if (r.kind !== 'rocket') this.tmpV.copy(r.pos); // where its streak starts
      r.pos.addScaledVector(d, step);
      r.travelled += step;
      r.obj.position.copy(r.pos);
      // a firework does not thread a crowd and waste itself beyond it: it bursts as it passes anyone
      if (r.kind === 'firework' && r.travelled > ROCKET.armDistance && this.passing(r.pos, ZARYA_GUNS.salyut.proximity)) {
        this.rocketBlast(r, i);
        continue;
      }
      if (r.kind !== 'rocket') {
        // one of ZARYA's: a bright streak behind it (a flare's thick and steady, a firework's shedding sparks)
        host.fx.tracer(this.tmpV, r.pos, r.color);
        r.glow?.(r.pos.x, r.pos.y, r.pos.z, false);
      }
      r.obj.lookAt(this.tmpV.copy(r.pos).add(d));
      r.smokeT -= dt;
      if (r.smokeT <= 0) {
        r.smokeT = r.kind === 'firework' ? 0.07 : 0.03;
        if (r.kind === 'firework') host.fx.sparkle(r.pos, r.color, 2);
        else host.fx.muzzleSmoke(r.pos, this.tmpV.copy(d).negate(), false);
      }
    }
    // the HX-7's motor lights its way (ZARYA's light themselves)
    const lead = this.rockets.find((q) => q.kind === 'rocket');
    host.rocketGlow?.(lead ? { x: lead.pos.x, y: lead.pos.y, z: lead.pos.z } : null);
  }

  /** Is an infected within `reach` of this point (level with its body)? */
  private passing(p: THREE.Vector3, reach: number): boolean {
    for (const z of this.host.zombies.zombies) {
      if (!z.active || z.dormant || p.y < z.y - 0.6 || p.y > z.y + z.def.height + 0.8) continue;
      const dx = z.x - p.x;
      const dz = z.z - p.z;
      const r = reach + z.def.radius;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  private retire(r: Rocket, index: number): void {
    this.rockets.splice(index, 1);
    r.obj.visible = false;
    r.obj.removeFromParent();
    if (r.kind === 'rocket') this.freeRockets.push(r.obj);
    else this.freeBright.push(r.obj as THREE.Mesh);
  }

  private rocketBlast(r: Rocket, index: number): void {
    this.retire(r, index);
    if (r.kind === 'firework') {
      // a small rocket's blast in its own colour, and next to nothing of it for whoever lit the fuse
      const S = ZARYA_GUNS.salyut;
      this.host.fx.sparkle({ x: r.pos.x, y: Math.max(0.6, r.pos.y + 0.4), z: r.pos.z }, r.color, 22);
      this.host.fx.sparkle({ x: r.pos.x, y: Math.max(1.4, r.pos.y + 1.3), z: r.pos.z }, r.color, 14);
      this.blast(r.pos.x, Math.max(0.2, r.pos.y), r.pos.z, S.blastRadius, r.damage, r.damage * S.edgeShare, S.selfMul, S.knockback, S.selfShove);
      return;
    }
    this.blast(r.pos.x, Math.max(0.2, r.pos.y), r.pos.z, ROCKET.blastRadius, r.damage, r.damage * ROCKET.edgeShare, ROCKET.selfMul, ROCKET.knockback);
  }

  /** The Signalka's flare ends: whoever it hit is hurt and marked; either way the place flares red for a moment. */
  private flareLand(r: Rocket, index: number, hit: ReturnType<ZombieManager['raycast']>, d: THREE.Vector3): void {
    this.retire(r, index);
    const host = this.host;
    const at = hit ? { x: hit.x, y: hit.y, z: hit.z } : { x: r.pos.x, y: r.pos.y, z: r.pos.z };
    if (hit) {
      const z = hit.zombie;
      const killed = host.zombies.damage(z, r.damage, hit.head, host.zombieEnv(), Math.atan2(-d.x, -d.z), 3, 1);
      if (!killed) host.zombies.affect(z, host.zombieEnv(), ZARYA_GUNS.signalka.markTime, 0);
      host.fx.blood(at, d, { head: hit.head, kill: killed, amount: 0.6 });
      r.hit?.(killed, hit.head);
    }
    host.fx.sparkle(at, r.color, 14);
    host.audio.play('flare_ignite', { pos: at, priority: 2, volume: 0.9 });
    r.glow?.(at.x, at.y, at.z, true);
  }

  private explode(g: Live, index: number): void {
    const idx = this.live.indexOf(g);
    if (idx >= 0) this.live.splice(idx, 1);
    void index;
    g.obj.visible = false;
    g.obj.removeFromParent();
    this.free.push(g.obj);
    const { x, y, z } = g.pos;
    this.blast(x, y, z, GRENADE.blastRadius, GRENADE.centerDamage, GRENADE.edgeDamage, GRENADE.selfMul, GRENADE.knockback);
  }

  /** Fireball, damage to the infected and - scaled down, and none behind cover - to the player, who is also shoved. */
  private blast(x: number, y: number, z: number, radius: number, center: number, edge: number, selfMul: number, knock: number, selfShove = 1): void {
    const host = this.host;
    host.fx.explosion({ x, y: Math.max(0.2, y), z }, radius);
    host.audio.play('grenade_explosion', { pos: { x, y, z }, priority: 3, volume: 1.2 });
    host.zombies.explode(x, y, z, radius, center, edge, GRENADE.coverMul, host.zombieEnv(), knock);
    const p = host.playerPos();
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < radius) {
      const covered = host.world.segmentBlocked(x, y + 0.3, z, p.x, p.y - 0.3, p.z, 'shots');
      if (!covered) host.hurtPlayerExplosion((center + (edge - center) * (d / radius)) * selfMul, x, z, (1 - d / radius) * selfShove);
    }
    host.onExplosion(x, y, z);
  }

  clear(): void {
    for (const g of this.live) {
      g.obj.removeFromParent();
      this.free.push(g.obj);
    }
    this.live.length = 0;
    for (const r of this.rockets) {
      r.obj.removeFromParent();
      if (r.kind === 'rocket') this.freeRockets.push(r.obj);
      else this.freeBright.push(r.obj as THREE.Mesh);
    }
    this.rockets.length = 0;
  }

  dispose(): void {
    this.clear();
    this.root.removeFromParent();
  }
}
