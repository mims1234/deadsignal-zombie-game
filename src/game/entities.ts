/** Mystery boxes, stations and ground pickups: models, state and per-frame animation. */
import * as THREE from 'three';
import { ECONOMY, GRENADE, MYSTERY_BOX, PLAYER, REGIONS, WEAPONS } from '../config';
import { addReserve, isFull } from '../logic/ammo';
import { addCash, rollCrateReward } from '../logic/economy';
import { type BoxPrize, prizeKey, prizeLabel, reelFor, rollBox, takePrize } from '../logic/mysteryBox';
import { BOX_PHASE, DROP_KINDS, type DropKind, decodePrize, encodePrize } from '../logic/sharedLoot';
import type { Region } from '../types';
import type { CrateDef, StationDef } from '../world/layout/data';
import type { MaterialLib } from '../world/materials';
import { createLootCrate, createPickupModel, createStationModel, type CrateModel, type PickupKind, type StationModel } from '../world/models';
import { createBoxMark, createGunDisplay } from '../world/models/boxDisplay';
import type { GameCtx } from './ctx';

/** closed -> (opened) spin -> offer -> gone. A box opens once per run. */
export type BoxPhase = 'closed' | 'spin' | 'offer' | 'gone';

export class CrateRuntime {
  opened = false;
  /** Co-op: who opened it (only they can take the prize), and an open we asked the simulation for. */
  owner: string | null = null;
  pendingAt = -1;
  openT = 0;
  discovered = false;
  phase: BoxPhase = 'closed';
  /** Seconds into the current phase. */
  t = 0;
  prize: BoxPrize | null = null;
  private face = 0;
  private nextTick = 0;
  /** The reel: one model per face, shown one at a time over the box (built on first open). */
  private reel: THREE.Group | null = null;
  private readonly faces: THREE.Object3D[] = [];
  readonly mark: THREE.Sprite;
  /** The faces this box's reel shows (the relics too where a box holds them). */
  private readonly reelFaces: readonly BoxPrize[];
  constructor(
    readonly def: CrateDef,
    readonly model: CrateModel,
    readonly relics = false,
  ) {
    this.reelFaces = reelFor(relics);
    this.mark = createBoxMark();
    this.mark.position.set(def.x, 1.55, def.z);
  }

  reset(): void {
    this.owner = null;
    this.pendingAt = -1;
    this.opened = false;
    this.openT = 0;
    this.discovered = false;
    this.phase = 'closed';
    this.t = 0;
    this.prize = null;
    this.mark.visible = true;
    if (this.reel) this.reel.visible = false;
    this.model.setOpen(0);
    this.model.setLooted(false);
  }

  private buildReel(parent: THREE.Object3D, mats: MaterialLib): THREE.Group {
    const g = new THREE.Group();
    for (const p of this.reelFaces) {
      let m: THREE.Object3D;
      if (p.kind === 'weapon') {
        m = createGunDisplay(p.id);
      } else {
        m = createPickupModel(p.kind === 'ammo' ? 'ammo' : 'grenade', mats);
        m.scale.setScalar(p.kind === 'ammo' ? 1.7 : 2.2);
      }
      m.visible = false;
      g.add(m);
      this.faces.push(m);
    }
    g.position.set(this.def.x, 0.7, this.def.z);
    parent.add(g);
    return g;
  }

  private show(i: number): void {
    this.face = i;
    this.faces.forEach((f, k) => (f.visible = k === i));
  }

  /** Start the reel on `prize`. */
  spin(prize: BoxPrize, parent: THREE.Object3D, mats: MaterialLib): void {
    this.reel ??= this.buildReel(parent, mats);
    this.reel.visible = true;
    this.reel.position.y = 0.7;
    this.reel.scale.setScalar(1);
    this.prize = prize;
    this.phase = 'spin';
    this.t = 0;
    this.nextTick = 0;
    this.mark.visible = false;
    this.show(Math.floor(Math.random() * this.faces.length));
  }

