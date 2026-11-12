/**
 * Melee in the world: the weapons a player swings beside their guns (`logic/melee.ts` has the rules; ZARYA keeps every
 * one taken in `pack`, and one is out at a time).
 * While it is out the guns are holstered and the trigger swings it: a tap is a light swing, a hold winds up a heavy
 * one, and aim becomes the guard. A swing lands on the infected inside its reach and arc (never through a wall); the
 * one under the crosshair can be hit in the head; and one caught drawing back for its own blow is parried.
 *
 * Damage goes through `ZombieManager.damage`, the same door a bullet uses, so kills, points and the co-op hit message
 * need nothing new.
 */
import * as THREE from 'three';
import type { AudioEngineApi } from '../audio/ids';
import type { Zombie, ZombieEnv } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import type { FxApi } from '../fx/fxTypes';
import { zombieHitDamage } from '../logic/damage';
import { MELEE, MELEE_RULES, createSwing, guardedDamage, pinFor, resetSwing, stepSwing, swingDamage, swingProgress, swingReach, type MeleeDef, type MeleeId, type SwingEvent, type SwingHit } from '../logic/melee';
import type { Player } from '../player/player';
import type { GameRenderer } from '../render/renderer';
import type { HudEvent, HudWeaponInfo } from '../ui/hudTypes';
import type { CollisionWorld } from '../world/collision';
import type { MeleeRig, MeleeView } from './viewmodel/melee';

export interface MeleeHost {
  renderer: GameRenderer;
  world: CollisionWorld;
  zombies: ZombieManager;
  zombieEnv(): ZombieEnv;
  audio: AudioEngineApi;
  fx: FxApi;
  player: Player;
  reducedMotion(): boolean;
  hudEvent(e: HudEvent): void;
  /** A swing landed: the infected within `radius` hear it. */
  noise(radius: number): void;
  alive(): boolean;
}

export interface MeleeInput {
  fire: boolean;
  firePressed: boolean;
  /** The aim button, which guards while something is in hand. */
  guard: boolean;
  /** Swing by itself when something is in reach (phones with auto-fire on). */
  auto: boolean;
  /** Menus, panels, a grenade or a plate in hand: no swinging. */
  locked: boolean;
  mouseDX: number;
  mouseDY: number;
}

const radiusOf = (z: Zombie): number => z.def.radius;

export class MeleeSystem {
  /** What the player carries to swing (the one that comes out), and whether it is in hand now. */
  carried: MeleeId | null = null;
  /**
   * Every weapon to swing the player has taken, in the order taken (ZARYA's arsenal keeps them all: `logic/arsenal.ts`
   * puts them in the weapon cycle after the guns). `carried` is always one of them.
   */
  readonly pack: MeleeId[] = [];
  out = false;
  /** Hide the viewmodel (cinematics, free roam). */
  hidden = false;
  /** Swings landed and infected struck, for whoever is counting. */
  swings = 0;
  hits = 0;
  private readonly swing = createSwing();
  private readonly events: SwingEvent[] = [];
  private readonly reach: SwingHit<Zombie>[] = [];
  private readonly near: Zombie[] = [];
  /** (ZARYA round 3) When the Rogatina last pinned each one (it is not pinned again for a while: `pinFor`). */
  private readonly pinned = new WeakMap<Zombie, number>();
  private raise = 0;
  private guardT = 0;
  private sprintT = 0;
  private time = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private readonly view: MeleeView = { id: 'knife', raise: 0, phase: 'idle', u: 0, heavy: false, combo: 0, guard: 0, time: 0, move: 0, bobPhase: 0, sprint: 0, lookYaw: 0, lookPitch: 0, reducedMotion: false };
  private readonly at = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(
    private readonly host: MeleeHost,
    private readonly rig: MeleeRig,
  ) {
    host.renderer.viewScene.add(rig.root);
  }

  get def(): MeleeDef | null {
    return this.carried ? MELEE[this.carried] : null;
  }

  /** Guarding now (the guard is up, with a weapon that can). */
  get guarding(): boolean {
    return this.out && this.guardT > 0.5 && (this.def?.guard ?? 0) > 0 && this.swing.phase === 'idle';
  }

  /** Mid-swing (the caller keeps the weapon in hand until it is over). */
  get busy(): boolean {
    return this.swing.phase !== 'idle';
  }

  get blocksSprint(): boolean {
    return this.out && (this.swing.phase !== 'idle' || this.guardT > 0.05);
  }

  get moveMul(): number {
    return this.out ? (this.def?.moveMul ?? 1) : 1;
  }

