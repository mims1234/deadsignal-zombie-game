/**
 * Owns every infected: rig pooling, ambient population, the spawn director, LOD (dormant far zombies), spatial hash for
 * separation, noise / alert propagation, hit detection (head sphere + body cylinder), explosions and corpse cleanup.
 */
import * as THREE from 'three';
import { MISSION, RAGDOLL, SPAWN, ZOMBIES, ZOMBIE_AI, ZOMBIE_DIFFICULTY, type ZombieDef, type ZombieTuning } from '../config';
import { activeCap, pickSpawnType, spawnInterval, type SpawnType } from '../logic/director';
import type { Rng } from '../logic/rng';
import type { QualityLevel, Region, ZombieType } from '../types';
import type { Level } from '../world/level';
import type { SpawnGroup } from '../world/layout/data';
import { type NetZombie, Zombie, type ZombieEnv, type ZombieState } from './zombie';
import type { ZombieFactory, ZombieRig } from './zombieRigTypes';

export interface ZombieHit {
  zombie: Zombie;
  t: number;
  head: boolean;
  x: number;
  y: number;
  z: number;
}

class SpatialGrid {
  private readonly cell = 1.6;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: Zombie[][];
  private readonly touched: number[] = [];
  constructor(private readonly minX: number, private readonly minZ: number, w: number, d: number) {
    this.cols = Math.ceil(w / this.cell) + 2;
    this.rows = Math.ceil(d / this.cell) + 2;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }
  clear(): void {
    for (const i of this.touched) this.cells[i]!.length = 0;
    this.touched.length = 0;
  }
  private idx(x: number, z: number): number {
    const i = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
    const j = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell)));
    return j * this.cols + i;
  }
  insert(z: Zombie): void {
    const i = this.idx(z.x, z.z);
    const c = this.cells[i]!;
    if (c.length === 0) this.touched.push(i);
    c.push(z);
  }
  query(x: number, z: number, out: Zombie[]): void {
    out.length = 0;
    const ci = Math.floor((x - this.minX) / this.cell);
    const cj = Math.floor((z - this.minZ) / this.cell);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
        const c = this.cells[j * this.cols + i]!;
        for (let k = 0; k < c.length; k++) out.push(c[k]!);
      }
    }
  }
}

export interface DirectorContext {
  elapsed: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  playerEyeY: number;
  region: Region;
  phase: number;
  quality: QualityLevel;
  /** Defense contract running: burst spawns around the relay. */
  defenseActive: boolean;
  /** Extraction called: seconds since the call (null when not running). */
  extractionElapsed: number | null;
  /** Freeze all spawning (cinematics). */
  paused: boolean;
}

interface PendingSpawn {
  type: SpawnType;
  at: number;
  group: SpawnGroup;
}

export class ZombieManager {
  readonly root = new THREE.Group();
  readonly zombies: Zombie[] = [];
  boss: Zombie | null = null;
  private readonly pools = new Map<ZombieType, ZombieRig[]>();
  private nextId = 1;
  private readonly grid: SpatialGrid;
  private readonly nearby: Zombie[] = [];
  private lodTimer = 0;
  private spawnTimer = 6;
  private burstTimer = 4;
  private nextWave = 0;
  private pending: PendingSpawn[] = [];
  private simTime = 0;
  /** Counters for the results screen / tests. */
  totalSpawned = 0;
  readonly tmpV = new THREE.Vector3();
  private readonly tmpHead = new THREE.Vector3();

