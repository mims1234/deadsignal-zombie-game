/**
 * Power-up drops in the browser (every map): rolls a drop on the player's kills, floats the glowing emblems, lets the
 * player walk through one to take it, carries out what it does (the rules are in `logic/powerups`) and shows the
 * banner, the announcer call and the HUD row of running timers.
 *
 * Solo only for now: in co-op the host owns drops and timers (`state` is plain data, ready for the snapshot) and the
 * later wiring calls `showDrop` / `take` from the host's reports.
 */
import * as THREE from 'three';
import type { SoundId } from '../audio/ids';
import type { Zombie, ZombieEnv } from '../enemies/zombie';
import { addCash } from '../logic/economy';
import { POWERUPS } from '../logic/powerupConfig';
import {
  type PowerupDrop,
  type PowerupKind,
  type PowerupState,
  applyPowerup,
  cashMultiplier,
  createPowerups,
  dropVisible,
  filterDamage,
  nukeTargets,
  refillAll,
  resetPowerups,
  rollDrop,
  takeDropAt,
  tickPowerups,
} from '../logic/powerups';
import { PowerupHud } from '../ui/powerupHud';
import { POWERUP_STYLE, glowCanvas, powerupIcon } from '../ui/powerupIcons';
import type { GameCtx } from './ctx';

const CALL: Record<PowerupKind, SoundId> = {
  maxAmmo: 'powerup_max_ammo',
  instaKill: 'powerup_insta_kill',
  doublePoints: 'powerup_double_points',
  nuke: 'powerup_nuke',
  carpenter: 'powerup_carpenter',
};

interface DropView {
  drop: PowerupDrop;
  group: THREE.Group;
  icon: THREE.Mesh;
  glow: THREE.Sprite;
}

export interface PowerupRuntimeOpts {
  /** The HUD element the timer row goes in. */
  hudRoot: HTMLElement;
  /** True while a co-op session runs (the host decides drops; nothing is rolled here). */
  remote: () => boolean;
  /** Barricades on this map: the Carpenter needs a damaged one, and repairs them all. */
  barricades: () => { readonly damaged: boolean; repairEverything(): number } | null;
  /** Who speaks on the radio on this map. */
  speaker: string;
  /** The infected's environment (the nuke's kills go through the normal damage path). */
  zombieEnv: () => ZombieEnv;
}

export class PowerupRuntime {
  readonly state: PowerupState = createPowerups();
  /** True while a nuke is killing: those kills pay nothing and drop nothing. */
  nuking = false;
  private readonly root = new THREE.Group();
  private readonly views: DropView[] = [];
  private readonly iconMats = new Map<PowerupKind, THREE.MeshBasicMaterial>();
  private readonly glowMats = new Map<PowerupKind, THREE.SpriteMaterial>();
  private readonly iconGeo = new THREE.PlaneGeometry(0.62, 0.62);
  private glowTex: THREE.CanvasTexture | null = null;
  private readonly hud: PowerupHud;
  private nukeQueue: Zombie[] = [];
  private nukeT = 0;
  private toldDrop = false;

  constructor(
    private readonly ctx: GameCtx,
    private readonly opts: PowerupRuntimeOpts,
  ) {
    this.root.name = 'Powerups';
    ctx.worldRoot.add(this.root);
    this.hud = new PowerupHud(opts.hudRoot);
  }

  /** Cash multiplier for everything the player earns. */
  get cashMul(): number {
    return cashMultiplier(this.state);
  }

  /** The damage a hit on `z` really does (insta-kill). */
  filterDamage(z: Zombie, amount: number): number {
    return filterDamage(this.state, amount, z);
  }

  reset(): void {
    resetPowerups(this.state);
    for (const v of this.views) v.group.removeFromParent();
    this.views.length = 0;
    this.nukeQueue.length = 0;
    this.nuking = false;
    this.toldDrop = false;
    this.hud.update(this.state.timers);
  }

  /** The player killed `z`: maybe it drops a power-up. */
  onKill(z: Zombie): void {
    if (this.opts.remote() || this.nuking) return;
    const b = this.opts.barricades();
    const drop = rollDrop(this.state, this.ctx.rng, z.x, z.z, { eligible: !z.isBoss && !z.curable, carpenter: b?.damaged ?? false });
    if (drop) this.showDrop(drop);
  }

  /** Put a drop of `kind` at (x, z) (dev hook; a drop a co-op host reports). */
  placeDrop(kind: PowerupKind, x: number, z: number): PowerupDrop {
    const drop: PowerupDrop = { id: this.state.nextId++, kind, x, z, age: 0 };
    this.state.drops.push(drop);
    this.showDrop(drop);
    return drop;
  }

