/**
 * Weapon controller: owns weapon STATE (cooldowns, ADS blend, reload / switch / utility timelines, spread, recoil) and
 * drives the viewmodels from it. Ammunition rules live in `logic/ammo.ts`; damage math in `logic/damage.ts`.
 * Hit detection: each pellet is a ray resolved against the nearest of {world geometry, zombie head sphere, zombie body}.
 */
import * as THREE from 'three';
import type { AudioEngineApi, SoundId } from '../audio/ids';
import { GRENADE, PLAYER, RAGDOLL, RAIJIN, WEAPONS, type WeaponDef } from '../config';
import type { ZombieEnv } from '../enemies/zombie';
import type { ZombieManager } from '../enemies/zombieManager';
import type { FxApi } from '../fx/fxTypes';
import { canFire, cancelReload, consumeRound, reloadProgress, requestShellStop, startReload, updateReload } from '../logic/ammo';
import { applyPlate, canApplyPlate, type Vitals, zombieHitDamage } from '../logic/damage';
import { activeWeapon, type CarriedWeapon, type Inventory } from '../logic/economy';
import { falloffMul, getWeaponStats, type WeaponStats } from '../logic/weaponStats';
import type { Player } from '../player/player';
import type { GameRenderer } from '../render/renderer';
import type { HudEvent, HudWeaponInfo } from '../ui/hudTypes';
import type { CollisionWorld } from '../world/collision';
import { makeRayHit } from '../world/collision';
import type { WeaponId } from '../types';
import type { ReloadPhase, ViewmodelPose, ViewmodelRig, ViewmodelSet } from './viewmodelTypes';

export interface WeaponHost {
  renderer: GameRenderer;
  world: CollisionWorld;
  zombies: ZombieManager;
  zombieEnv(): ZombieEnv;
  audio: AudioEngineApi;
  fx: FxApi;
  player: Player;
  inv: Inventory;
  vitals: Vitals;
  reducedMotion(): boolean;
  hudEvent(e: HudEvent): void;
  /** Player fired / made noise: wake nearby zombies. */
  noise(radius: number): void;
  /** Throw a grenade from `origin` along `dir` (adds the player's velocity). */
  throwGrenade(origin: THREE.Vector3, dir: THREE.Vector3): void;
  /** Launch an HX-7 rocket from `origin` along `dir`; `damage` is the blast's centre damage. */
  fireRocket(origin: THREE.Vector3, dir: THREE.Vector3, damage: number): void;
  /** A shot resolved (for accuracy stats). */
  recordShot(hitZombie: boolean): void;
  onPlateApplied(armorAdded: number): void;
  alive(): boolean;
}

export interface WeaponInput {
  fire: boolean;
  firePressed: boolean;
  ads: boolean;
  reloadPressed: boolean;
  slot: 0 | 1 | null;
  wheel: number;
  grenadePressed: boolean;
  platePressed: boolean;
  /** Menus / station panels / cinematics: no weapon input. */
  locked: boolean;
  mouseDX: number;
  mouseDY: number;
}

type Utility = { kind: 'grenade' | 'plate'; t: number; duration: number; released: boolean };

const smooth = (x: number): number => x * x * (3 - 2 * x);
const DEG = Math.PI / 180;

export class WeaponSystem {
  private cooldown = 0;
  private adsT = 0;
  private raise = 0;
  private sprintT = 0;
  private bloom = 0;
  private fireBuffer = 0;
  private switching: { to: 0 | 1; phase: 'lower' | 'raise' } | null = null;
  private utility: Utility | null = null;
  private grenadeCd = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private dryReloadTimer = -1;
  private reloadSfx: { at: number; id: SoundId }[] = [];
  private lastShellPhase = '';
  private lastNoise = 0;
  private shotIndex = 0;
  private flashTimer = 0;
  private visualTier = -1;
  private visualWeapon: WeaponId | null = null;
  private readonly rayHit = makeRayHit();
  private readonly camPos = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly muzzleW = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly pose: ViewmodelPose = {
    time: 0, ads: 0, sprint: 0, move: 0, bobPhase: 0, crouch: 0, air: 0, landing: 0, lookYaw: 0, lookPitch: 0, raise: 0,
    reloadPhase: 'none', reloadT: 0, reloadEmpty: false, cycle: 1, ammo: 0, magSize: 0, action: 0, reducedMotion: false,
  };
  private time = 0;
  /** Hide every viewmodel (cinematics). */
  hidden = false;

  constructor(
    private readonly host: WeaponHost,
    private readonly rigs: ViewmodelSet,
  ) {
    for (const r of this.allRigs()) host.renderer.viewScene.add(r.root);
    this.hideAll();
  }

