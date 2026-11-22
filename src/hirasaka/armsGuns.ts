/**
 * HIRASAKA's built guns, fired (arms wave). The weapon system spends the round, sets the aim and hands each pull to
 * `fire` (`weapons/weaponSystem.ts` `MapGunHook`); what flies on afterwards (the Happa's charges, the Ōkamuzumi's
 * bolts, the Mori's reeled catches, the comb's fire) is stepped here every frame (`update`). Numbers: `logic/hirasakaGuns.ts`.
 *
 * Every blow goes through the zombie manager's own doors (`damage`, `explode`, `pin`), so kills, points and the co-op
 * hit messages need nothing new. What only the one who runs the infected may do (reeling a body in) is done only there.
 * The comb's fire leaves a ward the hags will not cross, and the Ōkamuzumi's bolt one nothing crosses: both are the
 * director's own wards, asked for through `ward` (solo: the director; co-op: a request to the host).
 */
import * as THREE from 'three';
import { RAGDOLL } from '../config';
import type { Zombie } from '../enemies/zombie';
import type { Game } from '../game/game';
import { zombieHitDamage } from '../logic/damage';
import { HIRASAKA_GUNS, isHirasakaGun, lineOffset, reelToward } from '../logic/hirasakaGuns';
import type { WeaponId } from '../types';
import type { MapGunFeedback, MapGunHook, MapGunShot } from '../weapons/weaponSystem';
import { makeRayHit } from '../world/collision';

const H = HIRASAKA_GUNS;

interface Flyer {
  kind: 'happa' | 'okamuzumi';
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  damage: number;
  /** Stuck: to an infected (it rides along) or where it struck; seconds until it goes off. */
  stuckTo: Zombie | null;
  stuck: boolean;
  fuse: number;
}

export class HirasakaGuns implements MapGunHook {
  readonly root = new THREE.Group();
  /**
   * The bosses' door for the harpoon: called first with each harpoon's line; true when it struck something of theirs
   * (the umibōzu's hide: they send `umiHit`). Set and cleared by `hirasaka/` bosses code; null: nothing to strike.
   */
  harpoonHook: ((o: THREE.Vector3, dir: THREE.Vector3, range: number) => boolean) | null = null;
  /** Shots fired and infected struck by each gun, for whoever is counting (the QA script). */
  readonly stats: Record<string, { shots: number; hits: number; kills: number }> = {};
  private readonly flyers: Flyer[] = [];
  private readonly reels: { z: Zombie; t: number }[] = [];
  private readonly ray = makeRayHit();
  private readonly dir = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly charge: THREE.BufferGeometry;
  private readonly chargeMat: THREE.MeshStandardMaterial;
  private readonly bolt: THREE.BufferGeometry;
  private readonly boltMat: THREE.MeshBasicMaterial;
  /** The comb's fire: one additive cone out of the muzzle while it burns, and the embers where it lands. */
  private readonly jet: THREE.Mesh;
  private readonly embers: { m: THREE.Mesh; t: number }[] = [];
  private jetT = 0;
  private wardT = 0;
  private emberI = 0;

