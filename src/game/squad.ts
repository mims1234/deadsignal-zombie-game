/**
 * Everyone who fights beside the player in a solo run, and the Forge's extras:
 *  - Ash and Cinder (the Forge only): two soldiers who deploy with you; side contract, keep them alive;
 *  - trapped survivors (Standard, Standard Mazoku, the Forge): caged in around the map, freed with a hold of E,
 *    then they follow you and shoot; side contract, get them out alive. On the Forge they are Vulcan's leaders;
 *  - the Trials of Ignis (the Forge only): burning embers hidden around the map.
 * The infected treat every ally who is fighting exactly like a player (the co-op targeting path); a cage's occupant
 * is left alone until freed. How allies move and shoot lives in `allyBrain.ts`, shared with the co-op simulation.
 *
 * In co-op (`follow`) the session simulation runs all of this; here the squad, the cages and the embers are only drawn
 * from its reports, and freeing someone or touching an ember is a request to it.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FORGE_SQUAD, PLAYER, QUALITY, SURVIVORS, type TeamSkill } from '../config';
import { Avatar } from '../coop/avatar';
import type { ZombieEnv } from '../enemies/zombie';
import { addCash } from '../logic/economy';
import type { HudObjective, MapMarker } from '../ui/hudTypes';
import { createObjectiveBeam } from '../world/models';
import { type AllyBody, type AllyWorld, allyFight, allyHit, allyMove, allyRecover, cageSpots, emberSpots, makeAllyBody, soldierSpots, survivorRoster } from './allyBrain';
import type { Game } from './game';

interface Ally extends AllyBody {
  avatar: Avatar;
  cage: Cage | null;
}

/** What the co-op simulation reports for one ally: [index, x, z, yaw, state (0 dead, 1 fighting, 2 caged), hp]. */
export type AllyRow = [number, number, number, number, number, number];

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

export const THANKS = [
  'Took you long enough! I have your back.',
  "I owe you one. Point me at them.",
  'Get me out of here - and give me something to shoot.',
  "Thought I was done for. Let's move.",
];

let cageMats: { bar: THREE.Material; lock: THREE.Material } | null = null;
let cageGeo: { body: THREE.BufferGeometry; door: THREE.BufferGeometry; lock: THREE.BufferGeometry } | null = null;

const CAGE_S = 1.1;
const CAGE_H = 2.3;

/** The cage as three shared meshes (frame and roof, door, padlock): a handful of draw calls however many bars. */
function cageGeometry(): NonNullable<typeof cageGeo> {
  if (cageGeo) return cageGeo;
  const S = CAGE_S;
  const H = CAGE_H;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    if (rotY) g.rotateY(rotY);
    return g;
  };
  const body: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]] as const) body.push(box(0.08, H, 0.08, x, H / 2, z));
  // three closed sides: vertical bars and two rails each
  for (const rot of [0, Math.PI / 2, -Math.PI / 2]) {
    for (let i = -4; i <= 4; i++) body.push(box(0.03, H - 0.1, 0.03, i * 0.24, H / 2, S, rot));
    for (const y of [0.1, H - 0.05]) body.push(box(2 * S, 0.05, 0.05, 0, y, S, rot));
  }
  body.push(box(2 * S, 0.04, 2 * S, 0, H, 0));
  // the door, in its own frame: hinged at x = 0
  const door: THREE.BufferGeometry[] = [];
  for (let i = 1; i <= 8; i++) door.push(box(0.03, H - 0.1, 0.03, i * 0.24, H / 2, 0));
  for (const y of [0.1, 1.15, H - 0.05]) door.push(box(2 * S, 0.05, 0.05, S, y, 0));
  cageGeo = { body: mergeGeometries(body, false)!, door: mergeGeometries(door, false)!, lock: box(0.12, 0.16, 0.06, 2 * S - 0.12, 1.15, -0.06) };
  for (const g of [...body, ...door]) g.dispose();
  return cageGeo;
}