  // ---------------------------------------------------------------------------------------------
  // accessors
  // ---------------------------------------------------------------------------------------------

  get carried(): CarriedWeapon | null {
    return activeWeapon(this.host.inv);
  }

  get def(): WeaponDef | null {
    const c = this.carried;
    return c ? WEAPONS[c.id] : null;
  }

  get stats(): WeaponStats | null {
    const c = this.carried;
    if (!c) return null;
    const s = getWeaponStats(WEAPONS[c.id], c.tier);
    // perks (the Asylum's QUICKHAND and RAPID FIRE)
    if (this.perkReloadMul !== 1) {
      const k = this.perkReloadMul;
      s.reloadTactical *= k;
      s.reloadEmpty *= k;
      s.shellStart *= k;
      s.shellEach *= k;
      s.shellEnd *= k;
      s.shellPump *= k;
    }
    s.fireInterval *= this.perkFireIntervalMul;
    return s;
  }

  /** Perk multipliers on reload durations and on the time between shots (1 = none). */
  perkReloadMul = 1;
  perkFireIntervalMul = 1;

  private rigFor(id: WeaponId): ViewmodelRig {
    return this.rigs[id] ?? (id === 'raijin' ? this.rigs.rpg : this.rigs.rifle);
  }

  private allRigs(): ViewmodelRig[] {
    const r = this.rigs;
    return [r.rifle, r.pistol, r.shotgun, r.rpg, r.grenade, r.plate, ...(r.hanafubuki ? [r.hanafubuki] : []), ...(r.raijin ? [r.raijin] : [])];
  }

  get adsAmount(): number {
    return smooth(this.adsT);
  }

  get isReloading(): boolean {
    return !!this.carried?.ammo.reload;
  }

  get busy(): boolean {
    return this.utility !== null || this.switching !== null;
  }

  get applyingPlate(): boolean {
    return this.utility?.kind === 'plate';
  }

  get plateProgress(): number {
    return this.utility?.kind === 'plate' ? this.utility.t / this.utility.duration : -1;
  }

  /** Movement blockers: cannot sprint while firing, aiming or applying a plate. */
  get blocksSprint(): boolean {
    return this.adsT > 0.05 || this.utility?.kind === 'plate' || this.fireBuffer > 0.02;
  }

  /** Current crosshair spread in degrees. */
  currentSpread(): number {
    const d = this.def;
    const s = this.stats;
    if (!d || !s) return 0;
    return this.computeSpread(d, s);
  }

  private computeSpread(d: WeaponDef, s: WeaponStats): number {
    const p = this.host.player;
    const ads = this.adsAmount;
    const base = s.spreadHip + (s.spreadAds - s.spreadHip) * ads;
    const mv = s.spreadMove * p.moveAmount * (p.crouching ? 0.45 : 1) * (1 - 0.5 * ads);
    const air = p.onGround ? 0 : s.spreadAir;
    void d;
    return base + mv + air + this.bloom;
  }

