/**
 * The Forge's extras on top of the standard contracts:
 *  - two AI soldiers, Ash and Cinder, who follow the player, shoot the infected and can be killed for good
 *    (side contract: keep them alive until extraction);
 *  - the Trials of Ignis: burning embers hidden around the map, paid one by one and as a set.
 * The infected treat the soldiers as targets exactly like players (the co-op targeting path).
 */
import * as THREE from 'three';
import { FORGE_SQUAD, PLAYER } from '../config';
import { Avatar } from '../coop/avatar';
import type { PlayerRef, Zombie, ZombieEnv } from '../enemies/zombie';
import { addCash } from '../logic/economy';
import type { HudObjective, MapMarker } from '../ui/hudTypes';
import { createObjectiveBeam } from '../world/models';
import { FlowField } from '../world/nav';
import type { Game } from './game';

interface Ally {
  name: string;
  ref: PlayerRef;
  avatar: Avatar;
  hp: number;
  yaw: number;
  field: FlowField;
  fieldT: number;
  env: ZombieEnv | null;
  sinceHurt: number;
  shootT: number;
  pickT: number;
  target: Zombie | null;
  /** Follow slot behind the player: x to the right, z behind. */
  slot: { x: number; z: number };
  warned: boolean;
}

interface Ember {
  x: number;
  z: number;
  taken: boolean;
  obj: THREE.Group;
  core: THREE.Mesh;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class ForgeRuntime {
  private readonly allies: Ally[] = [];
  private readonly embers: Ember[] = [];
  private enabled = false;
  private time = 0;
  /** True while a soldier's shot is being applied (the kill is theirs, not the player's). */
  allyShooting = false;
  private readonly steer = { x: 0, z: 0 };

  constructor(private readonly g: Game) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x401204, emissive: 0xff6a10, emissiveIntensity: 2.2, roughness: 0.4 });
    const geo = new THREE.OctahedronGeometry(0.32, 0);
    for (const [x, z] of FORGE_SQUAD.embers) {
      const obj = new THREE.Group();
      const core = new THREE.Mesh(geo, mat);
      core.position.y = 1;
      obj.add(core, createObjectiveBeam(0xff7a1a));
      obj.visible = false;
      g.worldRoot.add(obj);
      this.embers.push({ x, z, taken: false, obj, core });
    }
  }

  get active(): boolean {
    return this.enabled;
  }

  /** Start of a run. Only the Forge's standard operations have the squad and the trials. */
  reset(enabled: boolean): void {
    this.enabled = enabled;
    this.time = 0;
    for (const a of this.allies) a.avatar.dispose();
    this.allies.length = 0;
    const g = this.g;
    const nav = g.level.nav;
    const rand = (): number => g.rng.f();
    for (const e of this.embers) {
      // snap each ember onto open ground
      const at = nav.isBlockedAt(e.x, e.z) ? (nav.randomFreeNear(e.x, e.z, 3, rand) ?? e) : e;
      e.x = at.x;
      e.z = at.z;
      e.taken = false;
      e.obj.position.set(e.x, 0, e.z);
      e.obj.visible = enabled;
    }
    if (!enabled) return;
    const st = g.level.data.playerStart;
    FORGE_SQUAD.allies.forEach((name, i) => {
      const slot = { x: i === 0 ? -2.2 : 2.2, z: 2.6 };
      const at = nav.randomFreeNear(st.x + slot.x, st.z + slot.z, 2.5, rand) ?? { x: st.x + slot.x, z: st.z + slot.z };
      const avatar = new Avatar(name, i);
      g.worldRoot.add(avatar.root);
      this.allies.push({
        name,
        ref: { x: at.x, y: 0, z: at.z, eyeY: 1.6, alive: true, sprinting: false },
        avatar,
        hp: FORGE_SQUAD.allyHp,
        yaw: st.yaw,
        field: new FlowField(nav),
        fieldT: i * 0.2,
        env: null,
        sinceHurt: 99,
        shootT: 0.5,
        pickT: 0,
        target: null,
        slot,
        warned: false,
      });
    });
  }

  /** Environments for the infected's targeting: the player first, then each soldier who is still alive. */
  envs(base: ZombieEnv): ZombieEnv[] | undefined {
    if (!this.enabled) return undefined;
    const list = [base];
    for (const a of this.allies) {
      if (!a.ref.alive) continue;
      a.env ??= { ...base, player: a.ref, field: a.field, hurtPlayer: (amount) => this.hurt(a, amount) };
      a.env.time = base.time;
      a.env.rng = base.rng;
      list.push(a.env);
    }
    return list.length > 1 ? list : undefined;
  }

  private hurt(a: Ally, amount: number): void {
    if (!a.ref.alive) return;
    a.hp -= amount * FORGE_SQUAD.allyDamageTaken;
    a.sinceHurt = 0;
    const g = this.g;
    if (a.hp <= 0) {
      a.hp = 0;
      a.ref.alive = false;
      a.avatar.set(a.ref.x, 0, a.ref.z, a.yaw, false);
      g.fx.dust({ x: a.ref.x, y: 0.4, z: a.ref.z }, 0.8);
      g.banner(`${a.name.toUpperCase()} IS DOWN`, 'Killed in action', 'danger', 4);
      g.radio('COMMAND', `We lost ${a.name}. Keep the other one breathing.`, 5);
      g.feed(`${a.name.toUpperCase()} KIA`, 'danger');
    } else if (a.hp < FORGE_SQUAD.allyHp * 0.35 && !a.warned) {
      a.warned = true;
      g.radio(a.name.toUpperCase(), "I'm hit bad - cover me!", 3.5);
    }
  }

  update(dt: number): void {
    if (!this.enabled) return;
    const g = this.g;
    this.time += dt;
    const p = g.player;
    const alive = g.playerAlive();

    for (const a of this.allies) {
      if (!a.ref.alive) continue;
      a.sinceHurt += dt;
      if (a.sinceHurt > 6) {
        a.hp = Math.min(FORGE_SQUAD.allyHp, a.hp + 6 * dt);
        if (a.hp > FORGE_SQUAD.allyHp * 0.6) a.warned = false;
      }
      a.fieldT -= dt;
      if (a.fieldT <= 0) {
        a.field.compute(a.ref.x, a.ref.z);
        a.fieldT = 0.5;
      }
      if (alive) this.move(a, dt, p.x, p.z, p.yaw);
      this.fight(a, dt);
      a.avatar.set(a.ref.x, 0, a.ref.z, a.yaw, true);
      a.avatar.update(dt);
    }

    // embers
    for (const e of this.embers) {
      if (e.taken) continue;
      e.core.rotation.y += dt * 1.6;
      e.core.position.y = 1 + Math.sin(this.time * 2 + e.x) * 0.12;
      if (alive && Math.hypot(e.x - p.x, e.z - p.z) < FORGE_SQUAD.emberRadius) this.takeEmber(e);
    }
  }

  private move(a: Ally, dt: number, px: number, pz: number, pyaw: number): void {
    const g = this.g;
    // the follow slot, behind and to the side of the player
    const c = Math.cos(pyaw);
    const s = Math.sin(pyaw);
    const tx = px + a.slot.x * c + a.slot.z * s;
    const tz = pz - a.slot.x * s + a.slot.z * c;
    const toPlayer = Math.hypot(px - a.ref.x, pz - a.ref.z);
    // lost (left far behind or stuck): regroup next to the player, out of sight
    if (toPlayer > FORGE_SQUAD.regroupDistance) {
      const at = g.level.nav.randomFreeNear(tx, tz, 3, () => g.rng.f());
      if (at) {
        a.ref.x = at.x;
        a.ref.z = at.z;
      }
      return;
    }
    const dx = tx - a.ref.x;
    const dz = tz - a.ref.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2 || toPlayer < 2.6) {
      if (!a.target) a.yaw = pyaw;
      return;
    }
    let gx = tx;
    let gz = tz;
    if (!g.level.nav.los(a.ref.x, a.ref.z, tx, tz) && g.flow.follow(a.ref.x, a.ref.z, this.steer, 10)) {
      gx = this.steer.x;
      gz = this.steer.z;
    }
    const sx = gx - a.ref.x;
    const sz = gz - a.ref.z;
    const sd = Math.hypot(sx, sz) || 1;
    const speed = (d > 10 ? 6.2 : 4.4) * dt;
    const step = { x: a.ref.x + (sx / sd) * Math.min(speed, sd), z: a.ref.z + (sz / sd) * Math.min(speed, sd) };
    g.level.world.resolveCircle(step, 0.32, 0.5, 1.7, 3);
    a.ref.x = step.x;
    a.ref.z = step.z;
    a.ref.eyeY = 1.6;
    if (!a.target) a.yaw = Math.atan2(-sx, -sz);
  }

  private fight(a: Ally, dt: number): void {
    const g = this.g;
    a.pickT -= dt;
    if (a.pickT <= 0 || (a.target && !a.target.active)) {
      a.pickT = 0.3;
      a.target = null;
      let best: number = FORGE_SQUAD.range;
      for (const z of g.zombies.zombies) {
        if (!z.active || z.dormant) continue;
        const d = Math.hypot(z.x - a.ref.x, z.z - a.ref.z);
        if (d >= best) continue;
        z.rig.getChestWorld(tmpA);
        if (g.level.world.segmentBlocked(a.ref.x, 1.45, a.ref.z, tmpA.x, tmpA.y, tmpA.z, 'shots')) continue;
        best = d;
        a.target = z;
      }
    }
    const t = a.target;
    if (!t) return;
    a.yaw = Math.atan2(-(t.x - a.ref.x), -(t.z - a.ref.z));
    a.shootT -= dt;
    if (a.shootT > 0) return;
    a.shootT = FORGE_SQUAD.fireInterval * (0.8 + g.rng.f() * 0.5);
    const dist = Math.hypot(t.x - a.ref.x, t.z - a.ref.z);
    const hit = g.rng.f() < (dist < 10 ? 0.8 : 0.6);
    const head = hit && g.rng.f() < 0.18;
    if (head) t.rig.getHeadWorld(tmpB);
    else t.rig.getChestWorld(tmpB);
    const from = { x: a.ref.x - Math.sin(a.yaw) * 0.6, y: 1.35, z: a.ref.z - Math.cos(a.yaw) * 0.6 };
    const to = hit ? { x: tmpB.x, y: tmpB.y, z: tmpB.z } : { x: tmpB.x + (g.rng.f() - 0.5) * 2, y: tmpB.y + (g.rng.f() - 0.3) * 1.5, z: tmpB.z + (g.rng.f() - 0.5) * 2 };
    g.fx.tracer(from, to, 0xffc070);
    g.audio.play('rifle_shot', { pos: from, volume: 0.45, priority: 1, rate: 1.04 + g.rng.f() * 0.06 });
    if (!hit) return;
    this.allyShooting = true;
    g.zombies.damage(t, head ? FORGE_SQUAD.headDamage : FORGE_SQUAD.bodyDamage, head, g.zenv, a.yaw);
    this.allyShooting = false;
    if (g.rng.f() < 0.15) g.zombies.emitNoise(a.ref.x, a.ref.z, 26);
  }

  private takeEmber(e: Ember): void {
    const g = this.g;
    e.taken = true;
    e.obj.visible = false;
    const got = this.embers.filter((q) => q.taken).length;
    addCash(g.session.inv, FORGE_SQUAD.emberCash);
    g.hudEvent({ type: 'cash', amount: FORGE_SQUAD.emberCash });
    g.fx.sparkle({ x: e.x, y: 1, z: e.z }, 0xff7a1a, 20);
    g.audio.play('pickup_cash', { priority: 2 });
    g.feed(`IGNIS EMBER ${got}/${this.embers.length}  +$${FORGE_SQUAD.emberCash}`, 'good');
    if (got === this.embers.length) {
      addCash(g.session.inv, FORGE_SQUAD.trialsBonus);
      g.session.inv.plates = Math.min(PLAYER.maxPlates, g.session.inv.plates + 2);
      g.hudEvent({ type: 'cash', amount: FORGE_SQUAD.trialsBonus });
      g.banner('TRIALS OF IGNIS COMPLETE', `+$${FORGE_SQUAD.trialsBonus}   +2 ARMOR PLATES`, 'good', 5);
      g.audio.play('contract_complete', { priority: 3 });
    }
  }

  /** Extraction succeeded: the squad bonus for every soldier who made it. */
  onExtracted(): void {
    if (!this.enabled) return;
    const saved = this.allies.filter((a) => a.ref.alive).length;
    if (saved === 0) return;
    const cash = saved * FORGE_SQUAD.saveBonus;
    addCash(this.g.session.inv, cash);
    this.g.feed(`SQUAD EXTRACTED ${saved}/${this.allies.length}  +$${cash}`, 'good');
  }

  objectives(out: HudObjective[]): void {
    if (!this.enabled) return;
    const got = this.embers.filter((e) => e.taken).length;
    const next = this.nearestEmber();
    out.push({
      id: 'ignis',
      title: `TRIALS OF IGNIS  ${got}/${this.embers.length}`,
      detail: got === this.embers.length ? 'Every ember claimed' : 'Claim the burning embers around the Forge',
      state: got === this.embers.length ? 'complete' : 'active',
      progress: got / this.embers.length,
      tracked: false,
      distance: next ? Math.hypot(next.x - this.g.player.x, next.z - this.g.player.z) : -1,
    });
    const up = this.allies.filter((a) => a.ref.alive);
    out.push({
      id: 'squad',
      title: `KEEP THE SQUAD ALIVE  ${up.length}/${this.allies.length}`,
      detail: this.allies.map((a) => (a.ref.alive ? `${a.name} ${Math.ceil(a.hp)}` : `${a.name} KIA`)).join('   '),
      state: up.length === 0 ? 'failed' : 'active',
      progress: -1,
      tracked: false,
      distance: -1,
    });
  }

  private nearestEmber(): Ember | null {
    let best: Ember | null = null;
    let bd = Infinity;
    for (const e of this.embers) {
      if (e.taken) continue;
      const d = Math.hypot(e.x - this.g.player.x, e.z - this.g.player.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  markers(out: MapMarker[]): void {
    if (!this.enabled) return;
    for (const a of this.allies) {
      if (a.ref.alive) out.push({ id: `ally:${a.name}`, kind: 'objective', x: a.ref.x, z: a.ref.z, label: a.name.toUpperCase(), color: '#8fd18a', visible: true, compass: false });
    }
    const next = this.nearestEmber();
    this.embers.forEach((e, i) => {
      if (!e.taken) out.push({ id: `ember:${i}`, kind: 'objective', x: e.x, z: e.z, label: 'EMBER', color: '#ff8a2a', visible: true, compass: e === next });
    });
  }
}