  onKill: (z: Zombie, head: boolean) => void = () => {};
  /** Co-op guest: damage is not applied here but reported to the host through this. */
  netDamage: ((z: Zombie, amount: number, head: boolean, shotYaw: number, push: number, lift: number) => void) | null = null;
  private readonly byNet = new Map<number, Zombie>();
  /** Multi-player simulation: let infected far from every player doze (see `update`). */
  sleepFar = false;
  /** Hands out the names some infected carry (null: this one has none). Bosses and carriers never get one. */
  namer: (() => string | null) | null = null;
  /** May the director spawn at this point? (The Asylum: only in zones whose doors are open.) null: anywhere. */
  spawnAllowed: ((x: number, z: number) => boolean) | null = null;
  /** Where the Warden lives (his hunt's lair); he is brought back here when he strays and nobody is near. */
  private lair: { x: number; z: number; yaw: number } | null = null;
  private strayT = 0;
  /** The difficulty every new infected is made with, and how many the director sends. */
  tuning: ZombieTuning = ZOMBIE_DIFFICULTY.normal;
  private readonly tagSprites = new Map<Zombie, THREE.Sprite>();
  private readonly tagMats = new Map<string, THREE.SpriteMaterial>();
  /** Co-op guest: the model and stats for card carrier `i` (0-based), which the card runtime owns. */
  carrierRig: ((i: number) => { rig: ZombieRig; def: ZombieDef } | null) | null = null;

  constructor(
    private readonly factory: ZombieFactory,
    private readonly level: Level,
  ) {
    this.root.name = 'Zombies';
    const b = level.data.bounds;
    this.grid = new SpatialGrid(b.minX - 2, b.minZ - 2, b.maxX - b.minX + 4, b.maxZ - b.minZ + 4);
  }

  // ---------------------------------------------------------------------------------------------
  // pooling / population
  // ---------------------------------------------------------------------------------------------

  private acquireRig(type: ZombieType): ZombieRig {
    const pool = this.pools.get(type);
    const rig = pool?.pop();
    if (rig) return rig;
    const created = this.factory.create(type, this.nextId * 131);
    this.root.add(created.root);
    return created;
  }

  private releaseZombie(z: Zombie): void {
    z.rig.setVisible(false);
    this.untag(z);
    if (z.ownsRig) {
      let pool = this.pools.get(z.type);
      if (!pool) {
        pool = [];
        this.pools.set(z.type, pool);
      }
      pool.push(z.rig);
    }
    if (this.boss === z) this.boss = null;
    const i = this.zombies.indexOf(z);
    if (i >= 0) this.zombies.splice(i, 1);
  }

  /**
   * `rig` + `def` place a one-off enemy (a card carrier) that animates as `type` but brings its own model and stats;
   * its rig stays with the caller and is never pooled.
   */
  spawn(
    type: ZombieType,
    x: number,
    z: number,
    rng: Rng,
    opts: { state?: ZombieState; ambient?: boolean; boss?: boolean; hpScale?: number; yaw?: number; rig?: ZombieRig; def?: ZombieDef; curable?: boolean } = {},
  ): Zombie {
    const rig = opts.rig ?? this.acquireRig(type);
    if (opts.rig && rig.root.parent !== this.root) this.root.add(rig.root);
    const zz = new Zombie(this.nextId++, type, rig);
    zz.ownsRig = !opts.rig;
    const t = this.tuning;
    zz.init(x, z, opts.yaw ?? rng.f() * Math.PI * 2, rng, { ...opts, hpScale: (opts.hpScale ?? 1) * t.hp });
    zz.speedScale *= t.speed;
    zz.dmgScale = t.damage;
    zz.sightScale = t.sight;
    if (this.namer && !opts.boss && !opts.rig && !opts.curable) {
      const name = this.namer();
      if (name) this.tagZombie(zz, name);
    }
    this.zombies.push(zz);
    this.totalSpawned++;
    return zz;
  }