  hudInfo(slot: 0 | 1): HudWeaponInfo | null {
    const c = this.host.inv.slots[slot];
    if (!c) return null;
    const d = WEAPONS[c.id];
    return {
      id: c.id,
      name: d.name,
      short: d.short,
      tier: c.tier,
      tierLabel: c.tier > 0 ? d.tiers[c.tier - 1]!.label : '',
      mag: c.ammo.mag,
      magSize: c.ammo.magSize,
      reserve: c.ammo.reserve,
      reloading: !!c.ammo.reload,
      reloadProgress: reloadProgress(c.ammo),
      auto: d.auto,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------------------------

  /** Reset transient state (restart / respawn). Ammunition state is owned by the inventory. */
  reset(): void {
    this.cooldown = 0;
    this.adsT = 0;
    this.raise = 0;
    this.sprintT = 0;
    this.bloom = 0;
    this.fireBuffer = 0;
    this.switching = null;
    this.utility = null;
    this.grenadeCd = 0;
    this.dryReloadTimer = -1;
    this.reloadSfx.length = 0;
    this.lastShellPhase = '';
    this.host.player.kickPitch = 0;
    this.host.player.kickYaw = 0;
    this.visualTier = -1;
    this.visualWeapon = null;
    this.hidden = false;
    for (const r of this.allRigs()) r.reset();
    this.hideAll();
    this.host.renderer.zoom = 1;
    this.host.renderer.viewFlash.intensity = 0;
    this.host.renderer.flashLight.intensity = 0;
  }

  private hideAll(): void {
    for (const r of this.allRigs()) r.root.visible = false;
  }

  /** Cancel anything in progress (pause safety, death, cinematics). Never touches ammunition counts. */
  cancelActions(): void {
    const c = this.carried;
    if (c) cancelReload(c.ammo);
    this.utility = null;
    this.switching = null;
    this.reloadSfx.length = 0;
    this.fireBuffer = 0;
    this.dryReloadTimer = -1;
  }

  // ---------------------------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------------------------

  update(dt: number, input: WeaponInput): void {
    this.time += dt;
    const host = this.host;
    const p = host.player;
    const alive = host.alive();
    const carried = this.carried;
    const s = this.stats;
    const d = this.def;

    // ---- camera look (with ADS sensitivity handled by the caller) ----
    const lookScale = Math.min(1, dt * 12);
    this.lookYaw += (input.mouseDX * 0.0022 * 60 - this.lookYaw) * lookScale;
    this.lookPitch += (input.mouseDY * 0.0022 * 60 - this.lookPitch) * lookScale;

    if (!alive) {
      this.cancelActions();
      this.raise = Math.max(0, this.raise - dt * 4);
      this.pushPose(dt, carried, d);
      return;
    }

    // ---- switching ----
    if (!input.locked && !this.utility) {
      let want: 0 | 1 | null = input.slot;
      if (input.wheel !== 0) want = host.inv.activeSlot === 0 ? 1 : 0;
      if (want !== null && want !== host.inv.activeSlot && host.inv.slots[want] && !this.switching) {
        this.beginSwitch(want);
      }
    }
    if (this.switching) this.updateSwitch(dt);
    else this.raise = Math.min(1, this.raise + dt / Math.max(0.15, d?.drawTime ?? 0.4));

    // ---- utility actions ----
    if (!input.locked && !this.switching) {
      if (input.grenadePressed && !this.utility && this.grenadeCd <= 0 && host.inv.grenades > 0) this.startUtility('grenade', GRENADE.throwDelay / 0.5);
      else if (input.platePressed && !this.utility && canApplyPlate(host.vitals, host.inv.plates)) this.startUtility('plate', PLAYER.plateApplyTime);
    }
    if (this.utility) this.updateUtility(dt);
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);

    // ---- weapon logic ----
    if (carried && s && d) {
      const ammo = carried.ammo;
      this.cooldown = Math.max(0, this.cooldown - dt);
      // reload progression (frozen while paused because update() is not called)
      if (ammo.reload) {
        const before = ammo.reload.kind === 'shell' ? ammo.reload.phase : '';
        updateReload(ammo, dt, s);
        this.playReloadSfx(carried, before);
      } else {
        this.reloadSfx.length = 0;
        this.lastShellPhase = '';
      }

      // sprint blend & ADS blend
      const sprintingNow = p.sprinting && !this.utility;
      this.sprintT += ((sprintingNow ? 1 : 0) - this.sprintT) * Math.min(1, dt * 9);
      const adsWanted = input.ads && !input.locked && !p.sprinting && !this.utility && !this.switching && !(ammo.reload && ammo.reload.kind === 'mag');
      const rate = 1 / Math.max(0.08, d.adsTime);
      this.adsT = Math.max(0, Math.min(1, this.adsT + (adsWanted ? 1 : -1) * dt * rate));

      // trigger handling (semi-auto buffers a click for a moment so quick taps are not lost)
      if (!input.locked && input.firePressed) this.fireBuffer = 0.14;
      else this.fireBuffer = Math.max(0, this.fireBuffer - dt);
      const wantsFire = !input.locked && (d.auto ? input.fire : this.fireBuffer > 0);
      const ready = this.raise >= 0.85 && !this.switching && !this.utility && this.sprintT < 0.35;
      if (wantsFire && ready && this.cooldown <= 0) {
        this.tryFire(carried, d, s, input);
      }

      // manual reload / auto reload
      if (!input.locked && input.reloadPressed && ready) {
        if (ammo.reload && ammo.reload.kind === 'shell') requestShellStop(ammo);
        else this.beginReload(carried, s, d);
      }
      if (this.dryReloadTimer >= 0) {
        this.dryReloadTimer -= dt;
        if (this.dryReloadTimer < 0) this.beginReload(carried, s, d);
      }

      // recoil / bloom recovery
      this.bloom = Math.max(0, this.bloom - s.spreadPerShot * 0 - d.spreadRecover * dt);
      const decay = Math.exp(-d.recoilRecover * dt);
      p.kickPitch *= decay;
      p.kickYaw *= decay;
    }

    // ---- muzzle flash lights ----
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    const fl = this.flashTimer > 0 ? this.flashTimer / 0.06 : 0;
    host.renderer.viewFlash.intensity = fl * 1.6;
    host.renderer.flashLight.intensity = fl * 40;

    // camera zoom from ADS
    const zoom = d ? 1 + (d.adsFovMul - 1) * this.adsAmount : 1;
    host.renderer.zoom = zoom;

    this.pushPose(dt, carried, d);
  }

  // ---------------------------------------------------------------------------------------------
  // switching
  // ---------------------------------------------------------------------------------------------

  private beginSwitch(to: 0 | 1): void {
    const c = this.carried;
    if (c) cancelReload(c.ammo); // switching cancels a reload; nothing is transferred, nothing duplicated
    this.reloadSfx.length = 0;
    this.dryReloadTimer = -1;
    this.switching = { to, phase: 'lower' };
    this.adsT = 0;
    this.fireBuffer = 0;
  }

  private updateSwitch(dt: number): void {
    const sw = this.switching!;
    if (sw.phase === 'lower') {
      this.raise = Math.max(0, this.raise - dt / 0.16);
      if (this.raise <= 0) {
        this.host.inv.activeSlot = sw.to;
        sw.phase = 'raise';
        this.host.audio.play('weapon_draw', { priority: 1 });
        this.cooldown = Math.max(this.cooldown, 0.12);
      }
    } else {
      const d = this.def;
      this.raise = Math.min(1, this.raise + dt / Math.max(0.15, d?.drawTime ?? 0.4));
      if (this.raise >= 1) this.switching = null;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // reload
  // ---------------------------------------------------------------------------------------------

  private beginReload(c: CarriedWeapon, s: WeaponStats, d: WeaponDef): void {
    this.dryReloadTimer = -1;
    const wasEmpty = c.ammo.mag === 0;
    if (!startReload(c.ammo, d.reloadStyle, s, d.reloadTransferAt)) return;
    this.reloadSfx.length = 0;
    if (d.reloadStyle === 'magazine') {
      const dur = wasEmpty ? s.reloadEmpty : s.reloadTactical;
      const pre = c.id === 'rifle' ? 'rifle' : 'pistol';
      this.reloadSfx.push({ at: dur * 0.12, id: `${pre}_mag_out` as SoundId });
      this.reloadSfx.push({ at: dur * d.reloadTransferAt - 0.08, id: `${pre}_mag_in` as SoundId });
      if (wasEmpty) this.reloadSfx.push({ at: dur * 0.9, id: (c.id === 'rifle' ? 'rifle_bolt' : 'pistol_slide') as SoundId });
    }
  }

  private playReloadSfx(c: CarriedWeapon, beforePhase: string): void {
    const r = c.ammo.reload;
    if (r && r.kind === 'mag') {
      for (let i = this.reloadSfx.length - 1; i >= 0; i--) {
        if (r.t >= this.reloadSfx[i]!.at) {
          this.host.audio.play(this.reloadSfx[i]!.id, { priority: 2 });
          this.reloadSfx.splice(i, 1);
        }
      }
    } else if (r && r.kind === 'shell') {
      // one shell sound at each load transfer and a pump sound when chambering
      if (r.phase === 'load' && r.t >= r.duration * 0.55 && this.lastShellPhase !== `load${Math.floor(c.ammo.mag)}`) {
        this.lastShellPhase = `load${Math.floor(c.ammo.mag)}`;
        this.host.audio.play('shotgun_shell_in', { priority: 2 });
      }
      if (r.phase === 'pump' && beforePhase !== 'pump' && this.lastShellPhase !== 'pump') {
        this.lastShellPhase = 'pump';
        this.host.audio.play('shotgun_pump', { priority: 2 });
      }
      if (r.phase !== 'pump' && this.lastShellPhase === 'pump') this.lastShellPhase = '';
    }
  }

  // ---------------------------------------------------------------------------------------------
  // firing
  // ---------------------------------------------------------------------------------------------

  private tryFire(c: CarriedWeapon, d: WeaponDef, s: WeaponStats, input: WeaponInput): void {
    const host = this.host;
    const ammo = c.ammo;
    if (!canFire(ammo, d.reloadStyle)) {
      // dry click, then auto-reload if there is reserve
      if (ammo.mag <= 0 && !ammo.reload) {
        host.audio.play('dry_fire', { priority: 2 });
        this.cooldown = 0.25;
        this.fireBuffer = 0;
        if (ammo.reserve > 0) this.dryReloadTimer = 0.18;
      }
      return;
    }
    if (!consumeRound(ammo)) return;
    this.fireBuffer = 0;
    this.cooldown = s.fireInterval;
    this.shotIndex++;
    const p = host.player;
    void input;

    // ---- aim basis with camera kick ----
    const spreadDeg = this.computeSpread(d, s);
    const yaw = p.yaw + p.kickYaw;
    const pitch = p.pitch + p.kickPitch;
    const cy = Math.cos(pitch);
    this.fwd.set(-Math.sin(yaw) * cy, Math.sin(pitch), -Math.cos(yaw) * cy);
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.up.crossVectors(this.right, this.fwd).normalize();
    this.camPos.set(p.x, p.eyeY(), p.z);

    // ---- muzzle position (visual) ----
    const rig = this.rigFor(c.id);
    this.muzzleWorld(rig.muzzle, this.muzzleW);

    // ---- rocket ----
    if (c.id === 'rpg') {
      const r = Math.sqrt(Math.random()) * spreadDeg * DEG;
      const a = Math.random() * Math.PI * 2;
      this.dir.copy(this.fwd).addScaledVector(this.right, Math.tan(r) * Math.cos(a)).addScaledVector(this.up, Math.tan(r) * Math.sin(a)).normalize();
      // leaves the tube just right of and below the eye, flying where the sight points
      this.tmp.copy(this.camPos).addScaledVector(this.fwd, 0.7).addScaledVector(this.right, 0.12).addScaledVector(this.up, -0.08);
      host.fireRocket(this.tmp, this.dir, s.damage);
      host.recordShot(false);
    }
    // ---- Raijin's Drum: a shockwave, and a bolt that leaps from one infected to the next ----
    let thunder: { hit: boolean; kill: boolean } | null = null;
    if (c.id === 'raijin') thunder = this.thunder(s, c.tier, host.zombieEnv());

    // ---- pellets ----
    const zenv = host.zombieEnv();
    let anyHit = false;
    let anyKill = false;
    let anyHead = false;
    let impactSounds = 0;
    if (thunder) {
      anyHit = thunder.hit;
      anyKill = thunder.kill;
    }
    for (let i = 0; c.id !== 'rpg' && c.id !== 'raijin' && i < s.pellets; i++) {
      const r = Math.sqrt(Math.random()) * spreadDeg * DEG;
      const a = Math.random() * Math.PI * 2;
      this.dir.copy(this.fwd).addScaledVector(this.right, Math.tan(r) * Math.cos(a)).addScaledVector(this.up, Math.tan(r) * Math.sin(a)).normalize();
      const res = this.resolveRay(this.dir, d, s, zenv);
      if (res.hitZombie) anyHit = true;
      if (res.head) anyHead = true;
      if (res.kill) anyKill = true;
      // tracers: every shot for the pistol/shotgun (a few pellets), every second round for the rifle
      const wantTracer = c.id === 'rifle' || c.id === 'hanafubuki' ? this.shotIndex % 2 === 0 : c.id === 'pistol' ? true : i < 3;
      if (wantTracer) {
        this.tmp2.set(res.x, res.y, res.z);
        host.fx.tracer(this.muzzleW, this.tmp2, d.tracerColors[c.tier]!);
      }
      if (res.surface && impactSounds < (s.pellets > 1 ? 2 : 1)) {
        impactSounds++;
        const snd = ({ concrete: 'impact_concrete', metal: 'impact_metal', wood: 'impact_wood', dirt: 'impact_dirt', glass: 'impact_metal', fabric: 'impact_dirt', flesh: 'impact_flesh' } as const)[res.surface];
        host.audio.play(snd, { pos: { x: res.x, y: res.y, z: res.z }, volume: 0.7, priority: 0, rate: 0.9 + Math.random() * 0.2 });
        if (res.surface === 'metal' && Math.random() < 0.25) host.audio.play('ricochet', { pos: { x: res.x, y: res.y, z: res.z }, volume: 0.6, priority: 0 });
      }
    }
    if (c.id !== 'rpg') host.recordShot(anyHit);
    if (anyHit) host.hudEvent({ type: 'hit', head: anyHead, kill: anyKill });
    if (anyHit) host.audio.play(anyKill ? 'kill_confirm' : anyHead ? 'hit_head' : 'hit_body', { priority: 2, volume: anyKill ? 0.8 : 0.6 });

    // ---- feedback: sound, recoil, flash, viewmodel, particles ----
    const soundId = c.id === 'hanafubuki' ? 'petal_shot' : c.id === 'raijin' ? 'thunder_shot' : (`${c.id}_shot${c.tier > 0 ? '_up' : ''}` as SoundId);
    host.audio.play(soundId, { priority: 3, rate: 0.97 + Math.random() * 0.06 });
    const adsMul = 1 - 0.3 * this.adsAmount;
    const rm = host.reducedMotion() ? 0.6 : 1;
    const kp = s.recoilPitch * DEG * adsMul * (0.85 + Math.random() * 0.3);
    const ky = s.recoilYaw * DEG * adsMul * (Math.random() * 2 - 1);
    p.kickPitch += kp;
    p.kickYaw += ky;
    // a share of the kick becomes permanent: the player has to pull the crosshair back down
    p.pitch = Math.min(Math.PI / 2 - 0.02, p.pitch + kp * 0.35);
    p.yaw += ky * 0.25;
    void rm;
    this.bloom = Math.min(s.spreadMax, this.bloom + s.spreadPerShot);
    this.flashTimer = 0.06;
    host.renderer.viewFlash.color.setHex(d.tracerColors[c.tier]!);
    host.renderer.flashLight.color.setHex(c.tier === 2 ? 0x9ff0ff : 0xffc27a);
    host.renderer.flashLight.position.copy(this.camPos).addScaledVector(this.fwd, 1.2);
    rig.onFire(c.tier, c.id === 'rpg' ? 1.5 : c.id === 'shotgun' ? 1.3 : c.id === 'pistol' ? 1.0 : 0.85);
    host.fx.muzzleSmoke(this.muzzleW, this.fwd, c.id === 'shotgun' || c.id === 'rpg');
    // the petal stream sheds blossom at the muzzle
    if (c.id === 'hanafubuki' && this.shotIndex % 3 === 0) host.fx.sparkle(this.muzzleW, d.tracerColors[c.tier]!, 3);
    if (c.id === 'rifle' || c.id === 'pistol') this.ejectCasing(rig, c.id);
    // noise wakes nearby infected (throttled)
    if (this.time - this.lastNoise > 0.2) {
      this.lastNoise = this.time;
      host.noise(d.noise);
    }
    // finishing a magazine kicks off the reload automatically after a beat
    if (ammo.mag === 0 && ammo.reserve > 0) this.dryReloadTimer = 0.45;
  }

  private ejectCasing(rig: ViewmodelRig, id: WeaponId): void {
    this.muzzleWorld(rig.ejectPort, this.tmp);
    const v = this.tmp2.copy(this.right).multiplyScalar(2.2 + Math.random() * 0.8).addScaledVector(this.up, 1.6 + Math.random() * 0.6).addScaledVector(this.fwd, -0.4 + Math.random() * 0.4);
    this.host.fx.casing(this.tmp, v, id);
  }

  /** World position matching where an object in the viewmodel scene appears on screen (parallax-correct enough for effects). */
  private muzzleWorld(obj: THREE.Object3D, out: THREE.Vector3): void {
    const r = this.host.renderer;
    obj.updateWorldMatrix(true, false);
    this.tmp.setFromMatrixPosition(obj.matrixWorld);
    this.tmp.project(r.viewCamera);
    out.set(this.tmp.x, this.tmp.y, 0.5).unproject(r.camera);
    // pull the point to ~0.9 m in front of the camera along that ray
    r.camera.getWorldPosition(this.tmp);
    out.sub(this.tmp).normalize().multiplyScalar(0.9).add(this.tmp);
  }

  /**
   * Raijin's Drum: everything in a cone in front is thrown back by the shockwave, and the bolt strikes the first
   * infected along the sight and leaps on to the nearest one not yet struck, again and again, keeping most of its force.
   */
  private thunder(s: WeaponStats, tier: number, zenv: ZombieEnv): { hit: boolean; kill: boolean } {
    const host = this.host;
    const zs = host.zombies;
    const o = this.camPos;
    const R = RAIJIN;
    const color = WEAPONS.raijin.tracerColors[tier] ?? 0x9fd8ff;
    let hit = false;
    let kill = false;
    const fl = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    // the shockwave
    for (const z of zs.zombies) {
      if (!z.alive || !z.active || Math.abs(z.y - host.player.y) > 3) continue;
      const dx = z.x - o.x;
      const dz = z.z - o.z;
      const dist = Math.hypot(dx, dz);
      if (dist > R.waveRange || dist < 0.01) continue;
      if (Math.acos(Math.max(-1, Math.min(1, (dx * this.fwd.x + dz * this.fwd.z) / (dist * fl)))) > R.waveCone) continue;
      const k = 1 - (dist / R.waveRange) * 0.5;
      if (zs.damage(z, s.damage * R.waveShare * k, false, zenv, Math.atan2(-dx, -dz) + Math.PI, R.wavePush * k, R.waveLift * k)) kill = true;
      hit = true;
    }
    // the bolt: the first infected along the sight (walls stop it), then leap after leap
    const wall = host.world.raycast(o.x, o.y, o.z, this.fwd.x, this.fwd.y, this.fwd.z, WEAPONS.raijin.maxRange, 'shots', this.rayHit);
    const first = zs.raycast(o.x, o.y, o.z, this.fwd.x, this.fwd.y, this.fwd.z, wall ? wall.t : WEAPONS.raijin.maxRange);
    const from = { x: this.muzzleW.x, y: this.muzzleW.y, z: this.muzzleW.z };
    if (!first) {
      const end = wall ? { x: wall.x, y: wall.y, z: wall.z } : { x: o.x + this.fwd.x * 40, y: o.y + this.fwd.y * 40, z: o.z + this.fwd.z * 40 };
      this.bolt(from, end, color);
      return { hit, kill };
    }
    const struck = new Set<object>();
    type Strike = { zombie: (typeof zs.zombies)[number]; x: number; y: number; z: number };
    let target: Strike | null = { zombie: first.zombie, x: first.x, y: first.y, z: first.z };
    let dmg = s.damage;
    const jumps = R.jumps[tier] ?? R.jumps[0]!;
    const reach = R.jumpRange[tier] ?? R.jumpRange[0]!;
    for (let j = 0; target && j <= jumps; j++) {
      const z = target.zombie;
      struck.add(z);
      this.bolt(from, target, color);
      const yaw = Math.atan2(-(target.x - from.x), -(target.z - from.z));
      if (zs.damage(z, dmg, false, zenv, yaw, 2.5, 1.5)) kill = true;
      hit = true;
      host.fx.sparkle({ x: target.x, y: target.y, z: target.z }, color, 8);
      from.x = target.x;
      from.y = target.y;
      from.z = target.z;
      dmg *= R.jumpKeep;
      // the nearest infected not yet struck, within a leap
      let best: Strike | null = null;
      let bd = reach;
      for (const q of zs.zombies) {
        if (struck.has(q) || !q.alive || !q.active) continue;
        const d = Math.hypot(q.x - from.x, q.z - from.z);
        if (d < bd && Math.abs(q.y - z.y) < 3) {
          bd = d;
          best = { zombie: q, x: q.x, y: q.y + 1.1, z: q.z };
        }
      }
      target = best;
    }
    return { hit, kill };
  }

  /** A jagged bolt between two points (a few kinked tracers). */
  private bolt(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, color: number): void {
    const n = 4;
    let px = a.x;
    let py = a.y;
    let pz = a.z;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const j = i === n ? 0 : 0.35;
      const x = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j;
      const y = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j;
      const z = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j;
      this.host.fx.tracer({ x: px, y: py, z: pz }, { x, y, z }, color);
      px = x;
      py = y;
      pz = z;
    }
  }

  private resolveRay(dir: THREE.Vector3, d: WeaponDef, s: WeaponStats, zenv: ZombieEnv): { x: number; y: number; z: number; hitZombie: boolean; head: boolean; kill: boolean; surface: keyof typeof SURFACE_OK | null } {
    const host = this.host;
    const o = this.camPos;
    const wall = host.world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, d.maxRange, 'shots', this.rayHit);
    const wallT = wall ? wall.t : d.maxRange;
    const zh = host.zombies.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, wallT);
    if (zh) {
      const dist = zh.t;
      const fm = falloffMul(d, dist);
      const dmg = zombieHitDamage(s.damage, zh.zombie.def, zh.head, s.headshotMul, s.armorPierce, fm);
      const shotYaw = Math.atan2(-dir.x, -dir.z);
      // a killing blow throws the body along the shot: a nudge from a rifle, a real shove from the shotgun
      const fade = Math.max(0.35, falloffMul(d, dist));
      const killed = host.zombies.damage(zh.zombie, dmg, zh.head, zenv, shotYaw, RAGDOLL.push[d.id] * fade, RAGDOLL.lift[d.id] * fade);
      host.fx.blood({ x: zh.x, y: zh.y, z: zh.z }, dir, { head: zh.head, kill: killed, amount: killed ? 1 : 0.6 });
      return { x: zh.x, y: zh.y, z: zh.z, hitZombie: true, head: zh.head, kill: killed, surface: 'flesh' };
    }
    if (wall) {
      host.fx.impact({ x: wall.x, y: wall.y, z: wall.z }, { x: wall.nx, y: wall.ny, z: wall.nz }, wall.surface, { strong: s.pellets === 1 && d.damage > 30 });
      return { x: wall.x, y: wall.y, z: wall.z, hitZombie: false, head: false, kill: false, surface: wall.surface };
    }
    return { x: o.x + dir.x * 80, y: o.y + dir.y * 80, z: o.z + dir.z * 80, hitZombie: false, head: false, kill: false, surface: null };
  }