/** A holding cage of steel bars with a padlocked door on its -Z side (2.2 m square). */
function makeCage(): Cage {
  cageMats ??= {
    bar: new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.7 }),
    lock: new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.4, metalness: 0.8, emissive: 0x402a08 }),
  };
  const geo = cageGeometry();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo.body, cageMats.bar));
  const door = new THREE.Group();
  door.position.set(-CAGE_S, 0, -CAGE_S);
  door.add(new THREE.Mesh(geo.door, cageMats.bar), new THREE.Mesh(geo.lock, cageMats.lock));
  root.add(door);
  // the guide light rises from the roof, so it never hides the person inside
  const beam = createObjectiveBeam(0x8fd18a);
  beam.position.y = CAGE_H;
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
  /** Co-op: the session simulation runs the squad; these ask it to free someone / take an ember. */
  follow = false;
  requestRescue: ((name: string) => void) | null = null;
  requestEmber: ((index: number) => void) | null = null;
  private askedAt = -9;
  private readonly world: AllyWorld;

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
    this.world = {
      get level() {
        return g.level;
      },
      get zombies() {
        return g.zombies;
      },
      get rng() {
        return g.rng;
      },
      followLeader: (x, z, out) => g.flow.follow(x, z, out, 10),
    };
  }

  get active(): boolean {
    return this.soldiers || this.survivors;
  }

  /**
   * Start of a run. `forge`: the soldiers and the Trials. `survivors`: cages around the map. `follow` (co-op): the
   * squad is listed in the simulation's order and placed by its reports; nothing here decides anything.
   */
  reset(forge: boolean, survivors: boolean, follow = false, skill: TeamSkill = 'regular'): void {
    this.soldiers = forge;
    this.survivors = survivors;
    this.follow = follow;
    this.time = 0;
    for (const a of this.allies) {
      a.avatar.dispose();
      a.cage?.root.removeFromParent();
    }
    this.allies.length = 0;
    const g = this.g;
    const spots = emberSpots(g.level);
    this.embers.forEach((e, i) => {
      e.x = spots[i]!.x;
      e.z = spots[i]!.z;
      e.taken = false;
      e.obj.position.set(e.x, 0, e.z);
      e.obj.visible = forge;
    });
    const st = g.level.data.playerStart;
    if (forge) {
      const at = soldierSpots(g.level, g.rng);
      FORGE_SQUAD.allies.forEach((name, i) => this.addAlly(makeAllyBody(g.level, name, 'soldier', at[i]!.x, at[i]!.z, st.yaw, at[i]!.slot, false, this.allies.length, skill), new Avatar(name, i, { tag: 'SQUAD', tagColor: '#8fd18a' })));
    }
    if (!survivors) return;
    const roster = survivorRoster(g.mapId);
    // co-op: the simulation chooses where the cages go and says so in its first report
    const cages = follow ? roster.map(() => null) : cageSpots(g.level, g.rng, roster.length);
    roster.forEach((who, i) => {
      const c = cages[i];
      if (!follow && !c) return;
      const a = this.addAlly(
        makeAllyBody(g.level, who.name, 'survivor', c?.x ?? 0, c?.z ?? 0, 0, c?.slot ?? { x: 0, z: 3 }, true, this.allies.length, skill),
        new Avatar(who.name, i, { color: who.color, helmet: false, tag: who.tag, tagColor: g.mapId === 'forge' ? '#ff8a3a' : '#9fd0ff' }),
      );
      a.avatar.cowering = true;
      if (c) this.placeCage(a, c.x, c.z);
      else a.avatar.root.visible = false;
    });
  }

  private addAlly(body: AllyBody, avatar: Avatar): Ally {
    this.g.worldRoot.add(avatar.root);
    const a: Ally = { ...body, avatar, cage: null };
    avatar.set(a.ref.x, 0, a.ref.z, a.yaw, true);
    this.allies.push(a);
    return a;
  }

  private placeCage(a: Ally, x: number, z: number): void {
    const cage = makeCage();
    cage.root.position.set(x, 0, z);
    this.g.worldRoot.add(cage.root);
    a.cage = cage;
  }

  /** Environments for the infected's targeting: the player first, then each ally who is fighting. */
  envs(base: ZombieEnv): ZombieEnv[] | undefined {
    if (!this.active || this.follow) return undefined;
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
      this.killed(a, sx, sz, knock);
    } else if (a.hp < a.stats.hp * 0.35 && !a.warned) {
      a.warned = true;
      g.radio(a.name.toUpperCase(), "I'm hit bad - cover me!", 3.5);
    }
  }

  /** An ally died: they fall where the blow sent them, and everyone hears about it. */
  private killed(a: Ally, sx: number, sz: number, knock: number): void {
    const g = this.g;
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
    if (this.follow) {
      this.requestRescue?.(id);
      return;
    }
    const g = this.g;
    a.trapped = false;
    a.yaw = g.player.yaw;
    addCash(g.session.inv, SURVIVORS.rescueCash);
    g.hudEvent({ type: 'cash', amount: SURVIVORS.rescueCash });
    this.announceFreed(a, `+$${SURVIVORS.rescueCash}`);
    // step out of the door
    a.ref.z -= 1.6;
  }

  /** A cage opened: the survivor takes up a weapon and says thanks. */
  private announceFreed(a: Ally, reward: string): void {
    const g = this.g;
    a.avatar.arm();
    g.audio.play('contract_complete', { priority: 3, volume: 0.8 });
    g.fx.sparkle({ x: a.ref.x, y: 1.2, z: a.ref.z }, 0x8fd18a, 18);
    const freed = this.allies.filter((q) => q.kind === 'survivor' && !q.trapped).length;
    const total = this.allies.filter((q) => q.kind === 'survivor').length;
    g.banner(`${a.name.toUpperCase()} FREED`, `Survivor ${freed}/${total} - they fight with you now${reward ? `   ${reward}` : ''}`, 'good', 4);
    g.radio(a.name.toUpperCase(), THANKS[Math.floor(g.rng.f() * THANKS.length)]!, 4);
  }

  // ---------------------------------------------------------------------------------------------
  // co-op: the simulation's reports
  // ---------------------------------------------------------------------------------------------

  /** The squad as the simulation sees it; `shots` are the allies' shots since the last report ([index, x, y, z, hit]). */
  applyRemote(rows: readonly AllyRow[], embersTaken: number, shots: readonly number[][]): void {
    if (!this.follow) return;
    const g = this.g;
    for (const [i, x, z, yaw, state, hp] of rows) {
      const a = this.allies[i];
      if (!a) continue;
      if (state === 2 && !a.cage) {
        // first report: where the cage stands
        a.ref.x = x;
        a.ref.z = z;
        this.placeCage(a, x, z);
        a.avatar.root.visible = true;
        a.avatar.set(x, 0, z, 0, true);
      }
      if (a.trapped && state !== 2) {
        a.trapped = false;
        this.announceFreed(a, '');
      }
      if (a.ref.alive && state === 0) {
        a.hp = 0;
        this.killed(a, a.ref.x + Math.sin(yaw), a.ref.z + Math.cos(yaw), 2);
      }
      a.ref.x = x;
      a.ref.z = z;
      a.yaw = yaw;
      a.hp = hp;
    }
    for (const [i, tx, ty, tz, hit] of shots) {
      const a = this.allies[i!];
      if (!a || !a.ref.alive) continue;
      const to = { x: tx!, y: ty!, z: tz! };
      a.avatar.set(a.ref.x, 0, a.ref.z, a.yaw, true);
      const from = a.avatar.fire(to);
      g.fx.tracer(from, to, a.kind === 'soldier' ? 0xffc070 : 0xd8e8ff);
      g.audio.play(a.avatar.shotSound, { pos: from, volume: 0.45, priority: 1, rate: 1.04 + g.rng.f() * 0.06 });
      void hit;
    }
    this.embers.forEach((e, i) => {
      const taken = (embersTaken & (1 << i)) !== 0;
      if (taken && !e.taken) g.fx.sparkle({ x: e.x, y: 1, z: e.z }, 0xff7a1a, 20);
      e.taken = taken;
      e.obj.visible = this.soldiers && !taken;
    });
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
      if (this.follow) {
        a.avatar.set(a.ref.x, 0, a.ref.z, a.yaw, true);
        a.avatar.update(dt);
        continue;
      }
      allyRecover(a, dt);
      a.fieldT -= dt;
      if (a.fieldT <= 0) {
        a.field.compute(a.ref.x, a.ref.z);
        a.fieldT = QUALITY[g.settings.quality].allyPathEvery;
      }
      if (alive) allyMove(a, this.world, dt, p.x, p.z, p.yaw);
      const shot = allyFight(a, this.world, dt);
      if (shot) {
        a.avatar.set(a.ref.x, 0, a.ref.z, a.yaw, true);
        const muzzle = a.avatar.fire(shot.to);
        g.fx.tracer(muzzle, shot.to, a.kind === 'soldier' ? 0xffc070 : 0xd8e8ff);
        g.audio.play(a.avatar.shotSound, { pos: muzzle, volume: 0.45, priority: 1, rate: 1.04 + g.rng.f() * 0.06 });
        if (shot.hit) {
          this.allyShooting = true;
          allyHit(a, shot, g.zombies, g.zenv);
          this.allyShooting = false;
        }
        if (g.rng.f() < 0.15) g.zombies.emitNoise(a.ref.x, a.ref.z, 26);
      }
      a.avatar.set(a.ref.x, 0, a.ref.z, a.yaw, true);
      a.avatar.update(dt);
    }

    // embers
    for (const e of this.embers) {
      if (e.taken || !this.soldiers) continue;
      e.core.rotation.y += dt * 1.6;
      e.core.position.y = 1 + Math.sin(this.time * 2 + e.x) * 0.12;
      if (alive && Math.hypot(e.x - p.x, e.z - p.z) < FORGE_SQUAD.emberRadius) {
        if (!this.follow) this.takeEmber(e);
        else if (this.time - this.askedAt > 0.5) {
          this.askedAt = this.time;
          this.requestEmber?.(this.embers.indexOf(e));
        }
      }
    }
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
    if (!this.active || this.follow) return;
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