  /** Advance the reel / offer. Returns what happened this frame. */
  update(dt: number, time: number): 'tick' | 'land' | 'expire' | null {
    const reel = this.reel;
    if (this.phase === 'closed') {
      if (!this.mark.visible) return null;
      this.mark.position.y = 1.55 + Math.sin(time * 2.2 + this.def.x) * 0.08;
      return null;
    }
    if (!reel || this.phase === 'gone') {
      if (reel && reel.visible) {
        // sinking back into the box
        this.t += dt;
        reel.position.y -= dt * 1.6;
        reel.scale.setScalar(Math.max(0.01, 1 - this.t * 1.8));
        if (this.t > 0.55) reel.visible = false;
      }
      return null;
    }
    this.t += dt;
    reel.rotation.y += dt * (this.phase === 'spin' ? 5 : 1.4);
    if (this.phase === 'spin') {
      const k = Math.min(1, this.t / MYSTERY_BOX.spin);
      reel.position.y = 0.7 + 0.8 * (1 - (1 - k) * (1 - k));
      if (this.t >= MYSTERY_BOX.spin) {
        this.show(Math.max(0, this.reelFaces.findIndex((p) => prizeKey(p) === prizeKey(this.prize!))));
        this.phase = 'offer';
        this.t = 0;
        return 'land';
      }
      if (this.t >= this.nextTick) {
        // ticks slow down as the reel winds down
        this.nextTick = this.t + 0.055 + 0.36 * k * k;
        this.show((this.face + 1) % this.faces.length);
        return 'tick';
      }
      return null;
    }
    // offer: the prize bobs over the open box until it is taken or the time runs out
    reel.position.y = 1.5 + Math.sin(time * 2.6) * 0.06;
    if (this.t >= MYSTERY_BOX.offer) {
      this.phase = 'gone';
      this.t = 0;
      return 'expire';
    }
    return null;
  }

  /** The prize was taken: it vanishes at once. */
  taken(): void {
    this.phase = 'gone';
    this.t = 1;
    if (this.reel) this.reel.visible = false;
  }
}

export class StationRuntime {
  constructor(
    readonly def: StationDef,
    readonly model: StationModel,
  ) {}
}

interface Pickup {
  kind: PickupKind;
  obj: THREE.Object3D;
  x: number;
  z: number;
  age: number;
}

/**
 * Co-op: the boxes and drops belong to the session's simulation (`logic/sharedLoot.ts`). Opening, taking and picking
 * up become requests; what the simulation reports is what everyone sees.
 */
export interface LootLink {
  me(): string | null;
  nameOf(id: string): string;
  open(i: number, prize: string): void;
  take(i: number): void;
  pick(id: number): void;
}

export class Entities {
  readonly crates: CrateRuntime[] = [];
  /** Set while in a co-op session. */
  coop: LootLink | null = null;
  /** The squad's drops by id, and the one we asked to pick up (and when). */
  private readonly shared = new Map<number, Pickup>();
  private pickAsked = new Map<number, number>();
  readonly stations: StationRuntime[] = [];
  private readonly pickups: Pickup[] = [];
  private readonly pickupFree: Record<PickupKind, THREE.Object3D[]> = { ammo: [], plate: [], grenade: [] };
  readonly root = new THREE.Group();

  constructor(private readonly ctx: GameCtx) {
    this.root.name = 'Entities';
    ctx.worldRoot.add(this.root);
    for (const def of ctx.level.data.crates) {
      const model = createLootCrate(def.region, ctx.mats);
      model.root.position.set(def.x, 0, def.z);
      model.root.rotation.y = def.yaw;
      this.root.add(model.root);
      const c = new CrateRuntime(def, model, MYSTERY_BOX.relicMaps.includes(ctx.level.data.id));
      this.root.add(c.mark);
      this.crates.push(c);
    }
    for (const def of ctx.level.data.stations) {
      const model = createStationModel(def.kind, ctx.mats);
      model.root.position.set(def.x, 0, def.z);
      model.root.rotation.y = def.yaw;
      this.root.add(model.root);
      this.stations.push(new StationRuntime(def, model));
    }
  }

  reset(): void {
    for (const c of this.crates) c.reset();
    for (const s of this.stations) s.model.setState('idle');
    this.clearPickups();
  }

  clearPickups(): void {
    for (const p of this.pickups) {
      p.obj.removeFromParent();
      this.pickupFree[p.kind].push(p.obj);
    }
    this.pickups.length = 0;
    for (const p of this.shared.values()) {
      p.obj.removeFromParent();
      this.pickupFree[p.kind].push(p.obj);
    }
    this.shared.clear();
    this.pickAsked.clear();
  }