  // ---------------------------------------------------------------------------------------------
  // utility (grenade / armour plate)
  // ---------------------------------------------------------------------------------------------

  private startUtility(kind: 'grenade' | 'plate', duration: number): void {
    const c = this.carried;
    if (c) cancelReload(c.ammo);
    this.reloadSfx.length = 0;
    this.dryReloadTimer = -1;
    this.utility = { kind, t: 0, duration, released: false };
    this.adsT = 0;
    if (kind === 'grenade') this.host.audio.play('grenade_pin', { priority: 2 });
    else this.host.audio.play('armor_plate', { priority: 2 });
  }

  private updateUtility(dt: number): void {
    const u = this.utility!;
    u.t += dt;
    this.raise = Math.max(0, this.raise - dt / 0.14);
    if (u.kind === 'grenade' && !u.released && u.t >= u.duration * 0.5) {
      u.released = true;
      const p = this.host.player;
      const cy = Math.cos(p.pitch + 0.08);
      this.dir.set(-Math.sin(p.yaw) * cy, Math.sin(p.pitch + 0.08), -Math.cos(p.yaw) * cy);
      this.tmp.set(p.x, p.eyeY() - 0.15, p.z).addScaledVector(this.dir, 0.5);
      this.host.throwGrenade(this.tmp, this.dir);
      this.host.inv.grenades = Math.max(0, this.host.inv.grenades - 1);
      this.host.audio.play('grenade_throw', { priority: 2 });
      this.grenadeCd = GRENADE.cooldown;
    }
    if (u.t >= u.duration) {
      if (u.kind === 'plate') {
        const r = applyPlate(this.host.vitals, this.host.inv.plates);
        if (r) {
          this.host.inv.plates = r.plates;
          this.host.onPlateApplied(r.armorAdded);
        }
      }
      this.utility = null;
      // weapon comes back up
      this.raise = 0;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // viewmodel
  // ---------------------------------------------------------------------------------------------

  private pushPose(dt: number, carried: CarriedWeapon | null, d: WeaponDef | null): void {
    const p = this.host.player;
    const pose = this.pose;
    pose.time = this.time;
    pose.ads = this.adsAmount;
    pose.sprint = smooth(Math.min(1, this.sprintT));
    pose.move = p.moveAmount;
    pose.bobPhase = p.bobPhase;
    pose.crouch = p.crouchBlend;
    pose.air = p.onGround ? 0 : Math.max(-1, Math.min(1, p.vy / 6));
    pose.landing = p.landing;
    pose.lookYaw = this.lookYaw;
    pose.lookPitch = this.lookPitch;
    pose.reducedMotion = this.host.reducedMotion();
    pose.action = this.utility ? Math.min(1, this.utility.t / this.utility.duration) : 0;

    // hide everything, then drive what is visible
    this.hideAll();
    if (this.hidden) return;
    if (this.utility) {
      const rig = this.utility.kind === 'grenade' ? this.rigs.grenade : this.rigs.plate;
      rig.root.visible = true;
      pose.raise = 1;
      pose.reloadPhase = 'none';
      rig.update(pose, dt);
      return;
    }
    if (!carried || !d) return;
    const rig = this.rigFor(carried.id);
    if (this.visualWeapon !== carried.id || this.visualTier !== carried.tier) {
      rig.setTier(carried.tier);
      this.visualWeapon = carried.id;
      this.visualTier = carried.tier;
    }
    rig.root.visible = true;
    const r = carried.ammo.reload;
    pose.raise = this.raise;
    pose.ammo = carried.ammo.mag;
    pose.magSize = carried.ammo.magSize;
    pose.cycle = this.cooldown > 0 ? 1 - Math.min(1, this.cooldown / Math.max(0.01, this.stats!.fireInterval)) : 1;
    if (r) {
      if (r.kind === 'mag') {
        pose.reloadPhase = 'mag';
        pose.reloadT = Math.min(1, r.t / Math.max(0.01, r.duration));
        pose.reloadEmpty = r.empty;
      } else {
        const map: Record<string, ReloadPhase> = { start: 'shellStart', load: 'shellLoad', pump: 'pump', end: 'shellEnd' };
        pose.reloadPhase = map[r.phase]!;
        pose.reloadT = Math.min(1, r.t / Math.max(0.01, r.duration));
        pose.reloadEmpty = r.wasEmpty;
      }
    } else {
      pose.reloadPhase = 'none';
      pose.reloadT = 0;
      pose.reloadEmpty = false;
    }
    rig.update(pose, dt);
  }
}

const SURFACE_OK = { concrete: 1, metal: 1, wood: 1, dirt: 1, flesh: 1, glass: 1, fabric: 1 } as const;