  /** Take a weapon to swing: it joins the others carried and is the one that comes out. */
  equip(id: MeleeId): void {
    if (!this.pack.includes(id)) this.pack.push(id);
    this.select(id);
  }

  /** Make `id` (already carried) the one that comes out; a swing in progress is dropped. */
  select(id: MeleeId): void {
    if (!this.pack.includes(id)) return;
    if (this.carried === id) return;
    this.carried = id;
    resetSwing(this.swing);
    this.raise = 0;
    this.guardT = 0;
  }

  /** Bring it to hand or put it away. Nothing to bring out: stays away. */
  setOut(out: boolean): void {
    const next = out && this.carried !== null;
    if (next === this.out) return;
    this.out = next;
    resetSwing(this.swing);
    this.raise = 0;
    this.guardT = 0;
  }

  /** A new run: nothing carried, nothing in hand. */
  reset(): void {
    this.carried = null;
    this.pack.length = 0;
    this.out = false;
    this.hidden = false;
    this.swings = 0;
    this.hits = 0;
    this.raise = 0;
    this.guardT = 0;
    resetSwing(this.swing);
    this.rig.reset();
  }

  /** What is left of a blow from (srcX, srcZ) once the guard has had its say. */
  guarded(amount: number, srcX: number, srcZ: number): number {
    const p = this.host.player;
    const out = guardedDamage(amount, this.def, this.guarding, p.x, p.z, p.yaw, srcX, srcZ);
    if (out < amount) this.host.audio.play('impact_metal', { priority: 2, volume: 0.7 });
    return out;
  }

  /** The weapon readout while it is in hand. */
  hudInfo(): HudWeaponInfo | null {
    const d = this.def;
    if (!d) return null;
    return { id: 'pistol', name: d.name, short: d.short, tier: 0, tierLabel: '', mag: 0, magSize: 0, reserve: 0, reloading: false, reloadProgress: 0, auto: false, melee: true };
  }

  update(dt: number, input: MeleeInput): void {
    this.time += dt;
    const host = this.host;
    const p = host.player;
    const d = this.def;
    const k = Math.min(1, dt * 12);
    this.lookYaw += (input.mouseDX * 0.0022 * 60 - this.lookYaw) * k;
    this.lookPitch += (input.mouseDY * 0.0022 * 60 - this.lookPitch) * k;

    const active = this.out && !!d && host.alive();
    this.raise = Math.max(0, Math.min(1, this.raise + (active && !input.locked ? dt / 0.22 : -dt / 0.14)));
    if (active && d) {
      const ready = this.raise >= 0.85 && !input.locked;
      const wantGuard = ready && input.guard && d.guard > 0 && this.swing.phase === 'idle';
      this.guardT = Math.max(0, Math.min(1, this.guardT + (wantGuard ? dt / 0.12 : -dt / 0.1)));
      this.sprintT += ((p.sprinting && this.swing.phase === 'idle' ? 1 : 0) - this.sprintT) * Math.min(1, dt * 9);
      const auto = input.auto && this.swing.phase === 'idle' && this.guardT < 0.05 && this.inReach(d, d.reach * 0.92, d.arc);
      this.events.length = 0;
      stepSwing(this.swing, d, dt, { pressed: ready && (input.firePressed || auto), held: ready && input.fire }, this.events);
      for (const e of this.events) {
        if (e === 'start') host.audio.play('grenade_throw', { priority: 1, volume: 0.35 });
        else if (e === 'strike') this.strike(d);
      }
    } else if (this.swing.phase !== 'idle') {
      resetSwing(this.swing);
      this.guardT = 0;
    }
    this.pushView(dt, d);
  }

  /** Something an unhurried swing would reach is in front of the player. */
  private inReach(d: MeleeDef, reach: number, arc: number): boolean {
    const p = this.host.player;
    return swingReach(p.x, p.y, p.z, p.yaw, reach, arc, this.targets(reach), 1, this.reach, radiusOf).length > 0;
  }

  /** The infected near enough to matter (the manager keeps no public index, and there are never many this close). */
  private targets(reach: number): Zombie[] {
    const p = this.host.player;
    const out = this.near;
    out.length = 0;
    const far = reach + 1.2;
    for (const z of this.host.zombies.zombies) {
      if (!z.active || z.dormant) continue;
      const dx = z.x - p.x;
      const dz = z.z - p.z;
      if (dx * dx + dz * dz <= far * far) out.push(z);
    }
    return out;
  }