  /** Float a drop in the world (also for drops a co-op host reports). */
  showDrop(drop: PowerupDrop): void {
    const kind = drop.kind;
    const group = new THREE.Group();
    group.position.set(drop.x, 1, drop.z);
    const icon = new THREE.Mesh(this.iconGeo, this.iconMat(kind));
    icon.renderOrder = 3;
    const glow = new THREE.Sprite(this.glowMat(kind));
    glow.scale.set(1.5, 1.5, 1);
    glow.renderOrder = 2;
    group.add(glow, icon);
    this.root.add(group);
    this.views.push({ drop, group, icon, glow });
    this.ctx.audio.play('powerup_spawn', { pos: { x: drop.x, y: 1, z: drop.z }, priority: 2 });
    this.ctx.fx.sparkle({ x: drop.x, y: 1, z: drop.z }, POWERUP_STYLE[kind].hex, 14);
    if (!this.toldDrop) {
      this.toldDrop = true;
      this.ctx.radio(this.opts.speaker, 'Something glowing where that one fell - whatever this place was cooking, it is on our side for once. Walk through it.', 6);
    }
  }

  update(dt: number, time: number): void {
    const s = this.state;
    const { expired, ended } = tickPowerups(s, dt);
    for (const d of expired) this.removeView(d.id);
    for (const k of ended) {
      this.ctx.audio.play('powerup_end', { priority: 2 });
      this.ctx.feed(`${POWERUP_STYLE[k].name} WORE OFF`, 'warn');
    }
    // take one by walking through it
    if (this.ctx.playerAlive() && !this.opts.remote()) {
      const got = takeDropAt(s, this.ctx.player.x, this.ctx.player.z);
      if (got) {
        this.removeView(got.id);
        this.take(got.kind, got.x, got.z);
      }
    }
    // spin, bob, pulse, blink out at the end
    for (const v of this.views) {
      v.group.visible = dropVisible(v.drop, time);
      v.icon.rotation.y += dt * 2.2;
      v.group.position.y = 1 + Math.sin(time * 2.6 + v.drop.id) * 0.1;
      const p = 1.35 + Math.sin(time * 5 + v.drop.id) * 0.18;
      v.glow.scale.set(p, p, 1);
    }
    // the nuke takes its victims over a short beat, not all in one frame
    if (this.nukeQueue.length > 0) {
      this.nukeT += dt;
      const per = Math.max(1, Math.ceil(this.nukeQueue.length * Math.min(1, this.nukeT / 0.7)));
      this.nuking = true;
      for (let i = 0; i < per && this.nukeQueue.length > 0; i++) {
        const z = this.nukeQueue.shift()!;
        if (!z.active) continue;
        // thrown away from the player (the yaw of travel), a nudge and a hop
        const away = Math.atan2(-(z.x - this.ctx.player.x), -(z.z - this.ctx.player.z));
        this.ctx.zombies.damage(z, z.hp + 1e6, false, this.opts.zombieEnv(), away, 2.5, 2);
        this.ctx.fx.blood({ x: z.x, y: 1.3, z: z.z }, { x: 0, y: 1, z: 0 }, { amount: 0.6, kill: true });
      }
      this.nuking = false;
    }
    this.hud.update(s.timers);
  }

  /** The player took a power-up of `kind` at (x, z): do what it does. */
  take(kind: PowerupKind, x: number, z: number): void {
    const ctx = this.ctx;
    const e = applyPowerup(this.state, kind);
    const st = POWERUP_STYLE[kind];
    ctx.audio.play(CALL[kind], { priority: 3 });
    ctx.fx.sparkle({ x, y: 1, z }, st.hex, 24);
    ctx.banner(st.name, st.line, kind === 'instaKill' || kind === 'nuke' ? 'danger' : kind === 'doublePoints' ? 'warn' : 'good', 2.6);
    const inv = ctx.session.inv;
    if (e.refillAmmo) refillAll(inv);
    if (e.repairAll) this.opts.barricades()?.repairEverything();
    if (e.killAll) {
      ctx.hudEvent({ type: 'flash', color: '#fff2d0', strength: 0.75 });
      ctx.shake(0.6);
      const list = ctx.zombies.zombies;
      this.nukeQueue = nukeTargets(list).map((i) => list[i]!);
      this.nukeT = 0;
    }
    if (e.cash > 0) {
      const cash = Math.round(e.cash * this.cashMul);
      addCash(inv, cash);
      ctx.hudEvent({ type: 'cash', amount: cash });
    }
  }

  dispose(): void {
    this.reset();
    this.root.removeFromParent();
    this.hud.dispose();
  }

  // ---------------------------------------------------------------------------------------------

  private removeView(id: number): void {
    const i = this.views.findIndex((v) => v.drop.id === id);
    if (i < 0) return;
    this.views[i]!.group.removeFromParent();
    this.views.splice(i, 1);
  }

  private iconMat(kind: PowerupKind): THREE.MeshBasicMaterial {
    let m = this.iconMats.get(kind);
    if (!m) {
      const tex = new THREE.CanvasTexture(powerupIcon(kind));
      tex.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
      this.iconMats.set(kind, m);
    }
    return m;
  }

  private glowMat(kind: PowerupKind): THREE.SpriteMaterial {
    let m = this.glowMats.get(kind);
    if (!m) {
      this.glowTex ??= new THREE.CanvasTexture(glowCanvas());
      m = new THREE.SpriteMaterial({ map: this.glowTex, color: POWERUP_STYLE[kind].hex, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      this.glowMats.set(kind, m);
    }
    return m;
  }
}

/** Seconds a drop has left (for a co-op report or a debug readout). */
export function dropTimeLeft(d: PowerupDrop): number {
  return Math.max(0, POWERUPS.lifetime - d.age);
}