  constructor(
    private readonly g: Game,
    /** A ward at (x, z): 'comb' the hags do not cross, 'peach' nothing does. */
    private readonly ward: (kind: 'comb' | 'peach', x: number, z: number) => void,
  ) {
    this.root.name = 'HirasakaGuns';
    this.charge = new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8).rotateX(Math.PI / 2);
    this.chargeMat = new THREE.MeshStandardMaterial({ color: 0xb8321e, roughness: 0.6, emissive: 0xff3010, emissiveIntensity: 0.4 });
    this.bolt = new THREE.SphereGeometry(0.22, 12, 8);
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xffb8d8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const jg = new THREE.ConeGeometry(Math.tan(((H.kushibi.cone / 2) * Math.PI) / 180) * H.kushibi.range * 0.7, H.kushibi.range, 14, 1, true);
    jg.translate(0, -H.kushibi.range / 2, 0);
    jg.rotateX(Math.PI / 2);
    // (now the cone opens along +Z from its tip at the origin)
    jg.rotateY(Math.PI);
    this.jet = new THREE.Mesh(jg, new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.jet.visible = false;
    this.jet.frustumCulled = false;
    this.root.add(this.jet);
    const eg = new THREE.CircleGeometry(1.4, 16).rotateX(-Math.PI / 2);
    const em = new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(eg, em.clone());
      m.visible = false;
      this.root.add(m);
      this.embers.push({ m, t: 0 });
    }
    g.worldRoot.add(this.root);
  }

  owns(id: WeaponId): boolean {
    return isHirasakaGun(id);
  }

  reset(): void {
    for (const f of this.flyers) this.root.remove(f.mesh);
    this.flyers.length = 0;
    this.reels.length = 0;
    this.jet.visible = false;
    for (const e of this.embers) e.m.visible = false;
    for (const k of Object.keys(this.stats)) delete this.stats[k];
  }

  private stat(id: string): { shots: number; hits: number; kills: number } {
    return (this.stats[id] ??= { shots: 0, hits: 0, kills: 0 });
  }

  fire(shot: MapGunShot): MapGunFeedback {
    const id = shot.c.id;
    this.stat(id).shots++;
    switch (id) {
      case 'happa':
        return this.launch(shot, 'happa');
      case 'okamuzumi':
        return this.launch(shot, 'okamuzumi');
      case 'sakuganki':
        return this.bore(shot);
      case 'mori':
        return this.harpoon(shot);
      case 'kushibi':
        return this.burn(shot);
      default:
        return {};
    }
  }

  /** This shot's direction inside its spread. */
  private aim(shot: MapGunShot): THREE.Vector3 {
    const r = Math.sqrt(Math.random()) * shot.spreadDeg * (Math.PI / 180);
    const a = Math.random() * Math.PI * 2;
    return this.dir.copy(shot.fwd).addScaledVector(shot.right, Math.tan(r) * Math.cos(a)).addScaledVector(shot.up, Math.tan(r) * Math.sin(a)).normalize();
  }

  // ---- the Happa's charge and the Ōkamuzumi's bolt: they fly, and burst ----
  private launch(shot: MapGunShot, kind: Flyer['kind']): MapGunFeedback {
    const d = this.aim(shot);
    const happa = kind === 'happa';
    const mesh = new THREE.Mesh(happa ? this.charge : this.bolt, happa ? this.chargeMat : this.boltMat);
    const pos = shot.eye.clone().addScaledVector(shot.fwd, 0.7).addScaledVector(shot.right, 0.1).addScaledVector(shot.up, -0.06);
    mesh.position.copy(pos);
    this.root.add(mesh);
    const speed = happa ? H.happa.speed : H.okamuzumi.speed;
    this.flyers.push({ kind, mesh, pos, vel: d.clone().multiplyScalar(speed).add(this.tmp.set(0, happa ? 2.5 : 0, 0)), t: 0, damage: shot.s.damage, stuckTo: null, stuck: false, fuse: 0 });
    if (!happa) this.g.fx.sparkle(shot.muzzle, 0xffc0e0, 6);
    return { counted: false, sound: happa ? 'rpg_shot' : 'petal_burst', rate: happa ? 0.8 : 1, kick: happa ? 1.4 : 1.6, smoke: happa ? true : null, flash: true };
  }

  private burst(f: Flyer): void {
    const g = this.g;
    const happa = f.kind === 'happa';
    const r = happa ? H.happa.radius : H.okamuzumi.radius;
    const edge = happa ? H.happa.edgeShare : H.okamuzumi.edgeShare;
    const p = f.pos;
    const kills = g.zombies.explode(p.x, p.y, p.z, r, f.damage, f.damage * edge, 0.5, g.zenv, happa ? H.happa.knock : H.okamuzumi.knock);
    g.fx.explosion(p, r * 0.7);
    if (!happa) g.fx.sparkle(p, 0xffc0e0, 24);
    g.audio.play(happa ? 'grenade_explosion' : 'petal_burst', { pos: { x: p.x, y: p.y, z: p.z }, priority: 3, volume: 1, rate: happa ? 0.8 : 0.9 });
    const dist = Math.hypot(p.x - g.player.x, p.z - g.player.z);
    if (dist < r * 2.5) g.shake(happa ? 0.45 : 0.3);
    const st = this.stat(f.kind);
    st.kills += kills;
    if (kills > 0) {
      st.hits += kills;
      g.hudEvent({ type: 'hit', head: false, kill: true });
    }
    // the peach-light drives the dead off where it bursts (Mio too)
    if (!happa) this.ward('peach', p.x, p.z);
    g.zombies.emitNoise(p.x, p.z, happa ? 60 : 30);
  }

  // ---- the Sakuganki: a stroke through everything on its line, a wall stops it ----
  private bore(shot: MapGunShot): MapGunFeedback {
    const g = this.g;
    const zs = g.zombies;
    const d = this.aim(shot);
    const o = shot.eye;
    const R = H.sakuganki.range;
    const wall = g.level.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, R, 'shots', this.ray);
    const len = wall ? wall.t : R;
    const flat = Math.hypot(d.x, d.z) || 1;
    const fx = d.x / flat;
    const fz = d.z / flat;
    const yaw = Math.atan2(-d.x, -d.z);
    let hit = false;
    let kill = false;
    const st = this.stat('sakuganki');
    for (const z of zs.zombies) {
      if (!z.active || z.dormant) continue;
      const l = lineOffset(o.x, o.z, fx, fz, len * flat, z.x, z.z);
      if (l.along < 0 || l.along > len * flat + z.def.radius || l.off > H.sakuganki.width + z.def.radius) continue;
      // the line's height where it passes it: within the body
      const yAt = o.y + d.y * (l.along / flat);
      if (yAt < z.y - 0.2 || yAt > z.y + z.def.height + 0.3) continue;
      const dmg = zombieHitDamage(shot.s.damage, z.def, false, 1, shot.s.armorPierce, 1);
      const killed = zs.damage(z, dmg, false, g.zenv, yaw, RAGDOLL.push.sakuganki, RAGDOLL.lift.sakuganki, H.sakuganki.impulse);
      g.fx.blood({ x: z.x, y: z.y + 1.1, z: z.z }, d, { amount: 0.6, kill: killed });
      hit = true;
      kill ||= killed;
      st.hits++;
      if (killed) st.kills++;
    }
    this.tmp.set(o.x + d.x * len, o.y + d.y * len, o.z + d.z * len);
    g.fx.tracer(shot.muzzle, this.tmp, shot.color);
    if (wall) g.fx.impact({ x: wall.x, y: wall.y, z: wall.z }, { x: wall.nx, y: wall.ny, z: wall.nz }, wall.surface, { strong: true });
    return { hit, kill, sound: 'rifle_bolt', rate: 1.5, volume: 0.7, kick: 0.5, flash: false, smoke: null };
  }

  // ---- the Mori: through up to three, each pinned and reeled in; the bosses' door first ----
  private harpoon(shot: MapGunShot): MapGunFeedback {
    const g = this.g;
    const zs = g.zombies;
    const d = this.aim(shot);
    const o = shot.eye;
    const M = H.mori;
    const wall = g.level.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, M.range, 'shots', this.ray);
    const wallT = wall ? wall.t : M.range;
    const struckBig = this.harpoonHook?.(o, d, wallT) ?? false;
    const through = new Set<Zombie>();
    const yaw = Math.atan2(-d.x, -d.z);
    let hit = struckBig;
    let kill = false;
    let head = false;
    let end = wallT;
    const st = this.stat('mori');
    for (let n = 0; n < M.pierce; n++) {
      const zh = zs.raycast(o.x, o.y, o.z, d.x, d.y, d.z, wallT, through);
      if (!zh) break;
      through.add(zh.zombie);
      const dmg = zombieHitDamage(shot.s.damage, zh.zombie.def, zh.head, shot.s.headshotMul, shot.s.armorPierce, 1);
      const killed = zs.damage(zh.zombie, dmg, zh.head, g.zenv, yaw, RAGDOLL.push.mori, RAGDOLL.lift.mori, 3);
      g.fx.blood({ x: zh.x, y: zh.y, z: zh.z }, d, { head: zh.head, kill: killed, amount: 1 });
      hit = true;
      head ||= zh.head;
      kill ||= killed;
      st.hits++;
      if (killed) st.kills++;
      else if (zh.zombie.active) {
        zs.pin(zh.zombie, g.zenv, M.pin);
        this.reels.push({ z: zh.zombie, t: M.pin });
      }
      end = zh.t;
    }
    this.tmp.set(o.x + d.x * end, o.y + d.y * end, o.z + d.z * end);
    g.fx.tracer(shot.muzzle, this.tmp, shot.color);
    if (!hit && wall) g.fx.impact({ x: wall.x, y: wall.y, z: wall.z }, { x: wall.nx, y: wall.ny, z: wall.nz }, wall.surface, { strong: true });
    if (struckBig) g.shake(0.25);
    return { hit, kill, head, sound: 'impact_metal', rate: 0.7, volume: 0.9, kick: 1.3, flash: false, smoke: false };
  }

  // ---- the Kushi-bi: a tick of fire on everything in its cone (the nearest few), and a ward where it lands ----
  private burn(shot: MapGunShot): MapGunFeedback {
    const g = this.g;
    const zs = g.zombies;
    const K = H.kushibi;
    const o = shot.eye;
    const f = shot.fwd;
    const cos = Math.cos(((K.cone / 2) * Math.PI) / 180);
    const inCone: { z: Zombie; d: number }[] = [];
    for (const z of zs.zombies) {
      if (!z.active || z.dormant) continue;
      const dx = z.x - o.x;
      const dy = z.y + 1.1 - o.y;
      const dz = z.z - o.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > K.range + z.def.radius) continue;
      if (dist > 0.6 && (dx * f.x + dy * f.y + dz * f.z) / dist < cos) continue;
      if (g.level.world.segmentBlocked(o.x, o.y, o.z, z.x, z.y + 1.1, z.z, 'shots')) continue;
      inCone.push({ z, d: dist });
    }
    inCone.sort((a, b) => a.d - b.d);
    let hit = false;
    let kill = false;
    const st = this.stat('kushibi');
    const tick = shot.s.damage * shot.s.fireInterval;
    for (const { z } of inCone.slice(0, K.targets)) {
      const killed = zs.damage(z, zombieHitDamage(tick, z.def, false, 1, shot.s.armorPierce, 1), false, g.zenv, Math.atan2(-(z.x - o.x), -(z.z - o.z)), RAGDOLL.push.kushibi, RAGDOLL.lift.kushibi, 0.6);
      hit = true;
      kill ||= killed;
      st.hits++;
      if (killed) st.kills++;
    }
    // the stream: shown for a moment after each tick; a few sparks along it
    this.jetT = 0.22;
    this.jet.position.copy(shot.muzzle);
    this.jet.lookAt(this.tmp.copy(shot.muzzle).add(f));
    if (Math.random() < 0.5) g.fx.sparkle(this.tmp.copy(o).addScaledVector(f, 2 + Math.random() * K.range * 0.6), 0xff9a3a, 2);
    // where it lands: a fire on the floor the hags will not cross
    this.wardT -= shot.s.fireInterval;
    if (this.wardT <= 0) {
      this.wardT = K.wardEvery;
      const wall = g.level.world.raycast(o.x, o.y, o.z, f.x, 0, f.z, K.range * 0.8, 'move', this.ray);
      const reach = wall ? Math.max(1, wall.t - 0.5) : K.range * 0.8;
      const x = g.player.x + f.x * reach;
      const z = g.player.z + f.z * reach;
      this.ward('comb', x, z);
      const e = this.embers[this.emberI++ % this.embers.length]!;
      e.t = 6;
      e.m.position.set(x, g.level.world.floorBelow(x, z, 0.2, g.player.y + 1, 2) + 0.04, z);
      e.m.visible = true;
    }
    return { hit, kill, counted: true, sound: 'lantern_light', rate: 1.2 + Math.random() * 0.2, volume: 0.35, kick: 0.1, flash: false, smoke: null };
  }

  /** Every frame: what flies, what is reeled in, the fire. */
  update(dt: number): void {
    const g = this.g;
    const world = g.level.world;
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i]!;
      f.t += dt;
      if (f.stuck) {
        if (f.stuckTo?.active) f.pos.set(f.stuckTo.x, f.stuckTo.y + 1.2, f.stuckTo.z);
        f.mesh.position.copy(f.pos);
        f.fuse -= dt;
        if (f.fuse <= 0) {
          this.burst(f);
          this.root.remove(f.mesh);
          this.flyers.splice(i, 1);
        }
        continue;
      }
      const happa = f.kind === 'happa';
      f.vel.y -= (happa ? H.happa.gravity : 0) * dt;
      const step = f.vel.length() * dt;
      const d = this.dir.copy(f.vel).normalize();
      const zh = f.t > 0.03 ? g.zombies.raycast(f.pos.x, f.pos.y, f.pos.z, d.x, d.y, d.z, step) : null;
      const wh = world.raycast(f.pos.x, f.pos.y, f.pos.z, d.x, d.y, d.z, step, 'shots', this.ray);
      const life = happa ? H.happa.life : H.okamuzumi.life;
      if (zh && (!wh || zh.t <= wh.t)) {
        f.pos.set(zh.x, zh.y, zh.z);
        f.stuckTo = zh.zombie;
        f.stuck = true;
      } else if (wh) {
        f.pos.set(wh.x + wh.nx * 0.1, wh.y + wh.ny * 0.1, wh.z + wh.nz * 0.1);
        f.stuck = true;
      } else if (f.t > life) {
        f.stuck = true;
      } else {
        f.pos.addScaledVector(d, step);
        f.mesh.position.copy(f.pos);
        f.mesh.lookAt(this.tmp.copy(f.pos).add(d));
      }
      if (f.stuck) {
        f.fuse = happa ? H.happa.fuse : 0;
        f.mesh.position.copy(f.pos);
        if (happa) g.audio.play('impact_metal', { pos: { x: f.pos.x, y: f.pos.y, z: f.pos.z }, priority: 1, volume: 0.6, rate: 1.4 });
      }
    }
    // the Mori's catches reeled in, while they are pinned (only where the infected are run: solo, or the host)
    const reelHere = !g.zombies.netDamage;
    for (let i = this.reels.length - 1; i >= 0; i--) {
      const r = this.reels[i]!;
      r.t -= dt;
      if (r.t <= 0 || !r.z.active) {
        this.reels.splice(i, 1);
        continue;
      }
      if (!reelHere || r.z.isBoss) continue;
      const to = reelToward(g.player.x, g.player.z, r.z.x, r.z.z, dt);
      if (!world.segmentBlocked(r.z.x, r.z.y + 0.6, r.z.z, to.x, r.z.y + 0.6, to.z, 'move')) {
        r.z.x = to.x;
        r.z.z = to.z;
      }
    }
    // the comb's fire
    this.jetT = Math.max(0, this.jetT - dt);
    const jm = this.jet.material as THREE.MeshBasicMaterial;
    jm.opacity = Math.min(0.55, this.jetT * 3) * (0.8 + 0.2 * Math.random());
    this.jet.visible = this.jetT > 0;
    for (const e of this.embers) {
      if (!e.m.visible) continue;
      e.t -= dt;
      const m = e.m.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, Math.min(0.5, e.t * 0.25)) * (0.75 + 0.25 * Math.sin(e.t * 9));
      if (e.t <= 0) e.m.visible = false;
    }
  }

  dispose(): void {
    this.reset();
    this.root.removeFromParent();
    this.charge.dispose();
    this.chargeMat.dispose();
    this.bolt.dispose();
    this.boltMat.dispose();
    this.jet.geometry.dispose();
    (this.jet.material as THREE.Material).dispose();
    for (const e of this.embers) (e.m.material as THREE.Material).dispose();
    this.embers[0]?.m.geometry.dispose();
  }
}