  // ---------------------------------------------------------------------------------------------
  // co-op: the simulation's boxes and drops
  // ---------------------------------------------------------------------------------------------

  /** The boxes as the simulation sees them: [phase, opener, prize, seconds in phase] each. */
  applyBoxes(rows: readonly (readonly (number | string)[])[]): void {
    const ctx = this.ctx;
    rows.forEach((r, i) => {
      const c = this.crates[i];
      if (!c) return;
      const phase = Number(r[0]);
      c.owner = String(r[1] ?? '') || null;
      if (phase === BOX_PHASE.closed) {
        if (c.phase !== 'closed' || c.opened) c.reset(); // a new run
        return;
      }
      c.pendingAt = -1;
      if (c.phase === 'closed') {
        // opened by someone: the lid lifts and the reel spins for everyone
        const prize = decodePrize(String(r[2] ?? ''));
        c.opened = true;
        if (prize && phase !== BOX_PHASE.gone) {
          c.spin(prize, this.root, ctx.mats);
          c.t = phase === BOX_PHASE.spin ? Number(r[3]) || 0 : MYSTERY_BOX.spin; // a late joiner sees it where it is
          ctx.audio.play('crate_open', { pos: { x: c.def.x, y: 0.6, z: c.def.z }, priority: 1 });
        } else {
          c.phase = 'gone';
          c.model.setLooted(true);
        }
        return;
      }
      if (phase === BOX_PHASE.gone && (c.phase === 'spin' || c.phase === 'offer')) {
        c.taken();
        c.model.setLooted(true);
      }
    });
  }

  /** The simulation gave us the box we opened: the opening pays (the prize waits on the reel). */
  boxGranted(i: number): void {
    const c = this.crates[i];
    if (!c) return;
    const ctx = this.ctx;
    ctx.session.stats.cratesOpened++;
    const cash = rollCrateReward(c.def.region, ctx.session.inv, ctx.rng).cash;
    addCash(ctx.session.inv, cash);
    ctx.audio.play('pickup_cash', { priority: 1, volume: 0.7 });
    ctx.fx.sparkle({ x: c.def.x, y: 0.9, z: c.def.z }, 0xffe08a, 16);
    ctx.hudEvent({ type: 'cash', amount: cash });
    ctx.feed(`MYSTERY BOX  +$${cash}`, 'good');
  }

  /** The squad's drops: [id, kind, x, z] each. New ones appear, picked or faded ones go. */
  applyDrops(rows: readonly (readonly number[])[]): void {
    const seen = new Set<number>();
    for (const [id, k, x, z] of rows) {
      seen.add(id!);
      if (this.shared.has(id!)) continue;
      const kind = DROP_KINDS[k!] ?? 'ammo';
      const obj = this.pickupFree[kind].pop() ?? createPickupModel(kind, this.ctx.mats);
      obj.position.set(x!, 0.12, z!);
      this.root.add(obj);
      this.shared.set(id!, { kind, obj, x: x!, z: z!, age: 0 });
    }
    for (const [id, p] of this.shared) {
      if (seen.has(id)) continue;
      p.obj.removeFromParent();
      this.pickupFree[p.kind].push(p.obj);
      this.shared.delete(id);
      this.pickAsked.delete(id);
    }
  }

  /** The simulation gave us a drop we walked over. */
  dropGranted(id: number, kind: DropKind): void {
    const p = this.shared.get(id);
    this.collect({ kind, obj: p?.obj ?? this.root, x: p?.x ?? this.ctx.player.x, z: p?.z ?? this.ctx.player.z, age: 0 });
  }

  /** Whether a drop would do anything for us now (so we only ask for ones we can use). */
  private wants(kind: PickupKind): boolean {
    const inv = this.ctx.session.inv;
    if (kind === 'ammo') return inv.slots.some((w) => !!w && !isFull(w.ammo));
    if (kind === 'plate') return inv.plates < PLAYER.maxPlates;
    return inv.grenades < GRENADE.max;
  }