  /** The swing lands: everyone it reaches is struck. */
  private strike(d: MeleeDef): void {
    const host = this.host;
    const p = host.player;
    const s = this.swing;
    const heavy = s.heavy;
    const env = host.zombieEnv();
    const eye = p.eyeY();
    const hits = swingReach(p.x, p.y, p.z, p.yaw, d.reach, heavy ? d.heavyArc : d.arc, this.targets(d.reach), heavy ? d.heavyTargets : d.maxTargets, this.reach, radiusOf);
    // the one under the crosshair can be struck in the head
    const cy = Math.cos(p.pitch);
    this.dir.set(-Math.sin(p.yaw) * cy, Math.sin(p.pitch), -Math.cos(p.yaw) * cy);
    const aimed = host.zombies.raycast(p.x, eye, p.z, this.dir.x, this.dir.y, this.dir.z, d.reach + 0.6);
    this.swings++;
    const base = swingDamage(s, d);
    let any = false;
    let head = false;
    let kill = false;
    for (const h of hits) {
      const z = h.target;
      if (host.world.segmentBlocked(p.x, eye - 0.25, p.z, z.x, z.y + 1.1, z.z, 'shots')) continue;
      const isHead = aimed !== null && aimed.zombie === z && aimed.head;
      const parry = z.windingUp;
      const dmg = zombieHitDamage(base, z.def, isHead, d.headMul, 0, 1) * (parry ? MELEE_RULES.parryMul : 1);
      if (parry) z.stagger(MELEE_RULES.parryStagger, env);
      const yaw = Math.atan2(-(z.x - p.x), -(z.z - p.z));
      const k = heavy ? 1.5 : 1;
      const charging = z.charging; // (ZARYA round 3: before the blow can stop it)
      // (the last argument: a heavy kind of weapon, which is what breaks the crate ZARYA's loader carries in front of him)
      const killed = host.zombies.damage(z, dmg, isHead, env, yaw, d.push * k, d.lift * k, heavy ? d.heavyImpulse : d.impulse, d.type === 'heavy');
      // (a flail with a weight on it, the Kisten: what it does not kill trips)
      if (d.trip && !killed && z.active && !z.isBoss && !parry) host.zombies.affect(z, env, 0, d.trip * (heavy ? 1.4 : 1), 0);
      // (ZARYA round 3: the Rogatina's job) a wound-up thrust stops a charge, and the big ones, on its crossguard
      if (d.pin && !killed && z.active) {
        const sec = pinFor(d, heavy, { charging, big: z.isBoss || z.variant === 'morzh' }, this.time - (this.pinned.get(z) ?? -Infinity));
        if (sec > 0) {
          this.pinned.set(z, this.time);
          host.zombies.pin(z, env, sec);
          host.audio.play('impact_metal', { priority: 3, volume: 1 });
          host.hudEvent({ type: 'feed', text: charging ? 'PINNED ON THE CROSSGUARD' : 'PINNED', tone: 'good' });
        }
      }
      this.at.set(z.x, z.y + (isHead ? z.def.height * 0.9 : z.def.height * 0.62), z.z);
      this.dir.set(z.x - p.x, 0, z.z - p.z).normalize();
      host.fx.blood(this.at, this.dir, { amount: heavy ? 1.4 : 0.8, head: isHead, kill: killed });
      any = true;
      head ||= isHead;
      kill ||= killed;
      this.hits++;
    }
    if (any) {
      host.hudEvent({ type: 'hit', head, kill });
      host.audio.play(kill ? 'kill_confirm' : head ? 'hit_head' : 'hit_body', { priority: 2, volume: 0.8 });
      host.audio.play('impact_flesh', { priority: 2, volume: heavy ? 1 : 0.7 });
      p.kickPitch += (host.reducedMotion() ? 0.004 : 0.012) * (heavy ? 2 : 1);
      // a brawl is heard, though nothing like a gunshot
      host.noise(heavy ? 9 : 5);
    }
  }

  private pushView(dt: number, d: MeleeDef | null): void {
    const v = this.view;
    const p = this.host.player;
    if (this.hidden || !d || this.raise <= 0) {
      this.rig.root.visible = false;
      return;
    }
    v.id = d.id;
    v.raise = this.raise;
    v.phase = this.swing.phase;
    v.u = swingProgress(this.swing, d);
    v.heavy = this.swing.heavy || this.swing.phase === 'charge';
    v.combo = this.swing.combo;
    v.guard = this.guardT;
    v.time = this.time;
    v.move = p.moveAmount;
    v.bobPhase = p.bobPhase;
    v.sprint = Math.min(1, this.sprintT);
    v.lookYaw = this.lookYaw;
    v.lookPitch = this.lookPitch;
    v.reducedMotion = this.host.reducedMotion();
    this.rig.update(v, dt);
  }

  dispose(): void {
    this.host.renderer.viewScene.remove(this.rig.root);
    this.rig.dispose();
  }
}