  /** A name over this infected's head: white on a dark ember plate, "INFECTED" beneath. */
  tagZombie(z: Zombie, name: string): void {
    let mat = this.tagMats.get(name);
    if (!mat) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 72;
      const g = c.getContext('2d')!;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,0.9)';
      g.font = '700 26px system-ui, sans-serif';
      g.strokeText(name, 128, 24, 248);
      g.fillStyle = '#ffd9c0';
      g.fillText(name, 128, 24, 248);
      g.font = '800 15px system-ui, sans-serif';
      g.lineWidth = 4;
      g.strokeText('VULCAN  //  INFECTED', 128, 54, 248);
      g.fillStyle = '#ff6a3a';
      g.fillText('VULCAN  //  INFECTED', 128, 54, 248);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      this.tagMats.set(name, mat);
    }
    const s = new THREE.Sprite(mat);
    s.scale.set(1.4, 0.39, 1);
    s.position.y = z.def.height + 0.45;
    z.rig.root.add(s);
    z.tag = name;
    this.tagSprites.set(z, s);
  }

  private untag(z: Zombie): void {
    const s = this.tagSprites.get(z);
    if (s) {
      s.removeFromParent();
      this.tagSprites.delete(z);
    }
    z.tag = null;
  }

  /** Take one enemy out of the world immediately (a purged carrier). */
  remove(z: Zombie): void {
    this.releaseZombie(z);
  }

  /** Remove everything (restart). Rigs go back to the pools. */
  clearAll(): void {
    for (const z of [...this.zombies]) this.releaseZombie(z);
    this.byNet.clear();
    this.boss = null;
    this.lair = null;
    this.pending.length = 0;
    this.nextWave = 0;
    this.spawnTimer = 6;
    this.burstTimer = 4;
  }

  /** Seed the level with its ambient (idle) population and the Warden. */
  populate(rng: Rng): void {
    for (const a of this.level.data.ambient) {
      if (this.tuning.count < 1 && rng.f() > this.tuning.count) continue; // a quieter zone on easy
      this.spawn(a.type, a.x, a.z, rng, { ambient: true });
    }
    this.spawnWarden(rng);
  }

  /** The Warden at his lair. */
  spawnWarden(rng: Rng): Zombie {
    const h = this.level.data.hunt;
    this.lair = { x: h.wardenX, z: h.wardenZ, yaw: Math.PI };
    this.strayT = 0;
    this.boss = this.spawn('warden', h.wardenX, h.wardenZ, rng, { boss: true, ambient: true, yaw: Math.PI });
    return this.boss;
  }

  /**
   * Keep the hunt winnable: a Warden drawn out of his lair by noise who gives up the chase would otherwise settle
   * wherever he stopped, far from the search area. Once he has been calm, away from the lair and out of everyone's
   * reach for a while, he is back home (nobody sees the move).
   */
  private guardLair(dt: number, players: readonly { x: number; z: number }[]): void {
    const b = this.boss;
    const l = this.lair;
    if (!b || !l || !b.alive || b.puppet) return;
    const away = Math.hypot(b.x - l.x, b.z - l.z) > 14;
    const calm = b.state === 'idle'; // idle means he has not noticed anyone
    // nobody may see either end of the move (a downed player still has eyes: everyone counts, up or not)
    const world = this.level.world;
    const far = players.every((q) => Math.hypot(q.x - b.x, q.z - b.z) > 40 && (Math.hypot(q.x - l.x, q.z - l.z) > 60 || world.segmentBlocked(q.x, 1.6, q.z, l.x, 1.5, l.z, 'shots')));
    this.strayT = away && calm && far ? this.strayT + dt : 0;
    if (this.strayT > 6) {
      b.returnHome(l.x, l.z, l.yaw);
      this.strayT = 0;
    }
  }

  get aliveCount(): number {
    let n = 0;
    for (const z of this.zombies) if (z.alive) n++;
    return n;
  }

  /** Alive infected that have to be killed (a card carrier is purged, not killed, so she does not count). */
  get hostileCount(): number {
    let n = 0;
    for (const z of this.zombies) if (z.alive && !z.curable) n++;
    return n;
  }

  /** Active (awake, alive) enemy count used against the director cap. */
  get activeCount(): number {
    let n = 0;
    for (const z of this.zombies) if (z.alive && !z.dormant && !z.isBoss && !z.curable) n++;
    return n;
  }

  // ---------------------------------------------------------------------------------------------
  // per-frame update
  // ---------------------------------------------------------------------------------------------

  /**
   * `envs` (co-op host): one environment per player. Each infected hunts the nearest player who is up, with that
   * player's flow field and damage routing, and nothing goes dormant.
   */
  update(dt: number, env: ZombieEnv, aiEnabled: boolean, envs?: readonly ZombieEnv[]): void {
    this.simTime += dt;
    const p = env.player;
    // spatial hash of living zombies
    this.grid.clear();
    for (const z of this.zombies) if (z.active && !z.dormant) this.grid.insert(z);

    // LOD every 0.4 s. With several players (`envs`) distance is to the nearest one, and only `sleepFar` lets the
    // far ones doze (the co-op mission simulation: the district's resident population is mostly far from everyone).
    this.lodTimer -= dt;
    if (this.lodTimer <= 0) {
      this.lodTimer = 0.4;
      for (const z of this.zombies) {
        let d2 = (z.x - p.x) * (z.x - p.x) + (z.z - p.z) * (z.z - p.z);
        if (envs) {
          for (const e of envs) {
            if (!e.player.alive) continue;
            d2 = Math.min(d2, (z.x - e.player.x) ** 2 + (z.z - e.player.z) ** 2);
          }
        }
        if (z.dormant && d2 < 78 * 78) {
          z.dormant = false;
          z.rig.setVisible(true);
        } else if ((!envs || this.sleepFar) && !z.dormant && d2 > 88 * 88 && !z.chasing && !z.isBoss && !z.curable) {
          z.dormant = true;
          z.rig.setVisible(false);
        }
      }
    }

    if (aiEnabled) this.guardLair(dt, envs ? envs.map((e) => e.player) : [p]);

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i]!;
      if (z.dormant) continue;
      const dxp = z.x - p.x;
      const dzp = z.z - p.z;
      const d2p = dxp * dxp + dzp * dzp;
      z.setShadowLod(z.isBoss ? d2p < 22 * 22 : z.shadowOn ? d2p < 18 * 18 : d2p < 14 * 14);
      if (!aiEnabled && z.alive) {
        // title screen: idle animation only
        z.update(dt, { ...env, player: { ...env.player, alive: false } }, this.nearby);
        continue;
      }
      if (z.active) this.grid.query(z.x, z.z, this.nearby);
      else this.nearby.length = 0;
      z.update(dt, envs ? this.envFor(z, envs) : env, this.nearby);
    }

    // name tags: only on the living, and only near enough to read
    for (const [z, s] of this.tagSprites) {
      const d2 = (z.x - p.x) * (z.x - p.x) + (z.z - p.z) * (z.z - p.z);
      s.visible = z.active && !z.dormant && d2 < 34 * 34;
    }

    // corpse cleanup
    let corpses = 0;
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i]!;
      if (z.alive) continue;
      corpses++;
      if (z.deathT > ZOMBIE_AI.corpseLifetime || z.dormant) {
        this.releaseZombie(z);
        corpses--;
      }
    }
    if (corpses > ZOMBIE_AI.maxCorpses) {
      const dead = this.zombies.filter((z) => !z.alive).sort((a, b) => a.diedAt - b.diedAt);
      for (let i = 0; i < corpses - ZOMBIE_AI.maxCorpses; i++) this.releaseZombie(dead[i]!);
    }
  }

  /** The environment of the player this infected should hunt: the nearest one who is up, with some stickiness. */
  private envFor(z: Zombie, envs: readonly ZombieEnv[]): ZombieEnv {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < envs.length; i++) {
      const p = envs[i]!.player;
      if (!p.alive) continue;
      let d = Math.hypot(p.x - z.x, p.z - z.z);
      if (i === z.targetIdx) d *= 0.75; // do not flip between two players at similar range
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) z.targetIdx = best;
    return envs[Math.min(z.targetIdx, envs.length - 1)]!;
  }

  /** Co-op guest: make the local infected match the host's list (create, update, remove). `tagOf` names a tag index. */
  syncPuppets(list: readonly NetZombie[], rng: Rng, tagOf?: (i: number) => string | null): void {
    const seen = new Set<number>();
    for (const n of list) {
      seen.add(n.id);
      let z = this.byNet.get(n.id);
      if (!z) {
        const carrier = n.carrier > 0 ? (this.carrierRig?.(n.carrier - 1) ?? null) : null;
        // a puppet carries the host's name for it, never one of its own
        const namer = this.namer;
        this.namer = null;
        z = this.spawn(n.type, n.x, n.z, rng, carrier ? { yaw: n.yaw, rig: carrier.rig, def: carrier.def, curable: true } : { yaw: n.yaw, boss: n.type === 'warden' });
        this.namer = namer;
        z.carrierIdx = n.carrier;
        z.puppet = true;
        z.netId = n.id;
        const tag = n.tag !== undefined && n.tag >= 0 && tagOf ? tagOf(n.tag) : null;
        if (tag) this.tagZombie(z, tag);
        this.byNet.set(n.id, z);
        if (z.isBoss) this.boss = z;
      }
      z.applyNet(n);
    }
    for (const [id, z] of this.byNet) {
      if (seen.has(id)) continue;
      this.byNet.delete(id);
      this.releaseZombie(z);
    }
  }

  /** Co-op guest: animate the puppets (no AI runs here). */
  updatePuppets(dt: number, env: ZombieEnv): void {
    this.simTime += dt;
    this.grid.clear();
    const p = env.player;
    for (const z of this.zombies) {
      if (z.active) this.grid.insert(z);
      const d2 = (z.x - p.x) * (z.x - p.x) + (z.z - p.z) * (z.z - p.z);
      z.setShadowLod(z.shadowOn ? d2 < 18 * 18 : d2 < 14 * 14);
      z.puppetStep(dt, env);
    }
  }

  /** Co-op host: place one infected of a wave near the player described by `ctx`. False when no spot was free. */
  spawnForWave(type: SpawnType, hpScale: number, ctx: DirectorContext, env: ZombieEnv, rng: Rng): boolean {
    return this.spawnFrom(type, 'defense', ctx, env, rng, (hpScale - 1) / 0.08);
  }

  /** Mutual push between the player and nearby zombies (player yields less). Returns the displacement to apply to the player. */
  pushPlayer(px: number, pz: number, out: { x: number; z: number }): void {
    out.x = 0;
    out.z = 0;
    this.grid.query(px, pz, this.nearby);
    for (const z of this.nearby) {
      if (!z.active) continue;
      const dx = px - z.x;
      const dz = pz - z.z;
      const d = Math.hypot(dx, dz);
      const min = z.def.radius + 0.34;
      if (d < min && d > 1e-4) {
        const o = min - d;
        out.x += (dx / d) * o * 0.4;
        out.z += (dz / d) * o * 0.4;
        z.x -= (dx / d) * o * 0.6;
        z.z -= (dz / d) * o * 0.6;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // noise & alerts
  // ---------------------------------------------------------------------------------------------

  emitNoise(x: number, z: number, radius: number): void {
    const r2 = radius * radius;
    for (const zz of this.zombies) {
      if (!zz.alive || zz.state !== 'idle') continue;
      const dx = zz.x - x;
      const dz = zz.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      zz.hear(x, z, 0.1 + (Math.sqrt(d2) / radius) * 1.4);
      if (zz.dormant && d2 < 78 * 78) {
        zz.dormant = false;
        zz.rig.setVisible(true);
      }
    }
  }

  alertNear(x: number, z: number, radius: number, srcId: number): void {
    const r2 = radius * radius;
    for (const zz of this.zombies) {
      if (zz.id === srcId || !zz.alive || zz.state !== 'idle' || zz.dormant) continue;
      const dx = zz.x - x;
      const dz = zz.z - z;
      if (dx * dx + dz * dz < r2) zz.hear(x, z, 0.3 + Math.random() * 0.9);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // hit detection
  // ---------------------------------------------------------------------------------------------

  /** Nearest zombie hit by a ray (head sphere or body cylinder), before `maxT`. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): ZombieHit | null {
    let best: ZombieHit | null = null;
    let bestT = maxT;
    for (const z of this.zombies) {
      if (!z.active || z.dormant) continue;
      // cheap reject: distance from the ray to the zombie's column
      const cx = z.x - ox;
      const cz = z.z - oz;
      const along = cx * dx + cz * dz;
      if (along < -2) continue;
      const hrad = Math.hypot(dx, dz);
      if (hrad > 1e-6) {
        const perp = Math.abs(cx * dz - cz * dx) / hrad;
        if (perp > z.def.radius + 1.6) continue;
      }
      z.rig.getHeadWorld(this.tmpHead);
      const headT = raySphere(ox, oy, oz, dx, dy, dz, this.tmpHead.x, this.tmpHead.y, this.tmpHead.z, z.def.headRadius * 1.08);
      const bodyTop = Math.max(0.6, z.def.height - z.def.headRadius * 1.6);
      const bodyT = rayCylinder(ox, oy, oz, dx, dy, dz, z.x, z.z, z.def.radius * 0.88, 0.05, bodyTop);
      let t = -1;
      let head = false;
      if (headT >= 0 && (bodyT < 0 || headT <= bodyT + 0.03)) {
        t = headT;
        head = true;
      } else if (bodyT >= 0) {
        t = bodyT;
      }
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = { zombie: z, t, head, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t };
      }
    }
    return best;
  }

  /** Radial explosion damage with cover checks. Returns the number of kills. */
  explode(cx: number, cy: number, cz: number, radius: number, centerDamage: number, edgeDamage: number, coverMul: number, env: ZombieEnv, knock: number): number {
    let kills = 0;
    for (const z of this.zombies) {
      if (!z.active || z.dormant) continue;
      const dx = z.x - cx;
      const dz = z.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > radius + z.def.radius) continue;
      const covered = env.world.segmentBlocked(cx, cy + 0.3, cz, z.x, 1.0, z.z, 'shots');
      if (covered && coverMul <= 0) continue;
      let dmg = centerDamage + (edgeDamage - centerDamage) * Math.min(1, d / radius);
      if (covered) dmg *= coverMul;
      // `ang`: the direction away from the blast (a body is thrown along it)
      const ang = Math.atan2(-dx, -dz);
      const near = 1 - Math.min(1, d / radius);
      const throwSpeed = RAGDOLL.blastEdge + (RAGDOLL.blastCenter - RAGDOLL.blastEdge) * near;
      const throwLift = throwSpeed * RAGDOLL.blastLift + 1.5;
      if (this.netDamage) {
        this.netDamage(z, dmg, false, ang, throwSpeed, throwLift);
        continue;
      }
      const killed = z.takeDamage(dmg, false, env, ang, 3);
      if (!z.active) z.fling(ang, throwSpeed, throwLift);
      if (killed) {
        kills++;
        z.diedAt = this.simTime;
        this.onKill(z, false);
      } else if (!z.isBoss && z.active) {
        z.vx += (dx / Math.max(d, 0.3)) * knock;
        z.vz += (dz / Math.max(d, 0.3)) * knock;
        if (dmg > 40 && z.type !== 'armored') z.stagger(0.7, env);
      }
    }
    return kills;
  }

  /**
   * Apply damage from a bullet. Returns true when the zombie died. A killing blow throws the body along `shotYaw`
   * at `push` m/s with `lift` m/s up (the ragdoll).
   */
  damage(z: Zombie, amount: number, head: boolean, env: ZombieEnv, shotYaw: number, push = 0, lift = 0): boolean {
    if (this.netDamage) {
      z.flinch();
      this.netDamage(z, amount, head, shotYaw, push, lift);
      return false;
    }
    const killed = z.takeDamage(amount, head, env, shotYaw, 1);
    if (!z.active) z.fling(shotYaw, push, lift);
    if (killed) {
      z.diedAt = this.simTime;
      this.onKill(z, head);
    }
    return killed;
  }

  // ---------------------------------------------------------------------------------------------
  // director
  // ---------------------------------------------------------------------------------------------

  /** Continuous spawning by threat region and phase, plus defense bursts and extraction waves. */
  director(dt: number, ctx: DirectorContext, env: ZombieEnv, rng: Rng): void {
    if (ctx.paused) return;
    const active = this.activeCount;
    let nearAlerted = 0;
    const r2 = SPAWN.nearbyRadius * SPAWN.nearbyRadius;
    for (const z of this.zombies) {
      if (!z.alive || z.dormant || !z.chasing) continue;
      const dx = z.x - ctx.playerX;
      const dz = z.z - ctx.playerZ;
      if (dx * dx + dz * dz < r2) nearAlerted++;
    }

    // ---- extraction final horde: scripted waves ----
    if (ctx.extractionElapsed !== null) {
      const waves = MISSION.extraction.waves;
      while (this.nextWave < waves.length && ctx.extractionElapsed >= waves[this.nextWave]!.at) {
        const w = waves[this.nextWave]!;
        const n = Math.round(w.count * this.tuning.count);
        const armored = Math.round(w.armored * this.tuning.count);
        for (let i = 0; i < n; i++) {
          const type: SpawnType = i < armored ? 'armored' : rng.chance(MISSION.extraction.runnerFraction) ? 'runner' : 'shambler';
          this.pending.push({ type, at: this.simTime + i * 0.45 + rng.f() * 0.3, group: 'lz' });
        }
        this.nextWave++;
      }
    }
    if (this.pending.length > 0) {
      const cap = ctx.extractionElapsed !== null ? MISSION.extraction.activeCap : 40;
      let awake = active;
      for (let i = 0; i < this.pending.length; i++) {
        const s = this.pending[i]!;
        if (s.at > this.simTime) continue;
        if (awake >= cap) break;
        if (this.spawnFrom(s.type, s.group, ctx, env, rng, 0)) {
          awake++;
          this.pending.splice(i, 1);
          i--;
        } else if (s.at + 6 < this.simTime) {
          // could not find a valid point for a while: drop it rather than pile up
          this.pending.splice(i, 1);
          i--;
        }
      }
    }

    // ---- defense bursts ----
    if (ctx.defenseActive) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0 && active < MISSION.defense.activeCap) {
        this.burstTimer = MISSION.defense.burstEvery * (0.85 + rng.f() * 0.3);
        for (let i = 0, n = Math.round(MISSION.defense.burstSize * this.tuning.count); i < n; i++) {
          const type = pickSpawnType('medium', ctx.phase, rng);
          this.pending.push({ type, at: this.simTime + i * 0.6, group: 'defense' });
        }
      }
    }

    // ---- continuous ambient pressure by region ----
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      let interval = spawnInterval(ctx.region, ctx.phase) / this.tuning.count;
      if (ctx.defenseActive) interval = Math.min(interval, MISSION.defense.spawnInterval);
      this.spawnTimer = interval * (0.8 + rng.f() * 0.4);
      let cap = Math.min(SPAWN.hardCap, Math.max(3, Math.round(activeCap(ctx.region, ctx.phase, ctx.quality) * this.tuning.count)));
      if (ctx.defenseActive) cap = Math.max(cap, MISSION.defense.activeCap);
      if (ctx.extractionElapsed !== null) cap = Math.min(cap, MISSION.extraction.activeCap);
      if (active < cap && nearAlerted < SPAWN.nearbyLimit * this.tuning.count) {
        const type = pickSpawnType(ctx.region, ctx.phase, rng);
        this.spawnFrom(type, ctx.defenseActive ? 'defense' : 'general', ctx, env, rng, ctx.phase);
      }
    }
  }

  /** Try to place a zombie at a valid, reachable, concealed spawn point. */
  private spawnFrom(type: SpawnType, group: SpawnGroup, ctx: DirectorContext, env: ZombieEnv, rng: Rng, phase: number): boolean {
    const pts = this.level.data.spawnPoints;
    const allowed = this.spawnAllowed;
    const fx = -Math.sin(ctx.playerYaw);
    const fz = -Math.cos(ctx.playerYaw);
    const relaxed = group !== 'general';
    let chosen = -1;
    let bestScore = -1;
    for (let attempt = 0; attempt < 28; attempt++) {
      const i = Math.floor(rng.f() * pts.length);
      const sp = pts[i]!;
      if (sp.group !== group && !(group === 'defense' && sp.group === 'general')) continue;
      if (allowed && !allowed(sp.x, sp.z)) continue;
      const dx = sp.x - ctx.playerX;
      const dz = sp.z - ctx.playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist < (group === 'lz' ? 26 : relaxed ? 18 : SPAWN.minDistance) || dist > (relaxed ? 90 : SPAWN.maxDistance)) continue;
      if (!env.field.isReachable(sp.x, sp.z)) continue;
      if (SPAWN.hiddenFromPlayer && !relaxed) {
        const front = (dx * fx + dz * fz) / dist > 0.25;
        const blocked = env.world.segmentBlocked(ctx.playerX, ctx.playerEyeY, ctx.playerZ, sp.x, 1.4, sp.z, 'shots');
        if (front && !blocked && dist < 60) continue;
      }
      // avoid stacking on another zombie
      let crowded = false;
      for (const z of this.zombies) {
        if (z.alive && Math.abs(z.x - sp.x) < 1.6 && Math.abs(z.z - sp.z) < 1.6) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
      // prefer mid-range, concealed points
      const score = sp.weight * (0.5 + rng.f()) * (1 - Math.abs(dist - 40) / 80);
      if (score > bestScore) {
        bestScore = score;
        chosen = i;
      }
    }
    if (chosen < 0) return false;
    const sp = pts[chosen]!;
    const z = this.spawn(type, sp.x, sp.z, rng, { hpScale: 1 + 0.08 * phase, yaw: Math.atan2(-(ctx.playerX - sp.x), -(ctx.playerZ - sp.z)) });
    z.aggro(ctx.playerX, ctx.playerZ);
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// ray helpers
// ---------------------------------------------------------------------------------------------

function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const lx = ox - cx;
  const ly = oy - cy;
  const lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t = -b - s;
  if (t >= 0) return t;
  const t2 = -b + s;
  return t2 >= 0 ? t2 : -1;
}

/** Vertical cylinder (axis through (cx, cz)) with end caps; returns the entry distance or -1. */
function rayCylinder(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cz: number, r: number, y0: number, y1: number): number {
  const lx = ox - cx;
  const lz = oz - cz;
  let best = Infinity;
  const a = dx * dx + dz * dz;
  if (a > 1e-9) {
    const b = 2 * (lx * dx + lz * dz);
    const c = lx * lx + lz * lz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) {
        if (t < 0) continue;
        const y = oy + dy * t;
        if (y >= y0 && y <= y1 && t < best) best = t;
      }
    }
  }
  if (Math.abs(dy) > 1e-9) {
    for (const yc of [y0, y1]) {
      const t = (yc - oy) / dy;
      if (t < 0 || t >= best) continue;
      const px = lx + dx * t;
      const pz = lz + dz * t;
      if (px * px + pz * pz <= r * r) best = t;
    }
  }
  return best === Infinity ? -1 : best;
}

export { ZOMBIES };