  update(dt: number, time: number): void {
    const ctx = this.ctx;
    const px = ctx.player.x;
    const pz = ctx.player.z;
    for (const c of this.crates) {
      const d2 = (c.def.x - px) ** 2 + (c.def.z - pz) ** 2;
      if (d2 < 30 * 30) c.discovered = true;
      // the "?" only shows within reading distance (it is a draw call per box)
      c.mark.visible = c.phase === 'closed' && d2 < 60 * 60;
      if (d2 > 90 * 90 && c.phase !== 'spin' && c.phase !== 'offer') continue;
      if (c.opened && c.openT < 1) {
        c.openT = Math.min(1, c.openT + dt / 0.45);
        c.model.setOpen(c.openT);
      }
      c.model.update(dt, time);
      const ev = c.update(dt, time);
      const at = { x: c.def.x, y: 1.2, z: c.def.z };
      if (ev === 'tick') ctx.audio.play('box_tick', { pos: at, priority: 1, volume: 0.7 });
      else if (ev === 'land') {
        ctx.audio.play('box_reveal', { pos: at, priority: 2 });
        ctx.fx.sparkle(at, 0xffc860, 18);
      } else if (ev === 'expire') {
        c.model.setLooted(true);
        ctx.feed('THE MYSTERY BOX TOOK ITS PRIZE BACK', 'warn');
      }
    }
    for (const s of this.stations) {
      const d2 = (s.def.x - px) ** 2 + (s.def.z - pz) ** 2;
      if (d2 > 90 * 90) continue;
      s.model.update(dt, time);
    }
    // the squad's drops: bob and spin; ask for the ones we walk over (the simulation decides who gets them)
    if (this.coop) {
      const now = performance.now();
      for (const [id, p] of this.shared) {
        p.obj.rotation.y += dt * 1.6;
        p.obj.position.y = 0.12 + Math.sin(time * 2.4 + p.x) * 0.05;
        if (!ctx.playerAlive() || (this.pickAsked.get(id) ?? -1e9) > now - 800) continue;
        if ((p.x - px) ** 2 + (p.z - pz) ** 2 < ECONOMY.pickupRadius * ECONOMY.pickupRadius && this.wants(p.kind)) {
          this.pickAsked.set(id, now);
          this.coop.pick(id);
        }
      }
    }
    // pickups: bob, spin, expire, collect
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]!;
      p.age += dt;
      p.obj.rotation.y += dt * 1.6;
      p.obj.position.y = 0.12 + Math.sin(time * 2.4 + p.x) * 0.05;
      const expired = p.age > ECONOMY.pickupLifetime;
      let collected = false;
      if (!expired && ctx.playerAlive()) {
        const dx = p.x - px;
        const dz = p.z - pz;
        if (dx * dx + dz * dz < ECONOMY.pickupRadius * ECONOMY.pickupRadius) collected = this.collect(p);
      }
      if (expired || collected) {
        p.obj.removeFromParent();
        this.pickupFree[p.kind].push(p.obj);
        this.pickups.splice(i, 1);
      }
    }
  }

  spawnPickup(kind: PickupKind, x: number, z: number): void {
    if (this.pickups.length >= ECONOMY.maxPickups) {
      const old = this.pickups.shift()!;
      old.obj.removeFromParent();
      this.pickupFree[old.kind].push(old.obj);
    }
    const obj = this.pickupFree[kind].pop() ?? createPickupModel(kind, this.ctx.mats);
    obj.position.set(x, 0.12, z);
    this.root.add(obj);
    this.pickups.push({ kind, obj, x, z, age: 0 });
  }

  private collect(p: Pickup): boolean {
    const ctx = this.ctx;
    const inv = ctx.session.inv;
    switch (p.kind) {
      case 'ammo': {
        let total = 0;
        for (const slot of [0, 1] as const) {
          const w = inv.slots[slot];
          if (!w || isFull(w.ammo)) continue;
          total += addReserve(w.ammo, Math.round(w.ammo.magSize * ECONOMY.ammoPickupMags));
        }
        if (total <= 0) return false;
        inv.ammoCollected += total;
        ctx.audio.play('pickup_ammo', { priority: 2 });
        ctx.feed(`+${total} AMMO`, 'good');
        ctx.fx.sparkle({ x: p.x, y: 0.4, z: p.z }, 0x9be07a, 10);
        return true;
      }
      case 'plate':
        if (inv.plates >= PLAYER.maxPlates) return false;
        inv.plates++;
        inv.platesCollected++;
        ctx.audio.play('pickup_plate', { priority: 2 });
        ctx.feed('+1 ARMOR PLATE', 'good');
        ctx.fx.sparkle({ x: p.x, y: 0.4, z: p.z }, 0xffc85a, 10);
        return true;
      case 'grenade':
        if (inv.grenades >= GRENADE.max) return false;
        inv.grenades++;
        ctx.audio.play('pickup_ammo', { priority: 2 });
        ctx.feed('+1 FRAG GRENADE', 'good');
        ctx.fx.sparkle({ x: p.x, y: 0.4, z: p.z }, 0xff6a4a, 10);
        return true;
    }
  }

  /** Open a mystery box: pays its region's cash once and spins the reel. False if it was already opened. */
  openCrate(c: CrateRuntime): boolean {
    if (c.opened) return false;
    const ctx = this.ctx;
    if (this.coop) {
      // co-op: ask the simulation; the first to ask wins the box (the reel shows when it says so)
      if (c.pendingAt > performance.now() - 2000) return false;
      c.pendingAt = performance.now();
      this.coop.open(this.crates.indexOf(c), encodePrize(rollBox(c.def.region, ctx.session.inv, ctx.rng, c.relics)));
      return true;
    }
    c.opened = true;
    ctx.session.stats.cratesOpened++;
    const inv = ctx.session.inv;
    const cash = rollCrateReward(c.def.region, inv, ctx.rng).cash;
    addCash(inv, cash);
    c.spin(rollBox(c.def.region, inv, ctx.rng, c.relics), this.root, ctx.mats);
    ctx.audio.play('crate_open', { pos: { x: c.def.x, y: 0.6, z: c.def.z }, priority: 2 });
    ctx.audio.play('pickup_cash', { priority: 1, volume: 0.7 });
    ctx.fx.sparkle({ x: c.def.x, y: 0.9, z: c.def.z }, 0xffe08a, 16);
    ctx.hudEvent({ type: 'cash', amount: cash });
    ctx.feed(`MYSTERY BOX  +$${cash}`, 'good');
    return true;
  }

  /** Take what a box is offering. Leaves it on offer (and says why) when it would do nothing. */
  takeBoxPrize(c: CrateRuntime): boolean {
    if (c.phase !== 'offer' || !c.prize) return false;
    const ctx = this.ctx;
    if (this.coop && c.owner !== this.coop.me()) return false; // the opener's prize
    const r = takePrize(ctx.session.inv, c.prize);
    if (!r.ok) {
      ctx.audio.play('buy_denied', { priority: 2, volume: 0.8 });
      ctx.feed(r.message.toUpperCase(), 'warn');
      return false;
    }
    if (r.swapped) ctx.weapons.cancelActions();
    this.coop?.take(this.crates.indexOf(c));
    c.taken();
    c.model.setLooted(true);
    ctx.audio.play(c.prize.kind === 'weapon' ? 'weapon_draw' : 'pickup_ammo', { priority: 2 });
    ctx.fx.sparkle({ x: c.def.x, y: 1.5, z: c.def.z }, 0xffc860, 14);
    ctx.feed(r.message, 'good');
    return true;
  }

  /** What an offered prize is called, and what taking it means. */
  offerText(c: CrateRuntime): { text: string; sub: string; mine: boolean } {
    const p = c.prize!;
    if (this.coop && c.owner && c.owner !== this.coop.me()) {
      return { text: `${prizeLabel(p)}`, sub: `${this.coop.nameOf(c.owner)} opened this box - their prize`, mine: false };
    }
    const held = this.ctx.session.inv.slots[this.ctx.session.inv.activeSlot];
    const left = Math.max(0, Math.ceil(MYSTERY_BOX.offer - c.t));
    const sub = p.kind === 'weapon' && held && held.id !== p.id ? `Replaces your ${WEAPONS[held.id].short} - or leave it (${left}s)` : `Leave it and it sinks back into the box (${left}s)`;
    return { text: `TAKE ${prizeLabel(p)}`, sub, mine: true };
  }

  regionOf(c: CrateRuntime): Region {
    return c.def.region;
  }

  dropChance(region: Region): number {
    return REGIONS[region].dropMul;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
