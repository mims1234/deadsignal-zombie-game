/**
 * Thrown frag grenades (visible ballistic travel, world collision with bounce, fuse, distance-based blast with cover
 * checks) and the HX-7's rockets (fast, nearly straight, bursting on the first wall, floor or infected they touch).
 */
import * as THREE from 'three';
import type { AudioEngineApi } from '../audio/ids';
import { GRENADE, ROCKET } from '../config';
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
  const light = new THREE.PointLight(0xff9a40, 30, 8, 2);
  light.position.z = -0.4;
  g.add(light);
  return g;
}

export class GrenadeSystem {
  private readonly live: Live[] = [];
  private readonly free: THREE.Object3D[] = [];
  private readonly rockets: Rocket[] = [];
  private readonly freeRockets: THREE.Object3D[] = [];
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

  /** Launch a rocket from `origin` along `dir` (unit). `damage` is the blast's centre damage. */
  fireRocket(origin: THREE.Vector3, dir: THREE.Vector3, damage: number): void {
    const obj = this.freeRockets.pop() ?? makeRocket();
    obj.visible = true;
    obj.position.copy(origin);
    this.root.add(obj);
    this.rockets.push({ obj, pos: origin.clone(), vel: dir.clone().normalize().multiplyScalar(ROCKET.speed), life: ROCKET.life, travelled: 0, damage, smokeT: 0 });
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
      r.vel.y -= ROCKET.gravity * dt;
      const speed = r.vel.length();
      const step = speed * dt;
      const d = this.dirV.copy(r.vel).divideScalar(Math.max(1e-6, speed));
      // the first thing along this step: a wall or the floor, or (once armed) an infected
      const wall = host.world.raycast(r.pos.x, r.pos.y, r.pos.z, d.x, d.y, d.z, step + ROCKET.radius, 'shots', this.ray);
      let hitT = wall ? wall.t : Infinity;
      if (r.travelled + step > ROCKET.armDistance) {
        const zh = host.zombies.raycast(r.pos.x, r.pos.y, r.pos.z, d.x, d.y, d.z, Math.min(hitT, step + 0.3));
        if (zh) hitT = Math.min(hitT, zh.t);
      }
      if (d.y < 0) hitT = Math.min(hitT, (r.pos.y - 0.02) / -d.y);
      if (hitT <= step + ROCKET.radius || r.life <= 0) {
        if (Number.isFinite(hitT)) r.pos.addScaledVector(d, Math.max(0, Math.min(hitT, step) - 0.12));
        this.rocketBlast(r, i);
        continue;
      }
      r.pos.addScaledVector(d, step);
      r.travelled += step;
      r.obj.position.copy(r.pos);
      r.obj.lookAt(this.tmpV.copy(r.pos).add(d));
      r.smokeT -= dt;
      if (r.smokeT <= 0) {
        r.smokeT = 0.03;
        host.fx.muzzleSmoke(r.pos, this.tmpV.copy(d).negate(), false);
      }
    }
  }

  private rocketBlast(r: Rocket, index: number): void {
    this.rockets.splice(index, 1);
    r.obj.visible = false;
    r.obj.removeFromParent();
    this.freeRockets.push(r.obj);
    this.blast(r.pos.x, Math.max(0.2, r.pos.y), r.pos.z, ROCKET.blastRadius, r.damage, r.damage * ROCKET.edgeShare, ROCKET.selfMul, ROCKET.knockback);
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
  private blast(x: number, y: number, z: number, radius: number, center: number, edge: number, selfMul: number, knock: number): void {
    const host = this.host;
    host.fx.explosion({ x, y: Math.max(0.2, y), z }, radius);
    host.audio.play('grenade_explosion', { pos: { x, y, z }, priority: 3, volume: 1.2 });
    host.zombies.explode(x, y, z, radius, center, edge, GRENADE.coverMul, host.zombieEnv(), knock);
    const p = host.playerPos();
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < radius) {
      const covered = host.world.segmentBlocked(x, y + 0.3, z, p.x, p.y - 0.3, p.z, 'shots');
      if (!covered) host.hurtPlayerExplosion((center + (edge - center) * (d / radius)) * selfMul, x, z, 1 - d / radius);
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
      this.freeRockets.push(r.obj);
    }
    this.rockets.length = 0;
  }

  dispose(): void {
    this.clear();
    this.root.removeFromParent();
  }
}
