/**
 * Everyone who fights beside the player in a solo run, and the Forge's extras:
 *  - Ash and Cinder (the Forge only): two soldiers who deploy with you; side contract, keep them alive;
 *  - trapped survivors (Standard, Standard Mazoku, the Forge): caged in around the map, freed with a hold of E,
 *    then they follow you and shoot; side contract, get them out alive. On the Forge they are Vulcan's leaders;
 *  - the Trials of Ignis (the Forge only): burning embers hidden around the map.
 * The infected treat every ally who is fighting exactly like a player (the co-op targeting path); a cage's occupant
 * is left alone until freed.
 */
import * as THREE from 'three';
import { FORGE_SQUAD, PLAYER, RAGDOLL, SURVIVORS } from '../config';
import { Avatar } from '../coop/avatar';
import type { PlayerRef, Zombie, ZombieEnv } from '../enemies/zombie';
import { spreadPick } from '../logic/carriers';
import { addCash } from '../logic/economy';
import type { HudObjective, MapMarker } from '../ui/hudTypes';
import { createObjectiveBeam } from '../world/models';
import { FlowField } from '../world/nav';
import type { Game } from './game';

interface Stats {
  hp: number;
  damageTaken: number;
  range: number;
  fireInterval: number;
  bodyDamage: number;
  headDamage: number;
}

interface Ally {
  name: string;
  kind: 'soldier' | 'survivor';
  stats: Stats;
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
  /** Survivors: still in the cage. */
  trapped: boolean;
  cage: Cage | null;
}

interface Ember {
  x: number;
  z: number;
  taken: boolean;
  obj: THREE.Group;
  core: THREE.Mesh;
}

interface Cage {
  root: THREE.Group;
  door: THREE.Group;
  beam: THREE.Object3D;
  openT: number;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

const SOLDIER: Stats = { ...FORGE_SQUAD, hp: FORGE_SQUAD.allyHp, damageTaken: FORGE_SQUAD.allyDamageTaken };
const CIVILIAN: Stats = SURVIVORS;

const THANKS = [
  'Took you long enough! I have your back.',
  "I owe you one. Point me at them.",
  'Get me out of here - and give me something to shoot.',
  "Thought I was done for. Let's move.",
];

let cageMats: { bar: THREE.Material; lock: THREE.Material; floor: THREE.Material } | null = null;
let cageGeo: { post: THREE.BufferGeometry; bar: THREE.BufferGeometry; rail: THREE.BufferGeometry; lock: THREE.BufferGeometry; roof: THREE.BufferGeometry } | null = null;

/** A chain-link holding cage with a padlocked door on its -Z side (2.2 m square). */
function makeCage(): Cage {
  cageMats ??= {
    bar: new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.7 }),
    lock: new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.4, metalness: 0.8, emissive: 0x402a08 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.9 }),
  };
  const m = cageMats;
  const root = new THREE.Group();
  const S = 1.1;
  const H = 2.3;
  // shared by every cage, every run
  cageGeo ??= {
    post: new THREE.BoxGeometry(0.08, H, 0.08),
    bar: new THREE.BoxGeometry(0.03, H - 0.1, 0.03),
    rail: new THREE.BoxGeometry(2 * S, 0.05, 0.05),
    lock: new THREE.BoxGeometry(0.12, 0.16, 0.06),
    roof: new THREE.BoxGeometry(2 * S, 0.04, 2 * S),
  };
  const { post, bar, rail } = cageGeo;
  for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]] as const) {
    const p = new THREE.Mesh(post, m.bar);
    p.position.set(x, H / 2, z);
    root.add(p);
  }
  // three closed sides: vertical bars and two rails
  const side = (rot: number): void => {
    const g = new THREE.Group();
    for (let i = -4; i <= 4; i++) {
      const b = new THREE.Mesh(bar, m.bar);
      b.position.set(i * 0.24, H / 2, S);
      g.add(b);
    }
    for (const y of [0.1, H - 0.05]) {
      const r = new THREE.Mesh(rail, m.bar);
      r.position.set(0, y, S);
      g.add(r);
    }
    g.rotation.y = rot;
    root.add(g);
  };
  side(0);
  side(Math.PI / 2);
  side(-Math.PI / 2);
  // the door, hinged at its left edge
  const door = new THREE.Group();
  door.position.set(-S, 0, -S);
  for (let i = 1; i <= 8; i++) {
    const b = new THREE.Mesh(bar, m.bar);
    b.position.set(i * 0.24, H / 2, 0);
    door.add(b);
  }
  for (const y of [0.1, 1.15, H - 0.05]) {
    const r = new THREE.Mesh(rail, m.bar);
    r.position.set(S, y, 0);
    door.add(r);
  }
  const lock = new THREE.Mesh(cageGeo.lock, m.lock);
  lock.position.set(2 * S - 0.12, 1.15, -0.06);
  door.add(lock);
  root.add(door);
  const roof = new THREE.Mesh(cageGeo.roof, m.floor);
  roof.position.y = H;
  root.add(roof);
  // the guide light rises from the roof, so it never hides the person inside
  const beam = createObjectiveBeam(0x8fd18a);
  beam.position.y = H;
  root.add(beam);
  return { root, door, beam, openT: 0 };
}

export class SquadRuntime {
  private readonly allies: Ally[] = [];
  private readonly embers: Ember[] = [];
  private soldiers = false;
  private survivors = false;
  private time = 0;
  /** True while an ally's shot is being applied (the kill is theirs, not the player's). */
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
    return this.soldiers || this.survivors;
  }

  /** Start of a run. `forge`: the soldiers and the Trials. `survivors`: cages around the map. */
  reset(forge: boolean, survivors: boolean): void {
    this.soldiers = forge;
    this.survivors = survivors;
    this.time = 0;
    for (const a of this.allies) {
      a.avatar.dispose();
      a.cage?.root.removeFromParent();
    }
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
      e.obj.visible = forge;
    }
    const st = g.level.data.playerStart;
    if (forge) {
      FORGE_SQUAD.allies.forEach((name, i) => {
        const slot = { x: i === 0 ? -2.2 : 2.2, z: 2.6 };
        const at = nav.randomFreeNear(st.x + slot.x, st.z + slot.z, 2.5, rand) ?? { x: st.x + slot.x, z: st.z + slot.z };
        this.addAlly(name, 'soldier', SOLDIER, new Avatar(name, i, { tag: 'SQUAD' , tagColor: '#8fd18a' }), at.x, at.z, st.yaw, slot, false);
      });
    }
    if (survivors) this.placeSurvivors();
  }

  private addAlly(name: string, kind: Ally['kind'], stats: Stats, avatar: Avatar, x: number, z: number, yaw: number, slot: { x: number; z: number }, trapped: boolean): Ally {
    this.g.worldRoot.add(avatar.root);
    const a: Ally = {
      name,
      kind,
      stats,
      ref: { x, y: 0, z, eyeY: 1.6, alive: true, sprinting: false },
      avatar,
      hp: stats.hp,
      yaw,
      field: new FlowField(this.g.level.nav),
      fieldT: this.allies.length * 0.17,
      env: null,
      sinceHurt: 99,
      shootT: 0.5,
      pickT: 0,
      target: null,
      slot,
      warned: false,
      trapped,
      cage: null,
    };
    avatar.set(x, 0, z, yaw, true);
    this.allies.push(a);
    return a;
  }

  /** Cages at spread-out resident spots well away from the insertion point, each reachable on foot. */
  private placeSurvivors(): void {
    const g = this.g;
    const nav = g.level.nav;
    const data = g.level.data;
    const st = data.playerStart;
    const roster = g.mapId === 'forge' ? SURVIVORS.forge : SURVIVORS.district;
    const reach = new FlowField(nav);
    reach.compute(st.x, st.z);
    const clear = (x: number, z: number): boolean => {
      for (const [ox, oz] of [[0, 0], [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3], [0, -2.2]] as const) if (nav.isBlockedAt(x + ox, z + oz)) return false;
      const away = (q: { x: number; z: number }, r: number): boolean => Math.hypot(q.x - x, q.z - z) > r;
      return data.crates.every((c) => away(c, 4)) && data.stations.every((s) => away(s, 6)) && reach.isReachable(x, z + -2.2);
    };
    const pool = data.ambient.map((a) => ({ x: a.x, z: a.z })).filter((p) => Math.hypot(p.x - st.x, p.z - st.z) > SURVIVORS.minStartDistance && clear(p.x, p.z));
    const picks = spreadPick(pool, roster.length, () => g.rng.f());
    picks.forEach((pi, i) => {
      const who = roster[i]!;
      const at = pool[pi]!;
      const cage = makeCage();
      cage.root.position.set(at.x, 0, at.z);
      g.worldRoot.add(cage.root);
      const slot = { x: (i % 2 === 0 ? -1 : 1) * (1.4 + i * 0.6), z: 3.4 + i * 0.8 };
      const a = this.addAlly(who.name, 'survivor', CIVILIAN, new Avatar(who.name, i, { color: who.color, helmet: false, tag: who.tag, tagColor: g.mapId === 'forge' ? '#ff8a3a' : '#9fd0ff' }), at.x, at.z, 0, slot, true);
      a.avatar.cowering = true;
      a.cage = cage;
    });
  }

  /** Environments for the infected's targeting: the player first, then each ally who is fighting. */
  envs(base: ZombieEnv): ZombieEnv[] | undefined {
    if (!this.active) return undefined;
    const list = [base];
    for (const a of this.allies) {
      if (!a.ref.alive || a.trapped) continue;
      a.env ??= { ...base, player: a.ref, field: a.field, hurtPlayer: (amount, sx, sz, _kind, knock) => this.hurt(a, amount, sx, sz, knock) };
      a.env.time = base.time;
      a.env.rng = base.rng;
      list.push(a.env);
    }
    return list.length > 1 ? list : undefined;
  }

  private hurt(a: Ally, amount: number, sx: number, sz: number, knock: number): void {
    if (!a.ref.alive) return;
    a.hp -= amount * a.stats.damageTaken;
    a.sinceHurt = 0;
    const g = this.g;
    if (a.hp <= 0) {
      a.hp = 0;
      a.ref.alive = false;
      a.avatar.fall(a.ref.x - sx, a.ref.z - sz, 1.5 + knock * 0.8);
      g.fx.blood({ x: a.ref.x, y: 1.2, z: a.ref.z }, { x: a.ref.x - sx, y: 0.2, z: a.ref.z - sz }, { amount: 1, kill: true });
      g.feed(`${a.name.toUpperCase()} KIA`, 'danger');
      if (a.kind === 'soldier') {
        g.banner(`${a.name.toUpperCase()} IS DOWN`, 'Killed in action', 'danger', 4);
        g.radio('COMMAND', `We lost ${a.name}. Keep the other one breathing.`, 5);
      } else {
        g.banner(`${a.name.toUpperCase()} DIDN'T MAKE IT`, 'A survivor was killed', 'danger', 4);
      }
    } else if (a.hp < a.stats.hp * 0.35 && !a.warned) {
      a.warned = true;
      g.radio(a.name.toUpperCase(), "I'm hit bad - cover me!", 3.5);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // rescue (Interaction)
  // ---------------------------------------------------------------------------------------------

  /** The cage in reach of the player, if any. */
  rescueTarget(): { id: string; name: string; dist: number } | null {
    if (!this.survivors || !this.g.playerAlive()) return null;
    const p = this.g.player;
    let best: { id: string; name: string; dist: number } | null = null;
    for (const a of this.allies) {
      if (!a.trapped || !a.ref.alive) continue;
      // the door is on the cage's -Z side
      const d = Math.min(Math.hypot(a.ref.x - p.x, a.ref.z - p.z), Math.hypot(a.ref.x - p.x, a.ref.z - 1.1 - p.z));
      if (d < 2.6 && (!best || d < best.dist)) best = { id: a.name, name: a.name, dist: d };
    }
    return best;
  }

  rescue(id: string): void {
    const a = this.allies.find((q) => q.name === id && q.trapped);
    if (!a) return;
    const g = this.g;
    a.trapped = false;
    a.avatar.arm();
    a.yaw = g.player.yaw;
    addCash(g.session.inv, SURVIVORS.rescueCash);
    g.hudEvent({ type: 'cash', amount: SURVIVORS.rescueCash });
    g.audio.play('contract_complete', { priority: 3, volume: 0.8 });
    g.fx.sparkle({ x: a.ref.x, y: 1.2, z: a.ref.z }, 0x8fd18a, 18);
    const freed = this.allies.filter((q) => q.kind === 'survivor' && !q.trapped).length;
    const total = this.allies.filter((q) => q.kind === 'survivor').length;
    g.banner(`${a.name.toUpperCase()} FREED`, `Survivor ${freed}/${total} - they fight with you now   +$${SURVIVORS.rescueCash}`, 'good', 4);
    g.radio(a.name.toUpperCase(), THANKS[Math.floor(g.rng.f() * THANKS.length)]!, 4);
    // step out of the door
    a.ref.z -= 1.6;
  }

  // ---------------------------------------------------------------------------------------------
  // per frame
  // ---------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.active) return;
    const g = this.g;
    this.time += dt;
    const p = g.player;
    const alive = g.playerAlive();

    for (const a of this.allies) {
      if (a.cage) {
        const c = a.cage;
        if (!a.trapped && c.openT < 1) {
          c.openT = Math.min(1, c.openT + dt / 0.6);
          c.door.rotation.y = -1.9 * c.openT * (2 - c.openT);
          c.beam.visible = false;
        }
      }
      if (!a.ref.alive) {
        a.avatar.update(dt);
        continue;
      }
      if (a.trapped) {
        a.avatar.set(a.ref.x, 0, a.ref.z, Math.sin(this.time * 0.6 + a.ref.x) * 0.8, true);
        a.avatar.update(dt);
        continue;
      }
      a.sinceHurt += dt;
      if (a.sinceHurt > 6) {
        a.hp = Math.min(a.stats.hp, a.hp + 6 * dt);
        if (a.hp > a.stats.hp * 0.6) a.warned = false;
      }
      a.fieldT -= dt;
      if (a.fieldT <= 0) {
        a.field.compute(a.ref.x, a.ref.z);
        a.fieldT = 0.6;
      }
      if (alive) this.move(a, dt, p.x, p.z, p.yaw);
      this.fight(a, dt);
      a.avatar.set(a.ref.x, 0, a.ref.z, a.yaw, true);
      a.avatar.update(dt);
    }

    // embers
    for (const e of this.embers) {
      if (e.taken || !this.soldiers) continue;
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
      let best: number = a.stats.range;
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
    a.shootT = a.stats.fireInterval * (0.8 + g.rng.f() * 0.5);
    const dist = Math.hypot(t.x - a.ref.x, t.z - a.ref.z);
    const hit = g.rng.f() < (dist < 10 ? 0.8 : 0.6);
    const head = hit && g.rng.f() < 0.18;
    if (head) t.rig.getHeadWorld(tmpB);
    else t.rig.getChestWorld(tmpB);
    const from = { x: a.ref.x - Math.sin(a.yaw) * 0.6, y: 1.35, z: a.ref.z - Math.cos(a.yaw) * 0.6 };
    const to = hit ? { x: tmpB.x, y: tmpB.y, z: tmpB.z } : { x: tmpB.x + (g.rng.f() - 0.5) * 2, y: tmpB.y + (g.rng.f() - 0.3) * 1.5, z: tmpB.z + (g.rng.f() - 0.5) * 2 };
    g.fx.tracer(from, to, a.kind === 'soldier' ? 0xffc070 : 0xd8e8ff);
    g.audio.play(a.kind === 'soldier' ? 'rifle_shot' : 'pistol_shot', { pos: from, volume: 0.45, priority: 1, rate: 1.04 + g.rng.f() * 0.06 });
    if (!hit) return;
    this.allyShooting = true;
    g.zombies.damage(t, head ? a.stats.headDamage : a.stats.bodyDamage, head, g.zenv, a.yaw, RAGDOLL.push.ally, RAGDOLL.lift.ally);
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

  /** Extraction succeeded: a bonus for every soldier and every freed survivor who made it. */
  onExtracted(): void {
    if (!this.active) return;
    const g = this.g;
    const soldiers = this.allies.filter((a) => a.kind === 'soldier');
    const savedS = soldiers.filter((a) => a.ref.alive).length;
    if (savedS > 0) {
      const cash = savedS * FORGE_SQUAD.saveBonus;
      addCash(g.session.inv, cash);
      g.feed(`SQUAD EXTRACTED ${savedS}/${soldiers.length}  +$${cash}`, 'good');
    }
    const survivors = this.allies.filter((a) => a.kind === 'survivor');
    const savedV = survivors.filter((a) => a.ref.alive && !a.trapped).length;
    if (savedV > 0) {
      const cash = savedV * SURVIVORS.extractBonus;
      addCash(g.session.inv, cash);
      g.feed(`SURVIVORS EXTRACTED ${savedV}/${survivors.length}  +$${cash}`, 'good');
    }
  }

  objectives(out: HudObjective[]): void {
    if (!this.active) return;
    const p = this.g.player;
    if (this.soldiers) {
      const got = this.embers.filter((e) => e.taken).length;
      const next = this.nearestEmber();
      out.push({
        id: 'ignis',
        title: `TRIALS OF IGNIS  ${got}/${this.embers.length}`,
        detail: got === this.embers.length ? 'Every ember claimed' : 'Claim the burning embers around the Forge',
        state: got === this.embers.length ? 'complete' : 'active',
        progress: got / this.embers.length,
        tracked: false,
        distance: next ? Math.hypot(next.x - p.x, next.z - p.z) : -1,
      });
      const soldiers = this.allies.filter((a) => a.kind === 'soldier');
      const up = soldiers.filter((a) => a.ref.alive);
      out.push({
        id: 'squad',
        title: `KEEP THE SQUAD ALIVE  ${up.length}/${soldiers.length}`,
        detail: soldiers.map((a) => (a.ref.alive ? `${a.name} ${Math.ceil(a.hp)}` : `${a.name} KIA`)).join('   '),
        state: up.length === 0 ? 'failed' : 'active',
        progress: -1,
        tracked: false,
        distance: -1,
      });
    }
    const surv = this.allies.filter((a) => a.kind === 'survivor');
    if (surv.length > 0) {
      const freed = surv.filter((a) => !a.trapped && a.ref.alive).length;
      const lost = surv.filter((a) => !a.ref.alive).length;
      const next = this.nearestCage();
      out.push({
        id: 'survivors',
        title: `RESCUE THE SURVIVORS  ${freed}/${surv.length}`,
        detail: surv.map((a) => `${a.name} ${!a.ref.alive ? 'KIA' : a.trapped ? 'trapped' : Math.ceil(a.hp)}`).join('   '),
        state: lost === surv.length ? 'failed' : freed + lost === surv.length ? 'complete' : 'active',
        progress: freed / surv.length,
        tracked: false,
        distance: next ? Math.hypot(next.ref.x - p.x, next.ref.z - p.z) : -1,
      });
    }
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

  private nearestCage(): Ally | null {
    let best: Ally | null = null;
    let bd = Infinity;
    for (const a of this.allies) {
      if (!a.trapped || !a.ref.alive) continue;
      const d = Math.hypot(a.ref.x - this.g.player.x, a.ref.z - this.g.player.z);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** Dev / QA: who is in the squad and how they are doing. */
  devInfo(): { name: string; kind: string; trapped: boolean; alive: boolean; hp: number; x: number; z: number; fallen: boolean }[] {
    return this.allies.map((a) => ({ name: a.name, kind: a.kind, trapped: a.trapped, alive: a.ref.alive, hp: Math.round(a.hp), x: +a.ref.x.toFixed(1), z: +a.ref.z.toFixed(1), fallen: a.avatar.fallen }));
  }

  markers(out: MapMarker[]): void {
    if (!this.active) return;
    const cage = this.nearestCage();
    for (const a of this.allies) {
      if (!a.ref.alive) continue;
      if (a.trapped) out.push({ id: `cage:${a.name}`, kind: 'objective', x: a.ref.x, z: a.ref.z, label: 'SURVIVOR', color: '#9fd0ff', visible: true, compass: a === cage });
      else out.push({ id: `ally:${a.name}`, kind: 'objective', x: a.ref.x, z: a.ref.z, label: a.name.toUpperCase(), color: '#8fd18a', visible: true, compass: false });
    }
    if (!this.soldiers) return;
    const next = this.nearestEmber();
    this.embers.forEach((e, i) => {
      if (!e.taken) out.push({ id: `ember:${i}`, kind: 'objective', x: e.x, z: e.z, label: 'EMBER', color: '#ff8a2a', visible: true, compass: e === next });
    });
  }
}
